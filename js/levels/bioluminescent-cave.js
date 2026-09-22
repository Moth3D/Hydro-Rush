// Bioluminescent Cave - level definition. Registers itself into
// HT.LevelDefs, which js/levels.js (loaded after every file in this folder)
// turns into the level catalog. Edit this file to change this course; no
// other file needs to know.
//
// One-way descent into an underground river system - track.js blends the
// dim cave-mouth theme into a vivid glowing-cavern theme as progress (t)
// sweeps from 0 to 1 (see CAVE_ZONES below and buildThemeResolver in
// track.js). Only theme.previewColor is used outside the zones (for the
// level-select card).
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  const CAVE_ZONES = [
    { t: 0.0, theme: { // Cave Mouth
      sky: 0x1a2038, fogNear: 60, fogFar: 320,
      waterShallow: 0x3a6a7a, waterDeep: 0x0a1a2a,
      bank: 0x1e2430, rock: 0x141a24, ground: 0x0c1218,
    } },
    { t: 1.0, theme: { // Glow Cavern
      sky: 0x2a1a48, fogNear: 50, fogFar: 300,
      waterShallow: 0x4affea, waterDeep: 0x1a2a6a,
      bank: 0x241a3a, rock: 0x1a1030, ground: 0x140a24,
    } },
  ];

  global.HT.LevelDefs.push({
    id: 'bioluminescent-cave',
    name: 'Bioluminescent Cave',
    description: 'A one-way plunge into an underground river - the dim cave mouth gives way to a vast glowing cavern lit by crystal and fungus alone. Deepest drop in the game; hang on through the falls.',
    difficulty: 'Hard',
    locked: false,
    voxel: true,
    loop: false,
    totalLaps: 1,
    halfWidth: 38,
    checkpointCount: 11,
    boostCount: 9,
    // Two jumps over sinkhole chasms deep in the cave system.
    ramps: [
      { t: 0.35, height: 5 },
      { t: 0.68, height: 5.5 },
    ],
    theme: { previewColor: '#4affea' },
    themeZones: CAVE_ZONES,
    // Descends further than any other course (-345) - a real cave-system
    // plunge rather than a gentle slope, with a long mid-run cascade.
    controlPoints: [
      [0, 0, 0], [150, -10, 70], [300, -25, 130], [420, -50, 90],
      [500, -80, -20], [540, -115, -160], [480, -150, -280], [340, -180, -340],
      [160, -205, -300], [20, -230, -180], [40, -255, -20], [180, -280, 100],
      [340, -300, 180], [500, -315, 120], [600, -330, -20], [560, -345, -180],
    ],
  });
})(window);
