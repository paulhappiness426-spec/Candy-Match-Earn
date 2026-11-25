'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const { verifyInitData } = require('./auth');
const G = require('./game-core');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_USERNAME = process.env.BOT_USERNAME || 'candymatchs_bot';
const APP_SHORT_NAME = process.env.APP_SHORT_NAME || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === '1';

// ---- fixed economy (do not change) ----
const WELCOME_BONUS = 100;
const DAILY_BONUS = 50;
const LEVEL_REWARD = 200;
const REFERRAL_BONUS = 150;
const MIN_WITHDRAW = 100000;
const COINS_PER_DOLLAR = 100000;
const DAY_MS = 24 * 3600 * 1000;
const PRICES = { hammer: 80, shuffle: 100, arrow: 120, plus5: 150, bomb: 200 };

store.load();
const db = store.data();
const sessions = new Map(); // userId -> {level, seed, startedAt, used}

// ---- helpers ----
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (msg) => new HttpError(400, msg);

function send(res, code, body, headers) {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers));
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 200000) { reject(new HttpError(413, 'Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (e) { reject(bad('Invalid JSON')); } });
    req.on('error', reject);
  });
}
const buckets = new Map();
function rateLimit(key) {
  const now = Date.now();
  const b = buckets.get(key) || { t: now, n: 0 };
  if (now - b.t > 60000) { b.t = now; b.n = 0; }
  b.n++; buckets.set(key, b);
  if (b.n > 240) throw new HttpError(429, 'Too many requests, slow down');
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 120000) buckets.delete(k); }, 60000).unref();

function authenticate(req) {
  const raw = req.headers['x-telegram-init-data'] || '';
  if (ALLOW_DEV_AUTH && String(raw).startsWith('dev:')) {
    const [, id, name] = String(raw).split(':');
    if (!/^\d{1,15}$/.test(id || '')) throw new HttpError(401, 'bad dev id');
    return { id, name: (name || 'Player').slice(0, 40), username: null, photo: null, startParam: null };
  }
  if (!BOT_TOKEN) throw new HttpError(500, 'Server is missing BOT_TOKEN');
  const u = verifyInitData(raw, BOT_TOKEN);
  if (!u) throw new HttpError(401, 'Open this game from Telegram');
  return u;
}
const isAdminUser = (id) => ADMIN_IDS.includes(String(id));
function checkAdmin(req) {
  const key = String(req.headers['x-admin-key'] || '');
  if (ADMIN_KEY && key.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(ADMIN_KEY))) return;
  const raw = req.headers['x-telegram-init-data'];
  if (raw && ADMIN_IDS.length) { try { if (isAdminUser(authenticate(req).id)) return; } catch (e) { /* fall through */ } }
  throw new HttpError(403, 'Admin only');
}

// ---- users ----
function getOrCreateUser(tg, refParam) {
  let u = db.users[tg.id];
  let created = false;
  if (!u) {
    created = true;
    u = db.users[tg.id] = {
      id: tg.id, name: tg.name, username: tg.username, photo: tg.photo, createdAt: Date.now(),
      coins: WELCOME_BONUS, level: 1, score: 0,
      boosters: { hammer: 0, arrow: 0, bomb: 0, shuffle: 0, plus5: 0 },
      lastDaily: 0, referredBy: null, refCount: 0, refEarned: 0
    };
    const m = /^ref_(\d{1,15})$/.exec(String(refParam || ''));
    const refId = m ? m[1] : null;
    if (refId && refId !== tg.id && db.users[refId]) {
      u.referredBy = refId; // set once, at creation only => bonus can never be paid twice for the same player
      const r = db.users[refId];
      r.coins += REFERRAL_BONUS; r.refCount += 1; r.refEarned += REFERRAL_BONUS;
    }
  } else {
    if (tg.name && u.name !== tg.name) u.name = tg.name;
    if (tg.photo) u.photo = tg.photo;
  }
  if (created) store.save();
  return u;
}

