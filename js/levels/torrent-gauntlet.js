// Torrent Gauntlet - level definition. Registers itself into HT.LevelDefs,
// which js/levels.js (loaded after every file in this folder) turns into the
// level catalog. Edit this file to change this course; no other file needs
// to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'torrent-gauntlet',
    name: 'Torrent Gauntlet',
    description: 'A long, storm-swollen canyon run with one brutal hairpin bend. A narrow rapids shortcut cuts a wide loop in half for anyone brave enough to thread it.',
    difficulty: 'Hard',
    locked: false,
    voxel: true,
    loop: false,
    totalLaps: 1,
    halfWidth: 40,
    rampT: 0.45,
    rampWindow: 0.014,
    checkpointCount: 13,
    boostCount: 10,
    theme: {
      sky: 0x7d8fa3, fogNear: 110, fogFar: 550,
      waterShallow: 0xaee0e8, waterDeep: 0x1a3a4a,
      bank: 0x4a4f4a, rock: 0x33383a, ground: 0x2a2e30,
      previewColor: '#aee0e8',
    },
    controlPoints: [
      [0, 0, 20], [180, -8, 100], [380, -18, 160], [580, -30, 120],
      [760, -42, 20], [880, -55, -120], [900, -65, -280], [1020, -78, -400],
      [1200, -90, -440], [1400, -102, -380], [1600, -115, -260], [1780, -128, -120],
      [1850, -134, 120], [1900, -140, 320], [2000, -148, 180], [2100, -155, 40],
      [2280, -165, 100], [2460, -178, 60], [2640, -190, -60], [2820, -200, -160],
    ],
    // Peels off just past the hairpin and cuts straight across the wide
    // bend at [1850..2100] instead of following it out to z=320 and back -
    // less than half the distance, but a rock-walled channel half the width.
    shortcuts: [
      { controlPoints: [[1785, -128, -115], [1950, -140, 20], [2095, -153, 35]], halfWidth: 18 },
    ],
  });
})(window);
