// End-to-end API test: real Telegram initData signing, coins, referrals, shop, levels, withdraw, admin.
process.env.BOT_TOKEN = '123456:TEST_TOKEN_for_unit_tests';
process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/cm-test-');
process.env.ADMIN_KEY = 'secret-admin';
process.env.ADMIN_IDS = '';
const assert = require('assert');
const { server } = require('../server/server');
const { signInitData } = require('../server/auth');
const store = require('../server/store');
const G = require('../shared/game-core');

let base;
async function call(user, method, path, body, extraHeaders, startParam) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
  if (user) headers['X-Telegram-Init-Data'] = signInitData({ id: user, first_name: 'U' + user }, process.env.BOT_TOKEN, startParam ? { start_param: startParam } : null);
  const r = await fetch(base + path, { method, headers, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
  return { status: r.status, data: await r.json() };
}
const state = (u, sp) => call(u, 'GET', '/api/state', null, null, sp);
let passed = 0;
const ok = (name, cond) => { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ok -', name); };

// greedy solver using the shared engine
function solve(level, seed, actionsOut) {
  const s = G.createState(level, seed);
  for (let guard = 0; guard < 80 && !s.over; guard++) {
    let best = null;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      if (r + dr > 5 || c + dc > 5) continue;
      const t = G.cloneState(s); const act = { t: 'swap', a: [r, c], b: [r + dr, c + dc] };
      if (G.applyAction(t, act).ok && (!best || t.score > best.score)) best = { score: t.score, act };
    }
    if (!best) break;
    G.applyAction(s, best.act); actionsOut.push(best.act);
  }
  return s;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;

  console.log('auth');
  ok('no auth -> 401', (await call(null, 'GET', '/api/state')).status === 401);
  const forged = await fetch(base + '/api/state', { headers: { 'X-Telegram-Init-Data': signInitData({ id: 5 }, 'WRONG:TOKEN') } });
  ok('wrong signature -> 401', forged.status === 401);

  console.log('welcome bonus + daily');
  let a = (await state(1001)).data;
  ok('welcome bonus is exactly 100', a.user.coins === 100);
  a = (await state(1001)).data; ok('welcome bonus only once', a.user.coins === 100);
  let d = await call(1001, 'POST', '/api/daily');
  ok('daily bonus +50', d.status === 200 && d.data.user.coins === 150);
  d = await call(1001, 'POST', '/api/daily');
  ok('daily bonus cannot be claimed twice', d.status === 400);
  ok('daily countdown present', (await state(1001)).data.user.daily.nextAt > Date.now() + 23 * 3600e3);

  console.log('referrals');
  ok('referral link uses user id', a.user.referral.link.includes('ref_1001'));
  let b = (await state(2002, 'ref_1001')).data;
  ok('new player gets own 100 welcome bonus', b.user.coins === 100);
  a = (await state(1001)).data;
  ok('inviter gets exactly 150', a.user.coins === 300 && a.user.referral.count === 1 && a.user.referral.earned === 150);
  await state(2002, 'ref_1001');
  ok('no second bonus for same new player', (await state(1001)).data.user.coins === 300);
  let self = (await state(3003, 'ref_3003')).data;
  ok('self referral gives nothing', self.user.coins === 100 && self.user.referral.count === 0);
  let late = (await state(1001, 'ref_2002')).data;
  ok('existing player cannot be referred later', late.user.coins === 300 && (await state(2002)).data.user.coins === 100);
  let ghost = (await state(4004, 'ref_999999')).data;
  ok('unknown referrer ignored, welcome still paid', ghost.user.coins === 100);

  console.log('shop');
  let r = await call(3003, 'POST', '/api/shop/buy', { item: 'bomb' });
  ok('not enough coins -> rejected, nothing given', r.status === 400 && /Not enough coins/.test(r.data.error) && (await state(3003)).data.user.boosters.bomb === 0 && (await state(3003)).data.user.coins === 100);
  r = await call(1001, 'POST', '/api/shop/buy', { item: 'hammer' });
  ok('hammer costs 80', r.data.user.coins === 220 && r.data.user.boosters.hammer === 1);
  for (const [item, price] of [['shuffle', 100], ['arrow', 120], ['plus5', 150], ['bomb', 200]]) {
    store.data().users['1001'].coins = 1000;
    r = await call(1001, 'POST', '/api/shop/buy', { item });
    ok(item + ' costs ' + price, r.data.user.coins === 1000 - price && r.data.user.boosters[item] === 1);
  }
  ok('unknown item rejected', (await call(1001, 'POST', '/api/shop/buy', { item: '__proto__' })).status === 400);

  console.log('levels + anti-cheat');
  store.data().users['1001'].coins = 0;
  let s = await call(1001, 'POST', '/api/level/start', { level: 1 });
  ok('level 1 starts', s.status === 200 && s.data.config.target === 300);
  const acts = []; const sim = solve(1, s.data.seed, acts);
  ok('solver wins level 1', sim.over === 'won');
  let f = await call(1001, 'POST', '/api/level/finish', { actions: acts });
  ok('win pays exactly 200 and unlocks level 2', f.data.won && f.data.reward === 200 && f.data.user.coins === 200 && f.data.user.level === 2);
  ok('cannot finish twice', (await call(1001, 'POST', '/api/level/finish', { actions: acts })).status === 400);
  ok('locked level cannot start', (await call(1001, 'POST', '/api/level/start', { level: 5 })).status === 400);
  s = await call(1001, 'POST', '/api/level/start', { level: 1 });
  const acts2 = []; solve(1, s.data.seed, acts2);
  f = await call(1001, 'POST', '/api/level/finish', { actions: acts2 });
  ok('replaying a cleared level pays nothing', f.data.won && f.data.reward === 0 && f.data.user.coins === 200 && f.data.user.level === 2);
  s = await call(1001, 'POST', '/api/level/start', { level: 2 });
  f = await call(1001, 'POST', '/api/level/finish', { actions: [] });
  ok('level not completed -> no pay', !f.data.won && f.data.reward === 0 && f.data.user.coins === 200);
  s = await call(1001, 'POST', '/api/level/start', { level: 2 });
  f = await call(1001, 'POST', '/api/level/finish', { actions: [{ t: 'swap', a: [0, 0], b: [0, 2] }] });
  ok('forged/illegal actions rejected', f.status === 400);
  s = await call(1001, 'POST', '/api/level/start', { level: 2 });
  f = await call(1001, 'POST', '/api/level/finish', { actions: [{ t: 'plus5' }] });
  ok('booster used without being spent is rejected', f.status === 400);
  s = await call(1001, 'POST', '/api/level/start', { level: 2 });
  const used = await call(1001, 'POST', '/api/booster/use', { type: 'hammer' });
  ok('booster use deducts from inventory immediately', used.status === 200 && used.data.user.boosters.hammer === 0);
  ok('cannot use a booster you do not own', (await call(1001, 'POST', '/api/booster/use', { type: 'hammer' })).status === 400);

  console.log('withdraw');
  r = await call(1001, 'POST', '/api/withdraw', { amount: 1000, method: 'faucetpay', address: 'a@b.com' });
  ok('below 100,000 rejected', r.status === 400 && /100,000/.test(r.data.error));
  store.data().users['1001'].coins = 250000;
  r = await call(1001, 'POST', '/api/withdraw', { amount: 300000, method: 'faucetpay', address: 'a@b.com' });
  ok('more than balance rejected', r.status === 400);
  r = await call(1001, 'POST', '/api/withdraw', { amount: 100000, method: 'faucetpay', address: 'not-an-email' });
  ok('bad email rejected', r.status === 400);
  r = await call(1001, 'POST', '/api/withdraw', { amount: 100000, method: 'litecoin', address: 'abc123' });
  ok('bad litecoin address rejected', r.status === 400);
  ok('failed withdrawals did not touch balance', (await state(1001)).data.user.coins === 250000);
  r = await call(1001, 'POST', '/api/withdraw', { amount: 100000, method: 'faucetpay', address: 'pay@example.com' });
  ok('FaucetPay withdraw: deducted now, pending, $1', r.status === 200 && r.data.user.coins === 150000 && r.data.withdrawal.status === 'pending' && r.data.withdrawal.usd === 1);
  r = await call(1001, 'POST', '/api/withdraw', { amount: 150000, method: 'litecoin', address: 'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL' });
  ok('Litecoin withdraw 150,000 = $1.50', r.status === 200 && r.data.withdrawal.usd === 1.5 && r.data.user.coins === 0);
  ok('withdraw history shows both as pending', (await state(1001)).data.withdrawals.length === 2 && (await state(1001)).data.withdrawals.every(w => w.status === 'pending'));
  r = await call(1001, 'POST', '/api/withdraw', { amount: 100000, method: 'litecoin', address: 'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL' });
  ok('cannot withdraw again with empty balance', r.status === 400);

  console.log('admin');
  ok('admin without key -> 403', (await call(null, 'GET', '/api/admin/withdrawals?status=pending')).status === 403);
  ok('admin wrong key -> 403', (await call(null, 'GET', '/api/admin/withdrawals', null, { 'X-Admin-Key': 'nope' })).status === 403);
  const K = { 'X-Admin-Key': 'secret-admin' };
  let list = await call(null, 'GET', '/api/admin/withdrawals?status=pending', null, K);
  ok('admin sees 2 pending', list.data.withdrawals.length === 2);
  const id = list.data.withdrawals[0].id;
  r = await call(null, 'POST', '/api/admin/withdrawals/paid', { id }, K);
  ok('admin marks paid', r.data.withdrawal.status === 'paid');
  ok('user sees Paid', (await state(1001)).data.withdrawals.find(w => w.id === id).status === 'paid');
  ok('cannot pay twice', (await call(null, 'POST', '/api/admin/withdrawals/paid', { id }, K)).status === 400);
  const other = list.data.withdrawals[1].id;
  r = await call(null, 'POST', '/api/admin/withdrawals/reject', { id: other }, K);
  ok('reject refunds the coins', r.data.withdrawal.status === 'rejected' && (await state(1001)).data.user.coins === store.data().withdrawals.find(w => w.id === other).amount);

  console.log('leaderboard');
  const lbd = (await state(1001)).data.leaderboard;
  ok('leaderboard shows YOU', lbd.top.some(x => x.me && x.name === 'YOU'));

  store.flush();
  console.log('\nALL ' + passed + ' CHECKS PASSED');
  server.close(); process.exit(0);
})().catch(e => { console.error('\n' + e.message); process.exit(1); });
