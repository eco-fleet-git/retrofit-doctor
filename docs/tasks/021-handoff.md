# Task021 handoff — Add system, My systems and analysis readiness

Claude Code was the sole app-code writer. No Git, video, hardware, network requests, cloud, dependencies, data or diagnostic-model changes. **No browser was run by me**; the coordinator's functional QA is the visual and interaction check. No visual acceptance is claimed.

## Capabilities (what works)

- **Navigation:**
  - A new sidebar entry, "My systems / Мои системы" (`#/systems`).
  - The overview header has a primary "+ Add system" button (`#ov-add-system`).
  - Routes: `#/systems` (list), `#/systems/new` (wizard), `#/systems/SYS-001` (detail), `#/systems/SYS-001/edit`.
- **Four-step wizard** with a visible stepper, Back/Next and Save. Entries are kept across steps and language changes (module state until Save). Validation runs per step and focus moves to the first invalid field.
  1. **Site and decision:** site name, type (vessel / plant / data centre), system name, engineering question. Each question shows one sentence on the decision it supports. A user-defined conceptual loop SVG (pump, motor, control valve after the pump, marked as a template assumption) shows installed and proposed points.
  2. **Equipment passport:** pump and motor names, design flow (m³/h), design head (m), rated speed (rpm), motor rating (kW), valve name and placement (an assumption, or unknown).
     - Ratings may be **blank = unknown**; filled values must be positive and finite.
     - **"Use challenge example (PUMP-04)"** prefills explicitly from the passport and shows a provenance badge. The source asset is never modified.
     - The page states that the design point is not a pump curve.
  3. **Device, sensors and data:**
     - Device label and planned interface (file / local network (planned) / gateway (planned)), with a note that a planned interface is not a connection.
     - Eight channels (Ps, Pd, Q, n, P, V, T, Vp), each with its unit, its CSV header, status (installed / proposed / not present) and point location.
     - "Suggested sets by purpose" can mark missing points as **proposed** only; this never upgrades readiness.
     - Three sources:
       - **Challenge recording:** loads the reviewed PUMP-04 minute from the already-fetched `diagnosis-comparison.json` (only t/Ps/Pd/Q/n, 60 rows, historical synthetic).
       - **Local CSV:** file picker, parsed in the browser, never uploaded. It offers a template download, limits of 2 MB and 10,000 rows, strict validation with line-numbered EN/RU messages, blank cells kept as missing, and stores at most 600 evenly sampled rows plus full-file coverage and simultaneity counts, saying when the full file is not kept.
       - **Network / gateway (planned):** endpoint and transport metadata. Credentials in the endpoint are rejected. The status is "not connected · configuration only" and **no requests are made**.
  4. **Readiness:**
     - A tiny measured Pd − Ps preview (only when simultaneous Ps/Pd rows exist), with the time range and kPa.
     - Counts: configured as installed / proposed / actually received.
     - Warnings and notes: mapping conflicts, tap-location mismatch, "valve position is not flow", "short recording is not a reference", "challenge minute is noisy, not a healthy reference", "configuration only".
     - Three capability cards (hydraulic / mechanical / energy), each with a plain status and the exact missing conditions.
     - A "Next useful step" panel (advisory). The proposed permanent set sits behind a disclosure stating that hardware design, certification and installation are not verified.
     - The panel states that this is readiness for review, not a diagnosis.
- **Saved detail:** source summary (CSV loaded / challenge recording loaded / configuration only), preview, readiness, schematic, passport summary with provenance and unknowns, and Edit.
- **List:** each system's ID, site, question, source and per-capability status. The empty state offers "Add system" and "Use challenge example". A corrupt or unavailable store shows a readable message.
- **Shell captions on systems routes:** the footer says local user configuration with no equipment connection. The sidebar badges say "Local configuration" plus the per-source label (Local CSV record / Historical challenge sample / Not connected · configuration only / No data loaded). The provenance line names the challenge origin only for that source. Everything is restored on the next render elsewhere. User CSV data is never called benchmark data.

## Correction after the coordinator's CUA (readiness display)

