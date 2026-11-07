// Task022 views: pump reference editor, closed-minute hydraulic assessment (status, values, Q–H and time charts,
// explanation chain, next check) and the illustrative examples block. DOM-free HTML; EN/RU via L().
import { L } from './ru-text.js';
import { formatUtc } from './replay.js';
import {
  parseReference, parseNumber, settings, assessAt, timeline, explainAssessment, cutoffRange, interpHead, withDefaults, RULES, SOURCES, REFERENCE_STATUSES, EXAMPLE_KINDS, G,
  persistence, EPISODE,
} from './hydraulic-analysis.js';
import { checksAt, revisedExplanation, CHECK_LIMITS } from './check-loop.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = (en, ru) => esc(L(en, ru));
const f1 = (x) => (x == null ? '—' : x.toFixed(1));
const hm = (ms) => formatUtc(ms).slice(11, 16);

// ---- validation of the optional reference and assumptions (step 2) ----
export function validateAnalysis(sys) {
  const s = withDefaults(sys); const e = {};
  const r = parseReference(s.equipment.reference);
  if (!r.ok && !r.empty) e['equipment.reference'] = r.errors;
  const d = parseNumber(s.analysis.density);
  if (d !== null && !(Number.isFinite(d) && d > 0)) e['analysis.density'] = 'positive';
  const b = parseNumber(s.analysis.bandPct);
  if (!(Number.isFinite(b) && b >= 1 && b <= 50)) e['analysis.bandPct'] = 'band';
  return e;
}
const REF_ERR = {
  refQ: ['Row {row}: flow must be a number ≥ 0.', 'Строка {row}: расход — число ≥ 0.'], refH: ['Row {row}: head must be a positive number.', 'Строка {row}: напор — положительное число.'],
  refOrder: ['Row {row}: flow must increase strictly from row to row.', 'Строка {row}: расход должен строго возрастать.'], refCount: ['Enter 2–20 Q/H pairs.', 'Введите 2–20 пар Q/H.'],
  refRpm: ['Reference speed must be a positive number.', 'Частота опорной кривой — положительное число.'],
};
const sub = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

const STATUS_TXT = {
  unverified: ['Unverified', 'Не проверена'], 'user-confirmed': ['Confirmed by user', 'Подтверждена пользователем'], illustrative: ['Illustrative (authored)', 'Иллюстративная (авторская)'],
};
export function referenceEditor(sys, errors = {}) {
  const s = withDefaults(sys); const r = s.equipment.reference; const a = s.analysis;
  const id = (p) => `sf-${p.replace(/\./g, '-')}`;
  const text = (path, val, label, unit = '', attrs = '') => `<label for="${id(path)}">${esc(label)}${unit ? ` <span class="muted">(${esc(unit)})</span>` : ''}<input id="${id(path)}" data-sys="${path}" type="text" value="${esc(val)}"${unit ? ' inputmode="decimal"' : ''}${attrs}></label>`;
  const check = (path, on, label) => `<label class="chk"><input type="checkbox" id="${id(path)}" data-sys-check="${path}"${on ? ' checked' : ''}> <span>${label}</span></label>`;
  const refErr = errors['equipment.reference'];
  const rows = r.points.map((p, i) => `<tr><th scope="row">${i + 1}</th><td><input id="sf-ref-q-${i}" data-sys="equipment.reference.points.${i}.q" value="${esc(p.q)}" inputmode="decimal" aria-label="Q ${i + 1}, m³/h"></td>
    <td><input id="sf-ref-h-${i}" data-sys="equipment.reference.points.${i}.h" value="${esc(p.h)}" inputmode="decimal" aria-label="H ${i + 1}, m"></td></tr>`).join('');
  const filled = !parseReference(r).empty;
  return `<details class="panel-sub ref-ed" id="ref-editor"${filled || s.equipment.provenance === 'illustrative-example' ? ' open' : ''}><summary><b>${P('Pump reference curve and analysis assumptions (optional)', 'Опорная характеристика насоса и допущения анализа (необязательно)')}</b></summary>
    ${s.equipment.provenance === 'illustrative-example' ? `<p><span class="state s-attn">${P('Illustrative example: authored synthetic values, not a manufacturer curve', 'Иллюстративный пример: авторские синтетические значения, не кривая производителя')}</span></p>` : ''}
    <p class="small muted">${P('The design point above is not this curve. Enter Q/H pairs read from a curve that applies to this pump; H does not have to decrease monotonically.', 'Расчётная точка выше — не эта кривая. Введите пары Q/H с характеристики, относящейся к этому насосу; H не обязана монотонно убывать.')}</p>
    <div class="sys-grid2">${text('equipment.reference.name', r.name, L('Curve source / name', 'Источник / название кривой'))}
      <label for="sf-ref-status">${P('Reference status', 'Статус опоры')}<select id="sf-ref-status" data-sys="equipment.reference.status">${REFERENCE_STATUSES.map((k) => `<option value="${k}"${r.status === k ? ' selected' : ''}>${P(...STATUS_TXT[k])}</option>`).join('')}</select></label>
      ${text('equipment.reference.rpm', r.rpm, L('Reference speed', 'Частота опорной кривой'), 'rpm')}</div>
    <div class="table-wrap"><table class="ref-tbl"><thead><tr><th scope="col">#</th><th scope="col">Q, m³/h</th><th scope="col">H, m</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p>${r.points.length < 20 ? `<button type="button" id="sys-ref-add">+ ${P('Add row', 'Добавить строку')}</button>` : ''} ${r.points.length > 2 ? `<button type="button" id="sys-ref-del">− ${P('Remove last row', 'Удалить последнюю строку')}</button>` : ''}</p>
    ${refErr ? `<div class="error small" role="alert" id="err-equipment-reference"><ul class="tight">${refErr.map((x) => `<li>${esc(sub(L(...REF_ERR[x.code]), x))}</li>`).join('')}</ul></div>` : ''}
    ${check('equipment.reference.applies', r.applies, P('I confirm this curve applies to this centrifugal pump, its impeller and this fluid regime.', 'Подтверждаю, что кривая относится к этому центробежному насосу, его рабочему колесу и данному режиму среды.'))}
    <h5>${P('Assumptions for head', 'Допущения для напора')}</h5>
    <div class="sys-grid2">${text('analysis.density', a.density, L('Fluid density', 'Плотность среды'), 'kg/m³', errors['analysis.density'] ? ' aria-invalid="true"' : '')}${text('analysis.bandPct', a.bandPct, L('Comparison band', 'Полоса сравнения'), '%', errors['analysis.bandPct'] ? ' aria-invalid="true"' : '')}</div>
    ${errors['analysis.density'] ? `<span class="field-error" role="alert">${P('Enter a positive density or leave blank (then only ΔP is shown).', 'Введите положительную плотность или оставьте пустым (тогда показывается только ΔP).')}</span>` : ''}
    ${errors['analysis.bandPct'] ? `<span class="field-error" role="alert">${P('Band must be 1–50 %.', 'Полоса — от 1 до 50 %.')}</span>` : ''}
    <p class="small muted">${P('The band is an editable engineering assumption, not a certified tolerance or sensor uncertainty. Water is not assumed.', 'Полоса — изменяемое инженерное допущение, а не сертифицированный допуск или погрешность датчиков. Вода не подразумевается.')}</p>
    ${check('analysis.geometryAck', a.geometryAck, P('Ps and Pd use the same pressure reference (both gauge) and the taps have comparable elevation and pipe diameter; H ≈ 1000·(Pd − Ps)/(ρ·g) then neglects velocity and elevation corrections.', 'Ps и Pd измерены относительно одного опорного давления (оба избыточные), отборы на сопоставимой высоте и диаметре; тогда H ≈ 1000·(Pd − Ps)/(ρ·g) без поправок на скорость и высоту.'))}
    ${check('analysis.affinity', a.affinity, P('Scale to the reference speed with the affinity laws (approximate; same impeller and fluid): Q_ref = Q·n_ref/n, H_exp = H_curve(Q_ref)·(n/n_ref)². Without this, measured speed must be within ±2 % of the reference speed.', 'Приводить к опорной частоте по законам подобия (приближённо; то же колесо и среда): Q_ref = Q·n_ref/n, H_ож = H_кр(Q_ref)·(n/n_ref)². Без этого измеренная частота должна быть в пределах ±2 % от опорной.'))}
  </details>`;
}

