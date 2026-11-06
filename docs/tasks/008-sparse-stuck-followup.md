# Task 008 — one bounded iteration on quantized sparse readings

Registered after Task002 r2 exposed the sparse-stuck failure, before evaluating the variants below. This is a new experiment, not a correction hidden inside B2 v1. Execute after Task004 and before the final Task006/007 release, under the main coordinator's single-writer sequence. Budget 45 minutes. Preserve all previous evidence and sealed source files. Claude Code implements; Codex reviews and owns Git.

## Question

Does a conservative commissioning-reference rule distinguish a new frozen sparse sensor from normal repeated quantized readings, and is its benefit worth the alerts it adds? Task002 showed that exact equality of three updates is too permissive for healthy bearing temperature. Do not infer hardware resolution from hidden simulator configuration, and do not tune on validation.

## Fixed candidate budget

Four candidates, no adaptive search:

1. **S0:** unchanged causal B1, the released control.
2. **S1:** unchanged Task002 C1, the failed comparison control.
3. **S2:** C1 with only its sparse-stuck source disabled. Dense stuck, gap and amplitude behavior stay unchanged. This ablation measures whether that source helps at all; it is not a claim of complete sensor-fault coverage.
4. **S3:** C1 with a commissioning-repeat rule for sparse stuck. For each sparse installed channel, compute the longest run of exactly equal independent samples in the first 24-hour steady-running reference. Break the reference run on a gateway gap, staleness or operating-segment change; held values do not count as samples. After commissioning, require both at least `max(3, longest_reference_equal_run + 1)` new equal samples and the existing 15-minute wall-clock persistence. Freeze the threshold after the first 24 hours. Before then, or with fewer than three independent reference samples, sparse stuck is unsupported (other permitted gap behavior stays unchanged). Do not use later history, labels, validation, a guessed resolution or a tuned quantile. Explicitly report that contamination/long flat commissioning periods can make the rule insensitive.

Keep the existing same-value and dense-standard-deviation definitions, priority, k=6, 15-minute persistence and refractory behavior for all other sources. Do not add temporal diagnosis or alter the existing C2–C5 study. The new implementation must avoid mutating globals in the sealed module or overwriting it. Candidate IDs, exact code hashes and parameters are recorded before train evaluation.

## Evaluation and decision

Train assets01–07 only, same seven independent held-out-asset replays, original26-event denominator and49 asset-days. No learned across-asset fit is required; the per-asset commissioning reference is available only after its window closes. Before scoring, verify dense behavior unchanged, ordinary quantized repeats versus newly frozen values, unknown/insufficient reference, boundary timestamps, gap/regime resets, deterministic output and the original stored train cutpoints. Include future-value mutation. Show the sparse-source threshold and independent sample count in evidence.

Use the Task002 hard non-regression gates and tie-break order without modification: no causality failures; detection>=18, class>=14, correct type>=8, false+excess<=6; then sensor type+channel, correct type, composite, candidate ID. Only S2/S3 are new deployment candidates; S1 cannot become a candidate simply because of this rerun. If neither passes, retain S0 and report failure. No further threshold variants in this task.

Report all candidate metrics, per-event changes, correctly localized sensor events, sparse false-stuck episodes and the missed real stuck cases. Correcting a false warning by suppressing all sparse-stuck warnings is a tradeoff that must remain visible. Use fixtures to establish mechanism and benchmark results to measure this dataset; neither establishes field performance.

Seal one passing train-selected variant before one descriptive validation check against S0. Validation has already been inspected; disclose this. Do not evaluate failed candidates on validation or switch candidates based on it. If the new selected candidate loses on validation, retain and report its registered result without retuning; the coordinator decides demo release status transparently. Test measurements/outcomes are forbidden.

Return results/sparse_stuck_followup/ with manifest, all paired outcomes, correctness and selection evidence, and docs/tasks/008-handoff.md. No UI/Git edits. E5's earlier sensor-ablation evidence remains explicitly tied to its original selected control and must not silently be attributed to a different detector.
