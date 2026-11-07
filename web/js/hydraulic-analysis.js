// Task022: explainable hydraulic consistency check on a user's imported data. Pure, no DOM.
// Separate from the benchmark inference (comparison.js / explain.js): nothing here is a validated fault classifier.
// It compares the measured head in ONE closed UTC minute with a user-supplied pump reference and says what cannot
// be distinguished and which check would help. Physics: H ≈ 1000·(Pd − Ps)/(ρ·g) with velocity/elevation terms
// neglected (equal-area, equal-height taps, same gauge reference — user-acknowledged); affinity laws Q∝n, H∝n²
// (same impeller and fluid, approximate). Sources: KSB pump lexicon "Head" and "Pump affinity laws".
import { CHANNELS } from './systems-model.js';

export const G = 9.80665;
export const RULES = {
  minRows: 3, minSpanMs: 10_000, // per-minute evidence: at least 3 simultaneous rows spanning ≥ 10 s
  speedBandPct: 2, // without affinity scaling the measured speed must be within ±2 % of the reference speed
  transientSpeedPct: 5, transientFlowPct: 10, // (max − min)/median within the minute
  maxExcludedPct: 10, // more unsupported rows than this in the minute → no verdict (mixed regime)
  edgeMs: 5_000, // a minute whose rows start/end further than max(2·cadence, 5 s) from its edges is incomplete
  timelineMinutes: 240,
};
export const REFERENCE_STATUSES = ['unverified', 'user-confirmed', 'illustrative'];
export const SOURCES = [
  'https://www.ksb.com/en-global/centrifugal-pump-lexicon/article/head-1115612',
  'https://www.ksb.com/en-global/centrifugal-pump-lexicon/article/pump-affinity-laws-1117584',
];

// Same strict decimal syntax everywhere (rejects Infinity, hex, exponents): null = blank.
export const parseNumber = (v) => (v === '' || v == null || String(v).trim() === '' ? null : (/^\s*[-+]?(\d+(\.\d*)?|\.\d+)\s*$/.test(String(v)) ? Number(v) : NaN));

// Old saved systems have no reference/assumption fields: missing means unknown (never written back implicitly).
export function emptyReference() { return { name: '', status: 'unverified', rpm: '', points: Array.from({ length: 6 }, () => ({ q: '', h: '' })), applies: false }; }
export function emptyAssumptions() { return { density: '', geometryAck: false, affinity: false, bandPct: '10' }; }
export function withDefaults(sys) {
  const s = structuredClone(sys);
  s.equipment.reference ??= emptyReference();
  s.analysis ??= emptyAssumptions();
  return s;
}

// Reference curve: 2–20 Q/H pairs, Q strictly increasing and ≥ 0, H > 0 (not forced monotonic), rpm > 0.
export function parseReference(ref) {
  if (!ref) return { ok: false, empty: true, errors: [] };
  const rows = ref.points.filter((p) => String(p.q).trim() !== '' || String(p.h).trim() !== '');
  const rpm = parseNumber(ref.rpm);
  if (!rows.length && rpm == null) return { ok: false, empty: true, errors: [] };
  const errors = [];
  const pts = [];
  rows.forEach((p, i) => {
    const q = parseNumber(p.q); const h = parseNumber(p.h);
    if (!Number.isFinite(q) || q < 0) errors.push({ code: 'refQ', row: i + 1 });
    else if (!Number.isFinite(h) || h <= 0) errors.push({ code: 'refH', row: i + 1 });
    else if (pts.length && q <= pts.at(-1).q) errors.push({ code: 'refOrder', row: i + 1 });
    else pts.push({ q, h });
  });
  if (rows.length < 2 || rows.length > 20) errors.push({ code: 'refCount' });
  if (!Number.isFinite(rpm) || rpm <= 0) errors.push({ code: 'refRpm' });
  return errors.length ? { ok: false, empty: false, errors } : { ok: true, points: pts, rpm, errors: [] };
}

