// Retrofit Planner view. Uses public passport metadata only; never replay telemetry, alerts or labels.
// Proposals are hypotheses kept in a per-pump local draft; installed inventory is read-only.
import { evaluateModel, OPTION_IDS, BASELINE, MAX_HORIZON_YEARS } from './cost-model.js';
import {
  CHOICES, CANDIDATES, ONE_TIME_CATEGORIES, RECURRING_CATEGORIES, CATEGORY_LABEL, BASES, OPTION_LABEL, ANSWER_STATES,
  redundantPumpPreset, emptyEconomics, physicalPackage, proposedChannels, PRESET_TITLE, PRESET_NOTICE, ORGANIZER_BOM_NOTE,
} from './planner-content.js';
import { createDraftStore, addCandidate, removeCandidate, reviewReadiness, draftQuestions, editLineValue, editGroupValue } from './planner-store.js';
import { CHANNEL_LABELS, ALL_CHANNELS, CHANNEL_PLACEMENT } from './knowledge.js';
import { renderSchematic, bindSchematic } from './schematic.js';
import { tx, txMsg, L } from './ru-text.js';
import { getLang, CHANNEL_RU } from './i18n.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (cls, text) => `<span class="state ${cls}">${esc(text)}</span>`;
const label = (c) => (getLang() === 'ru' ? CHANNEL_RU[c] : CHANNEL_LABELS[c]) ?? c;
// Display-only translations; stored draft values and option values stay as the original keys.
const cz = ([cls, text]) => [cls, tx(text)];
const EXISTING_RU = {
  'suction pressure transmitter': 'датчик давления на всасывании', 'discharge pressure transmitter': 'датчик давления нагнетания', 'flow meter': 'расходомер',
  'motor input power reading': 'показание потребляемой мощности двигателя', 'motor current reading': 'показание тока двигателя', 'bearing-housing vibration sensor': 'датчик вибрации корпуса подшипника',
  'bearing-housing temperature sensor': 'датчик температуры корпуса подшипника', 'motor winding temperature sensor': 'датчик температуры обмотки двигателя', 'valve position feedback': 'обратная связь положения клапана',
};
// Physical-package element names are composed in planner-content.js; render them in Russian without changing the data.
const pkgEl = (el) => {
  if (getLang() !== 'ru') return el;
  let m = /^Existing signals of this pump \(public passport, synthetic benchmark\): (\d+) channels$/.exec(el);
  if (m) return `Имеющиеся сигналы этого насоса (открытый паспорт, синтетический бенчмарк): каналов ${m[1]}`;
  m = /^Existing (.+) \((.+)\)$/.exec(el);
  if (m) return `Имеющийся ${EXISTING_RU[m[1]] ?? m[1]} (${tx(m[2])})`;
  return tx(el);
};
const pb = (lbl) => (getLang() !== 'ru' || !lbl ? tx(lbl) : lbl.replace(/^Cumulative recovery in year (\d+)$/, 'Накопленная окупаемость в год $1').replace(/^Simple payback ([\d.]+) years \(undiscounted\)$/, 'Простая окупаемость $1 лет (без дисконтирования)').replace(/^.*$/, (m) => tx(m)));
const cadence = (s) => (s >= 60 ? `${s / 60} ${L('min', 'мин')}` : `${s} ${L('s', 'с')}`);
const eur = (v) => {
  if (v == null) return '—';
  const r = Math.round(v);
  return `${r < 0 ? '−' : ''}EUR ${Math.abs(r).toLocaleString('en-US')}`;
};
const num = (v, d = 2) => (v == null ? '—' : Number(v.toFixed(d)).toString());
const CONCLUSION = {
  NEEDS_EVIDENCE: ['s-gray', 'Needs evidence'],
  DEFER: ['s-attn', 'Defer under current assumptions'],
  REVIEW_CANDIDATE: ['s-info', 'Candidate for engineering review'],
};

// Web Storage access itself may throw (blocked site data); the store reports that as a failure.
const browserStorage = {
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => window.localStorage.setItem(k, v),
  removeItem: (k) => window.localStorage.removeItem(k),
};
const store = createDraftStore(browserStorage);

export const plannerState = { drafts: {}, load: {}, message: {}, dirty: {}, confirm: null, tab: 'minimal', editorOpen: false, compareOpen: false, schematicSel: {} };

function draftFor(assetId) {
  if (!plannerState.drafts[assetId]) {
    const r = store.load(assetId);
    plannerState.drafts[assetId] = r.draft;
    plannerState.load[assetId] = r;
  }
  return plannerState.drafts[assetId];
}

