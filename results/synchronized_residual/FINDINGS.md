# Task013 findings — INCOMPLETE: partial run failed in the raw-aggregation audit

2026-11-07. Sealed manifest `4e673ca2…19a9`, seed 0. Attempt `run-20261107T093222280839Z` **exited with code 1**. The background-task wrapper reported 0 only because the command ended with `echo`; `train_stdout.log` is empty and `train_stderr.log` holds the traceback.

**Status: no candidate is selected and no correctness claim is made.** The attempt is preserved unchanged. `COMPLETED.json` was not written. No code was changed after scoring.

## What failed

- **Where:** `raw_audit` → `mutate_raw_future` (`scripts/run_synchronized_residual.py` line 131).
- **Error:** `TypeError: Cannot setitem on a Categorical with a new category (STOPPED)`.
- **Cause:** the real 1 Hz parquet loads `operating_mode` as a pandas Categorical without the category "STOPPED". The synthetic fixtures used plain strings, so this test-harness mutation step was never exercised with a categorical column.
- **Steps not run:** the independent raw-aggregation audit, the fresh-process determinism check, `comparison.csv`, `run_summary.json` and `COMPLETED.json`.

## Checks that did complete (before the failure)

- **Raw inputs:** loaded for PUMP-02, PUMP-04 and PUMP-07 only (604,800 rows each). The other four assets were skipped with explicit capability reasons, because their required channels aren't installed:

  | Asset | Missing channels |
  |---|---|
  | PUMP-01 | flow |
  | PUMP-03 | suction pressure, flow, speed |
  | PUMP-05 | suction pressure, flow, speed |
  | PUMP-06 | flow, speed |

- **Aggregation:** 10,080 minutes per loaded asset, 0 invalid minutes. Minutes with ≥30 paired rows: PUMP-02 9,351, PUMP-04 8,742, PUMP-07 8,258.
- **Full-evidence causality audit (Task010 cut set):** 0 failures in 196 prefix + 196 future-mutation checks for each of the 7 configurations. The mutation covered means, std, counts, snapshots and future residual statistics.
- **Not yet verified:** control equality, emission equality and the control-metric checks are computed in the runner but not yet saved to `run_summary.json`. The comparison below shows control metrics equal to the expected 18 / 8 / 14 / 3 / 3 / 3.

## UNCHECKED comparison (`comparison_unchecked.csv`; must not be treated as a selection)

| Candidate | Composite | Detected | Correct type | Correct class | False | Excess | Nuisance | Sensor type+channel | Useful | UNKNOWN first | Wrong specific first | Gate metrics |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| B1 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | fail |
| R3 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | fail |
| R5 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | fail |
| E995 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | **4** | 9 | 2 | 7 | **pass (type ≥9 and sensor TC ≥4)** |
| Y3 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | fail |
| Y5 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | fail |
| Z995 | 61.13 | 18 | **10** | 14 | 3 | 3 | 2 | **4** | 10 | 1 | 7 | **pass (type ≥10)** |

**Per-event changes against B1:**
- **R3/R5:** none.
  - 24 alerts were `residual_not_excessive`; 14 were applicability `input_unavailable_flow_m3_h`; 3 were `curve_mismatch`; 2 were protected.
- **E995:** gain at PUMP-04-E03 (SENSOR_NOISE_SPIKES, tag flow_m3_h).
  - B1 said SENSOR_CALIBRATION_SHIFT on motor_winding_temp_c; E995 emitted SENSOR_NOISE_SPIKES on flow_m3_h, correct in type, class and channel.
  - Evidence at 2025-06-18 22:06: N = 1431 reference minutes, b = 0, tail rank 0.000698 ≤ 0.005, reference median 3.45 kPa.
  - Shares: flow 0.763, discharge 0.138, suction 0.103, speed −0.004. Flow spread z = 26.3.
  - The other 23 applicable alerts were `residual_not_in_empirical_tail`. No losses.
- **Y3/Y5:** gain at PUMP-02-E02 MISALIGNMENT (UNKNOWN → MISALIGNMENT through W1). No losses.
- **Z995:** both gains (PUMP-04-E03 and PUMP-02-E02). No losses, and false, excess and nuisance are unchanged.

Under the registered tie order, Z995 would be the candidate to select, **but only if every correctness check passes**. That is not established.

## Required before any selection

The fix is to the audit harness only, not to any scientific definition:
- In `mutate_raw_future`, cast `operating_mode` to object, or add the category, before writing "STOPPED".
- Add a fixture with a categorical `operating_mode`.

This changes a hashed file. It therefore needs a disclosed repair, coordinator review, a re-hashed manifest and a new seal. After that, a new attempt directory runs the full registered train run, including the raw audit and determinism. The failed attempt is never overwritten.
