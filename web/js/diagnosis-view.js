// #/diagnosis — B1 versus the frozen Z995 research method at the same alert times (Task015).
// The clock-gated card renders only explainCase(sliceCase(case, clock), asset). Ground truth is a separate
// opt-in overlay; the retrospective scorecard is benchmark context and is not clock-gated.
import { MINUTE_MS, parseUtc, formatUtc } from './replay.js';
import { CHANNEL_LABELS } from './knowledge.js';
import { sliceCase, sliceCaseLabel, explainCase, minuteRange } from './comparison.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (cls, text) => `<span class="state ${cls}">${esc(text)}</span>`;
const label = (c) => CHANNEL_LABELS[c] ?? c;
const SPLIT = { train: 'Train', validation: 'Validation' };
const KIND = {
  residual: ['s-info', 'Changed by the synchronized residual rule (E995)'], waveform: ['s-info', 'Refined by the waveform rule (W1)'],
  unsupported: ['s-gray', 'B1 retained · method not applicable'],
};
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
  const t = params?.get('t');
  const c = caseById(st.caseId);
  if (t && !Number.isNaN(parseUtc(t))) st.clocks[c.caseId] = parseUtc(t);
}

function syncUrl(c) {
  const t = new Date(clockOf(c)).toISOString().replace('.000Z', 'Z');
  const q = `case=${c.caseId}&t=${t}`;
  st.appliedQuery = q;
  history.replaceState(null, '', `#/diagnosis?${q}`);
}

function measuredTable(rows, caption) {
  return `<div class="table-wrap" role="region" aria-label="${esc(caption)}" tabindex="0"><table class="stack">
    <caption>${esc(caption)}</caption>
    <thead><tr><th scope="col">Measured channel</th><th scope="col" class="num">Mean</th><th scope="col" class="num">Std</th><th scope="col" class="num">Count</th></tr></thead>
    <tbody>${rows.map((m) => `<tr><th scope="row">${esc(m.label)}</th><td class="num" data-label="Mean">${Number(m.mean).toFixed(2)} ${esc(m.unit)}</td><td class="num" data-label="Std">${Number(m.std).toFixed(2)}</td><td class="num" data-label="Count">${esc(m.count)}</td></tr>`).join('')}</tbody></table></div>`;
}

function riseChart(raw) {
  const narrow = window.innerWidth < 600;
  const W = narrow ? 300 : 640; const H = 220; const L = 50; const R = 10; const T = 24; const B = 30;
  const a = raw.measuredRise_kpa; const b = raw.curveRise_kpa;
  const all = a.concat(b); let lo = Math.min(...all); let hi = Math.max(...all); const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const sx = (i) => L + (i / (a.length - 1)) * (W - L - R);
  const sy = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad].map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e3e7ec"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="#5a6573">${v.toFixed(0)}</text>`).join('');
  const xt = [0, 30, a.length - 1].map((i) => `<text x="${sx(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}" font-size="11" fill="#5a6573">${esc(raw.t[i].slice(11, 19))}</text>`).join('');
  // Legend is HTML outside the SVG so it wraps at any width.
  return `<figure class="rise-chart"><ul class="legend small"><li><svg width="20" height="8" aria-hidden="true"><line x1="0" x2="20" y1="4" y2="4" stroke="#1f5fbf" stroke-width="2"/></svg> Measured: Pd − Ps</li>
      <li><svg width="20" height="8" aria-hidden="true"><line x1="0" x2="20" y1="4" y2="4" stroke="#b35c00" stroke-width="2" stroke-dasharray="4 3"/></svg> Calculated: pump-curve rise at the measured flow and speed</li></ul>
    <div class="plot-scroll" role="region" aria-label="Pressure rise chart" tabindex="0">
    <svg viewBox="0 0 ${W} ${H}" class="plot${narrow ? ' plot-fixed' : ''}" style="--plot-w:${W}px" role="img" aria-label="Measured pressure rise and calculated pump-curve rise, kPa, ${a.length} synchronized 1 Hz rows in the closed minute">
      <text x="${L}" y="14" font-size="12" font-weight="600" fill="#1d232b">Pressure rise in the closed minute (kPa)</text>
      ${ticks}<path d="${path(b)}" fill="none" stroke="#b35c00" stroke-width="1.4" stroke-dasharray="4 3"/><path d="${path(a)}" fill="none" stroke="#1f5fbf" stroke-width="1.6"/>
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#aab3be"/>${xt}
    </svg></div>
    <figcaption class="small muted">Measured values from the pressure transmitters; the dashed line is calculated from the passport pump curve using the measured flow and speed, not a measured healthy band. Their difference is the residual E. Only this authorised closed train minute is exported (${a.length} rows, ${esc(raw.window)}).</figcaption></figure>`;
}

