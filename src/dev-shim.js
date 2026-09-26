// Browser-only shim so the renderer can be previewed without Electron (dev/QA).
// Uses localStorage for settings and calls the providers directly (Open-Meteo allows CORS).
if (!window.bridge) {
  const httpGetJson = async (url, headers = {}) => {
    const r = await fetch(url, { headers });
    const body = await r.text(); let json = null; try { json = JSON.parse(body); } catch {}
    return { status: r.status, json, body };
  };
  window.bridge = {
    getSettings: async () => { try { return JSON.parse(localStorage.getItem('wa.settings')); } catch { return null; } },
    saveSettings: async (o) => localStorage.setItem('wa.settings', JSON.stringify(o)),
    getApiKey: async () => localStorage.getItem('wa.key') || '',
    setApiKey: async (k) => localStorage.setItem('wa.key', k),
    hasApiKey: async () => Boolean(localStorage.getItem('wa.key')),
    loadMapData: async (dataset, res) => (await fetch(dataset === 'gshhg' ? `../assets/blacksea/blacksea_${res}.json` : dataset === 'depth' ? '../assets/blacksea/depth.json' : '../node_modules/world-atlas/countries-50m.json')).json(),
    fetchCurrents: async (points) => window.WA.providers.fetchCurrents(points, { httpGetJson }),
    fetchEnsemble: async (points, model) => window.WA.providers.fetchEnsemble(points, { httpGetJson, model }),
    sensorsStart: async (cfg) => { window.__sens = { cfg, t0: Date.now(), status: { udp: cfg.udpPort || 10110, tcp: cfg.udpPort || 10110, http: cfg.httpPort || 8787, lastMsg: Date.now(), msgs: 0, bad: 0, sources: { 'sim:preview': Date.now() }, error: null }, log: [] }; return window.__sens.status; },
    sensorsStop: async () => { window.__sens = null; },
    sensorsSnapshot: async () => { const s = window.__sens; if (!s) return { readings: {}, position: null, status: { udp: null, tcp: null, http: null, lastMsg: 0, msgs: 0, bad: 0, sources: {} }, log: [] };
      const k = (Date.now() - s.t0) / 1000, now = Date.now(); s.status.msgs++; s.status.lastMsg = now;
      const r = (v, note) => ({ value: v, t: now, src: 'sim:preview', note: note || null });
      return { readings: { windSpeed: r(9 + 3 * Math.sin(k / 20)), windDirection: r((250 + 20 * Math.sin(k / 45) + 360) % 360), gust: r(13 + 3 * Math.sin(k / 15)), airTemperature: r(17.5 + Math.sin(k / 60)), pressure: r(1009.5 - k / 300), humidity: r(80 + 5 * Math.sin(k / 30)), waterTemperature: r(21.4) }, position: { lat: 44.9 + 0.002 * Math.sin(k / 50), lon: 35.4 + 0.004 * (k / 100), t: now, sog: 6.1, cog: 80 }, heading: 80, status: s.status, log: ['$WIMDA,29.80,I,1.0092,B,17.5,C,21.4,C,80.0,,,,14.0,C,250.0,T,,,17.5,N,9.0,M*00 (simulated)'] }; },
    aisSetKey: async (k) => localStorage.setItem('wa.aiskey', k),
    aisHasKey: async () => true,
    aisStart: async (bbox) => { window.__ais = window.__ais || { vessels: new Map(), status: 'off', lastMsg: 0 }; const a = window.__ais; a.bbox = bbox; a.vessels.clear();
      const key = localStorage.getItem('wa.aiskey');
      if (!key) { // mock: a few synthetic vessels for layout testing only
        a.status = 'mock'; const seeds = [[44.9, 33.5, 'CARGO DEMO', 70], [43.2, 30.0, 'TANKER DEMO', 80], [41.6, 29.2, 'FERRY DEMO', 60], [46.4, 36.9, 'BULK DEMO', 70], [44.2, 38.9, 'TUG DEMO', 52], [42.0, 40.5, 'CONTAINER DEMO', 71]];
        seeds.forEach((s, i) => a.vessels.set(200000000 + i, { mmsi: 200000000 + i, lat: s[0], lon: s[1], name: s[2], type: s[3], sog: 8 + i, cog: (i * 61) % 360, heading: (i * 61) % 360, t: Date.now() }));
        a.lastMsg = Date.now(); return a.status; }
      try { a.ws = new WebSocket('wss://stream.aisstream.io/v0/stream'); a.status = 'connecting';
        a.ws.onopen = () => { a.status = 'live'; a.ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[bbox.latMin, bbox.lonMin], [bbox.latMax, bbox.lonMax]]], FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'] })); };
        a.ws.onmessage = (ev) => { try { const msg = JSON.parse(ev.data); const meta = msg.MetaData || {}; const mmsi = meta.MMSI; if (!mmsi) return; const v = a.vessels.get(mmsi) || { mmsi }; const type = msg.MessageType;
          if (type === 'PositionReport' || type === 'StandardClassBPositionReport') { const pr = msg.Message[type]; v.lat = meta.latitude; v.lon = meta.longitude; v.sog = pr.Sog; v.cog = pr.Cog; v.heading = pr.TrueHeading; v.t = Date.now(); if (meta.ShipName) v.name = String(meta.ShipName).trim(); }
          else if (type === 'ShipStaticData') { const sd = msg.Message.ShipStaticData; v.name = String(sd.Name || '').trim(); v.type = sd.Type; v.dest = String(sd.Destination || '').trim(); }
          a.vessels.set(mmsi, v); a.lastMsg = Date.now(); } catch (e) {} };
        a.ws.onerror = () => { a.status = 'error'; }; a.ws.onclose = () => { if (a.status !== 'off') a.status = 'reconnecting'; };
      } catch (e) { a.status = 'error'; }
      return a.status; },
    aisStop: async () => { const a = window.__ais; if (!a) return; a.status = 'off'; try { a.ws && a.ws.close(); } catch (e) {} },
    aisSnapshot: async () => { const a = window.__ais || { vessels: new Map(), status: 'off', lastMsg: 0 }; return { status: a.status, lastMsg: a.lastMsg, vessels: [...a.vessels.values()].filter((v) => v.lat !== undefined) }; },
    fetchWeather: async (points, opts) => window.WA.providers.fetchAll(opts.provider, points, { ...opts, httpGetJson, apiKey: localStorage.getItem('wa.key') || '' }),
    notify: async (t, b) => { console.log('[notify]', t, b); if (window.Notification && Notification.permission === 'granted') new Notification(t, { body: b }); },
    attention: async () => {},
    openExternal: async (u) => window.open(u, '_blank'),
    platform: 'web'
  };
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
}
