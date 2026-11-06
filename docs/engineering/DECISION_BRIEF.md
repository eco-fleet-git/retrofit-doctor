# Retrofit Doctor: engineering decision brief

6 November 2026 · proposal for the 7 November noon Berlin demo · English product copy

**Decision:** start with existing signals and a named maintenance decision. Add the smallest measurement package that can resolve a material uncertainty. Prefer a temporary measurement campaign before permanent instrumentation where installation or benefit is uncertain. Defer retrofit when access, nuisance burden, redundancy or lifecycle cost defeats the case. No hardware is being built; no field performance, savings, compliance or class credit is established.

Implementation contract: [cost model](COST_MODEL_SPEC.md), [Planner acceptance](PLANNER_ACCEPTANCE.md), [sources and evidence register](SOURCES_AND_UNKNOWNS.md). These documents supplement the existing UX contract; they do not authorize detector changes.

## Three choices, each with a decision gate

| Choice | Decision it supports | Main burden | Choose it when |
|---|---|---|---|
| **Existing signals only** | Decide whether a trend merits inspection, instrument verification or more measurement; use available pressure, current, power, speed and context | Export rights, tag mapping, timestamp/quality checks, operating-regime baseline, human review; existing data is not free integration | Existing signals answer the question, a handheld route is sufficient, or retrofit value remains unknown |
| **Minimal retrofit** | Add a specific missing perspective: bearing-housing vibration/temperature for mechanical condition, or suction pressure for inlet behaviour | Mounting and access, process connection where needed, cables or radio survey, gateway/power, commissioning and upkeep | A documented blind spot affects an actionable decision and a small pilot can test it |
| **Instrument-grade assessment** | Establish a defensible operating point and measurement uncertainty using suitable flow, differential head and electrical power measurements; add waveform capability only for a defined diagnostic need | Site survey, traceable verification/calibration, reference comparisons, engineering labour, lifecycle support and possibly intrusive work | The decision needs measured performance or finer discrimination and justifies the complete installed cost |

“Instrument-grade” is an assessment scope, not a certified bundle. Higher reporting frequency or a costly sensor alone does not establish measurement quality. Benchmark T0/T1/T2 describe supplied channels; these choices describe engineering work and must not be equated automatically. All proposed diagnostic benefits remain hypotheses until separately evidenced [L1–L4].

## What a measurement changes—and what it cannot settle

| Candidate | Useful question / next human action | Residual uncertainty and installation gate |
|---|---|---|
| Suction pressure plus existing discharge pressure | Has inlet condition or pump pressure rise changed at comparable speed/load? Inspect inlet path and verify the transmitter | Cannot locate a blockage by itself. Pump taps do not measure strainer or heat-exchanger differential pressure. Cavitation-margin assessment also needs absolute-pressure reference, fluid temperature/properties, geometry/flow and suitable pump NPSH data. Confirm range, wet materials, isolation and safe access |
| Vibration and bearing-housing temperature | Is a repeatable mechanical-condition change worth a specialist route measurement? | Summary features are not a unique fault identification. One point does not cover every bearing. Confirm rigid mounting, position/direction, bandwidth, feature window and sample cadence; housing temperature is not winding temperature [E5] |
| Flow plus head and input power | Has the operating point or wire-to-water performance changed? Verify against a suitable reference | Flow alone does not identify cause or prove savings. Account for pressure-tap elevation/velocity corrections, synchronisation and uncertainty. Electrical input gives wire-to-water efficiency, not pump shaft efficiency. Survey pipe/fluid suitability and installation geometry |
| Component differential pressure / additional temperatures | Is restriction across this component, or thermal performance across this exchanger, the question? | Requires appropriate taps and sensor locations; pump pressures and one fluid temperature are insufficient. Heat-exchanger thermal diagnosis is outside this benchmark's explicit dynamics [L3] |
| Valve position, winding RTD or leak inspection | Resolve the specific actuator, motor-thermal or leakage question | Position feedback does not prove flow; winding access may require motor work; seal leakage is not covered by the benchmark. Do not infer no valve from no feedback channel |

