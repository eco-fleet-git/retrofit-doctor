// Selected-alert explanation (web/js/explain.js), docs/tasks/009-diagnostic-clarity.md.
// Inputs are only the as-of slice, the selected alert and the static passport. Expected values are
// literals from the task packet and the committed bundle.
//   node --test tests/web_explain.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sliceReplay } from '../web/js/replay.js';
import { explainAlert } from '../web/js/explain.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url)));
const fleet = load('fleet.json');
const asset = (id) => fleet.assets.find((a) => a.assetId === id);
const p08 = load('replay-PUMP-08.json');
const p09 = load('replay-PUMP-09.json');
const at = (s) => Date.parse(s);
const alertAt = (view, t) => view.alerts.find((a) => a.alert_time_utc === t);
const explainAt = (replay, id, clock, alertTime) => {
  const view = sliceReplay(replay, at(clock));
  return explainAlert(view, alertAt(view, alertTime), asset(id));
};
const allText = (e) => JSON.stringify(e);

test('PUMP-08 12:38: suction below reference, suction restriction suggested but unconfirmed', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-10T12:38:00Z', '2025-09-10T12:38:00Z');
  assert.equal(e.kind, 'machine');
  assert.match(e.hypothesis, /suction/i);
  assert.match(e.hypothesis, /unconfirmed/i);
  const first = e.observations[0];
  assert.deepEqual([first.channelId, first.value, first.z, first.direction, first.named], ['suction_pressure_kpa', 35.3067, -6.71, 'below', true]);
  assert.equal(first.unit, 'kPa(g)');
});

test('PUMP-08 12:38: flow is not installed; wireless vibration is installed but has no sample in that minute', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-10T12:38:00Z', '2025-09-10T12:38:00Z');
  const gap = (c) => e.gaps.find((g) => g.channelId === c);
  assert.equal(gap('flow_m3_h').kind, 'not-installed');
  assert.equal(gap('vibration_accel_rms_g').kind, 'no-sample');
  assert.match(gap('vibration_accel_rms_g').text, /installed/i);
  assert.match(gap('vibration_accel_rms_g').text, /5 min/);
  assert.doesNotMatch(allText(e), /no vibration|rules out|ruled out/i);
  assert.match(allText(e), /not certified healthy|not verified healthy/i);
});

test('future rows and labels cannot change the explanation of an already issued alert', () => {
  const now = explainAt(p08, 'PUMP-08', '2025-09-10T12:38:00Z', '2025-09-10T12:38:00Z');
  const fixtureFuture = structuredClone(p08);
  for (const ch of Object.values(fixtureFuture.channels)) for (let i = 3638; i < ch.mean.length; i += 1) { if (ch.mean[i] != null) ch.mean[i] += 1000; }
  fixtureFuture.evaluationLabels.events = [];
  const later = explainAt(fixtureFuture, 'PUMP-08', '2025-09-14T12:00:00Z', '2025-09-10T12:38:00Z');
  for (const key of ['kind', 'hypothesis', 'observations', 'gaps', 'alternatives', 'nextCheck']) assert.deepEqual(later[key], now[key], key);
});

test('an older selected alert at a later clock uses its own minute and states its age', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-11T02:00:00Z', '2025-09-10T12:38:00Z');
  assert.equal(e.observations[0].value, 35.3067);
  assert.equal(e.issuedMs, at('2025-09-10T12:38:00Z'));
  assert.match(e.timing, /13 h 22 min before the replay time/);
});

test('UNKNOWN: unresolved, still has observations and a next check', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-11T21:00:00Z', '2025-09-11T20:47:00Z');
  assert.equal(e.kind, 'unknown');
  assert.match(e.hypothesis, /unresolved/i);
  assert.equal(e.observations[0].channelId, 'fluid_temp_c');
  assert.ok(e.nextCheck.text.length > 0 && e.nextCheck.reason.length > 0);
});

