// Lifecycle cost calculator (web/js/cost-model.js). Expected numbers are literals from
// docs/engineering/COST_MODEL_SPEC.md and PLANNER_ACCEPTANCE.md, not recomputed here.
//   node --test tests/web_cost_model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateModel, parseNumberInput } from '../web/js/cost-model.js';
import { redundantPumpPreset, emptyEconomics } from '../web/js/planner-content.js';

const line = (model, option, category) => model.options[option].lines.find((l) => l.category === category);
const finite = (v) => v === null || Number.isFinite(v);

test('ENG-08: redundant-pump preset reproduces every fixture result', () => {
  const r = evaluateModel(redundantPumpPreset());
  const m = r.options.minimal;
  assert.equal(m.initial.status, 'complete');
  assert.equal(m.initial.total, 4500);
  assert.equal(m.annual.total, 700);
  const inc = r.incremental.minimal;
  assert.equal(inc.status, 'estimated');
  assert.equal(inc.benefitPerYear, 300);
  assert.equal(inc.nuisancePerYear, 1800);
  assert.equal(inc.annualNet, -2200);
  assert.equal(inc.incrementalLifecycleCost, 17000);
  assert.equal(inc.grossBenefit, 1500);
  assert.equal(inc.npv, -15500);
  assert.equal(inc.payback.label, 'No simple payback under these assumptions');
  assert.ok(Math.abs(inc.breakEvenLambda.value - 3.4) < 1e-9);
  assert.equal(inc.conclusion, 'DEFER');
});

test('ENG-09: zero nuisance checks still loses money, still no payback', () => {
  const model = redundantPumpPreset();
  model.options.minimal.nuisance.n = '0';
  const inc = evaluateModel(model).incremental.minimal;
  assert.equal(inc.annualNet, -400);
  assert.equal(inc.npv, -6500);
  assert.equal(inc.payback.label, 'No simple payback under these assumptions');
});

