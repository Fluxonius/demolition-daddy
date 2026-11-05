'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('inspectorHost', {
  get: () => ipcRenderer.invoke('inspector:get'),
  simulate: (name) => ipcRenderer.invoke('inspector:simulate', name),
  scenario: () => ipcRenderer.invoke('inspector:scenario'),
  mode: (mode) => ipcRenderer.invoke('inspector:mode', mode),
  reset: () => ipcRenderer.invoke('inspector:reset'),
  close: () => ipcRenderer.send('inspector:close'),
});
