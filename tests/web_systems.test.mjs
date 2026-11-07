// Task021 "My systems": validation, CSV import, provenance, readiness prerequisites, storage and source isolation.
//   node --test tests/web_systems.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newSystem, validateStep, ratingValue, parseTimestamp, isValidSystem, applyChallengeExample, parseCsv, compactSource, challengeSource, networkSource,
  readiness, nextStep, createSystemsStore, CSV_TEMPLATE, LIMITS, mapDataChannels,
} from '../web/js/systems-model.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../web/data/${p}`, import.meta.url)));
const fleet = load('fleet.json');
const bundle = load('diagnosis-comparison.json');
const p04 = fleet.assets.find((a) => a.assetId === 'PUMP-04');
const raw04 = bundle.cases.find((c) => c.caseId === 'pump04-train').rawMinute;
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const installed = (sys, ids) => { for (const c of ids) sys.channels[c].status = 'installed'; return sys; };

test('step 1 and 2 validation: required fields and positive finite ratings; unknown (blank) allowed', () => {
  const s = newSystem();
  assert.deepEqual(Object.keys(validateStep(s, 1)).sort(), ['name', 'site.name']);
  s.site.name = 'Plant X'; s.name = 'Cooling loop';
  assert.deepEqual(validateStep(s, 1), {});
  assert.deepEqual(validateStep(s, 2), {}, 'blank ratings mean unknown, not zero');
  for (const bad of ['0', '-5', 'abc', 'Infinity', '1e999', 'NaN']) {
    s.equipment.pump.designFlow = bad;
    assert.equal(validateStep(s, 2)['equipment.pump.designFlow'], 'positive', bad);
  }
  s.equipment.pump.designFlow = '320.5';
  assert.equal(ratingValue('320.5'), 320.5);
  assert.equal(ratingValue(''), null);
  s.device.endpoint = 'mqtt://user:secret@host';
  assert.equal(validateStep(s, 3)['device.endpoint'], 'noCredentials', 'no credentials in endpoints');
});

test('challenge example prefill is explicit and carries provenance; it never changes the source asset', () => {
  const before = JSON.stringify(p04);
  const s = applyChallengeExample(newSystem(), p04);
  assert.equal(s.equipment.provenance, 'challenge-example');
  assert.equal(s.equipment.sourceAsset, 'PUMP-04');
  assert.equal(s.equipment.pump.designFlow, String(p04.designFlowM3h));
  assert.equal(JSON.stringify(p04), before);
  assert.equal(newSystem().equipment.provenance, 'user');
});

test('CSV: template parses; blank readings stay missing (not zero); coverage per channel', () => {
  const r = parseCsv(CSV_TEMPLATE);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.rows, 2);
  assert.equal(r.values.q[1], null);
  const c = compactSource('csv', r, { fileName: 't.csv' });
  assert.equal(c.coverage.q, 1);
  assert.equal(c.coverage.ps, 2);
  assert.equal(c.pairs.psPd, 2);
});

