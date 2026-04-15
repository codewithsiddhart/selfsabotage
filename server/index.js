
/**
 * Self-Sabotage Builder API — Express (auth + leaderboards + health) + Socket.IO multiplayer.
 * Start: node server/index.js  (or npm start from repo root)
 */
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const { config } = require("./config");
const { isDbEnabled } = require("./db/supabase");
const { healthHandler } = require("./controllers/healthController");
const { leaderboardHandler } = require("./controllers/leaderboardController");
const { rootHandler } = require("./controllers/rootController");
const { registerHandler, loginHandler } = require("./controllers/authController");
const { globalLeaderboardHandler, addGlobalPointsHandler, authJwt } = require("./controllers/globalLeaderboardController");
const { isOriginAllowed } = require("./utils/corsAllow");
const { setupMultiplayer } = require("./socket/multiplayer");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

function corsOriginCallback(origin, cb) {
  const list = config.corsOrigins;
  const dev = config.nodeEnv !== "production";
  if (isOriginAllowed(origin, list, { allowDevBypass: dev })) {
    return cb(null, true);
  }
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

const PORT = config.port;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOriginCallback,
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 20000,
});
setupMultiplayer(io);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${PORT} (${config.nodeEnv})`);
  console.log(`[server] database: ${isDbEnabled() ? "Supabase enabled" : "in-memory only (set SUPABASE_*) "}`);
  console.log(`[server] CORS origins: ${config.corsOrigins.join(", ")}`);
  console.log(`[server] multiplayer: Socket.IO attached`);
});
