# Task011 findings — isolated-spread noise rule and UNKNOWN-only waveform refinement (train)

2026-11-07. One sealed run: `run-20261107T084946436461Z`, manifest `4a365967…acccc`, seed 0, 305 s, exit 0. Train PUMP-01..07, seven independent causal replays, nothing fitted, 26 scored events over 49 asset-days. All data is synthetic, and the train set had prior exposure to Task010 results. No validation or test data was touched.

**Result: negative under the registered gate. No candidate is selected, so B1 is retained.** No code or threshold was changed after scoring.

## Correctness (all passed)

- The control equals the saved causal B1, and every expected metric matches: 18 / 8 / 14 / 3 false / 3 excess / 3.
- The set of emitted (asset, alert time) pairs equals the control for all five candidates.
- Causality: 0 failures for every candidate.
  - Prefix replay and future mutation: 196 + 196 checks each. The future mutation changes means, std/min/max and later snapshots.
  - Q1/Q2 also had 43 std/min/max-only future mutations each.
- Determinism: the main prediction hash equals a fresh seed-0 child process, for every candidate.

## Comparison

| Candidate | Composite | Detected | Correct type | Correct class | False | Excess | Nuisance | Sensor type+channel | Useful | UNKNOWN first | Wrong specific first | Overrides | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| B1 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | 0 | fail |
| Q1 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | 0 | fail |
| Q2 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | 0 | fail |
| U1 | 60.17 | 18 | **9** | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | 1 | fail |
| U2 | 60.17 | 18 | **9** | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | 1 | fail |

Gate: either correct type ≥10, or correct type ≥9 with sensor type+channel ≥4. U1/U2 reach type 9 but sensor type+channel stays at 3, so they fail by one sensor localization. All other components are at least as good as B1, with no worsening of false, excess or nuisance alerts.

## What happened

**Q1/Q2 (noise rule): never emitted.**
- The rule was evaluated at 41 non-protected alerts and abstained at all 41 because no source was eligible.
- Only two alerts had a source with spread z > 12, and both failed the coupled-quiet requirement:
  - PUMP-02, 2025-12-03 06:31, suction_pressure_kpa, spread z 14.6. Coupled discharge_pressure_kpa had spread z 11.9.
  - PUMP-04, 2025-06-18 22:06, flow_m3_h, spread z 26.3, the first alert of PUMP-04-E03 (SENSOR_NOISE_SPIKES on flow_m3_h). Coupled channels: motor_power_kw spread z 2.7, motor_speed_rpm 5.0, valve_position_pct 4.4. All of these exceed 2.
    - This event's flow noise came with elevated spread on related channels, so the registered isolation requirement correctly abstained. Whether that co-movement is real process response or control-loop reaction cannot be decided here.
    - B1 still names a different channel (motor_winding_temp_c) for this event.

**U1/U2: one change.**
- PUMP-02-E02 MISALIGNMENT: B1 said UNKNOWN; the W1 waveform refinement emitted MISALIGNMENT (latest completed snapshot, 1x gain with high 2x/1x).
- Restricting waveform refinement to UNKNOWN avoided the Task010 W1 side effect: PUMP-04 imbalance was not displaced, and class stays at 14.
- U1 and U2 are identical because Q never emitted.

## Interpretation and limits

- **UNKNOWN-only refinement:** this is the first wave with a net gain and no component loss on train (+1 correct type). It still fails the pre-registered gate, so no promotion and no validation check.
- **Noise rule:** the requirement of at least 2 coupled channels with spread z ≤ 2 found no eligible case in train. One true noise event has co-moving coupled spread.
- **Retained confidence:** relabelled rows keep B1's uncalibrated anomaly score, not a confidence in the new cause.
- **Evidence limits:** one radial snapshot axis is consistent with, not proof of, misalignment.
- **Exposure:** this is adaptive development on an already inspected train set.

## Artifacts

All files are in `run-20261107T084946436461Z/`:
- `comparison.csv`, `per_asset.csv`
- `per_event_*.csv`, `unmatched_*.csv`, `predictions_*.csv` (with `rule_detail`)
- `waveform_and_fallback.csv`
- `run_provenance.json` (written before scoring)
- `causality_audit.csv`, `determinism.json`, `run_summary.json`

`COMPLETED.json` is written; `train_stdout.log` and `train_stderr.log` are kept.
