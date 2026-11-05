// One command for judges: fake engine + overlay window, using a scratch state dir
// (so it never touches a real ~/.cursor-pet). Quitting the pet stops everything.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const overlayDir = path.join(here, '..');
const env = { ...process.env, CURSOR_PET_DIR: process.env.CURSOR_PET_DIR || path.join(os.tmpdir(), 'cursor-pet-demo') };

console.log(`Demo state dir: ${env.CURSOR_PET_DIR}`);
const fake = spawn(process.execPath, [path.join(here, 'fake-state.mjs'), '--every', '3'], { env, stdio: 'inherit' });
const electron = spawn(require('electron'), [overlayDir], { env, stdio: 'inherit' });

const stop = () => {
  fake.kill();
  electron.kill();
};
electron.on('exit', (code) => {
  fake.kill();
  process.exit(code ?? 0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
