(() => {
  "use strict";

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distanceSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function uid() {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  function makeGrid(w, h, fill) {
    const g = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) row.push(fill);
      g.push(row);
    }
    return g;
  }

  function inBounds(x, y) {
    const { COLS, ROWS } = window.GameConstants;
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return h >>> 0;
  }

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function seedFromGrid(g) {
    const { COLS, ROWS } = window.GameConstants;
    let s = 2166136261 >>> 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = g[y][x];
        s ^= hash2(x, y) ^ hashStr(t);
        s = Math.imul(s, 16777619) >>> 0;
      }
    }
    return s >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sanitizeName(s) {
    return String(s || "").trim().replace(/[^a-zA-Z0-9 _\-!?.]/g, "").slice(0, 24).trim();
  }

  window.GameUtils = {
    clamp,
    lerp,
    distanceSq,
    uid,
    makeGrid,
    inBounds,
    roundRect,
    hash2,
    hashStr,
    seedFromGrid,
    mulberry32,
    sanitizeName,
  };
})();
