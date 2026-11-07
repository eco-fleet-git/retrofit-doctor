// "My systems" (Task021): pure model, validation, CSV import, readiness and local storage. No DOM access.
// A user-defined system is separate from the challenge assets (PUMP-xx) and the SIM portfolio (SIM-xxx): IDs are
// SYS-xxx, data is stored only in this browser, and nothing here runs the benchmark diagnosis engine. Readiness
// describes which analyses the actually received data could support; it is never a health score or a diagnosis.

import { isValidCheck, CHECK_LIMITS } from './check-loop.js';

export const QUESTIONS = ['hydraulic', 'mechanical', 'energy'];
export const SITE_KINDS = ['vessel', 'plant', 'datacentre'];
export const INTERFACES = ['file', 'lan', 'gateway'];
export const STATUSES = ['installed', 'proposed', 'absent'];

// Channel id → CSV header (documented unit in the name) and conceptual point location.
export const CHANNELS = {
  ps: { header: 'suction_pressure_kpa', unit: 'kPa(g)', location: 'suction' },
  pd: { header: 'discharge_pressure_kpa', unit: 'kPa(g)', location: 'discharge' },
  q: { header: 'flow_m3_h', unit: 'm³/h', location: 'line' },
  n: { header: 'motor_speed_rpm', unit: 'rpm', location: 'shaft' },
  power: { header: 'motor_power_kw', unit: 'kW', location: 'drive' },
  vib: { header: 'vibration_rms_mm_s', unit: 'mm/s', location: 'housing' },
  temp: { header: 'bearing_temp_c', unit: '°C', location: 'housing' },
  valve: { header: 'valve_position_pct', unit: '%', location: 'valve' },
};
export const CHANNEL_IDS = Object.keys(CHANNELS);
const HEADER_TO_CH = Object.fromEntries(CHANNEL_IDS.map((c) => [CHANNELS[c].header, c]));

// Purpose-specific proposals (never installed automatically).
export const SENSOR_SETS = {
  hydraulic: ['ps', 'pd', 'q', 'n'],
  mechanical: ['vib', 'temp', 'n'],
  energy: ['power', 'q', 'ps', 'pd'],
};

export const LIMITS = { maxBytes: 2_000_000, maxRows: 10_000, storedRows: 600, maxSystems: 20, maxErrors: 6 };

export function newSystem() {
  return {
    version: 1, id: null, createdAt: null, updatedAt: null,
    site: { name: '', kind: 'plant' }, name: '', question: 'hydraulic',
    equipment: {
      provenance: 'user', // 'user' | 'challenge-example'
      pump: { name: 'Pump', designFlow: '', designHead: '', ratedRpm: '' },
      motor: { name: 'Motor', ratedKw: '' },
      valve: { name: 'Control valve', type: 'control', placement: 'after-pump' }, // placement is a template assumption
    },
    device: { label: '', interface: 'file', endpoint: '', transport: '' },
    channels: Object.fromEntries(CHANNEL_IDS.map((c) => [c, { status: 'absent', location: CHANNELS[c].location }])),
    source: null, // { kind: 'csv' | 'challenge' | 'network', ... }
  };
}

const num = (v) => (v === '' || v == null ? null : Number(String(v).trim()));
// Returns null (unknown), a positive finite number, or NaN for an invalid entry.
export function ratingValue(v) {
  if (v === '' || v == null || String(v).trim() === '') return null;
  if (!/^\s*\d+(\.\d+)?\s*$/.test(String(v))) return NaN;
  const x = num(v);
  return Number.isFinite(x) && x > 0 ? x : NaN;
}

