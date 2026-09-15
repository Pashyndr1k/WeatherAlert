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
      provider: 'openmeteo', region: 'blacksea', projection: 'mercator', refreshMin: 30, sgSource: 'sg',
      leadMin: 90, volume: 60, sound: true, notify: true, flash: true, muted: false, lang: 'en', tz: 180, layout: 'strip',
      units: { speed: 'kn', length: 'm', temp: 'c', vis: 'nm' },
      display: [...METRICS, ...DERIVED].filter((m) => m.def).map((m) => m.id),
      thresholds: [
        { id: uid(), metric: 'windSpeed', op: 'gte', value: 17.2, enabled: true, pointIds: [] },
        { id: uid(), metric: 'gust', op: 'gte', value: 22.0, enabled: true, pointIds: [] },
        { id: uid(), metric: 'waveHeight', op: 'gte', value: 3.0, enabled: true, pointIds: [] },
        { id: uid(), metric: 'visibility', op: 'lte', value: 1.0, enabled: true, pointIds: [] },
        { id: uid(), metric: 'd_pressureTendency', op: 'lte', value: -4, enabled: true, pointIds: [] },
        { id: uid(), metric: 'd_icing', op: 'gte', value: 0.7, enabled: true, pointIds: [] },
        { id: uid(), metric: 'd_advFog', op: 'gte', value: 60, enabled: true, pointIds: [] }
      ],
      points: []
    };
  }

  const state = {
    s: defaultSettings(), forecasts: {}, selectedId: null, alarms: [], acked: new Set(), ackedAt: {}, seen: new Set(), reminded: new Set(),
    lastShown: {}, lastRefresh: null, quota: null, busy: false, hasKey: false, error: null, view: 'home', settingsDraft: null
  };
  let map = null, refreshTimer = null, evalTimer = null;

  // ------------------------------------------------------------------ persistence
  async function load() {
    const saved = await window.bridge.getSettings();
    if (saved) {
      const d = defaultSettings();
      state.s = { ...d, ...saved, units: { ...d.units, ...(saved.units || {}) } };
      // make sure the new default indicators appear for existing installs
      ['d_icing', 'd_advFog'].forEach((id) => { if (!saved.display) return; if (!state.s.display.includes(id) && saved.display.length && !saved.seenIndicators) state.s.display.push(id); });
      state.s.seenIndicators = true;
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
  function currentValues(pointId) {
    const fc = state.forecasts[pointId];
    if (!fc) return null;
    const now = Date.now(), v = {};
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
    $('brandSub').hidden = v !== 'home';
    $('crumb').hidden = v === 'home';
    $('crumb').textContent = v === 'alarms' ? t('crumb_alarms') : v === 'settings' ? t('crumb_settings') : v === 'guide' ? t('crumb_guide') : '';
    if (v === 'alarms') renderAlarmsView();
    if (v === 'guide') renderGuide();
    if (v === 'home') { setTimeout(() => map && map.resize(), 0); }
  }

  // ------------------------------------------------------------------ clock
  function tickClock() {
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
      const res = await window.bridge.fetchWeather(state.s.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon })), { provider: state.s.provider, params, source: state.s.sgSource, hours: 72 });
      res.forEach((fc) => { state.forecasts[fc.pointId] = fc; if (fc.meta && fc.meta.quota) state.quota = { used: fc.meta.used, quota: fc.meta.quota }; });
      state.lastRefresh = Date.now();
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
    evalTimer = setInterval(() => { evaluateAlarms(); renderAlarms(); renderMapStates(); applyCardStates(); renderPoints(); }, 30e3);
  }

  // ------------------------------------------------------------------ alarms
  function evaluateAlarms() {
    const alarms = A.evaluate(state.s.points, state.forecasts, state.s.thresholds, { leadMinutes: state.s.leadMin });
    const keys = new Set(alarms.map((a) => a.key));
    [...state.seen].forEach((k) => { if (!keys.has(k)) { state.seen.delete(k); state.acked.delete(k); state.reminded.delete(k); delete state.ackedAt[k]; } });
    const fresh = alarms.filter((a) => !state.seen.has(a.key));
    fresh.forEach((a) => state.seen.add(a.key));
    alarms.forEach((a) => {
      if (a.level === 'warning' && a.eta <= 60 * 60e3 && state.acked.has(a.key) && !state.reminded.has(a.key)) { state.reminded.add(a.key); state.acked.delete(a.key); fresh.push(a); }
    });
    state.alarms = alarms;
    if (fresh.length) announce(fresh);
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
    const mode = !state.s.sound || state.s.muted ? null : un.some((a) => a.level === 'critical') ? 'critical' : un.some((a) => a.level === 'warning') ? 'warning' : null;
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
      const lvl = pointLevel(p.id);
      const el = document.createElement('div');
      el.className = `rail-row ${lvl} ${p.id === state.selectedId ? 'active' : ''}`;
      el.innerHTML = `<span class="nm"></span><span class="st"></span>`;
      el.querySelector('.nm').textContent = `${pad2(i + 1)} ${p.name}`;
      el.querySelector('.st').textContent = lvl === 'critical' ? t('st_crit') : lvl === 'warning' ? t('st_warn') : t('st_ok');
      el.addEventListener('click', () => select(p.id));
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
      const lvl = pointLevel(p.id);
      let critText = '';
      if (lvl === 'critical') { const a = state.alarms.find((x) => x.pointId === p.id && x.level === 'critical'); if (a) { const f = fmtMetric(a.metric, a.value); critText = `${f.text} ${f.unit}`.toUpperCase(); } }
      st[p.id] = { level: lvl, windDir: v ? v.windDirection : null, critText };
    });
    map.setStates(st);
    map.setSelected(state.selectedId);
    const proj = state.s.projection === 'albers' ? t('proj_albers') : t('proj_mercator');
    const lod = map.lod(); const lodTxt = lod ? t(`lod_${lod}`) : '—';
    $('readoutMeta').textContent = t('readout_proj', { proj, grid: $('gridText').textContent || '—', lod: lodTxt });
  }

  function renderSelected() {
    const p = pointById(state.selectedId);
    const grid = $('metricsGrid');
    $('selActions').hidden = !p;
    if (!p) {
      $('selState').textContent = t('no_selection'); $('selState').className = 'sel-state';
      $('selName').textContent = '—'; $('selCoords').textContent = '';
      grid.innerHTML = '';
      return;
    }
    const lvl = pointLevel(p.id);
    $('selState').textContent = lvl === 'critical' ? t('selected_state_crit') : lvl === 'warning' ? t('selected_state_warn') : t('selected_state_ok');
    $('selState').className = `sel-state ${lvl}`;
    $('selName').textContent = p.name;
    $('selCoords').textContent = `${U.fmtLat(p.lat)} ${U.fmtLon(p.lon)}`;
    const fc = state.forecasts[p.id];
    const v = currentValues(p.id);
    grid.innerHTML = '';
    if (!fc) { grid.innerHTML = `<div class="card placeholder">${state.busy ? t('loading') : (state.error || t('no_data'))}</div>`; return; }
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
        const pk = A.peak(fc.hours, m.id, Date.now(), 24 * 3600e3, th ? th.op : 'gte');
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
      default: return '';
    }
  }

  function applyCardStates() {
    const p = pointById(state.selectedId);
    if (!p) return;
    document.querySelectorAll('#metricsGrid .card').forEach((card) => {
      const id = card.dataset.metric;
      const al = state.alarms.filter((a) => a.pointId === p.id && a.metric === id);
      const crit = al.find((a) => a.level === 'critical'), warn = al.find((a) => a.level === 'warning');
      card.classList.toggle('critical', Boolean(crit));
      card.classList.toggle('warning', !crit && Boolean(warn));
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
    if (un.length) {
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
  }

  // ------------------------------------------------------------------ points
  function select(id) { state.selectedId = id; renderPoints(); renderSelected(); renderMapStates(); }
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
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; }); closeLimitEditor(); } });
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
    $('setProvider').value = s.provider; $('setRefresh').value = String(s.refreshMin); $('setSgSource').value = s.sgSource;
    $('setRegion').value = s.region; $('setProjection').value = s.projection; $('setLang').value = s.lang;
    renderTzOptions(); $('setTz').value = String(s.tz); $('setLayout').value = s.layout || 'strip';
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
    const prevRegion = s.region, prevProj = s.projection, prevProvider = s.provider, prevUnits = JSON.stringify(s.units);
    s.provider = $('setProvider').value; s.refreshMin = Number($('setRefresh').value); s.sgSource = $('setSgSource').value;
    s.region = $('setRegion').value; s.projection = $('setProjection').value; s.lang = $('setLang').value;
    s.tz = $('setTz').value === 'local' ? 'local' : Number($('setTz').value);
    s.leadMin = Number($('setLead').value); s.volume = Number($('setVolume').value);
    s.sound = $('setSound').checked; s.notify = $('setNotify').checked; s.flash = $('setFlash').checked;
    s.units = { speed: $('unitSpeed').value, length: $('unitLength').value, temp: $('unitTemp').value, vis: $('unitVis').value };
    const picked = [...document.querySelectorAll('#metricPicker input[data-mid]:checked')].map((i) => i.dataset.mid);
    s.display = [...s.display.filter((id) => picked.includes(id)), ...picked.filter((id) => !s.display.includes(id))];
    const prevLayout = s.layout; s.layout = $('setLayout').value;
    const key = $('setApiKey').value.trim();
    if (key) { await window.bridge.setApiKey(key); state.hasKey = true; }
    if (s.provider === 'stormglass' && !state.hasKey) { toast(t('sg_needs_key'), 'err'); return; }
    WA.audio.setVolume(s.volume / 100);
    applyLanguage(s.lang);
    if (prevRegion !== s.region || prevProj !== s.projection) map.setRegion(s.region, s.projection);
    if (prevLayout !== s.layout) applyLayout();
    state.settingsDraft = null;
    save(); schedule(); setView('home');
    if (prevProvider !== s.provider || key) { state.forecasts = {}; state.quota = null; }
    if (prevUnits !== JSON.stringify(s.units)) state.lastShown = {};
    evaluateAlarms(); renderAll();
    if (prevProvider !== s.provider || key || !state.lastRefresh) refresh('auto');
    toast(t('settings_applied'), 'ok');
  });

  // ------------------------------------------------------------------ layout
  function applyLayout() {
    $('viewHome').dataset.layout = state.s.layout || 'strip';
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
        $('coordReadout').textContent = txt;
        const tag = $('cursorTag'); tag.hidden = false; tag.textContent = txt;
        tag.style.left = `${ll.px + 14}px`; tag.style.top = `${ll.py + 14}px`;
      },
      onLeave: () => { $('cursorTag').hidden = true; },
      loadData: (dataset, res) => window.bridge.loadMapData(dataset, res),
      onLod: () => renderMapStates(),
      onGrid: (step) => { const m = Math.round(step * 60); $('gridText').textContent = step >= 1 ? `${step}°` : `${m}'`; renderMapStates(); }
    });
    map.setRegion(state.s.region, state.s.projection);
    applyLayout();
    if (state.s.points.length && !state.selectedId) state.selectedId = state.s.points[0].id;
    tickClock(); setInterval(tickClock, 1000);
    renderAll(); schedule(); refresh('auto');
  }
  boot();
})();
