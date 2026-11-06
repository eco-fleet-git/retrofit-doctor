// Lifecycle cost and incremental-value calculator (docs/engineering/COST_MODEL_SPEC.md v1).
// Pure module: inputs are raw strings as typed by the reviewer ('' = unknown, '0' = explicit zero),
// so invalid entries are reported per field without discarding the draft. No DOM, no storage.

import { economicsProblems, emptyEconomics } from './planner-content.js';

export const OPTION_IDS = ['existing', 'minimal', 'instrument'];
// Supported bounds keep every intermediate value finite: H ≤ 50 years, |input| ≤ 1e12.
export const MAX_HORIZON_YEARS = 50;
export const MAX_INPUT = 1e12;
export const BASELINE = 'existing';

export function parseNumberInput(raw) {
  if (raw == null) return { value: null, error: null };
  const s = String(raw).trim();
  if (s === '') return { value: null, error: null };
  const v = Number(s);
  if (!Number.isFinite(v)) return { value: null, error: 'Not a number' };
  return { value: v, error: null };
}

function reader(errors) {
  const read = (field, raw, { min = null, max = null, integer = false, minExclusive = false, maxMessage = null } = {}) => {
    const { value, error } = parseNumberInput(raw);
    if (error) { errors.push({ field, message: error }); return { value: null, invalid: true }; }
    if (value == null) return { value: null, invalid: false };
    let msg = null;
    if (Math.abs(value) > MAX_INPUT) msg = 'Too large to calculate reliably (limit 1,000,000,000,000)';
    else if (integer && !Number.isInteger(value)) msg = 'Must be a whole number';
    else if (min != null && (minExclusive ? value <= min : value < min)) msg = minExclusive ? `Must be greater than ${min}` : (min === 0 ? 'Must not be negative' : `Must be at least ${min}`);
    else if (max != null && value > max) msg = maxMessage ?? `Must be at most ${max}`;
    if (msg) { errors.push({ field, message: msg }); return { value: null, invalid: true }; }
    return { value, invalid: false };
  };
  return read;
}

function evaluateCostSet(model, optionId, kind, read, errors) {
  const option = model.options[optionId];
  const lines = option.lines.filter((l) => l.kind === kind);
  const byId = Object.fromEntries(option.lines.map((l) => [l.id, l]));
  let known = 0; const missing = []; const exclusions = []; const allocations = []; let invalid = false;
  for (const l of lines) {
    const f = `options.${optionId}.lines.${l.id}`;
    if (l.mode === 'na') {
      if (!String(l.rationale ?? '').trim()) { errors.push({ field: `${f}.rationale`, message: 'Not applicable needs a rationale' }); invalid = true; exclusions.push({ category: l.id, reason: 'Not applicable without rationale' }); }
      continue;
    }
    if (l.mode === 'included') {
      const target = byId[l.includedIn];
      if (!target || target.id === l.id || target.mode !== 'amount') {
        errors.push({ field: `${f}.includedIn`, message: 'Included elsewhere needs the ID of a costed line' });
        invalid = true; exclusions.push({ category: l.id, reason: 'Included elsewhere without a valid line reference' });
      }
      continue;
    }
    const q = read(`${f}.quantity`, l.quantity, { min: 0 });
    const u = read(`${f}.unitCost`, l.unitCost, { min: 0 });
    if (q.invalid || u.invalid) { invalid = true; exclusions.push({ category: l.id, reason: 'Invalid entry' }); continue; }
    if (q.value == null || u.value == null) { missing.push(l.id); exclusions.push({ category: l.id, reason: 'No value entered' }); continue; }
    let amount = q.value * u.value;
    if (!Number.isFinite(amount) || Math.abs(amount) > MAX_INPUT) {
      errors.push({ field: `${f}.unitCost`, message: 'Extended cost too large to calculate reliably' });
      invalid = true; exclusions.push({ category: l.id, reason: 'Invalid entry' }); continue;
    }
    if ((l.currency || model.currency) !== model.currency) {
      const rate = read(`${f}.fx.rate`, l.fx?.rate, { min: 0, minExclusive: true });
      if (rate.value == null || !String(l.fx?.date ?? '').trim() || !String(l.fx?.source ?? '').trim()) {
        exclusions.push({ category: l.id, reason: `Currency ${l.currency} differs from ${model.currency}; needs rate, rate date and source` });
        continue;
      }
      amount *= rate.value;
    }
    if (l.basis === 'supplier quote' && [l.quoteScope, l.quoteValidUntil, l.taxBasis].some((v) => !String(v ?? '').trim())) {
      exclusions.push({ category: l.id, reason: 'Supplier quote needs scope, validity and tax basis' });
      continue;
    }
    if (l.allocation) {
      const pt = read(`${f}.allocation.projectTotal`, l.allocation.projectTotal, { min: 0 });
      if (pt.value != null && amount > pt.value) errors.push({ field: `${f}.allocation.projectTotal`, message: 'Allocated amount exceeds the project total' });
      allocations.push({ category: l.id, allocated: amount, projectTotal: pt.value, basis: l.allocation.basis });
    }
    if (String(l.taxBasis ?? '').trim() && l.taxBasis !== model.taxBasis) {
      exclusions.push({ category: l.id, reason: `Tax basis "${l.taxBasis}" differs from "${model.taxBasis}"` });
      continue;
    }
    known += amount;
  }
  const complete = exclusions.length === 0 && !invalid;
  return { status: complete ? 'complete' : 'incomplete', total: complete ? known : null, knownSubtotal: known, missing, exclusions, allocations };
}

