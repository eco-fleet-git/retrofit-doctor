# Task015 — source-specific diagnosis comparison in the local demo

Prepared 2026-11-07 while research is running. NOT implementation authorization yet. Start after the coordinator reviews a passing train candidate and Task014 descriptive validation. English product, existing approved light style; no further paid UX Pilot call. Claude is sole code writer. Target45-minute useful slice, with focused data/clock tests and desktop/mobile smoke.

## Outcome

An engineer should understand in under a minute: what the earlier B1 rule suggested, what the selected method now suggests, which measured evidence supports the change, why it is still uncertain, and the next check. Show the actual verified comparison and a counterexample, not just a favorable anecdote. The existing four-screen baseline demo remains usable. No test telemetry/predictions or frozen-release changes.

Prefer a compact new local route, `#/diagnosis`, linked from navigation and Evidence. It may use a dedicated generated evidence bundle rather than destabilizing the existing long replay bundles. Keep original validation replays byte-identical unless a separate explicit change is needed. A new comparison route is research evidence, not a silent production-detector replacement.

## Data and time contract

Read only the sealed selected train/validation artifacts and the exact allowed train source inputs needed for demonstrated cases. Export provenance (selected candidate, code/manifest hashes, input projection/run paths), dataset/split, alert minute start/end, original B1 output, candidate output, full rule_detail and waveform provenance. Keep evaluation labels in a separate opt-in overlay. An explanation helper receives only an as-of-sliced case and static metadata, never retrospective labels or unrestricted full replay data.

Show one genuinely changed sensor case if the selected result has one, one UNKNOWN refinement if present, and one explicit unsupported/unchanged case. The coordinator supplies exact case IDs after reviewing results. Do not invent a gain where the selected method did not change the diagnosis. Report all26 train events separately from the9 validation events. State synthetic, adaptively developed on inspected training assets; validation is already inspected/development-informed. No failure probability, independent-test accuracy, field ROI or certification claim.

Provide before/at-alert time controls that actually gate data and hypotheses. At alert minus1 second, the just-closed-minute analysis is unavailable. At alert time it appears; moving later must not rewrite its historical evidence. Snapshot evidence must be completed before that alert, with age and freshness explicit. Raw rows exactly at minute end belong to the next minute. No future reference or sample count leakage.

## Explanation content (depends on actual diagnosis source)

Do NOT reuse baseline explain.js's 'deviating alone / coupled |z|<2' description for a residual or waveform rule.

For a residual noise hypothesis, lead with a sentence such as: 'The flow signal varies more than the pump-equation check can explain; inspect the flow measurement before assuming a mechanical fault.' Use the actual source channel, never hardcode flow. Then show measured Q/Ps/Pd/RPM in native units, paired sample count and time; derived residual std versus empirical reference in kPa; and actual rank/factor decision. For empirical variants, label tail_rank as a reference-tail rank, NOT p-value/probability. Covariance shares are mathematical decomposition terms, not causal-confidence percentages. Keep exact equation, all covariance terms, shares, assumptions, NPSH/curve applicability and B1 anomaly score in technical details.

A small chart may compare the synchronized measured pressure rise with the curve-derived rise over the demonstrated closed minute, both kPa, and/or the derived residual. Label measured versus calculated explicitly; do not call the predicted curve a measured healthy band or zero a safety limit. If raw values are included, export only the corresponding authorized closed minute and provenance. Explain that dynamics, a wrong curve and installation geometry remain alternatives; recommend checking synchronized traces and an independent instrument before replacing a sensor.

For W1, show 1x/2x or BPFO evidence from the actual completed snapshot, the empirical reference support, speed comparability and age. Explain a pattern consistent with the named cause, not a confirmed diagnosis. The next engineering check should discriminate the alternative (e.g. coupling alignment with additional direction/phase measurement). A radial snapshot alone is not definitive.

For unsupported cases, name the exact missing input/applicability reason. 'Not assessed by this method' must not become healthy or proven sensor failure. Link required measurements to the existing inventory/retrofit proposal; if the measurements already exist, recommend reusing/synchronizing them, not purchasing unnecessary equipment. Availability is a capability argument, not demonstrated economic value.

## Comparison and review

Lead the result table with correct causes and correctly localized sensor faults, alongside detected events and false/repeated alerts. Separate train and descriptive validation, retain B1 values, expose scope/denominators and every gain/loss through an accessible details view. Explain if validation is unchanged. Preserve rejected candidate evidence and the known frozen-release exposure caveat. Never turn the anomaly score into confidence in the new cause.

Verify selected artifact hashes/metrics, no unauthorized split in bundle, source-specific explanations, before/at-alert boundary, older-alert stability, future/label mutation invariance, missing measurements, unsupported state, baseline route regressions and keyboard/mobile layout. Use meaningful focused tests, not an unrelated full test sweep. Screenshot actual1440 and390 layouts, no horizontal overflow. Return handoff with exact commands/results and known limits. Codex performs independent review and Git/push; no user visual acceptance may be claimed without the user.
