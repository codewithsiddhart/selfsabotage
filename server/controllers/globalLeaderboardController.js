const { verifyAuthToken } = require("../utils/jwt");
const { isDbEnabled } = require("../db/supabase");
const { fetchGlobalLeaderboard, addGlobalPoints } = require("../db/authRepository");

function authJwt(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : null;
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload || !payload.sub) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  req.authUserId = payload.sub;
  next();
}

async function globalLeaderboardHandler(req, res) {
  if (!isDbEnabled()) return res.json({ ok: true, leaderboard: [], db: false });
  const lim = parseInt(req.query.limit, 10);
  const rows = await fetchGlobalLeaderboard(Number.isFinite(lim) ? lim : 50);
  res.json({ ok: true, leaderboard: rows });
}

async function addGlobalPointsHandler(req, res) {
  if (!isDbEnabled()) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
  const raw = req.body && req.body.points;
  const delta = Math.trunc(Number(raw));
  if (!Number.isFinite(delta) || delta <= 0 || delta > 1500) {
    return res.status(400).json({ ok: false, error: "INVALID_POINTS" });
  }
  const out = await addGlobalPoints(req.authUserId, delta);
  if (!out.ok) return res.status(500).json({ ok: false, error: out.error });
  res.json({ ok: true, totalPoints: out.points });
}

module.exports = { globalLeaderboardHandler, addGlobalPointsHandler, authJwt };
