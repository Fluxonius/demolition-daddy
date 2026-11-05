// Renders PetState (foundation spec §4.4). Two hosts:
// - Electron overlay: window.petHost from preload.js pushes state on every state.json change.
// - Browser fallback (npm run serve): polls GET state.json and POSTs clicks to /action.
// Preview without any state: ?mood=tired, ?exercise=stretch, ?overlays=nightcap,sweaty.
(() => {
  'use strict';
  const MOODS = ['egg', 'happy', 'focused', 'tired', 'melting', 'sleeping', 'resting'];
  const STALE_MS = 2 * 60 * 1000;
  const POLL_MS = 1000;

  const $ = (id) => document.getElementById(id);
  const root = $('root');
  const pet = $('pet');
  const params = new URLSearchParams(location.search);
  const previewMood = params.get('mood');
  const previewExercise = params.get('exercise');
  const previewOverlays = params.get('overlays');
  const EXERCISE_MS = 60 * 1000;

  const host = window.petHost || browserHost();
  if (host.kind !== 'electron') document.body.classList.add('browser');

  let current = null;
  let drawnKey = null;
  let localExercise = null; // { name, until } after the user clicks "Let's go"
  let sprite = null;

  (function scheduleBlink() {
    setTimeout(() => {
      if (sprite && sprite.canBlink) {
        sprite.setBlink(true);
        setTimeout(() => sprite && sprite.setBlink(false), 140);
      }
      scheduleBlink();
    }, 2500 + Math.random() * 3000);
  })();

  function browserHost() {
    return {
      kind: 'browser',
      onState(cb) {
        const tick = () =>
          fetch('state.json', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then(cb);
        tick();
        const t = setInterval(tick, POLL_MS);
        return () => clearInterval(t);
      },
      send(msg) {
        fetch('action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msg) })
          .catch(() => {});
      },
    };
  }

  function render(state) {
    current = state;
    const stale = !state || typeof state.updatedAt !== 'number' || Date.now() - state.updatedAt > STALE_MS;
    let mood = state && MOODS.includes(state.mood) ? state.mood : 'egg';
    if (MOODS.includes(previewMood)) mood = previewMood;

    root.className = `mood-${mood}` + (stale && !previewMood ? ' offline' : '');

    // A stale state shows the waiting (egg) face rather than a frozen mood.
    const faceMood = stale && !previewMood ? 'egg' : mood;
    let exercise = previewExercise;
    if (!exercise && localExercise && Date.now() < localExercise.until) exercise = localExercise.name;
    if (!exercise && state && !stale && state.onBreak && state.nudge && state.nudge.exercise) exercise = state.nudge.exercise;
    const overlays = previewOverlays !== null
      ? previewOverlays.split(',').filter(Boolean)
      : (state && !stale && Array.isArray(state.overlays) ? state.overlays : []);
    const key = [faceMood, exercise || '', overlays.join(',')].join('|');
    if (key !== drawnKey) {
      drawnKey = key;
      sprite = window.PixelPet.renderPet(pet, faceMood, { exercise, overlays });
    }

    const load = state && Number.isFinite(state.load) ? Math.max(0, Math.min(100, state.load)) : 0;
    const fill = $('load-fill');
    fill.style.width = `${load}%`;
    fill.style.background = load >= 85 ? '#e53935' : load >= 60 ? '#fb8c00' : load >= 30 ? '#fdd835' : '#4caf50';

    let label;
    if (previewMood) label = `preview: ${mood}`;
    else if (!state) label = 'waiting for state…';
    else if (stale) label = 'engine offline';
    else label = `${mood} · ${Math.round(load)}%` + (state.reasons && state.reasons[0] ? ` · ${state.reasons[0]}` : '');
    $('label').textContent = label;
    $('label').title = state && state.reasons ? state.reasons.join('\n') : '';

    const nudge = state && !stale && state.nudge && state.nudge.level >= 1 ? state.nudge : null;
    $('bubble').hidden = !nudge;
    if (nudge) $('bubble-text').textContent = nudge.text;
  }

  $('accept').addEventListener('click', () => {
    if (!current || !current.nudge) return;
    host.send({ type: 'nudgeAccepted', id: current.nudge.id });
    if (current.nudge.exercise) {
      localExercise = { name: current.nudge.exercise, until: Date.now() + EXERCISE_MS };
      render(current);
      setTimeout(() => render(current), EXERCISE_MS + 50);
    }
  });
  $('dismiss').addEventListener('click', () => current && current.nudge && host.send({ type: 'nudgeDismissed', id: current.nudge.id }));

  // Drag the frameless window by the pet; a click without movement pets it.
  let drag = null;
  pet.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.screenX, y: e.screenY, moved: 0 };
    pet.setPointerCapture(e.pointerId);
  });
  pet.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.screenX - drag.x;
    const dy = e.screenY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.screenX;
    drag.y = e.screenY;
    if (host.dragBy && (dx || dy)) host.dragBy(dx, dy);
  });
  pet.addEventListener('pointerup', () => {
    if (drag && drag.moved < 4) host.send({ type: 'action', action: 'pet' });
    drag = null;
  });
  pet.addEventListener('contextmenu', (e) => {
    if (!host.showMenu) return;
    e.preventDefault();
    host.showMenu();
  });

  render(null);
  host.onState(render);
  setInterval(() => render(current), 15000); // re-evaluate staleness when state.json stops changing
})();
