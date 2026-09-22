// Boat catalog. Each entry supplies a paint job (colors) and light stat
// multipliers applied to the base physics in boat.js, so boats feel distinct
// without any one of them being strictly best.
(function (global) {

  const BOATS = [
    {
      id: 'red-fury',
      name: 'Red Fury',
      description: 'The balanced all-rounder. Reliable in every condition.',
      hullStyle: 'classic',
      colors: { hull: 0xd81f2b, stripe: 0xffffff, cabin: 0x1a1a1e, metal: 0xb9bec4 },
      stats: { speed: 70, accel: 70, handling: 70, boost: 70, health: 65 },
      mult: { speed: 1.0, turn: 1.0, boost: 1.0 },
      // Mid-pack weight - collisions with it go about how you'd expect either way.
      // Health pool scales with weight (see boat.js) - 100 HP at 1.0x.
      weight: 1.0,
      // No built-in gimmick - eligible for the player-picked gimmick below
      // (see GIMMICK_OPTIONS/CUSTOMIZABLE_GIMMICK_IDS and js/menu.js's
      // boat select card).
      customizableGimmick: true,
    },
    {
      id: 'blue-bolt',
      name: 'Blue Bolt',
      description: 'Long and low-slung for straight-line speed. Lightest hull on the water - fastest, but easiest to knock off line.',
      hullStyle: 'sleek',
      colors: { hull: 0x1c6fd1, stripe: 0xdff3ff, cabin: 0x0b1a2e, metal: 0xcfe8ff },
      stats: { speed: 92, accel: 78, handling: 52, boost: 65, health: 45 },
      mult: { speed: 1.12, turn: 0.88, boost: 1.0 },
      weight: 0.8,
      customizableGimmick: true,
    },
    {
      id: 'green-viper',
      name: 'Green Viper',
      description: 'Short, wide and sponson-braced for razor-sharp handling. Heaviest hull on the water - slow off the line, but shrugs off hits and bumps everyone else aside.',
      hullStyle: 'compact',
      colors: { hull: 0x2fae4a, stripe: 0x0c2b12, cabin: 0x102015, metal: 0xb9bec4 },
      stats: { speed: 60, accel: 60, handling: 92, boost: 65, health: 95 },
      mult: { speed: 0.9, turn: 1.22, boost: 1.0 },
      weight: 1.45,
      customizableGimmick: true,
    },
    {
      id: 'gold-comet',
      name: 'Gold Comet',
      description: 'A bulky muscle-boat build with a massive boost tank. Heavy enough to push lighter boats around in a crash.',
      hullStyle: 'bulky',
      colors: { hull: 0xf2b705, stripe: 0x1a1a1a, cabin: 0x241a00, metal: 0xffe08a },
      stats: { speed: 68, accel: 70, handling: 68, boost: 95, health: 78 },
      mult: { speed: 1.0, turn: 1.0, boost: 1.5 },
      weight: 1.2,
      customizableGimmick: true,
    },
    {
      id: 'nitro-wasp',
      name: 'Nitro Wasp',
      description: 'A stripped-down needle-nosed racer built around a self-feeding nitro line. Boost regenerates slowly on its own even off the pads, but the featherweight hull can’t take a real hit.',
      hullStyle: 'wasp',
      colors: { hull: 0xf7e02a, stripe: 0x141414, cabin: 0x1a1a1a, metal: 0x3a3a3a },
      stats: { speed: 88, accel: 90, handling: 78, boost: 58, health: 30 },
      mult: { speed: 1.05, turn: 1.1, boost: 0.85 },
      // Lightest hull in the fleet - even more fragile than Blue Bolt, offset
      // in-race by the boostRegen gimmick below rather than raw durability.
      weight: 0.65,
      gimmicks: [{
        type: 'boostRegen', boostRegenRate: 9, badge: 'NITRO REGEN',
        desc: 'Boost fuel slowly refills on its own, even off the pads.',
      }],
    },
    {
      id: 'iron-turtle',
      name: 'Iron Turtle',
      description: 'A dome-shelled armor tank bolted together for punishment. Plated hull shrugs off nearly half of all collision and wall damage, and a reinforced fuel cell feeds a proper overdrive gear after a couple of seconds of sustained boost - a real top-end payoff, burning fuel and health faster while it lasts.',
      hullStyle: 'turtle',
      colors: { hull: 0x4a5d3a, stripe: 0x7a5230, cabin: 0x1c2418, metal: 0x8f8f7a },
      stats: { speed: 52, accel: 53, handling: 42, boost: 90, health: 100 },
      // speed/accel raised from the original 0.75x - even with overdrive
      // maxed, 0.75x baseline left its BOOSTED top speed (96) below Blue
      // Bolt's boosted top (143), and since boost is a limited resource,
      // most of a race was spent at its even slower non-boost top speed
      // (71 vs Blue Bolt's 106). 0.85x closes that gap while keeping it the
      // slowest baseline boat in the fleet.
      // boost raised from 0.85x to 1.4x for a very different reason: with
      // the old 85-fuel tank, just holding boost through overdrive's 2.5s
      // charge-up burned 80 fuel, leaving ~0.1s of real overdrive before
      // overheating - the payoff almost never actually happened. 1.4x (140
      // fuel, still under Gold Comet's 150 - Comet stays the biggest tank
      // in the fleet) leaves a real ~1.5s overdrive window after charging.
      mult: { speed: 0.85, turn: 0.75, boost: 1.4 },
      // Heaviest hull in the fleet - the biggest HP pool the weight formula
      // produces, then the armor gimmick below cuts incoming damage further.
      weight: 1.7,
      gimmicks: [
        {
          type: 'armor', damageMult: 0.5, badge: 'ARMORED',
          desc: 'Takes 50% less damage from walls, bumps, and rams.',
        },
        // Sustained boost shifts into a higher, more expensive gear - see
        // the mult.boost comment above for why the charge time was also
        // trimmed to 2.0s: it leaves more of the bigger tank for the actual
        // overdrive window instead of being spent just reaching it. The
        // extra drain cost is quietly softened by the armor entry above
        // (takeDamage() applies both) once it's burning health instead of
        // fuel, so overdrive doesn't cost noticeably more health than a
        // normal boat's plain overheating would.
        {
          type: 'overdrive', chargeTime: 2.0, topSpeedMult: 1.3, accelMult: 1.35, drainMult: 1.6, badge: 'OVERDRIVE',
          desc: 'Hold boost 2s to shift into a bigger burst of extra top speed - burns fuel/health faster.',
        },
      ],
    },
    {
      id: 'skybreaker',
      name: 'Skybreaker',
      description: 'Hydrofoil struts lift this hull clear of the water on approach. Ramps launch it noticeably higher and farther than anything else in the fleet, and unlike every other boat it can keep boosting mid-air - even faster than it can on the water - trading a little top-end handling for serious, boosted air.',
      hullStyle: 'foil',
      colors: { hull: 0xeaf7fb, stripe: 0x00b8d9, cabin: 0x0b2a33, metal: 0xbdeeff },
      stats: { speed: 74, accel: 66, handling: 58, boost: 76, health: 68 },
      mult: { speed: 1.0, turn: 0.92, boost: 1.05 },
      weight: 1.05,
      gimmicks: [
        {
          type: 'foil', rampLaunchMult: 1.6, badge: 'FOIL LAUNCH',
          desc: 'Ramps launch it 1.6x higher/farther than anything else in the fleet.',
        },
        // Every other boat has boosting flatly disabled while airborne (see
        // boat.js's update()) - this is the one exception, with an even
        // higher speed cap than its own ground boost while it's up there,
        // so the airtime the foil gimmick creates is an advantage to chase
        // rather than dead time with no throttle response.
        {
          type: 'airBoost', speedMult: 1.3, badge: 'AIR BOOST',
          desc: 'Can keep boosting while airborne - 1.3x faster than its own ground boost.',
        },
      ],
    },
    {
      id: 'vampire-ray',
      name: 'Vampire Ray',
      description: 'A wide-winged ram-boat that hits hard and heals off the impact. Slamming into a rival while boosting patches up its own hull, capped to one heal every few seconds so it rewards sustained aggression over one lucky pile-up at the start.',
      hullStyle: 'ray',
      colors: { hull: 0x5a1470, stripe: 0xb0219e, cabin: 0x140518, metal: 0x3a0f45 },
      stats: { speed: 75, accel: 76, handling: 80, boost: 80, health: 60 },
      mult: { speed: 1.0, turn: 1.1, boost: 1.1 },
      weight: 0.95,
      // cooldown stops a boat still bunched up in the starting pack from
      // ramming several rivals in a couple of seconds and stacking heals -
      // one ram's worth of healing at a time, however many targets are close.
      gimmicks: [{
        type: 'vampire', healOnRam: 12, cooldown: 3.5, badge: 'LIFE STEAL',
        desc: 'Ramming a rival while boosting heals 12 health (at most once every 3.5s).',
      }],
    },
    {
      id: 'drift-king',
      name: 'Drift King',
      description: 'A low, wedge-bodied rally racer built for hairpins. Brake into a turn and it kicks into a powerslide - sharper cornering than its stats alone suggest, and holding the slide through the corner charges a burst of extra speed that pays out the instant you straighten out.',
      hullStyle: 'wedge',
      colors: { hull: 0xff6a00, stripe: 0x141414, cabin: 0x1a1a1a, metal: 0xd8d8d8 },
      stats: { speed: 68, accel: 68, handling: 40, boost: 65, health: 60 },
      // turn is deliberately below-average - passive cornering isn't this
      // boat's thing, the drift gimmick below is. Coast through a corner
      // without braking and it handles worse than Red Fury.
      mult: { speed: 0.95, turn: 0.85, boost: 1.0 },
      weight: 0.9,
      gimmicks: [{
        type: 'drift', turnBonusMult: 1.7, driftBrakeMult: 0.25,
        boostChargeTime: 0.6, boostDuration: 1.5, boostSpeedMult: 1.2,
        badge: 'POWERSLIDE',
        desc: 'Brake + steer hard at speed for a big turn-rate boost, at only 25% of normal braking - hold it 0.6s+ and releasing the drift pays out 1.5s of +20% top speed/accel.',
      }],
    },
    {
      id: 'ragefin',
      name: 'Ragefin',
      description: 'A serrated, shark-finned hull that feeds on its own damage. The lower its health drops, the faster it goes - up to 30% more top speed running on fumes, right up until it doesn\'t.',
      hullStyle: 'fin',
      colors: { hull: 0x8a0e0e, stripe: 0x1a1a1a, cabin: 0x1a1a1a, metal: 0x4a4a4a },
      stats: { speed: 80, accel: 75, handling: 65, boost: 55, health: 50 },
      mult: { speed: 1.05, turn: 1.0, boost: 0.9 },
      weight: 0.85,
      gimmicks: [{
        type: 'rage', threshold: 0.5, maxBonus: 0.3, badge: 'RAGE',
        desc: 'Below 50% health, gains up to 30% top speed/accel the lower it gets.',
      }],
    },
    {
      id: 'salvager',
      name: 'Salvager',
      description: 'An industrial tow-boat with a magnetized crane arm. Boost pads get pulled in from much farther away and top off a little fuller, so it rarely runs dry for long.',
      hullStyle: 'crane',
      colors: { hull: 0xb8860b, stripe: 0x1a1a1a, cabin: 0x2a2a2a, metal: 0x8f8f7a },
      stats: { speed: 55, accel: 55, handling: 45, boost: 82, health: 82 },
      mult: { speed: 0.85, turn: 0.85, boost: 1.1 },
      weight: 1.3,
      gimmicks: [{
        type: 'magnet', radiusMult: 1.9, refillMult: 1.25, badge: 'PAD MAGNET',
        desc: 'Boost pads pull in from ~2x the normal range and refill 25% more fuel.',
      }],
    },
    {
      id: 'phoenix',
      name: 'Phoenix',
      description: 'An unassuming hull with one trick up its sleeve: the first time its health would hit zero, it doesn\'t explode - it flares back to life at partial health with a few seconds of invulnerability instead. Once per race only.',
      hullStyle: 'phoenix',
      colors: { hull: 0xff8c00, stripe: 0xffd23f, cabin: 0x2a1400, metal: 0xffb347 },
      stats: { speed: 70, accel: 70, handling: 70, boost: 70, health: 68 },
      // Deliberately average everywhere else - the safety net below is the
      // entire draw, not a stat edge on top of it.
      mult: { speed: 1.0, turn: 1.0, boost: 1.0 },
      weight: 1.1,
      gimmicks: [{
        type: 'phoenix', reviveHealthFrac: 0.4, invulnDuration: 3, badge: 'SECOND WIND',
        desc: 'The first time it would explode this race, revives at 40% health with 3s of invulnerability instead.',
      }],
    },
  ];

  // Exact HP pool for display (boat select card) - mirrors the formula
  // boat.js itself uses (PHYS.MAX_HEALTH * weight) so the number shown here
  // always matches what the boat actually has in-race.
  BOATS.forEach((b) => { b.maxHealth = Math.round(100 * b.weight); });

  // A curated, deliberately toned-down set of gimmicks the player can bolt
  // onto any boat that doesn't already ship with one of its own (see each
  // boat's customizableGimmick flag above) - lets Red Fury/Blue Bolt/Green
  // Viper/Gold Comet compete on more even footing with the four boats built
  // around a bespoke mechanic, without matching those boats' full-strength
  // versions (that would just make the "vanilla" pick strictly best once
  // customized). Each option is a *set* of gimmicks (usually one) so a pick
  // can bundle more than one mechanic when they're a package deal - see
  // sport-foils below.
  // desc is the plain-English one-liner shown in the in-menu gimmick info
  // panel (js/navigation.js's openGimmickInfo, opened from js/menu.js) -
  // the badges on a boat card only ever show a short name, so this is the
  // only place the actual numbers/effect are spelled out for the player.
  const GIMMICK_OPTIONS = [
    { id: 'none', label: 'None (Stock)', gimmicks: [], desc: 'No gimmick - just the boat’s plain stats.' },
    {
      id: 'nitro-trickle', label: 'Nitro Trickle',
      gimmicks: [{ type: 'boostRegen', boostRegenRate: 5, badge: 'NITRO TRICKLE' }],
      desc: 'Boost fuel slowly refills on its own, even off the pads.',
    },
    {
      id: 'reinforced', label: 'Reinforced Hull',
      gimmicks: [{ type: 'armor', damageMult: 0.75, badge: 'REINFORCED' }],
      desc: 'Takes 25% less damage from walls, bumps, and rams.',
    },
    {
      id: 'sport-foils', label: 'Sport Foils',
      // Bundled with a (toned-down) airBoost rather than foil alone: boost
      // is forced off the instant a boat goes airborne unless it has
      // airBoost (see update()'s `boosting` line), and curMax drops to the
      // non-boost cap the very same frame, clamping the boat's speed down
      // immediately. So on its own, a bigger jump would just mean more time
      // stuck at the lower cap - a bigger fall speed, not a faster boat.
      // Pairing them is what makes the extra air time a net gain instead of
      // a penalty, same as it is for Skybreaker.
      gimmicks: [
        { type: 'foil', rampLaunchMult: 1.25, badge: 'SPORT FOILS' },
        { type: 'airBoost', speedMult: 1.15, badge: 'AIR BOOST' },
      ],
      desc: 'Bigger ramp jumps, and can keep boosting (even faster) while airborne.',
    },
    {
      id: 'ram-plating', label: 'Ram Plating',
      gimmicks: [{ type: 'vampire', healOnRam: 6, cooldown: 5, badge: 'RAM PLATING' }],
      desc: 'Ramming a rival while boosting heals a little health (at most once every 5s).',
    },
    {
      id: 'adrenaline', label: 'Adrenaline',
      gimmicks: [{
        type: 'overdrive', chargeTime: 1.8, topSpeedMult: 1.1, accelMult: 1.15, drainMult: 1.4,
        badge: 'ADRENALINE',
      }],
      desc: 'Hold boost ~2s to shift into a short burst of extra top speed - burns fuel/health faster.',
    },
    {
      id: 'drift-assist', label: 'Drift Assist',
      // Toned-down version of Drift King's own drift gimmick (1.7x turn,
      // 0.6s charge, 1.5s/+20% payout) - see that boat's entry above for
      // why this is paired with active brake input rather than a passive
      // handling stat.
      gimmicks: [{
        type: 'drift', turnBonusMult: 1.35, driftBrakeMult: 0.4,
        boostChargeTime: 0.8, boostDuration: 1.2, boostSpeedMult: 1.12,
        badge: 'DRIFT ASSIST',
      }],
      desc: 'Brake + steer hard at speed for a smaller turn-rate boost, at only 40% of normal braking - hold it 0.8s+ and releasing pays out 1.2s of +12% top speed/accel.',
    },
    {
      id: 'grit', label: 'Grit',
      // Toned-down version of Ragefin's rage gimmick (0.5 threshold / 0.3
      // max bonus) - kicks in later and tops out lower.
      gimmicks: [{ type: 'rage', threshold: 0.4, maxBonus: 0.15, badge: 'GRIT' }],
      desc: 'Below 40% health, gains up to 15% top speed/accel the lower it gets.',
    },
    {
      id: 'pad-sense', label: 'Pad Sense',
      // Toned-down version of Salvager's magnet gimmick (1.9x radius / 1.25x
      // refill).
      gimmicks: [{ type: 'magnet', radiusMult: 1.4, refillMult: 1.1, badge: 'PAD SENSE' }],
      desc: 'Boost pads pull in from ~1.4x the normal range and refill 10% more fuel.',
    },
    {
      id: 'lucky-break', label: 'Lucky Break',
      // Toned-down version of Phoenix's own gimmick (40% revive health, 3s
      // invuln) - a smaller safety net, not a worse-odds version of the
      // same one (it's still guaranteed to trigger once, just less generous
      // when it does).
      gimmicks: [{ type: 'phoenix', reviveHealthFrac: 0.25, invulnDuration: 1.5, badge: 'LUCKY BREAK' }],
      desc: 'The first time it would explode this race, revives at 25% health with 1.5s of invulnerability instead.',
    },
  ];

  // Applies each customizable boat's saved gimmick pick directly onto its
  // catalog entry (same pattern as applySavedColors below) so every
  // consumer - the select-screen preview, the player's own boat, and any AI
  // racer that happens to get assigned this boat - picks it up automatically.
  function applySavedGimmicks() {
    BOATS.forEach((b) => {
      if (!b.customizableGimmick) return;
      const optionId = global.HT.Settings.getBoatGimmick(b.id);
      const option = GIMMICK_OPTIONS.find((o) => o.id === optionId);
      b.gimmicks = (option && option.gimmicks) || [];
    });
  }
  applySavedGimmicks();

  function getGimmickOptions() {
    return GIMMICK_OPTIONS;
  }

  function getGimmickChoice(boatId) {
    return global.HT.Settings.getBoatGimmick(boatId);
  }

  function setGimmickChoice(boatId, optionId) {
    const boat = getById(boatId);
    if (!boat || !boat.customizableGimmick) return;
    global.HT.Settings.setBoatGimmick(boatId, optionId);
    applySavedGimmicks();
  }

  // Full reference for the boat-select "Gimmick Info" button (js/menu.js) -
  // covers BOTH the boats with a fixed, built-in gimmick and the options
  // selectable on the rest, so the player can look up any gimmick's exact
  // effect regardless of which boat currently has it.
  function getAllGimmickInfo() {
    const builtIn = [];
    BOATS.forEach((b) => {
      if (b.customizableGimmick) return;
      b.gimmicks.forEach((g) => {
        builtIn.push({ boatId: b.id, boatName: b.name, label: g.badge, desc: g.desc });
      });
    });
    const customizable = GIMMICK_OPTIONS
      .filter((o) => o.id !== 'none')
      .map((o) => ({ id: o.id, label: o.label, desc: o.desc }));
    return { builtIn, customizable };
  }

  const COLOR_KEYS = ['hull', 'stripe', 'cabin', 'metal'];

  // Snapshot each boat's original colors before any saved customization is
  // applied below, so "reset" always has a true default to return to.
  const DEFAULT_COLORS_BY_ID = {};
  BOATS.forEach((b) => { DEFAULT_COLORS_BY_ID[b.id] = Object.assign({}, b.colors); });

  // Applies any saved per-boat recoloring (see js/menu.js's boat select
  // cards) directly onto the catalog entries themselves, so every consumer
  // - the select-screen preview, the player's own boat, and any AI racer
  // that happens to get assigned this boat - picks it up automatically
  // without each needing its own override/merge logic.
  function applySavedColors() {
    BOATS.forEach((b) => {
      const saved = global.HT.Settings.getBoatColors(b.id);
      if (saved) Object.assign(b.colors, saved);
    });
  }
  applySavedColors();

  function getById(id) {
    return BOATS.find((b) => b.id === id) || null;
  }

  function getSelected() {
    const id = global.HT.Settings.get('selectedBoatId');
    return getById(id) || BOATS[0];
  }

  function setColor(boatId, key, hexValue) {
    const boat = getById(boatId);
    if (!boat || COLOR_KEYS.indexOf(key) === -1) return;
    boat.colors[key] = hexValue;
    global.HT.Settings.setBoatColors(boatId, boat.colors);
  }

  function resetColors(boatId) {
    const boat = getById(boatId);
    if (!boat) return;
    boat.colors = Object.assign({}, DEFAULT_COLORS_BY_ID[boatId]);
    global.HT.Settings.clearBoatColors(boatId);
  }

  // Simple top-down silhouette so the select card reads as "a boat" without
  // needing a full 3D render.
  function drawPreview(canvas, boat) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pad = 14;
    const originX = pad;
    const scaleX = w - pad * 2;
    const midY = h / 2;
    const scaleY = h - pad * 2;
    const px = (x) => originX + x * scaleX;
    const py = (y) => midY - y * scaleY;

    const SILHOUETTES = {
      classic: [
        [1.0, 0], [0.75, 0.32], [0.55, 0.42], [0.15, 0.42],
        [0.05, 0.3], [0.05, -0.3], [0.15, -0.42], [0.55, -0.42], [0.75, -0.32],
      ],
      sleek: [
        [1.0, 0], [0.8, 0.22], [0.6, 0.28], [0.1, 0.28],
        [0.03, 0.2], [0.03, -0.2], [0.1, -0.28], [0.6, -0.28], [0.8, -0.22],
      ],
      compact: [
        [1.0, 0], [0.65, 0.36], [0.5, 0.48], [0.28, 0.5], [0.1, 0.42],
        [0.05, 0.3], [0.05, -0.3], [0.1, -0.42], [0.28, -0.5], [0.5, -0.48], [0.65, -0.36],
      ],
      bulky: [
        [1.0, 0], [0.7, 0.34], [0.5, 0.46], [0.1, 0.46],
        [0.02, 0.34], [0.02, -0.34], [0.1, -0.46], [0.5, -0.46], [0.7, -0.34],
      ],
      // Needle-thin body with a long tapered nose - Nitro Wasp.
      wasp: [
        [1.0, 0], [0.82, 0.1], [0.3, 0.16], [0.12, 0.16],
        [0.04, 0.09], [0.04, -0.09], [0.12, -0.16], [0.3, -0.16], [0.82, -0.1],
      ],
      // Wide, rounded and stubby - Iron Turtle's armored dome shell.
      turtle: [
        [0.92, 0], [0.7, 0.4], [0.4, 0.5], [0.15, 0.5],
        [0.05, 0.38], [0.05, -0.38], [0.15, -0.5], [0.4, -0.5], [0.7, -0.4],
      ],
      // Slim hull with small strut "wings" kinked out mid-body - Skybreaker.
      foil: [
        [1.0, 0], [0.8, 0.18], [0.55, 0.2], [0.5, 0.4], [0.42, 0.2],
        [0.15, 0.2], [0.05, 0.13], [0.05, -0.13], [0.15, -0.2],
        [0.42, -0.2], [0.5, -0.4], [0.55, -0.2], [0.8, -0.18],
      ],
      // Wide flat wings sweeping back to a pointed tail - Vampire Ray.
      ray: [
        [1.0, 0], [0.62, 0.12], [0.5, 0.52], [0.32, 0.48], [0.22, 0.16],
        [0.05, 0.1], [0.05, -0.1], [0.22, -0.16], [0.32, -0.48], [0.5, -0.52], [0.62, -0.12],
      ],
      // Low, flat and wide with a blunt wedge nose - Drift King.
      wedge: [
        [1.0, 0], [0.7, 0.28], [0.45, 0.34], [0.15, 0.34],
        [0.06, 0.24], [0.06, -0.24], [0.15, -0.34], [0.45, -0.34], [0.7, -0.28],
      ],
      // Narrow shark shape with small fin bumps mid-body - Ragefin.
      fin: [
        [1.0, 0], [0.78, 0.14], [0.55, 0.18], [0.45, 0.3], [0.35, 0.18],
        [0.15, 0.18], [0.05, 0.1], [0.05, -0.1], [0.15, -0.18],
        [0.35, -0.18], [0.45, -0.3], [0.55, -0.18], [0.78, -0.14],
      ],
      // Blunt, almost rectangular barge shape - industrial Salvager.
      crane: [
        [0.85, 0], [0.85, 0.4], [0.1, 0.4],
        [0.05, 0.3], [0.05, -0.3], [0.1, -0.4], [0.85, -0.4],
      ],
      // Sleek needle nose with swept wing fins - Phoenix.
      phoenix: [
        [1.0, 0], [0.82, 0.12], [0.6, 0.32], [0.4, 0.28], [0.3, 0.14],
        [0.12, 0.14], [0.04, 0.08], [0.04, -0.08], [0.12, -0.14],
        [0.3, -0.14], [0.4, -0.28], [0.6, -0.32], [0.82, -0.12],
      ],
    };
    const hullPts = SILHOUETTES[boat.hullStyle] || SILHOUETTES.classic;

    ctx.fillStyle = '#' + boat.colors.hull.toString(16).padStart(6, '0');
    ctx.beginPath();
    hullPts.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(px(x), py(y)); else ctx.lineTo(px(x), py(y));
    });
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#' + boat.colors.stripe.toString(16).padStart(6, '0');
    ctx.fillRect(px(0.05), py(0.06), px(1.0) - px(0.05), py(-0.06) - py(0.06));

    ctx.fillStyle = '#' + boat.colors.cabin.toString(16).padStart(6, '0');
    ctx.fillRect(px(0.25), py(0.18), px(0.55) - px(0.25), py(-0.18) - py(0.18));
  }

  global.HT = global.HT || {};
  global.HT.Boats = {
    list: BOATS, getById, getSelected, drawPreview, setColor, resetColors, COLOR_KEYS,
    getGimmickOptions, getGimmickChoice, setGimmickChoice, getAllGimmickInfo,
  };
})(window);
