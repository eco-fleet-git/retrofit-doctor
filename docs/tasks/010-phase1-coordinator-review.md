# Task010 phase-1 decision — approve one train-only wave

2026-11-07, before any candidate benchmark score. Codex reviewed the diagnosis module, runner, prospective manifest and meaningful fixture tests. Review corrections are recorded in 010-review-round1.md and 010-review-runner.md.

Evidence: Codex independently ran the 38 signal/input/causality tests (all passed, 22.86 s). Claude ran the 18 runner fixtures (all passed) and the combined 56 tests (all passed, 104.16 s). The runner fixture verifies that deliberately restoring the B1 waveform-provenance mismatch is detected. The code-hash selfcheck passed. No field validation is implied.

Approved manifest SHA-256: `8eda43e1463843f8da30f5b2f24e5ce300e70d856dadef22125a405f5f6bae6a`.

Execute the six registered candidates plus B1 control, seven actual leave-one-asset-out fits, once with seed 0. Keep original 26-event/49-asset-day denominators, full negative outcomes and all correctness failures. The success/selection gates are unchanged. Preserve each partial run if infrastructure or implementation fails; any repair must be disclosed, reviewed and newly hashed, without changing scientific definitions to fit observed scores.

This is adaptive research on an already inspected training set. Held-out fold labels do not enter that fold's model, but the overall development process has prior training-result exposure. Validation08/09 is development-informed and requires a sealed passing candidate before one descriptive check. Test10–12 and the earlier release remain excluded and unchanged. No validation run or UI promotion is authorized by this phase decision alone; report results for coordinator review first.

Known scope limits: rare fault types with fewer than two events on two fit assets cannot be learned; empirical first-day references may already contain faults; one radial waveform and a four-hour snapshot interval do not establish a physical root cause. Learned scores are uncalibrated. The existing B1 hash-order limitation is handled by startup seed0, not claimed solved. Clinical-style certainty, certification and field ROI are outside this experiment.
