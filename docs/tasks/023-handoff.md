# Task023 handoff — persistent deviation → smallest useful check → recorded result

Claude Code was the sole code writer. No Git, video, hardware, network, cloud, dependencies or changes to the frozen bundles. **No browser was run by me.** Items 1, 3 and 4 of the approved plan are implemented as a bounded slice. There is no uncertainty or ISO model and no new equipment type.

## 1. Duration and recurrence (`persistence()` in `web/js/hydraulic-analysis.js`)

- **Lookback:** derived only from closed minutes, using the existing per-minute `timeline()` (max 240 minutes before the cutoff). The timeline now also carries the minute Q/n medians, which are computed per minute and never copied from samples.
- **Run:** consecutive minutes back from the selected minute with the **same verdict direction** (below or above) **and a comparable regime**. The regime is the minute's Q within ±10 % and n within ±5 % of a **fixed anchor**, the selected minute, so slow drift cannot chain. Valve position is not used.
  - **Breaks:** no data, invalid, transient, incomplete, mixed, within band, direction change or regime change.
  - **Duration** counts supported minutes, not elapsed time across gaps.
  - **"Sustained"** means ≥ 3 such minutes, a fixed prototype rule.
  - If the run reaches the start of the lookback or of the record, the duration is shown as **"at least N min … onset unknown"**.
- **Status:**
  - An invalid current minute → run 0. It never inherits "sustained".
  - A within-band current minute → "earlier episodes are not counted".
- **Recurrence:** earlier episodes in the lookback with the same direction and regime as the current mismatch, listed with their start and duration (≥ if left-truncated).
- **Caveat line:** "Persistence is not proof of wear; a return to the range is not a repair."
- **Prefix-invariant:** each minute is computed from its own rows, and the lookback depends only on the cutoff.

## 2. Practical check card (`analysis-view.js`)

The "Next useful check" box is now a card with:
- **What:** the existing sentence, keeping the "Within this illustrative scenario…" prefix.
- **Numbered steps** with place, unit and time instructions. For a mismatch the steps are sequential: reference and drive rpm first (existing information) → temporary clamp-on Q on a straight line section (m³/h, UTC time) → calibrated test gauge ΔP at the pump suction/discharge taps (kPa), at the same time.
- **Answers** and **Changes the decision**.
- A **"Permanent sensor?"** disclosure: consider one only for a recurring unresolved need with an installation, cost and reliability review; no certification, price or payback is assessed.

Cards exist for:
- `verifyIndependently` (user-confirmed or illustrative mismatch);
- `verifyReferenceFirst` (unverified curve: documentation only);
- `temporaryFlow` and `readDriveSpeed` (drive/tachometer first);
- `repeatStable`;
- `continueRecording` (within band: no instrument justified).

Other next steps keep their one-sentence text.

**Main action** on a **saved** system: `#chk-open`, "Record check result / Внести результат проверки". In the wizard draft: "Save the system first to record a check result."

## 3. Follow-up checks (`web/js/check-loop.js`, pure)

- **Form** (`#chk-form`):
  - independent Q (m³/h, > 0) and/or ΔP at the pump taps (kPa, ≥ 0), at least one;
  - instrument/method (required);
  - measured time (strict ISO 8601 with a timezone; the default is the selected minute + 30 s);
  - agreement threshold (default 5 %, 0.1–50 %), labelled as a prototype agreement threshold, not combined instrument uncertainty;
  - same-regime acknowledgement (required), optional note (≤ 200);
  - origin: **User-entered measurement / Illustrative simulation**.
- **Illustrative fill buttons:** `#chk-fill-agree` and `#chk-fill-discrepant` appear only on illustrative-example systems. They fill the form and never save.
- **Baseline (`baseline()`):** installed readings of the **target minute only**, from the mapped full series.
  - **Blocked** if the minute's assessment is unsupported (no data, insufficient, incomplete, stopped, transient, mixed), if there are fewer than 3 ΔP rows or a span under 10 s, or if raw Q/n change by more than 10 % / 5 % (checked directly, because the ΔP-only and head-only paths return before the transient gate).
  - **Blocked** if **any** row in the minute is reversed (Pd < Ps), has negative Q, or has n ≤ 0.
  - Q baseline only from a mapped Q with ≥ 3 rows.
- **Comparison per channel:** agrees within the entered threshold / differs / not checked / not comparable (no installed baseline, or a zero baseline: ΔP ≤ 1 kPa, Q ≤ 0).
- **Revised explanation:** uses **only the latest-entered applied check** of the selected minute, as a whole. Values from different checks, times or origins are never combined, and the panel names the check's ID and origin.
  - Q differs → verify flow measurement and mapping (not proof that the installed sensor is broken; the temporary meter can be wrong).
  - ΔP differs → verify pressure channels, taps and reference.
  - Both differ → verify both.
  - Both agree with a below/above verdict → the gap is supported; **the cause is still unresolved**.
  - Both agree with a **within** verdict → no mismatch in this minute (not a statement about pump condition).
  - Both agree for **head-only / ΔP-only / outside-reference** minutes → "readings agree only", no curve conclusion; next, complete the context.
  - One agrees → that reading is corroborated and the other is unverified.
  - Nothing comparable → no revision.
- **Time honesty (`checksAt()`):** each recorded check is classified as:
  - `applied`: same target minute, same configuration fingerprint, and measured no later than the cutoff;
  - `deferred`: measured after the selected time; not used;
  - `otherMinute`: applies only to its own minute (a deliberate first-slice limitation);
  - `previousConfig`: recorded under a different fingerprint.

  The panel "Follow-up review (entered later)" (`#fu-panel`) shows the measured and entered timestamps and states that the checks were not available to the original analysis. The as-of status above is **unchanged**; `assessAt` output is identical with and without checks (tested). `enteredAt` is shown only and never used to hide retrospective checks.
