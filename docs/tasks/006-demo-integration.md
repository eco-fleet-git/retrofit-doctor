# Task 006 — integrate evidence and the physical measurement concept

Claude Code implementation after Task003/004/005 handoffs and Codex evidence review. One writer, no Git mutation. Budget 90 minutes. Retain the four-view product structure. Read AGENTS.md, the current UI, diagrams/README.md, sensor-inventory.csv, engineering contracts and reviewed experiment manifests. Do not run new detector searches or access test telemetry.

## Make the measurement locations understandable

The user has practical cooling-system experience and explicitly requested a pump/motor/heat-exchanger sketch mapped to the supplied channels. Existing illustrations in diagrams/ preserve that work, but the English demo must make it accessible from Pump Detail and the Planner.

Add a readable, scalable pump-and-motor schematic driven by the selected asset's public channel inventory, with English labels and an accessible equivalent list. Distinguish installed, absent, unknown location and proposed instrumentation with labels/patterns as well as color. Click/focus a measurement to show its real channel name, cadence, physical source and placement caveat. Additions are hypotheses, never new measurements. Test pumps display metadata only.

Use the documented location semantics: suction and discharge pressure at the pump; vibration features and bearing-housing temperature on the pump bearing housing; winding temperature on the motor; current/power from drive/cabinet/meter; RPM only where measured. Fluid temperature is in the pump region with exact tapping point unspecified. Flow and valve-feedback placement is schematic. No invented mechanical pressure gauges. Pump pressure difference is not strainer or heat-exchanger differential pressure. Do not imply that a single bearing point covers every bearing or that summary vibration features are waveforms.

An optional expanded cooling concept may show separate seawater and closed freshwater LT circuits exchanging heat without mixing. Motors drive pumps through shafts and are not inline liquid vessels. Label it **Conceptual example — not the benchmark topology**. The twelve benchmark pumps are independent; never draw them as six paired circuits. Preserve the original six-site grouping only as location metadata, not hydraulic connectivity or redundancy. A clean port-level drawing with textual caveats is enough; no invented hardware photograph.

## Show the proposed retrofit solution

Add one compact explanatory view: existing historian/export and optional measurement points → local gateway/buffer/advisory analysis → engineering evidence and review. Clearly mark this as proposed field architecture; the current app is static synthetic replay. Show the concrete integration questions at each boundary: timestamp/quality/tag mapping, permitted reads and polling load, mounting/power/cables or radio/battery upkeep, local offline behavior and applicable site/class review. Existing controls/interlocks remain independent. No certification badge, claimed edge deployment or fixed BOM price.

## Integrate reviewed experiments

Add measured B2 candidate results and reasons for rejection to Evidence. Display train/validation separately, denominator and false+excess burden explicitly; retain original-vs-causal B1 comparison and disclose invalid r1. Avoid calling score accuracy. Do not put rejected candidate predictions in operator replay by default.

For sensor mask/restore, consume only reviewed result artifacts. Show a selected group and paired full/masked/restored outcome on the same events, with original denominator, restoration check and any adverse effects. Label synthetic information ablation, not a real installation or field benefit. No automatic conversion to economic benefit, and no extrapolated PUMP-11 diagnosis. Link the relevant measurement hypothesis to this evidence without showing a missing-channel trace. If useful-delay or coverage metrics remain unimplemented, state that explicitly; no placeholder positive metrics.

Integrate E3/E4 only after review and with their exact evidence status. A not-run or inconclusive result is visible rather than presented as success. Keep selected model provenance and runtime separate from historical experiment outputs.

## Rehearse and hand off

Update the English three-minute walkthrough to actual implemented interactions, including a useful alert, an unresolved/missed diagnosis, one measured sensor ablation, and the illustrative negative economics/defer outcome. Keep a short offline fallback and screenshots. Verify desktop/narrow layout, keyboard navigation, browser errors, reload and local storage, backward clock isolation and test metadata-only access. Capture the physical schematic and final Planner screens. Save docs/tasks/006-handoff.md with commands, screenshots, unresolved requirements and a concrete release checklist. User visual approval is still pending until actually received.
