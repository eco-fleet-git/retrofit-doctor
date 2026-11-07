// Task023: duration/recurrence, practical check card, append-only follow-up checks and revised explanation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSystem, parseCsv, compactSource, createSystemsStore, isValidSystem } from '../web/js/systems-model.js';
import { withDefaults, persistence, assessAt, exampleSystem, exampleCsv, RULES } from '../web/js/hydraulic-analysis.js';
import { validateCheck, appendCheck, baseline, compareCheck, checksAt, revisedExplanation, fingerprint, ILLUSTRATIVE_FILL, CHECK_LIMITS } from '../web/js/check-loop.js';

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const REF = { name: 'oracle', status: 'user-confirmed', rpm: '1500', applies: true, points: [{ q: '0', h: '40' }, { q: '100', h: '35' }, { q: '200', h: '20' }] };
const PD = { within: 443.23275, below: 374.5862, above: 511.879 }; // H 35 / 28 / 42 m at Ps 100, ρ 1000
// One minute as 3 rows (0/20/40 s): kind = within|below|above|gap|transient; q, n per minute.
const minute = (i, kind, q = 100, n = 1500) => (kind === 'gap' ? [] : [0, 20, 40].map((sec, k) => [i * 60 + sec, 100, PD[kind === 'transient' ? 'below' : kind], kind === 'transient' ? q * [1, 1.15, 1][k] : q, n]));
function sysFrom(rows, { ref = REF } = {}) {
  const csv = ['timestamp_utc,suction_pressure_kpa,discharge_pressure_kpa,flow_m3_h,motor_speed_rpm', ...rows.map((r) => [iso(T0 + r[0] * 1000), ...r.slice(1)].join(','))].join('\n');
  const p = parseCsv(csv); assert.ok(p.ok, JSON.stringify(p.errors));
  const s = withDefaults(newSystem()); s.site.name = 'S'; s.name = 'N';
  for (const c of ['ps', 'pd', 'q', 'n']) s.channels[c].status = 'installed';
  s.equipment.reference = structuredClone(ref); s.analysis = { density: '1000', geometryAck: true, affinity: false, bandPct: '10' };
  s.source = compactSource('csv', p, { fileName: 'x.csv' }); s.id = 'SYS-001';
  return s;
}
const seq = (kinds) => kinds.flatMap((k, i) => (Array.isArray(k) ? minute(i, ...k) : minute(i, k)));
const at = (sys, minutesClosed) => persistence(sys, T0 + minutesClosed * 60_000);

test('3-minute rule: isolated vs sustained; within, gap, transient and direction change break the run', () => {
  assert.deepEqual([at(sysFrom(seq(['within', 'below', 'below'])), 3).run, at(sysFrom(seq(['within', 'below', 'below'])), 3).sustained], [2, false]);
  const s = sysFrom(seq(['within', 'below', 'below', 'below']));
  assert.deepEqual([at(s, 4).run, at(s, 4).sustained, at(s, 4).atLeast, at(s, 4).runStart], [3, true, false, T0 + 60_000]);
  assert.equal(at(s, 2).run, 1, 'at an earlier cutoff only one minute');
  assert.equal(at(sysFrom(seq(['below', 'within', 'below', 'below'])), 4).run, 2);
  assert.equal(at(sysFrom(seq(['below', 'gap', 'below', 'below'])), 4).run, 2, 'gap breaks; duration is supported minutes, not elapsed');
  assert.equal(at(sysFrom(seq(['below', 'transient', 'below', 'below'])), 4).run, 2);
  assert.equal(at(sysFrom(seq(['above', 'below', 'below'])), 3).run, 2, 'direction change breaks');
  const inv = at(sysFrom(seq(['below', 'below', 'below', 'gap'])), 4);
  assert.deepEqual([inv.current, inv.run, inv.sustained], ['noData', 0, false], 'an invalid current minute never inherits "sustained"');
});