function setPath(obj, path, value) {
  const keys = path.split('.'); const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

function field({ id, path, value, labelText, errors, type = 'text', inputmode = 'decimal', width = '', hint = '' }) {
  const err = errors?.[path];
  return `<label for="${id}">${esc(labelText)}${hint ? ` <span class="small muted">${esc(hint)}</span>` : ''}
    <input id="${id}" data-path="${esc(path)}" type="${type}" ${type === 'text' ? `inputmode="${inputmode}"` : ''} value="${esc(value)}" ${width ? `style="width:${width}"` : ''}
      ${err ? `aria-invalid="true" aria-describedby="${id}-err"` : ''}></label>${err ? `<span id="${id}-err" class="field-error" role="alert">${esc(txMsg(err))}</span>` : ''}`;
}

function coverageSection(asset) {
  const installed = new Set(asset.channelsAvailable);
  const meta = Object.fromEntries(asset.channels.map((c) => [c.channelId, c]));
  const missing = ALL_CHANNELS.filter((c) => !installed.has(c));
  return `<section class="panel" aria-labelledby="pl-cov"><h2 id="pl-cov">${L('Existing coverage · public passport', 'Имеющееся оснащение · открытый паспорт')}</h2>
    <p class="small muted">${L('Read-only inventory from', 'Перечень только для чтения из')} <span class="mono">assets.csv</span>${L('. Proposals below never change it. Mounting, access and actual topology are unknown; no duty/standby pairing is inferred.', '. Предложения ниже его не меняют. Крепление, доступ и реальная топология неизвестны; пары «рабочий/резервный» не выводятся.')}</p>
    <ul class="tight small">${asset.channelsAvailable.map((c) => `<li>${esc(label(c))} · ${L('native', 'период')} ${esc(cadence(meta[c].nativeUpdateSeconds))} ${pill('s-info', L('Installed (synthetic benchmark)', 'Установлен (синтетический бенчмарк)'))}</li>`).join('')}</ul>
    <h3>${L('Not instrumented (', 'Не установлено (')}${missing.length})</h3>
    ${missing.length ? `<ul class="tight small">${missing.map((c) => `<li>${esc(label(c))} ${pill('s-gray', tx('Not instrumented'))}${c === 'motor_speed_rpm' ? ` <span class="muted">${L('no measured speed; rated', 'нет измеренной частоты; номинальные')} ${asset.ratedRpmMetadata}${L(' rpm is passport metadata, not a measurement', 'об/мин — паспортные данные, а не измерение')}</span>` : ''}</li>`).join('')}</ul>` : `<p class="small">${L('All benchmark channels are installed.', 'Установлены все каналы бенчмарка.')}</p>`}
  </section>`;
}

function answerBlock(draft, q, idx) {
  const a = draft.answers[q.key] ?? { state: 'not_assessed', text: '' };
  const id = `ans-${idx}`;
  const needsText = (a.state === 'drafted' || a.state === 'na') && !String(a.text ?? '').trim();
  return `<div class="question"><div class="qlabel" id="${id}-l">${esc(tx(q.label))}</div>
    <div class="qrow"><select id="${id}-s" data-answer="${esc(q.key)}" data-field="state" aria-labelledby="${id}-l">${ANSWER_STATES.map(([v, t]) => `<option value="${v}"${a.state === v ? ' selected' : ''}>${esc(tx(t))}</option>`).join('')}</select>
    <input id="${id}-t" type="text" data-answer="${esc(q.key)}" data-field="text" value="${esc(a.text)}" aria-labelledby="${id}-l" placeholder="${a.state === 'na' ? L('Rationale (required)', 'Обоснование (обязательно)') : L('Draft response or evidence needed', 'Черновик ответа или нужные данные')}"${needsText ? ` aria-invalid="true" aria-describedby="${id}-e"` : ''}></div>
    ${needsText ? `<span id="${id}-e" class="field-error">${a.state === 'na' ? L('Not applicable needs a rationale.', 'Для «неприменимо» нужно обоснование.') : L('A draft response needs text.', 'Черновику ответа нужен текст.')}</span>` : ''}</div>`;
}

function choiceSection(draft) {
  const qs = draftQuestions(draft).filter((q) => q.key.startsWith('choice-'));
  return `<section class="panel" aria-labelledby="pl-choice"><h2 id="pl-choice">${L('Review path', 'Путь рассмотрения')}</h2>
    <fieldset class="choices"><legend class="sr">${L('Choose a review path', 'Выберите путь рассмотрения')}</legend>
    ${Object.entries(CHOICES).map(([id, c]) => `<label class="choice${draft.choice === id ? ' selected' : ''}"><input type="radio" name="pl-choice" id="choice-${id}" value="${id}" data-path="choice"${draft.choice === id ? ' checked' : ''}>
      <span><b>${esc(tx(c.title))}</b><br><span class="small">${esc(tx(c.decision))}</span><br><span class="small muted">${L('Burden: ', 'Нагрузка: ')}${esc(tx(c.burden))}</span><br><span class="small muted">${L('Choose when: ', 'Выбирать, когда: ')}${esc(tx(c.when))}</span></span></label>`).join('')}
    </fieldset>
    ${qs.length ? `<h3>${L('Gate questions for this path', 'Вопросы-условия для этого пути')}</h3>${qs.map((q, i) => answerBlock(draft, q, `c${i}`)).join('')}` : ''}
  </section>`;
}

function candidateSection(asset, draft) {
  const available = CANDIDATES.filter((t) => !draft.candidates.some((c) => c.id === t.id));
  const questions = draftQuestions(draft);
  return `<section class="panel" aria-labelledby="pl-cand"><h2 id="pl-cand">${L('Proposed measurement hypotheses (', 'Предлагаемые гипотезы измерений (')}${draft.candidates.length})</h2>
    <p class="small muted">${L('Each card is a hypothesis to review, not an installed sensor, simulated measurement or tested improvement. No diagnostic uplift has been evaluated.', 'Каждая карточка — гипотеза для рассмотрения, а не установленный датчик, смоделированное измерение или проверенное улучшение. Прирост диагностики не оценивался.')}</p>
    <div class="filters">${available.length ? `<label>${L('Add candidate', 'Добавить кандидата')}<select id="cand-add-sel">${available.map((t) => `<option value="${t.id}">${esc(tx(t.title))}</option>`).join('')}</select></label>
      <button id="cand-add" type="button">${L('Add hypothesis', 'Добавить гипотезу')}</button>` : `<span class="small muted">${L('All candidate types added.', 'Все типы кандидатов добавлены.')}</span>`}</div>
    ${draft.candidates.map((c, ci) => {
      const t = CANDIDATES.find((x) => x.id === c.id);
      if (!t) return '';
      const already = t.channels.filter((ch) => asset.channelsAvailable.includes(ch));
      const qs = questions.filter((q) => q.key.startsWith(`${c.id}.`));
      return `<article class="card" aria-labelledby="cand-${c.id}-h"><h3 id="cand-${c.id}-h">${esc(tx(t.title))} ${pill('s-attn', L('Hypothesis', 'Гипотеза'))} ${pill('s-gray', tx(OPTION_LABEL[t.tier]))}</h3>
        <dl class="kv small"><dt>${L('Decision it supports', 'Какое решение поддерживает')}</dt><dd>${esc(tx(t.decision))}</dd><dt>${L('Will not resolve', 'Не решит')}</dt><dd>${esc(tx(t.willNotResolve))}</dd>
        <dt>${L('Already installed here', 'Уже установлено здесь')}</dt><dd>${already.length ? already.map((ch) => esc(label(ch))).join(', ') : L('None of the related channels', 'Нет связанных каналов')}</dd>
        <dt>${L('Placement', 'Расположение')}</dt><dd>${t.channels.length ? esc([...new Set(t.channels.map((ch) => tx(CHANNEL_PLACEMENT[ch])))].join('; ')) : L('Component-specific', 'Зависит от элемента')}; ${L('to verify on site', 'проверить на месте')}</dd>
        <dt>${L('Evidence', 'Данные')}</dt><dd>${L('Physical rationale only · benchmark-tested improvement: Not yet evaluated', 'Только физическое обоснование · улучшение на бенчмарке: ещё не оценено')}</dd></dl>
        ${t.explainer ? `<p class="note small">${esc(tx(t.explainer))}</p>` : ''}
        ${qs.map((q, i) => answerBlock(draft, q, `k${ci}-${i}`)).join('')}
        <p><button type="button" data-remove="${c.id}" id="cand-rm-${c.id}">${L('Remove hypothesis', 'Убрать гипотезу')}</button></p></article>`;
    }).join('')}
  </section>`;
}

function statusSection(asset, draft, result) {
  const ready = reviewReadiness(draft);
  const lp = plannerState.load[asset.assetId];
  const msg = plannerState.message[asset.assetId];
  const dirty = plannerState.dirty[asset.assetId];
  const confirm = plannerState.confirm?.assetId === asset.assetId ? plannerState.confirm : null;
  const econ = result.incremental.minimal; const econI = result.incremental.instrument;
  const readyCls = ready.state === 'READY_FOR_REVIEW' ? 's-info' : ready.state === 'NEEDS_EVIDENCE' ? 's-attn' : 's-gray';
  return `<section class="panel" aria-labelledby="pl-status"><h2 id="pl-status">${L('Review draft', 'Черновик рассмотрения')}</h2>
    <dl class="kv small"><dt>${L('Draft completeness', 'Полнота черновика')}</dt><dd>${pill(readyCls, tx(ready.label))}<div class="muted">${L('Answered questions only; not a design, economic or compliance approval.', 'Только отвеченные вопросы; не утверждение проекта, экономики или соответствия.')}</div></dd>
      <dt>${L('Economics · minimal', 'Экономика · минимальное')}</dt><dd>${pill(...cz(CONCLUSION[econ.conclusion]))}</dd>
      <dt>${L('Economics · instrument', 'Экономика · приборное')}</dt><dd>${pill(...cz(CONCLUSION[econI.conclusion]))}</dd>
      <dt>${L('Selected path', 'Выбранный путь')}</dt><dd>${draft.choice ? esc(tx(CHOICES[draft.choice].title)) : `<span class="muted">${L('None', 'Нет')}</span>`}</dd>
      <dt>${L('Created', 'Создан')}</dt><dd class="num">${esc(draft.createdAt?.slice(0, 16).replace('T', ' '))} UTC</dd>
      <dt>${L('Last saved', 'Последнее сохранение')}</dt><dd class="num">${draft.savedAt ? `${esc(draft.savedAt.slice(0, 16).replace('T', ' '))} UTC` : L('Not saved in this browser', 'Не сохранён в этом браузере')}</dd></dl>
    ${lp?.message ? `<p class="note small" role="note">${esc(txMsg(lp.message))}</p>` : ''}
    <label for="pl-notes">${L('Source and assumption notes', 'Заметки об источниках и допущениях')}<textarea id="pl-notes" data-path="notes" rows="3">${esc(draft.notes)}</textarea></label>
    ${ready.missing.length ? `<h3>${L('Unresolved review questions (', 'Нерешённые вопросы рассмотрения (')}${ready.missing.length})</h3><ul class="tight small">${ready.missing.slice(0, 8).map((q) => `<li>${esc(tx(q.scope))}: ${esc(tx(q.label))}</li>`).join('')}${ready.missing.length > 8 ? `<li>… ${L('more', 'ещё')} ${ready.missing.length - 8}</li>` : ''}</ul>` : ''}
    <div class="filters"><button id="pl-save" type="button"${draft.choice && !ready.missing.length ? ' class="primary"' : ''}>${L('Save draft in this browser', 'Сохранить черновик в этом браузере')}</button>
      <button id="pl-reset" type="button">${L('Reset draft…', 'Сбросить черновик…')}</button>
      ${dirty ? pill('s-attn', L('Unsaved changes', 'Несохранённые изменения')) : ''}</div>
    <div role="status" aria-live="polite">${msg ? (msg.ok ? pill('s-ok', txMsg(msg.message)) : `<div class="error">${esc(txMsg(msg.message))}</div>`) : ''}</div>
    ${confirm ? `<div class="confirm" role="alertdialog" aria-labelledby="pl-confirm-t"><p id="pl-confirm-t"><b>${confirm.action === 'reset' ? L('Discard this pump\'s draft, including the saved copy in this browser?', 'Удалить черновик этого насоса, включая сохранённую копию в браузере?') : L('Replace the cost model with the illustrative case? Current cost entries for this pump will be lost.', 'Заменить модель затрат иллюстративным примером? Текущие записи затрат этого насоса будут потеряны.')}</b></p>
      <button id="pl-confirm-yes" type="button" class="primary">${confirm.action === 'reset' ? L('Discard draft', 'Удалить черновик') : L('Load illustrative case', 'Загрузить иллюстративный пример')}</button> <button id="pl-confirm-no" type="button">${L('Keep editing', 'Продолжить редактирование')}</button></div>` : ''}
    <p class="small muted">${L('Saving keeps the draft in this browser only. It is not sent, approved, purchased or deployed.', 'Сохранение хранит черновик только в этом браузере. Он не отправляется, не утверждается, ничего не покупается и не развёртывается.')}</p>
  </section>`;
}

