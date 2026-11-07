// Plain-language explanation of one selected baseline alert (docs/tasks/009-diagnostic-clarity.md).
// Inputs are only the as-of view from sliceReplay(), the selected alert and the static asset passport.
// It never sees the full replay or evaluation labels, and it reads values only at the alert's own
// minute (or earlier), so a later clock cannot change what it says. No DOM access in this module.
import { MINUTE_MS, parseUtc, formatUtc, formatDuration } from './replay.js';
import { CHANNEL_LABELS, CHANNEL_PLACEMENT, knowledgeFor } from './knowledge.js';

const label = (c) => CHANNEL_LABELS[c] ?? c;
const round = (v, d) => (v == null ? null : Number(Number(v).toFixed(d)));
const signed = (z) => `${z > 0 ? '+' : z < 0 ? '−' : ''}${Math.abs(z).toFixed(2)}`;
const cadence = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);
const hhmm = (ms) => formatUtc(ms).slice(11);

export const Z_NOTE = 'z is a signed, scaled deviation from this pump\'s own first-24-hour reference (mode-aware, as computed by the detector): negative means below the reference, positive above. It is not a physical safety limit or a probability. The reference period is empirical and not certified healthy.';

export function alertKind(alert) {
  if (alert.fault_type === 'COMMUNICATION_LOSS') return 'gap';
  if (alert.fault_type === 'SENSOR_STUCK') return 'stuck';
  if (alert.event_class === 'SENSOR') return 'sensor';
  if (alert.fault_type === 'UNKNOWN') return 'unknown';
  return 'machine';
}

// Channel ids named in the detector's evidence string, in the order they appear.
export function namedChannels(evidence, ids) {
  return ids.map((c) => [c, String(evidence ?? '').search(new RegExp(`\\b${c}\\b`))])
    .filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([c]) => c);
}

function observe(view, channelId, i, named) {
  const ch = view.channels[channelId];
  const value = ch.mean[i];
  const z = ch.z ? ch.z[i] : null;
  const direction = z == null ? null : z < 0 ? 'below' : z > 0 ? 'above' : 'at';
  const measured = value == null ? `no sample in this minute (native update every ${cadence(ch.nativeUpdateSeconds)})` : `${round(value, 4)} ${ch.unit}`;
  const relation = z == null ? 'reference comparison unavailable (no causal z at this minute)' : `${direction} this pump's reference (causal z ${signed(round(z, 2))})`;
  return {
    channelId, label: label(channelId), named, unit: ch.unit, value: round(value, 4), z: round(z, 2), direction,
    place: CHANNEL_PLACEMENT[channelId] ?? 'Location not specified',
    text: `${label(channelId)}: ${measured} — ${relation}.`,
  };
}

function lastBefore(view, channelId, i) {
  const mean = view.channels[channelId]?.mean;
  for (let j = i - 1; j >= 0; j -= 1) if (mean[j] != null) return j;
  return -1;
}

function channelGap(view, asset, channelId, i) {
  const installed = asset.channelsAvailable.includes(channelId);
  const name = label(channelId);
  if (!installed) {
    return { channelId, label: name, kind: 'not-installed', text: `${name}: not installed on this pump (passport inventory). Not measured here, so it cannot support or contradict the rule.` };
  }
  const ch = view.channels[channelId];
  if (!ch) return { channelId, label: name, kind: 'no-sample', text: `${name}: installed, but not in this replay bundle; its value at the alert minute is unknown.` };
  if (ch.mean[i] == null) {
    const j = lastBefore(view, channelId, i);
    const prior = j >= 0 ? ` Last earlier sample: minute ending ${hhmm(view.gridStartMs + (j + 1) * MINUTE_MS)}, ${round(ch.mean[j], 4)} ${ch.unit}.` : '';
    return { channelId, label: name, kind: 'no-sample', text: `${name}: installed (native update every ${cadence(ch.nativeUpdateSeconds)}), but no sample in the minute ending ${hhmm(view.gridStartMs + (i + 1) * MINUTE_MS)}; its state at the alert minute is unknown, not normal.${prior}` };
  }
  if (!ch.z || ch.z[i] == null) return { channelId, label: name, kind: 'no-z', text: `${name}: measured ${round(ch.mean[i], 4)} ${ch.unit}, but the reference comparison is unavailable at this minute (no causal z).` };
  return null;
}

export const REFERENCE_CAVEAT = 'z compares with this pump\'s first-day empirical reference, which is not verified healthy.';

// Short visible qualifier per kind; the full hypothesis text stays available for technical details.
const CAVEAT = {
  machine: null,
  unknown: 'UNKNOWN is not a fault type and not a healthy state.',
  sensor: 'This does not confirm a mechanical failure or a faulty sensor.',
  stuck: 'The reading may be held or genuinely constant; raw within-minute samples are not in this bundle.',
  gap: 'A gateway or network outage is one hypothesis. Missing data does not show that the pump stopped.',
};