test('regime: fixed anchor stops slow drift chaining; recurrence counts only same direction and regime', () => {
  const drift = sysFrom(seq([['below', 100], ['below', 104], ['below', 108], ['below', 112], ['below', 116]]));
  assert.equal(at(drift, 5).run, 3, 'anchored on the selected minute (Q 116): 104 is > 10 % away');
  assert.equal(at(sysFrom(seq([['below', 80], ['below', 100], ['below', 100]])), 3).run, 2, 'regime change breaks');
  const rec = sysFrom(seq(['below', 'below', 'within', ['below', 80], 'within', 'above', 'within', 'below', 'below', 'below']));
  const p = at(rec, 10);
  assert.deepEqual([p.run, p.episodes.length, p.episodes[0].minutes, p.episodes[0].atLeast], [3, 1, 2, true], 'Q80 episode and the above minute are not recurrences');
});

test('lookback truncation says "at least"; prefix invariance with appended future data', () => {
  const long = sysFrom(Array.from({ length: 250 }, (_, i) => minute(i, 'below')).flat());
  const p = at(long, 250);
  assert.deepEqual([p.run, p.atLeast, p.truncated, p.lookbackMinutes], [RULES.timelineMinutes, true, true, 240]);
  const short = at(sysFrom(seq(['below', 'below', 'below'])), 3);
  assert.deepEqual([short.atLeast, short.truncated], [true, false], 'record start: onset unknown, not truncated');
  const base = seq(['within', 'below', 'below', 'below']);
  const fut = [...base, ...minute(4, 'within'), ...minute(5, 'above', 300, 1800)];
  for (const c of [2, 3, 4]) assert.deepEqual(at(sysFrom(fut), c), at(sysFrom(base), c));
});

test('check validation: values, instrument, strict time, threshold, regime acknowledgement, saved system, supported minute', () => {
  const s = sysFrom(seq(['below', 'below']));
  const good = { q: '100', dp: '274.6', instrument: 'Clamp-on', measuredAt: iso(T0 + 30_000), tolPct: '5', note: '', origin: 'user', regimeAck: true };
  assert.equal(validateCheck(s, good).ok, true);
  const errs = (patch) => validateCheck(s, { ...good, ...patch }).errors;
  assert.equal(errs({ q: '', dp: '' }).values, 'oneRequired');
  assert.equal(errs({ q: '0' }).q, 'positive'); assert.equal(errs({ q: 'Infinity' }).q, 'positive'); assert.equal(errs({ dp: '-1' }).dp, 'nonNegative');
  assert.equal(validateCheck(s, { ...good, dp: '0' }).ok, true, 'ΔP 0 is allowed input');
  assert.equal(errs({ instrument: ' ' }).instrument, 'required');
  assert.equal(errs({ measuredAt: '2026-01-01T10:00:30' }).measuredAt, 'timestamp'); assert.equal(errs({ measuredAt: '2026-02-30T10:00:30Z' }).measuredAt, 'timestamp');
  assert.equal(errs({ tolPct: '0' }).tolPct, 'tolerance'); assert.equal(errs({ regimeAck: false }).regimeAck, 'required');
  assert.equal(errs({ origin: 'lab' }).origin, 'required');
  assert.equal(errs({ measuredAt: iso(T0 + 5 * 60_000) }).measuredAt, 'noContext', 'no original context → blocked');
  assert.equal(validateCheck({ ...s, id: null }, good).errors.system, 'saveFirst');
  const tr = sysFrom(seq(['transient']));
  assert.equal(validateCheck(tr, good).errors.measuredAt, 'noContext');
  assert.equal(baseline(tr, T0).reason, 'unsupportedMinute');
  // ΔP-only path (no density) returns before the transient gate: the baseline still refuses a changing regime
  const dpOnly = sysFrom(seq(['transient'])); dpOnly.analysis.density = '';
  assert.equal(assessAt(dpOnly, T0 + 60_000).status, 'deltaPOnly');
  assert.equal(baseline(dpOnly, T0).reason, 'changingRegime');
  const short = sysFrom([[0, 100, PD.below, 100, 1500], [2, 100, PD.below, 100, 1500], [4, 100, PD.below, 100, 1500]]);
  assert.equal(baseline(short, T0).ok, false, 'span < 10 s');
});

