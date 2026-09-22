// Voxel Valley - level definition. Registers itself into HT.LevelDefs, which
// js/levels.js (loaded after every file in this folder) turns into the level
// catalog. Edit this file to change this course; no other file needs to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'voxel-valley',
    name: 'Voxel Valley',
    description: 'A blocky world of stepped terraces and cube-built hills.',
    difficulty: 'Medium',
    locked: false,
    voxel: true,
    totalLaps: 3,
    halfWidth: 40,
    rampT: 0.5,
    rampWindow: 0.016,
    checkpointCount: 8,
    boostCount: 6,
    theme: {
      sky: 0x8ad9ff, fogNear: 260, fogFar: 900,
      waterShallow: 0x4fc3f7, waterDeep: 0x1565c0,
      bank: 0x6abe30, rock: 0x9c6b30, ground: 0x4a934a,
      previewColor: '#6abe30',
    },
    controlPoints: [
      [229, 0], [210, 152], [58, 178], [-62, 191], [-214, 156],
      [-211, 0], [-146, -106], [-78, -241], [74, -227], [142, -103],
    ],
  });
})(window);
