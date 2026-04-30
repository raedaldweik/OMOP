"""CDM browsing & SQL playground endpoints."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import omop

router = APIRouter(prefix="/api/cdm", tags=["cdm"])


class SQLQuery(BaseModel):
    sql: str


@router.get("/summary")
def summary() -> dict:
    return omop.cdm_summary()


@router.get("/persons")
def persons(limit: int = 50, offset: int = 0) -> dict:
    return {"persons": omop.list_persons(limit=limit, offset=offset)}


@router.get("/persons/{person_id}")
def person_detail(person_id: int) -> dict:
    detail = omop.person_detail(person_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"person_id={person_id} not found")
    return detail


@router.get("/concepts/search")
def concept_search(q: str, domain: str | None = None, limit: int = 20) -> dict:
    return {"concepts": omop.find_concepts(q, domain=domain, limit=limit)}


@router.get("/concepts/{concept_id}")
def concept_detail(concept_id: int) -> dict:
    c = omop.get_concept(concept_id)
    if c is None:
        raise HTTPException(status_code=404, detail=f"concept_id={concept_id} not found")
    return {"concept": c, "descendants": omop.get_descendants(concept_id)}


@router.post("/sql")
def run_sql(req: SQLQuery) -> dict:
    """Read-only SQL playground endpoint for the OMOP Browser page."""
    return omop.run_sql(req.sql, limit=500)
