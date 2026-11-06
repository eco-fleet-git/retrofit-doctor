# Task 007 handoff — phase 1 (preparation), ready for the blind gate review

Date 2026-11-07. Implementer: Claude Code (sole code writer). Status: **phase 1 complete, including review round 1 (`007-review-round1.md`). The blind gate is NOT recorded. No export has run. One exposure incident is disclosed below.**

What did not change:
- No Git mutation or web code change; only the `web/README.md` text was corrected.
- No change to causal B1, vendor code or any sealed experiment.
- No labels, organizer test predictions or test outcomes were read.

Checklist: `docs/release/RELEASE_CHECKLIST.md`.

## Delivered

| File | Purpose |
|---|---|
| `scripts/release_export.py` | Release adapter (modes below) |
| `tests/test_release_export.py` | 24 tests. Every test that could reach test data has `read_parquet` disabled |
| `results/release/release_manifest.proposed.json` | Exact proposed release manifest; status `PROPOSED_FOR_COORDINATOR_GATE_NOT_EXECUTED` |
| `results/release/` | Phase-1 evidence; files listed below |
| `docs/release/RELEASE_CHECKLIST.md` | Completed phase-1 checklist, phase-2 items and status updates for Codex-owned files |
| `web/README.md` | Quick start serves the committed bundle; regeneration is a separate pinned section; verified facts only |

Adapter modes:
- `selfcheck` reports the interpreter and pin without touching data.
- `dev-check`, `dev-prefix-audit` and `repeat-check` run on train, validation and fixtures only.
- `manifest` writes the proposed release manifest.
- `export` is gated phase 2.

Phase-1 evidence in `results/release/`:
- `dev_check.json` and `dev_cutpoint_audit.csv`
- `dev_prefix_audit.json`
- `repeat_check.json`
- `dev/predictions_{train,validation}.csv`
- `tests_phase1.txt`

## Release boundary as implemented

- **Seed.** `main()` checks that PYTHONHASHSEED=0 was in effect at interpreter start (`sys.flags.hash_randomization == 0`) before importing any data code. Otherwise it re-executes the same interpreter once with the pin. If the pin is still missing, or relaunch is disabled, it exits 3 with "no data accessed". Setting the variable after start isn't trusted (tested).
- **Environment.** Python 3.13.16 and every line of `requirements.lock.txt` must match exactly, or it exits 4.
- **Gate (`export`), in this order, before any test-feature read:**
  1. `BLIND_GATE.json` exists, has `approved: true`, and contains the SHA-256 of this exact manifest.
  2. Code hashes equal the manifest.
  3. The parquet is `de25928738c45a5d…` (10,433,571 bytes).
  4. `assets.csv` and the submission template equal their frozen hashes.
  5. Manifest targets are exactly `PUMP-10/11/12`.
  6. No prior output exists.

  Any failure exits 5 (or 6 for an existing output) with "no data accessed".
- **Scope.** Targets are the constant `TARGETS`, never derived from metadata. The loader refuses any test-split request that isn't exactly those three assets with split `test`, uses predicate pushdown, and the export re-checks the returned feature IDs.
- **Output.**
  - `results/release/predictions_test.csv` contains the template's 7 columns only and passes schema validation.
  - Sidecar files: `predictions_test.sha256`, `execution_manifest.json` (row counts and hash, statement "Test predictions exported; quality unknown") and `test_prefix_audit.json`.
- **Prefix audit.**
  - Registered before access: offsets from `window_start_utc` of 2700, 21600, 43200, 86399, 86400, 86401, 86460, 129600, 172800, 259200, 345600, 432000 and 518400 s, plus window end − 60 s.
  - Each cut is an independent prefix run (closed windows only, clock = cut) compared with the saved full-run alerts up to the cut, on every submission field, null-safe and canonical, exact.
  - Only pass/fail and compared-row counts are written. A failure is disclosed, and predictions stay immutable.

## Checks run (pinned environment)

| Check | Result |
|---|---|
| Release tests | 24/24 (after review round 1 and the final hygiene fix) |
| Full Python suite | 174 passed |
| Adapter parity with released causal-B1 predictions | train 43 rows, validation 15: exact (`dev_check.json`) |
| Stored causal-B1 cutpoints through the adapter | 209/209 |
| Registered prefix audit, unchanged code, on development splits | train 98/98, validation 28/28 |
| Two fresh pinned processes | byte-identical: train `f4e08619…`, validation `0988340d…` |
| Wrong seed | relaunched pinned |
| Wrong seed with relaunch disabled | exit 3 before data |

