"""Cohort export endpoint — returns the most recently built Circe JSON."""
from __future__ import annotations
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from services import cohort as cohort_service, omop

router = APIRouter(prefix="/api/cohort", tags=["cohort"])

# In-memory store for the most recently built cohort (per-process; sufficient for demo).
_LAST: dict = {"cohort": None, "person_ids": []}


class StoreCohort(BaseModel):
    cohort:     dict
    person_ids: list[int] = []


@router.post("/store")
def store(body: StoreCohort) -> dict:
    _LAST["cohort"] = body.cohort
    _LAST["person_ids"] = body.person_ids
    return {"stored": True}


@router.get("/last")
def last() -> dict:
    if _LAST["cohort"] is None:
        return {"cohort": None, "person_ids": []}
    return {"cohort": _LAST["cohort"], "person_ids": _LAST["person_ids"]}


@router.get("/last/circe.json")
def export_circe() -> Response:
    if _LAST["cohort"] is None:
        raise HTTPException(status_code=404, detail="no cohort has been built in this session")
    payload = json.dumps(_LAST["cohort"], indent=2)
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="cohort_definition.json"'},
    )


# Convenience: build a cohort directly via REST (used by the UI's quick-build form)
class BuildBody(BaseModel):
    name:                          str
    description:                   str
    primary_concept_set_name:      str
    primary_concept_ids:           list[int]
    primary_domain:                str
    include_descendants:           bool = True
    first_occurrence_only:         bool = True
    observation_window_prior_days: int = 365


@router.post("/build")
def build(body: BuildBody) -> dict:
    primary_set = cohort_service.build_concept_set(
        body.primary_concept_set_name,
        body.primary_concept_ids,
        include_descendants=body.include_descendants,
    )
    cdef = cohort_service.build_cohort_definition(
        name=body.name,
        description=body.description,
        primary_concept_set_id=primary_set["id"],
        primary_domain=body.primary_domain,
        concept_sets=[primary_set],
        first_occurrence_only=body.first_occurrence_only,
        observation_window_prior_days=body.observation_window_prior_days,
    )
    size_eval = cohort_service.evaluate_cohort_size(
        [primary_set], primary_set["id"], body.primary_domain,
    )
    _LAST["cohort"] = cdef
    _LAST["person_ids"] = size_eval["person_ids"]
    return {
        "cohort":          cdef,
        "estimated_size":  size_eval["size"],
        "size_note":       size_eval["note"],
    }
