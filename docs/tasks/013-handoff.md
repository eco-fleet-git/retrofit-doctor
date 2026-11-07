# Task013 handoff — phase 1 (synchronized hydraulic residual + empirical-tail amendment), awaiting coordinator seal

2026-11-07. Claude Code. **No candidate has been scored.** No benchmark raw telemetry, minute features, snapshots or labels were read. The raw partition loader was tested only on a synthetic temporary partition tree.

**Overlap.** Task013 phase 1 was implemented while the sealed Task012 run was still finishing its read-only audit in a separate process. No Task012 file was changed. After that run completed, its results were preserved: `results/hydraulic_spread/FINDINGS.md` and the phase-2 section of `012-handoff.md`. All four Task012 variants were negative; V3/V5 reached type 9 through the same single W1 gain, which still fails the gate.

**Exposure.** The Task010–012 train outcomes are known, including the Task012 PUMP-04 flow-noise budget. No Task013 residual values or scores are known.

## Files (new only)

- `src/retrofit_doctor/synchronized_residual.py`:
  - The residual, its per-minute raw aggregation, the first-day reference and the empirical tail rank.
  - Candidates R3, R5, E995, Y3, Y5 and Z995.
  - Task012 applicability checks and Task010 W1 are imported unchanged.
- `scripts/run_synchronized_residual.py`:
  - Refuses before any read on: unpinned seed, an existing `COMPLETED.json`, a missing or mismatched seal, or a code change.
  - Before scoring it writes raw projection hashes, aggregation provenance, raw predictions and applicability coverage.
  - Audits: the full-evidence prefix/future-mutation audit at the Task010 cut set, plus independent raw-aggregation checks.
  - Determinism: a fresh seed-0 child process must reproduce the main hashes.
  - Each attempt writes a new run directory.
- `tests/test_synchronized_residual.py`: 49 synthetic 1 Hz tests, all passing in about 33 s.
- `docs/experiments/followup/2026-11-07-synchronized-residual-manifest.json`: SHA-256 `4e673ca28dd1c9dd0dac0770969bef693402ba34bcfa5d335bccf14c46ed19a9`. `selfcheck` reports the code matches it. The manifest also hashes the protocol and amendment documents.

## Definitions (as registered and amended before any score)

**Residual.** E = Pd − Ps + (ρg/1000)(H0−Hb)(Q/Qb)² − (ρg/1000)H0(n/nr)², in kPa, computed per paired 1 Hz row. Statistics are double precision and centred within the same paired rows, with ddof = 1.

**Rule order:** reused Task012 applicability gates (recorded separately in `rule_detail.applicability`), then:
1. Raw minute available and valid, with at least 30 paired rows.
2. Reference supported.
3. Var(E) > 0.
4. Excess test:
   - R: std(E) > 3 or 5 × the reference median.
   - E995: (1+b)/(N+1) ≤ 0.005 with N ≥ 199. Ties count against the candidate.
5. Covariance shares c_j sum to 1 within 1e-6, with every c_j ≥ −0.25.
6. Exactly one share ≥ 0.75, with all the others ≤ 0.25.
7. The dominant term is not speed.
8. Source spread z > 6.

Passing all of these gives SENSOR_NOISE_SPIKES on that channel. Every abstention returns exact B1 with one of 14 explicit reasons.

**Y/Z.** On abstention, W1 may refine B1 UNKNOWN only. Protected causes (gateway, stuck) are never evaluated.

## Reviews resolved

**`013-review-round1.md`**
- An alert before reference end shows `reference.status = incomplete`, with no reference values, in full replay as well as prefix replay. Fixture: an early non-protected UNKNOWN alert (speed flatline at 5 h), compared across the full run, the prefix and future-mutated raw.
- Native covariances (kPa²) and term variances are now in `rule_detail`. A fixture checks that they reproduce the shares and Var(E).
- Missing or unparseable timestamps are rejected explicitly, by both the aggregator and the loader.
- The loader reads only `telemetry/asset_id=<ID>/` files and restores `asset_id` from the hive path. A synthetic-tree fixture checks: another asset is present but ignored; window bounds; a missing partition; a NaT row.

