// "My systems" views (Task021): list, four-step Add/Edit wizard and saved-system detail. EN/RU via L().
// Local only: saved in this browser; no backend, no network requests, no diagnosis of the user's data.
import { L } from './ru-text.js';
import { getLang } from './i18n.js';
import { formatUtc } from './replay.js';
import {
  newSystem, validateStep, applyChallengeExample, mapDataChannels, parseCsv, compactSource, challengeSource, networkSource, readiness, nextStep,
  createSystemsStore, CHANNELS, CHANNEL_IDS, SENSOR_SETS, CSV_TEMPLATE, LIMITS, QUESTIONS, SITE_KINDS, INTERFACES, STATUSES,
} from './systems-model.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = {
  getItem: (k) => globalThis.localStorage.getItem(k), setItem: (k, v) => globalThis.localStorage.setItem(k, v), removeItem: (k) => globalThis.localStorage.removeItem(k),
};
export const systemsStore = createSystemsStore(storage);

// Wizard state survives re-renders and language changes (module state, not persisted until Save).
const wz = { key: null, draft: null, step: 1, errors: {}, csv: null, saveError: null };
export const wizardState = wz; // exposed for DOM-free view tests

const T = {
  question: { hydraulic: ['Hydraulic operation', 'Гидравлический режим'], mechanical: ['Mechanical condition', 'Механическое состояние'], energy: ['Energy assessment', 'Энергетическая оценка'] },
  questionWhy: {
    hydraulic: ['Supports deciding whether the pump runs where expected and whether a pressure or flow reading needs verification.', 'Помогает решить, работает ли насос в ожидаемой точке и нужно ли проверить показания давления или расхода.'],
    mechanical: ['Supports deciding whether a vibration or temperature trend justifies a specialist measurement.', 'Помогает решить, оправдывает ли тренд вибрации или температуры измерение специалистом.'],
    energy: ['Supports deciding whether an energy review of this pump is worth an instrumented measurement.', 'Помогает решить, стоит ли энергетический анализ этого насоса приборного измерения.'],
  },
  kind: { vessel: ['Vessel', 'Судно'], plant: ['Plant', 'Завод'], datacentre: ['Data centre', 'Дата-центр'] },
  iface: { file: ['File import', 'Импорт файла'], lan: ['Local network (planned)', 'Локальная сеть (план)'], gateway: ['Gateway (planned)', 'Шлюз (план)'] },
  status: { installed: ['Installed', 'Установлен'], proposed: ['Proposed', 'Предлагается'], absent: ['Not present', 'Нет'] },
  ch: {
    ps: ['Ps · suction pressure', 'Ps · давление на всасывании'], pd: ['Pd · discharge pressure', 'Pd · давление нагнетания'], q: ['Q · flow', 'Q · расход'],
    n: ['n · speed', 'n · частота вращения'], power: ['P · motor input power', 'P · потребляемая мощность'], vib: ['V · housing vibration RMS', 'V · вибрация корпуса (СКЗ)'],
    temp: ['T · bearing temperature', 'T · температура подшипника'], valve: ['Vp · valve position', 'Vp · положение клапана'],
  },
  loc: {
    suction: ['Pump suction tap', 'Отбор на всасывании'], discharge: ['Pump discharge tap', 'Отбор на нагнетании'], line: ['On the line', 'На линии'], shaft: ['Shaft / drive', 'Вал / привод'],
    drive: ['Drive / power meter', 'Привод / счётчик'], housing: ['Bearing housing', 'Корпус подшипника'], valve: ['Valve actuator', 'Привод клапана'],
  },
  cap: { hydraulic: ['Hydraulic', 'Гидравлика'], mechanical: ['Mechanical', 'Механика'], energy: ['Energy', 'Энергетика'] },
  capStatus: {
    notReady: ['Not yet possible', 'Пока невозможно'], review: ['Review possible', 'Возможен просмотр'], trend: ['Trend only', 'Только тренд'], potential: ['Potential review', 'Возможна предварительная оценка'],
  },
  can: {
    pressureRise: ['Measured pressure rise Pd − Ps over the recording', 'Измеренный прирост давления Pd − Ps по записи'],
    designPointComparison: ['Compare the measured point with the single design point', 'Сравнение измеренной точки с одной расчётной точкой'],
    rmsTrend: ['Vibration RMS trend (not a fault diagnosis)', 'Тренд СКЗ вибрации (не диагноз неисправности)'],
    tempTrend: ['Bearing temperature trend', 'Тренд температуры подшипника'],
    wireToWaterPotential: ['Rough wire-to-water review under stated assumptions', 'Грубая оценка «от сети до воды» при оговорённых допущениях'],
  },
  missing: {
    psPdSimultaneous: ['Simultaneous Ps and Pd readings from installed sensors', 'Одновременные показания Ps и Pd установленных датчиков'],
    tapLocations: ['Ps at the suction tap and Pd at the discharge tap', 'Ps на отборе всасывания и Pd на отборе нагнетания'],
    flowSimultaneous: ['Flow Q at the same time as the pressures', 'Расход Q одновременно с давлениями'],
    designPoint: ['Design flow and head in the passport', 'Расчётные расход и напор в паспорте'],
    pumpCurve: ['A verified pump curve or reference (one design point is not a curve)', 'Проверенная характеристика насоса или опора (одна расчётная точка — не кривая)'],
    speedContext: ['Measured speed to compare operating regimes (rated speed is not a measurement)', 'Измеренная частота для сравнения режимов (номинальная — не измерение)'],
    vibration: ['Vibration readings from an installed sensor', 'Показания вибрации от установленного датчика'],
    waveform: ['Waveform with known bandwidth and a reference for any bearing fault inference', 'Форма сигнала с известной полосой и опорой для любого вывода о подшипнике'],
    energyInputs: ['Simultaneous input power, flow, Ps and Pd', 'Одновременные мощность, расход, Ps и Pd'],
    densityGeometry: ['Fluid density and tap geometry (assumed here, not measured)', 'Плотность среды и геометрия отборов (здесь допущение, не измерение)'],
  },
  note: {
    valveNotFlow: ['Valve position alone does not prove flow.', 'Положение клапана само по себе не доказывает расход.'],
    shortRecording: ['Short recording (under 1 h): not a reference period.', 'Короткая запись (меньше 1 ч): это не опорный период.'],
    challengeNoisy: ['Challenge minute: historical synthetic data with a noisy flow reading; not a healthy reference.', 'Минута задания: исторические синтетические данные с шумным расходом; не исправная опора.'],
    configurationOnly: ['Network source is configuration only: not connected, no data received.', 'Сетевой источник — только конфигурация: не подключён, данных нет.'],
  },
  next: {
    loadData: ['Load a recording (CSV or the challenge minute) to see what can be reviewed.', 'Загрузите запись (CSV или минуту задания), чтобы увидеть, что можно разобрать.'],
    resolveMapping: ['Resolve the channel mapping first: the file has columns for channels not configured as installed.', 'Сначала устраните несоответствие каналов: в файле есть столбцы для каналов, не отмеченных как установленные.'],
    measurePressures: ['Use existing pressure gauges or a temporary pair of transmitters at the suction and discharge taps, recorded at the same time.', 'Используйте имеющиеся манометры или временную пару датчиков на отборах всасывания и нагнетания с одновременной записью.'],
    temporaryFlow: ['Add a temporary clamp-on flow measurement synchronized with the pressures before any permanent sensor.', 'Добавьте временное накладное измерение расхода, синхронное с давлениями, до любого постоянного датчика.'],
    verifyIndependently: ['Review the pressure rise now; verify the flow reading with an independent instrument before conclusions.', 'Разберите прирост давления сейчас; до выводов сверьте расход с независимым прибором.'],
    portableSpectrum: ['Treat RMS as a trend; take a portable spectrum measurement before any bearing conclusion.', 'Считайте СКЗ трендом; перед выводом о подшипнике снимите переносной спектр.'],
    temporaryVibration: ['Start with a temporary vibration measurement on the bearing housing.', 'Начните с временного измерения вибрации на корпусе подшипника.'],
    verifyPower: ['A rough energy review is possible; verify power and flow independently and state the density/geometry assumptions.', 'Возможна грубая энергетическая оценка; сверьте мощность и расход независимо и укажите допущения о плотности и геометрии.'],
    temporaryEnergy: ['Use existing drive power data and a temporary flow measurement together with Ps/Pd.', 'Используйте данные мощности привода и временное измерение расхода вместе с Ps/Pd.'],
  },
  csvErr: {
    tooLarge: ['File larger than {limit} bytes.', 'Файл больше {limit} байт.'], tooManyRows: ['More than {limit} rows.', 'Больше {limit} строк.'], empty: ['The file is empty.', 'Файл пуст.'],
    firstColumn: ['The first column must be timestamp_utc (found “{value}”).', 'Первый столбец должен быть timestamp_utc (найдено «{value}»).'],
    unknownHeader: ['Unknown column “{value}”.', 'Неизвестный столбец «{value}».'], duplicateHeader: ['Duplicate column “{value}”.', 'Повторный столбец «{value}».'],
    noChannels: ['No measurement columns.', 'Нет столбцов измерений.'], columnCount: ['Line {line}: wrong number of values.', 'Строка {line}: неверное число значений.'],
    timestamp: ['Line {line}: invalid timestamp “{value}” (ISO 8601 with timezone, real calendar date).', 'Строка {line}: неверная метка времени «{value}» (ISO 8601 с часовым поясом, существующая дата).'],
    duplicateTime: ['Line {line}: duplicate timestamp.', 'Строка {line}: повторная метка времени.'], outOfOrder: ['Line {line}: timestamp earlier than the previous row.', 'Строка {line}: время раньше предыдущей строки.'],
    number: ['Line {line}, {column}: “{value}” is not a finite number.', 'Строка {line}, {column}: «{value}» — не конечное число.'], noRows: ['No data rows.', 'Нет строк данных.'],
  },
  storeErr: {
    corrupt: ['Saved systems in this browser are unreadable; they were left untouched and nothing was overwritten.', 'Сохранённые системы в этом браузере не читаются; они не изменены и не перезаписаны.'],
    incompatible: ['Saved systems use an unknown format; they were left untouched.', 'Сохранённые системы в неизвестном формате; они не изменены.'],
    unavailable: ['Browser storage is unavailable; systems cannot be saved here.', 'Хранилище браузера недоступно; системы здесь не сохранить.'],
    quota: ['Browser storage is full; the system was not saved.', 'Хранилище браузера заполнено; система не сохранена.'],
    limit: [`At most ${LIMITS.maxSystems} systems can be stored locally.`, `Локально можно хранить не более ${LIMITS.maxSystems} систем.`],
  },
};
const tr = (pair, vars = {}) => (getLang() === 'ru' ? pair[1] : pair[0]).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

