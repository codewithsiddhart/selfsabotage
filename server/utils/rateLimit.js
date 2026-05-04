/**
 * Simple sliding-window rate limiter per key (socket id + event class).
 */
function createRateLimiter({ maxPerWindow, windowMs }) {
  const buckets = new Map();

  function prune(key, now) {
    const q = buckets.get(key);
    if (!q) return;
    while (q.length && now - q[0] > windowMs) q.shift();
    if (!q.length) buckets.delete(key);
  }

  function allow(key) {
    const now = Date.now();
    prune(key, now);
    let q = buckets.get(key);
    if (!q) {
      q = [];
      buckets.set(key, q);
    }
    if (q.length >= maxPerWindow) return false;
    q.push(now);
    return true;
  }

  return { allow };
}

module.exports = { createRateLimiter };
