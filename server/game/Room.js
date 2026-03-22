const { randomRoomCode } = require("../utils/roomCode");

let roomSeq = 1;

/**
 * One multiplayer room: lobby, in-game state, and player slots (in-memory only).
 */
class Room {
  constructor({ maxPlayers, minPlayersToStart, hostSocketId, code }) {
    this.id = `room_${Date.now().toString(36)}_${(roomSeq++).toString(36)}`;
    this.code = code != null ? code : randomRoomCode(6);
    this.maxPlayers = maxPlayers;
    this.minPlayersToStart = minPlayersToStart;
    this.hostSocketId = hostSocketId;

    /** @type {Map<string, object>} */
    this.players = new Map();

    /** @type {"lobby"|"starting"|"playing"|"ended"} */
    this.phase = "lobby";

    /** Active match session while phase === "playing". */
    this.session = null;

    this.createdAt = Date.now();
  }

  getPlayerCount() {
    return this.players.size;
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  getPublicView() {
    return {
      id: this.id,
      code: this.code,
      phase: this.phase,
      maxPlayers: this.maxPlayers,
      minPlayersToStart: this.minPlayersToStart,
      hostSocketId: this.hostSocketId,
      players: Array.from(this.players.values()).map((p) => ({
        socketId: p.socketId,
        displayName: p.displayName,
        score: p.score,
        /** Do not expose internal user UUID to other clients if you prefer — kept for leaderboard join */
        userId: p.userId,
      })),
    };
  }
}

module.exports = { Room };