// ---- assessment ----
const HEAD = {
  noSource: ['No analysable data source', 'Нет данных для анализа'],
  reimportNeeded: ['Re-import needed for analysis', 'Для анализа нужен повторный импорт'],
  mappingNeeded: ['Ps and Pd are not mapped at the pump taps', 'Ps и Pd не сопоставлены с отборами насоса'],
  noData: ['No measurements in the selected minute', 'В выбранной минуте нет измерений'],
  insufficientRows: ['Too few simultaneous readings in this minute', 'Слишком мало одновременных показаний в этой минуте'],
  incompleteMinute: ['Incomplete minute: verdict withheld', 'Неполная минута: вывод не делается'],
  stopped: ['Pump stopped (speed 0): outside this comparison', 'Насос остановлен (частота 0): вне этого сравнения'],
  deltaPOnly: ['Pressure rise only: head not computed', 'Только прирост давления: напор не вычислен'],
  headOnly: ['Head computed: no reference comparison', 'Напор вычислен: без сравнения с опорой'],
  transient: ['Changing regime: no steady comparison', 'Режим меняется: устойчивое сравнение невозможно'],
  insufficientReference: ['Outside the reference support: no verdict', 'Вне области опоры: вывода нет'],
  mixedRegime: ['Mixed minute: verdict withheld', 'Смешанная минута: вывод не делается'],
  below: ['Head below the expected range', 'Напор ниже ожидаемого диапазона'],
  within: ['Head matches the set range (this minute)', 'Напор соответствует заданному диапазону (эта минута)'],
  above: ['Head above the expected range', 'Напор выше ожидаемого диапазона'],
};
const REASON = {
  density: ['fluid density not entered', 'плотность среды не введена'], geometry: ['pressure basis and tap geometry not acknowledged', 'опорное давление и геометрия отборов не подтверждены'],
  reference: ['no valid reference curve', 'нет корректной опорной кривой'], applicability: ['curve not confirmed to apply to this pump', 'применимость кривой не подтверждена'], band: ['comparison band invalid', 'полоса сравнения некорректна'],
  flow: ['no mapped flow readings in this minute', 'нет показаний расхода в этой минуте'], speed: ['no measured speed in this minute (rated speed is not used)', 'нет измеренной частоты в этой минуте (номинальная не используется)'],
  outsideRange: ['flow outside the curve range (no extrapolation)', 'расход вне диапазона кривой (без экстраполяции)'], speedBand: ['speed outside ±2 % of the reference speed', 'частота вне ±2 % от опорной'],
  missingFlow: ['flow readings missing', 'нет показаний расхода'], missingSpeed: ['speed readings missing', 'нет показаний частоты'], rows: ['too few usable rows', 'слишком мало пригодных строк'],
};
const EXCL = {
  missingPressure: ['Ps or Pd blank', 'нет Ps или Pd'], reversedDp: ['Pd < Ps (reversed)', 'Pd < Ps (обратный перепад)'], negativeSpeed: ['negative speed', 'отрицательная частота'],
  stopped: ['stopped (n = 0)', 'остановлен (n = 0)'], negativeFlow: ['negative flow', 'отрицательный расход'], missingFlow: ['flow blank', 'нет расхода'],
  missingSpeed: ['speed blank', 'нет частоты'], outsideRange: ['outside curve range', 'вне диапазона кривой'], speedBand: ['outside speed band', 'вне полосы частоты'],
};
const CAUSE = {
  referenceMismatch: ['The reference does not apply (other impeller, speed, fluid, or a wrong curve)', 'Опора не подходит (другое колесо, частота, среда или неверная кривая)'],
  flowBias: ['Biased flow reading: the expected head is read at the wrong Q', 'Смещённое показание расхода: ожидаемый напор берётся при неверном Q'],
  pressureBias: ['Biased Ps/Pd reading or tap offset', 'Смещение показаний Ps/Pd или отборов'],
  internalWear: ['Internal wear or recirculation (possible, not confirmed)', 'Внутренний износ или рециркуляция (возможно, не подтверждено)'],
  suctionGas: ['Gas in the liquid or suction conditions (not a cavitation diagnosis: absolute suction pressure, vapour pressure and NPSH are unknown)', 'Газ в жидкости или условия всасывания (не диагноз кавитации: абсолютное давление всасывания, давление паров и NPSH неизвестны)'],
  impellerOrSpeed: ['Actual impeller diameter or speed differs from the reference (a resistance change moves the point along the curve and does not by itself create this gap)', 'Фактический диаметр колеса или частота отличаются от опоры (изменение сопротивления сдвигает точку вдоль кривой и само по себе не создаёт этот разрыв)'],
};
const NEXT = {
  loadData: ['Load a recording (CSV) for this system.', 'Загрузите запись (CSV) для этой системы.'],
  reimport: ['Re-import the original CSV: this record was saved earlier as an evenly thinned sample, which is not used for diagnosis.', 'Импортируйте исходный CSV повторно: запись сохранена ранее как равномерно прореженная выборка, она не используется для диагностики.'],
  confirmMapping: ['Confirm the channel mapping and tap locations; check whether existing drive signals already provide speed.', 'Подтвердите сопоставление каналов и места отборов; проверьте, не даёт ли привод уже частоту.'],
  checkRecording: ['Choose another minute or check the logger for gaps; no value from an earlier minute is carried forward.', 'Выберите другую минуту или проверьте регистратор на пропуски; значения прошлых минут не переносятся.'],
  runningRegime: ['Select a minute with the pump running forward; stopped or reversed operation is outside this comparison.', 'Выберите минуту, когда насос работает в прямом режиме; остановка и обратный режим вне этого сравнения.'],
  installationInfo: ['Enter the fluid density and confirm pressure basis and tap geometry (installation drawing) before any new sensor.', 'Введите плотность среды и подтвердите опорное давление и геометрию отборов (монтажная схема) до любого нового датчика.'],
  obtainCurve: ['Obtain the curve for this impeller and speed (datasheet or test record) before any new sensor.', 'Получите характеристику для этого колеса и частоты (паспорт или протокол испытаний) до любого нового датчика.'],
  confirmCurve: ['Confirm that the entered curve applies to this pump, impeller and fluid regime.', 'Подтвердите, что введённая кривая относится к этому насосу, колесу и режиму среды.'],
  setBand: ['Set a comparison band of 1–50 %.', 'Задайте полосу сравнения 1–50 %.'],
  temporaryFlow: ['Add a temporary independent flow measurement (e.g. clamp-on ultrasonic) synchronised with Ps/Pd.', 'Добавьте временное независимое измерение расхода (например, накладной ультразвуковой), синхронное с Ps/Pd.'],
  readDriveSpeed: ['Read speed from the drive (VFD) or a hand tachometer first; the rated speed is not a measurement.', 'Сначала снимите частоту с привода (ПЧ) или ручным тахометром; номинальная — не измерение.'],
  repeatStable: ['Repeat the comparison during a stable regime (constant speed and valve position); no permanent sensor is indicated.', 'Повторите сравнение в устойчивом режиме (постоянные частота и положение клапана); постоянный датчик не требуется.'],
  speedReference: ['Speed is outside ±2 % of the reference: enable approximate affinity scaling (same impeller and fluid) or compare at reference speed.', 'Частота вне ±2 % от опорной: включите приближённое приведение по законам подобия (то же колесо и среда) или сравните на опорной частоте.'],
  extendReference: ['The operating point lies outside the curve range: obtain curve points covering this flow (no extrapolation is done).', 'Рабочая точка вне диапазона кривой: получите точки кривой для этого расхода (экстраполяции нет).'],
  separateRegimes: ['Unsupported rows are mixed into this minute (see counts): select a minute with one steady forward-running regime.', 'В этой минуте смешаны неподдерживаемые строки (см. счётчики): выберите минуту с одним устойчивым прямым режимом.'],
  verifyIndependently: ['First check the reference and measured speed; then measure flow with an independent temporary meter and ΔP with a calibrated test gauge at the same time.', 'Сначала проверьте опору и измеренную частоту; затем одновременно измерьте расход независимым временным прибором и ΔP поверенным манометром.'],
  verifyReferenceFirst: ['The reference is not user-confirmed: verify the curve source, impeller and speed for this pump before buying or installing any instrument.', 'Опора не подтверждена: проверьте источник кривой, колесо и частоту для этого насоса до покупки или установки любых приборов.'],
  continueRecording: ['No new permanent sensor is justified by this hydraulic comparison alone. Keep recording; this check is blind to mechanical condition.', 'Одно это гидравлическое сравнение не обосновывает новый постоянный датчик. Продолжайте запись; механическое состояние эта проверка не видит.'],
};
const OUTCOME = {
  agree: ['If the independent Q and ΔP agree with the installed readings: that supports the observed difference at this point (it does not prove it); remaining explanations are reference applicability, impeller/speed, internal wear or suction conditions.', 'Если независимые Q и ΔP совпадут с установленными: это поддерживает наблюдаемое расхождение в этой точке (но не доказывает его); остаются применимость опоры, колесо/частота, износ или условия всасывания.'],
  disagree: ['If they disagree: correct the instrument or mapping first and re-run; the gap may be measurement error.', 'Если не совпадут: сначала исправьте прибор или сопоставление и повторите; разрыв может быть ошибкой измерения.'],
};
const NOTE = {
  mechanicalBlind: ['Your question is mechanical: this hydraulic comparison does not diagnose bearings. Vibration/temperature values are descriptive only (no ISO severity); a temporary spectrum measurement is the next mechanical step.', 'Ваш вопрос — механический: это гидравлическое сравнение не диагностирует подшипники. Вибрация/температура — только описательные значения (без классов ISO); следующий механический шаг — временное измерение спектра.'],
  energyNotIncluded: ['Energy ratio is not included in this slice: no efficiency or payback is computed.', 'Энергетическое соотношение в этот этап не входит: КПД и окупаемость не вычисляются.'],
};
const QUAL = {
  unverified: ['Unverified reference: every result is conditional on that curve and cannot assert an equipment fault.', 'Опора не проверена: каждый результат условен и не может утверждать неисправность оборудования.'],
  illustrative: ['Illustrative authored reference: demonstration only, not a manufacturer curve.', 'Иллюстративная авторская опора: только демонстрация, не кривая производителя.'],
};

