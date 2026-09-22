// Serpent Falls - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'serpent-falls',
    name: 'Serpent Falls',
    description: 'A wild jungle river plunging down a series of waterfalls. One-way - hang on and survive the drops.',
    difficulty: 'Hard',
    locked: false,
    voxel: true,
    loop: false,
    totalLaps: 1,
    halfWidth: 40,
    rampT: 0.42,
    rampWindow: 0.016,
    checkpointCount: 8,
    boostCount: 7,
    theme: {
      sky: 0x7fc9a0, fogNear: 90, fogFar: 500,
      waterShallow: 0x3fe0c0, waterDeep: 0x0c3a38,
      bank: 0x2f6b3a, rock: 0x4a463f, ground: 0x1e4a28,
      previewColor: '#3fe0c0',
    },
    controlPoints: [
      [0, 0, 0], [140, -8, 60], [270, -20, 130], [380, -70, 110],
      [470, -85, 40], [560, -95, -40], [690, -100, -90], [820, -160, -70],
      [950, -175, 10], [1080, -185, 90], [1210, -230, 130], [1340, -245, 60],
      [1470, -255, -30], [1600, -260, -110],
    ],
  });
})(window);
