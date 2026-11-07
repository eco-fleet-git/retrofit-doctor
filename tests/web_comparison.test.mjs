// Task015 diagnosis comparison: bundle provenance/split boundary, as-of gating and source-specific wording.
//   node --test tests/web_comparison.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sliceCase, sliceCaseLabel, explainCase } from '../web/js/comparison.js';

const root = new URL('../', import.meta.url);
const raw = (p) => readFileSync(new URL(p, root));
const sha = (p) => createHash('sha256').update(raw(p)).digest('hex');
const bundleText = raw('web/data/diagnosis-comparison.json').toString();
const bundle = JSON.parse(bundleText);
const fleet = JSON.parse(raw('web/data/fleet.json'));
const asset = (id) => fleet.assets.find((a) => a.assetId === id);
const kase = (id) => bundle.cases.find((c) => c.caseId === id);
const at = (s) => Date.parse(s);
const explainAt = (id, clock, c = kase(id)) => explainCase(sliceCase(c, at(clock)), asset(c.assetId));
const text = (o) => JSON.stringify(o);

test('bundle: every source file hash matches the sealed artifacts on disk; prediction hashes match provenance', () => {
  for (const [p, h] of Object.entries(bundle.provenance.filesRead)) assert.equal(sha(p), h, p);
  const t = bundle.provenance.train; const v = bundle.provenance.validation;
  assert.equal(sha(`${t.runDir}/predictions_Z995.csv`), t.predictionSha256.Z995);
  assert.equal(sha(`${v.runDir}/predictions_Z995.csv`), v.predictionSha256.Z995);
  assert.equal(t.completed.selected, 'Z995');
  assert.equal(bundle.provenance.selectedCandidate, 'Z995');
  for (const f of ['per_event_B1.csv', 'per_event_Z995.csv']) assert.ok(`${t.runDir}/${f}` in bundle.provenance.filesRead, f);
  assert.ok(`${v.runDir}/event_transitions.csv` in bundle.provenance.filesRead);
});

test('bundle: train/validation only, no blind-test asset or test file anywhere', () => {
  assert.doesNotMatch(bundleText, /PUMP-1[0-2]/);
  assert.ok(Object.keys(bundle.provenance.filesRead).every((p) => !/test|PUMP-1[0-2]/i.test(p)));
  for (const c of bundle.cases) assert.ok(['train', 'validation'].includes(c.split), c.caseId);
  assert.deepEqual(bundle.cases.map((c) => `${c.assetId}@${c.alertUtc}`), ['PUMP-04@2025-06-18T22:06:00Z', 'PUMP-02@2025-12-07T10:32:00Z', 'PUMP-08@2025-09-11T20:47:00Z', 'PUMP-01@2025-08-12T19:27:00Z']);
  assert.equal(bundle.scorecard.train.events.length, 26);
  assert.equal(bundle.scorecard.validation.events.length, 9);
  assert.ok(bundle.scorecard.train.events.every((e) => /^PUMP-0[1-7]$/.test(e.assetId)));
  assert.ok(bundle.scorecard.validation.events.every((e) => /^PUMP-0[89]$/.test(e.assetId)));
});

test('baseline replay and fleet bytes are unchanged (hashes of the files at release 3a3db0c / HEAD d3ae0a2)', () => {
  assert.equal(sha('web/data/replay-PUMP-08.json'), '51e2456168480ad24d6d137b6e9898f4f72de34799483ac24ff543c3bd30c80f');
  assert.equal(sha('web/data/replay-PUMP-09.json'), '47c0a0d52816f1e7ca1407fe8af553d40db40d3c8509443a7b9d22e5340edfb3');
  assert.equal(sha('web/data/fleet.json'), '168ab6cfa14c797e83d932fadcd1da28e096d3c547d0f9a9799cfd3678279724');
});

test('scorecard: train and validation separate; metrics from the sealed comparison files', () => {
  const s = bundle.scorecard;
  assert.deepEqual([s.train.b1.type_correct, s.train.z995.type_correct, s.train.b1.sensor_type_and_channel, s.train.z995.sensor_type_and_channel], ['8', '10', '3', '4']);
  assert.deepEqual([s.train.b1.detected, s.train.z995.detected, s.train.z995.false_plus_excess, s.train.z995.wrong_specific_first], ['18', '18', '6', '7']);
  assert.deepEqual([s.validation.b1.type_correct, s.validation.z995.type_correct, s.validation.z995.detected, s.validation.z995.sensor_type_and_channel], ['4', '5', '8', '2']);
  assert.equal(s.train.changedAlerts.length, 2);
  assert.equal(s.validation.changedAlerts.length, 3);
  assert.deepEqual(s.validation.events.filter((e) => e.changed).map((e) => e.eventId), ['PUMP-08-E02']);
  const e04 = s.validation.events.find((e) => e.eventId === 'PUMP-08-E04');
  assert.equal(e04.b1.detected || e04.z995.detected, false);
});

