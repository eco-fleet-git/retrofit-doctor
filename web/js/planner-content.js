// Planner content from docs/engineering/{DECISION_BRIEF,COST_MODEL_SPEC}.md. Candidates are
// engineering hypotheses; nothing here is a measurement, a tested improvement or a price quote.

export const ONE_TIME_CATEGORIES = [
  ['sensors', 'Sensors'], ['mounts', 'Mounts / fittings / isolators'], ['gateway', 'Gateway or IO master'],
  ['power_cabling', 'Power supply / enclosure / cables'], ['site_survey', 'Site survey'],
  ['installation_labour', 'Installation labour'], ['access_travel', 'Access / scaffolding / travel'],
  ['shutdown_loss', 'Shutdown or changeover loss'], ['ot_integration', 'OT integration / licensing / tag mapping'],
  ['site_review', 'Security / site / class engineering review'], ['commissioning', 'Commissioning / reference measurement'],
  ['documentation', 'Documentation / training'], ['contingency', 'Explicit contingency'],
];
export const RECURRING_CATEGORIES = [
  ['software_support', 'Software / support'], ['inspection', 'Inspection / cleaning'],
  ['batteries', 'Batteries and replacement access'], ['calibration', 'Calibration / reference verification'],
  ['connectivity', 'Connectivity / storage'], ['security_maintenance', 'Security maintenance'], ['spares', 'Spares'],
];
export const CATEGORY_LABEL = Object.fromEntries([...ONE_TIME_CATEGORIES, ...RECURRING_CATEGORIES]);
export const BASES = ['unknown', 'user assumption', 'site estimate', 'supplier quote', 'organizer dated example', 'illustrative assumption', 'field observation'];
export const OPTION_LABEL = { existing: 'Existing signals only', minimal: 'Minimal retrofit', instrument: 'Instrument-grade assessment' };

const blankLine = (id, kind) => ({
  id, category: id, kind, mode: 'amount', quantity: '1', unitCost: '', currency: 'EUR', taxBasis: '',
  basis: 'unknown', source: '', sourceDate: '', entryDate: '', note: '', includedIn: '', rationale: '', fx: null,
  quoteScope: '', quoteValidUntil: '', original: null,
  // Shared items: the line holds this asset's allocated amount; the project total is entered separately.
  allocation: id === 'gateway' ? { projectTotal: '', basis: '' } : null,
});
const blankProvenance = () => ({ basis: 'unknown', source: '', sourceDate: '', entryDate: '', original: null });

const blankOption = () => ({
  lines: [...ONE_TIME_CATEGORIES.map(([id]) => blankLine(id, 'one-time')), ...RECURRING_CATEGORIES.map(([id]) => blankLine(id, 'annual'))],
  scheduled: [],
  benefit: { lambda: '', u: '', h: '', c: '', r: '', L: '' },
  nuisance: { mode: 'direct', n: '', a: '', optionTotal: '', baselineTotal: '' },
  benefitProvenance: blankProvenance(),
  nuisanceProvenance: blankProvenance(),
});

export function emptyEconomics() {
  return {
    presetId: null, currency: 'EUR', taxBasis: 'excl. VAT', moneyConvention: 'constant-real',
    startDate: '', horizonYears: '5', discountRate: '0',
    baselineName: 'Existing practice: current signals and routine inspection',
    options: { existing: blankOption(), minimal: blankOption(), instrument: blankOption() },
  };
}

export const PRESET_ID = 'illustrative-redundant-pump-v1';
export const PRESET_TITLE = 'Hypothetical redundant pump — assumed healthy standby and no production loss';
export const PRESET_NOTICE = 'Illustrative assumptions from COST_MODEL_SPEC v1, independent of every benchmark asset. Not current prices, not an installable BOM, and no claim that the selected pump has a standby.';

