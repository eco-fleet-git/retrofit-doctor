// Task022: explainable hydraulic consistency on imported data. Numbers follow docs/tasks/022-review-oracle.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSystem, parseCsv, compactSource, createSystemsStore, isValidSystem, readiness } from '../web/js/systems-model.js';
import {
  parseReference, interpHead, headFromPressures, expectedHead, assessAt, timeline, explainAssessment, withDefaults,
  exampleCsv, exampleSystem, EXAMPLE_KINDS, cutoffRange, analysisSeries,
} from '../web/js/hydraulic-analysis.js';

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const REF = { name: 'oracle', status: 'user-confirmed', rpm: '1500', applies: true, points: [{ q: '0', h: '40' }, { q: '100', h: '35' }, { q: '200', h: '20' }] };
const PD35 = 443.23275; const PD28 = 374.5862;
// rows: [secondsFromT0, ps, pd, q, n]; blank → ''
function sysFrom(rows, { ref = REF, density = '1000', geometryAck = true, affinity = false, channels = ['ps', 'pd', 'q', 'n'] } = {}) {
  const hdr = { ps: 'suction_pressure_kpa', pd: 'discharge_pressure_kpa', q: 'flow_m3_h', n: 'motor_speed_rpm' };
  const csv = [`timestamp_utc,${channels.map((c) => hdr[c]).join(',')}`, ...rows.map((r) => [iso(T0 + r[0] * 1000), ...channels.map((c) => r[1 + ['ps', 'pd', 'q', 'n'].indexOf(c)] ?? '')].join(','))].join('\n');
  const p = parseCsv(csv); assert.ok(p.ok, JSON.stringify(p.errors));
  const s = withDefaults(newSystem()); s.site.name = 'S'; s.name = 'N';
  for (const c of channels) s.channels[c].status = 'installed';
  s.equipment.reference = structuredClone(ref);
  s.analysis = { density, geometryAck, affinity, bandPct: '10' };
  s.source = compactSource('csv', p, { fileName: 'x.csv' });
  return s;
}
const minute = (from, f) => Array.from({ length: 60 }, (_, i) => f(from + i, i));
const steady = (from, pd = PD35, q = 100, n = 1500) => minute(from, (sec) => [sec, 100, pd, q, n]);

test('physics: head from pressures, interpolation within range only, reference validation', () => {
  assert.ok(Math.abs(headFromPressures(100, PD35, 1000) - 35) < 1e-6);
  assert.ok(Math.abs(headFromPressures(100, PD28, 1000) - 28) < 1e-6);
  assert.ok(Math.abs(headFromPressures(-20, 323.23275, 1000) - 35) < 1e-6, 'negative gauge suction is valid');
  const r = parseReference(REF); assert.ok(r.ok);
  assert.equal(interpHead(r.points, 100), 35); assert.equal(interpHead(r.points, 150), 27.5);
  assert.equal(interpHead(r.points, 250), null, 'no extrapolation'); assert.equal(interpHead(r.points, -1), null);
  const codes = (pts, rpm = '1500') => parseReference({ ...REF, rpm, points: pts.map(([q, h]) => ({ q, h })) }).errors.map((e) => e.code);
  assert.deepEqual(codes([['0', '40'], ['0', '35']]), ['refOrder']);
  assert.deepEqual(codes([['0', '40']]), ['refCount']);
  assert.deepEqual(codes([['0', '40'], ['10', '0']]), ['refH']);
  assert.deepEqual(codes([['-5', '40'], ['10', '30']]), ['refQ']);
  assert.deepEqual(codes([['0', '40'], ['10', '30']], ''), ['refRpm']);
  assert.ok(parseReference({ ...REF, points: [{ q: '0', h: '30' }, { q: '50', h: '33' }, { q: '100', h: '28' }] }).ok, 'non-monotonic H is allowed');
});

