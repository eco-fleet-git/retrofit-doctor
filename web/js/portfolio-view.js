// Portfolio panel HTML for the overview (Task020). No DOM access; app.js binds the controls.
// Challenge mode uses only the supplied passports and loaded review cases; scenario mode uses only scaleScenario().
import { t, getLang } from './i18n.js';
import { tx } from './ru-text.js';
import { siteGroups, scaleScenario, scenarioTotals, filterScenario, SIM_FLAGS } from './portfolio.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCENARIO = scaleScenario(); // deterministic; computed once

const SITE_ICON = {
  vessel: '<svg viewBox="0 0 48 28" class="pf-site-ico" aria-hidden="true"><path d="M3 18h42l-6 8H9z" fill="currentColor" opacity=".9"/><rect x="14" y="10" width="16" height="8" rx="1" fill="currentColor" opacity=".55"/><rect x="18" y="4" width="6" height="6" fill="currentColor" opacity=".4"/><path d="M2 27c4-2 8 2 12 0s8 2 12 0 8 2 12 0 6 2 8 0" fill="none" stroke="currentColor" stroke-width="1" opacity=".5"/></svg>',
  plant: '<svg viewBox="0 0 48 28" class="pf-site-ico" aria-hidden="true"><path d="M4 26V14l8-5v5l8-5v5l8-5v17z" fill="currentColor" opacity=".55"/><rect x="31" y="3" width="5" height="23" fill="currentColor" opacity=".9"/><rect x="38" y="12" width="7" height="14" fill="currentColor" opacity=".7"/><path d="M2 26h44" stroke="currentColor" stroke-width="1.2"/></svg>',
};
const MK = {
  review: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 10h9M2 8l2.5-2.5 2 2L10 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  replay: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5v7l5.5-3.5z" fill="currentColor"/></svg>',
  inventory: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5h4.5l2 2v7H3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  loading: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="6" r="1" fill="currentColor"/></svg>',
};
const FLAG_ICON = {
  inspection: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5a3 3 0 0 0-3.6 3.9L2.5 10.8l2.7 2.7 4.4-4.4a3 3 0 0 0 3.9-3.6l-1.9 1.9-1.6-.4-.4-1.6z" fill="currentColor"/></svg>',
  measurement: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 11a5.5 5.5 0 1 1 11 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 11l3-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  missing: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h3M11 8h3M6.5 5.5l3 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  none: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};

const siteName = (g) => (getLang() === 'ru' ? tx(g.site).replace(/\s*\(.*\)\s*$/, '') : g.short);
const simSiteName = (s) => `${t(s.kind === 'vessel' ? 'sim.vessel' : 'sim.plant')} ${s.index}`;

function pumpMarker(p) {
  const kind = !p.reviewKnown && !p.kinds.length ? 'loading' : p.kinds.includes('review') ? 'review' : p.kinds.includes('replay') ? 'replay' : 'inventory';
  // One marker per pump; it carries the icon of every available data kind (e.g. PUMP-08: review + replay).
  const icons = p.kinds.length ? p.kinds.map((k) => MK[k]).join('') + (p.reviewKnown ? '' : MK.loading) : MK.loading;
  const names = [...(p.reviewKnown ? p.kinds.map((k) => t(k === 'inventory' ? 'pf.mk.passport' : `pf.mk.${k}`)) : [...p.kinds.map((k) => t(`pf.mk.${k}`)), t('pf.mk.loading')]),
    ...(p.blindTest ? [t('pf.mk.test')] : [])];
  return `<span class="pf-pump mk-${kind}${p.blindTest ? ' mk-test' : ''}" title="${esc(`${p.assetId}: ${names.join(', ')}`)}">${icons}<span>${esc(p.assetId.slice(-2))}</span>${p.blindTest ? '<b class="pf-t" aria-hidden="true">T</b>' : ''}<span class="sr">${esc(`${p.assetId}: ${names.join(', ')}`)}</span></span>`;
}

