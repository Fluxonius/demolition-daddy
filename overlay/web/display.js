// Maps PetState + messages.json (+ a few local UI events) to what the pet shows:
// face, exercise, accessories and one speech bubble. Pure functions, shared by the page,
// the preview and the tests. Tables: overlay/README.md "States" and "Messages".
(function (root) {
  'use strict';

  const MOODS = ['egg', 'happy', 'focused', 'tired', 'melting', 'sleeping', 'resting'];
  const STALE_MS = 2 * 60 * 1000;
  const DEFAULT_TTL_MS = 30 * 1000;
  const URGENT_BYPASS_PRIORITY = 50; // messages at or above this still show during an urgent window
  const MAX_BUTTONS = 3;
  const MAX_TEXT = 140;

  /** Keeps only well-formed messages (proposed schema, see README "Messages"). */
  function validMessages(file) {
    const list = file && Array.isArray(file.messages) ? file.messages : Array.isArray(file) ? file : [];
    return list.filter((m) => m && typeof m.id === 'string' && m.id && typeof m.text === 'string' && m.text).map((m) => ({
      id: m.id,
      text: m.text.slice(0, MAX_TEXT),
      buttons: (Array.isArray(m.buttons) ? m.buttons : [])
        .filter((b) => b && typeof b.label === 'string' && typeof b.action === 'string')
        .slice(0, MAX_BUTTONS)
        .map((b) => ({ label: b.label.slice(0, 24), action: b.action })),
      ttlMs: Number.isFinite(m.ttlMs) && m.ttlMs >= 0 ? m.ttlMs : DEFAULT_TTL_MS,
      priority: Number.isFinite(m.priority) ? m.priority : 0,
      createdAt: Number.isFinite(m.createdAt) ? m.createdAt : null,
      mood: typeof m.mood === 'string' ? m.mood : null,
      exercise: typeof m.exercise === 'string' ? m.exercise : null,
      dismissible: m.dismissible !== false,
    }));
  }

  /** When a message's ttl started: createdAt, else the first time this overlay saw it. */
  function startedAt(m, ui, now) {
    return m.createdAt || (ui.firstSeen && ui.firstSeen[m.id]) || now;
  }

  function isExpired(m, ui, now) {
    return m.ttlMs > 0 && now >= startedAt(m, ui, now) + m.ttlMs;
  }

  /**
   * All bubbles that want to be shown, best first. Sources: soft lock (always wins), messages.json,
   * the engine's nudge, and the local "Welcome back!". Handled ids (clicked, dismissed, expired) are skipped.
   */
  function bubbleQueue(state, ui, now, fresh) {
    const handled = ui.handled || new Set();
    const lock = fresh && state.lock && state.lock.active ? state.lock : null;
    if (lock) return [{ id: 'lock', source: 'lock', text: lock.text, buttons: [], dismissible: false, priority: Infinity }];

    const urgent = fresh && typeof state.urgentUntil === 'number' && state.urgentUntil > now;
    const queue = [];
    for (const m of validMessages(ui.messages)) {
      if (handled.has(m.id) || isExpired(m, ui, now)) continue;
      if (urgent && m.priority < URGENT_BYPASS_PRIORITY) continue;
      queue.push({ ...m, source: 'message' });
    }
    const nudge = fresh ? state.nudge : null;
    if (nudge && nudge.level >= 1 && !urgent && !state.onBreak && !handled.has(`nudge:${nudge.id}`)) {
      const agentDone = nudge.kind === 'agent-done';
      queue.push({
        id: `nudge:${nudge.id}`, source: 'nudge', nudgeId: nudge.id, text: nudge.text, dismissible: true,
        priority: 10 * nudge.level, ttlMs: 0,
        buttons: agentDone ? [] : [{ label: "Let's go", action: 'accept' }, { label: 'Later', action: 'snooze' }],
      });
    }
    if (fresh && ui.welcomeUntil > now && !handled.has('welcome')) {
      queue.push({ id: 'welcome', source: 'welcome', text: 'Welcome back!', buttons: [], dismissible: true, priority: 5, ttlMs: 0 });
    }
    return queue.sort((a, b) => b.priority - a.priority || (a.createdAt || 0) - (b.createdAt || 0));
  }

  /**
   * @param state PetState or null
   * @param ui    { now, messages?, handled?: Set, firstSeen?: {id: ts}, exercise?: {name, until},
   *                hatchUntil?, welcomeUntil?, heartsUntil? }
   * @returns { face, exercise, overlays, bubble, queued, stale, mood }
   */
  function displayState(state, ui = {}) {
    const now = ui.now || Date.now();
    const stale = !state || typeof state.updatedAt !== 'number' || now - state.updatedAt > STALE_MS;
    const mood = state && MOODS.includes(state.mood) ? state.mood : 'egg';
    const out = { face: mood, exercise: null, overlays: [], bubble: null, queued: 0, stale, mood };

    // Messages can come from an AI layer that runs without the engine, so they show even when stale.
    const queue = bubbleQueue(state || {}, ui, now, !stale);
    out.bubble = queue[0] || null;
    out.queued = Math.max(0, queue.length - 1);
    const paired = out.bubble && out.bubble.source === 'message' ? out.bubble : null;

    if (stale) {
      out.face = 'offline';
      out.overlays.push('question');
      if (paired && paired.mood) out.face = paired.mood;
      if (paired && paired.exercise) out.exercise = paired.exercise;
      return out;
    }

    const nudge = state.nudge || null;
    const urgent = typeof state.urgentUntil === 'number' && state.urgentUntil > now;
    const lock = state.lock && state.lock.active ? state.lock : null;
    const parallel = state.stats && state.stats.parallelConvs;
    const nudgeShown = out.bubble && out.bubble.source === 'nudge';

    // Face, highest priority first.
    if (ui.hatchUntil > now && mood !== 'egg') out.face = 'surprised';
    else if (ui.exercise && ui.exercise.until > now) out.exercise = ui.exercise.name;
    else if (state.onBreak && nudge && nudge.exercise) out.exercise = nudge.exercise;
    else if (paired && (paired.mood || paired.exercise)) {
      if (paired.exercise) out.exercise = paired.exercise;
      else out.face = paired.mood;
    } else if (ui.welcomeUntil > now) out.face = 'celebrate';
    else if (lock) out.face = 'sleeping';
    else if (nudgeShown && nudge.kind === 'agent-done') out.face = 'alert';
    else if (nudgeShown && nudge.level === 1 && ['happy', 'focused', 'tired'].includes(mood)) out.face = 'asking';
    else if (urgent && ['happy', 'focused'].includes(mood)) out.face = 'determined';
    else if (state.agentWorking && ['happy', 'focused'].includes(mood)) out.face = 'watching';

    // Accessories: engine-provided first, then UI-derived.
    if (Array.isArray(state.overlays)) out.overlays.push(...state.overlays);
    if (parallel >= 3) out.overlays.push('juggle3');
    else if (parallel === 2) out.overlays.push('juggle2');
    if (urgent) out.overlays.push('helmet');
    if (lock) out.overlays.push('lock');
    if (out.face === 'alert') out.overlays.push('alert-mark');
    if (out.face === 'celebrate') out.overlays.push('sparkles');
    if (ui.heartsUntil > now) out.overlays.push('hearts');
    return out;
  }

  const api = { displayState, bubbleQueue, validMessages, isExpired, startedAt, MOODS, STALE_MS, DEFAULT_TTL_MS, URGENT_BYPASS_PRIORITY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PetDisplay = api;
})(this);
