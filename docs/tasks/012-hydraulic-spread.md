# Task012 — hydraulic consistency of within-minute variability

2026-11-07. New prospective adaptive wave. Finish/preserve Task011 findings first. Claude sole code writer; Codex review/protocol/Git. 45-minute slice. Continued research is explicitly authorized; no user approval request.

## Prior exposure and hypothesis

Task011 Q1/Q2 never fired; U1/U2 improved type8→9 but did not meet the fixed success gate. At the known train PUMP-04 noise-event alert, coordinator inspected Q1 detail: flow spread z26.266, std17.116m³/h, while coupled spread z included pressure−0.399, current−0.060, power2.723, speed5.016 and valve4.363. The ALL-coupled-z<=2 rule abstained; the extreme/std ratio was about2.54, below4. Preserve these negatives, do not edit their thresholds.

A genuinely different hypothesis: use the public pump characteristic to propagate measured pressure/speed variability into an approximate allowable flow variability (and analogously for pressure instruments). This accounts for simultaneous control changes in physical units. It is an exploratory analytical-redundancy rule, NOT a calibrated variance model, certified limit, sensor-error proof or validated digital twin. Real transient flow, air, cavitation, wrong curves and tap geometry remain alternatives.

Primary sources already read by coordinator:
- vendor/benchmark/TECHNICAL_MODEL.md sections2–4 (provided synthetic pump characteristic, NPSH3 and intended operating range).
- https://www.ksb.com/en-global/centrifugal-pump-lexicon/article/pump-affinity-laws-1117584 (speed/head/flow similarity and its incompressible, non-cavitating limitations).
- https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Type=ANTOINE (water vapor pressure coefficients/ranges below).

## Four candidates, fixed before any new score

H3: hydraulic spread hypothesis with ratio>3.0; H5: same ratio>5.0.
V3/V5: H3/H5 first; on abstention, refine B1 UNKNOWN only using unchanged Task010 W1 waveform rule. Otherwise exact B1.
All retain B1 emission times, persistence, refractory and protected COMMUNICATION_LOSS/SENSOR_STUCK. Additionally abstain from the hydraulic rule if B1 already says CAVITATION or AIR_ENTRAINMENT (its quasi-steady premise is then in question). No fitted classifier, no new snapshots/thresholds. Do not edit any earlier sealed code/results.

### Measured inputs and scope

Need Q flow_m3_h, Ps/Pd gauge kPa, n measured rpm, fluid temperature Celsius, and mean/std/count for each; installed and currently observed, count>=30, finite mean/std>=0. No inferred RPM or zero/missing-as-normal. Static Qb=pump_rated_flow_m3_h, Hb=pump_rated_head_m, H0=pump_shutoff_head_m, nr=motor_rated_rpm and NPSH3b=npsh3_at_bep_m all finite/positive, H0>Hb. Water-like fluid only (passport fluid text containing water, case-insensitive); rho=1000kg/m³ fixed approximation, g=9.80665, atmospheric pressure101.325kPa assumed (not measured). Document these assumptions.

Require g.steady, no gap, reference complete; r=n/nr in[0.5,1.0], q=Q/(r*Qb) in[0.3,1.3], Q>0, Pd>Ps. Require std(Q)/Q<=0.20 and std(n)/n<=0.05 for local linearization. No extrapolation outside these bounds.

Mean consistency: Hcurve=H0*r²−(H0−Hb)*(Q/Qb)² >0; Hobs=(Pd−Ps)*1000/(rho*g)>0. Require |Hobs−Hcurve|<=0.20*Hcurve; otherwise model unsupported (do not call a sensor fault). This ignores differences of tap elevation and velocity head; those are explicit limitations/assumptions, not verified installation facts.

Conservative cavitation applicability check (not a cavitation diagnosis): NPSHa_lower=(101.325+Ps−Pv)*1000/(rho*g), omitting positive inlet velocity head. NPSH3=NPSH3b*r²*(0.55+0.45*q^2.6). Require NPSHa_lower>=1.5*NPSH3. Pv from NIST water Antoine log10(Pbar)=A−B/(TK+C), Pv[kPa]=100*Pbar; choose the first valid row below, NO extrapolation across gaps/outside ranges (unsupported -> exact B1):
- 273<=TK<=303: A5.40221 B1838.675 C−31.737
- 304<=TK<=333: A5.20389 B1733.926 C−39.485
- 334<=TK<=363: A5.0768 B1659.793 C−45.854
- 344<=TK<=373: A5.08354 B1663.125 C−45.622
TK=temperatureC+273.15. Pure-water Pv for water-like fluid, approximate density and atmospheric pressure are not field measurements. Record exact applicability values and unsupported reason. No hidden generator/config read.

