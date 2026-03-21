/**
 * Centralized environment configuration (Render, local, Vercel frontend origin).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function parseList(v, fallback = []) {
  if (!v || typeof v !== "string") return fallback;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function intEnv(name, def) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) ? n : def;
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: intEnv("PORT", 3000),

  /** Comma-separated origins, e.g. https://my-app.vercel.app,https://*.vercel.app */
  corsOrigins: parseList(process.env.CORS_ORIGIN, [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ]),

  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  game: {
    minPlayers: Math.max(1, intEnv("GAME_MIN_PLAYERS", 2)),
    maxPlayersPerRoom: Math.min(32, Math.max(2, intEnv("GAME_MAX_PLAYERS_PER_ROOM", 8))),
    roundsPerMatch: Math.max(1, intEnv("ROUNDS_PER_MATCH", 3)),
    roundDurationMs: Math.max(5000, intEnv("ROUND_DURATION_MS", 60_000)),
    lobbyCountdownMs: Math.max(0, intEnv("LOBBY_COUNTDOWN_MS", 3000)),
    positionMaxPerSecond: Math.max(5, intEnv("POSITION_UPDATE_MAX_PER_SEC", 20)),
    actionMaxPerSecond: Math.max(2, intEnv("ACTION_UPDATE_MAX_PER_SEC", 10)),
    /** Server-side points per round (authoritative; tune for your game design). */
    baseRoundSurvivalPoints: Math.max(0, intEnv("BASE_ROUND_SURVIVAL_POINTS", 10)),
  },
};

module.exports = { config };