function resultsSection(model, result) {
  const errs = result.errors;
  const opt = (id) => result.options[id];
  const costCell = (s) => (s.status === 'complete' ? eur(s.total) : `<span class="muted">${tx('Cost estimate incomplete')}</span><div class="small">${L('Known cost subtotal', 'Известная часть затрат')} ${eur(s.knownSubtotal)} · ${L('excluded', 'исключено')}: ${s.exclusions.length}</div>`);
  const inc = (id) => result.incremental[id];
  const rowsInc = [
    [L('Annual incremental benefit', 'Годовая дополнительная выгода'), (r) => (r.benefitPerYear == null ? `<span class="muted">${esc(tx(r.benefitStatus))}</span>` : eur(r.benefitPerYear))],
    [L('Annual nuisance handling', 'Годовые затраты на ложные срабатывания'), (r) => (r.nuisancePerYear == null ? `<span class="muted">${esc(tx(r.nuisanceStatus))}</span>` : eur(-r.nuisancePerYear))],
    [L('Annual upkeep difference', 'Разница годового обслуживания'), (r) => (r.deltaAnnual == null ? `<span class="muted">${tx('Cost estimate incomplete')}</span>` : eur(-r.deltaAnnual))],
    [L('Annual net effect', 'Годовой чистый эффект'), (r) => (r.annualNet == null ? '—' : `<b>${eur(r.annualNet)}</b>`)],
    [L('Additional initial cost', 'Дополнительные начальные затраты'), (r) => (r.deltaInitial == null ? `<span class="muted">${tx('Cost estimate incomplete')}</span>` : eur(r.deltaInitial))],
    [`${result.horizonYears ?? '?'}${L('-year incremental lifecycle cost', ' лет: дополнительная стоимость жизненного цикла')}`, (r) => eur(r.incrementalLifecycleCost)],
    [`${result.horizonYears ?? '?'}${L('-year gross incremental benefit', ' лет: валовая дополнительная выгода')}`, (r) => eur(r.grossBenefit)],
    [`${result.horizonYears ?? '?'}${L('-year incremental NPV', ' лет: дополнительный NPV')}`, (r) => (r.npv == null ? `<span class="muted">${tx('Not estimated')}</span>` : `<b>${eur(r.npv)}</b>`)],
    [L('Payback', 'Окупаемость'), (r) => (r.payback ? esc(pb(r.payback.label)) : '—')],
    [L('Sensitivity: zero nuisance checks', 'Чувствительность: без ложных проверок'), (r) => (r.zeroNuisance ? `${eur(r.zeroNuisance.annualNet)}/${L('year', 'год')} · NPV ${eur(r.zeroNuisance.npv)}` : '—')],
    [L('Sensitivity: nuisance break-even', 'Чувствительность: безубыточность по ложным проверкам'), (r) => (r.maxNuisanceChecks ? (r.maxNuisanceChecks.value == null ? esc(tx(r.maxNuisanceChecks.label)) : `${num(r.maxNuisanceChecks.value)} ${L('checks/year', 'проверок/год')}`) : '—')],
    [L('Sensitivity: event-rate break-even', 'Чувствительность: безубыточность по частоте событий'), (r) => (r.breakEvenLambda ? (r.breakEvenLambda.value == null ? esc(tx(r.breakEvenLambda.label)) : `${num(r.breakEvenLambda.value)} ${L('events/year', 'событий/год')} <span class="small muted">${L('(threshold, not an estimate)', '(порог, не оценка)')}</span>`) : '—')],
    [L('Economic conclusion', 'Экономический вывод'), (r) => pill(...cz(CONCLUSION[r.conclusion]))],
  ];
  return `<section class="panel" aria-labelledby="pl-res"><h2 id="pl-res">${L('Lifecycle comparison', 'Сравнение жизненного цикла')}</h2>
    ${model.presetId ? `<p class="note small"><b>${esc(L(PRESET_TITLE, 'Гипотетический резервированный насос — исправный резерв и отсутствие потерь производства предполагаются'))}.</b> ${esc(L(PRESET_NOTICE, 'Иллюстративные допущения из COST_MODEL_SPEC v1, не связанные ни с одним насосом бенчмарка. Это не текущие цены, не спецификация для монтажа и не утверждение, что у выбранного насоса есть резерв.'))} ${L('Fixture assumes no additional survey, contingency, shutdown loss or removal cost outside these totals.', 'Пример не включает дополнительное обследование, резерв, потери на остановку или демонтаж сверх этих сумм.')}</p>` : ''}
    ${errs.length ? `<div class="error small" role="alert"><b>${L(`${errs.length} invalid ${errs.length === 1 ? 'entry' : 'entries'}.`, `Ошибочных значений: ${errs.length}.`)}</b> ${L('Results that depend on them are not estimated; your entries are kept.', 'Зависящие от них результаты не оцениваются; введённые значения сохранены.')}
      ${errs.filter((e) => e.field === 'economics' || /^options\.\w+$/.test(e.field)).map((e) => `<div>${esc(txMsg(e.message))}</div>`).join('')}</div>` : ''}
    ${OPTION_IDS.flatMap((id) => result.options[id].scheduled.outsideHorizon.map((x) => `<p class="note small">${esc(tx(OPTION_LABEL[id]))}: ${esc(L(`scheduled ${x.purpose || 'event'} in year ${x.year}`, `запланированное «${x.purpose || 'событие'}» в год ${x.year}`))} (${eur(x.cost)}) ${L(`is after the ${result.horizonYears}-year horizon and not included.`, `за пределами горизонта ${result.horizonYears} лет и не учтено.`)}</p>`)).join('')}
    <div class="table-wrap" role="region" aria-label="${L('Lifecycle cost by option', 'Стоимость жизненного цикла по вариантам')}" tabindex="0"><table class="stack">
      <caption>${L('Gross forward costs per option in', 'Валовые будущие затраты по вариантам в')} ${esc(model.currency)} (${esc(getLang() === 'ru' && model.taxBasis === 'excl. VAT' ? 'без НДС' : model.taxBasis)}), ${esc(getLang() === 'ru' ? ({ 'constant-real': 'постоянные цены', nominal: 'номинальные цены' }[model.moneyConvention] ?? model.moneyConvention) : `${model.moneyConvention} money`)}, d = ${esc(model.discountRate)}, H = ${esc(model.horizonYears)} ${L('years. Sunk existing equipment excluded.', 'лет. Уже имеющееся оборудование не учитывается.')}</caption>
      <thead><tr><th scope="col">${L('Option', 'Вариант')}</th><th scope="col">${L('Initial cost', 'Начальные затраты')}</th><th scope="col">${L('Annual cost', 'Годовые затраты')}</th><th scope="col">${L('Lifecycle cost excl. nuisance handling', 'Стоимость жизненного цикла без ложных срабатываний')}</th></tr></thead>
      <tbody>${OPTION_IDS.map((id) => `<tr><th scope="row">${esc(tx(OPTION_LABEL[id]))}${id === BASELINE ? `<div class="small muted">${L('Baseline', 'Базовый вариант')}: ${esc(model.baselineName === 'Existing practice: current signals and routine inspection' ? L(model.baselineName, 'Текущая практика: имеющиеся сигналы и плановый осмотр') : model.baselineName)}</div>` : ''}</th>
        <td data-label="${L('Initial cost', 'Начальные затраты')}">${costCell(opt(id).initial)}</td><td data-label="${L('Annual cost', 'Годовые затраты')}">${costCell(opt(id).annual)}</td><td data-label="${L('Lifecycle cost excl. nuisance', 'Жизненный цикл без ложных срабатываний')}">${opt(id).lifecycleCostExclNuisance == null ? `<span class="muted">${tx('Not estimated')}</span>` : eur(opt(id).lifecycleCostExclNuisance)}</td></tr>`).join('')}</tbody></table></div>
    <h3>${L('Incremental value against the baseline', 'Дополнительный эффект относительно базового варианта')}</h3>
    <div class="table-wrap" role="region" aria-label="${L('Incremental value against baseline', 'Дополнительный эффект')}" tabindex="0"><table class="stack">
      <thead><tr><th scope="col">${L('Item', 'Показатель')}</th><th scope="col">${tx(OPTION_LABEL.minimal)}</th><th scope="col">${tx(OPTION_LABEL.instrument)}</th></tr></thead>
      <tbody>${rowsInc.map(([t, fn]) => `<tr><th scope="row">${esc(t)}</th><td class="num" data-label="${tx(OPTION_LABEL.minimal)}">${fn(inc('minimal'))}</td><td class="num" data-label="${tx(OPTION_LABEL.instrument)}">${fn(inc('instrument'))}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">${L('Benefit/year', 'Выгода/год')} = λ × u × (h × c + r) + L. ${L('All entries are assumptions unless their basis says otherwise; benchmark recall, scores and alert rates are never imported. A positive NPV supports further review only; it is not an approval, guaranteed saving or purchase recommendation.', 'Все значения — допущения, если их основание не указывает иное; полнота, баллы и частота предупреждений бенчмарка не переносятся. Положительный NPV лишь поддерживает дальнейшее рассмотрение; это не утверждение, не гарантированная экономия и не рекомендация к покупке.')}</p>
  </section>`;
}


function groupProvenance(tab, group, prov) {
  const p = `economics.options.${tab}.${group}Provenance`; const id = `gp-${tab}-${group}`;
  const pv = prov ?? { basis: 'unknown', source: '', sourceDate: '', entryDate: '', original: null };
  return `<div class="filters small" role="group" aria-label="${group} · ${L('assumptions provenance', 'происхождение допущений')}">
    <label for="${id}-b">${L('Basis', 'Основание')}<select id="${id}-b" data-path="${p}.basis">${BASES.map((b) => `<option value="${b}"${pv.basis === b ? ' selected' : ''}>${esc(tx(b))}</option>`).join('')}</select></label>
    <label for="${id}-s">${L('Source / reference', 'Источник / ссылка')}<input id="${id}-s" type="text" data-path="${p}.source" value="${esc(pv.source)}" placeholder="${L('none', 'нет')}"></label>
    <label for="${id}-d">${L('Source date', 'Дата источника')}<input id="${id}-d" type="date" data-path="${p}.sourceDate" value="${esc(pv.sourceDate)}"></label>
    <span class="muted">${L('Entered', 'Введено')}: ${esc(pv.entryDate || L('not recorded', 'не записано'))}${pv.original ? ` · ${L('Original', 'Исходно')}: ${esc(pv.original.basis)} · ${esc(pv.original.source || 'no source')}${pv.original.sourceDate ? ` · ${esc(pv.original.sourceDate)}` : ''} · ${esc(Object.entries(pv.original.values).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${v}`).join(', '))}` : ''}</span>
    <span class="muted">${L('Provenance is recorded per group, not per parameter.', 'Происхождение записывается для группы, а не для каждого параметра.')}</span></div>`;
}