test('raw minute: 60 rows strictly inside [22:05:00, 22:06:00); the 22:06:00 row is excluded', () => {
  const r = kase('pump04-train').rawMinute;
  assert.equal(r.t.length, 60);
  assert.equal(r.t[0], '2025-06-18T22:05:00Z');
  assert.equal(r.t.at(-1), '2025-06-18T22:05:59Z');
  assert.ok(!r.t.includes('2025-06-18T22:06:00Z'));
  assert.equal(r.recomputedStdE_kpa, 7.326309667);
});

test('one second before the alert: no result, statistics, raw rows or labels; explanation is pending', () => {
  for (const c of bundle.cases) {
    const s = sliceCase(c, at(c.alertUtc) - 1000);
    assert.equal(s.available, false);
    for (const k of ['b1', 'z995', 'rawMinute', 'label']) assert.equal(s[k], undefined, `${c.caseId}.${k}`);
    const e = explainCase(s, asset(c.assetId));
    assert.equal(e.kind, 'pending');
    assert.doesNotMatch(text(e), /MISALIGNMENT|BEARING|NOISE|CALIBRATION|misalignment|bearing wear|noise|1431|7\.326|tail/);
  }
  assert.match(explainAt('pump02-train', '2025-12-07T10:31:59Z').snapshot, /PUMP-02-S035\) completed at 2025-12-07 07:29:50 UTC/);
  assert.equal(explainAt('pump02-train', '2025-12-07T07:29:49Z').snapshot, null);
});

test('at the alert the explanation appears; later clocks keep it except the age/timing text', () => {
  for (const c of bundle.cases) {
    const now = explainAt(c.caseId, c.alertUtc);
    assert.equal(now.available, true);
    const later = explainAt(c.caseId, '2026-01-31T00:00:00Z');
    const strip = (e) => ({ ...e, timing: null, snapshot: e.snapshot ? { ...e.snapshot, ageNow: null } : undefined });
    assert.deepEqual(strip(later), strip(now), c.caseId);
  }
});

test('labels never reach the explanation; the overlay is gated by onset and withholds a later end', () => {
  const c = kase('pump04-train');
  const mutated = structuredClone(c); mutated.label = { ...mutated.label, fault_type: 'BEARING_WEAR', sensor_tag: 'suction_pressure_kpa' };
  assert.deepEqual(explainAt(c.caseId, c.alertUtc, mutated), explainAt(c.caseId, c.alertUtc));
  assert.equal(text(sliceCase(c, at(c.alertUtc))).includes('PUMP-04-E03'), false);
  assert.equal(sliceCaseLabel(c, at('2025-06-18T21:13:01Z')), null);
  assert.equal(sliceCaseLabel(c, at(c.alertUtc) - 1000), null, 'onset 21:13:02 is earlier, but the case is gated until its alert');
  for (const k of bundle.cases) assert.equal(sliceCaseLabel(k, at(k.alertUtc) - 1000), null, k.caseId);
  const l = sliceCaseLabel(c, at(c.alertUtc));
  assert.equal(l.fault_type, 'SENSOR_NOISE_SPIKES');
  assert.equal(l.end_utc, null);
  assert.equal(l.endWithheld, true);
});

test('residual (PUMP-04): source-specific headline from the stored source channel, not hardcoded flow', () => {
  const e = explainAt('pump04-train', '2025-06-18T22:06:00Z');
  assert.equal(e.kind, 'residual');
  assert.match(e.headline, /^The flow signal varies more than the pump-equation check can explain; inspect the flow measurement before assuming a mechanical fault\.$/);
  assert.deepEqual([e.before.label, e.after.label], ['sensor calibration shift on winding temperature', 'sensor noise spikes on flow']);
  assert.match(e.derived.join(' '), /7\.326 kPa .* 3\.454 kPa/);
  assert.match(e.derived.join(' '), /None of the 1431 .*0\.000698 ≤ rule limit 0\.005.*not a p-value or probability/);
  assert.match(e.derived.join(' '), /0\.763 .*margin 0\.013, narrow/);
  assert.equal(e.measured.length, 4);
  assert.equal(e.nextCheck.text, 'Inspect synchronized traces and check flow with an independent instrument before replacement.');
  assert.equal(e.technical.z995.action, 'Inspect synchronized traces and check flow_m3_h with an independent instrument before replacement.');
  assert.match(e.timing, /^Closed minute 2025-06-18 22:05–22:06 UTC/);
  assert.doesNotMatch(text({ ...e, technical: null }), /deviat(es|ing) alone|\|z\| < 2|coupled/);
  const c = structuredClone(kase('pump04-train')); c.z995.ruleDetail.source = 'discharge_pressure_kpa';
  assert.match(explainAt('pump04-train', '2025-06-18T22:06:00Z', c).headline, /^The discharge pressure signal/);
});

