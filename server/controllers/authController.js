const bcrypt = require("bcryptjs");
const { isDbEnabled } = require("../db/supabase");
const { findAuthUserByUsername, createAuthUser } = require("../db/authRepository");
const { signAuthToken } = require("../utils/jwt");
const { getSupabase } = require("../db/supabase");

function normalizeUsername(u) {
  return String(u || "")
    .trim()
    .toLowerCase()
    .slice(0, 32);
}

async function registerHandler(req, res) {
  if (!isDbEnabled()) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
  const username = normalizeUsername(req.body && req.body.username);
  const password = String((req.body && req.body.password) || "");
  if (!username || !password) return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  if (password.length < 8) return res.status(400).json({ ok: false, error: "PASSWORD_TOO_SHORT" });

  const hash = await bcrypt.hash(password, 10);
  const out = await createAuthUser(username, hash);
  if (!out.ok) {
    if (out.error === "USERNAME_TAKEN") return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });
    if (out.error === "DATABASE_POLICY")
      return res.status(503).json({ ok: false, error: "DATABASE_POLICY" });
    return res.status(500).json({ ok: false, error: out.error === "INSERT_FAILED" ? "INSERT_FAILED" : "REGISTER_FAILED" });
  }

  const sb = getSupabase();
  const { error: statsErr } = await sb.from("global_player_stats").upsert(
    { user_id: out.user.id, points: 0, stats: {}, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (statsErr) console.error("global_player_stats upsert after register", statsErr);

  const token = signAuthToken({ sub: out.user.id, u: username });
  return res.json({ ok: true, token, username });
}

async function loginHandler(req, res) {
  if (!isDbEnabled()) return res.status(503).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
  const username = normalizeUsername(req.body && req.body.username);
  const password = String((req.body && req.body.password) || "");
  if (!username || !password) return res.status(400).json({ ok: false, error: "INVALID_INPUT" });

  const row = await findAuthUserByUsername(username);
  if (!row || !row.password_hash) return res.status(401).json({ ok: false, error: "USER_NOT_FOUND" });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ ok: false, error: "WRONG_PASSWORD" });

  const token = signAuthToken({ sub: row.id, u: row.username });
  return res.json({ ok: true, token, username: row.username });
}

module.exports = { registerHandler, loginHandler };
