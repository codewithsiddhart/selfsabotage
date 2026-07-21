/**
 * Self-Sabotage Builder — local hosting server + real-time multiplayer (Socket.IO)
 * © 2026 NeuroGlitch. All Rights Reserved.
 * NeuroGlitch is an independent game development and software initiative. This project,
 * including the game "Self-Sabotage Builder", is the intellectual property of NeuroGlitch.
 * Founders: Siddharth (Discord: perfect_humann), Harshit (Discord: mehuman123).
 * All rights reserved. Unauthorized copying, redistribution, or reproduction is strictly prohibited.
 *
 * Serves the game on 0.0.0.0:3000 (or PORT). Use ngrok http 3000 to share a public URL.
 */

const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { initMultiplayer } = require("./mp-server");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname, { index: "index.html" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});
initMultiplayer(io);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Self-Sabotage Builder running at http://localhost:${PORT}`);
  console.log(`Socket.IO multiplayer enabled. For public access: ngrok http ${PORT}`);
});
