# Self-Sabotage Builder

**Organization:** NeuroGlitch  
**© 2026 NeuroGlitch. All Rights Reserved.**

NeuroGlitch is an independent game development and software initiative. This project and the game *Self-Sabotage Builder* are the intellectual property of NeuroGlitch. Founders: Siddharth (Discord: perfect_humann), Harshit (Discord: mehuman123). All rights reserved.

---

## Project overview

**Self-Sabotage Builder** is a competitive platformer where players **build levels** and **play** them with **sabotage** mechanics—tiles behave consistently per run, but not always in your favor. The game supports **local profiles**, a **local leaderboard**, and **online 2-player multiplayer** (Socket.IO) for matches over the internet when you share a public URL (e.g. via ngrok).

---

## Features

- **Build mode** — Place tiles; sabotage profiles stay hidden until play.
- **Play mode** — Reach the goal while sabotage, hazards, and timing matter.
- **Sabotage system** — Seeded per run; intensity configurable in Settings.
- **Hammer hazard** — Drops during play on levels that use the hammer rule (built-in IDs and multiplayer shared levels).
- **Powerups** — Double jump, speed boost, protection (built-in levels only, local progression).
- **Local profiles + leaderboard** — Per-browser saves and rankings.
- **Multiplayer mode** — Real-time **2-player** matches: alternating build/play rounds, shared **hard** finale, scores, rematch voting.

---

## Installation

```bash
npm install
```

---

## Running the server

```bash
npm start
```

Default URL: **http://localhost:3000** (or the port printed in the terminal).

The game is meant to be opened through this server so **Socket.IO** and static assets load correctly. Opening `index.html` directly (`file://`) works for offline play but **not** for multiplayer.

---

## ngrok deployment (primary method for sharing)

Use **ngrok HTTP** to expose your local server. This is ideal for **testing** and playing with a friend using a public **HTTPS** link.

### Steps

1. **Install ngrok** from [ngrok.com](https://ngrok.com/) and ensure it is on your `PATH`.
2. **Add your auth token** (from the ngrok dashboard):

   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```

3. **Start the game server** (from this project folder):

   ```bash
   npm start
   ```

4. **Start an HTTP tunnel** to the same port (default **3000**):

   ```bash
   ngrok http 3000
   ```

5. Copy the **HTTPS** URL ngrok prints (for example `https://xxxx.ngrok-free.app`) and open it in the browser. Share that URL with your opponent so both players load the **same origin**; multiplayer will connect to the same host.

### Notes

- Use the generated public **HTTPS** URL for sharing.
- **Free ngrok URLs change** when you restart the tunnel unless you use a paid reserved domain.
- Treat this as **testing / demos**, not production hosting.
- Both players should use the **ngrok HTTPS URL** (not `localhost` on one side and ngrok on the other) so the Socket.IO client connects correctly.

---

## Controls

- **Desktop:** **WASD** or **arrow keys** to move, **Space** / **W** / **Up** to jump, **R** restart (disabled during online match play), **B** / **P** build/play toggle where allowed.
- **Mobile:** On-screen **Left**, **Right**, and **Jump** after choosing Mobile in the device prompt.

---

## Multiplayer overview

- From **Welcome**, pick a profile, then **Find match**. When a second player queues, a **3-round** match starts. Tap **✕** on the queue screen to leave without playing.
- **Submitting your level (when you are the builder):** Stay in **Build** mode. Place **Start** and **Goal** so the level validates (green validation in the panel). Then press **Submit level** in the **left panel** (under Save Level). Do **not** use **Play** — that button is for normal solo runs; in multiplayer the opponent’s run starts after you submit.

- **Round 1:** Player A **builds** and **submits**; Player B **plays** that layout. If B **wins** (reaches the goal), B scores; if B **loses**, A scores.
- **Round 2:** Roles **swap** (B builds, A plays) with the same scoring rule.
- **Round 3:** Both players play the **same preconfigured hard level** (*No Mercy*) with a **timer**; faster, successful runs earn more points. The server resolves final scoring and any **speed tie-break** bonus when both finish.
- **Winner:** Highest **total** score wins. After the match, **Rematch** is offered: **both** must accept to play again; if **either** declines (or someone disconnects), you return to normal menus.

The **server** is the source of truth for the queue, match state, scores, and rematch. If a player **disconnects**, the match ends and the other player is notified.

---

## Offline play (no server)

You can still open `index.html` directly for single-player / local-only behavior, but multiplayer and ngrok workflows require `npm start`.

---

© 2026 NeuroGlitch. All Rights Reserved. Unauthorized copying, redistribution, or reproduction is strictly prohibited.