test('affinity: n=1200, Q=80 ↔ reference Q100, expected H 22.4 m; without scaling the speed band blocks', () => {
  const r = parseReference(REF);
  const a = expectedHead(r, 80, 1200, { affinity: true });
  assert.ok(Math.abs(a.qRef - 100) < 1e-9 && Math.abs(a.h - 22.4) < 1e-9);
  assert.equal(expectedHead(r, 80, 1200, { affinity: false }).reason, 'speedBand');
  assert.equal(expectedHead(r, 100, 1530, { affinity: false }).h, 35, 'within ±2 % uses the curve directly');
  const s = sysFrom(minute(0, (sec) => [sec, 100, 319.66896, 80, 1200]), { affinity: true });
  const out = assessAt(s, T0 + 60_000);
  assert.equal(out.status, 'within'); assert.ok(Math.abs(out.residualPct) < 1e-6); assert.ok(Math.abs(out.hAtRefMedian - 35) < 1e-6);
  assert.equal(assessAt(sysFrom(minute(0, (sec) => [sec, 100, 319.66896, 80, 1200])), T0 + 60_000).status, 'insufficientReference');
});

test('verdicts: in-band, sustained low head −20 %, outside range, rated speed never substitutes measured speed', () => {
  assert.equal(assessAt(sysFrom(steady(0)), T0 + 60_000).status, 'within');
  const low = assessAt(sysFrom(steady(0, PD28)), T0 + 60_000);
  assert.equal(low.status, 'below'); assert.ok(Math.abs(low.residualPct + 20) < 1e-6);
  const e = explainAssessment(low, { question: 'hydraulic' });
  assert.ok(e.causes.length >= 3 && e.ambiguity === 'sameInstruments' && e.outcomes.length === 2, 'several causes, none certain');
  const out = assessAt(sysFrom(steady(0, PD35, 250)), T0 + 60_000);
  assert.deepEqual([out.status, out.reasons], ['insufficientReference', ['outsideRange']]);
  const s = sysFrom(minute(0, (sec) => [sec, 100, PD35, 100, '']));
  s.equipment.pump.ratedRpm = '1500';
  assert.notEqual(assessAt(s, T0 + 60_000).status, 'within', 'blank measured speed → no curve verdict');
  assert.equal(assessAt(sysFrom(steady(0), { channels: ['ps', 'pd', 'q'] }), T0 + 60_000).reasons[0], 'speed');
});

test('assumptions: density / geometry / reference missing never silently produce head or a verdict', () => {
  const nd = assessAt(sysFrom(steady(0), { density: '' }), T0 + 60_000);
  assert.deepEqual([nd.status, nd.reasons, nd.headMedian], ['deltaPOnly', ['density'], undefined]);
  assert.ok(Math.abs(nd.dpMedian - 343.23275) < 1e-6, 'ΔP still shown');
  assert.deepEqual(assessAt(sysFrom(steady(0), { geometryAck: false }), T0 + 60_000).reasons, ['geometry']);
  assert.deepEqual(assessAt(sysFrom(steady(0), { ref: { ...REF, applies: false } }), T0 + 60_000).reasons, ['applicability']);
  assert.deepEqual(assessAt(sysFrom(steady(0), { ref: { ...REF, points: [] , rpm: '' } }), T0 + 60_000).reasons, ['reference']);
  // proposed channels never satisfy measurements
  const p = sysFrom(steady(0)); p.channels.q.status = 'proposed';
  assert.equal(assessAt(p, T0 + 60_000).status, 'headOnly');
  const m = sysFrom(steady(0)); m.channels.ps.status = 'absent';
  assert.equal(assessAt(m, T0 + 60_000).status, 'mappingNeeded');
  const loc = sysFrom(steady(0)); loc.channels.pd.location = 'line';
  assert.equal(assessAt(loc, T0 + 60_000).status, 'mappingNeeded');
  const u = assessAt(sysFrom(steady(0), { ref: { ...REF, status: 'unverified' } }), T0 + 60_000);
  assert.equal(u.qualified, true); assert.equal(explainAssessment(u, { question: 'hydraulic' }).qualifier, 'unverified');
});

