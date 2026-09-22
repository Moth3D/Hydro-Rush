// Low-poly speedboat: procedural mesh + arcade physics (no external models).
(function (global) {

  const PHYS = {
    ACCEL: 48,
    BRAKE_DECEL: 55,
    REVERSE_ACCEL: 24,
    REVERSE_MAX: -22,
    DRAG: 0.0055,
    BASE_FRICTION: 3,
    MAX_SPEED: 95,
    BOOST_MAX_SPEED: 128,
    BOOST_ACCEL_BONUS: 40,
    TURN_RATE: 2.0,
    BOAT_RADIUS: 3,
    BOOST_MAX_FUEL: 100,
    BOOST_DRAIN: 32,
    // No passive regen anymore - boost is only earned from boost pads (see
    // main.js's checkBoostPads). BOOST_REGEN is gone entirely; what used to
    // be the boost bar is now health (below), which keeps a slow passive
    // regen of its own.
    BOOST_PAD_REFILL: 45,
    GRAVITY: 62,
    RAMP_LAUNCH_SPEED: 20,
    HULL_OFFSET: 0.05,

    // ---- Health / damage / overheat ----
    MAX_HEALTH: 100,
    HEALTH_REGEN: 1.5, // slow - a full regen from 0 takes over a minute
    WALL_DAMAGE: 10,
    BUMP_DAMAGE: 6,
    LAUNCH_DAMAGE: 16, // getting boost-rammed hurts more than a plain bump
    // Overheat isn't a lockout - holding boost past an empty tank keeps
    // giving the full boost speed/accel, it just starts burning health
    // instead of fuel. A real risk (explode -> respawn at the last
    // checkpoint if you push it too far) rather than a cooldown, so the
    // player can choose to pay for a bit more speed with their own health.
    OVERHEAT_HEALTH_DRAIN: 18,
    // Doubles as both the post-explosion invulnerability window AND how long
    // the boat is locked out of throttle/steer/boost after respawning (see
    // update() below) - being destroyed needs to actually cost real race
    // time, not just teleport you back with a free pass on damage.
    RESPAWN_INVULN: 3,
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  const DEFAULT_COLORS = { hull: 0xd81f2b, stripe: 0xffffff, cabin: 0x1a1a1e, metal: 0xb9bec4 };

  // Anchors flames + a boost light at each given local position (exhaust tips).
  function buildFlamesAndLight(group, exhaustPositions) {
    const flamePairs = exhaustPositions.map((p) => {
      const outer = buildFlameCone(0.3, 1.3, 0xff6a00, 0.85);
      const inner = buildFlameCone(0.15, 0.9, 0xfff28a, 0.95);
      outer.position.set(p.x, p.y, p.z);
      inner.position.set(p.x, p.y, p.z);
      outer.visible = false;
      inner.visible = false;
      group.add(outer, inner);
      return { outer, inner };
    });

    const avg = exhaustPositions.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }),
      { x: 0, y: 0, z: 0 });
    const n = exhaustPositions.length;
    const boostLight = new THREE.PointLight(0xff8c33, 0, 16, 2);
    boostLight.position.set(avg.x / n, avg.y / n + 0.15, avg.z / n - 0.1);
    group.add(boostLight);

    return { flamePairs, boostLight };
  }

  function buildMesh(config) {
    const style = (config && config.hullStyle) || 'classic';
    const c = Object.assign({}, DEFAULT_COLORS, config && config.colors);
    const group = new THREE.Group();

    const mats = {
      hull: new THREE.MeshStandardMaterial({ color: c.hull, flatShading: true, roughness: 0.6 }),
      stripe: new THREE.MeshStandardMaterial({ color: c.stripe, flatShading: true, roughness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: c.cabin, flatShading: true, roughness: 0.7 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x8fe0ff, flatShading: true, transparent: true, opacity: 0.55 }),
      metal: new THREE.MeshStandardMaterial({ color: c.metal, flatShading: true, metalness: 0.4, roughness: 0.4 }),
    };

    const builders = {
      classic: buildClassicHull, sleek: buildSleekHull, compact: buildCompactHull, bulky: buildBulkyHull,
      wasp: buildWaspHull, turtle: buildTurtleHull, foil: buildFoilHull, ray: buildRayHull,
      wedge: buildWedgeHull, fin: buildFinHull, crane: buildCraneHull, phoenix: buildPhoenixHull,
    };
    const exhaustPositions = (builders[style] || buildClassicHull)(group, mats);

    const { flamePairs, boostLight } = buildFlamesAndLight(group, exhaustPositions);

    group.traverse((obj) => { if (obj.isMesh) obj.castShadow = false; });
    return { group, flamePairs, boostLight };
  }

  // ---- Red Fury: the balanced, classic speedboat silhouette ----
  function buildClassicHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 5.6), mats.hull);
    hull.position.set(0, 0.15, -0.2);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.02, 5.6), mats.stripe);
    stripe.position.set(0, 0.15, -0.2);
    group.add(stripe);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.6, 4), mats.hull);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.15, 3.0);
    group.add(bow);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 1.9), mats.dark);
    cabin.position.set(0, 1.05, -0.6);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.15), mats.glass);
    windshield.position.set(0, 1.15, 0.35);
    windshield.rotation.x = -0.5;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 1.3), mats.dark);
    engineBlock.position.set(0, 0.45, -3.1);
    group.add(engineBlock);

    [-0.7, 0.7].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.55, -3.7);
      group.add(pipe);
    });

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 1.0), mats.metal);
    fin.position.set(0, 0.9, -3.6);
    group.add(fin);

    return [{ x: -0.7, y: 0.42, z: -4.1 }, { x: 0.7, y: 0.42, z: -4.1 }];
  }

  // ---- Blue Bolt: long, narrow and low - built for straight-line speed ----
  function buildSleekHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.8, 6.6), mats.hull);
    hull.position.set(0, 0.1, -0.3);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.82, 6.6), mats.stripe);
    stripe.position.set(0, 0.1, -0.3);
    group.add(stripe);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.25, 3.6, 4), mats.hull);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.1, 3.6);
    group.add(bow);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 1.6), mats.dark);
    cabin.position.set(0, 0.78, -0.8);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.45, 0.12), mats.glass);
    windshield.position.set(0, 0.85, 0.05);
    windshield.rotation.x = -0.75;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 1.3), mats.dark);
    engineBlock.position.set(0, 0.35, -3.6);
    group.add(engineBlock);

    [-0.5, 0.5].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.8, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.4, -4.1);
      group.add(pipe);
    });

    // Twin raked tail fins instead of one center fin.
    [-0.55, 0.55].forEach((x) => {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.85), mats.metal);
      fin.position.set(x, 0.6, -4.0);
      fin.rotation.z = x > 0 ? -0.25 : 0.25;
      group.add(fin);
    });

    return [{ x: -0.5, y: 0.28, z: -4.4 }, { x: 0.5, y: 0.28, z: -4.4 }];
  }

  // ---- Green Viper: short, wide and sponson-braced for sharp handling ----
  function buildCompactHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 4.6), mats.hull);
    hull.position.set(0, 0.15, -0.1);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.07, 4.6), mats.stripe);
    stripe.position.set(0, 0.15, -0.1);
    group.add(stripe);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.75, 2.0, 4), mats.hull);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.15, 2.5);
    group.add(bow);

    // Side sponsons - a stubby, planted stance that reads as agile/stable.
    [-1.95, 1.95].forEach((x) => {
      const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 2.3), mats.metal);
      sponson.position.set(x, -0.05, -0.2);
      group.add(sponson);
    });

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.7), mats.dark);
    cabin.position.set(0, 1.05, -0.4);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.15), mats.glass);
    windshield.position.set(0, 1.1, 0.35);
    windshield.rotation.x = -0.65;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 1.15), mats.dark);
    engineBlock.position.set(0, 0.45, -2.65);
    group.add(engineBlock);

    [-0.9, 0.9].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.85, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.55, -3.2);
      group.add(pipe);
    });

    // Tall single spoiler for an aggressive, sporty stance.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 1.1), mats.metal);
    fin.position.set(0, 1.0, -3.05);
    group.add(fin);

    return [{ x: -0.9, y: 0.42, z: -3.6 }, { x: 0.9, y: 0.42, z: -3.6 }];
  }

  // ---- Gold Comet: bulky muscle-boat build with a huge engine + spoiler ----
  function buildBulkyHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 6.0), mats.hull);
    hull.position.set(0, 0.2, -0.2);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.22, 6.0), mats.stripe);
    stripe.position.set(0, 0.2, -0.2);
    group.add(stripe);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.6, 4), mats.hull);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.2, 3.2);
    group.add(bow);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 2.0), mats.dark);
    cabin.position.set(0, 1.2, -0.5);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.15), mats.glass);
    windshield.position.set(0, 1.3, 0.5);
    windshield.rotation.x = -0.4;
    group.add(windshield);

    // Oversized engine block - this boat is all about the boost tank.
    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.15, 1.7), mats.dark);
    engineBlock.position.set(0, 0.55, -3.5);
    group.add(engineBlock);

    // Four exhaust pipes for a heavy-power look.
    const exhaustX = [-1.0, -0.35, 0.35, 1.0];
    exhaustX.forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.85, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.65, -4.0);
      group.add(pipe);
    });

    // Wide rear wing on two struts.
    [-0.75, 0.75].forEach((x) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), mats.metal);
      strut.position.set(x, 0.95, -3.9);
      group.add(strut);
    });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.65), mats.metal);
    wing.position.set(0, 1.3, -3.9);
    group.add(wing);

    return exhaustX.map((x) => ({ x, y: 0.5, z: -4.35 }));
  }

  // ---- Nitro Wasp: needle-nosed featherweight with a self-feeding nitro line ----
  function buildWaspHull(group, mats) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 4.6, 6), mats.hull);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0.25, -0.3);
    group.add(body);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.85, 4.6), mats.stripe);
    stripe.position.set(0, 0.25, -0.3);
    group.add(stripe);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 6), mats.hull);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.25, 3.6);
    group.add(nose);

    // Thin needle antenna off the nose - reads as an insect's feeler.
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), mats.metal);
    antenna.rotation.x = Math.PI / 2.3;
    antenna.position.set(0, 0.5, 5.1);
    group.add(antenna);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mats.glass);
    cockpit.scale.set(1, 0.7, 1.3);
    cockpit.position.set(0, 0.65, 0.5);
    group.add(cockpit);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.0), mats.dark);
    engineBlock.position.set(0, 0.25, -2.7);
    group.add(engineBlock);

    // Swept wasp-wing fins instead of a tail spoiler.
    [-1, 1].forEach((side) => {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.6), mats.metal);
      fin.position.set(side * 0.75, 0.35, -2.9);
      fin.rotation.z = side * 0.5;
      fin.rotation.y = side * 0.3;
      group.add(fin);
    });

    return [{ x: -0.35, y: 0.15, z: -3.1 }, { x: 0.35, y: 0.15, z: -3.1 }];
  }

  // ---- Iron Turtle: dome-shelled armor tank, shrugs off punishment ----
  function buildTurtleHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 4.8), mats.hull);
    hull.position.set(0, 0.1, -0.1);
    group.add(hull);

    // Domed shell - a top hemisphere flattened and stretched over the hull.
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.dark);
    shell.scale.set(1.05, 0.55, 1.35);
    shell.position.set(0, 0.55, -0.2);
    group.add(shell);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 4.8), mats.stripe);
    stripe.position.set(0, 0.1, -0.1);
    group.add(stripe);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.4, 4), mats.hull);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0.1, 2.5);
    group.add(nose);

    // Thick side armor plates - the "shell" this boat is named for.
    [-2.0, 2.0].forEach((x) => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 3.6), mats.metal);
      plate.position.set(x, 0.05, -0.2);
      group.add(plate);
    });

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.12), mats.glass);
    windshield.position.set(0, 0.95, 0.6);
    windshield.rotation.x = -0.55;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.85, 1.3), mats.dark);
    engineBlock.position.set(0, 0.35, -2.5);
    group.add(engineBlock);

    [-0.8, 0.8].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.35, -3.0);
      group.add(pipe);
    });

    return [{ x: -0.8, y: 0.2, z: -3.4 }, { x: 0.8, y: 0.2, z: -3.4 }];
  }

  // ---- Skybreaker: hydrofoil-strut hull, flies higher off every ramp ----
  function buildFoilHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 5.8), mats.hull);
    hull.position.set(0, 0.35, -0.2);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.72, 5.8), mats.stripe);
    stripe.position.set(0, 0.35, -0.2);
    group.add(stripe);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.8, 4), mats.hull);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.35, 3.0);
    group.add(bow);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.6), mats.dark);
    cabin.position.set(0, 0.95, -0.5);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.12), mats.glass);
    windshield.position.set(0, 1.05, 0.2);
    windshield.rotation.x = -0.6;
    group.add(windshield);

    // Diagonal foil struts flaring out to flat blades at the hull's sides -
    // the "wings" this boat launches off of.
    [-1, 1].forEach((side) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5), mats.metal);
      strut.position.set(side * 1.1, -0.1, 0.6);
      strut.rotation.z = side * 1.1;
      group.add(strut);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.5), mats.metal);
      blade.position.set(side * 1.75, -0.25, 0.6);
      group.add(blade);
    });

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.2), mats.dark);
    engineBlock.position.set(0, 0.35, -3.3);
    group.add(engineBlock);

    [-0.5, 0.5].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.8, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.4, -3.8);
      group.add(pipe);
    });

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.9), mats.metal);
    fin.position.set(0, 0.75, -3.7);
    group.add(fin);

    return [{ x: -0.5, y: 0.25, z: -4.1 }, { x: 0.5, y: 0.25, z: -4.1 }];
  }

  // ---- Vampire Ray: wide-winged ram build that feeds on impact ----
  function buildRayHull(group, mats) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 4.4), mats.hull);
    body.position.set(0, 0.2, -0.4);
    group.add(body);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.77, 4.4), mats.stripe);
    stripe.position.set(0, 0.2, -0.4);
    group.add(stripe);

    // Wide flat wing sponsons sweeping back from the nose - the manta-ray
    // silhouette this boat is named for.
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 2.2), mats.hull);
      wing.position.set(side * 1.7, -0.05, 0.5);
      wing.rotation.z = side * -0.18;
      wing.rotation.y = side * 0.3;
      group.add(wing);
    });

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 4), mats.hull);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0.2, 2.9);
    group.add(nose);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.3), mats.dark);
    cabin.position.set(0, 0.65, -0.3);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.12), mats.glass);
    windshield.position.set(0, 0.72, 0.35);
    windshield.rotation.x = -0.6;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.1), mats.dark);
    engineBlock.position.set(0, 0.3, -2.4);
    group.add(engineBlock);

    [-0.45, 0.45].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.35, -2.85);
      group.add(pipe);
    });

    // Pointed tail spike instead of a spoiler.
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.3, 4), mats.metal);
    spike.rotation.x = -Math.PI / 2;
    spike.position.set(0, 0.35, -3.4);
    group.add(spike);

    return [{ x: -0.45, y: 0.15, z: -2.95 }, { x: 0.45, y: 0.15, z: -2.95 }];
  }

  // ---- Drift King: low wedge-bodied rally build for hairpin powerslides ----
  function buildWedgeHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.75, 5.4), mats.hull);
    hull.position.set(0, 0.15, -0.2);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.77, 5.4), mats.stripe);
    stripe.position.set(0, 0.15, -0.2);
    group.add(stripe);

    // Sloped wedge nose - a flattened, angled box instead of a cone bow.
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.2), mats.hull);
    nose.position.set(0, 0.15, 3.0);
    nose.rotation.x = -0.35;
    group.add(nose);

    // Front splitter, hugging the ground.
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 0.6), mats.metal);
    splitter.position.set(0, -0.28, 3.9);
    group.add(splitter);

    // Side skirts - a low, planted stance for the "great in a powerslide" look.
    [-1.5, 1.5].forEach((x) => {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 4.4), mats.dark);
      skirt.position.set(x, -0.15, -0.3);
      group.add(skirt);
    });

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), mats.dark);
    cabin.position.set(0, 0.65, -0.8);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.12), mats.glass);
    windshield.position.set(0, 0.72, 0.0);
    windshield.rotation.x = -0.7;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 1.2), mats.dark);
    engineBlock.position.set(0, 0.3, -2.6);
    group.add(engineBlock);

    [-0.6, 0.6].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.75, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.35, -3.1);
      group.add(pipe);
    });

    // Wide, low rally wing on struts.
    [-0.85, 0.85].forEach((x) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), mats.metal);
      strut.position.set(x, 0.55, -3.0);
      group.add(strut);
    });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.7), mats.metal);
    wing.position.set(0, 0.8, -3.0);
    group.add(wing);

    return [{ x: -0.6, y: 0.15, z: -3.4 }, { x: 0.6, y: 0.15, z: -3.4 }];
  }

  // ---- Ragefin: shark-finned hull that gets faster the more it's hurt ----
  function buildFinHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 5.2), mats.hull);
    hull.position.set(0, 0.2, -0.2);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.92, 5.2), mats.stripe);
    stripe.position.set(0, 0.2, -0.2);
    group.add(stripe);

    // Jagged shark-nose - a sharply angled cone.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.0, 4), mats.hull);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0.2, 3.1);
    group.add(nose);

    // Tall dorsal fin - the boat's namesake.
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 3), mats.dark);
    dorsal.position.set(0, 1.15, 0.2);
    group.add(dorsal);

    // Small serrated side fins.
    [-1.05, 1.05].forEach((side) => {
      const finMesh = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 3), mats.dark);
      finMesh.position.set(side, 0.1, 0.6);
      finMesh.rotation.z = side > 0 ? -Math.PI / 2.3 : Math.PI / 2.3;
      group.add(finMesh);
    });

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.3), mats.dark);
    cabin.position.set(0, 0.75, -0.6);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.12), mats.glass);
    windshield.position.set(0, 0.82, 0.1);
    windshield.rotation.x = -0.65;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.1), mats.dark);
    engineBlock.position.set(0, 0.35, -2.5);
    group.add(engineBlock);

    [-0.5, 0.5].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.4, -3.0);
      group.add(pipe);
    });

    // Tail fin instead of a spoiler.
    const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 3), mats.metal);
    tailFin.rotation.x = Math.PI / 2;
    tailFin.position.set(0, 0.5, -3.4);
    group.add(tailFin);

    return [{ x: -0.5, y: 0.15, z: -3.3 }, { x: 0.5, y: 0.15, z: -3.3 }];
  }

  // ---- Salvager: industrial tow-boat with a magnetized crane arm ----
  function buildCraneHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.1, 5.6), mats.hull);
    hull.position.set(0, 0.2, -0.3);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.12, 5.6), mats.stripe);
    stripe.position.set(0, 0.2, -0.3);
    group.add(stripe);

    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.0, 4), mats.hull);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.2, 3.2);
    group.add(bow);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.8), mats.dark);
    cabin.position.set(0, 1.1, -1.0);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.15), mats.glass);
    windshield.position.set(0, 1.2, -0.15);
    windshield.rotation.x = -0.55;
    group.add(windshield);

    // Crane arm + magnet head - the "salvager" identity this gimmick is named for.
    const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 6), mats.metal);
    craneBase.position.set(0, 0.9, 1.2);
    group.add(craneBase);
    const craneArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.6), mats.metal);
    craneArm.position.set(0, 1.5, 2.3);
    craneArm.rotation.x = -0.5;
    group.add(craneArm);
    const magnetHead = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 10), mats.dark);
    magnetHead.rotation.x = Math.PI / 2;
    magnetHead.position.set(0, 2.15, 3.4);
    group.add(magnetHead);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.4), mats.dark);
    engineBlock.position.set(0, 0.5, -2.7);
    group.add(engineBlock);

    [-0.9, 0.9].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.6, -3.2);
      group.add(pipe);
    });

    return [{ x: -0.9, y: 0.3, z: -3.6 }, { x: 0.9, y: 0.3, z: -3.6 }];
  }

  // ---- Phoenix: firebird-styled hull that cheats death once per race ----
  function buildPhoenixHull(group, mats) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 5.6), mats.hull);
    hull.position.set(0, 0.2, -0.2);
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.87, 5.6), mats.stripe);
    stripe.position.set(0, 0.2, -0.2);
    group.add(stripe);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.0, 5), mats.hull);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.2, 3.2);
    group.add(nose);

    // Wing-like fins swept back from the mid-hull.
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.4), mats.metal);
      wing.position.set(side * 1.3, 0.35, -0.3);
      wing.rotation.z = side * -0.3;
      wing.rotation.y = side * -0.4;
      group.add(wing);
    });

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.6), mats.dark);
    cabin.position.set(0, 0.8, -0.6);
    group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.12), mats.glass);
    windshield.position.set(0, 0.88, 0.1);
    windshield.rotation.x = -0.65;
    group.add(windshield);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 1.2), mats.dark);
    engineBlock.position.set(0, 0.4, -2.8);
    group.add(engineBlock);

    [-0.55, 0.55].forEach((x) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 6), mats.metal);
      pipe.rotation.x = Math.PI / 2.6;
      pipe.position.set(x, 0.45, -3.3);
      group.add(pipe);
    });

    // Flame-tail fanning out like a firebird's tail, instead of a spoiler.
    [-0.3, 0, 0.3].forEach((x) => {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 4), mats.metal);
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(x, 0.45, -3.7);
      group.add(tail);
    });

    return [{ x: -0.55, y: 0.2, z: -3.5 }, { x: 0.55, y: 0.2, z: -3.5 }];
  }

  // A cone anchored at its base (local origin) so scaling stretches it
  // outward from a fixed point - used to fake a flickering exhaust flame.
  function buildFlameCone(radius, height, color, opacity) {
    const geo = new THREE.ConeGeometry(radius, height, 6);
    geo.translate(0, height / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; // base stays put, tip trails toward -Z
    return mesh;
  }

  function buildWake() {
    const geo = new THREE.PlaneGeometry(1.6, 6, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    const left = new THREE.Mesh(geo, mat.clone());
    const right = new THREE.Mesh(geo, mat.clone());
    left.rotation.x = -Math.PI / 2;
    right.rotation.x = -Math.PI / 2;
    return { left, right };
  }

  function Boat(boatConfig) {
    const config = boatConfig || {};
    const mult = Object.assign({ speed: 1, turn: 1, boost: 1 }, config.mult);
    this.speedMult = mult.speed;
    this.turnMult = mult.turn;
    this.boostMult = mult.boost;
    this.boatId = config.id || null;
    this.weight = config.weight || 1;
    // Health pool scales with hull weight - heavier boats (Green Viper,
    // Gold Comet) shrug off more punishment, lighter ones (Blue Bolt) are
    // glass cannons that trade durability for speed.
    this.maxHealth = Math.round(PHYS.MAX_HEALTH * this.weight);
    // Optional per-boat special abilities (see js/boats.js) - empty for the
    // original four, which stay pure stat/weight tradeoffs with no active
    // mechanic. A boat can carry more than one (Iron Turtle has both armor
    // and overdrive). Each entry is { type, ...params }; see getGimmick(),
    // takeDamage(), and the boostRegen/foil/airBoost/overdrive/vampire hooks
    // in update()/resolveBoatCollision() below for what each type does.
    this.gimmicks = config.gimmicks || [];
    // Overdrive-only: seconds boost has been held continuously.
    this.boostHoldTime = 0;
    // Vampire-only: time left before the next ram can proc a heal - stops a
    // single ram-through of a starting-grid pileup from stacking multiple
    // heals in a couple of seconds (see resolveBoatCollision below).
    this.vampireCooldown = 0;
    // Phoenix-only: whether this race's one revive has already been spent
    // (see takeDamage above) - cleared by reset() (a fresh race) but not by
    // respawnAtCheckpoint (a mid-race respawn), so it's truly once per race.
    this.usedPhoenix = false;
    // Phoenix-only: one-shot "a revive just happened" flag - see takeDamage.
    this.justRevived = false;
    // Armor-only (Iron Turtle/Reinforced Hull): one-shot "a mitigated hit
    // just landed" flag - see takeDamage.
    this.justArmored = false;
    // Phoenix-only: separate from invulnTimer on purpose - see takeDamage's
    // comment on why sharing that field was a bug (it also froze input and
    // showed "RESPAWNING" on the HUD, both wrong for a boat that never left
    // the track).
    this.phoenixGraceTimer = 0;
    // Drift King only: driftChargeTimer counts up while actively drifting
    // and resets the instant it stops; driftBoostTimer is the payout - a
    // countdown of bonus speed that starts the moment a long-enough drift
    // ends (see update()).
    this.driftChargeTimer = 0;
    this.driftBoostTimer = 0;

    const built = buildMesh(config);
    this.mesh = built.group;
    this.flamePairs = built.flamePairs;
    this.boostLight = built.boostLight;

    const wake = buildWake();
    this.mesh.add(wake.left, wake.right);
    wake.left.position.set(-1.2, -0.08, -3.5);
    wake.right.position.set(1.2, -0.08, -3.5);
    this.wake = wake;

    this.wakeTrail = HT.WakeTrail.build();

    this.position = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    // Starts empty - boost is only ever earned from boost pads, never free
    // at the line (see main.js's checkBoostPads).
    this.boostFuel = 0;
    this.overheated = false;
    this.health = this.maxHealth;
    this.invulnTimer = 0;
    this.airborne = false;
    this.verticalVel = 0;
    this.groundY = 0;
    this.pitch = 0;
    this.roll = 0;
    this.collideCooldown = 0;
    // Previous frame's track.findNearestSample() index, fed back in as a
    // search hint so the lookup stays anchored to this boat's own lane
    // instead of a global scan that can snap across to a nearby stretch of
    // the same winding river. Null forces one full-track scan (cheap, one-
    // time) the first time this boat is updated.
    this.trackIndexHint = null;
  }

  Boat.prototype.reset = function (track) {
    this.position.copy(track.startPosition);
    const t = track.startTangent;
    this.heading = Math.atan2(t.x, t.z);
    this.speed = 0;
    this.boostFuel = 0;
    this.overheated = false;
    this.health = this.maxHealth;
    this.invulnTimer = 0;
    this.airborne = false;
    this.verticalVel = 0;
    this.groundY = track.startPosition.y + track.waveHeight(this.position.x, this.position.z, 0);
    this.pitch = 0;
    this.roll = 0;
    this.collideCooldown = 0;
    this.boostHoldTime = 0;
    this.vampireCooldown = 0;
    this.usedPhoenix = false;
    this.justRevived = false;
    this.justArmored = false;
    this.phoenixGraceTimer = 0;
    this.driftChargeTimer = 0;
    this.driftBoostTimer = 0;
    this.trackIndexHint = null;
    this.mesh.position.set(this.position.x, this.groundY, this.position.z);
    this.mesh.rotation.set(0, this.heading, 0);
    this.setFlamesVisible(false);
    this.wakeTrail.points.length = 0;
    this.wakeTrail.geo.setDrawRange(0, 0);
  };

  // Mid-race respawn after an explosion (health hit 0) - same idea as
  // reset() but keeps the race/lap/checkpoint bookkeeping in main.js (and
  // ai.js for AI racers) untouched; this only ever repositions the boat and
  // restores its own physical state. pos/tangent are the last checkpoint the
  // boat actually passed, so it comes back into the race where it left off
  // rather than all the way back at the start line.
  Boat.prototype.respawnAtCheckpoint = function (pos, tangent, track, elapsed) {
    this.position.copy(pos);
    this.heading = Math.atan2(tangent.x, tangent.z);
    this.speed = 0;
    this.boostFuel = 0;
    this.overheated = false;
    this.health = this.maxHealth;
    this.invulnTimer = PHYS.RESPAWN_INVULN;
    this.airborne = false;
    this.verticalVel = 0;
    this.groundY = pos.y + (track ? track.waveHeight(pos.x, pos.z, elapsed || 0) : 0);
    this.pitch = 0;
    this.roll = 0;
    this.collideCooldown = PHYS.RESPAWN_INVULN;
    this.trackIndexHint = null;
    this.mesh.position.set(this.position.x, this.groundY, this.position.z);
    this.mesh.rotation.set(0, this.heading, 0);
    this.setFlamesVisible(false);
  };

  Boat.prototype.setFlamesVisible = function (visible) {
    this.flamePairs.forEach((pair) => {
      pair.outer.visible = visible;
      pair.inner.visible = visible;
    });
    this.boostLight.intensity = 0;
  };

  Boat.prototype.getGimmick = function (type) {
    return this.gimmicks.find((g) => g.type === type) || null;
  };

  // Single chokepoint for every source of health loss (wall, bump, launch,
  // overheat) so the Iron Turtle's armor gimmick only needs to live in one
  // place rather than being threaded through each call site. Invulnerability
  // is checked here too, same as the inline checks this replaced.
  Boat.prototype.takeDamage = function (amount) {
    if (this.invulnTimer > 0 || this.phoenixGraceTimer > 0) return;
    const armor = this.getGimmick('armor');
    this.health -= amount * (armor ? armor.damageMult : 1);
    // One-shot flag main.js checks (and clears) right alongside its own
    // damage-sound triggers (wall collision, boat-vs-boat bump/launch) to
    // swap the normal bump() sound for a duller armorClunk() instead.
    if (armor) this.justArmored = true;

    // Phoenix only: the first time this would actually kill it (any race -
    // reset() clears usedPhoenix, respawnAtCheckpoint does not, so it's a
    // true once-per-race save, not once-per-life), cheat the explosion
    // check in main.js (`if (boat.health <= 0) handleExplosion(...)`, run
    // right after this) by pulling health back above 0 before it ever sees it.
    // Uses its own phoenixGraceTimer rather than invulnTimer: that field
    // also freezes input for the whole window (update() below) and drives
    // main.js's "RESPAWNING n" HUD text - both correct for a real post-
    // explosion respawn, but wrong here, since the boat never actually left
    // the track. Phoenix should keep driving straight through the save.
    if (this.health <= 0) {
      const phoenix = this.getGimmick('phoenix');
      if (phoenix && !this.usedPhoenix) {
        this.usedPhoenix = true;
        this.health = this.maxHealth * phoenix.reviveHealthFrac;
        this.phoenixGraceTimer = phoenix.invulnDuration;
        // One-shot flag main.js checks (and clears) once per frame, right
        // after every place takeDamage() can be called from (this boat's
        // own update() below, and boat-vs-boat collision resolution, which
        // runs separately in main.js) - a revive is dramatic enough it
        // deserves its own cue rather than just the health bar snapping up.
        this.justRevived = true;
      }
    }
  };

  Boat.prototype.update = function (dt, input, track, elapsed) {
    const maxBoostFuel = PHYS.BOOST_MAX_FUEL * this.boostMult;
    this.collideCooldown = Math.max(0, this.collideCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.vampireCooldown = Math.max(0, this.vampireCooldown - dt);
    this.phoenixGraceTimer = Math.max(0, this.phoenixGraceTimer - dt);

    // invulnTimer is only ever set positive by respawnAtCheckpoint (a normal
    // reset() or fresh spawn leaves it at 0), so this only ever fires for a
    // boat that just exploded - frozen in place for the whole grace window
    // instead of being free to immediately drive off. Applies identically to
    // the player and every AI racer, since both run through this same update().
    if (this.invulnTimer > 0) {
      input = { throttle: 0, brake: 0, steer: 0, boost: false };
    }

    // Boosting itself has no fuel gate anymore - holding it always gives the
    // full boost accel/top speed. What changes is what it costs: with fuel
    // in the tank it drains that as usual; once the tank's empty, holding it
    // anyway overheats the engine and burns health instead, at the same
    // rate the tank would have drained. That's a real risk (health can hit
    // 0 and the boat explodes - see main.js) the player opts into for a
    // bit more speed, not a cooldown that just blocks the button.
    // Airborne normally cancels boosting outright - Skybreaker's airBoost
    // gimmick is the one exception (see the curMax airBoostBonus below).
    const airBoostCfg = this.getGimmick('airBoost');
    const boosting = input.boost && (!this.airborne || !!airBoostCfg);
    this.overheated = false;

    // Overdrive-only: tracks how long boost has been held continuously so
    // Iron Turtle can shift into overdrive after a couple of seconds of
    // sustained boosting, and drops straight back out the instant boost is
    // released (no lingering timer to manage).
    const overdriveCfg = this.getGimmick('overdrive');
    if (overdriveCfg) this.boostHoldTime = boosting ? this.boostHoldTime + dt : 0;
    const inOverdrive = !!(overdriveCfg && this.boostHoldTime >= overdriveCfg.chargeTime);

    // Ragefin only: the lower its health drops below the gimmick's
    // threshold, the more top speed/accel it gains - scales linearly to
    // maxBonus right as health bottoms out at 0. A glass-cannon payoff for
    // taking damage instead of avoiding it, the opposite trade Iron
    // Turtle's armor makes.
    const rageCfg = this.getGimmick('rage');
    let rageMult = 1;
    if (rageCfg) {
      const healthFrac = this.health / this.maxHealth;
      if (healthFrac < rageCfg.threshold) {
        rageMult = 1 + rageCfg.maxBonus * (1 - healthFrac / rageCfg.threshold);
      }
    }

    // Drift King only: braking while steering hard at real speed both kicks
    // in a big turn-rate bonus directly (applied down at the heading update
    // below) AND, held long enough, charges a brief speed burst that pays
    // out the instant the drift ends - releasing the brake or straightening
    // the wheel. Without the burst, a corner-only bonus barely mattered on
    // a track without many sharp turns; this makes committing to a drift
    // worth it even on a straight right after. No fuel/health cost - the
    // "cost" is the speed given up by braking through the drift itself.
    const driftCfg = this.getGimmick('drift');
    const drifting = !!(driftCfg && input.brake > 0 && Math.abs(input.steer) > 0.3 && Math.abs(this.speed) > 20);
    // One-shot edge trigger (true only on the exact frame a charged drift
    // pays out) - see main.js, which uses it to fire a one-off sound rather
    // than something that would otherwise replay every frame of the payout.
    let driftBoostStarted = false;
    if (driftCfg) {
      if (drifting) {
        this.driftChargeTimer += dt;
      } else {
        if (this.driftChargeTimer >= driftCfg.boostChargeTime) {
          this.driftBoostTimer = driftCfg.boostDuration;
          driftBoostStarted = true;
        }
        this.driftChargeTimer = 0;
      }
      this.driftBoostTimer = Math.max(0, this.driftBoostTimer - dt);
    }
    // Continuous state for as long as the payout lasts - drives the flame
    // recolor below regardless of whether the boost button is even held,
    // since this bonus applies independently of normal fuel-based boosting.
    const driftBoosting = !!(driftCfg && this.driftBoostTimer > 0);
    const driftBoostMult = driftBoosting ? driftCfg.boostSpeedMult : 1;

    let accel = 0;
    if (input.throttle > 0) accel += PHYS.ACCEL * this.speedMult * rageMult * driftBoostMult * input.throttle;
    if (input.brake > 0) {
      if (this.speed > 0.5) {
        // Drift King only: brake is the drift trigger, not a normal brake,
        // while actually drifting - full BRAKE_DECEL would kill the speed
        // a powerslide is supposed to carry through the corner, defeating
        // the whole point of holding one. Softened to driftBrakeMult
        // instead (see js/boats.js) rather than the full value every other
        // boat (and this one, outside an active drift) still gets.
        const brakeMult = drifting ? driftCfg.driftBrakeMult : 1;
        accel -= PHYS.BRAKE_DECEL * brakeMult * input.brake;
      } else {
        accel -= PHYS.REVERSE_ACCEL * input.brake;
      }
    }
    if (boosting) {
      const drainMult = inOverdrive ? overdriveCfg.drainMult : 1;
      accel += PHYS.BOOST_ACCEL_BONUS * this.speedMult * rageMult * driftBoostMult * (inOverdrive ? overdriveCfg.accelMult : 1);
      if (this.boostFuel > 0.5) {
        this.boostFuel = Math.max(0, this.boostFuel - PHYS.BOOST_DRAIN * drainMult * dt);
      } else {
        this.overheated = true;
        this.takeDamage(PHYS.OVERHEAT_HEALTH_DRAIN * drainMult * dt);
      }
    } else {
      const regen = this.getGimmick('boostRegen');
      // Nitro Wasp only: a slow trickle of fuel even off the pads. Gated to
      // "not currently boosting" so it never offsets the boost drain above,
      // just shortens how long the tank stays empty between pads.
      if (regen) this.boostFuel = Math.min(maxBoostFuel, this.boostFuel + regen.boostRegenRate * dt);
    }
    // No passive boost regen otherwise - only main.js's checkBoostPads() refills it.
    this.health = Math.min(this.maxHealth, this.health + PHYS.HEALTH_REGEN * dt);

    const dragForce = PHYS.DRAG * this.speed * Math.abs(this.speed);
    accel -= dragForce;
    if (Math.abs(this.speed) > 0.01) {
      accel -= Math.sign(this.speed) * PHYS.BASE_FRICTION;
    }

    this.speed += accel * dt;
    // Overdrive raises Iron Turtle's own boost cap; airBoost raises
    // Skybreaker's boost cap specifically while airborne (its ground boost
    // top speed is unchanged) - both default to 1 for every other boat.
    const overdriveTopMult = inOverdrive ? overdriveCfg.topSpeedMult : 1;
    const airBoostTopMult = (airBoostCfg && this.airborne && boosting) ? airBoostCfg.speedMult : 1;
    const curMax = (boosting ? PHYS.BOOST_MAX_SPEED * overdriveTopMult * airBoostTopMult : PHYS.MAX_SPEED) * this.speedMult * rageMult * driftBoostMult;
    this.speed = clamp(this.speed, PHYS.REVERSE_MAX, curMax);
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0 && input.brake === 0) this.speed = 0;

    const speedFactor = clamp(Math.abs(this.speed) / 9, 0, 1);
    const dir = this.speed < 0 ? -1 : 1;
    // drifting/driftCfg computed earlier alongside driftBoostMult - its
    // passive turnMult is deliberately below-average (see js/boats.js) so
    // this active input, not a stat, is where its cornering actually comes from.
    const turnMult = this.turnMult * (drifting ? driftCfg.turnBonusMult : 1);
    this.heading -= input.steer * PHYS.TURN_RATE * turnMult * speedFactor * dir * dt;

    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.position.addScaledVector(forward, this.speed * dt);

    let collided = false;
    const nearest = track.findNearestSample(this.position, this.trackIndexHint);
    this.trackIndexHint = nearest.index;
    // Uses the nearest sample's own halfWidth rather than the track-wide
    // constant, so a boat on a narrower shortcut channel is held to that
    // channel's tighter bounds instead of the main path's wider ones.
    const limit = nearest.halfWidth - PHYS.BOAT_RADIUS * 0.5;
    if (Math.abs(nearest.lateral) > limit) {
      const overshoot = Math.abs(nearest.lateral) - limit;
      const sign = Math.sign(nearest.lateral);
      const pr = new THREE.Vector3(-nearest.tangent.z, 0, nearest.tangent.x);
      this.position.addScaledVector(pr, -sign * overshoot);
      // Snap back inside the bank every frame so it can't be clipped through,
      // but only land the speed hit once per cooldown window - otherwise
      // holding throttle into the bank re-applies the multiplier every single
      // frame and compounds to a dead stop almost instantly (the same freeze
      // bug the boat-vs-boat bounce above had to avoid).
      if (this.collideCooldown <= 0) {
        this.speed *= 0.55;
        this.collideCooldown = 0.35;
        this.takeDamage(PHYS.WALL_DAMAGE);
      }
      collided = true;
    }

    let justLanded = false;
    let onRamp = false;
    let rampProgress = 0;
    // Which entry of track.ramps (if any) the boat is currently over - a
    // course can have several jumps now (see track.js), so this replaces
    // the single track.rampPos/rampTangent/etc. fields every calculation
    // below used to read directly.
    let activeRamp = null;
    const waterY = nearest.samplePos.y + track.waveHeight(this.position.x, this.position.z, elapsed);

    if (!this.airborne) {
      for (let ri = 0; ri < track.ramps.length; ri++) {
        const ramp = track.ramps[ri];
        const toBoat = new THREE.Vector3().subVectors(this.position, ramp.pos);
        const along = toBoat.dot(ramp.tangent);
        // Lateral distance from the ramp's OWN centerline - not nearest.lateral,
        // which is the boat's offset from whatever track sample is nearest to
        // it right now, unrelated to the ramp's position. Using that let a
        // boat trigger the ramp from anywhere on the course: "along" alone can
        // land inside +/-halfDepth purely by coincidence (whenever the
        // ramp's tangent happens to be closer to perpendicular than parallel
        // to the vector from the ramp to the boat), with no actual proximity
        // check to catch it.
        const rampPerpX = -ramp.tangent.z, rampPerpZ = ramp.tangent.x;
        const rampLateral = toBoat.x * rampPerpX + toBoat.z * rampPerpZ;
        const withinDepth = along > -ramp.halfDepth && along < ramp.halfDepth;
        const withinWidth = Math.abs(rampLateral) < ramp.halfWidth;
        if (withinDepth && withinWidth) {
          onRamp = true;
          activeRamp = ramp;
          rampProgress = clamp((along + ramp.halfDepth) / (ramp.halfDepth * 2), 0, 1);
          if (rampProgress > 0.92 && this.speed > 20) {
            this.airborne = true;
            // Skybreaker only: hydrofoils fling it noticeably higher/farther
            // off the same ramp everyone else uses.
            const foil = this.getGimmick('foil');
            const foilMult = foil ? foil.rampLaunchMult : 1;
            this.verticalVel = (PHYS.RAMP_LAUNCH_SPEED + this.speed * 0.15) * foilMult;
            this.groundY = waterY + rampProgress * ramp.height;
          }
          break; // ramps don't overlap - first match wins, skip the rest
        }
      }
    }

    if (this.airborne) {
      this.verticalVel -= PHYS.GRAVITY * dt;
      this.groundY += this.verticalVel * dt;
      if (this.groundY <= waterY) {
        this.groundY = waterY;
        this.airborne = false;
        this.verticalVel = 0;
        justLanded = true;
      }
    } else if (onRamp) {
      this.groundY = waterY + rampProgress * activeRamp.height;
    } else {
      this.groundY = waterY;
    }

    // Pitch/roll from local wave slope for visual feel.
    const sampleDist = 2.2;
    const fwdY = track.waveHeight(this.position.x + forward.x * sampleDist, this.position.z + forward.z * sampleDist, elapsed);
    const backY = track.waveHeight(this.position.x - forward.x * sampleDist, this.position.z - forward.z * sampleDist, elapsed);
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const rightY = track.waveHeight(this.position.x + right.x * sampleDist, this.position.z + right.z * sampleDist, elapsed);
    const leftY = track.waveHeight(this.position.x - right.x * sampleDist, this.position.z - right.z * sampleDist, elapsed);

    const rampIncline = onRamp ? Math.atan2(activeRamp.height, activeRamp.halfDepth * 2) : 0;
    const trackSlopePitch = Math.asin(clamp(-nearest.tangent.y, -1, 1));
    const targetPitch = this.airborne
      ? clamp(this.verticalVel * -0.02, -0.3, 0.3)
      : onRamp ? -rampIncline : trackSlopePitch + Math.atan2(backY - fwdY, sampleDist * 2);
    const targetRoll = (this.airborne || onRamp) ? 0 : Math.atan2(leftY - rightY, sampleDist * 2) + input.steer * 0.12 * speedFactor;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);

    this.mesh.position.set(this.position.x, this.groundY + PHYS.HULL_OFFSET, this.position.z);
    this.mesh.rotation.set(this.pitch, this.heading, this.roll);

    const speedRatio = clamp(Math.abs(this.speed) / PHYS.MAX_SPEED, 0, 1);
    const wakeOpacity = speedRatio * 0.4;
    this.wake.left.material.opacity = wakeOpacity;
    this.wake.right.material.opacity = wakeOpacity;

    const sternPos = this.mesh.position.clone().addScaledVector(forward, -3.4);
    HT.WakeTrail.update(this.wakeTrail, dt, sternPos, forward, speedRatio, this.airborne);

    this.updateFlames(boosting, elapsed, inOverdrive, driftBoosting);

    return {
      collided, justLanded, boosting, nearest, overheated: this.overheated, exploded: this.health <= 0,
      inOverdrive, driftBoosting, driftBoostStarted,
    };
  };

  // Exhaust flame colors, keyed by which state currently owns them - checked
  // in priority order below (drift boost first, then overdrive, then plain
  // boosting) since at most one ever applies to a given boat/frame anyway
  // (only Drift King has drift, only Iron Turtle has overdrive).
  const FLAME_COLORS = {
    normal: { outer: 0xff6a00, inner: 0xfff28a, light: 0xff8c33 },
    // Drift King's payout - electric blue/cyan so it reads as a distinct
    // "free" bonus rather than the normal fuel-based boost flame.
    drift: { outer: 0x00c8ff, inner: 0xd0f7ff, light: 0x33d0ff },
    // Iron Turtle's overdrive - white-hot core over a redder outer flame,
    // like an engine genuinely being redlined rather than just "on".
    overdrive: { outer: 0xff2200, inner: 0xdfffff, light: 0xfff0d0 },
  };

  Boat.prototype.updateFlames = function (boosting, elapsed, inOverdrive, driftBoosting) {
    if (!boosting && !driftBoosting) {
      if (this.flamePairs[0].outer.visible) this.setFlamesVisible(false);
      return;
    }
    // Overdrive gets a rougher, wider flicker on top of the color swap
    // below - a visibly more aggressive burn to match the engine actually
    // being pushed past its normal limit (see audio.js's updateEngine).
    const flickerAmp1 = inOverdrive ? 0.2 : 0.12;
    const flickerAmp2 = inOverdrive ? 0.14 : 0.08;
    const flickerAmp3 = inOverdrive ? 0.18 : 0.1;
    const flickerFreq1 = inOverdrive ? 68 : 45;
    const flickerFreq2 = inOverdrive ? 25 : 17;
    const sizeBoost = inOverdrive ? 1.15 : 1;
    const colors = driftBoosting ? FLAME_COLORS.drift : inOverdrive ? FLAME_COLORS.overdrive : FLAME_COLORS.normal;

    this.flamePairs.forEach((pair, i) => {
      pair.outer.visible = true;
      pair.inner.visible = true;
      pair.outer.material.color.setHex(colors.outer);
      pair.inner.material.color.setHex(colors.inner);
      const phase = i * 1.7;
      const flicker = (1 + Math.sin(elapsed * flickerFreq1 + phase) * flickerAmp1
        + Math.sin(elapsed * flickerFreq2 + phase) * flickerAmp2
        + (Math.random() - 0.5) * flickerAmp3) * sizeBoost;
      pair.outer.scale.set(flicker * 0.9, flicker * 1.15, flicker * 0.9);
      pair.inner.scale.set(flicker * 0.85, flicker * 1.3, flicker * 0.85);
    });
    this.boostLight.color.setHex(colors.light);
    const lightBase = inOverdrive ? 2.6 : 1.8;
    const lightFreq = inOverdrive ? 70 : 50;
    const lightJitter = inOverdrive ? 0.5 : 0.3;
    this.boostLight.intensity = lightBase + Math.sin(elapsed * lightFreq) * (inOverdrive ? 0.6 : 0.4)
      + (Math.random() - 0.5) * lightJitter;
  };

  // A bit more generous than 2x hull radius so boats feel solid rather than
  // clipping through each other before the push kicks in.
  const BOAT_COLLIDE_DIST = PHYS.BOAT_RADIUS * 2 + 1.5;

  // Resolves a possible collision between two boats (player-vs-AI or
  // AI-vs-AI, called for every pair each frame). Rules: if both are boosting
  // or neither is, it's a weight-driven bounce - each boat is displaced in
  // inverse proportion to its own weight (a heavy boat barely moves a light
  // one bounces well clear), and any speed lost is biased the same way, so
  // heavier boats plow through mostly unaffected and just shove lighter ones
  // aside. If exactly one is boosting, it plows through at full speed and
  // launches the other airborne, same arc as a ramp launch (lighter victims
  // fly higher). Airborne boats are left alone - already mid-collision from
  // a ramp or an earlier hit, no need to pile on.
  //
  // The push-apart itself always runs while boats overlap (so they never
  // visually clip through each other), but the speed penalty / launch is
  // gated by each boat's collideCooldown so grinding alongside a rival for
  // a while only costs one hit, not one every single frame - a continuous
  // per-frame speed multiplier compounds to a dead stop in a few frames,
  // which read as the game freezing rather than a bounce.
  //
  // Returns 'bump', 'launch', or null (nothing in range, or still on
  // cooldown from the last hit) so the caller can decide whether to react
  // (e.g. play a sound only when the player was involved).
  function resolveBoatCollision(a, aBoosting, b, bBoosting) {
    if (a.airborne || b.airborne) return null;
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= BOAT_COLLIDE_DIST * BOAT_COLLIDE_DIST || distSq < 1e-6) return null;

    const dist = Math.sqrt(distSq);
    // Push a little past exact touching distance so they clear the collision
    // radius outright instead of landing right back on the boundary next frame.
    const push = (BOAT_COLLIDE_DIST - dist) + 0.6;
    const nx = dx / dist, nz = dz / dist;

    if (aBoosting === bBoosting) {
      // Each boat's share of the separation (and of the speed hit below) is
      // the OTHER boat's weight fraction - so a boat twice as heavy as its
      // rival moves/loses about a third as much, never the reverse.
      const totalWeight = a.weight + b.weight;
      const aFrac = b.weight / totalWeight;
      const bFrac = a.weight / totalWeight;
      a.position.x -= nx * push * aFrac;
      a.position.z -= nz * push * aFrac;
      b.position.x += nx * push * bFrac;
      b.position.z += nz * push * bFrac;
      a.mesh.position.x = a.position.x; a.mesh.position.z = a.position.z;
      b.mesh.position.x = b.position.x; b.mesh.position.z = b.position.z;

      if (a.collideCooldown > 0 || b.collideCooldown > 0) return null;
      // Capped well below the old flat cut, and split the same lopsided way -
      // this is a bounce, not a wall, so nobody should ever stall from it.
      a.speed *= 1 - 0.22 * aFrac;
      b.speed *= 1 - 0.22 * bFrac;
      a.collideCooldown = 0.35;
      b.collideCooldown = 0.35;
      a.takeDamage(PHYS.BUMP_DAMAGE);
      b.takeDamage(PHYS.BUMP_DAMAGE);
      return 'bump';
    }

    const boosting = aBoosting ? a : b;
    const victim = aBoosting ? b : a;
    if (victim.collideCooldown > 0) return null;
    const landedHit = victim.invulnTimer <= 0 && victim.phoenixGraceTimer <= 0;
    victim.takeDamage(PHYS.LAUNCH_DAMAGE);
    // Vampire Ray only: ramming a non-boosting rival while boosting heals it
    // off the impact - but only when the hit actually landed (not against an
    // invulnerable, just-respawned victim) and its own proc cooldown is up,
    // so ramming through a bunched-up starting grid can't stack several
    // heals in a couple of seconds - one ram's worth of healing at a time.
    const vampireCfg = boosting.getGimmick('vampire');
    if (landedHit && vampireCfg && boosting.vampireCooldown <= 0) {
      boosting.health = Math.min(boosting.maxHealth, boosting.health + vampireCfg.healOnRam);
      boosting.vampireCooldown = vampireCfg.cooldown;
    }
    let vx = victim.position.x - boosting.position.x;
    let vz = victim.position.z - boosting.position.z;
    const vd = Math.hypot(vx, vz) || 1;
    vx /= vd; vz /= vd;
    victim.position.x += vx * (push + 2);
    victim.position.z += vz * (push + 2);
    victim.collideCooldown = 0.5;
    victim.speed *= 0.7;
    victim.airborne = true;
    // Heavier victims launch less dramatically - a light boat gets sent
    // flying, a heavy one barely leaves the water.
    victim.verticalVel = (PHYS.RAMP_LAUNCH_SPEED + boosting.speed * 0.15) / victim.weight;
    victim.mesh.position.x = victim.position.x; victim.mesh.position.z = victim.position.z;
    return 'launch';
  }

  function disposeBoat(scene, boat) {
    if (!boat || !boat.mesh) return;
    scene.remove(boat.mesh);
    boat.mesh.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    if (boat.wakeTrail) {
      scene.remove(boat.wakeTrail.mesh);
      HT.WakeTrail.dispose(boat.wakeTrail);
    }
  }

  // One-shot cosmetic debris burst for a health-depleted boat exploding -
  // runs on its own rAF loop rather than the main game clock since it's
  // purely decorative and outlives no gameplay state, then cleans itself up.
  function spawnExplosion(scene, position) {
    const group = new THREE.Group();
    group.position.copy(position);
    const particles = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const size = 0.35 + Math.random() * 0.5;
      const color = Math.random() < 0.5 ? 0xff6a00 : 0x262626;
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
      const theta = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 10;
      mesh.userData.vel = new THREE.Vector3(Math.cos(theta) * speed, 4 + Math.random() * 8, Math.sin(theta) * speed);
      mesh.position.set(0, 0.6, 0);
      group.add(mesh);
      particles.push(mesh);
    }
    scene.add(group);

    const DURATION = 700;
    const start = performance.now();
    function tick() {
      const elapsedMs = performance.now() - start;
      const alpha = 1 - elapsedMs / DURATION;
      if (alpha <= 0) {
        scene.remove(group);
        particles.forEach((p) => { p.geometry.dispose(); p.material.dispose(); });
        return;
      }
      const step = 1 / 60;
      particles.forEach((p) => {
        p.userData.vel.y -= 22 * step;
        p.position.addScaledVector(p.userData.vel, step);
        p.material.opacity = Math.max(0, alpha);
        p.rotation.x += 0.2;
        p.rotation.y += 0.15;
      });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  global.HT = global.HT || {};
  global.HT.Boat = Boat;
  global.HT.Boat.dispose = disposeBoat;
  global.HT.Boat.resolveCollision = resolveBoatCollision;
  global.HT.Boat.spawnExplosion = spawnExplosion;
  global.HT.PHYS = PHYS;
})(window);