function errorMap(result) { return Object.fromEntries(result.errors.map((e) => [e.field.replace(/^options\./, 'economics.options.').replace(/^(horizonYears|discountRate)$/, 'economics.$1'), e.message])); }

function editorSection(model, result) {
  const tab = plannerState.tab;
  const o = model.options[tab];
  const errors = errorMap(result);
  // Error paths use line IDs; data paths use indexes. Map one to the other.
  const lineErr = (l, f) => errors[`economics.options.${tab}.lines.${l.id}.${f}`];
  const costed = o.lines.filter((l) => l.mode === 'amount');
  const excl = Object.fromEntries([...result.options[tab].initial.exclusions, ...result.options[tab].annual.exclusions].map((e) => [e.category, e.reason]));
  const lineRow = (l) => {
    const i = o.lines.indexOf(l); const p = `economics.options.${tab}.lines.${i}`; const id = `ln-${tab}-${l.id}`;
    const errQ = lineErr(l, 'quantity'); const errU = lineErr(l, 'unitCost'); const errI = lineErr(l, 'includedIn'); const errR = lineErr(l, 'rationale');
    let value;
    if (l.mode === 'included') {
      value = `<label class="sr" for="${id}-inc">${L('Included in line', 'Включено в строку')}</label><select id="${id}-inc" data-path="${p}.includedIn"${errI ? ' aria-invalid="true"' : ''}><option value="">${L('Choose line…', 'Выберите строку…')}</option>${costed.filter((x) => x.id !== l.id).map((x) => `<option value="${x.id}"${l.includedIn === x.id ? ' selected' : ''}>${esc(tx(CATEGORY_LABEL[x.id]))}</option>`).join('')}</select>${errI ? `<span class="field-error">${esc(txMsg(errI))}</span>` : ''}`;
    } else if (l.mode === 'na') {
      value = `<label class="sr" for="${id}-rat">${L('Rationale', 'Обоснование')}</label><input id="${id}-rat" type="text" data-path="${p}.rationale" value="${esc(l.rationale)}" placeholder="${L('Rationale (required)', 'Обоснование (обязательно)')}"${errR ? ' aria-invalid="true"' : ''}>${errR ? `<span class="field-error">${esc(txMsg(errR))}</span>` : ''}`;
    } else {
      value = `<span class="qty"><label class="sr" for="${id}-q">${L('Quantity', 'Количество')}</label><input id="${id}-q" type="text" inputmode="decimal" data-path="${p}.quantity" value="${esc(l.quantity)}" size="3"${errQ ? ` aria-invalid="true" aria-describedby="${id}-qe"` : ''}> ×
        <label class="sr" for="${id}-u">${L('Unit cost', 'Цена за единицу')}, ${esc(l.currency)}</label><input id="${id}-u" type="text" inputmode="decimal" data-path="${p}.unitCost" value="${esc(l.unitCost)}" size="7" placeholder="${L('unknown', 'неизвестно')}"${errU ? ` aria-invalid="true" aria-describedby="${id}-ue"` : ''}>
        <label class="sr" for="${id}-cur">${L('Currency', 'Валюта')}</label><select id="${id}-cur" data-path="${p}.currency">${['EUR', 'NOK', 'USD', 'GBP'].map((c) => `<option${l.currency === c ? ' selected' : ''}>${c}</option>`).join('')}</select></span>
        ${errQ ? `<span id="${id}-qe" class="field-error">${L('Quantity', 'Количество')}: ${esc(txMsg(errQ))}</span>` : ''}${errU ? `<span id="${id}-ue" class="field-error">${L('Unit cost', 'Цена за единицу')}: ${esc(txMsg(errU))}</span>` : ''}
        ${l.currency !== model.currency ? `<span class="small">${L('Conversion to', 'Пересчёт в')} ${esc(model.currency)}: ${['rate', 'date', 'source'].map((k) => `<label class="sr" for="${id}-fx-${k}">${L('FX', 'Курс')} ${k}</label><input id="${id}-fx-${k}" type="text" data-path="${p}.fx.${k}" value="${esc(l.fx?.[k] ?? '')}" placeholder="${k}" size="8">`).join(' ')}</span>` : ''}
        ${l.allocation ? `<div class="small">${L("Shared item: this line is <b>this pump's allocated amount</b>.", 'Общая позиция: эта строка — <b>доля, выделенная этому насосу</b>.')}
          <label for="${id}-pt">${L('Project total', 'Сумма проекта')} (${esc(model.currency)})<input id="${id}-pt" type="text" inputmode="decimal" data-path="${p}.allocation.projectTotal" value="${esc(l.allocation.projectTotal)}" size="8" placeholder="${L('unknown', 'неизвестно')}"${lineErr(l, 'allocation.projectTotal') ? ` aria-invalid="true" aria-describedby="${id}-pte"` : ''}></label>
          ${lineErr(l, 'allocation.projectTotal') ? `<span id="${id}-pte" class="field-error">${esc(lineErr(l, 'allocation.projectTotal'))}</span>` : ''}
          <label for="${id}-ab">${L('Allocation basis / beneficiaries', 'Основание распределения / получатели')}<input id="${id}-ab" type="text" data-path="${p}.allocation.basis" value="${esc(l.allocation.basis)}"></label>
          <span class="muted">${L('Allocations across other pumps are not checked here.', 'Распределение по другим насосам здесь не проверяется.')}</span></div>` : ''}`;
    }
    return `<tr><th scope="row">${esc(tx(CATEGORY_LABEL[l.id]))}<div class="small muted mono">${l.id}</div>${excl[l.id] ? `<div class="small field-error">${esc(excl[l.id])}</div>` : ''}</th>
      <td><label class="sr" for="${id}-mode">${L('Treatment', 'Учёт')}</label><select id="${id}-mode" data-path="${p}.mode"><option value="amount"${l.mode === 'amount' ? ' selected' : ''}>${L('Amount', 'Сумма')}</option><option value="included"${l.mode === 'included' ? ' selected' : ''}>${L('Included elsewhere', 'Включено в другую строку')}</option><option value="na"${l.mode === 'na' ? ' selected' : ''}>${L('Not applicable', 'Неприменимо')}</option></select></td>
      <td>${value}</td>
      <td class="prov"><label class="sr" for="${id}-basis">${L('Basis', 'Основание')}</label><select id="${id}-basis" data-path="${p}.basis">${BASES.map((b) => `<option value="${b}"${l.basis === b ? ' selected' : ''}>${esc(tx(b))}</option>`).join('')}</select>
        <label for="${id}-src">${L('Source / reference', 'Источник / ссылка')}<input id="${id}-src" type="text" data-path="${p}.source" value="${esc(l.source)}" placeholder="${L('none', 'нет')}"></label>
        <label for="${id}-sd">${L('Source date', 'Дата источника')}<input id="${id}-sd" type="date" data-path="${p}.sourceDate" value="${esc(l.sourceDate)}"></label>
        ${l.basis === 'supplier quote' ? `<label for="${id}-qs">${L('Quote scope', 'Объём предложения')}<input id="${id}-qs" type="text" data-path="${p}.quoteScope" value="${esc(l.quoteScope)}"></label>
          <label for="${id}-qv">${L('Valid until', 'Действительно до')}<input id="${id}-qv" type="date" data-path="${p}.quoteValidUntil" value="${esc(l.quoteValidUntil)}"></label>
          <label for="${id}-qt">${L('Tax basis', 'Налоговая база')}<input id="${id}-qt" type="text" data-path="${p}.taxBasis" value="${esc(l.taxBasis)}" placeholder="${esc(model.taxBasis)}"></label>` : ''}
        <div class="small muted">${L('Entered', 'Введено')}: ${esc(l.entryDate || L('not recorded', 'не записано'))}${l.basis === 'field observation' ? L(' · draft assertion, not verified', ' · черновое утверждение, не проверено') : ''}</div>
        ${l.original ? `<div class="small muted">${L('Original', 'Исходно')}: ${esc(tx(l.original.basis))} · ${esc(l.original.source || 'no source')}${l.original.sourceDate ? ` · ${esc(l.original.sourceDate)}` : ''} · ${l.original.mode === 'amount' ? `${esc(l.original.quantity)} × ${esc(l.original.unitCost || 'unknown')} ${esc(l.original.currency)}` : esc(l.original.mode)}</div>` : ''}</td>
      <td><label class="sr" for="${id}-note">${L('Note', 'Примечание')}</label><input id="${id}-note" type="text" data-path="${p}.note" value="${esc(l.note)}"></td></tr>`;
  };
  const table = (cats, title) => `<h3>${title}</h3><div class="table-wrap" role="region" aria-label="${title} · ${tx(OPTION_LABEL[tab])}" tabindex="0"><table>
    <thead><tr><th scope="col">${L('Category', 'Категория')}</th><th scope="col">${L('Treatment', 'Учёт')}</th><th scope="col">${L('Quantity × unit cost / reference', 'Количество × цена за единицу / ссылка')}</th><th scope="col">${L('Basis · source', 'Основание · источник')}</th><th scope="col">${L('Note', 'Примечание')}</th></tr></thead>
    <tbody>${cats.map(([cid]) => lineRow(o.lines.find((l) => l.id === cid))).join('')}</tbody></table></div>`;
  const b = o.benefit; const nz = o.nuisance; const bp = `economics.options.${tab}.benefit`; const np = `economics.options.${tab}.nuisance`;
  return `<section class="panel" aria-labelledby="pl-edit"><h2 id="pl-edit">${L('Cost and benefit inputs', 'Исходные данные затрат и выгоды')}</h2>
    <div class="filters">
      ${field({ id: 'pl-H', path: 'economics.horizonYears', value: model.horizonYears, labelText: L('Horizon H (years)', 'Горизонт H (лет)'), errors, width: '6em', hint: `${L('whole years', 'целые годы')}, 1–${MAX_HORIZON_YEARS}` })}
      ${field({ id: 'pl-d', path: 'economics.discountRate', value: model.discountRate, labelText: L('Discount rate d (fraction/year)', 'Ставка дисконтирования d (доля/год)'), errors, width: '6em' })}
      <label>${L('Comparison currency', 'Валюта сравнения')}<input value="${esc(model.currency)}" disabled size="4"></label>
      <label for="pl-tax">${L('Tax basis', 'Налоговая база')}<input id="pl-tax" type="text" data-path="economics.taxBasis" value="${esc(model.taxBasis)}" size="10"></label>
      <label for="pl-base">${L('Baseline practice', 'Базовая практика')}<input id="pl-base" type="text" data-path="economics.baselineName" value="${esc(model.baselineName)}" size="30"></label>
    </div>
    <div class="tabs" role="tablist" aria-label="${L('Option to edit', 'Вариант для редактирования')}">${OPTION_IDS.map((id) => `<button type="button" role="tab" id="tab-${id}" data-tab="${id}" aria-selected="${tab === id}" class="${tab === id ? 'primary' : ''}">${esc(tx(OPTION_LABEL[id]))}</button>`).join('')}</div>
    ${tab === BASELINE ? `<p class="small muted">${L('Existing-only still has integration, review and support costs. Under incremental accounting enter 0 explicitly where nothing is added; leaving a line blank keeps it unknown.', 'У варианта «только имеющиеся сигналы» тоже есть затраты на интеграцию, рассмотрение и поддержку. При дополнительном учёте явно введите 0, где ничего не добавляется; пустая строка остаётся неизвестной.')}</p>` : ''}
    ${table(ONE_TIME_CATEGORIES, L('One-time costs', 'Разовые затраты'))}
    ${table(RECURRING_CATEGORIES, L('Annual costs', 'Годовые затраты'))}
    <h3>${L('Scheduled events', 'Запланированные события')}</h3>
    ${o.scheduled.length ? `<ul class="tight">${o.scheduled.map((s, i) => `<li class="filters">${field({ id: `sc-${tab}-${i}-y`, path: `economics.options.${tab}.scheduled.${i}.year`, value: s.year, labelText: L('Year', 'Год'), errors: { [`economics.options.${tab}.scheduled.${i}.year`]: errors[`economics.options.${tab}.scheduled.${s.id}.year`] }, width: '4em' })}
      ${field({ id: `sc-${tab}-${i}-c`, path: `economics.options.${tab}.scheduled.${i}.cost`, value: s.cost, labelText: `${L('Cost', 'Стоимость')} (${s.currency})`, errors: { [`economics.options.${tab}.scheduled.${i}.cost`]: errors[`economics.options.${tab}.scheduled.${s.id}.cost`] }, width: '7em' })}
      <label for="sc-${tab}-${i}-p">${L('Purpose', 'Назначение')}<input id="sc-${tab}-${i}-p" type="text" data-path="economics.options.${tab}.scheduled.${i}.purpose" value="${esc(s.purpose)}"></label>
      <button type="button" data-sched-rm="${i}" id="sc-rm-${tab}-${i}"> ${L('Remove', 'Убрать')}</button></li>`).join('')}</ul>` : `<p class="small muted">${L('None entered. Replacements, migrations and removal are separate cash flows when known.', 'Ничего не введено. Замены, миграции и демонтаж — отдельные денежные потоки, если известны.')}</p>`}
    <button type="button" id="sc-add">${L('Add scheduled event', 'Добавить запланированное событие')}</button>
    ${tab === BASELINE ? '' : `<h3>${L('Optional benefit assumptions (empty = Benefit not estimated)', 'Необязательные допущения о выгоде (пусто = выгода не оценивается)')}</h3>
    ${groupProvenance(tab, 'benefit', o.benefitProvenance)}
    <div class="filters">
      ${field({ id: 'pl-lambda', path: `${bp}.lambda`, value: b.lambda, labelText: L('λ relevant events/year', 'λ значимых событий/год'), errors, width: '6em' })}
      ${field({ id: 'pl-u', path: `${bp}.u`, value: b.u, labelText: L('u incremental actionable fraction (0–1)', 'u доля дополнительно применимых (0–1)'), errors, width: '6em', hint: L('not detector recall', 'не полнота детектора') })}
      ${field({ id: 'pl-h', path: `${bp}.h`, value: b.h, labelText: L('h hours avoided/event', 'h часов, сэкономленных на событие'), errors, width: '6em' })}
      ${field({ id: 'pl-c', path: `${bp}.c`, value: b.c, labelText: L('c loss rate (EUR/hour)', 'c потери (EUR/час)'), errors, width: '7em' })}
      ${field({ id: 'pl-r', path: `${bp}.r`, value: b.r, labelText: L('r avoidable repair difference (EUR/event)', 'r предотвратимая разница ремонта (EUR/событие)'), errors, width: '7em' })}
      ${field({ id: 'pl-L', path: `${bp}.L`, value: b.L, labelText: L('L labour saving (EUR/year)', 'L экономия труда (EUR/год)'), errors, width: '7em', hint: L('empty = not included', 'пусто = не учитывается') })}
    </div>
    <h3>${L('Nuisance burden', 'Нагрузка от ложных срабатываний')}</h3>
    ${groupProvenance(tab, 'nuisance', o.nuisanceProvenance)}
    <fieldset class="filters"><legend class="small">${L('Counting mode (only one charges)', 'Способ подсчёта (учитывается только один)')}</legend>
      <label class="check"><input type="radio" name="nz-mode-${tab}" id="nz-direct" value="direct" data-path="${np}.mode"${nz.mode !== 'totals' ? ' checked' : ''}> ${L('Direct incremental checks n', 'Прямые дополнительные проверки n')}</label>
      <label class="check"><input type="radio" name="nz-mode-${tab}" id="nz-totals" value="totals" data-path="${np}.mode"${nz.mode === 'totals' ? ' checked' : ''}> ${L('Option and baseline totals', 'Итоги варианта и базового варианта')}</label></fieldset>
    <div class="filters">
      ${nz.mode === 'totals'
        ? `${field({ id: 'pl-nzo', path: `${np}.optionTotal`, value: nz.optionTotal, labelText: L('Option checks/year', 'Проверок варианта/год'), errors, width: '6em' })}${field({ id: 'pl-nzb', path: `${np}.baselineTotal`, value: nz.baselineTotal, labelText: L('Baseline checks/year', 'Проверок базового варианта/год'), errors, width: '6em' })}`
        : field({ id: 'pl-n', path: `${np}.n`, value: nz.n, labelText: L('n additional checks/year', 'n дополнительных проверок/год'), errors, width: '6em' })}
      ${field({ id: 'pl-a', path: `${np}.a`, value: nz.a, labelText: L('a full cost per check (EUR)', 'a полная стоимость проверки (EUR)'), errors, width: '6em' })}
    </div>`}
  </section>`;
}