- **Two separate counts:** "Channels in the loaded data: N (Ps, Pd, …)" and "mapped and usable: M (…)". A challenge minute loaded while all channels are "not present" therefore shows **4 in the data / 0 mapped**, instead of claiming that nothing was received.
- **No pressure-rise chart before mapping:** the chart renders only when Ps and Pd are mapped as installed sensors at the suction and discharge taps with simultaneous rows (`readiness().previewOk`). Otherwise a one-line message explains why.
- **Mapping action** (wizard step 4): `#sys-map-data`, «Mark these data channels as installed at the default points». It applies only to the conflicting channels, with the caveat "only if the file really comes from those sensors". On a saved detail page an «Edit the channel mapping» link is shown instead.
- **Warnings** use translated channel names with the CSV header in brackets, e.g. «Ps · давление на всасывании (suction_pressure_kpa)».
- **Saving incomplete configurations:** allowed. Only the site name, the system name and the pump and motor names are required, and the last two have defaults. Channels, ratings and the data source may stay empty or unknown, and the readiness cards show what is missing.
- **New test (14th):** 4 in the data / 0 mapped, no preview, mapping action present (EN/RU), translated warning names; after `mapDataChannels`, 4 mapped at default points with the preview shown. `node --test tests/*.mjs` → **123/123 pass**; bundles are byte-identical.

## Final visual polish (coordinator CUA at 1161)

- **Capability cards:** responsive grid (`repeat(auto-fit, minmax(240px, 1fr))`). Inside the saved detail's narrow evidence column they are **single-column**, and status pills wrap.
- **Missing prerequisites:** each card's list is in a `<details class="cap-missing">` «Still needed (N) / Ещё нужно (N)». It is open for the selected engineering question and collapsed for the others. All content is kept.
- **Sidebar badges:** they wrap inside the sidebar, and the CSV label is shortened to «Local CSV record / Локальная CSV-запись».
- **Step 3 channel table:** `table.sys-ch.stack` with `data-label` cells stacks into cards at ≤600 px, with full-width selects. The source panels already stack at ≤900 px.
- `node --test tests/*.mjs` → **123/123 pass**; bundles are byte-identical.
- **List badges (final QA):** the `.sys-item` cells have `min-width: 0`, wrap long words, and their status badges wrap (`white-space: normal`), so the source badge no longer spills into the third column. The system-name link gets `position: relative; z-index: 1` as a guard against overlapping neighbour content.
- **Link not navigating (reported in CUA):** the detail route was checked in Node for unmapped-challenge, CSV and network systems. The detail, the shell captions and the list render without exceptions, and the stored systems validate. The coordinator confirmed that direct navigation to `#/systems/SYS-001` works. No router cause was found, so routing was left unchanged; the most likely cause was the overflowing badge or a click quirk. Still to confirm: a native link click after reload.

## Readiness semantics (physics-aware, never a score or diagnosis)

- **Received** means the channel has readings in the loaded source **and** is configured as installed. A column for a channel configured as proposed or not present is a **mapping conflict**: it is warned about and not used. Proposed points or checkboxes never satisfy receipt.
- **Hydraulic:**
  - Pressure-rise review needs simultaneous Ps and Pd from installed sensors at the suction and discharge taps.
  - "Compare with the single design point" additionally needs simultaneous Q and a design flow and head.
  - A **verified pump curve is always still missing**, because one design point is not a curve.
  - Regime comparison needs **measured** speed; the rated rpm does not count.
- **Mechanical:** RMS vibration and temperature give **trends only**. Bearing fault inference always lists a waveform with known bandwidth and a reference as missing.
- **Energy:** needs simultaneous input power, Q, Ps and Pd with correct tap mapping. Even then the status is only **"potential review"**, because density and tap geometry are always listed as assumptions.
- `formalDiagnosis` is always false. Short recordings (< 1 h) and the challenge minute carry explicit notes.

## Storage

- `localStorage` key `rd-systems-v1`, `{version: 1, systems: [...]}`; IDs `SYS-001…` (never PUMP- or SIM-); at most 20 systems.
- `isValidSystem` checks the full shape: site, question, equipment, device, all 8 channels, and the source, including `sample.values` arrays with the right length and finite-or-null cells and a numeric window.
- Any invalid entry makes the whole store "corrupt": it is shown as unreadable and **never overwritten**. Quota and unavailable storage are reported.
- The challenge example and user data are kept separate from the benchmark engine; nothing here calls `sliceCase` or `explainCase`.

## Files

- **New:**
  - `web/js/systems-model.js` (pure model, validation, strict ISO-8601 parser `parseTimestamp`, CSV import, compact source, readiness, next step, store);
  - `web/js/systems-view.js` (list, wizard, detail, shell captions; EN/RU via `L()`);
  - `tests/web_systems.test.mjs` (14 tests);
  - `tests/fixtures/system-import/{synthetic-valid,invalid-time,no-timezone,invalid-number}.csv`, copied from the coordinator's QA fixtures and read by the test (no silent skip).