// Piecewise-linear interpolation strictly inside the supplied range; null outside (never extrapolates).
export function interpHead(points, q) {
  if (!(q >= points[0].q && q <= points.at(-1).q)) return null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    if (q <= b.q) return a.h + ((q - a.q) / (b.q - a.q)) * (b.h - a.h);
  }
  return null;
}
export const headFromPressures = (psKpa, pdKpa, rho) => (1000 * (pdKpa - psKpa)) / (rho * G);

// Expected head at the measured point. affinity: Qref = Q·nref/n, H = Hcurve(Qref)·(n/nref)². Otherwise the measured
// speed must be within ±speedBandPct of the reference speed (the rated rpm is never substituted).
export function expectedHead(ref, q, n, { affinity }) {
  if (affinity) {
    const qRef = (q * ref.rpm) / n; const hRef = interpHead(ref.points, qRef);
    return hRef == null ? { h: null, reason: 'outsideRange', qRef } : { h: hRef * (n / ref.rpm) ** 2, qRef, hRef };
  }
  if (Math.abs(n - ref.rpm) / ref.rpm > RULES.speedBandPct / 100) return { h: null, reason: 'speedBand' };
  const h = interpHead(ref.points, q);
  return h == null ? { h: null, reason: 'outsideRange' } : { h, qRef: q, hRef: h };
}

const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const relRange = (xs) => { const m = median(xs); return m ? ((Math.max(...xs) - Math.min(...xs)) / Math.abs(m)) * 100 : 0; };
function lowerBound(t, x) { let lo = 0; let hi = t.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (t[mid] < x) lo = mid + 1; else hi = mid; } return lo; }

// Full analysis series of MAPPED channels only. Mapping = installed status + column present (+ Ps/Pd at the pump taps);
// it never depends on whole-record coverage, so values appearing only after the cutoff cannot change earlier results.
// Legacy sources thinned to a sample cannot be diagnosed (reimport).
export function analysisSeries(sys) {
  const src = sys.source;
  if (!src || src.kind === 'network') return { ok: false, reason: 'noSource' };
  const full = src.series ?? (src.rowsStored === src.rowsTotal ? src.sample : null);
  if (!full) return { ok: false, reason: 'reimportNeeded' };
  const mapped = (c) => sys.channels[c]?.status === 'installed' && src.channels.includes(c) && Array.isArray(full.values[c]);
  const v = {};
  for (const c of ['ps', 'pd', 'q', 'n', 'vib', 'temp']) v[c] = mapped(c) ? full.values[c] : null;
  const taps = sys.channels.ps.location === CHANNELS.ps.location && sys.channels.pd.location === CHANNELS.pd.location;
  return { ok: true, t: full.t, v, mappedPressures: mapped('ps') && mapped('pd') && taps };
}

// Settings derived from the system; anything unconfirmed blocks the corresponding step instead of being assumed.
export function settings(sys) {
  const s = withDefaults(sys);
  const rho = parseNumber(s.analysis.density);
  const band = parseNumber(s.analysis.bandPct);
  const ref = parseReference(s.equipment.reference);
  return {
    rho: Number.isFinite(rho) && rho > 0 ? rho : null,
    geometryAck: s.analysis.geometryAck === true,
    affinity: s.analysis.affinity === true,
    bandPct: Number.isFinite(band) && band >= 1 && band <= 50 ? band : null,
    ref: ref.ok ? ref : null,
    refApplies: s.equipment.reference.applies === true,
    refStatus: s.equipment.reference.status,
  };
}