// Step validation: returns { field: errorCode }.
export function validateStep(sys, step) {
  const e = {};
  if (step === 1) {
    if (!sys.site.name.trim()) e['site.name'] = 'required';
    if (!SITE_KINDS.includes(sys.site.kind)) e['site.kind'] = 'required';
    if (!sys.name.trim()) e.name = 'required';
    if (!QUESTIONS.includes(sys.question)) e.question = 'required';
  }
  if (step === 2) {
    if (!sys.equipment.pump.name.trim()) e['equipment.pump.name'] = 'required';
    if (!sys.equipment.motor.name.trim()) e['equipment.motor.name'] = 'required';
    for (const [path, v] of [['equipment.pump.designFlow', sys.equipment.pump.designFlow], ['equipment.pump.designHead', sys.equipment.pump.designHead],
      ['equipment.pump.ratedRpm', sys.equipment.pump.ratedRpm], ['equipment.motor.ratedKw', sys.equipment.motor.ratedKw]]) {
      if (Number.isNaN(ratingValue(v))) e[path] = 'positive';
    }
  }
  if (step === 3) {
    if (!INTERFACES.includes(sys.device.interface)) e['device.interface'] = 'required';
    for (const c of CHANNEL_IDS) if (!STATUSES.includes(sys.channels[c]?.status)) e[`channels.${c}`] = 'required';
    if (/[a-z]+:\/\/[^/\s]*@/i.test(sys.device.endpoint)) e['device.endpoint'] = 'noCredentials';
  }
  return e;
}
export const validateAll = (sys) => Object.assign({}, validateStep(sys, 1), validateStep(sys, 2), validateStep(sys, 3));

// Explicit "Use challenge example": prefill from the PUMP-04 passport with provenance; never silent.
export function applyChallengeExample(sys, asset) {
  const s = structuredClone(sys);
  s.site = { name: s.site.name || 'Example site', kind: s.site.kind };
  s.name = s.name || `Example based on ${asset.assetId}`;
  s.equipment = {
    ...s.equipment, provenance: 'challenge-example', sourceAsset: asset.assetId,
    pump: { name: `${asset.assetId} pump (example)`, designFlow: String(asset.designFlowM3h), designHead: String(asset.designHeadM), ratedRpm: String(asset.ratedRpmMetadata) },
    motor: { name: `${asset.assetId} motor (example)`, ratedKw: String(asset.motorRatedKw) },
  };
  // A curve entered for another pump must not survive a passport swap (Task022): reset it, visibly.
  delete s.equipment.referenceCleared;
  const ref = sys.equipment.reference;
  if (ref && (ref.applies || ref.rpm || ref.name || ref.points?.some((p) => p.q !== '' || p.h !== ''))) s.equipment.referenceCleared = true;
  if (ref) s.equipment.reference = { name: '', status: 'unverified', rpm: '', points: Array.from({ length: 6 }, () => ({ q: '', h: '' })), applies: false };
  return s;
}

// ---- CSV import (offline, in the browser; nothing is uploaded) ----
export const CSV_TEMPLATE = `timestamp_utc,${CHANNEL_IDS.map((c) => CHANNELS[c].header).join(',')}
2026-01-15T08:00:00Z,35.2,262.1,281.0,1340,52.4,2.1,41.5,64
2026-01-15T08:00:01Z,35.0,261.8,,1341,52.6,2.2,41.5,64
`;
const ISO_TZ = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,6})?)?(Z|([+-])(\d{2}):(\d{2}))$/;
// Strict ISO 8601 with a timezone: the calendar date and clock must exist (no 2026-02-30, no 24:00) and the
// offset must be within ±14:00 with minutes < 60. Returns epoch ms or NaN.
export function parseTimestamp(ts) {
  const m = ISO_TZ.exec(ts);
  if (!m) return NaN;
  const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || sec > 59) return NaN;
  const local = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
  if (local.getUTCFullYear() !== y || local.getUTCMonth() !== mo - 1 || local.getUTCDate() !== d) return NaN;
  let off = 0;
  if (m[8] !== 'Z') {
    const oh = Number(m[10]); const om = Number(m[11]);
    if (oh > 14 || om > 59 || (oh === 14 && om > 0)) return NaN;
    off = (m[9] === '+' ? 1 : -1) * (oh * 60 + om);
  }
  const frac = m[7] ? Number(m[7]) * 1000 : 0;
  return local.getTime() + frac - off * 60_000;
}

