// Keyboard + Gamepad input, normalized into state objects.
//
// This is a factory, not a singleton: createPoller(source) returns an
// independent { poll, state } pair reading only from that one source, so
// local co-op can hand each human player their own poller (one per physical
// gamepad, or keyboard for whichever player has no pad). Solo play (Time
// Attack/Ring Race/the main-menu boat preview/etc.) keeps today's exact
// behavior - keyboard + touch + "whichever gamepad connected" all additively
// merged - via getDefaultSoloSource().
(function (global) {
  const keys = Object.create(null);

  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });

  // Tracks "whichever gamepad is connected" for solo play only - co-op
  // pollers are pinned to an explicit gamepadIndex resolved on the Players
  // join screen (see js/coop.js) instead of relying on this.
  let soloGamepadIndex = null;
  window.addEventListener('gamepadconnected', (e) => {
    if (soloGamepadIndex === null) soloGamepadIndex = e.gamepad.index;
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (soloGamepadIndex === e.gamepad.index) soloGamepadIndex = null;
  });

  function deadzone(v, dz) {
    return Math.abs(v) < dz ? 0 : v;
  }

  // Reads live from Settings every call rather than caching, so a rebind on
  // the Controls screen (see menu.js) takes effect immediately without
  // needing to reset anything - this object is small and poll() already
  // runs once a frame regardless, so the lookup cost is negligible.
  function getKeyBindings() {
    return (global.HT.Settings && global.HT.Settings.get('keyBindings')) || {};
  }

  function isActionKeyDown(action) {
    const codes = getKeyBindings()[action];
    if (!codes) return false;
    return codes.some((code) => code && keys[code]);
  }

  // Exposed so main.js's own pause-key listener (which fires once per
  // keydown event rather than every polled frame) can check against the
  // same user-configurable binding instead of a hardcoded key.
  function isBoundKey(action, code) {
    const codes = getKeyBindings()[action];
    return !!codes && codes.indexOf(code) !== -1;
  }

  // Same live-read pattern as getKeyBindings() - a rebind on the Controls
  // screen's gamepad section takes effect immediately.
  function getGamepadBindings() {
    return (global.HT.Settings && global.HT.Settings.get('gamepadBindings')) || {};
  }

  function buttonValue(gp, idx) {
    return idx != null && gp.buttons[idx] ? gp.buttons[idx].value : 0;
  }

  function buttonPressed(gp, idx) {
    return idx != null && !!gp.buttons[idx] && gp.buttons[idx].pressed;
  }

  // ---- Touch controls: on-screen buttons for steer/throttle/brake/boost ----
  // A touch screen is one physical surface, so it only ever feeds the
  // keyboard-type source (there's no "touch for player 2").
  const touch = { steerLeft: false, steerRight: false, throttle: false, brake: false, boost: false };

  function bindHoldButton(el, onChange) {
    if (!el) return;
    const setPressed = (pressed) => {
      el.classList.toggle('pressed', pressed);
      onChange(pressed);
    };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture && el.setPointerCapture(e.pointerId); setPressed(true); });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); setPressed(false); });
    el.addEventListener('pointercancel', () => setPressed(false));
    el.addEventListener('pointerleave', () => setPressed(false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function initTouchControls() {
    const container = document.getElementById('touch-controls');
    if (!container) return;

    const isTouchDevice = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) container.classList.add('touch-enabled');

    bindHoldButton(document.getElementById('touch-steer-left'), (p) => { touch.steerLeft = p; });
    bindHoldButton(document.getElementById('touch-steer-right'), (p) => { touch.steerRight = p; });
    bindHoldButton(document.getElementById('touch-throttle'), (p) => { touch.throttle = p; });
    bindHoldButton(document.getElementById('touch-brake'), (p) => { touch.brake = p; });
    bindHoldButton(document.getElementById('touch-boost'), (p) => { touch.boost = p; });

    // Controls stay invisible until the screen is actually touched, then
    // fade back out a couple of seconds after every finger lifts, so they
    // don't sit as a permanent overlay across the racing view when the
    // player isn't actively using them.
    if (isTouchDevice) {
      let hideTimer = null;
      const show = () => {
        container.classList.add('touch-visible');
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      };
      const scheduleHide = () => {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => container.classList.remove('touch-visible'), 2500);
      };
      window.addEventListener('touchstart', show, { passive: true });
      // touches.length is the count still down AFTER this one lifts - only
      // start the fade-out once every finger is up, so e.g. steering with
      // one hand while holding throttle with the other doesn't hide mid-turn
      // just because the steering finger happened to lift first.
      window.addEventListener('touchend', (e) => { if (e.touches.length === 0) scheduleHide(); }, { passive: true });
      window.addEventListener('touchcancel', (e) => { if (e.touches.length === 0) scheduleHide(); }, { passive: true });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchControls);
  } else {
    initTouchControls();
  }

  // source: { type: 'solo' }                          - keyboard+touch+whichever gamepad connected (today's exact behavior)
  //       | { type: 'keyboard' }                       - keyboard+touch only, no gamepad
  //       | { type: 'gamepad', gamepadIndex: number }  - one specific physical pad only, no keyboard/touch
  function createPoller(source) {
    const state = {
      steer: 0,      // -1 (left) .. 1 (right)
      throttle: 0,   // 0 .. 1
      brake: 0,      // 0 .. 1
      boost: false,
      restart: false,
      pause: false,
      cycleCamera: false,
    };

    let restartWasDown = false;
    let pauseWasDown = false;
    let cameraWasDown = false;

    function readGamepad(gamepadIndex, steer, throttle, brake, boost) {
      let pauseDown = false, cameraDown = false, restartDown = false;
      if (gamepadIndex !== null && gamepadIndex !== undefined) {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = pads[gamepadIndex];
        if (gp) {
          const gb = getGamepadBindings();

          const axisX = deadzone(gp.axes[0] || 0, 0.15);
          steer = Math.max(-1, Math.min(1, steer + axisX));
          if (gp.buttons[14] && gp.buttons[14].pressed) steer = Math.max(-1, steer - 1); // D-pad left
          if (gp.buttons[15] && gp.buttons[15].pressed) steer = Math.min(1, steer + 1); // D-pad right

          const throttleVal = buttonValue(gp, gb.throttle);
          const dpadUp = gp.buttons[12] && gp.buttons[12].pressed ? 1 : 0;
          throttle = Math.max(throttle, throttleVal, dpadUp);

          const brakeVal = buttonValue(gp, gb.brake);
          const dpadDown = gp.buttons[13] && gp.buttons[13].pressed ? 1 : 0;
          brake = Math.max(brake, brakeVal, dpadDown);

          if (buttonPressed(gp, gb.boost)) boost = true;

          pauseDown = buttonPressed(gp, gb.pause);
          cameraDown = buttonPressed(gp, gb.camera);
          restartDown = buttonPressed(gp, gb.restart);
        }
      }
      return { steer, throttle, brake, boost, pauseDown, cameraDown, restartDown };
    }

    function poll() {
      let steer = 0, throttle = 0, brake = 0, boost = false;
      let keyRestartDown = false;
      let pauseDown = false, cameraDown = false, gamepadRestartDown = false;

      if (source.type === 'solo' || source.type === 'keyboard') {
        // Keyboard - bindings are user-configurable (see js/menu.js's Controls
        // screen and js/settings.js), so these read the current binding
        // rather than a fixed key.
        if (isActionKeyDown('steerLeft')) steer -= 1;
        if (isActionKeyDown('steerRight')) steer += 1;
        if (isActionKeyDown('throttle')) throttle = 1;
        if (isActionKeyDown('brake')) brake = 1;
        if (isActionKeyDown('boost')) boost = true;
        keyRestartDown = isActionKeyDown('restart');

        // Touch
        if (touch.steerLeft) steer -= 1;
        if (touch.steerRight) steer += 1;
        if (touch.throttle) throttle = 1;
        if (touch.brake) brake = 1;
        if (touch.boost) boost = true;
      }

      // Gamepad: left stick or D-pad always steers (kept fixed - it's the
      // natural analog control), everything else reads from the user's
      // configurable gamepadBindings (see js/settings.js and js/menu.js's
      // Controls screen), defaulting to the classic Xbox-style layout: right
      // trigger throttle, B reverse/brake, A boost, Y camera, Start pause.
      // D-pad up/down double as fully-digital throttle/brake regardless of
      // what's bound to the trigger/B, same idea as the D-pad doubling for
      // steering. Every joined controller shares this one binding set - see
      // the plan's non-goal on per-player rebinding.
      if (source.type === 'solo') {
        const r = readGamepad(soloGamepadIndex, steer, throttle, brake, boost);
        steer = r.steer; throttle = r.throttle; brake = r.brake; boost = r.boost;
        pauseDown = r.pauseDown; cameraDown = r.cameraDown; gamepadRestartDown = r.restartDown;
      } else if (source.type === 'gamepad') {
        const r = readGamepad(source.gamepadIndex, steer, throttle, brake, boost);
        steer = r.steer; throttle = r.throttle; brake = r.brake; boost = r.boost;
        pauseDown = r.pauseDown; cameraDown = r.cameraDown; gamepadRestartDown = r.restartDown;
      }

      if (global.HT.Settings && global.HT.Settings.get('invertSteering')) steer = -steer;

      const restartDown = keyRestartDown || gamepadRestartDown;

      state.steer = Math.max(-1, Math.min(1, steer));
      state.throttle = Math.max(0, Math.min(1, throttle));
      state.brake = Math.max(0, Math.min(1, brake));
      state.boost = boost;
      state.restart = restartDown && !restartWasDown;
      restartWasDown = restartDown;
      state.pause = pauseDown && !pauseWasDown;
      pauseWasDown = pauseDown;
      state.cycleCamera = cameraDown && !cameraWasDown;
      cameraWasDown = cameraDown;

      return state;
    }

    return { poll, state, source };
  }

  function getDefaultSoloSource() {
    return { type: 'solo' };
  }

  global.HT = global.HT || {};
  global.HT.Input = { createPoller, getDefaultSoloSource, isBoundKey };
})(window);
