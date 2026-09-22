// DOM HUD (per player - speed, boost meter, lap/timer, checkpoint flash) and
// a single shared canvas minimap plotting every human + AI racer. Split into
// two classes (PlayerHud/Minimap) so 1-4 human players in local co-op each
// get their own compact HUD scoped to their split-screen viewport, while the
// minimap - a static top-down track view that was never player-relative to
// begin with - stays one shared element instead of four duplicates eating
// into already-small quadrants.
(function (global) {

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }

  // Analog gauge sweep: -120deg (empty/zero) to +120deg (full/max), passing
  // through straight up (0deg) at the midpoint - a standard automotive dial
  // range, matched by the tick marks drawn in index.html.
  const GAUGE_MIN_ANGLE = -120;
  const GAUGE_MAX_ANGLE = 120;
  // Fixed rather than derived from the current boat's own top speed, same
  // as a real speedometer's scale doesn't change with the trim level - a
  // boosting boat can get close to full sweep, a non-boosting one sits
  // comfortably in the upper-middle.
  const GAUGE_MAX_SPEED_MPH = 190;

  // Cheap enough to update unconditionally even while hidden, so the single
  // shared cockpit dashboard (solo play only - see main.js) never needs to
  // coordinate its own update timing with whether it's currently shown.
  function updateCockpitGauges(speedMph, boostRatio) {
    const speedNeedle = document.getElementById('cockpit-speed-needle');
    const speedValue = document.getElementById('cockpit-speed-value');
    const boostNeedle = document.getElementById('cockpit-boost-needle');
    if (!speedNeedle) return;
    const speedFrac = Math.max(0, Math.min(1, speedMph / GAUGE_MAX_SPEED_MPH));
    const speedAngle = GAUGE_MIN_ANGLE + speedFrac * (GAUGE_MAX_ANGLE - GAUGE_MIN_ANGLE);
    speedNeedle.setAttribute('transform', `rotate(${speedAngle} 60 60)`);
    speedValue.textContent = Math.round(Math.max(0, speedMph));
    const boostFrac = Math.max(0, Math.min(1, boostRatio));
    const boostAngle = GAUGE_MIN_ANGLE + boostFrac * (GAUGE_MAX_ANGLE - GAUGE_MIN_ANGLE);
    boostNeedle.setAttribute('transform', `rotate(${boostAngle} 50 50)`);
  }

  // One clone of #player-hud-template per active player, absolutely
  // positioned (see setRect) over that player's own split-screen viewport.
  // With a single player, setRect covers the full window - pixel-identical
  // to the old single-#hud layout this replaces.
  function PlayerHud() {
    const tpl = document.getElementById('player-hud-template');
    this.root = tpl.content.firstElementChild.cloneNode(true);
    document.getElementById('hud').appendChild(this.root);

    this.labelEl = this.root.querySelector('.player-label');
    this.lapEl = this.root.querySelector('.lap-counter');
    this.placeEl = this.root.querySelector('.place-indicator');
    this.timerEl = this.root.querySelector('.timer');
    this.boostFill = this.root.querySelector('.boost-fill');
    this.healthFill = this.root.querySelector('.health-fill');
    this.speedEl = this.root.querySelector('.speed-value');
    this.flashEl = this.root.querySelector('.checkpoint-flash');
    this.overheatWarningEl = this.root.querySelector('.overheat-warning');
    this.countdownEl = this.root.querySelector('.countdown-overlay');
    this.finishedOverlayEl = this.root.querySelector('.player-finished-overlay');
    this._lastCountdownText = null;
    this.track = null;
  }

  PlayerHud.prototype.setRect = function (rect) {
    this.root.style.left = rect.left + 'px';
    this.root.style.top = rect.top + 'px';
    this.root.style.width = rect.width + 'px';
    this.root.style.height = rect.height + 'px';
  };

  // Empty string hides the label entirely (see CSS's :empty rule) - used in
  // solo play, where tagging your own HUD "PLAYER 1" is just clutter.
  PlayerHud.prototype.setLabel = function (text, colorHex) {
    this.labelEl.textContent = text || '';
    if (colorHex != null) this.labelEl.style.color = '#' + colorHex.toString(16).padStart(6, '0');
  };

  PlayerHud.prototype.setFinished = function (finished) {
    this.finishedOverlayEl.classList.toggle('hidden', !finished);
  };

  PlayerHud.prototype.setTrack = function (track) {
    this.track = track;
  };

  PlayerHud.prototype.update = function (state) {
    if (!this.track) return;
    this.lapEl.textContent = this.track.loop
      ? `LAP ${Math.min(state.lap, this.track.totalLaps)} / ${this.track.totalLaps}`
      : 'FINAL SPRINT';
    this.timerEl.textContent = formatTime(state.elapsed);
    this.placeEl.classList.toggle('hidden', !state.place);
    if (state.place) this.placeEl.textContent = state.place;
    const pct = Math.max(0, Math.min(100, state.boostRatio * 100));
    this.boostFill.style.width = pct + '%';
    this.boostFill.classList.toggle('boosting', state.boosting);
    this.boostFill.classList.toggle('overheated', state.overheated);
    this.speedEl.textContent = Math.round(Math.max(0, state.speedMph));

    const dangerThreshold = (global.HT.Settings && global.HT.Settings.get('healthDangerThreshold'));
    const dangerAt = dangerThreshold != null ? dangerThreshold : 0.25;
    const isDanger = state.healthRatio < dangerAt;

    const healthPct = Math.max(0, Math.min(100, state.healthRatio * 100));
    this.healthFill.style.width = healthPct + '%';
    this.healthFill.classList.toggle('low', isDanger);

    // Persistent banner, only while actively overheating (health draining
    // from boosting past an empty tank - see boat.js) - escalates from a
    // "warning" to a "danger" look once health also crosses the same
    // configurable threshold used for the health bar's own low-health pulse.
    if (state.overheated) {
      this.overheatWarningEl.textContent = isDanger ? 'DANGER: HULL FAILING' : 'WARNING: ENGINE OVERHEATING';
      this.overheatWarningEl.classList.add('show');
      this.overheatWarningEl.classList.toggle('danger', isDanger);
      this.overheatWarningEl.classList.toggle('warning', !isDanger);
    } else {
      this.overheatWarningEl.classList.remove('show', 'warning', 'danger');
    }

    // Big centered countdown - shared between the pre-race "3, 2, 1" hold and
    // a post-explosion respawn freeze (see main.js), both of which just need
    // a large number the player can't miss. Only re-triggers the pop
    // animation when the text actually changes, so it doesn't restart every
    // single frame while showing the same number.
    const countdownText = state.countdownText || null;
    if (countdownText !== this._lastCountdownText) {
      this._lastCountdownText = countdownText;
      if (countdownText) {
        this.countdownEl.textContent = countdownText;
        this.countdownEl.classList.toggle('small', countdownText.length > 2);
        this.countdownEl.classList.remove('pop');
        void this.countdownEl.offsetWidth;
        this.countdownEl.classList.add('pop');
        this.countdownEl.classList.remove('hidden');
      } else {
        this.countdownEl.classList.add('hidden');
      }
    }
  };

  PlayerHud.prototype.flashCheckpoint = function (text) {
    this.flashEl.textContent = text;
    this.flashEl.classList.remove('show');
    // Force reflow to restart animation.
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('show');
  };

  PlayerHud.prototype.dispose = function () {
    this.root.remove();
  };

  // ---- Shared minimap: one instance regardless of player count ----
  function Minimap() {
    this.minimapCanvas = document.getElementById('minimap');
    this.ctx = this.minimapCanvas.getContext('2d');
    this.track = null;
    this._mapTransform = null;
    this._mapPoints = null;
    this._shortcutMapPoints = null;
  }

  Minimap.prototype.setTrack = function (track) {
    this.track = track;
    this._prepareMinimap();
  };

  Minimap.prototype._prepareMinimap = function () {
    const pts = this.track.samples.map((s) => s.pos);
    const shortcuts = this.track.shortcuts || [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    });
    shortcuts.forEach((sc) => sc.samples.forEach((s) => {
      minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z);
    }));
    const pad = 40;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const w = this.minimapCanvas.width, h = this.minimapCanvas.height;
    const scale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
    this._mapTransform = { minX, minZ, scale, w, h };
    this._mapPoints = pts.map((p) => this._toMap(p.x, p.z));
    this._shortcutMapPoints = shortcuts.map((sc) => sc.samples.map((s) => this._toMap(s.pos.x, s.pos.z)));
  };

  Minimap.prototype._toMap = function (x, z) {
    const t = this._mapTransform;
    return [
      (x - t.minX) * t.scale,
      (z - t.minZ) * t.scale,
    ];
  };

  // state: { humans: [{x, z, color}], ai: [{x, z, color}] }
  Minimap.prototype.update = function (state) {
    if (!this.track) return;
    const ctx = this.ctx;
    const { w, h } = this._mapTransform;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(234,246,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    this._mapPoints.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    });
    if (this.track.loop) ctx.closePath();
    ctx.stroke();

    if (this._shortcutMapPoints && this._shortcutMapPoints.length) {
      ctx.strokeStyle = 'rgba(255,140,0,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      this._shortcutMapPoints.forEach((scPts) => {
        ctx.beginPath();
        scPts.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    if (!this.track.loop) {
      const endMap = this._mapPoints[this._mapPoints.length - 1];
      ctx.fillStyle = '#6dffb8';
      ctx.beginPath();
      ctx.arc(endMap[0], endMap[1], 4, 0, Math.PI * 2);
      ctx.fill();
    }

    (state.ai || []).forEach((p) => {
      ctx.fillStyle = p.color != null ? '#' + p.color.toString(16).padStart(6, '0') : '#ff5050';
      const m = this._toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(m[0], m[1], 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Humans drawn last (on top) with a slightly larger dot, so they're easy
    // to pick out from the AI field at a glance even when colors are close.
    (state.humans || []).forEach((p) => {
      ctx.fillStyle = p.color != null ? '#' + p.color.toString(16).padStart(6, '0') : '#ffd23f';
      const m = this._toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(m[0], m[1], 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  global.HT = global.HT || {};
  global.HT.PlayerHud = PlayerHud;
  global.HT.Minimap = Minimap;
  global.HT.updateCockpitGauges = updateCockpitGauges;
})(window);
