# Retrofit Doctor — local demo UI

Static, offline browser app over a deterministic JSON bundle. No build step, no npm dependencies, no server logic, no database. Advisory/read-only: the UI cannot send anything to equipment.

## Run the demo (committed bundle; no dataset, no analysis dependencies)

The generated bundle in `web/data/` is committed. From the project root, any Python 3 with its standard library is enough:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 -d web     # then open http://127.0.0.1:8765/
```

A static server is needed because browsers block `fetch()` of local files from `file://`. The app makes no Internet requests; it needs only this local server. Switching the browser itself to offline mode can block new localhost fetches, so that is not a supported way to run it. Use a fresh browser profile for rehearsal; drafts live in that browser's local storage.

Verified on 2026-11-07 from a fresh clone of commit `971fbaf` without `vendor/benchmark/data/` or a virtual environment, using `/usr/bin/python3` 3.9.6: every referenced HTML/CSS/JS file and data file returned HTTP 200, and no external URL appears in `web/`. In the same clone, `node --test tests/` (Node 26.12) passed 44/44 on the committed bundle. This was an HTTP-level and unit-test check, not a browser rendering check.

Only PUMP-08/09 (validation) have full replay files. The new `#/diagnosis` view provides four source-verified historical cases from train/validation and the frozen Z995 comparison with B1. It has a separate `diagnosis-comparison.json` bundle; original replay files remain unchanged. PUMP-10/11/12 (test) are metadata only. See `../docs/tasks/015-coordinator-review.md` and the Task015 handoff for checks and limits.

## Language and visual walkthrough

Start at `#/fleet`. The EN / RU switch stores its preference locally (`rd-lang`), with English as the fresh-browser default. Switching changes the display language, not the data, observation clock, route or engineering draft. Raw source outputs and historical technical material retain their original wording where indicated.

The main PUMP-04 button opens a recorded warning with the hypothesis, actual pressure/flow charts, an installed-sensor map and an advisory next check. PUMP-02 and PUMP-08 show earlier vibration-feature comparisons with an explicit recording timeline; these are not invented waveforms. PUMP-01 illustrates an unresolved cause with a missing flow measurement. The before-warning control hides inference and evidence that are not yet available; the schematic then shows static inventory only. All full explanations, limitations and source values remain available in disclosures.

The sensor diagram is generic: passport inventory supports the channel list, not an actual installation drawing or paired-pump topology. The full comparison and original replay bundles are unchanged. See `../docs/tasks/017-coordinator-review.md` for the reviewed interface and its limits.

## Local systems and data readiness

Open `#/systems` or choose **Add system** on the overview. The four-step EN/RU wizard collects the site and engineering question, pump/motor/valve passport, device and measurement-point configuration, and data readiness. It accepts a local CSV using the downloadable template or an explicitly selected historical PUMP-04 challenge minute. The network/gateway option stores a plan only: it does not connect or fetch data.

Installed and proposed sensors, received channels and mapped channels are separate. Ps/Pd must be mapped to the pump taps before the pressure-rise chart is shown. Unknown ratings stay unknown; nominal rpm does not replace measured speed. A design point is not a pump curve. Additional measurements are recommendations, not automatic purchases or equipment controls.

Saved systems use `rd-systems-v1` in this browser (maximum 20). New imports retain the full bounded analysis series (up to 10000 rows / 2 MB input) plus a sampled preview; quota errors are reported. Earlier thinned records require reimport for analysis. Unsaved drafts survive language/step changes but not reload. No network ingestion or saved-system export/delete UI is implemented.

The optional Q–H reference editor takes 2–20 pairs, reference speed, provenance/status and applicability acknowledgement. Density and pressure-tap assumptions must be supplied. Comparison uses linear interpolation within the curve range, with optional approximate affinity scaling. No extrapolation or substitution of nominal for measured speed. User-configured comparison bands and fixed data/regime checks are engineering assumptions, not certified limits.

The analysis examines one closed UTC minute at a time and shows a causal time chart, a Q–H operating point, plausible explanations and the next independent measurement. It abstains for missing reference/data, gaps and unsupported/transient regimes. Agreement with a curve does not establish overall equipment health. Mechanical values are descriptive only; energy efficiency is not calculated. This is an advisory hydraulic consistency check, not a validated general fault classifier.

Open **Illustrative examples** on My systems to create a separate draft or download a CSV: stable, low head, changing regime, missing flow and outside curve range. All five are authored synthetic demonstrations, not manufacturer curves or diagnostic accuracy evidence.

Run all focused browser-model checks with `node --test --test-timeout=30000 tests/*.mjs`. The [Task022 coordinator review](../docs/tasks/022-coordinator-review.md) records checks and limitations.

## Regenerate the bundle (analysis environment only)

Regeneration needs the immutable organizer dataset restored at `vendor/benchmark/data/full/` and the pinned environment: Python 3.13.16 with exactly `requirements.lock.txt` (the original environment is `../../work/.venv`). PYTHONHASHSEED must be 0 at interpreter start.

```bash
PYTHONHASHSEED=0 python scripts/export_demo.py          # rewrites web/data/{fleet,replay-PUMP-08,replay-PUMP-09}.json
```

## Test

```bash
PYTHONHASHSEED=0 python -m pytest -q tests/test_demo_export.py   # exporter (needs the dataset): split separation, provenance, determinism, locked figures
node --test tests/web_replay.test.mjs                            # as-of slicing boundary on the committed bundle (Node ≥18)
```

## Structure

- `index.html`, `styles.css` — shell and styles.
- `js/replay.js` — pure as-of logic: `sliceReplay()` is the only path from bundle to rendering; reference, freshness, packet and diagnostic states.
- `js/knowledge.js` — rule paraphrases of vendor B1 `diagnose()` and engineering prompts (alternatives, missing measurements, next checks), labelled as not evaluated by the detector.
- `js/explain.js` — pure selected-alert explanation (hypothesis, observations at the alert minute, gaps, alternatives, next check, technical fields); inputs are only the as-of view, the selected alert and the static passport.
- `js/app.js` — hash routes `#/fleet`, `#/pumps/:id?t=<UTC>`, `#/pumps/:id/retrofit`, `#/evidence`, `#/diagnosis`, `#/systems`, `#/systems/new`, `#/systems/:id`, `#/systems/:id/edit`.
- `js/systems-model.js`, `js/systems-view.js` — local system onboarding, strict CSV import, persistence and conservative readiness checks.
- `js/hydraulic-analysis.js`, `js/analysis-view.js` — pump references, causal minute assessment, explanation and graphs for local systems; isolated from benchmark inference.
- `js/i18n.js`, `js/ru-text.js` — local display translations, without a translation service.
- `js/review-visuals.js` — clock-gated review visuals and a passport-based single-pump diagram.
- `data/` — generated bundle (synthetic benchmark data, provenance + SHA-256 of inputs inside `fleet.json`).

The comparison exporter is `scripts/export_diagnosis_comparison.py`; it reads only the frozen train/validation results and the documented source inputs, without re-scoring. The browser explanation helper is `js/comparison.js`, with view code in `js/diagnosis-view.js`. Run `node --test tests/web_comparison.test.mjs` for focused source/clock checks; source-hash verification requires the restored analytical inputs. Viewing the committed app does not.
