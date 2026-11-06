// Task006 browser QA: system Chrome (channel chrome), headless, fresh contexts. Usage:
//   node review/task006/browser-qa.mjs "$PWD/review/task006"   (server on 127.0.0.1:8765)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/vladislavlebedev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const SHOTS = process.argv[2];
const BASE = 'http://127.0.0.1:8765/';
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
const go = async (page, hash, sel) => { await page.goto(`${BASE}#${hash}`); await page.locator(sel).first().waitFor(); };
const text = (page, sel) => page.locator(sel).innerText();
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ---------------- desktop ----------------
{
  const { context, page, errors, requests } = await session({ width: 1440, height: 900 });
  await go(page, '/fleet', 'table');
  const nav = await text(page, '.sidebar nav');
  check('Style', 'Sidebar with four destinations', ['Fleet Overview', 'Pump Detail', 'Retrofit Planner', 'Evidence & Validation'].every((t) => nav.includes(t)));
  await page.screenshot({ path: `${SHOTS}/01-fleet-1440.png` });

  // Useful alert + schematic
  await go(page, '/pumps/PUMP-08?t=2025-09-10T12:38:00Z', '#ev-h');
  const ev = await text(page, '[aria-labelledby="ev-h"]');
  check('Demo', 'PUMP-08 12:38: strainer alert with verbatim evidence and rule confidence', /B1 mode-aware z: suction_pressure_kpa z=-6\.7/.test(ev) && /Uncalibrated baseline score/.test(ev));
  await page.focus('#sch-suction'); await page.keyboard.press('Enter');
  let det = await text(page, '#sch-detail');
  check('Schematic', 'Keyboard Enter on suction point shows channel, cadence, source and caveat', /suction_pressure_kpa/.test(det) && /native update 1 s/.test(det) && /PLC input/.test(det) && /not a strainer or heat-exchanger differential pressure/.test(det) && /Discharge minus suction pressure is the measured pump pressure rise/.test(det) && !/Suction minus discharge/.test(det));
  await page.click('#sch-vibration');
  det = await text(page, '#sch-detail');
  check('Schematic', 'Vibration point: three summary features, 5 min wireless cadence, not waveforms, not every bearing', /vibration_rms_mm_s/.test(det) && /native update 5 min/.test(det) && /Wireless retrofit sensor/.test(det) && /not waveforms/.test(det) && /does not cover every bearing/.test(det));
  const flowLabel = await page.getAttribute('#sch-flow', 'aria-label');
  const fluidLabel = await page.getAttribute('#sch-fluid', 'aria-label');
  check('Schematic', 'Absent flow and unspecified fluid-temperature location are labelled in text', /Not instrumented/.test(flowLabel) && /location not specified/.test(fluidLabel));
  await page.locator('[aria-labelledby="sch-h"]').screenshot({ path: `${SHOTS}/02-schematic-pump08-1440.png` });
  await page.screenshot({ path: `${SHOTS}/03-pump08-alert-1440.png` });
  // backward clock isolation
  await page.click('#back-m');
  check('Replay', 'Stepping back from 12:38 removes the alert (no future leakage)', /No baseline alert in this visible history/.test(await text(page, 'main')));

  // Unresolved diagnosis PUMP-09-E04
  await go(page, '/pumps/PUMP-09?t=2026-02-11T06:28:00Z', '#ev-h');
  check('Demo', 'PUMP-09 at 2026-02-11 06:28: calibration-shift alert on vibration channel visible', /SENSOR_CALIBRATION_SHIFT/.test(await text(page, '[aria-labelledby="ev-h"]')));

  // Test pump metadata only
  await go(page, '/pumps/PUMP-12', '#sch-h');
  const p12 = await text(page, 'main');
  const speed = await page.getAttribute('#sch-speed', 'aria-label');
  check('Test pumps', 'PUMP-12: metadata only, measured speed not instrumented, no replay request', /Blind test · Metadata only/.test(p12) && /Not instrumented/.test(speed) && !requests.some((u) => /replay-PUMP-1[0-2]/.test(u)));
  await page.screenshot({ path: `${SHOTS}/04-pump12-metadata-1440.png` });

  // Evidence
  await go(page, '/evidence', '#ab-h');
  const ab = await text(page, '[aria-labelledby="ab-h"]');
  check('Evidence', 'Ablation: original denominator, full vs masked, restore check, adverse case, no field-benefit claim', /Train \(PUMP-02, PUMP-04, PUMP-07\) · 10 events/.test(ab) && /Adverse: detected only when masked PUMP-04-E04/.test(ab) && /restored = full on 3 asset/.test(ab) && /not field benefit/.test(ab));
  const b2 = await text(page, '[aria-labelledby="b2-h"]');
  check('Evidence', 'B2: candidates rejected with burden and denominator; invalid r1 disclosed', /C1\s+Rejected\s+21\/26/.test(b2) && /21 \(11 \+ 10\)/.test(b2) && /causal-b2-v1-train-r1: INVALID/.test(b2));
  const e3 = await text(page, '[aria-labelledby="e3-h"]');
  check('Evidence', 'E3 rejected / validation not run; E4 shown as not testable', /Validation was not run/.test(e3) && /Not testable/.test(e3));
  const evid = await text(page, 'main');
  check('Evidence', 'Original-vs-causal B1 comparison retained; no accuracy claim', /76\.01/.test(evid) && /78\.01/.test(evid) && /not accuracy/.test(evid));
  await page.locator('[aria-labelledby="ab-h"]').screenshot({ path: `${SHOTS}/05-evidence-ablation-1440.png` });
  await page.screenshot({ path: `${SHOTS}/06-evidence-1440.png`, fullPage: true });

  // Empty draft (no path) must wrap inside its cards at 1440 and 1280
  for (const w of [1440, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await go(page, '/pumps/PUMP-09/retrofit', '#pl-sum');
    const fits = await page.evaluate(() => [...document.querySelectorAll('[aria-labelledby="pl-status"] .state, [aria-labelledby="pl-sum"] .state')].every((b) => {
      const card = b.closest('.panel').getBoundingClientRect(); const r = b.getBoundingClientRect(); return r.right <= card.right + 0.5; }));
    check('Planner', `Empty draft status wraps inside cards at ${w}`, fits && (await overflow(page)) === 0);
    await page.screenshot({ path: `${SHOTS}/08a-planner-empty-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // Planner: compact first screen
  await go(page, '/pumps/PUMP-08/retrofit', '#pl-sum');
  const editorClosed = !(await page.locator('#pl-editor').evaluate((d) => d.open));
  await page.selectOption('#cand-add-sel', 'vibration'); await page.click('#cand-add');
  await page.selectOption('#cand-add-sel', 'flow_head_power'); await page.click('#cand-add');
  const flowPlanner = await page.getAttribute('#psch-flow', 'aria-label');
  check('Schematic', 'Planner flow hypothesis is drawn as Proposed, never installed', /Proposed \(hypothesis\)/.test(flowPlanner));
  let prop = await text(page, '[aria-labelledby="pl-arch"]');
  check('Proposal', 'Physical proposal lists proposed point, survey items, gateway to select; not part of demo', /Flow meter \(clamp-on or inline\)/.test(prop) && /To select after survey/.test(prop) && /not part of this demo/.test(prop) && /no edge deployment/.test(prop));
  check('Proposal', 'PUMP-08 flow package reuses existing pressures and VFD power, adds tap/head corrections, no new power meter',
    /Existing suction pressure transmitter \(PLC input\)\s+Present · reuse where verified/.test(prop) && /Existing discharge pressure transmitter/.test(prop)
    && /Existing motor input power reading \(VFD\)\s+Present/.test(prop) && /head corrections \(density, elevation, velocity\)/.test(prop) && !/Power meter on the motor supply/.test(prop));
  const statusVisible = await page.evaluate(() => {
    const panel = document.querySelector('[aria-labelledby="pl-arch"]').getBoundingClientRect();
    return [...document.querySelectorAll('ul.phys li')].every((li) => { const p = li.querySelector('.state').getBoundingClientRect(); return p.right <= panel.right && p.right <= window.innerWidth && p.width > 0; });
  });
  check('Proposal', 'Every physical element shows its status in view without sideways scrolling (1440)', statusVisible && (await overflow(page)) === 0);
  await page.locator('[aria-labelledby="pl-arch"]').screenshot({ path: `${SHOTS}/07-proposal-flow-1440.png` });
  await page.check('#choice-defer');
  const flowDefer = await page.getAttribute('#psch-flow', 'aria-label');
  const propDefer = await text(page, '[aria-labelledby="pl-arch"]');
  check('Proposal', 'Defer: no proposed markers, diagram says no new point, stored flow hypothesis kept as unselected',
    /Not instrumented/.test(flowDefer) && /no new measurement point \(decision: Defer permanent retrofit\)/.test(propDefer)
    && /Stored hypotheses not part of this decision.*Flow plus head and input power/s.test(propDefer) && !/Mounting, power, cables/.test(propDefer)
    && (await page.locator('[data-remove="flow_head_power"]').count()) === 1);
  await page.locator('[aria-labelledby="pl-arch"]').screenshot({ path: `${SHOTS}/07b-proposal-defer-1440.png` });
  await page.click('#cand-rm-flow_head_power');
  await page.click('#pl-preset'); if (await page.locator('#pl-confirm-yes').count()) await page.click('#pl-confirm-yes');
  const sum = await text(page, '[aria-labelledby="pl-sum"]');
  check('Planner', 'First screen: defer decision, negative economics, ablation evidence, next action; editor collapsed', editorClosed && /Defer permanent retrofit/.test(sum) && /Defer under current assumptions/.test(sum) && /−EUR 2,200/.test(sum) && /−EUR 15,500/.test(sum) && /masked 8 \/ 0/.test(sum) && /Answer:/.test(sum));
  prop = await text(page, '[aria-labelledby="pl-arch"]');
  check('Proposal', 'Defer outcome states no permanent device', /No permanent device proposed/.test(prop));
  const sumBox = await page.locator('[aria-labelledby="pl-sum"]').boundingBox();
  check('Planner', 'Decision summary fits in the first 900 px screen', sumBox && sumBox.y + sumBox.height <= 900, JSON.stringify(sumBox));
  await page.screenshot({ path: `${SHOTS}/08-planner-first-screen-1440.png` });
  // hidden invalid field discoverable via summary
  await page.click('#pl-editor > summary');
  await page.fill('#pl-u', '1.5'); await page.press('#pl-u', 'Tab');
  await page.click('#pl-editor > summary');
  const errSum = await text(page, '[aria-labelledby="pl-errs"]');
  await page.click('#err-go-0');
  const focused = await page.evaluate(() => document.activeElement?.id);
  const reopened = await page.locator('#pl-editor').evaluate((d) => d.open);
  check('Planner', 'Hidden invalid field: error summary names it; Go to field opens editor and focuses it', /benefit · u: Must be at most 1/.test(errSum) && focused === 'pl-u' && reopened);
  await page.locator('[aria-labelledby="pl-errs"]').screenshot({ path: `${SHOTS}/09-error-summary-1440.png` });
  await page.fill('#pl-u', '0.5'); await page.press('#pl-u', 'Tab');
  await page.click('#pl-save');
  await page.reload(); await page.locator('#pl-sum').waitFor();
  check('Storage', 'Reload keeps defer + preset economics in summary', /Defer permanent retrofit/.test(await text(page, '[aria-labelledby="pl-sum"]')) && /−EUR 15,500/.test(await text(page, '[aria-labelledby="pl-sum"]')));
  await page.screenshot({ path: `${SHOTS}/10-planner-full-1440.png`, fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  check('Planner', 'Planner shorter than the 7,356 px Task003 review measurement (editor collapsed)', height < 7356, `${height}px with one hypothesis card and defer answers open`);

  // Keyboard through sidebar
  await page.goto(`${BASE}?fresh=1#/fleet`); await page.locator('table').waitFor(); // full page load
  await page.keyboard.press('Tab'); // skip link
  const seen = [];
  for (let i = 0; i < 5; i += 1) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => document.activeElement?.textContent?.trim().split('\n')[0])); }
  check('Keyboard', 'Tab reaches the sidebar destinations', ['Fleet Overview', 'Evidence & Validation'].every((t) => seen.some((s) => s?.startsWith(t))), seen.join(' | '));
  check('Overflow', 'No horizontal page overflow at 1440 on visited pages', (await overflow(page)) === 0);
  check('Console', 'No console errors (desktop)', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------- narrow ----------------
{
  const { context, page, errors } = await session({ width: 390, height: 844 });
  const ofs = {};
  for (const [hash, sel, name] of [['/fleet', 'table', 'fleet'], ['/pumps/PUMP-08?t=2025-09-10T12:38:00Z', '#ev-h', 'pump'], ['/pumps/PUMP-08/retrofit', '#pl-sum', 'planner'], ['/evidence', '#ab-h', 'evidence']]) {
    await go(page, hash, sel); ofs[name] = await overflow(page);
    await page.screenshot({ path: `${SHOTS}/11-${name}-390.png`, fullPage: name !== 'evidence' });
  }
  check('Narrow', '390 px: no page overflow on four views', Object.values(ofs).every((v) => v === 0), JSON.stringify(ofs));
  await go(page, '/pumps/PUMP-08?t=2025-09-10T12:38:00Z', '.chart svg');
  // Effective rendered font = SVG font-size × (rendered width / viewBox width). Box height is not a font size.
  const eff = (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].map((t) => {
    const svg = t.ownerSVGElement; const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return parseFloat(getComputedStyle(t).fontSize || t.getAttribute('font-size')) * scale;
  }), sel);
  const chartFonts = await eff('.chart svg text');
  check('Narrow', 'Chart title, axes and As-of text ≥ 11 CSS px at 390 (no viewBox shrink)', Math.min(...chartFonts) >= 10.9, `min ${Math.min(...chartFonts).toFixed(1)} px`);
  const xTicks = await page.evaluate(() => [...document.querySelector('.chart svg').querySelectorAll('text')].filter((t) => /^\d\d-\d\d \d\d:\d\d$/.test(t.textContent)).length);
  check('Narrow', 'Three x-axis ticks or fewer at 390', xTicks <= 3, `${xTicks}`);
  const schLabels = await eff('.schematic .sch-label');
  const schCodes = await eff('.schematic .mk-code, .schematic .mk-code-on');
  const target = await page.evaluate(() => document.querySelector('#sch-suction').getBoundingClientRect().width);
  check('Narrow', 'Schematic labels ≥ 12 px, point codes ≥ 10 px, tap targets ≥ 24 px inside own scroller', Math.min(...schLabels) >= 12 && Math.min(...schCodes) >= 10 && target >= 24, `labels ${Math.min(...schLabels).toFixed(1)} codes ${Math.min(...schCodes).toFixed(1)} target ${target.toFixed(0)}`);
  check('Narrow', 'Schematic scroll region contained (page has no overflow)', (await overflow(page)) === 0);
  await page.locator('section.chart').screenshot({ path: `${SHOTS}/12-chart-390.png` });
  await page.locator('[aria-labelledby="sch-h"]').screenshot({ path: `${SHOTS}/13-schematic-390.png` });
  check('Console', 'No console errors (390 px)', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(10)} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed`);