// Assess exactly one minute [start, start+60 s) from its own rows. Result depends on nothing outside that minute.
export function assessMinuteRows(series, start, cfg) {
  const end = start + 60_000;
  const i0 = lowerBound(series.t, start); const i1 = lowerBound(series.t, end);
  const out = { minuteStart: start, minuteEnd: end, rows: i1 - i0, excluded: {}, used: 0 };
  if (!out.rows) return { ...out, status: 'noData' };
  const ex = (k) => { out.excluded[k] = (out.excluded[k] ?? 0) + 1; };
  const { ps, pd, q, n } = series.v;
  // incomplete minute (gap at either edge, e.g. a record that ends mid-minute): observations only, no verdict
  const ts = series.t.slice(i0, i1);
  const cadence = ts.length > 1 ? median(ts.slice(1).map((x, k) => x - ts[k])) : 60_000;
  const edge = Math.max(2 * cadence, RULES.edgeMs);
  out.incomplete = ts[0] - start > edge || end - ts.at(-1) > edge;
  const dp = []; const curveRows = [];
  for (let i = i0; i < i1; i += 1) {
    const a = ps[i]; const b = pd[i];
    if (a == null || b == null) { ex('missingPressure'); continue; }
    if (b < a) { ex('reversedDp'); continue; }
    const nn = n?.[i] ?? null; const qq = q?.[i] ?? null;
    if (nn != null && nn < 0) { ex('negativeSpeed'); continue; }
    if (nn === 0) { ex('stopped'); continue; }
    if (qq != null && qq < 0) { ex('negativeFlow'); continue; }
    dp.push({ t: series.t[i], dp: b - a });
    if (cfg.rho && cfg.geometryAck && cfg.ref && cfg.refApplies && cfg.bandPct) {
      if (qq == null) { ex('missingFlow'); continue; }
      if (nn == null) { ex('missingSpeed'); continue; }
      const e = expectedHead(cfg.ref, qq, nn, cfg);
      if (e.h == null) { ex(e.reason); continue; }
      const h = headFromPressures(a, b, cfg.rho);
      curveRows.push({ t: series.t[i], q: qq, n: nn, h, hExp: e.h, res: (h - e.h) / e.h, qRef: e.qRef, hAtRef: cfg.affinity ? h * (cfg.ref.rpm / nn) ** 2 : h });
    }
  }
  const span = (xs) => (xs.length ? xs.at(-1).t - xs[0].t : 0);
  out.dpMedian = median(dp.map((x) => x.dp));
  out.dpRows = dp.length;
  if (dp.length < RULES.minRows || span(dp) < RULES.minSpanMs) {
    const stopped = (out.excluded.stopped ?? 0) > 0 && dp.length === 0;
    return { ...out, status: stopped ? 'stopped' : 'insufficientRows' };
  }
  if (cfg.rho && cfg.geometryAck) out.headMedian = (1000 * out.dpMedian) / (cfg.rho * G);
  if (!cfg.rho || !cfg.geometryAck) return { ...out, status: 'deltaPOnly', reasons: [...(!cfg.rho ? ['density'] : []), ...(!cfg.geometryAck ? ['geometry'] : [])] };
  if (!cfg.ref || !cfg.refApplies || !cfg.bandPct) return { ...out, status: 'headOnly', reasons: [!cfg.ref ? 'reference' : !cfg.refApplies ? 'applicability' : 'band'] };
  if (!q) return { ...out, status: 'headOnly', reasons: ['flow'] };
  if (!n) return { ...out, status: 'headOnly', reasons: ['speed'] };
  // transient regime: changing speed or flow in the minute blocks a steady comparison
  const qs = []; const ns = [];
  for (let i = i0; i < i1; i += 1) { if (q[i] != null && q[i] >= 0) qs.push(q[i]); if (n[i] != null && n[i] > 0) ns.push(n[i]); }
  out.speedRangePct = ns.length ? relRange(ns) : null; out.flowRangePct = qs.length ? relRange(qs) : null;
  if (out.speedRangePct > RULES.transientSpeedPct || out.flowRangePct > RULES.transientFlowPct) return { ...out, status: 'transient' };
  out.used = curveRows.length;
  const excludedCount = Object.values(out.excluded).reduce((a, b) => a + b, 0);
  out.excludedPct = (excludedCount / out.rows) * 100;
  if (curveRows.length < RULES.minRows || span(curveRows) < RULES.minSpanMs) {
    const why = ['outsideRange', 'speedBand', 'missingFlow', 'missingSpeed'].filter((k) => out.excluded[k]);
    const onlyMissing = why.length && why.every((k) => k === 'missingFlow' || k === 'missingSpeed');
    // missing Q/n readings inside the minute: normalised to the same reasons as an unmapped channel
    if (onlyMissing) return { ...out, status: 'headOnly', reasons: why.map((k) => (k === 'missingFlow' ? 'flow' : 'speed')) };
    return { ...out, status: 'insufficientReference', reasons: why.length ? why.filter((k) => k === 'outsideRange' || k === 'speedBand').concat(why.filter((k) => k === 'missingFlow' || k === 'missingSpeed')) : ['rows'] };
  }
  out.h = median(curveRows.map((r) => r.h)); out.hExp = median(curveRows.map((r) => r.hExp)); out.residualPct = median(curveRows.map((r) => r.res)) * 100;
  out.qMedian = median(curveRows.map((r) => r.q)); out.nMedian = median(curveRows.map((r) => r.n));
  out.qRefMedian = median(curveRows.map((r) => r.qRef)); out.hAtRefMedian = median(curveRows.map((r) => r.hAtRef));
  // Unsupported rows mixed into the minute: never present the supported subset as the whole minute.
  if (out.excludedPct > RULES.maxExcludedPct) return { ...out, status: 'mixedRegime' };
  if (out.incomplete) return { ...out, status: 'incompleteMinute' };
  out.status = out.residualPct < -cfg.bandPct ? 'below' : out.residualPct > cfg.bandPct ? 'above' : 'within';
  return out;
}

