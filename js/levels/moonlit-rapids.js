// Moonlit Rapids - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'moonlit-rapids',
    name: 'Moonlit Rapids',
    description: 'A long night run down a moonlit river, past one blind sharp bend. A tight side-channel through the rocks saves real distance - if you can hold it.',
    difficulty: 'Hard',
    locked: false,
    voxel: false,
    loop: false,
    totalLaps: 1,
    halfWidth: 42,
    rampT: 0.2,
    rampWindow: 0.014,
    checkpointCount: 13,
    boostCount: 10,
    theme: {
      sky: 0x1c2540, fogNear: 130, fogFar: 620,
      waterShallow: 0x4a6fa5, waterDeep: 0x0a1830,
      bank: 0x1f3a2a, rock: 0x2a2f3a, ground: 0x0f1a2a,
      previewColor: '#4a6fa5',
    },
    controlPoints: [
      [0, 0, -30], [190, -6, 70], [400, -14, 150], [620, -24, 100],
      [800, -34, -50], [900, -44, -220], [1020, -55, -360], [1220, -66, -400],
      [1420, -76, -340], [1600, -86, -200], [1680, -92, 80], [1720, -98, 280],
      [1820, -104, 140], [1920, -112, 0], [2100, -122, 60], [2280, -132, 20],
      [2460, -142, -100], [2640, -152, -180], [2820, -162, -100], [3000, -172, -200],
    ],
    // Same idea as Torrent Gauntlet's shortcut: cuts across the wide bend
    // at [1680..1920] that otherwise swings out to z=280.
    shortcuts: [
      { controlPoints: [[1605, -86, -195], [1780, -98, -60], [1925, -112, 5]], halfWidth: 18 },
    ],
  });
})(window);
