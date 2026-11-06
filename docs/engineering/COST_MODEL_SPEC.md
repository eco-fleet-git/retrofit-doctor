# Editable lifecycle cost model: implementation specification

6 November 2026 · requirements for Claude, not application code · version 1

Purpose: compare **existing-only**, **minimal retrofit** and **instrument-grade assessment** for the same asset, decision and horizon. Show uncertainty and unattractive cases. Default to cost and evidence completeness; monetary benefit is optional and empty until explicitly supplied. Never import synthetic benchmark recall, score or alert rate into field economics automatically.

## Input contract

Every input has an ID, label, value, unit, basis, source/reference, source date, entry date and note. Bases: `site estimate`, `supplier quote`, `organizer dated example`, `illustrative assumption`, `field observation`, or `unknown`. A quote also needs scope, validity and tax basis. A user-entered “field observation” label is a draft assertion, not verification. Preserve original sources when edited; record the new value as a user assumption unless evidence is supplied.

Use one explicit comparison currency and a consistent tax basis. Do not silently convert organizer NOK or VAT-inclusive amounts. A conversion requires editable exchange rate, rate date and source; otherwise mark the total incomplete. EUR is suitable for the illustrative preset, not an inferred user location. Display whole EUR in summaries; calculate without intermediate rounding.

`null` means unknown; `0` means explicitly zero. “Included elsewhere” requires the referenced line ID. “Not applicable” requires a rationale. Never use zero as a substitute for a missing quote or unknown event rate. Bounds are editable scenario assumptions, not confidence intervals.

| Group | Required fields and units |
|---|---|
| Comparison | Asset, decision, baseline practice, option, currency/tax basis, start date, integer horizon H (years), discount rate d (fraction/year), constant-real or nominal-money convention |
| One-time cost lines | Quantity, unit cost, extended cost; allocation basis for shared items; categories below |
| Annual cost lines | Year or recurring schedule, quantity, unit cost; include maintenance, support and actual inspection burden |
| Scheduled events | Year, cost, purpose: battery/sensor/gateway replacement, calibration visit, migration, removal; zero terminal residual value unless justified |
| Operating exposure | Relevant events/year λ; operating days/year only if deriving an annual alert count; actual duty/standby assumption and evidence |
| Incremental benefit | u = additional actionable fraction relative to the stated baseline (0–1); hours actually avoided per actionable event h; effective production-loss rate c (currency/hour); avoidable repair difference r (currency/event) |
| Nuisance burden | Additional nuisance checks/year n; full cost/check a; count basis and deduplication assumption |
| Other incremental value | Optional evidenced annual labour saving L with scope; default unknown/disabled. Energy savings excluded from this monitoring model |

The fraction u represents events where the option adds timely information, a human can act and an avoidable consequence changes relative to existing practice. It is **not** detector recall. Do not multiply by another response/availability factor unless u is explicitly decomposed and double counting is prevented. A more complex reliability model is outside version 1.

## Cost lines that must be visible

One-time categories: sensors; mounts/fittings/isolators; gateway or IO master; power supply/enclosure/cables; site survey; installation labour; access/scaffolding/travel; shutdown or changeover loss; OT integration/licensing/tag mapping; security/site/class engineering review where applicable; commissioning/reference measurement; documentation/training; explicit contingency.

Recurring categories: software/support; inspection/cleaning; batteries and replacement access; calibration/reference verification; connectivity/storage; security maintenance; spares. Scheduled replacements and decommissioning are separate cash flows when known. A category may be unknown or explicitly not applicable; it must not disappear to make a package look cheap.

Existing-only has integration, review and support costs too. Sunk existing equipment cost is excluded from the forward comparison with a visible note. For shared gateways show both the project total and the allocated per-asset amount. Allocations across assets must sum to the project cost; do not divide by twelve unless twelve beneficiaries are explicitly entered. Sparse benchmark assets do not establish a common gateway or site.

Discounting applies to future costs and benefits on the same convention. Default demonstration uses constant-real money, d = 0, H = 5. These are labelled assumptions. Do not add inflation to only one side of the model. Do not add contingency twice or repeat bundled labour in component lines.

## Calculation contract

For option j, where C0,j is initial cost, Ot,j is routine annual cost, Nt,j is nuisance handling cost, and Rt,j is scheduled replacement/removal cost:

`LifecycleCost(j) = C0,j + Σ[t=1..H] (Ot,j + Nt,j + Rt,j) / (1+d)^t`

Use this to compare gross forward costs of all options. A benefit model is evaluated **incrementally against the selected existing-only baseline**:

`Benefit/year B = λ × u × (h × c + r) + L`

`ΔNuisance/year = n × a`

`IncrementalNet_t = B_t − (Ot,option − Ot,baseline) − ΔNuisance_t − (Rt,option − Rt,baseline)`

