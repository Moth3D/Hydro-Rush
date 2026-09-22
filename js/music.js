// Original, fully procedural soundtrack (Web Audio synthesis only - no audio
// files). A small lookahead step-sequencer drives synthesized drums/bass/
// brass-stab/pad voices into the shared music bus from audio.js.
(function (global) {
  const LOOKAHEAD = 0.1;   // seconds scheduled ahead of "now"
  const TICK_MS = 25;      // scheduler poll interval

  function ctx() { return HT.Audio.getContext(); }
  function bus() { return HT.Audio.getMusicBus(); }
  // Kick and bass connect here instead of bus() - a low-shelf boost plus a
  // touch of waveshaper drive (see audio.js) gives them real sub weight and
  // some analog grit, while snare/hats/stabs/pads/bells stay on the plain
  // bus and keep their existing clean tone.
  function bassBus() { return HT.Audio.getMusicBassBus(); }

  // ---- shared noise buffer for percussion ----
  let noiseBuffer = null;
  function getNoiseBuffer() {
    const c = ctx();
    if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
      noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  // ---- synth voices (all take an explicit scheduled start time) ----
  function kick(time, punch) {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.16);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime((punch || 0.9), time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
    osc.connect(gain); gain.connect(bassBus());
    osc.start(time); osc.stop(time + 0.26);
  }

  function snare(time, gainAmt) {
    const c = ctx();
    const src = c.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filt = c.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 1400;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainAmt || 0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    src.connect(filt); filt.connect(gain); gain.connect(bus());
    src.start(time); src.stop(time + 0.16);
  }

  function hat(time, open) {
    const c = ctx();
    const src = c.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filt = c.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7000;
    const gain = c.createGain();
    const dur = open ? 0.14 : 0.045;
    gain.gain.setValueAtTime(open ? 0.18 : 0.13, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filt); filt.connect(gain); gain.connect(bus());
    src.start(time); src.stop(time + dur + 0.01);
  }

  function pluckBass(time, freq, dur, waveType) {
    const c = ctx();
    const osc = c.createOscillator();
    osc.type = waveType || 'sawtooth';
    osc.frequency.value = freq;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, time);
    filt.frequency.exponentialRampToValueAtTime(180, time + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.32, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(filt); filt.connect(gain); gain.connect(bassBus());
    osc.start(time); osc.stop(time + dur + 0.02);

    // Sub layer, one octave down - a plain sine (no filter needed, it's
    // already just a fundamental) that gives the pluck actual low-end
    // weight underneath the sawtooth's growl, rather than just relying on
    // the bass bus's EQ to imply bass that isn't really in the signal.
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const subGain = c.createGain();
    subGain.gain.setValueAtTime(0.001, time);
    subGain.gain.linearRampToValueAtTime(0.26, time + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    sub.connect(subGain); subGain.connect(bassBus());
    sub.start(time); sub.stop(time + dur + 0.02);
  }

  // Dubstep "wub" bass: a resonant lowpass filter with its cutoff driven by
  // its own LFO oscillator, so the tone opens and closes rhythmically for as
  // long as the note holds - the wobble - instead of the short pluck-and-
  // decay of pluckBass. wobbleHz sets how fast it wobbles (already converted
  // from a musical division to Hz by the caller, so it locks to the track's
  // own tempo). A sub sine underneath keeps real weight in the note even
  // while the filter is choked down low.
  function wobbleBass(time, freq, dur, wobbleHz, waveType, q, depth) {
    const c = ctx();
    const osc = c.createOscillator();
    osc.type = waveType || 'sawtooth';
    osc.frequency.value = freq;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 500;
    filt.Q.value = q != null ? q : 9;
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = wobbleHz;
    const lfoGain = c.createGain();
    lfoGain.gain.value = depth != null ? depth : 420;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 0.03);
    gain.gain.setValueAtTime(0.3, time + Math.max(0.03, dur - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filt); filt.connect(gain); gain.connect(bassBus());
    osc.start(time); osc.stop(time + dur + 0.05);
    lfo.start(time); lfo.stop(time + dur + 0.05);

    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const subGain = c.createGain();
    subGain.gain.setValueAtTime(0.0001, time);
    subGain.gain.linearRampToValueAtTime(0.24, time + 0.03);
    subGain.gain.setValueAtTime(0.24, time + Math.max(0.03, dur - 0.08));
    subGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    sub.connect(subGain); subGain.connect(bassBus());
    sub.start(time); sub.stop(time + dur + 0.05);
  }

  // Layered noise hits (a few ms apart) read as a "clap" rather than a flat
  // snare - the half-time backbeat hit dubstep leans on hard.
  function clap(time) {
    const c = ctx();
    [0, 0.012, 0.024].forEach((offset, idx) => {
      const src = c.createBufferSource();
      src.buffer = getNoiseBuffer();
      const filt = c.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 1500;
      filt.Q.value = 1.2;
      const gain = c.createGain();
      const g = idx === 2 ? 0.4 : 0.26;
      gain.gain.setValueAtTime(g, time + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.09);
      src.connect(filt); filt.connect(gain); gain.connect(bus());
      src.start(time + offset); src.stop(time + offset + 0.11);
    });
  }

  // Filtered noise sweep rising in pitch over `dur` - the tension-building
  // riser into the loop restart (the closest a looping background track can
  // get to a dubstep "drop").
  function riser(time, dur) {
    const c = ctx();
    const src = c.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = true;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.value = 5;
    filt.frequency.setValueAtTime(250, time);
    filt.frequency.exponentialRampToValueAtTime(6500, time + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.24, time + dur * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.06);
    src.connect(filt); filt.connect(gain); gain.connect(bus());
    src.start(time); src.stop(time + dur + 0.08);
  }

  // Brass-like stab: two detuned oscillators through a bandpass filter with a
  // fast attack / short decay envelope - the "epic hit" sound.
  function stab(time, freqs, dur, gainAmt) {
    const c = ctx();
    freqs.forEach((freq) => {
      const osc1 = c.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = freq;
      const osc2 = c.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = freq;
      osc2.detune.value = 8;
      const filt = c.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = freq * 2.2;
      filt.Q.value = 0.7;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(gainAmt || 0.22, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc1.connect(filt); osc2.connect(filt); filt.connect(gain); gain.connect(bus());
      osc1.start(time); osc1.stop(time + dur + 0.05);
      osc2.start(time); osc2.stop(time + dur + 0.05);
    });
  }

  // Slow-attack sustained pad chord for ambient/menu sections.
  function pad(time, freqs, dur) {
    const c = ctx();
    freqs.forEach((freq) => {
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1400;
      const gain = c.createGain();
      const attack = Math.min(0.8, dur * 0.3);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.14, time + attack);
      gain.gain.setValueAtTime(0.14, time + dur - attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(filt); filt.connect(gain); gain.connect(bus());
      osc.start(time); osc.stop(time + dur + 0.05);
    });
  }

  // Sparse melodic accent (bell-like) for the ambient menu theme.
  function bell(time, freq, dur) {
    const c = ctx();
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.01;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.16, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const gain2 = c.createGain();
    gain2.gain.setValueAtTime(0.0001, time);
    gain2.gain.linearRampToValueAtTime(0.04, time + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.6);
    osc.connect(gain); gain.connect(bus());
    osc2.connect(gain2); gain2.connect(bus());
    osc.start(time); osc.stop(time + dur + 0.05);
    osc2.start(time); osc2.stop(time + dur + 0.05);
  }

  // ---- note frequencies (equal temperament) ----
  const N = {
    E2: 82.41, D2: 73.42, F2: 87.31, G2: 98.00, A2: 110.00, Bb2: 116.54, C3: 130.81,
    D3: 146.83, E3: 164.81, F3: 174.61, Fs3: 185.00, G3: 196.00,
    A3: 220.00, Bb3: 233.08, B3: 246.94, C4: 261.63, D4: 293.66,
    E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
    B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
    F5: 698.46, G5: 783.99, A5: 880.00, C6: 1046.50,
  };

  // Original chord progressions - generic, uncopyrightable harmonic
  // skeletons (i-VI-III-VII / I-V-vi-IV / i-VII-VI-VII) used as the backbone
  // for each theme; all rhythms, melodies and voicings on top are bespoke.
  const CHORDS = {
    Am: [N.A3, N.C4, N.E4],
    F: [N.F3, N.A3, N.C4],
    C: [N.C4, N.E4, N.G4],
    G: [N.G3, N.B3, N.D4],
    Dm: [N.D3, N.F3, N.A3],
    Bb: [N.Bb3, N.D4, N.F4],
    Cmaj: [N.C4, N.E4, N.G4],
    Gmaj: [N.G4, N.B4, N.D5],
    Amin7: [N.A4, N.C5, N.E5],
    Fmaj: [N.F4, N.A4, N.C5],
    Em: [N.E3, N.G3, N.B3],
    D: [N.D3, N.Fs3, N.A3],
    Gm: [N.G3, N.Bb3, N.D4],
  };
  const ROOTS = {
    Am: N.A2, F: N.F2, C: N.C3, G: N.G2,
    Dm: N.D2, Bb: N.Bb2,
    Cmaj: N.C3, Gmaj: N.G3, Amin7: N.A3, Fmaj: N.F3,
    Em: N.E2, D: N.D2, Gm: N.G2,
  };

  function emptyBar() {
    return { kick: new Array(16).fill(0), snare: new Array(16).fill(0), hat: new Array(16).fill(0) };
  }

  // A step marking the start of a bar's tension-builder into the loop
  // restart - the closest a seamlessly-looping background track can get to
  // a dubstep "drop": a riser plus a snare roll over the last two beats,
  // landing back on the wobble/kick hit at step 0 of bar 0.
  const RISER_STEP = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  const ROLL_INTO_DROP = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];

  // ---------- Race theme 1 "Thunder Run": dark, half-time wobble ----------
  function buildThunderRunTrack() {
    const order = ['Am', 'F', 'C', 'G'];
    const bars = order.map((name, i) => {
      const bar = emptyBar();
      bar.chord = CHORDS[name];
      bar.bassNote = ROOTS[name];
      // Half-time: kick on 1 with a syncopated pickup, clap on the 3 (not
      // 2-and-4) - the backbone of a dubstep groove - under one long wobble
      // note sustained through almost the whole bar instead of a running
      // bassline, so the filter has room to actually wobble.
      bar.kick = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
      bar.hat = [1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1];
      bar.hatOpen = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1];
      bar.wobble = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bar.wobbleDiv = 3;
      bar.clap = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      const isLast = i === order.length - 1;
      bar.stab = isLast
        ? [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1]
        : [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      if (isLast) { bar.snare = ROLL_INTO_DROP; bar.riser = RISER_STEP; }
      return bar;
    });
    return { bpm: 140, bars };
  }

  // ---------- Race theme 2 "Storm Surge": fast, aggressive wobble ----------
  function buildStormSurgeTrack() {
    const order = ['Dm', 'C', 'Bb', 'C'];
    const bars = order.map((name, i) => {
      const bar = emptyBar();
      bar.chord = CHORDS[name];
      bar.bassNote = ROOTS[name];
      bar.kick = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
      bar.hat = [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0];
      bar.hatOpen = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1];
      bar.wobble = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      // Was 5 (13.5Hz) on a square wave - too fast to read as a rhythmic
      // "wub" (it blurs into a harsh buzz at that rate) and the square
      // wave's harsher harmonics only made it worse once the bass bus's own
      // distortion (see audio.js) piled on top. 3 (8.1Hz) on a sawtooth -
      // the standard wobble waveform - keeps this track the fastest/most
      // aggressive of the three (vs. Thunder Run's 7Hz, Neon Horizon's
      // 4.3Hz) without crossing into unpleasant territory.
      bar.wobbleDiv = 3;
      bar.wobbleQ = 7;
      bar.wobbleDepth = 380;
      bar.clap = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      const isLast = i === order.length - 1;
      bar.stab = isLast
        ? [0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1]
        : [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1];
      if (isLast) { bar.snare = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1]; bar.riser = RISER_STEP; }
      return bar;
    });
    return { bpm: 162, bars };
  }

  // ---------- Race theme 3 "Neon Horizon": bright, gentle wobble, arcade sparkle ----------
  function buildNeonHorizonTrack() {
    const order = ['Cmaj', 'Gmaj', 'Amin7', 'Fmaj'];
    const arpOffsets = {
      Cmaj: [null, N.C5, null, N.E5, null, N.G4, null, N.E5, null, N.C5, null, N.E5, null, N.G4, null, N.E5],
      Gmaj: [null, N.G4, null, N.B4, null, N.D5, null, N.B4, null, N.G4, null, N.B4, null, N.D5, null, N.B4],
      Amin7: [null, N.A4, null, N.C5, null, N.E5, null, N.C5, null, N.A4, null, N.C5, null, N.E5, null, N.C5],
      Fmaj: [null, N.F4, null, N.A4, null, N.C5, null, N.A4, null, N.F4, null, N.A4, null, N.C5, null, N.A4],
    };
    const bars = order.map((name, i) => {
      const bar = emptyBar();
      bar.chord = CHORDS[name];
      bar.bassNote = ROOTS[name];
      bar.kick = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
      // Steady 8th hats keep the "arcade sparkle" identity even under the
      // half-time drums below.
      bar.hat = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
      bar.hatOpen = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
      bar.wobble = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bar.wobbleDiv = 2; // gentlest wub of the three - stays bright, not gnarly
      bar.clap = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      bar.stab = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bar.arp = arpOffsets[name];
      const isLast = i === order.length - 1;
      if (isLast) { bar.snare = ROLL_INTO_DROP; bar.riser = RISER_STEP; }
      return bar;
    });
    return { bpm: 128, bars };
  }

  // ---------- Race theme 4 "Riptide": slow, deep, moody wobble ----------
  function buildRiptideTrack() {
    const order = ['Dm', 'Bb', 'F', 'C'];
    const bars = order.map((name, i) => {
      const bar = emptyBar();
      bar.chord = CHORDS[name];
      bar.bassNote = ROOTS[name];
      bar.kick = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
      bar.hat = [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0];
      bar.hatOpen = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1];
      bar.wobble = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bar.wobbleDiv = 2; // slowest, deepest wobble of the set - moody rather than aggressive
      bar.wobbleQ = 8;
      bar.wobbleDepth = 350;
      bar.clap = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      const isLast = i === order.length - 1;
      bar.stab = isLast
        ? [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1]
        : [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      if (isLast) { bar.snare = ROLL_INTO_DROP; bar.riser = RISER_STEP; }
      return bar;
    });
    return { bpm: 132, bars };
  }

  // ---------- Race theme 5 "Overdrive": fastest, most relentless ----------
  function buildOverdriveTrack() {
    const order = ['Em', 'C', 'G', 'D'];
    const bars = order.map((name, i) => {
      const bar = emptyBar();
      bar.chord = CHORDS[name];
      bar.bassNote = ROOTS[name];
      bar.kick = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0];
      bar.hat = new Array(16).fill(1);
      bar.hatOpen = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1];
      bar.wobble = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bar.wobbleDiv = 3; // fast (matches the tuning that fixed Storm Surge - see there for why not higher)
      bar.wobbleQ = 7;
      bar.wobbleDepth = 400;
      bar.clap = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      const isLast = i === order.length - 1;
      bar.stab = isLast
        ? [1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1]
        : [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (isLast) { bar.snare = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1]; bar.riser = RISER_STEP; }
      return bar;
    });
    return { bpm: 174, bars };
  }

  // ---------- Race theme 6 "Midnight Drift": dark, sparse, haunting ----------
  function buildMidnightDriftTrack() {
    const order = ['Gm', 'F', 'Bb', 'C'];
    const bars = order.map((name, i) => {
      const bar = emptyBar();
      bar.chord = CHORDS[name];
      bar.bassNote = ROOTS[name];
      // Just the one kick per bar and sparse hats - lets the wobble and the
      // gaps between hits carry the track instead of a busy drum pattern.
      bar.kick = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bar.hat = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1];
      bar.hatOpen = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
      bar.wobble = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      bar.wobbleDiv = 2;
      bar.wobbleQ = 10; // narrower resonance for a more haunting, whistling wub
      bar.wobbleDepth = 300;
      bar.clap = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      const isLast = i === order.length - 1;
      bar.stab = isLast
        ? [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1]
        : [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      if (isLast) { bar.snare = ROLL_INTO_DROP; bar.riser = RISER_STEP; }
      return bar;
    });
    return { bpm: 118, bars };
  }

  const RACE_TRACK_BUILDERS = [
    buildThunderRunTrack, buildStormSurgeTrack, buildNeonHorizonTrack,
    buildRiptideTrack, buildOverdriveTrack, buildMidnightDriftTrack,
  ];
  const RACE_TRACK_NAMES = [
    'Thunder Run', 'Storm Surge', 'Neon Horizon',
    'Riptide', 'Overdrive', 'Midnight Drift',
  ];

  // ---------- Menu theme: slower, atmospheric, 4-bar loop ----------
  function buildMenuTrack() {
    const order = ['Am', 'F', 'C', 'G'];
    const leadOffsets = {
      Am: [null, null, N.E5, null, null, null, N.C5, null, null, null, N.A4, null, null, null, N.E5, null],
      F: [null, null, N.C5, null, null, null, N.A4, null, null, null, N.F4, null, null, null, N.A4, null],
      C: [null, null, N.E5, null, null, null, N.G4, null, null, null, N.C5, null, null, null, N.G4, null],
      G: [null, null, N.D5, null, null, null, N.B4, null, null, null, N.G4, null, null, null, N.D5, null],
    };
    const bars = order.map((name) => {
      const bar = emptyBar();
      bar.chord = CHORDS[name];
      bar.bassNote = ROOTS[name];
      bar.hat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
      bar.bass = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      bar.padStart = true;
      bar.lead = leadOffsets[name];
      return bar;
    });
    return { bpm: 88, bars };
  }

  // ---------- Lookahead scheduler ----------
  function Scheduler() {
    this.timer = null;
    this.track = null;
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.secondsPerStep = 0;
    this.playing = false;
  }

  Scheduler.prototype.begin = function (track) {
    this.stop();
    const c = ctx();
    this.track = track;
    this.secondsPerStep = 60 / track.bpm / 4;
    this.stepIndex = 0;
    this.nextStepTime = c.currentTime + 0.12;
    this.playing = true;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  };

  Scheduler.prototype.stop = function () {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  };

  Scheduler.prototype.tick = function () {
    const c = ctx();
    while (this.nextStepTime < c.currentTime + LOOKAHEAD) {
      this.playStep(this.stepIndex, this.nextStepTime);
      this.nextStepTime += this.secondsPerStep;
      this.stepIndex++;
    }
  };

  Scheduler.prototype.playStep = function (globalStep, time) {
    const bars = this.track.bars;
    const totalSteps = bars.length * 16;
    const s = globalStep % totalSteps;
    const barIdx = Math.floor(s / 16);
    const step = s % 16;
    const bar = bars[barIdx];
    const spStep = this.secondsPerStep;

    if (bar.kick[step]) kick(time);
    if (bar.snare[step]) snare(time);
    if (bar.clap && bar.clap[step]) clap(time);
    if (bar.hat[step]) hat(time, bar.hatOpen && !!bar.hatOpen[step]);
    if (bar.bass && bar.bass[step]) pluckBass(time, bar.bassNote, spStep * 1.8, bar.bassWave);
    if (bar.wobble && bar.wobble[step]) {
      const wobbleHz = (bar.wobbleDiv || 3) * (this.track.bpm / 60);
      wobbleBass(time, bar.bassNote, spStep * (bar.wobbleSteps || 15.5), wobbleHz, bar.bassWave, bar.wobbleQ, bar.wobbleDepth);
    }
    if (bar.stab && bar.stab[step]) stab(time, bar.chord, spStep * 2.4);
    if (bar.lead && bar.lead[step] != null) bell(time, bar.lead[step], spStep * 5);
    if (bar.arp && bar.arp[step] != null) bell(time, bar.arp[step], spStep * 1.3);
    if (bar.padStart && step === 0) pad(time, bar.chord.map((f) => f * 0.5), spStep * 16 * 0.97);
    if (bar.riser && bar.riser[step]) riser(time, spStep * 8);
  };

  const scheduler = new Scheduler();
  let desiredTrack = null; // 'menu' | 'race' | null
  let gestureHooked = false;

  function hookGestureRetry() {
    if (gestureHooked) return;
    gestureHooked = true;
    const retry = () => {
      gestureHooked = false;
      HT.Audio.ensureContext();
      applyDesiredTrack();
    };
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  }

  let lastRaceTrackIndex = -1;
  let desiredRaceTrackIndex = 0;

  function pickRaceTrackIndex() {
    if (RACE_TRACK_BUILDERS.length <= 1) return 0;
    let idx;
    do { idx = Math.floor(Math.random() * RACE_TRACK_BUILDERS.length); } while (idx === lastRaceTrackIndex);
    lastRaceTrackIndex = idx;
    return idx;
  }

  function applyDesiredTrack() {
    const c = HT.Audio.ensureContext();
    if (!c || c.state !== 'running') {
      hookGestureRetry();
      return;
    }
    if (desiredTrack === 'menu') scheduler.begin(buildMenuTrack());
    else if (desiredTrack === 'race') scheduler.begin(RACE_TRACK_BUILDERS[desiredRaceTrackIndex]());
    else scheduler.stop();
  }

  function playMenu() {
    desiredTrack = 'menu';
    applyDesiredTrack();
  }

  // Picks a fresh race track (never the same one twice in a row) each time
  // a race actually starts, so replaying/restarting a course stays varied.
  function playRace() {
    desiredTrack = 'race';
    desiredRaceTrackIndex = pickRaceTrackIndex();
    applyDesiredTrack();
  }

  // Manually advances to the next race track in a fixed cycle (wrapping),
  // rather than another random pick - so repeatedly hitting "next" steps
  // through all of them predictably instead of maybe re-rolling the one
  // that's already playing. Takes effect immediately if race music is the
  // current target - which it still is even while paused, since pausing
  // doesn't stop the scheduler, just the race itself - otherwise (called
  // from a menu screen) it just changes what the next playRace() picks up.
  function nextRaceTrack() {
    desiredRaceTrackIndex = (desiredRaceTrackIndex + 1) % RACE_TRACK_BUILDERS.length;
    lastRaceTrackIndex = desiredRaceTrackIndex;
    if (desiredTrack === 'race') applyDesiredTrack();
    return RACE_TRACK_NAMES[desiredRaceTrackIndex];
  }

  function getCurrentRaceTrackName() {
    return desiredTrack === 'race' ? RACE_TRACK_NAMES[desiredRaceTrackIndex] : null;
  }

  function stop() {
    desiredTrack = null;
    scheduler.stop();
  }

  function playVictory() {
    stop();
    const c = HT.Audio.ensureContext();
    if (!c || c.state !== 'running') { hookGestureRetry(); return; }
    const t0 = c.currentTime + 0.05;
    stab(t0, CHORDS.Am, 0.3, 0.26);
    kick(t0, 0.8);
    stab(t0 + 0.28, CHORDS.F, 0.3, 0.26);
    kick(t0 + 0.28, 0.8);
    stab(t0 + 0.56, CHORDS.C, 0.35, 0.28);
    kick(t0 + 0.56, 0.85);
    pad(t0 + 0.95, [N.C5, N.E5, N.G5, N.C6], 2.3);
    stab(t0 + 0.95, [N.C5, N.E5, N.G5], 0.5, 0.3);
    kick(t0 + 0.95, 0.9);
  }

  global.HT = global.HT || {};
  global.HT.Music = {
    playMenu, playRace, playVictory, stop,
    nextTrack: nextRaceTrack, getCurrentTrackName: getCurrentRaceTrackName,
  };
})(window);
