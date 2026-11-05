// Engine runner: reads $CURSOR_PET_DIR/events.jsonl, writes state.json per foundation §4.4.1.
// Usage: node engine/scripts/run.mjs [--dir <path>] [--every <seconds>] [--llm] [--once] [--now <ms>|last]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readEvents, buildSnapshot } from '../../hooks/telemetry.mjs';
import { ruleAnalyzer } from '../../hooks/analyzer/rules.mjs';
import { createLlmAnalyzer } from '../../hooks/analyzer/llm.mjs';
import { cursorCliComplete } from '../../hooks/analyzer/cursor-cli.mjs';
import { buildPetState } from '../src/engine.ts';
import { llmWorkspace } from '../../hooks/lib/pet-dir.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const dir = path.resolve(arg('--dir', process.env.CURSOR_PET_DIR || path.join(os.homedir(), '.cursor-pet')));
const everyMs = Number(arg('--every', 5)) * 1000;
const LLM_EVERY_MS = 2 * 60_000;
const DAY = 24 * 3600_000;

const eventsFile = path.join(dir, 'events.jsonl');
const stateFile = path.join(dir, 'state.json');
const llm = process.argv.includes('--llm') ? createLlmAnalyzer({ complete: cursorCliComplete({ workspace: llmWorkspace(dir) }) }) : null;
let llmResult = null;
let llmAt = 0;
let llmBusy = false;

function writeAtomic(file, obj) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

const nowArg = arg('--now', null);

async function tick() {
  const all = readEvents(eventsFile);
  const now = nowArg === 'last' ? (all.at(-1)?.ts ?? Date.now()) : nowArg ? Number(nowArg) : Date.now();
  const events = all.filter((e) => e.ts >= now - 8 * DAY);
  const snapshot = buildSnapshot(events, { now });
  const lastSnooze = events.filter((e) => e.type === 'ext.snooze').at(-1);

  let assessment = await ruleAnalyzer.analyze(snapshot);
  if (llm) {
    if (!llmBusy && Date.now() - llmAt >= LLM_EVERY_MS) {
      llmBusy = true;
      llmAt = Date.now();
      llm.analyze(snapshot).then((r) => { llmResult = r; }).catch(() => {}).finally(() => { llmBusy = false; });
    }
    // A rules fallback from the analyzer is older than the live rules result, so only a fresh LLM answer wins.
    if (llmResult?.source === 'llm' && now - llmResult.at < 2 * LLM_EVERY_MS && !snapshot.onBreak) assessment = llmResult;
  }

  const state = buildPetState(snapshot, assessment, { now, lastSnoozeAt: lastSnooze ? lastSnooze.ts : null });
  writeAtomic(stateFile, { ...state, updatedAt: Date.now() });
  console.log(`${new Date(now).toISOString()}  load ${String(state.load).padStart(3)}  ${state.mood.padEnd(8)} ${state.nudge ? `nudge: ${state.nudge.id}` : ''}`);
}

console.log(`Engine: ${eventsFile} -> ${stateFile} every ${everyMs / 1000}s${llm ? ' (LLM via Cursor CLI)' : ''}. Ctrl+C to stop.`);
await tick();
if (!process.argv.includes('--once')) setInterval(() => tick().catch((err) => console.error(err)), everyMs);
