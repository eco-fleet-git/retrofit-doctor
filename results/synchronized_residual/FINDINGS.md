# Task013 findings — synchronized hydraulic residual (train), completed by audit-only recovery

2026-11-07. Sealed manifest `4e673ca2…19a9`, seed 0, train PUMP-01..07, seven independent causal replays, nothing fitted, 26 scored events over 49 asset-days. All data is synthetic; this is adaptive development on an inspected train set. No validation or test data was touched.

**Result: Z995 passes the registered train gate and every correctness check, and is the registered selection.** E995 also passes. This is a train-only development result, not field validation. Validation is governed separately by Task014 and still requires coordinator review.

## Run history: the original failure and the recovery

1. **Original attempt** `run-20261107T093222280839Z` **exited with code 1.**
   - It wrote provenance, predictions, unchecked scores and the full prediction causality audit.
   - It then failed in `raw_audit`: the original `mutate_raw_future` assigned future `operating_mode='STOPPED'` to a pandas Categorical that lacked that category (TypeError).
   - This was a test-harness representation defect. The synthetic fixtures had used plain strings.
   - The background wrapper reported 0 only because of a trailing `echo`. The original stdout/stderr logs are preserved.
2. **Audit-only recovery** (`docs/tasks/013-audit-recovery.md`, recovery manifest `15eb5a39…d5ed`, coordinator `RECOVERY_SEAL`).
   - New script: `scripts/recover_synchronized_residual_audit.py`. Command run standalone, exit code 0, 37.4 s.
   - No sealed code, manifest, SEAL or saved artifact was changed, and no training or scoring was rerun.
   - The only repair: a copy of `operating_mode` is cast to object before the unchanged original mutation.
   - The final comparison is the original unchecked metrics with the verified correctness flags attached, selected by the original `select()`.
   - Added files: `raw_aggregation_audit.csv`, `determinism.json`, `comparison.csv`, `run_summary.json` (labelled audit-only recovery, not an uninterrupted exit-0 run), `recovery_provenance.json` and `COMPLETED.json`. `comparison_unchecked.csv`, predictions, per-event files and the causality audit are byte-identical.

## Correctness checks (all passed)

| Check | Result |
|---|---|
| Original files | Every file of the original attempt, the manifest, SEAL and code hashes verified by SHA-256 |
| Control | Equals the saved causal B1; metrics 18 / 8 / 14 / 3 false / 3 excess / 3 sensor TC over 26 events |
| Emission multiset | Equal to the control for all 7 configurations |
| Full-evidence causality | 0 failures in 392 checks per configuration, 7 × 392 = 2,744 (196 prefix + 196 future mutation of means, std/min/max, counts, snapshots and future residual statistics) |
| Raw aggregation | 0 failures in 30 checks: PUMP-02/04/07, each with 3 reference-boundary cuts (−1/0/+1 s), 1 alert boundary and 1 sub-minute cut, as prefix and future mutation; 57,148 closed minutes compared, all statistics incl. counts |
| Input re-verification | Train input, raw (604,800 rows each for PUMP-02/04/07) and aggregation hashes identical to the original provenance |
| Determinism | A fresh seed-0 process reproduced the original prediction hash of every configuration |

## Comparison (original metrics; correctness flags verified)

| Candidate | Composite | Detected | Correct type | Correct class | False | Excess | Nuisance | Sensor type+channel | Useful | UNKNOWN first | Wrong specific first | Gate | Correctness |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| B1 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | fail | pass |
| R3 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | fail | pass |
| R5 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | fail | pass |
| E995 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | 4 | 9 | 2 | 7 | **pass** | pass |
| Y3 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | fail | pass |
| Y5 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | fail | pass |
| **Z995** | **61.13** | 18 | **10** | 14 | 3 | 3 | 2 | **4** | **10** | 1 | 7 | **pass** | pass |

**Selected (registered order: useful, type, burden, then R3 < R5 < E995 < Y3 < Y5 < Z995): Z995.** It has more useful diagnoses and correct types than E995.

## Per-event gains and losses against B1

**R3 / R5:** no changes.
- 24 applicable alerts were `residual_not_excessive`.
- 14 were `applicability:input_unavailable_flow_m3_h`.
- 3 were `applicability:curve_mismatch`.
- 2 were protected.

**E995:** one gain, no losses.

| Field | Value |
|---|---|
| Event | PUMP-04-E03 SENSOR_NOISE_SPIKES on flow_m3_h, alert 2025-06-18 22:06 UTC |
| B1 said | SENSOR_CALIBRATION_SHIFT on motor_winding_temp_c |
| E995 says | SENSOR_NOISE_SPIKES on flow_m3_h — correct type, class and channel |
| Reference | N = 1,431 first-day minutes, b = 0, tail rank 0.000698 ≤ 0.005, median 3.45 kPa |
| Covariance shares | Flow 0.763, discharge 0.138, suction 0.103, speed −0.004 |
| Flow spread z | 26.3 |
| Other applicable alerts | 23, all `residual_not_in_empirical_tail` |

**Y3 / Y5:** one gain, PUMP-02-E02 MISALIGNMENT (B1 UNKNOWN → W1 MISALIGNMENT). No losses.

**Z995:** both gains (PUMP-04-E03 and PUMP-02-E02). No losses, no change to false, excess or nuisance alerts, and wrong-specific-first falls from 8 to 7.

## Caveats (must accompany any use of this result)

- **Narrow attribution margin.** The decisive flow share is 0.763, only 0.013 above the registered 0.75 minimum. A small change in the data, the curve or the noise would flip the single sensor-localization gain back to B1. Robustness was not tested and must not be tuned after this score.
- **One event per gain.** Each of the two gains rests on a single train event. Gate passage depends on both, and the waveform gain is the same one seen in Tasks 010–012.
- **Selection after many waves.** This is the first passing candidate after several negative waves on the same inspected train set, so it is development-informed, with real selection exposure.
- **Coverage.** The residual rule applies only where flow, suction pressure and measured speed are installed: 3 of 7 train assets (PUMP-02/04/07).
- **Not probabilities.** Covariance shares are a variance decomposition, not causal probabilities. The tail rank is not a fault probability, valid p-value or calibrated false-alarm rate. Confidence is B1's anomaly score.
- **Alternative explanations.** A strong residual can come from dynamics or a wrong curve, and one radial waveform axis is consistent with, not proof of, misalignment.
- **Failed first process.** Completion followed an initial failed process plus an audit-only recovery.

## Artifacts

All files are in `run-20261107T093222280839Z/`:
- `comparison.csv`, `comparison_unchecked.csv`, `per_asset.csv`
- `per_event_*.csv`, `unmatched_*.csv`, `predictions_*.csv` (full `rule_detail`)
- `applicability_coverage.csv`, `waveform_and_fallback.csv`
- `run_provenance.json`, `causality_audit.csv`, `raw_aggregation_audit.csv`
- `determinism.json`, `run_summary.json`, `recovery_provenance.json`

Logs: `train_stdout.log` / `train_stderr.log` (original, failed) and `recovery_stdout.log` / `recovery_stderr.log`. `COMPLETED.json` is marked as audit-only recovery.

## Coordinator decision

`docs/tasks/013-coordinator-review.md` reviewed the recovered result and froze **Z995** as the sole candidate for Task014 descriptive validation. E995 and the runners-up are not evaluated on validation. The default UI and the test release are unchanged.
