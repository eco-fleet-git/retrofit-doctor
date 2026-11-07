// Diagnosis comparison (docs/tasks/015-diagnosis-comparison-demo.md): pure as-of slicing and source-specific
// explanations for the four reviewed cases in data/diagnosis-comparison.json. No DOM access.
// sliceCase() is the only path from a bundle case to the explanation: before the alert minute has closed it
// returns no result, statistics, raw rows or labels. explainCase() receives only that slice and the static
// passport asset, never retrospective labels. Labels go through sliceCaseLabel() into a separate overlay.
import { parseUtc, formatUtc, formatDuration } from './replay.js';
import { CHANNEL_LABELS } from './knowledge.js';

const label = (c) => CHANNEL_LABELS[c] ?? c;
const lower = (c) => label(c).replace(/^./, (m) => m.toLowerCase());
// Main-card sentences use human channel names; exact ids stay in the technical disclosure (verbatim outputs).
const humanIds = (t) => String(t ?? '').replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (id) => (CHANNEL_LABELS[id] ? lower(id) : id));
const fx = (v, d) => Number(v).toFixed(d);
const human = (t) => String(t ?? '').toLowerCase().replace(/_/g, ' ');
export const minuteRange = (a, b) => `${formatUtc(a).slice(0, 16)}–${formatUtc(b).slice(11)}`;
const hms = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h} h ${String(m).padStart(2, '0')} min ${String(Math.round(s % 60)).padStart(2, '0')} s`; };

// Fixed W1 rule values from the sealed Task010 manifest (src/retrofit_doctor/diagnosis_fusion.py); display only.
export const W1_RULE = { envRatioMin: 4, envGainMin: 2, oneXGainMin: 2, twoXOver1xSplit: 0.5, maxAgeH: 4 };

export function sliceCase(c, clockMs) {
  const alertMs = parseUtc(c.alertUtc);
  const wf = c.z995.waveform;
  const snapMs = wf?.wf_complete_utc ? parseUtc(wf.wf_complete_utc) : null;
  const base = {
    caseId: c.caseId, assetId: c.assetId, split: c.split, clockMs, alertMs,
    minuteStartMs: parseUtc(c.minuteStartUtc), minuteEndMs: parseUtc(c.minuteEndUtc),
    // A completed snapshot exists as a measurement from its completion time; its interpretation is not shown early.
    snapshot: snapMs != null && snapMs <= clockMs ? { id: wf.wf_snapshot_id, completeMs: snapMs } : null,
  };
  if (clockMs < alertMs) return { ...base, available: false };
  const issue = evidenceIssue(c, alertMs);
  if (issue) return { ...base, available: false, evidenceIssue: issue };
  return {
    ...base, available: true,
    b1: { ...c.b1 },
    z995: structuredClone(c.z995),
    rawMinute: c.rawMinute ? structuredClone(c.rawMinute) : null,
  };
}

// Enforced provenance checks: evidence used at an alert must be complete by that alert. Anything later (or a
// stored age that disagrees with the timestamps) is rejected as a whole, never partially interpreted.
export function evidenceIssue(c, alertMs) {
  const w = c.z995?.waveform;
  if (c.z995?.diagnosis_source === 'W1' || w?.wf_complete_utc) {
    const done = w?.wf_complete_utc ? parseUtc(w.wf_complete_utc) : NaN;
    if (Number.isNaN(done)) return c.z995?.diagnosis_source === 'W1' ? 'waveform snapshot has no completion time' : null;
    if (done > alertMs) return 'waveform snapshot completes after the alert time';
    if (w.wf_age_s != null && Math.abs(Number(w.wf_age_s) - (alertMs - done) / 1000) > 1) return 'stored snapshot age disagrees with its completion time';
  }
  const r = c.rawMinute;
  if (r) {
    const lo = parseUtc(c.minuteStartUtc); const hi = parseUtc(c.minuteEndUtc);
    if (hi !== alertMs || r.t.some((t) => !(parseUtc(t) >= lo && parseUtc(t) < hi))) return 'raw rows outside the closed alert minute';
  }
  return null;
}

// Retrospective ground truth for the opt-in overlay only; later timestamps are withheld.
// Per-case evaluation is gated at the alert as well: nothing is revealed before the case's alert time.
export function sliceCaseLabel(c, clockMs) {
  const e = c.label;
  if (!e || clockMs < parseUtc(c.alertUtc) || parseUtc(e.onset_utc) > clockMs) return null;
  const endKnown = e.end_utc != null && parseUtc(e.end_utc) <= clockMs;
  return { event_id: e.event_id, event_class: e.event_class, fault_type: e.fault_type, sensor_tag: e.sensor_tag, onset_utc: e.onset_utc, end_utc: endKnown ? e.end_utc : null, endWithheld: !endKnown };
}

function timingText(s) {
  const age = s.clockMs - s.alertMs;
  const minute = minuteRange(s.minuteStartMs, s.minuteEndMs);
  return age <= 0
    ? `Closed minute ${minute}; available at the replay time.`
    : `Closed minute ${minute}; issued ${formatDuration(age)} before the replay time (${formatUtc(s.clockMs)}). This historical explanation does not change as the clock moves on.`;
}

function measuredList(m) {
  return ['q', 'ps', 'pd', 'n'].map((k) => m?.[k]).filter(Boolean)
    .map((x) => ({ channelId: x.channel, label: label(x.channel), mean: x.mean, std: x.std, count: x.count, unit: x.unit }));
}

function waveformObs(s) {
  const w = s.z995.waveform;
  const f = w.features;
  const ageAtAlert = Number(w.wf_age_s);
  return {
    snapshotId: w.wf_snapshot_id, completeUtc: w.wf_complete_utc, ageAtAlertS: ageAtAlert,
    ageAtAlert: hms(ageAtAlert), ageNow: hms((s.clockMs - parseUtc(w.wf_complete_utc)) / 1000),
    speedCheck: w.wf_speed_check, referenceSnapshots: Number(w.wf_reference_snapshots),
    oneXGain: Math.exp(f.wf_log_1x_gain), twoXGain: Math.exp(f.wf_log_2x_gain), twoXOver1x: f.wf_2x_over_1x,
    envRatio: Math.exp(f.wf_log_env_ratio), envGain: Math.exp(f.wf_log_env_gain),
  };
}

const HYDRAULIC_OUTCOME = {
  emitted: 'Applied; its decision is the new hypothesis.',
  abstained: 'Applied, but abstained: the residual spread was not in the reference tail.',
  unsupported: 'Not applied (applicability gate).',
};

function hydraulicStatus(d) {
  const reason = d.reason ? String(d.reason).replace(/^applicability:/, '') : null;
  const missing = reason?.startsWith('input_unavailable_') ? reason.replace('input_unavailable_', '') : null;
  return {
    outcome: d.outcome, text: HYDRAULIC_OUTCOME[d.outcome] ?? d.outcome, reason: d.reason ?? null,
    missingChannel: missing,
    tailRank: d.tail?.tail_rank ?? null,
  };
}

function technical(s) {
  const z = s.z995; const d = z.ruleDetail;
  return {
    b1: { ...s.b1 }, z995: { event_class: z.event_class, fault_type: z.fault_type, source: z.diagnosis_source, evidence: z.evidence, action: z.recommended_action },
    actionNote: 'Verbatim rule recommendation: a generic rule output, not a confirmed work order.',
    score: `${fx(z.confidence, 3)} · B1's uncalibrated anomaly score, carried over unchanged; not a confidence in the new cause and not a probability`,
    scoreExact: z.confidence,
    ruleDetail: d,
  };
}

