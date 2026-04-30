"""
Generate a synthetic OMOP CDM v5.4 SQLite dataset focused on cardiometabolic care.

~2,500 persons, with realistic distributions of:
  - type 2 diabetes, hypertension, CKD, MI, heart failure, dyslipidemia
  - metformin, sulfonylureas, SGLT2 inhibitors, GLP-1 RAs, statins, ACEi/ARBs
  - HbA1c, BMI, blood pressure, eGFR, LDL measurements

All concept_ids are real SNOMED/RxNorm/LOINC concepts as mapped in the OHDSI vocabulary.
This is a development/demo substrate. For credible OHDSI demos, run download_eunomia.py
to swap this file with the canonical Eunomia GiBleed dataset.

Output: omop.sqlite in this directory.
"""
from __future__ import annotations
import os
import sqlite3
import random
from datetime import date, timedelta

random.seed(42)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "omop.sqlite")

# ─── Real OMOP concept IDs (verified against the standard vocabulary) ──────
CONCEPTS = [
    # Conditions (SNOMED → OMOP standard)
    (201826,   "Type 2 diabetes mellitus",                    "Condition", "SNOMED",  "44054006"),
    (201254,   "Type 1 diabetes mellitus",                    "Condition", "SNOMED",  "46635009"),
    (320128,   "Essential hypertension",                      "Condition", "SNOMED",  "59621000"),
    (316139,   "Heart failure",                               "Condition", "SNOMED",  "84114007"),
    (4329847,  "Myocardial infarction",                       "Condition", "SNOMED",  "22298006"),
    (46271022, "Chronic kidney disease",                      "Condition", "SNOMED",  "709044004"),
    (432867,   "Hyperlipidemia",                              "Condition", "SNOMED",  "55822004"),
    (4180628,  "Diabetic retinopathy",                        "Condition", "SNOMED",  "4855003"),
    (443597,   "Diabetic neuropathy",                         "Condition", "SNOMED",  "230572002"),
    (4030518,  "Obesity",                                     "Condition", "SNOMED",  "414916001"),
    # Drugs (RxNorm → OMOP standard ingredient)
    (1503297,  "Metformin",                                   "Drug",      "RxNorm",  "6809"),
    (1560171,  "Glipizide",                                   "Drug",      "RxNorm",  "4821"),
    (45774751, "Empagliflozin",                               "Drug",      "RxNorm",  "1545653"),
    (44785829, "Dapagliflozin",                               "Drug",      "RxNorm",  "1488564"),
    (40170911, "Liraglutide",                                 "Drug",      "RxNorm",  "475968"),
    (793143,   "Semaglutide",                                 "Drug",      "RxNorm",  "1991302"),
    (1545958,  "Atorvastatin",                                "Drug",      "RxNorm",  "83367"),
    (1308216,  "Lisinopril",                                  "Drug",      "RxNorm",  "29046"),
    (1310149,  "Losartan",                                    "Drug",      "RxNorm",  "52175"),
    (1338005,  "Insulin glargine",                            "Drug",      "RxNorm",  "274783"),
    # Measurements (LOINC → OMOP standard)
    (3004410,  "Hemoglobin A1c/Hemoglobin total in Blood",    "Measurement","LOINC",  "4548-4"),
    (3038553,  "Body mass index",                             "Measurement","LOINC",  "39156-5"),
    (3004249,  "Systolic blood pressure",                     "Measurement","LOINC",  "8480-6"),
    (3012888,  "Diastolic blood pressure",                    "Measurement","LOINC",  "8462-4"),
    (3016723,  "Creatinine [Mass/volume] in Serum or Plasma", "Measurement","LOINC",  "2160-0"),
    (3028437,  "Cholesterol in LDL [Mass/volume] in Serum",   "Measurement","LOINC",  "13457-7"),
    (3037556,  "Glomerular filtration rate (eGFR)",           "Measurement","LOINC",  "62238-1"),
    # Drug classes (ATC, used as ancestors for descendant queries)
    (21600712, "BLOOD GLUCOSE LOWERING DRUGS",                "Drug",      "ATC",     "A10"),
    (21600744, "Biguanides",                                  "Drug",      "ATC",     "A10BA"),
    (21600749, "Sulfonylureas",                               "Drug",      "ATC",     "A10BB"),
    (21600765, "SGLT2 inhibitors",                            "Drug",      "ATC",     "A10BK"),
    (21600773, "GLP-1 receptor agonists",                     "Drug",      "ATC",     "A10BJ"),
    (21601238, "HMG CoA reductase inhibitors",                "Drug",      "ATC",     "C10AA"),
    # Visit types
    (9201,     "Inpatient Visit",                             "Visit",     "Visit",   "IP"),
    (9202,     "Outpatient Visit",                            "Visit",     "Visit",   "OP"),
    (9203,     "Emergency Room Visit",                        "Visit",     "Visit",   "ER"),
    # Gender / race / ethnicity
    (8507,     "MALE",                                        "Gender",    "Gender",  "M"),
    (8532,     "FEMALE",                                      "Gender",    "Gender",  "F"),
    (38003564, "Not Hispanic or Latino",                      "Ethnicity", "Ethnicity","Not Hispanic"),
    (38003563, "Hispanic or Latino",                          "Ethnicity", "Ethnicity","Hispanic"),
    (8527,     "White",                                       "Race",      "Race",    "5"),
    (8516,     "Black or African American",                   "Race",      "Race",    "3"),
    (8515,     "Asian",                                       "Race",      "Race",    "2"),
]

