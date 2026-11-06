# Task005 E3/E4 — findings (2026-11-07)

All data is synthetic; train only, under the approved manifest revision 2. **No E3 candidate passed the registered gates, so R0 (unchanged causal B1, the released control) is retained. Validation was not run.** E4 was not testable (option A) and was not scored. No test content was read.

- **Exposure:** train outcomes of earlier detectors were already known, and validation had been inspected before. Everything here is development-informed and descriptive.
- **Freeze:** runner, model, approved manifest and inputs were hashed in `frozen.json` before the first candidate evaluation. Nothing was changed after outputs existed, and there was no rerun.

## Train results (7 independent held-out-asset replays, 26 observable events, 49 asset-days, official scorer)

| ID | Composite | Det. | Type | Class | False+excess | Sensor type+channel | Gate failures |
|---|---:|---:|---:|---:|---:|---:|---|
| R0 | 59.20719120527966 | 18 | 8 | 14 | 6 (3+3) | 3 | hash-seed nondeterminism (control; reported) |
| R1 | 59.18900594380296 | 18 | 8 | 14 | 6 | 3 | hash-seed nondeterminism; causality failures = 10 |
| R2 | 58.24565274374120 | 18 | 7 | 14 | 6 | 2 | hash-seed nondeterminism; causality failures = 10; type < 8 |

R0 equals the causal-B1 train report exactly, both composite and predictions (parity = True).

## Correctness-gate failures, diagnosed read-only after the run

**1. Hash-seed nondeterminism — affects the released control R0 as well.**

- PYTHONHASHSEED 0 and 9 agree; seeds 1 and 7 differ (`determinism.json`).
- The cause is AUDIT A03: B1 `diagnose` iterates a Python set. On train this changes **scored fields**:

| Alert | Seed 0 / 9 | Seed 1 and 7 |
|---|---|---|
| PUMP-02 2025-12-03 06:31 | SENSOR_CALIBRATION_SHIFT, `vibration_accel_rms_g` | SENSOR_NOISE_SPIKES, `suction_pressure_kpa` |
| PUMP-02 ~22:06 | `motor_winding_temp_c` | seed 7 only: `suction_pressure_kpa` (seed 1 matches seed 0) |

- The audit had shown this only as an evidence change on a probe. Here it changes a fault type on benchmark data.
- **Release consequence:** every released or causal-B1 result is reproducible only with PYTHONHASHSEED=0 pinned, as all runs so far have been. The blind-export runner must enforce that pin. The detector is not seed-invariant.

**2. Causality failures = 10 (R1 and R2).**

- These are 4 PUMP-03 cutpoints and 1 PUMP-04 cutpoint per candidate; prefix and future-mutation comparisons fail together.
- Alert times, types, confidence, rule and detail are identical. The only difference is a missing channel stored as `NaN` (full run) versus `None` (prefix run), which comes from pandas dtype inference in the frozen runner's `suspected_channel` column.
- This is the same representation defect class as Task002 r1. It is **not a time leak**, but the gate is recorded as failed.
- It was not fixed or rerun: the registered seed gate rejects every candidate on its own, so a correction could not change the selection, and a post-outcome rerun would need a new disclosed run ID.

## H2 — R1 regime gate: NOT SUPPORTED

- **Nuisance in benign windows** (12,510.9 benign minutes): R0 2 → R1 2, no reduction.
- **Burden:** false+excess 6 → 6. Unmatched bursts are the same 3 (R1's are each one minute later).
- **Coverage lost:** 1,399 minutes INSUFFICIENT_REGIME_SUPPORT and 2,442 TRANSITION minutes (of 70,560), in the R1 diagnostic-status output. These are not counts of every channel having a usable R0 reference.
  - The large TRANSITION count suggests the speed ratio flickers across 0.05 bin edges. That is an observation, not a tested cause.
  - Several R1 alerts move by 1 minute or more because transitions break the shared run counter.
- **Per-event** (`train_paired_events.csv`):
  - Newly detected: PUMP-01-E04, but with the wrong type (CALIBRATION_SHIFT instead of STUCK).
  - Lost: PUMP-04-E03 (R0 had it with the wrong type).
  - First useful diagnosis delay: PUMP-01-E01 got a correct-type diagnosis 28.1 h after detectable instead of 39.5 h, and PUMP-04-E02 70.1 h instead of 82.1 h; first alerts were otherwise unchanged. PUMP-01-E02 0.9 h later.
- **Common-window comparison** (descriptive, not proof of equivalent operational coverage):

| R1 status at R0's alert minute | R0 alerts |
|---|---:|
| AVAILABLE | 39 |
| INSUFFICIENT_REGIME_SUPPORT | 2 |
| GATEWAY_GAP | 1 |
| TRANSITION | 1 |

  R0 restricted to AVAILABLE detects 17 events with 7 correct types and 6 false+excess; R1 detects 18 with 8 types and 6 false+excess. Nuisance burden did not improve. Paired timing changes above remain visible, but they do not establish an overall diagnostic improvement.

## H6 — R2 abstention: NOT SUPPORTED

- **Coverage:** anomaly-alert coverage is unchanged (18 detected, identical alert times and classes). Specific-diagnosis coverage drops from 16 to 15.
- **Which diagnosis was dropped:** the only abstention among first diagnoses hit a **correct** diagnosis. PUMP-03-E02 SENSOR_CALIBRATION_SHIFT on `discharge_pressure_kpa` became UNKNOWN via `abstain_sensor_coupled`: PUMP-03 is T0 and has only one coupled channel. Correct types fell 8 → 7; wrong specific first diagnoses stayed at 8.
- **Confidence comparator** (offline, event-matched, descriptive; not deployable): relabelling R0's single lowest-confidence specific first diagnosis (PUMP-01-E03) gives the same 7 correct / 8 wrong / 15 specific. R2's rule shows no advantage over plain confidence ranking.
- **No inherited credit:** UNKNOWN received no type or channel credit from its stored alternative; the evaluator test enforces this.

## H3 — E4 cold-start / contaminated reference: NOT TESTABLE (option A)

- **Feasibility:** zero supported prior channels in 7/7 LOAO folds, both pre-review and with corrected inputs (`prior_feasibility*.json`).
- **Status:** P1 and P2 exist only as fixture-tested prototypes with explicit fleet-prior provenance. They were never scored.

## Strata (identical across R0/R1/R2 except where noted)

| Stratum | Events | Detected | Correct type |
|---|---:|---:|---:|
| Pre-existing | 4 | 3 | 1 |
| 0–24 h (detectable within the first day) | 7 | 6 | — |
| Later | 19 | 12 | 7 (R2: 6) |

- No unmatched bursts occurred in 0–24 h; all 3 are later.
- **Useful diagnosis delay** (correct emitted type, plus the correct channel for SENSOR events) is reached for 11 of 26 events (R2: 10). It is reported per event separately from first correct-type delay. Missed useful diagnoses: 15 (R2: 16).

## Artifacts

All files are in `results/regime_reference/`:
- `frozen.json`, `selection.json`, `train_selection_table.csv`
- `train_paired_events.csv` (wide, per event: emitted / original type, rule, channel, first alert, correct-type and useful delays) and `train_paired_events_long.csv`
- `train_comparisons.json`, `train_status_minutes.csv`, `train_unmatched_bursts.csv`
- `train_causality_audit.csv` (324 rows), `determinism.json`, `train_report_R*.json`
- `train_run.log`, `tests_phase2.log`, and the feasibility files
