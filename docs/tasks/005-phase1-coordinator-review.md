# Task005 phase-1 coordinator review

2026-11-07. Reviewed revision 2 before any E3 scoring. Independently ran the 48 focused fixtures: all passed. Inspected the implementation and proposed manifest, including separate amplitude steadiness, preserved quality-rule steadiness, installed/observed input checks, valid scales, removal of pressure from the transferable prior, and explicit prior provenance. The corrected implementation addresses round 1.

Proceed with phase 2: implement the registered E3 evaluator, freeze the final runner/manifest/model hashes before its first candidate evaluation, then run only R0/R1/R2 on train. Apply all registered correctness and non-regression gates; validation only for a passing selected candidate. No additional definitions or searches. Preserve previous seals and disclose all outcomes. E4 remains not testable under this design; P1/P2 are fixture-only and must not be scored.

Evaluator review requirements: keep the original 26-event denominator; UNKNOWN cannot inherit correctness from an alternative type. Confidence abstention is an offline, event-matched descriptive comparator, not a deployable policy: the selection of first assigned diagnoses uses evaluator matching. Label it accordingly. R1's AVAILABLE-minute restriction is likewise a descriptive common-window comparison, not proof of equivalent operational coverage (quality alerts can occur outside AVAILABLE). Report coverage losses explicitly. The handoff must expose per-event matching, useful/type-only delays and gate results for focused coordinator verification.

This is an internal experiment gate under the user's existing authorization, not the final blind-test release gate. Test measurements remain inaccessible.
