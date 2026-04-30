"""
SAS Population Health AI — OMOP CDM agent backend.

Local dev:
    uvicorn main:app --reload --port 8000

Production:
    uvicorn main:app --host 0.0.0.0 --port $PORT
    The Vite-built frontend is served from ../frontend/dist if present.

Env vars:
    ANTHROPIC_API_KEY  – enables full agent reasoning (without it, scenarios fallback)
    MODEL              – override the Anthropic model (default: claude-sonnet-4-5-20250929)
    PORT               – serving port (Railway/Render set this automatically)
"""
from __future__ import annotations
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from routers import chat, cdm, characterization, documents, cohort, audit
from services import omop, rag


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm caches at startup so the first request isn't slow."""
    try:
        s = omop.cdm_summary()
        print(f"✓ OMOP CDM connected: {s['n_persons']:,} persons · "
              f"{s['tables']['condition_occurrence']:,} conditions · "
              f"{s['tables']['drug_exposure']:,} drug exposures")
    except Exception as e:
        print(f"⚠ Could not load OMOP CDM: {e}")
    try:
        docs = rag.list_documents()
        n_chunks = sum(d["n_chunks"] for d in docs)
        print(f"✓ RAG corpus indexed: {len(docs)} documents · {n_chunks} chunks")
    except Exception as e:
        print(f"⚠ Could not build RAG corpus: {e}")

    has_key = bool(os.getenv("ANTHROPIC_API_KEY"))
    print(f"✓ Mode: {'LLM tool-use' if has_key else 'Scenarios-only (no API key)'}")
    yield


app = FastAPI(
    title="SAS Population Health AI",
    description="OMOP CDM agentic research assistant — built on the OHDSI common data model.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API routers ─────────────────────────────────────
app.include_router(chat.router)
app.include_router(cdm.router)
app.include_router(characterization.router)
app.include_router(documents.router)
app.include_router(cohort.router)
app.include_router(audit.router)


@app.get("/api/health")
def health() -> dict:
    has_key = bool(os.getenv("ANTHROPIC_API_KEY"))
    return {
        "status": "ok",
        "mode":   "llm" if has_key else "scenarios-only",
        "agents": ["sql_agent", "vocabulary_agent", "cohort_agent",
                   "characterization_agent", "rag_agent", "viz_agent"],
    }


# ─── Static frontend ─────────────────────────────────
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "..", "frontend", "dist")
FRONTEND_DIST = os.path.abspath(FRONTEND_DIST)

if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{filename:path}")
    def serve_spa(filename: str):
        if filename.startswith("api/"):
            return {"error": "not found"}, 404
        candidate = os.path.join(FRONTEND_DIST, filename)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

    print(f"✓ Serving frontend from {FRONTEND_DIST}")
else:
    @app.get("/")
    def root() -> dict:
        return {
            "service": "SAS Population Health AI",
            "version": "1.0.0",
            "status":  "API-only mode (no frontend build found)",
            "hint":    "Run `npm run build` in frontend/ for production, or `npm run dev` on port 5173.",
        }
    print(f"⚠ No frontend build at {FRONTEND_DIST} — API-only mode")
