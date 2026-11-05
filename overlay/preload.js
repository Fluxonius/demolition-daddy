'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petHost', {
  kind: 'electron',
  onState(cb) {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on('pet:state', listener);
    return () => ipcRenderer.removeListener('pet:state', listener);
  },
  send: (msg) => ipcRenderer.send('pet:send', msg),
  dragBy: (dx, dy) => ipcRenderer.send('pet:drag', { dx, dy }),
  showMenu: () => ipcRenderer.send('pet:menu'),
});
