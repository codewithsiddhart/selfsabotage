(() => {
  "use strict";

  // =========================================================
  // Self-Sabotage Builder — NeuroGlitch
  // © 2026 NeuroGlitch. All Rights Reserved.
  // NeuroGlitch is an independent game development and software initiative focused on
  // creating innovative, system-driven interactive experiences. This project, including
  // the game "Self-Sabotage Builder", its systems, mechanics, visuals, logic, and design,
  // is the intellectual property of NeuroGlitch.
  // Founders and Creators: Siddharth (Discord: perfect_humann), Harshit (Discord: mehuman123).
  // All rights reserved. Unauthorized copying, redistribution, or reproduction is strictly prohibited.
  // =========================================================
  //
  // Key design goals:
  // - Build mode hides sabotage; Play mode activates sabotage per run (seeded, consistent).
  // - Clean input (WASD + arrows), no missed presses, no "sticky" keys.
  // - Local player profiles with levels, stats, difficulty/points, and local leaderboard.
  // - No external dependencies and no audio files: lightweight procedural audio via WebAudio.

  // ---------- DOM ----------
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

  const elPalette = $("palette");
  const elBuildBtn = /** @type {HTMLButtonElement} */ ($("buildModeBtn"));
  const elPlayBtn = /** @type {HTMLButtonElement} */ ($("playModeBtn"));
  const elRestartBtn = /** @type {HTMLButtonElement} */ ($("restartBtn"));
  const elClearBtn = /** @type {HTMLButtonElement} */ ($("clearBtn"));
  const elSaveLevelBtn = /** @type {HTMLButtonElement} */ ($("saveLevelBtn"));
  const elStatusPill = $("statusPill");
  const elToast = $("toast");
  const elRunHint = $("runHint");
  const elBudgetPill = $("budgetPill");
  const elDifficultyValue = $("difficultyValue");
  const elValidationValue = $("validationValue");

  const elProfileChip = $("profileChip");
  const elActivePlayerName = $("activePlayerName");

  const elOpenLevelsBtn = /** @type {HTMLButtonElement} */ ($("openLevelsBtn"));
  const elOpenLeaderboardBtn = /** @type {HTMLButtonElement} */ ($("openLeaderboardBtn"));
  const elOpenSettingsBtn = /** @type {HTMLButtonElement} */ ($("openSettingsBtn"));

  const elBackdrop = $("modalBackdrop");
  const elStartModal = $("startModal");
  const elCloseStartModalBtn = /** @type {HTMLButtonElement} */ ($("closeStartModalBtn"));
  const elPlayerSearchInput = /** @type {HTMLInputElement} */ ($("playerSearchInput"));
  const elPlayerSearchBtn = /** @type {HTMLButtonElement} */ ($("playerSearchBtn"));
  const elPlayerList = $("playerList");
  const elNewPlayerInput = /** @type {HTMLInputElement} */ ($("newPlayerInput"));
  const elCreatePlayerBtn = /** @type {HTMLButtonElement} */ ($("createPlayerBtn"));

  const elLevelsModal = $("levelsModal");
  const elCloseLevelsModalBtn = /** @type {HTMLButtonElement} */ ($("closeLevelsModalBtn"));
  const elSaveLevelNameInput = /** @type {HTMLInputElement} */ ($("saveLevelNameInput"));
  const elConfirmSaveLevelBtn = /** @type {HTMLButtonElement} */ ($("confirmSaveLevelBtn"));
  const elLevelsList = $("levelsList");

  const elLeaderboardModal = $("leaderboardModal");
  const elCloseLeaderboardModalBtn = /** @type {HTMLButtonElement} */ ($("closeLeaderboardModalBtn"));
  const elLeaderboardSearchInput = /** @type {HTMLInputElement} */ ($("leaderboardSearchInput"));
  const elLeaderboardSearchBtn = /** @type {HTMLButtonElement} */ ($("leaderboardSearchBtn"));
  const elLeaderboardList = $("leaderboardList");

  const elSettingsModal = $("settingsModal");
  const elCloseSettingsModalBtn = /** @type {HTMLButtonElement} */ ($("closeSettingsModalBtn"));
  const elSoundToggle = /** @type {HTMLInputElement} */ ($("soundToggle"));
  const elBackgroundSelect = /** @type {HTMLSelectElement} */ ($("backgroundSelect"));
  const elSabotageSlider = /** @type {HTMLInputElement} */ ($("sabotageSlider"));
  const elSabotageValue = $("sabotageValue");
  const elKeybindList = $("keybindList");

  const elQuickRandomBtn = /** @type {HTMLButtonElement} */ ($("quickRandomBtn"));
  const elLevelListByTier = $("levelListByTier");

  const elEndOverlay = $("endOverlay");
  const elEndOverlayMessage = $("endOverlayMessage");
  const elEndOverlayStats = $("endOverlayStats");
  const elEndRetryBtn = /** @type {HTMLButtonElement} */ ($("endRetryBtn"));
  const elEndNextLevelBtn = /** @type {HTMLButtonElement} */ ($("endNextLevelBtn"));
  const elEndBuildBtn = /** @type {HTMLButtonElement} */ ($("endBuildBtn"));

  const elDeviceModal = $("deviceModal");
  const elDeviceDesktopBtn = /** @type {HTMLButtonElement} */ ($("deviceDesktopBtn"));
  const elDeviceMobileBtn = /** @type {HTMLButtonElement} */ ($("deviceMobileBtn"));
  const elMobilePlayDock = $("mobilePlayDock");
  const elTouchLeft = /** @type {HTMLButtonElement} */ ($("touchLeft"));
  const elTouchRight = /** @type {HTMLButtonElement} */ ($("touchRight"));
  const elTouchJump = /** @type {HTMLButtonElement} */ ($("touchJump"));
  const elTouchRestartBtn = /** @type {HTMLButtonElement | null} */ ($("touchRestartBtn"));
  const elTouchModeToggleBtn = /** @type {HTMLButtonElement | null} */ ($("touchModeToggleBtn"));
  const elTouchEraserBtn = /** @type {HTMLButtonElement | null} */ ($("touchEraserBtn"));
  const elTouchClearGridBtn = /** @type {HTMLButtonElement | null} */ ($("touchClearGridBtn"));
  const elThemeSelect = /** @type {HTMLSelectElement} */ ($("themeSelect"));
  const elVolumeSlider = /** @type {HTMLInputElement} */ ($("volumeSlider"));
  const elVolumeValue = $("volumeValue");
  const elDebugOverlayToggle = /** @type {HTMLInputElement | null} */ ($("debugOverlayToggle"));
  const elAmbientNoiseSelect = /** @type {HTMLSelectElement | null} */ ($("ambientNoiseSelect"));
  const elExitToMenuBtn = /** @type {HTMLButtonElement} */ ($("exitToMenuBtn"));
  const elTimerPill = $("timerPill");

  const elMultiplayerBtn = /** @type {HTMLButtonElement | null} */ ($("multiplayerBtn"));
  const elMpSubmitLevelBtn = /** @type {HTMLButtonElement | null} */ ($("mpSubmitLevelBtn"));
  const elMpMatchmaking = $("mpMatchmaking");
  const elMpQueueCloseBtn = /** @type {HTMLButtonElement | null} */ ($("mpQueueCloseBtn"));
  const elMpBuildHint = $("mpBuildHint");
  const elMpMatchEndCloseBtn = /** @type {HTMLButtonElement | null} */ ($("mpMatchEndCloseBtn"));
  const elMpWaitBuild = $("mpWaitBuild");
  const elMpSpectate = $("mpSpectate");
  const elMpSpectateTitle = $("mpSpectateTitle");
  const elMpSpectateBody = $("mpSpectateBody");
  const elMpRound3Overlay = $("mpRound3Overlay");
  const elMpRound3Countdown = $("mpRound3Countdown");
  const elMpMatchEnd = $("mpMatchEnd");
  const elMpMatchEndTitle = $("mpMatchEndTitle");
  const elMpMatchEndScores = $("mpMatchEndScores");
  const elMpRematchBtn = /** @type {HTMLButtonElement | null} */ ($("mpRematchBtn"));
  const elMpDeclineRematchBtn = /** @type {HTMLButtonElement | null} */ ($("mpDeclineRematchBtn"));
  const elMpHud = $("mpHud");
  const elMpHudRound = $("mpHudRound");
  const elMpHudRole = $("mpHudRole");
  const elMpHudScore = $("mpHudScore");
  const elMobileExitBuildBtn = /** @type {HTMLButtonElement | null} */ ($("mobileExitBuildBtn"));
  const elMpChatDock = $("mpChatDock");
  const elMpChatExpanded = $("mpChatExpanded");
  const elMpChatPeekBar = $("mpChatPeekBar");
  const elMpChatCollapseBtn = /** @type {HTMLButtonElement | null} */ ($("mpChatCollapseBtn"));
  const elMpChatExpandBtn = /** @type {HTMLButtonElement | null} */ ($("mpChatExpandBtn"));
  const elMpChatMessages = $("mpChatMessages");
  const elMpChatInput = /** @type {HTMLInputElement | null} */ ($("mpChatInput"));
  const elMpChatSend = /** @type {HTMLButtonElement | null} */ ($("mpChatSend"));
  const elAuthAccountBtn = /** @type {HTMLButtonElement | null} */ ($("authAccountBtn"));
  const elAuthModal = $("authModal");
  const elAuthBackdrop = $("authBackdrop");
  const elAuthModalCloseBtn = /** @type {HTMLButtonElement | null} */ ($("authModalCloseBtn"));
  const elAuthFormLogin = $("authLoginForm");
  const elAuthFormRegister = $("authRegisterForm");
  const elAuthLoginUser = /** @type {HTMLInputElement | null} */ ($("authLoginUser"));
  const elAuthLoginPass = /** @type {HTMLInputElement | null} */ ($("authLoginPass"));
  const elAuthRegUser = /** @type {HTMLInputElement | null} */ ($("authRegUser"));
  const elAuthRegPass = /** @type {HTMLInputElement | null} */ ($("authRegPass"));
  const elAuthLoginBtn = /** @type {HTMLButtonElement | null} */ ($("authLoginBtn"));
  const elAuthRegisterBtn = /** @type {HTMLButtonElement | null} */ ($("authRegisterBtn"));
  const elAuthShowRegisterBtn = /** @type {HTMLButtonElement | null} */ ($("authShowRegisterBtn"));
  const elAuthShowLoginBtn = /** @type {HTMLButtonElement | null} */ ($("authShowLoginBtn"));
  const elAuthStatus = $("authStatus");
  const elGlobalLeaderboardList = $("globalLeaderboardList");
  const elGlobalLbHint = $("globalLbHint");
  const elMobilePortraitLock = $("mobilePortraitLock");
  const elLoginGateBackdrop = $("loginGateBackdrop");
  const elLoginGateModal = $("loginGateModal");
  const elGateStatus = $("gateStatus");
  const elMobileMpChatFab = /** @type {HTMLButtonElement | null} */ ($("mobileMpChatFab"));

  const AUTH_TOKEN_KEY = "ssb_auth_token_v1";
  const LOCAL_ONLY_KEY = "ssb_local_only_v1";

  function getAuthToken() {
    try {
      return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function setAuthToken(token, persistToLocal) {
    try {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      if (!token) return;
      if (persistToLocal) localStorage.setItem(AUTH_TOKEN_KEY, token);
      else sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  }

  function hasPassedLoginGate() {
    return !!getAuthToken() || localStorage.getItem(LOCAL_ONLY_KEY) === "1";
  }

  function isMultiplayerBlockedLocalOnly() {
    return localStorage.getItem(LOCAL_ONLY_KEY) === "1" && !getAuthToken();
  }

  function syncLocalOnlyMultiplayerUi() {
    if (!elMultiplayerBtn) return;
    const blocked = isMultiplayerBlockedLocalOnly();
    elMultiplayerBtn.disabled = blocked;
    elMultiplayerBtn.title = blocked ? "Sign in with an account to use online multiplayer." : "";
  }

  /** REST API origin. Same host as the current page → "" (relative /api/…, no CORS). Else full origin from config. */
  function getApiBase() {
    try {
      const w = typeof window !== "undefined" ? window : null;
      if (!w || !w.location || !w.location.href) return "";
      const pageOrigin = new URL(w.location.href).origin;

      function sameOriginAsPage(urlStr) {
        const t = String(urlStr || "").trim();
        if (!t) return false;
        const abs = /^https?:\/\//i.test(t) ? t : `https://${t}`;
        return new URL(abs).origin === pageOrigin;
      }

      if (typeof w.API_SERVER_URL === "string" && w.API_SERVER_URL.trim()) {
        const s = w.API_SERVER_URL.trim().replace(/\/$/, "");
        if (sameOriginAsPage(s)) return "";
        return s;
      }
      if (typeof w.MULTIPLAYER_SERVER_URL === "string" && w.MULTIPLAYER_SERVER_URL.trim()) {
        const s = w.MULTIPLAYER_SERVER_URL.trim().replace(/\/$/, "");
        if (sameOriginAsPage(s)) return "";
        return s;
      }
      return "";
    } catch {
      return "";
    }
  }

  /** Full URL for /api/... calls (cross-origin or same-origin). */
  function apiUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    const base = getApiBase();
    if (base) return `${base}${p}`;
    return p;
  }

  function isFileProtocolPage() {
    return typeof window !== "undefined" && window.location && window.location.protocol === "file:";
  }

  /** Online match client state (Socket.IO). Declared early for menu/exit handlers. */
  const mpSession = {
    active: false,
    /** @type {any} */
    socket: null,
    /** @type {"off"|"queue"|"mpBuild"|"mpWaitBuild"|"mpSpectate"|"mpSpectatePlay"|"mpPlayOpponent"|"mpRound3"|"mpMatchEnd"} */
    phase: "off",
    youIndex: 0,
    opponentName: "",
    rematchSelfConfirmed: false,
  };

  // ---------- Constants ----------
  const TILE = 32;
  const COLS = Math.floor(canvas.width / TILE);
  const ROWS = Math.floor(canvas.height / TILE);

  const BUILD_LIMITS = /** @type {const} */ ({
    platform: 180,
    spikes: 80,
    jumppad: 50,
    hex: 20,
    lava: 30,
    speedBoost: 20,
    food: 15,
    pathBlock: 60,
  });

  const POINTS = /** @type {const} */ ({
    platform: 1.0,
    spikes: 2.0,
    jumppad: 1.5,
    hex: 2.5,
    lava: 3.0,
    speedBoost: 1.5,
    food: 1.0,
    pathBlock: 0,
  });

  const PHYS = /** @type {const} */ ({
    // Slightly more forgiving feel
    accel: 2200,
    maxSpeed: 295,
    friction: 2100,
    gravity: 1550,
    jumpV: 590,
    airControl: 0.78,
  });

  /** @typedef {"empty"|"start"|"goal"|"platform"|"spikes"|"jumppad"|"hex"|"lava"|"speedBoost"|"food"|"pathBlock"} TileType */
  const Tile = /** @type {const} */ ({
    empty: "empty",
    start: "start",
    goal: "goal",
    platform: "platform",
    spikes: "spikes",
    jumppad: "jumppad",
    hex: "hex",
    lava: "lava",
    speedBoost: "speedBoost",
    food: "food",
    pathBlock: "pathBlock",
  });

  const TileInfo = /** @type {Record<TileType, {name:string, hint:string, color:string}>} */ ({
    empty: { name: "Eraser", hint: "Remove tiles", color: "transparent" },
    start: { name: "Start", hint: "Spawn point (required)", color: "rgba(122, 167, 255, 1)" },
    goal: { name: "Goal", hint: "Touch to win (required)", color: "rgba(251, 191, 36, 1)" },
    platform: { name: "Platform", hint: "Solid ground (may betray you)", color: "rgba(79, 103, 255, 1)" },
    spikes: { name: "Spikes", hint: "Kills you (may activate late)", color: "rgba(255, 77, 109, 1)" },
    jumppad: { name: "Jump Pad", hint: "Launches you (may misfire)", color: "rgba(45, 212, 191, 1)" },
    hex: { name: "Hex", hint: "Curses you (special sabotage)", color: "rgba(167, 139, 250, 1)" },
    lava: { name: "Lava", hint: "Instant death", color: "rgba(234, 88, 12, 1)" },
    speedBoost: { name: "Speed", hint: "Temporary speed boost", color: "rgba(34, 197, 94, 1)" },
    food: { name: "Food", hint: "Restore stability, reduce sabotage", color: "rgba(251, 146, 60, 1)" },
    pathBlock: { name: "Path Block", hint: "Marks intended path (for validation)", color: "rgba(150, 200, 255, 0.6)" },
  });

  const paletteOrder = /** @type {TileType[]} */ ([
    Tile.start,
    Tile.goal,
    Tile.platform,
    Tile.spikes,
    Tile.jumppad,
    Tile.hex,
    Tile.lava,
    Tile.speedBoost,
    Tile.food,
    Tile.pathBlock,
    Tile.empty,
  ]);

  const TilePaletteIcon = /** @type {Record<TileType, string>} */ ({
    empty: "⌧",
    start: "🏁",
    goal: "⭐",
    platform: "▭",
    spikes: "▲",
    jumppad: "⌃",
    hex: "✦",
    lava: "≈",
    speedBoost: "⚡",
    food: "●",
    pathBlock: "◇",
  });

  // ---------- Storage ----------
  const SAVE_KEY = "SSB_SAVE_V2";
  const DEVICE_KEY = "SSB_DEVICE";

  /** After device picker, closing auth should open start modal if still no player. */
  let authCloseOpensStart = false;

  /** Multiplayer chat: user minimized panel (still show gray peek / +). */
  let mpChatUserCollapsed = false;
  /** Desktop: hover temporarily expands peek while collapsed. */
  let mpChatPeekHover = false;

  /**
   * @typedef {Object} SavedLevel
   * @property {string} id
   * @property {string} name
   * @property {number} createdAt
   * @property {number} updatedAt
   * @property {TileType[]} tilesFlat
   * @property {number} cols
   * @property {number} rows
   * @property {{platform:number, spikes:number, jumppad:number, hex:number}} counts
   * @property {number} difficulty
   * @property {number} completions
   * @property {number} bestPointsEarned
   * @property {number} bestDifficultyBeaten
   */

  /**
   * @typedef {Object} PlayerPowerups
   * @property {number} doubleJump
   * @property {number} speedBoost
   * @property {number} protection
   */
  /**
   * @typedef {Object} PlayerStats
   * @property {number} totalRuns
   * @property {number} totalWins
   * @property {number} totalDeaths
   * @property {number} totalPointsEarned
   * @property {number} bestDifficultyBeaten
   * @property {string} mostCompletedLevelId
   */

  /**
   * @typedef {Object} PlayerRecord
   * @property {string} id
   * @property {string} name
   * @property {number} createdAt
   * @property {PlayerStats} stats
   * @property {PlayerPowerups} powerups
   * @property {Record<string, SavedLevel>} levels
   */

  /**
   * @typedef {Object} SaveData
   * @property {2} version
   * @property {string | null} activePlayerId
   * @property {{
   *   theme:string,
   *   sound:boolean,
   *   volume:number,
   *   background:string,
   *   sabotageLevel:number,
   *   keybinds: Record<string, string>,
   *   debugOverlay: boolean,
   *   ambientNoise: "off"|"white"|"pink"|"brown"
   * }} settings
   * @property {Record<string, PlayerRecord>} players
   */

  /** @type {SaveData} */
  let save = loadSave();
  /** @type {PlayerRecord | null} */
  let activePlayer = null;

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed = /** @type {any} */ (JSON.parse(raw));
      if (!parsed || parsed.version !== 2) return defaultSave();
      if (!parsed.players) parsed.players = {};
      for (const p of Object.values(parsed.players)) {
        if (!p.powerups) p.powerups = { doubleJump: 0, speedBoost: 0, protection: 0 };
      }
      if (!parsed.settings) parsed.settings = defaultSave().settings;
      const allowedThemes = ["dark", "light", "forest", "indian", "cute"];
      if (!allowedThemes.includes(parsed.settings.theme)) parsed.settings.theme = "dark";
      if (typeof parsed.settings.sound !== "boolean") parsed.settings.sound = true;
      const allowedBg = ["nebula", "grid", "dusk", "forest", "indian", "cuteFlowers", "city"];
      if (!allowedBg.includes(parsed.settings.background)) parsed.settings.background = "nebula";
      if (typeof parsed.settings.volume !== "number") parsed.settings.volume = 0.7;
      if (typeof parsed.settings.sabotageLevel !== "number") parsed.settings.sabotageLevel = 5;
      if (!parsed.settings.keybinds) parsed.settings.keybinds = defaultKeybinds();
      if (typeof parsed.settings.debugOverlay !== "boolean") parsed.settings.debugOverlay = false;
      const amb = parsed.settings.ambientNoise;
      if (amb !== "off" && amb !== "white" && amb !== "pink" && amb !== "brown") parsed.settings.ambientNoise = "off";
      if (!("activePlayerId" in parsed)) parsed.activePlayerId = null;
      return /** @type {SaveData} */ (parsed);
    } catch {
      return defaultSave();
    }
  }

  function defaultSave() {
    return /** @type {SaveData} */ ({
      version: 2,
      activePlayerId: null,
      settings: {
        theme: "dark",
        sound: true,
        volume: 0.7,
        background: "nebula",
        sabotageLevel: 5,
        keybinds: defaultKeybinds(),
        debugOverlay: false,
        ambientNoise: "off",
      },
      players: {},
    });
  }

  function defaultKeybinds() {
    // Stored as normalized keys from normalizeKey(): arrowleft, arrowright, w, a, space, etc.
    return /** @type {Record<string, string>} */ ({
      restart: "r",
      toggleBuild: "b",
      togglePlay: "p",
      openSettings: "escape",
      openLevels: "l",
    });
  }

  function persist() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function createPlayer(name) {
    const clean = sanitizeName(name);
    if (!clean) return null;
    // Unique by case-insensitive match.
    for (const p of Object.values(save.players)) {
      if (p.name.toLowerCase() === clean.toLowerCase()) return p;
    }
    const id = `p_${uid()}`;
    const now = Date.now();
    const p = /** @type {PlayerRecord} */ ({
      id,
      name: clean,
      createdAt: now,
      stats: {
        totalRuns: 0,
        totalWins: 0,
        totalDeaths: 0,
        totalPointsEarned: 0,
        bestDifficultyBeaten: 0,
        mostCompletedLevelId: "",
      },
      powerups: { doubleJump: 0, speedBoost: 0, protection: 0 },
      levels: {},
    });
    save.players[id] = p;
    save.activePlayerId = id;
    persist();
    return p;
  }

  function setActivePlayer(playerId) {
    const p = save.players[playerId] || null;
    activePlayer = p;
    save.activePlayerId = p ? p.id : null;
    persist();
    syncProfileUI();
    refreshLevelsList();
    refreshLeaderboard();
    if (!p) openStartModal();
  }

  function syncProfileUI() {
    elActivePlayerName.textContent = activePlayer ? activePlayer.name : "—";
  }

  function sanitizeName(s) {
    const t = (s || "").trim().replace(/\s+/g, " ");
    if (t.length < 2) return "";
    return t.slice(0, 18);
  }

  // ---------- Audio: SFX + optional ambient noise (no music). Single context; one noise loop at a time. ----------
  const AudioSys = (() => {
    /** @type {AudioContext | null} */
    let ac = null;
    /** @type {GainNode | null} */
    let master = null;
    /** @type {GainNode | null} */
    let ambientGain = null;
    /** @type {AudioBufferSourceNode | null} */
    let ambientSource = null;
    /** @type {"white"|"pink"|"brown"|null} */
    let ambientPlayingType = null;
    let sfxEnabled = true;

    const AMBIENT_SEC = 10;
    const LOOP_BLEND = 2048;

    function ensure() {
      if (ac) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        ac = new Ctx();
        master = ac.createGain();
        master.gain.value = getSfxVolumeGain();
        master.connect(ac.destination);
        ambientGain = ac.createGain();
        ambientGain.gain.value = 0;
        ambientGain.connect(ac.destination);
      } catch {
        // AudioContext failed
      }
    }

    function getSfxVolumeGain() {
      const v = typeof save.settings.volume === "number" ? save.settings.volume : 0.7;
      return Math.max(0, Math.min(1, v)) * 0.5;
    }

    function getAmbientVolumeGain() {
      if (!save.settings.sound || !sfxEnabled) return 0;
      const mode = save.settings.ambientNoise || "off";
      if (mode === "off") return 0;
      const v = typeof save.settings.volume === "number" ? save.settings.volume : 0.7;
      const base = Math.max(0, Math.min(1, v));
      return base * 0.14;
    }

    function setVolume(vol) {
      if (master) master.gain.value = Math.max(0, Math.min(1, vol)) * 0.5;
      refreshAmbientGain();
    }

    /** Blend buffer edges so loop=true has no click (noise continuity). */
    function blendLoopSeam(data) {
      const n = data.length;
      const w = Math.min(LOOP_BLEND, Math.floor(n / 4));
      if (w < 64) return;
      for (let i = 0; i < w; i++) {
        const t = i / w;
        const a = data[i];
        const b = data[n - w + i];
        const m = a * (1 - t) + b * t;
        data[i] = m;
        data[n - w + i] = m;
      }
    }

    function fillNoiseWhite(data) {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }

    function fillNoisePink(data) {
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }

    function fillNoiseBrown(data) {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.0045 * white) * 0.9935;
        data[i] = Math.max(-1, Math.min(1, last * 3.8));
      }
    }

    function stopAmbient() {
      ambientPlayingType = null;
      if (ambientSource) {
        try {
          ambientSource.stop();
        } catch {
          /* already stopped */
        }
        try {
          ambientSource.disconnect();
        } catch {
          /* ignore */
        }
        ambientSource = null;
      }
    }

    function refreshAmbientGain() {
      if (!ambientGain || !ac) return;
      const g = getAmbientVolumeGain();
      const t = ac.currentTime;
      ambientGain.gain.cancelScheduledValues(t);
      ambientGain.gain.setTargetAtTime(g, t, 0.02);
    }

    /** @param {"white"|"pink"|"brown"} type */
    function startAmbientLoop(type) {
      stopAmbient();
      ensure();
      if (!ac || !ambientGain) return;
      const length = Math.floor(ac.sampleRate * AMBIENT_SEC);
      const buf = ac.createBuffer(1, length, ac.sampleRate);
      const data = buf.getChannelData(0);
      if (type === "white") fillNoiseWhite(data);
      else if (type === "pink") fillNoisePink(data);
      else fillNoiseBrown(data);
      blendLoopSeam(data);

      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(ambientGain);
      ambientSource = src;
      ambientPlayingType = type;
      refreshAmbientGain();
      try {
        src.start(0);
      } catch {
        ambientSource = null;
        ambientPlayingType = null;
      }
    }

    function applyAmbientFromSettings() {
      const mode = save.settings.ambientNoise || "off";
      if (!save.settings.sound || !sfxEnabled || mode === "off") {
        stopAmbient();
        if (ambientGain && ac) {
          ambientGain.gain.cancelScheduledValues(ac.currentTime);
          ambientGain.gain.setValueAtTime(0, ac.currentTime);
        }
        return;
      }
      if (mode !== "white" && mode !== "pink" && mode !== "brown") return;
      if (ambientSource && ambientPlayingType === mode) {
        refreshAmbientGain();
        return;
      }
      startAmbientLoop(mode);
    }

    async function unlock() {
      ensure();
      if (!ac) return;
      if (ac.state === "suspended") {
        try {
          await ac.resume();
        } catch {
          // ignore
        }
      }
      applyAmbientFromSettings();
    }

    function setEnabled(on) {
      sfxEnabled = on;
      if (!on) stopAmbient();
      if (ambientGain && ac) {
        ambientGain.gain.cancelScheduledValues(ac.currentTime);
        ambientGain.gain.setValueAtTime(0, ac.currentTime);
      }
      if (on) applyAmbientFromSettings();
    }

    function blip(type, freq, durMs, vol = 0.4) {
      if (!save.settings.sound || !sfxEnabled) return;
      ensure();
      if (!ac || !master) return;
      const t0 = ac.currentTime;
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + durMs / 1000 + 0.02);
    }

    function noiseBurst(durMs, vol = 0.22) {
      if (!save.settings.sound || !sfxEnabled) return;
      ensure();
      if (!ac || !master) return;
      const length = Math.floor((ac.sampleRate * durMs) / 1000);
      const buf = ac.createBuffer(1, length, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(master);
      src.start();
    }

    return {
      unlock,
      setEnabled,
      applyAmbientFromSettings,
      setVolume: (vol) => {
        save.settings.volume = vol;
        setVolume(vol);
      },
      sfx: {
        place: () => blip("square", 520, 55, 0.22),
        erase: () => blip("square", 280, 55, 0.18),
        save: () => blip("sine", 740, 90, 0.25),
        clear: () => noiseBurst(90, 0.18),
        jump: () => blip("sine", 520, 85, 0.28),
        pad: () => blip("triangle", 640, 70, 0.24),
        win: () => blip("triangle", 880, 180, 0.28),
        lose: () => noiseBurst(180, 0.26),
        step: () => blip("square", 160, 25, 0.06),
        curse: () => blip("sawtooth", 240, 120, 0.14),
      },
    };
  })();

  window.addEventListener(
    "pointerdown",
    () => {
      AudioSys.unlock();
      AudioSys.setEnabled(save.settings.sound);
    },
    { once: true }
  );

  function isUiTypingTarget(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return !!(el.closest && el.closest("[contenteditable='true']"));
  }

  /** Set later; Input consults this so rebind keys are not treated as gameplay. */
  const keybindUI = { action: /** @type {string|null} */ (null) };

  // ---------- Input (keyDown / keyHeld / keyUp — state per frame) ----------
  class Input {
    constructor() {
      /** @type {Set<string>} */
      this.down = new Set();
      /** @type {Set<string>} */
      this.pressed = new Set();
      /** @type {Set<string>} */
      this.released = new Set();

      const onKeyDown = (e) => {
        if (isUiTypingTarget(/** @type {Element} */ (e.target)) && e.key !== "Escape") return;
        if (keybindUI.action) return;
        if (mode === "play" && play && !play.ended) {
          const code = (e.code || "").toLowerCase();
          if (code.startsWith("arrow") || code === "space" || /^key[wasd]$/.test(code)) e.preventDefault();
        }
        const k = normalizeKey(e);
        if (!k) return;
        if (e.repeat) {
          this.down.add(k);
          return;
        }
        if (!this.down.has(k)) this.pressed.add(k);
        this.down.add(k);
      };
      const onKeyUp = (e) => {
        if (isUiTypingTarget(/** @type {Element} */ (e.target)) && e.key !== "Escape") return;
        if (keybindUI.action) return;
        const k = normalizeKey(e);
        if (!k) return;
        if (this.down.has(k)) this.released.add(k);
        this.down.delete(k);
      };

      window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
      window.addEventListener("keyup", onKeyUp, { passive: false, capture: true });
    }
    tick() {
      this.pressed.clear();
      this.released.clear();
    }
    /** @deprecated alias — use keyHeld */
    isDown(k) {
      return this.down.has(k);
    }
    keyHeld(k) {
      return this.down.has(k);
    }
    /** Single frame after edge transition to down */
    keyDown(k) {
      return this.pressed.has(k);
    }
    /** Single frame after edge transition to up */
    keyUp(k) {
      return this.released.has(k);
    }
    wasPressed(k) {
      return this.pressed.has(k);
    }
    wasReleased(k) {
      return this.released.has(k);
    }
  }

  function normalizeKey(e) {
    // Prefer code for consistent WASD/arrow behavior.
    const c = (e.code || "").toLowerCase();
    const k = (e.key || "").toLowerCase();
    // Map arrows + space consistently.
    if (c.startsWith("arrow")) return c; // arrowleft, arrowright...
    if (c === "space") return "space";
    // WASD (KeyW etc)
    if (c.startsWith("key")) return c.slice(3); // w/a/s/d
    // Fallback to key for others.
    return k;
  }

  const input = new Input();

  // ---------- Actions / keybinds ----------
  const Actions = /** @type {const} */ ({
    restart: { label: "Restart", desc: "Restart the current run" },
    toggleBuild: { label: "Build mode", desc: "Switch to Build mode" },
    togglePlay: { label: "Play mode", desc: "Switch to Play mode" },
    openSettings: { label: "Settings", desc: "Open/close Settings" },
    openLevels: { label: "Levels", desc: "Open/close Levels" },
  });

  function keyForAction(actionId) {
    const k = save.settings.keybinds && save.settings.keybinds[actionId];
    return typeof k === "string" && k.trim() ? k.trim().toLowerCase() : "";
  }

  function prettyKey(k) {
    if (!k) return "—";
    if (k.startsWith("arrow")) return k.replace("arrow", "Arrow ").replace("left", "Left").replace("right", "Right").replace("up", "Up").replace("down", "Down");
    if (k === "space") return "Space";
    if (k === "escape") return "Esc";
    if (k.length === 1) return k.toUpperCase();
    return k;
  }

  function buildKeybindUI() {
    if (!elKeybindList) return;
    elKeybindList.innerHTML = "";
    for (const [id, meta] of Object.entries(Actions)) {
      const row = document.createElement("div");
      row.className = "listItem";
      const left = document.createElement("div");
      left.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = meta.label;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = meta.desc;
      left.appendChild(name);
      left.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "actions";
      const pill = document.createElement("div");
      pill.className = "kbd";
      pill.textContent = prettyKey(keyForAction(id));
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.textContent = "Change";
      btn.addEventListener("click", () => {
        keybindUI.action = id;
        pill.classList.add("listening");
        pill.textContent = "Press a key…";
        showToast(`Rebinding: ${meta.label}`);
      });

      actions.appendChild(pill);
      actions.appendChild(btn);
      row.appendChild(left);
      row.appendChild(actions);
      elKeybindList.appendChild(row);
    }
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!keybindUI.action) return;
      e.preventDefault();
      const k = normalizeKey(e);
      if (!k) return;
      if (k === "escape") {
        keybindUI.action = null;
        buildKeybindUI();
        showToast("Cancelled rebind.");
        return;
      }
      save.settings.keybinds[keybindUI.action] = k;
      keybindUI.action = null;
      persist();
      buildKeybindUI();
      showToast("Keybind saved.");
    },
    { passive: false }
  );

  // ---------- Toast ----------
  let toastTimer = 0;
  function showToast(msg, ms = 1500) {
    elToast.textContent = msg;
    elToast.classList.add("show");
    toastTimer = performance.now() + ms;
  }
  function updateToast(now) {
    if (!toastTimer) return;
    if (now > toastTimer) {
      toastTimer = 0;
      elToast.classList.remove("show");
    }
  }

  // ---------- Modal helpers ----------
  function openModal(el) {
    elBackdrop.classList.remove("hidden");
    el.classList.remove("hidden");
    elBackdrop.setAttribute("aria-hidden", "false");
    if (el === elSettingsModal) buildKeybindUI();
  }
  function closeModal(el) {
    el.classList.add("hidden");
    if (allModalsClosed()) {
      elBackdrop.classList.add("hidden");
      elBackdrop.setAttribute("aria-hidden", "true");
    }
  }
  function allModalsClosed() {
    return [elStartModal, elLevelsModal, elLeaderboardModal, elSettingsModal].every((m) => m.classList.contains("hidden"));
  }

  function openStartModal() {
    openModal(elStartModal);
    renderPlayerList("");
    renderLevelListByTier();
    syncPowerupUI();
  }

  function syncPowerupUI() {
    const pw = activePlayer && activePlayer.powerups ? activePlayer.powerups : { doubleJump: 0, speedBoost: 0, protection: 0 };
    const el = (id) => $(id);
    if (el("powerupCountDoubleJump")) el("powerupCountDoubleJump").textContent = String(pw.doubleJump || 0);
    if (el("powerupCountSpeedBoost")) el("powerupCountSpeedBoost").textContent = String(pw.speedBoost || 0);
    if (el("powerupCountProtection")) el("powerupCountProtection").textContent = String(pw.protection || 0);
    document.querySelectorAll(".usePowerupBtn").forEach((btn) => {
      const key = btn.getAttribute("data-powerup");
      if (!key) return;
      const count = pw[key] || 0;
      const selected = pendingPowerupsForRun[key];
      btn.disabled = count === 0;
      btn.textContent = selected ? "Using" : "Use";
      btn.classList.toggle("primary", selected);
    });
  }

  document.querySelectorAll(".usePowerupBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-powerup");
      if (!key || !activePlayer || !activePlayer.powerups) return;
      const count = activePlayer.powerups[key] || 0;
      if (count === 0) return;
      pendingPowerupsForRun[key] = !pendingPowerupsForRun[key];
      syncPowerupUI();
    });
  });

  // ---------- Theme / settings ----------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", save.settings.theme || "dark");
    if (elThemeSelect) elThemeSelect.value = save.settings.theme || "dark";
    elSoundToggle.checked = !!save.settings.sound;
    const vol = Math.round((save.settings.volume ?? 0.7) * 100);
    if (elVolumeSlider) elVolumeSlider.value = String(vol);
    if (elVolumeValue) elVolumeValue.textContent = vol + "%";
    if (elDebugOverlayToggle) elDebugOverlayToggle.checked = !!save.settings.debugOverlay;
    if (elAmbientNoiseSelect) elAmbientNoiseSelect.value = save.settings.ambientNoise || "off";
    elBackgroundSelect.value = save.settings.background || "nebula";
    elSabotageSlider.value = String(clamp(Math.round(save.settings.sabotageLevel || 5), 1, 10));
    elSabotageValue.textContent = elSabotageSlider.value;
    AudioSys.setVolume(save.settings.volume ?? 0.7);
    AudioSys.applyAmbientFromSettings();
  }

  if (elThemeSelect) {
    elThemeSelect.addEventListener("change", () => {
      save.settings.theme = elThemeSelect.value || "dark";
      persist();
      applyTheme();
    });
  }
  elSoundToggle.addEventListener("change", () => {
    save.settings.sound = !!elSoundToggle.checked;
    persist();
    AudioSys.setEnabled(save.settings.sound);
  });

  elBackgroundSelect.addEventListener("change", () => {
    // @ts-ignore
    save.settings.background = elBackgroundSelect.value || "nebula";
    persist();
  });

  elSabotageSlider.addEventListener("input", () => {
    const v = clamp(parseInt(elSabotageSlider.value || "5", 10) || 5, 1, 10);
    elSabotageSlider.value = String(v);
    elSabotageValue.textContent = String(v);
    save.settings.sabotageLevel = v;
    persist();
  });

  if (elVolumeSlider) {
    elVolumeSlider.addEventListener("input", () => {
      const v = clamp(parseInt(elVolumeSlider.value || "70", 10) || 70, 0, 100) / 100;
      save.settings.volume = v;
      if (elVolumeValue) elVolumeValue.textContent = Math.round(v * 100) + "%";
      persist();
      AudioSys.setVolume(v);
    });
  }
  if (elAmbientNoiseSelect) {
    elAmbientNoiseSelect.addEventListener("change", () => {
      const v = elAmbientNoiseSelect.value;
      save.settings.ambientNoise = v === "white" || v === "pink" || v === "brown" ? v : "off";
      persist();
      AudioSys.applyAmbientFromSettings();
    });
  }
  if (elDebugOverlayToggle) {
    elDebugOverlayToggle.addEventListener("change", () => {
      save.settings.debugOverlay = !!elDebugOverlayToggle.checked;
      persist();
    });
  }

  // ---------- Device mode (mobile / desktop) ----------
  /** @type {"mobile"|"desktop"|null} */
  let deviceMode = localStorage.getItem(DEVICE_KEY) === "mobile" ? "mobile" : localStorage.getItem(DEVICE_KEY) === "desktop" ? "desktop" : null;
  let touchLeftDown = false;
  let touchRightDown = false;
  let touchJumpDown = false;
  /** Prior frame touch jump (for edge-triggered jump buffer, same as keyboard). */
  let touchJumpPrevDown = false;

  function proceedAfterLoginGate() {
    closeLoginGateModal();
    syncExitAndRotateUI();
    syncLocalOnlyMultiplayerUi();
    if (save.activePlayerId && save.players[save.activePlayerId]) setActivePlayer(save.activePlayerId);
    else openStartModal();
  }

  function openLoginGateModal() {
    if (elGateStatus) elGateStatus.textContent = "";
    const gl = document.getElementById("gateLoginForm");
    const gr = document.getElementById("gateRegisterForm");
    if (gr) gr.classList.add("hidden");
    if (gl) gl.classList.remove("hidden");
    if (elLoginGateBackdrop) elLoginGateBackdrop.classList.remove("hidden");
    if (elLoginGateModal) elLoginGateModal.classList.remove("hidden");
  }

  function closeLoginGateModal() {
    if (elLoginGateBackdrop) elLoginGateBackdrop.classList.add("hidden");
    if (elLoginGateModal) elLoginGateModal.classList.add("hidden");
  }

  function setDeviceMode(m) {
    deviceMode = m;
    localStorage.setItem(DEVICE_KEY, m);
    if (elDeviceModal) elDeviceModal.classList.add("hidden");
    document.documentElement.classList.toggle("device-touch-mode", m === "mobile");
    syncTouchControlsVisibility();
    syncExitAndRotateUI();
    if (!hasPassedLoginGate()) {
      openLoginGateModal();
      return;
    }
    proceedAfterLoginGate();
  }

  function syncExitAndRotateUI() {
    if (elExitToMenuBtn) {
      if (deviceMode) elExitToMenuBtn.classList.remove("hidden");
      else elExitToMenuBtn.classList.add("hidden");
    }
    if (elMobileExitBuildBtn) {
      elMobileExitBuildBtn.classList.add("hidden");
    }
    const portrait =
      typeof window.matchMedia === "function" && window.matchMedia("(orientation: portrait)").matches;

    const mpRunFs =
      mpSession.active && (mpSession.phase === "mpPlayOpponent" || mpSession.phase === "mpRound3");
    const inPlaySession =
      deviceMode === "mobile" &&
      mode === "play" &&
      play &&
      !play.spectatorMode &&
      (!play.ended || mpRunFs);
    const inBuildSession = deviceMode === "mobile" && mode === "build";
    const spectatorFull = deviceMode === "mobile" && mode === "play" && play && play.spectatorMode;

    const app = document.querySelector(".app");
    if (app) {
      app.classList.toggle("mobile-session-layout", inPlaySession || inBuildSession);
      app.classList.toggle("mobile-spectator-layout", !!spectatorFull);
      if (inPlaySession || inBuildSession) {
        app.dataset.mobileDock = mode === "build" ? "build" : "play";
      } else {
        delete app.dataset.mobileDock;
      }
    }

    if (elMobilePortraitLock) {
      const blockPortrait =
        deviceMode === "mobile" && portrait && (inBuildSession || inPlaySession || spectatorFull);
      elMobilePortraitLock.classList.toggle("hidden", !blockPortrait);
    }

    if (elTouchModeToggleBtn) {
      elTouchModeToggleBtn.textContent = mode === "play" ? "Build" : "Play";
      elTouchModeToggleBtn.setAttribute("aria-label", mode === "play" ? "Switch to build mode" : "Switch to play mode");
    }
    syncTouchControlsVisibility();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("orientationchange", () => requestAnimationFrame(() => syncExitAndRotateUI()));
    window.addEventListener("resize", () => requestAnimationFrame(() => syncExitAndRotateUI()));
  }

  function setMpChromeLocked(on) {
    elOpenLevelsBtn.disabled = on;
    elOpenLeaderboardBtn.disabled = on;
  }

  function resetMultiplayerClientUi() {
    if (mpSession.socket) {
      try {
        mpSession.socket.removeAllListeners();
      } catch {
        /* ignore */
      }
    }
    mpSession.active = false;
    mpSession.phase = "off";
    mpSession.socket = null;
    mpSession.opponentName = "";
    setMpChromeLocked(false);
    if (elMpHud) elMpHud.classList.add("hidden");
    if (elMpMatchmaking) elMpMatchmaking.classList.add("hidden");
    if (elMpWaitBuild) elMpWaitBuild.classList.add("hidden");
    if (elMpSpectate) elMpSpectate.classList.add("hidden");
    if (elMpRound3Overlay) elMpRound3Overlay.classList.add("hidden");
    if (elMpMatchEnd) elMpMatchEnd.classList.add("hidden");
    if (elMpSubmitLevelBtn) elMpSubmitLevelBtn.classList.add("hidden");
    if (elMpBuildHint) elMpBuildHint.classList.add("hidden");
    if (elMpChatMessages) elMpChatMessages.innerHTML = "";
    mpChatUserCollapsed = false;
    mpChatPeekHover = false;
    syncMpChatPanel();
    if (elMpRematchBtn) {
      elMpRematchBtn.textContent = "Rematch (0/2)";
      elMpRematchBtn.classList.remove("mpRematchConfirmed");
    }
    mpSession.rematchSelfConfirmed = false;
    elBuildBtn.disabled = false;
    elPlayBtn.disabled = false;
  }

  function syncMpChatDock() {
    syncMpChatPanel();
  }

  function syncMpChatPanel() {
    if (!elMpChatDock) return;
    const on =
      mpSession.active &&
      mpSession.socket &&
      mpSession.phase !== "off" &&
      mpSession.phase !== "queue" &&
      mpSession.phase !== "mpMatchEnd";
    if (!on) {
      elMpChatDock.classList.add("hidden");
      if (elMobileMpChatFab) elMobileMpChatFab.classList.add("hidden");
      return;
    }
    elMpChatDock.classList.remove("hidden");
    const expanded = !mpChatUserCollapsed || mpChatPeekHover;
    if (elMpChatExpanded) elMpChatExpanded.classList.toggle("hidden", !expanded);
    if (elMpChatPeekBar) elMpChatPeekBar.classList.toggle("hidden", expanded);
    if (elMobileMpChatFab) {
      elMobileMpChatFab.classList.toggle("hidden", !on || deviceMode !== "mobile");
    }
  }

  function appendMpChatLine(msg) {
    if (!elMpChatMessages || !msg) return;
    const row = document.createElement("div");
    row.className = "mpChatLine";
    row.dataset.msgId = String(msg.id || "");
    row.textContent = `${msg.from}: ${msg.text}`;
    elMpChatMessages.appendChild(row);
    elMpChatMessages.scrollTop = elMpChatMessages.scrollHeight;
  }

  if (elMobileExitBuildBtn) {
    elMobileExitBuildBtn.addEventListener("click", () => {
      if (mpSession.active && mpSession.phase === "mpBuild") {
        showToast("Finish your build and tap Submit, or use ✕ Menu to leave the match.");
        return;
      }
      if (mpSession.active && (mpSession.phase === "mpWaitBuild" || mpSession.phase === "mpSpectatePlay")) {
        showToast("Use ✕ Menu to leave the match.");
        return;
      }
      openStartModal();
    });
  }

  if (elExitToMenuBtn) {
    elExitToMenuBtn.addEventListener("click", () => {
      if (mpSession.socket) {
        const s = mpSession.socket;
        resetMultiplayerClientUi();
        try {
          s.disconnect();
        } catch {
          /* ignore */
        }
      }
      if (mode === "play") {
        mode = "build";
        play = null;
        updateTimerPill(null);
        syncTouchControlsVisibility();
        elRestartBtn.disabled = true;
        elBuildBtn.classList.add("primary");
        elPlayBtn.classList.remove("primary");
      }
      syncExitAndRotateUI();
      openStartModal();
    });
  }

  function syncTouchControlsVisibility() {
    if (!elMobilePlayDock) return;
    if (deviceMode === "mobile" && mode === "play" && play && !play.spectatorMode) {
      elMobilePlayDock.classList.remove("hidden");
      elMobilePlayDock.setAttribute("aria-hidden", "false");
    } else {
      elMobilePlayDock.classList.add("hidden");
      elMobilePlayDock.setAttribute("aria-hidden", "true");
    }
    if (elTouchRestartBtn) {
      elTouchRestartBtn.disabled = elRestartBtn.disabled;
    }
  }

  if (elDeviceDesktopBtn) elDeviceDesktopBtn.addEventListener("click", () => setDeviceMode("desktop"));
  if (elDeviceMobileBtn) elDeviceMobileBtn.addEventListener("click", () => setDeviceMode("mobile"));

  function releaseAllPhysicalInput() {
    input.down.clear();
    input.pressed.clear();
    input.released.clear();
    touchLeftDown = false;
    touchRightDown = false;
    touchJumpDown = false;
    touchJumpPrevDown = false;
  }

  window.addEventListener("blur", releaseAllPhysicalInput);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") releaseAllPhysicalInput();
  });
  window.addEventListener("pagehide", releaseAllPhysicalInput);

  if (elTouchLeft) {
    elTouchLeft.addEventListener("touchstart", (e) => { e.preventDefault(); touchLeftDown = true; }, { passive: false });
    elTouchLeft.addEventListener("touchend", (e) => { e.preventDefault(); touchLeftDown = false; }, { passive: false });
    elTouchLeft.addEventListener("touchcancel", () => { touchLeftDown = false; });
    elTouchLeft.addEventListener("mousedown", () => touchLeftDown = true);
    elTouchLeft.addEventListener("mouseup", () => touchLeftDown = false);
    elTouchLeft.addEventListener("mouseleave", () => touchLeftDown = false);
  }
  if (elTouchRight) {
    elTouchRight.addEventListener("touchstart", (e) => { e.preventDefault(); touchRightDown = true; }, { passive: false });
    elTouchRight.addEventListener("touchend", (e) => { e.preventDefault(); touchRightDown = false; }, { passive: false });
    elTouchRight.addEventListener("touchcancel", () => { touchRightDown = false; });
    elTouchRight.addEventListener("mousedown", () => touchRightDown = true);
    elTouchRight.addEventListener("mouseup", () => touchRightDown = false);
    elTouchRight.addEventListener("mouseleave", () => touchRightDown = false);
  }
  if (elTouchJump) {
    elTouchJump.addEventListener("touchstart", (e) => { e.preventDefault(); touchJumpDown = true; }, { passive: false });
    elTouchJump.addEventListener("touchend", (e) => { e.preventDefault(); touchJumpDown = false; }, { passive: false });
    elTouchJump.addEventListener("touchcancel", () => { touchJumpDown = false; });
    elTouchJump.addEventListener("mousedown", () => touchJumpDown = true);
    elTouchJump.addEventListener("mouseup", () => touchJumpDown = false);
    elTouchJump.addEventListener("mouseleave", () => touchJumpDown = false);
  }

  // ---------- Build Grid ----------
  /** @type {TileType[][]} */
  const grid = makeGrid(COLS, ROWS, Tile.empty);
  /** Build mode: short erase pop animations @type {{ gx: number, gy: number, t0: number, prev: TileType }[]} */
  const eraseFx = [];
  let lastBuildStatusText = "";
  /** @type {TileType} */
  let selectedTile = Tile.platform;

  /** @type {"build"|"play"} */
  let mode = "build";

  const pointer = {
    over: false,
    gx: 0,
    gy: 0,
    canPlace: true,
    reason: "",
  };

  // Canvas interactions (build)
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerenter", () => (pointer.over = true));
  canvas.addEventListener("pointerleave", () => {
    pointer.over = false;
    if (mode === "build") elRunHint.textContent = "Hover the grid for tile hints.";
  });
  canvas.addEventListener("pointermove", (e) => {
    const g = canvasToGrid(e);
    pointer.gx = g.gx;
    pointer.gy = g.gy;
    const check = canPlaceTile(pointer.gx, pointer.gy, selectedTile);
    pointer.canPlace = check.ok;
    pointer.reason = check.reason;
    if (mode === "build" && pointer.over && inBounds(pointer.gx, pointer.gy)) {
      const ti = TileInfo[selectedTile];
      elRunHint.textContent = check.ok
        ? `${TilePaletteIcon[selectedTile] || ""} ${ti.name} — ${ti.hint}`
        : check.reason || `Cannot place ${ti.name} here.`;
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "build") return;
    const { gx, gy } = canvasToGrid(e);
    if (!inBounds(gx, gy)) return;

    const isErase = e.button === 2 || selectedTile === Tile.empty;
    if (isErase) {
      if (grid[gy][gx] !== Tile.empty) {
        const prev = grid[gy][gx];
        grid[gy][gx] = Tile.empty;
        eraseFx.push({ gx, gy, t0: performance.now(), prev });
        AudioSys.sfx.erase();
        scheduleValidate();
      }
      return;
    }

    const check = canPlaceTile(gx, gy, selectedTile);
    if (!check.ok) {
      showToast(check.reason || "Can't place here.");
      return;
    }

    placeTile(gx, gy, selectedTile);
  });

  function placeTile(gx, gy, t) {
    if (t === Tile.start) clearType(Tile.start);
    if (t === Tile.goal) clearType(Tile.goal);
    grid[gy][gx] = t;
    AudioSys.sfx.place();
    scheduleValidate();
  }

  function clearType(t) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === t) grid[y][x] = Tile.empty;
  }

  function canvasToGrid(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { gx: Math.floor(x / TILE), gy: Math.floor(y / TILE) };
  }

  function canPlaceTile(gx, gy, t) {
    if (!inBounds(gx, gy)) return { ok: false, reason: "" };
    if (mode !== "build") return { ok: false, reason: "Build mode only." };

    // Prevent placing on top UI-protected border? Not needed.
    // Spawn/goal should not be spikes; also keep some breathing space around start.
    if (t === Tile.spikes) {
      const s = findType(Tile.start);
      if (s && distanceSq(gx, gy, s.x, s.y) <= 6) return { ok: false, reason: "Too close to Start." };
    }
    if (t === Tile.start && gy >= ROWS - 1) return { ok: false, reason: "Start must have room above." };

    // Placement limits
    const counts = countTiles(grid);
    if (t in BUILD_LIMITS && t !== Tile.start && t !== Tile.goal) {
      const limit = BUILD_LIMITS[/** @type {keyof typeof BUILD_LIMITS} */ (t)];
      const current = counts[/** @type {keyof typeof counts} */ (t)] || 0;
      // if replacing same type, allow
      const replacing = grid[gy][gx] === t;
      if (!replacing && current >= limit) return { ok: false, reason: `Limit reached for ${TileInfo[t].name}.` };
    }

    return { ok: true, reason: "" };
  }

  function clearGrid() {
    eraseFx.length = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x] = Tile.empty;
    AudioSys.sfx.clear();
    scheduleValidate();
  }

  // ---------- Built-in + random levels ----------
  /** @typedef {"easy"|"medium"|"hard"} DifficultyTier */
  const BUILTIN_LEVELS = makeBuiltinLevels();

  function makeBuiltinLevels() {
    /** @type {{id:string,name:string,tier:DifficultyTier,tilesFlat:TileType[]}[]} */
    const levels = [];
    levels.push({ id: "builtin_training", name: "Training Wheels", tier: "easy", tilesFlat: makeBuiltinTraining() });
    levels.push({ id: "builtin_gentle", name: "First Steps", tier: "easy", tilesFlat: makeBuiltinGentle() });
    levels.push({ id: "builtin_sunny", name: "Sunny Path", tier: "easy", tilesFlat: makeBuiltinSunny() });
    levels.push({ id: "builtin_hopskip", name: "Hop Skip", tier: "easy", tilesFlat: makeBuiltinHopSkip() });
    levels.push({ id: "builtin_gentlerise", name: "Gentle Rise", tier: "easy", tilesFlat: makeBuiltinGentleRise() });
    levels.push({ id: "builtin_saferun", name: "Safe Run", tier: "easy", tilesFlat: makeBuiltinSafeRun() });
    levels.push({ id: "builtin_beginner", name: "Beginner's Luck", tier: "easy", tilesFlat: makeBuiltinBeginner() });
    levels.push({ id: "builtin_betrayal", name: "Betrayal Alley", tier: "medium", tilesFlat: makeBuiltinBetrayal() });
    levels.push({ id: "builtin_mid", name: "Spike Row", tier: "medium", tilesFlat: makeBuiltinMid() });
    levels.push({ id: "builtin_doublecross", name: "Double Cross", tier: "medium", tilesFlat: makeBuiltinDoubleCross() });
    levels.push({ id: "builtin_midclimb", name: "Mid Climb", tier: "medium", tilesFlat: makeBuiltinMidClimb() });
    levels.push({ id: "builtin_hexlane", name: "Hex Lane", tier: "medium", tilesFlat: makeBuiltinHexLane() });
    levels.push({ id: "builtin_spikegauntlet", name: "Spike Gauntlet", tier: "medium", tilesFlat: makeBuiltinSpikeGauntlet() });
    levels.push({ id: "builtin_stepping", name: "Stepping Stones", tier: "medium", tilesFlat: makeBuiltinStepping() });
    levels.push({ id: "builtin_bridge", name: "The Bridge", tier: "medium", tilesFlat: makeBuiltinBridge() });
    levels.push({ id: "builtin_chaos", name: "Hex Hop", tier: "hard", tilesFlat: makeBuiltinHexHop() });
    levels.push({ id: "builtin_gauntlet", name: "Gauntlet", tier: "hard", tilesFlat: makeBuiltinGauntlet() });
    levels.push({ id: "builtin_summit", name: "Summit", tier: "hard", tilesFlat: makeBuiltinSummit() });
    levels.push({ id: "builtin_chaosrun", name: "Chaos Run", tier: "hard", tilesFlat: makeBuiltinChaosRun() });
    levels.push({ id: "builtin_finaltest", name: "Final Test", tier: "hard", tilesFlat: makeBuiltinFinalTest() });
    levels.push({ id: "builtin_nomercy", name: "No Mercy", tier: "hard", tilesFlat: makeBuiltinNoMercy() });
    levels.push({ id: "builtin_tower", name: "Tower", tier: "hard", tilesFlat: makeBuiltinTower() });
    levels.push({ id: "builtin_endurance", name: "Endurance", tier: "hard", tilesFlat: makeBuiltinEndurance() });
    return levels;
  }

  function makeEmptyFlat() {
    /** @type {TileType[]} */
    const out = [];
    for (let i = 0; i < COLS * ROWS; i++) out.push(Tile.empty);
    return out;
  }

  function makeBuiltinTraining() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, ROWS - 3, Tile.goal);
    for (let x = 1; x < COLS - 2; x++) set(x, ROWS - 2, Tile.platform);
    set(12, ROWS - 3, Tile.jumppad);
    set(18, ROWS - 3, Tile.spikes);
    set(19, ROWS - 3, Tile.spikes);
    set(24, ROWS - 3, Tile.jumppad);
    return f;
  }

  function makeBuiltinBetrayal() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 4, Tile.start);
    set(COLS - 5, ROWS - 7, Tile.goal);
    for (let x = 1; x < COLS - 2; x++) set(x, ROWS - 2, Tile.platform);
    // Staggered platforms up
    for (let i = 0; i < 8; i++) set(8 + i * 3, ROWS - 5 - i, Tile.platform);
    set(14, ROWS - 6, Tile.jumppad);
    set(22, ROWS - 8, Tile.hex);
    set(26, ROWS - 9, Tile.spikes);
    set(27, ROWS - 9, Tile.spikes);
    return f;
  }

  function makeBuiltinHexHop() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, 6, Tile.goal);
    for (let x = 1; x < COLS - 2; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(6 + i * 2, ROWS - 6 - Math.floor(i / 2), Tile.hex);
    for (let i = 0; i < 10; i++) set(8 + i * 2, ROWS - 5 - Math.floor(i / 2), Tile.platform);
    set(10, ROWS - 7, Tile.jumppad);
    set(20, ROWS - 10, Tile.jumppad);
    set(28, ROWS - 12, Tile.jumppad);
    return f;
  }

  function makeBuiltinGentle() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 5, ROWS - 4, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let x = 4; x < COLS - 6; x += 4) set(x, ROWS - 3, Tile.platform);
    set(14, ROWS - 4, Tile.jumppad);
    set(22, ROWS - 3, Tile.spikes);
    return f;
  }

  function makeBuiltinMid() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 4, Tile.start);
    set(COLS - 5, ROWS - 8, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 12; i++) set(4 + i * 2, ROWS - 4 - (i % 3), Tile.platform);
    set(10, ROWS - 5, Tile.jumppad);
    set(16, ROWS - 5, Tile.spikes);
    set(17, ROWS - 5, Tile.spikes);
    set(24, ROWS - 7, Tile.hex);
    return f;
  }

  function makeBuiltinGauntlet() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, 5, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(4 + i * 2, ROWS - 4 - Math.floor(i / 2), Tile.platform);
    for (let i = 0; i < 8; i++) set(6 + i * 3, ROWS - 6 - i, Tile.platform);
    set(8, ROWS - 7, Tile.jumppad);
    set(14, ROWS - 9, Tile.hex);
    set(18, ROWS - 10, Tile.spikes);
    set(19, ROWS - 10, Tile.spikes);
    set(26, ROWS - 12, Tile.jumppad);
    set(28, ROWS - 11, Tile.hex);
    return f;
  }

  function makeBuiltinSunny() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 5, ROWS - 3, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let x = 6; x < COLS - 8; x += 5) set(x, ROWS - 4, Tile.platform);
    return f;
  }
  function makeBuiltinHopSkip() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, ROWS - 5, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    set(8, ROWS - 4, Tile.platform);
    set(14, ROWS - 5, Tile.platform);
    set(20, ROWS - 4, Tile.jumppad);
    set(26, ROWS - 5, Tile.platform);
    return f;
  }
  function makeBuiltinGentleRise() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 5, ROWS - 7, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(4 + i * 2, ROWS - 3 - (i % 2), Tile.platform);
    set(16, ROWS - 6, Tile.jumppad);
    set(24, ROWS - 7, Tile.platform);
    return f;
  }
  function makeBuiltinSafeRun() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, ROWS - 4, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    set(10, ROWS - 3, Tile.platform);
    set(18, ROWS - 3, Tile.spikes);
    set(22, ROWS - 4, Tile.platform);
    return f;
  }
  function makeBuiltinBeginner() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 5, ROWS - 5, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    set(8, ROWS - 4, Tile.platform);
    set(14, ROWS - 4, Tile.jumppad);
    set(20, ROWS - 5, Tile.platform);
    set(24, ROWS - 4, Tile.hex);
    return f;
  }
  function makeBuiltinDoubleCross() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 4, Tile.start);
    set(COLS - 5, ROWS - 8, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 8; i++) set(4 + i * 3, ROWS - 4 - (i % 2), Tile.platform);
    set(12, ROWS - 6, Tile.jumppad);
    set(18, ROWS - 6, Tile.hex);
    set(24, ROWS - 7, Tile.spikes);
    set(25, ROWS - 7, Tile.spikes);
    return f;
  }
  function makeBuiltinMidClimb() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, ROWS - 10, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 12; i++) set(3 + i * 2, ROWS - 4 - Math.floor(i / 2), Tile.platform);
    set(14, ROWS - 8, Tile.jumppad);
    set(22, ROWS - 10, Tile.platform);
    return f;
  }
  function makeBuiltinHexLane() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, ROWS - 6, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 8; i++) set(6 + i * 2, ROWS - 4 - (i % 2), Tile.platform);
    set(10, ROWS - 5, Tile.hex);
    set(16, ROWS - 6, Tile.hex);
    set(22, ROWS - 5, Tile.jumppad);
    return f;
  }
  function makeBuiltinSpikeGauntlet() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 4, Tile.start);
    set(COLS - 5, ROWS - 7, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(4 + i * 2, ROWS - 4 - (i % 2), Tile.platform);
    set(8, ROWS - 3, Tile.spikes);
    set(9, ROWS - 3, Tile.spikes);
    set(16, ROWS - 5, Tile.spikes);
    set(22, ROWS - 6, Tile.jumppad);
    set(26, ROWS - 7, Tile.platform);
    return f;
  }
  function makeBuiltinStepping() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, ROWS - 9, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(2 + i * 2, ROWS - 3 - Math.floor(i / 2), Tile.platform);
    set(12, ROWS - 7, Tile.jumppad);
    set(24, ROWS - 9, Tile.platform);
    return f;
  }
  function makeBuiltinBridge() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 5, Tile.start);
    set(COLS - 4, ROWS - 5, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let x = 2; x < COLS - 2; x++) set(x, ROWS - 4, Tile.platform);
    set(12, ROWS - 4, Tile.spikes);
    set(18, ROWS - 4, Tile.hex);
    set(24, ROWS - 4, Tile.jumppad);
    return f;
  }
  function makeBuiltinSummit() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, 4, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 16; i++) set(2 + i * 2, ROWS - 4 - Math.floor(i / 2), Tile.platform);
    set(14, ROWS - 10, Tile.jumppad);
    set(22, ROWS - 12, Tile.hex);
    set(26, ROWS - 6, Tile.platform);
    return f;
  }
  function makeBuiltinChaosRun() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 4, Tile.start);
    set(COLS - 4, 5, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 12; i++) set(4 + i * 2, ROWS - 4 - (i % 2), Tile.platform);
    for (let i = 0; i < 6; i++) set(8 + i * 3, ROWS - 8 - i, Tile.platform);
    set(10, ROWS - 9, Tile.hex);
    set(18, ROWS - 11, Tile.jumppad);
    set(24, ROWS - 7, Tile.spikes);
    set(26, ROWS - 6, Tile.platform);
    return f;
  }
  function makeBuiltinFinalTest() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, 6, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(3 + i * 2, ROWS - 4 - Math.floor(i / 2), Tile.platform);
    set(12, ROWS - 8, Tile.hex);
    set(18, ROWS - 10, Tile.jumppad);
    set(22, ROWS - 9, Tile.spikes);
    set(26, ROWS - 8, Tile.platform);
    return f;
  }
  function makeBuiltinNoMercy() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 4, Tile.start);
    set(COLS - 5, ROWS - 11, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(4 + i * 2, ROWS - 4 - (i % 2), Tile.platform);
    for (let i = 0; i < 8; i++) set(8 + i * 2, ROWS - 8 - Math.floor(i / 2), Tile.platform);
    set(14, ROWS - 10, Tile.hex);
    set(20, ROWS - 11, Tile.jumppad);
    set(24, ROWS - 10, Tile.spikes);
    set(25, ROWS - 10, Tile.spikes);
    return f;
  }
  function makeBuiltinTower() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(14, 3, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let y = ROWS - 4; y >= 4; y -= 2) set(4, y, Tile.platform);
    for (let y = ROWS - 5; y >= 5; y -= 2) set(10, y, Tile.platform);
    for (let y = ROWS - 4; y >= 4; y -= 2) set(16, y, Tile.platform);
    set(6, ROWS - 6, Tile.jumppad);
    set(12, ROWS - 10, Tile.jumppad);
    set(14, 5, Tile.platform);
    return f;
  }
  function makeBuiltinEndurance() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    set(2, ROWS - 3, Tile.start);
    set(COLS - 4, 5, Tile.goal);
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(2 + i * 2, ROWS - 4 - (i % 3), Tile.platform);
    set(8, ROWS - 6, Tile.hex);
    set(14, ROWS - 8, Tile.jumppad);
    set(20, ROWS - 10, Tile.spikes);
    set(21, ROWS - 10, Tile.spikes);
    set(26, ROWS - 7, Tile.platform);
    return f;
  }

  function loadFlatIntoGrid(flat) {
    eraseFx.length = 0;
    inflateGrid(grid, flat, COLS, ROWS);
    scheduleValidate();
    if (mode === "play") restartPlay();
  }

  // ---------- Validated level generation (reachability) ----------
  /** @param {TileType[][]} g */
  function isSolidTile(g, x, y) {
    if (!inBounds(x, y)) return false;
    const t = g[y][x];
    return t === Tile.platform || t === Tile.jumppad || t === Tile.speedBoost;
  }

  /** Tiles that count as “ground” directly under the goal for validation. */
  function isGoalSupportTile(t) {
    return t === Tile.platform || t === Tile.jumppad || t === Tile.speedBoost || t === Tile.pathBlock || t === Tile.start;
  }

  /** Play mode: only these are real solids under Start (pathBlock renders empty in play). */
  function isSpawnSupportTile(t) {
    return t === Tile.platform || t === Tile.jumppad || t === Tile.speedBoost;
  }

  /** Start must have sabotage-proof solid directly below (same cell column, row + 1). */
  function spawnHasSolidSupport(g, start) {
    if (!start) return false;
    if (start.y >= ROWS - 1) return false;
    return isSpawnSupportTile(g[start.y + 1][start.x]);
  }

  function jumpBoundsFromPhysics() {
    const g = PHYS.gravity;
    const jv = PHYS.jumpV;
    const peakPx = (jv * jv) / (2 * g);
    const tilesUp = Math.ceil(peakPx / TILE) + 2;
    const tAir = (2 * jv) / g;
    const tilesAcross = Math.ceil((PHYS.maxSpeed * tAir) / TILE) + 2;
    return { maxDy: clamp(tilesUp + 1, 5, 9), maxDx: clamp(tilesAcross + 1, 6, 11) };
  }

  /**
   * Occupancy graph for reachability: hazards count as standable when they have footing
   * (forgiving — we never mark impossible unless goal has no support).
   */
  function isStandableReach(g, x, y) {
    if (!inBounds(x, y)) return false;
    if (y >= ROWS - 1) return true;
    const t = g[y][x];
    if (t === Tile.goal || t === Tile.start || t === Tile.pathBlock) return true;
    if (t === Tile.spikes || t === Tile.lava || t === Tile.hex || t === Tile.food) {
      if (y + 1 < ROWS && isGoalSupportTile(g[y + 1][x])) return true;
      return isSolidTile(g, x, y) || (y + 1 < ROWS && isSolidTile(g, x, y + 1));
    }
    if (isSolidTile(g, x, y)) return true;
    if (y + 1 < ROWS && isSolidTile(g, x, y + 1)) return true;
    if (t === Tile.empty && y + 1 < ROWS && isGoalSupportTile(g[y + 1][x])) return true;
    return false;
  }

  /** Path-block-only graph (designer-marked route). */
  function isStandablePath(g, x, y) {
    if (!inBounds(x, y)) return false;
    if (y >= ROWS - 1) return true;
    const t = g[y][x];
    if (t === Tile.pathBlock || t === Tile.start || t === Tile.goal) return true;
    return isSolidTile(g, x, y) || isSolidTile(g, x, y + 1);
  }

  function fallLandingRow(g, nx, startRow, standableFn) {
    for (let y2 = startRow; y2 < ROWS; y2++) {
      if (standableFn(g, nx, y2)) return y2;
    }
    return null;
  }

  function bfsRootCell(g, start, standableFn) {
    if (standableFn(g, start.x, start.y)) return { x: start.x, y: start.y };
    if (start.y + 1 < ROWS && standableFn(g, start.x, start.y + 1)) return { x: start.x, y: start.y + 1 };
    for (let y2 = start.y; y2 < ROWS; y2++) {
      if (standableFn(g, start.x, y2)) return { x: start.x, y: y2 };
    }
    return { x: start.x, y: start.y };
  }

  function goalHasGrounding(g, goal) {
    if (goal.y >= ROWS - 1) return true;
    return isGoalSupportTile(g[goal.y + 1][goal.x]);
  }

  function findStartGoalOn(g) {
    let start = null,
      goal = null;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (g[y][x] === Tile.start) start = { x, y };
        if (g[y][x] === Tile.goal) goal = { x, y };
      }
    }
    return { start, goal };
  }

  /** Last BFS visited cells for debug (keys "x,y"). */
  let pathDebugCells = new Set();

  function runReachabilityBfs(g, standableFn) {
    const { start, goal } = findStartGoalOn(g);
    const visited = new Set();
    if (!start || !goal) {
      pathDebugCells = visited;
      return { reachesGoal: false, visited };
    }
    const { maxDy, maxDx } = jumpBoundsFromPhysics();
    const root = bfsRootCell(g, start, standableFn);
    const key = (x, y) => `${x},${y}`;
    const q = [root];
    visited.add(key(root.x, root.y));
    let qi = 0;

    while (qi < q.length) {
      const { x, y } = q[qi++];
      if (x === goal.x && y === goal.y) {
        pathDebugCells = visited;
        return { reachesGoal: true, visited };
      }
      for (const dx of [-1, 1]) {
        const nx = x + dx;
        if (!inBounds(nx, y)) continue;
        if (standableFn(g, nx, y)) {
          const k = key(nx, y);
          if (!visited.has(k)) {
            visited.add(k);
            q.push({ x: nx, y });
          }
        } else {
          const land = fallLandingRow(g, nx, y, standableFn);
          if (land != null) {
            const k = key(nx, land);
            if (!visited.has(k)) {
              visited.add(k);
              q.push({ x: nx, y: land });
            }
          }
        }
      }
      for (let dy = 1; dy <= maxDy; dy++) {
        const ny = y - dy;
        if (ny < 0) break;
        for (let dx = -maxDx; dx <= maxDx; dx++) {
          const nx = x + dx;
          if (!inBounds(nx, ny) || !standableFn(g, nx, ny)) continue;
          const k = key(nx, ny);
          if (visited.has(k)) continue;
          visited.add(k);
          q.push({ x: nx, y: ny });
        }
      }
    }
    pathDebugCells = visited;
    return { reachesGoal: false, visited };
  }

  /** If path blocks exist and connect start→goal under the same movement rules. */
  function isPathBlockValid(g) {
    let start = null,
      goal = null,
      pathBlockCount = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (g[y][x] === Tile.start) start = { x, y };
        if (g[y][x] === Tile.goal) goal = { x, y };
        if (g[y][x] === Tile.pathBlock) pathBlockCount++;
      }
    }
    if (!start || !goal || pathBlockCount === 0) return false;
    const root = bfsRootCell(g, start, isStandablePath);
    const { maxDy, maxDx } = jumpBoundsFromPhysics();
    const key = (x, y) => `${x},${y}`;
    const visited = new Set([key(root.x, root.y)]);
    const q = [root];
    let qi = 0;
    while (qi < q.length) {
      const { x, y } = q[qi++];
      if (x === goal.x && y === goal.y) return true;
      for (const dx of [-1, 1]) {
        const nx = x + dx;
        if (!inBounds(nx, y)) continue;
        if (isStandablePath(g, nx, y)) {
          const k = key(nx, y);
          if (!visited.has(k)) {
            visited.add(k);
            q.push({ x: nx, y });
          }
        } else {
          const land = fallLandingRow(g, nx, y, isStandablePath);
          if (land != null) {
            const k = key(nx, land);
            if (!visited.has(k)) {
              visited.add(k);
              q.push({ x: nx, y: land });
            }
          }
        }
      }
      for (let dy = 1; dy <= maxDy; dy++) {
        const ny = y - dy;
        if (ny < 0) break;
        for (let dx = -maxDx; dx <= maxDx; dx++) {
          const nx = x + dx;
          if (!inBounds(nx, ny) || !isStandablePath(g, nx, ny)) continue;
          const k = key(nx, ny);
          if (visited.has(k)) continue;
          visited.add(k);
          q.push({ x: nx, y: ny });
        }
      }
    }
    return false;
  }

  /**
   * Random generation / sanity: must have grounded goal and a generous graph path.
   * @param {TileType[][]} g
   */
  function isLevelReachable(g) {
    const { start, goal } = findStartGoalOn(g);
    if (!start || !goal) return false;
    if (!spawnHasSolidSupport(g, start)) return false;
    if (!goalHasGrounding(g, goal)) return false;
    if (isPathBlockValid(g)) return true;
    return runReachabilityBfs(g, isStandableReach).reachesGoal;
  }

  function generateRandomLevel() {
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const f = attemptGenerateRandomLevel();
      if (!f) continue;
      const g = inflateToGrid(f);
      if (isLevelReachable(g)) return f;
    }
    const fallback = BUILTIN_LEVELS.find((l) => l.id === "builtin_training");
    return fallback ? fallback.tilesFlat.slice() : makeBuiltinTraining();
  }

  function inflateToGrid(flat) {
    const g = makeGrid(COLS, ROWS, Tile.empty);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g[y][x] = flat[y * COLS + x] || Tile.empty;
    return g;
  }

  function attemptGenerateRandomLevel() {
    const rng = mulberry32((Date.now() ^ (Math.random() * 2 ** 32)) >>> 0);
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * COLS + x] = t);
    const g = () => inflateToGrid(f);

    // 1) Ground row
    for (let x = 0; x < COLS; x++) set(x, ROWS - 2, Tile.platform);

    // 2) Start on ground
    const sy = ROWS - 3;
    set(2, sy, Tile.start);

    // 3) Build guaranteed path: platforms from left to right, step up within jump range
    let cx = 2;
    let cy = ROWS - 2;
    const pathTiles = [{ x: cx, y: cy }];
    const steps = 14 + Math.floor(rng() * 6);
    for (let step = 0; step < steps; step++) {
      const nx = clamp(cx + 2 + Math.floor(rng() * 3), 4, COLS - 5);
      const deltaY = Math.floor(lerp(-3, 1, rng()));
      const ny = clamp(cy + deltaY, 2, ROWS - 2);
      const len = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < len; i++) {
        const px = clamp(nx + i, 0, COLS - 1);
        set(px, ny, Tile.platform);
        pathTiles.push({ x: px, y: ny });
      }
      cx = nx + Math.floor(len / 2);
      cy = ny;
      if (cx >= COLS - 6) break;
    }

    // 4) Place goal on a path tile (right side preferred)
    const rightPath = pathTiles.filter((p) => p.x >= COLS - 8).sort((a, b) => b.x - a.x);
    const goalCandidates = rightPath.length ? rightPath : pathTiles.slice(-5);
    const goalTile = goalCandidates[Math.min(Math.floor(rng() * goalCandidates.length), goalCandidates.length - 1)];
    set(goalTile.x, goalTile.y, Tile.goal);

    // 5) Add hazards/decorations without blocking path (avoid overwriting start/goal)
    for (const p of pathTiles) {
      if ((p.x === 2 && p.y === sy) || (p.x === goalTile.x && p.y === goalTile.y)) continue;
      if (f[p.y * COLS + p.x] !== Tile.platform) continue;
      if (p.y <= 0) continue;
      if (rng() < 0.12) set(p.x, p.y - 1, Tile.jumppad);
      else if (rng() < 0.08) set(p.x, p.y - 1, Tile.hex);
    }
    for (let x = 6; x < COLS - 6; x++) {
      if (f[(ROWS - 3) * COLS + x] === Tile.empty && rng() < 0.06) set(x, ROWS - 3, Tile.spikes);
    }

    return f;
  }

  let selectedTier = "easy";
  function renderLevelListByTier() {
    if (!elLevelListByTier) return;
    const levels = BUILTIN_LEVELS.filter((l) => l.tier === selectedTier);
    elLevelListByTier.innerHTML = "";
    for (let i = 0; i < BUILTIN_LEVELS.length; i++) {
      const lvl = BUILTIN_LEVELS[i];
      if (lvl.tier !== selectedTier) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn levelSelectBtn";
      btn.textContent = lvl.name;
      btn.dataset.levelId = lvl.id;
      btn.dataset.levelIndex = String(i);
      btn.addEventListener("click", () => {
        loadFlatIntoGrid(lvl.tilesFlat);
        closeModal(elStartModal);
        startPlay(lvl.id, i);
      });
      elLevelListByTier.appendChild(btn);
    }
  }

  document.querySelectorAll(".levelTab").forEach((tab) => {
    tab.addEventListener("click", () => {
      selectedTier = tab.dataset.tier || "easy";
      document.querySelectorAll(".levelTab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderLevelListByTier();
    });
  });

  elClearBtn.addEventListener("click", () => {
    clearGrid();
    showToast("Cleared grid.");
    if (mode === "play") restartPlay();
  });

  // ---------- Palette UI ----------
  const tileButtons = new Map();
  function buildPalette() {
    elPalette.innerHTML = "";
    for (const t of paletteOrder) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tileBtn";
      btn.dataset.tile = t;

      const ic = document.createElement("span");
      ic.className = "tileEmoji";
      ic.setAttribute("aria-hidden", "true");
      ic.textContent = TilePaletteIcon[t] || "·";

      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = TileInfo[t].color || "transparent";

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = TileInfo[t].name;

      const small = document.createElement("span");
      small.className = "small";
      small.textContent = TileInfo[t].hint;
      label.appendChild(small);

      btn.title = `${TileInfo[t].name}: ${TileInfo[t].hint}`;
      btn.appendChild(ic);
      btn.appendChild(sw);
      btn.appendChild(label);
      btn.addEventListener("click", () => {
        selectedTile = t;
        syncPaletteSelection();
      });

      elPalette.appendChild(btn);
      tileButtons.set(t, btn);
    }
    syncPaletteSelection();
  }
  function syncPaletteSelection() {
    for (const [t, btn] of tileButtons.entries()) btn.classList.toggle("selected", t === selectedTile);
    if (elTouchEraserBtn) elTouchEraserBtn.classList.toggle("touchToolActive", selectedTile === Tile.empty);
  }

  if (elTouchRestartBtn) {
    elTouchRestartBtn.addEventListener("click", () => {
      if (!elRestartBtn.disabled) elRestartBtn.click();
    });
  }
  if (elTouchModeToggleBtn) {
    elTouchModeToggleBtn.addEventListener("click", () => {
      if (mode === "play") setMode("build");
      else setMode("play");
    });
  }
  if (elTouchEraserBtn) {
    elTouchEraserBtn.addEventListener("click", () => {
      selectedTile = Tile.empty;
      syncPaletteSelection();
      showToast("Eraser — tap tiles to clear.");
    });
  }
  if (elTouchClearGridBtn) {
    elTouchClearGridBtn.addEventListener("click", () => elClearBtn.click());
  }

  // ---------- Level validation + difficulty ----------
  let validateTimer = 0;
  function scheduleValidate() {
    validateTimer = 1; // cheap "debounce" on next frame
  }

  /** @type {{ok:boolean, message:string, difficulty:number, counts:any, pathVerified?:boolean}} */
  let lastValidation = {
    ok: false,
    message: "Needs Start + Goal + ground under Start",
    difficulty: 0,
    counts: countTiles(grid),
  };

  function validateLevel() {
    const counts = countTiles(grid);
    const difficulty = computeDifficulty(counts);

    const start = findType(Tile.start);
    const goal = findType(Tile.goal);
    if (!start || !goal) {
      return { ok: false, message: "Needs Start + Goal", difficulty, counts };
    }

    for (const k of Object.keys(BUILD_LIMITS)) {
      // @ts-ignore
      if (counts[k] > BUILD_LIMITS[k]) return { ok: false, message: "Over tile limit", difficulty, counts };
    }

    if (!spawnHasSolidSupport(grid, start)) {
      return {
        ok: false,
        message: "Start needs solid support directly below (platform, jump pad, or speed tile).",
        difficulty,
        counts,
      };
    }

    if (!goalHasGrounding(grid, goal)) {
      return {
        ok: false,
        message: "Goal needs support below (platform, jump pad, speed tile, path block, or start).",
        difficulty,
        counts,
      };
    }

    const pathDesignerOk = isPathBlockValid(grid);
    const reach = runReachabilityBfs(grid, isStandableReach);
    if (pathDesignerOk) {
      return { ok: true, message: "Ready (path blocks verify route)", difficulty, counts, pathVerified: true };
    }
    if (reach.reachesGoal) {
      return { ok: true, message: "Ready", difficulty, counts, pathVerified: true };
    }
    return {
      ok: true,
      message: "Ready — route not auto-verified; use Play to test (we never block unsure layouts).",
      difficulty,
      counts,
      pathVerified: false,
    };
  }

  function syncBuildHUD() {
    const v = lastValidation;
    const tier = getDifficultyTier(v.difficulty);
    elDifficultyValue.textContent = `${v.difficulty.toFixed(1)} (${getDifficultyLabel(v.difficulty)})`;
    elDifficultyValue.className = "v " + tier;
    elValidationValue.textContent = v.message;
    elValidationValue.classList.toggle("ok", v.ok);
    elValidationValue.classList.toggle("warn", !v.ok);
    const c = v.counts;
    elBudgetPill.textContent = `${c.platform}/${BUILD_LIMITS.platform} plat · ${c.spikes}/${BUILD_LIMITS.spikes} spk · ${c.jumppad}/${BUILD_LIMITS.jumppad} pad · ${c.hex}/${BUILD_LIMITS.hex} hex · ${c.lava || 0}/${BUILD_LIMITS.lava} lava · ${c.speedBoost || 0}/${BUILD_LIMITS.speedBoost} spd · ${c.food || 0}/${BUILD_LIMITS.food} food · ${c.pathBlock || 0}/${BUILD_LIMITS.pathBlock} path`;
  }

  function computeDifficulty(counts) {
    return (
      (counts.platform || 0) * POINTS.platform +
      (counts.spikes || 0) * POINTS.spikes +
      (counts.jumppad || 0) * POINTS.jumppad +
      (counts.hex || 0) * POINTS.hex +
      (counts.lava || 0) * POINTS.lava +
      (counts.speedBoost || 0) * POINTS.speedBoost +
      (counts.food || 0) * POINTS.food +
      (counts.pathBlock || 0) * POINTS.pathBlock
    );
  }

  /** @param {number} score */
  function getDifficultyTier(score) {
    if (score < 35) return "easy";
    if (score < 85) return "medium";
    return "hard";
  }

  function getDifficultyLabel(score) {
    return getDifficultyTier(score).charAt(0).toUpperCase() + getDifficultyTier(score).slice(1);
  }

  function countTiles(g) {
    const out = { platform: 0, spikes: 0, jumppad: 0, hex: 0, lava: 0, speedBoost: 0, food: 0, pathBlock: 0 };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = g[y][x];
        if (t === Tile.platform) out.platform++;
        else if (t === Tile.spikes) out.spikes++;
        else if (t === Tile.jumppad) out.jumppad++;
        else if (t === Tile.hex) out.hex++;
        else if (t === Tile.lava) out.lava++;
        else if (t === Tile.speedBoost) out.speedBoost++;
        else if (t === Tile.food) out.food++;
        else if (t === Tile.pathBlock) out.pathBlock++;
      }
    }
    return out;
  }

  function findType(t) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === t) return { x, y };
    return null;
  }

  function isSolid(t) {
    return t === Tile.platform || t === Tile.jumppad;
  }

  // ---------- Levels (save/load/delete) ----------
  elSaveLevelBtn.addEventListener("click", () => {
    if (!activePlayer) {
      showToast("Choose a player first.");
      openStartModal();
      return;
    }
    openModal(elLevelsModal);
    elSaveLevelNameInput.value = "";
    refreshLevelsList();
  });
  elOpenLevelsBtn.addEventListener("click", () => {
    if (!activePlayer) openStartModal();
    openModal(elLevelsModal);
    refreshLevelsList();
  });

  elConfirmSaveLevelBtn.addEventListener("click", () => {
    if (!activePlayer) return;
    const name = (elSaveLevelNameInput.value || "").trim().slice(0, 26);
    if (!name) {
      showToast("Enter a level name.");
      return;
    }
    lastValidation = validateLevel();
    syncBuildHUD();
    if (!lastValidation.ok) {
      showToast("Fix validation before saving.");
      return;
    }
    saveLevel(name);
  });

  function saveLevel(name) {
    if (!activePlayer) return;
    const now = Date.now();
    const counts = countTiles(grid);
    const level = /** @type {SavedLevel} */ ({
      id: `l_${uid()}`,
      name,
      createdAt: now,
      updatedAt: now,
      tilesFlat: flattenGrid(grid),
      cols: COLS,
      rows: ROWS,
      counts,
      difficulty: computeDifficulty(counts),
      completions: 0,
      bestPointsEarned: 0,
      bestDifficultyBeaten: 0,
    });
    activePlayer.levels[level.id] = level;
    persist();
    AudioSys.sfx.save();
    showToast(`Saved: ${name}`);
    refreshLevelsList();
    refreshLeaderboard();
  }

  function refreshLevelsList() {
    if (!activePlayer) {
      elLevelsList.innerHTML = "";
      return;
    }
    const levels = Object.values(activePlayer.levels).sort((a, b) => b.updatedAt - a.updatedAt);
    elLevelsList.innerHTML = "";
    if (levels.length === 0) {
      elLevelsList.appendChild(makeEmptyLine("No saved levels yet."));
      return;
    }
    for (const lvl of levels) {
      const item = document.createElement("div");
      item.className = "listItem";
      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = lvl.name;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `Difficulty ${lvl.difficulty.toFixed(1)} · Wins ${lvl.completions} · Best points ${lvl.bestPointsEarned.toFixed(0)}`;
      meta.appendChild(name);
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "actions";
      const loadBtn = document.createElement("button");
      loadBtn.className = "btn primary";
      loadBtn.type = "button";
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", () => {
        loadLevel(lvl.id);
        closeModal(elLevelsModal);
      });
      const delBtn = document.createElement("button");
      delBtn.className = "btn danger";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        delete activePlayer.levels[lvl.id];
        persist();
        showToast("Deleted level.");
        refreshLevelsList();
        refreshLeaderboard();
      });
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      item.appendChild(meta);
      item.appendChild(actions);
      elLevelsList.appendChild(item);
    }
  }

  function loadLevel(levelId) {
    if (!activePlayer) return;
    const lvl = activePlayer.levels[levelId];
    if (!lvl) return;
    inflateGrid(grid, lvl.tilesFlat, lvl.cols, lvl.rows);
    showToast(`Loaded: ${lvl.name}`);
    scheduleValidate();
    if (mode === "play") restartPlay();
  }

  function flattenGrid(g) {
    /** @type {TileType[]} */
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) out.push(g[y][x]);
    return out;
  }

  function inflateGrid(g, flat, cols, rows) {
    if (cols !== COLS || rows !== ROWS) {
      // Basic compatibility: if mismatch, clear and best-effort fill.
      clearGrid();
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        g[y][x] = flat[i] || Tile.empty;
      }
    }
  }

  function makeEmptyLine(text) {
    const d = document.createElement("div");
    d.className = "listItem";
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = text;
    meta.appendChild(name);
    d.appendChild(meta);
    return d;
  }

  // ---------- Player modal ----------
  function renderPlayerList(filter) {
    const q = (filter || "").trim().toLowerCase();
    const players = Object.values(save.players)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
    elPlayerList.innerHTML = "";
    if (players.length === 0) {
      elPlayerList.appendChild(makeEmptyLine("No players found."));
      return;
    }
    for (const p of players) {
      const item = document.createElement("div");
      item.className = "listItem";

      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = p.name;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `Wins ${p.stats.totalWins}/${p.stats.totalRuns} · Points ${p.stats.totalPointsEarned.toFixed(0)} · Best diff ${p.stats.bestDifficultyBeaten.toFixed(1)}`;
      meta.appendChild(name);
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "actions";
      const useBtn = document.createElement("button");
      useBtn.className = "btn primary";
      useBtn.type = "button";
      useBtn.textContent = "Use";
      useBtn.addEventListener("click", () => {
        setActivePlayer(p.id);
        closeModal(elStartModal);
      });
      actions.appendChild(useBtn);

      item.appendChild(meta);
      item.appendChild(actions);
      elPlayerList.appendChild(item);
    }
  }

  elPlayerSearchBtn.addEventListener("click", () => renderPlayerList(elPlayerSearchInput.value));
  elPlayerSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") renderPlayerList(elPlayerSearchInput.value);
  });
  elCreatePlayerBtn.addEventListener("click", () => {
    const p = createPlayer(elNewPlayerInput.value);
    if (!p) {
      showToast("Enter a valid username (2–18 chars).");
      return;
    }
    setActivePlayer(p.id);
    elNewPlayerInput.value = "";
    closeModal(elStartModal);
    showToast(`Welcome, ${p.name}.`);
  });
  elNewPlayerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") elCreatePlayerBtn.click();
  });

  elProfileChip.addEventListener("click", () => openStartModal());
  elProfileChip.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openStartModal();
  });

  // Quick play (built-ins + random)
  renderLevelListByTier();

  elQuickRandomBtn.addEventListener("click", () => {
    loadFlatIntoGrid(generateRandomLevel());
    closeModal(elStartModal);
    startPlay(null, null);
  });

  // ---------- Leaderboard ----------
  elOpenLeaderboardBtn.addEventListener("click", () => {
    openModal(elLeaderboardModal);
    refreshLeaderboard();
  });
  elLeaderboardSearchBtn.addEventListener("click", () => refreshLeaderboard(elLeaderboardSearchInput.value));
  elLeaderboardSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshLeaderboard(elLeaderboardSearchInput.value);
  });

  async function refreshGlobalLeaderboardList() {
    if (!elGlobalLeaderboardList) return;
    elGlobalLeaderboardList.innerHTML = "";
    if (isFileProtocolPage() && !getApiBase()) {
      elGlobalLeaderboardList.appendChild(makeEmptyLine("Open via npm start or set MULTIPLAYER_SERVER_URL for global board."));
      return;
    }
    try {
      const r = await fetch(apiUrl("/api/leaderboard/global?limit=50"));
      const j = await r.json();
      const rows = (j && j.leaderboard) || [];
      if (!rows.length) {
        elGlobalLeaderboardList.appendChild(makeEmptyLine("No global entries yet — register & play online."));
        return;
      }
      for (const row of rows) {
        const item = document.createElement("div");
        item.className = "listItem";
        const meta = document.createElement("div");
        meta.className = "meta";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = `#${row.rank} ${row.username}`;
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.textContent = `Points ${row.points}`;
        meta.appendChild(name);
        meta.appendChild(sub);
        item.appendChild(meta);
        elGlobalLeaderboardList.appendChild(item);
      }
    } catch {
      elGlobalLeaderboardList.appendChild(makeEmptyLine("Could not load global leaderboard."));
    }
  }

  function refreshLeaderboard(filter = "") {
    void refreshGlobalLeaderboardList();
    const q = (filter || "").trim().toLowerCase();
    const players = Object.values(save.players)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => b.stats.totalPointsEarned - a.stats.totalPointsEarned);

    elLeaderboardList.innerHTML = "";
    if (players.length === 0) {
      elLeaderboardList.appendChild(makeEmptyLine("No players yet."));
      return;
    }
    for (const p of players.slice(0, 30)) {
      const item = document.createElement("div");
      item.className = "listItem";

      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = p.name;
      const most = p.stats.mostCompletedLevelId && p.levels[p.stats.mostCompletedLevelId] ? p.levels[p.stats.mostCompletedLevelId].name : "—";
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `Points ${p.stats.totalPointsEarned.toFixed(0)} · Best diff ${p.stats.bestDifficultyBeaten.toFixed(
        1
      )} · Most completed: ${most}`;
      meta.appendChild(name);
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "actions";
      const useBtn = document.createElement("button");
      useBtn.className = "btn";
      useBtn.type = "button";
      useBtn.textContent = "Switch";
      useBtn.addEventListener("click", () => {
        setActivePlayer(p.id);
        closeModal(elLeaderboardModal);
        showToast(`Now playing as ${p.name}.`);
      });
      actions.appendChild(useBtn);

      item.appendChild(meta);
      item.appendChild(actions);
      elLeaderboardList.appendChild(item);
    }
  }

  // ---------- Settings modal ----------
  elOpenSettingsBtn.addEventListener("click", () => openModal(elSettingsModal));

  // ---------- Modal close wiring ----------
  elBackdrop.addEventListener("click", () => {
    closeModal(elStartModal);
    closeModal(elLevelsModal);
    closeModal(elLeaderboardModal);
    closeModal(elSettingsModal);
  });
  elCloseStartModalBtn.addEventListener("click", () => closeModal(elStartModal));
  elCloseLevelsModalBtn.addEventListener("click", () => closeModal(elLevelsModal));
  elCloseLeaderboardModalBtn.addEventListener("click", () => closeModal(elLeaderboardModal));
  elCloseSettingsModalBtn.addEventListener("click", () => closeModal(elSettingsModal));

  // ---------- Play mode engine ----------
  /**
   * Sabotage profiles are decided at run start and remain consistent during the run.
   * @typedef {Object} TileSabotage
   * @property {"none"|"shift"} motion
   * @property {number} shiftAmp
   * @property {number} shiftSpeed
   * @property {number} shiftPhase
   * @property {{type:"none"|"oneStep"|"delayed"|"flickerThenBreak", delayMs:number, flickerMs:number}} platform
   * @property {{type:"none"|"delayedOn"|"pulse", delayMs:number, periodMs:number, duty:number}} spikes
   * @property {{type:"none"|"reduced"|"delayed"|"flaky", strength:number, delayMs:number, failChance:number}} pad
   * @property {{type:"none"|"invertControls"|"becomeDangerous", durationMs:number, activateAtMs:number}} hex
   */

  /**
   * @typedef {Object} RuntimeTile
   * @property {TileType} type
   * @property {TileSabotage} sab
   * @property {boolean} solid
   * @property {boolean} deadly
   * @property {boolean} goal
   * @property {boolean} start
   * @property {number} breakTimer
   * @property {number} stepCount
   * @property {number} padCooldownMs
   * @property {boolean} cursedActive
   * @property {number} cursedUntil
   * @property {boolean} [spawnPinned] True for the solid tile directly under Start — never sabotaged or broken.
   */

  /**
   * @typedef {Object} Player
   * @property {number} x
   * @property {number} y
   * @property {number} vx
   * @property {number} vy
   * @property {number} w
   * @property {number} h
   * @property {boolean} onGround
   * @property {number} coyoteMs
   * @property {number} jumpBufferMs
   * @property {number} squash
   * @property {number} stretch
   * @property {boolean} doubleJumpUsed
   */

  /**
   * @typedef {{x:number,y:number,vx:number,vy:number,life:number,maxLife:number,r:number}} Particle
   */
  /**
   * @typedef {{x:number,y:number,vy:number,active:boolean}} HammerState
   */
  /**
   * @typedef {Object} PlayState
   * @property {number} t0
   * @property {number} now
   * @property {number} dt
   * @property {boolean} ended
   * @property {"win"|"lose"|null} outcome
   * @property {string} reason
   * @property {number} runSeed
   * @property {RuntimeTile[][]} tiles
   * @property {Player} player
   * @property {{x:number, y:number, followX:number, followY:number, shake:number, shakeDecay:number, fade:number, fadeTarget:number}} cam
   * @property {{invertUntil:number,speedBoostUntil:number,stabilityUntil:number}} effects
   * @property {string|null} sourceLevelId
   * @property {number|null} sourceBuiltinIndex
   * @property {number} runAttempts
   * @property {Particle[]} particles
   * @property {HammerState|null} hammer
   * @property {number} timerLimitMs
   * @property {number} timerRemainingMs
   * @property {{doubleJump:boolean,speedBoost:boolean,protection:boolean}} usedPowerups
   * @property {{runSeed?:number,noPowerups?:boolean,skipProfileMutation?:boolean}|null} mpOpts
   */

  /** @type {PlayState | null} */
  let play = null;

  /** @type {Record<string, {attempts:number, bestTimeMs:number}>} */
  let builtinLevelStats = {};

  /** Powerups selected for next built-in level (consumed when level starts) */
  let pendingPowerupsForRun = { doubleJump: false, speedBoost: false, protection: false };

  function setMode(next) {
    if (next === mode) return;
    if (next === "build") {
      if (
        mpSession.active &&
        (mpSession.phase === "mpPlayOpponent" ||
          mpSession.phase === "mpRound3" ||
          mpSession.phase === "mpSpectatePlay")
      ) {
        showToast("Finish the online run first (or use ✕ Menu to leave).");
        return;
      }
    }
    if (next === "play") {
      lastBuildStatusText = "";
      if (mpSession.active && mpSession.phase === "mpBuild") {
        showToast("Submit your level to your opponent (multiplayer).");
        return;
      }
      if (
        mpSession.active &&
        (mpSession.phase === "mpWaitBuild" ||
          mpSession.phase === "mpSpectate" ||
          mpSession.phase === "mpSpectatePlay")
      ) {
        showToast("You can't enter play mode during this multiplayer phase.");
        return;
      }
      lastValidation = validateLevel();
      syncBuildHUD();
      if (!lastValidation.ok) {
        showToast(lastValidation.message);
        return;
      }
      startPlay(null);
    } else {
      mode = "build";
      lastBuildStatusText = "";
      play = null;
      updateTimerPill(null);
      syncTouchControlsVisibility();
      syncExitAndRotateUI();
      elRestartBtn.disabled = true;
      elBuildBtn.classList.add("primary");
      elPlayBtn.classList.remove("primary");
      elStatusPill.textContent = "Build: place tiles (sabotage hidden)";
      elRunHint.textContent = "Hover the grid for tile hints.";
      showToast("Build mode.");
    }
  }

  elBuildBtn.addEventListener("click", () => setMode("build"));
  elPlayBtn.addEventListener("click", () => setMode("play"));

  elRestartBtn.addEventListener("click", () => restartPlay());

  if (elEndRetryBtn) {
    elEndRetryBtn.addEventListener("click", () => {
      if (mode === "play" && play) restartPlay();
    });
  }
  if (elEndNextLevelBtn) {
    elEndNextLevelBtn.addEventListener("click", () => {
      if (mode !== "play" || !play || play.sourceBuiltinIndex == null) return;
      const nextIndex = play.sourceBuiltinIndex + 1;
      if (nextIndex >= BUILTIN_LEVELS.length) return;
      const nextLevel = BUILTIN_LEVELS[nextIndex];
      loadFlatIntoGrid(nextLevel.tilesFlat);
      startPlay(nextLevel.id, nextIndex, play.usedPowerups);
    });
  }
  if (elEndBuildBtn) {
    elEndBuildBtn.addEventListener("click", () => {
      setMode("build");
      hideEndOverlay();
    });
  }

  /**
   * @param {string|null} sourceLevelId
   * @param {number|null} builtinIndex
   * @param {{doubleJump:boolean,speedBoost:boolean,protection:boolean}|null} [usedPowerupsFromPrevRun] For Next level, reuse without consuming.
   * @param {{runSeed?:number,noPowerups?:boolean,skipProfileMutation?:boolean}|null} [mpOpts]
   */
  function startPlay(sourceLevelId, builtinIndex = null, usedPowerupsFromPrevRun = null, mpOpts = null) {
    hideEndOverlay();
    mode = "play";
    syncTouchControlsVisibility();
    syncExitAndRotateUI();
    elRestartBtn.disabled = false;
    elPlayBtn.classList.add("primary");
    elBuildBtn.classList.remove("primary");
    elStatusPill.textContent = mpOpts && mpOpts.spectator ? "Spectating" : "Play: reach the Goal";
    elRunHint.textContent = "Sabotage is active (seeded this run).";
    if (!mpOpts || !mpOpts.spectator) showToast("Play mode. Sabotage activated.");
    if (sourceLevelId) {
      builtinLevelStats[sourceLevelId] = builtinLevelStats[sourceLevelId] || { attempts: 0, bestTimeMs: Infinity };
    }
    play = createPlayState(sourceLevelId, builtinIndex, 1, usedPowerupsFromPrevRun, mpOpts);
    if (!mpOpts || !mpOpts.skipProfileMutation) {
      if (activePlayer) activePlayer.stats.totalRuns++;
      persist();
    }
  }

  function restartPlay() {
    if (mode !== "play") return;
    if (
      mpSession.active &&
      (mpSession.phase === "mpPlayOpponent" ||
        mpSession.phase === "mpRound3" ||
        mpSession.phase === "mpSpectatePlay")
    ) {
      showToast("Restart is disabled during online rounds.");
      return;
    }
    hideEndOverlay();
    const prev = play;
    const nextAttempts = prev ? prev.runAttempts + 1 : 1;
    const used = prev && prev.sourceLevelId ? prev.usedPowerups : { doubleJump: false, speedBoost: false, protection: false };
    play = createPlayState(prev ? prev.sourceLevelId : null, prev ? prev.sourceBuiltinIndex : null, nextAttempts, used, prev ? prev.mpOpts : null);
    showToast("Restarted run.");
  }

  /** @param {number|null} builtinIndex */
  function getTimerLimitMs(builtinIndex) {
    if (builtinIndex == null) return 0;
    const level = BUILTIN_LEVELS[builtinIndex];
    if (!level) return 0;
    if (level.tier === "easy") return 2 * 60 * 1000;
    if (level.tier === "medium") return 1.5 * 60 * 1000;
    if (level.tier === "hard") return 1 * 60 * 1000;
    return 0;
  }

  /**
   * @param {string|null} sourceLevelId
   * @param {number|null} builtinIndex
   * @param {number} runAttempts
   * @param {{doubleJump:boolean,speedBoost:boolean,protection:boolean}} [selectedPowerups] If from prev run (e.g. Next level), reuse without consuming.
   * @param {{runSeed?:number,noPowerups?:boolean,skipProfileMutation?:boolean,spectator?:boolean,noSpawnProtect?:boolean}|null} [mpOpts]
   */
  function createPlayState(sourceLevelId, builtinIndex = null, runAttempts = 1, selectedPowerups = null, mpOpts = null) {
    const t0 = performance.now();
    const runSeed =
      mpOpts && typeof mpOpts.runSeed === "number" ? mpOpts.runSeed >>> 0 : (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
    const tiles = makeRuntimeTiles(runSeed);
    const start = findType(Tile.start) || { x: 2, y: ROWS - 3 };
    const spawn = {
      x: start.x * TILE + TILE / 2,
      y: start.y * TILE - 2,
    };

    /** @type {{doubleJump:boolean,speedBoost:boolean,protection:boolean}} */
    let usedPowerups = { doubleJump: false, speedBoost: false, protection: false };
    const reusingFromPrevRun = selectedPowerups && typeof selectedPowerups.doubleJump === "boolean";
    const skipPowerups = mpOpts && mpOpts.noPowerups;
    if (skipPowerups) {
      usedPowerups = { doubleJump: false, speedBoost: false, protection: false };
    } else if (reusingFromPrevRun) {
      usedPowerups = { ...selectedPowerups };
    } else {
      const sel = selectedPowerups || pendingPowerupsForRun;
      if (sourceLevelId && activePlayer && activePlayer.powerups) {
        if (sel.doubleJump && activePlayer.powerups.doubleJump > 0) {
          activePlayer.powerups.doubleJump--;
          usedPowerups.doubleJump = true;
        }
        if (sel.speedBoost && activePlayer.powerups.speedBoost > 0) {
          activePlayer.powerups.speedBoost--;
          usedPowerups.speedBoost = true;
        }
        if (sel.protection && activePlayer.powerups.protection > 0) {
          activePlayer.powerups.protection--;
          usedPowerups.protection = true;
        }
        persist();
        if (usedPowerups.doubleJump) pendingPowerupsForRun.doubleJump = false;
        if (usedPowerups.speedBoost) pendingPowerupsForRun.speedBoost = false;
        if (usedPowerups.protection) pendingPowerupsForRun.protection = false;
      }
    }

    const timerLimitMs = getTimerLimitMs(builtinIndex);

    /** @type {Player} */
    const player = {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      w: 18,
      h: 26,
      onGround: false,
      coyoteMs: 0,
      jumpBufferMs: 0,
      squash: 0,
      stretch: 0,
      doubleJumpUsed: false,
    };

    const state = {
      t0,
      now: t0,
      dt: 0,
      ended: false,
      outcome: null,
      reason: "",
      runSeed,
      tiles,
      player,
      cam: { x: 0, y: 0, followX: spawn.x, followY: spawn.y, shake: 0, shakeDecay: 22, fade: 1, fadeTarget: 0 },
      effects: { invertUntil: 0, speedBoostUntil: 0, stabilityUntil: 0 },
      sourceLevelId,
      sourceBuiltinIndex: builtinIndex,
      runAttempts,
      particles: [],
      hammer: null,
      timerLimitMs,
      timerRemainingMs: timerLimitMs,
      usedPowerups,
      mpOpts: mpOpts || null,
      spectatorMode: !!(mpOpts && mpOpts.spectator),
      mpSpectateBuffer: /** @type {{x:number,y:number,vx:number,vy:number}|null} */ (null),
      spawnProtectUntil:
        mpOpts && mpOpts.noSpawnProtect ? 0 : mpOpts && mpOpts.spectator ? 0 : t0 + 2000,
      _spectEmitAcc: 0,
    };

    if (usedPowerups.speedBoost) state.effects.speedBoostUntil = t0 + 3500;
    return state;
  }

  function addParticles(state, x, y, count, upward = false) {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 40 + Math.random() * 80;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed * (upward ? -1 : 1) * (Math.random() > 0.5 ? 1 : -1),
        vy: (upward ? -1 : 1) * Math.sin(angle) * speed - (upward ? 60 : 0),
        life: 1,
        maxLife: 0.4 + Math.random() * 0.3,
        r: 2 + Math.random() * 3,
      });
    }
  }

  function updateParticles(state, dt) {
    const dtSec = dt / 1000;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vy += 120 * dtSec;
      p.life -= dtSec / p.maxLife;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  /** Start tile: no sabotage / never deadly (spawn always stable). */
  function neutralSabotageProfile() {
    return {
      motion: "none",
      shiftAmp: 0,
      shiftSpeed: 0,
      shiftPhase: 0,
      platform: { type: "none", delayMs: 0, flickerMs: 0 },
      spikes: { type: "none", delayMs: 0, periodMs: 0, duty: 0.5 },
      pad: { type: "none", strength: 1, delayMs: 0, failChance: 0 },
      hex: { type: "none", durationMs: 0, activateAtMs: 0 },
    };
  }

  function makeRuntimeTiles(runSeed) {
    /** @type {RuntimeTile[][]} */
    const out = [];
    const levelSeed = seedFromGrid(grid);
    const { start: startCell } = findStartGoalOn(grid);
    let pinX = -1;
    let pinY = -1;
    if (startCell && spawnHasSolidSupport(grid, startCell)) {
      pinX = startCell.x;
      pinY = startCell.y + 1;
    }
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const raw = grid[y][x];
        const type = raw === Tile.pathBlock ? Tile.empty : raw;
        const tileSeed = hash2(x, y) ^ levelSeed ^ runSeed;
        const rng = mulberry32(tileSeed >>> 0);
        const spawnPinned = x === pinX && y === pinY && isSpawnSupportTile(raw);
        const sab =
          type === Tile.start || spawnPinned ? neutralSabotageProfile() : makeSabotageProfile(type, rng);
        const rt = /** @type {RuntimeTile} */ ({
          type,
          sab,
          solid: type === Tile.platform || type === Tile.jumppad || type === Tile.speedBoost,
          deadly: type === Tile.spikes || type === Tile.lava,
          goal: type === Tile.goal,
          start: type === Tile.start,
          breakTimer: 0,
          stepCount: 0,
          padCooldownMs: 0,
          cursedActive: false,
          cursedUntil: 0,
          spawnPinned,
        });
        if (type === Tile.start) {
          rt.sab = neutralSabotageProfile();
          rt.deadly = false;
        }
        row.push(rt);
      }
      out.push(row);
    }
    return out;
  }

  function makeSabotageProfile(type, rng) {
    const S = sabotageTuning(save.settings.sabotageLevel || 5);
    /** @type {TileSabotage} */
    const sab = {
      motion: "none",
      shiftAmp: 0,
      shiftSpeed: 0,
      shiftPhase: 0,
      platform: { type: "none", delayMs: 0, flickerMs: 0 },
      spikes: { type: "none", delayMs: 0, periodMs: 0, duty: 0.5 },
      pad: { type: "none", strength: 1, delayMs: 0, failChance: 0 },
      hex: { type: "none", durationMs: 0, activateAtMs: 0 },
    };

    // Motion sabotage (shift) — a minority of non-empty, non-goal tiles.
    if (type !== Tile.empty && type !== Tile.goal && rng() < S.shiftChance) {
      sab.motion = "shift";
      sab.shiftAmp = lerp(1.0, 3.6 + S.shiftAmpBoost, rng());
      sab.shiftSpeed = lerp(0.55, 1.25 + S.shiftSpeedBoost, rng());
      sab.shiftPhase = rng() * Math.PI * 2;
    }

    if (type === Tile.platform) {
      // Fairness tweak: not every platform is guaranteed to betray you.
      const roll = rng();
      if (roll < S.platformNone) {
        sab.platform.type = "none";
      } else if (roll < S.platformNone + S.platformOneStep) {
        sab.platform.type = "oneStep";
      } else if (roll < S.platformNone + S.platformOneStep + S.platformDelayed) {
        sab.platform.type = "delayed";
        sab.platform.delayMs = lerp(900, 2400, rng()) * S.delayScale;
      } else {
        sab.platform.type = "flickerThenBreak";
        sab.platform.delayMs = lerp(1100, 2600, rng()) * S.delayScale;
        sab.platform.flickerMs = lerp(380, 980, rng());
      }
    } else if (type === Tile.spikes) {
      // Spikes sabotage is mostly about timing, not total unreliability.
      const roll = rng();
      if (roll < S.spikesNone) {
        sab.spikes.type = "none";
      } else if (roll < S.spikesNone + S.spikesDelayed) {
        sab.spikes.type = "delayedOn";
        sab.spikes.delayMs = lerp(420, 1700, rng()) * S.delayScale;
      } else {
        sab.spikes.type = "pulse";
        sab.spikes.periodMs = lerp(1500, 3000, rng()) * S.delayScale;
        sab.spikes.duty = lerp(0.42, 0.70, rng()) + S.pulseDutyBoost;
      }
    } else if (type === Tile.jumppad) {
      // Pads should feel helpful most of the time.
      const roll = rng();
      if (roll < S.padNone) {
        sab.pad.type = "none";
        sab.pad.strength = 1.0;
      } else if (roll < S.padNone + S.padReduced) {
        sab.pad.type = "reduced";
        sab.pad.strength = lerp(0.70 - S.padWeakening, 0.98, rng());
      } else if (roll < S.padNone + S.padReduced + S.padDelayed) {
        sab.pad.type = "delayed";
        sab.pad.delayMs = lerp(90, 320, rng()) * S.delayScale;
        sab.pad.strength = lerp(0.80 - S.padWeakening, 1.03, rng());
      } else {
        sab.pad.type = "flaky";
        sab.pad.failChance = lerp(0.06 + S.padFailBoost, 0.18 + S.padFailBoost, rng());
        sab.pad.strength = lerp(0.82 - S.padWeakening, 1.08, rng());
      }
    } else if (type === Tile.hex) {
      const roll = rng();
      if (roll < 0.60) {
        sab.hex.type = "invertControls";
        sab.hex.durationMs = lerp(1100, 2400, rng()) * (1 + S.hexDurationBoost);
      } else {
        sab.hex.type = "becomeDangerous";
        sab.hex.activateAtMs = lerp(1800, 5600, rng()) * S.delayScale;
      }
    }
    return sab;
  }

  function sabotageTuning(level) {
    const L = clamp(Math.round(level || 5), 1, 10);
    const t = (L - 1) / 9;
    // Higher intensity = fewer "none" outcomes and harsher timing.
    return {
      shiftChance: lerp(0.12, 0.34, t),
      shiftAmpBoost: lerp(0.0, 1.6, t),
      shiftSpeedBoost: lerp(0.0, 0.55, t),

      delayScale: lerp(1.10, 0.75, t), // high intensity triggers sooner
      pulseDutyBoost: lerp(-0.04, 0.06, t),

      platformNone: lerp(0.40, 0.10, t),
      platformOneStep: lerp(0.22, 0.42, t),
      platformDelayed: lerp(0.26, 0.32, t),

      spikesNone: lerp(0.45, 0.15, t),
      spikesDelayed: lerp(0.35, 0.45, t),

      padNone: lerp(0.38, 0.12, t),
      padReduced: lerp(0.26, 0.36, t),
      padDelayed: lerp(0.24, 0.34, t),
      padWeakening: lerp(0.00, 0.10, t),
      padFailBoost: lerp(0.00, 0.10, t),

      hexDurationBoost: lerp(0.00, 0.35, t),
    };
  }

  function updatePlay(dt, now) {
    if (!play) return;
    play.dt = dt;
    play.now = now;

    // Fade-in/out transitions
    const fadeSpeed = 0.0042 * dt;
    play.cam.fade += (play.cam.fadeTarget - play.cam.fade) * Math.min(1, fadeSpeed * 60);
    play.cam.fade = clamp(play.cam.fade, 0, 1);

    if (play.ended) {
      decayShake(play, dt);
      updateTimerPill(play);
      return;
    }

    // Preconfigured level timer
    if (play.timerLimitMs > 0) {
      play.timerRemainingMs -= dt;
      if (play.timerRemainingMs <= 0) {
        end(play, "lose", "Time's up!");
        updateTimerPill(play);
        return;
      }
    }
    updateTimerPill(play);

    // Spectator: deterministic tiles + network player only (no local physics / death)
    if (play.spectatorMode) {
      updateRuntimeTiles(play, dt);
      const buf = play.mpSpectateBuffer;
      if (buf) {
        play.player.x = buf.x;
        play.player.y = buf.y;
        play.player.vx = buf.vx;
        play.player.vy = buf.vy;
      }
      const followSpeed = 0.04 * (dt / 16);
      play.cam.followX += (play.player.x - play.cam.followX) * Math.min(1, followSpeed * 4);
      play.cam.followY += (play.player.y - play.cam.followY) * Math.min(1, followSpeed * 4);
      updateParticles(play, dt);
      decayShake(play, dt);
      return;
    }

    // Hammer: single-player built-in levels only (not mp_vs / online — was killing runners after ~6s)
    if (!mpSession.active && play.sourceBuiltinIndex != null && !play.hammer && play.now - play.t0 > 6000) {
      const p = play.player;
      const offsetX = (Math.random() * 2 - 1) * 80;
      play.hammer = { x: p.x + offsetX, y: -30, vy: 420, active: true };
    }
    if (play.hammer && play.hammer.active) {
      play.hammer.y += play.hammer.vy * (dt / 1000);
      const ha = { x: play.hammer.x - 12, y: play.hammer.y - 20, w: 24, h: 24 };
      const pa = playerAABB(play.player, play.player.x, play.player.y);
      if (aabbOverlap(ha, pa)) {
        const prot = play.spawnProtectUntil && play.now < play.spawnProtectUntil;
        if (prot) {
          play.hammer.active = false;
        } else if (play.usedPowerups.protection) {
          play.usedPowerups.protection = false;
          addParticles(play, play.player.x, play.player.y + play.player.h / 2, 8, true);
          addShake(play, 8);
          play.hammer.active = false;
        } else {
          end(play, "lose", "Hammer!");
          return;
        }
      }
      if (play.hammer.y > canvas.height + 50) play.hammer.active = false;
    }

    // Action hotkeys (play-only)
    if (input.wasPressed(keyForAction("restart"))) {
      if (
        !mpSession.active ||
        (mpSession.phase !== "mpPlayOpponent" &&
          mpSession.phase !== "mpRound3" &&
          mpSession.phase !== "mpSpectatePlay")
      )
        restartPlay();
      return;
    }

    // Jump buffer (keyboard + touch): edge on touch like key repeat, not hold-to-fill-buffer
    const touchJumpEdge = deviceMode === "mobile" && touchJumpDown && !touchJumpPrevDown;
    touchJumpPrevDown = deviceMode === "mobile" && touchJumpDown;
    const jumpPressed =
      input.wasPressed("w") || input.wasPressed("arrowup") || input.wasPressed("space") || touchJumpEdge;
    if (jumpPressed) play.player.jumpBufferMs = 135;
    else play.player.jumpBufferMs = Math.max(0, play.player.jumpBufferMs - dt);

    updateRuntimeTiles(play, dt);
    stepPlayer(play, dt);
    checkOutcome(play);

    if (
      mpSession.active &&
      mpSession.socket &&
      mpSession.phase === "mpPlayOpponent" &&
      !play.spectatorMode &&
      !play.ended
    ) {
      play._spectEmitAcc += dt;
      if (play._spectEmitAcc >= 100) {
        play._spectEmitAcc = 0;
        mpSession.socket.emit("mp:spectateTick", {
          x: play.player.x,
          y: play.player.y,
          vx: play.player.vx,
          vy: play.player.vy,
        });
      }
    }

    // Camera follow (smooth)
    const followSpeed = 0.04 * (dt / 16);
    play.cam.followX += (play.player.x - play.cam.followX) * Math.min(1, followSpeed * 4);
    play.cam.followY += (play.player.y - play.cam.followY) * Math.min(1, followSpeed * 4);
    updateParticles(play, dt);
    decayShake(play, dt);
  }

  function updateRuntimeTiles(state, dt) {
    const t = state.now - state.t0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = state.tiles[y][x];
        if (tile.breakTimer > 0) tile.breakTimer = Math.max(0, tile.breakTimer - dt);
        if (tile.padCooldownMs > 0) tile.padCooldownMs = Math.max(0, tile.padCooldownMs - dt);

        if (tile.type === Tile.spikes) {
          if (tile.sab.spikes.type === "delayedOn") {
            tile.deadly = t >= tile.sab.spikes.delayMs;
          } else if (tile.sab.spikes.type === "pulse") {
            const period = tile.sab.spikes.periodMs;
            const phase = (t % period) / period;
            tile.deadly = phase < tile.sab.spikes.duty;
          } else {
            tile.deadly = true;
          }
        }

        if (tile.type === Tile.hex && tile.sab.hex.type === "becomeDangerous") {
          tile.deadly = t >= tile.sab.hex.activateAtMs;
        }

        // Broken platforms become empty
        if (tile.spawnPinned) {
          tile.solid = tile.type === Tile.platform || tile.type === Tile.jumppad || tile.type === Tile.speedBoost;
          tile.breakTimer = 0;
        }
        if ((tile.type === Tile.platform || tile.type === Tile.jumppad) && tile.breakTimer === 0 && tile.solid === false) {
          // already broken
        }
        if (tile.type === Tile.platform && tile.breakTimer === 0 && tile.solid === false && tile.stepCount > 0 && !tile.spawnPinned) {
          addParticles(state, x * TILE + TILE / 2, y * TILE + TILE / 2, 8, false);
          tile.type = Tile.empty;
        }
      }
    }
  }

  function stepPlayer(state, dt) {
    if (state.spectatorMode) return;
    const p = state.player;
    const dtSec = dt / 1000;

    const stability = state.now < state.effects.stabilityUntil;
    const invert = !stability && state.now < state.effects.invertUntil;
    const left = input.keyHeld("a") || input.keyHeld("arrowleft") || (deviceMode === "mobile" && touchLeftDown);
    const right = input.keyHeld("d") || input.keyHeld("arrowright") || (deviceMode === "mobile" && touchRightDown);
    const moveLeft = invert ? right : left;
    const moveRight = invert ? left : right;

    // Horizontal
    const want = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    const control = p.onGround ? 1 : PHYS.airControl;

    if (want === 0) {
      const sign = Math.sign(p.vx);
      const mag = Math.abs(p.vx);
      const decel = PHYS.friction * dtSec;
      p.vx = Math.max(0, mag - decel) * sign;
    } else {
      const maxSpd = state.now < state.effects.speedBoostUntil ? PHYS.maxSpeed * 1.45 : PHYS.maxSpeed;
      p.vx += want * PHYS.accel * control * dtSec;
      p.vx = clamp(p.vx, -maxSpd, maxSpd);
    }

    // Gravity
    p.vy += PHYS.gravity * dtSec;
    p.vy = Math.min(p.vy, 1500);

    // Coyote
    if (p.onGround) p.coyoteMs = 120;
    else p.coyoteMs = Math.max(0, p.coyoteMs - dt);

    // Jump: normal or double jump (powerup)
    const canNormalJump = (p.onGround || p.coyoteMs > 0) && p.jumpBufferMs > 0;
    const canDoubleJump = state.usedPowerups.doubleJump && !p.onGround && !p.doubleJumpUsed && p.jumpBufferMs > 0 && p.vy > 0;
    if (canNormalJump) {
      addParticles(state, p.x, p.y + p.h - 4, 5, true);
      p.vy = -PHYS.jumpV;
      p.onGround = false;
      p.coyoteMs = 0;
      p.jumpBufferMs = 0;
      p.stretch = 1;
      p.doubleJumpUsed = false;
      AudioSys.sfx.jump();
    } else if (canDoubleJump) {
      addParticles(state, p.x, p.y + p.h - 4, 4, true);
      p.vy = -PHYS.jumpV * 0.92;
      p.jumpBufferMs = 0;
      p.doubleJumpUsed = true;
      p.stretch = 1;
      AudioSys.sfx.jump();
    }

    // Integrate + collide
    const nextX = p.x + p.vx * dtSec;
    const nextY = p.y + p.vy * dtSec;

    p.x = resolveAxis(state, p, nextX, p.y, "x");
    p.y = resolveAxis(state, p, p.x, nextY, "y");

    // Squash/stretch settle
    p.squash = lerp(p.squash, p.onGround ? 0.25 : 0, 0.08);
    p.stretch = lerp(p.stretch, p.vy < -140 ? 0.5 : 0, 0.06);

    // Footstep ticks
    if (p.onGround && Math.abs(p.vx) > 40) {
      footstepTick(state, dt);
    }

    // Fell out
    if (p.y > canvas.height + 140) end(state, "lose", "You fell.");
  }

  let stepAccum = 0;
  function footstepTick(state, dt) {
    stepAccum += dt;
    const rate = 180;
    if (stepAccum >= rate) {
      stepAccum = 0;
      AudioSys.sfx.step();
    }
  }

  function resolveAxis(state, p, tx, ty, axis) {
    const prev = axis === "x" ? p.x : p.y;
    const vel = axis === "x" ? p.vx : p.vy;
    if (vel === 0) {
      if (axis === "y") p.onGround = false;
      return axis === "x" ? tx : ty;
    }

    const ax = axis === "x" ? tx : p.x;
    const ay = axis === "y" ? ty : p.y;
    const aabb = playerAABB(p, ax, ay);
    const nearby = queryTiles(state, aabb);

    let result = axis === "x" ? tx : ty;
    if (axis === "y") p.onGround = false;

    for (const t of nearby) {
      if (!t.tile.solid) continue;
      const taabb = tileAABB(state, t.gx, t.gy);
      if (!aabbOverlap(aabb, taabb)) continue;

      if (axis === "x") {
        result = tx > prev ? taabb.x - p.w / 2 : taabb.x + taabb.w + p.w / 2;
        p.vx = 0;
      } else {
        if (ty > prev) {
          result = taabb.y - p.h;
          p.vy = 0;
          p.onGround = true;
          p.doubleJumpUsed = false;
          onLand(state, t.gx, t.gy);
        } else {
          result = taabb.y + taabb.h;
          p.vy = 0;
        }
      }
    }
    return result;
  }

  function onLand(state, gx, gy) {
    const tile = state.tiles[gy][gx];
    if (tile.type === Tile.platform && !tile.spawnPinned) {
      tile.stepCount++;
      if (tile.sab.platform.type === "oneStep" && tile.stepCount >= 1) {
        tile.solid = false;
        tile.breakTimer = 180;
      } else if (tile.sab.platform.type === "delayed" && tile.stepCount >= 1 && tile.breakTimer === 0) {
        tile.breakTimer = tile.sab.platform.delayMs;
      } else if (tile.sab.platform.type === "flickerThenBreak" && tile.stepCount >= 1 && tile.breakTimer === 0) {
        tile.breakTimer = tile.sab.platform.delayMs;
      }
    }

    if (tile.type === Tile.jumppad && tile.padCooldownMs === 0) {
      tile.padCooldownMs = 120;
      const sab = tile.sab.pad;
      if (sab.type === "delayed") {
        const runT0 = state.t0;
        const st = state;
        setTimeout(() => {
          if (st.ended || play !== st || play.t0 !== runT0) return;
          st.player.vy = -PHYS.jumpV * sab.strength;
          AudioSys.sfx.pad();
        }, sab.delayMs);
      } else {
        const fail = sab.type === "flaky" && mulberry32(state.runSeed ^ hash2(gx, gy) ^ Math.floor(state.now))() < sab.failChance;
        const strength = fail ? 0.35 : sab.type === "reduced" ? sab.strength : sab.strength || 1;
        state.player.vy = -PHYS.jumpV * strength;
        state.player.onGround = false;
        state.player.stretch = 1;
        AudioSys.sfx.pad();
      }
    }

    if (tile.type === Tile.hex) {
      const sab = tile.sab.hex;
      if (sab.type === "invertControls") {
        state.effects.invertUntil = Math.max(state.effects.invertUntil, state.now + sab.durationMs);
        AudioSys.sfx.curse();
        showToast("Cursed: controls inverted!");
      }
    }
    if (tile.type === Tile.speedBoost) {
      state.effects.speedBoostUntil = Math.max(state.effects.speedBoostUntil, state.now + 2500);
      showToast("Speed boost!");
    }
  }

  function checkOutcome(state) {
    const p = state.player;
    const aabb = playerAABB(p, p.x, p.y);
    for (const t of queryTiles(state, aabb)) {
      const tile = t.tile;
      const taabb = tileAABB(state, t.gx, t.gy);
      if (!aabbOverlap(aabb, taabb)) continue;

      if (tile.goal) {
        end(state, "win", "You reached the Goal!");
        return;
      }
      if (tile.deadly) {
        if (state.spawnProtectUntil && state.now < state.spawnProtectUntil) continue;
        if (state.usedPowerups.protection) {
          state.usedPowerups.protection = false;
          addParticles(state, p.x, p.y + p.h / 2, 10, true);
          addShake(state, 10);
          showToast("Protection absorbed one hit!");
        } else {
          end(state, "lose", tile.type === Tile.hex ? "Hexed." : tile.type === Tile.lava ? "Lava." : "Spikes.");
        }
        return;
      }
      if (tile.type === Tile.food) {
        state.effects.stabilityUntil = Math.max(state.effects.stabilityUntil, state.now + 3500);
        state.effects.invertUntil = Math.min(state.effects.invertUntil, state.now);
        showToast("Food: stability restored!");
      }
    }
  }

  function syncEndOverlay(state) {
    if (!elEndOverlay || !state) return;
    elEndOverlay.classList.remove("hidden");
    elEndOverlay.setAttribute("aria-hidden", "false");
    if (elEndOverlayMessage) {
      elEndOverlayMessage.textContent = state.outcome === "win" ? "YOU WIN" : "YOU LOSE";
      elEndOverlayMessage.className = "endOverlayMessage " + state.outcome;
    }
    if (elEndOverlayStats) {
      let stats = `Attempts: ${state.runAttempts}`;
      if (state.outcome === "lose" && state.reason) stats += ` · ${state.reason}`;
      if (state.sourceLevelId && builtinLevelStats[state.sourceLevelId]) {
        const best = builtinLevelStats[state.sourceLevelId].bestTimeMs;
        stats += best < Infinity ? ` · Best: ${(best / 1000).toFixed(1)}s` : "";
      }
      elEndOverlayStats.textContent = stats;
    }
    if (elEndNextLevelBtn) {
      const hasNext = state.sourceBuiltinIndex != null && state.sourceBuiltinIndex + 1 < BUILTIN_LEVELS.length;
      elEndNextLevelBtn.style.display = hasNext ? "" : "none";
    }
  }

  function hideEndOverlay() {
    if (elEndOverlay) {
      elEndOverlay.classList.add("hidden");
      elEndOverlay.setAttribute("aria-hidden", "true");
    }
  }

  /** Timer pill: always visible in play mode (shows "—" when no timer) so it never disappears. */
  function updateTimerPill(state) {
    if (!elTimerPill) return;
    elTimerPill.classList.remove("hidden");
    if (!state || state.timerLimitMs <= 0) {
      elTimerPill.textContent = "—";
      elTimerPill.classList.remove("warn", "ok");
      return;
    }
    const sec = Math.max(0, Math.ceil(state.timerRemainingMs / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    elTimerPill.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    elTimerPill.classList.toggle("warn", state.timerRemainingMs < 20000);
    elTimerPill.classList.toggle("ok", state.timerRemainingMs >= 20000);
  }

  function end(state, outcome, reason) {
    if (state.ended) return;
    state.ended = true;
    state.outcome = outcome;
    state.reason = reason;
    state.cam.fadeTarget = 0.55;

    if (mpSession.active && mpSession.socket && (mpSession.phase === "mpPlayOpponent" || mpSession.phase === "mpRound3")) {
      if (mpSession.phase === "mpPlayOpponent") {
        mpSession.socket.emit("mp:runEnd", { outcome });
      } else {
        mpSession.socket.emit("mp:round3End", { outcome, timeMs: state.now - state.t0 });
      }
      if (outcome === "lose") {
        addShake(state, 16);
        AudioSys.sfx.lose();
      } else {
        AudioSys.sfx.win();
      }
      hideEndOverlay();
      showToast(outcome === "win" ? "You finished this round." : `Round over — ${reason || "lose"}.`, 2200);
      syncExitAndRotateUI();
      return;
    }

    if (activePlayer) {
      if (outcome === "win") activePlayer.stats.totalWins++;
      else activePlayer.stats.totalDeaths++;
    }

    const diff = lastValidation.difficulty || computeDifficulty(countTiles(grid));
    if (outcome === "lose") {
      addShake(state, 16);
      AudioSys.sfx.lose();
      showToast(state.runAttempts > 2 ? "Close! Try again." : `LOSE — ${reason}`, 2200);
    } else {
      AudioSys.sfx.win();
      const timeMs = state.now - state.t0;
      if (state.sourceLevelId && builtinLevelStats[state.sourceLevelId]) {
        builtinLevelStats[state.sourceLevelId].bestTimeMs = Math.min(
          builtinLevelStats[state.sourceLevelId].bestTimeMs,
          timeMs
        );
      }
      const highDiff = diff >= 70;
      showToast(highDiff ? "High difficulty cleared!" : `WIN — ${reason}`, 2400);
    }
    syncEndOverlay(state);
    syncExitAndRotateUI();

    // Powerup reward: random after winning Medium/Hard preconfigured level
    if (activePlayer && outcome === "win" && state.sourceLevelId && state.sourceBuiltinIndex != null) {
      const level = BUILTIN_LEVELS[state.sourceBuiltinIndex];
      if (level && (level.tier === "medium" || level.tier === "hard") && Math.random() < 0.4) {
        const keys = ["doubleJump", "speedBoost", "protection"];
        const key = keys[Math.floor(Math.random() * keys.length)];
        activePlayer.powerups[key] = (activePlayer.powerups[key] || 0) + 1;
        showToast(`Earned ${key === "doubleJump" ? "Double Jump" : key === "speedBoost" ? "Speed Boost" : "Protection"}!`);
      }
    }

    // Points + progression
    if (activePlayer) {
      const mult = diff >= 120 ? 1.6 : diff >= 70 ? 1.3 : diff >= 35 ? 1.15 : 1.0;
      const base = outcome === "win" ? diff : Math.max(0, diff * 0.25);
      const earned = base * mult;
      activePlayer.stats.totalPointsEarned += earned;
      if (outcome === "win") activePlayer.stats.bestDifficultyBeaten = Math.max(activePlayer.stats.bestDifficultyBeaten, diff);

      // Update "most completed level" by best-effort matching to a saved level snapshot.
      const match = matchSavedLevelByGrid(activePlayer);
      if (match) {
        const lvl = activePlayer.levels[match];
        if (outcome === "win") {
          lvl.completions++;
          lvl.bestDifficultyBeaten = Math.max(lvl.bestDifficultyBeaten, diff);
          lvl.bestPointsEarned = Math.max(lvl.bestPointsEarned, earned);
          lvl.updatedAt = Date.now();
        }
        // recompute most completed
        let bestId = "";
        let bestCount = -1;
        for (const l of Object.values(activePlayer.levels)) {
          if (l.completions > bestCount) {
            bestCount = l.completions;
            bestId = l.id;
          }
        }
        activePlayer.stats.mostCompletedLevelId = bestId;
      }

      persist();
      refreshLeaderboard();
      refreshLevelsList();
    }
  }

  function matchSavedLevelByGrid(player) {
    // Try to find an exact tilesFlat match. This keeps "completion count" meaningful without forcing play-from-saved.
    const current = flattenGrid(grid).join("|");
    for (const lvl of Object.values(player.levels)) {
      if (lvl.tilesFlat.join("|") === current) return lvl.id;
    }
    return null;
  }

  // ---------- Camera shake / fade ----------
  function addShake(state, amount) {
    state.cam.shake = Math.max(state.cam.shake, amount);
  }
  function decayShake(state, dt) {
    state.cam.shake = Math.max(0, state.cam.shake - state.cam.shakeDecay * (dt / 1000));
  }
  function camOffset(state) {
    if (!state) return { x: 0, y: 0 };
    const s = state.cam.shake;
    if (s <= 0.001) return { x: 0, y: 0 };
    const a = s * s;
    const ph = state.now * 0.048;
    return { x: Math.sin(ph) * a * 0.85, y: Math.cos(ph * 1.07) * a * 0.85 };
  }

  // ---------- Rendering (layer order: background → world/play → screen fade; HTML UI is above canvas) ----------
  function render(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const parallaxX = mode === "play" && play && !play.ended ? canvas.width / 2 - play.cam.followX : 0;
    drawBackground(ctx, now, parallaxX);

    if (mode === "build") {
      drawBuild(ctx);
      const btxt = "Build: place tiles (sabotage hidden)";
      if (btxt !== lastBuildStatusText) {
        lastBuildStatusText = btxt;
        elStatusPill.textContent = btxt;
      }
    } else if (mode === "play" && play) {
      const off = camOffset(play);
      ctx.save();
      ctx.translate(canvas.width / 2 - play.cam.followX, canvas.height / 2 - play.cam.followY);
      ctx.translate(off.x, off.y);
      drawPlay(ctx, play, now);
      ctx.restore();

      // Fade overlay
      if (play.cam.fade > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${clamp(play.cam.fade, 0, 0.75)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }
  }

  /**
   * Layered backgrounds with optional horizontal parallax in play mode (camera follow).
   * @param {number} [parallaxX] world offset from canvas center (pixels)
   */
  function drawBackground(ctx2, now, parallaxX = 0) {
    const t = now / 1000;
    const theme = save.settings.background || "nebula";
    const px = parallaxX || 0;
    const layer = (factor) => px * factor * 0.42;

    if (theme === "grid") {
      const sky = ctx2.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, "rgba(10, 12, 26, 0.95)");
      sky.addColorStop(1, "rgba(2, 3, 10, 1)");
      ctx2.fillStyle = sky;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.06), 0);
      const hz = canvas.height * 0.55;
      const glow = ctx2.createRadialGradient(canvas.width / 2, hz, 10, canvas.width / 2, hz, canvas.width * 0.7);
      glow.addColorStop(0, "rgba(167,139,250,0.14)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = glow;
      ctx2.fillRect(-80, 0, canvas.width + 160, canvas.height);
      ctx2.strokeStyle = "rgba(122,167,255,0.14)";
      ctx2.lineWidth = 1;
      const spacing = 24;
      for (let y = Math.floor(hz); y < canvas.height; y += spacing) {
        ctx2.beginPath();
        ctx2.moveTo(-80, y + 0.5);
        ctx2.lineTo(canvas.width + 80, y + 0.5);
        ctx2.stroke();
      }
      for (let x = 0; x < canvas.width + 120; x += spacing) {
        const k = (x / canvas.width - 0.5) * 0.9;
        ctx2.beginPath();
        ctx2.moveTo(x + 0.5, hz);
        ctx2.lineTo(canvas.width / 2 + k * canvas.width * 1.2 + layer(0.04), canvas.height);
        ctx2.stroke();
      }
      ctx2.restore();
    } else if (theme === "cuteFlowers") {
      const g = ctx2.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, "rgba(255, 248, 252, 1)");
      g.addColorStop(0.38, "rgba(252, 231, 243, 1)");
      g.addColorStop(0.72, "rgba(233, 245, 238, 1)");
      g.addColorStop(1, "rgba(214, 236, 226, 1)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      const softEllipse = (bx, by, rw, rh, fill) => {
        ctx2.fillStyle = fill;
        ctx2.beginPath();
        ctx2.ellipse(bx, by, rw, rh, 0, 0, Math.PI * 2);
        ctx2.fill();
      };
      ctx2.save();
      ctx2.translate(layer(0.04), 0);
      softEllipse(canvas.width * 0.22, canvas.height + 35, 210, 130, "rgba(252, 205, 220, 0.32)");
      softEllipse(canvas.width * 0.78, canvas.height + 40, 240, 145, "rgba(225, 210, 245, 0.26)");
      softEllipse(canvas.width * 0.52, canvas.height + 18, 190, 115, "rgba(186, 230, 201, 0.3)");
      softEllipse(-50, canvas.height * 0.58, 160, 85, "rgba(255, 240, 248, 0.45)");
      softEllipse(canvas.width + 45, canvas.height * 0.52, 175, 95, "rgba(230, 242, 255, 0.38)");
      const hg = ctx2.createLinearGradient(0, 0, 0, canvas.height * 0.72);
      hg.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      hg.addColorStop(0.55, "rgba(255, 255, 255, 0.08)");
      hg.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx2.fillStyle = hg;
      ctx2.fillRect(-60, 0, canvas.width + 120, canvas.height * 0.72);
      ctx2.restore();
    } else if (theme === "city") {
      const g = ctx2.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "rgba(72, 61, 120, 0.95)");
      g.addColorStop(0.55, "rgba(28, 32, 58, 0.98)");
      g.addColorStop(1, "rgba(12, 14, 28, 1)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.04), 0);
      ctx2.fillStyle = "rgba(40, 45, 72, 0.85)";
      for (let i = 0; i < 14; i++) {
        const w = 28 + (i % 4) * 18;
        const h = 80 + (i * 37) % 120;
        const x = i * 74 - 20;
        ctx2.fillRect(x, canvas.height - h - 40, w, h);
      }
      ctx2.restore();
      ctx2.save();
      ctx2.translate(layer(0.14), 0);
      ctx2.fillStyle = "rgba(18, 22, 42, 0.92)";
      for (let i = 0; i < 18; i++) {
        const w = 22 + (i % 3) * 16;
        const h = 50 + (i * 29) % 90;
        const x = i * 58 - 10;
        ctx2.fillRect(x, canvas.height - h - 10, w, h);
      }
      ctx2.fillStyle = "rgba(255, 230, 150, 0.35)";
      for (let i = 0; i < 40; i++) {
        const x = (i * 47 + t * 3) % canvas.width;
        const y = canvas.height * 0.25 + (i % 6) * 8;
        ctx2.fillRect(x, y, 2, 3);
      }
      ctx2.restore();
    } else if (theme === "dusk") {
      const g = ctx2.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, `rgba(255, 166, 103, ${0.06 + 0.02 * Math.sin(t * 0.35)})`);
      g.addColorStop(0.55, "rgba(20, 18, 40, 0.95)");
      g.addColorStop(1, "rgba(6, 7, 16, 1)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.08), 0);
      ctx2.fillStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < 70; i++) {
        const x = (i * 91 + t * 9 * (0.7 + (i % 6) * 0.03)) % canvas.width;
        const y = (i * 59 + t * 6 * (0.8 + (i % 4) * 0.03)) % canvas.height;
        ctx2.fillRect(x, y, 2, 2);
      }
      ctx2.restore();
    } else if (theme === "forest") {
      const g = ctx2.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "rgba(20, 60, 35, 0.95)");
      g.addColorStop(0.5, "rgba(15, 45, 25, 0.98)");
      g.addColorStop(1, "rgba(8, 28, 15, 1)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.1), 0);
      ctx2.fillStyle = "rgba(56, 161, 105, 0.12)";
      for (let i = 0; i < 60; i++) {
        const x = (i * 73 + t * 5) % canvas.width;
        const y = (i * 47 + t * 3) % canvas.height;
        ctx2.fillRect(x, y, 3, 3);
      }
      ctx2.restore();
    } else if (theme === "indian") {
      const g = ctx2.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "rgba(80, 35, 20, 0.95)");
      g.addColorStop(0.4, "rgba(55, 25, 15, 0.98)");
      g.addColorStop(1, "rgba(30, 12, 8, 1)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.07), 0);
      ctx2.fillStyle = "rgba(221, 107, 32, 0.15)";
      for (let i = 0; i < 50; i++) {
        const x = (i * 89 + t * 7) % canvas.width;
        const y = (i * 61 + t * 5) % canvas.height;
        ctx2.beginPath();
        ctx2.arc(x, y, 2, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.restore();
    } else {
      const g = ctx2.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, `rgba(40, 54, 120, ${0.20 + 0.06 * Math.sin(t * 0.55)})`);
      g.addColorStop(1, `rgba(10, 12, 26, 0.92)`);
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.09), 0);
      ctx2.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 80; i++) {
        const x = (i * 97 + t * 12 * (0.7 + (i % 7) * 0.03)) % canvas.width;
        const y = (i * 53 + t * 8 * (0.8 + (i % 5) * 0.03)) % canvas.height;
        ctx2.fillRect(x, y, 2, 2);
      }
      ctx2.restore();
    }
  }

  function drawBuild(ctx2) {
    // Tiles
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = grid[y][x];
        if (t === Tile.empty) continue;
        drawTile(ctx2, t, x * TILE, y * TILE, 1, 0);
      }
    }

    // Ghost preview
    if (pointer.over && inBounds(pointer.gx, pointer.gy) && selectedTile !== Tile.empty) {
      const a = pointer.canPlace ? 0.42 : 0.18;
      drawTile(ctx2, selectedTile, pointer.gx * TILE, pointer.gy * TILE, a, 1);
      ctx2.save();
      ctx2.strokeStyle = pointer.canPlace ? "rgba(45, 212, 191, 0.55)" : "rgba(255, 77, 109, 0.5)";
      ctx2.lineWidth = 2;
      ctx2.strokeRect(pointer.gx * TILE + 1, pointer.gy * TILE + 1, TILE - 2, TILE - 2);
      ctx2.restore();
    }

    const nowB = performance.now();
    for (let i = eraseFx.length - 1; i >= 0; i--) {
      const e = eraseFx[i];
      const u = (nowB - e.t0) / 240;
      if (u >= 1) {
        eraseFx.splice(i, 1);
        continue;
      }
      const ease = 1 - (1 - u) * (1 - u);
      const cx = e.gx * TILE + TILE / 2;
      const cy = e.gy * TILE + TILE / 2;
      const sc = 1 - 0.38 * ease;
      const alpha = 1 - u;
      ctx2.save();
      ctx2.globalAlpha = alpha * 0.88;
      ctx2.translate(cx, cy);
      ctx2.scale(sc, sc);
      ctx2.translate(-cx, -cy);
      drawTile(ctx2, e.prev, e.gx * TILE, e.gy * TILE, 0.72 + 0.2 * (1 - u), 0);
      ctx2.restore();
      ctx2.save();
      ctx2.globalAlpha = alpha * 0.35;
      ctx2.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx2.beginPath();
      ctx2.arc(cx, cy, TILE * (0.42 + 0.2 * (1 - u)), 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
    }

    if (save.settings.debugOverlay && pathDebugCells && pathDebugCells.size) {
      ctx2.save();
      ctx2.fillStyle = "rgba(45, 212, 191, 0.18)";
      for (const k of pathDebugCells) {
        const parts = k.split(",");
        const sx = parseInt(parts[0], 10);
        const sy = parseInt(parts[1], 10);
        if (!inBounds(sx, sy)) continue;
        ctx2.fillRect(sx * TILE + 5, sy * TILE + 5, TILE - 10, TILE - 10);
      }
      ctx2.restore();
    }

    // Grid lines
    ctx2.strokeStyle = "rgba(255,255,255,0.06)";
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    for (let x = 0; x <= COLS; x++) {
      ctx2.moveTo(x * TILE + 0.5, 0);
      ctx2.lineTo(x * TILE + 0.5, canvas.height);
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx2.moveTo(0, y * TILE + 0.5);
      ctx2.lineTo(canvas.width, y * TILE + 0.5);
    }
    ctx2.stroke();
  }

  function drawPlay(ctx2, state, now) {
    // Tiles
    const t = (now - state.t0) / 1000;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = state.tiles[y][x];
        if (tile.type === Tile.empty) continue;

        const { ox, oy } = tileOffset(tile, t);
        let alpha = 1;

        // Flicker for platforms near break
        if (tile.type === Tile.platform && tile.sab.platform.type === "flickerThenBreak" && tile.breakTimer > 0) {
          const flicker = tile.sab.platform.flickerMs;
          if (tile.breakTimer < flicker) alpha = 0.25 + 0.75 * (Math.sin((tile.breakTimer / flicker) * Math.PI * 10) * 0.5 + 0.5);
        }

        // Spikes: dim when off; pulse warning before delayed activation
        if (tile.type === Tile.spikes) {
          if (!tile.deadly) {
            alpha = 0.35;
            if (tile.sab.spikes.type === "delayedOn") {
              const timeLeft = tile.sab.spikes.delayMs - (state.now - state.t0);
              if (timeLeft > 0 && timeLeft < 600) alpha = 0.35 + 0.4 * Math.sin(t * 8);
            }
          }
        }
        if (tile.type === Tile.hex && tile.deadly) alpha = 0.95;

        const glowBoost = tile.type === Tile.goal ? 1 + 0.5 * Math.sin(t * 2.5) : 0;
        drawTile(ctx2, tile.type, x * TILE + ox, y * TILE + oy, alpha, glowBoost);
      }
    }

    // Particles
    for (const p of state.particles) {
      ctx2.save();
      ctx2.globalAlpha = Math.max(0, p.life);
      ctx2.fillStyle = "rgba(255,255,255,0.7)";
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.restore();
    }

    // Hammer hazard
    if (state.hammer && state.hammer.active) {
      ctx2.save();
      ctx2.fillStyle = "rgba(80,60,40,0.95)";
      ctx2.fillRect(state.hammer.x - 10, state.hammer.y - 18, 20, 22);
      ctx2.fillStyle = "rgba(120,90,60,0.9)";
      ctx2.fillRect(state.hammer.x - 12, state.hammer.y - 22, 24, 8);
      ctx2.restore();
    }

    // Player (always above tiles / background)
    drawPlayer(ctx2, state.player, state);

    if (save.settings.debugOverlay && !state.ended) {
      const p = state.player;
      const aabb = playerAABB(p, p.x, p.y);
      ctx2.save();
      ctx2.strokeStyle = "rgba(45, 212, 191, 0.9)";
      ctx2.lineWidth = 1.5;
      ctx2.strokeRect(aabb.x, aabb.y, aabb.w, aabb.h);
      for (const q of queryTiles(state, aabb)) {
        const ta = tileAABB(state, q.gx, q.gy);
        ctx2.strokeStyle = q.tile.solid ? "rgba(122, 167, 255, 0.55)" : "rgba(255, 255, 255, 0.12)";
        ctx2.lineWidth = 1;
        ctx2.strokeRect(ta.x + 0.5, ta.y + 0.5, ta.w - 1, ta.h - 1);
      }
      const { maxDy, maxDx } = jumpBoundsFromPhysics();
      const gx = Math.floor(p.x / TILE);
      const gy = Math.floor((p.y + p.h * 0.5) / TILE);
      ctx2.strokeStyle = "rgba(251, 191, 36, 0.4)";
      ctx2.setLineDash([5, 5]);
      ctx2.strokeRect((gx - maxDx) * TILE, (gy - maxDy) * TILE, (maxDx * 2 + 1) * TILE, maxDy * TILE + TILE);
      ctx2.setLineDash([]);
      ctx2.fillStyle = "rgba(251, 191, 36, 0.12)";
      ctx2.fillRect((gx - maxDx) * TILE, (gy - maxDy) * TILE, (maxDx * 2 + 1) * TILE, maxDy * TILE + TILE);
      ctx2.restore();
    }

    const mpHideCanvasEnd =
      mpSession.active && (mpSession.phase === "mpPlayOpponent" || mpSession.phase === "mpRound3");
    if (state.ended && !mpHideCanvasEnd) drawEndOverlay(ctx2, state);
  }

  function tileOffset(tile, tSec) {
    if (tile.sab.motion !== "shift") return { ox: 0, oy: 0 };
    const ox = Math.sin(tSec * tile.sab.shiftSpeed + tile.sab.shiftPhase) * tile.sab.shiftAmp;
    const oy = Math.cos(tSec * tile.sab.shiftSpeed * 0.9 + tile.sab.shiftPhase) * (tile.sab.shiftAmp * 0.18);
    return { ox, oy };
  }

  function drawTile(ctx2, type, x, y, alpha = 1, glowBoost = 0) {
    ctx2.save();
    ctx2.globalAlpha = alpha;

    if (type === Tile.platform) {
      glowRect(ctx2, x + 2, y + 6, TILE - 4, TILE - 8, "rgba(79,103,255,0.9)", glowBoost);
    } else if (type === Tile.spikes) {
      drawSpikes(ctx2, x, y, glowBoost);
    } else if (type === Tile.jumppad) {
      glowRect(ctx2, x + 6, y + 10, TILE - 12, TILE - 14, "rgba(45,212,191,0.9)", glowBoost);
      ctx2.fillStyle = "rgba(255,255,255,0.12)";
      ctx2.beginPath();
      ctx2.moveTo(x + 10, y + TILE - 10);
      ctx2.lineTo(x + TILE - 10, y + TILE - 10);
      ctx2.lineTo(x + TILE / 2, y + 14);
      ctx2.closePath();
      ctx2.fill();
    } else if (type === Tile.goal) {
      glowRect(ctx2, x + 7, y + 7, TILE - 14, TILE - 14, "rgba(251,191,36,0.95)", 1);
      ctx2.fillStyle = "rgba(0,0,0,0.16)";
      ctx2.beginPath();
      ctx2.arc(x + TILE / 2, y + TILE / 2, 7, 0, Math.PI * 2);
      ctx2.fill();
    } else if (type === Tile.start) {
      glowRect(ctx2, x + 6, y + 6, TILE - 12, TILE - 12, "rgba(122,167,255,0.92)", 1);
      ctx2.strokeStyle = "rgba(255,255,255,0.22)";
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.moveTo(x + TILE / 2, y + 10);
      ctx2.lineTo(x + TILE / 2, y + TILE - 10);
      ctx2.stroke();
    } else if (type === Tile.hex) {
      glowRect(ctx2, x + 6, y + 6, TILE - 12, TILE - 12, "rgba(167,139,250,0.92)", 1);
      ctx2.fillStyle = "rgba(0,0,0,0.20)";
      ctx2.beginPath();
      ctx2.arc(x + TILE / 2, y + TILE / 2, 6, 0, Math.PI * 2);
      ctx2.fill();
    } else if (type === Tile.lava) {
      ctx2.shadowColor = "rgba(234,88,12,0.9)";
      ctx2.shadowBlur = 12;
      ctx2.fillStyle = "rgba(234,88,12,0.95)";
      roundRect(ctx2, x + 2, y + 4, TILE - 4, TILE - 8, 8);
      ctx2.fill();
    } else if (type === Tile.speedBoost) {
      glowRect(ctx2, x + 4, y + 6, TILE - 8, TILE - 10, "rgba(34,197,94,0.9)", glowBoost);
    } else if (type === Tile.food) {
      ctx2.fillStyle = "rgba(251,146,60,0.95)";
      ctx2.beginPath();
      ctx2.arc(x + TILE / 2, y + TILE / 2, 10, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.strokeStyle = "rgba(255,255,255,0.3)";
      ctx2.lineWidth = 2;
      ctx2.stroke();
    } else if (type === Tile.pathBlock) {
      ctx2.fillStyle = "rgba(150,200,255,0.5)";
      ctx2.strokeStyle = "rgba(150,200,255,0.8)";
      ctx2.lineWidth = 2;
      roundRect(ctx2, x + 4, y + 4, TILE - 8, TILE - 8, 8);
      ctx2.fill();
      ctx2.stroke();
    }

    ctx2.restore();
  }

  function glowRect(ctx2, x, y, w, h, color, boost = 0) {
    ctx2.save();
    ctx2.shadowColor = color;
    ctx2.shadowBlur = 10 + boost * 6;
    ctx2.fillStyle = color;
    roundRect(ctx2, x, y, w, h, 9);
    ctx2.fill();
    ctx2.restore();
    ctx2.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx2, x + 3, y + 4, w - 6, 5, 6);
    ctx2.fill();
  }

  function drawSpikes(ctx2, x, y, boost) {
    ctx2.save();
    ctx2.shadowColor = "rgba(255,77,109,0.9)";
    ctx2.shadowBlur = 10 + boost * 6;
    ctx2.fillStyle = "rgba(255,77,109,0.92)";
    ctx2.beginPath();
    const baseY = y + TILE - 4;
    const spikes = 4;
    const step = (TILE - 6) / spikes;
    ctx2.moveTo(x + 3, baseY);
    for (let i = 0; i < spikes; i++) {
      const sx = x + 3 + i * step;
      ctx2.lineTo(sx + step * 0.5, y + 7);
      ctx2.lineTo(sx + step, baseY);
    }
    ctx2.closePath();
    ctx2.fill();
    ctx2.restore();
  }

  function drawPlayer(ctx2, p, state) {
    // squash/stretch (subtle and responsive)
    const squash = 1 - p.squash * 0.22;
    const stretch = 1 + p.stretch * 0.22;
    const sx = stretch;
    const sy = squash;

    ctx2.save();
    ctx2.translate(p.x, p.y);
    ctx2.scale(sx, sy);

    const col = "rgba(235,241,255,0.96)";
    ctx2.fillStyle = col;
    roundRect(ctx2, -p.w / 2, 0, p.w, p.h, 9);
    ctx2.fill();

    const dir = Math.sign(p.vx) || 1;
    ctx2.fillStyle = "rgba(10,12,26,0.55)";
    ctx2.fillRect(2 * dir, 8, 3, 3);
    ctx2.fillRect(6 * dir, 8, 3, 3);

    if (state.spawnProtectUntil && state.now < state.spawnProtectUntil) {
      ctx2.save();
      ctx2.globalAlpha = 0.55 + 0.35 * Math.sin((state.now - state.t0) / 160);
      ctx2.strokeStyle = "rgba(45,212,191,0.95)";
      ctx2.lineWidth = 3;
      ctx2.shadowColor = "rgba(45,212,191,0.6)";
      ctx2.shadowBlur = 12;
      ctx2.beginPath();
      ctx2.arc(0, p.h * 0.45, Math.max(p.w, p.h) * 0.85, 0, Math.PI * 2);
      ctx2.stroke();
      ctx2.restore();
    }

    // Invert-controls indicator
    if (state.now < state.effects.invertUntil) {
      ctx2.strokeStyle = "rgba(167,139,250,0.75)";
      ctx2.lineWidth = 2;
      roundRect(ctx2, -p.w / 2 - 3, -4, p.w + 6, p.h + 8, 10);
      ctx2.stroke();
    }
    ctx2.restore();
  }

  function drawEndOverlay(ctx2, state) {
    ctx2.save();
    ctx2.fillStyle = "rgba(0,0,0,0.22)";
    ctx2.fillRect(0, 0, canvas.width, canvas.height);

    const msg = state.outcome === "win" ? "YOU WIN" : "YOU LOSE";
    const sub =
      state.outcome === "win"
        ? "You survived your own sabotage."
        : "Your own level betrayed you. (It was always going to.)";

    ctx2.font = "1000 44px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillStyle = state.outcome === "win" ? "rgba(45,212,191,0.95)" : "rgba(255,77,109,0.95)";
    ctx2.fillText(msg, canvas.width / 2, canvas.height / 2 - 36);

    ctx2.font = "900 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx2.fillStyle = "rgba(235,241,255,0.92)";
    ctx2.fillText(sub, canvas.width / 2, canvas.height / 2 + 2);

    let stats = `Attempts: ${state.runAttempts}`;
    if (state.sourceLevelId && builtinLevelStats[state.sourceLevelId]) {
      const best = builtinLevelStats[state.sourceLevelId].bestTimeMs;
      if (best < Infinity) stats += ` · Best: ${(best / 1000).toFixed(1)}s`;
    }
    ctx2.font = "900 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx2.fillStyle = "rgba(235,241,255,0.75)";
    ctx2.fillText(stats, canvas.width / 2, canvas.height / 2 + 28);

    ctx2.font = "900 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx2.fillStyle = "rgba(235,241,255,0.72)";
    ctx2.fillText("Retry (R) · Next level · Build mode", canvas.width / 2, canvas.height / 2 + 52);
    ctx2.restore();
  }

  // ---------- Collision helpers ----------
  function playerAABB(p, x, y) {
    return { x: x - p.w / 2, y: y, w: p.w, h: p.h };
  }

  function tileAABB(state, gx, gy) {
    const tile = state.tiles[gy][gx];
    const t = (state.now - state.t0) / 1000;
    const off = tileOffset(tile, t);
    return { x: gx * TILE + off.ox, y: gy * TILE + off.oy, w: TILE, h: TILE };
  }

  function queryTiles(state, aabb) {
    const minX = clamp(Math.floor(aabb.x / TILE) - 1, 0, COLS - 1);
    const maxX = clamp(Math.floor((aabb.x + aabb.w) / TILE) + 1, 0, COLS - 1);
    const minY = clamp(Math.floor(aabb.y / TILE) - 1, 0, ROWS - 1);
    const maxY = clamp(Math.floor((aabb.y + aabb.h) / TILE) + 1, 0, ROWS - 1);
    const out = [];
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) out.push({ gx: x, gy: y, tile: state.tiles[y][x] });
    return out;
  }

  function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Multiplayer (Socket.IO) ----------
  function hideMpLayerOverlays() {
    if (elMpWaitBuild) elMpWaitBuild.classList.add("hidden");
    if (elMpSpectate) elMpSpectate.classList.add("hidden");
    if (elMpRound3Overlay) elMpRound3Overlay.classList.add("hidden");
  }

  function syncMpHudFromServer(sc) {
    if (!sc) return;
    if (elMpHud) elMpHud.classList.remove("hidden");
    if (elMpHudRound) elMpHudRound.textContent = `Round ${sc.round}`;
    if (elMpHudScore) {
      elMpHudScore.textContent = `You ${sc.yours} · ${mpSession.opponentName || "Opponent"} ${sc.theirs}`;
    }
  }

  function showMpRound3Countdown(onDone) {
    if (elMpRound3Overlay) elMpRound3Overlay.classList.remove("hidden");
    const labels = ["3", "2", "1", "Go!"];
    let step = 0;
    function tick() {
      if (elMpRound3Countdown) elMpRound3Countdown.textContent = labels[step] || "Go!";
      step++;
      if (step < labels.length) {
        setTimeout(tick, 750);
      } else {
        setTimeout(() => {
          if (elMpRound3Overlay) elMpRound3Overlay.classList.add("hidden");
          onDone();
        }, 400);
      }
    }
    tick();
  }

  function connectMultiplayerSocket() {
    if (typeof io === "undefined") {
      showToast("Use npm start so Socket.IO loads; multiplayer won't work from a raw file URL.");
      return;
    }
    if (isMultiplayerBlockedLocalOnly()) {
      showToast("Create an account to play online multiplayer.", 3600);
      return;
    }
    resetMultiplayerClientUi();
    const name = activePlayer ? activePlayer.name : "Guest";
    const mpBase =
      typeof window !== "undefined" && typeof window.MULTIPLAYER_SERVER_URL === "string"
        ? String(window.MULTIPLAYER_SERVER_URL).trim().replace(/\/$/, "")
        : "";
    const authTok = getAuthToken();
    const socketOpts = {
      query: { name },
      transports: ["websocket", "polling"],
      path: "/socket.io/",
    };
    if (authTok) socketOpts.auth = { token: authTok };
    const socket = mpBase ? io(mpBase, socketOpts) : io(socketOpts);
    mpSession.socket = socket;
    mpSession.active = true;
    mpSession.phase = "queue";
    if (elMpMatchmaking) elMpMatchmaking.classList.remove("hidden");
    closeModal(elStartModal);

    socket.on("connect", () => {
      if (mpSession.phase === "queue" && mpSession.socket === socket) socket.emit("mp:queue");
    });

    socket.on("mp:error", (payload) => {
      const msg = payload && payload.message ? String(payload.message) : "Match error.";
      showToast(msg, 4200);
    });

    socket.on("connect_error", (err) => {
      console.error("Multiplayer connect_error:", err && err.message, err);
      showToast(
        "Could not connect to multiplayer server. On Render set CORS_ORIGIN to your Vercel URL plus ,*.vercel.app for previews. Check multiplayer-config.js Render URL.",
        5200
      );
      resetMultiplayerClientUi();
    });

    socket.on("mp:matched", (data) => {
      if (elMpMatchmaking) elMpMatchmaking.classList.add("hidden");
      mpSession.youIndex = typeof data.youIndex === "number" ? data.youIndex : 0;
      mpSession.opponentName = data.opponentName || "Opponent";
      mpSession.rematchSelfConfirmed = false;
      if (elMpRematchBtn) {
        elMpRematchBtn.textContent = "Rematch (0/2)";
        elMpRematchBtn.classList.remove("mpRematchConfirmed");
      }
      setMpChromeLocked(true);
      syncMpChatDock();
    });

    socket.on("mp:phase", (data) => {
      if (data.phase === "build") {
        hideMpLayerOverlays();
        mpSession.phase = "mpBuild";
        hideEndOverlay();
        play = null;
        mode = "build";
        mpSession.rematchSelfConfirmed = false;
        if (elMpRematchBtn) {
          elMpRematchBtn.textContent = "Rematch (0/2)";
          elMpRematchBtn.classList.remove("mpRematchConfirmed");
        }
        syncTouchControlsVisibility();
        syncExitAndRotateUI();
        elRestartBtn.disabled = true;
        elBuildBtn.classList.add("primary");
        elPlayBtn.classList.remove("primary");
        elStatusPill.textContent = "Build: place tiles (sabotage hidden)";
        if (elMpSubmitLevelBtn) elMpSubmitLevelBtn.classList.remove("hidden");
        elBuildBtn.disabled = false;
        elPlayBtn.disabled = false;
        if (elMpHudRound) elMpHudRound.textContent = `Round ${data.round} / 5`;
        if (elMpHudRole) elMpHudRole.textContent = "You build";
        if (elMpHud) elMpHud.classList.remove("hidden");
        if (elMpBuildHint) elMpBuildHint.classList.remove("hidden");
        showToast("Build, then tap Submit level in the panel.", 2800);
        scheduleValidate();
        syncMpChatDock();
      } else if (data.phase === "waitOpponent") {
        mpSession.phase = "mpWaitBuild";
        hideEndOverlay();
        play = null;
        mode = "build";
        mpSession.rematchSelfConfirmed = false;
        if (elMpRematchBtn) {
          elMpRematchBtn.textContent = "Rematch (0/2)";
          elMpRematchBtn.classList.remove("mpRematchConfirmed");
        }
        syncTouchControlsVisibility();
        syncExitAndRotateUI();
        elRestartBtn.disabled = true;
        elBuildBtn.classList.add("primary");
        elPlayBtn.classList.remove("primary");
        if (elMpSubmitLevelBtn) elMpSubmitLevelBtn.classList.add("hidden");
        hideMpLayerOverlays();
        if (elMpWaitBuild) elMpWaitBuild.classList.remove("hidden");
        elBuildBtn.disabled = true;
        elPlayBtn.disabled = true;
        if (elMpHudRound) elMpHudRound.textContent = `Round ${data.round} / 5`;
        if (elMpHudRole) elMpHudRole.textContent = "Wait";
        if (elMpHud) elMpHud.classList.remove("hidden");
        if (elMpBuildHint) elMpBuildHint.classList.add("hidden");
        syncMpChatDock();
      }
    });

    socket.on("mp:spectatePlayStart", (data) => {
      hideMpLayerOverlays();
      if (elMpWaitBuild) elMpWaitBuild.classList.add("hidden");
      if (data.tilesFlat && data.tilesFlat.length === COLS * ROWS) {
        loadFlatIntoGrid(data.tilesFlat);
        hideEndOverlay();
        const rs = data.runSeed != null ? (data.runSeed >>> 0) : undefined;
        startPlay("mp_vs", null, null, {
          runSeed: rs,
          noPowerups: true,
          skipProfileMutation: true,
          spectator: true,
          noSpawnProtect: true,
        });
        mpSession.phase = "mpSpectatePlay";
        syncTouchControlsVisibility();
        syncExitAndRotateUI();
        elRestartBtn.disabled = true;
        elBuildBtn.disabled = true;
        elPlayBtn.disabled = true;
        elStatusPill.textContent = "Spectating opponent";
        if (elMpHudRound) elMpHudRound.textContent = `Round ${data.round} / 5`;
        if (elMpHudRole) elMpHudRole.textContent = "Spectate";
        if (elMpHud) elMpHud.classList.remove("hidden");
        syncMpChatDock();
      }
    });

    socket.on("mp:spectateTick", (data) => {
      if (mpSession.phase !== "mpSpectatePlay" || !play || !play.spectatorMode) return;
      if (!data || typeof data.x !== "number" || typeof data.y !== "number") return;
      play.mpSpectateBuffer = {
        x: data.x,
        y: data.y,
        vx: typeof data.vx === "number" ? data.vx : 0,
        vy: typeof data.vy === "number" ? data.vy : 0,
      };
    });

    socket.on("mp:playLevel", (data) => {
      if (elMpWaitBuild) elMpWaitBuild.classList.add("hidden");
      if (elMpSpectate) elMpSpectate.classList.add("hidden");
      mpSession.phase = "mpPlayOpponent";
      if (data.tilesFlat && data.tilesFlat.length === COLS * ROWS) {
        loadFlatIntoGrid(data.tilesFlat);
        hideEndOverlay();
        const rs = data.runSeed != null ? (data.runSeed >>> 0) : undefined;
        startPlay("mp_vs", null, null, {
          runSeed: rs,
          noPowerups: true,
          skipProfileMutation: true,
        });
      }
      if (elMpHudRound) elMpHudRound.textContent = `Round ${data.round} / 5`;
      if (elMpHudRole) elMpHudRole.textContent = "You run";
      if (elMpHud) elMpHud.classList.remove("hidden");
      if (elMpBuildHint) elMpBuildHint.classList.add("hidden");
      syncTouchControlsVisibility();
      syncExitAndRotateUI();
      syncMpChatDock();
    });

    socket.on("mp:round3", (data) => {
      if (elMpBuildHint) elMpBuildHint.classList.add("hidden");
      hideMpLayerOverlays();
      showMpRound3Countdown(() => {
        const lvl = BUILTIN_LEVELS.find((l) => l.id === data.levelId);
        if (!lvl) {
          showToast("Final level not found.");
          return;
        }
        const idx = BUILTIN_LEVELS.indexOf(lvl);
        loadFlatIntoGrid(lvl.tilesFlat);
        mpSession.phase = "mpRound3";
        const rl = typeof data.roundLabel === "number" ? data.roundLabel : 5;
        if (elMpHudRound) elMpHudRound.textContent = `Round ${rl} / 5 · ${lvl.name}`;
        if (elMpHudRole) elMpHudRole.textContent = "Final";
        hideEndOverlay();
        startPlay(lvl.id, idx, null, {
          runSeed: (data.runSeed >>> 0) || 1,
          noPowerups: true,
          skipProfileMutation: true,
        });
        syncTouchControlsVisibility();
        syncExitAndRotateUI();
        syncMpChatDock();
      });
    });

    socket.on("mp:chat", (msg) => {
      if (!msg || !msg.text) return;
      const id = msg.id ? String(msg.id) : "";
      if (id && elMpChatMessages && elMpChatMessages.querySelector(`[data-msg-id="${id.replace(/"/g, "")}"]`)) return;
      appendMpChatLine(msg);
    });

    socket.on("mp:rematchStatus", (data) => {
      const need = (data && data.needed) || 2;
      const acc = (data && data.acceptedCount) || 0;
      if (elMpRematchBtn) {
        elMpRematchBtn.textContent = `Rematch (${acc}/${need})`;
      }
    });

    socket.on("mp:scores", (sc) => {
      syncMpHudFromServer(sc);
    });

    async function submitGlobalPointsAfterMatch(data) {
      try {
        const token = getAuthToken();
        if (!token || !data || !data.scores) return;
        if (isFileProtocolPage() && !getApiBase()) return;
        const you = typeof data.youIndex === "number" ? data.youIndex : 0;
        const pts = Math.min(1500, Math.max(0, Math.floor(Number(data.scores[you]) || 0)));
        if (pts <= 0) return;
        await fetch(apiUrl("/api/leaderboard/add-points"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ points: pts }),
        });
      } catch {
        /* ignore */
      }
    }

    socket.on("mp:matchEnd", (data) => {
      mpSession.phase = "mpMatchEnd";
      mode = "build";
      play = null;
      updateTimerPill(null);
      hideEndOverlay();
      hideMpLayerOverlays();
      syncMpChatDock();
      void submitGlobalPointsAfterMatch(data);
      if (elMpRematchBtn) {
        elMpRematchBtn.textContent = "Rematch (0/2)";
        elMpRematchBtn.classList.remove("mpRematchConfirmed");
      }
      mpSession.rematchSelfConfirmed = false;
      elRestartBtn.disabled = true;
      elBuildBtn.classList.add("primary");
      elPlayBtn.classList.remove("primary");
      if (elMpMatchEnd) elMpMatchEnd.classList.remove("hidden");
      const you = data.youIndex;
      const w = data.winnerIndex;
      let title = "Draw";
      if (w === you) title = "You win!";
      else if (w !== null && w !== undefined) title = "You lose";
      if (elMpMatchEndTitle) elMpMatchEndTitle.textContent = title;
      if (elMpMatchEndScores) {
        elMpMatchEndScores.innerHTML = `${escapeHtml(data.names[0])}: <b>${data.scores[0]}</b> · ${escapeHtml(
          data.names[1]
        )}: <b>${data.scores[1]}</b>`;
      }
    });

    socket.on("mp:forfeit", () => {
      showToast("Match ended — opponent left.", 3200);
      const s = mpSession.socket;
      resetMultiplayerClientUi();
      try {
        if (s) s.disconnect();
      } catch {
        /* ignore */
      }
      openStartModal();
    });

    socket.on("mp:rematchDone", (data) => {
      if (elMpMatchEnd) elMpMatchEnd.classList.add("hidden");
      if (!data || !data.restarted) {
        const s = mpSession.socket;
        resetMultiplayerClientUi();
        try {
          if (s) s.disconnect();
        } catch {
          /* ignore */
        }
        openStartModal();
      }
    });

    socket.on("disconnect", () => {
      if (mpSession.phase === "off") return;
      const phase = mpSession.phase;
      resetMultiplayerClientUi();
      if (phase !== "queue") {
        showToast("Multiplayer disconnected.", 2200);
        openStartModal();
      }
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initMultiplayerNetworking() {
    if (!elMultiplayerBtn) return;
    elMultiplayerBtn.addEventListener("click", () => {
      if (isMultiplayerBlockedLocalOnly()) {
        showToast("Create an account to play online multiplayer.", 3600);
        return;
      }
      if (!activePlayer) {
        showToast("Choose or create a player first.");
        return;
      }
      connectMultiplayerSocket();
    });
    if (elMobileMpChatFab) {
      elMobileMpChatFab.addEventListener("click", () => {
        if (elMpChatExpandBtn) elMpChatExpandBtn.click();
      });
    }
    function leaveMultiplayerQueue() {
      if (mpSession.socket && mpSession.phase === "queue") {
        mpSession.socket.emit("mp:leaveQueue");
        const s = mpSession.socket;
        resetMultiplayerClientUi();
        try {
          s.disconnect();
        } catch {
          /* ignore */
        }
      } else {
        resetMultiplayerClientUi();
      }
    }
    if (elMpQueueCloseBtn) {
      elMpQueueCloseBtn.addEventListener("click", () => leaveMultiplayerQueue());
    }
    if (elMpSubmitLevelBtn) {
      elMpSubmitLevelBtn.addEventListener("click", () => {
        if (!mpSession.socket || mpSession.phase !== "mpBuild") return;
        lastValidation = validateLevel();
        syncBuildHUD();
        if (!lastValidation.ok) {
          showToast(lastValidation.message || "Fix validation before Submit.");
          return;
        }
        const tilesFlat = flattenGrid(grid);
        if (tilesFlat.length !== COLS * ROWS) return;
        mpSession.socket.emit("mp:submitLevel", { tilesFlat });
        mpSession.phase = "mpSpectate";
        if (elMpSubmitLevelBtn) elMpSubmitLevelBtn.classList.add("hidden");
        if (elMpBuildHint) elMpBuildHint.classList.add("hidden");
        hideMpLayerOverlays();
        elBuildBtn.disabled = true;
        elPlayBtn.disabled = true;
        syncMpChatDock();
        showToast("Level sent — you’ll spectate their run.");
      });
    }
    function sendMpChat() {
      if (!mpSession.socket || !elMpChatInput) return;
      const t = elMpChatInput.value.trim();
      if (!t) return;
      mpSession.socket.emit("mp:chat", { text: t });
      elMpChatInput.value = "";
    }
    if (elMpChatSend) elMpChatSend.addEventListener("click", () => sendMpChat());
    if (elMpChatInput) {
      elMpChatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          sendMpChat();
        }
      });
    }
    if (elMpChatCollapseBtn) {
      elMpChatCollapseBtn.addEventListener("click", () => {
        mpChatUserCollapsed = true;
        mpChatPeekHover = false;
        syncMpChatPanel();
      });
    }
    if (elMpChatExpandBtn) {
      elMpChatExpandBtn.addEventListener("click", () => {
        mpChatUserCollapsed = false;
        mpChatPeekHover = false;
        syncMpChatPanel();
        if (elMpChatInput) elMpChatInput.focus();
      });
    }
    if (elMpChatPeekBar) {
      elMpChatPeekBar.addEventListener("mouseenter", () => {
        if (!mpChatUserCollapsed) return;
        if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return;
        mpChatPeekHover = true;
        syncMpChatPanel();
        if (elMpChatInput) requestAnimationFrame(() => elMpChatInput.focus());
      });
    }
    if (elMpChatDock) {
      elMpChatDock.addEventListener("mouseleave", () => {
        if (!mpChatUserCollapsed) return;
        if (elMpChatInput && document.activeElement === elMpChatInput) return;
        mpChatPeekHover = false;
        syncMpChatPanel();
      });
    }

    if (elMpRematchBtn) {
      elMpRematchBtn.addEventListener("click", () => {
        if (mpSession.socket) {
          mpSession.socket.emit("mp:rematch", { accept: true });
          mpSession.rematchSelfConfirmed = true;
          elMpRematchBtn.classList.add("mpRematchConfirmed");
        }
      });
    }
    function mpDeclineRematchAndMenu() {
      if (mpSession.socket) mpSession.socket.emit("mp:rematch", { accept: false });
      const s = mpSession.socket;
      resetMultiplayerClientUi();
      try {
        if (s) s.disconnect();
      } catch {
        /* ignore */
      }
      openStartModal();
    }
    if (elMpDeclineRematchBtn) {
      elMpDeclineRematchBtn.addEventListener("click", () => mpDeclineRematchAndMenu());
    }
    if (elMpMatchEndCloseBtn) {
      elMpMatchEndCloseBtn.addEventListener("click", () => mpDeclineRematchAndMenu());
    }
  }

  function openAuthModal(view = "login") {
    if (!elAuthModal) return;
    if (elAuthBackdrop) elAuthBackdrop.classList.remove("hidden");
    elAuthModal.classList.remove("hidden");
    if (elAuthFormLogin) elAuthFormLogin.classList.toggle("hidden", view !== "login");
    if (elAuthFormRegister) elAuthFormRegister.classList.toggle("hidden", view !== "register");
    if (elAuthModalTitle) elAuthModalTitle.textContent = view === "register" ? "Create account" : "Sign in";
    if (elAuthStatus) elAuthStatus.textContent = "";
    requestAnimationFrame(() => {
      const focusEl =
        view === "register"
          ? elAuthRegUser || elAuthRegPass
          : elAuthLoginUser || elAuthLoginPass;
      if (focusEl) focusEl.focus();
    });
  }

  function closeAuthModal() {
    if (elAuthModal) elAuthModal.classList.add("hidden");
    if (elAuthBackdrop) elAuthBackdrop.classList.add("hidden");
    if (authCloseOpensStart && !activePlayer) {
      authCloseOpensStart = false;
      openStartModal();
    } else {
      authCloseOpensStart = false;
    }
  }

  function formatAuthError(err) {
    const key = String(err || "").toUpperCase();
    const map = {
      USERNAME_TAKEN: "That username is already taken.",
      INVALID_INPUT: "Enter a valid username and password.",
      PASSWORD_TOO_SHORT: "Password must be at least 4 characters.",
      DATABASE_NOT_CONFIGURED: "Server database is not configured.",
      USER_NOT_FOUND: "No account found for that username.",
      WRONG_PASSWORD: "Incorrect password.",
      INVALID_CREDENTIALS: "Wrong username or password.",
      REGISTER_FAILED: "Could not register. If this persists, the database may be misconfigured.",
      INSERT_FAILED: "Could not save the account (database error).",
      DATABASE_POLICY: "Registration blocked by database security rules (check Supabase RLS on auth_users).",
      NETWORK: "Network error — check URL and connection.",
      BAD_RESPONSE: "Unexpected server response.",
      HTTP_502: "API unreachable (bad gateway). Check the server is running.",
      HTTP_503: "Service unavailable (database may be off on the server).",
    };
    return map[key] || (err ? String(err).replace(/_/g, " ") : "") || "Request failed";
  }

  async function fetchAuth(path, body) {
    const url = apiUrl(path);
    if (isFileProtocolPage() && url.startsWith("/")) {
      return null;
    }
    try {
      const r = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let j = /** @type {{ ok?: boolean, error?: string, token?: string, username?: string }} */ ({});
      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        return { ok: false, error: "BAD_RESPONSE" };
      }
      if (!r.ok) {
        j.ok = false;
        if (!j.error) {
          if (r.status === 401) j.error = "INVALID_CREDENTIALS";
          else if (r.status === 503) j.error = "DATABASE_NOT_CONFIGURED";
          else if (r.status === 409) j.error = "USERNAME_TAKEN";
          else if (r.status === 400) j.error = "INVALID_INPUT";
          else j.error = `HTTP_${r.status}`;
        }
      } else if (j.token != null && j.ok !== false) {
        j.ok = true;
      }
      return j;
    } catch (e) {
      console.error("[auth] fetch failed", path, e);
      return { ok: false, error: "NETWORK" };
    }
  }

  function initLoginGateUi() {
    const elGateUser = /** @type {HTMLInputElement | null} */ (document.getElementById("gateUser"));
    const elGatePass = /** @type {HTMLInputElement | null} */ (document.getElementById("gatePass"));
    const elGateRemember = /** @type {HTMLInputElement | null} */ (document.getElementById("gateRemember"));
    const elGateLoginBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("gateLoginBtn"));
    const elGateRegisterBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("gateRegisterBtn"));
    const elGateRegUser = /** @type {HTMLInputElement | null} */ (document.getElementById("gateRegUser"));
    const elGateRegPass = /** @type {HTMLInputElement | null} */ (document.getElementById("gateRegPass"));
    const elGatePassToggle = document.getElementById("gatePassToggle");
    const elGateForgotBtn = document.getElementById("gateForgotBtn");
    const elGatePlayLocalBtn = document.getElementById("gatePlayLocalBtn");
    const elGateShowRegisterBtn = document.getElementById("gateShowRegisterBtn");
    const elGateBackToLoginBtn = document.getElementById("gateBackToLoginBtn");
    const formGateLogin = document.getElementById("gateLoginForm");
    const formGateReg = document.getElementById("gateRegisterForm");

    const fileHint =
      "Open this game from your server (npm start → http://localhost:3000) or set MULTIPLAYER_SERVER_URL in multiplayer-config.js to your live API URL.";

    if (elGatePassToggle && elGatePass) {
      elGatePassToggle.addEventListener("click", () => {
        const t = elGatePass.type === "password" ? "text" : "password";
        elGatePass.type = t;
        elGatePassToggle.setAttribute("aria-label", t === "password" ? "Show password" : "Hide password");
      });
    }
    if (elGateForgotBtn) {
      elGateForgotBtn.addEventListener("click", () => {
        showToast("Password recovery is not available in-game — contact support or reset via your host.", 4200);
      });
    }
    if (elGatePlayLocalBtn) {
      elGatePlayLocalBtn.addEventListener("click", () => {
        try {
          localStorage.setItem(LOCAL_ONLY_KEY, "1");
        } catch {
          /* ignore */
        }
        setAuthToken(null, true);
        proceedAfterLoginGate();
        showToast("Playing locally — sign in anytime for online multiplayer.", 2800);
      });
    }
    if (elGateShowRegisterBtn && formGateLogin && formGateReg) {
      elGateShowRegisterBtn.addEventListener("click", () => {
        if (elGateStatus) elGateStatus.textContent = "";
        formGateLogin.classList.add("hidden");
        formGateReg.classList.remove("hidden");
      });
    }
    if (elGateBackToLoginBtn && formGateLogin && formGateReg) {
      elGateBackToLoginBtn.addEventListener("click", () => {
        if (elGateStatus) elGateStatus.textContent = "";
        formGateReg.classList.add("hidden");
        formGateLogin.classList.remove("hidden");
      });
    }

    async function gateDoLogin() {
      const rawU = String((elGateUser && elGateUser.value) || "").trim();
      const u = rawU.toLowerCase();
      const p = elGatePass ? String(elGatePass.value || "") : "";
      if (!u || !p) {
        if (elGateStatus) elGateStatus.textContent = "Enter user and password.";
        return;
      }
      if (elGateLoginBtn) {
        elGateLoginBtn.disabled = true;
        elGateLoginBtn.textContent = "Signing in…";
      }
      if (elGateStatus) elGateStatus.textContent = "";
      try {
        const j = await fetchAuth("/api/auth/login", { username: u, password: p });
        if (j == null) {
          if (elGateStatus) elGateStatus.textContent = fileHint;
          return;
        }
        if (j && j.ok && j.token) {
          try {
            localStorage.removeItem(LOCAL_ONLY_KEY);
          } catch {
            /* ignore */
          }
          setAuthToken(j.token, !!(elGateRemember && elGateRemember.checked));
          proceedAfterLoginGate();
          showToast("Signed in — you can use online multiplayer.", 2400);
        } else {
          if (elGateStatus) elGateStatus.textContent = formatAuthError(j && j.error);
        }
      } catch (e) {
        console.error("[auth] gate login", e);
        if (elGateStatus) elGateStatus.textContent = "Something went wrong — try again.";
      } finally {
        if (elGateLoginBtn) {
          elGateLoginBtn.disabled = false;
          elGateLoginBtn.textContent = "Login";
        }
      }
    }

    async function gateDoRegister() {
      const rawU = String((elGateRegUser && elGateRegUser.value) || "").trim();
      const u = rawU.toLowerCase();
      const p = elGateRegPass ? String(elGateRegPass.value || "") : "";
      if (!u || !p) {
        if (elGateStatus) elGateStatus.textContent = "Enter user and password.";
        return;
      }
      if (elGateRegisterBtn) {
        elGateRegisterBtn.disabled = true;
        elGateRegisterBtn.textContent = "Creating…";
      }
      if (elGateStatus) elGateStatus.textContent = "";
      try {
        const j = await fetchAuth("/api/auth/register", { username: u, password: p });
        if (j == null) {
          if (elGateStatus) elGateStatus.textContent = fileHint;
          return;
        }
        if (j && j.ok && j.token) {
          try {
            localStorage.removeItem(LOCAL_ONLY_KEY);
          } catch {
            /* ignore */
          }
          setAuthToken(j.token, true);
          proceedAfterLoginGate();
          showToast("Account created — you’re signed in.", 2400);
        } else {
          if (elGateStatus) elGateStatus.textContent = formatAuthError(j && j.error);
        }
      } catch (e) {
        console.error("[auth] gate register", e);
        if (elGateStatus) elGateStatus.textContent = "Something went wrong — try again.";
      } finally {
        if (elGateRegisterBtn) {
          elGateRegisterBtn.disabled = false;
          elGateRegisterBtn.textContent = "Create account";
        }
      }
    }

    if (formGateLogin) {
      formGateLogin.addEventListener("submit", (e) => {
        e.preventDefault();
        void gateDoLogin();
      });
    }
    if (formGateReg) {
      formGateReg.addEventListener("submit", (e) => {
        e.preventDefault();
        void gateDoRegister();
      });
    }
  }

  function initAuthUi() {
    if (elAuthAccountBtn) {
      elAuthAccountBtn.addEventListener("click", () => openAuthModal("login"));
    }
    if (elAuthModalCloseBtn) elAuthModalCloseBtn.addEventListener("click", () => closeAuthModal());
    if (elAuthBackdrop) elAuthBackdrop.addEventListener("click", () => closeAuthModal());
    if (elAuthShowRegisterBtn) elAuthShowRegisterBtn.addEventListener("click", () => openAuthModal("register"));
    if (elAuthShowLoginBtn) elAuthShowLoginBtn.addEventListener("click", () => openAuthModal("login"));

    async function doLogin() {
      const rawU = String((elAuthLoginUser && elAuthLoginUser.value) || "").trim();
      const u = rawU.toLowerCase();
      const p = elAuthLoginPass ? String(elAuthLoginPass.value || "") : "";
      if (!u || !p) {
        if (elAuthStatus) elAuthStatus.textContent = "Enter username and password.";
        return;
      }
      if (elAuthLoginBtn) {
        elAuthLoginBtn.disabled = true;
        elAuthLoginBtn.textContent = "Signing in…";
      }
      if (elAuthStatus) elAuthStatus.textContent = "";
      try {
        const j = await fetchAuth("/api/auth/login", { username: u, password: p });
        if (j == null) {
          if (elAuthStatus) elAuthStatus.textContent =
            "Open this game from your server (npm start → http://localhost:3000) or set MULTIPLAYER_SERVER_URL in multiplayer-config.js to your live API URL.";
          return;
        }
        if (j && j.ok && j.token) {
          try {
            localStorage.removeItem(LOCAL_ONLY_KEY);
          } catch {
            /* ignore */
          }
          setAuthToken(j.token, true);
          syncLocalOnlyMultiplayerUi();
          if (elAuthStatus) elAuthStatus.textContent = `Signed in as ${j.username || u}`;
          closeAuthModal();
          showToast("Signed in — global leaderboard will sync.", 2400);
        } else {
          if (elAuthStatus) elAuthStatus.textContent = formatAuthError(j && j.error);
        }
      } catch (e) {
        console.error("[auth] login", e);
        if (elAuthStatus) elAuthStatus.textContent = "Something went wrong — try again.";
      } finally {
        if (elAuthLoginBtn) {
          elAuthLoginBtn.disabled = false;
          elAuthLoginBtn.textContent = "Sign in";
        }
      }
    }

    async function doRegister() {
      const rawU = String((elAuthRegUser && elAuthRegUser.value) || "").trim();
      const u = rawU.toLowerCase();
      const p = elAuthRegPass ? String(elAuthRegPass.value || "") : "";
      if (!u || !p) {
        if (elAuthStatus) elAuthStatus.textContent = "Enter username and password.";
        return;
      }
      if (elAuthRegisterBtn) {
        elAuthRegisterBtn.disabled = true;
        elAuthRegisterBtn.textContent = "Creating…";
      }
      if (elAuthStatus) elAuthStatus.textContent = "";
      try {
        const j = await fetchAuth("/api/auth/register", { username: u, password: p });
        if (j == null) {
          if (elAuthStatus) elAuthStatus.textContent =
            "Open this game from your server (npm start → http://localhost:3000) or set MULTIPLAYER_SERVER_URL in multiplayer-config.js to your live API URL.";
          return;
        }
        if (j && j.ok && j.token) {
          try {
            localStorage.removeItem(LOCAL_ONLY_KEY);
          } catch {
            /* ignore */
          }
          setAuthToken(j.token, true);
          syncLocalOnlyMultiplayerUi();
          if (elAuthStatus) elAuthStatus.textContent = "Account created.";
          closeAuthModal();
          showToast("Registered — you’re signed in.", 2400);
        } else {
          if (elAuthStatus) elAuthStatus.textContent = formatAuthError(j && j.error);
        }
      } catch (e) {
        console.error("[auth] register", e);
        if (elAuthStatus) elAuthStatus.textContent = "Something went wrong — try again.";
      } finally {
        if (elAuthRegisterBtn) {
          elAuthRegisterBtn.disabled = false;
          elAuthRegisterBtn.textContent = "Register";
        }
      }
    }

    const formLogin = document.getElementById("authLoginForm");
    if (formLogin) {
      formLogin.addEventListener("submit", (e) => {
        e.preventDefault();
        void doLogin();
      });
    }

    const formReg = document.getElementById("authRegisterForm");
    if (formReg) {
      formReg.addEventListener("submit", (e) => {
        e.preventDefault();
        void doRegister();
      });
    }
  }

  initLoginGateUi();
  initAuthUi();

  // ---------- Game loop ----------
  let lastFrame = performance.now();
  function frame(now) {
    const dt = clamp(now - lastFrame, 4, 32);
    lastFrame = now;

    const docHidden = typeof document !== "undefined" && document.visibilityState === "hidden";

    updateToast(now);
    if (mode === "build") updateTimerPill(null);

    if (validateTimer) {
      validateTimer = 0;
      lastValidation = validateLevel();
      syncBuildHUD();
    }

    // Global hotkeys
    if (input.wasPressed(keyForAction("openSettings"))) {
      if (!elSettingsModal.classList.contains("hidden")) closeModal(elSettingsModal);
      else openModal(elSettingsModal);
    }
    if (input.wasPressed(keyForAction("openLevels"))) {
      if (!elLevelsModal.classList.contains("hidden")) closeModal(elLevelsModal);
      else {
        if (!activePlayer) openStartModal();
        openModal(elLevelsModal);
        refreshLevelsList();
      }
    }
    if (input.wasPressed(keyForAction("toggleBuild"))) setMode("build");
    if (input.wasPressed(keyForAction("togglePlay"))) {
      if (
        !mpSession.active ||
        (mpSession.phase !== "mpWaitBuild" &&
          mpSession.phase !== "mpSpectate" &&
          mpSession.phase !== "mpSpectatePlay" &&
          mpSession.phase !== "mpMatchEnd")
      ) {
        setMode("play");
      }
    }

    if (mode === "play" && !docHidden) updatePlay(dt, now);
    if (!docHidden) render(now);

    input.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Buttons + initial state ----------
  elRestartBtn.disabled = true;

  // Settings + theme
  applyTheme();
  buildKeybindUI();

  // Device modal first; then login gate (or play locally); then start / active player
  if (!deviceMode && elDeviceModal) {
    elDeviceModal.classList.remove("hidden");
  } else {
    document.documentElement.classList.toggle("device-touch-mode", deviceMode === "mobile");
    syncExitAndRotateUI();
    if (!hasPassedLoginGate()) {
      openLoginGateModal();
    } else if (save.activePlayerId && save.players[save.activePlayerId]) {
      setActivePlayer(save.activePlayerId);
    } else {
      openStartModal();
    }
  }

  // Build palette + validate initial empty grid
  buildPalette();
  scheduleValidate();
  syncProfileUI();
  initMultiplayerNetworking();
  syncLocalOnlyMultiplayerUi();

  // (Modal button listeners are wired above; avoid duplicates here.)

  // ---------- Utility ----------
  function makeGrid(w, h, fill) {
    const g = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) row.push(fill);
      g.push(row);
    }
    return g;
  }

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distanceSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function roundRect(ctx2, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx2.beginPath();
    ctx2.moveTo(x + rr, y);
    ctx2.arcTo(x + w, y, x + w, y + h, rr);
    ctx2.arcTo(x + w, y + h, x, y + h, rr);
    ctx2.arcTo(x, y + h, x, y, rr);
    ctx2.arcTo(x, y, x + w, y, rr);
    ctx2.closePath();
  }

  function uid() {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  function seedFromGrid(g) {
    let s = 2166136261 >>> 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = g[y][x];
        s ^= hash2(x, y) ^ hashStr(t);
        s = Math.imul(s, 16777619) >>> 0;
      }
    }
    return s >>> 0;
  }

  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return h >>> 0;
  }

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
})();

