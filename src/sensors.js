// Sensor hub (main process): receives live ship-sensor data and keeps the latest reading per metric.
//   • NMEA 0183 sentences over UDP and TCP (default port 10110): MWV, MWD, MDA, XDR, MTW, HDT, VTG, RMC, GGA, GLL
//   • JSON over HTTP POST http://127.0.0.1:<httpPort>/sensors  (GET /sensors returns the current snapshot)
// Canonical units match the app: m/s, °C, hPa, %, degrees (wind FROM), km.
'use strict';
const dgram = require('dgram');
const net = require('net');
const http = require('http');

const KN = 0.514444, KMH = 1 / 3.6;
const METRICS = ['windSpeed', 'gust', 'windDirection', 'airTemperature', 'pressure', 'humidity', 'dewPointTemperature', 'waterTemperature', 'visibility'];

function nmeaChecksumOk(line) {
  const star = line.lastIndexOf('*');
  if (star < 0) return true; // checksum optional
  let x = 0;
  for (let i = 1; i < star; i++) x ^= line.charCodeAt(i);
  return x === parseInt(line.slice(star + 1, star + 3), 16);
}
function num(s) { const v = parseFloat(s); return Number.isFinite(v) ? v : null; }
function speedToMs(v, unit) { if (v === null) return null; unit = (unit || 'N').toUpperCase(); return unit === 'M' ? v : unit === 'K' ? v * KMH : v * KN; }
function nmeaLatLon(lat, ns, lon, ew) {
  if (!lat || !lon) return null;
  const la = Math.floor(+lat / 100) + (+lat % 100) / 60, lo = Math.floor(+lon / 100) + (+lon % 100) / 60;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: ns === 'S' ? -la : la, lon: ew === 'W' ? -lo : lo };
}

class SensorHub {
  constructor() {
    this.readings = {};      // metric → { value, t, src, note }
    this.position = null;    // { lat, lon, t, sog, cog }
    this.heading = null;
    this.status = { udp: null, tcp: null, http: null, lastMsg: 0, msgs: 0, bad: 0, sources: {}, error: null };
    this.servers = {};
    this.log = [];           // last raw lines for the settings panel
  }

