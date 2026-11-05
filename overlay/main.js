'use strict';
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const { petDir, watchState, watchMessages } = require('./lib/pet-dir');
const { recordAction } = require('./lib/actions');
const settings = require('./lib/settings');
const demo = require('./lib/demo-mode');

const WIDTH = 220;
const HEIGHT = 300;
const MARGIN = 16;

let win;
let tray;
let stopWatching = [];
let lastState = null;
let lastMessages = null;
let settingsWin;
let stopWatchingSettings;
let currentSettings = settings.readSettings();

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
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('pet:settings', currentSettings);
    win.webContents.send('pet:state', lastState);
    win.webContents.send('pet:messages', lastMessages);
  });
  win.on('closed', () => (win = null));
}

function openSettings() {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 380,
    height: 600,
    title: 'NapCat settings',
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, 'web', 'settings.html'));
  settingsWin.on('closed', () => (settingsWin = null));
}

function applySettings(next) {
  currentSettings = next;
  if (win) win.webContents.send('pet:settings', next);
  if (settingsWin) settingsWin.webContents.send('settings:changed', next);
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
    { label: 'Demo mode (fake states)', type: 'checkbox', checked: demo.isOn(), click: toggleDemo },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Show / hide pet', click: () => (win.isVisible() ? win.hide() : win.showInactive()) },
    { label: 'Move to bottom-right', click: () => win.setBounds({ ...bottomRight(), width: WIDTH, height: HEIGHT }) },
    { label: 'Open DevTools', click: () => win.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: 'Quit NapCat', role: 'quit' },
  ];
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('NapCat');
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
  // Windows/Linux: a left click on the tray icon opens settings directly.
  tray.on('click', () => process.platform !== 'darwin' && openSettings());
}

ipcMain.on('pet:drag', (_e, { dx, dy }) => {
  if (!win || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});
ipcMain.on('pet:menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window: win }));
ipcMain.on('pet:send', (_e, msg) => recordAction(msg));
ipcMain.on('pet:openSettings', openSettings);
ipcMain.handle('settings:get', () => ({
  settings: currentSettings,
  groups: settings.GROUPS,
  path: settings.settingsPath(),
}));
ipcMain.handle('settings:save', (_e, next) => {
  const saved = settings.writeSettings(next);
  applySettings(saved);
  return saved;
});
ipcMain.handle('settings:reset', () => {
  const saved = settings.writeSettings(settings.defaults());
  applySettings(saved);
  return saved;
});
ipcMain.on('settings:close', () => settingsWin && settingsWin.close());

app.on('second-instance', () => win && win.showInactive());

app.whenReady().then(() => {
  // Accessory app: no Dock icon; the tray (menu bar) and right-click menu offer Quit.
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();
  createTray();
  stopWatchingSettings = settings.watchSettings(applySettings);
  if (process.argv.includes('--settings')) openSettings();
  if (app.isPackaged && demo.noRealState()) demo.start();
  watchAll();
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
});

function watchAll() {
  stopWatching.forEach((stop) => stop());
  stopWatching = [
    watchState((state) => {
      lastState = state;
      if (win) win.webContents.send('pet:state', state);
    }),
    watchMessages((messages) => {
      lastMessages = messages;
      if (win) win.webContents.send('pet:messages', messages);
    }),
  ];
}

function toggleDemo() {
  if (demo.isOn()) demo.stop();
  else demo.start();
  watchAll();
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  stopWatching.forEach((stop) => stop());
  if (stopWatchingSettings) stopWatchingSettings();
  demo.stop();
});