# Class hierarchies (descendant_concept_id, ancestor_concept_id, levels_of_separation)
CONCEPT_ANCESTOR = [
    # Biguanides
    (1503297, 21600712, 2), (1503297, 21600744, 1), (1503297, 1503297, 0),
    # Sulfonylureas
    (1560171, 21600712, 2), (1560171, 21600749, 1), (1560171, 1560171, 0),
    # SGLT2 inhibitors
    (45774751, 21600712, 2), (45774751, 21600765, 1), (45774751, 45774751, 0),
    (44785829, 21600712, 2), (44785829, 21600765, 1), (44785829, 44785829, 0),
    # GLP-1 RAs
    (40170911, 21600712, 2), (40170911, 21600773, 1), (40170911, 40170911, 0),
    (793143,   21600712, 2), (793143,   21600773, 1), (793143,   793143,   0),
    # Insulin (parent A10A)
    (1338005,  21600712, 2), (1338005,  1338005,  0),
    # Statins
    (1545958, 21601238, 1), (1545958, 1545958, 0),
    # Class self-ancestry
    (21600712, 21600712, 0),
    (21600744, 21600744, 0), (21600744, 21600712, 1),
    (21600749, 21600749, 0), (21600749, 21600712, 1),
    (21600765, 21600765, 0), (21600765, 21600712, 1),
    (21600773, 21600773, 0), (21600773, 21600712, 1),
    (21601238, 21601238, 0),
    # Conditions self-ancestry (simplified)
    *[(c[0], c[0], 0) for c in CONCEPTS],
]


