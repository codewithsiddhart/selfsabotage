/**
 * Self-Sabotage Builder — Socket.IO matchmaking & match state
 * © 2026 NeuroGlitch. All Rights Reserved.
 */

/** Random final round: pick one of these hard built-ins (both players same level). */
const MP_FINAL_LEVEL_POOL = [
  "builtin_nomercy",
  "builtin_gauntlet",
  "builtin_summit",
  "builtin_chaosrun",
  "builtin_finaltest",
  "builtin_tower",
  "builtin_endurance",
];
const ROUND_BUILD_PLAY_POINTS = 100;
const ROUND_FINAL_WIN_BASE = 80;
const ROUND_FINAL_TIME_BONUS_MAX = 120;
const REMATCH_WAIT_MS = 45000;
const PLAY_PHASE_TIMEOUT_MS = 120000;
const FINAL_ROUND_TIMEOUT_MS = 180000;
const BUILD_PLAY_ROUNDS = 4;
const CHAT_MAX_LEN = 200;
const CHAT_MIN_INTERVAL_MS = 400;
const SPECTATE_THROTTLE_MS = 100;
const LEVEL_COLS = 30;
const LEVEL_ROWS = 18;
const SPAWN_SUPPORT_TYPES = new Set(["platform", "jumppad", "speedBoost"]);

/**
 * Server-side sanity check for submitted grids (source of truth for MP).
 * @param {unknown[]} flat
 */
function validateSubmittedLevel(flat) {
  if (!Array.isArray(flat) || flat.length !== LEVEL_COLS * LEVEL_ROWS) {
    return { ok: false, message: "Invalid level data." };
  }
  let starts = 0;
  let goals = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < LEVEL_ROWS; y++) {
    for (let x = 0; x < LEVEL_COLS; x++) {
      const t = flat[y * LEVEL_COLS + x];
      if (t === "start") {
        starts++;
        sx = x;
        sy = y;
      }
      if (t === "goal") goals++;
    }
  }
  if (starts !== 1) return { ok: false, message: "Level must have exactly one Start." };
  if (goals < 1) return { ok: false, message: "Level needs a Goal." };
  if (sy >= LEVEL_ROWS - 1) return { ok: false, message: "Start must have solid support directly below." };
  const below = flat[(sy + 1) * LEVEL_COLS + sx];
  if (!SPAWN_SUPPORT_TYPES.has(below)) {
    return { ok: false, message: "Start must stand on a platform, jump pad, or speed tile (not path block alone)." };
  }
  return { ok: true };
}

/**
 * @param {import("socket.io").Server} io
 */