// Exact fixture from COST_MODEL_SPEC.md "Editable negative preset". Incremental accounting:
// every amount is an addition versus existing practice; the existing-only baseline differential is zero.
export function redundantPumpPreset(entryDate = '') {
  const m = emptyEconomics();
  m.presetId = PRESET_ID;
  const src = { basis: 'illustrative assumption', source: 'COST_MODEL_SPEC v1 negative preset', sourceDate: '2026-11-06', entryDate };
  for (const l of m.options.existing.lines) {
    Object.assign(l, src, { unitCost: '0', note: 'Baseline differential zero (incremental accounting). Sunk existing equipment excluded.' });
  }
  const set = (id, patch) => Object.assign(m.options.minimal.lines.find((l) => l.id === id), src, patch);
  set('sensors', { unitCost: '1200', note: 'Sensor/mount/cable/power/enclosure package (bundled)' });
  set('mounts', { mode: 'included', includedIn: 'sensors', note: 'Bundled in sensor package' });
  set('power_cabling', { mode: 'included', includedIn: 'sensors', note: 'Bundled in sensor package' });
  set('gateway', { unitCost: '300', note: 'Allocated share of a shared gateway', allocation: { projectTotal: '', basis: 'Fixture gives only the allocated share; project total and beneficiaries not entered' } });
  set('installation_labour', { unitCost: '1200' });
  set('ot_integration', { unitCost: '800' });
  set('commissioning', { unitCost: '400', note: 'Commissioning / reference checks' });
  set('documentation', { unitCost: '300', note: 'Site review / documentation / training (bundled)' });
  set('site_review', { mode: 'included', includedIn: 'documentation', note: 'Bundled in site review / documentation / training' });
  set('access_travel', { unitCost: '300', note: 'Access / travel / changeover allowance' });
  set('shutdown_loss', { mode: 'included', includedIn: 'access_travel', note: 'Changeover allowance; fixture assumes no additional shutdown loss' });
  set('site_survey', { unitCost: '0', note: 'Fixture assumption: no additional survey (arithmetic only)' });
  set('contingency', { unitCost: '0', note: 'Fixture assumption: no contingency (arithmetic only)' });
  set('software_support', { unitCost: '300', note: 'Support' });
  set('batteries', { unitCost: '200', note: 'Service / battery allowance' });
  set('inspection', { mode: 'included', includedIn: 'batteries', note: 'Within service allowance' });
  set('calibration', { mode: 'included', includedIn: 'batteries', note: 'Within service allowance' });
  set('spares', { unitCost: '200', note: 'Annualised replacement allowance; no separate scheduled replacement added' });
  set('connectivity', { mode: 'included', includedIn: 'software_support', note: 'Within support allowance' });
  set('security_maintenance', { mode: 'included', includedIn: 'software_support', note: 'Within support allowance' });
  m.options.minimal.benefit = { lambda: '0.3', u: '0.5', h: '0', c: '0', r: '2000', L: '0' };
  m.options.minimal.nuisance = { mode: 'direct', n: '24', a: '75', optionTotal: '', baselineTotal: '' };
  const groupSrc = { basis: src.basis, source: src.source, sourceDate: src.sourceDate, entryDate, original: null };
  m.options.minimal.benefitProvenance = { ...groupSrc };
  m.options.minimal.nuisanceProvenance = { ...groupSrc };
  return m;
}

// Review answer states (docs/ux/STATES_AND_ACCEPTANCE.md §5).
export const ANSWER_STATES = [['not_assessed', 'Not assessed'], ['open', 'Open / needs evidence'], ['drafted', 'Draft response'], ['na', 'Not applicable (rationale)']];

export const COMMON_GATES = [
  ['mounting', 'Mounting location, access route and isolation / work-window needs'],
  ['interface', 'Interface, tag mapping, timestamp source and quality flags'],
  ['maintenance', 'Maintenance, calibration / reference checks and responsible maintainer'],
  ['site_review', 'Site / class / flag engineering review questions (no compliance assumed)'],
  ['pilot', 'Field validation: shadow comparison against a reference or handheld route'],
];

