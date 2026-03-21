const { getSupabase, isDbEnabled } = require("./supabase");

async function findAuthUserByUsername(usernameLower) {
  if (!isDbEnabled()) return null;
  const sb = getSupabase();
  const { data, error } = await sb.from("auth_users").select("id, username, password_hash").eq("username", usernameLower).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function createAuthUser(username, passwordHash) {
  if (!isDbEnabled()) return { ok: false, error: "DB_DISABLED" };
  const sb = getSupabase();
  const { data, error } = await sb.from("auth_users").insert({ username, password_hash: passwordHash }).select("id, username").single();
  if (error) {
    if (String(error.message || "").includes("duplicate") || error.code === "23505") return { ok: false, error: "USERNAME_TAKEN" };
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("row-level security") || error.code === "42501") {
      console.error("createAuthUser RLS/policy", error);
      return { ok: false, error: "DATABASE_POLICY" };
    }
    console.error("createAuthUser", error);
    return { ok: false, error: "INSERT_FAILED" };
  }
  return { ok: true, user: data };
}

async function addGlobalPoints(userId, delta) {
  if (!isDbEnabled()) return { ok: false, error: "DB_DISABLED" };
  const sb = getSupabase();
  const { data: cur, error: e1 } = await sb.from("global_player_stats").select("points").eq("user_id", userId).maybeSingle();
  if (e1) {
    console.error("addGlobalPoints read", e1);
    return { ok: false, error: "READ_FAILED" };
  }
  const base = cur && cur.points != null ? Number(cur.points) : 0;
  const next = Math.max(0, base + delta);
  const { error: e2 } = await sb
    .from("global_player_stats")
    .upsert({ user_id: userId, points: next, stats: {}, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (e2) {
    console.error("addGlobalPoints write", e2);
    return { ok: false, error: "WRITE_FAILED" };
  }
  return { ok: true, points: next };
}

async function fetchGlobalLeaderboard(limit = 50) {
  if (!isDbEnabled()) return [];
  const sb = getSupabase();
  const lim = Math.min(100, Math.max(1, limit));
  const { data: stats, error } = await sb.from("global_player_stats").select("user_id, points").order("points", { ascending: false }).limit(lim);
  if (error || !stats || !stats.length) {
    if (error) console.error("fetchGlobalLeaderboard", error);
    return [];
  }
  const ids = stats.map((s) => s.user_id);
  const { data: users, error: e2 } = await sb.from("auth_users").select("id, username").in("id", ids);
  if (e2) {
    console.error("fetchGlobalLeaderboard users", e2);
    return [];
  }
  const map = Object.fromEntries((users || []).map((u) => [u.id, u.username]));
  return stats.map((s, i) => ({
    rank: i + 1,
    username: map[s.user_id] || "?",
    points: Number(s.points) || 0,
  }));
}

module.exports = { findAuthUserByUsername, createAuthUser, addGlobalPoints, fetchGlobalLeaderboard };