  start({ udpPort = 10110, httpPort = 8787, tcp = true } = {}) {
    this.stop();
    this.status.error = null;
    try {
      const u = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      u.on('message', (buf, rinfo) => this.ingestText(buf.toString('utf8'), `udp:${rinfo.address}`));
      u.on('error', (e) => { this.status.udp = null; this.status.error = `UDP ${udpPort}: ${e.message}`; });
      u.bind(udpPort, () => { this.status.udp = udpPort; });
      this.servers.udp = u;
    } catch (e) { this.status.error = `UDP: ${e.message}`; }
    if (tcp) {
      try {
        const t = net.createServer((sock) => {
          let buf = '';
          sock.on('data', (d) => { buf += d.toString('utf8'); const parts = buf.split(/\r?\n/); buf = parts.pop(); parts.forEach((l) => this.ingestText(l, `tcp:${sock.remoteAddress}`)); });
          sock.on('error', () => { /* ignore */ });
        });
        t.on('error', (e) => { this.status.tcp = null; this.status.error = `TCP ${udpPort}: ${e.message}`; });
        t.listen(udpPort, () => { this.status.tcp = udpPort; });
        this.servers.tcp = t;
      } catch (e) { this.status.error = `TCP: ${e.message}`; }
    }
    try {
      const h = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(this.snapshot())); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
        req.on('end', () => {
          try {
            const ct = String(req.headers['content-type'] || '');
            if (ct.includes('json') || body.trim().startsWith('{')) this.ingestJson(JSON.parse(body), `http:${req.socket.remoteAddress}`);
            else this.ingestText(body, `http:${req.socket.remoteAddress}`);
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, readings: Object.keys(this.readings).length }));
          } catch (e) { this.status.bad++; res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.message })); }
        });
      });
      h.on('error', (e) => { this.status.http = null; this.status.error = `HTTP ${httpPort}: ${e.message}`; });
      h.listen(httpPort, '0.0.0.0', () => { this.status.http = httpPort; });
      this.servers.http = h;
    } catch (e) { this.status.error = `HTTP: ${e.message}`; }
  }

  stop() {
    Object.values(this.servers).forEach((s) => { try { s.close(); } catch { /* ignore */ } });
    this.servers = {};
    this.status.udp = this.status.tcp = this.status.http = null;
  }

  set(metric, value, src, note) {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    this.readings[metric] = { value, t: Date.now(), src, note: note || null };
  }
  touch(src) { this.status.lastMsg = Date.now(); this.status.msgs++; this.status.sources[src] = Date.now(); }

  // ---------- text: one or more NMEA sentences ----------
  ingestText(text, src) {
    String(text).split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      if (line[0] !== '$' && line[0] !== '!') { this.status.bad++; return; }
      if (!nmeaChecksumOk(line)) { this.status.bad++; return; }
      this.log.push(line); if (this.log.length > 20) this.log.shift();
      const body = line.slice(1, line.lastIndexOf('*') > 0 ? line.lastIndexOf('*') : undefined);
      const f = body.split(',');
      const type = f[0].slice(-3);
      this.touch(src);
      switch (type) {
        case 'MWV': { // wind angle, R/T, speed, unit, status
          const angle = num(f[1]), ref = (f[2] || 'T').toUpperCase(), spd = speedToMs(num(f[3]), f[4]);
          if (ref === 'T') { this.set('windDirection', angle, src); this.set('windSpeed', spd, src); }
          else if (this.heading !== null && angle !== null) { this.set('windDirection', (this.heading + angle + 360) % 360, src, 'apparent'); this.set('windSpeed', spd, src, 'apparent'); }
          else this.set('windSpeed', spd, src, 'apparent');
          break;
        }
        case 'MWD': { this.set('windDirection', num(f[1]), src); const ms = num(f[7]); this.set('windSpeed', ms !== null ? ms : speedToMs(num(f[5]), 'N'), src); break; }
        case 'MDA': { // pressIn,I,pressBar,B,airT,C,waterT,C,relHum,,absHum,,dew,C,windDirT,T,windDirM,M,windKn,N,windMs,M
          const bar = num(f[3]), inHg = num(f[1]);
          if (bar !== null) this.set('pressure', bar * 1000, src); else if (inHg !== null) this.set('pressure', inHg * 33.8639, src);
          this.set('airTemperature', num(f[5]), src); this.set('waterTemperature', num(f[7]), src); this.set('humidity', num(f[9]), src); this.set('dewPointTemperature', num(f[13]), src);
          if (num(f[15]) !== null) this.set('windDirection', num(f[15]), src);
          const ms = num(f[21]); if (ms !== null) this.set('windSpeed', ms, src); else if (num(f[19]) !== null) this.set('windSpeed', speedToMs(num(f[19]), 'N'), src);
          break;
        }
        case 'XDR': { // groups of type,value,unit,name
          for (let i = 1; i + 3 <= f.length; i += 4) {
            const ty = (f[i] || '').toUpperCase(), val = num(f[i + 1]), un = (f[i + 2] || '').toUpperCase(), name = (f[i + 3] || '').toUpperCase();
            if (val === null) continue;
            if (ty === 'P') this.set('pressure', un === 'B' ? val * 1000 : un === 'P' ? val / 100 : val, src);
            else if (ty === 'C') { if (/WATER|SEA|WTMP/.test(name)) this.set('waterTemperature', val, src); else this.set('airTemperature', val, src); }
            else if (ty === 'H') this.set('humidity', val, src);
            else if (ty === 'A' && /WIND|WDIR/.test(name)) this.set('windDirection', val, src);
          }
          break;
        }
        case 'MTW': this.set('waterTemperature', num(f[1]), src); break;
        case 'HDT': if (num(f[1]) !== null) this.heading = num(f[1]); break;
        case 'VTG': { const cog = num(f[1]), sog = num(f[5]); if (this.position) { this.position.cog = cog; this.position.sog = sog !== null ? sog * KN : null; } break; }
        case 'RMC': { const p = nmeaLatLon(f[3], f[4], f[5], f[6]); if (p && f[2] === 'A') this.position = { ...p, t: Date.now(), sog: num(f[7]) !== null ? num(f[7]) * KN : null, cog: num(f[8]) }; break; }
        case 'GGA': { const p = nmeaLatLon(f[2], f[3], f[4], f[5]); if (p && num(f[6]) > 0) this.position = { ...(this.position || {}), ...p, t: Date.now() }; break; }
        case 'GLL': { const p = nmeaLatLon(f[1], f[2], f[3], f[4]); if (p && (f[6] || 'A') === 'A') this.position = { ...(this.position || {}), ...p, t: Date.now() }; break; }
        default: break;
      }
    });
  }

  // ---------- JSON: { windSpeed, windSpeedUnit?: 'kn'|'ms'|'kmh', windDirection, gust, airTemperature, pressure, humidity,
  //                    dewPointTemperature, waterTemperature, visibility, lat, lon, heading, sog, cog, ts? }
  ingestJson(obj, src) {
    if (!obj || typeof obj !== 'object') throw new Error('JSON object expected');
    this.touch(src);
    const unit = String(obj.windSpeedUnit || obj.speedUnit || 'ms').toLowerCase();
    const conv = (v) => (v === null || v === undefined ? null : unit === 'kn' || unit === 'kt' ? +v * KN : unit === 'kmh' ? +v * KMH : +v);
    if (obj.windSpeed !== undefined) this.set('windSpeed', conv(obj.windSpeed), src);
    if (obj.gust !== undefined) this.set('gust', conv(obj.gust), src);
    ['windDirection', 'airTemperature', 'pressure', 'humidity', 'dewPointTemperature', 'waterTemperature', 'visibility'].forEach((k) => { if (obj[k] !== undefined && obj[k] !== null) this.set(k, +obj[k], src); });
    if (obj.pressureUnit && /in/i.test(obj.pressureUnit) && this.readings.pressure) this.readings.pressure.value *= 33.8639;
    if (obj.heading !== undefined) this.heading = +obj.heading;
    if (obj.lat !== undefined && obj.lon !== undefined && Number.isFinite(+obj.lat) && Number.isFinite(+obj.lon)) this.position = { lat: +obj.lat, lon: +obj.lon, t: Date.now(), sog: obj.sog !== undefined ? +obj.sog : (this.position && this.position.sog), cog: obj.cog !== undefined ? +obj.cog : (this.position && this.position.cog) };
  }

  snapshot() {
    return { readings: this.readings, position: this.position, heading: this.heading, status: this.status, log: this.log.slice(-8) };
  }
}

module.exports = { SensorHub, METRICS, nmeaChecksumOk };
