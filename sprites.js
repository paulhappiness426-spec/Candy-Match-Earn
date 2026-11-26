/* Glossy 3D candy sprites, drawn with canvas gradients (no image files needed). */
(function () {
  'use strict';
  const S = 200;            // drawing coordinate space (all candy art is drawn in 200x200)
  const K = 3;              // render scale: sprites are baked at 600x600 so they stay sharp on 3x phone screens
  const TAU = Math.PI * 2;

  function mk() { const c = document.createElement('canvas'); c.width = c.height = S * K; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; return [c, x]; }

  // depth pass: soft ambient-occlusion at the edges + warm top-left light, clipped to the candy's own shape
  function depth(ctx) {
    const W = S * K;
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    let g = ctx.createRadialGradient(W * .36, W * .30, W * .04, W * .5, W * .52, W * .66);
    g.addColorStop(0, 'rgba(255,250,240,.20)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(40,0,70,.42)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    g = ctx.createLinearGradient(0, W * .6, 0, W);          // bounce light from below
    g.addColorStop(0, 'rgba(255,120,220,0)'); g.addColorStop(1, 'rgba(255,150,230,.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    ctx.restore();
  }
  function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(s => g.addColorStop(s[0], s[1])); return g; }
  function rad(ctx, x0, y0, r0, x1, y1, r1, stops) { const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1); stops.forEach(s => g.addColorStop(s[0], s[1])); return g; }
  function el(ctx, x, y, rx, ry, rot) { ctx.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0)); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rr(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shine(ctx, x, y, rx, ry, rot, a) {
    ctx.save(); ctx.globalAlpha = a == null ? 0.75 : a; ctx.fillStyle = '#fff';
    ctx.beginPath(); el(ctx, x, y, rx, ry, rot); ctx.fill(); ctx.restore();
  }
  function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

  const draw = {};

  draw.soda = function (ctx) {
    ctx.translate(100, 102); ctx.rotate(-0.32);
    // body
    ctx.beginPath(); rr(ctx, -44, -58, 88, 124, 16);
    ctx.fillStyle = lin(ctx, -44, 0, 44, 0, [[0, '#7a0b58'], [.2, '#e0309a'], [.42, '#ff9bd6'], [.62, '#ff4fb0'], [1, '#8a0f63']]); ctx.fill();
    // label band
    ctx.save(); ctx.beginPath(); rr(ctx, -44, -22, 88, 56, 4); ctx.clip();
    ctx.fillStyle = lin(ctx, -44, 0, 44, 0, [[0, '#b8d4ff'], [.4, '#ffffff'], [1, '#9fb7ea']]); ctx.fillRect(-44, -22, 88, 56);
    ctx.fillStyle = '#ff3fa8'; ctx.beginPath(); ctx.moveTo(-44, 20); ctx.bezierCurveTo(-20, 4, 10, 36, 44, 14); ctx.lineTo(44, 34); ctx.lineTo(-44, 34); ctx.fill();
    ctx.restore();
    ctx.font = '900 italic 24px Arial Black, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#d4157f';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeText('CODA', 0, 6); ctx.fillText('CODA', 0, 6);
    // top / bottom rims
    ctx.beginPath(); el(ctx, 0, -58, 44, 12, 0); ctx.fillStyle = lin(ctx, -44, 0, 44, 0, [[0, '#8e97a8'], [.45, '#f3f6fb'], [1, '#7f889a']]); ctx.fill();
    ctx.beginPath(); el(ctx, 0, -58, 33, 8, 0); ctx.fillStyle = '#4a2d63'; ctx.fill();
    ctx.beginPath(); rr(ctx, -9, -66, 22, 9, 4); ctx.fillStyle = '#dfe5ee'; ctx.fill();
    ctx.beginPath(); el(ctx, 0, 66, 44, 11, 0); ctx.fillStyle = '#7b1d5c'; ctx.fill();
    // glossy strip
    ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = '#fff'; ctx.beginPath(); rr(ctx, -32, -44, 9, 100, 4); ctx.fill(); ctx.restore();
  };

  draw.jelly = function (ctx) {
    ctx.translate(100, 102);
    ctx.beginPath(); ctx.moveTo(-46, -46); ctx.quadraticCurveTo(0, -78, 46, -46);
    ctx.lineTo(70, 38); ctx.quadraticCurveTo(76, 66, 50, 66); ctx.lineTo(-50, 66); ctx.quadraticCurveTo(-76, 66, -70, 38); ctx.closePath();
    ctx.fillStyle = rad(ctx, -25, -30, 6, 0, 10, 100, [[0, '#b6fbff'], [.35, '#3fd0f0'], [.75, '#1587c8'], [1, '#0a4f94']]); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(190,250,255,.8)'; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.globalAlpha = .22; ctx.fillStyle = '#fff';
    [-40, -14, 14, 40].forEach(x => { ctx.beginPath(); rr(ctx, x - 3, -50, 6, 120, 3); ctx.fill(); });
    ctx.globalAlpha = .45; ctx.fillStyle = '#04346b'; ctx.beginPath(); ctx.ellipse(0, 70, 82, 22, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.beginPath(); el(ctx, 0, -46, 46, 14, 0); ctx.fillStyle = 'rgba(210,252,255,.55)'; ctx.fill();
    shine(ctx, -30, -34, 16, 7, -0.6, .9); shine(ctx, 46, 30, 5, 14, 0.25, .5);
  };

  draw.sugar = function (ctx) {
    const rnd = seeded(7);
    const top = [[100, 34], [164, 68], [100, 102], [36, 68]], left = [[36, 68], [100, 102], [100, 170], [36, 136]], right = [[164, 68], [100, 102], [100, 170], [164, 136]];
    const face = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = fill; ctx.stroke(); };
    face(left, lin(ctx, 36, 70, 100, 170, [[0, '#f3e4f5'], [1, '#c9b4d8']]));
    face(right, lin(ctx, 164, 70, 100, 170, [[0, '#fff'], [1, '#dcd0ec']]));
    face(top, lin(ctx, 36, 68, 164, 68, [[0, '#fff'], [.5, '#fff7fd'], [1, '#ecdcf4']]));
    [top, left, right].forEach((pts, i) => {
      ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.clip();
      for (let k = 0; k < 70; k++) {
        const x = 36 + rnd() * 130, y = 34 + rnd() * 136;
        ctx.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.95)' : 'rgba(170,140,200,.45)';
        ctx.beginPath(); ctx.arc(x, y, 1.2 + rnd() * 2.2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    });
    ctx.strokeStyle = 'rgba(170,140,200,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(36, 68); ctx.lineTo(100, 102); ctx.lineTo(164, 68); ctx.moveTo(100, 102); ctx.lineTo(100, 170); ctx.stroke();
    shine(ctx, 80, 58, 18, 6, -0.4, .8);
  };

  draw.lollipop = function (ctx) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = lin(ctx, 60, 120, 20, 190, [[0, '#fff'], [1, '#c9bfd6']]); ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(78, 120); ctx.lineTo(34, 184); ctx.stroke();
    ctx.save(); ctx.translate(108, 78);
    ctx.beginPath(); ctx.arc(0, 0, 66, 0, TAU); ctx.fillStyle = '#fff3fb'; ctx.fill();
    ctx.save(); ctx.clip();
    for (let a = 0; a < 3; a++) {
      ctx.beginPath();
      for (let t = 0; t < 4.4 * Math.PI; t += .08) { const r = 4 + t * 4.6, ang = t + a * TAU / 3; const x = Math.cos(ang) * r, y = Math.sin(ang) * r; t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = a % 2 ? '#ff4f9e' : '#ff7ab8'; ctx.lineWidth = 9; ctx.lineCap = 'butt'; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 66, 0, TAU); ctx.fillStyle = rad(ctx, -22, -26, 4, 0, 0, 70, [[0, 'rgba(255,255,255,.55)'], [.4, 'rgba(255,255,255,0)'], [1, 'rgba(120,0,70,.35)']]); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
    shine(ctx, -28, -34, 22, 9, -0.7, .85);
    ctx.restore();
  };

  draw.chocolate = function (ctx) {
    ctx.translate(100, 102); ctx.rotate(-0.38);
    ctx.beginPath(); rr(ctx, -58, -72, 116, 144, 12); ctx.fillStyle = lin(ctx, -58, -72, 58, 72, [[0, '#7a4a2d'], [1, '#2c140a']]); ctx.fill();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      const x = -50 + i * 35, y = -64 + j * 35;
      ctx.beginPath(); rr(ctx, x, y, 31, 31, 6); ctx.fillStyle = lin(ctx, x, y, x + 31, y + 31, [[0, '#a9714a'], [.45, '#6a3b21'], [1, '#341a0d']]); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,220,180,.45)'; ctx.beginPath(); ctx.moveTo(x + 4, y + 27); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x + 27, y + 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.moveTo(x + 28, y + 6); ctx.lineTo(x + 28, y + 28); ctx.lineTo(x + 6, y + 28); ctx.stroke();
    }
    shine(ctx, -34, -52, 14, 5, -0.5, .45);
  };

  draw.donut = function (ctx) {
    ctx.translate(100, 104);
    ctx.beginPath(); ctx.arc(0, 8, 84, 0, TAU); ctx.fillStyle = rad(ctx, -20, -10, 8, 0, 8, 90, [[0, '#f5c26b'], [.7, '#d58a2f'], [1, '#8c4f12']]); ctx.fill();
    // frosting blob
    ctx.beginPath();
    for (let a = 0; a <= TAU + .05; a += .05) { const r = 72 + Math.sin(a * 7) * 4 + Math.sin(a * 3) * 3; const x = Math.cos(a) * r, y = Math.sin(a) * r - 2; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fillStyle = rad(ctx, -24, -32, 6, 0, -2, 84, [[0, '#ffc2e6'], [.5, '#ff6fba'], [1, '#d81f86']]); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    // hole
    ctx.beginPath(); ctx.arc(0, -2, 24, 0, TAU); ctx.fillStyle = rad(ctx, 0, 6, 4, 0, -2, 26, [[0, '#2a0f3a'], [1, '#6a2f84']]); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#e8a0cc'; ctx.stroke();
    // sprinkles
    const rnd = seeded(11), cols = ['#fff', '#44d9ff', '#ffe14a', '#7dff8a', '#b56bff'];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU, r = 32 + rnd() * 36; ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r - 2); ctx.rotate(rnd() * TAU);
      ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); rr(ctx, -6, -2, 12, 4.2, 2); ctx.fill(); ctx.restore();
    }
    shine(ctx, -36, -40, 24, 8, -0.7, .7);
  };

  draw.cherry = function (ctx) {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4a7a22'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(66, 108); ctx.quadraticCurveTo(80, 50, 118, 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(138, 118); ctx.quadraticCurveTo(130, 60, 118, 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(118, 28); ctx.bezierCurveTo(136, 8, 170, 16, 176, 38); ctx.bezierCurveTo(156, 50, 130, 44, 118, 28); ctx.fillStyle = '#58b82e'; ctx.fill();
    const ball = (x, y, r) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = rad(ctx, x - r * .35, y - r * .4, r * .1, x, y, r * 1.05, [[0, '#ff8f8f'], [.35, '#e0102a'], [1, '#5c0010']]); ctx.fill();
      shine(ctx, x - r * .38, y - r * .45, r * .34, r * .17, -0.7, .9);
    };
    ball(68, 140, 42); ball(136, 148, 40);
  };

  draw.strawberry = function (ctx) {
    ctx.translate(100, 106);
    ctx.beginPath(); ctx.moveTo(0, -48);
    ctx.bezierCurveTo(52, -66, 86, -34, 74, 6); ctx.bezierCurveTo(66, 44, 28, 80, 0, 90);
    ctx.bezierCurveTo(-28, 80, -66, 44, -74, 6); ctx.bezierCurveTo(-86, -34, -52, -66, 0, -48); ctx.closePath();
    ctx.fillStyle = rad(ctx, -24, -20, 6, 0, 10, 100, [[0, '#ff7a7a'], [.4, '#e8172e'], [1, '#7a0716']]); ctx.fill();
    ctx.save(); ctx.clip();
    const rnd = seeded(5);
    for (let i = 0; i < 20; i++) {
      const x = -50 + (i % 5) * 25 + (Math.floor(i / 5) % 2) * 12, y = -30 + Math.floor(i / 5) * 24;
      ctx.fillStyle = '#ffe36a'; ctx.beginPath(); ctx.ellipse(x + rnd() * 4, y + rnd() * 4, 3.2, 5, 0.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // leaves
    ctx.fillStyle = '#54b82a';
    for (let i = -3; i <= 3; i++) { ctx.save(); ctx.translate(0, -48); ctx.rotate(i * .42); ctx.beginPath(); ctx.ellipse(0, -14, 11, 26, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#2f7d16'; ctx.beginPath(); rr(ctx, -5, -90, 10, 22, 4); ctx.fill();
    shine(ctx, -36, -22, 20, 8, -0.8, .75);
  };

  function bear(ctx, c1, c2, c3) {
    ctx.translate(100, 104);
    const body = () => {
      ctx.beginPath();
      el(ctx, 0, 40, 40, 46, 0); el(ctx, 0, -26, 36, 32, 0);
      el(ctx, -30, -56, 14, 14, 0); el(ctx, 30, -56, 14, 14, 0);
      el(ctx, -44, 22, 14, 28, 0.55); el(ctx, 44, 22, 14, 28, -0.55);
      el(ctx, -22, 82, 18, 14, 0); el(ctx, 22, 82, 18, 14, 0);
    };
    body(); ctx.fillStyle = c3; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = c3; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.save(); body(); ctx.clip();
    ctx.fillStyle = rad(ctx, -20, -30, 6, 0, 20, 110, [[0, c1], [.55, c2], [1, c3]]); ctx.fillRect(-100, -100, 200, 220);
    ctx.restore();
    // face
    ctx.fillStyle = 'rgba(40,10,40,.55)'; ctx.beginPath(); ctx.arc(-13, -32, 4, 0, TAU); ctx.arc(13, -32, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); el(ctx, 0, -18, 8, 6, 0); ctx.fillStyle = 'rgba(40,10,40,.45)'; ctx.fill();
    shine(ctx, -16, -42, 14, 7, -0.6, .85); shine(ctx, -20, 22, 9, 22, 0.1, .5); shine(ctx, -50, 14, 4, 12, 0.5, .5);
  }
  draw.bearY = (ctx) => bear(ctx, '#fff1a0', '#ffc61a', '#d98300');
  draw.bearG = (ctx) => bear(ctx, '#e6ffa0', '#7fd62a', '#2f8a10');
  draw.bearP = (ctx) => bear(ctx, '#ffd0ea', '#ff63b4', '#c01f78');

  draw.avatar = function (ctx) {
    ctx.fillStyle = '#2a1050'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#7a3cff'; ctx.beginPath(); ctx.ellipse(100, 200, 80, 60, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd0a8'; ctx.beginPath(); ctx.arc(100, 96, 52, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5b3418'; ctx.beginPath(); ctx.arc(100, 78, 54, Math.PI, 0); ctx.lineTo(150, 92); ctx.quadraticCurveTo(100, 62, 50, 92); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1b12'; ctx.beginPath(); ctx.arc(80, 104, 6, 0, TAU); ctx.arc(120, 104, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a2502a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(100, 118, 18, .2, Math.PI - .2); ctx.stroke();
  };

  // sprite order used by the engine: type index -> drawer
  const ORDER = ['soda', 'jelly', 'donut', 'strawberry', 'lollipop', 'chocolate', 'bearY', 'cherry', 'sugar', 'bearG', 'bearP'];
  const cache = {};
  function url(name) {
    if (cache[name]) return cache[name];
    const [c, ctx] = mk(); ctx.save(); ctx.scale(K, K); draw[name](ctx); ctx.restore();
    if (name !== 'avatar') depth(ctx);
    return (cache[name] = c.toDataURL('image/png'));
  }
  window.Sprites = { ORDER, url, forType: (t) => url(ORDER[t % ORDER.length]) };
})();
