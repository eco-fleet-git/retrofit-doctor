# Task010 handoff — phase 1 (diagnosis fusion), awaiting coordinator seal

2026-11-07. Claude Code. **No candidate has been scored.** No benchmark telemetry, snapshots or labels were read in this phase; only synthetic fixtures were run. Also read: public docs; the snapshot parquet schema (metadata only); and existing control artifacts — the header/first rows of `results/causal_b1/predictions_causal_train.csv` and `results/causal_b2/train_events_C0.csv` (2 historical PUMP-01 train labels) and the head of `selection.json`. Full list in the manifest `phase1_reads_disclosure`.

## Files (new only; no existing detector, UI, release or result file changed)

- `src/retrofit_doctor/diagnosis_fusion.py`: the diagnosis-only layer at the unchanged causal B1 alert times.
- `scripts/run_diagnosis_fusion.py`:
  - `selfcheck` mode: seed, manifest and code hashes.
  - `train` mode: refuses without `results/diagnosis_fusion/SEAL.json`, which must approve the exact manifest SHA-256; any code-hash mismatch also refuses before data is read.
  - The `train` mode is complete for phase 2: 7 LOAO fits, scoring, gate, selection, causality audit and determinism.
- `tests/test_diagnosis_fusion.py` (38) and `tests/test_diagnosis_fusion_runner.py` (18): 56 synthetic tests, all passing (`PYTHONHASHSEED=0 ../../work/.venv/bin/python -m pytest -q tests/test_diagnosis_fusion.py tests/test_diagnosis_fusion_runner.py`, about 105 s).
- `docs/experiments/followup/2026-11-07-diagnosis-fusion-manifest.json`: exact definitions, gates and code hashes. Its SHA-256 at handoff is `8eda43e1463843f8da30f5b2f24e5ce300e70d856dadef22125a405f5f6bae6a` (after the runner review).

## Candidates (6 plus control)

| Candidate | Definition |
|---|---|
| B1 | Unchanged control |
| W1 | Waveform rules, applied to B1 MACHINE alerts only |
| M1 / M2 | Depth-6 ExtraTrees on minute features; override when the score is ≥ 0.6 / ≥ 0.8 |
| F1 / F2 | As M1 / M2, plus waveform features |
| X1 | A decisive W1 result overrides any non-protected B1 type, including sensor types. Otherwise M1, otherwise B1. Risk of overwriting a simultaneous sensor fault is recorded. |

These rules apply to every candidate:
- COMMUNICATION_LOSS and SENSOR_STUCK are never overridden.
- Every abstention returns the exact B1 row (evidence and action included), never "healthy".
- A NORMAL output also falls back to B1.

## Review round 1 (both sections): how each item was addressed

1. **Model complexity:** `max_depth=6`, 300 trees, `min_samples_leaf=3`, seed 0, `n_jobs=1`. No sweep.
2. **Installed-channel guards:**
   - The current z, spread and channel localization require the channel to be listed in `channels_available`, with count > 0 and a finite mean.
   - The trailing mean uses observed past values only.
   - The B1 emission frame is not mutated.
   - Fixtures: a retained value with count 0, a channel removed from the passport, and a trailing value after a missing minute.
   - A sensor type with no unique channel stays unlocalized and says so in its evidence.
3. **Snapshot contract and provenance:**
   - Bad unit, axis, sample rate, rpm, BPFO order, length or a non-finite sample is marked invalid and not used.
   - The installed-accelerometer capability comes from the passport.
   - `reference_end` is mandatory.
   - Missing current speed is reported as `UNVERIFIED`.
   - Alert rows carry the snapshot ID, completion time, age in seconds, speed check, reference count (completed by that clock only) and the derived features as JSON.