`IncrementalNPV = −(C0,option − C0,baseline) + Σ[t=1..H] IncrementalNet_t / (1+d)^t`

If full option and baseline nuisance totals are entered, derive their difference; if the direct incremental n is entered, use it instead. Never subtract both. Version 1 direct n is nonnegative; nuisance reductions require separately supported absolute option/baseline totals. Decommissioning is a cost; no speculative resale income. Costs are nonnegative in their individual lines, although option-minus-baseline differences may be negative.

For level annual cash flow with no extra scheduled costs, positive incremental initial cost and positive annual net effect:

`SimplePaybackYears = ΔC0 / IncrementalNet`

When annual net ≤ 0, display **“No simple payback under these assumptions”**. When costs vary by year, show cumulative cash flow and first recovery year, or omit simple payback; never apply the level-flow shortcut. When ΔC0 ≤ 0, display “No additional initial investment” and the cash-flow result rather than a negative payback. Recovery after H is labelled “Beyond selected horizon”. Unknown required inputs mean **“Benefit not estimated”** or **“Cost estimate incomplete”**, not zero NPV. A subtotal is labelled “Known cost subtotal” and lists exclusions.

Avoided hours h must reflect actual process consequence after redundancy/changeover; do not multiply every pump failure by whole-site outage cost. If failed changeover/common-cause risk is relevant, the site must estimate effective loss or a separate scenario. No invented standby failure probability. Repair difference r is incremental avoidable damage, not the whole repair invoice. Planned intervention cost must already be subtracted from r or separately charged, with no duplication.

A positive NPV supports further review only. It never produces “Approved”, “Certified”, “Guaranteed saving”, or an automatic purchase recommendation.

## Editable negative preset and numerical fixture

**Hypothetical redundant pump — assumed healthy standby and no production loss.** This preset is independent of every benchmark asset. All values below are illustrative assumptions, not current prices. Baseline incremental accounting is used: every amount below is an addition versus existing practice; baseline differential is zero.

| Initial incremental category | EUR |
|---|---:|
| Sensor/mount/cable/power/enclosure package | 1,200 |
| Allocated shared gateway | 300 |
| Installation labour | 1,200 |
| OT integration | 800 |
| Commissioning/reference checks | 400 |
| Site review/documentation/training | 300 |
| Access/travel/changeover allowance | 300 |
| **Initial total** | **4,500** |

For arithmetic only, assume no additional survey, contingency, shutdown loss or removal cost outside these totals; the UI must expose those assumptions. Do not treat this fixture as an installable BOM. Annual increment: support EUR 300 + service/battery allowance EUR 200 + annualised replacement allowance EUR 200 = EUR 700. Because replacement is annualised here, no additional scheduled replacement cash flow is added.

Inputs: H = 5, d = 0, λ = 0.3/year, u = 0.5, h = 0 hours, c = 0 EUR/hour, r = EUR 2,000, L = explicitly 0; n = 24/year, a = EUR 75/check.

Expected results:

- Annual incremental benefit = 0.3 × 0.5 × 2,000 = **EUR 300**.
- Annual nuisance cost = 24 × 75 = **EUR 1,800**.
- Annual net = 300 − 1,800 − 700 = **−EUR 2,200**.
- Five-year incremental lifecycle cost = 4,500 + 5 × (700 + 1,800) = **EUR 17,000**.
- Five-year gross incremental benefit = **EUR 1,500**; incremental NPV = **−EUR 15,500**.
- No simple payback. Even n = 0 leaves annual net **−EUR 400** and five-year NPV **−EUR 6,500**.

Diagnostic sensitivity, not a forecast: at fixed other inputs, five-year undiscounted break-even λ = (4,500/5 + 700 + 1,800) / (0.5 × 2,000) = **3.4 relevant events/year**. This high required value exposes the weakness of this assumed case. If u = 0 or (h × c + r) = 0, show “No finite event-rate break-even” rather than division by zero. The threshold is not an estimated event rate.

Use coherent pessimistic/base/optimistic scenarios entered by the reviewer; never assert independent low/high extremes are probabilistic bounds. Sensitivity may vary one input at a time, but label unchanged assumptions. Default chart/table: annual benefit, nuisance, upkeep, initial cost, five-year net; retain negative signs and visible exclusions.

## Historical organizer BOM

An optional collapsed reference may show organizer package A **about EUR 2.8–3.1k** and B **about EUR 2.1–2.4k**, explicitly “Organizer illustrative hardware only; source prices dated 30 October 2026; package totals are assumptions; not independently re-quoted.” Installation, enclosure/cabling, software and site/class work are excluded from those package totals [L2]. Do not relabel either package “our minimal installed cost”; the package contains multiple points and instruments and is not the targeted single-point pilot. Keep its mixed VAT/currency caveats visible. Leave live quote fields empty.
