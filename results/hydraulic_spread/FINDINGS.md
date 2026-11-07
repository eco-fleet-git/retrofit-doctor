# Task012 findings — hydraulic consistency of within-minute variability (train)

2026-11-07. One sealed run: `run-20261107T091714055594Z`, manifest `2d2da3bc…cb3a7`, seed 0, 295 s, exit 0. Train PUMP-01..07, seven independent replays, nothing fitted, 26 scored events over 49 asset-days. All data is synthetic, and this is adaptive development on an inspected train set. No validation or test data was touched.

**Result: negative under the registered gate. No candidate is selected, so B1 is retained.** No code or threshold was changed after scoring.

## Correctness (all passed)

- Control equality and every expected metric (18 / 8 / 14 / 3 false / 3 excess / 3).
- Emission multiset equal to the control for all five candidates.
- Causality: 0 failures in 196 prefix + 196 future-mutation checks per candidate. The future mutation changes means, std/min/max, counts (set to 0) and snapshots.
- Main prediction hash equals a fresh seed-0 child process.

## Comparison

| Candidate | Composite | Detected | Correct type | Correct class | False | Excess | Nuisance | Sensor type+channel | Useful | UNKNOWN first | Wrong specific first | Overrides | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| B1 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | 0 | fail |
| H3 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | 0 | fail |
| H5 | 59.21 | 18 | 8 | 14 | 3 | 3 | 2 | 3 | 8 | 2 | 8 | 0 | fail |
| V3 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | 1 | fail |
| V5 | 60.17 | 18 | 9 | 14 | 3 | 3 | 2 | 3 | 9 | 1 | 8 | 1 | fail |

**Per-event changes against B1:**
- H3/H5: none.
- V3/V5: one gain, PUMP-02-E02 MISALIGNMENT (B1 said UNKNOWN), refined by W1. This is the same gain as Task011 U1/U2, with no losses.

## Applicability coverage (H3 at 43 alerts; H5/V3/V5 identical)

| Outcome | Alerts |
|---|---:|
| Model applicable; no source eligible (`abstained_no_source`) | 24 |
| Unsupported: `input_unavailable_flow_m3_h` (no flow meter: PUMP-01 ×4, PUMP-03 ×6, PUMP-06 ×4) | 14 |
| Unsupported: `curve_mismatch` (PUMP-02 ×3) | 3 |
| Protected (gateway / stuck) | 2 |

**Model-applicable alerts per asset:** PUMP-04 10, PUMP-07 10, PUMP-02 4 (24 total). PUMP-01 and PUMP-05 each have one protected alert that was not evaluated by this model; these are not applicable hydraulic checks.

## Why the known flow-noise alert did not fire

PUMP-04-E03, alert 2025-06-18 22:06 UTC, the only known flow-noise event:

| Quantity | Value |
|---|---|
| Flow std / spread z | 17.12 m³/h / 26.3 |
| Budget | 17.57 m³/h = physical 13.12 + floor 4.45 |
| Physical budget terms | σPd/aQ 6.72, σPs/aQ 4.32, an·σn/aQ 2.08 (m³/h) |
| Ratio | 0.97, below 3 |
| Operating point | Curve mismatch 3.3 %, speed ratio 0.91, flow ratio 0.97 |

- The flow slope aQ of the public curve is small near this operating point, so the measured pressure spreads (σPd 2.40, σPs 1.54 kPa) divided by aQ already allow about 11 m³/h of flow spread.
- Adding the conservative magnitudes, without any synchronization, makes the budget about as large as the observed flow spread.
- Pressure ratios were 0.22 (Pd) and 0.14 (Ps).

This explains why Task013 tests synchronized covariance instead of summed magnitudes. It does not show that the earlier thresholds should be relaxed.

## Limits

- The hypothesis is analytical redundancy with stated assumptions, not a calibrated variance model or proof of an instrument fault.
- Unsupported alerts mainly reflect missing flow meters, which is a retrofit capability gap.
- Retained confidence is B1's anomaly score.
- The waveform gain is the same single event already seen in Task011.

## Artifacts

All files are in `run-20261107T091714055594Z/`:
- `comparison.csv`, `per_asset.csv`
- `per_event_*.csv`, `unmatched_*.csv`, `predictions_*.csv` (full `rule_detail` with units)
- `applicability_coverage.csv`, `waveform_and_fallback.csv`
- `run_provenance.json`, `causality_audit.csv`, `determinism.json`, `run_summary.json`

`COMPLETED.json` and the stdout/stderr logs are kept.