4. **Waveform override scope:** W1 is machine-only. X1 is cross-class but leaves protected types alone (fixture: a lone pressure step diagnosed as SENSOR by B1, plus BPFO snapshots, gives W1 = B1 and X1 = BEARING_WEAR).
5. **Fit labels:**
   - A minute gets an event label only inside the physical interval, max(onset, detectable) to end, of exactly one observable event, and outside every other event's scoring window.
   - NORMAL means outside every scoring window, including the 6 h early and 30 min late allowances.
   - Excluded: the buffer between physical interval and scoring window, overlaps, unobservable events, and protected types.
   - NORMAL groups are contiguous normal-candidate segments. A fixture checks that two segments separated by an event become two groups.
   - Each event or NORMAL episode carries total weight 1, with at most 240 minutes sampled. The NORMAL class weight equals its episode count; its effect relative to the thresholds is unknown before scoring.
   - Training eligibility is B1's `_zmax > k`, where `_zmax` = max(max|z|, max(spread z)/2), on steady minutes without gap or flatline.
6. **Wording:**
   - Quoted deviations are labelled "observations, not model attribution".
   - Scores are labelled "uncalibrated ExtraTrees predict_proba".
   - Fused decisions carry the waveform provenance and the per-fold `model_id`.
7. **08:21 follow-up:**
   - The reference count is now causal per clock.
   - NOT_INSTALLED comes from the passport.
   - Mutations apply only to snapshots completing after the cut and to minutes whose end is after the cut, including a sub-minute cut.
   - Fixtures added: an early gateway alert with reference-count prefix replay, and a snapshot ending exactly at the cut.
   - The fit refuses frames with mis-keyed rows and waveform maps that are misaligned or don't match the fit assets.

## Runner review (`010-review-runner.md`)

1. **B1 audit call:** the audit now gives B1 no waveform state, exactly as in production. The other candidates are still compared on every output column, including waveform provenance.
   - A runner-level fixture (3 assets, an early gateway gap, nonempty snapshots, real folds) passes every audit cut for all 7 candidates.
   - A second fixture reinstates the old bug and checks that the audit flags it.
2. **Determinism:** both child-process hashes must equal the main scored prediction hash, per candidate.
3. **Provenance before scoring:** `run_provenance.json` and the raw predictions are written before any scoring. It records:
   - manifest and code hashes;
   - train-only input projection hashes;
   - per fold: fit assets, feature names, classes, support, unsupported classes, parameters and the fitted-tree state hash;
   - prediction hashes.
4. **Outputs and reruns:** new outputs are `per_asset.csv` (exact false, excess and nuisance per asset from the official scorer), `waveform_and_fallback.csv` and `held_out_type_support.json`.
   - Each attempt writes a new `run-<UTC>/` directory, so a partial run is never overwritten.
   - `COMPLETED.json` is written only at the end and blocks any second score.
5. **Runner fixtures:** refusal before any read for each of these cases: no seal, wrong manifest, changed code, already completed, unpinned seed. Also all 8 gate boundary cases, the scoring and output schema on fixture data, and the input-hash sensitivity.

No candidate definition or gate changed.

## Physical assumptions and limits

- **One radial axis.** Evidence is worded as "consistent with", never as proof of misalignment, imbalance or bearing damage.
- **Envelope band.** Requested 1–5 kHz; effective 1000–4608 Hz, because the upper edge is min(5000, 0.45 × 10240). It is generic, not tuned. The public 2.8 kHz resonance falls inside it.
- **Snapshot gaps.** Snapshots are taken only every 4 h while the pump runs, and only on T1/T2 assets. T0 assets, stopped periods, the first 24 h (no reference yet) and speed changes all lead to abstention. In a real retrofit, snapshots may also be missing because of battery or radio duty cycles or a missing tachometer reference.
- **Learned candidates.** They cannot predict a fault type that has fewer than 2 events on at least 2 fit assets. Dropped types are recorded per fold.
- **Not checked in phase 1:**
  - Real train snapshot validity and reference coverage were not measured.
  - The `train` path has not been run on real data, so its runtime is unknown. The audit recomputes the causal frame once per cut and shares it across candidates.

## For the coordinator

1. Review the manifest and code. If approved, write `results/diagnosis_fusion/SEAL.json` with `{"manifest_sha256": "<sha>"}`.
2. Authorize phase 2: `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/run_diagnosis_fusion.py train` (one run; it refuses to overwrite).

Any further code change alters the manifest hashes, so the manifest must be regenerated before sealing. Git is yours.
