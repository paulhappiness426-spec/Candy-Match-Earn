/*
 * Candy Match - deterministic game engine.
 * Runs in the browser (for play + animation) AND on the server (to replay and
 * verify every finished level, so scores/coins cannot be faked by the client).
 * Everything random goes through the seeded RNG stored in the state.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROWS = 6;
  const COLS = 6;
  const MAX_TYPES = 11;
  const POINTS_PER_CANDY = 10;
  const BONUS_PER_EXTRA = 20; // for each candy beyond 3 in one line

  // ---------- levels ----------
  // Moves: different on every level from level 1 (40 moves) down to level 22
  // (19 moves), then stays at 19 (a plain greedy bot only scores ~85 pts/move,
  // so fewer moves would make targets impossible). Target: strictly increasing
  // forever. Late levels need boosters. Calibrated with tests/balance.js.
  function levelConfig(level) {
    const n = Math.max(1, Math.floor(level) || 1);
    const moves = Math.max(19, 41 - n);
    const types = n <= 10 ? 5 : n <= 30 ? 6 : 7;
    const raw = n <= 22 ? 300 + 35 * (n - 1) : 1035 + 12 * (n - 22);
    const target = Math.round(raw / 10) * 10;
    return { level: n, moves, target, types };
  }

  // ---------- rng ----------
  function rand(state) {
    // mulberry32 on state.rng
    state.rng = (state.rng + 0x6d2b79f5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(state, n) { return Math.floor(rand(state) * n); }
  function randType(state) { return randInt(state, state.types); }

  // ---------- helpers ----------
  const inB = (r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < ROWS && c < COLS;
  const typeAt = (g, r, c) => (g[r][c] ? g[r][c].type : -1);

  function findRuns(grid) {
    const runs = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const t = typeAt(grid, r, c);
        let e = c + 1;
        while (t >= 0 && e < COLS && typeAt(grid, r, e) === t) e++;
        if (t >= 0 && e - c >= 3) { const cells = []; for (let k = c; k < e; k++) cells.push([r, k]); runs.push(cells); }
        c = e;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const t = typeAt(grid, r, c);
        let e = r + 1;
        while (t >= 0 && e < ROWS && typeAt(grid, e, c) === t) e++;
        if (t >= 0 && e - r >= 3) { const cells = []; for (let k = r; k < e; k++) cells.push([k, c]); runs.push(cells); }
        r = e;
      }
    }
    return runs;
  }

  function hasValidMove(grid) {
    const swapT = (r1, c1, r2, c2) => { const a = grid[r1][c1]; grid[r1][c1] = grid[r2][c2]; grid[r2][c2] = a; };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (!inB(nr, nc)) continue;
        swapT(r, c, nr, nc);
        const ok = findRuns(grid).length > 0;
        swapT(r, c, nr, nc);
        if (ok) return true;
      }
    }
    return false;
  }

  // ---------- state ----------
  function newCandy(state, type) { return { id: state.nextId++, type }; }

  function createState(level, seed) {
    const cfg = levelConfig(level);
    const state = {
      level: cfg.level, target: cfg.target, moves: cfg.moves, types: cfg.types,
      score: 0, over: null, // null | 'won' | 'lost'
      rng: (Number(seed) >>> 0) || 1, nextId: 1, grid: null, combo: 0
    };
    for (let attempt = 0; attempt < 200; attempt++) {
      const grid = [];
      for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
          let t, guard = 0;
          do {
            t = randType(state);
            guard++;
          } while (guard < 50 && (
            (c >= 2 && row[c - 1].type === t && row[c - 2].type === t) ||
            (r >= 2 && grid[r - 1][c].type === t && grid[r - 2][c].type === t)));
          row.push(newCandy(state, t));
        }
        grid.push(row);
      }
      if (findRuns(grid).length === 0 && hasValidMove(grid)) { state.grid = grid; return state; }
    }
    throw new Error('could not build a starting board');
  }

  function cloneState(s) {
    return Object.assign({}, s, { grid: s.grid.map(row => row.map(x => (x ? { id: x.id, type: x.type } : null))) });
  }

  // ---------- core mechanics ----------
  function collapse(state, steps) {
    const falls = [], spawns = [];
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const cell = state.grid[r][c];
        if (cell) {
          if (r !== write) {
            falls.push({ id: cell.id, c, from: r, to: write });
            state.grid[write][c] = cell; state.grid[r][c] = null;
          }
          write--;
        }
      }
      const empty = write + 1;
      for (let r = write; r >= 0; r--) {
        const cell = newCandy(state, randType(state));
        state.grid[r][c] = cell;
        spawns.push({ id: cell.id, type: cell.type, c, from: r - empty, to: r });
      }
    }
    steps.push({ k: 'collapse', falls, spawns });
  }

  function clearCells(state, cells, steps, mult, extra) {
    const seen = new Set(), list = [];
    for (const [r, c] of cells) {
      const key = r * COLS + c;
      if (seen.has(key) || !state.grid[r][c]) continue;
      seen.add(key);
      list.push({ r, c, id: state.grid[r][c].id, type: state.grid[r][c].type });
    }
    const pts = (list.length * POINTS_PER_CANDY + (extra || 0)) * mult;
    for (const x of list) state.grid[x.r][x.c] = null;
    state.score += pts;
    steps.push({ k: 'clear', cells: list, points: pts, combo: mult });
    collapse(state, steps);
  }

  // clears matches repeatedly (chain reactions)
  function cascade(state, steps, startCombo) {
    let combo = startCombo;
    for (let guard = 0; guard < 60; guard++) {
      const runs = findRuns(state.grid);
      if (!runs.length) break;
      let extra = 0;
      const cells = [];
      for (const run of runs) {
        if (run.length > 3) extra += (run.length - 3) * BONUS_PER_EXTRA;
        for (const rc of run) cells.push(rc);
      }
      clearCells(state, cells, steps, combo, extra);
      combo++;
    }
    state.combo = Math.max(state.combo, combo - 1);
  }

  function finalize(state, steps) {
    // never leave the player stuck with no possible move
    if (state.score < state.target && state.moves > 0 && !hasValidMove(state.grid)) {
      doShuffle(state, steps, true);
    }
    if (state.score >= state.target) state.over = 'won';
    else if (state.moves <= 0) state.over = 'lost';
  }

  function doShuffle(state, steps, auto) {
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push(state.grid[r][c]);
    for (let attempt = 0; attempt < 300; attempt++) {
      const arr = cells.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = randInt(state, i + 1);
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      const g = [];
      for (let r = 0; r < ROWS; r++) g.push(arr.slice(r * COLS, r * COLS + COLS));
      if (findRuns(g).length === 0 && hasValidMove(g)) {
        state.grid = g;
        const moved = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) moved.push({ id: g[r][c].id, r, c });
        steps.push({ k: 'shuffle', moved, auto: !!auto });
        return;
      }
    }
    // fallback: rebuild with fresh random types (still deterministic)
    for (let attempt = 0; attempt < 300; attempt++) {
      const g = [];
      for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) row.push({ id: state.grid[r][c].id, type: randType(state) });
        g.push(row);
      }
      if (findRuns(g).length === 0 && hasValidMove(g)) {
        state.grid = g;
        const moved = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) moved.push({ id: g[r][c].id, r, c, type: g[r][c].type });
        steps.push({ k: 'shuffle', moved, auto: !!auto, retype: true });
        return;
      }
    }
  }

  // ---------- actions ----------
  // action shapes:
  //  {t:'swap', a:[r,c], b:[r,c]}   neighbours only, must create a match, costs 1 move
  //  {t:'hammer', a:[r,c]}          removes 1 candy
  //  {t:'bomb', a:[r,c]}            removes a 3x3 area (centre clamped so 9 candies always go)
  //  {t:'arrow', a:[r,c], b:[r,c]}  swap any 2 candies
  //  {t:'shuffle'}                  shuffle whole board
  //  {t:'plus5'}                    +5 moves
  function applyAction(state, act) {
    const fail = (error) => ({ ok: false, error, steps: [] });
    if (!act || typeof act !== 'object') return fail('bad_action');
    if (state.over) return fail('level_over');
    const steps = [];
    const pt = (p) => Array.isArray(p) && p.length === 2 && inB(p[0], p[1]);

    switch (act.t) {
      case 'swap': {
        if (!pt(act.a) || !pt(act.b)) return fail('bad_cell');
        const [r1, c1] = act.a, [r2, c2] = act.b;
        if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return fail('not_neighbours');
        if (state.moves <= 0) return fail('no_moves');
        const g = state.grid;
        const tmp = g[r1][c1]; g[r1][c1] = g[r2][c2]; g[r2][c2] = tmp;
        if (findRuns(g).length === 0) {
          const t2 = g[r1][c1]; g[r1][c1] = g[r2][c2]; g[r2][c2] = t2; // swap back, no move wasted
          return { ok: false, error: 'no_match', steps: [] };
        }
        steps.push({ k: 'swap', a: [r1, c1], b: [r2, c2] });
        state.moves--;
        cascade(state, steps, 1);
        break;
      }
      case 'hammer': {
        if (!pt(act.a)) return fail('bad_cell');
        steps.push({ k: 'fx', name: 'hammer', at: act.a });
        clearCells(state, [act.a], steps, 1, 0);
        cascade(state, steps, 2);
        break;
      }
      case 'bomb': {
        if (!pt(act.a)) return fail('bad_cell');
        const cr = Math.min(ROWS - 2, Math.max(1, act.a[0]));
        const cc = Math.min(COLS - 2, Math.max(1, act.a[1]));
        const cells = [];
        for (let r = cr - 1; r <= cr + 1; r++) for (let c = cc - 1; c <= cc + 1; c++) cells.push([r, c]);
        steps.push({ k: 'fx', name: 'bomb', at: [cr, cc] });
        clearCells(state, cells, steps, 1, 0);
        cascade(state, steps, 2);
        break;
      }
      case 'arrow': {
        if (!pt(act.a) || !pt(act.b)) return fail('bad_cell');
        if (act.a[0] === act.b[0] && act.a[1] === act.b[1]) return fail('same_cell');
        const g = state.grid;
        const [r1, c1] = act.a, [r2, c2] = act.b;
        const tmp = g[r1][c1]; g[r1][c1] = g[r2][c2]; g[r2][c2] = tmp;
        steps.push({ k: 'swap', a: [r1, c1], b: [r2, c2] });
        cascade(state, steps, 1);
        break;
      }
      case 'shuffle': {
        doShuffle(state, steps, false);
        break;
      }
      case 'plus5': {
        state.moves += 5;
        steps.push({ k: 'moves', add: 5 });
        break;
      }
      default: return fail('unknown_action');
    }
    finalize(state, steps);
    return { ok: true, steps };
  }

  const BOOSTER_OF = { hammer: 'hammer', bomb: 'bomb', arrow: 'arrow', shuffle: 'shuffle', plus5: 'plus5' };

  // Replays a finished level. `allowed` = how many boosters of each kind the
  // server saw the player spend during this session.
  function replay(level, seed, actions, allowed) {
    const state = createState(level, seed);
    const used = { hammer: 0, bomb: 0, arrow: 0, shuffle: 0, plus5: 0 };
    if (!Array.isArray(actions) || actions.length > 400) return { ok: false, error: 'bad_actions' };
    for (const act of actions) {
      if (state.over) break; // anything after the end is ignored
      if (act && BOOSTER_OF[act.t]) {
        used[act.t]++;
        if (allowed && used[act.t] > (allowed[act.t] || 0)) return { ok: false, error: 'booster_not_spent' };
      }
      const res = applyAction(state, act);
      if (!res.ok) return { ok: false, error: res.error };
    }
    return { ok: true, state, used };
  }

  return {
    ROWS, COLS, MAX_TYPES, POINTS_PER_CANDY,
    levelConfig, createState, cloneState, applyAction, replay,
    findRuns, hasValidMove
  };
});
