# Task 006 handoff — demo integration

Date 2026-11-07. Implementer: Claude Code (sole code writer). Working slice ready for review. **User visual approval is still pending.** No Git, no paid UX Pilot call, no test telemetry, no detector change, no new experiment run. Causal B1 (seed 0) remains the selected replay model.

## Changed files

| File | Change |
|---|---|
| `web/index.html`, `web/styles.css` | Approved light UX Pilot direction: sidebar with four destinations (Pump Detail / Planner follow the last pump), calmer palette, cards; narrow layout turns the sidebar into a top bar. No external CDN |
| `web/js/schematic.js` (new) | Pump–motor schematic driven by the passport: installed / installed-location-not-specified / not instrumented / proposed, shown by shape + text + colour; focusable points (Enter/Space/click) with channel, native cadence, physical source and placement caveat; legend; text-list equivalent; own scroll region at ≤600 px |
| `web/js/experiments.js` (new) | Evidence: H1–H7 outcomes (verbatim), sensor mask/restore per group (train + PUMP-09 descriptive, original denominators, restore check, paired changes incl. adverse), B2 C0–C5 with burden and gate failures + invalid r1, E3 R0–R2 (validation not run) + E4 not testable, sparse S0–S3 |
| `web/js/app.js` | Sidebar wiring; schematic in Pump Detail (replay and metadata-only pumps); experiments on Evidence; narrow charts drawn 1:1 (320-unit viewBox, 3 x ticks) inside a labelled scroller; focus moves to content on navigation only (first load keeps skip link → sidebar order) |
| `web/js/planner.js` | Compact Planner: decision summary first (decision, lifecycle result, draft state, next action, linked ablation evidence, illustrative-case button); error summary with "Go to field" (opens editor, switches option tab, focuses input); schematic with proposed points; proposed field architecture + physical proposal (present / proposed / to select after survey; defer → "No permanent device proposed"); cost editor and provenance behind a disclosure; installed list collapsed |
| `scripts/export_demo.py`, `tests/test_demo_export.py` | `fleet.json.experiments` read verbatim from reviewed `results/` artifacts and `docs/experiments/RESULTS.md`; those sources added to the hashed provenance inputs; 3 new tests |
| `web/data/*.json` | Re-exported. Replay data unchanged; replay files differ only in the extended provenance input list |
| `review/task003/browser-qa.mjs` | Opens the new editor disclosure; ENG-13 wording check updated to the new copy |
| `tests/web_physical_proposal.test.mjs` (new) | 4 tests for review round 2 (pressure sign, asset-specific package, defer/existing consistency) |
| `review/task006/` (new) | 19 screenshots, `browser-qa.mjs`, `browser-qa-result.txt`; `review/task003-rerun/` Task003 suite on the new layout |
| `docs/tasks/006-demo-script.md` (new) | Three-minute English walkthrough of the implemented interactions + offline fallback |

## Commands and results (2026-11-07, server `python -m http.server 8765 --bind 127.0.0.1 -d web`, kept running)

```
PYTHONHASHSEED=0 ../../work/.venv/bin/python scripts/export_demo.py   → fleet.json 168ab6cfa14c, replay-PUMP-08 51e245616848, replay-PUMP-09 47c0a0d52816
PYTHONHASHSEED=0 ../../work/.venv/bin/python -m pytest -q tests/test_demo_export.py   → 12 passed
node --test tests/web_*.test.mjs                                                          → 44 tests, 44 pass
node review/task006/browser-qa.mjs "$PWD/review/task006"                                  → 34/34 passed
node review/task003/browser-qa.mjs "$PWD/review/task003-rerun"                            → 47/47 passed (Planner ENG checks on the new layout)
```

Browser QA uses system Chrome (Playwright `channel: 'chrome'`, headless, fresh contexts). Highlights: verbatim strainer alert at 12:38 and its removal at 12:37 (backward clock); schematic keyboard selection and caveats; PUMP-12 metadata only and no `replay-PUMP-1x` request; ablation/B2/E3/E4 content; decision summary within the first 900 px; hidden invalid field reached from the error summary; save + reload; Tab from page load reaches the sidebar; 0 page overflow at 1440 and 390 on all four views; 0 console errors.

## Review round 1 (`006-review-round1.md`)

