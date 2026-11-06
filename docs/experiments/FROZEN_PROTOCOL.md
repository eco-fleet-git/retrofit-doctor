# Замороженный train/validation протокол v1 и blind-test policy

Зафиксирован 6 ноября 2026 для следующего causal B2, до оценки его кандидатов в рамках этого пакета. Численные настройки ниже — исследовательские решения, не оценённые свойства данных. Реестр и бюджет запрещено менять по validation. B2 означает нашу следующую версию диагностики, **не** vendor `B2_cusum`. Actual Claude уже реализует проект (Task001 UI); этот пакет передаётся главному чату для следующего диагностического этапа, без второго автора кода.

## 1. Доступ к данным и роли

| Этап | Что разрешено | Что запрещено |
|---|---|---|
| Этот аудит | Код, train/validation отчёты, metadata train/validation, синтетические логические probes | Test telemetry/labels/predictions, изменение кода/vendor/results |
| Разработка Claude B2 | Train PUMP-01…07; metadata и causal prefixes этих активов; train labels только fitter/evaluator | Validation для fitting/search; ID/time/event-specific rules; чтение test; реконструкция скрытого сценария |
| Validation check | Один заранее зафиксированный B2 и causal B1 на PUMP-08/09 после sealing артефактов | Выбор «лучшего» кандидата по validation, изменение threshold/features после результата |
| Blind test | Координированный главным чатом one-shot export после seal и проверки готовности | Test telemetry/labels в текущем исследовательском задании и до release gate |

Train-only tuning — принятое правило эксперимента, закреплённое в корневом `AGENTS.md` («Tune parameters on train only»), а не дословный пользовательский запрет. Оно строже BENCHMARK_RULES, допускающих selection на validation. Исторический validation уже известен и повлиял на формулировку исследований. В каждом итоговом отчёте написать: «validation ранее исследован; текущий кандидат выбран только на train; это описательная проверка, не независимый blind test».

Загрузчик работает по allowlist: train IDs для train этапа, validation IDs только для оценки. Общие parquet читать с predicate pushdown и проверять фактически возвращённые IDs. Смешанный assets.csv допустим как публичная статическая таблица, но анализировать и передавать в runner только разрешённые строки. Запретить glob всего data, test dashboards, organizer test predictions, hidden/config reconstruction. Audit hashes — разрешённые файлы/код; для общего parquet допустим имеющийся manifest hash, без анализа исключённых строк.

## 2. Временной контракт

- Решение в t использует только окна с `window_start + 1min <= t`; t — явный observation clock, не последний пакет.
- Reference начинается от неизменного metadata start; первые 24h только collecting, z-диагностики в этот период нет. Позже опора фиксируется. Warmup-изменения в v1 запрещены.
- Frozen reference — empirical, не healthy. Нет достаточных данных → explicit insufficient evidence; не занимать будущие значения. Для B2 v1 недостаток опоры описывается честно; новый статистический estimator остаётся E4.
- Между измерениями хранить last_value/last_seen/age как состояние; это не новый sample. Не считать NULL нулём, нормой или подтверждением отсутствия неисправности.
- У trajectory признака хранить начало/конец использованных данных; при gap или смене режима не соединять независимые сегменты. Предсказывать только на текущем сегменте.
- В текущем benchmark replay считать минуту доступной сразу после закрытия. Это допущение нулевого дополнительного ingestion lag. Если введены arrival timestamps, использовать max(window_end, arrived_at); исправления не переписывают уже выданные тревоги.
- Waveforms не входят в B2 v1. В будущих опытах snapshot доступен только после завершения записи; запрещена интерполяция по будущим snapshots.

## 3. Train-only выбор, конечный бюджет

Train — семь полных временных окон. Не делать random split минут: соседние строки и события зависимы. Использовать 7-fold leave-one-asset-out (LOAO): в каждом fold шесть train активов для fitting, седьмой — только causal replay/evaluation. Любая learned статистика, масштаб или global prior строится заново на шести; локальная 24h commissioning reference held-out актива допустима, поскольку причинна и не использует labels.

Для моделей healthy train subset исключать размеченные fault windows только на шести fit-активах; это использование labels для обучения, не runtime gate. В B2 v1 learned prior не нужен. Evaluation labels held-out fold разрешены для train selection, но не для inference. Все folds прогона сохранять, включая неудачные.

**Всего 6 конфигураций**, перечисленных заранее:

| ID | Состав |
|---|---|
| C0 | Неизменённый causal B1, k=6, persist=15, reference=24h — контроль |
| C1 | Quality/cadence/gap B2 (E1) + детерминированная совместимая базовая диагностика |
| C2 | C1 + E2 trajectory diagnosis, history 30 min, fit-loss ratio 0.5 |
| C3 | C1 + E2 trajectory diagnosis, history 30 min, fit-loss ratio 0.8 |
| C4 | C1 + E2 trajectory diagnosis, history 120 min, fit-loss ratio 0.5 |
| C5 | C1 + E2 trajectory diagnosis, history 120 min, fit-loss ratio 0.8 |