export function explainCase(s, asset) {
  if (s.evidenceIssue) {
    return { available: false, kind: 'rejected', text: `Stored evidence for this case was rejected (${s.evidenceIssue}); nothing from it is interpreted.`, snapshot: null };
  }
  if (!s.available) {
    const minute = minuteRange(s.minuteStartMs, s.minuteEndMs);
    return {
      available: false, kind: 'pending',
      text: `The alert minute ${minute} has not closed at the replay time. No completed-minute analysis, B1 output or method result exists yet; it becomes available at ${formatUtc(s.minuteEndMs, { seconds: true })}.`,
      snapshot: s.snapshot ? `A vibration snapshot (${s.snapshot.id}) completed at ${formatUtc(s.snapshot.completeMs, { seconds: true })}. It is interpreted only when an alert is issued.` : null,
    };
  }
  const z = s.z995; const d = z.ruleDetail;
  const src = z.diagnosis_source;
  const installed = new Set(asset.channelsAvailable);
  const hyd = hydraulicStatus(d);
  const before = { label: s.b1.fault_type === 'UNKNOWN'
    ? 'cause unresolved (UNKNOWN)'
    : `${human(s.b1.fault_type)}${s.b1.suspected_channel ? ` on ${lower(s.b1.suspected_channel)}` : ''}`, class: s.b1.event_class };
  const after = { label: `${human(z.fault_type)}${z.suspected_channel ? ` on ${lower(z.suspected_channel)}` : ''}`, class: z.event_class };
  const common = { available: true, timing: timingText(s), before, after, changed: z.fault_type !== s.b1.fault_type || (z.suspected_channel ?? null) !== (s.b1.suspected_channel ?? null), hydraulic: hyd, technical: technical(s) };

  if (src === 'E995') {
    const ch = d.source;
    const t = d.tail; const ref = d.reference; const m = d.minute;
    const share = d.contributions[Object.entries({ pd: 'discharge_pressure_kpa', ps: 'suction_pressure_kpa', q: 'flow_m3_h', n: 'motor_speed_rpm' }).find(([, c]) => c === ch)[0]];
    const margin = share - 0.75;
    return {
      ...common, kind: 'residual', sourceChannel: ch,
      headline: `The ${lower(ch)} signal varies more than the pump-equation check can explain; inspect the ${lower(ch)} measurement before assuming a mechanical fault.`,
      caveat: `This is a hypothesis from the synchronized residual rule, not a proven instrument fault: it does not show that the ${lower(ch)} reading itself is wrong.`,
      measured: measuredList(d.applicability.measured),
      pairedRows: m.paired, rowsTotal: m.rows_total,
      derived: [
        `Residual spread std(E) ${fx(m.std_E_kpa, 3)} kPa in this minute versus ${fx(ref.reference_std_kpa, 3)} kPa first-day median (about ${fx(m.std_E_kpa / ref.reference_std_kpa, 1)}×).`,
        `${t.b === 0 ? `None of the ${t.N}` : `${t.b} of the ${t.N}`} eligible first-day reference minutes had an equal or larger spread: reference-tail rank ${fx(t.tail_rank, 6)} ≤ rule limit ${t.limit}. A rank within the empirical reference, not a p-value or probability.`,
        `${label(ch)} accounts for a covariance share of ${fx(share, 3)} of the residual variance; the rule requires at least 0.75 (margin ${fx(margin, 3)}, narrow). A variance-decomposition term, not a causal confidence.`,
      ],
      alternatives: ['Process dynamics or a transient the steady pump equation does not describe', 'A pump curve that does not match this pump (passport curve, wear)', 'Installation geometry: tap elevations, velocity head, sensor placement', 'The first-day reference may itself contain unusual minutes'],
      gaps: [{ kind: 'limitation', text: `Narrow rule margin: the ${lower(ch)} share exceeds the 0.75 rule value by only ${fx(margin, 3)}.` },
        { kind: 'limitation', text: 'Not supported on validation: no validation pump had all four hydraulic inputs, so this localisation has a train-only gain.' }],
      nextCheck: { text: humanIds(z.recommended_action), reason: `Proposed check. Synchronized traces and an independent ${lower(ch)} instrument help distinguish instrument noise from a real process change before any sensor is replaced.` },
    };
  }

  if (src === 'W1') {
    const w = waveformObs(s);
    const bearing = z.fault_type === 'BEARING_WEAR';
    const features = bearing
      ? [`Bearing outer-race (BPFO) envelope line ${fx(w.envRatio, 1)}× its local noise floor (W1 rule value ≥ ${W1_RULE.envRatioMin}).`,
        `That ratio is ${fx(w.envGain, 1)}× the commissioning reference ratio (rule value ≥ ${W1_RULE.envGainMin}).`]
      : [`1× running-speed amplitude about ${fx(w.oneXGain, 1)}× the empirical commissioning reference (rule value ≥ ${W1_RULE.oneXGainMin}).`,
        `2×/1× amplitude ratio ${fx(w.twoXOver1x, 2)} (≥ ${W1_RULE.twoXOver1xSplit} is read as misalignment-consistent, below as imbalance-consistent).`];
    return {
      ...common, kind: 'waveform',
      headline: `An earlier completed vibration snapshot shows a pattern consistent with ${human(z.fault_type)}; B1 had left the cause unresolved (UNKNOWN). Not a confirmed diagnosis.`,
      caveat: `The snapshot completed ${w.ageAtAlert} before the alert minute and is one radial axis; it cannot confirm ${bearing ? 'bearing damage' : 'misalignment'} by itself.`,
      snapshot: w, features,
      alternatives: bearing
        ? ['Other high-frequency sources (cavitation, looseness, gear or coupling noise)', 'Lubrication condition rather than bearing damage', 'Accelerometer mounting change']
        : ['Imbalance or looseness with harmonics', 'Soft foot or pipe strain', 'Bearing degradation'],
      gaps: [{ kind: 'limitation', text: `Snapshot age at the alert: ${w.ageAtAlert} (W1 accepts up to ${W1_RULE.maxAgeH} h); the machine state at the alert minute is not directly measured.` },
        { kind: 'limitation', text: 'One radial axis only: no axial direction or phase measurement.' },
        ...(hyd.missingChannel ? [{ kind: installed.has(hyd.missingChannel) ? 'no-z' : 'not-installed', text: `Hydraulic check not applied: ${label(hyd.missingChannel)} is ${installed.has(hyd.missingChannel) ? 'unavailable at this minute' : 'not installed on this pump'}. Not assessed by that method, which is not a healthy result.` }] : [])],
      nextCheck: bearing
        ? { text: 'Take a portable envelope spectrum in a second direction and check lubrication before planning a bearing replacement.', reason: 'Proposed check. A second direction and a fresh reading help distinguish bearing damage from lubrication, mounting or other high-frequency sources.' }
        : { text: 'Check coupling alignment and take an axial or phase vibration reading.', reason: 'Proposed check. A second direction and phase help distinguish misalignment from imbalance or looseness, which one radial snapshot cannot separate.' },
    };
  }

  // B1 retained: name the exact reason the residual method could not change it.
  const missing = hyd.missingChannel;
  const present = measuredList(d.applicability?.measured);
  const w1Applies = s.b1.event_class === 'MACHINE' && s.b1.fault_type === 'UNKNOWN';
  return {
    ...common, kind: 'unsupported',
    headline: missing
      ? `The hydraulic check could not run: ${lower(missing)} is ${installed.has(missing) ? 'unavailable at this minute' : 'not installed on this pump'}. The earlier B1 hypothesis (${before.label}) is kept unchanged.`
      : `The selected method did not change the earlier B1 hypothesis (${before.label}).`,
    caveat: 'Not assessed by this method. That is neither a healthy result nor a proven sensor failure.',
    measured: present, missingChannel: missing, missingInstalled: missing ? installed.has(missing) : null,
    w1Note: w1Applies ? null : `The waveform rule refines only a machine UNKNOWN; B1 said ${human(s.b1.fault_type)}, so it was not applied.`,
    alternatives: [],
    gaps: missing ? [{ kind: installed.has(missing) ? 'no-z' : 'not-installed', text: `${label(missing)}: ${installed.has(missing) ? 'installed but unavailable at this minute; reuse and synchronize the existing measurement' : 'not installed (passport inventory). The residual equation needs synchronized flow, suction, discharge and speed'}.` }] : [],
    capability: missing && !installed.has(missing) ? { text: `A synchronized ${lower(missing)} measurement would supply the missing input; the remaining applicability checks would still need to pass. That is a capability argument, not a demonstrated benefit or economic value.`, href: `#/pumps/${s.assetId}/retrofit` } : null,
    nextCheck: { text: humanIds(s.b1.recommended_action), reason: 'Proposed check from the retained B1 rule; it addresses only the B1 hypothesis.' },
  };
}
