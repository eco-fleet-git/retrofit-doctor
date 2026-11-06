# Task 007 — final release and one-shot blind prediction export

Do not start until the main Codex coordinator has recorded the release gate after Tasks003–006, Task008 and the final experiment decision. This is within the user's existing project authorization; it does not require another generic permission request. It is a real data-access boundary, so an unfinished manifest or missing correctness check is not approval. Claude implements the runner; Codex owns the release decision, Git and verification. No online submission or external publication is authorized by this task.

Read AGENTS.md, docs/experiments/FROZEN_PROTOCOL.md section 6, vendor/benchmark/CHALLENGE_BRIEF.md and BENCHMARK_RULES.md. The supplied challenge requires a prediction file for the three test assets as well as prototype/repository/presentation/baseline comparison/limitations.

## Before access to test measurements

Prepare the inference/export adapter and verify its CSV schema and causal behavior using train/validation or artificial fixtures only. Use the chosen frozen artifact; do not change causal B1 or any sealed experiment to add a split to a development loader. No dependence on event labels, hidden scenario configuration, organizer predictions or future windows. Static public metadata and the fixed causal first-day reference are allowed. The batch algorithm must respect each alert's available-time clock and document the zero-ingestion-lag assumption.

Save a release manifest with selected artifact/config/code hashes, dependencies, seed, data-availability and reference policy, exposure log, schema, output path, selected-model rationale, checks and Git revision. If no improved model passes, release unchanged causal B1 and say so. The main coordinator verifies this manifest and records the gate before the export command is executed. Keep test curves and outcome-oriented logs out of development review.

## One-shot export

The sealed command loads only PUMP-10/11/12 feature rows through a predicate and verifies actual IDs. It never loads labels or organizer test-prediction files. Produce exactly one CSV conforming to submission_template/predictions_template.csv, plus execution manifest, counts/schema checks and checksums. Extra diagnostics stay out of the submission columns. No invented measured RPM for fixed-speed equipment, no extra channels and no per-asset manual parameters.

Run automated schema and prefix-invariance checks without using their outputs to retune. An infrastructure-only repeat must use the identical artifact and disclose the reason; verify equality of already issued predictions. Algorithm changes after test access consume the split and prevent a fresh blind-performance claim. Without organizer labels/scoring, state **Test predictions exported; quality unknown**.

## Package and rehearse

Verify a fresh checkout can serve the committed demo bundle using the documented local command without the large dataset or a cloud service. Analytical rerun instructions separately explain how to restore the supplied immutable data and install pinned dependencies. Test metadata-only UI remains separate from the release CSV; do not silently expose test outcomes in the development replay.

Collect the final English presentation/PDF, three-minute script, fallback screenshots, experiment status, limitations, code revision and prediction filename in one release README. Align screenshots and numbers to that revision. Record user review feedback when actually received; do not claim it from automated smoke tests. A video is optional if the completed presentation satisfies the supplied brief.

The jury-facing repository entry point and release README must be in English. Keep the existing Russian working analyses available through links rather than discarding them. A fresh reader should find the local demo command, what works, the current model choice, the proposal for optional hardware, measured evidence and limitations without reading the planning history. User approval covers the light visual direction only; distinguish it from final application acceptance.

Verify private Git visibility and push the reviewed release through the main coordinator. No public hosting, competition upload, external messages, physical hardware build or operational control. Return docs/tasks/007-handoff.md and the completed release checklist, including anything still unverified.
