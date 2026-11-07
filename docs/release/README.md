# Retrofit Doctor — release package

7 November 2026. The English release entry point for the jury and reviewers. All benchmark data is **synthetic**. The app is advisory and read-only: it cannot operate equipment. No physical device was built. The repository's main `README.md` (English) and the archived `README.ru.md` are owned by the coordinator and link here. The Russian working analyses stay available under `docs/experiments/`.

## 1. Run the demo locally (no dataset, no cloud, no analysis dependencies)

From the repository root, with any Python 3:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 -d web
# open http://127.0.0.1:8765/
```

- **Bundle:** the generated data bundle in `web/data/` is committed.
- **Network:** the app makes **no Internet requests**, but it needs this local server.
- **Offline mode:** switching the browser itself to offline mode can block new localhost fetches, and is not a supported way to run it.
- **Rehearsal profile:** use a fresh browser profile; Planner drafts live in that browser's local storage.
- **Checked in phase 1:** a fresh clone of commit `971fbaf`, with no dataset and no virtual environment, served every referenced file (HTTP 200) using `/usr/bin/python3` 3.9.6. `node --test tests/` passed 44/44 in that clone.
- **Not checked:** browser rendering of that fresh clone (see section 7).

Details: [`web/README.md`](../../web/README.md).

## 2. What works

- **Fleet Overview** shows 12 independent pumps:
  - 7 train pumps, listed without replay;
  - 2 validation pumps (PUMP-08/09) with a causal replay;
  - 3 test pumps (PUMP-10/11/12) showing public metadata only, with no data and no diagnosis.
- **Pump Detail** replays at an explicit UTC clock. Nothing after the clock is drawn. It includes evidence cards, a sensor schematic with installed, missing and proposed points, and freshness/reference states.
- **Evidence & Validation:** the causal baseline per event, including misses and wrong types, plus the measured sensor-ablation evidence.
- **Retrofit Planner:** measurement hypotheses, an editable lifecycle cost model with an illustrative negative case and a defer option, and drafts saved in the browser.

## 3. Model choice and measured evidence

**Frozen test-release detector: unchanged causal B1** (k = 6, persistence 15 min, 24 h causal commissioning reference). Nine bounded candidates were evaluated under registered train gates, and none justified replacing it:

| Experiment | Candidates | Result |
|---|---|---|
| Task002 | C1–C5 | Burden and type gates failed |
| Task008 | S2/S3 | Burden and detection gates failed |
| Task005 E3 | R1/R2 | Seed, causality and type gates failed |
| Task005 E4 | — | Not testable: no prior support |

No improvement was claimed in that historical release round. Subsequent Task013/014 research selected Z995 (train correct type8→10/26; descriptive validation4→5/9, unchanged detection and false/repeat burden). This new research comparison does not replace the frozen B1 test export. Its validation gain is waveform-only; synthetic, previously inspected data does not establish field generalization. The current hypothesis summary is in [`docs/experiments/RESULTS.md`](../experiments/RESULTS.md). Detailed findings:

- [causal B2](../../results/causal_b2/CAUSAL_B2_FINDINGS.md)
- [sensor mask/restore](../../results/sensor_ablation/FINDINGS.md)
- [sparse-stuck follow-up](../../results/sparse_stuck_followup/FINDINGS.md)
- [regime/reference experiments](../../results/regime_reference/FINDINGS.md)
- causal baseline: [`CAUSAL_B1_FINDINGS.md`](../../CAUSAL_B1_FINDINGS.md)

Validation (PUMP-08/09, inspected during development, so descriptive only):

| Detector | Composite | Detected | Correct type | Correct class | False+excess alerts in 14 days |
|---|---:|---:|---:|---:|---:|
| Causal B1 | 76.01253946421124 | 8/9 | 4/9 | 8/9 | 1 |
| Original offline B1 (uses future data) | 78.01253946421124 | 8/9 | 4/9 | 8/9 | — |

These are synthetic benchmark scores, not field accuracy.

**Reproducibility constraint.** B1's diagnosis iterates a Python set, so its outputs depend on the hash seed. Task005 measured fault-type changes under seeds 1 and 7. Every released result uses **Python 3.13.16, the exact `requirements.lock.txt`, and PYTHONHASHSEED=0 set at interpreter start**. The export runner enforces this and refuses or relaunches otherwise. The detector is **not seed-invariant**.

## 4. Test prediction export

| Item | Value |
|---|---|
| File | [`results/release/predictions_test.csv`](../../results/release/predictions_test.csv) |
| SHA-256 | `093be3f660fdeb397dafed8707a880f15c9219b5afcff23d4cb21dda67781da9` (also in `predictions_test.sha256` and `execution_manifest.json`) |
| Rows | 23 (PUMP-10: 3, PUMP-11: 4, PUMP-12: 16); the 7 columns of the organizer template; schema check passed |
| Prefix-invariance audit | 42/42 registered cutpoints passed (14 per asset); pass/fail and counts only (`test_prefix_audit.json`) |
| Exact manifest approved by the gate | `release_manifest.proposed.json`, SHA-256 `a98b0285bef1869e944ac3a7f5552b1d48634cdf4ca3f98df22e9e28ba1b1aeb` (coordinator-corrected exposure log) |
| Gate | `BLIND_GATE.json`, reviewed adapter commit `1a87601`, gate commit `5ba7881` |
| Command | `../../work/.venv/bin/python -B scripts/release_export.py export`, executed once, exit 0 |
| Adapter | `scripts/release_export.py`, SHA-256 `0476ec79…`. Fixed causal B1; no parameters chosen at export |

**Status: test predictions exported; quality unknown.** No organizer labels or scoring are available here, and no test outcome was inspected.

**Exposure disclosure — this is not a pristine blind evaluation.**
- Before the gate, during a deliberate gate-removal mutation test, one pytest process read PUMP-10 feature rows into memory. No values were printed, saved, compared or analysed, and no model or parameter decision followed.
- The coordinator classified the result as a **fixed-model test export with disclosed pre-gate access**. See [`docs/tasks/007-coordinator-review.md`](../tasks/007-coordinator-review.md) and [`docs/tasks/007-handoff.md`](../tasks/007-handoff.md).
- Separately, earlier integrity checks hashed vendor files, including test partitions and organizer test-prediction files, as opaque bytes. These were never parsed.

## 5. Presentation, scripts and fallback

- **Slides:** [`presentation/retrofit-doctor-pitch.pdf`](../../presentation/retrofit-doctor-pitch.pdf), an eight-page 16:9 offline projection fallback. The editable deck is maintained by the coordinator; see [`presentation/README.md`](../../presentation/README.md).
- **Three-minute slide narration:** [`presentation/PITCH_SCRIPT.md`](../../presentation/PITCH_SCRIPT.md).
- **Alternative three-minute live walkthrough:** [`docs/tasks/006-demo-script.md`](../tasks/006-demo-script.md).
- **Longer answers and deployment limits:** [`presentation/JURY_QA.md`](../../presentation/JURY_QA.md).
- **Fallback screenshots** (light interface, Task006 build), in presentation order:
  1. [`review/task006/01-fleet-1440.png`](../../review/task006/01-fleet-1440.png)
  2. [`03-pump08-alert-1440.png`](../../review/task006/03-pump08-alert-1440.png)
  3. [`02-schematic-pump08-1440.png`](../../review/task006/02-schematic-pump08-1440.png)
  4. [`06-evidence-1440.png`](../../review/task006/06-evidence-1440.png)
  5. [`05-evidence-ablation-1440.png`](../../review/task006/05-evidence-ablation-1440.png)
  6. [`08-planner-first-screen-1440.png`](../../review/task006/08-planner-first-screen-1440.png)
  7. [`07b-proposal-defer-1440.png`](../../review/task006/07b-proposal-defer-1440.png)

  Narrow-screen (390 px) captures are in the same folder.

## 6. Optional hardware proposal

The proposal depends on the missing measurement. For PUMP-08, the flow/head/input-power path proposes flow measurement while reusing existing suction/discharge pressure and VFD power. A bearing-housing sensor is a separate option where mechanical-condition measurements are missing. New points require surveyed mounting, a cable or radio link, power and an appropriate gateway/display connection. This is a **proposal, not an installed or validated device**. Mounting, power, environment and service ownership remain open decisions. The measured sensor ablation shows mixed, synthetic information value, and does not support a hardware recommendation or ROI. The illustrative cost case loses EUR 2,200 a year (five-year NPV −EUR 15,500), so its decision is to defer.

## 7. Limitations and pending items

- **Data and scope:** synthetic data only, so there is no field validation. Validation results are descriptive, because that split was inspected during development. Batch replay assumes zero ingestion lag. No streaming or edge restart was tested.
- **Detector:** not seed-invariant (see section 3). Confidence is an uncalibrated rule score.
- **Test export:** quality unknown, with pre-gate access disclosed (see section 4).
- **Pending — human rehearsal:** a timed three-minute spoken rehearsal by a person hasn't happened. Automated browser checks and coordinator visual review ran (Task006); neither substitutes for a spoken rehearsal.
- **Pending — browser check:** rendering of a fresh checkout in an isolated fresh browser profile hasn't been checked; the phase-1 check was HTTP- and unit-test-level only.
- **Pending — accessibility:** no screen-reader or 200% zoom audit.
- **Pending — user acceptance:** the user approved the light visual direction only. Final acceptance of the application hasn't been given.
- **Prototype limits:** see the Task006 coordinator review — contained scrolling on phone tables, a long Planner, and partial Task003 allocation, provenance and quote-expiry requirements.

## 8. Reproduce the analysis (separate from the demo)

1. Restore the immutable organizer dataset at `vendor/benchmark/data/full/`. It is not in Git. Its identity: `features_1min.parquet` SHA-256 `de25928738c45a5d6608d6c1a3e6e3eb69d612d23e99a9f184f3b23db4d9c52c`, and see the vendor `MANIFEST.json`.
2. Create a Python 3.13.16 environment with exactly `requirements.lock.txt`.
3. Always start Python with `PYTHONHASHSEED=0`, for example `PYTHONHASHSEED=0 python -m pytest -q tests/`. Each experiment's commands are listed in its `docs/tasks/*-handoff.md`. The release runner checks the environment itself (`scripts/release_export.py selfcheck`).


## 9. Release identity and review

The fixed inference adapter was reviewed and committed at `1a87601`; its exact manifest gate is `5ba7881`. The implemented light UI and fallback captures are from `c63efdb`. The eight-slide presentation is Spaces state 11; the PDF matches its visible slides. The release commit packages these unchanged code artifacts, the output CSV and the final documentation; use `git log -1` to identify the checkout. Repository visibility was verified as private through the GitHub connector on 7 November. See [`coordinator_verification.json`](../../results/release/coordinator_verification.json) for independent checks. No public deployment or competition submission was performed.


## 10. Diagnostic-clarity iteration

Task009 updates the local interface after the first release: hypothesis → observed measurement → uncertainty → next engineering check, with technical details behind a disclosure. [Current diagnosis screenshot](../../review/task009/03-p08-1238-card-1440.png), [walkthrough and test coverage](../tasks/009-handoff.md), [coordinator review](../tasks/009-coordinator-review.md). The detector, committed data and issued test predictions remain unchanged. The pitch was subsequently refreshed for Task015 with the actual new comparison screen. Human final review remains pending.

## Later diagnostic comparison — Task015

The reviewed `#/diagnosis` route shows frozen Z995 research results alongside B1, including measured/derived evidence, old waveform ages, real before/at-alert gating and an unchanged error. Train correct types8→10/26; descriptive validation4→5/9, with detection and false/repeat burden unchanged. Validation gain is waveform-only on previously inspected synthetic data. See [Task015 review](../tasks/015-coordinator-review.md). The aligned presentation and local PDF now include these results. This changes neither the original B1 replay data nor the frozen test export. User feedback and spoken rehearsal remain pending.