function evaluateScheduled(model, optionId, H, read, errors) {
  const perYear = Array(H ?? 0).fill(0); const exclusions = []; const outsideHorizon = [];
  for (const s of model.options[optionId].scheduled ?? []) {
    const f = `options.${optionId}.scheduled.${s.id}`;
    const year = read(`${f}.year`, s.year, { min: 1, integer: true });
    const cost = read(`${f}.cost`, s.cost, { min: 0 });
    if (year.invalid || cost.invalid) { exclusions.push({ id: s.id, reason: 'Invalid entry' }); continue; }
    if (year.value == null || cost.value == null) { exclusions.push({ id: s.id, reason: 'Year or cost unknown' }); continue; }
    if ((s.currency || model.currency) !== model.currency) { exclusions.push({ id: s.id, reason: `Currency ${s.currency} differs from ${model.currency}` }); continue; }
    if (H != null && year.value <= H) perYear[year.value - 1] += cost.value;
    else if (H != null) outsideHorizon.push({ id: s.id, year: year.value, cost: cost.value, purpose: s.purpose ?? '' });
  }
  return { status: exclusions.length ? 'incomplete' : 'complete', perYear, exclusions, outsideHorizon };
}

const NO_BREAK_EVEN = { value: null, label: 'No finite event-rate break-even' };

