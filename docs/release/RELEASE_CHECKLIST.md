# Release checklist — Retrofit Doctor (Task007)

Status on 2026-11-07: **phase 1 (preparation) done; the blind gate has NOT been recorded; no test export has run.** Owner of this checklist and of `web/README.md`: Claude Code. The main README, `README.ru.md` and the presentation are owned by Codex (main coordinator), as are Git, the gate and the release decision.

## A. Selected artifact and environment

- [x] Selected artifact: unchanged causal B1, k=6, persistence 15, 24 h commissioning reference. No improved model passed its gates: Task002, Task008 and Task005 E3; E4 was not testable.
- [x] Python 3.13.16 and an exact match of `requirements.lock.txt` are enforced before any data access (exit 4 otherwise).
- [x] PYTHONHASHSEED=0 is enforced at interpreter start. A wrong or missing seed triggers a pinned relaunch; if the pin still isn't in effect, the run exits 3 before data access. Setting the variable after start isn't trusted (tested).
- [x] Disclosure: the detector is **not seed-invariant**. AUDIT A03 was measured in Task005 as fault-type changes under seeds 1 and 7. No seed-invariance claim is made.

## B. Adapter checks (train / validation / fixtures only)

- [x] The adapter reproduces released causal B1 predictions exactly: train 43 rows, validation 15 rows.
- [x] 209 stored causal-B1 cutpoints were replayed through the adapter path: 0 failures.
- [x] The registered test-prefix audit (13 fixed offsets plus window end − 60 s; null-safe canonical comparison of every field) was run unchanged on train (98 cuts) and validation (28 cuts): 0 failures.
- [x] Two fresh pinned processes gave byte-identical train and validation CSVs.
- [x] Schema validator: exact template header, required non-null fields, targets only, `YYYY-MM-DDTHH:MM:SSZ`, scorer class/type vocabulary, confidence in [0,1], inside the asset window, sorted. Each violation is tested.
- [x] The export refuses without a gate, and refuses when the gate doesn't approve this exact manifest. It refuses when code, the shared parquet, `assets.csv`, the template or the targets have changed. It refuses a second export. Each refusal is tested with the parquet read disabled.
- [x] The test loader is bound to exactly PUMP-10/11/12 with metadata split `test`, and checks the actual returned feature IDs.
- [x] 174 Python tests pass in the pinned environment (`results/release/tests_phase1.txt`). The no-gate refusal test is isolated with `tmp_path`, so it stays valid after a real gate is recorded.

## C. Data identity, exposure

- [x] `features_1min.parquet` SHA-256 `de25928738c45a5d6608d6c1a3e6e3eb69d612d23e99a9f184f3b23db4d9c52c` (10,433,571 bytes): matches the vendor manifest and the Task005 review. This is an opaque whole-file hash.
- [x] Identities of `assets.csv`, the submission template and the vendor `MANIFEST.json` are frozen in the proposed manifest.
- [ ] **Exposure incident (disclosed; coordinator decision needed).** During phase-1 mutation testing, a deliberately broken test gate let one pytest process read PUMP-10 feature rows into memory. No value was printed, saved, compared or analysed; only "1 failed, 15 passed" was seen, and the process exited. The test now disables the parquet reader, so no mutation can repeat this. See `docs/tasks/007-handoff.md`.

## D. Demo packaging

- [x] A fresh clone of committed `971fbaf`, with no `vendor/benchmark/data/` and no virtual environment, served the committed bundle with `/usr/bin/python3` 3.9.6 `http.server`. Every referenced file returned HTTP 200, and no external URL appears in `web/`.
- [x] `node --test tests/` in that clone: 44/44.
- [x] `web/README.md` quick start now serves the committed bundle. Regeneration, which needs the dataset and the pinned environment, is a separate section. The fix is uncommitted.
- [ ] Browser rendering of the fresh clone in an isolated, fresh browser profile: **not performed in phase 1**. Do not reuse the user's profile or drafts.
- [ ] Browser-offline mode: **not claimed**. What was checked is no Internet dependency while localhost is available.
- [ ] Timed three-minute rehearsal by a human: not performed.

## E. Gate and export (phase 2, after the coordinator records the gate)

- [ ] Coordinator commits the phase-1 files. The manifest is regenerated after the commit if `git.head` must name the release commit; that changes its SHA-256.
- [ ] Coordinator writes `results/release/BLIND_GATE.json` = `{"approved": true, "manifest_sha256": "<sha of release_manifest.proposed.json>", ...}`.
- [ ] `../../work/.venv/bin/python -B scripts/release_export.py export` writes:
  - `results/release/predictions_test.csv`
  - `predictions_test.sha256`
  - `execution_manifest.json`
  - `test_prefix_audit.json` (pass/fail/counts only)
- [ ] Statement: **Test predictions exported; quality unknown.**
- [ ] Release README with the presentation/PDF, script, screenshots, experiment status, limitations, code revision and prediction filename, all aligned to the release commit.
- [ ] Private Git visibility verified and push done by the coordinator. No public hosting or upload.

## F. Status updates needed in Codex-owned files

1. **Quick-start command (main README):** `python3 -m http.server 8765 --bind 127.0.0.1 -d web`, which needs no dataset. Regeneration is separate and pinned.
2. **Model statement:** unchanged causal B1. No improvement claim. Reproducible only with PYTHONHASHSEED=0, and not seed-invariant.
3. **Planned prediction file:** `results/release/predictions_test.csv`. It doesn't exist yet. After export, state only "Test predictions exported; quality unknown".
4. **Offline wording:** say "No Internet dependency; needs the local server". Don't say "works with the browser offline".