// ---- Task006: compact first screen, error summary, physical proposal ----
const ABLATION_FOR = { vibration: 'vibration_temperature', suction_pressure: 'suction', flow_head_power: 'flow_power' };
const ERR_SUFFIX = { quantity: 'q', unitCost: 'u', includedIn: 'inc', rationale: 'rat', 'allocation.projectTotal': 'pt', 'fx.rate': 'fx-rate' };
const GROUP_IDS = { lambda: 'pl-lambda', u: 'pl-u', h: 'pl-h', c: 'pl-c', r: 'pl-r', L: 'pl-L', n: 'pl-n', a: 'pl-a', optionTotal: 'pl-nzo', baselineTotal: 'pl-nzb' };

function errorTarget(model, field) {
  if (field === 'horizonYears') return { id: 'pl-H' };
  if (field === 'discountRate') return { id: 'pl-d' };
  let m = field.match(/^options\.(\w+)\.lines\.(\w+)\.(.+)$/);
  if (m && ERR_SUFFIX[m[3]]) return { tab: m[1], id: `ln-${m[1]}-${m[2]}-${ERR_SUFFIX[m[3]]}` };
  m = field.match(/^options\.(\w+)\.(benefit|nuisance)\.(\w+)$/);
  if (m) return { tab: m[1], id: GROUP_IDS[m[3]] };
  m = field.match(/^options\.(\w+)\.scheduled\.([^.]+)\.(year|cost)$/);
  if (m) {
    const i = model.options[m[1]].scheduled.findIndex((x) => x.id === m[2]);
    return { tab: m[1], id: `sc-${m[1]}-${i}-${m[3] === 'year' ? 'y' : 'c'}` };
  }
  return null;
}

