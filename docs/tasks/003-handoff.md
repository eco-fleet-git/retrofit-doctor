# Task 003 handoff — working Retrofit Planner

Date 2026-11-06. Implementer: Claude Code (sole application code writer). Status: working local Planner slice ready for review. **Not visually approved by the user; UX Pilot not used; no field, supplier or compliance validation.** No Git, detector, benchmark data or exported-bundle changes (bundle SHA-256 prefixes unchanged: `4a6afd7c810f`, `3ea5992774d0`, `fda4274d5e2e`).

## Changed files

| File | Change |
|---|---|
| `web/js/cost-model.js` (new) | Pure calculator for COST_MODEL_SPEC v1: raw-string inputs (`''` unknown, `'0'` explicit zero), per-field validation, complete/incomplete cost sets with known subtotal and exclusions, currency/tax-basis guards, included-elsewhere / not-applicable references, scheduled events, discounting, incremental benefit/nuisance/net/NPV, payback rules, event-rate and nuisance break-even, economic conclusion |
| `web/js/planner-content.js` (new) | 13 one-time + 7 recurring required categories, empty model, exact illustrative redundant-pump preset, four review paths incl. defer, five candidate templates with decision / will-not-resolve / questions, dated organizer BOM note |
| `web/js/planner-store.js` (new) | Versioned per-pump localStorage drafts (`retrofit-doctor.planner.<assetId>`, v1); load states none/loaded/migrated/corrupt/newer/unavailable; save never claims success on failure; add/remove candidate; readiness (UX completeness only) |
| `web/js/planner.js` (new) | Planner view and bindings: coverage, review path, hypothesis cards, review status, lifecycle comparison, cost/benefit editor, preset, save/reset with inline confirmation |
| `web/js/app.js` | Skeleton planner replaced by `renderPlannerPage` / `bindPlanner` (planner route only) |
| `web/styles.css` | Planner styles; `.table-wrap { position: relative }` (fixes page overflow from screen-reader labels in scrolled tables); stacked results tables ≤600 px |
| `tests/web_cost_model.test.mjs`, `tests/web_planner_store.test.mjs` (new) | 13 + 12 Node tests with spec literals (6 of them added in review fix 1) |
| `tests/web_planner_regressions.test.mjs` (new) | 8 tests reproducing `003-review-round1.md` probes 1–3, backup-before-overwrite, renderer + storage integration, quote-label removal, outside-horizon events |
| `review/task003/` (new) | 13 screenshots, `browser-qa.mjs` (Playwright, system Chrome), `browser-qa-result.txt` |

## Commands and results (2026-11-06, macOS arm64, Node v26.12.0, server `python -m http.server 8765 --bind 127.0.0.1 -d web` running)

```
node --test tests/web_replay.test.mjs tests/web_cost_model.test.mjs tests/web_planner_store.test.mjs tests/web_planner_regressions.test.mjs   → 40 tests, 40 pass, 0 fail
PYTHONHASHSEED=0 ../../work/.venv/bin/python -m pytest -q tests/test_demo_export.py                    → 9 passed (exporter unchanged)
node review/task003/browser-qa.mjs "$PWD/review/task003"                                               → 47/47 checks passed (see browser-qa-result.txt)
Task001 chart QA (1440/390): page overflow 0, chart labels inside SVG, 0 console errors                → unchanged after CSS edits
```

TDD note: calculator and store tests were written before their modules and observed red (module missing), then made green. They were written per seam in one batch, not strictly one test per cycle. Browser QA is an evidence script, not a repository test.

## ENG-01 … ENG-18 evidence

