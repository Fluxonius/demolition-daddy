'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-overlay-'));
process.env.CURSOR_PET_DIR = dir;
const { watchState, readState } = require('../lib/pet-dir');
const { toEvent, recordAction } = require('../lib/actions');

test('watchState picks up atomic renames and ignores partial JSON', async () => {
  const seen = [];
  const stop = watchState((s) => seen.push(s && s.mood), { pollMs: 50 });
  const write = (body) => {
    fs.writeFileSync(path.join(dir, 'tmp'), body);
    fs.renameSync(path.join(dir, 'tmp'), path.join(dir, 'state.json'));
  };
  write(JSON.stringify({ mood: 'happy' }));
  await new Promise((r) => setTimeout(r, 200));
  write('{"mood": "tir');
  await new Promise((r) => setTimeout(r, 200));
  write(JSON.stringify({ mood: 'tired' }));
  await new Promise((r) => setTimeout(r, 200));
  stop();
  assert.deepStrictEqual(seen.filter(Boolean), ['happy', 'tired']);
  assert.strictEqual(readState().mood, 'tired');
});

test('actions map to ext.* PetEvents and append to events.jsonl', () => {
  assert.strictEqual(toEvent({ type: 'nudgeAccepted', id: 'x' }).type, 'ext.breakStart');
  assert.strictEqual(toEvent({ type: 'nudgeDismissed', id: 'x' }).type, 'ext.snooze');
  assert.strictEqual(toEvent({ type: 'action', action: 'nope' }), null);
  recordAction({ type: 'action', action: 'pet' });
  const lines = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(
    { v: lines[0].v, src: lines[0].src, type: lines[0].type, data: lines[0].data },
    { v: 1, src: 'ext', type: 'ext.petInteraction', data: { action: 'pet', window: 'overlay' } },
  );
});