1. **390 px charts:** now drawn at 1:1 CSS pixels (320 × 230 coordinate box) inside a labelled scroller with three x ticks. Measured effective text size = SVG font size × rendered scale: minimum **11.0 px** (`12-chart-390.png`). The earlier QA used text box height, which hid the problem.
2. **390 px schematic:** fixed 680 px minimum width in its own scroll region with a visible "scroll sideways" hint; labels 14 px, codes 12 px, markers enlarged. Measured at 390: labels **12.5 px**, codes **10.7 px**, tap target **25 px**; page overflow 0 (`13-schematic-390.png`). Caption moved out of the SVG (no overlap with the bearing housing).
3. **Empty-draft badges:** status pills wrap inside cards; checked at 1440 and 1280 (`08a-planner-empty-*.png`) plus the populated negative example (`08-planner-first-screen-1440.png`).

## Review round 2 (`006-review-round2.md`)

Tests for points 1, 3 and 4 were written first and observed failing (missing `physicalPackage` export), then fixed.

1. **Pressure sign:** suction caveat now reads "Discharge minus suction pressure is the measured pump pressure rise; converting it to pump head needs fluid density, tap elevations and velocity corrections. It is not a strainer or heat-exchanger differential pressure."
2. **Element and status together:** the physical package is a full-width section with the architecture path beside a wrapping element/status list (stacks below 900 px). Browser check: every status pill lies inside the panel and the viewport at 1440, page overflow 0 (`07-proposal-flow-1440.png`).
3. **Complete, asset-specific package:** `physicalPackage()` (pure, `web/js/planner-content.js`) uses the selected pump's passport: existing instruments are listed as "Present · reuse where verified" with their source (e.g. PUMP-08 suction/discharge transmitters on PLC input, motor input power from the VFD — no new power meter); only missing points are proposed (PUMP-03 gets suction transmitter, flow meter and power meter). Pressure-tap elevations/reference and head corrections, and a pipe survey, are survey rows.
4. **Decision consistency:** for Defer and Use existing signals, `proposedChannels()` returns none, so no proposed markers are drawn; the architecture says "no new measurement point (decision: …)", drops the mounting/power question, and stored hypotheses are listed as "not part of this decision (kept in the draft)". Candidates are not deleted (`07b-proposal-defer-1440.png`).

No detector, data or test-split change; replay and Task003 Planner suites re-run (47/47).

## Requirement status

Implemented: approved style; schematic with the documented location semantics (no mechanical gauges; pump ΔP ≠ strainer/exchanger ΔP; fluid-temperature tap unspecified; flow/valve schematic; RPM only where measured; summary features ≠ waveforms; one point ≠ every bearing); proposed points from Planner hypotheses; field architecture with boundary questions and independent controls; physical proposal incl. "no permanent device"; reviewed experiments with denominators, burden, restore check, adverse cases, invalid r1, not-run/not-testable status; compact Planner with error summary; chart readability at 390; demo script.

**Deferred / not done:**
- Optional expanded cooling concept (seawater ↔ LT freshwater exchanger) not implemented in the app; the existing `diagrams/ship-cooling-concept.*` remains the reference.
- Ablation "useful-diagnosis delay" is stated as not implemented; no per-hour timing metric is shown.
- The ablation evidence link in the Planner covers three candidate types (vibration, suction, flow+power); component ΔP and valve/winding have no ablation evidence.
- At 390 px the Planner cost editor and wide evidence tables scroll inside their own regions; the full Planner is still about 4,600 px tall at 1440 with one hypothesis card open (7,356 px before).
- `docs/ux/DEMO_AND_SLIDES.md` (UX-helper owned) not edited; `006-demo-script.md` supersedes its steps. Presentation/README remain Codex-owned and unchanged.
- The live three-minute rehearsal by a person, screen-reader testing and 200 % zoom were not performed.
- Earlier ENG-12/ENG-17/provenance partial items from Task003 are unchanged.

## Release checklist

- [x] Coordinator review: see `006-coordinator-review.md`; two review rounds resolved.
- [x] User approved the light visual direction earlier.
- [ ] Final application/user engineering review remains pending.
- [ ] Live rehearsal of `006-demo-script.md` within 180 s on the presentation machine, then once with the network off after loading.
- [ ] Use a fresh browser profile before the demo so the Planner starts empty; preserve existing user drafts.
- [ ] Re-export with the pinned environment (`PYTHONHASHSEED=0`, Python 3.13.16, lock file) and confirm the hashes above.
- [ ] Replace presentation screenshots with final app screenshots (Codex), not the UX Pilot mockup.
- [ ] Task007 blind export stays a separate reviewed step; nothing here reads test telemetry.
