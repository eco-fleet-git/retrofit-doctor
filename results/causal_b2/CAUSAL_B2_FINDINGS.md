# Causal B2 v1 — findings (protocol retrofit-doctor-causal-b2-v1, run causal-b2-v1-train-r2)

Date 2026-11-06. Implementer: Claude Code. All data is synthetic. The validation split had already been inspected (causal B1 per-event analysis) before this work. The candidate was chosen on train only, so the validation check below is descriptive and is not an independent blind test. No test telemetry, labels or predictions were parsed (see the integrity-hash disclosure).

## Result in brief

**No B2 candidate passed the frozen train gates, so C0 (unchanged causal B1) is retained.** C1 (the quality/cadence/gap layer) raised train detection from 18 to 21 of 26 and newly caught the sparse wireless SENSOR_STUCK event that C0 misses (PUMP-01-E04). However, it lost one correct type (8 → 7) and raised false+excess episodes from 6 to 21. The cause, measured on train, is false sparse stuck alerts: an exact-equality rule fires on healthy 5-minute bearing-temperature samples quantised to 0.5 °C. On PUMP-01, 49.8 % of consecutive healthy samples equal the previous one. C2–C5 add trajectory diagnosis. That diagnosis never produced a specific DRIFT or STEP type on train: of 16 sensor-candidate alerts, 9–10 had insufficient history and 6–7 were ambiguous. C2–C5 are therefore identical to each other and worse than C1 on sensor type+channel (3 vs 4).

## Train LOAO selection (7 folds, pooled out-of-fold, official scorer unchanged)

B2 v1 has no learned parameters. Each fold's six-asset fit set is recorded in `selection.json` but not used. Every held-out asset is replayed alone with its own causal 24 h reference.

| ID | Composite | Detected /26 | Type | Class | False+excess /49 d | Sensor type+channel (/8, incl. gateway) | Gate result |
|---|---:|---:|---:|---:|---:|---:|---|
| C0 | 59.20719120527966 | 18 | 8 | 14 | 6 (3+3) | 3 | control |
| C1 | 56.00452043409396 | 21 | 7 | 14 | 21 (11+10) | 4 | fail: type < C0, burden > C0 |
| C2–C5 | 54.91052949622739 | 21 | 6 | 14 | 20 (11+9) | 3 | fail: type < C0, burden > C0 |

C0 reproduces `results/causal_b1/report_causal_train.json` exactly; the runner asserts this. Further metrics are in `train_selection_table.csv`. Non-gateway sensor type+channel: C0 2, C1 3, C2–C5 2. Channel localisation among non-gateway SENSOR hits: C0 3/4, C1 5/6, C2–C5 4/5. Selective diagnosis (correct specific / emitted specific / events): C0 8/16/26, C1 7/20/26, C2–C5 6/17/26. UNKNOWN first diagnoses: C0 2, C1 1, C2–C5 4. Nuisance alerts in benign windows: C0 2, B2 candidates 3.

Paired per-event change C0 → C1 (`train_events_C0.csv` vs `train_events_C1.csv`):

- **Gained a correct type:** PUMP-01-E04 SENSOR_STUCK bearing_temp_c (correct type and channel).
- **Lost a correct type:** PUMP-01-E02 and PUMP-06-E03 (SUCTION_STRAINER_CLOGGING). Both are now first-diagnosed as SENSOR_STUCK bearing_temp_c.
- **Newly detected but wrongly typed:**
  - PUMP-06-E04 SENSOR_DRIFT bearing_temp_c, diagnosed as STUCK; class and channel are right.
  - PUMP-06-E05 CAVITATION, diagnosed as BEARING_WEAR.
  - PUMP-06-E07 CAVITATION, diagnosed as STUCK.
- **Lost detection:** PUMP-03-E03 (previously detected only as UNKNOWN).

Per-asset false+excess, C0 → C1: PUMP-01 0 → 9, PUMP-02 1 → 4, PUMP-06 0 → 3; the other assets are unchanged.

## Correctness gates (r2)

- **Tests:** 59 passed: 18 B1 regression (unchanged) + 41 B2 contract. Log: `tests.log`.
- **Causality audit:** 1547 B2 cutpoints (C1–C5 × 7 train assets), each comparing an independent prefix run with the full-run past. Predictions and evidence matched at all 1547; channel quality (C1) matched at all 311. Cutpoint kinds: 315 original-hour, 140 reference-boundary, 350 random, and 742 at exact alert boundaries (t−1 s and t).
- **Hash-seed determinism:** PYTHONHASHSEED 0/1/7/9 produced identical evidence digests for every candidate (`determinism.json`).
- **Controls:** the B1 control-file hashes match `protocol_v1.json`, and the vendor MANIFEST check passed (189 files).
- **Supplemental audit at the exact stored causal-B1 train cutpoints:** 810 rows (162 stored train cutpoints × C1–C5; quality for C1 at all 162): 0 failures; causal_b2.py hash unchanged 9976d47a… (`supplemental_original_train_cutpoints_*`). Details in the section below.

### Audit wording limits

- The r2 audit does **not** literally repeat the 209 frozen cutpoints:
  - One RNG (seed 20261106) is reused sequentially across candidates, so each candidate got different random cuts.
  - Trailing-outage cuts were omitted; exact alert-boundary cuts were added instead.
  - The stored 209 include 47 validation cutpoints. These were **not** replayed for B2, by design, because no B2 candidate is evaluated on validation.