test('row exclusions: reversed ΔP, negative flow, stopped pump; a mixed minute is not presented as the whole minute', () => {
  const rows = steady(0).map((r, i) => (i < 10 ? [r[0], 100, 90, 100, 1500] : r)); // 10 reversed rows
  const a = assessAt(sysFrom(rows), T0 + 60_000);
  assert.equal(a.excluded.reversedDp, 10); assert.equal(a.status, 'mixedRegime');
  const few = steady(0).map((r, i) => (i === 5 ? [r[0], 100, PD35, -3, 1500] : r));
  const b = assessAt(sysFrom(few), T0 + 60_000);
  assert.equal(b.excluded.negativeFlow, 1); assert.equal(b.status, 'within'); assert.equal(b.used, 59);
  const stopped = assessAt(sysFrom(minute(0, (sec) => [sec, 100, 101, 0, 0])), T0 + 60_000);
  assert.equal(stopped.status, 'stopped');
  const outPart = steady(0).map((r, i) => (i < 20 ? [r[0], 100, PD35, 100, 1540] : r)); // 20 rows outside the ±2 % speed band
  const mixed = assessAt(sysFrom(outPart), T0 + 60_000);
  assert.deepEqual([mixed.status, mixed.excluded.speedBand, mixed.used], ['mixedRegime', 20, 40], 'unsupported rows mixed in withhold the verdict');
});

test('closed minutes, gaps, partial terminal minute and transient regime', () => {
  const s = sysFrom([...steady(0), ...steady(60, PD28)]);
  assert.equal(assessAt(s, T0 + 60_000).status, 'within', 'cutoff 10:01: only minute 10:00');
  assert.equal(assessAt(s, T0 + 119_000).minuteStart, T0, 'mid-minute cutoff → the open minute is excluded');
  assert.equal(assessAt(s, T0 + 120_000).status, 'below');
  const gap = sysFrom([...steady(0), ...steady(120)]);
  const g = assessAt(gap, T0 + 120_000);
  assert.equal(g.status, 'noData', 'missing 10:01 is not replaced by the good 10:00 value');
  const partial = sysFrom([...steady(0), ...steady(60).slice(0, 25)]);
  assert.equal(assessAt(partial, T0 + 120_000).status, 'incompleteMinute');
  const tr = sysFrom(minute(0, (sec, i) => [sec, 100, PD35, 100 + i, 1500]));
  assert.equal(assessAt(tr, T0 + 60_000).status, 'transient');
  assert.equal(explainAssessment(assessAt(tr, T0 + 60_000), { question: 'hydraulic' }).next, 'repeatStable');
  const tl = timeline(gap, T0 + 180_000);
  assert.deepEqual(tl.map((m) => m.status), ['within', 'noData', 'within']);
  assert.deepEqual(cutoffRange(gap), { min: T0 + 60_000, max: T0 + 180_000 });
});

test('prefix invariance: later outliers, missingness and record length cannot change earlier outputs', () => {
  const base = [...steady(0), ...steady(60, PD28)];
  const later = [...base, ...minute(120, (sec) => [sec, 100, 9999, 999, 3000]), ...minute(180, (sec) => [sec, '', '', '', ''])];
  for (const cut of [T0 + 60_000, T0 + 90_000, T0 + 120_000]) {
    const truncated = base.filter((r) => T0 + r[0] * 1000 < Math.floor(cut / 60_000) * 60_000);
    const full = assessAt(sysFrom(later), cut);
    assert.deepEqual(full, assessAt(sysFrom(base), cut));
    assert.deepEqual(full, assessAt(sysFrom(truncated), cut));
    assert.deepEqual(timeline(sysFrom(later), cut), timeline(sysFrom(truncated), cut));
  }
});

test('prefix invariance: a mapped column that is blank before the cutoff and filled only later changes nothing earlier', () => {
  const early = minute(0, (sec) => [sec, 100, PD35, 100, '']); // speed column present but blank in 10:00
  const future = minute(60, (sec) => [sec, 100, PD35, 100, 1500]);
  const cut = T0 + 60_000;
  const a = assessAt(sysFrom([...early, ...future]), cut);
  assert.deepEqual(a, assessAt(sysFrom(early), cut));
  assert.deepEqual([a.status, a.reasons], ['headOnly', ['speed']]);
  assert.equal(explainAssessment(a, { question: 'hydraulic' }).next, 'readDriveSpeed', 'in-minute missing speed maps to an action');
  const noFlow = assessAt(sysFrom(minute(0, (sec) => [sec, 100, PD35, '', 1500])), cut);
  assert.equal(explainAssessment(noFlow, { question: 'hydraulic' }).next, 'temporaryFlow');
  assert.equal(assessAt(sysFrom([...early, ...future]), T0 + 120_000).status, 'within');
});

