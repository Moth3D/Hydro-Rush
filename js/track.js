// Procedurally builds a river course: water ribbon, banks, checkpoints, boost
// pads and a jump ramp. No external assets - everything is generated geometry.
// Takes a level config (see levels.js) so new courses can be added by just
// supplying new control points / tuning values. Control points may be [x,z]
// (flat) or [x,y,z] (elevation-aware, for hills/drops). Levels can also be a
// closed loop (default) or an open point-to-point course (`loop: false`).
(function (global) {

  const SAMPLE_COUNT = 240;

  function waveHeight(x, z, t) {
    return Math.sin(x * 0.045 + t * 1.3) * 0.5 +
           Math.sin(z * 0.06 - t * 1.7) * 0.4 +
           Math.sin((x + z) * 0.025 + t * 0.8) * 0.35 +
           Math.sin(x * 0.008 + z * 0.006 + t * 0.4) * 0.6;
  }

  function hash(i) {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  const VOXEL_STEP = 0.7;
  function voxelWaveHeight(x, z, t) {
    return Math.round(waveHeight(x, z, t) / VOXEL_STEP) * VOXEL_STEP;
  }

  // Small tileable checkerboard texture for the voxel ground backdrop -
  // procedurally generated, no external image assets.
  function buildCheckerTexture(colorA, colorB) {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    ctx.fillStyle = '#' + colorA.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#' + colorB.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  // Appends one axis-aligned box (position + vertex color + indices) into
  // shared plain arrays, so many boxes can be merged into a single mesh.
  const BOX_FACES = [
    [0, 1, 2, 0, 2, 3], [4, 6, 5, 4, 7, 6],
    [0, 1, 5, 0, 5, 4], [3, 2, 6, 3, 6, 7],
    [0, 3, 7, 0, 7, 4], [1, 2, 6, 1, 6, 5],
  ];
  function appendBox(positions, colors, indices, cx, cy, cz, dx, dy, dz, color) {
    const x0 = cx - dx / 2, x1 = cx + dx / 2;
    const y0 = cy - dy / 2, y1 = cy + dy / 2;
    const z0 = cz - dz / 2, z1 = cz + dz / 2;
    const verts = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    const base = positions.length / 3;
    verts.forEach((v) => {
      positions.push(v[0], v[1], v[2]);
      colors.push(color.r, color.g, color.b);
    });
    BOX_FACES.forEach((f) => f.forEach((idx) => indices.push(base + idx)));
  }

  // Appends one 4-sided pyramid (square base, single apex) for tree
  // crowns/rock spires - same merge-into-shared-arrays pattern as appendBox.
  // No base face: these always sit on the ground/bank, so the underside is
  // never visible and skipping it halves the triangle count for free.
  // An optional skirt extends the base square straight down by that much
  // (as a plain 4-sided prism under the pyramid) - for props planted on a
  // course with a lot of elevation change, so a spire doesn't visibly float
  // once a steep drop further along the course lets the camera see under it.
  function appendPyramid(positions, colors, indices, cx, cyBase, cz, baseSize, height, color, skirt) {
    const h = baseSize / 2;
    const base = positions.length / 3;
    const verts = [
      [cx - h, cyBase, cz - h], [cx + h, cyBase, cz - h],
      [cx + h, cyBase, cz + h], [cx - h, cyBase, cz + h],
      [cx, cyBase + height, cz],
    ];
    verts.forEach((v) => { positions.push(v[0], v[1], v[2]); colors.push(color.r, color.g, color.b); });
    indices.push(
      base + 0, base + 1, base + 4, base + 1, base + 2, base + 4,
      base + 2, base + 3, base + 4, base + 3, base + 0, base + 4
    );
    if (skirt) {
      const skirtBase = positions.length / 3;
      const skirtY = cyBase - skirt;
      const skirtVerts = [
        [cx - h, skirtY, cz - h], [cx + h, skirtY, cz - h],
        [cx + h, skirtY, cz + h], [cx - h, skirtY, cz + h],
      ];
      skirtVerts.forEach((v) => { positions.push(v[0], v[1], v[2]); colors.push(color.r, color.g, color.b); });
      for (let e = 0; e < 4; e++) {
        const e2 = (e + 1) % 4;
        const t0 = base + e, t1 = base + e2, b0 = skirtBase + e, b1 = skirtBase + e2;
        indices.push(t0, b0, t1, t1, b0, b1);
      }
    }
  }

  const DEFAULT_THEME = {
    sky: 0x8fd3ff, fogNear: 220, fogFar: 950,
    waterShallow: 0x2fb7c7, waterDeep: 0x0b4f7a,
    bank: 0x4a7c3f, rock: 0x7a6a58, ground: 0x2f5a33,
  };

  const THEME_COLOR_KEYS = ['sky', 'waterShallow', 'waterDeep', 'bank', 'rock', 'ground'];
  const THEME_NUMBER_KEYS = ['fogNear', 'fogFar'];

  // Builds a themeAt(t) function for a level. Most levels supply a single
  // `theme` and get that back for every t. A level can instead supply
  // `themeZones` - an array of {t, theme} anchors (t in [0,1), ascending) -
  // and this blends smoothly between neighboring anchors as t sweeps around
  // the course, so a long track can travel through multiple distinct biomes
  // instead of one fixed look. Looping courses wrap the last anchor back to
  // the first at t=1 for a seamless join; point-to-point courses just hold
  // the final theme through to the finish.
  function buildThemeResolver(levelConfig, loop) {
    const rawZones = (levelConfig.themeZones || [{ t: 0, theme: levelConfig.theme }])
      .map((z) => ({ t: z.t, theme: Object.assign({}, DEFAULT_THEME, z.theme) }))
      .sort((a, b) => a.t - b.t);

    if (rawZones.length === 1) {
      const only = rawZones[0].theme;
      return function themeAt() { return only; };
    }

    const zones = rawZones.concat([{
      t: 1, theme: loop ? rawZones[0].theme : rawZones[rawZones.length - 1].theme,
    }]);
    const ca = new THREE.Color();
    const cb = new THREE.Color();

    return function themeAt(rawT) {
      const t = Math.max(0, Math.min(0.999999, rawT));
      let idx = 0;
      while (idx < zones.length - 2 && t >= zones[idx + 1].t) idx++;
      const a = zones[idx], b = zones[idx + 1];
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      const out = {};
      THEME_COLOR_KEYS.forEach((k) => {
        ca.set(a.theme[k]); cb.set(b.theme[k]);
        out[k] = ca.lerp(cb, f).getHex();
      });
      THEME_NUMBER_KEYS.forEach((k) => { out[k] = a.theme[k] + (b.theme[k] - a.theme[k]) * f; });
      return out;
    };
  }

  function buildTrack(scene, levelConfig) {
    const VOXEL = !!levelConfig.voxel;
    const LOOP = levelConfig.loop !== false;
    const heightFn = VOXEL ? voxelWaveHeight : waveHeight;
    const HALF_WIDTH = levelConfig.halfWidth || 42;
    // Either a `ramps` array (each entry can override t/height/halfDepth/
    // halfWidth - see the jump-ramp section below) for multiple jumps per
    // course, or the legacy single `rampT` field every original track still
    // uses, normalized into a one-entry array so both shapes hit the same
    // build path.
    const RAMPS_CFG = levelConfig.ramps || [{ t: levelConfig.rampT != null ? levelConfig.rampT : 0.55 }];
    const CHECKPOINT_COUNT = levelConfig.checkpointCount || 8;
    const BOOST_COUNT = levelConfig.boostCount || 6;
    const TOTAL_LAPS = levelConfig.totalLaps || 3;
    const CONTROL_POINTS_2D = levelConfig.controlPoints;
    const themeAt = buildThemeResolver(levelConfig, LOOP);
    const THEME = themeAt(0);

    const group = new THREE.Group();

    // Control points are [x, z] for flat courses or [x, y, z] when a level
    // wants real elevation (hills, drops).
    const pts3d = CONTROL_POINTS_2D.map((p) => (
      p.length >= 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], 0, p[1])
    ));
    const curve = new THREE.CatmullRomCurve3(pts3d, LOOP, 'catmullrom', 0.5);

    // Sample the curve into a dense, evenly-spaced set of points used for both
    // rendering (water/banks) and physics (progress, boundaries). Closed
    // curves repeat their first point at the end; open ones don't.
    const rawPoints = curve.getSpacedPoints(SAMPLE_COUNT);
    if (LOOP) rawPoints.pop();
    const n = rawPoints.length;

    const samples = [];
    let cumLen = 0;
    for (let i = 0; i < n; i++) {
      const cur = rawPoints[i];
      const aIdx = i > 0 ? i - 1 : (LOOP ? n - 1 : i);
      const bIdx = i < n - 1 ? i + 1 : (LOOP ? 0 : i);
      const tangent = new THREE.Vector3().subVectors(rawPoints[bIdx], rawPoints[aIdx]).normalize();
      samples.push({ pos: cur.clone(), tangent, cumLen, t: 0 });
      if (i < n - 1) cumLen += cur.distanceTo(rawPoints[i + 1]);
      else if (LOOP) cumLen += cur.distanceTo(rawPoints[0]);
    }
    const totalLength = cumLen;
    for (let i = 0; i < n; i++) samples[i].t = samples[i].cumLen / totalLength;
    const segCount = LOOP ? n : n - 1;

    function perp(tangent) {
      return new THREE.Vector3(-tangent.z, 0, tangent.x);
    }

    // ---------- Water ribbon ----------
    const ACROSS = [-1, -0.6, -0.2, 0.2, 0.6, 1];
    const waterGeo = new THREE.BufferGeometry();
    const vertCount = n * ACROSS.length;
    const positions = new Float32Array(vertCount * 3);
    const baseXZ = new Float32Array(vertCount * 2);
    const baseElevation = new Float32Array(vertCount);
    const uvs = new Float32Array(vertCount * 2);
    const colors = new Float32Array(vertCount * 3);

    const shallowColor = new THREE.Color();
    const deepColor = new THREE.Color();

    let vi = 0;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const pr = perp(s.tangent);
      // Re-evaluated per sample (cheap - a handful of zones at most) so a
      // multi-biome course's water actually changes color along its length.
      const localTheme = themeAt(s.t);
      shallowColor.set(localTheme.waterShallow);
      deepColor.set(localTheme.waterDeep);
      for (let a = 0; a < ACROSS.length; a++) {
        const offset = ACROSS[a] * HALF_WIDTH;
        const x = s.pos.x + pr.x * offset;
        const z = s.pos.z + pr.z * offset;
        positions[vi * 3] = x;
        positions[vi * 3 + 1] = s.pos.y;
        positions[vi * 3 + 2] = z;
        baseXZ[vi * 2] = x;
        baseXZ[vi * 2 + 1] = z;
        baseElevation[vi] = s.pos.y;
        uvs[vi * 2] = a / (ACROSS.length - 1);
        uvs[vi * 2 + 1] = s.t * 20;
        const edgeFactor = Math.abs(ACROSS[a]);
        const c = shallowColor.clone().lerp(deepColor, 1 - edgeFactor * 0.5);
        colors[vi * 3] = c.r; colors[vi * 3 + 1] = c.g; colors[vi * 3 + 2] = c.b;
        vi++;
      }
    }

    const indices = [];
    const acrossN = ACROSS.length;
    for (let i = 0; i < segCount; i++) {
      const iNext = (i + 1) % n;
      for (let a = 0; a < acrossN - 1; a++) {
        const a00 = i * acrossN + a;
        const a01 = i * acrossN + a + 1;
        const a10 = iNext * acrossN + a;
        const a11 = iNext * acrossN + a + 1;
        indices.push(a00, a10, a01, a01, a10, a11);
      }
    }

    const baseColors = colors.slice();
    const FOAM_COLOR = new THREE.Color(0xf2fbff);

    waterGeo.setIndex(indices);
    waterGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    waterGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    waterGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    waterGeo.computeVertexNormals();

    const waterMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 60,
      specular: 0x99ddff,
      side: THREE.DoubleSide,
      flatShading: VOXEL,
      transparent: true,
      opacity: 0.92,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    group.add(waterMesh);

    function updateWater(t) {
      const posAttr = waterGeo.attributes.position;
      const colorAttr = waterGeo.attributes.color;
      for (let i = 0; i < vertCount; i++) {
        const x = baseXZ[i * 2];
        const z = baseXZ[i * 2 + 1];
        const h = baseElevation[i] + heightFn(x, z, t);
        posAttr.array[i * 3 + 1] = h;

        // Whitecap foam on the tallest wave crests.
        const foam = Math.max(0, Math.min(1, (h - baseElevation[i] - 1.0) / 0.85));
        if (foam > 0) {
          colorAttr.array[i * 3] = baseColors[i * 3] + (FOAM_COLOR.r - baseColors[i * 3]) * foam;
          colorAttr.array[i * 3 + 1] = baseColors[i * 3 + 1] + (FOAM_COLOR.g - baseColors[i * 3 + 1]) * foam;
          colorAttr.array[i * 3 + 2] = baseColors[i * 3 + 2] + (FOAM_COLOR.b - baseColors[i * 3 + 2]) * foam;
        } else {
          colorAttr.array[i * 3] = baseColors[i * 3];
          colorAttr.array[i * 3 + 1] = baseColors[i * 3 + 1];
          colorAttr.array[i * 3 + 2] = baseColors[i * 3 + 2];
        }
      }
      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      waterGeo.computeVertexNormals();
    }

    // A course that climbs or drops (Thunder Falls, Canyon Run, Serpent
    // Falls, Torrent Gauntlet, Moonlit Rapids) can have its start and finish
    // over a hundred units apart in elevation. Anything planted at ground
    // level - a bank column, a tree, a rock spire - needs to reach down far
    // enough to bridge that same range, or a steep drop later in the course
    // leaves it looking like it's floating once the camera can see past/
    // below it to the single flat backdrop ground plane far under the whole
    // level (see ELEV_SKIRT below, and the ground plane further down).
    let minTrackY = Infinity, maxTrackY = -Infinity;
    for (let i = 0; i < n; i++) {
      minTrackY = Math.min(minTrackY, samples[i].pos.y);
      maxTrackY = Math.max(maxTrackY, samples[i].pos.y);
    }
    if (!isFinite(minTrackY)) { minTrackY = 0; maxTrackY = 0; }
    const ELEV_SKIRT = (maxTrackY - minTrackY) + 80;

    // A decoration placed at a fixed offset from its own nearby sample can
    // still end up right on top of - or blocking the view toward - a
    // DIFFERENT stretch of the same track, whenever the course curves back
    // near itself (a hairpin, an S-bend, a shortcut loop). Local offset math
    // alone can't see that; this checks the actual closest distance to any
    // point on the track at all, so the horizon ridge and scattered props
    // below can detect it and back off instead of sitting in the raceway.
    // Stride 4 (not every sample) since this only needs to be roughly right
    // and it runs for every ridge/prop candidate at build time.
    const CLEARANCE_STRIDE = 4;
    function nearestTrackDistSq(px, pz) {
      let best = Infinity;
      for (let j = 0; j < n; j += CLEARANCE_STRIDE) {
        const dx = px - samples[j].pos.x, dz = pz - samples[j].pos.z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      return best;
    }

    // On a closed loop, "outward" from a sample is only actually away from
    // the course on the side facing the loop's outside - the other side
    // faces the loop's own enclosed interior (the water/land the course
    // rings around). The same fixed local offset used for both sides pushes
    // the inward one into that interior, where it can end up standing in
    // full view across the water from much of the course - a "wall" with no
    // relation to the track shape driving it, since the same offset applies
    // no matter how small the enclosed interior is. Ray-casting against the
    // closed track polygon tells the horizon ridge when a point it computed
    // has landed inside it, so it can flatten itself there instead of
    // rearing up in the middle of the course. Meaningless for a point-to-
    // point course (no interior to speak of), so always false there.
    function isInsideTrackLoop(px, pz) {
      if (!LOOP) return false;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = samples[i].pos.x, zi = samples[i].pos.z;
        const xj = samples[j].pos.x, zj = samples[j].pos.z;
        const intersect = ((zi > pz) !== (zj > pz)) &&
          (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    // ---------- Banks (low-poly cliffs along both edges) ----------
    if (VOXEL) {
      const bankColor = new THREE.Color();
      const rockColor = new THREE.Color();
      const voxelMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
      const colStep = 6;
      const colSize = HALF_WIDTH * 0.42;

      [1, -1].forEach((side) => {
        const positionsArr = [], colorsArr = [], indicesArr = [];
        for (let i = 0; i < n; i += colStep) {
          const s = samples[i];
          const pr = perp(s.tangent);
          const localTheme = themeAt(s.t);
          bankColor.set(localTheme.bank);
          rockColor.set(localTheme.rock);
          const outerOffset = side * HALF_WIDTH * (1.15 + hash(i * 3 + (side > 0 ? 5 : 9)) * 0.5);
          const cx = s.pos.x + pr.x * outerOffset;
          const cz = s.pos.z + pr.z * outerOffset;
          const colHeight = 3 + Math.floor(hash(i * 11 + (side > 0 ? 2 : 4)) * 5);
          const shade = 0.82 + hash(i * 17) * 0.36;
          const baseColor = (side > 0 ? bankColor : rockColor).clone().multiplyScalar(shade);
          // Extended well below its visible top with a downward "skirt" -
          // on a steeply descending course (Canyon Run, Serpent Falls) a
          // column sized to just its own colHeight left a growing gap of
          // daylight between it and the backdrop ground plane far below,
          // reading as a chunk of bank floating in mid-air. ELEV_SKIRT scales
          // with the course's own elevation range so it always reaches down
          // far enough regardless of how much the course climbs or drops.
          const top = s.pos.y + colHeight - 1.5;
          appendBox(positionsArr, colorsArr, indicesArr, cx, top - (colHeight + ELEV_SKIRT) / 2, cz, colSize, colHeight + ELEV_SKIRT, colSize, baseColor);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positionsArr), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorsArr), 3));
        geo.setIndex(indicesArr);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, voxelMat);
        group.add(mesh);
      });
    } else {
      // vertexColors so a multi-zone course's banks can shift color along
      // their length (e.g. sand -> canyon rock -> ice -> basalt); a
      // single-theme course just gets a uniform vertex color, same as before.
      const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
      const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
      const sideColor = new THREE.Color();

      [1, -1].forEach((side) => {
        const geo = new THREE.BufferGeometry();
        const bp = new Float32Array(n * 2 * 3);
        const bc = new Float32Array(n * 2 * 3);
        for (let i = 0; i < n; i++) {
          const s = samples[i];
          const pr = perp(s.tangent);
          const innerOffset = side * HALF_WIDTH * 1.02;
          const outerOffset = side * HALF_WIDTH * 1.55;
          const jitter = hash(i * 7 + (side > 0 ? 1 : 2)) * 6;
          const innerX = s.pos.x + pr.x * innerOffset;
          const innerZ = s.pos.z + pr.z * innerOffset;
          const outerX = s.pos.x + pr.x * outerOffset;
          const outerZ = s.pos.z + pr.z * outerOffset;
          bp[i * 6] = innerX; bp[i * 6 + 1] = s.pos.y - 1.5; bp[i * 6 + 2] = innerZ;
          bp[i * 6 + 3] = outerX; bp[i * 6 + 4] = s.pos.y + 6 + jitter; bp[i * 6 + 5] = outerZ;
          const localTheme = themeAt(s.t);
          sideColor.set(side > 0 ? localTheme.bank : localTheme.rock);
          bc[i * 6] = sideColor.r; bc[i * 6 + 1] = sideColor.g; bc[i * 6 + 2] = sideColor.b;
          bc[i * 6 + 3] = sideColor.r; bc[i * 6 + 4] = sideColor.g; bc[i * 6 + 5] = sideColor.b;
        }
        const bIdx = [];
        for (let i = 0; i < segCount; i++) {
          const iNext = (i + 1) % n;
          const in0 = i * 2, out0 = i * 2 + 1, in1 = iNext * 2, out1 = iNext * 2 + 1;
          if (side > 0) {
            bIdx.push(in0, out0, in1, in1, out0, out1);
          } else {
            bIdx.push(in0, in1, out0, out0, in1, out1);
          }
        }
        geo.setAttribute('position', new THREE.BufferAttribute(bp, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
        geo.setIndex(bIdx);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, side > 0 ? bankMat : rockMat);
        group.add(mesh);
      });
    }

    // ---------- Scattered scenery (trees / rocks / ice spires) ----------
    // Clutter along the banks so the immediate surroundings have some
    // texture too, not just the distant ridge above. Picked per-course (and,
    // for World Tour, per-zone) so each biome's clutter roughly matches its
    // look, without needing every level file to carry its own prop config.
    {
      const PROP_STYLES = {
        forest: { kind: 'tree', voxel: false, trunk: 0x5a4030, crown: 0x2f7a3f },
        nightForest: { kind: 'tree', voxel: false, trunk: 0x140f18, crown: 0x1f3a2a },
        voxelForest: { kind: 'tree', voxel: true, trunk: 0x6b4a2a, crown: 0x4a9c3f },
        voxelJungle: { kind: 'tree', voxel: true, trunk: 0x5a3a1a, crown: 0x1f6b3a },
        volcanic: { kind: 'spire', voxel: false, rock: 0x3a1508, accent: 0xb33a1e },
        canyon: { kind: 'spire', voxel: false, rock: 0x6a4a34, accent: 0x8a6a4a },
        ice: { kind: 'spire', voxel: false, rock: 0xc9e6f5, accent: 0x8fa8b8 },
        voxelCanyon: { kind: 'spire', voxel: true, rock: 0x5a4a3a, accent: 0x7a6a58 },
        voxelStorm: { kind: 'spire', voxel: true, rock: 0x33383a, accent: 0x4a4f4a },
        stormRock: { kind: 'spire', voxel: false, rock: 0x2a2f38, accent: 0x4a6a7a },
        caveCrystal: { kind: 'spire', voxel: true, rock: 0x1a2438, accent: 0x4affea },
        ruins: { kind: 'spire', voxel: true, rock: 0x8a8272, accent: 0x5a7a4a },
        desertSpire: { kind: 'spire', voxel: false, rock: 0xc9915a, accent: 0x8a5a34 },
      };
      const LEVEL_PROP_STYLE = {
        'thunder-cove': 'forest', 'volcanic-rapids': 'volcanic', 'arctic-straits': 'ice',
        'voxel-valley': 'voxelForest', 'thunder-falls': 'voxelCanyon', 'canyon-run': 'voxelCanyon',
        'serpent-falls': 'voxelJungle', 'torrent-gauntlet': 'voxelStorm', 'moonlit-rapids': 'nightForest',
        'storm-coast': 'stormRock', 'bioluminescent-cave': 'caveCrystal',
        'ancient-ruins': 'ruins', 'desert-oasis': 'desertSpire',
      };
      function propStyleAt(t) {
        if (levelConfig.id === 'world-tour') {
          if (t < 0.25) return PROP_STYLES.forest;
          if (t < 0.5) return PROP_STYLES.canyon;
          if (t < 0.75) return PROP_STYLES.ice;
          return PROP_STYLES.volcanic;
        }
        // mirrorOf (js/levels.js's mirrorLevel) points back at the original
        // catalog id for a reversed course, which otherwise wouldn't match
        // any entry here (its own id has a '-mirror' suffix) and would
        // silently fall back to the wrong default style.
        const key = LEVEL_PROP_STYLE[levelConfig.mirrorOf || levelConfig.id] || (VOXEL ? 'voxelForest' : 'forest');
        return PROP_STYLES[key];
      }

      const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
      const PROP_STEP = 5;
      const propColor = new THREE.Color();
      [1, -1].forEach((side) => {
        const positionsArr = [], colorsArr = [], indicesArr = [];
        for (let i = 0; i < n; i += PROP_STEP) {
          // Skip most slots so clutter reads as occasional, not a picket fence.
          if (hash(i * 19 + (side > 0 ? 21 : 27)) > 0.4) continue;
          const s = samples[i];
          const pr = perp(s.tangent);
          const style = propStyleAt(s.t);
          const jitter = (hash(i * 23 + side) - 0.5) * HALF_WIDTH * 0.6;
          // Same self-intersection guard as the horizon ridge above: a
          // hairpin or tight S-bend can put this side's "outward" offset
          // closer to a different stretch of track than to this one, which
          // otherwise plants a tree or rock spire right in the raceway (or
          // directly in the camera's view of it). Push further out until
          // clear; if it still can't clear after a few tries, skip this slot
          // rather than force it somewhere that looks wrong.
          const PROP_CLEARANCE = HALF_WIDTH * 1.5;
          let propMult = 1.7 + hash(i * 29 + side) * 1.6;
          let cx, cz, clearOfTrack = false;
          for (let tries = 0; tries < 5; tries++) {
            const outerOffset = side * HALF_WIDTH * propMult;
            cx = s.pos.x + pr.x * outerOffset + pr.x * jitter;
            cz = s.pos.z + pr.z * outerOffset + pr.z * jitter;
            if (nearestTrackDistSq(cx, cz) >= PROP_CLEARANCE * PROP_CLEARANCE) { clearOfTrack = true; break; }
            propMult += 1.4;
          }
          // Same reasoning as the horizon ridge: the "outward" side on a
          // loop can face the course's own enclosed interior rather than
          // truly away from it, planting a tree in the middle of the lake
          // the course rings around. Skip rather than push further out,
          // since pushing "outward" on the inside just drives it deeper
          // into the interior instead of clear of it.
          if (!clearOfTrack || isInsideTrackLoop(cx, cz)) continue;
          const sizeVar = 0.75 + hash(i * 31 + side) * 0.7;
          if (style.kind === 'tree') {
            // Trunk gets the same downward skirt as bank columns (see
            // ELEV_SKIRT above) - its top stays put, only the hidden base
            // extends further down, so it still visibly plants the tree at
            // ground level while reaching down far enough not to float on a
            // course with a lot of elevation change.
            const trunkH = 4 * sizeVar, trunkW = 1.4 * sizeVar;
            const trunkTop = s.pos.y + trunkH - 1;
            propColor.set(style.trunk);
            appendBox(positionsArr, colorsArr, indicesArr, cx, trunkTop - (trunkH + ELEV_SKIRT) / 2, cz, trunkW, trunkH + ELEV_SKIRT, trunkW, propColor);
            propColor.set(style.crown);
            if (style.voxel) {
              const crownSize = 6 * sizeVar;
              appendBox(positionsArr, colorsArr, indicesArr, cx, s.pos.y + trunkH + crownSize / 2 - 1, cz, crownSize, crownSize, crownSize, propColor);
            } else {
              appendPyramid(positionsArr, colorsArr, indicesArr, cx, s.pos.y + trunkH - 1, cz, 7 * sizeVar, 9 * sizeVar, propColor);
            }
          } else {
            propColor.set(hash(i * 37 + side) > 0.7 ? style.accent : style.rock);
            if (style.voxel) {
              const w = 4 * sizeVar, h = 8 * sizeVar;
              const top = s.pos.y + h - 1;
              appendBox(positionsArr, colorsArr, indicesArr, cx, top - (h + ELEV_SKIRT) / 2, cz, w, h + ELEV_SKIRT, w, propColor);
            } else {
              appendPyramid(positionsArr, colorsArr, indicesArr, cx, s.pos.y - 1, cz, 6 * sizeVar, 11 * sizeVar, propColor, ELEV_SKIRT);
            }
          }
        }
        if (positionsArr.length) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positionsArr), 3));
          geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorsArr), 3));
          geo.setIndex(indicesArr);
          geo.computeVertexNormals();
          const propsMesh = new THREE.Mesh(geo, propMat);
          propsMesh.name = 'scatteredProps';
          group.add(propsMesh);
        }
      });
    }

    // Backdrop terrain plane so the world doesn't look empty beyond the banks.
    // Sits well below the lowest point of the course (minTrackY, computed
    // above), not a fixed height, so courses that dip or drop (Thunder
    // Falls, Canyon Run) don't end up with this opaque plane poking through/
    // above the track as it descends.
    const GROUND_SEGS = 48;
    const groundGeo = new THREE.PlaneGeometry(3000, 3000, GROUND_SEGS, GROUND_SEGS);
    groundGeo.rotateX(-Math.PI / 2);
    // Gentle rolling bumps (+ a two-tone patchwork for the non-voxel look)
    // so this backdrop plane reads as terrain glimpsed past the banks and
    // the distant ridge, not a perfectly flat colored disc.
    {
      const gPos = groundGeo.attributes.position;
      const baseColor = new THREE.Color(THEME.ground);
      const altColor = baseColor.clone().multiplyScalar(0.85);
      const gColors = new Float32Array(gPos.count * 3);
      const c = new THREE.Color();
      // Amplitude is deliberately small and capped well under the plane's own
      // clearance below the track (see ground.position.y below) - a flat
      // course (constant minTrackY, e.g. Voxel Valley) leaves only that fixed
      // margin between the two, and an earlier, taller version of this bump
      // could crest high enough at some (x,z) phases to poke this backdrop
      // plane up into the actual playable area, reading as solid ground
      // sitting right at track level instead of terrain far below it.
      for (let i = 0; i < gPos.count; i++) {
        const x = gPos.getX(i), z = gPos.getZ(i);
        const bump = Math.sin(x * 0.006 + 1.7) * 2 + Math.sin(z * 0.007 - 0.4) * 2 +
                     Math.sin((x + z) * 0.003) * 1.5;
        gPos.setY(i, bump);
        const shadeF = Math.max(0, Math.min(1, (Math.sin(x * 0.01) * Math.sin(z * 0.011) + 1) / 2));
        c.copy(baseColor).lerp(altColor, shadeF);
        gColors[i * 3] = c.r; gColors[i * 3 + 1] = c.g; gColors[i * 3 + 2] = c.b;
      }
      groundGeo.setAttribute('color', new THREE.BufferAttribute(gColors, 3));
      groundGeo.computeVertexNormals();
    }
    let groundMat;
    if (VOXEL) {
      const groundColor = new THREE.Color(THEME.ground);
      const tex = buildCheckerTexture(
        groundColor.clone().multiplyScalar(1.08).getHex(),
        groundColor.clone().multiplyScalar(0.9).getHex()
      );
      tex.repeat.set(150, 150);
      groundMat = new THREE.MeshStandardMaterial({ map: tex, flatShading: true });
    } else {
      groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
    }
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = minTrackY - 40;
    group.add(ground);

    // ---------- Checkpoints ----------
    // Looping courses space checkpoints evenly around the loop (index 0 is
    // the start/finish line). Point-to-point courses space them from the
    // start (t=0) to the actual finish line (t=1).
    const checkpoints = [];
    const GATE_RADIUS = HALF_WIDTH - 6;
    // Every checkpoint is a plain round ring now, voxel courses included. A
    // rectangular box-frame gate used to stand in on voxel levels, which
    // caused two real bugs: its round Ring Race halo never matched its
    // square silhouette (fixed previously), and - the one still biting -
    // its center-height offset was tied to GATE_RADIUS itself, making it
    // exactly equal to the ring's own radius at every scale. That meant the
    // vertical distance alone always consumed the *entire* hit-test budget,
    // leaving zero room for lateral position - at any point in the shrink,
    // not just once it got small. A boat riding at normal water height could
    // never actually register as "in" a voxel ring. Switching to the same
    // round-ring geometry non-voxel courses already use, with a small
    // fixed-and-then-scaled height offset (see RING_HEIGHT below), fixes
    // both at once.
    const ringGeo = new THREE.TorusGeometry(GATE_RADIUS, 1.4, 8, 24);
    // Highlight ring for whichever checkpoint is currently the target (Ring
    // Race only) - a glowing outline just outside the real gate, scaled
    // together with it (see setCheckpointRingScale) so it hugs the actual
    // (shrinking) hit-ring tightly instead of being a separate, oddly huge
    // shape once the real ring has shrunk down. One shared mesh/material per
    // checkpoint is fine since at most one is ever visible at a time.
    const haloGeo = new THREE.TorusGeometry(GATE_RADIUS * 1.18, 1.0, 8, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00eaff, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });

    // How high above the water the ring's center sits at full (un-shrunk)
    // size - small and deliberately independent of GATE_RADIUS, and scaled
    // down together with the ring in setCheckpointRingScale, so the vertical
    // demand stays a small, constant *fraction* of whatever the current
    // radius is (about 1/5 for a typical 36-unit gate) instead of growing to
    // swallow the whole thing as the ring shrinks.
    const RING_HEIGHT = 7;

    for (let c = 0; c < CHECKPOINT_COUNT; c++) {
      const idx = LOOP
        ? Math.floor((c / CHECKPOINT_COUNT) * n)
        : Math.round((c / (CHECKPOINT_COUNT - 1)) * (n - 1));
      const s = samples[idx];
      const isStart = c === 0;
      const isFinish = !LOOP && c === CHECKPOINT_COUNT - 1;
      const ringMat = new THREE.MeshStandardMaterial({
        color: isFinish ? 0x6dffb8 : (isStart ? 0xffd23f : 0xff5050),
        emissive: isFinish ? 0x0a3d24 : (isStart ? 0x554400 : 0x550000),
        flatShading: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.position.set(s.pos.x, s.pos.y + RING_HEIGHT, s.pos.z);
      const angle = Math.atan2(s.tangent.x, s.tangent.z);
      mesh.rotation.y = angle;
      group.add(mesh);

      // Copies the gate mesh's own position/rotation rather than
      // recomputing them, so the halo can never drift out of alignment with
      // the actual arch it's supposed to be highlighting.
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.position.copy(mesh.position);
      haloMesh.rotation.y = angle;
      haloMesh.visible = false;
      group.add(haloMesh);

      checkpoints.push({
        t: s.t, pos: s.pos.clone(), tangent: s.tangent.clone(), mesh, passed: false,
        // Ring-race mode shrinks these by scaling the mesh; baseRadius/
        // centerYOffset describe the un-shrunk gate so gating math (and
        // setCheckpointRingScale, which slides the mesh down toward the
        // water as it shrinks) can scale alongside it.
        baseRadius: GATE_RADIUS,
        centerYOffset: RING_HEIGHT,
        ringScale: 1,
        haloMesh,
      });
    }

    // ---------- Boost pads ----------
    // Just two solid glowing pylons marking the lane, like slalom gates - no
    // floor panel, matching how checkpoints are an arch with no filled floor
    // either. (An earlier version added a flat chevron-textured panel between
    // them, but a flat quad sitting on the water read as a stray attached
    // square next to the pylons rather than part of one clean object, so it's
    // gone - the pylons alone already read clearly as "drive through here".)
    const boostPads = [];
    const pylonPostGeo = new THREE.CylinderGeometry(0.35, 0.5, 5, 8);
    const pylonPostMat = new THREE.MeshStandardMaterial({
      color: 0xff8c00, emissive: 0xaa4400, flatShading: true, roughness: 0.6,
    });
    const pylonOrbGeo = new THREE.SphereGeometry(0.9, 10, 8);
    const PYLON_OFFSET = 5.5;

    // Evenly-spaced boost slots can land right next to (or exactly on top of)
    // a checkpoint gate's own t, since both are laid out independently - the
    // pad then reads as clutter stuck to the ring instead of its own thing.
    // Nudge any pad that lands within MIN_GATE_GAP world-units of a gate
    // further down the track until it clears every gate. Capped at a
    // fraction of the average checkpoint spacing (rather than a flat
    // distance) so tight-checkpoint courses still leave a reachable safe
    // zone between neighboring gates instead of the exclusion zones
    // swallowing the whole interval.
    const avgCheckpointSpacing = totalLength / CHECKPOINT_COUNT;
    const MIN_GATE_GAP = Math.min(45, avgCheckpointSpacing * 0.25);
    const minGapT = MIN_GATE_GAP / totalLength;
    function nearestCheckpointGapT(t) {
      let best = Infinity;
      for (const cp of checkpoints) {
        let d = Math.abs(t - cp.t);
        if (LOOP) d = Math.min(d, 1 - d);
        if (d < best) best = d;
      }
      return best;
    }

    for (let b = 0; b < BOOST_COUNT; b++) {
      let t = (b + 0.5) / BOOST_COUNT;
      let guard = 0;
      while (nearestCheckpointGapT(t) < minGapT && guard < 40) {
        t = LOOP ? (t + minGapT) % 1 : Math.min(0.999, t + minGapT);
        guard++;
      }
      const idx = Math.min(n - 1, Math.floor(t * n));
      const s = samples[idx];
      const pr = perp(s.tangent);
      const lateral = (b % 2 === 0 ? 0.4 : -0.4) * HALF_WIDTH;
      const x = s.pos.x + pr.x * lateral;
      const z = s.pos.z + pr.z * lateral;

      // Both of this pad's orbs share one material instance so main.js can
      // dim them together on cooldown (the posts stay a constant color).
      const orbMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95 });
      let firstOrb = null;
      [-1, 1].forEach((side) => {
        const px = x + pr.x * side * PYLON_OFFSET;
        const pz = z + pr.z * side * PYLON_OFFSET;
        const post = new THREE.Mesh(pylonPostGeo, pylonPostMat);
        post.position.set(px, s.pos.y + 2.5, pz);
        group.add(post);
        const orb = new THREE.Mesh(pylonOrbGeo, orbMat);
        orb.position.set(px, s.pos.y + 5.2, pz);
        group.add(orb);
        if (!firstOrb) firstOrb = orb;
      });

      // hitCooldowns is keyed per-boat (see main.js's checkBoostPads) rather
      // than one shared cooldown, so the player and every AI racer each get
      // their own independent refill off the same pad instead of only
      // whichever of them happens to reach it first.
      boostPads.push({ pos: new THREE.Vector3(x, s.pos.y, z), mesh: firstOrb, hitCooldowns: new Map() });
    }

    // ---------- Shortcuts (alternate routes) ----------
    // A shortcut is its own little curve, anchored to wherever it comes
    // closest to the main path at each end, so it reads as a fork that peels
    // off and rejoins rather than a disconnected strip. Its samples carry a
    // "t" interpolated into the span of main-path progress it replaces, so
    // lap/checkpoint progress stays continuous no matter which channel the
    // boat actually drives - checkpoints only ever sit on the main path,
    // outside that span, so which route was taken never has to be tracked.
    // Deliberately simpler than the main path (a static, unanimated water
    // color and boxy rock walls rather than the full wave/bank treatment) -
    // it reads as a narrower, rougher, riskier alternative at a glance,
    // which is exactly the point of taking it.
    const shortcuts = [];
    (levelConfig.shortcuts || []).forEach((scConfig) => {
      const scPts3d = scConfig.controlPoints.map((p) => (
        p.length >= 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], 0, p[1])
      ));

      function nearestMainT(pt) {
        let bestI = 0, bestD = Infinity;
        for (let i = 0; i < n; i++) {
          const d = samples[i].pos.distanceToSquared(pt);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        return samples[bestI].t;
      }
      const fromT = nearestMainT(scPts3d[0]);
      const toT = nearestMainT(scPts3d[scPts3d.length - 1]);

      const scCurve = new THREE.CatmullRomCurve3(scPts3d, false, 'catmullrom', 0.5);
      const scRaw = scCurve.getSpacedPoints(scConfig.sampleCount || 48);
      const scN = scRaw.length;
      const scSamplesArr = [];
      let scCum = 0;
      for (let i = 0; i < scN; i++) {
        const cur = scRaw[i];
        const aIdx = i > 0 ? i - 1 : i;
        const bIdx = i < scN - 1 ? i + 1 : i;
        const tangent = new THREE.Vector3().subVectors(scRaw[bIdx], scRaw[aIdx]).normalize();
        scSamplesArr.push({ pos: cur.clone(), tangent, t: 0 });
        if (i < scN - 1) scCum += cur.distanceTo(scRaw[i + 1]);
      }
      const scTotalLen = scCum || 1;
      let running = 0;
      for (let i = 0; i < scN; i++) {
        const frac = running / scTotalLen;
        scSamplesArr[i].t = fromT + (toT - fromT) * frac;
        if (i < scN - 1) running += scSamplesArr[i].pos.distanceTo(scSamplesArr[i + 1].pos);
      }

      const scHalfWidth = scConfig.halfWidth || HALF_WIDTH * 0.5;

      // Narrow static-color water strip.
      const wPositions = new Float32Array(scN * 2 * 3);
      const wColors = new Float32Array(scN * 2 * 3);
      const scWaterColor = new THREE.Color(THEME.waterDeep).multiplyScalar(0.8);
      for (let i = 0; i < scN; i++) {
        const s = scSamplesArr[i];
        const pr = perp(s.tangent);
        const lx = s.pos.x - pr.x * scHalfWidth, lz = s.pos.z - pr.z * scHalfWidth;
        const rx = s.pos.x + pr.x * scHalfWidth, rz = s.pos.z + pr.z * scHalfWidth;
        wPositions[i * 6] = lx; wPositions[i * 6 + 1] = s.pos.y; wPositions[i * 6 + 2] = lz;
        wPositions[i * 6 + 3] = rx; wPositions[i * 6 + 4] = s.pos.y; wPositions[i * 6 + 5] = rz;
        wColors[i * 6] = scWaterColor.r; wColors[i * 6 + 1] = scWaterColor.g; wColors[i * 6 + 2] = scWaterColor.b;
        wColors[i * 6 + 3] = scWaterColor.r; wColors[i * 6 + 4] = scWaterColor.g; wColors[i * 6 + 5] = scWaterColor.b;
      }
      const wIdx = [];
      for (let i = 0; i < scN - 1; i++) {
        const l0 = i * 2, r0 = i * 2 + 1, l1 = (i + 1) * 2, r1 = (i + 1) * 2 + 1;
        wIdx.push(l0, r0, l1, l1, r0, r1);
      }
      const scWaterGeo = new THREE.BufferGeometry();
      scWaterGeo.setAttribute('position', new THREE.BufferAttribute(wPositions, 3));
      scWaterGeo.setAttribute('color', new THREE.BufferAttribute(wColors, 3));
      scWaterGeo.setIndex(wIdx);
      scWaterGeo.computeVertexNormals();
      const scWaterMat = new THREE.MeshStandardMaterial({
        vertexColors: true, transparent: true, opacity: 0.92, side: THREE.DoubleSide, roughness: 0.4,
      });
      group.add(new THREE.Mesh(scWaterGeo, scWaterMat));

      // Boxy rock walls hugging both edges - tight and hazardous-looking,
      // regardless of whether the level itself is voxel-styled or not.
      const scRockColor = new THREE.Color(THEME.rock);
      const scRockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
      [1, -1].forEach((side) => {
        const positionsArr = [], colorsArr = [], indicesArr = [];
        for (let i = 0; i < scN; i += 2) {
          const s = scSamplesArr[i];
          const pr = perp(s.tangent);
          const offset = side * (scHalfWidth * 1.1 + hash(i * 5 + side * 3) * 1.5);
          const cx = s.pos.x + pr.x * offset, cz = s.pos.z + pr.z * offset;
          const h = 4 + hash(i * 13 + side * 7) * 4;
          const shade = 0.8 + hash(i * 21 + side * 11) * 0.4;
          const rockTop = s.pos.y + h - 1;
          appendBox(positionsArr, colorsArr, indicesArr, cx, rockTop - (h + ELEV_SKIRT) / 2, cz, 3.5, h + ELEV_SKIRT, 3.5, scRockColor.clone().multiplyScalar(shade));
        }
        const scGeo = new THREE.BufferGeometry();
        scGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positionsArr), 3));
        scGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorsArr), 3));
        scGeo.setIndex(indicesArr);
        scGeo.computeVertexNormals();
        group.add(new THREE.Mesh(scGeo, scRockMat));
      });

      shortcuts.push({ samples: scSamplesArr, halfWidth: scHalfWidth, fromT, toT });
    });

    // ---------- Jump ramps ----------
    // A real wedge (flat entry rising to a raised platform) rather than a
    // flat box floating above the water, so the boat visually climbs it
    // instead of clipping through before an invisible launch trigger.
    // Built once per entry in RAMPS_CFG - most courses still have just the
    // one, but a level can supply a `ramps` array for several jumps along
    // the same course (see boat.js's update(), which now checks each one).
    const ramps = RAMPS_CFG.map((rampCfg) => {
      const RAMP_HALF_DEPTH = rampCfg.halfDepth || 13;
      const RAMP_HEIGHT = rampCfg.height || 4.5;
      const RAMP_HALF_WIDTH = rampCfg.halfWidth || HALF_WIDTH * 0.8;

      const rampIdx = Math.min(n - 1, Math.floor(rampCfg.t * n));
      const rampSample = samples[rampIdx];

      const hw = RAMP_HALF_WIDTH, D = RAMP_HALF_DEPTH * 2, H = RAMP_HEIGHT;
      const rampGeo = new THREE.BufferGeometry();
      const rampColor = new THREE.Color(0xd9b26a);

      if (VOXEL) {
        // A rising staircase of blocks - the boat's climb is still a smooth
        // interpolation (see boat.js), so it glides up over the visual steps.
        const N_STEPS = 6;
        const stepDepth = D / N_STEPS;
        const stepHeight = H / N_STEPS;
        const positionsArr = [], colorsArr = [], indicesArr = [];
        for (let i = 0; i < N_STEPS; i++) {
          const stepTopY = (i + 1) * stepHeight;
          const cz = i * stepDepth + stepDepth / 2;
          const shade = 0.88 + (i % 2) * 0.12;
          appendBox(positionsArr, colorsArr, indicesArr, 0, stepTopY / 2, cz, hw * 2, stepTopY, stepDepth, rampColor.clone().multiplyScalar(shade));
        }
        rampGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positionsArr), 3));
        rampGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorsArr), 3));
        rampGeo.setIndex(indicesArr);
      } else {
        const rampPositions = new Float32Array([
          -hw, 0, 0, hw, 0, 0, hw, 0, D, -hw, 0, D, // 0 1 2 3: flat bottom, entry(z=0) to exit(z=D)
          hw, H, D, -hw, H, D,                       // 4 5: raised back edge at the exit
        ]);
        const rampIndices = [
          0, 1, 4, 0, 4, 5, // sloped top surface boats drive up
          3, 2, 4, 3, 4, 5, // vertical back wall at the raised end
          0, 3, 5,          // left side wall
          1, 4, 2,          // right side wall
        ];
        rampGeo.setAttribute('position', new THREE.BufferAttribute(rampPositions, 3));
        rampGeo.setIndex(rampIndices);
      }
      rampGeo.translate(0, 0, -RAMP_HALF_DEPTH);
      rampGeo.computeVertexNormals();

      const rampMat = new THREE.MeshStandardMaterial({
        color: VOXEL ? 0xffffff : 0xd9b26a, vertexColors: VOXEL, flatShading: true, side: THREE.DoubleSide,
      });
      const rampMesh = new THREE.Mesh(rampGeo, rampMat);
      rampMesh.position.set(rampSample.pos.x, rampSample.pos.y - 0.3, rampSample.pos.z);
      const rampAngle = Math.atan2(rampSample.tangent.x, rampSample.tangent.z);
      rampMesh.rotation.y = rampAngle;
      group.add(rampMesh);

      return {
        t: rampCfg.t,
        pos: rampSample.pos.clone(),
        tangent: rampSample.tangent.clone(),
        halfDepth: RAMP_HALF_DEPTH,
        halfWidth: RAMP_HALF_WIDTH,
        height: RAMP_HEIGHT,
      };
    });

    scene.add(group);

    // Scales a checkpoint's ring/gate mesh in place (Ring Race mode shrinks
    // these as the run progresses), and slides it down toward the water by
    // the same factor - centerYOffset is defined at full size, so re-deriving
    // the mesh's height from cp.ringScale here keeps the ring's center
    // exactly where checkRingProgress's hit-test expects it, at every size.
    function setCheckpointRingScale(cp, scale) {
      cp.ringScale = scale;
      cp.mesh.scale.set(scale, scale, scale);
      cp.haloMesh.scale.set(scale, scale, scale);
      const y = cp.pos.y + cp.centerYOffset * scale;
      cp.mesh.position.y = y;
      cp.haloMesh.position.y = y;
    }

    // Shows/hides a checkpoint's target halo (Ring Race's "next ring" cue).
    function setCheckpointHighlight(cp, on) {
      cp.haloMesh.visible = on;
    }

    // Gentle pulse for whichever halo(s) are currently visible, layered on
    // top of (not replacing) its current shrink scale from setCheckpointRingScale.
    function updateHighlights(elapsed) {
      const pulse = 0.45 + Math.sin(elapsed * 4) * 0.25;
      haloMat.opacity = pulse;
      const scalePulse = 1 + Math.sin(elapsed * 4) * 0.06;
      checkpoints.forEach((cp) => {
        if (cp.haloMesh.visible) cp.haloMesh.scale.setScalar(cp.ringScale * scalePulse);
      });
    }

    // ---------- Helpers for physics ----------
    // Also checks any shortcuts and returns whichever channel (main or
    // shortcut) the position is actually nearest to, so a boat driving a
    // shortcut gets that channel's own (narrower) halfWidth and its t
    // continues to track overall progress correctly. `index` always maps
    // back into the main `samples` array by t (even for a shortcut match) so
    // AI pathing - which only ever looks ahead into `samples` - stays valid
    // even if an AI ever strays near one.
    // hintIndex, when given, is the caller's own previous-frame result -
    // searching only a bounded window around it (rather than every sample on
    // the whole lap) is both far cheaper and, more importantly, correct on
    // winding courses: a global nearest-point scan can snap across to a
    // completely different, distant point in track progress just because two
    // lanes of a river happen to pass close to each other in world space.
    // That snap hands back the wrong lane's tangent/lateral for a frame,
    // which can read as an out-of-bounds bank hit out of nowhere in open
    // water - an invisible "bump" with no wall in sight. A window can't
    // jump lanes like that since it stays anchored to where the boat
    // actually was a moment ago.
    const NEAREST_WINDOW = 24;
    function findNearestSample(position, hintIndex) {
      let bestIdx = 0, bestDist = Infinity;
      if (hintIndex == null) {
        for (let i = 0; i < n; i++) {
          const dx = position.x - samples[i].pos.x;
          const dz = position.z - samples[i].pos.z;
          const d = dx * dx + dz * dz;
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
      } else {
        for (let off = -NEAREST_WINDOW; off <= NEAREST_WINDOW; off++) {
          const i = LOOP
            ? (((hintIndex + off) % n) + n) % n
            : Math.max(0, Math.min(n - 1, hintIndex + off));
          const dx = position.x - samples[i].pos.x;
          const dz = position.z - samples[i].pos.z;
          const d = dx * dx + dz * dz;
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
      }

      let shortcutHit = null, scBestJ = 0, scBestDist = bestDist;
      for (const sc of shortcuts) {
        for (let j = 0; j < sc.samples.length; j++) {
          const sp = sc.samples[j];
          const dx = position.x - sp.pos.x;
          const dz = position.z - sp.pos.z;
          const d = dx * dx + dz * dz;
          if (d < scBestDist) { scBestDist = d; scBestJ = j; shortcutHit = sc; }
        }
      }

      if (shortcutHit) {
        const sp = shortcutHit.samples[scBestJ];
        const dx = position.x - sp.pos.x;
        const dz = position.z - sp.pos.z;
        const lateral = sp.tangent.x * dz - sp.tangent.z * dx;
        const mainIndex = Math.min(n - 1, Math.max(0, Math.round(sp.t * n)));
        return {
          index: mainIndex, t: sp.t, tangent: sp.tangent, samplePos: sp.pos,
          lateral, distSqr: scBestDist, halfWidth: shortcutHit.halfWidth,
        };
      }

      const s = samples[bestIdx];
      const dx = position.x - s.pos.x;
      const dz = position.z - s.pos.z;
      const lateral = s.tangent.x * dz - s.tangent.z * dx;
      return { index: bestIdx, t: s.t, tangent: s.tangent, samplePos: s.pos, lateral, distSqr: bestDist, halfWidth: HALF_WIDTH };
    }

    return {
      group,
      theme: THEME,
      themeAt,
      loop: LOOP,
      halfWidth: HALF_WIDTH,
      samples,
      shortcuts,
      totalLength,
      totalLaps: TOTAL_LAPS,
      ramps,
      checkpoints,
      boostPads,
      waveHeight: heightFn,
      updateWater,
      findNearestSample,
      setCheckpointRingScale,
      setCheckpointHighlight,
      updateHighlights,
      startPosition: samples[0].pos.clone(),
      startTangent: samples[0].tangent.clone(),
    };
  }

  // Standard multi-row starting grid, 3 wide (a normal racing-formation
  // layout rather than one wide single-file line or a 4-across block) -
  // index 0 sits on pole right at the start line, higher indices trail
  // further back a row at a time. Shared by both js/ai.js (AI fill the
  // front rows) and js/main.js (the human player always gets the very last
  // slot, i.e. the back of the grid) so everyone lines up consistently.
  const GRID_COLS = 3;
  const GRID_COL_FRACS = [-0.5, 0, 0.5];
  const GRID_ROW_SPACING = 12;

  function computeGridSlot(track, index) {
    const perp = new THREE.Vector3(-track.startTangent.z, 0, track.startTangent.x);
    const halfWidth = track.halfWidth || 42;
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const lateral = GRID_COL_FRACS[col] * halfWidth;
    const behind = row * GRID_ROW_SPACING;
    const position = track.startPosition.clone();
    position.addScaledVector(perp, lateral);
    position.addScaledVector(track.startTangent, -behind);
    return { position, tangent: track.startTangent };
  }

  function disposeTrack(scene, track) {
    if (!track || !track.group) return;
    scene.remove(track.group);
    track.group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  global.HT = global.HT || {};
  global.HT.Track = { build: buildTrack, dispose: disposeTrack, waveHeight, computeGridSlot };
})(window);
