# Task010 findings — diagnosis at fixed B1 alert times (train LOAO)

2026-11-07. One sealed run: `run-20261107T083245565432Z`, manifest `8eda43e1…bae6a`, seed 0, 451 s. Train PUMP-01..07 only, 26 scored events over 49 asset-days. All data is synthetic, and this train set was already inspected during development. No validation or test data was touched.

**Result: negative. No candidate passed the success gate, so B1 is retained.** No code or threshold was changed after scoring.

## Correctness (all passed)

- The control equals the saved causal B1 semantically. Its metrics are reproduced: 18 detected, 8 correct type, 14 correct class, 3 false + 3 excess, 3 correct sensor type+channel.
- The set of emitted (asset, alert time) pairs equals the control for all 7 candidates.
- Prefix replay and future mutation: 0 failures in 196 + 196 cuts per candidate. Cuts were placed at alerts, reference boundaries, snapshot completion/age boundaries and random times.
- Determinism: both fresh seed-0 child processes equal the main scored prediction hash, for every candidate.

## Comparison

| Candidate | Composite | Detected | Correct type | Correct class | False | Excess | Nuisance | Sensor type+channel | Useful | UNKNOWN first | Wrong specific first | Overrides | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| B1 (control) | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | 0 | fail (type) |
| W1 | 59.44 | 18 | 8 | 13 | 3 | 2 | 2 | 3 | 8 | 1 | 9 | 9 | fail |
| M1 | 55.74 | 17 | 6 | 14 | 3 | 3 | 2 | 2 | 6 | 1 | 10 | 11 | fail |
| M2 | 55.35 | 17 | 6 | 13 | 3 | 3 | 2 | 2 | 6 | 1 | 10 | 8 | fail |
| F1 | 55.74 | 17 | 6 | 14 | 3 | 3 | 2 | 2 | 6 | 1 | 10 | 11 | fail |
| F2 | 55.35 | 17 | 6 | 13 | 3 | 3 | 2 | 2 | 6 | 1 | 10 | 8 | fail |
| X1 | 54.71 | 16 | 7 | 13 | 3 | 3 | 2 | 2 | 7 | 0 | 9 | 20 | fail |

Gate: detected ≥18, class ≥14, false+excess ≤6, sensor type+channel ≥3, and either type ≥10, or type ≥9 with sensor type+channel ≥4.

## Per-event gains and losses against B1

**W1**
- Gain: PUMP-02-E02 MISALIGNMENT, where B1 said UNKNOWN.
- Loss: PUMP-04-E01 IMBALANCE becomes SENSOR_CALIBRATION_SHIFT, losing both type and class.
  - W1 relabelled 7 PUMP-04 alerts.
  - The official assignment (same type first) then matched those alerts differently, so the simultaneous imbalance event was displaced.
- Net effect: correct type unchanged at 8, correct class falls to 13, excess falls by 1.

**M1 and F1 (identical outcomes)**
- Losses: PUMP-03-E01 DISCHARGE_RESTRICTION becomes MISALIGNMENT, and PUMP-03-E02 SENSOR_CALIBRATION_SHIFT is no longer detected.
  - The relabelled bursts were assigned to other events, so this event lost its detection even though alert times were unchanged.
- PUMP-01-E01 and PUMP-03-E03 changed to MISALIGNMENT, which is still the wrong type, though PUMP-01-E01 gains class credit.

**M2 and F2:** the same PUMP-03 losses and PUMP-03-E03 change, without the PUMP-01-E01 class gain.

**X1:** gains the W1 MISALIGNMENT event, but has the M1 losses plus PUMP-04-E03 SENSOR_NOISE_SPIKES no longer detected.

## Why the learners failed (support)

- **Supported classes:** under the frozen rule (≥2 events on ≥2 fit assets, physical-interval labels, candidate minutes only), most folds supported only BEARING_WEAR, MISALIGNMENT and NORMAL.
- **PUMP-02 fold:** no class was supported, so no model was fitted and every alert fell back to B1.
- **Unpredictable held-out types:** every fold had held-out event types its model could not output (`held_out_type_support.json`).
- **Consequence:** the learners mostly relabelled alerts as MISALIGNMENT and overrode correct B1 rules.
- **F1/F2 vs M1/M2:** they gave identical outcomes. Waveform features were absent at most overriding alerts; PUMP-03 has no accelerometer (NOT_INSTALLED).

## Waveform availability at alerts (W1)

- FRESH at 30 of 43 alerts. The rest were stale, speed-changed or not installed: PUMP-03 and PUMP-05 have no accelerometer.
- W1 was decisive at 9 alerts: 2 on PUMP-02 and 7 on PUMP-04.

## Limits

- Scores are uncalibrated.
- One radial axis and a 4 h snapshot interval don't establish a root cause.
- The empirical first-day reference may already contain faults.
- Learned types need training support that seven assets don't provide.

## Artifacts

All files are in `run-20261107T083245565432Z/`:
- `comparison.csv`, `per_asset.csv`
- `per_event_*.csv`, `unmatched_*.csv`, `predictions_*.csv`
- `waveform_and_fallback.csv`, `held_out_type_support.json`
- `run_provenance.json` (written before scoring)
- `causality_audit.csv`, `determinism.json`, `run_summary.json`
