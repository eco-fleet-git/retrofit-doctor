# Task 004 handoff — E5/H7 sensor mask/restore

Date 2026-11-06. Implementer: Claude Code (sole writer). Status: **experiment executed once; train and PUMP-09 gates passed; result mixed; coordinator review passed** (7 tests, C0 parity, restore frames, hashes). No Git, web, vendor, sealed-model or earlier-result changes. `README.md` and `004-coordinator-review.md` belong to the coordinator and were not edited by me.

Report: `results/sensor_ablation/FINDINGS.md`.

## Delivered

| File | Purpose |
|---|---|
| `scripts/run_sensor_ablation.py` | `manifest` (one-time, refuses overwrite), `train` (PUMP-02/04/07), `validation` (PUMP-09; refuses without a passed train gate and refuses a second run). Contains the mask, restore, consumed-column enumeration, C0 prediction and an evaluator that replicates the official burst→event assignment (asserted equal to official `per_event`) |
| `tests/test_sensor_ablation.py` | 7 tests: groups equal protocol_v1; mask removes every derived column and metadata entry without mutating inputs or `rows`; absent channel recorded, not pretended removed; masked predictions invariant to drastic masked-source changes; detector reads only enumerated columns; restore exactly reproduces features, metadata and predictions; first correct-type alert and explicit missed correct diagnosis |
| `results/sensor_ablation/` | `manifest.json`; per split: `*_predictions_<branch>.csv` (7 branches), `*_group_summary.csv` (pooled + per asset, with full−branch deltas), `*_paired_events.csv` (one row per original event, all branches side by side), `*_restore_check.csv`, `*_causality.csv`, `*_gate.json`, run logs; `FINDINGS.md` |

## Commands executed (PYTHONHASHSEED=0, `../../work/.venv/bin/python -B`, PYTHONDONTWRITEBYTECODE=1)

```
pytest -q -p no:cacheprovider tests/test_sensor_ablation.py   → red (module missing), then 7 passed
pytest -q -p no:cacheprovider tests/                          → 75 passed (all Python tests)
scripts/run_sensor_ablation.py manifest     → saved 2026-11-06T22:40:28Z (before any branch result)
scripts/run_sensor_ablation.py train        → 13.6 s; restore 9/9 equal; causality 414/414
scripts/run_sensor_ablation.py validation   → 4.8 s; restore 3/3 equal; causality 138/138
```

Mutation checks, each restored afterwards:

| Mutation | Tests failing |
|---|---:|
| Mask keeps `__max` columns | 2 |
| Correct-type alert uses any burst | 1 |
| Restore skips metadata | 1 |

## Results (full − mask; positive = the group helped)

| Group | Train Δ (det / class / type / false+excess, mask has fewer if +) | PUMP-09 Δ (det / class / type) | Label |
|---|---|---|---|
| Vibration + bearing temperature | +1 / +1 / +2 / 0 | +1 / +1 / +1 | Supported in pooled deltas; mixed per asset (PUMP-04-E04 only detected when masked) |
| Suction | 0 / 0 / 0 / 0 | +1 / +1 / 0 | Mixed: on train, masked suction gives a correct BEARING_WEAR diagnosis 36 h earlier |
| Flow + power | +1 / 0 / −1 / +1 | 0 / +1 / 0 | Mixed: on train, flow/power data turned a calibration shift into DISCHARGE_RESTRICTION |

H7 overall is **mixed**. With 10 train events and 5 on PUMP-09, there is no stable estimate, no hardware recommendation, no ROI and no PUMP-11 outcome.

## Sealed hashes

| File | SHA-256 |
|---|---|
| `scripts/run_sensor_ablation.py` | `57fa0191d724a82fa1e00166ec3008b3edab78a7953c7bd69b3a17700b059d49` |
| `results/causal_b2/selection.json` | `15948cb251bde6e2039ec1ac8357d2908d8e21d930f6c64fb495a1dc869150c0` (C0) |
| `causal_b1.py` | `c637e0f8…` |
| `baselines.py` | `4bf291d6…` |
| `scoring.py` | `5293c2e4…` |
| `protocol_v1.json` | `f018c40d…` |
| `tests/test_sensor_ablation.py` | `12e12102…` |

Full input and sealed hashes are in `manifest.json`.

## Unresolved limits

- **PUMP-09 is not independent.** The validation split was inspected before this task, so the PUMP-09 result is descriptive only.
- **Masked z-scores in diagnosis:** C0 turns a masked channel's NaN z-score into 0 during diagnosis. This is the fixed algorithm's behaviour, not something added by the ablation.
- **Sensor type+channel** relies on the Task002 C0 evidence-parsing rule. Train full has 0 hits, so the metric carries little information there.
- **Batch replay only:** no streaming, restart or ingestion-lag test.
- **No waveforms** are used, and no retrained masked model was built; that would be a separate train-only experiment.
- **Delay metric:** the reported delay is the *first correct-type delay* (type only, channel not required). It is not the protocol's useful diagnosis delay, which is still unimplemented. The delay medians come from very few events and are not claimed as a result. Missed correct types are counted explicitly: train full misses 6 of 10, PUMP-09 full misses 3 of 5.

## Next action (main chat)

Commit. Post-review edits were wording only: the findings and handoff now say "first correct-type delay" instead of "useful delay". No sealed code, manifest or result file changed. Task006 UI can consume `*_paired_events.csv`, `*_group_summary.csv` and `*_gate.json` as they are. The UI must not show the composite score as the benefit and must keep the adverse events visible.
