// Task 003 browser QA. Existing Chrome (channel chrome), headless, fresh isolated contexts.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/Users/vladislavlebedev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const SHOTS = process.argv[2];
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://127.0.0.1:8765/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [];
const check = (id, name, pass, detail = '') => checks.push({ id, name, pass: !!pass, detail });

async function newPage(viewport = { width: 1440, height: 900 }, init) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { context, page, errors };
}
const commit = async (page, sel, value) => { await page.fill(sel, value); await page.press(sel, 'Tab'); await page.waitForTimeout(80); };
const text = (page, sel) => page.locator(sel).innerText();
const planner = async (page, id) => { await page.goto(`${BASE}#/pumps/${id}/retrofit`); await page.locator('#pl-status').waitFor(); };

// ---------- main desktop session ----------
const { context, page, errors } = await newPage();
await page.goto(`${BASE}#/pumps/PUMP-08?t=2025-09-10T12:38:00Z`);
await page.locator('#inv-h').waitFor();
const invBefore = await text(page, '[aria-label="Sensor inventory"]');
const alertsBefore = await text(page, '#al-h');

await planner(page, 'PUMP-08');
const res0 = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-06/07', 'Empty model: incomplete costs, benefit not estimated, no NPV', /Cost estimate incomplete/.test(res0) && /Known cost subtotal EUR 0/.test(res0) && /Benefit not estimated/.test(res0) && !/NPV[^\n]*EUR/.test(res0));
await page.screenshot({ path: `${SHOTS}/01-planner-empty-1440.png`, fullPage: true });

// ENG-01 three choices + defer
const choiceText = await text(page, '[aria-labelledby="pl-choice"]');
check('ENG-01', 'Three options plus defer with decision/burden/when', ['Use existing signals', 'Assess minimal retrofit', 'Assess instrument-grade measurement', 'Defer permanent retrofit'].every((t) => choiceText.includes(t)) && /Burden: Export rights/.test(choiceText));
const existingTab = await (async () => { await page.click('#tab-existing'); return text(page, '[aria-labelledby="pl-edit"]'); })();
check('ENG-01', 'Existing-only has integration cost fields', /OT integration/.test(existingTab) && /Existing-only still has integration/.test(existingTab));
await page.click('#tab-minimal');

// ENG-02/03/04 add & remove candidates
await page.selectOption('#cand-add-sel', 'flow_head_power');
await page.click('#cand-add');
const flowCard = await text(page, '[aria-labelledby="cand-flow_head_power-h"]');
check('ENG-03', 'Flow candidate requires survey, no trace/efficiency claim, no exchanger location from pump taps', /survey required/.test(flowCard) && /cannot locate a heat-exchanger restriction/i.test(flowCard) && /No flow trace or efficiency figure is simulated/.test(flowCard) && /Hypothesis/.test(flowCard));
await page.selectOption('#cand-add-sel', 'vibration');
await page.click('#cand-add');
const vibCard = await text(page, '[aria-labelledby="cand-vibration-h"]');
check('ENG-04', 'Vibration: location/direction, mounting, bandwidth, cadence separate; no unique fault promise', ['location and direction', 'Rigid mounting', 'bandwidth and feature window', 'Update cadence'].every((t) => vibCard.includes(t)) && /not a unique fault identification/.test(vibCard) && /does not cover every bearing/.test(vibCard));
await page.screenshot({ path: `${SHOTS}/02-candidates-1440.png`, fullPage: true });
await page.click('#cand-rm-vibration');
const afterRemove = await text(page, '[aria-labelledby="pl-cand"]');
check('ENG-02', 'Removing one candidate keeps the other', /Flow plus head and input power/.test(afterRemove) && !/Bearing-housing vibration and temperature Hypothesis/.test(afterRemove));

// ENG-15 not assessed → Needs evidence
await page.check('#choice-minimal');
let status = await text(page, '[aria-labelledby="pl-status"]');
check('ENG-15', 'Not assessed answers → Needs evidence, no Ready', /Needs evidence/.test(status) && !/Ready for engineering review/.test(status));

