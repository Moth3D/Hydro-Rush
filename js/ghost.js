// Local "best run" ghost: the recorded path of your fastest solo attempt on
// a course/mode, replayed as a translucent non-colliding boat alongside a
// later attempt (see js/main.js's ghost recording/playback in frame()).
// One ghost per (course, mode), always the CURRENT best - overwritten
// whenever js/scoreboard.js records a new #1 time for that pair. Solo only;
// enforced by the caller (js/main.js), not this module.
(function (global) {
  const STORAGE_KEY = 'hydrorush.ghosts';

  let data = {};

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw) || {};
    } catch (e) {
      data = {};
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Storage unavailable (or quota exceeded by a very long recording) -
      // the ghost just won't persist this session.
    }
  }

  // samples: array of [elapsedSeconds, x, y, z, heading], time-ordered.
  // boatId: which boat set this run, so the ghost renders as that model
  // rather than whatever the player currently has selected.
  function saveGhost(levelId, modeId, boatId, samples) {
    if (!samples || !samples.length) return;
    if (!data[levelId]) data[levelId] = {};
    data[levelId][modeId] = { boatId, samples };
    save();
  }

  function getGhost(levelId, modeId) {
    return (data[levelId] || {})[modeId] || null;
  }

  load();

  global.HT = global.HT || {};
  global.HT.Ghosts = { saveGhost, getGhost };
})(window);
