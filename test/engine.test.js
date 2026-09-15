global.window = {}; global.self = global.window;
require('../src/metrics.js'); // attaches to self.WA? it uses root = self
const WA = global.window.WA || global.self.WA;
global.window.WA = WA;
require('../src/js/units.js'); require('../src/js/alarms.js');
const A = window.WA.alarms, U = window.WA.units;
const H = 3600e3, now = Date.UTC(2026,8,14,12,0,0);
// synthetic: wind rises 10 → 20 m/s between 12:00 and 14:00 linearly; pressure falls 1010→1000 over 3h
const hours = [];
for (let i = -4; i <= 6; i++) {
  const t = now + i*H;
  const ws = i <= 0 ? 10 : Math.min(20, 10 + 5*i);
  hours.push({ t, v: { windSpeed: ws, pressure: 1010 - Math.max(0, i)*3.5, visibility: i >= 2 ? 0.5 : 10 } });
}
const fc = { p1: { hours } };
const pts = [{ id: 'p1' }];
let fails = 0;
function check(name, cond, extra='') { console.log((cond ? 'PASS ' : 'FAIL ') + name, extra); if (!cond) fails++; }

// threshold 15 m/s → crossing at 13:00 (60 min) → warning eta 60 min
let al = A.evaluate(pts, fc, [{ id:'t1', metric:'windSpeed', op:'gte', value:15, enabled:true, pointIds:[] }], { now, leadMinutes: 90 });
check('warning raised for crossing in 60 min', al.length===1 && al[0].level==='warning', JSON.stringify(al.map(a=>({l:a.level, eta:Math.round(a.eta/60e3)}))));
check('eta ≈ 60 min', al.length && Math.abs(al[0].eta/60e3 - 60) <= 5);
// threshold 17.5 → crossing at 13:30 (90 min) → included with lead 90
al = A.evaluate(pts, fc, [{ id:'t1', metric:'windSpeed', op:'gte', value:17.5, enabled:true, pointIds:[] }], { now, leadMinutes: 90 });
check('crossing at exactly 90 min is included', al.length===1 && Math.abs(al[0].eta/60e3 - 90) <= 5, al.length ? Math.round(al[0].eta/60e3)+' min' : 'none');
// threshold 19 → crossing at 13:48 (108 min) → not within 90
al = A.evaluate(pts, fc, [{ id:'t1', metric:'windSpeed', op:'gte', value:19, enabled:true, pointIds:[] }], { now, leadMinutes: 90 });
check('crossing beyond lead time is ignored', al.length===0);
// threshold 10 → currently exceeded → critical
al = A.evaluate(pts, fc, [{ id:'t1', metric:'windSpeed', op:'gte', value:10, enabled:true, pointIds:[] }], { now, leadMinutes: 90 });
check('critical when currently at/over limit', al.length===1 && al[0].level==='critical');
// lte visibility: drops to 0.5 at 14:00 (120 min) → none; at now+1h it's 10 → crossing at ~13:00.. wait hours: i>=2 → 14:00 = 0.5, 13:00 = 10 → interpolated crossing below 1 km at ~13:57 → 117 min → not within 90
al = A.evaluate(pts, fc, [{ id:'t2', metric:'visibility', op:'lte', value:1, enabled:true, pointIds:[] }], { now, leadMinutes: 90 });
check('lte crossing 117 min away ignored', al.length===0, JSON.stringify(al.map(a=>Math.round(a.eta/60e3))));
al = A.evaluate(pts, fc, [{ id:'t2', metric:'visibility', op:'lte', value:1, enabled:true, pointIds:[] }], { now: now + 40*60e3, leadMinutes: 90 });
check('lte crossing ~77 min away raised as warning', al.length===1 && al[0].level==='warning', al.length? Math.round(al[0].eta/60e3)+' min':'none');
// pressure tendency: at 15:00 p = 999.5, at 12:00 1010 → -10.5 hPa/3h; threshold ≤ -4 → crossing when p(t)-p(t-3h) ≤ -4: at t=13:00 → 1006.5-1010=-3.5; 13:09 → ≈ -4 → ~69 min
al = A.evaluate(pts, fc, [{ id:'t3', metric:'d_pressureTendency', op:'lte', value:-4, enabled:true, pointIds:[] }], { now, leadMinutes: 90 });
check('derived pressure tendency threshold works', al.length===1 && al[0].level==='warning', al.length? Math.round(al[0].eta/60e3)+' min':'none');
// disabled / scoped
al = A.evaluate(pts, fc, [{ id:'t1', metric:'windSpeed', op:'gte', value:10, enabled:false, pointIds:[] }], { now, leadMinutes: 90 });
check('disabled threshold ignored', al.length===0);
al = A.evaluate(pts, fc, [{ id:'t1', metric:'windSpeed', op:'gte', value:10, enabled:true, pointIds:['other'] }], { now, leadMinutes: 90 });
check('threshold scoped to another point ignored', al.length===0);

// coordinate parser
const cases = [
  ['57.75, 8.5', 57.75, 8.5], ['46°00\'N 005°00\'W', 46, -5], ['34 30 N 129 30 E', 34.5, 129.5],
  ['59°20\'30"N 18°04\'12"E', 59.341667, 18.07], ['-33.9 151.2', -33.9, 151.2], ['57,75; 8,5', 57.75, 8.5], ['57,75 , 8,5', 57.75, 8.5], ['a b c', null, null], ['12 34', 12, 34], ['91, 10', null, null]
];
for (const [s, lat, lon] of cases) {
  const r = U.parseCoords(s);
  const ok = lat === null ? r === null : r && Math.abs(r.lat-lat) < 1e-3 && Math.abs(r.lon-lon) < 1e-3;
  check(`parse "${s}"`, ok, JSON.stringify(r));
}
check('beaufort 17.2 m/s = 8', U.beaufort(17.2).force === 8);
check('sea state 3.0 m = 5 Rough', U.seaState(3.0).code === 5);
check('fmt kn (0 dp above 10)', U.fmt('speed', 10, {speed:'kn'}).text === '19'); check('fmt kn (1 dp below 10)', U.fmt('speed', 4, {speed:'kn'}).text === '7.8');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
