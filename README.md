# Candy Match (Telegram Mini App)

Match-3 game with coins, boosters, referrals, daily bonus and real withdrawal requests.
Backend + frontend in one Node service, **no npm packages to install**.

## Deploy on Render

1. Put this folder in a GitHub repo.
2. Render dashboard -> **New -> Blueprint** -> pick the repo (it reads `render.yaml`).
3. When asked, set:
   - `BOT_TOKEN` = token from @BotFather for `candymatchs_bot`
   - `ADMIN_KEY` = a long random password (used on the admin page)
4. Deploy. Your URL will look like `https://candy-match.onrender.com`.

**Important:** the `starter` plan + disk in `render.yaml` is what keeps coins and withdrawals saved.
On Render's free plan the disk is wiped on every restart/deploy, so players would lose their coins.

## Connect it to the bot (@BotFather)

1. `/mybots` -> candymatchs_bot -> **Bot Settings -> Configure Mini App** (Main Mini App) -> enable -> paste your Render URL.
   Referral links then work as `https://t.me/candymatchs_bot?startapp=ref_<userId>`.
2. Alternative to the Main Mini App: `/newapp`, give it a short name (e.g. `play`) and set
   the env var `APP_SHORT_NAME=play` on Render. Links become `https://t.me/candymatchs_bot/play?startapp=ref_<id>`.
3. Open the bot in Telegram and launch the game.

## Admin (pay withdrawals)

Open `https://YOUR-URL/admin.html`, enter `ADMIN_KEY`. You see pending withdrawals with the
FaucetPay email / Litecoin address. Pay them yourself, then press **Mark paid**
(or **Reject + refund** to return the coins). Optional: set `ADMIN_IDS=123456789` (your Telegram id)
to also see an Admin button in the in-game Profile.

## Rules built in

| Item | Value |
|---|---|
| Welcome bonus | 100 coins, once |
| Daily bonus | 50 coins every 24h (countdown shown) |
| Level complete | 200 coins, first time each level is cleared |
| Referral | inviter +150, new player still gets 100; no self-referral, never paid twice |
| Shop | Hammer 80 · Shuffle 100 · Arrow 120 · +5 Moves 150 · Bomb 200 |
| Withdraw | min 100,000 coins, 100,000 coins = $1, FaucetPay or Litecoin |

Prices and bonuses live in `server/server.js` (top of file). Level targets/moves are in
`levelConfig()` in `shared/game-core.js`.

## How cheating is prevented

The server hands out the level seed, and the player's moves are **replayed on the server** with the same
engine. Coins are only paid if the replay really reaches the target. Boosters are taken from the inventory
on the server the moment they are used. Telegram login data is verified with your bot token.

## Run locally

```
npm run dev          # http://localhost:3000/?dev=1&name=Test   (dev login, no Telegram needed)
npm test             # 49 backend checks
node tests/balance.js  # level difficulty simulation
```

## Notes

- Data is a JSON file in `DATA_DIR` (fine for thousands of players; move to Postgres if you grow far beyond that).
- Withdrawals are paid manually by you; the game never sends crypto by itself.