test('CSV: strict errors with line numbers (headers, timestamps, order, numbers, limits)', () => {
  const codes = (txt) => parseCsv(txt).errors.map((e) => e.code);
  assert.deepEqual(codes('time,flow_m3_h\n2026-01-01T00:00:00Z,1'), ['firstColumn']);
  assert.deepEqual(codes('timestamp_utc,flow_m3_h,foo\n2026-01-01T00:00:00Z,1,2'), ['unknownHeader']);
  assert.deepEqual(codes('timestamp_utc,flow_m3_h,flow_m3_h\n2026-01-01T00:00:00Z,1,2'), ['duplicateHeader']);
  assert.deepEqual(codes('timestamp_utc,flow_m3_h\n2026-01-01T00:00:00,1'), ['timestamp'], 'timezone required');
  for (const bad of ['2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T10:60:00Z', '2026-01-01T10:00:00+15:00', '2026-01-01T10:00:00+05:60']) {
    assert.deepEqual(codes(`timestamp_utc,flow_m3_h\n${bad},1`), ['timestamp'], bad);
  }
  assert.equal(parseTimestamp('2024-02-29T00:00:00Z'), Date.parse('2024-02-29T00:00:00Z'), 'leap day is valid');
  assert.equal(parseTimestamp('2026-01-01T12:00:00+02:00'), Date.parse('2026-01-01T10:00:00Z'), 'offset applied');
  assert.equal(parseTimestamp('2026-01-01T10:00:00.250Z'), Date.parse('2026-01-01T10:00:00.250Z'));
  assert.deepEqual(codes('timestamp_utc,flow_m3_h\n2026-01-01T00:00:01Z,1\n2026-01-01T00:00:00Z,1'), ['outOfOrder']);
  assert.deepEqual(codes('timestamp_utc,flow_m3_h\n2026-01-01T00:00:00Z,1\n2026-01-01T00:00:00Z,1'), ['duplicateTime']);
  assert.deepEqual(codes('timestamp_utc,flow_m3_h\n2026-01-01T00:00:00Z,abc\n2026-01-01T00:00:01Z,Infinity\n2026-01-01T00:00:02Z,NaN'), ['number', 'number', 'number']);
  assert.equal(parseCsv('timestamp_utc,flow_m3_h\n2026-01-01T00:00:00Z,abc').errors[0].line, 2);
  assert.deepEqual(codes('timestamp_utc,flow_m3_h\n2026-01-01T00:00:00Z,1,2'), ['columnCount']);
  assert.deepEqual(parseCsv('x', { bytes: LIMITS.maxBytes + 1 }).errors.map((e) => e.code), ['tooLarge']);
  const many = ['timestamp_utc,flow_m3_h', ...Array.from({ length: LIMITS.maxRows + 1 }, (_, i) => `${new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()},1`)].join('\n');
  assert.deepEqual(codes(many), ['tooManyRows']);
  assert.deepEqual(codes(''), ['empty']);
});

test('stored source is bounded and discloses rows total vs stored', () => {
  const lines = ['timestamp_utc,suction_pressure_kpa,discharge_pressure_kpa'];
  for (let i = 0; i < 3000; i += 1) lines.push(`${new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()},35,260`);
  const c = compactSource('csv', parseCsv(lines.join('\n')));
  assert.equal(c.rowsTotal, 3000);
  assert.ok(c.rowsStored <= LIMITS.storedRows);
  assert.equal(c.sample.t.length, c.rowsStored);
  assert.equal(c.pairs.psPd, 3000, 'pair counts come from the full parsed file');
});

test('readiness: proposed/checkbox channels never count; received data must also be configured as installed', () => {
  const s = newSystem(); s.site.name = 'X'; s.name = 'Y';
  for (const c of ['ps', 'pd', 'q', 'n']) s.channels[c].status = 'proposed';
  let r = readiness(s);
  assert.equal(r.capabilities.hydraulic.status, 'notReady', 'proposed channels do not satisfy receipt');
  installed(s, ['ps', 'pd', 'q', 'n']);
  r = readiness(s);
  assert.equal(r.capabilities.hydraulic.status, 'notReady', 'installed checkboxes without data are not readiness');
  assert.equal(nextStep(s).key, 'loadData');
  s.source = challengeSource(raw04);
  r = readiness(s);
  assert.deepEqual(r.received.sort(), ['n', 'pd', 'ps', 'q']);
  assert.deepEqual(r.capabilities.hydraulic.can, ['pressureRise'], 'no design point yet → no comparison');
  assert.ok(r.capabilities.hydraulic.missing.includes('pumpCurve') && r.capabilities.hydraulic.missing.includes('designPoint'));
  assert.ok(r.notes.includes('shortRecording') && r.notes.includes('challengeNoisy'));
  assert.equal(r.formalDiagnosis, false);
  const ex = applyChallengeExample(s, p04);
  assert.deepEqual(readiness(ex).capabilities.hydraulic.can, ['pressureRise', 'designPointComparison']);
  assert.ok(readiness(ex).capabilities.hydraulic.missing.includes('pumpCurve'), 'one design point is not a pump curve');
  const noN = installed(applyChallengeExample(newSystem(), p04), ['ps', 'pd', 'q']); noN.channels.n.status = 'absent'; noN.source = challengeSource(raw04);
  assert.ok(readiness(noN).capabilities.hydraulic.missing.includes('speedContext'), 'rated rpm does not replace measured speed');
  assert.equal(readiness(ex).capabilities.mechanical.status, 'notReady', 'challenge minute has no vibration');
  assert.equal(readiness(ex).capabilities.energy.status, 'notReady', 'no input power in the challenge minute');
  assert.ok(readiness(ex).capabilities.energy.missing.includes('densityGeometry'));
});

