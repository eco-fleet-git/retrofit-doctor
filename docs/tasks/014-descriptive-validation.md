# Task014 — one selected candidate, descriptive validation

Prospective protocol written 2026-11-07 while Task012 train correctness checks are running, before Task013 raw inspection and before any new validation prediction. NOT authorization to run yet. Claude remains sole code writer. Start only after a coordinator-reviewed completed train wave passes the fixed improvement and correctness gates and identifies exactly one candidate using that wave's predeclared ranking.

## Decision and exposure

Validation PUMP-08/09 has already been inspected in earlier work; this is a descriptive non-regression check, not independent blind evidence. No selection, fitting or threshold tuning on these pumps. The chosen candidate name, immutable code hashes and train selection evidence must be recorded in a new manifest and coordinator seal before this check. Evaluate only that candidate and exact causal B1. If it fails, preserve the failure; do not test runners-up on validation to pick a winner. Test PUMP-10/11/12 telemetry, labels and predictions remain excluded. The existing frozen test release is untouched, and its historical exposure incident remains disclosed.

## Runner and metrics

Use explicit validation ID predicates/partitions and assertions. Load only required features/snapshots/raw data for those two pumps. Data outside the allowlist must not enter preprocessing. Preserve closed-minute availability, completed-snapshot timing, empirical first-day reference, missing-channel semantics and seed0. Nothing is fitted in the current rule-based candidates. If a later candidate has a fitted component, stop for a new fitting protocol rather than inventing one here.

Call the immutable official scorer with split='validation'. Do NOT reuse run_regime_reference.evaluate unchanged: it hardcodes split='train'. Generic diagnostic_metrics and summarise helpers may be reused after checking their inputs. Evaluate the full event denominator9 and exposure14 asset-days, with identical event/burst matching. Record raw predictions and input/code hashes before scoring, keep partial attempts, refuse completed/unsealed/changed-code runs. Save per-event and per-asset differences, localization, UNKNOWN, wrong-specific claims, unmatched/nuisance/repeated alerts, applicability coverage and waveform freshness.

Expected B1 control: detected8, type4, class8, false1, excess0, sensor type+channel2 (non-gateway1), 15 alerts, composite76.01253946421124. Match the saved causal B1 validation predictions semantically; no silently updated baseline. A changed cause can change burst matching even at identical alert times, so compare all metrics rather than assuming counts are fixed.

Descriptive adoption gate, fixed before the new check: detected>=8, correct type>=4, correct class>=8, false+excess<=1, sensor type+channel>=2, nuisance<=1. Also preserve every B1-correct type event and B1-correct sensor type+channel event; report all event transitions. The train improvement gate must still pass. Full-evidence prefix/future-mutation checks and fresh seed0 reproduction must pass. Explain whether validation improved or simply stayed unchanged; never merge train and validation into an unsupported accuracy claim.

Audit at every alert boundary, reference and snapshot boundaries, and deterministic random/sub-minute cuts using the existing Task010 cut definition. For raw residual candidates additionally rerun raw aggregation prefix/future-mutation boundary checks as in Task013. Compare explanations/provenance as well as diagnoses. No future rows, snapshots, reference counts or evaluation labels may alter earlier explanations.

## Handoff

Return manifest, result artifacts, all checks, plain-English findings, and exact changed event cases. Stop before modifying the default demo or generating a new release. Codex reviews actual evidence and prepares a separate source-specific UI task. Existing baseline UI must remain available for comparison. The product is a synthetic replay and engineering proposal, not validated field equipment, certified monitoring or measured ROI.
