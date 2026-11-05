import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessWithRules, ruleAnalyzer } from '../analyzer/rules.mjs';
import { createLlmAnalyzer, parseAssessment } from '../analyzer/llm.mjs';
import { cursorCliComplete } from '../analyzer/cursor-cli.mjs';
import { ADVICE, ADVICE_FOR, CONDITIONS } from '../analyzer/catalog.mjs';
import { buildSnapshot, readEvents } from '../telemetry.mjs';

process.env.TZ = 'UTC';
const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 5, 14, 0);

const zero = () => ({
  prompts: 0, promptChars: 0, words: 0, fillers: 0, frustration: 0, profanity: 0, rejections: 0, polite: 0,
  exclaims: 0, questions: 0, pastedLines: 0, voicePrompts: 0, capsPrompts: 0, duplicatePrompts: 0,
  responses: 0, responseChars: 0, thoughtMs: 0, turns: 0, aborts: 0, errors: 0, interrupts: 0, toolFailures: 0,
  shellRuns: 0, failedShellRuns: 0, filesEdited: 0, linesAdded: 0, linesRemoved: 0, subagents: 0, compactions: 0,
  waitMs: 0, quickReviews: 0, convSwitches: 0, userChars: 0, undos: 0, failedRuns: 0,
});

function snap({ last10m = {}, last60m = {}, ...rest } = {}) {
  return {
    v: 1, at: NOW, localHour: 14,
    session: { startedAt: NOW - 20 * MIN, durationMs: 20 * MIN },
    sinceBreakMs: 20 * MIN, onBreak: false, agentWorking: false, openTurnMs: 0, parallelConvs: 1,
    windows: { last10m: { ...zero(), ...last10m }, last60m: { ...zero(), ...last60m }, session: { ...zero(), ...last60m } },
    trends: { promptChars: null, promptGap: null, fillersPerPrompt: null, politePerPrompt: null },
    baseline: { ready: false, sessions: 0, promptsPer10m: null, responseCharsPer10m: null, linesChangedPer10m: null, promptChars: null, fillersPerPrompt: null },
    timeline: [], days: [],
    feedback: { lastCalibration: null, snoozes60m: 0, breaksToday: 0 },
    ...rest,
  };
}
const ids = (a) => a.conditions.map((c) => c.id);

test('catalog: every condition has advice and every advice exists', () => {
  for (const c of CONDITIONS) {
    assert.ok(ADVICE_FOR[c]?.length, c);
    for (const id of ADVICE_FOR[c]) assert.ok(ADVICE[id], id);
  }
  for (const a of Object.values(ADVICE)) assert.ok(a.text.length <= 140, a.text);
});

test('rules: a calm short session has no conditions and a happy pet', () => {
  const a = assessWithRules(snap({ last60m: { prompts: 4, responseChars: 3000 } }));
  assert.equal(a.v, 1);
  assert.equal(a.source, 'rules');
  assert.deepEqual(a.conditions, []);
  assert.deepEqual(a.advice, []);
  assert.equal(a.mood, 'happy');
  assert.ok(a.load < 30);
});

test('rules: frustration, duplicates and failures in 10 min are a stuck loop', () => {
  const a = assessWithRules(snap({ last10m: { prompts: 4, frustration: 2, profanity: 1, duplicatePrompts: 1, aborts: 1, failedShellRuns: 1 } }));
  assert.equal(ids(a)[0], 'stuck-loop');
  assert.ok(a.conditions[0].evidence.some((e) => e.includes('frustration')));
  assert.ok(ADVICE_FOR['stuck-loop'].includes(a.advice[0].id));
  assert.equal(a.advice[0].condition, 'stuck-loop');
});

test('rules: lots of reading without a break is eye strain', () => {
  const a = assessWithRules(snap({ sinceBreakMs: 80 * MIN, last60m: { responseChars: 70000, linesAdded: 300 } }));
  assert.ok(ids(a).includes('eye-strain'));
});

