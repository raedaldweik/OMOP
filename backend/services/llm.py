"""
LLM agent with OMOP-native tool-use.

The agent orchestrates six tools:
  - run_omop_sql      – read-only SQL on the OMOP CDM
  - lookup_concept    – fuzzy concept search (Athena-style)
  - expand_concept_set – concept_ancestor descendant expansion
  - build_cohort      – produce a Circe-compatible cohort definition
  - characterize_cohort – Achilles-style demographics + comorbidities + drugs
  - search_omop_docs  – RAG over the OHDSI/OMOP knowledge corpus

The agent returns a structured response the frontend renders, including:
  - answer (markdown)
  - trace (one entry per tool call, with rationale + duration)
  - cohort (latest cohort definition, if built)
  - characterization (latest cohort characterization, if computed)
  - charts (Recharts-compatible specs)
  - citations (corpus references)
  - sql_log (every SQL the agent ran, for auditability)
"""
from __future__ import annotations
import json
import os
import time
from typing import Any

from services import omop, cohort as cohort_service, rag

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
MODEL = os.getenv("MODEL", "claude-sonnet-4-5-20250929")

_client = None
def _get_client():
    global _client
    if _client is None and ANTHROPIC_KEY:
        from anthropic import Anthropic
        _client = Anthropic(api_key=ANTHROPIC_KEY)
    return _client


# ──────────── Tool definitions ────────────

