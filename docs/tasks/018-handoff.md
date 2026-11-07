# Task018 handoff — corrected engineering dashboard (EN/RU)

Claude Code was the sole application-code writer. No Git operations, no paid UX Pilot or cloud calls, no new dependencies, no dataset, method or bundle changes. The iteration-02 PNGs and the coordinator's design and docs files are untouched; the untracked `review/task018/` was not touched either. **No browser was run by me**; Codex owns the CUA review. Nothing here is visual acceptance.

## What changed

**Overview (`#/fleet`, nav "Overview / Обзор")** replaces the tutorial homepage.
- **Header:** a compact heading with one "Synthetic examples · advisory" badge; search, site and availability filters.
- **Four cards, derived from the data (`overviewCounts`):**
  - assets: 12;
  - recorded warning reviews: 4;
  - replay datasets: 2;
  - inventory only: 7, including the 3 blind-test pumps.

  A one-line footnote says the counts overlap and are not alarms or health.
- **"Checks to review" queue:** the four historical cases. Each row shows pump · system · site, the warning time in UTC, a short plain-language reason (the case's own `plain.title`), a short evidence label (1-s pressure + flow data / vibration recording with its age / no flow meter), a "Preview" toggle and "Open review". Order is by pump, not urgency.
- **Preview** of the selected case:
  - It is computed by `casePreview()` at that case's own warning time through `sliceCase`/`explainCase`. It never uses a later clock or labels.
  - P04 shows the real measured vs curve-derived chart (visible kPa axis, date and range, legend "Measured Pd − Ps"). P08/P02 show the ratio bars; P01 shows the missing-flow gap.
  - Then come the action title, a short caution, the next check (advisory) and "Open full review". P01 also gets "Assess missing measurement".
- **Selection follows the filters (review fix):** `selectVisibleCase` keeps the stored selection only while it is visible in the queue. Otherwise it falls back to the first visible case, or shows a genuine empty preview.
- **Load failure:** shows an error with a Retry button (`ov-retry`) instead of endless loading.
- **Sensor coverage of all 12 pumps:**
  - suction pressure, discharge pressure, flow, speed, vibration and motor current, marked ● / ○ with screen-reader text "Installed / Not installed" (installation per the passport, not health);
  - availability pills: recorded review / baseline replay / inventory only / **"Blind test · metadata only"** for PUMP-10..12, which are never marked as reviewable or diagnosed. Inventory-only rows add "Condition not assessed";
  - links to the review, the replay or the sensor list.

  The split/tier/control table and a data-sources disclosure moved into `<details>`.
- **Search** also matches the translated site and system names.

**Workspace (`#/diagnosis`, nav "Pump check / Проверка насоса"):**
- Breadcrumbs Overview › Pump check › PUMP-xx.
- Pump header with the real system and site (translated), the warning timestamp and a compact case `<select>`. Case and clock stay in the URL; the case cards were removed.
- A compact "Recorded data time" bar: before warning (−1 s) / at warning, plus ±1 min, +1 h, +1 day.
- The card shows one finding (title plus one line) and no duplicate big buttons. The jump/evidence/sensors button row was removed.
- **Evidence column:**
  - P04: the chart **first** (kPa axis, date, Pd − Ps legend), then the residual-spread bars with explicit 7.3 vs 3.5 kPa (title "Residual spread: measured minus calculated pressure rise (std, kPa)"), then the flow trace;
  - P08/P02: the timeline and ratio bars;
  - P01: the gap.
- **Right column:** the next-check panel (action, short caution, «Why and limits» collapsed). P01 gets "Assess missing measurement" inside the panel. Below it, the compact schematic with every passport channel and "Full sensor inventory →".
- **Disclosures** keep the formula, alternatives, first-day reference qualification, train-only support, the 0.013 margin and the raw outputs.

**Pump Detail and Planner** keep their routes and features. Their back link is now "← Overview / ← Обзор". Styling is shared through the global tokens (slightly lighter slate background, white panels).

**Removed from the mockup and not implemented:** the invented operator and avatar, "Assessable", "Pending verification / active records", the electromagnetic/ultrasonic device and the `P04-Q` identifier, manual-measurement/upload/"Start plan" controls, and any reliability score or what-if overlay.

## Fixes from the coordinator's CUA rounds

1. **Queue clipping at 1161 px:** the queue is now a list of compact rows instead of a wide table, so it always fits its panel. Each row has:
   - the pump and its short translated system;
   - the reason in bold, with "time UTC · short evidence" below it;
   - stacked Preview / Open review buttons.

   Rows wrap rather than scroll. The queue and preview stack at ≤1280 px, and the row becomes a single column at ≤560 px.
2. **Preview height:** the compact chart is shorter (150 px) and its caption shows only the date range. The legend is short («Measured Pd − Ps, kPa» / «Pump-curve calculation, kPa»), and the summary is no longer repeated.
3. **Sidebar pump links:** "Pump Detail" and "Retrofit Planner" now follow the case shown in the pump check, and they update when the case selector changes (`currentCaseAssetId()`, re-synced after rendering). Direct `#/pumps/…` routes are unchanged.
4. **Research disclosure:** ground truth (still opt-in and gated per case), the full benchmark results and "About" are now inside one closed disclosure, «Research results and simulated answers / Результаты исследования и симулированные ответы». Its open state is remembered and all content is kept.
5. **Empty-queue copy:** it now says «No recorded checks match these filters / Нет записанных проверок…» instead of the pump-list "no pumps" text.
6. **Queue note:** now «Recorded historical cases; the order is not urgency» in EN and RU; "listed by pump" was inaccurate.
7. **Coverage table on desktop:** fixed table layout, wrapped headers, compact mark columns (8 % each) and a single "system · site" line per pump. It scrolls horizontally only at ≤1100 px.

8. **Mobile first screen (390 px):** at ≤600 px the shell is compact:
   - the brand has no subtitle and the language switch is inline;
   - the navigation is a single horizontally scrollable row, with the pump IDs and the badges hidden. The "Synthetic examples · advisory" badge stays in each page header.

   The pump-check header is tighter and the case selector is full width. The time controls moved into a `<details id="cmp-time">` «Recorded time / Время записи». Its summary shows the current UTC timestamp and the phase (before / at / after the warning). It is open by default at ≥900 px, collapsed below that, and its state is remembered.

   Every control (before warning −1 s, at warning, ±1 min, +1 h, +1 day), the URL clock and the gating are unchanged inside it. Below 1000 px the next-check panel still comes directly after the finding, before the evidence.

   Not measured by me: whether the finding and the next action now fit in the first 390×844 screen.

9. **Mobile overview (390 px):**
   - Filters are a compact grid: full-width search, then the site and availability selects side by side with a small Reset. Labels stay visible and accessible.
   - The KPI tiles use a 2 × 2 grid with the label (12 px, normal case, whole-word wrapping) left and the value right, so Russian words are no longer broken. The explanatory subtitles are hidden only at ≤600 px. The overlap footnote and the "order is not urgency" queue note stay visible, in smaller type.
   - Desktop is unchanged.
   - Goal: the first queue row and its actions on the first screen. Not measured by me.

## Files

- **New:** `web/js/overview.js` (pure `availabilityKinds`, `overviewCounts`, `selectVisibleCase`) and `tests/web_overview.test.mjs` (5 tests).
- **Changed:**
  - `web/js/app.js`: overview rewrite, filter/selection binding, retry, back link;
  - `web/js/diagnosis-view.js`: exported `riseChart` (kPa axis, date, compact mode), `casePreview`, `reviewLoadState`, `retryReviewCases`; workspace header, case select, time bar, card layout;
  - `web/js/i18n.js`: new overview/workspace keys in EN and RU (229 keys each, parity tested), new nav labels, residual-spread and Pd − Ps legend wording;
  - `web/index.html`: nav fallback labels;
  - `web/styles.css`: Task018 block (KPIs, queue/preview grid, coverage marks, breadcrumbs, workspace header, time bar; stacks at ≤1100 / ≤900 / ≤600);
  - `tests/web_i18n_visual.test.mjs`: nav-label expectations updated to Overview/Обзор and Pump check/Проверка насоса, with a `finally` language restore.

## Tests and hashes

- `node --test tests/*.mjs` → **99/99 pass** (94 earlier + 5 new in `tests/web_overview.test.mjs`). The 5th new test checks that the sidebar pump follows the shown case, and that ground truth and results sit inside the closed research disclosure, below the next check. The new tests cover:
  - availability per pump, with PUMP-10..12 as test-split inventory and never a review;
  - derived counts 12/4/2/7 (3 blind-test) and the before-load state;
  - preview selection inside the visible queue: kept, fallback, empty, and inventory-only filter → none;
  - the preview at each case's own warning in EN and RU: available, no labels or raw codes, no template leak; the P04 chart range ends inside 22:05:00–22:05:59 with a visible kPa label and the Pd − Ps legend; P08 age 3 h 39 min 37 s; the P01 missing-flow label; none of the rejected mockup inventions present.
- All earlier clock, label, future-provenance, Russian and planner-flow tests are unchanged and pass.
- Node render smoke of the workspace (not a browser): EN and RU headers render the translated system and site, with no `${` leaks and balanced tags.
- **Frozen bundles byte-identical before and after:** `diagnosis-comparison.json 8ffff27f…`, `fleet.json 168ab6cf…`, `replay-PUMP-08.json 51e24561…`, `replay-PUMP-09.json 47c0a0d5…`.

## Limitations / for CUA

- **Not rendered by me:** layout at 1440/1280/940/390, overflow, focus visibility and console errors are unverified. Please check:
  - at 1440/1280: the finding and the next-check panel without scrolling, and the queue and preview side by side;
  - at ≤1100: the preview stacks under the queue;
  - at 390: the stacked queue rows and the coverage table scroll region.
- **Overview needs `document`:** the overview itself is not rendered in Node. Its logic is tested through `overview.js` and `casePreview`.
- **Pump Detail and Planner** got only the shared styling and back link, not a structural redesign.
- **Deliberately not done:** no manual-measurement or note workflow was added, in line with the task.
- **Video:** paused until the user resumes it after UI completion.
