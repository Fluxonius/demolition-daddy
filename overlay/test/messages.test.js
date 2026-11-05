'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-messages-'));
process.env.CURSOR_PET_DIR = dir;
const { watchMessages } = require('../lib/pet-dir');
const { toMessageAction, recordAction } = require('../lib/actions');
const { displayState, validMessages } = require('../web/display');
const { MESSAGES, toPetState } = require('../web/states');
const { FACES, EXERCISES } = require('../web/sprites');

const NOW = 1_800_000_000_000;
const fresh = (partial = {}) => toPetState({ mood: 'happy', load: 30, ...partial }, NOW);
const file = (...messages) => ({ v: 1, updatedAt: NOW, messages });
const show = (state, messages, ui = {}) => displayState(state, { now: NOW, messages, ...ui });

test('a message is shown with its text and buttons', () => {
  const d = show(fresh(), file({ id: 'grass', text: 'Touch grass', buttons: [{ label: 'Go', action: 'go' }] }));
  assert.strictEqual(d.bubble.source, 'message');
  assert.strictEqual(d.bubble.text, 'Touch grass');
  assert.deepStrictEqual(d.bubble.buttons, [{ label: 'Go', action: 'go' }]);
  assert.strictEqual(d.bubble.dismissible, true);
});

test('malformed messages and buttons are dropped; text and buttons are capped', () => {
  const list = validMessages(file(
    null, { text: 'no id' }, { id: 'no-text' },
    { id: 'ok', text: 'x'.repeat(500), buttons: [{ label: 'a', action: 'a' }, { label: 'b' }, 'c', { label: 'd', action: 'd' },
      { label: 'e', action: 'e' }, { label: 'f', action: 'f' }] },
  ));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].text.length, 140);
  assert.deepStrictEqual(list[0].buttons.map((b) => b.action), ['a', 'd', 'e']);
  assert.deepStrictEqual(validMessages(null), []);
  assert.strictEqual(validMessages([{ id: 'bare', text: 'array form' }]).length, 1);
});

test('higher priority wins, ties go to the oldest, the rest is counted as queued', () => {
  const d = show(fresh(), file(
    { id: 'low', text: 'low', priority: 1, createdAt: NOW - 1000 },
    { id: 'high-new', text: 'high new', priority: 9, createdAt: NOW - 10 },
    { id: 'high-old', text: 'high old', priority: 9, createdAt: NOW - 500 },
  ));
  assert.strictEqual(d.bubble.id, 'high-old');
  assert.strictEqual(d.queued, 2);
});

test('handled ids are skipped, so the next message replaces the dismissed one', () => {
  const msgs = file({ id: 'a', text: 'A', priority: 2 }, { id: 'b', text: 'B', priority: 1 });
  assert.strictEqual(show(fresh(), msgs).bubble.id, 'a');
  assert.strictEqual(show(fresh(), msgs, { handled: new Set(['a']) }).bubble.id, 'b');
  assert.strictEqual(show(fresh(), msgs, { handled: new Set(['a', 'b']) }).bubble, null);
});

test('ttl counts from createdAt, else from when the overlay first showed it; 0 never expires', () => {
  const withCreated = file({ id: 'a', text: 'A', ttlMs: 1000, createdAt: NOW - 1500 });
  assert.strictEqual(show(fresh(), withCreated).bubble, null);
  const noCreated = file({ id: 'b', text: 'B', ttlMs: 1000 });
  assert.strictEqual(show(fresh(), noCreated).bubble.id, 'b');
  assert.strictEqual(show(fresh(), noCreated, { firstSeen: { b: NOW - 999 } }).bubble.id, 'b');
  assert.strictEqual(show(fresh(), noCreated, { firstSeen: { b: NOW - 1000 } }).bubble, null);
  const forever = file({ id: 'c', text: 'C', ttlMs: 0, createdAt: NOW - 1e9 });
  assert.strictEqual(show(fresh(), forever).bubble.id, 'c');
});