// ENG-08 preset (confirm because economics untouched? empty → loads directly)
await page.click('#pl-preset');
if (await page.locator('#pl-confirm-yes').count()) await page.click('#pl-confirm-yes');
const res = await text(page, '[aria-labelledby="pl-res"]');
const want = ['EUR 4,500', 'EUR 300', '−EUR 1,800', '−EUR 700', '−EUR 2,200', 'EUR 17,000', 'EUR 1,500', '−EUR 15,500', 'No simple payback under these assumptions', '3.4 events/year', 'Defer under current assumptions'];
const miss = want.filter((w) => !res.includes(w));
check('ENG-08', 'Preset renders every fixture result with illustrative label', miss.length === 0 && /Hypothetical redundant pump/.test(res) && /no claim that the selected pump has a standby/.test(res), miss.join(', '));
check('ENG-09', 'Zero-nuisance sensitivity shown', /−EUR 400\/year · NPV −EUR 6,500/.test(res));
await page.locator('[aria-labelledby="pl-res"]').screenshot({ path: `${SHOTS}/03-preset-results-1440.png` });

// ENG-09 direct: set n=0
await commit(page, '#pl-n', '0');
let r2 = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-09', 'n = 0: annual net −EUR 400, NPV −EUR 6,500, no payback', /Annual net effect\s+−EUR 400/.test(r2) && /incremental NPV\s+−EUR 6,500/.test(r2) && /No simple payback/.test(r2));
await page.locator('[aria-labelledby="pl-res"]').screenshot({ path: `${SHOTS}/04-zero-nuisance-1440.png` });
await commit(page, '#pl-n', '24');

// ENG-10 u = 0
await commit(page, '#pl-u', '0');
r2 = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-10', 'u = 0: benefit EUR 0, net −EUR 2,500, NPV −EUR 17,000, no finite break-even, no NaN', /Annual incremental benefit\s+EUR 0/.test(r2) && /−EUR 2,500/.test(r2) && /NPV\s+−EUR 17,000/.test(r2) && /No finite event-rate break-even/.test(r2) && !/NaN|Infinity/.test(r2));
await commit(page, '#pl-u', '0.5');

// ENG-11 invalid inputs keep the draft
await commit(page, '#pl-u', '1.2');
await commit(page, '#pl-H', '2.5');
const uVal = await page.inputValue('#pl-u');
const errText = await text(page, '[aria-labelledby="pl-edit"]');
r2 = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-11', 'Invalid u and H show inline errors, raw values kept, NPV not estimated', uVal === '1.2' && /Must be at most 1/.test(errText) && /Must be a whole number/.test(errText) && /invalid entr/.test(r2) && /NPV\s+Not estimated/.test(r2));
await page.locator('[aria-labelledby="pl-edit"]').screenshot({ path: `${SHOTS}/05-invalid-inputs-1440.png` });
await commit(page, '#pl-u', '0.5');
await commit(page, '#pl-H', '5');

// ENG-06 blank essential cost
await commit(page, '#ln-minimal-installation_labour-u', '');
r2 = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-06', 'Blank installation labour → Cost estimate incomplete, known subtotal EUR 3,300', /Known cost subtotal EUR 3,300/.test(r2) && /NPV\s+Not estimated/.test(r2));
await commit(page, '#ln-minimal-installation_labour-u', '1200');

// ENG-12 currency
await page.selectOption('#ln-minimal-sensors-cur', 'NOK');
await page.waitForTimeout(80);
r2 = await text(page, '[aria-labelledby="pl-res"]');
const ed = await text(page, '[aria-labelledby="pl-edit"]');
check('ENG-12', 'NOK line without dated conversion is excluded, not summed', /Currency NOK differs from EUR/.test(ed) && /Cost estimate incomplete/.test(r2));
await page.selectOption('#ln-minimal-sensors-cur', 'EUR');
const bom = await page.locator('details summary', { hasText: 'Historical organizer price example' }).count();
await page.click('summary:has-text("Historical organizer price example")');
const bomText = await text(page, 'details:has(summary:has-text("Historical organizer"))');
check('ENG-12', 'Organizer BOM dated 30 Oct 2026, hardware only, not quotes', bom === 1 && /30 October 2026/.test(bomText) && /hardware only/.test(bomText) && /not independently re-quoted/.test(bomText));

