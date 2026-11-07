// Task020 portfolio: site groups from supplied passports, loading handling, and the separate authored scale scenario.
//   node --test tests/web_portfolio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siteGroups, siteShort, siteKind, scaleScenario, scenarioTotals, filterScenario, SIM_PARTITION } from '../web/js/portfolio.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url)));
const fleet = load('fleet.json');
const cases = load('diagnosis-comparison.json').cases;
const benchmarkIds = new Set(fleet.assets.map((a) => a.assetId));

test('challenge data: six sites with exact pump membership from asset.site', () => {
  const g = siteGroups(fleet.assets, cases);
  const members = Object.fromEntries(g.map((s) => [s.short, s.pumps.map((p) => p.assetId).join(',')]));
  assert.deepEqual(members, {
    'Plant C': 'PUMP-04,PUMP-05,PUMP-09', 'Plant D': 'PUMP-06,PUMP-12', 'Plant E': 'PUMP-11',
    'Vessel A': 'PUMP-01,PUMP-02,PUMP-03', 'Vessel B': 'PUMP-07,PUMP-08', 'Vessel C': 'PUMP-10',
  });
  assert.equal(g.reduce((n, s) => n + s.count, 0), 12, 'every asset counted once (availability categories overlap, assets do not)');
  assert.deepEqual(g.map((s) => siteKind(s.site)), ['plant', 'plant', 'plant', 'vessel', 'vessel', 'vessel']);
  assert.equal(siteShort('Vessel A (RoPax, fictional)'), 'Vessel A');
  const b = Object.fromEntries(g.map((s) => [s.short, [s.reviews, s.replays, s.passportOnly, s.blindTest]]));
  assert.deepEqual(b, {
    'Plant C': [1, 1, 1, 0], 'Plant D': [0, 0, 2, 1], 'Plant E': [0, 0, 1, 1],
    'Vessel A': [2, 0, 1, 0], 'Vessel B': [1, 1, 1, 0], 'Vessel C': [0, 0, 1, 1],
  });
});

test('while reviews are loading (or failed) review and passport-only counts are unknown, never zero', () => {
  const g = siteGroups(fleet.assets, null);
  for (const s of g) {
    assert.equal(s.reviews, null, s.short);
    assert.equal(s.passportOnly, null, s.short);
    for (const p of s.pumps) { assert.equal(p.reviewKnown, false); assert.ok(!p.kinds.includes('inventory') && !p.kinds.includes('review')); }
  }
  assert.equal(g.find((s) => s.short === 'Vessel B').replays, 1, 'replay availability is known without the review bundle');
});

test('scale scenario: deterministic 200 SIM pumps at 20 sites with the authored partition 12/18/10/160', () => {
  const a = scaleScenario(); const b = scaleScenario();
  assert.deepEqual(a, b, 'deterministic');
  assert.equal(a.simulated, true);
  assert.equal(a.pumps.length, 200);
  assert.equal(a.sites.length, 20);
  assert.ok(a.sites.every((s) => s.count === 10 && /^SIM-S\d\d$/.test(s.id)));
  assert.deepEqual(scenarioTotals(a), SIM_PARTITION);
  assert.deepEqual(SIM_PARTITION, { inspection: 12, measurement: 18, missing: 10, none: 160 });
  assert.equal(new Set(a.pumps.map((p) => p.id)).size, 200);
  assert.ok(a.pumps.every((p) => /^SIM-\d{3}$/.test(p.id) && !benchmarkIds.has(p.id)), 'SIM IDs never collide with benchmark IDs');
  assert.ok(a.pumps.every((p) => (p.flag === 'none') === (p.issue === null)), 'only flagged SIM pumps carry an authored issue');
  assert.doesNotMatch(JSON.stringify(a), /PUMP-\d|Vessel [ABC]|Plant [CDE]|z995|B1/, 'no benchmark identifiers or methods leak into the scenario');
});

