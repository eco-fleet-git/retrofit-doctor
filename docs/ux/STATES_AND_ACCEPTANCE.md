# States and acceptance contract

Version 1, 6 November 2026. All proposed UI behavior below is a specification, not implemented functionality. Existing baseline outputs remain unchanged.

## 1. Navigation and data boundary

Suggested routes (adapt to the existing framework): `/fleet`, `/pumps/:assetId`, `/pumps/:assetId/retrofit`, `/evidence`. Preserve each asset's selected UTC replay time when navigating. Fleet filters survive back navigation. Refreshing a deep link resolves the selected asset and validates its mode. Invalid IDs show “Pump not found” and “Back to Fleet”.

| Data mode | Eligible assets | Allowed input | Display |
|---|---|---|---|
| `TRAIN_REPLAY` | PUMP-01–07 | Public metadata and explicitly loaded causal train replay | “Training replay”, or “Replay not loaded” |
| `VALIDATION_REPLAY` | PUMP-08–09 | Metadata, causal predictions and causal feature snapshots | “Validation replay · Synthetic benchmark” |
| `TEST_METADATA_ONLY` | PUMP-10–12 | Public passport and sensor inventory | “Blind test · Metadata only”; “Diagnosis unavailable” |
| `RETROSPECTIVE_VALIDATION` | PUMP-08–09 only | Full causal/original result comparison and validation labels | “Retrospective evaluation · Full validation window” |

Metadata-only is a capability boundary for this demo UI, not a filter that merely hides already-loaded test results. Do not load test telemetry or hidden labels into the UI bundle, worker, API response, cache or diagnostic adapter. If a dataset file mixes splits, filter by explicit asset IDs before selecting telemetry rows. The final one-shot blind export is already authorized at project level and runs through the frozen pipeline coordinated by main. It requires no separate user approval and is not initiated by this visual follow-up. See [Internal coordination](INTERNAL_COORDINATION.md).

Validation labels belong to a separate evaluation layer. In Pump Detail the toggle is off on initial entry and resets off when switching assets or entering metadata-only mode. When enabled, filter any displayed event onset, marker or label to `<= as_of` and clip event bands at `as_of`; do not reveal future end times in tooltips. A label may identify the retrospective event, but it cannot replace the selected baseline prediction. Full-window labels are only on the explicitly retrospective page. Changing the overlay must leave predictions, evidence, planner suggestions and asset ordering identical.

## 2. Minimum adapter contract

Use a typed adapter or equivalent explicit schema. Field names below are the interface to implement, not claims that these objects already exist. Null means unavailable, never zero.

| Object | Required fields and semantics |
|---|---|
| Asset | `assetId`, `split`, `site`, `profile`, `control`, `instrumentationTier`, `windowStartUtc`, `windowEndUtc`, exact `channelsAvailable`; source path |
| Replay snapshot | `assetId`, `asOfUtc`, `mode`, `sourceVersion` (`causal_b1`), visible completed feature rows, visible alerts, `referenceEndUtc`; provenance |
| Feature row | `windowStartUtc`, derived `availableAtUtc = windowStartUtc + 1 min`, supplied values with units, `reference_status`, `reference_ready_channels`; only rows with `availableAtUtc <= asOfUtc` |
| Channel observation | `channelId`, `installed`, `expectedUpdateSeconds` if known, `lastMeasuredAtUtc` if known, value/unit, source aggregation, availability; do not infer raw sample timestamps from forward-filled minute values |
| Alert | Exact seven source columns: `asset_id`, `alert_time_utc`, `event_class`, `fault_type`, `confidence`, `evidence`, `recommended_action`; filter time `<= asOfUtc` |
| Evaluation event | Event ID and exact fields from `events_causal_validation.csv` / `report_causal_validation.json`, linked separately to the original comparison; never a detector input |
| Plan draft | `assetId`, chosen candidates, observed limitations, user-entered answers, per-question status, source alert reference if any, explicit `hypothesis` classification and local save time |

Provenance distinguishes a benchmark timestamp, an application load time, and a recorded test run. Do not display the current wall-clock time as if a source measurement or test run occurred now. Telemetry and replay labels use **UTC**. Delivery scheduling uses **Europe/Berlin**.

Source alerts already use the closed-minute availability time (vendor `_alerts_from_flag` adds one minute to the window start). Do not shift alert timestamps again. Confidence remains unchanged in storage. Display e.g. `0.559` with “Uncalibrated baseline score”, with exact value in details. Do not label it “55.9% probability”.

