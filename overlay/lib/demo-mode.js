'use strict';
// Demo mode for the packaged app: runs scripts/fake-state.mjs (as Node, via Electron's
// ELECTRON_RUN_AS_NODE) against a scratch CURSOR_PET_DIR, so judges see the pet react
// without npm, the engine or a real ~/.cursor-pet.
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEMO_DIR = path.join(os.tmpdir(), 'cursor-pet-demo');
const realDir = process.env.CURSOR_PET_DIR;
let child = null;

const isOn = () => child !== null;

/** True when nothing has ever written a real state.json, i.e. the engine isn't set up. */
function noRealState() {
  const dir = realDir || path.join(os.homedir(), '.cursor-pet');
  return !fs.existsSync(path.join(dir, 'state.json'));
}

function start() {
  if (child) return;
  process.env.CURSOR_PET_DIR = DEMO_DIR;
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  const c = fork(path.join(__dirname, '..', 'scripts', 'fake-state.mjs'), ['--every', '3'], {
    env: { ...process.env, CURSOR_PET_DIR: DEMO_DIR },
    stdio: 'ignore',
  });
  c.on('exit', () => {
    if (child === c) child = null;
  });
  child = c;
}

function stop() {
  if (!child) return;
  child.kill();
  child = null;
  if (realDir === undefined) delete process.env.CURSOR_PET_DIR;
  else process.env.CURSOR_PET_DIR = realDir;
}

module.exports = { isOn, start, stop, noRealState };