TOOLS = [
    {
        "name": "run_omop_sql",
        "description": (
            "Execute a read-only SELECT query against the OMOP CDM SQLite database. "
            "Use this for any cohort count, characterization, or exploratory question "
            "the other tools don't handle. The CDM contains the standard OMOP v5.4 "
            "tables: person, observation_period, visit_occurrence, condition_occurrence, "
            "drug_exposure, measurement, procedure_occurrence, death, concept, "
            "concept_ancestor, concept_relationship, cdm_source. "
            "Always JOIN to the `concept` table when displaying results so the user "
            "sees concept_name, not raw concept_id. The SQL dialect is SQLite. "
            "Mutating statements (INSERT/UPDATE/DELETE/DROP/etc.) are blocked. "
            "Default row limit is 1000; you may set a smaller LIMIT in the query."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql":     {"type": "string", "description": "The SELECT statement."},
                "purpose": {"type": "string", "description": "1-line description of what this query computes (shown to user)."},
            },
            "required": ["sql", "purpose"],
        },
    },
    {
        "name": "lookup_concept",
        "description": (
            "Search the OMOP standardized vocabulary for concepts matching a clinical "
            "term — e.g. 'metformin', 'type 2 diabetes', 'HbA1c'. Returns up to 10 "
            "candidate concepts with their concept_id, name, domain, and vocabulary. "
            "Always run this first when the user names a clinical entity, before "
            "writing SQL. Optionally filter by domain (Condition, Drug, Measurement, "
            "Procedure, Visit) to narrow results."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "term":   {"type": "string"},
                "domain": {"type": "string", "enum": ["Condition", "Drug", "Measurement",
                                                      "Procedure", "Visit", "Observation"]},
                "limit":  {"type": "integer", "default": 10},
            },
            "required": ["term"],
        },
    },
    {
        "name": "expand_concept_set",
        "description": (
            "Return all descendant concepts of a parent concept_id via the "
            "concept_ancestor table. Use this when the user asks about a class of "
            "drugs or a parent condition — e.g. 'SGLT2 inhibitors' (ATC class) "
            "expands to empagliflozin, dapagliflozin, etc. Always show the user "
            "the expanded list so they can verify the concept set is complete."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "concept_id":   {"type": "integer"},
                "include_self": {"type": "boolean", "default": True},
            },
            "required": ["concept_id"],
        },
    },
    {
        "name": "build_cohort",
        "description": (
            "Produce a Circe-compatible cohort definition document. The output is "
            "valid JSON that imports directly into ATLAS via WebAPI. "
            "Use this whenever the user wants to *define* a cohort for a study, not "
            "just count people. The cohort has a primary criteria (the entry event), "
            "optional inclusion rules, and uses concept sets that you specify. "
            "Always run lookup_concept first to get the right concept_ids, and "
            "expand_concept_set to verify descendant coverage, before building."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name":        {"type": "string"},
                "description": {"type": "string"},
                "primary_concept_set_name": {
                    "type": "string",
                    "description": "Human-readable name of the primary concept set (e.g. 'Type 2 diabetes mellitus')."
                },
                "primary_concept_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Concept IDs that define the entry event."
                },
                "primary_domain": {
                    "type": "string",
                    "enum": ["Condition", "Drug", "Measurement", "Procedure", "Visit"],
                },
                "include_descendants": {"type": "boolean", "default": True},
                "first_occurrence_only": {
                    "type": "boolean", "default": True,
                    "description": "True for new-user / incident designs."
                },
                "observation_window_prior_days": {
                    "type": "integer", "default": 365,
                    "description": "Minimum prior observation required."
                },
                "additional_concept_sets": {
                    "type": "array",
                    "description": "Extra concept sets used by inclusion rules.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name":              {"type": "string"},
                            "concept_ids":       {"type": "array", "items": {"type": "integer"}},
                            "include_descendants": {"type": "boolean", "default": True},
                        },
                        "required": ["name", "concept_ids"],
                    },
                },
                "inclusion_rules": {
                    "type": "array",
                    "description": "Time-windowed gates that must hold around index.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name":             {"type": "string"},
                            "description":      {"type": "string"},
                            "concept_set_name": {"type": "string"},
                            "domain":           {"type": "string", "enum":
                                ["Condition", "Drug", "Measurement", "Procedure", "Visit"]},
                            "occurrence":       {"type": "string", "enum":
                                ["at_least", "exactly", "at_most"]},
                            "count":            {"type": "integer", "default": 1},
                            "days_before":      {"type": "integer", "default": 365},
                            "days_after":       {"type": "integer", "default": 0},
                        },
                        "required": ["name", "concept_set_name", "domain"],
                    },
                },
            },
            "required": ["name", "description", "primary_concept_set_name",
                         "primary_concept_ids", "primary_domain"],
        },
    },
    {
        "name": "characterize_cohort",
        "description": (
            "Run an Achilles-style characterization on the most recently built cohort, "
            "OR on a specified list of person_ids, OR on the entire CDM (when "
            "person_ids is omitted). Returns demographics (sex, age band), top 10 "
            "conditions, top 10 drugs, and key measurement distributions (HbA1c, "
            "BMI, BP, eGFR, LDL). Use when the user wants to describe who is in a "
            "cohort. The result is also rendered as charts in the UI."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "use_last_cohort": {
                    "type": "boolean", "default": True,
                    "description": "If true, characterize the cohort just built. "
                                   "If false and person_ids is given, characterize that. "
                                   "If both false/empty, characterize entire CDM."
                },
                "person_ids": {"type": "array", "items": {"type": "integer"}},
            },
        },
    },
    {
        "name": "search_omop_docs",
        "description": (
            "Search the OHDSI/OMOP knowledge corpus — covers CDM specification, "
            "cohort definition methodology, concept-set best practices, "
            "characterization, comparative effectiveness, and federated execution. "
            "Use to ground methodological claims and recommendations. Returns "
            "ranked chunks with section references for citation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "top_k": {"type": "integer", "default": 4},
            },
            "required": ["query"],
        },
    },
    {
        "name": "render_chart",
        "description": (
            "Emit a chart specification for the frontend to render. Use when the "
            "user asks to visualize, plot, compare, or graph data, or when a chart "
            "would substantially clarify the answer."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "type":     {"type": "string", "enum": ["bar", "line", "area", "pie", "scatter"]},
                "title":    {"type": "string"},
                "subtitle": {"type": "string"},
                "data":     {"type": "array", "items": {"type": "object"}},
                "xKey":     {"type": "string"},
                "yKeys": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "key":   {"type": "string"},
                            "label": {"type": "string"},
                            "color": {"type": "string"},
                        },
                    },
                },
                "yAxisLabel": {"type": "string"},
                "footnote":   {"type": "string"},
            },
            "required": ["type", "title", "data", "xKey", "yKeys"],
        },
    },
]