// ENG-13 copy
const pageText = await page.locator('main').innerText();
check('ENG-13', 'Architecture separate from replay; no secure/certified/approved conclusion', /not an edge implementation/.test(pageText) && /No secure, certified or class-approved conclusion/.test(pageText) && !/\b(Approved|Certified|Guaranteed saving)\b/.test(pageText.replace(/certified or class-approved|not a design, economic or compliance approval|not an approval/g, '')));
check('ENG-17', 'Baseline named, sunk excluded, bundled lines referenced', /Baseline: Existing practice/.test(pageText) && /Sunk existing equipment excluded/.test(pageText) && /Bundled in sensor package/.test(await page.locator('#ln-minimal-mounts-note').inputValue()));

// ENG-18 positive case
await commit(page, '#pl-lambda', '3');
await commit(page, '#pl-n', '0');
r2 = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-18', 'Positive case → Candidate for engineering review + simple payback; no approval wording', /Candidate for engineering review/.test(r2) && /Simple payback 2\.0 years/.test(r2) && !/Approved/.test(r2));
await page.click('#sc-add');
await commit(page, '#sc-minimal-0-y', '2');
await commit(page, '#sc-minimal-0-c', '3000');
r2 = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-18', 'Scheduled cost → cumulative recovery year, no level-flow payback', /Cumulative recovery in year 4/.test(r2) && !/Simple payback/.test(r2));
await page.click('#sc-rm-minimal-0');
await commit(page, '#pl-lambda', '0.3');
await commit(page, '#pl-n', '24');

// Choose defer, answer questions → Ready while economics stays Defer
await page.check('#choice-defer');
await page.fill('#pl-notes', 'Illustrative case; standby readiness unverified. Source: COST_MODEL_SPEC v1.');
await page.press('#pl-notes', 'Tab');
await page.click('#cand-rm-flow_head_power');
for (const sel of await page.locator('[data-answer][data-field="state"]').all()) { await sel.selectOption('drafted'); }
for (const inp of await page.locator('[data-answer][data-field="text"]').all()) { await inp.fill('Draft: to confirm on site survey'); await inp.press('Tab'); }
status = await text(page, '[aria-labelledby="pl-status"]');
check('ENG-15', 'Drafted answers → Ready for engineering review, separate from economic Defer; no Certified/Installed', /Ready for engineering review/.test(status) && /Defer under current assumptions/.test(status) && !/Certified|Installed/.test(status));

// Save, reload, switch pump
await page.click('#pl-save');
const saved = await text(page, '[aria-labelledby="pl-status"]');
await page.screenshot({ path: `${SHOTS}/06-saved-defer-1440.png`, fullPage: true });
await page.reload(); await page.locator('#pl-status').waitFor();
const reloaded = await text(page, '[aria-labelledby="pl-status"]');
const reloadedRes = await text(page, '[aria-labelledby="pl-res"]');
const notesVal = await page.inputValue('#pl-notes');
check('ENG-14', 'Save → reload keeps choice, notes, preset values, readiness and saved date', /Draft saved in this browser/.test(saved) && /Defer permanent retrofit/.test(reloaded) && /Ready for engineering review/.test(reloaded) && /−EUR 15,500/.test(reloadedRes) && notesVal.startsWith('Illustrative case') && /Last saved\s+2026|Last saved\s+\d{4}-/.test(reloaded));
await planner(page, 'PUMP-09');
const p09 = await text(page, '[aria-labelledby="pl-status"]');
const p09res = await text(page, '[aria-labelledby="pl-res"]');
check('ENG-14', 'PUMP-09 draft is independent (empty, not saved)', /Not saved in this browser/.test(p09) && /Select an option to prepare a draft/.test(p09) && !/15,500/.test(p09res));
await page.check('#choice-existing');
await planner(page, 'PUMP-08');
check('ENG-14', 'Switching back keeps PUMP-08 state; unsaved PUMP-09 edit held in memory', /Defer permanent retrofit/.test(await text(page, '[aria-labelledby="pl-status"]')));
await planner(page, 'PUMP-09');
check('ENG-14', 'Unsaved PUMP-09 edit kept in this tab with Unsaved marker', /Use existing signals/.test(await text(page, '[aria-labelledby="pl-status"]')) && /Unsaved changes/.test(await text(page, '[aria-labelledby="pl-status"]')));

// ENG-02 replay/inventory unchanged after planner edits
await page.goto(`${BASE}#/pumps/PUMP-08?t=2025-09-10T12:38:00Z`);
await page.locator('#inv-h').waitFor();
check('ENG-02', 'Pump Detail inventory and alerts unchanged after planner edits', invBefore === await text(page, '[aria-label="Sensor inventory"]') && alertsBefore === await text(page, '#al-h'));