function card(c, asset) {
  const s = sliceCase(c, clockOf(c));
  const e = explainCase(s, asset);
  const minute = minuteRange(parseUtc(c.minuteStartUtc), parseUtc(c.minuteEndUtc));
  if (!e.available) {
    return `<section class="panel diag" aria-labelledby="cmp-h"><div class="diag-head"><h2 id="cmp-h" tabindex="-1">${esc(c.assetId)} · alert minute ${esc(minute)}</h2>${e.kind === 'rejected' ? pill('s-alert', 'Evidence rejected') : pill('s-gray', 'Not yet available')}</div>
      <div class="empty">${esc(e.text)}${e.snapshot ? `<br><span class="small">${esc(e.snapshot)}</span>` : ''}</div></section>`;
  }
  const [kc, kt] = KIND[e.kind];
  let observed = '';
  if (e.kind === 'residual') {
    observed = `${measuredTable(e.measured, `Measured in the closed minute: ${e.pairedRows} paired 1 Hz rows of ${e.rowsTotal}, native units.`)}
      <p class="small"><b>Derived</b> (calculated from those measurements):</p><ul class="tight small">${e.derived.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${s.rawMinute ? riseChart(s.rawMinute) : ''}`;
  } else if (e.kind === 'waveform') {
    const w = e.snapshot;
    observed = `<dl class="kv small"><dt>Snapshot</dt><dd class="mono">${esc(w.snapshotId)}</dd>
        <dt>Completed</dt><dd class="num">${esc(formatUtc(parseUtc(w.completeUtc), { seconds: true }))}</dd>
        <dt>Age at the alert</dt><dd class="num">${esc(w.ageAtAlert)} (older than the alert minute)</dd>
        <dt>Age at replay time</dt><dd class="num">${esc(w.ageNow)}</dd>
        <dt>Speed comparability</dt><dd>${esc(w.speedCheck)} (snapshot speed vs alert-minute speed)</dd>
        <dt>Empirical reference</dt><dd>${esc(w.referenceSnapshots)} commissioning snapshots completed before the alert</dd></dl>
      <p class="small"><b>Derived</b> from the snapshot spectrum:</p><ul class="tight small">${e.features.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  } else {
    observed = `${e.measured.length ? measuredTable(e.measured, 'Measured in the closed minute (native units). These inputs exist; flow does not.') : ''}`;
  }
  const t = e.technical;
  return `<section class="panel diag" aria-labelledby="cmp-h">
    <div class="diag-head"><h2 id="cmp-h" tabindex="-1">${esc(c.assetId)} · alert minute ${esc(minute)}</h2>${pill(kc, kt)}</div>
    <p class="small muted diag-time">${esc(e.timing)}</p>
    <div class="cmp-row">
      <div class="cmp-box"><span class="small muted">Earlier B1 rule</span><b>${esc(e.before.class)} · ${esc(e.before.label)}</b></div>
      <div class="cmp-arrow" aria-hidden="true">→</div>
      <div class="cmp-box cmp-new"><span class="small muted">Selected research method (Z995)</span><b>${esc(e.after.class)} · ${esc(e.after.label)}</b>${e.changed ? '' : '<span class="small">unchanged</span>'}</div>
    </div>
    <div class="diag-grid">
      <div>
        <h3><span class="step">1</span> What the method suggests</h3>
        <p class="diag-headline">${esc(e.headline)}</p><p class="small">${esc(e.caveat)}</p>
        <h3><span class="step">2</span> What was measured</h3>${observed}
      </div>
      <div>
        <h3><span class="step">3</span> Why this is still uncertain</h3>
        ${e.alternatives.length ? `<p class="small"><span class="muted">Also possible (not ranked or evaluated):</span> ${e.alternatives.map(esc).join('; ')}.</p>` : ''}
        ${e.gaps.length ? `<ul class="gap-list small">${e.gaps.map((g) => `<li>${pill(...GAP[g.kind])} ${esc(g.text)}</li>`).join('')}</ul>` : ''}
        ${e.w1Note ? `<p class="small">${esc(e.w1Note)}</p>` : ''}
        ${e.capability ? `<p class="small">${esc(e.capability.text)} <a href="${esc(e.capability.href)}">See the sensor inventory and retrofit proposal for ${esc(c.assetId)}</a>.</p>` : ''}
        <h3><span class="step">4</span> Next engineering check</h3>
        <p>${esc(e.nextCheck.text)}</p>
        <p class="small"><b>Why:</b> ${esc(e.nextCheck.reason)} <span class="muted">Advisory; this application cannot operate equipment.</span></p>
      </div>
    </div>
    <details class="panel-sub" id="cmp-tech"${st.techOpen ? ' open' : ''}><summary>Technical details: exact rule outputs, equation, all terms and assumptions</summary>
      <dl class="kv small">
        <dt>B1 output</dt><dd><span class="mono">${esc(t.b1.event_class)} · ${esc(t.b1.fault_type)}</span><div><span class="verbatim">${esc(t.b1.evidence)}</span></div><div>Recommendation: <span class="verbatim">${esc(t.b1.recommended_action)}</span></div></dd>
        <dt>Z995 output</dt><dd><span class="mono">${esc(t.z995.event_class)} · ${esc(t.z995.fault_type)} · source ${esc(t.z995.source)}</span><div><span class="verbatim">${esc(t.z995.evidence)}</span></div>
          <div>Recommendation: <span class="verbatim">${esc(t.z995.action)}</span> <span class="muted">${esc(t.actionNote)}</span></div></dd>
        <dt>Anomaly score</dt><dd><span class="num">${esc(t.score)}</span> · exact <span class="mono">${esc(t.scoreExact)}</span></dd>
        <dt>Hydraulic residual (E995)</dt><dd>${esc(e.hydraulic.text)}${e.hydraulic.reason ? ` Reason: <span class="mono">${esc(e.hydraulic.reason)}</span>.` : ''}${e.hydraulic.tailRank != null && e.kind !== 'residual' ? ` Reference-tail rank ${esc(Number(e.hydraulic.tailRank).toFixed(6))} (rule limit 0.005).` : ''}</dd>
        ${s.rawMinute ? `<dt>Equation</dt><dd class="mono">${esc(s.rawMinute.equation)}</dd><dt>Raw source</dt><dd class="mono">${esc(s.rawMinute.source)}; recomputed std(E) ${esc(s.rawMinute.recomputedStdE_kpa)} kPa</dd>` : ''}
        <dt>Assumptions</dt><dd>${esc(t.ruleDetail.assumptions)}</dd>
      </dl>
      <p class="small muted">Full stored rule_detail (covariance terms in kPa², shares, term variances, applicability incl. NPSH and curve check). Shares are variance-decomposition terms, not causal-confidence percentages; tail_rank is a rank in the empirical reference, not a p-value.</p>
      <pre class="json small" tabindex="0">${esc(JSON.stringify(t.ruleDetail, null, 1))}</pre>
    </details>
  </section>`;
}

function labelsPanel(c) {
  const l = st.showLabels ? sliceCaseLabel(c, clockOf(c)) : null;
  return `<section class="panel eval-panel" aria-labelledby="cmp-eval-h"><h2 id="cmp-eval-h">Retrospective ground truth</h2>
    <label class="check"><input id="cmp-labels" type="checkbox"${st.showLabels ? ' checked' : ''}> Show simulated label for this case</label>
    <p class="small muted">Benchmark label, shown only on request, only from this case's alert time onward and only once its onset is at or before the replay time. Never an input to either method or to the explanation above.</p>
    ${st.showLabels ? (l ? `<p class="small">${pill('s-eval', 'Ground truth')} <b>${esc(l.event_id)}</b> ${esc(l.event_class)} · ${esc(l.fault_type)}${l.sensor_tag ? ` on ${esc(l.sensor_tag)}` : ''} · onset ${esc(formatUtc(parseUtc(l.onset_utc), { seconds: true }))} · ${l.endWithheld ? 'end not revealed at this time' : `end ${esc(formatUtc(parseUtc(l.end_utc), { seconds: true }))}`}</p>`
      : `<p class="small">${clockOf(c) < parseUtc(c.alertUtc) ? 'Not revealed before this case\'s alert time.' : 'No labelled onset at or before the replay time.'}</p>`) : ''}
  </section>`;
}

const METRICS = [
  ['type_correct', 'Correct fault type (events)'], ['sensor_type_and_channel', 'Sensor faults: correct type and channel'],
  ['detected', 'Detected events'], ['false_plus_excess', 'False episodes + excess repeats'], ['nuisance_benign', 'Nuisance alerts in benign windows'],
  ['wrong_specific_first', 'Wrong specific first diagnosis'], ['alerts', 'Alerts emitted'], ['composite_score', 'Benchmark composite (not accuracy)'],
];

function eventsTable(sc, split) {
  const side = (x) => (x.detected ? `${esc(x.type ?? '—')}${x.channel ? ` <span class="small muted">${esc(label(x.channel))}</span>` : ''}${x.typeCorrect ? ' ✓' : ''}` : 'Not detected');
  return `<div class="table-wrap" role="region" aria-label="${esc(split)} events, B1 versus Z995" tabindex="0"><table>
    <caption>${esc(sc.scope)}. Ground truth is the simulated label. ✓ = correct fault type.</caption>
    <thead><tr><th scope="col">Event</th><th scope="col">Ground truth</th><th scope="col">B1 first diagnosis</th><th scope="col">Z995 first diagnosis</th><th scope="col">Change</th></tr></thead>
    <tbody>${sc.events.map((e) => `<tr><th scope="row">${esc(e.eventId)}</th><td>${esc(e.faultType)}${e.sensorTag ? ` <span class="small muted">${esc(e.sensorTag)}</span>` : ''}</td>
      <td>${side(e.b1)}</td><td>${side(e.z995)}</td><td>${e.changed ? (e.z995.typeCorrect && !e.b1.typeCorrect ? pill('s-ok', 'Gain') : pill('s-attn', 'Changed')) : '<span class="muted small">unchanged</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}

function scorecard(d) {
  const { train, validation } = d.scorecard;
  const cell = (v, k) => (k === 'composite_score' ? Number(v).toFixed(2) : esc(v));
  const changes = (sc) => `<ul class="tight small">${sc.changedAlerts.map((a) => `<li><span class="num">${esc(formatUtc(parseUtc(a.alertUtc)))}</span> ${esc(a.assetId)}: ${esc(a.b1)}${a.b1Channel ? ` (${esc(label(a.b1Channel))})` : ''} → ${esc(a.z995)}${a.z995Channel ? ` (${esc(label(a.z995Channel))})` : ''} · ${esc(a.source)}</li>`).join('')}</ul>`;
  return `<section class="panel" aria-labelledby="sc-h"><h2 id="sc-h">Retrospective benchmark comparison</h2>
    <p class="small">${pill('s-eval', 'Retrospective · full windows')} Not clock-gated. Synthetic benchmark; Z995 was adaptively developed on these inspected training assets, and validation had already been inspected, so its result is descriptive and development-informed. No failure probability, independent-test accuracy, field ROI or certification is implied.</p>
    <div class="table-wrap" role="region" aria-label="B1 versus Z995 metrics" tabindex="0"><table>
      <thead><tr><th scope="col">Metric</th><th scope="col" class="num">Train B1</th><th scope="col" class="num">Train Z995</th><th scope="col" class="num">Validation B1</th><th scope="col" class="num">Validation Z995</th></tr></thead>
      <tbody>${METRICS.map(([k, t]) => `<tr><th scope="row">${esc(t)}</th><td class="num">${cell(train.b1[k], k)}</td><td class="num">${cell(train.z995[k], k)}</td><td class="num">${cell(validation.b1[k], k)}</td><td class="num">${cell(validation.z995[k], k)}</td></tr>`).join('')}
      <tr><th scope="row">Scope</th><td colspan="2" class="small">${esc(train.scope)}</td><td colspan="2" class="small">${esc(validation.scope)}</td></tr></tbody></table></div>
    <p class="small">Train: only ${train.changedAlerts.length} alert outputs change and no new alerts are created. Validation: ${validation.changedAlerts.length} alert outputs change, all for the same bearing event (PUMP-08-E02), so they count as one corrected event. ${esc(validation.rawNote)} Missed events stay missed, e.g. PUMP-08-E04 (pressure noise).</p>
    <details class="panel-sub"><summary>Every changed alert and every event, train (26) and validation (9)</summary>
      <h3>Changed alert outputs · train</h3>${changes(train)}
      <h3>Changed alert outputs · validation</h3>${changes(validation)}
      <h3>Train events</h3>${eventsTable(train, 'Train')}
      <h3>Validation events</h3>${eventsTable(validation, 'Validation')}
      <p class="small muted">Rejected and runner-up candidates (R3, R5, Y3, Y5; E995 alone also passed but ranked below Z995) remain preserved in <span class="mono">${esc(d.provenance.train.runDir)}</span>. The frozen test release is unchanged and remains a fixed-model test export with disclosed pre-gate access.</p>
    </details>
    <details class="panel-sub"><summary>Provenance: sealed runs, manifests and source hashes</summary>
      <dl class="kv small"><dt>Generator</dt><dd class="mono">${esc(d.provenance.generator)}</dd>
        <dt>Train run</dt><dd class="mono">${esc(d.provenance.train.runDir)} · manifest ${esc(d.provenance.train.manifestSha256)}</dd>
        <dt>Validation run</dt><dd class="mono">${esc(d.provenance.validation.runDir)} · manifest ${esc(d.provenance.validation.manifestSha256)}</dd></dl>
      <ul class="tight small mono">${Object.entries(d.provenance.filesRead).map(([p, h]) => `<li>${esc(p)} · ${esc(h)}</li>`).join('')}</ul>
    </details>
  </section>`;
}

export function renderDiagnosisPage(route, assetById, rerender) {
  if (st.status === 'idle') load(rerender);
  if (st.status === 'loading') return '<h1>Diagnosis comparison</h1><p class="loading" role="status">Loading comparison bundle…</p>';
  if (st.status === 'error') return `<h1>Diagnosis comparison</h1><div class="error" role="alert">Comparison data unavailable: <span class="mono">${esc(st.error)}</span>. No result is shown instead.</div><p><button id="cmp-retry" class="primary">Retry</button></p>`;
  applyQuery(route.params);
  const d = st.data;
  const c = caseById(st.caseId);
  st.caseId = c.caseId;
  const clock = clockOf(c);
  const alertMs = parseUtc(c.alertUtc);
  return `<h1>Diagnosis comparison</h1>
    <p class="sub">The earlier B1 rule and the frozen Z995 research method at the same alert times. Research evidence on synthetic data, not a replacement of the operator replay detector (which still uses causal B1).</p>
    <p class="note small">${esc(d.notice)}</p>
    <div class="case-pick" role="group" aria-label="Case">${d.cases.map((x) => `<button type="button" data-case="${esc(x.caseId)}" aria-pressed="${x.caseId === c.caseId}">${esc(x.assetId)} · ${esc(SPLIT[x.split])} · ${esc(formatUtc(parseUtc(x.alertUtc)))}</button>`).join('')}</div>
    <section class="clockbar" aria-label="Replay clock">
      <div><div class="small muted">Replay as of</div><div class="asof" aria-live="polite">${esc(formatUtc(clock, { seconds: true }))}</div>
        <div class="small muted">${clock < alertMs ? 'Before the alert minute has closed' : clock === alertMs ? 'At the alert time' : 'After the alert'}</div></div>
      <div class="controls">
        <button type="button" id="cmp-before" class="${clock === alertMs - 1000 ? 'primary' : ''}">1 s before alert</button>
        <button type="button" id="cmp-at" class="${clock === alertMs ? 'primary' : ''}">At alert</button>
        <button type="button" id="cmp-m1" aria-label="Back one minute">−1 min</button>
        <button type="button" id="cmp-p1" aria-label="Forward one minute">+1 min</button>
        <button type="button" id="cmp-p60" aria-label="Forward one hour">+1 h</button>
        <button type="button" id="cmp-p1d" aria-label="Forward one day">+1 day</button>
      </div>
    </section>
    ${card(c, assetById(c.assetId))}
    ${labelsPanel(c)}
    ${scorecard(d)}`;
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
  main.querySelectorAll('[data-case]').forEach((b) => b.addEventListener('click', () => {
    st.caseId = b.dataset.case; st.showLabels = false; st.techOpen = false; syncUrl(caseById(st.caseId)); rerender();
  }));
}

// Route-specific provenance footer (this bundle, not the baseline demo bundle).
export function diagnosisFooter() {
  if (st.status !== 'ready') return null;
  const p = st.data.provenance;
  return `Comparison bundle generated by ${p.generator} from ${Object.keys(p.filesRead).length} hashed source files.`;
}
