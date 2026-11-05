import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readEvents, buildSnapshot } from '../telemetry.mjs';
import { simhash } from '../lib/features.js';

process.env.TZ = 'UTC';
const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 5, 14, 0); // 14:00 UTC
const at = (min) => T0 + min * MIN;
const hook = (type, min, data = {}, extra = {}) => ({ v: 1, ts: at(min), src: 'hook', type, conv: 'c1', data, ...extra });
const prompt = (min, data = {}, extra = {}) => hook('beforeSubmitPrompt', min, { chars: 40, ...data }, { gen: `g${min}`, ...extra });
const stop = (min, gen, status = 'completed', extra = {}) => hook('stop', min, { status }, { gen, ...extra });

test('readEvents skips malformed lines and sorts by time', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pet-tel-')), 'events.jsonl');
  fs.writeFileSync(file, [JSON.stringify(prompt(5)), '{oops', '', JSON.stringify(prompt(1)), JSON.stringify({ ts: 'x' })].join('\n'));
  const events = readEvents(file);
  assert.deepEqual(events.map((e) => e.ts), [at(1), at(5)]);
  assert.deepEqual(readEvents(file + '.missing'), []);
});

test('a session starts after 3 h without events', () => {
  const s = buildSnapshot([prompt(-300), stop(-299, 'g-300'), prompt(0), stop(1, 'g0'), prompt(2)], { now: at(2) });
  assert.equal(s.session.startedAt, at(0));
  assert.equal(s.session.durationMs, 2 * MIN);
  assert.equal(s.windows.session.prompts, 2);
});

test('open turn means the agent is working; stop closes it and counts the wait', () => {
  const working = buildSnapshot([prompt(0), hook('postToolUse', 1, { tool: 'Read' }, { gen: 'g0' })], { now: at(2) });
  assert.equal(working.agentWorking, true);
  assert.equal(working.openTurnMs, 2 * MIN);
  const done = buildSnapshot([prompt(0), stop(2, 'g0')], { now: at(2) });
  assert.equal(done.agentWorking, false);
  assert.equal(done.windows.last10m.waitMs, 2 * MIN);
});

test('a turn with no events for 15 min is abandoned', () => {
  const s = buildSnapshot([prompt(0)], { now: at(20) });
  assert.equal(s.agentWorking, false);
});

test('a 3+ min gap without agent work is a natural break', () => {
  const s = buildSnapshot([prompt(0), stop(1, 'g0'), prompt(10), stop(11, 'g10'), prompt(12)], { now: at(13) });
  assert.equal(s.sinceBreakMs, 3 * MIN); // break ended at minute 10
  assert.equal(s.onBreak, false);
  assert.equal(s.feedback.breaksToday, 1);
});

test('a gap while the agent works is not a break', () => {
  const s = buildSnapshot([prompt(0), hook('postToolUse', 1, {}, { gen: 'g0' }), stop(6, 'g0'), prompt(7)], { now: at(8) });
  assert.equal(s.sinceBreakMs, 8 * MIN);
});

test('being away now counts as on break', () => {
  const s = buildSnapshot([prompt(0), stop(1, 'g0')], { now: at(6) });
  assert.equal(s.onBreak, true);
  assert.equal(s.sinceBreakMs, 0);
});

test('explicit and OS-idle breaks count', () => {
  const explicit = buildSnapshot([prompt(0), stop(1, 'g0'), { v: 1, ts: at(2), src: 'ext', type: 'ext.breakStart', data: { minutes: 1 } }, prompt(3)], { now: at(4) });
  assert.equal(explicit.sinceBreakMs, 1 * MIN);
  const idle = buildSnapshot([
    prompt(0), stop(1, 'g0'),
    { v: 1, ts: at(2), src: 'ext', type: 'ext.windowBlur', data: { window: 'os-idle' } },
    { v: 1, ts: at(7), src: 'ext', type: 'ext.windowFocus', data: { window: 'os-idle' } },
    prompt(7.5),
  ], { now: at(8) });
  assert.equal(idle.sinceBreakMs, 1 * MIN);
});