test('explanations: above-curve causes exclude system resistance; unverified reference is verified before instruments', () => {
  const hi = assessAt(sysFrom(steady(0, 520)), T0 + 60_000);
  assert.equal(hi.status, 'above');
  const e = explainAssessment(hi, { question: 'hydraulic' });
  assert.ok(!e.causes.includes('systemChange') && e.causes.includes('impellerOrSpeed'));
  assert.equal(e.next, 'verifyIndependently');
  const u = assessAt(sysFrom(steady(0, PD28), { ref: { ...REF, status: 'unverified' } }), T0 + 60_000);
  assert.equal(explainAssessment(u, { question: 'hydraulic' }).next, 'verifyReferenceFirst');
  const il = assessAt(sysFrom(steady(0, PD28), { ref: { ...REF, status: 'illustrative' } }), T0 + 60_000);
  const ei = explainAssessment(il, { question: 'hydraulic' });
  assert.deepEqual([ei.next, ei.qualifier, ei.scenario, ei.outcomes.length], ['verifyIndependently', 'illustrative', true, 2], 'illustrative demo shows the instrument check, still qualified');
  assert.equal(explainAssessment(hi, { question: 'hydraulic' }).scenario, undefined);
  assert.equal(explainAssessment(assessAt(sysFrom(steady(0)), T0 + 60_000), { question: 'mechanical' }).questionNote, 'mechanicalBlind');
});

test('storage: full series survives reload; legacy thinned samples require reimport; malformed series refused; quota safe', () => {
  const m = new Map(); const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const store = createSystemsStore(st);
  const rows = Array.from({ length: 3000 }, (_, i) => [i, 100, PD35, 100, 1500]);
  const s = store.save(sysFrom(rows)).system;
  const back = store.get(s.id);
  assert.equal(back.source.series.t.length, 3000); assert.equal(back.source.sample.t.length, 600);
  assert.deepEqual(assessAt(back, T0 + 600_000), assessAt(s, T0 + 600_000));
  assert.equal(assessAt(back, T0 + 600_000).status, 'within');
  // legacy: 3000 rows represented by 600 samples, no series → reimport
  const legacy = structuredClone(back); delete legacy.source.series; delete legacy.equipment.reference; delete legacy.analysis;
  assert.equal(isValidSystem(legacy), true, 'old shape still readable');
  assert.equal(assessAt(legacy, T0 + 600_000).status, 'reimportNeeded');
  assert.equal(explainAssessment({ status: 'reimportNeeded' }, legacy).next, 'reimport');
  // legacy complete (3 rows stored = 3 total) is usable
  const small = sysFrom([[0, 100, PD35, 100, 1500], [1, 100, PD35, 100, 1500], [2, 100, PD35, 100, 1500]]);
  delete small.source.series; small.id = 'SYS-009';
  assert.equal(analysisSeries(small).ok, true);
  for (const mutate of [(x) => { x.source.series.t[5] = x.source.series.t[4]; }, (x) => { x.source.series.values.q.pop(); }, (x) => { x.source.series.values.pd[3] = 'x'; }, (x) => { x.source.series.t.pop(); },
    (x) => { x.equipment.reference.points = 'bad'; }, (x) => { x.analysis.geometryAck = 'yes'; }]) {
    const bad = structuredClone(back); mutate(bad); assert.equal(isValidSystem(bad), false);
  }
  m.set('rd-systems-v1', JSON.stringify({ version: 1, systems: [(() => { const b = structuredClone(back); b.source.series.values.q.pop(); return b; })()] }));
  assert.equal(store.list().error, 'corrupt'); assert.equal(store.save(sysFrom(rows)).ok, false, 'corrupt store never overwritten');
  const q = createSystemsStore({ getItem: () => null, setItem: () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }, removeItem() {} });
  assert.equal(q.save(sysFrom(rows)).error, 'quota');
});

