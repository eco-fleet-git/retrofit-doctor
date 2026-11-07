# Task017 handoff — bilingual EN/RU, visual warning review, obvious next actions

Implementation owner: Claude Code (sole application-code writer). It continues the uncommitted Task016 tree. No Git, no model/bundle/test-data/release changes, no cloud calls. **No browser was run by me.** Codex owns CUA review, and I used no alternative browser automation. No user or visual acceptance is claimed.

Restoring my Task015 QA edit: I reverted only my own one-line edit in `review/task015/browser-qa.mjs` (`git checkout`), so the file is back to its committed state. `AGENTS.md` shows as modified in the tree; I did not touch it.

The coordinator's copy and science reviews received during this session are applied:
- **Russian titles and texts:** the P04, P08 and P01 titles and summaries, «Сравните расход с независимым прибором», «Вывод близок к порогу правила», «Улучшение показано только на обучающих примерах…», and the diagram caption «Расположение условное; состав датчиков — из данных». Pressure is labelled as прирост/перепад давления in кПа, not напор.
- **Russian route names:** «Начало / Разбор предупреждения / Насос и датчики / План дооснащения / Результаты проверки».
- **English waveform gap:** now "no vibration waveform was recorded in the warning minute".
- **Schematic:**
  - visible chips such as "Q · Flow — possible addition" or "Ps · Suction pressure — check";
  - a code glossary disclosure;
  - legend and names filtered to installed channels;
  - valve and ambient points drawn only when installed.
- **Flow sparkline:** shows its UTC range and min–max "(not a limit)".
- **P02:** a note that the 2×/1× harmonic, together with the 1× rise, is what points to misalignment.

## CUA-driven fixes after the first review

- **Layout:** the Next check panel had dropped below the fold. A legacy `grid-area: action` applied to the panel nested inside `.sch-side` created an implicit two-column grid. Fixed with `.sch-side > .action-panel { grid-area: auto }`, and the legacy selector is now restricted to direct children (`.review-grid > .action-panel`). The coordinator's CUA review then measured the Next check at y485, 441 px wide. That was the coordinator's check, not mine.
- **Density:**
  - The action panel now shows only the action sentence, an "advisory" pill and one short caution (`plain.caution`, EN and RU):
    - P04: «Вывод близок к порогу правила; нужна независимая проверка.»;
    - waveform: older recording with its age, one direction only;
    - P01: cause unresolved, not healthy.
  - The why-reason, the full uncertainty (including train-only hydraulic support) and the advisory sentence are in a collapsed «Почему и ограничения / Why and limits» inside the panel.
  - The observations and alternatives moved into a collapsed «Подробнее о выводе / Explanation details» below the visuals.
  - Nothing was removed; all values, labels and caveats remain in disclosures.
  - Tests check that every caution exists in both languages, stays at most 80 characters, and gives the exact P04 RU and P08 EN wording. They also check that the train-only statement is still present.
  - The new panel height (~160–200 px target) is not measured by me.

## Changed / new files

- `web/js/i18n.js` (new): local EN/RU dictionary with the same key set in both (tested), `t()`, `getLang/setLang`.
  - Fresh storage defaults to English; the choice is kept in `localStorage` (`rd-lang`, try/catch guarded), and `setLang` updates `<html lang>`.
  - Russian channel names. Duration formatting: `3 ч 39 мин 37 с`.
- `web/js/comparison.js`:
  - `explainCase(slice, asset, { lang })`. English stays the default and is unchanged, apart from shorter summaries and the waveform-gap wording fix.
  - `lang: 'ru'` localizes only the plain first-screen layer, the next check, timing, pending/rejected text, the before/after labels, alternatives and the snapshot ages. Numbers, gating and `technical` are identical (tested).
