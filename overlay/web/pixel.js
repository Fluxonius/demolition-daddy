// Renders the pixel grids from sprites.js into an <svg> as crisp <rect>s, and plays idle acts (sprites.ACTS).
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function grid(doc, rows, origin, palette, className) {
    const g = doc.createElementNS(NS, 'g');
    if (className) g.setAttribute('class', className);
    rows.forEach((row, y) => {
      // Merge horizontal runs of the same color to keep the DOM small.
      for (let x = 0; x < row.length; ) {
        const ch = row[x];
        let end = x + 1;
        while (end < row.length && row[end] === ch) end++;
        const color = palette[ch];
        if (color) {
          const r = doc.createElementNS(NS, 'rect');
          r.setAttribute('x', origin.x + x);
          r.setAttribute('y', origin.y + y);
          r.setAttribute('width', end - x);
          r.setAttribute('height', 1);
          r.setAttribute('fill', color);
          g.appendChild(r);
        }
        x = end;
      }
    });
    return g;
  }

  /**
   * Fills svg with the pet. opts.exercise swaps the mood face for an exercise face;
   * opts.overlays draws accessories on top; opts.pop plays the short state-change animation.
   * Returns { canBlink, setBlink(bool), setFrame(frame|null) } (frames: see ACTS in sprites.js).
   */
  function renderPet(svg, mood, opts = {}) {
    const s = opts.sprites || root.PET_SPRITES;
    const doc = svg.ownerDocument;
    const exercise = opts.exercise && s.EXERCISES[opts.exercise] ? opts.exercise : null;
    const face = exercise ? s.EXERCISES[exercise] : s.FACES[mood] || s.FACES.egg;
    const faceOrigin = { x: s.BODY_ORIGIN.x + s.FACE_ORIGIN.x, y: s.BODY_ORIGIN.y + s.FACE_ORIGIN.y };

    svg.setAttribute('viewBox', `0 0 ${s.SIZE} ${s.SIZE}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const actor = doc.createElementNS(NS, 'g');
    const actorClass = opts.pop ? 'actor pop' : 'actor';
    actor.setAttribute('class', actorClass);
    const sprite = doc.createElementNS(NS, 'g');
    sprite.setAttribute('class', 'sprite');
    let body = grid(doc, s.BODY, s.BODY_ORIGIN, s.PALETTE, 'body');
    const eyes = doc.createElementNS(NS, 'g');
    eyes.setAttribute('class', 'eyes');
    let faceG = grid(doc, face, faceOrigin, s.PALETTE, 'face');
    eyes.appendChild(faceG);
    const blink = !exercise && s.BLINK_MOODS.includes(mood) ? grid(doc, s.BLINK, faceOrigin, s.PALETTE, 'blink') : null;
    if (blink) {
      blink.style.display = 'none';
      eyes.appendChild(blink);
    }
    let extra = doc.createElementNS(NS, 'g');
    sprite.append(body, eyes, extra);
    for (const name of opts.overlays || []) {
      const o = s.OVERLAYS[name];
      if (o) sprite.appendChild(grid(doc, o.grid, o.origin, s.PALETTE, `overlay overlay-${name}`));
    }
    actor.appendChild(sprite);
    if (!exercise && s.Z_MOODS.includes(mood)) actor.appendChild(grid(doc, s.Z, s.Z_ORIGIN, s.PALETTE, 'z'));
    svg.appendChild(actor);

    const swap = (old, next) => (old.replaceWith(next), next);
    let shown = {};
    return {
      canBlink: !!blink,
      setBlink(on) { if (blink) blink.style.display = on ? '' : 'none'; },
      setFrame(f) {
        f = f || {};
        if (f.body !== shown.body) body = swap(body, grid(doc, f.body || s.BODY, s.BODY_ORIGIN, s.PALETTE, 'body'));
        if (f.face !== shown.face) faceG = swap(faceG, grid(doc, f.face || face, faceOrigin, s.PALETTE, 'face'));
        if (f.extra !== shown.extra) {
          const g = doc.createElementNS(NS, 'g');
          for (const e of f.extra || []) g.appendChild(grid(doc, e.grid, e.origin, s.PALETTE, 'extra'));
          extra = swap(extra, g);
        }
        if (blink) blink.style.display = f.blink && !f.face ? '' : 'none';
        actor.setAttribute('class', f.cls ? `actor ${f.cls}` : 'actor');
        shown = f;
      },
    };
  }

  /**
   * Brings a rendered pet to life: blinks, and every few seconds plays a random act from IDLES[key].
   * opts.reduced (prefers-reduced-motion) keeps blinks only. opts.onAct(name) is called when an act starts.
   * opts.every = [minMs, maxMs] between acts. Returns { stop() }.
   */
  function animate(pet, key, opts = {}) {
    const s = opts.sprites || root.PET_SPRITES;
    const names = (!opts.reduced && s.IDLES[key]) || [];
    const [min, max] = opts.every || [3000, 7000];
    const timers = new Set();
    let busy = false;
    let last = null;
    let stopped = false;
    const later = (fn, ms) => {
      const t = setTimeout(() => (timers.delete(t), stopped || fn()), ms);
      timers.add(t);
    };
    const hidden = () => typeof document !== 'undefined' && document.hidden;

    (function blinkLoop() {
      later(() => {
        if (pet.canBlink && !busy && !hidden()) {
          pet.setBlink(true);
          later(() => busy || pet.setBlink(false), 140);
        }
        blinkLoop();
      }, 2500 + Math.random() * 3000);
    })();

    function play(frames, i) {
      if (i >= frames.length) {
        pet.setFrame(null);
        busy = false;
        return actLoop();
      }
      pet.setFrame(frames[i]);
      later(() => play(frames, i + 1), frames[i].ms);
    }

    function actLoop() {
      if (!names.length) return;
      later(() => {
        if (hidden()) return actLoop();
        const pool = names.length > 1 ? names.filter((n) => n !== last) : names;
        last = pool[Math.floor(Math.random() * pool.length)];
        busy = true;
        if (opts.onAct) opts.onAct(last);
        play(s.ACTS[last], 0);
      }, min + Math.random() * (max - min));
    }
    actLoop();

    return {
      stop() {
        stopped = true;
        for (const t of timers) clearTimeout(t);
        timers.clear();
      },
    };
  }

  root.PixelPet = { renderPet, animate };
})(this);