test('readiness: mapping conflicts and wrong tap locations are flagged, not trusted', () => {
  const s = installed(newSystem(), ['pd']);           // ps is NOT configured as installed
  s.source = challengeSource(raw04);
  const r = readiness(s);
  assert.ok(r.conflicts.includes('ps') && r.conflicts.includes('q'));
  assert.equal(r.capabilities.hydraulic.status, 'notReady');
  assert.equal(nextStep(s).key, 'resolveMapping');
  const t = installed(newSystem(), ['ps', 'pd']); t.channels.pd.location = 'line';
  t.source = challengeSource(raw04);
  assert.ok(readiness(t).capabilities.hydraulic.missing.includes('tapLocations'));
  assert.equal(readiness(t).capabilities.hydraulic.status, 'notReady');
  // Energy: full inputs give only a potential review; wrong tap mapping blocks it.
  const en = installed(newSystem(), ['ps', 'pd', 'q', 'power']);
  en.source = compactSource('csv', parseCsv('timestamp_utc,suction_pressure_kpa,discharge_pressure_kpa,flow_m3_h,motor_power_kw\n2026-01-01T10:00:00Z,100,300,120,15\n2026-01-01T10:00:01Z,101,303,121,15.2'));
  assert.deepEqual([readiness(en).capabilities.energy.status, readiness(en).capabilities.energy.can[0]], ['potential', 'wireToWaterPotential']);
  assert.ok(readiness(en).capabilities.energy.missing.includes('densityGeometry'));
  en.channels.ps.location = 'line';
  assert.equal(readiness(en).capabilities.energy.status, 'notReady');
});

test('readiness: RMS vibration is a trend only; valve position alone is not flow; network config is not data', () => {
  const s = installed(newSystem(), ['vib', 'valve']);
  const csv = parseCsv('timestamp_utc,vibration_rms_mm_s,valve_position_pct\n2026-01-01T00:00:00Z,2.1,60\n2026-01-01T00:00:01Z,2.2,60');
  s.source = compactSource('csv', csv);
  const r = readiness(s);
  assert.deepEqual(r.capabilities.mechanical.can, ['rmsTrend']);
  assert.ok(r.capabilities.mechanical.missing.includes('waveform'), 'bearing fault inference needs a waveform');
  assert.ok(r.notes.includes('valveNotFlow'));
  const n = installed(newSystem(), ['ps', 'pd']); n.device.interface = 'gateway'; n.source = networkSource(n.device);
  assert.equal(readiness(n).capabilities.hydraulic.status, 'notReady');
  assert.ok(readiness(n).notes.includes('configurationOnly'));
  assert.equal(n.source.status, 'configuration-only');
});

test('storage: SYS ids, save/edit/load, corrupt and unavailable storage handled, no collision with PUMP/SIM ids', () => {
  const st = memStorage(); const store = createSystemsStore(st);
  const s = newSystem(); s.site.name = 'A'; s.name = 'B';
  const r1 = store.save(s, '2026-11-07T00:00:00Z');
  assert.equal(r1.ok, true); assert.equal(r1.system.id, 'SYS-001');
  const r2 = store.save({ ...newSystem(), name: 'C' });
  assert.equal(r2.system.id, 'SYS-002');
  const edited = { ...r1.system, name: 'B2' };
  store.save(edited, '2026-11-07T01:00:00Z');
  assert.equal(store.get('SYS-001').name, 'B2');
  assert.equal(store.list().systems.length, 2);
  assert.ok(store.list().systems.every((x) => !/^(PUMP|SIM)-/.test(x.id)));
  // A schema-invalid stored system (missing site/equipment) is corruption: refused, never overwritten.
  st.setItem('rd-systems-v1', JSON.stringify({ version: 1, systems: [{ id: 'SYS-001' }] }));
  assert.deepEqual([store.list().ok, store.list().error], [false, 'corrupt']);
  assert.equal(store.save(newSystem()).ok, false);
  assert.equal(JSON.parse(st.getItem('rd-systems-v1')).systems.length, 1, 'corrupt store left untouched');
  assert.equal(isValidSystem({ ...r1.system }), true);
  st.setItem('rd-systems-v1', '{broken');
  assert.deepEqual([store.list().ok, store.list().error], [false, 'corrupt']);
  assert.equal(store.save(newSystem()).ok, false, 'never overwrite an unreadable store');
  const quota = createSystemsStore({ getItem: () => null, setItem: () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } });
  assert.deepEqual(quota.save(newSystem()), { ok: false, error: 'quota' });
  const blocked = createSystemsStore({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} });
  assert.deepEqual([blocked.list().ok, blocked.list().error], [false, 'unavailable']);
});

