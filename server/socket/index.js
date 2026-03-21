const { registerSocketHandlers, createConnectionMiddleware } = require("./handlers");

/**
 * @param {import("socket.io").Server} io
 * @param {import("../game/RoomManager").RoomManager} roomManager
 * @param {ReturnType<import("../db/persist").createPersistLayer>} persist
 */
function initSockets(io, roomManager, persist) {
  io.use(createConnectionMiddleware(persist));
  registerSocketHandlers(io, roomManager);
}

module.exports = { initSockets };
