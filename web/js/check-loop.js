// Task023: follow-up independent checks. Pure, no DOM.
// A check is a human annotation entered LATER. It never changes the telemetry, the curve or the original as-of
// assessment. It applies only to its own target minute, only under the configuration it was recorded against
// (fingerprint), and only when the viewed cutoff is at or after its measurement time.
import { parseTimestamp } from './systems-model.js';
import { analysisSeries, assessAt, parseNumber, withDefaults, RULES } from './hydraulic-analysis.js';

// Minutes whose assessment is itself unsupported cannot anchor a comparison.
const UNSUPPORTED = ['noData', 'insufficientRows', 'incompleteMinute', 'stopped', 'transient', 'mixedRegime'];

export const CHECK_LIMITS = { maxChecks: 20, noteMax: 200, instrumentMax: 80, tolMin: 0.1, tolMax: 50, dpZeroKpa: 1 };
export const ORIGINS = ['user', 'illustrative'];

// FNV-1a over a canonical string of everything the comparison depends on: source content, mapping, curve, assumptions.
function fnv(str, h = 0x811c9dc5) {
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function fingerprint(sys) {
  const s = withDefaults(sys); const src = s.source;
  let h = fnv(JSON.stringify({
    src: src ? [src.kind, src.fileName ?? '', src.example ?? '', src.rowsTotal, src.window ?? null, src.channels] : null,
    map: ['ps', 'pd', 'q', 'n'].map((c) => [s.channels[c].status, s.channels[c].location]),
    ref: s.equipment.reference, an: s.analysis,
    eq: { prov: s.equipment.provenance, asset: s.equipment.sourceAsset ?? '', pump: s.equipment.pump, motor: s.equipment.motor, valve: s.equipment.valve },
  }));
  const full = src?.series ?? src?.sample;
  if (full) { // content checksum: a different file with the same name/window is a different record
    h = fnv(full.t.join(','), h);
    for (const c of src.channels) h = fnv((full.values[c] ?? []).join(','), h);
  }
  return h.toString(16).padStart(8, '0');
}

const median = (xs) => { if (!xs.length) return null; const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

// Installed readings in the target minute only (never later data, never whole-file statistics).
export function baseline(sys, targetMinute) {
  const se = analysisSeries(sys);
  if (!se.ok || !se.mappedPressures) return { ok: false, reason: se.ok ? 'mapping' : se.reason };
  const assessment = assessAt(sys, targetMinute + 60_000);
  const { ps, pd, q } = se.v;
  if (UNSUPPORTED.includes(assessment.status) || assessment.incomplete) return { ok: false, reason: 'unsupportedMinute', assessment };
  const { n } = se.v;
  const dps = []; const qs = []; const ns = []; const ts = [];
  for (let i = 0; i < se.t.length; i += 1) {
    const t = se.t[i];
    if (t < targetMinute) continue;
    if (t >= targetMinute + 60_000) break;
    // Unsupported rows (reversed ΔP, negative flow, stopped/negative speed) block the whole minute conservatively:
    // the early ΔP-only / head-only assessment paths do not exclude them as an operating context.
    if ((ps[i] != null && pd[i] != null && pd[i] < ps[i]) || (q && q[i] != null && q[i] < 0) || (n && n[i] != null && n[i] <= 0)) return { ok: false, reason: 'unsupportedMinute', assessment };
    if (ps[i] == null || pd[i] == null) continue;
    dps.push(pd[i] - ps[i]); ts.push(t);
    if (q && q[i] != null && q[i] >= 0) qs.push(q[i]);
    if (n && n[i] != null && n[i] > 0) ns.push(n[i]);
  }
  if (dps.length < RULES.minRows || ts.at(-1) - ts[0] < RULES.minSpanMs) return { ok: false, reason: 'noContext', assessment };
  // Stability is checked here too: the ΔP-only / head-only paths of the assessment return before its transient gate.
  const relRange = (xs) => { const m = median(xs); return xs.length && m ? ((Math.max(...xs) - Math.min(...xs)) / Math.abs(m)) * 100 : 0; };
  if (relRange(qs) > RULES.transientFlowPct || relRange(ns) > RULES.transientSpeedPct) return { ok: false, reason: 'changingRegime', assessment };
  return { ok: true, dp: median(dps), q: qs.length >= RULES.minRows ? median(qs) : null, dpRows: dps.length, qRows: qs.length, assessment };
}

// Form → validated check. Returns { ok, errors{field:code}, check }.
export function validateCheck(sys, input, { now = new Date().toISOString() } = {}) {
  const e = {};
  const q = parseNumber(input.q); const dp = parseNumber(input.dp); const tol = parseNumber(input.tolPct);
  if (q !== null && !(Number.isFinite(q) && q > 0)) e.q = 'positive';
  if (dp !== null && !(Number.isFinite(dp) && dp >= 0)) e.dp = 'nonNegative';
  if (q === null && dp === null) e.values = 'oneRequired';
  const instrument = String(input.instrument ?? '').trim();
  if (!instrument) e.instrument = 'required'; else if (instrument.length > CHECK_LIMITS.instrumentMax) e.instrument = 'tooLong';
  const measuredAt = parseTimestamp(String(input.measuredAt ?? '').trim());
  if (!Number.isFinite(measuredAt)) e.measuredAt = 'timestamp';
  if (!(Number.isFinite(tol) && tol >= CHECK_LIMITS.tolMin && tol <= CHECK_LIMITS.tolMax)) e.tolPct = 'tolerance';
  if (input.regimeAck !== true) e.regimeAck = 'required';
  const note = String(input.note ?? '').trim();
  if (note.length > CHECK_LIMITS.noteMax) e.note = 'tooLong';
  if (!ORIGINS.includes(input.origin)) e.origin = 'required';
  if (!sys.id) e.system = 'saveFirst';
  let base = null;
  if (Number.isFinite(measuredAt) && !Object.keys(e).includes('system')) {
    base = baseline(sys, Math.floor(measuredAt / 60_000) * 60_000);
    if (!base.ok) e.measuredAt = 'noContext';
  }
  if (Object.keys(e).length) return { ok: false, errors: e };
  const n = (sys.checks?.length ?? 0) + 1;
  return {
    ok: true, errors: {},
    check: {
      id: `CHK-${String(n).padStart(3, '0')}`, enteredAt: now, measuredAt, targetMinute: Math.floor(measuredAt / 60_000) * 60_000,
      instrument, q, dp, tolPct: tol, regimeAck: true, note, origin: input.origin, fingerprint: fingerprint(sys),
    },
  };
}

// Append-only: existing entries are copied unchanged; nothing else in the system is touched.
export function appendCheck(sys, check) {
  const checks = sys.checks ?? [];
  if (checks.length >= CHECK_LIMITS.maxChecks) return { ok: false, error: 'checkLimit' };
  return { ok: true, system: { ...structuredClone(sys), checks: [...structuredClone(checks), check] } };
}

export function isValidCheck(c) {
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);
  return c != null && typeof c === 'object' && /^CHK-\d{3}$/.test(c.id) && typeof c.enteredAt === 'string' && Number.isFinite(Date.parse(c.enteredAt))
    && fin(c.measuredAt) && fin(c.targetMinute) && c.targetMinute === Math.floor(c.measuredAt / 60_000) * 60_000
    && typeof c.instrument === 'string' && c.instrument.trim() !== '' && (c.q === null || (fin(c.q) && c.q > 0)) && (c.dp === null || (fin(c.dp) && c.dp >= 0))
    && (c.q !== null || c.dp !== null) && fin(c.tolPct) && c.tolPct >= CHECK_LIMITS.tolMin && c.tolPct <= CHECK_LIMITS.tolMax && c.regimeAck === true
    && typeof c.note === 'string' && ORIGINS.includes(c.origin) && typeof c.fingerprint === 'string';
}

// One channel: agree / differ (outside the entered tolerance) / notChecked / notComparable (no or zero baseline).
function compareOne(value, base, tolPct, zero) {
  if (value == null) return { result: 'notChecked' };
  if (base == null) return { result: 'notComparable', why: 'noBaseline' };
  if (base <= zero) return { result: 'notComparable', why: 'zeroBaseline' };
  const diffPct = ((value - base) / base) * 100;
  return { result: Math.abs(diffPct) <= tolPct ? 'agree' : 'differ', diffPct, base };
}
export function compareCheck(sys, check) {
  const b = baseline(sys, check.targetMinute);
  if (!b.ok) return { ok: false, reason: b.reason };
  return { ok: true, q: compareOne(check.q, b.q, check.tolPct, 0), dp: compareOne(check.dp, b.dp, check.tolPct, CHECK_LIMITS.dpZeroKpa), baseline: b, minuteStatus: b.assessment.status };
}

// Classify every recorded check relative to the current view (selected minute + cutoff + configuration).
// 'applied' only for the selected minute, same fingerprint, measured no later than the cutoff.
export function checksAt(sys, minuteStart, cutoffMs) {
  const fp = fingerprint(sys);
  return (sys.checks ?? []).map((c) => {
    let use = 'applied';
    if (c.fingerprint !== fp) use = 'previousConfig';
    else if (c.measuredAt > cutoffMs || c.targetMinute >= Math.floor(cutoffMs / 60_000) * 60_000) use = 'deferred';
    else if (c.targetMinute !== minuteStart) use = 'otherMinute';
    return { check: c, use, comparison: use === 'applied' ? compareCheck(sys, c) : null };
  });
}

// Revised engineering explanation from ONE whole check: the latest-entered applied check of the selected minute.
// Channels from different checks (other times, instruments or origins) are never combined; earlier ones stay history.
export function revisedExplanation(applied) {
  const latest = applied.filter((a) => a.use === 'applied').at(-1);
  if (!latest) return { key: 'noRevision', next: 'noRevision' };
  if (!latest.comparison?.ok) return { key: 'noRevision', next: 'noRevision', checkId: latest.check.id, origin: latest.check.origin, reason: latest.comparison?.reason };
  const q = latest.comparison.q.result; const dp = latest.comparison.dp.result;
  const status = latest.comparison.minuteStatus;
  const mismatch = status === 'below' || status === 'above';
  let key;
  if (q === 'differ' && dp === 'differ') key = 'bothDiffer';
  else if (q === 'differ') key = 'flowDiffers';
  else if (dp === 'differ') key = 'dpDiffers';
  // Only a 'within' verdict establishes "no mismatch"; ΔP-only / head-only / outside-reference minutes have no curve conclusion.
  else if (q === 'agree' && dp === 'agree') key = mismatch ? 'bothAgreeMismatch' : status === 'within' ? 'bothAgreeNoMismatch' : 'bothReadingsAgreeOnly';
  else if (q === 'agree') key = 'flowAgrees';
  else if (dp === 'agree') key = 'dpAgrees';
  else key = 'noRevision';
  const next = { bothDiffer: 'verifyMeasurements', flowDiffers: 'verifyFlow', dpDiffers: 'verifyPressure', bothAgreeMismatch: 'investigateCause', bothAgreeNoMismatch: 'continueRecording', bothReadingsAgreeOnly: 'completeContext', flowAgrees: 'checkDp', dpAgrees: 'checkFlow', noRevision: 'noRevision' }[key];
  return { key, next, q, dp, minuteStatus: status, checkId: latest.check.id, origin: latest.check.origin };
}

// Authored values for the illustrative low-head example at 10:19 (agreeing) and a discrepant variant.
export const ILLUSTRATIVE_FILL = {
  agree: { q: '149.9', dp: '284.8', instrument: 'Illustrative clamp-on flow meter + test gauge (simulated)', tolPct: '5' },
  discrepant: { q: '128', dp: '284.8', instrument: 'Illustrative clamp-on flow meter + test gauge (simulated)', tolPct: '5' },
};