test('rules: reading volume is judged against the baseline when it is ready', () => {
  const heavyReader = { ready: true, sessions: 5, promptsPer10m: 3, responseCharsPer10m: 20000, linesChangedPer10m: 100, promptChars: 80, fillersPerPrompt: 0.2 };
  const a = assessWithRules(snap({ sinceBreakMs: 40 * MIN, last60m: { responseChars: 70000 }, baseline: heavyReader }));
  assert.ok(!ids(a).includes('eye-strain'));
});

test('rules: two hours without a break is drained, and "I\'m fried" forces it', () => {
  assert.ok(ids(assessWithRules(snap({ sinceBreakMs: 130 * MIN }))).includes('drained'));
  const fried = assessWithRules(snap({ feedback: { lastCalibration: { at: NOW - 5 * MIN, feeling: 'drained' }, snoozes60m: 0, breaksToday: 0 } }));
  assert.ok(ids(fried).includes('drained'));
  assert.ok(fried.load >= 70);
});

test('rules: interrupts and quick reviews are rushing', () => {
  const a = assessWithRules(snap({ last10m: { prompts: 6, interrupts: 3, quickReviews: 2, exclaims: 2 } }));
  assert.ok(ids(a).includes('rushing'));
});

test('rules: switching between many chats is scattered, many prompts and chats is decision fatigue', () => {
  const a = assessWithRules(snap({ parallelConvs: 4, last60m: { prompts: 45, convSwitches: 12 }, trends: { promptChars: 0.4, promptGap: null, fillersPerPrompt: null, politePerPrompt: null } }));
  assert.ok(ids(a).includes('scattered'));
  assert.ok(ids(a).includes('decision-fatigue'));
});

test('rules: late hours and a long agent wait', () => {
  const late = assessWithRules(snap({ localHour: 23, last60m: { prompts: 2 } }));
  assert.ok(ids(late).includes('late'));
  const waiting = assessWithRules(snap({ agentWorking: true, openTurnMs: 90_000 }));
  assert.ok(ids(waiting).includes('waiting'));
  assert.ok(ADVICE_FOR.waiting.includes(waiting.advice[0].id));
});

test('rules: on a break the pet rests and gives no advice', () => {
  const a = assessWithRules(snap({ onBreak: true, sinceBreakMs: 0, last10m: { frustration: 5 } }));
  assert.equal(a.mood, 'resting');
  assert.deepEqual(a.advice, []);
});

test('rules: at most 3 conditions and 3 advice, strongest first', () => {
  const a = assessWithRules(snap({
    localHour: 23, sinceBreakMs: 150 * MIN, parallelConvs: 4, agentWorking: true, openTurnMs: 200_000,
    last10m: { frustration: 4, aborts: 2, interrupts: 4, quickReviews: 3 },
    last60m: { prompts: 50, convSwitches: 15, responseChars: 90000 },
  }));
  assert.ok(a.conditions.length <= 3);
  assert.ok(a.advice.length <= 3);
  for (let i = 1; i < a.conditions.length; i++) assert.ok(a.conditions[i - 1].confidence >= a.conditions[i].confidence);
  assert.ok(a.load >= 85);
});

test('fixtures: calm session stays calm, overload session is flagged', () => {
  const load = (name) => {
    const events = readEvents(fileURLToPath(new URL(`../../contract/fixtures/${name}.jsonl`, import.meta.url)));
    return assessWithRules(buildSnapshot(events, { now: events[events.length - 1].ts + 10_000 }));
  };
  const calm = load('session-calm');
  assert.ok(calm.load < 60, `calm load=${calm.load}`);
  assert.ok(!ids(calm).includes('stuck-loop'));
  const overload = load('session-overload');
  assert.ok(overload.load >= 60, `overload load=${overload.load}`);
  assert.ok(ids(overload).includes('stuck-loop') || ids(overload).includes('drained'), ids(overload).join());
});