function qhChart(sys, a, cfg) {
  if (!cfg.ref) return '';
  const pts = cfg.ref.points; const band = (cfg.bandPct ?? 10) / 100;
  const hasOp = a.hAtRefMedian != null;
  const opQ = hasOp ? a.qRefMedian : null; const opH = hasOp ? a.hAtRefMedian : null;
  const qMax = Math.max(pts.at(-1).q, opQ ?? 0) * 1.08 || 1; const hMax = Math.max(...pts.map((p) => p.h), opH ?? 0) * (1 + band) * 1.08;
  const W = 340; const H = 210; const l = 40; const r = 10; const t = 12; const b = 34;
  const x = (q) => l + (q / qMax) * (W - l - r); const y = (h) => t + (1 - h / hMax) * (H - t - b);
  const line = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.q).toFixed(1)},${y(p.h * k).toFixed(1)}`).join('');
  const ticks = (max, n) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
  const scaled = cfg.affinity;
  const opLabel = scaled ? L('operating point scaled to n_ref', 'рабочая точка, приведённая к n_ref') : L('measured operating point', 'измеренная рабочая точка');
  return `<figure class="an-chart"><figcaption class="small"><b>${P('Q–H: reference curve and selected minute', 'Q–H: опорная кривая и выбранная минута')}</b> · ${esc(cfg.refName)} (${P(...STATUS_TXT[cfg.refStatus])}) · n_ref ${cfg.ref.rpm} rpm · ${esc(hm(a.minuteStart))}–${esc(hm(a.minuteEnd))} UTC</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${P('Q–H chart', 'График Q–H')}: ${esc(opLabel)} ${hasOp ? `Q ${f1(opQ)} m³/h, H ${f1(opH)} m` : '—'}">
      ${ticks(qMax, 4).map((q) => `<line x1="${x(q)}" x2="${x(q)}" y1="${t}" y2="${H - b}" stroke="#eef1f4"/><text x="${x(q)}" y="${H - b + 12}" font-size="9" text-anchor="middle" fill="#5b6676">${Math.round(q)}</text>`).join('')}
      ${ticks(hMax, 4).map((h) => `<line x1="${l}" x2="${W - r}" y1="${y(h)}" y2="${y(h)}" stroke="#eef1f4"/><text x="${l - 4}" y="${y(h) + 3}" font-size="9" text-anchor="end" fill="#5b6676">${Math.round(h)}</text>`).join('')}
      <path d="${line(1 + band)}" fill="none" stroke="#8a9bb3" stroke-dasharray="4 3"/><path d="${line(1 - band)}" fill="none" stroke="#8a9bb3" stroke-dasharray="4 3"/>
      <path d="${line(1)}" fill="none" stroke="#1f5fbf" stroke-width="2"/>
      ${hasOp ? `<circle cx="${x(opQ)}" cy="${y(opH)}" r="5" fill="${a.status === 'within' ? '#2f7d4a' : '#b35c00'}" stroke="#fff" stroke-width="1.5"/>` : ''}
      <text x="${(l + W - r) / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="#3a4350">Q, m³/h</text><text x="10" y="${(t + H - b) / 2}" font-size="10" text-anchor="middle" fill="#3a4350" transform="rotate(-90 10 ${(t + H - b) / 2})">H, m</text>
    </svg><p class="small muted an-legend"><span class="lg-line"></span>${P('reference curve', 'опорная кривая')} <span class="lg-line dash"></span>±${cfg.bandPct ?? '—'} % ${P('band (assumption)', 'полоса (допущение)')} ${hasOp ? `<span class="lg-dot op"></span>${esc(opLabel)}` : `· ${P('no operating point in this minute', 'нет рабочей точки в этой минуте')}`}</p></figure>`;
}

function timeChart(tl, a, cfg) {
  if (!tl.length) return '';
  const useRes = tl.some((m) => m.residualPct != null);
  const vals = tl.map((m) => (useRes ? m.residualPct : m.dpMedian));
  const finite = vals.filter((v) => v != null);
  const W = 340; const H = 130; const l = 40; const r = 10; const t = 10; const b = 26;
  const band = cfg.bandPct ?? 10;
  let lo = finite.length ? Math.min(...finite) : 0; let hi = finite.length ? Math.max(...finite) : 1;
  if (useRes) { lo = Math.min(lo, -band * 1.5); hi = Math.max(hi, band * 1.5); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const t0 = tl[0].t; const t1 = tl.at(-1).t + 60_000;
  const x = (ms) => l + ((ms - t0) / (t1 - t0)) * (W - l - r); const y = (v) => t + (1 - (v - lo) / (hi - lo)) * (H - t - b);
  let d = ''; let pen = false;
  tl.forEach((m, i) => { const v = vals[i]; if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(m.t + 30_000).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  // isolated values (no neighbour on either side) are drawn as dots so a one-minute series is visible
  const dots = tl.map((m, i) => (vals[i] != null && vals[i - 1] == null && vals[i + 1] == null ? `<circle cx="${x(m.t + 30_000).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="3" fill="#1f5fbf"/>` : '')).join('');
  const gaps = tl.filter((m, i) => vals[i] == null).length;
  const unit = useRes ? '%' : (L('kPa', 'кПа'));
  return `<figure class="an-chart"><figcaption class="small"><b>${useRes ? P('Head residual per closed minute (median), %', 'Отклонение напора по закрытым минутам (медиана), %') : P('Pressure rise Pd − Ps per closed minute (median), kPa', 'Прирост давления Pd − Ps по закрытым минутам (медиана), кПа')}</b> · ${esc(hm(tl[0].t))}–${esc(hm(t1))} UTC${gaps ? ` · ${P(`${gaps} minutes without a value (gaps, not filled)`, `минут без значения: ${gaps} (пропуски не заполняются)`)}` : ''}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${P('Per-minute time chart up to the selected time', 'Поминутный график до выбранного времени')}">
      ${useRes ? `<rect x="${l}" width="${W - l - r}" y="${y(band)}" height="${y(-band) - y(band)}" fill="#eef5ee"/><line x1="${l}" x2="${W - r}" y1="${y(0)}" y2="${y(0)}" stroke="#9aa4b1"/>` : ''}
      <text x="${l - 4}" y="${y(hi) + 8}" font-size="9" text-anchor="end" fill="#5b6676">${f1(hi)}</text><text x="${l - 4}" y="${y(lo)}" font-size="9" text-anchor="end" fill="#5b6676">${f1(lo)}</text>
      <path d="${d}" fill="none" stroke="#1f5fbf" stroke-width="1.6"/>${dots}
      <rect x="${x(a.minuteStart)}" y="${t}" width="${Math.max(2, x(a.minuteEnd) - x(a.minuteStart))}" height="${H - t - b}" fill="#b35c00" opacity="0.25"/>
      <text x="${l}" y="${H - 8}" font-size="9" fill="#5b6676">${esc(hm(t0))}</text><text x="${W - r}" y="${H - 8}" font-size="9" text-anchor="end" fill="#5b6676">${esc(hm(t1))} UTC (${P('selected time', 'выбранное время')})</text>
      <text x="${l + 2}" y="${t + 9}" font-size="9" fill="#3a4350">${unit}</text>
    </svg></figure>`;
}

