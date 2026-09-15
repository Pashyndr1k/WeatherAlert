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
    loadMapData: async (dataset, res) => (await fetch(dataset === 'gshhg' ? `../assets/blacksea/blacksea_${res}.json` : '../node_modules/world-atlas/countries-50m.json')).json(),
    fetchWeather: async (points, opts) => window.WA.providers.fetchAll(opts.provider, points, { ...opts, httpGetJson, apiKey: localStorage.getItem('wa.key') || '' }),
    notify: async (t, b) => { console.log('[notify]', t, b); if (window.Notification && Notification.permission === 'granted') new Notification(t, { body: b }); },
    attention: async () => {},
    openExternal: async (u) => window.open(u, '_blank'),
    platform: 'web'
  };
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
}
