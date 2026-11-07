// English / Russian interface strings (Task017). Local dictionary only, no network translation.
// t(key, vars) returns the string for the current language, falling back to English. Values and units are
// never translated; dates stay in explicit UTC. Raw identifiers and verbatim source outputs stay original.

const KEY = 'rd-lang';
let lang = 'en';
try { const v = globalThis.localStorage?.getItem(KEY); if (v === 'ru' || v === 'en') lang = v; } catch { /* storage unavailable */ }

export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'ru' ? 'ru' : 'en';
  try { globalThis.localStorage?.setItem(KEY, lang); } catch { /* storage unavailable */ }
  if (globalThis.document) document.documentElement.lang = lang;
  return lang;
}

export const CHANNEL_RU = {
  suction_pressure_kpa: 'Давление на всасывании', discharge_pressure_kpa: 'Давление нагнетания', flow_m3_h: 'Расход',
  fluid_temp_c: 'Температура жидкости', ambient_temp_c: 'Температура окружающей среды', motor_current_a: 'Ток двигателя',
  motor_power_kw: 'Мощность двигателя', motor_speed_rpm: 'Частота вращения', motor_winding_temp_c: 'Температура обмотки',
  bearing_temp_c: 'Температура подшипника', vibration_rms_mm_s: 'Виброскорость (СКЗ)',
  vibration_accel_rms_g: 'Виброускорение (СКЗ)', vibration_crest_factor: 'Пик-фактор вибрации', valve_position_pct: 'Положение клапана',
};

