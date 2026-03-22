/**
 * Multiplayer (Socket.IO) + REST API (auth / global leaderboard)
 *
 * LOCAL (same machine as the game): use "" so Socket.IO and /api/auth/* use the SAME origin
 * as the page (e.g. npm start → http://localhost:3000). Required for login when the HTML is
 * served from that server.
 *
 * HOSTED FRONTEND (Vercel, Netlify, etc.): set to your API Web Service URL (https, no slash).
 *
 * Optional: set API_SERVER_URL if REST and Socket should differ (rare).
 *
 * On Render, set CORS_ORIGIN to your frontend, e.g.:
 *   https://your-app.vercel.app,*.vercel.app
 * For opening index.html from disk (file://), add ",null" to CORS_ORIGIN (dev only).
 */
window.MULTIPLAYER_SERVER_URL = "https://selfsabotage.onrender.com";
// window.API_SERVER_URL = "https://selfsabotage.onrender.com"; // same as above if you set both explicitly
