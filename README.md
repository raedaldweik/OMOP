# SAS Population Health AI — OMOP CDM Edition

An agentic research assistant built on the **OMOP Common Data Model**, designed
for the OHDSI research community. The agent looks up concepts in the standardized
vocabulary, builds Circe-compatible cohort definitions, characterizes populations
Achilles-style, and grounds methodology answers in a curated OHDSI knowledge corpus.

This is **Phase 1** — the agentic core. Phase 2 plans add ATLAS/WebAPI integration,
pre-cached Achilles, HADES R-package code generation, and Athena deep links.
Phase 3 packages it as a federated bundle for network execution.

---

## Quick start

### 1. Backend (FastAPI on :8000)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# (Optional) Enable full agent reasoning
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# The synthetic CDM ships pre-built. To regenerate or swap in real Eunomia:
python data/generate_synthetic_omop.py     # rebuild synthetic dataset
python data/download_eunomia.py            # swap in real Eunomia GiBleed

uvicorn main:app --reload --port 8000
```

Without an API key the agent runs in **scenarios mode** — canned answers for
common demo prompts (overview, T2DM prevalence). Every other path needs the
key set.

### 2. Frontend (Vite on :5173)

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173. The Vite dev server proxies `/api/*` to `:8000`.

### 3. Production build

```bash
cd frontend && npm run build         # writes frontend/dist
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

The backend serves the built SPA from `../frontend/dist` if it exists.

### 4. Docker / Railway

```bash
docker build -t sas-omop-demo .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-... sas-omop-demo
```

`railway.toml` deploys via the included Dockerfile.

---

## What's in the box

### Data layer

- **Synthetic OMOP CDM v5.4** SQLite at `backend/data/omop.sqlite` —
  2,500 persons with realistic cardiometabolic care patterns, real
  SNOMED/RxNorm/LOINC concept IDs (T2DM 201826, metformin 1503297,
  HbA1c 3004410, etc.). 38% T2DM prevalence, mean HbA1c 8.0% in T2DM cohort.
- **Eunomia swap** — `data/download_eunomia.py` fetches the canonical
  OHDSI tutorial dataset and replaces the synthetic file. Both work with
  the same `omop.py` data layer.

### Agent tools

The agent runs Anthropic Claude with seven tools:

| Tool | Purpose |
|------|---------|
| `lookup_concept` | Fuzzy concept search (Athena-style) |
| `expand_concept_set` | `concept_ancestor` descendant expansion |
| `run_omop_sql` | Read-only SELECT against the CDM |
| `build_cohort` | Emit valid Circe JSON, importable into ATLAS |
| `characterize_cohort` | Achilles-style demographics + comorbidities + drugs + labs |
| `search_omop_docs` | RAG over the curated OHDSI/OMOP corpus |
| `render_chart` | Recharts-compatible chart specs for the UI |

System prompt enforces: ground in real concept_ids before SQL; default to
new-user incident designs; surface methodological caveats; never fabricate.

### UI

- **Assistant** — chat with the agent. Every response surfaces the
  reasoning trace, executed SQL, and corpus citations. Cohort definitions
  render in the live **Cohort Canvas** with downloadable Circe JSON.
- **Characterization** — Achilles-style profile of the entire CDM:
  age pyramid, sex, top conditions, top drugs, drug-class breakdown,
  T2DM comorbidity profile, key measurement distributions.
- **OMOP Browser** — read-only SQL playground with sample queries,
  paginated person browser, concept search.
- **Documents** — the RAG corpus (CDM overview, cohort definitions,
  concept sets, methodology) with full markdown viewer.
- **Query Log** — auditable record of every chat query and its tool footprint.

### RAG corpus

Four curated markdown documents in `backend/data/corpus/`, written in original
prose covering:

1. **OMOP CDM overview** — schema, vocabularies, federated execution rationale
2. **Cohort definitions** — anatomy, Circe expression language, new-user / active-comparator designs
3. **Concept sets** — standard concepts, descendant expansion, common pitfalls
4. **Methodology** — characterization, comparative effectiveness, prediction, federation

To extend: drop more `.md` files in `backend/data/corpus/`, register friendly
titles in `services/rag.py` → `DOC_META`. The TF-IDF index rebuilds at startup.

---

## Architecture

```
┌─ frontend (React + Vite + Tailwind) ─────────────────────────────┐
│  ChatPage  Characterization  OMOP Browser  Documents  Query Log │
│      │                                                           │
│      ▼ /api/* (proxied dev / same-origin prod)                  │
└──────┼────────────────────────────────────────────────────────────┘
       ▼
┌─ backend (FastAPI) ──────────────────────────────────────────────┐
│  routers/      chat · cdm · characterization · documents ·       │
│                cohort · audit                                    │
│  services/     omop · cohort · rag · llm · audit_log             │
│      │                          │                                │
│      ▼                          ▼                                │
│  omop.sqlite              corpus/*.md (TF-IDF)                  │
│  (2,500 persons,                                                │
│   v5.4 CDM)                                                      │
└──────────────────────────────────────────────────────────────────┘
```

Tools are wired through `services/llm.py`. The agent loop runs up to 8
tool-call iterations per query; results are streamed back as a structured
payload (answer, trace, cohort, characterization, charts, citations, sql_log).

---

## File reference

```
backend/
├── main.py                      FastAPI app, lifespan warmup, static SPA serve
├── requirements.txt
├── .env.example
├── data/
│   ├── omop.sqlite              Generated synthetic OMOP CDM v5.4 (~10 MB)
│   ├── generate_synthetic_omop.py
│   ├── download_eunomia.py
│   └── corpus/                  RAG markdown corpus (4 files)
├── routers/
│   ├── chat.py                  POST /api/chat, sample prompts
│   ├── cdm.py                   /api/cdm/{summary,persons,concepts,sql}
│   ├── characterization.py      /api/characterization/{cdm,cohort}
│   ├── documents.py             /api/documents
│   ├── cohort.py                /api/cohort/{store,last,build,last/circe.json}
│   └── audit.py                 /api/audit/queries
└── services/
    ├── omop.py                  CDM SQLite wrapper (run_sql, find_concepts, etc.)
    ├── cohort.py                Circe cohort definition builder
    ├── rag.py                   TF-IDF corpus retrieval
    ├── llm.py                   Agent loop, 7 tools, system prompt
    └── audit_log.py             JSON-backed query log

frontend/
├── package.json   vite.config.js   tailwind.config.js   postcss.config.js
├── eslint.config.js   index.html
├── public/        logo.png   logo.webp   red_logo.png
└── src/
    ├── main.jsx   index.css   api.js   App.jsx
    ├── context/   UserContext.jsx   ChatContext.jsx
    ├── components/
    │   ├── DynamicChart.jsx          Recharts wrapper
    │   ├── ResponseCard.jsx          Renders agent responses
    │   ├── CohortCanvas.jsx          Live cohort visualization (the wow)
    │   ├── ReasoningTrace.jsx        Tool-call trace
    │   ├── SourceViewer.jsx          Markdown citation viewer
    │   └── VoiceInput.jsx
    └── pages/
        ├── LandingPage.jsx           Hero + capabilities + disclaimers
        ├── ChatPage.jsx              Main assistant UI
        ├── CharacterizationPage.jsx  Achilles dashboard
        ├── OMOPBrowserPage.jsx       SQL + person + concept browser
        ├── DocumentsPage.jsx         Corpus list
        └── QueryLogPage.jsx          Audit log
```

---

## Roadmap

**Phase 1 (this drop)** — Agentic core: vocabulary lookup, cohort building,
characterization, RAG over OHDSI methodology, full audit trail.

**Phase 2** — Network integration:
- ATLAS/WebAPI bidirectional sync (push cohorts, pull existing definitions)
- Pre-cached Achilles results for instant dashboard load
- HADES R-package code generation (CohortMethod, PatientLevelPrediction)
- Athena deep links from every concept reference
- Broadsea Docker integration so the demo runs against an existing OHDSI stack

**Phase 3** — Federated execution:
- Self-contained Docker bundle for installation at network sites
- Study-package authoring workflow
- Aggregate-result sharing protocol

---

## Notes

- The synthetic data has **realistic patterns but fabricated persons**.
  Real concept IDs, fake people. Run `download_eunomia.py` to swap to the
  canonical OHDSI tutorial dataset for credible OHDSI demos.
- Cohort definitions emit **valid Circe JSON** — verified against the schema
  ATLAS expects on import via WebAPI. The `_meta` block is a non-Circe
  extension we use internally; ATLAS ignores unknown fields.
- The agent's SQL executor enforces a **read-only guard** that rejects any
  statement matching `INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|...`
  before execution.
- Built on Anthropic Claude via the `anthropic` Python SDK with native
  tool-use. Model defaults to `claude-sonnet-4-5-20250929`; override with
  the `MODEL` env var.
