// World Tour - level definition. Registers itself into HT.LevelDefs, which
// js/levels.js (loaded after every file in this folder) turns into the level
// catalog. Edit this file to change this course; no other file needs to know.
//
// This is a long loop that travels through four distinct regions rather than
// one fixed look - track.js blends smoothly between the zones below as the
// boat's progress (t) sweeps around the course. Only theme.previewColor is
// used outside the zones (for the level-select card).
(function (global) {
  global.HT = global.HT || {};
  global.HT.LevelDefs = global.HT.LevelDefs || [];

  const WORLD_TOUR_ZONES = [
    { t: 0.0, theme: { // Coastal Sunrise
      sky: 0xffd9a0, fogNear: 260, fogFar: 1100,
      waterShallow: 0x3fd1c9, waterDeep: 0x0b5f7a,
      bank: 0xdec089, rock: 0x8a7a5c, ground: 0x3f6b4a,
    } },
    { t: 0.25, theme: { // Canyon Pass
      sky: 0xe8935c, fogNear: 160, fogFar: 750,
      waterShallow: 0x5cae9c, waterDeep: 0x1f3a2a,
      bank: 0x8a6a4a, rock: 0x6a4a34, ground: 0x4a3624,
    } },
    { t: 0.5, theme: { // Arctic Reach
      sky: 0xcfe9f5, fogNear: 220, fogFar: 950,
      waterShallow: 0x8fd9e8, waterDeep: 0x1c4f66,
      bank: 0xe8f4fb, rock: 0x8fa8b8, ground: 0xdfefff,
    } },
    { t: 0.75, theme: { // Volcanic Return
      sky: 0xff8a5c, fogNear: 140, fogFar: 650,
      waterShallow: 0xd98a4a, waterDeep: 0x3a1508,
      bank: 0x3a2a24, rock: 0xb33a1e, ground: 0x241512,
    } },
  ];

  global.HT.LevelDefs.push({
    id: 'world-tour',
    name: 'World Tour',
    description: 'A grand loop through four regions - sunlit coast, dusty canyon, arctic ice and volcanic fire. Long haul, three laps.',
    difficulty: 'Hard',
    locked: false,
    totalLaps: 3,
    halfWidth: 46,
    rampT: 0.4,
    rampWindow: 0.014,
    checkpointCount: 12,
    boostCount: 10,
    theme: { previewColor: '#ffd23f' },
    themeZones: WORLD_TOUR_ZONES,
    controlPoints: [
      [0, 0, -520], [237, 0, -480], [438, 0, -368], [573, 0, -199],
      [620, -10, 0], [573, -35, 199], [438, -55, 368], [237, -40, 480],
      [0, -20, 520], [-237, -5, 480], [-438, 0, 368], [-573, 0, 199],
      [-620, -10, 0], [-573, -25, -199], [-438, -15, -368], [-237, -5, -480],
    ],
  });
})(window);
