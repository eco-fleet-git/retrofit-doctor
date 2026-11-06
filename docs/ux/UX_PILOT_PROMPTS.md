# UX Pilot prompt pack

Paste the master prompt first. Then use each screen prompt in the same design session. These are instructions for proposed visual refinements to Claude's existing Task001 UI, not a second application implementation or a request to run UX Pilot, publish or purchase anything. Preserve existing routes and working interactions when applying the designs. All placeholder measurements must remain visibly unavailable until connected to verified source data.

## Master prompt

```text
Refine the visual design of Retrofit Doctor, an engineering dashboard whose functional UI is already being implemented under Task001, for a synthetic pump benchmark demonstration at Since AI 2026. Reuse its existing application structure and working interactions. All UI text is English. The operator is a maintenance or reliability engineer who must inspect an alert, judge its evidence, identify missing observability, and prepare a retrofit review.

Deliver a coherent desktop UI with four linked destinations: Fleet Overview, Pump Detail, Retrofit Planner, Evidence & Validation. Primary canvas 1440 × 900. It must also work at 1280 × 720, with purposeful scrolling. A compact 768px layout may stack panels. Use a restrained light industrial style: near-white background, charcoal text, slate dividers, one blue action color. Amber means attention or uncertainty, red means an alert requiring review, gray means unavailable. Avoid gradients, hero illustrations, decorative gauges, large marketing cards and invented health scores. Use a compact left navigation, a clear page title, readable tables and aligned numeric columns. Prefer 14–16px body text, tabular numerals, visible keyboard focus and accessible text contrast. Status must use text and icon as well as color.

Persistent header: “Synthetic benchmark” and “Replay / metadata only”. In replay show “As of [UTC time]” and the asset ID. No “Live” badge. The twelve pumps are independent, have different observation weeks, and share no modeled hydraulic coupling. Grouping by site must not draw pipes between pumps. A fleet view is a set of independent replay snapshots, not a synchronized plant state.

Data access rules: PUMP-01–07 are train, PUMP-08–09 are labeled validation replay, and PUMP-10–12 are blind test. For this release, test pumps show public metadata and sensor inventory only. Label them “Blind test · Metadata only” and “Diagnosis unavailable”. No test health color, timeline, alert or hidden fault label. The validation ground-truth overlay is off by default, enabled only by “Show validation labels”, and always separate from algorithm output. Full-window evaluation belongs to Evidence & Validation and must be labeled as retrospective. Label information never changes predictions or the plan.

The causal B1 baseline is the default. At replay time t, reveal only completed minute windows ending at or before t and alerts issued at or before t. Never interpolate unavailable future points or precompute a chart range from future values. The first 24 calendar hours collect reference data. Show “Collecting reference”, “Reference available”, or “Insufficient reference”; the reference is empirical and not guaranteed healthy. Some channels can have no reference even when others do. Gap and frozen-sensor checks can run during collection. The first post-reference minute closes at 24:01.

Keep four separate concepts visible: installed sensor coverage, measurement freshness, statistical reference readiness, and diagnostic output. No alert does not prove health. A sensor absent from the passport says “Not instrumented”. Missing data says “No measurement available”. A missing adapter timestamp says “Freshness unavailable”. A T1 vibration/bearing update every five minutes is normal; repeated minute values are not new samples and do not prove a stuck sensor.

Locked validation facts: causal composite score 76.01253946, historical original 78.01253946; both detect 8/9 events and correctly classify fault type for 4/9 events; one false episode each; causal 15 alert rows versus original 16. Original B1 used future reference information for early outputs. Display 76.01 and 78.01 with exact values in details. This is a composite score, not accuracy. 209 causality checks and 18 regression tests passed in the recorded run, not a field certification. No improved accuracy, hardware measurement, savings or installed device may be implied. Confidence is an uncalibrated baseline score, not a fault probability.

Retrofit Planner proposes engineering hypotheses. It does not simulate new measurements or recompute performance when a sensor is added. Every suggestion needs a rationale, possible mounting location to verify, integration questions, maintenance questions, certification-review questions, and a validation experiment. Cost, installation time, battery life, radio coverage, protocol compatibility and approval remain “Not assessed” unless supplied. No named certification badge or claim of compliance.

Provide: the four primary frames, annotated interactions and a reusable component sheet containing asset rows, split labels, alert/evidence rows, channel states, reference state, source provenance, review checklist and empty/error states. Include loading, empty, source unavailable, collecting reference, insufficient reference, alert, no alert, blind-test metadata and draft-plan states. Charts have units and UTC axes. All actions have a visible outcome. No control writes to equipment.
```

## Fleet Overview

