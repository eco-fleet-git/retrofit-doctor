# Task014 handoff — phase 1 (descriptive validation of frozen Z995), awaiting coordinator seal

2026-11-07. Claude Code. **No validation telemetry, features, snapshots, raw data, events or benign rows were read, and nothing was scored.** All fixtures are synthetic.

**Candidate.** Exactly Z995, frozen in `013-coordinator-review.md`, against causal B1. No runner-up is evaluated, nothing is fitted or tuned, and a failure would be preserved as is.

**Exposure.** Validation PUMP-08/09 was inspected in earlier work. This is a descriptive non-regression check, not blind evidence.

## Files (new only; no sealed code edited)

- `scripts/run_validation_z995.py`:
  - `selfcheck` mode.
  - `validate` mode, which runs once and only after the Task014 SEAL.
- `tests/test_validation_z995.py`: 15 tests, all passing in about 11 s.
- `docs/experiments/followup/2026-11-07-validation-z995-manifest.json`: SHA-256 `a63f145db05bf6f378f6332f778a403a9c1847dd0806c2f29742dc98a8e08e39`.
  - It hashes the runner and every dependency, the saved B1 validation predictions, the stored validation summary and the Task014 protocol.
  - It also hashes the frozen Task013 train evidence: comparison, run summary, provenance, recovery provenance, both manifests, both seals and the coordinator review.
- Task013 `FINDINGS.md` and `013-handoff.md` now record that the coordinator froze Z995.

## Order of operations in `validate`

1. **Refusals before any read:**
   - unpinned seed;
   - an existing `COMPLETED.json`;
   - a missing or mismatched SEAL;
   - a code-hash change;
   - a changed hash in the train-evidence files;
   - (round 1) frozen Task013 evidence that no longer shows Z995 passing and selected.
2. **Validation-only loading:**
   - `assets.csv` filtered to PUMP-08/09 with split validation, asserted.
   - Feature and snapshot parquet read through ID predicates, asserted.
   - Raw data only from `telemetry/asset_id=<ID>/`, and only for assets with the required installed channels (otherwise the capability gap is recorded).
   - Events asserted to contain only the allowlist; benign rows filtered to the two IDs.
3. **Predictions** for B1 and Z995 only.
4. **Before scoring:** `run_provenance.json`, with split-correct `*_validation_*` projection keys (round 1), raw and aggregation provenance, and prediction hashes; plus the predictions and applicability/waveform coverage.
5. **Scoring:** the official scorer with `split='validation'`. `run_regime_reference.evaluate` is not used, because it hardcodes `split='train'`.
   - Metrics use the split-agnostic `run_causal_b2.diagnostic_metrics`/`summarise`, the same definitions as the stored `validation_summary.json`.
   - Per-asset scoring also uses `split='validation'`.
   - Saved outputs: `report_B1.json` and `report_Z995.json` in full (round 1), plus per-event files, per-asset results and `event_transitions.csv`.
6. **Correctness:**
   - Control equals the saved B1 validation predictions, with metrics 8 / 4 / 8 / 1 / 0, sensor type+channel 2 (non-gateway 1), 15 alerts and composite 76.01253946421124.
   - Both reports show split validation, assets PUMP-08/09 and exactly 14.0 asset-days (round 1).
   - Emission equality.
   - Full-evidence prefix/future-mutation audit at the Task010 cut set, for B1 and Z995.
   - Raw-aggregation boundary checks with a categorical-safe mutator.
   - A fresh seed-0 process reproduces the main hashes.
7. **Adoption gate** (fixed before the check):
   - detected ≥ 8, type ≥ 4, class ≥ 8, false + excess ≤ 1, sensor type+channel ≥ 2, nuisance ≤ 1.
   - Every B1-correct type event and every B1-correct sensor type+channel event is preserved.
   - Wrong-specific first diagnoses and wrong-channel claims are each no higher than the concurrently reproduced B1 counts (stored reference: 3 and 1).
   - The train gate still passes, and all correctness checks pass.
   - Results go to `run_summary.json` (gate, lost events, changed events) and `COMPLETED.json`.

## Fixture coverage

- **Candidates:** only B1 and Z995 are predicted.
- **Scoring:**
  - The official scorer counts validation events with `split='validation'`, and train-labelled metadata is not scored.
  - Per-asset results; event transitions.
  - Every adoption-gate component, including the wrong-specific/wrong-channel guards, lost events, correctness and the train gate.
- **Audits:** pass with categorical raw data, and the safe mutator leaves its input unchanged.
- **Loader:** reads only PUMP-08/09 when a mixed train/test/validation tree is present; raw partitions are requested only for 08/09; validation events outside the allowlist are refused.
- **Train evidence:** the gate check reads the frozen evidence.
- **Refusals:** six refusal cases before any read, plus the round-1 refusal when train evidence fails, where the loader is never reached.
- **Reports and keys:** report scope check and serialisation; validation key names.

## For the coordinator

Write `results/validation_z995/SEAL.json` with `{"manifest_sha256": "a63f145db05bf6f378f6332f778a403a9c1847dd0806c2f29742dc98a8e08e39"}`, then authorize `PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/run_validation_z995.py validate`. Run it as a standalone command so its true exit code is kept. No test data, release or UI is touched. Git is yours.
