'use strict';
// User settings in <petDir>/settings.json. The overlay owns the file and the window that edits it;
// engine and hooks are expected to read it (contract proposal: docs/specs/ui-settings.md).
const fs = require('node:fs');
const path = require('node:path');
const { petDir } = require('./pet-dir');

const SCHEMA_VERSION = 1;
const EXERCISES = ['eyes-20-20-20', 'cyclic-sigh', 'stretch'];

// `reader` says who acts on the field: ui applies it live, pet/hooks are proposals for their code.
const GROUPS = [
  {
    id: 'pet', title: 'Pet', fields: [
      { key: 'pet.name', type: 'text', default: 'Pixel', maxLength: 16, label: 'Pet name', reader: 'ui' },
      { key: 'pet.sound', type: 'bool', default: false, label: 'Sound', help: 'Short chirp when a nudge appears.', reader: 'ui' },
      { key: 'pet.showMeter', type: 'bool', default: true, label: 'Show load meter', reader: 'ui' },
    ],
  },
  {
    id: 'night', title: 'Night & quiet hours', fields: [
      { key: 'night.lateNightWarning', type: 'bool', default: true, label: 'Late-night mode', help: 'Nightcap, dim palette and faster tiring after bedtime (UC6).', reader: 'pet' },
      { key: 'night.bedtime', enabledBy: 'night.lateNightWarning', type: 'time', default: '22:00', label: 'Bedtime', reader: 'pet' },
      { key: 'night.wakeTime', enabledBy: 'night.lateNightWarning', type: 'time', default: '06:00', label: 'Wake time', reader: 'pet' },
      { key: 'night.quietHours', type: 'bool', default: true, label: 'Quiet hours', help: 'The pet sleeps and never nudges.', reader: 'ui+pet' },
      { key: 'night.quietStart', enabledBy: 'night.quietHours', type: 'time', default: '00:00', label: 'Quiet from', reader: 'ui+pet' },
      { key: 'night.quietEnd', enabledBy: 'night.quietHours', type: 'time', default: '07:00', label: 'Quiet until', reader: 'ui+pet' },
    ],
  },
  {
    id: 'work', title: 'Work rhythm', fields: [
      { key: 'work.breakReminderMin', type: 'number', default: 50, min: 10, max: 180, unit: 'min', label: 'Break reminder after', help: 'Continuous work before the pet gets tired (UC4).', reader: 'pet' },
      { key: 'work.overworkMin', type: 'number', default: 90, min: 20, max: 300, unit: 'min', label: 'Overworked after', help: 'L2 nudge in any mood.', reader: 'pet' },
      { key: 'work.longWaitMin', type: 'number', default: 3, min: 1, max: 30, unit: 'min', label: 'Long agent wait', reader: 'pet' },
    ],
  },
  {
    id: 'load', title: 'Load thresholds', fields: [
      { key: 'load.tiredAt', type: 'number', default: 60, min: 30, max: 95, unit: '%', label: 'Tired at load', reader: 'pet' },
      { key: 'load.overworkedAt', type: 'number', default: 85, min: 40, max: 100, unit: '%', label: 'Overworked at load', reader: 'pet' },
      { key: 'load.tokenBudget', type: 'number', default: 100000, min: 0, max: 10000000, step: 10000, unit: 'tokens', label: 'Token budget', help: '0 turns it off (UC2).', reader: 'pet' },
      { key: 'load.fixLoopPrompts', type: 'number', default: 3, min: 2, max: 20, unit: '/10 min', label: 'Frustrated prompts = loop', reader: 'pet' },
      { key: 'load.maxParallelAgents', type: 'number', default: 3, min: 1, max: 10, unit: 'agents', label: 'Parallel agents limit', reader: 'pet' },
    ],
  },
  {
    id: 'nudges', title: 'Nudges', fields: [
      {
        key: 'nudges.intensity', type: 'select', default: 'normal', label: 'Intensity', reader: 'pet',
        options: [
          { value: 'off', label: 'Off (mood only)' },
          { value: 'gentle', label: 'Gentle (L1 bubbles)' },
          { value: 'normal', label: 'Normal (up to L2)' },
          { value: 'persistent', label: 'Persistent (L3 lock)' },
        ],
      },
      { key: 'nudges.cooldownMin', type: 'number', default: 10, min: 2, max: 120, unit: 'min', label: 'At most one nudge per', reader: 'pet' },
      { key: 'nudges.snoozesToEscalate', type: 'number', default: 2, min: 1, max: 10, unit: 'snoozes', label: 'Escalate after', reader: 'pet' },
      { key: 'nudges.urgentMuteMin', type: 'number', default: 45, min: 10, max: 240, unit: 'min', label: '"Urgent" mutes for', reader: 'pet' },
    ],
  },
  {
    id: 'breaks', title: 'Breaks', fields: [
      { key: 'breaks.exerciseSec', type: 'number', default: 60, min: 20, max: 300, unit: 's', label: 'Guided exercise', reader: 'pet' },
      { key: 'breaks.longBreakMin', type: 'number', default: 5, min: 1, max: 60, unit: 'min', label: 'Long break', reader: 'pet' },
      {
        key: 'breaks.exercises', type: 'multi', default: EXERCISES.slice(), label: 'Exercises', reader: 'pet',
        options: [
          { value: 'eyes-20-20-20', label: 'Eyes 20-20-20' },
          { value: 'cyclic-sigh', label: 'Cyclic sighing' },
          { value: 'stretch', label: 'Stand & stretch' },
        ],
      },
    ],
  },
  {
    id: 'lock', title: 'Soft prompt-lock', fields: [
      { key: 'lock.enabled', type: 'bool', default: false, label: 'Enable soft prompt-lock', warning: 'When overworked, Cursor may refuse to send your prompt until you take a 60 s break. "!urgent" always passes. Off by default.', reader: 'pet+hooks' },
      { key: 'lock.bypassesPerDay', enabledBy: 'lock.enabled', type: 'number', default: 3, min: 1, max: 20, unit: '/day', label: '"!urgent" bypasses', reader: 'pet' },
      { key: 'lock.unlockSec', enabledBy: 'lock.enabled', type: 'number', default: 60, min: 15, max: 300, unit: 's', label: 'Unlock break', reader: 'pet' },
    ],
  },
];

