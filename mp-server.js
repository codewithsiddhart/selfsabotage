/**
 * Self-Sabotage Builder — Socket.IO matchmaking & match state
 * © 2026 NeuroGlitch. All Rights Reserved.
 */

const MP_FINAL_LEVEL_ID = "builtin_nomercy";
const ROUND_BUILD_PLAY_POINTS = 100;
const ROUND3_WIN_BASE = 80;
const ROUND3_TIME_BONUS_MAX = 120; // extra points scaled by speed
const REMATCH_WAIT_MS = 45000;

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
   * @property {"build"|"play"|"round3"|"ended"} phase
   * @property {0|1} builderIdx
 * @property {string[] | null} round1Level
 * @property {string[] | null} round2Level
   * @property {number | null} round3Seed
   * @property {{0?:boolean,1?:boolean}} rematchVotes
   * @property {ReturnType<typeof setTimeout> | null} rematchTimer
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
    m.phase = "play";
    const b = m.builderIdx;
    const p = 1 - b;
    const sB = io.sockets.sockets.get(m.socketIds[b]);
    const sP = io.sockets.sockets.get(m.socketIds[p]);
    if (sP) {
      sP.emit("mp:playLevel", {
        round: m.round,
        tilesFlat,
        builderName: m.names[b],
      });
      emitScores(sP, m);
    }
    if (sB) {
      sB.emit("mp:phase", {
        phase: "spectateBuild",
        round: m.round,
        builder: true,
        opponentName: m.names[p],
        message: "Opponent is playing your level.",
      });
      emitScores(sB, m);
    }
  }

  /**
   * @param {Match} m
   */
  function advanceAfterBuildPlayRound(m) {
    if (m.round === 1) {
      m.round = 2;
      m.builderIdx = 1;
      startBuildPhase(m);
      return;
    }
    if (m.round === 2) {
      m.round = 3;
      m.phase = "round3";
      m.round3Seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
      m.round3Results = {};
      for (let i = 0; i < 2; i++) {
        const sock = io.sockets.sockets.get(m.socketIds[i]);
        if (sock) {
          sock.emit("mp:round3", {
            levelId: MP_FINAL_LEVEL_ID,
            runSeed: m.round3Seed,
            countdownMs: 3200,
            opponentName: m.names[1 - i],
          });
          emitScores(sock, m);
        }
      }
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
          round1Level: null,
          round2Level: null,
          round3Seed: null,
          round3Results: undefined,
          rematchVotes: {},
          rematchTimer: null,
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
      const tilesFlat = payload && payload.tilesFlat;
      if (!Array.isArray(tilesFlat) || tilesFlat.length !== 30 * 18) {
        socket.emit("mp:error", { message: "Invalid level data." });
        return;
      }
      if (m.round === 1) m.round1Level = tilesFlat;
      else if (m.round === 2) m.round2Level = tilesFlat;
      startPlayPhase(m, tilesFlat);
    });

    socket.on("mp:runEnd", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase !== "play") return;
      const idx = m.socketIds.indexOf(socket.id);
      const outcome = payload && payload.outcome === "win" ? "win" : "lose";
      applyBuildPlayScore(m, outcome, idx);
      broadcastScores(m);
      advanceAfterBuildPlayRound(m);
    });

    socket.on("mp:round3End", (payload) => {
      const mid = socketToMatch.get(socket.id);
      if (!mid) return;
      const m = matches.get(mid);
      if (!m || m.phase !== "round3" || !m.round3Results) return;
      const idx = /** @type {0|1} */ (m.socketIds.indexOf(socket.id));
      if (idx !== 0 && idx !== 1) return;
      const outcome = payload && payload.outcome === "win" ? "win" : "lose";
      const timeMs = Math.max(0, Math.min(300000, Number(payload && payload.timeMs) || 0));

      function timeBonus(ms) {
        const sec = ms / 1000;
        return Math.min(ROUND3_TIME_BONUS_MAX, Math.max(0, Math.round((90 - sec) * 1.5)));
      }

      let pts = 0;
      if (outcome === "win") pts = ROUND3_WIN_BASE + timeBonus(timeMs);
      m.round3Results[idx] = { outcome, timeMs, pts };

      const r = m.round3Results;
      if (r[0] != null && r[1] != null) {
        const a = r[0];
        const b = r[1];
        m.round3Results = {};

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
      for (const sid of m.socketIds) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.emit("mp:rematchStatus", { votes: { ...m.rematchVotes } });
      }

      if (m.rematchVotes[0] && m.rematchVotes[1]) {
        if (m.rematchTimer) clearTimeout(m.rematchTimer);
        m.rematchVotes = {};
        m.round = 1;
        m.scores = [0, 0];
        m.builderIdx = 0;
        m.round1Level = null;
        m.round2Level = null;
        m.round3Seed = null;
        m.round3Results = undefined;
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

module.exports = { initMultiplayer, MP_FINAL_LEVEL_ID };
