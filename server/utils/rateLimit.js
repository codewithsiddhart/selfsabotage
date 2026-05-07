/**
 * Simple sliding-window rate limiter per key (socket id + event class).
 */
function createRateLimiter({ maxPerWindow, windowMs }) {
  const buckets = new Map();
  const MAX_BUCKETS = 10_000;

  function prune(key, now) {
    const q = buckets.get(key);
    if (!q) return;
    while (q.length && now - q[0] > windowMs) q.shift();
    if (!q.length) buckets.delete(key);
  }

  // Periodic global prune: evict all stale buckets every 60 s so quiet sockets
  // don't accumulate memory forever.
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const key of buckets.keys()) prune(key, now);
  }, 60_000);
  // Allow the interval to be GC'd when the process exits without explicit cleanup
  if (pruneInterval.unref) pruneInterval.unref();

  function allow(key) {
    const now = Date.now();
    prune(key, now);
    let q = buckets.get(key);
    if (!q) {
      // Cap total bucket count to prevent unbounded growth under a flood of unique keys
      if (buckets.size >= MAX_BUCKETS) return false;
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
