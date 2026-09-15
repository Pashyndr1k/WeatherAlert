// WeatherAlert — Electron main process
// Responsibilities: window lifecycle, persistent settings, encrypted API-key storage,
// network fetches (kept out of the renderer), OS notifications.
'use strict';

const { app, BrowserWindow, ipcMain, Notification, safeStorage, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

const providers = require('./src/providers');

const APP_ID = 'io.weatheralert.desktop';
let win = null;

// ---------- settings persistence ----------
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
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
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
