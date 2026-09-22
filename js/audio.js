// Fully procedural sound engine (Web Audio API only, no audio files).
(function (global) {
  const BASE_VOLUME = 0.75;
  const settings = global.HT && global.HT.Settings;
  let volumeSetting = settings ? settings.get('masterVolume') : 0.8;
  let musicVolumeSetting = settings ? settings.get('musicVolume') : 0.6;
  let mutedSetting = settings ? settings.get('muted') : false;
  // Separate slider (see js/menu.js's Options screen) from Master Volume -
  // the engine drone runs continuously for the whole race, unlike one-shot
  // SFX, so it's worth tuning independently of everything else on the
  // master bus.
  let engineVolumeSetting = (settings && settings.get('engineVolume') != null) ? settings.get('engineVolume') : 0.6;

  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let musicBassBus = null;
  let engineOsc = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  let noiseBuffer = null;
  let started = false;

  // Classic waveshaper "distortion curve" (k controls how hard the knee is -
  // higher k pushes the corner harder toward a squared-off, gritty clip).
  // Used only on the music's bass bus (see init()) so the kick/bass voices
  // pick up some analog-amp grit without touching the higher stabs/pads/
  // bells, which stay on the clean bus untouched.
  function makeDistortionCurve(amount) {
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  function makeNoiseBuffer() {
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, rate * 2, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function applyVolume() {
    if (!masterGain) return;
    masterGain.gain.value = mutedSetting ? 0 : volumeSetting * BASE_VOLUME;
  }

  function applyMusicVolume() {
    if (!musicGain) return;
    musicGain.gain.value = mutedSetting ? 0 : musicVolumeSetting;
  }

  function setMasterVolume(v) {
    volumeSetting = Math.max(0, Math.min(1, v));
    init();
    applyVolume();
  }

  function setMusicVolume(v) {
    musicVolumeSetting = Math.max(0, Math.min(1, v));
    init();
    applyMusicVolume();
  }

  // No node to touch immediately - engineVolumeSetting is just read fresh
  // by updateEngine() every frame it's called (during a race), same as
  // speed01/boosting/redlining already are.
  function setEngineVolume(v) {
    engineVolumeSetting = Math.max(0, Math.min(1, v));
  }

  function setMuted(b) {
    mutedSetting = !!b;
    init();
    applyVolume();
    applyMusicVolume();
  }

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    applyVolume();
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    applyMusicVolume();
    musicGain.connect(masterGain);

    // Dirty bass bus: kick/bass voices (see music.js) connect here instead
    // of the plain music bus. A low-shelf boost adds real sub weight, then a
    // waveshaper adds analog-style grit on top of it - both land back on
    // musicGain so the Music Volume/mute settings still cover them, but the
    // snare/hats/stabs/pads/bells on the plain bus stay clean.
    musicBassBus = ctx.createGain();
    const bassShelf = ctx.createBiquadFilter();
    bassShelf.type = 'lowshelf';
    bassShelf.frequency.value = 150;
    bassShelf.gain.value = 9;
    const bassDrive = ctx.createWaveShaper();
    bassDrive.curve = makeDistortionCurve(22);
    bassDrive.oversample = '4x';
    const bassMakeup = ctx.createGain();
    bassMakeup.gain.value = 0.8; // the drive stage raises perceived loudness - trim back a touch
    musicBassBus.connect(bassShelf);
    bassShelf.connect(bassDrive);
    bassDrive.connect(bassMakeup);
    bassMakeup.connect(musicGain);

    noiseBuffer = makeNoiseBuffer();
  }

  function ensureContext() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function start() {
    if (started) return;
    init();
    if (ctx.state === 'suspended') ctx.resume();
    started = true;

    // Engine drone: two detuned sawtooth oscillators through a lowpass filter.
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0001;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;

    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 61.5;

    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    engineOsc.start();
    engineOsc2.start();
  }

  // speed01: 0..1 normalized speed, boosting: bool, redlining: bool (Iron
  // Turtle's overdrive - see boat.js) widens the detune between the two
  // engine oscillators for a rougher beat-frequency growl, opens the filter
  // further for a brighter/harsher tone, and pushes frequency/volume higher
  // still on top of the normal boost bump - the engine audibly being run
  // past where it's supposed to.
  function updateEngine(speed01, boosting, redlining) {
    if (!started) return;
    const now = ctx.currentTime;
    const freq = 55 + speed01 * 160 + (boosting ? 60 : 0) + (redlining ? 90 : 0);
    const detune = redlining ? 1.035 : 1.01;
    engineOsc.frequency.setTargetAtTime(freq, now, 0.05);
    engineOsc2.frequency.setTargetAtTime(freq * detune, now, 0.05);
    engineFilter.frequency.setTargetAtTime(300 + speed01 * 2200 + (redlining ? 900 : 0), now, 0.08);
    // Base constants trimmed down from the original 0.05/0.12/0.06/0.05 -
    // the continuous engine drone was drowning out everything else even
    // before the engineVolumeSetting multiplier below gets a say.
    const vol = (0.03 + speed01 * 0.075 + (boosting ? 0.04 : 0) + (redlining ? 0.035 : 0)) * engineVolumeSetting;
    engineGain.gain.setTargetAtTime(vol, now, 0.05);
  }

  function playBurst({ freqStart, freqEnd, duration, type, gain, filterFreq }) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playNoiseBurst({ duration, gain, filterFreq, filterType }) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType || 'bandpass';
    filt.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(masterGain);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  function boost() {
    playNoiseBurst({ duration: 0.5, gain: 0.5, filterFreq: 2200, filterType: 'highpass' });
    playBurst({ freqStart: 220, freqEnd: 880, duration: 0.4, type: 'sawtooth', gain: 0.15 });
  }

  // Drift King (and Drift Assist) only - fires once the instant a charged
  // powerslide pays out (see boat.js's driftBoostStarted). Shorter and
  // brighter than the fuel-based boost() above, with a tire-screech-ish
  // noise burst up front, so it reads as a distinct "free" bonus rather
  // than the normal boost sound.
  function driftBoost() {
    playNoiseBurst({ duration: 0.25, gain: 0.4, filterFreq: 3200, filterType: 'highpass' });
    playBurst({ freqStart: 500, freqEnd: 1500, duration: 0.3, type: 'square', gain: 0.18 });
  }

  // Phoenix (and Lucky Break) only - the one moment its health hits 0 and
  // it revives instead of exploding (see boat.js's justRevived). A rising
  // sweep distinct from both boost() and explode(), since this is a save,
  // not a hit.
  function phoenixRevive() {
    playNoiseBurst({ duration: 0.4, gain: 0.35, filterFreq: 1800, filterType: 'bandpass' });
    playBurst({ freqStart: 200, freqEnd: 1100, duration: 0.5, type: 'sine', gain: 0.28 });
    setTimeout(() => playBurst({ freqStart: 500, freqEnd: 1400, duration: 0.3, type: 'triangle', gain: 0.2 }), 120);
  }

  function splash() {
    playNoiseBurst({ duration: 0.35, gain: 0.4, filterFreq: 900, filterType: 'lowpass' });
  }

  function checkpoint() {
    playBurst({ freqStart: 660, freqEnd: 990, duration: 0.18, type: 'sine', gain: 0.25 });
  }

  function lap() {
    playBurst({ freqStart: 440, freqEnd: 880, duration: 0.35, type: 'triangle', gain: 0.3 });
    setTimeout(() => playBurst({ freqStart: 660, freqEnd: 1320, duration: 0.35, type: 'triangle', gain: 0.3 }), 150);
  }

  function bump() {
    playNoiseBurst({ duration: 0.15, gain: 0.35, filterFreq: 500, filterType: 'lowpass' });
  }

  // Iron Turtle / Reinforced Hull only - replaces bump() whenever the hit
  // landed on an armored boat (see main.js, which checks boat.justArmored
  // from boat.js's takeDamage). Lower filter cutoff than bump() plus a
  // descending low thump underneath, so a mitigated hit reads as heavy
  // plating soaking up the impact rather than the normal sharp collision.
  function armorClunk() {
    playNoiseBurst({ duration: 0.22, gain: 0.3, filterFreq: 220, filterType: 'lowpass' });
    playBurst({ freqStart: 110, freqEnd: 60, duration: 0.18, type: 'sine', gain: 0.25 });
  }

  // Ragefin / Grit only - a "lub-dub" heartbeat that starts the moment the
  // player's own health drops below the rage gimmick's threshold and speeds
  // up/gets louder the closer health gets to 0 (intensity 0..1), so the
  // "you're in the danger zone but going faster for it" tradeoff has an
  // audible pulse behind it rather than only showing on the health bar.
  // Self-scheduling off ctx.currentTime (like a one-shot burst repeated on
  // a timer) rather than a persistent oscillator graph like the engine
  // drone - a heartbeat is a discrete repeating thump, not something that
  // needs continuous pitch/volume glide between calls.
  let heartbeatNextTime = 0;
  function updateHeartbeat(active, intensity) {
    if (!started || !ctx) return;
    if (!active) { heartbeatNextTime = 0; return; }
    const now = ctx.currentTime;
    if (now < heartbeatNextTime) return;
    const gain = 0.16 + intensity * 0.22;
    playBurst({ freqStart: 90, freqEnd: 55, duration: 0.12, type: 'sine', gain });
    setTimeout(() => {
      if (ctx) playBurst({ freqStart: 70, freqEnd: 40, duration: 0.14, type: 'sine', gain: gain * 0.8 });
    }, 130);
    const interval = 0.9 - intensity * 0.5; // 0.9s between beats down to 0.4s as intensity -> 1
    heartbeatNextTime = now + interval;
  }

  function explode() {
    playNoiseBurst({ duration: 0.6, gain: 0.55, filterFreq: 700, filterType: 'lowpass' });
    playBurst({ freqStart: 180, freqEnd: 35, duration: 0.5, type: 'sawtooth', gain: 0.35 });
  }

  function countdownBeep() {
    playBurst({ freqStart: 520, freqEnd: 520, duration: 0.12, type: 'sine', gain: 0.28 });
  }

  function raceStart() {
    playBurst({ freqStart: 300, freqEnd: 1000, duration: 0.4, type: 'sawtooth', gain: 0.32 });
  }

  function uiClick() {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    playBurst({ freqStart: 520, freqEnd: 340, duration: 0.08, type: 'triangle', gain: 0.12 });
  }

  global.HT = global.HT || {};
  global.HT.Audio = {
    start, updateEngine, boost, splash, checkpoint, lap, bump, explode, uiClick,
    countdownBeep, raceStart, driftBoost, phoenixRevive, armorClunk, updateHeartbeat,
    setMasterVolume, setMuted, setMusicVolume, setEngineVolume,
    ensureContext, getContext: () => ctx, getMusicBus: () => musicGain, getMusicBassBus: () => musicBassBus,
  };
})(window);
