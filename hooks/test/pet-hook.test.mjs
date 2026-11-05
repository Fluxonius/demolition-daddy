import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../pet-hook.js', import.meta.url));

function run(input, { arg = 'beforeSubmitPrompt', env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-hook-'));
  const r = spawnSync(process.execPath, [HOOK, arg], {
    input,
    env: { ...process.env, CURSOR_PET_SELF: '', CURSOR_PET_DIR: dir, ...env },
    encoding: 'utf8',
    timeout: 10000,
  });
  const log = path.join(dir, 'events.jsonl');
  const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { status: r.status, out: JSON.parse(r.stdout), lines: lines.map((l) => JSON.parse(l)), dir };
}

test('appends one event and allows the prompt', () => {
  const r = run(JSON.stringify({ hook_event_name: 'beforeSubmitPrompt', conversation_id: 'c1', generation_id: 'g1', prompt: 'hidden text, fix it again' }));
  assert.equal(r.status, 0);
  assert.deepEqual(r.out, { continue: true });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].type, 'beforeSubmitPrompt');
  assert.ok(!JSON.stringify(r.lines[0]).includes('hidden text'));
});

test('malformed stdin still exits 0 with the right JSON for the hook in argv', () => {
  const r = run('{not json', { arg: 'beforeSubmitPrompt' });
  assert.equal(r.status, 0);
  assert.deepEqual(r.out, { continue: true });
  assert.equal(r.lines.length, 0);
});

test('subagentStart is always allowed', () => {
  const r = run(JSON.stringify({ hook_event_name: 'subagentStart', subagent_type: 'explore' }), { arg: 'subagentStart' });
  assert.equal(r.status, 0);
  assert.deepEqual(r.out, { permission: 'allow' });
});

test('empty stdin exits 0 with {}', () => {
  const r = run('', { arg: 'stop' });
  assert.equal(r.status, 0);
  assert.deepEqual(r.out, {});
});

test('our own analyzer runs are not logged (env guard)', () => {
  const r = run(JSON.stringify({ hook_event_name: 'stop', status: 'completed' }), { arg: 'stop', env: { CURSOR_PET_SELF: '1' } });
  assert.equal(r.status, 0);
  assert.equal(r.lines.length, 0);
});

test('our own analyzer runs are not logged (workspace guard)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-hook-'));
  const payload = { hook_event_name: 'stop', status: 'completed', workspace_roots: [path.join(dir, 'llm').replace(/\\/g, '/')] };
  const r = spawnSync(process.execPath, [HOOK, 'stop'], {
    input: JSON.stringify(payload), env: { ...process.env, CURSOR_PET_SELF: '', CURSOR_PET_DIR: dir }, encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(dir, 'events.jsonl')), false);
});