test('COMMUNICATION_LOSS: missing packets observed, gateway/network only hypotheses, no pump-trip claim', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-13T00:30:00Z', '2025-09-13T00:07:00Z');
  assert.equal(e.kind, 'gap');
  assert.match(e.observations[0].text, /telemetry rows/i);
  assert.match(e.hypothesis, /hypothes/i);
  assert.match(allText(e), /does not show that the pump stopped/i);
  assert.doesNotMatch(allText(e), /pump (has )?tripped/i);
});

test('PUMP-09 calibration-shift warning keeps the named vibration channel and never the retrospective label', () => {
  const e = explainAt(p09, 'PUMP-09', '2026-02-11T07:00:00Z', '2026-02-11T06:28:00Z');
  assert.equal(e.kind, 'sensor');
  assert.equal(e.observations[0].channelId, 'vibration_rms_mm_s');
  assert.match(e.hypothesis, /vibration velocity/i);
  assert.doesNotMatch(allText(e), /motor_current|SENSOR_DRIFT|drift on/i);
  assert.match(e.hypothesis, /does not confirm/i);
});

test('SENSOR_STUCK: cadence and constant-process alternatives; transmitter failure not confirmed', () => {
  const e = explainAt(p09, 'PUMP-09', '2026-02-12T01:00:00Z', '2026-02-12T00:20:00Z');
  assert.equal(e.kind, 'stuck');
  assert.ok(e.alternatives.some((a) => /cadence|update/i.test(a)));
  assert.ok(e.alternatives.some((a) => /constant process/i.test(a)));
  assert.doesNotMatch(allText(e), /transmitter (has )?failed|failure confirmed/i);
});

test('the uncalibrated score is never presented as a probability or percentage', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-10T12:38:00Z', '2025-09-10T12:38:00Z');
  assert.match(e.technical.score, /uncalibrated/i);
  assert.doesNotMatch(allText(e), /%|probability of|likelihood/i);
  assert.equal(e.technical.evidence, 'B1 mode-aware z: suction_pressure_kpa z=-6.7');
  assert.equal(e.technical.action, 'Inspect / clean suction strainer.');
});

test('measurements absent from every benchmark tier are distinct from channels missing on this pump', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-10T12:38:00Z', '2025-09-10T12:38:00Z');
  const dp = e.gaps.find((g) => /strainer/i.test(g.label));
  assert.equal(dp.kind, 'not-in-benchmark');
  assert.equal(e.gaps.find((g) => g.channelId === 'flow_m3_h').kind, 'not-installed');
  assert.match(e.headline, /^Suction pressure below this pump's reference; the rule suggests a suction restriction, but the cause is unconfirmed\.$/);
});

test('SENSOR_STUCK observation states the frozen report, not only the minute mean', () => {
  const e = explainAt(p09, 'PUMP-09', '2026-02-12T01:00:00Z', '2026-02-12T00:20:00Z');
  assert.equal(e.observations[0].channelId, 'bearing_temp_c');
  assert.match(e.observations[0].text, /reported frozen by the detector/);
});

// Review round 1 (docs/tasks/009-review-round1.md) boundary fixtures. Fixtures modify only a cloned view.
const viewAt = (replay, clock) => sliceReplay(replay, at(clock));
const idx = (view, t) => Math.round((at(t) - view.gridStartMs) / 60000) - 1;

test('COMMUNICATION_LOSS with partial packets: incomplete coverage, not "no channel values"', () => {
  const view = structuredClone(viewAt(p08, '2025-09-13T00:30:00Z'));
  const i = idx(view, '2025-09-13T00:07:00Z');
  for (let j = i - 14; j <= i; j += 1) view.rows.packets[j] = 12;
  view.channels.suction_pressure_kpa.mean[i] = 40;
  const e = explainAlert(view, alertAt(view, '2025-09-13T00:07:00Z'), asset('PUMP-08'));
  assert.match(e.observations[0].text, /Only 12 of 60 expected telemetry rows/);
  assert.equal(e.gaps[0].kind, 'partial');
  assert.match(e.gaps[0].text, /incomplete/);
  assert.match(e.gaps[0].text, /1 of \d+ channels have a value/);
  assert.doesNotMatch(allText(e), /No channel values exist/);
});

