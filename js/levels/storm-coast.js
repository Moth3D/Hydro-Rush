// Storm Coast - level definition. Registers itself into HT.LevelDefs, which
// js/levels.js (loaded after every file in this folder) turns into the level
// catalog. Edit this file to change this course; no other file needs to know.
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  global.HT.LevelDefs.push({
    id: 'storm-coast',
    name: 'Storm Coast',
    description: 'A lightning-lit night run along a battered sea cliff - hug the rocks through a stormy cove, then launch clean off the cliff edge into the churning open water below.',
    difficulty: 'Hard',
    locked: false,
    loop: true,
    totalLaps: 3,
    halfWidth: 46,
    checkpointCount: 12,
    boostCount: 10,
    // Two jumps: a big cliff-edge launch coming out of the low cove, and a
    // smaller hop off a rock shelf on the way back up the coast.
    ramps: [
      { t: 0.28, height: 6, halfDepth: 15 },
      { t: 0.72, height: 4.5, halfDepth: 13 },
    ],
    theme: {
      sky: 0x1c2436, fogNear: 90, fogFar: 480,
      waterShallow: 0x2a5f6e, waterDeep: 0x081826,
      bank: 0x2e3440, rock: 0x1a1f28, ground: 0x141a22,
      previewColor: '#4a90a8',
    },
    // A cliff-hugging loop: starts high along the coast, drops into a low
    // storm-battered cove (the first ramp launches back out of it), swings
    // wide across open water, then climbs back along the rocks to the start.
    controlPoints: [
      [0, 0, -320], [240, -5, -380], [460, -20, -340], [600, -55, -180],
      [640, -70, 40], [560, -50, 260], [370, -15, 400], [120, 5, 450],
      [-140, 0, 410], [-380, -10, 260], [-540, -30, 50], [-580, -60, -170],
      [-440, -45, -360], [-210, -15, -420],
    ],
  });
})(window);
