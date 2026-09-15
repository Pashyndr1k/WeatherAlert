'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (obj) => ipcRenderer.invoke('settings:set', obj),
  getApiKey: () => ipcRenderer.invoke('apikey:get'),
  setApiKey: (key) => ipcRenderer.invoke('apikey:set', key),
  hasApiKey: () => ipcRenderer.invoke('apikey:has'),
  loadMapData: (dataset, res) => ipcRenderer.invoke('map:load', dataset, res),
  fetchWeather: (points, opts) => ipcRenderer.invoke('weather:fetch', points, opts),
  notify: (title, body, urgent) => ipcRenderer.invoke('notify', { title, body, urgent }),
  attention: () => ipcRenderer.invoke('window:attention'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  platform: process.platform
});
