// #/diagnosis — review a recorded warning as a visual story: hypothesis and next check first, visual evidence
// second, research detail in disclosures (Task015 data, Task016/017 layout, EN/RU). The clock-gated card renders
// only explainCase(sliceCase(case, clock), asset). Ground truth is a separate opt-in overlay; the scorecard is
// retrospective benchmark context and is not clock-gated.
import { MINUTE_MS, parseUtc, formatUtc } from './replay.js';
import { CHANNEL_LABELS } from './knowledge.js';
import { sliceCase, sliceCaseLabel, explainCase } from './comparison.js';
import { t, getLang, CHANNEL_RU } from './i18n.js';
import { pumpSchematic, spreadBars, flowSpark, snapshotTimeline, featureBars } from './review-visuals.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (cls, text) => `<span class="state ${cls}">${esc(text)}</span>`;
const label = (c) => (getLang() === 'ru' ? CHANNEL_RU[c] : CHANNEL_LABELS[c]) ?? c;
const humanFault = (x) => String(x ?? '').toLowerCase().replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
const GAP = { 'not-installed': ['s-gray', 'Not installed'], 'no-z': ['s-attn', 'Unavailable'], limitation: ['s-attn', 'Limitation'] };

const st = { status: 'idle', data: null, error: null, caseId: null, clocks: {}, showLabels: false, techOpen: false, appliedQuery: null };

function load(rerender) {
  if (st.status !== 'idle' && st.status !== 'error') return;
  st.status = 'loading';
  fetch('data/diagnosis-comparison.json', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`data/diagnosis-comparison.json: HTTP ${r.status}`); return r.json(); })
    .then((d) => {
      if (d.schema !== 'retrofit-doctor-diagnosis-comparison/1') throw new Error('data/diagnosis-comparison.json: unexpected schema');
      st.data = d; st.status = 'ready';
    })
    .catch((e) => { st.status = 'error'; st.error = e.message; })
    .finally(rerender);
}

const caseById = (id) => st.data.cases.find((c) => c.caseId === id) ?? st.data.cases[0];
const clockOf = (c) => st.clocks[c.caseId] ?? parseUtc(c.alertUtc);

function applyQuery(params) {
  const q = params?.toString() ?? '';
  if (q === st.appliedQuery) return;
  st.appliedQuery = q;
  const id = params?.get('case');
  if (id && st.data.cases.some((c) => c.caseId === id)) st.caseId = id;
  const tm = params?.get('t');
  const c = caseById(st.caseId);
  if (tm && !Number.isNaN(parseUtc(tm))) st.clocks[c.caseId] = parseUtc(tm);
}

function syncUrl(c) {
  const tm = new Date(clockOf(c)).toISOString().replace('.000Z', 'Z');
  const q = `case=${c.caseId}&t=${tm}`;
  st.appliedQuery = q;
  history.replaceState(null, '', `#/diagnosis?${q}`);
}

function measuredTable(rows, caption) {
  const ru = getLang() === 'ru';
  return `<div class="table-wrap" role="region" aria-label="${esc(caption || t('rv.measuredVals'))}" tabindex="0"><table class="stack">
    ${caption ? `<caption>${esc(caption)}</caption>` : ''}
    <thead><tr><th scope="col">${ru ? 'Измеряемый канал' : 'Measured channel'}</th><th scope="col" class="num">${ru ? 'Среднее' : 'Mean'}</th><th scope="col" class="num">${ru ? 'СКО' : 'Std'}</th><th scope="col" class="num">${ru ? 'Отсчётов' : 'Count'}</th></tr></thead>
    <tbody>${rows.map((m) => `<tr><th scope="row">${esc(label(m.channelId))}</th><td class="num" data-label="${ru ? 'Среднее' : 'Mean'}">${Number(m.mean).toFixed(2)} ${esc(m.unit)}</td><td class="num" data-label="${ru ? 'СКО' : 'Std'}">${Number(m.std).toFixed(2)}</td><td class="num" data-label="${ru ? 'Отсчётов' : 'Count'}">${esc(m.count)}</td></tr>`).join('')}</tbody></table></div>`;
}

