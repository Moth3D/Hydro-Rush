// Arctic Straits - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'arctic-straits',
    name: 'Arctic Straits',
    description: 'Ice floes and frigid open water. Watch for icebergs.',
    difficulty: 'Hard',
    locked: false,
    totalLaps: 3,
    halfWidth: 50,
    rampT: 0.68,
    rampWindow: 0.016,
    checkpointCount: 8,
    boostCount: 7,
    theme: {
      sky: 0xcfe9f5, fogNear: 180, fogFar: 800,
      waterShallow: 0x8fd9e8, waterDeep: 0x1c4f66,
      bank: 0xdfefff, rock: 0x8fa8b8, ground: 0xe8f4fb,
      previewColor: '#8fe0ff',
    },
    controlPoints: [
      [301, 0], [296, 171], [157, 272], [0, 260], [-91, 158],
      [-201, 116], [-284, 0], [-298, -172], [-164, -284], [0, -235],
      [106, -183], [178, -103],
    ],
  });
})(window);
