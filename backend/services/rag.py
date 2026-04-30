"""
RAG service for the OHDSI/OMOP knowledge corpus.

Lightweight chunked-keyword retrieval over the markdown corpus in
`backend/data/corpus/`. We deliberately avoid heavyweight embedding stacks
for Phase 1 — the corpus is small (~5,000 words across 4 documents), the
domain vocabulary is technical and well-defined, and TF-IDF over chunks
gives genuinely useful results without a vector store.

Each markdown file is split into chunks of roughly 250–450 words, anchored
on header boundaries so the chunks are semantically coherent. Each chunk
is scored against the query using TF-IDF cosine similarity over the
combined corpus vocabulary.

Surface:
  - list_documents()          – metadata for the Documents page
  - search(query, top_k)      – ranked chunks with document + section refs
  - get_chunk(doc_id, chunk_id) – fetch full chunk text for the citation viewer
"""
from __future__ import annotations
import os
import re
import math
from collections import Counter
from functools import lru_cache
from typing import Any

CORPUS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "..", "data", "corpus")
CORPUS_DIR = os.path.abspath(CORPUS_DIR)

# Friendly titles for the Documents UI
DOC_META: dict[str, dict[str, str]] = {
    "omop_cdm_overview":   {
        "title":   "OMOP Common Data Model — Overview",
        "section": "CDM Specification",
        "source":  "OHDSI methodology (curated)",
    },
    "cohort_definitions":  {
        "title":   "Cohort Definitions in OHDSI",
        "section": "Methodology",
        "source":  "OHDSI methodology (curated)",
    },
    "concept_sets":        {
        "title":   "Concept Sets and the OMOP Vocabulary",
        "section": "Methodology",
        "source":  "OHDSI methodology (curated)",
    },
    "methodology":         {
        "title":   "Characterization, Comparative Effectiveness, and Federation",
        "section": "Methodology",
        "source":  "OHDSI methodology (curated)",
    },
}

# ─── Tokenization & chunking ──────────────────────────────────────

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9\-]+")
_STOPWORDS = set("""
a an and are as at be by for from has have if in into is it its of on or
that the to was were will with about across also can each etc many one
other than these this those which while these may must should would could
""".split())


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower())
            if t not in _STOPWORDS and len(t) >= 2]


def _chunk_markdown(text: str, doc_id: str) -> list[dict[str, Any]]:
    """Split markdown by H2/H3 headers; further split very long sections."""
    chunks: list[dict[str, Any]] = []
    parts = re.split(r"\n(?=#{1,3}\s)", text.strip())
    chunk_idx = 0
    for part in parts:
        if not part.strip():
            continue
        header_match = re.match(r"(#{1,3})\s+(.+)", part)
        section = header_match.group(2).strip() if header_match else "Introduction"
        body = part[header_match.end():].strip() if header_match else part.strip()
        # Split sections >450 words by paragraph
        words = body.split()
        if len(words) > 450:
            paragraphs = body.split("\n\n")
            buf: list[str] = []
            buf_len = 0
            for p in paragraphs:
                pw = len(p.split())
                if buf_len + pw > 350 and buf:
                    chunks.append({
                        "doc_id":   doc_id,
                        "chunk_id": f"{doc_id}#{chunk_idx}",
                        "section":  section,
                        "text":     "\n\n".join(buf).strip(),
                    })
                    chunk_idx += 1
                    buf, buf_len = [p], pw
                else:
                    buf.append(p); buf_len += pw
            if buf:
                chunks.append({
                    "doc_id":   doc_id,
                    "chunk_id": f"{doc_id}#{chunk_idx}",
                    "section":  section,
                    "text":     "\n\n".join(buf).strip(),
                })
                chunk_idx += 1
        else:
            chunks.append({
                "doc_id":   doc_id,
                "chunk_id": f"{doc_id}#{chunk_idx}",
                "section":  section,
                "text":     body,
            })
            chunk_idx += 1
    return chunks


# ─── Index build (one-time) ────────────────────────────────────────

