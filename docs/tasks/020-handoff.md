# Task020 handoff — site portfolio and separate scale scenario

Claude Code was the sole app-code writer. No Git, video, cloud, dependency, data or method changes. **No browser was run by me**; no visual QA is claimed.

## Product rationale

A service engineer responsible for many pumps first needs to find *where* to look. The **Challenge data** mode groups the 12 supplied pumps by their real `asset.site` (3 vessels, 3 plants) as a visual navigation and filter aid. It shows only what the supplied data supports: which recordings or passports exist. These are historical records from different dates, so the panel never shows live health, alarms or pumps marked healthy. Sites are organisational groups, not piping connections.

The **Scale scenario** shows how the same interaction would look at 200 pumps and 20 sites. It is an **authored, deterministic illustration** (SIM-prefixed IDs, fictional sites, example states), labelled SIMULATED SCENARIO throughout. It is kept fully apart from the benchmark: no benchmark IDs, counts, routes or diagnostics. It demonstrates navigation and triage at scale, not detector performance, monitoring, accuracy or savings.

## What changed

- **`web/js/portfolio.js`** (new, pure):
  - `siteGroups(assets, cases)` gives the six groups with exact members, `reviews`, `replays`, `passportOnly` and `blindTest` counts. Each asset is counted once; the availability categories overlap.
  - **While loading or after a load failure** (`cases === null`), `reviews` and `passportOnly` are `null` (unknown) and no pump is marked review or passport-only. Replay availability stays known.
  - `scaleScenario()`: 200 `SIM-001…SIM-200` pumps at 20 sites `SIM-S01…S20` (alternating fictional vessels and plants, 10 pumps each). A fixed-seed shuffle assigns the authored partition **12 equipment inspection / 18 measurement check / 10 missing data / 160 no simulated flag**. Each flagged pump gets an authored issue key with a matching advisory check.
  - `scenarioTotals`, `filterScenario`.
- **`web/js/portfolio-view.js`** (new, DOM-free `renderPortfolio`): the panel HTML with inline SVG ship and factory silhouettes and per-pump markers.
- **`web/js/app.js`:**
  - The panel is inserted at the top of `#/fleet`.
  - State: `state.pf = { open, mode, simFlag, simSite }`. The open state persists in `localStorage` (`rd-pf-open`, guarded).
  - **In scenario mode the overview renders only the panel.** The benchmark filters, KPIs, queue, preview and coverage table are hidden, but their state (filters, selected case) is kept. Returning to Challenge data restores them unchanged.
  - Bindings: site cards set or toggle the **real** `state.filters.site`, so the queue, coverage table and the site `<select>` stay consistent, and Reset clears it as before.