function fieldName(field) {
  return field.replace(/^options\.(\w+)\./, (_, o) => `${tx(OPTION_LABEL[o]) ?? o} · `).replace(/lines\.(\w+)\./, (_, l) => `${tx(CATEGORY_LABEL[l]) ?? l} · `).replace(/\./g, ' · ');
}

function errorSummary(model, result) {
  if (!result.errors.length) return '';
  return `<section class="panel error-summary" aria-labelledby="pl-errs" role="alert"><h2 id="pl-errs">${L(`${result.errors.length} input ${result.errors.length === 1 ? 'problem' : 'problems'} · results depending on them are not estimated`, `Проблем во вводе: ${result.errors.length} · зависящие от них результаты не оцениваются`)}</h2>
    <ul class="tight small">${result.errors.map((e, i) => {
      const t = errorTarget(model, e.field);
      return `<li>${esc(fieldName(e.field))}: ${esc(txMsg(e.message))} ${t?.id ? `<button type="button" class="linkish" id="err-go-${i}" data-goto-id="${t.id}" data-goto-tab="${t.tab ?? ''}">${L('Go to field', 'К полю')}</button>` : ''}</li>`;
    }).join('')}</ul></section>`;
}

function summarySection(asset, draft, result, experiments) {
  const ready = reviewReadiness(draft);
  const inc = result.incremental.minimal;
  const [cls, label] = cz(CONCLUSION[inc.conclusion]);
  const nextQ = ready.missing[0];
  const evidence = draft.candidates.filter((c) => ABLATION_FOR[c.id]).map((c) => {
    const g = ABLATION_FOR[c.id];
    const rows = experiments?.ablation?.summary?.train?.filter((r) => r.scope === 'pooled') ?? [];
    const full = rows.find((r) => r.branch === 'full'); const mask = rows.find((r) => r.branch === `mask:${g}`);
    if (!full || !mask) return '';
    return `<li>${esc(tx(CANDIDATES.find((t) => t.id === c.id).title))}: ${esc(L(`train ablation (synthetic, ${full.events} events) full ${full.detected} detected / ${full.type_correct} correct type; with this group masked ${mask.detected} / ${mask.type_correct}. Paired effects are mixed —`, `абляция на обучении (синтетика, событий: ${full.events}): полный набор — обнаружено ${full.detected} / верный тип ${full.type_correct}; без этой группы — ${mask.detected} / ${mask.type_correct}. Парные эффекты неоднозначны —`))} <a href="#/evidence">${L('see Evidence', 'см. результаты проверки')}</a>.</li>`;
  }).join('');
  return `<section class="panel summary" aria-labelledby="pl-sum"><h2 id="pl-sum">${L('Decision summary', 'Сводка решения')}</h2>
    <dl class="kv"><dt>${L('Engineering decision', 'Инженерное решение')}</dt><dd>${draft.choice ? `<b>${esc(tx(CHOICES[draft.choice].title))}</b>` : `<span class="muted">${L('No review path selected yet', 'Путь рассмотрения ещё не выбран')}</span>`}</dd>
      <dt>${L('Lifecycle (minimal retrofit)', 'Жизненный цикл (минимальное дооснащение)')}</dt><dd>${pill(cls, label)} ${inc.npv != null ? `<span class="num">${L('annual net', 'годовой чистый эффект')} ${eur(inc.annualNet)} · NPV ${result.horizonYears} ${L('yr', 'лет')} ${eur(inc.npv)} · ${esc(pb(inc.payback?.label ?? ''))}</span>` : `<span class="muted">${esc(tx(inc.costStatus === 'complete' ? inc.benefitStatus : 'Cost estimate incomplete'))}</span>`}</dd>
      <dt>${L('Draft', 'Черновик')}</dt><dd>${pill(ready.state === 'READY_FOR_REVIEW' ? 's-info' : ready.state === 'NEEDS_EVIDENCE' ? 's-attn' : 's-gray', tx(ready.label))}</dd>
      <dt>${L('Next action', 'Следующее действие')}</dt><dd>${nextQ
        ? `<button type="button" class="primary" data-pl-jump-sel="[data-answer=&quot;${esc(nextQ.key)}&quot;]">${L('Answer', 'Ответить')}: ${esc(tx(nextQ.label))}</button> <span class="small muted">(${esc(tx(nextQ.scope))})</span>`
        : draft.choice ? L('Save the draft and take it to engineering review.', 'Сохраните черновик и передайте на инженерное рассмотрение.')
          : `<button type="button" class="primary" data-pl-jump="pl-choice">${L('Choose a review path', 'Выбрать путь рассмотрения')} ↓</button>`}</dd>
      <dt>${L('Measurement evidence', 'Данные об измерениях')}</dt><dd>${evidence ? `<ul class="tight small">${evidence}</ul>` : `<span class="small muted">${L('Add a measurement hypothesis to see related reviewed ablation evidence. No quantified uplift is claimed.', 'Добавьте гипотезу измерения, чтобы увидеть связанные результаты абляции. Количественный прирост не заявляется.')}</span>`}</dd></dl>
    <div class="filters"><button id="pl-preset" type="button">${L('Load illustrative redundant-pump case', 'Загрузить иллюстративный пример с резервным насосом')}</button>
      <span class="small muted">${L(`Hypothetical redundant pump with assumed healthy standby; independent of ${asset.assetId}. Editable assumptions, not prices.`, `Гипотетический резервированный насос с предполагаемым исправным резервом; не связан с ${asset.assetId}. Редактируемые допущения, а не цены.`)}</span></div>
  </section>`;
}