- `web/js/review-visuals.js` (new): pure HTML/SVG builders. They infer nothing.
  - **`pumpSchematic`:** a generic single-pump diagram (suction, pump, motor, discharge) keyed to the passport. Points are marked installed, focus, not installed or possible addition, with chips, legend, glossary and caption. Highlights only come from an available explanation.
  - **`spreadBars`:** 7.3 vs 3.5 kPa, labelled as a comparison and not a healthy limit.
  - **`flowSpark`:** real P04 `q_m3_h` raw values, with range and UTC window.
  - **`snapshotTimeline`:** recording finished → warning → now, with ages.
  - **`featureBars`:** P02 1× vs reference = 1, plus the harmonic note. P08 bearing tone-to-background, reference ratio vs recording ratio (reference = envRatio/envGain), labelled as a ratio of ratios, not an absolute amplitude and not a probability.
- `web/js/diagnosis-view.js`: rewritten as a visual story.
  - Order: where/when → hypothesis title → one-line summary → action buttons. The buttons are "See the next check" (jumps to and focuses the panel), "See evidence" or, for P01, the primary "Assess missing measurement", and "Check installed sensors".
  - Grid: **visual evidence** on the left; the **Next check** panel (advisory, "How certain") and the schematic on the right. At ≤1000 px the grid stacks with the panel first.
  - Below the grid: 2–3 short observations and one line of alternatives. Measured values, "what changed", and the technical details (marked as original English wording in RU, with `lang="en"`) are disclosures.
  - The simulated answer, the results table (translated headings and metrics) and "About these results" are in EN and RU.
  - Footer is in both languages. `schematicFocus` is exported for tests.
- `web/js/app.js`:
  - **Language switch:** bound once; re-renders without touching the hash, clocks, filters or planner drafts. Shell strings use `data-i18n` and `textContent`, not an innerHTML replace.
  - **Fleet first screen:** purpose, badge, a numbered visual path (1 choose an example → 2 understand the evidence → 3 choose a check or measurement, with icons), **one primary Start button** ("Start: PUMP-04 pressure and flow warning"), and secondary example chips. The pump list, filters and data-details disclosure are translated.
  - **Pump Detail:** back link, tabs, clock controls, status-panel headings, trend, inventory, schematic headings, the four step headings, the evaluation panel and the history summary are translated.
  - Planner orientation and the Evidence heading, intro and scope note are translated.
- `web/index.html`: EN/RU switch (`#lang-en` / `#lang-ru`, `aria-pressed`, `lang` attributes) under the brand; `data-i18n` on nav, badges, skip link and footer. Routes are unchanged.
- `web/styles.css`: Task017 block (switch, hero path, big start button, review actions, bars, sparkline, timeline, mini schematic, chips, gap visual, stacking rules).
- `tests/web_comparison.test.mjs` (+1 RU test plus extra copy assertions) and `tests/web_i18n_visual.test.mjs` (new, 5 tests).

## Tests run

- `node --test tests/*.mjs` (first slice): 88/88 pass; after the core-RU slice **92/92 pass** (see the localization section). This includes every earlier clock, label, future-provenance, data-hash and plain-layer test. New checks:
  - EN/RU dictionary key parity; default `en`; Russian route names.
  - For all four cases 1 s before the warning: `schematicFocus` is `{}`, the schematic has no chips or focus ring, and the visible card text has no inference words or values. The inventory link "Check installed sensors" is allowed.
  - At the warning: focus is flow (P04), vibration (P08), and suction plus flow as a possible addition (P01). Chip texts are checked, and there is no valve point when it isn't installed.
  - Visuals use frozen numbers only: 7.3/3.5 kPa, the flow range with `22:05:00–22:05:59 UTC (not a limit)`, bearing 1.9× → 4.8× with the ratio-of-ratios wording, and the P02 harmonic note.
  - Russian visible first screen for all four cases contains Cyrillic and none of a list of English core words. P04 «Проверьте показания расходомера», «7.3 кПа», «Вывод близок к порогу правила»; P08 «3 ч 39 мин 37 с» and «27 ч 39 мин 37 с».
  - The Russian plain layer, ages and next checks are tested at the helper level and are absent before the alert.