function riseChart(raw) {
  const narrow = window.innerWidth < 600;
  const W = narrow ? 300 : 640; const H = 210; const L = 50; const R = 10; const T = 12; const B = 30;
  const a = raw.measuredRise_kpa; const b = raw.curveRise_kpa;
  const all = a.concat(b); let lo = Math.min(...all); let hi = Math.max(...all); const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const sx = (i) => L + (i / (a.length - 1)) * (W - L - R);
  const sy = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad].map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e3e7ec"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="#5a6573">${v.toFixed(0)}</text>`).join('');
  const xt = [0, 30, a.length - 1].map((i) => `<text x="${sx(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}" font-size="11" fill="#5a6573">${esc(raw.t[i].slice(11, 19))}</text>`).join('');
  return `<figure class="rise-chart"><figcaption class="small"><b>${esc(t('vis.riseH'))}</b></figcaption>
    <ul class="legend small"><li><svg width="20" height="8" aria-hidden="true"><line x1="0" x2="20" y1="4" y2="4" stroke="#1f5fbf" stroke-width="2"/></svg> ${esc(t('vis.measuredRise'))}</li>
      <li><svg width="20" height="8" aria-hidden="true"><line x1="0" x2="20" y1="4" y2="4" stroke="#b35c00" stroke-width="2" stroke-dasharray="4 3"/></svg> ${esc(t('vis.curveRise'))}</li></ul>
    <div class="plot-scroll" role="region" aria-label="${esc(t('vis.riseH'))}" tabindex="0">
    <svg viewBox="0 0 ${W} ${H}" class="plot${narrow ? ' plot-fixed' : ''}" style="--plot-w:${W}px" role="img" aria-label="${esc(t('vis.riseH'))}: ${a.length} × 1 s">
      ${ticks}<path d="${path(b)}" fill="none" stroke="#b35c00" stroke-width="1.4" stroke-dasharray="4 3"/><path d="${path(a)}" fill="none" stroke="#1f5fbf" stroke-width="1.6"/>
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#aab3be"/>${xt}
    </svg></div>
    <p class="small muted">${esc(t('vis.riseNote'))}</p></figure>`;
}

