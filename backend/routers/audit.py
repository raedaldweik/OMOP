"""Audit / query log endpoints."""
from __future__ import annotations
from fastapi import APIRouter

from services import audit_log

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/queries")
def list_queries() -> dict:
    return {"queries": audit_log.all_entries()}


@router.delete("/queries")
def clear_queries() -> dict:
    audit_log.clear()
    return {"cleared": True}
