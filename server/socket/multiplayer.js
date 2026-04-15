/**
 * Socket.IO multiplayer: rooms, throttled movement, chat, level + run sync.
 */
"use strict";

const crypto = require("crypto");
const { createRateLimiter } = require("../utils/rateLimit");
const { config } = require("../config");

const posRl = createRateLimiter({ maxPerWindow: config.game.positionMaxPerSecond, windowMs: 1000 });
const chatRl = createRateLimiter({ maxPerWindow: 12, windowMs: 1000 });
const runRl = createRateLimiter({ maxPerWindow: config.game.actionMaxPerSecond, windowMs: 1000 });

function randRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

/**
 * @param {import("socket.io").Server} io
 */
function setupMultiplayer(io) {
  /** @type {Map<string, { hostSocketId: string, saboteurSocketId: string|null, levelJson: string|null, clients: Map<string, { name: string, avatarId: string|null }>, match: { active: boolean, round: number, maxRounds: number, scores: Map<string, number> } }>} */
  const rooms = new Map();
  /** @type {string|null} */
  let randomQueueSocketId = null;

  function getRoomOfSocketId(socketId) {
    for (const [rid, room] of rooms) {
      if (room.clients.has(socketId)) return { roomId: rid, room };
    }
    return null;
  }

  function electHost(room) {
    const first = room.clients.keys().next().value;
    if (first) room.hostSocketId = first;
  }

  function assignSaboteur(room) {
    if (room.saboteurSocketId && room.clients.has(room.saboteurSocketId) && room.saboteurSocketId !== room.hostSocketId) return;
    room.saboteurSocketId = null;
    for (const id of room.clients.keys()) {
      if (id !== room.hostSocketId) {
        room.saboteurSocketId = id;
        break;
      }
    }
  }

  function removeSocketFromCurrentRoom(socket) {
    const rid = socket.data.roomId;
    if (!rid) return;
    const room = rooms.get(rid);
    if (!room) {
      socket.data.roomId = null;
      return;
    }
    room.clients.delete(socket.id);
    socket.to(rid).emit("mp_peer_leave", { id: socket.id });
    socket.leave(rid);
    if (room.clients.size === 0) rooms.delete(rid);
    else if (room.hostSocketId === socket.id) {
      electHost(room);
      assignSaboteur(room);
      io.to(rid).emit("mp_host_changed", { hostId: room.hostSocketId });
      io.to(rid).emit("mp_roles", { hostId: room.hostSocketId, saboteurId: room.saboteurSocketId });
    } else {
      assignSaboteur(room);
      io.to(rid).emit("mp_roles", { hostId: room.hostSocketId, saboteurId: room.saboteurSocketId });
    }
    socket.data.roomId = null;
  }

  function serializeMatch(room) {
    const scores = {};
    for (const [id, val] of room.match.scores) scores[id] = val | 0;
    return {
      active: !!room.match.active,
      round: room.match.round | 0,
      maxRounds: room.match.maxRounds | 0,
      scores,
    };
  }

  function ensureScoreKeys(room) {
    for (const id of room.clients.keys()) {
      if (!room.match.scores.has(id)) room.match.scores.set(id, 0);
    }
  }

  function startRoomMatch(room, rid) {
    room.match.active = true;
    room.match.round = 1;
    room.match.maxRounds = 5;
    room.match.scores.clear();
    ensureScoreKeys(room);
    io.to(rid).emit("mp_match_state", serializeMatch(room));
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    io.to(rid).emit("mp_run", { seed });
  }

  io.on("connection", (socket) => {
    /** @type {string|null} */
    let roomId = null;

    socket.on("mp_create", (payload, ack) => {
      try {
        removeSocketFromCurrentRoom(socket);
        const name = String((payload && payload.name) || "Player")
          .trim()
          .slice(0, 18);
        const avatarId = payload && payload.avatarId != null ? String(payload.avatarId).trim().slice(0, 64) : null;
        let code = randRoomCode();
        while (rooms.has(code)) code = randRoomCode();
        const room = {
          hostSocketId: socket.id,
          saboteurSocketId: null,
          levelJson: null,
          clients: new Map(),
          match: { active: false, round: 0, maxRounds: 5, scores: new Map() },
        };
        room.clients.set(socket.id, { name, avatarId });
        rooms.set(code, room);
        roomId = code;
        socket.join(code);
        socket.data.roomId = code;
        if (typeof ack === "function") {
          ack({ ok: true, roomId: code, isHost: true, isSaboteur: false, match: serializeMatch(room) });
        }
      } catch {
        if (typeof ack === "function") ack({ ok: false, error: "server" });
      }
    });

    socket.on("mp_join", (payload, ack) => {
      try {
        const rid = String((payload && payload.roomId) || "")
          .trim()
          .toUpperCase()
          .slice(0, 8);
        const name = String((payload && payload.name) || "Player")
          .trim()
          .slice(0, 18);
        const avatarId = payload && payload.avatarId != null ? String(payload.avatarId).trim().slice(0, 64) : null;
        if (!/^[A-F0-9]{6}$/i.test(rid)) {
          if (typeof ack === "function") ack({ ok: false, error: "bad_room" });
          return;
        }
        const room = rooms.get(rid);
        if (!room) {
          if (typeof ack === "function") ack({ ok: false, error: "not_found" });
          return;
        }
        if (room.clients.size >= config.game.maxPlayersPerRoom) {
          if (typeof ack === "function") ack({ ok: false, error: "full" });
          return;
        }
        removeSocketFromCurrentRoom(socket);
        room.clients.set(socket.id, { name, avatarId });
        ensureScoreKeys(room);
        assignSaboteur(room);
        roomId = rid;
        socket.join(rid);
        socket.data.roomId = rid;
        socket.to(rid).emit("mp_peer_join", { id: socket.id, name, avatarId });
        io.to(rid).emit("mp_roles", { hostId: room.hostSocketId, saboteurId: room.saboteurSocketId });
        const peers = [];
        for (const [id, c] of room.clients) {
          if (id !== socket.id) peers.push({ id, name: c.name, avatarId: c.avatarId });
        }
        if (typeof ack === "function") {
          ack({
            ok: true,
            isHost: room.hostSocketId === socket.id,
            isSaboteur: room.saboteurSocketId === socket.id,
            peers,
            levelJson: room.levelJson,
            hostId: room.hostSocketId,
            saboteurId: room.saboteurSocketId,
            match: serializeMatch(room),
          });
        }
      } catch {
        if (typeof ack === "function") ack({ ok: false, error: "server" });
      }
    });

    socket.on("mp_random_find", (payload, ack) => {
      try {
        const name = String((payload && payload.name) || "Player")
          .trim()
          .slice(0, 18);
        const avatarId = payload && payload.avatarId != null ? String(payload.avatarId).trim().slice(0, 64) : null;
        removeSocketFromCurrentRoom(socket);
        if (randomQueueSocketId === socket.id) {
          if (typeof ack === "function") ack({ ok: true, waiting: true });
          return;
        }
        const waitingSocket =
          randomQueueSocketId && randomQueueSocketId !== socket.id ? io.sockets.sockets.get(randomQueueSocketId) : null;
        if (!waitingSocket) {
          randomQueueSocketId = socket.id;
          socket.data.randomQueued = true;
          socket.data.randomProfile = { name, avatarId };
          if (typeof ack === "function") ack({ ok: true, waiting: true });
          return;
        }
        randomQueueSocketId = null;
        waitingSocket.data.randomQueued = false;
        socket.data.randomQueued = false;
        const hostSocket = waitingSocket;
        const guestSocket = socket;
        const hostProfile = waitingSocket.data.randomProfile || { name: "Player", avatarId: null };
        const guestProfile = { name, avatarId };
        let code = randRoomCode();
        while (rooms.has(code)) code = randRoomCode();
        const room = {
          hostSocketId: hostSocket.id,
          saboteurSocketId: null,
          levelJson: null,
          clients: new Map(),
          match: { active: false, round: 0, maxRounds: 5, scores: new Map() },
        };
        room.clients.set(hostSocket.id, { name: String(hostProfile.name || "Player").slice(0, 18), avatarId: hostProfile.avatarId || null });
        room.clients.set(guestSocket.id, guestProfile);
        assignSaboteur(room);
        ensureScoreKeys(room);
        rooms.set(code, room);
        hostSocket.join(code);
        guestSocket.join(code);
        hostSocket.data.roomId = code;
        guestSocket.data.roomId = code;
        hostSocket.emit("mp_random_matched", {
          roomId: code,
          isHost: true,
          isSaboteur: room.saboteurSocketId === hostSocket.id,
          peers: [{ id: guestSocket.id, name: guestProfile.name, avatarId: guestProfile.avatarId || null }],
          hostId: room.hostSocketId,
          saboteurId: room.saboteurSocketId,
          match: serializeMatch(room),
        });
        guestSocket.emit("mp_random_matched", {
          roomId: code,
          isHost: false,
          isSaboteur: room.saboteurSocketId === guestSocket.id,
          peers: [{ id: hostSocket.id, name: room.clients.get(hostSocket.id).name, avatarId: room.clients.get(hostSocket.id).avatarId || null }],
          hostId: room.hostSocketId,
          saboteurId: room.saboteurSocketId,
          match: serializeMatch(room),
        });
        io.to(code).emit("mp_roles", { hostId: room.hostSocketId, saboteurId: room.saboteurSocketId });
        startRoomMatch(room, code);
        if (typeof ack === "function") ack({ ok: true, waiting: false });
      } catch {
        if (typeof ack === "function") ack({ ok: false, error: "server" });
      }
    });

    socket.on("mp_random_cancel", (_payload, ack) => {
      if (randomQueueSocketId === socket.id) randomQueueSocketId = null;
      socket.data.randomQueued = false;
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("mp_match_start", (_payload, ack) => {
      try {
        const rid = socket.data.roomId;
        if (!rid) {
          if (typeof ack === "function") ack({ ok: false, error: "no_room" });
          return;
        }
        const room = rooms.get(rid);
        if (!room || room.hostSocketId !== socket.id) {
          if (typeof ack === "function") ack({ ok: false, error: "forbidden" });
          return;
        }
        startRoomMatch(room, rid);
        if (typeof ack === "function") ack({ ok: true, match: serializeMatch(room) });
      } catch {
        if (typeof ack === "function") ack({ ok: false, error: "server" });
      }
    });

    socket.on("mp_round_win", (payload, ack) => {
      try {
        const rid = socket.data.roomId;
        if (!rid) {
          if (typeof ack === "function") ack({ ok: false, error: "no_room" });
          return;
        }
        const room = rooms.get(rid);
        if (!room || !room.match.active) {
          if (typeof ack === "function") ack({ ok: false, error: "no_match" });
          return;
        }
        const claimedRound = Number(payload && payload.round) | 0;
        if (claimedRound !== (room.match.round | 0)) {
          if (typeof ack === "function") ack({ ok: false, error: "stale_round", match: serializeMatch(room) });
          return;
        }
        const prev = room.match.scores.get(socket.id) || 0;
        room.match.scores.set(socket.id, prev + 1);
        if (room.match.round >= room.match.maxRounds) {
          room.match.active = false;
          io.to(rid).emit("mp_match_end", serializeMatch(room));
          if (typeof ack === "function") ack({ ok: true, done: true, match: serializeMatch(room) });
          return;
        }
        room.match.round += 1;
        io.to(rid).emit("mp_match_state", serializeMatch(room));
        if (room.match.round === room.match.maxRounds) {
          io.to(room.hostSocketId).emit("mp_match_pick_final_level");
        }
        const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
        io.to(rid).emit("mp_run", { seed });
        if (typeof ack === "function") ack({ ok: true, done: false, match: serializeMatch(room) });
      } catch {
        if (typeof ack === "function") ack({ ok: false, error: "server" });
      }
    });

    socket.on("mp_pos", (data) => {
      const rid = socket.data.roomId;
      if (!rid) return;
      if (!posRl.allow(socket.id)) return;
      const x = Number(data && data.x);
      const y = Number(data && data.y);
      const vx = Number(data && data.vx);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vx)) return;
      socket.to(rid).emit("mp_peer_pos", {
        id: socket.id,
        x,
        y,
        vx,
      });
    });

    socket.on("mp_chat", (data) => {
      const rid = socket.data.roomId;
      if (!rid) return;
      if (!chatRl.allow(socket.id)) return;
      const text = String((data && data.text) || "")
        .trim()
        .slice(0, 200);
      if (!text) return;
      const gr = getRoomOfSocketId(socket.id);
      const meta = gr && gr.room.clients.get(socket.id);
      const name = meta && meta.name ? meta.name : "Player";
      socket.to(rid).emit("mp_chat", { id: socket.id, name, text });
    });

    socket.on("mp_level", (data) => {
      const rid = socket.data.roomId;
      if (!rid) return;
      if (!runRl.allow(socket.id + ":lvl")) return;
      const gr = getRoomOfSocketId(socket.id);
      if (!gr || socket.id !== gr.room.hostSocketId) return;
      const levelJson = data && typeof data.levelJson === "string" ? data.levelJson.slice(0, 900_000) : "";
      gr.room.levelJson = levelJson || null;
      socket.to(rid).emit("mp_level", { levelJson: gr.room.levelJson });
    });

    socket.on("mp_run", (data) => {
      const rid = socket.data.roomId;
      if (!rid) return;
      if (!runRl.allow(socket.id + ":run")) return;
      const gr = getRoomOfSocketId(socket.id);
      if (!gr || socket.id !== gr.room.hostSocketId) return;
      const seed = Number(data && data.seed) >>> 0;
      io.to(rid).emit("mp_run", { seed });
    });

    socket.on("mp_run_request", () => {
      const rid = socket.data.roomId;
      if (!rid) return;
      const gr = getRoomOfSocketId(socket.id);
      if (!gr || socket.id === gr.room.hostSocketId) return;
      io.to(gr.room.hostSocketId).emit("mp_run_request");
    });

    socket.on("mp_sabotage_action", (data, ack) => {
      const rid = socket.data.roomId;
      if (!rid) {
        if (typeof ack === "function") ack({ ok: false, error: "no_room" });
        return;
      }
      const gr = getRoomOfSocketId(socket.id);
      if (!gr || gr.room.saboteurSocketId !== socket.id) {
        if (typeof ack === "function") ack({ ok: false, error: "forbidden" });
        return;
      }
      if (!runRl.allow(socket.id + ":sab")) {
        if (typeof ack === "function") ack({ ok: false, error: "rate" });
        return;
      }
      const kind = String((data && data.kind) || "")
        .trim()
        .slice(0, 24);
      if (!["invert", "spikeBurst", "quake"].includes(kind)) {
        if (typeof ack === "function") ack({ ok: false, error: "bad_kind" });
        return;
      }
      const atMs = Date.now();
      io.to(rid).emit("mp_sabotage_action", { by: socket.id, kind, atMs });
      if (typeof ack === "function") ack({ ok: true, atMs });
    });

    socket.on("disconnect", () => {
      if (randomQueueSocketId === socket.id) randomQueueSocketId = null;
      removeSocketFromCurrentRoom(socket);
      roomId = null;
    });
  });
}

module.exports = { setupMultiplayer };
