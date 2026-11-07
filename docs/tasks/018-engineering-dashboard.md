# Task018 — implement corrected engineering dashboard, EN/RU

User instruction, 7 November: correct the generated mockup errors and transfer this design into the application, preserve Russian and English, do not make another demo video until the interface is finished. This authorizes app implementation, not another paid UX Pilot generation. Correct the design in the real local application; generated PNGs remain unmodified historical references.

Claude Code is the only application-code writer. Codex owns scope, browser review and Git. Read AGENTS.md, both iteration-02 screenshots, coordinator-review.md and receipt-and-claude-review.md. Preserve existing unrelated files. No dataset, diagnostic method, benchmark, future-data rules or video changes. No cloud services, paid calls, publication, dependencies or permission changes. Existing frozen JSON bundles must remain byte-identical.

## Outcome

Use the iteration-02 visual language (light slate background, white panels, restrained blue/amber, sidebar, equipment queue, evidence and next action side by side) throughout the existing app. Replace the tutorial-first homepage with a practical engineering overview. Keep all existing routes and meaningful capabilities; no fake backend, avatars, operators, work orders or unsupported scores.

### Overview / Обзор

- Compact page heading and recorded-synthetic-data context. Four cards derived from actual availability: total assets, recorded warning reviews, replay datasets, inventory-only assets. Explain overlap; these are not active alarms or health counts. Derive counts rather than hardcode them.
- A review queue with four actual historical cases: asset/site, exact date/time UTC, plain-language reason, explicit evidence availability, working link to review. Selection is not urgency. PUMP-04 may be default selected. Selection updates a meaningful preview and next-check link, not invented telemetry. Use existing clock-sliced explanations at that case's warning boundary; labels/ground truth stay opt-in.
- P04 preview uses real measured and calculated pressure-rise data, with units, time range, legend Pd − Ps, and a short takeaway. Other cases use their truthful waveform-age or missing-measurement explanation. No placeholder pseudo-chart.
- Search/site/availability filters work. Existing all-assets area becomes useful coverage table with installed/missing channel indicators explicitly meaning sensor installation, not health. Include correct availability labels and useful links. Metadata-only pumps 10–12 must never be called assessable/diagnosed.
- Put technical provenance/research details in disclosures or the existing evidence route.

### Engineering workspace / Проверка насоса

- Restyle the diagnosis route into the reference workspace: breadcrumbs/back to overview, selected pump and real system/site, timestamp, compact case selector, one plain-language finding, evidence area left and next-check panel plus compact sensor schematic right. Retain existing replay/time controls in a less dominant recorded-data section. Avoid duplicate headings and repeated large action buttons.
- P04 main pressure chart first, then residual-spread comparison 7.3 vs 3.5 kPa and optional flow trace. Make dates, visible kPa axis, measured Pd − Ps, curve-derived values and reference limitations unambiguous. No data after selected clock; one-second-before-warning remains unavailable. Formula, alternatives, first-day reference qualification, train-only support and narrow decision-rule margin remain accessible.
- Next-check sentence concise and concrete in EN/RU; independent flow measurement is a proposed check, not a confirmed fault or installed electromagnetic/ultrasonic device. Do not invent sensor identifier P04-Q.
- Diagram shows actual inventory or explicitly labelled subset with a complete inventory link. Keep it compact enough to see with the action on desktop. Motor outside fluid path. Existing sensor placement caveat stays.
- Carry the same coherent layout into P08/P02/P01 cases, ordinary pump detail and retrofit planner. Preserve waveform ages, no-flow gaps, unresolved cause, ROI assumptions and negative illustrative outcome. Do not imply current fleet health or simultaneous recordings.
- Only working navigation/actions. Do not add manual-measurement/upload buttons unless implementing an explicitly local-only feature within scope; prefer existing functional actions, no new persistence workflow needed.

### Bilingual and responsive

- Real EN/RU content in all new headings, navigation, queue, filters, charts, captions, units, action panels, empty/loading/error states and sensor labels. Existing explicitly marked original-source technical English may remain in deep disclosures. Persist chosen language and selected route/case/filter/clock through language changes.
- Desktop 1440 and 1280: finding and next action visible without scrolling; chart and compact schematic useful at ordinary zoom. Tablet 940 and mobile 390: action first or immediately after finding, readable stacked cards, no page-wide horizontal overflow. Coverage table may use a labelled scroll region. Sidebar/navigation remains usable.
- Semantic HTML, focus visibility, accessible chart text/legends, contrast, no reliance on colour alone, meaningful empty states.

## Verification and delivery

Run existing relevant web tests (currently 94) and add only meaningful regression tests for availability counts/classification, no future evidence in new preview, and bilingual selection/filter behaviour where feasible. Do not weaken tests to hide regressions. Hash the four frozen data bundles before/after. Node tests do not substitute for visual QA.

Codex will inspect the running app with CUA in EN/RU, at desktop/tablet/mobile widths, check the four case routes, filters, language persistence, planner, time-before-alert and console/runtime issues accessible via supported UI. Do not use browser automation outside CUA, and do not claim to have run a browser if you have not.

Return a concise handoff in docs/tasks/018-handoff.md: files changed, tests, hashes, limitations. No Git commit/push from Claude; coordinator handles it. Pause new video generation until the user resumes after UI completion.
