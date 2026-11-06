# Task 001 handoff — first local demo slice

Date 2026-11-06. Implementer: Claude Code. Status: working prototype slice ready for review. **Not visually approved by the user; not a UX Pilot design; no field validation.** No Git operations performed.

## Delivered

| File | Purpose |
|---|---|
| `scripts/export_demo.py` | Deterministic exporter → `web/data/`. Reads `assets.csv` (all 12, metadata only), filters to PUMP-08/09 **inside** the Parquet read, recomputes `causal_features` at window end, re-derives alerts and asserts they equal `results/causal_b1/predictions_causal_validation.csv`. Embeds SHA-256 of 9 inputs. |
| `web/` | Static app (vanilla ES modules, no build, no new dependencies). Fleet Overview, Pump Detail replay, skeletal Retrofit Planner, Evidence & Validation. `web/README.md` has run/test commands. |
| `web/js/replay.js` | Pure as-of boundary: `sliceReplay()` is the only data path into rendering. |
| `tests/test_demo_export.py` | 9 tests: only 08/09 features read, no test IDs in replay files, 12 assets 7/2/3, test channel counts 11/6/13, determinism, provenance, locked figures, verbatim strainer alert, no first-day z, sparse T1 not forward-filled. |
| `tests/web_replay.test.mjs` | 7 tests mapped to A05–A08, A10–A13 (literal expected values from STATES_AND_ACCEPTANCE). |

Behaviour: paused replay with visible UTC as-of clock (±1 min/±1 h, slider, UTC time input, Play with 1/10/60 min steps, “End of replay”); clock kept per asset and in URL (`#/pumps/PUMP-08?t=…`); reference states incl. “Reference window complete · waiting for first post-reference minute”; packet gap state; latest visible alert vs “No baseline alert in this visible history” (never “healthy”); evidence card (verbatim evidence/action, rule confidence as uncalibrated score with exact value, observed z at the alert minute, rule paraphrase, alternatives marked not evaluated, missing measurements split into not-instrumented vs not-in-any-tier, next check); charts plotted at window end with As-of edge, sparse T1 channels as dots; sensor inventory with native interval, last-sample window, age range, within cadence/overdue/no measurement/not instrumented; retrospective label overlay off by default, reset on asset change, onset ≤ as-of, later end/deadline withheld. Test pumps: “Blind test · Metadata only”, “Diagnosis unavailable”, no fetch path (no replay file in metadata). Train pumps: “Replay not loaded”. Planner: measured / proposed (untested hypothesis, not assessed) / assumptions; comparison toggle disabled “Not yet evaluated”. Evidence: values read from `comparison.csv`, `verification.json`, per-event files; ground truth beside, not merged with, predictions.

## Verification run (2026-11-06, macOS arm64, `../../work/.venv/bin/python`, Node v26.12.0)

```
PYTHONHASHSEED=0 python scripts/export_demo.py      → fleet.json 29 054 B (4a6afd7c810f), replay-PUMP-08 1 794 404 B (3ea5992774d0), replay-PUMP-09 2 005 489 B (fda4274d5e2e); ~1.4 s; identical hashes on re-run
PYTHONHASHSEED=0 python -m pytest -q tests/          → 27 passed (9 new + 18 existing causal tests)
node --test tests/web_replay.test.mjs                → 7 passed
```

Mutation check: changing `visibleCount` to `Math.ceil` and allowing alerts ≤ as-of + 1 min made A05, A06 and A12 fail; code restored, 7/7 pass.

Browser smoke (headless Chromium via CDP, script kept outside the repo; served with `python -m http.server 8765 -d web`): 1440×900 Fleet, PUMP-08 at 12:37/12:38/24:00/06:00 day 1/gap 2025-09-13 01:00, PUMP-12, unknown pump, Planner, Evidence; 390×844 Fleet, PUMP-08, Evidence. Results: page-wide horizontal overflow 0 px everywhere; 0 console errors/exceptions; expected copy present (exact composite scores are in a collapsed “Exact composite scores” disclosure and in cell titles); label toggle left the evidence card text identical and withheld E01 end at 2025-09-11 06:00; “−1 min” from 12:38 removed the alert and updated the URL; Tab order on Fleet reaches search, filters, reset, validation link, table region, row links with visible outline. Not checked: screen reader, 200 % zoom, 1280×720, three-minute rehearsal, offline cold start on another machine.

## Review fix 1 — chart label clipping (2026-11-06, after focused visual review)

Defect: on `p08-1440.png` the right-edge “As of” and “! alert” labels collided and the alert label was clipped at the SVG boundary. Fix in `web/js/app.js` `svgChart()`: “As of <MM-DD HH:MM>” moved to the top margin, right-anchored at the plot edge; alert labels within 60 px of the right edge are end-anchored to the left of their marker, with a white halo. Also `web/index.html`: empty inline favicon (removes the only console entry, a `/favicon.ico` 404). No data or detector change; no new tests (a visual position rule would only mirror the implementation).

Browser QA (Playwright from the provided Node runtime, `channel: 'chrome'`, `headless: true`, fresh browser context per viewport; script outside the repo), PUMP-08 at `2025-09-10T12:38:00Z`:

| Viewport | Page overflow | Chart text outside SVG | Label overlaps (title / As of / alert) | Console errors |
|---|---|---|---|---|
| 1440×900 | 0 px | none (2 charts) | none | 0 |
| 390×844 | 0 px | none (2 charts) | none | 0 |

Screenshots inspected for both viewports. Re-run after the fix: exporter hashes unchanged (`4a6afd7c810f`, `3ea5992774d0`, `fda4274d5e2e`); `pytest -q tests/` 27 passed; `node --test tests/web_replay.test.mjs` 7 passed.

Observed but not changed (outside this fix): at 390 px the SVG scales down uniformly, so axis/label text renders ≈5 px — readable layout needs a narrow-width chart variant (taller viewBox or HTML labels). In the z chart the right-edge alert label sits across the +6 threshold line (legible thanks to the halo).

## Limitations / deviations

- Replay files contain the full validation week; the future is excluded at render time by `sliceReplay`, not by per-cutoff bundles. Test files and test telemetry are never in the bundle.
- Bundle ~3.8 MB (means rounded to 4 dp, z to 2 dp for display; alerts verbatim strings).
- Native update intervals mirror `vendor/.../sensors.py::channel_specs` rule (T1 wireless block = `wireless_update_s`, ambient 10 s, else 1 s); exact raw sample second is unknown, so age is shown as a 1-minute range. Overdue = lower bound > native interval + one window (UI rule, not a detector rule).
- Alternatives/next checks/missing-measurement lists in `web/js/knowledge.js` are hand-written engineering prompts (labelled as not evaluated); review by the domain owner needed.
- Not implemented: train-asset replay, planner draft persistence/Undo (A19, A27), fleet filters in URL, Retry fixture tests for A21/A22 source failure (error UI exists but only manually reasoned), original-B1 overlay in Pump Detail, dark mode.
- Fleet loads both validation replays (~3.8 MB) to show latest visible alert.

## Next actions

1. User visual/engineering review of the replay flow (PUMP-08 12:37→12:38; PUMP-09 E04 timeline at 2026-02-11 06:28).
2. Planner draft save/reset with honest feedback (A18–A20, A27).
3. Source-failure fixtures for A21/A22 and a 1280×720 + keyboard pass on Pump Detail.
4. Codex to review/commit `scripts/export_demo.py`, `web/`, `tests/test_demo_export.py`, `tests/web_replay.test.mjs`, this file.
