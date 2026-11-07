// Retrofit Doctor local demo. Static bundle, hash routing, no network beyond the local data files.
// All replay rendering goes through sliceReplay(): views never touch rows later than the as-of clock.
import {
  MINUTE_MS, parseUtc, formatUtc, formatDuration, sliceReplay, sliceLabels, clampClock, referenceState,
  channelFreshness, packetState, diagnosticState, visibleCount,
} from './replay.js';
import { CHANNEL_LABELS, CHANNEL_PLACEMENT, ALL_CHANNELS } from './knowledge.js';
import { explainAlert } from './explain.js';
import { renderPlannerPage, bindPlanner } from './planner.js';
import { renderSchematic, bindSchematic } from './schematic.js';
import { renderExperiments } from './experiments.js';
import { renderDiagnosisPage, bindDiagnosis, diagnosisFooter, reviewCases, reviewLoadState, retryReviewCases, casePreview, currentCaseAssetId } from './diagnosis-view.js';
import { availabilityKinds, overviewCounts, selectVisibleCase } from './overview.js';
import { t, getLang, setLang, CHANNEL_RU, durationShort } from './i18n.js';
import { tx } from './ru-text.js';
import { trendCharts } from './trend.js';
import { ruExplainBaseline, FAULT_RU } from './explain-ru.js';

// Documented starting checkpoints (issue times of stored causal alerts); replay starts paused here.
const CHECKPOINTS = { 'PUMP-08': '2025-09-10T12:38:00Z', 'PUMP-09': '2026-02-10T06:28:00Z' };
const SPLIT_LABEL = { train: 'Train', validation: 'Validation', test: 'Blind test' };
const SPEEDS = [1, 10, 60];

const state = {
  fleet: null, fleetError: null,
  replays: {}, // assetId -> { status: 'loading'|'ready'|'error', data, error }
  clocks: {}, // assetId -> ms
  filters: { q: '', split: 'all', site: 'all', show: 'all' },
  ovSel: 'pump04-train', // overview preview selection (not urgency)
  showLabels: false, labelsAsset: null,
  chart: { channel: {}, spanMin: 1440 },
  selectedAlert: {},
  playing: null, speed: 1, endNotice: null, schematicSel: {},
  open: { history: false, tech: false }, // native <details> state survives re-renders
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = (c) => (getLang() === 'ru' ? CHANNEL_RU[c] : CHANNEL_LABELS[c]) ?? c;
const humanType = (t) => (t ?? '').toLowerCase().replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
const pill = (cls, text, title = '') => `<span class="state ${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
const fmtNum = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));
const cadence = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);
const L = (en, ru) => (getLang() === 'ru' ? ru : en);
// Russian labels for replay.js status objects (values unchanged; English passes through).
function ruStatus(o) {
  if (getLang() !== 'ru' || !o) return o ?? {};
  const n = (re) => (o.detail?.match(re) ?? [])[1];
  const m = {
    COLLECTING_REFERENCE: o.label === 'Reference window complete'
      ? { label: 'Окно опоры завершено', detail: 'Ожидание первой минуты после опорного периода.' }
      : { label: 'Сбор опоры', detail: 'Статистические отклонения появятся после первых 24 часов.' },
    REFERENCE_AVAILABLE: { label: `Опора доступна · каналов: ${o.ready}`, detail: 'Эмпирическая опора по первым 24 часам; исправность не подтверждена.' },
    INSUFFICIENT_REFERENCE: { label: 'Недостаточная опора', detail: 'В первые 24 часа нет пригодной опоры. z-оценки недоступны; более поздние данные для опоры не используются.' },
    NO_DATA_YET: { label: 'Ещё нет закрытой минуты' },
    PACKETS_MISSING: { label: 'Пакеты не получены', detail: `Нет строк телеметрии за закрытых минут: ${n(/for (\d+) completed/) ?? '?'} до текущего времени.` },
    RECEIVING: { label: 'Пакеты получены в последнюю минуту', detail: `Строк в последнюю закрытую минуту: ${n(/^(\d+) rows/) ?? '?'} (таблица 1 Гц).` },
    NO_VISIBLE_ALERT: { label: 'Нет предупреждений базового детектора в видимой истории' },
    UNKNOWN_DIAGNOSIS: { label: 'Причина не установлена · вывод базового детектора: UNKNOWN' },
    DATA_QUALITY_ALERT: { label: 'Предупреждение о датчике / качестве данных' },
    ALERT_PRESENT: { label: 'Последнее видимое предупреждение' },
  }[o.state];
  return m ? { ...o, ...m } : o;
}
const dur = (ms) => (getLang() === 'ru' ? durationShort(ms) : formatDuration(ms));
const assetById = (id) => state.fleet?.assets.find((a) => a.assetId === id);

// ---------- data loading ----------
async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadFleet() {
  state.fleetError = null;
  try {
    const fleet = await fetchJson('data/fleet.json');
    if (fleet.schema !== 'retrofit-doctor-demo/1' || !Array.isArray(fleet.assets)) throw new Error('data/fleet.json: unexpected schema');
    state.fleet = fleet;
  } catch (e) {
    state.fleetError = e.message;
  }
  render();
}

function ensureReplay(asset) {
  // Capability boundary: only assets whose metadata names a replay file can ever fetch one.
  if (!asset?.replayFile || asset.mode !== 'VALIDATION_REPLAY') return null;
  const id = asset.assetId;
  const cached = state.replays[id];
  if (cached && cached.status !== 'error') return cached;
  state.replays[id] = { status: 'loading' };
  fetchJson(`data/${asset.replayFile}`)
    .then((data) => {
      if (data.assetId !== id || data.sourceVersion !== 'causal_b1') throw new Error(`${asset.replayFile}: asset or source mismatch`);
      state.replays[id] = { status: 'ready', data };
      if (state.clocks[id] == null) state.clocks[id] = clampClock(data, parseUtc(CHECKPOINTS[id] ?? data.gridStartUtc));
    })
    .catch((e) => { state.replays[id] = { status: 'error', error: e.message }; })
    .finally(render);
  return state.replays[id];
}

// ---------- routing ----------
function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/fleet';
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'pumps' && parts[1]) return { name: parts[2] === 'retrofit' ? 'planner' : 'pump', assetId: parts[1], params };
  if (parts[0] === 'evidence') return { name: 'evidence', params };
  if (parts[0] === 'diagnosis') return { name: 'diagnosis', params };
  return { name: 'fleet', params };
}

function syncClockToUrl(id) {
  const route = parseRoute();
  if (route.name !== 'pump' || route.assetId !== id) return;
  const t = new Date(state.clocks[id]).toISOString().replace('.000Z', 'Z');
  history.replaceState(null, '', `#/pumps/${id}?t=${t}`);
}

