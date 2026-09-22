// Local best-times scoreboard: top 5 finish times per (course, mode),
// persisted in localStorage. Recorded from js/main.js's finishRaceOverall
// for Race/Time Attack/Ring Race only - Cup mode already has its own
// standings/points system (js/cups.js, the cup-standings screen) and isn't
// a single course anyway, so it's deliberately not part of this board.
(function (global) {
  const STORAGE_KEY = 'hydrorush.scoreboard';
  const MAX_ENTRIES = 5;
  const MODE_IDS = ['race', 'timeAttack', 'ringRace'];

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
      // Storage unavailable - scores just won't persist this session.
    }
  }

  // Returns entries sorted fastest-first, oldest data first as a tiebreak.
  // Never mutates the stored array - callers are free to modify the result.
  function getEntries(levelId, modeId) {
    return ((data[levelId] || {})[modeId] || []).slice();
  }

  // entry: { boatId, timeSeconds, date } (date = Date.now()). Returns the
  // 1-based rank (1-MAX_ENTRIES) the new time earned in the saved list, or
  // null if it didn't crack the top MAX_ENTRIES.
  function recordTime(levelId, modeId, entry) {
    if (MODE_IDS.indexOf(modeId) === -1) return null;
    if (!data[levelId]) data[levelId] = {};
    const list = (data[levelId][modeId] || []).slice();
    list.push(entry);
    list.sort((a, b) => a.timeSeconds - b.timeSeconds);
    list.length = Math.min(list.length, MAX_ENTRIES);
    data[levelId][modeId] = list;
    save();
    const rank = list.indexOf(entry);
    return rank === -1 ? null : rank + 1;
  }

  // Wipes every mode's saved times for one course (the Scoreboard screen's
  // "Clear Scores" button - scoped to the course currently being viewed
  // rather than the whole board, so clearing a mistake on one course never
  // costs times set on every other course too).
  function clearLevel(levelId) {
    delete data[levelId];
    save();
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }

  load();

  global.HT = global.HT || {};
  global.HT.Scoreboard = { MODE_IDS, getEntries, recordTime, clearLevel, formatTime };
})(window);