test('window stats count language, outcome and review load', () => {
  const s = buildSnapshot([
    prompt(-30, { fillers: 2, polite: 1 }),
    stop(-29, 'g-30'),
    prompt(-5, { frustration: 2, profanity: 1, rejection: true, pastedLines: 3, voiceLike: true, flags: ['frustrated', 'caps'], exclaims: 1 }),
    hook('afterAgentResponse', -4, { chars: 1200 }, { gen: 'g-5' }),
    hook('afterFileEdit', -4, { file: 'a.ts', linesAdded: 10, linesRemoved: 2 }, { gen: 'g-5' }),
    hook('afterFileEdit', -4, { file: 'a.ts', linesAdded: 1, linesRemoved: 1 }, { gen: 'g-5' }),
    hook('postToolUseFailure', -4, { failure: 'error' }, { gen: 'g-5' }),
    hook('postToolUseFailure', -4, { failure: 'error', interrupt: true }, { gen: 'g-5' }),
    hook('afterShellExecution', -3, { failed: true }, { gen: 'g-5' }),
    stop(-3, 'g-5', 'aborted'),
    hook('preCompact', -2, { contextPct: 90 }),
    hook('subagentStart', -2, { subagentType: 'explore' }),
  ], { now: at(0) });
  const w = s.windows.last10m;
  assert.equal(w.prompts, 1);
  assert.equal(w.frustration, 2);
  assert.equal(w.profanity, 1);
  assert.equal(w.rejections, 1);
  assert.equal(w.pastedLines, 3);
  assert.equal(w.voicePrompts, 1);
  assert.equal(w.capsPrompts, 1);
  assert.equal(w.responseChars, 1200);
  assert.equal(w.filesEdited, 1);
  assert.equal(w.linesAdded, 11);
  assert.equal(w.linesRemoved, 3);
  assert.equal(w.toolFailures, 1);
  assert.equal(w.interrupts, 2);
  assert.equal(w.aborts, 1);
  assert.equal(w.shellRuns, 1);
  assert.equal(w.failedShellRuns, 1);
  assert.equal(w.compactions, 1);
  assert.equal(w.subagents, 1);
  assert.equal(s.windows.last60m.prompts, 2);
  assert.equal(s.windows.last60m.fillers, 2);
});

test('a quick prompt after a heavy turn is a quick review', () => {
  const heavy = (gap) => buildSnapshot([
    prompt(0), hook('afterAgentResponse', 1, { chars: 3000 }, { gen: 'g0' }), stop(1, 'g0'),
    hook('beforeSubmitPrompt', 1 + gap / 60, { chars: 10 }, { gen: 'g1' }),
  ], { now: at(3) });
  assert.equal(heavy(5).windows.last10m.quickReviews, 1);
  assert.equal(heavy(60).windows.last10m.quickReviews, 0);
});

test('conversation switches and parallel conversations', () => {
  const s = buildSnapshot([
    prompt(0), prompt(1, {}, { conv: 'c2', gen: 'x1' }), prompt(2, {}, { gen: 'x2' }), prompt(3, {}, { conv: 'c3', gen: 'x3' }),
  ], { now: at(4) });
  assert.equal(s.windows.last10m.convSwitches, 3);
  assert.equal(s.parallelConvs, 3);
});

test('near-duplicate prompts are counted', () => {
  const a = simhash('the login form still fails after submit, please fix the login form');
  const b = simhash('the login form still fails after submit, fix the login form');
  const c = simhash('add a dark mode toggle to the settings page with persistence');
  const s = buildSnapshot([prompt(0, { sim: a }), prompt(2, { sim: c }), prompt(4, { sim: b })], { now: at(5) });
  assert.equal(s.windows.last10m.duplicatePrompts, 1);
});

test('trends compare the last 30 min with earlier in the session', () => {
  const events = [];
  for (let m = 0; m < 60; m += 10) events.push(prompt(m, { chars: 200 }));
  for (let m = 62; m < 90; m += 2) events.push(prompt(m, { chars: 50 }));
  const s = buildSnapshot(events, { now: at(90) });
  assert.equal(s.trends.promptChars, 0.25);
  assert.equal(s.trends.promptGap, 0.2);
  const fresh = buildSnapshot([prompt(0), prompt(1)], { now: at(2) });
  assert.equal(fresh.trends.promptChars, null);
});

test('baseline comes from earlier sessions', () => {
  const events = [];
  for (const day of [1, 2, 3]) {
    const start = -day * 24 * 60;
    for (let m = 0; m < 60; m += 2.5) events.push(prompt(start + m, { chars: 100, fillers: 1 }));
  }
  events.push(prompt(0));
  const s = buildSnapshot(events, { now: at(1) });
  assert.equal(s.baseline.sessions, 3);
  assert.equal(s.baseline.ready, true);
  assert.equal(s.baseline.promptsPer10m, 4);
  assert.equal(s.baseline.promptChars, 100);
  assert.equal(s.baseline.fillersPerPrompt, 1);
  const none = buildSnapshot([prompt(0)], { now: at(1) });
  assert.equal(none.baseline.ready, false);
  assert.equal(none.baseline.promptsPer10m, null);
});

test('timeline, days and feedback', () => {
  const s = buildSnapshot([
    prompt(-1440, { frustration: 1 }),
    prompt(-7, { frustration: 2 }),
    { v: 1, ts: at(-6), src: 'ext', type: 'ext.calibrate', data: { feeling: 'drained' } },
    { v: 1, ts: at(-5), src: 'ext', type: 'ext.snooze', data: {} },
  ], { now: at(0) });
  assert.equal(s.timeline.length, 24);
  assert.equal(s.timeline.reduce((n, b) => n + b.frustration, 0), 2);
  assert.equal(s.days.length, 7);
  assert.equal(s.days[6].date, '2026-11-05');
  assert.equal(s.days[5].prompts, 1);
  assert.deepEqual(s.feedback.lastCalibration, { at: at(-6), feeling: 'drained' });
  assert.equal(s.feedback.snoozes60m, 1);
  assert.equal(s.localHour, 14);
});
