// Provider adapters (run in the main process). Both providers are normalised to:
//   { pointId, provider, fetchedAt, hours: [{ t: epochMs, v: { metricId: number|null } }], meta }
// Canonical units: m/s, m, °C, hPa, %, degrees-from, s, km, mm/h.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./metrics'));
  else root.WA = Object.assign(root.WA || {}, { providers: factory(root.WA) });
})(typeof self !== 'undefined' ? self : this, function (registry) {
'use strict';

const { METRICS, SG_CORE_PARAMS } = registry;

const OM_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const OM_MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const SG_POINT = 'https://api.stormglass.io/v2/weather/point';

// ------------------------------------------------------------------ Open-Meteo
const OM_ATMOS = METRICS.filter((m) => m.om && !isMarineVar(m.om)).map((m) => m.om);
const OM_MARINE_VARS = METRICS.filter((m) => m.om && isMarineVar(m.om)).map((m) => m.om);

function isMarineVar(v) {
  return /^(wave_|wind_wave_|swell_wave_|secondary_swell_|ocean_current_|sea_surface_|sea_level_)/.test(v);
}

async function fetchOpenMeteo(points, { httpGetJson, hours = 72 }) {
  if (!points.length) return [];
  const lat = points.map((p) => p.lat.toFixed(4)).join(',');
  const lon = points.map((p) => p.lon.toFixed(4)).join(',');
  const days = Math.max(2, Math.ceil(hours / 24) + 1);

  const atmosUrl = `${OM_FORECAST}?latitude=${lat}&longitude=${lon}&hourly=${OM_ATMOS.join(',') + ',weather_code'}` +
    `&wind_speed_unit=ms&timezone=UTC&past_days=1&forecast_days=${days}&timeformat=unixtime`;
  const marineUrl = `${OM_MARINE}?latitude=${lat}&longitude=${lon}&hourly=${OM_MARINE_VARS.join(',')}` +
    `&timezone=UTC&past_days=1&forecast_days=${days}&timeformat=unixtime`;

  const [a, m] = await Promise.all([httpGetJson(atmosUrl), httpGetJson(marineUrl)]);
  if (a.status !== 200 || !a.json) throw new Error(`Open-Meteo forecast HTTP ${a.status}: ${(a.json && a.json.reason) || a.body.slice(0, 120)}`);
  const atmosArr = Array.isArray(a.json) ? a.json : [a.json];
  // Marine may fail for purely inland points; treat as optional.
  const marineArr = m.status === 200 && m.json ? (Array.isArray(m.json) ? m.json : [m.json]) : [];

  return points.map((p, i) => {
    const at = atmosArr[i] || {};
    const ma = marineArr[i] || {};
    const times = (at.hourly && at.hourly.time) || [];
    const mTimes = (ma.hourly && ma.hourly.time) || [];
    const mIndex = new Map(mTimes.map((t, k) => [t, k]));
    const hoursOut = times.map((t, k) => {
      const v = {};
      METRICS.forEach((met) => {
        if (!met.om) return;
        const src = isMarineVar(met.om) ? ma.hourly : at.hourly;
        const idx = isMarineVar(met.om) ? mIndex.get(t) : k;
        let val = src && src[met.om] && idx !== undefined ? src[met.om][idx] : null;
        if (val === undefined) val = null;
        if (val !== null) {
          if (met.om === 'visibility') val = val / 1000; // m → km
          if (met.om === 'snowfall') val = val * 10; // cm/h → mm/h (water-equivalent approx.)
          if (met.om === 'ocean_current_velocity') val = val / 3.6; // km/h → m/s (marine API default unit)
        }
        v[met.id] = val;
      });
      v.weatherCode = at.hourly && at.hourly.weather_code ? at.hourly.weather_code[k] : null;
      return { t: t * 1000, v };
    });
    return {
      pointId: p.id,
      provider: 'openmeteo',
      fetchedAt: Date.now(),
      hours: hoursOut,
      meta: { elevation: at.elevation, marine: Boolean(mTimes.length), model: 'Open-Meteo best-match (ICON/GFS/ECMWF blend), waves: MFWAM/EWAM/GFS-Wave' }
    };
  });
}

// ------------------------------------------------------------------ Stormglass
const SG_SOURCE_PREF = ['sg', 'ecmwf', 'noaa', 'metno', 'meteo', 'dwd', 'meto', 'fmi', 'fcoo', 'smhi', 'icon'];

function pickSource(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const s of SG_SOURCE_PREF) if (obj[s] !== undefined && obj[s] !== null) return Number(obj[s]);
  const first = Object.values(obj).find((x) => x !== null && x !== undefined);
  return first === undefined ? null : Number(first);
}

async function fetchStormglass(points, { httpGetJson, apiKey, params, hours = 72, source = 'sg' }) {
  if (!apiKey) throw new Error('Stormglass API key is not set (Settings → Provider).');
  const want = Array.from(new Set([...(params || []), ...SG_CORE_PARAMS]));
  const start = Math.floor((Date.now() - 4 * 3600e3) / 1000);
  const end = Math.floor((Date.now() + hours * 3600e3) / 1000);
  const out = [];
  let lastMeta = null;
  for (const p of points) {
    const url = `${SG_POINT}?lat=${p.lat.toFixed(4)}&lng=${p.lon.toFixed(4)}&params=${want.join(',')}&start=${start}&end=${end}` +
      (source && source !== 'all' ? `&source=${source}` : '');
    const r = await httpGetJson(url, { Authorization: apiKey });
    if (r.status === 402) throw new Error('Stormglass: daily request quota exceeded (HTTP 402). Increase the refresh interval or upgrade the plan.');
    if (r.status === 403) throw new Error('Stormglass: API key missing or invalid (HTTP 403).');
    if (r.status !== 200 || !r.json) throw new Error(`Stormglass HTTP ${r.status}: ${r.body.slice(0, 160)}`);
    const hoursOut = (r.json.hours || []).map((h) => {
      const v = {};
      want.forEach((id) => { v[id] = pickSource(h[id]); });
      // Stormglass gives current direction as "coming from"; canonical is oceanographic "flowing towards"
      if (v.currentDirection !== null && v.currentDirection !== undefined) v.currentDirection = (v.currentDirection + 180) % 360;
      return { t: Date.parse(h.time), v };
    });
    lastMeta = r.json.meta || null;
    out.push({
      pointId: p.id,
      provider: 'stormglass',
      fetchedAt: Date.now(),
      hours: hoursOut,
      meta: { quota: lastMeta && lastMeta.dailyQuota, used: lastMeta && lastMeta.requestCount, model: `Stormglass source "${source}"` }
    });
  }
  return out;
}

// Surface-current grid for the map overlay (Open-Meteo marine model, any provider setting).
// points: [{lat, lon}] → [{lat, lon, hours: [{t, speed(m/s), dir(towards °)}]}]; land points come back with empty hours.
async function fetchCurrents(points, { httpGetJson }) {
  const out = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url = `${OM_MARINE}?latitude=${chunk.map((q) => q.lat.toFixed(3)).join(',')}&longitude=${chunk.map((q) => q.lon.toFixed(3)).join(',')}` +
      `&hourly=ocean_current_velocity,ocean_current_direction&timezone=UTC&forecast_days=2&timeformat=unixtime`;
    const r = await httpGetJson(url);
    if (r.status !== 200 || !r.json) throw new Error(`Open-Meteo marine HTTP ${r.status}`);
    const arr = Array.isArray(r.json) ? r.json : [r.json];
    chunk.forEach((q, k) => {
      const h = arr[k] && arr[k].hourly;
      const hours = [];
      if (h && h.time) h.time.forEach((t, j) => { const s = h.ocean_current_velocity[j], dir = h.ocean_current_direction[j]; if (s !== null && dir !== null) hours.push({ t: t * 1000, speed: s / 3.6, dir }); });
      out.push({ lat: q.lat, lon: q.lon, hours });
    });
  }
  return out;
}

async function fetchAll(provider, points, opts) {
  if (provider === 'stormglass') return fetchStormglass(points, opts);
  return fetchOpenMeteo(points, opts);
}

return { fetchAll, fetchOpenMeteo, fetchStormglass, fetchCurrents };
});
