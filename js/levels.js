// Level catalog. Each course's own data lives in its own file under
// js/levels/ (loaded before this file - see index.html), and registers
// itself into HT.LevelDefs. This file just turns that list into the catalog
// (lookup + level-select preview drawing) that track.js and main.js use.
// To add a future course: drop a new js/levels/<id>.js file following the
// existing ones as a template, and add its <script> tag in index.html.
(function (global) {

  const LEVELS = global.HT && global.HT.LevelDefs ? global.HT.LevelDefs : [];

  function getById(id) {
    return LEVELS.find((l) => l.id === id) || null;
  }

  // Whether mirrorLevel() below can sensibly reverse this course. Two
  // exclusions, both load-bearing:
  //  - Point-to-point courses (loop: false) model a real one-way elevation
  //    drop - a waterfall/rapids descent (Canyon Run, Serpent Falls, ...).
  //    Reversing one means driving it backward *uphill*, which the physics
  //    never has to handle today and would just look/feel broken.
  //  - themeZones courses (currently only World Tour) pick their scattered-
  //    prop biome per-t via a hardcoded threshold check in js/track.js's
  //    propStyleAt (keyed off levelConfig.id === 'world-tour', not off the
  //    zone list itself) that assumes the original forward direction -
  //    reversing the course would desync the ground color from the props
  //    scattered on it.
  // Loops with no themeZones (most of the roster) have neither problem:
  // a closed loop returns to the same start/finish line either direction,
  // and their single fixed theme applies everywhere regardless of t.
  function canMirror(level) {
    return level.loop !== false && !level.themeZones;
  }

  // Reverses a loop course's direction while keeping the exact same start/
  // finish line - see canMirror() above for why this is loop-only. Catmull-
  // Rom control points are reversible: the same points in reverse order
  // (first point kept fixed, so the loop still closes at the same spot)
  // trace the identical physical curve backward. That makes arc-length
  // parameterization exactly invert too - newT(P) = 1 - oldT(P) for any
  // point P on the curve - which is what lets a ramp's author-chosen t just
  // flip with `1 - t` below rather than needing to be re-anchored to
  // physical terrain. Checkpoints and boost pads need no such fix: both are
  // laid out by even index/count in js/track.js, not an author-chosen t, so
  // they land correctly on a reversed curve automatically.
  //
  // mirrorOf on the result lets js/track.js's per-level prop-style lookup
  // (keyed by the original catalog id) still find the right style for a
  // course that no longer IS that id - see LEVEL_PROP_STYLE there.
  function mirrorLevel(level) {
    const pts = level.controlPoints;
    const mirrored = Object.assign({}, level, {
      id: level.id + '-mirror',
      name: level.name + ' (Mirror)',
      description: 'Raced in reverse. ' + level.description,
      controlPoints: [pts[0]].concat(pts.slice(1).slice().reverse()),
      mirrorOf: level.id,
    });
    if (level.ramps) {
      mirrored.ramps = level.ramps.map((r) => Object.assign({}, r, { t: 1 - r.t }));
    } else if (level.rampT != null) {
      mirrored.rampT = 1 - level.rampT;
    }
    // None of today's mirror-eligible (loop, no themeZones) courses have
    // shortcuts, but handled correctly on the off chance a future one does:
    // a shortcut's own control points need reversing too, or its fromT/toT
    // (js/track.js, computed by nearest-point-on-the-new-curve) come out
    // fromT > toT - main-path progress would tick backward while a boat is
    // actually on the shortcut.
    if (level.shortcuts) {
      mirrored.shortcuts = level.shortcuts.map((sc) => Object.assign({}, sc, {
        controlPoints: sc.controlPoints.slice().reverse(),
      }));
    }
    return mirrored;
  }

  // Draws a small top-down loop preview into a canvas for the level-select card.
  function drawPreview(canvas, level) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (level.locked || !level.controlPoints) {
      ctx.strokeStyle = 'rgba(234,246,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(234,246,255,0.35)';
      ctx.font = `${Math.floor(h * 0.4)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', w / 2, h / 2 + 2);
      return;
    }

    // Points are [x,z] or [x,y,z] (elevation-aware) - the last element is
    // always z, the first is always x.
    const pts = level.controlPoints;
    const px = (p) => p[0];
    const pz = (p) => p[p.length - 1];
    const shortcuts = level.shortcuts || [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pts.forEach((p) => {
      minX = Math.min(minX, px(p)); maxX = Math.max(maxX, px(p));
      minZ = Math.min(minZ, pz(p)); maxZ = Math.max(maxZ, pz(p));
    });
    shortcuts.forEach((sc) => sc.controlPoints.forEach((p) => {
      minX = Math.min(minX, px(p)); maxX = Math.max(maxX, px(p));
      minZ = Math.min(minZ, pz(p)); maxZ = Math.max(maxZ, pz(p));
    }));
    const pad = 14;
    const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
    const toXY = (p) => [
      pad + (px(p) - minX) * scale,
      pad + (pz(p) - minZ) * scale,
    ];

    const isLoop = level.loop !== false;
    ctx.strokeStyle = (level.theme && level.theme.previewColor) || '#6dffb8';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = toXY(p);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    if (isLoop) ctx.closePath();
    ctx.stroke();

    if (shortcuts.length) {
      ctx.strokeStyle = 'rgba(255,140,0,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      shortcuts.forEach((sc) => {
        ctx.beginPath();
        sc.controlPoints.forEach((p, i) => {
          const [x, y] = toXY(p);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    const [sx, sy] = toXY(pts[0]);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    if (!isLoop) {
      const [ex, ey] = toXY(pts[pts.length - 1]);
      ctx.fillStyle = '#6dffb8';
      ctx.beginPath();
      ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  global.HT = global.HT || {};
  global.HT.Levels = { list: LEVELS, getById, drawPreview, canMirror, mirrorLevel };
})(window);
