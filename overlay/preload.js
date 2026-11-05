'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petHost', {
  kind: 'electron',
  onState(cb) {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on('pet:state', listener);
    return () => ipcRenderer.removeListener('pet:state', listener);
  },
  onMessages(cb) {
    const listener = (_e, messages) => cb(messages);
    ipcRenderer.on('pet:messages', listener);
    return () => ipcRenderer.removeListener('pet:messages', listener);
  },
  send: (msg) => ipcRenderer.send('pet:send', msg),
  dragBy: (dx, dy) => ipcRenderer.send('pet:drag', { dx, dy }),
  showMenu: () => ipcRenderer.send('pet:menu'),
  openSettings: () => ipcRenderer.send('pet:openSettings'),
  onSettings(cb) {
    const listener = (_e, s) => cb(s);
    ipcRenderer.on('pet:settings', listener);
    return () => ipcRenderer.removeListener('pet:settings', listener);
  },
});