function proposalSection(asset, draft) {
  const pkg = physicalPackage(asset, draft);
  const status = (t) => pill(t.startsWith('Proposed') ? 's-attn' : t.startsWith('Present') ? 's-info' : 's-gray', tx(t));
  const decision = draft.choice ? tx(CHOICES[draft.choice].title) : null;
  const unselected = pkg.unselected.map((id) => tx(CANDIDATES.find((t) => t.id === id)?.title)).filter(Boolean);
  return `<section class="panel" aria-labelledby="pl-arch"><h2 id="pl-arch">${L('Proposed field architecture and physical package', 'Предлагаемая полевая архитектура и физический комплект')} <span class="small muted">· ${L('not part of this demo', 'не входит в это демо')}</span></h2>
    <p class="small">${L('This app is a static synthetic replay. The path below is a <b>proposal for discussion</b>: no edge deployment, BOM price or certification exists. Existing controls, trips and interlocks stay independent; nothing writes to equipment.', 'Это приложение — статическое синтетическое воспроизведение. Путь ниже — <b>предложение для обсуждения</b>: развёртывания на месте, цены спецификации и сертификации нет. Имеющееся управление, отключения и блокировки остаются независимыми; ничего не записывается в оборудование.')}</p>
    <div class="arch-grid">
      <ol class="arch" aria-label="${L('Proposed data path', 'Предлагаемый путь данных')}">
        <li><b>${L('Existing historian / export', 'Имеющийся архив / выгрузка')}</b><span>${pkg.noPermanentDevice ? `${L('no new measurement point', 'без новых точек измерения')}${decision ? ` (${L('decision', 'решение')}: ${esc(decision)})` : ''}` : L('+ the proposed measurement points listed alongside', '+ предлагаемые точки измерения, перечисленные рядом')}</span></li>
        <li class="arch-q">${L('Timestamp source, quality flags, tag mapping; permitted reads and polling load', 'Источник меток времени, флаги качества, сопоставление тегов; разрешённое чтение и нагрузка опроса')}</li>
        <li><b>${L('Local gateway / buffer / advisory analysis', 'Локальный шлюз / буфер / рекомендательный анализ')}</b><span>${L('bounded local storage; works offline', 'ограниченное локальное хранение; работает без сети')}</span></li>
        <li class="arch-q">${pkg.noPermanentDevice ? L('Offline and restart behaviour; site / class review of the data connection', 'Поведение без сети и при перезапуске; проверка подключения данных площадкой / классом') : L('Mounting, power, cables or radio and battery upkeep; offline and restart behaviour; site / class review', 'Крепление, питание, кабели или радио и обслуживание батарей; поведение без сети и при перезапуске; проверка площадкой / классом')}</li>
        <li><b>${L('Engineering evidence and review', 'Инженерные данные и рассмотрение')}</b><span>${L('human decision; no automatic action', 'решение принимает человек; без автоматических действий')}</span></li>
      </ol>
      <div>
        ${pkg.noPermanentDevice ? (draft.choice ? `<p class="note small">${L(`<b>No permanent device proposed</b> for the current decision (${esc(decision)}). Existing signals and a periodic route are the measurement plan.`, `<b>Постоянное устройство не предлагается</b> для текущего решения (${esc(decision)}). План измерений — имеющиеся сигналы и периодический обход.`)}</p>` : `<p class="small muted">${L('No review path or measurement hypothesis selected yet.', 'Путь рассмотрения или гипотеза измерения ещё не выбраны.')}</p>`) : ''}
        <ul class="phys" aria-label="${L('Physical package elements and status', 'Элементы физического комплекта и их статус')}">${pkg.rows.map((r) => `<li><span class="phys-el">${esc(pkgEl(r.element))}</span>${status(r.status)}</li>`).join('')}</ul>
        ${unselected.length ? `<p class="small muted">${L('Stored hypotheses not part of this decision (kept in the draft for later review):', 'Сохранённые гипотезы вне этого решения (остаются в черновике для дальнейшего рассмотрения):')} ${unselected.map(esc).join('; ')}.</p>` : ''}
      </div>
    </div>
  </section>`;
}

export function renderPlannerPage(asset, header, experiments = null) {
  const draft = draftFor(asset.assetId);
  const result = evaluateModel(draft.economics);
  const banner = asset.mode === 'TEST_METADATA_ONLY'
    ? `<div class="note" role="note">${L('<b>Blind test · Metadata only.</b> The planner uses the public passport only; no telemetry, alerts or labels exist for this pump in the application.', '<b>Слепой тест · только паспорт.</b> Планировщик использует только открытый паспорт; телеметрии, предупреждений и меток для этого насоса в приложении нет.')}</div>` : '';
  const proposed = proposedChannels(asset, draft);
  return `${header}${banner}
    <p class="note small" role="note">${L('Every proposal is an <b>engineering hypothesis</b>: no diagnostic uplift, field saving, installation time or compliance has been measured, and no secure, certified or class-approved conclusion follows from a protocol, network zone or checklist.', 'Каждое предложение — <b>инженерная гипотеза</b>: прирост диагностики, экономия на месте, время монтажа и соответствие не измерялись; из протокола, сетевой зоны или чек-листа не следует вывод о безопасности, сертификации или одобрении класса.')}</p>
    ${errorSummary(draft.economics, result)}
    <div class="grid-2 pl-top"><div>${summarySection(asset, draft, result, experiments)}</div><div>${statusSection(asset, draft, result)}</div></div>
    <div class="grid-2"><div>${choiceSection(draft)}${candidateSection(asset, draft)}</div>
      <div><section class="panel" aria-labelledby="pl-sch"><h2 id="pl-sch">${L('Existing and proposed measurement points', 'Имеющиеся и предлагаемые точки измерения')}</h2>
        ${renderSchematic(asset, { proposed, selected: plannerState.schematicSel[asset.assetId], prefix: 'psch' })}
        ${!proposed.length && draft.candidates.length && ['defer', 'existing'].includes(draft.choice) ? `<p class="small muted">${L('No proposed points drawn: the selected decision adds no permanent device. Stored hypotheses stay in the draft.', 'Предлагаемые точки не показаны: выбранное решение не добавляет постоянных устройств. Сохранённые гипотезы остаются в черновике.')}</p>` : ''}
        ${draft.candidates.some((c) => c.id === 'component_dp') && proposed.length ? `<p class="small muted">${L('Component differential pressure is not drawn: its location depends on the component and needs a survey.', 'Перепад давления на элементе не показан: его место зависит от элемента и требует обследования.')}</p>` : ''}</section>
        <details class="panel"><summary>${L('Installed channel list (public passport)', 'Список установленных каналов (открытый паспорт)')}</summary>${coverageSection(asset)}</details>
        <section class="panel"><details><summary>${L('Historical organizer price example (dated)', 'Исторический пример цен организаторов (датированный)')}</summary><p class="small">${esc(L(ORGANIZER_BOM_NOTE, 'Только иллюстративное оборудование организаторов; цены источника на 30 октября 2026; итоги комплектов — допущения; повторно не запрашивались. Комплект A около EUR 2.8–3.1 тыс., комплект B около EUR 2.1–2.4 тыс. Монтаж, шкаф/кабели, ПО и работы площадки/класса не включены. В источнике смешаны НДС и валюты; это не «наша минимальная стоимость установки» и не суммируется ни в один вариант.'))}</p></details></section></div></div>
    <details class="panel compare" id="pl-compare"${plannerState.compareOpen ? ' open' : ''}><summary><b>${L('Compare costs', 'Сравнить затраты')}</b> <span class="small muted">· ${L('lifecycle comparison of the three options; fill in the inputs below to estimate', 'сравнение жизненного цикла трёх вариантов; для оценки заполните исходные данные ниже')}</span></summary>
      ${resultsSection(draft.economics, result)}</details>
    ${proposalSection(asset, draft)}
    <details class="panel editor-disclosure" id="pl-editor"${plannerState.editorOpen ? ' open' : ''}><summary><b>${L('Cost, benefit and source inputs', 'Исходные данные: затраты, выгода и источники')}</b> <span class="small muted">· ${L('all 20 cost categories, provenance and assumptions for each option', 'все 20 категорий затрат, происхождение и допущения для каждого варианта')}</span></summary>
      ${editorSection(draft.economics, result)}</details>`;
}