const FIELDS = GROUPS.flatMap((g) => g.fields);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const settingsPath = () => path.join(petDir(), 'settings.json');

function getPath(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function setPath(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  for (const k of parts.slice(0, -1)) o = o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {});
  o[parts[parts.length - 1]] = value;
}

function cleanValue(field, v) {
  const d = field.default;
  switch (field.type) {
    case 'bool':
      return typeof v === 'boolean' ? v : d;
    case 'number': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return d;
      return Math.min(field.max, Math.max(field.min, Math.round(n)));
    }
    case 'time':
      return typeof v === 'string' && TIME_RE.test(v) ? v : d;
    case 'text': {
      const s = typeof v === 'string' ? v.trim().slice(0, field.maxLength) : '';
      return s || d;
    }
    case 'select':
      return field.options.some((o) => o.value === v) ? v : d;
    case 'multi': {
      if (!Array.isArray(v)) return d.slice();
      const known = field.options.map((o) => o.value).filter((x) => v.includes(x));
      return known.length ? known : d.slice();
    }
    default:
      return d;
  }
}

function defaults() {
  return normalize({});
}

/** Fills missing or invalid fields with defaults; unknown keys are dropped. */
function normalize(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { version: SCHEMA_VERSION };
  for (const f of FIELDS) setPath(out, f.key, cleanValue(f, getPath(src, f.key)));
  if (out.load.overworkedAt <= out.load.tiredAt) out.load.overworkedAt = Math.min(100, out.load.tiredAt + 5);
  if (out.work.overworkMin <= out.work.breakReminderMin) out.work.overworkMin = out.work.breakReminderMin + 10;
  return out;
}

function readSettings() {
  try {
    return normalize(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    return defaults();
  }
}

/** Atomic write (tmp + rename) so readers never see half a file. Returns what was stored. */
function writeSettings(input) {
  const s = normalize(input);
  fs.mkdirSync(petDir(), { recursive: true });
  const tmp = `${settingsPath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, settingsPath());
  return s;
}

/** "HH:MM" window that may wrap past midnight; equal ends mean an empty window. */
function inWindow(start, end, date = new Date()) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const now = date.getHours() * 60 + date.getMinutes();
  const a = toMin(start);
  const b = toMin(end);
  if (a === b) return false;
  return a < b ? now >= a && now < b : now >= a || now < b;
}

/** Calls cb(settings) when settings.json changes, including edits made by hand. */
function watchSettings(cb, { pollMs = 1000 } = {}) {
  let last = JSON.stringify(readSettings());
  const timer = setInterval(() => {
    const s = readSettings();
    const raw = JSON.stringify(s);
    if (raw !== last) {
      last = raw;
      cb(s);
    }
  }, pollMs);
  return () => clearInterval(timer);
}

module.exports = {
  SCHEMA_VERSION, GROUPS, FIELDS, EXERCISES,
  settingsPath, defaults, normalize, readSettings, writeSettings, inWindow, watchSettings,
};
