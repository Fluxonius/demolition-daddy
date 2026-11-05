'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsHost', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (settings) => ipcRenderer.invoke('settings:save', settings),
  reset: () => ipcRenderer.invoke('settings:reset'),
  close: () => ipcRenderer.send('settings:close'),
  onChanged(cb) {
    const listener = (_e, s) => cb(s);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
  },
});