// As-of assessment: only the latest CLOSED minute (end ≤ cutoff). No fill from earlier minutes, nothing after cutoff.
export function assessAt(sys, cutoffMs) {
  const end = Math.floor(cutoffMs / 60_000) * 60_000;
  const base = { cutoff: cutoffMs, minuteStart: end - 60_000, minuteEnd: end };
  const se = analysisSeries(sys);
  if (!se.ok) return { ...base, status: se.reason };
  if (!se.mappedPressures) return { ...base, status: 'mappingNeeded' };
  const cfg = settings(sys);
  const r = { ...base, ...assessMinuteRows(se, end - 60_000, cfg), qualified: cfg.refStatus !== 'user-confirmed', refStatus: cfg.refStatus, affinity: cfg.affinity, bandPct: cfg.bandPct };
  // Descriptive mechanical values in the same minute (never a bearing diagnosis or a severity class).
  const i0 = lowerBound(se.t, end - 60_000); const i1 = lowerBound(se.t, end);
  for (const c of ['vib', 'temp']) if (se.v[c]) r[`${c}Median`] = median(se.v[c].slice(i0, i1).filter((x) => x != null));
  return r;
}

// Per-minute series for the time chart: computed per minute (prefix invariant), only minutes closed by the cutoff.
export function timeline(sys, cutoffMs) {
  const se = analysisSeries(sys);
  if (!se.ok || !se.mappedPressures || !se.t.length) return [];
  const cfg = settings(sys);
  const last = Math.floor(cutoffMs / 60_000) * 60_000 - 60_000;
  const first = Math.max(Math.floor(se.t[0] / 60_000) * 60_000, last - (RULES.timelineMinutes - 1) * 60_000);
  const out = [];
  for (let m = first; m <= last; m += 60_000) {
    const a = assessMinuteRows(se, m, cfg);
    out.push({ t: m, status: a.status, residualPct: a.residualPct ?? null, dpMedian: a.status === 'noData' || a.dpRows < RULES.minRows ? null : a.dpMedian, qMedian: a.qMedian ?? null, nMedian: a.nMedian ?? null });
  }
  return out;
}

