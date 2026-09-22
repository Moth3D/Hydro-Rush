// Local achievements/challenges: a fixed list of accomplishments unlocked by
// observable race events, persisted in localStorage. js/main.js calls the
// on*() hooks below at the exact points it already has this information
// (a finish, a cup win, a ghost beaten) - this module owns the unlock rules
// and the small bits of cross-race progress a few of them need (boats used,
// courses finished, cups won, total finishes). One shared profile, same as
// every other localStorage-backed system in this game (settings, scoreboard,
// ghosts) - no accounts, so co-op players contribute to the same progress.
(function (global) {
  const STORAGE_KEY = 'hydrorush.achievements';
  // Hardcoded rather than read from HT.Boats.list.length/HT.Levels.list.length
  // to avoid a load-order dependency (this file loads early, alongside
  // settings/scoreboard/ghost, well before boats.js/levels.js build their
  // catalogs) - see index.html's script order.
  const TOTAL_BOATS = 12;
  const TOTAL_COURSES = 14;
  const TOTAL_CUPS = 3;
  const CENTURY_TARGET = 100;

  const DEFS = [
    { id: 'first-win', name: 'First Win', description: 'Finish 1st in a Race.' },
    { id: 'cup-champion', name: 'Cup Champion', description: 'Win any Cup.' },
    { id: 'triple-crown', name: 'Triple Crown', description: 'Win all three Cups.' },
    { id: 'boat-collector', name: 'Boat Collector', description: 'Finish a race in every boat.' },
    { id: 'world-traveler', name: 'World Traveler', description: 'Finish every course at least once.' },
    { id: 'flawless', name: 'Flawless Victory', description: 'Finish a Race without a single collision.' },
    { id: 'mirror-master', name: 'Mirror Master', description: 'Win a Race in Mirror mode.' },
    { id: 'full-grid', name: 'Full Grid', description: 'Finish a race with 20 racers on the field.' },
    { id: 'ghost-hunter', name: 'Ghost Hunter', description: 'Beat your own best time on a course.' },
    { id: 'ring-master', name: 'Ring Master', description: 'Complete a Ring Race.' },
    { id: 'marathon', name: 'Marathon', description: 'Finish World Tour.' },
    { id: 'century-club', name: 'Century Club', description: `Finish ${CENTURY_TARGET} races total.` },
  ];
  const byId = {};
  DEFS.forEach((d) => { byId[d.id] = d; });

  const DEFAULT_DATA = {
    unlocked: {},          // id -> ISO date string
    boatsUsed: [],          // boat ids finished a race with, at least once
    coursesFinished: [],    // base level ids (mirrorOf || id) finished, at least once
    cupsWon: [],             // cup ids won outright (1st overall)
    totalFinishes: 0,
  };

  let data = Object.assign({}, DEFAULT_DATA);

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = Object.assign({}, DEFAULT_DATA, JSON.parse(raw));
    } catch (e) {
      data = Object.assign({}, DEFAULT_DATA);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Storage unavailable - progress just won't persist this session.
    }
  }

  function unlock(id, out) {
    if (data.unlocked[id]) return;
    data.unlocked[id] = new Date().toISOString();
    out.push(byId[id]);
  }

  function addUnique(arr, value) {
    if (value != null && arr.indexOf(value) === -1) arr.push(value);
  }

  // params: { modeId, levelId, mirrorOf, boatId, place, collisionCount,
  //           racerCount, mirrored }
  // place: this player's 1-based finish placement out of the whole grid,
  // Race mode only - null for Time Attack/Ring Race, which have no AI/other
  // humans to place against (see js/main.js's finishRaceOverall).
  // Returns the achievement defs newly unlocked by this one finish, so the
  // caller can show them (js/menu.js's announceAchievements).
  function onRaceFinish(params) {
    const out = [];
    data.totalFinishes++;
    if (data.totalFinishes >= CENTURY_TARGET) unlock('century-club', out);

    addUnique(data.boatsUsed, params.boatId);
    if (data.boatsUsed.length >= TOTAL_BOATS) unlock('boat-collector', out);

    const baseLevelId = params.mirrorOf || params.levelId;
    addUnique(data.coursesFinished, baseLevelId);
    if (data.coursesFinished.length >= TOTAL_COURSES) unlock('world-traveler', out);

    if (params.modeId === 'race') {
      if (params.place === 1) {
        unlock('first-win', out);
        if (params.mirrored) unlock('mirror-master', out);
      }
      if (params.collisionCount === 0) unlock('flawless', out);
      if (params.racerCount >= 20) unlock('full-grid', out);
    }
    if (params.modeId === 'ringRace') unlock('ring-master', out);
    if (baseLevelId === 'world-tour') unlock('marathon', out);

    save();
    return out;
  }

  function onCupWon(cupId) {
    const out = [];
    unlock('cup-champion', out);
    addUnique(data.cupsWon, cupId);
    if (data.cupsWon.length >= TOTAL_CUPS) unlock('triple-crown', out);
    save();
    return out;
  }

  function onGhostBeaten() {
    const out = [];
    unlock('ghost-hunter', out);
    save();
    return out;
  }

  function isUnlocked(id) { return !!data.unlocked[id]; }
  function getUnlockedDate(id) { return data.unlocked[id] || null; }

  // Coarse cross-race progress for the Achievements screen's in-progress
  // rows (e.g. "8/12 boats") - only the cumulative achievements need this;
  // the rest are plain unlocked/locked.
  function getProgress() {
    return {
      boatsUsed: data.boatsUsed.length, totalBoats: TOTAL_BOATS,
      coursesFinished: data.coursesFinished.length, totalCourses: TOTAL_COURSES,
      cupsWon: data.cupsWon.length, totalCups: TOTAL_CUPS,
      totalFinishes: data.totalFinishes, centuryTarget: CENTURY_TARGET,
    };
  }

  load();

  global.HT = global.HT || {};
  global.HT.Achievements = {
    list: DEFS, isUnlocked, getUnlockedDate, getProgress,
    onRaceFinish, onCupWon, onGhostBeaten,
  };
})(window);
