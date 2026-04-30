"""
OMOP CDM data service.

Thin wrapper around the OMOP CDM SQLite (Eunomia or our synthetic cardiometabolic
cohort). Exposes a small surface that the agent's tools call into:

  - run_sql(sql)                       – read-only SQL against the CDM
  - find_concepts(term, domain=None)   – fuzzy concept search
  - get_concept(concept_id)            – single-concept lookup
  - get_descendants(concept_id)        – concept_ancestor descendants
  - cdm_summary()                      – row counts per CDM table
  - characterize_cohort(person_ids)    – Achilles-style demographics + comorbidities

All output is JSON-serialisable (dicts/lists), never pandas/numpy types.
"""
from __future__ import annotations
import os
import re
import sqlite3
from functools import lru_cache
from typing import Any, Iterable

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "omop.sqlite")
DB_PATH = os.path.abspath(DB_PATH)

# Tables the agent is allowed to query
CDM_TABLES = [
    "person", "observation_period", "visit_occurrence", "condition_occurrence",
    "drug_exposure", "measurement", "procedure_occurrence", "death",
    "concept", "concept_ancestor", "concept_relationship", "cdm_source",
]

# Read-only guard: reject any SQL that mutates the database
FORBIDDEN_SQL = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM)\b",
    re.IGNORECASE,
)


def _connect() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        raise RuntimeError(
            f"OMOP database not found at {DB_PATH}. "
            "Run `python backend/data/generate_synthetic_omop.py` "
            "or `python backend/data/download_eunomia.py` first."
        )
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _row_to_dict(r: sqlite3.Row) -> dict[str, Any]:
    return {k: r[k] for k in r.keys()}


# ─── Public surface ──────────────────────────────────────────────────

def run_sql(sql: str, params: tuple | None = None, limit: int = 1000) -> dict[str, Any]:
    """Execute a read-only SELECT statement and return rows + columns."""
    if FORBIDDEN_SQL.search(sql):
        return {"error": "Only read-only SELECT queries are allowed.", "sql": sql}
    sql_clean = sql.strip().rstrip(";")
    # Soft row cap so the LLM doesn't drown
    if limit and "LIMIT" not in sql_clean.upper():
        sql_clean = f"{sql_clean} LIMIT {limit}"
    try:
        con = _connect()
        cur = con.cursor()
        cur.execute(sql_clean, params or ())
        rows = [_row_to_dict(r) for r in cur.fetchmany(limit)]
        cols = [d[0] for d in cur.description] if cur.description else []
        con.close()
        return {"sql": sql_clean, "columns": cols, "rows": rows, "row_count": len(rows)}
    except sqlite3.Error as e:
        return {"error": str(e), "sql": sql_clean}


@lru_cache(maxsize=512)
def get_concept(concept_id: int) -> dict[str, Any] | None:
    con = _connect()
    cur = con.cursor()
    cur.execute("SELECT * FROM concept WHERE concept_id = ?", (concept_id,))
    r = cur.fetchone()
    con.close()
    return _row_to_dict(r) if r else None


