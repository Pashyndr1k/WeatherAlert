// Sensor hub: NMEA parsing + UDP/TCP/HTTP listeners on test ports.
const dgram = require('dgram'), net = require('net'), http = require('http');
const { SensorHub } = require('../src/sensors.js');
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name, extra); if (!ok) fails++; };
const near = (a, b, tol = 0.05) => a !== null && a !== undefined && Math.abs(a - b) <= tol;
function cs(body) { let x = 0; for (const ch of body) x ^= ch.charCodeAt(0); return `$${body}*${x.toString(16).toUpperCase().padStart(2, '0')}`; }

(async () => {
  const hub = new SensorHub();
  // --- parsing
  hub.ingestText(cs('WIMWV,045.0,T,20.0,N,A'), 'test');
  check('MWV true wind: dir 45, 20 kn → 10.29 m/s', near(hub.readings.windDirection.value, 45) && near(hub.readings.windSpeed.value, 10.29));
  hub.ingestText(cs('WIMDA,29.92,I,1.0132,B,18.5,C,16.2,C,78.0,,,,14.5,C,270.0,T,265.0,M,12.0,N,6.2,M'), 'test');
  check('MDA pressure from bar → 1013.2 hPa', near(hub.readings.pressure.value, 1013.2, 0.01));
  check('MDA air 18.5 / water 16.2 / RH 78 / dew 14.5', near(hub.readings.airTemperature.value, 18.5) && near(hub.readings.waterTemperature.value, 16.2) && near(hub.readings.humidity.value, 78) && near(hub.readings.dewPointTemperature.value, 14.5));
  check('MDA wind 270 / 6.2 m/s', near(hub.readings.windDirection.value, 270) && near(hub.readings.windSpeed.value, 6.2));
  hub.ingestText(cs('WIXDR,P,1.0089,B,BARO,C,21.3,C,TEMP,H,65,P,HUM'), 'test');
  check('XDR pressure/temp/humidity', near(hub.readings.pressure.value, 1008.9, 0.01) && near(hub.readings.airTemperature.value, 21.3) && near(hub.readings.humidity.value, 65));
  hub.ingestText(cs('GPRMC,123519,A,4507.038,N,03633.000,E,022.4,084.4,230394,003.1,W'), 'test');
  check('RMC position 45.1173N 36.55E, sog 22.4 kn → 11.5 m/s', hub.position && near(hub.position.lat, 45.1173, 0.001) && near(hub.position.lon, 36.55, 0.001) && near(hub.position.sog, 11.52, 0.05));
  hub.ingestText(cs('HEHDT,090.0,T'), 'test'); hub.ingestText(cs('WIMWV,030.0,R,10.0,M,A'), 'test');
  check('relative MWV + heading → apparent dir 120', near(hub.readings.windDirection.value, 120) && hub.readings.windDirection.note === 'apparent');
  const bad = hub.status.bad; hub.ingestText('$WIMWV,045.0,T,20.0,N,A*00', 'test');
  check('bad checksum rejected', hub.status.bad === bad + 1);
  hub.ingestJson({ windSpeed: 25, windSpeedUnit: 'kn', windDirection: 200, pressure: 998.4, airTemperature: 9.1, lat: 44.5, lon: 34.2 }, 'test');
  check('JSON: 25 kn → 12.86 m/s, pressure, temp, position', near(hub.readings.windSpeed.value, 12.86) && near(hub.readings.pressure.value, 998.4) && near(hub.readings.airTemperature.value, 9.1) && near(hub.position.lat, 44.5));

  // --- listeners
  const UDP = 20110, HTTP = 20787;
  hub.start({ udpPort: UDP, httpPort: HTTP });
  await new Promise((r) => setTimeout(r, 300));
  check('listeners bound', hub.status.udp === UDP && hub.status.tcp === UDP && hub.status.http === HTTP, JSON.stringify([hub.status.udp, hub.status.tcp, hub.status.http, hub.status.error]));
  const u = dgram.createSocket('udp4');
  await new Promise((r) => u.send(Buffer.from(cs('WIMWV,180.0,T,30.0,N,A') + '\r\n'), UDP, '127.0.0.1', r));
  await new Promise((r) => setTimeout(r, 200)); u.close();
  check('UDP sentence received: wind dir 180, 30 kn', near(hub.readings.windDirection.value, 180) && near(hub.readings.windSpeed.value, 15.43));
  await new Promise((resolve) => { const s = net.connect(UDP, '127.0.0.1', () => { s.write(cs('YXMTW,19.9,C') + '\r\n'); setTimeout(() => { s.end(); resolve(); }, 200); }); });
  check('TCP sentence received: water 19.9', near(hub.readings.waterTemperature.value, 19.9));
  const post = (body) => new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port: HTTP, path: '/sensors', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); }); req.end(body); });
  const r1 = await post(JSON.stringify({ pressure: 1001.5, humidity: 88 }));
  check('HTTP POST accepted', r1.status === 200 && near(hub.readings.pressure.value, 1001.5) && near(hub.readings.humidity.value, 88), r1.body);
  const r2 = await post('not json');
  check('HTTP POST bad payload → 400', r2.status === 400);
  const snap = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: HTTP, path: '/sensors' }, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve(JSON.parse(d))); }));
  check('HTTP GET snapshot lists readings', snap.readings && snap.readings.pressure && snap.status.msgs > 0);
  hub.stop();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