const rec = (s, patch, now = '2026-06-01T12:00:00Z') => {
  const v = validateCheck(s, { q: '', dp: '', instrument: 'Clamp-on', measuredAt: iso(T0 + 30_000), tolPct: '5', note: '', origin: 'user', regimeAck: true, ...patch }, { now });
  assert.ok(v.ok, JSON.stringify(v.errors)); return appendCheck(s, v.check).system;
};

test('comparison: both agree / one agrees / differ / no baseline / zero baseline; one channel never validates the other', () => {
  const s = sysFrom(seq(['below', 'below']));
  const dp0 = PD.below - 100;
  const view = (x) => revisedExplanation(checksAt(x, T0, T0 + 60_000));
  assert.equal(view(rec(s, { q: '101', dp: String(dp0 * 1.02) })).key, 'bothAgreeMismatch');
  assert.equal(view(rec(s, { q: '120', dp: String(dp0) })).key, 'flowDiffers');
  assert.equal(view(rec(s, { dp: String(dp0 * 0.8) })).key, 'dpDiffers');
  assert.equal(view(rec(s, { q: '120', dp: String(dp0 * 0.8) })).key, 'bothDiffer');
  const one = view(rec(s, { q: '100' }));
  assert.deepEqual([one.key, one.q, one.dp], ['flowAgrees', 'agree', 'notChecked']);
  const noQ = sysFrom(seq(['below', 'below'])); noQ.channels.q.status = 'proposed';
  const c = compareCheck(noQ, rec(noQ, { q: '100', dp: String(dp0) }).checks[0]);
  assert.deepEqual([c.q.result, c.q.why, c.dp.result], ['notComparable', 'noBaseline', 'agree'], 'missing installed Q: new information, no agreement claim');
  const zero = sysFrom([0, 20, 40].map((t) => [t, 100, 100, 100, 1500])); zero.analysis.density = '';
  const z = compareCheck(zero, rec(zero, { dp: '0.2' }).checks[0]);
  assert.deepEqual([z.dp.result, z.dp.why], ['notComparable', 'zeroBaseline']);
});

test('latest whole check only: an older Q check and a newer ΔP check are never combined; origin is reported', () => {
  const s = sysFrom(seq(['below', 'below']));
  const two = rec(rec(s, { q: '100', origin: 'illustrative' }, '2026-06-01T10:00:00Z'), { dp: String(PD.below - 100), measuredAt: iso(T0 + 45_000) }, '2026-06-02T10:00:00Z');
  const r = revisedExplanation(checksAt(two, T0, T0 + 60_000));
  assert.deepEqual([r.key, r.checkId, r.origin], ['dpAgrees', 'CHK-002', 'user']);
});

test('time honesty: annotations never change assessAt; later checks deferred; other minute and changed configuration not applied', () => {
  const s = sysFrom(seq(['below', 'below', 'below']));
  const before = [1, 2, 3].map((m) => assessAt(s, T0 + m * 60_000));
  const withCheck = rec(s, { q: '100', dp: String(PD.below - 100), measuredAt: iso(T0 + 2 * 60_000 + 30_000) });
  assert.deepEqual([1, 2, 3].map((m) => assessAt(withCheck, T0 + m * 60_000)), before);
  assert.deepEqual(withCheck.source, s.source, 'telemetry untouched');
  assert.equal(checksAt(withCheck, T0 + 120_000, T0 + 180_000)[0].use, 'applied');
  assert.equal(checksAt(withCheck, T0 + 60_000, T0 + 120_000)[0].use, 'deferred', 'measured after the selected time');
  assert.equal(revisedExplanation(checksAt(withCheck, T0 + 60_000, T0 + 120_000)).key, 'noRevision');
  const later = rec(s, { q: '100', measuredAt: iso(T0 + 30_000) });
  assert.equal(checksAt(later, T0 + 120_000, T0 + 180_000)[0].use, 'otherMinute');
  for (const mutate of [(x) => { x.equipment.reference.points[1].h = '36'; }, (x) => { x.channels.q.location = 'valve'; }, (x) => { x.analysis.density = '998'; },
    (x) => { x.equipment.pump.name = 'Other pump'; }, (x) => { x.source.series.values.pd[0] += 1; }]) {
    const x = structuredClone(withCheck); mutate(x);
    assert.notEqual(fingerprint(x), fingerprint(withCheck));
    assert.equal(checksAt(x, T0 + 120_000, T0 + 180_000)[0].use, 'previousConfig');
  }
});