function challenge(assets, cases, filters) {
  const groups = siteGroups(assets, cases);
  const otherFilters = filters.q.trim() || filters.show !== 'all' || filters.split !== 'all';
  const cards = groups.map((g, gi) => {
    const on = filters.site === g.site;
    const name = siteName(g);
    const n = g.count === 1 ? t('pf.pump1') : t('pf.pumps', { n: g.count });
    return `<button type="button" id="pf-site-${gi}" class="pf-site pf-${g.kind}${on ? ' on' : ''}" data-pf-site="${esc(g.site)}" aria-pressed="${on}"
        aria-label="${esc(on ? t('pf.siteOn', { site: tx(g.site) }) : t('pf.siteBtn', { site: tx(g.site), n: g.count }))}" title="${esc(tx(g.site))}">
      <span class="pf-site-top">${SITE_ICON[g.kind]}<span class="pf-site-name"><b>${esc(name)}</b><span class="small muted">${esc(n)}${on ? ` · ${esc(t('pf.selected'))}` : ''}</span></span></span>
      <span class="pf-pumps">${g.pumps.map(pumpMarker).join('')}</span></button>`;
  }).join('');
  // Each icon and its label form one item so they never wrap apart.
  const item = (cls, ico, txt) => `<span class="lg-item"><span class="pf-pump ${cls}">${ico}</span> ${esc(txt)}</span>`;
  const legend = `<p class="pf-legend small">${item('mk-review', MK.review, t('pf.mk.review'))}${item('mk-replay', MK.replay, t('pf.mk.replay'))}${item('mk-inventory', MK.inventory, t('pf.mk.passport'))}${item('mk-test', '<b class="pf-t">T</b>', t('pf.mk.test'))}${cases ? '' : item('mk-loading', MK.loading, t('pf.mk.loading'))}</p>`;
  return `<p class="small muted pf-note">${esc(t('pf.note'))}</p>${legend}
    <div class="pf-toolbar"><button type="button" class="pf-all${filters.site === 'all' ? ' on' : ''}" id="pf-all" aria-pressed="${filters.site === 'all'}">${esc(t('pf.all'))} · ${esc(t('pf.pumps', { n: assets.length }))}</button></div>
    <div class="pf-sites" role="group" aria-label="${esc(t('pf.h'))}">${cards}</div>
    ${filters.site !== 'all' && otherFilters ? `<p class="small pf-scope">${esc(t('pf.scope'))}</p>` : ''}`;
}

