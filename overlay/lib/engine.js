'use strict';
// Runs the real engine runner (engine/scripts/run.mjs) as a child process, using Electron's own Node
// (ELECTRON_RUN_AS_NODE), so the packaged app needs no terminal. In a packaged app the runner and hooks/
// are copied to Resources/ by electron-builder `extraResources`.
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STALE_MS = 30_000;

function runnerPath() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'engine', 'scripts', 'run.mjs'),
    path.join(__dirname, '..', '..', 'engine', 'scripts', 'run.mjs'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/** True when some engine wrote state.json within the last 30 s (e.g. one started in a terminal). */
function engineAlive(dir, now = Date.now()) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    return Number.isFinite(s.updatedAt) && now - s.updatedAt < STALE_MS;
  } catch {
    return false;
  }
}

// GUI apps on macOS get a minimal PATH; the Cursor CLI installs to ~/.local/bin.
function cliPath() {
  const extra = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  return [process.env.PATH, ...extra].filter(Boolean).join(path.delimiter);
}

/** Hour offset that makes the local clock read `hour` now, as an Etc/GMT zone (sign is inverted). */
function zoneForHour(hour, now = new Date()) {
  let off = (hour - now.getUTCHours() + 24) % 24;
  if (off > 14) off -= 24;
  return off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
}

let child = null;
const ownDirs = new Set();
let info = { running: false, dir: null, llm: true, tz: null, external: false, error: null };

function start(dir, { llm = true, tz = null } = {}) {
  stop();
  const script = runnerPath();
  if (!script) {
    info = { running: false, dir, llm, tz, external: false, error: 'engine/scripts/run.mjs not found' };
    return info;
  }
  const args = ['--dir', dir, '--every', '2', ...(llm ? ['--llm'] : [])];
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', CURSOR_PET_DIR: dir, PATH: cliPath() };
  if (tz) env.TZ = tz;
  const c = fork(script, args, { env, stdio: 'ignore' });
  ownDirs.add(dir);
  c.on('exit', (code) => {
    if (child !== c) return;
    child = null;
    info = { ...info, running: false, error: `engine exited (${code})` };
  });
  child = c;
  info = { running: true, pid: c.pid, dir, llm, tz, external: false, error: null };
  return info;
}

function stop() {
  if (!child) return;
  const c = child;
  child = null;
  c.kill();
  info = { ...info, running: false };
}

/** Starts the runner for dir unless another engine is already heartbeating there. */
function ensure(dir, opts) {
  if (child && info.dir === dir && (!opts || (opts.tz ?? null) === info.tz)) return info;
  if (child && info.dir !== dir) stop();
  if (!ownDirs.has(dir) && engineAlive(dir)) {
    info = { running: true, dir, llm: null, tz: null, external: true, error: null };
    return info;
  }
  return start(dir, opts);
}

const status = () => info;

module.exports = { runnerPath, engineAlive, zoneForHour, start, stop, ensure, status };
