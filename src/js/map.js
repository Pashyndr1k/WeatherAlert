// Vector map of the Black Sea & Sea of Azov with multiple levels of detail (GSHHG c/l/i/h/f),
// Mercator or Albers conic projection,
// adaptive labelled lat/lon graticule, port labels, pan/zoom, click-to-add, animated markers.
(function () {
  'use strict';
  const WA = (window.WA = window.WA || {});

  const REGIONS = {
    blacksea: {
      name: 'Black Sea & Sea of Azov',
      lonMin: 26.5, lonMax: 42.5, latMin: 39.8, latMax: 47.8,
      dataset: 'gshhg',
      // GSHHG resolution by zoom factor k (fitted view = 1)
      lod: [[1, 'i'], [2.2, 'h'], [4.5, 'f']],
      ports: [
        ['Istanbul', 41.02, 28.98], ['Varna', 43.20, 27.92], ['Burgas', 42.49, 27.48], ['Constanța', 44.17, 28.65],
        ['Odessa', 46.48, 30.73], ['Chornomorsk', 46.30, 30.66], ['Kherson', 46.63, 32.62], ['Sevastopol', 44.60, 33.52],
        ['Yalta', 44.50, 34.17], ['Feodosiya', 45.03, 35.38], ['Kerch', 45.36, 36.47], ['Berdyansk', 46.76, 36.78],
        ['Mariupol', 47.10, 37.55], ['Taganrog', 47.22, 38.92], ['Rostov-na-Donu', 47.22, 39.72], ['Yeysk', 46.71, 38.27],
        ['Novorossiysk', 44.72, 37.77], ['Tuapse', 44.10, 39.07], ['Sochi', 43.58, 39.72], ['Sukhumi', 43.00, 41.02],
        ['Poti', 42.15, 41.67], ['Batumi', 41.65, 41.64], ['Trabzon', 41.00, 39.72], ['Samsun', 41.29, 36.33],
        ['Sinop', 42.03, 35.15], ['Zonguldak', 41.46, 31.79], ['Ereğli', 41.28, 31.42]
      ]
    }
  };

  const PROJECTIONS = {
    mercator: () => d3.geoMercator(),
    // Albers equal-area conic, standard parallels 46°15'N / 41°15'N — as on the reference chart
    albers: () => d3.geoConicEqualArea().parallels([41.25, 46.25]).rotate([-34.5, 0])
  };

  // Graticule step (degrees) by projected pixels per degree of longitude
  function gridStep(pxPerDeg) {
    // smallest step whose lines sit at least ~80 px apart (keeps edge labels from colliding)
    for (const step of [1 / 12, 1 / 6, 0.5, 1, 2, 5, 10]) if (step * pxPerDeg >= 50) return step;
    return 10;
  }
  function fmtDeg(v, isLat) {
    const a = Math.abs(v), d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60);
    const h = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
    return m ? `${d}°${String(m).padStart(2, '0')}'${h}` : `${d}°${h}`;
  }

  function createMap(container, handlers) {
    const svg = d3.select(container).append('svg').attr('class', 'map-svg');
    const defs = svg.append('defs');
    const grad = defs.append('radialGradient').attr('id', 'sea').attr('cx', '50%').attr('cy', '45%').attr('r', '75%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#123252');
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#08182a');
    const clipRect = defs.append('clipPath').attr('id', 'mapclip').append('rect');

    const bg = svg.append('rect').attr('class', 'sea').attr('fill', 'url(#sea)');
    const root = svg.append('g').attr('class', 'root').attr('clip-path', 'url(#mapclip)');
    const gGrat = root.append('g').attr('class', 'graticule');
    const gLand = root.append('g').attr('class', 'land');
    const gLakes = root.append('g').attr('class', 'lakes');
    const gRivers = root.append('g').attr('class', 'rivers');
    const gBorders = root.append('g').attr('class', 'borders');
    const gRegion = root.append('g').attr('class', 'region');
    const gCurrents = root.append('g').attr('class', 'currents');
    const gRuler = root.append('g').attr('class', 'ruler');
    const gPorts = root.append('g').attr('class', 'ports');
    const gMarkers = root.append('g').attr('class', 'markers');
    const gLabels = svg.append('g').attr('class', 'grid-labels'); // screen-space, not zoomed
    const gRulerLabels = svg.append('g').attr('class', 'ruler-labels'); // screen-space leg distances

    const region = REGIONS.blacksea;
    let projKey = 'mercator';
    let projection = PROJECTIONS.mercator();
    let path = d3.geoPath(projection);
    let width = 10, height = 10, k = 1;
    let transform = d3.zoomIdentity;
    let points = [], states = {}, selectedId = null;
    const cache = {};   // `${dataset}:${res}` → { land, lakes, borders, rivers } GeoJSON feature arrays
    let currentRes = null;
    let loading = null;
    let seaMask = null, currentVectors = [], vecScale = 1;
    const layers = { currents: true };

    const zoom = d3.zoom().scaleExtent([1, 60]).on('zoom', (ev) => {
      transform = ev.transform; k = transform.k;
      root.attr('transform', transform);
      root.selectAll('.marker').attr('transform', markerTransform);
      root.selectAll('.port').attr('transform', portTransform);
      root.selectAll('.cvec').attr('transform', vecTransform);
      updateStrokes();
      drawGraticule();
      drawRuler();
      ensureLod();
    });
    svg.call(zoom).on('dblclick.zoom', null);

    function markerTransform(d) { const [x, y] = projection([d.lon, d.lat]); return `translate(${x},${y}) scale(${1 / k})`; }
    function portTransform(d) { const [x, y] = projection([d[2], d[1]]); return `translate(${x},${y}) scale(${1 / k})`; }
    function vecTransform(d) { const [x, y] = projection([d.lon, d.lat]); return `translate(${x},${y}) scale(${1 / k}) rotate(${d.dir})`; }
    function updateStrokes() {
      gLand.selectAll('path').attr('stroke-width', 0.9 / k);
      gLakes.selectAll('path').attr('stroke-width', 0.5 / k);
      gRivers.selectAll('path').attr('stroke-width', 0.7 / k);
      gBorders.selectAll('path').attr('stroke-width', 0.6 / k);
      gRegion.selectAll('path').attr('stroke-width', 1 / k);
      gGrat.selectAll('path').attr('stroke-width', 0.6 / k);
      gPorts.style('display', k >= 1.6 ? null : 'none');
    }

    // ---------- fit / resize ----------
    function fitFeature() {
      const c = [];
      const dx = (region.lonMax - region.lonMin) / 8, dy = (region.latMax - region.latMin) / 8;
      for (let lon = region.lonMin; lon <= region.lonMax + 1e-9; lon += dx) c.push([lon, region.latMin], [lon, region.latMax]);
      for (let lat = region.latMin; lat <= region.latMax + 1e-9; lat += dy) c.push([region.lonMin, lat], [region.lonMax, lat]);
      return { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: c } };
    }
    function regionOutline() {
      const ring = [], step = 0.25;
      for (let lon = region.lonMin; lon <= region.lonMax; lon += step) ring.push([lon, region.latMax]);
      for (let lat = region.latMax; lat >= region.latMin; lat -= step) ring.push([region.lonMax, lat]);
      for (let lon = region.lonMax; lon >= region.lonMin; lon -= step) ring.push([lon, region.latMin]);
      for (let lat = region.latMin; lat <= region.latMax; lat += step) ring.push([region.lonMin, lat]);
      ring.push([region.lonMin, region.latMax]);
      return { type: 'Feature', geometry: { type: 'LineString', coordinates: ring } };
    }
    function resize() {
      const r = container.getBoundingClientRect();
      width = Math.max(10, r.width); height = Math.max(10, r.height);
      svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
      bg.attr('width', width).attr('height', height);
      clipRect.attr('width', width).attr('height', height);
      projection.fitExtent([[34, 24], [width - 12, height - 26]], fitFeature());
      // Restrict panning to the map window: the user can never drag beyond the region outline.
      const b = path.bounds(regionOutline());
      zoom.translateExtent([[b[0][0] - 2, b[0][1] - 2], [b[1][0] + 2, b[1][1] + 2]]);
      redrawStatic();
      renderMarkers();
      renderPorts();
      drawGraticule();
      drawRuler();
    }

    // ---------- static layers ----------
    function redrawStatic() {
      const data = currentRes ? cache[`${region.dataset}:${currentRes}`] : null;
      const layer = (g, feats) => g.selectAll('path').data(feats || []).join('path').attr('d', path);
      layer(gLand, data && data.land);
      layer(gLakes, data && data.lakes);
      layer(gRivers, data && data.rivers);
      layer(gBorders, data && data.borders);
      gRegion.selectAll('path').data([regionOutline()]).join('path').attr('d', path);
      renderCurrents();
      updateStrokes();
    }
    function renderCurrents() {
      gCurrents.style('display', layers.currents ? null : 'none');
      const sel = gCurrents.selectAll('g.cvec').data(currentVectors, (d) => `${d.lat},${d.lon}`);
      const enter = sel.enter().append('g').attr('class', 'cvec');
      enter.append('path').attr('class', 'shaft');
      enter.append('path').attr('class', 'head').attr('d', 'M-3,3 L0,-2 L3,3 Z'); // tip at the top: rotate(0) = flowing north
      enter.append('title');
      sel.exit().remove();
      const all = gCurrents.selectAll('g.cvec');
      all.attr('transform', vecTransform)
        .attr('data-spd', (d) => (d.speed >= 0.5 ? 'hi' : d.speed >= 0.25 ? 'mid' : 'lo'));
      const len = (d) => Math.min(26, 6 + d.speed * 40) * vecScale;
      all.select('path.shaft').attr('d', (d) => `M0,${-len(d) / 2} L0,${len(d) / 2}`);
      all.select('path.head').attr('transform', (d) => `translate(0,${-len(d) / 2}) scale(${Math.max(0.6, vecScale)})`);
      all.select('title').text((d) => `${(d.speed * 1.943844).toFixed(2)} kn → ${Math.round(d.dir)}°`);
    }
    // Vectors: [{lat, lon, speed(m/s), dir(towards °)}]
    function setCurrents(vectors, scale) { currentVectors = vectors || []; vecScale = scale || 1; renderCurrents(); }
    function setLayer(name, on) { layers[name] = Boolean(on); redrawStatic(); }
    // Coastline mask for the currents lattice: the low-resolution land polygons, loaded once.
    async function loadSeaMask() {
      if (seaMask) return;
      const land = toLayers(await handlers.loadData(region.dataset, 'l')).land;
      seaMask = land.map((f) => ({ f, b: d3.geoBounds(f) }));
    }
    // Is this lon/lat on the water? Without the mask every point counts as sea (land points simply return no data).
    function isSea(lon, lat) {
      if (!seaMask) return true;
      return !seaMask.some(({ f, b }) => lon >= b[0][0] && lon <= b[1][0] && lat >= b[0][1] && lat <= b[1][1] && d3.geoContains(f, [lon, lat]));
    }

    // Graticule adapts to zoom; labels are drawn in screen space along the left and bottom edges.
    function drawGraticule() {
      const midLat = (region.latMin + region.latMax) / 2;
      const pxPerDeg = Math.abs(projection([region.lonMin + 1, midLat])[0] - projection([region.lonMin, midLat])[0]) * k;
      const step = gridStep(pxPerDeg);
      const g = d3.geoGraticule().step([step, step]).extent([[region.lonMin - 20, Math.max(-85, region.latMin - 15)], [region.lonMax + 20, Math.min(85, region.latMax + 15)]]);
      gGrat.selectAll('path').data([g()]).join('path').attr('d', path).attr('stroke-width', 0.6 / k);

      const labels = [];
      const inv = (px, py) => { const p = projection.invert(transform.invert([px, py])); return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null; };
      const tl = inv(0, 0), br = inv(width, height), bl = inv(0, height), tr = inv(width, 0);
      if (tl && br && bl && tr) {
        const lonMin = Math.min(tl[0], bl[0]), lonMax = Math.max(tr[0], br[0]);
        const latMin = Math.min(bl[1], br[1]), latMax = Math.max(tl[1], tr[1]);
        const bottom = inv(width / 2, height - 1), left = inv(1, height / 2);
        if (bottom) for (let lon = Math.ceil(lonMin / step) * step; lon <= lonMax; lon += step) {
          const p = transform.apply(projection([lon, bottom[1]]));
          if (p[0] > 40 && p[0] < width - 30) labels.push({ x: p[0], y: height - 6, t: fmtDeg(lon, false), a: 'middle' });
        }
        if (left) for (let lat = Math.ceil(latMin / step) * step; lat <= latMax; lat += step) {
          const p = transform.apply(projection([left[0], lat]));
          if (p[1] > 20 && p[1] < height - 20) labels.push({ x: 6, y: p[1] + 4, t: fmtDeg(lat, true), a: 'start' });
        }
      }
      gLabels.selectAll('text').data(labels).join('text').attr('x', (d) => d.x).attr('y', (d) => d.y).attr('text-anchor', (d) => d.a).text((d) => d.t);
      if (handlers.onGrid) handlers.onGrid(step);
    }

    // ---------- level of detail ----------
    function resFor(kk) {
      let res = region.lod[0][1];
      for (const [minK, r] of region.lod) if (kk >= minK) res = r;
      return res;
    }
    async function ensureLod() {
      const res = resFor(k);
      if (res === currentRes) return;
      const key = `${region.dataset}:${res}`;
      if (!cache[key]) {
        if (loading === key) return;
        loading = key;
        try {
          const topo = await handlers.loadData(region.dataset, res);
          cache[key] = toLayers(topo);
        } catch (e) {
          console.error('map data load failed', e);
          loading = null;
          return;
        }
        loading = null;
        if (resFor(k) !== res) { ensureLod(); return; }
      }
      currentRes = res;
      redrawStatic();
      if (handlers.onLod) handlers.onLod(res);
    }
    function toLayers(topo) {
      const f = (name) => (topo.objects[name] ? topojson.feature(topo, topo.objects[name]).features : []);
      return { land: f('land'), lakes: f('lakes'), rivers: f('rivers'), borders: f('borders') };
    }

    // ---------- ports ----------
    function renderPorts() {
      const sel = gPorts.selectAll('g.port').data(region.ports, (d) => d[0]);
      const enter = sel.enter().append('g').attr('class', 'port');
      enter.append('circle').attr('r', 2.2);
      enter.append('text').attr('x', 5).attr('y', 3).text((d) => d[0]);
      sel.exit().remove();
      gPorts.selectAll('g.port').attr('transform', portTransform);
    }

    // ---------- markers ----------
    function renderMarkers() {
      const sel = gMarkers.selectAll('g.marker').data(points, (d) => d.id);
      const enter = sel.enter().append('g').attr('class', 'marker').attr('transform', markerTransform).style('opacity', 0);
      enter.append('circle').attr('class', 'ring').attr('r', 13).attr('cy', -6);
      enter.append('g').attr('class', 'arrow').append('path').attr('d', 'M0,-30 L4,-22 L1.5,-22 L1.5,-14 L-1.5,-14 L-1.5,-22 L-4,-22 Z');
      enter.append('g').attr('class', 'carrow').append('path').attr('d', 'M0,-30 L4,-22 L1.5,-22 L1.5,-14 L-1.5,-14 L-1.5,-22 L-4,-22 Z');
      // downward triangle 14 x 12 whose tip sits exactly on the coordinate
      enter.append('path').attr('class', 'tri').attr('d', 'M-7,-12 L7,-12 L0,0 Z');
      enter.append('text').attr('class', 'label').attr('x', 0).attr('y', 14);
      enter.append('text').attr('class', 'sub').attr('x', 0).attr('y', 26);
      enter.on('click', (ev, d) => { ev.stopPropagation(); handlers.onSelect && handlers.onSelect(d.id); });
      enter.transition().duration(450).style('opacity', 1);
      sel.exit().transition().duration(300).style('opacity', 0).remove();
      const all = gMarkers.selectAll('g.marker');
      all.attr('transform', markerTransform)
        .classed('selected', (d) => d.id === selectedId)
        .classed('warning', (d) => (states[d.id] || {}).level === 'warning')
        .classed('critical', (d) => (states[d.id] || {}).level === 'critical');
      all.select('text.label').text((d) => { const st = states[d.id] || {}; return st.level === 'critical' && st.critText ? `${d.name} · ${st.critText}` : d.name; });
      all.select('text.sub').text((d) => (states[d.id] || {}).sub || '');
      all.select('g.arrow').style('display', (d) => (states[d.id] && states[d.id].windDir !== null && states[d.id].windDir !== undefined ? null : 'none'))
        .transition().duration(900).ease(d3.easeCubicOut)
        .attr('transform', (d) => `rotate(${((states[d.id] || {}).windDir || 0) + 180})`);
      // current drift arrow: only for sea points (current data present); direction is "towards"
      all.select('g.carrow').style('display', (d) => (states[d.id] && states[d.id].curDir !== null && states[d.id].curDir !== undefined ? null : 'none'))
        .transition().duration(900).ease(d3.easeCubicOut)
        .attr('transform', (d) => `rotate(${(states[d.id] || {}).curDir || 0})`);
      gMarkers.selectAll('g.marker').filter((d) => d.id === selectedId).raise();
    }

    // ---------- measuring ruler + route planner ----------
    // tool.mode: null | 'measure' | 'plan'. The ruler is transient (cleared when switched off); the planned route
    // persists until cleared from the panel, is drawn dimmed while the planner is off, and can be edited by dragging.
    const R_KM = 6371.0088, toR = Math.PI / 180;
    const tool = { mode: null, fmt: null };
    const measure = { pts: [], done: false, cursor: null };
    const route = { pts: [], done: false, cursor: null, shipKm: 0, colorAt: null, dragging: false };
    function distKm(a, b) {
      const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
      return 2 * R_KM * Math.asin(Math.sqrt(h));
    }
    function bearingDeg(a, b) {
      const y = Math.sin((b.lon - a.lon) * toR) * Math.cos(b.lat * toR);
      const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lon - a.lon) * toR);
      return (Math.atan2(y, x) / toR + 360) % 360;
    }
    const legsOf = (pts) => { const out = []; for (let i = 1; i < pts.length; i++) out.push({ a: pts[i - 1], b: pts[i], km: distKm(pts[i - 1], pts[i]), brg: bearingDeg(pts[i - 1], pts[i]) }); return out; };
    const totalOf = (pts) => legsOf(pts).reduce((s, l) => s + l.km, 0);
    // Position km along the route (clamped), interpolated on the great-circle leg
    function routePoint(km) {
      const pts = route.pts, total = totalOf(pts); let rem = Math.max(0, Math.min(km, total));
      for (let i = 1; i < pts.length; i++) {
        const d = distKm(pts[i - 1], pts[i]);
        if (rem <= d || i === pts.length - 1) {
          const f = d ? Math.min(1, rem / d) : 0;
          const [lon, lat] = d3.geoInterpolate([pts[i - 1].lon, pts[i - 1].lat], [pts[i].lon, pts[i].lat])(f);
          return { lon, lat, km: Math.min(Math.max(0, km), total), totalKm: total, leg: i };
        }
        rem -= d;
      }
      return pts.length ? { lon: pts[0].lon, lat: pts[0].lat, km: 0, totalKm: total, leg: 1 } : null;
    }
    function measureSummary() {
      const legs = legsOf(measure.pts);
      const cursorLeg = tool.mode === 'measure' && !measure.done && measure.cursor && measure.pts.length ? (() => { const a = measure.pts[measure.pts.length - 1]; return { km: distKm(a, measure.cursor), brg: bearingDeg(a, measure.cursor) }; })() : null;
      return { active: tool.mode === 'measure', done: measure.done, points: measure.pts.slice(), legs, cursorLeg, totalKm: legs.reduce((s, l) => s + l.km, 0) };
    }
    function routeSummary() {
      const legs = legsOf(route.pts), totalKm = legs.reduce((s, l) => s + l.km, 0);
      const ship = route.done && route.pts.length >= 2 ? routePoint(route.shipKm) : null;
      return { active: tool.mode === 'plan', done: route.done, drawing: tool.mode === 'plan' && !route.done && route.pts.length > 0, points: route.pts.map((p) => ({ lat: p.lat, lon: p.lon })), legs, totalKm, ship, dragging: route.dragging };
    }
    function emitMeasure() { if (handlers.onMeasure) handlers.onMeasure(measureSummary()); }
    function emitRoute() { if (handlers.onRoute) handlers.onRoute(routeSummary()); }
    // Snap a pointer position to the nearest point of the route (projected space) → km along the route
    function kmAtPointer(ev) {
      const [sx, sy] = d3.pointer(ev.sourceEvent || ev, svg.node()); const [mx, my] = transform.invert([sx, sy]);
      let best = null, acc = 0;
      for (let i = 1; i < route.pts.length; i++) {
        const a = projection([route.pts[i - 1].lon, route.pts[i - 1].lat]), b = projection([route.pts[i].lon, route.pts[i].lat]);
        const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
        const f = len2 ? Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / len2)) : 0;
        const d2 = (mx - (a[0] + dx * f)) ** 2 + (my - (a[1] + dy * f)) ** 2;
        const legKm = distKm(route.pts[i - 1], route.pts[i]);
        if (!best || d2 < best.d2) best = { d2, km: acc + legKm * f };
        acc += legKm;
      }
      return best ? best.km : 0;
    }
    function pointerLonLat(ev) { const [sx, sy] = d3.pointer(ev.sourceEvent || ev, svg.node()); const ll = projection.invert(transform.invert([sx, sy])); return ll ? { lon: ll[0], lat: ll[1] } : null; }
    const place = (sel) => sel.attr('transform', (d) => { const [x, y] = projection([d.lon, d.lat]); return `translate(${x},${y}) scale(${1 / k})`; });
    const line = (a, b) => path({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] });

    function drawMeasure() {
      const segs = legsOf(measure.pts).map((l) => ({ a: l.a, b: l.b, live: false }));
      if (tool.mode === 'measure' && !measure.done && measure.cursor && measure.pts.length) segs.push({ a: measure.pts[measure.pts.length - 1], b: measure.cursor, live: true });
      gRuler.selectAll('path.leg').data(segs).join('path').attr('class', (s) => `leg${s.live ? ' live' : ''}`)
        .attr('d', (s) => line(s.a, s.b)).attr('stroke-width', 1.4 / k).attr('stroke-dasharray', (s) => (s.live ? `${2 / k} ${3 / k}` : `${6 / k} ${3 / k}`));
      const wp = gRuler.selectAll('g.wp').data(measure.pts).join((enter) => { const g = enter.append('g').attr('class', 'wp'); g.append('circle').attr('r', 4); g.append('text').attr('y', -8); return g; });
      place(wp); wp.select('text').text((d, i) => i + 1);
      const labels = segs.map((s) => { const mid = d3.geoInterpolate([s.a.lon, s.a.lat], [s.b.lon, s.b.lat])(0.5); const p = transform.apply(projection(mid)); return { x: p[0], y: p[1] - 7, live: s.live, t: tool.fmt ? tool.fmt(distKm(s.a, s.b), bearingDeg(s.a, s.b)) : '' }; });
      gRulerLabels.selectAll('text.m').data(labels).join('text').attr('class', (d) => `m${d.live ? ' live' : ''}`).attr('x', (d) => d.x).attr('y', (d) => d.y).text((d) => d.t);
    }
    function drawRoute() {
      const on = tool.mode === 'plan';
      gRuler.classed('dim', !on && route.pts.length > 0);
      // solid line in short pieces so each can take the colour of the weather the ship meets there
      const pieces = [];
      let acc = 0;
      legsOf(route.pts).forEach((l) => {
        const n = Math.max(1, Math.ceil(l.km / 8));
        const ip = d3.geoInterpolate([l.a.lon, l.a.lat], [l.b.lon, l.b.lat]);
        for (let i = 0; i < n; i++) { const [lon0, lat0] = ip(i / n), [lon1, lat1] = ip((i + 1) / n); pieces.push({ a: { lon: lon0, lat: lat0 }, b: { lon: lon1, lat: lat1 }, km: acc + l.km * (i + 0.5) / n }); }
        acc += l.km;
      });
      gRuler.selectAll('path.rseg').data(pieces).join('path').attr('class', 'rseg').attr('d', (s) => line(s.a, s.b)).attr('stroke-width', 2.2 / k)
        .attr('stroke', (s) => (route.done && route.colorAt ? route.colorAt(s.km) : null) || null);
      const live = on && !route.done && route.cursor && route.pts.length ? [{ a: route.pts[route.pts.length - 1], b: route.cursor }] : [];
      gRuler.selectAll('path.rlive').data(live).join('path').attr('class', 'rlive').attr('d', (s) => line(s.a, s.b)).attr('stroke-width', 1.4 / k).attr('stroke-dasharray', `${2 / k} ${3 / k}`);
      // waypoints: numbered, draggable once the route is laid, last one extends, right-click deletes
      const wp = gRuler.selectAll('g.rwp').data(route.pts).join((enter) => {
        const g = enter.append('g').attr('class', 'rwp');
        g.append('circle').attr('class', 'hit').attr('r', 11); g.append('circle').attr('class', 'ring').attr('r', 5); g.append('text').attr('y', -10);
        g.call(d3.drag().filter((ev) => tool.mode === 'plan' && route.done && !ev.button)
          .on('start', (ev) => { ev.sourceEvent.stopPropagation(); route.dragging = true; })
          .on('drag', (ev, d) => { const ll = pointerLonLat(ev); if (!ll) return; d.lon = ll.lon; d.lat = ll.lat; route.shipKm = Math.min(route.shipKm, totalOf(route.pts)); drawRoute(); emitRoute(); })
          .on('end', () => { route.dragging = false; drawRoute(); emitRoute(); }));
        g.on('click', (ev, d) => { if (tool.mode !== 'plan') return; ev.stopPropagation(); if (route.done && route.pts.indexOf(d) === route.pts.length - 1) { route.done = false; drawRoute(); emitRoute(); } });
        g.on('contextmenu', (ev, d) => { if (tool.mode !== 'plan' || !route.done) return; ev.preventDefault(); ev.stopPropagation(); route.pts = route.pts.filter((x) => x !== d); if (route.pts.length < 2) { route.pts = []; route.done = false; } route.shipKm = Math.min(route.shipKm, totalOf(route.pts)); drawRoute(); emitRoute(); });
        return g;
      });
      place(wp); wp.select('text').text((d, i) => i + 1);
      wp.classed('ext', (d) => on && route.done && route.pts.indexOf(d) === route.pts.length - 1).classed('mv', on && route.done);
      // ship: pulsing ring, generous hit area, dragged along the route
      const sp = route.done && route.pts.length >= 2 ? [routePoint(route.shipKm)] : [];
      const ship = gRuler.selectAll('g.ship').data(sp).join((enter) => {
        const g = enter.append('g').attr('class', 'ship');
        g.append('circle').attr('class', 'hit').attr('r', 16); g.append('circle').attr('class', 'pulse').attr('r', 12); g.append('circle').attr('class', 'dot').attr('r', 7);
        g.call(d3.drag().filter((ev) => tool.mode === 'plan' && !ev.button).on('start', (ev) => { ev.sourceEvent.stopPropagation(); }).on('drag', (ev) => { route.shipKm = kmAtPointer(ev); drawRoute(); emitRoute(); }));
        g.on('click', (ev) => ev.stopPropagation());
        return g;
      });
      place(ship); ship.classed('off', !on);
      const labels = legsOf(route.pts).map((l) => { const mid = d3.geoInterpolate([l.a.lon, l.a.lat], [l.b.lon, l.b.lat])(0.5); const p = transform.apply(projection(mid)); return { x: p[0], y: p[1] - 8, t: tool.fmt ? tool.fmt(l.km, l.brg) : '' }; });
      gRulerLabels.selectAll('text.r').data(on ? labels : []).join('text').attr('class', 'r').attr('x', (d) => d.x).attr('y', (d) => d.y).text((d) => d.t);
    }
    function drawRuler() { drawMeasure(); drawRoute(); }

    // ----- public tool API
    // fmt(km, bearing) renders the on-map leg label in the app's units
    function setTool(mode, fmt) {
      if (fmt) tool.fmt = fmt;
      if (tool.mode === 'measure' && mode !== 'measure') { measure.pts = []; measure.done = false; measure.cursor = null; }
      tool.mode = mode || null;
      if (tool.mode !== 'plan') route.cursor = null;
      svg.classed('ruler', Boolean(tool.mode));
      drawRuler(); emitMeasure(); emitRoute();
    }
    function clearMeasure() { measure.pts = []; measure.done = false; measure.cursor = null; drawMeasure(); emitMeasure(); }
    function clearRoute() { route.pts = []; route.done = false; route.cursor = null; route.shipKm = 0; drawRoute(); emitRoute(); }
    function cancelDrawing() { if (!route.done && route.pts.length) { route.pts = []; route.cursor = null; drawRoute(); emitRoute(); } }
    function setRoute(pts, shipKm) { route.pts = (pts || []).map((p) => ({ lat: p.lat, lon: p.lon })); route.done = route.pts.length >= 2; route.shipKm = Math.max(0, Math.min(shipKm || 0, totalOf(route.pts))); route.cursor = null; drawRoute(); emitRoute(); }
    function setShipKm(km) { if (route.done) { route.shipKm = Math.max(0, Math.min(km, totalOf(route.pts))); drawRoute(); emitRoute(); } }
    function setRouteColor(fn) { route.colorAt = typeof fn === 'function' ? fn : null; drawRoute(); }

    // ---------- public API ----------
    function setProjection(pKey) {
      projKey = PROJECTIONS[pKey] ? pKey : 'mercator';
      projection = PROJECTIONS[projKey]();
      path = d3.geoPath(projection);
      currentRes = null;
      svg.call(zoom.transform, d3.zoomIdentity);
      resize();
      ensureLod();
    }
    function setPoints(p) { points = p.slice(); renderMarkers(); }
    function setStates(s) { states = s || {}; renderMarkers(); }
    function setSelected(id) { selectedId = id; renderMarkers(); }
    function flyTo(lon, lat, scale = 4) {
      const [x, y] = projection([lon, lat]);
      const t = d3.zoomIdentity.translate(width / 2 - x * scale, height / 2 - y * scale).scale(scale);
      svg.transition().duration(900).ease(d3.easeCubicInOut).call(zoom.transform, t);
    }
    function resetView() { svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity); }
    function inRegion(lat, lon) { return lat >= region.latMin && lat <= region.latMax && lon >= region.lonMin && lon <= region.lonMax; }

    svg.on('click', (ev) => {
      const ll = pointerLonLat(ev);
      if (!ll) return;
      if (tool.mode === 'measure') {
        if (measure.done) { measure.pts = []; measure.done = false; }
        measure.pts.push(ll); measure.cursor = null; drawMeasure(); emitMeasure(); return;
      }
      if (tool.mode === 'plan' && !route.done) { route.pts.push(ll); route.cursor = null; drawRoute(); emitRoute(); return; }
      if (handlers.onMapClick) handlers.onMapClick(ll);
    });
    svg.on('contextmenu', (ev) => {
      ev.preventDefault();
      if (tool.mode === 'measure') { if (measure.done || measure.pts.length < 2) clearMeasure(); else { measure.done = true; measure.cursor = null; drawMeasure(); emitMeasure(); } return; }
      if (tool.mode === 'plan' && !route.done) { if (route.pts.length < 2) cancelDrawing(); else { route.done = true; route.cursor = null; route.shipKm = Math.min(route.shipKm, totalOf(route.pts)); drawRoute(); emitRoute(); } }
    });
    svg.on('mousemove', (ev) => {
      const [px, py] = d3.pointer(ev, svg.node());
      const ll = projection.invert(transform.invert([px, py]));
      if (ll && handlers.onHover) handlers.onHover({ lon: ll[0], lat: ll[1], px, py });
      if (!ll) return;
      if (tool.mode === 'measure' && !measure.done && measure.pts.length) { measure.cursor = { lon: ll[0], lat: ll[1] }; drawMeasure(); emitMeasure(); }
      if (tool.mode === 'plan' && !route.done && route.pts.length) { route.cursor = { lon: ll[0], lat: ll[1] }; drawRoute(); }
    });
    svg.on('mouseleave', () => { if (handlers.onLeave) handlers.onLeave(); if (measure.cursor) { measure.cursor = null; drawMeasure(); emitMeasure(); } if (route.cursor) { route.cursor = null; drawRoute(); } });

    new ResizeObserver(() => resize()).observe(container);
    resize();

    return { setProjection, setPoints, setStates, setSelected, flyTo, resetView, resize, inRegion, region: () => region, lod: () => currentRes, setCurrents, setLayer, isSea, loadSeaMask,
      setTool, clearMeasure, clearRoute, cancelDrawing, setRoute, setShipKm, setRouteColor, routePoint, routeSummary };
  }

  WA.map = { createMap, REGIONS, PROJECTIONS };
})();
