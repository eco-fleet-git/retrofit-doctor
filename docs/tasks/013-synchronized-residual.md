# Task013 — synchronized hydraulic residual, prospective adaptive wave

2026-11-07. Claude sole code writer; Codex protocol/review/Git. 45-minute phase-1 slice. Start only after Task012 finishes and its negative findings are preserved. No new approval is needed for the user-authorized diagnosis work. No validation/test development reads.

## Prior exposure and different hypothesis

Task012 preliminary scores show zero hydraulic overrides in all four variants; the UNKNOWN waveform refinement alone remains type9 versus B1 type8, below the fixed gate. Its full correctness audit is still running when this protocol is written. The coordinator has read aggregate applicability counts, not its numeric per-alert spread budgets. Historical known train outcomes from Tasks010/011/012 are development exposure. No raw 1 Hz telemetry has been inspected for this new wave.

Task012 adds standard deviations conservatively, discarding their synchronization. Real control-driven changes in pressure, flow and speed should largely cancel in the pump-equation residual; independent instrument noise need not. Use the existing raw synchronized measurements, rather than weakening the earlier thresholds. The public data dictionary identifies partitioned 1 Hz telemetry, timestamp_utc and the four physical channels below. The public pump curve and all its limitations are already documented in Task012. No hidden generator/config reads, asset-specific rules, event-specific time windows or label-derived inference.

## Fixed candidates before new scoring

R3 / R5: residual standard deviation >3 / >5 times its empirical first-day reference AND unique covariance attribution below. Otherwise exact causal B1.

Y3 / Y5: R3/R5 first; if it abstains and B1 type is UNKNOWN, use unchanged Task010 W1. Otherwise exact B1. These are four new configurations, not edits to sealed earlier waves.

All preserve B1 emission times, k6, persistence15, reference24h, refractory12h, seed0, COMMUNICATION_LOSS/SENSOR_STUCK protection. Reuse unchanged Task012 applicability checks (water-like fluid; passport; steady/no gap; observed Q/Ps/Pd/n/T means/std/counts; ratios; curve consistency; NIST vapor pressure and NPSH; relative std bounds; not B1 cavitation/air). The Task012 per-source spread budget and floors are NOT a decision gate for this new residual method. Record the reused applicability outcome separately from new residual decisions.

## Synchronized residual in kPa

For each valid raw sample in a closed minute, in double precision:

`Xpd = Pd`, `Xps = -Ps`, `Xq = (rho*g/1000)*(H0-Hb)*(Q/Qb)^2`, `Xn = -(rho*g/1000)*H0*(n/nr)^2`.

`E = Xpd + Xps + Xq + Xn`.

This is exactly measured pressure rise minus the public pump-curve pressure rise. Every X and E is in kPa. Retain Task012 density/atmospheric/tap-position assumptions, no inferred RPM or interpolated channels. Compute sample variance/covariance with ddof1 on the SAME paired observations. Require at least30 rows with all Q/Ps/Pd/n finite, Q>0 and n>0, installed channels, raw operating_mode RUNNING and nominal sample_interval_s1. Require unique timestamps, on the 1-second grid; reject invalid/duplicate raw input explicitly rather than silently double-weighting. Drop missing paired measurements, no filling. If raw absent/insufficient -> explicit unsupported, exact B1.

Minute interval is [window_start,window_start+1min); available only at its end. Raw row exactly at an alert time belongs to the next, not the just-closed minute. No raw data later than the inference clock enters current/reference statistics. Data loader reads only explicit train asset partitions, asserts IDs and window bounds, records train projection hashes. Do not load the whole telemetry root or any test partition. It may skip assets missing installed required channels, with explicit capability reasons.

Empirical reference: median std(E) from the first24h closed minutes satisfying g.steady and no gap, paired count>=30 and finite std(E)>=0. At least60 eligible minutes, median strictly>0. Freeze after24h; cannot use/expose completed reference stats before reference completion. Do not label this reference certified healthy. No label filtering or whole-week statistics.

Current std(E)>factor*reference_std, reference complete, and current Var(E)>0 are required. Define each contribution `c_j = Cov(E,Xj)/Var(E)`, dimensionless. The exact additive identity gives sum(c_j)=1 up to floating point (require abs(sum-1)<=1e-6). These are variance decomposition terms, NOT causal probabilities; negative values are possible due to cancellation.

Require all four c_j>=-0.25 (otherwise strong cancellation/ambiguous attribution -> abstain). Exactly one among ALL FOUR terms must have c_j>=0.75; its competitors must each be<=0.25. If the dominant term is speed, abstain with `dominant_speed_not_a_supported_sensor_source`. If the unique source is Q/Ps/Pd, additionally require its existing causal spread z>6 (strict). Then emit SENSOR_NOISE_SPIKES for that physical channel; otherwise exact B1. No inference from residual MEAN and no diagnosis of wear/cavitation from this rule. A strong residual can also come from dynamics or a wrong model; state that limitation.

Evidence: raw minute boundaries, paired count, raw input provenance, residual std and native kPa reference/support, excess ratio, all four covariance terms and shares, their sum, source spread z, applicability values/reasons/assumptions, original B1 cause, chosen source. Keep B1 confidence only as the anomaly score, explicitly not confidence in the proposed cause. Recommend inspecting synchronized traces and checking the proposed channel with an independent instrument before replacement.

## Phase1 deliverables and meaningful fixtures

New residual module/runner/tests, exact manifest, handoff; no scoring until coordinator seal. Reuse earlier modules unchanged. Raw aggregation is vectorized per minute; cache only immutable within-minute tables whose availability is defined by minute end. Prediction must explicitly filter as_of. A faster audit must not substitute full-run reference values into prefix runs.

Fixtures: exact equation/units and covariance-sum identity; synchronized speed/flow/pressure motion cancels rather than being called noise; inject independent Q/Ps/Pd noise to localize each; noise on speed -> abstain; equal independent two-source noise/strong cancellation -> abstain; constant calibration offset changes residual mean but not spread and must not fire; missing/count/duplicate/timestamp/boundary/reference/installed guards; UNKNOWN-only waveform fallback and protected causes; full evidence prefix and future raw/statistics/snapshot mutations. Check raw row exactly on minute end, reference end and sub-minute cuts. Mutate future raw observations, not only already aggregated features.

Runner must refuse unsealed/code mismatch/unpinned seed/completed wave before loading data. Train01..07 only. Store raw projection hashes, aggregation provenance, raw predictions and applicability coverage BEFORE scores. Keep each partial attempt, frozen definitions and outcomes. Run every-candidate full-evidence prefix/future-mutation audit at the existing Task010 cut set using causal minute aggregates, plus independent raw-aggregation prefix/future-mutation checks at reference boundary (-1/0/+1 seconds), alert-minute boundary and one sub-minute cut per eligible asset. Raw aggregation checks compare every published closed-minute statistic, including counts; absent/unsupported rows must also match. Fresh seed0 process must reproduce main prediction hashes.

## Same success gate, no post-score edits

Control18 detected /8 correct type /14 correct class /3 false+3 excess /3 sensor type+channel over26 events,49 asset-days. Candidate must detect>=18,class>=14,burden<=6,sensorTC>=3 AND(type>=10 OR(type>=9 ANDsensorTC>=4)). Select useful diagnoses, type, lower burden, then R3<R5<Y3<Y5. Report all configurations, paired event gains/losses, false/excess/nuisance, UNKNOWN, wrong-specific and unsupported reasons. No validation/test read or UI adoption until coordinator reviews a passing result. If none passes, preserve negatives and stop for the next research decision.
