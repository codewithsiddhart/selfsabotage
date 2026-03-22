const jwt = require("jsonwebtoken");

function getSecret() {
  const s = process.env.JWT_SECRET || "";
  if (process.env.NODE_ENV === "production") {
    if (!s) {
      throw new Error("JWT_SECRET is required in production. Set it in your environment.");
    }
    return s;
  }
  return s || "dev-only-change-me";
}

function signAuthToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: "60d" });
}

function verifyAuthToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

module.exports = { signAuthToken, verifyAuthToken };
