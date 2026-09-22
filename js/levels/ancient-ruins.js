// Ancient Ruins - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'ancient-ruins',
    name: 'Ancient Ruins',
    description: 'A lost temple complex reclaimed by jungle - the river cuts straight through crumbling stone terraces, launching between levels wherever a waterfall carved the old steps away.',
    difficulty: 'Medium',
    locked: false,
    voxel: true,
    loop: true,
    totalLaps: 3,
    halfWidth: 44,
    checkpointCount: 11,
    boostCount: 9,
    // A big leap between the upper and lower temple terraces, plus a
    // smaller hop further round the loop.
    ramps: [
      { t: 0.3, height: 6.5, halfDepth: 14 },
      { t: 0.65, height: 4.5 },
    ],
    theme: {
      sky: 0xcfe6a0, fogNear: 140, fogFar: 700,
      waterShallow: 0x4fd9a0, waterDeep: 0x0e4a3a,
      bank: 0x8a8272, rock: 0x6a6252, ground: 0x2a4a2a,
      previewColor: '#4fd9a0',
    },
    // A terraced loop - climbs and drops through the ruined complex twice
    // (once each way round) rather than one single big descent.
    controlPoints: [
      [0, 0, -280], [200, -15, -320], [400, -35, -280], [540, -55, -140],
      [580, -70, 40], [500, -55, 220], [340, -30, 340], [100, -10, 380],
      [-140, 0, 340], [-360, -20, 220], [-500, -45, 40], [-540, -65, -160],
      [-400, -50, -320], [-180, -20, -360],
    ],
  });
})(window);
