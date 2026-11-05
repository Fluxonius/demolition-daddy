'use strict';
// Simulated hook events for the Agent Inspector demo. They are ordinary PetEvents (contract/events.ts)
// stamped relative to "now" and marked data.simulated = true, so they go through the real engine and analyzer.
const MIN = 60_000;

function ev(now, agoMs, type, data = {}, conv = 'sim-1', src = 'hook') {
  const e = { v: 1, ts: Math.round(now - agoMs), src, type, data: { ...data, simulated: true } };
  if (src === 'hook') e.conv = conv;
  return e;
}

/** One prompt -> response -> stop turn that ended `agoMs` ago. */
function turn(now, agoMs, { conv = 'sim-1', chars = 120, response = 3000, lines = 20, prompt = {}, status = 'completed' } = {}) {
  return [
    ev(now, agoMs + 40_000, 'beforeSubmitPrompt', { chars, words: Math.round(chars / 5), ...prompt }, conv),
    ev(now, agoMs + 20_000, 'afterFileEdit', { file: 'app.ts', edits: 1, linesAdded: lines, linesRemoved: Math.round(lines / 3) }, conv),
    ev(now, agoMs + 5_000, 'afterAgentResponse', { chars: response }, conv),
    ev(now, agoMs, 'stop', { status }, conv),
  ];
}

const range = (n) => [...Array(n).keys()];

// Telemetry counts any 3 min gap as a break, so a simulated stretch of work needs a turn every ~2 min.
function steadyWork(now, minutes, opts = {}, endAgoMs = 0) {
  const turns = Math.floor(minutes / 2);
  return [
    ev(now, endAgoMs + minutes * MIN, 'sessionStart'),
    ...range(turns).flatMap((i) => turn(now, endAgoMs + i * 2 * MIN + 30_000, opts)),
  ];
}

const SIMULATIONS = {
  burst: {
    label: 'Burst of 10 prompts',
    events: (now) => range(10).flatMap((i) => turn(now, i * 25_000, { chars: 60, response: 2500 })),
  },
  'long-run': {
    label: 'Agent finished long run',
    events: (now) => [
      ev(now, 6 * MIN, 'beforeSubmitPrompt', { chars: 400, words: 80 }),
      ev(now, 5.5 * MIN, 'afterAgentThought', { chars: 4000, durationMs: 40_000 }),
      ...range(6).map((i) => ev(now, (5 - i * 0.7) * MIN, 'postToolUse', { tool: 'Shell', durationMs: 20_000 })),
      ev(now, 60_000, 'afterFileEdit', { file: 'engine.ts', edits: 9, linesAdded: 240, linesRemoved: 60 }),
      ev(now, 10_000, 'afterAgentResponse', { chars: 9000 }),
      ev(now, 0, 'stop', { status: 'completed' }),
    ],
  },
  tokens: {
    label: 'Token budget exceeded',
    events: (now) => range(4).flatMap((i) => turn(now, i * 4 * MIN, { response: 30_000, lines: 150 })),
  },
  'no-break': {
    label: '90 min without break',
    events: (now) => steadyWork(now, 90, { response: 1000, lines: 4 }),
  },
  parallel: {
    label: '3 parallel agents',
    events: (now) => ['sim-a', 'sim-b', 'sim-c'].flatMap((conv, i) => [
      ...turn(now, (i + 3) * MIN, { conv }),
      ev(now, i * 20_000, 'beforeSubmitPrompt', { chars: 90, words: 18 }, conv),
    ]),
  },
  'late-night': {
    label: 'Late night',
    clockHour: 23,
    events: (now) => range(3).flatMap((i) => turn(now, i * 2 * MIN)),
  },
  'fix-loop': {
    label: "Frustrated 'fix it' loop",
    events: (now) => range(4).flatMap((i) => [
      ...turn(now, i * 90_000, {
        chars: 40, response: 1500, lines: 4,
        status: i % 2 ? 'aborted' : 'completed',
        prompt: { frustration: 2, rejection: true, exclaims: 1, flags: ['frustrated'], pastedLines: 3 },
      }),
      ev(now, i * 90_000 + 10_000, 'afterShellExecution', { tool: 'Shell', durationMs: 4000, chars: 800, failed: true }),
    ]),
  },
  break: {
    label: 'Took a break',
    events: (now) => [ev(now, 0, 'ext.breakStart', { minutes: 0.3, window: 'overlay' }, null, 'ext')],
    after: [{ delayMs: 15_000, events: (now) => [ev(now, 0, 'ext.breakEnd', { window: 'overlay' }, null, 'ext')] }],
  },
};

// ~60 s story; `reset` clears the sandbox first. Each step's events are stamped when the step runs.
const SCENARIO = [
  { at: 0, reset: true, title: 'Fresh: a new session starts', events: (now) => [ev(now, 0, 'sessionStart'), ...turn(now, 0, { response: 800, lines: 2 })] },
  { at: 8_000, title: 'Focused: 40 min of steady work', events: (now) => steadyWork(now, 40, { response: 1200, lines: 6 }) },
  { at: 20_000, title: 'Tired: 75 min, no break, prompts speed up', events: (now) => [...steadyWork(now, 75, { response: 3000, lines: 10 }, 0), ...range(6).flatMap((i) => turn(now, i * 20_000, { chars: 40, response: 3000, lines: 20 }))] },
  { at: 36_000, title: 'Break: the user follows the bubble', events: (now) => [ev(now, 0, 'ext.breakStart', { minutes: 1, window: 'overlay' }, null, 'ext')] },
  { at: 50_000, title: 'Welcome back: break over, feeling fine', events: (now) => [ev(now, 0, 'ext.breakEnd', { window: 'overlay' }, null, 'ext'), ev(now, 0, 'ext.calibrate', { feeling: 'fine', window: 'overlay' }, null, 'ext')] },
  { at: 62_000, title: 'Scenario finished', events: () => [] },
];

module.exports = { SIMULATIONS, SCENARIO, turn, ev };