# ──────────── Tool executors ────────────

class _Session:
    """Per-conversation scratch state; the cohort the agent built lives here."""
    def __init__(self) -> None:
        self.last_cohort: dict[str, Any] | None = None
        self.last_cohort_persons: list[int] = []
        self.sql_log: list[dict[str, Any]] = []
        self.charts: list[dict[str, Any]] = []
        self.citations: list[dict[str, Any]] = []
        self.last_characterization: dict[str, Any] | None = None
        self.concept_set_registry: dict[str, dict[str, Any]] = {}


def execute_tool(name: str, args: dict[str, Any], session: _Session) -> dict[str, Any]:
    if name == "run_omop_sql":
        result = omop.run_sql(args["sql"])
        session.sql_log.append({
            "purpose":   args.get("purpose", ""),
            "sql":       result.get("sql"),
            "row_count": result.get("row_count", 0),
            "error":     result.get("error"),
        })
        return result

    if name == "lookup_concept":
        return {
            "concepts": omop.find_concepts(
                args["term"], domain=args.get("domain"),
                limit=int(args.get("limit", 10)),
            )
        }

    if name == "expand_concept_set":
        return {
            "descendants": omop.get_descendants(
                int(args["concept_id"]),
                include_self=bool(args.get("include_self", True)),
            )
        }

    if name == "build_cohort":
        # Build primary concept set
        primary_name = args["primary_concept_set_name"]
        primary_ids  = args["primary_concept_ids"]
        primary_domain = args["primary_domain"]
        include_desc = bool(args.get("include_descendants", True))

        primary_set = cohort_service.build_concept_set(
            primary_name, primary_ids, include_descendants=include_desc,
        )
        session.concept_set_registry[primary_name] = primary_set

        all_sets = [primary_set]
        for extra in args.get("additional_concept_sets") or []:
            cs = cohort_service.build_concept_set(
                extra["name"], extra["concept_ids"],
                include_descendants=bool(extra.get("include_descendants", True)),
            )
            session.concept_set_registry[extra["name"]] = cs
            all_sets.append(cs)

        inclusion_blocks: list[dict[str, Any]] = []
        for rule in args.get("inclusion_rules") or []:
            cs = session.concept_set_registry.get(rule["concept_set_name"])
            if not cs:
                continue
            inclusion_blocks.append(cohort_service.make_inclusion_rule(
                name=rule["name"],
                description=rule.get("description", ""),
                concept_set_id=cs["id"],
                domain=rule["domain"],
                occurrence=rule.get("occurrence", "at_least"),
                count=int(rule.get("count", 1)),
                days_before=int(rule.get("days_before", 365)),
                days_after=int(rule.get("days_after", 0)),
            ))

        cdef = cohort_service.build_cohort_definition(
            name=args["name"],
            description=args["description"],
            primary_concept_set_id=primary_set["id"],
            primary_domain=primary_domain,
            concept_sets=all_sets,
            inclusion_rules=inclusion_blocks,
            first_occurrence_only=bool(args.get("first_occurrence_only", True)),
            observation_window_prior_days=int(args.get("observation_window_prior_days", 365)),
        )

        size_eval = cohort_service.evaluate_cohort_size(
            all_sets, primary_set["id"], primary_domain,
        )
        session.last_cohort = cdef
        session.last_cohort_persons = size_eval["person_ids"]

        return {
            "cohort_name": args["name"],
            "estimated_size": size_eval["size"],
            "size_note":      size_eval["note"],
            "primary_concept_set":  primary_name,
            "n_concept_sets":  len(all_sets),
            "n_inclusion_rules": len(inclusion_blocks),
            "circe_preview": _summarise_cohort(cdef),
        }

    if name == "characterize_cohort":
        pids: list[int] | None = None
        if args.get("use_last_cohort", True) and session.last_cohort_persons:
            pids = session.last_cohort_persons
        elif args.get("person_ids"):
            pids = list(args["person_ids"])
        char = omop.characterize_cohort(pids)
        session.last_characterization = char
        return char

    if name == "search_omop_docs":
        results = rag.search(args["query"], top_k=int(args.get("top_k", 4)))
        for r in results:
            session.citations.append({
                "doc_id":  r["doc_id"],
                "chunk_id": r["chunk_id"],
                "title":   r["title"],
                "section": r["section"],
                "score":   r["score"],
            })
        return {"results": results}

    if name == "render_chart":
        spec = {k: v for k, v in args.items()}
        session.charts.append(spec)
        return {"rendered": True, "title": args.get("title", "")}

    return {"error": f"unknown tool: {name}"}


