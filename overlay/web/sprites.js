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
    R: '#e04848',    // nightcap, juggling ball
    Y: '#ffd23f',    // accents: "!", lock, hard hat, sparkles, crown
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

    // Reaction faces: not moods, but states the overlay derives from PetState (see web/display.js).
    offline: [        // no state / engine offline (with a "?" accessory)
      '..........',
      '..........',
      '.GG....GG.',
      '..........',
      '...GGGG...',
      '..........',
    ],
    surprised: [      // just hatched (egg -> any mood)
      'WWW....WWW',
      'W.W....W.W',
      'WWW....WWW',
      '..........',
      '....WW....',
      '....WW....',
    ],
    watching: [       // agent is working: reading along
      '..........',
      '..........',
      'WW....WW..',
      'WW....WW..',
      '....WW....',
      '..........',
    ],
    asking: [         // a break nudge is on screen
      '.WWW..WWW.',
      '.WKW..WKW.',
      '.WWW..WWW.',
      '..........',
      '...W..W...',
      '....WW....',
    ],
    alert: [          // agent finished after a long wait
      '..........',
      '.WW....WW.',
      '.WW....WW.',
      '..........',
      '..WWWWWW..',
      '...WWWW...',
    ],
    celebrate: [      // welcome back from a break
      '..........',
      '..W....W..',
      '.W.W..W.W.',
      '..........',
      'P.WWWWWW.P',
      '...WWWW...',
    ],
    determined: [     // urgent window: holding the fort
      'WW......WW',
      '..W....W..',
      '.WW....WW.',
      '.WW....WW.',
      '..........',
      '...WWWW...',
    ],
  };

  // Exercise faces (Nudge.exercise), shown instead of the mood face during a guided break.
  const EXERCISES = {
    'eyes-20-20-20': [  // looking far away
      '..WW....WW',
      '..WW....WW',
      '..........',
      '..........',
      '....WW....',
      '..........',
    ],
    'cyclic-sigh': [    // eyes closed, slow "o" exhale
      '..........',
      '..........',
      '.WW....WW.',
      '....WW....',
      '...W..W...',
      '....WW....',
    ],
    stretch: [          // > <  big grin
      '.W......W.',
      '..W....W..',
      '.W......W.',
      '..........',
      '..WWWWWW..',
      '...WWWW...',
    ],
    walk: [             // glancing sideways, small smile
      '..........',
      'WW....WW..',
      'WW....WW..',
      '..........',
      '...W..W...',
      '....WW....',
    ],
  };

  // Accessories drawn on top (PetState.overlays, proposed in docs/specs/pet-use-cases.md).
  // Each has its own small grid and an origin on the canvas. They never change the body shape.
  const OVERLAYS = {
    stuffed: { origin: { x: 5, y: 11 }, grid: [   // puffed pink cheeks
      'PP......PP',
      'PP......PP',
    ] },
    bored: { origin: { x: 14, y: 1 }, grid: [     // "..." thought dots
      'G.G.G',
    ] },
    sweaty: { origin: { x: 14, y: 6 }, grid: [    // sweat drop
      '.B',
      'BB',
      'BB',
    ] },
    nightcap: { origin: { x: 4, y: 1 }, grid: [   // red nightcap with a pompom
      '.......WW.',
      '......RR..',
      '....RRRR..',
      '..RRRRRRR.',
      'WWWWWWWWWW',
    ] },
    // UI-derived accessories (see web/display.js), not part of PetState.overlays.
    question: { origin: { x: 16, y: 0 }, grid: [  // offline
      'WWW',
      '..W',
      '.W.',
      '...',
      '.W.',
    ] },
    'alert-mark': { origin: { x: 17, y: 0 }, grid: [  // agent done
      'Y',
      'Y',
      'Y',
      '.',
      'Y',
    ] },
    sparkles: { origin: { x: 0, y: 0 }, grid: [   // welcome back
      '.Y................Y.',
      'YYY..............YYY',
      '.Y................Y.',
    ] },
    lock: { origin: { x: 14, y: 13 }, grid: [     // soft lock active
      '.YY.',
      'Y..Y',
      'YYYY',
      'YYYY',
    ] },
    helmet: { origin: { x: 4, y: 2 }, grid: [     // urgent window (hard hat)
      '...YYYYYY...',
      '..YYYYYYYY..',
      'YYYYYYYYYYYY',
    ] },
    juggle2: { origin: { x: 5, y: 0 }, grid: [    // 2 agents at once
      'RR......BB',
      'RR......BB',
    ] },
    juggle3: { origin: { x: 4, y: 0 }, grid: [    // 3+ agents at once
      '.....YY.....',
      'RR...YY...BB',
      'RR........BB',
    ] },
    hearts: { origin: { x: 1, y: 0 }, grid: [     // just petted
      '.P.P.',
      'PPPPP',
      '.PPP.',
      '..P..',
    ] },
    crown: { origin: { x: 6, y: 0 }, grid: [      // loot after a break (proposed)
      'Y..YY..Y',
      'YY.YY.YY',
      'YYYYYYYY',
    ] },
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
  const BLINK_MOODS = ['happy', 'focused', 'tired', 'alert'];

  // Floating "z" for sleeping, at Z_ORIGIN on the canvas (top right, above the body).
  const Z = [
    'ZZZZ',
    '..Z.',
    '.Z..',
    'ZZZZ',
  ];
  const Z_ORIGIN = { x: 16, y: 0 };
  const Z_MOODS = ['sleeping'];

  // Idle acts: short frame sequences played now and then on top of the current face.
  // A frame starts from the normal pet, then applies what it lists:
  //   face / body: replacement grid (same size as the original)
  //   extra: [{ origin, grid }] pixels drawn on top, blink: true shows BLINK,
  //   cls: CSS class on the pet (`hop`, `look-left`, ... in pixel.css), ms: how long the frame lasts.
  const EAR_FLICK = withRows(BODY, { 0: 'oo..........oo..', 1: 'oKKo.......oKKo.' });
  const EAR_FLICK_R = withRows(BODY, { 0: '..oo..........oo', 1: '.oKKo.......oKKo' });
  const EARS_DOWN = withRows(BODY, { 0: '................', 1: '.oooo......oooo.' });
  const YAWN = ['..........', '..........', '.WW....WW.', '...WWWW...', '...W..W...', '...WWWW...'];
  const SIGH = ['..........', '..........', '..........', '.WW....WW.', '..........', '....WW....'];
  const STRETCH = EXERCISES.stretch;
  const PAW = ['.o', 'oK', 'oK'];
  const DROP = ['B'];
  const ZZ = ['ZZZ', '.Z.', 'ZZZ'];
  const Z_TINY = ['.Z', 'Z.'];

  const ACTS = {
    lookLeft: [{ cls: 'look-left', ms: 1400 }],
    lookRight: [{ cls: 'look-right', ms: 1400 }],
    lookAround: [{ cls: 'look-left', ms: 900 }, { ms: 250 }, { cls: 'look-right', ms: 900 }],
    earTwitch: [{ body: EAR_FLICK, ms: 110 }, { ms: 110 }, { body: EAR_FLICK, ms: 110 }],
    earTwitchRight: [{ body: EAR_FLICK_R, ms: 110 }, { ms: 110 }, { body: EAR_FLICK_R, ms: 110 }],
    earsBoth: [{ body: EAR_FLICK, ms: 160 }, { body: EAR_FLICK_R, ms: 160 }, { ms: 160 }, { body: EAR_FLICK, ms: 160 }],
    hop: [{ cls: 'hop', ms: 450 }],
    doubleHop: [{ cls: 'hop', ms: 450 }, { ms: 60 }, { cls: 'hop', ms: 450 }],
    slowBlink: [{ blink: true, ms: 700 }],
    fastBlink: [{ blink: true, ms: 90 }, { ms: 110 }, { blink: true, ms: 90 }],
    scratch: [0, 1, 0, 1, 0, 1].map((dy) => ({ body: EAR_FLICK, extra: [{ origin: { x: 0, y: 5 + dy }, grid: PAW }], ms: 140 })),
    yawn: [{ face: YAWN, body: EARS_DOWN, ms: 1500 }],
    stretch: [{ face: STRETCH, cls: 'rise', ms: 1600 }],
    sigh: [{ face: SIGH, body: EARS_DOWN, cls: 'sink', ms: 1800 }],
    drip: [13, 14, 15, 16, 17, 18, 19].map((y) => ({ extra: [{ origin: { x: 14, y }, grid: DROP }], ms: 200 })),
    wobble: [{ cls: 'wobble', ms: 1200 }],
    zzz: [{ x: 2, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 0 }].map((origin) => ({ extra: [{ origin, grid: ZZ }], ms: 450 })),
    dream: [{ body: EAR_FLICK, extra: [{ origin: { x: 1, y: 3 }, grid: Z_TINY }], ms: 300 }, { extra: [{ origin: { x: 1, y: 3 }, grid: Z_TINY }], ms: 600 }],
  };

  // Which acts each face (or 'exercise') picks from at random, every few seconds.
  const IDLES = {
    happy: ['hop', 'earsBoth', 'earTwitch', 'lookAround', 'scratch'],
    focused: ['lookLeft', 'lookRight', 'earTwitchRight', 'slowBlink'],
    watching: ['lookRight', 'earTwitch', 'earTwitchRight'],
    tired: ['yawn', 'sigh', 'slowBlink'],
    melting: ['drip', 'wobble', 'drip'],
    sleeping: ['zzz', 'dream', 'earTwitchRight'],
    resting: ['stretch', 'yawn', 'earsBoth'],
    egg: ['wobble'],
    offline: ['lookAround', 'earTwitch'],
    surprised: ['earTwitch', 'fastBlink'],
    asking: ['hop', 'earTwitch', 'lookAround'],
    alert: ['hop', 'earTwitchRight', 'fastBlink'],
    celebrate: ['doubleHop', 'earsBoth'],
    determined: ['lookAround', 'earTwitch', 'earTwitchRight'],
    exercise: ['earsBoth'],
  };

  function withRows(grid, rows) {
    return grid.map((row, i) => (i in rows ? rows[i] : row));
  }

  const sprites = {
    PALETTE, SIZE, BODY, BODY_ORIGIN, FACES, FACE_ORIGIN, EXERCISES, OVERLAYS, BLINK, BLINK_MOODS, Z, Z_ORIGIN, Z_MOODS,
    ACTS, IDLES,
  };
  if (typeof module === 'object' && module.exports) module.exports = sprites;
  else root.PET_SPRITES = sprites;
})(this);