export const CHOICES = {
  existing: {
    title: 'Use existing signals', decision: 'Decide whether a trend merits inspection, instrument verification or more measurement using the channels already installed.',
    burden: 'Export rights, tag mapping, timestamp/quality checks, operating-regime reference, human review. Existing data is not free integration.',
    when: 'Existing signals answer the question, a handheld route is sufficient, or retrofit value remains unknown.',
    gates: [['export', 'Historian export rights and tag mapping'], ['quality', 'Timestamp and quality-flag checks'], ['owner', 'Named reviewer for advisory output']],
  },
  minimal: {
    title: 'Assess minimal retrofit', decision: 'Add one specific missing perspective that affects an actionable decision; test it in a small pilot.',
    burden: 'Mounting and access, process connection where needed, cable or radio survey, gateway/power, commissioning and upkeep.',
    when: 'A documented blind spot affects an actionable decision and a small pilot can test it.',
    gates: [['blind_spot', 'Documented blind spot and the maintenance decision it affects'], ['pilot_scope', 'Pilot scope, owner and stop criteria']],
  },
  instrument: {
    title: 'Assess instrument-grade measurement', decision: 'Establish a defensible operating point and measurement uncertainty (flow, differential head, electrical power).',
    burden: 'Site survey, traceable verification/calibration, reference comparisons, engineering labour, lifecycle support, possibly intrusive work.',
    when: 'The decision needs measured performance or finer discrimination and justifies the complete installed cost. An assessment scope, not a certified bundle.',
    gates: [['survey', 'Site survey scope before any purchase'], ['uncertainty', 'Required measurement uncertainty and traceable reference']],
  },
  defer: {
    title: 'Defer permanent retrofit', decision: 'Retain existing signals and evaluate a periodic route; revisit after verifying standby readiness, maintenance cost and the unresolved decision.',
    burden: 'Document the unresolved question and the trigger to revisit.',
    when: 'Access, nuisance burden, redundancy or lifecycle cost defeats the case. A valid completed outcome.',
    gates: [['revisit', 'Trigger or date to revisit the decision'], ['unresolved', 'The specific unresolved site question'], ['route', 'Periodic / handheld route that replaces permanent monitoring']],
  },
};

export const CANDIDATES = [
  {
    id: 'suction_pressure', title: 'Suction pressure (with existing discharge pressure)', tier: 'minimal', channels: ['suction_pressure_kpa'],
    decision: 'Has inlet condition or pump pressure rise changed at comparable speed/load? Inspect inlet path and verify the transmitter.',
    willNotResolve: 'Cannot locate a blockage by itself. Pump taps do not measure strainer or heat-exchanger differential pressure. Cavitation-margin assessment also needs absolute-pressure reference, fluid temperature/properties, geometry/flow and pump NPSH data.',
    questions: [['tap_location', 'Pressure tap location relative to strainer, valves and pump inlet'], ['range_materials', 'Range, wet materials and isolation valve'], ['flow_context', 'Flow / operating-point context for interpreting pressure changes']],
  },
  {
    id: 'vibration', title: 'Bearing-housing vibration and temperature', tier: 'minimal', channels: ['vibration_rms_mm_s', 'vibration_accel_rms_g', 'vibration_crest_factor', 'bearing_temp_c'],
    decision: 'Is a repeatable mechanical-condition change worth a specialist route measurement?',
    willNotResolve: 'Summary features are not a unique fault identification. One point does not cover every bearing. Housing temperature is not winding temperature.',
    questions: [['location_direction', 'Measurement location and direction (radial / axial) per bearing'], ['mount', 'Rigid mounting method and remount checks'],
      ['bandwidth', 'Measurement bandwidth and feature window (what the sensor computes)'], ['cadence', 'Update cadence (how often a value is reported)']],
    explainer: 'Bandwidth and update cadence are different: a sensor can compute RMS over a 10–1000 Hz band yet report one value every 5 minutes (as T1 pumps in this benchmark do). A fast report interval does not prove usable waveform bandwidth, and a sparse interval can miss short events.',
  },
  {
    id: 'flow_head_power', title: 'Flow plus head and input power', tier: 'instrument', channels: ['flow_m3_h', 'motor_power_kw', 'discharge_pressure_kpa', 'suction_pressure_kpa'],
    decision: 'Has the operating point or wire-to-water performance changed? Verify against a suitable reference.',
    willNotResolve: 'Flow alone does not identify cause or prove savings. Electrical input gives wire-to-water efficiency, not pump shaft efficiency. Pump taps cannot locate a heat-exchanger restriction. No flow trace or efficiency figure is simulated here.',
    questions: [['pipe_survey', 'Pipe / fluid suitability, straight runs and installation geometry (survey required)'], ['reference', 'Reference / verification method for flow'], ['corrections', 'Tap elevation and velocity corrections; synchronisation of channels']],
  },
  {
    id: 'component_dp', title: 'Component differential pressure / extra temperatures', tier: 'instrument', channels: [],
    decision: 'Is restriction across this component, or thermal performance across this exchanger, the question?',
    willNotResolve: 'Requires appropriate taps and sensor locations; pump pressures and one fluid temperature are insufficient. Heat-exchanger thermal diagnosis is outside this benchmark\'s explicit dynamics.',
    questions: [['taps', 'Tap locations across the specific component'], ['temperatures', 'Inlet/outlet temperature points if thermal performance is the question']],
  },
  {
    id: 'valve_winding', title: 'Valve position or winding RTD', tier: 'minimal', channels: ['valve_position_pct', 'motor_winding_temp_c'],
    decision: 'Resolve a specific actuator or motor-thermal question.',
    willNotResolve: 'Position feedback does not prove flow; winding access may require motor work; seal leakage is not covered by the benchmark. No feedback channel does not mean no valve exists.',
    questions: [['access', 'Actuator feedback availability or motor access for an RTD']],
  },
];

