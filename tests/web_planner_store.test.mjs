// Per-pump planner drafts (web/js/planner-store.js): persistence, failure, migration, readiness.
//   node --test tests/web_planner_store.test.mjs
// `fixture*` storages are hand-built test doubles of the Web Storage interface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore, newDraft, reviewReadiness, addCandidate, removeCandidate, DRAFT_VERSION } from '../web/js/planner-store.js';

function fixtureStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => map.delete(k), map };
}
const NOW = '2026-11-06T22:00:00.000Z';

test('ENG-14: drafts are saved and reloaded independently per pump with dates and notes', () => {
  const storage = fixtureStorage();
  const store = createDraftStore(storage);
  const a = newDraft('PUMP-08', NOW);
  a.choice = 'defer';
  a.notes = 'Standby readiness unverified';
  a.economics.options.minimal.benefit.lambda = '0.3';
  addCandidate(a, 'vibration', NOW);
  const b = newDraft('PUMP-09', NOW);
  b.choice = 'existing';
  assert.equal(store.save(a, NOW).ok, true);
  assert.equal(store.save(b, NOW).ok, true);
  const reopened = createDraftStore(storage);
  const la = reopened.load('PUMP-08');
  assert.equal(la.status, 'loaded');
  assert.equal(la.draft.choice, 'defer');
  assert.equal(la.draft.notes, 'Standby readiness unverified');
  assert.equal(la.draft.economics.options.minimal.benefit.lambda, '0.3');
  assert.deepEqual(la.draft.candidates.map((c) => c.id), ['vibration']);
  assert.equal(la.draft.savedAt, NOW);
  assert.equal(la.draft.version, DRAFT_VERSION);
  assert.equal(reopened.load('PUMP-09').draft.choice, 'existing');
  assert.equal(reopened.load('PUMP-12').status, 'none');
});

test('ENG-14: a failing storage reports an actionable error and does not claim success', () => {
  const failing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const draft = newDraft('PUMP-08', NOW);
  draft.notes = 'keep me';
  const result = createDraftStore(failing).save(draft, NOW);
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be saved/i);
  assert.equal(draft.notes, 'keep me');
  assert.equal(draft.savedAt, null, 'savedAt only set on success');
  const unreadable = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {}, removeItem: () => {} };
  const loaded = createDraftStore(unreadable).load('PUMP-08');
  assert.equal(loaded.status, 'unavailable');
  assert.equal(loaded.draft.assetId, 'PUMP-08');
});

test('corrupt, foreign and newer stored drafts are not silently used or overwritten', () => {
  const storage = fixtureStorage();
  const store = createDraftStore(storage);
  storage.setItem(store.key('PUMP-08'), '{not json');
  assert.equal(store.load('PUMP-08').status, 'corrupt');
  storage.setItem(store.key('PUMP-08'), JSON.stringify({ ...newDraft('PUMP-09', NOW) }));
  assert.equal(store.load('PUMP-08').status, 'corrupt');
  const newer = { ...newDraft('PUMP-08', NOW), version: DRAFT_VERSION + 1, notes: 'from the future' };
  storage.setItem(store.key('PUMP-08'), JSON.stringify(newer));
  const loaded = store.load('PUMP-08');
  assert.equal(loaded.status, 'newer');
  const save = store.save(loaded.draft, NOW);
  assert.equal(save.ok, false);
  assert.match(JSON.parse(storage.getItem(store.key('PUMP-08'))).notes, /from the future/);
});

test('an unversioned legacy draft is migrated and keeps its content', () => {
  const storage = fixtureStorage();
  const store = createDraftStore(storage);
  storage.setItem(store.key('PUMP-08'), JSON.stringify({ assetId: 'PUMP-08', notes: 'old note', choice: 'minimal' }));
  const loaded = store.load('PUMP-08');
  assert.equal(loaded.status, 'migrated');
  assert.equal(loaded.draft.version, DRAFT_VERSION);
  assert.equal(loaded.draft.notes, 'old note');
  assert.equal(loaded.draft.choice, 'minimal');
  assert.ok(loaded.draft.economics.options.instrument.lines.length > 0);
});

test('ENG-02: adding and removing a candidate leaves other draft content and inventory untouched', () => {
  const draft = newDraft('PUMP-08', NOW);
  const installed = ['suction_pressure_kpa', 'discharge_pressure_kpa'];
  const snapshot = JSON.stringify(installed);
  addCandidate(draft, 'flow_head_power', NOW);
  addCandidate(draft, 'flow_head_power', NOW);
  assert.equal(draft.candidates.length, 1, 'no duplicates');
  draft.answers['flow_head_power.pipe_survey'] = { state: 'drafted', text: 'Survey booked' };
  draft.answers['vibration.bandwidth'] = { state: 'drafted', text: 'temp' };
  addCandidate(draft, 'vibration', NOW);
  removeCandidate(draft, 'vibration');
  assert.deepEqual(draft.candidates.map((c) => c.id), ['flow_head_power']);
  assert.equal(draft.answers['flow_head_power.pipe_survey'].text, 'Survey booked');
  assert.equal(draft.answers['vibration.bandwidth'], undefined, 'removed card drops only its own answers');
  assert.equal(JSON.stringify(installed), snapshot);
});

