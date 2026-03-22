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
const { rootHandler } = require("./controllers/rootController");
const { registerHandler, loginHandler } = require("./controllers/authController");
const { globalLeaderboardHandler, addGlobalPointsHandler, authJwt } = require("./controllers/globalLeaderboardController");
const { initMultiplayer } = require("../mp-server");
const { isOriginAllowed } = require("./utils/corsAllow");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

function corsOriginCallback(origin, cb) {
  const list = config.corsOrigins;
  const dev = config.corsDevBypass;
  if (isOriginAllowed(origin, list, { allowDevBypass: dev })) {
    return cb(null, true);
  }
  console.warn(`[cors] blocked origin: ${origin || "(none)"} — set CORS_ORIGIN on Render (add *.vercel.app for all Vercel URLs)`);
  cb(new Error(`CORS blocked: ${origin || "unknown"}`));
}

const dynamicCors = cors({
  origin: corsOriginCallback,
  credentials: true,
});

app.use(dynamicCors);
app.options("*", dynamicCors);

app.get("/health", healthHandler);
app.get("/api/leaderboard", leaderboardHandler);
app.get("/api/leaderboard/global", globalLeaderboardHandler);
app.post("/api/leaderboard/add-points", authJwt, addGlobalPointsHandler);
app.post("/api/auth/register", registerHandler);
app.post("/api/auth/login", loginHandler);

if (process.env.SERVE_STATIC === "true") {
  const root = path.join(__dirname, "..");
  app.use(express.static(root, { index: "index.html" }));
  app.use((_req, res) => {
    res.sendFile(path.join(root, "index.html"));
  });
} else {
  app.get("/", rootHandler);
}

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      corsOriginCallback(origin, cb);
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
