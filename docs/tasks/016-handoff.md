# Task016 handoff — human-readable Fleet entry and warning review

Implementation owner: Claude Code (sole code writer). Base: HEAD `06f1c1e`. No Git, no model/data/release edits, no cloud calls. **Browser validation was not run by me.** CUA is not available in this CLI session, and the coordinator asked me not to use an alternative browser-control path. The coordinator owns CUA validation at 1440 / 940 / 390 and the screenshot export. No visual acceptance is claimed.

All coordinator copy notes received during the session are applied and pinned by tests where they are text:
- "first recorded day" / "initial reference recordings";
- fluctuation of the measured-minus-calculated difference;
- the bearing ratio-of-ratios;
- "This warning is not available yet";
- "no vibration waveform was recorded in the warning minute";
- humanized simulated answer.

## Changed files

- `web/js/comparison.js`: adds a clock-independent `plain` layer to `explainCase()` for available cases: `title`, `summary`, 2–3 `observations`, `uncertainty` and `metrics` (each tagged Measured / Calculated / Time).
  - Titles: "Check the flow measurement" (from the stored source channel), "Check shaft alignment", "Inspect the bearing condition", "Cause still unresolved: flow input missing".
  - The pending and next-check wording is now plain.
  - Technical wording now says "first-recorded-day" and "initial reference recordings", and explains that E's spread, not its mean, is tested and that the bearing gain is a ratio of ratios.
  - Unchanged: `sliceCase`, `sliceCaseLabel`, `evidenceIssue` and all existing fields. The plain layer is absent before the alert and when evidence is rejected.
- `web/js/diagnosis-view.js`: the page becomes "Review a pump warning".
  - Visible context: a single "Recorded synthetic example · advisory" line.
  - Example buttons use asset + measurement labels (no diagnosis in the title). The observation time is shown with seconds.
  - Controls: "Before warning (−1 s)" and "At warning", plus secondary step buttons (±1 min, +1 h, +1 day). URL deep links are unchanged.
  - The card reads in this order:
    1. where and when, plus the historical age if later;
    2. action title and one-sentence summary;
    3. a prominent **Next check** panel (blue) with "Why this check" and "How certain" (amber);
    4. "Why this needs a check" observations and metric cards. Waveform cases also get a "Recording age now" card.
  - The pressure chart follows, explained in one sentence, then links to the pump's installed measurements and retrofit plan.
  - Disclosures, all closed by default:
    - measured values;
    - "What changed from the earlier method?";
    - technical details: exact values, the exact 0.013 margin, rule terms, verbatim B1/Z995 outputs, score, equation, raw source, assumptions, and the nested full JSON.
  - The opt-in panel is now "What actually happened (simulated answer)". It shows the fault and channel in plain words, with exact codes in small text. It is gated as before.
  - "Results across all recorded events" sits below, with every event, change and miss in its disclosure. An "About these results" disclosure gives scope: development and validation status, the train-only hydraulic support, the W1-only validation gain, uncalibrated scores and the unchanged release.
  - Adds `reviewCases()` for the Fleet page.
- `web/js/app.js`: Fleet rewritten.
  - Purpose heading "Understand a pump warning. Choose the next check." and a three-step workflow.
  - A **Start here** card with a primary "Review this warning" button that opens PUMP-04 at its warning.
  - Other starting points: PUMP-08 vibration review, PUMP-01 retrofit plan, PUMP-08 replay.
  - "All 12 pumps": search / Show (availability) / Site filters. Columns: application, measurements in plain words ("Has pressures, speed, … · no flow meter"), availability pills and actions.
    - "Recorded review available" is derived from the bundle's cases (PUMP-01/02/04/08).
    - "Baseline replay available" is PUMP-08/09.
    - All others show "Sensor inventory only", with the note that this is not healthy.
  - The split / tier / control table, the split filter and the Evidence link live in a "Data details" disclosure. The replay-clock, alert and reference columns are removed from the overview. Fleet no longer fetches the baseline replays.
  - The Planner gets a one-paragraph orientation block; its calculations and forms are unchanged.