// One line per gap category, derived from the gap list (counts and labels, nothing hardcoded per pump).
function summarizeGaps(view, gaps) {
  const list = (gs) => gs.map((g) => g.label).join(', ');
  const plural = (n, one, many) => (n === 1 ? one : many);
  const out = [];
  for (const kind of [...new Set(gaps.map((g) => g.kind))]) {
    const of = gaps.filter((g) => g.kind === kind);
    const chans = of.filter((g) => g.channelId);
    for (const g of of.filter((x) => !x.channelId && kind !== 'not-in-benchmark')) out.push({ kind, count: 1, channelIds: [], text: g.text });
    if (kind === 'not-in-benchmark') out.push({ kind, count: of.length, channelIds: [], text: `Not available in any benchmark tier: ${list(of)}.` });
    if (!chans.length) continue;
    const ids = chans.map((g) => g.channelId);
    const n = chans.length;
    if (kind === 'not-installed') out.push({ kind, count: n, channelIds: ids, text: `Not installed on this pump: ${list(chans)}.` });
    if (kind === 'no-z') out.push({ kind, count: n, channelIds: ids, text: `${n} measured ${plural(n, 'channel has', 'channels have')} no reference comparison at this minute: ${list(chans)}.` });
    if (kind === 'no-sample') {
      const cad = [...new Set(ids.map((c) => view.channels[c]?.nativeUpdateSeconds).filter((x) => x != null))].map(cadence).join(' / ');
      out.push({ kind, count: n, channelIds: ids, text: `${n} installed ${plural(n, 'channel has', 'channels have')} no sample in this minute${cad ? ` (native update every ${cad})` : ''}: ${list(chans)}. That does not establish normal behaviour.` });
    }
  }
  return out;
}

const HEADLINE = {
  // Without a z at the alert minute no direction is known: say so and attribute the hypothesis to the detector.
  machine: (o, kb) => (o.direction
    ? `${o.label} ${o.direction} this pump's reference; the rule suggests ${kb.short ?? kb.suggests}, but the cause is unconfirmed.`
    : `${o.label}: reference comparison unavailable at the alert minute; the detector's rule suggests ${kb.short ?? kb.suggests}, but the cause is unconfirmed.`),
  unknown: (o) => (o.direction
    ? `${o.label} ${o.direction} this pump's reference; the baseline matched no specific pattern, so the cause is unresolved.`
    : `${o.label}: reference comparison unavailable at the alert minute; the detector matched no specific pattern, so the cause is unresolved.`),
  sensor: (o, kb) => `The detector reports ${o.label} deviating alone; its rule suggests ${kb.short ?? kb.suggests}. A data-quality warning, not a confirmed fault.`,
  stuck: (o) => `The detector reports ${o.label} as frozen; a possible stuck reading, not a confirmed transmitter fault.`,
  gap: () => 'Telemetry rows were missing; the reason for the gap is unknown.',
};

function hypothesisText(kind, kb, primary) {
  switch (kind) {
    case 'machine': return `The rule suggests ${kb.suggests}. This is an unconfirmed hypothesis from a baseline rule, not a diagnosis.`;
    case 'unknown': return 'Cause unresolved: the deviation persisted but matched no specific B1 rule pattern. UNKNOWN is not a fault type and not a healthy state.';
    case 'sensor': return `The rule suggests ${kb.short ?? kb.suggests} on ${primary.label}. The detector's source evidence reports that this channel deviates alone; by its rule, physically coupled channels it could compare stayed below |z| = 2. This view does not re-check the coupled set, and coupled channels without a sample are not evidence of normal behaviour. This data-quality warning does not confirm a mechanical failure, and it does not confirm that the sensor is faulty.`;
    case 'stuck': return `The detector reports ${kb.short ?? kb.suggests} on ${primary.label}. The raw within-minute samples are not in this bundle; the reading may be held or genuinely constant. This does not confirm a transmitter fault or a mechanical failure.`;
    default: return 'Telemetry rows were missing. A gateway or network outage is one hypothesis; a stopped pump with logging disabled is another. Missing data does not show that the pump stopped.';
  }
}

