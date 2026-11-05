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

test('every contract exercise has a face and every proposed overlay a grid', () => {
  for (const e of ['eyes-20-20-20', 'cyclic-sigh', 'stretch', 'walk']) assert.ok(s.EXERCISES[e], `missing exercise: ${e}`);
  for (const o of ['stuffed', 'bored', 'sweaty', 'nightcap']) assert.ok(s.OVERLAYS[o], `missing overlay: ${o}`);
});

test('grids are rectangular, use palette colors and fit the canvas', () => {
  const bw = s.BODY[0].length;
  checkGrid('BODY', s.BODY, bw, s.BODY.length);
  assert.ok(s.BODY_ORIGIN.x + bw <= s.SIZE && s.BODY_ORIGIN.y + s.BODY.length <= s.SIZE, 'BODY overflows SIZE');
  const fw = s.FACES.happy[0].length;
  const fh = s.FACES.happy.length;
  for (const [m, rows] of Object.entries(s.FACES)) checkGrid(`FACES.${m}`, rows, fw, fh);
  for (const [e, rows] of Object.entries(s.EXERCISES)) checkGrid(`EXERCISES.${e}`, rows, fw, fh);
  checkGrid('BLINK', s.BLINK, fw, fh);
  for (const [o, { origin, grid }] of Object.entries(s.OVERLAYS)) {
    checkGrid(`OVERLAYS.${o}`, grid, grid[0].length, grid.length);
    assert.ok(origin.x + grid[0].length <= s.SIZE && origin.y + grid.length <= s.SIZE, `OVERLAYS.${o} overflows SIZE`);
  }
  assert.ok(s.FACE_ORIGIN.x + fw <= bw && s.FACE_ORIGIN.y + fh <= s.BODY.length, 'face overflows BODY');
  checkGrid('Z', s.Z, s.Z[0].length, s.Z.length);
  assert.ok(s.Z_ORIGIN.x + s.Z[0].length <= s.SIZE, 'Z overflows SIZE');
  checkGrid('TAIL', s.TAIL, s.TAIL[0].length, s.TAIL.length);
  assert.ok(s.TAIL_ORIGIN.x + s.TAIL[0].length <= s.SIZE && s.TAIL_ORIGIN.y + s.TAIL.length <= s.SIZE, 'TAIL overflows SIZE');
});

test('idle acts use valid frames and every face has some', () => {
  const fw = s.FACES.happy[0].length;
  const fh = s.FACES.happy.length;
  for (const [name, frames] of Object.entries(s.ACTS)) {
    assert.ok(frames.length > 0, `ACTS.${name} is empty`);
    frames.forEach((f, i) => {
      const at = `ACTS.${name}[${i}]`;
      assert.ok(f.ms > 0 && f.ms <= 2000, `${at}: ms must be 1..2000`);
      if (f.face) checkGrid(`${at}.face`, f.face, fw, fh);
      if (f.body) checkGrid(`${at}.body`, f.body, s.BODY[0].length, s.BODY.length);
      if (f.tail) checkGrid(`${at}.tail`, f.tail, s.TAIL[0].length, s.TAIL.length);
      for (const { origin, grid } of f.extra || []) {
        checkGrid(`${at}.extra`, grid, grid[0].length, grid.length);
        assert.ok(origin.x >= 0 && origin.y >= 0 && origin.x + grid[0].length <= s.SIZE && origin.y + grid.length <= s.SIZE, `${at}.extra overflows SIZE`);
      }
    });
  }
  for (const face of [...Object.keys(s.FACES), 'exercise']) {
    const names = s.IDLES[face];
    assert.ok(names && names.length, `no IDLES for ${face}`);
    for (const n of names) assert.ok(s.ACTS[n], `IDLES.${face}: unknown act ${n}`);
  }
});