test('ENG-10: u = 0 gives zero benefit and no finite break-even, never NaN/Infinity', () => {
  const model = redundantPumpPreset();
  model.options.minimal.benefit.u = '0';
  const inc = evaluateModel(model).incremental.minimal;
  assert.equal(inc.benefitPerYear, 0);
  assert.equal(inc.annualNet, -2500);
  assert.equal(inc.npv, -17000);
  assert.equal(inc.breakEvenLambda.value, null);
  assert.equal(inc.breakEvenLambda.label, 'No finite event-rate break-even');
  for (const v of Object.values(inc)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
});

test('ENG-06: a blank essential cost makes the estimate incomplete with a known subtotal, not zero', () => {
  const model = redundantPumpPreset();
  line(model, 'minimal', 'installation_labour').unitCost = '';
  const r = evaluateModel(model);
  assert.equal(r.options.minimal.initial.status, 'incomplete');
  assert.equal(r.options.minimal.initial.total, null);
  assert.equal(r.options.minimal.initial.knownSubtotal, 3300);
  assert.deepEqual(r.options.minimal.initial.missing, ['installation_labour']);
  assert.equal(r.incremental.minimal.npv, null);
  assert.equal(r.incremental.minimal.conclusion, 'NEEDS_EVIDENCE');
});

test('ENG-06/07: empty model shows every category as missing and benefit not estimated', () => {
  const r = evaluateModel(emptyEconomics());
  for (const option of ['existing', 'minimal', 'instrument']) {
    assert.equal(r.options[option].initial.status, 'incomplete');
    assert.equal(r.options[option].initial.knownSubtotal, 0);
    assert.ok(r.options[option].initial.missing.length >= 13);
    assert.ok(r.options[option].annual.missing.length >= 7);
  }
  const inc = r.incremental.minimal;
  assert.equal(inc.benefitStatus, 'Benefit not estimated');
  assert.equal(inc.npv, null);
  assert.equal(inc.payback, null);
});

test('ENG-07: unknown event rate keeps cost comparison but no NPV or payback', () => {
  const model = redundantPumpPreset();
  model.options.minimal.benefit.lambda = '';
  const r = evaluateModel(model);
  assert.equal(r.options.minimal.initial.total, 4500);
  assert.equal(r.incremental.minimal.benefitStatus, 'Benefit not estimated');
  assert.equal(r.incremental.minimal.npv, null);
  assert.equal(r.incremental.minimal.payback, null);
});

test('ENG-11: invalid entries are reported per field; empty stays unknown', () => {
  assert.deepEqual(parseNumberInput(''), { value: null, error: null });
  assert.deepEqual(parseNumberInput('  '), { value: null, error: null });
  assert.equal(parseNumberInput('abc').error, 'Not a number');
  const model = redundantPumpPreset();
  model.options.minimal.benefit.u = '1.2';
  model.options.minimal.nuisance.n = '-3';
  line(model, 'minimal', 'sensors').unitCost = '-1200';
  model.horizonYears = '2.5';
  model.discountRate = '-0.01';
  const r = evaluateModel(model);
  const fields = r.errors.map((e) => e.field);
  for (const f of ['options.minimal.benefit.u', 'options.minimal.nuisance.n', 'options.minimal.lines.sensors.unitCost', 'horizonYears', 'discountRate']) {
    assert.ok(fields.includes(f), f);
  }
  assert.equal(r.incremental.minimal.npv, null);
  assert.equal(model.options.minimal.benefit.u, '1.2', 'raw input is preserved');
});

test('discounting applies to costs and benefits on the same convention', () => {
  const model = redundantPumpPreset();
  model.discountRate = '0.1';
  const inc = evaluateModel(model).incremental.minimal;
  // Annuity factor for 5 years at 10 %: 3.790786769...; −4500 + 3.790786769 × (−2200)
  assert.ok(Math.abs(inc.npv - (-12839.730892)) < 1e-3);
});

test('ENG-18: positive level net gives a review candidate and simple payback', () => {
  const model = redundantPumpPreset();
  model.options.minimal.benefit.lambda = '3';
  model.options.minimal.nuisance.n = '0';
  const inc = evaluateModel(model).incremental.minimal;
  // 3 × 0.5 × 2000 = 3000 benefit; net 3000 − 700 = 2300; payback 4500 / 2300 years
  assert.equal(inc.annualNet, 2300);
  assert.ok(Math.abs(inc.payback.years - 4500 / 2300) < 1e-12);
  assert.equal(inc.payback.kind, 'simple');
  assert.equal(inc.conclusion, 'REVIEW_CANDIDATE');
});

test('ENG-18: scheduled cost forbids the level-flow shortcut; cumulative recovery year shown instead', () => {
  const model = redundantPumpPreset();
  model.options.minimal.benefit.lambda = '3';
  model.options.minimal.nuisance.n = '0';
  model.options.minimal.scheduled.push({ id: 's1', year: '2', cost: '3000', purpose: 'Gateway replacement', currency: 'EUR' });
  const inc = evaluateModel(model).incremental.minimal;
  assert.equal(inc.payback.kind, 'cumulative');
  assert.equal(inc.payback.years, undefined);
  // End-of-year cumulative: −4500 + 2300 = −2200; −2200 + 2300 − 3000 = −2900; −600; 1700; 4000
  assert.deepEqual(inc.cumulative, [-2200, -2900, -600, 1700, 4000]);
  assert.equal(inc.payback.recoveryYear, 4);
});

test('payback beyond the horizon and no additional investment are labelled, not negative', () => {
  const slow = redundantPumpPreset();
  slow.options.minimal.benefit.lambda = '1';
  slow.options.minimal.nuisance.n = '0';
  // benefit 1000, net 300, payback 15 years > 5
  assert.equal(evaluateModel(slow).incremental.minimal.payback.label, 'Beyond selected horizon');
  const free = redundantPumpPreset();
  for (const l of free.options.minimal.lines) if (l.kind === 'one-time' && l.mode === 'amount') l.unitCost = '0';
  free.options.minimal.nuisance.n = '0';
  free.options.minimal.benefit.lambda = '3';
  assert.equal(evaluateModel(free).incremental.minimal.payback.label, 'No additional initial investment');
});

test('ENG-12: a line in another currency without a dated conversion cannot be summed', () => {
  const model = redundantPumpPreset();
  const l = line(model, 'minimal', 'sensors');
  l.currency = 'NOK';
  let r = evaluateModel(model);
  assert.equal(r.options.minimal.initial.status, 'incomplete');
  assert.ok(r.options.minimal.initial.exclusions.some((e) => e.category === 'sensors' && /currency/i.test(e.reason)));
  l.fx = { rate: '0.085', date: '2026-10-30', source: 'Reviewer entry' };
  l.unitCost = '14117.64705882353';
  r = evaluateModel(model);
  assert.equal(r.options.minimal.initial.status, 'complete');
  assert.ok(Math.abs(r.options.minimal.initial.total - 4500) < 1e-9);
});

test('ENG-17: direct and full-total nuisance modes never both charge; included lines need a reference', () => {
  const model = redundantPumpPreset();
  const nz = model.options.minimal.nuisance;
  nz.optionTotal = '30'; nz.baselineTotal = '10';
  assert.equal(evaluateModel(model).incremental.minimal.nuisancePerYear, 1800, 'direct mode ignores totals');
  nz.mode = 'totals';
  assert.equal(evaluateModel(model).incremental.minimal.nuisancePerYear, 1500, 'totals mode ignores direct n');
  const l = line(model, 'minimal', 'mounts');
  assert.equal(l.mode, 'included');
  l.includedIn = '';
  const r = evaluateModel(model);
  assert.ok(r.errors.some((e) => e.field === 'options.minimal.lines.mounts.includedIn'));
  assert.equal(r.options.minimal.initial.status, 'incomplete');
});
