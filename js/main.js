// Wires everything together: scene setup, screen/state machine, players
// (1-4 local humans), cameras, loop.
(function () {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 220, 950);

  const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x35603a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 0.95);
  sun.position.set(220, 320, 140);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  // ---------- Sky dome, sun glow, and a drifting cloud layer ----------
  // These live here (not track.js) since they belong to the whole
  // scene/camera, not any one course. All three follow the camera every
  // frame like a conventional skybox (see the end of frame() below), so they
  // read the same near the start of a long point-to-point course as they do
  // a mile down it. applyTheme() re-tints them alongside fog/background, so
  // multi-zone courses (World Tour) blend them too.
  const SKY_RADIUS = 1400;
  const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.renderOrder = -10;
  scene.add(skyDome);

  function setSkyColors(horizonHex, topHex) {
    const horizon = new THREE.Color(horizonHex);
    const top = new THREE.Color(topHex);
    const pos = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const f = Math.pow(Math.max(0, pos.getY(i) / SKY_RADIUS), 0.7);
      c.copy(horizon).lerp(top, f);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
  setSkyColors(0x8fd3ff, 0xdff3ff);

  function buildGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }
  const sunDir = new THREE.Vector3(220, 320, 140).normalize();
  const sunMat = new THREE.SpriteMaterial({
    map: buildGlowTexture(), color: 0xfff2d0, transparent: true, fog: false,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.set(260, 260, 1);
  sunSprite.renderOrder = -9;
  scene.add(sunSprite);

  // A handful of low-poly cloud puffs on a ring around the camera, sharing
  // one geometry/material - cheap enough that individual meshes (rather than
  // merging) are simplest.
  const CLOUD_COUNT = 16;
  const cloudGroup = new THREE.Group();
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.85, fog: true,
  });
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const angle = (i / CLOUD_COUNT) * Math.PI * 2 + (i % 3) * 0.35;
    const radius = 620 + ((i * 53) % 220);
    const height = 170 + ((i * 37) % 140);
    const cx = Math.cos(angle) * radius, cz = Math.sin(angle) * radius;
    const puffCount = 3 + (i % 3);
    for (let p = 0; p < puffCount; p++) {
      const mesh = new THREE.Mesh(cloudGeo, cloudMat);
      const ox = Math.sin(i * 4 + p * 2.2) * 32;
      const oz = Math.cos(i * 3 + p * 1.7) * 32;
      const oy = Math.cos(p * 1.3) * 10;
      mesh.position.set(cx + ox, height + oy, cz + oz);
      const sx = 22 + ((p * 7) % 18);
      mesh.scale.set(sx, sx * 0.6, sx * 0.9);
      cloudGroup.add(mesh);
    }
  }
  scene.add(cloudGroup);

  // Keeps the dome/sun/clouds centered on whichever camera(s) are actually
  // in view every frame, like a skybox: every active player's camera while
  // racing (an even blend in co-op, identical to the single-camera behavior
  // with just one), the attract-mode camera on the main menu, or player[0]'s
  // own camera on every other menu screen.
  const skyCenter = new THREE.Vector3();
  function updateSky(dt) {
    const cams = screen === 'playing' ? players.map((p) => p.camera)
      : (screen === 'menu' && attractCam) ? [attractCam.camera]
      : [players[0].camera];
    skyCenter.set(0, 0, 0);
    cams.forEach((c) => skyCenter.add(c.position));
    skyCenter.multiplyScalar(1 / cams.length);
    skyDome.position.copy(skyCenter);
    sunSprite.position.copy(skyCenter).addScaledVector(sunDir, 1200);
    cloudGroup.position.set(skyCenter.x, 0, skyCenter.z);
    cloudGroup.rotation.y += dt * 0.01;
  }

  // Ring Race needs the boat's position from just before this frame's move
  // too (see checkRingProgress), to catch a fast-moving crossing between two
  // frames instead of only ever sampling a single instant. The y component
  // holds the STATIC base track elevation under the boat (nearest.samplePos.y),
  // not its wave-bobbed groundY - the checkpoint gate is a fixed structure
  // that doesn't bob with the water, so measuring against the animated
  // surface just added up to a couple of units of pure noise against rings
  // whose radius can shrink to only 3-5 units, causing "clean" passes to
  // register as narrowly missed depending on wave phase alone. Ring Race is
  // solo-only, so these always track players[0].
  const prevBoatPos = new THREE.Vector3();
  const currBoatPos = new THREE.Vector3();

  function maxBoostFuel(b) {
    return HT.PHYS.BOOST_MAX_FUEL * b.boostMult;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }

  function ordinalSuffix(n) {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  // ---------- Players: 1-4 local humans ----------
  // Every mode always has at least players[0] - even Time Attack/Ring Race,
  // which are strictly solo and never touch js/coop.js at all. This is what
  // keeps solo play a plain byproduct of the general path (players.length
  // === 1, one full-window viewport) instead of a second implementation to
  // maintain alongside co-op. Each entry mirrors the shape js/ai.js's racer
  // objects already use ({nextCheckpointIdx, lap, finished, t, finishOrder})
  // so progress-tracking code (see HT.RaceProgress) treats humans and AI
  // uniformly.
  let players = [];

  function makePlayerEntry(index, name, controllerType, gamepadIndex, getBoatConfig, accentColor) {
    const source = controllerType === 'keyboard' ? { type: 'keyboard' }
      : controllerType === 'gamepad' ? { type: 'gamepad', gamepadIndex }
      : HT.Input.getDefaultSoloSource();
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2500);
    camera.position.set(0, 40, 90);
    camera.lookAt(0, 0, 0);
    const boatConfig = getBoatConfig();
    const boat = new HT.Boat(boatConfig);
    scene.add(boat.mesh);
    scene.add(boat.wakeTrail.mesh);
    return {
      slot: index, name, controllerType, getBoatConfig, boatConfig, boat,
      input: HT.Input.createPoller(source),
      hud: new HT.PlayerHud(),
      camera, camPos: new THREE.Vector3(), camTargetPos: new THREE.Vector3(),
      camInit: false, cameraModeIndex: 0,
      viewportRect: { x: 0, y: 0, w: 1, h: 1 },
      accentColor,
      nextCheckpointIdx: 1, lap: 1, finished: false, t: 0, finishOrder: null,
      elapsed: 0, bumpCooldown: 0,
      // Collision-count for this attempt only (js/achievements.js's Flawless
      // Victory) - reset in startLevel, incremented alongside every real
      // audio.bump() below (both the track/wall case and the boat-vs-boat
      // case), never just while bumpCooldown is still ticking down.
      collisionCount: 0,
    };
  }

  function disposePlayers() {
    players.forEach((p) => {
      HT.Boat.dispose(scene, p.boat);
      p.hud.dispose();
    });
    players = [];
  }

  // Time Attack / Ring Race / the main menu's own BOATS flow - exactly one
  // player, reading HT.Boats.getSelected() fresh every race (same timing as
  // the original single-player code), keyboard+touch+whichever gamepad
  // connected all merged (see js/input.js's 'solo' source).
  function makeSoloPlayers() {
    disposePlayers();
    players = [makePlayerEntry(0, 'You', 'solo', null, () => HT.Boats.getSelected(), null)];
    players[0].hud.setLabel('');
  }

  // Race/Cup local co-op - one entry per player who joined on the Players
  // screen (js/coop.js), boat chosen during the sequential hand-off
  // (js/main.js's startBoatHandoff). Captures the live joinedPlayers array
  // reference so getBoatConfig always reflects the current boatId even if
  // this is called again later (e.g. re-running hand-off via CHANGE BOAT).
  function makeCoopPlayers() {
    disposePlayers();
    const joined = HT.Coop.getJoinedPlayers();
    players = joined.map((jp, i) => makePlayerEntry(
      i, 'Player ' + (i + 1), jp.controllerType, jp.gamepadIndex,
      () => HT.Boats.getById(jp.boatId) || HT.Boats.list[0],
      HT.Coop.accentColor(i)
    ));
    players.forEach((p) => p.hud.setLabel(p.name, p.accentColor));
  }

  const minimap = new HT.Minimap();
  const audio = HT.Audio;

  makeSoloPlayers();

  // ---------- Main menu "attract mode" ----------
  // A course with a handful of AI racing on a loop, shown as a live
  // background behind the main menu (see #main-menu's CSS, which is
  // deliberately translucent, and setScreen below, which starts/stops this).
  // Entirely separate track/racer state from the real
  // currentTrack/aiRacers/players used for actual races - only ever active
  // while screen === 'menu', torn down the instant the player heads anywhere
  // else so it never competes with (or gets confused for) a real race's own
  // track/AI in the same scene.
  //
  // Declared here (before setScreen('menu') is first called a bit below)
  // rather than down near updateCamera/CAMERA_MODES where the rest of the
  // camera code lives - those are only ever read from inside frame(), well
  // after the whole script has finished running, but startAttractMode()
  // itself runs synchronously the moment setScreen('menu') first fires, so
  // these `let`s need to already be past their declaration (out of the
  // temporal dead zone) by then, not just eventually hoisted.
  const ATTRACT_AI_COUNT = 6;
  const ATTRACT_SWITCH_SECONDS = 9;
  let attractLevel = null;
  let attractTrack = null;
  let attractRacers = [];
  let attractCam = null;
  let attractElapsed = 0;
  let attractSwitchTimer = 0;

  function pickAttractLevel() {
    // Loop tracks only - AI on a point-to-point course would each reach the
    // finish once and just sit there, since there's no lap to reset them
    // into short of tearing the whole thing down and rebuilding.
    const eligible = HT.Levels.list.filter((l) => !l.locked && l.loop !== false);
    const pool = eligible.length ? eligible : HT.Levels.list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Picks a new AI to follow (and a fresh chase-style camera angle) every
  // ATTRACT_SWITCH_SECONDS, so the background doesn't just stare at the same
  // boat the whole time anyone sits on the main menu.
  function pickAttractBoat() {
    if (!attractRacers.length) return;
    const racer = attractRacers[Math.floor(Math.random() * attractRacers.length)];
    attractCam.racer = racer;
    attractCam.boat = racer.boat;
    attractCam.cameraModeIndex = Math.floor(Math.random() * 3); // chase-style modes only (0-2) - never Cockpit, too disorienting for a background loop
    attractCam.camInit = false;
    attractSwitchTimer = ATTRACT_SWITCH_SECONDS;
  }

  function startAttractMode() {
    if (attractTrack) return;
    attractLevel = pickAttractLevel();
    attractTrack = HT.Track.build(scene, attractLevel);
    applyTheme(attractTrack.theme);
    const difficulty = HT.Difficulty.getById('medium');
    attractRacers = HT.AI.createRacers(attractTrack, [], ATTRACT_AI_COUNT, difficulty);
    attractRacers.forEach((r) => { scene.add(r.boat.mesh); scene.add(r.boat.wakeTrail.mesh); });
    const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2500);
    attractCam = { camera, camPos: new THREE.Vector3(), camTargetPos: new THREE.Vector3(), camInit: false, cameraModeIndex: 0, boat: null, racer: null };
    attractElapsed = 0;
    pickAttractBoat();
  }

  function stopAttractMode() {
    if (!attractTrack) return;
    HT.Track.dispose(scene, attractTrack);
    attractRacers.forEach((r) => HT.Boat.dispose(scene, r.boat));
    attractLevel = null;
    attractTrack = null;
    attractRacers = [];
    attractCam = null;
  }

  // Simplified version of checkBoostPads() for the attract-mode roster - no
  // audio/pad-dimming (nobody's actually there to see or hear it), just the
  // refill itself, so racers keep boosting indefinitely instead of draining
  // their starting tank once and going flat for the rest of the demo loop.
  function checkAttractBoostPads() {
    attractRacers.forEach((r) => {
      const b = r.boat;
      attractTrack.boostPads.forEach((pad) => {
        const remaining = Math.max(0, (pad.hitCooldowns.get(b) || 0) - 1);
        if (remaining > 0) { pad.hitCooldowns.set(b, remaining); return; }
        const magnet = b.getGimmick && b.getGimmick('magnet');
        const radius = magnet ? 8 * magnet.radiusMult : 8;
        const refill = HT.PHYS.BOOST_PAD_REFILL * (magnet ? magnet.refillMult : 1);
        const dx = b.position.x - pad.pos.x;
        const dz = b.position.z - pad.pos.z;
        if (dx * dx + dz * dz < radius * radius) {
          b.boostFuel = Math.min(maxBoostFuel(b), b.boostFuel + refill);
          pad.hitCooldowns.set(b, 240);
        } else {
          pad.hitCooldowns.set(b, 0);
        }
      });
    });
  }

  function updateAttractMode(dt) {
    attractElapsed += dt;
    attractTrack.updateWater(attractElapsed);
    checkAttractBoostPads();
    if (attractLevel.themeZones && attractCam.racer) applyTheme(attractTrack.themeAt(attractCam.racer.t));
    attractRacers.forEach((r) => {
      const result = HT.AI.update(r, dt, attractTrack, attractElapsed, false);
      r.t = result.nearest.t;
      // Loop forever instead of grinding to a halt once "the race" ends -
      // this is a background visual, not an actual race with a winner.
      if (r.finished) {
        r.finished = false;
        r.lap = 1;
        r.nextCheckpointIdx = 1;
      }
    });
    attractSwitchTimer -= dt;
    if (attractSwitchTimer <= 0) pickAttractBoat();
    if (attractCam.boat) updateCamera(attractCam, dt);
  }

  let screen = 'menu'; // 'menu' | 'modeSelect' | 'players' | 'levelSelect' | 'cupSelect' | 'cupStandings' | 'boatSelect' | 'options' | 'controls' | 'playing' | 'paused' | 'finished'
  let returnScreen = 'menu'; // where options/controls should go BACK to
  let boatSelectReturn = 'menu'; // where boat select should go BACK to when NOT mid co-op hand-off
  let currentTrack = null;
  let currentLevel = null;
  let currentMode = HT.Modes.getById('timeAttack');
  let aiRacers = [];

  // 'solo' (Time Attack/Ring Race always; Race/Cup too when entered via the
  // main menu's Single Player button) vs 'coop' (Race/Cup entered via Split
  // Screen, routed through the Players join screen even if only one
  // controller ends up joining) - governs whether CHANGE BOAT re-opens the
  // sequential hand-off or the plain single-boat picker (see
  // onLevelChangeBoat/onCupChangeBoat below).
  let activeSessionKind = 'solo';
  // Which of the main menu's two entry buttons got us here - read only by
  // onModeChosen just below to decide whether Race/Cup route through the
  // Players join screen at all. Split Screen always does; Single Player
  // never does, going straight to makeSoloPlayers() exactly like Time
  // Attack/Ring Race already did before Split Screen existed - no more
  // pressing Enter to "join" a race you're the only human in.
  let sessionIntent = 'solo';
  // Where Race/Cup mode selection should land once boat hand-off finishes -
  // 'levelSelect' or 'cupSelect'. Also reused when CHANGE BOAT re-triggers
  // hand-off mid-session, so it lands back on whichever screen asked.
  let pendingModeDestination = 'levelSelect';
  // Non-null only while running the sequential boat hand-off - see
  // startBoatHandoff. { index, total }.
  let boatHandoff = null;

  // ---------- Ghost (best-run replay) ----------
  // Solo sessions only (co-op has no single "you" to race, and Cup already
  // has its own points/standings system - see recordScoreboardTime) - reset
  // in startLevel(), advanced in frame(), saved in recordScoreboardTime.
  const GHOST_SAMPLE_INTERVAL = 0.1; // seconds of race time between samples
  const GHOST_OPACITY = 0.35;
  // Array of [elapsedSeconds, x, y, z, heading] while actively recording
  // this attempt, or null when ghosts don't apply to the current session
  // (co-op, Cup, or no saved ghost worth chasing yet doesn't stop recording
  // - only whether one COULD be saved at the end does).
  let ghostRecording = null;
  let ghostRecordTimer = 0;
  // { boat, samples } for the course's current best run, or null if there
  // isn't one yet - boat is a plain HT.Boat used purely as a posed, non-
  // colliding visual (see loadGhostPlayback/sampleGhostPose), never .update()d.
  let ghostPlayback = null;
  let ghostSampleIdx = 0;

  // Cup mode state - a fixed sequence of levels raced back to back with
  // cumulative placement points (see js/cups.js). cupTotals is built once
  // in startCup() (before the first race) and never touched by startLevel's
  // per-race reset, so points survive across the whole series; only the
  // per-track track/players progress get wiped between races.
  let currentCup = null;
  let cupQueue = [];
  let cupIndex = 0;
  let cupTotals = null; // { players: [{name, points}, ...], ai: [{name, points}, ...] }
  // Stamped onto a racer (human or AI) the moment its own `finished` flag
  // flips true - lets computeRaceOrder rank everyone who's already finished
  // relative to EACH OTHER, not just "before whoever's still racing", since
  // finished/lap/t alone don't preserve finish order.
  let finishOrderCounter = 0;

  // The un-shrunk gate radius (HALF_WIDTH - 6) is sized for a decorative
  // checkpoint arch, not a ring you have to thread - Ring Race starts much
  // smaller than that and shrinks further from there.
  const RING_START_SCALE = 0.32;
  const RING_MIN_SCALE = 0.12;

  // Shared, race-wide state - simTime/countdown apply to everyone at once;
  // ringPassCount/ringTotalPasses are Ring Race only (always solo, so no
  // need for one per player). Per-player lap/checkpoint/elapsed progress
  // lives on each players[] entry instead (see makePlayerEntry) - the same
  // shape js/ai.js's racers already use.
  const raceState = {
    simTime: 0,
    countdown: 0,
    lastCountdownTick: -1,
    ringPassCount: 0,
    ringTotalPasses: 0,
  };
  const COUNTDOWN_SECONDS = 3;
  // Neutral input fed to boat.update()/HT.AI.update() while raceState.countdown
  // is still running, so every racer just sits idle at the start line instead
  // of being able to move before the "GO!".
  const HOLD_INPUT = { throttle: 0, brake: 0, steer: 0, boost: false };
  // Fed to a player's own boat once THEY'VE finished but the race is still
  // running for other co-op players - coasts to a stop via the same normal
  // water drag every other idle boat already has, no new physics needed.
  const FINISHED_INPUT = { throttle: 0, brake: 0, steer: 0, boost: false };

  const MENU_SCREENS = [
    'menu', 'modeSelect', 'players', 'levelSelect', 'cupSelect', 'cupStandings', 'boatSelect', 'options', 'controls',
  ];
  let musicMode = null; // 'menu' | 'race' | 'victory' | null

  // Cup mode races against a full AI grid exactly like Race mode does (Time
  // Attack/Ring Race never build AI) - kept as one helper rather than
  // sprinkling `currentMode.id === 'race' || currentMode.id === 'cup'`
  // everywhere startLevel/finishRaceOverall need to branch on it. Also the
  // gate for whether a mode routes through the Players (co-op join) screen.
  function racesAI() {
    return currentMode.id === 'race' || currentMode.id === 'cup';
  }

  // Ghosts only make sense where there's exactly one "you" to record/chase -
  // co-op has no single human to attribute a run to, and Cup already has
  // its own points/standings system rather than a single course's best time
  // (see js/scoreboard.js, which excludes it the same way).
  function ghostEligible() {
    return activeSessionKind === 'solo' && players.length === 1 && currentMode.id !== 'cup';
  }

  function disposeGhostPlayback() {
    if (ghostPlayback) HT.Boat.dispose(scene, ghostPlayback.boat);
    ghostPlayback = null;
  }

  function makeGhostTransparent(boat) {
    boat.mesh.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => { m.transparent = true; m.opacity = GHOST_OPACITY; m.depthWrite = false; });
    });
  }

  // Linear-interpolates position + shortest-path heading between whichever
  // two recorded samples bracket `t` - ghostSampleIdx remembers last frame's
  // spot so normal forward playback is an O(1) nudge, not a rescan (same
  // trick as boat.js's trackIndexHint).
  function sampleGhostPose(samples, t) {
    while (ghostSampleIdx < samples.length - 2 && samples[ghostSampleIdx + 1][0] <= t) ghostSampleIdx++;
    const a = samples[ghostSampleIdx];
    const b = samples[Math.min(ghostSampleIdx + 1, samples.length - 1)];
    const span = b[0] - a[0];
    const frac = span > 0 ? Math.max(0, Math.min(1, (t - a[0]) / span)) : 0;
    let dh = b[4] - a[4];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    return {
      x: a[1] + (b[1] - a[1]) * frac,
      y: a[2] + (b[2] - a[2]) * frac,
      z: a[3] + (b[3] - a[3]) * frac,
      heading: a[4] + dh * frac,
    };
  }

  // Called from startLevel() - (re)creates the visual ghost boat for
  // whichever course/mode is about to run, or leaves ghostPlayback null if
  // there's no saved ghost yet (or this session doesn't qualify at all).
  function loadGhostPlayback(level) {
    disposeGhostPlayback();
    ghostSampleIdx = 0;
    if (!ghostEligible()) return;
    const ghostData = HT.Ghosts.getGhost(level.id, currentMode.id);
    if (!ghostData || !ghostData.samples.length) return;
    const boatConfig = HT.Boats.getById(ghostData.boatId) || HT.Boats.list[0];
    const boat = new HT.Boat(boatConfig);
    makeGhostTransparent(boat);
    scene.add(boat.mesh);
    ghostPlayback = { boat, samples: ghostData.samples };
    // Pose it at the start line immediately - otherwise it'd sit at the
    // world origin for the whole pre-race countdown until the first
    // playing-frame update below ever runs.
    const pose = sampleGhostPose(ghostPlayback.samples, 0);
    boat.mesh.position.set(pose.x, pose.y, pose.z);
    boat.mesh.rotation.set(0, pose.heading, 0);
  }

  function disposeAiRacers() {
    aiRacers.forEach((r) => HT.Boat.dispose(scene, r.boat));
    aiRacers = [];
  }

  function setScreen(name) {
    screen = name;
    HT.Menu.setScreen(name);
    HT.Coop.setJoinScreenActive(name === 'players');

    // Attract mode only ever runs behind the literal main menu (see its own
    // section below) - every other screen tears it down, including the
    // opaque menus (mode select, options, ...) where it wouldn't be visible
    // anyway, so it never has to coexist with a real race's own track/AI.
    if (name === 'menu') startAttractMode();
    else stopAttractMode();

    if (MENU_SCREENS.indexOf(name) !== -1) {
      if (musicMode !== 'menu') { HT.Music.playMenu(); musicMode = 'menu'; }
    } else if (name === 'playing' || name === 'paused') {
      if (musicMode !== 'race') { HT.Music.playRace(); musicMode = 'race'; }
    } else if (name === 'finished') {
      HT.Music.playVictory();
      musicMode = 'victory';
    }

    // Every screen transition can change whether we're in a multi-viewport
    // 'playing' frame (player count just changed, or we just left/entered
    // 'playing') - recompute viewport rects/camera aspect/HUD layout here
    // rather than needing a matching call at every place `players` changes.
    onResize();
  }

  // Mutates the existing background/fog in place rather than replacing them,
  // since multi-zone courses call this every frame to blend sky/fog as the
  // boat travels (see the 'playing' branch of frame()).
  const skyTopTmp = new THREE.Color();
  const cloudTintTmp = new THREE.Color();
  function applyTheme(theme) {
    if (scene.background && scene.background.isColor) scene.background.setHex(theme.sky);
    else scene.background = new THREE.Color(theme.sky);
    if (scene.fog) {
      scene.fog.color.setHex(theme.sky);
      scene.fog.near = theme.fogNear;
      scene.fog.far = theme.fogFar;
    } else {
      scene.fog = new THREE.Fog(theme.sky, theme.fogNear, theme.fogFar);
    }
    skyTopTmp.set(theme.sky).lerp(new THREE.Color(0xffffff), 0.4);
    setSkyColors(theme.sky, skyTopTmp.getHex());
    cloudTintTmp.set(0xffffff).lerp(new THREE.Color(theme.sky), 0.2);
    cloudMat.color.copy(cloudTintTmp);
  }

  function startLevel(level) {
    if (currentTrack) HT.Track.dispose(scene, currentTrack);
    currentTrack = HT.Track.build(scene, level);
    currentLevel = level;
    applyTheme(currentTrack.theme);
    minimap.setTrack(currentTrack);
    finishOrderCounter = 0;

    disposeAiRacers();
    // Rebuilds each player's Boat instance (fresh physics/mesh state) every
    // time this runs - a restart, or the next race in a cup - while keeping
    // the player's identity/input/camera-mode/HUD DOM alive across the whole
    // session, mirroring the original single-player code (which likewise
    // only ever recreated `boat` itself here, never the camera/input).
    players.forEach((p) => {
      HT.Boat.dispose(scene, p.boat);
      p.boatConfig = p.getBoatConfig();
      p.boat = new HT.Boat(p.boatConfig);
      scene.add(p.boat.mesh);
      scene.add(p.boat.wakeTrail.mesh);
      p.boat.reset(currentTrack);
      p.hud.setTrack(currentTrack);
      p.nextCheckpointIdx = 1;
      p.lap = 1;
      p.finished = false;
      p.finishOrder = null;
      p.t = 0;
      p.elapsed = 0;
      p.bumpCooldown = 0;
      p.collisionCount = 0;
      p.camInit = false;
      p.hud.setFinished(false);
    });

    loadGhostPlayback(level);
    // Forces an immediate push on the first playing-frame this attempt sees
    // (see frame()'s ghost-recording block) rather than waiting a full
    // GHOST_SAMPLE_INTERVAL - otherwise a very short course could finish
    // before ever recording a single sample.
    ghostRecording = ghostEligible() ? [] : null;
    ghostRecordTimer = GHOST_SAMPLE_INTERVAL;

    if (racesAI()) {
      // Player-chosen total field size (4/8/12, picked at level/cup select -
      // see js/menu.js) minus however many humans joined. Boat skins repeat
      // once the field is bigger than the catalog minus humans (see
      // ai.js's createRacers).
      const aiCount = Math.max(0, (HT.Settings.get('racerCount') || 4) - players.length);
      // Read fresh rather than a cached variable - the AI difficulty picker
      // lives right on this same level/cup-select screen, so it can change
      // at any point up to the moment a course is actually picked.
      const difficulty = HT.Difficulty.getById(HT.Settings.get('aiDifficulty'));
      const excludeIds = players.map((p) => p.boatConfig.id);
      aiRacers = HT.AI.createRacers(currentTrack, excludeIds, aiCount, difficulty);
      aiRacers.forEach((r) => { scene.add(r.boat.mesh); scene.add(r.boat.wakeTrail.mesh); });

      // AI fill the grid's front rows (0..aiCount-1); players take the
      // remaining back rows in join order - same "humans start behind the
      // AI field" idea as the original single-player grid, just extended to
      // N humans instead of 1.
      players.forEach((p, i) => {
        const slot = HT.Track.computeGridSlot(currentTrack, aiRacers.length + i);
        p.boat.position.copy(slot.position);
        p.boat.groundY = slot.position.y + currentTrack.waveHeight(slot.position.x, slot.position.z, 0);
        p.boat.mesh.position.set(p.boat.position.x, p.boat.groundY, p.boat.position.z);
      });
    }
    // Time Attack/Ring Race: solo only, boat.reset() above already placed
    // players[0] on pole - nothing else to do.

    prevBoatPos.set(players[0].boat.position.x, currentTrack.startPosition.y, players[0].boat.position.z);

    raceState.countdown = COUNTDOWN_SECONDS;
    raceState.lastCountdownTick = -1;
    raceState.ringPassCount = 0;
    raceState.ringTotalPasses = currentTrack.loop
      ? currentTrack.checkpoints.length * currentTrack.totalLaps
      : currentTrack.checkpoints.length;
    // Checkpoint 0 sits exactly at the spawn point - shrinking it immediately
    // would put the camera right on top of a tiny ring at the start (a close
    // clipping mess). Leave it full-size until the first real pass shrinks
    // everything together, by which point the player is out on the course.
    currentTrack.checkpoints.forEach((cp, i) => {
      const scale = (currentMode.id === 'ringRace' && i !== 0) ? RING_START_SCALE : 1;
      currentTrack.setCheckpointRingScale(cp, scale);
    });
    if (currentMode.id === 'ringRace') updateRingHighlight();

    audio.start();
    setScreen('playing');
  }

  function restartCurrentLevel() {
    if (currentLevel) startLevel(currentLevel);
  }

  function togglePause() {
    if (screen === 'playing') setScreen('paused');
    else if (screen === 'paused') setScreen('playing');
  }

  // Local co-op boat hand-off - reuses the plain single-boat-select screen
  // as-is, once per joined player in sequence ("Player 1 - choose your
  // boat", confirm, then Player 2, ...). Deliberately doesn't touch
  // js/navigation.js's single-cursor focus system: whichever controller is
  // currently "the menu driver" (see HT.Nav.setGamepadIndex below) just
  // drives this screen N times in a row.
  function startBoatHandoff() {
    const joined = HT.Coop.getJoinedPlayers();
    if (!joined.length) return;
    boatHandoff = { index: 0, total: joined.length };
    HT.Menu.setBoatHandoffMode({
      getSelectedId: () => joined[boatHandoff.index].boatId,
      isTaken: (boatId) => joined.some((p, i) => i !== boatHandoff.index && p.boatId === boatId),
    });
    HT.Menu.setBoatSelectHeading(`PLAYER ${boatHandoff.index + 1} — CHOOSE YOUR BOAT`);
    setScreen('boatSelect');
  }

  HT.Menu.init({
    // Single Player shows every mode - Race/Cup included, just without the
    // Players screen (see onModeChosen). Split Screen filters the list down
    // to modes.js's supportsCoop ones (Race/Cup) since Time Attack/Ring
    // Race have no AI grid or second finish time to make split screen mean
    // anything - see js/modes.js.
    onSinglePlayer: () => {
      sessionIntent = 'solo';
      HT.Menu.setModeSelectFilter(null, 'Single Player');
      setScreen('modeSelect');
    },
    onSplitScreen: () => {
      sessionIntent = 'coop';
      HT.Menu.setModeSelectFilter((m) => m.supportsCoop, 'Split Screen — 1-4 players');
      setScreen('modeSelect');
    },
    onModeBack: () => setScreen('menu'),
    onModeChosen: (mode) => {
      currentMode = mode;
      const destination = mode.id === 'cup' ? 'cupSelect' : 'levelSelect';
      // racesAI() is still true for a solo Race/Cup pick (the AI grid is
      // unaffected by session kind) - sessionIntent is what actually
      // decides whether the Players screen is involved at all.
      if (racesAI() && sessionIntent === 'coop') {
        activeSessionKind = 'coop';
        pendingModeDestination = destination;
        HT.Menu.setLevelSelectMode(mode.id === 'race');
        HT.Coop.resetJoin();
        setScreen('players');
        return;
      }
      activeSessionKind = 'solo';
      makeSoloPlayers();
      HT.Menu.setLevelSelectMode(mode.id === 'race');
      setScreen(destination);
    },

    onPlayersBack: () => setScreen('modeSelect'),
    onPlayersStart: () => {
      if (!HT.Coop.getJoinedPlayers().length) return;
      // The pad/keyboard that just pressed "begin" becomes the one driving
      // every subsequent menu (boat hand-off, level/cup select, pause) -
      // without this, js/navigation.js's own "first pad connected" fallback
      // could leave a different player's controller in charge of the menus.
      const first = HT.Coop.getJoinedPlayers()[0];
      if (first.controllerType === 'gamepad') HT.Nav.setGamepadIndex(first.gamepadIndex);
      startBoatHandoff();
    },

    onLevelBack: () => setScreen('modeSelect'),
    onLevelChosen: (level) => { if (!level.locked) startLevel(level); },
    // Lets players change boats without backing all the way out to the main
    // menu and back in through Play - in a co-op session this re-runs the
    // whole hand-off sequence (everyone re-picks) rather than the plain
    // single picker, since co-op boats live in js/coop.js's joinedPlayers,
    // not the single HT.Settings.selectedBoatId slot.
    onLevelChangeBoat: () => {
      if (activeSessionKind === 'coop') { pendingModeDestination = 'levelSelect'; startBoatHandoff(); }
      else { boatSelectReturn = 'levelSelect'; setScreen('boatSelect'); }
    },

    onCupBack: () => setScreen('modeSelect'),
    onCupChosen: (cup) => startCup(cup),
    onCupChangeBoat: () => {
      if (activeSessionKind === 'coop') { pendingModeDestination = 'cupSelect'; startBoatHandoff(); }
      else { boatSelectReturn = 'cupSelect'; setScreen('boatSelect'); }
    },
    // Fires from the single button on the standings screen - its label
    // (set by advanceCup()) already tells the player which of these two
    // things is about to happen.
    onCupStandingsContinue: () => {
      if (cupIndex + 1 >= cupQueue.length) {
        setScreen('menu');
      } else {
        cupIndex += 1;
        startLevel(cupQueue[cupIndex]);
      }
    },

    onBoats: () => { boatSelectReturn = 'menu'; setScreen('boatSelect'); },
    onBoatBack: () => {
      if (boatHandoff) {
        HT.Menu.setBoatHandoffMode(null);
        boatHandoff = null;
        setScreen('players');
        return;
      }
      setScreen(boatSelectReturn);
    },
    onBoatChosen: (boatConfig) => {
      if (boatHandoff) {
        const joined = HT.Coop.getJoinedPlayers();
        joined[boatHandoff.index].boatId = boatConfig.id;
        boatHandoff.index += 1;
        if (boatHandoff.index >= boatHandoff.total) {
          HT.Menu.setBoatHandoffMode(null);
          boatHandoff = null;
          makeCoopPlayers();
          setScreen(pendingModeDestination);
        } else {
          HT.Menu.setBoatSelectHeading(`PLAYER ${boatHandoff.index + 1} — CHOOSE YOUR BOAT`);
          HT.Menu.setBoatHandoffMode({
            getSelectedId: () => joined[boatHandoff.index].boatId,
            isTaken: (id) => joined.some((p, i) => i !== boatHandoff.index && p.boatId === id),
          });
        }
        return;
      }
      HT.Settings.set('selectedBoatId', boatConfig.id);
    },

    onOptionsFromMenu: () => { returnScreen = 'menu'; setScreen('options'); },
    onOptionsFromPause: () => { returnScreen = 'paused'; setScreen('options'); },
    onOptionsBack: () => setScreen(returnScreen),

    // Scoreboard is only ever reached from Options, so unlike Options/
    // Controls above it doesn't need its own returnScreen - back always
    // goes to 'options', and the detail screen's back always goes to the
    // course-picker screen.
    onScoreboardFromOptions: () => setScreen('scoreboard'),
    onScoreboardBack: () => setScreen('options'),
    onScoreboardCourseChosen: (level) => {
      HT.Menu.showScoreboardDetail(level);
      setScreen('scoreboardDetail');
    },
    onScoreboardDetailBack: () => setScreen('scoreboard'),

    // Same reasoning as Scoreboard above - Options is the only door in.
    onAchievementsFromOptions: () => setScreen('achievements'),
    onAchievementsBack: () => setScreen('options'),

    onControlsFromMenu: () => { returnScreen = 'menu'; setScreen('controls'); },
    onControlsBack: () => setScreen(returnScreen),

    onPauseResume: () => setScreen('playing'),
    onPauseRestart: () => restartCurrentLevel(),
    onPauseQuit: () => setScreen('menu'),
    onPauseButtonClick: () => togglePause(),

    onFinishRestart: () => restartCurrentLevel(),
    // currentMode/its racer-count/difficulty settings are untouched here -
    // this just re-opens the same course list rather than resetting mode
    // choice, so setLevelSelectMode doesn't need to be recomputed.
    onFinishTrackSelect: () => setScreen('levelSelect'),
    onFinishQuit: () => setScreen('menu'),
  });
  setScreen('menu');

  window.addEventListener('keydown', (e) => {
    if (HT.Input.isBoundKey('pause', e.code) && !e.repeat) {
      if (screen === 'playing' || screen === 'paused') togglePause();
    }
    if (HT.Input.isBoundKey('camera', e.code) && !e.repeat) {
      // Gamepad Y-button camera-cycles are handled per player every frame
      // (see frame() below, reading each player's own polled state) - this
      // listener only ever fires for a literal keyboard key, which only
      // ever applies to a solo player or a co-op keyboard-fallback player.
      if (screen === 'playing') {
        const kbPlayer = players.find((p) => p.controllerType === 'keyboard' || p.controllerType === 'solo');
        if (kbPlayer) cycleCameraMode(kbPlayer);
      }
    }
  });

  // Health-depleted respawn: puts the boat back at the last checkpoint it
  // actually passed (nextCheckpointIdx - 1, wrapping) rather than the start
  // line, so blowing up costs you the ground since your last checkpoint,
  // not the whole race. Leaves lap/checkpoint progress itself untouched -
  // only position, speed, boost and health reset (see
  // Boat.prototype.respawnAtCheckpoint) - so the racer just resumes toward
  // the same next checkpoint it was already headed for. `player` is the
  // owning players[] entry for a human racer, or null for AI (no HUD/audio
  // cue needed for an AI explosion).
  function handleExplosion(racerBoat, nextCheckpointIdx, player) {
    const cps = currentTrack.checkpoints;
    const lastIdx = ((nextCheckpointIdx - 1) % cps.length + cps.length) % cps.length;
    const cp = cps[lastIdx];
    HT.Boat.spawnExplosion(scene, racerBoat.position);
    racerBoat.respawnAtCheckpoint(cp.pos, cp.tangent, currentTrack, raceState.simTime);
    if (player) {
      audio.explode();
      player.hud.flashCheckpoint('BOAT DESTROYED!');
    }
  }

  // Highlights whichever checkpoint players[0] must thread next (Ring Race
  // is solo-only), so a shrunk-down ring is still easy to spot from a
  // distance.
  function updateRingHighlight() {
    const cps = currentTrack.checkpoints;
    const idx = players[0].nextCheckpointIdx;
    cps.forEach((c, i) => currentTrack.setCheckpointHighlight(c, i === idx));
  }

  function completeLapRingRace() {
    const p = players[0];
    p.lap += 1;
    if (p.lap > currentTrack.totalLaps) {
      p.finished = true;
      p.finishOrder = ++finishOrderCounter;
      finishRaceOverall();
    } else {
      audio.lap();
      p.hud.flashCheckpoint(`LAP ${p.lap} / ${currentTrack.totalLaps}`);
    }
  }

  // Ring Race: fires exactly when the boat's path crosses the checkpoint's
  // plane this frame (not "is the boat currently sitting somewhere in a wide
  // window around it"), and checks the whole segment moved this frame rather
  // than just where the boat ended up.
  //
  // The old version tested only the current instant against a coarse
  // along-track window (~2% of the lap on either side) using solely the
  // lateral/vertical offset - it never actually checked how far ahead or
  // behind the gate the boat was, just whether it was somewhere in that
  // wide window AND happened to be centered enough. That let a boat crossing
  // dead-center well before or after the real gate register early or late,
  // and let a fast (boosted) boat's lateral position change enough between
  // two frames that it was outside the ring's shrunk radius on both the
  // frame just before and the frame just after the gate, without a frame
  // landing inside it - a miss despite genuinely passing through.
  //
  // Interpolating the crossing point along the frame's travel segment fixes
  // both: it only ever fires once the boat is (by construction) within one
  // frame's travel of the gate's exact plane, and it catches the crossing
  // even if neither frame's endpoint alone was inside the ring.
  function checkRingProgress(prevPos, currPos) {
    const p = players[0];
    const cps = currentTrack.checkpoints;
    const cp = cps[p.nextCheckpointIdx];

    const dxPrev = prevPos.x - cp.pos.x, dzPrev = prevPos.z - cp.pos.z;
    const dxCurr = currPos.x - cp.pos.x, dzCurr = currPos.z - cp.pos.z;
    const alongPrev = dxPrev * cp.tangent.x + dzPrev * cp.tangent.z;
    const alongCurr = dxCurr * cp.tangent.x + dzCurr * cp.tangent.z;

    // No sign change this frame -> didn't cross the gate's plane at all.
    if (alongPrev === alongCurr || (alongPrev > 0) === (alongCurr > 0)) return;
    // A same-frame jump this big is a teleport (restart/respawn), not real
    // motion - ignore it rather than risk a bogus trigger right after one.
    if (Math.abs(alongCurr - alongPrev) > 20) return;

    const frac = alongPrev / (alongPrev - alongCurr);
    const perpX = -cp.tangent.z, perpZ = cp.tangent.x;
    const lateralPrev = dxPrev * perpX + dzPrev * perpZ;
    const lateralCurr = dxCurr * perpX + dzCurr * perpZ;
    const lateral = lateralPrev + (lateralCurr - lateralPrev) * frac;
    // prevPos.y/currPos.y are the boat's STATIC base elevation (see
    // prevBoatPos above), not its wave-bobbed height - the gate doesn't bob
    // with the water, so checking against the animated surface would fail a
    // clean pass whenever a wave crest/trough happened to coincide with it.
    // centerYOffset scales down with the ring (matching setCheckpointRingScale)
    // so the vertical demand stays a small, constant fraction of the current
    // radius instead of swallowing the whole thing once the ring is small.
    const centerY = cp.pos.y + cp.centerYOffset * cp.ringScale;
    const verticalPrev = prevPos.y - centerY;
    const verticalCurr = currPos.y - centerY;
    const vertical = verticalPrev + (verticalCurr - verticalPrev) * frac;
    const radius = cp.baseRadius * cp.ringScale;
    if (lateral * lateral + vertical * vertical > radius * radius) return; // missed - circle back and thread it properly

    raceState.ringPassCount += 1;
    const factor = RING_START_SCALE - Math.min(1, raceState.ringPassCount / raceState.ringTotalPasses) * (RING_START_SCALE - RING_MIN_SCALE);
    cps.forEach((c) => currentTrack.setCheckpointRingScale(c, factor));

    if (currentTrack.loop) {
      if (p.nextCheckpointIdx === 0) {
        completeLapRingRace();
      } else {
        audio.checkpoint();
        p.hud.flashCheckpoint('RING!');
      }
      p.nextCheckpointIdx = (p.nextCheckpointIdx + 1) % cps.length;
    } else if (p.nextCheckpointIdx === cps.length - 1) {
      p.finished = true;
      p.finishOrder = ++finishOrderCounter;
      finishRaceOverall();
    } else {
      audio.checkpoint();
      p.hud.flashCheckpoint('RING!');
      p.nextCheckpointIdx += 1;
    }
    updateRingHighlight();
  }

  // Called once a human player's own `finished` flag flips true (Race/Cup/
  // Time Attack path). The race itself keeps running until every human is
  // done (see frame()'s players.every(finished) check) - this just marks
  // this one player's own boat/HUD as done in the meantime.
  function onPlayerFinished(p) {
    p.hud.flashCheckpoint('FINISHED!');
    p.hud.setFinished(true);
  }

  // Ranks every racer - human and AI alike - by finish order (for those
  // already done) then live progress (for those still racing). Called every
  // frame for the live HUD place number, and once more at race end for
  // scoring/results - inherently an approximation for AI-vs-AI order among
  // those still racing relative to whenever the LAST human finishes, since
  // there's no way to know how they'd have finished relative to each other
  // otherwise.
  function computeRaceOrder() {
    const humanEntries = players.map((p, i) => ({ kind: 'human', index: i, e: p }));
    const aiEntries = aiRacers.map((r, i) => ({ kind: 'ai', index: i, e: r }));
    const all = humanEntries.concat(aiEntries);
    const finished = all.filter((x) => x.e.finished).sort((a, b) => a.e.finishOrder - b.e.finishOrder);
    const racing = all.filter((x) => !x.e.finished).sort((a, b) => {
      const pa = currentTrack.loop ? (a.e.lap - 1) + a.e.t : a.e.t;
      const pb = currentTrack.loop ? (b.e.lap - 1) + b.e.t : b.e.t;
      return pb - pa;
    });
    return finished.concat(racing);
  }

  // Cup mode only - tallies this race's placement points into cupTotals
  // (built once in startCup(), untouched by startLevel's per-race reset).
  function awardCupPoints() {
    computeRaceOrder().forEach((entry, i) => {
      const points = HT.Cups.pointsForPlace(i + 1);
      if (entry.kind === 'human') cupTotals.players[entry.index].points += points;
      else cupTotals.ai[entry.index].points += points;
    });
  }

  // Cup mode only - the current cumulative standings, sorted best-first,
  // for js/menu.js's showCupStandings table.
  function buildCupStandingsRows() {
    const all = [
      ...cupTotals.players.map((p) => ({ name: p.name, points: p.points, isPlayer: true })),
      ...cupTotals.ai.map((a) => ({ name: a.name, points: a.points, isPlayer: false })),
    ];
    all.sort((a, b) => b.points - a.points);
    const topScore = all[0].points;
    return all.map((entry, i) => ({
      rank: i + 1, name: entry.name, points: entry.points,
      isPlayer: entry.isPlayer, isLeader: entry.points === topScore,
    }));
  }

  // Cup mode only - called from finishRaceOverall() once this race's points
  // are tallied. Shows the standings-so-far interstitial and waits for the
  // player to continue (onCupStandingsContinue above), or - on the cup's
  // last race - shows the final results with the overall winner highlighted.
  function advanceCup() {
    const isLastRace = cupIndex + 1 >= cupQueue.length;
    const rows = buildCupStandingsRows();
    if (isLastRace) {
      const winner = rows[0];
      if (winner.isPlayer) {
        const unlocked = HT.Achievements.onCupWon(currentCup.id);
        if (unlocked.length) HT.Menu.announceAchievements(unlocked);
      }
      HT.Menu.showCupStandings({
        title: 'CUP COMPLETE',
        subtitle: winner.isPlayer ? `${winner.name} wins the cup!` : `${winner.name} wins the cup.`,
        rows,
        continueLabel: 'MAIN MENU',
      });
    } else {
      HT.Menu.showCupStandings({
        title: `${currentCup.name.toUpperCase()} — STANDINGS`,
        subtitle: `Race ${cupIndex + 1} of ${cupQueue.length} complete`,
        rows,
        continueLabel: 'NEXT RACE',
      });
    }
    setScreen('cupStandings');
  }

  // Sets up a fresh cupTotals (one entry per human player plus one per AI
  // racer this cup will ever have, the AI ones named after the boat each
  // will consistently be assigned - see HT.AI.createRacers's
  // pool[i % pool.length] cycling, which is deterministic as long as no
  // player's boat/the racer count changes mid-cup) and starts the first race.
  function startCup(cup) {
    currentCup = cup;
    cupQueue = cup.levelIds.map(HT.Levels.getById).filter(Boolean);
    cupIndex = 0;
    const aiCount = Math.max(0, (HT.Settings.get('racerCount') || 4) - players.length);
    const excludeIds = players.map((p) => p.getBoatConfig().id);
    const pool = HT.Boats.list.filter((b) => excludeIds.indexOf(b.id) === -1);
    cupTotals = {
      players: players.map((p) => ({ name: p.name, points: 0 })),
      ai: Array.from({ length: aiCount }, (_, i) => ({ name: pool[i % pool.length].name, points: 0 })),
    };
    startLevel(cupQueue[0]);
  }

  // Called once every human player has finished (frame()'s
  // players.every(p => p.finished) check) or, for Ring Race, the instant its
  // one player finishes (see checkRingProgress/completeLapRingRace above).
  // Cup mode is deliberately excluded - it already has its own points/
  // standings system (js/cups.js) and isn't a single course anyway, so it
  // never reaches the scoreboard. See js/scoreboard.js.
  function recordScoreboardTime(p) {
    if (!currentLevel) return;
    const boatId = p.getBoatConfig().id;
    const rank = HT.Scoreboard.recordTime(currentLevel.id, currentMode.id, {
      boatId,
      timeSeconds: p.elapsed,
      date: Date.now(),
    });
    // Only a new #1 replaces the saved ghost - a rank 2-5 time is still a
    // personal top-5 but shouldn't overwrite the run someone would actually
    // want to chase. ghostRecording is null for anything not ghostEligible()
    // (co-op, Cup), which already excludes p from being anyone but
    // players[0] here - see finishRaceOverall's two call sites below.
    if (rank === 1 && ghostRecording && ghostRecording.length) {
      // Checked (and the Ghost Hunter achievement fired, if so) *before*
      // saveGhost overwrites whatever was there - otherwise this could
      // never tell "beat an existing ghost" apart from "no ghost existed
      // yet, so this trivially became #1".
      const hadGhostBefore = !!HT.Ghosts.getGhost(currentLevel.id, currentMode.id);
      HT.Ghosts.saveGhost(currentLevel.id, currentMode.id, boatId, ghostRecording);
      if (hadGhostBefore) {
        const unlocked = HT.Achievements.onGhostBeaten();
        if (unlocked.length) HT.Menu.announceAchievements(unlocked);
      }
    }
  }

  // Companion to recordScoreboardTime, called alongside it at both of
  // finishRaceOverall's call sites - kept separate rather than folded in
  // since achievements need a bit more context (this player's actual race
  // placement, their collision count) that scoreboard/ghost never do.
  // racePlace: 1-based finish placement out of the whole grid, Race mode
  // only (null for Time Attack/Ring Race - see js/achievements.js).
  function recordAchievements(p, racePlace) {
    if (!currentLevel) return;
    const unlocked = HT.Achievements.onRaceFinish({
      modeId: currentMode.id,
      levelId: currentLevel.id,
      mirrorOf: currentLevel.mirrorOf || null,
      boatId: p.getBoatConfig().id,
      place: racePlace,
      collisionCount: p.collisionCount || 0,
      racerCount: HT.Settings.get('racerCount') || 4,
      mirrored: !!currentLevel.mirrorOf,
    });
    if (unlocked.length) HT.Menu.announceAchievements(unlocked);
  }

  function finishRaceOverall() {
    if (currentMode.id === 'cup') {
      awardCupPoints();
      advanceCup();
      return;
    }
    if (currentMode.id === 'race') {
      const order = computeRaceOrder();
      // Kept unsorted (aligned 1:1 with `players`) so recordAchievements
      // below can look up each player's own placement by index - the sorted
      // `rows` passed to showRaceResults is a separate copy, since display
      // order and "which player is this" are different concerns here.
      const places = players.map((p, i) => order.findIndex((x) => x.kind === 'human' && x.index === i) + 1);
      const rows = players.map((p, i) => ({
        rank: places[i],
        name: p.name,
        time: formatTime(p.elapsed),
      })).sort((a, b) => a.rank - b.rank);
      HT.Menu.showRaceResults(rows);
      players.forEach((p, i) => {
        recordScoreboardTime(p);
        recordAchievements(p, places[i]);
      });
    } else {
      HT.Menu.showSoloFinish(`Your time: ${formatTime(players[0].elapsed)}`);
      recordScoreboardTime(players[0]);
      recordAchievements(players[0], null);
    }
    setScreen('finished');
  }

  // Checked against every human AND every AI racer - now that boost has no
  // passive regen (see boat.js), pads are the ONLY way anyone refuels, so AI
  // needs the same access or it'd drain its starting tank once and never
  // boost again for the rest of the race. Each boat gets its OWN cooldown on
  // a given pad (pad.hitCooldowns, keyed by boat reference) rather than one
  // cooldown shared by the whole field - otherwise whichever racer reached a
  // pad first would refuel and lock everyone else out of it for the next 4
  // seconds, even though they never got anything from it themselves.
  function checkBoostPads() {
    const boats = players.map((p) => p.boat).concat(aiRacers.map((r) => r.boat));
    for (const pad of currentTrack.boostPads) {
      boats.forEach((b) => {
        const remaining = Math.max(0, (pad.hitCooldowns.get(b) || 0) - 1);
        if (remaining > 0) {
          pad.hitCooldowns.set(b, remaining);
          return;
        }
        // Salvager only: pulls pads in from farther away and tops off a
        // little fuller, via its magnet gimmick - defaults to the plain
        // 8-unit radius/flat refill for every other boat.
        const magnet = b.getGimmick && b.getGimmick('magnet');
        const radius = magnet ? 8 * magnet.radiusMult : 8;
        const refill = HT.PHYS.BOOST_PAD_REFILL * (magnet ? magnet.refillMult : 1);
        const dx = b.position.x - pad.pos.x;
        const dz = b.position.z - pad.pos.z;
        if (dx * dx + dz * dz < radius * radius) {
          b.boostFuel = Math.min(maxBoostFuel(b), b.boostFuel + refill);
          pad.hitCooldowns.set(b, 240);
          if (players.some((p) => p.boat === b)) audio.boost();
        } else {
          pad.hitCooldowns.set(b, 0);
        }
      });
      // Visual dimming reflects whichever human could use this pad soonest -
      // it's one shared 3D mesh, so it can't represent every player's own
      // cooldown individually; showing it as available the moment ANY human
      // could benefit reads better than picking one player arbitrarily.
      const minCooldown = players.length ? Math.min(...players.map((p) => pad.hitCooldowns.get(p.boat) || 0)) : 0;
      pad.mesh.material.opacity = minCooldown > 0 ? 0.25 : 0.85;
    }
  }

  // Camera rig - cyclable per player via the "camera" binding (Y on a
  // gamepad, KeyC by default on keyboard - see js/input.js and the
  // pause-key-style listener above). The three 'chase' modes are just a
  // different behind-distance/height/look-ahead recipe fed into the same
  // smoothing/lerp logic, so adding one never needs to touch the actual
  // follow behavior. 'cockpit' is its own kind: rigidly attached at the helm
  // with no smoothing lag (see updateCamera), paired with the on-screen
  // gauges in js/hud.js - shown only in solo play (see frame()), since
  // there's no room to duplicate the dashboard once per split-screen
  // viewport.
  const CAMERA_MODES = [
    { name: 'Chase', kind: 'chase', behindBase: 13, behindSpeedScale: 0.05, behindMax: 6, height: 6.2, lookAhead: 6, lookHeight: 1.5 },
    { name: 'Close', kind: 'chase', behindBase: 8, behindSpeedScale: 0.03, behindMax: 4, height: 3.6, lookAhead: 4, lookHeight: 1.0 },
    { name: 'Far', kind: 'chase', behindBase: 21, behindSpeedScale: 0.07, behindMax: 9, height: 11, lookAhead: 9, lookHeight: 2.2 },
    { name: 'Cockpit', kind: 'cockpit', forwardOffset: -1.5, height: 2.0, lookAhead: 50 },
  ];

  function cycleCameraMode(p) {
    p.cameraModeIndex = (p.cameraModeIndex + 1) % CAMERA_MODES.length;
    // Force a hard cut to the new mode's own position next frame instead of
    // lerping from wherever the old mode was - a smoothed pan from a chase
    // position into the cockpit (or back out) would drift through the
    // boat's own geometry along the way.
    p.camInit = false;
    p.hud.flashCheckpoint('CAMERA: ' + CAMERA_MODES[p.cameraModeIndex].name.toUpperCase());
  }

  function updateCamera(p, dt) {
    const mode = CAMERA_MODES[p.cameraModeIndex];
    const boat = p.boat;
    const forward = new THREE.Vector3(Math.sin(boat.heading), 0, Math.cos(boat.heading));

    if (mode.kind === 'cockpit') {
      // Rigidly attached at the helm - no lag, so it feels like you're
      // actually standing at the wheel rather than the boat swimming
      // underneath a floating camera. Height/offset are tuned against the
      // default hull; not pixel-perfect for every hull style, but close
      // enough not to clip into the windshield on any of them.
      p.camPos.copy(boat.mesh.position)
        .addScaledVector(forward, mode.forwardOffset)
        .add(new THREE.Vector3(0, mode.height, 0));
      p.camTargetPos.copy(p.camPos).addScaledVector(forward, mode.lookAhead);
      p.camInit = true;
    } else {
      const behindDist = mode.behindBase + Math.min(mode.behindMax, Math.abs(boat.speed) * mode.behindSpeedScale);
      const desired = boat.mesh.position.clone()
        .addScaledVector(forward, -behindDist)
        .add(new THREE.Vector3(0, mode.height, 0));
      const lookTarget = boat.mesh.position.clone()
        .addScaledVector(forward, mode.lookAhead)
        .add(new THREE.Vector3(0, mode.lookHeight, 0));

      if (!p.camInit) {
        p.camPos.copy(desired);
        p.camTargetPos.copy(lookTarget);
        p.camInit = true;
      } else {
        const lerpAmt = 1 - Math.pow(0.0008, dt);
        p.camPos.lerp(desired, lerpAmt);
        p.camTargetPos.lerp(lookTarget, lerpAmt);
      }
    }
    p.camera.position.copy(p.camPos);
    p.camera.lookAt(p.camTargetPos);
  }

  function addDivider(container, rect) {
    const el = document.createElement('div');
    el.className = 'split-divider';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
    container.appendChild(el);
  }

  // Thin CSS strips between viewports in split-screen (not a WebGL effect -
  // the render loop below just draws each viewport back to back into the
  // same canvas with no gap).
  function updateSplitDividers(rects, w, h) {
    const container = document.getElementById('split-dividers');
    container.innerHTML = '';
    if (!rects) return;
    const thickness = 3;
    const cssRects = rects.map((r) => HT.Viewport.toCssRect(r, h));
    if (rects.length === 2) {
      addDivider(container, { left: cssRects[0].width - thickness / 2, top: 0, width: thickness, height: h });
    } else {
      // 3P (top pair + full bottom) and 4P (2x2) share the same cross layout.
      addDivider(container, { left: cssRects[0].width - thickness / 2, top: 0, width: thickness, height: cssRects[0].height });
      addDivider(container, { left: 0, top: cssRects[0].height - thickness / 2, width: w, height: thickness });
    }
  }

  // Recomputes each player's split-screen viewport rect, camera aspect, and
  // HUD position - called on every window resize AND every screen
  // transition (see setScreen), since "is this a multi-viewport 'playing'
  // frame" can change independently of the window size (player count just
  // changed, or we just entered/left 'playing').
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    const multi = screen === 'playing' && players.length > 1;
    const rects = multi ? HT.Viewport.computeRects(players.length, w, h) : null;
    players.forEach((p, i) => {
      const rect = multi ? rects[i] : { x: 0, y: 0, w, h };
      p.viewportRect = rect;
      p.camera.aspect = rect.w / rect.h;
      p.camera.updateProjectionMatrix();
      p.hud.setRect(HT.Viewport.toCssRect(rect, h));
    });
    updateSplitDividers(rects, w, h);
    if (attractCam) {
      attractCam.camera.aspect = w / h;
      attractCam.camera.updateProjectionMatrix();
    }
  }
  window.addEventListener('resize', onResize);
  onResize();

  let lastTime = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.min(dt, 0.05);

    // Polled unconditionally every frame (not just while 'playing') so
    // pause/restart still work from the pause screen, and so a gamepad's
    // internal press-edge tracking never reads a stale press the next time
    // a race actually starts.
    const polled = players.map((p) => p.input.poll());

    if (screen === 'playing') {
      raceState.simTime += dt;
      currentTrack.updateWater(raceState.simTime);
      if (currentMode.id === 'ringRace') currentTrack.updateHighlights(raceState.simTime);

      // Pre-race hold: nobody (human or AI) gets real input until this hits
      // 0, so a race never starts with someone already rolling before "GO!".
      const wasCounting = raceState.countdown > 0;
      if (wasCounting) {
        raceState.countdown = Math.max(0, raceState.countdown - dt);
        const tick = Math.ceil(raceState.countdown);
        if (tick > 0 && tick !== raceState.lastCountdownTick) {
          raceState.lastCountdownTick = tick;
          audio.countdownBeep();
        }
        if (raceState.countdown <= 0) {
          players.forEach((p) => p.hud.flashCheckpoint('GO!'));
          audio.raceStart();
        }
      }
      const counting = raceState.countdown > 0;

      if (!counting) {
        checkBoostPads();
        players.forEach((p) => { p.bumpCooldown = Math.max(0, p.bumpCooldown - dt); });
      }

      const results = players.map((p, i) => {
        const physInput = p.finished ? FINISHED_INPUT : (counting ? HOLD_INPUT : polled[i]);
        const result = p.boat.update(dt, physInput, currentTrack, raceState.simTime);
        p.t = result.nearest.t;
        if (!counting && !p.finished) p.elapsed += dt;
        return result;
      });

      if (currentLevel.themeZones) applyTheme(currentTrack.themeAt(results[0].nearest.t));

      if (!counting) {
        players.forEach((p, i) => {
          const result = results[i];
          if (currentMode.id === 'ringRace') {
            // Solo only - p is always players[0] here.
            currBoatPos.set(p.boat.position.x, result.nearest.samplePos.y, p.boat.position.z);
            checkRingProgress(prevBoatPos, currBoatPos);
            prevBoatPos.copy(currBoatPos);
          } else {
            HT.RaceProgress.advanceCheckpointProgress(p, currentTrack, result.nearest.t, {
              onCheckpoint: () => { audio.checkpoint(); p.hud.flashCheckpoint('CHECKPOINT'); },
              onLap: () => { audio.lap(); p.hud.flashCheckpoint(`LAP ${p.lap} / ${currentTrack.totalLaps}`); },
            });
            if (p.finished && p.finishOrder == null) {
              p.finishOrder = ++finishOrderCounter;
              onPlayerFinished(p);
            }
          }
        });

        if (ghostRecording && !players[0].finished) {
          ghostRecordTimer += dt;
          if (ghostRecordTimer >= GHOST_SAMPLE_INTERVAL) {
            ghostRecordTimer -= GHOST_SAMPLE_INTERVAL;
            const b = players[0].boat;
            ghostRecording.push([players[0].elapsed, b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.heading]);
          }
        }
        if (ghostPlayback) {
          const pose = sampleGhostPose(ghostPlayback.samples, players[0].elapsed);
          ghostPlayback.boat.mesh.position.set(pose.x, pose.y, pose.z);
          ghostPlayback.boat.mesh.rotation.set(0, pose.heading, 0);
        }

        // Engine drone/heartbeat are single continuous audio voices (see
        // js/audio.js) - can't represent up to 4 independent boats at once,
        // so co-op shares one, driven by whichever player is Player 1. A
        // deliberate simplification; one-shot event sounds (checkpoint/lap/
        // bump/boost/explode/...) below fire per player instead, since those
        // can freely overlap.
        const primary = players[0];
        const primaryResult = results[0];
        audio.updateEngine(
          Math.min(1, Math.abs(primary.boat.speed) / (HT.PHYS.MAX_SPEED * primary.boat.speedMult)),
          primaryResult.boosting, primaryResult.inOverdrive
        );
        const rageCfg = primary.boat.getGimmick('rage');
        if (rageCfg) {
          const healthFrac = primary.boat.health / primary.boat.maxHealth;
          const inRage = healthFrac < rageCfg.threshold;
          const intensity = inRage ? Math.max(0, Math.min(1, 1 - healthFrac / rageCfg.threshold)) : 0;
          audio.updateHeartbeat(inRage, intensity);
        } else {
          audio.updateHeartbeat(false, 0);
        }
        HT.updateCockpitGauges(primary.boat.speed * 1.35, primary.boat.boostFuel / maxBoostFuel(primary.boat));

        players.forEach((p, i) => {
          if (p.finished) return; // coasting to a stop while others finish - not part of active collision/damage anymore
          const result = results[i];
          if (result.justLanded) audio.splash();
          if (result.collided && p.bumpCooldown <= 0) {
            if (p.boat.justArmored) { audio.armorClunk(); p.boat.justArmored = false; } else { audio.bump(); }
            p.bumpCooldown = 0.4;
            p.collisionCount++;
          }
          if (result.driftBoostStarted) audio.driftBoost();
          if (p.boat.justRevived) { audio.phoenixRevive(); p.boat.justRevived = false; }
          if (result.exploded) handleExplosion(p.boat, p.nextCheckpointIdx, p);
        });
      } else {
        audio.updateEngine(0, false);
        audio.updateHeartbeat(false, 0);
      }

      players.forEach((p, i) => { if (polled[i].restart) restartCurrentLevel(); });
      if (polled.some((s) => s.pause)) togglePause();
      players.forEach((p, i) => { if (polled[i].cycleCamera) cycleCameraMode(p); });

      if (aiRacers.length) {
        // Rubber-band target: the furthest-along human who hasn't finished
        // yet (co-op keeps the AI pack honest around the leader rather than
        // whoever's trailing; a finished human's frozen progress would
        // otherwise permanently read as "way ahead" and hold every AI at
        // max catch-up speed for the rest of the race - see js/ai.js).
        const activeHumans = players.filter((p) => !p.finished);
        const targetProgress = activeHumans.length
          ? Math.max(...activeHumans.map((p) => (currentTrack.loop ? (p.lap - 1) + p.t : p.t)))
          : null;
        const aiResults = aiRacers.map((r) => HT.AI.update(r, dt, currentTrack, raceState.simTime, counting, targetProgress));

        if (!counting) {
          aiResults.forEach((res, i) => {
            const r = aiRacers[i];
            // Stamped once, the instant this racer's own `finished` flag
            // flips true - see computeRaceOrder, which uses it to rank
            // everyone who's already finished relative to each other
            // (finished/lap/t alone don't preserve finish order).
            if (r.finished && r.finishOrder == null) r.finishOrder = ++finishOrderCounter;
            if (res.exploded) handleExplosion(r.boat, r.nextCheckpointIdx, null);
          });

          // Boat-vs-boat collisions: every pair (human-human, human-AI,
          // AI-AI), not just player-vs-AI, so the field feels solid all
          // around. Boosting takes priority over non-boosting (a launch);
          // same-state pairs just bump off each other. A player who's
          // already finished (coasting, waiting on others) is left out
          // entirely - they shouldn't be able to get bumped/launched/
          // exploded after their own race is already over.
          const racerStates = players.filter((p) => !p.finished).map((p, i) => ({ boat: p.boat, boosting: results[p.slot].boosting, player: p }))
            .concat(aiRacers.map((r, i) => ({ boat: r.boat, boosting: aiResults[i].boosting, player: null })));
          for (let i = 0; i < racerStates.length; i++) {
            for (let j = i + 1; j < racerStates.length; j++) {
              const outcome = HT.Boat.resolveCollision(
                racerStates[i].boat, racerStates[i].boosting,
                racerStates[j].boat, racerStates[j].boosting
              );
              if (outcome) {
                [racerStates[i].player, racerStates[j].player].forEach((p) => {
                  if (p && p.bumpCooldown <= 0) {
                    if (p.boat.justArmored) { audio.armorClunk(); p.boat.justArmored = false; } else { audio.bump(); }
                    p.bumpCooldown = 0.4;
                    p.collisionCount++;
                  }
                });
              }
            }
          }
          // Bumps/launches above can also drop someone to 0 health - catch
          // that here rather than only after a wall hit. A Phoenix/Lucky
          // Break save from one of these ram-caused hits happens after the
          // update()-time justRevived check further up already ran this
          // frame, so it needs its own check here too.
          players.forEach((p) => {
            if (p.finished) return;
            if (p.boat.justRevived) { audio.phoenixRevive(); p.boat.justRevived = false; }
            if (p.boat.health <= 0) handleExplosion(p.boat, p.nextCheckpointIdx, p);
          });
          aiRacers.forEach((r) => {
            r.boat.justRevived = false;
            if (r.boat.health <= 0) handleExplosion(r.boat, r.nextCheckpointIdx, null);
          });
        }
      }

      // Ring Race handles its own finish call inline (checkRingProgress/
      // completeLapRingRace above, the instant its one player finishes) -
      // every other mode waits here for ALL joined humans to be done. An
      // early finisher's boat has already been coasting on FINISHED_INPUT
      // since the frame they crossed the line (see the results.map above).
      if (!counting && currentMode.id !== 'ringRace' && players.length && players.every((p) => p.finished)) {
        finishRaceOverall();
      }

      if (screen === 'playing') {
        // finishRaceOverall() above may have just changed `screen` - this
        // guard skips a stale camera/HUD/minimap update for a race that's
        // already over (the render block below re-checks `screen` itself
        // regardless, so the frame still ends up rendering correctly).
        const order = computeRaceOrder();
        const showPlace = aiRacers.length > 0 || players.length > 1;
        players.forEach((p, i) => {
          const rank = order.findIndex((x) => x.kind === 'human' && x.index === i) + 1;
          let countdownText = null;
          if (counting) countdownText = String(Math.ceil(raceState.countdown));
          else if (p.boat.invulnTimer > 0) countdownText = 'RESPAWNING ' + Math.ceil(p.boat.invulnTimer);

          updateCamera(p, dt);
          p.hud.update({
            lap: p.lap,
            elapsed: p.elapsed,
            boostRatio: p.boat.boostFuel / maxBoostFuel(p.boat),
            boosting: results[i] ? results[i].boosting : false,
            overheated: p.boat.overheated,
            healthRatio: p.boat.health / p.boat.maxHealth,
            speedMph: p.boat.speed * 1.35,
            place: showPlace ? `${rank}${ordinalSuffix(rank)}` : null,
            countdownText,
          });
        });

        minimap.update({
          humans: players.map((p) => ({ x: p.boat.position.x, z: p.boat.position.z, color: p.accentColor })),
          ai: aiRacers.map((r) => ({ x: r.boat.position.x, z: r.boat.position.z, color: r.hullColor })),
        });

        document.getElementById('cockpit-dashboard').classList.toggle(
          'hidden',
          !(players.length === 1 && CAMERA_MODES[players[0].cameraModeIndex].kind === 'cockpit')
        );
      }
    } else if (screen === 'paused') {
      audio.updateEngine(0, false);
      if (polled.some((s) => s.pause)) togglePause();
    } else {
      audio.updateEngine(0, false);
      if (screen === 'menu' && attractTrack) updateAttractMode(dt);
    }

    updateSky(dt);
    if (screen === 'playing' && players.length > 1) {
      renderer.setScissorTest(true);
      players.forEach((p) => {
        renderer.setViewport(p.viewportRect.x, p.viewportRect.y, p.viewportRect.w, p.viewportRect.h);
        renderer.setScissor(p.viewportRect.x, p.viewportRect.y, p.viewportRect.w, p.viewportRect.h);
        renderer.render(scene, p.camera);
      });
      renderer.setScissorTest(false);
    } else if (screen === 'menu' && attractTrack) {
      renderer.render(scene, attractCam.camera);
    } else {
      renderer.render(scene, players[0].camera);
    }
  }
  requestAnimationFrame(frame);
})();
