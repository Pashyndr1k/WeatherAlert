// In-app user guide (EN / UK). GUIDE.version must match package.json — test/guide.test.js enforces it,
// so every version bump forces a guide update (add a "What's new" entry and revise affected sections).
(function () {
  'use strict';
  const WA = (window.WA = window.WA || {});

  const EN = [
    { id: 'overview', title: 'Overview', body: `
<p>WeatherAlert watches marine weather at up to 10 fixed positions and raises alarms before a critical limit is reached. Everything runs from a cached 72-hour forecast that is re-fetched on the interval you choose, so the app keeps working between refreshes and never spends an API request on alarm checks.</p>
<p>The home screen has three areas: the <b>map</b> with your tracking points, the <b>tracking-point rail</b> (top-left) and the <b>metric widgets</b> for the selected point (bottom strip or right panel, see Layout). The top bar shows the data provider, the request budget, the last and next refresh, the clock in your chosen time zone and four buttons: <b>SND</b> mute, <b>RFR</b> refresh now, <b>ALM</b> active alarms, <b>SET</b> settings, <b>HLP</b> this guide.</p>` },
    { id: 'points', title: 'Tracking points', body: `
<p><b>Add a point</b> by clicking anywhere on the map, or with <b>+ ADD POINT</b> in the rail. Coordinates are WGS84 and accept decimal degrees (<code>45.25, 36.55</code>), degrees-decimal-minutes (<code>45°15.0'N 036°33.0'E</code>) or degrees-minutes-seconds (<code>45 15 0 N 36 33 0 E</code>). The hint under the field echoes the parsed position.</p>
<p>Points must lie inside the active map window (Black Sea &amp; Sea of Azov by default). Click a row in the rail or a marker on the map to select it; double-click a row (or press <b>CENTRE</b>) to fly the map to it; the <b>×</b> on the row or <b>REMOVE</b> deletes it.</p>
<p>Marker colour and the rail status show the point's state: white <b>OK</b>, amber <b>WARN</b> when a limit will be crossed within the lead time, red <b>CRIT</b> when a limit is exceeded now.</p>` },
    { id: 'map', title: 'Map', body: `
<p>The shoreline comes from GSHHG (NOAA / University of Hawaii) with five levels of detail; the app switches from intermediate to high to full (≈100 m) as you zoom with the mouse wheel. Drag to pan. The lat/lon grid steps from 10° down to 5' and the edge labels always show the current lines. The top-right readout shows projection, grid step, detail level and the cursor position.</p>
<p>Settings → Map lets you pick <b>Mercator</b> (nautical chart) or <b>Albers equal-area conic</b> with standard parallels 46°15'N / 41°15'N, and switch to a wide Europe &amp; Asia overview. Panning is limited to the map window, so the view never leaves the chart.</p>
<p><b>Layers</b> (icons at the bottom-right): <b>depth bands</b> from ETOPO 2022 (1 arc-minute) at 10 / 20 / 50 / 100 / 200 / 500 / 1000 / 1500 / 2000 m, and <b>surface currents</b> from the Open-Meteo marine model sampled on a lattice over both seas (arrows point where the water flows; length and brightness scale with speed, hover for knots). Currents are re-sampled every three hours.</p>
<p><b>Provider quick-pick</b>: click the provider name in the top bar to switch between Open-Meteo and any Stormglass source without opening Settings.</p>` },
    { id: 'widgets', title: 'Metric widgets', body: `
<p>Each widget shows one metric for the selected point: the value, its unit, a limit badge and a context line (for example wind direction and Beaufort force, wave period and Douglas sea state, 3-hour pressure trend). A widget turns amber or red together with the alarm state of that metric.</p>
<p><b>Choose which widgets appear</b> in Settings → Metrics: every parameter of the Stormglass weather endpoint plus the derived maritime indicators. Greyed items are not provided by the active provider.</p>
<p><b>Reorder widgets by dragging</b> them: press on a widget, drag it left or right (or up and down in the right-panel layout) and release on the position you want. The order is saved.</p>
<p><b>Layout</b>: Settings → Map → Widget layout switches between the <b>bottom strip</b> (map-first) and the <b>right panel</b> (two columns of widgets beside the map, as in the first version of the app).</p>` },
    { id: 'limits', title: 'Limits and alarms', body: `
<p>Click the <b>limit badge</b> on any widget (for example <code>≥33</code> or <code>—</code>) to set, change or remove its critical limit in place: choose <b>≥ rises to</b> or <b>≤ falls to</b>, type the value in your display units, tick <b>only for this point</b> if the limit should not apply to the other points, then press Enter or <b>SAVE</b>. Settings → Thresholds shows the full list and lets you disable rules without deleting them.</p>
<p>The engine re-evaluates every rule every 30 seconds:</p>
<ul>
<li><b>WARNING</b> (amber) — the forecast crosses the limit within the lead time (60–90 min, default 90). The alarm shows the ETA and the clock time of the crossing. If you acknowledge it, it sounds once more when the crossing is 60 minutes away.</li>
<li><b>CRITICAL</b> (red) — the value at the present moment already exceeds the limit.</li>
</ul>
<p>Alarms are announced by the banner across the map, the widget and marker colours, an audible chime (warning) or siren (critical) that repeats until acknowledged, a system notification and a taskbar flash. <b>ACKNOWLEDGE ALL</b> silences the sound; the alarm stays listed until the condition clears.</p>` },
    { id: 'critpop', title: 'Critical pop-up', body: `
<p>The moment any limit becomes <b>exceeded</b>, a red-framed pop-up takes over the screen: the map dims behind it and the panel lists every active alarm, critical rows first, each with the point, the rule, the current value against the limit, and a status (<b>EXCEEDED · +1.4</b> with the 24-hour peak, or the ETA for warnings still within the lead window). The siren repeats while it is open.</p>
<ul>
<li><b>ACKNOWLEDGE ALL</b> or <b>Enter</b> — acknowledges every listed alarm, stops the siren and closes the pop-up. Alarms stay in the Active alarms view until the condition clears.</li>
<li><b>SNOOZE 10</b>, <b>×</b> or <b>Esc</b> — hides the pop-up and mutes the siren for 10 minutes. It re-opens if the limit is still exceeded after that, or immediately if a new critical alarm appears.</li>
<li><b>CHART</b> — closes the pop-up and centres the map on the first critical point.</li>
</ul>
<p>Warning-only states keep using the banner across the top of the map; the pop-up is reserved for exceeded limits.</p>` },
    { id: 'alarms', title: 'Active alarms view', body: `
<p>Press <b>ALM</b> or click the banner. The table lists every active alarm sorted critical first, then by ETA, with the point, the rule, the forecast value against the limit, the ETA and an <b>ACK</b> button. Acknowledged rows are dimmed and show the acknowledgement time. The timeline on the right places each alarm on the next lead window; click a row to jump to that point on the map.</p>` },
    { id: 'settings', title: 'Settings', body: `
<p><b>Provider</b> — Open-Meteo (free, no key, all points in one call) or Stormglass.io (API key, stored encrypted with the OS keychain; choose the <code>sg</code> blend or a single source such as ECMWF, MET Norway or the UK Met Office). The request-budget box shows how many calls your point count and refresh interval need per day against the plan quota.</p>
<p><b>Map</b> — map window, projection and widget layout.</p>
<p><b>Metrics</b> — which widgets appear. <b>Thresholds</b> — the full rule list with enable, scope and remove, plus a form to add rules.</p>
<p><b>Alerts &amp; units</b> — lead time (60–90 min), alert volume and test sounds, audible / system notification / taskbar flash toggles, units (knots · m/s · km/h, m · ft, °C · °F, NM · km), <b>language</b> (English / Українська) and <b>time zone</b> (system local or any UTC offset; UTC+3 by default). The zone applies to the clock and every displayed time; forecast data stays in UTC internally.</p>
<p><b>SAVE &amp; APPLY</b> writes the settings; <b>CANCEL</b> discards changes to the threshold list.</p>` },
    { id: 'indicators', title: 'Derived indicators', body: `
<ul>
<li><b>Beaufort force</b> from 10 m wind speed; <b>Douglas sea state</b> from significant wave height; <b>Sky</b> in oktas; <b>Air conditions</b> (fog, mist, haze, rain, snow, thunderstorm) from visibility, humidity, precipitation and the weather code.</li>
<li><b>Pressure tendency</b> — change over the last 3 hours; a fall faster than −3.5 hPa/3 h is highlighted. Default alarm ≤ −4 hPa/3 h.</li>
<li><b>Icing index</b> — Overland (1990) vessel-icing predictor from wind, air and sea-surface temperature, shown as an icing rate in cm/h with light / moderate / heavy / extreme classes. Computed everywhere and labelled as the standard ≥55°N zone or "advisory" south of it. Default alarm ≥ 0.7 cm/h.</li>
<li><b>Advection-fog probability</b> — dew point against sea-surface temperature (warm moist air over colder water), shaped by humidity and the 2–8 m/s wind band, as 0–100 %. Default alarm ≥ 60 %.</li>
<li><b>Cross-sea</b> (swell against wind waves), <b>fog risk</b> (dew-point spread) and <b>gust factor</b> are available in Settings → Metrics.</li>
</ul>` },
    { id: 'currents', title: 'Currents at a point', body: `
<p>A tracking point that lies on the sea shows a second, blue arrow: the <b>current drift</b> direction (where the water flows to; wind and wave arrows point the way they come from). Land points have no current data and show no blue arrow.</p>
<p><b>How the current at any position and time is obtained.</b> The primary method is the ocean model behind the marine forecast: Open-Meteo serves hourly surface-current speed and direction for any coordinate from a 1/12° (≈9 km) global ocean model with a 5–10 day horizon; Stormglass exposes the same quantity from NOAA RTOFS, ECMWF and the UK Met Office (0.25°, finer on the NW Shelf). The app interpolates the hourly series to the requested minute, exactly as it does for wind and waves, so the value for a date and time is a linear interpolation between the two nearest model hours. The map layer samples the same model on a lattice; values between lattice points can be bilinearly interpolated from the four neighbours.</p>
<p><b>Fallback without model data</b> (offline, or outside the model grid): a climatological estimate. The Black Sea circulation is dominated by the cyclonic <b>Rim Current</b> along the continental slope (roughly the 200–1500 m isobaths), 0.4–0.8 kn in winter and 0.2–0.4 kn in summer, with two cyclonic gyres inside and anticyclonic eddies (Batumi, Sevastopol) between the Rim Current and the coast. A workable estimate is: direction = along the local isobath, counter-clockwise around the basin; speed = seasonal peak × a bell-shaped weight of the distance to the 1000 m isobath (≈30 km wide). In the shallow Sea of Azov there is no persistent current: the surface drift is about 2–3 % of the wind speed, rotated ≈15–20° to the right of the wind, plus a weak cyclonic residual, so the wind forecast is the best proxy. The app uses this fallback only when the model returns nothing for the point.</p>` },
    { id: 'whatsnew', title: "What's new", body: `
<p><b>0.4.0</b> — double-click a tracking point to centre the map on it; depth-band and surface-current map layers with toggles; current drift arrow on sea points; provider quick-pick in the top bar; remove icon on each tracking point; map properties moved to the bottom-right; compact legend; panning limited to the map window; Open-Meteo current speed now converted from km/h.</p>
<p><b>0.3.1</b> — critical thresholds pop-up (design option 2A): full-screen alert with acknowledge, snooze and chart actions, Enter / Esc keys.</p>
<p><b>0.3.0</b> — in-app user guide (EN / UA); widget layout selector (bottom strip or right panel); drag-and-drop widget ordering; dark backing under the tracking rail; new refresh indicator.</p>
<p><b>0.2.1</b> — time-zone setting (default UTC+3); limit editor now opens above the strip; single map grid.</p>
<p><b>0.2.0</b> — OUTPOST interface; icing index and advection-fog probability; Ukrainian language.</p>
<p><b>0.1.0</b> — first release: GSHHG Black Sea map, Open-Meteo / Stormglass providers, threshold alarms with 60–90 min lead, inline limit editing, launcher and GitHub release builds.</p>` }
  ];

  const UK = [
    { id: 'overview', title: 'Огляд', body: `
<p>WeatherAlert стежить за морською погодою в до 10 фіксованих точках і подає тривогу до того, як буде досягнуто критичну межу. Усе працює з кешованого 72-годинного прогнозу, який оновлюється з обраним інтервалом, тому застосунок працює й між оновленнями і не витрачає запити API на перевірку тривог.</p>
<p>Головний екран має три зони: <b>карту</b> з точками спостереження, <b>список точок</b> (угорі ліворуч) і <b>віджети показників</b> обраної точки (нижня смуга або права панель, див. «Розкладка»). У верхній панелі — постачальник даних, бюджет запитів, час останнього й наступного оновлення, годинник у вашому часовому поясі та кнопки: <b>ЗВК</b> звук, <b>ОНВ</b> оновити, <b>ТРВ</b> тривоги, <b>НАЛ</b> налаштування, <b>ДОВ</b> цей довідник.</p>` },
    { id: 'points', title: 'Точки спостереження', body: `
<p><b>Додайте точку</b> клацанням на карті або кнопкою <b>+ ДОДАТИ ТОЧКУ</b>. Координати WGS84 у десяткових градусах (<code>45.25, 36.55</code>), градусах-хвилинах (<code>45°15.0'N 036°33.0'E</code>) або градусах-хвилинах-секундах (<code>45 15 0 N 36 33 0 E</code>). Підказка під полем показує розпізнану позицію.</p>
<p>Точки мають лежати у вікні карти (типово — Чорне та Азовське моря). Клацніть рядок у списку або маркер на карті, щоб обрати точку; подвійне клацання по рядку (або <b>ЦЕНТР</b>) наводить карту на неї; <b>×</b> у рядку або <b>ВИДАЛИТИ</b> прибирає її.</p>
<p>Колір маркера та статус у списку показують стан точки: білий <b>НОРМ</b>, жовтий <b>УВАГА</b> — межу буде перетнуто в межах часу упередження, червоний <b>КРИТ</b> — межу вже перевищено.</p>` },
    { id: 'map', title: 'Карта', body: `
<p>Берегова лінія — GSHHG (NOAA / Гавайський університет) із п’ятьма рівнями деталізації; під час масштабування колесом миші застосунок переходить від середньої до високої та повної (≈100 м). Перетягуйте карту для панорамування. Сітка широт/довгот змінює крок від 10° до 5', підписи на краях завжди відповідають поточним лініям. Угорі праворуч — проєкція, крок сітки, рівень деталізації та координати курсора.</p>
<p>У Налаштування → Карта можна обрати <b>Меркатор</b> (морська карта) або <b>рівновелику конічну Альберса</b> зі стандартними паралелями 46°15'N / 41°15'N, а також перейти на огляд Європи та Азії. Панорамування обмежене вікном карти, тож вигляд ніколи не виходить за її межі.</p>
<p><b>Шари</b> (значки внизу праворуч): <b>глибини</b> з ETOPO 2022 (1 кутова мінута) на рівнях 10 / 20 / 50 / 100 / 200 / 500 / 1000 / 1500 / 2000 м та <b>поверхневі течії</b> з морської моделі Open-Meteo на сітці над обома морями (стрілки вказують, куди тече вода; довжина та яскравість залежать від швидкості, наведіть курсор — побачите вузли). Течії оновлюються кожні три години.</p>
<p><b>Швидкий вибір джерела</b>: клацніть назву постачальника у верхній панелі, щоб перемкнутися між Open-Meteo та будь-яким джерелом Stormglass без відкриття налаштувань.</p>` },
    { id: 'widgets', title: 'Віджети показників', body: `
<p>Кожен віджет показує один показник обраної точки: значення, одиницю, бейдж межі та контекстний рядок (наприклад, напрямок вітру й бали Бофорта, період хвилі й стан моря за Дугласом, тенденцію тиску за 3 год). Віджет стає жовтим або червоним разом зі станом тривоги цього показника.</p>
<p><b>Оберіть віджети</b> в Налаштування → Показники: усі параметри погодного ендпоінта Stormglass плюс похідні морські показники. Сірі пункти не надаються активним постачальником.</p>
<p><b>Переставляйте віджети перетягуванням</b>: натисніть на віджет, перетягніть ліворуч/праворуч (або вгору/вниз у правій панелі) і відпустіть на потрібному місці. Порядок зберігається.</p>
<p><b>Розкладка</b>: Налаштування → Карта → Розкладка віджетів перемикає між <b>нижньою смугою</b> (карта на весь екран) і <b>правою панеллю</b> (два стовпці віджетів поруч із картою, як у першій версії).</p>` },
    { id: 'limits', title: 'Межі й тривоги', body: `
<p>Клацніть <b>бейдж межі</b> на віджеті (наприклад <code>≥33</code> або <code>—</code>), щоб задати, змінити чи видалити критичну межу на місці: оберіть <b>≥ зросте до</b> або <b>≤ впаде до</b>, введіть значення у ваших одиницях, позначте <b>лише для цієї точки</b>, якщо межа не має діяти для інших точок, і натисніть Enter або <b>ЗБЕРЕГТИ</b>. Налаштування → Пороги показує повний список і дозволяє вимикати правила без видалення.</p>
<p>Рушій перевіряє кожне правило кожні 30 секунд:</p>
<ul>
<li><b>УВАГА</b> (жовтий) — прогноз перетинає межу в межах часу упередження (60–90 хв, типово 90). Тривога показує час до перетину та годину. Якщо її підтверджено, звук повторюється, коли до перетину лишається 60 хвилин.</li>
<li><b>КРИТИЧНО</b> (червоний) — значення в поточний момент уже перевищує межу.</li>
</ul>
<p>Тривоги подаються банером над картою, кольором віджетів і маркерів, звуком (дзвінок — увага, сирена — критично), що повторюється до підтвердження, системним сповіщенням і блиманням на панелі задач. <b>ПІДТВЕРДИТИ ВСІ</b> вимикає звук; тривога лишається в списку, доки умова не зникне.</p>` },
    { id: 'critpop', title: 'Критичне вікно', body: `
<p>Щойно якусь межу <b>перевищено</b>, на екрані з’являється вікно з червоною рамкою: карта позаду темнішає, а панель перелічує всі активні тривоги — спершу критичні — з точкою, правилом, поточним значенням проти межі та статусом (<b>ПЕРЕВИЩЕНО · +1.4</b> із піком за 24 години або час до перетину для попереджень у межах упередження). Поки вікно відкрите, сирена повторюється.</p>
<ul>
<li><b>ПІДТВЕРДИТИ ВСІ</b> або <b>Enter</b> — підтверджує всі перелічені тривоги, зупиняє сирену й закриває вікно. Тривоги лишаються на екрані активних тривог, доки умова не зникне.</li>
<li><b>ВІДКЛАСТИ 10</b>, <b>×</b> або <b>Esc</b> — ховає вікно та вимикає сирену на 10 хвилин. Вікно відкриється знову, якщо межа досі перевищена, або одразу, якщо з’явиться нова критична тривога.</li>
<li><b>КАРТА</b> — закриває вікно й наводить карту на першу критичну точку.</li>
</ul>
<p>Для станів лише з попередженнями й далі використовується банер над картою; вікно призначене тільки для перевищених меж.</p>` },
    { id: 'alarms', title: 'Екран активних тривог', body: `
<p>Натисніть <b>ТРВ</b> або клацніть банер. Таблиця містить усі активні тривоги (спочатку критичні, далі за часом): точка, правило, прогнозне значення проти межі, час і кнопка <b>ПІДТВ</b>. Підтверджені рядки приглушені й показують час підтвердження. Хронологія праворуч розміщує кожну тривогу на найближчому вікні упередження; клацніть рядок, щоб перейти до точки на карті.</p>` },
    { id: 'settings', title: 'Налаштування', body: `
<p><b>Джерело</b> — Open-Meteo (безкоштовно, без ключа, усі точки одним запитом) або Stormglass.io (API-ключ, зберігається зашифрованим у сховищі ОС; можна обрати змішане джерело <code>sg</code> або одне джерело, як-от ECMWF, MET Norway чи UK Met Office). Блок бюджету показує, скільки запитів на добу потрібно для вашої кількості точок та інтервалу порівняно з квотою плану.</p>
<p><b>Карта</b> — вікно карти, проєкція та розкладка віджетів.</p>
<p><b>Показники</b> — які віджети показувати. <b>Пороги</b> — повний список правил з увімкненням, областю дії та видаленням, а також форма для додавання.</p>
<p><b>Сповіщення й одиниці</b> — час упередження (60–90 хв), гучність і тестові звуки, перемикачі звуку / системних сповіщень / блимання, одиниці (вузли · м/с · км/год, м · фут, °C · °F, милі · км), <b>мова</b> (English / Українська) та <b>часовий пояс</b> (системний або будь-який зсув UTC; типово UTC+3). Пояс застосовується до годинника й усіх відображуваних часів; дані прогнозу лишаються в UTC.</p>
<p><b>ЗБЕРЕГТИ</b> записує налаштування; <b>СКАСУВАТИ</b> відкидає зміни списку порогів.</p>` },
    { id: 'indicators', title: 'Похідні показники', body: `
<ul>
<li><b>Сила вітру за Бофортом</b> зі швидкості вітру на 10 м; <b>стан моря за Дугласом</b> зі значущої висоти хвилі; <b>небо</b> в октах; <b>стан атмосфери</b> (туман, імла, серпанок, дощ, сніг, гроза) з видимості, вологості, опадів і коду погоди.</li>
<li><b>Тенденція тиску</b> — зміна за останні 3 години; падіння швидше за −3.5 гПа/3 год підсвічується. Типова тривога ≤ −4 гПа/3 год.</li>
<li><b>Індекс обледеніння</b> — предиктор обледеніння суден Overland (1990) з вітру, температури повітря та поверхні моря, показаний як швидкість наростання льоду в см/год із класами слабке / помірне / сильне / екстремальне. Обчислюється всюди й позначається як стандартна зона ≥55°N або «довідково» південніше. Типова тривога ≥ 0.7 см/год.</li>
<li><b>Імовірність адвективного туману</b> — точка роси проти температури поверхні моря (тепле вологе повітря над холоднішою водою) з урахуванням вологості й вітру 2–8 м/с, у відсотках. Типова тривога ≥ 60 %.</li>
<li><b>Перехресне хвилювання</b> (зиб проти вітрових хвиль), <b>ризик туману</b> (дефіцит точки роси) та <b>коефіцієнт поривів</b> доступні в Налаштування → Показники.</li>
</ul>` },
    { id: 'currents', title: 'Течія в точці', body: `
<p>Точка спостереження на морі показує другу, синю стрілку — напрямок <b>дрейфу течії</b> (куди тече вода; стрілки вітру та хвиль показують, звідки вони йдуть). Точки на суші не мають даних про течію і синьої стрілки не показують.</p>
<p><b>Як обчислюється течія в будь-якій точці на певний час.</b> Основний метод — океанічна модель за морським прогнозом: Open-Meteo надає погодинну швидкість і напрямок поверхневої течії для будь-якої координати з глобальної моделі 1/12° (≈9 км) з горизонтом 5–10 діб; Stormglass надає ту саму величину з NOAA RTOFS, ECMWF та UK Met Office (0.25°, точніше на NW Shelf). Застосунок інтерполює погодинний ряд до потрібної хвилини так само, як вітер і хвилі, тобто значення на дату й час — лінійна інтерполяція між двома найближчими модельними годинами. Шар на карті вибирає ту саму модель на сітці; між вузлами сітки значення можна отримати білінійною інтерполяцією з чотирьох сусідів.</p>
<p><b>Резервний метод без модельних даних</b> (офлайн або поза сіткою моделі) — кліматологічна оцінка. Циркуляцію Чорного моря визначає циклонічна <b>Основна чорноморська течія</b> уздовж материкового схилу (приблизно ізобати 200–1500 м), 0.4–0.8 вузла взимку та 0.2–0.4 вузла влітку, з двома циклонічними круговоротами всередині та антициклонічними вихорами (Батумський, Севастопольський) між нею та берегом. Практична оцінка: напрямок — уздовж місцевої ізобати проти годинникової стрілки навколо басейну; швидкість — сезонний максимум × дзвоноподібна вага відстані до ізобати 1000 м (ширина ≈30 км). У мілкому Азовському морі сталої течії немає: поверхневий дрейф становить близько 2–3 % швидкості вітру з поворотом ≈15–20° праворуч від вітру плюс слабкий циклонічний залишок, тож найкращий показник — прогноз вітру. Застосунок використовує цей резерв лише тоді, коли модель не повертає даних для точки.</p>` },
    { id: 'whatsnew', title: 'Що нового', body: `
<p><b>0.4.0</b> — подвійне клацання по точці наводить на неї карту; шари глибин і поверхневих течій з перемикачами; синя стрілка течії на морських точках; швидкий вибір джерела у верхній панелі; значок видалення біля кожної точки; властивості карти внизу праворуч; компактна легенда; панорамування обмежене вікном карти; швидкість течії Open-Meteo тепер переводиться з км/год.</p>
<p><b>0.3.1</b> — вікно критичних порогів (варіант дизайну 2A): повноекранне сповіщення з підтвердженням, відкладанням і переходом до карти, клавіші Enter / Esc.</p>
<p><b>0.3.0</b> — вбудований довідник (EN / UA); вибір розкладки віджетів (нижня смуга або права панель); перестановка віджетів перетягуванням; темна підкладка під списком точок; новий індикатор оновлення.</p>
<p><b>0.2.1</b> — налаштування часового поясу (типово UTC+3); редактор межі відкривається над смугою; одна сітка на карті.</p>
<p><b>0.2.0</b> — інтерфейс OUTPOST; індекс обледеніння та ймовірність адвективного туману; українська мова.</p>
<p><b>0.1.0</b> — перший випуск: карта Чорного моря GSHHG, джерела Open-Meteo / Stormglass, порогові тривоги з упередженням 60–90 хв, редагування меж на віджетах, лаунчер і збірки релізів на GitHub.</p>` }
  ];

  WA.GUIDE = { version: '0.4.0', en: EN, uk: UK };
})();
