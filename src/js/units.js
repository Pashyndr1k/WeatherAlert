// Unit conversion, formatting and maritime derived indicators (renderer).
(function () {
  'use strict';
  const WA = (window.WA = window.WA || {});

  const KN = 1.943844; // m/s → knots
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  // Unit systems per kind; first entry is the canonical unit.
  const UNITS = {
    speed: { kn: { label: 'kn', f: (v) => v * KN, inv: (v) => v / KN }, ms: { label: 'm/s', f: (v) => v, inv: (v) => v }, kmh: { label: 'km/h', f: (v) => v * 3.6, inv: (v) => v / 3.6 } },
    length: { m: { label: 'm', f: (v) => v, inv: (v) => v }, ft: { label: 'ft', f: (v) => v * 3.28084, inv: (v) => v / 3.28084 } },
    depth: { m: { label: 'm', f: (v) => v, inv: (v) => v }, ft: { label: 'ft', f: (v) => v * 3.28084, inv: (v) => v / 3.28084 } },
    temp: { c: { label: '°C', f: (v) => v, inv: (v) => v }, f: { label: '°F', f: (v) => v * 9 / 5 + 32, inv: (v) => (v - 32) * 5 / 9 } },
    pressure: { hpa: { label: 'hPa', f: (v) => v, inv: (v) => v } },
    pct: { pct: { label: '%', f: (v) => v, inv: (v) => v } },
    dir: { deg: { label: '°', f: (v) => v, inv: (v) => v } },
    period: { s: { label: 's', f: (v) => v, inv: (v) => v } },
    vis: { nm: { label: 'NM', f: (v) => v / 1.852, inv: (v) => v * 1.852 }, km: { label: 'km', f: (v) => v, inv: (v) => v } },
    precip: { mmh: { label: 'mm/h', f: (v) => v, inv: (v) => v } },
    factor: { x: { label: '', f: (v) => v * 100, inv: (v) => v / 100 } },
    ptend: { hpa3h: { label: 'hPa/3h', f: (v) => v, inv: (v) => v } },
    ratio: { x: { label: '×', f: (v) => v, inv: (v) => v } },
    icing: { cmh: { label: 'cm/h', f: (v) => v, inv: (v) => v } },
    text: { t: { label: '', f: (v) => v, inv: (v) => v } }
  };
  const DEFAULT_UNITS = { speed: 'kn', length: 'm', depth: 'm', temp: 'c', vis: 'nm' };

  function unitFor(kind, prefs) {
    const table = UNITS[kind] || UNITS.text;
    const key = (prefs && prefs[kind]) || DEFAULT_UNITS[kind] || Object.keys(table)[0];
    return table[key] || table[Object.keys(table)[0]];
  }
  function decimals(kind, value) {
    if (kind === 'pressure') return 1;
    if (kind === 'pct' || kind === 'dir' || kind === 'factor') return 0;
    if (kind === 'temp' || kind === 'period' || kind === 'ptend' || kind === 'ratio' || kind === 'icing') return 1;
    if (kind === 'vis') return Math.abs(value) < 10 ? 1 : 0;
    return Math.abs(value) < 10 ? 1 : 0;
  }
  function fmt(kind, canonical, prefs) {
    if (canonical === null || canonical === undefined || Number.isNaN(canonical)) return { text: '—', unit: '' };
    const u = unitFor(kind, prefs);
    const v = u.f(canonical);
    if (kind === 'dir') return { text: `${Math.round(v)}°`, unit: compass(v) };
    if (kind === 'ptend') return { text: (v > 0 ? '+' : '') + v.toFixed(1), unit: u.label };
    return { text: v.toFixed(decimals(kind, v)), unit: u.label };
  }
  function compass(deg) {
    if (deg === null || deg === undefined) return '';
    return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  }

  // ---------- maritime scales ----------
  const BEAUFORT = [
    [0.3, 0, 'Calm'], [1.6, 1, 'Light air'], [3.4, 2, 'Light breeze'], [5.5, 3, 'Gentle breeze'],
    [8.0, 4, 'Moderate breeze'], [10.8, 5, 'Fresh breeze'], [13.9, 6, 'Strong breeze'], [17.2, 7, 'Near gale'],
    [20.8, 8, 'Gale'], [24.5, 9, 'Strong gale'], [28.5, 10, 'Storm'], [32.7, 11, 'Violent storm'], [Infinity, 12, 'Hurricane']
  ];
  function beaufort(ms) {
    if (ms === null || ms === undefined) return null;
    for (const [max, n, name] of BEAUFORT) if (ms < max) return { force: n, name };
    return { force: 12, name: 'Hurricane' };
  }
  const DOUGLAS = [
    [0.0001, 0, 'Calm (glassy)'], [0.1, 1, 'Calm (rippled)'], [0.5, 2, 'Smooth'], [1.25, 3, 'Slight'], [2.5, 4, 'Moderate'],
    [4.0, 5, 'Rough'], [6.0, 6, 'Very rough'], [9.0, 7, 'High'], [14.0, 8, 'Very high'], [Infinity, 9, 'Phenomenal']
  ];
  function seaState(hs) {
    if (hs === null || hs === undefined) return null;
    for (const [max, n, name] of DOUGLAS) if (hs < max) return { code: n, name };
    return { code: 9, name: 'Phenomenal' };
  }
  function cloudCondition(pct) {
    if (pct === null || pct === undefined) return null;
    const oktas = Math.round(pct / 12.5);
    let name = 'Clear';
    if (oktas >= 8) name = 'Overcast';
    else if (oktas >= 5) name = 'Broken';
    else if (oktas >= 3) name = 'Scattered';
    else if (oktas >= 1) name = 'Few clouds';
    return { oktas, name };
  }
  // WMO weather codes (Open-Meteo) → short text
  const WMO = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers',
    85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail'
  };
  // Air conditions from visibility (km), humidity, precipitation, temperature, weather code.
  function airCondition(v) {
    if (!v) return null;
    const vis = v.visibility, rh = v.humidity, pr = v.precipitation, t = v.airTemperature, wc = v.weatherCode;
    if (wc === 45 || wc === 48) return { name: 'Fog', severity: 3 };
    if (wc !== null && wc !== undefined && wc >= 95) return { name: WMO[wc] || 'Thunderstorm', severity: 3 };
    if (vis !== null && vis !== undefined) {
      if (vis < 1) return { name: 'Fog', severity: 3 };
      if (vis < 2) return { name: 'Thick mist', severity: 2 };
      if (vis < 5) return { name: rh !== null && rh !== undefined && rh < 75 ? 'Haze' : 'Mist', severity: 1 };
    }
    if (pr !== null && pr !== undefined && pr > 0.1) {
      if (t !== null && t !== undefined && t <= 0.5) return { name: pr > 2.5 ? 'Heavy snow' : 'Snow', severity: pr > 2.5 ? 2 : 1 };
      return { name: pr > 7.5 ? 'Heavy rain' : pr > 2.5 ? 'Rain' : 'Light rain', severity: pr > 7.5 ? 2 : 1 };
    }
    if (wc !== null && wc !== undefined && WMO[wc]) return { name: WMO[wc], severity: 0 };
    return { name: 'Good visibility', severity: 0 };
  }
  function fogRisk(v) {
    if (!v || v.airTemperature === null || v.airTemperature === undefined || v.dewPointTemperature === null || v.dewPointTemperature === undefined) return null;
    const spread = v.airTemperature - v.dewPointTemperature;
    const wind = v.windSpeed || 0;
    let level = 'Low';
    if (spread < 1 && wind < 5) level = 'High';
    else if (spread < 2.5 && wind < 8) level = 'Moderate';
    return { level, spread };
  }
  function crossSea(v) {
    if (!v) return null;
    const a = v.swellDirection, b = v.windWaveDirection;
    const hs = v.swellHeight || 0, hw = v.windWaveHeight || 0;
    if (a === null || a === undefined || b === null || b === undefined) return null;
    if (hs < 0.4 || hw < 0.4) return { name: 'No', angle: 0 };
    let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d;
    if (d >= 60) return { name: 'Yes', angle: d };
    if (d >= 30) return { name: 'Slight', angle: d };
    return { name: 'No', angle: d };
  }

  // ---------- Overland (1990) vessel-icing predictor ----------
  // PPR = Va * (Tf - Ta) / (1 + 0.3 * (Tw - Tf)); Tf = -1.7 C (seawater freezing point).
  // Icing rate (cm/h) from PPR via the Overland regression; classes: light < 0.7, moderate 0.7-2.0, heavy 2.0-4.0, extreme > 4.0 cm/h.
  function icing(v, lat) {
    if (!v) return null;
    const Ta = v.airTemperature, Tw = v.waterTemperature, Va = v.windSpeed;
    if (Ta === null || Ta === undefined || Tw === null || Tw === undefined || Va === null || Va === undefined) return null;
    const Tf = -1.7;
    const zone = lat !== undefined && lat !== null ? lat >= 55 : true;
    if (Ta >= Tf) return { ppr: 0, rate: 0, cls: 'none', zone };
    const ppr = Va * (Tf - Ta) / (1 + 0.3 * (Tw - Tf));
    const rate = Math.max(0, 2.73e-2 * ppr + 2.91e-4 * ppr * ppr - 1.84e-6 * ppr * ppr * ppr);
    const cls = ppr <= 0 ? 'none' : ppr < 22.4 ? 'light' : ppr < 53.3 ? 'moderate' : ppr < 83 ? 'heavy' : 'extreme';
    return { ppr, rate, cls, zone };
  }
  // ---------- advection-fog probability ----------
  // Warm, moist air (dew point Td) moving over water colder than Td is cooled below saturation.
  // Score = f(Td - Tw) shaped by humidity and a wind window (2-8 m/s is the classic advection band).
  function advectionFog(v) {
    if (!v) return null;
    const Td = v.dewPointTemperature, Tw = v.waterTemperature;
    if (Td === null || Td === undefined || Tw === null || Tw === undefined) return null;
    const rh = v.humidity, wind = v.windSpeed === null || v.windSpeed === undefined ? 4 : v.windSpeed;
    const excess = Td - Tw;
    let base = 0;
    if (excess > -1) base = Math.min(1, (excess + 1) / 4) * 75;
    let rhBoost = 0;
    if (rh !== null && rh !== undefined) rhBoost = rh >= 97 ? 25 : rh >= 92 ? 15 : rh >= 85 ? 5 : rh < 70 ? -15 : 0;
    const windF = wind < 1 ? 0.55 : wind <= 8 ? 1 : wind <= 12 ? 0.7 : wind <= 16 ? 0.4 : 0.2;
    const p = Math.max(0, Math.min(100, (base + rhBoost) * windF));
    const level = p >= 70 ? 'very high' : p >= 45 ? 'high' : p >= 20 ? 'moderate' : 'low';
    return { p, excess, level };
  }
  // Numeric value of a thresholdable derived metric (alarm engine + cards)
  function derivedValue(id, v, lat) {
    if (id === 'd_icing') { const r = icing(v, lat); return r ? r.rate : null; }
    if (id === 'd_advFog') { const r = advectionFog(v); return r ? r.p : null; }
    if (id === 'd_gustFactor') return v && v.windSpeed && v.gust ? v.gust / Math.max(0.5, v.windSpeed) : null;
    return null;
  }
  const DERIVED_NEEDS = { d_icing: ['airTemperature', 'waterTemperature', 'windSpeed'], d_advFog: ['dewPointTemperature', 'waterTemperature', 'windSpeed', 'humidity'], d_gustFactor: ['windSpeed', 'gust'] };

  // ---------- coordinate parsing (WGS84 decimal, DDM or DMS) ----------
  function parseCoordPart(str, isLat) {
    const s = String(str).trim().toUpperCase();
    if (!s) return NaN;
    const hemi = s.match(/[NSEW]/);
    const sign = hemi && (hemi[0] === 'S' || hemi[0] === 'W') ? -1 : 1;
    const leadingMinus = /^\s*-/.test(s) ? -1 : 1;
    const nums = s.replace(/[NSEW]/g, ' ').match(/-?\d+(?:[.,]\d+)?/g);
    if (!nums) return NaN;
    const parts = nums.map((n) => Math.abs(parseFloat(n.replace(',', '.'))));
    let deg = parts[0] || 0;
    if (parts.length > 1) deg += parts[1] / 60;
    if (parts.length > 2) deg += parts[2] / 3600;
    const val = deg * sign * leadingMinus;
    const lim = isLat ? 90 : 180;
    return Math.abs(val) <= lim ? val : NaN;
  }
  // Accepts "59.33, 18.07", "59°20'N 18°04'E", "59 20.5 N, 18 4.2 E", "-33.9 151.2"
  function parseCoords(text) {
    let s = String(text).trim();
    let a, b;
    if (s.includes(';')) [a, b] = s.split(';');
    else if ((s.match(/,/g) || []).length === 1) [a, b] = s.split(',');
    else if ((s.match(/,/g) || []).length === 3 && /^\s*-?\d+,\d+\s*,\s*-?\d+,\d+\s*$/.test(s)) {
      // "57,75 , 8,5" — decimal commas with a comma separator
      const m = s.match(/^\s*(-?\d+,\d+)\s*,\s*(-?\d+,\d+)\s*$/); a = m[1]; b = m[2];
    } else {
      const m = s.match(/^(.*?[NS])\s+(.*?[EW])$/i);
      if (m) [a, b] = [m[1], m[2]];
      else { const t = s.split(/\s+/); if (t.length === 2) [a, b] = t; else return null; }
    }
    const lat = parseCoordPart(a, true), lon = parseCoordPart(b, false);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
  }
  function fmtLat(lat) {
    const a = Math.abs(lat), d = Math.floor(a), m = (a - d) * 60;
    return `${String(d).padStart(2, '0')}°${m.toFixed(1).padStart(4, '0')}'${lat >= 0 ? 'N' : 'S'}`;
  }
  function fmtLon(lon) {
    const a = Math.abs(lon), d = Math.floor(a), m = (a - d) * 60;
    return `${String(d).padStart(3, '0')}°${m.toFixed(1).padStart(4, '0')}'${lon >= 0 ? 'E' : 'W'}`;
  }

  WA.units = { UNITS, DEFAULT_UNITS, unitFor, fmt, compass, beaufort, seaState, cloudCondition, airCondition, fogRisk, crossSea, icing, advectionFog, derivedValue, DERIVED_NEEDS, parseCoords, fmtLat, fmtLon, WMO };
})();