A valid release can use precomputed **causal** snapshots for the demo instead of a live Python service. Snapshots need source provenance and correctly masked data at every selectable time. Slicing original B1 outputs is not a causal implementation. If no causal features are exported, request/generate them through the existing causal function within Claude's authorized implementation scope, or use the explicit signal-unavailable fallback. Never approximate z-scores in the browser.

## 3. Orthogonal states

### Load and availability

| State | Trigger | Required UI / transitions |
|---|---|---|
| `LOADING` | Adapter request pending | Skeleton, “Loading source data”; disable dependent actions; no stale values under a new asset ID |
| `READY` | Schema and provenance valid | Show loaded source and relevant modes |
| `EMPTY` | Successful read, zero matching items | “No pumps match these filters” + Reset filters, or “No baseline alert in this visible history” |
| `SOURCE_ERROR` | Read/parse/schema failure | “Source data unavailable” + Retry; show failing source name; retain metadata only if independently valid |
| `REPLAY_NOT_LOADED` | Asset has a permissible replay but none connected | “Replay not loaded”; inventory remains available; no invented status |
| `METADATA_ONLY` | Test asset | “Diagnosis unavailable”; no replay, labels or alert controls |

Changing assets cancels or ignores late results for the previous asset. A partial alert-source success may display alerts while the feature section says “Signal data unavailable”. A plan save failure says “Draft could not be saved” and leaves the draft editable. Never display success from a failed write.

### Reference readiness

`reference_status` describes each evaluated row. Use the latest completed row for the displayed diagnostic reference state; if no completed row exists, show collection progress without inventing a normalized row.

| State | Exact trigger | Copy and behavior |
|---|---|---|
| `COLLECTING_REFERENCE` | No post-reference completed minute yet; existing pre-reference rows retain this status forever | “Collecting reference”; “Statistical deviations start after the first 24 hours”; no z-score for early rows; gap/flatline alerts still visible if emitted |
| `REFERENCE_AVAILABLE` | Latest causal row reports reference available with `reference_ready_channels > 0` | “Reference available · N channels”; “Empirical reference, not verified healthy”; do not imply all installed channels are ready |
| `INSUFFICIENT_REFERENCE` | Post-reference row reports no usable reference channels | “Insufficient reference”; “No usable reference in the first 24 hours”; missing z-scores remain unavailable; do not extend the reference using later data |
| `UNAVAILABLE` | No reference source / metadata-only | “Reference unavailable” or omit from test detail with a clear metadata banner |

The ready-channel count follows the backend's diagnostic channels and is not the inventory's total channel count. Do not divide by installed-channel count to create a completion percentage. At exactly 24:00, reference collection time has ended but the latest completed row still belongs to collection. Display “Reference window complete · Waiting for first post-reference minute”. At 24:01, show the actual next row's reference state. Historical first-day z-scores remain unavailable after moving the clock forward.

### Measurement availability and freshness

| State | Deterministic presentation rule | Copy |
|---|---|---|
| `NOT_INSTRUMENTED` | Channel absent from `channelsAvailable` | “Not instrumented”; no line or zero-valued reading |
| `NO_MEASUREMENT` | Installed but no actual measurement is available up to `as_of` | “No measurement available” |
| `FRESHNESS_UNKNOWN` | Value exists but true measurement timestamp or expected interval is missing | “Freshness unavailable”; aggregate-window timestamp may be shown separately |
| `WITHIN_CADENCE` | Actual sample age `<= expectedUpdateSeconds` | “Last measured [time] · [age] ago”; show documented native interval |
| `UPDATE_OVERDUE` | Actual sample age `> expectedUpdateSeconds` | “Update overdue · [age] since last measurement”; descriptive UI state, not an invented baseline fault |

Age uses `as_of`, never the current desktop clock. If a timestamp is in the future, reject/mask that sample rather than showing a negative age. Native cadence and minute aggregation are distinct: a one-minute feature row does not imply a new T1 raw measurement. A four-minute-old T1 vibration sample with a five-minute interval is within cadence. The legacy flatline rule has known cadence limitations; display an emitted `SENSOR_STUCK` alert as the baseline output, but never introduce a UI rule declaring equal held values to be a new fault. Do not change detector behavior as part of presentation work.

### Diagnostic display

