# Cohort Characterization

Characterization is the descriptive analytic task in OHDSI: given a defined
cohort, summarize who they are. The standard characterization output covers
demographics, baseline clinical state, treatment history, and outcomes.

The OHDSI tool of choice for characterization is the FeatureExtraction R
package, which generates standardized covariate definitions across all OMOP
domains. For an out-of-the-box characterization, FeatureExtraction can produce
many thousands of binary and continuous features — all conditions in the prior
year, all drugs in the prior year, all procedures, all measurements — at
configurable time windows relative to cohort index.

For interactive characterization, the Achilles R package generates summary
distributions across the entire CDM, not a specific cohort. Achilles produces
roughly 200 standardized analytic outputs covering data density,
demographics, condition prevalence, drug utilization, and measurement
distributions. Its outputs feed the ARES, AchillesWeb, and DataQualityDashboard
front-ends.

A good characterization report answers four questions about the cohort:
who are these people demographically, what conditions do they have, what
medications are they on, and what laboratory values are typical for them.
Each is reported with summary statistics — counts, prevalences, means and
medians with quartiles for continuous variables.

## Comparative Effectiveness

Comparative effectiveness research in OHDSI follows a standard analytic
pattern called population-level estimation, implemented in the CohortMethod
R package. The workflow is: define two cohorts representing the two
exposures, define an outcome cohort, compute a propensity score balancing
the two arms on baseline covariates, match or stratify on the propensity
score, and estimate a hazard ratio for the outcome.

The methodological commitments OHDSI has codified through the LEGEND
(Large-Scale Evidence Generation and Evaluation across a Network of
Databases) initiative include: always use new-user active-comparator
designs to avoid prevalent-user and confounding-by-indication biases;
adjust for a large covariate set rather than a hand-picked few, using
regularized regression; report effect estimates calibrated against negative
control outcomes — outcomes for which the exposure is known not to cause
or prevent the outcome.

Negative controls are central to the OHDSI methodology. Because residual
confounding is unobservable, calibrated p-values and confidence intervals
adjust the nominal estimates using the empirical null distribution
estimated from a panel of negative controls. The result is a calibrated
effect estimate that reflects what the analysis would have shown if no
true effect existed, providing a check on systematic bias.

## Patient-Level Prediction

The PatientLevelPrediction R package implements the standard supervised
learning pipeline for clinical risk prediction in OMOP. The user defines
a target cohort (the population at risk), a time-at-risk window, and an
outcome cohort. The package extracts a large covariate matrix from the
prior observation window, splits into train/test, fits one or more models
(typically logistic regression with LASSO, gradient-boosting machines,
random forests, or simple neural networks), and reports calibration and
discrimination metrics with standardized plots.

The framework emphasizes external validation: a model developed on one
network site should be tested unchanged at other sites. This is what
distinguishes OHDSI prediction from typical machine-learning publications,
where a single split on a single dataset is the norm.

## Self-Controlled Designs

For drug safety questions, self-controlled designs eliminate between-person
confounding by comparing each person's outcome rate during exposure
intervals to their own rate during non-exposure intervals. The
SelfControlledCaseSeries R package implements the method. Self-controlled
designs are particularly useful for short-latency adverse events and for
exposure-outcome pairs where confounding by underlying disease severity is
strong.

## Federated execution

The defining feature of OHDSI methodology is federated execution. A study
package is a self-contained R project that includes the Circe cohort
definitions, the analytic R script, and configuration. It is shared with
each participating data partner who runs the package locally on their OMOP
CDM. Only the summary statistics — coefficient estimates, counts,
distributions — are returned. The patient-level data never leaves the
data partner's environment. This is what allows OHDSI to combine evidence
from data sources covering hundreds of millions of patients without
violating institutional data-sharing constraints.
