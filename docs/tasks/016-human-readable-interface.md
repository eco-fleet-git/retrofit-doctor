# Task016 — a human-readable engineering workflow

User request (7 November): the interface is still hard to understand; make it more human-readable and informative. Authorized implementation now. English product remains the agreed presentation language; Russian coordination. Use the approved light visual direction. Claude is the sole code writer. Codex owns this packet, acceptance, docs and Git. Target a45-minute slice, no extra paid UX Pilot generation. No model/data/release changes.

## Problem and concrete outcome

The Fleet page starts with dataset vocabulary and a wide table containing repeated unavailable states. The new comparison starts with model codes, duplicated caveats and retrospective research framing. An engineer cannot quickly answer: what do I look at, what might be wrong, what supports that, what do I check next?

Implement the first two screens as a coherent, understandable entry into the existing product: Fleet Overview and Diagnosis Comparison. Improve navigation labels/context if helpful, keeping routes compatible. A small orientation block on Planner is useful, but do not rebuild its calculations/forms. Preserve the existing baseline Pump Detail, sensor map, Evidence and Planner functionality.

## Fleet: guide the first action

- Lead with a short practical purpose, e.g. “Understand a pump warning. Choose the next check.” Show a three-step workflow: choose a pump → review the evidence → assess a measurement.
- Add one prominent starting action into the reviewed PUMP-04 diagnostic case. Provide concise entry points into a vibration review and the retrofit plan. Label these as recorded synthetic demonstration examples; no real-time fleet-health claim. Prefer neutral asset/measurement labels (P04 / pressure + flow, P08 / vibration), not future diagnosis labels.
- Keep12 independent pumps accessible, with readable application/sensor-coverage information. Remove repeated “Not loaded”/reference columns from the main overview. Inventory-only ≠ healthy. Distinguish “Recorded review available”, “Baseline replay available”, and “Sensor inventory only” accurately (not all train pumps have full replay).
- Move train/validation/test terminology, tier/control codes and experiment inventory to an accessible data-details disclosure; preserve filtering/search and actual metadata. No fabricated health, urgency, six circuits, installation layout or cross-asset timeline.

## Diagnosis review: decision first, evidence second, research third

Retain the exact frozen bundle, sliceCase/sliceCaseLabel boundary and source-specific explainCase semantics. No new detection claims or data. The whole answer must still be absent before the selected alert. Never use retrospective labels as input to explanation, visual status or action.

- Page header is a plain-language engineering purpose. One concise always-visible “Recorded synthetic example · advisory” context line is enough; put the complete development/validation/release scope in “About these results” / research details. Keep material case-level uncertainty visible, not buried.
- At/after the alert, lead with a short plain-language hypothesis/action title, e.g. “Check the flow measurement”, “Inspect the bearing condition”, “Cause still unresolved”. The exact title follows source/kind, does not claim confirmation, and does not label a sensor as conclusively broken.
- Put the recommended next check in a prominent small panel near the top, with its reason and a concise uncertainty statement. The engineer should not scroll past formulas to find the action.
- Under “Why this needs a check”, show2–3 comprehensible source-specific observations. For residuals: measured signals disagree with the pump-curve relation more than in the empirical first-day reference; reference is not verified healthy. For waveform: an earlier vibration recording has a pattern consistent with the suspected issue; show age prominently, including historical age at alert versus now. For unsupported P01: flow is absent, so this check could not assess the cause; B1 is retained, not a healthy outcome. Keep input-gap-only wording, not “a new sensor guarantees diagnosis”.
- Measurements should be human-labelled, with units and measured versus calculated distinction. Use useful small comparison graphics/metric cards if warranted, not decorative gauges or confidence percentages. Keep the actual measured-versus-calculated chart and explain its two lines in one sentence. No invented normal limits/health scores.
- Exact numerical thresholds, covariance shares/equations, identifiers, full tables and hash lists belong in native disclosure panels. The narrow residual threshold margin must remain visible in plain words (“This result is close to the rule boundary; verify with an independent measurement”), with exact0.013 in details. The hydraulic component's train-only support remains discoverable and clearly stated in result scope.
- B1/Z995 comparison becomes a secondary “What changed from the earlier method?” disclosure (plain-language before/after with exact codes in technical details). Avoid B1/Z995/E995/W1 dominating the first screen. Keep raw outputs available.
- Observation time remains visible. Group “Before warning” / “At warning” controls as an understandable replay demonstration; advanced ±minute/hour/day can be secondary. Preserve seconds, URL deep links, stale/historical evidence and functional controls.
- The benchmark scorecard moves below the clinical/engineering content or into its own clear results disclosure, with denominators and train versus already-inspected validation. Preserve every event, gains/losses, known misses and test-release scope. Ground truth stays separate and opt-in, per-case before-alert gated.
- Include a concise next navigation action to the pump's installed measurements/retrofit plan. Do not present purchased hardware or changed controls.

## Visual acceptance

An unfamiliar engineer should find a starting action on Fleet and answer within10 seconds on the diagnosis screen: which pump/time, what needs checking, why, and how uncertain. The first1440x900 viewport should show hypothesis and next action, not a wall of caveats/model terms. At940x1190 (actual side-panel width) and390x844, avoid cramped two-column layouts; stack at an appropriate breakpoint. Keep a clear hierarchy, generous spacing, readable text, focused blue action, restrained amber uncertainty, no fake status traffic lights.

No giant page-long visible provenance/JSON. No repeated blanket disclaimers where one labelled context plus specific uncertainty suffices. Preserve keyboard/visible-focus and accessible disclosures.

## Verification and handoff

Use current tests; add only meaningful workflow checks. Keep all clock/label/future-provenance checks and original data hashes. Update intentionally changed UI selectors, not assertions that protect evidence. Screenshots at1440,940,390 of Fleet and diagnosis. Check residual/waveform/unsupported/before-alert + opt-in label; next action visible; precise age; no page overflow; baseline replay and Planner navigation; no console errors. Use CUA for your interactive browser work; coordinator independently checks the user-visible result. Return docs/tasks/016-handoff.md with changed files, commands, what was tested, limitations and a simple walkthrough. No Git/push: coordinator handles them. Leave presentation files to Codex; no new model experiments.
