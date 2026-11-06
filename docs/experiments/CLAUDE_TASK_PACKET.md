# Task packet actual Claude Code: causal B2 v1

Цель: поверх causal B1 исправить обработку sparse/gaps и проверить диагностику SENSOR_DRIFT / SENSOR_CALIBRATION_SHIFT / SENSOR_NOISE_SPIKES с правильным каналом. Не обещать прирост: отрицательный результат с корректным протоколом завершает задание.

Контекст: первый выпуск 7 ноября 2026, 12:00 Europe/Berlin. Не пытаться вместить E3/E4/E5 в B2 ценой непроверенной реализации. Роль автора документов — исследователь/проверяющий; actual Claude уже реализует проект (Task001 UI). Ниже следующий диагностический пакет для того же автора кода, через главный чат. Автор этого пакета код B2 не реализовывал и не проверял результаты ещё не выполненного здесь B2.

## Вход и ограничения

Прочитать `README.md`, `B1_FINDINGS.md`, `CAUSAL_B1_FINDINGS.md`, `src/retrofit_doctor/causal_b1.py`, `tests/test_causal_b1.py` и все документы этой папки. Контрольные значения — [AUDIT.md](AUDIT.md). Causal B1 k=6/persist=15/reference=24h — обязательный контроль; исходный offline score 78.0125 не цель оптимизации.

Владельцу реализации: использовать свой разрешённый scope проекта для новых `src`, `scripts`, `tests`, отдельного `results/causal_b2_v1/`. Этот документ не расширяет права текущего исследователя, который писал только `docs/experiments/`. Vendor read-only. Не менять исторические B1/causal_b1 результаты и код контроля. Не создавать новые чаты; не обращаться к test для разработки. Git не использовался исследователем; actual Claude следует действующему рабочему соглашению главного чата. Любые сомнения в схеме разрешать по train и публичной документации. Train-only tuning — правило эксперимента/AGENTS, не цитата пользователя. Финальный one-shot test export — отдельный координированный release gate главного чата после seal, в рамках уже разрешённого проекта, без нового обязательного запроса пользователю.

Соблюдать timebox из AGENTS: 20/45/90 минут по размеру среза. Разбить этот пакет на quality+fixtures, diagnosis+train selection, затем sealed evaluation; на границе timebox сохранить состояние и передать статус главному чату. Не оставлять UI Task001 без владельца и не начинать параллельную запись кода вторым агентом.

## Deliverables

- `src/retrofit_doctor/causal_b2.py`: качество/состояние каналов, deterministic diagnosis, совместимые predictions + отдельная structured evidence таблица.
- `scripts/run_causal_b2.py`: отдельные режимы train-selection и sealed-validation. Train режим не читает validation labels/telemetry. Validation режим требует selection/config hashes.
- `tests/test_causal_b2.py`: новые контракты ниже; существующие B1 tests сохранить.
- `results/causal_b2_v1/`: configs, selection, exposure manifest, per-fold/per-candidate train outputs, final predictions/report, evidence, causal audit, test log, hashes. Не смешивать probe metrics с official benchmark.
- `CAUSAL_B2_FINDINGS.md`: что изменилось, как выбрано, baseline delta, все ошибки, что не выполнено; explicit validation exposure и synthetic limitation.

## Шаг 1. Quality layer C1

Использовать causal_features B1 без изменения frozen reference. Сохранить отдельную информацию `channel_present`, `new_observation`, `last_seen`, `age`, `expected_feature_cadence`, `quality_state`; channel count/std не заменять нулевыми измерениями.

Ожидаемая cadence: минутные feature observations dense каналов — 1min; wireless каналы native T1 — 5min по публичной схеме/specs. Не выводить cadence из будущей недели или по hardcoded asset_id. Если спецификация недоступна — explicit UNKNOWN_CADENCE, не угадывать по validation.

Состояния различать:

| Состояние | Правило v1 |
|---|---|
| NOT_INSTALLED | Канала нет в channels_available; отсутствие не fault |
| NO_NEW_SAMPLE | Прибор установлен, нового sample нет, age ≤ 2 ожидаемых feature intervals |
| STALE / CHANNEL_UNAVAILABLE | Age > 2 intervals при доступном gateway; причина ещё не доказана, не выдавать gateway loss |
| GATEWAY_GAP | Clock-complete rows <30 как B1; собственная 15min выдержка по wall-clock |
| FRESH | Наблюдение текущего закрытого окна с count>0; дополнительно finite mean и доступность измерения |
| INSUFFICIENT_REFERENCE | Нет опоры для требуемого residual; не кодировать как z=0 |

