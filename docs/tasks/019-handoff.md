# Task019 handoff — compact coverage table

Claude Code was the sole app-code writer. No Git, data, method, video, cloud or dependency changes. **No browser was run by me**; the coordinator's baseline screenshot `review/task019/before-table-ru.jpg` was read and is the reference for the fixed defects. No visual QA is claimed.

## What changed (overview → "Sensor coverage of all 12 pumps")

- **Headers** are the six technical codes `Ps Pd Q n V I` (`<abbr title="full name">` plus screen-reader text with the full name), with `white-space: nowrap`. The long translated headings that broke mid-word in Russian are gone, and channel mappings are unchanged.
- **Legend above the table**, in EN and RU, on three short wrapping lines:
  1. Sensors: Ps suction pressure · Pd discharge pressure · Q flow · n speed · V vibration · I motor current.
  2. ● installed · ○ not installed, "per the passport; not sensor or pump condition". Filled vs hollow differs in shape, not only colour, and there are no green ticks.
  3. Data: the chart icon means recorded warning review, the play icon means minute-by-minute replay, the document icon means passport only (condition not assessed), and the TEST badge means a blind-test pump, metadata only.
- **One "Data / Данные" column** replaces the old availability pills plus action links, which overlapped in the screenshot.
  - Each icon is a real link (32 × 32 px target) to what exists: the review, the replay or the sensor list. Each has an `aria-label` and a `title` naming the pump, e.g. "Open the recorded warning review for PUMP-04".
  - PUMP-08 shows both the review and replay icons.
  - Passport-only pumps show the document icon. PUMP-10..12 also show a **visible** TEST / ТЕСТ badge with screen-reader text, not hover-only, and can never get a review icon (classification via the existing `availabilityKinds`, already covered by `tests/web_overview.test.mjs`).
- **Pump cell:** the ID is bold and never wraps. "system · site" is secondary text that wraps between words only, with `title` holding the full text.
- **No human-word mid-breaks:** the coverage table resets `overflow-wrap`/`word-break` to normal, and `break-word` is used only as a last resort on the secondary description. The fixed layout uses 3.4 em code columns, a 9.5 em data column, and the remaining width for the pump.
- **Responsive:** desktop fits the panel. At ≤1100 px (min-width 600) and ≤600 px (min-width 560) the table scrolls horizontally inside its labelled region, not the page. Legend items may wrap on phones.
- **Removed:** the unused `availability()` helper in `app.js`, and the paragraph note above the table, whose meaning moved into legend line 2.

## Runtime fix: replay trend charts (found by the coordinator's CUA)

- **Bug:** `TypeError: L is not a function` when opening a replay (`#/pumps/PUMP-08`), in `svgChart` → `trendCharts` → `renderPump`. In Task017 I added `L('alert', …)` and `L('As of', …)` labels inside `svgChart`, where a local `const L = narrow ? 46 : 62` (the plot's left margin) shadowed the language helper. The data and the method were unaffected.
- **Fix:**
  - `trendCharts`/`svgChart` moved unchanged from `app.js` to the new `web/js/trend.js`, so the branch can be imported without a DOM. The only change is that the margin is renamed `PL` and the helpers (`esc`, `label`, `cadence`, `L`) are imported or defined locally.
  - `app.js` imports `trendCharts`.
- **Regression test** `tests/web_trend.test.mjs`:
  - It renders P08 at 12:38 (dense suction and sparse vibration), P09 at its checkpoint, and P08 during reference collection.
  - Each is rendered in EN and RU, at 1440 and 390, over 6 h / 24 h / all spans.
  - It asserts an SVG with no `${`/`undefined`/`NaN`, the localized "As of / На" label, the localized alert label, and no more than 360 points for the 6 h span.
  - **Mutation-checked:** re-introducing `const L = PL` makes it fail with the exact reported `TypeError`; the module was then restored.
- Other `L` declarations were checked: `riseChart` in `diagnosis-view.js` doesn't import `L()`, and the cost-model `L` is a numeric input, so neither is a live collision.
- `node --test tests/*.mjs` → **100/100 pass**, and the bundles are byte-identical. Actual replay loading in the browser is left for the coordinator's recheck.

## Files

- `web/js/app.js`: `COV_CODE`, inline `ICON` SVGs (no dependency), `dataLinks()`, legend, new table header and rows.
- `web/js/i18n.js`: 14 new `cov.*` keys in EN and RU; parity is 248/248.
- `web/styles.css`: Task019 block.
- `web/js/trend.js` (new; replay trend charts moved from `app.js`) and `tests/web_trend.test.mjs` (new).

## Checks

- `node --test --test-timeout=30000 tests/*.mjs` → **100/100 pass** (99 before Task019 plus `tests/web_trend.test.mjs` for the runtime fix). The coverage table itself needed no new test: its availability mapping is unchanged and already tested, and the rest is markup and CSS.
- Frozen bundles are byte-identical before and after (`8ffff27f…`, `168ab6cf…`, `51e24561…`, `47c0a0d5…`).

## For CUA

Check the lower table in EN and RU at 1440, 1280, ~1161, 940 and 390:
- no text collisions;
- the headers read Ps…I;
- the legend wraps cleanly;
- the icon targets have visible focus;
- the TEST badge is visible on PUMP-10..12;
- at 940 and 390 the scroll stays contained.
