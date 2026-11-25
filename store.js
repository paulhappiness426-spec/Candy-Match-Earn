'use strict';
// Tiny JSON-file database. Node is single threaded and every mutation below is
// synchronous, so balance checks + deductions are atomic (no double spending).
// Data lives in DATA_DIR (mount a Render persistent disk there).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

let db = { users: {}, withdrawals: [], nextWithdrawalId: 1 };
let scheduled = false;

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch (e) {
      // keep the corrupt file for inspection instead of silently wiping money data
      fs.copyFileSync(FILE, FILE + '.corrupt-' + Date.now());
      throw new Error('db.json is corrupt: ' + e.message);
    }
  }
  db.users = db.users || {};
  db.withdrawals = db.withdrawals || [];
  db.nextWithdrawalId = db.nextWithdrawalId || (db.withdrawals.length + 1);
}

function flush() {
  scheduled = false;
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE); // atomic replace
}

function save() {
  if (scheduled) return;
  scheduled = true;
  setImmediate(flush);
}

function data() { return db; }

module.exports = { load, save, flush, data, DATA_DIR };
