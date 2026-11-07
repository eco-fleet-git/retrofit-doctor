# Task022 handoff — pump reference and explainable analysis of imported data

Claude Code was the sole code writer. No Git, video, hardware, network, cloud, dependencies, or changes to frozen bundles or the benchmark method. **No browser was run by me**; the coordinator's CUA is the visual check. This is an advisory hydraulic consistency check, **not a validated fault classifier**.

## What was built

- **`web/js/hydraulic-analysis.js`** (new, pure, separate from `comparison.js`/`explain.js`):
  - **Reference parsing:** 2–20 Q/H pairs; Q ≥ 0 and strictly increasing; H > 0, not forced monotonic; reference rpm > 0. Strict decimal syntax via `parseNumber`, which rejects `Infinity`, exponents and hex.
  - **Physics:**
    - H = 1000·(Pd − Ps)/(ρ·g) with g = 9.80665. Negative gauge Ps is allowed.
    - Interpolation is piecewise-linear inside the curve range only; there is no extrapolation.
    - Optional affinity scaling: Q_ref = Q·n_ref/n, H_exp = H_curve(Q_ref)·(n/n_ref)².
    - Without scaling, measured speed must be within ±2 % of n_ref. The rated rpm is never substituted.
  - **`assessAt(sys, cutoff)`** looks at one minute only: the latest **closed** UTC minute (its end ≤ cutoff).
    - No partial minute, no future rows, and no carry-forward or fill: an empty minute is `noData`, even when the previous minute was good.
    - **Status ladder:** `noSource` / `reimportNeeded` / `mappingNeeded` → `noData` / `insufficientRows` (< 3 rows or < 10 s) / `stopped` → `deltaPOnly` (density or geometry not confirmed) → `headOnly` (no reference / not confirmed to apply / band invalid / no flow or speed in the minute) → `transient` (speed range > 5 % or flow range > 10 % of the median) → `insufficientReference` (outside the curve range or outside the speed band) → `mixedRegime` (> 10 % unsupported rows) / `incompleteMinute` (gap at the minute's start or end, e.g. the record ends mid-minute) → `below` / `within` / `above` the editable band (default 10 %, allowed 1–50 %). The result is the median of per-row residuals.
    - **Row exclusions** are counted and shown: blank Ps/Pd, Pd < Ps, negative n, n = 0 (stopped), negative Q, blank Q or n, outside range, outside the speed band.
    - **Mapping** means installed status + the column present in the source + Ps/Pd at the pump taps. It **does not depend on whole-record coverage**, so values that appear only after the cutoff cannot change earlier results (coordinator review point 1).
    - Vibration and temperature medians are descriptive only.
  - **`timeline`**: per-minute statuses up to the cutoff, each computed from its own minute (last 240 minutes); `cutoffRange`.
  - **`explainAssessment`**: causes, ambiguity, next check and outcomes.
    - Above-band causes do **not** include a system-resistance change (it moves the point along the curve); "impeller/speed differs" is used instead.
    - An **unverified** reference → `verifyReferenceFirst` before any instrument. An **illustrative** (authored demo) reference keeps its strong qualifier, but its next check is the hypothetical independent Q/ΔP measurement, prefixed "Within this illustrative scenario (authored curve, not a manufacturer curve): …", so the examples demonstrate the measurement decision. A user-confirmed reference → `verifyIndependently` with no fault certainty.
    - In-minute missing Q or n is normalised to the `flow` / `speed` actions.
    - A mechanical question gets a "does not diagnose bearings" note; an energy question gets "not included in this slice".
  - **Illustrative examples:** an authored curve (0/42, 50/41, 100/39, 150/35.5, 200/30, 250/23 m at 1480 rpm, ρ 998) and the deterministic CSV generator `exampleCsv(kind)` for `stable | lowHead | transient | missingFlow | outsideRange`. `exampleSystem` builds a **new** unsaved draft with `illustrative-example` provenance, reference status `illustrative`, and a name stating that it is not a manufacturer curve.
- **`web/js/systems-model.js`:**
  - Imports now keep the **full series** (≤ 10,000 rows / 2 MB) in `source.series`, beside the 600-row preview sample.
  - **Legacy saves:** a source without `series` and with `rowsStored < rowsTotal` gives `reimportNeeded`. A legacy complete sample (`rowsStored == rowsTotal`) is usable.
  - **Validation:** the series must have a length equal to `rowsTotal`, strictly increasing timestamps and matching column lengths with finite-or-null cells. The sample timestamps must also increase. Optional `equipment.reference` and `analysis` are shape-checked; when absent they mean unknown. Malformed data makes the store `corrupt`, and nothing is overwritten.
  - **Readiness:** `pumpCurve` is no longer listed as missing when a valid curve is confirmed to apply.
  - **Challenge prefill (PUMP-04)** now **clears** any previously entered curve and applicability, and step 2 shows a visible note (`#ref-cleared`).
- **`web/js/analysis-view.js`** (new) and wiring in `systems-view.js` and `app.js`:
  - **Step 2:** collapsible reference editor (`#ref-editor`) with name, status, rpm, Q/H rows (add/remove), the applicability confirmation, density, band, the pressure-basis/tap-geometry confirmation, and the affinity option. Each comes with plain caveats and validation messages (EN/RU).
  - **Step 4 and saved detail:** a "Comparison with the pump curve / Сравнение с характеристикой насоса" panel, in this order:
    1. cutoff slider (closed minutes) and status with the timestamp and the evaluated minute;
    2. qualifier for an unverified or illustrative curve;
    3. observed vs expected head and the difference, and row counts with exclusions;
    4. **Next useful check** (outcomes in a disclosure);
    5. causes and "what this data cannot distinguish" (disclosure);
    6. Q–H chart (curve, ±band, operating point; labelled "scaled to n_ref" when affinity is on; units, source and status, n_ref, minute);
    7. per-minute time chart (residual %, or ΔP when there is no verdict; gaps are not joined; the selected minute is highlighted);
    8. calculation, rules and assumptions with the KSB links.
  - The old whole-file pressure preview was **removed**. The Task021 readiness is now a collapsed "Whole-file channel inventory (whole record, not as-of)". There is no 1970 timestamp when there is no range.
  - **List:** "Illustrative examples (authored synthetic data)" with five create buttons and five Download CSV buttons.
- **`web/styles.css`:** Task022 block.

## Tests

`node --test --test-timeout=30000 tests/*.mjs` → **137/137 pass** (123 baseline + 14 in `tests/web_hydraulic.test.mjs`). Frozen bundles are byte-identical.

New coverage:
- **Oracle numbers:**
  - Pd 443.23275 → 35 m; Pd 374.5862 → 28 m and −20 %;
  - affinity at 1200 rpm and Q 80 → Q_ref 100, 22.4 m (Pd 319.66896 → within); without scaling the speed band blocks;
  - Q 250 is outside the range; blank measured speed with rated 1500 gives no verdict.
- **Reference validation;** non-monotonic H is accepted.
- **Missing assumptions:** density, geometry, applicability or reference missing → ΔP or head only. Proposed or unmapped channels and wrong tap locations never count.
- **Row exclusions and mixed regimes:** reversed ΔP, negative Q, stopped pump, and a mixed minute → withheld.
- **Minutes:**
  - cutoff 10:01 → minute 10:00 only, and a mid-minute cutoff;
  - a gap at 10:01 is not filled by 10:00;
  - a partial terminal minute → incomplete;
  - a transient → repeat at a stable regime.
- **Prefix invariance:**
  - later outliers, blanks and extra length do not change earlier results;
  - full input equals truncated input for both the assessment and the timeline;
  - a mapped column that is blank before the cutoff and filled only later changes nothing earlier.
- **Storage:** a 3000-row full series survives reload with identical results; legacy 600-of-3000 → re-import; a legacy complete sample is usable; malformed series or settings → corrupt and not overwritten; quota.
- **Examples:** deterministic and identical to the fixtures; each shows its case; new draft with illustrative provenance; lowHead is within band before 10:08.
- **Challenge prefill** clears the curve, visibly.
- **Views (EN/RU):**
  - editor errors; number syntax (`Infinity`, `1e3`, `0`, `-5` rejected);
  - panel status and charts with units, n_ref, qualifier, causes, ambiguity, the cavitation caveat and no "healthy" or confidence wording;
  - the next check placed before the charts and causes;
  - the within-band "not healthy" sentence and the mechanical note;
  - the legacy re-import label without "full series kept", no 1970 and no whole-file preview;
  - the examples block.

## Final edge fixes

- **Stale cutoff:** a cutoff remembered from an earlier source (for example after replacing the CSV with one covering a different date range) is clamped to the current record's closed-minute range and snapped to a minute boundary, so the slider value and the evaluated minute always agree. Tested with cutoffs before, after and inside the range.
- **One-value time chart:** an isolated per-minute value (no neighbour on either side) is drawn as a dot, so a single-minute series is visible.

## Mobile fix (CUA at 390 px)

- **Cause:** the existing `dl.kv` rule (element + class) outranked `.an-kv`, so the ≤600 px one-column rule never applied and the label column stayed `max-content`.
- **Fix:** the rules now use `dl.kv.an-kv`.
  - **Desktop:** labels are `minmax(0, max-content)` and wrap; values are at least 7em and do not wrap.
  - **≤600 px:** a single column, with the label above its value.
  - **Overflow:** the panel and its children are `min-width: 0` / `max-width: 100%`.
- **Reference table:** the inputs are fluid (≤ 110 px on desktop, full cell width on mobile), and the table is 100 % wide on mobile.
- CSS only; tests unchanged and passing.

## Illustrative fixtures (authored synthetic, not a manufacturer curve, not benchmark accuracy)

`tests/fixtures/pump-reference/illustrative-{stable,lowHead,transient,missingFlow,outsideRange}.csv`: 1 Hz, 2026-03-02 10:00–10:20 UTC. They are also downloadable from the list. Results at the last cutoff (10:20):

| Example | Result |
|---|---|
| stable | within, about −0.1 % |
| lowHead | below, about −18 % (29.1 vs 35.5 m) from 10:08; within before 10:08 |
| transient | transient (affinity enabled; speed varies about 12 %) |
| missingFlow | head only: flow missing → temporary flow measurement |
| outsideRange | Q 280 > 250 → insufficient reference, no extrapolation |

## Manual scenario and selectors (for CUA)

1. On `#/systems`, open `#sys-examples` and click `#sys-ex-lowHead`. Step 4 opens with `#wz-an-panel`. Save it (`#sys-save`).
2. On the detail page, `#an-panel` shows "Head below the expected range", the illustrative qualifier, the values, and `#an-next` ("Within this illustrative scenario…": an independent temporary flow meter and test gauge). Then come `#an-outcomes`, `#an-causes`, the charts `.an-chart` and the calculation disclosure.
3. Move the slider `input[data-an-cutoff]` to 10:05: the status becomes within. Each change re-renders only data up to that time.
4. Reload: the same result (full series persisted).
5. Edit (`#sys-edit`) → step 2 `#ref-editor`:
   - set the status to unverified: the next check becomes "verify the reference first"; set it to user-confirmed: the qualifier and the scenario prefix disappear and the check is independent verification;
   - clear the density (`#sf-analysis-density`): the status becomes pressure rise only;
   - clear the geometry confirmation (`#sf-analysis-geometryAck`) or the applicability confirmation (`#sf-equipment-reference-applies`): the verdict is withheld.
6. Run the other examples: `#sys-ex-transient`, `#sys-ex-missingFlow`, `#sys-ex-outsideRange`, `#sys-ex-stable`.
7. Use "Use challenge example (PUMP-04)" in step 2 after entering a curve: the curve is cleared and `#ref-cleared` is shown.
8. Check EN/RU, and widths 1440 / 1161 / 390.

## Limitations

- **Head assumptions:** velocity and elevation corrections are neglected, and only the user's acknowledgement covers them. There is no NPSH or absolute-pressure context, so cavitation is never diagnosed.
- **Fixed rules, not tuned:** the ±2 % speed band, the 5 % / 10 % transient thresholds, the 10 % mixed-row limit and the 5 s edge rule are transparent fixed heuristics. They are not tuned on any benchmark and are not certified.
- **One minute at a time:** there are no episodes, persistence or trend statistics. The time chart shows the last 240 closed minutes.
- **Mechanical and energy:** vibration and temperature are descriptive only, and no energy ratio is computed.
- **Storage:** the full series uses `localStorage` (about 75 KB per 1200 × 4 rows). Many large imports will reach the quota, which is reported safely.
- **Not rendered by me in a browser:** layout, focus and slider interaction are for the coordinator's CUA.
