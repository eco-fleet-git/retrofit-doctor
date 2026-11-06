// As-of replay boundary (web/js/replay.js). Run after scripts/export_demo.py:
//   node --test tests/web_replay.test.mjs
// Expected values are literals from docs/ux/STATES_AND_ACCEPTANCE.md (A05–A12). Objects named
// `fixture*` are hand-built UI test inputs, not benchmark observations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  sliceReplay, sliceLabels, referenceState, channelFreshness, diagnosticState, parseUtc,
} from '../web/js/replay.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../web/data/replay-${id}.json`, import.meta.url)));
const p08 = load('PUMP-08');
const p09 = load('PUMP-09');
const at = (s) => Date.parse(s);

test('A05: strainer alert absent at 12:37, verbatim at 12:38', () => {
  const before = sliceReplay(p08, at('2025-09-10T12:37:00Z'));
  assert.equal(before.alerts.some((a) => a.alert_time_utc === '2025-09-10T12:38:00Z'), false);
  const after = sliceReplay(p08, at('2025-09-10T12:38:00Z'));
  const d = diagnosticState(after);
  assert.equal(d.alert.alert_time_utc, '2025-09-10T12:38:00Z');
  assert.equal(d.alert.fault_type, 'SUCTION_STRAINER_CLOGGING');
  assert.equal(d.alert.confidence, '0.5587501525878906');
  assert.equal(d.alert.evidence, 'B1 mode-aware z: suction_pressure_kpa z=-6.7');
});

test('A06: a window becomes visible only at its end', () => {
  assert.equal(sliceReplay(p08, at('2025-09-08T00:00:59Z')).visibleMinutes, 0);
  assert.equal(sliceReplay(p08, at('2025-09-08T00:01:00Z')).visibleMinutes, 1);
  assert.equal(sliceReplay(p08, at('2025-09-10T12:00:59Z')).rows.packets.length,
    sliceReplay(p08, at('2025-09-10T12:01:00Z')).rows.packets.length - 1);
});

test('A07: reference boundary waits for the first post-reference minute', () => {
  const at24 = referenceState(sliceReplay(p08, at('2025-09-09T00:00:00Z')));
  assert.equal(at24.state, 'COLLECTING_REFERENCE');
  assert.equal(at24.label, 'Reference window complete');
  const next = sliceReplay(p08, at('2025-09-09T00:01:00Z'));
  const rs = referenceState(next);
  assert.notEqual(rs.label, 'Reference window complete');
  assert.equal(rs.state, next.rows.referenceStatus[1440]);
  for (const ch of Object.values(next.channels)) if (ch.z) assert.ok(ch.z.slice(0, 1440).every((v) => v === null));
});

test('A08: insufficient reference is shown as such, not healthy', () => {
  const fixtureInsufficient = {
    ...p08,
    rows: { ...p08.rows, referenceStatus: p08.rows.referenceStatus.map((s, i) => (i < 1440 ? s : 'INSUFFICIENT_REFERENCE')),
      referenceReadyChannels: p08.rows.referenceReadyChannels.map(() => 0) },
  };
  const rs = referenceState(sliceReplay(fixtureInsufficient, at('2025-09-10T00:00:00Z')));
  assert.equal(rs.state, 'INSUFFICIENT_REFERENCE');
  assert.equal(rs.label, 'Insufficient reference');
});

test('A10/A11: freshness uses native cadence; missing vs not instrumented stay distinct', () => {
  const fixtureView = {
    asOfMs: at('2025-01-01T00:10:00Z'), gridStartMs: at('2025-01-01T00:00:00Z'), visibleMinutes: 10,
    channels: {
      vib: { nativeUpdateSeconds: 300, mean: [null, null, null, null, null, 1.2, null, null, null, null], z: null },
      old: { nativeUpdateSeconds: 300, mean: [0.9, null, null, null, null, null, null, null, null, null], z: null },
      empty: { nativeUpdateSeconds: 1, mean: Array(10).fill(null), z: null },
    },
  };
  const vib = channelFreshness(fixtureView, 'vib', true); // sample in window 00:05–00:06 → 4–5 min old
  assert.equal(vib.state, 'WITHIN_CADENCE');
  assert.equal(vib.ageMinMs, 4 * 60_000);
  assert.equal(channelFreshness(fixtureView, 'old', true).state, 'UPDATE_OVERDUE');
  assert.equal(channelFreshness(fixtureView, 'empty', true).label, 'No measurement available');
  assert.equal(channelFreshness(fixtureView, 'flow_m3_h', false).label, 'Not instrumented');
});

test('A12: no row, alert or label later than the clock survives slicing, including seeking backward', () => {
  for (const replay of [p08, p09]) {
    const start = parseUtc(replay.gridStartUtc);
    for (const hours of [0, 5, 23.99, 24, 30.5, 60, 100, 167.9, 168]) {
      const asOf = start + hours * 3_600_000;
      const view = sliceReplay(replay, asOf);
      const allowed = Math.floor((asOf - start) / 60_000);
      assert.ok(view.rows.packets.length <= allowed);
      for (const ch of Object.values(view.channels)) {
        assert.equal(ch.mean.length, view.visibleMinutes);
        if (ch.z) assert.equal(ch.z.length, view.visibleMinutes);
      }
      assert.ok(view.alerts.every((a) => parseUtc(a.alert_time_utc) <= asOf));
      for (const e of sliceLabels(replay, asOf)) {
        for (const key of ['onset_utc', 'detectable_utc', 'action_deadline_utc', 'end_utc']) {
          if (e[key] != null) assert.ok(parseUtc(e[key]) <= asOf, `${e.event_id} ${key}`);
        }
      }
    }
  }
  const late = sliceReplay(p08, at('2025-09-14T12:00:00Z'));
  const early = sliceReplay(p08, at('2025-09-10T12:37:00Z'));
  assert.ok(late.alerts.length > early.alerts.length);
  assert.equal(early.alerts.length, 0);
  assert.equal(p08.alerts.length, 6, 'slicing must not mutate the source bundle');
});

test('A13: labels are a separate projection and do not alter the replay view', () => {
  const asOf = at('2025-09-11T06:00:00Z'); // E01 ends 2025-09-11T10:51:15Z, after this clock
  const before = JSON.stringify(sliceReplay(p08, asOf));
  const labels = sliceLabels(p08, asOf);
  assert.deepEqual(labels.map((e) => e.event_id), ['PUMP-08-E02', 'PUMP-08-E01']);
  assert.equal(labels[1].end_utc, null);
  assert.equal(labels[1].endWithheld, true);
  assert.equal(JSON.stringify(sliceReplay(p08, asOf)), before);
});
