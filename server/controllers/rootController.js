/**
 * GET / — Render/Vercel split: the game UI is not served here unless SERVE_STATIC=true.
 */
function rootHandler(_req, res) {
  res.json({
    ok: true,
    service: "self-sabotage-builder-api",
    message: "Self-Sabotage Builder HTTP API (auth + leaderboards). Serve the game from static hosting or SERVE_STATIC=true; use /health to verify.",
    endpoints: {
      health: "/health",
      leaderboard: "/api/leaderboard",
      leaderboardGlobal: "/api/leaderboard/global",
      authRegister: "/api/auth/register",
      authLogin: "/api/auth/login",
    },
  });
}

module.exports = { rootHandler };
