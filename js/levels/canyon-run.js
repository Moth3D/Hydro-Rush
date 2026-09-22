// Canyon Run - level definition. Registers itself into HT.LevelDefs, which
// js/levels.js (loaded after every file in this folder) turns into the level
// catalog. Edit this file to change this course; no other file needs to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'canyon-run',
    name: 'Canyon Run',
    description: 'A one-way sprint down a collapsing voxel canyon. No laps - just survive to the finish.',
    difficulty: 'Hard',
    locked: false,
    voxel: true,
    loop: false,
    totalLaps: 1,
    halfWidth: 44,
    rampT: 0.3,
    rampWindow: 0.016,
    checkpointCount: 8,
    boostCount: 7,
    theme: {
      sky: 0xe8935c, fogNear: 100, fogFar: 550,
      waterShallow: 0x5cc9d9, waterDeep: 0x123a4a,
      bank: 0x8a6a4a, rock: 0x6a4a34, ground: 0x4a3624,
      previewColor: '#ffb37a',
    },
    controlPoints: [
      [0, 0, 37], [130, -6, 122], [260, -14, 56], [390, -55, 8],
      [520, -70, -23], [650, -78, -114], [780, -86, -86], [910, -125, 41],
      [1040, -138, 65], [1170, -145, 67], [1300, -150, 80], [1430, -156, -31],
      [1560, -160, -119],
    ],
  });
})(window);
