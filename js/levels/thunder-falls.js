// Thunder Falls - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'thunder-falls',
    name: 'Thunder Falls',
    description: 'A vertical voxel canyon loop with one massive waterfall drop.',
    difficulty: 'Hard',
    locked: false,
    voxel: true,
    totalLaps: 3,
    halfWidth: 38,
    rampT: 0.85,
    rampWindow: 0.016,
    checkpointCount: 8,
    boostCount: 6,
    theme: {
      sky: 0x6f8fae, fogNear: 120, fogFar: 600,
      waterShallow: 0x2f8fae, waterDeep: 0x0a2a3a,
      bank: 0x3f5a3f, rock: 0x5a4a3a, ground: 0x2a3a2a,
      previewColor: '#8fd3ff',
    },
    controlPoints: [
      [242, 0, 0], [232, -3, 134], [109, -18, 189], [0, -42, 192],
      [-121, -55, 209], [-232, -52, 134], [-218, -38, 0], [-166, -18, -96],
      [-121, -6, -209], [0, 0, -268], [109, 0, -189], [166, 0, -96],
    ],
  });
})(window);
