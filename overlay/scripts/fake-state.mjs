// Writes a fake PetState to $CURSOR_PET_DIR/state.json and cycles moods, so the overlay
// can be built and demoed without the engine. Usage: npm run fake [-- --every 3]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { petDir, statePath } = require('../lib/pet-dir.js');

const everyArg = process.argv.indexOf('--every');
const EVERY_MS = (everyArg > 0 ? Number(process.argv[everyArg + 1]) : 4) * 1000;

const SCRIPT = [
  { mood: 'egg', load: 0 },
  { mood: 'happy', load: 15 },
  { mood: 'focused', load: 45, reasons: ['waiting 3 min on the agent'], overlays: ['bored'] },
  { mood: 'tired', load: 70, reasons: ['55 min without a break', '~75k tokens this session'], overlays: ['stuffed'],
    nudge: { id: 'eyes-20-20-20', level: 1, moment: 'agentStopped', kind: 'micro', exercise: 'eyes-20-20-20', text: 'Eyes need 20 seconds?' } },
  { mood: 'melting', load: 90, reasons: ["3 'fix it's in 10 min"], overlays: ['sweaty'],
    nudge: { id: 'long-walk', level: 2, moment: 'agentWorking', kind: 'long', exercise: 'walk', text: 'The agent is busy. Walk with me for 5 minutes?' } },
  { mood: 'sleeping', load: 98, reasons: ['past bedtime'], overlays: ['nightcap'] },
  { mood: 'resting', load: 40, reasons: ['On a break'],
    nudge: { id: 'stretch', level: 0, moment: 'idle', kind: 'micro', exercise: 'stretch', text: 'Reach up high!' } },
];

function write(step) {
  const state = {
    v: 1,
    updatedAt: Date.now(),
    load: step.load,
    mood: step.mood,
    reasons: step.reasons || [],
    stats: { prompts: 0, agentTurns: 0, filesEdited: 0, readChars: 0, waitMs: 0, sessionMs: 0, sinceBreakMs: 0,
      parallelConvs: 1, aborts: 0, frustration: 0, snoozes: 0 },
    agentWorking: false,
    onBreak: step.mood === 'resting',
    ...(step.nudge ? { nudge: step.nudge } : {}),
    ...(step.overlays ? { overlays: step.overlays } : {}),
  };
  fs.mkdirSync(petDir(), { recursive: true });
  const tmp = path.join(petDir(), `.state.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath()); // atomic, like the engine should do
  console.log(`${new Date().toISOString()}  ${state.mood.padEnd(8)} load=${state.load}`);
}

let i = 0;
console.log(`Writing ${statePath()} every ${EVERY_MS / 1000}s. Ctrl+C to stop.`);
write(SCRIPT[i]);
setInterval(() => write(SCRIPT[(i = (i + 1) % SCRIPT.length)]), EVERY_MS);
