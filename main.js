// WeatherAlert — Electron main process
// Responsibilities: window lifecycle, persistent settings, encrypted API-key storage,
// network fetches (kept out of the renderer), OS notifications.
'use strict';

const { app, BrowserWindow, ipcMain, Notification, safeStorage, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

const providers = require('./src/providers');
const { SensorHub } = require('./src/sensors');
const sensorHub = new SensorHub();

const APP_ID = 'io.weatheralert.desktop';
let win = null;

// ---------- settings persistence ----------
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8').replace(/^﻿/, ''); // tolerate a BOM from external editors
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeSettings(obj) {
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

// API key is stored encrypted with the OS keychain (DPAPI on Windows, Keychain on macOS).
function keyPath() {
  return path.join(app.getPath('userData'), 'stormglass.key');
}
function saveApiKey(key) {
  if (!key) {
    try { fs.unlinkSync(keyPath()); } catch { /* ignore */ }
    return true;
  }
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(keyPath(), safeStorage.encryptString(key));
  } else {
    fs.writeFileSync(keyPath(), Buffer.from('plain:' + key, 'utf8'));
  }
  return true;
}
function loadApiKey() {
  try {
    const buf = fs.readFileSync(keyPath());
    const asText = buf.toString('utf8');
    if (asText.startsWith('plain:')) return asText.slice(6);
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf);
    return '';
  } catch {
    return '';
  }
}

// ---------- HTTP via Electron net (honours system proxy) ----------
function httpGetJson(url, headers = {}, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    Object.entries(headers).forEach(([k, v]) => request.setHeader(k, v));
    request.setHeader('Accept', 'application/json');
    request.setHeader('User-Agent', 'WeatherAlert/0.1 (desktop)');
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error('Request timed out'));
    }, timeoutMs);
    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        clearTimeout(timer);
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(body); } catch { /* non-JSON body */ }
        resolve({ status: response.statusCode, json, body });
      });
      response.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    request.on('error', (e) => { clearTimeout(timer); reject(e); });
    request.end();
  });
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a1420',
    title: 'WeatherAlert',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, obj) => { writeSettings(obj); return true; });
ipcMain.handle('apikey:get', () => loadApiKey());
ipcMain.handle('apikey:set', (_e, key) => saveApiKey(String(key || '').trim()));
ipcMain.handle('apikey:has', () => Boolean(loadApiKey()));

