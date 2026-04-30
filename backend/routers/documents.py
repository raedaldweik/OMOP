"""Documents / corpus endpoints — power the Documents page and citation viewer."""
from __future__ import annotations
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from services import rag

router = APIRouter(prefix="/api/documents", tags=["documents"])

CORPUS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "..", "data", "corpus")
CORPUS_DIR = os.path.abspath(CORPUS_DIR)


@router.get("")
def list_docs() -> dict:
    return {"documents": rag.list_documents()}


@router.get("/{doc_id}/raw", response_class=PlainTextResponse)
def doc_raw(doc_id: str) -> str:
    safe = doc_id.replace("/", "").replace("..", "")
    path = os.path.join(CORPUS_DIR, f"{safe}.md")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"document {doc_id!r} not found")
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


@router.get("/chunk/{chunk_id}")
def chunk(chunk_id: str) -> dict:
    chunk_id = chunk_id.replace("..", "")
    c = rag.get_chunk(chunk_id)
    if c is None:
        raise HTTPException(status_code=404, detail=f"chunk {chunk_id!r} not found")
    return c