test('mood and exercise pair with the message on screen', () => {
  assert.strictEqual(show(fresh(), file({ id: 'a', text: 'A', mood: 'tired' })).face, 'tired');
  assert.strictEqual(show(fresh(), file({ id: 'a', text: 'A', exercise: 'stretch' })).exercise, 'stretch');
  // a lower-priority queued message does not change the face
  const d = show(fresh(), file({ id: 'a', text: 'A', priority: 5 }, { id: 'b', text: 'B', mood: 'melting' }));
  assert.strictEqual(d.face, 'happy');
});

test('nudges join the queue: priority 10 x level, buttons map to accept/snooze', () => {
  const state = fresh({ nudge: { id: 'n1', level: 1, text: 'Break?', exercise: 'walk' } });
  const d = show(state, file({ id: 'low', text: 'low', priority: 5 }));
  assert.strictEqual(d.bubble.source, 'nudge');
  assert.strictEqual(d.bubble.id, 'nudge:n1');
  assert.deepStrictEqual(d.bubble.buttons.map((b) => b.action), ['accept', 'snooze']);
  assert.strictEqual(show(state, file({ id: 'hi', text: 'hi', priority: 11 })).bubble.id, 'hi');
  assert.strictEqual(show(state, null, { handled: new Set(['nudge:n1']) }).bubble, null);
});

test('urgent mutes messages below priority 50; the soft lock beats everything', () => {
  const urgent = fresh({ urgentMin: 30 });
  const msgs = file({ id: 'low', text: 'low', priority: 49 }, { id: 'loud', text: 'loud', priority: 50 });
  assert.strictEqual(show(urgent, msgs).bubble.id, 'loud');
  assert.strictEqual(show(urgent, file({ id: 'low', text: 'low', priority: 49 })).bubble, null);
  const locked = fresh({ mood: 'melting', lock: { active: true, text: 'Locked', reason: 'S9' } });
  const d = show(locked, msgs);
  assert.strictEqual(d.bubble.source, 'lock');
  assert.strictEqual(d.bubble.dismissible, false);
});

test('messages still show when the engine is offline', () => {
  const d = show(null, file({ id: 'a', text: 'AI layer says hi', mood: 'happy' }));
  assert.strictEqual(d.stale, true);
  assert.strictEqual(d.bubble.text, 'AI layer says hi');
  assert.strictEqual(d.face, 'happy');
});

test('sample messages are valid and pair only with drawn faces and exercises', () => {
  const list = validMessages(file(...MESSAGES));
  assert.strictEqual(list.length, MESSAGES.length);
  for (const m of list) {
    if (m.mood) assert.ok(FACES[m.mood], `${m.id}: no face ${m.mood}`);
    if (m.exercise) assert.ok(EXERCISES[m.exercise], `${m.id}: no exercise ${m.exercise}`);
  }
});

test('message replies go to actions.jsonl, not events.jsonl; bad ids are rejected', () => {
  assert.strictEqual(toMessageAction({ type: 'messageAction', id: 'a b', action: 'x' }), null);
  assert.strictEqual(toMessageAction({ type: 'messageAction', id: 'a', action: '' }), null);
  assert.strictEqual(toMessageAction({ type: 'messageAction', id: 'a', action: 7 }), null);
  const line = recordAction({ type: 'messageAction', id: 'touch-grass-1', action: 'touch-grass.accept' });
  assert.deepStrictEqual(Object.keys(line).sort(), ['action', 'messageId', 'src', 'ts', 'v']);
  const written = fs.readFileSync(path.join(dir, 'actions.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(written.map((a) => [a.messageId, a.action, a.src]), [['touch-grass-1', 'touch-grass.accept', 'overlay']]);
  assert.ok(!fs.existsSync(path.join(dir, 'events.jsonl')));
});

test('watchMessages sees messages.json changes', async () => {
  const seen = [];
  const stop = watchMessages((m) => seen.push(m && m.messages.length), { pollMs: 50 });
  fs.writeFileSync(path.join(dir, 'tmp'), JSON.stringify(file({ id: 'a', text: 'A' })));
  fs.renameSync(path.join(dir, 'tmp'), path.join(dir, 'messages.json'));
  await new Promise((r) => setTimeout(r, 200));
  stop();
  assert.deepStrictEqual(seen.filter(Boolean), [1]);
});
