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
  fetchCurrents: (points) => ipcRenderer.invoke('currents:fetch', points),
  fetchEnsemble: (points, model) => ipcRenderer.invoke('ensemble:fetch', points, model),
  sensorsStart: (cfg) => ipcRenderer.invoke('sensors:start', cfg),
  sensorsStop: () => ipcRenderer.invoke('sensors:stop'),
  sensorsSnapshot: () => ipcRenderer.invoke('sensors:snapshot'),
  aisSetKey: (key) => ipcRenderer.invoke('ais:setKey', key),
  aisHasKey: () => ipcRenderer.invoke('ais:hasKey'),
  aisStart: (bbox) => ipcRenderer.invoke('ais:start', bbox),
  aisStop: () => ipcRenderer.invoke('ais:stop'),
  aisSnapshot: () => ipcRenderer.invoke('ais:snapshot'),
  notify: (title, body, urgent) => ipcRenderer.invoke('notify', { title, body, urgent }),
  attention: () => ipcRenderer.invoke('window:attention'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  platform: process.platform
});
