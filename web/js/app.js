// Retrofit Doctor local demo. Static bundle, hash routing, no network beyond the local data files.
// All replay rendering goes through sliceReplay(): views never touch rows later than the as-of clock.
import {
  MINUTE_MS, parseUtc, formatUtc, formatDuration, sliceReplay, sliceLabels, clampClock, referenceState,
  channelFreshness, packetState, diagnosticState, alertFeatures, visibleCount,
} from './replay.js';
import { CHANNEL_LABELS, CHANNEL_PLACEMENT, ALL_CHANNELS, knowledgeFor } from './knowledge.js';

// Documented starting checkpoints (issue times of stored causal alerts); replay starts paused here.
const CHECKPOINTS = { 'PUMP-08': '2025-09-10T12:38:00Z', 'PUMP-09': '2026-02-10T06:28:00Z' };
const SPLIT_LABEL = { train: 'Train', validation: 'Validation', test: 'Blind test' };
const SPEEDS = [1, 10, 60];

const state = {
  fleet: null, fleetError: null,
  replays: {}, // assetId -> { status: 'loading'|'ready'|'error', data, error }
  clocks: {}, // assetId -> ms
  filters: { q: '', split: 'all', site: 'all' },
  showLabels: false, labelsAsset: null,
  chart: { channel: {}, spanMin: 1440 },
  selectedAlert: {},
  playing: null, speed: 1, endNotice: null,
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = (c) => CHANNEL_LABELS[c] ?? c;
const humanType = (t) => (t ?? '').toLowerCase().replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
const pill = (cls, text, title = '') => `<span class="state ${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
const fmtNum = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));
const cadence = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);
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
  return { name: 'fleet', params };
}

function syncClockToUrl(id) {
  const route = parseRoute();
  if (route.name !== 'pump' || route.assetId !== id) return;
  const t = new Date(state.clocks[id]).toISOString().replace('.000Z', 'Z');
  history.replaceState(null, '', `#/pumps/${id}?t=${t}`);
}

let lastRouteKey = null;
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
    render();
    document.getElementById('main')?.focus({ preventScroll: true });
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
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active = a.dataset.nav === route.name || (a.dataset.nav === 'fleet' && (route.name === 'pump' || route.name === 'planner'));
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (state.fleetError) {
    main.innerHTML = `<h1>Source data unavailable</h1><div class="error" role="alert">Could not read <span class="mono">${esc(state.fleetError)}</span>.</div>
      <p><button id="retry-fleet" class="primary">Retry</button></p>
      <p class="muted small">Run <span class="mono">python scripts/export_demo.py</span> and serve the <span class="mono">web/</span> folder (see web/README.md).</p>`;
    bind(main, route);
    return;
  }
  if (!state.fleet) { main.innerHTML = '<p class="loading" role="status">Loading source data…</p>'; return; }
  const views = { fleet: renderFleet, pump: renderPump, planner: renderPlanner, evidence: renderEvidence };
  main.innerHTML = views[route.name](route);
  const foot = document.getElementById('provenance-foot');
  if (foot) foot.textContent = `Bundle generated by ${state.fleet.provenance.generator} from ${state.fleet.provenance.inputs.length} hashed source files.`;
  bind(main, route);
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

