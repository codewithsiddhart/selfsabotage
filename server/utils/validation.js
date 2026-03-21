const MAX_NAME = 48;
const MAX_ROOM_CODE = 8;
const MAX_ACTION_TYPE = 64;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeString(s, maxLen) {
  if (s == null) return "";
  const t = String(s).trim();
  if (!t) return "";
  return t.slice(0, maxLen).replace(/[\u0000-\u001F\u007F]/g, "");
}

function isUuidLike(s) {
  if (!s || typeof s !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

function parseDisplayName(raw) {
  const n = sanitizeString(raw, MAX_NAME);
  return n || "Player";
}

function parseRoomCode(raw) {
  const c = sanitizeString(raw, MAX_ROOM_CODE).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.slice(0, 6);
}

function parsePosition(payload) {
  if (!payload || typeof payload !== "object") return null;
  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x, -1e6, 1e6), y: clamp(y, -1e6, 1e6) };
}

function parseAction(payload) {
  if (!payload || typeof payload !== "object") return null;
  const type = sanitizeString(payload.type, MAX_ACTION_TYPE);
  if (!type) return null;
  const meta = payload.meta;
  let safeMeta = null;
  if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
    safeMeta = {};
    for (const k of Object.keys(meta).slice(0, 20)) {
      const key = sanitizeString(k, 32);
      if (!key) continue;
      const v = meta[k];
      if (typeof v === "number" && Number.isFinite(v)) safeMeta[key] = clamp(v, -1e6, 1e6);
      else if (typeof v === "boolean") safeMeta[key] = v;
      else if (typeof v === "string") safeMeta[key] = sanitizeString(v, 128);
    }
  }
  return { type, meta: safeMeta };
}

function parseMaxPlayers(n, cap) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return null;
  return clamp(v, 2, cap);
}

module.exports = {
  MAX_NAME,
  parseDisplayName,
  parseRoomCode,
  parsePosition,
  parseAction,
  parseMaxPlayers,
  isUuidLike,
  clamp,
};