// ---- Task023: duration and recurrence ----
function durationBlock(p) {
  if (!p) return '';
  const look = P(`Lookback: ${p.lookbackMinutes} closed minutes from ${hm(p.lookbackStart)} UTC (max ${RULES.timelineMinutes})`, `Окно просмотра: ${p.lookbackMinutes} закрытых минут с ${hm(p.lookbackStart)} UTC (не более ${RULES.timelineMinutes})`);
  if (!p.run) {
    return p.current === 'within' ? `<p class="small an-dur" id="an-duration">${P('No mismatch in the selected minute, so earlier episodes are not counted.', 'В выбранной минуте расхождения нет, поэтому прошлые эпизоды не учитываются.')} · ${look}</p>` : '';
  }
  const since = hm(p.runStart);
  const dur = p.atLeast
    ? P(`at least ${p.run} min (already present at ${since} UTC, the start of the ${p.truncated ? 'lookback' : 'record'}; onset unknown)`, `не менее ${p.run} мин (уже было в ${since} UTC — начале ${p.truncated ? 'окна просмотра' : 'записи'}; начало неизвестно)`)
    : P(`${p.run} min since ${since} UTC`, `${p.run} мин с ${since} UTC`);
  const kind = p.sustained ? P('Sustained deviation', 'Устойчивое расхождение') : P('Isolated deviation so far', 'Пока единичное расхождение');
  const eps = p.episodes.length
    ? `${P('earlier episodes', 'прошлых эпизодов')}: <b>${p.episodes.length}</b> (${p.episodes.slice(-5).map((e) => `${esc(hm(e.start))} · ${e.atLeast ? '≥' : ''}${e.minutes} ${P('min', 'мин')}`).join('; ')})`
    : P('no earlier episode', 'прошлых эпизодов нет');
  return `<div class="an-dur" id="an-duration"><p><span class="state ${p.sustained ? 's-attn' : 's-gray'}">${kind}</span> <b class="num">${dur}</b> · <span class="small">${eps}</span></p>
    <details class="small"><summary>${P('How duration is counted', 'Как считается длительность')}</summary><p>${P(`Comparable regime: Q within ±${EPISODE.flowTolPct} % of ${f1(p.anchor.q)} m³/h and n within ±${EPISODE.speedTolPct} % of ${Math.round(p.anchor.n)} rpm (anchored on the selected minute; valve position is not used).`, `Сопоставимый режим: Q в пределах ±${EPISODE.flowTolPct} % от ${f1(p.anchor.q)} м³/ч и n в пределах ±${EPISODE.speedTolPct} % от ${Math.round(p.anchor.n)} об/мин (привязка к выбранной минуте; положение клапана не используется).`)}</p>
    <p>${look}</p>
    <p class="muted">${P(`Sustained = at least ${EPISODE.minMinutes} consecutive comparable minutes (prototype rule). Persistence is not proof of wear; a return to the range is not a repair.`, `Устойчивое = не менее ${EPISODE.minMinutes} подряд сопоставимых минут (правило прототипа). Устойчивость — не доказательство износа; возврат в диапазон — не ремонт.`)}</p></details></div>`;
}

