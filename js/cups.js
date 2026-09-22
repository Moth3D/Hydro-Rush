// Cup catalog - each cup is a fixed sequence of courses raced back to back
// in Cup mode (see js/main.js's startCup/advanceCup), with placement points
// (see CUP_POINTS below) tallied across every race to crown an overall
// winner. Levels are referenced by id (js/levels.js's HT.Levels.getById) so
// a cup roster never needs to duplicate a level's own definition.
(function (global) {

  const CUPS = [
    {
      id: 'rookie-cup',
      name: 'Rookie Cup',
      description: 'Four easygoing courses to learn the ropes on - flat water, gentle turns, one jump apiece.',
      levelIds: ['thunder-cove', 'volcanic-rapids', 'arctic-straits', 'voxel-valley'],
    },
    {
      id: 'gauntlet-cup',
      name: 'Gauntlet Cup',
      description: 'Four of the toughest, most technical courses in the fleet - big drops, narrow shortcuts, no mercy.',
      levelIds: ['thunder-falls', 'canyon-run', 'serpent-falls', 'torrent-gauntlet'],
    },
    {
      id: 'epic-cup',
      name: 'Epic Cup',
      description: 'A grand tour of the four newest, most ambitious courses - storm-lashed cliffs, a glowing cave system, ruined temple terraces, and a desert canyon hiding a secret oasis.',
      levelIds: ['storm-coast', 'bioluminescent-cave', 'ancient-ruins', 'desert-oasis'],
    },
  ];

  // Classic arcade-racer placement scoring, 1st through 8th (racerCount
  // tops out at 20, so up to 19 AI + the player) - anything past 8th earns
  // no points but still counts as a finish for the standings table.
  const CUP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
  function pointsForPlace(place) {
    return CUP_POINTS[place - 1] || 0;
  }

  function getById(id) {
    return CUPS.find((c) => c.id === id) || null;
  }

  global.HT = global.HT || {};
  global.HT.Cups = { list: CUPS, getById, pointsForPlace };
})(window);