// ---- shared pieces ----
function schematic(sys) {
  const st = (c) => sys.channels[c].status;
  const pt = (c, x, y, code) => {
    const s = st(c);
    if (s === 'absent') return '';
    return `<g><circle cx="${x}" cy="${y}" r="10" fill="${s === 'installed' ? '#2458c6' : '#fff5df'}" stroke="${s === 'installed' ? '#fff' : '#8a5a00'}" stroke-width="1.5"${s === 'proposed' ? ' stroke-dasharray="3 2"' : ''}/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${s === 'installed' ? '#fff' : '#8a5a00'}">${code}</text></g>`;
  };
  const list = CHANNEL_IDS.filter((c) => st(c) !== 'absent').map((c) => `${tr(T.ch[c])}: ${tr(T.status[st(c)])}`).join('; ') || L('no measurement points selected', 'точки измерения не выбраны');
  return `<figure class="sys-sch"><svg viewBox="0 0 340 150" role="img" aria-label="${esc(L('User-defined conceptual loop: pump, motor, control valve after the pump. ', 'Пользовательская условная схема: насос, двигатель, регулирующий клапан после насоса. ') + list)}">
    <path d="M8 90 H96" stroke="#9aa4b1" stroke-width="7" fill="none"/><path d="M124 64 V34 H330" stroke="#9aa4b1" stroke-width="7" fill="none"/>
    <circle cx="110" cy="90" r="26" fill="#eef1f4" stroke="#5f6670" stroke-width="2"/><text x="110" y="94" text-anchor="middle" font-size="10" fill="#3a4350">${esc(L('Pump', 'Насос'))}</text>
    <line x1="136" y1="90" x2="160" y2="90" stroke="#5f6670" stroke-width="4"/><rect x="160" y="72" width="72" height="36" rx="5" fill="#eef1f4" stroke="#5f6670" stroke-width="2"/>
    <text x="196" y="94" text-anchor="middle" font-size="10" fill="#3a4350">${esc(L('Motor', 'Двигатель'))}</text>
    <path d="M250 24 l16 10 l-16 10 z M282 24 l-16 10 l16 10 z" fill="#fff" stroke="#5f6670" stroke-width="1.6"/><text x="266" y="58" text-anchor="middle" font-size="9.5" fill="#5b6676">${esc(L('Valve', 'Клапан'))}</text>
    ${pt('ps', 70, 90, 'Ps')}${pt('pd', 124, 44, 'Pd')}${pt('q', 210, 34, 'Q')}${pt('valve', 300, 34, 'Vp')}${pt('vib', 110, 132, 'V')}${pt('temp', 80, 132, 'T')}${pt('n', 176, 128, 'n')}${pt('power', 216, 128, 'P')}
  </svg><figcaption class="small muted">${esc(L('User-defined conceptual loop (template: valve after the pump is an assumption). Not a piping drawing.', 'Пользовательская условная схема (шаблон: клапан после насоса — допущение). Не схема трубопровода.'))}
    <span class="sys-leg"><span class="lg-dot inst"></span>${esc(tr(T.status.installed))} <span class="lg-dot prop"></span>${esc(tr(T.status.proposed))}</span></figcaption></figure>`;
}