export function parseCsv(text, { bytes = null } = {}) {
  const err = [];
  const add = (code, extra = {}) => { if (err.length < LIMITS.maxErrors) err.push({ code, ...extra }); };
  const size = bytes ?? new TextEncoder().encode(text).length;
  if (size > LIMITS.maxBytes) return { ok: false, errors: [{ code: 'tooLarge', limit: LIMITS.maxBytes }] };
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== ''); // blank lines are skipped
  if (!lines.length) return { ok: false, errors: [{ code: 'empty' }] };
  const header = lines[0].split(',').map((h) => h.trim());
  if (header[0] !== 'timestamp_utc') add('firstColumn', { value: header[0] });
  const seen = new Set();
  header.slice(1).forEach((h) => {
    if (!HEADER_TO_CH[h]) add('unknownHeader', { value: h });
    else if (seen.has(h)) add('duplicateHeader', { value: h });
    seen.add(h);
  });
  if (header.length < 2) add('noChannels');
  if (lines.length - 1 > LIMITS.maxRows) return { ok: false, errors: [{ code: 'tooManyRows', limit: LIMITS.maxRows }] };
  if (err.length) return { ok: false, errors: err };
  const chans = header.slice(1).map((h) => HEADER_TO_CH[h]);
  const t = []; const values = Object.fromEntries(chans.map((c) => [c, []]));
  let prev = -Infinity;
  for (let i = 1; i < lines.length; i += 1) {
    const line = i + 1; const cells = lines[i].split(',');
    if (cells.length !== header.length) { add('columnCount', { line }); continue; }
    const ts = cells[0].trim();
    const ms = parseTimestamp(ts);
    if (!Number.isFinite(ms)) { add('timestamp', { line, value: ts }); continue; }
    if (ms <= prev) { add(ms === prev ? 'duplicateTime' : 'outOfOrder', { line, value: ts }); continue; }
    prev = ms; t.push(ms);
    chans.forEach((c, k) => {
      const raw = cells[k + 1].trim();
      if (raw === '') { values[c].push(null); return; }
      const x = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isFinite(x)) { add('number', { line, column: CHANNELS[c].header, value: raw }); values[c].push(null); return; }
      values[c].push(x);
    });
  }
  if (err.length) return { ok: false, errors: err };
  if (!t.length) return { ok: false, errors: [{ code: 'noRows' }] };
  return { ok: true, errors: [], channels: chans, t, values, rows: t.length, window: { start: t[0], end: t.at(-1) } };
}

// Rows where every listed channel has a reading at the same timestamp.
function simultaneous(src, ids) {
  if (!ids.every((c) => src.values[c])) return 0;
  let n = 0;
  for (let i = 0; i < src.t.length; i += 1) if (ids.every((c) => src.values[c][i] != null)) n += 1;
  return n;
}

// Bounded summary + evenly downsampled preview rows, plus (Task022) the full analysis series within the import
// limits (≤ 10 000 rows / 2 MB). Older saved sources without `series` and with thinned samples require reimport.
export function compactSource(kind, parsed, meta = {}) {
  const coverage = Object.fromEntries(parsed.channels.map((c) => [c, parsed.values[c].filter((v) => v != null).length]));
  const pairs = { psPd: simultaneous(parsed, ['ps', 'pd']), psPdQ: simultaneous(parsed, ['ps', 'pd', 'q']), energy: simultaneous(parsed, ['ps', 'pd', 'q', 'power']), qN: simultaneous(parsed, ['q', 'n']) };
  const step = Math.max(1, Math.ceil(parsed.rows / LIMITS.storedRows));
  const idx = []; for (let i = 0; i < parsed.rows; i += step) idx.push(i);
  return {
    kind, ...meta, channels: parsed.channels, rowsTotal: parsed.rows, rowsStored: idx.length,
    window: parsed.window, coverage, pairs,
    sample: { t: idx.map((i) => parsed.t[i]), values: Object.fromEntries(parsed.channels.map((c) => [c, idx.map((i) => parsed.values[c][i])])) },
    series: { t: parsed.t.slice(), values: Object.fromEntries(parsed.channels.map((c) => [c, parsed.values[c].slice()])) },
  };
}