test('COMMUNICATION_LOSS with zero rows: no values in the zero-row minutes', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-13T00:30:00Z', '2025-09-13T00:07:00Z');
  assert.match(e.observations[0].text, /^No telemetry rows/);
  assert.equal(e.gaps[0].kind, 'no-rows');
});

test('measured value without z is "reference comparison unavailable", distinct from no sample and not installed', () => {
  for (const drop of ['entry', 'array']) {
    const view = structuredClone(viewAt(p08, '2025-09-10T12:38:00Z'));
    const i = idx(view, '2025-09-10T12:38:00Z');
    if (drop === 'entry') view.channels.suction_pressure_kpa.z[i] = null; else view.channels.suction_pressure_kpa.z = null;
    const e = explainAlert(view, alertAt(view, '2025-09-10T12:38:00Z'), asset('PUMP-08'));
    const g = e.gaps.find((x) => x.channelId === 'suction_pressure_kpa');
    assert.equal(g.kind, 'no-z', drop);
    assert.match(g.text, /measured 35\.3067 kPa\(g\).*reference comparison is unavailable/);
    assert.doesNotMatch(allText(e), /operating mode\)/);
    assert.equal(e.observations[0].value, 35.3067);
    assert.equal(e.observations[0].z, null);
    assert.match(e.observations[0].text, /reference comparison unavailable/);
    assert.equal(e.headline, "Suction pressure: reference comparison unavailable at the alert minute; the detector's rule suggests a suction restriction, but the cause is unconfirmed.");
    assert.doesNotMatch(e.headline, /away from|below|above/);
    assert.equal(e.gaps.find((x) => x.channelId === 'vibration_accel_rms_g').kind, 'no-sample');
    assert.equal(e.gaps.find((x) => x.channelId === 'flow_m3_h').kind, 'not-installed');
  }
});

test('sensor rule attribution: coupled-channel claim is the detector rule, not an observation here', () => {
  const e = explainAt(p09, 'PUMP-09', '2026-02-11T07:00:00Z', '2026-02-11T06:28:00Z');
  assert.match(e.hypothesis, /detector's source evidence reports/);
  assert.match(e.hypothesis, /not evidence of normal behaviour/);
});

test('next-check reasons are proposed checks, not conclusive proof', () => {
  for (const [r, id, c, t] of [[p08, 'PUMP-08', '2025-09-10T12:38:00Z', '2025-09-10T12:38:00Z'], [p09, 'PUMP-09', '2026-02-12T01:00:00Z', '2026-02-12T00:20:00Z']]) {
    const reason = explainAt(r, id, c, t).nextCheck.reason;
    assert.match(reason, /^Proposed check\./);
    assert.doesNotMatch(reason, /separates|shows whether|proves/);
  }
});

test('an alert beyond the as-of clock is returned as unavailable, not explained', () => {
  const view = viewAt(p08, '2025-09-10T12:37:00Z');
  const future = p08.alerts.find((a) => a.alert_time_utc === '2025-09-10T12:38:00Z');
  const e = explainAlert(view, future, asset('PUMP-08'));
  assert.equal(e.available, false);
  assert.equal(e.kind, 'unavailable');
  assert.equal(e.observations, undefined);
});

test('gap summary: categories and counts derived from the gap list', () => {
  const e = explainAt(p08, 'PUMP-08', '2025-09-10T12:38:00Z', '2025-09-10T12:38:00Z');
  const by = (k) => e.gapSummary.find((g) => g.kind === k);
  assert.deepEqual(by('not-installed').channelIds, ['flow_m3_h']);
  assert.equal(by('not-in-benchmark').count, 1);
  const ns = by('no-sample');
  assert.equal(ns.count, e.gaps.filter((g) => g.kind === 'no-sample').length);
  assert.equal(ns.count, 4);
  assert.match(ns.text, /native update every 5 min/);
  assert.match(ns.text, /does not establish normal behaviour/);
  assert.match(e.referenceCaveat, /not verified healthy/);
});

test('sensor headline is attributed to the detector', () => {
  const e = explainAt(p09, 'PUMP-09', '2026-02-11T07:00:00Z', '2026-02-11T06:28:00Z');
  assert.match(e.headline, /^The detector reports Vibration velocity RMS deviating alone/);
});
