// Pump-and-motor measurement schematic driven by the public channel inventory (assets.csv).
// Placement semantics follow diagrams/README.md. Functional drawing, not a mounting or P&ID drawing.
// Proposed points are hypotheses from the Planner; they never become measurements.

import { tx, L } from './ru-text.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cadence = (s) => (s == null ? L('unknown', 'неизвестно') : s >= 60 ? `${s / 60} ${L('min', 'мин')}` : `${s} ${L('s', 'с')}`);

export const POINTS = [
  { id: 'suction', code: 'Ps', label: 'Suction pressure', channels: ['suction_pressure_kpa'], x: 150, y: 196, exact: true,
    caveat: 'At the pump inlet. Discharge minus suction pressure is the measured pump pressure rise; converting it to pump head needs fluid density, tap elevations and velocity corrections. It is not a strainer or heat-exchanger differential pressure.' },
  { id: 'discharge', code: 'Pd', label: 'Discharge pressure', channels: ['discharge_pressure_kpa'], x: 250, y: 112, exact: true,
    caveat: 'At the pump outlet. The benchmark describes no separate mechanical pressure gauges.' },
  { id: 'fluid', code: 'Tf', label: 'Fluid temperature', channels: ['fluid_temp_c'], x: 205, y: 246, exact: false,
    caveat: 'In the pump region; the exact tapping point is not specified.' },
  { id: 'flow', code: 'Q', label: 'Flow', channels: ['flow_m3_h'], x: 330, y: 50, exact: false,
    caveat: 'Schematic placement on the discharge line; meter location and straight runs are not specified.' },
  { id: 'valve', code: 'Vp', label: 'Valve position feedback', channels: ['valve_position_pct'], x: 400, y: 50, exact: false,
    caveat: 'Schematic. Missing feedback does not mean there is no valve. Position does not prove flow.' },
  { id: 'vibration', code: 'Vib', label: 'Vibration (3 summary features)', channels: ['vibration_rms_mm_s', 'vibration_accel_rms_g', 'vibration_crest_factor'], x: 325, y: 160, exact: true,
    caveat: 'Pump bearing housing. RMS velocity, RMS acceleration and crest factor are summary features, not waveforms. One point does not cover every bearing.' },
  { id: 'bearing_temp', code: 'Tb', label: 'Bearing-housing temperature', channels: ['bearing_temp_c'], x: 325, y: 222, exact: true,
    caveat: 'Pump bearing housing. Not motor winding temperature.' },
  { id: 'winding', code: 'Tw', label: 'Motor winding temperature', channels: ['motor_winding_temp_c'], x: 490, y: 148, exact: true,
    caveat: 'Inside the motor winding (RTD); access may require motor work.' },
  { id: 'current', code: 'I', label: 'Motor current', channels: ['motor_current_a'], x: 622, y: 84, exact: true,
    caveat: 'From the drive, motor-control cabinet or meter, not a sensor on the pipe.' },
  { id: 'power', code: 'P', label: 'Motor input power', channels: ['motor_power_kw'], x: 668, y: 84, exact: true,
    caveat: 'From the drive or a power meter. Electrical input power, not pump shaft power.' },
  { id: 'speed', code: 'n', label: 'Motor speed', channels: ['motor_speed_rpm'], x: 714, y: 84, exact: true,
    caveat: 'Reported by a VFD only where fitted. For fixed-speed pumps the rated speed is passport metadata, not a measurement.' },
  { id: 'ambient', code: 'Ta', label: 'Ambient temperature', channels: ['ambient_temp_c'], x: 56, y: 56, exact: false,
    caveat: 'Room / ambient context; location not specified.' },
];

export function physicalSource(asset, channel) {
  const wireless = asset.instrumentationTier === 'T1_RETROFIT';
  const vfd = asset.control.startsWith('VFD');
  if (['vibration_rms_mm_s', 'vibration_accel_rms_g', 'vibration_crest_factor'].includes(channel)) return wireless ? 'Wireless retrofit sensor' : 'Wired IO-Link sensor';
  if (channel === 'bearing_temp_c') return wireless ? 'Wireless retrofit sensor' : 'PLC input (PT100)';
  if (channel === 'motor_current_a') return vfd ? 'VFD' : 'PLC / motor-control cabinet';
  if (channel === 'motor_power_kw') return vfd ? 'VFD' : 'Power meter';
  if (channel === 'motor_speed_rpm') return 'VFD';
  if (channel === 'flow_m3_h') return 'Flow meter';
  return 'PLC input';
}

