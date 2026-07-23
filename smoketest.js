// Headless smoke test: loads the real index.html/script.js/mobile.js into jsdom (no browser
// available in this environment), stubs the handful of browser APIs jsdom doesn't implement
// (Canvas2D, AudioContext is simply absent and the app already tolerates that), and exercises
// the actual code paths touched by this session's changes.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function makeFakeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => {
        if (prop === "createLinearGradient" || prop === "createRadialGradient") {
          return { addColorStop() {} };
        }
        if (prop === "measureText") return { width: 10 };
        if (prop === "getImageData") return { data: [], width: 0, height: 0 };
        if (prop === "save" || prop === "restore" || prop === "beginPath" || prop === "closePath") return undefined;
        return undefined;
      };
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

async function main() {
  const errors = [];
  let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  // Strip script tags — we inject script.js/mobile.js manually after stubbing canvas, so
  // nothing here attempts a real network fetch of /socket.io/socket.io.js.
  html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

  const dom = new JSDOM(html, {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  const { window } = dom;

  window.addEventListener("error", (e) => {
    errors.push((e.error && e.error.stack) || e.message);
  });

  // Canvas2D isn't implemented by jsdom without the native `canvas` package; stub it with a
  // permissive proxy so every draw call the renderer makes is a harmless no-op.
  window.HTMLCanvasElement.prototype.getContext = () => makeFakeCtx();

  const scriptJs = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  const mobileJs = fs.readFileSync(path.join(__dirname, "mobile.js"), "utf8");

  try {
    window.eval(scriptJs);
  } catch (e) {
    errors.push("script.js top-level eval threw: " + e.stack);
  }
  try {
    window.eval(mobileJs);
  } catch (e) {
    errors.push("mobile.js top-level eval threw: " + e.stack);
  }

  // Let a few animation frames run (frame() reschedules itself via requestAnimationFrame).
  await new Promise((r) => setTimeout(r, 400));

  const SSB = window.SSB;
  if (!SSB) {
    console.error("FAIL: window.SSB was never exposed — script.js did not finish initializing.");
    console.error(errors.join("\n---\n"));
    process.exit(1);
  }

  function check(label, cond) {
    console.log((cond ? "PASS" : "FAIL") + " — " + label);
    if (!cond) errors.push("assertion failed: " + label);
  }

  check("SSB.getMode() starts in build mode", SSB.getMode() === "build");

  // ---- Player + minimal valid level ----
  SSB.createPlayer("SmokeTestPlayer");
  const save1 = SSB.getSave();
  const pid = Object.keys(save1.players)[0];
  SSB.setActivePlayer(pid);
  check("Active player set", SSB.getActivePlayer() && SSB.getActivePlayer().name === "SmokeTestPlayer");

  const T = SSB.Tile;
  SSB.placeTile(2, 10, T.start);
  SSB.placeTile(2, 11, T.platform);
  SSB.placeTile(20, 10, T.goal);
  SSB.placeTile(20, 11, T.platform);
  // Validation is intentionally debounced to the next frame (scheduleValidate/validateTimer)
  // rather than recomputed synchronously on every placeTile call — give it a tick.
  await new Promise((r) => setTimeout(r, 50));
  const v = SSB.getLastValidation();
  check("Minimal level validates OK (" + v.message + ")", v.ok === true);

  // ---- Build-reward teaser: first play of a fresh custom layout should set showBuildTeaser ----
  SSB.setMode("play");
  let play = SSB.getPlay();
  check("startPlay via setMode created a play state", !!play);
  check("Fresh custom layout's first play sets showBuildTeaser", play && play.showBuildTeaser === true);
  const buildTeaserEl = window.document.getElementById("buildTeaser");
  check("buildTeaser element lost .hidden after first play", buildTeaserEl && !buildTeaserEl.classList.contains("hidden"));
  check("buildTeaser element gained .show after first play", buildTeaserEl && buildTeaserEl.classList.contains("show"));
  check("buildTeaser has non-empty text", buildTeaserEl && buildTeaserEl.textContent.length > 0);

  // Restart the SAME layout — must NOT re-trigger the teaser (fingerprint already recorded).
  SSB.restartPlay(true);
  play = SSB.getPlay();
  check("Restarting the same layout does not re-trigger the teaser", play && play.showBuildTeaser === false);

  // ---- Hotkeys disabled during play, Escape closes whatever modal is open ----
  SSB.setMode("build");
  check("Back in build mode", SSB.getMode() === "build");

  function press(key) {
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
  }

  // Open Leaderboard via its button, then verify Escape (openSettings binding) closes THAT
  // modal rather than always opening Settings (the bug this session's TODO 1 fixed).
  const leaderboardBtn = window.document.getElementById("openLeaderboardBtn");
  leaderboardBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  const leaderboardModal = window.document.getElementById("leaderboardModal");
  const settingsModal = window.document.getElementById("settingsModal");
  check("Leaderboard modal opened", !leaderboardModal.classList.contains("hidden"));
  press("Escape");
  await new Promise((r) => setTimeout(r, 30));
  check("Escape closed the Leaderboard modal (not Settings)", leaderboardModal.classList.contains("hidden"));
  check("Escape did NOT open Settings on top of it", settingsModal.classList.contains("hidden"));

  // Hotkeys must be inert during Play.
  SSB.setMode("play");
  await new Promise((r) => setTimeout(r, 30));
  press("Escape");
  await new Promise((r) => setTimeout(r, 30));
  check("Escape does nothing while mode is play (no modal opened)", settingsModal.classList.contains("hidden"));
  SSB.restartPlay(); // get back to a clean, ended-false state isn't necessary; just leave play mode:
  SSB.setMode("build");

  // ---- Tile hotkeys (build mode only), generic TILE_ACTION_MAP dispatch ----
  SSB.selectTile(T.empty);
  press("3"); // tilePlatform
  await new Promise((r) => setTimeout(r, 30));
  check("Pressing '3' selects the Platform tile", SSB.getSelectedTile() === T.platform);

  // ---- Delegated uiHover/uiClick listeners don't throw on real buttons ----
  const buildBtn = window.document.getElementById("buildModeBtn");
  const playBtn = window.document.getElementById("playModeBtn");
  buildBtn.dispatchEvent(new window.Event("pointerover", { bubbles: true }));
  buildBtn.click();
  check("No errors after hovering/clicking a real .btn", errors.length === 0);

  // ---- Save Level: Enter-to-submit + a saved level's direct "Play" quick action ----
  const saveBtn = window.document.getElementById("saveLevelBtn");
  saveBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  const levelsModal = window.document.getElementById("levelsModal");
  check("Save Level opened the Levels modal", !levelsModal.classList.contains("hidden"));
  const nameInput = window.document.getElementById("saveLevelNameInput");
  nameInput.value = "Smoke Test Level";
  nameInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  const savedLevels = SSB.getActivePlayer().levels;
  check("Enter in the name field saved the level", Object.values(savedLevels).some((l) => l.name === "Smoke Test Level"));

  SSB.setMode("build"); // saving auto-closes the modal but doesn't change mode
  const openLevelsBtn = window.document.getElementById("openLevelsBtn");
  openLevelsBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  const playQuickBtn = Array.from(window.document.querySelectorAll("#levelsList .btn.success")).find((b) =>
    b.textContent.includes("Play")
  );
  check("Saved level list rendered a '▶ Play' quick action", !!playQuickBtn);
  if (playQuickBtn) {
    playQuickBtn.click();
    await new Promise((r) => setTimeout(r, 30));
    check("Clicking the saved level's Play action started a run", SSB.getMode() === "play" && !!SSB.getPlay());
    SSB.setMode("build");
  }

  console.log("\n" + (errors.length === 0 ? "ALL CHECKS PASSED" : `${errors.length} FAILURE(S)`));
  if (errors.length) {
    console.log(errors.join("\n---\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e.stack);
  process.exit(1);
});
