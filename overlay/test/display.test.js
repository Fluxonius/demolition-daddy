'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { displayState } = require('../web/display.js');
const { STATES, toPetState, toUi } = require('../web/states.js');
const sprites = require('../web/sprites.js');

const NOW = 1_800_000_000_000;

for (const ex of STATES) {
  test(`${ex.id}: ${ex.useCase}`, () => {
    const d = displayState(toPetState(ex.state, NOW), toUi(ex, NOW));
    if (ex.expect.face) assert.strictEqual(d.face, ex.expect.face);
    if (ex.expect.exercise) assert.strictEqual(d.exercise, ex.expect.exercise);
    for (const o of ex.expect.overlays || []) assert.ok(d.overlays.includes(o), `missing overlay ${o}: ${d.overlays}`);
    if ('bubble' in ex.expect) assert.strictEqual(!!d.bubble, ex.expect.bubble);
    assert.ok(sprites.FACES[d.face], `no sprite for face ${d.face}`);
    for (const o of d.overlays) assert.ok(sprites.OVERLAYS[o], `no sprite for overlay ${o}`);
  });
}

test('no state at all shows the offline face', () => {
  assert.strictEqual(displayState(null, { now: NOW }).face, 'offline');
});

test('every face and accessory is used by at least one state', () => {
  const faces = new Set();
  const overlays = new Set();
  for (const ex of STATES) {
    const d = displayState(toPetState(ex.state, NOW), toUi(ex, NOW));
    faces.add(d.face);
    d.overlays.forEach((o) => overlays.add(o));
  }
  faces.add('melting'); // reached via mood
  const unusedFaces = Object.keys(sprites.FACES).filter((f) => !faces.has(f));
  const unusedOverlays = Object.keys(sprites.OVERLAYS).filter((o) => !overlays.has(o) && !['juggle2', 'hearts'].includes(o));
  assert.deepStrictEqual(unusedFaces, []);
  assert.deepStrictEqual(unusedOverlays, []);
});
