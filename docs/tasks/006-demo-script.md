# Retrofit Doctor — three-minute live walkthrough (English, as implemented in Task006)

Rehearsed against the local build on 7 November 2026 with automated browser checks (`review/task006/browser-qa.mjs`); not yet rehearsed live by a person. Every step below is an interaction that exists in the app. Start: `python -m http.server 8765 --bind 127.0.0.1 -d web`, open `http://127.0.0.1:8765/`, use a fresh browser profile for a clean Planner (preserve existing user drafts).

| Time | Screen and action | Say |
|---|---|---|
| 0:00 | **Fleet Overview.** Point at the three inventory counts and the PUMP-10–12 rows. | "Twelve independent pumps from a synthetic benchmark. Blind-test pumps show their public passport only — no data, no diagnosis." |
| 0:15 | Click **PUMP-08**. The replay opens paused at 12:38 UTC. Click **−1 min**, then **+1 min**. | "This is a replay with an explicit clock. At 12:37 there is no alert; at 12:38 the causal baseline raises suction-strainer clogging. Nothing after the clock is ever drawn." |
| 0:35 | In the evidence card, read the verbatim evidence and **rule confidence 0.559 · uncalibrated**. Scroll to **Where the measurements are**; click **Ps**, then the slashed **Q** point. | "Suction pressure is measured at the pump inlet — it is not a strainer differential pressure. Flow is not instrumented on this pump, and the drawing says so." |
| 0:55 | Sidebar → **Evidence & Validation.** Scroll to the per-event table: PUMP-09-E04, PUMP-08-E02, PUMP-08-E04. | "Not every alert is a diagnosis. A current-sensor drift was reported late as a vibration calibration shift — wrong type. Bearing wear stayed UNKNOWN. Noise spikes were missed. The causal score is 76.01, not an accuracy." |
| 1:25 | Same page, **Sensor information ablation → Vibration + bearing temperature** (open by default). | "We removed this sensor group's data and restored it. On train, 9 of 10 events were detected with 2 correct types; without the group, 8 and 0. One event was detected only without it. Restore equals full. It is synthetic information value, not a field benefit." |
| 1:55 | Sidebar → **Retrofit Planner** (PUMP-08). Add hypothesis **Flow plus head and input power**; select **Defer permanent retrofit**; click **Load illustrative redundant-pump case**. | "The decision summary links that ablation evidence. With a hypothetical redundant pump — healthy standby, no production loss — the case loses EUR 2,200 a year, five-year NPV minus EUR 15,500, no payback. Even with zero nuisance checks it still loses EUR 400 a year." |
| 2:25 | Point at **Proposed field architecture** ("No permanent device proposed") and the schematic. Click **Save draft in this browser**. | "Deferring is a valid engineering outcome: existing signals plus a periodic route. The field path is a proposal only — read-only export, local buffer, human review; no device was built." |
| 2:45 | Point at **Next action** in the decision summary. | "The next step is a specific site question, not a claimed saving. Everything here is synthetic and advisory; the app cannot operate equipment." |

## Offline / fallback

The app uses local files served by the local server and no cloud service. A disconnected-Internet rehearsal is still pending the release checks; this is different from switching the browser fully offline, which can block new localhost fetches. If the live app is unavailable, present these screenshots in order: `review/task006/01-fleet-1440.png`, `03-pump08-alert-1440.png`, `02-schematic-pump08-1440.png`, `06-evidence-1440.png`, `05-evidence-ablation-1440.png`, `08-planner-first-screen-1440.png`, `07b-proposal-defer-1440.png`.

The earlier walkthrough in `docs/ux/DEMO_AND_SLIDES.md` (UX-helper owned) was not edited; this file supersedes its interaction steps for the current build.