- Data bytes unchanged: `diagnosis-comparison.json` `8ffff27f…`, `fleet.json` `168ab6cf…`, replay-08 `51e24561…`, replay-09 `47c0a0d5…`.
- A Node render smoke (not a browser) in EN and RU for all cases, at the warning and 1 s before, found balanced HTML block tags.

## Localization coverage (exact, after the core-RU slice)

The coordinator noted that the user cannot work in English, so a second slice translated the remaining core path. New modules:
- `web/js/ru-text.js`: an exact-string English→Russian display dictionary used per call site through `tx()`, `txMsg()` (validation messages with numbers) and `L(en, ru)`. Stored draft values, option `value`s, filter keys and identifiers are unchanged.
- `web/js/explain-ru.js`: a Russian composer for the baseline (Task009) explanation, built only from `explainAlert()`'s structured output.

**Russian in RU mode:**
- **Shell and errors:** nav, badges, skip link, footer, language switch; source loading, error and retry texts on all routes.
- **Fleet:** everything, including the **application and site names of all 12 pumps** and fluids. The site filter keeps the raw site as its option `value`; the original names remain in the data-details table only through raw IDs and codes.
- **Warning review:** page, controls, card, visuals, schematic, next check, cautions, "why and limits", explanation details, simulated answer, results headings and metrics, "About".
- **Pump Detail:**
  - header, mode badges, test and train banners, passport panel, clock controls, status panels (reference, packets, baseline output via `ruStatus`), alert history;
  - trend chart titles, notes and span options;
  - the **baseline explanation card**: headline, caveat, timing, observations, gap summary, alternatives, **next check and its reason** for all 12 fault types;
  - inventory table, sensor map (point names, states, caveats, legend, details, text list), evaluation panel.
- **Planner:**
  - orientation, notes, decision summary (next action, evidence line), **review-path choices** (title, decision, burden, when), gate questions and answer states, **candidate cards** (title, decision, will-not-resolve, explainer, placement), review-draft status, save/reset/confirm dialogs and messages;
  - **lifecycle results** (both tables, all row labels, payback and sensitivity labels, conclusions);
  - the physical proposal (architecture, package elements and statuses);
  - the **input editor**: field labels, hints, treatments, bases, provenance fields, scheduled events, benefit and nuisance inputs, screen-reader-only labels, validation messages.
- **Evidence:** heading, intro, scope note, status pill.

**Remaining source-only exceptions (English or original by design or not yet done):**
1. Technical-details disclosures on the review and on Pump Detail. They are labelled «исходные формулировки на английском» and hold verbatim detector evidence and recommendations, rule paraphrases, exact derived lines, raw `rule_detail` JSON, equation, assumptions and the per-channel gap texts of the baseline helper.
2. Evidence page bodies: the historical experiment tables, hypotheses text from the bundle, the B1 comparison table and the per-event tables. A Russian note says the detailed tables are in their original English.
3. Results disclosure on the review: the event table cells keep raw fault codes and event IDs, and the provenance file list stays as is.
4. Raw identifiers everywhere: channel IDs, instrumentation-tier and control codes, event IDs, file paths, the units `kPa(g)`/`m3/h` as stored, currency codes, `NPV`, generator names in the footer.
5. Planner data values:
   - illustrative-preset line notes and user-entered text (shown as entered);
   - the default baseline-practice input value (translated only in the results caption when unchanged);
   - the field-path suffix in the input-problem list (for example `· quantity`);
   - `planner-store` load and save messages that carry dynamic error detail (storage unavailable, corrupt, newer format);
   - the cost-model "data missing or incompatible" message. Fixed save and migration messages and all numeric validation messages are translated.
6. Numbers keep a dot decimal separator; dates keep explicit UTC.

**Tests for this slice:** `tests/web_ru_core.test.mjs` (4 tests).
- Russian Planner with choice "minimal" and two candidates, editor open, rendered on two tabs: no English core words outside raw-ID spans, no `${` template leaks, and the stored keys are unchanged.
- Russian sensor map: no English words, no leaks.
- Russian baseline explanation for PUMP-08 12:38: the exact headline, the local-gauge check, and the gap summary (Расход не установлен; 4 channels without a sample, 5 мин).
- An English Planner regression check.