**`013-review-round2.md`**
- The reference eligibility filter uses an explicit boolean row mask.
- The empty-table return has the same schema as the normal one.
- New fixture: zero eligible first-day minutes, for R3, E995, Y3 and Z995, gives `residual_reference_unsupported` and exact B1, with no crash and no reference distribution in evidence.
- The runner coverage fixture covers all six candidates.

**Amendment (`013-amendment-empirical-tail.md`)**
- E995/Z995 added; R3/R5/Y3/Y5 unchanged.
- Fixtures: N = 198 unsupported; N = 199 with b = 0 emits; a tie at N = 199 abstains (rank 0.01); N = 999 with b = 4 emits and b = 5 abstains; a stable-spread offset case stays in-distribution; invalid reference minutes are filtered; Z995 refines only UNKNOWN; pre-24 h evidence has no tail.
- Tie order: R3 < R5 < E995 < Y3 < Y5 < Z995.

**Defects found and fixed during phase 1 (none scientific):**
- The clock guard was skipped when an asset had no alerts. It now runs first.
- A None-vs-NaN difference appeared in two single-row test comparisons. Those tests now use the runner's normalised `canonical` comparison.

## Fixture coverage (summary)

- **Equation and identity:** units, zero residual on the curve, offset tracking, covariance-sum identity.
- **Minute boundaries:** minute-end row ownership; the open minute is dropped.
- **Invalid raw input:** duplicate, off-grid, interval ≠ 1 s, NaT.
- **Pairing:** non-running, missing and non-positive rows dropped without filling.
- **Localisation:** independent Q, Ps and Pd noise each map to their own channel.
- **Abstentions:**
  - synchronized control motion does not fire;
  - speed noise abstains as an unsupported source;
  - two sources abstain (no unique dominant term);
  - strong cancellation abstains;
  - a constant calibration offset does not fire.
- **Factors:** R5 is stricter than R3.
- **Guards:** raw minute missing, count 29, duplicate, missing reference.
- **Applicability:** fluid failure is recorded separately.
- **Loader:** capability check and train-only loading.
- **Reference:** not exposed before completion; tail rank and support (above).
- **Protected:** gateway alerts unchanged.
- **Y/Z scope:** UNKNOWN only; R and E never use waveform; specific B1 causes are kept.
- **Causality and caching:**
  - prediction prefix and future mutation of raw, features, counts and snapshots;
  - raw-table prefix and future mutation;
  - cached table equals on-demand;
  - no label parameters; emission equals B1.
- **Runner:** pipeline, main audit and raw audit pass; coverage and raw provenance; selection order; 5 refusal cases.

## Limits

- A strong residual can also come from dynamics, a wrong curve or a wrong model.
- Covariance shares are a variance decomposition, not causal probabilities.
- The tail rank is not a probability, p-value or calibrated false-alarm rate. Commissioning data may be contaminated and is serially correlated.
- Assets without a flow meter cannot use this rule.
- All data is synthetic, and the train set has prior exposure.

## For the coordinator

Write `results/synchronized_residual/SEAL.json` with `{"manifest_sha256": "4e673ca28dd1c9dd0dac0770969bef693402ba34bcfa5d335bccf14c46ed19a9"}`, then authorize `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/run_synchronized_residual.py train`. Git is yours.

## Phase 2 attempt 1 — FAILED (preserved)

**Attempt:** `results/synchronized_residual/run-20261107T093222280839Z`, exit code 1.

**Failure:** `raw_audit` → `mutate_raw_future` raised `TypeError` writing "STOPPED" into the real parquet's Categorical `operating_mode`. This is a harness defect that the synthetic fixtures (plain strings) didn't cover.

**Completed before the failure:**
- Provenance, predictions and applicability coverage.
- The full-evidence causality audit: 0 failures in 392 checks per candidate.
- Unchecked scores.

**Not run:** the raw-aggregation audit, determinism, the final comparison and summary, and `COMPLETED.json`.

**UNCHECKED gate metrics:**
- E995 reaches type 9 with sensor type+channel 4, from the PUMP-04-E03 flow noise.
- Z995 reaches type 10 with sensor type+channel 4, from PUMP-04-E03 plus the W1 gain at PUMP-02-E02.
- No candidate has losses.