function initMultiplayer(io) {
  /** @type {{ socketId: string, name: string }[]} */
  const queue = [];

  /**
   * @typedef {Object} Match
   * @property {string} id
   * @property {[string, string]} socketIds
   * @property {[string, string]} names
   * @property {number} round
   * @property {[number, number]} scores
   * @property {"build"|"play"|"final"|"ended"} phase
   * @property {0|1} builderIdx
   * @property {string | null} finalLevelId
   * @property {number | null} playRunSeed
   * @property {{0?: { t: number }, 1?: { t: number }}} lastChatAt
   * @property {{0?: number, 1?: number}} lastSpectateAt
   * @property {{0?:boolean,1?:boolean}} rematchVotes
   * @property {ReturnType<typeof setTimeout> | null} rematchTimer
   * @property {ReturnType<typeof setTimeout> | null} playPhaseTimer
   * @property {ReturnType<typeof setTimeout> | null} finalRoundTimer
   * @property {{0?: object, 1?: object}} finalResults
   * @property {boolean} playRunResolved
   */

  /** @type {Map<string, Match>} */
  const matches = new Map();
  /** @type {Map<string, string>} socketId -> matchId */
  const socketToMatch = new Map();

  function removeFromQueue(socketId) {
    const i = queue.findIndex((e) => e.socketId === socketId);
    if (i >= 0) queue.splice(i, 1);
  }

  function cleanupMatch(matchId) {
    const m = matches.get(matchId);
    if (!m) return;
    if (m.rematchTimer) clearTimeout(m.rematchTimer);
    if (m.playPhaseTimer) clearTimeout(m.playPhaseTimer);
    if (m.finalRoundTimer) clearTimeout(m.finalRoundTimer);
    for (const sid of m.socketIds) {
      socketToMatch.delete(sid);
    }
    matches.delete(matchId);
  }

  /**
   * @param {import("socket.io").Socket} socket
   * @param {Match} m
   */
  function emitScores(socket, m) {
    socket.emit("mp:scores", {
      yours: m.scores[m.socketIds[0] === socket.id ? 0 : 1],
      theirs: m.scores[m.socketIds[0] === socket.id ? 1 : 0],
      round: m.round,
      phase: m.phase,
    });
  }

  /**
   * @param {Match} m
   */
  function broadcastScores(m) {
    for (const sid of m.socketIds) {
      const sock = io.sockets.sockets.get(sid);
      if (sock) emitScores(sock, m);
    }
  }

  /**
   * @param {Match} m
   */
  function startBuildPhase(m) {
    m.phase = "build";
    m.playRunResolved = false;
    const b = m.builderIdx;
    const p = 1 - b;
    const sB = io.sockets.sockets.get(m.socketIds[b]);
    const sP = io.sockets.sockets.get(m.socketIds[p]);
    if (sB) {
      sB.emit("mp:phase", {
        phase: "build",
        round: m.round,
        builder: true,
        opponentName: m.names[p],
      });
      emitScores(sB, m);
    }
    if (sP) {
      sP.emit("mp:phase", {
        phase: "waitOpponent",
        round: m.round,
        builder: false,
        opponentName: m.names[b],
      });
      emitScores(sP, m);
    }
  }

  /**
   * @param {Match} m
   * @param {TileType[]} tilesFlat
   */
  function startPlayPhase(m, tilesFlat) {
    if (m.playPhaseTimer) clearTimeout(m.playPhaseTimer);
    m.phase = "play";
    m.playRunResolved = false;
    m.playRunSeed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
    const b = m.builderIdx;
    const p = 1 - b;
    const sB = io.sockets.sockets.get(m.socketIds[b]);
    const sP = io.sockets.sockets.get(m.socketIds[p]);
    if (sP) {
      sP.emit("mp:playLevel", {
        round: m.round,
        tilesFlat,
        builderName: m.names[b],
        runSeed: m.playRunSeed,
      });
      emitScores(sP, m);
    }
    if (sB) {
      sB.emit("mp:spectatePlayStart", {
        round: m.round,
        tilesFlat,
        runSeed: m.playRunSeed,
        runnerName: m.names[p],
      });
      emitScores(sB, m);
    }
    m.playPhaseTimer = setTimeout(() => {
      const mm = matches.get(m.id);
      if (!mm || mm.phase !== "play" || mm.playRunResolved) return;
      mm.playRunResolved = true;
      mm.playPhaseTimer = null;
      applyBuildPlayScore(mm, "lose", 1 - mm.builderIdx);
      broadcastScores(mm);
      advanceAfterBuildPlayRound(mm);
    }, PLAY_PHASE_TIMEOUT_MS);
  }

  /**
   * @param {Match} m
   */
  function startFinalRound(m) {
    m.phase = "final";
    m.finalLevelId = MP_FINAL_LEVEL_POOL[Math.floor(Math.random() * MP_FINAL_LEVEL_POOL.length)];
    const seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
    m.finalResults = {};
    for (let i = 0; i < 2; i++) {
      const sock = io.sockets.sockets.get(m.socketIds[i]);
      if (sock) {
        sock.emit("mp:round3", {
          levelId: m.finalLevelId,
          runSeed: seed,
          countdownMs: 3200,
          opponentName: m.names[1 - i],
          roundLabel: 5,
        });
        emitScores(sock, m);
      }
    }
    m.finalRoundTimer = setTimeout(() => {
      const mm = matches.get(m.id);
      if (!mm || mm.phase !== "final" || !mm.finalResults) return;
      const r = mm.finalResults;
      if (r[0] == null) r[0] = { outcome: "lose", timeMs: 300000, pts: 0 };
      if (r[1] == null) r[1] = { outcome: "lose", timeMs: 300000, pts: 0 };
      mm.finalResults = {};
      if (mm.finalRoundTimer) clearTimeout(mm.finalRoundTimer);
      mm.finalRoundTimer = null;
      mm.scores[0] += r[0].pts;
      mm.scores[1] += r[1].pts;
      if (r[0].outcome === "win" && r[1].outcome === "win") {
        if (r[0].timeMs < r[1].timeMs) mm.scores[0] += 40;
        else if (r[1].timeMs < r[0].timeMs) mm.scores[1] += 40;
      }
      broadcastScores(mm);
      finishMatch(mm);
    }, FINAL_ROUND_TIMEOUT_MS);
  }

  function advanceAfterBuildPlayRound(m) {
    if (m.round < BUILD_PLAY_ROUNDS) {
      m.round += 1;
      m.builderIdx = /** @type {0|1} */ (1 - m.builderIdx);
      startBuildPhase(m);
      return;
    }
    if (m.round === BUILD_PLAY_ROUNDS) {
      m.round = 5;
      startFinalRound(m);
    }
  }

  /**
   * @param {Match} m
   * @param {"win"|"lose"} outcome
   * @param {number} playerIdx
   */
  function applyBuildPlayScore(m, outcome, playerIdx) {
    const builderIdx = m.builderIdx;
    const runnerIdx = 1 - builderIdx;
    if (playerIdx !== runnerIdx) return;
    if (outcome === "win") m.scores[runnerIdx] += ROUND_BUILD_PLAY_POINTS;
    else m.scores[builderIdx] += ROUND_BUILD_PLAY_POINTS;
  }

  /**
   * @param {Match} m
   */
  function finishMatch(m) {
    m.phase = "ended";
    const w =
      m.scores[0] > m.scores[1] ? 0 : m.scores[1] > m.scores[0] ? 1 : null;
    for (let i = 0; i < 2; i++) {
      const sock = io.sockets.sockets.get(m.socketIds[i]);
      if (sock) {
        sock.emit("mp:matchEnd", {
          scores: m.scores,
          names: m.names,
          winnerIndex: w,
          youIndex: i,
        });
      }
    }
  }

  /**
   * @param {import("socket.io").Socket} socket
   * @param {string} reason
   */
  function forfeitMatch(socket, reason) {
    const mid = socketToMatch.get(socket.id);
    if (!mid) return;
    const m = matches.get(mid);
    if (!m) return;
    if (m.phase === "ended") {
      if (m.rematchTimer) clearTimeout(m.rematchTimer);
      const otherId = m.socketIds.find((id) => id !== socket.id);
      cleanupMatch(mid);
      const otherSock = otherId ? io.sockets.sockets.get(otherId) : null;
      if (otherSock) otherSock.emit("mp:rematchDone", { restarted: false, reason: "disconnect" });
      return;
    }
    const idx = m.socketIds.indexOf(socket.id);
    const other = 1 - idx;
    const otherId = m.socketIds[other];
    cleanupMatch(mid);
    const otherSock = otherId ? io.sockets.sockets.get(otherId) : null;
    if (otherSock) {
      otherSock.emit("mp:forfeit", { reason, message: "Opponent disconnected. You win by default." });
    }
  }

  io.on("connection", (socket) => {
    const qName = (socket.handshake.query && String(socket.handshake.query.name || "").trim()) || "Player";
    const name = qName.slice(0, 18) || "Player";

    socket.on("mp:queue", () => {
      removeFromQueue(socket.id);
      if (socketToMatch.has(socket.id)) {
        socket.emit("mp:error", { message: "Already in a match." });
        return;
      }
      queue.push({ socketId: socket.id, name });
      socket.emit("mp:queueAck", { position: queue.length });

      if (queue.length >= 2) {
        const a = queue.shift();
        const b = queue.shift();
        if (!a || !b) return;

        /** @type {Match} */
        const m = {
          id: `m_${a.socketId.slice(0, 6)}_${b.socketId.slice(0, 6)}_${Date.now().toString(36)}`,
          socketIds: [a.socketId, b.socketId],
          names: [a.name, b.name],
          round: 1,
          scores: [0, 0],
          phase: "build",
          builderIdx: 0,
          finalLevelId: null,
          playRunSeed: null,
          lastChatAt: {},
          lastSpectateAt: {},
          rematchVotes: {},
          rematchTimer: null,
          playPhaseTimer: null,
          finalRoundTimer: null,
          finalResults: undefined,
          playRunResolved: false,
        };
        matches.set(m.id, m);
        socketToMatch.set(a.socketId, m.id);
        socketToMatch.set(b.socketId, m.id);

        const sa = io.sockets.sockets.get(a.socketId);
        const sb = io.sockets.sockets.get(b.socketId);
        if (sa) {
          sa.emit("mp:matched", {
            matchId: m.id,
            youIndex: 0,
            opponentName: m.names[1],
          });
        }
        if (sb) {
          sb.emit("mp:matched", {
            matchId: m.id,
            youIndex: 1,
            opponentName: m.names[0],
          });
        }
        startBuildPhase(m);
      }
    });

    socket.on("mp:leaveQueue", () => {
      removeFromQueue(socket.id);
    });

    socket.on("mp:submitLevel", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase !== "build") return;
      const idx = m.socketIds.indexOf(socket.id);
      if (idx !== m.builderIdx) return;
      if (m.round > BUILD_PLAY_ROUNDS) return;
      const tilesFlat = payload && payload.tilesFlat;
      const v = validateSubmittedLevel(tilesFlat);
      if (!v.ok) {
        socket.emit("mp:error", { message: v.message || "Invalid level data." });
        return;
      }
      startPlayPhase(m, tilesFlat);
    });

    socket.on("mp:spectateTick", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase !== "play") return;
      const idx = m.socketIds.indexOf(socket.id);
      if (idx !== 1 - m.builderIdx) return;
      const now = Date.now();
      const last = m.lastSpectateAt[idx] || 0;
      if (now - last < SPECTATE_THROTTLE_MS) return;
      m.lastSpectateAt[idx] = now;
      const b = m.builderIdx;
      const sB = io.sockets.sockets.get(m.socketIds[b]);
      if (!sB || !payload || typeof payload !== "object") return;
      const x = Number(payload.x);
      const y = Number(payload.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      sB.emit("mp:spectateTick", {
        x,
        y,
        vx: Number.isFinite(Number(payload.vx)) ? Number(payload.vx) : 0,
        vy: Number.isFinite(Number(payload.vy)) ? Number(payload.vy) : 0,
      });
    });

    socket.on("mp:chat", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase === "ended") return;
      const idx = m.socketIds.indexOf(socket.id);
      if (idx !== 0 && idx !== 1) return;
      const now = Date.now();
      const slot = m.lastChatAt[idx];
      if (slot && now - slot.t < CHAT_MIN_INTERVAL_MS) return;
      m.lastChatAt[idx] = { t: now };
      let text = payload && String(payload.text || "").trim();
      if (!text) return;
      text = text.slice(0, CHAT_MAX_LEN);
      const msg = {
        id: `${mid}_${now}_${idx}`,
        from: m.names[idx],
        text,
        t: now,
      };
      for (const sid of m.socketIds) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.emit("mp:chat", msg);
      }
    });

    socket.on("mp:runEnd", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase !== "play" || m.playRunResolved) return;
      const idx = m.socketIds.indexOf(socket.id);
      const outcome = payload && payload.outcome === "win" ? "win" : "lose";
      const runnerIdx = 1 - m.builderIdx;
      if (idx !== runnerIdx) return;
      if (m.playPhaseTimer) clearTimeout(m.playPhaseTimer);
      m.playPhaseTimer = null;
      m.playRunResolved = true;
      applyBuildPlayScore(m, outcome, idx);
      broadcastScores(m);
      advanceAfterBuildPlayRound(m);
    });

    socket.on("mp:round3End", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase !== "final" || !m.finalResults) return;
      const idx = /** @type {0|1} */ (m.socketIds.indexOf(socket.id));
      if (idx !== 0 && idx !== 1) return;
      if (m.finalResults[idx] != null) return;
      const outcome = payload && payload.outcome === "win" ? "win" : "lose";
      const timeMs = Math.max(0, Math.min(300000, Number(payload && payload.timeMs) || 0));

      function timeBonus(ms) {
        const sec = ms / 1000;
        return Math.min(ROUND_FINAL_TIME_BONUS_MAX, Math.max(0, Math.round((90 - sec) * 1.5)));
      }

      let pts = 0;
      if (outcome === "win") pts = ROUND_FINAL_WIN_BASE + timeBonus(timeMs);
      m.finalResults[idx] = { outcome, timeMs, pts };

      const r = m.finalResults;
      if (r[0] != null && r[1] != null) {
        if (m.finalRoundTimer) clearTimeout(m.finalRoundTimer);
        m.finalRoundTimer = null;
        const a = r[0];
        const b = r[1];
        m.finalResults = {};

        m.scores[0] += a.pts;
        m.scores[1] += b.pts;
        if (a.outcome === "win" && b.outcome === "win") {
          if (a.timeMs < b.timeMs) m.scores[0] += 40;
          else if (b.timeMs < a.timeMs) m.scores[1] += 40;
        }
        broadcastScores(m);
        finishMatch(m);
      }
    });

    socket.on("mp:rematch", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase !== "ended") return;
      const idx = m.socketIds.indexOf(socket.id);
      const accept = !!(payload && payload.accept);
      if (!accept) {
        if (m.rematchTimer) clearTimeout(m.rematchTimer);
        for (const sid of m.socketIds) {
          const s = io.sockets.sockets.get(sid);
          if (s) s.emit("mp:rematchDone", { restarted: false });
        }
        cleanupMatch(mid);
        return;
      }

      m.rematchVotes[idx] = true;
      const votes = { ...m.rematchVotes };
      const accepted = [votes[0], votes[1]].filter(Boolean).length;
      for (const sid of m.socketIds) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.emit("mp:rematchStatus", { votes, acceptedCount: accepted, needed: 2 });
      }

      if (m.rematchVotes[0] && m.rematchVotes[1]) {
        if (m.rematchTimer) clearTimeout(m.rematchTimer);
        m.rematchVotes = {};
        m.round = 1;
        m.scores = [0, 0];
        m.builderIdx = 0;
        m.finalLevelId = null;
        m.playRunSeed = null;
        m.playRunResolved = false;
        m.finalResults = undefined;
        m.lastChatAt = {};
        m.lastSpectateAt = {};
        m.phase = "build";
        for (const sid of m.socketIds) {
          const s = io.sockets.sockets.get(sid);
          if (s) s.emit("mp:rematchDone", { restarted: true });
        }
        startBuildPhase(m);
      } else {
        if (m.rematchTimer) clearTimeout(m.rematchTimer);
        m.rematchTimer = setTimeout(() => {
          const mm = matches.get(mid);
          if (!mm || mm.phase !== "ended") return;
          for (const sid of mm.socketIds) {
            const s = io.sockets.sockets.get(sid);
            if (s) s.emit("mp:rematchDone", { restarted: false, reason: "timeout" });
          }
          cleanupMatch(mid);
        }, REMATCH_WAIT_MS);
      }
    });

    socket.on("disconnect", () => {
      removeFromQueue(socket.id);
      forfeitMatch(socket, "disconnect");
    });
  });
}

module.exports = { initMultiplayer, MP_FINAL_LEVEL_POOL };
