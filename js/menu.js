// Owns all menu/overlay DOM: screen visibility, level-select cards, and the
// options form. main.js stays the single source of truth for *which* screen
// is active - it calls HT.Menu.setScreen() - while this file wires the
// buttons to the handler callbacks main.js supplies.
(function (global) {

  const overlays = {
    menu: null,
    modeSelect: null,
    players: null,
    levelSelect: null,
    cupSelect: null,
    cupStandings: null,
    boatSelect: null,
    options: null,
    scoreboard: null,
    scoreboardDetail: null,
    achievements: null,
    controls: null,
    paused: null,
    finished: null,
    playing: null, // no overlay - HUD only
  };

  let hudEl = null;
  // Set once in init() to each row's own refresh function (see
  // bindRacerCountRow/renderDifficultyRow) - re-run in setScreen() whenever
  // the level-select or cup-select screen is about to show, so picking a
  // racer count/difficulty on one screen doesn't leave the other showing a
  // stale selection.
  let refreshLevelRacerRow = null, refreshCupRacerRow = null;
  let refreshLevelDifficultyRow = null, refreshCupDifficultyRow = null;

  // Which course/mode the Scoreboard detail screen is currently showing -
  // set by showScoreboardDetail (js/main.js's onScoreboardCourseChosen) and
  // read by the mode-tab clicks and the Clear Scores button wired in init().
  let currentScoreboardLevel = null;
  let currentScoreboardMode = 'race';

  // Shared between the keyboard and gamepad rebind lists below so starting a
  // capture in one always abandons an in-flight capture in the other,
  // rather than leaving two capturing listeners alive at once.
  let pendingRebindCancel = null;
  function abandonPendingRebind() {
    if (pendingRebindCancel) { pendingRebindCancel(); pendingRebindCancel = null; }
  }

  function updatePauseTrackLabel() {
    const el = document.getElementById('pause-track-name');
    if (el) el.textContent = HT.Music.getCurrentTrackName() || '—';
  }

  // The racer-count/AI-difficulty row only makes sense for Race mode (Time
  // Attack and Ring Race have no AI) but lives on the shared level-select
  // screen - see main.js's onModeChosen, the only path into that screen,
  // which calls this right before switching to it.
  function setLevelSelectMode(isRace) {
    const row = document.getElementById('race-options-row');
    if (row) row.classList.toggle('hidden', !isRace);
  }

  // Race mode's level-select screen and Cup mode's cup-select screen each
  // have their own copy of this row (same global racerCount setting, shown
  // on two different screens) - takes a containerId so both can be bound
  // independently, and returns its own refresh() so setScreen() below can
  // re-sync whichever row is about to be shown (otherwise picking a count
  // on one screen would leave the other screen's row showing a stale
  // selection until the app happened to reload).
  function bindRacerCountRow(containerId) {
    // Scoped to its own container - the AI difficulty row (renderDifficultyRow
    // below) reuses the same .racer-count-btn class for matching pill
    // styling, and an unscoped query here would also catch those buttons.
    const buttons = Array.from(document.querySelectorAll('#' + containerId + ' .racer-count-btn'));
    function refresh() {
      const current = HT.Settings.get('racerCount') || 4;
      buttons.forEach((btn) => {
        btn.classList.toggle('selected', Number(btn.dataset.count) === current);
      });
    }
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        HT.Settings.set('racerCount', Number(btn.dataset.count));
        refresh();
      });
    });
    refresh();
    return refresh;
  }

  function setScreen(name) {
    Object.keys(overlays).forEach((key) => {
      const el = overlays[key];
      if (!el) return;
      el.classList.toggle('hidden', key !== name);
    });
    if (hudEl) hudEl.classList.toggle('hidden', name !== 'playing' && name !== 'paused');
    // The track can change while paused (see the "next track" button below),
    // so refresh the label every time the pause screen actually opens rather
    // than only once at init.
    if (name === 'paused') updatePauseTrackLabel();
    // Racer-count/AI-difficulty are one global setting each but shown on
    // two different screens (level-select for Race, cup-select for Cup) -
    // re-sync whichever row is about to be shown in case the OTHER one
    // changed the setting since this screen was last visible.
    if (name === 'levelSelect') { if (refreshLevelRacerRow) refreshLevelRacerRow(); if (refreshLevelDifficultyRow) refreshLevelDifficultyRow(); }
    if (name === 'cupSelect') { if (refreshCupRacerRow) refreshCupRacerRow(); if (refreshCupDifficultyRow) refreshCupDifficultyRow(); }
    // Re-rendered on every visit rather than once at init - progress can
    // change any time a race finishes, which never re-runs init().
    if (name === 'achievements') renderAchievementsList();
    // Lets gamepad/keyboard menu navigation (js/navigation.js) know which
    // screen's controls to focus - a no-op on every screen it doesn't know
    // about, including 'playing'.
    if (HT.Nav) HT.Nav.onScreenChange(name);
  }

  // Mode Select's card list is rebuilt (not just re-styled, unlike e.g.
  // renderDifficultyRow's refreshSelection) whenever the Single Player/Split
  // Screen entry point changes what's even choosable - see
  // setModeSelectFilter below, called from js/main.js's onSinglePlayer/
  // onSplitScreen right before this screen shows.
  let modeListContainer = null;
  let modeChosenCallback = null;
  let modeListFilter = null; // null = show every mode (Single Player)

  function renderModeCards() {
    modeListContainer.innerHTML = '';
    const list = modeListFilter ? HT.Modes.list.filter(modeListFilter) : HT.Modes.list;
    list.forEach((mode) => {
      const card = document.createElement('div');
      card.className = 'level-card mode-card';

      const name = document.createElement('div');
      name.className = 'level-card-name';
      name.textContent = mode.name;
      card.appendChild(name);

      const desc = document.createElement('div');
      desc.className = 'level-card-desc';
      desc.textContent = mode.description;
      card.appendChild(desc);

      if (mode.badge) {
        const badge = document.createElement('div');
        badge.className = 'level-card-badge';
        badge.textContent = mode.badge;
        card.appendChild(badge);
      }

      card.addEventListener('click', () => modeChosenCallback(mode));
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      modeListContainer.appendChild(card);
    });
  }

  function renderModeList(container, onModeChosen) {
    modeListContainer = container;
    modeChosenCallback = onModeChosen;
    renderModeCards();
  }

  // filterFn: null to show every mode (Single Player), or a HT.Modes.list
  // predicate (Split Screen passes `m => m.supportsCoop`) - see js/modes.js.
  function setModeSelectFilter(filterFn, subtitleText) {
    modeListFilter = filterFn;
    renderModeCards();
    const subtitle = document.getElementById('mode-select-subtitle');
    if (subtitle) subtitle.textContent = subtitleText || '';
  }

  // AI difficulty as a compact button row (same widget as bindRacerCountRow
  // below) living right next to the racer-count picker on the level-select
  // screen, rather than its own full screen before it - the two settings
  // both just govern the AI opponents, so they belong side by side. Fully
  // self-contained like bindRacerCountRow: reads/writes HT.Settings
  // directly, no callback into main.js needed.
  // Race mode's level-select screen and Cup mode's cup-select screen each
  // get their own copy of this row too (see bindRacerCountRow above) -
  // returns refreshSelection so setScreen() can re-sync whichever row is
  // about to be shown.
  function renderDifficultyRow(container) {
    // Toggles .selected across the already-built buttons in place (same
    // fix as renderBoatList's applySelectionHighlight) rather than the
    // click handler rebuilding the row - these buttons are real DOM nodes,
    // not ids, so a rebuild would drop js/navigation.js's `focused`
    // reference and snap keyboard/gamepad focus back to the first
    // focusable on the level-select screen the instant a difficulty is picked.
    function refreshSelection() {
      const currentId = HT.Settings.get('aiDifficulty');
      Array.from(container.children).forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.difficultyId === currentId);
      });
    }
    container.innerHTML = '';
    HT.Difficulty.list.forEach((difficulty) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'racer-count-btn';
      btn.dataset.difficultyId = difficulty.id;
      btn.textContent = difficulty.name;
      btn.title = difficulty.description;
      btn.addEventListener('click', () => {
        HT.Settings.set('aiDifficulty', difficulty.id);
        refreshSelection();
      });
      container.appendChild(btn);
    });
    // Click sound bound globally in init() (.racer-count-btn covers both
    // this and the plain racer-count row) once every button here exists,
    // rather than here - this can re-render (e.g. never actually does today,
    // but would if that changed) without double-binding.
    refreshSelection();
    return refreshSelection;
  }

  function renderLevelList(container, onLevelChosen) {
    container.innerHTML = '';
    HT.Levels.list.forEach((level) => {
      const card = document.createElement('div');
      card.className = 'level-card' + (level.locked ? ' locked' : '');

      const canvas = document.createElement('canvas');
      canvas.width = 140;
      canvas.height = 90;
      card.appendChild(canvas);

      const name = document.createElement('div');
      name.className = 'level-card-name';
      name.textContent = level.name;
      card.appendChild(name);

      const desc = document.createElement('div');
      desc.className = 'level-card-desc';
      desc.textContent = level.locked ? 'Coming soon' : level.description;
      card.appendChild(desc);

      if (!level.locked) {
        const badge = document.createElement('div');
        badge.className = 'level-card-badge';
        badge.textContent = level.difficulty || '';
        card.appendChild(badge);
        card.addEventListener('click', () => onLevelChosen(level));
        card.tabIndex = 0;
        card.setAttribute('role', 'button');

        // Race this same course in reverse - only offered where
        // HT.Levels.canMirror() says the course can sensibly support it
        // (loops with no themeZones; see its own comment for why). A plain
        // <div> rather than a <button>/role="button", same trick as the
        // boat-select gimmick chip right below it in spirit: it stays
        // mouse/touch-clickable but invisible to js/navigation.js's
        // FOCUSABLE_SELECTOR, so cards with and without this chip still
        // line up in the same D-pad row instead of one having an extra
        // focusable the other doesn't. Reachable by keyboard/gamepad too,
        // via X/gamepad-X on a focused eligible card - js/navigation.js's
        // openFocusedCardAction dispatches 'mirrorstart' at it, which this
        // listener turns into the same onLevelChosen call as a click.
        if (HT.Levels.canMirror(level)) {
          card.dataset.mirrorEligible = '1';
          const chip = document.createElement('div');
          chip.className = 'level-card-mirror-chip';
          const chipValue = document.createElement('div');
          chipValue.className = 'level-card-mirror-chip-value';
          chipValue.textContent = '🔁 Race in Reverse';
          const chipHint = document.createElement('div');
          chipHint.className = 'level-card-mirror-chip-hint';
          chipHint.textContent = 'Click or press Ⓧ';
          chip.appendChild(chipValue);
          chip.appendChild(chipHint);
          const startMirrored = () => onLevelChosen(HT.Levels.mirrorLevel(level));
          chip.addEventListener('click', (e) => { e.stopPropagation(); startMirrored(); });
          card.addEventListener('mirrorstart', startMirrored);
          card.appendChild(chip);
        }
      }

      container.appendChild(card);
      HT.Levels.drawPreview(canvas, level);
    });
  }

  // Cup mode's course-picker equivalent - simpler than renderLevelList since
  // cups have no lock state or minimap, just a fixed roster of courses shown
  // as a plain text list under the description.
  function renderCupList(container, onCupChosen) {
    container.innerHTML = '';
    HT.Cups.list.forEach((cup) => {
      const card = document.createElement('div');
      card.className = 'level-card';

      const name = document.createElement('div');
      name.className = 'level-card-name';
      name.textContent = cup.name;
      card.appendChild(name);

      const desc = document.createElement('div');
      desc.className = 'level-card-desc';
      desc.textContent = cup.description;
      card.appendChild(desc);

      const trackList = document.createElement('div');
      trackList.className = 'cup-track-list';
      trackList.textContent = cup.levelIds
        .map((id) => (HT.Levels.getById(id) || {}).name || id)
        .join(' → ');
      card.appendChild(trackList);

      const badge = document.createElement('div');
      badge.className = 'level-card-badge';
      badge.textContent = cup.levelIds.length + ' TRACKS';
      card.appendChild(badge);

      card.addEventListener('click', () => onCupChosen(cup));
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      container.appendChild(card);
    });
  }

  // Non-null only while js/main.js is running the sequential local co-op
  // boat hand-off (Players screen -> Start) - see setBoatHandoffMode. Normal
  // single-player boat select (the main menu's BOATS button, or Time
  // Attack/Ring Race) leaves this null and keeps reading/writing
  // HT.Settings.data.selectedBoatId exactly as before.
  let boatHandoffMode = null;
  function setBoatHandoffMode(mode) {
    boatHandoffMode = mode;
    if (refreshBoatSelectHighlight) refreshBoatSelectHighlight();
  }

  function setBoatSelectHeading(text) {
    const el = document.getElementById('boat-select-title');
    if (el) el.textContent = text || 'SELECT BOAT';
  }

  // Set inside renderBoatList below (once, at render time) so
  // setBoatHandoffMode can re-apply the selected/taken highlighting the
  // instant a new player's turn starts, without needing a full re-render
  // (which would drop js/navigation.js's `focused` reference).
  let refreshBoatSelectHighlight = null;

  // Players (local co-op join) screen - re-run every time js/coop.js's
  // roster changes (join/leave) via HT.Coop.setCallbacks below, rather than
  // driven by any click handler here directly.
  function renderPlayersList() {
    const container = document.getElementById('players-list');
    const hintEl = document.getElementById('players-start-hint');
    if (!container || !HT.Coop) return;
    const joined = HT.Coop.getJoinedPlayers();
    container.innerHTML = '';
    for (let i = 0; i < HT.Coop.MAX_PLAYERS; i++) {
      const jp = joined[i];
      const card = document.createElement('div');
      card.className = 'player-slot-card' + (jp ? ' joined' : '');

      const label = document.createElement('div');
      label.className = 'player-slot-label';
      label.textContent = 'PLAYER ' + (i + 1);

      const status = document.createElement('div');
      status.className = 'player-slot-status';
      if (jp) {
        const accent = '#' + HT.Coop.accentColor(i).toString(16).padStart(6, '0');
        card.style.borderColor = accent;
        label.style.color = accent;
        status.textContent = jp.controllerType === 'keyboard'
          ? 'Keyboard — READY'
          : 'Gamepad ' + (jp.gamepadIndex + 1) + ' — READY';
      } else {
        status.textContent = 'Press A or Start to join';
      }

      card.appendChild(label);
      card.appendChild(status);
      container.appendChild(card);
    }
    if (hintEl) {
      hintEl.textContent = joined.length === 0
        ? 'Press A or Start on a controller to join (or Enter/Space on keyboard)'
        : 'Press Start again (or Enter/Space) to begin the race';
    }
  }

  function renderBoatList(container, onBoatChosen) {
    // Toggles .selected and the SELECTED badge across the already-built
    // cards in place, rather than the picking handler calling the full
    // render() below - a full re-render tears down and rebuilds every
    // card's DOM node, which would silently drop js/navigation.js's
    // `focused` reference (it's a real element, not an id) right as you
    // pick a boat with a controller, snapping keyboard/gamepad focus back
    // to the first card on the very next D-pad press.
    function currentSelectedId() {
      return boatHandoffMode ? boatHandoffMode.getSelectedId() : HT.Settings.get('selectedBoatId');
    }

    function applySelectionHighlight() {
      const selectedId = currentSelectedId();
      Array.from(container.children).forEach((card) => {
        const boatId = card.dataset.boatId;
        const isSelected = boatId === selectedId;
        const isTaken = !!(boatHandoffMode && !isSelected && boatHandoffMode.isTaken(boatId));
        card.classList.toggle('selected', isSelected);
        card.classList.toggle('boat-taken', isTaken);
        let badge = card.querySelector('.level-card-badge');
        if (isSelected && !badge) {
          badge = document.createElement('div');
          badge.className = 'level-card-badge';
          badge.textContent = 'SELECTED';
          card.appendChild(badge);
        } else if (!isSelected && badge) {
          badge.remove();
        }
      });
    }
    refreshBoatSelectHighlight = applySelectionHighlight;

    function render() {
      container.innerHTML = '';
      const selectedId = currentSelectedId();
      HT.Boats.list.forEach((boat) => {
        const card = document.createElement('div');
        card.className = 'level-card' + (boat.id === selectedId ? ' selected' : '');
        card.dataset.boatId = boat.id;

        const canvas = document.createElement('canvas');
        canvas.width = 140;
        canvas.height = 90;
        card.appendChild(canvas);

        const name = document.createElement('div');
        name.className = 'level-card-name';
        name.textContent = boat.name;
        card.appendChild(name);

        // Always created (even with zero badges right now) rather than only
        // when boat.gimmicks is non-empty, so the gimmick picker's onSelect
        // callback below can always find it and just refill it in place -
        // it's absolutely positioned (see CSS), so an empty one takes no
        // visible space either way.
        const gimmickBadges = document.createElement('div');
        gimmickBadges.className = 'boat-gimmick-badges';
        function renderGimmickBadges() {
          gimmickBadges.innerHTML = '';
          (boat.gimmicks || []).forEach((g) => {
            const badge = document.createElement('div');
            badge.className = 'boat-gimmick-badge';
            badge.textContent = g.badge;
            gimmickBadges.appendChild(badge);
          });
        }
        renderGimmickBadges();
        card.appendChild(gimmickBadges);

        const desc = document.createElement('div');
        desc.className = 'level-card-desc';
        desc.textContent = boat.description;
        card.appendChild(desc);

        // Weight drives collision physics (see boat.js) but isn't a "higher
        // is better" stat like the bars below, so it gets its own plain
        // label with a qualitative bucket rather than a fill bar that would
        // imply more weight = an improvement.
        const weightLabel = document.createElement('div');
        weightLabel.className = 'boat-weight';
        const weightClass = boat.weight < 0.95 ? 'Light' : boat.weight > 1.15 ? 'Heavy' : 'Medium';
        weightLabel.textContent = `Weight: ${boat.weight.toFixed(2)}× — ${weightClass} — ${boat.maxHealth} HP`;
        card.appendChild(weightLabel);

        const stats = document.createElement('div');
        stats.className = 'boat-stats';
        ['speed', 'accel', 'handling', 'boost', 'health'].forEach((key) => {
          const row = document.createElement('div');
          row.className = 'boat-stat-row';
          const label = document.createElement('span');
          label.textContent = key.slice(0, 1).toUpperCase() + key.slice(1);
          const bar = document.createElement('div');
          bar.className = 'boat-stat-bar';
          const fill = document.createElement('div');
          fill.className = 'boat-stat-fill';
          fill.style.width = boat.stats[key] + '%';
          bar.appendChild(fill);
          row.appendChild(label);
          row.appendChild(bar);
          stats.appendChild(row);
        });
        card.appendChild(stats);

        // Gimmick customization for boats that don't ship with a built-in
        // one (js/boats.js's customizableGimmick flag). The chip below is a
        // plain <div> - deliberately not a <button> or role="button" - so
        // it's mouse/touch-clickable but invisible to js/navigation.js's
        // FOCUSABLE_SELECTOR, same trick as the color swatches: an inline
        // *button* here used to sit at a height non-customizable cards had
        // nothing at, breaking D-pad down-navigation's row alignment
        // between cards, but a plain div never entered that selector to
        // begin with regardless of where it sits in the card.
        //
        // Opened two ways, both landing on the same openGimmickPickerForBoat
        // below: a direct click on the chip, or X/gamepad-X on this card
        // while it has D-pad focus (js/navigation.js's
        // openFocusedCardAction dispatches 'gimmickpickeropen' at whichever
        // card is focused - it doesn't know about HT.Boats itself, so this
        // listener is what turns that into a real picker with this boat's
        // actual options).
        if (boat.customizableGimmick) {
          const chip = document.createElement('div');
          chip.className = 'boat-gimmick-chip';

          // Two lines rather than folding the prompt into one line with the
          // current value: a single "Gimmick: X ✎" reads as a label, not a
          // call to action - the explicit "Click or Ⓧ to change" line below
          // it is the actual answer to "how do I change this", spelled out
          // on the card itself rather than only in the easy-to-miss
          // controls-hint line at the top of the whole screen.
          const chipValue = document.createElement('div');
          chipValue.className = 'boat-gimmick-chip-value';
          const chipHint = document.createElement('div');
          chipHint.className = 'boat-gimmick-chip-hint';
          chipHint.textContent = 'Click or press Ⓧ to change';
          chip.appendChild(chipValue);
          chip.appendChild(chipHint);

          function updateGimmickChip() {
            const options = HT.Boats.getGimmickOptions();
            const currentId = HT.Boats.getGimmickChoice(boat.id);
            const current = options.find((o) => o.id === currentId) || options[0];
            chipValue.textContent = `Gimmick: ${current.label}`;
          }
          updateGimmickChip();

          // Patches just this card's own chip/badges in place rather than
          // calling the outer render() - a full re-render would replace
          // this card's DOM node out from under js/navigation.js's
          // `focused` reference, silently dropping keyboard/gamepad focus
          // back to the first card on the very next D-pad press.
          function openGimmickPickerForBoat() {
            const options = HT.Boats.getGimmickOptions();
            const currentId = HT.Boats.getGimmickChoice(boat.id);
            const items = options.map((o) => ({
              id: o.id, label: o.label, desc: o.desc, current: o.id === currentId,
            }));
            HT.Nav.openGimmickPicker(`Gimmick — ${boat.name}`, items, (id) => {
              HT.Boats.setGimmickChoice(boat.id, id);
              renderGimmickBadges();
              updateGimmickChip();
            });
          }

          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            openGimmickPickerForBoat();
          });
          card.addEventListener('gimmickpickeropen', openGimmickPickerForBoat);

          card.appendChild(chip);
        }

        // Color customization - four swatches (one per paint region, see
        // boat.js's buildMesh) using native <input type="color"> so there's
        // no custom picker UI to build. Changes apply and save immediately
        // (see HT.Boats.setColor) and only ever touch this card's own
        // preview/swatches, not a full list re-render, so dragging in the
        // native picker doesn't fight with the DOM getting rebuilt under it.
        const colorsRow = document.createElement('div');
        colorsRow.className = 'boat-colors';
        HT.Boats.COLOR_KEYS.forEach((key) => {
          const swatchWrap = document.createElement('label');
          swatchWrap.className = 'boat-color-swatch';
          const input = document.createElement('input');
          input.type = 'color';
          input.value = '#' + boat.colors[key].toString(16).padStart(6, '0');
          input.title = key.charAt(0).toUpperCase() + key.slice(1);
          input.addEventListener('click', (e) => e.stopPropagation());
          input.addEventListener('input', (e) => {
            e.stopPropagation();
            HT.Boats.setColor(boat.id, key, parseInt(input.value.slice(1), 16));
            HT.Boats.drawPreview(canvas, boat);
          });
          const swatchLabel = document.createElement('span');
          swatchLabel.textContent = key.charAt(0).toUpperCase() + key.slice(1);
          swatchWrap.appendChild(input);
          swatchWrap.appendChild(swatchLabel);
          colorsRow.appendChild(swatchWrap);
        });
        const resetColorsBtn = document.createElement('button');
        resetColorsBtn.type = 'button';
        resetColorsBtn.className = 'boat-color-reset';
        resetColorsBtn.textContent = 'Reset Colors';
        resetColorsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          HT.Boats.resetColors(boat.id);
          HT.Boats.COLOR_KEYS.forEach((key, i) => {
            colorsRow.children[i].querySelector('input').value =
              '#' + boat.colors[key].toString(16).padStart(6, '0');
          });
          HT.Boats.drawPreview(canvas, boat);
        });
        card.appendChild(colorsRow);
        card.appendChild(resetColorsBtn);

        card.addEventListener('click', () => {
          if (boatHandoffMode && boat.id !== currentSelectedId() && boatHandoffMode.isTaken(boat.id)) return;
          onBoatChosen(boat);
          applySelectionHighlight();
        });
        card.tabIndex = 0;
        card.setAttribute('role', 'button');

        container.appendChild(card);
        HT.Boats.drawPreview(canvas, boat);
      });
      bindClickSound('#boat-list .level-card');
      applySelectionHighlight();
    }
    render();
  }

  // Full reference panel covering every gimmick in the game - both the four
  // boats with one built in and the five options selectable on the other
  // four - since a boat card's badges only ever show a short name. Opened
  // from #boat-gimmick-info-btn (wired in init()).
  function openFullGimmickInfo() {
    const boat = HT.Boats.getSelected();
    const info = HT.Boats.getAllGimmickInfo();
    const currentChoiceId = boat.customizableGimmick ? HT.Boats.getGimmickChoice(boat.id) : null;

    HT.Nav.openGimmickInfo([
      {
        title: 'Built-in Boat Gimmicks',
        items: info.builtIn.map((g) => ({
          label: `${g.label} (${g.boatName})`,
          desc: g.desc,
          highlighted: g.boatId === boat.id,
        })),
      },
      {
        title: 'Customizable Gimmicks (Red Fury / Blue Bolt / Green Viper / Gold Comet)',
        items: info.customizable.map((o) => ({
          label: o.label,
          desc: o.desc,
          highlighted: o.id === currentChoiceId,
        })),
      },
    ]);
  }

  // Applied once at startup (see init() below) and again immediately on
  // every change, rather than only ever being read at render time - both
  // are plain global effects (a <body> class, a CSS var) with nothing to
  // "render", so there's no separate screen-entry refresh path needed the
  // way e.g. the racer-count row has.
  function applyAccessibilitySettings() {
    document.body.classList.toggle('colorblind-mode', !!HT.Settings.get('colorblindMode'));
    const scale = HT.Settings.get('uiScale');
    document.documentElement.style.setProperty('--ui-scale', (scale != null ? scale : 1));
  }

  function bindOptionsForm() {
    const volEl = document.getElementById('opt-volume');
    const musicVolEl = document.getElementById('opt-music-volume');
    const engineVolEl = document.getElementById('opt-engine-volume');
    const muteEl = document.getElementById('opt-mute');
    const invertEl = document.getElementById('opt-invert');
    const healthDangerEl = document.getElementById('opt-health-danger');
    const healthDangerValueEl = document.getElementById('opt-health-danger-value');
    const colorblindEl = document.getElementById('opt-colorblind');
    const uiScaleEl = document.getElementById('opt-ui-scale');
    const uiScaleValueEl = document.getElementById('opt-ui-scale-value');

    volEl.value = Math.round((HT.Settings.get('masterVolume') != null ? HT.Settings.get('masterVolume') : 0.8) * 100);
    musicVolEl.value = Math.round((HT.Settings.get('musicVolume') != null ? HT.Settings.get('musicVolume') : 0.6) * 100);
    engineVolEl.value = Math.round((HT.Settings.get('engineVolume') != null ? HT.Settings.get('engineVolume') : 0.6) * 100);
    muteEl.checked = !!HT.Settings.get('muted');
    invertEl.checked = !!HT.Settings.get('invertSteering');
    const initialDanger = Math.round((HT.Settings.get('healthDangerThreshold') != null ? HT.Settings.get('healthDangerThreshold') : 0.25) * 100);
    healthDangerEl.value = initialDanger;
    healthDangerValueEl.textContent = initialDanger + '%';
    colorblindEl.checked = !!HT.Settings.get('colorblindMode');
    const initialScale = Math.round((HT.Settings.get('uiScale') || 1) * 100);
    uiScaleEl.value = initialScale;
    uiScaleValueEl.textContent = initialScale + '%';

    volEl.addEventListener('input', () => {
      const v = Number(volEl.value) / 100;
      HT.Settings.set('masterVolume', v);
      HT.Audio.setMasterVolume(v);
    });
    musicVolEl.addEventListener('input', () => {
      const v = Number(musicVolEl.value) / 100;
      HT.Settings.set('musicVolume', v);
      HT.Audio.setMusicVolume(v);
    });
    engineVolEl.addEventListener('input', () => {
      const v = Number(engineVolEl.value) / 100;
      HT.Settings.set('engineVolume', v);
      HT.Audio.setEngineVolume(v);
    });
    muteEl.addEventListener('change', () => {
      HT.Settings.set('muted', muteEl.checked);
      HT.Audio.setMuted(muteEl.checked);
    });
    invertEl.addEventListener('change', () => {
      HT.Settings.set('invertSteering', invertEl.checked);
    });
    healthDangerEl.addEventListener('input', () => {
      const pct = Number(healthDangerEl.value);
      healthDangerValueEl.textContent = pct + '%';
      HT.Settings.set('healthDangerThreshold', pct / 100);
    });
    colorblindEl.addEventListener('change', () => {
      HT.Settings.set('colorblindMode', colorblindEl.checked);
      applyAccessibilitySettings();
    });
    uiScaleEl.addEventListener('input', () => {
      const pct = Number(uiScaleEl.value);
      uiScaleValueEl.textContent = pct + '%';
      HT.Settings.set('uiScale', pct / 100);
      applyAccessibilitySettings();
    });
  }

  // Export/Import (js/save-data.js owns the actual read/write; this is
  // just the file-picker/download plumbing and the own-styled confirm
  // prompt in place of a native confirm() - see save-data-status in
  // css/style.css).
  function bindSaveDataForm() {
    const fileInput = document.getElementById('import-save-input');
    const statusEl = document.getElementById('save-data-status');
    const statusTextEl = document.getElementById('save-data-status-text');
    const statusButtonsEl = document.getElementById('save-data-status-buttons');
    let statusTimer = null;
    let pendingImport = null;

    function showStatus(text, withConfirm) {
      clearTimeout(statusTimer);
      statusEl.classList.remove('hidden');
      statusTextEl.textContent = text;
      statusButtonsEl.classList.toggle('hidden', !withConfirm);
      if (!withConfirm) {
        statusTimer = setTimeout(() => statusEl.classList.add('hidden'), 4000);
      }
    }

    document.getElementById('options-export-save').addEventListener('click', () => {
      const bundle = HT.SaveData.exportSaveData();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hydro-rush-save-${bundle.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus('Save exported.', false);
    });

    document.getElementById('options-import-save').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      fileInput.value = ''; // lets the same file be re-picked later (e.g. after Cancel)
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (e) {
          showStatus("That file isn't valid JSON.", false);
          return;
        }
        // Cheap shape check only - just enough to gate the confirmation
        // prompt. HT.SaveData.importSaveData does the real validation
        // right before it actually writes anything.
        if (!parsed || typeof parsed !== 'object' || parsed.app !== 'hydrorush' || !parsed.data) {
          showStatus("That doesn't look like a Hydro Rush save file.", false);
          return;
        }
        pendingImport = parsed;
        showStatus('Importing will overwrite your current settings, scoreboard, ghosts, and achievements. Continue?', true);
      };
      reader.readAsText(file);
    });

    document.getElementById('save-data-confirm-btn').addEventListener('click', () => {
      if (!pendingImport) return;
      const result = HT.SaveData.importSaveData(pendingImport);
      pendingImport = null;
      if (result.ok) {
        // A full reload rather than trying to hot-patch four modules'
        // already-loaded in-memory state - see js/save-data.js's own comment.
        showStatus('Save imported - reloading...', false);
        setTimeout(() => location.reload(), 600);
      } else {
        showStatus(result.error, false);
      }
    });

    document.getElementById('save-data-cancel-btn').addEventListener('click', () => {
      pendingImport = null;
      statusEl.classList.add('hidden');
    });
  }

  const ACTION_LABELS = [
    ['steerLeft', 'Steer Left'],
    ['steerRight', 'Steer Right'],
    ['throttle', 'Throttle'],
    ['brake', 'Brake / Reverse'],
    ['boost', 'Boost'],
    ['pause', 'Pause'],
    ['restart', 'Restart Course'],
    ['camera', 'Change Camera'],
  ];

  const KEY_LABELS = {
    ArrowLeft: '◀', ArrowRight: '▶', ArrowUp: '▲', ArrowDown: '▼',
    Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
    Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
  };

  function keyLabel(code) {
    if (!code) return '—';
    if (KEY_LABELS[code]) return KEY_LABELS[code];
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code.indexOf('Arrow') === 0) return code.slice(5);
    return code;
  }

  // Lets the Controls screen turn any of its key chips into a "press a key"
  // capture without stepping on the game's own input handling: this only
  // ever runs while the controls overlay is open (never during 'playing'),
  // and input.js's poll() result is simply discarded on every other screen,
  // so intercepting keydown here has no gameplay side effect.
  function renderControlsList() {
    const container = document.getElementById('controls-rebind-list');
    if (!container) return;

    function startRebind(action, slot, chip) {
      abandonPendingRebind();
      const prevText = chip.textContent;
      chip.textContent = 'Press a key…';
      chip.classList.add('waiting');

      const finish = () => {
        window.removeEventListener('keydown', handler, true);
        pendingRebindCancel = null;
      };
      const cancel = () => {
        finish();
        chip.textContent = prevText;
        chip.classList.remove('waiting');
      };
      const handler = (e) => {
        e.preventDefault();
        if (e.code === 'Escape') { cancel(); return; }
        finish();
        HT.Settings.setKeyBinding(action, slot, e.code);
        render();
      };
      pendingRebindCancel = cancel;
      window.addEventListener('keydown', handler, true);
    }

    function render() {
      abandonPendingRebind();
      container.innerHTML = '';
      const bindings = HT.Settings.get('keyBindings');
      ACTION_LABELS.forEach(([action, label]) => {
        const row = document.createElement('div');
        row.className = 'control-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'control-row-label';
        labelEl.textContent = label;
        row.appendChild(labelEl);

        const keysEl = document.createElement('div');
        keysEl.className = 'control-row-keys';
        const slots = bindings[action] || [];
        [0, 1].forEach((slot) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'key-chip';
          chip.textContent = keyLabel(slots[slot]);
          chip.addEventListener('click', () => startRebind(action, slot, chip));
          keysEl.appendChild(chip);
        });
        row.appendChild(keysEl);

        container.appendChild(row);
      });
    }

    document.getElementById('controls-reset').addEventListener('click', () => {
      abandonPendingRebind();
      HT.Settings.resetKeyBindings();
      render();
    });
    document.getElementById('controls-back').addEventListener('click', abandonPendingRebind);

    render();
  }

  const GAMEPAD_ACTION_LABELS = [
    ['throttle', 'Throttle'],
    ['brake', 'Brake / Reverse'],
    ['boost', 'Boost'],
    ['camera', 'Change Camera'],
    ['pause', 'Pause'],
    ['restart', 'Restart Course'],
  ];

  // Standard-mapping button indices - see js/settings.js's
  // DEFAULT_GAMEPAD_BINDINGS for the full layout this describes.
  const GAMEPAD_BUTTON_LABELS = [
    'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
    'Back', 'Start', 'L Stick', 'R Stick', 'D-Up', 'D-Down', 'D-Left', 'D-Right',
  ];

  function gamepadButtonLabel(idx) {
    if (idx == null) return '—';
    return GAMEPAD_BUTTON_LABELS[idx] || `Btn ${idx}`;
  }

  // Mirrors renderControlsList's "press a key" capture, but polls
  // navigator.getGamepads() each frame instead of listening for a DOM event
  // (gamepad buttons don't dispatch one). Buttons already held down the
  // instant capture starts are ignored so the very gamepad press used to
  // click/activate this chip (via mouse, Enter, or menu navigation's own A
  // button - see js/navigation.js) doesn't immediately self-bind.
  function renderGamepadRebindList() {
    const container = document.getElementById('gamepad-rebind-list');
    if (!container) return;

    function startCapture(action, chip) {
      abandonPendingRebind();
      const prevText = chip.textContent;
      chip.textContent = 'Press a button…';
      chip.classList.add('waiting');

      const heldAtStart = new Set();
      (navigator.getGamepads ? navigator.getGamepads() : []).forEach((gp) => {
        if (!gp) return;
        gp.buttons.forEach((b, i) => { if (b && b.pressed) heldAtStart.add(i); });
      });

      let rafId;
      const finish = () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('keydown', escHandler, true);
        pendingRebindCancel = null;
      };
      const cancel = () => {
        finish();
        chip.textContent = prevText;
        chip.classList.remove('waiting');
      };
      const escHandler = (e) => { if (e.code === 'Escape') cancel(); };
      function poll() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gp of pads) {
          if (!gp) continue;
          for (let i = 0; i < gp.buttons.length; i++) {
            const b = gp.buttons[i];
            if (b && b.pressed && !heldAtStart.has(i)) {
              finish();
              HT.Settings.setGamepadBinding(action, i);
              render();
              return;
            }
          }
        }
        rafId = requestAnimationFrame(poll);
      }
      window.addEventListener('keydown', escHandler, true);
      pendingRebindCancel = cancel;
      rafId = requestAnimationFrame(poll);
    }

    function render() {
      abandonPendingRebind();
      container.innerHTML = '';
      const bindings = HT.Settings.get('gamepadBindings');
      GAMEPAD_ACTION_LABELS.forEach(([action, label]) => {
        const row = document.createElement('div');
        row.className = 'control-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'control-row-label';
        labelEl.textContent = label;
        row.appendChild(labelEl);

        const keysEl = document.createElement('div');
        keysEl.className = 'control-row-keys';
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'key-chip';
        chip.textContent = gamepadButtonLabel(bindings[action]);
        chip.addEventListener('click', () => startCapture(action, chip));
        keysEl.appendChild(chip);
        row.appendChild(keysEl);

        container.appendChild(row);
      });
    }

    document.getElementById('gamepad-reset').addEventListener('click', () => {
      abandonPendingRebind();
      HT.Settings.resetGamepadBindings();
      render();
    });
    document.getElementById('controls-back').addEventListener('click', abandonPendingRebind);

    render();
  }

  function bindClickSound(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      el.addEventListener('click', () => { if (HT.Audio) HT.Audio.uiClick(); });
    });
  }

  function init(handlers) {
    overlays.menu = document.getElementById('main-menu');
    overlays.modeSelect = document.getElementById('mode-select-overlay');
    overlays.players = document.getElementById('players-overlay');
    overlays.levelSelect = document.getElementById('level-select-overlay');
    overlays.cupSelect = document.getElementById('cup-select-overlay');
    overlays.cupStandings = document.getElementById('cup-standings-overlay');
    overlays.boatSelect = document.getElementById('boat-select-overlay');
    overlays.options = document.getElementById('options-overlay');
    overlays.scoreboard = document.getElementById('scoreboard-overlay');
    overlays.scoreboardDetail = document.getElementById('scoreboard-detail-overlay');
    overlays.achievements = document.getElementById('achievements-overlay');
    overlays.controls = document.getElementById('controls-overlay');
    overlays.paused = document.getElementById('pause-overlay');
    overlays.finished = document.getElementById('finish-overlay');
    hudEl = document.getElementById('hud');

    document.getElementById('menu-single-player').addEventListener('click', handlers.onSinglePlayer);
    document.getElementById('menu-split-screen').addEventListener('click', handlers.onSplitScreen);
    document.getElementById('menu-boats').addEventListener('click', handlers.onBoats);
    document.getElementById('menu-options').addEventListener('click', handlers.onOptionsFromMenu);
    document.getElementById('menu-controls').addEventListener('click', handlers.onControlsFromMenu);

    document.getElementById('mode-back').addEventListener('click', handlers.onModeBack);
    document.getElementById('players-back').addEventListener('click', handlers.onPlayersBack);
    document.getElementById('level-back').addEventListener('click', handlers.onLevelBack);
    document.getElementById('level-change-boat').addEventListener('click', handlers.onLevelChangeBoat);
    document.getElementById('cup-back').addEventListener('click', handlers.onCupBack);
    document.getElementById('cup-change-boat').addEventListener('click', handlers.onCupChangeBoat);
    document.getElementById('cup-standings-continue').addEventListener('click', handlers.onCupStandingsContinue);
    document.getElementById('boat-back').addEventListener('click', handlers.onBoatBack);
    document.getElementById('options-back').addEventListener('click', handlers.onOptionsBack);
    document.getElementById('options-scoreboard').addEventListener('click', handlers.onScoreboardFromOptions);
    document.getElementById('scoreboard-back').addEventListener('click', handlers.onScoreboardBack);
    document.getElementById('scoreboard-detail-back').addEventListener('click', handlers.onScoreboardDetailBack);
    document.getElementById('options-achievements').addEventListener('click', handlers.onAchievementsFromOptions);
    document.getElementById('achievements-back').addEventListener('click', handlers.onAchievementsBack);
    document.getElementById('scoreboard-clear').addEventListener('click', () => {
      HT.Scoreboard.clearLevel(currentScoreboardLevel.id);
      renderScoreboardTable();
    });
    Array.from(document.querySelectorAll('#scoreboard-mode-tabs .racer-count-btn')).forEach((btn) => {
      btn.addEventListener('click', () => {
        currentScoreboardMode = btn.dataset.mode;
        renderScoreboardTable();
      });
    });
    document.getElementById('controls-back').addEventListener('click', handlers.onControlsBack);

    document.getElementById('pause-resume').addEventListener('click', handlers.onPauseResume);
    document.getElementById('pause-restart').addEventListener('click', handlers.onPauseRestart);
    document.getElementById('pause-options').addEventListener('click', handlers.onOptionsFromPause);
    document.getElementById('pause-quit').addEventListener('click', handlers.onPauseQuit);
    document.getElementById('pause-next-track').addEventListener('click', () => {
      HT.Music.nextTrack();
      updatePauseTrackLabel();
    });

    document.getElementById('finish-track-select-button').addEventListener('click', handlers.onFinishTrackSelect);
    document.getElementById('restart-button').addEventListener('click', handlers.onFinishRestart);
    document.getElementById('finish-menu-button').addEventListener('click', handlers.onFinishQuit);

    document.getElementById('pause-button').addEventListener('click', handlers.onPauseButtonClick);

    renderModeList(document.getElementById('mode-list'), handlers.onModeChosen);
    HT.Coop.setCallbacks({
      onChange: renderPlayersList,
      onStart: () => handlers.onPlayersStart(),
      onBack: () => handlers.onPlayersBack(),
    });
    renderPlayersList();
    refreshLevelDifficultyRow = renderDifficultyRow(document.getElementById('difficulty-options'));
    refreshCupDifficultyRow = renderDifficultyRow(document.getElementById('cup-difficulty-options'));
    renderLevelList(document.getElementById('level-list'), handlers.onLevelChosen);
    renderLevelList(document.getElementById('scoreboard-level-list'), handlers.onScoreboardCourseChosen);
    renderCupList(document.getElementById('cup-list'), handlers.onCupChosen);
    renderBoatList(document.getElementById('boat-list'), handlers.onBoatChosen);
    document.getElementById('boat-gimmick-info-btn').addEventListener('click', openFullGimmickInfo);
    bindOptionsForm();
    applyAccessibilitySettings();
    bindSaveDataForm();
    renderControlsList();
    renderGamepadRebindList();
    refreshLevelRacerRow = bindRacerCountRow('racer-count-options');
    refreshCupRacerRow = bindRacerCountRow('cup-racer-count-options');
    bindClickSound('.menu-btn, .level-card:not(.locked), #pause-button, .boat-gimmick-bar-btn, .racer-count-btn');
  }

  // Populates the #cup-standings-overlay (js/main.js's advanceCup/finishCup)
  // - used both as the brief interstitial between races in a cup and as the
  // final results screen, distinguished only by the data passed in
  // (title/subtitle text and the continue button's label).
  // data: { title, subtitle, rows: [{ rank, name, points, isPlayer, isLeader }], continueLabel }
  function showCupStandings(data) {
    document.getElementById('cup-standings-title').textContent = data.title;
    document.getElementById('cup-standings-subtitle').textContent = data.subtitle || '';

    const table = document.getElementById('cup-standings-table');
    table.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cup-standings-row header';
    ['#', 'Racer', 'Pts'].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      header.appendChild(span);
    });
    table.appendChild(header);

    data.rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'cup-standings-row' + (row.isPlayer ? ' you' : '') + (row.isLeader ? ' leader' : '');

      const rank = document.createElement('span');
      rank.className = 'csr-rank';
      rank.textContent = row.rank;
      const name = document.createElement('span');
      name.className = 'csr-name';
      name.textContent = row.name;
      const points = document.createElement('span');
      points.className = 'csr-points';
      points.textContent = row.points;

      rowEl.appendChild(rank);
      rowEl.appendChild(name);
      rowEl.appendChild(points);
      table.appendChild(rowEl);
    });

    document.getElementById('cup-standings-continue').textContent = data.continueLabel;
  }

  // Race mode's finish screen - one row per human player (even just one, so
  // solo Race play uses the exact same code path as co-op), ranked by
  // js/main.js's computeRaceOrder. Time Attack/Ring Race (always solo, never
  // routes through here) keep the plain single-line #finish-time text
  // instead - see showSoloFinish.
  // rows: [{ rank, name, time }]
  function showRaceResults(rows) {
    document.getElementById('finish-time').classList.add('hidden');
    const table = document.getElementById('finish-multi-results');
    table.classList.remove('hidden');
    table.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cup-standings-row header';
    ['#', 'Racer', 'Time'].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      header.appendChild(span);
    });
    table.appendChild(header);

    rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'cup-standings-row' + (row.rank === 1 ? ' leader' : '');
      const rank = document.createElement('span');
      rank.className = 'csr-rank';
      rank.textContent = row.rank;
      const name = document.createElement('span');
      name.className = 'csr-name';
      name.textContent = row.name;
      const time = document.createElement('span');
      time.className = 'csr-points';
      time.textContent = row.time;
      rowEl.appendChild(rank);
      rowEl.appendChild(name);
      rowEl.appendChild(time);
      table.appendChild(rowEl);
    });
  }

  // Time Attack / Ring Race finish screen - always exactly one human, so
  // just the single "Your time: mm:ss.xx" line rather than a ranked table.
  function showSoloFinish(timeText) {
    const t = document.getElementById('finish-time');
    t.textContent = timeText;
    t.classList.remove('hidden');
    document.getElementById('finish-multi-results').classList.add('hidden');
  }

  // Redraws just the times table + active mode tab for currentScoreboardLevel
  // /currentScoreboardMode - called on entry, on a mode-tab click, and after
  // Clear Scores, none of which change which screen is showing.
  function renderScoreboardTable() {
    Array.from(document.querySelectorAll('#scoreboard-mode-tabs .racer-count-btn')).forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.mode === currentScoreboardMode);
    });

    const table = document.getElementById('scoreboard-table');
    table.innerHTML = '';
    const entries = HT.Scoreboard.getEntries(currentScoreboardLevel.id, currentScoreboardMode);

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'scoreboard-empty';
      empty.textContent = 'No times recorded yet - go set one!';
      table.appendChild(empty);
      return;
    }

    const header = document.createElement('div');
    header.className = 'cup-standings-row scoreboard-row header';
    ['#', 'Boat', 'Time', 'Date'].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      header.appendChild(span);
    });
    table.appendChild(header);

    entries.forEach((entry, i) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'cup-standings-row scoreboard-row' + (i === 0 ? ' leader' : '');

      const rank = document.createElement('span');
      rank.className = 'csr-rank';
      rank.textContent = i + 1;

      const boat = document.createElement('span');
      boat.className = 'csr-name';
      boat.textContent = (HT.Boats.getById(entry.boatId) || {}).name || entry.boatId;

      const time = document.createElement('span');
      time.className = 'csr-points';
      time.textContent = HT.Scoreboard.formatTime(entry.timeSeconds);

      const date = document.createElement('span');
      date.className = 'csr-date';
      date.textContent = new Date(entry.date).toLocaleDateString();

      rowEl.appendChild(rank);
      rowEl.appendChild(boat);
      rowEl.appendChild(time);
      rowEl.appendChild(date);
      table.appendChild(rowEl);
    });
  }

  // Entry point from js/main.js's onScoreboardCourseChosen - always opens
  // back on the Race tab regardless of which tab was showing for whichever
  // course was last viewed.
  function showScoreboardDetail(level) {
    currentScoreboardLevel = level;
    currentScoreboardMode = 'race';
    document.getElementById('scoreboard-detail-title').textContent = level.name;
    renderScoreboardTable();
  }

  // Redrawn fresh on every visit (see setScreen's 'achievements' branch) -
  // progress can change any time a race finishes, which never re-runs this.
  function renderAchievementsList() {
    const progress = HT.Achievements.getProgress();
    const unlockedCount = HT.Achievements.list.filter((a) => HT.Achievements.isUnlocked(a.id)).length;
    document.getElementById('achievements-progress-subtitle').textContent =
      `${unlockedCount} / ${HT.Achievements.list.length} unlocked`;

    // Cumulative achievements (tracked across many races, not a single
    // pass/fail event) get a live "3/12"-style readout even while locked,
    // so there's visible progress toward them rather than a flat "locked".
    // Keyed by id since it's only a handful, rather than teaching
    // js/achievements.js's getProgress() the display string for each one.
    const progressText = {
      'boat-collector': `${progress.boatsUsed}/${progress.totalBoats} boats`,
      'world-traveler': `${progress.coursesFinished}/${progress.totalCourses} courses`,
      'triple-crown': `${progress.cupsWon}/${progress.totalCups} cups`,
      'century-club': `${Math.min(progress.totalFinishes, progress.centuryTarget)}/${progress.centuryTarget} races`,
    };

    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    HT.Achievements.list.forEach((a) => {
      const unlocked = HT.Achievements.isUnlocked(a.id);
      const row = document.createElement('div');
      row.className = 'cup-standings-row achievement-row ' + (unlocked ? 'unlocked' : 'locked');

      const icon = document.createElement('span');
      icon.className = 'achievement-icon';
      icon.textContent = unlocked ? '🏆' : '🔒';

      const info = document.createElement('span');
      const name = document.createElement('div');
      name.className = 'achievement-name';
      name.textContent = a.name;
      const desc = document.createElement('div');
      desc.className = 'achievement-desc';
      desc.textContent = a.description;
      info.appendChild(name);
      info.appendChild(desc);

      const status = document.createElement('span');
      status.className = 'achievement-status';
      if (unlocked) {
        status.textContent = new Date(HT.Achievements.getUnlockedDate(a.id)).toLocaleDateString();
      } else {
        status.textContent = progressText[a.id] || '';
      }

      row.appendChild(icon);
      row.appendChild(info);
      row.appendChild(status);
      list.appendChild(row);
    });
  }

  // ---- Achievement unlock toast ----
  // Queued rather than shown all at once - more than one achievement can
  // unlock off a single finish (e.g. Boat Collector and Century Club on the
  // same race), and overlapping banners would just be noise.
  let achievementQueue = [];
  let achievementToastTimer = null;
  function showNextAchievementToast() {
    const toastEl = document.getElementById('achievement-toast');
    if (!toastEl) return;
    if (!achievementQueue.length) return;
    const achievement = achievementQueue.shift();
    document.getElementById('achievement-toast-name').textContent = achievement.name;
    toastEl.classList.add('show');
    clearTimeout(achievementToastTimer);
    achievementToastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(showNextAchievementToast, 400);
    }, 3200);
  }
  function announceAchievements(list) {
    if (!list || !list.length) return;
    const wasEmpty = !achievementQueue.length;
    achievementQueue = achievementQueue.concat(list);
    if (wasEmpty) showNextAchievementToast();
  }

  global.HT = global.HT || {};
  global.HT.Menu = {
    init, setScreen, setLevelSelectMode, setModeSelectFilter, showCupStandings,
    showRaceResults, showSoloFinish, setBoatHandoffMode, setBoatSelectHeading,
    showScoreboardDetail, announceAchievements,
  };
})(window);