**No selection.** Details are in `results/synchronized_residual/FINDINGS.md`.

**Proposed repair, not applied:** a categorical-safe mutation plus a categorical fixture. This needs coordinator review, a new manifest hash and a new seal, followed by one new full attempt.

## Audit-only recovery (proposed, awaiting RECOVERY seal; not run)

Per `docs/tasks/013-audit-recovery.md`, no sealed Task013 file was edited. The original runner, module, manifest and SEAL are unchanged, and `selfcheck` still matches.

**New files:**
- `scripts/recover_synchronized_residual_audit.py` (recovery script)
- `tests/test_synchronized_residual_recovery.py` (8 tests, all passing in 2.5 s)
- `docs/experiments/followup/2026-11-07-synchronized-residual-recovery-manifest.json`, SHA-256 `15eb5a391f60857b3738eec1d83223baf22d2803b0e984fc7d95e8e444e9d5ed`

**What the recovery does, in order:**
1. Refuses before any read without `RECOVERY_SEAL.json`, on a manifest or code mismatch, or with an unpinned seed.
2. Verifies the original manifest, SEAL and code, and every file of the original attempt by SHA-256, including that each prediction file matches its recorded hash.
3. Verifies the saved control identity, emissions, control metrics and the complete causality CSV.
4. Refuses if any recovery output or `COMPLETED.json` already exists.
5. Reloads train-only data and requires identical input, raw and aggregation projection hashes. On a mismatch it stops.
6. Runs the original `raw_audit` with the original `mutate_raw_future`, wrapped so that a copy of `operating_mode` is cast to object first.
7. Runs the original determinism-child in a fresh seed-0 process and requires the original recorded prediction hashes.
8. Attaches the flags to the original unchecked metrics and selects with the original `select()`. No scoring call is made.
9. Adds only `raw_aggregation_audit.csv`, `determinism.json`, `comparison.csv`, `run_summary.json` (labelled audit-only recovery, recovery runtime recorded separately), `recovery_provenance.json` and `COMPLETED.json`.

**Fixture coverage:**
- The original failure is reproduced on a RUNNING-only categorical input.
- The wrapper's future STOPPED values and ×3+50 values are checked, and earlier rows are unchanged.
- Closed-minute statistics are equal for the prefix and mutated inputs.
- The original `raw_audit` passes and the mutator is restored afterwards.
- The final comparison keeps the original metrics, its flags gate selection, and scoring is forbidden.
- Refusal cases: no seal, wrong manifest, changed code, unpinned seed.
- Detection of tampering and existing outputs.

**Command once sealed:** `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/recover_synchronized_residual_audit.py recover`

## Audit-only recovery — executed once (exit code 0, 37.4 s)

**Command:** `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/recover_synchronized_residual_audit.py recover`, run standalone with its true exit code. Logs: `results/synchronized_residual/recovery_stdout.log` and `recovery_stderr.log`.

**All checks passed:**
- Original files and hashes.
- Control equality and metrics.
- Emissions for all 7 configurations.
- Causality: 0 failures in 7 × 392 checks.
- Raw aggregation: 0 failures in 30 checks, covering 57,148 minutes.
- Input, raw and aggregation hashes identical to the original.
- Fresh seed-0 determinism matched for all 7 configurations.

**Result:**
- **Gate:** E995 and Z995 pass. The other configurations fail.
- **Selected:** Z995, with type 10, class 14, detected 18, false 3, excess 3 and sensor type+channel 4.
- **Gains:** PUMP-04-E03 flow noise (E995 residual) and PUMP-02-E02 misalignment (W1). No losses.

**Caveats:**
- The decisive flow share was 0.763 against a 0.75 minimum, a very narrow margin.
- Each gain rests on one event.
- The rule applies to only 3 of 7 train assets.
- This is development-informed selection after several waves.

No validation, test, UI or release change. Stopping before Task014 for coordinator review. Details are in `results/synchronized_residual/FINDINGS.md`.

## Coordinator decision

`013-coordinator-review.md` freezes Z995 as the sole Task014 candidate. Task013 is closed: no further code changes, and every artifact is preserved.
