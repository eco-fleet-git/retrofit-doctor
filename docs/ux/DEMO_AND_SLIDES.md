# Three-minute demo and six-slide outline

All narration and slide copy below is English. This is a content and rehearsal plan. No app or deck has been created by this handoff.

## Three-minute demo

### Setup before the timer

- Load local verified metadata and causal validation artifacts. Test assets remain metadata-only. Validate the flow against A01–A25 in `STATES_AND_ACCEPTANCE.md`.
- Fleet includes all 12 assets. Select PUMP-08, paused at **2025-09-10 12:38 UTC**. Ground-truth overlay off. No future chart data. Other unloaded assets explicitly say Replay not loaded.
- Have the Evidence page ready with the nine-event table, original/causal comparison and recorded checks. This is a full-window retrospective mode, not the pump replay.
- Start with an empty PUMP-08 planner draft. Choose “Assess flow measurement feasibility” during the demo. No real measurement, hardware control or generated test diagnosis is needed.
- Use 1440×900 or verify the supplied 1280×720 layout. Place actions within the first viewport. Avoid live typing long answers. One click should add the proposed assessment to the draft.

### Timed script: 180 seconds total

| Time | Operator action and visible evidence | Exact suggested narration |
|---|---|---|
| 0:00–0:20 | Fleet: show 12 rows or inventory count, split badges and independent snapshot note | “Retrofit Doctor helps an engineer inspect a pump alert and prepare a retrofit review. This demonstration uses synthetic benchmark data. These twelve pumps are independent. Two have labeled validation replay. Three remain blind test assets, shown here only through their public equipment metadata.” |
| 0:20–1:00 | Open PUMP-08. Show causal alert at 12:38, source evidence and UTC clock. Briefly step back one minute, then forward | “This is PUMP-08 at a specific replay time. The baseline predicts suction strainer clogging from a suction-pressure deviation. Here is its original evidence and suggested inspection. Stepping back removes the alert because it had not yet been issued. Every plotted window must have finished by the selected time. The statistical reference uses the first twenty-four hours and may include existing degradation.” |
| 1:00–1:30 | Open Evidence, selected PUMP-08-E02 then E04, with retrospective banner visible | “Detection and diagnosis are separate. In the retrospective evaluation, bearing wear matches an alert with an unknown cause. Pressure-sensor noise has no matched alert. These failures remain visible. The evaluation labels are separate from the algorithm output and never become inputs to the replay or a diagnosis for a blind test pump.” |
| 1:30–2:15 | Return to PUMP-08, open Planner. Show missing flow channel, expand review fields, Add to draft, Save draft | “The planner starts with what is actually instrumented. This pump has no flow channel. Assessing flow measurement is an engineering hypothesis: it may add useful context for hydraulic behavior, but no diagnostic improvement has been demonstrated. The draft asks about a suitable measurement location, signal integration, maintenance access and the applicable engineering approval process. Method, cost and downtime remain unassessed. Saving records a draft in this browser. It does not install a sensor or approve the design.” |
| 2:15–2:50 | Evidence comparison: 76.01 vs 78.01, 8/9 vs 4/9, 209 and 18 check records | “The current causal baseline scores 76.01. The historical original scores 78.01, but its early results used future reference information. Both detect eight of nine events and correctly identify four fault types out of nine. The score decrease reflects a later matched alert, not a change in diagnostic rules. The recorded run passed 209 causality checks and 18 regression tests. These are software checks on synthetic data.” |
| 2:50–3:00 | End on planner draft summary with hypothesis banner, or stay on evidence if navigation would overrun | “The deliverable is an auditable diagnosis review and a concrete retrofit assessment. Physical feasibility and diagnostic benefit remain to be validated.” |

The narrative deliberately includes a useful alert, a missed event and an unresolved diagnosis. Do not replace the failure examples with invented correct diagnoses. The final sentence is a proposed product outcome; the existing baseline is still batch/replay software.

### Evidence-only fallback

If feature traces are not integrated, keep the same sequence and show the exact source alert plus “Signal data unavailable”. At 0:20 say: “This view currently shows the recorded alert and its source evidence. The measurement trace is not connected in this build.” Replace the chart/time-window demonstration with the alert issuance boundary at 12:37 and 12:38. Do not show a fabricated line.

If the app cannot run, present the six slides below, explicitly saying “This is the proposed interface and the recorded benchmark evidence.” Do not describe a clickable design as a working application. Use screenshots only from an actual inspected build or clearly label them “Design proposal”. Never conceal an unavailable source with a successful-looking frozen loading state.

## Six-slide structure

Exactly six slides including the opening slide. This is a separate short pitch outline, not six extra sections to add to the 180-second live walkthrough. Use one main visual or evidence table per slide, restrained engineering typography and short text. Keep claim qualifiers on the slide, not only in speaker notes. Proposed interface images must say “Design proposal” until they show an implemented, verified UI.

### 1. Retrofit Doctor

**On-slide copy**

> Pump diagnostics and retrofit review
>
> Synthetic benchmark demonstration
>
> Since AI 2026

**Visual:** a single inspected screenshot of Pump Detail when available, or a labeled design proposal. Avoid a photo of fabricated hardware.

**Claim status:** proposed product purpose. The dataset is synthetic, and no physical prototype is included.

**Speaker note:** “We are building an engineering workflow that connects an alert to its evidence and a reviewable retrofit proposal.” The workflow is a product hypothesis until implemented and evaluated.

**Source note:** repository `README.md`; this UX specification for proposed workflow.

### 2. Twelve independent pump assets

**On-slide copy**

> 7 training assets
>
> 2 labeled validation assets
>
> 3 blind test assets
>
> Different sensor coverage and observation weeks

