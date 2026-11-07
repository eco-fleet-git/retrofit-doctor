# Coordinator visual review — iteration 02

7 November 2026. Both generated PNGs inspected by Codex. Job `aMG1cvcaThiSsddpqgEE` completed with exactly two screens, Standard, image generation disabled. Service reports **14 credits charged**. Private page: https://uxpilot.ai/a/ui-design?page=3Bi1LoEV7vH527CF5tkp . No publishing, paid export or additional design run was requested.

## Useful visual direction

The overview is now an equipment-review queue with a selected pump, evidence preview and coverage matrix. The PUMP-04 workspace separates the evidence from the next recommended action. Light surfaces, restrained colours and a persistent navigation bar give the design a consistent engineering-tool structure. These are useful references, not user acceptance or evidence of implemented functionality.

## Corrections required before app implementation or video use

1. **Overview availability:** `Assessable` is unsupported for metadata-only assets, particularly blind-test pumps 10–12. Coverage is not diagnostic availability. Replace this column with source-backed availability categories. Do not infer current fleet health from these historical cases.
2. **Pressure chart:** the legend says `Ps/Pd`, while the blue trace represents `Pd − Ps`. Add kPa and the full historical interval. The overview preview needs a quantity, units, date and a clear relationship to the selected warning.
3. **Spread bars:** these represent residual spread, not simply pressure-rise fluctuation. Display 7.3 and 3.5 kPa explicitly, with an honest reference description. Reference does not mean verified healthy.
4. **Invented details:** remove Engineer Alpha, the avatar and the claimed inline electromagnetic sensor identifier `P04-Q`. A suggested independent instrument must be labelled as a proposal, not installed equipment. Independent measurement can help investigate the hypothesis; it does not guarantee confirmation of a specific fault.
5. **Controls:** recording a manual measurement, uploading findings and preparing a note are proposed workflow controls in this static design. They must not imply a working storage backend. Keep actual demo actions grounded in implemented behaviour.
6. **Sensor diagram:** useful pump/motor separation, but most installed channels are absent and the diagram falls below the first viewport. Use a compact schematic with accurate inventory, or an explicit subset label and accessible full inventory.
7. **Clarity:** replace unexplained data icons with short labels or accessible tooltips. Explain that the summary counts overlap. EN/RU visible controls alone are not evidence of translated content.

The local Claude review reports that the main chart arrays match the 60 supplied measured and 60 calculated values. This does not validate every displayed statement; the visual defects above remain blockers for direct use.

Reject the service's unsolicited suggestion to add a numerical Sensor Reliability Score unless such a score is separately defined and validated. Do not turn a layout suggestion into an unsupported diagnostic claim.

Verdict: **useful layout reference; not ready to copy unchanged into the app or presentation.** Keep the current app and frozen diagnostic bundles unchanged during this prototype review.
