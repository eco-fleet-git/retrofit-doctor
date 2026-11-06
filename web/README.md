# Retrofit Doctor — local demo UI

Static, offline browser app over a deterministic JSON bundle. No build step, no npm dependencies, no server logic, no database. Advisory/read-only: the UI cannot send anything to equipment.

## Run

From the project root (any Python ≥3.11 with the project's locked requirements; the original environment is `../../work/.venv`):

```bash
PYTHONHASHSEED=0 python scripts/export_demo.py          # writes web/data/{fleet,replay-PUMP-08,replay-PUMP-09}.json
python -m http.server 8765 --bind 127.0.0.1 -d web      # then open http://127.0.0.1:8765/
```

A static server is needed because browsers block `fetch()` of local files from `file://`.

## Test

```bash
PYTHONHASHSEED=0 python -m pytest -q tests/test_demo_export.py   # exporter: split separation, provenance, determinism, locked figures
node --test tests/web_replay.test.mjs                            # as-of slicing boundary (needs the exported bundle; Node ≥18)
```

## Structure

- `index.html`, `styles.css` — shell and styles.
- `js/replay.js` — pure as-of logic: `sliceReplay()` is the only path from bundle to rendering; reference, freshness, packet and diagnostic states.
- `js/knowledge.js` — rule paraphrases of vendor B1 `diagnose()` and engineering prompts (alternatives, missing measurements, next checks), labelled as not evaluated by the detector.
- `js/app.js` — hash routes `#/fleet`, `#/pumps/:id?t=<UTC>`, `#/pumps/:id/retrofit`, `#/evidence`.
- `data/` — generated bundle (synthetic benchmark data, provenance + SHA-256 of inputs inside `fleet.json`).
