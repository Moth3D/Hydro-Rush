// Local co-op lobby: who's joined, from which controller, and the dedicated
// "press A to join" input loop for the Players screen. Deliberately NOT
// wired through js/navigation.js's single-focus menu system (see the
// SCREENS map there) - this screen needs to read every connected gamepad
// simultaneously, not move one shared cursor, so it gets its own tiny
// polling loop instead.
//
// joinedPlayers only exists for the lobby (this screen); main.js turns it
// into the live in-race `players` array once boats are picked (see
// buildPlayers below and main.js's makeCoopPlayers).
(function (global) {
  const MAX_PLAYERS = 4;
  // One fixed accent per join slot (not per boat) - lets two players who
  // pick the same boat model still be told apart at a glance (minimap dot,
  // HUD label) - see the plan's note on the boat-color catalog being shared
  // by reference, which makes two same-model boats otherwise identical.
  const PLAYER_COLORS = [0xff4d4d, 0x4d7bff, 0x4dff88, 0xffe14d];

  let joinedPlayers = [];
  let joinScreenActive = false;
  let onChangeCallback = null;
  let onStartCallback = null;
  let onBackCallback = null;

  function resetJoin() {
    joinedPlayers = [];
    if (onChangeCallback) onChangeCallback();
  }

  function getJoinedPlayers() {
    return joinedPlayers;
  }

  function setCallbacks(cbs) {
    onChangeCallback = cbs.onChange || null;
    onStartCallback = cbs.onStart || null;
    onBackCallback = cbs.onBack || null;
  }

  function setJoinScreenActive(active) {
    joinScreenActive = active;
    if (active && onChangeCallback) onChangeCallback();
  }

  function join(entry) {
    if (joinedPlayers.length >= MAX_PLAYERS) return null;
    const p = Object.assign({ boatId: null }, entry);
    joinedPlayers.push(p);
    if (onChangeCallback) onChangeCallback();
    return p;
  }

  function leave(entry) {
    const idx = joinedPlayers.indexOf(entry);
    if (idx === -1) return;
    joinedPlayers.splice(idx, 1);
    if (onChangeCallback) onChangeCallback();
  }

  function accentColor(slot) {
    return PLAYER_COLORS[slot % PLAYER_COLORS.length];
  }

  // ---- Dedicated raw gamepad polling for the join screen only ----
  // A or Start = join if not yet in; either one also begins the race once
  // already joined (matching the keyboard fallback below, where Enter/Space
  // both do double duty the same way) - B = leave. Independent of
  // js/input.js (built for exactly-one-poller-per-player, not "scan
  // everything at once") and js/navigation.js's single-gpIndex menu focus
  // (which would otherwise also read this same A press as "activate the
  // focused button").
  const prevA = {}, prevStart = {}, prevB = {};
  function pollJoinScreen() {
    requestAnimationFrame(pollJoinScreen);
    if (!joinScreenActive) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp) { prevA[i] = false; prevStart[i] = false; prevB[i] = false; continue; }
      const a = !!(gp.buttons[0] && gp.buttons[0].pressed);
      const start = !!(gp.buttons[9] && gp.buttons[9].pressed);
      const b = !!(gp.buttons[1] && gp.buttons[1].pressed);
      const already = joinedPlayers.find((p) => p.controllerType === 'gamepad' && p.gamepadIndex === i);
      if ((a && !prevA[i]) || (start && !prevStart[i])) {
        if (already) {
          if (onStartCallback) onStartCallback();
        } else {
          join({ controllerType: 'gamepad', gamepadIndex: i });
        }
      }
      if (b && !prevB[i]) {
        // Already joined: B leaves. Not joined yet: B backs out to Mode
        // Select instead, so a lone gamepad user always has a way off this
        // screen without needing the mouse.
        if (already) leave(already);
        else if (onBackCallback) onBackCallback();
      }
      prevA[i] = a; prevStart[i] = start; prevB[i] = b;
    }
  }
  requestAnimationFrame(pollJoinScreen);

  // Keyboard fallback - Enter/Space claims (or, already-joined, starts) a
  // single keyboard slot; Escape leaves it, or - if no keyboard player has
  // joined yet - backs all the way out to Mode Select, so a keyboard-only
  // user with no gamepad always has a way off this screen without a mouse.
  window.addEventListener('keydown', (e) => {
    if (!joinScreenActive) return;
    if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'Escape') return;
    const already = joinedPlayers.find((p) => p.controllerType === 'keyboard');
    if (e.code === 'Escape') {
      if (already) leave(already);
      else if (onBackCallback) onBackCallback();
      return;
    }
    if (already) { if (onStartCallback) onStartCallback(); }
    else join({ controllerType: 'keyboard', gamepadIndex: null });
  });

  global.HT = global.HT || {};
  global.HT.Coop = {
    MAX_PLAYERS, PLAYER_COLORS,
    resetJoin, getJoinedPlayers, join, leave, setCallbacks, setJoinScreenActive, accentColor,
  };
})(window);
