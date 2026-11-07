// Visual evidence for the warning review (Task017). Pure HTML/SVG builders from the as-of explanation and the
// static passport. Nothing here infers anything: highlights come only from an available explanation, so before a
// warning the schematic shows the installed inventory alone. No invented waveforms, spectra or healthy bands.
import { t, getLang, CHANNEL_RU } from './i18n.js';
import { CHANNEL_LABELS } from './knowledge.js';
import { parseUtc, formatUtc } from './replay.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chName = (c) => (getLang() === 'ru' ? CHANNEL_RU[c] : CHANNEL_LABELS[c]) ?? c;

// Generic single-pump measurement points (functional, not installation geometry).
const PTS = [
  { code: 'Ps', ch: ['suction_pressure_kpa'], x: 92, y: 112 }, { code: 'Pd', ch: ['discharge_pressure_kpa'], x: 150, y: 50 },
  { code: 'Q', ch: ['flow_m3_h'], x: 262, y: 28 }, { code: 'Tf', ch: ['fluid_temp_c'], x: 50, y: 112 },
  { code: 'V', ch: ['vibration_rms_mm_s', 'vibration_accel_rms_g', 'vibration_crest_factor'], x: 150, y: 160 },
  { code: 'Tb', ch: ['bearing_temp_c'], x: 116, y: 160 }, { code: 'Tw', ch: ['motor_winding_temp_c'], x: 245, y: 76 },
  { code: 'I', ch: ['motor_current_a'], x: 218, y: 160 }, { code: 'P', ch: ['motor_power_kw'], x: 248, y: 160 },
  { code: 'n', ch: ['motor_speed_rpm'], x: 278, y: 160 },
  { code: 'Vp', ch: ['valve_position_pct'], x: 300, y: 50, optional: true }, { code: 'Ta', ch: ['ambient_temp_c'], x: 40, y: 160, optional: true },
];