// Reset with confirmation
await planner(page, 'PUMP-08');
await page.click('#pl-reset');
const confirmShown = await page.locator('#pl-confirm-yes').isVisible();
const focusNo = await page.evaluate(() => document.activeElement?.id);
await page.click('#pl-confirm-no');
const stillDefer = /Defer permanent retrofit/.test(await text(page, '[aria-labelledby="pl-status"]'));
await page.click('#pl-reset'); await page.click('#pl-confirm-yes');
const afterReset = await text(page, '[aria-labelledby="pl-status"]');
const storedAfterReset = await page.evaluate(() => localStorage.getItem('retrofit-doctor.planner.PUMP-08'));
check('Reset', 'Reset asks for confirmation (focus on Keep editing); confirm removes saved draft', confirmShown && focusNo === 'pl-confirm-no' && stillDefer && /Draft discarded/.test(afterReset) && storedAfterReset === null);

// ENG-05 test pump
await planner(page, 'PUMP-12');
const p12 = await page.locator('main').innerText();
check('ENG-05', 'PUMP-12 planner: metadata only, fixed speed rpm not measured', /Blind test · Metadata only/.test(p12) && /no measured speed; rated 2935 rpm is passport metadata, not a measurement/.test(p12) && !/duty\/standby pair(ed|ing) with/i.test(p12));

// ENG-16 offline: go offline after load; planner still works, save works
await planner(page, 'PUMP-10');
await context.setOffline(true);
await page.check('#choice-defer');
await page.click('#pl-preset');
await page.click('#pl-save');
const off = await text(page, '[aria-labelledby="pl-status"]');
check('ENG-16', 'Offline after load: preset, edit and local save work', /Draft saved in this browser/.test(off) && /−EUR 15,500/.test(await text(page, '[aria-labelledby="pl-res"]')));
await context.setOffline(false);

// Keyboard: reach Save with Tab and activate with Enter on a fresh pump
await planner(page, 'PUMP-11');
await page.focus('#choice-existing');
await page.keyboard.press('Space');
await page.focus('#pl-notes');
let reached = false;
for (let i = 0; i < 6 && !reached; i += 1) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.id === 'pl-save'); }
const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
await page.keyboard.press('Enter');
check('Keyboard', 'Radio by Space, Tab reaches Save with visible focus, Enter saves', reached && outline !== 'none' && /Draft saved in this browser/.test(await text(page, '[aria-labelledby="pl-status"]')) && /Use existing signals/.test(await text(page, '[aria-labelledby="pl-status"]')));
check('Console', 'No console errors in main session', errors.length === 0, errors.join(' | '));
await context.close();

// ---------- storage failure ----------
{
  const { context: c2, page: p2, errors: e2 } = await newPage({ width: 1440, height: 900 }, () => {
    Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded (test double)', 'QuotaExceededError'); };
  });
  await planner(p2, 'PUMP-08');
  await p2.check('#choice-minimal');
  await p2.fill('#pl-notes', 'must survive failed save'); await p2.press('#pl-notes', 'Tab');
  await p2.click('#pl-save');
  const st = await text(p2, '[aria-labelledby="pl-status"]');
  check('ENG-14', 'Failed storage → actionable error, edits kept, no success shown', /Draft could not be saved/.test(st) && /edits are kept in this tab/.test(st) && !/Draft saved in this browser/.test(st) && (await p2.inputValue('#pl-notes')) === 'must survive failed save' && /Not saved in this browser/.test(st));
  await p2.locator('[aria-labelledby="pl-status"]').screenshot({ path: `${SHOTS}/07-storage-failure-1440.png` });
  check('Console', 'No console errors in storage-failure session', e2.length === 0, e2.join(' | '));
  await c2.close();
}

