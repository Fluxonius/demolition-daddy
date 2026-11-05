#!/usr/bin/env node
// Writes the synthetic event logs in contract/fixtures/ by running fake Cursor hook payloads through
// the real normalize(), so fixtures carry real features and no text. Deterministic: same output every run.
// Usage: node hooks/scripts/make-fixtures.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalize } from '../lib/normalize.js';

const OUT = fileURLToPath(new URL('../../contract/fixtures/', import.meta.url));
const SEC = 1000;
const MIN = 60 * SEC;

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function session(seed) {
  const rand = rng(seed);
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const events = [];
  const emit = (ts, payload) => {
    const e = normalize(payload, ts);
    if (e) events.push(e);
  };
  let gen = 0;
  function turn(t, conv, prompt, { responseChars, editLines, shellFails = false, status = 'completed', shell = true }) {
    const ids = { conversation_id: conv, generation_id: `${conv}-g${++gen}` };
    emit(t, { ...ids, hook_event_name: 'beforeSubmitPrompt', prompt, attachments: [] });
    t += between(2, 6) * SEC;
    emit(t, { ...ids, hook_event_name: 'afterAgentThought', text: 'x'.repeat(between(200, 1500)), duration_ms: between(1500, 8000) });
    const edits = between(1, 3);
    for (let i = 0; i < edits; i++) {
      t += between(3, 8) * SEC;
      const lines = Math.max(1, Math.round(editLines / edits));
      emit(t, { ...ids, hook_event_name: 'afterFileEdit', file_path: `/repo/src/${pick(['Login.tsx', 'api.ts', 'cart.ts', 'App.tsx'])}`, edits: [{ old_string: 'a\n'.repeat(Math.ceil(lines / 3)).trim(), new_string: 'b\n'.repeat(lines).trim() }] });
    }
    if (shell) {
      t += between(5, 15) * SEC;
      emit(t, { ...ids, hook_event_name: 'afterShellExecution', command: 'npm test', output: shellFails ? 'Tests: 2 failed, 14 passed' : 'Tests: 0 failed, 16 passed', duration: between(2000, 9000) });
    }
    t += between(3, 10) * SEC;
    emit(t, { ...ids, hook_event_name: 'afterAgentResponse', text: 'y'.repeat(responseChars) });
    t += SEC;
    emit(t, { ...ids, hook_event_name: 'stop', status, loop_count: 0 });
    return t;
  }
  return { events, emit, turn, between, pick, rand };
}

const CALM_PROMPTS = [
  'Please add input validation to the signup form and show inline errors, thanks',
  'Could you write tests for the cart reducer covering add, remove and clear? Thanks!',
  'Let us rename getUser to fetchUser across the API client, please',
  'Please add a loading spinner to the orders page while data is fetched',
  'Can you extract the date formatting into a helper and reuse it? Thank you',
  'Please document the environment variables in the README',
  'Could you split the dashboard component into smaller pieces?',
  'Add an empty state to the search results, thanks',
  'Please bump the eslint config and fix any new warnings',
  'Can you check why the profile avatar is blurry on retina screens?',
];

function calm() {
  const s = session(7);
  let t = Date.UTC(2026, 10, 5, 10, 0);
  s.emit(t, { conversation_id: 'calm-1', hook_event_name: 'sessionStart', session_id: 'calm-1', is_background_agent: false, composer_mode: 'agent' });
  for (let i = 0; i < 10; i++) {
    t += s.between(3, 5) * MIN;
    s.turn(t, 'calm-1', CALM_PROMPTS[i % CALM_PROMPTS.length], { responseChars: s.between(600, 1500), editLines: s.between(4, 15) });
  }
  return s.events;
}

const EARLY_PROMPTS = [
  'Please refactor the API client to use a shared fetch wrapper with retries and timeouts, thanks',
  'Could you add pagination to the orders table and keep the page in the URL? Thank you',
  'Please migrate the settings page to the new form library and keep validation the same',
  'Let us add optimistic updates to the cart and roll back on errors, please',
];
const MID_PROMPTS = [
  'add a test for the login redirect',
  'now handle the expired token case',
  'use the shared button in the header too',
  'why is the build slower now',
];
const LATE_PROMPTS = [
  'fix it, still broken',
  'опять не работает, почини',
  'WHY IS THE LOGIN STILL FAILING',
  'no, revert that',
  "same error again:\nTypeError: Cannot read properties of undefined (reading 'id')\n    at Login (src/Login.tsx:42:7)",
  'э ну короче оно опять падает на логине и типа я не понимаю почему вот это вообще происходит',
  'the login form still fails after submit, fix the login form',
  'the login form still fails after submit, please fix the login form',
  'бля, та же ошибка',
  'не то, верни как было',
];

function overload() {
  const s = session(42);
  let t = Date.UTC(2026, 10, 5, 20, 0);
  const convs = ['ov-1', 'ov-2', 'ov-3'];
  for (const c of convs) s.emit(t, { conversation_id: c, hook_event_name: 'sessionStart', session_id: c, is_background_agent: false, composer_mode: 'agent' });
  for (let i = 0; i < 80; i++) {
    const phase = i < 25 ? 'early' : i < 50 ? 'mid' : 'late';
    const conv = phase === 'late' ? (s.rand() < 0.7 ? 'ov-1' : s.pick(convs)) : s.pick(convs);
    const prompt = phase === 'early' ? s.pick(EARLY_PROMPTS) : phase === 'mid' ? s.pick(MID_PROMPTS) : s.pick(LATE_PROMPTS);
    t += s.between(80, 150) * SEC;
    if (i === 30 || i === 60) s.emit(t - 5 * SEC, { conversation_id: conv, hook_event_name: 'subagentStart', parent_conversation_id: conv, subagent_type: 'explore', task: 'look around' });
    if (i === 65) s.emit(t - 3 * SEC, { conversation_id: 'ov-1', hook_event_name: 'preCompact', trigger: 'auto', context_usage_percent: 92, context_tokens: 118000, context_window_size: 128000 });
    const late = phase === 'late';
    s.turn(t, conv, prompt, {
      responseChars: s.between(2000, 6000),
      editLines: s.between(20, 80),
      shellFails: late && s.rand() < 0.6,
      status: late && s.rand() < 0.25 ? 'aborted' : late && s.rand() < 0.1 ? 'error' : 'completed',
    });
  }
  return s.events;
}

const write = (name, events) => fs.writeFileSync(`${OUT}${name}.jsonl`, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
fs.mkdirSync(OUT, { recursive: true });
write('session-calm', calm());
write('session-overload', overload());
console.log(`Wrote session-calm.jsonl and session-overload.jsonl to ${OUT}`);