function renderFleet() {
  const { assets } = state.fleet;
  const f = state.filters;
  const sites = [...new Set(assets.map((a) => a.site))].sort();
  for (const a of assets) if (a.mode === 'VALIDATION_REPLAY') ensureReplay(a);
  const q = f.q.trim().toLowerCase();
  const rows = assets.filter((a) => (f.split === 'all' || a.split === f.split) && (f.site === 'all' || a.site === f.site)
    && (!q || `${a.assetId} ${a.site} ${a.system}`.toLowerCase().includes(q)));
  const by = (s) => assets.filter((a) => a.split === s).length;
  const body = rows.map((a) => {
    let asOf; let alert; let ref; let action;
    if (a.mode === 'TEST_METADATA_ONLY') {
      asOf = pill('s-gray', 'Metadata only');
      alert = pill('s-gray', 'Diagnosis unavailable');
      ref = pill('s-gray', 'Reference unavailable');
      action = `<a href="#/pumps/${a.assetId}">View sensor inventory<span class="sr"> for ${a.assetId}</span></a>`;
    } else if (a.mode === 'VALIDATION_REPLAY') {
      const r = state.replays[a.assetId];
      action = `<a href="#/pumps/${a.assetId}">Open replay<span class="sr"> for ${a.assetId}</span></a>`;
      if (!r || r.status === 'loading') { asOf = alert = ref = '<span class="muted">Loading…</span>'; } else if (r.status === 'error') {
        asOf = alert = ref = pill('s-gray', 'Source unavailable');
      } else {
        const view = sliceReplay(r.data, state.clocks[a.assetId]);
        asOf = `<span class="num">${esc(formatUtc(view.asOfMs))}</span>`;
        const d = diagnosticState(view);
        alert = d.alert ? `${pill(d.state === 'UNKNOWN_DIAGNOSIS' ? 's-attn' : 's-alert', humanType(d.alert.fault_type))}<div class="small muted">Baseline prediction · ${esc(formatUtc(parseUtc(d.alert.alert_time_utc)))}</div>` : pill('s-gray', 'No baseline alert in visible history');
        const rs = referenceState(view);
        ref = pill(rs.state === 'REFERENCE_AVAILABLE' ? 's-info' : rs.state === 'INSUFFICIENT_REFERENCE' ? 's-attn' : 's-gray', rs.label);
      }
    } else {
      asOf = pill('s-gray', 'Replay not loaded');
      alert = '<span class="muted">Not loaded</span>';
      ref = '<span class="muted">Not loaded</span>';
      action = `<a href="#/pumps/${a.assetId}">View sensor inventory<span class="sr"> for ${a.assetId}</span></a>`;
    }
    return `<tr><th scope="row"><a href="#/pumps/${a.assetId}">${a.assetId}</a></th>
      <td>${esc(a.site)}<div class="small muted">${esc(a.system)}</div></td>
      <td>${esc(SPLIT_LABEL[a.split])}</td><td>${esc(a.instrumentationTier)}<div class="small muted">${a.channelsAvailable.length} channels · ${esc(a.control)}</div></td>
      <td>${asOf}</td><td>${alert}</td><td>${ref}</td><td>${action}</td></tr>`;
  }).join('');
  return `<h1>Fleet Overview</h1>
    <p class="sub">Twelve independent pumps from the public benchmark passports. Site grouping is organisational only; no hydraulic coupling is modelled.</p>
    <div class="counts" aria-label="Inventory counts (not diagnostic results)">
      <div class="count"><b class="num">${assets.length}</b><span>independent pumps</span></div>
      <div class="count"><b class="num">${by('train')}</b><span>training assets (replay not loaded)</span></div>
      <div class="count"><b class="num">${by('validation')}</b><span>validation replay assets</span></div>
      <div class="count"><b class="num">${by('test')}</b><span>blind test assets · metadata only</span></div>
    </div>
    <div class="filters" role="search">
      <label>Search<input id="f-q" type="search" value="${esc(f.q)}" placeholder="Pump, site, system"></label>
      <label>Split<select id="f-split">${['all', 'train', 'validation', 'test'].map((s) => `<option value="${s}"${f.split === s ? ' selected' : ''}>${s === 'all' ? 'All' : SPLIT_LABEL[s]}</option>`).join('')}</select></label>
      <label>Site<select id="f-site"><option value="all">All sites</option>${sites.map((s) => `<option${f.site === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <button id="f-reset" type="button">Reset filters</button>
      <a class="button" href="#/evidence">View validation results</a>
    </div>
    <p class="small muted">Independent snapshots · Observation weeks differ · Each replay has its own UTC as-of clock.</p>
    ${rows.length ? `<div class="table-wrap" role="region" aria-label="Pump inventory table" tabindex="0"><table>
      <thead><tr><th scope="col">Pump</th><th scope="col">Site / application</th><th scope="col">Split</th><th scope="col">Instrumentation</th>
      <th scope="col">Replay as of (UTC)</th><th scope="col">Latest visible alert</th><th scope="col">Reference</th><th scope="col">Action</th></tr></thead>
      <tbody>${body}</tbody></table></div>`
    : '<div class="empty"><p>No pumps match these filters.</p><button id="f-reset-empty" type="button">Reset filters</button></div>'}`;
}

function inventoryTable(asset, view) {
  const installed = new Set(asset.channelsAvailable);
  const meta = Object.fromEntries(asset.channels.map((c) => [c.channelId, c]));
  const rows = ALL_CHANNELS.map((c) => {
    const isIn = installed.has(c);
    if (!view) {
      return `<tr><th scope="row">${esc(label(c))}<div class="small muted mono">${c}</div></th><td>${isIn ? pill('s-info', 'Installed') : pill('s-gray', 'Not instrumented')}</td>
        <td class="num">${isIn ? esc(cadence(meta[c].nativeUpdateSeconds)) : '—'}</td><td>${isIn ? esc(meta[c].unit) : '—'}</td><td class="small">${esc(CHANNEL_PLACEMENT[c])}</td></tr>`;
    }
    const fr = channelFreshness(view, c, isIn);
    const cls = { NOT_INSTRUMENTED: 's-gray', NO_MEASUREMENT: 's-gray', UPDATE_OVERDUE: 's-attn', WITHIN_CADENCE: 's-info' }[fr.state];
    const last = fr.windowEndMs != null ? `${esc(formatUtc(fr.windowEndMs))}<div class="small muted">sample in minute ending; age ${esc(formatDuration(fr.ageMinMs))}–${esc(formatDuration(fr.ageMaxMs))}</div>` : '—';
    return `<tr><th scope="row">${esc(label(c))}<div class="small muted mono">${c}</div></th><td>${pill(cls, fr.label)}</td>
      <td class="num">${isIn ? esc(cadence(meta[c].nativeUpdateSeconds)) : '—'}</td>
      <td class="num">${fr.value != null ? `${fmtNum(fr.value, 3)} ${esc(meta[c]?.unit)}` : '—'}</td>
      <td class="num">${fr.z != null ? fmtNum(fr.z, 1) : (!isIn ? '—' : view.channels[c]?.z == null ? '<span class="muted small">not used by B1</span>' : '<span class="muted">unavailable</span>')}</td><td>${last}</td></tr>`;
  }).join('');
  const head = view
    ? '<th scope="col">Channel</th><th scope="col">State</th><th scope="col" class="num">Native interval</th><th scope="col" class="num">Last value</th><th scope="col" class="num">Causal z</th><th scope="col">Last measured (UTC)</th>'
    : '<th scope="col">Channel</th><th scope="col">Installed</th><th scope="col" class="num">Native interval</th><th scope="col">Unit</th><th scope="col">Conceptual placement</th>';
  return `<div class="table-wrap" role="region" aria-label="Sensor inventory" tabindex="0"><table>
    <caption>${view ? 'Values are 1-minute window means. Sparse channels have no value between native samples (no forward fill). Overdue = no sample for longer than the native interval plus one window.' : 'From the public asset passport (assets.csv channels_available). Native intervals mirror the benchmark sensor model. Placement is conceptual, not a mounting drawing.'}</caption>
    <thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function pumpHeader(asset, extra = '') {
  const modeBadge = { VALIDATION_REPLAY: pill('s-info', 'Validation replay · Synthetic benchmark'), TEST_METADATA_ONLY: pill('s-gray', 'Blind test · Metadata only'), TRAIN_REPLAY: pill('s-gray', 'Training asset · Replay not loaded') }[asset.mode];
  return `<a class="backlink" href="#/fleet">← Back to Fleet</a>
    <h1>${asset.assetId}</h1>
    <p class="sub">${esc(asset.site)} · ${esc(asset.system)} · ${esc(asset.instrumentationTier)} · ${esc(asset.control)} ${modeBadge}</p>
    <div class="tabs" role="navigation" aria-label="Pump sections">
      <a class="button${extra === 'planner' ? '' : ' primary'}" href="#/pumps/${asset.assetId}"${extra === 'planner' ? '' : ' aria-current="page"'}>Pump Detail</a>
      <a class="button${extra === 'planner' ? ' primary' : ''}" href="#/pumps/${asset.assetId}/retrofit"${extra === 'planner' ? ' aria-current="page"' : ''}>Retrofit Planner</a>
    </div>`;
}

function metadataPanel(asset) {
  return `<section class="panel" aria-labelledby="meta-h"><h2 id="meta-h">Passport metadata</h2><dl class="kv">
    <dt>Observation window</dt><dd class="num">${esc(formatUtc(parseUtc(asset.windowStartUtc)))} – ${esc(formatUtc(parseUtc(asset.windowEndUtc)))}</dd>
    <dt>Fluid</dt><dd>${esc(asset.fluid)}</dd><dt>Commissioned</dt><dd>${asset.commissionedYear}</dd>
    <dt>Motor rated</dt><dd class="num">${asset.motorRatedKw} kW · ${asset.ratedRpmMetadata} rpm (passport rating, not a measurement)</dd>
    <dt>Design point</dt><dd class="num">${asset.designFlowM3h} m³/h at ${asset.designHeadM} m</dd>
    <dt>Speed measurement</dt><dd>${asset.channelsAvailable.includes('motor_speed_rpm') ? 'Measured speed channel installed' : 'No measured speed channel'}</dd>
    <dt>Source</dt><dd class="mono">vendor/benchmark/data/full/assets.csv</dd></dl></section>`;
}

function renderPump(route) {
  const asset = assetById(route.assetId);
  if (!asset) return '<h1>Pump not found</h1><p>No pump with this ID exists in the public metadata.</p><p><a class="button primary" href="#/fleet">Back to Fleet</a></p>';
  if (asset.mode !== 'VALIDATION_REPLAY') {
    const banner = asset.mode === 'TEST_METADATA_ONLY'
      ? '<div class="note" role="note"><b>Diagnosis unavailable.</b> Blind test asset: only the public passport and sensor inventory are bundled. No telemetry, alerts or labels exist in this application.</div>'
      : '<div class="note" role="note"><b>Replay not loaded.</b> Training-asset replay is not part of this demo bundle. Sensor inventory is from the public passport.</div>';
    return `${pumpHeader(asset)}${banner}<p></p><div class="grid-2"><section class="panel" aria-labelledby="inv-h"><h2 id="inv-h">Sensor inventory</h2>${inventoryTable(asset, null)}</section>${metadataPanel(asset)}</div>`;
  }
  const r = ensureReplay(asset);
  if (r.status === 'loading') return `${pumpHeader(asset)}<p class="loading" role="status">Loading replay source…</p>`;
  if (r.status === 'error') {
    return `${pumpHeader(asset)}<div class="error" role="alert"><b>Signal data unavailable.</b> Replay source could not be read: <span class="mono">${esc(r.error)}</span>. No curve or alert is shown instead.</div>
      <p><button id="retry-replay" class="primary" data-asset="${asset.assetId}">Retry</button></p>
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
      <div><div class="small muted">Replay as of</div><div class="asof" aria-live="polite">${esc(formatUtc(asOf, { seconds: asOf % MINUTE_MS !== 0 }))}</div>
        <div class="small muted">${view.visibleMinutes} of ${replay.minutes} completed minutes visible · window ${esc(formatUtc(start))} – ${esc(formatUtc(end))}</div></div>
      <div class="controls">
        <button id="play" type="button" class="primary" aria-pressed="${state.playing ? 'true' : 'false'}">${state.playing ? 'Pause' : 'Play'}</button>
        <label>Speed<select id="speed">${SPEEDS.map((s) => `<option value="${s}"${state.speed === s ? ' selected' : ''}>${s} min / step</option>`).join('')}</select></label>
        <button id="back-h" type="button" aria-label="Back one hour">−1 h</button>
        <button id="back-m" type="button" aria-label="Previous completed minute">−1 min</button>
        <button id="fwd-m" type="button" aria-label="Next completed minute">+1 min</button>
        <button id="fwd-h" type="button" aria-label="Forward one hour">+1 h</button>
        <label>Set time (UTC)<input id="t-input" type="datetime-local" step="1" value="${isoInput}" min="${new Date(start).toISOString().slice(0, 19)}" max="${new Date(end).toISOString().slice(0, 19)}"></label>
      </div>
      <input id="t-range" type="range" min="0" max="${replay.minutes}" step="1" value="${visibleCount(replay, asOf)}" aria-label="Replay time, minutes since window start" aria-valuetext="${esc(formatUtc(asOf))}">
      ${state.endNotice ? `<span role="status">${pill('s-gray', state.endNotice)}</span>` : ''}
    </section>
    <div class="status-row">
      <section class="panel" aria-labelledby="st-ref"><h2 id="st-ref">Statistical reference</h2>${pill(ref.state === 'REFERENCE_AVAILABLE' ? 's-info' : ref.state === 'INSUFFICIENT_REFERENCE' ? 's-attn' : 's-gray', ref.label)}<p class="small muted">${esc(ref.detail)}</p></section>
      <section class="panel" aria-labelledby="st-pk"><h2 id="st-pk">Data packets</h2>${pill(pk.state === 'PACKETS_MISSING' ? 's-attn' : pk.state === 'RECEIVING' ? 's-info' : 's-gray', pk.label)}<p class="small muted">${esc(pk.detail ?? '')} Operating mode: ${esc(view.rows.operatingMode[view.visibleMinutes - 1] ?? '—')}.</p></section>
      <section class="panel" aria-labelledby="st-dx"><h2 id="st-dx">Baseline output (causal B1)</h2>${pill(diag.state === 'NO_VISIBLE_ALERT' ? 's-gray' : diag.state === 'UNKNOWN_DIAGNOSIS' ? 's-attn' : 's-alert', diag.label)}<p class="small muted">${diag.alert ? `${esc(humanType(diag.alert.fault_type))} · ${esc(formatUtc(parseUtc(diag.alert.alert_time_utc)))}. A historical alert is not necessarily an ongoing fault.` : 'No alert does not prove the pump is healthy.'}</p></section>
    </div>
    <div class="grid-2">
      <div>
        <section class="panel chart" aria-labelledby="ch-h">
          <h2 id="ch-h">Trend up to the as-of time</h2>
          <div class="chart-tools">
            <label>Channel<select id="ch-sel">${channels.map((c) => `<option value="${c}"${c === chartChannel ? ' selected' : ''}>${esc(label(c))} (${esc(view.channels[c].unit)})</option>`).join('')}</select></label>
            <label>Span<select id="span-sel">${[[360, 'Last 6 h'], [1440, 'Last 24 h'], [0, 'All visible history']].map(([v, t]) => `<option value="${v}"${state.chart.spanMin === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          </div>
          ${trendCharts(view, chartChannel, state.chart.spanMin, state.showLabels ? sliceLabels(replay, asOf) : null)}
        </section>
        <section class="panel" aria-labelledby="inv-h"><h2 id="inv-h">Sensor inventory and freshness at the as-of time</h2>${inventoryTable(asset, view)}</section>
      </div>
      <div>
        <section class="panel" aria-labelledby="al-h"><h2 id="al-h">Visible baseline alerts (${view.alerts.length})</h2>
          ${view.alerts.length ? `<ul class="alert-list">${[...view.alerts].reverse().map((a, i) => `<li><button type="button" id="al-${i}" data-alert="${esc(a.alert_time_utc)}" aria-pressed="${selected && a.alert_time_utc === selected.alert_time_utc}">
            <span class="num">${esc(formatUtc(parseUtc(a.alert_time_utc)))}</span><br>${esc(a.event_class)} · ${esc(humanType(a.fault_type))}</button></li>`).join('')}</ul>`
            : '<div class="empty">No baseline alert in this visible history.</div>'}
        </section>
        ${selected ? evidenceCard(asset, view, selected) : ''}
        ${evaluationPanel(replay, asOf)}
      </div>
    </div>`;
}

function evidenceCard(asset, view, alert) {
  const kb = knowledgeFor(alert.fault_type);
  const feats = alertFeatures(view, alert);
  const conf = Number(alert.confidence);
  const missing = kb.discriminators.filter((c) => !asset.channelsAvailable.includes(c));
  return `<section class="panel" aria-labelledby="ev-h">
    <h2 id="ev-h">Evidence · ${esc(humanType(alert.fault_type))}</h2>
    <p>${pill(alert.fault_type === 'UNKNOWN' ? 's-attn' : 's-alert', `${alert.event_class} · ${alert.fault_type}`)} <b>Baseline prediction. Engineering review required.</b></p>
    <dl class="kv">
      <dt>Issued</dt><dd class="num">${esc(formatUtc(parseUtc(alert.alert_time_utc)))}</dd>
      <dt>Detector evidence</dt><dd><span class="verbatim">${esc(alert.evidence)}</span></dd>
      <dt>Recommended</dt><dd><span class="verbatim">${esc(alert.recommended_action)}</span></dd>
      <dt>Rule confidence</dt><dd><span class="num">${conf.toFixed(3)}</span> · Uncalibrated baseline score, not a failure probability
        <details><summary class="small">Exact value and formula</summary><span class="mono">${esc(alert.confidence)}</span><br><span class="small">max |z| / (2k), clipped to 0.05–0.99 (vendor B1).</span></details></dd>
    </dl>
    <h3>Observed features at the alert minute</h3>
    ${feats.items.length ? `<table><thead><tr><th scope="col">Channel</th><th scope="col" class="num">Mean</th><th scope="col" class="num">Causal z</th></tr></thead><tbody>
      ${feats.items.map((f) => `<tr><td>${esc(label(f.channelId))}</td><td class="num">${fmtNum(f.value, 3)} ${esc(f.unit)}</td><td class="num">${fmtNum(f.z, 1)}</td></tr>`).join('')}</tbody></table>
      <p class="small muted">Window ending ${esc(formatUtc(view.gridStartMs + (feats.index + 1) * MINUTE_MS))}; largest |z| among channels with a reference.</p>`
      : '<p class="small muted">No z-scores at this minute (reference not yet available or no samples). The alert is based on data-quality rules.</p>'}
    <h3>Why the detector said this</h3><p class="small">${esc(kb.rule)}</p>
    <h3>Alternative interpretations</h3><p class="small muted">Engineering prompts; not evaluated by the detector.</p>
    <ul class="tight small">${kb.alternatives.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Missing measurements</h3>
    ${missing.length || kb.notInBenchmark.length ? `<ul class="tight small">${missing.map((c) => `<li>${esc(label(c))}: ${pill('s-gray', 'Not instrumented on this pump')}</li>`).join('')}
      ${kb.notInBenchmark.map((x) => `<li>${esc(x)}: ${pill('s-gray', 'Not in any benchmark tier')}</li>`).join('')}</ul>` : '<p class="small muted">None identified for this rule.</p>'}
    <h3>Operator next check</h3><p class="small">${esc(kb.check)}</p>
    <p class="small muted">Advisory only. This application cannot operate equipment.</p>
  </section>`;
}

function evaluationPanel(replay, asOf) {
  const on = state.showLabels;
  const labels = on ? sliceLabels(replay, asOf) : [];
  return `<section class="panel eval-panel" aria-labelledby="eval-h">
    <h2 id="eval-h">Retrospective evaluation</h2>
    <label class="check"><input id="labels-toggle" type="checkbox"${on ? ' checked' : ''}> Show validation labels</label>
    <p class="small muted">Ground truth from the benchmark labels. Never an input to the detector; toggling it does not change predictions or evidence above. Only events with onset ≤ as-of are shown; later timestamps are withheld.</p>
    ${on ? (labels.length ? `<ul class="tight small">${labels.map((e) => `<li>${pill('s-eval', 'Ground truth')} <b>${esc(e.event_id)}</b> ${esc(e.event_class)} · ${esc(e.fault_type)}<br>
      Onset ${esc(formatUtc(parseUtc(e.onset_utc)))}${e.pre_existing === 'True' ? ' (pre-existing at window start)' : ''} · severity ${esc(e.severity)}<br>
      ${e.endWithheld ? 'End: not revealed at this as-of time' : `End ${esc(formatUtc(parseUtc(e.end_utc)))}`}</li>`).join('')}</ul>`
      : '<p class="small">No labelled event onset at or before the as-of time.</p>') + '<p class="small"><a href="#/evidence">Full-window results on Evidence &amp; Validation</a></p>' : ''}
  </section>`;
}

function trendCharts(view, channelId, spanMin, labels) {
  const ch = view.channels[channelId];
  const n = view.visibleMinutes;
  if (n === 0) return '<div class="empty">No completed minute yet at this as-of time.</div>';
  const i0 = spanMin ? Math.max(0, n - spanMin) : 0;
  const x0 = view.gridStartMs + i0 * MINUTE_MS; const x1 = view.asOfMs;
  const sparse = ch.nativeUpdateSeconds > 60;
  const pts = (arr) => { const out = []; for (let i = i0; i < n; i += 1) out.push(arr[i] == null ? null : [view.gridStartMs + (i + 1) * MINUTE_MS, arr[i]]); return out; };
  const alerts = view.alerts.filter((a) => parseUtc(a.alert_time_utc) >= x0);
  const k = view.detectorParameters.k;
  const meanSvg = svgChart({ points: pts(ch.mean), x0, x1, sparse, unit: ch.unit, title: `${label(channelId)} (${ch.unit}), 1-min window mean`, alerts, labels });
  const zPts = ch.z ? pts(ch.z) : [];
  const anyZ = zPts.some((p) => p);
  const zSvg = anyZ ? svgChart({ points: zPts, x0, x1, sparse, unit: 'z', title: `Causal z-score (threshold ±${k})`, alerts, labels, thresholds: [k, -k] })
    : `<div class="empty small">Causal z-score unavailable in this span${view.asOfMs < view.referenceEndMs + MINUTE_MS ? ' — reference still collecting (first 24 h)' : ''}.</div>`;
  return `${meanSvg}${zSvg}<p class="small muted">${sparse ? `Sparse channel: one native sample every ${cadence(ch.nativeUpdateSeconds)}; points only where a sample exists.` : 'Gaps are minutes without samples.'} Points are plotted at window end (availability time). Right edge = as-of time; nothing later is drawn.</p>`;
}

function svgChart({ points, x0, x1, sparse, unit, title, alerts, labels, thresholds = [] }) {
  const W = 900; const H = 210; const L = 62; const R = 14; const T = 22; const B = 30;
  const vals = points.filter(Boolean).map((p) => p[1]).concat(thresholds);
  if (!points.some(Boolean)) return `<div class="empty small">${esc(title)}: no samples in this span.</div>`;
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const span = Math.max(1, x1 - x0);
  const sx = (t) => L + ((t - x0) / span) * (W - L - R);
  const sy = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let marks = '';
  if (sparse) {
    marks = points.filter(Boolean).map(([t, v]) => `<circle cx="${sx(t).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.2" fill="#1f5fbf"/>`).join('');
  } else {
    let d = ''; let pen = false;
    for (const p of points) { if (!p) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`; pen = true; }
    marks = `<path d="${d}" fill="none" stroke="#1f5fbf" stroke-width="1.3"/>`;
  }
  const ticksY = [lo + pad, (lo + hi) / 2, hi - pad].map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e3e7ec"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="#5a6573">${v.toFixed(Math.abs(v) < 10 ? 2 : 1)}</text>`).join('');
  const ticksX = [0, 0.25, 0.5, 0.75, 1].map((f) => { const t = x0 + f * span; const s = new Date(t).toISOString(); return `<text x="${sx(t)}" y="${H - 8}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" font-size="11" fill="#5a6573">${s.slice(5, 10)} ${s.slice(11, 16)}</text>`; }).join('');
  const th = thresholds.map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#a4262c" stroke-dasharray="5 4"/>`).join('');
  const al = alerts.map((a) => { const x = sx(parseUtc(a.alert_time_utc)); const right = x > W - R - 60; return `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="#a4262c" stroke-width="1.5"/><text x="${right ? x - 4 : x + 4}" y="${T + 12}" text-anchor="${right ? 'end' : 'start'}" font-size="11" fill="#a4262c" stroke="#fff" stroke-width="3" paint-order="stroke">! alert</text>`; }).join('');
  const lb = (labels ?? []).map((e) => {
    const a = Math.max(x0, parseUtc(e.onset_utc)); const b = e.endWithheld ? x1 : Math.min(x1, parseUtc(e.end_utc));
    if (b < x0) return '';
    return `<rect x="${sx(a)}" y="${H - B - 8}" width="${Math.max(2, sx(b) - sx(a))}" height="8" fill="#6b3fa0" opacity=".55"><title>Ground truth (retrospective): ${esc(e.event_id)} ${esc(e.fault_type)}</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}; ${points.filter(Boolean).length} points up to the as-of time">
    <text x="${L}" y="14" font-size="12" font-weight="600" fill="#1d232b">${esc(title)}</text>
    ${ticksY}${th}${marks}${al}${lb}
    <line x1="${W - R}" x2="${W - R}" y1="${T}" y2="${H - B}" stroke="#1d232b" stroke-width="2"/><text x="${W - R}" y="${T - 6}" text-anchor="end" font-size="11" font-weight="600" fill="#1d232b">As of ${esc(formatUtc(x1).slice(5, 16))}</text>
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#aab3be"/>${ticksX}
    <text x="12" y="${(H - B + T) / 2}" font-size="11" fill="#5a6573" transform="rotate(-90 12 ${(H - B + T) / 2})" text-anchor="middle">${esc(unit)}</text>
  </svg>`;
}

function renderPlanner(route) {
  const asset = assetById(route.assetId);
  if (!asset) return '<h1>Pump not found</h1><p><a class="button primary" href="#/fleet">Back to Fleet</a></p>';
  const installed = asset.channelsAvailable;
  const absent = ALL_CHANNELS.filter((c) => !installed.includes(c));
  const decisions = {
    flow_m3_h: 'Separate discharge restriction, suction restriction and impeller wear by locating the operating point on the pump curve.',
    suction_pressure_kpa: 'Distinguish suction-side restriction / NPSH issues from discharge-side changes.',
    motor_power_kw: 'Cross-check hydraulic changes against shaft power.',
    motor_speed_rpm: 'Normalise hydraulic readings by speed on variable-speed drives.',
    motor_winding_temp_c: 'Separate motor thermal issues from pump-side mechanical faults.',
    bearing_temp_c: 'Corroborate bearing / misalignment vibration findings.',
    vibration_rms_mm_s: 'Detect imbalance / misalignment trends at the bearing housing.',
    vibration_accel_rms_g: 'Detect bearing wear and cavitation signatures.',
    vibration_crest_factor: 'Indicate impacting from bearing defects.',
    valve_position_pct: 'Tell valve throttling apart from fouling as the cause of flow loss.',
    discharge_pressure_kpa: 'Basic hydraulic head monitoring.',
    motor_current_a: 'Basic load monitoring.', fluid_temp_c: 'Process temperature context.', ambient_temp_c: 'Ambient context.',
  };
  return `${pumpHeader(asset, 'planner')}
    <div class="note" role="note">Skeleton planner. Every proposal is an <b>engineering hypothesis</b>: no diagnostic uplift, cost, installation time or compliance has been measured. Nothing here changes installed channels, predictions or scores.</div>
    <p></p>
    <div class="grid-2">
      <div>
        <section class="panel" aria-labelledby="pl-ex"><h2 id="pl-ex">Existing measured channels (${installed.length})</h2>
          <ul class="tight">${installed.map((c) => `<li>${esc(label(c))} <span class="small muted mono">${c}</span> ${pill('s-info', 'Measured (synthetic benchmark)')}</li>`).join('')}</ul></section>
        <section class="panel" aria-labelledby="pl-pr"><h2 id="pl-pr">Proposed additional hardware candidates (${absent.length})</h2>
          ${absent.length ? `<div class="table-wrap" role="region" aria-label="Proposed hardware candidates" tabindex="0"><table><thead><tr><th scope="col">Candidate</th><th scope="col">Decision it could support</th><th scope="col">Evidence</th><th scope="col">Integration / cost</th></tr></thead><tbody>
          ${absent.map((c) => `<tr><th scope="row">${esc(label(c))}<div class="small muted">${esc(CHANNEL_PLACEMENT[c])} (to verify on site)</div></th><td class="small">${esc(decisions[c])}</td><td>${pill('s-attn', 'Untested hypothesis')}</td><td>${pill('s-gray', 'Not assessed')}</td></tr>`).join('')}
          </tbody></table></div>` : '<p>This pump already has every channel modelled by the benchmark.</p>'}
          ${asset.control === 'FIXED_SPEED' ? '<p class="small muted">Fixed-speed pump: rated speed is passport metadata, not a measurement.</p>' : ''}
        </section>
      </div>
      <div>
        <section class="panel" aria-labelledby="pl-as"><h2 id="pl-as">Assumptions and open questions</h2>
          <ul class="tight small">
            <li>Mounting location, process connection and access: not assessed.</li>
            <li>Interface, protocol and timestamp alignment with existing telemetry: not assessed.</li>
            <li>Maintenance, calibration and battery/radio for wireless options: not assessed.</li>
            <li>Site, class-society or certification review: question for responsible engineering review; no compliance claimed.</li>
            <li>Validation plan: shadow-mode comparison against existing alerts before any reliance.</li>
          </ul></section>
        <section class="panel" aria-labelledby="pl-cmp"><h2 id="pl-cmp">Retrofit comparison</h2>
          <label class="check"><input type="checkbox" disabled aria-describedby="pl-cmp-d"> Compare with added sensors</label>
          <p id="pl-cmp-d" class="small">${pill('s-gray', 'Not yet evaluated')} No sensor-ablation experiment output has been supplied. The comparison stays disabled until real results exist.</p></section>
      </div>
    </div>`;
}

function renderEvidence() {
  const ev = state.fleet.evidence;
  if (!ev?.comparison?.length) return '<h1>Evidence &amp; Validation</h1><div class="error" role="alert">Evidence unavailable: comparison source missing from the bundle.</div>';
  const rows = ev.comparison;
  const cell = (r, key, d = 2) => `<td class="num" title="${esc(r[key])}">${Number(r[key]).toFixed(d)}</td>`;
  const valEvents = ev.validationEvents;
  const typeCorrect = (v) => valEvents[v].filter((e) => e.type_correct === 'True').length;
  const original = Object.fromEntries(valEvents.original.map((e) => [e.event_id, e]));
  return `<h1>Evidence &amp; Validation</h1>
    <p class="sub">Stored results of the recorded baseline runs. ${pill('s-eval', 'Retrospective evaluation · Full validation window')}</p>
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
    </section>`;
}

// ---------- events ----------
function bind(main, route) {
  const on = (id, ev, fn) => { const el = main.querySelector(`#${id}`); if (el) el.addEventListener(ev, fn); };
  on('retry-fleet', 'click', () => { state.fleet = null; loadFleet(); render(); });
  on('f-q', 'input', (e) => { state.filters.q = e.target.value; render(); });
  on('f-split', 'change', (e) => { state.filters.split = e.target.value; render(); });
  on('f-site', 'change', (e) => { state.filters.site = e.target.value; render(); });
  const reset = () => { state.filters = { q: '', split: 'all', site: 'all' }; render(); };
  on('f-reset', 'click', reset); on('f-reset-empty', 'click', reset);
  on('retry-replay', 'click', (e) => { delete state.replays[e.target.dataset.asset]; render(); });
  if (route.name !== 'pump') return;
  const id = route.assetId;
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
  main.querySelectorAll('[data-alert]').forEach((b) => b.addEventListener('click', () => { state.selectedAlert[id] = b.dataset.alert; render(); }));
}

window.addEventListener('hashchange', onRouteChange);
lastRouteKey = null;
loadFleet().then(onRouteChange);