test('storage: append-only persistence and reload, limit, malformed history, old saves, quota without false success', () => {
  const m = new Map(); const store = createSystemsStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
  const s = sysFrom(seq(['below', 'below'])); s.id = null;
  const saved = store.save(s).system;
  const one = rec(saved, { q: '100' });
  assert.ok(store.save(one).ok);
  const back = store.get(saved.id);
  assert.equal(back.checks.length, 1); assert.equal(checksAt(back, T0, T0 + 60_000)[0].use, 'applied', 'reload keeps fingerprint match');
  const two = rec(back, { dp: '270' });
  assert.deepEqual(two.checks[0], back.checks[0], 'earlier entry unchanged'); assert.equal(two.checks[1].id, 'CHK-002');
  let full = back; for (let i = full.checks.length; i < CHECK_LIMITS.maxChecks; i += 1) full = rec(full, { q: '100' });
  assert.equal(appendCheck(full, full.checks[0]).error, 'checkLimit');
  assert.equal(isValidSystem(saved), true, 'no checks field: old save still valid');
  for (const mutate of [(x) => { x.checks[0].q = -1; }, (x) => { x.checks[0].targetMinute += 60_000; }, (x) => { x.checks[0].id = 'CHK-009'; }, (x) => { x.checks = 'x'; }, (x) => { x.checks[0].regimeAck = false; }]) {
    const bad = structuredClone(one); mutate(bad); assert.equal(isValidSystem(bad), false);
  }
  const q = createSystemsStore({ getItem: () => null, setItem: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }, removeItem() {} });
  assert.deepEqual(q.save(one), { ok: false, error: 'quota' });
});

test('lowHead demo: 12 min sustained from 10:08 at 10:20, 1 min at 10:09; illustrative 10:19 check corroborates the gap', () => {
  const s = exampleSystem(newSystem(), 'lowHead', parseCsv(exampleCsv('lowHead')), compactSource); s.id = 'SYS-003';
  const p = persistence(s, Date.UTC(2026, 2, 2, 10, 20));
  assert.deepEqual([p.run, p.sustained, iso(p.runStart)], [12, true, '2026-03-02T10:08:00Z']);
  assert.equal(persistence(s, Date.UTC(2026, 2, 2, 10, 9)).run, 1);
  const fill = (k) => validateCheck(s, { ...ILLUSTRATIVE_FILL[k], measuredAt: '2026-03-02T10:19:30Z', note: '', origin: 'illustrative', regimeAck: true });
  const agree = appendCheck(s, fill('agree').check).system;
  const r = revisedExplanation(checksAt(agree, Date.UTC(2026, 2, 2, 10, 19), Date.UTC(2026, 2, 2, 10, 20)));
  assert.deepEqual([r.key, r.origin], ['bothAgreeMismatch', 'illustrative']);
  const dis = appendCheck(s, fill('discrepant').check).system;
  assert.equal(revisedExplanation(checksAt(dis, Date.UTC(2026, 2, 2, 10, 19), Date.UTC(2026, 2, 2, 10, 20))).key, 'flowDiffers');
  assert.equal(checksAt(agree, Date.UTC(2026, 2, 2, 10, 14), Date.UTC(2026, 2, 2, 10, 15))[0].use, 'deferred');
});

