# Retrofit Doctor — delivery plan

Approved 2026-11-06. First usable demo: **2026-11-07 12:00 Europe/Berlin (11:00 UTC)**. Product and pitch English; coordination Russian. Owner has practical cooling-system delivery experience across datacentres, factories and boats.

## Product outcome

An engineer can inspect a pump, understand whether the evidence suggests a machine fault, sensor fault or insufficient information, and decide the next measurement/check. Retrofit Planner explains what additional instrumentation would resolve, what it cannot resolve, and when installing it is not worth the total cost. No device is built. No automatic control, certification or real-world performance is claimed.

Baseline views: Fleet Overview (12 independent assets and actual sensor coverage), Pump Detail (time-bounded trends/evidence/alternatives/action), Retrofit Planner (existing vs added measurements and integration assumptions), Evidence (baseline comparison, experiments and limitations). Test assets show metadata/coverage only during development; labeled replay uses train/validation assets.

## Delivery sequence

1. Foundation tonight: private Git, immutable baseline, task contracts, UX Pilot prompts, Claude access. Deliverable: reproducible repo + written scope.
2. First vertical slice: local English dashboard with real benchmark-derived replay data, pump selection, as-of time, coverage and evidence. No synthetic invented telemetry; the supplied benchmark itself is synthetic. Deliverable: running local URL + smoke evidence.
3. Diagnosis experiments: finite hypothesis registry, train-only parameter selection, causal checks, honest comparison with both B1 variants. Negative and inconclusive results are valid. Ship existing causal B1 if a candidate fails gates.
4. Retrofit justification: sensor ablation on rich train/validation assets; integration design, lifecycle cost scenarios, explicit assumptions, gaps and field-validation plan. No extrapolated guaranteed savings.
5. By noon: integrated reproducible demo, concise English slide content/PDF, 3-minute demonstration script, fallback screenshots. Recorded video and final submission CSV follow frozen release criteria.
6. Review iteration 1 planned 12:00–14:00: user feedback on engineering logic, evidence and operator journey. Iteration 2 planned 14:00–16:00: clarity, visual polish, pitch rehearsal and release fixes. Times are planning targets, not evidence of scheduled autonomous execution.

## Acceptance

Historical first-release implementation queue after the reviewed negative B2 result: Task003 Planner → Task004 fixed sensor ablation → Task008 bounded sparse-stuck follow-up → Task005 regime/reference experiments → Task006 integrated demo and corrected UX Pilot direction → Task007 final sealed export/release. Task008 is explicitly a new experiment registered after observing quantization-related false warnings, not a hidden change to B2 v1. Each experiment has a finite candidate budget. The later user-authorized continued search registers new bounded waves rather than changing failed gates. No second paid UX Pilot generation is planned.

- Fresh local run instructions work; core demo operates without cloud services after dependencies are installed.
- 12 assets use verified metadata; missing inputs are not zero/healthy.
- Replay never renders signal/evidence later than its as-of clock. Ground-truth overlays are visibly separate evaluation views.
- Fixed causal baseline comparison preserved: validation 76.01253946 vs original 78.01253946; both detect8/9 and correcttype4/9. 209 prefix checks passed. The lower score exposes delayed drift detection; it is not hidden.
- A proposed sensor has a decision it supports, a tested or untested evidence label, integration requirements and cost assumptions.
- All new algorithm claims have train/validation split, configuration, metrics and provenance. Nine validation events do not establish field performance.
- Keyboard navigation, readable text, loading/empty/error/stale/warm-up states, desktop and narrow-screen smoke, no browser console failures.
- No physical-device or certified-product claims; explicit shadow-mode pilot path.

## Architecture decision ADR-001

Keep Python detector/evidence export and a small local browser UI. Prefer static versioned JSON bundles for the demo: deterministic, offline, low operational complexity. Add a live service only when a concrete interaction needs it. Existing batch/replay detector is not an incremental edge deployment. A proposed field architecture has read-only existing telemetry + optional retrofit sensors → local buffered analysis → advisory UI; detailed protocol and regulatory suitability require a site assessment.

## Sources and ownership

Baseline: README.md, B1_FINDINGS.md, CAUSAL_B1_FINDINGS.md, results/. Sensor map: diagrams/. Organizer: vendor/benchmark/RETROFIT_FEASIBILITY.md and challenge brief. Read current authoritative sources before making new regulatory or current product-price claims; dated organizer BOM remains a dated example, not a fresh quote.

Main Codex chat owns this plan/Git/task status; UX helper owns docs/ux; experiments helper owns docs/experiments; Claude owns implementation. Todoist project: https://app.todoist.com/app/project/6hwchMHXFQVmmj9M. Obsidian Project Context stores decisions and resume point, not a duplicate backlog.

## Current research iteration — 7 November

Tasks010–012 were negative. Task013 selected the frozen Z995 combination on train: correct type8→10/26, sensor type+channel3→4/8, detection18/26 and burden6 unchanged. Task014 passed descriptive validation: type4→5/9, detection8/9 and burden1 unchanged, no prior correct diagnosis lost. Validation is previously inspected and its gain is waveform-only. Task015 adds a separate source-specific comparison view with real before/at-alert gating and four cases including an unchanged error. Baseline replay and frozen test export stay B1. See the experiment registry and coordinator reviews013/014 for provenance and limitations. User visual feedback and timed spoken rehearsal are still pending.