- `web/index.html`: nav is "Start · Fleet", "Review a Warning", Pump Detail, Retrofit Planner, Evidence & Validation. Routes are unchanged.
- `web/styles.css`: Task016 block. The review grid and start grid stack at ≤1000 px, so 940 is single-column with Next check first. The workflow stacks at ≤700 px.
- `tests/web_comparison.test.mjs`: +3 tests (19 total) for the plain layer:
  - kind-specific titles, no model codes, identifiers or exact margin in plain text;
  - visible case uncertainty (rule boundary, training-only support, not verified healthy, waveform age and no-waveform-at-minute, not-assessed ≠ healthy);
  - plain layer absent before the alert and for rejected evidence.

  All earlier clock, label, future-provenance and data-hash tests are unchanged.
- `review/task015/browser-qa.mjs`: one string updated to the new pending wording. **The rest of this Task015 script is now stale** (old headings and selectors such as "What the method suggests" and `.cmp-row`). It was not run.

## Checks run

- `node --test tests/*.mjs`: **82/82 pass**.
- Data bytes unchanged: `diagnosis-comparison.json` `8ffff27f…`, `fleet.json` `168ab6cf…`, `replay-PUMP-08.json` `51e24561…`, `replay-PUMP-09.json` `47c0a0d5…`. No results or release file was touched.
- A Node render smoke of the review page (stubbed `fetch`/`window`, not a browser) ran for P04 at the warning and 1 s before, P02 at the warning, P08 +1 day, and P01. HTML block tags were balanced in every case, and the first-screen text outside disclosures contained no `B1/Z995/E995/W1`, channel IDs, `0.013`, "covariance" or "tail rank".
- **Not checked by me:** any browser rendering, layout at 1440/940/390, page overflow, keyboard focus, console errors, Fleet rendering (it needs `document`), and the Pump Detail, Evidence and Planner regressions in a browser.

## Browser-check expectations for the coordinator (1440 / 940 / 390)

1. **Fleet `#/fleet`**
   - The heading and three steps are visible.
   - The "Start here" card has a blue "Review this warning" button (`#start-review`) leading to `#/diagnosis?case=pump04-train&t=2025-06-18T22:06:00Z`.
   - The pump table has 12 rows. Expected pills:
     - PUMP-01, 02 and 04: "Recorded review available".
     - PUMP-08: both "Recorded review available" and "Baseline replay available".
     - PUMP-09: "Baseline replay available".
     - The others: "Sensor inventory only".
   - Show = "Sensor inventory only" leaves 7 rows.
   - "Data details" is collapsed, and opens to split, tier and control.
   - At 390 the table stacks without page overflow.
2. **Review at P04 22:06:00**
   - Title "Check the flow measurement" and the Next check panel are in the first 1440×900 viewport.
   - The "How certain" line says "close to the rule boundary".
   - Metric card: 7.3 kPa vs typical 3.5 kPa (Calculated) and 60 of 60 samples (Measured).
   - The chart sentence names the solid and dashed lines.
   - No 0.013 is visible until Technical details is opened.
3. **Before warning (−1 s)**: title "This warning is not available yet". There is no chart, metrics or next check, and the opt-in answer says "Not revealed before this case's alert time".
4. **P02 / P08**
   - Titles are "Check shaft alignment" / "Inspect the bearing condition".
   - P08 at +1 day shows age at warning 3 h 39 min 37 s and age now 27 h 39 min 37 s.
   - The observations say no vibration waveform was recorded in the warning minute.
5. **P01**: title "Cause still unresolved: flow input missing", metric card "Flow meter · Not installed", next check "Verify suction pressure against a reference gauge.", and the retrofit-plan link.
6. **At 940**: the review and start cards are single-column, with Next check above "Why this needs a check".
7. **Regressions**: the baseline `#/pumps/PUMP-08?t=2025-09-10T12:38:00Z` explanation card, the Planner (new orientation line), Evidence, and nav highlighting for "Review a Warning". No console errors.

## Limitations

- No browser validation by me (see top).
- Measurement coverage on Fleet comes from the passport channel list only and implies no health. The "Recorded review" availability depends on the comparison bundle loading. Until it loads, those pills and the start button show loading or are absent.
- The Task015 browser script is stale.
- Planner content beyond the orientation line is unchanged.

## Walkthrough

Fleet → "Review this warning" → read the title, the Next check and how certain it is → "Why this needs a check" → toggle "Before warning" and "At warning" → try PUMP-08 and "+1 day" (age grows; the conclusion stays historical) → PUMP-01 (input missing, not healthy) → retrofit plan link → optionally open the technical details, the simulated answer, and the results/about disclosures.