export function evaluateModel(input) {
  const errors = [];
  const problems = economicsProblems(input);
  // A malformed model is evaluated as an empty one so every figure is unknown, never a crash.
  const model = problems.length ? emptyEconomics() : input;
  if (problems.length) errors.push({ field: 'economics', message: `Cost model data is missing or incompatible: ${problems.slice(0, 3).join('; ')}` });
  const read = reader(errors);
  const H = read('horizonYears', model.horizonYears, { min: 1, max: MAX_HORIZON_YEARS, integer: true, maxMessage: `Supported horizon is 1–${MAX_HORIZON_YEARS} whole years` }).value;
  const d = read('discountRate', model.discountRate, { min: 0 }).value;
  const timeOk = H != null && d != null;
  const disc = timeOk ? Array.from({ length: H }, (_, i) => 1 / (1 + d) ** (i + 1)) : [];
  const AF = disc.reduce((a, b) => a + b, 0);
  const pv = (perYear) => perYear.reduce((s, v, i) => s + v * disc[i], 0);

  const options = {};
  for (const id of OPTION_IDS) {
    const initial = evaluateCostSet(model, id, 'one-time', read, errors);
    const annual = evaluateCostSet(model, id, 'annual', read, errors);
    const scheduled = evaluateScheduled(model, id, H, read, errors);
    const complete = timeOk && initial.status === 'complete' && annual.status === 'complete' && scheduled.status === 'complete';
    options[id] = {
      initial, annual, scheduled, allocations: [...initial.allocations, ...annual.allocations],
      // Gross forward cost excluding nuisance handling (nuisance is entered incrementally in v1).
      lifecycleCostExclNuisance: complete ? initial.total + pv(scheduled.perYear.map((r) => annual.total + r)) : null,
    };
  }

  const incremental = {};
  for (const id of OPTION_IDS.filter((o) => o !== BASELINE)) {
    const opt = model.options[id]; const f = `options.${id}`;
    const base = options[BASELINE]; const cur = options[id];
    const b = opt.benefit; const nz = opt.nuisance;
    const lambda = read(`${f}.benefit.lambda`, b.lambda, { min: 0 }).value;
    const u = read(`${f}.benefit.u`, b.u, { min: 0, max: 1 }).value;
    const h = read(`${f}.benefit.h`, b.h, { min: 0 }).value;
    const c = read(`${f}.benefit.c`, b.c, { min: 0 }).value;
    const r = read(`${f}.benefit.r`, b.r, { min: 0 }).value;
    const L = read(`${f}.benefit.L`, b.L, { min: 0 }).value;
    const a = read(`${f}.nuisance.a`, nz.a, { min: 0 }).value;
    let nuisancePerYear = null;
    if (nz.mode === 'totals') {
      const ot = read(`${f}.nuisance.optionTotal`, nz.optionTotal, { min: 0 }).value;
      const bt = read(`${f}.nuisance.baselineTotal`, nz.baselineTotal, { min: 0 }).value;
      if (ot != null && bt != null && a != null) nuisancePerYear = (ot - bt) * a;
    } else {
      const n = read(`${f}.nuisance.n`, nz.n, { min: 0 }).value;
      if (n != null && a != null) nuisancePerYear = n * a;
    }
    const perEventKnown = u != null && h != null && c != null && r != null;
    const benefitKnown = lambda != null && perEventKnown;
    const benefitPerYear = benefitKnown ? lambda * u * (h * c + r) + (L ?? 0) : null;
    const costsKnown = timeOk && [base, cur].every((o) => o.initial.status === 'complete' && o.annual.status === 'complete' && o.scheduled.status === 'complete');
    const hasErrors = errors.some((e) => e.field.startsWith(`${f}.`) || e.field.startsWith(`options.${BASELINE}.`) || !e.field.startsWith('options.'));
    const out = {
      costStatus: costsKnown ? 'complete' : 'Cost estimate incomplete',
      benefitStatus: benefitKnown ? 'Estimated' : 'Benefit not estimated',
      nuisanceStatus: nuisancePerYear != null ? 'Estimated' : 'Nuisance burden not estimated',
      labourSavingIncluded: L != null,
      benefitPerYear, nuisancePerYear,
      deltaInitial: costsKnown ? cur.initial.total - base.initial.total : null,
      deltaAnnual: costsKnown ? cur.annual.total - base.annual.total : null,
      annualNet: null, npv: null, incrementalLifecycleCost: null, grossBenefit: null,
      cumulative: null, payback: null, breakEvenLambda: null, zeroNuisance: null, maxNuisanceChecks: null,
      status: 'not estimated', conclusion: 'NEEDS_EVIDENCE', invalid: hasErrors,
    };
    if (costsKnown && nuisancePerYear != null && !hasErrors) {
      const dR = cur.scheduled.perYear.map((v, i) => v - base.scheduled.perYear[i]);
      const dC0 = out.deltaInitial; const dO = out.deltaAnnual;
      out.incrementalLifecycleCost = dC0 + pv(dR.map((x) => dO + nuisancePerYear + x));
      if (perEventKnown && a != null) {
        const perEvent = u * (h * c + r);
        const num = out.incrementalLifecycleCost - AF * (L ?? 0);
        if (perEvent * AF === 0) out.breakEvenLambda = NO_BREAK_EVEN;
        else {
          const v = num / (AF * perEvent);
          out.breakEvenLambda = { value: v, label: v <= 0 ? 'Break-even at or below zero events/year' : 'Relevant events/year needed to break even (threshold, not an estimate)' };
        }
      }
      if (benefitKnown) {
        const annualNet = benefitPerYear - dO - nuisancePerYear;
        const net = dR.map((x) => annualNet - x);
        let cum = -dC0;
        out.cumulative = net.map((v, i) => (cum += v * disc[i]));
        Object.assign(out, {
          annualNet, grossBenefit: benefitPerYear * AF, npv: out.cumulative[H - 1], status: 'estimated',
          conclusion: out.cumulative[H - 1] > 0 ? 'REVIEW_CANDIDATE' : 'DEFER',
        });
        const zNet = benefitPerYear - dO;
        out.zeroNuisance = { annualNet: zNet, npv: -dC0 + pv(dR.map((x) => zNet - x)) };
        if (nz.mode !== 'totals' && a > 0) {
          const v = out.zeroNuisance.npv / (AF * a);
          out.maxNuisanceChecks = v < 0 ? { value: null, label: 'Negative even with zero nuisance checks' } : { value: v, label: 'Nuisance checks/year at which NPV reaches zero' };
        }
        if (dR.some((x) => x !== 0)) {
          const k = out.cumulative.findIndex((v) => v >= 0);
          out.payback = { kind: 'cumulative', recoveryYear: k < 0 ? null : k + 1, label: k < 0 ? 'Beyond selected horizon' : `Cumulative recovery in year ${k + 1}` };
        } else if (dC0 <= 0) out.payback = { kind: 'none', label: 'No additional initial investment' };
        else if (annualNet <= 0) out.payback = { kind: 'none', label: 'No simple payback under these assumptions' };
        else {
          const years = dC0 / annualNet;
          out.payback = years > H ? { kind: 'beyond', years, label: 'Beyond selected horizon' } : { kind: 'simple', years, label: `Simple payback ${years.toFixed(1)} years (undiscounted)` };
        }
      }
    }
    incremental[id] = guardFinite(out, `options.${id}`, errors);
  }
  for (const id of OPTION_IDS) guardFinite(options[id], `options.${id}`, errors);
  if (problems.length) for (const id of Object.keys(incremental)) incremental[id].invalid = true;
  return { errors, horizonYears: H, discountRate: d, options, incremental };
}

// Defence in depth: any non-finite number suppresses the financial result instead of rendering it.
function hasNonFinite(v) {
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.some(hasNonFinite);
  if (v && typeof v === 'object') return Object.values(v).some(hasNonFinite);
  return false;
}
function guardFinite(out, field, errors) {
  if (!hasNonFinite(out)) return out;
  errors.push({ field, message: 'Calculation overflow: values too large to compare' });
  if ('npv' in out) {
    return { ...out, benefitPerYear: null, nuisancePerYear: null, deltaInitial: null, deltaAnnual: null, annualNet: null, npv: null,
      incrementalLifecycleCost: null, grossBenefit: null, cumulative: null, payback: null, breakEvenLambda: null, zeroNuisance: null,
      maxNuisanceChecks: null, status: 'not estimated', conclusion: 'NEEDS_EVIDENCE', invalid: true };
  }
  for (const set of [out.initial, out.annual]) Object.assign(set, { status: 'incomplete', total: null, knownSubtotal: 0 });
  out.lifecycleCostExclNuisance = null;
  return out;
}
