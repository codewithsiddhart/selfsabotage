/**
 * Shared CORS allow-list for Express + Socket.IO (must stay in sync).
 *
 * In CORS_ORIGIN (comma-separated), you can use:
 * - Full origins: https://my-game.vercel.app
 * - *.vercel.app — allows any https://….vercel.app (production + preview deployments)
 */
function normalizeOrigin(origin) {
  if (!origin || typeof origin !== "string") return "";
  return origin.trim();
}

function isVercelAppOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "vercel.app" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function isRenderAppOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "onrender.com" || host.endsWith(".onrender.com");
  } catch {
    return false;
  }
}

/**
 * @param {string | undefined} origin - Request Origin header (may be undefined for same-origin / some tools)
 * @param {string[]} allowedList - From config.corsOrigins (trimmed)
 * @param {{ allowDevBypass?: boolean }} opts
 */
function isOriginAllowed(origin, allowedList, opts = {}) {
  const o = normalizeOrigin(origin);
  if (!o) return true;

  if (allowedList.includes("*")) return true;
  if (allowedList.includes(o)) return true;

  // file:// and some embedded contexts send Origin: "null" (literal string). Allow only if listed in CORS_ORIGIN.
  if (o === "null" && allowedList.some((e) => String(e).trim() === "null")) return true;

  for (const entry of allowedList) {
    const e = String(entry).trim();
    if (e === "*.vercel.app" || e === ".vercel.app") {
      if (isVercelAppOrigin(o)) return true;
    }
    if (e === "*.onrender.com" || e === ".onrender.com") {
      if (isRenderAppOrigin(o)) return true;
    }
  }

  if (opts.allowDevBypass) return true;
  return false;
}

module.exports = { isOriginAllowed, isVercelAppOrigin, isRenderAppOrigin };
