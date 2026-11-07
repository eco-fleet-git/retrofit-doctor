// Task017: Russian core path beyond the review page — Planner (choices, candidates, results, inputs), sensor map
// and the baseline Pump Detail explanation. Raw identifiers, units, currency codes and numbers stay original.
//   node --test tests/web_ru_core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.window = { innerWidth: 1440, localStorage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) } };
const { setLang } = await import('../web/js/i18n.js');
const { renderPlannerPage, plannerState } = await import('../web/js/planner.js');
const { addCandidate } = await import('../web/js/planner-store.js');
const { renderSchematic } = await import('../web/js/schematic.js');
const { sliceReplay } = await import('../web/js/replay.js');
const { explainAlert } = await import('../web/js/explain.js');
const { ruExplainBaseline } = await import('../web/js/explain-ru.js');

const load = (p) => JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url)));
const fleet = load('fleet.json');
const asset = (id) => fleet.assets.find((a) => a.assetId === id);
// Visible text: tags removed; raw identifiers (mono/code spans), option values and attribute text are not visible text.
const visible = (html) => html.replace(/<span class="[^"]*mono[^"]*">[\s\S]*?<\/span>/g, ' ').replace(/<div class="small muted mono">[\s\S]*?<\/div>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
const ENGLISH = /\b(the|and|of|for|with|Draft|Save|Review|Cost|Option|Annual|Initial|None|Choose|Add|Remove|Evidence|Sensors|Lifecycle|Payback|hypothesis|Existing|Proposed|Installed|Not|Answer|Decision|Baseline|Benefit|Inspect|Verify|Check|reference|measured|alert|pump)\b/g;

test('RU Planner: choices, candidate cards, status, results and inputs render without English core text', () => {
  setLang('ru');
  try {
    renderPlannerPage(asset('PUMP-01'), '', fleet.experiments);
    const d = plannerState.drafts['PUMP-01'];
    d.choice = 'minimal';
    for (const id of ['flow_head_power', 'vibration']) Object.assign(d, addCandidate(d, id) ?? {});
    plannerState.editorOpen = true;
    for (const tab of ['existing', 'minimal']) {
      plannerState.tab = tab;
      const html = renderPlannerPage(asset('PUMP-01'), '', fleet.experiments);
      assert.doesNotMatch(html, /\$\{/, 'no un-interpolated template text');
      const v = visible(html);
      const left = [...new Set(v.match(ENGLISH) ?? [])];
      assert.deepEqual(left, [], `tab ${tab}: English words left: ${left.join(', ')}`);
      assert.match(v, /Сводка решения/);
      assert.match(v, /Оценить минимальное дооснащение/);
    }
    assert.ok(d.choice === 'minimal', 'stored keys unchanged');
  } finally { setLang('en'); }
});

test('RU sensor map: labels, states, legend and captions are Russian', () => {
  setLang('ru');
  try {
    const h = renderSchematic(asset('PUMP-01'), { proposed: ['flow_m3_h'] });
    assert.doesNotMatch(h, /\$\{/);
    const v = visible(h);
    assert.deepEqual([...new Set(v.match(ENGLISH) ?? [])], []);
    assert.match(v, /Давление на всасывании/);
  } finally { setLang('en'); }
});

test('RU baseline explanation (Pump Detail): Russian headline, next check and gaps; same values', () => {
  const p08 = load('replay-PUMP-08.json');
  const view = sliceReplay(p08, Date.parse('2025-09-10T12:38:00Z'));
  const alert = view.alerts.find((a) => a.alert_time_utc === '2025-09-10T12:38:00Z');
  const e = explainAlert(view, alert, asset('PUMP-08'));
  const ru = ruExplainBaseline(e, alert, asset('PUMP-08'), view.asOfMs);
  assert.equal(ru.headline, 'Давление на всасывании ниже опоры этого насоса; правило предполагает сужение на всасывании, но причина не подтверждена.');
  assert.match(ru.next.text, /местным манометром/);
  const text = JSON.stringify(ru);
  assert.deepEqual([...new Set(text.match(ENGLISH) ?? [])], []);
  assert.match(text, /Не установлено на этом насосе: Расход/);
  assert.match(text, /Установленных каналов без отсчёта в эту минуту: 4 \(период датчика 5 мин\)/);
});

test('EN Planner still renders English and without template leaks (regression)', () => {
  const html = renderPlannerPage(asset('PUMP-01'), '', fleet.experiments);
  assert.doesNotMatch(html, /\$\{/);
  assert.match(html, /Decision summary/);
  assert.match(html, /Assess minimal retrofit/);
});

test('Planner entry flow: one primary action jumps to the review paths; cost tables sit in a collapsed Compare costs disclosure after them', () => {
  delete plannerState.drafts['PUMP-02'];
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      const html = renderPlannerPage(asset('PUMP-02'), '', fleet.experiments);
      const choiceAt = html.indexOf('id="pl-choice"');
      const top = html.slice(0, choiceAt);
      assert.equal((top.match(/class="(button )?primary"/g) ?? []).length, 1, `${lang}: exactly one primary action before the choices`);
      assert.match(top, /<button type="button" class="primary" data-pl-jump="pl-choice">/);
      const compare = html.indexOf('<details class="panel compare" id="pl-compare">');
      assert.ok(compare > choiceAt, 'Compare costs disclosure comes after the review paths and is closed by default');
      assert.ok(html.indexOf('id="pl-res"') > compare, 'lifecycle tables are inside it');
      assert.match(html, lang === 'ru' ? /Сравнить затраты/ : /Compare costs/);
    } finally { setLang('en'); }
  }
  const d = plannerState.drafts['PUMP-02']; d.choice = 'minimal';
  const html = renderPlannerPage(asset('PUMP-02'), '', fleet.experiments);
  const sel = /data-pl-jump-sel="\[data-answer=&quot;([^&]+)&quot;\]"/.exec(html);
  assert.ok(sel, 'with a path chosen the next action targets the first unanswered question');
  assert.ok(html.includes(`data-answer="${sel[1]}"`), 'that question exists on the page');
});

test('RU cost caption shows display wording, model enums unchanged', () => {
  setLang('ru');
  try {
    const html = renderPlannerPage(asset('PUMP-02'), '', fleet.experiments);
    assert.match(html, /EUR \(без НДС\), постоянные цены/);
    assert.equal(plannerState.drafts['PUMP-02'].economics.moneyConvention, 'constant-real');
  } finally { setLang('en'); }
});
