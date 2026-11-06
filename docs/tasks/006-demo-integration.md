# Task 006 — integrate evidence and the physical measurement concept

Claude Code implementation after Task003/004/008/005 handoffs and Codex evidence review. One writer, no Git mutation. Budget 90 minutes. Retain the four-view product structure. Read AGENTS.md, the current UI, diagrams/README.md, sensor-inventory.csv, engineering contracts and reviewed experiment manifests. Do not run new detector searches or access test telemetry.

## Apply the reviewed UX Pilot direction

The one authorized generation is complete: `design/uxpilot/README.md` and its screenshot preserve the visual reference; receipt in `docs/tasks/UXPILOT_CONNECTION.md`. Use its hierarchy, calm light palette, sidebar and separated evidence/action areas when they improve the existing workflow. All generated telemetry, inventory counts/states and source names are rejected. Implement the seven documented corrections with actual exported data and honest unavailable states. Do not copy external CDN dependencies into the offline app. No paid regeneration, review, export or external publication. The final application screenshot, not the uncorrected mockup, goes into the presentation.

## Make the measurement locations understandable

The user has practical cooling-system experience and explicitly requested a pump/motor/heat-exchanger sketch mapped to the supplied channels. Existing illustrations in diagrams/ preserve that work, but the English demo must make it accessible from Pump Detail and the Planner.

Add a readable, scalable pump-and-motor schematic driven by the selected asset's public channel inventory, with English labels and an accessible equivalent list. Distinguish installed, absent, unknown location and proposed instrumentation with labels/patterns as well as color. Click/focus a measurement to show its real channel name, cadence, physical source and placement caveat. Additions are hypotheses, never new measurements. Test pumps display metadata only.

Use the documented location semantics: suction and discharge pressure at the pump; vibration features and bearing-housing temperature on the pump bearing housing; winding temperature on the motor; current/power from drive/cabinet/meter; RPM only where measured. Fluid temperature is in the pump region with exact tapping point unspecified. Flow and valve-feedback placement is schematic. No invented mechanical pressure gauges. Pump pressure difference is not strainer or heat-exchanger differential pressure. Do not imply that a single bearing point covers every bearing or that summary vibration features are waveforms.

An optional expanded cooling concept may show separate seawater and closed freshwater LT circuits exchanging heat without mixing. Motors drive pumps through shafts and are not inline liquid vessels. Label it **Conceptual example — not the benchmark topology**. The twelve benchmark pumps are independent; never draw them as six paired circuits. Preserve the original six-site grouping only as location metadata, not hydraulic connectivity or redundancy. A clean port-level drawing with textual caveats is enough; no invented hardware photograph.

## Show the proposed retrofit solution

Add one compact explanatory view: existing historian/export and optional measurement points → local gateway/buffer/advisory analysis → engineering evidence and review. Clearly mark this as proposed field architecture; the current app is static synthetic replay. Show the concrete integration questions at each boundary: timestamp/quality/tag mapping, permitted reads and polling load, mounting/power/cables or radio/battery upkeep, local offline behavior and applicable site/class review. Existing controls/interlocks remain independent. No certification badge, claimed edge deployment or fixed BOM price.

Make the physical proposal concrete enough to discuss without building hardware: identify the optional bearing-housing sensor point or pressure/flow instrument, its mounting/process connection, cable or radio link, gateway/IO enclosure and power, and local engineering display. Explain which parts are already present, proposed, or still to be selected after a survey. A functional schematic is sufficient; do not invent an enclosure photograph, product specification, supplier quote, certification or measured installation time. The proposed package must follow the selected diagnostic question, including the valid outcome of adding no permanent device.

## Integrate reviewed experiments

Add measured B2 candidate results and reasons for rejection to Evidence. Display train/validation separately, denominator and false+excess burden explicitly; retain original-vs-causal B1 comparison and disclose invalid r1. Avoid calling score accuracy. Do not put rejected candidate predictions in operator replay by default.

For sensor mask/restore, consume only reviewed result artifacts. Show a selected group and paired full/masked/restored outcome on the same events, with original denominator, restoration check and any adverse effects. Label synthetic information ablation, not a real installation or field benefit. No automatic conversion to economic benefit, and no extrapolated PUMP-11 diagnosis. Link the relevant measurement hypothesis to this evidence without showing a missing-channel trace. If useful-delay or coverage metrics remain unimplemented, state that explicitly; no placeholder positive metrics.

Integrate E3/E4 only after review and with their exact evidence status. A not-run or inconclusive result is visible rather than presented as success. Keep selected model provenance and runtime separate from historical experiment outputs.

## Rehearse and hand off

Coordinator visual review of Task003: the full Planner is approximately 7,356 px tall at desktop because all 20 cost categories and provenance inputs are expanded. For the presentation, prioritize the selected engineering decision, supporting measurement evidence, lifecycle result and next action in the first screenful. Put the detailed cost editor and reference metadata behind accessible disclosure controls; preserve all values, validation and keyboard access. Invalid hidden fields must still be discoverable from an error summary. Do not remove required costs to make the result appear cheaper. Keep an obvious route to the illustrative negative economics scenario and its assumptions. Also check chart label readability at 390 px (a prior screenshot showed very small axis labels).

Update the English three-minute walkthrough to actual implemented interactions, including a useful alert, an unresolved/missed diagnosis, one measured sensor ablation, and the illustrative negative economics/defer outcome. Keep a short offline fallback and screenshots. Verify desktop/narrow layout, keyboard navigation, browser errors, reload and local storage, backward clock isolation and test metadata-only access. Capture the physical schematic and final Planner screens. Save docs/tasks/006-handoff.md with commands, screenshots, unresolved requirements and a concrete release checklist. User visual approval is still pending until actually received.