export function explainAlert(view, alert, asset) {
  const kind = alertKind(alert);
  const kb = knowledgeFor(alert.fault_type);
  const issuedMs = parseUtc(alert.alert_time_utc);
  const i = Math.round((issuedMs - view.gridStartMs) / MINUTE_MS) - 1; // alert time = window end
  const minuteEnd = formatUtc(issuedMs);
  const age = view.asOfMs - issuedMs;
  const timing = age <= 0
    ? `Issued at the replay time (${minuteEnd}).`
    : `Issued ${minuteEnd}, ${formatDuration(age)} before the replay time (${formatUtc(view.asOfMs)}). A historical alert is not necessarily an ongoing fault.`;
  const ids = Object.keys(view.channels);
  const named = namedChannels(alert.evidence, ids);
  const inView = i >= 0 && i < view.visibleMinutes;

  if (!inView || issuedMs > view.asOfMs) {
    // Honest boundary: an alert outside the visible minutes cannot be explained from this view.
    return { kind: 'unavailable', available: false, issuedMs, timing: `Alert time ${minuteEnd} is outside the visible replay up to ${formatUtc(view.asOfMs)}; no explanation is available.` };
  }
  let observations = [];
  let gapRun = null;
  if (kind === 'gap') {
    const rows = view.rows.packets[i];
    let run = 0; let zeroRun = 0;
    for (let j = i; j >= 0 && view.rows.packets[j] < 30; j -= 1) { run += 1; if (view.rows.packets[j] === 0) zeroRun += 1; }
    gapRun = { run, zeroRun };
    observations = [{
      channelId: null, label: 'Telemetry rows', named: true, value: rows, z: null, direction: null, unit: 'rows',
      text: `${rows === 0 ? 'No' : `Only ${rows} of 60 expected`} telemetry rows in the minute ending ${hhmm(issuedMs)} (1 Hz table); ${run} consecutive minute(s) below 30 rows up to the alert, ${zeroRun} of them with no rows at all.`,
    }];
  } else {
    observations = named.map((c) => observe(view, c, i, true));
    if (kind === 'stuck') {
      for (const o of observations) o.text = `${o.label}: reported frozen by the detector (no within-minute variation while running steady). ${o.text.slice(o.label.length + 2)}`;
    }
    if (kind === 'machine' || kind === 'unknown') {
      // Other clearly deviating channels at the same minute, labelled as not named by the detector.
      const others = ids.filter((c) => !named.includes(c) && view.channels[c].z?.[i] != null && Math.abs(view.channels[c].z[i]) >= 3)
        .sort((a, b) => Math.abs(view.channels[b].z[i]) - Math.abs(view.channels[a].z[i])).slice(0, 3);
      observations.push(...others.map((c) => observe(view, c, i, false)));
    }
  }
  const primary = observations[0] ?? { label: 'The named channel', direction: null };

  let gaps = [];
  if (kind === 'gap') {
    gaps = [gapRun.zeroRun === gapRun.run
      ? { channelId: null, label: 'All channels', kind: 'no-rows', text: 'No channel values exist for the zero-row minutes, so the pump\'s state during them is unknown.' }
      : { channelId: null, label: 'All channels', kind: 'partial', text: `Telemetry coverage was incomplete: ${gapRun.run - gapRun.zeroRun} of the ${gapRun.run} gap minute(s) had some rows. Values in those minutes are means of fewer samples, and the missing seconds are unknown. At the alert minute ${ids.filter((c) => view.channels[c].mean[i] != null).length} of ${ids.length} channels have a value.` }];
  } else {
    const candidates = [...new Set([...named, ...kb.discriminators, ...asset.channelsAvailable.filter((c) => view.channels[c] && view.channels[c].mean[i] == null)])];
    gaps = candidates.map((c) => channelGap(view, asset, c, i)).filter(Boolean);
  }
  gaps.push(...kb.notInBenchmark.map((x) => ({ channelId: null, label: x, kind: 'not-in-benchmark', text: `${x}: not measured in any benchmark instrumentation tier.` })));

  const headline = kind === 'gap' ? HEADLINE.gap() : HEADLINE[kind](primary, kb);
  const conf = Number(alert.confidence);
  return {
    kind,
    available: true,
    issuedMs,
    timing,
    headline,
    hypothesis: hypothesisText(kind, kb, primary),
    observations,
    caveat: CAVEAT[kind],
    zNote: kind === 'gap' ? null : Z_NOTE,
    referenceCaveat: kind === 'gap' ? null : REFERENCE_CAVEAT,
    gaps,
    gapSummary: summarizeGaps(view, gaps),
    alternatives: [...kb.alternatives],
    nextCheck: { text: kb.check, reason: kb.checkReason, advisory: 'Advisory engineering check; this application cannot operate equipment.' },
    technical: {
      faultType: alert.fault_type,
      eventClass: alert.event_class,
      evidence: alert.evidence,
      action: alert.recommended_action,
      actionNote: 'Verbatim detector recommendation: a generic output of the rule, not a confirmed work order.',
      rule: kb.rule,
      ruleNote: 'Rule branches that can produce this output (vendor B1, paraphrased). Which branch fired is not recorded.',
      score: `${conf.toFixed(3)} · uncalibrated baseline rule score, not a failure probability`,
      scoreExact: alert.confidence,
      formula: 'max |z| / (2k), clipped to 0.05–0.99 (vendor B1).',
    },
  };
}
