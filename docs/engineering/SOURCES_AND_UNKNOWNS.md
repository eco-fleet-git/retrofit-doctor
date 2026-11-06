# Engineering sources, assumptions and unknowns

Reviewed 6 November 2026, Europe/Berlin. This is a proposal evidence register, not a compliance assessment or product recommendation. External sources below were accessed on that date. Only official primary sources support the current regulatory/manufacturer statements. No current price, stock, accuracy or certification claim was independently verified.

## Local source register

| ID | Source / date | Supported use and boundary |
|---|---|---|
| L1 | [PROJECT_PLAN](../PROJECT_PLAN.md), approved 6 November 2026; [AGENTS](../../AGENTS.md) | English demo, read-only/advisory scope, noon deadline, synthetic evidence boundaries and code ownership |
| L2 | [Organizer feasibility](../../vendor/benchmark/RETROFIT_FEASIBILITY.md), price observation date 30 October 2026 | Dated examples, exclusions, pilot outline and negative business scenario. Package totals and many prices are assumptions; not re-quoted or endorsed |
| L3 | [Diagrams README](../../diagrams/README.md); [TECHNICAL_MODEL §12](../../vendor/benchmark/TECHNICAL_MODEL.md) | Independent pump loops; no explicit heat-exchanger thermal dynamics or parallel duty/standby model; channel placement and pressure-tap boundaries. Used documentation only, not fault implementation or event analysis |
| L4 | [LICENSE_AND_PROVENANCE](../../vendor/benchmark/LICENSE_AND_PROVENANCE.md); [build provenance](../../vendor/benchmark/data/full/provenance.md), build 30 October 2026 | Entire benchmark synthetic, not measured installation evidence. Generator 1.0.0, public seed 20261106; source dates reported by organizer, not a reproduction claim |
| L5 | [UX acceptance](../ux/STATES_AND_ACCEPTANCE.md) and [Claude UI task](../ux/CLAUDE_UI_TASK.md) | Existing Planner states, local save semantics, missing-data rules and unchanged installed coverage |

Attribution: **RETROFIT AI 2026 synthetic pump benchmark, Since AI Hackathon 2026**. Organizer references include secondary/vendor sources; their presence does not establish that every cited claim was independently verified in this brief. In particular, organizer energy-saving drive case studies are not evidence for monitoring-only savings.

## External checks of material claims

