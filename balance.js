// Level balance check: plays levels with a "casual" bot (random valid move) and a "good" bot (greedy).
const G = require('../shared/game-core');

function validMoves(s) {
  const out = [];
  for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++)
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const r2 = r + dr, c2 = c + dc;
      if (r2 >= G.ROWS || c2 >= G.COLS) continue;
      const t = G.cloneState(s);
      const res = G.applyAction(t, { t: 'swap', a: [r, c], b: [r2, c2] });
      if (res.ok) out.push({ act: { t: 'swap', a: [r, c], b: [r2, c2] }, gain: t.score - s.score });
    }
  return out;
}
function play(level, seed, mode) {
  const s = G.createState(level, seed);
  let guard = 0;
  while (!s.over && guard++ < 100) {
    const mv = validMoves(s);
    if (!mv.length) break;
    let pick;
    if (mode === 'greedy') { mv.sort((a, b) => b.gain - a.gain); pick = mv[0]; }
    else pick = mv[(seed * 31 + guard * 17) % mv.length];
    G.applyAction(s, pick.act);
  }
  return s;
}
const levels = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 31, 40, 60, 100];
const N = 40;
console.log('level moves target types | casual win% avgScore | greedy win% avgScore');
for (const L of levels) {
  const cfg = G.levelConfig(L);
  const row = {};
  for (const mode of ['casual', 'greedy']) {
    let wins = 0, sum = 0;
    for (let i = 1; i <= N; i++) { const s = play(L, 1000 * L + i, mode); if (s.score >= s.target) wins++; sum += s.score; }
    row[mode] = [Math.round(wins / N * 100), Math.round(sum / N)];
  }
  console.log(String(L).padStart(5), String(cfg.moves).padStart(5), String(cfg.target).padStart(6), String(cfg.types).padStart(5), '|',
    String(row.casual[0]).padStart(5), String(row.casual[1]).padStart(8), '|', String(row.greedy[0]).padStart(6), String(row.greedy[1]).padStart(8));
}
