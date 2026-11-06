# Task 005 handoff — E3 executed, E4 not testable (final)

Date 2026-11-07. Implementer: Claude Code (sole writer). Status: **complete. No E3 candidate passed, so R0 (unchanged causal B1) is retained. Validation was not run. E4 is not testable (option A) and was not scored.**

What did not change:
- No Git, web or test-data access.
- No earlier seal was modified: `causal_b1.py` is still `c637e0f8…`, `causal_b2.py` `9976d47a…`, and the Task002 `selection.json` `15948cb2…`.

Report: `results/regime_reference/FINDINGS.md`. Phase-1 history: the round-1 review (`005-review-round1.md`) and its approval (`005-phase1-coordinator-review.md`).

## Sequence

| Step | Time (UTC) |
|---|---|
| Phase 1 (revision 2): definitions + 48 fixtures | reviewed and approved |
| Phase 2 code: evaluator, runner modes, 3 evaluator tests; manifest status → APPROVED (wording only: comparator and common-window labels) | before freeze |
| `freeze`: hashed runner, model, manifest, controls and inputs | 2026-11-06T23:16:44Z |
| `train`: 33.6 s | sealed 23:17:18Z |
| `validate`: refused, no deployable candidate | after seal |

The freeze happened before any candidate evaluation. No code or definition changed after outputs existed.

## Commands (PYTHONHASHSEED=0, PYTHONDONTWRITEBYTECODE=1, `../../work/.venv/bin/python -B`)

```
pytest -v -p no:cacheprovider tests/                       → 147 passed (48 regime fixtures + 3 evaluator)
scripts/run_regime_reference.py freeze
scripts/run_regime_reference.py train
scripts/run_regime_reference.py validate                   → "No E3 candidate passed train gates; validation is not run"
```

Evaluator mutation check: useful delay ignoring the channel → 1 test fails (reverted).

## Gate results (train)

| ID | Det. | Type | Class | False+excess | Seeds 0/1/7/9 | Causality (162 stored cutpoints, prefix + future mutation) | Pass |
|---|---:|---:|---:|---:|---|---|---|
| R0 | 18 | 8 | 14 | 6 | **differ** (0 = 9 ≠ 1, 7) | parity with causal B1 = True | control |
| R1 | 18 | 8 | 14 | 6 | **differ** | **10 failures** | no |
| R2 | 18 | **7** | 14 | 6 | **differ** | **10 failures** | no |

### For focused verification

1. **Seed nondeterminism changes scored fields in the released control.** On train, PUMP-02 2025-12-03 06:31 is SENSOR_CALIBRATION_SHIFT on `vibration_accel_rms_g` with seeds 0 and 9, but SENSOR_NOISE_SPIKES on `suction_pressure_kpa` with seeds 1 and 7. Seed 7 also changes a second alert's channel. The cause is AUDIT A03, B1's set-ordered `diagnose`.
   - **Action for the release gate:** blind export must enforce PYTHONHASHSEED=0, as all earlier runs did. The released detector is not seed-invariant. This was a pre-existing property, newly measured here.
2. **The 10 causality failures** are `suspected_channel` stored as `NaN` in the full run and `None` in the prefix run, with identical alerts. This is the Task002 r1 representation defect class in the frozen runner, not a time leak.
   - It was not fixed and not rerun, because the registered seed gate rejects every candidate on its own.
   - The rows are in `train_causality_audit.csv`; the failing cutpoints are on PUMP-03 (×4) and PUMP-04 (×1) for each candidate.
3. **Per-event matching:** `train_paired_events.csv` holds, for each of the 26 events and each candidate:
   - emitted type, class and channel, and the original B1 type and rule;
   - first alert time;
   - first correct-type delay and first useful delay (channel required for SENSOR events).

   The replicated burst→event assignment is asserted equal to the official `per_event` for every candidate.

## Hypotheses

- **H2 (R1): not supported.**
  - Benign nuisance stayed 2 → 2 over 12,510.9 benign minutes, and burden stayed 6 → 6.
  - Coverage lost: 1,399 INSUFFICIENT_REGIME_SUPPORT minutes and 2,442 TRANSITION minutes.
  - Per event: newly detected PUMP-01-E04 with the wrong type; lost PUMP-04-E03.
  - Common-window comparison (descriptive): R0 at R1-AVAILABLE minutes detects 17 events with 7 correct types and 6 false+excess; R1 detects 18 with 8 types and 6 false+excess.
- **H6 (R2): not supported.**
  - Its single abstention among first diagnoses turned a **correct** PUMP-03-E02 calibration shift into UNKNOWN, because that T0 asset has only one coupled channel.
  - Correct types fell 8 → 7; wrong specific first diagnoses stayed at 8. Specific coverage went 16 → 15; anomaly coverage stayed at 18.
  - The offline confidence comparator gives the same 7/8/15, so R2 shows no advantage.
- **H3 (E4): not testable** with the registered prior. Zero support in all folds. P1/P2 are fixture-only.

## Unresolved limits

- **Not measured:** useful-delay medians are not claimed, since only 10–11 of 26 events reach a useful diagnosis. There is no streaming or restart test.
- **Unexplained transition count:** the R1 TRANSITION count suggests the speed ratio flickers across 0.05 bin edges. This is an observation, not a tested cause.
- **Prior exposure:** all train outcomes of earlier detectors were known to the implementer.

## Next action (main chat)

1. Review and commit.
2. Keep R0 / causal B1 as the release detector, with PYTHONHASHSEED=0 enforced and verified in the Task007 export runner.
3. Any seed-invariant B1 diagnosis would be a new registered change to the released detector, with its own train check. It is not part of this task.