export const ORGANIZER_BOM_NOTE = 'Organizer illustrative hardware only; source prices dated 30 October 2026; package totals are assumptions; not independently re-quoted. Package A about EUR 2.8–3.1k, package B about EUR 2.1–2.4k. Installation, enclosure/cabling, software and site/class work are excluded. Mixed VAT/currency in the source; these are not "our minimal installed cost" and are not summed into any option here.';

// Structural check of a stored/edited cost model. Every required category must still be present,
// otherwise a category could silently disappear from the comparison.
const OPTION_KEYS = ['existing', 'minimal', 'instrument'];
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
export function economicsProblems(m) {
  if (!isObj(m)) return ['cost model missing'];
  const problems = [];
  for (const k of ['horizonYears', 'discountRate', 'currency', 'taxBasis']) if (m[k] != null && typeof m[k] !== 'string') problems.push(`${k} is not text`);
  if (typeof m.currency !== 'string' || !m.currency) problems.push('currency missing');
  if (!isObj(m.options)) return [...problems, 'options missing'];
  const required = [...ONE_TIME_CATEGORIES.map(([id]) => [id, 'one-time']), ...RECURRING_CATEGORIES.map(([id]) => [id, 'annual'])];
  for (const o of OPTION_KEYS) {
    const opt = m.options[o];
    if (!isObj(opt)) { problems.push(`${o}: option missing`); continue; }
    if (!Array.isArray(opt.lines) || !opt.lines.every((l) => isObj(l) && typeof l.id === 'string' && ['one-time', 'annual'].includes(l.kind) && ['amount', 'included', 'na'].includes(l.mode))) { problems.push(`${o}: cost lines malformed`); continue; }
    for (const [id, kind] of required) if (!opt.lines.some((l) => l.id === id && l.kind === kind)) problems.push(`${o}: required category ${id} missing`);
    if (!Array.isArray(opt.scheduled) || !opt.scheduled.every(isObj)) problems.push(`${o}: scheduled events malformed`);
    if (!isObj(opt.benefit)) problems.push(`${o}: benefit missing`);
    if (!isObj(opt.nuisance)) problems.push(`${o}: nuisance missing`);
  }
  return problems;
}
