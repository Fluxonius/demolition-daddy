// Maps PetState (+ a few local UI events) to what the pet shows: face, exercise, accessories, bubble.
// Pure function, shared by the page, the preview and the tests. The table lives in overlay/README.md.
(function (root) {
  'use strict';

  const MOODS = ['egg', 'happy', 'focused', 'tired', 'melting', 'sleeping', 'resting'];
  const STALE_MS = 2 * 60 * 1000;

  /**
   * @param state PetState or null
   * @param ui    { now, exercise?: {name, until}, hatchUntil?, welcomeUntil?, heartsUntil? }
   * @returns { face, exercise, overlays: string[], bubble: null | { text, nudgeId, actions: boolean }, stale, mood }
   */
  function displayState(state, ui = {}) {
    const now = ui.now || Date.now();
    const stale = !state || typeof state.updatedAt !== 'number' || now - state.updatedAt > STALE_MS;
    const mood = state && MOODS.includes(state.mood) ? state.mood : 'egg';
    const out = { face: mood, exercise: null, overlays: [], bubble: null, stale, mood };

    if (stale) {
      out.face = 'offline';
      out.overlays.push('question');
      return out;
    }

    const nudge = state.nudge || null;
    const urgent = typeof state.urgentUntil === 'number' && state.urgentUntil > now;
    const lock = state.lock && state.lock.active ? state.lock : null;
    const parallel = state.stats && state.stats.parallelConvs;

    // Face, highest priority first.
    if (ui.hatchUntil > now && mood !== 'egg') out.face = 'surprised';
    else if (ui.exercise && ui.exercise.until > now) out.exercise = ui.exercise.name;
    else if (state.onBreak && nudge && nudge.exercise) out.exercise = nudge.exercise;
    else if (ui.welcomeUntil > now) out.face = 'celebrate';
    else if (lock) out.face = 'sleeping';
    else if (!urgent && nudge && nudge.kind === 'agent-done') out.face = 'alert';
    else if (!urgent && nudge && nudge.level === 1 && ['happy', 'focused', 'tired'].includes(mood)) out.face = 'asking';
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

    // Bubble: the lock message wins; nudges are muted during an urgent window and during a break.
    if (lock) out.bubble = { text: lock.text, nudgeId: null, actions: false };
    else if (!urgent && !state.onBreak && nudge && nudge.level >= 1) {
      out.bubble = { text: nudge.text, nudgeId: nudge.id, actions: nudge.kind !== 'agent-done' };
    } else if (out.face === 'celebrate') out.bubble = { text: 'Welcome back!', nudgeId: null, actions: false };
    return out;
  }

  const api = { displayState, MOODS, STALE_MS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PetDisplay = api;
})(this);