function referralLink(id) {
  return APP_SHORT_NAME
    ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}?startapp=ref_${id}`
    : `https://t.me/${BOT_USERNAME}?startapp=ref_${id}`;
}
function leaderboard(meId) {
  const all = Object.values(db.users).filter(u => u.score > 0).sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  const top = all.slice(0, 3).map((u, i) => ({ rank: i + 1, name: u.id === meId ? 'YOU' : String(u.name).toUpperCase(), score: u.score, me: u.id === meId }));
  const idx = all.findIndex(u => u.id === meId);
  return { top, myRank: idx >= 0 ? idx + 1 : null };
}
function publicUser(u) {
  const nextDaily = u.lastDaily + DAY_MS;
  return {
    id: u.id, name: u.name, photo: u.photo, coins: u.coins, level: u.level, score: u.score, boosters: u.boosters,
    daily: { available: Date.now() >= nextDaily, nextAt: nextDaily },
    referral: { link: referralLink(u.id), count: u.refCount, earned: u.refEarned }
  };
}
function stateFor(u) {
  return {
    user: publicUser(u),
    leaderboard: leaderboard(u.id),
    withdrawals: db.withdrawals.filter(w => w.userId === u.id).slice(-50).reverse().map(publicWithdrawal),
    isAdmin: isAdminUser(u.id),
    config: {
      prices: PRICES, minWithdraw: MIN_WITHDRAW, coinsPerDollar: COINS_PER_DOLLAR, levelReward: LEVEL_REWARD,
      welcomeBonus: WELCOME_BONUS, dailyBonus: DAILY_BONUS, referralBonus: REFERRAL_BONUS
    }
  };
}
function publicWithdrawal(w) {
  return { id: w.id, amount: w.amount, usd: w.usd, method: w.method, address: w.address, status: w.status, createdAt: w.createdAt, paidAt: w.paidAt || null };
}

// ---- withdraw validation ----
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const LTC_RE = /^(ltc1[02-9ac-hj-np-z]{38,87}|[LM3][1-9A-HJ-NP-Za-km-z]{25,34})$/;

// ---- route handlers ----
const routes = {};
routes['GET /api/health'] = async () => ({ ok: true });

routes['GET /api/state'] = async (ctx) => {
  const u = getOrCreateUser(ctx.tg, ctx.tg.startParam || ctx.query.get('ref'));
  return stateFor(u);
};

routes['POST /api/daily'] = async (ctx) => {
  const u = getOrCreateUser(ctx.tg);
  if (Date.now() < u.lastDaily + DAY_MS) throw bad('Daily bonus not ready yet');
  u.lastDaily = Date.now(); u.coins += DAILY_BONUS; store.save();
  return { user: publicUser(u), message: `+${DAILY_BONUS} coins` };
};

routes['POST /api/level/start'] = async (ctx) => {
  const u = getOrCreateUser(ctx.tg);
  const level = Number.isInteger(ctx.body.level) ? ctx.body.level : u.level;
  if (level < 1 || level > u.level) throw bad('Level is locked');
  const seed = crypto.randomInt(1, 2 ** 31);
  sessions.set(u.id, { level, seed, startedAt: Date.now(), used: { hammer: 0, bomb: 0, arrow: 0, shuffle: 0, plus5: 0 } });
  return { level, seed, config: G.levelConfig(level), user: publicUser(u) };
};

routes['POST /api/booster/use'] = async (ctx) => {
  const u = getOrCreateUser(ctx.tg);
  const s = sessions.get(u.id);
  const type = ctx.body.type;
  if (!s) throw bad('Start a level first');
  if (!PRICES[type]) throw bad('Unknown booster');
  if (!(u.boosters[type] > 0)) throw bad('You do not own this booster');
  u.boosters[type] -= 1; s.used[type] += 1; store.save();
  return { user: publicUser(u) };
};

routes['POST /api/level/finish'] = async (ctx) => {
  const u = getOrCreateUser(ctx.tg);
  const s = sessions.get(u.id);
  if (!s) throw bad('No active level');
  sessions.delete(u.id);
  const r = G.replay(s.level, s.seed, ctx.body.actions, s.used);
  if (!r.ok) throw bad('Level could not be verified (' + r.error + ')');
  const st = r.state;
  const won = st.over === 'won';
  u.score += st.score;
  let reward = 0;
  const alreadyCleared = won && s.level < u.level; // replaying an old level pays nothing
  if (won && s.level === u.level) { reward = LEVEL_REWARD; u.coins += reward; u.level += 1; }
  store.save();
  return { won, score: st.score, reward, alreadyCleared, user: publicUser(u), leaderboard: leaderboard(u.id) };
};

