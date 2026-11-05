'use strict';
// Main-process side of the Agent Inspector: tails the pet dir files, switches between the live pet dir
// and a sandbox for simulated events, and plays the scripted demo scenario.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { petDir, eventsPath, actionsPath, readJson } = require('./pet-dir');
const engine = require('./engine');
const { SIMULATIONS, SCENARIO } = require('./simulate');

const SANDBOX = path.join(os.tmpdir(), 'napcat-sandbox');
const TAIL_BYTES = 256 * 1024;

/** Last n parsed JSON lines of a .jsonl file (reads at most 256 KB from the end). */
function tail(file, n) {
  let text;
  try {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n').slice(-n - 1)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // half-written line
    }
  }
  return out.slice(-n);
}

function createInspector({ liveDir, setDir }) {
  let timers = [];
  let scenario = { running: false, step: null, steps: SCENARIO.map((s) => s.title) };
  let clock = null;

  const inSandbox = () => petDir() === SANDBOX;

  function useDir(dir) {
    if (petDir() !== dir) setDir(dir);
    engine.ensure(dir, { llm: true, tz: clock && clock.tz });
  }

  function resetSandbox() {
    fs.mkdirSync(SANDBOX, { recursive: true });
    for (const name of ['events.jsonl', 'actions.jsonl', 'agent-log.jsonl', 'state.json', 'messages.json']) {
      fs.rmSync(path.join(SANDBOX, name), { force: true });
    }
  }

  function append(events) {
    if (!events.length) return;
    fs.mkdirSync(petDir(), { recursive: true });
    fs.appendFileSync(eventsPath(), events.map((e) => JSON.stringify(e) + '\n').join(''));
  }

  function setClock(hour) {
    clock = hour === null ? null : { hour, tz: engine.zoneForHour(hour) };
    engine.start(petDir(), { llm: true, tz: clock && clock.tz });
  }

  function stopScenario() {
    timers.forEach(clearTimeout);
    timers = [];
    scenario = { ...scenario, running: false };
  }

  function simulate(name) {
    const sim = SIMULATIONS[name];
    if (!sim) return false;
    useDir(SANDBOX);
    if (sim.clockHour !== undefined && (!clock || clock.hour !== sim.clockHour)) setClock(sim.clockHour);
    append(sim.events(Date.now()));
    for (const later of sim.after || []) timers.push(setTimeout(() => append(later.events(Date.now())), later.delayMs));
    return true;
  }

  function playScenario() {
    stopScenario();
    useDir(SANDBOX);
    if (clock) setClock(null);
    scenario = { ...scenario, running: true, step: 0, startedAt: Date.now() };
    SCENARIO.forEach((step, i) => {
      timers.push(setTimeout(() => {
        if (step.reset) resetSandbox();
        append(step.events(Date.now()));
        scenario = { ...scenario, step: i, running: i < SCENARIO.length - 1 };
      }, step.at));
    });
  }

  function setMode(mode) {
    stopScenario();
    if (mode === 'sandbox') useDir(SANDBOX);
    else {
      if (clock) clock = null;
      useDir(liveDir);
    }
  }

  function reset() {
    stopScenario();
    clock = null;
    resetSandbox();
    useDir(SANDBOX);
    engine.start(SANDBOX, { llm: true });
  }

  function snapshot() {
    return {
      dir: petDir(),
      liveDir,
      sandbox: inSandbox(),
      engine: engine.status(),
      clock,
      scenario,
      simulations: Object.entries(SIMULATIONS).map(([id, s]) => ({ id, label: s.label })),
      events: tail(eventsPath(), 80),
      agentLog: tail(path.join(petDir(), 'agent-log.jsonl'), 40),
      actions: tail(actionsPath(), 20),
      state: readJson('state.json'),
      messages: readJson('messages.json'),
      now: Date.now(),
    };
  }

  return { snapshot, simulate, playScenario, setMode, reset, stopScenario, SANDBOX };
}

module.exports = { createInspector, tail, SANDBOX };