| ID | Primary source; publication/version | What was confirmed / permitted use |
|---|---|---|
| E1 | [NIST SP 800-82 Rev. 3 landing page](https://csrc.nist.gov/pubs/sp/800/82/r3/final), September 2023, and [official PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-82r3.pdf), §5.2.3.1 and Appendix E.1.2 | Guidance distinguishes boundary controls and unidirectional gateways; supports architecture review. It does not certify this design or mandate one universal topology. The landing page now points to a Revision 4 initial public draft; do not describe that draft as the adopted final basis |
| E2 | [IACS E26/E27 press release](https://iacs.org.uk/news/iacs-ur-e26-and-e27-press-release), historical revision announcement; page has no visible publication date | Revised application date is new ships contracted for construction on/after 1 July 2024; scope varies with vessel type/size. Original 1 January 2024 date withdrawn. This historical announcement is not a complete current vessel-specific rule review |
| E3 | [ClassNK E26/E27 FAQ](https://www.classnk.com/hp/en/activities/cybersecurity/ur-e26e27/faq.html), Q74 updated 3 April 2025; Q106 updated 10 June 2025 | Q74 says E26/E27 compliance is not required for the described replacement/new OT installation on a pre-July-2024 construction-contract ship. Q106 notes society-specific additions/interpretations. Use as ClassNK context only; do not assert exemption from all other rules or reviews |
| E4 | [IMO Maritime cyber risk](https://www.imo.org/en/ourwork/security/pages/cyber-security.aspx), MSC.428(98), adopted June 2017; current page undated | Resolution addresses cyber risk in existing safety management systems and the post-1-January-2021 verification milestone. This is separate from a sensor's type approval. The page lists updated guidance; this brief makes no detailed assessment against it |
| E5 | [ifm VVB3 installation guidelines](https://www.ifm.com/us/en/us/learn-more/vibration/vvb3/vvb3-io-link-vibration-sensor-installation-guidelines), manufacturer page undated; [VVB applications](https://www.ifm.com/us/en/us/learn-more/vibration/vvb0/io-link-vibration-applications), undated | Manufacturer examples place points near relevant bearings and consider mounting/access and different measurement directions. Used only to support the need for a mounting/coverage review, not to select VVB001, assert universal point counts, or transfer product limits between models |

The specific VVB001 product page was opened but exposed insufficient technical detail in the retrieved view. No new VVB001 specification, approval or price is claimed. No distributor snippets or secondary search results establish the proposal's technical requirements.

## Fact / assumption / unknown register

| Class | Item | Consequence / owner of next evidence |
|---|---|---|
| Fact from project documentation | Synthetic benchmark; test metadata only during development; pumps independent | All demo labels and proposed topology must preserve these limits; implementation owner |
| Fact from documented channel definitions | Pump suction/discharge pressures are not component differential pressures; pump fluid-temperature location is not an approved mounting point | Survey component boundaries and actual tapping locations; site engineer |
| Fact about this handoff | No hardware, field pilot, device integration or economic outcome was tested; no telemetry or fault labels analysed | Engineering documents cannot serve as implementation or performance evidence |
| Proposed design choice | Local advisory path, no machine commands, existing trips remain authoritative | Requires future architecture and bench/site verification; controls/OT owner |
| Assumption | Targeted sensors may resolve a useful blind spot | Needs specific experiment evidence and then field comparison; experiment lead and maintainer |
| Assumption | 4–8-week shadow phase; five-year economic horizon; zero discount in demo | Planning conveniences, not established exposure sufficiency or financial policy; pilot owner |
| Assumption | Negative fixture's event rate, incremental actionable fraction, costs, nuisance count and zero production loss | Editable illustration only; reliability/operations owner supplies site evidence |
| Unknown | Actual duty/standby topology, changeover success, common-cause exposure and consequences | Assess drawings, tests and maintenance history; do not infer from co-location or benchmark tier |
| Unknown | Mounting/access, pressure/material suitability, cable routes, pipe geometry, radio coverage, power and service windows | Site survey and supplier installation assessment before purchase |
| Unknown | Existing interface availability, licences, register quality, timestamps, network budget and enforced permissions | Historian/controls/OT review; export-first approach may avoid a new plant connection |
| Unknown | Incremental decision value, useful lead time and sustainable nuisance workload | Shadow comparison against current practice with actual operator effort; no automatic benchmark-to-field transfer |
| Unknown | Quotes, labour rates, warranty, supply continuity, battery life, calibration intervals, support subscriptions and removal costs | Supplier quote plus lifecycle plan, dated and scoped |
| Unknown | Applicable site/flag/class requirements and any review/testing cost | Responsible engineer and relevant authority/society review; no compliance claim |

## Negative scenarios to retain in the product story

- An available, tested standby absorbs the pump stop: production-loss benefit may be very small; retain only defensible repair/labour differences.
- A shared strainer, power supply or control dependency defeats assumed redundancy: revise the site scenario; monitoring still does not remove the common cause.
- A sensor cannot be mounted or serviced without expensive access or isolation: a cheap unit price does not imply cheap installation.
- A five-minute report misses a short event, or a loose mount creates a false trend: faster transport alone does not fix measurement quality.
- Existing telemetry is stale, time-shifted or insufficiently resolved: more analytics cannot establish the missing evidence.
- Flow is proposed where installation geometry/reference verification is unresolved: no efficiency number or savings claim is justified.
- Additional notifications exceed the maintenance team's review capacity: pause advisory routing or reduce scope; measured nuisance effort belongs in cost.
- No named owner can act, or a subscription/gateway becomes unsupported: postpone permanent rollout and account for service/migration cost.

All these are plausible engineering scenarios, not observed faults in the supplied pumps. The engineering author did not read test telemetry, inspect event labels, analyse faults, change code or modify Git.

## Handoff verification

On 6 November 2026, all relative Markdown links in the four engineering documents resolved locally. Independent Python 3 arithmetic checks passed for initial/annual totals, the negative case, zero nuisance, zero actionable fraction and the event-rate break-even fixture. These checks verify the specification's arithmetic, not Claude's application implementation. No application tests or field tests were run in this documentation task.

Changed files are limited to this directory: DECISION_BRIEF.md, COST_MODEL_SPEC.md, PLANNER_ACCEPTANCE.md and SOURCES_AND_UNKNOWNS.md. Next action: Claude implements the scoped Planner core and records ENG-01–18 results; the coordinating reviewer checks the rendered negative scenario and source/assumption labels. No additional agent or chat was created.