// Existing reviewed challenge minute (PUMP-04 rawMinute): only t, ps, pd, q, n. Historical synthetic source.
export function challengeSource(rawMinute) {
  const parsed = {
    channels: ['ps', 'pd', 'q', 'n'], t: rawMinute.t.map((x) => Date.parse(x)), rows: rawMinute.t.length,
    values: { ps: rawMinute.ps_kpa.slice(), pd: rawMinute.pd_kpa.slice(), q: rawMinute.q_m3_h.slice(), n: rawMinute.n_rpm.slice() },
  };
  parsed.window = { start: parsed.t[0], end: parsed.t.at(-1) };
  return compactSource('challenge', parsed, { label: 'PUMP-04 reviewed warning minute (synthetic, historical)', origin: 'web/data/diagnosis-comparison.json → cases[pump04-train].rawMinute' });
}

export function networkSource(device) {
  return { kind: 'network', status: 'configuration-only', endpoint: device.endpoint || '', transport: device.transport || '', channels: [], rowsTotal: 0, rowsStored: 0, coverage: {}, pairs: {} };
}

// A supplied Q/H reference the user confirmed applies to this pump (any status; unverified still qualifies results).
function hasReference(sys) {
  const ref = sys.equipment.reference;
  if (!ref || ref.applies !== true) return false;
  const pts = ref.points.filter((p) => String(p.q).trim() !== '' && String(p.h).trim() !== '').map((p) => [Number(p.q), Number(p.h)]);
  return pts.length >= 2 && pts.every(([q, h], i) => q >= 0 && h > 0 && (!i || q > pts[i - 1][0])) && Number(ref.rpm) > 0;
}

// ---- Readiness ----
// Received = channel has readings in the loaded source AND is configured as installed. A column for a channel
// configured as proposed/absent is a mapping conflict: warned about and not counted.
export function readiness(sys) {
  const src = sys.source;
  const configured = CHANNEL_IDS.filter((c) => sys.channels[c].status === 'installed');
  const proposed = CHANNEL_IDS.filter((c) => sys.channels[c].status === 'proposed');
  const inData = src ? CHANNEL_IDS.filter((c) => (src.coverage?.[c] ?? 0) > 0) : [];
  const conflicts = inData.filter((c) => sys.channels[c].status !== 'installed');
  const locationWarnings = [];
  if (sys.channels.ps.status === 'installed' && sys.channels.ps.location !== 'suction') locationWarnings.push('ps');
  if (sys.channels.pd.status === 'installed' && sys.channels.pd.location !== 'discharge') locationWarnings.push('pd');
  const received = inData.filter((c) => !conflicts.includes(c));
  const has = (c) => received.includes(c);
  const pairOk = (k) => (src?.pairs?.[k] ?? 0) >= 2 && !conflicts.some((c) => ({ psPd: ['ps', 'pd'], psPdQ: ['ps', 'pd', 'q'], energy: ['ps', 'pd', 'q', 'power'] }[k] ?? []).includes(c));
  // One design point (flow + head) is not a pump curve; no curve input exists in this slice.
  const designPoint = ratingValue(sys.equipment.pump.designFlow) > 0 && ratingValue(sys.equipment.pump.designHead) > 0;
  const shortRecording = src && src.window ? (src.window.end - src.window.start) < 3600_000 : false;

  const hydraulic = { id: 'hydraulic', missing: [], can: [] };
  if (!(has('ps') && has('pd') && pairOk('psPd'))) hydraulic.missing.push('psPdSimultaneous');
  if (locationWarnings.length) hydraulic.missing.push('tapLocations');
  if (!hydraulic.missing.length) hydraulic.can.push('pressureRise');
  if (!(has('q') && pairOk('psPdQ'))) hydraulic.missing.push('flowSimultaneous');
  if (!designPoint) hydraulic.missing.push('designPoint');
  if (!hasReference(sys)) hydraulic.missing.push('pumpCurve'); // a curve/reference confirmed to apply (Task022 editor)
  if (!has('n')) hydraulic.missing.push('speedContext'); // the rated speed is passport data, not a measurement
  // With simultaneous flow and a design point, the measured point can be compared with that single design point.
  if (hydraulic.can.length && has('q') && pairOk('psPdQ') && designPoint) hydraulic.can.push('designPointComparison');
  hydraulic.status = hydraulic.can.length ? 'review' : 'notReady';

  const mechanical = { id: 'mechanical', missing: ['waveform'], can: [] };
  if (has('vib')) mechanical.can.push('rmsTrend'); else mechanical.missing.unshift('vibration');
  if (has('temp')) mechanical.can.push('tempTrend');
  mechanical.status = mechanical.can.length ? 'trend' : 'notReady';

  const energy = { id: 'energy', missing: [], can: [] };
  if (!(has('power') && has('q') && has('ps') && has('pd') && pairOk('energy'))) energy.missing.push('energyInputs');
  if (locationWarnings.length) energy.missing.push('tapLocations');
  energy.missing.push('densityGeometry'); // fluid density and tap geometry are unknown here: never a ready efficiency
  if (!energy.missing.filter((m) => m !== 'densityGeometry').length) energy.can.push('wireToWaterPotential');
  energy.status = energy.can.length ? 'potential' : 'notReady';

  const notes = [];
  if (has('valve') && !has('q')) notes.push('valveNotFlow');
  if (shortRecording) notes.push('shortRecording');
  if (src?.kind === 'challenge') notes.push('challengeNoisy');
  if (src?.kind === 'network') notes.push('configurationOnly');
  // Pressure-rise preview only when Ps and Pd are mapped, at the pump taps, with simultaneous readings.
  const previewOk = has('ps') && has('pd') && pairOk('psPd') && !locationWarnings.length;
  return { inData, configured, proposed, received, conflicts, locationWarnings, notes, previewOk, capabilities: { hydraulic, mechanical, energy }, formalDiagnosis: false };
}