// ---- Task023: practical check card ----
const CARD = {
  verifyIndependently: { title: ['Check the reading chain: curve and speed first, then independent Q and ΔP', 'Проверьте цепочку показаний: сначала кривая и частота, затем независимые Q и ΔP'], steps: [
    ['Compare the curve source and the speed shown by the drive (rpm) with the reference — existing information, no new instrument.', 'Сверьте источник кривой и частоту на приводе (об/мин) с опорой — имеющаяся информация, без новых приборов.'],
    ['Measure flow Q (m³/h) with a temporary clamp-on meter on a straight section of the pump line, in the same steady minute (note the UTC time).', 'Измерьте расход Q (м³/ч) временным накладным расходомером на прямом участке линии насоса в ту же устойчивую минуту (запишите время UTC).'],
    ['Measure ΔP (kPa) with a calibrated test gauge at the pump suction and discharge taps at the same time.', 'Одновременно измерьте ΔP (кПа) поверенным манометром на отборах всасывания и нагнетания насоса.']],
    answers: ['Is the head gap real, or a reading/mapping error in Q or Ps/Pd?', 'Реален ли разрыв напора или это ошибка показаний/сопоставления Q или Ps/Pd?'],
    decision: ['Agreeing values keep the gap and leave curve, speed, wear or suction explanations open; a differing value sends you to verify that measurement first.', 'Совпадение оставляет разрыв и объяснения (кривая, частота, износ, всасывание) открытыми; расхождение — сначала проверка этого измерения.'] },
  verifyReferenceFirst: { title: ['Confirm that the curve applies before any instrument', 'Подтвердите применимость кривой до любых приборов'], steps: [
    ['Check the datasheet or test record, nameplate, impeller trim and the drive speed against the entered curve.', 'Сверьте паспорт или протокол испытаний, табличку, обточку колеса и частоту привода с введённой кривой.']],
    answers: ['Does the entered curve apply to this pump at this speed?', 'Относится ли введённая кривая к этому насосу на этой частоте?'],
    decision: ['If it applies, the independent Q and ΔP check is next; if not, obtain the right curve before any measurement.', 'Если относится — следующая проверка независимыми Q и ΔP; если нет — сначала нужная кривая, затем измерения.'] },
  temporaryFlow: { title: ['Add a temporary flow measurement', 'Добавьте временное измерение расхода'], steps: [['Temporary clamp-on flow meter on a straight section of the pump line, time-synchronised (UTC) with Ps/Pd.', 'Временный накладной расходомер на прямом участке линии насоса, синхронизированный по UTC с Ps/Pd.']],
    answers: ['What is Q in the same minute as the pressures?', 'Каков Q в ту же минуту, что и давления?'],
    decision: ['With Q the minute can be compared with the curve; without it only head is shown.', 'С Q минуту можно сравнить с кривой; без него показывается только напор.'] },
  readDriveSpeed: { title: ['Read the measured speed first', 'Сначала снимите измеренную частоту'], steps: [['Read speed (rpm) from the drive (VFD) display or a hand tachometer at the shaft; note the UTC time.', 'Снимите частоту (об/мин) с дисплея привода (ПЧ) или ручным тахометром на валу; запишите время UTC.']],
    answers: ['At what speed was the pump running?', 'На какой частоте работал насос?'],
    decision: ['Measured speed enables the curve comparison (within ±2 % directly, otherwise with affinity scaling).', 'Измеренная частота позволяет сравнение с кривой (в пределах ±2 % напрямую, иначе с приведением по подобию).'] },
  repeatStable: { title: ['Repeat at a steady regime', 'Повторите в устойчивом режиме'], steps: [['Same taps and instruments, at constant speed and valve position for at least one full minute.', 'Те же отборы и приборы при постоянных частоте и положении клапана не менее одной полной минуты.']],
    answers: ['Does a steady minute agree with the curve?', 'Совпадает ли устойчивая минута с кривой?'],
    decision: ['A steady minute allows a verdict; no permanent sensor is indicated.', 'Устойчивая минута позволяет сделать вывод; постоянный датчик не требуется.'] },
  continueRecording: { title: ['Keep recording; no new instrument', 'Продолжайте запись; новый прибор не нужен'], steps: [['Keep recording with the existing instruments.', 'Продолжайте запись имеющимися приборами.']],
    answers: ['Does the head stay within the set range over time?', 'Остаётся ли напор в заданном диапазоне со временем?'],
    decision: ['No new instrument is justified by this result alone; this check is blind to mechanical condition.', 'Один этот результат не обосновывает новый прибор; механическое состояние эта проверка не видит.'] },
};
function checkCard(e, idPrefix, recordAction) {
  const c = CARD[e.next];
  const scen = e.scenario ? `<b>${P('Within this illustrative scenario (authored curve, not a manufacturer curve):', 'В рамках этого иллюстративного сценария (авторская кривая, не кривая производителя):')}</b> ` : '';
  const body = c ? `<p>${scen}<b>${P(...c.title)}</b></p><ol class="tight small chk-steps">${c.steps.map((st) => `<li>${P(...st)}</li>`).join('')}</ol>
      <dl class="kv an-kv small"><dt>${P('Answers', 'Отвечает на вопрос')}</dt><dd class="wrap">${P(...c.answers)}</dd><dt>${P('Changes the decision', 'Как меняет решение')}</dt><dd class="wrap">${P(...c.decision)}</dd></dl>`
    : `<p>${scen}${P(...NEXT[e.next])}</p>`;
  return `<div class="an-next" id="${idPrefix}-next"><h4>${P('Next useful check', 'Следующая полезная проверка')}</h4>${body}
    ${e.outcomesHtml ?? ''}
    <details class="small"><summary>${P('Permanent sensor?', 'Постоянный датчик?')}</summary><p>${P('Consider one only if a recurring, unresolved measurement need remains and an installation, cost and reliability review justifies it. No certification, price or payback is assessed here.', 'Рассматривайте только при повторяющейся нерешённой потребности в измерении и если обзор монтажа, стоимости и надёжности это оправдывает. Сертификация, цена и окупаемость здесь не оцениваются.')}</p></details>
    ${recordAction}</div>`;
}

// ---- Task023: follow-up review (entered later) ----
const REV = {
  bothDiffer: ['Independent Q and ΔP both differ from the installed readings: verify the installed measurements and mapping before any pump conclusion (the temporary instruments can also be wrong).', 'Независимые Q и ΔP оба отличаются от установленных: проверьте установленные измерения и сопоставление до выводов о насосе (временные приборы тоже могут ошибаться).'],
  flowDiffers: ['Independent Q differs from the installed flow reading: verify the flow measurement and its mapping first. This is not automatic proof that the installed sensor is broken; the temporary meter can also be wrong.', 'Независимый Q отличается от установленного расходомера: сначала проверьте измерение расхода и сопоставление. Это не доказательство неисправности установленного датчика: временный прибор тоже может ошибаться.'],
  dpDiffers: ['Independent ΔP differs from the installed Pd − Ps: verify the pressure channels, taps and pressure reference first. The test gauge can also be wrong.', 'Независимый ΔP отличается от установленного Pd − Ps: сначала проверьте каналы давления, отборы и опорное давление. Контрольный манометр тоже может ошибаться.'],
  bothAgreeMismatch: ['Independent Q and ΔP agree with the installed readings within the entered threshold: this supports the original observation of a head difference at this point (it does not prove it; the entered threshold is not a calibrated uncertainty). The cause is still unresolved: curve applicability, impeller/speed, internal wear or suction conditions remain possible.', 'Независимые Q и ΔP совпадают с установленными в пределах заданного порога: это поддерживает исходное наблюдение о расхождении в этой точке (но не доказывает его; заданный порог — не откалиброванная погрешность). Причина не установлена: применимость кривой, колесо/частота, износ или условия всасывания остаются возможными.'],
  bothAgreeNoMismatch: ['Independent Q and ΔP agree with the installed readings; no hydraulic mismatch was found in this minute. This does not establish the condition of the pump.', 'Независимые Q и ΔP совпадают с установленными; гидравлического расхождения в этой минуте нет. Это не устанавливает состояние насоса.'],
  bothReadingsAgreeOnly: ['Independent Q and ΔP agree with the installed readings, so the readings are corroborated for this minute. There is no curve conclusion for this minute (reference, density/geometry or curve range missing), so no statement about a hydraulic mismatch is made.', 'Независимые Q и ΔP совпадают с установленными: показания подтверждены для этой минуты. Вывода по кривой для этой минуты нет (нет опоры, плотности/геометрии или точка вне диапазона кривой), поэтому о гидравлическом расхождении ничего не утверждается.'],
  flowAgrees: ['Independent Q agrees: the flow reading is corroborated for this minute; ΔP remains unverified.', 'Независимый Q совпадает: показание расхода подтверждено для этой минуты; ΔP остаётся непроверенным.'],
  dpAgrees: ['Independent ΔP agrees: the pressure rise is corroborated for this minute; Q remains unverified.', 'Независимый ΔP совпадает: прирост давления подтверждён для этой минуты; Q остаётся непроверенным.'],
  noRevision: ['No comparable value in the latest check: no revised conclusion.', 'В последней проверке нет сопоставимых значений: пересмотренного вывода нет.'],
};
const REV_NEXT = {
  verifyMeasurements: ['Verify both installed measurements and their mapping, then repeat the check.', 'Проверьте оба установленных измерения и сопоставление, затем повторите проверку.'],
  verifyFlow: ['Verify the installed flow meter (installation, settings, mapping) and repeat the comparison.', 'Проверьте установленный расходомер (монтаж, настройки, сопоставление) и повторите сравнение.'],
  verifyPressure: ['Verify the Ps/Pd transmitters, tap locations and pressure reference, then repeat.', 'Проверьте датчики Ps/Pd, места отборов и опорное давление, затем повторите.'],
  investigateCause: ['Review curve applicability and speed context; consider a specialist inspection or performance test. No permanent sensor is justified by this alone.', 'Проверьте применимость кривой и частоту; рассмотрите осмотр специалистом или испытание характеристики. Один этот результат не обосновывает постоянный датчик.'],
  continueRecording: ['Keep recording; no new instrument is justified by this result.', 'Продолжайте запись; новый прибор этим результатом не обосновывается.'],
  completeContext: ['Complete the missing context (applicable curve, density and tap geometry, or curve points covering this flow) to allow a curve comparison.', 'Дополните недостающий контекст (применимая кривая, плотность и геометрия отборов или точки кривой для этого расхода), чтобы стало возможным сравнение с кривой.'],
  checkDp: ['Add an independent ΔP check at the pump taps in a steady minute.', 'Добавьте независимую проверку ΔP на отборах насоса в устойчивую минуту.'],
  checkFlow: ['Add an independent flow check in a steady minute.', 'Добавьте независимую проверку расхода в устойчивую минуту.'],
  noRevision: ['Record a value for a channel that has an installed reading in this minute.', 'Внесите значение для канала, у которого есть установленное показание в этой минуте.'],
};
const RES = { agree: ['agrees within threshold', 'совпадает в пределах порога'], differ: ['differs', 'отличается'], notChecked: ['not checked', 'не проверялось'], notComparable: ['not comparable', 'не сопоставимо'] };
const USE = {
  applied: ['used for this minute', 'используется для этой минуты'], deferred: ['measured after the selected time: not used', 'измерено после выбранного времени: не используется'],
  otherMinute: ['applies only to its own minute', 'относится только к своей минуте'], previousConfig: ['recorded under a previous configuration: not applied', 'записано при прежней конфигурации: не применяется'],
};
export const CHECK_ERR = {
  positive: ['Enter a positive number.', 'Введите положительное число.'], nonNegative: ['Enter a number ≥ 0.', 'Введите число ≥ 0.'],
  oneRequired: ['Enter at least one value: Q or ΔP.', 'Введите хотя бы одно значение: Q или ΔP.'], required: ['Required.', 'Обязательно.'], tooLong: ['Too long.', 'Слишком длинно.'],
  timestamp: ['ISO 8601 UTC time with a timezone, e.g. 2026-03-02T10:19:30Z.', 'Время ISO 8601 с часовым поясом, напр. 2026-03-02T10:19:30Z.'],
  noContext: ['That minute has no supported installed readings (≥ 3 simultaneous Ps/Pd rows over ≥ 10 s): comparison blocked.', 'В этой минуте нет поддерживаемых установленных показаний (≥ 3 одновременных строк Ps/Pd за ≥ 10 с): сравнение невозможно.'],
  unsupportedMinute: ['That minute is unsupported (no data, incomplete, stopped, transient or mixed): comparison blocked.', 'Эта минута не поддерживается (нет данных, неполная, остановка, переходный или смешанный режим): сравнение невозможно.'],
  changingRegime: ['Flow or speed changes within that minute: comparison blocked; choose a steady minute.', 'В этой минуте меняются расход или частота: сравнение невозможно; выберите устойчивую минуту.'],
  mapping: ['Ps/Pd are not mapped at the pump taps.', 'Ps/Pd не сопоставлены с отборами насоса.'], reimportNeeded: ['Re-import needed.', 'Нужен повторный импорт.'], noSource: ['No data source.', 'Нет источника данных.'],
  tolerance: [`Threshold ${CHECK_LIMITS.tolMin}–${CHECK_LIMITS.tolMax} %.`, `Порог ${CHECK_LIMITS.tolMin}–${CHECK_LIMITS.tolMax} %.`], saveFirst: ['Save the system first.', 'Сначала сохраните систему.'],
  checkLimit: [`At most ${CHECK_LIMITS.maxChecks} checks per system.`, `Не более ${CHECK_LIMITS.maxChecks} проверок на систему.`],
};
const ORIGIN_TXT = { user: ['User-entered measurement', 'Измерение, введённое пользователем'], illustrative: ['Illustrative simulation (not a real measurement)', 'Иллюстративная симуляция (не реальное измерение)'] };
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

