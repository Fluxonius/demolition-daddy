// Renders the pixel grids from sprites.js into an <svg> as crisp <rect>s.
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

  /** Fills svg with the pet for mood. Returns { setBlink(bool) }. */
  function renderPet(svg, mood, sprites) {
    const s = sprites || root.PET_SPRITES;
    const doc = svg.ownerDocument;
    const face = s.FACES[mood] || s.FACES.egg;
    const faceOrigin = { x: s.BODY_ORIGIN.x + s.FACE_ORIGIN.x, y: s.BODY_ORIGIN.y + s.FACE_ORIGIN.y };

    svg.setAttribute('viewBox', `0 0 ${s.SIZE} ${s.SIZE}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const sprite = doc.createElementNS(NS, 'g');
    sprite.setAttribute('class', 'sprite');
    sprite.appendChild(grid(doc, s.BODY, s.BODY_ORIGIN, s.PALETTE, 'body'));
    sprite.appendChild(grid(doc, face, faceOrigin, s.PALETTE, 'face'));
    const blink = s.BLINK_MOODS.includes(mood) ? grid(doc, s.BLINK, faceOrigin, s.PALETTE, 'blink') : null;
    if (blink) {
      blink.style.display = 'none';
      sprite.appendChild(blink);
    }
    svg.appendChild(sprite);
    if (s.Z_MOODS.includes(mood)) svg.appendChild(grid(doc, s.Z, s.Z_ORIGIN, s.PALETTE, 'z'));

    return {
      canBlink: !!blink,
      setBlink(on) { if (blink) blink.style.display = on ? '' : 'none'; },
    };
  }

  root.PixelPet = { renderPet };
})(this);
