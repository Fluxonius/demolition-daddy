'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function petDir() {
  return process.env.CURSOR_PET_DIR || path.join(os.homedir(), '.cursor-pet');
}

const statePath = () => path.join(petDir(), 'state.json');
const messagesPath = () => path.join(petDir(), 'messages.json');
const eventsPath = () => path.join(petDir(), 'events.jsonl');
const actionsPath = () => path.join(petDir(), 'actions.jsonl');

/** Returns the parsed JSON file in PET_DIR, or null if missing or half-written. */
function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(petDir(), name), 'utf8'));
  } catch {
    return null;
  }
}

const readState = () => readJson('state.json');
const readMessages = () => readJson('messages.json');

/** Calls cb(json) whenever PET_DIR/<name> changes. Survives atomic renames and a missing dir. */
function watchJson(name, cb, { pollMs = 1000 } = {}) {
  const dir = petDir();
  const file = path.join(dir, name);
  fs.mkdirSync(dir, { recursive: true });
  let last = '';
  const check = () => {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      raw = '';
    }
    if (raw === last) return;
    last = raw;
    if (!raw) return cb(null);
    try {
      cb(JSON.parse(raw));
    } catch {
      last = ''; // partial write; retry on the next tick
    }
  };
  let debounce;
  let watcher;
  try {
    watcher = fs.watch(dir, (_evt, changed) => {
      if (changed && changed !== name) return;
      clearTimeout(debounce);
      debounce = setTimeout(check, 50);
    });
  } catch {
    // fs.watch is unavailable on some filesystems; polling below still works
  }
  const timer = setInterval(check, pollMs);
  check();
  return () => {
    clearInterval(timer);
    clearTimeout(debounce);
    if (watcher) watcher.close();
  };
}

const watchState = (cb, opts) => watchJson('state.json', cb, opts);
const watchMessages = (cb, opts) => watchJson('messages.json', cb, opts);

module.exports = {
  petDir, statePath, messagesPath, eventsPath, actionsPath,
  readJson, readState, readMessages, watchJson, watchState, watchMessages,
};
