// Pixel-art pet. Edit by hand: one character = one pixel.
// - BODY never changes between moods. FACES are drawn on top of it at FACE_ORIGIN.
// - In FACES, BLINK and Z, '.' means "leave the pixel below as is" (transparent).
// - Every row of a grid must have the same length (npm test checks it).
// - Colors live in PALETTE; add a letter there to use a new color.
(function (root) {
  'use strict';

  const PALETTE = {
    '.': null,       // transparent
    K: '#111111',    // body (black by default)
    o: '#3a3a3a',    // body edge, so the pet reads on dark desktops
    W: '#f5f5f5',    // eyes and mouth
    G: '#7a7a7a',    // dim face (egg)
    P: '#ff7aa8',    // blush
    B: '#6fa8ff',    // tired-blue (eye bags, sweat)
    Z: '#9ec5ff',    // sleep "z"
  };

  // Canvas is SIZE x SIZE; the body sits at BODY_ORIGIN, leaving room for the "z" above.
  const SIZE = 20;
  const BODY_ORIGIN = { x: 2, y: 3 };

  const BODY = [
    '..oo........oo..',
    '.oKKo......oKKo.',
    '.oKKKooooooKKKo.',
    '.oKKKKKKKKKKKKo.',
    'oKKKKKKKKKKKKKKo',
    'oKKKKKKKKKKKKKKo',
    'oKKKKKKKKKKKKKKo',
    'oKKKKKKKKKKKKKKo',
    'oKKKKKKKKKKKKKKo',
    'oKKKKKKKKKKKKKKo',
    'oKKKKKKKKKKKKKKo',
    'oKKKKKKKKKKKKKKo',
    '.oKKKKKKKKKKKKo.',
    '..oKKKKKKKKKKo..',
    '...oooooooooo...',
  ];

  // Face grids are 10 x 6, placed at FACE_ORIGIN inside the body.
  const FACE_ORIGIN = { x: 3, y: 5 };

  const FACES = {
    egg: [            // not connected yet: dim, sleepy dots
      '..........',
      '..........',
      '..G....G..',
      '..........',
      '....GG....',
      '..........',
    ],
    happy: [
      '..........',
      '.WW....WW.',
      '.WW....WW.',
      '..........',
      'P..W..W..P',
      '....WW....',
    ],
    focused: [
      '..........',
      '.WW....WW.',
      '.WW....WW.',
      '..........',
      '...WWWW...',
      '..........',
    ],
    tired: [
      '..........',
      '..........',
      '.WW....WW.',
      '.BB....BB.',
      '....WW....',
      '....WW....',
    ],
    melting: [
      'W.W....W.W',
      '.W......W.',
      'W.W....W.W',
      '.........B',
      '..W.W.W..B',
      '...W.W.W..',
    ],
    sleeping: [
      '..........',
      '..........',
      '.WW....WW.',
      '..........',
      '....WW....',
      '..........',
    ],
    resting: [        // on a break: content, eyes closed (^ ^)
      '..........',
      '..W....W..',
      '.W.W..W.W.',
      '..........',
      'P..W..W..P',
      '....WW....',
    ],
  };

  // Blink frame: drawn over the current face for a moment. 'K' paints body color over open eyes.
  const BLINK = [
    '..........',
    '.KK....KK.',
    '.WW....WW.',
    '..........',
    '..........',
    '..........',
  ];
  const BLINK_MOODS = ['happy', 'focused', 'tired'];

  // Floating "z" for sleeping, at Z_ORIGIN on the canvas (top right, above the body).
  const Z = [
    'ZZZZ',
    '..Z.',
    '.Z..',
    'ZZZZ',
  ];
  const Z_ORIGIN = { x: 16, y: 0 };
  const Z_MOODS = ['sleeping'];

  const sprites = { PALETTE, SIZE, BODY, BODY_ORIGIN, FACES, FACE_ORIGIN, BLINK, BLINK_MOODS, Z, Z_ORIGIN, Z_MOODS };
  if (typeof module === 'object' && module.exports) module.exports = sprites;
  else root.PET_SPRITES = sprites;
})(this);