def find_concepts(term: str, domain: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
    """Fuzzy LIKE search on concept_name. Optionally filter by domain."""
    con = _connect()
    cur = con.cursor()
    pattern = f"%{term}%"
    if domain:
        cur.execute(
            "SELECT * FROM concept WHERE concept_name LIKE ? AND domain_id = ? "
            "ORDER BY LENGTH(concept_name) ASC LIMIT ?",
            (pattern, domain, limit),
        )
    else:
        cur.execute(
            "SELECT * FROM concept WHERE concept_name LIKE ? "
            "ORDER BY LENGTH(concept_name) ASC LIMIT ?",
            (pattern, limit),
        )
    rows = [_row_to_dict(r) for r in cur.fetchall()]
    con.close()
    return rows


def get_descendants(concept_id: int, include_self: bool = True) -> list[dict[str, Any]]:
    """Return all descendant concepts via concept_ancestor."""
    con = _connect()
    cur = con.cursor()
    cur.execute(
        """
        SELECT DISTINCT c.concept_id, c.concept_name, c.domain_id, c.vocabulary_id,
               c.concept_class_id, ca.min_levels_of_separation
        FROM concept_ancestor ca
        JOIN concept c ON c.concept_id = ca.descendant_concept_id
        WHERE ca.ancestor_concept_id = ?
          AND ca.min_levels_of_separation >= ?
        ORDER BY ca.min_levels_of_separation, c.concept_name
        """,
        (concept_id, 0 if include_self else 1),
    )
    rows = [_row_to_dict(r) for r in cur.fetchall()]
    con.close()
    return rows


@lru_cache(maxsize=1)
def cdm_summary() -> dict[str, Any]:
    """High-level CDM stats: row counts, date range, unique persons per table."""
    con = _connect()
    cur = con.cursor()
    out: dict[str, Any] = {"tables": {}}
    for tbl in CDM_TABLES:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            out["tables"][tbl] = cur.fetchone()[0]
        except sqlite3.Error:
            out["tables"][tbl] = 0

    cur.execute("SELECT COUNT(*) FROM person")
    n_persons = cur.fetchone()[0]
    cur.execute(
        "SELECT MIN(observation_period_start_date), MAX(observation_period_end_date) "
        "FROM observation_period"
    )
    start, end = cur.fetchone()
    cur.execute("SELECT COUNT(*) FROM death")
    n_deaths = cur.fetchone()[0]

    try:
        cur.execute(
            "SELECT cdm_source_name, cdm_version, vocabulary_version "
            "FROM cdm_source LIMIT 1"
        )
        src = cur.fetchone()
        out["source"] = _row_to_dict(src) if src else {}
    except sqlite3.Error:
        out["source"] = {}

    out["n_persons"] = n_persons
    out["n_deaths"] = n_deaths
    out["observation_window"] = {"start": start, "end": end}
    con.close()
    return out


def cohort_from_concept_set(concept_ids: Iterable[int],
                            domain: str = "Condition",
                            include_descendants: bool = True) -> list[int]:
    """
    Return person_ids who have any record in the given domain matching any of the
    supplied concepts (with optional descendant expansion).
    """
    ids = list(concept_ids)
    if not ids:
        return []

    expanded: set[int] = set()
    if include_descendants:
        con = _connect()
        cur = con.cursor()
        placeholders = ",".join("?" * len(ids))
        cur.execute(
            f"SELECT DISTINCT descendant_concept_id FROM concept_ancestor "
            f"WHERE ancestor_concept_id IN ({placeholders})",
            ids,
        )
        expanded = {r[0] for r in cur.fetchall()}
        con.close()
    expanded.update(ids)

    domain_table = {
        "Condition":   ("condition_occurrence",   "condition_concept_id"),
        "Drug":        ("drug_exposure",          "drug_concept_id"),
        "Measurement": ("measurement",            "measurement_concept_id"),
        "Procedure":   ("procedure_occurrence",   "procedure_concept_id"),
        "Visit":       ("visit_occurrence",       "visit_concept_id"),
    }
    if domain not in domain_table:
        return []
    table, col = domain_table[domain]

    con = _connect()
    cur = con.cursor()
    placeholders = ",".join("?" * len(expanded))
    cur.execute(
        f"SELECT DISTINCT person_id FROM {table} WHERE {col} IN ({placeholders})",
        list(expanded),
    )
    pids = [r[0] for r in cur.fetchall()]
    con.close()
    return pids


def characterize_cohort(person_ids: list[int] | None = None) -> dict[str, Any]:
    """
    Achilles-style cohort characterization.

    If person_ids is None or empty, characterizes the entire CDM.
    Returns demographics, top conditions, top drugs, key measurements.
    """
    con = _connect()
    cur = con.cursor()

    # Build IN-clause once if we have a person filter
    if person_ids:
        # SQLite parameter limit is ~32K; we shouldn't need more for a demo cohort
        in_clause = "WHERE person_id IN (" + ",".join(map(str, person_ids)) + ")"
        join_filter = "JOIN (SELECT " + ",".join(map(str, person_ids)) + \
                      " AS person_id) p USING(person_id)"  # not used; using IN is fine here
    else:
        in_clause = ""

    out: dict[str, Any] = {}

    # ─ Cohort size
    if person_ids:
        out["cohort_size"] = len(person_ids)
    else:
        cur.execute("SELECT COUNT(*) FROM person")
        out["cohort_size"] = cur.fetchone()[0]

    # ─ Sex
    cur.execute(
        f"""
        SELECT
          CASE gender_concept_id WHEN 8507 THEN 'Male'
                                 WHEN 8532 THEN 'Female'
                                 ELSE 'Other' END AS sex,
          COUNT(*) AS n
        FROM person {in_clause}
        GROUP BY gender_concept_id
        """
    )
    out["sex"] = [_row_to_dict(r) for r in cur.fetchall()]

    # ─ Age distribution (current age = current year - year_of_birth)
    cur.execute(
        f"""
        SELECT
          CASE
            WHEN (strftime('%Y','now') - year_of_birth) < 30 THEN '<30'
            WHEN (strftime('%Y','now') - year_of_birth) < 45 THEN '30–44'
            WHEN (strftime('%Y','now') - year_of_birth) < 60 THEN '45–59'
            WHEN (strftime('%Y','now') - year_of_birth) < 75 THEN '60–74'
            ELSE '75+'
          END AS age_band,
          COUNT(*) AS n
        FROM person {in_clause}
        GROUP BY age_band
        ORDER BY MIN(year_of_birth) DESC
        """
    )
    out["age_band"] = [_row_to_dict(r) for r in cur.fetchall()]

    cur.execute(
        f"SELECT AVG(strftime('%Y','now') - year_of_birth) AS mean_age, "
        f"       MIN(strftime('%Y','now') - year_of_birth) AS min_age, "
        f"       MAX(strftime('%Y','now') - year_of_birth) AS max_age "
        f"FROM person {in_clause}"
    )
    age_stats = _row_to_dict(cur.fetchone())
    out["age_stats"] = {k: float(v) if v is not None else None for k, v in age_stats.items()}

    # ─ Top conditions
    person_filter = ""
    if person_ids:
        person_filter = "AND co.person_id IN (" + ",".join(map(str, person_ids)) + ")"
    cur.execute(
        f"""
        SELECT c.concept_id, c.concept_name, COUNT(DISTINCT co.person_id) AS n_persons
        FROM condition_occurrence co
        JOIN concept c ON c.concept_id = co.condition_concept_id
        WHERE 1=1 {person_filter}
        GROUP BY c.concept_id, c.concept_name
        ORDER BY n_persons DESC
        LIMIT 10
        """
    )
    out["top_conditions"] = [_row_to_dict(r) for r in cur.fetchall()]

    # ─ Top drugs
    drug_filter = ""
    if person_ids:
        drug_filter = "AND de.person_id IN (" + ",".join(map(str, person_ids)) + ")"
    cur.execute(
        f"""
        SELECT c.concept_id, c.concept_name, COUNT(DISTINCT de.person_id) AS n_persons
        FROM drug_exposure de
        JOIN concept c ON c.concept_id = de.drug_concept_id
        WHERE 1=1 {drug_filter}
        GROUP BY c.concept_id, c.concept_name
        ORDER BY n_persons DESC
        LIMIT 10
        """
    )
    out["top_drugs"] = [_row_to_dict(r) for r in cur.fetchall()]

    # ─ Key measurements: HbA1c, BMI, systolic BP, eGFR, LDL
    KEY_MEASUREMENTS = {
        3004410: "HbA1c (%)",
        3038553: "BMI (kg/m²)",
        3004249: "Systolic BP (mmHg)",
        3037556: "eGFR (mL/min)",
        3028437: "LDL-C (mg/dL)",
    }
    out["measurements"] = []
    for cid, label in KEY_MEASUREMENTS.items():
        meas_filter = ""
        if person_ids:
            meas_filter = "AND person_id IN (" + ",".join(map(str, person_ids)) + ")"
        cur.execute(
            f"""
            SELECT AVG(value_as_number) AS mean,
                   MIN(value_as_number) AS min,
                   MAX(value_as_number) AS max,
                   COUNT(*)             AS n
            FROM measurement
            WHERE measurement_concept_id = ? {meas_filter}
            """,
            (cid,),
        )
        row = _row_to_dict(cur.fetchone())
        if row.get("n", 0) > 0:
            out["measurements"].append({
                "concept_id": cid,
                "label": label,
                "mean":  round(row["mean"],  2) if row["mean"]  is not None else None,
                "min":   round(row["min"],   2) if row["min"]   is not None else None,
                "max":   round(row["max"],   2) if row["max"]   is not None else None,
                "n":     row["n"],
            })

    con.close()
    return out


def list_persons(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    """Browse-friendly person list for the OMOP Browser UI."""
    con = _connect()
    cur = con.cursor()
    cur.execute(
        """
        SELECT
          p.person_id,
          CASE p.gender_concept_id WHEN 8507 THEN 'Male'
                                   WHEN 8532 THEN 'Female'
                                   ELSE 'Other' END AS sex,
          (strftime('%Y','now') - p.year_of_birth) AS age,
          (SELECT COUNT(DISTINCT condition_concept_id) FROM condition_occurrence
            WHERE person_id = p.person_id) AS n_conditions,
          (SELECT COUNT(DISTINCT drug_concept_id) FROM drug_exposure
            WHERE person_id = p.person_id) AS n_drugs,
          (SELECT COUNT(*) FROM measurement WHERE person_id = p.person_id) AS n_measurements,
          (SELECT MIN(condition_start_date) FROM condition_occurrence
            WHERE person_id = p.person_id) AS first_dx
        FROM person p
        ORDER BY p.person_id
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    )
    rows = [_row_to_dict(r) for r in cur.fetchall()]
    con.close()
    return rows


def person_detail(person_id: int) -> dict[str, Any] | None:
    """Full record for a single person — for OMOP Browser drill-down."""
    con = _connect()
    cur = con.cursor()
    cur.execute("SELECT * FROM person WHERE person_id = ?", (person_id,))
    p = cur.fetchone()
    if not p:
        con.close()
        return None
    out: dict[str, Any] = {"person": _row_to_dict(p)}
    for tbl, key, name_col, date_col, val_col in [
        ("condition_occurrence", "condition_concept_id", "concept_name", "condition_start_date", None),
        ("drug_exposure",        "drug_concept_id",       "concept_name", "drug_exposure_start_date", None),
        ("measurement",          "measurement_concept_id","concept_name", "measurement_date",       "value_as_number"),
        ("visit_occurrence",     "visit_concept_id",      "concept_name", "visit_start_date",       None),
    ]:
        select_cols = f"t.{key}, c.concept_name, t.{date_col}"
        if val_col:
            select_cols += f", t.{val_col}"
        cur.execute(
            f"""
            SELECT {select_cols}
            FROM {tbl} t
            LEFT JOIN concept c ON c.concept_id = t.{key}
            WHERE t.person_id = ?
            ORDER BY t.{date_col} DESC
            LIMIT 50
            """,
            (person_id,),
        )
        out[tbl] = [_row_to_dict(r) for r in cur.fetchall()]
    con.close()
    return out
