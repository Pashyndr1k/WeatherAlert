// WeatherAlert renderer — state, rendering, refresh scheduling, alarm orchestration.
(function () {
  'use strict';
  const WA = window.WA;
  const U = WA.units;
  const A = WA.alarms;
  const METRICS = WA.METRICS, DERIVED = WA.DERIVED, BY_ID = WA.METRIC_BY_ID;
  const MAX_POINTS = 10;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ defaults
  const uid = () => Math.random().toString(36).slice(2, 9);
  function defaultSettings() {
    return {
      provider: 'openmeteo',
      region: 'blacksea',
      projection: 'mercator',
      refreshMin: 30,
      sgSource: 'sg',
      leadMin: 90,
      volume: 60,
      sound: true,
      notify: true,
      flash: true,
      muted: false,
      units: { speed: 'kn', length: 'm', temp: 'c', vis: 'nm' },
      display: [...METRICS, ...DERIVED].filter((m) => m.def).map((m) => m.id),
      thresholds: [
        { id: uid(), metric: 'windSpeed', op: 'gte', value: 17.2, enabled: true, pointIds: [] },   // Bft 8 gale (33 kn)
        { id: uid(), metric: 'gust', op: 'gte', value: 22.0, enabled: true, pointIds: [] },        // ~43 kn
        { id: uid(), metric: 'waveHeight', op: 'gte', value: 3.0, enabled: true, pointIds: [] },   // rough → very rough
        { id: uid(), metric: 'visibility', op: 'lte', value: 1.0, enabled: true, pointIds: [] },   // fog (< 1 km)
        { id: uid(), metric: 'd_pressureTendency', op: 'lte', value: -4, enabled: true, pointIds: [] } // rapid fall
      ],
      points: []
    };
  }

  const state = {
    s: defaultSettings(),
    forecasts: {},
    selectedId: null,
    alarms: [],
    acked: new Set(),
    seen: new Set(),
    reminded: new Set(),
    lastShown: {},
    lastRefresh: null,
    quota: null,
    busy: false,
    hasKey: false,
    error: null
  };
  let map = null;
  let refreshTimer = null;
  let evalTimer = null;

  // ------------------------------------------------------------------ persistence
  async function load() {
    const saved = await window.bridge.getSettings();
    if (saved) {
      const d = defaultSettings();
      state.s = { ...d, ...saved, units: { ...d.units, ...(saved.units || {}) } };
    }
    state.hasKey = await window.bridge.hasApiKey();
  }
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => window.bridge.saveSettings(state.s), 150);
  }

  // ------------------------------------------------------------------ helpers
  const fmtTime = (ms) => new Date(ms).toISOString().slice(11, 16) + 'Z';
  const fmtEta = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4200);
  }
  function metricLabel(id) { return BY_ID[id] ? BY_ID[id].label : id; }
  function metricKind(id) { return BY_ID[id] ? BY_ID[id].kind : 'text'; }
  function fmtMetric(id, canonical) { return U.fmt(metricKind(id), canonical, state.s.units); }
  function providerHas(m) {
    if (m.id.startsWith('d_')) return true;
    return state.s.provider === 'stormglass' ? Boolean(m.sg) : Boolean(m.om);
  }
  function pointById(id) { return state.s.points.find((p) => p.id === id); }
  function currentValues(pointId) {
    const fc = state.forecasts[pointId];
    if (!fc) return null;
    const now = Date.now();
    const v = {};
    METRICS.forEach((m) => { v[m.id] = A.valueAt(fc.hours, m.id, now); });
    v.weatherCode = (() => { const h = fc.hours.filter((x) => x.t <= now).pop() || fc.hours[0]; return h ? h.v.weatherCode : null; })();
    v.d_pressureTendency = A.pressureTendency(fc.hours, now);
    return v;
  }

  // ------------------------------------------------------------------ clock
  function tickClock() {
    const d = new Date();
    $('clockUtc').textContent = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} UTC`;
    if (state.lastRefresh) {
      const m = Math.round((Date.now() - state.lastRefresh) / 60e3);
      $('refreshText').textContent = m < 1 ? 'refreshed just now' : `refreshed ${m} min ago`;
    }
  }

  // ------------------------------------------------------------------ data refresh
  async function refresh(reason = 'manual') {
    if (state.busy) return;
    if (!state.s.points.length) { renderStatus(); return; }
    state.busy = true; state.error = null; renderStatus();
    $('btnRefresh').classList.add('spin');
    try {
      const params = Array.from(new Set([...state.s.display, ...state.s.thresholds.map((t) => t.metric)])).filter((id) => BY_ID[id] && BY_ID[id].sg && !id.startsWith('d_'));
      const res = await window.bridge.fetchWeather(state.s.points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon })), {
        provider: state.s.provider, params, source: state.s.sgSource, hours: 72
      });
      res.forEach((fc) => { state.forecasts[fc.pointId] = fc; if (fc.meta && fc.meta.quota) state.quota = { used: fc.meta.used, quota: fc.meta.quota }; });
      state.lastRefresh = Date.now();
      if (reason === 'manual') toast('Forecast updated', 'ok');
      $('pillRefresh').classList.add('flash'); setTimeout(() => $('pillRefresh').classList.remove('flash'), 900);
    } catch (e) {
      state.error = e.message || String(e);
      toast(state.error, 'err');
    } finally {
      state.busy = false;
      $('btnRefresh').classList.remove('spin');
      renderStatus();
      evaluateAlarms();
      renderAll();
    }
  }
  function schedule() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh('auto'), Math.max(5, state.s.refreshMin) * 60e3);
    clearInterval(evalTimer);
    evalTimer = setInterval(() => { evaluateAlarms(); renderAlarms(); renderMapStates(); applyCardStates(); }, 30e3);
  }

  // ------------------------------------------------------------------ alarms
  function evaluateAlarms() {
    const alarms = A.evaluate(state.s.points, state.forecasts, state.s.thresholds, { leadMinutes: state.s.leadMin });
    const keys = new Set(alarms.map((a) => a.key));
    // forget cleared alarms so they can fire again later
    [...state.seen].forEach((k) => { if (!keys.has(k)) { state.seen.delete(k); state.acked.delete(k); state.reminded.delete(k); } });
    const fresh = alarms.filter((a) => !state.seen.has(a.key));
    fresh.forEach((a) => state.seen.add(a.key));
    // 60-minute reminder: re-raise acknowledged warnings once they get within 60 min
    alarms.forEach((a) => {
      if (a.level === 'warning' && a.eta <= 60 * 60e3 && state.acked.has(a.key) && !state.reminded.has(a.key)) {
        state.reminded.add(a.key); state.acked.delete(a.key); fresh.push(a);
      }
    });
    state.alarms = alarms;
    if (fresh.length) announce(fresh);
    updateAudio();
  }
  function describe(a) {
    const p = pointById(a.pointId);
    const lim = fmtMetric(a.metric, a.limit), val = fmtMetric(a.metric, a.value);
    const rule = `${metricLabel(a.metric)} ${a.op === 'lte' ? '≤' : '≥'} ${lim.text} ${lim.unit}`;
    const when = a.level === 'critical' ? `now ${val.text} ${lim.unit}` : `in ${fmtEta(a.eta)} (${fmtTime(a.at)}), reaching ${val.text} ${lim.unit}`;
    return { title: `${a.level === 'critical' ? 'CRITICAL' : 'WARNING'} · ${p ? p.name : a.pointId}`, body: `${rule} — ${when}` };
  }
  function announce(list) {
    const top = list.find((a) => a.level === 'critical') || list[0];
    const d = describe(top);
    if (state.s.notify) window.bridge.notify(d.title, list.length > 1 ? `${d.body}\n+${list.length - 1} more` : d.body, top.level === 'critical');
    if (state.s.flash) window.bridge.attention();
  }
  function updateAudio() {
    const unacked = state.alarms.filter((a) => !state.acked.has(a.key));
    const mode = !state.s.sound || state.s.muted ? null : unacked.some((a) => a.level === 'critical') ? 'critical' : unacked.some((a) => a.level === 'warning') ? 'warning' : null;
    WA.audio.setMode(mode);
  }
  function ack(key) { state.acked.add(key); updateAudio(); renderAlarms(); }
  function ackAll() { state.alarms.forEach((a) => state.acked.add(a.key)); updateAudio(); renderAlarms(); }

  // ------------------------------------------------------------------ rendering
  function renderAll() { renderPoints(); renderSelected(); renderAlarms(); renderMapStates(); renderStatus(); }

  function renderStatus() {
    $('providerName').textContent = state.s.provider === 'stormglass' ? `Stormglass · ${state.s.sgSource}` : 'Open-Meteo';
    const pill = $('pillProvider');
    pill.classList.toggle('busy', state.busy);
    pill.classList.toggle('err', Boolean(state.error));
    pill.title = state.error || 'Active data provider';
    if (state.s.provider === 'stormglass') {
      $('quotaText').textContent = state.quota ? `quota ${state.quota.used} / ${state.quota.quota} today` : (state.hasKey ? 'quota —' : 'no API key');
    } else {
      $('quotaText').textContent = `2 calls / refresh · ${state.s.points.length} pts`;
    }
    if (!state.lastRefresh) $('refreshText').textContent = state.error ? 'refresh failed' : 'not yet refreshed';
    $('btnMute').classList.toggle('muted', state.s.muted);
  }

  function pointLevel(id) {
    const list = state.alarms.filter((a) => a.pointId === id);
    if (list.some((a) => a.level === 'critical')) return 'critical';
    if (list.some((a) => a.level === 'warning')) return 'warning';
    return '';
  }

  function renderPoints() {
    const list = $('pointList');
    list.innerHTML = '';
    state.s.points.forEach((p) => {
      const el = document.createElement('div');
      el.className = `chip ${pointLevel(p.id)} ${p.id === state.selectedId ? 'active' : ''}`;
      el.innerHTML = `<span class="st"></span><span class="nm"></span><span class="rm" title="Remove">×</span>`;
      el.querySelector('.nm').textContent = p.name;
      el.addEventListener('click', () => select(p.id));
      el.querySelector('.rm').addEventListener('click', (ev) => { ev.stopPropagation(); removePoint(p.id); });
      list.appendChild(el);
    });
    $('pointCount').textContent = `${state.s.points.length} / ${MAX_POINTS}`;
    $('emptyState').hidden = state.s.points.length > 0;
    $('mapHint').textContent = state.s.points.length >= MAX_POINTS ? 'Maximum of 10 tracking points reached' : 'Click the map to add a tracking point';
    if (map) map.setPoints(state.s.points);
  }

  function renderMapStates() {
    if (!map) return;
    const st = {};
    state.s.points.forEach((p) => {
      const v = currentValues(p.id);
      const ws = v ? fmtMetric('windSpeed', v.windSpeed) : null;
      const hs = v ? fmtMetric('waveHeight', v.waveHeight) : null;
      st[p.id] = {
        level: pointLevel(p.id),
        windDir: v ? v.windDirection : null,
        sub: v ? `${ws.text} ${ws.unit}${v.waveHeight !== null && v.waveHeight !== undefined ? ` · Hs ${hs.text} ${hs.unit}` : ''}` : ''
      };
    });
    map.setStates(st);
    map.setSelected(state.selectedId);
  }

  function renderSelected() {
    const p = pointById(state.selectedId);
    $('selectedHead').hidden = !p;
    const grid = $('metricsGrid');
    if (!p) { grid.innerHTML = ''; return; }
    $('selName').textContent = p.name;
    $('selCoords').textContent = `${U.fmtLat(p.lat)}  ${U.fmtLon(p.lon)}   (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`;
    const fc = state.forecasts[p.id];
    const v = currentValues(p.id);
    grid.innerHTML = '';
    if (!fc) {
      grid.innerHTML = `<div class="card wide"><div class="c-head">Forecast</div><div class="c-val text">${state.busy ? 'Loading…' : 'No data yet'}</div><div class="c-sub">${state.error ? state.error : 'Press refresh to fetch the forecast.'}</div></div>`;
      return;
    }
    const order = [...METRICS, ...DERIVED].filter((m) => state.s.display.includes(m.id));
    const nowMs = Date.now();
    order.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.metric = m.id;
      const editable = m.threshold && m.kind !== 'text';
      const head = `<div class="c-head"><span>${m.label}</span><button class="c-badge${editable ? ' editable' : ''}" data-badge type="button" title="${editable ? 'Click to edit the critical limit' : ''}"></button></div>`;
      let body = '';
      const prevKey = `${p.id}|${m.id}`;
      if (m.id.startsWith('d_')) body = derivedBody(m, v, fc);
      else if (m.kind === 'dir') {
        const f = U.fmt('dir', v[m.id], state.s.units);
        const rot = v[m.id] === null || v[m.id] === undefined ? 0 : v[m.id] + 180;
        body = `<div class="c-val" data-val>${f.text}<span class="u">${f.unit}</span><svg class="dir-arrow" viewBox="-12 -12 24 24" style="transform:rotate(${rot}deg)"><path d="M0,-10 L5,0 L2,0 L2,10 L-2,10 L-2,0 L-5,0 Z"/></svg></div><div class="c-sub">from ${f.unit || '—'}</div>`;
      } else {
        const f = fmtMetric(m.id, v[m.id]);
        const th = state.s.thresholds.find((t) => t.enabled && t.metric === m.id && (!t.pointIds.length || t.pointIds.includes(p.id)));
        const pk = A.peak(fc.hours, m.id, nowMs, 24 * 3600e3, th ? th.op : 'gte');
        const pkf = pk ? fmtMetric(m.id, pk.v) : null;
        body = `<div class="c-val" data-val>${f.text}<span class="u">${f.unit}</span></div>` +
          `<div class="c-sub">${pk ? `${th && th.op === 'lte' ? 'min' : 'max'} 24 h: <b>${pkf.text} ${pkf.unit}</b> ${pk.t - nowMs < 30 * 60e3 ? 'now' : `in ${fmtEta(pk.t - nowMs)}`} (${fmtTime(pk.t)})` : ''}</div>` +
          sparkline(fc.hours, m.id, nowMs, th);
      }
      card.innerHTML = head + body;
      if (editable) card.querySelector('[data-badge]').addEventListener('click', (ev) => { ev.stopPropagation(); openLimitEditor(m.id, card); });
      // value-change micro-animation
      const valEl = card.querySelector('[data-val]');
      if (valEl) {
        const txt = valEl.textContent;
        if (state.lastShown[prevKey] !== undefined && state.lastShown[prevKey] !== txt) valEl.classList.add('tick');
        state.lastShown[prevKey] = txt;
      }
      grid.appendChild(card);
    });
    applyCardStates();
  }

  function sparkline(hours, metric, nowMs, th) {
    const from = nowMs - 3 * 3600e3, to = nowMs + 21 * 3600e3;
    const pts = hours.filter((h) => h.t >= from && h.t <= to && h.v[metric] !== null && h.v[metric] !== undefined).map((h) => [h.t, h.v[metric]]);
    if (pts.length < 2) return '';
    let min = Math.min(...pts.map((p) => p[1])), max = Math.max(...pts.map((p) => p[1]));
    if (th) { min = Math.min(min, th.value); max = Math.max(max, th.value); }
    if (max - min < 1e-6) { max += 1; min -= 1; }
    const pad = (max - min) * 0.1; min -= pad; max += pad;
    const X = (t) => ((t - from) / (to - from)) * 100;
    const Y = (v) => 28 - ((v - min) / (max - min)) * 26;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    const area = `${d} L${X(pts[pts.length - 1][0]).toFixed(1)},30 L${X(pts[0][0]).toFixed(1)},30 Z`;
    const thLine = th ? `<line class="th" x1="0" x2="100" y1="${Y(th.value).toFixed(1)}" y2="${Y(th.value).toFixed(1)}"/>` : '';
    return `<svg class="c-spark" viewBox="0 0 100 30" preserveAspectRatio="none"><path class="ar" d="${area}"/>${thLine}<line class="nowl" x1="${X(nowMs).toFixed(1)}" x2="${X(nowMs).toFixed(1)}" y1="0" y2="30"/><path class="ln" d="${d}"/></svg>`;
  }

  function derivedBody(m, v, fc) {
    switch (m.id) {
      case 'd_beaufort': {
        const b = U.beaufort(v.windSpeed);
        if (!b) return `<div class="c-val text" data-val>—</div>`;
        const bars = Array.from({ length: 12 }, (_, i) => `<i class="${i < b.force ? 'on' : ''} ${b.force >= 10 ? 'xhi' : b.force >= 7 ? 'hi' : ''}"></i>`).join('');
        return `<div class="c-val" data-val>${b.force}<span class="u">Bft · ${b.name}</span></div><div class="bft-bar">${bars}</div>`;
      }
      case 'd_seaState': {
        const s = U.seaState(v.waveHeight);
        return s ? `<div class="c-val" data-val>${s.code}<span class="u">${s.name}</span></div><div class="c-sub">Douglas sea scale</div>` : `<div class="c-val text" data-val>—</div><div class="c-sub">no wave data (inland?)</div>`;
      }
      case 'd_cloudCondition': {
        const c = U.cloudCondition(v.cloudCover);
        return c ? `<div class="c-val text" data-val><span class="okta" style="--f:${(c.oktas / 8).toFixed(2)}"></span>${c.name}</div><div class="c-sub">${c.oktas} okta · ${Math.round(v.cloudCover)} % cover</div>` : `<div class="c-val text" data-val>—</div>`;
      }
      case 'd_airCondition': {
        const a = U.airCondition(v);
        const vis = fmtMetric('visibility', v.visibility);
        return a ? `<div class="c-val text" data-val>${a.name}</div><div class="c-sub">visibility ${vis.text} ${vis.unit}${v.humidity !== null && v.humidity !== undefined ? ` · RH ${Math.round(v.humidity)} %` : ''}</div>` : `<div class="c-val text" data-val>—</div>`;
      }
      case 'd_pressureTendency': {
        const f = U.fmt('ptend', v.d_pressureTendency, state.s.units);
        const t = v.d_pressureTendency;
        const word = t === null ? '' : t <= -6 ? 'falling very rapidly' : t <= -3.5 ? 'falling rapidly' : t <= -1.5 ? 'falling' : t >= 3.5 ? 'rising rapidly' : t >= 1.5 ? 'rising' : 'steady';
        return `<div class="c-val" data-val>${f.text}<span class="u">${f.unit}</span></div><div class="c-sub">${word}</div>` + sparkline(fc.hours, 'pressure', Date.now(), null);
      }
      case 'd_crossSea': {
        const c = U.crossSea(v);
        return c ? `<div class="c-val text" data-val>${c.name}</div><div class="c-sub">swell / wind-wave angle ${Math.round(c.angle)}°</div>` : `<div class="c-val text" data-val>—</div>`;
      }
      case 'd_fogRisk': {
        const f = U.fogRisk(v);
        return f ? `<div class="c-val text" data-val>${f.level}</div><div class="c-sub">dew-point spread ${f.spread.toFixed(1)} °C</div>` : `<div class="c-val text" data-val>—</div>`;
      }
      case 'd_gustFactor': {
        const g = v.windSpeed && v.gust ? v.gust / Math.max(0.5, v.windSpeed) : null;
        return g ? `<div class="c-val" data-val>${g.toFixed(2)}<span class="u">×</span></div><div class="c-sub">${g > 1.6 ? 'squally' : g > 1.3 ? 'gusty' : 'steady'}</div>` : `<div class="c-val text" data-val>—</div>`;
      }
      default: return '';
    }
  }

  // Colour cards/badges according to alarm state without rebuilding them.
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
      if (crit) badge.textContent = 'THRESHOLD EXCEEDED';
      else if (warn) badge.textContent = `limit in ${fmtEta(warn.eta)}`;
      else {
        const th = state.s.thresholds.find((t) => t.enabled && t.metric === id && (!t.pointIds.length || t.pointIds.includes(p.id)));
        if (th) { const f = fmtMetric(id, th.value); badge.textContent = `limit ${th.op === 'lte' ? '≤' : '≥'} ${f.text} ${f.unit}`; }
        else badge.textContent = card.querySelector('[data-badge].editable') ? 'set limit' : '';
      }
    });
  }

  // ---------------- inline limit editor (popover on a metric card)
  function openLimitEditor(metricId, card) {
    closeLimitEditor();
    const m = BY_ID[metricId];
    const p = pointById(state.selectedId);
    const unit = U.unitFor(m.kind, state.s.units);
    const existing = state.s.thresholds.find((t) => t.metric === metricId && (!t.pointIds.length || (p && t.pointIds.includes(p.id))));
    const pop = document.createElement('div');
    pop.className = 'limit-pop';
    pop.innerHTML = `
      <div class="lp-title">${m.label} — critical limit</div>
      <div class="lp-row">
        <select class="lp-op"><option value="gte">≥ rises to</option><option value="lte">≤ falls to</option></select>
        <input class="lp-val" type="number" step="any" placeholder="limit" />
        <span class="lp-unit">${unit.label}</span>
      </div>
      <label class="lp-scope check"><input type="checkbox" class="lp-point" /> only for ${p ? p.name : 'this point'}</label>
      <div class="lp-actions">
        <button class="btn small lp-remove" type="button" ${existing ? '' : 'hidden'}>Remove</button>
        <span class="lp-gap"></span>
        <button class="btn small lp-cancel" type="button">Cancel</button>
        <button class="btn btn-primary small lp-save" type="button">${existing ? 'Save' : 'Add limit'}</button>
      </div>`;
    const op = pop.querySelector('.lp-op'), val = pop.querySelector('.lp-val'), scope = pop.querySelector('.lp-point');
    if (existing) {
      op.value = existing.op;
      val.value = String(+unit.f(existing.value).toFixed(2));
      scope.checked = existing.pointIds.length > 0;
    } else {
      op.value = m.kind === 'vis' || metricId === 'd_pressureTendency' ? 'lte' : 'gte';
      const v = currentValues(state.selectedId);
      if (v && v[metricId] !== null && v[metricId] !== undefined) val.value = String(+unit.f(v[metricId]).toFixed(1));
    }
    const commit = () => {
      const raw = parseFloat(val.value);
      if (Number.isNaN(raw)) { val.classList.add('invalid'); val.focus(); return; }
      const canonical = unit.inv(raw);
      const pointIds = scope.checked && p ? [p.id] : [];
      if (existing) { existing.op = op.value; existing.value = canonical; existing.pointIds = pointIds; existing.enabled = true; }
      else state.s.thresholds.push({ id: uid(), metric: metricId, op: op.value, value: canonical, enabled: true, pointIds });
      save(); closeLimitEditor(); evaluateAlarms(); renderSelected(); renderAlarms(); renderMapStates();
      const f = fmtMetric(metricId, canonical);
      toast(`${m.label}: alarm ${op.value === 'lte' ? '≤' : '≥'} ${f.text} ${f.unit}`, 'ok');
    };
    pop.querySelector('.lp-save').addEventListener('click', commit);
    val.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') closeLimitEditor(); });
    pop.querySelector('.lp-cancel').addEventListener('click', closeLimitEditor);
    pop.querySelector('.lp-remove').addEventListener('click', () => {
      state.s.thresholds = state.s.thresholds.filter((t) => t !== existing);
      save(); closeLimitEditor(); evaluateAlarms(); renderSelected(); renderAlarms(); renderMapStates();
      toast(`${m.label}: limit removed`);
    });
    pop.addEventListener('click', (ev) => ev.stopPropagation());
    card.appendChild(pop);
    card.classList.add('editing');
    setTimeout(() => { val.focus(); val.select(); }, 30);
    setTimeout(() => document.addEventListener('click', closeLimitEditor, { once: true }), 0);
  }
  function closeLimitEditor() {
    document.querySelectorAll('.limit-pop').forEach((el) => { el.parentElement.classList.remove('editing'); el.remove(); });
  }

  function renderAlarms() {
    const list = $('alarmList');
    list.innerHTML = '';
    if (!state.alarms.length) {
      list.innerHTML = '<div class="empty">No thresholds are close to being reached.</div>';
      $('alarmBanner').hidden = true;
      return;
    }
    state.alarms.forEach((a) => {
      const d = describe(a);
      const el = document.createElement('div');
      el.className = `al ${a.level} ${state.acked.has(a.key) ? 'acked' : ''}`;
      el.innerHTML = `<span class="st"></span><div><div class="t1"></div><div class="t2"></div></div><div><div class="eta"></div>${state.acked.has(a.key) ? '' : '<button class="btn small ack">Ack</button>'}</div>`;
      el.querySelector('.t1').textContent = d.title;
      el.querySelector('.t2').textContent = d.body;
      el.querySelector('.eta').textContent = a.level === 'critical' ? 'NOW' : `T−${fmtEta(a.eta)}`;
      const b = el.querySelector('.ack'); if (b) b.addEventListener('click', () => ack(a.key));
      el.addEventListener('click', () => select(a.pointId));
      list.appendChild(el);
    });
    const unacked = state.alarms.filter((a) => !state.acked.has(a.key));
    const banner = $('alarmBanner');
    if (unacked.length) {
      const top = unacked[0];
      const d = describe(top);
      banner.hidden = false;
      banner.classList.toggle('warning', top.level !== 'critical');
      $('alarmTitle').textContent = d.title + (unacked.length > 1 ? ` (+${unacked.length - 1} more)` : '');
      $('alarmBody').textContent = d.body;
    } else banner.hidden = true;
    renderPoints();
  }

  // ------------------------------------------------------------------ points
  function select(id) {
    state.selectedId = id;
    renderPoints(); renderSelected(); renderMapStates();
  }
  function addPoint(name, lat, lon) {
    if (state.s.points.length >= MAX_POINTS) { toast(`Maximum of ${MAX_POINTS} tracking points`, 'err'); return false; }
    if (!map.inRegion(lat, lon)) { toast(`Coordinates are outside the ${map.region().name} map window`, 'err'); return false; }
    const p = { id: uid(), name: name || `Point ${state.s.points.length + 1}`, lat, lon };
    state.s.points.push(p);
    save();
    state.selectedId = p.id;
    renderAll();
    if (map) map.flyTo(lon, lat, 3);
    refresh('auto');
    return true;
  }
  function removePoint(id) {
    const p = pointById(id);
    state.s.points = state.s.points.filter((x) => x.id !== id);
    delete state.forecasts[id];
    if (state.selectedId === id) state.selectedId = state.s.points.length ? state.s.points[0].id : null;
    save();
    evaluateAlarms();
    renderAll();
    if (p) toast(`Removed ${p.name}`);
  }

  // ------------------------------------------------------------------ modals
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (ev) => { if (ev.target === m) m.hidden = true; }));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; }); });

  function openAddPoint(prefill) {
    $('ptName').value = '';
    $('ptCoords').value = prefill ? `${prefill.lat.toFixed(4)}, ${prefill.lon.toFixed(4)}` : '';
    $('ptCoords').classList.remove('invalid');
    validateCoordsInput();
    openModal('modalPoint');
    setTimeout(() => $('ptName').focus(), 50);
  }
  function validateCoordsInput() {
    const c = U.parseCoords($('ptCoords').value);
    const hint = $('ptCoordsHint');
    if (!$('ptCoords').value.trim()) { const r = map.region(); hint.textContent = `Decimal degrees, degrees-decimal-minutes, or DMS. Window: ${U.fmtLat(r.latMin)}–${U.fmtLat(r.latMax)}, ${U.fmtLon(r.lonMin)}–${U.fmtLon(r.lonMax)}.`; $('ptCoords').classList.remove('invalid'); return null; }
    if (!c) { hint.textContent = 'Could not parse coordinates.'; $('ptCoords').classList.add('invalid'); return null; }
    if (!map.inRegion(c.lat, c.lon)) { hint.textContent = `${U.fmtLat(c.lat)} ${U.fmtLon(c.lon)} — outside the ${map.region().name} map window.`; $('ptCoords').classList.add('invalid'); return null; }
    hint.textContent = `${U.fmtLat(c.lat)}  ${U.fmtLon(c.lon)}`; $('ptCoords').classList.remove('invalid');
    return c;
  }
  $('ptCoords').addEventListener('input', validateCoordsInput);
  $('ptCoords').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('btnSavePoint').click(); });
  $('btnSavePoint').addEventListener('click', () => {
    const c = validateCoordsInput();
    if (!c) return;
    if (addPoint($('ptName').value.trim(), c.lat, c.lon)) closeModal('modalPoint');
  });
  $('btnAddPoint').addEventListener('click', () => openAddPoint(null));
  $('btnRemovePoint').addEventListener('click', () => { if (state.selectedId) removePoint(state.selectedId); });
  $('btnFly').addEventListener('click', () => { const p = pointById(state.selectedId); if (p && map) map.flyTo(p.lon, p.lat, 4); });
  $('btnResetView').addEventListener('click', () => map && map.resetView());
  $('btnRefresh').addEventListener('click', () => refresh('manual'));
  $('btnAckAll').addEventListener('click', ackAll);
  $('btnMute').addEventListener('click', () => { state.s.muted = !state.s.muted; save(); updateAudio(); renderStatus(); toast(state.s.muted ? 'Audible alerts muted' : 'Audible alerts on'); });

  // ---------------- settings
  function openSettings() {
    const s = state.s;
    $('setProvider').value = s.provider; $('setRefresh').value = String(s.refreshMin); $('setSgSource').value = s.sgSource;
    $('setRegion').value = s.region; $('setProjection').value = s.projection;
    $('setApiKey').value = ''; $('setApiKey').placeholder = state.hasKey ? '•••••••• key stored (paste to replace)' : 'paste key from dashboard.stormglass.io';
    $('setLead').value = s.leadMin; $('setLeadOut').textContent = `${s.leadMin} min`;
    $('setVolume').value = s.volume; $('setVolumeOut').textContent = `${s.volume} %`;
    $('setSound').checked = s.sound; $('setNotify').checked = s.notify; $('setFlash').checked = s.flash;
    $('unitSpeed').value = s.units.speed; $('unitLength').value = s.units.length; $('unitTemp').value = s.units.temp; $('unitVis').value = s.units.vis;
    renderMetricPicker(); renderThresholdList(); renderThresholdAdd(); renderBudget();
    $('settingsNote').textContent = '';
    openModal('modalSettings');
  }
  $('btnSettings').addEventListener('click', openSettings);
  document.querySelectorAll('#settingsTabs .tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('#settingsTabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === t.dataset.tab));
  }));
  $('setProvider').addEventListener('change', () => { $('sgFields').style.display = $('setProvider').value === 'stormglass' ? '' : 'none'; renderBudget(); renderMetricPicker(); });
  $('setRefresh').addEventListener('change', renderBudget);
  $('setLead').addEventListener('input', () => { $('setLeadOut').textContent = `${$('setLead').value} min`; });
  $('setVolume').addEventListener('input', () => { $('setVolumeOut').textContent = `${$('setVolume').value} %`; WA.audio.setVolume($('setVolume').value / 100); });
  $('btnTestWarn').addEventListener('click', () => WA.audio.play('warning'));
  $('btnTestCrit').addEventListener('click', () => WA.audio.play('critical'));

  function renderBudget() {
    const prov = $('setProvider').value, every = Number($('setRefresh').value), n = Math.max(1, state.s.points.length);
    const perDay = Math.round(1440 / every);
    const box = $('budgetBox');
    $('sgFields').style.display = prov === 'stormglass' ? '' : 'none';
    if (prov === 'stormglass') {
      const calls = n * perDay;
      const quota = state.quota ? state.quota.quota : 10;
      box.classList.toggle('over', calls > quota);
      box.innerHTML = `<b>Request budget:</b> ${n} point${n > 1 ? 's' : ''} × ${perDay} refreshes/day = <b>${calls} requests/day</b>. ` +
        `Your quota: ${quota}/day${state.quota ? '' : ' (free plan; paid plans 500 / 5 000 / 25 000)'}. ` +
        (calls > quota ? 'This exceeds the quota — increase the interval or upgrade. ' : '') +
        `Alarms are re-evaluated every 30 s from the cached 72 h forecast, so a longer interval does not delay alerts.`;
    } else {
      box.classList.remove('over');
      box.innerHTML = `<b>Request budget:</b> Open-Meteo returns all points in one call (2 calls per refresh, ${2 * perDay}/day). Free tier allows 10 000/day for non-commercial use; commercial use requires a paid API key (from $29/month).`;
    }
  }

  function renderMetricPicker() {
    const prov = $('setProvider').value;
    const wrap = $('metricPicker');
    wrap.innerHTML = '';
    WA.GROUP_ORDER.forEach((g) => {
      const items = [...METRICS, ...DERIVED].filter((m) => m.group === g);
      if (!items.length) return;
      const grp = document.createElement('div'); grp.className = 'mp-group';
      grp.innerHTML = `<h4>${g}</h4><div class="mp-items"></div>`;
      items.forEach((m) => {
        const has = m.id.startsWith('d_') ? true : prov === 'stormglass' ? Boolean(m.sg) : Boolean(m.om);
        const u = U.unitFor(m.kind, state.s.units);
        const lab = document.createElement('label'); lab.className = `mp-item ${has ? '' : 'na'}`;
        lab.innerHTML = `<input type="checkbox" data-mid="${m.id}" ${state.s.display.includes(m.id) ? 'checked' : ''}/><span>${m.label}</span><span class="u">${m.kind === 'text' ? '' : u.label}</span>`;
        lab.title = has ? '' : 'Not provided by the selected provider';
        grp.querySelector('.mp-items').appendChild(lab);
      });
      wrap.appendChild(grp);
    });
  }

  function thresholdable() { return [...METRICS, ...DERIVED].filter((m) => m.threshold && m.kind !== 'text'); }
  function renderThresholdAdd() {
    const sel = $('thMetric');
    sel.innerHTML = thresholdable().map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    const upd = () => { const m = BY_ID[sel.value]; $('thUnit').textContent = U.unitFor(m.kind, state.s.units).label; };
    sel.onchange = upd; upd();
  }
  function renderThresholdList() {
    const list = $('thresholdList');
    list.innerHTML = '';
    if (!state.s.thresholds.length) list.innerHTML = '<div class="empty">No thresholds yet.</div>';
    state.s.thresholds.forEach((t) => {
      const m = BY_ID[t.metric]; if (!m) return;
      const f = U.fmt(m.kind, t.value, state.s.units);
      const el = document.createElement('div'); el.className = 'th';
      el.innerHTML = `<input type="checkbox" ${t.enabled ? 'checked' : ''} title="Enabled"/><span class="name">${m.label}</span><span class="rule">${t.op === 'lte' ? '≤' : '≥'} ${f.text} ${f.unit}</span>` +
        `<select class="scope"><option value="">All points</option>${state.s.points.map((p) => `<option value="${p.id}" ${t.pointIds.includes(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}</select>` +
        `<button class="icon-btn small danger" title="Delete"><span class="ico ico-trash"></span></button>`;
      el.querySelector('input').addEventListener('change', (ev) => { t.enabled = ev.target.checked; });
      el.querySelector('.scope').addEventListener('change', (ev) => { t.pointIds = ev.target.value ? [ev.target.value] : []; });
      el.querySelector('button').addEventListener('click', () => { state.s.thresholds = state.s.thresholds.filter((x) => x.id !== t.id); renderThresholdList(); });
      list.appendChild(el);
    });
  }
  $('btnAddThreshold').addEventListener('click', () => {
    const m = BY_ID[$('thMetric').value];
    const raw = parseFloat($('thValue').value);
    if (!m || Number.isNaN(raw)) { toast('Enter a numeric limit', 'err'); return; }
    const canonical = U.unitFor(m.kind, state.s.units).inv(raw);
    state.s.thresholds.push({ id: uid(), metric: m.id, op: $('thOp').value, value: canonical, enabled: true, pointIds: [] });
    $('thValue').value = '';
    renderThresholdList();
  });

  $('btnSaveSettings').addEventListener('click', async () => {
    const s = state.s;
    const prevProvider = s.provider, prevUnits = JSON.stringify(s.units);
    const prevRegion = s.region, prevProj = s.projection;
    s.provider = $('setProvider').value; s.refreshMin = Number($('setRefresh').value); s.sgSource = $('setSgSource').value;
    s.region = $('setRegion').value; s.projection = $('setProjection').value;
    s.leadMin = Number($('setLead').value); s.volume = Number($('setVolume').value);
    s.sound = $('setSound').checked; s.notify = $('setNotify').checked; s.flash = $('setFlash').checked;
    s.units = { speed: $('unitSpeed').value, length: $('unitLength').value, temp: $('unitTemp').value, vis: $('unitVis').value };
    s.display = [...document.querySelectorAll('#metricPicker input[data-mid]:checked')].map((i) => i.dataset.mid);
    const key = $('setApiKey').value.trim();
    if (key) { await window.bridge.setApiKey(key); state.hasKey = true; }
    if (s.provider === 'stormglass' && !state.hasKey) { $('settingsNote').textContent = 'Stormglass needs an API key.'; return; }
    WA.audio.setVolume(s.volume / 100);
    if (prevRegion !== s.region || prevProj !== s.projection) { map.setRegion(s.region, s.projection); $('brandSub').textContent = `Maritime threshold watch · ${map.region().name}`; }
    save(); schedule(); closeModal('modalSettings');
    if (prevProvider !== s.provider || key) { state.forecasts = {}; state.quota = null; }
    if (prevUnits !== JSON.stringify(s.units)) state.lastShown = {};
    evaluateAlarms(); renderAll();
    if (prevProvider !== s.provider || key || !state.lastRefresh) refresh('auto');
    toast('Settings applied', 'ok');
  });

  // ------------------------------------------------------------------ boot
  async function boot() {
    await load();
    WA.audio.setVolume(state.s.volume / 100);
    map = WA.map.createMap($('map'), {
      onSelect: select,
      onMapClick: (ll) => { if (state.s.points.length < MAX_POINTS) openAddPoint(ll); },
      onHover: (ll) => { $('coordReadout').textContent = `${U.fmtLat(ll.lat)}  ${U.fmtLon(ll.lon)}`; },
      loadData: (dataset, res) => window.bridge.loadMapData(dataset, res),
      onLod: (res) => { const names = { c: 'crude', l: 'low', i: 'intermediate', h: 'high', f: 'full', ne: 'Natural Earth 50 m' }; $('lodText').textContent = `coastline: ${names[res] || res}`; },
      onGrid: (step) => { const m = Math.round(step * 60); $('gridText').textContent = `grid ${step >= 1 ? step + '°' : m + "'"}`; }
    });
    map.setRegion(state.s.region, state.s.projection);
    $('brandSub').textContent = `Maritime threshold watch · ${map.region().name}`;
    if (state.s.points.length && !state.selectedId) state.selectedId = state.s.points[0].id;
    tickClock(); setInterval(tickClock, 1000);
    renderAll();
    schedule();
    refresh('auto');
  }
  boot();
})();