```text
Using the master prompt, design Fleet Overview. Above a 12-row asset table show three inventory counts: “12 independent pumps”, “2 validation replay assets”, “3 blind test assets”. These are inventory counts, not diagnostic results. Place search, split filter and site filter above the table, plus “Reset filters”. Default split is All and default sort is asset ID. Do not invent a fleet health or alert count.

Columns: Pump, Site / application, Split, Instrumentation tier, Replay as of (UTC), Latest visible alert, Reference, Action. Grouping by site is optional but adds no links between pumps. Keep “Independent snapshots · Observation weeks differ” immediately above the table. Train rows can say “Replay not loaded”. Validation rows open causal replay. Test rows show “Metadata only” in the time column and “Diagnosis unavailable” in the alert column. Their action is “View sensor inventory”. Metadata-only is gray, never healthy green.

Use source passport wording for sites and channels. Exact inventory anchors: PUMP-08 is Vessel B, seawater cooling, T1, validation. PUMP-09 is Plant C, cooling-water circulation, fixed speed, T2, validation. PUMP-10 is Vessel C, T1, test, 11 channels. PUMP-11 is Plant E, T0, test, 6 channels. PUMP-12 is Plant D, process-water transfer, T2, test, 13 channels, fixed speed with no measured RPM channel. Static rated RPM must not become a time-series reading.

Default selected demo row: PUMP-08 at 2025-09-10 12:38 UTC, with “Suction strainer clogging · Baseline prediction”. Do not invent current pressures, flow, vibration, uptime or fleet counts. Use “Not loaded” for rows whose replay data is not supplied. Click opens Pump Detail preserving filters and the selected asset’s clock. A separate “View validation results” link opens the retrospective Evidence & Validation page. Annotate keyboard row navigation, no-results state and source-unavailable state with a retry action.
```

## Pump Detail

```text
Using the master prompt, design Pump Detail for PUMP-08. Header: “PUMP-08”, “Vessel B · Seawater cooling”, “Validation replay”, and “Synthetic benchmark”. Show explicit “As of 2025-09-10 12:38 UTC”. Replay is paused initially. Controls: Play/Pause, previous/next completed minute, and a time selector constrained to this asset’s observation window. Navigation back to Fleet preserves filters. No cross-asset shared clock.

Use a two-column work area: approximately two thirds for a traceable evidence timeline and one third for the selected alert and next engineering action. Provide a lower sensor inventory with channel, installed state, native update interval, last measurement time, age and reference readiness. Channel values and plotted points come from verified data only. If absent, render an intentional “Signal data unavailable” state and retain the sourced alert text.

Selected causal alert, verbatim source values:
Issued: 2025-09-10T12:38:00Z.
Class: MACHINE.
Type: SUCTION_STRAINER_CLOGGING.
Evidence: “B1 mode-aware z: suction_pressure_kpa z=-6.7”.
Recommended action: “Inspect / clean suction strainer.”
Display confidence only in details: “Baseline confidence 0.559 · Uncalibrated”. Preserve the exact underlying value 0.5587501525878906.
Visible interpretation: “Baseline prediction. Engineering review required.”

Use a pump schematic only as conceptual placement context, preserving the source disclaimer. Suction and discharge pressure are on opposite sides of the pump, not a filter or heat-exchanger differential measurement. Fluid temperature has no exact mounting point specified. Vibration and bearing temperature belong to the pump bearing housing. Winding temperature belongs to the motor. Current and power come from drive/cabinet/meter context. A sensor absent from this passport must not appear installed. Separate any proposed instrumentation with a dashed mark and “Proposed” text.

Charts use source units and show a vertical “As of” boundary with no future points, alert markers or labels. Provide separate chart-selection and evidence-selection interactions. T1 vibration and bearing temperature update every five minutes: show actual sample age without inventing interpolated samples. Do not display a flatline fault just because held values repeat.

“Show validation labels” is off by default. When on, label the overlay “Ground truth · Retrospective evaluation” and keep it visually separate from the baseline diagnosis. Reveal labels only up to the replay time in this screen. Opening full results goes to Evidence & Validation.

Primary action: “Review retrofit options”. Secondary: “View source evidence”. Design additional frames: first-day “Collecting reference”, “Insufficient reference”, no alert (“No baseline alert in this visible history”), communication loss with no trustworthy current measurement, unknown diagnosis, and test metadata-only. Alerts remain visible during reference collection if the baseline emitted them. No health score, physical control, autonomous work order or invented repair completion.
```

## Retrofit Planner