routes['POST /api/shop/buy'] = async (ctx) => {
  const u = getOrCreateUser(ctx.tg);
  const item = ctx.body.item;
  if (!Object.prototype.hasOwnProperty.call(PRICES, item)) throw bad('Unknown item');
  if (u.coins < PRICES[item]) throw bad('Not enough coins');
  u.coins -= PRICES[item]; u.boosters[item] += 1; store.save();
  return { user: publicUser(u) };
};

routes['POST /api/withdraw'] = async (ctx) => {
  const u = getOrCreateUser(ctx.tg);
  const { amount, method } = ctx.body;
  const address = String(ctx.body.address || '').trim();
  if (!Number.isInteger(amount)) throw bad('Enter a valid amount');
  if (amount < MIN_WITHDRAW) throw bad(`Minimum withdraw is ${MIN_WITHDRAW.toLocaleString('en-US')} coins`);
  if (amount > u.coins) throw bad('Not enough coins');
  if (method === 'faucetpay') { if (!EMAIL_RE.test(address)) throw bad('Enter a valid FaucetPay email'); }
  else if (method === 'litecoin') { if (!LTC_RE.test(address)) throw bad('Enter a valid Litecoin address'); }
  else throw bad('Choose FaucetPay or Litecoin');
  u.coins -= amount;
  const w = { id: db.nextWithdrawalId++, userId: u.id, userName: u.name, amount, usd: Math.round(amount / COINS_PER_DOLLAR * 100) / 100, method, address, status: 'pending', createdAt: Date.now() };
  db.withdrawals.push(w); store.save();
  return { user: publicUser(u), withdrawal: publicWithdrawal(w), message: 'Request received. Admin will pay within 24 hours.' };
};

routes['GET /api/leaderboard'] = async (ctx) => leaderboard(ctx.tg.id);

routes['GET /api/admin/withdrawals'] = async (ctx) => {
  checkAdmin(ctx.req);
  const status = ctx.query.get('status');
  const list = db.withdrawals.filter(w => !status || status === 'all' || w.status === status).slice().reverse();
  return { withdrawals: list };
};
routes['POST /api/admin/withdrawals/paid'] = async (ctx) => {
  checkAdmin(ctx.req);
  const w = db.withdrawals.find(x => x.id === ctx.body.id);
  if (!w) throw new HttpError(404, 'Not found');
  if (w.status !== 'pending') throw bad('Already ' + w.status);
  w.status = 'paid'; w.paidAt = Date.now(); store.save();
  return { withdrawal: w };
};
routes['POST /api/admin/withdrawals/reject'] = async (ctx) => {
  checkAdmin(ctx.req);
  const w = db.withdrawals.find(x => x.id === ctx.body.id);
  if (!w) throw new HttpError(404, 'Not found');
  if (w.status !== 'pending') throw bad('Already ' + w.status);
  w.status = 'rejected'; w.paidAt = Date.now();
  if (db.users[w.userId]) db.users[w.userId].coins += w.amount; // refund
  store.save();
  return { withdrawal: w };
};

// ---- static files ----
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  let file;
  if (pathname === '/shared/game-core.js') file = path.join(__dirname, '..', 'shared', 'game-core.js');
  else {
    const rel = pathname === '/' ? '/index.html' : pathname;
    file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'Forbidden' });
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
    const handler = routes[req.method + ' ' + url.pathname];
    if (!handler) throw new HttpError(404, 'Not found');
    const ctx = { req, query: url.searchParams, body: req.method === 'POST' ? await readBody(req) : {} };
    if (!url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/health') {
      ctx.tg = authenticate(req);
      rateLimit(ctx.tg.id);
    } else if (url.pathname.startsWith('/api/admin/')) rateLimit('admin:' + (req.socket.remoteAddress || ''));
    send(res, 200, await handler(ctx));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log('Candy Match listening on :' + PORT));
  const bye = () => { try { store.flush(); } finally { process.exit(0); } };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
}
module.exports = { server };
