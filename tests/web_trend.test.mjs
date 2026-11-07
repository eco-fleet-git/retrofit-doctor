// Pump Detail replay trend render branch (svgChart via trendCharts), EN and RU, dense and sparse channels,
// desktop and narrow. Regression for the Task019 runtime error where a local plot margin shadowed L().
//   node --test tests/web_trend.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = { innerWidth: 1440 };
const { setLang } = await import('../web/js/i18n.js');
const { sliceReplay } = await import('../web/js/replay.js');
const { trendCharts } = await import('../web/js/trend.js');
const load = (p) => JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url)));
const p08 = load('replay-PUMP-08.json');
const p09 = load('replay-PUMP-09.json');

test('replay trend charts render in EN and RU at desktop and narrow widths, dense and sparse channels', () => {
  const cases = [
    [p08, '2025-09-10T12:38:00Z', 'suction_pressure_kpa'], [p08, '2025-09-10T12:38:00Z', 'vibration_rms_mm_s'],
    [p09, '2026-02-10T06:28:00Z', 'vibration_rms_mm_s'], [p08, '2025-09-08T06:00:00Z', 'suction_pressure_kpa'],
  ];
  for (const width of [1440, 390]) {
    window.innerWidth = width;
    for (const lang of ['en', 'ru']) {
      setLang(lang);
      try {
        for (const [replay, clock, ch] of cases) {
          const view = sliceReplay(replay, Date.parse(clock));
          for (const span of [360, 1440, 0]) {
            const html = trendCharts(view, ch, span, null);
            assert.ok(html.includes('<svg'), `${lang} ${width} ${ch} ${clock}`);
            assert.doesNotMatch(html, /\$\{|undefined|NaN/, `${lang} ${width} ${ch} ${clock}: no template leak or NaN coordinates`);
            assert.match(html, lang === 'ru' ? /На \d\d-\d\d/ : /As of \d\d-\d\d/);
          }
        }
        // The 12:38 alert is drawn and labelled in the current language; nothing after the as-of clock.
        const v = sliceReplay(p08, Date.parse('2025-09-10T12:38:00Z'));
        const html = trendCharts(v, 'suction_pressure_kpa', 360, null);
        assert.match(html, lang === 'ru' ? /! предупр\./ : /! alert/);
        const pts = Number(/; (\d+) points up to the as-of time/.exec(html)?.[1] ?? NaN);
        assert.ok(pts > 0 && pts <= 360, 'points never exceed the 6 h span ending at the clock');
      } finally { setLang('en'); }
    }
  }
  window.innerWidth = 1440;
});