export function bindPlanner(main, asset, rerender) {
  const id = asset.assetId;
  // Next-action buttons scroll to and focus the review-path choices or the first unanswered question.
  const jump = (el) => { if (!el) return; el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); };
  main.querySelectorAll('[data-pl-jump]').forEach((b) => b.addEventListener('click', () => {
    const sec = main.querySelector(`#${b.dataset.plJump}`)?.closest('section');
    jump(sec?.querySelector('input[type="radio"]:checked') ?? sec?.querySelector('input[type="radio"]'));
  }));
  main.querySelectorAll('[data-pl-jump-sel]').forEach((b) => b.addEventListener('click', () => jump(main.querySelector(b.dataset.plJumpSel))));
  main.querySelector('#pl-compare')?.addEventListener('toggle', (e) => { plannerState.compareOpen = e.target.open; });
  const draft = draftFor(id);
  const touch = () => { plannerState.dirty[id] = true; plannerState.message[id] = null; };
  const apply = (el) => {
    const path = el.dataset.path;
    if (el.type === 'radio' && !el.checked) return;
    const today = new Date().toISOString().slice(0, 10);
    const lm = path.match(/^economics\.options\.(\w+)\.lines\.(\d+)\.(\w+)$/);
    const gm = path.match(/^economics\.options\.(\w+)\.(benefit|nuisance)\.(\w+)$/);
    const am = path.match(/^economics\.options\.(\w+)\.lines\.(\d+)\.allocation\.projectTotal$/);
    if (am) editLineValue(draft.economics.options[am[1]].lines[Number(am[2])], 'allocation.projectTotal', el.value, today);
    else if (lm) editLineValue(draft.economics.options[lm[1]].lines[Number(lm[2])], lm[3], el.value, today);
    else if (gm) editGroupValue(draft.economics.options[gm[1]], gm[2], gm[3], el.value, today);
    else setPath(draft, path, el.value);
    touch();
  };
  main.querySelectorAll('[data-answer]').forEach((el) => {
    // Answer keys contain dots ("vibration.bandwidth"), so they are addressed directly, not by path.
    const write = () => { const k = el.dataset.answer; draft.answers[k] = { state: 'not_assessed', text: '', ...draft.answers[k], [el.dataset.field]: el.value }; touch(); };
    if (el.tagName === 'INPUT') el.addEventListener('input', write);
    el.addEventListener('change', () => { write(); rerender(); });
  });
  main.querySelectorAll('[data-path]').forEach((el) => {
    // Text typing updates the draft silently; committing (change) re-renders results.
    if (el.tagName === 'INPUT' && el.type === 'text' || el.tagName === 'TEXTAREA') el.addEventListener('input', () => apply(el));
    el.addEventListener('change', () => { apply(el); rerender(); });
  });
  const on = (sel, fn) => main.querySelector(sel)?.addEventListener('click', fn);
  main.querySelector('#pl-editor')?.addEventListener('toggle', (e) => { plannerState.editorOpen = e.target.open; });
  main.querySelectorAll('[data-goto-id]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.gotoTab) plannerState.tab = b.dataset.gotoTab;
    plannerState.editorOpen = true; rerender();
    const el = document.getElementById(b.dataset.gotoId); el?.focus(); el?.scrollIntoView({ block: 'center' });
  }));
  const proposedNow = proposedChannels(asset, draft);
  bindSchematic(main, asset, { proposed: proposedNow, prefix: 'psch', onSelect: (pt) => { plannerState.schematicSel[id] = pt; } });
  on('#cand-add', () => { const v = main.querySelector('#cand-add-sel').value; addCandidate(draft, v, new Date().toISOString()); touch(); rerender(); document.getElementById(`cand-rm-${v}`)?.focus(); });
  main.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { removeCandidate(draft, b.dataset.remove); touch(); rerender(); document.getElementById('cand-add')?.focus(); }));
  main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { plannerState.tab = b.dataset.tab; rerender(); document.getElementById(`tab-${b.dataset.tab}`)?.focus(); }));
  main.querySelectorAll('[data-sched-rm]').forEach((b) => b.addEventListener('click', () => { draft.economics.options[plannerState.tab].scheduled.splice(Number(b.dataset.schedRm), 1); touch(); rerender(); }));
  on('#sc-add', () => {
    const list = draft.economics.options[plannerState.tab].scheduled;
    list.push({ id: `s${Date.now()}`, year: '', cost: '', purpose: '', currency: draft.economics.currency });
    touch(); rerender(); document.getElementById(`sc-${plannerState.tab}-${list.length - 1}-y`)?.focus();
  });
  on('#pl-save', () => { plannerState.message[id] = store.save(draft, new Date().toISOString()); if (plannerState.message[id].ok) plannerState.dirty[id] = false; rerender(); });
  const askConfirm = (action) => { plannerState.confirm = { assetId: id, action }; rerender(); document.getElementById('pl-confirm-no')?.focus(); };
  on('#pl-reset', () => {
    if (plannerState.dirty[id] || draft.savedAt) askConfirm('reset');
    else { plannerState.message[id] = { ok: true, message: 'Nothing to reset' }; rerender(); }
  });
  on('#pl-preset', () => {
    const untouched = JSON.stringify(draft.economics) === JSON.stringify(emptyEconomics());
    if (untouched) { loadPreset(draft); touch(); rerender(); } else askConfirm('preset');
  });
  on('#pl-confirm-no', () => { const a = plannerState.confirm?.action; plannerState.confirm = null; rerender(); document.getElementById(a === 'reset' ? 'pl-reset' : 'pl-preset')?.focus(); });
  on('#pl-confirm-yes', () => {
    const a = plannerState.confirm?.action; plannerState.confirm = null;
    if (a === 'reset') {
      const removed = store.remove(id);
      delete plannerState.drafts[id]; delete plannerState.load[id]; plannerState.dirty[id] = false;
      plannerState.message[id] = removed.ok ? { ok: true, message: 'Draft discarded; a new draft is shown' } : { ok: false, message: `Saved copy could not be removed (${removed.message}). The in-tab draft was reset.` };
      draftFor(id);
    } else { loadPreset(draft); touch(); }
    rerender();
    document.getElementById(a === 'reset' ? 'pl-reset' : 'pl-preset')?.focus();
  });
}

function loadPreset(draft) {
  draft.economics = redundantPumpPreset(new Date().toISOString().slice(0, 10));
  plannerState.tab = 'minimal';
}
