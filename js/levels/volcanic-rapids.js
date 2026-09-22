// Volcanic Rapids - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'volcanic-rapids',
    name: 'Volcanic Rapids',
    description: 'Molten canyon straights with narrow, twisting rapids.',
    difficulty: 'Medium',
    locked: false,
    totalLaps: 3,
    halfWidth: 36,
    rampT: 0.4,
    rampWindow: 0.016,
    checkpointCount: 8,
    boostCount: 5,
    theme: {
      sky: 0xffa15c, fogNear: 150, fogFar: 700,
      waterShallow: 0xd98a4a, waterDeep: 0x3a1508,
      bank: 0x3a2a24, rock: 0xb33a1e, ground: 0x241512,
      previewColor: '#ff7a3d',
    },
    controlPoints: [
      [231, 0], [202, 97], [132, 166], [26, 114], [-41, 179],
      [-132, 165], [-229, 110], [-149, 0], [-140, -67], [-105, -131],
      [-58, -256], [44, -192], [105, -132], [113, -55],
    ],
  });
})(window);
