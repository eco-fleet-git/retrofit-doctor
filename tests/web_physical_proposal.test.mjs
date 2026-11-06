// Physical proposal and schematic copy (docs/tasks/006-review-round2.md).
//   node --test tests/web_physical_proposal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { physicalPackage, proposedChannels } from '../web/js/planner-content.js';
import { POINTS } from '../web/js/schematic.js';

const fleet = JSON.parse(readFileSync(new URL('../web/data/fleet.json', import.meta.url)));
const asset = (id) => fleet.assets.find((a) => a.assetId === id);
const draft = (choice, ids) => ({ choice, candidates: ids.map((id) => ({ id })) });
const row = (pkg, re) => pkg.rows.find((r) => re.test(r.element));

test('suction caveat: pressure rise is discharge minus suction, not head, not strainer/HX differential', () => {
  const c = POINTS.find((p) => p.id === 'suction').caveat;
  assert.match(c, /Discharge minus suction pressure is the measured pump pressure rise/);
  assert.match(c, /head/i);
  assert.match(c, /not a strainer or heat-exchanger differential pressure/);
  assert.doesNotMatch(c, /Suction minus discharge/);
});

test('PUMP-08 flow/head/power package reuses existing pressures and VFD power, proposes only flow, adds taps and head corrections', () => {
  const pkg = physicalPackage(asset('PUMP-08'), draft('instrument', ['flow_head_power']));
  assert.equal(pkg.noPermanentDevice, false);
  assert.equal(row(pkg, /^Flow meter/).status, 'Proposed (hypothesis)');
  for (const re of [/^Existing suction pressure/, /^Existing discharge pressure/, /^Existing motor input power/]) {
    assert.match(row(pkg, re).status, /^Present/, String(re));
  }
  assert.match(row(pkg, /^Existing motor input power/).element, /VFD/);
  assert.equal(row(pkg, /Power meter/), undefined, 'no new power meter for a VFD that already reports power');
  assert.match(row(pkg, /head corrections/).status, /survey/);
});

test('PUMP-03 (T0, fixed speed) package proposes the missing suction tap, flow and power meter; reuses discharge', () => {
  const pkg = physicalPackage(asset('PUMP-03'), draft('instrument', ['flow_head_power']));
  assert.equal(row(pkg, /^Suction pressure transmitter/).status, 'Proposed (hypothesis)');
  assert.equal(row(pkg, /^Flow meter/).status, 'Proposed (hypothesis)');
  assert.equal(row(pkg, /^Power meter/).status, 'Proposed (hypothesis)');
  assert.match(row(pkg, /^Existing discharge pressure/).status, /^Present/);
});

test('defer and existing-signals decisions propose no device and no markers, but keep stored hypotheses', () => {
  for (const choice of ['defer', 'existing']) {
    const d = draft(choice, ['flow_head_power', 'vibration']);
    assert.deepEqual(proposedChannels(asset('PUMP-03'), d), []);
    const pkg = physicalPackage(asset('PUMP-03'), d);
    assert.equal(pkg.noPermanentDevice, true);
    assert.equal(pkg.rows.some((r) => r.status.startsWith('Proposed (hypothesis)') && /meter|transmitter|sensor/i.test(r.element)), false);
    assert.deepEqual(pkg.unselected, ['flow_head_power', 'vibration']);
    assert.equal(d.candidates.length, 2);
  }
  assert.deepEqual(proposedChannels(asset('PUMP-03'), draft('instrument', ['flow_head_power'])).sort(), ['flow_m3_h', 'motor_power_kw', 'suction_pressure_kpa']);
});
