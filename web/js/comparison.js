// Diagnosis comparison (docs/tasks/015-diagnosis-comparison-demo.md): pure as-of slicing and source-specific
// explanations for the four reviewed cases in data/diagnosis-comparison.json. No DOM access.
// sliceCase() is the only path from a bundle case to the explanation: before the alert minute has closed it
// returns no result, statistics, raw rows or labels. explainCase() receives only that slice and the static
// passport asset, never retrospective labels. Labels go through sliceCaseLabel() into a separate overlay.
import { parseUtc, formatUtc, formatDuration } from './replay.js';
import { CHANNEL_LABELS } from './knowledge.js';
import { CHANNEL_RU, durationHms } from './i18n.js';

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

function explainCaseEn(s, asset) {
  if (s.evidenceIssue) {
    return { available: false, kind: 'rejected', text: `Stored evidence for this case was rejected (${s.evidenceIssue}); nothing from it is interpreted.`, snapshot: null };
  }
  if (!s.available) {
    const minute = minuteRange(s.minuteStartMs, s.minuteEndMs);
    return {
      available: false, kind: 'pending',
      text: `The warning minute ${minute} has not closed at this time, so no analysis, earlier-method output or check result exists for it yet. It becomes available at ${formatUtc(s.minuteEndMs, { seconds: true })}.`,
      snapshot: s.snapshot ? `A vibration recording (${s.snapshot.id}) completed at ${formatUtc(s.snapshot.completeMs, { seconds: true })}. It is interpreted only when a warning is issued.` : null,
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
        `Residual spread std(E) ${fx(m.std_E_kpa, 3)} kPa in this minute versus ${fx(ref.reference_std_kpa, 3)} kPa median of the first-recorded-day reference minutes (about ${fx(m.std_E_kpa / ref.reference_std_kpa, 1)}×). E is measured minus calculated pressure rise; its spread, not its mean, is tested.`,
        `${t.b === 0 ? `None of the ${t.N}` : `${t.b} of the ${t.N}`} eligible first-recorded-day reference minutes had an equal or larger spread: reference-tail rank ${fx(t.tail_rank, 6)} ≤ rule limit ${t.limit}. A rank within the empirical reference, not a p-value or probability.`,
        `${label(ch)} accounts for a covariance share of ${fx(share, 3)} of the residual variance; the rule requires at least 0.75 (margin ${fx(margin, 3)}, narrow). A variance-decomposition term, not a causal confidence.`,
      ],
      alternatives: ['Process dynamics or a transient the steady pump equation does not describe', 'A pump curve that does not match this pump (passport curve, wear)', 'Installation geometry: tap elevations, velocity head, sensor placement', 'The first-recorded-day reference may itself contain unusual minutes'],
      gaps: [{ kind: 'limitation', text: `Narrow rule margin: the ${lower(ch)} share exceeds the 0.75 rule value by only ${fx(margin, 3)}.` },
        { kind: 'limitation', text: 'Not supported on validation: no validation pump had all four hydraulic inputs, so this localisation has a train-only gain.' }],
      // Plain-language layer for the first screen; exact values and rule terms stay in `derived`/technical.
      plain: {
        title: `Check the ${lower(ch)} measurement`,
        summary: `${label(ch)} fluctuations may come from the measurement itself; an independent check is needed.`,
        observations: [
          `The difference between the measured and the calculated pressure rise fluctuates more than in ${t.b === 0 ? 'any' : 'most'} of the ${t.N} reference minutes from this pump's first recorded day.`,
          `Most of that fluctuation moves together with the ${lower(ch)} reading, so that measurement is the first thing to check.`,
          'The reference minutes come from this pump\'s first recorded day, which is not verified healthy.',
        ],
        caution: 'Close to the rule boundary; an independent check is needed.',
        uncertainty: `This result is close to the rule boundary; verify with an independent measurement before replacing anything. The pressure-and-flow check has support only from training pumps; no validation pump had all four inputs.`,
        metrics: [
          { label: 'Fluctuation of the measured-minus-calculated pressure rise', value: `${fx(m.std_E_kpa, 1)} kPa`, note: `typical in reference minutes: ${fx(ref.reference_std_kpa, 1)} kPa`, kind: 'calculated' },
          { label: 'Synchronized samples', value: `${m.paired} of ${m.rows_total}`, note: 'one per second in this minute', kind: 'measured' },
        ],
      },
      nextCheck: { text: humanIds(z.recommended_action), reason: `Proposed check. Synchronized traces and an independent ${lower(ch)} instrument help distinguish instrument noise from a real process change before any sensor is replaced.` },
    };
  }

  if (src === 'W1') {
    const w = waveformObs(s);
    const bearing = z.fault_type === 'BEARING_WEAR';
    const features = bearing
      ? [`Bearing outer-race (BPFO) envelope line ${fx(w.envRatio, 1)}× its local noise floor (W1 rule value ≥ ${W1_RULE.envRatioMin}).`,
        `That line-to-background ratio is ${fx(w.envGain, 1)}× the same ratio in the initial reference recordings (a ratio of ratios, not an absolute amplitude; rule value ≥ ${W1_RULE.envGainMin}).`]
      : [`1× running-speed amplitude about ${fx(w.oneXGain, 1)}× its median in the initial reference recordings from the first recorded day (rule value ≥ ${W1_RULE.oneXGainMin}).`,
        `2×/1× amplitude ratio ${fx(w.twoXOver1x, 2)} (≥ ${W1_RULE.twoXOver1xSplit} is read as misalignment-consistent, below as imbalance-consistent).`];
    return {
      ...common, kind: 'waveform',
      headline: `An earlier completed vibration snapshot shows a pattern consistent with ${human(z.fault_type)}; B1 had left the cause unresolved (UNKNOWN). Not a confirmed diagnosis.`,
      caveat: `The snapshot completed ${w.ageAtAlert} before the alert minute and is one radial axis; it cannot confirm ${bearing ? 'bearing damage' : 'misalignment'} by itself.`,
      snapshot: w, features,
      alternatives: bearing
        ? ['Other high-frequency sources (cavitation, looseness, gear or coupling noise)', 'Lubrication condition rather than bearing damage', 'Accelerometer mounting change']
        : ['Imbalance or looseness with harmonics', 'Soft foot or pipe strain', 'Bearing degradation'],
      gaps: [{ kind: 'limitation', text: `Snapshot age at the alert: ${w.ageAtAlert} (W1 accepts up to ${W1_RULE.maxAgeH} h); no vibration waveform was recorded in the warning minute.` },
        { kind: 'limitation', text: 'One radial axis only: no axial direction or phase measurement.' },
        ...(hyd.missingChannel ? [{ kind: installed.has(hyd.missingChannel) ? 'no-z' : 'not-installed', text: `Hydraulic check not applied: ${label(hyd.missingChannel)} is ${installed.has(hyd.missingChannel) ? 'unavailable at this minute' : 'not installed on this pump'}. Not assessed by that method, which is not a healthy result.` }] : [])],
      plain: {
        title: bearing ? 'Inspect the bearing condition' : 'Check shaft alignment',
        summary: `The vibration recording was made before the warning; its pattern is consistent with ${bearing ? 'bearing outer-race wear' : 'misalignment'}.`,
        observations: [
          `The vibration recording finished ${w.ageAtAlert} before the warning (${formatUtc(parseUtc(w.completeUtc), { seconds: true })}); no vibration waveform was recorded in the warning minute itself.`,
          bearing
            ? `The bearing outer-race tone is about ${fx(w.envRatio, 1)}× its local background; that ratio is about ${fx(w.envGain, 1)}× the ratio in the initial reference recordings.`
            : `The once-per-revolution vibration is about ${fx(w.oneXGain, 1)}× its level in the initial reference recordings, and the twice-per-revolution component is about ${fx(w.twoXOver1x, 1)}× the once-per-revolution one.`,
          'One measurement direction only; a pattern consistent with a cause is not a confirmed diagnosis.',
        ],
        caution: `Older recording (${w.ageAtAlert} before the warning), one direction only.`,
        uncertainty: `The recording is ${w.ageAtAlert} older than the warning and covers one direction only.`,
        metrics: [
          { label: 'Recording age at the warning', value: w.ageAtAlert, note: 'fixed for this warning', kind: 'time' },
          { label: 'Pump speed during recording', value: w.speedCheck === 'MATCH' ? 'Comparable' : String(w.speedCheck ?? 'Unverified').toLowerCase(), note: 'to the speed in the warning minute', kind: 'measured' },
        ],
      },
      nextCheck: bearing
        ? { text: 'Take a portable envelope spectrum in a second direction and check lubrication before planning a bearing replacement.', reason: 'Proposed check. A second direction and a fresh reading help distinguish bearing damage from lubrication, mounting or other high-frequency sources.' }
        : { text: 'Check coupling alignment and take an axial or phase vibration reading.', reason: 'Proposed check. A second direction and phase help distinguish misalignment from imbalance or looseness, which one recording in one direction cannot separate.' },
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
    plain: {
      title: missing ? `Cause still unresolved: ${lower(missing)} input missing` : 'Cause still unresolved',
      summary: `${missing ? `No ${lower(missing)} ${installed.has(missing) ? 'value' : 'meter'}, so this check could not run. ` : ''}The earlier warning (${before.label}) stays unconfirmed.`,
      observations: [
        ...(missing ? [`This pump has no ${installed.has(missing) ? `${lower(missing)} value at this minute` : `${lower(missing)} meter`}, so the pressure-and-${lower(missing)} check could not assess the cause.`] : []),
        `The earlier warning about ${before.label} stays as the working hypothesis.`,
        'Not assessed is not a healthy result and not a proven sensor failure.',
      ],
      caution: 'Cause unresolved; not a healthy result.',
      uncertainty: 'Cause not assessed by this method; the earlier warning remains unconfirmed.',
      metrics: missing ? [{ label: `${label(missing)} meter`, value: installed.has(missing) ? 'No value this minute' : 'Not installed', note: 'per the pump passport', kind: 'measured' }] : [],
    },
    nextCheck: { text: humanIds(s.b1.recommended_action), reason: 'Proposed check. The earlier method proposed it; it tests only the earlier hypothesis, not other causes.' },
  };
}

