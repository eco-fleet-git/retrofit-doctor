// Task018 overview: availability classification, derived counts, previewed case within the visible queue,
// and a preview that never shows evidence later than the case's own warning or any ground-truth label.
//   node --test tests/web_overview.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { availabilityKinds, overviewCounts, selectVisibleCase } from '../web/js/overview.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url)));
const fleet = load('fleet.json');
const bundle = load('diagnosis-comparison.json');
const cases = bundle.cases;
const asset = (id) => fleet.assets.find((a) => a.assetId === id);
globalThis.window = { innerWidth: 1440 };
globalThis.history = { replaceState() {} };
globalThis.fetch = async () => ({ ok: true, json: async () => bundle });
const { setLang } = await import('../web/js/i18n.js');
const view = await import('../web/js/diagnosis-view.js');

test('availability: reviews, replays and inventory-only are derived; blind-test pumps are never reviewable', () => {
  const kinds = Object.fromEntries(fleet.assets.map((a) => [a.assetId, availabilityKinds(a, cases).join('+')]));
  assert.deepEqual(kinds, {
    'PUMP-01': 'review', 'PUMP-02': 'review', 'PUMP-03': 'inventory', 'PUMP-04': 'review', 'PUMP-05': 'inventory', 'PUMP-06': 'inventory',
    'PUMP-07': 'inventory', 'PUMP-08': 'review+replay', 'PUMP-09': 'replay', 'PUMP-10': 'inventory', 'PUMP-11': 'inventory', 'PUMP-12': 'inventory',
  });
  for (const id of ['PUMP-10', 'PUMP-11', 'PUMP-12']) assert.equal(asset(id).split, 'test');
});

test('counts are derived from the bundles (12 / 4 / 2 / 7, of which 3 blind-test) and overlap', () => {
  assert.deepEqual(overviewCounts(fleet.assets, cases), { total: 12, reviews: 4, replay: 2, inventory: 7, inventoryBlindTest: 3 });
  assert.equal(overviewCounts(fleet.assets, null).reviews, 0, 'before the bundle loads nothing is counted as a review');
});

test('previewed case stays inside the visible queue', () => {
  const c = (id) => cases.find((x) => x.caseId === id);
  assert.equal(selectVisibleCase(cases, 'pump08-validation').caseId, 'pump08-validation', 'stored selection kept while visible');
  assert.equal(selectVisibleCase([c('pump02-train'), c('pump01-train')], 'pump04-train').caseId, 'pump02-train', 'hidden selection falls back to the first visible case');
  assert.equal(selectVisibleCase([], 'pump04-train'), null, 'no visible case gives a genuine empty preview');
  // Filtering to inventory-only leaves no reviewable case visible.
  const visible = cases.filter((x) => availabilityKinds(asset(x.assetId), cases).includes('inventory'));
  assert.equal(selectVisibleCase(visible, 'pump04-train'), null);
});

test('overview preview uses the case at its own warning time: no later evidence, no labels; EN and RU', async () => {
  await new Promise((r) => { view.reviewCases(r); });
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      for (const c of cases) {
        const p = view.casePreview(c, asset(c.assetId));
        assert.notEqual(p.kind, 'pending', `${c.caseId}: available at its warning`);
        assert.ok(!p.html.includes(c.label.event_id) && !p.html.includes('SENSOR_NOISE_SPIKES'), 'no ground-truth label or raw code');
        assert.doesNotMatch(p.html, /\$\{/);
      }
      const p4 = view.casePreview(cases.find((x) => x.caseId === 'pump04-train'), asset('PUMP-04'));
      assert.match(p4.html, /22:05:00–22:05:59 UTC/);
      assert.doesNotMatch(p4.html.match(/<svg viewBox[\s\S]*?<\/svg>/)[0], /22:06:00/, 'the chart ends inside the closed minute');
      assert.match(p4.html, lang === 'ru' ? /Pd − Ps/ : /Measured Pd − Ps/);
      assert.match(p4.html, lang === 'ru' ? />кПа</ : />kPa</, 'visible kPa axis label');
      const p8 = view.casePreview(cases.find((x) => x.caseId === 'pump08-validation'), asset('PUMP-08'));
      assert.match(p8.evidence, lang === 'ru' ? /3 ч 39 мин 37 с/ : /3 h 39 min 37 s/);
      const p1 = view.casePreview(cases.find((x) => x.caseId === 'pump01-train'), asset('PUMP-01'));
      assert.equal(p1.kind, 'unsupported');
      assert.match(p1.evidence, lang === 'ru' ? /Нет прибора: расход/ : /No flow meter/);
      assert.doesNotMatch(p4.html + p1.html, /electromagnetic|ultrasonic|P04-Q|Engineer Alpha|Assessable/i);
    } finally { setLang('en'); }
  }
});

test('pump check: sidebar pump follows the shown case; research, results and ground truth sit in one closed disclosure', async () => {
  // The bundle is already loaded by the previous test; only wait if it is not.
  if (!view.reviewCases(() => {})) await new Promise((r) => { view.reviewCases(r); });
  const page = (q) => view.renderDiagnosisPage({ params: new URLSearchParams(q) }, asset, () => {});
  page('case=pump04-train&t=2025-06-18T22:06:00Z');
  assert.equal(view.currentCaseAssetId(), 'PUMP-04');
  const html = page('case=pump02-train&t=2025-12-07T10:32:00Z');
  assert.equal(view.currentCaseAssetId(), 'PUMP-02');
  const research = html.indexOf('<details class="panel research" id="cmp-research">');
  assert.ok(research > 0, 'closed by default');
  assert.ok(html.indexOf('id="cmp-eval-h"') > research && html.indexOf('id="sc-h"') > research, 'ground truth and benchmark results are inside it');
  assert.ok(html.indexOf('id="cmp-next-h"') < research, 'the next check stays above it');
});