- **Fingerprint:** FNV-1a over source identity plus a content checksum of the full series, the Ps/Pd/Q/n mapping and locations, the curve, the assumptions, and the equipment (provenance, pump, motor, valve).
- **Storage:** `system.checks` is append-only: IDs `CHK-001…`, at most 20 per system, earlier entries copied unchanged.
  - `isValidSystem` validates each check: shape, `targetMinute` = floor(`measuredAt`), sequential IDs, finite values, `regimeAck`. A malformed history → corrupt store, not overwritten.
  - Old saves without `checks` stay valid.
  - On quota, corrupt store or limit, the form shows an error and **no success**.
  - The wizard edit keeps the checks; a changed configuration marks them as previous configuration.

## UX polish after CUA

- **Duration:** one visible line with the status pill, the duration and the earlier-episode count, e.g. "Sustained deviation **12 min since 10:08 UTC** · no earlier episode". The regime thresholds, lookback window and 3-minute rule (with the "not proof of wear / not a repair" caveat) moved into the disclosure "How duration is counted / Как считается длительность".
- **Check card:** a short bold title (e.g. "Check the reading chain: curve and speed first, then independent Q and ΔP") replaces the long sentence that repeated the numbered steps. Each instruction now appears once (tested).
- **Wording:** both-agree now reads "supports the original observation of a head difference at this point (it does not prove it; the entered threshold is not a calibrated uncertainty)" / «поддерживает исходное наблюдение о расхождении … (но не доказывает его; заданный порог — не откалиброванная погрешность)». "Cause still unresolved" is kept. The outcome disclosure uses the same "supports, not proves" wording; no "gap is real" text remains.
- Tests updated: **148/148 pass**; bundles are byte-identical.

## Tests

`node --test --test-timeout=30000 tests/*.mjs` → **148/148 pass** (137 baseline + 11 in `tests/web_checkloop.test.mjs`). Frozen bundles are byte-identical. Coverage:

- **Duration rules:** the 3-minute rule; within, gap, transient and direction breaks; an invalid current minute; anchor drift (Q 100→116: run 3, not 5); regime break; recurrence counting only the same direction and regime.
- **Truncation and invariance:** lookback truncation (250 minutes → "at least 240", truncated); record-start onset unknown; prefix invariance with appended future minutes.
- **Validation:** check fields, strict time, threshold, regime, save first, no context, transient and the ΔP-only changing regime, span under 10 s.
- **Comparisons:** both agree / flow / ΔP / both differ / one agrees; missing installed Q → not comparable; zero ΔP baseline → not comparable; the latest whole check only (an older illustrative Q and a newer user ΔP → "ΔP agrees", origin user).
- **Time honesty:** `assessAt` unchanged after a check; telemetry untouched; applied / deferred / other minute; fingerprint changes for curve, mapping, density, pump name and series content.
- **Storage:** append-only, reload, entries unchanged, limit 20, malformed histories, old saves, quota.
- **lowHead demo numbers:** listed in the next section.
- **Agreement without a verdict:** no reference, no density or outside the curve → readings agree only; within → no mismatch; stopped, negative-flow and reversed rows block the baseline.
- **EN/RU renders:** sustained "12 min since 10:08 UTC", the card fields, record action only when saved, the follow-up panel, the illustrative origin, "cause is still unresolved", the persistence caveat, and no "healthy" or "confirmed wear".

## Manual scenario (CUA) and exact numbers

1. On `#/systems`, open `#sys-examples`, click `#sys-ex-lowHead`, then save (`#sys-save`), or open the saved lowHead system.
2. At the default cutoff 10:20, `#an-duration` shows "Sustained deviation · 12 min since 10:08 UTC", the regime (Q ±10 % of about 149.9 m³/h, n ±5 % of about 1480 rpm), no earlier episodes, and lookback 20 minutes.
3. Move `input[data-an-cutoff]` to 10:09: "Isolated deviation so far · 1 min since 10:08". At 10:08 or earlier: within; earlier episodes are not counted.
4. Back at 10:20, click `#chk-open`, then `#chk-fill-agree`: Q 149.9 m³/h, ΔP 284.8 kPa, threshold 5 %, origin Illustrative simulation.
   - Set "Measured at" (`#chk-measuredAt`) to `2026-03-02T10:19:30Z` (the default when the cutoff is 10:20).
   - Tick `#chk-regimeAck`, then click `#chk-save`.
   - Expected: `#fu-applied` shows installed medians of about 149.9 m³/h and about 284.8 kPa, both "agrees within threshold", and the revised explanation "supports the original observation of a head difference … does not prove it … cause is still unresolved". The status at the top is unchanged.
5. Move the cutoff to 10:15: "measured after the selected time: not used: 1", and no revision.
6. Reload: the check persists and is applied again at 10:20.
7. Record a second check with `#chk-fill-discrepant` (Q 128 → −14.6 %): flow differs → verify the flow measurement; the first check stays in `#fu-history`.
8. Check EN/RU and 390 px.

## Limitations

- **Scope of a check:** it applies only to its exact target minute. Episodes are not annotated as a whole.
- **Thresholds:** the agreement threshold is user-entered and the episode tolerances are fixed prototype values; neither is an uncertainty model.
- **History:** there is no delete or export of checks.
- **Configuration change:** a fingerprint change (including a re-import of the same file with any edit) marks earlier checks as previous configuration. They are retained and not applied while the fingerprint differs. Restoring exactly the original configuration makes them eligible again for their target minute.
- **Not rendered by me in a browser.**