test('ENG-15: Not assessed or empty answers never become Ready; drafted answers allow Ready only', () => {
  const draft = newDraft('PUMP-08', NOW);
  assert.equal(reviewReadiness(draft).state, 'NO_SELECTION');
  draft.choice = 'minimal';
  addCandidate(draft, 'suction_pressure', NOW);
  const r1 = reviewReadiness(draft);
  assert.equal(r1.state, 'NEEDS_EVIDENCE');
  assert.ok(r1.missing.length > 0);
  for (const q of r1.questions) draft.answers[q.key] = { state: 'drafted', text: '' };
  assert.equal(reviewReadiness(draft).state, 'NEEDS_EVIDENCE', 'drafted without text is not an answer');
  for (const q of r1.questions) draft.answers[q.key] = { state: 'na', text: '' };
  assert.equal(reviewReadiness(draft).state, 'NEEDS_EVIDENCE', 'not applicable needs a rationale');
  for (const q of r1.questions) draft.answers[q.key] = { state: 'drafted', text: 'Draft assumption' };
  const ready = reviewReadiness(draft);
  assert.equal(ready.state, 'READY_FOR_REVIEW');
  assert.equal(ready.label, 'Ready for engineering review');
  assert.doesNotMatch(JSON.stringify(ready), /certified|installed|approved/i);
});

// ---- Provenance of edited values (COST_MODEL_SPEC "Input contract") ----
import { editLineValue, editGroupValue } from '../web/js/planner-store.js';
import { redundantPumpPreset, emptyEconomics } from '../web/js/planner-content.js';
import { evaluateModel } from '../web/js/cost-model.js';

test('editing a sourced value records a user assumption with entry date and preserves the original source', () => {
  const m = redundantPumpPreset('2026-11-06');
  const sensors = m.options.minimal.lines.find((l) => l.id === 'sensors');
  editLineValue(sensors, 'unitCost', '1500', '2026-11-07');
  assert.equal(sensors.unitCost, '1500');
  assert.equal(sensors.basis, 'user assumption');
  assert.equal(sensors.entryDate, '2026-11-07');
  assert.deepEqual(
    { basis: sensors.original.basis, source: sensors.original.source, sourceDate: sensors.original.sourceDate, unitCost: sensors.original.unitCost, quantity: sensors.original.quantity },
    { basis: 'illustrative assumption', source: 'COST_MODEL_SPEC v1 negative preset', sourceDate: '2026-11-06', unitCost: '1200', quantity: '1' },
  );
  editLineValue(sensors, 'unitCost', '1600', '2026-11-08');
  assert.equal(sensors.original.unitCost, '1200', 'first original is kept across later edits');
  assert.equal(sensors.entryDate, '2026-11-08');
  assert.equal(evaluateModel(m).options.minimal.initial.total, 4900);
});

test('a first entry on a blank line is a user assumption without an invented original', () => {
  const m = emptyEconomics();
  const line = m.options.minimal.lines.find((l) => l.id === 'site_survey');
  editLineValue(line, 'unitCost', '600', '2026-11-07');
  assert.equal(line.basis, 'user assumption');
  assert.equal(line.entryDate, '2026-11-07');
  assert.equal(line.original ?? null, null);
});

test('benefit and nuisance assumptions carry group provenance when edited', () => {
  const m = redundantPumpPreset('2026-11-06');
  const opt = m.options.minimal;
  assert.equal(opt.benefitProvenance.basis, 'illustrative assumption');
  editGroupValue(opt, 'benefit', 'lambda', '0.6', '2026-11-07');
  assert.equal(opt.benefit.lambda, '0.6');
  assert.equal(opt.benefitProvenance.basis, 'user assumption');
  assert.equal(opt.benefitProvenance.entryDate, '2026-11-07');
  assert.equal(opt.benefitProvenance.original.values.lambda, '0.3');
  assert.equal(opt.nuisanceProvenance.basis, 'illustrative assumption', 'other group untouched');
});

test('a supplier quote without scope, validity or tax basis cannot be summed', () => {
  const m = redundantPumpPreset('2026-11-06');
  const l = m.options.minimal.lines.find((x) => x.id === 'installation_labour');
  Object.assign(l, { basis: 'supplier quote', source: 'Quote Q-1', sourceDate: '2026-11-05' });
  let r = evaluateModel(m);
  assert.equal(r.options.minimal.initial.status, 'incomplete');
  assert.ok(r.options.minimal.initial.exclusions.some((e) => e.category === 'installation_labour' && /scope, validity and tax basis/.test(e.reason)));
  Object.assign(l, { quoteScope: 'Mount and cable one point', quoteValidUntil: '2026-12-31', taxBasis: 'excl. VAT' });
  r = evaluateModel(m);
  assert.equal(r.options.minimal.initial.total, 4500);
});

test('a shared allocation shows project total and allocated amount and rejects allocation above the total', () => {
  const m = redundantPumpPreset('2026-11-06');
  const gw = m.options.minimal.lines.find((x) => x.id === 'gateway');
  let r = evaluateModel(m);
  assert.deepEqual(r.options.minimal.allocations, [{ category: 'gateway', allocated: 300, projectTotal: null, basis: gw.allocation.basis }]);
  gw.allocation.projectTotal = '200';
  r = evaluateModel(m);
  assert.ok(r.errors.some((e) => e.field === 'options.minimal.lines.gateway.allocation.projectTotal'));
  gw.allocation.projectTotal = '1200';
  r = evaluateModel(m);
  assert.equal(r.options.minimal.allocations[0].projectTotal, 1200);
  assert.equal(r.options.minimal.initial.total, 4500, 'only the allocated share is in the asset total');
});

test('entering a project total is a reviewer edit, not attributed to the original source', () => {
  const m = redundantPumpPreset('2026-11-06');
  const gw = m.options.minimal.lines.find((x) => x.id === 'gateway');
  editLineValue(gw, 'allocation.projectTotal', '1200', '2026-11-07');
  assert.equal(gw.allocation.projectTotal, '1200');
  assert.equal(gw.basis, 'user assumption');
  assert.equal(gw.entryDate, '2026-11-07');
  assert.equal(gw.original.basis, 'illustrative assumption');
  assert.equal(gw.original.projectTotal, '');
});
