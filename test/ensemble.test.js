// Exceedance-probability helpers
global.window = {}; global.self = global.window;
require('../src/js/ensemble.js');
const E = global.window.WA.ensemble;
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name, extra); if (!ok) fails++; };
const H = 3600e3, now = Date.UTC(2026, 8, 25, 12);
// 10 members; wind rises so that at +3h 9 of 10 exceed 15 m/s, at +6h all 10 do
const hours = [0, 3, 6].map((k) => ({ t: now + k * H, v: { windSpeed: Array.from({ length: 10 }, (_, i) => 10 + k * 1.5 + i * 0.5), pressure: Array.from({ length: 10 }, (_, i) => 1010 - k * 3 - i) } }));
const ens = { model: 'test', members: 10, hours };
check('probAt now (no member ≥ 15)', E.probAt(ens, 'windSpeed', 'gte', 15, now) === 0);
check('probAt +3h = 0.9 (members 14.5..19, nine ≥ 15)', Math.abs(E.probAt(ens, 'windSpeed', 'gte', 15, now + 3 * H) - 0.9) < 1e-9, String(E.probAt(ens, 'windSpeed', 'gte', 15, now + 3 * H)));
check('probAt +6h = 1', E.probAt(ens, 'windSpeed', 'gte', 15, now + 6 * H) === 1);
const pm = E.probMax(ens, 'windSpeed', 'gte', 15, now, 24 * H);
check('probMax picks +6h with p=1', pm && pm.p === 1 && pm.t === now + 6 * H);
check('lte works for pressure (≤ 1000 at +6h: members 992..983 → all)', E.probAt(ens, 'pressure', 'lte', 1000, now + 6 * H) === 1, String(E.probAt(ens, 'pressure', 'lte', 1000, now + 6 * H)));
check('uncovered metric returns null', E.probAt(ens, 'waveHeight', 'gte', 1, now) === null);
const sp = E.spreadAt(ens, 'windSpeed', now);
check('spreadAt gives ordered quantiles', sp && sp.min <= sp.p10 && sp.p10 <= sp.median && sp.median <= sp.p90 && sp.p90 <= sp.max && sp.n === 10);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