// Public entry: English by default; { lang: 'ru' } localizes only the plain first-screen layer, the next check,
// timing and pending text. Same slice, same numbers, same gating; technical fields stay in original wording.
export function explainCase(s, asset, { lang = 'en' } = {}) {
  const e = explainCaseEn(s, asset);
  return lang === 'ru' ? localizeRu(e, s) : e;
}

const ruCh = (c) => (CHANNEL_RU[c] ?? c);
const ruLower = (c) => ruCh(c).replace(/^./, (m) => m.toLowerCase());
const RU_FAULT = {
  SENSOR_CALIBRATION_SHIFT: 'смещение калибровки датчика', SENSOR_NOISE_SPIKES: 'шум или выбросы датчика', MISALIGNMENT: 'расцентровка',
  BEARING_WEAR: 'износ подшипника', UNKNOWN: 'причина не установлена', SUCTION_STRAINER_CLOGGING: 'засорение фильтра на всасывании',
};
const ruFault = (b) => `${RU_FAULT[b.fault_type] ?? b.fault_type.toLowerCase().replace(/_/g, ' ')}${b.suspected_channel && b.fault_type !== 'UNKNOWN' ? ` (${ruLower(b.suspected_channel)})` : ''}`;
const ruRange = (a, b) => minuteRange(a, b);
function ruAge(ms) {
  const m = Math.floor(ms / 60000); if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60); return h < 48 ? `${h} ч ${m % 60} мин` : `${Math.floor(h / 24)} сут ${h % 24} ч`;
}

