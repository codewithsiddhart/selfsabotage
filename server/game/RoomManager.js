const { Room } = require("./Room");
const { createPlayerRecord } = require("./PlayerState");
const { GameSession } = require("./GameSession");
const { config } = require("../config");
const { parseMaxPlayers } = require("../utils/validation");
const { randomRoomCode } = require("../utils/roomCode");

/**
 * In-memory registry: room code → Room. Single process only (Render free = one instance).
 */
class RoomManager {
  constructor({ io, persist }) {
    this.io = io;
    this.persist = persist;
    /** @type {Map<string, Room>} */
    this.byCode = new Map();
    /** @type {Map<string, Room>} */
    this.byId = new Map();
    /** @type {Map<string, string>} socketId -> roomId */
    this.socketToRoomId = new Map();
  }

  getRoomForSocket(socketId) {
    const rid = this.socketToRoomId.get(socketId);
    if (!rid) return null;
    return this.byId.get(rid) || null;
  }

  _joinSocketRoom(socket, room) {
    socket.join(room.id);
    this.socketToRoomId.set(socket.id, room.id);
  }

  _leaveSocketRoom(socket, room) {
    socket.leave(room.id);
    this.socketToRoomId.delete(socket.id);
  }

  broadcastRoom(room) {
    this.io.to(room.id).emit("room:state", room.getPublicView());
  }

  /**
   * @param {import("socket.io").Socket} socket
   * @param {{ displayName: string, userId: string | null, maxPlayers?: number }} payload
   */
  createRoom(socket, payload) {
    const cap = config.game.maxPlayersPerRoom;
    const max = parseMaxPlayers(payload.maxPlayers, cap) || cap;
    const min = Math.min(config.game.minPlayers, max);

    let code;
    let attempts = 0;
    const maxAttempts = 50;
    do {
      code = randomRoomCode(6);
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error("Failed to generate unique room code");
      }
    } while (this.byCode.has(code));

    const room = new Room({
      maxPlayers: max,
      minPlayersToStart: min,
      hostSocketId: socket.id,
      code,
    });

    this.byCode.set(room.code, room);
    this.byId.set(room.id, room);

    const player = createPlayerRecord(socket.id, payload.displayName, payload.userId);
    room.players.set(socket.id, player);
    this._joinSocketRoom(socket, room);

