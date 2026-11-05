// Writes a fake PetState to $CURSOR_PET_DIR/state.json and walks through every state in
// web/states.js (one per use case), so the overlay can be built and demoed without the engine.
// It also plays the AI layer: every few steps it adds a sample message to messages.json and
// drops messages the overlay answered in actions.jsonl.
// Usage: npm run fake [-- --every 3] [-- --list] [-- --no-messages] [-- --message-every 3]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { petDir, statePath, messagesPath, actionsPath } = require('../lib/pet-dir.js');
const { STATES, MESSAGES, toPetState } = require('../web/states.js');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const EVERY_MS = arg('--every', 4) * 1000;
const MESSAGE_EVERY = arg('--message-every', 3);
const SEND_MESSAGES = !process.argv.includes('--no-messages');

function writeAtomic(file, obj) {
  fs.mkdirSync(petDir(), { recursive: true });
  const tmp = path.join(petDir(), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file); // atomic, like the engine should do
}

function writeState(example) {
  writeAtomic(statePath(), toPetState(example.state, Date.now()));
  console.log(`${new Date().toISOString()}  ${example.id.padEnd(11)} ${example.useCase}`);
}

// ---- messages.json ----
const startedAt = Date.now();
let queue = [];
let nextMessage = 0;

const answered = new Set();
function readAnswers() {
  let raw = '';
  try {
    raw = fs.readFileSync(actionsPath(), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    let a;
    try {
      a = JSON.parse(line);
    } catch {
      continue;
    }
    if (a.ts < startedAt || answered.has(a.messageId)) continue;
    answered.add(a.messageId);
    console.log(`${''.padEnd(26)}<- ${a.messageId}: ${a.action}`);
  }
}

function syncMessages(addNew) {
  const now = Date.now();
  readAnswers();
  queue = queue.filter((m) => !answered.has(m.id) && !(m.ttlMs > 0 && now > m.createdAt + m.ttlMs));
  if (addNew) {
    const sample = MESSAGES[nextMessage++ % MESSAGES.length];
    const msg = { ...sample, id: `${sample.id}-${now}`, createdAt: now };
    queue.push(msg);
    console.log(`${''.padEnd(26)}-> message ${msg.id}: "${msg.text}"`);
  }
  writeAtomic(messagesPath(), { v: 1, updatedAt: now, messages: queue });
}

if (process.argv.includes('--list')) {
  for (const s of STATES) console.log(`${s.id.padEnd(11)} ${s.useCase}`);
  for (const m of MESSAGES) console.log(`message    ${m.id}: ${m.text}`);
  process.exit(0);
}

let i = 0;
console.log(`Writing ${statePath()} every ${EVERY_MS / 1000}s (${STATES.length} states). Ctrl+C to stop.`);
if (SEND_MESSAGES) console.log(`Adding a message to ${messagesPath()} every ${MESSAGE_EVERY} steps.`);
writeState(STATES[i]);
if (SEND_MESSAGES) syncMessages(false);
setInterval(() => {
  writeState(STATES[(i = (i + 1) % STATES.length)]);
  if (SEND_MESSAGES) syncMessages(i % MESSAGE_EVERY === 0);
}, EVERY_MS);
