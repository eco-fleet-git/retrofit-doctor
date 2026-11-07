# Task019 — readable compact coverage table

User explicitly requests shorter labels in the lower table on the first page, no overlapping text, understandable icons with a legend above, and screenshot inspection. Preserve technical abbreviations Ps, Pd, Q (and suitable n/V/I); do not replace them with long headings. Keep EN/RU. Video remains paused.

Claude Code sole app-code writer; Codex browser review and Git. Scope: overview coverage table and any related overflow found there. No diagnostics/data/benchmark changes, no paid services, no new dependencies, no videos.

## Implement

- Six compact technical column headings: Ps, Pd, Q, n, V, I, with short translated explanations in a clear legend above the table (suction pressure, discharge pressure, flow, speed, vibration, motor current). Full accessible names and tooltips where useful. Do not alter calculations or channel mappings.
- Installed/missing sensor icons distinct in shape, with visible legend. Existing filled/hollow circles are fine if explained as installation, not condition/health. No green healthy ticks.
- Replace repetitive availability paragraphs/pills and long action text with concise labelled icons or compact action buttons, and an availability/action legend above the table. Use recognisable symbols (chart/review, play/replay, document/passport). Each icon has accessible name, tooltip and generous clickable target. Avoid duplicate availability and action columns if one compact functional column conveys both honestly.
- Metadata-only pumps must remain explicitly identifiable and never imply diagnosis. Explain that passport-only means condition not assessed; blind-test metadata stays distinguishable, e.g. short test badge with legend. Do not hide this distinction behind hover alone.
- Pump identifier prominent; long site/system descriptions secondary without collisions (safe wrapping, title plus accessible full text or disclosure). No arbitrary truncation of IDs. Table row/cell min widths correct; no text spills into neighbouring columns.
- Above-table legends use real EN/RU, compact readable wrapping, no verbose repeated paragraphs. Do not shorten technical abbreviations further or invent opaque ones.
- Keep desktop table readable at 1440/1280/default~1161; tablet940 and mobile390 may use a contained horizontal scroll or compact cards, no page-wide overflow. Prior mobile layout and other app routes must not regress.

Run current web tests after changes (99 baseline); no need new tests merely for CSS. Add a meaningful check only for changed availability/action mapping if necessary. Frozen bundles unchanged. Write brief docs/tasks/019-handoff.md, no Git. Codex will inspect screenshots of the actual lower table in both languages and responsive widths and send any correction. Do not claim visual QA from tests.
