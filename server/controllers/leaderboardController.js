const { fetchLeaderboard } = require("../db/repositories");
const { isDbEnabled } = require("../db/supabase");

function leaderboardHandler(req, res) {
  if (!isDbEnabled()) {
    return res.json({ ok: true, leaderboard: [], db: false });
  }

  const raw = req.query.limit;
  const limit = raw != null ? parseInt(String(raw), 10) : 50;

  fetchLeaderboard(Number.isFinite(limit) ? limit : 50)
    .then((rows) => res.json({ ok: true, leaderboard: rows }))
    .catch((e) => {
      console.error(e);
      res.status(500).json({ ok: false, error: "LEADERBOARD_FAILED" });
    });
}

module.exports = { leaderboardHandler };
