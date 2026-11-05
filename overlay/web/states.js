// Every pet state the overlay can show, one example per use case (docs/specs/pet-use-cases.md).
// Used by scripts/fake-state.mjs (cycles through them), web/preview.html (grid) and the tests
// (displayState(example) must give `expect`). Fields marked "proposed" are not in the contract yet.
(function (root) {
  'use strict';
  const MIN = 60 * 1000;
  const nudge = (id, level, kind, text, exercise) => ({ id, level, moment: 'agentStopped', kind, text, ...(exercise ? { exercise } : {}) });

  // `state` is a partial PetState; `ui` lists local UI events (transitions the overlay sees itself).
  const STATES = [
    { id: 'offline', useCase: 'S12 engine offline', trigger: 'no state.json, or updatedAt > 2 min old',
      state: { mood: 'happy', load: 10, stale: true }, expect: { face: 'offline', overlays: ['question'] } },
    { id: 'egg', useCase: 'S1 not connected yet', trigger: "mood 'egg'",
      state: { mood: 'egg', load: 0 }, expect: { face: 'egg' } },
    { id: 'hatched', useCase: 'S1 first hook event', trigger: "mood changes from 'egg' (2.5 s)",
      state: { mood: 'happy', load: 5, reasons: ['first agent event'] }, ui: ['hatch'], expect: { face: 'surprised' } },
    { id: 'happy', useCase: 'UC1 idle', trigger: "mood 'happy' (load < 30)",
      state: { mood: 'happy', load: 12 }, expect: { face: 'happy' } },
    { id: 'watching', useCase: 'UC1 agent working', trigger: "agentWorking, mood 'happy' or 'focused'",
      state: { mood: 'happy', load: 15, agentWorking: true }, expect: { face: 'watching' } },
    { id: 'focused', useCase: 'S3 focused session', trigger: "mood 'focused' (load 30-60)",
      state: { mood: 'focused', load: 45 }, expect: { face: 'focused' } },
    { id: 'bored', useCase: 'UC3 long wait', trigger: "overlays has 'bored' (proposed)",
      state: { mood: 'focused', load: 40, agentWorking: true, overlays: ['bored'], reasons: ['waiting 3 min on the agent'] },
      expect: { face: 'watching', overlays: ['bored'] } },
    { id: 'juggling', useCase: 'S5 parallel agents', trigger: 'stats.parallelConvs >= 2 (2 or 3+ balls)',
      state: { mood: 'focused', load: 50, parallelConvs: 3, reasons: ['3 agents at once'] }, expect: { face: 'focused', overlays: ['juggle3'] } },
    { id: 'stuffed', useCase: 'UC2 token budget', trigger: "overlays has 'stuffed' (proposed)",
      state: { mood: 'happy', load: 25, overlays: ['stuffed'], reasons: ['~75k tokens this session'] }, expect: { face: 'happy', overlays: ['stuffed'] } },
    { id: 'tired', useCase: 'UC4 long without a break', trigger: "mood 'tired' (load 60-85)",
      state: { mood: 'tired', load: 70, reasons: ['55 min without a break'] }, expect: { face: 'tired' } },
    { id: 'asking', useCase: 'UC3/UC4 break nudge (L1)', trigger: "nudge.level 1, mood 'happy'/'focused'/'tired'",
      state: { mood: 'tired', load: 70, reasons: ['55 min without a break'], nudge: nudge('eyes-20-20-20', 1, 'micro', 'Eyes need 20 seconds?', 'eyes-20-20-20') },
      expect: { face: 'asking', bubble: true } },
    { id: 'exercise', useCase: 'S8 guided break', trigger: "Let's go on a nudge with exercise (60 s), or onBreak + nudge.exercise",
      state: { mood: 'resting', load: 50, onBreak: true, nudge: nudge('stretch', 1, 'micro', 'Reach up high!', 'stretch') },
      expect: { exercise: 'stretch' } },
    { id: 'resting', useCase: 'S8 break taken', trigger: 'onBreak (mood resting)',
      state: { mood: 'resting', load: 45, onBreak: true, reasons: ['On a break'] }, expect: { face: 'resting' } },
    { id: 'welcome', useCase: 'S8 back from a break', trigger: 'onBreak goes true -> false (6 s)',
      state: { mood: 'happy', load: 20, reasons: ['back from a break'] }, ui: ['welcome'], expect: { face: 'celebrate', overlays: ['sparkles'], bubble: true } },
    { id: 'loot', useCase: 'S8 adventure loot', trigger: "overlays has 'crown' (proposed)",
      state: { mood: 'happy', load: 15, overlays: ['crown'] }, expect: { face: 'happy', overlays: ['crown'] } },
    { id: 'agent-done', useCase: 'UC3 agent finished', trigger: "nudge.kind 'agent-done' (proposed)",
      state: { mood: 'happy', load: 25, nudge: nudge('agent-done', 1, 'agent-done', "Agent's done. Your turn!") },
      expect: { face: 'alert', overlays: ['alert-mark'], bubble: true } },
    { id: 'sweaty', useCase: 'UC5 fix-it loop', trigger: "overlays has 'sweaty' (proposed)",
      state: { mood: 'tired', load: 75, overlays: ['sweaty'], reasons: ["3 'fix it's in 10 min"],
        nudge: nudge('fix-loop-new-chat', 1, 'micro', "That's the 3rd 'fix it'. Fresh chat?") },
      expect: { face: 'asking', overlays: ['sweaty'], bubble: true } },
    { id: 'melting', useCase: 'UC4 90 min / S9 L2', trigger: "mood 'melting' (load 85-95)",
      state: { mood: 'melting', load: 90, reasons: ['90 min without a break'],
        nudge: nudge('long-walk', 2, 'long', 'The agent is busy. Walk with me for 5 minutes?', 'walk') },
      expect: { face: 'melting', bubble: true } },
    { id: 'urgent', useCase: 'S10 urgent override', trigger: 'urgentUntil in the future (nudges muted)',
      state: { mood: 'focused', load: 55, urgentMin: 30, reasons: ['urgent: nudges muted'], nudge: nudge('long-break', 1, 'long', 'muted') },
      expect: { face: 'determined', overlays: ['helmet'], bubble: false } },
    { id: 'nightcap', useCase: 'UC6 late hour', trigger: "overlays has 'nightcap' (proposed)",
      state: { mood: 'tired', load: 65, overlays: ['nightcap'], reasons: ['past bedtime'],
        nudge: nudge('bedtime', 1, 'stop-for-today', "It's past 22:00. Wrap up for today?") },
      expect: { face: 'asking', overlays: ['nightcap'], bubble: true } },
    { id: 'sleeping', useCase: 'UC6 bedtime + 2 h / S9', trigger: "mood 'sleeping' (load 95+ or late)",
      state: { mood: 'sleeping', load: 97, overlays: ['nightcap'] }, expect: { face: 'sleeping', overlays: ['nightcap'] } },
    { id: 'locked', useCase: 'S9 soft lock (L3)', trigger: 'lock.active',
      state: { mood: 'sleeping', load: 98, lock: { active: true, text: 'Pixel fell asleep on your keyboard. 60 seconds?', bypassesLeft: 3 } },
      expect: { face: 'sleeping', overlays: ['lock'], bubble: true } },
  ];

  /** Builds a full PetState from an example's partial state. */
  function toPetState(partial, now) {
    const s = partial;
    return {
      v: 1,
      updatedAt: s.stale ? now - 3 * MIN : now,
      load: s.load,
      mood: s.mood,
      reasons: s.reasons || [],
      stats: { prompts: 0, agentTurns: 0, filesEdited: 0, readChars: 0, waitMs: 0, sessionMs: 0, sinceBreakMs: 0,
        parallelConvs: s.parallelConvs || 1, aborts: 0, frustration: 0, snoozes: 0 },
      agentWorking: !!s.agentWorking,
      onBreak: !!s.onBreak,
      ...(s.urgentMin ? { urgentUntil: now + s.urgentMin * MIN } : {}),
      ...(s.nudge ? { nudge: s.nudge } : {}),
      ...(s.lock ? { lock: s.lock } : {}),
      ...(s.overlays ? { overlays: s.overlays } : {}), // proposed
    };
  }

  /** UI transients for an example, as displayState expects them. */
  function toUi(example, now) {
    const ui = { now };
    for (const t of example.ui || []) {
      if (t === 'hatch') ui.hatchUntil = now + 2500;
      if (t === 'welcome') ui.welcomeUntil = now + 6000;
    }
    return ui;
  }

  // Sample messages.json entries (proposed schema, README "Messages"): what an AI layer might say.
  // `npm run fake` sends them one by one; ids get a timestamp suffix there so each send is new.
  const MESSAGES = [
    { id: 'touch-grass', text: 'Time to go touch grass. 5 minutes outside?', priority: 20, ttlMs: 45000, mood: 'tired',
      buttons: [{ label: 'Going!', action: 'touch-grass.accept' }, { label: 'Not now', action: 'touch-grass.later' }] },
    { id: 'water', text: 'Sip of water? You have been prompting for 50 min.', priority: 5, ttlMs: 20000, mood: 'asking',
      buttons: [{ label: 'Done', action: 'water.done' }] },
    { id: 'stretch', text: 'Shoulders up, hold, drop. Twice.', priority: 10, ttlMs: 30000, exercise: 'stretch',
      buttons: [{ label: 'Did it', action: 'stretch.done' }, { label: 'Skip', action: 'stretch.skip' }] },
    { id: 'nice-streak', text: '3 agent runs merged without a retry. Nice.', priority: 1, ttlMs: 12000, mood: 'celebrate' },
    { id: 'wrap-up', text: 'It is 23:40. Save a note for tomorrow and stop?', priority: 60, ttlMs: 0, mood: 'sleeping',
      buttons: [{ label: 'Wrap up', action: 'wrap-up.accept' }, { label: '15 more min', action: 'wrap-up.snooze15' }] },
  ];

  const api = { STATES, MESSAGES, toPetState, toUi };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PET_STATES = api;
})(this);
