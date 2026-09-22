// Desert Oasis - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
//
// One-way run from a sun-baked slot canyon into a hidden green oasis -
// track.js blends the three zones below as progress (t) sweeps from 0 to 1
// (see DESERT_OASIS_ZONES and buildThemeResolver in track.js). Only
// theme.previewColor is used outside the zones (for the level-select card).
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  const DESERT_OASIS_ZONES = [
    { t: 0.0, theme: { // Sun-Baked Canyon
      sky: 0xffcf8a, fogNear: 200, fogFar: 900,
      waterShallow: 0xd9a24a, waterDeep: 0x6b4a1a,
      bank: 0xc9915a, rock: 0x8a5a34, ground: 0xd9a86a,
    } },
    { t: 0.55, theme: { // Canyon Narrows
      sky: 0xe8b878, fogNear: 170, fogFar: 800,
      waterShallow: 0x5cb89c, waterDeep: 0x2a5a4a,
      bank: 0xa87a4a, rock: 0x6a4a2e, ground: 0x7a6a3a,
    } },
    { t: 1.0, theme: { // Hidden Oasis
      sky: 0xa8e8d9, fogNear: 140, fogFar: 700,
      waterShallow: 0x3fe0c0, waterDeep: 0x0c4a3a,
      bank: 0x4a8a4a, rock: 0x5a6a3a, ground: 0x2f7a3f,
    } },
  ];

  global.HT.LevelDefs.push({
    id: 'desert-oasis',
    name: 'Desert Canyon Oasis',
    description: 'A dry slot canyon run that ends somewhere nobody expects - the sandstone walls fall away into a lush, waterfall-fed lagoon hidden deep in the desert.',
    difficulty: 'Medium',
    locked: false,
    loop: false,
    totalLaps: 1,
    halfWidth: 42,
    checkpointCount: 10,
    boostCount: 9,
    // A dune jump early in the dry canyon, and a second launch down into
    // the oasis basin itself.
    ramps: [
      { t: 0.4, height: 5 },
      { t: 0.8, height: 4.5 },
    ],
    theme: { previewColor: '#d9a24a' },
    themeZones: DESERT_OASIS_ZONES,
    controlPoints: [
      [0, 0, 0], [180, -8, 40], [340, -20, 20], [460, -35, -80],
      [520, -50, -220], [460, -65, -360], [320, -80, -460], [140, -90, -520],
      [-60, -95, -500], [-220, -100, -400], [-320, -100, -240], [-340, -100, -60],
      [-260, -100, 120], [-100, -100, 260],
    ],
  });
})(window);
