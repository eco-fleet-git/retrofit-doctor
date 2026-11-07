// Task009 browser QA: selected-alert explanation. System Chrome (channel chrome), headless, fresh
// isolated contexts (no user profile, so no user drafts are touched). Usage:
//   python3 -m http.server 8769 --bind 127.0.0.1 -d web &
//   node review/task009/browser-qa.mjs "$PWD/review/task009" > review/task009/browser-qa-result.txt
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
// Full load per route: the app applies ?t= only when the route key changes (same-pump hash edits keep the clock).
const go = async (page, hash, sel) => { await page.goto('about:blank'); await page.goto(`${BASE}#${hash}`); await page.locator(sel).first().waitFor({ state: 'attached' }); };
const text = (page, sel) => page.locator(sel).innerText();
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const top = (page, sel) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
const DX = '[aria-labelledby="dx-h"]';

// ---------------- desktop 1440 ----------------
{
  const { context, page, errors, requests } = await session({ width: 1440, height: 900 });

  await go(page, '/pumps/PUMP-08?t=2025-09-10T12:37:00Z', '#dx-h');
  let dx = await text(page, DX);
  check('P08 12:37', 'Before the alert: no alert, and no alert is not called healthy', /No baseline alert in this visible history/.test(dx) && /does not prove the pump is healthy/.test(dx));
  await page.screenshot({ path: `${SHOTS}/01-p08-1237-1440.png` });

  await go(page, '/pumps/PUMP-08?t=2025-09-10T12:38:00Z', '#dx-tech');
  dx = await text(page, DX);
  check('P08 12:38', 'Headline: suction below reference, suction restriction suggested, unconfirmed', /Suction pressure below this pump's reference; the rule suggests a suction restriction, but the cause is unconfirmed\./.test(dx));
  check('P08 12:38', 'Observed: measured 35.3067 kPa(g) separate from derived causal z −6.71, named in source evidence', /35\.3067 kPa\(g\)/.test(dx) && /causal z −6\.71/.test(dx) && /Named in source evidence/.test(dx));
  check('P08 12:38', 'Flow not installed; wireless vibration installed with no sample at the alert minute', /Not installed on this pump: Flow\./.test(dx) && /4 installed channels have no sample in this minute \(native update every 5 min\): Vibration acceleration RMS, /.test(dx) && /does not establish normal behaviour/.test(dx) && /Not available in any benchmark tier: Differential pressure across the strainer/.test(dx));
  check('P08 12:38', 'No "no vibration"/"rules out" wording; reference not certified healthy; no percentage', !/no vibration|rules? out|ruled out/i.test(dx) && /not verified healthy/.test(dx) && !/%/.test(dx));
  const cardH = await page.locator(DX).evaluate((el) => Math.round(el.getBoundingClientRect().height));
  check('Layout', 'Default P08 card (technical details closed) at most ~650 px tall at 1440', cardH <= 680, `${cardH} px`);
  check('P08 12:38', 'Next check with plain reason; advisory', /Next engineering check/.test(dx) && /Why: Proposed check\./.test(dx) && /Advisory engineering check/.test(dx));
  check('Layout', 'Explanation is above the alert history and the trend', (await top(page, '#dx-h')) < (await top(page, '#al-history')) && (await top(page, '#al-history')) < (await top(page, '#ch-h')));
  const techClosed = await page.locator('#dx-tech').evaluate((d) => !d.open);
  await page.screenshot({ path: `${SHOTS}/02-p08-1238-1440.png` });
  await page.locator(DX).screenshot({ path: `${SHOTS}/03-p08-1238-card-1440.png` });
  // keyboard: Tab to the technical-details summary and open it with Enter
  await page.locator('#dx-tech > summary').focus();
  await page.keyboard.press('Enter');
  const tech = await text(page, '#dx-tech');
  check('Keyboard', 'Technical details closed by default, opened by Enter; verbatim evidence, recommendation, exact score, all-channel table', techClosed && /B1 mode-aware z: suction_pressure_kpa z=-6\.7/.test(tech) && /Inspect \/ clean suction strainer\./.test(tech) && /not a confirmed work order/.test(tech) && /0\.5587501525878906/.test(tech) && /uncalibrated baseline rule score, not a failure probability/.test(tech) && /Which branch fired is not recorded/.test(tech) && /not certified healthy/.test(tech) && /No sample/.test(tech) && /Vibration acceleration RMS: installed \(native update every 5 min\), but no sample in the minute ending 12:38 UTC/.test(tech));
  await page.locator(DX).screenshot({ path: `${SHOTS}/04-p08-tech-open-1440.png` });
  // labels overlay must not change the explanation
  const before = await text(page, DX);
  await page.check('#labels-toggle');
  check('Labels', 'Showing retrospective labels leaves the explanation text unchanged', (await text(page, DX)) === before && /Ground truth/.test(await text(page, '.eval-panel')));
  check('Overflow', 'No page overflow at 1440 (P08 12:38, details open)', (await overflow(page)) <= 0);

  // older selected alert at a later clock
  await go(page, '/pumps/PUMP-08?t=2025-09-11T02:00:00Z', '#al-history');
  await page.locator('#al-history > summary').click();
  await page.locator('[data-alert="2025-09-10T12:38:00Z"]').click();
  dx = await text(page, DX);
  check('Older alert', '12:38 alert selected at 02:00 next day: own minute, age stated', /Issued 2025-09-10 12:38 UTC, 13 h 22 min before the replay time/.test(dx) && /35\.3067 kPa\(g\)/.test(dx));
  const focus = await page.evaluate(() => { const r = document.getElementById('dx-h').getBoundingClientRect(); return { id: document.activeElement?.id, top: Math.round(r.top) }; });
  check('Keyboard', 'Selecting from history moves focus to the explanation heading and scrolls it into view', focus.id === 'dx-h' && focus.top >= 0 && focus.top < 200, JSON.stringify(focus));
  await page.screenshot({ path: `${SHOTS}/05-p08-older-alert-1440.png` });

  // UNKNOWN
  await go(page, '/pumps/PUMP-08?t=2025-09-11T21:00:00Z', '#dx-h');
  dx = await text(page, DX);
  check('UNKNOWN', 'Unresolved; fluid temperature observation; next check present', /Cause unresolved/.test(dx) && /Fluid temperature/.test(dx) && /Next engineering check/.test(dx));
  await page.locator(DX).screenshot({ path: `${SHOTS}/06-p08-unknown-1440.png` });

  // data gap
  await go(page, '/pumps/PUMP-08?t=2025-09-13T00:30:00Z', '#dx-h');
  dx = await text(page, DX);
  check('Gap', 'Communication loss: rows observed, gateway only a hypothesis, no pump-stopped claim', /No telemetry rows in the minute ending 00:07 UTC/.test(dx) && /one hypothesis/.test(dx) && /does not show that the pump stopped/.test(dx) && !/pump (has )?tripped/i.test(dx));
  await page.locator(DX).screenshot({ path: `${SHOTS}/07-p08-gap-1440.png` });

  // PUMP-09 sensor warning
  await go(page, '/pumps/PUMP-09?t=2026-02-11T06:28:00Z', '#dx-h');
  dx = await text(page, DX);
  check('P09 sensor', 'Calibration-shift warning keeps vibration velocity; no motor-current substitution in the explanation', /calibration shift/i.test(dx) && /The detector reports Vibration velocity RMS deviating alone/.test(dx) && /does not confirm a mechanical failure/.test(dx) && !/Motor current|SENSOR_DRIFT/.test(dx.split('Technical details')[0]));
  await page.locator(DX).screenshot({ path: `${SHOTS}/08-p09-sensor-1440.png` });

  // test pump metadata only
  await go(page, '/pumps/PUMP-12', '#sch-h');
  const p12 = await text(page, 'main');
  check('Test pumps', 'PUMP-12 metadata only: no explanation card, no replay request', /Blind test · Metadata only/.test(p12) && (await page.locator('#dx-h').count()) === 0 && !requests.some((u) => /replay-PUMP-1[0-2]/.test(u)));
  await page.screenshot({ path: `${SHOTS}/09-p12-metadata-1440.png` });
  check('Console', 'No console errors (1440)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------- mobile 390 ----------------
{
  const { context, page, errors } = await session({ width: 390, height: 844 });
  await go(page, '/pumps/PUMP-08?t=2025-09-10T12:38:00Z', '#dx-h');
  const order = [await top(page, '#dx-h'), await top(page, '#al-history'), await top(page, '#ch-h'), await top(page, '#sch-h'), await top(page, '#inv-h')];
  check('Mobile', 'Order: explanation → history → trend → schematic → inventory', order.every((v, i) => i === 0 || v > order[i - 1]), order.map(Math.round).join(' < '));
  const hy = await page.locator(`${DX} h3`).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  check('Mobile', 'Headline and step 1 start within the first 1.5 screens', hy < 844 * 1.5, `step1 at ${Math.round(hy)} px`);
  const cardM = await page.locator(DX).evaluate((el) => Math.round(el.getBoundingClientRect().height));
  check('Layout', 'Default P08 card at most ~1300 px tall at 390', cardM <= 1350, `${cardM} px`);
  check('Overflow', 'No page overflow at 390 (P08 12:38)', (await overflow(page)) <= 0, String(await overflow(page)));
  await page.screenshot({ path: `${SHOTS}/10-p08-1238-390.png` });
  await page.locator(DX).screenshot({ path: `${SHOTS}/11-p08-card-390.png` });
  await page.locator('#dx-tech > summary').focus();
  await page.keyboard.press('Enter');
  check('Keyboard', 'Technical details open by keyboard at 390 without page overflow', (await page.locator('#dx-tech').evaluate((d) => d.open)) && (await overflow(page)) <= 0, String(await overflow(page)));
  await page.locator('#dx-tech').screenshot({ path: `${SHOTS}/12-p08-tech-open-390.png` });
  await go(page, '/pumps/PUMP-09?t=2026-02-11T06:28:00Z', '#dx-h');
  check('Overflow', 'No page overflow at 390 (P09 sensor)', (await overflow(page)) <= 0);
  await page.locator(DX).screenshot({ path: `${SHOTS}/13-p09-sensor-390.png` });
  await go(page, '/pumps/PUMP-12', '#sch-h');
  check('Overflow', 'No page overflow at 390 (PUMP-12 metadata)', (await overflow(page)) <= 0);
  check('Console', 'No console errors (390)', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(11)} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed`);
