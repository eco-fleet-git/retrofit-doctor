# Task 002 handoff — causal B2 v1

Date 2026-11-06. Implementer: Claude Code (sole code writer for this task). Status: **protocol run complete; negative result; C0 (unchanged causal B1) retained.** No Git operations. web/, vendor/, original B1 and causal B1 code/results untouched. Runtime ≈ 40 min wall clock for the session (train selection run 301 s; validation < 10 s).

Full report: `results/causal_b2/CAUSAL_B2_FINDINGS.md`.

## Delivered

| File | Purpose |
|---|---|
| `src/retrofit_doctor/causal_b2.py` | Allowlisted split loader (rejects test); per-channel cadence/quality states (NOT_INSTALLED, FRESH, NO_NEW_SAMPLE, STALE, GATEWAY_GAP, INSUFFICIENT_REFERENCE, UNKNOWN_CADENCE); per-source evidence chains counting only new samples (≥3 updates, ≥15 min span); stuck on new values; gateway clock persistence; deterministic priority/tie order; B1 refractory (>12 h strict, 720 min retry); C2–C5 trajectory + ≥2 fresh quiet coupled channels; structured evidence table |
| `scripts/run_causal_b2.py` | `train` (6 candidates × 7 LOAO folds, official scorer, protocol §4 evaluator, causality audit, 4-seed determinism, gates, `selection.json` seal) and `validate` (refuses on hash change or second run) |
| `scripts/audit_causal_b2_cutpoints.py` | Supplemental train-only audit at the exact stored causal-B1 train cutpoints (162) |
| `tests/test_causal_b2.py` | 41 contract tests (fixtures: sparse normal/anomaly/stuck/stale, dense stuck vs rounded means, channel vs gateway gap, warmup gap, refractory boundary, two-cause split, planned stop, prefix/future mutation/row order/duplicates, hash seeds, step/ramp/noise/short history/coupled shortage, evidence fields, loader guard, missing-channel regression) |
| `results/causal_b2/` | r2 train outputs per candidate, selection table, audits, determinism, seal, validation (C0), tests log, `run1_invalid/` |

## Numbers

Train pooled (26 events, 49 asset-days): C0 59.2072 / 18 det / 8 type / 14 class / 6 false+excess; C1 56.0045 / 21 / 7 / 14 / 21; C2–C5 54.9105 / 21 / 6 / 14 / 20. Gates failed by every B2 candidate: type < C0 and burden > C0. Selected: **C0**. Validation (one sealed check, C0 only): 76.01253946421124, 8/9, 4/9, 8/9, 1 false+excess — reproduces baseline; no B2 candidate scored on validation.

Hypotheses: H4 not supported as registered (false sparse stuck: PUMP-01 healthy bearing-temp repeats 49.8 % of samples at 0.5 °C quantisation), mechanism works on fixtures and caught real stuck PUMP-01-E04; H5 contract verified on fixtures, benchmark inconclusive; H1 not supported (no DRIFT/STEP classified on train). E3–E5 not run.

## Verification

```
pytest tests/test_causal_b1.py tests/test_causal_b2.py   → 59 passed (18 B1 unchanged + 41 B2)
run_causal_b2.py train (r2)  → 1547/1547 cutpoints match (pred+evidence), 311/311 quality; seeds 0/1/7/9 identical
run_causal_b2.py validate    → C0 76.01253946421124
audit_causal_b2_cutpoints.py → 810 rows (162 stored train cutpoints × C1–C5; quality for C1 at all 162): 0 failures; causal_b2.py hash unchanged 9976d47a…
```

Mutation checks during development: making NO_NEW_SAMPLE reset chains (3 tests fail), stale after 3 intervals (1), dropping the 15 min span (8), dropping dense std=0 requirement (initially survived → added `test_dense_equal_means_with_live_variation_are_not_stuck`, then 1 fails). Code restored each time.

Defect found and fixed with diagnosing-bugs: r1 audit flagged 83/1547 cutpoints; cause was None-vs-NaN missing-channel dtype instability (identical alerts). Failing regression test first, then fix; r1 preserved as INVALID in `run1_invalid/` and recorded in `selection.json.prior_runs`. Not test-first: the bulk of the module and contract tests were written in one pass before the first run (no retrospective TDD claim).

## Limitations / disclosures

- r2 audit ≠ literal repeat of the 209 frozen cutpoints (shared RNG across candidates, no trailing-outage cuts, added alert boundaries; 47 validation cutpoints intentionally not replayed). Supplemental script covers the 162 stored train cutpoints exactly; `causal_features` is unchanged causal B1 code covered by its own audit.
- MANIFEST integrity pass hashes all 189 vendor files as opaque bytes, including 3 organizer test-prediction CSVs, 21 test-asset telemetry partitions and shared parquet/CSV with test rows. Hash-only — not parsed, no model or outcome access. "No test files read" would be inaccurate; "no test content parsed or inspected" is accurate.
- Useful diagnosis delay, coverage shares, macro average not implemented. Batch-only (no incremental restart). Exact-equality stuck (resolution not in public metadata). Confidence is heuristic.
- Findings placed in `results/causal_b2/` (task file scope), not repo root; results dir is `causal_b2` per Task002 (packet said `causal_b2_v1`).

## Sealed state — do not modify before review

`selection.json` code hashes: causal_b2.py `9976d47a…`, run_causal_b2.py `d77afebd…`, causal_b1.py `c637e0f8…` (control). The validate mode is now one-shot spent.

## Next action (main chat)

Review/commit. Any sparse-stuck fix (resolution-aware rule / longer run than healthy repeat distribution / reference repeat-rate) needs a new registered train-only experiment ID; validation is now further exposed only by C0. Then wait for next task.