test('scenario filters: by flag and by site, without touching the challenge data', () => {
  const sc = scaleScenario();
  assert.equal(filterScenario(sc).length, 200);
  assert.equal(filterScenario(sc, { flag: 'inspection' }).length, 12);
  const site = sc.sites[0];
  const ps = filterScenario(sc, { siteId: site.id });
  assert.equal(ps.length, 10);
  assert.equal(filterScenario(sc, { siteId: site.id, flag: 'missing' }).length, site.missing);
  const before = JSON.stringify(siteGroups(fleet.assets, cases));
  filterScenario(sc, { flag: 'measurement' });
  assert.equal(JSON.stringify(siteGroups(fleet.assets, cases)), before, 'challenge groups unchanged by scenario use');
});

// ---- Panel rendering (DOM-free) ----
const { setLang, t } = await import('../web/js/i18n.js');
const { renderPortfolio } = await import('../web/js/portfolio-view.js');
const F = (o = {}) => ({ q: '', split: 'all', site: 'all', show: 'all', ...o });
const PF = (o = {}) => ({ open: true, mode: 'challenge', simFlag: 'all', simSite: null, ...o });

test('panel, challenge mode: six site buttons + All, selected state, scope note, EN/RU, no SIM content', () => {
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      const html = renderPortfolio({ assets: fleet.assets, cases, filters: F(), pf: PF() });
      assert.equal((html.match(/data-pf-site="/g) ?? []).length, 6);
      assert.match(html, /id="pf-all"[^>]*aria-pressed="true"/);
      assert.match(html, lang === 'ru' ? /Данные задания \(синтетика\) · исторические записи · не в реальном времени/ : /Supplied synthetic data · historical records · not live/);
      assert.match(html, lang === 'ru' ? /Судно A/ : /Vessel A/);
      assert.doesNotMatch(html, /SIM-|SIMULATED|СМОДЕЛИРОВАННЫЙ|\$\{/);
      const sel = renderPortfolio({ assets: fleet.assets, cases, filters: F({ site: 'Plant C (food processing, fictional)', q: 'cw' }), pf: PF() });
      assert.match(sel, /data-pf-site="Plant C \(food processing, fictional\)" aria-pressed="true"/);
      assert.match(sel, lang === 'ru' ? /применяются и другие фильтры/ : /Other filters also apply/);
      const cardsHtml = sel.slice(sel.indexOf('class="pf-sites"'));
      assert.equal((cardsHtml.match(/ mk-test"/g) ?? []).length, 3, 'blind-test markers on PUMP-10/11/12');
      assert.match(cardsHtml, /title="PUMP-10: [^"]*(blind test|слепой тест)/);
    } finally { setLang('en'); }
  }
});

test('panel while the review bundle loads: no review or passport-only marker, explicit loading marker', () => {
  const html = renderPortfolio({ assets: fleet.assets, cases: null, filters: F(), pf: PF() });
  const pumps = html.match(/<span class="pf-pump mk-[a-z]+/g).filter((x) => !x.includes('mk-test'));
  // legend contains one marker per kind; pump markers follow in the site cards
  const cardMarkers = html.slice(html.indexOf('class="pf-sites"')).match(/<span class="pf-pump mk-([a-z]+)/g).map((x) => x.split('mk-')[1]);
  assert.deepEqual([...new Set(cardMarkers)].sort(), ['loading', 'replay']);
  assert.ok(pumps.length > 0);
});

test('panel, scenario mode: clearly simulated, no benchmark IDs or routes; filters and site list work', () => {
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      const html = renderPortfolio({ assets: fleet.assets, cases, filters: F(), pf: PF({ mode: 'sim' }) });
      assert.match(html, lang === 'ru' ? /СМОДЕЛИРОВАННЫЙ СЦЕНАРИЙ/ : /SIMULATED SCENARIO/);
      assert.doesNotMatch(html, /PUMP-\d|href="#\/|data-pf-site=/, 'no benchmark pumps, routes or site filters inside the scenario');
      assert.equal((html.match(/data-pf-sim-site="/g) ?? []).length, 20);
      assert.match(html, /data-pf-flag="inspection"[^>]*>[\s\S]*?<b class="num">12<\/b>/);
      const sc = scaleScenario();
      const site = sc.sites.find((s) => s.inspection > 0);
      const list = renderPortfolio({ assets: fleet.assets, cases, filters: F(), pf: PF({ mode: 'sim', simFlag: 'inspection', simSite: site.id }) });
      assert.equal((list.match(/<th scope="row" class="mono">SIM-\d{3}<\/th>/g) ?? []).length, site.inspection);
      assert.doesNotMatch(list, /\$\{|undefined/);
    } finally { setLang('en'); }
  }
});

test('CUA fixes: disclosure affordance, PUMP-08 shows review and replay, state filter hides non-matching sites, empty message', () => {
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      const open = renderPortfolio({ assets: fleet.assets, cases, filters: F(), pf: PF() });
      assert.match(open, lang === 'ru' ? /class="pf-toggle-txt small" data-open="Свернуть" data-closed="Развернуть">Свернуть</ : /class="pf-toggle-txt small" data-open="Collapse" data-closed="Expand">Collapse</);
      assert.match(renderPortfolio({ assets: fleet.assets, cases, filters: F(), pf: PF({ open: false }) }), lang === 'ru' ? />Развернуть</ : />Expand</);
      // PUMP-08: one marker with both icons and one pump number
      const m08 = /<span class="pf-pump[^"]*" title="PUMP-08:[^"]*">([\s\S]*?)<\/span><span class="sr">/.exec(open)[1];
      assert.equal((m08.match(/<svg/g) ?? []).length, 2);
      assert.equal((m08.match(/<span>08/g) ?? []).length, 1);
      const sc = scaleScenario();
      const html = renderPortfolio({ assets: fleet.assets, cases, filters: F(), pf: PF({ mode: 'sim', simFlag: 'missing' }) });
      const withMissing = sc.sites.filter((s) => s.missing > 0).length;
      assert.equal((html.match(/data-pf-sim-site="/g) ?? []).length, withMissing, 'only sites with matching pumps are shown');
      assert.match(html, new RegExp(lang === 'ru' ? `Показано площадок: ${withMissing} из 20 · подходящих насосов: 10` : `Showing ${withMissing} of 20 sites · 10 matching pumps`));
      assert.match(html, lang === 'ru' ? /не доказательство исправности/ : /not proof of health/);
      const noMissing = sc.sites.find((s) => s.missing === 0);
      const empty = renderPortfolio({ assets: fleet.assets, cases, filters: F(), pf: PF({ mode: 'sim', simFlag: 'missing', simSite: noMissing.id }) });
      assert.match(empty, lang === 'ru' ? /нет насосов с состоянием «Нет данных»/ : /No pumps with the state “Missing data”/);
      assert.match(empty, new RegExp(`data-pf-sim-site="${noMissing.id}"`), 'the selected site stays visible');
    } finally { setLang('en'); }
  }
});

test('scenario source wording: user-facing footer without implementation detail; seed detail lives in the sources disclosure', () => {
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      assert.equal(t('sim.foot'), lang === 'ru' ? 'Иллюстративный сценарий парка; нет связи с оборудованием; только рекомендации.' : 'Illustrative fleet scenario; no equipment connection; advisory only.');
      assert.doesNotMatch(t('sim.foot'), /seed|зерн/);
      assert.match(t('sim.limits'), lang === 'ru' ? /фиксированного зерна; файлы бенчмарка не используются/ : /fixed seed; no benchmark files are used/);
      assert.notEqual(t('sim.badgeSrc'), t('badge.replay'));
      assert.notEqual(t('sim.badge'), t('badge.synthetic'));
    } finally { setLang('en'); }
  }
});
