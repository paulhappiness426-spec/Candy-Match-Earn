/* Candy Match sound effects - 100% synthesized with Web Audio (no audio files). */
(function () {
  'use strict';
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('cm_muted') === '1'; } catch (e) {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        const comp = ctx.createDynamicsCompressor(); // keeps big explosions from clipping
        master.connect(comp); comp.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // one oscillator note with an attack/decay envelope
  function tone(freq, at, dur, o) {
    o = o || {};
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + at;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + dur);
    if (o.vibrato) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = o.vibrato; lg.gain.value = freq * 0.03;
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const vol = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); out = f; }
    out.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // filtered noise burst (whooshes, booms, shimmer)
  function noise(at, dur, o) {
    o = o || {};
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.from || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol == null ? 0.2 : o.vol, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C4: 261.63, G4: 392, F4: 349.23, E4: 329.63, D4: 293.66 };
  const PENTA = [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.D6, N.E6];

  const S = {
    unlock() { ensure(); },
    isMuted() { return muted; },
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem('cm_muted', muted ? '1' : '0'); } catch (e) {}
      const c = ensure();
      if (c && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, c.currentTime, 0.02);
    },

    click() { tone(900, 0, 0.05, { type: 'triangle', vol: 0.16, slideTo: 620 }); },

    swap() {
      tone(360, 0, 0.1, { type: 'sine', vol: 0.2, slideTo: 700 });
      noise(0, 0.1, { from: 600, to: 2400, vol: 0.05, q: 0.7 });
    },
    nope() { tone(190, 0, 0.1, { type: 'square', vol: 0.09, slideTo: 130, lp: 900 }); tone(170, 0.11, 0.12, { type: 'square', vol: 0.09, slideTo: 110, lp: 900 }); },
    land() { tone(240, 0, 0.06, { type: 'triangle', vol: 0.07, slideTo: 150 }); },

    // match 3: friendly two-note pluck
    match3(i) {
      const k = (i || 0) % 3;
      const base = [N.C5, N.D5, N.E5][k];
      tone(base, 0, 0.2, { type: 'triangle', vol: 0.28 });
      tone(base * 1.25, 0.07, 0.24, { type: 'triangle', vol: 0.26 });
      tone(base * 3, 0.07, 0.12, { type: 'sine', vol: 0.06 });
      noise(0, 0.07, { from: 2500, to: 900, vol: 0.06, filter: 'highpass' });
    },
    // match 4: bright rising arpeggio + pop
    match4() {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => { tone(f, i * 0.06, 0.28, { type: 'triangle', vol: 0.28 }); tone(f * 2, i * 0.06, 0.16, { type: 'sine', vol: 0.06 }); });
      tone(110, 0, 0.22, { type: 'sine', vol: 0.4, slideTo: 55 });
      noise(0, 0.18, { from: 3500, to: 600, vol: 0.12, filter: 'highpass' });
      tone(N.E6, 0.26, 0.4, { type: 'sine', vol: 0.12, vibrato: 12 });
    },
    // match 5+: huge fanfare, sub boom and shimmer
    match5() {
      [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.E6].forEach((f, i) => {
        tone(f, i * 0.05, 0.4, { type: 'triangle', vol: 0.27 });
        tone(f, i * 0.05, 0.3, { type: 'square', vol: 0.05, lp: 2400 });
      });
      tone(90, 0, 0.55, { type: 'sine', vol: 0.55, slideTo: 38 });
      noise(0, 0.5, { from: 400, to: 90, vol: 0.28, filter: 'lowpass' });
      noise(0.1, 0.8, { from: 1500, to: 7000, vol: 0.1, q: 3 });
      [N.C6, N.E6, N.G6].forEach(f => tone(f, 0.38, 0.9, { type: 'sine', vol: 0.12, vibrato: 7 }));
    },
    // chain reaction: pitch climbs with each combo level
    combo(level) {
      const i = Math.min(PENTA.length - 1, Math.max(0, (level || 2) - 2));
      const f = PENTA[i];
      tone(f, 0.05, 0.22, { type: 'triangle', vol: 0.24 });
      tone(f * 1.5, 0.12, 0.3, { type: 'triangle', vol: 0.22 });
      tone(f * 3, 0.12, 0.35, { type: 'sine', vol: 0.07 });
    },

    win() {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => { tone(f, i * 0.13, 0.35, { type: 'triangle', vol: 0.3 }); tone(f, i * 0.13, 0.3, { type: 'square', vol: 0.05, lp: 2200 }); });
      [N.C6, N.E6, N.G6].forEach(f => { tone(f, 0.55, 1.1, { type: 'triangle', vol: 0.22 }); tone(f / 2, 0.55, 1.1, { type: 'sine', vol: 0.12 }); });
      noise(0.55, 0.9, { from: 3000, to: 9000, vol: 0.06, q: 2 });
    },
    lose() {
      [N.G4, N.F4, N.E4, N.C4].forEach((f, i) => tone(f, i * 0.27, 0.32, { type: 'sawtooth', vol: 0.17, lp: 800, vibrato: i === 3 ? 6 : 0, slideTo: i === 3 ? f * 0.8 : 0 }));
    },

    // booster activated: magical sweep + sparkle
    booster() {
      tone(420, 0, 0.35, { type: 'sine', vol: 0.22, slideTo: 1700, vibrato: 14 });
      tone(840, 0.05, 0.3, { type: 'triangle', vol: 0.1, slideTo: 3200 });
      [N.G6, N.E6, N.C6, N.G6].forEach((f, i) => tone(f, 0.15 + i * 0.05, 0.14, { type: 'sine', vol: 0.09 }));
      noise(0, 0.35, { from: 800, to: 6000, vol: 0.07, q: 2 });
    },
    // booster impact (hammer thud / bomb boom)
    impact(kind) {
      if (kind === 'bomb') {
        tone(120, 0, 0.6, { type: 'sine', vol: 0.6, slideTo: 32 });
        noise(0, 0.7, { from: 1200, to: 70, vol: 0.45, filter: 'lowpass' });
      } else {
        tone(170, 0, 0.2, { type: 'sine', vol: 0.5, slideTo: 50 });
        noise(0, 0.08, { from: 1800, to: 500, vol: 0.2, filter: 'highpass' });
      }
    },
    shuffle() { for (let i = 0; i < 4; i++) noise(i * 0.07, 0.1, { from: 500 + i * 300, to: 3000, vol: 0.09, q: 1.2 }); }
  };
  window.Sound = S;
})();
