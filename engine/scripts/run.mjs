#!/usr/bin/env node
// Minimal engine runner (foundation §4.4.1): tails $CURSOR_PET_DIR/events.jsonl, assesses it with the
// hooks analyzer (rules, or the Cursor CLI with --llm, falling back to rules) and atomically writes
// state.json (PetState) and messages.json (advice as speech-bubble messages). Heartbeat every tick.
// Usage: node engine/scripts/run.mjs [--dir <PET_DIR>] [--every 5] [--llm] [--llm-every 5] [--model <id>] [--once]
//   --every      seconds between ticks (also ticks on every events.jsonl change)
//   --llm-every  minutes between Cursor CLI calls; rules fill in between and on any failure
import fs from 'node:fs';
import path from 'node:path';
import { loadSnapshot } from '../../hooks/telemetry.mjs';
import { ruleAnalyzer } from '../../hooks/analyzer/rules.mjs';
import { createLlmAnalyzer } from '../../hooks/analyzer/llm.mjs';
import { cursorCliComplete } from '../../hooks/analyzer/cursor-cli.mjs';
import { petDir, llmWorkspace } from '../../hooks/lib/pet-dir.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dir = path.resolve(opt('--dir', petDir()));
const EVERY_MS = Number(opt('--every', 5)) * 1000;
const LLM_EVERY_MS = Number(opt('--llm-every', 5)) * 60_000;
const useLlm = args.includes('--llm');
const llm = useLlm
  ? createLlmAnalyzer({ complete: cursorCliComplete({ model: opt('--model'), workspace: llmWorkspace(dir) }) })
  : null;

let llmResult = null;
let llmBusy = false;
let llmLastStart = 0;
const firstSeen = new Map();

function writeAtomic(name, obj) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${name}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, path.join(dir, name));
}

function hasEvents() {
  try {
    return fs.statSync(path.join(dir, 'events.jsonl')).size > 0;
  } catch {
    return false;
  }
}

function toState(snapshot, assessment, now) {
  const s = snapshot.windows.session;
  return {
    v: 1,
    updatedAt: now,
    load: assessment.load,
    mood: hasEvents() ? assessment.mood : 'egg',
    reasons: assessment.conditions.map((c) => c.evidence[0]).filter(Boolean),
    stats: {
      prompts: s.prompts, agentTurns: s.turns, filesEdited: s.filesEdited, readChars: s.responseChars,
      waitMs: s.waitMs, sessionMs: snapshot.session.durationMs, sinceBreakMs: snapshot.sinceBreakMs,
      parallelConvs: snapshot.parallelConvs, aborts: s.aborts, frustration: s.frustration,
      snoozes: snapshot.feedback.snoozes60m,
    },
    agentWorking: snapshot.agentWorking,
    onBreak: snapshot.onBreak,
    source: assessment.source,
    conditions: assessment.conditions,
  };
}

function toMessages(snapshot, assessment, now) {
  const messages = assessment.advice.map((a, i) => {
    const id = `${a.id}-${snapshot.session.startedAt}`;
    if (!firstSeen.has(id)) firstSeen.set(id, now);
    return {
      id,
      text: a.text,
      buttons: [{ label: "Let's go", action: `${a.id}.accept` }, { label: 'Later', action: `${a.id}.later` }],
      priority: 20 - i,
      ttlMs: 60_000,
      createdAt: firstSeen.get(id),
      ...(a.exercise ? { exercise: a.exercise } : { mood: assessment.mood }),
    };
  });
  return { v: 1, updatedAt: now, messages };
}

function maybeRunLlm(snapshot, now) {
  if (!llm || llmBusy || now - llmLastStart < LLM_EVERY_MS) return;
  llmBusy = true;
  llmLastStart = now;
  llm.analyze(snapshot)
    .then((a) => {
      llmResult = a;
      console.log(`${new Date().toISOString()}  llm: source=${a.source} load=${a.load} mood=${a.mood}`);
    })
    .catch(() => {})
    .finally(() => { llmBusy = false; tick(); });
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    const snapshot = loadSnapshot({ dir, now });
    let assessment = await ruleAnalyzer.analyze(snapshot);
    if (llmResult && llmResult.source === 'llm' && now - llmResult.at < 2 * LLM_EVERY_MS && !snapshot.onBreak) {
      assessment = llmResult;
    }
    writeAtomic('state.json', toState(snapshot, assessment, now));
    writeAtomic('messages.json', toMessages(snapshot, assessment, now));
    maybeRunLlm(snapshot, now);
  } catch (err) {
    console.error(`tick failed: ${err.message}`);
  } finally {
    ticking = false;
  }
}

console.log(`Engine runner: ${dir} every ${EVERY_MS / 1000}s${useLlm ? `, Cursor CLI every ${LLM_EVERY_MS / 60_000} min` : ', rules only'}`);
await tick();
if (args.includes('--once')) {
  process.exit(0);
}
setInterval(tick, EVERY_MS);
let debounce;
try {
  fs.watch(dir, (_evt, name) => {
    if (name !== 'events.jsonl') return;
    clearTimeout(debounce);
    debounce = setTimeout(tick, 200);
  });
} catch {
  // polling above still works
}