function preview(sys) {
  const src = sys.source;
  if (src && src.kind !== 'network' && !readiness(sys).previewOk && src.coverage?.ps && src.coverage?.pd) {
    return `<p class="empty small">${esc(L('A pressure-rise chart is shown only after Ps and Pd are mapped as installed sensors at the pump taps.', 'График прироста давления показывается только после сопоставления Ps и Pd с установленными датчиками на отборах насоса.'))}</p>`;
  }
  if (!src || src.kind === 'network' || !src.sample?.values?.ps || !src.sample?.values?.pd) {
    return `<p class="empty small">${esc(src?.kind === 'network' ? tr(T.note.configurationOnly) : L('No simultaneous Ps/Pd measurements to chart.', 'Нет одновременных измерений Ps/Pd для графика.'))}</p>`;
  }
  const pts = src.sample.t.map((tm, i) => [tm, src.sample.values.ps[i], src.sample.values.pd[i]]).filter(([, a, b]) => a != null && b != null).map(([tm, a, b]) => [tm, b - a]);
  if (pts.length < 2) return `<p class="empty small">${esc(L('No simultaneous Ps/Pd measurements to chart.', 'Нет одновременных измерений Ps/Pd для графика.'))}</p>`;
  const W = 300; const H = 90; const x0 = pts[0][0]; const x1 = pts.at(-1)[0]; const ys = pts.map((p) => p[1]); const lo = Math.min(...ys); const hi = Math.max(...ys);
  const sx = (x) => 6 + ((x - x0) / (x1 - x0 || 1)) * (W - 12); const sy = (y) => 6 + (1 - (y - lo) / (hi - lo || 1)) * (H - 12);
  const kpa = getLang() === 'ru' ? 'кПа' : 'kPa';
  return `<figure class="sys-prev"><figcaption class="small"><b>${esc(L('Measured pressure rise Pd − Ps', 'Измеренный прирост давления Pd − Ps'))}</b>, ${kpa} · <span class="num">${esc(formatUtc(x0, { seconds: true }))} – ${esc(formatUtc(x1, { seconds: true }).slice(11))}</span> · ${lo.toFixed(1)}–${hi.toFixed(1)} ${kpa}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L('Measured pressure rise', 'Измеренный прирост давления'))}, ${pts.length}"><path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('')}" fill="none" stroke="#1f5fbf" stroke-width="1.5"/></svg></figure>`;
}