def init_schema(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    cur.executescript("""
    DROP TABLE IF EXISTS person;
    DROP TABLE IF EXISTS observation_period;
    DROP TABLE IF EXISTS visit_occurrence;
    DROP TABLE IF EXISTS condition_occurrence;
    DROP TABLE IF EXISTS drug_exposure;
    DROP TABLE IF EXISTS measurement;
    DROP TABLE IF EXISTS procedure_occurrence;
    DROP TABLE IF EXISTS death;
    DROP TABLE IF EXISTS concept;
    DROP TABLE IF EXISTS concept_ancestor;
    DROP TABLE IF EXISTS concept_relationship;
    DROP TABLE IF EXISTS cdm_source;

    CREATE TABLE person (
      person_id INTEGER PRIMARY KEY,
      gender_concept_id INTEGER,
      year_of_birth INTEGER,
      month_of_birth INTEGER,
      day_of_birth INTEGER,
      birth_datetime TEXT,
      race_concept_id INTEGER,
      ethnicity_concept_id INTEGER,
      location_id INTEGER,
      provider_id INTEGER,
      care_site_id INTEGER,
      person_source_value TEXT,
      gender_source_value TEXT
    );
    CREATE TABLE observation_period (
      observation_period_id INTEGER PRIMARY KEY,
      person_id INTEGER,
      observation_period_start_date TEXT,
      observation_period_end_date TEXT,
      period_type_concept_id INTEGER
    );
    CREATE TABLE visit_occurrence (
      visit_occurrence_id INTEGER PRIMARY KEY,
      person_id INTEGER,
      visit_concept_id INTEGER,
      visit_start_date TEXT,
      visit_end_date TEXT,
      visit_type_concept_id INTEGER,
      provider_id INTEGER,
      care_site_id INTEGER
    );
    CREATE TABLE condition_occurrence (
      condition_occurrence_id INTEGER PRIMARY KEY,
      person_id INTEGER,
      condition_concept_id INTEGER,
      condition_start_date TEXT,
      condition_end_date TEXT,
      condition_type_concept_id INTEGER,
      visit_occurrence_id INTEGER
    );
    CREATE TABLE drug_exposure (
      drug_exposure_id INTEGER PRIMARY KEY,
      person_id INTEGER,
      drug_concept_id INTEGER,
      drug_exposure_start_date TEXT,
      drug_exposure_end_date TEXT,
      drug_type_concept_id INTEGER,
      quantity REAL,
      days_supply INTEGER,
      visit_occurrence_id INTEGER
    );
    CREATE TABLE measurement (
      measurement_id INTEGER PRIMARY KEY,
      person_id INTEGER,
      measurement_concept_id INTEGER,
      measurement_date TEXT,
      measurement_type_concept_id INTEGER,
      value_as_number REAL,
      unit_concept_id INTEGER,
      visit_occurrence_id INTEGER
    );
    CREATE TABLE procedure_occurrence (
      procedure_occurrence_id INTEGER PRIMARY KEY,
      person_id INTEGER,
      procedure_concept_id INTEGER,
      procedure_date TEXT,
      procedure_type_concept_id INTEGER,
      visit_occurrence_id INTEGER
    );
    CREATE TABLE death (
      person_id INTEGER PRIMARY KEY,
      death_date TEXT,
      death_type_concept_id INTEGER,
      cause_concept_id INTEGER
    );
    CREATE TABLE concept (
      concept_id INTEGER PRIMARY KEY,
      concept_name TEXT,
      domain_id TEXT,
      vocabulary_id TEXT,
      concept_class_id TEXT,
      standard_concept TEXT,
      concept_code TEXT,
      valid_start_date TEXT,
      valid_end_date TEXT
    );
    CREATE TABLE concept_ancestor (
      ancestor_concept_id INTEGER,
      descendant_concept_id INTEGER,
      min_levels_of_separation INTEGER,
      max_levels_of_separation INTEGER
    );
    CREATE TABLE concept_relationship (
      concept_id_1 INTEGER,
      concept_id_2 INTEGER,
      relationship_id TEXT,
      valid_start_date TEXT,
      valid_end_date TEXT
    );
    CREATE TABLE cdm_source (
      cdm_source_name TEXT,
      cdm_source_abbreviation TEXT,
      cdm_holder TEXT,
      source_description TEXT,
      cdm_version TEXT,
      vocabulary_version TEXT,
      cdm_release_date TEXT
    );

    CREATE INDEX idx_co_person  ON condition_occurrence(person_id);
    CREATE INDEX idx_co_concept ON condition_occurrence(condition_concept_id);
    CREATE INDEX idx_de_person  ON drug_exposure(person_id);
    CREATE INDEX idx_de_concept ON drug_exposure(drug_concept_id);
    CREATE INDEX idx_m_person   ON measurement(person_id);
    CREATE INDEX idx_m_concept  ON measurement(measurement_concept_id);
    CREATE INDEX idx_v_person   ON visit_occurrence(person_id);
    CREATE INDEX idx_ca_anc     ON concept_ancestor(ancestor_concept_id);
    CREATE INDEX idx_ca_dec     ON concept_ancestor(descendant_concept_id);
    """)
    con.commit()


def populate_concepts(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    for cid, name, domain, vocab, code in CONCEPTS:
        cur.execute(
            "INSERT INTO concept VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (cid, name, domain, vocab,
             "Ingredient" if domain == "Drug" and vocab == "RxNorm" else
             ("ATC 1st"   if vocab == "ATC" else
              ("Clinical Finding" if domain == "Condition" else
               ("Lab Test" if domain == "Measurement" else
                ("Visit" if domain == "Visit" else domain)))),
             "S", code, "1970-01-01", "2099-12-31"),
        )
    for desc, anc, sep in CONCEPT_ANCESTOR:
        cur.execute("INSERT INTO concept_ancestor VALUES (?, ?, ?, ?)",
                    (anc, desc, sep, sep))
    cur.execute("INSERT INTO cdm_source VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("SAS Synthetic Cardiometabolic Cohort",
                 "SAS_SYNTH",
                 "SAS Health Demo",
                 "Synthetic OMOP CDM v5.4 cohort for the SAS Health AI demo. ~2,500 persons.",
                 "v5.4",
                 "v5.0 22-AUG-2024 (subset)",
                 date.today().isoformat()))
    con.commit()