// Duration and recurrence (Task023), from closed minutes in the lookback only (prefix invariant).
// A run = consecutive minutes back from the selected minute with the SAME verdict direction and a comparable regime:
// minute Q/n medians within ±10 % / ±5 % of the selected minute (a fixed anchor, so slow drift cannot chain).
// Anything else breaks the run: no data, invalid, transient, incomplete, within band, direction or regime change.
// "Sustained" = ≥ 3 such minutes. It is a prototype criterion, not proof of wear; a return to the band is not a repair.
export const EPISODE = { minMinutes: 3, flowTolPct: 10, speedTolPct: 5 };
const near = (x, a, pct) => x != null && a != null && (a > 0 ? Math.abs(x - a) / a <= pct / 100 : x === a);
export function persistence(sys, cutoffMs) {
  const tl = timeline(sys, cutoffMs);
  if (!tl.length) return null;
  const se = analysisSeries(sys);
  const dataStart = Math.floor(se.t[0] / 60_000) * 60_000;
  const cur = tl.at(-1);
  const base = { lookbackStart: tl[0].t, lookbackMinutes: tl.length, truncated: tl[0].t > dataStart, current: cur.status, minuteStart: cur.t };
  if (cur.status !== 'below' && cur.status !== 'above') return { ...base, run: 0, sustained: false, episodes: [] };
  const anchor = { q: cur.qMedian, n: cur.nMedian };
  const match = (m) => m.status === cur.status && near(m.qMedian, anchor.q, EPISODE.flowTolPct) && near(m.nMedian, anchor.n, EPISODE.speedTolPct);
  let i = tl.length - 1;
  while (i >= 0 && match(tl[i])) i -= 1;
  const startIdx = i + 1; const run = tl.length - startIdx;
  // earlier episodes of the same direction and comparable regime, separated by at least one non-matching minute
  const episodes = []; let g = null;
  for (let k = 0; k < startIdx; k += 1) {
    if (match(tl[k])) { if (!g) { g = { start: tl[k].t, minutes: 0, atLeast: k === 0 }; episodes.push(g); } g.minutes += 1; } else g = null;
  }
  return { ...base, run, runStart: tl[startIdx].t, sustained: run >= EPISODE.minMinutes, atLeast: startIdx === 0, anchor, episodes };
}

// Cutoff choices: minute boundaries from the end of the first data minute to the end of the last data minute.
export function cutoffRange(sys) {
  const se = analysisSeries(sys);
  if (!se.ok || !se.t.length) return null;
  return { min: Math.floor(se.t[0] / 60_000) * 60_000 + 60_000, max: Math.floor(se.t.at(-1) / 60_000) * 60_000 + 60_000 };
}

// Explanation chain and smallest useful next check. Keys are translated in the view.
export function explainAssessment(a, sys) {
  const s = a.status;
  const e = { observation: s, causes: [], ambiguity: null, next: null, outcomes: [] };
  const mech = sys.question === 'mechanical'; const energy = sys.question === 'energy';
  if (['noSource', 'reimportNeeded', 'mappingNeeded'].includes(s)) e.next = { noSource: 'loadData', reimportNeeded: 'reimport', mappingNeeded: 'confirmMapping' }[s];
  else if (s === 'noData' || s === 'insufficientRows' || s === 'incompleteMinute') { e.next = 'checkRecording'; }
  else if (s === 'stopped') e.next = 'runningRegime';
  else if (s === 'deltaPOnly') e.next = 'installationInfo';
  else if (s === 'headOnly') e.next = { reference: 'obtainCurve', applicability: 'confirmCurve', band: 'setBand', flow: 'temporaryFlow', speed: 'readDriveSpeed' }[a.reasons[0]];
  else if (s === 'transient') e.next = 'repeatStable';
  else if (s === 'insufficientReference') e.next = a.reasons.includes('speedBand') ? 'speedReference' : a.reasons.includes('outsideRange') ? 'extendReference' : 'checkRecording';
  else if (s === 'mixedRegime') e.next = 'separateRegimes';
  else if (s === 'below' || s === 'above') {
    // A changed system resistance moves the point ALONG the curve; it does not by itself create a head gap at the same Q and n.
    e.causes = s === 'below' ? ['referenceMismatch', 'flowBias', 'pressureBias', 'internalWear', 'suctionGas'] : ['referenceMismatch', 'flowBias', 'pressureBias', 'impellerOrSpeed'];
    e.ambiguity = 'sameInstruments';
    // An unverified reference is checked first: no instrument purchase on an unconfirmed curve. An illustrative
    // (authored demo) reference shows the hypothetical instrument check, framed as part of that scenario.
    e.next = a.refStatus === 'unverified' ? 'verifyReferenceFirst' : 'verifyIndependently';
    if (a.refStatus === 'illustrative') e.scenario = true;
    e.outcomes = ['agree', 'disagree'];
  } else if (s === 'within') { e.next = 'continueRecording'; e.causes = []; }
  if (a.qualified && ['below', 'above', 'within'].includes(s)) e.qualifier = a.refStatus;
  if (mech) e.questionNote = 'mechanicalBlind';
  if (energy) e.questionNote = 'energyNotIncluded';
  return e;
}