let lastRouteKey = null;
let routedOnce = false;
function onRouteChange() {
  const route = parseRoute();
  const key = route.name === 'pump' || route.name === 'planner' ? `${route.name}:${route.assetId}` : route.name;
  if (key !== lastRouteKey) {
    stopPlay();
    state.endNotice = null;
    if (route.assetId !== state.labelsAsset) { state.showLabels = false; state.labelsAsset = route.assetId ?? null; }
    lastRouteKey = key;
    const t = route.params?.get('t');
    if (route.name === 'pump' && t && !Number.isNaN(parseUtc(t))) state.clocks[route.assetId] = parseUtc(t);
    const initial = !routedOnce; routedOnce = true;
    render();
    // Move focus to content on navigation only; on first load keep the natural order (skip link, sidebar, content).
    if (!initial) document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  render();
}

// ---------- replay controls ----------
function setClock(id, ms) {
  const r = state.replays[id];
  if (r?.status !== 'ready') return;
  state.clocks[id] = clampClock(r.data, ms);
  const sel = state.selectedAlert[id];
  if (sel && parseUtc(sel) > state.clocks[id]) delete state.selectedAlert[id]; // discard a now-future selection
  state.endNotice = null;
  syncClockToUrl(id);
  render();
}

function stopPlay() {
  if (state.playing) clearInterval(state.playing.timer);
  state.playing = null;
}

function togglePlay(id) {
  if (state.playing) { stopPlay(); render(); return; }
  const r = state.replays[id];
  if (r?.status !== 'ready') return;
  const end = parseUtc(r.data.gridStartUtc) + r.data.minutes * MINUTE_MS;
  if (state.clocks[id] >= end) state.clocks[id] = parseUtc(r.data.gridStartUtc);
  state.playing = {
    id,
    timer: setInterval(() => {
      const next = Math.floor(state.clocks[id] / MINUTE_MS) * MINUTE_MS + state.speed * MINUTE_MS;
      if (next >= end) { stopPlay(); setClock(id, end); state.endNotice = 'End of replay'; render(); return; }
      setClock(id, next);
    }, 350),
  };
  render();
}

// ---------- rendering ----------
function render() {
  const main = document.getElementById('main');
  const focusId = document.activeElement?.id;
  const route = parseRoute();
  if (route.assetId && assetById(route.assetId)) state.lastAsset = route.assetId;
  syncNav(route);
  // Static shell strings and the language switch follow the current language (no global innerHTML replace).
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  for (const l of ['en', 'ru']) document.getElementById(`lang-${l}`)?.setAttribute('aria-pressed', String(getLang() === l));
  if (state.fleetError) {
    main.innerHTML = `<h1>${L('Source data unavailable', 'Исходные данные недоступны')}</h1><div class="error" role="alert">${L('Could not read', 'Не удалось прочитать')} <span class="mono">${esc(state.fleetError)}</span>.</div>
      <p><button id="retry-fleet" class="primary">${L('Retry', 'Повторить')}</button></p>
      <p class="muted small">${L('Run', 'Запустите')} <span class="mono">python scripts/export_demo.py</span> ${L('and serve the', 'и раздайте папку')} <span class="mono">web/</span> ${L('folder (see web/README.md).', '(см. web/README.md).')}</p>`;
    bind(main, route);
    return;
  }
  if (!state.fleet) { main.innerHTML = `<p class="loading" role="status">${L('Loading source data…', 'Загрузка исходных данных…')}</p>`; return; }
  const views = { fleet: renderFleet, pump: renderPump, planner: renderPlanner, evidence: renderEvidence, diagnosis: (r) => renderDiagnosisPage(r, assetById, render) };
  main.innerHTML = views[route.name](route);
  // The pump check route resolves its case while rendering; scope the sidebar pump links to that case's pump.
  if (route.name === 'diagnosis' && currentCaseAssetId()) { state.lastAsset = currentCaseAssetId(); syncNav(route); }
  const foot = document.getElementById('provenance-foot');
  if (foot) foot.textContent = route.name === 'diagnosis' ? (diagnosisFooter() ?? '') : getLang() === 'ru' ? `Пакет создан ${state.fleet.provenance.generator} из ${state.fleet.provenance.inputs.length} хэшированных исходных файлов.` : `Bundle generated by ${state.fleet.provenance.generator} from ${state.fleet.provenance.inputs.length} hashed source files.`;
  bind(main, route);
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

function syncNav(route) {
  const navAsset = state.lastAsset ?? 'PUMP-08';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === 'pump') a.setAttribute('href', `#/pumps/${navAsset}`);
    if (a.dataset.nav === 'planner') a.setAttribute('href', `#/pumps/${navAsset}/retrofit`);
    if (a.dataset.nav === route.name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-nav-asset]').forEach((el) => { el.textContent = navAsset; });
}

// Measurement coverage in plain words, from the passport channel list only (no health inference).
const COVERAGE = [
  ['pressures', ['suction_pressure_kpa', 'discharge_pressure_kpa']], ['flow', ['flow_m3_h']], ['speed', ['motor_speed_rpm']],
  ['vibration', ['vibration_rms_mm_s', 'vibration_accel_rms_g', 'vibration_crest_factor']], ['temperatures', ['bearing_temp_c', 'motor_winding_temp_c', 'fluid_temp_c']],
];
function coverageText(a) {
  const has = new Set(a.channelsAvailable);
  const yes = COVERAGE.filter(([, cs]) => cs.some((c) => has.has(c))).map(([n]) => t(`cov.${n}`));
  const no = COVERAGE.filter(([, cs]) => !cs.some((c) => has.has(c))).map(([n]) => (n === 'flow' ? t('cov.noflow') : n === 'speed' ? t('cov.nospeed') : t('cov.no', { x: t(`cov.${n}`) })));
  return `${yes.length ? `${t('cov.has')}: ${yes.join(', ')}` : t('cov.none')}${no.length ? ` · ${no.join(', ')}` : ''}`;
}

const reviewHref = (c) => `#/diagnosis?case=${c.caseId}&t=${c.alertUtc}`;
const reviewCase = (assetId) => reviewCases(render)?.find((c) => c.assetId === assetId) ?? null;

// Compact sensor codes (Ps, Pd, Q, n, V, I) with their full names from the dictionary.
const COV_CODE = { 'ov.c.ps': 'Ps', 'ov.c.pd': 'Pd', 'ov.c.q': 'Q', 'ov.c.n': 'n', 'ov.c.vib': 'V', 'ov.c.i': 'I' };
// Small inline icons (no dependency): review = chart, replay = play, passport = document.
const ICON = {
  review: '<svg viewBox="0 0 20 20" aria-hidden="true" class="ico"><path d="M3 16h14M4 13l4-4 3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  replay: '<svg viewBox="0 0 20 20" aria-hidden="true" class="ico"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.3 6.8v6.4l5-3.2z" fill="currentColor"/></svg>',
  inventory: '<svg viewBox="0 0 20 20" aria-hidden="true" class="ico"><path d="M5 2.8h7l3 3v11.4H5z M12 2.8v3h3 M7.5 9.5h5 M7.5 12.5h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};
const COV_COLS = [['ov.c.ps', ['suction_pressure_kpa']], ['ov.c.pd', ['discharge_pressure_kpa']], ['ov.c.q', ['flow_m3_h']], ['ov.c.n', ['motor_speed_rpm']],
  ['ov.c.vib', ['vibration_rms_mm_s', 'vibration_accel_rms_g', 'vibration_crest_factor']], ['ov.c.i', ['motor_current_a']]];

function renderFleet() {
  const { assets } = state.fleet;
  const f = state.filters;
  const cases = reviewCases(render);
  const sites = [...new Set(assets.map((a) => a.site))].sort();
  const q = f.q.trim().toLowerCase();
  const match = (a) => (f.split === 'all' || a.split === f.split) && (f.site === 'all' || a.site === f.site)
    && (f.show === 'all' || availabilityKinds(a, cases).includes(f.show))
    && (!q || `${a.assetId} ${a.site} ${a.system} ${tx(a.site)} ${tx(a.system)}`.toLowerCase().includes(q));
  const rows = assets.filter(match);
  const by = (sp) => assets.filter((a) => a.split === sp).length;
  // Counts derived from the data (they overlap by design).
  const counts = overviewCounts(assets, cases);
  const load = reviewLoadState();
  const card = (k, v, sub) => `<div class="kpi"><span class="kpi-k">${esc(t(k))}</span><b class="num">${v ?? '…'}</b><span class="small muted">${esc(sub)}</span></div>`;
  const visibleCases = (cases ?? []).filter((c) => match(assetById(c.assetId)));
  const sel = selectVisibleCase(visibleCases, state.ovSel);
  const queue = cases ? visibleCases.map((c) => {
    const a = assetById(c.assetId);
    const pv = casePreview(c, a);
    const on = sel && sel.caseId === c.caseId;
    // Compact row: pump + short system | reason, then time · evidence | actions. Wraps instead of clipping.
    return `<li class="q-row${on ? ' row-selected' : ''}">
      <div class="q-asset"><b>${c.assetId}</b><span class="small muted">${esc(tx(a.system))}</span></div>
      <div class="q-main"><span class="reason">${esc(pv.title)}</span>
        <span class="small muted"><span class="num">${esc(formatUtc(parseUtc(c.alertUtc)))}</span> · ${esc(pv.evidence)}</span></div>
      <div class="row-actions"><button type="button" data-ov-sel="${c.caseId}" aria-pressed="${on}">${esc(on ? t('ov.selected') : t('ov.select'))}<span class="sr"> ${c.assetId}</span></button>
        <a class="button primary" href="${reviewHref(c)}">${esc(t('ov.open'))}<span class="sr"> ${c.assetId}</span></a></div></li>`;
  }).join('') : '';
  const loadError = load.status === 'error'
    ? `<div class="error" role="alert">${esc(t('rv.error'))}: <span class="mono">${esc(load.error)}</span></div><p><button id="ov-retry" type="button" class="primary">${esc(t('rv.retry'))}</button></p>` : null;
  let preview = loadError ? `<div class="empty small">${esc(t('rv.error'))}</div>` : `<p class="loading small" role="status">${esc(t('rv.loading'))}</p>`;
  if (cases && !sel) preview = `<div class="empty small">${esc(t('ov.noCases'))}</div>`;
  if (sel) {
    const a = assetById(sel.assetId); const pv = casePreview(sel, a);
    preview = `<h2 id="ov-prev-h">${esc(t('ov.preview', { id: sel.assetId }))}</h2>
      <p class="small muted">${esc(t('ov.previewAt', { t: formatUtc(parseUtc(sel.alertUtc), { seconds: true }) }))}</p>
      ${pv.html}
      <p class="ov-links"><a class="button primary" href="${reviewHref(sel)}">${esc(t('ov.openFull'))} →</a>${pv.kind === 'unsupported' ? ` <a class="button" href="#/pumps/${sel.assetId}/retrofit">${esc(t('ov.assess'))}</a>` : ''}</p>`;
  }
  const mark = (on) => (on ? `<span class="cov-yes" aria-hidden="true">●</span><span class="sr">${esc(t('ov.yes'))}</span>` : `<span class="cov-no" aria-hidden="true">○</span><span class="sr">${esc(t('ov.no'))}</span>`);
  // One functional data column: each icon is a labelled link to what exists (review, replay, sensor list).
  const dataLinks = (a) => {
    const review = (cases ?? []).find((c) => c.assetId === a.assetId);
    const kinds = availabilityKinds(a, cases);
    const link = (kind, href, name) => `<a class="ico-link ico-${kind}" href="${href}" title="${esc(name)}" aria-label="${esc(name)}">${ICON[kind]}</a>`;
    return kinds.map((k) => (k === 'review' ? link('review', reviewHref(review), t('cov.reviewA', { id: a.assetId }))
      : k === 'replay' ? link('replay', `#/pumps/${a.assetId}`, t('cov.replayA', { id: a.assetId }))
        : link('inventory', `#/pumps/${a.assetId}`, t('cov.passportA', { id: a.assetId })))).join('')
      + (a.split === 'test' ? `<span class="test-badge" title="${esc(t('cov.testL'))}">${esc(t('cov.test'))}<span class="sr"> — ${esc(t('cov.testL'))}</span></span>` : '');
  };
  const covRows = rows.map((a) => {
    const has = new Set(a.channelsAvailable);
    const full = `${tx(a.system)} · ${tx(a.site)}`;
    return `<tr><th scope="row"><a class="cov-id" href="#/pumps/${a.assetId}">${a.assetId}</a><span class="cov-sys small muted" title="${esc(full)}">${esc(full)}</span></th>
      ${COV_COLS.map(([k, chs]) => `<td class="cov" data-label="${esc(COV_CODE[k])} · ${esc(t(k))}">${mark(chs.some((c) => has.has(c)))}</td>`).join('')}
      <td class="cov-data" data-label="${esc(t('cov.col.data'))}">${dataLinks(a)}</td></tr>`;
  }).join('');
  const legend = `<div class="cov-legend small" aria-label="${esc(t('cov.legend'))}">
      <p><b>${esc(t('cov.legendSensors'))}:</b> ${COV_COLS.map(([k]) => `<span class="lg-item"><b>${esc(COV_CODE[k])}</b> ${esc(t(k).toLowerCase())}</span>`).join('')}</p>
      <p><span class="lg-item"><span class="cov-yes" aria-hidden="true">●</span> ${esc(t('cov.installed'))}</span><span class="lg-item"><span class="cov-no" aria-hidden="true">○</span> ${esc(t('cov.missing'))}</span><span class="muted">${esc(t('cov.instNote'))}</span></p>
      <p><b>${esc(t('cov.col.data'))}:</b> <span class="lg-item"><span class="ico-link ico-review lg-ico">${ICON.review}</span> ${esc(t('cov.review'))}</span><span class="lg-item"><span class="ico-link ico-replay lg-ico">${ICON.replay}</span> ${esc(t('cov.replay'))}</span><span class="lg-item"><span class="ico-link ico-inventory lg-ico">${ICON.inventory}</span> ${esc(t('cov.passport'))}</span><span class="lg-item"><span class="test-badge">${esc(t('cov.test'))}</span> ${esc(t('cov.testL'))}</span></p>
    </div>`;
  return `<div class="page-head"><h1>${esc(t('ov.h1'))}</h1>${pill('s-gray', t('fleet.badge'))}</div>
    <div class="filters ov-filters" role="search">
      <label>${esc(t('fleet.search'))}<input id="f-q" type="search" value="${esc(f.q)}" placeholder="${esc(t('fleet.searchPh'))}"></label>
      <label>${esc(t('fleet.site'))}<select id="f-site"><option value="all">${esc(t('fleet.allSites'))}</option>${sites.map((x) => `<option value="${esc(x)}"${f.site === x ? ' selected' : ''}>${esc(tx(x))}</option>`).join('')}</select></label>
      <label>${esc(t('fleet.show'))}<select id="f-show">${[['all', t('fleet.showAll')], ['review', t('av.review')], ['replay', t('av.replay')], ['inventory', t('av.inventory')]].map(([v, x]) => `<option value="${v}"${f.show === v ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <button id="f-reset" type="button">${esc(t('fleet.reset'))}</button>
    </div>
    <section class="kpis" aria-label="${esc(t('ov.card.total'))} *">
      ${card('ov.card.total', counts.total, t('ov.card.totalS'))}${card('ov.card.reviews', cases ? counts.reviews : null, t('ov.card.reviewsS'))}
      ${card('ov.card.replay', counts.replay, t('ov.card.replayS'))}${card('ov.card.inv', cases ? counts.inventory : null, t('ov.card.invS', { n: counts.inventoryBlindTest }))}
    </section>
    <p class="footnote small muted">* ${esc(t('ov.overlap'))}</p>
    <div class="ov-grid">
      <section class="panel ov-queue" aria-labelledby="ov-q-h"><div class="panel-head"><h2 id="ov-q-h">${esc(t('ov.queue'))}</h2><span class="small muted">${esc(t('ov.queueNote'))}</span></div>
        ${cases ? (queue ? `<ul class="queue" aria-label="${esc(t('ov.queue'))}">${queue}</ul>` : `<div class="empty"><p>${esc(t('ov.noCases'))}</p><button id="f-reset-empty" type="button">${esc(t('fleet.reset'))}</button></div>`)
          : loadError ?? `<p class="loading small" role="status">${esc(t('rv.loading'))}</p>`}
      </section>
      <section class="panel ov-preview" aria-labelledby="ov-prev-h" aria-live="polite">${preview}</section>
    </div>
    <section class="panel" aria-labelledby="pumps-h"><div class="panel-head"><h2 id="pumps-h">${esc(t('ov.cov'))}</h2></div>
      ${legend}
      ${rows.length ? `<div class="table-wrap" role="region" aria-label="${esc(t('ov.cov'))}" tabindex="0"><table class="cov-table">
        <thead><tr><th scope="col">${esc(t('fleet.col.pump'))}</th>${COV_COLS.map(([k]) => `<th scope="col" class="cov"><abbr title="${esc(t(k))}">${esc(COV_CODE[k])}</abbr><span class="sr"> — ${esc(t(k))}</span></th>`).join('')}<th scope="col">${esc(t('cov.col.data'))}</th></tr></thead>
        <tbody>${covRows}</tbody></table></div>`
      : `<div class="empty"><p>${esc(t('fleet.none'))}</p></div>`}
      <details class="panel-sub" id="f-details"${f.split !== 'all' ? ' open' : ''}><summary>${esc(t('fleet.details'))}</summary>
        <p class="small">${esc(t('fleet.splitText', { n: assets.length, tr: by('train'), va: by('validation'), te: by('test') }))}</p>
        <label class="small">${esc(t('fleet.split'))}<select id="f-split">${['all', 'train', 'validation', 'test'].map((x) => `<option value="${x}"${f.split === x ? ' selected' : ''}>${esc(t(`split.${x}`))}</option>`).join('')}</select></label>
        <div class="table-wrap" role="region" aria-label="${esc(t('fleet.details'))}" tabindex="0"><table>
          <thead><tr><th scope="col">${esc(t('fleet.col.pump'))}</th><th scope="col">${esc(t('fleet.col.split'))}</th><th scope="col">${esc(t('fleet.col.tier'))}</th><th scope="col">${esc(t('fleet.col.control'))}</th><th scope="col" class="num">${esc(t('fleet.col.ch'))}</th><th scope="col">${esc(t('fleet.col.window'))}</th></tr></thead>
          <tbody>${rows.map((a) => `<tr><th scope="row">${a.assetId}</th><td>${esc(t(`split.${a.split}`))}</td><td class="mono">${esc(a.instrumentationTier)}</td><td class="mono">${esc(a.control)}</td><td class="num">${a.channelsAvailable.length}</td><td class="num">${esc(formatUtc(parseUtc(a.windowStartUtc)).slice(0, 10))} – ${esc(formatUtc(parseUtc(a.windowEndUtc)).slice(0, 10))}</td></tr>`).join('')}</tbody></table></div>
      </details>
      <details class="panel-sub"><summary>${esc(t('ov.provenance'))}</summary><p class="small">${esc(t('ov.provText'))}</p>
        <p class="small"><a href="#/evidence">${esc(t('fleet.links'))}</a> · <a href="#/diagnosis">${esc(t('fleet.linksAll'))}</a></p></details>
    </section>`;
}

function inventoryTable(asset, view) {
  const installed = new Set(asset.channelsAvailable);
  const meta = Object.fromEntries(asset.channels.map((c) => [c.channelId, c]));
  const rows = ALL_CHANNELS.map((c) => {
    const isIn = installed.has(c);
    if (!view) {
      return `<tr><th scope="row">${esc(label(c))}<div class="small muted mono">${c}</div></th><td>${isIn ? pill('s-info', tx('Installed')) : pill('s-gray', tx('Not instrumented'))}</td>
        <td class="num">${isIn ? esc(cadence(meta[c].nativeUpdateSeconds)) : '—'}</td><td>${isIn ? esc(meta[c].unit) : '—'}</td><td class="small">${esc(tx(CHANNEL_PLACEMENT[c]))}</td></tr>`;
    }
    const fr = channelFreshness(view, c, isIn);
    const cls = { NOT_INSTRUMENTED: 's-gray', NO_MEASUREMENT: 's-gray', UPDATE_OVERDUE: 's-attn', WITHIN_CADENCE: 's-info' }[fr.state];
    const last = fr.windowEndMs != null ? `${esc(formatUtc(fr.windowEndMs))}<div class="small muted">${L('sample in minute ending; age', 'отсчёт в минуте, заканчивающейся; возраст')} ${esc(dur(fr.ageMinMs))}–${esc(dur(fr.ageMaxMs))}</div>` : '—';
    return `<tr><th scope="row">${esc(label(c))}<div class="small muted mono">${c}</div></th><td>${pill(cls, tx(fr.label))}</td>
      <td class="num">${isIn ? esc(cadence(meta[c].nativeUpdateSeconds)) : '—'}</td>
      <td class="num">${fr.value != null ? `${fmtNum(fr.value, 3)} ${esc(meta[c]?.unit)}` : '—'}</td>
      <td class="num">${fr.z != null ? fmtNum(fr.z, 1) : (!isIn ? '—' : view.channels[c]?.z == null ? `<span class="muted small">${L('not used by B1', 'не используется B1')}</span>` : `<span class="muted">${L('unavailable', 'недоступно')}</span>`)}</td><td>${last}</td></tr>`;
  }).join('');
  const head = view
    ? `<th scope="col">${L('Channel', 'Канал')}</th><th scope="col">${L('State', 'Состояние')}</th><th scope="col" class="num">${L('Native interval', 'Период датчика')}</th><th scope="col" class="num">${L('Last value', 'Последнее значение')}</th><th scope="col" class="num">${L('Causal z', 'Причинный z')}</th><th scope="col">${L('Last measured (UTC)', 'Последнее измерение (UTC)')}</th>`
    : `<th scope="col">${L('Channel', 'Канал')}</th><th scope="col">${L('Installed', 'Установлен')}</th><th scope="col" class="num">${L('Native interval', 'Период датчика')}</th><th scope="col">${L('Unit', 'Единица')}</th><th scope="col">${L('Conceptual placement', 'Условное расположение')}</th>`;
  return `<div class="table-wrap" role="region" aria-label="Sensor inventory" tabindex="0"><table>
    <caption>${view ? L('Values are 1-minute window means. Sparse channels have no value between native samples (no forward fill). Overdue = no sample for longer than the native interval plus one window.', 'Значения — средние за 1-минутные окна. У редких каналов между собственными отсчётами значений нет (без протягивания). Просрочено = нет отсчёта дольше периода датчика плюс одно окно.') : L('From the public asset passport (assets.csv channels_available). Native intervals mirror the benchmark sensor model. Placement is conceptual, not a mounting drawing.', 'Из открытого паспорта насоса (assets.csv channels_available). Периоды соответствуют модели датчиков бенчмарка. Расположение условное, это не монтажный чертёж.')}</caption>
    <thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function pumpHeader(asset, extra = '') {
  const modeBadge = { VALIDATION_REPLAY: pill('s-info', tx('Validation replay · Synthetic benchmark')), TEST_METADATA_ONLY: pill('s-gray', tx('Blind test · Metadata only')), TRAIN_REPLAY: pill('s-gray', L('Training pump · passport', 'Обучающий насос · паспорт')) }[asset.mode];
  const rc = reviewCase(asset.assetId);
  // Back path to the warning review (case kept; the review keeps its own clock when no t= is given).
  return `<a class="backlink" href="#/fleet">${esc(t('pd.back'))}</a>${rc ? ` · <a class="backlink" href="#/diagnosis?case=${rc.caseId}">${L('← Back to the warning review', '← Назад к разбору предупреждения')}</a>` : ''}
    <h1>${asset.assetId}</h1>
    <p class="sub">${esc(tx(asset.site))} · ${esc(tx(asset.system))} · ${esc(asset.instrumentationTier)} · ${esc(asset.control)} ${modeBadge}</p>
    <div class="tabs" role="navigation" aria-label="Pump sections">
      <a class="button${extra === 'planner' ? '' : ' primary'}" href="#/pumps/${asset.assetId}"${extra === 'planner' ? '' : ' aria-current="page"'}>${esc(t('pd.tabDetail'))}</a>
      <a class="button${extra === 'planner' ? ' primary' : ''}" href="#/pumps/${asset.assetId}/retrofit"${extra === 'planner' ? ' aria-current="page"' : ''}>${esc(t('pd.tabPlanner'))}</a>
    </div>`;
}

function metadataPanel(asset) {
  return `<section class="panel" aria-labelledby="meta-h"><h2 id="meta-h">${L('Passport metadata', 'Паспортные данные')}</h2><dl class="kv">
    <dt>${L('Observation window', 'Окно наблюдения')}</dt><dd class="num">${esc(formatUtc(parseUtc(asset.windowStartUtc)))} – ${esc(formatUtc(parseUtc(asset.windowEndUtc)))}</dd>
    <dt>${L('Fluid', 'Среда')}</dt><dd>${esc(tx(asset.fluid))}</dd><dt>${L('Commissioned', 'Ввод в эксплуатацию')}</dt><dd>${asset.commissionedYear}</dd>
    <dt>${L('Motor rated', 'Двигатель, номинал')}</dt><dd class="num">${asset.motorRatedKw} kW · ${asset.ratedRpmMetadata} rpm ${L('(passport rating, not a measurement)', '(паспортный номинал, не измерение)')}</dd>
    <dt>${L('Design point', 'Расчётная точка')}</dt><dd class="num">${asset.designFlowM3h} m³/h ${L('at', 'при')} ${asset.designHeadM} m</dd>
    <dt>${L('Speed measurement', 'Измерение частоты вращения')}</dt><dd>${asset.channelsAvailable.includes('motor_speed_rpm') ? L('Measured speed channel installed', 'Канал измеренной частоты установлен') : L('No measured speed channel', 'Нет канала измеренной частоты')}</dd>
    <dt>${L('Source', 'Источник')}</dt><dd class="mono">vendor/benchmark/data/full/assets.csv</dd></dl></section>`;
}

function renderPump(route) {
  const asset = assetById(route.assetId);
  if (!asset) return `<h1>${L('Pump not found', 'Насос не найден')}</h1><p>${L('No pump with this ID exists in the public metadata.', 'Насоса с таким идентификатором нет в открытых данных.')}</p><p><a class="button primary" href="#/fleet">${L('Back to Fleet', 'Назад к парку')}</a></p>`;
  if (asset.mode !== 'VALIDATION_REPLAY') {
    const banner = asset.mode === 'TEST_METADATA_ONLY'
      ? `<div class="note" role="note">${L('<b>Diagnosis unavailable.</b> Blind test asset: only the public passport and sensor inventory are bundled. No telemetry, alerts or labels exist in this application.', '<b>Диагностика недоступна.</b> Насос слепого теста: в приложении есть только открытый паспорт и перечень датчиков. Телеметрии, предупреждений и меток нет.')}</div>`
      : reviewCase(asset.assetId)
        ? `<div class="note" role="note">${L('<b>Full minute-by-minute replay is not included</b> for this training pump; a separate reviewed warning episode is available.', '<b>Полное поминутное воспроизведение не включено</b> для этого обучающего насоса; доступен отдельный разобранный эпизод.')}
            <a class="button primary" href="${reviewHref(reviewCase(asset.assetId))}">${L('Open the reviewed warning', 'Открыть разобранное предупреждение')}</a></div>`
        : `<div class="note" role="note">${L('<b>Replay not loaded.</b> Training-asset replay is not part of this demo bundle. Sensor inventory is from the public passport. Inventory only does not mean healthy.', '<b>Запись не загружена.</b> Записи этого обучающего насоса нет в демо-пакете. Перечень датчиков — из открытого паспорта. Только перечень — не признак исправности.')}</div>`;
    return `${pumpHeader(asset)}${banner}<p></p>${schematicPanel(asset)}<div class="grid-2"><section class="panel" aria-labelledby="inv-h"><h2 id="inv-h">${L('Sensor inventory', 'Перечень датчиков')}</h2>${inventoryTable(asset, null)}</section>${metadataPanel(asset)}</div>`;
  }
  const r = ensureReplay(asset);
  if (r.status === 'loading') return `${pumpHeader(asset)}<p class="loading" role="status">${L('Loading replay source…', 'Загрузка записи…')}</p>`;
  if (r.status === 'error') {
    return `${pumpHeader(asset)}<div class="error" role="alert"><b>${L('Signal data unavailable.', 'Данные сигналов недоступны.')}</b> ${L('Replay source could not be read:', 'Не удалось прочитать запись:')} <span class="mono">${esc(r.error)}</span>. No curve or alert is shown instead.</div>
      <p><button id="retry-replay" class="primary" data-asset="${asset.assetId}">${L('Retry', 'Повторить')}</button></p>
      <section class="panel"><h2>Sensor inventory</h2>${inventoryTable(asset, null)}</section>`;
  }
  const replay = r.data;
  const id = asset.assetId;
  const asOf = state.clocks[id];
  const view = sliceReplay(replay, asOf); // ← the only replay data passed to rendering below
  const start = view.gridStartMs; const end = view.gridEndMs;
  const ref = referenceState(view);
  const pk = packetState(view);
  const diag = diagnosticState(view);
  const selTime = state.selectedAlert[id];
  const selected = view.alerts.find((a) => a.alert_time_utc === selTime) ?? diag.alert ?? null;
  const channels = Object.keys(view.channels);
  const defaultChannel = selected ? channels.find((c) => selected.evidence.includes(c)) : null;
  const chartChannel = state.chart.channel[id] && channels.includes(state.chart.channel[id]) ? state.chart.channel[id] : (defaultChannel ?? channels[0]);
  const isoInput = new Date(asOf).toISOString().slice(0, 19);
  return `${pumpHeader(asset)}
    <section class="clockbar" aria-label="Replay clock">
      <div><div class="small muted">${L('Replay as of', 'Время воспроизведения')}</div><div class="asof" aria-live="polite">${esc(formatUtc(asOf, { seconds: asOf % MINUTE_MS !== 0 }))}</div>
        <div class="small muted">${L(`${view.visibleMinutes} of ${replay.minutes} completed minutes visible · window`, `Видно закрытых минут: ${view.visibleMinutes} из ${replay.minutes} · окно`)} ${esc(formatUtc(start))} – ${esc(formatUtc(end))}</div></div>
      <div class="controls">
        <button id="play" type="button" class="primary" aria-pressed="${state.playing ? 'true' : 'false'}">${state.playing ? L('Pause', 'Пауза') : L('Play', 'Пуск')}</button>
        <label>${L('Speed', 'Скорость')}<select id="speed">${SPEEDS.map((s) => `<option value="${s}"${state.speed === s ? ' selected' : ''}>${s} ${L('min / step', 'мин / шаг')}</option>`).join('')}</select></label>
        <button id="back-h" type="button" aria-label="Back one hour">−1 h</button>
        <button id="back-m" type="button" aria-label="Previous completed minute">−1 min</button>
        <button id="fwd-m" type="button" aria-label="Next completed minute">+1 min</button>
        <button id="fwd-h" type="button" aria-label="Forward one hour">+1 h</button>
        <label>${L('Set time (UTC)', 'Задать время (UTC)')}<input id="t-input" type="datetime-local" step="1" value="${isoInput}" min="${new Date(start).toISOString().slice(0, 19)}" max="${new Date(end).toISOString().slice(0, 19)}"></label>
      </div>
      <input id="t-range" type="range" min="0" max="${replay.minutes}" step="1" value="${visibleCount(replay, asOf)}" aria-label="Replay time, minutes since window start" aria-valuetext="${esc(formatUtc(asOf))}">
      ${state.endNotice ? `<span role="status">${pill('s-gray', state.endNotice)}</span>` : ''}
    </section>
    ${selected ? diagnosisCard(asset, view, selected) : `<section class="panel diag" aria-labelledby="dx-h"><h2 id="dx-h" tabindex="-1">${L('Selected alert', 'Выбранное предупреждение')}</h2><div class="empty">${L('No baseline alert in this visible history. No alert does not prove the pump is healthy.', 'В видимой истории нет предупреждений базового детектора. Отсутствие предупреждений не доказывает исправность насоса.')}</div></section>`}
    ${view.alerts.length ? `<details class="panel history" id="al-history"${state.open.history ? ' open' : ''}><summary><h2 id="al-h">${L('Alert history', 'История предупреждений')} (${view.alerts.length} ${L('visible', 'видимых')})</h2>
        <span class="small muted">${L('Select an alert to explain it. Newest first.', 'Выберите предупреждение для разбора. Новые сверху.')}</span></summary>
      <ul class="alert-list">${[...view.alerts].reverse().map((a, i) => `<li><button type="button" id="al-${i}" data-alert="${esc(a.alert_time_utc)}" aria-pressed="${selected && a.alert_time_utc === selected.alert_time_utc}">
        <span class="num">${esc(formatUtc(parseUtc(a.alert_time_utc)))}</span> · ${esc(getLang() === 'ru' ? (FAULT_RU[a.fault_type]?.name ?? humanType(a.fault_type)) : humanType(a.fault_type))} <span class="small muted">${esc(a.event_class === 'SENSOR' ? L('data-quality rule', 'правило качества данных') : L('machine rule', 'правило машины'))}</span></button></li>`).join('')}</ul>
    </details>` : ''}
    <div class="status-row">
      <section class="panel" aria-labelledby="st-ref"><h2 id="st-ref">${L('Statistical reference', 'Статистическая опора')}</h2>${pill(ref.state === 'REFERENCE_AVAILABLE' ? 's-info' : ref.state === 'INSUFFICIENT_REFERENCE' ? 's-attn' : 's-gray', ruStatus(ref).label)}<p class="small muted">${esc(ruStatus(ref).detail)}</p></section>
      <section class="panel" aria-labelledby="st-pk"><h2 id="st-pk">${L('Data packets', 'Пакеты данных')}</h2>${pill(pk.state === 'PACKETS_MISSING' ? 's-attn' : pk.state === 'RECEIVING' ? 's-info' : 's-gray', ruStatus(pk).label)}<p class="small muted">${esc(ruStatus(pk).detail ?? '')} ${L('Operating mode', 'Режим работы')}: ${esc(view.rows.operatingMode[view.visibleMinutes - 1] ?? '—')}.</p></section>
      <section class="panel" aria-labelledby="st-dx"><h2 id="st-dx">${L('Baseline output (causal B1)', 'Вывод базового детектора (B1)')}</h2>${pill(diag.state === 'NO_VISIBLE_ALERT' ? 's-gray' : diag.state === 'UNKNOWN_DIAGNOSIS' ? 's-attn' : 's-alert', ruStatus(diag).label)}<p class="small muted">${diag.alert ? `${esc(getLang() === 'ru' ? (FAULT_RU[diag.alert.fault_type]?.name ?? humanType(diag.alert.fault_type)) : humanType(diag.alert.fault_type))} · ${esc(formatUtc(parseUtc(diag.alert.alert_time_utc)))}. ${L('A historical alert is not necessarily an ongoing fault.', 'Историческое предупреждение не обязательно означает текущую неисправность.')}` : L('No alert does not prove the pump is healthy.', 'Отсутствие предупреждений не доказывает исправность насоса.')}</p></section>
    </div>
    <div class="grid-2">
      <section class="panel chart" aria-labelledby="ch-h">
        <h2 id="ch-h">${L('Trend up to the as-of time', 'Тренд до текущего времени')}</h2>
        <div class="chart-tools">
          <label>${L('Channel', 'Канал')}<select id="ch-sel">${channels.map((c) => `<option value="${c}"${c === chartChannel ? ' selected' : ''}>${esc(label(c))} (${esc(view.channels[c].unit)})</option>`).join('')}</select></label>
          <label>${L('Span', 'Интервал')}<select id="span-sel">${[[360, L('Last 6 h', 'Последние 6 ч')], [1440, L('Last 24 h', 'Последние 24 ч')], [0, L('All visible history', 'Вся видимая история')]].map(([v, t]) => `<option value="${v}"${state.chart.spanMin === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
        ${trendCharts(view, chartChannel, state.chart.spanMin, state.showLabels ? sliceLabels(replay, asOf) : null)}
      </section>
      ${evaluationPanel(replay, asOf)}
    </div>
    ${schematicPanel(asset)}
    <section class="panel" aria-labelledby="inv-h"><h2 id="inv-h">${L('Sensor inventory and freshness at the as-of time', 'Датчики и свежесть данных на текущее время')}</h2>${inventoryTable(asset, view)}</section>`;
}

function schematicPanel(asset) {
  return `<section class="panel" aria-labelledby="sch-h"><h2 id="sch-h">${L('Where the measurements are', 'Где расположены измерения')}</h2>
    ${renderSchematic(asset, { selected: state.schematicSel[asset.assetId], prefix: 'sch' })}</section>`;
}

const GAP_PILL = {
  'not-installed': ['s-gray', 'Not installed'], 'no-sample': ['s-attn', 'No sample this minute'], 'no-z': ['s-attn', 'No reference comparison'],
  'not-in-benchmark': ['s-gray', 'Not in benchmark'], 'partial': ['s-attn', 'Partial coverage'], 'no-rows': ['s-attn', 'No telemetry'],
};
const KIND_PILL = {
  machine: ['s-alert', 'Machine rule · unconfirmed'], unknown: ['s-attn', 'Cause unresolved · UNKNOWN'],
  sensor: ['s-attn', 'Data-quality warning'], stuck: ['s-attn', 'Data-quality warning · stuck reading'], gap: ['s-attn', 'Data gap'],
};

// Selected-alert explanation. Content comes only from explainAlert(view, alert, asset); labels are never an input.
// Default view: one hypothesis statement, observed values, short uncertainty summary, next check.
// Full hypothesis, z explanation, per-channel gaps and source fields live in the technical disclosure.
const zText = (z) => `${z > 0 ? '+' : z < 0 ? '−' : ''}${Math.abs(z).toFixed(2)}`;
function diagnosisCard(asset, view, alert) {
  const e = explainAlert(view, alert, asset);
  if (!e.available) return `<section class="panel diag" aria-labelledby="dx-h"><h2 id="dx-h" tabindex="-1">${L('Selected alert', 'Выбранное предупреждение')}</h2><div class="empty">${esc(e.timing)}</div></section>`;
  const t = e.technical;
  // Russian view: same structured explanation, composed in Russian (explain-ru.js); technical fields stay original.
  const ru = getLang() === 'ru' ? ruExplainBaseline(e, alert, asset, view.asOfMs) : null;
  const V = (en, r) => (ru ? r : en);
  const i = Math.round((e.issuedMs - view.gridStartMs) / MINUTE_MS) - 1;
  const obs = e.observations.map((o) => `<li><b>${esc(o.channelId ? label(o.channelId) : V(o.label, 'Строки телеметрии'))}</b> ${o.named ? pill('s-info', V('Named in source evidence', 'Назван в исходных данных детектора')) : pill('s-gray', V('Also deviating · not named', 'Тоже отклоняется · не назван'))}<br>
      ${o.channelId ? `${V('Measured', 'Измерено')} <span class="num">${o.value != null ? `${esc(o.value)} ${esc(o.unit)}` : V('no sample in this minute', 'нет отсчёта в эту минуту')}</span> · ${V('Derived', 'Рассчитано')} ${o.z != null ? `<span class="num">${V('causal z', 'причинный z')} ${esc(zText(o.z))}</span>, ${esc(ru ? `${ru.dir(o.direction)} опоры` : `${o.direction} reference`)}` : V('reference comparison unavailable', 'сравнение с опорой недоступно')}
      <span class="small muted">· ${V('1-min mean, minute ending', 'среднее за 1 мин, минута до')} ${esc(formatUtc(e.issuedMs).slice(11))} · ${esc(tx(o.place))}</span>` : esc(ru ? ru.obsText(o) : o.text)}</li>`).join('');
  const rows = Object.entries(view.channels).map(([c, ch]) => [c, ch, ch.z?.[i] ?? null])
    .sort((a, b) => Math.abs(b[2] ?? 0) - Math.abs(a[2] ?? 0));
  const [kc, kt] = KIND_PILL[e.kind];
  return `<section class="panel diag" aria-labelledby="dx-h">
    <div class="diag-head"><h2 id="dx-h" tabindex="-1">${V('Selected alert', 'Выбранное предупреждение')} · ${esc(ru ? ru.title : humanType(alert.fault_type))}</h2>${pill(kc, ru ? { 'Machine rule · unconfirmed': 'Правило машины · не подтверждено', 'Cause unresolved · UNKNOWN': 'Причина не установлена · UNKNOWN', 'Data-quality warning': 'Качество данных', 'Data-quality warning · stuck reading': 'Качество данных · залипание', 'Data gap': 'Пропуск данных' }[kt] ?? kt : kt)}</div>
    <p class="small muted diag-time">${esc(ru ? ru.timing : e.timing)}</p>
    <div class="diag-grid">
      <div>
        <h3><span class="step">1</span> ${L('What the rule suggests', 'Что предполагает правило')}</h3>
        <p class="diag-headline">${esc(ru ? ru.headline : e.headline)}</p>
        ${(ru ? ru.caveat : e.caveat) ? `<p class="small">${esc(ru ? ru.caveat : e.caveat)}</p>` : ''}
        <h3><span class="step">2</span> ${L('What was observed', 'Что наблюдалось')}</h3>
        ${obs ? `<ul class="obs-list">${obs}</ul>` : `<p class="small muted">${V('No channel value is available at the alert minute.', 'В минуту предупреждения значений каналов нет.')}</p>`}
        ${e.referenceCaveat ? `<p class="small muted">${esc(ru ? ru.referenceCaveat : e.referenceCaveat)}</p>` : ''}
      </div>
      <div>
        <h3><span class="step">3</span> ${L('Why this is still uncertain', 'Почему это ещё не определённо')}</h3>
        <p class="small"><span class="muted">${V('Also possible (not ranked or evaluated):', 'Также возможно (без ранжирования и оценки):')}</span> ${(ru ? ru.alternatives : e.alternatives).map(esc).join('; ')}.</p>
        ${e.gapSummary.length ? `<ul class="gap-list small">${(ru ? ru.gaps : e.gapSummary).map((g) => `<li>${pill(GAP_PILL[g.kind][0], ru ? { 'not-installed': 'Не установлен', 'no-sample': 'Нет отсчёта в эту минуту', 'no-z': 'Нет сравнения с опорой', 'not-in-benchmark': 'Нет в бенчмарке', partial: 'Неполное покрытие', 'no-rows': 'Нет телеметрии' }[g.kind] : GAP_PILL[g.kind][1])} ${esc(g.text)}</li>`).join('')}</ul>` : ''}
        <h3><span class="step">4</span> ${L('Next engineering check', 'Следующая инженерная проверка')}</h3>
        <p>${esc(ru ? ru.next.text : e.nextCheck.text)}</p>
        <p class="small"><b>${V('Why:', 'Зачем:')}</b> ${esc(ru ? ru.next.reason : e.nextCheck.reason)} <span class="muted">${esc(ru ? ru.next.advisory : e.nextCheck.advisory)}</span></p>
      </div>
    </div>
    <details class="panel-sub" id="dx-tech"${state.open.tech ? ' open' : ''}><summary>${L('Technical details: full rule interpretation, z, per-channel gaps, source evidence, score', 'Технические подробности (исходные формулировки на английском): правило, z, пропуски по каналам, исходные данные, оценка')}</summary>
      <dl class="kv">
        <dt>Rule interpretation</dt><dd class="small">${esc(e.hypothesis)}</dd>
        ${e.zNote ? `<dt>What z means</dt><dd class="small">${esc(e.zNote)}</dd>` : ''}
        ${e.gaps.length ? `<dt>Unavailable data, per item</dt><dd><ul class="tight small">${e.gaps.map((g) => `<li>${esc(g.text)}</li>`).join('')}</ul></dd>` : ''}
        <dt>Baseline output</dt><dd><span class="mono">${esc(t.eventClass)} · ${esc(t.faultType)}</span> (causal B1 baseline prediction)</dd>
        <dt>Detector evidence</dt><dd><span class="verbatim">${esc(t.evidence)}</span></dd>
        <dt>Detector recommendation</dt><dd><span class="verbatim">${esc(t.action)}</span><div class="small muted">${esc(t.actionNote)}</div></dd>
        <dt>Rule</dt><dd class="small">${esc(t.rule)}<div class="muted">${esc(t.ruleNote)}</div></dd>
        <dt>Rule score</dt><dd><span class="num">${esc(t.score)}</span><div class="small">Exact: <span class="mono">${esc(t.scoreExact)}</span> · ${esc(t.formula)}</div></dd>
      </dl>
      <div class="table-wrap" role="region" aria-label="All channels at the alert minute" tabindex="0"><table>
        <caption>1-minute window means at the minute ending ${esc(formatUtc(e.issuedMs))}. “No sample” means no native sample in that minute (no forward fill).</caption>
        <thead><tr><th scope="col">Channel</th><th scope="col" class="num">Measured mean</th><th scope="col" class="num">Causal z</th></tr></thead>
        <tbody>${rows.map(([c, ch, z]) => `<tr><td>${esc(label(c))}<div class="small muted mono">${c}</div></td><td class="num">${ch.mean[i] != null ? `${fmtNum(ch.mean[i], 4)} ${esc(ch.unit)}` : '<span class="muted">No sample</span>'}</td>
          <td class="num">${z != null ? fmtNum(z, 2) : `<span class="muted small">${ch.z ? 'unavailable' : 'not used by B1'}</span>`}</td></tr>`).join('')}</tbody></table></div>
    </details>
  </section>`;
}

function evaluationPanel(replay, asOf) {
  const on = state.showLabels;
  const labels = on ? sliceLabels(replay, asOf) : [];
  return `<section class="panel eval-panel" aria-labelledby="eval-h">
    <h2 id="eval-h">${L('Retrospective evaluation', 'Ретроспективная оценка')}</h2>
    <label class="check"><input id="labels-toggle" type="checkbox"${on ? ' checked' : ''}> ${L('Show validation labels', 'Показать валидационные метки')}</label>
    <p class="small muted">${L('Ground truth from the benchmark labels. Never an input to the detector; toggling it does not change predictions or evidence above. Only events with onset ≤ as-of are shown; later timestamps are withheld.', 'Истина из меток бенчмарка. Никогда не используется детектором; переключение не меняет выводы и данные выше. Показываются только события с началом не позже текущего времени; более поздние отметки скрыты.')}</p>
    ${on ? (labels.length ? `<ul class="tight small">${labels.map((e) => `<li>${pill('s-eval', L('Ground truth', 'Истина'))} <b>${esc(e.event_id)}</b> ${esc(e.event_class)} · ${esc(e.fault_type)}<br>
      Onset ${esc(formatUtc(parseUtc(e.onset_utc)))}${e.pre_existing === 'True' ? ' (pre-existing at window start)' : ''} · severity ${esc(e.severity)}<br>
      ${e.endWithheld ? L('End: not revealed at this as-of time', 'Конец: не раскрыт на это время') : `End ${esc(formatUtc(parseUtc(e.end_utc)))}`}</li>`).join('')}</ul>`
      : `<p class="small">${L('No labelled event onset at or before the as-of time.', 'К текущему времени размеченных начал событий нет.')}</p>`) + `<p class="small"><a href="#/evidence">${L('Full-window results on Evidence &amp; Validation', 'Результаты по всему окну — в разделе «Результаты проверки»')}</a></p>` : ''}
  </section>`;
}

function renderPlanner(route) {
  const asset = assetById(route.assetId);
  if (!asset) return `<h1>${L('Pump not found', 'Насос не найден')}</h1><p><a class="button primary" href="#/fleet">${L('Back to Fleet', 'Назад к парку')}</a></p>`;
  const orient = `<section class="panel orient" aria-label="About this page"><p>${t('pl.orient', { id: asset.assetId })}</p></section>`;
  return renderPlannerPage(asset, pumpHeader(asset, 'planner') + orient, state.fleet.experiments);
}

function renderEvidence() {
  const ev = state.fleet.evidence;
  if (!ev?.comparison?.length) return '<h1>Evidence &amp; Validation</h1><div class="error" role="alert">Evidence unavailable: comparison source missing from the bundle.</div>';
  const rows = ev.comparison;
  const cell = (r, key, d = 2) => `<td class="num" title="${esc(r[key])}">${Number(r[key]).toFixed(d)}</td>`;
  const valEvents = ev.validationEvents;
  const typeCorrect = (v) => valEvents[v].filter((e) => e.type_correct === 'True').length;
  const original = Object.fromEntries(valEvents.original.map((e) => [e.event_id, e]));
  return `<h1>${esc(t('ev.h1'))}</h1>
    <p class="sub">${esc(t('ev.sub'))} ${pill('s-eval', getLang() === 'ru' ? 'Ретроспективная оценка · всё окно валидации' : 'Retrospective evaluation · Full validation window')}</p>
    <div class="note" role="note">${t('ev.scope')}${getLang() === 'ru' ? ' <span class="small">Подробные таблицы ниже — в исходной английской формулировке.</span>' : ''}</div><p></p>
    <section class="panel" aria-labelledby="ev-cmp"><h2 id="ev-cmp">Original vs causal B1</h2>
      <div class="table-wrap" role="region" aria-label="Metric comparison" tabindex="0"><table>
        <caption>Composite score is the benchmark's weighted score, not accuracy. Hover or see source for exact values. Source: <span class="mono">${esc(ev.comparisonSource)}</span></caption>
        <thead><tr><th scope="col">Version</th><th scope="col">Split</th><th scope="col" class="num">Composite score</th><th scope="col" class="num">Detected events</th><th scope="col" class="num">Fault-type recall</th><th scope="col" class="num">False alert episodes</th><th scope="col" class="num">Alert rows</th><th scope="col" class="num">Timeliness</th><th scope="col" class="num">Median lead time (h)</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.version)}${r.version === 'original' ? '<div class="small muted">used future reference data for early outputs</div>' : ''}</th><td>${esc(r.split)}</td>
          ${cell(r, 'composite_score')}<td class="num">${esc(r.true_positive_events)}/${esc(r.events_scored)}</td>${cell(r, 'fault_type_recall', 4)}
          <td class="num">${esc(r.false_alert_episodes)}</td><td class="num">${esc(r.alerts_scored)}</td>${cell(r, 'timeliness', 4)}${cell(r, 'median_lead_time_h', 2)}</tr>`).join('')}</tbody>
      </table></div>
      <details><summary>Exact composite scores</summary><ul class="mono small">${rows.map((r) => `<li>${esc(r.version)} ${esc(r.split)}: ${esc(r.composite_score)}</li>`).join('')}</ul></details>
      <p class="small">Validation correct fault type (from per-event results): causal ${typeCorrect('causal')}/${valEvents.causal.length}, original ${typeCorrect('original')}/${valEvents.original.length}. Median lead time covers only events with a deadline that were detected; nine validation events do not establish field performance.</p>
    </section>
    <section class="panel" aria-labelledby="ev-ver"><h2 id="ev-ver">Recorded verification</h2>
      <dl class="kv"><dt>Causality checks passed</dt><dd class="num">${esc(ev.verification.causality_checks_passed)} (tolerance 1e-6, prefix re-runs)</dd>
      <dt>Regression tests passed</dt><dd class="num">${esc(ev.verification.tests_passed)}</dd>
      <dt>Test telemetry used</dt><dd>${esc(String(ev.verification.test_telemetry_used))}</dd>
      <dt>Source</dt><dd class="mono">${esc(ev.verificationSource)}</dd></dl>
      <p class="small muted">${esc(ev.verificationNote)}</p></section>
    <section class="panel eval-panel" aria-labelledby="ev-evt"><h2 id="ev-evt">Validation events · ground truth vs baseline output</h2>
      <div class="table-wrap" role="region" aria-label="Validation per-event results" tabindex="0"><table>
        <caption>Ground truth (labels) is shown next to, never merged into, the baseline prediction. "Detected" follows the scorer's time-window matching, which is not a verified diagnosis.</caption>
        <thead><tr><th scope="col">Event</th><th scope="col">Ground truth</th><th scope="col">Causal: first alert (UTC)</th><th scope="col">Causal: predicted type</th><th scope="col">Type correct</th><th scope="col">Original: first alert (UTC)</th><th scope="col">Original: predicted type</th></tr></thead>
        <tbody>${valEvents.causal.map((e) => { const o = original[e.event_id] ?? {}; return `<tr><th scope="row">${esc(e.event_id)}</th><td>${esc(e.event_class)} · ${esc(e.fault_type)}</td>
          <td class="num">${e.detected === 'True' ? esc(formatUtc(parseUtc(e.first_alert_utc))) : pill('s-gray', 'Not detected')}</td><td>${e.detected === 'True' ? esc(e.predicted_fault_type) : '—'}</td>
          <td>${e.detected === 'True' ? (e.type_correct === 'True' ? pill('s-ok', 'Yes') : pill('s-attn', 'No')) : '—'}</td>
          <td class="num">${o.detected === 'True' ? esc(formatUtc(parseUtc(o.first_alert_utc))) : pill('s-gray', 'Not detected')}</td><td>${o.detected === 'True' ? esc(o.predicted_fault_type) : '—'}</td></tr>`; }).join('')}</tbody>
      </table></div>
      <p class="small muted">Source: <span class="mono">${esc(ev.validationEventsSource)}</span></p>
    </section>
    ${renderExperiments(state.fleet.experiments)}`;
}

// ---------- events ----------
function bind(main, route) {
  const on = (id, ev, fn) => { const el = main.querySelector(`#${id}`); if (el) el.addEventListener(ev, fn); };
  on('retry-fleet', 'click', () => { state.fleet = null; loadFleet(); render(); });
  on('f-q', 'input', (e) => { state.filters.q = e.target.value; render(); });
  on('f-split', 'change', (e) => { state.filters.split = e.target.value; render(); });
  on('f-show', 'change', (e) => { state.filters.show = e.target.value; render(); });
  on('ov-retry', 'click', () => { retryReviewCases(render); render(); });
  main.querySelectorAll('[data-ov-sel]').forEach((b) => b.addEventListener('click', () => { state.ovSel = b.dataset.ovSel; render(); document.getElementById('ov-prev-h')?.focus?.(); }));
  on('f-site', 'change', (e) => { state.filters.site = e.target.value; render(); });
  const reset = () => { state.filters = { q: '', split: 'all', site: 'all', show: 'all' }; render(); };
  on('f-reset', 'click', reset); on('f-reset-empty', 'click', reset);
  on('retry-replay', 'click', (e) => { delete state.replays[e.target.dataset.asset]; render(); });
  if (route.name === 'planner') { const asset = assetById(route.assetId); if (asset) bindPlanner(main, asset, render); return; }
  if (route.name === 'diagnosis') { bindDiagnosis(main, render); return; }
  if (route.name !== 'pump') return;
  const id = route.assetId;
  const pumpAsset = assetById(id);
  if (pumpAsset) bindSchematic(main, pumpAsset, { prefix: 'sch', onSelect: (pt) => { state.schematicSel[id] = pt; } });
  const step = (m) => () => setClock(id, Math.floor(state.clocks[id] / MINUTE_MS) * MINUTE_MS + m * MINUTE_MS);
  on('play', 'click', () => togglePlay(id));
  on('speed', 'change', (e) => { state.speed = Number(e.target.value); });
  on('back-h', 'click', step(-60)); on('back-m', 'click', () => setClock(id, Math.ceil(state.clocks[id] / MINUTE_MS) * MINUTE_MS - MINUTE_MS));
  on('fwd-m', 'click', step(1)); on('fwd-h', 'click', step(60));
  on('t-input', 'change', (e) => { const ms = Date.parse(`${e.target.value}Z`); if (!Number.isNaN(ms)) setClock(id, ms); });
  on('t-range', 'input', (e) => { const r = state.replays[id]; if (r?.status === 'ready') setClock(id, parseUtc(r.data.gridStartUtc) + Number(e.target.value) * MINUTE_MS); });
  on('ch-sel', 'change', (e) => { state.chart.channel[id] = e.target.value; render(); });
  on('span-sel', 'change', (e) => { state.chart.spanMin = Number(e.target.value); render(); });
  on('labels-toggle', 'change', (e) => { state.showLabels = e.target.checked; render(); });
  for (const [elId, key] of [['al-history', 'history'], ['dx-tech', 'tech']]) on(elId, 'toggle', (e) => { state.open[key] = e.target.open; });
  // Selecting from history re-renders the explanation above; move focus and view there (only on this user action).
  main.querySelectorAll('[data-alert]').forEach((b) => b.addEventListener('click', () => {
    state.selectedAlert[id] = b.dataset.alert; render();
    const h = document.getElementById('dx-h'); h?.focus({ preventScroll: true }); h?.scrollIntoView({ block: 'start' });
  }));
}

window.addEventListener('hashchange', onRouteChange);
let wasNarrow = window.innerWidth < 600;
window.addEventListener('resize', () => { const n = window.innerWidth < 600; if (n !== wasNarrow) { wasNarrow = n; render(); } });
// Language switch: re-renders the current route; hash, clocks, filters and planner drafts are untouched.
for (const l of ['en', 'ru']) document.getElementById(`lang-${l}`)?.addEventListener('click', () => { setLang(l); render(); });
document.documentElement.lang = getLang();
lastRouteKey = null;
loadFleet().then(onRouteChange);
