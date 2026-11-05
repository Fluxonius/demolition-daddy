'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SIMULATIONS, SCENARIO } = require('../lib/simulate');
const { tail } = require('../lib/inspector');
const { zoneForHour, runnerPath } = require('../lib/engine');
const { describeEvent, aiStatus } = require('../web/inspector');

const RUNNER = path.join(__dirname, '..', '..', 'engine', 'scripts', 'run.mjs');

test('every simulation emits valid simulated PetEvents', () => {
  const now = Date.now();
  for (const [id, sim] of Object.entries(SIMULATIONS)) {
    const events = sim.events(now);
    assert.ok(events.length, id);
    for (const e of events) {
      assert.strictEqual(e.v, 1);
      assert.ok(['hook', 'ext'].includes(e.src));
      assert.strictEqual(e.data.simulated, true);
      assert.ok(e.ts <= now, `${id} has a future timestamp`);
    }
  }
});

test('the scenario drives the real engine runner fresh -> focused -> tired -> resting -> happy', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-inspector-'));
  const file = path.join(dir, 'events.jsonl');
  const moods = [];
  for (const step of SCENARIO.slice(0, 5)) {
    fs.appendFileSync(file, step.events(Date.now()).map((e) => JSON.stringify(e) + '\n').join(''));
    execFileSync(process.execPath, [RUNNER, '--dir', dir, '--once']);
    moods.push(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).mood);
  }
  assert.deepStrictEqual(moods.slice(0, 4), ['happy', 'focused', 'tired', 'resting']);
  assert.ok(['happy', 'focused'].includes(moods[4]));
  const log = tail(path.join(dir, 'agent-log.jsonl'), 50);
  assert.ok(log.some((x) => x.kind === 'start'));
  const tired = log.find((x) => x.kind === 'decision' && x.mood === 'tired');
  assert.ok(tired && tired.why.includes('tired') && tired.source === 'rules');
});

test('helpers: tail, describeEvent, aiStatus, zoneForHour, runnerPath', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-tail-'));
  const f = path.join(dir, 'x.jsonl');
  fs.writeFileSync(f, '{"a":1}\n{"a":2}\n{"a":');
  assert.deepStrictEqual(tail(f, 5), [{ a: 1 }, { a: 2 }]);
  assert.deepStrictEqual(tail(path.join(dir, 'missing'), 5), []);
  const d = describeEvent({ type: 'stop', src: 'hook', conv: 'abc', data: { status: 'aborted', simulated: true } });
  assert.ok(d.simulated && d.fields.includes('status=aborted'));
  assert.match(aiStatus([{ kind: 'llm', source: 'rules', cli: { error: 'Cursor CLI (`agent`) not found on PATH' } }], {}).text, /fallback: local rules/);
  assert.match(aiStatus([{ kind: 'llm', source: 'llm', cli: { durationMs: 9000 } }], {}).text, /Cursor CLI agent/);
  const zone = zoneForHour(23, new Date(Date.UTC(2026, 0, 1, 20)));
  assert.strictEqual(zone, 'Etc/GMT-3');
  assert.ok(runnerPath());
});