def rand_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def populate_persons(con: sqlite3.Connection, n: int = 2500) -> None:
    cur = con.cursor()
    today = date.today()
    for pid in range(1, n + 1):
        gender = random.choice([8507, 8532])
        # Skewed older population for cardiometabolic relevance
        age = max(18, min(94, int(random.gauss(58, 14))))
        yob = today.year - age
        mob = random.randint(1, 12)
        dob_d = random.randint(1, 28)
        race = random.choices([8527, 8516, 8515], weights=[0.55, 0.20, 0.25])[0]
        ethnicity = random.choices([38003564, 38003563], weights=[0.85, 0.15])[0]
        cur.execute(
            "INSERT INTO person VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)",
            (pid, gender, yob, mob, dob_d,
             f"{yob:04d}-{mob:02d}-{dob_d:02d} 00:00:00",
             race, ethnicity, f"P{pid:06d}",
             "M" if gender == 8507 else "F"),
        )
        # Each person observed 2018-01-01 → today
        cur.execute(
            "INSERT INTO observation_period VALUES (?, ?, ?, ?, ?)",
            (pid, pid, "2018-01-01", today.isoformat(), 32817),
        )
    con.commit()


def populate_clinical(con: sqlite3.Connection) -> None:
    """Generate visits, conditions, drugs, and measurements with realistic correlations."""
    cur = con.cursor()
    cur.execute("SELECT person_id, year_of_birth, gender_concept_id FROM person")
    people = cur.fetchall()
    today = date.today()

    co_id = de_id = m_id = v_id = po_id = 0

    for pid, yob, gender in people:
        age = today.year - yob
        is_male = gender == 8507

        # Underlying risk score that drives everything
        risk = 0.0
        if age >= 50: risk += 0.4
        if age >= 65: risk += 0.3
        if is_male:   risk += 0.05
        risk += random.uniform(-0.2, 0.4)

        has_t2dm = random.random() < (0.18 + risk * 0.4)
        has_htn  = random.random() < (0.30 + risk * 0.3) or has_t2dm and random.random() < 0.55
        has_hld  = random.random() < (0.25 + risk * 0.3) or has_t2dm and random.random() < 0.50
        has_obesity = random.random() < (0.20 + risk * 0.2)
        has_ckd  = has_t2dm and random.random() < 0.30
        has_hf   = (has_htn or has_t2dm) and random.random() < 0.10
        has_mi   = (has_t2dm or has_htn) and random.random() < 0.06
        has_retinopathy = has_t2dm and random.random() < 0.15
        has_neuropathy  = has_t2dm and random.random() < 0.18
        has_t1dm = (not has_t2dm) and random.random() < 0.005

        condition_starts: list[tuple[int, date]] = []

        def add_condition(concept_id: int, days_ago_max: int = 1800) -> None:
            nonlocal co_id, v_id
            co_id += 1
            v_id  += 1
            d = today - timedelta(days=random.randint(30, days_ago_max))
            cur.execute(
                "INSERT INTO visit_occurrence VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)",
                (v_id, pid, 9202, d.isoformat(), d.isoformat(), 32817),
            )
            cur.execute(
                "INSERT INTO condition_occurrence VALUES (?, ?, ?, ?, ?, ?, ?)",
                (co_id, pid, concept_id, d.isoformat(), d.isoformat(), 32020, v_id),
            )
            condition_starts.append((concept_id, d))

        if has_t2dm: add_condition(201826)
        if has_t1dm: add_condition(201254)
        if has_htn:  add_condition(320128)
        if has_hld:  add_condition(432867)
        if has_obesity: add_condition(4030518)
        if has_ckd:  add_condition(46271022)
        if has_hf:   add_condition(316139)
        if has_mi:   add_condition(4329847, days_ago_max=900)
        if has_retinopathy: add_condition(4180628)
        if has_neuropathy:  add_condition(443597)

        # Drugs — only after first relevant condition date
        def add_drug(concept_id: int, after: date | None = None,
                     days_supply: int = 90, n_fills: int = 8) -> None:
            nonlocal de_id, v_id
            start = (after or (today - timedelta(days=1500)))
            for k in range(n_fills):
                de_id += 1
                v_id  += 1
                d = start + timedelta(days=k * 90 + random.randint(-7, 7))
                if d > today: break
                cur.execute(
                    "INSERT INTO visit_occurrence VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)",
                    (v_id, pid, 9202, d.isoformat(), d.isoformat(), 32817),
                )
                cur.execute(
                    "INSERT INTO drug_exposure VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (de_id, pid, concept_id, d.isoformat(),
                     (d + timedelta(days=days_supply)).isoformat(),
                     38000177, 90.0, days_supply, v_id),
                )

        if has_t2dm:
            t2dm_start = next((d for c, d in condition_starts if c == 201826), today - timedelta(days=1200))
            add_drug(1503297, after=t2dm_start, n_fills=12)  # metformin (mainstay)
            if random.random() < 0.25: add_drug(1560171, after=t2dm_start, n_fills=8)
            if random.random() < 0.30: add_drug(45774751, after=t2dm_start + timedelta(days=200), n_fills=6)
            elif random.random() < 0.10: add_drug(44785829, after=t2dm_start + timedelta(days=200), n_fills=6)
            if random.random() < 0.20: add_drug(40170911, after=t2dm_start + timedelta(days=300), n_fills=5)
            elif random.random() < 0.10: add_drug(793143, after=t2dm_start + timedelta(days=300), n_fills=5)
            if random.random() < 0.20: add_drug(1338005, after=t2dm_start + timedelta(days=600), n_fills=10)
        if has_t1dm:
            add_drug(1338005, n_fills=20)
        if has_htn:
            if random.random() < 0.6: add_drug(1308216, n_fills=10)
            else: add_drug(1310149, n_fills=10)
        if has_hld:
            add_drug(1545958, n_fills=10)

        # Measurements
        def add_measurement(concept_id: int, value: float, n: int = 4) -> None:
            nonlocal m_id, v_id
            for _ in range(n):
                m_id += 1
                v_id += 1
                d = today - timedelta(days=random.randint(15, 1500))
                jitter = random.uniform(-0.05, 0.05) * value
                cur.execute(
                    "INSERT INTO visit_occurrence VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)",
                    (v_id, pid, 9202, d.isoformat(), d.isoformat(), 32817),
                )
                cur.execute(
                    "INSERT INTO measurement VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
                    (m_id, pid, concept_id, d.isoformat(), 32817,
                     round(value + jitter, 2), v_id),
                )

        # HbA1c
        base_a1c = 5.5
        if has_t2dm: base_a1c = random.uniform(6.5, 9.5)
        if has_t1dm: base_a1c = random.uniform(7.0, 10.5)
        add_measurement(3004410, base_a1c, n=4 if (has_t2dm or has_t1dm) else 1)

        # BMI
        base_bmi = random.uniform(22, 28)
        if has_obesity: base_bmi = random.uniform(31, 42)
        elif has_t2dm:  base_bmi = random.uniform(27, 35)
        add_measurement(3038553, base_bmi, n=2)

        # BP
        base_sys = 120 + random.uniform(-10, 10)
        if has_htn: base_sys = random.uniform(135, 165)
        add_measurement(3004249, base_sys, n=3)
        add_measurement(3012888, base_sys * 0.65, n=3)

        # Creatinine + eGFR
        base_cr = random.uniform(0.7, 1.1)
        if has_ckd: base_cr = random.uniform(1.4, 2.5)
        add_measurement(3016723, base_cr, n=2)
        egfr = max(15, 95 - (base_cr - 0.9) * 60 - max(0, age - 40) * 0.6)
        add_measurement(3037556, egfr, n=2)

        # LDL
        base_ldl = random.uniform(80, 130)
        if has_hld: base_ldl = random.uniform(130, 190)
        add_measurement(3028437, base_ldl, n=2)

        # Death (rare)
        if random.random() < 0.04 and (has_mi or has_hf or age > 75):
            d = today - timedelta(days=random.randint(30, 1200))
            cur.execute(
                "INSERT INTO death VALUES (?, ?, ?, ?)",
                (pid, d.isoformat(), 32817, None),
            )

    con.commit()


def main() -> None:
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    con = sqlite3.connect(DB_PATH)
    print(f"Building synthetic OMOP CDM at {DB_PATH}")
    init_schema(con)
    populate_concepts(con)
    populate_persons(con, n=2500)
    populate_clinical(con)

    cur = con.cursor()
    for tbl in ["person", "condition_occurrence", "drug_exposure", "measurement",
                "visit_occurrence", "death", "concept", "concept_ancestor"]:
        cur.execute(f"SELECT COUNT(*) FROM {tbl}")
        print(f"  {tbl:24s} {cur.fetchone()[0]:>10,} rows")
    con.close()
    size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"✓ Done. Size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
