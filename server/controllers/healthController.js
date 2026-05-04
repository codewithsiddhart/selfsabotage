function healthHandler(_req, res) {
  res.json({
    ok: true,
    service: "tuffgame-multiplayer-api",
    time: new Date().toISOString(),
  });
}

module.exports = { healthHandler };
