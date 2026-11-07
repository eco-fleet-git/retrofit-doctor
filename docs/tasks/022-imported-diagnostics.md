# Task022 — pump reference and explainable imported-data analysis

User explicitly requests implementation now: add pump characteristics and diagnostics on uploaded data, explaining observations, missing evidence and the additional measurement worth taking. Claude Code sole code writer; Codex scopes/reviews/Git. Extend Task021, EN/RU, no video, hardware, paid tools, external connections or changes to frozen benchmark bundles. Scope is advisory hydraulic consistency analysis, NOT a validated fault classifier.

## Reference and physical assumptions

In equipment step add optional collapsible pump reference editor: 2–20 Q/H pairs (m³/h, m), strictly increasing nonnegative Q, positive H (do not force decreasing H: real curves may not be monotonic), reference rpm >0, source/name, reference status unverified/user-confirmed/illustrative. Explicit confirmation that curve applies to this centrifugal pump, impeller and fluid regime. Existing nominal/design point is NOT this curve. Preserve old saved systems without overwriting/corrupting; missing new fields mean unknown.

Density kg/m³ must be supplied (>0) and pressure basis/tap geometry explicitly acknowledged. Bounded first implementation: user confirms Ps/Pd same pressure reference and comparable tap elevation/diameter; explain H≈1000(Pd−Ps)/(rho*9.80665) neglects velocity/elevation corrections. Without that acknowledgement show ΔP only, withhold curve verdict. Do not silently assume water or matching taps. Negative Ps can be valid gauge pressure. Negative Q/n, Pd<Ps, power<=0 (for energy ratio) invalid for this supported forward-running comparison; n=0 is stopped/unsupported, not wear.

Curve interpolation piecewise linear WITHIN range only. Optional explicitly enabled affinity speed normalization (same impeller/fluid, approximate): Qref=Q*nref/n, Hexpected=Hcurve(Qref)*(n/nref)^2. Without scaling, require measured speed within a documented small reference band (e.g. 2%); never substitute rated rpm. Outside curve range, speed regime or applicability: insufficient reference, no fault label. Comparison band default10% is editable engineering assumption (1–50%), NOT certified tolerance/sensor uncertainty or benchmark-tuned value. Unverified/illustrative curve must visibly qualify every result; unverified reference cannot assert equipment fault. Source cited in technical details/docs:
https://www.ksb.com/en-global/centrifugal-pump-lexicon/article/head-1115612
https://www.ksb.com/en-global/centrifugal-pump-lexicon/article/pump-affinity-laws-1117584

## Causal analysis and storage (essential)

New pure module separate from benchmark inference. Analyze actual simultaneous installed/mapped Ps/Pd/Q/n rows, never manufacture missing values. Extend imported source to retain full bounded analysis series up to existing10000-row/2MB import limit; preview sample can remain600. Quota errors must remain safe. Legacy stored sources with fewer rows than rowsTotal require reimport for diagnostics (never imply full-record diagnosis from evenly thinned samples); legacy complete series can be used. Validate new stored shape, monotonic timestamps and lengths. No silent whole-file reference calibration.

As-of timeline in saved detail and initial assessment. Use CLOSED UTC MINUTES only: a minute is eligible if its end<=selected cutoff; no partial last-minute data, no future readings, no backward/forward fill. At cutoff report latest fully closed minute only, not a last-known earlier healthy value. Chart/evidence include only data <= cutoff. If gap/no eligible data: insufficient data, clearly no recent measurements in selected minute. Avoid using whole-source coverage/pairs as causal evidence. Prefix invariance tests mandatory (full input at cutoff == truncated input at cutoff); later outlier, missingness and record length cannot alter earlier outputs. Retain full-series chart downsampling after slicing only.

Minute evidence: simultaneous mapped Ps/Pd/Q/n, minimum3 rows spanning>=10s; aggregate per-row head/expected/residual with medians. Gate curve verdict for strong speed/flow transients in that minute (document transparent heuristic e.g. range/median >5% n or >10% Q); don't diagnose wear during changing regime. Show threshold assumptions and eligible/excluded counts. No need for detector episodes/persistence or tuning this slice. A valid minute can state below/within/above chosen reference band; within band means no hydraulic mismatch found in this minute, NOT healthy. It is an observation, not cause certainty. If Q/n absent may still show correctly mapped ΔP without curve conclusion.

## Explanation and useful measurement

Primary layout: one clear status + timestamp, observed vs expected values and gap; Q–H chart with labelled units and reference curve + selected operating point (at reference speed if normalized, explicitly labelled), time chart of causal residual/minute or pressure with gaps; next action card. Avoid walls of text; expandable calculation/evidence/assumptions.

Explain chain: What we see → plausible explanations (several, never certain wear/cavitation) → what cannot distinguish them → next measurement AND what each result would change. Select smallest useful check, not default full sensor kit:
- Missing/unmapped data: confirm mapping/existing drive signals first; missing Q suggests temporary independent flow measurement; missing n first read drive/tachometer.
- Missing curve/geometry/density: obtain/verify reference/installation info BEFORE buying sensor.
- Mismatch: check curve/speed and independently verify flow and differential pressure; can rank first check based on available inputs but do not infer which sensor is wrong without evidence. Explain independent Q agreeing vs disagreeing and remaining alternatives.
- In-band: no new permanent sensor justified by this hydraulic comparison alone; continue recording, acknowledge mechanical blind spot.
- Transient: repeat at stable operating regime, not permanent sensor purchase.
- Mechanical question: RMS/temp can show descriptive recorded changes if implemented, never bearing diagnosis or ISO severity; absent waveform/reference suggests temporary spectrum after context. Energy ratio only if correctly mapped simultaneous measured input power and assumptions, no ROI, or mark not included in this slice. Do not let question=mechanical falsely present hydraulic result as sufficient.
No confidence percent, health score, claim of diagnosed cavitation (missing absolute suction/fluid vapour context/NPSH), valve flow from position, or certification.

## Demonstrable fixtures, tests and delivery

Provide clearly labelled authored synthetic CSV fixtures + illustrative Q/H curve values in handoff: stable in-band, sustained low-head, changing-speed/flow, missing channel, outside range. Must be downloadable/selectable via UI (explicit 'illustrative example' action is acceptable) so user can exercise without inventing manufacturer data. New example isolated from challenge dataset and does not measure diagnostic accuracy; explicit action fills curve assumptions/mapping/source with illustrative provenance and must not silently overwrite existing user data (best create new SYS draft).

Test physical calculation/interpolation/range, nominal≠measured speed, optional affinity, density/mapping/geometry missing, blank rows and negative/stopped readings, minute cutoffs, gaps/transients, prefix invariance, legacy persistence/no overwrite/quota, EN/RU renders. Preserve123 baseline tests. Browser review will be Codex; provide selectors and exact manual scenario. Finish docs/tasks/022-handoff.md with limits and test outcome. No Git, no other writers. Work within bounded ~45min slice; notify if scope can't fit, don't hide missing features.