function scenario(pf) {
  const totals = scenarioTotals(SCENARIO);
  const flags = ['all', ...SIM_FLAGS];
  const chips = flags.map((f) => {
    const n = f === 'all' ? SCENARIO.pumps.length : totals[f];
    const on = pf.simFlag === f;
    return `<button type="button" id="pf-flag-${f}" class="sim-flag sf-${f}${on ? ' on' : ''}" data-pf-flag="${f}" aria-pressed="${on}">
      ${f === 'all' ? '<span></span>' : `<span class="sf-ico">${FLAG_ICON[f]}</span>`}<span class="sf-label">${esc(t(`sim.flag.${f}`))}${f === 'none' ? `<span class="sf-note">${esc(t('sim.flag.noneNote'))}</span>` : ''}</span><b class="num">${n}</b>
      <span class="sf-bar" aria-hidden="true"><span style="width:${((n / SCENARIO.pumps.length) * 100).toFixed(1)}%"></span></span></button>`;
  }).join('');
  const shown = SCENARIO.sites.filter((s) => pf.simFlag === 'all' || s[pf.simFlag] > 0 || s.id === pf.simSite);
  const matchPumps = pf.simFlag === 'all' ? SCENARIO.pumps.length : totals[pf.simFlag];
  const sites = shown.map((s) => {
    const on = pf.simSite === s.id;
    const match = pf.simFlag === 'all' ? s.count : s[pf.simFlag];
    const flagged = ['inspection', 'measurement', 'missing'].filter((f) => s[f]).map((f) => `<span class="sf-mini sf-${f}" title="${esc(t(`sim.flag.${f}`))}">${FLAG_ICON[f]}${s[f]}</span>`).join('');
    return `<button type="button" id="pf-ss-${s.id}" class="sim-site${on ? ' on' : ''}${match ? '' : ' dim'}" data-pf-sim-site="${s.id}" aria-pressed="${on}"
        aria-label="${esc(`${simSiteName(s)} (${s.id}): ${t('pf.pumps', { n: s.count })}; ${['inspection', 'measurement', 'missing'].map((f) => `${t(`sim.flag.${f}`)} ${s[f]}`).join(', ')}`)}">
      ${SITE_ICON[s.kind]}<span class="sim-site-name">${esc(simSiteName(s))}</span><span class="sim-site-flags">${flagged || `<span class="small muted">${esc(t('sim.noneRow'))}</span>`}</span></button>`;
  }).join('');
  const sel = SCENARIO.sites.find((s) => s.id === pf.simSite);
  const list = sel ? filterScenario(SCENARIO, { siteId: sel.id, flag: pf.simFlag }) : [];
  const empty = sel && !list.length ? `<p class="empty small">${esc(t('sim.noMatch', { site: simSiteName(sel), state: t(`sim.flag.${pf.simFlag}`) }))}</p>` : '';
  const table = sel && empty ? `<div class="sim-list"><div class="panel-head"><h3 id="sim-list-h">${esc(t('sim.list', { site: simSiteName(sel), n: 0 }))}</h3><button type="button" id="pf-sim-clear">${esc(t('sim.close'))}</button></div>${empty}</div>`
    : sel ? `<div class="sim-list"><div class="panel-head"><h3 id="sim-list-h">${esc(t('sim.list', { site: simSiteName(sel), n: list.length }))}</h3><button type="button" id="pf-sim-clear">${esc(t('sim.close'))}</button></div>
      <div class="table-wrap" role="region" aria-labelledby="sim-list-h" tabindex="0"><table class="stack">
      <thead><tr><th scope="col">${esc(t('sim.colPump'))}</th><th scope="col">${esc(t('sim.colState'))}</th><th scope="col">${esc(t('sim.colIssue'))}</th><th scope="col">${esc(t('sim.colCheck'))}</th></tr></thead>
      <tbody>${list.map((p) => `<tr><th scope="row" class="mono">${esc(p.id)}</th><td data-label="${esc(t('sim.colState'))}"><span class="sf-ico sf-${p.flag}">${FLAG_ICON[p.flag]}</span> ${esc(t(`sim.flag.${p.flag}`))}</td>
        <td data-label="${esc(t('sim.colIssue'))}">${p.issue ? esc(t(`sim.issue.${p.issue}`)) : esc(t('sim.noneRow'))}</td><td data-label="${esc(t('sim.colCheck'))}">${p.issue ? esc(t(`sim.check.${p.issue}`)) : esc(t('sim.noneRow'))}</td></tr>`).join('')}</tbody></table></div></div>`
    : `<p class="small muted">${esc(t('sim.pick'))}</p>`;
  return `<div class="sim-banner" role="note"><b>${esc(t('sim.banner'))}</b> ${esc(t('sim.purpose'))}
      <details class="small"><summary>${esc(t('sim.more'))}</summary><p>${esc(t('sim.limits'))}</p></details></div>
    <div class="sim-flags" role="group" aria-label="${esc(t('sim.flags'))}">${chips}</div>
    <p class="small sim-count" aria-live="polite">${esc(t('sim.showing', { sites: shown.length, total: SCENARIO.sites.length, n: matchPumps }))}</p>
    <div class="sim-sites" role="group" aria-label="${esc(t('sim.sites'))}">${sites}</div>
    ${table}`;
}

// pf = { open, mode: 'challenge' | 'sim', simFlag, simSite }
export function renderPortfolio({ assets, cases, filters, pf }) {
  const sim = pf.mode === 'sim';
  return `<details class="panel portfolio${sim ? ' is-sim' : ''}" id="pf"${pf.open ? ' open' : ''}>
    <summary><span class="pf-chev" aria-hidden="true"></span><b>${esc(t('pf.h'))}</b> <span class="src-badge ${sim ? 'src-sim' : 'src-real'}">${esc(t(sim ? 'pf.srcSim' : 'pf.srcReal'))}</span>
      <span class="pf-toggle-txt small" data-open="${esc(t('pf.collapse'))}" data-closed="${esc(t('pf.expand'))}">${esc(t(pf.open ? 'pf.collapse' : 'pf.expand'))}</span></summary>
    <div class="pf-modes" role="group" aria-label="${esc(t('pf.modes'))}">
      <button type="button" id="pf-mode-challenge" aria-pressed="${!sim}"${sim ? '' : ' class="on"'}>${esc(t('pf.challenge'))}</button>
      <button type="button" id="pf-mode-sim" aria-pressed="${sim}"${sim ? ' class="on"' : ''}>${esc(t('pf.sim'))}</button>
    </div>
    ${sim ? scenario(pf) : challenge(assets, cases, filters)}
  </details>`;
}
