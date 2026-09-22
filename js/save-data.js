// Export/import for every localStorage-backed system in this game
// (settings, scoreboard, ghosts, achievements) as one JSON file - lets
// progress survive reinstalling the PWA, moving to a new browser/device,
// or just keeping a backup. Deliberately reads/writes the same raw storage
// keys those modules each own (see their own STORAGE_KEY) rather than
// routing through their APIs - js/menu.js forces a full page reload right
// after a successful import (see its own comment) so every module's own
// load() re-reads localStorage fresh, rather than this module trying to
// reach into four already-loaded in-memory `data` objects and keep them
// all in sync by hand.
(function (global) {
  const KEYS = ['hydrorush.settings', 'hydrorush.scoreboard', 'hydrorush.ghosts', 'hydrorush.achievements'];
  const FORMAT_VERSION = 1;

  function exportSaveData() {
    const data = {};
    KEYS.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      try {
        data[key] = JSON.parse(raw);
      } catch (e) {
        // Corrupt entry - skip it rather than fail the whole export.
      }
    });
    return {
      app: 'hydrorush',
      version: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  // parsed: the result of JSON.parse()ing an imported file - validated
  // here rather than trusting it, since it's arbitrary user-supplied
  // content. Returns { ok: true, keys: [...] } (keys actually written) or
  // { ok: false, error: string }.
  function importSaveData(parsed) {
    if (!parsed || typeof parsed !== 'object' || parsed.app !== 'hydrorush' || !parsed.data || typeof parsed.data !== 'object') {
      return { ok: false, error: "That doesn't look like a Hydro Rush save file." };
    }
    const found = KEYS.filter((k) => parsed.data[k] !== undefined);
    if (!found.length) {
      return { ok: false, error: 'That save file has no recognizable data in it.' };
    }
    found.forEach((key) => {
      try {
        localStorage.setItem(key, JSON.stringify(parsed.data[key]));
      } catch (e) {
        // Storage unavailable/quota exceeded - best effort on the rest.
      }
    });
    return { ok: true, keys: found };
  }

  global.HT = global.HT || {};
  global.HT.SaveData = { exportSaveData, importSaveData };
})(window);
