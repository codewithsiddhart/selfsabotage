const { upsertUser, saveMatchResults } = require("./repositories");

/**
 * Bridges game events to Supabase (async, non-blocking for realtime).
 */
function createPersistLayer() {
  return {
    /**
     * When a player identifies themselves (handshake / join), ensure DB user exists.
     */
    async registerPlayer({ clientPublicId, displayName }) {
      const userId = await upsertUser({ clientPublicId, displayName });
      return userId;
    },

    /**
     * @param {{ room: import("../game/Room").Room, summary: object }} args
     */
    async onMatchEnded({ room, summary }) {
      const finalScores = (summary.finalScores || []).map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        score: r.score,
      }));

      await saveMatchResults({
        roomCode: room.code,
        serverRoomId: room.id,
        maxPlayers: room.maxPlayers,
        finalScores,
      });
    },
  };
}

module.exports = { createPersistLayer };
