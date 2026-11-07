// Replay trend charts for Pump Detail (moved from app.js so the render branch is testable without a DOM).
// Only the as-of slice from sliceReplay() reaches these functions; nothing later than the clock is drawn.
import { MINUTE_MS, parseUtc, formatUtc } from './replay.js';
import { CHANNEL_LABELS } from './knowledge.js';
import { getLang, CHANNEL_RU } from './i18n.js';
import { L } from './ru-text.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = (c) => (getLang() === 'ru' ? CHANNEL_RU[c] : CHANNEL_LABELS[c]) ?? c;
const cadence = (sec) => (sec >= 60 ? `${sec / 60} ${L('min', 'мин')}` : `${sec} ${L('s', 'с')}`);

export function trendCharts(view, channelId, spanMin, labels) {
  const ch = view.channels[channelId];
  const n = view.visibleMinutes;
  if (n === 0) return `<div class="empty">${L('No completed minute yet at this as-of time.', 'К этому времени ещё нет закрытой минуты.')}</div>`;
  const i0 = spanMin ? Math.max(0, n - spanMin) : 0;
  const x0 = view.gridStartMs + i0 * MINUTE_MS; const x1 = view.asOfMs;
  const sparse = ch.nativeUpdateSeconds > 60;
  const pts = (arr) => { const out = []; for (let i = i0; i < n; i += 1) out.push(arr[i] == null ? null : [view.gridStartMs + (i + 1) * MINUTE_MS, arr[i]]); return out; };
  const alerts = view.alerts.filter((a) => parseUtc(a.alert_time_utc) >= x0);
  const k = view.detectorParameters.k;
  const meanSvg = svgChart({ points: pts(ch.mean), x0, x1, sparse, unit: ch.unit, title: `${label(channelId)} (${ch.unit}), ${L('1-min window mean', 'среднее за 1 мин')}`, alerts, labels });
  const zPts = ch.z ? pts(ch.z) : [];
  const anyZ = zPts.some((p) => p);
  const zSvg = anyZ ? svgChart({ points: zPts, x0, x1, sparse, unit: 'z', title: `${L('Causal z-score (threshold', 'Причинная z-оценка (порог')} ±${k})`, alerts, labels, thresholds: [k, -k] })
    : `<div class="empty small">${L('Causal z-score unavailable in this span', 'Причинная z-оценка недоступна в этом интервале')}${view.asOfMs < view.referenceEndMs + MINUTE_MS ? L(' — reference still collecting (first 24 h)', ' — опора ещё собирается (первые 24 ч)') : ''}.</div>`;
  return `${meanSvg}${zSvg}<p class="small muted">${sparse ? L(`Sparse channel: one native sample every ${cadence(ch.nativeUpdateSeconds)}; points only where a sample exists.`, `Редкий канал: один отсчёт раз в ${cadence(ch.nativeUpdateSeconds)}; точки только там, где есть отсчёт.`) : L('Gaps are minutes without samples.', 'Разрывы — минуты без отсчётов.')} ${L('Points are plotted at window end (availability time). Right edge = as-of time; nothing later is drawn.', 'Точки ставятся в конце окна (момент доступности). Правый край — текущее время; более позднее не рисуется.')}</p>`;
}

export function svgChart({ points, x0, x1, sparse, unit, title, alerts, labels, thresholds = [] }) {
  // Narrow screens get their own coordinate system so text is not scaled down below ~11 px.
  const narrow = window.innerWidth < 600;
  const W = narrow ? 320 : 900; const H = narrow ? 230 : 210; const PL = narrow ? 46 : 62; const R = 10; const T = narrow ? 42 : 22; const B = 30;
  // PL is the plot's left margin; L is the imported language helper (they used to collide).
  const vals = points.filter(Boolean).map((p) => p[1]).concat(thresholds);
  if (!points.some(Boolean)) return `<div class="empty small">${esc(title)}: ${L('no samples in this span.', 'нет отсчётов в этом интервале.')}</div>`;
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const span = Math.max(1, x1 - x0);
  const sx = (t) => PL + ((t - x0) / span) * (W - PL - R);
  const sy = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let marks = '';
  if (sparse) {
    marks = points.filter(Boolean).map(([t, v]) => `<circle cx="${sx(t).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.2" fill="#1f5fbf"/>`).join('');
  } else {
    let d = ''; let pen = false;
    for (const p of points) { if (!p) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`; pen = true; }
    marks = `<path d="${d}" fill="none" stroke="#1f5fbf" stroke-width="1.3"/>`;
  }
  const ticksY = [lo + pad, (lo + hi) / 2, hi - pad].map((v) => `<line x1="${PL}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e3e7ec"/><text x="${PL - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="#5a6573">${v.toFixed(Math.abs(v) < 10 ? 2 : 1)}</text>`).join('');
  const ticksX = (narrow ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => { const t = x0 + f * span; const s = new Date(t).toISOString(); return `<text x="${sx(t)}" y="${H - 8}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" font-size="11" fill="#5a6573">${s.slice(5, 10)} ${s.slice(11, 16)}</text>`; }).join('');
  const th = thresholds.map((v) => `<line x1="${PL}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#a4262c" stroke-dasharray="5 4"/>`).join('');
  const al = alerts.map((a) => { const x = sx(parseUtc(a.alert_time_utc)); const right = x > W - R - 60; return `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="#a4262c" stroke-width="1.5"/><text x="${right ? x - 4 : x + 4}" y="${T + 12}" text-anchor="${right ? 'end' : 'start'}" font-size="11" fill="#a4262c" stroke="#fff" stroke-width="3" paint-order="stroke">! ${L('alert', 'предупр.')}</text>`; }).join('');
  const lb = (labels ?? []).map((e) => {
    const a = Math.max(x0, parseUtc(e.onset_utc)); const b = e.endWithheld ? x1 : Math.min(x1, parseUtc(e.end_utc));
    if (b < x0) return '';
    return `<rect x="${sx(a)}" y="${H - B - 8}" width="${Math.max(2, sx(b) - sx(a))}" height="8" fill="#6b3fa0" opacity=".55"><title>Ground truth (retrospective): ${esc(e.event_id)} ${esc(e.fault_type)}</title></rect>`;
  }).join('');
  // Narrow: drawn at 1:1 CSS pixels (svg width = W) inside its own scroller, so text is never scaled down.
  return `<div class="plot-scroll" role="region" aria-label="${esc(title)} chart" tabindex="0"><svg viewBox="0 0 ${W} ${H}" class="plot${narrow ? ' plot-fixed' : ''}" style="--plot-w:${W}px" role="img" aria-label="${esc(title)}; ${points.filter(Boolean).length} points up to the as-of time">
    <text x="${narrow ? 2 : PL}" y="14" font-size="12" font-weight="600" fill="#1d232b">${esc(title)}</text>
    ${ticksY}${th}${marks}${al}${lb}
    <line x1="${W - R}" x2="${W - R}" y1="${T}" y2="${H - B}" stroke="#1d232b" stroke-width="2"/><text x="${W - R}" y="${narrow ? 32 : T - 6}" text-anchor="end" font-size="11" font-weight="600" fill="#1d232b">${L('As of', 'На')} ${esc(formatUtc(x1).slice(5, 16))}</text>
    <line x1="${PL}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#aab3be"/>${ticksX}
    <text x="12" y="${(H - B + T) / 2}" font-size="11" fill="#5a6573" transform="rotate(-90 12 ${(H - B + T) / 2})" text-anchor="middle">${esc(unit)}</text>
  </svg></div>`;
}