// ---------- narrow ----------
{
  const { context: c3, page: p3, errors: e3 } = await newPage({ width: 390, height: 844 });
  await planner(p3, 'PUMP-08');
  await p3.click('#pl-preset');
  await commit(p3, '#pl-u', '1.5');
  const overflow = await p3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const errVisible = await p3.locator('#pl-u-err').isVisible();
  const box = await p3.locator('#pl-u-err').boundingBox();
  check('Narrow', '390 px: no page overflow; inline numeric error visible within viewport', overflow === 0 && errVisible && box && box.x >= 0 && box.x + box.width <= 390, `overflow ${overflow}px`);
  await p3.screenshot({ path: `${SHOTS}/08-planner-390.png`, fullPage: true });
  await p3.locator('[aria-labelledby="pl-res"]').screenshot({ path: `${SHOTS}/09-results-390.png` });
  check('Console', 'No console errors at 390 px', e3.length === 0, e3.join(' | '));
  await c3.close();
}

// ---------- provenance, quote and allocation ----------
{
  const { context: c4, page: p4, errors: e4 } = await newPage();
  await planner(p4, 'PUMP-09');
  await p4.click('#pl-preset');
  const today = new Date().toISOString().slice(0, 10);
  await commit(p4, '#ln-minimal-sensors-u', '1500');
  const prov = await p4.locator('#ln-minimal-sensors-basis').inputValue();
  const row = await p4.locator('tr:has(#ln-minimal-sensors-u)').innerText();
  const res = await text(p4, '[aria-labelledby="pl-res"]');
  check('Provenance', 'Edited preset value → user assumption, entry date today, original source and value preserved, total 4,800', prov === 'user assumption' && row.includes(`Entered: ${today}`) && /Original: illustrative assumption · COST_MODEL_SPEC v1 negative preset · 2026-11-06 · 1 × 1200 EUR/.test(row) && /EUR 4,800/.test(res));
  await commit(p4, '#ln-minimal-sensors-src', 'Site estimate by reviewer, sheet R-2');
  await p4.fill('#ln-minimal-sensors-sd', '2026-11-05'); await p4.press('#ln-minimal-sensors-sd', 'Tab');
  await p4.selectOption('#ln-minimal-sensors-basis', 'site estimate');
  await commit(p4, '#pl-lambda', '0.6');
  const benefitProv = await p4.locator('[aria-label="benefit assumptions provenance"]').innerText();
  check('Provenance', 'Benefit group edit → user assumption with entry date and original λ=0.3 kept', (await p4.locator('#gp-minimal-benefit-b').inputValue()) === 'user assumption' && benefitProv.includes(`Entered: ${today}`) && /lambda=0\.3/.test(benefitProv));
  await commit(p4, '#pl-lambda', '0.3');
  // supplier quote needs scope / validity / tax basis
  await p4.selectOption('#ln-minimal-installation_labour-basis', 'supplier quote');
  await p4.waitForTimeout(80);
  let ed = await text(p4, '[aria-labelledby="pl-edit"]');
  check('Provenance', 'Supplier quote without scope/validity/tax basis is excluded', /Supplier quote needs scope, validity and tax basis/.test(ed) && /Cost estimate incomplete/.test(await text(p4, '[aria-labelledby="pl-res"]')));
  await commit(p4, '#ln-minimal-installation_labour-qs', 'Mount and cable one point');
  await p4.fill('#ln-minimal-installation_labour-qv', '2026-12-31'); await p4.press('#ln-minimal-installation_labour-qv', 'Tab');
  await commit(p4, '#ln-minimal-installation_labour-qt', 'excl. VAT');
  check('Provenance', 'Completed quote fields → summed again (EUR 4,800)', /Minimal retrofit\s+EUR 4,800/.test(await text(p4, '[aria-labelledby="pl-res"]')));
  // allocation
  await commit(p4, '#ln-minimal-gateway-pt', '200');
  ed = await text(p4, '[aria-labelledby="pl-edit"]');
  const allocErr = /Allocated amount exceeds the project total/.test(ed);
  await commit(p4, '#ln-minimal-gateway-pt', '1200');
  ed = await text(p4, '[aria-labelledby="pl-edit"]');
  check('Allocation', 'Project total editable; allocation above total rejected; cross-pump sums disclosed as unchecked', allocErr && !/Allocated amount exceeds/.test(ed) && /Allocations across other pumps are not checked here/.test(ed));
  check('Allocation', 'Entering a project total relabels the line as user assumption with original kept', (await p4.locator('#ln-minimal-gateway-basis').inputValue()) === 'user assumption' && /Original: illustrative assumption/.test(await p4.locator('tr:has(#ln-minimal-gateway-u)').innerText()));
  await p4.locator('tr:has(#ln-minimal-sensors-u)').screenshot({ path: `${SHOTS}/10-provenance-row-1440.png` });
  await p4.locator('tr:has(#ln-minimal-gateway-u)').screenshot({ path: `${SHOTS}/11-allocation-row-1440.png` });
  await p4.click('#pl-save');
  await p4.reload(); await p4.locator('#pl-status').waitFor();
  const row2 = await p4.locator('tr:has(#ln-minimal-sensors-u)').innerText();
  check('Provenance', 'Source, source date, basis, original and project total persist after save + reload',
    (await p4.locator('#ln-minimal-sensors-basis').inputValue()) === 'site estimate' && (await p4.inputValue('#ln-minimal-sensors-src')) === 'Site estimate by reviewer, sheet R-2'
    && (await p4.inputValue('#ln-minimal-sensors-sd')) === '2026-11-05' && /Original: illustrative assumption/.test(row2) && (await p4.inputValue('#ln-minimal-gateway-pt')) === '1200');
  check('Console', 'No console errors in provenance session', e4.length === 0, e4.join(' | '));
  await c4.close();
}

