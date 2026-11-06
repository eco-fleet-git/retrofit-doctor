# Task 008 handoff — sparse-stuck follow-up

Date 2026-11-06. Implementer: Claude Code (sole writer). Status: **executed; no deployable candidate passed; S0 (unchanged causal B1) retained; validation not run** (protocol: validation only for a passing S2/S3).

What did not change:
- No Git or web edits.
- No test content was read.
- No sealed file was edited. `causal_b2.py` is still `9976d47a…`, and the Task002 and Task004 results are unchanged.
- `docs/tasks/008-coordinator-review.md` is untracked and was not written by me.

Report: `results/sparse_stuck_followup/FINDINGS.md`.

## Delivered

| File | Purpose |
|---|---|
| `src/retrofit_doctor/sparse_stuck.py` | S1/S2/S3 as a subclass of the sealed C1 asset loop. The sealed module is imported, never mutated. Adds the S3 commissioning threshold and resets, plus a `sparse_stuck_rule` evidence column |
| `scripts/run_sparse_stuck.py` | `manifest` (one-time), `train` (4 candidates; gates; seal), `validate` (refuses unless S2/S3 is selected; one-shot) |
| `tests/test_sparse_stuck.py` | 21 tests (see FINDINGS, "Correctness evidence") |
| `results/sparse_stuck_followup/` | Contents listed below |

Contents of `results/sparse_stuck_followup/`:
- `manifest.json`
- `selection.json`
- per-candidate train predictions, evidence and official reports
- `train_selection_table.csv`, `train_paired_events.csv`, `train_sparse_stuck_alerts.csv`
- `train_causality_audit.csv`, `determinism.json`
- `tests.log`, `train_run.log`, `validate_refusal.log`
- `FINDINGS.md`

## Commands (PYTHONHASHSEED=0, PYTHONDONTWRITEBYTECODE=1, `../../work/.venv/bin/python -B`)

```
pytest -v -p no:cacheprovider tests/          → 96 passed (21 new)
scripts/run_sparse_stuck.py manifest           → saved 2026-11-06T22:52:54Z (before scoring)
scripts/run_sparse_stuck.py train              → 217.6 s; sealed 22:56:32Z; selected S0
scripts/run_sparse_stuck.py validate           → refused: no deployable candidate passed
```

## Result

| ID | Det. | Type | Class | False+excess | Sensor type+channel | Composite | Gate failures |
|---|---:|---:|---:|---:|---:|---:|---|
| S0 | 18 | 8 | 14 | 6 | 3 | 59.2072 | control |
| S1 | 21 | 7 | 14 | 21 | 4 | 56.0045 | type, burden, not selectable |
| S2 | 17 | 8 | 14 | 11 | 3 | 55.3754 | detection, burden |
| S3 | 19 | 9 | 15 | 14 | 4 | 58.6292 | burden |

- **S3:** the commissioning-repeat rule cut false sparse-stuck alerts from 23 to 6 and kept the only real sparse stuck event (PUMP-01-E04, correct type and channel). It fails only the burden gate.
- **S2:** removing the sparse-stuck source drops the real stuck event as well.
- **Burden source:** even S2, with no sparse stuck alerts, has false+excess 11 (4 + 7), against S0's 6. The remaining burden comes from C1's per-source persistence repeating alerts, for example PUMP-04-E02 with 4 → 7 repeats. A sparse-stuck rule alone cannot pass the gate on C1.

## Correctness

- **Causality:** 486/486, covering prefix predictions, prefix evidence and future-value mutation at the 162 stored train cutpoints for each of S1/S2/S3.
- **Determinism:** seeds 0/1/7/9 identical.
- **Parity:** S0 matches the causal-B1 train report; S1 reproduces the sealed C1 core fields.

## Review-driven definition changes (all before the manifest and any scoring)

1. **New samples only.** S3's sparse stuck chain resets when the threshold freezes, so only new post-commissioning samples count. The test was red first: the old evidence reported 7 samples, 2 of them from the reference.
2. **Regime change ends a segment.** A change in `g.regime` while steady resets S3's sparse stuck chain, both during commissioning and after it. Two fixtures were red first.
3. **Reference samples.** Only samples taken after 10 minutes of steady running count; the fixture has 286 reference samples.

S1 parity and dense-only parity were preserved after every change.

## Hashes

| File | SHA-256 |
|---|---|
| `sparse_stuck.py` | `6e9135d67ba93c0a6eb8f77206159bf87eecfbbe4bc3aff437a5277ecf205e84` |
| `run_sparse_stuck.py` | `52528e596bafa3a59958dfa4517f5f60aeb24b38c056546e267354ceec7dd0b1` |
| `test_sparse_stuck.py` | `32feb8fa…` |

All other sealed hashes are in `manifest.json` → `sealed_sha256`.

## Limits

- **Contamination:** a freeze that starts during commissioning makes S3 insensitive.
- **Narrow coverage:** there is one real sparse stuck event in train.
- **Exact equality:** no resolution is assumed.
- **Regime reset:** has no effect on assets without a speed channel.
- **Batch replay only.**
- **E5 attribution:** the Task004 sensor-ablation evidence stays attributed to C0 = S0.

## Next action (main chat)

Review and commit. The demo and release detector stays S0 / causal B1. Any change to C1's persistence or repeat behaviour would be a separate registered experiment, not part of this task. Task005 is next.
