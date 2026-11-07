# Task023 coordinator review — close the engineering check loop

2026-11-07. User authorized recommended items1,3,4: persistence/recurrence, actionable measurement card, and recording a follow-up result to revise the engineering explanation. Claude Code implemented; Codex scoped, reviewed, browser-tested and released. No new video/hardware/network implementation. User acceptance remains pending.

## Delivered

- Closed-minute persistence: three consecutive same-direction comparable minutes is the explicit prototype sustained criterion. Q/n use a fixed selected-minute anchor; gaps, transient/invalid minutes, return within band, direction and regime changes break the run. Duration and prior comparable episodes are bounded to a240-minute lookback; a left-truncated run is labelled at least.
- Practical check card: existing curve/drive information first; what/where/when to measure temporarily; the question it answers and how the result changes the next decision. Permanent instrumentation remains a conditional engineering decision, not an automatic prescription.
- Saved-system check form: independent Q and/or ΔP, instrument/method, measured time, declared tolerance, origin and same-regime acknowledgement. Illustrative filling is explicit and does not save automatically.
- Append-only bounded history (20/system), with actual entry time and measurement time. The latest whole applicable check is used; earlier records remain history and their channels are never merged.
- Separate retrospective explanation: agreeing measurements support the recorded observation, not a unique cause; disagreeing measurements lead to verification of instruments/mapping. One agreeing measurement does not validate the other. Without a curve verdict, agreeing readings cannot establish hydraulic conformity.

Original telemetry, reference and as-of assessment are unchanged by check entry. Checks measured after the selected cutoff are deferred. Checks apply only to their exact minute and source/reference/equipment/mapping/assumption fingerprint. Configuration changes retain history but prevent its application until the identical configuration is restored.

## Corrections made in review

Withheld follow-up comparison for unsupported, incomplete, stopped and changing regimes, including early ΔP/head-only paths. Required temporal coverage rather than just three adjacent readings. Removed per-channel merging across separate checks and origins. Prevented agreeing readings with no reference from being labelled no hydraulic mismatch. Included equipment identity in configuration matching. Shortened duration and action text, moved detailed regime rules into a disclosure, and softened agreement language from proof to support.

## Verification

Independent full run: **148 passed,0 failed,0 skipped**, `node --test --test-timeout=30000 tests/*.mjs`. Existing137 tests retained plus11 new check-loop tests. `git diff --check` clean. The frozen bundles remain byte-identical; no vendor/test telemetry or labels read and no benchmark predictions or performance claims changed.

The coordinator oracle was written in `023-review-oracle.md`. Independent model check on lowHead: at10:09 one minute,10:10 two,10:11 three/sustained,10:20 twelve since10:08. Adding a follow-up leaves `assessAt` output identical.

Browser QA on saved SYS-003 (authored synthetic CSV), desktop1161 and mobile390:

1. Saw sustained12min since10:08 atcutoff10:20; at10:09 saw isolated1min. Later check was explicitly deferred at the earlier cutoff.
2. Empty form rejected missing values/instrument/regime acknowledgement.
3. Saved illustrative CHK-001:Q149.9m³/h,ΔP284.8kPa at10:19:30,threshold5%. Both agreed with recorded medians and the explanation left cause unresolved. Reload retained it.
4. Saved illustrative CHK-002:Q170m³/h,ΔP284.8kPa at10:19:40. Q differed by+13.4%,ΔP agreed; recommendation became verification of flow measurement/mapping, without asserting a broken sensor. Both records remain in history; only the latest whole check is used.
5. Changed comparison band10→12: both checks became previous-configuration/not-applied. Restored10: the original fingerprint matched and the latest check was applicable again. No record was erased.
6. EN/RU display and mobile form verified. DraftQ145 survived language change; the unsaved draft was cancelled. Final mobile document width/scroll width both390; no overlapping fields or vertical number columns. No browser console errors observed. Temporary viewport reset.

Screenshots in `review/task023/`: `workflow-ru.jpg`, `followup-ru.jpg`, `followup-en.jpg`, `check-form-mobile-ru.jpg`, `followup-mobile-ru.jpg`. The two checks are explicitly illustrative browser-local QA records, not actual field measurements.

## Limits

This does not implement measurement uncertainty propagation, calibrated fault confidence, independent accuracy validation, actual sensor/gateway integration or hardware certification. Episode thresholds and agreement tolerance are prototype assumptions. A check applies to one minute only; cross-episode generalization is not implemented. Fingerprints detect ordinary content/configuration changes and are not a security or tamper-proof audit mechanism. There is no check deletion/export, authenticated technician identity, multi-user synchronization or server database. Records are local to this browser and subject to storage quota (handled without false success). The detector's original output is not retrained or recalibrated by annotations. Video remains paused until interface approval.