test('views EN/RU: duration, check card, record action only when saved, follow-up panel; no health or wear claims', async () => {
  const m = new Map(); globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const { setLang } = await import('../web/js/i18n.js');
  const av = await import('../web/js/analysis-view.js');
  const v = await import('../web/js/systems-view.js');
  const s = exampleSystem(newSystem(), 'lowHead', parseCsv(exampleCsv('lowHead')), compactSource);
  const saved = v.systemsStore.save(s).system;
  const chk = validateCheck(saved, { ...ILLUSTRATIVE_FILL.agree, measuredAt: '2026-03-02T10:19:30Z', note: '', origin: 'illustrative', regimeAck: true }).check;
  v.systemsStore.save(appendCheck(saved, chk).system);
  const clean = (h) => { assert.doesNotMatch(h, /\$\{|undefined|NaN|UTC UTC/); return h; };
  for (const lang of ['en', 'ru']) {
    setLang(lang);
    try {
      const ru = lang === 'ru';
      const draft = clean(av.assessmentPanel(s, null));
      assert.doesNotMatch(draft, /id="chk-open"/); assert.match(draft, ru ? /сначала сохраните систему/ : /Save the system first/);
      const h = clean(v.renderSystemDetail({ id: saved.id }));
      assert.match(h, ru ? /Устойчивое расхождение/ : /Sustained deviation/);
      assert.match(h, ru ? /12 мин с 10:08 UTC/ : /12 min since 10:08 UTC/);
      assert.match(h, ru ? /Отвечает на вопрос/ : /Answers/); assert.match(h, ru ? /накладным расходомером/ : /clamp-on meter/);
      assert.match(h, /id="chk-open"/); assert.match(h, ru ? /Внести результат проверки/ : /Record check result/);
      assert.match(h, ru ? /Последующая проверка \(внесена позже\)/ : /Follow-up review \(entered later\)/);
      assert.match(h, ru ? /Иллюстративная симуляция/ : /Illustrative simulation/);
      assert.match(h, ru ? /Причина не установлена/ : /cause is still unresolved/);
      assert.match(h, ru ? /поддерживает исходное наблюдение о расхождении/ : /supports the original observation of a head difference/);
      assert.doesNotMatch(h, ru ? /подтверждает реальность/ : /gap is real at this point/);
      assert.match(h, ru ? /Устойчивое расхождение<\/span> <b class="num">12 мин с 10:08 UTC<\/b> · <span class="small">прошлых эпизодов нет/ : /Sustained deviation<\/span> <b class="num">12 min since 10:08 UTC<\/b> · <span class="small">no earlier episode/);
      assert.match(h, ru ? /<summary>Как считается длительность/ : /<summary>How duration is counted/);
      const card = h.slice(h.indexOf('id="an-next"'), h.indexOf('id="fu-panel"'));
      assert.equal((card.match(/clamp-on|накладн/g) ?? []).length, 1, 'card instruction not duplicated');
      assert.doesNotMatch(h, ru ? /износ подтвержд|исправен|насос исправный/i : /confirmed wear|\bhealthy\b(?! )|wear confirmed/i);
      assert.match(h, ru ? /Устойчивость — не доказательство износа/ : /Persistence is not proof of wear/);
    } finally { setLang('en'); }
  }
  delete globalThis.localStorage;
});

test('both agree without a curve verdict is "readings agree only"; unsupported rows block the baseline', () => {
  const dp0 = PD.below - 100;
  const view = (x) => revisedExplanation(checksAt(x, T0, T0 + 60_000));
  for (const [label, mutate] of [['no reference', (x) => { x.equipment.reference.applies = false; }], ['no density', (x) => { x.analysis.density = ''; }]]) {
    const s = sysFrom(seq(['below', 'below'])); mutate(s);
    const r = view(rec(s, { q: '100', dp: String(dp0) }));
    assert.deepEqual([r.key, r.next], ['bothReadingsAgreeOnly', 'completeContext'], label);
  }
  const out = sysFrom(seq([['below', 250], ['below', 250]]));
  assert.equal(assessAt(out, T0 + 60_000).status, 'insufficientReference');
  assert.equal(view(rec(out, { q: '250', dp: String(dp0) })).key, 'bothReadingsAgreeOnly', 'outside the curve: no mismatch statement');
  const w = sysFrom(seq(['within', 'within']));
  assert.equal(view(rec(w, { q: '100', dp: String(PD.within - 100) })).key, 'bothAgreeNoMismatch');
  // stopped / negative-flow / reversed rows inside the minute block the comparison even on the ΔP-only path
  for (const bad of [[20, 100, PD.below, 100, 0], [20, 100, PD.below, -5, 1500], [20, 100, 90, 100, 1500]]) {
    const rows = minute(0, 'below').map((r) => (r[0] === 20 ? bad : r));
    const s = sysFrom(rows); s.analysis.density = '';
    assert.equal(baseline(s, T0).reason, 'unsupportedMinute', JSON.stringify(bad));
  }
});