| ID | Evidence | Result |
|---|---|---|
| 01 | Browser: four paths with decision / burden / when; existing-only editor shows OT integration etc. and note that existing data is not free | Pass (`01`, `06`) |
| 02 | Unit: add/remove keeps other candidate and its answers, removes only own answers, inventory array untouched. Browser: Pump Detail inventory + alert list text identical before/after planner edits | Pass (`02`) |
| 03 | Browser: flow card requires pipe survey, says no flow trace/efficiency simulated, pump taps cannot locate exchanger restriction | Pass |
| 04 | Browser: vibration card has separate location/direction, mounting, bandwidth/window, cadence questions + bandwidth-vs-cadence explainer; no unique-fault / every-bearing promise | Pass (`02`) |
| 05 | Browser PUMP-12: metadata-only banner; "no measured speed; rated 2935 rpm is passport metadata"; no pairing text. Planner reads only `fleet.json` metadata | Pass |
| 06 | Unit: blank installation labour → incomplete, known subtotal 3,300, missing list. Browser: same; empty model shows Known cost subtotal EUR 0 and exclusions count | Pass (`01`) |
| 07 | Unit + browser: λ blank → Benefit not estimated, NPV/payback absent, cost comparison still shown | Pass |
| 08 | Unit: 4,500 / 700 / 300 / 1,800 / −2,200 / 17,000 / 1,500 / −15,500 / no payback / 3.4. Browser: all rendered with illustrative label and "no claim that the selected pump has a standby" | Pass (`03`) |
| 09 | Unit + browser: n = 0 → −EUR 400/yr, NPV −EUR 6,500, no payback | Pass (`04`) |
| 10 | Unit + browser: u = 0 → benefit 0, −2,500, −17,000, "No finite event-rate break-even", no NaN/Infinity | Pass |
| 11 | Unit: errors for u > 1, negative n, negative cost, H = 2.5, d < 0; raw input preserved. Browser: inline errors, value kept, NPV "Not estimated" | Pass (`05`, `09` at 390 px) |
| 12 | Unit: NOK line excluded until rate/date/source given; supplier quote excluded until scope, validity and tax basis entered. Browser: exclusion reasons shown; organizer note dated 30 Oct 2026, hardware only, not re-quoted, not summed | Pass for cost lines. Quote validity date is not compared with the comparison date; scheduled events have no FX fields |
| 13 | Browser: architecture separate from replay ("not an edge implementation"); no secure/certified/class-approved conclusion; readiness says not an approval | Pass |
| 14 | Unit: per-pump save/reload, failing setItem → error + savedAt unchanged, unreadable storage, corrupt / foreign / newer (not overwritten), legacy migration. Browser: save → reload → PUMP-09 independent → back; unsaved edit kept in tab with marker; injected QuotaExceededError → actionable error, edits kept | Pass (`06`, `07`) |
| 15 | Unit + browser: Not assessed / empty drafted / NA without rationale → Needs evidence; drafted text → "Ready for engineering review", shown separately from economic "Defer under current assumptions"; no Certified/Installed | Pass (`06`) |
| 16 | Browser: `context.setOffline(true)` after load → choose path, load preset, save locally all work. Not evidence of field gateway resilience | Pass (local only) |
| 17 | Unit: direct vs totals nuisance never both charge; included-elsewhere without valid reference → error + incomplete; allocated share > entered project total → error. Browser: baseline named, sunk equipment excluded, bundled lines reference sensor package, project total editable | **Partial**: shared allocations are checked only within one pump; the spec rule "allocations across assets must sum to the project cost" is **not implemented** (disclosed in the UI) |
| 18 | Unit + browser: positive case → "Candidate for engineering review", simple payback 2.0 years; scheduled cost → cumulative recovery year 4, no level-flow payback; beyond-horizon and no-additional-investment labels | Pass |

Also verified in browser: reset asks inline confirmation with focus on "Keep editing", confirm removes the stored draft; keyboard Space selects a path, Tab reaches Save with visible outline, Enter saves; 390 px page overflow 0 px with inline numeric error inside viewport; 0 console errors in all three sessions.

## Review round 1 (`docs/tasks/003-review-round1.md`) — regressions fixed

Each probe was first reproduced as a failing test (red: missing `MAX_HORIZON_YEARS` export / failing assertions), then fixed:

| Probe | Fix | Evidence |
|---|---|---|
| 1. `horizonYears = '100000000000'` threw `Invalid array length` | Supported horizon is 1–50 whole years (`MAX_HORIZON_YEARS`); out-of-range is a field error "Supported horizon is 1–50 whole years"; the label states the range | Unit probe 1; browser `Review-1` |
| 2. `2 × 1e308` gave Infinity / −Infinity with zero errors | Every numeric input limited to \|x\| ≤ 1e12 ("Too large to calculate reliably"); extended line cost checked; final non-finite guard nulls all financial outputs and sets conclusion Needs evidence | Unit probe 2 + benefit/nuisance overflow; browser `Review-2`, `13-overflow-rejected-1440.png` |
| 3. `{assetId, version:1, economics:null}` loaded as valid and crashed rendering | Stored and migrated drafts are validated (candidates, answers, review path, notes, cost model incl. all 20 required categories per option); invalid → `corrupt` notice, original left untouched, fresh draft shown; the next save first writes the original to `…PUMP-08.backup-<time>` and says so; `evaluateModel` reports a malformed model as an error instead of throwing | Unit probe 3, backup and renderer-integration tests; browser `Review-3`, `12-corrupt-draft-notice-1440.png` |

