import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, responseFor, HOOK_EVENTS } from '../lib/normalize.js';

const SECRET = 'SECRET-PROMPT-TEXT';
const base = { conversation_id: 'c1', generation_id: 'g1', workspace_roots: ['/repo'] };
const at = 1_700_000_000_000;

test('beforeSubmitPrompt keeps features, never text', () => {
  const e = normalize({ ...base, hook_event_name: 'beforeSubmitPrompt', prompt: `${SECRET} опять не работает`, attachments: [{}, {}] }, at);
  assert.equal(e.type, 'beforeSubmitPrompt');
  assert.equal(e.v, 1);
  assert.equal(e.src, 'hook');
  assert.equal(e.ts, at);
  assert.equal(e.conv, 'c1');
  assert.equal(e.gen, 'g1');
  assert.equal(e.data.attachments, 2);
  assert.ok(e.data.chars > 0);
  assert.ok(e.data.flags.includes('frustrated'));
  assert.ok(!JSON.stringify(e).includes(SECRET));
});

test('responses, thoughts and shell output are reduced to numbers', () => {
  const r = normalize({ ...base, hook_event_name: 'afterAgentResponse', text: SECRET }, at);
  assert.deepEqual(r.data, { chars: SECRET.length });
  const t = normalize({ ...base, hook_event_name: 'afterAgentThought', text: SECRET, duration_ms: 4000 }, at);
  assert.deepEqual(t.data, { chars: SECRET.length, durationMs: 4000 });
  const s = normalize({ ...base, hook_event_name: 'afterShellExecution', command: SECRET, output: `${SECRET} 2 failed`, duration: 900 }, at);
  assert.deepEqual(s.data, { tool: 'Shell', durationMs: 900, chars: SECRET.length + 9, failed: true });
});

test('afterFileEdit stores basename and line counts only', () => {
  const e = normalize({ ...base, hook_event_name: 'afterFileEdit', file_path: 'C:\\repo\\src\\app.ts', edits: [{ old_string: SECRET, new_string: `${SECRET}\nmore` }] }, at);
  assert.deepEqual(e.data, { file: 'app.ts', edits: 1, linesAdded: 2, linesRemoved: 1 });
});

test('stop, tool failure, subagents, compaction and session end', () => {
  assert.deepEqual(normalize({ ...base, hook_event_name: 'stop', status: 'aborted', loop_count: 0 }, at).data, { status: 'aborted' });
  assert.deepEqual(
    normalize({ ...base, hook_event_name: 'postToolUseFailure', tool_name: 'Shell', error_message: SECRET, failure_type: 'timeout', duration: 30000, is_interrupt: true }, at).data,
    { tool: 'Shell', durationMs: 30000, failure: 'timeout', interrupt: true },
  );
  const sub = normalize({ hook_event_name: 'subagentStart', parent_conversation_id: 'p1', subagent_type: 'explore', task: SECRET }, at);
  assert.equal(sub.conv, 'p1');
  assert.deepEqual(sub.data, { subagentType: 'explore' });
  assert.deepEqual(
    normalize({ ...base, hook_event_name: 'subagentStop', subagent_type: 'explore', status: 'completed', duration_ms: 1000, summary: SECRET }, at).data,
    { subagentType: 'explore', status: 'completed', durationMs: 1000 },
  );
  assert.deepEqual(
    normalize({ ...base, hook_event_name: 'preCompact', context_usage_percent: 91, context_tokens: 120000 }, at).data,
    { contextPct: 91, contextTokens: 120000 },
  );
  assert.deepEqual(
    normalize({ ...base, hook_event_name: 'sessionEnd', reason: 'user_close', duration_ms: 5000 }, at).data,
    { reason: 'user_close', durationMs: 5000 },
  );
});

test('unknown hooks are ignored', () => {
  assert.equal(normalize({ hook_event_name: 'beforeReadFile' }, at), null);
  assert.equal(normalize({}, at), null);
});

test('responses are valid for every hook, including permission hooks', () => {
  assert.deepEqual(responseFor('beforeSubmitPrompt'), { continue: true });
  assert.deepEqual(responseFor('subagentStart'), { permission: 'allow' });
  assert.equal(typeof responseFor('preCompact').user_message, 'string');
  assert.deepEqual(responseFor('stop'), {});
  assert.deepEqual(responseFor(undefined), {});
  for (const name of HOOK_EVENTS) assert.equal(typeof responseFor(name), 'object');
});
