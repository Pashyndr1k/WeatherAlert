// Sea-state hazard index: steepness, fetch growth, wind persistence, shoaling, opposing current, bathy grid helpers
global.window = {}; global.self = global.window;
require('../src/metrics.js'); // UMD: exports via module in Node, so WA is created by the browser-style modules below
require('../src/js/units.js'); require('../src/js/alarms.js'); require('../src/js/bathy.js');
const WA = global.window.WA; const U = WA.units, A = WA.alarms, B = WA.bathy;
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name, extra); if (!ok) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const H = 3600e3, now = Date.UTC(2026, 9, 7, 12);

// --- steepness: Hs 2 m, Tp 5 s → L = 39.0 m, s = 0.051 (breaking class); Hs 1 m, Tp 9 s → L 126 m, s 0.008 gentle
const s1 = U.steepness({ waveHeight: 2, wavePeriod: 5 });
check('steepness Hs2/Tp5 → L≈39 m, s≈0.051 (1:20), steep', s1 && near(s1.L, 39.0, 0.2) && near(s1.s, 0.0513, 0.001) && s1.cls === 'steep' && s1.ratio === 20, JSON.stringify(s1));
const s2 = U.steepness({ waveHeight: 1, wavePeriod: 9 });
check('steepness Hs1/Tp9 → gentle', s2 && s2.cls === 'gentle' && near(s2.s, 0.0079, 0.0005), JSON.stringify(s2));
check('steepness null without period', U.steepness({ waveHeight: 2 }) === null);
check('derivedValue d_steepness in %', near(U.derivedValue('d_steepness', { waveHeight: 2, wavePeriod: 5 }), 5.13, 0.05));

// --- JONSWAP growth: 15 m/s over 200 km for 12 h ≈ 3.3 m; for 5 h ≈ 1.7 m (duration-limited); PM cap 0.0214 U²
const g12 = U.fetchGrowth(15, 200e3, 12 * 3600), g5 = U.fetchGrowth(15, 200e3, 5 * 3600);
check('fetchGrowth 15 m/s 200 km 12 h ≈ 3.3 m', g12 && near(g12.hs, 3.35, 0.15), g12 && g12.hs.toFixed(2));
check('fetchGrowth 15 m/s 200 km 5 h ≈ 1.7 m, duration-limited', g5 && near(g5.hs, 1.74, 0.15) && g5.durLimited, g5 && g5.hs.toFixed(2));
const gFull = U.fetchGrowth(10, 600e3, 48 * 3600);
check('fetchGrowth fully developed cap 10 m/s → 2.14 m', gFull && near(gFull.hs, 2.14, 0.05) && gFull.fullyDeveloped, gFull && gFull.hs.toFixed(2));

// --- wind persistence: 6 h of 16 m/s from 60°, then earlier 5 m/s from 200°
const hoursP = [];
for (let i = -12; i <= 6; i++) hoursP.push({ t: now + i * H, v: { windSpeed: i >= -6 ? 16 : 5, windDirection: i >= -6 ? 60 : 200, waveHeight: 1.0, wavePeriod: 4 } });
const wp = U.windPersistence(hoursP, now);
check('windPersistence → 6 h steady from 60°', wp && wp.hours === 6 && near(wp.meanU, 16, 0.01) && wp.dir === 60, JSON.stringify(wp));

// --- hazard: fetch growth component (fetch 300 km, 6 h of 16 m/s → est ≈ 2.3 m vs 1.0 m model) and no depth
const ctxOpen = { lat: 44, lon: 34, depth: 1500, fetchKm: () => 300 };
const hz1 = U.seaHazard(hoursP, now, ctxOpen);
check('seaHazard open water: fetch part present, steepness part present', hz1 && hz1.parts.some((p) => p.id === 'fetch') && hz1.parts.some((p) => p.id === 'steep'), JSON.stringify(hz1 && hz1.parts.map((p) => [p.id, Math.round(p.score)])));
// --- shoaling: same waves (Hs 1 m, Tp 4 s → L 25 m) over 6 m of water → depth/L = 0.24 < 0.5 → shoal part
const hz2 = U.seaHazard(hoursP, now, { lat: 46, lon: 36, depth: 6, fetchKm: () => 50 });
check('seaHazard shallow: shoaling part present', hz2 && hz2.parts.some((p) => p.id === 'shoal'), JSON.stringify(hz2 && hz2.parts.map((p) => [p.id, Math.round(p.score)])));
// --- wind against current: 14 m/s from 60° (blowing towards 240°) vs 0.8 m/s current towards 60° → 180° opposition
const hoursC = [{ t: now - H, v: {} }, { t: now, v: { windSpeed: 14, windDirection: 60, currentSpeed: 0.8, currentDirection: 60, waveHeight: 1.5, wavePeriod: 5 } }, { t: now + H, v: {} }];
const hz3 = U.seaHazard(hoursC, now, { lat: 44, lon: 34, depth: 1000, fetchKm: () => 100 });
check('seaHazard opposing current: part present with high score', hz3 && hz3.parts.some((p) => p.id === 'opposing' && p.score >= 60), JSON.stringify(hz3 && hz3.parts.map((p) => [p.id, Math.round(p.score)])));
check('seaHazard class follows score', hz3 && ['low', 'moderate', 'high', 'severe'].includes(hz3.cls) && hz3.score === Math.round(hz3.parts[0].score));
// --- alarm engine sees the series-derived metric through seriesValue + ctx
const sv = A.seriesValue(hoursC, 'd_seaHazard', now, 44, { lat: 44, lon: 34, depth: 1000, fetchKm: () => 100 });
check('seriesValue d_seaHazard = hazard score', sv === hz3.score, String(sv));
const alarms = A.evaluate([{ id: 'p', lat: 44, lon: 34 }], { p: { hours: hoursC } }, [{ id: 't', metric: 'd_seaHazard', op: 'gte', value: 50, enabled: true, pointIds: [] }], { now, ctxFor: () => ({ lat: 44, lon: 34, depth: 1000, fetchKm: () => 100 }) });
check('evaluate raises CRITICAL on hazard ≥ 50', alarms.length === 1 && alarms[0].level === 'critical', JSON.stringify(alarms));

// --- bathy grid: 5x5 cells, 0.05°, land in the east column; fetch towards the east stops at the coast
B.load({ lat0: 44, lon0: 34, dlat: 0.05, dlon: 0.05, w: 5, h: 5, d: Array.from({ length: 25 }, (_, k) => (k % 5 === 4 ? 0 : 100)) });
check('depthAt inside sea = 100', B.depthAt(44.1, 34.1) === 100, String(B.depthAt(44.1, 34.1)));
check('depthAt outside grid = null', B.depthAt(50, 34) === null);
const fE = B.fetchKm(44.1, 34.05, 90), fW = B.fetchKm(44.1, 34.1, 270);
check('fetch east stops at the land column (< 15 km)', fE !== null && fE < 15, String(fE));
check('fetch west runs off the grid edge (small, grid is tiny)', fW !== null && fW <= 10, String(fW));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
