/**
 * Multiplayer (Socket.IO) — where the game connects
 *
 * • Local (`npm start` and open http://localhost:3000): leave this as "" so the client
 *   uses the same host as the page (your computer).
 * • Vercel / any static host: set to your Render Web Service URL (https, no trailing slash).
 *
 * Example: "https://tuffgame-api.onrender.com"
 *
 * On Render, CORS_ORIGIN must allow your Vercel site, e.g.:
 *   https://your-app.vercel.app,*.vercel.app
 * (*.vercel.app covers preview URLs like your-app-git-main-xxx.vercel.app)
 */
window.MULTIPLAYER_SERVER_URL = "https://selfsabotage.onrender.com";
