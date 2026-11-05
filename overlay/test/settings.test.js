'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-settings-'));
process.env.CURSOR_PET_DIR = dir;
const st = require('../lib/settings');
const sprites = require('../web/sprites.js');

test('defaults match the spec and keep the prompt-lock off', () => {
  const d = st.defaults();
  assert.strictEqual(d.version, 1);
  assert.strictEqual(d.lock.enabled, false);
  assert.strictEqual(d.work.breakReminderMin, 50);
  assert.strictEqual(d.load.tokenBudget, 100000);
  assert.strictEqual(d.night.bedtime, '22:00');
  assert.strictEqual(d.night.wakeTime, '06:00');
  assert.strictEqual(d.nudges.cooldownMin, 10);
  assert.deepStrictEqual(d.breaks.exercises, ['eyes-20-20-20', 'cyclic-sigh', 'stretch']);
  assert.strictEqual(d.pet.name, 'Pixel');
});

test('every exercise option has a sprite', () => {
  for (const e of st.EXERCISES) assert.ok(sprites.EXERCISES[e], `missing exercise sprite: ${e}`);
});

test('readSettings falls back to defaults for a missing or broken file', () => {
  assert.deepStrictEqual(st.readSettings(), st.defaults());
  fs.writeFileSync(st.settingsPath(), '{"pet": {"na');
  assert.deepStrictEqual(st.readSettings(), st.defaults());
});

test('normalize clamps, validates and drops unknown keys', () => {
  const s = st.normalize({
    pet: { name: '   ', sound: 'yes' },
    work: { breakReminderMin: 9999, overworkMin: 5 },
    load: { tiredAt: 90, overworkedAt: 50 },
    night: { bedtime: '25:99', quietStart: '23:30' },
    nudges: { intensity: 'nuclear' },
    breaks: { exercises: ['stretch', 'juggling'] },
    lock: { enabled: true },
    extra: { nope: 1 },
  });
  assert.strictEqual(s.pet.name, 'Pixel');
  assert.strictEqual(s.pet.sound, false);
  assert.strictEqual(s.work.breakReminderMin, 180);
  assert.ok(s.work.overworkMin > s.work.breakReminderMin);
  assert.ok(s.load.overworkedAt > s.load.tiredAt);
  assert.strictEqual(s.night.bedtime, '22:00');
  assert.strictEqual(s.night.quietStart, '23:30');
  assert.strictEqual(s.nudges.intensity, 'normal');
  assert.deepStrictEqual(s.breaks.exercises, ['stretch']);
  assert.strictEqual(s.lock.enabled, true);
  assert.strictEqual(s.extra, undefined);
});

test('writeSettings is atomic and round-trips', () => {
  const saved = st.writeSettings({ ...st.defaults(), pet: { name: 'Byte', sound: true, showMeter: false } });
  assert.strictEqual(saved.pet.name, 'Byte');
  assert.deepStrictEqual(st.readSettings(), saved);
  assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
});

test('inWindow handles windows that wrap past midnight', () => {
  const at = (h, m) => new Date(2026, 10, 5, h, m);
  assert.ok(st.inWindow('22:00', '06:00', at(23, 0)));
  assert.ok(st.inWindow('22:00', '06:00', at(5, 59)));
  assert.ok(!st.inWindow('22:00', '06:00', at(6, 0)));
  assert.ok(st.inWindow('09:00', '17:00', at(12, 0)));
  assert.ok(!st.inWindow('09:00', '09:00', at(9, 0)));
});

test('every field has a default that survives normalization', () => {
  const d = st.defaults();
  for (const f of st.FIELDS) {
    const v = f.key.split('.').reduce((o, k) => o[k], d);
    assert.deepStrictEqual(v, f.default, f.key);
    if (f.enabledBy) assert.ok(st.FIELDS.some((g) => g.key === f.enabledBy && g.type === 'bool'), f.key);
  }
});