Порог z=6, variance z>12, основная выдержка 15 min, reference=24h и suppression policy B1 фиксированы. Не добавлять сетку k/persist; не перенастраивать по каждому каналу/насосу. Подробная детерминированная логика — [CLAUDE_TASK_PACKET.md](CLAUDE_TASK_PACKET.md). Если trajectory logic неисполнима из разрешённой схемы, зафиксировать ограничение на train, исключить соответствующие C2…C5 и оценить C1 по тем же gates; если C1 не проходит — сохранить C0. Не компенсировать ограничение поиском на validation.

Для каждого кандидата объединить out-of-fold предсказания всех 7 активов и вызвать неизменённый scorer на train: denominator 26 исходно observable events, 49 asset-days. Дополнительно macro по активам и все 7 отдельных строк. Это результаты train selection, а не честная внешняя оценка выбранной конфигурации.

**Правило выбора: последовательные hard gates, затем tie-break.**

1. Zero causality/availability/determinism violations. Все regression/contract tests pass. Иначе кандидат исключается независимо от score.
2. Pooled train detection ≥ C0 (18/26), class correct ≥ C0 (14/26), type correct ≥ C0 (8/26); false+excess episodes ≤ C0 (6 за 49 дней). Эти границы выводятся из текущей контрольной версии и фиксированы до опыта.
3. Среди прошедших кандидатов максимизировать число sensor events с правильными **типом и каналом** первой засчитанной тревоги. Затем максимизировать общее число правильных типов; затем composite; затем предпочесть меньший ID. Каждый шаг сравнивает целочисленные counts/точные сохранённые значения, не округлённый экран.
4. Если ни один C1…C5 не проходит, итоговый кандидат C0, а B2 — исследовательский результат без заявленного улучшения. Не расширять бюджет после неудачи.

Отдельно указывать H1 supported только если diagnosis кандидат улучшил type+channel относительно C1 и выполнил условия H1. Победа над C0 при проигрыше C1 не доказывает пользу trajectory diagnosis.

Перед validation сохранить `selection.json`, все candidate configs, hashes кода/зависимостей/доступных входов, IDs/folds, параметры reference, выбранный ID, train предсказания/метрики, причины отклонения вариантов. Поле `sealed_at` — фактическое время, не задним числом. Текущий документ регистрирует протокол; он не утверждает, что исполняемый артефакт B2 уже sealed. Если параллельная работа успела оценить иной B2 до получения пакета, главный чат фиксирует фактическую хронологию и новый prospective experiment ID; задним числом pre-registration не заявляется.

## 4. Метрики и denominators

Официальный scorer не менять. Возвращать весь его JSON, включая component scores, false/repeat/excess и per_event; дополнительно:

| Метрика | Точная интерпретация |
|---|---|
| Detection / type / class recall | Соответствующие correct counts / все исходно observable events. Missed включены в denominator. |
| Sensor type+channel recall | Observable SENSOR events, у которых первая официально matched тревога имеет верный fault_type и `suspected_channel == sensor_tag`, / все observable SENSOR events. COMMUNICATION_LOSS использует GATEWAY. Отдельная строка без gateway, чтобы лёгкий gateway не скрыл проблему приборов. |
| Channel localization among hits | Correct channel / detected non-gateway SENSOR events; рядом numerator и denominator, не замена предыдущей метрики. |
| Wrong-channel claim | Неверные ненулевые channel claims / все ненулевые channel claims у первых matched non-gateway SENSOR detections. Abstentions, missed и неверный class показывать отдельно. |
| Selective diagnosis | Correct specific type / emitted specific first-event diagnoses; coverage = число таких диагнозов / все observable events. UNKNOWN и missed не исчезают из таблицы. False/unmatched specific alerts — отдельный count. |
| Evidence validity | Все cited channels реально доступны; значения и timestamps восстанавливаются из causal inputs; нет будущих/замаскированных/устаревших якобы свежих samples. Проверять 100% строк программно, представлять failed/checked. Это не доказательство физической причины. |
| Useful diagnosis delay | Первая во времени matching тревога с верным типом и, для SENSOR, каналом. Отдельный evaluator использует те же event windows и one-burst/one-event ограничения; не заменяет official first-alert metric. Публиковать matched/missed counts и per-event delays. |
| Burden | False episodes + excess repeats / исходные asset-days; дополнительно nuisance в benign windows и его exposure. |
| Reference/diagnosis coverage | Доля минут по collecting/insufficient/available, age/cadence и regime support; отдельно доля specific/UNKNOWN/class-uncertain. |