test('illustrative examples: deterministic, labelled, new draft, each demonstrates its case', () => {
  const expect = { stable: 'within', lowHead: 'below', transient: 'transient', missingFlow: 'headOnly', outsideRange: 'insufficientReference' };
  for (const k of EXAMPLE_KINDS) {
    const csv = exampleCsv(k);
    assert.equal(csv, exampleCsv(k));
    assert.equal(csv, readFileSync(new URL(`./fixtures/pump-reference/illustrative-${k}.csv`, import.meta.url), 'utf8'), `fixture ${k} matches generator`);
    const existing = withDefaults(newSystem()); existing.name = 'Mine';
    const s = exampleSystem(newSystem(), k, parseCsv(csv), compactSource);
    assert.equal(existing.name, 'Mine'); assert.equal(s.id, null);
    assert.equal(s.equipment.provenance, 'illustrative-example'); assert.equal(s.equipment.reference.status, 'illustrative');
    assert.match(s.equipment.reference.name, /not a manufacturer curve/);
    const a = assessAt(s, cutoffRange(s).max);
    assert.equal(a.status, expect[k], k);
    assert.equal(a.qualified, true);
    assert.equal(readiness(s).conflicts.length, 0);
  }
  const lh = exampleSystem(newSystem(), 'lowHead', parseCsv(exampleCsv('lowHead')), compactSource);
  assert.equal(assessAt(lh, Date.UTC(2026, 2, 2, 10, 5)).status, 'within', 'before the step the head is in band');
});

test('challenge prefill clears a curve that belonged to the replaced pump, visibly', async () => {
  const { applyChallengeExample } = await import('../web/js/systems-model.js');
  const fleet = JSON.parse(readFileSync(new URL('../web/data/fleet.json', import.meta.url)));
  const s = sysFrom(steady(0));
  const p = applyChallengeExample(s, fleet.assets.find((x) => x.assetId === 'PUMP-04'));
  assert.equal(p.equipment.reference.applies, false); assert.equal(parseReference(p.equipment.reference).empty, true);
  assert.equal(p.equipment.referenceCleared, true);
  assert.deepEqual(assessAt(p, T0 + 60_000).reasons, ['reference']);
  assert.equal(s.equipment.reference.applies, true, 'input untouched');
  const fresh = applyChallengeExample(withDefaults(newSystem()), fleet.assets.find((x) => x.assetId === 'PUMP-04'));
  assert.equal(fresh.equipment.referenceCleared, undefined, 'no note when nothing was cleared');
});