function checkForm(sys, a, form) {
  const v = form.values; const er = form.errors ?? {};
  const err = (k) => (er[k] ? `<span class="field-error" role="alert" id="chk-err-${k}">${P(...(CHECK_ERR[er[k]] ?? CHECK_ERR.required))}</span>` : '');
  const fld = (k, label, unit = '', mode = '') => `<label for="chk-${k}">${esc(label)}${unit ? ` <span class="muted">(${unit})</span>` : ''}<input id="chk-${k}" data-chk="${k}" value="${esc(v[k])}"${mode}${er[k] ? ' aria-invalid="true"' : ''}></label>${err(k)}`;
  const illus = sys.equipment.provenance === 'illustrative-example';
  return `<form class="chk-form" id="chk-form" novalidate><h5>${P('Record check result', 'Внести результат проверки')}</h5>
    <p class="small muted">${P(`Target minute ${hm(a.minuteStart)}–${hm(a.minuteEnd)} UTC by default; the time you enter decides which minute is compared.`, `По умолчанию минута ${hm(a.minuteStart)}–${hm(a.minuteEnd)} UTC; сравнивается минута введённого времени.`)}</p>
    ${illus ? `<p class="small"><button type="button" id="chk-fill-agree">${P('Fill illustrative result: agreeing', 'Заполнить иллюстративный результат: совпадение')}</button> <button type="button" id="chk-fill-discrepant">${P('Fill illustrative result: Q discrepancy', 'Заполнить иллюстративный результат: расхождение Q')}</button> <span class="muted">${P('(fills the form only; not saved)', '(только заполняет форму; не сохраняет)')}</span></p>` : ''}
    <div class="sys-grid2">${fld('q', L('Independent flow Q', 'Независимый расход Q'), 'm³/h', ' inputmode="decimal"')}${fld('dp', L('Independent ΔP at the pump taps', 'Независимый ΔP на отборах насоса'), L('kPa', 'кПа'), ' inputmode="decimal"')}
      ${fld('instrument', L('Instrument / method', 'Прибор / метод'))}${fld('measuredAt', L('Measured at (UTC, ISO 8601)', 'Время измерения (UTC, ISO 8601)'))}
      ${fld('tolPct', L('Agreement threshold', 'Порог совпадения'), '%', ' inputmode="decimal"')}
      <label for="chk-origin">${P('Origin', 'Происхождение')}<select id="chk-origin" data-chk="origin">${['user', 'illustrative'].map((o) => `<option value="${o}"${v.origin === o ? ' selected' : ''}>${P(...ORIGIN_TXT[o])}</option>`).join('')}</select></label></div>
    ${err('values')}
    <p class="small muted">${P('The threshold is a prototype agreement threshold, not the combined instrument uncertainty.', 'Порог — прототипный порог совпадения, а не суммарная погрешность приборов.')}</p>
    ${fld('note', L('Note (optional)', 'Примечание (необязательно)'))}
    <label class="chk"><input type="checkbox" id="chk-regimeAck" data-chk-check="regimeAck"${v.regimeAck ? ' checked' : ''}> <span>${P('The independent measurement was taken in the same operating regime as the installed readings of that minute.', 'Независимое измерение выполнено в том же режиме работы, что и установленные показания этой минуты.')}</span></label>${err('regimeAck')}
    ${form.saveError ? `<div class="error small" role="alert">${P(...(CHECK_ERR[form.saveError] ?? STORE_ERR[form.saveError] ?? CHECK_ERR.required))}</div>` : ''}
    <p><button type="button" class="primary" id="chk-save">${P('Save check result', 'Сохранить результат')}</button> <button type="button" id="chk-cancel">${P('Cancel', 'Отмена')}</button></p></form>`;
}
const STORE_ERR = { quota: ['Browser storage is full; the check was not saved.', 'Хранилище браузера заполнено; проверка не сохранена.'], unavailable: ['Browser storage is unavailable; the check was not saved.', 'Хранилище браузера недоступно; проверка не сохранена.'], corrupt: ['Saved systems are unreadable; nothing was saved.', 'Сохранённые системы не читаются; ничего не сохранено.'], incompatible: ['Unknown storage format; nothing was saved.', 'Неизвестный формат хранилища; ничего не сохранено.'] };