function technicalDetails(e, s) {
  const tc = e.technical;
  const exact = [...(e.derived ?? []), ...(e.features ?? [])];
  return `<details class="panel-sub" id="cmp-tech"${st.techOpen ? ' open' : ''}><summary>${esc(t('rv.tech'))}</summary>
      ${t('rv.techNote') ? `<p class="small muted">${esc(t('rv.techNote'))}</p>` : ''}
      <div lang="en">
      ${exact.length ? `<ul class="tight small">${exact.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${e.gaps.length ? `<ul class="tight small">${e.gaps.map((g) => `<li>${pill(...GAP[g.kind])} ${esc(g.text)}</li>`).join('')}</ul>` : ''}
      <dl class="kv small">
        <dt>Earlier method (B1)</dt><dd><span class="mono">${esc(tc.b1.event_class)} · ${esc(tc.b1.fault_type)}</span><div><span class="verbatim">${esc(tc.b1.evidence)}</span></div><div>Recommendation: <span class="verbatim">${esc(tc.b1.recommended_action)}</span></div></dd>
        <dt>Selected method (Z995)</dt><dd><span class="mono">${esc(tc.z995.event_class)} · ${esc(tc.z995.fault_type)} · source ${esc(tc.z995.source)}</span><div><span class="verbatim">${esc(tc.z995.evidence)}</span></div>
          <div>Recommendation: <span class="verbatim">${esc(tc.z995.action)}</span> <span class="muted">${esc(tc.actionNote)}</span></div></dd>
        <dt>Anomaly score</dt><dd><span class="num">${esc(tc.score)}</span> · exact <span class="mono">${esc(tc.scoreExact)}</span></dd>
        <dt>Pressure-and-flow check (E995)</dt><dd>${esc(e.hydraulic.text)}${e.hydraulic.reason ? ` Reason: <span class="mono">${esc(e.hydraulic.reason)}</span>.` : ''}${e.hydraulic.tailRank != null && e.kind !== 'residual' ? ` Reference-tail rank ${esc(Number(e.hydraulic.tailRank).toFixed(6))} (rule limit 0.005).` : ''}</dd>
        ${s.rawMinute ? `<dt>Equation</dt><dd class="mono">${esc(s.rawMinute.equation)}</dd><dt>Raw source</dt><dd class="mono">${esc(s.rawMinute.source)}; ${esc(s.rawMinute.window)}; recomputed std(E) ${esc(s.rawMinute.recomputedStdE_kpa)} kPa</dd>` : ''}
        <dt>Assumptions</dt><dd>${esc(tc.ruleDetail.assumptions)}</dd>
      </dl>
      <details class="panel-sub"><summary>${esc(t('rv.json'))}</summary>
        <p class="small muted">Covariance terms in kPa², shares, term variances, applicability incl. NPSH and curve check. Shares are variance-decomposition terms, not causal-confidence percentages; tail_rank is a rank in the empirical reference, not a p-value.</p>
        <pre class="json small" tabindex="0">${esc(JSON.stringify(tc.ruleDetail, null, 1))}</pre></details>
      </div>
    </details>`;
}

// Highlights only from an available explanation (never before the warning).
export function schematicFocus(e) {
  if (!e.available) return {};
  if (e.kind === 'residual') return { focus: [e.sourceChannel] };
  if (e.kind === 'waveform') return { focus: ['vibration_rms_mm_s'] };
  return { focus: e.technical?.b1?.suspected_channel ? [e.technical.b1.suspected_channel] : [], proposed: e.missingChannel && !e.missingInstalled ? [e.missingChannel] : [] };
}

function card(c, asset) {
  const lang = getLang();
  const s = sliceCase(c, clockOf(c));
  const e = explainCase(s, asset, { lang });
  const where = esc(t('rv.where', { id: c.assetId, t: formatUtc(parseUtc(c.alertUtc), { seconds: true }) }));
  const sensorsLink = `<a class="button" href="#/pumps/${esc(c.assetId)}">${esc(t('rv.checkSensors'))}</a>`;
  if (!e.available) {
    return `<section class="panel review" aria-labelledby="cmp-h"><p class="review-where">${where}</p>
      <h2 id="cmp-h" tabindex="-1">${esc(e.kind === 'rejected' ? t('rv.rejected') : t('rv.notYet'))}</h2>
      <div class="review-grid"><div class="evid"><div class="empty">${esc(e.text)}${e.snapshot ? `<br><span class="small">${esc(e.snapshot)}</span>` : ''}</div></div>
        <aside class="sch-side">${pumpSchematic(asset)}<p>${sensorsLink}</p></aside></div></section>`;
  }
  const p = e.plain;
  let visuals = '';
  if (e.kind === 'residual') visuals = `${spreadBars(e, s)}${s.rawMinute ? riseChart(s.rawMinute) : ''}${s.rawMinute ? flowSpark(s.rawMinute) : ''}`;
  else if (e.kind === 'waveform') visuals = `${snapshotTimeline(e.snapshot, s.alertMs, s.clockMs)}${featureBars(e, s.z995.fault_type === 'BEARING_WEAR')}`;
  else visuals = `<h4>${esc(t('vis.gapH'))}</h4><div class="gap-visual"><span class="gap-chip">${esc(label(e.missingChannel ?? 'flow_m3_h'))} · ${esc(t('vis.missing'))}</span><p class="small">${esc(t('vis.gapNote'))}</p></div>`;
  const assess = e.kind === 'unsupported' && e.capability;
  return `<section class="panel review" aria-labelledby="cmp-h">
    <p class="review-where">${where}${s.clockMs > s.alertMs ? ` · <span class="muted">${esc(e.timing.replace(/^[^;]*; /, ''))}</span>` : ''}</p>
    <h2 id="cmp-h" tabindex="-1">${esc(p.title)}</h2>
    <p class="review-lead">${esc(p.summary)}</p>
    <div class="review-actions">
      <button type="button" class="primary" data-jump="cmp-next-h">${esc(t('rv.seeNext'))}</button>
      ${assess ? `<a class="button primary" href="${esc(e.capability.href)}">${esc(t('rv.assess'))}</a>` : `<button type="button" data-jump="cmp-evid-h">${esc(t('rv.seeEvidence'))}</button>`}
      ${sensorsLink}
    </div>
    <div class="review-grid">
      <div class="evid"><h3 id="cmp-evid-h" tabindex="-1">${esc(t('rv.evidence'))}</h3>${visuals}</div>
      <aside class="sch-side">
        <div class="action-panel" aria-labelledby="cmp-next-h">
          <h3 id="cmp-next-h" tabindex="-1">${esc(t('rv.next'))} ${pill('s-gray', t('rv.advisoryPill'))}</h3>
          <p class="action-text">${esc(e.nextCheck.text)}</p>
          <p class="uncert small">${esc(p.caution)}</p>
          <details class="action-more small"><summary>${esc(t('rv.whyLimits'))}</summary>
            <p><b>${esc(t('rv.why'))}</b> ${esc(e.nextCheck.reason.replace(/^Proposed check\. ?/, ''))}</p>
            <p><b>${esc(t('rv.certain'))}</b> ${esc(p.uncertainty)}</p>
            <p class="muted">${esc(t('rv.advisory'))}</p></details>
        </div>
        ${pumpSchematic(asset, schematicFocus(e))}
      </aside>
    </div>
    <details class="panel-sub" id="cmp-expl"><summary>${esc(t('rv.explDetails'))}</summary>
      <ul class="why-list">${p.observations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${e.alternatives.length ? `<p class="small"><span class="muted">${esc(t('rv.alts'))}</span> ${e.alternatives.map(esc).join('; ')}.</p>` : ''}
    </details>
    ${e.measured?.length ? `<details class="panel-sub"><summary>${esc(t('rv.measuredVals'))}</summary>${measuredTable(e.measured, e.kind === 'residual' ? `${e.pairedRows} / ${e.rowsTotal} · 1 s` : '')}</details>` : ''}
    <details class="panel-sub"><summary>${esc(t('rv.changed'))}</summary>
      <p class="small">${esc(t('rv.earlier'))}: <b>${esc(e.before.label)}</b> → ${esc(t('rv.selected'))}: <b>${esc(e.after.label)}</b>${e.changed ? '' : ` ${esc(t('rv.unchanged'))}`}.</p>
      ${lang === 'ru' ? '' : `<p class="small">${esc(e.headline)} ${esc(e.caveat)}</p>${e.w1Note ? `<p class="small">${esc(e.w1Note)}</p>` : ''}`}
      ${e.capability ? `<p class="small">${esc(e.capability.text)}</p>` : ''}
    </details>
    ${technicalDetails(e, s)}
  </section>`;
}

function labelsPanel(c) {
  const l = st.showLabels ? sliceCaseLabel(c, clockOf(c)) : null;
  const ruFault = { SENSOR_NOISE_SPIKES: 'Шум или выбросы датчика', MISALIGNMENT: 'Расцентровка', BEARING_WEAR: 'Износ подшипника', SUCTION_STRAINER_CLOGGING: 'Засорение фильтра на всасывании' };
  const fault = (x) => (getLang() === 'ru' ? ruFault[x] ?? humanFault(x) : humanFault(x));
  return `<section class="panel eval-panel" aria-labelledby="cmp-eval-h"><h2 id="cmp-eval-h">${esc(t('rv.truthH'))}</h2>
    <label class="check"><input id="cmp-labels" type="checkbox"${st.showLabels ? ' checked' : ''}> ${esc(t('rv.truthToggle'))}</label>
    <p class="small muted">${esc(t('rv.truthNote'))}</p>
    ${st.showLabels ? (l ? `<p class="small">${pill('s-eval', t('rv.truthPill'))} <b>${esc(fault(l.fault_type))}${l.sensor_tag ? ` · ${esc(label(l.sensor_tag).toLowerCase())}` : ''}</b> <span class="small muted mono">${esc(l.event_id)} · ${esc(l.event_class)} · ${esc(l.fault_type)}${l.sensor_tag ? ` · ${esc(l.sensor_tag)}` : ''}</span> · ${esc(t('rv.onset'))} ${esc(formatUtc(parseUtc(l.onset_utc), { seconds: true }))} · ${l.endWithheld ? esc(t('rv.endHidden')) : `${esc(t('rv.end'))} ${esc(formatUtc(parseUtc(l.end_utc), { seconds: true }))}`}</p>`
      : `<p class="small">${esc(clockOf(c) < parseUtc(c.alertUtc) ? t('rv.truthBefore') : t('rv.truthNone'))}</p>`) : ''}
  </section>`;
}

const METRICS = {
  en: [['type_correct', 'Correct fault type (events)'], ['sensor_type_and_channel', 'Sensor faults: correct type and channel'], ['detected', 'Detected events'],
    ['false_plus_excess', 'False episodes + excess repeats'], ['nuisance_benign', 'Nuisance alerts in benign windows'], ['wrong_specific_first', 'Wrong specific first diagnosis'],
    ['alerts', 'Alerts emitted'], ['composite_score', 'Benchmark composite (not accuracy)']],
  ru: [['type_correct', 'Верный тип неисправности (события)'], ['sensor_type_and_channel', 'Отказы датчиков: верные тип и канал'], ['detected', 'Обнаруженные события'],
    ['false_plus_excess', 'Ложные эпизоды + лишние повторы'], ['nuisance_benign', 'Мешающие предупреждения в нормальных окнах'], ['wrong_specific_first', 'Неверный конкретный первый диагноз'],
    ['alerts', 'Выдано предупреждений'], ['composite_score', 'Составной балл бенчмарка (не точность)']],
};

function eventsTable(sc, split) {
  const ru = getLang() === 'ru';
  const side = (x) => (x.detected ? `${esc(x.type ?? '—')}${x.channel ? ` <span class="small muted">${esc(label(x.channel))}</span>` : ''}${x.typeCorrect ? ' ✓' : ''}` : (ru ? 'Не обнаружено' : 'Not detected'));
  return `<div class="table-wrap" role="region" aria-label="${esc(split)}" tabindex="0"><table>
    <caption>${esc(sc.scope)}. ${ru ? 'Истина — симулированная метка. ✓ = верный тип неисправности.' : 'Ground truth is the simulated label. ✓ = correct fault type.'}</caption>
    <thead><tr><th scope="col">${ru ? 'Событие' : 'Event'}</th><th scope="col">${ru ? 'Истина' : 'Ground truth'}</th><th scope="col">${ru ? 'B1: первый диагноз' : 'B1 first diagnosis'}</th><th scope="col">${ru ? 'Z995: первый диагноз' : 'Z995 first diagnosis'}</th><th scope="col">${ru ? 'Изменение' : 'Change'}</th></tr></thead>
    <tbody>${sc.events.map((e) => `<tr><th scope="row">${esc(e.eventId)}</th><td>${esc(e.faultType)}${e.sensorTag ? ` <span class="small muted">${esc(e.sensorTag)}</span>` : ''}</td>
      <td>${side(e.b1)}</td><td>${side(e.z995)}</td><td>${e.changed ? (e.z995.typeCorrect && !e.b1.typeCorrect ? pill('s-ok', ru ? 'Улучшение' : 'Gain') : pill('s-attn', ru ? 'Изменено' : 'Changed')) : `<span class="muted small">${ru ? 'без изменений' : 'unchanged'}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
}

function scorecard(d) {
  const ru = getLang() === 'ru';
  const { train, validation } = d.scorecard;
  const cell = (v, k) => (k === 'composite_score' ? Number(v).toFixed(2) : esc(v));
  const changes = (sc) => `<ul class="tight small">${sc.changedAlerts.map((a) => `<li><span class="num">${esc(formatUtc(parseUtc(a.alertUtc)))}</span> ${esc(a.assetId)}: ${esc(a.b1)}${a.b1Channel ? ` (${esc(label(a.b1Channel))})` : ''} → ${esc(a.z995)}${a.z995Channel ? ` (${esc(label(a.z995Channel))})` : ''} · ${esc(a.source)}</li>`).join('')}</ul>`;
  const tr = ru ? 'Обучение' : 'Train'; const va = ru ? 'Валидация' : 'Validation';
  return `<section class="panel" aria-labelledby="sc-h"><h2 id="sc-h">${esc(t('rv.resultsH'))}</h2>
    <p class="small">${pill('s-eval', ru ? 'Ретроспективно · по всей записи' : 'Retrospective · whole recordings')} ${ru
      ? 'Сравнение прежнего метода (B1) и выбранного (Z995) по всем симулированным событиям. Не привязано к времени наблюдения выше. На обучающих насосах метод разрабатывался; валидационные насосы уже были просмотрены, поэтому их результат описательный.'
      : 'How the earlier method (B1) and the selected method (Z995) compare on every simulated event. Not tied to the observation time above. Training pumps were used to develop the method; validation pumps had already been inspected, so their result is descriptive.'}</p>
    <div class="table-wrap" role="region" aria-label="B1 / Z995" tabindex="0"><table>
      <thead><tr><th scope="col">${ru ? 'Показатель' : 'Metric'}</th><th scope="col" class="num">${tr} B1</th><th scope="col" class="num">${tr} Z995</th><th scope="col" class="num">${va} B1</th><th scope="col" class="num">${va} Z995</th></tr></thead>
      <tbody>${METRICS[ru ? 'ru' : 'en'].map(([k, x]) => `<tr><th scope="row">${esc(x)}</th><td class="num">${cell(train.b1[k], k)}</td><td class="num">${cell(train.z995[k], k)}</td><td class="num">${cell(validation.b1[k], k)}</td><td class="num">${cell(validation.z995[k], k)}</td></tr>`).join('')}
      <tr><th scope="row">${ru ? 'Охват' : 'Scope'}</th><td colspan="2" class="small">${ru ? '7 насосов · 26 событий · 49 насосо-суток' : esc(train.scope)}</td><td colspan="2" class="small">${ru ? '2 насоса · 9 событий · 14 насосо-суток · уже просмотрены' : esc(validation.scope)}</td></tr></tbody></table></div>
    <p class="small">${ru
      ? `Обучение: меняются только ${train.changedAlerts.length} вывода предупреждений, новых предупреждений нет. Валидация: меняются ${validation.changedAlerts.length} вывода, все для одного события износа подшипника (PUMP-08-E02), то есть это одно исправленное событие. Для валидации нет применимых проверок по сырым данным: у PUMP-08 нет расходомера, у PUMP-09 — измерения частоты вращения; прирост на валидации дан только правилом по записи вибрации. Пропущенные события остаются пропущенными, например PUMP-08-E04 (шум давления).`
      : `Train: only ${train.changedAlerts.length} alert outputs change and no new alerts are created. Validation: ${validation.changedAlerts.length} alert outputs change, all for the same bearing event (PUMP-08-E02), so they count as one corrected event. ${esc(validation.rawNote)} Missed events stay missed, e.g. PUMP-08-E04 (pressure noise).`}</p>
    <details class="panel-sub"><summary>${ru ? 'Каждое изменённое предупреждение и каждое событие: обучение (26) и валидация (9)' : 'Every changed alert and every event, train (26) and validation (9)'}</summary>
      <h3>${ru ? 'Изменённые выводы · обучение' : 'Changed alert outputs · train'}</h3>${changes(train)}
      <h3>${ru ? 'Изменённые выводы · валидация' : 'Changed alert outputs · validation'}</h3>${changes(validation)}
      <h3>${ru ? 'События обучения' : 'Train events'}</h3>${eventsTable(train, tr)}
      <h3>${ru ? 'События валидации' : 'Validation events'}</h3>${eventsTable(validation, va)}
      <p class="small muted">${ru ? 'Отклонённые и уступившие кандидаты (R3, R5, Y3, Y5; E995 отдельно тоже прошёл, но уступил Z995) сохранены в' : 'Rejected and runner-up candidates (R3, R5, Y3, Y5; E995 alone also passed but ranked below Z995) remain preserved in'} <span class="mono">${esc(d.provenance.train.runDir)}</span>. ${ru ? 'Замороженный релиз слепого теста не изменён и остаётся экспортом фиксированной модели с раскрытым доступом до гейта.' : 'The frozen test release is unchanged and remains a fixed-model test export with disclosed pre-gate access.'}</p>
    </details>
    <details class="panel-sub"><summary>${ru ? 'Происхождение: закрытые прогоны, манифесты и хэши источников' : 'Provenance: sealed runs, manifests and source hashes'}</summary>
      <dl class="kv small"><dt>Generator</dt><dd class="mono">${esc(d.provenance.generator)}</dd>
        <dt>Train run</dt><dd class="mono">${esc(d.provenance.train.runDir)} · manifest ${esc(d.provenance.train.manifestSha256)}</dd>
        <dt>Validation run</dt><dd class="mono">${esc(d.provenance.validation.runDir)} · manifest ${esc(d.provenance.validation.manifestSha256)}</dd></dl>
      <ul class="tight small mono">${Object.entries(d.provenance.filesRead).map(([p, h]) => `<li>${esc(p)} · ${esc(h)}</li>`).join('')}</ul>
    </details>
  </section>`;
}

const ABOUT = {
  en: ['The operator replay pages still use the earlier causal B1 detector; this review shows a research method (Z995) next to it at the same warning times.',
    'The pressure-and-flow check (E995) improved one training event; no validation pump had flow, suction, discharge and measured speed together, so it has no validation support yet.',
    'The vibration-recording rule (W1) refined one validation event (PUMP-08-E02), which is the whole validation gain.',
    'Scores carried over from B1 are uncalibrated anomaly scores, never a confidence in the cause. No failure probability, field ROI or certification is implied. The frozen blind-test release is unchanged.'],
  ru: ['Страницы поминутного воспроизведения по-прежнему используют прежний причинный детектор B1; этот разбор показывает рядом исследовательский метод (Z995) в те же моменты предупреждений.',
    'Проверка «давление–расход» (E995) улучшила одно обучающее событие; ни у одного валидационного насоса не было одновременно расхода, давлений всасывания и нагнетания и измеренной частоты вращения, поэтому подтверждения на валидации пока нет.',
    'Правило по записи вибрации (W1) уточнило одно валидационное событие (PUMP-08-E02) — это весь прирост на валидации.',
    'Оценки, перенесённые из B1, — некалиброванные оценки аномальности, а не уверенность в причине. Вероятность отказа, эффект в эксплуатации и сертификация не подразумеваются. Замороженный релиз слепого теста не изменён.'],
};
const NOTICE_RU = 'Исследовательское сравнение, а не замена рабочего детектора. Синтетические измерения бенчмарка; Z995 разрабатывался адаптивно на просмотренных обучающих насосах; валидация (PUMP-08/09) уже была просмотрена, поэтому её результат описательный. Тестовых насосов, телеметрии и прогнозов здесь нет.';

function about(d) {
  const ru = getLang() === 'ru';
  return `<details class="panel about" id="cmp-about"><summary><b>${esc(t('rv.about'))}</b> <span class="small muted">· ${esc(t('rv.aboutSub'))}</span></summary>
    <p class="small">${esc(ru ? NOTICE_RU : d.notice)}</p>
    <ul class="tight small">${ABOUT[ru ? 'ru' : 'en'].map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
}

export function renderDiagnosisPage(route, assetById, rerender) {
  if (st.status === 'idle') load(rerender);
  if (st.status === 'loading') return `<h1>${esc(t('rv.h1'))}</h1><p class="loading" role="status">${esc(t('rv.loading'))}</p>`;
  if (st.status === 'error') return `<h1>${esc(t('rv.h1'))}</h1><div class="error" role="alert">${esc(t('rv.error'))}: <span class="mono">${esc(st.error)}</span></div><p><button id="cmp-retry" class="primary">${esc(t('rv.retry'))}</button></p>`;
  applyQuery(route.params);
  const d = st.data;
  const c = caseById(st.caseId);
  st.caseId = c.caseId;
  const clock = clockOf(c);
  const alertMs = parseUtc(c.alertUtc);
  const phase = clock < alertMs ? t('rv.before') : clock === alertMs ? t('rv.at') : t('rv.after');
  return `<h1>${esc(t('rv.h1'))}</h1>
    <p class="sub">${esc(t('rv.sub'))} ${pill('s-gray', t('rv.badge'))}</p>
    <div class="case-pick" role="group" aria-label="${esc(t('rv.examples'))}">${d.cases.map((x) => `<button type="button" data-case="${esc(x.caseId)}" aria-pressed="${x.caseId === c.caseId}"><b>${esc(x.assetId)}</b> · ${esc(t(`rv.ex.${x.caseId}`))}<span class="small muted">${esc(formatUtc(parseUtc(x.alertUtc)))}</span></button>`).join('')}</div>
    <section class="clockbar time-panel" aria-label="${esc(t('rv.time'))}">
      <div><div class="small muted">${esc(t('rv.time'))}</div><div class="asof" aria-live="polite">${esc(formatUtc(clock, { seconds: true }))}</div><div class="small muted">${esc(phase)}</div></div>
      <div class="controls" role="group" aria-label="${esc(t('rv.replay'))}">
        <span class="small muted">${esc(t('rv.replay'))}</span>
        <button type="button" id="cmp-before" class="${clock === alertMs - 1000 ? 'primary' : ''}">${esc(t('rv.btnBefore'))} <span class="small">(−1 s)</span></button>
        <button type="button" id="cmp-at" class="${clock === alertMs ? 'primary' : ''}">${esc(t('rv.btnAt'))}</button>
      </div>
      <div class="controls step-controls" role="group" aria-label="${esc(t('rv.step'))}">
        <span class="small muted">${esc(t('rv.step'))}</span>
        <button type="button" id="cmp-m1" aria-label="${esc(t('rv.back1'))}">−1 min</button>
        <button type="button" id="cmp-p1" aria-label="${esc(t('rv.fwd1'))}">+1 min</button>
        <button type="button" id="cmp-p60" aria-label="${esc(t('rv.fwd60'))}">+1 h</button>
        <button type="button" id="cmp-p1d" aria-label="${esc(t('rv.fwd1d'))}">+1 ${getLang() === 'ru' ? 'сут' : 'day'}</button>
      </div>
    </section>
    ${card(c, assetById(c.assetId))}
    ${labelsPanel(c)}
    ${scorecard(d)}
    ${about(d)}`;
}

export function bindDiagnosis(main, rerender) {
  const on = (id, ev, fn) => { const el = main.querySelector(`#${id}`); if (el) el.addEventListener(ev, fn); };
  on('cmp-retry', 'click', () => { st.status = 'idle'; rerender(); });
  if (st.status !== 'ready') return;
  const c = caseById(st.caseId);
  const alertMs = parseUtc(c.alertUtc);
  const set = (ms) => { st.clocks[c.caseId] = ms; syncUrl(c); rerender(); };
  on('cmp-before', 'click', () => set(alertMs - 1000));
  on('cmp-at', 'click', () => set(alertMs));
  on('cmp-m1', 'click', () => set(clockOf(c) - MINUTE_MS));
  on('cmp-p1', 'click', () => set(clockOf(c) + MINUTE_MS));
  on('cmp-p60', 'click', () => set(clockOf(c) + 60 * MINUTE_MS));
  on('cmp-p1d', 'click', () => set(clockOf(c) + 1440 * MINUTE_MS));
  on('cmp-labels', 'change', (e) => { st.showLabels = e.target.checked; rerender(); });
  on('cmp-tech', 'toggle', (e) => { st.techOpen = e.target.open; });
  main.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.jump); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true });
  }));
  main.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => {
    st.caseId = b.dataset.case; st.showLabels = false; st.techOpen = false; syncUrl(caseById(st.caseId)); rerender();
  }));
}

// Route-specific provenance footer (this bundle, not the baseline demo bundle).
export function diagnosisFooter() {
  if (st.status !== 'ready') return null;
  const p = st.data.provenance;
  return getLang() === 'ru' ? `Пакет сравнения создан ${p.generator} из ${Object.keys(p.filesRead).length} хэшированных исходных файлов.`
    : `Comparison bundle generated by ${p.generator} from ${Object.keys(p.filesRead).length} hashed source files.`;
}

// Recorded review cases for the Fleet entry page (loads the bundle once; null until ready).
export function reviewCases(rerender) {
  if (st.status === 'idle') load(rerender);
  return st.status === 'ready' ? st.data.cases : null;
}