    this.broadcastRoom(room);
    return { ok: true, room: room.getPublicView() };
  }

  /**
   * @param {import("socket.io").Socket} socket
   * @param {{ code: string, displayName: string, userId: string | null }} payload
   */
  joinRoom(socket, payload) {
    const room = this.byCode.get(payload.code);
    if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
    if (room.phase !== "lobby") return { ok: false, error: "GAME_ALREADY_STARTED" };
    if (room.isFull()) return { ok: false, error: "ROOM_FULL" };
    if (room.players.has(socket.id)) {
      return { ok: true, room: room.getPublicView() };
    }

    const old = this.getRoomForSocket(socket.id);
    if (old && old.id !== room.id) {
      this.leaveRoom(socket, false);
    }

    const player = createPlayerRecord(socket.id, payload.displayName, payload.userId);
    room.players.set(socket.id, player);
    this._joinSocketRoom(socket, room);

    this.broadcastRoom(room);
    return { ok: true, room: room.getPublicView() };
  }

  /**
   * @param {import("socket.io").Socket} socket
   * @param {boolean} broadcast
   */
  leaveRoom(socket, broadcast = true) {
    const room = this.getRoomForSocket(socket.id);
    if (!room) return { ok: false, error: "NOT_IN_ROOM" };

    const wasPlaying = room.phase === "playing" && room.session;

    room.players.delete(socket.id);
    this._leaveSocketRoom(socket, room);

    if (room.hostSocketId === socket.id && room.players.size > 0) {
      room.hostSocketId = room.players.keys().next().value;
    }

    if (room.players.size === 0) {
      if (room.session) room.session.dispose();
      room.session = null;
      this.byCode.delete(room.code);
      this.byId.delete(room.id);
    } else {
      if (wasPlaying && room.players.size < 2) {
        if (room.session) room.session.dispose();
        room.session = null;
        room.phase = "ended";
        this.io.to(room.id).emit("game:event", {
          type: "game:aborted",
          reason: "NOT_ENOUGH_PLAYERS",
          message: "A player left during the match.",
        });
      }
      if (broadcast) this.broadcastRoom(room);
    }

    return { ok: true };
  }

  /**
   * Host-only start: transition lobby → playing and attach GameSession.
   * @param {import("socket.io").Socket} socket
   */
  startGame(socket) {
    const room = this.getRoomForSocket(socket.id);
    if (!room) return { ok: false, error: "NOT_IN_ROOM" };
    if (room.hostSocketId !== socket.id) return { ok: false, error: "NOT_HOST" };
    if (room.phase !== "lobby") return { ok: false, error: "INVALID_PHASE" };
    if (room.getPlayerCount() < room.minPlayersToStart) {
      return { ok: false, error: "NOT_ENOUGH_PLAYERS" };
    }

    room.phase = "starting";
    this.broadcastRoom(room);

    const delay = config.game.lobbyCountdownMs;
    setTimeout(() => this._actuallyStartGame(room), delay);

    return { ok: true, startsInMs: delay };
  }

  /**
   * @param {Room} room
   */
  _actuallyStartGame(room) {
    if (!this.byId.has(room.id)) return;
    if (room.phase !== "starting") return;

    room.phase = "playing";
    room.session = new GameSession({
      roomId: room.id,
      roomCode: room.code,
      totalRounds: config.game.roundsPerMatch,
      roundDurationMs: config.game.roundDurationMs,
      onBroadcastState: (evt) => {
        this.io.to(room.id).emit("game:event", evt);
      },
      onRoundEnd: (roundResult) => {
        this.io.to(room.id).emit("game:event", { type: "round:ended", ...roundResult });
        this.broadcastRoom(room);
      },
      onGameEnd: async (summary) => {
        room.phase = "ended";
        if (room.session) {
          room.session.dispose();
          room.session = null;
        }
        this.io.to(room.id).emit("game:event", { type: "game:ended", ...summary });
        this.broadcastRoom(room);
        if (this.persist) {
          try {
            await this.persist.onMatchEnded({ room, summary });
          } catch (e) {
            console.error("persist.onMatchEnded", e);
          }
        }
      },
    });

    room.session.start(room.players);
    this.broadcastRoom(room);
  }

  /**
   * @param {import("socket.io").Socket} socket
   * @param {{ x: number, y: number }} pos
   * @param {number} seq
   */
  updatePosition(socket, pos, seq) {
    const room = this.getRoomForSocket(socket.id);
    if (!room || room.phase !== "playing") return { ok: false };
    const pl = room.players.get(socket.id);
    if (!pl) return { ok: false };
    const s = Math.trunc(seq);
    if (Number.isFinite(s) && s > pl.lastSeq) pl.lastSeq = s;
    pl.position = { x: pos.x, y: pos.y };
    socket.to(room.id).emit("player:position", {
      socketId: socket.id,
      x: pos.x,
      y: pos.y,
      seq: pl.lastSeq,
    });
    return { ok: true };
  }

  /**
   * Relay validated action to other clients (server does not trust game outcome here).
   * @param {import("socket.io").Socket} socket
   * @param {{ type: string, meta: object | null }} action
   */
  relayAction(socket, action) {
    const room = this.getRoomForSocket(socket.id);
    if (!room || room.phase !== "playing") return { ok: false };
    if (!room.players.has(socket.id)) return { ok: false };
    socket.to(room.id).emit("player:action", {
      socketId: socket.id,
      type: action.type,
      meta: action.meta,
      at: Date.now(),
    });
    return { ok: true };
  }
}

module.exports = { RoomManager };
