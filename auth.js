'use strict';
// Verifies Telegram Mini App initData (HMAC-SHA256 with the bot token).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const crypto = require('crypto');

const MAX_AGE_SECONDS = 3 * 24 * 3600;

function verifyInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string' || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push(k + '=' + v);
  pairs.sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;
  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch (e) { return null; }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return {
    id: String(user.id),
    name: String(user.first_name || user.username || 'Player').slice(0, 40),
    username: user.username ? String(user.username).slice(0, 40) : null,
    photo: typeof user.photo_url === 'string' && /^https:\/\//.test(user.photo_url) ? user.photo_url.slice(0, 400) : null,
    startParam: params.get('start_param') ? String(params.get('start_param')).slice(0, 64) : null
  };
}

// Builds a valid initData string (used by the automated tests only).
function signInitData(user, botToken, extra) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  for (const k of Object.keys(extra || {})) params.set(k, extra[k]);
  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push(k + '=' + v);
  pairs.sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));
  return params.toString();
}

module.exports = { verifyInitData, signInitData };
