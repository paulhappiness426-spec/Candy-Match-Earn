(() => {
  'use strict';
  const G = window.GameCore;
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const tg = (window.Telegram && window.Telegram.WebApp) || null;
  try { if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor && tg.setHeaderColor('#12042b'); tg.setBackgroundColor && tg.setBackgroundColor('#12042b'); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } } catch (e) {}
  const buzz = (t) => { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(t || 'light'); } catch (e) {} };

  const qs = new URLSearchParams(location.search);
  const devId = qs.get('dev');
  const initData = (tg && tg.initData) || (devId ? 'dev:' + devId + ':' + (qs.get('name') || 'Player') : '');
  const refParam = qs.get('ref') || '';

  // ---------- API ----------
  async function api(path, body) {
    const opt = { headers: { 'X-Telegram-Init-Data': initData, 'Content-Type': 'application/json' } };
    if (body !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, opt); } catch (e) { throw new Error('No connection to the server'); }
    let data = {}; try { data = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.status = res.status; throw err; }
    return data;
  }
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

  // ---------- state ----------
  let me = null, cfg = null, lb = null, history = [], isAdmin = false;
  let st = null;          // engine state of the running level (or demo board)
  let playing = false;    // a real server-verified level is active
  let actions = [];       // verified actions to send to the server at the end
  let busy = false;       // board lock while animating
  let mode = null;        // booster waiting for a tap: 'hammer' | 'bomb' | 'arrow'
  let arrowFirst = null, selected = null;
  let shownScore = 0, shownMoves = 0;
  const els = new Map();  // candy id -> element

  const BOOSTERS = [
    { key: 'hammer', icon: '\u{1F528}', name: 'Hammer', desc: 'Tap the Hammer, then tap any candy to smash it.' },
    { key: 'arrow', icon: '⇄', name: 'Arrow / Swap', desc: 'Swap any 2 candies, even if they are not neighbours.' },
    { key: 'bomb', icon: '\u{1F4A3}', name: 'Bomb', desc: 'Explodes a 3x3 area and removes 9 candies.' },
    { key: 'shuffle', icon: '\u{1F500}', name: 'Shuffle', desc: 'Shuffles the whole board.' },
    { key: 'plus5', icon: '+5', name: '+5 Moves', desc: 'Adds 5 extra moves to the current level.' }
  ];

  // ---------- layout ----------
  function sizeBoard() {
    const w = Math.min(window.innerWidth, 520) - 28 - 24 - 8;
    const h = window.innerHeight - 560; // keep the booster row visible above the footer
    const cell = Math.max(40, Math.min(68, Math.floor(w / 6), Math.floor(h / 6)));
    document.documentElement.style.setProperty('--cell', cell + 'px');
    if (st) for (const [id, el] of els) place(el, el._r, el._c, false);
  }
  const cellPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 56;
  function place(el, r, c, anim) {
    el._r = r; el._c = c;
    if (anim === false) el.style.transition = 'none';
    el.style.transform = `translate(${c * cellPx()}px,${r * cellPx()}px)`;
    if (anim === false) { void el.offsetWidth; el.style.transition = ''; }
  }

  // ---------- board rendering ----------
  function makeCandy(id, type, r, c) {
    const el = document.createElement('div');
    el.className = 'candy'; el.dataset.id = id;
    const img = document.createElement('img'); img.alt = ''; img.src = Sprites.forType(type); el.appendChild(img);
    el._type = type; el._id = id;
    place(el, r, c, false);
    $('#grid').appendChild(el); els.set(id, el);
    return el;
  }
  function renderBoard() {
    $('#grid').innerHTML = ''; els.clear();
    for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) { const x = st.grid[r][c]; makeCandy(x.id, x.type, r, c); }
  }
  const elAt = (r, c) => { for (const el of els.values()) if (el._r === r && el._c === c && !el.classList.contains('pop')) return el; return null; };

  function setHint(t) { $('#hint').textContent = t || ''; }
  function updateHud() {
    $('#score').textContent = fmt(shownScore);
    $('#moves').textContent = shownMoves;
    const c = st ? st.target : G.levelConfig(me ? me.level : 1).target;
    $('#lvl').textContent = 'LEVEL ' + (me ? me.level : 1);
    $('#tgtTxt').textContent = 'TARGET ' + fmt(c);
    $('#pfill').style.width = Math.min(100, shownScore / c * 100) + '%';
    $('#btnPlay').innerHTML = playing ? 'QUIT' : 'PLAY <span>&#9654;</span>';
  }
  function updateTop() {
    $('#coinAmt').textContent = fmt(me.coins);
    $('#uname').textContent = me.name || 'Player';
    $('#dailyDot').hidden = !me.daily.available;
    const av = $('#avatar');
    if (me.photo) { av.src = me.photo; av.onerror = () => { av.src = Sprites.url('avatar'); }; } else av.src = Sprites.url('avatar');
  }
  function renderBoosters() {
    const box = $('#boosters'); box.innerHTML = '';
    for (const b of BOOSTERS) {
      const n = me.boosters[b.key] || 0;
      const btn = document.createElement('button');
      btn.className = 'bst' + (n ? '' : ' zero') + (mode === b.key ? ' on' : '');
      btn.setAttribute('aria-label', b.name);
      btn.innerHTML = (b.icon === '+5' ? '<em>+5</em>' : b.icon) + `<b>${n}</b>`;
      btn.onclick = () => useBooster(b.key);
      box.appendChild(btn);
    }
  }
  function renderLb() {
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    let html = '';
    for (let i = 0; i < 3; i++) {
      const r = lb.top[i];
      html += r ? `<div class="lbr ${r.me ? 'me' : ''}"><span class="medal">${medals[i]}</span><span class="n">${esc(r.name)}</span><span class="s">${fmt(r.score)}</span></div>`
        : `<div class="lbr empty"><span class="medal">${medals[i]}</span><span class="n">---</span><span class="s">0</span></div>`;
    }
    $('#lbRows').innerHTML = html;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function applyServer(d) {
    if (d.user) me = d.user;
    if (d.leaderboard) lb = d.leaderboard;
    if (d.withdrawals) history = d.withdrawals;
    updateTop(); renderBoosters(); renderLb();
  }

  // ---------- demo board (before PLAY) ----------
  function showDemo() {
    const cf = G.levelConfig(me.level);
    st = G.createState(cf.level, (Math.random() * 2 ** 31) | 0);
    playing = false; actions = []; mode = null; arrowFirst = null; selected = null;
    shownScore = 0; shownMoves = cf.moves;
    $('#grid').parentElement.classList.add('locked');
    renderBoard(); updateHud(); renderBoosters();
    setHint('Press PLAY to start level ' + cf.level);
  }

  // ---------- starting / ending levels ----------
  async function startLevel() {
    if (busy) return;
    if (playing) { confirmQuit(); return; }
    try {
      const d = await api('/api/level/start', { level: me.level });
      me = d.user; st = G.createState(d.level, d.seed);
      playing = true; actions = []; mode = null; arrowFirst = null; selected = null;
      shownScore = 0; shownMoves = st.moves;
      $('#grid').parentElement.classList.remove('locked');
      renderBoard(); updateTop(); updateHud(); renderBoosters();
      setHint('Swap neighbouring candies to match 3 or more');
    } catch (e) { toast(e.message); }
  }
  function confirmQuit() {
    openSheet(`<div class="panel center"><h2>Quit level?</h2><p>Your progress in this level will be lost. Boosters you already used are not refunded.</p>
      <button class="btn alt" id="q-no">KEEP PLAYING</button><button class="btn" id="q-yes">QUIT</button></div>`, () => {
      $('#q-no').onclick = closeSheet;
      $('#q-yes').onclick = async () => { closeSheet(); try { await api('/api/level/finish', { actions: [] }); } catch (e) {} showDemo(); };
    });
  }
  async function endLevel() {
    busy = true;
    let res;
    try { res = await api('/api/level/finish', { actions }); }
    catch (e) { toast(e.message); playing = false; busy = false; showDemo(); return; }
    applyServer(res); playing = false; busy = false;
    const won = res.won;
    const cf = st;
    const body = won
      ? `<h2>LEVEL COMPLETE!</h2><div class="stars">&#9733;&#9733;&#9733;</div><p>Score ${fmt(res.score)}</p>
         ${res.reward ? `<div class="big">+${res.reward} COINS</div><p>Level ${me.level} is now unlocked.</p>` : '<p>You already cleared this level, so no coins this time.</p>'}
         <button class="btn green" id="r-next">NEXT LEVEL</button><button class="btn alt" id="r-home">HOME</button>`
      : `<h2>OUT OF MOVES</h2><p>You scored ${fmt(res.score)} but the target was ${fmt(cf.target)}. No coins this time.</p>
         <button class="btn" id="r-retry">TRY AGAIN</button><button class="btn alt" id="r-home">HOME</button>`;
    showDemo();
    openSheet(`<div class="panel center">${body}</div>`, () => {
      const go = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
      go('#r-next', () => { closeSheet(); startLevel(); });
      go('#r-retry', () => { closeSheet(); startLevel(); });
      go('#r-home', closeSheet);
    }, true);
  }

  // ---------- applying actions + animation ----------
  async function runAction(act) {
    const res = G.applyAction(st, act);
    return res;
  }
  async function perform(act) {
    if (busy || !playing || st.over) return false;
    busy = true; clearSelection();
    const res = G.applyAction(st, act);
    if (!res.ok) {
      if (res.error === 'no_match' && act.t === 'swap') { await bounce(act.a, act.b); }
      busy = false; return false;
    }
    actions.push(act);
    await animate(res.steps);
    shownScore = st.score; shownMoves = st.moves; updateHud();
    if (st.over) { await sleep(250); await endLevel(); return true; }
    busy = false; return true;
  }
  async function bounce(a, b) {
    const ea = elAt(a[0], a[1]), eb = elAt(b[0], b[1]); if (!ea || !eb) return;
    place(ea, b[0], b[1]); place(eb, a[0], a[1]); await sleep(200);
    place(ea, a[0], a[1]); place(eb, b[0], b[1]); await sleep(220); buzz('rigid');
  }
  function pop(txt, r, c) {
    const d = document.createElement('div'); d.className = 'pts'; d.textContent = txt;
    d.style.left = (c + .5) * cellPx() + 'px'; d.style.top = (r + .5) * cellPx() + 'px'; $('#fx').appendChild(d); setTimeout(() => d.remove(), 900);
  }
  async function animate(steps) {
    for (const s of steps) {
      if (s.k === 'swap') {
        const ea = elAt(s.a[0], s.a[1]), eb = elAt(s.b[0], s.b[1]);
        if (ea && eb) { place(ea, s.b[0], s.b[1]); place(eb, s.a[0], s.a[1]); }
        shownMoves = Math.max(0, shownMoves - (actions[actions.length - 1].t === 'swap' ? 1 : 0)); updateHud();
        await sleep(230);
      } else if (s.k === 'clear') {
        let sr = 0, sc = 0;
        for (const x of s.cells) { const el = els.get(x.id); if (el) { el.classList.add('pop'); setTimeout(() => { el.remove(); els.delete(x.id); }, 230); } sr += x.r; sc += x.c; }
        pop('+' + s.points + (s.combo > 1 ? ' x' + s.combo : ''), sr / s.cells.length, sc / s.cells.length);
        shownScore += s.points; updateHud(); buzz(s.combo > 1 ? 'medium' : 'light');
        await sleep(240);
      } else if (s.k === 'collapse') {
        for (const f of s.falls) { const el = els.get(f.id); if (el) place(el, f.to, f.c); }
        for (const sp of s.spawns) { const el = makeCandy(sp.id, sp.type, sp.from, sp.c); void el.offsetWidth; place(el, sp.to, sp.c); }
        await sleep(300);
      } else if (s.k === 'shuffle') {
        for (const m of s.moved) { const el = els.get(m.id); if (el) { if (m.type != null) el.firstChild.src = Sprites.forType(m.type); place(el, m.r, m.c); } }
        if (s.auto) toast('No moves left - board shuffled'); await sleep(380);
      } else if (s.k === 'fx') {
        const f = document.createElement('div'); f.className = 'flash';
        const size = cellPx() * (s.name === 'bomb' ? 3 : 1.4);
        f.style.cssText = `width:${size}px;height:${size}px;left:${(s.at[1] + .5) * cellPx() - size / 2}px;top:${(s.at[0] + .5) * cellPx() - size / 2}px`;
        $('#fx').appendChild(f); setTimeout(() => f.remove(), 450); buzz('heavy'); await sleep(200);
      } else if (s.k === 'moves') { shownMoves += s.add; updateHud(); }
    }
  }

  // ---------- input ----------
  function clearSelection() { if (selected) { const e = elAt(selected.r, selected.c); if (e) e.classList.remove('sel'); } selected = null; }
  let down = null;
  $('#grid').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.candy'); if (!el || busy || !playing) return;
    down = { r: el._r, c: el._c, x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', (e) => {
    if (!down || busy) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cellPx() * .45) return;
    const a = [down.r, down.c];
    const b = Math.abs(dx) > Math.abs(dy) ? [a[0], a[1] + (dx > 0 ? 1 : -1)] : [a[0] + (dy > 0 ? 1 : -1), a[1]];
    down = null;
    if (mode) return;
    if (b[0] >= 0 && b[1] >= 0 && b[0] < G.ROWS && b[1] < G.COLS) perform({ t: 'swap', a, b });
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    const p = down; down = null;
    if (busy || !playing) return;
    tapCell(p.r, p.c);
  });
  window.addEventListener('pointercancel', () => { down = null; });

  async function tapCell(r, c) {
    if (mode === 'hammer' || mode === 'bomb') {
      const m = mode; mode = null; renderBoosters(); setHint('');
      await spend(m, { t: m, a: [r, c] }); return;
    }
    if (mode === 'arrow') {
      if (!arrowFirst) { arrowFirst = [r, c]; const e = elAt(r, c); if (e) e.classList.add('target'); setHint('Now tap the candy to swap with'); return; }
      if (arrowFirst[0] === r && arrowFirst[1] === c) return;
      const a = arrowFirst; arrowFirst = null; mode = null; renderBoosters(); setHint('');
      const e = elAt(a[0], a[1]); if (e) e.classList.remove('target');
      await spend('arrow', { t: 'arrow', a, b: [r, c] }); return;
    }
    if (selected) {
      const s = selected;
      if (s.r === r && s.c === c) { clearSelection(); return; }
      if (Math.abs(s.r - r) + Math.abs(s.c - c) === 1) { clearSelection(); perform({ t: 'swap', a: [s.r, s.c], b: [r, c] }); return; }
      clearSelection();
    }
    selected = { r, c }; const e = elAt(r, c); if (e) e.classList.add('sel'); buzz('light');
  }

  // booster = ask the server to take it from the inventory first, then apply it locally
  async function spend(key, act) {
    if (busy) return;
    busy = true;
    try { const d = await api('/api/booster/use', { type: key }); me = d.user; renderBoosters(); }
    catch (e) { busy = false; toast(e.message); return; }
    busy = false;
    await perform(act);
  }
  async function useBooster(key) {
    if (!playing) { toast('Press PLAY first'); return; }
    if (busy) return;
    if (!(me.boosters[key] > 0)) { toast('You have none - buy it in the SHOP'); openShop(); return; }
    if (mode === key) { mode = null; arrowFirst = null; renderBoosters(); setHint(''); document.querySelectorAll('.target').forEach(e => e.classList.remove('target')); return; }
    if (key === 'shuffle' || key === 'plus5') { await spend(key, { t: key }); return; }
    clearSelection(); mode = key; renderBoosters();
    setHint(key === 'hammer' ? 'Tap a candy to smash it' : key === 'bomb' ? 'Tap where to explode (3x3)' : 'Tap the first candy to swap');
  }

  // ---------- sheets ----------
  let sheetTimer = null;
  function openSheet(html, onMount, lock) {
    const s = $('#sheet'); s.hidden = false; s.innerHTML = html;
    const panel = s.firstElementChild;
    if (!lock && panel && !panel.classList.contains('center')) { const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.onclick = closeSheet; panel.style.position = 'relative'; panel.prepend(x); }
    s.onclick = (e) => { if (e.target === s && !lock) closeSheet(); };
    if (onMount) onMount();
  }
  function closeSheet() { clearInterval(sheetTimer); $('#sheet').hidden = true; $('#sheet').innerHTML = ''; setTab('home'); }
  function setTab(t) { document.querySelectorAll('.foot button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); }

  function boosterRows(modeName) {
    return BOOSTERS.map(b => `<div class="bl"><div class="ic">${b.icon}</div><div class="t"><b>${b.name}</b><span>${b.desc}</span>
      ${modeName === 'inv' ? `<span>Owned: <b style="display:inline;color:#fff">${me.boosters[b.key] || 0}</b></span>` : ''}</div>
      <button class="btn" data-buy="${b.key}">${modeName === 'inv' ? 'BUY +1 (' + cfg.prices[b.key] + ')' : cfg.prices[b.key] + ' &#129689;'}</button></div>`).join('');
  }
  async function buy(key, rerender) {
    try { const d = await api('/api/shop/buy', { item: key }); applyServer(d); toast('Bought ' + BOOSTERS.find(b => b.key === key).name + '!'); rerender(); }
    catch (e) { toast(e.status === 400 ? e.message : e.message); }
  }
  function openShop() {
    setTab('shop');
    const render = () => {
      openSheet(`<div class="panel"><h2>SHOP</h2><p>Your coins: <b style="color:#ffd23f">${fmt(me.coins)}</b></p>${boosterRows('shop')}</div>`, () => {
        document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy, render));
        setTab('shop');
      });
    };
    render();
  }
  function openBoosters() {
    setTab('boosters');
    const render = () => {
      openSheet(`<div class="panel"><h2>BOOSTERS</h2><p>Use them on the board while a level is running. Coins: <b style="color:#ffd23f">${fmt(me.coins)}</b></p>${boosterRows('inv')}</div>`, () => {
        document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy, render));
        setTab('boosters');
      });
    };
    render();
  }

  function countdown(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'); }

  function openWallet(showWithdraw) {
    const render = () => {
      const need = cfg.minWithdraw - me.coins;
      const d = me.daily;
      openSheet(`<div class="panel"><h2>WALLET</h2>
        <div class="card" style="text-align:center"><p>Balance</p><div class="big">${fmt(me.coins)}</div>
        <p>${fmt(cfg.coinsPerDollar)} coins = $1 &nbsp;&middot;&nbsp; ${fmt(me.coins / cfg.coinsPerDollar < 0.01 ? 0 : Math.floor(me.coins / cfg.coinsPerDollar * 100) / 100)} USD</p></div>
        <h3>DAILY BONUS</h3>
        <div class="card"><div class="row"><div class="kv">Claim <b>+${cfg.dailyBonus} coins</b> every day</div>
          ${d.available ? '<button class="btn green" id="claim" style="width:auto;margin:0;padding:10px 16px;font-size:15px">CLAIM</button>' : '<b id="cd" style="color:#6df3ff"></b>'}</div>
          ${d.available ? '' : '<p>Next bonus in <span id="cd2"></span></p>'}</div>
        <h3>WITHDRAW</h3>
        <button class="btn alt" id="wdBtn" style="margin-top:0">WITHDRAW</button>
        <div id="wdBox" ${showWithdraw ? '' : 'hidden'}></div>
        <h3>WITHDRAW HISTORY</h3>
        <div id="wdHist">${history.length ? history.map(w => `<div class="hist"><span>#${w.id} &middot; ${fmt(w.amount)} coins ($${w.usd.toFixed(2)}) &middot; ${w.method === 'faucetpay' ? 'FaucetPay' : 'Litecoin'}<br>${new Date(w.createdAt).toLocaleString()}</span><span class="tag ${w.status}">${w.status.toUpperCase()}</span></div>`).join('') : '<p>No withdrawals yet.</p>'}</div></div>`, () => {
        const cl = $('#claim');
        if (cl) cl.onclick = async () => { try { const r = await api('/api/daily', {}); applyServer(r); toast('+' + cfg.dailyBonus + ' coins!'); render(); } catch (e) { toast(e.message); } };
        clearInterval(sheetTimer);
        if (!d.available) { const tick = () => { const left = d.nextAt - Date.now(); if (left <= 0) { me.daily.available = true; updateTop(); render(); return; } const t = countdown(left); const a = $('#cd'), b = $('#cd2'); if (a) a.textContent = t; if (b) b.textContent = t; }; tick(); sheetTimer = setInterval(tick, 1000); }
        $('#wdBtn').onclick = () => { const box = $('#wdBox'); box.hidden = !box.hidden; if (!box.hidden) fillWithdraw(); };
        if (showWithdraw) fillWithdraw();
        function fillWithdraw() {
          const box = $('#wdBox');
          if (me.coins < cfg.minWithdraw) {
            box.innerHTML = `<div class="card"><p>Your balance: <b style="color:#ffd23f">${fmt(me.coins)}</b> coins</p><p>Minimum withdraw is <b style="color:#fff">${fmt(cfg.minWithdraw)}</b> coins (${fmt(cfg.coinsPerDollar)} coins = $1).</p>
              <p style="color:#ff9ad8">You need <b>${fmt(need)}</b> more coins to withdraw.</p></div>`;
            return;
          }
          let method = 'faucetpay';
          box.innerHTML = `<div class="card"><p>Balance: <b style="color:#ffd23f">${fmt(me.coins)}</b> coins &middot; Minimum ${fmt(cfg.minWithdraw)}</p>
            <p>Rate: ${fmt(cfg.coinsPerDollar)} coins = $1 &nbsp;(200,000 = $2, 300,000 = $3 ...)</p>
            <div class="seg"><button id="m-fp" class="on">FaucetPay</button><button id="m-ltc">Litecoin</button></div>
            <input id="wd-amt" type="number" inputmode="numeric" min="${cfg.minWithdraw}" max="${me.coins}" value="${cfg.minWithdraw}">
            <p id="wd-usd"></p>
            <input id="wd-addr" type="text" autocomplete="off" placeholder="FaucetPay email">
            <div class="err" id="wd-err"></div>
            <button class="btn" id="wd-go">SUBMIT WITHDRAWAL</button></div>`;
          const upd = () => { const a = parseInt($('#wd-amt').value, 10) || 0; $('#wd-usd').innerHTML = `You get: <b style="color:#6df3ff">$${(a / cfg.coinsPerDollar).toFixed(2)}</b>`; };
          upd(); $('#wd-amt').oninput = upd;
          const pick = (m) => { method = m; $('#m-fp').classList.toggle('on', m === 'faucetpay'); $('#m-ltc').classList.toggle('on', m === 'litecoin'); $('#wd-addr').placeholder = m === 'faucetpay' ? 'FaucetPay email' : 'Litecoin wallet address'; };
          $('#m-fp').onclick = () => pick('faucetpay'); $('#m-ltc').onclick = () => pick('litecoin');
          $('#wd-go').onclick = async () => {
            const amount = parseInt($('#wd-amt').value, 10), address = $('#wd-addr').value.trim(), err = $('#wd-err');
            if (!(amount >= cfg.minWithdraw)) { err.textContent = 'Minimum withdraw is ' + fmt(cfg.minWithdraw) + ' coins'; return; }
            if (amount > me.coins) { err.textContent = 'Not enough coins'; return; }
            if (!address) { err.textContent = method === 'faucetpay' ? 'Enter your FaucetPay email' : 'Enter your Litecoin address'; return; }
            $('#wd-go').disabled = true;
            try {
              const r = await api('/api/withdraw', { amount, method, address });
              const st2 = await api('/api/state'); applyServer(st2);
              openSheet(`<div class="panel center"><h2>REQUEST SENT</h2><div class="big">$${r.withdrawal.usd.toFixed(2)}</div><p>${fmt(r.withdrawal.amount)} coins deducted. Status: <b>PENDING</b>.</p><p>${r.message}</p><button class="btn" id="ok">OK</button></div>`, () => { $('#ok').onclick = closeSheet; }, true);
            } catch (e) { err.textContent = e.message; $('#wd-go').disabled = false; }
          };
        }
      });
    };
    render();
  }

  function openProfile() {
    const r = me.referral;
    openSheet(`<div class="panel"><h2>PROFILE</h2>
      <div class="card"><div class="row"><div class="kv">Player <b>${esc(me.name)}</b></div><div class="kv">Level <b>${me.level}</b></div></div>
        <div class="kv" style="margin-top:6px">Total score <b>${fmt(me.score)}</b> &middot; Rank <b>${lb.myRank ? '#' + lb.myRank : '-'}</b></div></div>
      <h3>INVITE FRIENDS</h3>
      <div class="card"><p>You earn <b style="color:#ffd23f">${cfg.referralBonus} coins</b> for every friend who joins with your link. They still get their own ${cfg.welcomeBonus} coin welcome bonus.</p>
        <div class="row" style="margin-top:8px"><div class="kv">Referrals <b>${r.count}</b></div><div class="kv">Earned <b style="color:#ffd23f">${fmt(r.earned)}</b></div></div>
        <div class="link" style="margin-top:10px">${esc(r.link)}</div>
        <div class="row" style="gap:8px"><button class="btn alt" id="cp">COPY LINK</button><button class="btn" id="sh">SHARE</button></div></div>
      ${isAdmin ? '<a class="btn alt" style="text-align:center;text-decoration:none;color:#fff" href="/admin.html">ADMIN: WITHDRAWALS</a>' : ''}</div>`, () => {
      $('#cp').onclick = async () => {
        try { await navigator.clipboard.writeText(r.link); toast('Link copied!'); }
        catch (e) { const t = document.createElement('textarea'); t.value = r.link; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Link copied!'); } catch (x) { toast('Long-press the link to copy'); } t.remove(); }
      };
      $('#sh').onclick = () => {
        const text = 'Play Candy Match with me and earn coins!';
        const u = 'https://t.me/share/url?url=' + encodeURIComponent(r.link) + '&text=' + encodeURIComponent(text);
        if (tg && tg.openTelegramLink) tg.openTelegramLink(u);
        else if (navigator.share) navigator.share({ title: 'Candy Match', text, url: r.link }).catch(() => {});
        else window.open(u, '_blank');
      };
    });
  }

  // ---------- wiring ----------
  $('#btnPlay').onclick = startLevel;
  $('#btnProfile').onclick = openProfile;
  $('#btnWallet').onclick = () => openWallet(false);
  document.querySelectorAll('.foot button').forEach(b => b.onclick = () => {
    const t = b.dataset.tab;
    if (t === 'home') { closeSheet(); } else if (t === 'boosters') openBoosters(); else openShop();
  });
  document.querySelectorAll('img[data-sprite]').forEach(i => { i.src = Sprites.url(i.dataset.sprite); });
  window.addEventListener('resize', sizeBoard);

  // ---------- boot ----------
  async function boot() {
    sizeBoard();
    if (!initData) { $('#fatal').hidden = false; $('#fatal').innerHTML = '<div>Open this game from Telegram:<br><b>t.me/candymatchs_bot</b></div>'; return; }
    try {
      const d = await api('/api/state' + (refParam ? '?ref=' + encodeURIComponent(refParam) : ''));
      cfg = d.config; isAdmin = d.isAdmin; applyServer(d);
      showDemo();
      if (me.daily.available) { openWallet(false); }
    } catch (e) {
      $('#fatal').hidden = false; $('#fatal').innerHTML = '<div>' + esc(e.message) + '</div>';
    }
  }
  boot();
})();
