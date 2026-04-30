"""Chat endpoint — wraps the OMOP agent."""
from __future__ import annotations
from typing import Any
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services import llm
from services import audit_log
from routers import cohort as cohort_router  # access _LAST so /api/cohort/last works after agent builds

router = APIRouter(prefix="/api", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    query:   str
    history: list[ChatMessage] = Field(default_factory=list)


@router.post("/chat")
def chat(req: ChatRequest) -> dict[str, Any]:
    history = [m.model_dump() for m in req.history]
    result = llm.run_agent(req.query, history=history)

    # If the agent built a cohort during this turn, expose it to the
    # download endpoint (/api/cohort/last/circe.json) and the
    # /api/cohort/last lookup. Without this the Cohort Canvas's download
    # button 404s because the agent's cohort lives in llm session state,
    # not the cohort router's _LAST store.
    if result.get("cohort"):
        cohort_router._LAST["cohort"] = result["cohort"]
        # llm.run_agent doesn't return person_ids; the canvas uses
        # characterization.cohort_size for display so this can stay empty.
        cohort_router._LAST["person_ids"] = []

    # Append to query log for the audit page
    audit_log.append({
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "query":     req.query,
        "answer_preview": (result.get("answer") or "")[:240],
        "n_tool_calls":   len(result.get("trace") or []),
        "n_sql":          len(result.get("sql_log") or []),
        "cohort_built":   bool(result.get("cohort")),
    })
    return result


@router.get("/chat/sample-prompts")
def sample_prompts() -> dict[str, list[str]]:
    """Curated prompts for the landing/empty-state UI."""
    return {
        "prompts": [
            "How many persons in the CDM have type 2 diabetes? What's the prevalence?",
            "Build me a cohort of new metformin users with at least one year of prior observation and a T2DM diagnosis in the previous year.",
            "Show me the descendants of the SGLT2 inhibitors ATC class and how many persons are exposed to each.",
            "Characterize the heart failure cohort — demographics, comorbidities, and key labs.",
            "Compare HbA1c distributions between metformin users and SGLT2i users.",
            "What's the recommended study design for comparing SGLT2i vs DPP-4i on heart failure outcomes?",
        ]
    }
