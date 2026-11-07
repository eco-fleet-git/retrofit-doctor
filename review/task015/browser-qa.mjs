// Task015 browser QA: #/diagnosis comparison plus baseline-route regressions. System Chrome headless, fresh
// isolated contexts (no user profile). Usage:
//   python3 -m http.server 8769 --bind 127.0.0.1 -d web &
//   node review/task015/browser-qa.mjs "$PWD/review/task015" > review/task015/browser-qa-result.txt
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/vladislavlebedev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const SHOTS = process.argv[2];
const BASE = 'http://127.0.0.1:8769/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [];
const check = (id, name, pass, detail = '') => checks.push({ id, name, pass: !!pass, detail });

async function session(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = []; const requests = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  return { context, page, errors, requests };
}
const go = async (page, hash, sel) => { await page.goto('about:blank'); await page.goto(`${BASE}#${hash}`); await page.locator(sel).first().waitFor({ state: 'attached' }); };
const text = (page, sel) => page.locator(sel).innerText();
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const CARD = '[aria-labelledby="cmp-h"]';
const pick = async (page, id) => { await page.click(`[data-case="${id}"]`); await page.locator('#cmp-h').waitFor(); };

// ---------------- desktop 1440 ----------------
{
  const { context, page, errors, requests } = await session({ width: 1440, height: 900 });
  await go(page, '/fleet', 'table');
  check('Nav', 'Sidebar links to Diagnosis Comparison', /Diagnosis Comparison/.test(await text(page, '.sidebar nav')));

  await go(page, '/diagnosis', '#cmp-h');
  let card = await text(page, CARD);
  check('Residual', 'PUMP-04 at alert: flow source headline, B1 → Z995, measured table, derived spread/rank/share', /The flow signal varies more than the pump-equation check can explain; inspect the flow measurement before assuming a mechanical fault\./.test(card)
    && /SENSOR · sensor calibration shift on winding temperature/.test(card) && /SENSOR · sensor noise spikes on flow/.test(card)
    && /60 paired 1 Hz rows of 60/.test(card) && /7\.326 kPa/.test(card) && /not a p-value or probability/.test(card) && /margin 0\.013, narrow/.test(card));
  check('Residual', 'Measured vs calculated chart labelled; not a healthy band', (await page.locator('.rise-chart svg.plot').count()) === 1 && /Measured: Pd − Ps/.test(card) && /Calculated: pump-curve rise/.test(card) && /not a measured healthy band/.test(card));
  check('Footer', 'Route footer names the comparison exporter and its 19 sources', /export_diagnosis_comparison\.py from 19 hashed source files/.test(await text(page, '#provenance-foot')));
  check('Copy', 'Main next check uses "flow"; minute shown as 2025-06-18 22:05–22:06 UTC', /check flow with an independent instrument/.test(card) && !/flow_m3_h/.test(card.split('Technical details')[0]) && /2025-06-18 22:05–22:06 UTC/.test(card));
  check('Disclosure', 'Technical details collapsed by default; labels off by default', await page.locator('#cmp-tech').evaluate((d) => !d.open) && !(await page.isChecked('#cmp-labels')));
  await page.screenshot({ path: `${SHOTS}/01-pump04-at-alert-1440.png` });
  await page.locator(CARD).screenshot({ path: `${SHOTS}/02-pump04-card-1440.png` });
  await page.locator('#cmp-tech > summary').focus(); await page.keyboard.press('Enter');
  const tech = await text(page, '#cmp-tech');
  check('Keyboard', 'Enter opens technical details: verbatim outputs, equation, full rule_detail with covariances', /E995 synchronized residual: minute/.test(tech) && /E = Pd - Ps/.test(tech) && /covariances_kpa2/.test(tech) && /not a confidence in the new cause/.test(tech));
  await page.locator(CARD).screenshot({ path: `${SHOTS}/03-pump04-tech-open-1440.png` });

  await page.click('#cmp-before');
  card = await text(page, CARD);
  check('Gating', '1 s before alert: no result, no chart, no statistics', /has not closed at the replay time/.test(card) && !/noise|flow signal|7\.326|1431|calibration/i.test(card) && (await page.locator('.rise-chart').count()) === 0);
  await page.check('#cmp-labels');
  check('Gating', 'Before alert: opt-in label is withheld', /Not revealed before this case's alert time/.test(await text(page, '.eval-panel')));
  await page.screenshot({ path: `${SHOTS}/04-pump04-before-alert-1440.png` });
  await page.click('#cmp-at');
  const evalAt = await text(page, '.eval-panel');
  check('Labels', 'At alert: opt-in label appears in its own panel; end withheld', /Ground truth/.test(evalAt) && /PUMP-04-E03/.test(evalAt) && /end not revealed/.test(evalAt) && !/PUMP-04-E03/.test(await text(page, CARD)));
  const atHeadline = await text(page, `${CARD} .diag-headline`);
  await page.click('#cmp-p1d');
  check('Later', '+1 day: same historical explanation; timing names the age', (await text(page, `${CARD} .diag-headline`)) === atHeadline && /issued 24 h 0 min before the replay time/.test(await text(page, CARD)));
  check('URL', 'Clock and case are kept in the URL', /#\/diagnosis\?case=pump04-train&t=2025-06-19T22:06:00Z/.test(page.url()));

  await pick(page, 'pump02-train');
  card = await text(page, CARD);
  check('Waveform', 'PUMP-02: consistent with misalignment; older snapshot age; 1x/2x evidence; alignment + second axis check', /consistent with misalignment/.test(card) && /3 h 02 min 10 s/.test(card) && /about 2\.7×/.test(card) && /2\.48/.test(card) && /6 commissioning snapshots/.test(card) && /MATCH/.test(card) && /axial or phase/.test(card));
  await page.locator(CARD).screenshot({ path: `${SHOTS}/05-pump02-card-1440.png` });

  await pick(page, 'pump08-validation');
  check('Copy', 'PUMP-08 before box says cause unresolved (UNKNOWN)', /MACHINE · cause unresolved \(UNKNOWN\)/.test(await text(page, '.cmp-row')));
  check('Disclosure', 'Switching case collapses technical details again', await page.locator('#cmp-tech').evaluate((d) => !d.open));
  await page.click('#cmp-p1d');
  card = (await text(page, CARD)).split('Technical details')[0];   // verbatim rule recommendation lives only in the disclosure
  check('Waveform', 'PUMP-08 (validation) +1 day: bearing pattern, age at alert fixed, age now grows, flow not installed ≠ healthy', /consistent with bearing wear/.test(card) && /3 h 39 min 37 s \(older/.test(card) && /27 h 39 min 37 s/.test(card) && /Flow is not installed/.test(card) && /not a healthy result/.test(card) && !/plan replacement/.test(card));
  await page.locator(CARD).screenshot({ path: `${SHOTS}/06-pump08-later-1440.png` });

  await pick(page, 'pump01-train');
  card = await text(page, CARD);
  check('Copy', 'PUMP-01 main card: human suction label in next check; missing-input wording', /Verify suction pressure against a reference gauge/.test(card.split('Technical details')[0]) && /would supply the missing input; the remaining applicability checks would still need to pass/.test(card));
  check('Unsupported', 'PUMP-01: flow not installed, B1 kept, not assessed ≠ healthy, retrofit link', /flow is not installed on this pump/.test(card) && /kept unchanged/.test(card) && /neither a healthy result nor a proven sensor failure/.test(card) && (await page.locator(`${CARD} a[href="#/pumps/PUMP-01/retrofit"]`).count()) === 1);
  await page.locator(CARD).screenshot({ path: `${SHOTS}/07-pump01-card-1440.png` });

  const sc = await text(page, '[aria-labelledby="sc-h"]');
  check('Scorecard', 'Retrospective: correct type 8→10 / 4→5, sensor T+C 3→4 / 2→2, detected 18 / 8', /Correct fault type \(events\)\s+8\s+10\s+4\s+5/.test(sc) && /correct type and channel\s+3\s+4\s+2\s+2/.test(sc) && /Detected events\s+18\s+18\s+8\s+8/.test(sc) && /not accuracy/.test(sc));
  await page.locator('[aria-labelledby="sc-h"] details').first().locator('summary').click();
  const rows = await page.locator('[aria-labelledby="sc-h"] details tbody tr').count();
  check('Scorecard', 'All 26 train + 9 validation events listed; PUMP-08-E04 missed visible', rows === 35 && /PUMP-08-E04/.test(await text(page, '[aria-labelledby="sc-h"]')), `${rows} rows`);
  await page.screenshot({ path: `${SHOTS}/08-scorecard-1440.png`, fullPage: true });
  check('Overflow', 'No page overflow at 1440', (await overflow(page)) <= 0);

  await go(page, '/diagnosis?case=pump02-train&t=2025-12-07T10:31:59Z', '#cmp-h');
  card = await text(page, CARD);
  check('Gating', 'Deep link 1 s before PUMP-02 alert: pending, snapshot only announced, no interpretation', /has not closed/.test(card) && /PUMP-02-S035\) completed/.test(card) && !/misalignment|2\.48/i.test(card) && !/MISALIGNMENT/.test(await text(page, '.case-pick')));

  await go(page, '/evidence', '#ex-h');
  check('Footer', 'Evidence route keeps the baseline bundle footer', /export_demo\.py/.test(await text(page, '#provenance-foot')));
  const ev = await text(page, 'main');
  check('Evidence', 'Historical scope note links the comparison', /historical rounds up to Task008/.test(ev) && (await page.locator('main a[href="#/diagnosis"]').count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/09-evidence-scope-1440.png` });
  await go(page, '/pumps/PUMP-08?t=2025-09-10T12:38:00Z', '#dx-h');
  check('Regression', 'Baseline pump detail still explains PUMP-08 12:38 (causal B1)', /suction restriction, but the cause is unconfirmed/.test(await text(page, '[aria-labelledby="dx-h"]')));
  check('Boundary', 'No test-asset replay requested', !requests.some((u) => /replay-PUMP-1[0-2]/.test(u)));
  check('Console', 'No console errors (1440)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------- mobile 390 ----------------
{
  const { context, page, errors } = await session({ width: 390, height: 844 });
  await go(page, '/diagnosis', '#cmp-h');
  check('Overflow', 'No page overflow at 390 (PUMP-04 at alert)', (await overflow(page)) <= 0, String(await overflow(page)));
  const legend = await page.locator('.rise-chart .legend li').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  check('Chart', 'Legend labels fully inside the viewport at 390', legend.length === 2 && legend.every((r) => r <= 390), legend.join(','));
  const svgW = await page.locator('.rise-chart svg.plot').evaluate((el) => el.viewBox.baseVal.width);
  const textsFit = await page.locator('.rise-chart svg.plot text').evaluateAll((els) => els.every((t) => { const b = t.getBBox(); return b.x >= -1 && b.x + b.width <= t.ownerSVGElement.viewBox.baseVal.width + 1; }));
  const chartFits = await page.locator('.rise-chart .plot-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth);
  const tableFits = await page.locator(`${CARD} .table-wrap`).first().evaluate((el) => el.scrollWidth <= el.clientWidth);
  check('Chart', 'All SVG text inside the narrow viewBox; chart and measured table need no horizontal scroll at 390', svgW === 300 && textsFit && chartFits && tableFits, `chart ${chartFits}, table ${tableFits}`);
  const nextVisible = await page.locator(`${CARD} h3:has-text("Next engineering check")`).count();
  check('Mobile', 'Next check and its reason are in the default card; technical details collapsed', nextVisible === 1 && /Why: Proposed check/.test(await text(page, CARD)) && await page.locator('#cmp-tech').evaluate((d) => !d.open));
  await page.screenshot({ path: `${SHOTS}/10-pump04-390.png` });
  await page.locator(CARD).screenshot({ path: `${SHOTS}/11-pump04-card-390.png` });
  await page.locator('.rise-chart').screenshot({ path: `${SHOTS}/12-chart-390.png` });
  for (const id of ['pump02-train', 'pump08-validation', 'pump01-train']) {
    await pick(page, id);
    check('Overflow', `No page overflow at 390 (${id})`, (await overflow(page)) <= 0);
  }
  await page.locator(CARD).screenshot({ path: `${SHOTS}/13-pump01-card-390.png` });
  await page.locator('#cmp-tech > summary').focus(); await page.keyboard.press('Enter');
  check('Keyboard', 'Technical details open by keyboard at 390 without page overflow', await page.locator('#cmp-tech').evaluate((d) => d.open) && (await overflow(page)) <= 0);
  await page.click('#cmp-before');
  await page.locator(CARD).screenshot({ path: `${SHOTS}/14-pump01-before-390.png` });
  check('Console', 'No console errors (390)', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(11)} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed`);
