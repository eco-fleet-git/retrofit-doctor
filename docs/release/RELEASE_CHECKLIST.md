# Release checklist — Retrofit Doctor (Task007)

Status on 2026-11-07: **phase 2 export executed once under the recorded gate. Result: test predictions exported; quality unknown. Pre-gate access is disclosed, so this is not a pristine blind evaluation.**

Ownership:
- Claude Code owns this checklist, `docs/release/README.md` and `web/README.md`.
- Codex (main coordinator) owns the main README, `README.ru.md`, the presentation, Git, the gate and the release decision.

## A. Selected artifact and environment

- [x] Selected artifact: unchanged causal B1, k=6, persistence 15, 24 h commissioning reference. No improved model passed its gates: Task002, Task008 and Task005 E3; E4 was not testable.
- [x] Python 3.13.16 and an exact match of `requirements.lock.txt` are enforced before any data access (exit 4 otherwise).
- [x] PYTHONHASHSEED=0 is enforced at interpreter start. A wrong or missing seed triggers a pinned relaunch; if the pin still isn't in effect, the run exits 3 before data access. Setting the variable after start isn't trusted (tested).
- [x] Disclosure: the detector is **not seed-invariant**. AUDIT A03 was measured in Task005 as fault-type changes under seeds 1 and 7. No seed-invariance claim is made.

## B. Adapter checks (train / validation / fixtures, phase 1)

- [x] The adapter reproduces released causal B1 predictions exactly: train 43 rows, validation 15 rows.
- [x] 209 stored causal-B1 cutpoints were replayed through the adapter path: 0 failures.
- [x] The registered test-prefix audit (13 fixed offsets plus window end − 60 s; null-safe canonical comparison of every field) was run unchanged on train (98 cuts) and validation (28 cuts): 0 failures.
- [x] Two fresh pinned processes gave byte-identical train and validation CSVs.
- [x] Schema validator: exact template header, required non-null fields, targets only, `YYYY-MM-DDTHH:MM:SSZ`, scorer class/type vocabulary, confidence in [0,1], inside the asset window, sorted. Each listed violation has a fixture test.
- [x] Export refusals that have **dedicated tests**, each with the parquet read disabled: no recorded gate (isolated `tmp_path`); changed `assets.csv` identity; changed template identity; target set different from PUMP-10/11/12. The loader's refusal of a partial or extended test scope is also tested.
- [ ] Export refusals that are **implemented but have no dedicated test** (the earlier claim that every refusal was tested is corrected here):
  - gate present but not approving this exact manifest digest;
  - changed code hash;
  - changed shared-parquet hash;
  - an existing prior output (exit 6);
  - returned feature IDs that differ from the targets.

  These branches were only exercised indirectly or not at all.
- [x] The test loader is bound to exactly PUMP-10/11/12 with metadata split `test`.
- [x] 174 Python tests pass in the pinned environment (`results/release/tests_phase1.txt`).

## C. Data identity, exposure

- [x] `features_1min.parquet` SHA-256 `de25928738c45a5d6608d6c1a3e6e3eb69d612d23e99a9f184f3b23db4d9c52c` (10,433,571 bytes): matches the vendor manifest and the Task005 review. This is an opaque whole-file hash.
- [x] Identities of `assets.csv`, the submission template and the vendor `MANIFEST.json` are frozen in the gated manifest.
- [x] **Exposure incident disclosed and decided.** Before the gate, a deliberately broken loader gate let one pytest process read PUMP-10 feature rows into memory. Nothing was emitted or analysed. The coordinator classified the result as a fixed-model test export with disclosed pre-gate access, not a pristine blind evaluation (`docs/tasks/007-coordinator-review.md`). The manifest's exposure log was corrected by the coordinator before approval.

## D. Demo packaging

- [x] A fresh clone of committed `971fbaf`, with no `vendor/benchmark/data/` and no virtual environment, served the committed bundle with `/usr/bin/python3` 3.9.6 `http.server`. Every referenced file returned HTTP 200, and no external URL appears in `web/`.
- [x] `node --test tests/` in that clone: 44/44.
- [x] `web/README.md` quick start serves the committed bundle; regeneration is a separate pinned section.
- [ ] Browser rendering of a fresh checkout in an isolated, fresh browser profile: **not performed**.
- [ ] Browser-offline mode: **not claimed**. What was checked is no Internet dependency while localhost is available.
- [ ] Timed three-minute spoken rehearsal by a human: **pending**.
- [ ] Final user acceptance of the application: **pending**. Only the light visual direction is approved.

## E. Gate and export (phase 2)

- [x] Coordinator committed the reviewed adapter (`1a87601`) and the gate (`5ba7881`).
- [x] `BLIND_GATE.json` approves manifest SHA-256 `a98b0285bef1869e944ac3a7f5552b1d48634cdf4ca3f98df22e9e28ba1b1aeb`. The manifest was not regenerated or overwritten by the implementer.
- [x] `../../work/.venv/bin/python -B scripts/release_export.py export` was executed once (exit 0, empty stderr) and wrote:
  - `results/release/predictions_test.csv`: 23 rows (PUMP-10: 3, PUMP-11: 4, PUMP-12: 16), SHA-256 `093be3f660fdeb397dafed8707a880f15c9219b5afcff23d4cb21dda67781da9`
  - `predictions_test.sha256`
  - `execution_manifest.json`, with matching hash, row counts and manifest digest
  - `test_prefix_audit.json`: 42 checks, 0 failures, 14 per asset; counts and pass/fail only
- [x] Post-export verification was limited to schema, checksums and audit counts: header equals the template, the validator found no problems, and all three digests agree. No prediction content was inspected and nothing was retuned. The coordinator verified independently.
- [x] Statement: **Test predictions exported; quality unknown.**
- [x] Release README written: `docs/release/README.md`.
- [x] Coordinator accepted the release contents and verified GitHub visibility is private. These files form the final release commit; push verification is reported in the delivery message. No public hosting or competition upload.

## F. Status for Codex-owned files

The coordinator reports that the main README and the presentation (Spaces state 11) are already updated. The release README uses the same model statement, prediction filename, hash and exposure wording.
