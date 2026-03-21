/**
 * Multiplayer game API — Express + Socket.IO (Render + Vercel + Supabase).
 * Start: node server/index.js  (or npm start from repo root)
 */
const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const { config } = require("./config");
const { RoomManager } = require("./game/RoomManager");
const { createPersistLayer } = require("./db/persist");
const { isDbEnabled } = require("./db/supabase");
const { initSockets } = require("./socket");
const { healthHandler } = require("./controllers/healthController");
const { leaderboardHandler } = require("./controllers/leaderboardController");
const { initMultiplayer } = require("../mp-server");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

const dynamicCors = cors({
  origin(origin, cb) {
    const list = config.corsOrigins;
    if (!origin) return cb(null, true);
    if (list.includes("*")) return cb(null, true);
    if (list.includes(origin)) return cb(null, true);
    if (config.nodeEnv !== "production") return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
});

app.use(dynamicCors);
app.options("*", dynamicCors);

app.get("/health", healthHandler);
app.get("/api/leaderboard", leaderboardHandler);

if (process.env.SERVE_STATIC === "true") {
  const root = path.join(__dirname, "..");
  app.use(express.static(root, { index: "index.html" }));
  app.use((_req, res) => {
    res.sendFile(path.join(root, "index.html"));
  });
}

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      const list = config.corsOrigins;
      if (!origin) return cb(null, true);
      if (list.includes("*")) return cb(null, true);
      if (list.includes(origin)) return cb(null, true);
      if (config.nodeEnv !== "production") return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e5,
});

const persist = createPersistLayer();
const roomManager = new RoomManager({ io, persist });
initSockets(io, roomManager, persist);
/** Legacy 2-player queue matchmaking for the current Self-Sabotage Builder client (`mp:*` events). */
initMultiplayer(io);

const PORT = config.port;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${PORT} (${config.nodeEnv})`);
  console.log(`[server] database: ${isDbEnabled() ? "Supabase enabled" : "in-memory only (set SUPABASE_*) "}`);
  console.log(`[server] CORS origins: ${config.corsOrigins.join(", ")}`);
});
