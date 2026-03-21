/**
 * GET / — Render/Vercel split: the game UI is not served here unless SERVE_STATIC=true.
 */
function rootHandler(_req, res) {
  res.json({
    ok: true,
    service: "self-sabotage-builder-api",
    message:
      "This is the multiplayer API. Open your Vercel site to play; use /health to verify the server.",
    endpoints: {
      health: "/health",
      leaderboard: "/api/leaderboard",
    },
    socketio: { path: "/socket.io/" },
  });
}

module.exports = { rootHandler };