function sourceSummary(src) {
  if (!src) return `<span class="state s-gray">${esc(L('No data source', 'Нет источника данных'))}</span>`;
  if (src.kind === 'network') return `<span class="state s-gray">${esc(L('Configuration only · not connected', 'Только конфигурация · не подключено'))}</span>`;
  const what = src.kind === 'challenge' ? L('Challenge recording loaded (historical, synthetic)', 'Загружена запись задания (историческая, синтетическая)') : L(`CSV loaded: ${src.fileName ?? ''}`, `CSV загружен: ${src.fileName ?? ''}`);
  return `<span class="state s-info">${esc(what)}</span> <span class="small muted num">${esc(formatUtc(src.window.start, { seconds: true }))} – ${esc(formatUtc(src.window.end, { seconds: true }))} · ${esc(L(`${src.rowsTotal} rows`, `строк: ${src.rowsTotal}`))}${src.rowsStored < src.rowsTotal ? ` · ${esc(L(`${src.rowsStored} stored locally (full file not kept)`, `сохранено локально: ${src.rowsStored} (полный файл не хранится)`))}` : ''}</span>`;
}

const chName = (c) => tr(T.ch[c]);
function readinessBlock(sys, { wizard = false } = {}) {
  const r = readiness(sys);
  const cards = QUESTIONS.map((q) => {
    const c = r.capabilities[q];
    const cls = c.status === 'notReady' ? 's-gray' : c.status === 'trend' || c.status === 'potential' ? 's-attn' : 's-info';
    return `<section class="cap-card${q === sys.question ? ' cap-main' : ''}" aria-labelledby="cap-${q}"><h4 id="cap-${q}">${esc(tr(T.cap[q]))} <span class="state ${cls}">${esc(tr(T.capStatus[c.status]))}</span></h4>
      ${c.can.length ? `<ul class="tight small cap-can">${c.can.map((k) => `<li>${esc(tr(T.can[k]))}</li>`).join('')}</ul>` : ''}
      ${c.missing.length ? `<details class="cap-missing"${q === sys.question ? ' open' : ''}><summary class="small">${esc(L(`Still needed (${c.missing.length})`, `Ещё нужно (${c.missing.length})`))}</summary><ul class="tight small">${c.missing.map((k) => `<li>${esc(tr(T.missing[k]))}</li>`).join('')}</ul></details>` : ''}</section>`;
  }).join('');
  const nx = nextStep(sys, r);
  const codes = (ids) => (ids.length ? ` (${ids.map((c) => chName(c).split(' · ')[0]).join(', ')})` : '');
  const counts = `<p class="small">${esc(L('Configured as installed', 'Отмечено установленными'))}: <b>${r.configured.length}</b> · ${esc(L('proposed', 'предложено'))}: <b>${r.proposed.length}</b><br>
    ${esc(L('Channels in the loaded data', 'Каналов в загруженных данных'))}: <b>${r.inData.length}</b>${esc(codes(r.inData))} · ${esc(L('mapped and usable', 'сопоставлено и используется'))}: <b>${r.received.length}</b>${esc(codes(r.received))}</p>`;
  const warn = [
    ...(r.conflicts.length ? [L(`Mapping check needed: the data contains ${r.conflicts.map((c) => `${chName(c)} (${CHANNELS[c].header})`).join(', ')}, but these channels are not configured as installed sensors, so their values are not used yet.`, `Нужна проверка соответствия: в данных есть ${r.conflicts.map((c) => `${chName(c)} (${CHANNELS[c].header})`).join(', ')}, но эти каналы не отмечены как установленные датчики, поэтому их значения пока не используются.`)] : []),
    ...(r.locationWarnings.length ? [L('Ps/Pd point locations differ from the pump taps; pressure rise is not computed.', 'Точки Ps/Pd не совпадают с отборами насоса; прирост давления не вычисляется.')] : []),
    ...r.notes.map((k) => tr(T.note[k])),
  ];
  const mapAction = r.conflicts.length ? (wizard
    ? `<p><button type="button" id="sys-map-data">${esc(L('Mark these data channels as installed at the default points', 'Отметить эти каналы данных как установленные в стандартных точках'))}</button> <span class="small muted">${esc(L('Only if the file really comes from those sensors.', 'Только если файл действительно получен с этих датчиков.'))}</span></p>`
    : `<p class="small"><a href="#/systems/${esc(sys.id)}/edit">${esc(L('Edit the channel mapping', 'Изменить сопоставление каналов'))}</a></p>`) : '';
  return `${counts}${warn.length ? `<ul class="sys-warn small">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}${mapAction}
    <div class="cap-grid">${cards}</div>
    <div class="sys-next"><h4>${esc(L('Next useful step', 'Следующий полезный шаг'))} <span class="state s-gray">${esc(L('advisory', 'рекомендация'))}</span></h4><p>${esc(tr(T.next[nx.key]))}</p>
      ${nx.set ? `<details class="small"><summary>${esc(L('Possible permanent set (proposal)', 'Возможный постоянный комплект (предложение)'))}</summary><p>${esc(nx.set.map((c) => tr(T.ch[c])).join(' · '))}. ${esc(L('Purpose, installation and cost are open questions; hardware design, certification and installation are not verified.', 'Назначение, монтаж и стоимость — открытые вопросы; аппаратная часть, сертификация и монтаж не проверены.'))}</p></details>` : ''}
      <p class="small muted">${esc(L('This is readiness for review, not a diagnosis of the system.', 'Это готовность к разбору, а не диагноз системы.'))}</p></div>`;
}

// ---- wizard ----
const STEPS = [['Site and decision', 'Площадка и решение'], ['Equipment passport', 'Паспорт оборудования'], ['Sensors and data', 'Датчики и данные'], ['Readiness', 'Готовность']];
const fieldErr = (path) => (wz.errors[path] ? `<span class="field-error" id="err-${path.replace(/\./g, '-')}" role="alert">${esc({ required: L('Required.', 'Обязательное поле.'), positive: L('Enter a positive number or leave blank if unknown.', 'Введите положительное число или оставьте пустым, если неизвестно.'), noCredentials: L('Do not put credentials in the address.', 'Не указывайте учётные данные в адресе.') }[wz.errors[path]])}</span>` : '');
const input = (path, value, label, { type = 'text', hint = '', unit = '' } = {}) => `<label for="sf-${path.replace(/\./g, '-')}">${esc(label)}${unit ? ` <span class="muted">(${esc(unit)})</span>` : ''}${hint ? ` <span class="small muted">${esc(hint)}</span>` : ''}
  <input id="sf-${path.replace(/\./g, '-')}" data-sys="${path}" type="${type}" value="${esc(value)}"${type === 'text' && unit ? ' inputmode="decimal"' : ''}${wz.errors[path] ? ` aria-invalid="true" aria-describedby="err-${path.replace(/\./g, '-')}"` : ''}></label>${fieldErr(path)}`;

function step1(s) {
  return `<div class="sys-grid2">${input('site.name', s.site.name, L('Site name', 'Название площадки'))}
    <label for="sf-site-kind">${esc(L('Site type', 'Тип площадки'))}<select id="sf-site-kind" data-sys="site.kind">${SITE_KINDS.map((k) => `<option value="${k}"${s.site.kind === k ? ' selected' : ''}>${esc(tr(T.kind[k]))}</option>`).join('')}</select></label>
    ${input('name', s.name, L('System name', 'Название системы'))}</div>
    <fieldset class="choices sys-q"><legend>${esc(L('Engineering question', 'Инженерный вопрос'))}</legend>
      ${QUESTIONS.map((q) => `<label class="choice${s.question === q ? ' selected' : ''}"><input type="radio" name="sys-q" data-sys="question" value="${q}"${s.question === q ? ' checked' : ''}><span><b>${esc(tr(T.question[q]))}</b><br><span class="small">${esc(tr(T.questionWhy[q]))}</span></span></label>`).join('')}</fieldset>
    ${schematic(s)}`;
}

function step2(s) {
  const e = s.equipment;
  return `<p class="small">${e.provenance === 'challenge-example' ? `<span class="state s-attn">${esc(L(`Prefilled from the challenge example ${e.sourceAsset} (passport metadata); edit freely`, `Заполнено из примера задания ${e.sourceAsset} (паспортные данные); можно изменить`))}</span>` : esc(L('Leave a rating blank if it is unknown; it will not be treated as zero.', 'Оставьте номинал пустым, если он неизвестен; он не будет считаться нулём.'))}
      <button type="button" id="sys-example">${esc(L('Use challenge example (PUMP-04)', 'Использовать пример задания (PUMP-04)'))}</button></p>
    <div class="sys-grid2">${input('equipment.pump.name', e.pump.name, L('Pump name', 'Название насоса'))}${input('equipment.motor.name', e.motor.name, L('Motor name', 'Название двигателя'))}
      ${input('equipment.pump.designFlow', e.pump.designFlow, L('Design flow', 'Расчётный расход'), { unit: 'm³/h' })}${input('equipment.pump.designHead', e.pump.designHead, L('Design head', 'Расчётный напор'), { unit: 'm' })}
      ${input('equipment.pump.ratedRpm', e.pump.ratedRpm, L('Rated speed', 'Номинальная частота'), { unit: 'rpm' })}${input('equipment.motor.ratedKw', e.motor.ratedKw, L('Motor rating', 'Мощность двигателя'), { unit: 'kW' })}
      ${input('equipment.valve.name', e.valve.name, L('Valve name', 'Название клапана'))}
      <label for="sf-valve-placement">${esc(L('Valve placement', 'Расположение клапана'))}<select id="sf-valve-placement" data-sys="equipment.valve.placement"><option value="after-pump"${e.valve.placement === 'after-pump' ? ' selected' : ''}>${esc(L('After the pump (template assumption)', 'После насоса (допущение шаблона)'))}</option><option value="unknown"${e.valve.placement === 'unknown' ? ' selected' : ''}>${esc(L('Unknown', 'Неизвестно'))}</option></select></label></div>
    <p class="small muted">${esc(L('Design flow and head form one design point, not a pump curve. No manufacturer or certification is implied.', 'Расчётные расход и напор — одна расчётная точка, а не характеристика насоса. Производитель и сертификация не подразумеваются.'))}</p>`;
}

function step3(s, cases) {
  const rows = CHANNEL_IDS.map((c) => `<tr><th scope="row">${esc(tr(T.ch[c]))}<div class="small muted">${esc(CHANNELS[c].header)} · ${esc(CHANNELS[c].unit)}</div></th>
    <td data-label="${esc(L('Status', 'Статус'))}"><select id="sf-ch-${c}" data-sys="channels.${c}.status" aria-label="${esc(tr(T.ch[c]))}">${STATUSES.map((v) => `<option value="${v}"${s.channels[c].status === v ? ' selected' : ''}>${esc(tr(T.status[v]))}</option>`).join('')}</select></td>
    <td data-label="${esc(L('Point', 'Точка'))}"><select id="sf-loc-${c}" data-sys="channels.${c}.location" aria-label="${esc(tr(T.ch[c]))} · ${esc(L('location', 'место'))}">${Object.keys(T.loc).map((l) => `<option value="${l}"${s.channels[c].location === l ? ' selected' : ''}>${esc(tr(T.loc[l]))}</option>`).join('')}</select></td></tr>`).join('');
  const sets = Object.entries(SENSOR_SETS).map(([q, chs]) => `<li><b>${esc(tr(T.question[q]))}</b>: ${esc(chs.map((c) => tr(T.ch[c]).split(' · ')[0]).join(', '))}
      <button type="button" class="linkish" data-sys-set="${q}">${esc(L('Mark missing ones as proposed', 'Отметить недостающие как предлагаемые'))}</button></li>`).join('');
  const src = s.source;
  const csvMsg = wz.csv ? (wz.csv.ok ? '' : `<div class="error small" role="alert"><b>${esc(L('File not loaded:', 'Файл не загружен:'))}</b><ul class="tight">${wz.csv.errors.map((er) => `<li>${esc(tr(T.csvErr[er.code] ?? [er.code, er.code], er))}</li>`).join('')}</ul></div>`) : '';
  const tmpl = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;
  return `<div class="sys-grid2">${input('device.label', s.device.label, L('Acquisition device label', 'Название устройства сбора'))}
      <label for="sf-iface">${esc(L('Planned interface', 'Планируемый интерфейс'))}<select id="sf-iface" data-sys="device.interface">${INTERFACES.map((i) => `<option value="${i}"${s.device.interface === i ? ' selected' : ''}>${esc(tr(T.iface[i]))}</option>`).join('')}</select></label></div>
    ${s.device.interface !== 'file' ? `<p class="note small">${esc(L('A network or gateway interface is a planned configuration only. This application makes no connection; a physical gateway is a proposal.', 'Сетевой интерфейс или шлюз — только планируемая конфигурация. Приложение не подключается; физический шлюз — предложение.'))}</p>` : ''}
    <h4>${esc(L('Measurement points', 'Точки измерения'))}</h4>
    <div class="table-wrap" role="region" aria-label="${esc(L('Measurement points', 'Точки измерения'))}" tabindex="0"><table class="sys-ch stack"><thead><tr><th scope="col">${esc(L('Channel · unit', 'Канал · единица'))}</th><th scope="col">${esc(L('Status', 'Статус'))}</th><th scope="col">${esc(L('Point', 'Точка'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <details class="panel-sub"><summary>${esc(L('Suggested sets by purpose (proposals)', 'Рекомендуемые комплекты по задаче (предложения)'))}</summary>
      <ul class="tight small">${sets}</ul><p class="small muted">${esc(L('Start with existing signals or a temporary measurement. Proposed points never count as received data; integration effort and verification are open.', 'Начните с имеющихся сигналов или временного измерения. Предлагаемые точки не считаются полученными данными; интеграция и проверка — открытые вопросы.'))}</p></details>
    <h4>${esc(L('Data source', 'Источник данных'))}</h4>
    <div class="sys-src">
      <section><h5>${esc(L('Challenge recording', 'Запись задания'))}</h5><p class="small">${esc(L('The reviewed PUMP-04 warning minute: Ps, Pd, Q and n only; historical synthetic data, 60 rows.', 'Разобранная минута предупреждения PUMP-04: только Ps, Pd, Q и n; исторические синтетические данные, 60 строк.'))}</p>
        <button type="button" id="sys-load-challenge"${cases ? '' : ' disabled'}>${esc(cases ? L('Load challenge recording', 'Загрузить запись задания') : L('Loading…', 'Загрузка…'))}</button></section>
      <section><h5>${esc(L('Local CSV file', 'Локальный CSV-файл'))}</h5><p class="small">${esc(L(`Read in this browser, not uploaded. First column timestamp_utc (ISO 8601 with timezone), then any of the documented columns; blank = missing reading. Up to ${LIMITS.maxRows} rows and ${LIMITS.maxBytes / 1_000_000} MB.`, `Читается в браузере, не отправляется. Первый столбец timestamp_utc (ISO 8601 с часовым поясом), затем любые описанные столбцы; пусто = нет показания. До ${LIMITS.maxRows} строк и ${LIMITS.maxBytes / 1_000_000} МБ.`))}</p>
        <label for="sys-csv">${esc(L('Choose CSV file', 'Выбрать CSV-файл'))}<input id="sys-csv" type="file" accept=".csv,text/csv"></label>
        <a href="${tmpl}" download="retrofit-doctor-template.csv" class="small">${esc(L('Download CSV template', 'Скачать шаблон CSV'))}</a>${csvMsg}</section>
      <section><h5>${esc(L('Network / gateway (planned)', 'Сеть / шлюз (план)'))}</h5>
        ${input('device.endpoint', s.device.endpoint, L('Endpoint (no credentials)', 'Адрес (без учётных данных)'))}${input('device.transport', s.device.transport, L('Transport, e.g. Modbus TCP, OPC UA, MQTT', 'Протокол, напр. Modbus TCP, OPC UA, MQTT'))}
        <button type="button" id="sys-use-network">${esc(L('Use as configuration only', 'Использовать только как конфигурацию'))}</button>
        <p class="small muted">${esc(L('Status: not connected · configuration only. No requests are sent.', 'Статус: не подключено · только конфигурация. Запросы не отправляются.'))}</p></section>
    </div>
    <p class="small"><b>${esc(L('Current source:', 'Текущий источник:'))}</b> ${sourceSummary(src)} ${src ? `<button type="button" class="linkish" id="sys-clear-src">${esc(L('Remove source', 'Убрать источник'))}</button>` : ''}</p>`;
}

function step4(s) {
  return `${preview(s)}${readinessBlock(s, { wizard: true })}${wz.saveError ? `<div class="error" role="alert">${esc(tr(T.storeErr[wz.saveError] ?? T.storeErr.unavailable))}</div>` : ''}`;
}

export function renderSystemsWizard(route, { cases }) {
  const key = route.id === 'new' ? 'new' : `edit:${route.id}`;
  if (wz.key !== key) {
    const existing = route.id !== 'new' ? systemsStore.get(route.id) : null;
    if (route.id !== 'new' && !existing) return `<h1>${esc(L('System not found', 'Система не найдена'))}</h1><p><a class="button primary" href="#/systems">${esc(L('My systems', 'Мои системы'))}</a></p>`;
    Object.assign(wz, { key, draft: existing ? structuredClone(existing) : newSystem(), step: 1, errors: {}, csv: null, saveError: null });
  }
  const s = wz.draft;
  const body = [step1, step2, (x) => step3(x, cases), step4][wz.step - 1](s);
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/systems">${esc(L('My systems', 'Мои системы'))}</a> <span aria-hidden="true">›</span> <b>${esc(route.id === 'new' ? L('Add system', 'Добавить систему') : `${s.id} · ${L('Edit', 'Изменить')}`)}</b></nav>
    <h1>${esc(route.id === 'new' ? L('Add system', 'Добавить систему') : L('Edit system', 'Изменить систему'))} <span class="state s-gray">${esc(L('Saved only in this browser', 'Сохраняется только в этом браузере'))}</span></h1>
    <ol class="stepper" aria-label="${esc(L('Steps', 'Шаги'))}">${STEPS.map((st, i) => `<li class="${i + 1 === wz.step ? 'on' : i + 1 < wz.step ? 'done' : ''}"${i + 1 === wz.step ? ' aria-current="step"' : ''}><span class="n">${i + 1}</span> ${esc(tr(st))}</li>`).join('')}</ol>
    <section class="panel sys-step" aria-labelledby="sys-step-h"><h2 id="sys-step-h" tabindex="-1">${wz.step}. ${esc(tr(STEPS[wz.step - 1]))}</h2>${body}</section>
    <div class="sys-nav">${wz.step > 1 ? `<button type="button" id="sys-back">← ${esc(L('Back', 'Назад'))}</button>` : `<a class="button" href="#/systems">${esc(L('Cancel', 'Отмена'))}</a>`}
      ${wz.step < 4 ? `<button type="button" class="primary" id="sys-next">${esc(L('Next', 'Далее'))} →</button>` : `<button type="button" class="primary" id="sys-save">${esc(L('Save system', 'Сохранить систему'))}</button>`}</div>`;
}

const setPath = (obj, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = v; };

export function bindSystemsWizard(main, { rerender, cases, challengeAsset }) {
  const s = wz.draft; if (!s) return;
  main.querySelectorAll('[data-sys]').forEach((el) => el.addEventListener(el.type === 'radio' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    setPath(s, el.dataset.sys, el.value);
    if (el.tagName === 'SELECT' || el.type === 'radio') rerender();
  }));
  const on = (id, fn) => main.querySelector(`#${id}`)?.addEventListener('click', fn);
  on('sys-back', () => { wz.step -= 1; wz.errors = {}; rerender(); main.querySelector('#sys-step-h')?.focus(); });
  on('sys-next', () => {
    wz.errors = validateStep(s, wz.step);
    if (Object.keys(wz.errors).length) { rerender(); main.querySelector('[aria-invalid="true"]')?.focus(); return; }
    wz.step += 1; rerender(); main.querySelector('#sys-step-h')?.focus();
  });
  on('sys-example', () => { if (challengeAsset) { wz.draft = applyChallengeExample(s, challengeAsset); rerender(); } });
  main.querySelectorAll('[data-sys-set]').forEach((b) => b.addEventListener('click', () => {
    for (const c of SENSOR_SETS[b.dataset.sysSet]) if (s.channels[c].status === 'absent') s.channels[c].status = 'proposed';
    rerender();
  }));
  on('sys-load-challenge', () => {
    const raw = cases?.find((c) => c.caseId === 'pump04-train')?.rawMinute;
    if (raw) { s.source = challengeSource(raw); wz.csv = null; rerender(); }
  });
  on('sys-use-network', () => { s.source = networkSource(s.device); rerender(); });
  on('sys-map-data', () => { wz.draft = mapDataChannels(s); rerender(); });
  on('sys-clear-src', () => { s.source = null; wz.csv = null; rerender(); });
  main.querySelector('#sys-csv')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > LIMITS.maxBytes) { wz.csv = { ok: false, errors: [{ code: 'tooLarge', limit: LIMITS.maxBytes }] }; rerender(); return; }
    const parsed = parseCsv(await f.text(), { bytes: f.size });
    wz.csv = parsed;
    if (parsed.ok) s.source = compactSource('csv', parsed, { fileName: f.name });
    rerender();
  });
  on('sys-save', () => {
    const errs = Object.assign({}, validateStep(s, 1), validateStep(s, 2), validateStep(s, 3));
    if (Object.keys(errs).length) { wz.errors = errs; wz.step = validateStep(s, 1) && Object.keys(validateStep(s, 1)).length ? 1 : Object.keys(validateStep(s, 2)).length ? 2 : 3; rerender(); return; }
    const r = systemsStore.save(s);
    if (!r.ok) { wz.saveError = r.error; rerender(); return; }
    wz.key = null; location.hash = `#/systems/${r.system.id}`;
  });
}