Дополнительный evaluator обязан сохранять mapping burst→event, а не соединять строки «по ближайшему времени». Воспроизвести предпочтения и ограничения official matching; сначала проверить равенство official per_event на C0. `sensor_tag`, `evidence_channels`, `detectable_utc`, benign labels и outcome используются только evaluator. C0 channel extraction — детерминированный разбор явного канала из evidence: одно название → канал; missing rows → GATEWAY; неоднозначный текст → null. Никаких ручных исправлений после просмотра truth.

Метрики представлять с counts и paired per-asset/event deltas. 9 val events и 2 актива не дают убедительных узких confidence intervals; не bootstrap-ить миллионы минут как независимые наблюдения. Небольшой gain — наблюдение на этом наборе, не доказательство устойчивого улучшения.

## 5. Единственный validation check

После seal один выбранный кандидат + C0. Сохранить все 9 событий, failure cases, UNKNOWN и пропуски. Не выбирать альтернативу из C1…C5 после просмотра val; train-selected версия остаётся зарегистрированным кандидатом даже при проигрыше validation. Если implementation обнаружит дефект, текущий эксперимент объявляется invalid, исправление и повтор имеют новый ID и раскрытый факт повторного просмотра; прежний результат не стирается и не называется single-shot.

Описательный non-regression ориентир: detection ≥8/9, type ≥4/9, class ≥8/9, false+excess ≤1 за 14 дней, composite относительно 76.01253946421124. Это отчётные сравнения, **не** разрешение подкручивать параметры или выбирать fallback по val. Нарушение — честно сообщаемый отрицательный результат. Утверждение об улучшении диагноза требует роста type+channel/снижения ошибочных конкретных причин, а не только composite.

E5 на validation разрешён только если mask manifest заморожен до первого просмотра его новых результатов; одна заранее выбранная модель, три фиксированные группы, без selection по этим результатам. E3/E4 требуют отдельной регистрации до запуска; их validation станет ещё одной описательной проверкой уже известного split, не новым независимым подтверждением.

## 6. Blind-test policy — release gate главного чата

1. Пользователь уже разрешил полный проект и финальную демонстрацию: стандартный one-shot export не требует дополнительного обязательного вопроса пользователю. Главный чат координирует release gate после seal и готовности. До этого gate не загружать PUMP-10/11/12 telemetry, feature rows, waveforms, alarms, test predictions или hidden labels; не делать профиль распределений, ручной диагноз или подбор instrumentation по этим данным. В текущем исследовательском задании test остаётся закрытым. Статические test metadata разрешены рабочим соглашением, но не заменяют эксперимент mask/restore на train/validation.
2. Условия release gate: seal код, модель, параметры, schema/availability policy, dependencies, train/val exposure log, seed, hashes и ожидаемый output format; correctness checks пройдены, output runner готов. Главный чат фиксирует это как этап уже разрешённой работы. Выбранный артефакт окончательный. Не подгонять его под test metadata anomalies.
3. Runner принимает разрешённые статические metadata и только причинный префикс test telemetry. Он не получает labels/будущие окна/итоговый здоровый reference. Автоматическая per-asset calibration допустима только заранее зафиксированным causal алгоритмом, без оператора и без новых решений.
4. Сформировать один CSV prediction и execution manifest; закрытые labels остаются у организатора/независимого evaluator. До фиксации predictions не смотреть test outcomes. Проверки schema, файла и causality могут выполняться автоматически; нельзя использовать их побочные диагностические outputs для retuning.
5. Инфраструктурный сбой допускает документированный повтор того же sealed артефакта с побитовым/семантическим равенством уже выданных predictions. Изменение алгоритма после доступа к test превращает этот split в использованный: для следующего честного blind claim нужен новый скрытый набор.
6. Если scoring недоступен, результат — «test predictions созданы, качество неизвестно». Нельзя выводить балл/экономию/полноту обнаружения из внешнего вида графиков. PUMP-11 не получает придуманные каналы даже ради демонстрации.

## 7. Завершение и контроль изменений

Один пакет causal B2 v1, одна train selection, одна validation evaluation. Бюджет 6 конфигураций, 7 train folds; smoke fixtures не являются дополнительными candidate models. После результата — отчёт с supported/falsified/inconclusive для проверенных H1/H4/H5 и not run для остальных. «Inconclusive» допустимо при недостатке событий, но не заменяет фиксацию конкретного отрицательного результата.

Не обещать абсолютную диагностику, real-world savings, calibrated probability или промышленную готовность. Advisory recommendations должны соответствовать evidence и требовать инженерной проверки; никаких управляющих команд оборудованию.