- The supplemental script `scripts/audit_causal_b2_cutpoints.py` replays the 162 stored train cutpoints exactly: 63 original-hour, 70 random, 28 reference-boundary and 1 trailing-outage. It does this for C1–C5 predictions and evidence, and for C1 quality. It does not change the sealed model or the selection.
- The shared `causal_features` normalisation is unchanged causal B1 code (hash `c637e0f8…`); its 209-cut audit is covered separately in `results/causal_b1/`.

## Invalid run r1 (kept, not hidden)

The first train run (`run1_invalid/`) failed its own causality gate: 83 of 1547 cutpoints, i.e. 136 prediction+evidence comparisons. Diagnosis showed identical alerts (same time, type, rule, source and residuals). The only difference was the representation of a missing `suspected_channel`. A prefix run in which every alert lacked a channel stored `None` (object dtype), while the full run stored `NaN` (pandas 3 string inference).

The fix makes text columns canonical (object dtype, `None` for missing). A regression test was written and seen failing before the fix: `test_missing_channel_representation_does_not_depend_on_other_alerts`. r2 scored fields are identical to r1. The only changed field is the free-text evidence string, where `nan` became `no channel` in 30 rows of each B2 candidate. The gate outcome would not have changed: every candidate also fails the type and burden gates. Validation was not touched before r2 was sealed.

## Single validation check (sealed r2, selected C0)

The runner refuses to start if any sealed code hash has changed or if a validation summary already exists. Only C0 was run, because the selected candidate is C0.

| | Composite | Detected /9 | Type | Class | False+excess /14 d |
|---|---:|---:|---:|---:|---:|
| C0 (validation, 2026-11-06T22:10:16Z) | 76.01253946421124 | 8 | 4 | 8 | 1 |

This reproduces the registered causal-B1 baseline and makes no improvement claim. No B2 candidate was scored on validation.

## Hypotheses (train evidence only)

- **H4 (sparse cadence):**
  - *Mechanism supported on fixtures and on one train event:* counting independent samples makes a sustained sparse anomaly detectable where B1 cannot. The A01 probe is reproduced as a test, in which B1 raises 0 alerts. The real sparse stuck PUMP-01-E04 was detected with the correct type and channel.
  - *Falsification condition met on train:* false stuck under normal cadence (PUMP-01 and PUMP-06 bearing temperature). Under the fixed rule (exact equality, at least 3 updates, at least 15 min), H4 as registered is **not supported**: no candidate passes the burden gate.
- **H5 (gaps):**
  - *Contract verified on fixtures:* gateway loss alerts on the clock without a recovery packet, including during warm-up; a channel-only gap becomes STALE and is not reported as gateway loss; the strict >12 h refractory and the 720-minute retry are preserved; two different causes in sequence (10 + 5 min) do not confirm either cause.
  - *Benchmark:* the single train COMMUNICATION_LOSS event stays correct in all candidates.
  - *Verdict:* **inconclusive** as a benchmark gain, since there are too few gap events. The quality states themselves are correct on fixtures.
- **H1 (trajectory, machine vs sensor):** **not supported**. Type+channel did not improve over C1 (3 vs 4), and no DRIFT or STEP was classified on train.
- **H2, H3, H6 experiment, H7 (E3–E5):** not run.

## Not done / limitations

- **Metrics not implemented:** useful diagnosis delay, reference/diagnosis coverage shares, and the macro average across assets. Per-asset rows are in `train_per_asset.csv`.
- **Batch only:** no persisted incremental state, so chunked replay and restart are not implemented. This is not a streaming service, and the replay assumes zero ingestion lag.
- **Cadence assumption:** wireless cadence comes from `wireless_update_s` for T1 vibration and bearing-temperature channels (public metadata/docs). All other channels are assumed to update every minute.
- **Stuck rule:** the stuck equality is exact. Transmitter resolution is not in public asset metadata, so no tolerance was used.
- **Coupled-channel check:** a coupled channel counts as fresh when it is FRESH or NO_NEW_SAMPLE (within 2 expected intervals).
- **Trajectory acceptance:** a zero winning loss against a strictly positive competitor is accepted; ties and all-zero losses give UNKNOWN.
- **Confidence:** a bounded heuristic score, not a probability.
- **Integrity-hash disclosure:** the vendor MANIFEST check hashes all 189 vendor files as opaque bytes. That includes the 3 organizer test-prediction CSVs (`baselines/results/predictions_*_test.csv`), 21 test-asset telemetry partitions, and the shared parquet/CSV files that contain test rows. These were hash-only reads: no file was parsed, and no outcome or prediction was inspected. Telemetry was loaded only through the allowlisted loader, using predicate pushdown and a check of the returned IDs.
- **Locations:** the results directory is `results/causal_b2/` (as Task002 specifies; the packet says `causal_b2_v1/`). These findings live there rather than at the repo root because of the task's file scope.

## Next registered follow-up (not authorised to run here)

The burden failure is fully explained by sparse exact-equality stuck alerts. Any fix — a resolution-aware rule, a minimum run longer than the healthy repeat distribution, or comparison against the reference repeat rate — is a **new** train-only experiment with its own manifest. Applying it now would be tuning after seeing train results under this protocol.

## Reproduce

```text
cd outputs/retrofit-doctor
PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0 ../../work/.venv/bin/python -B -m pytest -q -p no:cacheprovider tests/test_causal_b1.py tests/test_causal_b2.py
PYTHONHASHSEED=0 ../../work/.venv/bin/python -B scripts/run_causal_b2.py train       # ~5 min, writes results/causal_b2/
PYTHONHASHSEED=0 ../../work/.venv/bin/python -B scripts/audit_causal_b2_cutpoints.py   # supplemental, train only
# validate: already executed once; the runner now refuses a second run
```