Mutation checks, all caught and reverted:

| Mutation | Tests failing |
|---|---:|
| Trust a seed set after start | 1 |
| Test gate removed from loader | 1 |
| Test scope not bound to the targets | 1 |
| `assets.csv` identity unchecked | 1 |
| Prefix audit compares keys only | 1 |

Fresh checkout: a clone of committed `971fbaf` with no dataset and no venv, served by `/usr/bin/python3` 3.9.6. Every referenced HTML/CSS/JS file and the fleet, PUMP-08 and PUMP-09 data files returned HTTP 200. `replay-PUMP-11.json` returned 404, as designed: test pumps are metadata-only. There are no external URLs in `web/`, and `node --test tests/` passed 44/44.

**Not done:** browser rendering in an isolated fresh profile, browser-offline mode (not claimed) and a timed human rehearsal.

## Exposure incident — coordinator decision required

**What happened.** During mutation testing before review round 1, I deliberately disabled the loader's test gate and ran the test suite. The test `test_test_assets_closed_without_gate_permission` called `R.load(["PUMP-10"])`, so the mutated loader read PUMP-10 rows from `features_1min.parquet` into that pytest process's memory.

**What was and wasn't seen.**
- Nothing was printed, saved, compared, summarised or analysed.
- The only output I saw was the line `1 failed, 15 passed`; the assertion failure was "DID NOT RAISE".
- The process then exited.
- No detector or parameter has been chosen since. The adapter is the fixed causal B1, with no tunable parameter.

**Prevention.** The test now replaces `pd.read_parquet` with a function that raises. The same mutation now fails with "test telemetry read attempted" and reads nothing. Every test that could reach test data has the same protection.

**Assessment.** No outcome information was obtained and no algorithm decision is possible from it. But it was a test-measurement read before the gate, contrary to the phase-1 rule. Please record it in the exposure log and decide whether it affects the blind claim.

## Final test-hygiene fix (coordinator request)

`test_export_refuses_without_recorded_gate` no longer depends on the real gate being absent. It now points the module's gate and output paths at an isolated `tmp_path`, keeps `read_parquet` forbidden, and calls `export()` in-process (expects exit 5 and "no data accessed").

To confirm the suite stays valid after an approved release, I briefly created a simulated `results/release/BLIND_GATE.json` with `manifest_sha256: "simulated"`, a value that can never match a manifest. The focused tests passed 24/24 with it present, and the file was deleted immediately; no gate file exists now. Re-run afterwards: full suite 174/174 (`results/release/tests_phase1.txt`).

## Hashes (proposed release identity)

| File | SHA-256 |
|---|---|
| `scripts/release_export.py` | `0476ec7904116ea713db28fde914f5ea366fcccb5d1ce338cc438625806e63be` |
| `tests/test_release_export.py` | `e6e5e5eff51b1054ef19fa788d12e84a689d06cd7478484e18b9a9f6eba52e5f` (after the final test-hygiene fix; tests are not part of the release code identity, so the manifest is unchanged) |
| `results/release/release_manifest.proposed.json` | `0980f3b0307b2c62c56c247f7fb551537fec89e3343724d162be1f662a044e32` |
| `causal_b1.py` | `c637e0f8…` |
| `baselines.py` | `4bf291d6…` |
| `scoring.py` | `5293c2e4…` |
| `requirements.lock.txt` | `09030a82…` |
| `assets.csv` | `bf80906062ee87861adcf0d94accbf303b49b6c8c4f9060bbd3d5318dbeaef69` |
| `predictions_template.csv` | `98f8d72f7dd0ae631a553b50a15080aadb83d0f15e18e7efe6f6a3e5eba61502` |
| `features_1min.parquet` | `de25928738c45a5d6608d6c1a3e6e3eb69d612d23e99a9f184f3b23db4d9c52c` |
| `web/README.md` | `4cf7192b…` |

The manifest records `git.head = 971fbaf` with the uncommitted phase-1 files listed. After you commit, either gate this manifest as-is (its code hashes stay valid) or re-run `manifest` to name the release commit. Re-running changes the manifest's SHA-256, which the gate must then contain.

## Next (coordinator)

1. Review and commit.
2. Decide on the exposure incident.
3. Write `results/release/BLIND_GATE.json` for the exact manifest SHA-256.
4. Hand phase 2 back to me: `../../work/.venv/bin/python -B scripts/release_export.py export`, then the release README.