test('waveform (PUMP-02, PUMP-08): consistent-with wording, snapshot age stated, discriminating next check', () => {
  const m = explainAt('pump02-train', '2025-12-07T10:32:00Z');
  assert.equal(m.kind, 'waveform');
  assert.match(m.headline, /consistent with misalignment/);
  assert.equal(m.snapshot.ageAtAlert, '3 h 02 min 10 s');
  assert.match(m.features.join(' '), /about 2\.7× .*2×\/1× amplitude ratio 2\.48/);
  assert.match(m.nextCheck.text, /alignment.*axial or phase/);
  assert.equal(m.hydraulic.outcome, 'abstained');
  const b = explainAt('pump08-validation', '2025-09-11T20:47:00Z');
  assert.match(b.headline, /consistent with bearing wear/);
  assert.equal(b.before.label, 'cause unresolved (UNKNOWN)');
  assert.match(b.technical.b1.evidence, /fluid_temp_c/);
  assert.match(b.timing, /^Closed minute 2025-09-11 20:46–20:47 UTC/);
  assert.equal(b.snapshot.ageAtAlert, '3 h 39 min 37 s');
  assert.match(b.features.join(' '), /4\.8× .*2\.6×/);
  assert.ok(b.gaps.some((g) => g.kind === 'not-installed' && /Flow/.test(g.text) && /not a healthy result/.test(g.text)));
  assert.doesNotMatch(text({ ...b, technical: null }), /confirmed bearing|plan replacement/i);
  const later = explainAt('pump08-validation', '2025-09-12T20:47:00Z');
  assert.equal(later.snapshot.ageAtAlert, '3 h 39 min 37 s');
  assert.equal(later.snapshot.ageNow, '27 h 39 min 37 s');
});

test('unsupported (PUMP-01): names the missing flow input, keeps B1, not healthy, links the retrofit planner', () => {
  const e = explainAt('pump01-train', '2025-08-12T19:27:00Z');
  assert.equal(e.kind, 'unsupported');
  assert.equal(e.changed, false);
  assert.match(e.headline, /flow is not installed on this pump.*sensor calibration shift on suction pressure.*kept unchanged/);
  assert.match(e.caveat, /neither a healthy result nor a proven sensor failure/);
  assert.equal(e.capability.href, '#/pumps/PUMP-01/retrofit');
  assert.match(e.capability.text, /not a demonstrated benefit/);
  assert.match(e.capability.text, /would supply the missing input; the remaining applicability checks would still need to pass/);
  assert.doesNotMatch(e.capability.text, /make this check applicable/);
  assert.match(e.w1Note, /not applied/);
  assert.equal(e.nextCheck.text, 'Verify suction pressure against a reference gauge.');
});

test('scores and shares are never presented as probability, confidence percentage or p-value claims', () => {
  for (const c of bundle.cases) {
    const e = explainAt(c.caseId, c.alertUtc);
    const t = text({ ...e, technical: { score: e.technical.score } });
    assert.doesNotMatch(t, /%|probability of|p-value of|likelihood|confidence of/);
    assert.match(e.technical.score, /not a confidence in the new cause and not a probability/);
  }
});

test('future-provenance mutation: a snapshot completing after the alert is rejected at every later clock', () => {
  for (const id of ['pump02-train', 'pump08-validation']) {
    const c = structuredClone(kase(id));
    const late = new Date(at(c.alertUtc) + 1000).toISOString().replace('.000Z', '+00:00');
    c.z995.waveform.wf_complete_utc = late; c.z995.waveform.wf_age_s = '-1.0';
    for (const clock of [c.alertUtc, '2026-03-01T00:00:00Z']) {
      const s = sliceCase(c, at(clock));
      assert.equal(s.available, false, `${id} ${clock}`);
      assert.equal(s.z995, undefined);
      const e = explainCase(s, asset(c.assetId));
      assert.equal(e.kind, 'rejected');
      assert.match(e.text, /completes after the alert time/);
      assert.doesNotMatch(text(e), /consistent with|misalignment|bearing wear/i);
    }
    // Before the alert the snapshot is not even announced, because it has not completed by the clock.
    assert.equal(explainAt(id, new Date(at(c.alertUtc) - 1000).toISOString(), c).snapshot, null);
  }
});

test('future-provenance mutation: a stored age that disagrees with the completion time is rejected', () => {
  const c = structuredClone(kase('pump02-train'));
  c.z995.waveform.wf_age_s = '60.0';
  assert.equal(explainAt(c.caseId, c.alertUtc, c).kind, 'rejected');
});

test('future-provenance mutation: a raw row at or after the minute end is rejected, not charted', () => {
  const c = structuredClone(kase('pump04-train'));
  c.rawMinute.t[59] = '2025-06-18T22:06:00Z';
  const s = sliceCase(c, at(c.alertUtc));
  assert.equal(s.rawMinute, undefined);
  assert.match(explainCase(s, asset('PUMP-04')).text, /raw rows outside the closed alert minute/);
});

test('helper limits: other stored fields are trusted as exported (no general malformed-data immunity)', () => {
  // The exporter asserts the residual statistics against the raw minute; the browser helper only enforces
  // completion-time and minute-boundary provenance. This test documents that boundary rather than claiming more.
  const c = structuredClone(kase('pump04-train'));
  c.z995.ruleDetail.minute.std_E_kpa = 99;
  assert.match(explainAt(c.caseId, c.alertUtc, c).derived[0], /99\.000 kPa/);
});
