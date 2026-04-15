const { getSupabase, isDbEnabled } = require("./supabase");

/**
 * Upsert a user row keyed by stable client_public_id (from browser localStorage).
 * @param {{ clientPublicId: string | null, displayName: string }} p
 * @returns {Promise<string | null>} user uuid
 */
async function upsertUser(p) {
  if (!isDbEnabled()) return null;
  const sb = getSupabase();
  if (!p.clientPublicId) return null;

  const { data: existing, error: selErr } = await sb
    .from("users")
    .select("id, display_name")
    .eq("client_public_id", p.clientPublicId)
    .maybeSingle();

  if (selErr) {
    console.error("upsertUser select", selErr);
    return null;
  }

  if (existing && existing.id) {
    if (existing.display_name !== p.displayName) {
      const { error: upErr } = await sb
        .from("users")
        .update({ display_name: p.displayName })
        .eq("id", existing.id);
      if (upErr) console.error("upsertUser update name", upErr);
    }
    return existing.id;
  }

  const { data: inserted, error: insErr } = await sb
    .from("users")
    .insert({
      client_public_id: p.clientPublicId,
      display_name: p.displayName,
    })
    .select("id")
    .single();

  if (insErr) {
    console.error("upsertUser insert", insErr);
    return null;
  }
  return inserted?.id || null;
}

/**
 * Persist finished match: rooms row + scores rows. Not used for live gameplay.
 * @param {object} opts
 * @param {string} opts.roomCode
 * @param {string} opts.serverRoomId
 * @param {number} opts.maxPlayers
 * @param {Array<{ userId: string | null, displayName: string, score: number }>} opts.finalScores
 */
async function saveMatchResults(opts) {
  if (!isDbEnabled()) return { ok: false, skipped: true };
  const sb = getSupabase();

  const meta = {
    server_room_id: opts.serverRoomId,
    player_count: opts.finalScores.length,
  };

  const { data: roomRow, error: roomErr } = await sb
    .from("rooms")
    .insert({
      room_code: opts.roomCode,
      server_room_id: opts.serverRoomId,
      max_players: opts.maxPlayers,
      meta,
    })
    .select("id")
    .single();

  if (roomErr) {
    console.error("saveMatchResults room", roomErr);
    return { ok: false, error: roomErr.message };
  }

  const roomId = roomRow.id;

  const sorted = [...opts.finalScores].sort((a, b) => b.score - a.score);
  const rows = sorted.map((r, idx) => ({
    room_id: roomId,
    user_id: r.userId,
    display_name: r.displayName,
    total_score: r.score,
    match_rank: idx + 1,
  }));

  const { error: scErr } = await sb.from("scores").insert(rows);
  if (scErr) {
    console.error("saveMatchResults scores", scErr);
    return { ok: false, error: scErr.message };
  }

  return { ok: true, roomId };
}

/**
 * Aggregate leaderboard from scores (sum of match totals per user).
 * @param {number} limit
 */
async function fetchLeaderboard(limit = 50) {
  if (!isDbEnabled()) return [];
  const sb = getSupabase();
  const lim = Math.min(200, Math.max(1, limit));

  const { data: scores, error: e2 } = await sb
    .from("scores")
    .select("user_id, display_name, total_score");

  if (e2 || !scores) {
    console.error("fetchLeaderboard", e2);
    return [];
  }

  const byUser = new Map();
  for (const row of scores) {
    const key = row.user_id || `name:${row.display_name || "anon"}`;
    const cur = byUser.get(key) || {
      user_id: row.user_id,
      display_name: row.display_name,
      total_points: 0,
      matches_played: 0,
    };
    cur.total_points += row.total_score;
    cur.matches_played += 1;
    if (row.display_name) cur.display_name = row.display_name;
    byUser.set(key, cur);
  }

  return Array.from(byUser.values())
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, lim);
}

module.exports = { upsertUser, saveMatchResults, fetchLeaderboard };
