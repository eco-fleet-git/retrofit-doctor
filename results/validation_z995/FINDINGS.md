# Task014 findings — descriptive validation of frozen Z995 vs causal B1 (PUMP-08/09)

2026-11-07. One sealed run: `run-20261107T094945244932Z`, manifest `a63f145d…8e39`. Command run standalone, **exit code 0**, 120.2 s, seed 0. All data is synthetic.

**This is previously inspected validation, so it is a descriptive non-regression check, not blind evidence.** Only Z995 and B1 were evaluated. No runner-up, no tuning, nothing fitted, no test data, release or UI change.

**Result: Z995 passes every predeclared adoption condition.** Correct types rise from 4 to 5 with no regressions. The gain comes entirely from the UNKNOWN-only W1 waveform fallback. The synchronized-residual rule was not applicable on either validation pump.

## Correctness (all passed)

- **Control:** B1 equals the saved validation predictions semantically, with every expected metric. Detected 8, type 4, class 8, false 1, excess 0, sensor type+channel 2 (non-gateway 1), 15 alerts, 9 events, composite 76.01253946421124 exactly.
- **Official reports** (`report_B1.json`, `report_Z995.json`): split validation, assets PUMP-08/09, 14.0 asset-days.
- **Emission:** the Z995 alert set equals B1's (15 alerts at identical times).
- **Full-evidence causality:** 0 failures in 138 checks per configuration (69 prefix + 69 future mutation of means, std/min/max, counts, snapshots and residual statistics).
- **Raw-aggregation checks: 0 performed.** Neither pump has the full residual instrument set, so no raw telemetry was loaded. The raw audit had no eligible asset. This is a coverage fact, not a pass.
- **Determinism:** a fresh seed-0 process reproduced both prediction hashes.
- **Train gate:** the frozen Task013 evidence still shows Z995 passing and selected.

## Comparison (9 events, 14 asset-days)

| Metric | B1 | Z995 |
|---|---:|---:|
| Composite | 76.01 | 78.79 |
| Detected | 8 | 8 |
| Correct type | 4 | **5** |
| Correct class | 8 | 8 |
| False / excess | 1 / 0 | 1 / 0 |
| Nuisance (benign) | 1 | 1 |
| Sensor type+channel (non-gateway) | 2 (1) | 2 (1) |
| Specific first diagnoses: correct / claimed | 4 / 7 | 5 / 8 |
| Wrong-specific first | 3 | 3 |
| Wrong-channel claims (among non-gateway sensor hits) | 1 of 2 | 1 of 2 |
| UNKNOWN first diagnoses | 1 | 0 |
| Alerts | 15 | 15 |

**Adoption gate:** all twelve conditions pass, including both preservation conditions (no B1-correct type or sensor type+channel event lost) and the wrong-specific (3 ≤ 3) and wrong-channel (1 ≤ 1) guards.

## Event transitions (all 9 events in `event_transitions.csv`)

**Only one event changed:** PUMP-08-E02 BEARING_WEAR.
- B1's first diagnosis was MACHINE / UNKNOWN; Z995 says BEARING_WEAR, correct.
- The W1 rule refined the B1 UNKNOWN from a completed radial snapshot showing a BPFO envelope line above the local floor and above commissioning.
- Z995 re-labelled 3 PUMP-08 alerts, all B1 UNKNOWN → BEARING_WEAR by W1 (2025-09-11 20:47, 09-13 13:07, 09-14 04:09).
  - Snapshot ages were 13,177 s, 14,377 s and 10,897 s, within the 4 h limit; the second is close to it.
  - The re-labelling created no new false or excess alerts.

**Unchanged events:**
- Still correct: PUMP-08-E01, PUMP-08-E03 (gateway), PUMP-09-E02, PUMP-09-E03 (stuck, correct channel).
- Still wrong (same diagnosis as B1):
  - PUMP-09-E04 SENSOR_DRIFT on motor_current_a, diagnosed as calibration shift on vibration_rms_mm_s (wrong channel).
  - PUMP-09-E01 MISALIGNMENT, diagnosed as IMBALANCE.
  - PUMP-09-E06 AIR_ENTRAINMENT, diagnosed as SUCTION_STRAINER_CLOGGING.
- Still missed: PUMP-08-E04 SENSOR_NOISE_SPIKES on discharge pressure.

**Per asset:**
- PUMP-08: type 2 → 3.
- PUMP-09: unchanged. Its false episode and its nuisance alert are the same as B1's.

## Applicability coverage (Z995, 15 alerts)

| Asset | Outcome | Alerts |
|---|---|---:|
| PUMP-08 | Residual unsupported: `input_unavailable_flow_m3_h` (no flow meter); W1 emitted | 3 |
| PUMP-08 | Same residual reason; exact B1 | 2 |
| PUMP-08 | Protected (stale waveform) | 1 |
| PUMP-09 | Residual unsupported: `input_unavailable_motor_speed_rpm` (no speed); exact B1 | 8 |
| PUMP-09 | Protected | 1 |

**Raw capability:** PUMP-08 lacks flow and PUMP-09 lacks speed, so neither raw partition was read.

**Waveform:** FRESH at 13 of 15 alerts; 1 STALE.

## Interpretation and limits

- **Validation result:** a modest non-regression improvement (type 4 → 5, UNKNOWN 1 → 0, nothing lost). It comes from W1's UNKNOWN-only waveform refinement, not from the new residual noise localization. The residual rule received no validation exercise, and its train evidence (one PUMP-04 event, flow share 0.763 vs 0.75) remains its only support.
- **Instrumentation coverage:** the residual rule needs flow, suction pressure and measured speed. 3 of 7 train pumps and 0 of 2 validation pumps have all three, which is a retrofit-capability limit.
- **Waveform evidence:** single-axis BPFO envelope evidence is consistent with, not proof of, outer-race damage. Snapshot ages run up to ~4 h, and confidence is still B1's anomaly score.
- **Exposure:** validation was inspected in earlier work, so this is not blind evidence. All data is synthetic, with no field validation, certification or ROI claim. Train and validation results must not be merged into one accuracy claim.

## Artifacts

All files are in `run-20261107T094945244932Z/`:
- `comparison.csv`, `comparison_unchecked.csv`
- `report_B1.json`, `report_Z995.json`
- `per_event_*.csv`, `per_asset.csv`, `event_transitions.csv`
- `predictions_*.csv`, `applicability_coverage.csv`
- `run_provenance.json`, `causality_audit.csv`, `raw_aggregation_audit.csv` (empty, 0 eligible assets)
- `determinism.json`, `run_summary.json`

`COMPLETED.json`, `validate_stdout.log` and `validate_stderr.log` are kept.
