// Vector map with multiple levels of detail (GSHHG c/l/i/h/f for the Black Sea & Sea of Azov,
// Natural Earth 50 m for the wide Europe–Asia view), Mercator or Albers conic projection,
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
    },
    eurasia: {
      name: 'Europe & Asia',
      lonMin: -30, lonMax: 180, latMin: -12, latMax: 82,
      dataset: 'ne50', lod: [[1, 'ne']], ports: []
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
    const gDepth = root.append('g').attr('class', 'depth');
    const gLand = root.append('g').attr('class', 'land');
    const gLakes = root.append('g').attr('class', 'lakes');
    const gRivers = root.append('g').attr('class', 'rivers');
    const gBorders = root.append('g').attr('class', 'borders');
    const gRegion = root.append('g').attr('class', 'region');
    const gCurrents = root.append('g').attr('class', 'currents');
    const gPorts = root.append('g').attr('class', 'ports');
    const gMarkers = root.append('g').attr('class', 'markers');
    const gLabels = svg.append('g').attr('class', 'grid-labels'); // screen-space, not zoomed

    let regionKey = 'blacksea', region = REGIONS.blacksea;
    let projKey = 'mercator';
    let projection = PROJECTIONS.mercator();
    let path = d3.geoPath(projection);
    let width = 10, height = 10, k = 1;
    let transform = d3.zoomIdentity;
    let points = [], states = {}, selectedId = null;
    const cache = {};   // `${dataset}:${res}` → { land, lakes, borders, rivers } GeoJSON feature arrays
    let currentRes = null;
    let loading = null;
    let depthFeatures = null, currentVectors = [];
    const layers = { depth: true, currents: true };

    const zoom = d3.zoom().scaleExtent([1, 60]).on('zoom', (ev) => {
      transform = ev.transform; k = transform.k;
      root.attr('transform', transform);
      root.selectAll('.marker').attr('transform', markerTransform);
      root.selectAll('.port').attr('transform', portTransform);
      root.selectAll('.cvec').attr('transform', vecTransform);
      updateStrokes();
      drawGraticule();
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
      gDepth.selectAll('path').attr('stroke-width', 0.4 / k);
      gPorts.style('display', k >= 1.6 || region.ports.length < 12 ? null : 'none');
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
      gDepth.style('display', layers.depth && region.dataset === 'gshhg' ? null : 'none')
        .selectAll('path').data(depthFeatures && region.dataset === 'gshhg' ? depthFeatures : []).join('path').attr('d', path).attr('data-depth', (f) => f.properties.depth);
      renderCurrents();
      updateStrokes();
    }
    function renderCurrents() {
      gCurrents.style('display', layers.currents && region.dataset === 'gshhg' ? null : 'none');
      const sel = gCurrents.selectAll('g.cvec').data(currentVectors, (d) => `${d.lat},${d.lon}`);
      const enter = sel.enter().append('g').attr('class', 'cvec');
      enter.append('path').attr('class', 'shaft');
      enter.append('path').attr('class', 'head').attr('d', 'M-3,-3 L0,2 L3,-3 Z');
      enter.append('title');
      sel.exit().remove();
      const all = gCurrents.selectAll('g.cvec');
      all.attr('transform', vecTransform)
        .attr('data-spd', (d) => (d.speed >= 0.5 ? 'hi' : d.speed >= 0.25 ? 'mid' : 'lo'));
      all.select('path.shaft').attr('d', (d) => { const L = Math.min(26, 6 + d.speed * 40); return `M0,${-L / 2} L0,${L / 2}`; });
      all.select('path.head').attr('transform', (d) => `translate(0,${Math.min(26, 6 + d.speed * 40) / 2})`);
      all.select('title').text((d) => `${(d.speed * 1.943844).toFixed(2)} kn → ${Math.round(d.dir)}°`);
    }
    function setDepth(topo) {
      depthFeatures = topo && topo.objects && topo.objects.depth ? topojson.feature(topo, topo.objects.depth).features : null;
      redrawStatic();
    }
    // Vectors: [{lat, lon, speed(m/s), dir(towards °)}]
    function setCurrents(vectors) { currentVectors = vectors || []; renderCurrents(); }
    function setLayer(name, on) { layers[name] = Boolean(on); redrawStatic(); }
    // Is this lon/lat inside the sea (0 m depth band)? Used to keep the currents lattice off the land.
    function isSea(lon, lat) {
      if (!depthFeatures) return true;
      const sea = depthFeatures.find((f) => f.properties.depth === 0);
      return sea ? d3.geoContains(sea, [lon, lat]) : true;
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
          cache[key] = toLayers(topo, region.dataset);
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
    function toLayers(topo, dataset) {
      if (dataset === 'ne50') {
        const countries = topojson.feature(topo, topo.objects.countries);
        return { land: countries.features, lakes: [], rivers: [], borders: [topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b)] };
      }
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

    // ---------- public API ----------
    function setRegion(key, pKey) {
      regionKey = REGIONS[key] ? key : 'blacksea'; region = REGIONS[regionKey];
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
      const [px, py] = d3.pointer(ev, svg.node());
      const ll = projection.invert(transform.invert([px, py]));
      if (ll && handlers.onMapClick) handlers.onMapClick({ lon: ll[0], lat: ll[1] });
    });
    svg.on('mousemove', (ev) => {
      const [px, py] = d3.pointer(ev, svg.node());
      const ll = projection.invert(transform.invert([px, py]));
      if (ll && handlers.onHover) handlers.onHover({ lon: ll[0], lat: ll[1], px, py });
    });
    svg.on('mouseleave', () => { if (handlers.onLeave) handlers.onLeave(); });

    new ResizeObserver(() => resize()).observe(container);
    resize();

    return { setRegion, setPoints, setStates, setSelected, flyTo, resetView, resize, inRegion, region: () => region, regionKey: () => regionKey, lod: () => currentRes, setDepth, setCurrents, setLayer, isSea };
  }

  WA.map = { createMap, REGIONS, PROJECTIONS };
})();
