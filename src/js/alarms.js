// Alarm engine: interpolates the cached hourly forecast to find when each threshold
// will be crossed and raises WARNING (crossing within the lead window) or CRITICAL
// (threshold currently exceeded) alarms. Runs on the cached forecast every 30 s, so it
// never costs API requests.
(function () {
  'use strict';
  const WA = (window.WA = window.WA || {});

  // Value of a metric at time t by linear interpolation between hourly samples.
  function valueAt(hours, metric, t) {
    if (!hours || !hours.length) return null;
    let prev = null;
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      const v = h.v[metric];
      if (v === null || v === undefined) continue;
      if (h.t === t) return v;
      if (h.t > t) {
        if (!prev) return v;
        const f = (t - prev.t) / (h.t - prev.t);
        return prev.v + (v - prev.v) * f;
      }
      prev = { t: h.t, v };
    }
    return prev ? prev.v : null;
  }

  // Pressure tendency: p(t) - p(t-3h) in hPa.
  function pressureTendency(hours, t) {
    const now = valueAt(hours, 'pressure', t);
    const before = valueAt(hours, 'pressure', t - 3 * 3600e3);
    if (now === null || before === null) return null;
    return now - before;
  }

  // Series accessor that also understands derived thresholdable metrics.
  function seriesValue(hours, metric, t, lat) {
    if (metric === 'd_pressureTendency') return pressureTendency(hours, t);
    if (metric.startsWith('d_')) {
      const U = WA.units;
      const needs = (U.DERIVED_NEEDS && U.DERIVED_NEEDS[metric]) || [];
      const v = {};
      needs.forEach((m) => { v[m] = valueAt(hours, m, t); });
      return U.derivedValue(metric, v, lat);
    }
    return valueAt(hours, metric, t);
  }

  function exceeds(op, value, limit) {
    return op === 'lte' ? value <= limit : value >= limit;
  }

  // Find the first time in (from, to] at which the threshold becomes exceeded. Scans in 5-min steps.
  function firstCrossing(hours, th, from, to, lat) {
    const step = 5 * 60e3;
    let prevV = seriesValue(hours, th.metric, from, lat);
    for (let t = from + step; t <= to; t += step) {
      const v = seriesValue(hours, th.metric, t, lat);
      if (v === null) { prevV = v; continue; }
      if (exceeds(th.op, v, th.value)) {
        // refine within the step by linear interpolation
        if (prevV !== null && prevV !== undefined && v !== prevV) {
          const f = (th.value - prevV) / (v - prevV);
          return t - step + Math.max(0, Math.min(1, f)) * step;
        }
        return t;
      }
      prevV = v;
    }
    return null;
  }

  // Evaluate all thresholds for all points. Returns array of alarm objects:
  // { key, pointId, thresholdId, metric, level:'critical'|'warning', eta (ms), value, limit, op }
  function evaluate(points, forecasts, thresholds, opts) {
    const now = opts.now || Date.now();
    const lead = (opts.leadMinutes || 90) * 60e3;
    const out = [];
    for (const p of points) {
      const fc = forecasts[p.id];
      if (!fc || !fc.hours || !fc.hours.length) continue;
      for (const th of thresholds) {
        if (!th.enabled) continue;
        if (th.pointIds && th.pointIds.length && !th.pointIds.includes(p.id)) continue;
        const cur = seriesValue(fc.hours, th.metric, now, p.lat);
        if (cur === null || cur === undefined) continue;
        if (exceeds(th.op, cur, th.value)) {
          out.push({ key: `${p.id}|${th.id}|critical`, pointId: p.id, thresholdId: th.id, metric: th.metric, level: 'critical', eta: 0, value: cur, limit: th.value, op: th.op, at: now });
          continue;
        }
        const tc = firstCrossing(fc.hours, th, now, now + lead, p.lat);
        if (tc !== null) {
          const vAt = seriesValue(fc.hours, th.metric, tc, p.lat);
          out.push({ key: `${p.id}|${th.id}|warning`, pointId: p.id, thresholdId: th.id, metric: th.metric, level: 'warning', eta: tc - now, value: vAt, limit: th.value, op: th.op, at: tc });
        }
      }
    }
    out.sort((a, b) => (a.level === b.level ? a.eta - b.eta : a.level === 'critical' ? -1 : 1));
    return out;
  }

  // Forecast peak within next N hours for a metric (used for card badges).
  function peak(hours, metric, from, horizonMs, op) {
    let best = null;
    for (const h of hours) {
      if (h.t < from || h.t > from + horizonMs) continue;
      const v = h.v[metric];
      if (v === null || v === undefined) continue;
      if (best === null || (op === 'lte' ? v < best.v : v > best.v)) best = { v, t: h.t };
    }
    return best;
  }

  WA.alarms = { valueAt, seriesValue, pressureTendency, evaluate, firstCrossing, peak, exceeds };
})();
