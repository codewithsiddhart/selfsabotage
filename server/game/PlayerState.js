/**
 * @typedef {Object} PlayerRecord
 * @property {string} socketId
 * @property {string} displayName
 * @property {string | null} userId
 * @property {number} score
 * @property {{ x: number, y: number } | null} position
 * @property {number} lastSeq
 */

function createPlayerRecord(socketId, displayName, userId) {
  return {
    socketId,
    displayName,
    userId,
    score: 0,
    position: null,
    lastSeq: 0,
  };
}

module.exports = { createPlayerRecord };
