// WeatherAlert renderer (OUTPOST layout) — state, three views (home / alarms / settings),
// rail + bottom strip rendering, alarm orchestration, localisation.
(function () {
  'use strict';
  const WA = window.WA;
  const U = WA.units, A = WA.alarms, I = WA.i18n, t = I.t;
  const METRICS = WA.METRICS, DERIVED = WA.DERIVED, BY_ID = WA.METRIC_BY_ID;
  const MAX_POINTS = 10;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ defaults
  const uid = () => Math.random().toString(36).slice(2, 9);
  function defaultSettings() {
    return {
      provider: 'openmeteo', projection: 'mercator', refreshMin: 30, sgSource: 'sg',
      leadMin: 90, volume: 60, sound: true, notify: true, flash: true, muted: false, lang: 'en', tz: 180, layout: 'side', layers: { currents: true }, currentsDensity: 'coarse', widgetColor: 'value', coordPrecision: 0.05, plan: { pts: [], depart: null, speedKn: 6 },
      units: { speed: 'kn', length: 'm', temp: 'c', vis: 'nm' },
      display: [...METRICS, ...DERIVED].filter((m) => m.def).map((m) => m.id),
      thresholds: [
        { id: uid(), metric: 'windSpeed', op: 'gte', value: 17.2, enabled: true, pointIds: [] },
        { id: uid(), metric: 'gust', op: 'gte', value: 22.0, enabled: true, pointIds: [] },
        { id: uid(), metric: 'waveHeight', op: 'gte', value: 3.0, enabled: true, pointIds: [] },
        { id: uid(), metric: 'visibility', op: 'lte', value: 1.0, enabled: true, pointIds: [] },
        { id: uid(), metric: 'd_pressureTendency', op: 'lte', value: -4, enabled: true, pointIds: [] },
        { id: uid(), metric: 'd_icing', op: 'gte', value: 0.7, enabled: true, pointIds: [] },
        { id: uid(), metric: 'd_advFog', op: 'gte', value: 60, enabled: true, pointIds: [] },
        { id: uid(), metric: 'd_seaHazard', op: 'gte', value: 60, enabled: true, pointIds: [] }
      ],
      points: []
    };
  }

  const state = {
    s: defaultSettings(), forecasts: {}, selectedId: null, alarms: [], acked: new Set(), ackedAt: {}, seen: new Set(), reminded: new Set(),
    lastShown: {}, lastRefresh: null, quota: null, busy: false, hasKey: false, error: null, view: 'home', settingsDraft: null,
    crit: { open: false, snoozedUntil: 0, snoozedKeys: new Set(), raisedAt: null, shownKeys: new Set() },
    currents: { grid: null, fetchedAt: 0, busy: false }, ruler: { on: false, sum: null },
    plan: { on: false, sum: null, fc: null, key: null, fetching: false, samples: [], samplesKey: null, samplesStatus: null, samplesAt: 0, play: null, focus: true }, timeShift: 0
  };
  let map = null, refreshTimer = null, evalTimer = null;

  // ------------------------------------------------------------------ persistence
  async function load() {
    const saved = await window.bridge.getSettings();
    if (saved) {
      const d = defaultSettings();
      state.s = { ...d, ...saved, units: { ...d.units, ...(saved.units || {}) }, layers: { ...d.layers, ...(saved.layers || {}) }, plan: { ...d.plan, ...(saved.plan || {}) } };
      // make sure the new default indicators appear for existing installs
      ['d_icing', 'd_advFog'].forEach((id) => { if (!saved.display) return; if (!state.s.display.includes(id) && saved.display.length && !saved.seenIndicators) state.s.display.push(id); });
      state.s.seenIndicators = true;
      // 0.4.1: the right-panel layout became the default; migrate installs that still carry the old default once
      if (!saved.layoutV2) { state.s.layout = 'side'; state.s.layoutV2 = true; }
      // 0.10.0: sea-state hazard index and steepness widgets + default hazard alarm, added once to existing installs
      if (!saved.seaHazardV1) {
        ['d_steepness', 'd_seaHazard'].forEach((id) => { if (!state.s.display.includes(id)) state.s.display.push(id); });
        if (!state.s.thresholds.some((x) => x.metric === 'd_seaHazard')) state.s.thresholds.push({ id: uid(), metric: 'd_seaHazard', op: 'gte', value: 60, enabled: true, pointIds: [] });
        state.s.seaHazardV1 = true;
      }
      if (!saved.waveEnergyV1) { if (!state.s.display.includes('d_waveEnergy')) state.s.display.push('d_waveEnergy'); state.s.waveEnergyV1 = true; }
      // 0.7.0: ship sensors, AIS, depth layer, AI ensemble and the Europe–Asia map were removed — drop their saved state
      delete state.s.sensors; delete state.s.ai; delete state.s.region;
      state.s.layers = { currents: state.s.layers.currents !== false };
      state.s.points = (state.s.points || []).filter((p) => !p.own);
    }
    state.hasKey = await window.bridge.hasApiKey();
  }
  let saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => window.bridge.saveSettings(state.s), 150); }

  // ------------------------------------------------------------------ helpers
  const pad2 = (n) => String(n).padStart(2, '0');
  // ---- time zone: state.s.tz is an offset in minutes from UTC, or 'local' for the OS zone
  function tzOffset() { return state.s.tz === 'local' ? -new Date().getTimezoneOffset() : Number(state.s.tz) || 0; }
  function tzSuffix() { const o = tzOffset(); if (o === 0) return 'Z'; const a = Math.abs(o); return `${o < 0 ? '−' : '+'}${pad2(Math.floor(a / 60))}${a % 60 ? ':' + pad2(a % 60) : ''}`; }
  function tzLabel(o) { if (o === 0) return 'UTC'; const a = Math.abs(o); return `UTC${o < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + pad2(a % 60) : ''}`; }
  function shifted(ms) { return new Date(ms + tzOffset() * 60e3); }
  const fmtClock = (ms) => { const d = shifted(ms); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`; };
  const fmtTime = (ms) => fmtClock(ms) + tzSuffix();
  const fmtEta = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? t('eta_hm', { h: Math.floor(m / 60), m: pad2(m % 60) }) : t('eta_m', { m }); };
  const fmtEtaClock = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; };
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 4200);
  }
  function mLabel(id) { return BY_ID[id] ? I.metricLabel(id, BY_ID[id].label) : id; }
  function mShort(id) { return BY_ID[id] ? I.metricShort(id, BY_ID[id].label) : id; }
  function mKind(id) { return BY_ID[id] ? BY_ID[id].kind : 'text'; }
  function fmtMetric(id, canonical) { return U.fmt(mKind(id), canonical, state.s.units); }
  function opSym(op) { return op === 'lte' ? '≤' : '≥'; }
  function pointById(id) { return state.s.points.find((p) => p.id === id); }
  // ---- the moment the widgets and map colours describe: the planner's ETA while the ship is on a finished route,
  // otherwise now + the time-bar offset. Alarms always use the real clock.
  function planEta() { const p = state.plan; if (!p.on || !p.sum || !p.sum.ship) return null; return etaAtKm(p.sum.ship.km); }
  function viewTime() { const e = planEta(); return e !== null ? e : Date.now() + state.timeShift; }
  function isShifted() { return planEta() !== null || state.timeShift > 0; }
  // the ship owns the right panel and the view time while it is the last thing moved; selecting a tracking point hands them back
  function planShipPoint() { const p = state.plan; return p.on && p.focus && p.sum && p.sum.ship ? { id: 'ship', name: t('plan_ship'), lat: p.sum.ship.lat, lon: p.sum.ship.lon, ship: true } : null; }
  function forecastOf(pointId) { return pointId === 'ship' ? state.plan.fc : state.forecasts[pointId]; }
  // depth + upwind fetch for the sea-state hazard (null until the bathy grid is loaded)
  function ctxFor(p) { return { lat: p.lat, lon: p.lon, depth: WA.bathy.depthAt(p.lat, p.lon), fetchKm: (dirFrom) => WA.bathy.fetchKm(p.lat, p.lon, dirFrom) }; }
  // value of any metric (plain, derived or series-derived) for point p at time tm
  function metricAt(id, p, v, tm) {
    if (U.SERIES_DERIVED[id]) { const fc = forecastOf(p.id); return fc ? U.SERIES_DERIVED[id](fc.hours, tm, ctxFor(p)) : null; }
    if (id === 'd_pressureTendency') return v ? v.d_pressureTendency : null;
    if (id.startsWith('d_')) return v ? U.derivedValue(id, v, p.lat) : null;
    return v ? v[id] : null;
  }
  // 'critical' when any applicable limit is exceeded in the forecast at time tm (used for shifted views)
  function forecastLevel(p, tm) {
    const fc = forecastOf(p.id); if (!fc) return '';
    for (const th of state.s.thresholds) {
      if (!th.enabled || (th.pointIds.length && !th.pointIds.includes(p.id))) continue;
      const v = A.seriesValue(fc.hours, th.metric, tm, p.lat, ctxFor(p));
      if (v !== null && v !== undefined && A.exceeds(th.op, v, th.value)) return 'critical';
    }
    return '';
  }
  function forecastCritText(p, tm) {
    const fc = forecastOf(p.id); if (!fc) return '';
    for (const th of state.s.thresholds) {
      if (!th.enabled || (th.pointIds.length && !th.pointIds.includes(p.id))) continue;
      const v = A.seriesValue(fc.hours, th.metric, tm, p.lat, ctxFor(p));
      if (v !== null && v !== undefined && A.exceeds(th.op, v, th.value)) { const f = fmtMetric(th.metric, v); return `${f.text} ${f.unit}`.toUpperCase(); }
    }
    return '';
  }
  function levelFor(p) { return isShifted() ? forecastLevel(p, viewTime()) : pointLevel(p.id); }
  function currentValues(pointId, at) {
    const fc = forecastOf(pointId);
    if (!fc) return null;
    const now = at === undefined ? viewTime() : at, v = {};
    METRICS.forEach((m) => { v[m.id] = A.valueAt(fc.hours, m.id, now); });
    v.weatherCode = (() => { const h = fc.hours.filter((x) => x.t <= now).pop() || fc.hours[0]; return h ? h.v.weatherCode : null; })();
    v.d_pressureTendency = A.pressureTendency(fc.hours, now);
    return v;
  }
  function pointLevel(id) {
    const list = state.alarms.filter((a) => a.pointId === id);
    if (list.some((a) => a.level === 'critical')) return 'critical';
    if (list.some((a) => a.level === 'warning')) return 'warning';
    return '';
  }

  // ------------------------------------------------------------------ views
  function setView(v) {
    state.view = v;
    document.getElementById('app').dataset.view = v;
    $('viewHome').hidden = v !== 'home'; $('viewAlarms').hidden = v !== 'alarms'; $('viewSettings').hidden = v !== 'settings'; $('viewGuide').hidden = v !== 'guide';
    $('homeButtons').hidden = v !== 'home'; $('settingsButtons').hidden = v !== 'settings'; $('alarmsButtons').hidden = v !== 'alarms'; $('guideButtons').hidden = v !== 'guide';
    $('topbarStatus').hidden = v !== 'home';
    $('crumb').hidden = v === 'home';
    $('crumb').textContent = v === 'alarms' ? t('crumb_alarms') : v === 'settings' ? t('crumb_settings') : v === 'guide' ? t('crumb_guide') : '';
    if (v === 'alarms') renderAlarmsView();
    if (v === 'guide') renderGuide();
    if (v === 'home') { setTimeout(() => map && map.resize(), 0); }
  }

  // ------------------------------------------------------------------ clock
  function tickClock() {
    if (state.timeShift && !state.plan.on) renderTimebar();
    const d = shifted(Date.now());
    $('clockHm').textContent = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
    $('clockS').textContent = `:${pad2(d.getUTCSeconds())}`;
    $('clockZone').textContent = tzLabel(tzOffset());
    if (state.lastRefresh) {
      const next = state.lastRefresh + state.s.refreshMin * 60e3;
      $('refreshText').textContent = t('refresh_at', { t: fmtTime(state.lastRefresh), n: fmtTime(next) });
    }
  }

  // ------------------------------------------------------------------ data refresh
  async function refresh(reason = 'manual') {
    if (state.busy) return;
    if (!state.s.points.length) { renderStatus(); return; }
    state.busy = true; state.error = null; renderStatus();
    $('btnRefresh').classList.add('busy');
    try {
      const params = Array.from(new Set([...state.s.display, ...state.s.thresholds.map((x) => x.metric)])).filter((id) => BY_ID[id] && BY_ID[id].sg && !id.startsWith('d_'));
      const res = await window.bridge.fetchWeather(state.s.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon })), { provider: state.s.provider, params, source: state.s.sgSource, hours: 72, precision: state.s.coordPrecision });
      res.forEach((fc) => { state.forecasts[fc.pointId] = fc; if (fc.meta && fc.meta.quota) state.quota = { used: fc.meta.used, quota: fc.meta.quota }; });
      state.lastRefresh = Date.now();
      state.plan.samplesKey = null; ensureRouteSamples();
      if (reason === 'manual') toast(t('updated'), 'ok');
    } catch (e) {
      state.error = e.message || String(e);
      toast(state.error, 'err');
    } finally {
      state.busy = false;
      $('btnRefresh').classList.remove('busy');
      renderStatus(); evaluateAlarms(); renderAll();
    }
  }
  function schedule() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh('auto'), Math.max(5, state.s.refreshMin) * 60e3);
    clearInterval(evalTimer);
    evalTimer = setInterval(() => { evaluateAlarms(); renderAlarms(); renderMapStates(); applyCardStates(); renderPoints(); if (state.s.layers.currents) refreshCurrents(); }, 30e3);
  }

  // ------------------------------------------------------------------ alarms
  function evaluateAlarms() {
    const alarms = A.evaluate(state.s.points, state.forecasts, state.s.thresholds, { leadMinutes: state.s.leadMin, ctxFor });
    const keys = new Set(alarms.map((a) => a.key));
    [...state.seen].forEach((k) => { if (!keys.has(k)) { state.seen.delete(k); state.acked.delete(k); state.reminded.delete(k); delete state.ackedAt[k]; } });
    const fresh = alarms.filter((a) => !state.seen.has(a.key));
    fresh.forEach((a) => state.seen.add(a.key));
    alarms.forEach((a) => {
      if (a.level === 'warning' && a.eta <= 60 * 60e3 && state.acked.has(a.key) && !state.reminded.has(a.key)) { state.reminded.add(a.key); state.acked.delete(a.key); fresh.push(a); }
    });
    state.alarms = alarms;
    if (fresh.length) announce(fresh);
    updateCritPopup();
    updateAudio();
  }
  function describe(a) {
    const p = pointById(a.pointId);
    const lim = fmtMetric(a.metric, a.limit), val = fmtMetric(a.metric, a.value);
    const name = (p ? p.name : a.pointId).toUpperCase();
    const banner = a.level === 'critical'
      ? `${name} — ${mLabel(a.metric)} ${val.text} ${val.unit} ${opSym(a.op)} ${lim.text} ${lim.unit} ${t('limit')}`
      : `${name} — ${mLabel(a.metric)} ${opSym(a.op)} ${lim.text} ${lim.unit} ${t('in_', { t: fmtEta(a.eta) })} (${fmtTime(a.at)})`;
    const title = `${a.level === 'critical' ? t('level_critical') : t('level_warning')} · ${name}`;
    return { title, body: banner, rule: `${mLabel(a.metric)} · ${a.op === 'lte' ? t('falls_to') : t('rises_to')} ${opSym(a.op)} ${lim.text} ${lim.unit}` };
  }
  function announce(list) {
    const top = list.find((a) => a.level === 'critical') || list[0];
    const d = describe(top);
    if (state.s.notify) window.bridge.notify(d.title, list.length > 1 ? `${d.body}\n${t('more_alarms', { n: list.length - 1 })}` : d.body, top.level === 'critical');
    if (state.s.flash) window.bridge.attention();
  }
  function updateAudio() {
    const un = state.alarms.filter((a) => !state.acked.has(a.key));
    const snoozed = state.crit.snoozedUntil > Date.now();
    const mode = !state.s.sound || state.s.muted ? null : un.some((a) => a.level === 'critical') && !snoozed ? 'critical' : un.some((a) => a.level === 'warning') ? 'warning' : null;
    WA.audio.setMode(mode);
  }
  function ack(key) { state.acked.add(key); state.ackedAt[key] = Date.now(); updateAudio(); renderAlarms(); }
  function ackAll() { state.alarms.forEach((a) => { state.acked.add(a.key); state.ackedAt[a.key] = state.ackedAt[a.key] || Date.now(); }); updateAudio(); renderAlarms(); }

  // ------------------------------------------------------------------ rendering
  function renderAll() { renderPoints(); renderSelected(); renderAlarms(); renderMapStates(); renderStatus(); if (state.view === 'alarms') renderAlarmsView(); }

  function renderStatus() {
    $('providerName').textContent = state.s.provider === 'stormglass' ? `STORMGLASS · ${state.s.sgSource.toUpperCase()}` : 'OPEN-METEO';
    const pill = $('pillProvider');
    pill.classList.toggle('busy', state.busy); pill.classList.toggle('err', Boolean(state.error));
    pill.title = state.error || '';
    if (state.s.provider === 'stormglass') $('quotaText').textContent = state.quota ? t('quota_sg', { used: state.quota.used, quota: state.quota.quota }) : (state.hasKey ? t('quota_sg', { used: '—', quota: '—' }) : t('quota_nokey'));
    else $('quotaText').textContent = t('quota_calls', { n: 2 });
    if (!state.lastRefresh) $('refreshText').textContent = state.error ? t('refresh_failed') : t('refresh_none');
    $('btnMute').classList.toggle('muted', state.s.muted);
  }

  function renderPoints() {
    const list = $('pointList');
    list.innerHTML = '';
    state.s.points.forEach((p, i) => {
      const lvl = levelFor(p);
      const el = document.createElement('div');
      el.className = `rail-row ${lvl} ${p.id === state.selectedId ? 'active' : ''}`;
      el.innerHTML = `<span class="nm"></span><span class="st"></span><button class="rm" type="button" title="${t('remove_point_tip')}">×</button>`;
      el.querySelector('.nm').textContent = `${pad2(i + 1)} ${p.name}`;
      el.querySelector('.st').textContent = lvl === 'critical' ? t('st_crit') : lvl === 'warning' ? t('st_warn') : t('st_ok');
      el.addEventListener('click', () => select(p.id));
      el.addEventListener('dblclick', () => { select(p.id); if (map) map.flyTo(p.lon, p.lat, 4); });
      el.querySelector('.rm').addEventListener('click', (ev) => { ev.stopPropagation(); removePoint(p.id); });
      list.appendChild(el);
    });
    $('pointCount').textContent = `${pad2(state.s.points.length)} / ${MAX_POINTS}`;
    $('mapHint').hidden = state.s.points.length > 0;
    $('mapHint').textContent = state.s.points.length >= MAX_POINTS ? t('hint_max') : t('hint_click');
    if (map) map.setPoints(state.s.points);
  }

  function renderMapStates() {
    if (!map) return;
    const st = {};
    state.s.points.forEach((p) => {
      const v = currentValues(p.id);
      const lvl = levelFor(p);
      let critText = '';
      if (lvl === 'critical' && isShifted()) critText = forecastCritText(p, viewTime());
      else if (lvl === 'critical') { const a = state.alarms.find((x) => x.pointId === p.id && x.level === 'critical'); if (a) { const f = fmtMetric(a.metric, a.value); critText = `${f.text} ${f.unit}`.toUpperCase(); } }
      const cur = v && v.currentSpeed !== null && v.currentSpeed !== undefined && v.currentDirection !== null && v.currentDirection !== undefined ? v.currentDirection : null;
      st[p.id] = { level: lvl, windDir: v ? v.windDirection : null, curDir: cur, critText };
    });
    map.setStates(st);
    map.setSelected(state.selectedId);
    const proj = state.s.projection === 'albers' ? t('proj_albers') : t('proj_mercator');
    const lod = map.lod(); const lodTxt = lod ? t(`lod_${lod}`) : '—';
    $('readoutMeta').textContent = t('readout_proj', { proj, grid: $('gridText').textContent || '—', lod: lodTxt });
  }

  function renderSelected() {
    const ship = planShipPoint();
    const p = ship || pointById(state.selectedId);
    const grid = $('metricsGrid');
    $('selActions').hidden = !p || Boolean(ship);
    if (!p) {
      $('selState').textContent = t('no_selection'); $('selState').className = 'sel-state';
      $('selName').textContent = '—'; $('selCoords').textContent = '';
      grid.innerHTML = '';
      return;
    }
    const lvl = levelFor(p);
    const shiftedView = isShifted();
    $('selState').textContent = shiftedView ? (lvl === 'critical' ? t('fc_state_crit') : t('fc_state_ok')) : lvl === 'critical' ? t('selected_state_crit') : lvl === 'warning' ? t('selected_state_warn') : t('selected_state_ok');
    $('selState').className = `sel-state ${lvl}`;
    $('selName').textContent = p.name;
    $('selCoords').textContent = `${U.fmtLat(p.lat)} ${U.fmtLon(p.lon)}` + (shiftedView ? ` · ${t('fc_at')} ${fmtTime(viewTime())}` : '');
    const fc = forecastOf(p.id);
    const v = currentValues(p.id);
    grid.innerHTML = '';
    if (!fc) { grid.innerHTML = `<div class="card placeholder">${state.busy || (ship && state.plan.fetching) ? t('loading') : (state.error || t('no_data'))}</div>`; return; }
    const order = state.s.display.map((id) => BY_ID[id]).filter(Boolean);
    order.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'card'; card.dataset.metric = m.id; card.draggable = true;
      attachDrag(card);
      const editable = m.threshold && m.kind !== 'text';
      const head = `<div class="c-head"><span>${mShort(m.id)}</span><button class="c-badge${editable ? ' editable' : ''}" data-badge type="button" title="${editable ? t('lp_click') : ''}"></button></div>`;
      let body = '';
      if (m.id.startsWith('d_')) body = derivedBody(m, v, fc, p);
      else if (m.kind === 'dir') {
        const f = U.fmt('dir', v[m.id], state.s.units);
        const rot = v[m.id] === null || v[m.id] === undefined ? 0 : v[m.id] + 180;
        body = `<div class="c-val" data-val>${f.text}<span class="u">${f.unit}</span><svg class="dir-arrow" viewBox="-12 -12 24 24" style="transform:rotate(${rot}deg)"><path d="M0,-10 L5,0 L2,0 L2,10 L-2,10 L-2,0 L-5,0 Z"/></svg></div><div class="c-sub">${t('from')} ${f.unit || '—'}</div>`;
      } else {
        const f = fmtMetric(m.id, v[m.id]);
        const th = thresholdFor(m.id, p.id);
        const pk = A.peak(fc.hours, m.id, viewTime(), 24 * 3600e3, th ? th.op : 'gte');
        const pkf = pk ? fmtMetric(m.id, pk.v) : null;
        let sub = pk ? `${th && th.op === 'lte' ? t('min24') : t('max24')} ${pkf.text} ${pkf.unit} · ${fmtTime(pk.t)}` : '';
        if (m.id === 'windSpeed') { const b = U.beaufort(v.windSpeed); const d = U.fmt('dir', v.windDirection, state.s.units); sub = `${t('from')} ${d.text}${b ? ` · ${t('bft')} ${b.force}` : ''}`; }
        if (m.id === 'gust' && v.windSpeed && v.gust) sub = `${t('factor')} ${(v.gust / Math.max(0.5, v.windSpeed)).toFixed(2)}`;
        if (m.id === 'waveHeight') { const s = U.seaState(v.waveHeight); const tp = fmtMetric('wavePeriod', v.wavePeriod); sub = `TP ${tp.text} ${tp.unit}${s ? ` · ${t('douglas')} ${s.code}` : ''}`; }
        if (m.id === 'pressure' && v.d_pressureTendency !== null && v.d_pressureTendency !== undefined) { const pt = v.d_pressureTendency; sub = `${pt < 0 ? '▼' : pt > 0 ? '▲' : '■'} ${Math.abs(pt).toFixed(1)} / 3H`; }
        if (m.id === 'visibility') { const a = U.airCondition(v); const fr = U.fogRisk(v); sub = `${a ? I.word('air', a.name) : ''}${fr ? ` · ${t('spread')} ${fr.spread.toFixed(1)}°` : ''}`; }
        if (m.id === 'cloudCover') { const c = U.cloudCondition(v.cloudCover); sub = c ? `${c.oktas}/8 · ${I.word('cloud_names', c.name)}` : ''; }
        if (m.id === 'airTemperature' && v.waterTemperature !== null && v.waterTemperature !== undefined) { const w = fmtMetric('waterTemperature', v.waterTemperature); sub = `${t('water')} ${w.text}${w.unit}`; }
        body = `<div class="c-val" data-val>${f.text}<span class="u">${f.unit}</span></div><div class="c-sub${m.id === 'pressure' && v.d_pressureTendency <= -3.5 ? ' warn' : ''}">${sub}</div>`;
      }
      card.innerHTML = head + body;
      if (editable) card.querySelector('[data-badge]').addEventListener('click', (ev) => { ev.stopPropagation(); openLimitEditor(m.id, card); });
      const valEl = card.querySelector('[data-val]');
      if (valEl) { const key = `${p.id}|${m.id}`, txt = valEl.textContent; if (state.lastShown[key] !== undefined && state.lastShown[key] !== txt) valEl.classList.add('flash'); state.lastShown[key] = txt; }
      grid.appendChild(card);
    });
    applyCardStates();
  }
  // ---- drag-and-drop widget ordering (HTML5 DnD; order persisted in state.s.display)
  let dragId = null;
  function attachDrag(card) {
    card.addEventListener('dragstart', (ev) => { dragId = card.dataset.metric; card.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', dragId); } catch (e) { /* ignore */ } closeLimitEditor(); });
    card.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('#metricsGrid .card').forEach((c) => c.classList.remove('dragging', 'drop-before', 'drop-after')); });
    card.addEventListener('dragover', (ev) => {
      if (!dragId || dragId === card.dataset.metric) return;
      ev.preventDefault(); ev.dataTransfer.dropEffect = 'move';
      const r = card.getBoundingClientRect();
      const side = state.s.layout === 'side' ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width;
      card.classList.toggle('drop-before', side < 0.5); card.classList.toggle('drop-after', side >= 0.5);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const target = card.dataset.metric;
      if (!dragId || dragId === target) return;
      const after = card.classList.contains('drop-after');
      const list = state.s.display.filter((id) => id !== dragId);
      const idx = list.indexOf(target);
      list.splice(after ? idx + 1 : idx, 0, dragId);
      state.s.display = list; save(); renderSelected();
    });
  }
  function thresholdFor(metricId, pointId) { return state.s.thresholds.find((x) => x.enabled && x.metric === metricId && (!x.pointIds.length || x.pointIds.includes(pointId))); }

  function derivedBody(m, v, fc, p) {
    const V = (val, unit, sub, cls = '') => `<div class="c-val${cls}" data-val>${val}${unit ? `<span class="u">${unit}</span>` : ''}</div><div class="c-sub">${sub || ''}</div>`;
    switch (m.id) {
      case 'd_beaufort': { const b = U.beaufort(v.windSpeed); return b ? V(b.force, t('bft'), I.word('beaufort_names', b.name)) : V('—'); }
      case 'd_seaState': { const s = U.seaState(v.waveHeight); return s ? V(s.code, t('douglas'), I.word('douglas_names', s.name)) : V('—', '', t('inland')); }
      case 'd_cloudCondition': { const c = U.cloudCondition(v.cloudCover); return c ? V(I.word('cloud_names', c.name), '', `${c.oktas}/8 ${t('okta')} · ${Math.round(v.cloudCover)} %`, ' text') : V('—'); }
      case 'd_airCondition': { const a = U.airCondition(v); const vis = fmtMetric('visibility', v.visibility); return a ? V(I.word('air', a.name), '', `${vis.text} ${vis.unit}${v.humidity !== null && v.humidity !== undefined ? ` · ${t('rh')} ${Math.round(v.humidity)} %` : ''}`, ' text') : V('—'); }
      case 'd_pressureTendency': { const f = U.fmt('ptend', v.d_pressureTendency, state.s.units); const x = v.d_pressureTendency; const w = t('ptend_words'); const word = x === null ? '' : x <= -6 ? w.fvr : x <= -3.5 ? w.fr : x <= -1.5 ? w.f : x >= 3.5 ? w.rr : x >= 1.5 ? w.r : w.s; return V(f.text, f.unit, word); }
      case 'd_crossSea': { const c = U.crossSea(v); return c ? V(t(`cross_${c.name.toLowerCase()}`), '', `${t('angle')} ${Math.round(c.angle)}°`, ' text') : V('—'); }
      case 'd_fogRisk': { const f = U.fogRisk(v); return f ? V(t(`fog_${f.level.toLowerCase()}`), '', `${t('spread')} ${f.spread.toFixed(1)} °C`, ' text') : V('—'); }
      case 'd_gustFactor': { const g = v.windSpeed && v.gust ? v.gust / Math.max(0.5, v.windSpeed) : null; return g ? V(g.toFixed(2), '×', g > 1.6 ? t('gust_squally') : g > 1.3 ? t('gust_gusty') : t('gust_steady')) : V('—'); }
      case 'd_icing': {
        const r = U.icing(v, p ? p.lat : null);
        if (!r) return V('—');
        const f = U.fmt('icing', r.rate, state.s.units);
        return V(f.text, f.unit, `${t(`icing_${r.cls}`)} · ${r.zone ? t('icing_zone') : t('icing_south')}`);
      }
      case 'd_advFog': {
        const r = U.advectionFog(v);
        if (!r) return V('—');
        return V(Math.round(r.p), '%', `${t(`fog_${r.level.replace(' ', '_')}`)} · ${t('td_sst')} ${r.excess >= 0 ? '+' : ''}${r.excess.toFixed(1)}°`);
      }
      case 'd_steepness': {
        const r = U.steepness(v);
        if (!r) return V('—');
        return V((r.s * 100).toFixed(1), '%', `1:${r.ratio} · ${t(`steep_${r.cls}`)} · L ${Math.round(r.L)} m`);
      }
      case 'd_seaHazard': {
        const r = U.seaHazard(fc.hours, viewTime(), ctxFor(p));
        if (!r) return V('—');
        const reason = r.parts.length ? r.parts.slice(0, 2).map((x) => hazardReason(x)).join(' · ') : (ctxFor(p).depth === null ? t('hz_nodepth') : t('hz_none'));
        return V(r.score, '%', `${t(`hz_${r.cls}`)} · ${reason}`);
      }
      case 'd_fetchHs': {
        const r = U.fetchEstimate(fc.hours, viewTime(), ctxFor(p));
        if (!r) return V('—', '', t('fetch_none'));
        const f = fmtMetric('waveHeight', r.hs);
        return V(f.text, f.unit, t('fetch_sum', { h: r.hours, km: Math.round(r.fetchKm), u: (r.meanU * 1.943844).toFixed(0) }));
      }
      case 'd_waveEnergy': {
        const r = U.waveEnergy(v);
        if (!r) return V('—');
        const f = U.fmt('energy', r.e, state.s.units);
        return V(f.text, f.unit, `${r.p !== null ? `${(r.p / 1000).toFixed(1)} kW/m · ` : ''}${t('energy_law')}`);
      }
      default: return '';
    }
  }
  // one short reason for a hazard component, e.g. "STEEP 1:19", "WIND vs CURRENT 160°", "SHOALING 14 M"
  function hazardReason(x) {
    const i = x.info || {};
    if (x.id === 'steep') return `${t('hz_steep')} 1:${i.ratio}`;
    if (x.id === 'opposing') return `${t('hz_opposing')} ${Math.round(i.angle)}°`;
    if (x.id === 'cross') return `${t('hz_cross')} ${Math.round(i.angle)}°`;
    if (x.id === 'shoal') { const d = fmtMetric('waveHeight', i.depth); return `${t('hz_shoal')} ${d.text} ${d.unit}`; }
    if (x.id === 'fetch') { const f = fmtMetric('waveHeight', i.hs); return `${t('hz_fetch')} → ${f.text} ${f.unit} · ${i.hours} H`; }
    return x.id;
  }

  // Ratio 0..1+ of how close a value is to its limit (1 = at the limit, >1 = exceeded); null when no limit or value.
  // Metrics whose natural floor is not zero are graded over a realistic span instead of a ratio to the limit:
  // pressure: the tint starts 15 hPa before the limit; temperatures: 7 °C before the limit (user request).
  const GRADE_SPAN = { pressure: { span: 15 }, airTemperature: { span: 7 }, waterTemperature: { span: 7 }, dewPointTemperature: { span: 7 }, surfaceTemperature: { span: 7 } };
  function limitRatio(metricId, value, th) {
    if (!th || value === null || value === undefined || Number.isNaN(value)) return null;
    const g = GRADE_SPAN[metricId];
    if (g && g.hi !== undefined) {
      // 0 at the far edge of the normal band, 1 at the limit: a 980 hPa limit reads 0.34 at 1013, 0.6 at 1000, 0.8 at 990
      if (th.op === 'lte') { const ref = Math.max(g.hi, th.value + 30); return Math.max(0, (ref - value) / (ref - th.value)); }
      const ref = Math.min(g.lo, th.value - 30); return Math.max(0, (value - ref) / (th.value - ref));
    }
    if (g && g.span) return Math.max(0, th.op === 'gte' ? 1 - (th.value - value) / g.span : 1 - (value - th.value) / g.span);
    if (th.op === 'gte') return th.value > 0 ? value / th.value : (value >= th.value ? 1 : 0);
    // "falls to": closeness grows as the value drops towards the limit (visibility, pressure tendency…)
    if (th.value > 0) return value <= 0 ? 1.2 : th.value / value;
    if (th.value < 0) return value >= 0 ? 0 : value / th.value; // both negative (e.g. −4 hPa/3h)
    return value <= 0 ? 1 : 0;
  }
  // App palette only: green (ok) → amber (warning) → red (critical)
  function gradeColor(r) {
    const ok = [126, 224, 129], warn = [240, 178, 58], crit = [255, 107, 98];
    const mix = (a, b, f) => a.map((x, i) => Math.round(x + (b[i] - x) * f));
    let c;
    if (r <= 0.3) c = ok;
    else if (r < 0.7) c = mix(ok, warn, (r - 0.3) / 0.4);
    else if (r < 1) c = mix(warn, crit, (r - 0.7) / 0.3);
    else c = crit;
    return c;
  }
  function applyCardStates() {
    const p = planShipPoint() || pointById(state.selectedId);
    if (!p) return;
    const v = currentValues(p.id);
    const mode = state.s.widgetColor || 'off';
    const shiftedView = isShifted();
    document.querySelectorAll('#metricsGrid .card').forEach((card) => {
      const id = card.dataset.metric;
      const al = shiftedView ? [] : state.alarms.filter((a) => a.pointId === p.id && a.metric === id);
      let crit = al.find((a) => a.level === 'critical'); const warn = al.find((a) => a.level === 'warning');
      if (shiftedView && v) { const thx = thresholdFor(id, p.id); const vx = metricAt(id, p, v, viewTime()); if (thx && vx !== null && vx !== undefined && A.exceeds(thx.op, vx, thx.value)) crit = true; }
      card.classList.toggle('critical', Boolean(crit));
      card.classList.toggle('warning', !crit && Boolean(warn));
      // value-graded colouring
      card.classList.remove('wc-value', 'wc-bg');
      card.style.removeProperty('--wc'); card.style.removeProperty('--wc-bg');
      const thc = thresholdFor(id, p.id);
      if (mode !== 'off' && thc && v && !crit) {
        const val = metricAt(id, p, v, viewTime());
        const r = limitRatio(id, val, thc);
        if (r !== null) {
          const [cr, cg, cb] = gradeColor(r);
          const alpha = (0.06 + Math.min(1, Math.max(0, r)) * 0.22).toFixed(2);
          card.style.setProperty('--wc', `rgb(${cr},${cg},${cb})`);
          card.style.setProperty('--wc-bg', `rgba(${cr},${cg},${cb},${alpha})`);
          card.classList.add(mode === 'bg' ? 'wc-bg' : 'wc-value');
        }
      }
      const badge = card.querySelector('[data-badge]');
      if (!badge) return;
      const th = thresholdFor(id, p.id);
      if (th) { const f = fmtMetric(id, th.value); badge.textContent = `${opSym(th.op)}${f.text}`; }
      else badge.textContent = badge.classList.contains('editable') ? '—' : '';
      if (warn && !crit) badge.textContent += ` · ${fmtEtaClock(warn.eta)}`;
    });
  }

  function renderAlarms() {
    // banner (home)
    const un = state.alarms.filter((a) => !state.acked.has(a.key));
    const banner = $('alarmBanner');
    if (un.length && !state.crit.open) {
      const top = un[0]; const d = describe(top);
      banner.hidden = false; banner.classList.toggle('warning', top.level !== 'critical');
      $('alarmLevel').textContent = top.level === 'critical' ? t('level_critical') : t('level_warning');
      $('alarmBody').textContent = d.body;
      const rest = un.length - 1; const w = un.filter((a) => a.level === 'warning' && a !== top).length;
      $('alarmMore').textContent = rest ? (w === rest ? t('more_warnings', { n: w }) : t('more_alarms', { n: rest })) : '';
    } else banner.hidden = true;
    if (state.view === 'alarms') renderAlarmsView();
  }

  function renderAlarmsView() {
    const list = $('alarmList');
    list.innerHTML = '';
    const c = state.alarms.filter((a) => a.level === 'critical').length, w = state.alarms.length - c;
    $('alarmCount').textContent = pad2(state.alarms.length);
    $('alarmSummary').textContent = t('alarms_summary', { c, w, lead: state.s.leadMin });
    if (!state.alarms.length) list.innerHTML = `<div class="al-empty">${t('alarms_none')}</div>`;
    state.alarms.forEach((a) => {
      const p = pointById(a.pointId); const d = describe(a); const isAcked = state.acked.has(a.key);
      const val = fmtMetric(a.metric, a.value), lim = fmtMetric(a.metric, a.limit);
      const el = document.createElement('div');
      el.className = `al ${a.level} ${isAcked ? 'acked' : ''}`;
      el.innerHTML = `<span class="lvl"></span><div><div class="pt"></div><div class="rule"></div></div><div class="val">${val.text} <span class="lim">/ ${lim.text} ${lim.unit}</span></div><div class="eta"></div><div>${isAcked ? '' : `<button class="lbl-btn">${t('ack')}</button>`}</div>`;
      el.querySelector('.lvl').textContent = isAcked ? t('acked') : a.level === 'critical' ? t('st_crit') : t('st_warn');
      el.querySelector('.pt').textContent = p ? p.name : a.pointId;
      el.querySelector('.rule').textContent = d.rule + (isAcked && state.ackedAt[a.key] ? ` · ${t('acknowledged_at', { t: fmtTime(state.ackedAt[a.key]) })}` : '');
      el.querySelector('.eta').textContent = a.level === 'critical' ? t('now') : `${fmtEtaClock(a.eta)} · ${fmtTime(a.at)}`;
      const b = el.querySelector('button'); if (b) b.addEventListener('click', (ev) => { ev.stopPropagation(); ack(a.key); });
      el.addEventListener('click', () => { select(a.pointId); setView('home'); });
      list.appendChild(el);
    });
    // timeline
    const axis = $('tlAxis'); axis.innerHTML = '';
    $('tlHead').textContent = t('timeline', { lead: state.s.leadMin });
    const now = Date.now(), lead = state.s.leadMin * 60e3, H = 320;
    const mk = (top, cls, txt) => { const e = document.createElement('div'); e.className = cls; e.style.top = `${top}px`; e.textContent = txt; axis.appendChild(e); };
    const tick = (top) => { const e = document.createElement('div'); e.className = 'tick'; e.style.top = `${top}px`; axis.appendChild(e); };
    tick(0); mk(0, 'tm now', fmtClock(now));
    let lastTop = -100;
    state.alarms.slice(0, 8).forEach((a) => {
      const p = pointById(a.pointId); const top = Math.min(H - 8, (a.eta / lead) * H);
      const lim = fmtMetric(a.metric, a.limit);
      tick(top);
      if (a.eta > 0 && top - lastTop > 14) mk(top, 'tm', fmtClock(a.at));
      mk(top + (a.eta === 0 ? 0 : 0), `ev ${a.level}`, `${a.level === 'critical' ? '●' : '▲'} ${(p ? p.name : '').toUpperCase()} · ${mShort(a.metric)} ${a.level === 'critical' ? t('exceeded') : `${opSym(a.op)} ${lim.text} ${lim.unit}`}`);
      lastTop = top;
    });
    tick(H); mk(H, 'tm end', fmtClock(now + lead)); mk(H, 'ev end', t('lead_end'));
    renderHazardStrip();
  }
  // 24 hourly cells per point coloured by the sea-state hazard index; a red frame marks hours with any limit exceeded
  function renderHazardStrip() {
    const rows = $('hzRows'); rows.innerHTML = '';
    const t0 = Math.floor(Date.now() / 3600e3) * 3600e3;
    $('hzTicks').innerHTML = [0, 6, 12, 18, 24].map((h) => `<span>${fmtClock(t0 + h * 3600e3)}</span>`).join('');
    const withFc = state.s.points.filter((p) => state.forecasts[p.id]);
    if (!withFc.length) { rows.innerHTML = `<div class="hz-empty">${t('hz_strip_none')}</div>`; return; }
    withFc.forEach((p) => {
      const fc = state.forecasts[p.id], ctx = ctxFor(p);
      let max = 0, cells = '';
      for (let h = 0; h < 24; h++) {
        const tm = t0 + h * 3600e3 + 1800e3; // middle of the hour
        const hz = U.seaHazard(fc.hours, tm, ctx);
        const over = forecastLevel(p, tm) === 'critical';
        if (!hz) { cells += `<div class="hz-cell na" title="${fmtClock(tm)} · —"></div>`; continue; }
        max = Math.max(max, hz.score);
        const [r, g, b] = gradeColor(hz.score / 100);
        const alpha = (0.12 + 0.7 * hz.score / 100).toFixed(2);
        const reason = hz.parts.length ? hz.parts.slice(0, 2).map(hazardReason).join(' · ') : t(`hz_${hz.cls}`);
        cells += `<div class="hz-cell${over ? ' x' : ''}" style="--c: rgba(${r},${g},${b},${alpha})" title="${fmtClock(tm)} · ${hz.score} % · ${reason}${over ? ' · ' + forecastCritText(p, tm) : ''}"></div>`;
      }
      const row = document.createElement('div');
      row.className = 'hz-row';
      row.innerHTML = `<span class="nm"></span><div class="hz-cells">${cells}</div><span class="mx">${t('hz_max')} ${max}</span>`;
      row.querySelector('.nm').textContent = p.name;
      row.addEventListener('click', () => { select(p.id); setView('home'); });
      rows.appendChild(row);
    });
  }

  // ------------------------------------------------------------------ points
  function select(id) { state.selectedId = id; state.plan.focus = false; renderPoints(); renderSelected(); renderMapStates(); renderTimebar(); }
  function addPoint(name, lat, lon) {
    if (state.s.points.length >= MAX_POINTS) { toast(t('max_points', { n: MAX_POINTS }), 'err'); return false; }
    if (!map.inRegion(lat, lon)) { toast(t('outside_region', { r: map.region().name }), 'err'); return false; }
    const p = { id: uid(), name: name || t('point_default', { n: state.s.points.length + 1 }), lat, lon };
    state.s.points.push(p); save(); state.selectedId = p.id; renderAll();
    if (map) map.flyTo(lon, lat, 3);
    refresh('auto');
    return true;
  }
  function removePoint(id) {
    const p = pointById(id);
    state.s.points = state.s.points.filter((x) => x.id !== id);
    delete state.forecasts[id];
    if (state.selectedId === id) state.selectedId = state.s.points.length ? state.s.points[0].id : null;
    save(); evaluateAlarms(); renderAll();
    if (p) toast(t('removed', { name: p.name }));
  }

  // ------------------------------------------------------------------ add-point modal
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (ev) => { if (ev.target === m) m.hidden = true; }));
  document.addEventListener('keydown', (ev) => {
    if (state.crit.open) {
      if (ev.key === 'Escape') { ev.preventDefault(); snoozeCrit(); return; }
      if (ev.key === 'Enter') { ev.preventDefault(); ackCrit(); return; }
    }
    if (ev.key === 'Escape') { document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; }); closeLimitEditor(); if (map && state.ruler.on) map.clearMeasure(); if (map && state.plan.on) map.cancelDrawing(); }
  });
  function openAddPoint(prefill) {
    $('ptName').value = '';
    $('ptCoords').value = prefill ? `${prefill.lat.toFixed(4)}, ${prefill.lon.toFixed(4)}` : '';
    $('ptCoords').classList.remove('invalid');
    validateCoordsInput(); openModal('modalPoint');
    setTimeout(() => $('ptName').focus(), 50);
  }
  function validateCoordsInput() {
    const c = U.parseCoords($('ptCoords').value); const hint = $('ptCoordsHint'); const r = map.region();
    if (!$('ptCoords').value.trim()) { hint.textContent = t('coords_hint', { win: `${U.fmtLat(r.latMin)}–${U.fmtLat(r.latMax)}, ${U.fmtLon(r.lonMin)}–${U.fmtLon(r.lonMax)}` }); $('ptCoords').classList.remove('invalid'); return null; }
    if (!c) { hint.textContent = t('coords_bad'); $('ptCoords').classList.add('invalid'); return null; }
    if (!map.inRegion(c.lat, c.lon)) { hint.textContent = t('coords_outside', { c: `${U.fmtLat(c.lat)} ${U.fmtLon(c.lon)}`, r: r.name }); $('ptCoords').classList.add('invalid'); return null; }
    hint.textContent = `${U.fmtLat(c.lat)}  ${U.fmtLon(c.lon)}`; $('ptCoords').classList.remove('invalid');
    return c;
  }
  $('ptCoords').addEventListener('input', validateCoordsInput);
  $('ptCoords').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('btnSavePoint').click(); });
  $('btnSavePoint').addEventListener('click', () => { const c = validateCoordsInput(); if (!c) return; if (addPoint($('ptName').value.trim(), c.lat, c.lon)) closeModal('modalPoint'); });
  $('btnAddPoint').addEventListener('click', () => openAddPoint(null));
  $('btnRemovePoint').addEventListener('click', () => { if (state.selectedId) removePoint(state.selectedId); });
  $('btnFly').addEventListener('click', () => { const p = pointById(state.selectedId); if (p && map) map.flyTo(p.lon, p.lat, 4); });
  $('btnRefresh').addEventListener('click', () => refresh('manual'));
  $('btnAckAll').addEventListener('click', ackAll); $('btnAckAll2').addEventListener('click', ackAll);
  $('btnMute').addEventListener('click', () => { state.s.muted = !state.s.muted; save(); updateAudio(); renderStatus(); toast(state.s.muted ? t('muted_on') : t('muted_off')); });
  $('btnAlarmsView').addEventListener('click', () => setView('alarms'));
  $('btnBackHome').addEventListener('click', () => setView('home'));
  $('alarmBanner').addEventListener('click', (ev) => { if (ev.target.closest('button')) return; setView('alarms'); });

  // ------------------------------------------------------------------ 2A critical thresholds pop-up
  function critUnacked() { return state.alarms.filter((a) => a.level === 'critical' && !state.acked.has(a.key)); }
  function updateCritPopup() {
    const c = state.crit, now = Date.now();
    const crits = critUnacked();
    if (!crits.length) { if (c.open) closeCrit(); c.snoozedKeys.clear(); return; }
    const snoozed = c.snoozedUntil > now && crits.every((a) => c.snoozedKeys.has(a.key));
    if (!c.open && !snoozed) openCrit();
    else if (c.open) renderCritRows();
  }
  function openCrit() {
    const c = state.crit;
    c.open = true; c.raisedAt = Date.now(); c.shownKeys = new Set(); c.snoozedUntil = 0;
    const layer = $('critLayer'); layer.hidden = false; layer.classList.remove('closing');
    document.body.classList.add('crit-open');
    renderCritRows(true);
    setTimeout(() => $('critAck').focus(), 700);
  }
  function closeCrit() {
    const c = state.crit; if (!c.open) return;
    c.open = false;
    const layer = $('critLayer'); layer.classList.add('closing');
    document.body.classList.remove('crit-open');
    setTimeout(() => { layer.hidden = true; layer.classList.remove('closing'); }, 220);
    renderAlarms();
  }
  function ackCrit() { ackAll(); closeCrit(); }
  function snoozeCrit() {
    const c = state.crit;
    c.snoozedUntil = Date.now() + 10 * 60e3;
    c.snoozedKeys = new Set(critUnacked().map((a) => a.key));
    closeCrit(); updateAudio(); toast(t('crit_snoozed'));
    setTimeout(() => { evaluateAlarms(); renderAlarms(); }, 10 * 60e3 + 500);
  }
  function renderCritRows(initial) {
    const c = state.crit;
    const list = [...state.alarms].sort((a, b) => (a.level === b.level ? a.eta - b.eta : a.level === 'critical' ? -1 : 1));
    const crits = list.filter((a) => a.level === 'critical').length, warns = list.length - crits;
    $('critSummary').textContent = t('crit_summary', { c: crits, w: warns });
    const r = shifted(c.raisedAt);
    $('critRaised').innerHTML = `${t('crit_raised')} ${pad2(r.getUTCHours())}:${pad2(r.getUTCMinutes())}<span class="dim">:${pad2(r.getUTCSeconds())}</span>${tzSuffix()}`;
    const e = shifted(Date.now());
    $('critEngine').textContent = t('crit_engine', { t: `${pad2(e.getUTCHours())}:${pad2(e.getUTCMinutes())}:${pad2(e.getUTCSeconds())}${tzSuffix()}` });
    $('critStatusText').textContent = state.s.sound && !state.s.muted ? t('crit_status_on') : t('crit_status_muted');
    const wrap = $('critRows');
    const existing = new Map([...wrap.children].map((el) => [el.dataset.key, el]));
    const frag = document.createDocumentFragment();
    let order = 0;
    list.forEach((a) => {
      const p = pointById(a.pointId); const fc = state.forecasts[a.pointId];
      const val = fmtMetric(a.metric, a.value), lim = fmtMetric(a.metric, a.limit);
      const isAcked = state.acked.has(a.key);
      let row = existing.get(a.key);
      const fresh = !row;
      if (!row) { row = document.createElement('div'); row.dataset.key = a.key; }
      row.className = `crit-row ${a.level} ${isAcked ? 'acked' : ''} ${fresh ? 'anim' : ''}`;
      if (fresh) row.style.animationDelay = initial ? `${650 + order * 100}ms` : '0ms';
      let status = '', sub = '';
      if (a.level === 'critical') {
        const delta = a.value - a.limit; const df = fmtMetric(a.metric, Math.abs(delta));
        status = `${t('crit_exceeded')} · ${delta >= 0 ? '+' : '−'}${df.text}`;
        const pk = fc ? A.peak(fc.hours, a.metric.startsWith('d_') ? 'pressure' : a.metric, Date.now(), 24 * 3600e3, a.op) : null;
        if (pk && !a.metric.startsWith('d_')) { const pf = fmtMetric(a.metric, pk.v); sub = t('crit_peak', { v: `${pf.text} ${pf.unit}`, t: fmtTime(pk.t) }); }
        else if (a.metric === 'd_pressureTendency' && fc) { const pr = fmtMetric('pressure', A.valueAt(fc.hours, 'pressure', Date.now())); sub = `${pr.text} ${pr.unit}`; }
      } else {
        status = t('crit_eta', { eta: fmtEtaClock(a.eta), t: fmtTime(a.at) });
        const cur = fc ? A.seriesValue(fc.hours, a.metric, Date.now(), p && p.lat, p ? ctxFor(p) : undefined) : null;
        const cf = fmtMetric(a.metric, cur);
        sub = t('crit_now', { v: `${cf.text} ${cf.unit}`, lead: state.s.leadMin });
      }
      row.innerHTML = `<span class="lvl">${a.level === 'critical' ? t('st_crit') : t('st_warn')}</span>
        <div class="pt"><div class="nm"></div><div class="sub"></div></div>
        <div class="val"><span class="${a.level === 'critical' && fresh ? 'count' : ''}" style="${a.level === 'critical' && fresh ? `animation-delay:${initial ? 900 + order * 100 : 100}ms` : ''}">${val.text}</span> <span class="lim">/ ${lim.text} ${lim.unit}</span></div>
        <div class="st"><div class="s1">${status}</div><div class="s2">${sub}</div></div>`;
      row.querySelector('.nm').textContent = p ? p.name : a.pointId;
      row.querySelector('.sub').textContent = `${mLabel(a.metric)} · ${opSym(a.op)} ${lim.text} ${lim.unit}${p ? ` · ${U.fmtLat(p.lat)} ${U.fmtLon(p.lon)}` : ''}`;
      row.addEventListener('click', () => { select(a.pointId); });
      frag.appendChild(row); order++;
      c.shownKeys.add(a.key);
    });
    wrap.innerHTML = ''; wrap.appendChild(frag);
  }
  $('critAck').addEventListener('click', ackCrit);
  $('critSnooze').addEventListener('click', snoozeCrit);
  $('critClose').addEventListener('click', snoozeCrit);
  $('critChart').addEventListener('click', () => {
    const first = critUnacked()[0] || state.alarms[0];
    if (!first) return;
    const p = pointById(first.pointId);
    closeCrit(); setView('home'); select(first.pointId);
    if (p && map) map.flyTo(p.lon, p.lat, 4);
  });

  // ------------------------------------------------------------------ inline limit editor
  function openLimitEditor(metricId, card) {
    closeLimitEditor();
    const m = BY_ID[metricId], p = pointById(state.selectedId), unit = U.unitFor(m.kind, state.s.units);
    const existing = state.s.thresholds.find((x) => x.metric === metricId && (!x.pointIds.length || (p && x.pointIds.includes(p.id))));
    const pop = document.createElement('div');
    pop.className = 'limit-pop';
    pop.innerHTML = `<div class="lp-title">${t('lp_title', { m: mLabel(metricId) })}</div>
      <div class="lp-row"><select class="lp-op"><option value="gte">${t('op_gte')}</option><option value="lte">${t('op_lte')}</option></select><input class="lp-val" type="number" step="any" /><span class="lp-unit">${unit.label}</span></div>
      <label class="check"><input type="checkbox" class="lp-point" /><i></i><span>${t('lp_only', { p: p ? p.name : '' })}</span></label>
      <div class="lp-actions"><button class="lbl-btn lp-remove" type="button" ${existing ? '' : 'hidden'}>${t('lp_remove')}</button><span class="lp-gap"></span><button class="lbl-btn lp-cancel" type="button">${t('cancel')}</button><button class="lbl-btn solid lp-save" type="button">${existing ? t('lp_save') : t('lp_add')}</button></div>`;
    const op = pop.querySelector('.lp-op'), val = pop.querySelector('.lp-val'), scope = pop.querySelector('.lp-point');
    if (existing) { op.value = existing.op; val.value = String(+unit.f(existing.value).toFixed(2)); scope.checked = existing.pointIds.length > 0; }
    else { op.value = m.kind === 'vis' || metricId === 'd_pressureTendency' ? 'lte' : 'gte'; const v = currentValues(state.selectedId); const cur = v ? (metricId.startsWith('d_') ? U.derivedValue(metricId, v, p && p.lat) : v[metricId]) : null; if (cur !== null && cur !== undefined) val.value = String(+unit.f(cur).toFixed(1)); }
    const commit = () => {
      const raw = parseFloat(val.value);
      if (Number.isNaN(raw)) { val.classList.add('invalid'); val.focus(); return; }
      const canonical = unit.inv(raw), pointIds = scope.checked && p ? [p.id] : [];
      if (existing) { existing.op = op.value; existing.value = canonical; existing.pointIds = pointIds; existing.enabled = true; }
      else state.s.thresholds.push({ id: uid(), metric: metricId, op: op.value, value: canonical, enabled: true, pointIds });
      save(); closeLimitEditor(); evaluateAlarms(); renderAll();
      const f = fmtMetric(metricId, canonical);
      toast(t('lp_applied', { m: mLabel(metricId), op: opSym(op.value), v: `${f.text} ${f.unit}` }), 'ok');
    };
    pop.querySelector('.lp-save').addEventListener('click', commit);
    val.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); });
    pop.querySelector('.lp-cancel').addEventListener('click', closeLimitEditor);
    pop.querySelector('.lp-remove').addEventListener('click', () => { state.s.thresholds = state.s.thresholds.filter((x) => x !== existing); save(); closeLimitEditor(); evaluateAlarms(); renderAll(); toast(t('lp_removed', { m: mLabel(metricId) })); });
    pop.addEventListener('click', (ev) => ev.stopPropagation());
    // Render above the strip in a fixed layer: the strip clips overflow, so an in-card popover is invisible.
    const r = card.getBoundingClientRect();
    const w = Math.max(300, r.width);
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    pop.style.width = `${w}px`;
    pop.style.bottom = `${window.innerHeight - r.top + 6}px`;
    document.body.appendChild(pop); card.classList.add('editing');
    setTimeout(() => { val.focus(); val.select(); }, 30);
    setTimeout(() => document.addEventListener('click', closeLimitEditor, { once: true }), 0);
    $('metricsGrid').addEventListener('scroll', closeLimitEditor, { once: true });
  }
  function closeLimitEditor() {
    document.querySelectorAll('.limit-pop').forEach((el) => el.remove());
    document.querySelectorAll('#metricsGrid .card.editing').forEach((el) => el.classList.remove('editing'));
  }

  // ------------------------------------------------------------------ settings view
  function openSettings() {
    const s = state.s;
    state.settingsDraft = JSON.parse(JSON.stringify({ thresholds: s.thresholds }));
    $('setProvider').value = s.provider; $('setRefresh').value = String(s.refreshMin); $('setSgSource').value = s.sgSource; $('setCoordPrec').value = String(s.coordPrecision || 0.05);
    $('setProjection').value = s.projection; $('setLang').value = s.lang;
    renderTzOptions(); $('setTz').value = String(s.tz); $('setLayout').value = s.layout || 'side'; $('setWidgetColor').value = s.widgetColor || 'off';
    $('setCurrentsDensity').value = s.currentsDensity || 'coarse'; renderDensityHint();
    $('setApiKey').value = ''; $('setApiKey').placeholder = state.hasKey ? t('apikey_stored') : t('apikey_ph');
    $('setLead').value = s.leadMin; $('setLeadOut').textContent = `${s.leadMin} MIN`;
    $('setVolume').value = s.volume; $('setVolumeOut').textContent = `${s.volume} %`;
    $('setSound').checked = s.sound; $('setNotify').checked = s.notify; $('setFlash').checked = s.flash;
    $('unitSpeed').value = s.units.speed; $('unitLength').value = s.units.length; $('unitTemp').value = s.units.temp; $('unitVis').value = s.units.vis;
    renderMetricPicker(); renderThresholdList(); renderThresholdAdd(); renderBudget();
    setView('settings');
  }
  $('btnSettings').addEventListener('click', openSettings);
  $('btnCancelSettings').addEventListener('click', () => { if (state.settingsDraft) state.s.thresholds = state.settingsDraft.thresholds; state.settingsDraft = null; setView('home'); });
  document.querySelectorAll('#settingsTabs .tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('#settingsTabs .tab').forEach((x) => x.classList.toggle('active', x === tab));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
  }));
  $('setProvider').addEventListener('change', () => { renderBudget(); renderMetricPicker(); });
  $('setRefresh').addEventListener('change', renderBudget);
  $('setLead').addEventListener('input', () => { $('setLeadOut').textContent = `${$('setLead').value} MIN`; });
  $('setVolume').addEventListener('input', () => { $('setVolumeOut').textContent = `${$('setVolume').value} %`; WA.audio.setVolume($('setVolume').value / 100); });
  $('btnTestWarn').addEventListener('click', () => WA.audio.play('warning'));
  $('btnTestCrit').addEventListener('click', () => WA.audio.play('critical'));
  $('setLang').addEventListener('change', () => { applyLanguage($('setLang').value); renderMetricPicker(); renderThresholdList(); renderThresholdAdd(); renderBudget(); const cur = $('setTz').value; renderTzOptions(); $('setTz').value = cur; });

  function renderTzOptions() {
    const sel = $('setTz');
    const localOff = -new Date().getTimezoneOffset();
    const offs = [-720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 540, 570, 600, 630, 660, 720, 765, 780, 840];
    sel.innerHTML = `<option value="local">${t('tz_local', { z: tzLabel(localOff) })}</option>` + offs.map((o) => `<option value="${o}">${tzLabel(o)}${o === 180 ? ' — ' + t('tz_default') : ''}</option>`).join('');
  }
  function renderDensityHint() {
    const key = $('setCurrentsDensity').value; const d = DENSITY[key] || DENSITY.coarse;
    const n = latticeFor(key).length;
    $('densityHint').textContent = t('density_hint', { n, h: d.hours, calls: n * Math.round(24 / d.hours) });
  }
  $('setCurrentsDensity').addEventListener('change', renderDensityHint);
  function renderBudget() {
    const prov = $('setProvider').value, every = Number($('setRefresh').value), n = Math.max(1, state.s.points.length), perDay = Math.round(1440 / every);
    const box = $('budgetBox');
    $('sgFields').hidden = prov !== 'stormglass';
    if (prov === 'stormglass') {
      const calls = n * perDay, quota = state.quota ? state.quota.quota : 10;
      box.classList.toggle('over', calls > quota);
      box.innerHTML = t('budget_sg', { n, per: perDay, calls, quota, plan: state.quota ? '' : t('budget_sg_plan'), over: calls > quota ? t('budget_over') : '' });
    } else { box.classList.remove('over'); box.innerHTML = t('budget_om', { calls: 2 * perDay }); }
  }
  function renderMetricPicker() {
    const prov = $('setProvider').value, wrap = $('metricPicker');
    const checked = new Set([...wrap.querySelectorAll('input[data-mid]:checked')].map((i) => i.dataset.mid));
    const useCurrent = wrap.children.length > 0;
    wrap.innerHTML = '';
    WA.GROUP_ORDER.forEach((g) => {
      const items = [...METRICS, ...DERIVED].filter((m) => m.group === g);
      if (!items.length) return;
      const grp = document.createElement('div'); grp.className = 'mp-group';
      grp.innerHTML = `<h4>${I.word('groups', g)}</h4><div class="mp-items"></div>`;
      items.forEach((m) => {
        const has = m.id.startsWith('d_') ? true : prov === 'stormglass' ? Boolean(m.sg) : Boolean(m.om);
        const u = U.unitFor(m.kind, state.s.units);
        const on = useCurrent ? checked.has(m.id) : state.s.display.includes(m.id);
        const lab = document.createElement('label'); lab.className = `mp-item ${has ? '' : 'na'}`;
        lab.innerHTML = `<input type="checkbox" data-mid="${m.id}" ${on ? 'checked' : ''}/><span class="g"></span><span>${mLabel(m.id)}</span><span class="u">${m.kind === 'text' ? '' : u.label}</span>`;
        lab.title = has ? '' : t('metric_na');
        grp.querySelector('.mp-items').appendChild(lab);
      });
      wrap.appendChild(grp);
    });
  }
  function thresholdable() { return [...METRICS, ...DERIVED].filter((m) => m.threshold && m.kind !== 'text'); }
  function renderThresholdAdd() {
    const sel = $('thMetric');
    sel.innerHTML = thresholdable().map((m) => `<option value="${m.id}">${mLabel(m.id)}</option>`).join('');
    const upd = () => { const m = BY_ID[sel.value]; $('thUnit').textContent = U.unitFor(m.kind, state.s.units).label; };
    sel.onchange = upd; upd();
  }
  function renderThresholdList() {
    const list = $('thresholdList'); list.innerHTML = '';
    if (!state.s.thresholds.length) list.innerHTML = `<div class="th-empty">${t('no_thresholds')}</div>`;
    state.s.thresholds.forEach((x) => {
      const m = BY_ID[x.metric]; if (!m) return;
      const f = U.fmt(m.kind, x.value, state.s.units);
      const el = document.createElement('div'); el.className = `th-row ${x.enabled ? '' : 'off'}`;
      el.innerHTML = `<label class="check"><input type="checkbox" ${x.enabled ? 'checked' : ''}/><i></i></label><span class="name">${mLabel(x.metric)}</span><span class="rule">${x.op === 'lte' ? t('op_lte') : t('op_gte')} ${f.text} ${f.unit}</span>` +
        `<span class="scope"><select><option value="">${t('all_points')}</option>${state.s.points.map((p) => `<option value="${p.id}" ${x.pointIds.includes(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}</select></span>` +
        `<button class="rm" type="button">${t('remove')}</button>`;
      el.querySelector('input').addEventListener('change', (ev) => { x.enabled = ev.target.checked; el.classList.toggle('off', !x.enabled); });
      el.querySelector('select').addEventListener('change', (ev) => { x.pointIds = ev.target.value ? [ev.target.value] : []; });
      el.querySelector('.rm').addEventListener('click', () => { state.s.thresholds = state.s.thresholds.filter((y) => y.id !== x.id); renderThresholdList(); });
      list.appendChild(el);
    });
  }
  $('btnAddThreshold').addEventListener('click', () => {
    const m = BY_ID[$('thMetric').value]; const raw = parseFloat($('thValue').value);
    if (!m || Number.isNaN(raw)) { toast(t('enter_limit'), 'err'); return; }
    state.s.thresholds.push({ id: uid(), metric: m.id, op: $('thOp').value, value: U.unitFor(m.kind, state.s.units).inv(raw), enabled: true, pointIds: [] });
    $('thValue').value = ''; renderThresholdList();
  });
  $('btnSaveSettings').addEventListener('click', async () => {
    const s = state.s;
    const prevProj = s.projection, prevProvider = s.provider, prevUnits = JSON.stringify(s.units);
    s.provider = $('setProvider').value; s.refreshMin = Number($('setRefresh').value); s.sgSource = $('setSgSource').value;
    const prevPrec = s.coordPrecision; s.coordPrecision = Number($('setCoordPrec').value) || 0.05;
    s.projection = $('setProjection').value; s.lang = $('setLang').value;
    s.tz = $('setTz').value === 'local' ? 'local' : Number($('setTz').value);
    s.leadMin = Number($('setLead').value); s.volume = Number($('setVolume').value);
    s.sound = $('setSound').checked; s.notify = $('setNotify').checked; s.flash = $('setFlash').checked;
    s.units = { speed: $('unitSpeed').value, length: $('unitLength').value, temp: $('unitTemp').value, vis: $('unitVis').value };
    const picked = [...document.querySelectorAll('#metricPicker input[data-mid]:checked')].map((i) => i.dataset.mid);
    s.display = [...s.display.filter((id) => picked.includes(id)), ...picked.filter((id) => !s.display.includes(id))];
    const prevLayout = s.layout; s.layout = $('setLayout').value; s.widgetColor = $('setWidgetColor').value;
    const prevDensity = s.currentsDensity; s.currentsDensity = $('setCurrentsDensity').value;
    const key = $('setApiKey').value.trim();
    if (key) { await window.bridge.setApiKey(key); state.hasKey = true; }
    if (s.provider === 'stormglass' && !state.hasKey) { toast(t('sg_needs_key'), 'err'); return; }
    WA.audio.setVolume(s.volume / 100);
    applyLanguage(s.lang);
    if (prevProj !== s.projection) { map.setProjection(s.projection); applyLayers(); }
    if (prevLayout !== s.layout) applyLayout();
    if (prevDensity !== s.currentsDensity && s.layers.currents) refreshCurrents(true);
    state.settingsDraft = null;
    save(); schedule(); setView('home');
    if (prevProvider !== s.provider || key || prevPrec !== s.coordPrecision) { state.forecasts = {}; state.quota = null; state.plan.key = null; }
    if (prevUnits !== JSON.stringify(s.units)) state.lastShown = {};
    evaluateAlarms(); renderAll(); invalidateRouteColors(); map.setRouteColor(routeColorAt);
    if (prevProvider !== s.provider || key || prevPrec !== s.coordPrecision || !state.lastRefresh) refresh('auto');
    toast(t('settings_applied'), 'ok');
  });

  // ------------------------------------------------------------------ provider quick-pick (top bar)
  const PROVIDER_OPTIONS = [
    { provider: 'openmeteo', source: 'sg', label: 'OPEN-METEO' },
    { provider: 'stormglass', source: 'sg', label: 'STORMGLASS · SG' },
    { provider: 'stormglass', source: 'ecmwf', label: 'STORMGLASS · ECMWF' },
    { provider: 'stormglass', source: 'noaa', label: 'STORMGLASS · NOAA' },
    { provider: 'stormglass', source: 'metno', label: 'STORMGLASS · MET NORWAY' },
    { provider: 'stormglass', source: 'meteo', label: 'STORMGLASS · MÉTÉO-FRANCE' },
    { provider: 'stormglass', source: 'dwd', label: 'STORMGLASS · DWD' },
    { provider: 'stormglass', source: 'meto', label: 'STORMGLASS · UK MET OFFICE' }
  ];
  function renderProviderMenu() {
    const menu = $('providerMenu');
    menu.innerHTML = '';
    PROVIDER_OPTIONS.forEach((o) => {
      const b = document.createElement('button'); b.type = 'button';
      const active = state.s.provider === o.provider && (o.provider === 'openmeteo' || state.s.sgSource === o.source);
      b.className = `pm-item ${active ? 'active' : ''}`;
      b.textContent = o.label;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); menu.hidden = true; chooseProvider(o); });
      menu.appendChild(b);
    });
  }
  async function chooseProvider(o) {
    if (o.provider === 'stormglass' && !state.hasKey) { toast(t('sg_needs_key'), 'err'); openSettings(); return; }
    const changed = state.s.provider !== o.provider || state.s.sgSource !== o.source;
    state.s.provider = o.provider; state.s.sgSource = o.source; save();
    if (changed) { state.forecasts = {}; state.quota = null; renderStatus(); renderSelected(); toast(t('provider_switched', { p: o.label }), 'ok'); refresh('auto'); }
  }
  $('pillProvider').addEventListener('click', (ev) => {
    ev.stopPropagation(); renderProviderMenu();
    const m = $('providerMenu'), r = $('pillProvider').getBoundingClientRect();
    m.style.left = `${Math.round(r.left)}px`; m.style.top = `${Math.round(r.bottom + 6)}px`;
    m.hidden = !m.hidden;
  });
  $('providerMenu').addEventListener('click', (ev) => ev.stopPropagation());
  $('pillProvider').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('pillProvider').click(); } });
  document.addEventListener('click', () => { $('providerMenu').hidden = true; });

  // ------------------------------------------------------------------ map layer: surface currents
  function applyLayers() {
    map.setLayer('currents', state.s.layers.currents);
    $('btnLayerCurrents').classList.toggle('on', state.s.layers.currents);
    if (state.s.layers.currents) refreshCurrents();
    renderCurrentsMeta();
  }
  $('btnLayerCurrents').addEventListener('click', () => { state.s.layers.currents = !state.s.layers.currents; save(); applyLayers(); });
  // Lattice of sea points over the map window, kept off the land with the coastline mask. Density is a setting:
  // coarse ~1.0x0.6 deg (~90 pts), medium ~0.5x0.3 (~360), fine ~0.25x0.15 (~1400). Each point is one API call.
  const DENSITY = { coarse: { dlon: 1.0, dlat: 0.6, hours: 3, scale: 1 }, medium: { dlon: 0.5, dlat: 0.3, hours: 3, scale: 0.7 }, fine: { dlon: 0.25, dlat: 0.15, hours: 6, scale: 0.5 } };
  function densityCfg() { return DENSITY[state.s.currentsDensity] || DENSITY.coarse; }
  function latticeFor(key) {
    const r = map.region(); const d = DENSITY[key] || DENSITY.coarse; const pts = [];
    for (let lat = r.latMin + d.dlat / 2; lat < r.latMax; lat += d.dlat) for (let lon = r.lonMin + d.dlon / 2; lon < r.lonMax; lon += d.dlon) if (map.isSea(lon, lat)) pts.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
    return pts;
  }
  function currentsLattice() { return latticeFor(state.s.currentsDensity); }
  async function refreshCurrents(force) {
    const c = state.currents;
    if (c.busy) return;
    if (!force && c.grid && c.density === state.s.currentsDensity && Date.now() - c.fetchedAt < densityCfg().hours * 3600e3) { renderCurrentVectors(); return; }
    c.busy = true; renderCurrentsMeta();
    try { c.grid = await window.bridge.fetchCurrents(currentsLattice()); c.fetchedAt = Date.now(); c.density = state.s.currentsDensity; }
    catch (e) { toast(String(e.message || e), 'err'); }
    finally { c.busy = false; renderCurrentVectors(); renderCurrentsMeta(); }
  }
  function renderCurrentVectors() {
    const c = state.currents; if (!c.grid) return;
    const now = Date.now();
    const vec = [];
    c.grid.forEach((g) => {
      if (!g.hours.length) return;
      let prev = null, next = null;
      for (const h of g.hours) { if (h.t <= now) prev = h; else { next = h; break; } }
      const h = prev && next ? (now - prev.t < next.t - now ? prev : next) : (prev || next);
      if (h && h.speed > 0.02) vec.push({ lat: g.lat, lon: g.lon, speed: h.speed, dir: h.dir });
    });
    map.setCurrents(vec, densityCfg().scale);
  }
  function renderCurrentsMeta() {
    const c = state.currents;
    $('currentsMeta').textContent = !state.s.layers.currents ? '' : c.busy && !c.grid ? t('currents_loading') : c.grid ? t('currents_meta', { t: fmtTime(c.fetchedAt), n: c.grid.filter((g) => g.hours.length).length }) : '';
  }

  // ------------------------------------------------------------------ measuring ruler (bottom-right button)
  function fmtDist(km) { const nm = km / 1.852; return state.s.units.vis === 'km' ? `${km.toFixed(km < 10 ? 2 : 1)} km` : `${nm.toFixed(nm < 10 ? 2 : 1)} NM`; }
  const fmtBrg = (b) => `${String(Math.round(b) % 360).padStart(3, '0')}°`;
  function rulerLabel(km, brg) { return `${fmtDist(km)} · ${fmtBrg(brg)}`; }
  function setRulerMode(on) {
    if (on && state.plan.on) setPlanMode(false);
    state.ruler.on = on; $('btnRuler').classList.toggle('on', on);
    map.setTool(on ? 'measure' : (state.plan.on ? 'plan' : null), rulerLabel);
  }
  function renderRuler(sum) {
    state.ruler.sum = sum;
    const el = $('rulerPanel'); el.hidden = !state.ruler.on; if (!state.ruler.on) return;
    const row = (i, l, cls) => `<div class="rl${cls}"><span>${pad2(i)}</span><span>${fmtBrg(l.brg)}</span><span>${fmtDist(l.km)}</span></div>`;
    const rows = sum.legs.map((l, i) => row(i + 1, l, '')).join('') + (sum.cursorLeg ? row(sum.legs.length + 1, sum.cursorLeg, ' live') : '');
    const hint = !sum.points.length ? t('ruler_hint') : sum.done ? t('ruler_done') : t('ruler_hint_more');
    el.innerHTML = `<div class="rh">${t('ruler_title')}${sum.points.length ? ` · ${sum.points.length} WP` : ''}</div>${rows}<div class="rt"><span>${t('ruler_total')}</span><span>${fmtDist(sum.totalKm)}</span></div><div class="rhint">${hint}</div>`;
  }
  $('btnRuler').addEventListener('click', () => setRulerMode(!state.ruler.on));

  // ------------------------------------------------------------------ route planner (bottom-right button)
  // The route (waypoints, departure, speed) lives in settings.plan and survives restarts; it stays on the map, dimmed,
  // while the planner is off and is removed only with CLEAR ROUTE or by deleting its waypoints.
  const KN_MS = 0.514444;
  function planCfg() { return state.s.plan; }
  function etaAtKm(km) { const c = planCfg(); if (!c.depart || !(c.speedKn > 0)) return null; return c.depart + (km / (c.speedKn * 1.852)) * 3600e3; }
  function onRoute(sum) {
    const prev = state.plan.sum;
    if (sum.ship && (!prev || !prev.ship || Math.abs(prev.ship.km - sum.ship.km) > 1e-6 || !prev.done)) state.plan.focus = true;
    state.plan.sum = sum;
    if (!sum.dragging) { planCfg().pts = sum.points; save(); ensureShipForecast(); ensureRouteSamples(); }
    renderPlan(); renderTimebar(); renderSelected(); renderMapStates(); renderPoints();
  }
  // departure field: DD.MM.YY HH:MM in the app's time zone (24 h clock; separators . / - : all accepted on input)
  function toLocalInput(ms) { const d = shifted(ms); return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCFullYear() % 100)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`; }
  function fromLocalInput(s) {
    const m = /^\s*(\d{1,2})[./:-](\d{1,2})[./:-](\d{2}|\d{4})[\sT,]+(\d{1,2})[:.h](\d{2})\s*$/.exec(s || ''); if (!m) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), mo = Number(m[2]) - 1, d = Number(m[1]), hh = Number(m[4]), mi = Number(m[5]);
    if (mo < 0 || mo > 11 || d < 1 || d > 31 || hh > 23 || mi > 59) return null;
    return Date.UTC(y, mo, d, hh, mi) - tzOffset() * 60e3;
  }
  function fmtDay(ms) { const d = shifted(ms); return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCFullYear() % 100)}`; }
  function setPlanMode(on) {
    if (on && state.ruler.on) setRulerMode(false);
    stopPlay();
    state.plan.on = on; $('btnPlan').classList.toggle('on', on);
    const c = planCfg(); if (on && !c.depart) { c.depart = Math.ceil(Date.now() / 600e3) * 600e3; save(); }
    $('planPanel').hidden = !on;
    if (on) fillPlanInputs();
    map.setTool(on ? 'plan' : null, rulerLabel); // emits onRoute → everything re-renders
  }
  function fillPlanInputs() {
    const c = planCfg();
    $('planDepart').value = c.depart ? toLocalInput(c.depart) : ''; $('planDepart').classList.remove('invalid');
    $('planSpeed').value = String(c.speedKn); $('planSpeedMs').value = (c.speedKn * KN_MS).toFixed(1);
  }
  function planChanged() { invalidateRouteColors(); map.setRouteColor(routeColorAt); renderPlan(); renderTimebar(); renderSelected(); renderMapStates(); renderPoints(); }
  function setDepart(ms) { planCfg().depart = ms; save(); fillPlanInputs(); planChanged(); }
  function setSpeed(kn) { if (!(kn > 0)) return; planCfg().speedKn = Math.round(Math.min(60, kn) * 10) / 10; save(); fillPlanInputs(); planChanged(); }
  function renderPlan() {
    const p = state.plan; if (!p.on) return;
    const sum = p.sum, c = planCfg();
    $('planTotal').textContent = sum && sum.points.length ? `${sum.points.length} WP · ${fmtDist(sum.totalKm)}` : '';
    const rows = [];
    if (sum && sum.ship) {
      const s = sum.ship, eta = planEta(), etaEnd = etaAtKm(sum.totalKm);
      const row = (k, val, cls = '') => `<div class="pr${cls}"><span>${k}</span><span>${val}</span></div>`;
      rows.push(row(t('plan_pos'), `${U.fmtLat(s.lat)} ${U.fmtLon(s.lon)}`));
      rows.push(row(t('plan_from_start'), `${fmtDist(s.km)} · ${t('plan_leg')} ${s.leg}`));
      if (eta !== null) rows.push(row(t('plan_eta_here'), `${fmtDay(eta)} ${fmtTime(eta)}`, ' eta'));
      if (etaEnd !== null) rows.push(row(t('plan_eta_end'), `${fmtDay(etaEnd)} ${fmtTime(etaEnd)} · ${fmtEta(etaEnd - (c.depart || etaEnd))}`));
    }
    $('planShip').innerHTML = rows.join('');
    $('planHint').textContent = !sum || !sum.points.length ? t('plan_hint') : sum.done ? t('plan_hint_done') : t('plan_hint_drawing');
    const st = p.samplesStatus, wx = $('planWx');
    wx.hidden = !(sum && sum.done) || !st;
    wx.classList.toggle('err', Boolean(st && st.startsWith('err')));
    wx.textContent = !st ? '' : st === 'loading' ? t('plan_wx_loading') : st === 'ok' ? t('plan_wx_ok', { n: p.samples.filter((s) => s.fc).length, t: fmtClock(p.samplesAt) }) : st === 'sg' ? t('plan_wx_sg') : t('plan_wx_err', { e: st.slice(4) });
    $('btnPlanClear').hidden = !(sum && sum.points.length);
  }
  // forecast for the ship's position: fetched when the position moves to another grid cell, cached per cell
  let shipFetchT = null;
  function ensureShipForecast() {
    const sp = planShipPoint(); if (!sp) return;
    const prec = Math.max(0.01, Number(state.s.coordPrecision) || 0.05); const key = `${Math.round(sp.lat / prec)}|${Math.round(sp.lon / prec)}`;
    if (key === state.plan.key) return;
    clearTimeout(shipFetchT);
    shipFetchT = setTimeout(async () => {
      if (!state.plan.on) return;
      state.plan.key = key; state.plan.fetching = true; renderSelected();
      try {
        const res = await window.bridge.fetchWeather([{ id: 'ship', lat: sp.lat, lon: sp.lon }], { provider: state.s.provider, params: requestParams(), source: state.s.sgSource, hours: 72, precision: state.s.coordPrecision });
        if (state.plan.key === key) state.plan.fc = res[0] || null;
      } catch (e) { toast(String(e.message || e), 'err'); state.plan.key = null; }
      finally { state.plan.fetching = false; renderSelected(); renderMapStates(); renderPoints(); }
    }, 350);
  }
  function requestParams() { return Array.from(new Set([...state.s.display, ...state.s.thresholds.map((x) => x.metric)])).filter((id) => BY_ID[id] && BY_ID[id].sg && !id.startsWith('d_')); }
  // Forecast samples along the laid route (every ≥ 8 km, ≤ ~40 points, one batched Open-Meteo call) colour the line
  // by the weather the ship meets at each place at its ETA there. Stormglass bills per point, so no gradient with it.
  let routeFetchT = null;
  function ensureRouteSamples() {
    const sum = state.plan.sum;
    if (!sum || !sum.done || sum.points.length < 2 || state.s.provider === 'stormglass') { state.plan.samples = []; state.plan.samplesKey = null; state.plan.samplesStatus = state.s.provider === 'stormglass' && sum && sum.done ? 'sg' : null; invalidateRouteColors(); map.setRouteColor(routeColorAt); renderPlan(); return; }
    const step = Math.max(8, sum.totalKm / 40), pts = [];
    for (let km = 0; km <= sum.totalKm + 1e-6; km += step) { const rp = map.routePoint(Math.min(km, sum.totalKm)); pts.push({ km: rp.km, lat: rp.lat, lon: rp.lon }); }
    const prec = Math.max(0.01, Number(state.s.coordPrecision) || 0.05);
    const key = pts.map((p) => `${Math.round(p.lat / prec)}|${Math.round(p.lon / prec)}`).join(';');
    if (key === state.plan.samplesKey) { invalidateRouteColors(); map.setRouteColor(routeColorAt); return; }
    clearTimeout(routeFetchT);
    state.plan.samplesStatus = 'loading'; renderPlan();
    routeFetchT = setTimeout(async () => {
      state.plan.samplesKey = key;
      try {
        const res = await window.bridge.fetchWeather(pts.map((p, i) => ({ id: `rs${i}`, lat: p.lat, lon: p.lon })), { provider: state.s.provider, params: requestParams(), source: state.s.sgSource, hours: 72, precision: state.s.coordPrecision });
        if (state.plan.samplesKey !== key) return;
        state.plan.samples = pts.map((p, i) => ({ ...p, fc: res.find((r) => r.pointId === `rs${i}`) || null }));
        state.plan.samplesStatus = 'ok'; state.plan.samplesAt = Date.now();
      } catch (e) {
        console.warn('route samples failed', e); state.plan.samplesKey = null; state.plan.samples = []; state.plan.samplesStatus = `err:${e.message || e}`;
        setTimeout(() => { if (state.plan.sum && state.plan.sum.done) ensureRouteSamples(); }, 15000); // retry after a pause (rate limit, network)
      }
      invalidateRouteColors(); map.setRouteColor(routeColorAt); renderPlan();
    }, 600);
  }
  // Route palette: green while the worst limit is below 65 % approached, amber towards the limit, red beyond it.
  // (Wider green band than the widget tint, so a calm passage reads as clearly green rather than amber.)
  function routeGrade(r) {
    const ok = [126, 224, 129], warn = [240, 178, 58], crit = [255, 107, 98];
    const mix = (a, b, f) => a.map((x, i) => Math.round(x + (b[i] - x) * f));
    const c = r <= 0.65 ? ok : r < 0.9 ? mix(ok, warn, (r - 0.65) / 0.25) : r < 1 ? mix(warn, crit, (r - 0.9) / 0.1) : crit;
    return `rgb(${c.join(',')})`;
  }
  const routeColorCache = new Map();
  function invalidateRouteColors() { routeColorCache.clear(); }
  // Colour of the route at km: how close the worst global limit is at the ship's ETA there (green → amber → red = exceeded)
  function routeColorAt(km) {
    const S = state.plan.samples; if (!S || !S.length) return null;
    let best = S[0]; for (const s of S) if (Math.abs(s.km - km) < Math.abs(best.km - km)) best = s;
    if (!best.fc) return null;
    const eta = etaAtKm(km); if (eta === null) return null;
    const ck = `${best.km.toFixed(1)}|${Math.round(eta / 600e3)}`;
    if (routeColorCache.has(ck)) return routeColorCache.get(ck);
    const p = { id: 'route', lat: best.lat, lon: best.lon }, ctx = ctxFor(p);
    let worst = 0, any = false;
    for (const th of state.s.thresholds) {
      if (!th.enabled || th.pointIds.length) continue;
      const v = A.seriesValue(best.fc.hours, th.metric, eta, p.lat, ctx);
      if (v === null || v === undefined) continue;
      const r = limitRatio(th.metric, v, th); if (r === null) continue;
      any = true; worst = Math.max(worst, r);
    }
    const col = any ? routeGrade(Math.min(1.2, worst)) : null;
    routeColorCache.set(ck, col); return col;
  }
  // playback: the ship advances along the route at ×1000 (200 ms real = 200 s of voyage)
  function stopPlay() { if (state.plan.play) { clearInterval(state.plan.play); state.plan.play = null; } const b = $('btnTimePlay'); b.classList.remove('on'); b.textContent = '▶ ×1000'; }
  function togglePlay() {
    if (state.plan.play) { stopPlay(); return; }
    const sum = state.plan.sum, c = planCfg(); if (!sum || !sum.done || !sum.ship || !(c.speedKn > 0)) return;
    if (sum.ship.km >= sum.totalKm - 1e-6) map.setShipKm(0);
    const b = $('btnTimePlay'); b.classList.add('on'); b.textContent = '❚❚ ×1000';
    state.plan.play = setInterval(() => {
      const s = state.plan.sum; if (!s || !s.done || !s.ship) { stopPlay(); return; }
      const nk = s.ship.km + c.speedKn * 1.852 * 200 / 3600;
      if (nk >= s.totalKm) { map.setShipKm(s.totalKm); stopPlay(); } else map.setShipKm(nk);
    }, 200);
  }
  $('btnPlan').addEventListener('click', () => setPlanMode(!state.plan.on));
  $('btnPlanClear').addEventListener('click', () => { stopPlay(); map.clearRoute(); });
  $('planDepart').addEventListener('change', () => {
    const el = $('planDepart'); const ms = fromLocalInput(el.value);
    if (ms === null) { el.classList.add('invalid'); toast(t('plan_depart_bad'), 'err'); return; }
    setDepart(ms);
  });
  document.querySelectorAll('#planPanel [data-step]').forEach((b) => b.addEventListener('click', () => {
    const st = b.dataset.step; const base = planCfg().depart || Date.now();
    setDepart(st === 'now' ? Math.ceil(Date.now() / 600e3) * 600e3 : base + Number(st) * 60e3);
  }));
  $('planSpeed').addEventListener('change', () => setSpeed(Number($('planSpeed').value)));
  $('planSpeedMs').addEventListener('change', () => setSpeed(Number($('planSpeedMs').value) / KN_MS));
  $('planSpeed').addEventListener('input', () => { const v = Number($('planSpeed').value); if (v > 0) $('planSpeedMs').value = (v * KN_MS).toFixed(1); });
  $('planSpeedMs').addEventListener('input', () => { const v = Number($('planSpeedMs').value); if (v > 0) $('planSpeed').value = (v / KN_MS).toFixed(1); });

  // ------------------------------------------------------------------ time bar (bottom-left): +24 h offset, or the ship's clock on a laid route
  function routeMode() { const s = state.plan.sum, c = planCfg(); return Boolean(state.plan.on && s && s.done && s.ship && c.depart && c.speedKn > 0); }
  function renderTimebar() {
    const bar = $('timebar'), rng = $('timeRange'), eta = planEta(), rm = routeMode();
    bar.classList.toggle('shifted', isShifted()); bar.classList.toggle('route', rm);
    $('btnTimePlay').hidden = !rm;
    rng.disabled = Boolean(state.plan.on && !rm);
    if (rm) {
      const s = state.plan.sum, c = planCfg(); const durMin = Math.max(1, Math.ceil((s.totalKm / (c.speedKn * 1.852)) * 60));
      rng.max = String(durMin); rng.step = '1'; rng.value = String(Math.round((s.ship.km / (c.speedKn * 1.852)) * 60));
      $('timeVal').textContent = `${t('plan_ship')} · ${fmtDay(eta)} ${fmtTime(eta)}`;
      $('timeTicks').innerHTML = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span>${fmtClock(c.depart + f * durMin * 60e3)}</span>`).join('');
      return;
    }
    if (!state.plan.on) stopPlay();
    rng.max = '1440'; rng.step = '10'; rng.value = String(Math.round(state.timeShift / 60e3));
    $('timeTicks').innerHTML = ['0', '+6H', '+12H', '+18H', '+24H'].map((x) => `<span>${x}</span>`).join('');
    if (eta !== null) { $('timeVal').textContent = `${t('plan_ship')} · ${fmtDay(eta)} ${fmtTime(eta)}`; return; }
    const m = Math.round(state.timeShift / 60e3);
    $('timeVal').textContent = m ? `+${Math.floor(m / 60)}:${pad2(m % 60)} · ${fmtTime(Date.now() + state.timeShift)}` : t('time_now');
  }
  function setTimeShift(min) { state.timeShift = Math.max(0, Math.min(1440, min)) * 60e3; $('timeRange').value = String(Math.round(state.timeShift / 60e3)); renderTimebar(); renderSelected(); renderMapStates(); renderPoints(); }
  $('timeRange').addEventListener('input', () => { const v = Number($('timeRange').value); if (routeMode()) { stopPlay(); map.setShipKm((v / 60) * planCfg().speedKn * 1.852); } else setTimeShift(v); });
  $('btnTimeNow').addEventListener('click', () => setTimeShift(0));
  $('btnTimePlay').addEventListener('click', togglePlay);

  // ------------------------------------------------------------------ layout
  function applyLayout() {
    $('viewHome').dataset.layout = state.s.layout || 'side';
    setTimeout(() => map && map.resize(), 0);
  }

  // ------------------------------------------------------------------ guide
  function renderGuide(sectionId) {
    const G = WA.GUIDE; const sections = G[I.lang()] || G.en;
    const nav = $('guideNav'), body = $('guideBody');
    const active = sectionId || (nav.dataset.active || sections[0].id);
    nav.dataset.active = active;
    nav.innerHTML = `<div class="guide-ver">${t('guide_version', { v: G.version })}</div>` + sections.map((sec) => `<button class="tab ${sec.id === active ? 'active' : ''}" data-sec="${sec.id}">${sec.title}</button>`).join('');
    nav.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => renderGuide(b.dataset.sec)));
    body.innerHTML = sections.map((sec) => `<section class="guide-sec" id="guide-${sec.id}"><h1 class="pane-title">${sec.title}</h1>${sec.body}</section>`).join('');
    const target = body.querySelector(`#guide-${active}`); if (target) target.scrollIntoView({ block: 'start' });
  }
  $('btnGuide').addEventListener('click', () => setView('guide'));
  $('btnGuideBack').addEventListener('click', () => setView('home'));

  // ------------------------------------------------------------------ language
  function applyLanguage(lang) {
    I.setLang(lang);
    I.applyStatic(document);
    $('crumb').textContent = state.view === 'alarms' ? t('crumb_alarms') : state.view === 'settings' ? t('crumb_settings') : '';
    renderAll();
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    await load();
    I.setLang(state.s.lang); I.applyStatic(document);
    WA.audio.setVolume(state.s.volume / 100);
    map = WA.map.createMap($('map'), {
      onSelect: select,
      onMapClick: (ll) => { if (state.view === 'home' && state.s.points.length < MAX_POINTS) openAddPoint(ll); },
      onHover: (ll) => {
        const txt = `${U.fmtLat(ll.lat)} ${U.fmtLon(ll.lon)}`;
        const tag = $('cursorTag'); tag.hidden = false; tag.textContent = txt;
        tag.style.left = `${ll.px + 14}px`; tag.style.top = `${ll.py + 14}px`;
      },
      onLeave: () => { $('cursorTag').hidden = true; },
      onMeasure: renderRuler,
      onRoute,
      loadData: (dataset, res) => window.bridge.loadMapData(dataset, res),
      onLod: () => renderMapStates(),
      onGrid: (step) => { const m = Math.round(step * 60); $('gridText').textContent = step >= 1 ? `${step}°` : `${m}'`; renderMapStates(); }
    });
    map.setProjection(state.s.projection);
    map.setRouteColor(routeColorAt);
    if (state.s.plan.pts && state.s.plan.pts.length >= 2) map.setRoute(state.s.plan.pts, 0); // the planned route survives restarts
    applyLayout();
    map.loadSeaMask().then(applyLayers, applyLayers);
    window.bridge.loadMapData('bathy').then((grid) => { WA.bathy.load(grid); evaluateAlarms(); renderAll(); }).catch((e) => console.error('bathy load failed', e));
    if (state.s.points.length && !state.selectedId) state.selectedId = state.s.points[0].id;
    tickClock(); setInterval(tickClock, 1000);
    renderAll(); schedule(); refresh('auto');
  }
  boot();
})();
