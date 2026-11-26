/* Candy Match visual effects layer: particles/confetti, sparkles, flashes, screen shake, praise text, beams.
   Purely visual - it never touches game state. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  // glow colour per candy type index (same order as Sprites.ORDER)
  const TYPE_COL = ['#ff4fb0', '#35d0f0', '#ff7ac0', '#ff3a4a', '#ff7ab8', '#a86a3c', '#ffc61a', '#ff2a40', '#ffffff', '#7fd62a', '#ff63b4'];
  const RAINBOW = ['#ff3b3b', '#ff9f1c', '#ffe14a', '#3ddc84', '#35d0f0', '#8a6bff', '#ff3fd0'];

  let cv, cx, W = 0, H = 0, dpr = 1;
  const parts = [];
  let running = false, last = 0, timeScale = 1, slowTimer = null;

  function init() {
    cv = document.createElement('canvas'); cv.id = 'pfx';
    document.body.appendChild(cv); cx = cv.getContext('2d');
    resize(); window.addEventListener('resize', resize);
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function add(p) {
    if (!cv) init();
    if (parts.length < 800) parts.push(p);
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function star(x, y, r, rot) {
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      cx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.28, Math.sin(a + Math.PI / 4) * r * 0.28);
    }
    cx.closePath(); cx.fill(); cx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * timeScale; last = now;
    cx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vx *= p.drag ? Math.pow(p.drag, dt * 60) : 1;
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt;
      const k = p.life / p.max;
      cx.globalAlpha = Math.min(1, k * 2.2);
      cx.fillStyle = p.col;
      if (p.kind === 'star') {
        cx.shadowColor = p.col; cx.shadowBlur = 10;
        star(p.x, p.y, p.size * (0.5 + 0.5 * Math.sin((1 - k) * Math.PI)) + 1, p.rot);
        cx.shadowBlur = 0;
      } else if (p.kind === 'confetti') {
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.9 + 0.15);
        cx.fillRect(-p.size, -p.size * 0.55, p.size * 2, p.size * 1.1); cx.restore();
      } else {
        cx.beginPath(); cx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU); cx.fill();
      }
    }
    cx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop);
    else { running = false; cx.clearRect(0, 0, W, H); }
  }

  const FX = {
    TYPE_COL, RAINBOW,
    // small glitter over a matched candy (the "sparkle before pop")
    sparkle(x, y, n) {
      for (let i = 0; i < (n || 3); i++) {
        add({ kind: 'star', x: x + rnd(-24, 24), y: y + rnd(-24, 24), vx: rnd(-10, 10), vy: rnd(-26, -4), g: 0,
          size: rnd(5, 10), rot: rnd(0, 3), vr: rnd(-4, 4), col: pick(['#ffffff', '#fff3a0', '#ffd0f4', '#b8f4ff']), life: rnd(0.28, 0.5), max: 0.5 });
      }
    },
    // particle burst. opts: count, colors[], power, confetti(bool), size
    burst(x, y, o) {
      o = o || {};
      const n = o.count || 8, cols = o.colors || ['#fff'], pw = o.power || 220;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), v = rnd(pw * 0.35, pw);
        const kind = o.confetti ? (Math.random() < 0.55 ? 'confetti' : Math.random() < 0.5 ? 'star' : 'dot') : (Math.random() < 0.5 ? 'dot' : 'star');
        const life = rnd(0.5, o.confetti ? 1.5 : 0.8);
        add({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.confetti ? pw * 0.35 : 40), g: o.confetti ? 420 : 300, drag: 0.985,
          size: (o.size || 6) * rnd(0.6, 1.4), rot: rnd(0, TAU), vr: rnd(-12, 12), col: pick(cols), life, max: life });
      }
    },
    // rainbow shock ring made of dots
    ring(x, y, r, count) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        add({ kind: 'dot', x, y, vx: Math.cos(a) * r, vy: Math.sin(a) * r, g: 0, drag: 0.96, size: 6, rot: 0, col: RAINBOW[i % RAINBOW.length], life: 0.7, max: 0.7 });
      }
    },
    // briefly run particles in slow motion
    slowmo(ms, scale) {
      timeScale = scale || 0.35; clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        const t0 = performance.now();
        const ease = () => { const k = Math.min(1, (performance.now() - t0) / 250); timeScale = (scale || 0.35) + (1 - (scale || 0.35)) * k; if (k < 1) requestAnimationFrame(ease); };
        ease();
      }, ms);
    },
    flash(kind, x, y) {
      const d = document.createElement('div'); d.className = 'sflash ' + (kind || 'white');
      d.style.setProperty('--x', (x == null ? W / 2 : x) + 'px'); d.style.setProperty('--y', (y == null ? H / 2 : y) + 'px');
      document.body.appendChild(d); setTimeout(() => d.remove(), 800);
    },
    shake(el, level) {
      if (!el) return;
      el.classList.remove('shake1', 'shake2'); void el.offsetWidth;
      const c = level >= 2 ? 'shake2' : 'shake1'; el.classList.add(c);
      setTimeout(() => el.classList.remove(c), level >= 2 ? 700 : 450);
    },
    praise(text, host, tier) {
      if (!host) return;
      const d = document.createElement('div');
      d.className = 'praise t' + (tier || 1); d.dataset.word = text.replace(/[^A-Z]/g, '');
      d.textContent = text; host.appendChild(d); setTimeout(() => d.remove(), 1300);
    },
    // visual only: a rainbow beam sweeping a whole row or column of the grid
    beam(layer, dir, index, cell, cols, rows) {
      const b = document.createElement('div'); b.className = 'beam ' + dir;
      if (dir === 'h') b.style.cssText = `left:0;top:${index * cell}px;width:${cols * cell}px;height:${cell}px`;
      else b.style.cssText = `top:0;left:${index * cell}px;height:${rows * cell}px;width:${cell}px`;
      layer.appendChild(b); setTimeout(() => b.remove(), 750);
    }
  };
  window.FX = FX;
})();