```text
Using the master prompt, design Retrofit Planner as a review worksheet with the selected pump retained in the header. Banner: “Engineering hypothesis · Installation and benefit not validated”. Inventory remains separate from proposed additions. Default proposal on PUMP-08: “Assess flow measurement feasibility”. Ground the proposal only in the documented absence of flow_m3_h and the diagnostic question “Would flow context help distinguish hydraulic restrictions?” Do not imply that an added flow measurement proves filter blockage or improves the current model.

Left side: existing coverage and selected evidence, including the causal alert timestamp. Main area: selectable candidate cards, one expanded review worksheet and a draft summary. Candidate data contains a question, existing limitation, proposed channel, installation to assess, integration to assess, maintenance to assess, certification review and planned validation. Default flow method: “Not selected”. Do not assert clamp-on compatibility or specify a fabricated vendor. “Defer retrofit / review existing instrumentation” is a valid decision.

Expanded candidate fields:
- Rationale: “PUMP-08 has no flow channel in the public passport.”
- Installation: “Confirm pipe material, diameter, access, operating conditions and a suitable measurement location.”
- Integration: “Confirm signal interface, timestamps, gateway access and data ownership.”
- Maintenance: “Define verification, calibration and access requirements.”
- Certification review: “Determine applicable vessel/site requirements with the responsible engineering authority.”
- Expected diagnostic value: “Hypothesis only. Additional flow context may help assess hydraulic behavior.”
- Validation: “Evaluate diagnostic value on train, then locked validation. Physical installation feasibility requires a separate survey.”
- Cost, downtime and compatibility: “Not assessed”.

Use review states “Open”, “Draft response”, “Needs evidence”, and “Not applicable · Rationale required”. Completing a checklist creates “Ready for engineering review”, never “Approved”, “Certified” or “Installed”. In this demo the user records a draft, not external approval. Buttons: “Add to draft”, “Remove”, “Save draft”, “Reset draft”. Show saved-in-this-browser feedback and preserve asset-specific drafts. Saving never contacts equipment or sends a message.

Provide alternative metadata-only examples for test pumps without diagnoses: PUMP-11 lacks suction pressure, flow, vibration and bearing temperature; PUMP-10 has T1 vibration/bearing updates every five minutes; PUMP-12 has no measured RPM and has fixed-speed control. No candidate activation adds synthetic readings or changes the benchmark score. Do not recommend installing a channel already present as if it were absent.
```

## Evidence & Validation

```text
Using the master prompt, design Evidence & Validation. Persistent title note: “Retrospective evaluation · PUMP-08–09 · 9 scored events · Synthetic data”. Keep this mode visibly different from replay. Full validation results may be visible here, but no result is sent back into the detector or planner decision logic.

Primary comparison table:
Metric                             Causal B1       Original B1
Composite score                    76.01           78.01
Detected events                    8/9             8/9
Correct fault type                 4/9             4/9
False alert episodes               1               1
Alert rows                         15              16
Show exact scores 76.01253946 and 78.01253946 in details. Caption original: “Historical offline baseline · Early outputs used future reference information”. Caption causal: “Current baseline · Completed windows only”. Explain “The 2-point score decrease follows a later first matched alert for PUMP-09-E04. Diagnostic rules did not change.” No upward performance arrow or improved-accuracy headline.

Below: a nine-row event table with event ID, pump, ground-truth type, first baseline prediction, detected, type correct and first alert UTC. Detection and type correctness use separate columns. Missed events have “No matched alert”, not a fabricated timestamp. Open a row to see the raw source alert separately from retrospective matching.

Mandatory failure examples: PUMP-08-E02 bearing wear matched to UNKNOWN; PUMP-08-E04 discharge-pressure noise spikes missed; PUMP-09-E04 current-sensor drift matched to SENSOR_CALIBRATION_SHIFT with evidence pointing at vibration. The corrected first alert for PUMP-09-E04 is 2026-02-11 06:28 UTC, 41 h 42 min later than the original first alert. A scorer match is not a verified causal diagnosis.

Evidence section: “209 / 209 causality checks passed” and “18 regression tests passed”, captioned “Recorded software checks · No field validation”. Include source file paths and recorded provenance where available. No new run date or fake commit/hash. If the underlying evidence cannot load, show “Verification evidence unavailable” and keep the claim marked as a documented result, not a check just performed by the app. Tests tab explains prefix comparison, frozen first-day reference, and unchanged past outputs. Limitations tab includes empirical reference, T1 cadence, wrong sensor attribution, small validation set, synthetic data and batch/replay runtime.

Do not present test accuracy, test labels, physical measurements, financial returns or certification claims. Provide a useful source-unavailable state and explicit return to the previous pump replay without changing its clock.
```
