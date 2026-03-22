function healthHandler(_req, res) {
  res.json({
    ok: true,
    service: "self-sabotage-builder-api",
    time: new Date().toISOString(),
  });
}

module.exports = { healthHandler };
