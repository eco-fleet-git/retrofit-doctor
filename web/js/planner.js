// Retrofit Planner view. Uses public passport metadata only; never replay telemetry, alerts or labels.
// Proposals are hypotheses kept in a per-pump local draft; installed inventory is read-only.
import { evaluateModel, OPTION_IDS, BASELINE, MAX_HORIZON_YEARS } from './cost-model.js';
import {
  CHOICES, CANDIDATES, ONE_TIME_CATEGORIES, RECURRING_CATEGORIES, CATEGORY_LABEL, BASES, OPTION_LABEL, ANSWER_STATES,
  redundantPumpPreset, emptyEconomics, PRESET_TITLE, PRESET_NOTICE, ORGANIZER_BOM_NOTE,
} from './planner-content.js';
import { createDraftStore, addCandidate, removeCandidate, reviewReadiness, draftQuestions, editLineValue, editGroupValue } from './planner-store.js';
import { CHANNEL_LABELS, ALL_CHANNELS, CHANNEL_PLACEMENT } from './knowledge.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (cls, text) => `<span class="state ${cls}">${esc(text)}</span>`;
const label = (c) => CHANNEL_LABELS[c] ?? c;
const cadence = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);
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

export const plannerState = { drafts: {}, load: {}, message: {}, dirty: {}, confirm: null, tab: 'minimal' };

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
      ${err ? `aria-invalid="true" aria-describedby="${id}-err"` : ''}></label>${err ? `<span id="${id}-err" class="field-error" role="alert">${esc(err)}</span>` : ''}`;
}

function coverageSection(asset) {
  const installed = new Set(asset.channelsAvailable);
  const meta = Object.fromEntries(asset.channels.map((c) => [c.channelId, c]));
  const missing = ALL_CHANNELS.filter((c) => !installed.has(c));
  return `<section class="panel" aria-labelledby="pl-cov"><h2 id="pl-cov">Existing coverage · public passport</h2>
    <p class="small muted">Read-only inventory from <span class="mono">assets.csv</span>. Proposals below never change it. Mounting, access and actual topology are unknown; no duty/standby pairing is inferred.</p>
    <ul class="tight small">${asset.channelsAvailable.map((c) => `<li>${esc(label(c))} · native ${esc(cadence(meta[c].nativeUpdateSeconds))} ${pill('s-info', 'Installed (synthetic benchmark)')}</li>`).join('')}</ul>
    <h3>Not instrumented (${missing.length})</h3>
    ${missing.length ? `<ul class="tight small">${missing.map((c) => `<li>${esc(label(c))} ${pill('s-gray', 'Not instrumented')}${c === 'motor_speed_rpm' ? ` <span class="muted">no measured speed; rated ${asset.ratedRpmMetadata} rpm is passport metadata, not a measurement</span>` : ''}</li>`).join('')}</ul>` : '<p class="small">All benchmark channels are installed.</p>'}
  </section>`;
}

function answerBlock(draft, q, idx) {
  const a = draft.answers[q.key] ?? { state: 'not_assessed', text: '' };
  const id = `ans-${idx}`;
  const needsText = (a.state === 'drafted' || a.state === 'na') && !String(a.text ?? '').trim();
  return `<div class="question"><div class="qlabel" id="${id}-l">${esc(q.label)}</div>
    <div class="qrow"><select id="${id}-s" data-answer="${esc(q.key)}" data-field="state" aria-labelledby="${id}-l">${ANSWER_STATES.map(([v, t]) => `<option value="${v}"${a.state === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <input id="${id}-t" type="text" data-answer="${esc(q.key)}" data-field="text" value="${esc(a.text)}" aria-labelledby="${id}-l" placeholder="${a.state === 'na' ? 'Rationale (required)' : 'Draft response or evidence needed'}"${needsText ? ` aria-invalid="true" aria-describedby="${id}-e"` : ''}></div>
    ${needsText ? `<span id="${id}-e" class="field-error">${a.state === 'na' ? 'Not applicable needs a rationale.' : 'A draft response needs text.'}</span>` : ''}</div>`;
}

function choiceSection(draft) {
  const qs = draftQuestions(draft).filter((q) => q.key.startsWith('choice-'));
  return `<section class="panel" aria-labelledby="pl-choice"><h2 id="pl-choice">Review path</h2>
    <fieldset class="choices"><legend class="sr">Choose a review path</legend>
    ${Object.entries(CHOICES).map(([id, c]) => `<label class="choice${draft.choice === id ? ' selected' : ''}"><input type="radio" name="pl-choice" id="choice-${id}" value="${id}" data-path="choice"${draft.choice === id ? ' checked' : ''}>
      <span><b>${esc(c.title)}</b><br><span class="small">${esc(c.decision)}</span><br><span class="small muted">Burden: ${esc(c.burden)}</span><br><span class="small muted">Choose when: ${esc(c.when)}</span></span></label>`).join('')}
    </fieldset>
    ${qs.length ? `<h3>Gate questions for this path</h3>${qs.map((q, i) => answerBlock(draft, q, `c${i}`)).join('')}` : ''}
  </section>`;
}

function candidateSection(asset, draft) {
  const available = CANDIDATES.filter((t) => !draft.candidates.some((c) => c.id === t.id));
  const questions = draftQuestions(draft);
  return `<section class="panel" aria-labelledby="pl-cand"><h2 id="pl-cand">Proposed measurement hypotheses (${draft.candidates.length})</h2>
    <p class="small muted">Each card is a hypothesis to review, not an installed sensor, simulated measurement or tested improvement. No diagnostic uplift has been evaluated.</p>
    <div class="filters">${available.length ? `<label>Add candidate<select id="cand-add-sel">${available.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></label>
      <button id="cand-add" type="button">Add hypothesis</button>` : '<span class="small muted">All candidate types added.</span>'}</div>
    ${draft.candidates.map((c, ci) => {
      const t = CANDIDATES.find((x) => x.id === c.id);
      if (!t) return '';
      const already = t.channels.filter((ch) => asset.channelsAvailable.includes(ch));
      const qs = questions.filter((q) => q.key.startsWith(`${c.id}.`));
      return `<article class="card" aria-labelledby="cand-${c.id}-h"><h3 id="cand-${c.id}-h">${esc(t.title)} ${pill('s-attn', 'Hypothesis')} ${pill('s-gray', OPTION_LABEL[t.tier])}</h3>
        <dl class="kv small"><dt>Decision it supports</dt><dd>${esc(t.decision)}</dd><dt>Will not resolve</dt><dd>${esc(t.willNotResolve)}</dd>
        <dt>Already installed here</dt><dd>${already.length ? already.map((ch) => esc(label(ch))).join(', ') : 'None of the related channels'}</dd>
        <dt>Placement</dt><dd>${t.channels.length ? esc([...new Set(t.channels.map((ch) => CHANNEL_PLACEMENT[ch]))].join('; ')) : 'Component-specific'}; to verify on site</dd>
        <dt>Evidence</dt><dd>Physical rationale only · benchmark-tested improvement: Not yet evaluated</dd></dl>
        ${t.explainer ? `<p class="note small">${esc(t.explainer)}</p>` : ''}
        ${qs.map((q, i) => answerBlock(draft, q, `k${ci}-${i}`)).join('')}
        <p><button type="button" data-remove="${c.id}" id="cand-rm-${c.id}">Remove hypothesis</button></p></article>`;
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
  return `<section class="panel" aria-labelledby="pl-status"><h2 id="pl-status">Review draft</h2>
    <dl class="kv small"><dt>Draft completeness</dt><dd>${pill(readyCls, ready.label)}<div class="muted">Answered questions only; not a design, economic or compliance approval.</div></dd>
      <dt>Economics · minimal</dt><dd>${pill(...CONCLUSION[econ.conclusion])}</dd>
      <dt>Economics · instrument</dt><dd>${pill(...CONCLUSION[econI.conclusion])}</dd>
      <dt>Selected path</dt><dd>${draft.choice ? esc(CHOICES[draft.choice].title) : '<span class="muted">None</span>'}</dd>
      <dt>Created</dt><dd class="num">${esc(draft.createdAt?.slice(0, 16).replace('T', ' '))} UTC</dd>
      <dt>Last saved</dt><dd class="num">${draft.savedAt ? `${esc(draft.savedAt.slice(0, 16).replace('T', ' '))} UTC` : 'Not saved in this browser'}</dd></dl>
    ${lp?.message ? `<p class="note small" role="note">${esc(lp.message)}</p>` : ''}
    <label for="pl-notes">Source and assumption notes<textarea id="pl-notes" data-path="notes" rows="3">${esc(draft.notes)}</textarea></label>
    ${ready.missing.length ? `<h3>Unresolved review questions (${ready.missing.length})</h3><ul class="tight small">${ready.missing.slice(0, 8).map((q) => `<li>${esc(q.scope)}: ${esc(q.label)}</li>`).join('')}${ready.missing.length > 8 ? `<li>… ${ready.missing.length - 8} more</li>` : ''}</ul>` : ''}
    <div class="filters"><button id="pl-save" type="button" class="primary">Save draft in this browser</button>
      <button id="pl-reset" type="button">Reset draft…</button>
      ${dirty ? pill('s-attn', 'Unsaved changes') : ''}</div>
    <div role="status" aria-live="polite">${msg ? (msg.ok ? pill('s-ok', msg.message) : `<div class="error">${esc(msg.message)}</div>`) : ''}</div>
    ${confirm ? `<div class="confirm" role="alertdialog" aria-labelledby="pl-confirm-t"><p id="pl-confirm-t"><b>${confirm.action === 'reset' ? 'Discard this pump\'s draft, including the saved copy in this browser?' : 'Replace the cost model with the illustrative case? Current cost entries for this pump will be lost.'}</b></p>
      <button id="pl-confirm-yes" type="button" class="primary">${confirm.action === 'reset' ? 'Discard draft' : 'Load illustrative case'}</button> <button id="pl-confirm-no" type="button">Keep editing</button></div>` : ''}
    <p class="small muted">Saving keeps the draft in this browser only. It is not sent, approved, purchased or deployed.</p>
  </section>`;
}

function resultsSection(model, result) {
  const errs = result.errors;
  const opt = (id) => result.options[id];
  const costCell = (s) => (s.status === 'complete' ? eur(s.total) : `<span class="muted">Cost estimate incomplete</span><div class="small">Known cost subtotal ${eur(s.knownSubtotal)} · ${s.exclusions.length} excluded</div>`);
  const inc = (id) => result.incremental[id];
  const rowsInc = [
    ['Annual incremental benefit', (r) => (r.benefitPerYear == null ? `<span class="muted">${r.benefitStatus}</span>` : eur(r.benefitPerYear))],
    ['Annual nuisance handling', (r) => (r.nuisancePerYear == null ? `<span class="muted">${r.nuisanceStatus}</span>` : eur(-r.nuisancePerYear))],
    ['Annual upkeep difference', (r) => (r.deltaAnnual == null ? '<span class="muted">Cost estimate incomplete</span>' : eur(-r.deltaAnnual))],
    ['Annual net effect', (r) => (r.annualNet == null ? '—' : `<b>${eur(r.annualNet)}</b>`)],
    ['Additional initial cost', (r) => (r.deltaInitial == null ? '<span class="muted">Cost estimate incomplete</span>' : eur(r.deltaInitial))],
    [`${result.horizonYears ?? '?'}-year incremental lifecycle cost`, (r) => eur(r.incrementalLifecycleCost)],
    [`${result.horizonYears ?? '?'}-year gross incremental benefit`, (r) => eur(r.grossBenefit)],
    [`${result.horizonYears ?? '?'}-year incremental NPV`, (r) => (r.npv == null ? '<span class="muted">Not estimated</span>' : `<b>${eur(r.npv)}</b>`)],
    ['Payback', (r) => (r.payback ? esc(r.payback.label) : '—')],
    ['Sensitivity: zero nuisance checks', (r) => (r.zeroNuisance ? `${eur(r.zeroNuisance.annualNet)}/year · NPV ${eur(r.zeroNuisance.npv)}` : '—')],
    ['Sensitivity: nuisance break-even', (r) => (r.maxNuisanceChecks ? (r.maxNuisanceChecks.value == null ? esc(r.maxNuisanceChecks.label) : `${num(r.maxNuisanceChecks.value)} checks/year`) : '—')],
    ['Sensitivity: event-rate break-even', (r) => (r.breakEvenLambda ? (r.breakEvenLambda.value == null ? esc(r.breakEvenLambda.label) : `${num(r.breakEvenLambda.value)} events/year <span class="small muted">(threshold, not an estimate)</span>`) : '—')],
    ['Economic conclusion', (r) => pill(...CONCLUSION[r.conclusion])],
  ];
  return `<section class="panel" aria-labelledby="pl-res"><h2 id="pl-res">Lifecycle comparison</h2>
    ${model.presetId ? `<p class="note small"><b>${esc(PRESET_TITLE)}.</b> ${esc(PRESET_NOTICE)} Fixture assumes no additional survey, contingency, shutdown loss or removal cost outside these totals.</p>` : ''}
    ${errs.length ? `<div class="error small" role="alert"><b>${errs.length} invalid ${errs.length === 1 ? 'entry' : 'entries'}.</b> Results that depend on them are not estimated; your entries are kept.
      ${errs.filter((e) => e.field === 'economics' || /^options\.\w+$/.test(e.field)).map((e) => `<div>${esc(e.message)}</div>`).join('')}</div>` : ''}
    ${OPTION_IDS.flatMap((id) => result.options[id].scheduled.outsideHorizon.map((x) => `<p class="note small">${esc(OPTION_LABEL[id])}: scheduled ${esc(x.purpose || 'event')} in year ${x.year} (${eur(x.cost)}) is after the ${result.horizonYears}-year horizon and not included.</p>`)).join('')}
    <div class="table-wrap" role="region" aria-label="Lifecycle cost by option" tabindex="0"><table class="stack">
      <caption>Gross forward costs per option in ${esc(model.currency)} (${esc(model.taxBasis)}), ${esc(model.moneyConvention)} money, d = ${esc(model.discountRate)}, H = ${esc(model.horizonYears)} years. Sunk existing equipment excluded.</caption>
      <thead><tr><th scope="col">Option</th><th scope="col">Initial cost</th><th scope="col">Annual cost</th><th scope="col">Lifecycle cost excl. nuisance handling</th></tr></thead>
      <tbody>${OPTION_IDS.map((id) => `<tr><th scope="row">${esc(OPTION_LABEL[id])}${id === BASELINE ? `<div class="small muted">Baseline: ${esc(model.baselineName)}</div>` : ''}</th>
        <td data-label="Initial cost">${costCell(opt(id).initial)}</td><td data-label="Annual cost">${costCell(opt(id).annual)}</td><td data-label="Lifecycle cost excl. nuisance">${opt(id).lifecycleCostExclNuisance == null ? '<span class="muted">Not estimated</span>' : eur(opt(id).lifecycleCostExclNuisance)}</td></tr>`).join('')}</tbody></table></div>
    <h3>Incremental value against the baseline</h3>
    <div class="table-wrap" role="region" aria-label="Incremental value against baseline" tabindex="0"><table class="stack">
      <thead><tr><th scope="col">Item</th><th scope="col">${OPTION_LABEL.minimal}</th><th scope="col">${OPTION_LABEL.instrument}</th></tr></thead>
      <tbody>${rowsInc.map(([t, fn]) => `<tr><th scope="row">${esc(t)}</th><td class="num" data-label="${OPTION_LABEL.minimal}">${fn(inc('minimal'))}</td><td class="num" data-label="${OPTION_LABEL.instrument}">${fn(inc('instrument'))}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Benefit/year = λ × u × (h × c + r) + L. All entries are assumptions unless their basis says otherwise; benchmark recall, scores and alert rates are never imported. A positive NPV supports further review only; it is not an approval, guaranteed saving or purchase recommendation.</p>
  </section>`;
}


function groupProvenance(tab, group, prov) {
  const p = `economics.options.${tab}.${group}Provenance`; const id = `gp-${tab}-${group}`;
  const pv = prov ?? { basis: 'unknown', source: '', sourceDate: '', entryDate: '', original: null };
  return `<div class="filters small" role="group" aria-label="${group} assumptions provenance">
    <label for="${id}-b">Basis<select id="${id}-b" data-path="${p}.basis">${BASES.map((b) => `<option${pv.basis === b ? ' selected' : ''}>${b}</option>`).join('')}</select></label>
    <label for="${id}-s">Source / reference<input id="${id}-s" type="text" data-path="${p}.source" value="${esc(pv.source)}" placeholder="none"></label>
    <label for="${id}-d">Source date<input id="${id}-d" type="date" data-path="${p}.sourceDate" value="${esc(pv.sourceDate)}"></label>
    <span class="muted">Entered: ${esc(pv.entryDate || 'not recorded')}${pv.original ? ` · Original: ${esc(pv.original.basis)} · ${esc(pv.original.source || 'no source')}${pv.original.sourceDate ? ` · ${esc(pv.original.sourceDate)}` : ''} · ${esc(Object.entries(pv.original.values).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${v}`).join(', '))}` : ''}</span>
    <span class="muted">Provenance is recorded per group, not per parameter.</span></div>`;
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
      value = `<label class="sr" for="${id}-inc">Included in line</label><select id="${id}-inc" data-path="${p}.includedIn"${errI ? ' aria-invalid="true"' : ''}><option value="">Choose line…</option>${costed.filter((x) => x.id !== l.id).map((x) => `<option value="${x.id}"${l.includedIn === x.id ? ' selected' : ''}>${esc(CATEGORY_LABEL[x.id])}</option>`).join('')}</select>${errI ? `<span class="field-error">${esc(errI)}</span>` : ''}`;
    } else if (l.mode === 'na') {
      value = `<label class="sr" for="${id}-rat">Rationale</label><input id="${id}-rat" type="text" data-path="${p}.rationale" value="${esc(l.rationale)}" placeholder="Rationale (required)"${errR ? ' aria-invalid="true"' : ''}>${errR ? `<span class="field-error">${esc(errR)}</span>` : ''}`;
    } else {
      value = `<span class="qty"><label class="sr" for="${id}-q">Quantity</label><input id="${id}-q" type="text" inputmode="decimal" data-path="${p}.quantity" value="${esc(l.quantity)}" size="3"${errQ ? ` aria-invalid="true" aria-describedby="${id}-qe"` : ''}> ×
        <label class="sr" for="${id}-u">Unit cost, ${esc(l.currency)}</label><input id="${id}-u" type="text" inputmode="decimal" data-path="${p}.unitCost" value="${esc(l.unitCost)}" size="7" placeholder="unknown"${errU ? ` aria-invalid="true" aria-describedby="${id}-ue"` : ''}>
        <label class="sr" for="${id}-cur">Currency</label><select id="${id}-cur" data-path="${p}.currency">${['EUR', 'NOK', 'USD', 'GBP'].map((c) => `<option${l.currency === c ? ' selected' : ''}>${c}</option>`).join('')}</select></span>
        ${errQ ? `<span id="${id}-qe" class="field-error">Quantity: ${esc(errQ)}</span>` : ''}${errU ? `<span id="${id}-ue" class="field-error">Unit cost: ${esc(errU)}</span>` : ''}
        ${l.currency !== model.currency ? `<span class="small">Conversion to ${esc(model.currency)}: ${['rate', 'date', 'source'].map((k) => `<label class="sr" for="${id}-fx-${k}">FX ${k}</label><input id="${id}-fx-${k}" type="text" data-path="${p}.fx.${k}" value="${esc(l.fx?.[k] ?? '')}" placeholder="${k}" size="8">`).join(' ')}</span>` : ''}
        ${l.allocation ? `<div class="small">Shared item: this line is <b>this pump's allocated amount</b>.
          <label for="${id}-pt">Project total (${esc(model.currency)})<input id="${id}-pt" type="text" inputmode="decimal" data-path="${p}.allocation.projectTotal" value="${esc(l.allocation.projectTotal)}" size="8" placeholder="unknown"${lineErr(l, 'allocation.projectTotal') ? ` aria-invalid="true" aria-describedby="${id}-pte"` : ''}></label>
          ${lineErr(l, 'allocation.projectTotal') ? `<span id="${id}-pte" class="field-error">${esc(lineErr(l, 'allocation.projectTotal'))}</span>` : ''}
          <label for="${id}-ab">Allocation basis / beneficiaries<input id="${id}-ab" type="text" data-path="${p}.allocation.basis" value="${esc(l.allocation.basis)}"></label>
          <span class="muted">Allocations across other pumps are not checked here.</span></div>` : ''}`;
    }
    return `<tr><th scope="row">${esc(CATEGORY_LABEL[l.id])}<div class="small muted mono">${l.id}</div>${excl[l.id] ? `<div class="small field-error">${esc(excl[l.id])}</div>` : ''}</th>
      <td><label class="sr" for="${id}-mode">Treatment</label><select id="${id}-mode" data-path="${p}.mode"><option value="amount"${l.mode === 'amount' ? ' selected' : ''}>Amount</option><option value="included"${l.mode === 'included' ? ' selected' : ''}>Included elsewhere</option><option value="na"${l.mode === 'na' ? ' selected' : ''}>Not applicable</option></select></td>
      <td>${value}</td>
      <td class="prov"><label class="sr" for="${id}-basis">Basis</label><select id="${id}-basis" data-path="${p}.basis">${BASES.map((b) => `<option${l.basis === b ? ' selected' : ''}>${b}</option>`).join('')}</select>
        <label for="${id}-src">Source / reference<input id="${id}-src" type="text" data-path="${p}.source" value="${esc(l.source)}" placeholder="none"></label>
        <label for="${id}-sd">Source date<input id="${id}-sd" type="date" data-path="${p}.sourceDate" value="${esc(l.sourceDate)}"></label>
        ${l.basis === 'supplier quote' ? `<label for="${id}-qs">Quote scope<input id="${id}-qs" type="text" data-path="${p}.quoteScope" value="${esc(l.quoteScope)}"></label>
          <label for="${id}-qv">Valid until<input id="${id}-qv" type="date" data-path="${p}.quoteValidUntil" value="${esc(l.quoteValidUntil)}"></label>
          <label for="${id}-qt">Tax basis<input id="${id}-qt" type="text" data-path="${p}.taxBasis" value="${esc(l.taxBasis)}" placeholder="${esc(model.taxBasis)}"></label>` : ''}
        <div class="small muted">Entered: ${esc(l.entryDate || 'not recorded')}${l.basis === 'field observation' ? ' · draft assertion, not verified' : ''}</div>
        ${l.original ? `<div class="small muted">Original: ${esc(l.original.basis)} · ${esc(l.original.source || 'no source')}${l.original.sourceDate ? ` · ${esc(l.original.sourceDate)}` : ''} · ${l.original.mode === 'amount' ? `${esc(l.original.quantity)} × ${esc(l.original.unitCost || 'unknown')} ${esc(l.original.currency)}` : esc(l.original.mode)}</div>` : ''}</td>
      <td><label class="sr" for="${id}-note">Note</label><input id="${id}-note" type="text" data-path="${p}.note" value="${esc(l.note)}"></td></tr>`;
  };
  const table = (cats, title) => `<h3>${title}</h3><div class="table-wrap" role="region" aria-label="${title} for ${OPTION_LABEL[tab]}" tabindex="0"><table>
    <thead><tr><th scope="col">Category</th><th scope="col">Treatment</th><th scope="col">Quantity × unit cost / reference</th><th scope="col">Basis · source</th><th scope="col">Note</th></tr></thead>
    <tbody>${cats.map(([cid]) => lineRow(o.lines.find((l) => l.id === cid))).join('')}</tbody></table></div>`;
  const b = o.benefit; const nz = o.nuisance; const bp = `economics.options.${tab}.benefit`; const np = `economics.options.${tab}.nuisance`;
  return `<section class="panel" aria-labelledby="pl-edit"><h2 id="pl-edit">Cost and benefit inputs</h2>
    <div class="filters">
      ${field({ id: 'pl-H', path: 'economics.horizonYears', value: model.horizonYears, labelText: 'Horizon H (years)', errors, width: '6em', hint: `whole years, 1–${MAX_HORIZON_YEARS}` })}
      ${field({ id: 'pl-d', path: 'economics.discountRate', value: model.discountRate, labelText: 'Discount rate d (fraction/year)', errors, width: '6em' })}
      <label>Comparison currency<input value="${esc(model.currency)}" disabled size="4"></label>
      <label for="pl-tax">Tax basis<input id="pl-tax" type="text" data-path="economics.taxBasis" value="${esc(model.taxBasis)}" size="10"></label>
      <label for="pl-base">Baseline practice<input id="pl-base" type="text" data-path="economics.baselineName" value="${esc(model.baselineName)}" size="30"></label>
    </div>
    <div class="filters"><button id="pl-preset" type="button">Load illustrative redundant-pump case</button>
      <span class="small muted">Optional. Independent of this pump; editable assumptions only.</span></div>
    <div class="tabs" role="tablist" aria-label="Option to edit">${OPTION_IDS.map((id) => `<button type="button" role="tab" id="tab-${id}" data-tab="${id}" aria-selected="${tab === id}" class="${tab === id ? 'primary' : ''}">${esc(OPTION_LABEL[id])}</button>`).join('')}</div>
    ${tab === BASELINE ? '<p class="small muted">Existing-only still has integration, review and support costs. Under incremental accounting enter 0 explicitly where nothing is added; leaving a line blank keeps it unknown.</p>' : ''}
    ${table(ONE_TIME_CATEGORIES, 'One-time costs')}
    ${table(RECURRING_CATEGORIES, 'Annual costs')}
    <h3>Scheduled events</h3>
    ${o.scheduled.length ? `<ul class="tight">${o.scheduled.map((s, i) => `<li class="filters">${field({ id: `sc-${tab}-${i}-y`, path: `economics.options.${tab}.scheduled.${i}.year`, value: s.year, labelText: 'Year', errors: { [`economics.options.${tab}.scheduled.${i}.year`]: errors[`economics.options.${tab}.scheduled.${s.id}.year`] }, width: '4em' })}
      ${field({ id: `sc-${tab}-${i}-c`, path: `economics.options.${tab}.scheduled.${i}.cost`, value: s.cost, labelText: `Cost (${s.currency})`, errors: { [`economics.options.${tab}.scheduled.${i}.cost`]: errors[`economics.options.${tab}.scheduled.${s.id}.cost`] }, width: '7em' })}
      <label for="sc-${tab}-${i}-p">Purpose<input id="sc-${tab}-${i}-p" type="text" data-path="economics.options.${tab}.scheduled.${i}.purpose" value="${esc(s.purpose)}"></label>
      <button type="button" data-sched-rm="${i}" id="sc-rm-${tab}-${i}">Remove</button></li>`).join('')}</ul>` : '<p class="small muted">None entered. Replacements, migrations and removal are separate cash flows when known.</p>'}
    <button type="button" id="sc-add">Add scheduled event</button>
    ${tab === BASELINE ? '' : `<h3>Optional benefit assumptions (empty = Benefit not estimated)</h3>
    ${groupProvenance(tab, 'benefit', o.benefitProvenance)}
    <div class="filters">
      ${field({ id: 'pl-lambda', path: `${bp}.lambda`, value: b.lambda, labelText: 'λ relevant events/year', errors, width: '6em' })}
      ${field({ id: 'pl-u', path: `${bp}.u`, value: b.u, labelText: 'u incremental actionable fraction (0–1)', errors, width: '6em', hint: 'not detector recall' })}
      ${field({ id: 'pl-h', path: `${bp}.h`, value: b.h, labelText: 'h hours avoided/event', errors, width: '6em' })}
      ${field({ id: 'pl-c', path: `${bp}.c`, value: b.c, labelText: 'c loss rate (EUR/hour)', errors, width: '7em' })}
      ${field({ id: 'pl-r', path: `${bp}.r`, value: b.r, labelText: 'r avoidable repair difference (EUR/event)', errors, width: '7em' })}
      ${field({ id: 'pl-L', path: `${bp}.L`, value: b.L, labelText: 'L labour saving (EUR/year)', errors, width: '7em', hint: 'empty = not included' })}
    </div>
    <h3>Nuisance burden</h3>
    ${groupProvenance(tab, 'nuisance', o.nuisanceProvenance)}
    <fieldset class="filters"><legend class="small">Counting mode (only one charges)</legend>
      <label class="check"><input type="radio" name="nz-mode-${tab}" id="nz-direct" value="direct" data-path="${np}.mode"${nz.mode !== 'totals' ? ' checked' : ''}> Direct incremental checks n</label>
      <label class="check"><input type="radio" name="nz-mode-${tab}" id="nz-totals" value="totals" data-path="${np}.mode"${nz.mode === 'totals' ? ' checked' : ''}> Option and baseline totals</label></fieldset>
    <div class="filters">
      ${nz.mode === 'totals'
        ? `${field({ id: 'pl-nzo', path: `${np}.optionTotal`, value: nz.optionTotal, labelText: 'Option checks/year', errors, width: '6em' })}${field({ id: 'pl-nzb', path: `${np}.baselineTotal`, value: nz.baselineTotal, labelText: 'Baseline checks/year', errors, width: '6em' })}`
        : field({ id: 'pl-n', path: `${np}.n`, value: nz.n, labelText: 'n additional checks/year', errors, width: '6em' })}
      ${field({ id: 'pl-a', path: `${np}.a`, value: nz.a, labelText: 'a full cost per check (EUR)', errors, width: '6em' })}
    </div>`}
  </section>`;
}

export function renderPlannerPage(asset, header) {
  const draft = draftFor(asset.assetId);
  const result = evaluateModel(draft.economics);
  const banner = asset.mode === 'TEST_METADATA_ONLY'
    ? '<div class="note" role="note"><b>Blind test · Metadata only.</b> The planner uses the public passport only; no telemetry, alerts or labels exist for this pump in the application.</div>' : '';
  return `${header}${banner}
    <div class="note" role="note">Every proposal is an <b>engineering hypothesis</b>. No diagnostic uplift, field saving, installation time or compliance has been measured. The proposed field path (existing telemetry / optional sensors → bounded local buffer → advisory UI) is separate from this replay demo, which is not an edge implementation; nothing here can write to equipment. No secure, certified or class-approved conclusion follows from a protocol, network zone or completed checklist.</div>
    <div class="grid-2 pl-top"><div>${coverageSection(asset)}${choiceSection(draft)}${candidateSection(asset, draft)}</div>
      <div>${statusSection(asset, draft, result)}
        <section class="panel"><details><summary>Historical organizer price example (dated)</summary><p class="small">${esc(ORGANIZER_BOM_NOTE)}</p></details></section></div></div>
    ${resultsSection(draft.economics, result)}
    ${editorSection(draft.economics, result)}`;
}

export function bindPlanner(main, asset, rerender) {
  const id = asset.assetId;
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