- **`web/js/i18n.js`:** 56 new `pf.*` / `sim.*` keys in EN and RU (parity 304/304).
- **`web/styles.css`:** Task020 block. The scenario panel has a dashed orange frame and an orange badge; the real-data panel has a neutral badge. Grids collapse to 2 columns at ≤600 px.
- **`tests/web_portfolio.test.mjs`** (new, 7 tests):
  - exact site membership and per-site counts; the 12 assets counted once;
  - while loading, counts are null and there are no review or passport claims;
  - scenario: deterministic, 200/20/10 per site, partition 12/18/10/160, unique SIM IDs not colliding with benchmark IDs, no benchmark identifiers or method names inside;
  - flag/site filters, with challenge groups unchanged;
  - challenge-mode render in EN/RU (6 sites + All, selected `aria-pressed`, scope note, 3 TEST markers with names, no SIM text);
  - loading-state markers (only replay or loading);
  - scenario render in EN/RU (SIMULATED SCENARIO badge, no `PUMP-`, `href="#/` or site filters; 20 sites; inspection count 12; the site list shows exactly that site's flagged rows).

## Results

- `node --test --test-timeout=30000 tests/*.mjs` → 107/107 at first delivery; **108/108** after the first CUA corrections, **109/109** after the second.
- Frozen bundles byte-identical (`8ffff27f…`, `168ab6cf…`, `51e24561…`, `47c0a0d5…`). The Task019 coverage table is unchanged.

## Corrections after the coordinator's CUA pass

1. **Disclosure affordance:** the summary now has a chevron (it rotates when open) and a visible «Collapse/Expand · Свернуть/Развернуть» text. The text is updated on the native `toggle` without a re-render, and it is correct after a language change.
2. **Overflow in the "no flag" card:** flag chips use a `minmax(0,1fr)` label column with `min-width:0` and normal word wrapping. The Russian label is shortened to «Без отметки». A visible note under it reads «not proof of health / не доказательство исправности».
3. **Clipped scenario site cards:** explicit line-height and min-height on the cards and the flag rows.
4. **Source presentation (corrected after the second CUA pass):** in scenario mode the whole shell matches the data on screen.
   - The shell footer intro (`[data-i18n="foot"]`) reads «Illustrative fleet scenario; no equipment connection; advisory only / Иллюстративный сценарий парка; нет связи с оборудованием; только рекомендации».
   - The provenance line (`#provenance-foot`) is empty.
   - The sidebar badges read «Simulated scenario / Смоделированный сценарий» and «Authored example states / Авторские примеры состояний».
   - The fixed-seed / in-browser detail moved into the scenario's «Source and limitations» disclosure.
   - Everything is restored by the next render after leaving the mode or route, because every render re-applies the `data-i18n` strings and the route's provenance line.
5. **PUMP-08 marker:** one marker with **both** the review and replay icons and a single pump number. Every marker now carries the icon of each available kind.
6. **State filter:**
   - Selecting a state **hides** sites without matching pumps; a selected site stays visible.
   - A live line shows "Showing X of 20 sites · N matching pumps".
   - A selected site with no matching pumps shows «No pumps with the state "…" at … / На площадке … нет насосов с состоянием «…»».
7. **Mobile legend:** each icon and its label is one nowrap item, so they never split across lines.
8. **"All sites"** is now a small toolbar button above the six site cards (`#pf-all`), not a seventh card. The six cards are a 3 × 2 grid on desktop (alphabetical order puts the plants in the first row and the vessels in the second) and 2 columns at ≤900 px.

**New test** (8th in `tests/web_portfolio.test.mjs`):
- the Collapse/Expand text in EN and RU in both states;
- PUMP-08 has two icons and one number;
- the missing-data filter shows only matching sites, with the exact count line;
- the "not proof of health" note is present;
- the empty-site message, with the selected site still visible.

A 9th test checks that the scenario footer wording is free of implementation detail, that the seed detail is in the sources disclosure, and that both badges differ from the benchmark ones. `node --test tests/*.mjs` → **109/109 pass**; bundles are byte-identical. The footer and sidebar swap is DOM-side, so it is syntax-checked and not unit-tested.

## Interaction selectors for CUA

| What | Selector |
|---|---|
| Panel disclosure (open by default; persisted) | `details#pf` / `summary` |
| Source badge, visible when collapsed | `.src-badge.src-real` / `.src-badge.src-sim` |
| Mode buttons | `#pf-mode-challenge`, `#pf-mode-sim` (`aria-pressed`) |
| All sites (toolbar button above the cards) | `#pf-all` |
| Site cards (toggle the real site filter) | `[data-pf-site]`, ids `#pf-site-0…5` (alphabetical: Plant C, Plant D, Plant E, Vessel A, Vessel B, Vessel C) |
| Scope note when search/availability/split also filter | `.pf-scope` |
| Scenario flag filters | `[data-pf-flag]`, ids `#pf-flag-all/inspection/measurement/missing/none`; selecting a state hides non-matching sites (`.sim-count` shows how many) |
| Scenario sites | `[data-pf-sim-site]`, ids `#pf-ss-SIM-S01…S20`; non-matching sites are hidden; a selected non-matching site remains dimmed to explain the empty result |
| Scenario site list / clear | `#sim-list-h`, `#pf-sim-clear` |

**Suggested checks:**
- select Vessel B, and confirm the queue shows PUMP-08 only and the coverage table shows 07/08;
- switch to the scenario: the benchmark sections disappear;
- pick "Missing data" and a site: the rows list issue and advisory check;
- switch back: the Vessel B filter and the selected case are still in place;
- switch EN/RU in both modes;
- check widths 1440 / 1161 / 940 / 390.

## Limitations

- **Not rendered in a browser by me:** the app integration needs `document` and is syntax-checked only; its parts are tested through the DOM-free modules.
- The scenario is generated in the browser on each load, from a fixed seed, and is the same every time. Its issue and check texts are authored examples.
- The scenario's flag and site selection lasts only for the session; the panel's open state persists.
- Site cards filter by exact `asset.site`. Selecting a card with an availability filter that excludes all of its pumps empties the queue and table, and the scope note explains that other filters also apply.
