# Self-Sabotage Builder

**Organization:** NeuroGlitch  
**© 2026 NeuroGlitch. All Rights Reserved.**

NeuroGlitch is an independent game development and software initiative. This project and the game *Self-Sabotage Builder* are the intellectual property of NeuroGlitch. Founders: Siddharth (Discord: perfect_humann), Harshit (Discord: mehuman123). All rights reserved.

---

## Project overview

**Self-Sabotage Builder** is a competitive platformer where players **build levels** and **play** them with **sabotage** mechanics. This repository includes:

- A **static frontend** (HTML/CSS/JS) suitable for **Vercel**.
- A **Node.js backend** on **Express** + **Socket.IO**, suitable for **Render**, with optional **Supabase** for match history and leaderboards.

**Free hosting (no billing card required for basic tiers):** [Vercel](https://vercel.com) (frontend), [Render](https://render.com) (Web Service free tier), [Supabase](https://supabase.com) (free database). Always check each provider’s current free-tier limits and policies.

---

## How to deploy (simple order)

Do these in order so you always have the URLs you need for the next step.

### Step A — Put the project on GitHub

1. Create a free account on [GitHub](https://github.com) and a **new repository**.
2. Upload this folder (or push with Git). You will connect **the same repo** to Vercel and Render.

---

### Step B — Supabase (database, optional)

Skip this if you only want multiplayer **without** saved leaderboards in the cloud.

1. Go to [supabase.com](https://supabase.com) → sign up → **New project** (wait until it finishes creating).
2. Open **SQL Editor** → **New query** → paste everything from `server/db/schema.sql` in this repo → **Run**.  
   (“Success. No rows returned” is expected; keys and URL come from the next step, not from this query.)
3. Open **Project Settings** (gear) → **API**:
   - Copy **Project URL** → you will put this in Render as `SUPABASE_URL`.
   - Copy the **service_role** key → put it in Render as `SUPABASE_SERVICE_ROLE_KEY` only.

**Important:** Never put `service_role` in Vercel, in `index.html`, or in `multiplayer-config.js`. It is **backend-only**.

---

### Step C — Vercel (your game website) — do this **before** Render CORS

1. Go to [vercel.com](https://vercel.com) → sign up with **GitHub**.
2. **Add New** → **Project** → **Import** the repo from Step A.
3. Leave defaults for a static site (no framework needed if `index.html` is at the root).
4. Click **Deploy**. When it finishes, copy your live URL, for example `https://something.vercel.app`. You need it in the next step.

---

### Step D — Render (multiplayer server)

1. Go to [render.com](https://render.com) → sign up (GitHub is easiest).
2. **New +** → **Web Service** → connect the **same** GitHub repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. **Environment** → add variables:

| Name | What to put |
|------|----------------|
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | Your **Vercel** URL from Step C (exact copy from the browser), e.g. `https://something.vercel.app`. For more than one URL, use commas **between** URLs with **no spaces**: `https://a.vercel.app,https://b.vercel.app` |
| `SUPABASE_URL` | From Supabase API settings (if you did Step B) |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase **service_role** (if you did Step B) |

5. **Create Web Service** and wait until status is **Live**.
6. Copy the service URL at the top, e.g. `https://your-api.onrender.com`.

**Check:** open `https://your-api.onrender.com/health` — you should see JSON with `"ok":true`.

**Note (free tier):** Render sleeps when idle; the first load after sleep can take ~30–60 seconds.

---

### Step E — Point the game at Render

1. Open `multiplayer-config.js` in this project.
2. Set your Render URL (no trailing slash):

   `window.MULTIPLAYER_SERVER_URL = "https://your-api.onrender.com";`

3. Commit and push to GitHub. Vercel will redeploy automatically.

For **local** play with `npm start`, keep it as `""` so the browser uses the same address as the page.

---

### Step F — Test

1. Open your **Vercel** link in two tabs (or send it to a friend).
2. Use **Find match** in the game. Traffic goes: **browser (Vercel)** → **Socket.IO (Render)**.

If connection fails:

- `multiplayer-config.js` must match your Render URL exactly (`https`, no `/` at the end).
- Render’s `CORS_ORIGIN` must match your Vercel URL exactly (including `https://`).
- Open Render `/health` once to wake the service, then try again.

### Render error: `Cannot find module '.../server/index.js'`

Render runs whatever is in **your GitHub repo**. This means the repo is missing the **`server/`** folder (or Render’s **Root Directory** points to a subfolder that doesn’t contain `server/`).

**Fix:**

1. On your PC, open the project that has `server/index.js` (full tree under `server/`).
2. Commit and **push** to the same repo Render uses, including at least:
   - `server/` (entire directory)
   - `mp-server.js` (root — required by `server/index.js`)
   - `package.json` (with `"start": "node server/index.js"`)
3. In GitHub, confirm you see `server/index.js` on the `main` branch.
4. Trigger **Manual Deploy** on Render (or push again).

If you use a **monorepo**, set Render’s **Root Directory** to the folder that contains `package.json` and `server/`.

---

## Backend architecture

| Layer | Role |
|--------|------|
| **In-memory** | Live rooms, lobby, rounds, positions, actions — **not** stored in Postgres during play. |
| **Supabase** | After a match ends: `users`, `rooms` (history row), `scores` (per-player totals + rank). Leaderboard is aggregated from `scores`. |
| **Server authority** | Round timers, phase transitions, and scoring for the generic room game run on the server. Clients cannot end rounds or set final scores. |

### Directory layout

```
server/
  index.js              # HTTP + Socket.IO bootstrap
  config.js             # Environment & game tuning
  socket/
    index.js
    handlers.js         # Socket events, rate limits
  controllers/
    healthController.js
    leaderboardController.js
  game/
    Room.js
    RoomManager.js
    GameSession.js      # Rounds + timers
    PlayerState.js
  db/
    supabase.js
    repositories.js
    persist.js
    schema.sql          # Run once in Supabase SQL Editor
  utils/
    validation.js
    rateLimit.js
    roomCode.js
mp-server.js            # Legacy 2-player queue (`mp:*`) for the current game client
```

### Dual real-time APIs

1. **Room-based API (new)** — `room:*`, `game:*`, `player:*` for custom lobbies, caps, and timed rounds. Use this when you build room UI on the frontend.
2. **Legacy matchmaking** — `mp:*` events from `mp-server.js` for the existing **Find match** flow in `script.js`.

Both run on the **same** Socket.IO server.

---

## Environment variables

Copy `.env.example` to `.env` for local development. On **Render**, set the same keys in the service **Environment** tab.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | On Render | Render injects this automatically. |
| `NODE_ENV` | Optional | `production` on Render. |
| `CORS_ORIGIN` | **Yes (prod)** | Comma-separated allowed origins, e.g. `https://your-app.vercel.app`. |
| `SUPABASE_URL` | Optional | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | **Server only.** Never expose in the browser or Vercel env for client code. |
| `GAME_MIN_PLAYERS` | Optional | Default `2`. |
| `GAME_MAX_PLAYERS_PER_ROOM` | Optional | Default `8` (max 32). |
| `ROUNDS_PER_MATCH` | Optional | Default `3`. |
| `ROUND_DURATION_MS` | Optional | Default `60000`. |
| `LOBBY_COUNTDOWN_MS` | Optional | Default `3000` after host starts. |
| `POSITION_UPDATE_MAX_PER_SEC` | Optional | Default `20` per socket. |
| `ACTION_UPDATE_MAX_PER_SEC` | Optional | Default `10` per socket. |
| `BASE_ROUND_SURVIVAL_POINTS` | Optional | Points added each round (server-side). |
| `SERVE_STATIC` | Optional | `true` to serve this repo’s `index.html` from the same process (local only). |

---

## Supabase setup (free)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Open **SQL Editor** and run the contents of `server/db/schema.sql` once.
   - **“Success. No rows returned”** is normal: this file creates tables, it does not return rows like a `SELECT`. It does **not** show your Project URL or keys here.
3. In **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` on Render only.

**Security:** Use the **service role** key only on the backend. Do **not** ship it to Vercel client bundles. Real-time gameplay does not query the DB; only match completion writes data.

If Supabase is not configured, the server still runs; `/api/leaderboard` returns `{ leaderboard: [], db: false }`.

---

## Local development

```bash
npm install
npm start
```

- Default port: `3000` (or `PORT` from env).
- Health check: `GET http://localhost:3000/health`
- Leaderboard: `GET http://localhost:3000/api/leaderboard?limit=50`

Entry points:

- `npm start` → `node server/index.js`
- `node server.js` → same as above

Open the game through a URL that matches your CORS settings. For multiplayer against the same machine, use the same origin (e.g. `SERVE_STATIC=true` or a static server on an allowed port).

---

## Deploy reference (short)

Full walkthrough: **[How to deploy (simple order)](#how-to-deploy-simple-order)** above.

- **Frontend → Render:** edit `multiplayer-config.js` → `window.MULTIPLAYER_SERVER_URL = "https://YOUR-SERVICE.onrender.com"`.
- **Render → allows your site:** `CORS_ORIGIN` must list your exact Vercel URL(s).
- **Render health check:** optional path `/health`.

For a **custom room/leaderboard client** (not the built-in Find match UI), connect Socket.IO to the same Render URL and pass `displayName` / `clientPublicId` in the `query` object as in the backend docs.

---

## Socket.IO — room API (summary)

Connect with optional query: `displayName`, `clientPublicId` (UUID).

| Event | Direction | Purpose |
|--------|-----------|---------|
| `connected` | server → client | `socketId`, `userId`, public `config`. |
| `room:create` | client → server | Create room; optional `maxPlayers`. Ack: `{ ok, room }`. |
| `room:join` | client → server | `{ code, displayName }`. Ack: `{ ok, room }`. |
| `room:leave` | client → server | Leave current room. |
| `room:state` | server → room | Full public room snapshot. |
| `game:start` | client → server | Host starts match (min players, lobby → countdown → rounds). |
| `game:event` | server → room | `round:started`, `round:ended`, `game:ended`, `game:aborted`. |
| `game:position` | client → server | `{ x, y, seq? }` — rate-limited; relayed as `player:position` to peers. |
| `game:action` | client → server | `{ type, meta? }` — validated, rate-limited; relayed as `player:action`. |
| `error:msg` | server → client | Validation / business errors if no ack callback. |

**Cheating note:** Final scores for the generic round loop are applied only in `GameSession` on the server. Position/action payloads are sanitized and throttled; game-specific win/loss should still be validated server-side when you add rules.

---

## Features (game)

- **Build mode** — Place tiles; sabotage profiles stay hidden until play.
- **Play mode** — Reach the goal while sabotage, hazards, and timing matter.
- **Local profiles + leaderboard** — Per-browser saves and rankings.
- **Multiplayer mode** — Legacy **2-player** queue (`mp:*`): alternating build/play rounds, shared finale, rematch. See earlier sections for the new **room** system.

---

## Controls

- **Desktop:** **WASD** or **arrow keys** to move, **Space** / **W** / **Up** to jump, **R** restart (disabled during online match play), **B** / **P** build/play toggle where allowed.
- **Mobile:** On-screen **Left**, **Right**, and **Jump** after choosing Mobile in the device prompt.

---

## ngrok (optional testing)

Use [ngrok](https://ngrok.com) to expose your local server over HTTPS. Free ngrok may require an account; check their current terms.

```bash
npm start
ngrok http 3000
```

---

## Offline play

You can open `index.html` directly for single-player / local-only behavior, but **Socket.IO** multiplayer requires a correct origin and server URL (local or deployed).

---

© 2026 NeuroGlitch. All Rights Reserved. Unauthorized copying, redistribution, or reproduction is strictly prohibited.
