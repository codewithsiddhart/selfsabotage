const { createRateLimiter } = require("../utils/rateLimit");
const { parseDisplayName, parseRoomCode, parsePosition, parseAction, isUuidLike } = require("../utils/validation");
const { config } = require("../config");

/**
 * @param {import("socket.io").Server} io
 * @param {import("../game/RoomManager").RoomManager} roomManager
 */
function registerSocketHandlers(io, roomManager) {
  const posLimit = createRateLimiter({
    maxPerWindow: config.game.positionMaxPerSecond,
    windowMs: 1000,
  });
  const actLimit = createRateLimiter({
    maxPerWindow: config.game.actionMaxPerSecond,
    windowMs: 1000,
  });

  io.on("connection", (socket) => {
    socket.emit("connected", {
      socketId: socket.id,
      userId: socket.data.userId,
      config: {
        minPlayers: config.game.minPlayers,
        maxPlayersPerRoom: config.game.maxPlayersPerRoom,
        roundsPerMatch: config.game.roundsPerMatch,
        roundDurationMs: config.game.roundDurationMs,
      },
    });

    socket.on("room:create", (payload, ack) => {
      const displayName = parseDisplayName(
        (payload && payload.displayName) || socket.data.displayName
      );
      const maxPlayers = payload && payload.maxPlayers;
      const res = roomManager.createRoom(socket, {
        displayName,
        userId: socket.data.userId,
        maxPlayers,
      });
      if (typeof ack === "function") ack(res);
      if (!res.ok && typeof ack !== "function") socket.emit("error:msg", res);
    });

    socket.on("room:join", (payload, ack) => {
      const code = parseRoomCode(payload && payload.code);
      if (!code || code.length < 4) {
        const err = { ok: false, error: "INVALID_CODE" };
        if (typeof ack === "function") return ack(err);
        return socket.emit("error:msg", err);
      }
      const displayName = parseDisplayName(
        (payload && payload.displayName) || socket.data.displayName
      );
      const res = roomManager.joinRoom(socket, {
        code,
        displayName,
        userId: socket.data.userId,
      });
      if (typeof ack === "function") ack(res);
      if (!res.ok && typeof ack !== "function") socket.emit("error:msg", res);
    });

    socket.on("room:leave", (_payload, ack) => {
      const res = roomManager.leaveRoom(socket, true);
      if (typeof ack === "function") ack(res);
    });

    socket.on("game:start", (_payload, ack) => {
      const res = roomManager.startGame(socket);
      if (typeof ack === "function") ack(res);
      if (!res.ok && typeof ack !== "function") socket.emit("error:msg", res);
    });

    socket.on("game:position", (payload, ack) => {
      const key = `${socket.id}:pos`;
      if (!posLimit.allow(key)) {
        if (typeof ack === "function") ack({ ok: false, error: "RATE_LIMIT" });
        return;
      }
      const pos = parsePosition(payload);
      if (!pos) {
        if (typeof ack === "function") ack({ ok: false, error: "INVALID_POSITION" });
        return;
      }
      const seq = payload && payload.seq != null ? Number(payload.seq) : 0;
      const res = roomManager.updatePosition(socket, pos, seq);
      if (typeof ack === "function") ack(res);
    });

    socket.on("game:action", (payload, ack) => {
      const key = `${socket.id}:act`;
      if (!actLimit.allow(key)) {
        if (typeof ack === "function") ack({ ok: false, error: "RATE_LIMIT" });
        return;
      }
      const action = parseAction(payload);
      if (!action) {
        if (typeof ack === "function") ack({ ok: false, error: "INVALID_ACTION" });
        return;
      }
      const res = roomManager.relayAction(socket, action);
      if (typeof ack === "function") ack(res);
    });

    socket.on("disconnecting", () => {
      roomManager.leaveRoom(socket, true);
    });
  });
}

/**
 * Attach handshake metadata and optional Supabase user row.
 */
function createConnectionMiddleware(persist) {
  return async (socket, next) => {
    try {
      const q = socket.handshake.query || {};
      const displayName = parseDisplayName(q.displayName);
      const clientPublicId = isUuidLike(q.clientPublicId) ? String(q.clientPublicId).trim() : null;

      socket.data.displayName = displayName;
      socket.data.clientPublicId = clientPublicId;
      socket.data.userId = null;

      if (clientPublicId && persist) {
        socket.data.userId = await persist.registerPlayer({
          clientPublicId,
          displayName,
        });
      }

      next();
    } catch (e) {
      console.error("connection middleware", e);
      next(new Error("HANDSHAKE_FAILED"));
    }
  };
}

module.exports = { registerSocketHandlers, createConnectionMiddleware };
