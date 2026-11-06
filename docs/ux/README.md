# Retrofit Doctor UX handoff

Prepared 6 November 2026. Scope: design specifications and visual follow-up to the functional UI already being implemented by Claude Code under Task001. Codex: planning and verification. Product UI, demo narration and slide copy: English. Team discussion: Russian. This package does not start a second implementation.

## Deliverables

1. [UX Pilot prompts](UX_PILOT_PROMPTS.md): master prompt and four screen prompts.
2. [States and acceptance](STATES_AND_ACCEPTANCE.md): data boundaries, state rules, exact copy and executable review scenarios.
3. [Demo and six slides](DEMO_AND_SLIDES.md): a 180-second walkthrough, fallback and a six-slide content specification.
4. [Claude visual follow-up](CLAUDE_UI_TASK.md): targeted improvements to Task001 and review evidence.
5. [Internal coordination](INTERNAL_COORDINATION.md): internal delivery schedule, ownership and the freeze/main gate for final blind export. Excluded from the jury pitch.

Delivery dates and iteration planning live in the internal coordination note. The sixth pitch slide describes the proposed pilot pathway and its decision criteria, without internal development status or unverified outcomes.

## Product contract

Retrofit Doctor is an engineering dashboard for inspecting synthetic pump diagnostics and preparing an engineering review of a possible retrofit. It has four destinations: **Fleet Overview**, **Pump Detail**, **Retrofit Planner**, **Evidence & Validation**. It does not operate equipment. No physical device or installed retrofit is demonstrated.

- Twelve independent pumps, not six pairs and not a hydraulic network. Site grouping is organizational only.
- PUMP-01–07: training assets. PUMP-08–09: labeled validation replay. PUMP-10–12: blind test assets, metadata-only in this demo release. Do not load their telemetry into the demo UI, infer faults from hidden labels, or assign health from metadata. The final one-shot blind export is already within project authorization, gated by freeze and coordination with main rather than a separate user approval.
- The default diagnostic source is the causal B1 output. Historical original B1 appears only in the comparison view, visibly marked as using future reference information for early results.
- Every replay has an explicit per-asset `as_of`. Use completed minute windows only. A point for 12:00–12:01 becomes available at 12:01. Labels never feed the diagnosis, charts, sorting or planner.
- Statistical reference collection lasts the first 24 calendar hours. The reference is empirical and may include existing degradation. Preserve `COLLECTING_REFERENCE`, `REFERENCE_AVAILABLE` and `INSUFFICIENT_REFERENCE`. The first post-reference minute closes at 24:01. Gap and flatline checks remain possible during collection.
- Sensor availability, data freshness, reference readiness and diagnostic output are distinct. Missing instrumentation, absent packets and no detected alert are different states. Do not collapse these into a single health percentage.
- Retrofit suggestions are **engineering hypotheses**. Show proposed installation, integration, maintenance and certification-review questions. No cost savings, diagnostic uplift, installation duration or compliance approval has been measured.

## Facts locked for this handoff

| Claim | Value and required context | Source |
|---|---|---|
| Causal validation composite score | 76.01253946, displayed as 76.01 with exact detail | `results/causal_b1/comparison.csv` |
| Original validation composite score | 78.01253946, historical offline result with early future-data use | Same |
| Detected events | Both 8/9, scorer event matching | Same |
| Correct fault type | Both 4/9, denominator is all nine scored events | Same |
| False alert episodes | Both 1, not the number of raw alert rows | Same |
| Alert rows | Causal 15, original 16 | Same |
| Causality audit | 209 checks passed, tolerance 1e-6, scoped to inspected tests | `CAUSAL_B1_FINDINGS.md`, `results/causal_b1/verification.json` |
| Regression tests | 18 passed, targeted software tests | Same |
| Lead time | 8.28986111 h median to a specified deadline, only two detected validation events | `B1_FINDINGS.md`, causal comparison |
| Runtime | Batch/replay implementation, no incremental edge service | `README.md`, `CAUSAL_B1_FINDINGS.md` |

Never present the composite score as accuracy or a probability. Detection is not a verified diagnosis. A `confidence` field is the baseline's heuristic score, not a calibrated fault probability. Do not headline lead time without its two-event denominator.

## Source priority and boundaries

Read `README.md`, `B1_FINDINGS.md`, `CAUSAL_B1_FINDINGS.md`, `diagrams/README.md` first. Use current causal result files for current metrics and alert content. `B1_FINDINGS.md` is a historical report: its statement that causal results are not yet available was superseded by `CAUSAL_B1_FINDINGS.md`.

Use `vendor/benchmark/data/full/assets.csv` for asset metadata and `channels_available` as the authoritative channel list. `diagrams/sensor-inventory.csv` is a convenient cadence summary and does not enumerate every vibration feature. Use `diagrams/README.md` and the existing diagrams for physical placement limitations. The public passports for test pumps are allowed. Hidden labels and test telemetry are not part of this UI release.

`STATES_AND_ACCEPTANCE.md` is the UX behavioral contract. Reconcile it against Task001's current build through main and reuse the existing implementation. UX Pilot outputs are design proposals and must be reviewed against the contract. `CLAUDE_UI_TASK.md` is a visual follow-up handoff, not evidence that its refinements have been implemented. Stored benchmark tests were inspected as artifacts; this documentation task did not rerun them or validate an app.

Presentation guidance was consulted for concise titles, exact claim scope and visible hypotheses. The requested deliverable is a local Markdown outline; no slide deck, external design file, publication or purchase was created.

## Documentation verification

The original five-document package was checked for valid local Markdown links and balanced fenced blocks. Verified the stated validation scores, event/type counts, alert counts and false episodes against `comparison.csv`; verified test-pump channel counts against public passports; verified the recorded 209/18 check counts against `verification.json`. Confirmed 30 acceptance scenarios, exactly six slides including the opening slide, and six contiguous demo segments totaling 180 seconds. The follow-up adds the internal coordination note and revises the pitch/Task001 scope without changing benchmark claims. These checks validate the handoff's internal consistency and source anchors, not an implemented UI.
