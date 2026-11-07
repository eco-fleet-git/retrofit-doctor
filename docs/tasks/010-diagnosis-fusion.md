# Task 010 — diagnosis at the existing B1 alarm times

Owner: Claude Code (sole code writer). Coordinator: Codex. Date: 2026-11-07.
User explicitly confirmed: improve diagnostic accuracy and explanations; continue trying approaches/combinations until the goal is reached. This is a NEW adaptive research round after the preserved negative Task002/005/008 families. Their budgets, outcomes and gates remain unchanged. First slice: 45 minutes; report progress at the limit.

## Objective and boundaries

Keep the released causal B1 detector (k=6, persistence=15, 24 h reference, startup PYTHONHASHSEED=0) and its emission times/refractory immutable. Add a diagnosis-only layer using causal minute features, optionally the previously unused vibration snapshots. Better classification may still change official event matching: score honestly, never assume fixed times imply equal detected count or nuisance.

Train assets PUMP-01..07 only. Seven leave-one-asset-out folds, actually fit learned models on the other six assets. No random-minute train/test split. Labels of the held-out asset are evaluator-only. Validation08/09 already development-informed; no reads in phase 1 or train experiments. Test10..12 already exported and incident-disclosed: no test telemetry/predictions/labels inspection, no new test run, no rewriting results/release. Do not rehash all vendor data just for provenance. No asset-specific rules, IDs/site/timestamps/time-since-start as predictors; no hidden generator/config inspection. Vendor immutable. All synthetic.

## Phase 1 — implement and propose exact manifest, DO NOT score candidates yet

Read AGENTS.md, relevant existing causal features/scorer/evaluation helpers and public DATA_DICTIONARY/TECHNICAL_MODEL. Own new src/retrofit_doctor/diagnosis_fusion.py, scripts/run_diagnosis_fusion.py, focused tests, docs/experiments/followup/2026-11-07-diagnosis-fusion-manifest.json, docs/tasks/010-handoff.md and later results/diagnosis_fusion/. Do not edit existing detectors, UI, release artifacts or old results.

Design a finite wave, maximum SIX new configurations plus unchanged B1 control; no scoring until Codex reviews/seals exact definitions. Recommended complementary families:

1. W1: physically interpretable waveform diagnosis (bearing BPFO envelope periodicity, 1x/2x vibration components); conservative fallback to B1 when absent/stale/ambiguous. Fixed thresholds must be in manifest before labelled scoring. Do not assert that 1 radial axis proves alignment or a bearing failure. Avoid fitting the public generator constants as if independently discovered physics.
2. M1/M2: one fixed shallow learned classifier, minute-only features, two prospectively fixed confidence thresholds (e.g. 0.6 and 0.8). ExtraTrees with fixed seed/one worker or similarly justified compact model; no hyperparameter sweep. Confidence is uncalibrated model vote, not fault probability. If insufficient fit support or predicted class unavailable, fallback to B1, not healthy.
3. F1/F2: same learner/thresholds with the waveform features added. Missing waveform is explicit, no zero-as-normal. Optional sixth configuration: predeclared agreement/override fusion with W1. Keep configuration count finite.

You may simplify this proposed set with justification BEFORE evaluation. For supervised learning, define fixed causal features, exact fit-window labelling using fit-asset labels only, overlap exclusion, event-balanced sampling/weights and support minimum. No feature selection using held-out outcomes. Include labelled normal/unknown treatment explicitly. Fit transformations/imputation only on fit assets. No retaining held-out labels in fitted model or inference interface. Joint sensor type/channel claims require actual channel support; do not borrow the evaluator's sensor_tag. Preserve gateway/missing-data protection and describe exactly whether B1 quality diagnoses can be overridden.

Waveforms: 1 second at 10.24 kHz every 4h while running, with snapshot RPM and bearing orders in public metadata. Read parquet through train allowlist predicates and assert loaded IDs. A snapshot is usable only after timestamp_utc + n_samples/sample_rate_hz; use latest already completed record, maximum age fixed prospectively (suggest 4h), never nearest/future. Window ends/closed-minute timing as existing pipeline. RPM speed mismatch/staleness policy explicit. Using all samples of an already completed 1s snapshot is causal, even a within-record zero-phase filter; never filter across future snapshots. Define detrending/windowing/FFT normalization, frequency tolerance, envelope band and noise-floor ratios exactly. If support is inadequate, report that rather than loosening thresholds after results.

Primary method references (read if needed):
- https://www.mathworks.com/help/predmaint/ug/Rolling-Element-Bearing-Fault-Diagnosis.html (envelope/BPFO indicators; not proof of field performance)
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.hilbert.html
- https://scikit-learn.org/stable/common_pitfalls.html (fit-only transformations)
- https://scikit-learn.org/stable/modules/cross_validation.html (group-held-out evaluation)

Before scoring: synthetic fixtures for sinusoidal harmonic / BPFO impulse envelope / broadband noise / missing waveform / exact snapshot availability / stale snapshot / future mutation; fit-asset isolation; valid channel localization; deterministic configuration. Freeze manifest, feature list, code hashes and seed BEFORE first score. Report phase-1 readiness and stop for coordinator review (not user approval).

## Phase 2 — after coordinator seal

Run all declared candidates on seven held-out assets, no adaptive changes within wave. Control must reproduce 18/26 detected, 8/26 correct type, 14/26 correct class, false+excess 6, sensor correct type+channel 3/8. Preserve full per-event predictions, mismatches, wrong specific diagnoses, UNKNOWN and sensor localization. Original denominator 26 events /49 asset-days. Report per-asset results and support; confidence is not calibrated. Learned candidates that cannot predict an unseen held-out fault type must disclose this.

Success gate (fixed by coordinator before implementation): detected >=18, correct class >=14, false+excess <=6, sensor type+channel >=3, AND either (correct type >=10) OR (correct type >=9 AND sensor type+channel >=4). Also report separate false and excess and benign-window nuisance; do not hide worsening components behind their sum. Choose among passing candidates by useful diagnoses (correct type, plus channel for SENSOR), then correct type, then lower burden, then simplest candidate ID. No passing candidate -> preserve negative result and discuss a genuinely different next wave, never alter this gate to declare success.

Correctness gate: control byte/semantic equality to saved baseline at seed0; emission asset/time multiset equal control; no future data in evidence; prefix-replay and drastic future mutation comparisons at all emitted alert boundaries, snapshot end +/-1s and age boundary, 24h commissioning boundaries plus representative random cuts; actual learned models frozen per fold and no held-out labels accepted by inference. Normalize None/NaN for semantic checks while preserving raw artifacts. New layer deterministic across repeated runs; inherited B1 requires seed0 and remains disclosed. Do not claim cross-seed invariance for B1.

If a candidate passes both gates, seal trained configuration/code and report to Codex BEFORE one descriptive validation check. No automatic model promotion or UI change. If no candidate passes, report all results and failures. Use no test data at any phase.

## Deliverables

Exact manifest, implementation/tests, fit provenance for all seven folds, reproducible runner, machine-readable comparison/per-event/support/causality artifacts, succinct findings and handoff. Code only by Claude; Git commits/push by Codex. English artifacts. Explain physical assumptions and where snapshots might be unavailable in a real retrofit. No field-validation, calibrated probability, certification or ROI claims.
