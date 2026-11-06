// Regressions from docs/tasks/003-review-round1.md (independent coordinator probes).
//   node --test tests/web_planner_regressions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateModel, MAX_HORIZON_YEARS } from '../web/js/cost-model.js';
import { redundantPumpPreset } from '../web/js/planner-content.js';
import { createDraftStore, newDraft, editLineValue } from '../web/js/planner-store.js';

function fixtureStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => map.delete(k), map };
}
const allFinite = (obj) => JSON.stringify(obj, (k, v) => {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`non-finite ${k}`);
  return v;
});
const line = (m, id) => m.options.minimal.lines.find((l) => l.id === id);

test('probe 1: an enormous horizon is a field error, not an unbounded allocation', () => {
  const m = redundantPumpPreset();
  m.horizonYears = '100000000000';
  const r = evaluateModel(m);
  assert.ok(r.errors.some((e) => e.field === 'horizonYears' && e.message.includes(String(MAX_HORIZON_YEARS))));
  assert.equal(r.incremental.minimal.npv, null);
  assert.equal(r.incremental.minimal.conclusion, 'NEEDS_EVIDENCE');
  m.horizonYears = String(MAX_HORIZON_YEARS);
  assert.equal(evaluateModel(m).errors.length, 0);
});

test('probe 2: overflowing arithmetic is invalid and suppresses every financial conclusion', () => {
  const m = redundantPumpPreset();
  Object.assign(line(m, 'sensors'), { quantity: '2', unitCost: '1e308' });
  const r = evaluateModel(m);
  assert.ok(r.errors.length > 0, 'overflow must be reported');
  assert.doesNotThrow(() => allFinite(r));
  assert.equal(r.options.minimal.initial.status, 'incomplete');
  assert.equal(r.options.minimal.initial.total, null);
  const inc = r.incremental.minimal;
  assert.equal(inc.npv, null);
  assert.equal(inc.payback, null);
  assert.equal(inc.breakEvenLambda, null);
  assert.equal(inc.conclusion, 'NEEDS_EVIDENCE');
});

test('overflow in benefit or nuisance inputs is also caught', () => {
  const m = redundantPumpPreset();
  m.options.minimal.benefit.r = '1e300';
  m.options.minimal.benefit.c = '1e300';
  m.options.minimal.benefit.h = '1e300';
  m.options.minimal.nuisance.n = '1e200';
  m.options.minimal.nuisance.a = '1e200';
  const r = evaluateModel(m);
  assert.ok(r.errors.length > 0);
  assert.doesNotThrow(() => allFinite(r));
  assert.equal(r.incremental.minimal.conclusion, 'NEEDS_EVIDENCE');
});

test('probe 3: a stored draft with broken nested schema is rejected, not loaded, and kept', () => {
  const storage = fixtureStorage();
  const store = createDraftStore(storage);
  const raw = JSON.stringify({ assetId: 'PUMP-08', version: 1, economics: null });
  storage.setItem(store.key('PUMP-08'), raw);
  const loaded = store.load('PUMP-08');
  assert.equal(loaded.status, 'corrupt');
  assert.doesNotThrow(() => evaluateModel(loaded.draft.economics));
  for (const bad of [
    { ...newDraft('PUMP-08', 't'), economics: { options: {} } },
    { ...newDraft('PUMP-08', 't'), candidates: 'x' },
    { ...newDraft('PUMP-08', 't'), economics: { ...newDraft('PUMP-08', 't').economics, options: { ...newDraft('PUMP-08', 't').economics.options, minimal: { lines: 3 } } } },
    { assetId: 'PUMP-08', economics: { options: { minimal: { lines: 'no' } } } }, // legacy (unversioned) migration path
  ]) {
    storage.setItem(store.key('PUMP-08'), JSON.stringify(bad));
    assert.equal(store.load('PUMP-08').status, 'corrupt', JSON.stringify(bad).slice(0, 80));
  }
});

test('saving over an unreadable draft first keeps the original as a backup', () => {
  const storage = fixtureStorage();
  const store = createDraftStore(storage);
  const raw = JSON.stringify({ assetId: 'PUMP-08', version: 1, economics: null });
  storage.setItem(store.key('PUMP-08'), raw);
  const loaded = store.load('PUMP-08');
  const result = store.save(loaded.draft, '2026-11-06T23:00:00.000Z');
  assert.equal(result.ok, true);
  const backups = [...storage.map.keys()].filter((k) => k.startsWith(`${store.key('PUMP-08')}.backup`));
  assert.equal(backups.length, 1);
  assert.equal(storage.getItem(backups[0]), raw);
  assert.match(result.message, /backup/i);
});

test('renderer integration: a corrupt stored draft renders the planner with a notice and leaves storage intact', async () => {
  const storage = fixtureStorage();
  const raw = JSON.stringify({ assetId: 'PUMP-08', version: 1, economics: null });
  storage.setItem('retrofit-doctor.planner.PUMP-08', raw);
  globalThis.window = { localStorage: storage };
  const { renderPlannerPage } = await import('../web/js/planner.js');
  const fleet = JSON.parse(readFileSync(new URL('../web/data/fleet.json', import.meta.url)));
  const asset = fleet.assets.find((a) => a.assetId === 'PUMP-08');
  let html;
  assert.doesNotThrow(() => { html = renderPlannerPage(asset, ''); });
  assert.match(html, /could not be read|incompatible/i);
  assert.match(html, /Cost estimate incomplete/);
  assert.equal(storage.getItem('retrofit-doctor.planner.PUMP-08'), raw);
});

test('editing a quoted amount drops the quote label and keeps quote details only in the original', () => {
  const m = redundantPumpPreset('2026-11-06');
  const l = line(m, 'installation_labour');
  Object.assign(l, { basis: 'supplier quote', source: 'Quote Q-1', sourceDate: '2026-11-05', quoteScope: 'One point', quoteValidUntil: '2026-12-31', taxBasis: 'excl. VAT' });
  editLineValue(l, 'unitCost', '1500', '2026-11-07');
  assert.equal(l.basis, 'user assumption');
  assert.deepEqual([l.source, l.sourceDate, l.quoteScope, l.quoteValidUntil], ['', '', '', '']);
  assert.deepEqual([l.original.basis, l.original.source, l.original.quoteScope, l.original.quoteValidUntil, l.original.taxBasis], ['supplier quote', 'Quote Q-1', 'One point', '2026-12-31', 'excl. VAT']);
  assert.equal(evaluateModel(m).options.minimal.initial.total, 4800);
});

test('a scheduled event after the horizon is reported, not silently dropped', () => {
  const m = redundantPumpPreset();
  m.options.minimal.scheduled.push({ id: 'late', year: '8', cost: '900', purpose: 'Removal', currency: 'EUR' });
  const r = evaluateModel(m);
  assert.deepEqual(r.options.minimal.scheduled.outsideHorizon, [{ id: 'late', year: 8, cost: 900, purpose: 'Removal' }]);
  assert.equal(r.incremental.minimal.npv, -15500, 'outside-horizon cost is not in the H-year result');
});
