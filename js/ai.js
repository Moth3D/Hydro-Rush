// Simple track-following AI racer for Race mode. Drives an ordinary HT.Boat
// by synthesizing the same {throttle, brake, steer, boost} input the player
// produces, so it goes through the exact same physics in boat.js - no
// separate AI movement model to keep in sync. Only lap/finish progress is
// tracked here (not full checkpoint gating), since that's all standings need.
(function (global) {

  const LOOKAHEAD = 14;
  const CURVE_LOOKAHEAD = 28;

  // Rubber-banding: nudges each AI's effective top speed/accel based on how
  // far ahead or behind it is from the leading human's own lap-fraction
  // progress (see progressFraction below), on top of the fixed per-
  // difficulty speedMult baseline (js/difficulty.js) that's still what
  // makes Hard genuinely faster than Easy at an even gap - this only pulls
  // a big gap back in so the pack stays close race after race. Uniform
  // across difficulty tiers on purpose, so the tiers keep their distinct
  // feel at a close gap; it only ever fights a *large* one.
  const RUBBER_BAND_RANGE = 0.12; // lap-fraction gap at which the effect saturates
  const RUBBER_BAND_STRENGTH = 0.25; // max +/-25% swing on top of the AI's base speed

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // Same "fraction of a lap completed" metric js/main.js's computeRaceOrder
  // uses to rank everyone - lets a straight subtraction compare an AI's
  // progress against a human's regardless of track length or lap count.
  function progressFraction(entry, track) {
    return track.loop ? (entry.lap - 1) + entry.t : entry.t;
  }

  function sampleAhead(track, fromIdx, ahead) {
    const n = track.samples.length;
    let idx = fromIdx + ahead;
    idx = track.loop ? ((idx % n) + n) % n : Math.min(n - 1, idx);
    return track.samples[idx];
  }

  // Boost now only ever comes from pads (see boat.js/main.js - no passive
  // regen anymore), but the plain centerline-chasing steering target below
  // has no reason to ever pass directly over one (pads sit off to one side,
  // same as the real game's slalom-gate look). Without this, AI simply
  // never reliably reaches its own fuel. Only looks for a pad when this
  // racer could actually use one, and only far enough ahead to bias toward
  // smoothly rather than snapping the steering target sideways.
  const PAD_SEEK_RADIUS = 55;
  const PAD_SEEK_MIN_AHEAD = 5;
  function findSeekablePad(racer, track) {
    const boat = racer.boat;
    const maxFuel = (global.HT.PHYS.BOOST_MAX_FUEL || 100) * boat.boostMult;
    if (boat.boostFuel > maxFuel * 0.85) return null;
    const bx = boat.position.x, bz = boat.position.z;
    const fx = Math.sin(boat.heading), fz = Math.cos(boat.heading);
    let best = null, bestDist = Infinity;
    (track.boostPads || []).forEach((pad) => {
      const dx = pad.pos.x - bx, dz = pad.pos.z - bz;
      const dist = Math.hypot(dx, dz);
      if (dist > PAD_SEEK_RADIUS) return;
      const forwardDot = dx * fx + dz * fz;
      if (forwardDot < PAD_SEEK_MIN_AHEAD) return;
      if (dist < bestDist) { bestDist = dist; best = pad; }
    });
    return best;
  }

  // Picks throttle/steer/boost to chase a point down the track from the
  // racer's current nearest sample, easing off the throttle into sharp bends.
  function computeInput(racer, track) {
    const difficulty = racer.difficulty;
    const nearest = track.findNearestSample(racer.boat.position, racer.boat.trackIndexHint);
    const target = sampleAhead(track, nearest.index, LOOKAHEAD);
    const curveSample = sampleAhead(track, nearest.index, CURVE_LOOKAHEAD);
    const seekPad = findSeekablePad(racer, track);
    const targetPos = seekPad ? seekPad.pos : target.pos;

    const dx = targetPos.x - racer.boat.position.x;
    const dz = targetPos.z - racer.boat.position.z;
    const desiredHeading = Math.atan2(dx, dz);
    const headingDiff = normalizeAngle(desiredHeading - racer.boat.heading);
    const steer = clamp(-headingDiff * difficulty.turnGain, -1, 1);

    const curveAngle = Math.abs(normalizeAngle(
      Math.atan2(curveSample.tangent.x, curveSample.tangent.z) -
      Math.atan2(nearest.tangent.x, nearest.tangent.z)
    ));
    const throttle = clamp(1 - curveAngle * difficulty.curveCaution, 0.35, 1);
    const boost = racer.boat.boostFuel > difficulty.boostThreshold && curveAngle < 0.25;

    return { input: { throttle, brake: 0, steer, boost, restart: false, pause: false }, nearest };
  }

  // Delegates to the same rulebook main.js uses for human players (see
  // js/race-progress.js) - AI only needs to know its lap count and whether
  // it has finished, so no callbacks are needed here (main.js's own frame()
  // loop stamps finishOrder the instant it sees `finished` flip true, for
  // both AI and human entries alike).
  function advanceProgress(racer, track, nearestT) {
    global.HT.RaceProgress.advanceCheckpointProgress(racer, track, nearestT, null);
  }

  // excludeBoatIds: array of boat ids to leave out of the pool - every human
  // player's chosen boat (one id in solo play, up to four in co-op), so no
  // AI ever ends up in the same boat model as someone actually racing.
  function createRacers(track, excludeBoatIds, count, difficulty) {
    const exclude = Array.isArray(excludeBoatIds) ? excludeBoatIds : [excludeBoatIds];
    const pool = global.HT.Boats.list.filter((b) => exclude.indexOf(b.id) === -1);
    const racers = [];
    for (let i = 0; i < count; i++) {
      const boatConfig = pool[i % pool.length];
      // Apply the difficulty's speed multiplier on top of the boat's own
      // stats, so a Hard AI in a slow boat is still noticeably quicker.
      const mult = Object.assign({}, boatConfig.mult, { speed: (boatConfig.mult.speed || 1) * difficulty.speedMult });
      const boat = new global.HT.Boat(Object.assign({}, boatConfig, { mult }));
      boat.reset(track);
      // A proper starting grid, 3 wide (see HT.Track.computeGridSlot, shared
      // with the player's own back-of-the-grid placement in main.js) - AI
      // fill the front rows in order, index 0 taking pole position.
      const slot = global.HT.Track.computeGridSlot(track, i);
      boat.position.copy(slot.position);
      boat.mesh.position.x = boat.position.x;
      boat.mesh.position.z = boat.position.z;
      racers.push({
        boat, difficulty, nextCheckpointIdx: 1, lap: 1, finished: false, t: 0,
        hullColor: boatConfig.colors.hull,
        // Rubber-banding (see update()) scales boat.speedMult off of this
        // fixed baseline every frame rather than compounding in place, so
        // repeated frames of adjustment never drift the AI's true speed.
        baseSpeedMult: mult.speed,
      });
    }
    return racers;
  }

  // held: true during main.js's pre-race countdown hold - every racer just
  // sits idle at the start line (no steering/throttle computed at all, and
  // no lap/checkpoint progress advances) until it clears.
  // targetProgress: the leading active human's progressFraction this frame
  // (js/main.js), or null/undefined to skip rubber-banding entirely (attract
  // mode, or a moment with no active human to chase).
  function update(racer, dt, track, elapsed, held, targetProgress) {
    if (held || racer.finished) {
      const result = racer.boat.update(dt, { throttle: 0, brake: 0, steer: 0, boost: false, restart: false, pause: false }, track, elapsed);
      racer.t = result.nearest.t;
      return result;
    }
    if (targetProgress != null && racer.baseSpeedMult != null) {
      const gap = targetProgress - progressFraction(racer, track); // >0 = AI is behind
      const factor = 1 + clamp(gap / RUBBER_BAND_RANGE, -1, 1) * RUBBER_BAND_STRENGTH;
      racer.boat.speedMult = racer.baseSpeedMult * factor;
    }
    const { input, nearest } = computeInput(racer, track);
    const result = racer.boat.update(dt, input, track, elapsed);
    advanceProgress(racer, track, result.nearest.t);
    racer.t = result.nearest.t;
    return result;
  }

  global.HT = global.HT || {};
  global.HT.AI = { createRacers, update };
})(window);
