# Self-Sabotage Builder

**Organization:** NeuroGlitch · **© 2026 NeuroGlitch. All Rights Reserved.**

Single-player canvas game: **build** a level, then **play** it while hidden **sabotage** rules activate for each run (seeded, consistent per run). Local profiles, saved levels, and a **local leaderboard** stay in the browser. Optional **accounts** and the **global leaderboard** use **Supabase** from the browser (no separate game API).

---

## Project overview

- **Frontend:** `index.html`, `style.css`, `script.js`, `supabase-config.js`, `@supabase/supabase-js` (CDN) — static files only.
- **Optional:** `server/` provides Express (auth, leaderboards) and **Socket.IO** multiplayer when you run with `SERVE_STATIC=true`. For Render deployments, this repo includes `render.yaml`, `Dockerfile`, and `.dockerignore` — see [Deploy on Render](#deploy-on-render).
- **Typical production split:** **Vercel** (or Netlify / itch) serves the static game; **Render** runs the multiplayer backend only. Set `SSB_MULTIPLAYER_URL` in `multiplayer-config.js` to your Render backend `https://` URL.

---

## Features (single-player)

- Build mode with tile palette, budgets, and validation (including a single required **checkpoint** for respawns).
- Play mode with sabotage (platforms, spikes, pads, hex, lava, etc.) — seeded per run, consistent within a run.
- **Tutorial** tab: five short built-in levels (spikes, pads, hex, lava, platforms) with gentler sabotage; optional card in the player menu.
- **Editor tools:** undo/redo (Ctrl+Z / Ctrl+Y), copy-paste regions (Alt-drag + Ctrl+C / Ctrl+V), **test spawn** (Shift+click a solid tile, then Play on your own level).
- **Share levels:** **Levels → Export JSON** (clipboard) / **Import JSON** (file). **Draft** auto-saves the grid to `localStorage`; **Restore draft** reloads it.
- **Feel:** parallax backdrop, edge tint on lethal hits / checkpoint respawn, win burst particles + layered SFX, footstep/land variants, ambient **duck** on big moments.
- **Optional challenges** on the start screen (no double-jump, death budget) — shown as medals on the win overlay.
- **Featured** sample layouts in the Levels modal (quick load into the editor).
- Built-in Easy/Medium/Hard levels, random generator, save/load per local player.
- Local leaderboard + optional global leaderboard when signed in and Supabase is configured (`supabase-config.js` + `leaderboard` table).
- Themes, backgrounds, procedural audio, keybinds, debug overlay, larger touch targets in mobile mode.

**Optional multiplayer:** Socket.IO rooms (create/join code, chat, level push, ghost positions, host-synced restart seeds). **Same origin:** `SERVE_STATIC=true npm start` locally or host everything on Render. **Vercel + Render:** keep playing on Vercel; set `SSB_MULTIPLAYER_URL` in `multiplayer-config.js` to your Render `https://…` URL so only the backend handles realtime traffic.

---

## Controls

- **Move:** WASD or arrow keys · **Jump:** W / Up / Space  
- **Build:** left-click place, right-click erase (or Eraser tile)  
- **Undo / redo:** Ctrl+Z · Ctrl+Y (or Ctrl+Shift+Z)  
- **Selection / paste:** Alt-drag to select, Ctrl+C, Ctrl+V at hover cell  
- **Test spawn:** Shift+click a walkable tile (custom build only)  
- **Mobile:** pick **Mobile** in the device prompt, then on-screen **Left / Right / Jump** (larger hit targets)  
- **Hotkeys:** see **Settings → Keybinds** (e.g. build/play toggle, restart, levels, settings)

---

## Itch.io / embed

This game is a static front end. To publish on [itch.io](https://itch.io/), zip the playable files (at minimum `index.html`, `style.css`, `script.js`, `supabase-config.js`, and the `assets/` folder if you use the default backdrop). Choose **HTML** and enable **Play in browser**. Fill in `supabase-config.js` with your project URL and **anon** key so sign-in and the global leaderboard work from the browser.

---

## Screenshots

Add a PNG or GIF of build mode and play mode to your store page or this repo when you are ready; the canvas is fixed at 960×576 for consistent captures.

---

## How to run

Serve the project root over **http** (any static server). Examples:

```bash
npx --yes serve .
```

Or open via your host (Vercel, Netlify, itch). The game does not require a Node API for auth or leaderboard.

Optional: `npm install` / `npm start` runs the Express API; use **`SERVE_STATIC=true npm start`** when you want multiplayer (game + Socket.IO on the same origin). Otherwise the API alone is enough for auth/leaderboard experiments.

---

## Performance (web client)

- One **`requestAnimationFrame`** loop; **no `setInterval`** game tick.
- **`deltaTime`** clamped for stable physics; **update** (logic) then **render** (canvas draw) in the same frame.
- Jump-pad delays use in-game scheduled events instead of `setTimeout`.
- Collision resolution uses short **multi-pass** separation to reduce fall-through on stacked tiles.
- Particle pool capped so bursts cannot grow without bound; build draft saves are debounced (500ms).

---

## Supabase configuration (`supabase-config.js`)

- **`window.SUPABASE_URL`:** your project URL (Dashboard → Settings → API).
- **`window.SUPABASE_ANON_KEY`:** the **anon public** key only.

Create the `leaderboard` table and RLS policies using `supabase/leaderboard_setup.sql` (or your own schema with a `score` column for ordering).

Never put the Supabase **service_role** key in the browser or in this file.

---

## Deploy on Render

Host the **full game** (HTML/CSS/JS), **REST API**, and **Socket.IO** on one HTTPS URL (e.g. `https://your-app.onrender.com`).

This repo includes a **`render.yaml`** Blueprint so Render can create and run the service with minimal manual setup.

**Two layouts:**

| Where the game loads | Multiplayer | What to do |
|----------------------|------------|------------|
| **Render only** (`https://your-app.onrender.com`) | Same Render app | Leave **`multiplayer-config.js`** as default (empty URL). |
| **Vercel** (or itch, Netlify) | **Render** handles Socket.IO | Deploy Render as below, then in **`multiplayer-config.js`** set your Render URL (see [Vercel + Render](#vercel--render-multiplayer-on-render)). |

### What you need

1. A [Render](https://render.com) account.
2. This repository pushed to GitHub/GitLab/Bitbucket.

### Deploy with Blueprint (`render.yaml`)

1. In Render, choose **New +** → **Blueprint**.
2. Connect this repository.
3. Confirm the service settings from `render.yaml`.
4. Create the Blueprint and wait for build/deploy.

Render installs dependencies, runs `node server/index.js`, and sets `SERVE_STATIC=true` so Express serves `index.html` and static assets.

When it finishes, open:

`https://<your-app-name>.onrender.com`

You should see the game. Check **`https://<your-app-name>.onrender.com/health`** — it should return JSON with `"ok": true`.

### Why this works (and what not to break)

- **`SERVE_STATIC=true`** (set in `render.yaml`) makes the server send the browser game from the same host as `/socket.io`, so multiplayer works without editing `multiplayer-config.js`.
- Render sets **`PORT`** for you; the server reads `PORT` in `server/config.js`.
- Free plans can sleep when idle. If realtime stability matters, use a paid plan or keep traffic warm.
- **CORS:** defaults include **`*.onrender.com`** and **`*.vercel.app`**. For custom domains, set `CORS_ORIGIN` in Render environment variables.

### Vercel + Render (multiplayer on Render)

Use this when **Vercel serves the static game** and **Render runs multiplayer** (Socket.IO + the same Node server).

1. **Deploy Render** once. Note your app URL, e.g. `https://your-app.onrender.com`.
2. **Deploy the same static files to Vercel** (`index.html`, `script.js`, `style.css`, `assets/`, `supabase-config.js`, etc.).
3. In **`multiplayer-config.js`**, uncomment the line and set your Render URL:

   ```js
   w.SSB_MULTIPLAYER_URL = "https://your-app.onrender.com";
   ```

   (Or set `window.SSB_MULTIPLAYER_URL` in a small inline script **before** `multiplayer-config.js` in `index.html` if you prefer not to edit the file in the repo.)

4. **Redeploy Vercel** so the change goes live.

The browser will load the game from **Vercel** but connect multiplayer to **Render**. No change to Vercel’s build settings is required.

**Custom domain on Vercel** (e.g. `game.example.com`): add that exact `https://…` origin to `CORS_ORIGIN` in Render — `*.vercel.app` alone does not cover custom domains.

### Supabase (optional)

- The **browser** still uses `supabase-config.js` (anon key only) for sign-in and the global leaderboard.
- **DO NOT** put Supabase **service role** keys (often shown as `sb_secret_...` or a long JWT) into `supabase-config.js`, Vercel, or client-side JavaScript. Treat it like a password.
- You only need Supabase secrets on Render **if** your Node server is intentionally calling Supabase as an admin (service role) for server-side routes. If you are using Render **only for multiplayer**, you typically do **not** need any Supabase secrets on Render.
- If you do use **server-side** Supabase (service role) for API routes, set secrets in Render Environment Variables (never commit them):
  - `SUPABASE_URL=https://xxxx.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key` (server-only)

### If the game is on itch.io (or another static host) but multiplayer is on Render

1. Deploy the **backend** on Render as above.
2. Zip and upload the **static** game to itch (or host on Netlify, etc.).
3. In **`multiplayer-config.js`**, set:

   `window.SSB_MULTIPLAYER_URL = "https://your-app.onrender.com";`

4. Add your **itch / Netlify URL** to `CORS_ORIGIN` in Render if the browser blocks API calls.

### Troubleshooting

- **502 / connection refused:** check Render deploy logs and verify `/health`.
- **Multiplayer delay after inactivity:** service may be waking from sleep on free plan.
- **CORS errors in console (custom domain or itch):** add exact `https://…` origins to `CORS_ORIGIN` and redeploy.

### Can't connect to Render? (easy step-by-step)

Use this checklist in order. Do not skip steps.

#### 1) Confirm your Render app is actually running

1. Open your Render URL in browser:
   - `https://your-app.onrender.com`
2. Open:
   - `https://your-app.onrender.com/health`
3. You should get JSON that includes:
   - `"ok": true`

If `/health` does not work, your backend is not ready yet. Fix this first before testing multiplayer.

#### 2) Make sure the URL is correct (most common issue)

- URL must start with `https://`
- No trailing slash needed (use `https://your-app.onrender.com`)
- No typo in app name
- Do not use internal Render URL from logs; use the public `.onrender.com` URL

Wrong:
- `http://your-app.onrender.com`
- `https://your-app.onrender.com/`
- `your-app.onrender.com` (missing protocol)

Right:
- `https://your-app.onrender.com`

#### 3) Pick your setup and configure only that setup

**A) Game and backend both on Render**
- Keep `multiplayer-config.js` default (empty URL).
- `SERVE_STATIC=true` must be set in Render (Blueprint already does this).

**B) Game on Vercel/itch/Netlify, backend on Render**
- In `multiplayer-config.js`, set:
  - `window.SSB_MULTIPLAYER_URL = "https://your-app.onrender.com";`
- Redeploy the static host after editing this.

If this value is missing or wrong, the game tries to connect to the wrong place.

#### 4) Fix CORS if browser blocks requests

If browser console shows CORS errors:

1. In Render, open Environment Variables.
2. Set `CORS_ORIGIN` with your exact frontend origin(s), comma-separated.
3. Include full protocol and domain, for example:
   - `https://your-site.vercel.app`
   - `https://game.example.com`
4. Redeploy.

Important:
- `*.vercel.app` does not automatically cover your custom domain.
- Add the exact custom domain too.

#### 5) Check Render environment variables

At minimum, verify:
- `SERVE_STATIC=true` (for full game on Render)
- `NODE_ENV=production` (recommended)

Do not manually set `PORT` on Render unless you know why. Render provides `PORT` automatically.

#### 6) If Supabase login/leaderboard fails (but Render is up)

This is usually separate from Render connectivity.

Check:
- `supabase-config.js` has correct:
  - `window.SUPABASE_URL`
  - `window.SUPABASE_ANON_KEY` (anon key only)
- Never use service role key in browser files.

#### 7) Free plan sleep behavior

If first request is slow or socket takes time after idle, your service may be waking up. This is normal on free plans.

#### Quick test flow (30 seconds)

1. Open `https://your-app.onrender.com/health` -> must return `"ok": true`
2. Open game
3. Open browser DevTools Console
4. Try Create Room / Join Room
5. If error appears:
   - `CORS` -> fix `CORS_ORIGIN`
   - `ERR_CONNECTION` / `502` -> check Render deploy logs and service status
   - `404` on wrong host -> fix `SSB_MULTIPLAYER_URL`

If you still cannot connect, collect these 3 items and debug from there:
- Your frontend URL (where game is hosted)
- Your Render backend URL
- Exact browser console error message

---

## Deploy notes (other hosts)

- **Static site only (Vercel, Netlify, itch):** deploy the static assets and set `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `supabase-config.js`. Add your site URL under **Authentication → URL configuration** in Supabase if you use email links or redirects. For multiplayer, point `multiplayer-config.js` at a Fly (or other) Node server as above.

---

© 2026 NeuroGlitch. All Rights Reserved. Unauthorized copying, redistribution, or reproduction is strictly prohibited.