// ---- list and detail ----
export function renderSystemsList() {
  const r = systemsStore.list();
  const err = r.ok ? '' : `<div class="error" role="alert">${esc(tr(T.storeErr[r.error] ?? T.storeErr.unavailable))}</div>`;
  const items = r.systems.map((s) => {
    const rd = readiness(s);
    return `<li class="sys-item"><div><a href="#/systems/${s.id}"><b>${esc(s.name)}</b></a> <span class="small muted mono">${s.id}</span><div class="small muted">${esc(s.site.name)} · ${esc(tr(T.kind[s.site.kind]))} · ${esc(tr(T.question[s.question]))}</div></div>
      <div class="small">${sourceSummary(s.source)}</div><div class="small">${QUESTIONS.map((q) => `${esc(tr(T.cap[q]))}: <b>${esc(tr(T.capStatus[rd.capabilities[q].status]))}</b>`).join(' · ')}</div></li>`;
  }).join('');
  return `<div class="page-head"><h1>${esc(L('My systems', 'Мои системы'))}</h1><span class="state s-gray">${esc(L('Saved only in this browser · not connected to equipment', 'Хранится только в этом браузере · без связи с оборудованием'))}</span></div>
    <p><a class="button primary" id="sys-add" href="#/systems/new">+ ${esc(L('Add system', 'Добавить систему'))}</a></p>${err}
    ${r.systems.length ? `<ul class="sys-list">${items}</ul>` : r.ok ? `<div class="empty"><p>${esc(L('No systems yet. Add your own pump system, or start from the challenge example.', 'Систем пока нет. Добавьте свою насосную систему или начните с примера задания.'))}</p>
      <p><a class="button primary" href="#/systems/new">+ ${esc(L('Add system', 'Добавить систему'))}</a> <button type="button" id="sys-start-example">${esc(L('Use challenge example', 'Использовать пример задания'))}</button></p></div>` : ''}`;
}
export function bindSystemsList(main, { challengeAsset }) {
  main.querySelector('#sys-start-example')?.addEventListener('click', () => {
    Object.assign(wz, { key: 'new', draft: challengeAsset ? applyChallengeExample(newSystem(), challengeAsset) : newSystem(), step: 1, errors: {}, csv: null, saveError: null });
    location.hash = '#/systems/new';
  });
}

