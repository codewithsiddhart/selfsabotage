const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRoomCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

module.exports = { randomRoomCode };