test('source isolation: the challenge recording carries only t/ps/pd/q/n and its provenance; bundles untouched', () => {
  const c = challengeSource(raw04);
  assert.deepEqual(c.channels, ['ps', 'pd', 'q', 'n']);
  assert.equal(c.rowsTotal, 60);
  assert.match(c.origin, /diagnosis-comparison\.json/);
  assert.equal(c.window.start, Date.parse('2025-06-18T22:05:00Z'));
  assert.equal(c.coverage.power, undefined, 'no implied power/vibration/valve telemetry');
});

test('import fixtures (tests/fixtures/system-import): valid file parses; invalid time, missing timezone and NaN are rejected', () => {
  const fx = (n) => readFileSync(new URL(`./fixtures/system-import/${n}`, import.meta.url), 'utf8'); // must exist: no silent pass
  assert.equal(parseCsv(fx('synthetic-valid.csv')).ok, true);
  assert.deepEqual(parseCsv(fx('invalid-time.csv')).errors.map((e) => e.code), ['timestamp']);
  assert.deepEqual(parseCsv(fx('no-timezone.csv')).errors.map((e) => e.code), ['timestamp']);
  const bad = parseCsv(fx('invalid-number.csv'));
  assert.ok(!bad.ok && bad.errors.length && bad.errors.every((e) => e.code === 'number'));
});

test('stored source shape: malformed sample arrays are corruption, refused before any chart reads them', () => {
  const st = memStorage(); const store = createSystemsStore(st);
  const s = installed(newSystem(), ['ps', 'pd']); s.site.name = 'A'; s.name = 'B';
  s.source = compactSource('csv', parseCsv(CSV_TEMPLATE));
  const saved = store.save(s).system;
  assert.equal(isValidSystem(saved), true);
  for (const mutate of [
    (x) => { delete x.source.sample.values.ps; },
    (x) => { x.source.sample.values.pd = 'oops'; },
    (x) => { x.source.sample.values.pd = [1]; },              // length differs from sample.t
    (x) => { x.source.sample.values.pd[0] = 'x'; },
    (x) => { x.source.channels.push('foo'); },
    (x) => { x.source.window.start = 'yesterday'; },
  ]) {
    const bad = structuredClone(saved); mutate(bad);
    assert.equal(isValidSystem(bad), false);
    st.setItem('rd-systems-v1', JSON.stringify({ version: 1, systems: [bad] }));
    assert.deepEqual([store.list().ok, store.list().error], [false, 'corrupt']);
  }
});