Sparse updates can miss short events; a fast communications interval does not prove usable waveform bandwidth. Added sensors also add drift, loose-mount, cable, battery and communication failure modes. Compare a suspect channel with an independent reference before a maintenance intervention.

## Installation and lifecycle gates

Record a location sketch, access route, isolation/work-window needs and responsible maintainer. Check corrosion, ingress, temperature, vibration, hazardous-area and vessel/site constraints for the actual location. Confirm pressure fittings and materials; cable routing, glands, EMC/earthing and enclosure space; radio coverage with machinery and doors in their operating positions. Wireless avoids some cabling but still needs maintainable batteries, gateway power and connectivity. Clamp-on flow avoids a wetted penetration but still needs accessible, suitable pipe and field verification. These are review requirements, not completed assessments.

Commission against references, preserve configuration and mounting photographs, and agree repeat checks after remounting or maintenance. Budget software support, security updates, batteries, calibration/verification, replacement access, spares, obsolete gateway/sensor migration and final removal. A shared gateway creates a shared monitoring failure; it must not become a dependency of pump control.

## Read-only integration and offline operation

Prefer an existing historian export or approved mirror. Proposed field path: **existing telemetry / optional sensors → bounded local buffer and advisory analysis → local evidence UI → optional controlled export**. SIS, interlocks and existing operational alarms remain authoritative and independent of this proposed assistant.

Read requests still generate traffic. For a future live connection, document permitted tags, protocol operations, bounded polling/retry rates, identities, endpoint permissions and boundary enforcement. OPC UA/Modbus labels alone do not prove a read-only boundary. A DMZ is not a data diode; application intent is not enforced isolation. Test denied writes only in an approved bench environment. Select segmentation or unidirectional transfer through site engineering review [E1].

Size offline storage from agreed data rate and outage duration, with headroom. Specify timestamp source, freshness, restart recovery, deduplication and disk-full behaviour. Stale/missing data becomes “Unknown”, never healthy. Cloud loss must not stop local advice or affect control. **These are field design requirements; the current local replay demo is not a proven incremental edge implementation.**

Marine cyber applicability requires vessel/class/flag review. IACS E26/E27 scope depends on construction-contract date and vessel scope; do not apply the newbuild rule indiscriminately to legacy retrofits. ClassNK's existing-ship answer is useful context, not a universal exemption. IMO cyber-risk management remains a separate consideration [E2–E4]. No compliance badge belongs in this demo.

## Pilot and stop criteria

1. Agree one decision, baseline maintenance practice, asset criticality, actual redundancy and owner. Survey data quality/access before buying sensors.
2. Observe existing data in shadow mode across representative regimes. Four to eight weeks is a planning assumption from the organizer, not proof of adequate fault exposure. Extend for seasonal/regime gaps.
3. Trial one targeted measurement alongside a reference or handheld route. Record outages, mounting/service effort and uncertainty. Never induce damaging faults.
4. Review alerts against logs and work orders, including ambiguous/missed events. Track nuisance checks per asset-week, actionable incremental lead time and actual labour; report observation exposure and uncertainty.
5. Enable human advisory routing only after a named owner and response procedure exist. Stop or revise if access is unsafe, data quality is insufficient, workload exceeds the agreed budget, control/network impact appears, or incremental value is absent. Rare faults may require a much longer study; no observed faults is not proof of effectiveness.

## The Planner must be able to say “defer”

Illustrative healthy duty/standby case, **not a benchmark topology**: assume zero avoided production loss, 0.3 relevant events/year and a 0.5 incremental actionable fraction. With EUR 2,000 avoidable repair difference, benefit is EUR 300/year. Assume 24 extra nuisance checks/year at EUR 75 plus EUR 700 upkeep: net effect is **−EUR 2,200/year**, before EUR 4,500 installation. Five-year undiscounted incremental value is **−EUR 15,500**; no simple payback. All amounts and probabilities are editable assumptions, not quotes or measured outcomes. Common-cause loss, standby availability and changeover consequences remain site questions. Formula and fixtures: [cost model](COST_MODEL_SPEC.md).

Suggested demo card: **“Defer permanent retrofit under these assumptions. Retain existing signals and evaluate a periodic route. Revisit after verifying standby readiness, maintenance cost and the unresolved decision.”**
