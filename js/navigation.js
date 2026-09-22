// Lets every menu/overlay screen be fully driven without a mouse - D-pad or
// left stick to move focus, A/Enter to activate, B/Escape to back out - not
// just clicked. js/menu.js's setScreen calls onScreenChange() below on every
// transition so this always knows which screen (if any) is active; it's a
// no-op while a race is actually playing; steering is untouched there.
(function (global) {

  // Which overlay(s) a screen's focusable controls live in, and which
  // element B/Escape should click as that screen's "back"/cancel action.
  // Keys match the screen names main.js passes to HT.Menu.setScreen.
  // 'players' (the local co-op join screen, js/coop.js) is deliberately NOT
  // listed here. It needs to read every connected gamepad at once (A to
  // join on THAT pad specifically), not move one shared cursor - if it were
  // registered like every other screen, this file's own single-gpIndex
  // pollGamepadNav loop below would ALSO treat that same A press as
  // "activate the focused button", double-handling it. js/coop.js runs its
  // own dedicated polling loop for that screen instead; the Start/Back
  // buttons there are wired directly in js/menu.js for mouse use.
  const SCREENS = {
    menu: { containers: ['#main-menu'] },
    modeSelect: { containers: ['#mode-select-overlay'], back: 'mode-back' },
    levelSelect: { containers: ['#level-select-overlay'], back: 'level-back' },
    cupSelect: { containers: ['#cup-select-overlay'], back: 'cup-back' },
    // No "back" - the only way off this screen is the continue button
    // (js/main.js's onCupStandingsContinue), forward to the next race or
    // out to the main menu once the cup is done.
    cupStandings: { containers: ['#cup-standings-overlay'] },
    boatSelect: { containers: ['#boat-select-overlay'], back: 'boat-back' },
    options: { containers: ['#options-overlay'], back: 'options-back' },
    scoreboard: { containers: ['#scoreboard-overlay'], back: 'scoreboard-back' },
    scoreboardDetail: { containers: ['#scoreboard-detail-overlay'], back: 'scoreboard-detail-back' },
    achievements: { containers: ['#achievements-overlay'], back: 'achievements-back' },
    controls: { containers: ['#controls-overlay'], back: 'controls-back' },
    paused: { containers: ['#pause-overlay'], back: 'pause-resume' },
    finished: { containers: ['#finish-overlay'] },
  };

  // input[type=color] and the boat-color-reset button are deliberately left
  // out here - a boat card's 4 color swatches sitting right next to it made
  // "just pick a boat" (arrow right past the first card) accidentally dive
  // into color editing. They're only reachable via the Y-button/KeyY
  // "edit colors" mode below (see colorEditCard/toggleColorEdit).
  const FOCUSABLE_SELECTOR =
    'button:not(:disabled):not(.boat-color-reset), [role="button"], input[type="range"], input[type="checkbox"]';
  const BOAT_COLOR_EDIT_SELECTOR = 'input[type="color"], .boat-color-reset';

  let currentScreen = null;
  let focused = null;
  // Non-null while "inside" a boat card's color editor (see toggleColorEdit)
  // - getFocusables() then scopes down to just that card's swatches/reset
  // button instead of the whole boat-select screen.
  let colorEditCard = null;

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function getFocusables() {
    const cfg = SCREENS[currentScreen];
    if (!cfg) return [];
    if (colorEditCard) {
      return Array.from(colorEditCard.querySelectorAll(BOAT_COLOR_EDIT_SELECTOR)).filter(isVisible);
    }
    const out = [];
    cfg.containers.forEach((sel) => {
      const root = document.querySelector(sel);
      if (!root) return;
      root.querySelectorAll(FOCUSABLE_SELECTOR).forEach((el) => {
        if (isVisible(el)) out.push(el);
      });
    });
    return out;
  }

  function setFocus(el) {
    if (focused) focused.classList.remove('nav-focused');
    focused = el || null;
    if (focused) {
      focused.classList.add('nav-focused');
      focused.focus({ preventScroll: true });
      if (focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
    }
  }

  // Remembers which focusable index each screen last had focus on, keyed by
  // screen name, so returning to a screen (Back from a submenu, or the
  // options/controls screens' own returnScreen in main.js) restores that
  // same spot instead of always landing back on the first item.
  const lastFocusIndex = Object.create(null);

  // Called by js/menu.js's setScreen on every screen transition. Deferred a
  // frame so screens that rebuild their card list on entry (level select,
  // boat select, ...) have already re-rendered by the time we scan for
  // focusables.
  function onScreenChange(name) {
    // Read with the OLD currentScreen/focused still in place, before either
    // gets reset below - getFocusables() depends on currentScreen.
    if (currentScreen && focused) {
      const idx = getFocusables().indexOf(focused);
      if (idx !== -1) lastFocusIndex[currentScreen] = idx;
    }
    setFocus(null);
    setColorEditCard(null);
    closeColorPicker();
    closeGimmickPicker();
    closeGimmickInfo();
    currentScreen = name;
    if (!SCREENS[name]) return;
    requestAnimationFrame(() => {
      const list = getFocusables();
      const idx = lastFocusIndex[name];
      setFocus((idx != null && list[idx]) ? list[idx] : (list[0] || null));
    });
  }

  // Buckets focusables into visual rows (grouped by top edge, within a small
  // tolerance) so up/down always steps a whole row at a time regardless of
  // how tall or unevenly-sized individual items are - a plain nearest-center
  // search could otherwise pick a nearer diagonal neighbor over the "real"
  // next row (this is what made "down" from a tall boat-select card
  // sometimes take more than one press to reach the BACK button below it).
  function getRows(list) {
    const rows = [];
    list.forEach((el) => {
      const top = el.getBoundingClientRect().top;
      let row = rows.find((r) => Math.abs(r.top - top) < 24);
      if (!row) { row = { top, items: [] }; rows.push(row); }
      row.items.push(el);
    });
    rows.sort((a, b) => a.top - b.top);
    return rows;
  }

  function move(direction) {
    const list = getFocusables();
    if (!list.length) return;
    if (!focused || list.indexOf(focused) === -1) { setFocus(list[0]); return; }

    if (direction === 'up' || direction === 'down') {
      const rows = getRows(list);
      const curRowIdx = rows.findIndex((r) => r.items.indexOf(focused) !== -1);
      if (curRowIdx === -1) return;
      const targetRowIdx = direction === 'down' ? curRowIdx + 1 : curRowIdx - 1;
      if (targetRowIdx < 0 || targetRowIdx >= rows.length) return;
      const cur = focused.getBoundingClientRect();
      const curCenterX = cur.left + cur.width / 2;
      let best = null, bestDist = Infinity;
      rows[targetRowIdx].items.forEach((el) => {
        const r = el.getBoundingClientRect();
        const dist = Math.abs((r.left + r.width / 2) - curCenterX);
        if (dist < bestDist) { bestDist = dist; best = el; }
      });
      if (best) setFocus(best);
      return;
    }

    // left/right: nearest neighbor strictly to that side, weighting vertical
    // offset heavily so it stays within the current row rather than jumping
    // to a different row's item that happens to be horizontally closer.
    const cur = focused.getBoundingClientRect();
    const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
    let best = null, bestScore = Infinity;
    list.forEach((el) => {
      if (el === focused) return;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      const dx = ex - cx, dy = ey - cy;
      let primary, secondary;
      if (direction === 'left') { if (dx >= -1) return; primary = -dx; secondary = Math.abs(dy); }
      else { if (dx <= 1) return; primary = dx; secondary = Math.abs(dy); }
      const score = primary + secondary * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) setFocus(best);
  }

  function adjustRange(el, dir) {
    const step = Number(el.step) || 1;
    const min = el.min !== '' ? Number(el.min) : 0;
    const max = el.max !== '' ? Number(el.max) : 100;
    const next = Math.max(min, Math.min(max, Number(el.value) + dir * step));
    if (next === Number(el.value)) return;
    el.value = String(next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // A focused slider steals left/right (to adjust its value, matching what
  // arrow keys already do natively for a focused <input type=range>) instead
  // of moving focus elsewhere.
  function handleDirection(direction) {
    if (focused && focused.tagName === 'INPUT' && focused.type === 'range' &&
        (direction === 'left' || direction === 'right')) {
      adjustRange(focused, direction === 'right' ? 1 : -1);
      return;
    }
    move(direction);
  }

  function setColorEditCard(card) {
    if (colorEditCard) colorEditCard.classList.remove('color-edit-active');
    colorEditCard = card || null;
    if (colorEditCard) colorEditCard.classList.add('color-edit-active');
  }

  // Y (gamepad) / KeyY (keyboard) - only meaningful on the boat-select
  // screen, and only from a boat card itself (not e.g. the BACK button) -
  // steps into that card's color swatches, or (pressed again, or B/Escape)
  // steps back out to card-level navigation. See getFocusables()/back().
  function toggleColorEdit() {
    if (currentScreen !== 'boatSelect') return;
    if (colorEditCard) {
      const card = colorEditCard;
      setColorEditCard(null);
      setFocus(card);
      return;
    }
    if (focused && focused.matches && focused.matches('#boat-list .level-card')) {
      setColorEditCard(focused);
      setFocus(getFocusables()[0] || null);
    }
  }

  // X (gamepad) / KeyX (keyboard) - a focused card's "secondary action".
  // Doesn't manage a sub-mode itself (unlike toggleColorEdit) - it just
  // dispatches a real DOM event at the focused card; js/menu.js's own
  // listener (added per eligible card in renderBoatList/renderLevelList) is
  // what actually does something with it, keeping this file data-agnostic
  // about boats/levels. A mouse click reaches the exact same action
  // directly, via a visible per-card element menu.js also owns (the
  // boat-select gimmick chip, or the level-select/scoreboard mirror chip).
  //   - boatSelect: opens that boat's gimmick picker (skipped while already
  //     inside its color editor).
  //   - levelSelect/scoreboard, on a card marked mirror-eligible (see
  //     js/levels.js's canMirror): starts/views that course's reverse-
  //     direction variant instead of its normal one.
  function openFocusedCardAction() {
    if (colorEditCard) return;
    if (currentScreen === 'boatSelect' && focused && focused.matches && focused.matches('#boat-list .level-card')) {
      focused.dispatchEvent(new CustomEvent('gimmickpickeropen'));
    } else if (
      (currentScreen === 'levelSelect' || currentScreen === 'scoreboard') &&
      focused && focused.matches && focused.matches('.level-card[data-mirror-eligible]')
    ) {
      focused.dispatchEvent(new CustomEvent('mirrorstart'));
    }
  }

  // A native <input type=color> click opens the OS/browser's own color
  // dialog, which lives entirely outside the page - neither the Gamepad API
  // nor our own keydown handling can drive it at all, so a controller (or a
  // keyboard-only player) gets stuck the moment that dialog opens. Mouse
  // clicks still go straight to the native swatch input (unchanged, full
  // freeform color choice); activate() below only intercepts the
  // keyboard/gamepad path and substitutes this in-page palette instead.
  const PALETTE = [
    0xd81f2b, 0xff5a1f, 0xffb400, 0xffe135, 0x8fd400, 0x2ecc71, 0x1abc9c, 0x2ea8ff,
    0x1a5fd8, 0x6a3fd8, 0xb83fd8, 0xff3fa8, 0xffffff, 0xb9bec4, 0x6b7280, 0x1a1a1e,
  ];
  const PALETTE_COLS = 8;

  let pickerEl = null;
  let pickerSwatchEls = [];
  let pickerFocusIndex = 0;
  let pickerTargetInput = null;

  function hexString(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  function buildColorPicker() {
    if (pickerEl) return;
    pickerEl = document.createElement('div');
    pickerEl.id = 'gamepad-color-picker';
    pickerEl.className = 'hidden';
    const grid = document.createElement('div');
    grid.className = 'color-picker-grid';
    PALETTE.forEach((hex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-picker-swatch';
      btn.style.background = hexString(hex);
      btn.addEventListener('click', () => pickColor(hex));
      grid.appendChild(btn);
      pickerSwatchEls.push(btn);
    });
    const hint = document.createElement('div');
    hint.className = 'color-picker-hint';
    hint.textContent = 'A / Enter — choose      B / Esc — cancel';
    pickerEl.appendChild(grid);
    pickerEl.appendChild(hint);
    document.body.appendChild(pickerEl);
  }

  function updatePickerFocus() {
    pickerSwatchEls.forEach((el, i) => el.classList.toggle('nav-focused', i === pickerFocusIndex));
  }

  function openColorPicker(inputEl) {
    buildColorPicker();
    pickerTargetInput = inputEl;
    const current = (inputEl.value || '').toLowerCase();
    const idx = PALETTE.findIndex((hex) => hexString(hex) === current);
    pickerFocusIndex = idx !== -1 ? idx : 0;
    updatePickerFocus();
    pickerEl.classList.remove('hidden');
  }

  function closeColorPicker() {
    if (pickerEl) pickerEl.classList.add('hidden');
    pickerTargetInput = null;
  }

  // Selectable gimmick picker (js/menu.js's boat-select cards) - same idea
  // as the color picker above (in-page, fully gamepad/keyboard-navigable)
  // but for a named list of options rather than a fixed color palette, and
  // opened two ways: a mouse click goes straight here (there's no native
  // "OS gimmick dialog" to defer to, unlike colors), and X/gamepad-X on a
  // focused boat card relays through openFocusedCardAction below, which
  // dispatches an event js/menu.js listens for per card so this file still
  // never needs to know about HT.Boats itself.
  let gimmickPickerEl = null;
  let gimmickPickerBox = null;
  let gimmickPickerRowEls = [];
  let gimmickPickerItems = [];
  let gimmickPickerFocusIndex = 0;
  let gimmickPickerOnSelect = null;
  let gimmickPickerOpen = false;

  function buildGimmickPicker() {
    if (gimmickPickerEl) return;
    gimmickPickerEl = document.createElement('div');
    gimmickPickerEl.id = 'gimmick-picker-panel';
    gimmickPickerEl.className = 'hidden';
    gimmickPickerEl.addEventListener('click', (e) => {
      if (e.target === gimmickPickerEl) closeGimmickPicker();
    });

    gimmickPickerBox = document.createElement('div');
    gimmickPickerBox.className = 'gimmick-picker-box';
    gimmickPickerEl.appendChild(gimmickPickerBox);

    document.body.appendChild(gimmickPickerEl);
  }

  function updateGimmickPickerFocus() {
    gimmickPickerRowEls.forEach((el, i) => el.classList.toggle('nav-focused', i === gimmickPickerFocusIndex));
  }

  function selectGimmickPickerIndex(i) {
    const item = gimmickPickerItems[i];
    const onSelect = gimmickPickerOnSelect;
    closeGimmickPicker();
    if (item && onSelect) onSelect(item.id);
  }

  // title: e.g. "Gimmick — Red Fury". items: [{ id, label, desc, current }]
  // - current marks the boat's presently-equipped option, which also seeds
  // the initial focus. onSelect(id) fires once, only on an actual pick
  // (click or A/Enter) - never on cancel (B/Escape/backdrop click).
  function openGimmickPicker(title, items, onSelect) {
    buildGimmickPicker();
    gimmickPickerBox.innerHTML = '';
    gimmickPickerRowEls = [];
    gimmickPickerItems = items;
    gimmickPickerOnSelect = onSelect;

    const heading = document.createElement('div');
    heading.className = 'gimmick-picker-title';
    heading.textContent = title;
    gimmickPickerBox.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'gimmick-picker-list';
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'gimmick-picker-row' + (item.current ? ' current' : '');
      const name = document.createElement('div');
      name.className = 'gimmick-picker-name';
      name.textContent = item.label + (item.current ? ' — equipped' : '');
      const desc = document.createElement('div');
      desc.className = 'gimmick-picker-desc';
      desc.textContent = item.desc;
      row.appendChild(name);
      row.appendChild(desc);
      row.addEventListener('click', () => selectGimmickPickerIndex(i));
      list.appendChild(row);
      gimmickPickerRowEls.push(row);
    });
    gimmickPickerBox.appendChild(list);

    const hint = document.createElement('div');
    hint.className = 'gimmick-picker-hint';
    hint.textContent = '▲▼ navigate      A / Enter — choose      B / Esc — cancel';
    gimmickPickerBox.appendChild(hint);

    gimmickPickerFocusIndex = Math.max(0, items.findIndex((it) => it.current));
    updateGimmickPickerFocus();
    gimmickPickerEl.classList.remove('hidden');
    gimmickPickerOpen = true;
  }

  function moveGimmickPicker(direction) {
    const n = gimmickPickerRowEls.length;
    if (!n) return;
    gimmickPickerFocusIndex = direction === 'down'
      ? Math.min(n - 1, gimmickPickerFocusIndex + 1)
      : Math.max(0, gimmickPickerFocusIndex - 1);
    updateGimmickPickerFocus();
    const el = gimmickPickerRowEls[gimmickPickerFocusIndex];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  function closeGimmickPicker() {
    if (gimmickPickerEl) gimmickPickerEl.classList.add('hidden');
    gimmickPickerOpen = false;
    gimmickPickerOnSelect = null;
  }

  // Read-only info overlay (js/menu.js's boat-select gimmick "ⓘ" buttons) -
  // unlike the color picker above it has nothing to navigate inside it, so
  // any of A/B/Enter/Escape (or a mouse click on the dimmed backdrop) just
  // dismisses it. Still needs its own open/closed state here (rather than
  // just toggling a CSS class from menu.js) so keydown/pollGamepadNav below
  // can swallow input while it's open instead of letting the boat cards
  // underneath keep receiving focus moves and activations.
  let infoPanelEl = null;
  let infoPanelBox = null;
  let infoPanelOpen = false;

  function buildInfoPanel() {
    if (infoPanelEl) return;
    infoPanelEl = document.createElement('div');
    infoPanelEl.id = 'gimmick-info-panel';
    infoPanelEl.className = 'hidden';
    infoPanelEl.addEventListener('click', (e) => {
      if (e.target === infoPanelEl) closeGimmickInfo();
    });

    infoPanelBox = document.createElement('div');
    infoPanelBox.className = 'gimmick-info-box';
    infoPanelEl.appendChild(infoPanelBox);

    document.body.appendChild(infoPanelEl);
  }

  // sections: [{ title, items: [{ label, desc, highlighted }] }] -
  // highlighted marks whichever entry the currently-selected boat has
  // equipped, so the button that opens this (js/menu.js) can show the
  // player exactly where they stand alongside everything else on offer.
  function openGimmickInfo(sections) {
    buildInfoPanel();
    infoPanelBox.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'gimmick-info-title';
    title.textContent = 'Gimmicks';
    infoPanelBox.appendChild(title);

    sections.forEach((section) => {
      const heading = document.createElement('div');
      heading.className = 'gimmick-info-section-title';
      heading.textContent = section.title;
      infoPanelBox.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'gimmick-info-list';
      section.items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'gimmick-info-row' + (item.highlighted ? ' current' : '');
        const name = document.createElement('div');
        name.className = 'gimmick-info-name';
        name.textContent = item.label + (item.highlighted ? ' — equipped' : '');
        const desc = document.createElement('div');
        desc.className = 'gimmick-info-desc';
        desc.textContent = item.desc;
        row.appendChild(name);
        row.appendChild(desc);
        list.appendChild(row);
      });
      infoPanelBox.appendChild(list);
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gimmick-info-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', closeGimmickInfo);
    infoPanelBox.appendChild(closeBtn);

    const hint = document.createElement('div');
    hint.className = 'gimmick-info-hint';
    hint.textContent = 'A / Enter / B / Esc — close';
    infoPanelBox.appendChild(hint);

    infoPanelEl.classList.remove('hidden');
    infoPanelOpen = true;
  }

  function closeGimmickInfo() {
    if (infoPanelEl) infoPanelEl.classList.add('hidden');
    infoPanelOpen = false;
  }

  // Sets the underlying <input type=color>'s value and fires a real 'input'
  // event so js/menu.js's own existing listener (which persists the color
  // via HT.Boats.setColor and redraws that boat's preview canvas) handles
  // the rest exactly as it would for a native picker choice - this picker
  // doesn't need to know anything about boats/settings itself.
  function pickColor(hex) {
    if (pickerTargetInput) {
      pickerTargetInput.value = hexString(hex);
      pickerTargetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    closeColorPicker();
  }

  function movePicker(direction) {
    let idx = pickerFocusIndex;
    if (direction === 'left') idx = Math.max(0, idx - 1);
    else if (direction === 'right') idx = Math.min(PALETTE.length - 1, idx + 1);
    else if (direction === 'up') idx = Math.max(0, idx - PALETTE_COLS);
    else if (direction === 'down') idx = Math.min(PALETTE.length - 1, idx + PALETTE_COLS);
    pickerFocusIndex = idx;
    updatePickerFocus();
  }

  function activate() {
    if (!focused) return;
    if (focused.tagName === 'INPUT' && focused.type === 'checkbox') {
      focused.checked = !focused.checked;
      focused.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (focused.tagName === 'INPUT' && focused.type === 'range') return;
    if (focused.tagName === 'INPUT' && focused.type === 'color') { openColorPicker(focused); return; }
    focused.click();
  }

  function back() {
    if (colorEditCard) { toggleColorEdit(); return; }
    const cfg = SCREENS[currentScreen];
    const btn = cfg && cfg.back && document.getElementById(cfg.back);
    if (btn) btn.click();
  }

  // A key/gamepad-button rebind capture (see js/menu.js) installs its own
  // capturing keydown/gamepad-poll listener and needs the raw input
  // untouched, so nav stays out of the way while one is in flight.
  function captureInProgress() {
    return !!document.querySelector('.key-chip.waiting');
  }

  window.addEventListener('keydown', (e) => {
    if (gimmickPickerOpen) {
      switch (e.code) {
        case 'ArrowUp': moveGimmickPicker('up'); break;
        case 'ArrowDown': moveGimmickPicker('down'); break;
        case 'Enter': case 'Space': selectGimmickPickerIndex(gimmickPickerFocusIndex); break;
        case 'Escape': closeGimmickPicker(); break;
      }
      e.preventDefault();
      return;
    }
    if (infoPanelOpen) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') closeGimmickInfo();
      e.preventDefault();
      return;
    }
    if (pickerTargetInput) {
      // Swallow every key here (even ones we don't otherwise act on) rather
      // than only the ones below - the picker's target is a real, still-
      // focused <input type=color> underneath it, and Space is also a
      // native trigger for that input's own OS color dialog, same as Enter.
      // Letting it fall through would reopen the exact dialog this picker
      // exists to avoid.
      switch (e.code) {
        case 'ArrowUp': movePicker('up'); break;
        case 'ArrowDown': movePicker('down'); break;
        case 'ArrowLeft': movePicker('left'); break;
        case 'ArrowRight': movePicker('right'); break;
        case 'Enter': case 'Space': pickColor(PALETTE[pickerFocusIndex]); break;
        case 'Escape': closeColorPicker(); break;
      }
      e.preventDefault();
      return;
    }
    if (!SCREENS[currentScreen] || captureInProgress()) return;
    switch (e.code) {
      case 'ArrowUp': handleDirection('up'); e.preventDefault(); break;
      case 'ArrowDown': handleDirection('down'); e.preventDefault(); break;
      case 'ArrowLeft': handleDirection('left'); e.preventDefault(); break;
      case 'ArrowRight': handleDirection('right'); e.preventDefault(); break;
      // Space mirrors Enter - important for a focused <input type=color>
      // specifically, since browsers treat Space as an alternate trigger
      // for that input's own native dialog same as Enter; activate() below
      // is what actually substitutes our in-page picker for it.
      case 'Enter': case 'Space': activate(); e.preventDefault(); break;
      case 'Escape': back(); break;
      case 'KeyY': toggleColorEdit(); e.preventDefault(); break;
      case 'KeyX': openFocusedCardAction(); e.preventDefault(); break;
    }
  });

  // Polled independently of js/input.js (which only tracks racing input)
  // since menu navigation needs to work identically whether or not a race
  // has even started yet. Always A=activate / B=back here regardless of the
  // player's in-race gamepad rebindings - a menu, not a race.
  let gpIndex = null;
  window.addEventListener('gamepadconnected', (e) => { gpIndex = e.gamepad.index; });
  window.addEventListener('gamepaddisconnected', (e) => { if (gpIndex === e.gamepad.index) gpIndex = null; });

  // Called once local co-op players have joined (js/main.js, right as the
  // Players screen hands off to boat selection) so every subsequent menu
  // (boat hand-off, level/cup select, pause, ...) is reliably driven by
  // whichever physical pad actually became Player 1 - without this, the
  // "whichever pad connected to the browser first" fallback a few lines
  // below could silently leave a DIFFERENT player's pad driving the menus,
  // if they happened to connect to the browser in a different order than
  // they pressed A to join.
  function setGamepadIndex(i) { gpIndex = i; }

  const prevPressed = Object.create(null);
  function edge(key, isDown) {
    const was = !!prevPressed[key];
    prevPressed[key] = isDown;
    return isDown && !was;
  }

  function pollGamepadNav() {
    requestAnimationFrame(pollGamepadNav);
    if (captureInProgress()) return;
    if (!gimmickPickerOpen && !infoPanelOpen && !pickerTargetInput && !SCREENS[currentScreen]) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = gpIndex !== null ? pads[gpIndex] : null;
    if (!gp) gp = Array.prototype.find.call(pads, (p) => p) || null;
    if (!gp) return;

    const axisX = gp.axes[0] || 0, axisY = gp.axes[1] || 0;
    const dz = 0.5;
    const up = (gp.buttons[12] && gp.buttons[12].pressed) || axisY < -dz;
    const down = (gp.buttons[13] && gp.buttons[13].pressed) || axisY > dz;
    const left = (gp.buttons[14] && gp.buttons[14].pressed) || axisX < -dz;
    const right = (gp.buttons[15] && gp.buttons[15].pressed) || axisX > dz;
    const a = !!(gp.buttons[0] && gp.buttons[0].pressed);
    const b = !!(gp.buttons[1] && gp.buttons[1].pressed);
    const x = !!(gp.buttons[2] && gp.buttons[2].pressed);
    const y = !!(gp.buttons[3] && gp.buttons[3].pressed);

    if (gimmickPickerOpen) {
      edge('left', left); edge('right', right); edge('x', x); edge('y', y);
      if (edge('up', up)) moveGimmickPicker('up');
      if (edge('down', down)) moveGimmickPicker('down');
      if (edge('a', a)) selectGimmickPickerIndex(gimmickPickerFocusIndex);
      if (edge('b', b)) closeGimmickPicker();
      return;
    }

    if (infoPanelOpen) {
      // Keep every edge() tracker in sync even though only a/b do anything
      // here, so a direction held down before the panel opened doesn't read
      // as a fresh press the instant it closes.
      edge('up', up); edge('down', down); edge('left', left); edge('right', right); edge('x', x); edge('y', y);
      if (edge('a', a)) closeGimmickInfo();
      if (edge('b', b)) closeGimmickInfo();
      return;
    }

    if (pickerTargetInput) {
      edge('x', x); edge('y', y);
      if (edge('up', up)) movePicker('up');
      if (edge('down', down)) movePicker('down');
      if (edge('left', left)) movePicker('left');
      if (edge('right', right)) movePicker('right');
      if (edge('a', a)) pickColor(PALETTE[pickerFocusIndex]);
      if (edge('b', b)) closeColorPicker();
      return;
    }

    if (edge('up', up)) handleDirection('up');
    if (edge('down', down)) handleDirection('down');
    if (edge('left', left)) handleDirection('left');
    if (edge('right', right)) handleDirection('right');
    if (edge('a', a)) activate();
    if (edge('b', b)) back();
    if (edge('x', x)) openFocusedCardAction();
    if (edge('y', y)) toggleColorEdit();
  }
  requestAnimationFrame(pollGamepadNav);

  global.HT = global.HT || {};
  global.HT.Nav = { onScreenChange, openGimmickInfo, openGimmickPicker, setGamepadIndex };
})(window);