### Variability budget in native units

Let D=H0−Hb; aQ=(rho*g/1000)*2*D*Q/Qb² in kPa/(m³/h), an=(rho*g/1000)*2*H0*r/nr in kPa/rpm. Require aQ>0 and finite. These are magnitudes of the local derivatives of the public curve's pressure rise.

For sigma = measured within-minute std, the conservative sum of magnitudes is:
- Bphys(Pd)=sigma(Ps)+an*sigma(n)+aQ*sigma(Q)
- Bphys(Ps)=sigma(Pd)+an*sigma(n)+aQ*sigma(Q)
- Bphys(Q)=[sigma(Pd)+sigma(Ps)+an*sigma(n)]/aQ

Reference floor per source: median observed source std over this asset's first24h steady closed minutes, installed/count>=30/finite std>=0, at least60 eligible minutes. Freeze after24h; before completion or lacking support -> source unsupported. The reference is empirical, not certified healthy. No label screening, whole-week statistics or future fill. Budget(source)=Bphys(source)+reference_floor(source), must be positive. This sum avoids claiming independent errors or a statistical confidence bound.

Eligible source among Q/Ps/Pd only: current causal zs_source>6 AND measured sigma_source/budget_source > factor (3.0 or5.0). Exactly ONE eligible source -> SENSOR_NOISE_SPIKES on that source; zero/multiple -> exact B1. Min/max outlier ratio and the Task011 coupled-z gate are not used. This is a physically informed inconsistency hypothesis, not proof of instrumentation failure.

Evidence: all measured means/std/counts with native units, curve/derivative inputs, empirical floor/support, physical budget contributions, observed/budget ratio, applicability gates and assumptions; preserve B1 source/type. Retain B1 anomaly score and label it as such, not confidence in the new cause. Recommend comparison with raw signal/reference instrument under steady operation; consider unmodelled transients before replacing hardware. V variants may refine only UNKNOWN on hydraulic abstention, with existing waveform provenance/age.

## Phase1, before scoring

New src/retrofit_doctor/hydraulic_spread.py, scripts/run_hydraulic_spread.py, focused tests, exact manifest docs/experiments/followup/2026-11-07-hydraulic-spread-manifest.json and handoff. Reuse unchanged causal B1, waveform and evaluator helpers. No candidate score until coordinator seal.

Fixtures must check unit conversion and analytical derivatives against finite differences; physically consistent flow/pressure/speed variation -> no noise claim; source-only excessive Q/Ps/Pd variation -> unique corresponding hypothesis; ambiguous and unsupported inputs; missing/count/installed guards; reference support/time boundaries; NIST known-point/range behavior and low NPSH/curve mismatch exclusions; protected hydraulic and data-quality cases; UNKNOWN-only waveform scope; full evidence prefix/future mutation (means, std, counts and snapshots). Mocked runner seal/scoring smoke; no unrelated test reruns.

## Phase2, unchanged success gate

Train01..07 only, seven independent replays (nothing learned),26observable events/49asset-days, same scorer/control18detect8type14class3false3excess3sensorTC. Success: detected>=18,class>=14,false+excess<=6,sensorTC>=3 AND(type>=10 OR(type>=9 ANDsensorTC>=4)). Select useful diagnoses, type, lower burden, then H3<H5<V3<V5. Report every variant, unsupported applicability reasons and coverage, per-event/per-asset gains/losses, false/excess/nuisance/UNKNOWN/wrong specific separately. Freeze prospective code/manifest before first score; keep partial runs; require full-evidence causality and fresh-process determinism. No post-score threshold changes.

No validation08/09 or test10..12 telemetry/snapshots/labels/predictions in development. No prior artifact rewriting. After a passing result, stop for coordinator decision before descriptive validation/UI. English artifacts; all synthetic/adaptively developed. The goal remains open until a reviewed improvement is demonstrated, not merely a model implemented.