export function pointState(asset, point, proposed = []) {
  const installed = point.channels.every((c) => asset.channelsAvailable.includes(c));
  if (installed) return point.exact ? 'installed' : 'installed-unspecified';
  if (point.channels.some((c) => proposed.includes(c))) return 'proposed';
  return 'absent';
}

const STATE_TEXT = {
  installed: 'Installed', 'installed-unspecified': 'Installed · location not specified', proposed: 'Proposed (hypothesis)', absent: 'Not instrumented',
};

function marker(p, state) {
  const { x, y } = p;
  if (state === 'proposed') {
    return `<path d="M${x} ${y - 16} L${x + 16} ${y} L${x} ${y + 16} L${x - 16} ${y} Z" class="mk-proposed"/>`;
  }
  if (state === 'absent') {
    return `<circle cx="${x}" cy="${y}" r="14" class="mk-absent"/><line x1="${x - 8}" y1="${y + 8}" x2="${x + 8}" y2="${y - 8}" class="mk-absent-slash"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="14" class="mk-installed"/>${state === 'installed-unspecified' ? `<circle cx="${x}" cy="${y}" r="18.5" class="mk-ring"/>` : ''}`;
}

export function renderSchematic(asset, { proposed = [], selected = null, prefix = 'sch' } = {}) {
  const sel = POINTS.find((p) => p.id === selected) ?? null;
  const pts = POINTS.map((p) => {
    const st = pointState(asset, p, proposed);
    const textCls = st === 'installed' || st === 'installed-unspecified' ? 'mk-code-on' : 'mk-code';
    return `<g class="sp${sel?.id === p.id ? ' sp-selected' : ''}" tabindex="0" role="button" data-point="${p.id}" id="${prefix}-${p.id}"
        aria-pressed="${sel?.id === p.id}" aria-label="${esc(tx(p.label))}: ${esc(tx(STATE_TEXT[st]))}. ${L('Show details.', 'Показать подробности.')}">
      ${marker(p, st)}<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" class="${textCls}">${p.code}</text></g>`;
  }).join('');
  const svg = `<div class="sch-scroll" role="region" aria-label="${L('Measurement schematic (scrolls horizontally on narrow screens)', 'Схема измерений (на узком экране прокручивается)')}" tabindex="0"><svg viewBox="0 0 760 270" class="schematic" role="group" aria-label="${L('Pump and motor measurement schematic for', 'Схема измерений насоса и двигателя')} ${esc(asset.assetId)}">
    <rect x="20" y="186" width="185" height="20" class="pipe"/><text x="24" y="226" class="sch-label">${L('Suction (inlet)', 'Всасывание (вход)')}</text>
    <rect x="240" y="40" width="20" height="112" class="pipe"/><rect x="240" y="40" width="210" height="20" class="pipe"/>
    <text x="456" y="55" class="sch-label">${L('Discharge', 'Нагнетание')}</text>
    <circle cx="250" cy="196" r="46" class="casing"/><text x="250" y="200" text-anchor="middle" class="sch-label">${L('Pump', 'Насос')}</text>
    <rect x="296" y="174" width="58" height="44" rx="5" class="housing"/><text x="292" y="256" class="sch-label">${L('Bearing housing', 'Корпус подшипника')}</text>
    <line x1="354" y1="196" x2="420" y2="196" class="shaft"/><text x="366" y="190" class="sch-small">${L('shaft', 'вал')}</text>
    <rect x="420" y="156" width="140" height="80" rx="8" class="motor"/><text x="490" y="202" text-anchor="middle" class="sch-label">${L('Motor', 'Двигатель')}</text>
    <rect x="596" y="40" width="148" height="76" rx="6" class="cabinet"/><text x="604" y="132" class="sch-label">${L('Drive / cabinet / meter', 'Привод / шкаф / счётчик')}</text>
    <path d="M560 180 C 600 180, 640 150, 668 116" class="cable"/>
    ${pts}
  </svg></div><p class="small sch-scroll-hint">${L('Scroll the drawing sideways to see the motor and drive →', 'Прокрутите схему вбок, чтобы увидеть двигатель и привод →')}</p><p class="small muted sch-caption">${L('Functional schematic from the public passport. Not a mounting drawing and not the benchmark topology; the twelve benchmark pumps are independent.', 'Функциональная схема по открытому паспорту. Не монтажный чертёж и не топология бенчмарка; двенадцать насосов независимы.')}</p>`;
  const legend = `<ul class="legend small" aria-label="${L('Legend', 'Условные обозначения')}">
    <li><svg width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="8" class="mk-installed"/></svg> ${tx('Installed')}</li>
    <li><svg width="26" height="26" aria-hidden="true"><circle cx="13" cy="13" r="7" class="mk-installed"/><circle cx="13" cy="13" r="11" class="mk-ring"/></svg> ${tx('Installed · location not specified')}</li>
    <li><svg width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="8" class="mk-absent"/><line x1="6" y1="16" x2="16" y2="6" class="mk-absent-slash"/></svg> ${tx('Not instrumented')}</li>
    <li><svg width="24" height="24" aria-hidden="true"><path d="M12 2 L22 12 L12 22 L2 12 Z" class="mk-proposed"/></svg> ${L('Proposed (hypothesis, not a measurement)', 'Предлагается (гипотеза, не измерение)')}</li></ul>`;
  const rows = POINTS.map((p) => `<tr><th scope="row"><button type="button" class="linkish" data-point="${p.id}">${p.code} · ${esc(tx(p.label))}</button></th>
    <td>${esc(tx(STATE_TEXT[pointState(asset, p, proposed)]))}</td><td class="mono small">${p.channels.join(', ')}</td></tr>`).join('');
  return `<div class="sch-wrap">${svg}${legend}
    <div class="sch-detail" id="${prefix}-detail" aria-live="polite">${sel ? pointDetail(asset, sel, proposed) : `<p class="small muted">${L('Select a measurement point (click, or Tab then Enter) to see its channel, cadence, physical source and placement caveat.', 'Выберите точку измерения (щелчок или Tab и Enter), чтобы увидеть канал, период, физический источник и оговорку о месте.')}</p>`}</div>
    <details class="sch-list"><summary>${L('Text list of all measurement points', 'Текстовый список всех точек измерения')}</summary>
      <div class="table-wrap"><table><thead><tr><th scope="col">${L('Point', 'Точка')}</th><th scope="col">${L('State', 'Состояние')}</th><th scope="col">${L('Channels', 'Каналы')}</th></tr></thead><tbody>${rows}</tbody></table></div></details></div>`;
}

export function pointDetail(asset, p, proposed = []) {
  const st = pointState(asset, p, proposed);
  const meta = Object.fromEntries(asset.channels.map((c) => [c.channelId, c]));
  const chRows = p.channels.map((c) => {
    const inst = asset.channelsAvailable.includes(c);
    return `<li><span class="mono">${c}</span> · ${inst ? `${L('native update', 'период датчика')} ${esc(cadence(meta[c]?.nativeUpdateSeconds))} · ${esc(meta[c]?.unit)} · ${L('source', 'источник')}: ${esc(tx(physicalSource(asset, c)))}` : (proposed.includes(c) ? L('proposed hypothesis — no data exists', 'предлагаемая гипотеза — данных нет') : L('not in this pump\'s passport', 'нет в паспорте этого насоса'))}</li>`;
  }).join('');
  return `<h3>${esc(p.code)} · ${esc(tx(p.label))}</h3><p><span class="state ${st === 'absent' ? 's-gray' : st === 'proposed' ? 's-attn' : 's-info'}">${esc(tx(STATE_TEXT[st]))}</span></p>
    <ul class="tight small">${chRows}</ul><p class="small">${esc(tx(p.caveat))}</p>`;
}

export function bindSchematic(root, asset, { proposed = [], prefix = 'sch', onSelect = () => {} } = {}) {
  const detail = root.querySelector(`#${prefix}-detail`);
  if (!detail) return;
  const select = (id) => {
    const p = POINTS.find((x) => x.id === id);
    if (!p) return;
    detail.innerHTML = pointDetail(asset, p, proposed);
    root.querySelectorAll(`[id^="${prefix}-"][data-point]`).forEach((g) => {
      const on = g.dataset.point === id;
      g.classList.toggle('sp-selected', on);
      g.setAttribute('aria-pressed', String(on));
    });
    onSelect(id);
  };
  root.querySelectorAll('.sch-wrap [data-point]').forEach((el) => {
    el.addEventListener('click', () => select(el.dataset.point));
    if (el.tagName.toLowerCase() === 'g') {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(el.dataset.point); } });
    }
  });
}
