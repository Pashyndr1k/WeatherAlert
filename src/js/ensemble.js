// Exceedance probability from an AI ensemble (WeatherNext 2 / ECMWF AIFS via Open-Meteo).
// ens = { model, members, hours: [{ t, v: { windSpeed: [m0..mN], pressure: [...], airTemperature: [...] } }] }
(function () {
  'use strict';
  const WA = (window.WA = window.WA || {});

  // Fraction of members exceeding the limit at the hour nearest t (null when metric not covered).
  function probAt(ens, metric, op, limit, t) {
    if (!ens || !ens.hours || !ens.hours.length) return null;
    let best = null;
    for (const h of ens.hours) if (!best || Math.abs(h.t - t) < Math.abs(best.t - t)) best = h;
    const arr = best && best.v[metric];
    if (!arr || !arr.length) return null;
    let n = 0, k = 0;
    for (const x of arr) { if (x === null || x === undefined) continue; n++; if (op === 'lte' ? x <= limit : x >= limit) k++; }
    return n ? k / n : null;
  }
  // Highest exceedance probability within [from, from + horizon] and when it occurs.
  function probMax(ens, metric, op, limit, from, horizonMs) {
    if (!ens || !ens.hours) return null;
    let out = null;
    for (const h of ens.hours) {
      if (h.t < from - 3600e3 || h.t > from + horizonMs) continue;
      const arr = h.v[metric];
      if (!arr || !arr.length) continue;
      let n = 0, k = 0;
      for (const x of arr) { if (x === null || x === undefined) continue; n++; if (op === 'lte' ? x <= limit : x >= limit) k++; }
      if (!n) continue;
      const p = k / n;
      if (!out || p > out.p) out = { p, t: h.t };
    }
    return out;
  }
  // Member spread at time t: {min, p10, median, p90, max}
  function spreadAt(ens, metric, t) {
    if (!ens || !ens.hours) return null;
    let best = null;
    for (const h of ens.hours) if (!best || Math.abs(h.t - t) < Math.abs(best.t - t)) best = h;
    const arr = best && best.v[metric] ? best.v[metric].filter((x) => x !== null && x !== undefined).sort((a, b) => a - b) : null;
    if (!arr || !arr.length) return null;
    const q = (f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
    return { min: arr[0], p10: q(0.1), median: q(0.5), p90: q(0.9), max: arr[arr.length - 1], n: arr.length };
  }

  WA.ensemble = { probAt, probMax, spreadAt, METRICS: ['windSpeed', 'pressure', 'airTemperature'] };
})();