| State | Trigger | Display |
|---|---|---|
| `NO_VISIBLE_ALERT` | No source alert at/before `as_of` | “No baseline alert in this visible history”; no “Healthy” claim |
| `ALERT_PRESENT` | Source alerts exist in visible history | Show “Latest visible alert” and timestamp; keep its original type/class and evidence |
| `UNKNOWN_DIAGNOSIS` | Selected alert has `fault_type=UNKNOWN` | “Cause unresolved · Baseline output: UNKNOWN” |
| `DATA_QUALITY_ALERT` | Source alert is a sensor/communication diagnosis | Preserve diagnosis; distinguish missing or old measurements from trustworthy current values |
| `DIAGNOSIS_UNAVAILABLE` | Metadata-only or replay source absent | “Diagnosis unavailable” |

The source does not expose alarm acknowledgment, severity, resolution or active-episode state. Do not fabricate “Critical”, “Resolved”, “Active fault”, remaining useful life or a repair outcome. The latest historical alert is not automatically an ongoing fault. Data loss may coexist with an earlier machine alert and collection state; keep all these visible in separate sections.

## 4. Replay transitions

Start paused at a documented checkpoint. Play advances the selected asset's `as_of`; pause leaves it fixed. At asset window end, stop with “End of replay”. Seeking backward removes later rows, alerts, labels, tooltips and summary calculations. It must also discard a selected future alert. Chart y-axis extent, counts, min/max and hover lookup use only visible data. Window-start labels must not make unfinished windows appear available. App playback speed changes presentation time, not sample cadence or detector parameters.

If two independently selected snapshots appear in Fleet, retain their separate UTC times. Do not globally rank events by proximity to today's date, infer shared incidents, or animate one pump changing another. Site filtering changes visible rows only.

## 5. Planner states and content

| State | Trigger | Allowed action/result |
|---|---|---|
| `NO_SELECTION` | No candidates selected | “Select an option to prepare a draft”, including defer/review existing instrumentation |
| `DRAFT` | Candidate chosen or answer entered | Add/remove candidates, edit answers, save locally |
| `NEEDS_EVIDENCE` | A question is Open/Needs evidence or has an empty answer | Show specific missing inputs, no readiness label |
| `READY_FOR_REVIEW` | Every required question has a nonempty Draft response or Not applicable with rationale | “Ready for engineering review”; still an unvalidated hypothesis |
| `SAVED_LOCAL` | Successful local persistence | “Draft saved in this browser”; this is persistence feedback, not a separate approval |
| `SAVE_ERROR` | Persistence failed | Error feedback; retain edited draft in memory |

All proposals require: diagnostic question, evidence/coverage limitation, candidate method or explicit “Not selected”, mounting/access review, interface/timestamp review, maintenance/verification review, certification/site review, and a validation plan. Owner/name can remain “Unassigned” but readiness must not imply external review occurred. “Not assessed” remains valid draft content, with status “Needs evidence”.

Keep hypotheses in a separate proposed list. Adding/removing a candidate cannot mutate installed channels, telemetry, predicted diagnoses or benchmark metrics. A review response expresses a user's draft assumption, not a verified installation fact. Reset is an in-app reversible draft action with Undo. No send, purchase, deploy, equipment-control or approval action is in this scope.

Conceptual diagram rules: no inferred pump pairs; no heat-exchanger/filter differential pressure from pump pressure taps; no exact fluid-temperature mounting assertion; no measured RPM for fixed-speed PUMP-12; no deduction that missing valve feedback means no valve exists. Certification fields are questions for responsible engineering review, not statements of legal requirements or compliance.

## 6. Acceptance scenarios

Use these scenarios to review Task001's existing functional UI and the visual follow-up. Reuse passing functional evidence when the relevant code is unchanged. Every P0 scenario must pass for an unqualified completion claim; report gaps to main for resolution within Task001. P1 may be completed in subsequent iterations, with any gaps recorded. This checklist does not start a second implementation or add a user-approval gate.