**Visual:** a simple native table listing the three splits and pump IDs. Add a small caption: “Site grouping does not imply hydraulic coupling.” Do not connect twelve pumps into a network.

**Claim status:** dataset facts. For the demo, test pumps show metadata only.

**Speaker note:** “Public equipment metadata supports coverage planning. Test labels do not support any diagnosis shown here.” Do not imply the validation weeks happen simultaneously.

**Source note:** `vendor/benchmark/data/full/assets.csv`; `diagrams/README.md`.

### 3. Diagnostic evidence and limits

**On-slide copy**

| Validation example | Causal baseline output | Retrospective result |
|---|---|---|
| PUMP-08-E01 | Suction strainer clogging | Correct fault type |
| PUMP-08-E02 | Unknown | Event matched, cause unresolved |
| PUMP-08-E04 | No matched alert | Pressure-sensor noise missed |

> Detection does not establish the correct cause

**Visual:** this editable table is the main visual. If showing the PUMP-08 alert screenshot instead, retain all three outcomes as readable text, with source and mode labels.

**Claim status:** facts from retrospective validation. E01's first causal alert is 2025-09-10 12:38 UTC with `suction_pressure_kpa z=-6.7`. Do not claim the sensor directly measured pressure loss across the strainer.

**Speaker note:** “The raw alert and retrospective evaluation stay separate. We retain the baseline's wrong and unknown diagnoses.”

**Source note:** `results/causal_b1/report_causal_validation.json`; `results/causal_b1/predictions_causal_validation.csv`.

### 4. Causal baseline validation

**On-slide copy**

| Metric | Causal B1 | Original B1 |
|---|---:|---:|
| Composite score | 76.01 | 78.01 |
| Events detected | 8/9 | 8/9 |
| Correct fault type | 4/9 | 4/9 |
| False alert episodes | 1 | 1 |

> Original: historical offline result with early future-data use
>
> Causal: 209 causality checks and 18 regression tests passed in the recorded run
>
> Synthetic validation, 9 scored events. No field validation

**Visual:** native editable comparison table. No improvement arrow or accuracy gauge. Exact scores belong in speaker notes or visible detail: 76.01253946 and 78.01253946.

**Claim status:** measured benchmark results and stored software-check results, not physical testing or proof of causality for every possible input.

**Speaker note:** “The two-point decrease follows the later first match for PUMP-09-E04. That event still has an incorrect fault type and evidence pointing to vibration rather than the drifting current sensor. The diagnostic rules did not improve.” Original first alert: 2026-02-09 12:46 UTC. Causal first alert: 2026-02-11 06:28 UTC, 41 h 42 min later. Lead time is omitted from the slide because its reported median covers only two events with specified deadlines.

**Source note:** `CAUSAL_B1_FINDINGS.md`; `results/causal_b1/comparison.csv`; `results/causal_b1/verification.json`.

### 5. Retrofit assessment for PUMP-08

**On-slide copy**

> Fact: the public passport has no flow channel
>
> Hypothesis: flow context may help assess hydraulic behavior
>
> Proposed review: measurement location, integration, maintenance and applicable approvals
>
> Method, installation feasibility, cost and diagnostic benefit: not assessed

**Visual:** an inspected planner screenshot or the existing conceptual pump diagram with proposed flow instrumentation clearly marked “Proposed · Location to assess”. Do not modify an image to imply a validated physical installation. A textual review worksheet is sufficient.

**Claim status:** sensor absence is factual; candidate value and location are hypotheses. Installation method remains unselected. Do not promise an improvement in score, savings or fewer false alarms.

**Speaker note:** “The planner makes the missing engineering information explicit. A saved draft is ready to discuss, not a deployment approval. Sensor coverage alone does not establish diagnostic performance.”

**Source note:** `vendor/benchmark/data/full/assets.csv`, PUMP-08; `diagrams/README.md`; proposed planner workflow in this package.

### 6. Pilot pathway

**On-slide copy**

> Shadow mode using existing data
>
> Review whether warnings support useful engineering action
>
> Select the minimum additional measurement needed
>
> Verify installation, integration, maintenance and applicable approvals
>
> Decide on deployment using cost and nuisance-alert burden
>
> Proposed pilot pathway · Benefits and feasibility remain unvalidated

**Visual:** a five-step native sequence or plain numbered list, with each step marked as proposed. Keep the hypothesis caption visible. No development deadlines or internal iteration status appear on this jury-facing slide.

**Claim status:** a proposed adoption pathway, not an executed pilot, demonstrated benefit or commitment by a customer. No savings, warning-usefulness rate, cost estimate or acceptable nuisance threshold has been established.

**Speaker note:** “The proposed pilot starts in shadow mode using existing data. Engineers review whether warnings support useful actions and record false or repetitive alerts. That review identifies the smallest additional measurement worth assessing, including the option to add none. An engineering review then checks installation, integration, maintenance and applicable approvals. Deployment depends on the evidence, total cost and nuisance-alert burden. This is our proposed validation pathway, not a reported pilot result.”

**Source note:** coordinating brief for the proposed pilot pathway; `README.md` / `CAUSAL_B1_FINDINGS.md` for current evidence limitations. Internal delivery dates and the blind-export coordination gate are recorded separately in [Internal coordination](INTERNAL_COORDINATION.md).

## Claim review before presenting

- Exact values and denominators match current causal artifacts. The older B1 report is historical.
- No confidence field is described as a calibrated probability, and no composite score is called accuracy.
- Every screenshot reflects the build being demonstrated or says Design proposal.
- “Passed” applies only to recorded software checks unless a new run is actually performed and recorded.
- Every proposed sensor remains visually separate from the public installed inventory.
- The audience can distinguish synthetic replay, retrospective labels and unvalidated retrofit hypotheses without relying on speaker notes.
