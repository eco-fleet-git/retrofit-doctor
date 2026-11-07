# Task009 coordinator review — clearer diagnosis

7 November 2026. User chose diagnostic/evidence clarity as the first iteration priority. The UI now presents an unconfirmed rule hypothesis, its alert-minute observation, uncertainty and a proposed next check. Detailed source strings/rules/scores and all per-channel data remain in a disclosure. It is an explanation layer, not a new detector.

## Independent review

- Passed 26 focused explanation/replay tests after the visual correction. Tests cover alert-time/future-data separation, unavailable reference vs no measurement vs absent instrument, partial packets, source attribution, gap summaries and unresolved/data-quality outputs.
- Reviewed the 26/26 browser-check report (Claude-run fresh isolated Chrome contexts), and actual desktop/mobile images. P08 default card shrank from roughly 990/2049 px to 571/1233 px at 1440/390 px width, without smaller text. The hypothesis is ahead of inventory/history; expanded technical detail is intentionally longer.
- Independently opened the current app in IAB, read the technical disclosure and source evidence, selected the 10 September 12:38 alert at the next day's 02:00 replay clock, and observed its original 35.3067 kPa(g) value and 13 h 22 min age. Focus moved to dx-h and the explanation scrolled into view. Restored the original P08 checkpoint and left it open. A native date-input fill was unsupported by this automation backend, so that specific input interaction is not claimed verified; history selection was verified through the UI.
- Git diff confirms no changes to web/data, src, vendor or results. No detector selection or test-outcome interpretation was performed.

## Corrections during review

Round1 fixed partial-packet wording, missing-z causation, detector-attributed sensor interpretations, overly conclusive check reasons and out-of-view alert handling. Round2 shortened the default view, grouped measurement gaps, moved full caveats into details and added focus on history selection. The final missing-z headline fallback was corrected: it now reports the unavailable reference comparison and attributes the hypothesis to the detector. Absence of z cannot establish a deviation. Independently reran all 26 focused tests after this correction; all passed.

The handoff initially claimed P08 14 September 04:09 had no crest-factor sample. Independent bundle inspection found 6.93 ratio, z13.94 at that alert minute; the final handoff now corrects that specific claim. This check used validation data only.

## Limits

No human final acceptance, spoken rehearsal, screen-reader or 200% zoom audit. Partial-packet and no-z cases are fixture checks, not real fault validation. Existing Task006 browser script records the old layout and is superseded for diagnosis by Task009. The English pitch PDF retains the earlier reviewed UI screenshot; the Task009 screenshot is the current diagnosis UI. Test-export/access disclosures and model limits remain as in the release package.


## Decision

Accepted as the completed first clarity iteration. The code review and focused tests are complete; no further code change is requested. Preserve the explicitly listed prototype limitations and outstanding human review.