# ──────────── Helpers ────────────

def _summarise_cohort(cdef: dict[str, Any]) -> dict[str, Any]:
    """Compact view for the trace; full Circe is downloadable from the UI."""
    return {
        "name":         cdef["_meta"]["name"],
        "concept_sets": [
            {
                "name":     cs["name"],
                "n_concepts": len(cs["expression"]["items"]),
                "include_descendants": all(
                    i["includeDescendants"] for i in cs["expression"]["items"]
                ) if cs["expression"]["items"] else False,
                "concepts": [
                    {"concept_id": i["concept"]["CONCEPT_ID"],
                     "name":       i["concept"]["CONCEPT_NAME"],
                     "vocabulary": i["concept"]["VOCABULARY_ID"]}
                    for i in cs["expression"]["items"][:5]
                ],
            }
            for cs in cdef["ConceptSets"]
        ],
        "primary_block": list(cdef["PrimaryCriteria"]["CriteriaList"][0].keys())[0]
            if cdef["PrimaryCriteria"]["CriteriaList"] else None,
        "first_occurrence_only": cdef["PrimaryCriteria"]["CriteriaList"][0].values().__iter__().__next__().get("First", False)
            if cdef["PrimaryCriteria"]["CriteriaList"] else None,
        "n_inclusion_rules": len(cdef["InclusionRules"]),
        "prior_obs_days":    cdef["PrimaryCriteria"]["ObservationWindow"]["PriorDays"],
    }


def _summarise_args(name: str, args: dict[str, Any]) -> str:
    if name == "run_omop_sql":
        return args.get("purpose") or args.get("sql", "")[:120]
    if name == "lookup_concept":
        d = f" ({args['domain']})" if args.get("domain") else ""
        return f"Search vocabulary for '{args['term']}'{d}"
    if name == "expand_concept_set":
        return f"Expand descendants of concept_id={args['concept_id']}"
    if name == "build_cohort":
        return f"Build cohort '{args['name']}' on {args.get('primary_domain','?')}"
    if name == "characterize_cohort":
        if args.get("use_last_cohort", True): return "Characterize last built cohort"
        if args.get("person_ids"): return f"Characterize {len(args['person_ids'])} persons"
        return "Characterize entire CDM"
    if name == "search_omop_docs":
        return f"Search OHDSI corpus: {args['query'][:80]}"
    if name == "render_chart":
        return f"Render {args.get('type','?')} chart: {args.get('title','')}"
    return name


