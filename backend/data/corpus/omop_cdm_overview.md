# OMOP Common Data Model — Overview

The Observational Medical Outcomes Partnership (OMOP) Common Data Model is a
person-centric, longitudinal, relational schema designed to represent
healthcare data in a standardized way. Its purpose is to enable consistent
analytic methods to be applied across heterogeneous data sources — claims,
electronic health records, registries — without rewriting analysis code for
each source.

## Core design principles

The OMOP CDM is organized around three principles. First, all clinical events
are tied to a `person_id` and a date, enabling longitudinal analysis. Second,
clinical concepts are represented by standardized `concept_id` values from the
OHDSI standardized vocabularies, rather than local source codes. Third, the
schema is domain-oriented: conditions, drugs, measurements, procedures, and
observations live in their own tables, each with a consistent column
structure.

## Person-level tables

The `person` table contains demographics: one row per individual, with year of
birth, gender, race, ethnicity. It is the anchor that all other clinical data
references via `person_id`.

The `observation_period` table defines the time windows during which a person
is considered to have observable data in the source. Cohort definitions and
incidence calculations rely on `observation_period` to determine when a person
is "at risk" for an event.

## Clinical event tables

`visit_occurrence` records each encounter — inpatient, outpatient, emergency.
Each visit has a `visit_concept_id` (e.g., 9201 for inpatient, 9202 for
outpatient) and a date range.

`condition_occurrence` captures diagnoses, with one row per recorded condition
and a `condition_concept_id` mapped to standard SNOMED.

`drug_exposure` captures medication exposures (prescriptions, dispensings,
administrations). Each row references a `drug_concept_id` mapped to standard
RxNorm ingredients or clinical drugs, and includes `drug_exposure_start_date`,
`drug_exposure_end_date`, `quantity`, and `days_supply`.

`measurement` captures structured numeric or categorical lab tests, vital
signs, and quantitative assessments, with `measurement_concept_id` mapped to
standard LOINC and a `value_as_number` field for the numeric result.

`procedure_occurrence` captures procedures with a `procedure_concept_id`
mapped to standard SNOMED.

`death` captures mortality with a `death_date`.

## Vocabulary tables

The `concept` table is the central registry of all medical concepts. Each
concept has a unique `concept_id`, a name, a `domain_id`, a `vocabulary_id`
(e.g., SNOMED, RxNorm, LOINC), and a `standard_concept` flag indicating
whether it is the OMOP-standard representation of its meaning.

The `concept_ancestor` table encodes hierarchical relationships. For any
ancestor concept, it lists every descendant concept along with the minimum
and maximum levels of separation. This is what makes "expand to descendants"
work correctly — for example, expanding the ATC class "SGLT2 inhibitors" to
all individual drugs (empagliflozin, dapagliflozin, canagliflozin, etc.).

The `concept_relationship` table encodes non-hierarchical mappings between
concepts, including "Maps to" relationships that translate non-standard
source codes to standard concepts.

## Why this matters for analytics

Because the schema and vocabulary are standardized, an analytic query written
once can run unchanged across every OMOP-compliant data source in the OHDSI
network. A study defined as Circe JSON or as a HADES R package can execute
locally at each participating site, and only summary results are shared —
the patient-level data never moves. This is the foundation of OHDSI's
federated research model.
