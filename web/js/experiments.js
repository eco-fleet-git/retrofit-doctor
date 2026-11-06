// Evidence page: reviewed experiment results (bundle section `experiments`, exported verbatim from results/).
// Historical/rejected candidates are shown here only; operator replay always uses the selected causal B1.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (cls, text) => `<span class="state ${cls}">${esc(text)}</span>`;
const n2 = (v) => (v === '' || v == null ? '—' : Number(v).toFixed(2));
const GROUP_LABEL = { vibration_temperature: 'Vibration + bearing temperature', suction: 'Suction pressure', flow_power: 'Flow + input power' };

function candidateTable(block, caption, denom) {
  return `<div class="table-wrap" role="region" aria-label="${esc(caption)}" tabindex="0"><table>
    <caption>${esc(caption)} Source: <span class="mono">${esc(block.source)}</span></caption>
    <thead><tr><th scope="col">Candidate</th><th scope="col">Outcome</th><th scope="col" class="num">Detected</th><th scope="col" class="num">Correct type</th><th scope="col" class="num">Correct class</th>
      <th scope="col" class="num">False + excess episodes</th><th scope="col" class="num">Sensor type + channel</th><th scope="col" class="num">Composite</th><th scope="col">Gate failures</th></tr></thead>
    <tbody>${block.rows.map((r) => {
      const selected = r.candidate === block.selected;
      return `<tr><th scope="row">${esc(r.candidate)}</th><td>${selected ? pill('s-info', 'Retained control') : pill('s-gray', 'Rejected')}</td>
        <td class="num">${esc(r.detected)}/${esc(r.events || denom)}</td><td class="num">${esc(r.type_correct)}</td><td class="num">${esc(r.class_correct)}</td>
        <td class="num">${esc(r.false_plus_excess)} (${esc(r.false_episodes)} + ${esc(r.excess_repeats)})</td><td class="num">${esc(r.sensor_type_and_channel)}</td>
        <td class="num" title="${esc(r.composite_score)}">${n2(r.composite_score)}</td><td class="small">${esc((r.gate_failures || (selected ? 'control' : '—')).replace(/\|/g, '; ').replace(/_/g, ' '))}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function pairVerdict(e) {
  const f = e.full; const m = e.mask;
  if (f.detected === 'False' && m.detected === 'True') return ['s-attn', 'Adverse: detected only when masked'];
  if (f.type_correct !== 'True' && m.type_correct === 'True') return ['s-attn', 'Adverse: correct type only when masked'];
  if (f.detected === 'True' && m.detected === 'False') return ['s-info', 'Lost when masked'];
  if (f.type_correct === 'True' && m.type_correct !== 'True') return ['s-info', 'Correct type lost when masked'];
  return ['s-gray', 'Changed label or timing'];
}
const outcome = (o) => (o.detected === 'True' ? `${esc(o.predicted_fault_type || '—')}${o.type_correct === 'True' ? ' ✓' : ''} · ${esc((o.first_alert_utc || '').slice(0, 16).replace('T', ' '))}` : 'Not detected');

function ablationGroup(ab, group, open) {
  const metrics = [['detected', 'Detected'], ['class_correct', 'Correct class'], ['type_correct', 'Correct type'], ['false_plus_excess', 'False + excess'], ['sensor_type_and_channel', 'Sensor type + channel'], ['unknown_first_diagnoses', 'UNKNOWN first']];
  const block = (split, scopeLabel) => {
    const rows = ab.summary[split].filter((r) => r.scope === 'pooled');
    const by = Object.fromEntries(rows.map((r) => [r.branch, r]));
    const branches = [['full', 'Full'], [`mask:${group}`, 'Masked'], [`restore:${group}`, 'Restored']];
    const restore = ab.restoreCheck[split].filter((r) => r.branch === `restore:${group}`);
    const restoreOk = restore.length > 0 && restore.every((r) => r.categorical_exact === 'True' && r.all_fields_within_tolerance === 'True');
    const pairs = ab.paired[split][group];
    return `<h4>${esc(scopeLabel)} · ${esc(by.full.events)} events (original denominator)</h4>
      <div class="table-wrap" role="region" aria-label="${esc(GROUP_LABEL[group])} ${esc(split)}" tabindex="0"><table>
      <thead><tr><th scope="col">Branch</th>${metrics.map(([, t]) => `<th scope="col" class="num">${t}</th>`).join('')}</tr></thead>
      <tbody>${branches.map(([b, t]) => `<tr><th scope="row">${t}</th>${metrics.map(([k]) => `<td class="num">${esc(by[b]?.[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="small">Restore check: ${restoreOk ? pill('s-ok', `restored = full on ${restore.length} asset(s)`) : pill('s-alert', 'restore differs')}</p>
      ${pairs.length ? `<ul class="tight small">${pairs.map((e) => { const [cls, t] = pairVerdict(e); return `<li>${pill(cls, t)} <b>${esc(e.event_id)}</b> ${esc(e.fault_type)} — full: ${outcome(e.full)}; masked: ${outcome(e.mask)}</li>`; }).join('')}</ul>` : '<p class="small muted">No event changed between full and masked.</p>'}`;
  };
  return `<details class="panel-sub"${open ? ' open' : ''}><summary><b>${esc(GROUP_LABEL[group])}</b> <span class="small muted mono">${esc(ab.groups[group].join(', '))}</span></summary>
    ${block('train', `Train (${ab.trainAssets.join(', ')})`)}
    ${block('validation', `${ab.descriptiveAssets.join(', ')} — descriptive, previously inspected`)}</details>`;
}

export function renderExperiments(ex) {
  if (!ex) return '<section class="panel"><h2>Reviewed experiments</h2><div class="error" role="alert">Experiment evidence unavailable in this bundle.</div></section>';
  const ab = ex.ablation;
  return `<section class="panel" aria-labelledby="ex-h"><h2 id="ex-h">Reviewed diagnostic experiments</h2>
      <p class="small">${esc(ex.notice)}</p>
      <p>${pill('s-info', 'Selected for replay')} ${esc(ex.selectedModel)}. Rejected candidates are shown only on this page and never in the operator replay.</p>
      <div class="table-wrap" role="region" aria-label="Hypothesis outcomes" tabindex="0"><table>
        <caption>Hypothesis outcomes, verbatim from <span class="mono">${esc(ex.hypothesesSource)}</span>.</caption>
        <thead><tr><th scope="col">Hypothesis</th><th scope="col">Completed work</th><th scope="col">Result and implication</th></tr></thead>
        <tbody>${ex.hypotheses.map((h) => `<tr><th scope="row">${esc(h.hypothesis)}</th><td class="small">${esc(h.work)}</td><td class="small">${esc(h.result)}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="panel" aria-labelledby="ab-h"><h2 id="ab-h">Sensor information ablation (mask / restore)</h2>
      <p class="note small"><b>Synthetic information ablation</b> with the fixed causal B1 detector: a sensor group's data is removed from the start and later restored. Not a real installation or removal, not field benefit, and not converted into economics. No result is extrapolated to blind-test pumps. Useful-diagnosis delay is not implemented for this comparison.</p>
      ${['vibration_temperature', 'suction', 'flow_power'].map((g, i) => ablationGroup(ab, g, i === 0)).join('')}
      <p class="small muted">✓ = correct fault type. Lost when masked = the group's data mattered for this event. Adverse = the full branch did worse with the data present.</p>
    </section>
    <section class="panel" aria-labelledby="b2-h"><h2 id="b2-h">B2 candidates (train, leave-one-asset-out)</h2>
      ${candidateTable(ex.b2, 'Train, 26 events, 49 asset-days. No candidate passed; C0 = unchanged causal B1.', '26')}
      ${ex.b2.priorRuns.map((r) => `<p class="note small"><b>${esc(r.run_id)}: ${esc(r.status)}.</b> ${esc(r.reason)}.</p>`).join('')}
    </section>
    <section class="panel" aria-labelledby="e3-h"><h2 id="e3-h">Regime gate and abstention (E3) · fleet prior (E4)</h2>
      ${candidateTable(ex.regime, 'Train only. Validation was not run. R0 = unchanged causal B1 (also fails the cross-seed gate: results require hash seed 0).', '26')}
      <p class="small">E4 fleet prior: ${pill('s-gray', 'Not testable')} ${esc(ex.regime.e4)}.</p>
    </section>
    <section class="panel" aria-labelledby="s-h"><h2 id="s-h">Sparse sensors and stuck values (follow-up)</h2>
      ${candidateTable(ex.sparse, 'Train only. Only one eligible real sparse stuck event exists.', '26')}
    </section>`;
}
