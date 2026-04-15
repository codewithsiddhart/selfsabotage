
(function () {
  var w = typeof window !== "undefined" ? window : null;
  if (!w) return;

  // --- Vercel (or itch) frontend + Render multiplayer: uncomment and set your Render URL ---
  // w.SSB_MULTIPLAYER_URL = "https://your-app.onrender.com";

  // Default: keep empty to use the same origin (Render monolith / local SERVE_STATIC=true).
  // For Vercel frontend + Render multiplayer, set your Render backend URL here (no trailing slash).
  if (typeof w.SSB_MULTIPLAYER_URL !== "string") w.SSB_MULTIPLAYER_URL = "https://selfsabotage.onrender.com";
})();