Не считать quality_any локальным указателем неисправного прибора. Границы `2 intervals` — фиксированная инженерная эвристика v1, проверяемая на fixtures; это не научно выведенный оптимум.

Persistence хранить раздельно по источнику evidence (канал/quality event), чтобы 10 минут одной причины + 5 другой не стали 15 минутами подтверждения одной причины. Для амплитудной аномалии нужен |z|>6, минимум 3 независимых observations и интервал evidence не менее 15 минут. Интервал считать от начала первого завершённого feature window до конца текущего; для dense это сохраняет обычные 15 окон. Нормальное новое измерение сбрасывает цепочку; штатное NO_NEW_SAMPLE не подтверждает и не сбрасывает её; STALE/gateway/смена режима обрывает цепочку.

Для stuck: сравнивать **новые** последовательные значения; минимум 3 независимых updates, evidence span ≥15min. Dense дополнительно требует внутриминутной constancy (`std=0` с достаточным count, как B1), чтобы одинаковые округлённые mean не стали stuck. Sparse сравнивает фактические samples, не forward-filled значения. Если resolution неизвестна, использовать точное равенство и раскрыть ограничение; не выбирать epsilon по val. STALE и stopped pump не доказательство stuck.

C1 diagnosis: детерминированная адаптация текущих B1 правил; каналовые quality flags передавать явно. Ранжировать кандидатов по убыванию силы evidence, при равенстве по имени канала/типа. Не зависеть от set iteration. Существующие machine rules использовать только при наличии требуемых свежих операндов, иначе UNKNOWN. Значение NaN не превращать в физический нуль. Channel-only unavailable выдавать как статус качества; если нужна alert без доказанного типа — SENSOR/UNKNOWN, не COMMUNICATION_LOSS gateway.

Сохранить 12h refractory и строгую границу `>12h` контроля, а также 720min cadence повторной попытки для продолжающегося эпизода. Явно покрыть границу тестом. Поведение начальных тревог от новой per-channel persistence — часть изменения C1; не утверждать идентичность C0. В одном решении отдавать одну первичную гипотезу, остальные сохранить как альтернативы evidence, не как burst из многих guesses. Gateway > confirmed stuck > amplitude/statistical hypotheses — фиксированный приоритет.

## Шаг 2. Diagnosis C2…C5

Фиксированные окна и ratios из protocol_v1.json: W ∈ {30,120} min, ratio ∈ {.5,.8}. Остальные пороги фиксированы. Рассчитывать только по trailing history текущего режима после gap/reset; минимум 6 новых наблюдений и span ≥0.8W. Если history недостаточно — UNKNOWN, а не видимость доказанного drift/step.

На residual z выбранного канала сравнить три объяснения:

1. Константа: медиана; loss — median absolute residual.
2. Ramp: robust slope = median попарных slopes по timestamp, intercept = median(z-slope*t); loss в той же шкале.
3. Step: перебор split points с минимум 3 observations с каждой стороны, медианы двух сторон; лучший loss, tie — самый ранний split. Все точки ≤ current observation time.

Конкретный temporal type принимать только когда winning loss строго меньше `ratio × loss` каждой конкурирующей формы (константа и другая temporal форма). При нулевых/tied losses — UNKNOWN; не делить на нуль. Для drift требовать fitted endpoint difference >6 по модулю; для step — разницу уровней >6 и текущий |z|>6. Это проверяемая простая гипотеза, не универсальный механизм диагностики.

SENSOR-подтверждение для drift/step/noise: минимум два **имеющихся свежих** COUPLED канала с |z|<2 на момент решения; нет значимого согласованного отклонения в остальных доступных coupled каналах. Отсутствующий/устаревший coupled канал не является здоровым. При нехватке подтверждения оставить UNKNOWN или поддержанную machine гипотезу, а не назвать sensor автоматически. Совместные неисправности остаются ограничением.

Noise ветка: для dense канала с валидной оценкой std, `zs>12` может запустить noise evidence **без** требования большого mean-z. Применять ту же 15min независимую выдержку и coupled check. На sparse singleton minute std не вычислять фиктивно; noise classification v1 недоступна без достаточных измерений. Не повышать detection, создавая повторные фиктивные samples.