Total: `node --test tests/*.mjs` → **92/92 pass**. Data bytes are unchanged (`8ffff27f…`, `168ab6cf…`, `51e24561…`, `47c0a0d5…`). The Pump Detail page itself needs `document`, so its Russian rendering was syntax-checked only; its parts are tested through `explain-ru`, the schematic and the inventory strings, not rendered in Node.


## Final flow slice (coordinator CUA review)

- **Planner entry:**
  - Before any path is chosen, the summary's next action is a single primary button «Выбрать путь рассмотрения ↓ / Choose a review path». It scrolls to and focuses the first review-path radio.
  - Once a path is chosen, the button becomes «Ответить: … / Answer: …» and focuses the first unanswered question's control.
  - "Save draft" is primary only once a path is chosen and every question is answered, so entry has exactly one primary action.
  - The lifecycle tables moved after the choices, into a collapsed «Сравнить затраты / Compare costs» disclosure. Its open state is remembered and all calculations are unchanged. The editor stays collapsed.
  - The cost caption reads «EUR (без НДС), постоянные цены» in Russian; the model values `excl. VAT` / `constant-real` are unchanged.
  - Tests: one primary action before the choices; Compare costs closed, placed after the choices, and containing the tables (EN and RU); the jump target exists once a path is chosen; RU caption with the enum unchanged.
- **Pump Detail for train pumps with a reviewed case** (PUMP-01, 02, 04):
  - The banner now says that full minute-by-minute replay is not included and that a separate reviewed episode is available. It has a primary «Открыть разобранное предупреждение / Open the reviewed warning» button.
  - Train pumps without a case keep the inventory-only banner, which adds "inventory only does not mean healthy".
  - Every pump that has a reviewed case gets a «← Назад к разбору предупреждения» link in the header. The link carries `case=`; without `t=` the review keeps its own clock.
- **Clock bar:** «Видно закрытых минут: N из M · окно …» is translated. The chart titles, span options, `! предупр.`, «На …», gap notes and the ground-truth paragraph were already translated before this review.
- **Training-pump badge:** the header badge for training pumps is now the neutral «Обучающий насос · паспорт» / "Training pump · passport". The banner below it says whether a reviewed episode is available.
- **Fixed:** a stray `'` after `</p>` on the invalid-pump page, left by a scripted edit.
- `node --test tests/*.mjs` → **94/94 pass**. Data bytes are unchanged. The banner and back link (Pump Detail needs `document`) were syntax-checked only, not rendered.

## Limitations

- No browser verification by me: layout at 1440/940/390, overflow, focus visibility, jump-button scrolling and console errors are untested. The coordinator's CUA review is pending.
- Russian remains original-English only in the listed source-only exceptions above (technical disclosures, historical Evidence tables, raw IDs, and a few dynamic store/model messages).
- The review's 1440×900 first viewport should show the title, the action buttons and the top of the visual evidence plus the Next check panel; this is not verified. The Fleet hero is compact, but the actual heights are unmeasured.
- The schematic is a generic functional diagram, not an installation drawing.

## Suggested CUA checks

1. **Fleet (EN, then click RU):** the path and one primary start button are visible; switching keeps the filters; `<html lang>` changes.
2. **Start → P04 at the warning:** title, summary, buttons; spread bars and chart above the observations; the Next check panel and the schematic with the Q focus ring and chip.
3. **"Before warning" in both languages:** no inference; inventory-only schematic.
4. **P02 / P08 timeline and bars; P08 at +1 day:** the ages.
5. **P01:** the gap visual and the "Assess missing measurement" button lead to the Planner.
6. **940 single column; 390 with no overflow.**
7. **Pump Detail PUMP-08 12:38 regression; Planner inputs survive a language switch.**
