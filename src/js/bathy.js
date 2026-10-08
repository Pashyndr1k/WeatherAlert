// Depth grid (ETOPO, 0.05° cells) for the sea-state hazard index: depth under a point (shoaling) and the
// open-water fetch upwind of a point (distance to the coast in the direction the wind comes from).
// Loaded from assets/blacksea/bathy.json at start-up; every lookup returns null until then.
(function (root) {
  'use strict';
  const WA = (root.WA = root.WA || {});
  let g = null;
  const fetchCache = new Map();

  function load(grid) { g = grid && grid.d ? grid : null; fetchCache.clear(); }
  function cell(i, j) { return g.d[j * g.w + i]; }
  // Bilinear depth in metres (0 = land); null outside the grid or before the grid is loaded.
  function depthAt(lat, lon) {
    if (!g) return null;
    const x = (lon - g.lon0) / g.dlon, y = (lat - g.lat0) / g.dlat;
    if (x < 0 || y < 0 || x > g.w - 1 || y > g.h - 1) return null;
    const i = Math.min(g.w - 2, Math.floor(x)), j = Math.min(g.h - 2, Math.floor(y));
    const fx = x - i, fy = y - j;
    const v = cell(i, j) * (1 - fx) * (1 - fy) + cell(i + 1, j) * fx * (1 - fy) + cell(i, j + 1) * (1 - fx) * fy + cell(i + 1, j + 1) * fx * fy;
    return Math.round(v);
  }
  function isLand(lat, lon) { const d = depthAt(lat, lon); return d !== null && d <= 0; }
  // Fetch (km) available to a wind blowing FROM direction dirFrom (° true): march upwind in 2 km steps until the
  // coast or the edge of the grid (then the fetch is at least that long). Capped at 600 km. Cached per 5° sector.
  function fetchKm(lat, lon, dirFrom, maxKm = 600) {
    if (!g || dirFrom === null || dirFrom === undefined) return null;
    const key = `${lat.toFixed(3)}|${lon.toFixed(3)}|${Math.round(dirFrom / 5) * 5}`;
    if (fetchCache.has(key)) return fetchCache.get(key);
    const step = 2, rad = dirFrom * Math.PI / 180;
    let la = lat, lo = lon, km = 0;
    for (; km < maxKm; km += step) {
      la += Math.cos(rad) * step / 111.32;
      lo += Math.sin(rad) * step / (111.32 * Math.cos(la * Math.PI / 180));
      const d = depthAt(la, lo);
      if (d === null || d <= 0) break;
    }
    const out = Math.min(maxKm, km);
    fetchCache.set(key, out);
    return out;
  }
  WA.bathy = { load, depthAt, isLand, fetchKm, loaded: () => Boolean(g) };
})(typeof self !== 'undefined' ? self : this);