function followUp(sys, a, cut, form) {
  const rows = checksAt(sys, a.minuteStart, cut);
  if (!rows.length && !form?.open) return '';
  const rev = revisedExplanation(rows);
  const latest = rows.filter((r) => r.use === 'applied').at(-1);
  const cnt = (u) => rows.filter((r) => r.use === u).length;
  const cmpLine = (label, unit, val, c) => (c.result === 'notChecked' ? '' : `<li>${esc(label)}: ${P('independent', 'независимо')} <b class="num">${f1(val)} ${unit}</b> · ${P('installed median', 'медиана установленного')} <span class="num">${f1(c.base ?? null)} ${unit}</span>${c.diffPct != null ? ` · <span class="num">${c.diffPct >= 0 ? '+' : ''}${f1(c.diffPct)} %</span>` : ''} → <b>${P(...RES[c.result])}</b></li>`);
  let applied = `<p class="small">${P('No check is applied to the selected minute.', 'К выбранной минуте не применена ни одна проверка.')}</p>`;
  if (latest) {
    const c = latest.check; const cmp = latest.comparison;
    applied = `<div class="fu-applied" id="fu-applied"><p class="small"><span class="state ${c.origin === 'illustrative' ? 's-attn' : 's-info'}">${P(...ORIGIN_TXT[c.origin])}</span> <b>${esc(c.id)}</b> · ${esc(c.instrument)} · ${P('measured', 'измерено')} <span class="num">${esc(formatUtc(c.measuredAt, { seconds: true }))}</span> · ${P('entered', 'внесено')} <span class="num">${esc(formatUtc(Date.parse(c.enteredAt)))}</span> · ${P('threshold', 'порог')} ±${c.tolPct} %</p>
      ${cmp.ok ? `<ul class="tight small">${cmpLine('Q', 'm³/h', c.q, cmp.q)}${cmpLine('ΔP', L('kPa', 'кПа'), c.dp, cmp.dp)}</ul>` : `<p class="small">${P(...(CHECK_ERR[cmp.reason] ?? CHECK_ERR.noContext))}</p>`}
      <p class="fu-rev"><b>${P('Revised engineering explanation', 'Пересмотренное инженерное объяснение')}:</b> ${P(...REV[rev.key])}</p>
      <p class="small"><b>${P('Next', 'Далее')}:</b> ${P(...REV_NEXT[rev.next])}</p>
      ${rows.filter((r) => r.use === 'applied').length > 1 ? `<p class="small muted">${P('Only the latest check for this minute is used; earlier ones are kept in the history and never combined.', 'Используется только последняя проверка этой минуты; более ранние остаются в истории и не объединяются.')}</p>` : ''}</div>`;
  }
  const notes = [['deferred', cnt('deferred')], ['otherMinute', cnt('otherMinute')], ['previousConfig', cnt('previousConfig')]].filter(([, n]) => n)
    .map(([k, n]) => `${P(...USE[k])}: <b>${n}</b>`).join(' · ');
  const hist = rows.length ? `<details class="small" id="fu-history"><summary>${P(`Check history (${rows.length}, append-only)`, `История проверок (${rows.length}, только добавление)`)}</summary><ul class="tight">${rows.map((r) => `<li><b>${esc(r.check.id)}</b> · ${esc(formatUtc(r.check.measuredAt, { seconds: true }))} · ${r.check.q != null ? `Q ${r.check.q} m³/h ` : ''}${r.check.dp != null ? `ΔP ${r.check.dp} ${L('kPa', 'кПа')} ` : ''}· ${P(...ORIGIN_TXT[r.check.origin])} · <i>${P(...USE[r.use])}</i></li>`).join('')}</ul></details>` : '';
  return `<section class="fu-panel" id="fu-panel" aria-labelledby="fu-h"><h4 id="fu-h">${P('Follow-up review (entered later)', 'Последующая проверка (внесена позже)')}</h4>
    <p class="small muted">${P('Annotations entered after the recording. They were not available to the original analysis; the status above is unchanged. A check applies only to its own minute and configuration, and only when the selected time is at or after its measurement.', 'Записи, внесённые после регистрации. Исходному анализу они не были доступны; статус выше не меняется. Проверка относится только к своей минуте и конфигурации и только если выбранное время не раньше её измерения.')}</p>
    ${applied}${notes ? `<p class="small">${notes}</p>` : ''}${hist}${form?.open ? checkForm(sys, a, form) : ''}</section>`;
}