Machine rules остаются базовыми, с validity checks. Не добавлять подшипниковый спектральный классификатор, физический prior, новую режимную модель или новый reference estimator в этом пакете. Их эффект проверяется отдельно.

UNKNOWN: сохраняет anomaly alert. Для неопределённого class — `class_status=UNCERTAIN`, две альтернативы в evidence; submission adapter обязан выбрать допустимое MACHINE/SENSOR. Фиксированный fallback MACHINE совпадает с legacy, но в UI/отчёте не выдаётся за подтверждённый class; evaluator отдельно считает такие случаи. Quality-only UNKNOWN имеет SENSOR class. Не создавать новую fault taxonomy.

## Шаг 3. Evidence contract

Для каждой тревоги сохранять минимум:

```text
asset_id, alert_time_utc, event_class, fault_type, confidence
suspected_channel (или null/GATEWAY), class_status
reference_status, reference_origin, reference_end_utc
evidence_window_start, latest_input_available_at
supporting_channels, conflicting_channels, missing_channels
observed_values, residuals, sample_counts, ages, expected_cadence
rule_id, candidate_id, alternatives, recommended_action
```

Confidence оставить эвристической силой evidence с disclosure; не называть probability. При слабом доказательстве рекомендация — проверка/сопоставление приборов, а не замена конкретного узла как установленного факта. Evidence для masked/absent канала запрещена. Alarm timestamp не может предшествовать последнему использованному completed window. Не включать event_id/true label в runtime evidence.

## Шаг 4. Проверки до оценки

Обязательны:

- Все 18 B1 regression tests остаются pass; не «чинить» контроль ради B2.
- Повтор 209 frozen cutpoints для B2: все поля predictions, structured evidence, quality state и нормализованные признаки. Плюс точные границы появления sparse sample, stale deadline, gap/recovery, trajectory history и persistence.
- Future-value mutation и future-row deletion не меняют выданное прошлое; полный replay и независимые prefix runs совпадают.
- Chunked replay/restart проверять, **если** реализован persistent state. Если реализация batch-only — честно пометить incremental restart как не реализованный и не заявлять streaming service.
- Dense normal/stuck, sparse normal/anomaly/stuck, planned stopped, single channel gap, gateway gap без recovery, gap во время warmup, незнакомый/изменившийся regime; отсутствие фиктивных новых samples.
- Multi-channel competing hypotheses и равные scores: seeds 0,1,7,9 дают идентичные B2 fields. Сортировка входных строк не меняет результат; дубликаты observed windows отвергаются.
- Cause A 10min + cause B 5min не подтверждают A/B; noise-only fixture не требует mean shift; ramp/step ambiguity даёт UNKNOWN.
- Inference не получает labels: тест с заменёнными labels меняет только evaluation, не predictions. Загрузчик отвергает неразрешённый split до inference.

Сравнение чисел cut tests atol=1e-6, rtol=0; тексты/категории/времена exact. Округление при выводе не скрывает различия состояния.

## Шаг 5. Train, seal, validation, завершение

Исполнить ровно 6 конфигураций × 7 LOAO folds по FROZEN_PROTOCOL. Выбрать по train-only gates; сохранить все результаты. C1 — отдельная ablation, позволяющая отделить пользу quality layer от temporal diagnosis. Заморозить выбранный артефакт до validation.

Запустить один validation comparison. Сообщить все component deltas к causal B1: исходные 76.01253946 / 8 из 9 / 4 из 9, burden 1/14. Не менять B2 после результата. Показать тип+канал, UNKNOWN, adverse changes и exposure caveat. Отсутствие improvement — допустимый итог, не причина расширять сетку.

Definition of done: артефакты воспроизводимы; все correctness gates проходят; выбранный кандидат зафиксирован на train; validation ровно один оценочный проход; результаты и ограничения доступны; test не тронут. Если gates не пройдены — сдать failure report и воспроизводимый контрпример, не утверждать готовность B2.

В финале Claude вернуть: 3–5 предложений о результате, пути к коду/отчётам, таблицу C0/C1/selected, passed/failed gates, выполненные H1/H4/H5 и оставшиеся E3/E4/E5. Не обещать sensor benefits до mask/restore; не демонстрировать придуманные extra sensors PUMP-11.