@lru_cache(maxsize=1)
def _build_index() -> dict[str, Any]:
    """Build TF-IDF index over the corpus. Cached for the process lifetime."""
    if not os.path.isdir(CORPUS_DIR):
        return {"chunks": [], "df": {}, "n_chunks": 0}

    chunks: list[dict[str, Any]] = []
    for fname in sorted(os.listdir(CORPUS_DIR)):
        if not fname.endswith(".md"):
            continue
        doc_id = os.path.splitext(fname)[0]
        with open(os.path.join(CORPUS_DIR, fname), "r", encoding="utf-8") as fh:
            text = fh.read()
        chunks.extend(_chunk_markdown(text, doc_id))

    # Document frequency over chunks
    df: Counter[str] = Counter()
    for c in chunks:
        c["tokens"] = _tokenize(c["text"])
        c["tf"] = Counter(c["tokens"])
        for tok in set(c["tokens"]):
            df[tok] += 1

    n = len(chunks) or 1
    # Pre-compute TF-IDF vectors and norms
    for c in chunks:
        vec: dict[str, float] = {}
        for tok, count in c["tf"].items():
            idf = math.log((n + 1) / (df[tok] + 1)) + 1.0
            vec[tok] = (1 + math.log(count)) * idf
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        c["vec"] = vec
        c["norm"] = norm

    return {"chunks": chunks, "df": dict(df), "n_chunks": n}


# ─── Public API ────────────────────────────────────────────────────

def list_documents() -> list[dict[str, Any]]:
    idx = _build_index()
    seen: dict[str, dict[str, Any]] = {}
    for c in idx["chunks"]:
        did = c["doc_id"]
        if did not in seen:
            meta = DOC_META.get(did, {"title": did, "section": "Reference", "source": "—"})
            seen[did] = {
                "doc_id":  did,
                "title":   meta["title"],
                "section": meta["section"],
                "source":  meta["source"],
                "n_chunks": 0,
            }
        seen[did]["n_chunks"] += 1
    return sorted(seen.values(), key=lambda d: d["title"])


def get_chunk(chunk_id: str) -> dict[str, Any] | None:
    idx = _build_index()
    for c in idx["chunks"]:
        if c["chunk_id"] == chunk_id:
            return {
                "doc_id":  c["doc_id"],
                "chunk_id": c["chunk_id"],
                "section": c["section"],
                "text":    c["text"],
                "title":   DOC_META.get(c["doc_id"], {}).get("title", c["doc_id"]),
            }
    return None


def search(query: str, top_k: int = 4) -> list[dict[str, Any]]:
    """Return top_k most relevant chunks with TF-IDF cosine similarity scores."""
    idx = _build_index()
    if not idx["chunks"]:
        return []
    q_tokens = _tokenize(query)
    if not q_tokens:
        return []
    q_tf = Counter(q_tokens)
    n = idx["n_chunks"] or 1
    df = idx["df"]
    q_vec: dict[str, float] = {}
    for tok, count in q_tf.items():
        idf = math.log((n + 1) / (df.get(tok, 0) + 1)) + 1.0
        q_vec[tok] = (1 + math.log(count)) * idf
    q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0

    scored: list[tuple[float, dict[str, Any]]] = []
    for c in idx["chunks"]:
        dot = 0.0
        # Iterate over the smaller vector
        small, big = (q_vec, c["vec"]) if len(q_vec) < len(c["vec"]) else (c["vec"], q_vec)
        for tok, weight in small.items():
            if tok in big:
                dot += weight * big[tok]
        sim = dot / (q_norm * c["norm"])
        if sim > 0:
            scored.append((sim, c))

    scored.sort(reverse=True, key=lambda x: x[0])
    out: list[dict[str, Any]] = []
    for sim, c in scored[:top_k]:
        meta = DOC_META.get(c["doc_id"], {})
        out.append({
            "doc_id":  c["doc_id"],
            "chunk_id": c["chunk_id"],
            "section": c["section"],
            "title":   meta.get("title", c["doc_id"]),
            "text":    c["text"][:1200],
            "score":   round(float(sim), 4),
        })
    return out