export function assessmentPanel(sys, cutoff, { idPrefix = 'an', saved = false, form = null } = {}) {
  const s = withDefaults(sys);
  const range = cutoffRange(s);
  // A remembered cutoff from an earlier source can lie outside the current record: clamp to its closed-minute range
  // so the slider and the evaluated minute always agree.
  const cut = range ? Math.min(range.max, Math.max(range.min, Math.floor((cutoff ?? range.max) / 60_000) * 60_000)) : 0;
  const a = assessAt(s, cut);
  const cfg = { ...settings(s), refName: s.equipment.reference.name || L('unnamed curve', 'кривая без названия') };
  const e = explainAssessment(a, s);
  const verdict = ['below', 'within', 'above'].includes(a.status);
  const cls = a.status === 'within' ? 's-ok' : verdict ? 's-attn' : 's-gray';
  const slider = range && range.max > range.min ? `<label for="${idPrefix}-cutoff" class="an-cut">${P('As of (closed UTC minutes only)', 'На момент (только закрытые минуты UTC)')}
      <input type="range" id="${idPrefix}-cutoff" data-an-cutoff min="${range.min}" max="${range.max}" step="60000" value="${cut}"></label>` : '';
  const when = range ? `<span class="small num">${P('As of', 'На момент')} ${esc(formatUtc(cut))} · ${P('evaluated minute', 'оцениваемая минута')} ${esc(hm(a.minuteStart))}–${esc(hm(a.minuteEnd))} UTC</span>` : '';
  const head = `<div class="an-status"><span class="state ${cls}">${P(...HEAD[a.status])}</span>${when}</div>`;
  if (['noSource', 'reimportNeeded', 'mappingNeeded'].includes(a.status)) {
    return `<section class="panel-sub an-panel" id="${idPrefix}-panel" aria-labelledby="${idPrefix}-h"><h3 id="${idPrefix}-h">${P('Comparison with the pump curve', 'Сравнение с характеристикой насоса')}</h3>${head}
      <div class="an-next"><b>${P('Next useful step', 'Следующий полезный шаг')}:</b> ${P(...NEXT[e.next])}</div></section>`;
  }
  const reasons = a.reasons?.length ? `<p class="small">${P('Why', 'Почему')}: ${a.reasons.map((k) => P(...REASON[k])).join('; ')}</p>` : '';
  const kv = [];
  if (a.dpMedian != null) kv.push([L('Measured pressure rise Pd − Ps (median)', 'Измеренный прирост давления Pd − Ps (медиана)'), `${f1(a.dpMedian)} ${L('kPa', 'кПа')}`]);
  if (a.headMedian != null && a.h == null) kv.push([L('Measured head (from ΔP, assumptions below)', 'Измеренный напор (из ΔP, допущения ниже)'), `${f1(a.headMedian)} m`]);
  if (a.h != null) {
    kv.push([L('Observed head (median)', 'Наблюдаемый напор (медиана)'), `${f1(a.h)} m`], [L('Expected head from reference', 'Ожидаемый напор по опоре'), `${f1(a.hExp)} m`],
      [L('Difference (median)', 'Расхождение (медиана)'), `${a.residualPct >= 0 ? '+' : ''}${f1(a.residualPct)} % (${L('band', 'полоса')} ±${a.bandPct} %)`],
      [L('Measured Q · n (median)', 'Измеренные Q · n (медиана)'), `${f1(a.qMedian)} m³/h · ${Math.round(a.nMedian)} rpm`]);
  }
  for (const [k, label, u] of [['vibMedian', L('Vibration RMS (descriptive)', 'СКЗ вибрации (описательно)'), 'mm/s'], ['tempMedian', L('Bearing temperature (descriptive)', 'Температура подшипника (описательно)'), '°C']]) if (a[k] != null) kv.push([label, `${f1(a[k])} ${u}`]);
  const excl = Object.entries(a.excluded ?? {});
  const counts = `<p class="small">${P('Rows in this minute', 'Строк в этой минуте')}: <b>${a.rows ?? 0}</b> · ${P('used for the curve comparison', 'использовано для сравнения с кривой')}: <b>${a.used ?? 0}</b>${excl.length ? ` · ${P('excluded', 'исключено')}: ${excl.map(([k, n]) => `${P(...EXCL[k])} <b>${n}</b>`).join(', ')}` : ''}</p>`;
  const causes = e.causes.length ? `<details class="an-chain" id="${idPrefix}-causes"><summary><b>${P('Possible explanations (none is certain)', 'Возможные объяснения (ни одно не достоверно)')}</b> · ${P('what this data cannot distinguish', 'чего эти данные не различают')}</summary><ul class="tight small">${e.causes.map((c) => `<li>${P(...CAUSE[c])}</li>`).join('')}</ul>
    <p class="small"><b>${P('What this data cannot distinguish', 'Чего эти данные не различают')}:</b> ${P('All of these give the same gap while Q, Ps and Pd come from the same installed instruments.', 'Все они дают одинаковый разрыв, пока Q, Ps и Pd получены от одних и тех же установленных приборов.')}</p></details>` : '';
  const outcomes = e.outcomes.length ? `<details class="small" id="${idPrefix}-outcomes"><summary>${P('What each result of this check would change', 'Что изменит каждый результат этой проверки')}</summary><ul class="tight an-outcomes">${e.outcomes.map((o) => `<li>${P(...OUTCOME[o])}</li>`).join('')}</ul></details>` : '';
  const tl = timeline(s, cut);
  return `<section class="panel-sub an-panel" id="${idPrefix}-panel" aria-labelledby="${idPrefix}-h"><h3 id="${idPrefix}-h">${P('Comparison with the pump curve', 'Сравнение с характеристикой насоса')} <span class="state s-gray">${P('advisory · not a fault classifier', 'рекомендация · не классификатор неисправностей')}</span></h3>
    ${slider}${head}${e.qualifier ? `<p class="an-qual small"><b>${P(...QUAL[e.qualifier])}</b></p>` : ''}
    ${a.status === 'within' ? `<p class="small">${P('This is an observation for one minute, not a statement that the pump is healthy.', 'Это наблюдение за одну минуту, а не утверждение об исправности насоса.')}</p>` : ''}
    ${reasons}${kv.length ? `<dl class="kv an-kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd>`).join('')}</dl>` : ''}${counts}
    ${durationBlock(persistence(s, cut))}
    ${checkCard({ ...e, outcomesHtml: outcomes }, idPrefix, saved ? (form?.open ? '' : `<p><button type="button" class="primary" id="chk-open">${P('Record check result', 'Внести результат проверки')}</button></p>`) : `<p class="small muted">${P('Save the system first to record a check result.', 'Чтобы внести результат проверки, сначала сохраните систему.')}</p>`)}
    ${saved ? followUp(s, a, cut, form) : ''}
    ${e.questionNote ? `<p class="small an-qnote">${P(...NOTE[e.questionNote])}</p>` : ''}
    ${causes}
    <div class="an-charts">${qhChart(s, a, cfg)}${timeChart(tl, a, cfg)}</div>
    <details class="small"><summary>${P('Calculation, rules and assumptions', 'Расчёт, правила и допущения')}</summary><ul class="tight">
      <li>H = 1000·(Pd − Ps)/(ρ·g), g = ${G} m/s², ρ = ${cfg.rho ?? '—'} kg/m³; ${P('velocity and elevation corrections neglected (user-acknowledged taps).', 'поправки на скорость и высоту не учитываются (отборы подтверждены пользователем).')}</li>
      <li>${cfg.affinity ? P('Affinity scaling on: Q_ref = Q·n_ref/n, H_exp = H_curve(Q_ref)·(n/n_ref)² (approximate).', 'Приведение по подобию включено: Q_ref = Q·n_ref/n, H_ож = H_кр(Q_ref)·(n/n_ref)² (приближённо).') : P(`No scaling: rows with measured speed outside ±${RULES.speedBandPct} % of n_ref are excluded.`, `Без приведения: строки с частотой вне ±${RULES.speedBandPct} % от n_ref исключаются.`)} ${P('Linear interpolation inside the curve range only.', 'Линейная интерполяция только внутри диапазона кривой.')}</li>
      <li>${P(`Minute evidence: ≥ ${RULES.minRows} simultaneous rows spanning ≥ ${RULES.minSpanMs / 1000} s; medians per minute; transient if speed range > ${RULES.transientSpeedPct} % or flow range > ${RULES.transientFlowPct} % of the median; verdict withheld if > ${RULES.maxExcludedPct} % of rows are unsupported or the minute has a gap at its start/end.`, `Данные минуты: ≥ ${RULES.minRows} одновременных строк на ≥ ${RULES.minSpanMs / 1000} с; медианы за минуту; переходный режим, если размах частоты > ${RULES.transientSpeedPct} % или расхода > ${RULES.transientFlowPct} % от медианы; вывод не делается, если > ${RULES.maxExcludedPct} % строк не поддерживаются или у минуты пропуск в начале/конце.`)}</li>
      <li>${P('Only minutes closed by the selected time are used; nothing later and no carry-forward of earlier values.', 'Используются только минуты, закрытые к выбранному времени; ничего позже и без переноса прошлых значений.')}</li>
      <li>${P('Not computed: confidence, health score, cavitation, valve-derived flow, certification.', 'Не вычисляется: достоверность, индекс здоровья, кавитация, расход по клапану, сертификация.')}</li>
      <li>${P('Background', 'Справка')}: ${SOURCES.map((u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${esc(u.split('/').pop())}</a>`).join(', ')} (KSB pump lexicon)</li></ul></details>
  </section>`;
}

export const defaultCheckValues = (sys, minuteStart) => ({ q: '', dp: '', instrument: '', measuredAt: iso(minuteStart + 30_000), tolPct: '5', note: '', origin: sys.equipment.provenance === 'illustrative-example' ? 'illustrative' : 'user', regimeAck: false });

export const EXAMPLE_TXT = {
  stable: ['Stable, in band', 'Стабильно, в полосе'], lowHead: ['Low head after 10:08', 'Низкий напор после 10:08'], transient: ['Changing speed and flow', 'Меняющиеся частота и расход'],
  missingFlow: ['Flow channel missing', 'Нет канала расхода'], outsideRange: ['Flow outside the curve range', 'Расход вне диапазона кривой'],
};
export function examplesBlock() {
  return `<details class="panel-sub" id="sys-examples"><summary><b>${P('Illustrative examples (authored synthetic data)', 'Иллюстративные примеры (авторские синтетические данные)')}</b></summary>
    <p class="small muted">${P('Each creates a NEW unsaved draft with an illustrative curve, assumptions and mapping. Not a manufacturer curve, not challenge data, and not a measure of diagnostic accuracy.', 'Каждый создаёт НОВЫЙ несохранённый черновик с иллюстративной кривой, допущениями и сопоставлением. Не кривая производителя, не данные задания и не мера точности диагностики.')}</p>
    <ul class="tight ex-list">${EXAMPLE_KINDS.map((k) => `<li><button type="button" data-example="${k}" id="sys-ex-${k}">${P(...EXAMPLE_TXT[k])}</button> <button type="button" class="linkish small" data-example-dl="${k}">${P('Download CSV', 'Скачать CSV')}</button></li>`).join('')}</ul></details>`;
}
export const exampleFileName = (k) => `illustrative-${k}.csv`;
export { interpHead };
