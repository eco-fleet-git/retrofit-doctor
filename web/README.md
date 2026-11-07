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
- `js/app.js` — hash routes `#/fleet`, `#/pumps/:id?t=<UTC>`, `#/pumps/:id/retrofit`, `#/evidence`, `#/diagnosis`.
- `data/` — generated bundle (synthetic benchmark data, provenance + SHA-256 of inputs inside `fleet.json`).

The comparison exporter is `scripts/export_diagnosis_comparison.py`; it reads only the frozen train/validation results and the documented source inputs, without re-scoring. The browser explanation helper is `js/comparison.js`, with view code in `js/diagnosis-view.js`. Run `node --test tests/web_comparison.test.mjs` for focused source/clock checks; source-hash verification requires the restored analytical inputs. Viewing the committed app does not.
