// Thunder Cove - level definition. Registers itself into HT.LevelDefs, which
// js/levels.js (loaded after every file in this folder) turns into the level
// catalog. Edit this file to change this course; no other file needs to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'thunder-cove',
    name: 'Thunder Cove',
    description: 'A winding coastal river loop with one big air jump.',
    difficulty: 'Easy',
    locked: false,
    totalLaps: 3,
    halfWidth: 42,
    rampT: 0.55,
    rampWindow: 0.018,
    checkpointCount: 8,
    boostCount: 6,
    theme: {
      sky: 0x8fd3ff, fogNear: 220, fogFar: 950,
      waterShallow: 0x2fb7c7, waterDeep: 0x0b4f7a,
      bank: 0x4a7c3f, rock: 0x7a6a58, ground: 0x2f5a33,
      previewColor: '#6dffb8',
    },
    controlPoints: [
      [0, -210], [130, -265], [265, -205], [325, -80],
      [265, 45], [325, 165], [200, 265], [40, 225],
      [-125, 285], [-265, 180], [-305, 20], [-225, -120],
      [-100, -225],
    ],
  });
})(window);
