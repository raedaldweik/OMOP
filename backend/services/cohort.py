"""
Cohort definition service.

Produces ATLAS/Circe-compatible cohort definition JSON that the agent can show in
the UI and the user can export and import directly into ATLAS via WebAPI.

The Circe schema is large; we generate a minimal-but-valid subset that ATLAS
accepts on import (verified shape against published OHDSI cohort definitions).

A cohort definition has three core parts:
  1. ConceptSets       – named, reusable concept sets with descendant flags
  2. PrimaryCriteria   – the index event (e.g. "first metformin exposure")
  3. InclusionRules    – additional gates that must hold around the index event

We model a simple but expressive cohort spec internally, then serialise it to
Circe at export time.
"""
from __future__ import annotations
import uuid
from typing import Any

from . import omop


# Map our simple "domain" → Circe criteria block name + concept-set role
DOMAIN_TO_CIRCE = {
    "Condition":   "ConditionOccurrence",
    "Drug":        "DrugExposure",
    "Measurement": "Measurement",
    "Procedure":   "ProcedureOccurrence",
    "Visit":       "VisitOccurrence",
}


def build_concept_set(name: str, concept_ids: list[int],
                      include_descendants: bool = True,
                      include_mapped: bool = False) -> dict[str, Any]:
    """Construct a Circe ConceptSet block."""
    items = []
    for cid in concept_ids:
        c = omop.get_concept(cid) or {}
        items.append({
            "concept": {
                "CONCEPT_ID":        cid,
                "CONCEPT_NAME":      c.get("concept_name", f"Concept {cid}"),
                "STANDARD_CONCEPT":  c.get("standard_concept", "S"),
                "INVALID_REASON":    None,
                "CONCEPT_CODE":      c.get("concept_code", ""),
                "DOMAIN_ID":         c.get("domain_id", ""),
                "VOCABULARY_ID":     c.get("vocabulary_id", ""),
                "CONCEPT_CLASS_ID":  c.get("concept_class_id", ""),
            },
            "isExcluded":          False,
            "includeDescendants":  include_descendants,
            "includeMapped":       include_mapped,
        })
    return {
        "id":   _hash_id(name),
        "name": name,
        "expression": {"items": items},
    }


def _hash_id(s: str) -> int:
    """Stable small int from a string, used as concept-set index in Circe."""
    return abs(hash(s)) % 10000


def build_cohort_definition(
    name: str,
    description: str,
    primary_concept_set_id: int,
    primary_domain: str,
    concept_sets: list[dict[str, Any]],
    inclusion_rules: list[dict[str, Any]] | None = None,
    first_occurrence_only: bool = True,
    observation_window_prior_days: int = 365,
) -> dict[str, Any]:
    """Build a complete Circe cohort definition document."""
    primary_block_name = DOMAIN_TO_CIRCE.get(primary_domain, "ConditionOccurrence")
    primary_criteria = {
        "CriteriaList": [
            {
                primary_block_name: {
                    "CodesetId": primary_concept_set_id,
                    "First":     first_occurrence_only,
                }
            }
        ],
        "ObservationWindow": {
            "PriorDays": observation_window_prior_days,
            "PostDays": 0,
        },
        "PrimaryCriteriaLimit": {"Type": "First" if first_occurrence_only else "All"},
    }

    return {
        "ConceptSets":      concept_sets,
        "PrimaryCriteria":  primary_criteria,
        "QualifiedLimit":   {"Type": "First"},
        "ExpressionLimit":  {"Type": "First"},
        "InclusionRules":   inclusion_rules or [],
        "EndStrategy":      {
            "DateOffset": {"DateField": "EndDate", "Offset": 0}
        },
        "CensoringCriteria": [],
        "CollapseSettings": {"CollapseType": "ERA", "EraPad": 0},
        "CensorWindow":     {},
        "cdmVersionRange":  ">=5.0.0",
        "_meta": {
            "name":        name,
            "description": description,
            "generated_by":"SAS Population Health AI",
            "generated_id": str(uuid.uuid4()),
        },
    }


def make_inclusion_rule(name: str, description: str,
                        concept_set_id: int, domain: str,
                        occurrence: str = "at_least", count: int = 1,
                        days_before: int = 365, days_after: int = 0) -> dict[str, Any]:
    """A simple time-windowed inclusion rule."""
    block_name = DOMAIN_TO_CIRCE.get(domain, "ConditionOccurrence")
    op = {"at_least": "at_least", "exactly": "exactly", "at_most": "at_most"}.get(occurrence, "at_least")
    return {
        "name":        name,
        "description": description,
        "expression": {
            "Type": "ALL",
            "CriteriaList": [
                {
                    "Criteria": {block_name: {"CodesetId": concept_set_id}},
                    "StartWindow": {
                        "Start": {"Days": days_before, "Coeff": -1},
                        "End":   {"Days": days_after,  "Coeff":  1},
                        "UseEventEnd": False,
                    },
                    "Occurrence": {"Type": op, "Count": count},
                }
            ],
            "DemographicCriteriaList": [],
            "Groups": [],
        },
    }


def evaluate_cohort_size(concept_sets: list[dict[str, Any]],
                         primary_concept_set_id: int,
                         primary_domain: str) -> dict[str, Any]:
    """
    Quick approximation of cohort size by running the primary concept set
    against the appropriate CDM table. This is *not* a full Circe execution
    (no inclusion rules applied, no observation-window logic) — it's a fast
    estimate so the user gets immediate feedback while building.
    """
    primary_set = next((cs for cs in concept_sets if cs["id"] == primary_concept_set_id), None)
    if not primary_set:
        return {"size": 0, "note": "Primary concept set not found"}

    cids = [item["concept"]["CONCEPT_ID"] for item in primary_set["expression"]["items"]
            if not item["isExcluded"]]
    include_desc = any(item["includeDescendants"] for item in primary_set["expression"]["items"])
    pids = omop.cohort_from_concept_set(cids, domain=primary_domain,
                                         include_descendants=include_desc)
    return {
        "size": len(pids),
        "person_ids": pids,
        "note": "Approximate — primary criteria only; full Circe evaluation would apply inclusion rules.",
    }
