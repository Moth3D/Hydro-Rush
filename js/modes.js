// Game mode catalog. Modes only change race rules (opponents, checkpoint
// behavior) - they apply on top of whichever level is chosen next, so this
// stays independent of levels.js/boats.js.
(function (global) {

  const MODES = [
    {
      id: 'race',
      name: 'Race',
      description: 'Beat a full grid of AI rivals to the finish line.',
      badge: 'AI',
      // Local co-op can join this grid alongside the AI - see js/coop.js and
      // js/main.js's Split Screen entry point, which filters the mode list
      // on this field (js/menu.js's setModeSelectFilter).
      supportsCoop: true,
    },
    {
      id: 'timeAttack',
      name: 'Time Attack',
      description: 'No opponents - just you, the clock, and the course.',
      badge: 'SOLO',
      // No AI grid to share and only one finish time to track - inherently
      // single-player, so Split Screen never offers it.
      supportsCoop: false,
    },
    {
      id: 'ringRace',
      name: 'Ring Race',
      description: 'Thread every checkpoint ring - they shrink as the run goes on. Precision over raw speed.',
      badge: 'PRECISION',
      supportsCoop: false,
    },
    {
      id: 'cup',
      name: 'Cup',
      description: 'Race a themed series of courses back to back against a full AI grid - placement points add up across every race to crown an overall champion.',
      badge: 'SERIES',
      supportsCoop: true,
    },
  ];

  function getById(id) {
    return MODES.find((m) => m.id === id) || MODES[1];
  }

  global.HT = global.HT || {};
  global.HT.Modes = { list: MODES, getById };
})(window);