// ---- View rendering (DOM-free; localStorage mocked) ----
test('views render in EN and RU: empty list, all four wizard steps with a challenge source, saved detail; corrupt store message', async () => {
  const mem = memStorage(); globalThis.localStorage = mem;
  const { setLang } = await import('../web/js/i18n.js');
  const v = await import('../web/js/systems-view.js');
  const clean = (h) => { assert.doesNotMatch(h, /\$\{|undefined|NaN/); return h; };
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      mem.m.clear();
      const empty = clean(v.renderSystemsList());
      assert.match(empty, lang === 'ru' ? /Систем пока нет/ : /No systems yet/);
      assert.match(empty, /id="sys-start-example"/);
      const route = { id: 'new' };
      clean(v.renderSystemsWizard(route, { cases: bundle.cases }));
      // Build a complete system through the model and save it; then render the detail.
      const s = installed(applyChallengeExample(newSystem(), p04), ['ps', 'pd', 'q', 'n']);
      s.site.name = 'Plant X'; s.name = 'Loop 1'; s.source = challengeSource(raw04);
      const saved = v.systemsStore.save(s).system;
      const detail = clean(v.renderSystemDetail({ id: saved.id }));
      assert.match(detail, lang === 'ru' ? /Загружена запись задания \(историческая, синтетическая\)/ : /Challenge recording loaded \(historical, synthetic\)/);
      assert.match(detail, lang === 'ru' ? /Измеренный прирост давления Pd − Ps/ : /Measured pressure rise Pd − Ps/);
      assert.match(detail, lang === 'ru' ? /Проверенная характеристика насоса/ : /A verified pump curve or reference/);
      assert.match(detail, lang === 'ru' ? /это не диагноз|а не диагноз/ : /not a diagnosis/);
      assert.match(detail, new RegExp(`href="#/systems/${saved.id}/edit"`));
      const editRoute = { id: saved.id };
      v.wizardState.key = null;
      clean(v.renderSystemsWizard(editRoute, { cases: bundle.cases })); // loads the saved system into the draft
      const expect = {
        1: lang === 'ru' ? /Инженерный вопрос/ : /Engineering question/,
        2: lang === 'ru' ? /одна расчётная точка, а не характеристика/ : /one design point, not a pump curve/,
        3: lang === 'ru' ? /Скачать шаблон CSV[\s\S]*не подключено · только конфигурация/ : /Download CSV template[\s\S]*not connected · configuration only/,
        4: lang === 'ru' ? /Следующий полезный шаг/ : /Next useful step/,
      };
      for (let step = 1; step <= 4; step += 1) {
        v.wizardState.step = step;
        const h = clean(v.renderSystemsWizard(editRoute, { cases: bundle.cases }));
        assert.match(h, new RegExp(`aria-current="step"><span class="n">${step}<`));
        assert.match(h, expect[step], `step ${step}`);
      }
      assert.equal(v.wizardState.draft.name, 'Loop 1', 'draft preserved across steps and language');
      const sh = v.systemsShell({ name: 'systemDetail', id: saved.id });
      assert.match(sh.badge2, lang === 'ru' ? /Исторический образец задания/ : /Historical challenge sample/);
      assert.doesNotMatch(JSON.stringify(v.systemsShell({ name: 'systems' })), /benchmark|бенчмарк/i, 'never presented as benchmark data');
      const csvSys = { ...saved, source: compactSource('csv', parseCsv(CSV_TEMPLATE), { fileName: 'x.csv' }) };
      v.systemsStore.save(csvSys);
      assert.match(v.systemsShell({ name: 'systemDetail', id: saved.id }).badge2, lang === 'ru' ? /Локальная CSV-запись/ : /Local CSV record/);
      mem.setItem('rd-systems-v1', '{broken');
      assert.match(v.renderSystemsList(), lang === 'ru' ? /не изменены и не перезаписаны/ : /left untouched and nothing was overwritten/);
    } finally { setLang('en'); }
  }
  delete globalThis.localStorage;
});

test('loaded-but-unmapped data: counted separately, no preview, explicit mapping action makes it usable', async () => {
  const s = newSystem(); s.site.name = 'A'; s.name = 'B'; s.source = challengeSource(raw04);
  const r = readiness(s);
  assert.deepEqual([r.inData.length, r.received.length, r.previewOk], [4, 0, false]);
  const m = mapDataChannels(s);
  assert.deepEqual(['ps', 'pd', 'q', 'n'].map((c) => m.channels[c].status), ['installed', 'installed', 'installed', 'installed']);
  assert.equal(m.channels.pd.location, 'discharge');
  const rm = readiness(m);
  assert.deepEqual([rm.received.length, rm.previewOk, rm.conflicts.length], [4, true, 0]);
  globalThis.localStorage = memStorage();
  const { setLang } = await import('../web/js/i18n.js');
  const v = await import('../web/js/systems-view.js');
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      v.wizardState.key = 'new'; v.wizardState.draft = s; v.wizardState.step = 4;
      const h = v.renderSystemsWizard({ id: 'new' }, { cases: bundle.cases });
      assert.match(h, lang === 'ru' ? /Каналов в загруженных данных: <b>4<\/b>[\s\S]*?сопоставлено и используется[\s\S]*?<b>0<\/b>/ : /Channels in the loaded data[\s\S]*?<b>4<\/b>[\s\S]*?mapped and usable[\s\S]*?<b>0<\/b>/);
      assert.doesNotMatch(h, /<figure class="sys-prev">/, 'no pressure-rise chart before mapping');
      assert.match(h, /id="sys-map-data"/);
      assert.match(h, lang === 'ru' ? /Ps · давление на всасывании \(suction_pressure_kpa\)/ : /Ps · suction pressure \(suction_pressure_kpa\)/);
      v.wizardState.draft = m;
      assert.match(v.renderSystemsWizard({ id: 'new' }, { cases: bundle.cases }), /<figure class="sys-prev">/);
    } finally { setLang('en'); }
  }
  delete globalThis.localStorage;
});
