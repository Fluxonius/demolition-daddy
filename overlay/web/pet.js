// Renders PetState (foundation spec §4.4) through PetDisplay.displayState (display.js). Two hosts:
// - Electron overlay: window.petHost from preload.js pushes state.json and messages.json on every change.
// - Browser fallback (npm run serve): polls GET state.json + messages.json and POSTs clicks to /action.
// Preview without any state: ?face=asking, ?mood=tired, ?exercise=stretch, ?overlays=nightcap,sweaty.
(() => {
  'use strict';
  const POLL_MS = 1000;
  const EXERCISE_MS = 60 * 1000;
  const HATCH_MS = 2500;
  const WELCOME_MS = 6000;
  const HEARTS_MS = 1500;

  const $ = (id) => document.getElementById(id);
  const root = $('root');
  const pet = $('pet');
  const params = new URLSearchParams(location.search);
  const preview = {
    face: params.get('face') || params.get('mood'),
    exercise: params.get('exercise'),
    overlays: params.get('overlays'),
  };
  const isPreview = Object.values(preview).some((v) => v !== null);

  const host = window.petHost || browserHost();
  if (host.kind !== 'electron') document.body.classList.add('browser');

  let current = null;
  let messages = null; // last messages.json
  let drawnKey = null;
  let sprite = null;
  const ui = { exercise: null, hatchUntil: 0, welcomeUntil: 0, heartsUntil: 0, handled: new Set(), firstSeen: {} };
  const displayed = new Set(); // message ids that have been on screen, to report 'expire'
  let bubble = null; // bubble currently on screen
  let bubbleKey = null;
  let prev = { mood: null, onBreak: false };
  let settings = null; // UI-side fields of settings.json (lib/settings.js); null until the host sends them
  let lastChirpId = null;

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
    const poll = (file) => (cb) => {
      const tick = () =>
        fetch(file, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then(cb);
      tick();
      const t = setInterval(tick, POLL_MS);
      return () => clearInterval(t);
    };
    return {
      kind: 'browser',
      onState: poll('state.json'),
      onMessages: poll('messages.json'),
      send(msg) {
        fetch('action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msg) })
          .catch(() => {});
      },
    };
  }

  // Track transitions that only the UI sees: hatching and coming back from a break.
  function noteTransitions(state, now) {
    if (!state) return;
    if (prev.mood === 'egg' && state.mood && state.mood !== 'egg') ui.hatchUntil = now + HATCH_MS;
    if (prev.onBreak && !state.onBreak) ui.welcomeUntil = now + WELCOME_MS;
    prev = { mood: state.mood, onBreak: !!state.onBreak };
  }

  function onState(state) {
    noteTransitions(state, Date.now());
    render(state);
  }

  function render(state) {
    current = state;
    const now = Date.now();
    expireMessages(now);
    const d = window.PetDisplay.displayState(state, { ...ui, messages, now });
    if (isPreview) {
      if (preview.face) d.face = preview.face;
      d.mood = window.PetDisplay.MOODS.includes(preview.face) ? preview.face : d.mood;
      if (preview.exercise) d.exercise = preview.exercise;
      if (preview.overlays !== null) d.overlays = preview.overlays.split(',').filter(Boolean);
      d.stale = false;
    }
    if (settings && !isPreview && isQuiet(new Date())) {
      if (d.bubble && d.bubble.source === 'nudge') d.bubble = null;
      if (d.mood !== 'resting' && d.mood !== 'egg' && !d.exercise) d.face = 'sleeping';
    }
    if (d.bubble && d.bubble.source === 'nudge' && d.bubble.nudgeId !== lastChirpId) {
      lastChirpId = d.bubble.nudgeId;
      if (settings && settings.pet.sound) chirp();
    }

    root.className = `mood-${d.mood} face-${d.exercise ? 'exercise' : d.face}` + (d.stale ? ' offline' : '') +
      (settings && !settings.pet.showMeter ? ' no-meter' : '');
    const key = [d.face, d.exercise || '', d.overlays.join(',')].join('|');
    if (key !== drawnKey) {
      drawnKey = key;
      sprite = window.PixelPet.renderPet(pet, d.face, { exercise: d.exercise, overlays: d.overlays });
    }

    const load = state && Number.isFinite(state.load) ? Math.max(0, Math.min(100, state.load)) : 0;
    const fill = $('load-fill');
    fill.style.width = `${load}%`;
    fill.style.background = load >= 85 ? '#e53935' : load >= 60 ? '#fb8c00' : load >= 30 ? '#fdd835' : '#4caf50';

    let label;
    if (isPreview) label = `preview: ${d.exercise || d.face}`;
    else if (!state) label = 'waiting for state…';
    else if (d.stale) label = 'engine offline';
    else label = `${d.mood} · ${Math.round(load)}%` + (state.reasons && state.reasons[0] ? ` · ${state.reasons[0]}` : '');
    $('label').textContent = label;
    $('label').title = state && state.reasons ? state.reasons.join('\n') : '';

    drawBubble(d.bubble, d.queued, now);
  }

  function drawBubble(b, queued, now) {
    bubble = b;
    $('bubble').hidden = !b;
    if (!b) return (bubbleKey = null);
    if (b.source === 'message') {
      displayed.add(b.id);
      if (!b.createdAt && !ui.firstSeen[b.id]) ui.firstSeen[b.id] = now;
    }
    const key = JSON.stringify([b.id, b.text, b.buttons, queued, b.dismissible]);
    if (key === bubbleKey) return;
    bubbleKey = key;
    $('bubble').className = `bubble from-${b.source}` + (b.dismissible ? ' dismissible' : '');
    $('bubble').title = b.dismissible ? 'Click to dismiss' : '';
    $('bubble-text').textContent = b.text;
    $('bubble-more').hidden = !queued;
    $('bubble-more').textContent = `+${queued}`;
    const box = $('bubble-buttons');
    box.replaceChildren(
      ...b.buttons.map((btn) => {
        const el = document.createElement('button');
        el.textContent = btn.label;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          answer(b, btn.action);
        });
        return el;
      }),
    );
    box.hidden = !b.buttons.length;
  }

  // Report and hide messages whose ttl ran out while (or after) they were on screen.
  function expireMessages(now) {
    const list = window.PetDisplay.validMessages(messages);
    for (const m of list) {
      if (!displayed.has(m.id) || ui.handled.has(m.id)) continue;
      if (window.PetDisplay.isExpired(m, ui, now)) {
        ui.handled.add(m.id);
        host.send({ type: 'messageAction', id: m.id, action: 'expire' });
      }
    }
  }

  function answer(b, action) {
    ui.handled.add(b.id);
    if (b.source === 'message') host.send({ type: 'messageAction', id: b.id, action });
    else if (b.source === 'nudge' && action === 'accept') {
      host.send({ type: 'nudgeAccepted', id: b.nudgeId });
      const nudge = current && current.nudge;
      if (nudge && nudge.id === b.nudgeId && nudge.exercise) {
        ui.exercise = { name: nudge.exercise, until: Date.now() + EXERCISE_MS };
        setTimeout(() => render(current), EXERCISE_MS + 50);
      }
    } else if (b.source === 'nudge') host.send({ type: 'nudgeDismissed', id: b.nudgeId });
    render(current);
  }

  $('bubble').addEventListener('click', () => {
    if (bubble && bubble.dismissible) answer(bubble, 'dismiss');
  });

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
    if (drag && drag.moved < 4) {
      host.send({ type: 'action', action: 'pet' });
      ui.heartsUntil = Date.now() + HEARTS_MS;
      render(current);
      setTimeout(() => render(current), HEARTS_MS + 50);
    }
    drag = null;
  });
  pet.addEventListener('contextmenu', (e) => {
    if (!host.showMenu) return;
    e.preventDefault();
    host.showMenu();
  });

  function isQuiet(date) {
    const n = settings.night;
    if (!n.quietHours) return false;
    const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const now = date.getHours() * 60 + date.getMinutes();
    const a = toMin(n.quietStart);
    const b = toMin(n.quietEnd);
    if (a === b) return false;
    return a < b ? now >= a && now < b : now >= a || now < b;
  }

  function chirp() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      osc.onended = () => ctx.close();
    } catch {
      // audio is optional
    }
  }

  function applySettings(s) {
    settings = s;
    const name = (s && s.pet.name) || 'Pixel';
    document.title = name;
    pet.setAttribute('aria-label', `${name} the pet`);
    render(current);
  }

  if (host.openSettings) {
    const gear = $('gear');
    gear.hidden = false;
    gear.addEventListener('click', () => host.openSettings());
  }
  if (host.onSettings) host.onSettings(applySettings);

  render(null);
  host.onState(onState);
  if (host.onMessages) {
    host.onMessages((m) => {
      messages = m;
      render(current);
    });
  }
  setInterval(() => render(current), 1000); // expire transient faces and re-check staleness
})();