// ---- Illustrative examples (authored synthetic; not manufacturer data, not benchmark accuracy) ----
export const EXAMPLE_REFERENCE = { name: 'Illustrative curve (authored, not a manufacturer curve)', status: 'illustrative', rpm: '1480', applies: true,
  points: [[0, 42], [50, 41], [100, 39], [150, 35.5], [200, 30], [250, 23]].map(([q, h]) => ({ q: String(q), h: String(h) })) };
export const EXAMPLE_KINDS = ['stable', 'lowHead', 'transient', 'missingFlow', 'outsideRange'];
const RHO = 998;
export function exampleCsv(kind) {
  const ref = parseReference(EXAMPLE_REFERENCE);
  const start = Date.UTC(2026, 2, 2, 10, 0, 0);
  const lines = [kind === 'missingFlow' ? 'timestamp_utc,suction_pressure_kpa,discharge_pressure_kpa,motor_speed_rpm' : 'timestamp_utc,suction_pressure_kpa,discharge_pressure_kpa,flow_m3_h,motor_speed_rpm'];
  for (let i = 0; i < 20 * 60; i += 1) {
    const w = Math.sin(i / 7) * 0.5 + Math.sin(i / 3.1) * 0.3; // deterministic small noise
    let n = 1480 + w * 2; let q = (kind === 'outsideRange' ? 280 : 150) + w;
    if (kind === 'transient') { const k = 0.88 + 0.12 * Math.abs(Math.sin(i / 25)); n = 1480 * k; q = 150 * k; }
    const hCurve = kind === 'outsideRange' ? 23 - (q - 250) * 0.14 : interpHead(ref.points, (q * 1480) / n) * (n / 1480) ** 2;
    const factor = kind === 'lowHead' && i >= 8 * 60 ? 0.82 : 1;
    const ps = 50 + w * 0.4; const pd = ps + (hCurve * factor * RHO * G) / 1000 + w * 0.6;
    const ts = new Date(start + i * 1000).toISOString().replace('.000Z', 'Z');
    lines.push(kind === 'missingFlow' ? `${ts},${ps.toFixed(2)},${pd.toFixed(2)},${n.toFixed(1)}` : `${ts},${ps.toFixed(2)},${pd.toFixed(2)},${q.toFixed(2)},${n.toFixed(1)}`);
  }
  return `${lines.join('\n')}\n`;
}
// Builds a NEW draft (never overwrites existing user data) with illustrative provenance throughout.
export function exampleSystem(base, kind, parsed, compact, { name } = {}) {
  const s = withDefaults(base);
  s.site = { name: 'Illustrative example site', kind: 'plant' };
  s.name = name ?? `Illustrative example · ${kind}`;
  s.question = 'hydraulic';
  s.equipment.provenance = 'illustrative-example';
  s.equipment.pump = { name: 'Illustrative pump', designFlow: '150', designHead: '35.5', ratedRpm: '1480' };
  s.equipment.reference = structuredClone(EXAMPLE_REFERENCE);
  s.analysis = { density: String(RHO), geometryAck: true, affinity: kind === 'transient', bandPct: '10' };
  for (const c of parsed.channels) s.channels[c] = { status: 'installed', location: { ps: 'suction', pd: 'discharge', q: 'line', n: 'shaft' }[c] };
  s.source = compact('example', parsed, { fileName: `illustrative-${kind}.csv`, example: kind });
  return s;
}