test('views EN/RU: reference editor validation, assessment panel with charts, chain and outcomes; legacy reimport label; examples block', async () => {
  const m = new Map(); globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const { setLang } = await import('../web/js/i18n.js');
  const av = await import('../web/js/analysis-view.js');
  const v = await import('../web/js/systems-view.js');
  const clean = (h) => { assert.doesNotMatch(h, /\$\{|undefined|NaN|UTC UTC/); return h; };
  const bad = withDefaults(newSystem()); bad.equipment.reference.points[0] = { q: '10', h: '30' }; bad.equipment.reference.points[1] = { q: '5', h: '20' }; bad.analysis.bandPct = '80';
  const errs = av.validateAnalysis(bad);
  assert.deepEqual(errs['equipment.reference'].map((e) => e.code), ['refOrder', 'refRpm']); assert.equal(errs['analysis.bandPct'], 'band');
  assert.deepEqual(av.validateAnalysis(withDefaults(newSystem())), {}, 'an empty reference is optional');
  for (const d of ['Infinity', '1e3', '0', '-5', 'abc']) { const x = withDefaults(newSystem()); x.analysis.density = d; assert.equal(av.validateAnalysis(x)['analysis.density'], 'positive', d); }
  const ok = withDefaults(newSystem()); ok.analysis.density = '998.2'; assert.deepEqual(av.validateAnalysis(ok), {});
  const lh = exampleSystem(newSystem(), 'lowHead', parseCsv(exampleCsv('lowHead')), compactSource);
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      const ru = lang === 'ru';
      const ed = clean(av.referenceEditor(bad, errs));
      assert.match(ed, ru ? /расход должен строго возрастать/ : /flow must increase strictly/);
      assert.match(ed, ru ? /Вода не подразумевается/ : /Water is not assumed/);
      const h = clean(av.assessmentPanel(lh, null));
      assert.match(h, ru ? /Напор ниже ожидаемого диапазона/ : /Head below the expected range/);
      assert.match(h, ru ? /Сравнение с характеристикой насоса/ : /Comparison with the pump curve/);
      assert.ok(h.indexOf('-next"') < h.indexOf('class="an-charts"') && h.indexOf('-next"') < h.indexOf('-causes"'), 'next check right after status and metrics');
      assert.match(h, ru ? /Иллюстративная авторская опора/ : /Illustrative authored reference/);
      assert.match(h, /Q, m³\/h/); assert.match(h, /H, m/); assert.match(h, /n_ref 1480 rpm/);
      assert.match(h, ru ? /Возможные объяснения \(ни одно не достоверно\)/ : /Possible explanations \(none is certain\)/);
      assert.match(h, ru ? /Чего эти данные не различают/ : /What this data cannot distinguish/);
      assert.match(h, ru ? /В рамках этого иллюстративного сценария[\s\S]*независимым временным прибором/ : /Within this illustrative scenario[\s\S]*independent temporary meter/);
      assert.doesNotMatch(h, ru ? /Опора не подтверждена: проверьте источник/ : /not user-confirmed/);
      assert.match(h, ru ? /не диагноз кавитации/ : /not a cavitation diagnosis/);
      assert.match(h, /data-an-cutoff/); assert.match(h, /ksb\.com/);
      assert.doesNotMatch(h, ru ? /исправ(ен|ный насос)|достоверность \d/ : /\bhealthy\b(?!\.)|confidence \d/);
      const within = clean(av.assessmentPanel(exampleSystem(newSystem(), 'stable', parseCsv(exampleCsv('stable')), compactSource), null));
      assert.match(within, ru ? /а не утверждение об исправности/ : /not a statement that the pump is healthy/);
      const mech = structuredClone(lh); mech.question = 'mechanical';
      assert.match(clean(av.assessmentPanel(mech, null)), ru ? /не диагностирует подшипники/ : /does not diagnose bearings/);
      const legacy = structuredClone(sysFrom(Array.from({ length: 3000 }, (_, i) => [i, 100, PD35, 100, 1500]))); delete legacy.source.series; legacy.id = 'SYS-001';
      v.systemsStore.save(legacy);
      const det = clean(v.renderSystemDetail({ id: 'SYS-001' }));
      assert.match(det, ru ? /Для анализа нужен повторный импорт/ : /Re-import needed for analysis/);
      assert.doesNotMatch(det, ru ? /полный ряд сохранён/ : /full series kept/);
      assert.doesNotMatch(det, /1970/, 'no epoch cutoff without a range');
      assert.doesNotMatch(det, /class="sys-prev"/, 'no whole-file preview beside the as-of result');
      assert.match(det, ru ? /вся запись, не на момент/ : /whole record, not as-of/);
      m.clear();
      const list = clean(v.renderSystemsList());
      assert.match(list, ru ? /авторские синтетические данные/ : /authored synthetic data/); assert.match(list, /data-example="lowHead"/);
      assert.match(list, ru ? /не кривая производителя/i : /Not a manufacturer curve/);
    } finally { setLang('en'); }
  }
  delete globalThis.localStorage;
});

test('stale cutoff from a replaced source is clamped; a one-minute series is drawn as a dot', async () => {
  const av = await import('../web/js/analysis-view.js');
  const s = sysFrom([...steady(0), ...steady(60, PD28)]); // range 10:01–10:02
  for (const [stale, expectMinute] of [[Date.UTC(2025, 5, 1), '10:00–10:01'], [Date.UTC(2027, 0, 1), '10:01–10:02'], [T0 + 90_500, '10:00–10:01']]) {
    const h = av.assessmentPanel(s, stale);
    const val = Number(/data-an-cutoff min="\d+" max="\d+" step="60000" value="(\d+)"/.exec(h)[1]);
    assert.ok(val >= T0 + 60_000 && val <= T0 + 120_000 && val % 60_000 === 0, 'slider value inside the new range');
    assert.match(h, new RegExp(`evaluated minute ${expectMinute} UTC`));
    assert.doesNotMatch(h, /2025|2027/);
  }
  const one = av.assessmentPanel(sysFrom(steady(0)), null);
  assert.match(one, /<circle cx="[\d.]+" cy="[\d.]+" r="3" fill="#1f5fbf"\/>/);
});