export function renderSystemDetail(route) {
  const s = systemsStore.get(route.id);
  if (!s) return `<h1>${esc(L('System not found', 'Система не найдена'))}</h1><p><a class="button primary" href="#/systems">${esc(L('My systems', 'Мои системы'))}</a></p>`;
  const e = s.equipment; const v = (x, u) => (x ? `${esc(x)} ${u}` : `<span class="muted">${esc(L('unknown', 'неизвестно'))}</span>`);
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/systems">${esc(L('My systems', 'Мои системы'))}</a> <span aria-hidden="true">›</span> <b>${esc(s.id)}</b></nav>
    <div class="ws-head"><div><h1>${esc(s.name)}</h1><p class="sub">${esc(s.site.name)} · ${esc(tr(T.kind[s.site.kind]))} · ${esc(tr(T.question[s.question]))}</p></div>
      <div><a class="button primary" id="sys-edit" href="#/systems/${s.id}/edit">${esc(L('Edit', 'Изменить'))}</a></div></div>
    <p>${sourceSummary(s.source)}</p>
    <div class="review-grid"><div class="evid">${preview(s)}${readinessBlock(s)}</div>
      <aside class="sch-side">${schematic(s)}<section class="panel-sub small"><h4>${esc(L('Passport', 'Паспорт'))}</h4>
        ${e.provenance === 'challenge-example' ? `<p><span class="state s-attn">${esc(L(`From challenge example ${e.sourceAsset}`, `Из примера задания ${e.sourceAsset}`))}</span></p>` : ''}
        <dl class="kv small"><dt>${esc(L('Pump', 'Насос'))}</dt><dd>${esc(e.pump.name)}</dd><dt>${esc(L('Design point', 'Расчётная точка'))}</dt><dd>${v(e.pump.designFlow, 'm³/h')} · ${v(e.pump.designHead, 'm')}</dd>
          <dt>${esc(L('Rated speed', 'Номинальная частота'))}</dt><dd>${v(e.pump.ratedRpm, 'rpm')}</dd><dt>${esc(L('Motor', 'Двигатель'))}</dt><dd>${esc(e.motor.name)} · ${v(e.motor.ratedKw, 'kW')}</dd>
          <dt>${esc(L('Valve', 'Клапан'))}</dt><dd>${esc(e.valve.name)} · ${esc(e.valve.placement === 'after-pump' ? L('after the pump (assumption)', 'после насоса (допущение)') : L('placement unknown', 'место неизвестно'))}</dd>
          <dt>${esc(L('Device', 'Устройство'))}</dt><dd>${esc(s.device.label || '—')} · ${esc(tr(T.iface[s.device.interface]))}</dd></dl></section></aside></div>`;
}

// Shell captions for the systems routes: local user configuration and the source actually loaded (never "benchmark").
export function systemsShell(route) {
  const sys = route.name === 'systemDetail' ? systemsStore.get(route.id) : route.name === 'systemsEdit' ? wz.draft : null;
  const src = sys?.source ?? null;
  const srcLabel = !src ? L('No data loaded', 'Данные не загружены')
    : src.kind === 'csv' ? L('Local CSV record', 'Локальная CSV-запись')
      : src.kind === 'challenge' ? L('Historical challenge sample', 'Исторический образец задания')
        : L('Not connected · configuration only', 'Не подключено · только конфигурация');
  return {
    foot: L('Local user configuration stored in this browser; no equipment connection; advisory only.', 'Локальная конфигурация пользователя в этом браузере; без связи с оборудованием; только рекомендации.'),
    badge1: L('Local configuration', 'Локальная конфигурация'),
    badge2: route.name === 'systems' ? L('Saved in this browser', 'Хранится в этом браузере') : srcLabel,
    provenance: src?.kind === 'challenge' ? L(`Sample from ${src.origin}`, `Образец из ${src.origin}`) : '',
  };
}
