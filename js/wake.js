// A trailing V-shaped wake ribbon behind the boat, built from a short history
// of past hull positions. Lives in world space (not parented to the boat)
// since older points must stay put while the boat moves/turns away from them.
(function (global) {
  const MAX_POINTS = 26;
  const MIN_SPACING = 1.1;
  const MAX_WIDTH = 3.2;
  const FOAM_COLOR = new THREE.Color(0xffffff);
  const FADE_COLOR = new THREE.Color(0x9fd8e0);

  function build() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_POINTS * 2 * 3);
    const colors = new Float32Array(MAX_POINTS * 2 * 3);
    const indices = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(indices);
    geo.setDrawRange(0, 0);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;

    return { mesh, geo, points: [] };
  }

  // sternPos: world-space Vector3 at the boat's stern; forward: unit Vector3.
  function update(trail, dt, sternPos, forward, speedRatio, airborne) {
    const points = trail.points;

    if (!airborne && speedRatio > 0.04) {
      const last = points[0];
      if (!last || last.pos.distanceTo(sternPos) > MIN_SPACING) {
        const perp = new THREE.Vector3(forward.z, 0, -forward.x);
        points.unshift({ pos: sternPos.clone(), perp, speedRatio });
        if (points.length > MAX_POINTS) points.length = MAX_POINTS;
      }
    } else if (points.length) {
      points.pop();
    }

    const posAttr = trail.geo.attributes.position;
    const colorAttr = trail.geo.attributes.color;
    const count = points.length;

    for (let i = 0; i < count; i++) {
      const p = points[i];
      const age = i / Math.max(1, MAX_POINTS - 1);
      const width = MAX_WIDTH * age * (0.5 + 0.5 * p.speedRatio);
      const li = i * 2, ri = i * 2 + 1;

      posAttr.array[li * 3] = p.pos.x + p.perp.x * width * 0.5;
      posAttr.array[li * 3 + 1] = p.pos.y + 0.05;
      posAttr.array[li * 3 + 2] = p.pos.z + p.perp.z * width * 0.5;

      posAttr.array[ri * 3] = p.pos.x - p.perp.x * width * 0.5;
      posAttr.array[ri * 3 + 1] = p.pos.y + 0.05;
      posAttr.array[ri * 3 + 2] = p.pos.z - p.perp.z * width * 0.5;

      const c = FOAM_COLOR.clone().lerp(FADE_COLOR, age);
      colorAttr.array[li * 3] = c.r; colorAttr.array[li * 3 + 1] = c.g; colorAttr.array[li * 3 + 2] = c.b;
      colorAttr.array[ri * 3] = c.r; colorAttr.array[ri * 3 + 1] = c.g; colorAttr.array[ri * 3 + 2] = c.b;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    trail.geo.setDrawRange(0, Math.max(0, count - 1) * 6);
  }

  function dispose(trail) {
    trail.geo.dispose();
    trail.mesh.material.dispose();
  }

  global.HT = global.HT || {};
  global.HT.WakeTrail = { build, update, dispose };
})(window);
