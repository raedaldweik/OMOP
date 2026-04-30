"""Characterization endpoints — feeds the dashboard / characterization page."""
from __future__ import annotations
from fastapi import APIRouter
from functools import lru_cache

from services import omop

router = APIRouter(prefix="/api/characterization", tags=["characterization"])


@lru_cache(maxsize=1)
def _cdm_wide() -> dict:
    """Achilles-style profile of the entire CDM, computed once."""
    base = omop.characterize_cohort(person_ids=None)

    # Drug-class breakdown (using ATC ancestors from our vocabulary subset)
    drug_classes = []
    for cid, label in [
        (21600744, "Biguanides"),
        (21600749, "Sulfonylureas"),
        (21600765, "SGLT2 inhibitors"),
        (21600773, "GLP-1 receptor agonists"),
        (21601238, "HMG-CoA reductase inhibitors (statins)"),
    ]:
        descendants = omop.get_descendants(cid, include_self=False)
        desc_ids = [d["concept_id"] for d in descendants]
        if not desc_ids:
            drug_classes.append({"class": label, "n_persons": 0, "n_drugs": 0})
            continue
        in_clause = ",".join(map(str, desc_ids))
        r = omop.run_sql(
            f"SELECT COUNT(DISTINCT person_id) AS n FROM drug_exposure "
            f"WHERE drug_concept_id IN ({in_clause})",
            limit=2,
        )
        n_persons = r["rows"][0]["n"] if r.get("rows") else 0
        drug_classes.append({"class": label, "n_persons": n_persons, "n_drugs": len(desc_ids)})

    # Comorbidity prevalence in T2DM
    t2dm_pids = omop.cohort_from_concept_set([201826], domain="Condition")
    comorb = []
    if t2dm_pids:
        in_pids = ",".join(map(str, t2dm_pids))
        for cid, label in [
            (320128, "Hypertension"), (432867, "Hyperlipidemia"),
            (4030518, "Obesity"),     (46271022, "CKD"),
            (316139, "Heart failure"), (4329847, "Myocardial infarction"),
            (4180628, "Diabetic retinopathy"), (443597, "Diabetic neuropathy"),
        ]:
            r = omop.run_sql(
                f"SELECT COUNT(DISTINCT person_id) AS n FROM condition_occurrence "
                f"WHERE condition_concept_id = {cid} AND person_id IN ({in_pids})",
                limit=2,
            )
            n = r["rows"][0]["n"] if r.get("rows") else 0
            comorb.append({
                "condition": label,
                "n":         n,
                "pct":       round(100.0 * n / len(t2dm_pids), 1) if t2dm_pids else 0.0,
            })

    return {
        **base,
        "drug_classes":          drug_classes,
        "t2dm_size":             len(t2dm_pids),
        "t2dm_comorbidities":    comorb,
    }


@router.get("/cdm")
def cdm_profile() -> dict:
    return _cdm_wide()


@router.get("/cohort")
def cohort_profile(person_ids: str = "") -> dict:
    """Characterize an arbitrary person_id list (comma-separated). Empty = whole CDM."""
    pids: list[int] | None = None
    if person_ids.strip():
        try:
            pids = [int(x) for x in person_ids.split(",") if x.strip()]
        except ValueError:
            return {"error": "person_ids must be a comma-separated list of integers."}
    return omop.characterize_cohort(pids)
