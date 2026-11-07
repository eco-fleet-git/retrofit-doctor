# Independent review cases for Task022

This is coordinator review material, not benchmark data or accuracy evidence. Author independent numerical expectations before inspecting implementation.

Reference: Q/H pairs (0,40), (100,35), (200,20), n_ref=1500rpm; density1000kg/m³; equal-height/equal-area pump taps, same gauge reference explicitly confirmed. At Q=100m³/h,n=1500: expected head35m. Ps=100kPa and Pd=443.23275kPa imply H35m. Low-head Pd=374.5862kPa implies H28m, residual−20%. No unique failure cause follows from that residual.

With explicit affinity scaling at n=1200rpm, Q=80m³/h corresponds to reference Q100. Expected H22.4m and Pd319.66896kPa at Ps100. Without scaling the20% speed difference must block comparison. Q250 at1500 is outside curve support and must not extrapolate.

Review causal cutoff2026-01-01T10:01:00Z: only minute10:00 can contribute. Append extreme readings at10:01 or later: earlier result unchanged. Include blank measured speed despite rated1500: no curve verdict. A good10:00 minute followed by missing10:01 must not retain10:00 as current condition at10:02. Add a transient minute: changing flow/speed blocks steady-regime inference. Partial terminal minute is not silently treated as completed.

Legacy storage: full3-row stored series can be read; old3000-row file represented by600 samples must ask for reimport. Malformed newly stored full series must fail safely. Proposed channels never satisfy measurements. Density or geometry missing must not silently produce head. Negative gauge Ps is not inherently invalid; reversed differential/negative flow/stopped pump are outside this forward-running comparison.

UX acceptance: graph axis units/reference source and selected time visible, selected minute observation separated from potential causes; next action says what the independent measurement would discriminate. In-band status cannot say healthy. Mechanical/energy question cannot imply hydraulic comparison diagnoses bearings or establishes ROI. Demonstration fixtures must visibly say authored synthetic/illustrative, never manufacturer curve or benchmark accuracy.
