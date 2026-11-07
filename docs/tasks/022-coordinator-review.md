# Task022 coordinator review — explainable analysis of imported data

2026-11-07. User authorized adding pump characteristics and diagnostics on uploaded data, with explanations of observations, missing information and the additional measurement worth making. Claude Code implemented; Codex scoped, reviewed physical/causal logic, tested the browser and released. Video remains paused; user acceptance remains pending.

## Result

Local systems now accept a Q–H curve with reference rpm, source/status and applicability acknowledgement. Density and comparable pressure reference/tap geometry are explicit; no silent water assumption or substitution of nominal for measured rpm. The engine compares a selected closed UTC minute with the curve, with optional approximate affinity scaling. It shows observed/expected head, difference, a Q–H point, historical minute values, alternative explanations and a conditional next check. This is hydraulic consistency analysis, not a validated general fault classifier.

The curve supports interpolation only. Unsupported flow/speed, missing channels, gaps, incomplete minutes and changing regimes withhold a conclusion. In-band does not mean healthy. Unverified real references require reference verification first. Illustrative references retain a strong scenario qualifier while demonstrating the subsequent independent measurement and its possible outcomes.

Five authored synthetic CSV scenarios can be created/downloaded from My systems: stable, low head, changing regime, missing flow, outside curve range. They remain separate from the challenge and provide no accuracy evidence. New imports retain the full bounded series for analysis; legacy thinned records request reimport.

## Findings corrected during review

- Removed whole-source coverage from the causal mapping gate: future nonblank values cannot change an earlier minute's status.
- Normalized missing-flow/speed reasons so each produces an actual next action.
- Removed changed system resistance as a standalone explanation for an above-curve gap at the same Q/n: resistance moves an operating point along the curve.
- Changing the pump to the challenge prefill clears the previous reference rather than silently carrying its applicability forward.
- Removed the duplicate whole-file pressure plot beside the as-of analysis. Whole-record readiness is explicitly labelled and collapsed separately.
- Fixed nonfinite density validation, empty-source timestamps, stale cutoff after source-range changes and the invisible isolated minute point.
- Simplified RU status wording, placed the next check above charts, and put causes/outcomes in disclosures.
- Fixed the mobile CSS specificity collision that squeezed metric values into a one-character column. Reference inputs fit the viewport.

## Verification

Independent full-suite run: **137 passed, 0 failed, 0 skipped** (`node --test --test-timeout=30000 tests/*.mjs`). `git diff --check` clean. The original123 checks remain; one existing chart-render assertion was updated for the replacement as-of chart rather than weakened. Fourteen new tests cover the physical oracle, interpolation, affinity, invalid/missing settings, minute boundaries, gaps/transients, prefix invariance including future-only channel values, persistence, corrupt/quota handling and bilingual rendering.

Independent numerical oracle is recorded in `022-review-oracle.md`: pressure difference343.23275kPa at density1000 → head35m;274.5862kPa →28m and−20%. At1200rpm,Q80 with1500rpm reference,Qref100 → expected22.4m. These are mathematical examples, not benchmark performance.

Browser QA (1161px desktop,390px mobile):

- Created low-head illustrative draft, moved time to the first closed minute (in-band), then to the last (below expected range).
- Saved SYS-003, reloaded, and retained the full1200-row record.
- Used the actual file chooser to import `illustrative-lowHead.csv` from disk, saved and reloaded again:29.1m observed versus35.5m expected,−18.1% in the selected minute. The record is explicitly an authored example.
- Duplicate Q values in the curve editor produced a useful error; restoring increasing Q allowed progress.
- Missing-flow scenario withheld the curve comparison and recommended a temporary simultaneous flow measurement.
- Changing-regime scenario withheld a steady comparison and recommended recording a stable regime.
- EN/RU preserve the system/selection; final screenshots show values, curves and next action. Local user-entered names are intentionally not machine-translated.
- At390px, final document and scroll width both390; metric labels/values and Q/H editor fit. No browser console errors observed.

Screenshots: `review/task022/diagnostics-ru.jpg`, `diagnostics-en.jpg`, `diagnostics-mobile-ru.jpg`, `reference-mobile-ru.jpg`. SYS-003 is browser-local QA/demo state, not distributed as benchmark telemetry.

## Frozen bundles

SHA-256 values match the previous release:

- diagnosis-comparison.json: `8ffff27f530dd05d0970ec36b23126ec5502a0c1055d7ee12a135aef559ea567`
- fleet.json: `168ab6cfa14c797e83d932fadcd1da28e096d3c547d0f9a9799cfd3678279724`
- replay-PUMP-08.json: `51e2456168480ad24d6d137b6e9898f4f72de34799483ac24ff543c3bd30c80f`
- replay-PUMP-09.json: `47c0a0d52816f1e7ca1407fe8af553d40db40d3c8509443a7b9d22e5340edfb3`

No vendor/test telemetry or labels were read, no benchmark predictions regenerated, and no new diagnostic accuracy or ROI is claimed.

## Limits

The simplified head formula neglects velocity/elevation corrections; user acknowledgement is required. Affinity scaling is approximate. The editable comparison band and fixed sample/transient/mixed-row rules are engineering assumptions, not certified tolerances. Analysis is one closed minute at a time; there are no alarm episodes, persistence gates or calibrated confidence. The chart is limited to the last240 closed minutes. Reference accuracy remains the user's responsibility, and contradictory measurement/reference errors cannot be uniquely distinguished from these inputs alone.

Mechanical values are descriptive, not bearing diagnosis. Efficiency, NPSH/cavitation diagnosis, multi-pump topology, actual online ingestion and certified hardware are not delivered. Full bounded imports use browser localStorage and can hit quota safely; no full-file export/historian is implied. New video remains paused until interface approval.

Physical background: [KSB Head](https://www.ksb.com/en-global/centrifugal-pump-lexicon/article/head-1115612) and [KSB Pump affinity laws](https://www.ksb.com/en-global/centrifugal-pump-lexicon/article/pump-affinity-laws-1117584). They support the physical relationships, not the app's heuristic thresholds or diagnostic performance.