def _summarise_result(name: str, result: dict[str, Any]) -> str:
    if "error" in result:
        return f"ERROR: {result['error'][:200]}"
    if name == "run_omop_sql":
        return f"{result.get('row_count', 0)} rows · {len(result.get('columns', []))} columns"
    if name == "lookup_concept":
        n = len(result.get("concepts", []))
        if n == 0: return "no matches"
        first = result["concepts"][0]
        return f"{n} match{'es' if n>1 else ''} · top: {first['concept_id']} {first['concept_name']}"
    if name == "expand_concept_set":
        return f"{len(result.get('descendants', []))} concepts in hierarchy"
    if name == "build_cohort":
        return f"{result.get('estimated_size', 0)} persons match primary criteria · {result.get('n_concept_sets',0)} concept sets · {result.get('n_inclusion_rules',0)} rules"
    if name == "characterize_cohort":
        return f"n={result.get('cohort_size', 0)} · {len(result.get('top_conditions', []))} top conditions · {len(result.get('measurements', []))} measurement distributions"
    if name == "search_omop_docs":
        return f"{len(result.get('results', []))} chunks retrieved"
    if name == "render_chart":
        return result.get("title", "rendered")
    return "ok"


# ──────────── System prompt ────────────

SYSTEM_PROMPT = """You are the SAS Population Health AI — a research assistant operating on top of an OMOP Common Data Model database. You serve health-data researchers, methodologists, and OHDSI collaborators.

You ground every answer in real data from the CDM, in the standardized OMOP vocabulary, and in OHDSI methodology. You produce artifacts a researcher can use directly — concept sets, Circe cohort definitions, characterization summaries, methodology citations.

WORKING STYLE:
1. For any clinical entity the user names (a drug, condition, measurement, procedure), call `lookup_concept` BEFORE writing SQL or building a cohort. Never guess concept IDs.
2. When the user asks about a class of drugs or a parent condition, call `expand_concept_set` to confirm the descendant list before using it.
3. For counts, prevalences, and exploratory questions, write SQL with `run_omop_sql`. Always JOIN the `concept` table to display human-readable names. Always include `purpose` so the user sees what the query is for.
4. When the user wants to *define* a study cohort (not just count people), call `build_cohort` to produce a Circe-compatible definition. Default to `first_occurrence_only=true` (new-user / incident design) unless the user explicitly asks for prevalent users.
5. After building a cohort, offer to characterize it with `characterize_cohort`. Use `render_chart` to plot demographics or top conditions when relevant.
6. For methodology questions ("how should I design...", "what time-at-risk window..."), call `search_omop_docs` and cite the section you used.
7. Show the user your reasoning. State which concept_ids you chose and why. Mention when you're including descendants. Surface methodological caveats (small Eunomia counts, prevalent vs incident user, etc.).

SAFETY:
- Never invent concept_ids, counts, or measurement values. If the data does not contain something, say so.
- All output is on a synthetic / Eunomia-style CDM. The numbers are real for this database, not for any real-world population. Be explicit about this when asked.
- Do not reproduce copyrighted text from external sources. The corpus you search is curated for this demo.

ANSWER FORMAT:
- Markdown. Bold for emphasis, sparing bullet points, short sentences.
- When you reference a concept, write it as: concept_name (vocabulary concept_id).
  Example: "metformin (RxNorm 1503297)".
- When you reference methodology, cite the corpus section by name.
- End with a concrete next step the user can take ("Want me to characterize this cohort?", "Should I add an inclusion rule for prior MI?", etc.) when appropriate.
"""


# ──────────── Agent loop ────────────

