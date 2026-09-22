// Persisted user settings (volume, invert steering, etc). Falls back to
// in-memory defaults if localStorage is unavailable (e.g. some file:// contexts).
(function (global) {
  const STORAGE_KEY = 'hydrorush.settings';
  // Each action maps to up to two KeyboardEvent.code values (a primary and
  // an alternate, matching what the game always shipped with - e.g. arrows
  // + WASD) - see js/input.js for how these are read, and js/menu.js for
  // the rebinding UI on the Controls screen.
  const DEFAULT_KEY_BINDINGS = {
    steerLeft: ['ArrowLeft', 'KeyA'],
    steerRight: ['ArrowRight', 'KeyD'],
    throttle: ['ArrowUp', 'KeyW'],
    brake: ['ArrowDown', 'KeyS'],
    boost: ['Space', 'ShiftLeft'],
    pause: ['Escape', 'KeyP'],
    restart: ['KeyR', null],
    camera: ['KeyC', null],
  };
  // Gamepad button rebinding (see js/input.js for how these are read and
  // js/menu.js for the rebinding UI). Steering (left stick + D-pad) isn't
  // included here - it's the natural analog control and stays fixed, same
  // as the D-pad doubling as digital throttle/brake regardless of these.
  // Standard-mapping button indices: 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT
  // 8=Back 9=Start 10=L3 11=R3 12=D-Up 13=D-Down 14=D-Left 15=D-Right.
  const DEFAULT_GAMEPAD_BINDINGS = {
    throttle: 7,
    brake: 1,
    boost: 0,
    camera: 3,
    pause: 9,
    restart: null,
  };
  const DEFAULTS = {
    masterVolume: 0.8,
    musicVolume: 0.6,
    // Separate from masterVolume - the engine drone runs continuously for
    // the whole race, unlike one-shot SFX, so it's worth tuning on its own
    // (see js/audio.js's updateEngine and the Options screen).
    engineVolume: 0.6,
    muted: false,
    invertSteering: false,
    selectedBoatId: 'red-fury',
    aiDifficulty: 'medium',
    keyBindings: DEFAULT_KEY_BINDINGS,
    gamepadBindings: DEFAULT_GAMEPAD_BINDINGS,
    // Per-boat color customizations, keyed by boat id - only ever holds an
    // entry for a boat the player has actually recolored (see js/boats.js,
    // which applies these on top of each boat's own catalog defaults).
    boatColors: {},
    // Per-boat gimmick pick, keyed by boat id - only for the boats that
    // ship with no built-in gimmick (see js/boats.js's GIMMICK_OPTIONS and
    // CUSTOMIZABLE_GIMMICK_IDS). Stores the chosen option's id (e.g.
    // 'reinforced'); absent/'none' means stock, no gimmick.
    boatGimmicks: {},
    // Total racers in Race mode, player included (see js/menu.js's level
    // select and js/ai.js) - stored as the total the player picks from
    // (4/8/12/16/20), not the AI-only count that's actually derived from it.
    racerCount: 4,
    // Health fraction (0-1) below which the health bar's low-health pulse
    // and the overheat warning banner switch to their more urgent "danger"
    // styling - see js/hud.js. Adjustable on the Options screen.
    healthDangerThreshold: 0.25,
    // Accessibility (Options screen, applied by js/menu.js's
    // applyAccessibilitySettings - this file stays a plain data store with
    // no DOM code of its own).
    // Swaps the health bar's red->green gradient for red->blue, the
    // standard colorblind-safe substitute (green is what's easily confused
    // with red; blue reads as distinct from both). Scoped to just that one
    // bar - see js/menu.js's applyAccessibilitySettings for why the wider
    // UI (checkpoint colors, boost bar) is left alone.
    colorblindMode: false,
    // Menu/options-screen scale, 1.0-1.3 - a plain CSS transform on each
    // .menu-overlay (see css/style.css), deliberately capped at >=1.0
    // (never shrinks) so it can never reveal a gap around an overlay's own
    // edges, and deliberately NOT applied to the in-race HUD - .player-hud
    // is a fixed-size, overflow:hidden box per split-screen viewport, and
    // naively scaling it clips content rather than growing it cleanly.
    uiScale: 1,
  };

  const data = Object.assign({}, DEFAULTS);

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(data, DEFAULTS, JSON.parse(raw));
    } catch (e) {
      // Storage unavailable - keep defaults.
    }
    // Object.assign only replaces keyBindings wholesale if a saved blob has
    // one at all - backfill any action a saved (possibly older) blob is
    // missing, so adding a new rebindable action later doesn't leave
    // existing players with it silently unbound.
    data.keyBindings = Object.assign({}, DEFAULT_KEY_BINDINGS, data.keyBindings);
    data.gamepadBindings = Object.assign({}, DEFAULT_GAMEPAD_BINDINGS, data.gamepadBindings);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Ignore - settings just won't persist this session.
    }
  }

  function set(key, value) {
    data[key] = value;
    save();
  }

  function get(key) {
    return data[key];
  }

  // Sets one slot (0 = primary, 1 = alternate) of one action's binding,
  // leaving the other slot and every other action untouched.
  function setKeyBinding(action, slotIndex, code) {
    const bindings = Object.assign({}, data.keyBindings);
    const slots = (bindings[action] || DEFAULT_KEY_BINDINGS[action] || []).slice();
    slots[slotIndex] = code;
    bindings[action] = slots;
    data.keyBindings = bindings;
    save();
  }

  function resetKeyBindings() {
    data.keyBindings = Object.assign({}, DEFAULT_KEY_BINDINGS);
    save();
  }

  // A gamepad button can only ever do one job at a time (unlike keyboard
  // actions, which get two independent slots) - rebinding an action to a
  // button already used by another action just swaps the two so both stay
  // usable instead of silently going dead.
  function setGamepadBinding(action, buttonIndex) {
    const bindings = Object.assign({}, data.gamepadBindings);
    const collidingAction = Object.keys(bindings).find(
      (a) => a !== action && bindings[a] === buttonIndex
    );
    if (collidingAction) bindings[collidingAction] = bindings[action];
    bindings[action] = buttonIndex;
    data.gamepadBindings = bindings;
    save();
  }

  function resetGamepadBindings() {
    data.gamepadBindings = Object.assign({}, DEFAULT_GAMEPAD_BINDINGS);
    save();
  }

  function setBoatColors(boatId, colors) {
    const map = Object.assign({}, data.boatColors);
    map[boatId] = Object.assign({}, colors);
    data.boatColors = map;
    save();
  }

  function getBoatColors(boatId) {
    return (data.boatColors && data.boatColors[boatId]) || null;
  }

  function clearBoatColors(boatId) {
    const map = Object.assign({}, data.boatColors);
    delete map[boatId];
    data.boatColors = map;
    save();
  }

  function setBoatGimmick(boatId, optionId) {
    const map = Object.assign({}, data.boatGimmicks);
    if (optionId && optionId !== 'none') map[boatId] = optionId;
    else delete map[boatId];
    data.boatGimmicks = map;
    save();
  }

  function getBoatGimmick(boatId) {
    return (data.boatGimmicks && data.boatGimmicks[boatId]) || 'none';
  }

  load();

  global.HT = global.HT || {};
  global.HT.Settings = {
    data, set, get, DEFAULTS,
    DEFAULT_KEY_BINDINGS, setKeyBinding, resetKeyBindings,
    DEFAULT_GAMEPAD_BINDINGS, setGamepadBinding, resetGamepadBindings,
    setBoatColors, getBoatColors, clearBoatColors,
    setBoatGimmick, getBoatGimmick,
  };
})(window);
