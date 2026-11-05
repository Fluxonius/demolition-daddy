'use strict';
const test = require('node:test');
const assert = require('node:assert');
const s = require('../web/sprites.js');

const MOODS = ['egg', 'happy', 'focused', 'tired', 'melting', 'sleeping', 'resting'];

function checkGrid(name, rows, width, height) {
  assert.strictEqual(rows.length, height, `${name}: expected ${height} rows`);
  rows.forEach((row, i) => {
    assert.strictEqual(row.length, width, `${name} row ${i}: expected ${width} chars, got ${row.length}`);
    for (const ch of row) assert.ok(ch in s.PALETTE, `${name} row ${i}: '${ch}' is not in PALETTE`);
  });
}

test('every contract mood has a face', () => {
  for (const m of MOODS) assert.ok(s.FACES[m], `missing face: ${m}`);
});

test('grids are rectangular, use palette colors and fit the canvas', () => {
  const bw = s.BODY[0].length;
  checkGrid('BODY', s.BODY, bw, s.BODY.length);
  assert.ok(s.BODY_ORIGIN.x + bw <= s.SIZE && s.BODY_ORIGIN.y + s.BODY.length <= s.SIZE, 'BODY overflows SIZE');
  const fw = s.FACES.happy[0].length;
  const fh = s.FACES.happy.length;
  for (const [m, rows] of Object.entries(s.FACES)) checkGrid(`FACES.${m}`, rows, fw, fh);
  checkGrid('BLINK', s.BLINK, fw, fh);
  assert.ok(s.FACE_ORIGIN.x + fw <= bw && s.FACE_ORIGIN.y + fh <= s.BODY.length, 'face overflows BODY');
  checkGrid('Z', s.Z, s.Z[0].length, s.Z.length);
  assert.ok(s.Z_ORIGIN.x + s.Z[0].length <= s.SIZE, 'Z overflows SIZE');
});
