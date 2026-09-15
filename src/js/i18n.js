// Localisation: English (en) and Ukrainian (uk). t(key, vars) for JS strings,
// applyStatic() for elements carrying data-i18n / data-i18n-title / data-i18n-ph attributes.
(function () {
  'use strict';
  const WA = (window.WA = window.WA || {});

  const EN = {
    // topbar / views
    brand_sub: 'MARITIME THRESHOLD WATCH', crumb_alarms: '/ ACTIVE ALARMS', crumb_settings: '/ SETTINGS',
    btn_snd: 'SND', btn_rfr: 'RFR', btn_set: 'SET', btn_alm: 'ALM', btn_hlp: 'HLP', btn_cancel: 'CANCEL', btn_save: 'SAVE & APPLY',
    crumb_guide: '/ USER GUIDE', tip_guide: 'User guide', guide_version: 'GUIDE FOR VERSION {v}',
    layout_title: 'WIDGET LAYOUT', layout_strip: 'Bottom strip (map-first)', layout_side: 'Right panel (classic, two columns)', layout_hint: 'Drag any widget to reorder; the order is kept in both layouts.',
    tip_mute: 'Mute / unmute audible alerts', tip_refresh: 'Refresh now', tip_settings: 'Settings', tip_alarms: 'Active alarms',
    quota_calls: 'QUOTA {n} CALLS/REFRESH', quota_sg: 'QUOTA {used}/{quota}', quota_nokey: 'NO API KEY',
    refresh_none: 'NOT YET REFRESHED', refresh_failed: 'REFRESH FAILED', refresh_at: 'REFRESH {t} · NEXT {n}',
    // home
    rail_title: 'TRACKING POINTS', add_point: '+ ADD POINT', hint_click: 'CLICK THE MAP TO ADD A TRACKING POINT', hint_max: 'MAXIMUM OF 10 TRACKING POINTS',
    st_ok: 'OK', st_warn: 'WARN', st_crit: 'CRIT',
    legend_normal: 'NORMAL', legend_warn: 'WITHIN LEAD', legend_crit: 'EXCEEDED',
    readout_proj: '{proj} · GRID {grid} · LOD {lod}', proj_mercator: 'MERCATOR', proj_albers: 'ALBERS',
    lod_c: 'CRUDE', lod_l: 'LOW', lod_i: 'INTER', lod_h: 'HIGH', lod_f: 'FULL', lod_ne: 'NE 50M',
    selected: 'SELECTED', selected_state_ok: 'SELECTED · NORMAL', selected_state_warn: 'SELECTED · WARNING', selected_state_crit: 'SELECTED · CRITICAL',
    centre: 'CENTRE', remove: 'REMOVE', no_selection: 'NO POINT SELECTED', no_data: 'NO DATA', loading: 'LOADING',
    // alarms
    alarms_title: 'ACTIVE ALARMS', ack_all: 'ACKNOWLEDGE ALL', ack: 'ACK', acked: 'ACKED', now: 'NOW',
    alarms_summary: 'ACTIVE · {c} CRITICAL · {w} WARNING · LEAD {lead} MIN', alarms_none: 'NO THRESHOLDS ARE CLOSE TO BEING REACHED.',
    col_level: 'LEVEL', col_point: 'POINT · METRIC', col_value: 'VALUE / LIMIT', col_eta: 'ETA',
    timeline: 'TIMELINE · NEXT {lead} MIN', lead_end: 'LEAD WINDOW END', exceeded: 'EXCEEDED',
    engine_note: 'Engine evaluates the cached 72 h forecast every 30 s. Warnings re-sound at 60 min if acknowledged. No API cost.',
    level_critical: 'CRITICAL', level_warning: 'WARNING', more_warnings: '+{n} WARNINGS', more_alarms: '+{n} MORE',
    rises_to: 'RISES TO', falls_to: 'FALLS TO', limit: 'LIMIT', acknowledged_at: 'ACKNOWLEDGED {t}',
    // settings
    settings_title: 'SETTINGS', tab_provider: 'PROVIDER', tab_map: 'MAP', tab_metrics: 'METRICS', tab_thresholds: 'THRESHOLDS', tab_alerts: 'ALERTS & UNITS',
    provider_label: 'DATA PROVIDER', refresh_label: 'REFRESH INTERVAL', apikey_label: 'STORMGLASS API KEY', sgsource_label: 'STORMGLASS SOURCE',
    apikey_ph: 'paste key from dashboard.stormglass.io', apikey_stored: '•••••••• key stored (paste to replace)',
    apikey_hint: 'Stored encrypted with the OS keychain. Never leaves this machine except in the Authorization header to api.stormglass.io.',
    refresh_15: 'Every 15 min', refresh_30: 'Every 30 min', refresh_60: 'Every hour', refresh_180: 'Every 3 h', refresh_360: 'Every 6 h', refresh_720: 'Every 12 h',
    prov_om: 'Open-Meteo (free, no key — ICON/GFS/ECMWF + MFWAM/EWAM waves)', prov_sg: 'Stormglass.io (API key required)',
    budget_sg: '<b>Request budget:</b> {n} point(s) × {per} refreshes/day = <b>{calls} requests/day</b>. Your quota: {quota}/day{plan}. {over}Alarms are re-evaluated every 30 s from the cached 72 h forecast, so a longer interval does not delay alerts.',
    budget_sg_plan: ' (free plan; paid plans 500 / 5 000 / 25 000)', budget_over: 'This exceeds the quota — increase the interval or upgrade. ',
    budget_om: '<b>Request budget:</b> Open-Meteo returns all points in one call (2 calls per refresh, {calls}/day). Free tier allows 10 000/day for non-commercial use; commercial use requires a paid API key (from $29/month).',
    map_window: 'MAP WINDOW', projection: 'PROJECTION', region_bs: 'Black Sea & Sea of Azov — GSHHG shoreline, 5 levels of detail', region_ea: 'Europe & Asia — Natural Earth 50 m overview',
    proj_opt_merc: 'Mercator (nautical chart)', proj_opt_albers: "Albers equal-area conic, SP 46°15'N / 41°15'N (as reference chart)",
    map_note: '<b>Black Sea shoreline:</b> GSHHG v2.3.7 (NOAA / University of Hawaii), WGS84. Detail switches automatically with zoom: intermediate → high → full (≈ 100 m). Lakes, rivers and national borders from WDBII. The lat/lon grid steps 10° → 5° → 2° → 1° → 30\' → 10\' → 5\' as you zoom; edge labels show the current lines. Click anywhere on the map to add a point at that exact position.',
    metrics_intro: 'Every parameter offered by the Stormglass weather endpoint, plus locally derived maritime indicators. Tick what you want on the main screen. Greyed items are not provided by the active provider.',
    metric_na: 'Not provided by the selected provider',
    thresholds_intro: 'An alarm sounds when a metric is forecast to cross its limit within the lead time, and escalates when it is actually exceeded. Values are in your display units.',
    col_on: 'ON', col_metric: 'METRIC', col_rule: 'RULE', col_scope: 'SCOPE', col_op: 'OP', col_limit: 'LIMIT', all_points: 'All points', add_threshold: 'ADD THRESHOLD', no_thresholds: 'No thresholds yet.',
    op_gte: '≥ rises to', op_lte: '≤ falls to', enter_limit: 'Enter a numeric limit',
    lead_label: 'PRE-ALERT LEAD TIME', lead_hint: 'The alarm is raised as soon as a crossing is forecast within this window, and repeated at 60 min.', volume_label: 'ALERT VOLUME',
    opt_sound: 'Audible alerts', opt_notify: 'System notifications', opt_flash: 'Flash taskbar / dock', test_warn: 'TEST WARNING SOUND', test_crit: 'TEST CRITICAL SOUND',
    units_title: 'UNITS', unit_speed: 'WIND & CURRENT SPEED', unit_height: 'HEIGHTS', unit_temp: 'TEMPERATURE', unit_vis: 'VISIBILITY',
    u_kn: 'knots', u_ms: 'm/s', u_kmh: 'km/h', u_m: 'metres', u_ft: 'feet', u_nm: 'nautical miles', u_km: 'kilometres',
    language_title: 'LANGUAGE', lang_en: 'English', lang_uk: 'Українська',
    tz_title: 'TIME ZONE', tz_local: 'System local ({z})', tz_default: 'default', tz_hint: 'Applies to the clock and every displayed time (refresh, ETA, timeline). Forecast data stays in UTC internally.',
    sg_needs_key: 'Stormglass needs an API key.', settings_applied: 'Settings applied',
    // add point
    add_title: 'ADD TRACKING POINT', name_label: 'NAME', name_ph: 'e.g. Kerch approach', coords_label: 'COORDINATES (WGS84)',
    coords_ph: "45.25, 36.55  ·  45°15'N 036°33'E  ·  45 15 0 N 36 33 0 E",
    coords_hint: 'Decimal degrees, degrees-decimal-minutes, or DMS. Window: {win}.', coords_bad: 'Could not parse coordinates.', coords_outside: '{c} — outside the {r} map window.',
    add_btn: 'ADD POINT', cancel: 'CANCEL', max_points: 'Maximum of {n} tracking points', outside_region: 'Coordinates are outside the {r} map window', removed: 'Removed {name}', point_default: 'POINT {n}',
    // limit popover
    lp_title: '{m} — CRITICAL LIMIT', lp_only: 'only for {p}', lp_remove: 'REMOVE', lp_save: 'SAVE', lp_add: 'ADD LIMIT', lp_set: 'SET', lp_click: 'Click to edit the critical limit',
    lp_applied: '{m}: alarm {op} {v}', lp_removed: '{m}: limit removed',
    // toasts / misc
    updated: 'Forecast updated', muted_on: 'Audible alerts muted', muted_off: 'Audible alerts on', map_fail: 'Map data failed to load: ',
    eta_hm: '{h} h {m} min', eta_m: '{m} min', in_: 'in {t}', at_: 'at {t}', reaching: 'reaching', max24: 'MAX 24H', min24: 'MIN 24H',
    // derived words
    bft: 'BFT', from: 'FROM', factor: 'FACTOR', water: 'WATER', tp: 'TP', douglas: 'DOUGLAS', okta: 'OKTA', spread: 'SPREAD', rh: 'RH', angle: 'ANGLE',
    icing_none: 'NONE', icing_light: 'LIGHT', icing_moderate: 'MODERATE', icing_heavy: 'HEAVY', icing_extreme: 'EXTREME', icing_zone: '≥55°N ZONE', icing_south: 'ADVISORY <55°N',
    fog_low: 'LOW', fog_moderate: 'MODERATE', fog_high: 'HIGH', fog_very_high: 'VERY HIGH', td_sst: 'TD−SST',
    ptend_words: { fvr: 'FALLING VERY RAPIDLY', fr: 'FALLING RAPIDLY', f: 'FALLING', rr: 'RISING RAPIDLY', r: 'RISING', s: 'STEADY' },
    cross_no: 'NO', cross_slight: 'SLIGHT', cross_yes: 'YES', gust_squally: 'SQUALLY', gust_gusty: 'GUSTY', gust_steady: 'STEADY',
    cloud_names: { Clear: 'CLEAR', 'Few clouds': 'FEW', Scattered: 'SCATTERED', Broken: 'BROKEN', Overcast: 'OVERCAST' },
    inland: 'NO WAVE DATA (INLAND?)',
    groups: { 'Wind': 'Wind', 'Sea state': 'Sea state', 'Atmosphere': 'Atmosphere', 'Sky & visibility': 'Sky & visibility', 'Precipitation': 'Precipitation', 'Ocean': 'Ocean', 'Derived (maritime)': 'Derived (maritime)', 'Wind (levels)': 'Wind (levels)', 'Upper air': 'Upper air' },
    metrics: {}, air: {}
  };

  const UK = {
    brand_sub: 'МОРСЬКИЙ КОНТРОЛЬ ПОРОГІВ', crumb_alarms: '/ АКТИВНІ ТРИВОГИ', crumb_settings: '/ НАЛАШТУВАННЯ',
    btn_snd: 'ЗВК', btn_rfr: 'ОНВ', btn_set: 'НАЛ', btn_alm: 'ТРВ', btn_hlp: 'ДОВ', btn_cancel: 'СКАСУВАТИ', btn_save: 'ЗБЕРЕГТИ',
    crumb_guide: '/ ДОВІДНИК', tip_guide: 'Довідник користувача', guide_version: 'ДОВІДНИК ДЛЯ ВЕРСІЇ {v}',
    layout_title: 'РОЗКЛАДКА ВІДЖЕТІВ', layout_strip: 'Нижня смуга (карта на весь екран)', layout_side: 'Права панель (класична, два стовпці)', layout_hint: 'Перетягуйте віджети, щоб змінити порядок; він зберігається в обох розкладках.',
    tip_mute: 'Вимкнути / увімкнути звукові сповіщення', tip_refresh: 'Оновити зараз', tip_settings: 'Налаштування', tip_alarms: 'Активні тривоги',
    quota_calls: 'КВОТА {n} ЗАПИТІВ/ОНОВЛЕННЯ', quota_sg: 'КВОТА {used}/{quota}', quota_nokey: 'НЕМАЄ API-КЛЮЧА',
    refresh_none: 'ЩЕ НЕ ОНОВЛЕНО', refresh_failed: 'ПОМИЛКА ОНОВЛЕННЯ', refresh_at: 'ОНОВЛЕНО {t} · НАСТУПНЕ {n}',
    rail_title: 'ТОЧКИ СПОСТЕРЕЖЕННЯ', add_point: '+ ДОДАТИ ТОЧКУ', hint_click: 'КЛАЦНІТЬ НА КАРТІ, ЩОБ ДОДАТИ ТОЧКУ', hint_max: 'МАКСИМУМ 10 ТОЧОК',
    st_ok: 'НОРМ', st_warn: 'УВАГА', st_crit: 'КРИТ',
    legend_normal: 'НОРМА', legend_warn: 'У МЕЖАХ УПЕРЕДЖЕННЯ', legend_crit: 'ПЕРЕВИЩЕНО',
    readout_proj: '{proj} · СІТКА {grid} · ДЕТАЛІЗАЦІЯ {lod}', proj_mercator: 'МЕРКАТОР', proj_albers: 'АЛЬБЕРС',
    lod_c: 'ГРУБА', lod_l: 'НИЗЬКА', lod_i: 'СЕРЕДНЯ', lod_h: 'ВИСОКА', lod_f: 'ПОВНА', lod_ne: 'NE 50M',
    selected: 'ОБРАНО', selected_state_ok: 'ОБРАНО · НОРМА', selected_state_warn: 'ОБРАНО · УВАГА', selected_state_crit: 'ОБРАНО · КРИТИЧНО',
    centre: 'ЦЕНТР', remove: 'ВИДАЛИТИ', no_selection: 'ТОЧКУ НЕ ОБРАНО', no_data: 'НЕМАЄ ДАНИХ', loading: 'ЗАВАНТАЖЕННЯ',
    alarms_title: 'АКТИВНІ ТРИВОГИ', ack_all: 'ПІДТВЕРДИТИ ВСІ', ack: 'ПІДТВ', acked: 'ПІДТВ.', now: 'ЗАРАЗ',
    alarms_summary: 'АКТИВНИХ · {c} КРИТИЧНИХ · {w} ПОПЕРЕДЖЕНЬ · УПЕРЕДЖЕННЯ {lead} ХВ', alarms_none: 'ЖОДЕН ПОРІГ НЕ БЛИЗЬКИЙ ДО ДОСЯГНЕННЯ.',
    col_level: 'РІВЕНЬ', col_point: 'ТОЧКА · ПОКАЗНИК', col_value: 'ЗНАЧЕННЯ / МЕЖА', col_eta: 'ЧАС',
    timeline: 'ХРОНОЛОГІЯ · НАСТУПНІ {lead} ХВ', lead_end: 'КІНЕЦЬ ВІКНА УПЕРЕДЖЕННЯ', exceeded: 'ПЕРЕВИЩЕНО',
    engine_note: 'Рушій перевіряє кешований 72-годинний прогноз кожні 30 с. Попередження повторюються за 60 хв, якщо їх підтверджено. Без витрат API.',
    level_critical: 'КРИТИЧНО', level_warning: 'УВАГА', more_warnings: '+{n} ПОПЕРЕДЖЕНЬ', more_alarms: '+{n} ЩЕ',
    rises_to: 'ЗРОСТЕ ДО', falls_to: 'ВПАДЕ ДО', limit: 'МЕЖА', acknowledged_at: 'ПІДТВЕРДЖЕНО {t}',
    settings_title: 'НАЛАШТУВАННЯ', tab_provider: 'ДЖЕРЕЛО', tab_map: 'КАРТА', tab_metrics: 'ПОКАЗНИКИ', tab_thresholds: 'ПОРОГИ', tab_alerts: 'СПОВІЩЕННЯ Й ОДИНИЦІ',
    provider_label: 'ПОСТАЧАЛЬНИК ДАНИХ', refresh_label: 'ІНТЕРВАЛ ОНОВЛЕННЯ', apikey_label: 'API-КЛЮЧ STORMGLASS', sgsource_label: 'ДЖЕРЕЛО STORMGLASS',
    apikey_ph: 'вставте ключ із dashboard.stormglass.io', apikey_stored: '•••••••• ключ збережено (вставте, щоб замінити)',
    apikey_hint: 'Зберігається зашифрованим у сховищі ОС. Не залишає цей комп’ютер, окрім заголовка Authorization до api.stormglass.io.',
    refresh_15: 'Кожні 15 хв', refresh_30: 'Кожні 30 хв', refresh_60: 'Щогодини', refresh_180: 'Кожні 3 год', refresh_360: 'Кожні 6 год', refresh_720: 'Кожні 12 год',
    prov_om: 'Open-Meteo (безкоштовно, без ключа — ICON/GFS/ECMWF + хвилі MFWAM/EWAM)', prov_sg: 'Stormglass.io (потрібен API-ключ)',
    budget_sg: '<b>Бюджет запитів:</b> {n} точок × {per} оновлень/добу = <b>{calls} запитів/добу</b>. Ваша квота: {quota}/добу{plan}. {over}Тривоги переоцінюються кожні 30 с із кешованого 72-год прогнозу, тож довший інтервал не затримує сповіщення.',
    budget_sg_plan: ' (безкоштовний план; платні 500 / 5 000 / 25 000)', budget_over: 'Це перевищує квоту — збільште інтервал або змініть план. ',
    budget_om: '<b>Бюджет запитів:</b> Open-Meteo повертає всі точки одним викликом (2 виклики на оновлення, {calls}/добу). Безкоштовний рівень — 10 000/добу для некомерційного використання; комерційне потребує платного ключа (від $29/міс).',
    map_window: 'ВІКНО КАРТИ', projection: 'ПРОЄКЦІЯ', region_bs: 'Чорне та Азовське моря — берегова лінія GSHHG, 5 рівнів деталізації', region_ea: 'Європа та Азія — огляд Natural Earth 50 м',
    proj_opt_merc: 'Меркатор (морська карта)', proj_opt_albers: "Рівновелика конічна Альберса, СП 46°15'N / 41°15'N (як на еталонній карті)",
    map_note: '<b>Берегова лінія Чорного моря:</b> GSHHG v2.3.7 (NOAA / Гавайський університет), WGS84. Деталізація перемикається під час масштабування: середня → висока → повна (≈ 100 м). Озера, річки та державні кордони з WDBII. Крок сітки 10° → 5° → 2° → 1° → 30\' → 10\' → 5\'; підписи на краях показують поточні лінії. Клацніть будь-де на карті, щоб додати точку саме там.',
    metrics_intro: 'Усі параметри, які надає погодний ендпоінт Stormglass, плюс морські показники, обчислені локально. Позначте те, що має бути на головному екрані. Сірі пункти не надаються активним постачальником.',
    metric_na: 'Не надається обраним постачальником',
    thresholds_intro: 'Тривога звучить, коли прогноз показує перетин межі протягом часу упередження, і посилюється, коли межу фактично перевищено. Значення — у ваших одиницях.',
    col_on: 'УВІМК', col_metric: 'ПОКАЗНИК', col_rule: 'ПРАВИЛО', col_scope: 'ОБЛАСТЬ', col_op: 'УМОВА', col_limit: 'МЕЖА', all_points: 'Усі точки', add_threshold: 'ДОДАТИ ПОРІГ', no_thresholds: 'Порогів ще немає.',
    op_gte: '≥ зросте до', op_lte: '≤ впаде до', enter_limit: 'Введіть числову межу',
    lead_label: 'ЧАС УПЕРЕДЖЕННЯ', lead_hint: 'Тривога подається, щойно прогноз показує перетин у цьому вікні, і повторюється за 60 хв.', volume_label: 'ГУЧНІСТЬ',
    opt_sound: 'Звукові сповіщення', opt_notify: 'Системні сповіщення', opt_flash: 'Блимання на панелі задач', test_warn: 'ТЕСТ ЗВУКУ ПОПЕРЕДЖЕННЯ', test_crit: 'ТЕСТ КРИТИЧНОГО ЗВУКУ',
    units_title: 'ОДИНИЦІ', unit_speed: 'ШВИДКІСТЬ ВІТРУ Й ТЕЧІЇ', unit_height: 'ВИСОТИ', unit_temp: 'ТЕМПЕРАТУРА', unit_vis: 'ВИДИМІСТЬ',
    u_kn: 'вузли', u_ms: 'м/с', u_kmh: 'км/год', u_m: 'метри', u_ft: 'фути', u_nm: 'морські милі', u_km: 'кілометри',
    language_title: 'МОВА', lang_en: 'English', lang_uk: 'Українська',
    tz_title: 'ЧАСОВИЙ ПОЯС', tz_local: 'Системний ({z})', tz_default: 'типово', tz_hint: 'Застосовується до годинника та всіх відображуваних часів (оновлення, ETA, хронологія). Дані прогнозу зберігаються в UTC.',
    sg_needs_key: 'Для Stormglass потрібен API-ключ.', settings_applied: 'Налаштування застосовано',
    add_title: 'ДОДАТИ ТОЧКУ', name_label: 'НАЗВА', name_ph: 'напр. Підхід до Керчі', coords_label: 'КООРДИНАТИ (WGS84)',
    coords_ph: "45.25, 36.55  ·  45°15'N 036°33'E  ·  45 15 0 N 36 33 0 E",
    coords_hint: 'Десяткові градуси, градуси-хвилини або ГХС. Вікно: {win}.', coords_bad: 'Не вдалося розпізнати координати.', coords_outside: '{c} — поза вікном карти {r}.',
    add_btn: 'ДОДАТИ', cancel: 'СКАСУВАТИ', max_points: 'Максимум {n} точок', outside_region: 'Координати поза вікном карти {r}', removed: 'Видалено {name}', point_default: 'ТОЧКА {n}',
    lp_title: '{m} — КРИТИЧНА МЕЖА', lp_only: 'лише для {p}', lp_remove: 'ВИДАЛИТИ', lp_save: 'ЗБЕРЕГТИ', lp_add: 'ДОДАТИ', lp_set: 'ЗАДАТИ', lp_click: 'Клацніть, щоб змінити критичну межу',
    lp_applied: '{m}: тривога {op} {v}', lp_removed: '{m}: межу видалено',
    updated: 'Прогноз оновлено', muted_on: 'Звук вимкнено', muted_off: 'Звук увімкнено', map_fail: 'Не вдалося завантажити дані карти: ',
    eta_hm: '{h} год {m} хв', eta_m: '{m} хв', in_: 'через {t}', at_: 'о {t}', reaching: 'досягне', max24: 'МАКС 24Г', min24: 'МІН 24Г',
    bft: 'БАЛ', from: 'З', factor: 'КОЕФ', water: 'ВОДА', tp: 'TP', douglas: 'ДУГЛАС', okta: 'ОКТА', spread: 'ДЕФІЦИТ', rh: 'ВОЛ', angle: 'КУТ',
    icing_none: 'НЕМАЄ', icing_light: 'СЛАБКЕ', icing_moderate: 'ПОМІРНЕ', icing_heavy: 'СИЛЬНЕ', icing_extreme: 'ЕКСТРЕМАЛЬНЕ', icing_zone: 'ЗОНА ≥55°N', icing_south: 'ДОВІДКОВО <55°N',
    fog_low: 'НИЗЬКА', fog_moderate: 'ПОМІРНА', fog_high: 'ВИСОКА', fog_very_high: 'ДУЖЕ ВИСОКА', td_sst: 'TD−SST',
    ptend_words: { fvr: 'ДУЖЕ ШВИДКО ПАДАЄ', fr: 'ШВИДКО ПАДАЄ', f: 'ПАДАЄ', rr: 'ШВИДКО ЗРОСТАЄ', r: 'ЗРОСТАЄ', s: 'СТАБІЛЬНИЙ' },
    cross_no: 'НІ', cross_slight: 'СЛАБКЕ', cross_yes: 'ТАК', gust_squally: 'ШКВАЛИСТО', gust_gusty: 'ПОРИВЧАСТО', gust_steady: 'РІВНО',
    cloud_names: { Clear: 'ЯСНО', 'Few clouds': 'МАЛОХМАРНО', Scattered: 'МІНЛИВА', Broken: 'ЗНАЧНА', Overcast: 'СУЦІЛЬНА' },
    inland: 'НЕМАЄ ДАНИХ ПРО ХВИЛІ (СУША?)',
    groups: { 'Wind': 'Вітер', 'Sea state': 'Стан моря', 'Atmosphere': 'Атмосфера', 'Sky & visibility': 'Небо та видимість', 'Precipitation': 'Опади', 'Ocean': 'Океан', 'Derived (maritime)': 'Похідні (морські)', 'Wind (levels)': 'Вітер (рівні)', 'Upper air': 'Верхні шари' },
    metrics: {
      windSpeed: 'Швидкість вітру', gust: 'Пориви вітру', windDirection: 'Напрямок вітру', waveHeight: 'Висота хвилі (Hs)', wavePeriod: 'Період хвилі', waveDirection: 'Напрямок хвилі',
      swellHeight: 'Висота зибу', swellPeriod: 'Період зибу', swellDirection: 'Напрямок зибу', secondarySwellHeight: 'Висота вторинного зибу', secondarySwellPeriod: 'Період вторинного зибу', secondarySwellDirection: 'Напрямок вторинного зибу',
      windWaveHeight: 'Висота вітрової хвилі', windWavePeriod: 'Період вітрової хвилі', windWaveDirection: 'Напрямок вітрової хвилі',
      pressure: 'Тиск (MSL)', airTemperature: 'Температура повітря', dewPointTemperature: 'Точка роси', humidity: 'Відносна вологість', cloudCover: 'Хмарність', visibility: 'Видимість',
      precipitation: 'Опади', rain: 'Дощ', snow: 'Сніг', graupel: 'Крупа', snowDepth: 'Висота снігу', snowAlbedo: 'Альбедо снігу',
      waterTemperature: 'Температура води', surfaceTemperature: 'Температура поверхні', currentSpeed: 'Швидкість течії', currentDirection: 'Напрямок течії', seaLevel: 'Рівень моря (відн. MSL)', iceCover: 'Льодовий покрив', seaIceThickness: 'Товщина льоду',
      d_beaufort: 'Сила вітру (Бофорт)', d_seaState: 'Стан моря (Дуглас)', d_cloudCondition: 'Стан неба', d_airCondition: 'Стан атмосфери', d_pressureTendency: 'Тенденція тиску (3 год)', d_crossSea: 'Перехресне хвилювання', d_fogRisk: 'Ризик туману', d_gustFactor: 'Коефіцієнт поривів', d_icing: 'Індекс обледеніння (Overland)', d_advFog: 'Імовірність адвективного туману'
    },
    short: { windSpeed: 'ВІТЕР 10М', gust: 'ПОРИВИ', windDirection: 'НАПР ВІТРУ', waveHeight: 'ХВИЛЯ HS', wavePeriod: 'ПЕРІОД TP', waveDirection: 'НАПР ХВИЛІ', swellHeight: 'ЗИБ', swellPeriod: 'ПЕРІОД ЗИБУ', swellDirection: 'НАПР ЗИБУ', windWaveHeight: 'ВІТР ХВИЛЯ',
      pressure: 'ТИСК', airTemperature: 'ПОВІТРЯ', waterTemperature: 'ВОДА', dewPointTemperature: 'ТОЧКА РОСИ', humidity: 'ВОЛОГІСТЬ', cloudCover: 'ХМАРНІСТЬ', visibility: 'ВИДИМІСТЬ', precipitation: 'ОПАДИ', currentSpeed: 'ТЕЧІЯ', currentDirection: 'НАПР ТЕЧІЇ',
      d_beaufort: 'БОФОРТ', d_seaState: 'СТАН МОРЯ', d_cloudCondition: 'НЕБО', d_airCondition: 'АТМОСФЕРА', d_pressureTendency: 'ТЕНД ТИСКУ', d_crossSea: 'ПЕРЕХР ХВИЛІ', d_fogRisk: 'РИЗИК ТУМАНУ', d_gustFactor: 'КОЕФ ПОРИВІВ', d_icing: 'ОБЛЕДЕНІННЯ', d_advFog: 'АДВ ТУМАН' },
    air: { 'Fog': 'ТУМАН', 'Rime fog': 'ПАМОРОЗЬ', 'Thick mist': 'ГУСТА ІМЛА', 'Mist': 'ІМЛА', 'Haze': 'СЕРПАНОК', 'Heavy snow': 'СИЛЬНИЙ СНІГ', 'Snow': 'СНІГ', 'Heavy rain': 'СИЛЬНИЙ ДОЩ', 'Rain': 'ДОЩ', 'Light rain': 'СЛАБКИЙ ДОЩ', 'Good visibility': 'ДОБРА ВИДИМІСТЬ',
      'Clear': 'ЯСНО', 'Mainly clear': 'ПЕРЕВАЖНО ЯСНО', 'Partly cloudy': 'МІНЛИВА ХМАРНІСТЬ', 'Overcast': 'ПОХМУРО', 'Light drizzle': 'СЛАБКА МРЯКА', 'Drizzle': 'МРЯКА', 'Dense drizzle': 'ГУСТА МРЯКА', 'Freezing drizzle': 'ПЕРЕОХОЛОДЖЕНА МРЯКА', 'Freezing rain': 'КРИЖАНИЙ ДОЩ',
      'Light snow': 'СЛАБКИЙ СНІГ', 'Snow grains': 'СНІЖНА КРУПА', 'Rain showers': 'ЗЛИВИ', 'Violent showers': 'СИЛЬНІ ЗЛИВИ', 'Snow showers': 'СНІГОПАД', 'Thunderstorm': 'ГРОЗА', 'Thunderstorm, hail': 'ГРОЗА З ГРАДОМ' },
    beaufort_names: { 'Calm': 'ШТИЛЬ', 'Light air': 'ТИХИЙ', 'Light breeze': 'ЛЕГКИЙ', 'Gentle breeze': 'СЛАБКИЙ', 'Moderate breeze': 'ПОМІРНИЙ', 'Fresh breeze': 'СВІЖИЙ', 'Strong breeze': 'СИЛЬНИЙ', 'Near gale': 'МІЦНИЙ', 'Gale': 'ДУЖЕ МІЦНИЙ', 'Strong gale': 'ШТОРМ', 'Storm': 'СИЛЬНИЙ ШТОРМ', 'Violent storm': 'ЖОРСТОКИЙ ШТОРМ', 'Hurricane': 'УРАГАН' },
    douglas_names: { 'Calm (glassy)': 'ШТИЛЬ (ДЗЕРКАЛО)', 'Calm (rippled)': 'ШТИЛЬ (БРИЖІ)', 'Smooth': 'СЛАБКЕ', 'Slight': 'ЛЕГКЕ', 'Moderate': 'ПОМІРНЕ', 'Rough': 'НЕСПОКІЙНЕ', 'Very rough': 'ДУЖЕ НЕСПОКІЙНЕ', 'High': 'БУРХЛИВЕ', 'Very high': 'ДУЖЕ БУРХЛИВЕ', 'Phenomenal': 'ВИНЯТКОВЕ' }
  };

  const DICT = { en: EN, uk: UK };
  let lang = 'en';

  function t(key, vars) {
    const d = DICT[lang] || EN;
    let s = (key in d ? d[key] : EN[key]);
    if (s === undefined) s = key;
    if (typeof s === 'string' && vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
    return s;
  }
  // Metric label (long) in current language
  function metricLabel(id, fallback) {
    const d = DICT[lang];
    return (d && d.metrics && d.metrics[id]) || fallback;
  }
  function metricShort(id, fallback) {
    const d = DICT[lang];
    return (d && d.short && d.short[id]) || (WA.SHORT && WA.SHORT[id]) || fallback;
  }
  function word(table, key) {
    const d = DICT[lang];
    return (d && d[table] && d[table][key]) || (EN[table] && EN[table][key]) || key;
  }
  function setLang(l) { lang = DICT[l] ? l : 'en'; document.documentElement.lang = lang; }
  function applyStatic(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
    (root || document).querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    (root || document).querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  }

  WA.i18n = { t, metricLabel, metricShort, word, setLang, applyStatic, lang: () => lang, DICT };
})();