def run_agent(query: str, history: list[dict[str, Any]] | None = None,
              max_iters: int = 8) -> dict[str, Any]:
    client = _get_client()
    if client is None:
        return _scenario_response(query)

    session = _Session()
    messages: list[dict[str, Any]] = []
    if history:
        for h in history[-6:]:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                messages.append({"role": h["role"], "content": str(h["content"])[:1200]})
    messages.append({"role": "user", "content": query})

    trace: list[dict[str, Any]] = []
    final_text = ""

    for _ in range(max_iters):
        resp = client.messages.create(
            model=MODEL,
            max_tokens=2500,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )
        text_parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
        if text_parts:
            final_text = "\n".join(text_parts).strip()

        tool_uses = [b for b in resp.content if getattr(b, "type", None) == "tool_use"]
        if not tool_uses:
            break

        messages.append({"role": "assistant", "content": resp.content})

        tool_results_block: list[dict[str, Any]] = []
        for tu in tool_uses:
            args = tu.input or {}
            t0 = time.time()
            result = execute_tool(tu.name, args, session)
            ms = int((time.time() - t0) * 1000)

            agent_key = {
                "run_omop_sql":        "sql_agent",
                "lookup_concept":      "vocabulary_agent",
                "expand_concept_set":  "vocabulary_agent",
                "build_cohort":        "cohort_agent",
                "characterize_cohort": "characterization_agent",
                "search_omop_docs":    "rag_agent",
                "render_chart":        "viz_agent",
            }.get(tu.name, "agent")
            trace.append({
                "agent":       agent_key,
                "tool":        tu.name,
                "description": _summarise_args(tu.name, args),
                "detail":      _summarise_result(tu.name, result),
                "duration_ms": ms,
            })

            tool_results_block.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": json.dumps(result, default=str)[:9000],
            })

        messages.append({"role": "user", "content": tool_results_block})

    return {
        "answer":           final_text or "I wasn't able to formulate a complete answer.",
        "trace":            trace,
        "cohort":           session.last_cohort,
        "characterization": session.last_characterization,
        "charts":           session.charts,
        "citations":        session.citations,
        "sql_log":          session.sql_log,
    }


# ──────────── Scenarios fallback (no API key) ────────────

def _scenario_response(query: str) -> dict[str, Any]:
    """Pre-baked answers when ANTHROPIC_API_KEY is not set, so the demo still runs."""
    q = (query or "").lower()
    summary = omop.cdm_summary()

    if "diabetes" in q or "t2dm" in q or "metformin" in q:
        pids = omop.cohort_from_concept_set([201826], domain="Condition")
        char = omop.characterize_cohort(pids)
        return {
            "answer": (
                f"Type 2 diabetes mellitus (SNOMED 201826) is recorded in **{len(pids):,} persons** "
                f"in this CDM ({len(pids)/summary['n_persons']*100:.1f}% prevalence). "
                f"Mean HbA1c in this cohort: "
                f"{next((m['mean'] for m in char['measurements'] if 'HbA1c' in m['label']), 'N/A')} %. "
                f"\n\n*Scenario mode — set ANTHROPIC_API_KEY for full agent reasoning.*"
            ),
            "trace": [
                {"agent": "vocabulary_agent", "tool": "lookup_concept",
                 "description": "Search 'type 2 diabetes'", "detail": "1 match · 201826", "duration_ms": 5},
                {"agent": "characterization_agent", "tool": "characterize_cohort",
                 "description": f"Characterize {len(pids)} persons", "detail": f"n={len(pids)}", "duration_ms": 50},
            ],
            "cohort": None, "characterization": char,
            "charts": [], "citations": [], "sql_log": [],
        }

    if any(k in q for k in ["overview", "summary", "tell me about", "what is in", "describe the"]):
        return {
            "answer": (
                f"This OMOP CDM contains **{summary['n_persons']:,} persons** "
                f"observed from {summary['observation_window']['start']} to "
                f"{summary['observation_window']['end']}. "
                f"It includes {summary['tables']['condition_occurrence']:,} condition occurrences, "
                f"{summary['tables']['drug_exposure']:,} drug exposures, and "
                f"{summary['tables']['measurement']:,} measurements across "
                f"the standard OMOP v5.4 schema.\n\n"
                "Set `ANTHROPIC_API_KEY` in your environment to enable full agent reasoning."
            ),
            "trace": [{"agent": "scenario", "tool": "fallback",
                       "description": "Scenario mode (no API key)", "duration_ms": 0}],
            "cohort": None, "characterization": None,
            "charts": [], "citations": [], "sql_log": [],
        }

    return {
        "answer": (
            "I'm running in scenario mode (no `ANTHROPIC_API_KEY` set). "
            "Try asking about: the dataset overview, type 2 diabetes prevalence, "
            "metformin users, or HbA1c distribution."
        ),
        "trace": [], "cohort": None, "characterization": None,
        "charts": [], "citations": [], "sql_log": [],
    }
