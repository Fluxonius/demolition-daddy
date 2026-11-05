'use strict';
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const { petDir, watchState } = require('./lib/pet-dir');
const { recordAction } = require('./lib/actions');

const WIDTH = 220;
const HEIGHT = 260;
const MARGIN = 16;

let win;
let tray;
let stopWatching;
let lastState = null;

if (!app.requestSingleInstanceLock()) app.quit();

function bottomRight() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - WIDTH - MARGIN),
    y: Math.round(workArea.y + workArea.height - HEIGHT - MARGIN),
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    ...bottomRight(),
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 'floating' keeps the pet above normal windows; on macOS also follow the user across Spaces.
  win.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
  win.webContents.on('did-finish-load', () => win.webContents.send('pet:state', lastState));
  win.on('closed', () => (win = null));
}

function trayIcon() {
  // 16x16 filled circle drawn in memory, so the repo needs no binary assets.
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 49;
      const i = (y * size + x) * 4;
      buf[i] = 0x20; buf[i + 1] = 0x20; buf[i + 2] = 0x20; // BGR
      buf[i + 3] = inside ? 0xff : 0x00;
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size });
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

function menuTemplate() {
  return [
    { label: `State dir: ${petDir()}`, enabled: false },
    { type: 'separator' },
    { label: 'Show / hide pet', click: () => (win.isVisible() ? win.hide() : win.showInactive()) },
    { label: 'Move to bottom-right', click: () => win.setBounds({ ...bottomRight(), width: WIDTH, height: HEIGHT }) },
    { label: 'Open DevTools', click: () => win.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: 'Quit pet', role: 'quit' },
  ];
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Demolition Daddy pet');
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

ipcMain.on('pet:drag', (_e, { dx, dy }) => {
  if (!win || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});
ipcMain.on('pet:menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window: win }));
ipcMain.on('pet:send', (_e, msg) => recordAction(msg));

app.on('second-instance', () => win && win.showInactive());

app.whenReady().then(() => {
  // Accessory app: no Dock icon; the tray (menu bar) and right-click menu offer Quit.
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();
  createTray();
  stopWatching = watchState((state) => {
    lastState = state;
    if (win) win.webContents.send('pet:state', state);
  });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => stopWatching && stopWatching());