// focus: channels to check; proposed: missing channels shown as possible additions. Both empty before a warning.
export function pumpSchematic(asset, { focus = [], proposed = [] } = {}) {
  const has = new Set(asset.channelsAvailable);
  // Valve feedback and ambient temperature are drawn only when installed (main points otherwise).
  const pts = PTS.filter((p) => !p.optional || p.ch.some((c) => has.has(c)));
  const state = (p) => (p.ch.some((c) => proposed.includes(c)) ? 'proposed' : !p.ch.some((c) => has.has(c)) ? 'missing'
    : p.ch.some((c) => focus.includes(c)) ? 'focus' : 'installed');
  const marks = pts.map((p) => {
    const s = state(p);
    const fill = { installed: '#2458c6', focus: '#2458c6', missing: '#fff', proposed: '#fff5df' }[s];
    const stroke = { installed: '#fff', focus: '#b06d00', missing: '#8a94a3', proposed: '#8a5a00' }[s];
    const dash = s === 'missing' || s === 'proposed' ? ' stroke-dasharray="3 2"' : '';
    const txt = s === 'installed' || s === 'focus' ? '#fff' : s === 'proposed' ? '#8a5a00' : '#6b7480';
    return `${s === 'focus' ? `<circle cx="${p.x}" cy="${p.y}" r="17" fill="none" stroke="#b06d00" stroke-width="3"/>` : ''}
      <circle cx="${p.x}" cy="${p.y}" r="11" fill="${fill}" stroke="${stroke}" stroke-width="${s === 'installed' ? 1.5 : 2}"${dash}/>
      <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${txt}">${p.code}</text>`;
  }).join('');
  // Names only the channels actually installed (or the missing/proposed ones), not every channel of a point.
  const chans = (p, st) => (st === 'installed' || st === 'focus' ? p.ch.filter((c) => has.has(c)) : p.ch);
  const names = (st) => pts.filter((p) => state(p) === st).map((p) => chans(p, st).map(chName).join(' / ')).join(', ');
  const chip = (p) => { const st = state(p); const word = { focus: t('vis.chipCheck'), missing: t('vis.chipMissing'), proposed: t('vis.chipProposed') }[st];
    return `<li class="chip chip-${st}"><b>${p.code}</b> · ${esc(chans(p, st).map(chName).join(' / '))} — ${esc(word)}</li>`; };
  const chips = pts.filter((p) => ['focus', 'proposed'].includes(state(p)));
  const label = `${t('vis.schem')}. ${t('vis.installed')}: ${names('installed') || '—'}. ${t('vis.focus')}: ${names('focus') || '—'}. ${t('vis.missing')}: ${names('missing') || '—'}. ${t('vis.proposed')}: ${names('proposed') || '—'}.`;
  return `<figure class="mini-sch">
    <svg viewBox="0 0 330 190" role="img" aria-label="${esc(label)}">
      <path d="M8 112 H120" stroke="#9aa4b1" stroke-width="8" fill="none"/><path d="M150 82 V28 H322" stroke="#9aa4b1" stroke-width="8" fill="none"/>
      <circle cx="150" cy="112" r="30" fill="#eef1f4" stroke="#5f6670" stroke-width="2"/>
      <line x1="180" y1="112" x2="205" y2="112" stroke="#5f6670" stroke-width="4"/>
      <rect x="205" y="92" width="86" height="40" rx="6" fill="#eef1f4" stroke="#5f6670" stroke-width="2"/>
      <text x="150" y="116" text-anchor="middle" font-size="11" fill="#3a4350">${esc(t('vis.pump'))}</text>
      <text x="248" y="116" text-anchor="middle" font-size="11" fill="#3a4350">${esc(t('vis.motor'))}</text>
      <text x="10" y="100" font-size="10.5" fill="#5b6676">${esc(t('vis.suction'))}</text>
      <text x="322" y="16" text-anchor="end" font-size="10.5" fill="#5b6676">${esc(t('vis.discharge'))}</text>
      ${marks}
    </svg>
    ${chips.length ? `<ul class="chips">${chips.map(chip).join('')}</ul>` : ''}
    <ul class="legend small mini-legend">
      <li><span class="lg lg-inst"></span>${esc(t('vis.installed'))}</li>${focus.length ? `<li><span class="lg lg-focus"></span>${esc(t('vis.focus'))}</li>` : ''}
      <li><span class="lg lg-miss"></span>${esc(t('vis.missing'))}</li>${proposed.length ? `<li><span class="lg lg-prop"></span>${esc(t('vis.proposed'))}</li>` : ''}
    </ul>
    <details class="small codes"><summary>${esc(t('vis.codes'))}</summary><ul class="tight">${pts.map((p) => { const st = state(p); return `<li><b>${p.code}</b> — ${esc(chans(p, st).map(chName).join(' / '))} · ${esc({ installed: t('vis.installed'), focus: t('vis.focus'), missing: t('vis.missing'), proposed: t('vis.proposed') }[st])}</li>`; }).join('')}</ul></details>
    <figcaption class="small muted">${esc(t('vis.schemNote'))}</figcaption></figure>`;
}

function hbars(rows, note) {
  const max = Math.max(...rows.map((r) => r.v));
  return `<div class="hbars">${rows.map((r) => `<div class="hbar-row"><span class="hbar-l">${esc(r.label)}</span>
      <span class="hbar-track"><span class="hbar-fill${r.hi ? ' hi' : ''}" style="width:${Math.max(4, (r.v / max) * 100).toFixed(1)}%"></span></span><b class="num hbar-v">${esc(r.text)}</b></div>`).join('')}
    ${note ? `<p class="small muted">${esc(note)}</p>` : ''}</div>`;
}