const D = {
  en: {
    'nav.fleet': 'Start · Fleet', 'nav.review': 'Review a Warning', 'nav.pump': 'Pump Detail', 'nav.planner': 'Retrofit Planner', 'nav.evidence': 'Evidence & Validation',
    'brand.sub': 'Pump diagnostics review', 'lang.label': 'Language', 'badge.synthetic': 'Synthetic benchmark', 'badge.replay': 'Replay / metadata only', 'badge.advisory': 'Advisory, read-only',
    'skip': 'Skip to content',
    'foot': 'Synthetic data from the RETROFIT AI 2026 benchmark. No connection to equipment; this interface cannot send commands.',
    'fleet.h1': 'Understand a pump warning and choose the next check',
    'fleet.sub': 'Recorded examples from 12 independent benchmark pumps.',
    'fleet.badge': 'Synthetic examples · advisory',
    'fleet.step1': 'Choose an example', 'fleet.step1s': 'A recorded pump warning',
    'fleet.step2': 'Understand the evidence', 'fleet.step2s': 'Charts and the sensor map',
    'fleet.step3': 'Choose a check or measurement', 'fleet.step3s': 'What to verify, what to add',
    'fleet.start': 'Start: PUMP-04 pressure and flow warning', 'fleet.startNote': 'Recommended first example',
    'fleet.more': 'Other examples', 'fleet.ex.p08': 'PUMP-08 · vibration', 'fleet.ex.p02': 'PUMP-02 · vibration',
    'fleet.ex.p01': 'PUMP-01 · no flow meter', 'fleet.ex.replay': 'PUMP-08 · minute-by-minute replay',
    'fleet.all': 'All 12 pumps', 'fleet.search': 'Search', 'fleet.searchPh': 'Pump, site, application', 'fleet.show': 'Show', 'fleet.site': 'Site',
    'fleet.allSites': 'All sites', 'fleet.reset': 'Reset filters', 'fleet.none': 'No pumps match these filters.',
    'fleet.indep': 'Each pump is independent; sites are organisational only. “Sensor inventory only” means no recording is bundled, not that the pump is healthy.',
    'fleet.col.pump': 'Pump', 'fleet.col.app': 'Application', 'fleet.col.meas': 'Measurements', 'fleet.col.open': 'What you can open', 'fleet.col.action': 'Action',
    'fleet.showAll': 'All pumps', 'av.review': 'Recorded review available', 'av.replay': 'Baseline replay available', 'av.inventory': 'Sensor inventory only',
    'act.review': 'Review the warning', 'act.replay': 'Open minute-by-minute replay', 'act.inventory': 'View installed sensors',
    'fleet.channels': '{n} measured channels', 'cov.has': 'Has', 'cov.none': 'No listed process measurements',
    'cov.pressures': 'pressures', 'cov.flow': 'flow', 'cov.speed': 'speed', 'cov.vibration': 'vibration', 'cov.temperatures': 'temperatures',
    'cov.noflow': 'no flow meter', 'cov.nospeed': 'no measured speed', 'cov.no': 'no {x}',
    'fleet.details': 'Data details: benchmark split, instrumentation tier and control',
    'fleet.splitText': '{n} pumps: {tr} training (used to develop methods), {va} validation (already inspected), {te} blind test (passport metadata only; no telemetry, alerts or labels in this application).',
    'fleet.split': 'Benchmark split', 'fleet.col.split': 'Split', 'fleet.col.tier': 'Instrumentation tier', 'fleet.col.control': 'Control', 'fleet.col.ch': 'Channels', 'fleet.col.window': 'Observation window (UTC)',
    'fleet.links': 'Earlier validation results and experiments', 'fleet.linksAll': 'All recorded warning reviews',
    'split.all': 'All', 'split.train': 'Train', 'split.validation': 'Validation', 'split.test': 'Blind test',
    'rv.h1': 'Review a pump warning', 'rv.sub': 'What needs checking, why, and how certain it is.', 'rv.badge': 'Recorded synthetic example · advisory',
    'rv.loading': 'Loading recorded examples…', 'rv.error': 'Recorded examples unavailable', 'rv.retry': 'Retry',
    'rv.examples': 'Example warning', 'rv.ex.pump04-train': 'pressure + flow', 'rv.ex.pump02-train': 'vibration', 'rv.ex.pump08-validation': 'vibration', 'rv.ex.pump01-train': 'pressure, no flow meter',
    'rv.time': 'Observation time', 'rv.before': 'Before the warning', 'rv.at': 'At the warning', 'rv.after': 'After the warning',
    'rv.replay': 'Replay:', 'rv.btnBefore': 'Before warning', 'rv.btnAt': 'At warning', 'rv.step': 'Step:',
    'rv.back1': 'Back one minute', 'rv.fwd1': 'Forward one minute', 'rv.fwd60': 'Forward one hour', 'rv.fwd1d': 'Forward one day',
    'rv.where': '{id} · warning at {t}', 'rv.notYet': 'This warning is not available yet', 'rv.rejected': 'Stored evidence rejected',
    'rv.seeNext': 'See the next check', 'rv.seeEvidence': 'See evidence', 'rv.checkSensors': 'Check installed sensors', 'rv.assess': 'Assess missing measurement',
    'rv.next': 'Next check', 'rv.advisoryPill': 'advisory', 'rv.whyLimits': 'Why and limits', 'rv.explDetails': 'Explanation details', 'rv.why': 'Why this check:', 'rv.certain': 'How certain:', 'rv.advisory': 'Advisory engineering check; this application cannot operate equipment.',
    'rv.evidence': 'What the recording shows', 'rv.whyNeeds': 'In short', 'rv.alts': 'Other possible explanations (not ranked):',
    'rv.measuredVals': 'Measured values in this minute', 'rv.changed': 'What changed from the earlier method?',
    'rv.earlier': 'Earlier method', 'rv.selected': 'selected method', 'rv.unchanged': '(unchanged)',
    'rv.tech': 'Technical details: exact values, rule terms, equation and raw outputs', 'rv.techNote': '',
    'rv.json': 'Full stored rule output (JSON)',
    'rv.truthH': 'What actually happened (simulated answer)', 'rv.truthToggle': 'Show simulated label for this case',
    'rv.truthNote': 'Opt-in benchmark label for checking the example afterwards. Shown only from this warning’s time onward and once its onset has passed; never used for the explanation or the next check above.',
    'rv.truthPill': 'Simulated answer', 'rv.truthBefore': 'Not revealed before this case’s alert time.', 'rv.truthNone': 'No labelled onset at or before the replay time.',
    'rv.onset': 'onset', 'rv.endHidden': 'end not revealed at this time', 'rv.end': 'end',
    'rv.resultsH': 'Results across all recorded events', 'rv.about': 'About these results', 'rv.aboutSub': 'scope, development history and data sources',
    'rv.ageNow': 'Recording age now', 'rv.ageNowNote': 'at the observation time shown above',
    'tag.measured': 'Measured', 'tag.calculated': 'Calculated', 'tag.time': 'Time',
    'vis.schem': 'Measurements on this pump', 'vis.schemNote': 'Main measurement points. Positions are schematic; the sensor list comes from the pump passport.',
    'vis.installed': 'Installed', 'vis.focus': 'Points to check', 'vis.missing': 'Not installed', 'vis.proposed': 'Possible addition',
    'vis.suction': 'Suction', 'vis.discharge': 'Discharge', 'vis.pump': 'Pump', 'vis.motor': 'Motor',
    'vis.spreadH': 'Fluctuation of the pressure-rise difference (measured − calculated), kPa', 'vis.thisMinute': 'Warning minute', 'vis.typical': 'Typical reference minute',
    'vis.spreadNote': 'A comparison with this pump’s first recorded day, not a healthy limit.',
    'vis.riseH': 'Pressure rise during the warning minute (kPa)', 'vis.measuredRise': 'Measured: discharge − suction', 'vis.curveRise': 'Calculated from the pump curve at the measured flow and speed',
    'vis.riseNote': 'The solid line is measured by the two pressure sensors; the dashed line is predicted from the measured flow and speed. A jumpy dashed line points at the flow input. Neither line is a healthy band.',
    'vis.flowH': 'Recorded flow in the same minute (m³/h)',
    'vis.timelineH': 'When the vibration recording was made', 'vis.recDone': 'Recording finished', 'vis.warning': 'Warning', 'vis.now': 'Now',
    'vis.barsH.mis': 'Once-per-revolution vibration, relative to the initial reference recordings', 'vis.barsH.bear': 'Bearing outer-race tone relative to its local background',
    'vis.ref': 'Initial reference recordings', 'vis.snap': 'Earlier recording', 'vis.barsNote.mis': 'Amplitude ratio to the reference median (reference = 1). Not a probability.',
    'vis.barsNote.bear': 'Tone-to-background ratio; the recording’s ratio is about {g}× the reference ratio. Not an absolute amplitude and not a probability.',
    'vis.gapH': 'Missing input for this check',
    'vis.chipCheck': 'check', 'vis.chipMissing': 'not installed', 'vis.chipProposed': 'possible addition', 'vis.codes': 'What the codes mean',
    'vis.flowRange': 'Recorded range {lo}–{hi} m³/h, {a}–{b} UTC (not a limit).',
    'vis.harmonic': 'The twice-per-revolution component is about {r}× the once-per-revolution one (rule split 0.5); this, together with the 1× rise, is what points to misalignment rather than imbalance.', 'vis.gapNote': 'Adding flow would supply the missing input; it does not guarantee a diagnosis.',
    'pd.back': '← Back to Fleet', 'pd.tabDetail': 'Pump Detail', 'pd.tabPlanner': 'Retrofit Planner',
    'pl.orient': '<b>What this page is for:</b> decide whether reusing an existing measurement or adding one would help diagnose {id}. Read the summary first; cost and source inputs are at the bottom. Nothing here buys hardware or changes the pump.',
    'ev.scope': '<b>Scope of this page.</b> These are the historical rounds up to Task008, in which causal B1 was retained and every experiment below was rejected. Later sealed rounds (Task013 train, Task014 descriptive validation) selected the Z995 research method: <a href="#/diagnosis">see the warning review</a>. The operator replay still uses causal B1.',
    'ev.h1': 'Evidence & Validation', 'ev.sub': 'Stored results of the recorded baseline runs.',
  },
  ru: {
    'nav.fleet': 'Начало', 'nav.review': 'Разбор предупреждения', 'nav.pump': 'Насос и датчики', 'nav.planner': 'План дооснащения', 'nav.evidence': 'Результаты проверки',
    'brand.sub': 'Разбор диагностики насосов', 'lang.label': 'Язык', 'badge.synthetic': 'Синтетический бенчмарк', 'badge.replay': 'Только записи и паспорта', 'badge.advisory': 'Рекомендации, только чтение',
    'skip': 'Перейти к содержимому',
    'foot': 'Синтетические данные бенчмарка RETROFIT AI 2026. Нет связи с оборудованием; интерфейс не может отправлять команды.',
    'fleet.h1': 'Понять предупреждение насоса и выбрать следующую проверку',
    'fleet.sub': 'Записанные примеры по 12 независимым насосам бенчмарка.',
    'fleet.badge': 'Синтетические примеры · рекомендации',
    'fleet.step1': 'Выберите пример', 'fleet.step1s': 'Записанное предупреждение',
    'fleet.step2': 'Разберитесь в данных', 'fleet.step2s': 'Графики и схема датчиков',
    'fleet.step3': 'Выберите проверку или измерение', 'fleet.step3s': 'Что проверить, что добавить',
    'fleet.start': 'Начать: PUMP-04, давление и расход', 'fleet.startNote': 'Рекомендуемый первый пример',
    'fleet.more': 'Другие примеры', 'fleet.ex.p08': 'PUMP-08 · вибрация', 'fleet.ex.p02': 'PUMP-02 · вибрация',
    'fleet.ex.p01': 'PUMP-01 · нет расходомера', 'fleet.ex.replay': 'PUMP-08 · поминутное воспроизведение',
    'fleet.all': 'Все 12 насосов', 'fleet.search': 'Поиск', 'fleet.searchPh': 'Насос, площадка, назначение', 'fleet.show': 'Показать', 'fleet.site': 'Площадка',
    'fleet.allSites': 'Все площадки', 'fleet.reset': 'Сбросить фильтры', 'fleet.none': 'Нет насосов по этим фильтрам.',
    'fleet.indep': 'Каждый насос независим; площадки — только организационная группировка. «Только перечень датчиков» значит, что записи нет, а не что насос исправен.',
    'fleet.col.pump': 'Насос', 'fleet.col.app': 'Назначение', 'fleet.col.meas': 'Измерения', 'fleet.col.open': 'Что можно открыть', 'fleet.col.action': 'Действие',
    'fleet.showAll': 'Все насосы', 'av.review': 'Есть записанный разбор', 'av.replay': 'Есть базовое воспроизведение', 'av.inventory': 'Только перечень датчиков',
    'act.review': 'Разобрать предупреждение', 'act.replay': 'Открыть поминутное воспроизведение', 'act.inventory': 'Посмотреть датчики',
    'fleet.channels': 'измеряемых каналов: {n}', 'cov.has': 'Есть', 'cov.none': 'Нет перечисленных технологических измерений',
    'cov.pressures': 'давления', 'cov.flow': 'расход', 'cov.speed': 'частота вращения', 'cov.vibration': 'вибрация', 'cov.temperatures': 'температуры',
    'cov.noflow': 'нет расходомера', 'cov.nospeed': 'нет измерения частоты вращения', 'cov.no': 'нет: {x}',
    'fleet.details': 'Сведения о данных: разбиение бенчмарка, уровень оснащения и управление',
    'fleet.splitText': 'Насосов: {n}. Обучающих: {tr} (на них разрабатывались методы), валидационных: {va} (уже просмотрены), слепой тест: {te} (только паспортные данные; телеметрии, предупреждений и меток в приложении нет).',
    'fleet.split': 'Разбиение бенчмарка', 'fleet.col.split': 'Разбиение', 'fleet.col.tier': 'Уровень оснащения', 'fleet.col.control': 'Управление', 'fleet.col.ch': 'Каналы', 'fleet.col.window': 'Окно наблюдения (UTC)',
    'fleet.links': 'Ранние результаты проверки и эксперименты', 'fleet.linksAll': 'Все записанные разборы предупреждений',
    'split.all': 'Все', 'split.train': 'Обучение', 'split.validation': 'Валидация', 'split.test': 'Слепой тест',
    'rv.h1': 'Разбор предупреждения насоса', 'rv.sub': 'Что проверить, почему и насколько это определённо.', 'rv.badge': 'Записанный синтетический пример · рекомендация',
    'rv.loading': 'Загрузка записанных примеров…', 'rv.error': 'Записанные примеры недоступны', 'rv.retry': 'Повторить',
    'rv.examples': 'Пример предупреждения', 'rv.ex.pump04-train': 'давление + расход', 'rv.ex.pump02-train': 'вибрация', 'rv.ex.pump08-validation': 'вибрация', 'rv.ex.pump01-train': 'давление, нет расходомера',
    'rv.time': 'Время наблюдения', 'rv.before': 'До предупреждения', 'rv.at': 'В момент предупреждения', 'rv.after': 'После предупреждения',
    'rv.replay': 'Воспроизведение:', 'rv.btnBefore': 'До предупреждения', 'rv.btnAt': 'В момент предупреждения', 'rv.step': 'Шаг:',
    'rv.back1': 'Назад на минуту', 'rv.fwd1': 'Вперёд на минуту', 'rv.fwd60': 'Вперёд на час', 'rv.fwd1d': 'Вперёд на сутки',
    'rv.where': '{id} · предупреждение в {t}', 'rv.notYet': 'Это предупреждение ещё недоступно', 'rv.rejected': 'Сохранённые данные отклонены',
    'rv.seeNext': 'К следующей проверке', 'rv.seeEvidence': 'Смотреть данные', 'rv.checkSensors': 'Проверить установленные датчики', 'rv.assess': 'Оценить недостающее измерение',
    'rv.next': 'Следующая проверка', 'rv.advisoryPill': 'рекомендация', 'rv.whyLimits': 'Почему и ограничения', 'rv.explDetails': 'Подробнее о выводе', 'rv.why': 'Зачем эта проверка:', 'rv.certain': 'Насколько определённо:', 'rv.advisory': 'Рекомендация инженеру; приложение не управляет оборудованием.',
    'rv.evidence': 'Что показывает запись', 'rv.whyNeeds': 'Коротко', 'rv.alts': 'Другие возможные объяснения (без ранжирования):',
    'rv.measuredVals': 'Измеренные значения в эту минуту', 'rv.changed': 'Что изменилось по сравнению с прежним методом?',
    'rv.earlier': 'Прежний метод', 'rv.selected': 'выбранный метод', 'rv.unchanged': '(без изменений)',
    'rv.tech': 'Технические подробности (исходные формулировки на английском): точные значения, правило, уравнение, исходные выводы', 'rv.techNote': 'Ниже — исходные технические формулировки и выводы модели без перевода.',
    'rv.json': 'Полный сохранённый вывод правила (JSON)',
    'rv.truthH': 'Что произошло на самом деле (симулированный ответ)', 'rv.truthToggle': 'Показать симулированную метку для этого случая',
    'rv.truthNote': 'Метка бенчмарка по запросу, для проверки примера задним числом. Показывается только начиная с момента этого предупреждения и после начала события; никогда не используется для объяснения или проверки выше.',
    'rv.truthPill': 'Симулированный ответ', 'rv.truthBefore': 'Не раскрывается до момента предупреждения этого случая.', 'rv.truthNone': 'Нет размеченного начала события к этому времени.',
    'rv.onset': 'начало', 'rv.endHidden': 'конец пока не раскрыт', 'rv.end': 'конец',
    'rv.resultsH': 'Результаты по всем записанным событиям', 'rv.about': 'Об этих результатах', 'rv.aboutSub': 'область применения, история разработки и источники данных',
    'rv.ageNow': 'Возраст записи сейчас', 'rv.ageNowNote': 'на показанное время наблюдения',
    'tag.measured': 'Измерено', 'tag.calculated': 'Рассчитано', 'tag.time': 'Время',
    'vis.schem': 'Измерения на этом насосе', 'vis.schemNote': 'Основные точки измерения. Расположение условное; состав датчиков — из данных.',
    'vis.installed': 'Установлен', 'vis.focus': 'Что проверить', 'vis.missing': 'Не установлен', 'vis.proposed': 'Возможное дополнение',
    'vis.suction': 'Всасывание', 'vis.discharge': 'Нагнетание', 'vis.pump': 'Насос', 'vis.motor': 'Двигатель',
    'vis.spreadH': 'Колебание разности прироста давления (измерено − рассчитано), кПа', 'vis.thisMinute': 'Минута предупреждения', 'vis.typical': 'Типичная опорная минута',
    'vis.spreadNote': 'Сравнение с первым записанным днём этого насоса, а не граница исправности.',
    'vis.riseH': 'Прирост давления в минуту предупреждения (кПа)', 'vis.measuredRise': 'Измерено: нагнетание − всасывание', 'vis.curveRise': 'Рассчитано по характеристике насоса при измеренных расходе и частоте',
    'vis.riseNote': 'Сплошная линия — измерение двумя датчиками давления; пунктир — прогноз по измеренным расходу и частоте вращения. Скачущий пунктир указывает на вход расхода. Ни одна линия не является границей исправности.',
    'vis.flowH': 'Записанный расход в ту же минуту (м³/ч)',
    'vis.timelineH': 'Когда была сделана запись вибрации', 'vis.recDone': 'Запись завершена', 'vis.warning': 'Предупреждение', 'vis.now': 'Сейчас',
    'vis.barsH.mis': 'Вибрация с частотой вращения относительно начальных опорных записей', 'vis.barsH.bear': 'Тон наружного кольца подшипника относительно локального фона',
    'vis.ref': 'Начальные опорные записи', 'vis.snap': 'Более ранняя запись', 'vis.barsNote.mis': 'Отношение амплитуды к медиане опорных записей (опора = 1). Не вероятность.',
    'vis.barsNote.bear': 'Отношение тона к фону; у записи оно примерно в {g}× больше опорного. Это не абсолютная амплитуда и не вероятность.',
    'vis.gapH': 'Недостающий вход для этой проверки',
    'vis.chipCheck': 'проверить', 'vis.chipMissing': 'не установлен', 'vis.chipProposed': 'возможное дополнение', 'vis.codes': 'Что означают обозначения',
    'vis.flowRange': 'Записанный диапазон {lo}–{hi} м³/ч, {a}–{b} UTC (не граница).',
    'vis.harmonic': 'Составляющая двойной частоты примерно в {r}× больше составляющей частоты вращения (граница правила 0.5); именно это вместе с ростом 1× указывает на расцентровку, а не на дисбаланс.', 'vis.gapNote': 'Расходомер дал бы недостающий вход; диагноз это не гарантирует.',
    'pd.back': '← Назад к парку', 'pd.tabDetail': 'Насос и датчики', 'pd.tabPlanner': 'План дооснащения',
    'pl.orient': '<b>Для чего эта страница:</b> решить, поможет ли диагностике {id} повторное использование имеющегося измерения или новое измерение. Сначала прочитайте сводку; затраты и источники — внизу. Здесь ничего не покупается и насос не меняется.',
    'ev.scope': '<b>Область этой страницы.</b> Здесь исторические раунды до Task008, в которых сохранён причинный B1, а все эксперименты ниже отклонены. Позднее закрытые раунды (Task013 — обучение, Task014 — описательная валидация) выбрали исследовательский метод Z995: <a href="#/diagnosis">см. разбор предупреждения</a>. Поминутное воспроизведение по-прежнему использует причинный B1.',
    'ev.h1': 'Доказательства и проверка', 'ev.sub': 'Сохранённые результаты записанных базовых прогонов.',
  },
};

export function t(key, vars = {}) {
  const s = D[lang][key] ?? D.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
export const hasKey = (key, l) => Object.prototype.hasOwnProperty.call(D[l], key);
export const dictionaryKeys = (l) => Object.keys(D[l]);

// Durations in the current language (values unchanged).
export function durationHms(sec, l = lang) {
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.round(sec % 60);
  const p = (n) => String(n).padStart(2, '0');
  return l === 'ru' ? `${h} ч ${p(m)} мин ${p(s)} с` : `${h} h ${p(m)} min ${p(s)} s`;
}
export function durationShort(ms, l = lang) {
  const m = Math.floor(ms / 60000);
  if (l !== 'ru') return null;
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} ч ${m % 60} мин` : `${Math.floor(h / 24)} сут ${h % 24} ч`;
}
