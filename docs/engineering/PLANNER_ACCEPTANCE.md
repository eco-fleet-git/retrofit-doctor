# Retrofit Planner: implementation handoff and acceptance

6 November 2026 · documentation contract for Claude / coordinating Planner · not implementation evidence

Read [DECISION_BRIEF.md](DECISION_BRIEF.md), [COST_MODEL_SPEC.md](COST_MODEL_SPEC.md), [SOURCES_AND_UNKNOWNS.md](SOURCES_AND_UNKNOWNS.md) and [existing UX states](../ux/STATES_AND_ACCEPTANCE.md). Keep the existing local draft flow and readiness semantics. This work specifies the engineering content and cost calculator; it does not implement or validate them. Claude retains code ownership. No detector change, telemetry access, equipment connection or new deployment is required.

## First-version interaction

1. Show selected pump and **installed coverage from public metadata**. List missing channels as missing; unknown mounting/access remains unknown. Test assets stay metadata-only.
2. Present three choices: **Use existing signals**, **Assess minimal retrofit**, **Assess instrument-grade measurement**. Include **Defer permanent retrofit**. A selection creates a local hypothesis, never a new installed sensor or simulated measurement.
3. A candidate card states the decision, missing evidence, proposed measurement, mounting/access, interface and timestamp requirements, service burden, site/class questions and field validation. Distinguish a measurement's physical rationale from benchmark-tested improvement. No quantified uplift until an approved experiment artifact exists; even then it remains synthetic evidence.
4. Show editable lifecycle costs with complete/partial status, source dates and exclusions. Optional benefit assumptions stay empty initially. Offer the explicit **Illustrative redundant-pump case** preset, separate from the selected asset's topology.
5. Return a review conclusion: **Needs evidence**, **Defer under current assumptions**, or **Candidate for engineering review**. Keep these economic/engineering conclusions separate from UX draft completeness. “Ready for engineering review” means the draft questions are answered, not that the design or economics passed.
6. Save in this browser per pump with version, date and full source/assumption notes. Saving is not sending, approving, purchasing or deploying.

Suggested layout for the visual demo:

| Existing coverage | Proposed measurement | Decision and lifecycle |
|---|---|---|
| Public channels and cadence; missing channels explicit | One card per proposed point; all cards marked “Hypothesis” | Editable installed + annual cost, missing inputs and source basis |
| No physical topology inferred | Installation / interface / maintenance / site review / pilot | “Benefit not estimated” by default; illustrative negative case on request |
| Link to passport provenance | Clear “Will not resolve” paragraph | Local draft save and specific next evidence request |

Use the site's existing design language; do not add a new UI framework. A table and editable inputs suffice for noon. Scenario comparison chart, fleet-wide allocations and file export can follow the working core; do not claim they exist if deferred.

## P0 acceptance: engineering truth and numerical behaviour

| ID | Action | Required observable result |
|---|---|---|
| ENG-01 | Compare three choices for one pump | Decision, residual blind spots, installation/access, interface, upkeep and pilot requirements are visible; existing-only has integration cost fields |
| ENG-02 | Add then remove a sensor candidate | Installed channel inventory, charts, alert output and benchmark metrics remain unchanged; proposal is labelled hypothesis |
| ENG-03 | Select flow assessment for a pump without flow | No synthetic flow trace or efficiency gain appears; reference/pipe/site survey is required; no claim to locate an exchanger restriction from pump taps |
| ENG-04 | Inspect a vibration candidate | Location/direction, mounting, measurement bandwidth/window and update cadence are separate questions; no promise of unique fault identification or coverage of every bearing |
| ENG-05 | Inspect test pumps / topology | Public metadata only; no test telemetry, no duty/standby pairing inferred, no measured RPM invented for fixed-speed assets |
| ENG-06 | Leave any essential cost blank | “Cost estimate incomplete”, known subtotal and missing categories; blanks do not become zeros |
| ENG-07 | Leave λ or u unknown | “Benefit not estimated”; no payback, NPV or ROI badge; cost-only comparison still works |
| ENG-08 | Load redundant-pump preset | Values match all fixture results in COST_MODEL_SPEC; visible illustrative label and no claim that selected pump has standby |
| ENG-09 | Set fixture nuisance checks to zero | Annual net −EUR 400; five-year NPV −EUR 6,500; still no simple payback |
| ENG-10 | Set u = 0 | Benefit EUR 0, annual net −EUR 2,500, five-year NPV −EUR 17,000; finite-event break-even unavailable; no NaN/Infinity |
| ENG-11 | Enter invalid quantities/probabilities | Reject negative individual costs/counts/hours and u outside 0–1; H must be a positive integer; d must be nonnegative and finite. Empty input remains unknown. Show inline errors without discarding the draft |
| ENG-12 | Inspect price provenance | Organizer examples clearly dated 30 October 2026, hardware-only, not current quotes; mixed currency/tax fields cannot silently sum |
| ENG-13 | Inspect read-only and compliance copy | Proposed architecture is distinct from current replay. No “secure/certified/class-approved” conclusion from a protocol name, DMZ or completed checklist |
| ENG-14 | Save, reload and switch pumps | Separate local drafts preserve values, assumptions, dates and unresolved questions; failed storage shows an error and keeps edits in memory |
| ENG-15 | Set all review answers to “Not assessed” | Needs evidence; no Ready state. Nonempty drafted answers may permit Ready for engineering review, never Certified/Installed |
| ENG-16 | Disconnect internet after local dependencies/assets load | Core planner and local save remain usable; external source links need not load. No assertion that this proves field gateway resilience |
| ENG-17 | Inspect incremental accounting | Baseline is named; sunk assets excluded explicitly; no double counting of replacement, nuisance handling or bundled installation; direct incremental nuisance and full-option nuisance modes cannot both charge |
| ENG-18 | Use a positive hypothetical net or scheduled replacement | Only a review candidate appears. Level-flow payback logic is used only where valid; time-varying costs show cumulative flow or omit simple payback |

Keep existing UX keyboard, narrow-screen, errors and replay-isolation acceptance. Acceptance here adds no requirement to read or evaluate faults. The implementation evidence should record command/check, date, observed result and screenshot location; a build alone does not satisfy these rows.

## Field acceptance questions, not noon implementation claims

The future pilot owner must supply: site drawing and actual redundancy; installation method and work permit/isolation plan; electrical/wet-material/environment suitability; calibration/reference plan; register/tag mapping and quality flags; read-only enforcement and approved load test; storage/outage budget and restart/disk-full behaviour; ownership of alerts and nuisance budget; data retention/update/support policy; supplier lifecycle terms; and applicable site/class/flag review. Bench and site verification are future work.

Commercial expansion is gated on a representative observation record, a usable maintenance decision, acceptable incremental burden and a revised cost case. Benchmark score is not the gate. A deferred or rejected retrofit is a valid completed Planner outcome.

## 60-second engineering demonstration

Open an asset's Planner and point to the actual missing measurement. Select a candidate: read its decision and “will not resolve” text. Leave the quote blank to show incomplete cost. Load the independently labelled redundant-pump fixture: show −EUR 2,200 annual net, then remove nuisance cost and show it still loses EUR 400/year. Select “Defer permanent retrofit”; save the review draft locally. Finish on the specific unresolved site question, not a claimed saving.