Also: editing a quoted amount now clears the quote label, source, date, scope and validity (kept only in "Original"), so an unsourced number never keeps a quotation label. Scheduled events after the horizon are listed as "not included" rather than silently dropped.

## Review fix 1 — provenance of edited values (2026-11-06)

Implemented against the COST_MODEL_SPEC input contract (tests written first and observed red: missing exports, then the project-total case):

- Editing a value (quantity, unit cost, currency, treatment, included-in, shared project total) of a sourced line records it as **user assumption**, sets the **entry date** to today, clears source/source date for the new value, and keeps the **first original** (basis, source, source date, entry date, values) shown as "Original: …". A blank line's first entry becomes a user assumption with no invented original.
- Basis, **source / reference** and **source date** are editable per cost line, so the reviewer can replace an assumption with evidence (e.g. site estimate, sheet R-2, 2026-11-05). "Field observation" is still labelled a draft assertion.
- **Supplier quote** basis shows scope, valid-until and tax-basis fields; a quote missing any of them is excluded ("Supplier quote needs scope, validity and tax basis") and the estimate becomes incomplete.
- **Shared gateway**: line value = this pump's allocated amount; project total and allocation basis/beneficiaries are editable; allocated > project total is rejected. Entering a project total is itself a reviewer edit (relabels the line, original kept).
- Benefit and nuisance assumptions carry **group-level** provenance (basis, source, source date, entry date, original values).
- Browser evidence: `review/task003/10-provenance-row-1440.png`, `11-allocation-row-1440.png`; provenance survives save + reload.

### Provenance and allocation still incomplete (do not count as done)

- Benefit/nuisance provenance is per group, not per parameter (λ, u, h, c, r, L, n, a share one record). Horizon, discount rate, currency/tax basis of the comparison and scheduled events have **no** basis/source/date fields.
- Only the first original is preserved; intermediate edit history is not kept. Changing only the basis (without a value change) does not snapshot an original.
- Cross-asset allocation (shares across pumps summing to the project total, no division by twelve without twelve entered beneficiaries) is **not implemented**; each pump's draft is evaluated alone.
- Quote validity is not checked against a date; quote scope/validity is required only on cost lines.
- Drafts saved before this fix load (fields are additive, schema version unchanged at 1) but lack the gateway allocation fields and group provenance until the preset is reloaded or values are edited.

UI direction note: the user approved the light UX Pilot style with sidebar and separate evidence card on 6 November; per instruction it is **not** applied in this task (Task006). The generated mockup values remain rejected (`design/uxpilot/README.md`). No external calls or paid generation were made.

## Limitations / deferred (not hidden)

- No Undo after reset (UX A27); confirmation only. No scenario set (pessimistic/base/optimistic), no cumulative-flow chart, no file export.
- Scheduled events in a non-comparison currency are excluded (no FX fields for them). Tax basis is a free-text match.
- Gross per-option lifecycle is shown **excluding nuisance handling** (nuisance is entered incrementally in v1), labelled as such. L blank = labour saving not included (shown as such), not an unknown blocker.
- Break-even λ uses the discounted generalisation; equals the spec's undiscounted formula at d = 0.
- Simple payback is undiscounted (spec formula) even when d > 0; labelled "(undiscounted)".
- Candidate cards are shown for every pump (with "already installed here"); answer state "Open" counts as unanswered.
- At 390 px the long cost editor table scrolls inside its labelled region; results tables stack. Desktop element screenshots `03`/`04` show the sticky header over the panel top (a capture artefact; full-page shots don't show it).
- No new dependencies. Browser QA uses the provided Playwright runtime with system Chrome.

## Acceptance status summary

ENG-01–11, 13–16 and 18: evidenced as in the table above. **ENG-12**: met for cost lines; partial for scheduled-event currency and quote-validity dating. **ENG-17**: partial, because the cross-asset shared-allocation rule is not implemented. COST_MODEL_SPEC input contract: met for cost lines (basis, source/reference, source date, entry date, note, preserved original, quote scope/validity/tax basis); partial for benefit/nuisance (group-level) and absent for comparison settings and scheduled events. **ENG acceptance is therefore not complete.**

## Next action

Main Codex: review screenshots `review/task003/01–09`, the fixture arithmetic (`03`, `04`) and draft persistence (`06`, `07`), then commit `web/js/{cost-model,planner-content,planner-store,planner}.js`, `web/js/app.js`, `web/styles.css`, both new tests, `review/task003/`, this handoff. Suggested next slice: per-parameter provenance for benefit/nuisance/comparison settings, cross-asset allocation, reset Undo; visual integration in Task006.