// Map data: GSHHG Black Sea tiles by resolution (c/l/i/h/f) or Natural Earth 50 m for the wide view.
ipcMain.handle('map:load', (_e, dataset, res) => {
  let p;
  if (dataset === 'gshhg') {
    if (!/^[clihf]$/.test(String(res))) throw new Error('bad resolution');
    p = path.join(__dirname, 'assets', 'blacksea', `blacksea_${res}.json`);
  } else if (dataset === 'depth') {
    p = path.join(__dirname, 'assets', 'blacksea', 'depth.json');
  } else {
    p = path.join(__dirname, 'node_modules', 'world-atlas', 'countries-50m.json');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
});

// Fetch normalised forecasts for a list of points from the chosen provider.
// points: [{id, lat, lon}], opts: {provider:'openmeteo'|'stormglass', params:[sgParamNames]}
ipcMain.handle('weather:fetch', async (_e, points, opts) => {
  const provider = opts.provider || 'openmeteo';
  const apiKey = provider === 'stormglass' ? loadApiKey() : '';
  return providers.fetchAll(provider, points, { ...opts, apiKey, httpGetJson });
});

ipcMain.handle('currents:fetch', async (_e, points) => providers.fetchCurrents(points, { httpGetJson }));
ipcMain.handle('ensemble:fetch', async (_e, points, model) => providers.fetchEnsemble(points, { httpGetJson, model }));

// ---------- AIS (AISstream.io WebSocket) ----------
const WebSocketClient = require('ws');
function aisKeyPath() { return path.join(app.getPath('userData'), 'aisstream.key'); }
function saveAisKey(key) {
  if (!key) { try { fs.unlinkSync(aisKeyPath()); } catch { /* ignore */ } return true; }
  fs.writeFileSync(aisKeyPath(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from('plain:' + key, 'utf8'));
  return true;
}
function loadAisKey() {
  try {
    const buf = fs.readFileSync(aisKeyPath());
    const asText = buf.toString('utf8');
    if (asText.startsWith('plain:')) return asText.slice(6);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : '';
  } catch { return ''; }
}
const ais = { ws: null, bbox: null, vessels: new Map(), lastMsg: 0, status: 'off', error: null, retry: null };
function aisConnect() {
  const key = loadAisKey();
  if (!key || !ais.bbox) { ais.status = key ? 'off' : 'nokey'; return; }
  try { if (ais.ws) { ais.ws.removeAllListeners(); ais.ws.terminate(); } } catch { /* ignore */ }
  ais.status = 'connecting'; ais.error = null;
  const ws = new WebSocketClient('wss://stream.aisstream.io/v0/stream');
  ais.ws = ws;
  ws.on('open', () => {
    ais.status = 'live';
    // AISstream wants [[lat, lon], [lat, lon]] corners
    ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[ais.bbox.latMin, ais.bbox.lonMin], [ais.bbox.latMax, ais.bbox.lonMax]]], FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'] }));
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const meta = msg.MetaData || {};
      const mmsi = meta.MMSI || (msg.Message && msg.Message.PositionReport && msg.Message.PositionReport.UserID);
      if (!mmsi) return;
      const v = ais.vessels.get(mmsi) || { mmsi };
      const type = msg.MessageType;
      if (type === 'PositionReport' || type === 'StandardClassBPositionReport') {
        const pr = msg.Message[type];
        v.lat = meta.latitude !== undefined ? meta.latitude : pr.Latitude; v.lon = meta.longitude !== undefined ? meta.longitude : pr.Longitude;
        v.sog = pr.Sog; v.cog = pr.Cog; v.heading = pr.TrueHeading; v.t = Date.now();
        if (meta.ShipName) v.name = String(meta.ShipName).trim();
      } else if (type === 'ShipStaticData') {
        const sd = msg.Message.ShipStaticData;
        v.name = String(sd.Name || meta.ShipName || '').trim(); v.type = sd.Type; v.dest = String(sd.Destination || '').trim(); v.imo = sd.ImoNumber;
        if (!v.lat && meta.latitude !== undefined) { v.lat = meta.latitude; v.lon = meta.longitude; v.t = Date.now(); }
      }
      ais.vessels.set(mmsi, v); ais.lastMsg = Date.now();
    } catch { /* ignore malformed */ }
  });
  const scheduleRetry = () => { if (ais.retry) clearTimeout(ais.retry); if (ais.bbox) ais.retry = setTimeout(aisConnect, 15000); };
  ws.on('error', (e) => { ais.status = 'error'; ais.error = e.message; });
  ws.on('close', () => { if (ais.status !== 'off') { ais.status = ais.status === 'error' ? 'error' : 'reconnecting'; scheduleRetry(); } });
}
function aisStop() {
  ais.bbox = null; ais.status = 'off';
  if (ais.retry) { clearTimeout(ais.retry); ais.retry = null; }
  try { if (ais.ws) { ais.ws.removeAllListeners(); ais.ws.close(); } } catch { /* ignore */ }
  ais.ws = null;
}
setInterval(() => { const cut = Date.now() - 30 * 60e3; for (const [k, v] of ais.vessels) if ((v.t || 0) < cut) ais.vessels.delete(k); }, 60e3);
ipcMain.handle('sensors:start', (_e, cfg) => {
  sensorHub.start(cfg || {});
  setTimeout(() => console.log('[sensors] listeners', JSON.stringify({ udp: sensorHub.status.udp, tcp: sensorHub.status.tcp, http: sensorHub.status.http, error: sensorHub.status.error })), 800);
  return sensorHub.status;
});
ipcMain.handle('sensors:stop', () => { sensorHub.stop(); return true; });
ipcMain.handle('sensors:snapshot', () => sensorHub.snapshot());
ipcMain.handle('ais:setKey', (_e, key) => saveAisKey(String(key || '').trim()));
ipcMain.handle('ais:hasKey', () => Boolean(loadAisKey()));
ipcMain.handle('ais:start', (_e, bbox) => { ais.bbox = bbox; ais.vessels.clear(); aisConnect(); return ais.status; });
ipcMain.handle('ais:stop', () => { aisStop(); return true; });
ipcMain.handle('ais:snapshot', () => ({ status: ais.status, error: ais.error, lastMsg: ais.lastMsg, vessels: [...ais.vessels.values()].filter((v) => v.lat !== undefined) }));

ipcMain.handle('notify', (_e, { title, body, urgent }) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title, body, silent: true, urgency: urgent ? 'critical' : 'normal' });
  n.on('click', () => { if (win) { win.show(); win.focus(); } });
  n.show();
  return true;
});

ipcMain.handle('window:attention', () => {
  if (!win) return;
  if (process.platform === 'win32') win.flashFrame(true);
  else app.dock && app.dock.bounce('critical');
});

ipcMain.handle('open:external', (_e, url) => {
  if (/^https?:/.test(url)) shell.openExternal(url);
});

// ---------- lifecycle ----------
app.setAppUserModelId(APP_ID);
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { sensorHub.stop(); if (process.platform !== 'darwin') app.quit(); });