test('llm: valid output is used, unknown ids are dropped, lines are checked', () => {
  const s = snap();
  const base = assessWithRules(s);
  const a = parseAssessment(`Sure! ${JSON.stringify({
    load: 140, mood: 'tired',
    conditions: [{ id: 'stuck-loop', confidence: 0.8, evidence: ['3 aborts in 10 min'] }, { id: 'zombie', confidence: 0.9, evidence: [] }],
    advice: [{ id: 'fresh-chat', condition: 'stuck-loop', text: 'New chat, new luck.' }, { id: 'buy-a-boat', condition: 'stuck-loop', text: 'x' }, { id: 'rubber-duck', condition: 'stuck-loop', text: 'y'.repeat(300) }],
  })}`, s, base);
  assert.equal(a.source, 'llm');
  assert.equal(a.load, 100);
  assert.equal(a.mood, 'tired');
  assert.deepEqual(ids(a), ['stuck-loop']);
  assert.deepEqual(a.advice.map((x) => x.id), ['fresh-chat', 'rubber-duck']);
  assert.equal(a.advice[0].text, 'New chat, new luck.');
  assert.equal(a.advice[1].text, ADVICE['rubber-duck'].text);
  assert.equal(a.advice[0].minutes, ADVICE['fresh-chat'].minutes);
});

test('llm: invalid output, errors and timeouts fall back to rules', async () => {
  const s = snap({ last10m: { frustration: 3, aborts: 2 } });
  for (const complete of [async () => 'no json here', async () => { throw new Error('offline'); }, () => new Promise(() => {})]) {
    const a = await createLlmAnalyzer({ complete, timeoutMs: 50 }).analyze(s);
    assert.equal(a.source, 'rules');
    assert.deepEqual(a, await ruleAnalyzer.analyze(s));
  }
});

test('llm: the model sees numbers, the catalog and the rules opinion, never raw text', async () => {
  let seen;
  const complete = async (messages) => {
    seen = messages;
    return JSON.stringify({ load: 50, mood: 'focused', conditions: [], advice: [] });
  };
  const a = await createLlmAnalyzer({ complete }).analyze(snap());
  assert.equal(a.source, 'llm');
  assert.equal(seen[0].role, 'system');
  for (const id of CONDITIONS) assert.ok(seen[0].content.includes(id), id);
  const user = JSON.parse(seen[1].content);
  assert.ok(user.snapshot.windows);
  assert.ok(user.rulesOpinion);
});

test('cursor cli provider: runs the command headless in its own workspace, marked as ours', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet cli '));
  const fake = path.join(dir, 'fake-agent.mjs');
  fs.writeFileSync(fake, `
    import fs from 'node:fs';
    import path from 'node:path';
    const args = process.argv.slice(2);
    const ws = args[args.indexOf('--workspace') + 1];
    const request = fs.readFileSync(path.join(ws, 'request.md'), 'utf8');
    const result = JSON.stringify({ self: process.env.CURSOR_PET_SELF, args, hasSystem: request.includes('SYSTEM-PART'), hasUser: request.includes('USER-PART') });
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result }));
  `);
  const complete = cursorCliComplete({ command: [process.execPath, fake], workspace: path.join(dir, 'llm ws'), model: 'some-model' });
  const out = JSON.parse(await complete([{ role: 'system', content: 'SYSTEM-PART' }, { role: 'user', content: 'USER-PART "quoted" & piped |' }]));
  assert.equal(out.self, '1');
  assert.ok(out.hasSystem && out.hasUser);
  for (const flag of ['-p', '--output-format', 'json', '--mode', 'ask', '--trust', '--model', 'some-model']) assert.ok(out.args.includes(flag), flag);
});

test('cursor cli provider: a failing command rejects', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-cli-'));
  const fake = path.join(dir, 'fail.mjs');
  fs.writeFileSync(fake, "process.stderr.write('not logged in'); process.exit(1);");
  const complete = cursorCliComplete({ command: [process.execPath, fake], workspace: path.join(dir, 'ws') });
  await assert.rejects(complete([{ role: 'user', content: 'x' }]), /not logged in/);
});
