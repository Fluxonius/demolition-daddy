'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function petDir() {
  return process.env.CURSOR_PET_DIR || path.join(os.homedir(), '.cursor-pet');
}

const statePath = () => path.join(petDir(), 'state.json');
const eventsPath = () => path.join(petDir(), 'events.jsonl');

/** Returns the parsed state, or null if the file is missing or half-written. */
function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return null;
  }
}

/** Calls cb(state) whenever state.json changes. Survives atomic renames and a missing dir. */
function watchState(cb, { pollMs = 1000 } = {}) {
  const dir = petDir();
  fs.mkdirSync(dir, { recursive: true });
  let last = '';
  const check = () => {
    let raw;
    try {
      raw = fs.readFileSync(statePath(), 'utf8');
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
    watcher = fs.watch(dir, (_evt, name) => {
      if (name && name !== 'state.json') return;
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

module.exports = { petDir, statePath, eventsPath, readState, watchState };