function localizeRu(e, s) {
  if (e.kind === 'rejected') return { ...e, text: 'Сохранённые данные этого случая отклонены (не согласованы по времени с предупреждением); из них ничего не интерпретируется.' };
  if (e.kind === 'pending') {
    return { ...e,
      text: `Минута предупреждения ${ruRange(s.minuteStartMs, s.minuteEndMs)} ещё не закрыта, поэтому анализа, вывода прежнего метода и результата проверки для неё пока нет. Они появятся в ${formatUtc(s.minuteEndMs, { seconds: true })}.`,
      snapshot: s.snapshot ? `Запись вибрации (${s.snapshot.id}) завершена в ${formatUtc(s.snapshot.completeMs, { seconds: true })}. Она интерпретируется только при выдаче предупреждения.` : null };
  }
  const age = s.clockMs - s.alertMs;
  const out = { ...e, lang: 'ru',
    timing: age <= 0 ? `Закрытая минута ${ruRange(s.minuteStartMs, s.minuteEndMs)}; доступна на текущее время.` : `Закрытая минута ${ruRange(s.minuteStartMs, s.minuteEndMs)}; выдано за ${ruAge(age)} до текущего времени (${formatUtc(s.clockMs)}). Это историческое объяснение не меняется со временем.`,
    before: { ...e.before, label: s.b1.fault_type === 'UNKNOWN' ? 'причина не установлена (UNKNOWN)' : ruFault(s.b1) },
    after: { ...e.after, label: ruFault(s.z995) } };
  const d = s.z995.ruleDetail;
  if (e.kind === 'residual') {
    const ch = ruLower(e.sourceChannel); const m = d.minute; const ref = d.reference; const t = d.tail;
    out.plain = {
      title: e.sourceChannel === 'flow_m3_h' ? 'Проверьте показания расходомера' : `Проверьте показания: ${ch}`,
      summary: `Колебания показания «${ch}» могут быть связаны с измерением — нужна независимая проверка.`,
      observations: [
        `Разность между измеренным и рассчитанным приростом давления колеблется сильнее, чем в ${t.b === 0 ? 'любой' : 'большинстве'} из ${t.N} опорных минут первого записанного дня этого насоса.`,
        `Большая часть этих колебаний меняется вместе с показанием «${ch}», поэтому его нужно проверить первым.`,
        'Опорные минуты взяты из первого записанного дня насоса, исправность которого не подтверждена.',
      ],
      caution: 'Вывод близок к порогу правила; нужна независимая проверка.',
      uncertainty: 'Вывод близок к порогу правила; перед заменой чего-либо проверьте независимым измерением. Улучшение показано только на обучающих примерах; на валидационных насосах не было всех четырёх измерений.',
      metrics: [
        { label: 'Колебание разности прироста давления (измерено − рассчитано)', value: `${m.std_E_kpa.toFixed(1)} кПа`, note: `типично в опорных минутах: ${ref.reference_std_kpa.toFixed(1)} кПа`, kind: 'calculated' },
        { label: 'Синхронные отсчёты', value: `${m.paired} из ${m.rows_total}`, note: 'по одному в секунду в эту минуту', kind: 'measured' },
      ],
    };
    out.nextCheck = { text: e.sourceChannel === 'flow_m3_h' ? 'Сравните расход с независимым прибором' : `Сравните показание «${ch}» с независимым прибором`, reason: 'Синхронные записи и независимый прибор помогают отличить шум прибора от реального изменения процесса до замены датчика.' };
    out.alternatives = ['Динамика процесса или переходный режим, не описываемый стационарным уравнением насоса', 'Характеристика насоса, не соответствующая этому насосу (паспорт, износ)', 'Геометрия установки: высоты отборов, скоростной напор, размещение датчиков', 'Опорный первый записанный день сам может содержать необычные минуты'];
  } else if (e.kind === 'waveform') {
    const w = e.snapshot; const bearing = s.z995.fault_type === 'BEARING_WEAR';
    const atAlert = durationHms(w.ageAtAlertS, 'ru');
    out.snapshot = { ...w, ageAtAlert: atAlert, ageNow: durationHms((s.clockMs - parseUtc(w.completeUtc)) / 1000, 'ru') };
    out.plain = {
      title: bearing ? 'Проверьте состояние подшипника' : 'Проверьте центровку вала',
      summary: `Виброзапись сделана раньше предупреждения; картина согласуется с ${bearing ? 'износом наружного кольца подшипника' : 'расцентровкой'}.`,
      observations: [
        `Запись вибрации завершена за ${atAlert} до предупреждения (${formatUtc(parseUtc(w.completeUtc), { seconds: true })}); в саму минуту предупреждения форма вибросигнала не записывалась.`,
        bearing
          ? `Тон наружного кольца подшипника примерно в ${w.envRatio.toFixed(1)}× выше локального фона; это отношение примерно в ${w.envGain.toFixed(1)}× больше, чем в начальных опорных записях.`
          : `Вибрация с частотой вращения примерно в ${w.oneXGain.toFixed(1)}× выше уровня начальных опорных записей, а составляющая двойной частоты примерно в ${w.twoXOver1x.toFixed(1)}× больше составляющей частоты вращения.`,
        'Только одно направление измерения; согласующаяся картина — не подтверждённый диагноз.',
      ],
      caution: `Запись старше предупреждения (${atAlert}), одно направление.`,
      uncertainty: `Запись старше предупреждения на ${atAlert} и охватывает только одно направление.`,
      metrics: [
        { label: 'Возраст записи на момент предупреждения', value: atAlert, note: 'фиксирован для этого предупреждения', kind: 'time' },
        { label: 'Частота вращения во время записи', value: w.speedCheck === 'MATCH' ? 'Сопоставима' : 'Не проверена', note: 'с частотой в минуту предупреждения', kind: 'measured' },
      ],
    };
    out.nextCheck = bearing
      ? { text: 'Снимите переносной спектр огибающей во втором направлении и проверьте смазку до планирования замены подшипника.', reason: 'Второе направление и свежее измерение помогают отличить повреждение подшипника от смазки, крепления датчика или других высокочастотных источников.' }
      : { text: 'Проверьте центровку муфты и снимите осевое или фазовое измерение вибрации.', reason: 'Второе направление и фаза помогают отличить расцентровку от дисбаланса или ослабления, чего одна запись в одном направлении не позволяет.' };
    out.alternatives = bearing
      ? ['Другие высокочастотные источники (кавитация, ослабление, шум муфты)', 'Состояние смазки, а не повреждение подшипника', 'Изменение крепления акселерометра']
      : ['Дисбаланс или ослабление с гармониками', 'Мягкая лапа или напряжение трубопровода', 'Ухудшение подшипника'];
  } else {
    const miss = e.missingChannel;
    out.plain = {
      title: 'Причина пока не ясна',
      summary: `${miss ? 'Нет расходомера — эта проверка не выполнена. ' : ''}Прежнее предупреждение (${ruFault(s.b1)}) остаётся неподтверждённым.`,
      observations: [
        ...(miss ? [`У насоса нет ${e.missingInstalled ? `значения «${ruLower(miss)}» в эту минуту` : 'расходомера'}, поэтому проверка «давление–расход» не смогла оценить причину.`] : []),
        `Прежнее предупреждение (${ruFault(s.b1)}) остаётся рабочей гипотезой.`,
        '«Не оценено» — не признак исправности и не доказанный отказ датчика.',
      ],
      caution: 'Причина не ясна; это не признак исправности.',
      uncertainty: 'Причина этим методом не оценена; прежнее предупреждение остаётся неподтверждённым.',
      metrics: miss ? [{ label: `${ruCh(miss)}: прибор`, value: e.missingInstalled ? 'Нет значения в эту минуту' : 'Не установлен', note: 'по паспорту насоса', kind: 'measured' }] : [],
    };
    const v = /^Verify (\w+) against a reference gauge\.$/.exec(s.b1.recommended_action ?? '');
    out.nextCheck = { text: v ? `Сверьте показание «${ruLower(v[1])}» с эталонным манометром.` : e.nextCheck.text, reason: 'Эту проверку предложил прежний метод; она проверяет только прежнюю гипотезу, а не другие причины.' };
    if (e.capability) out.capability = { ...e.capability, text: 'Синхронное измерение расхода дало бы недостающий вход; остальные условия применимости всё равно должны выполняться. Это аргумент о возможностях, а не доказанная польза или экономический эффект.' };
  }
  return out;
}
