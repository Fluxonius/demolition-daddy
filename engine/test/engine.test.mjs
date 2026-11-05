import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEvents, buildSnapshot } from '../../hooks/telemetry.mjs';
import { assessWithRules } from '../../hooks/analyzer/rules.mjs';
import { buildPetState, SNOOZE_MS } from '../src/engine.ts';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../contract/fixtures');

function stateFor(name, opts = {}) {
  const events = readEvents(path.join(fixtures, `session-${name}.jsonl`));
  const now = events.at(-1).ts;
  const snapshot = buildSnapshot(events, { now });
  return buildPetState(snapshot, assessWithRules(snapshot), { now, ...opts });
}

test('calm session: low load, no nudge', () => {
  const s = stateFor('calm');
  assert.equal(s.v, 1);
  assert.ok(s.load < 50, `load ${s.load}`);
  assert.equal(s.nudge, undefined);
});

test('overload session: higher load than calm, with a nudge and reasons', () => {
  const s = stateFor('overload');
  assert.ok(s.load > stateFor('calm').load);
  assert.ok(s.load >= 50, `load ${s.load}`);
  assert.ok(s.nudge && s.nudge.level >= 1 && s.nudge.text);
  assert.ok(s.reasons.length > 0);
});

test('a recent snooze mutes the nudge', () => {
  const events = readEvents(path.join(fixtures, 'session-overload.jsonl'));
  const now = events.at(-1).ts;
  assert.equal(stateFor('overload', { lastSnoozeAt: now - 60_000 }).nudge, undefined);
  assert.ok(stateFor('overload', { lastSnoozeAt: now - SNOOZE_MS - 1 }).nudge);
});
