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
// --- Agent Inspector reasoning log (added by role `ui`, see docs/specs/ui-agent-inspector.md) ---
// Appends what the analyzer saw and decided to $dir/agent-log.jsonl. Numbers, ids and the model's JSON
// answer only: the request is the numbers-only TelemetrySnapshot, never prompt or response text.
const AGENT_LOG = path.join(dir, 'agent-log.jsonl');
let lastCall = null;
let lastLogged = '';

function logAgent(entry) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(AGENT_LOG) && fs.statSync(AGENT_LOG).size > 2 * 1024 * 1024) fs.renameSync(AGENT_LOG, `${AGENT_LOG}.1`);
    fs.appendFileSync(AGENT_LOG, JSON.stringify({ v: 1, ts: Date.now(), ...entry }) + '\n');
  } catch {
    // the log is a debugging aid; never break the runner
  }
}

function summarize(s) {
  const w10 = s.windows.last10m;
  const w60 = s.windows.last60m;
  return {
    sessionMin: Math.round(s.session.durationMs / 60_000), sinceBreakMin: Math.round(s.sinceBreakMs / 60_000),
    onBreak: s.onBreak, agentWorking: s.agentWorking, parallelConvs: s.parallelConvs, localHour: s.localHour,
    last10m: { prompts: w10.prompts, frustration: w10.frustration, aborts: w10.aborts, failures: w10.errors + w10.toolFailures + w10.failedShellRuns },
    last60m: { prompts: w60.prompts, responseChars: w60.responseChars, linesChanged: w60.linesAdded + w60.linesRemoved },
  };
}

function decision(a, s) {
  const why = s.onBreak
    ? 'on a break, so the pet rests'
    : `load ${a.load} -> ${a.mood} (happy <30, focused <60, tired <85, melting <95, sleeping 95+)`
      + (a.conditions.length ? `; ${a.conditions.map((c) => `${c.id} ${Math.round(c.confidence * 100)}%`).join(', ')}` : '');
  return { source: a.source, load: a.load, mood: a.mood, why, conditions: a.conditions };
}

function trackedComplete(complete) {
  return async (messages) => {
    const startedAt = Date.now();
    lastCall = { request: messages.find((m) => m.role === 'user')?.content ?? '', systemChars: messages[0]?.content.length ?? 0 };
    try {
      lastCall.response = await complete(messages);
      lastCall.ok = true;
      return lastCall.response;
    } catch (err) {
      lastCall.ok = false;
      lastCall.error = err && err.code === 'ENOENT' ? 'Cursor CLI (`agent`) not found on PATH' : String(err && err.message).slice(0, 300);
      throw err;
    } finally {
      lastCall.durationMs = Date.now() - startedAt;
    }
  };
}
// --- end Agent Inspector reasoning log ---

const llm = process.argv.includes('--llm') ? createLlmAnalyzer({ complete: trackedComplete(cursorCliComplete({ workspace: llmWorkspace(dir) })) }) : null;
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
      lastCall = null;
      logAgent({ kind: 'llm-request', metrics: summarize(snapshot) });
      llm.analyze(snapshot).then((r) => {
        llmResult = r;
        const cli = lastCall || { ok: false, error: 'analyzer returned before calling the Cursor CLI' };
        if (r.source !== 'llm' && cli.ok) cli.error = 'answer failed validation; using rules';
        logAgent({ kind: 'llm', metrics: summarize(snapshot), cli, ...decision(r, snapshot) });
      }).catch(() => {}).finally(() => { llmBusy = false; });
    }
    // A rules fallback from the analyzer is older than the live rules result, so only a fresh LLM answer wins.
    if (llmResult?.source === 'llm' && now - llmResult.at < 2 * LLM_EVERY_MS && !snapshot.onBreak) assessment = llmResult;
  }

  const state = buildPetState(snapshot, assessment, { now, lastSnoozeAt: lastSnooze ? lastSnooze.ts : null });
  const key = JSON.stringify([assessment.source, state.load, state.mood, assessment.conditions.map((c) => c.id), state.onBreak, state.nudge?.id]);
  if (key !== lastLogged) {
    lastLogged = key;
    logAgent({ kind: 'decision', metrics: summarize(snapshot), ...decision(assessment, snapshot), mood: state.mood, nudge: state.nudge ?? null });
  }
  writeAtomic(stateFile, { ...state, updatedAt: Date.now() });
  console.log(`${new Date(now).toISOString()}  load ${String(state.load).padStart(3)}  ${state.mood.padEnd(8)} ${state.nudge ? `nudge: ${state.nudge.id}` : ''}`);
}

console.log(`Engine: ${eventsFile} -> ${stateFile} every ${everyMs / 1000}s${llm ? ' (LLM via Cursor CLI)' : ''}. Ctrl+C to stop.`);
logAgent({ kind: 'start', llm: llm ? `Cursor CLI every ${LLM_EVERY_MS / 60_000} min` : 'off (rules only)', everyMs, pid: process.pid });
await tick();
if (!process.argv.includes('--once')) setInterval(() => tick().catch((err) => console.error(err)), everyMs);