- **Changed:**
  - `web/js/app.js`: routes, nav-current mapping, route key with ID, bindings, the overview "+ Add system" button, systems shell captions;
  - `web/index.html`: nav entry `[data-nav="systems"]`;
  - `web/js/i18n.js`: `nav.systems` in EN and RU;
  - `web/styles.css`: Task021 block (stepper, form grid, sources, capability cards, list; stacks at ≤900 and ≤600 px).

## Tests

`node --test --test-timeout=30000 tests/*.mjs` → 122/122 at first delivery; **123/123** after the readiness-display correction above (109 baseline + 14). The new tests cover:
- required fields;
- positive and finite ratings, with blank meaning unknown;
- no credentials in endpoints;
- explicit, provenance-carrying prefill;
- the CSV template and missing readings;
- strict CSV errors: first column, unknown or duplicate header, timezone, impossible dates (02-30, 2025-02-29, month 13, 24:00, minute 60, offset > 14:00 or minute 60), out-of-order and duplicate time, non-finite numbers with line numbers, column count, size and row limits, empty file;
- leap day and offset handling;
- bounded storage (600 of 3000 rows stored, pair counts from the full file);
- readiness: proposed and checkbox channels never count; installed without data is not ready; challenge minute → pressure rise only; with the design point → single-point comparison while the curve is still missing; rated rpm is not speed context; mapping conflicts and tap mismatch; energy only "potential" and blocked by tap mismatch; RMS is a trend only; valve is not flow; network is configuration only;
- storage: SYS IDs, edit and reload, corrupt and schema-invalid stores refused and untouched, quota and unavailable storage;
- source isolation: the challenge source has only Ps/Pd/Q/n, with its origin and window;
- the fixture files;
- malformed stored source arrays rejected;
- DOM-free view renders of the empty list, all four wizard steps (stepper current step and key text), saved detail and the corrupt-store message in EN and RU, the draft preserved across steps and language, and the shell captions never calling user data benchmark data.

Frozen bundles are byte-identical (`8ffff27f…`, `168ab6cf…`, `51e24561…`, `47c0a0d5…`).

## CUA selectors and fixtures

| What | Selector |
|---|---|
| Add from the overview | `#ov-add-system` |
| Nav | `a[data-nav="systems"]` |
| List add / start from example | `#sys-add`, `#sys-start-example` |
| Stepper / step heading | `ol.stepper`, `#sys-step-h` |
| Back / Next / Save | `#sys-back`, `#sys-next`, `#sys-save` |
| Step 1 fields | `#sf-site-name`, `#sf-site-kind`, `#sf-name`, `input[name="sys-q"]` |
| Step 2 fields / prefill | `#sf-equipment-pump-designFlow` (etc.), `#sys-example` |
| Step 3 channels | `#sf-ch-<ps,pd,q,n,power,vib,temp,valve>` (status), `#sf-loc-<id>` (point), `[data-sys-set="hydraulic|mechanical|energy"]` |
| Sources | `#sys-load-challenge`, `#sys-csv` (file input), template link `a[download="retrofit-doctor-template.csv"]`, `#sf-device-endpoint`, `#sf-device-transport`, `#sys-use-network`, `#sys-clear-src` |
| Readiness | `.cap-card` (`#cap-hydraulic`, `#cap-mechanical`, `#cap-energy`), `.sys-next`, `.sys-warn`, mapping action `#sys-map-data`, preview `figure.sys-prev` |
| Detail edit | `#sys-edit` |

Fixtures for the browser file picker are in `tests/fixtures/system-import/`:
- `synthetic-valid.csv` loads; with Ps/Pd/Q/n/P installed at the default points it gives hydraulic "review possible" and energy "potential review".
- `invalid-time.csv` (2026-02-30), `no-timezone.csv` and `invalid-number.csv` (NaN) are rejected with line-numbered messages.

Mapping-conflict check: load `synthetic-valid.csv` with Ps set to "Not present" and see the warning listing `suction_pressure_kpa`.

## Limitations

- **Not rendered by me in a browser:** layout at 1440/1161/940/390, focus order and the file picker are for the coordinator's CUA.
- **Wizard drafts** live in memory until Save; reloading mid-wizard discards the draft.
- **Stored data:** the full CSV is not persisted (≤ 600 sampled rows plus counts). There is no export of a saved system, and no delete action in the UI (the model has `remove`).
- **Network:** configuration only; there is no real ingestion, simulation timer or connection.
- **No diagnosis:** no pump-curve input and no inference on the user's data; readiness only states what review the received data could support.
