// Pure as-of slicing and state rules. Rendering code only ever sees the output of sliceReplay(),
// so nothing later than the as-of clock can reach the DOM. No DOM access in this module.

export const MINUTE_MS = 60_000;

export const parseUtc = (s) => (s == null || s === '' ? null : Date.parse(s));

export function formatUtc(ms, { seconds = false } = {}) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, seconds ? 19 : 16)} UTC`;
}

export function formatDuration(ms) {
  const m = Math.floor(ms / MINUTE_MS);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

// Number of completed one-minute windows whose end (availability time) is <= asOf.
export function visibleCount(replay, asOfMs) {
  const start = parseUtc(replay.gridStartUtc);
  const n = Math.floor((asOfMs - start) / MINUTE_MS);
  return Math.max(0, Math.min(replay.minutes, n));
}

export function windowStart(replay, i) {
  return parseUtc(replay.gridStartUtc) + i * MINUTE_MS;
}

export function clampClock(replay, ms) {
  const start = parseUtc(replay.gridStartUtc);
  const end = start + replay.minutes * MINUTE_MS;
  return Math.max(start, Math.min(end, ms));
}

// Returns a new object holding only data available at asOf. Inputs are never mutated.
export function sliceReplay(replay, asOfMs) {
  const n = visibleCount(replay, asOfMs);
  const cut = (arr) => (arr == null ? null : arr.slice(0, n));
  const rows = Object.fromEntries(Object.entries(replay.rows).map(([k, v]) => [k, cut(v)]));
  const channels = Object.fromEntries(Object.entries(replay.channels).map(([id, c]) => [
    id, { unit: c.unit, nativeUpdateSeconds: c.nativeUpdateSeconds, mean: cut(c.mean), z: cut(c.z) },
  ]));
  const alerts = replay.alerts.filter((a) => parseUtc(a.alert_time_utc) <= asOfMs);
  return {
    assetId: replay.assetId,
    asOfMs,
    gridStartMs: parseUtc(replay.gridStartUtc),
    gridEndMs: parseUtc(replay.gridStartUtc) + replay.minutes * MINUTE_MS,
    referenceEndMs: parseUtc(replay.referenceEndUtc),
    visibleMinutes: n,
    rows,
    channels,
    alerts,
    detectorParameters: replay.detectorParameters,
  };
}

// Retrospective labels for the separate evaluation overlay. Only onsets <= asOf; any later
// timestamp (detectable, deadline, end) is withheld rather than revealed.
export function sliceLabels(replay, asOfMs) {
  const hide = (t) => (t != null && parseUtc(t) <= asOfMs ? t : null);
  return replay.evaluationLabels.events
    .filter((e) => parseUtc(e.onset_utc) <= asOfMs)
    .map((e) => ({
      event_id: e.event_id, event_class: e.event_class, fault_type: e.fault_type, onset_utc: e.onset_utc,
      pre_existing: e.pre_existing, severity: e.severity, evidence_channels: e.evidence_channels,
      detectable_utc: hide(e.detectable_utc), action_deadline_utc: hide(e.action_deadline_utc), end_utc: hide(e.end_utc),
      endWithheld: e.end_utc == null || parseUtc(e.end_utc) > asOfMs,
    }));
}

export function referenceState(view) {
  const n = view.visibleMinutes;
  if (n === 0) {
    return { state: 'COLLECTING_REFERENCE', label: 'Collecting reference', detail: 'No completed minute yet. Statistical deviations start after the first 24 hours.', ready: 0 };
  }
  const status = view.rows.referenceStatus[n - 1];
  const ready = view.rows.referenceReadyChannels[n - 1];
  if (status === 'COLLECTING_REFERENCE') {
    if (view.asOfMs >= view.referenceEndMs) {
      return { state: 'COLLECTING_REFERENCE', label: 'Reference window complete', detail: 'Waiting for the first post-reference minute.', ready: 0 };
    }
    const done = (view.asOfMs - view.gridStartMs) / (view.referenceEndMs - view.gridStartMs);
    return { state: status, label: 'Collecting reference', detail: `Statistical deviations start after the first 24 hours (${formatDuration(view.referenceEndMs - view.asOfMs)} remaining; ${Math.floor(done * 100)}% of the window elapsed).`, ready: 0 };
  }
  if (status === 'REFERENCE_AVAILABLE') {
    return { state: status, label: `Reference available · ${ready} channels`, detail: 'Empirical reference from the first 24 hours, not verified healthy.', ready };
  }
  return { state: 'INSUFFICIENT_REFERENCE', label: 'Insufficient reference', detail: 'No usable reference in the first 24 hours. Z-scores stay unavailable; later data is not used to extend the reference.', ready };
}

// Index of the last completed window with a native sample for this channel, or -1.
export function lastSampleIndex(view, channelId) {
  const mean = view.channels[channelId]?.mean;
  if (!mean) return -1;
  for (let i = mean.length - 1; i >= 0; i -= 1) if (mean[i] != null) return i;
  return -1;
}

// Sample freshness. The exact raw sample second is not in the 1-minute features, so age is an
// interval [windowEnd, windowStart] relative to asOf. Overdue only if the lower bound exceeds the
// native interval plus one aggregation window (the window may close up to one minute later).
export function channelFreshness(view, channelId, installed) {
  if (!installed) return { state: 'NOT_INSTRUMENTED', label: 'Not instrumented' };
  const ch = view.channels[channelId];
  if (!ch) return { state: 'NO_MEASUREMENT', label: 'No measurement available' };
  const i = lastSampleIndex(view, channelId);
  if (i < 0) return { state: 'NO_MEASUREMENT', label: 'No measurement available' };
  const startMs = view.gridStartMs + i * MINUTE_MS;
  const endMs = startMs + MINUTE_MS;
  const ageMin = view.asOfMs - endMs;
  const ageMax = view.asOfMs - startMs;
  const allowed = (ch.nativeUpdateSeconds * 1000) + MINUTE_MS;
  const state = ageMin > allowed ? 'UPDATE_OVERDUE' : 'WITHIN_CADENCE';
  return {
    state,
    label: state === 'UPDATE_OVERDUE' ? 'Update overdue' : 'Within cadence',
    index: i, windowEndMs: endMs, ageMinMs: ageMin, ageMaxMs: ageMax,
    value: ch.mean[i], z: ch.z ? ch.z[i] : null,
  };
}

export function packetState(view) {
  const n = view.visibleMinutes;
  if (n === 0) return { state: 'NO_DATA_YET', label: 'No completed minute yet' };
  if (view.rows.packets[n - 1] === 0) {
    let k = n - 1;
    while (k >= 0 && view.rows.packets[k] === 0) k -= 1;
    return { state: 'PACKETS_MISSING', label: 'No packets received', detail: `No telemetry rows for ${n - 1 - k} completed minute(s) up to the as-of time.` };
  }
  return { state: 'RECEIVING', label: 'Packets received in latest minute', detail: `${view.rows.packets[n - 1]} rows in the latest completed minute (1 Hz table).` };
}

export function diagnosticState(view) {
  if (view.alerts.length === 0) return { state: 'NO_VISIBLE_ALERT', label: 'No baseline alert in this visible history' };
  const latest = view.alerts[view.alerts.length - 1];
  if (latest.fault_type === 'UNKNOWN') return { state: 'UNKNOWN_DIAGNOSIS', label: 'Cause unresolved · Baseline output: UNKNOWN', alert: latest };
  if (latest.event_class === 'SENSOR') return { state: 'DATA_QUALITY_ALERT', label: 'Sensor / data-quality alert', alert: latest };
  return { state: 'ALERT_PRESENT', label: 'Latest visible alert', alert: latest };
}

// Top deviating channels at the alert's own window (alert time = window end), from causal z.
export function alertFeatures(view, alert, limit = 4) {
  const i = Math.round((parseUtc(alert.alert_time_utc) - view.gridStartMs) / MINUTE_MS) - 1;
  if (i < 0 || i >= view.visibleMinutes) return { index: i, items: [] };
  const items = Object.entries(view.channels)
    .filter(([, c]) => c.z && c.z[i] != null)
    .map(([id, c]) => ({ channelId: id, unit: c.unit, value: c.mean[i], z: c.z[i] }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, limit);
  return { index: i, items };
}