// Explicit user action: treat the channels present in the loaded data as installed at their default points.
export function mapDataChannels(sys) {
  const s = structuredClone(sys);
  for (const c of readiness(sys).conflicts) s.channels[c] = { status: 'installed', location: CHANNELS[c].location };
  return s;
}

// Next useful step for the chosen question, from what is actually available.
export function nextStep(sys, r = readiness(sys)) {
  const cap = r.capabilities[sys.question];
  if (!sys.source || sys.source.kind === 'network') return { key: 'loadData' };
  if (r.conflicts.length) return { key: 'resolveMapping', channels: r.conflicts };
  if (sys.question === 'hydraulic') {
    if (cap.missing.includes('psPdSimultaneous')) return { key: 'measurePressures', set: SENSOR_SETS.hydraulic };
    if (cap.missing.includes('flowSimultaneous')) return { key: 'temporaryFlow' };
    return { key: 'verifyIndependently' };
  }
  if (sys.question === 'mechanical') return { key: r.received.includes('vib') ? 'portableSpectrum' : 'temporaryVibration' };
  return { key: cap.can.length ? 'verifyPower' : 'temporaryEnergy', set: SENSOR_SETS.energy };
}

// ---- Local storage ----
const KEY = 'rd-systems-v1';
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
// Shape check for a stored system; anything else is treated as corruption (the store is then not overwritten).
export function isValidSystem(s) {
  if (!isObj(s) || s.version !== 1 || !/^SYS-\d{3}$/.test(s.id) || !isStr(s.name)) return false;
  if (!isObj(s.site) || !isStr(s.site.name) || !SITE_KINDS.includes(s.site.kind) || !QUESTIONS.includes(s.question)) return false;
  const e = s.equipment;
  if (!isObj(e) || !['user', 'challenge-example', 'illustrative-example'].includes(e.provenance) || !isObj(e.pump) || !isObj(e.motor) || !isObj(e.valve)) return false;
  if (![e.pump.name, e.pump.designFlow, e.pump.designHead, e.pump.ratedRpm, e.motor.name, e.motor.ratedKw, e.valve.name].every(isStr)) return false;
  if (e.reference !== undefined) {
    const r = e.reference;
    if (!isObj(r) || !isStr(r.name) || !isStr(r.rpm) || typeof r.applies !== 'boolean' || !['unverified', 'user-confirmed', 'illustrative'].includes(r.status)) return false;
    if (!Array.isArray(r.points) || r.points.length > 20 || !r.points.every((p) => isObj(p) && isStr(p.q) && isStr(p.h))) return false;
  }
  if (s.analysis !== undefined) {
    const a = s.analysis;
    if (!isObj(a) || !isStr(a.density) || !isStr(a.bandPct) || typeof a.geometryAck !== 'boolean' || typeof a.affinity !== 'boolean') return false;
  }
  // Task023 append-only follow-up checks (optional; absent on older saves)
  if (s.checks !== undefined && (!Array.isArray(s.checks) || s.checks.length > CHECK_LIMITS.maxChecks || !s.checks.every(isValidCheck)
    || !s.checks.every((c, i) => c.id === `CHK-${String(i + 1).padStart(3, '0')}`))) return false;
  if (!isObj(s.device) || !INTERFACES.includes(s.device.interface) || !isObj(s.channels)) return false;
  if (!CHANNEL_IDS.every((c) => isObj(s.channels[c]) && STATUSES.includes(s.channels[c].status) && isStr(s.channels[c].location))) return false;
  if (s.source !== null) {
    const src = s.source;
    if (!isObj(src) || !['csv', 'challenge', 'network', 'example'].includes(src.kind) || !Array.isArray(src.channels) || !isObj(src.coverage) || !isObj(src.pairs)) return false;
    if (!src.channels.every((c) => CHANNEL_IDS.includes(c))) return false;
    if (src.kind !== 'network') {
      if (!isObj(src.window) || !Number.isFinite(src.window.start) || !Number.isFinite(src.window.end)) return false;
      if (!isObj(src.sample) || !Array.isArray(src.sample.t) || !src.sample.t.every(Number.isFinite) || !isObj(src.sample.values)) return false;
      const okCell = (v) => v === null || Number.isFinite(v);
      const increasing = (t) => t.every((x, i) => Number.isFinite(x) && (!i || x > t[i - 1]));
      if (!increasing(src.sample.t)) return false;
      if (!src.channels.every((c) => Array.isArray(src.sample.values[c]) && src.sample.values[c].length === src.sample.t.length && src.sample.values[c].every(okCell))) return false;
      if (src.series !== undefined) { // Task022 full analysis series
        const se = src.series;
        if (!isObj(se) || !Array.isArray(se.t) || se.t.length !== src.rowsTotal || se.t.length > LIMITS.maxRows || !increasing(se.t) || !isObj(se.values)) return false;
        if (!src.channels.every((c) => Array.isArray(se.values[c]) && se.values[c].length === se.t.length && se.values[c].every(okCell))) return false;
      }
    }
  }
  return true;
}
export function createSystemsStore(storage) {
  const read = () => {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { ok: true, systems: [] };
      const d = JSON.parse(raw);
      if (d?.version !== 1 || !Array.isArray(d.systems)) return { ok: false, error: 'incompatible', systems: [] };
      if (!d.systems.every(isValidSystem)) return { ok: false, error: 'corrupt', systems: [] };
      return { ok: true, systems: d.systems };
    } catch (e) { return { ok: false, error: e instanceof SyntaxError ? 'corrupt' : 'unavailable', systems: [] }; }
  };
  const write = (systems) => {
    try { storage.setItem(KEY, JSON.stringify({ version: 1, systems })); return { ok: true }; } catch (e) {
      return { ok: false, error: /quota/i.test(`${e?.name} ${e?.message}`) ? 'quota' : 'unavailable' };
    }
  };
  return {
    list: read,
    get: (id) => read().systems.find((s) => s.id === id) ?? null,
    save(sys, now = new Date().toISOString()) {
      const cur = read();
      if (!cur.ok) return { ok: false, error: cur.error };
      const systems = cur.systems.slice();
      const s = structuredClone(sys);
      if (!s.id) {
        if (systems.length >= LIMITS.maxSystems) return { ok: false, error: 'limit' };
        const max = systems.reduce((m, x) => Math.max(m, Number(x.id.slice(4))), 0);
        s.id = `SYS-${String(max + 1).padStart(3, '0')}`; s.createdAt = now;
      }
      s.updatedAt = now;
      const i = systems.findIndex((x) => x.id === s.id);
      if (i >= 0) systems[i] = s; else systems.push(s);
      const w = write(systems);
      return w.ok ? { ok: true, system: s } : w;
    },
    remove(id) { const cur = read(); return cur.ok ? write(cur.systems.filter((s) => s.id !== id)) : { ok: false, error: cur.error }; },
  };
}
