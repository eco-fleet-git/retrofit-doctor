// Task017: EN/RU dictionary parity, Russian first screen, and visual-evidence gating.
//   node --test tests/web_i18n_visual.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaryKeys, setLang, t, getLang } from '../web/js/i18n.js';
import { sliceCase, explainCase } from '../web/js/comparison.js';
import { pumpSchematic, featureBars, spreadBars, flowSpark } from '../web/js/review-visuals.js';

const root = new URL('../', import.meta.url);
const bundle = JSON.parse(readFileSync(new URL('web/data/diagnosis-comparison.json', root)));
const fleet = JSON.parse(readFileSync(new URL('web/data/fleet.json', root)));
const asset = (id) => fleet.assets.find((a) => a.assetId === id);
const kase = (id) => bundle.cases.find((c) => c.caseId === id);
const at = (s) => Date.parse(s);
globalThis.window = { innerWidth: 1440 };
globalThis.history = { replaceState() {} };
globalThis.fetch = async () => ({ ok: true, json: async () => bundle });
const view = await import('../web/js/diagnosis-view.js');
await new Promise((r) => { view.renderDiagnosisPage({ params: new URLSearchParams() }, asset, r); });
const page = (id, clock) => view.renderDiagnosisPage({ params: new URLSearchParams(`case=${id}&t=${clock}`) }, asset, () => {});
const visible = (html) => html.slice(html.indexOf('class="panel review"'), html.indexOf('id="cmp-eval-h"'))
  .replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');

test('dictionary: English and Russian have the same keys; default language is English', () => {
  assert.deepEqual(dictionaryKeys('ru').sort(), dictionaryKeys('en').sort());
  assert.equal(getLang(), 'en');
  setLang('ru'); assert.equal(t('nav.fleet'), 'Начало'); assert.equal(t('nav.pump'), 'Насос и датчики'); setLang('en');
  assert.equal(t('nav.fleet'), 'Start · Fleet');
});

test('schematic: before the warning only the inventory is drawn (no focus, chips or proposed additions)', () => {
  for (const c of bundle.cases) {
    const s = sliceCase(c, at(c.alertUtc) - 1000);
    const f = view.schematicFocus(explainCase(s, asset(c.assetId)));
    assert.deepEqual(f, {}, c.caseId);
    const html = pumpSchematic(asset(c.assetId), f);
    assert.doesNotMatch(html, /class="chip|#b06d00|Points to check: [^—]/, c.caseId);
    const pg = visible(page(c.caseId, new Date(at(c.alertUtc) - 1000).toISOString()));
    // The inventory link ("Check installed sensors") is allowed before the warning; inference is not.
    assert.doesNotMatch(pg, /points to check|— check|possible addition|consistent|Next check|7\.3|4\.8×|2\.7×|bearing|alignment|flow measurement/i, c.caseId);
  }
});

test('schematic: at the warning it highlights the source-specific point or the missing input', () => {
  const f = (id) => view.schematicFocus(explainCase(sliceCase(kase(id), at(kase(id).alertUtc)), asset(kase(id).assetId)));
  assert.deepEqual(f('pump04-train'), { focus: ['flow_m3_h'] });
  assert.deepEqual(f('pump08-validation'), { focus: ['vibration_rms_mm_s'] });
  assert.deepEqual(f('pump01-train'), { focus: ['suction_pressure_kpa'], proposed: ['flow_m3_h'] });
  const html = pumpSchematic(asset('PUMP-01'), f('pump01-train'));
  assert.match(html, /<b>Q<\/b> · Flow — possible addition/);
  assert.match(html, /<b>Ps<\/b> · Suction pressure — check/);
  assert.doesNotMatch(pumpSchematic(asset('PUMP-01')), />Vp</, 'valve feedback is drawn only when installed');
});

test('visual evidence uses frozen numbers only: spread 7.3 vs 3.5 kPa, flow range with UTC times, bearing ratio of ratios', () => {
  const s4 = sliceCase(kase('pump04-train'), at('2025-06-18T22:06:00Z'));
  const e4 = explainCase(s4, asset('PUMP-04'));
  assert.match(spreadBars(e4, s4), /7\.3 kPa[\s\S]*3\.5 kPa/);
  assert.match(flowSpark(s4.rawMinute), /Recorded range \d+–\d+ m³\/h, 22:05:00–22:05:59 UTC \(not a limit\)/);
  const s8 = sliceCase(kase('pump08-validation'), at('2025-09-11T20:47:00Z'));
  const bars = featureBars(explainCase(s8, asset('PUMP-08')), true);
  assert.match(bars, /1\.9×[\s\S]*4\.8×/);
  assert.match(bars, /not an absolute amplitude and not a probability/i);
  const s2 = sliceCase(kase('pump02-train'), at('2025-12-07T10:32:00Z'));
  assert.match(featureBars(explainCase(s2, asset('PUMP-02')), false), /twice-per-revolution component is about 2\.5×/);
});

test('RU review: visible first-screen text is Russian (no English core sentences) for every case, same numbers', () => {
  setLang('ru');
  try {
    for (const c of bundle.cases) {
      const v = visible(page(c.caseId, c.alertUtc));
      assert.match(v, /[а-яё]{4}/i);
      assert.doesNotMatch(v, /\b(the|and|check|measurement|warning|recording|Next|evidence|installed|before|after)\b/i, `${c.caseId}: ${v.match(/\b(the|and|check|measurement|warning|recording|Next|evidence|installed|before|after)\b/i)?.[0]}`);
    }
    const p4 = visible(page('pump04-train', '2025-06-18T22:06:00Z'));
    assert.match(p4, /Проверьте показания расходомера/);
    assert.match(p4, /7\.3 кПа/);
    assert.match(p4, /Вывод близок к порогу правила/);
    assert.match(visible(page('pump08-validation', '2025-09-12T20:47:00Z')), /3 ч 39 мин 37 с[\s\S]*27 ч 39 мин 37 с/);
  } finally { setLang('en'); }
});