| ID | Priority | Given / When | Pass condition |
|---|---|---|---|
| A01 | P0 | Open Fleet with valid metadata | Exactly 12 distinct pumps, train 7 / validation 2 / test 3; default asset-ID order; no paired topology |
| A02 | P0 | Filter to validation, open PUMP-08, return | Only 08/09 were listed; filter and asset replay clock persist |
| A03 | P0 | Open test 10, 11 or 12, including a crafted replay URL | Metadata-only; no telemetry/hidden-label fetch or bundled result; diagnosis unavailable |
| A04 | P0 | Inspect public inventory for test pumps | 10 has 11 channels, 11 has 6, 12 has 13; 12 has no measured RPM; rated RPM appears only as metadata |
| A05 | P0 | Inspect PUMP-08 at Sep 10 2025 12:37 UTC, then 12:38 UTC | Selected strainer alert absent first, present second with exact source evidence, 0.5587501525878906 confidence and action |
| A06 | P0 | Feature window is 12:00–12:01; seek 12:00:59 then 12:01 | Point/z-score absent first, available second if valid; no second shift of alert timestamps |
| A07 | P0 | PUMP-08 starts Sep 8 2025 00:00 UTC; seek Sep 9 00:00 then 00:01 | Boundary waiting copy first; post-reference row's actual state second; early rows never gain z-scores |
| A08 | P0 | Deterministic fixture has no eligible first-day reference | Post-day state Insufficient reference, no later backfill, no green/healthy substitute |
| A09 | P0 | Backend emits a gap or flatline alert during collection | Alert remains visible alongside Collecting reference; statistical z-scores stay unavailable |
| A10 | P0 | Sample is a known T1 observation four minutes old | Age 4 min, cadence 5 min, within cadence; no new UI stuck fault; absence of raw timestamp instead shows Freshness unavailable |
| A11 | P0 | Missing installed-channel observation versus uninstalled flow channel | “No measurement available” and “Not instrumented” appear separately; neither becomes zero |
| A12 | P0 | Seek backward from after an alert, or switch asset while loading | No later point/alert/label/tooltip/count/range leaks; late old-asset response ignored |
| A13 | P0 | Toggle validation labels on and off | Prediction/evidence and planner inputs byte-identical; overlay visibly retrospective; future label segments hidden |
| A14 | P0 | Open Evidence page | 76.01253946 vs 78.01253946 in detail; both 8/9 detected, 4/9 type; 1 false episode each; 15 vs 16 rows; no accuracy claim |
| A15 | P0 | Open PUMP-09-E04 evaluation row | Ground truth current-sensor drift separate from predicted calibration shift and vibration evidence; causal first alert Feb 11 2026 06:28 UTC |
| A16 | P0 | Open PUMP-08-E02 and E04 evaluation rows | UNKNOWN for matched bearing wear; no matched alert for noise spikes; misses not rewritten as detections |
| A17 | P0 | Open two validation pumps from Fleet | Different replay weeks visible; no synchronized live claim or shared-incident inference |
| A18 | P0 | Open Planner from PUMP-08 and choose flow assessment | Public absence of flow grounds the hypothesis; installation/integration/maintenance/certification questions present; no quantified uplift |
| A19 | P0 | Add proposal, save, switch asset, return and reload | Draft retained for correct pump; installed channels, predictions and scores unchanged; saved-in-browser feedback truthful |
| A20 | P0 | All checklist answers are absent or “Not assessed” | No Ready for engineering review; show missing evidence; completing drafted responses never yields Certified/Installed |
| A21 | P0 | Feature source fails but alert source is valid | Signal data unavailable + sourced alert text; no invented curve; Retry produces actual reload outcome |
| A22 | P0 | Validation report/test-evidence source fails | Evidence unavailable state; recorded documented claims not represented as newly executed tests |
| A23 | P0 | Use full demo at 1280×720 and 1440×900 | Clock, data-mode banner and primary action legible; no page-wide horizontal overflow; tables may scroll within a labeled region |
| A24 | P0 | Keyboard-only navigation | All controls reachable with visible focus; label toggle and table actions have names; no color-only states; dialog focus returns correctly |
| A25 | P0 | Rehearse the supplied demo with network disconnected | Known local sources load, or the disclosed evidence-only fallback works; finish in 180 seconds with no hidden/manual data edits |
| A26 | P1 | Read source details on any alert/metric | Source file, version and timestamp semantics visible; raw text is selectable; recorded hashes shown only if actually provided |
| A27 | P1 | Reset edited plan and use Undo | Prior draft restored; changing pumps never mixes drafts |
| A28 | P1 | Narrow viewport / 200% zoom | Panels stack, controls remain operable, important provenance stays visible |
| A29 | P0 | Inspect all charts and copy | Units/UTC present; synthetic label persistent; no unsupported cost, lead-time generalization, compliance, accuracy or physical-test claim |
| A30 | P0 | Verification record is displayed | 209 causality checks and 18 regression tests attributed to stored run; tolerance/scope documented; app does not claim to have rerun them |

Boundary/error fixtures are UI test inputs, labeled as fixtures in development. They must not be mixed into the recorded benchmark results or shown as observed PUMP-10–12 behavior. Use targeted automated tests for time/asset/data boundaries and manual browser checks for layout and the three-minute flow. Report what was run, what failed and what remains unavailable.
