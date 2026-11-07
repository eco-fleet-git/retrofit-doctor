# Task011 phase-1 approval

2026-11-07, before the first Task011 benchmark score. Codex reviewed the new rule module, runner, fixtures and exact prospective manifest. Review corrections in 011-review-round1.md preserve candidate definitions and thresholds. Task010 code/results remain unchanged.

Codex independently ran tests/test_noise_unresolved.py with startup seed0: **31 passed in33.70s**. The tests cover isolated versus coupled variability, ambiguity/missing/invalid inputs, outlier boundary, protected gateway, UNKNOWN-only waveform scope, full-evidence prefix/future invariance, runner/refusal and selection behavior. They do not establish field accuracy.

Approve manifest SHA-256 `4a365967643fd63fa2757e870cc78df5ba5d88cd491551dead014c08712acccc` for one train-only wave: B1/Q1/Q2/U1/U2, seven independent causal replays, no fitting, same26-event/49-asset-day denominators and unchanged improvement gate. Preserve every negative and every correctness failure; no parameter changes after scoring. Validation and test remain excluded. Report results before a separate coordinator decision on a descriptive validation check or UI integration.

Confidence retained on reclassified rows is B1's anomaly score, not confidence in the new cause. Explain actual spread evidence and alternative real process variation. This wave is adaptive development informed by previous train outcomes; it is not new independent validation.