export function spreadBars(e, s) {
  const m = s.z995.ruleDetail.minute; const ref = s.z995.ruleDetail.reference;
  const u = getLang() === 'ru' ? 'кПа' : 'kPa';
  return `<h4>${esc(t('vis.spreadH'))}</h4>${hbars([
    { label: t('vis.thisMinute'), v: m.std_E_kpa, text: `${m.std_E_kpa.toFixed(1)} ${u}`, hi: true },
    { label: t('vis.typical'), v: ref.reference_std_kpa, text: `${ref.reference_std_kpa.toFixed(1)} ${u}` },
  ], t('vis.spreadNote'))}`;
}

export function flowSpark(raw) {
  const v = raw.q_m3_h; if (!v?.length) return '';
  const W = 300; const H = 70; const lo = Math.min(...v); const hi = Math.max(...v);
  const sx = (i) => 4 + (i / (v.length - 1)) * (W - 8); const sy = (x) => 6 + (1 - (x - lo) / (hi - lo || 1)) * (H - 12);
  return `<figure class="spark"><figcaption class="small"><b>${esc(t('vis.flowH'))}</b><br><span class="muted">${esc(t('vis.flowRange', { lo: lo.toFixed(0), hi: hi.toFixed(0), a: raw.t[0].slice(11, 19), b: raw.t.at(-1).slice(11, 19) }))}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('vis.flowH'))}: ${v.length}, ${lo.toFixed(1)}–${hi.toFixed(1)}"><path d="${v.map((x, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(x).toFixed(1)}`).join('')}" fill="none" stroke="#1f5fbf" stroke-width="1.5"/></svg></figure>`;
}

export function snapshotTimeline(snap, alertMs, clockMs) {
  const done = parseUtc(snap.completeUtc);
  const end = Math.max(alertMs, clockMs); const span = end - done || 1;
  const pos = (ms) => `${(((ms - done) / span) * 100).toFixed(1)}%`;
  const showNow = clockMs > alertMs;
  return `<h4>${esc(t('vis.timelineH'))}</h4>
    <div class="tl" aria-hidden="true"><span class="tl-line"></span><span class="tl-dot tl-rec" style="left:0%"></span><span class="tl-dot tl-warn" style="left:${pos(alertMs)}"></span>${showNow ? `<span class="tl-dot tl-now" style="left:100%"></span>` : ''}</div>
    <ul class="tl-list small">
      <li><span class="lg lg-rec"></span><b>${esc(t('vis.recDone'))}</b> <span class="num">${esc(formatUtc(done, { seconds: true }))}</span></li>
      <li><span class="lg lg-warn"></span><b>${esc(t('vis.warning'))}</b> <span class="num">${esc(formatUtc(alertMs, { seconds: true }))}</span> · +${esc(snap.ageAtAlert)}</li>
      ${showNow ? `<li><span class="lg lg-now"></span><b>${esc(t('vis.now'))}</b> <span class="num">${esc(formatUtc(clockMs, { seconds: true }))}</span> · +${esc(snap.ageNow)}</li>` : ''}
    </ul>`;
}

export function featureBars(e, bearing) {
  const w = e.snapshot;
  if (bearing) {
    const refRatio = w.envRatio / w.envGain;
    return `<h4>${esc(t('vis.barsH.bear'))}</h4>${hbars([
      { label: t('vis.ref'), v: refRatio, text: `${refRatio.toFixed(1)}×` },
      { label: t('vis.snap'), v: w.envRatio, text: `${w.envRatio.toFixed(1)}×`, hi: true },
    ], t('vis.barsNote.bear', { g: w.envGain.toFixed(1) }))}`;
  }
  return `<h4>${esc(t('vis.barsH.mis'))}</h4>${hbars([
    { label: t('vis.ref'), v: 1, text: '1.0×' },
    { label: t('vis.snap'), v: w.oneXGain, text: `${w.oneXGain.toFixed(1)}×`, hi: true },
  ], t('vis.barsNote.mis'))}<p class="small">${esc(t('vis.harmonic', { r: w.twoXOver1x.toFixed(1) }))}</p>`;
}