// ---------- review round 1 regressions ----------
{
  const RAW = JSON.stringify({ assetId: 'PUMP-08', version: 1, economics: null });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('retrofit-doctor.planner.PUMP-08', raw); sessionStorage.setItem('seeded', '1'); }
  }, RAW);
  const p5 = await context.newPage(); const e5 = [];
  p5.on('console', (m) => { if (['error', 'warning'].includes(m.type())) e5.push(m.text()); });
  p5.on('pageerror', (e) => e5.push(String(e)));
  await planner(p5, 'PUMP-08');
  const st = await text(p5, '[aria-labelledby="pl-status"]');
  const kept = await p5.evaluate(() => localStorage.getItem('retrofit-doctor.planner.PUMP-08'));
  check('Review-3', 'Broken stored draft (economics:null) → planner renders with notice; original untouched', /could not be read/.test(st) && kept === RAW);
  await p5.locator('[aria-labelledby="pl-status"]').screenshot({ path: `${SHOTS}/12-corrupt-draft-notice-1440.png` });
  await p5.check('#choice-defer');
  await p5.click('#pl-save');
  const st2 = await text(p5, '[aria-labelledby="pl-status"]');
  const backup = await p5.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('retrofit-doctor.planner.PUMP-08.backup')).map((k) => localStorage.getItem(k)));
  check('Review-3', 'Save after corrupt load keeps the original as backup and says so', /kept as backup/.test(st2) && backup.length === 1 && backup[0] === RAW);
  // probe 1: huge horizon
  await p5.click('#pl-preset'); if (await p5.locator('#pl-confirm-yes').count()) await p5.click('#pl-confirm-yes');
  await commit(p5, '#pl-H', '100000000000');
  let ed = await text(p5, '[aria-labelledby="pl-edit"]');
  let res = await text(p5, '[aria-labelledby="pl-res"]');
  check('Review-1', 'Horizon 1e11 → "Supported horizon is 1–50 whole years", no result, no crash', /Supported horizon is 1–50 whole years/.test(ed) && /NPV\s+Not estimated/.test(res) && /whole years, 1–50/.test(ed));
  await commit(p5, '#pl-H', '5');
  // probe 2: overflow
  await commit(p5, '#ln-minimal-sensors-q', '2');
  await commit(p5, '#ln-minimal-sensors-u', '1e308');
  ed = await text(p5, '[aria-labelledby="pl-edit"]');
  res = await text(p5, '[aria-labelledby="pl-res"]');
  check('Review-2', '2 × 1e308 → inline error, no Infinity/NaN, economics Needs evidence', /Too large to calculate reliably/.test(ed) && !/Infinity|NaN/.test(res) && /Economic conclusion\s+Needs evidence/.test(res) && /NPV\s+Not estimated/.test(res));
  await p5.locator('[aria-labelledby="pl-res"]').screenshot({ path: `${SHOTS}/13-overflow-rejected-1440.png` });
  check('Console', 'No console errors in review-regression session', e5.length === 0, e5.join(' | '));
  await context.close();
}

await browser.close();
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(9)} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
console.log(`${checks.filter((c) => c.pass).length}/${checks.length} passed`);
