# Task020 — service-engineer portfolio overview

User requests an optional collapsible visual grouping by vessel/plant, useful at hundreds of pumps, plus an honest distinction between supplied benchmark data and additional illustrative simulation. Preserve EN/RU, compact technical labels and the existing diagnostic flows. No video work.

Claude Code is the sole application-code writer. Implement locally; no Git, paid/cloud tools, dependencies or data regeneration. Codex reviews the actual browser and commits.

## Product slice

Add an initially expanded, collapsible portfolio panel near the top of #/fleet. Persist its open state across rerenders/language changes, preferably locally. It should be a visual navigation aid, not a long explanation. Use crisp inline SVG vessel/factory silhouettes, grouped pump markers, brief counts, clear selected state and functional drill-down/filter. Existing search/site filters and reset must stay consistent. No invented physical connections or paired topology.

Two clearly separated modes inside this panel:

1. **Challenge data / Данные задания** (default): derive six groups from the actual asset.site metadata. Vessel A has 01/02/03; Vessel B 07/08; Vessel C 10; Plant C 04/05/09; Plant D 06/12; Plant E 11. Show concise bilingual site names with full source name accessible. Derive counts and pump availability markers from existing helpers and cases. Markers/legend distinguish recorded review, replay, passport only, and blind test where applicable. Availability categories overlap; avoid double counting assets. Clicking a site filters the real queue/table; allow All sites/reset. Cards remain available to switch sites and show selected group, and note the scope if other filters apply. Historical records have different dates: never imply simultaneous live health, current alarms or healthy pumps. A compact visible source badge and note say supplied synthetic data / historical records / not live. Sites are organizational grouping, not piping connections. Review loading/errors must not turn into confirmed zero review counts or inventory-only state.

2. **Scale scenario / Сценарий большого парка**: separate deterministic illustrative snapshot of 200 SIM-prefixed pumps across 20 fictional sites, isolated from benchmark IDs, counts, routes and diagnostic calculations. This illustrates fleet triage and navigation, not detector validation or actual monitoring. Clearly label SIMULATED SCENARIO throughout; short visible explanation of purpose, expandable source/limitations. Example state partition: 12 equipment inspections, 18 measurement checks, 10 missing-data assets, 160 with no simulated flag (not proof of health). All assigned states are authored examples, not predictions. Use intuitive icons plus compact labels/legend, small count bars or pump-marker grid; don't rely on color alone. Let engineer filter priority/state and select a site; show that site's pumps with concise issue + next advisory check. Each available interaction must work; no fake live/connect/control button. No benchmark navigation from SIM cards. No generated diagnosis/evidence claims, false ROI, accuracy or claim of server streaming. Returning to Challenge data restores original filters/selection and all original counts. Changing scenario state cannot affect the real queue or coverage table; preferably do not show benchmark panels under the scenario mode to avoid mixing sources, while retaining their state for return.

## Presentation

Keep production-oriented light design and sidebar, generous click targets, accessible names/focus, mobile responsive (1440/1161/940/390). Compact text and recognizable ship/factory icons, avoid a sea of paragraphs or 200 full rows. Panel disclosure and mode controls must be obvious; source distinction visible even when collapsed. No stock photos needed. Dates/labels remain honest. Technical Ps/Pd/Q/n/V/I preserved.

## Verification and handoff

Add meaningful pure tests for exact site membership/counts, loading handling, scenario deterministic totals/partition, SIM identifiers, filter/drill-down and source separation. Run current web suite (100 baseline), preserve all frozen web/data hashes and benchmark files. Test EN/RU labels. Codex handles CUA; don't claim visual QA without browser. Write docs/tasks/020-handoff.md with changed files, results, limitations and exact interaction selectors useful for review. Include a brief product rationale documenting real supplied vs authored scenario and what this demonstrates. Keep scope bounded to this slice.
