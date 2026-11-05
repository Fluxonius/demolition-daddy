// Writes a fake PetState to $CURSOR_PET_DIR/state.json and walks through every state in
// web/states.js (one per use case), so the overlay can be built and demoed without the engine.
// Usage: npm run fake [-- --every 3] [-- --list]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { petDir, statePath } = require('../lib/pet-dir.js');
const { STATES, toPetState } = require('../web/states.js');

const everyArg = process.argv.indexOf('--every');
const EVERY_MS = (everyArg > 0 ? Number(process.argv[everyArg + 1]) : 4) * 1000;

function write(example) {
  const state = toPetState(example.state, Date.now());
  fs.mkdirSync(petDir(), { recursive: true });
  const tmp = path.join(petDir(), `.state.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath()); // atomic, like the engine should do
  console.log(`${new Date().toISOString()}  ${example.id.padEnd(11)} ${example.useCase}`);
}

if (process.argv.includes('--list')) {
  for (const s of STATES) console.log(`${s.id.padEnd(11)} ${s.useCase}`);
  process.exit(0);
}

let i = 0;
console.log(`Writing ${statePath()} every ${EVERY_MS / 1000}s (${STATES.length} states). Ctrl+C to stop.`);
write(STATES[i]);
setInterval(() => write(STATES[(i = (i + 1) % STATES.length)]), EVERY_MS);
