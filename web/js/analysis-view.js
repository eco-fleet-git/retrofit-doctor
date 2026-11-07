// Task022 views: pump reference editor, closed-minute hydraulic assessment (status, values, Q–H and time charts,
// explanation chain, next check) and the illustrative examples block. DOM-free HTML; EN/RU via L().
import { L } from './ru-text.js';
import { formatUtc } from './replay.js';
import {
  parseReference, parseNumber, settings, assessAt, timeline, explainAssessment, cutoffRange, interpHead, withDefaults, RULES, SOURCES, REFERENCE_STATUSES, EXAMPLE_KINDS, G,
} from './hydraulic-analysis.js';

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
  agree: ['If the independent Q and ΔP agree with the installed readings: the gap is real at this point; remaining explanations are reference applicability, impeller/speed, internal wear or suction conditions.', 'Если независимые Q и ΔP совпадут с установленными: разрыв реален в этой точке; остаются применимость опоры, колесо/частота, износ или условия всасывания.'],
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

export function assessmentPanel(sys, cutoff, { idPrefix = 'an' } = {}) {
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
    <div class="an-next" id="${idPrefix}-next"><h4>${P('Next useful check', 'Следующая полезная проверка')}</h4><p>${e.scenario ? `<b>${P('Within this illustrative scenario (authored curve, not a manufacturer curve):', 'В рамках этого иллюстративного сценария (авторская кривая, не кривая производителя):')}</b> ` : ''}${P(...NEXT[e.next])}</p>${outcomes}</div>
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
