# Cohort Definitions in OHDSI

A cohort, in OHDSI terminology, is a set of persons who satisfy one or more
inclusion criteria over a defined period of time. The cohort is the
fundamental unit of observational research: characterization studies describe
a single cohort, comparative studies contrast two cohorts, and prediction
studies use one cohort to anticipate outcomes in another.

## Anatomy of a cohort definition

Every cohort definition in the OHDSI ecosystem is structured around three
components: an entry event (also called the index event), inclusion rules
that further qualify cohort entry, and an exit strategy that defines when a
person leaves the cohort.

The entry event is typically a clinical occurrence — a first prescription
dispensed, a first diagnosis recorded, a first procedure performed. The date
of the entry event is the cohort start date, also called the index date,
and it anchors all subsequent time-based logic.

Inclusion rules apply additional gates that must hold around the index date.
For example: at least one year of prior observation, no prior exposure to
the drug under study (a "new user" requirement), at least one diagnosis of
the indication condition in the prior 365 days. Inclusion rules can require,
exclude, or count occurrences in flexible time windows relative to the
index event.

The exit strategy determines cohort end date — the day a person is no longer
considered a member. Common strategies include end of the drug era (with
optional padding), end of observation period, or a fixed days-after-index
window.

## The Circe expression language

Cohort definitions in ATLAS are stored as Circe JSON — a structured language
that compiles to OMOP-compliant SQL. A Circe document has top-level sections
for `ConceptSets`, `PrimaryCriteria`, `InclusionRules`, `EndStrategy`, and
several optional limit and censoring blocks. Each concept set is a named
collection of concept_ids with two important flags: `includeDescendants`
(whether to expand the concept set down the vocabulary hierarchy at SQL
generation time) and `includeMapped` (whether to also count source-mapped
non-standard concepts).

The `PrimaryCriteria` section defines the entry event using a single criteria
list. The criteria block is named for the OMOP domain — `ConditionOccurrence`,
`DrugExposure`, `Measurement`, `ProcedureOccurrence`, `VisitOccurrence` —
and references a `CodesetId` pointing to one of the concept sets. The
`ObservationWindow` parameters within `PrimaryCriteria` set the minimum
prior and post observation a person must have to enter the cohort.

`InclusionRules` is an array of named gates. Each rule has an expression
that combines criteria with `Type: "ALL"`, `"ANY"`, or `"AT_LEAST"`
operators, evaluated within `StartWindow` time bounds relative to the
index event. The window bounds are signed offsets in days, where negative
values look backward from index and positive values look forward.

## New-user designs

A "new-user" cohort design — also called incident user design — is the
preferred pattern for comparative drug studies. It restricts entry to
persons who have no prior exposure to the study drug, anchored at first
dispensing or prescription. This avoids prevalent-user bias, where persons
already on a drug at the start of follow-up represent a survivor population
who tolerated the drug, biasing safety and effectiveness estimates.

To implement a new-user design in Circe: set the primary criteria
`First: true` on the drug exposure block, ensure the prior observation
window in the `ObservationWindow` is at least 365 days, and add an
inclusion rule with `Occurrence: { Type: "exactly", Count: 0 }` for the
same drug concept set in the window `[-9999, -1]` days before index.

## Active-comparator designs

When comparing two drugs, the cleanest design is new-user, active-comparator,
new-user. Both arms restrict to incident users, and both must have an
indication for the comparison drug class — typically enforced via an
inclusion rule requiring at least one indication condition in the year
before index. This addresses confounding by indication, the most pernicious
bias in observational drug research.
