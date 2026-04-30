# Concept Sets and the OMOP Vocabulary

A concept set is a named, reusable collection of standardized concept_ids
that represents a clinical idea. "Type 2 diabetes mellitus", "SGLT2
inhibitors", "Major adverse cardiovascular events" — each is encoded as a
concept set and reused across cohort definitions, characterization reports,
and analytic pipelines.

## Standard concepts

The OMOP vocabulary identifies one canonical representation per clinical
meaning, called the standard concept. Standard concepts are flagged with
`standard_concept = 'S'` in the `concept` table. Source codes — ICD-9-CM
diagnoses, ICD-10 procedure codes, NDC drug codes, local LOINC variants —
are mapped to standard concepts via "Maps to" relationships in the
`concept_relationship` table. When building a concept set, always use
standard concepts as the building blocks. The `includeMapped` flag in
Circe handles the source-to-standard mapping automatically at SQL
generation time.

## Domains and where to look

Each concept belongs to a domain that determines which CDM table it lives
in. Conditions are stored in `condition_occurrence` and use SNOMED standard
concepts. Drug exposures are in `drug_exposure` and use RxNorm standard
concepts at the ingredient or clinical-drug level. Measurements are in
`measurement` and use LOINC. Procedures are in `procedure_occurrence` and
use SNOMED, CPT4, or HCPCS depending on data provenance.

When a researcher asks for "patients on metformin", the correct concept set
is the RxNorm ingredient concept for metformin (concept_id 1503297) with
descendants included — the descendants pull in all metformin-containing
clinical drugs across strengths and brand names.

## Descendant expansion

The concept_ancestor table is the mechanism for hierarchical expansion.
For ingredient → clinical drug expansion, the ancestor is the ingredient
and the descendants are all branded and generic clinical-drug formulations.
For ATC class → ingredient expansion, the ancestor is an ATC class concept
and the descendants are all ingredient concepts within that class.
SGLT2 inhibitors as an ATC class expands to empagliflozin, dapagliflozin,
canagliflozin, ertugliflozin, and others.

Always include descendants when the conceptual meaning is the broader class.
Do not include descendants when the question requires a specific molecule.
For SNOMED conditions, descendant expansion is critical — a top-level
concept like "Hypertensive disorder" without descendants will miss the more
specific terms a clinician actually documents like "Essential hypertension"
or "Hypertensive heart disease."

## Common pitfalls

A few patterns generate bad cohort definitions reliably. Searching by name
without checking domain returns concepts from the wrong table — "diabetes"
matches both condition concepts and observation concepts that should not
be combined. Using non-standard concepts in concept sets — the source
codes from raw data instead of the mapped standard concepts — silently
returns zero rows because the CDM stores standard concept_ids, not source
codes, in the analytic columns. Forgetting to include descendants on a
parent SNOMED or ATC class — silently returns a much smaller cohort than
intended. Including descendants on a leaf concept — harmless but
misleading; the descendant set is just the concept itself.

## Validating a concept set

The two practical validation steps before using a concept set in a study
are: first, examine the descendant list and ensure no unexpected concepts
were pulled in (descendants of "Diabetes mellitus" include some unrelated
terms like specific genetic syndromes); second, run the concept set
against the CDM and inspect the resulting count and a small sample of
records to confirm the concepts actually appear in the data. A
concept set that returns zero records is a red flag — either the data
source does not contain the relevant events, or the concept set is wrong.

## Reusing curated concept sets

Two community resources are worth knowing about. The OHDSI Phenotype
Library is a curated repository of validated phenotype definitions —
each is a concept set plus a cohort definition that has been peer-reviewed
and applied across multiple data sources. The Athena vocabulary browser
(athena.ohdsi.org) is the canonical lookup for any concept_id; every
concept page shows hierarchy, mappings, validity dates, and the count of
records in publicly characterized data sources.
