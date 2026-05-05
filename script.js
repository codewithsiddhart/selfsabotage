(() => {
  "use strict";

  // =========================================================
  // Self-Sabotage Builder — NeuroGlitch
  // © 2026 NeuroGlitch. All Rights Reserved.
  // NeuroGlitch is an independent game development and software initiative focused on
  // creating innovative, system-driven interactive experiences. This project, including
  // the game "Self-Sabotage Builder", its systems, mechanics, visuals, logic, and design,
  // is the intellectual property of NeuroGlitch.
  // Founders and Creators: Siddharth (Discord: perfect_humann), Harshit (12 year old so we cant really provide furthur details).
  // All rights reserved. Unauthorized copying, redistribution, or reproduction is strictly prohibited.
  // =========================================================
  //
  // Key design goals:
  // - Build mode hides sabotage; Play mode activates sabotage per run (seeded, consistent).
  // - Clean input (WASD + arrows), no missed presses, no "sticky" keys.
  // - Local player profiles with levels, stats, difficulty/points, and local leaderboard.
  // - No external dependencies and no audio files: lightweight procedural audio via WebAudio.

  const {
    MAX_PARTICLES, TILE, LEGACY_COLS, LEGACY_ROWS, COLS, ROWS,
    CANVAS_NATIVE_W, CANVAS_NATIVE_H, CANVAS_ASPECT,
    MAX_LEVEL_TEXTS, MAX_LEVEL_TEXT_LEN,
    JUMP_BUFFER_MS, PAD_LAUNCH_MULT, JUMP_FROM_PAD_MULT, COYOTE_MS,
    AIR_RELEASE_FRIC_MUL, GROUND_TURN_ACCEL_MUL, CAM_FOLLOW_LAMBDA,
    MUD_MOVE_MUL, BG_PARALLAX_LINK_X, BG_PARALLAX_LINK_Y, BG_PARALLAX_SMOOTH,
    BUILD_LIMITS, POINTS, PHYS,
    GRAVITY, JUMP_VELOCITY, MOVE_SPEED,
    Tile, KNOWN_TILE_VALUES, TileInfo, paletteOrder, TilePaletteIcon,
    TILE_TEXTURE_SRC, MUSIC_LIBRARY,
    DRAFT_GRID_KEY, TUTORIAL_PROMPT_KEY, SABOTAGE_META_KEY,
    SAVE_KEY, DEVICE_KEY, SABOTAGE_LOG_MAX, UNDO_MAX, VALIDATE_DEBOUNCE_MS,
    VIBE_LINES, VIBE_WIN_LINES, VIBE_LOSE_LINES,
  } = window.GameConstants;

  const {
    clamp, lerp, distanceSq, uid, makeGrid, inBounds, roundRect,
    hash2, hashStr, seedFromGrid, mulberry32,
  } = window.GameUtils;

  /** Consumed when a play run starts (from start modal checkboxes). */
  let pendingChallengeOpts = { noDoubleJump: false, maxDeaths: 0 };
  let sabotageMeta = loadSabotageMeta();
  // ADD 3: Sabotage event log — stores last 4 events for HUD display.
  /** @type {Array<{id:string, category:string, ts:number}>} */
  const sabotageEventLog = [];

  window.addEventListener("sabotageTriggered", (e) => {
    const rule = e.detail;
    if (!rule) return;
    sabotageEventLog.push({ id: String(rule.id || "sabotage"), category: String(rule.category || ""), ts: performance.now() });
    if (sabotageEventLog.length > SABOTAGE_LOG_MAX) sabotageEventLog.shift();
  });
  let vibeLineIndex = 0;
  let vibeNextAt = 0;

  function loadSabotageMeta() {
    try {
      const raw = localStorage.getItem(SABOTAGE_META_KEY);
      if (!raw) return { totalRuns: 0, recentOutcomes: [], bestRunMs: 0, longestSurvivalMs: 0, almostWins: 0 };
      const p = JSON.parse(raw);
      return {
        totalRuns: Math.max(0, p.totalRuns | 0),
        recentOutcomes: Array.isArray(p.recentOutcomes) ? p.recentOutcomes.slice(-8) : [],
        bestRunMs: Math.max(0, p.bestRunMs | 0),
        longestSurvivalMs: Math.max(0, p.longestSurvivalMs | 0),
        almostWins: Math.max(0, p.almostWins | 0),
      };
    } catch {
      return { totalRuns: 0, recentOutcomes: [], bestRunMs: 0, longestSurvivalMs: 0, almostWins: 0 };
    }
  }

  function saveSabotageMeta() {
    try {
      localStorage.setItem(SABOTAGE_META_KEY, JSON.stringify(sabotageMeta));
    } catch {
      /* ignore localStorage failures */
    }
  }

  // ---------- DOM ----------
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // --- Dynamic canvas sizing ---
  // The canvas bitmap tracks its CSS display width, capped at the native 960×576 art resolution.
  // This makes it pixel-accurate on all screen sizes without changing any game logic (which
  // already reads canvas.width / canvas.height everywhere).

  function resizeCanvas() {
    const stageWrap = canvas.parentElement;
    if (!stageWrap) return;
    // Available width = stage container minus its padding (10px each side)
    const available = stageWrap.clientWidth - 20;
    const newW = Math.min(available > 0 ? available : CANVAS_NATIVE_W, CANVAS_NATIVE_W);
    const newH = Math.round(newW / CANVAS_ASPECT);
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
      // Invalidate cached gradients — they're keyed by canvas dimensions
      try { _gradCache.clear(); } catch (e) { /* not yet initialized */ }
    }
  }

  resizeCanvas();

  // ResizeObserver keeps it live as sidebars collapse / window resizes
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => resizeCanvas());
    if (canvas.parentElement) ro.observe(canvas.parentElement);
  } else {
    window.addEventListener("resize", resizeCanvas);
  }

  /** Immersive backdrop: `assets/world-backdrop.png` (primary), then `assets/world-backdrop.jpg`; procedural fallback if both fail. */
  const bgImage = new Image();
  let bgImageReady = false;
  let bgImageTriedJpgFallback = false;
  bgImage.decoding = "async";
  bgImage.onload = () => {
    bgImageReady = bgImage.naturalWidth > 0;
  };
  bgImage.onerror = () => {
    if (!bgImageTriedJpgFallback) {
      bgImageTriedJpgFallback = true;
      bgImage.src = "assets/world-backdrop.jpg";
    } else {
      bgImageReady = false;
    }
  };
  bgImage.src = "assets/world-backdrop.png";

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
  const elOpenAdminBtn = /** @type {HTMLButtonElement | null} */ ($("openAdminBtn"));
  const elOpenModBtn = /** @type {HTMLButtonElement | null} */ ($("openModBtn"));
  const elOpenReportModalBtn = /** @type {HTMLButtonElement | null} */ ($("openReportModalBtn"));
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
  const elRefreshGlobalLevelsBtn = /** @type {HTMLButtonElement | null} */ ($("refreshGlobalLevelsBtn"));
  const elGlobalLevelsList = $("globalLevelsList");
  const elExportLevelBtn = /** @type {HTMLButtonElement | null} */ ($("exportLevelBtn"));
  const elImportLevelBtn = /** @type {HTMLButtonElement | null} */ ($("importLevelBtn"));
  const elImportLevelInput = /** @type {HTMLInputElement | null} */ ($("importLevelInput"));
  const elFeaturedLevelsHost = $("featuredLevelsHost");
  const elTutorialOfferCard = $("tutorialOfferCard");
  const elTutorialStartBtn = /** @type {HTMLButtonElement | null} */ ($("tutorialStartBtn"));
  const elTutorialSkipBtn = /** @type {HTMLButtonElement | null} */ ($("tutorialSkipBtn"));
  const elChallengeNoDj = /** @type {HTMLInputElement | null} */ ($("challengeNoDoubleJump"));
  const elChallengeMaxDeaths = /** @type {HTMLSelectElement | null} */ ($("challengeMaxDeaths"));
  const elRestoreDraftBtn = /** @type {HTMLButtonElement | null} */ ($("restoreDraftBtn"));

  const elLeaderboardModal = $("leaderboardModal");
  const elCloseLeaderboardModalBtn = /** @type {HTMLButtonElement} */ ($("closeLeaderboardModalBtn"));
  const elLeaderboardSearchInput = /** @type {HTMLInputElement} */ ($("leaderboardSearchInput"));
  const elLeaderboardSearchBtn = /** @type {HTMLButtonElement} */ ($("leaderboardSearchBtn"));
  const elLeaderboardList = $("leaderboardList");

  const elSettingsModal = $("settingsModal");
  const elCloseSettingsModalBtn = /** @type {HTMLButtonElement} */ ($("closeSettingsModalBtn"));
  const elReportModal = $("reportModal");
  const elCloseReportModalBtn = /** @type {HTMLButtonElement | null} */ ($("closeReportModalBtn"));
  const elAdminModal = $("adminModal");
  const elCloseAdminModalBtn = /** @type {HTMLButtonElement | null} */ ($("closeAdminModalBtn"));
  const elAdminReportsList = $("adminReportsList");
  const elAdminIssueReportsList = $("adminIssueReportsList");
  const elAdminLevelsList = $("adminLevelsList");
  const elAdminLeaderboardUserIdInput = /** @type {HTMLInputElement | null} */ ($("adminLeaderboardUserIdInput"));
  const elAdminRemoveLeaderboardBtn = /** @type {HTMLButtonElement | null} */ ($("adminRemoveLeaderboardBtn"));
  const elAdminModerationUserIdInput = /** @type {HTMLInputElement | null} */ ($("adminModerationUserIdInput"));
  const elAdminModerationReasonInput = /** @type {HTMLInputElement | null} */ ($("adminModerationReasonInput"));
  const elAdminBanUserBtn = /** @type {HTMLButtonElement | null} */ ($("adminBanUserBtn"));
  const elAdminRestrictUserBtn = /** @type {HTMLButtonElement | null} */ ($("adminRestrictUserBtn"));
  const elAdminUnbanUserBtn = /** @type {HTMLButtonElement | null} */ ($("adminUnbanUserBtn"));
  const elAdminModUserIdInput = /** @type {HTMLInputElement | null} */ ($("adminModUserIdInput"));
  const elAdminGrantModBtn = /** @type {HTMLButtonElement | null} */ ($("adminGrantModBtn"));
  const elAdminRevokeModBtn = /** @type {HTMLButtonElement | null} */ ($("adminRevokeModBtn"));
  const elAdminAnnouncementEditor = /** @type {HTMLTextAreaElement | null} */ ($("adminAnnouncementEditor"));
  const elAdminAnnouncementSaveBtn = /** @type {HTMLButtonElement | null} */ ($("adminAnnouncementSaveBtn"));
  const elAdminAnnouncementReloadBtn = /** @type {HTMLButtonElement | null} */ ($("adminAnnouncementReloadBtn"));
  const elAnnouncementModal = $("announcementModal");
  const elCloseAnnouncementModalBtn = /** @type {HTMLButtonElement | null} */ ($("closeAnnouncementModalBtn"));
  const elAnnouncementModalContent = $("announcementModalContent");
  const elAnnouncementModalUpdated = $("announcementModalUpdated");
  const elModModal = $("modModal");
  const elCloseModModalBtn = /** @type {HTMLButtonElement | null} */ ($("closeModModalBtn"));
  const elModModerationUserIdInput = /** @type {HTMLInputElement | null} */ ($("modModerationUserIdInput"));
  const elModModerationReasonInput = /** @type {HTMLInputElement | null} */ ($("modModerationReasonInput"));
  const elModBanUserBtn = /** @type {HTMLButtonElement | null} */ ($("modBanUserBtn"));
  const elModRestrictUserBtn = /** @type {HTMLButtonElement | null} */ ($("modRestrictUserBtn"));
  const elModUnbanUserBtn = /** @type {HTMLButtonElement | null} */ ($("modUnbanUserBtn"));
  const elModAnnouncementEditor = /** @type {HTMLTextAreaElement | null} */ ($("modAnnouncementEditor"));
  const elModAnnouncementSaveBtn = /** @type {HTMLButtonElement | null} */ ($("modAnnouncementSaveBtn"));
  const elModAnnouncementPreviewBtn = /** @type {HTMLButtonElement | null} */ ($("modAnnouncementPreviewBtn"));
  const elAdminPublishLevelModal = $("adminPublishLevelModal");
  const elCloseAdminPublishModalBtn = /** @type {HTMLButtonElement | null} */ ($("closeAdminPublishModalBtn"));
  const elSettingsSecretSparkleBtn = /** @type {HTMLButtonElement | null} */ ($("settingsSecretSparkleBtn"));
  const elSoundToggle = /** @type {HTMLInputElement} */ ($("soundToggle"));
  const elBackgroundSelect = /** @type {HTMLSelectElement} */ ($("backgroundSelect"));
  const elSabotageSlider = /** @type {HTMLInputElement} */ ($("sabotageSlider"));
  const elSabotageValue = $("sabotageValue");
  const elKeybindList = $("keybindList");

  const elCoinsValue = $("coinsValue");
  const elRightCoinsValue = $("rightCoinsValue");
  const elIntensityLockPill = $("intensityLockPill");
  const elBuyIntensityUnlockBtn = /** @type {HTMLButtonElement | null} */ ($("buyIntensityUnlockBtn"));
  const elBuyIntensityNote = $("buyIntensityNote");
  const elRightIntensityLockPill = $("rightIntensityLockPill");
  const elRightBuyIntensityNote = $("rightBuyIntensityNote");
  const elRightBuyIntensityUnlockBtn = /** @type {HTMLButtonElement | null} */ ($("rightBuyIntensityUnlockBtn"));
  const elCosmeticsShopList = $("cosmeticsShopList");
  const elRightTabCoinsBtn = /** @type {HTMLButtonElement | null} */ ($("rightTabCoinsBtn"));
  const elRightTabCustomizationBtn = /** @type {HTMLButtonElement | null} */ ($("rightTabCustomizationBtn"));
  const elRightTabCoins = $("rightTabCoins");
  const elRightTabCustomization = $("rightTabCustomization");
  const elOpenCustomizationWindowBtn = /** @type {HTMLButtonElement | null} */ ($("openCustomizationWindowBtn"));
  const elCustomizationModal = $("customizationModal");
  const elCloseCustomizationModalBtn = /** @type {HTMLButtonElement | null} */ ($("closeCustomizationModalBtn"));
  const elAvatarShopList = $("avatarShopList");
  const elAvatarRandomEquipBtn = /** @type {HTMLButtonElement | null} */ ($("avatarRandomEquipBtn"));
  const elCustomizerPreviewImage = /** @type {HTMLImageElement | null} */ ($("customizerPreviewImage"));

  const elOpenMultiplayerBtn = /** @type {HTMLButtonElement | null} */ ($("openMultiplayerBtn"));
  const elMultiplayerModal = $("multiplayerModal");
  const elCloseMultiplayerModalBtn = /** @type {HTMLButtonElement | null} */ ($("closeMultiplayerModalBtn"));
  const elMpStatusText = $("mpStatusText");
  const elMpHostBtn = /** @type {HTMLButtonElement | null} */ ($("mpHostBtn"));
  const elMpRandomBtn = /** @type {HTMLButtonElement | null} */ ($("mpRandomBtn"));
  const elMpStartMatchBtn = /** @type {HTMLButtonElement | null} */ ($("mpStartMatchBtn"));
  const elMpLeaveBtn = /** @type {HTMLButtonElement | null} */ ($("mpLeaveBtn"));
  const elMpJoinInput = /** @type {HTMLInputElement | null} */ ($("mpJoinInput"));
  const elMpJoinBtn = /** @type {HTMLButtonElement | null} */ ($("mpJoinBtn"));
  const elMpRoomCodeDisplay = $("mpRoomCodeDisplay");
  const elMpCopyRoomBtn = /** @type {HTMLButtonElement | null} */ ($("mpCopyRoomBtn"));
  const elMpShareLevelBtn = /** @type {HTMLButtonElement | null} */ ($("mpShareLevelBtn"));
  const elMpChatLog = $("mpChatLog");
  const elMpChatInput = /** @type {HTMLInputElement | null} */ ($("mpChatInput"));
  const elMpChatSendBtn = /** @type {HTMLButtonElement | null} */ ($("mpChatSendBtn"));
  const elLocalMpPlayerAInput = /** @type {HTMLInputElement | null} */ ($("localMpPlayerAInput"));
  const elLocalMpPlayerBInput = /** @type {HTMLInputElement | null} */ ($("localMpPlayerBInput"));
  const elLocalMpStartBtn = /** @type {HTMLButtonElement | null} */ ($("localMpStartBtn"));
  const elLocalMpStopBtn = /** @type {HTMLButtonElement | null} */ ($("localMpStopBtn"));
  const elLocalMpStatusPill = $("localMpStatusPill");
  const elMpHud = $("mpHud");
  const elMpHudRound = $("mpHudRound");
  const elMpHudRole = $("mpHudRole");
  const elMpHudScore = $("mpHudScore");

  const elLevelListByTier = $("levelListByTier");

  const elDailyChallengeBtn = /** @type {HTMLButtonElement | null} */ ($("dailyChallengeBtn"));
  const elDailyChallengeStatus = $("dailyChallengeStatus");

  const elEndOverlay = $("endOverlay");
  const elEndOverlayMessage = $("endOverlayMessage");
  const elEndOverlayStats = $("endOverlayStats");
  const elEndRetryBtn = /** @type {HTMLButtonElement} */ ($("endRetryBtn"));
  const elEndNextLevelBtn = /** @type {HTMLButtonElement} */ ($("endNextLevelBtn"));
  const elEndBuildBtn = /** @type {HTMLButtonElement} */ ($("endBuildBtn"));

  const elDeviceModal = $("deviceModal");
  const elDeviceDesktopBtn = /** @type {HTMLButtonElement} */ ($("deviceDesktopBtn"));
  const elDeviceMobileBtn = /** @type {HTMLButtonElement} */ ($("deviceMobileBtn"));
  const elTouchControls = $("touchControls");
  const elTouchLeft = /** @type {HTMLButtonElement} */ ($("touchLeft"));
  const elTouchRight = /** @type {HTMLButtonElement} */ ($("touchRight"));
  const elTouchJump = /** @type {HTMLButtonElement} */ ($("touchJump"));
  const elThemeSelect = /** @type {HTMLSelectElement} */ ($("themeSelect"));
  const elTogglePuzzleLinksBtn = /** @type {HTMLButtonElement | null} */ ($("togglePuzzleLinksBtn"));
  const elVolumeSlider = /** @type {HTMLInputElement} */ ($("volumeSlider"));
  const elVolumeValue = $("volumeValue");
  const elDebugOverlayToggle = /** @type {HTMLInputElement | null} */ ($("debugOverlayToggle"));
  const elIssueTypeSelect = /** @type {HTMLSelectElement | null} */ ($("issueTypeSelect"));
  const elIssueTargetUserInput = /** @type {HTMLInputElement | null} */ ($("issueTargetUserInput"));
  const elIssueDetailsInput = /** @type {HTMLTextAreaElement | null} */ ($("issueDetailsInput"));
  const elSubmitIssueReportBtn = /** @type {HTMLButtonElement | null} */ ($("submitIssueReportBtn"));
  const elQuickIssueTypeSelect = /** @type {HTMLSelectElement | null} */ ($("quickIssueTypeSelect"));
  const elQuickIssueTargetUserInput = /** @type {HTMLInputElement | null} */ ($("quickIssueTargetUserInput"));
  const elQuickIssueDetailsInput = /** @type {HTMLTextAreaElement | null} */ ($("quickIssueDetailsInput"));
  const elQuickSubmitIssueReportBtn = /** @type {HTMLButtonElement | null} */ ($("quickSubmitIssueReportBtn"));
  const elLbTestSupabaseBtn = /** @type {HTMLButtonElement | null} */ ($("lbTestSupabaseBtn"));
  const elAmbientNoiseSelect = /** @type {HTMLSelectElement | null} */ ($("ambientNoiseSelect"));
  const elMusicTrackSelect = /** @type {HTMLSelectElement | null} */ ($("musicTrackSelect"));
  const elCopyRegionBtn = /** @type {HTMLButtonElement | null} */ ($("copyRegionBtn"));
  const elPasteRegionBtn = /** @type {HTMLButtonElement | null} */ ($("pasteRegionBtn"));
  const elAddTextBtn = /** @type {HTMLButtonElement | null} */ ($("addTextBtn"));
  const elExitToMenuBtn = /** @type {HTMLButtonElement} */ ($("exitToMenuBtn"));
  const elTimerPill = $("timerPill");
  const elPbPacePill = $("pbPacePill");

  const elMobileExitBuildBtn = /** @type {HTMLButtonElement | null} */ ($("mobileExitBuildBtn"));
  const elStartModalLevelPickCard = $("startModalLevelPickCard");
  const elAuthAccountBtn = /** @type {HTMLButtonElement | null} */ ($("authAccountBtn"));
  const elAuthRegisterTopBtn = /** @type {HTMLButtonElement | null} */ ($("authRegisterTopBtn"));
  const elAuthLogoutTopBtn = /** @type {HTMLButtonElement | null} */ ($("authLogoutTopBtn"));
  const elAuthModalTitle = $("authModalTitle");
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
  const elAuthTabLogin = /** @type {HTMLButtonElement | null} */ ($("authTabLogin"));
  const elAuthTabRegister = /** @type {HTMLButtonElement | null} */ ($("authTabRegister"));
  const elAuthStatus = $("authStatus");
  const elGlobalLeaderboardList = $("globalLeaderboardList");
  const elGlobalLbHint = $("globalLbHint");
  const elGlobalLbSearchInput = /** @type {HTMLInputElement | null} */ ($("globalLbSearchInput"));
  const elGlobalLbSearchBtn = /** @type {HTMLButtonElement | null} */ ($("globalLbSearchBtn"));
  const elGlobalLbSearchClearBtn = /** @type {HTMLButtonElement | null} */ ($("globalLbSearchClearBtn"));
  const elGlobalLbSearchStatus = $("globalLbSearchStatus");
  const elGlobalLbSearchResults = $("globalLbSearchResults");

  /** @type {any} */
  let supabaseClientSingleton = null;
  /**
   * Global leaderboard row mirrored from DB on session sync (read-only on load).
   * @type {{ score: number, level: number, xp: number, unique_levels_beaten: number, easy_levels_beaten: number, medium_levels_beaten: number, hard_levels_beaten: number }}
   */
  let globalLeaderboardHydration = {
    score: 0,
    level: 1,
    xp: 0,
    unique_levels_beaten: 0,
    easy_levels_beaten: 0,
    medium_levels_beaten: 0,
    hard_levels_beaten: 0,
  };

  function resetGlobalLeaderboardHydration() {
    globalLeaderboardHydration = {
      score: 0,
      level: 1,
      xp: 0,
      unique_levels_beaten: 0,
      easy_levels_beaten: 0,
      medium_levels_beaten: 0,
      hard_levels_beaten: 0,
    };
  }

  // ---------- Coins + Character Customization ----------
  let userCoins = 0;
  let userIntensityUnlocked = false;
  /** Set from `profiles.is_admin` when signed in; combined with hardcoded admin emails in syncAdminUiForCurrentUser. */
  let profileIsAdminFromDb = false;
  let profileIsModFromDb = false;
  let userEquippedCosmeticId = /** @type {string|null} */ (null);
  /** @type {Set<string>} */
  let userOwnedCosmetics = new Set();
  /** After first full shop prime (modal open); avoids decoding all avatars at cold start. */
  let avatarShopAssetsPrimed = false;
  /** @type {Map<string, string>} */
  const avatarProcessedDataUrl = new Map();
  /** @type {Map<string, HTMLImageElement>} */
  const avatarRenderImageCache = new Map();
  let rightSidebarTab = "coins";

  /** Simple placeholder preview when no shop skin is equipped (matches in-game default ghost vibe). */
  const DEFAULT_GHOST_PREVIEW_DATA_URL =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="120" viewBox="0 0 96 120"><ellipse cx="48" cy="44" rx="32" ry="34" fill="#eef4ff" stroke="#7aa7ff" stroke-width="2.5"/><ellipse cx="38" cy="42" rx="4" ry="5" fill="#141824"/><ellipse cx="58" cy="42" rx="4" ry="5" fill="#141824"/></svg>'
    );

  /** Vector shop skins (no baked text; crisp at any scale). IDs unchanged for Supabase cosmetics. */
  const AVATARS = /** @type {{ id:string, name:string, title:string, styleTag:string, trait:string, cost:number, src?:string, svg?:string, crop?: {x:number,y:number,w:number,h:number}}[]} */ ([
    {
      id: "ghost_1",
      name: "Aurora",
      title: "Sky Warden",
      styleTag: "Royal cloak",
      trait: "Calm glow and noble crest",
      cost: 300,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="64" height="80"><defs><linearGradient id="a1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fbff"/><stop offset="1" stop-color="#93c5fd"/></linearGradient></defs><ellipse cx="32" cy="34" rx="22" ry="26" fill="url(#a1)" stroke="#60a5fa" stroke-width="2"/><path d="M17 40 Q32 50 47 40" stroke="#dbeafe" stroke-width="2" fill="none"/><path d="M21 19 L32 12 L43 19 L40 24 L24 24 Z" fill="#bfdbfe" stroke="#60a5fa" stroke-width="1.5"/><ellipse cx="24" cy="32" rx="3.5" ry="4.5" fill="#0f172a"/><ellipse cx="40" cy="32" rx="3.5" ry="4.5" fill="#0f172a"/><path d="M32 44 Q22 52 14 62 Q32 54 32 48 Q32 54 50 62 Q42 52 32 44" fill="#bfdbfe" opacity="0.9"/><ellipse cx="32" cy="68" rx="10" ry="6" fill="#93c5fd" opacity="0.35"/></svg>`,
    },
    {
      id: "ghost_2",
      name: "Ember",
      title: "Flame Nomad",
      styleTag: "Ember scarf",
      trait: "Warm ember trail and fire charm",
      cost: 300,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="64" height="80"><defs><radialGradient id="e2" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#fef3c7"/><stop offset="1" stop-color="#fb923c"/></radialGradient></defs><ellipse cx="32" cy="34" rx="22" ry="26" fill="url(#e2)" stroke="#f59e0b" stroke-width="2"/><path d="M18 42 Q29 37 46 43" stroke="#f97316" stroke-width="3" fill="none"/><path d="M16 43 Q20 40 21 36 Q23 40 27 43 Z" fill="#fb923c"/><ellipse cx="24" cy="32" rx="3.5" ry="4.5" fill="#431407"/><ellipse cx="40" cy="32" rx="3.5" ry="4.5" fill="#431407"/><path d="M32 44 Q22 52 14 62 Q32 54 32 48 Q32 54 50 62 Q42 52 32 44" fill="#fed7aa" opacity="0.95"/><ellipse cx="32" cy="68" rx="10" ry="6" fill="#fdba74" opacity="0.4"/></svg>`,
    },
    {
      id: "ghost_3",
      name: "Mint",
      title: "Forest Medic",
      styleTag: "Leaf robe",
      trait: "Nature pulse and vine sash",
      cost: 300,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="64" height="80"><ellipse cx="32" cy="34" rx="22" ry="26" fill="#d1fae5" stroke="#34d399" stroke-width="2"/><path d="M20 20 Q28 12 36 20 Q33 24 32 28 Q28 24 20 20" fill="#6ee7b7"/><path d="M20 46 Q30 42 44 46" stroke="#10b981" stroke-width="2.6" fill="none"/><ellipse cx="24" cy="32" rx="3.5" ry="4.5" fill="#064e3b"/><ellipse cx="40" cy="32" rx="3.5" ry="4.5" fill="#064e3b"/><path d="M32 44 Q22 52 14 62 Q32 54 32 48 Q32 54 50 62 Q42 52 32 44" fill="#a7f3d0" opacity="0.95"/><ellipse cx="32" cy="68" rx="10" ry="6" fill="#6ee7b7" opacity="0.35"/></svg>`,
    },
    {
      id: "ghost_4",
      name: "Lilac",
      title: "Arcane Scholar",
      styleTag: "Rune mantle",
      trait: "Mystic aura and glyph band",
      cost: 300,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="64" height="80"><defs><linearGradient id="l4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ede9fe"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient></defs><ellipse cx="32" cy="34" rx="22" ry="26" fill="url(#l4)" stroke="#a78bfa" stroke-width="2"/><circle cx="32" cy="20" r="6" fill="none" stroke="#8b5cf6" stroke-width="1.8"/><path d="M22 45 L42 45" stroke="#8b5cf6" stroke-width="2.4"/><ellipse cx="24" cy="32" rx="3.5" ry="4.5" fill="#1e1b4b"/><ellipse cx="40" cy="32" rx="3.5" ry="4.5" fill="#1e1b4b"/><path d="M32 44 Q22 52 14 62 Q32 54 32 48 Q32 54 50 62 Q42 52 32 44" fill="#ddd6fe" opacity="0.95"/><ellipse cx="32" cy="68" rx="10" ry="6" fill="#c4b5fd" opacity="0.35"/></svg>`,
    },
    {
      id: "ghost_5",
      name: "Rose",
      title: "Velvet Duelist",
      styleTag: "Rose cape",
      trait: "Elegant shimmer and duel emblem",
      cost: 300,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="64" height="80"><ellipse cx="32" cy="34" rx="22" ry="26" fill="#ffe4e6" stroke="#fb7185" stroke-width="2"/><path d="M23 24 Q32 17 41 24" stroke="#f43f5e" stroke-width="2.2" fill="none"/><path d="M20 44 Q32 40 44 44" stroke="#fb7185" stroke-width="2.6" fill="none"/><ellipse cx="24" cy="32" rx="3.5" ry="4.5" fill="#881337"/><ellipse cx="40" cy="32" rx="3.5" ry="4.5" fill="#881337"/><path d="M32 44 Q22 52 14 62 Q32 54 32 48 Q32 54 50 62 Q42 52 32 44" fill="#fecdd3" opacity="0.95"/><ellipse cx="32" cy="68" rx="10" ry="6" fill="#fda4af" opacity="0.4"/></svg>`,
    },
  ]);

  // ADD 7: Tile skin catalogue — unlockable via coin shop.
  // Each skin defines a CSS color override applied to that tile type in the build/play renderer.
  const TILE_SKINS = /** @type {{ id:string, name:string, tileType:string, cost:number, primaryColor:string, accentColor:string }[]} */ ([
    { id: "skin_ice_platform",  name: "Ice Platform",   tileType: "platform",  cost: 80,  primaryColor: "#a8d8ea", accentColor: "#e8f4f8" },
    { id: "skin_neon_spikes",   name: "Neon Spikes",    tileType: "spikes",   cost: 60,  primaryColor: "#ff0090", accentColor: "#ff69b4" },
    { id: "skin_obsidian_hex",  name: "Obsidian Hex",   tileType: "hex",      cost: 100, primaryColor: "#1a1a2e", accentColor: "#4a0080" },
    { id: "skin_gold_jumppad",  name: "Golden Jumppad", tileType: "jumppad",  cost: 75,  primaryColor: "#ffd700", accentColor: "#ffaa00" },
    { id: "skin_lava_platform", name: "Lava Stone",     tileType: "platform", cost: 90,  primaryColor: "#8b0000", accentColor: "#ff4500" },
  ]);

  /** @param {string} skinId */
  function isTileSkinOwned(skinId) {
    if (!activePlayer) return false;
    return Array.isArray(activePlayer.ownedTileSkins) && activePlayer.ownedTileSkins.includes(skinId);
  }

  /** @param {string} skinId */
  function buyTileSkin(skinId) {
    const skin = TILE_SKINS.find((s) => s.id === skinId);
    if (!skin || !activePlayer) return false;
    if (isTileSkinOwned(skinId)) { showToast("Already owned."); return false; }
    if ((activePlayer.coins | 0) < skin.cost) { showToast(`Need ${skin.cost} coins.`); return false; }
    activePlayer.coins -= skin.cost;
    if (!Array.isArray(activePlayer.ownedTileSkins)) activePlayer.ownedTileSkins = [];
    activePlayer.ownedTileSkins.push(skinId);
    if (!activePlayer.equippedTileSkins) activePlayer.equippedTileSkins = {};
    activePlayer.equippedTileSkins[skin.tileType] = skinId;
    persist();
    showToast(`Unlocked ${skin.name}!`);
    return true;
  }

  /** Returns the active primary color override for a tile type, or null if none equipped. */
  function getTileSkinColor(tileType) {
    if (!activePlayer || !activePlayer.equippedTileSkins) return null;
    const skinId = activePlayer.equippedTileSkins[tileType];
    if (!skinId) return null;
    const skin = TILE_SKINS.find((s) => s.id === skinId);
    return skin ? skin.primaryColor : null;
  }

  function avatarById(id) {
    const k = String(id || "").trim();
    if (!k) return null;
    const exact = AVATARS.find((a) => a.id === k);
    if (exact) return exact;
    const low = k.toLowerCase();
    return AVATARS.find((a) => a.id.toLowerCase() === low) || null;
  }

  function applyCosmeticToProfileChip() {
    if (!elProfileChip) return;
    elProfileChip.classList.toggle("profileChipHasSkin", !!getEquippedAvatarId());
    const dot = elProfileChip.querySelector(".dot");
    if (!dot || !(dot instanceof HTMLElement)) return;
    const equippedAvatar = avatarById(getEquippedAvatarId());
    if (!equippedAvatar) {
      dot.style.background =
        "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.92), rgba(122, 167, 255, 0.55))";
      dot.style.boxShadow = "0 0 0 3px rgba(122, 167, 255, 0.18)";
      return;
    }
    dot.style.background =
      "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.98), rgba(52, 211, 153, 0.85) 55%, rgba(16, 185, 129, 0.75))";
    dot.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.45), 0 0 14px rgba(34, 197, 94, 0.25)";
  }

  function getLocalCoins() {
    if (!activePlayer) return 0;
    const n = Number(activePlayer.localCoins || 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function setLocalCoins(nextCoins) {
    if (!activePlayer) return;
    activePlayer.localCoins = Math.max(0, Math.floor(Number(nextCoins) || 0));
    persist();
  }

  function getEffectiveCoins() {
    if (isAdminUser) return Number.MAX_SAFE_INTEGER;
    return currentSupabaseUser ? Math.max(0, Math.floor(userCoins || 0)) : getLocalCoins();
  }

  function getOwnedAvatarSet() {
    if (currentSupabaseUser && isAdminUser) return new Set(AVATARS.map((a) => a.id));
    if (currentSupabaseUser) return userOwnedCosmetics;
    const owned = new Set(Array.isArray(activePlayer && activePlayer.ownedAvatarIds) ? activePlayer.ownedAvatarIds : []);
    return owned;
  }

  function getEquippedAvatarId() {
    let raw = /** @type {string|null} */ (null);
    if (currentSupabaseUser) {
      if (userEquippedCosmeticId == null) return null;
      const s = String(userEquippedCosmeticId).trim();
      raw = s ? s : null;
    } else if (activePlayer && typeof activePlayer.equippedAvatarId === "string") {
      const s = activePlayer.equippedAvatarId.trim();
      raw = s ? s : null;
    }
    if (!raw) return null;
    const av = avatarById(raw);
    return av ? av.id : raw;
  }

  function syncIntensityLockUI() {
    if (elSabotageSlider) elSabotageSlider.disabled = !(userIntensityUnlocked || isAdminUser);
  }

  async function fetchUserCoinsAndShopState(sb, user) {
    if (!sb || !user || !user.id) return;
    try {
      const { data: prof, error: pErr } = await sb
        .from("profiles")
        .select("coins, intensity_unlocked, equipped_cosmetic_id, is_admin, is_mod")
        .eq("id", user.id)
        .maybeSingle();
      if (pErr) logSupabaseError("profiles.select(shop state)", pErr, {});

      userCoins = prof && prof.coins != null ? Number(prof.coins) || 0 : 0;
      userIntensityUnlocked = !!(prof && prof.intensity_unlocked);
      {
        const rawEq = prof && prof.equipped_cosmetic_id;
        const es = rawEq != null ? String(rawEq).trim() : "";
        if (!es) userEquippedCosmeticId = null;
        else {
          const av = avatarById(es);
          userEquippedCosmeticId = av ? av.id : es;
        }
      }
      profileIsAdminFromDb = !!(prof && prof.is_admin);
      profileIsModFromDb = !!(prof && prof.is_mod);
      syncAdminUiForCurrentUser();

      userOwnedCosmetics = new Set();
      const { data: owned, error: oErr } = await sb
        .from("user_owned_cosmetics")
        .select("cosmetic_id")
        .eq("user_id", user.id);
      if (oErr) logSupabaseError("user_owned_cosmetics.select", oErr, {});
      else if (Array.isArray(owned)) for (const r of owned) if (r && r.cosmetic_id) userOwnedCosmetics.add(String(r.cosmetic_id));
      if (isAdminUser) for (const a of AVATARS) userOwnedCosmetics.add(a.id);

      applyCosmeticToProfileChip();
      syncIntensityLockUI();
      syncShopUI();
      void primeEquippedAvatarOnly();
      renderAvatarShop();
    } catch (e) {
      logSupabaseError("fetchUserCoinsAndShopState", e, {});
    }
  }

  function syncShopUI() {
    const effectiveCoins = getEffectiveCoins();
    const coinLabel = isAdminUser ? "∞" : String(effectiveCoins);
    if (elCoinsValue) elCoinsValue.textContent = coinLabel;
    if (elRightCoinsValue) elRightCoinsValue.textContent = coinLabel;

    const unlocked = !!(userIntensityUnlocked || isAdminUser);
    const pillText = unlocked ? "Intensity unlocked" : "Intensity locked";
    if (elIntensityLockPill) elIntensityLockPill.textContent = pillText;
    if (elRightIntensityLockPill) elRightIntensityLockPill.textContent = pillText;

    const canBuyIntensity = !unlocked && (isAdminUser || effectiveCoins >= 500);
    const signedIn = !!(currentSupabaseUser && currentSupabaseUser.id);
    for (const b of [elBuyIntensityUnlockBtn, elRightBuyIntensityUnlockBtn].filter(Boolean)) {
      b.disabled = !canBuyIntensity;
      b.classList.toggle("hidden", unlocked);
    }

    let noteText = "";
    if (unlocked) noteText = "Intensity control unlocked — adjust the slider in Settings.";
    else if (!signedIn) noteText = "Sign in to unlock the intensity bar for your own levels (500 coins).";
    else if (isAdminUser) noteText = "Unlock intensity (no coin cost for admins).";
    else {
      const need = Math.max(0, 500 - effectiveCoins);
      noteText = need > 0 ? `Need ${need} more coins to unlock intensity.` : "Unlock intensity for 500 coins.";
    }
    if (elBuyIntensityNote) elBuyIntensityNote.textContent = noteText;
    if (elRightBuyIntensityNote) elRightBuyIntensityNote.textContent = noteText;
  }

  function syncCustomizerPreview() {
    if (!elCustomizerPreviewImage) return;
    const wrap = elCustomizerPreviewImage.closest(".customizerPreviewWrap");
    if (wrap) wrap.classList.toggle("customizerPreviewWrapEquipped", !!getEquippedAvatarId());
    const equipped = avatarById(getEquippedAvatarId());
    if (!equipped) {
      elCustomizerPreviewImage.src = DEFAULT_GHOST_PREVIEW_DATA_URL;
      elCustomizerPreviewImage.alt = "Default ghost";
      return;
    }
    elCustomizerPreviewImage.src = avatarProcessedDataUrl.get(equipped.id) || equipped.src || DEFAULT_GHOST_PREVIEW_DATA_URL;
    elCustomizerPreviewImage.alt = equipped.name;
  }

  function renderAvatarShop() {
    if (!elAvatarShopList) return;
    elAvatarShopList.innerHTML = "";
    const ownedSet = getOwnedAvatarSet();
    const equippedAvatarId = getEquippedAvatarId();
    const coins = getEffectiveCoins();

    {
      const defaultEquipped = !equippedAvatarId;
      const defItem = document.createElement("div");
      defItem.className = "listItem avatarShopRow" + (defaultEquipped ? " avatarShopRowEquipped" : "");
      defItem.setAttribute("role", "group");
      defItem.setAttribute("aria-label", "Default ghost");

      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = "Default ghost" + (defaultEquipped ? " (Equipped)" : "");
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = "Simple built-in look · free";
      meta.appendChild(name);
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "actions";
      const thumb = document.createElement("img");
      thumb.className = "avatarThumb avatarThumbDefault";
      thumb.alt = "Default ghost";
      thumb.src = DEFAULT_GHOST_PREVIEW_DATA_URL;
      actions.appendChild(thumb);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn " + (defaultEquipped ? "subtle" : "primary");
      btn.textContent = defaultEquipped ? "Equipped" : "Use default";
      btn.disabled = defaultEquipped;
      if (!defaultEquipped) btn.addEventListener("click", () => void equipDefaultGhost());
      actions.appendChild(btn);

      defItem.appendChild(meta);
      defItem.appendChild(actions);
      if (!defaultEquipped) {
        defItem.style.cursor = "pointer";
        defItem.addEventListener("click", (ev) => {
          if (/** @type {HTMLElement} */ (ev.target).closest("button")) return;
          void equipDefaultGhost();
        });
      }
      elAvatarShopList.appendChild(defItem);
    }

    for (const c of AVATARS) {
      const owned = ownedSet.has(c.id);
      const equipped = equippedAvatarId === c.id;

      const item = document.createElement("div");
      item.className = "listItem avatarShopRow" + (equipped ? " avatarShopRowEquipped" : "");
      item.setAttribute("role", "group");
      item.setAttribute("aria-label", `Avatar ${c.name}`);

      const meta = document.createElement("div");
      meta.className = "meta";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = c.name + (equipped ? " (Equipped)" : "");

      const sub = document.createElement("div");
      sub.className = "sub";
      sub.innerHTML = "";
      const chip = document.createElement("span");
      chip.className = "avatarSubTag";
      chip.textContent = c.styleTag;
      sub.appendChild(chip);
      sub.appendChild(document.createTextNode(" " + c.title + " · " + c.trait + (owned ? " · Owned" : ` · Cost ${c.cost} coins`)));

      meta.appendChild(name);
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "actions";

      const thumb = document.createElement("img");
      thumb.className = "avatarThumb";
      thumb.alt = c.name;
      thumb.src = avatarProcessedDataUrl.get(c.id) || c.src || DEFAULT_GHOST_PREVIEW_DATA_URL;
      actions.appendChild(thumb);

      if (!owned) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn primary";
        btn.textContent = `Buy (${c.cost})`;
        btn.disabled = coins < c.cost;
        btn.addEventListener("click", () => void buyAvatar(c.id));
        actions.appendChild(btn);
      } else if (!equipped) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn primary";
        btn.textContent = "Equip";
        btn.addEventListener("click", () => void equipAvatar(c.id));
        actions.appendChild(btn);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn subtle";
        btn.textContent = "Equipped";
        btn.disabled = true;
        actions.appendChild(btn);
      }

      item.appendChild(meta);
      item.appendChild(actions);
      if (owned) {
        item.style.cursor = "pointer";
        item.addEventListener("click", (ev) => {
          if (/** @type {HTMLElement} */ (ev.target).closest("button")) return;
          if (equipped) return;
          void equipAvatar(c.id);
        });
      }
      elAvatarShopList.appendChild(item);
    }
    syncCustomizerPreview();
  }

  function normalizeRpcNumber(v) {
    if (v == null) return NaN;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  async function equipDefaultGhost() {
    if (currentSupabaseUser) {
      const sb = getSupabaseClient();
      if (!sb) {
        showToast("Sign in to sync your look online.", 2000);
        return;
      }
      try {
        const { error } = await sb.from("profiles").update({ equipped_cosmetic_id: null }).eq("id", currentSupabaseUser.id);
        if (error) {
          logSupabaseError("profiles.update(clear cosmetic)", error, {});
          showToast("Could not switch to default.", 2200);
          return;
        }
        await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
        showToast("Default ghost equipped.", 1800);
      } catch (e) {
        logSupabaseError("equipDefaultGhost", e, {});
        showToast("Could not switch to default.", 2200);
      }
    } else {
      if (!activePlayer) return;
      activePlayer.equippedAvatarId = null;
      persist();
      applyCosmeticToProfileChip();
      showToast("Default ghost equipped.", 1800);
    }
    syncCustomizerPreview();
    renderAvatarShop();
  }

  async function buyAvatar(avatarId) {
    const avatar = avatarById(avatarId);
    if (!avatar) return;
    if (currentSupabaseUser) {
      const sb = getSupabaseClient();
      if (!sb) return;
      if (!isAdminUser && getEffectiveCoins() < avatar.cost) {
        showToast("Not enough coins.", 1800);
        return;
      }
      try {
        const res = await sb.rpc("ssb_buy_cosmetic", { p_user_id: currentSupabaseUser.id, p_cosmetic_id: avatarId });
        if (res.error) {
          logSupabaseError("ssb_buy_cosmetic", res.error, {});
          showToast("Purchase failed.", 2200);
          syncShopUI();
          renderAvatarShop();
          return;
        }
        const nc = normalizeRpcNumber(res && "data" in res ? res.data : null);
        if (!isAdminUser && nc === -1) {
          showToast("Not enough coins.", 1800);
          await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
          syncShopUI();
          renderAvatarShop();
          return;
        }
        await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
        const eq = await sb.rpc("ssb_equip_cosmetic", { p_user_id: currentSupabaseUser.id, p_cosmetic_id: avatarId });
        if (eq.error) logSupabaseError("ssb_equip_cosmetic after buy", eq.error, {});
        if (eq.data === false) {
          showToast(`${avatar.name} purchased — press Equip to wear it.`, 2400);
        } else {
          await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
          await primeEquippedAvatarOnly();
          applyCosmeticToProfileChip();
          showToast(`${avatar.name} purchased & equipped!`, 2000);
        }
      } catch (e) {
        logSupabaseError("buyAvatar", e, {});
        showToast("Purchase failed.", 2200);
      }
      syncShopUI();
      renderAvatarShop();
      return;
    }

    if (!activePlayer) return;
    const coins = getLocalCoins();
    if (coins < avatar.cost) {
      showToast("Not enough coins.", 1800);
      return;
    }
    const owned = new Set(Array.isArray(activePlayer.ownedAvatarIds) ? activePlayer.ownedAvatarIds : []);
    if (!owned.has(avatar.id)) owned.add(avatar.id);
    activePlayer.ownedAvatarIds = Array.from(owned);
    setLocalCoins(coins - avatar.cost);
    activePlayer.equippedAvatarId = avatar.id;
    persist();
    void primeEquippedAvatarOnly();
    applyCosmeticToProfileChip();
    showToast(`${avatar.name} purchased & equipped!`, 2000);
    syncShopUI();
    renderAvatarShop();
    syncCustomizerPreview();
  }

  async function equipAvatar(avatarId) {
    const avatar = avatarById(avatarId);
    if (!avatar) return;
    if (currentSupabaseUser) {
      const sb = getSupabaseClient();
      if (!sb || !currentSupabaseUser) return;
      try {
        const res = await sb.rpc("ssb_equip_cosmetic", { p_user_id: currentSupabaseUser.id, p_cosmetic_id: avatarId });
        if (res.error) {
          logSupabaseError("ssb_equip_cosmetic", res.error, {});
          showToast("Equip failed — check connection or sign in again.", 2400);
          return;
        }
        if (res.data === false) {
          if (isAdminUser) {
            const { error: upErr } = await sb
              .from("profiles")
              .update({ equipped_cosmetic_id: avatar.id })
              .eq("id", currentSupabaseUser.id);
            if (!upErr) {
              userEquippedCosmeticId = avatar.id;
              await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
              await primeEquippedAvatarOnly();
              applyCosmeticToProfileChip();
              syncCustomizerPreview();
              showToast(`${avatar.name} equipped!`, 1800);
              syncShopUI();
              renderAvatarShop();
              return;
            }
          }
          showToast("Could not equip — buy this avatar first, then try again.", 2800);
          await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
          renderAvatarShop();
          return;
        }
        userEquippedCosmeticId = avatar.id;
        await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
        await primeEquippedAvatarOnly();
        applyCosmeticToProfileChip();
        syncCustomizerPreview();
        showToast(`${avatar.name} equipped!`, 1800);
      } catch (e) {
        logSupabaseError("equipAvatar", e, {});
        showToast("Equip failed.", 2200);
      }
      syncShopUI();
      renderAvatarShop();
      return;
    }

    if (!activePlayer) return;
    const owned = new Set(Array.isArray(activePlayer.ownedAvatarIds) ? activePlayer.ownedAvatarIds : []);
    if (!owned.has(avatar.id)) {
      showToast("Buy this avatar first.", 1800);
      return;
    }
    activePlayer.equippedAvatarId = avatar.id;
    persist();
    void primeEquippedAvatarOnly();
    applyCosmeticToProfileChip();
    syncCustomizerPreview();
    renderAvatarShop();
    showToast(`${avatar.name} equipped!`, 1800);
  }

  function svgAvatarToDataUrl(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function loadAvatarProcessedImage(avatar) {
    return new Promise((resolve) => {
      if (avatar && typeof avatar.svg === "string" && avatar.svg.trim()) {
        resolve(svgAvatarToDataUrl(avatar.svg.trim()));
        return;
      }
      if (!avatar || typeof avatar.src !== "string" || !avatar.src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const crop = avatar.crop || { x: 0, y: 0, w: img.width, h: img.height };
        const sw = Math.max(1, Math.min(img.width - crop.x, crop.w));
        const sh = Math.max(1, Math.min(img.height - crop.y, crop.h));
        const canvasTmp = document.createElement("canvas");
        canvasTmp.width = sw;
        canvasTmp.height = sh;
        const g = canvasTmp.getContext("2d", { willReadFrequently: false });
        if (!g) return resolve(null);
        g.drawImage(img, crop.x, crop.y, sw, sh, 0, 0, sw, sh);
        const data = g.getImageData(0, 0, sw, sh);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i];
          const gg = px[i + 1];
          const b = px[i + 2];
          const nearYellow = r > 175 && gg > 160 && b < 140;
          const veryBrightFlat = r > 210 && gg > 210 && b > 210;
          if (nearYellow || veryBrightFlat) px[i + 3] = 0;
        }
        g.putImageData(data, 0, 0);
        resolve(canvasTmp.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = avatar.src;
    });
  }

  async function primeAvatarImageForShop(avatar) {
    try {
      let dataUrl = avatarProcessedDataUrl.get(avatar.id);
      if (!dataUrl) {
        dataUrl = await loadAvatarProcessedImage(avatar);
        if (dataUrl) avatarProcessedDataUrl.set(avatar.id, dataUrl);
      }
      let renderImg = avatarRenderImageCache.get(avatar.id);
      if (!renderImg) {
        renderImg = new Image();
        renderImg.decoding = "async";
        avatarRenderImageCache.set(avatar.id, renderImg);
      }
      const src = dataUrl || avatar.src;
      if (renderImg.getAttribute("data-ssb-src") !== src) {
        renderImg.setAttribute("data-ssb-src", src);
        renderImg.src = src;
      }
      try {
        await renderImg.decode();
      } catch {
        await new Promise((resolve) => {
          const done = () => resolve(undefined);
          if (renderImg.complete && renderImg.naturalWidth > 0) return done();
          renderImg.onload = done;
          renderImg.onerror = done;
        });
      }
    } catch {
      /* keep fallback draw */
    }
  }

  async function primeEquippedAvatarOnly() {
    const id = getEquippedAvatarId();
    if (!id) return;
    const av = avatarById(id);
    if (av) await primeAvatarImageForShop(av);
  }

  async function primeAllAvatarAssetsForShop() {
    if (avatarShopAssetsPrimed) {
      renderAvatarShop();
      syncCustomizerPreview();
      return;
    }
    await Promise.all(AVATARS.map((avatar) => primeAvatarImageForShop(avatar)));
    avatarShopAssetsPrimed = true;
    renderAvatarShop();
    syncCustomizerPreview();
  }

  /** @deprecated use primeAllAvatarAssetsForShop or primeEquippedAvatarOnly */
  async function primeAvatarAssets() {
    await primeAllAvatarAssetsForShop();
  }

  function numLbField(v, def = 0) {
    if (v == null) return def;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : def;
  }

  /** @param {number} score */
  function levelAndXpFromScore(score) {
    const s = Math.max(0, Math.floor(numLbField(score, 0)));
    return { level: Math.floor(s / 100) + 1, xp: s % 100 };
  }

  /** Console prefix for all Supabase debug lines (requirements: log every error). */
  const SB_LOG = "[SSB Supabase]";

  /**
   * Log Supabase errors with full PostgREST payload when present.
   * @param {string} operation
   * @param {unknown} error
   * @param {Record<string, unknown>} [extra]
   */
  function logSupabaseError(operation, error, extra) {
    const base = { operation, error };
    if (extra && typeof extra === "object") Object.assign(base, extra);
    console.error(SB_LOG, operation, base);
    if (error && typeof error === "object") {
      const e = /** @type {{ message?: string, details?: string, hint?: string, code?: string, status?: number, name?: string }} */ (error);
      if (e.message) console.error(SB_LOG, `${operation} message:`, e.message);
      if (e.details) console.error(SB_LOG, `${operation} details:`, e.details);
      if (e.hint) console.error(SB_LOG, `${operation} hint:`, e.hint);
      if (e.code) console.error(SB_LOG, `${operation} code:`, e.code);
      if (typeof e.status === "number") console.error(SB_LOG, `${operation} http_status:`, e.status);
      if (e.name) console.error(SB_LOG, `${operation} error_name:`, e.name);
    }
  }

  function getSafeErrorText(err) {
    if (!err) return "unknown";
    if (typeof err === "string") return err.slice(0, 240);
    if (typeof err === "object") {
      const e = /** @type {{ message?: string, code?: string }} */ (err);
      if (e.message) return String(e.message).slice(0, 240);
      if (e.code) return String(e.code).slice(0, 120);
    }
    return "unknown";
  }

  let lastIssueReportAtMs = 0;
  async function submitIssueReport(payload) {
    const sb = getSupabaseClient();
    const now = Date.now();
    if (now - lastIssueReportAtMs < 1800) return { ok: false, reason: "rate_limited" };
    lastIssueReportAtMs = now;
    if (!sb || !isSupabaseConfigured()) return { ok: false, reason: "supabase_missing" };
    const reporterId = currentSupabaseUser && currentSupabaseUser.id ? String(currentSupabaseUser.id) : null;
    const reporterEmail = currentSupabaseUser && currentSupabaseUser.email ? String(currentSupabaseUser.email).slice(0, 120) : null;
    const row = {
      reporter_user_id: reporterId,
      reporter_email: reporterEmail,
      category: String(payload.category || "other").slice(0, 24),
      target_user_id: payload.targetUserId ? String(payload.targetUserId).slice(0, 64) : null,
      details: String(payload.details || "").slice(0, 500),
      page_url: typeof location !== "undefined" ? String(location.href).slice(0, 240) : null,
      technical: payload.technical && typeof payload.technical === "object" ? payload.technical : null,
    };
    const { error } = await sb.from("ssb_issue_reports").insert(row);
    if (error) {
      logSupabaseError("ssb_issue_reports.insert", error, {});
      return { ok: false, reason: getSafeErrorText(error) };
    }
    return { ok: true };
  }

  function isSupabaseConfigured() {
    const w = typeof window !== "undefined" ? window : null;
    if (!w) return false;
    const url = typeof w.SUPABASE_URL === "string" ? w.SUPABASE_URL.trim() : "";
    const key = typeof w.SUPABASE_ANON_KEY === "string" ? w.SUPABASE_ANON_KEY.trim() : "";
    return Boolean(url && key);
  }

  /**
   * Browser Supabase client (anon key only). Uses window.SUPABASE_URL + window.SUPABASE_ANON_KEY from supabase-config.js.
   */
  function getSupabaseClient() {
    if (supabaseClientSingleton) return supabaseClientSingleton;
    const w = typeof window !== "undefined" ? window : null;
    if (!w) return null;
    const url = typeof w.SUPABASE_URL === "string" ? w.SUPABASE_URL.trim() : "";
    const key = typeof w.SUPABASE_ANON_KEY === "string" ? w.SUPABASE_ANON_KEY.trim() : "";
    if (!url || !key) {
      console.warn(SB_LOG, "init skipped: missing SUPABASE_URL or SUPABASE_ANON_KEY on window");
      return null;
    }
    const lib = /** @type {{ createClient?: (u: string, k: string, opts?: object) => any }} */ (w).supabase;
    if (!lib || typeof lib.createClient !== "function") {
      console.error(SB_LOG, "init failed: @supabase/supabase-js not loaded (check index.html script tag)");
      return null;
    }
    supabaseClientSingleton = lib.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof localStorage !== "undefined" ? localStorage : undefined,
      },
    });
    console.info(SB_LOG, "client initialized");
    return supabaseClientSingleton;
  }

  function syncGlobalLbHint() {
    if (!elGlobalLbHint) return;
    if (!isSupabaseConfigured()) {
      elGlobalLbHint.textContent = "Set SUPABASE_URL and SUPABASE_ANON_KEY in supabase-config.js to load global scores.";
      return;
    }
    if (currentSupabaseUser) {
      const label =
        currentSupabaseUser.email ||
        (currentSupabaseUser.is_anonymous ? "Anonymous (online)" : (currentSupabaseUser.id || "").slice(0, 8));
      elGlobalLbHint.textContent = `Online: ${label}. Wins add to your global score.`;
    } else {
      elGlobalLbHint.textContent = "Sign in, use anonymous online, or magic link to save scores globally.";
    }
  }

  function setCurrentSupabaseUser(user) {
    currentSupabaseUser = user && typeof user === "object" ? user : null;
    if (!currentSupabaseUser) {
      currentModerationBlock = null;
      profileIsAdminFromDb = false;
      profileIsModFromDb = false;
      resetGlobalLeaderboardHydration();
    }
    syncAdminUiForCurrentUser();
    syncGlobalLbHint();
    syncProfileUI();
  }

  function syncAdminUiForCurrentUser() {
    const email = currentSupabaseUser && currentSupabaseUser.email ? String(currentSupabaseUser.email).toLowerCase() : "";
    const hardcodedAdmins = new Set(["admin01@gmail.com", "admin02@gmail.com", "admi02@gmail.com"]);
    isAdminUser = profileIsAdminFromDb || hardcodedAdmins.has(email);
    if (elOpenAdminBtn) elOpenAdminBtn.classList.toggle("hidden", !isAdminUser);
    const showModEntry = !!currentSupabaseUser && profileIsModFromDb && !isAdminUser;
    if (elOpenModBtn) elOpenModBtn.classList.toggle("hidden", !showModEntry);
    syncIntensityLockUI();
  }

  function isStaffModerator() {
    return isAdminUser || (!!currentSupabaseUser && profileIsModFromDb);
  }

  async function fetchMyModerationStatus(sb, userId) {
    if (!sb || !userId) return null;
    const { data, error } = await sb
      .from("user_moderation")
      .select("status, reason, until_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logSupabaseError("user_moderation.select(self)", error, { user_id: userId });
      return null;
    }
    if (!data || !data.status) return null;
    const status = String(data.status);
    const untilAt = data.until_at ? Date.parse(String(data.until_at)) : NaN;
    const stillActive = Number.isNaN(untilAt) ? true : untilAt > Date.now();
    if (status === "banned") return data;
    if (status === "restricted" && stillActive) return data;
    return null;
  }

  function isBlockedAccountNow() {
    return !!currentModerationBlock;
  }

  function blockedActionGuard() {
    if (!isBlockedAccountNow()) return false;
    showToast("Account blocked by admin.", 2400);
    return true;
  }

  /** Username for profiles.username (matches schema: id = auth.uid()). */
  function deriveProfileUsername(user) {
    if (!user || typeof user !== "object") return "Player";
    const em = /** @type {{ email?: string }} */ (user).email;
    if (em && typeof em === "string" && em.includes("@")) {
      const base = em.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
      return base || "player";
    }
    const id = /** @type {{ id?: string }} */ (user).id || "";
    return `guest_${id.replace(/-/g, "").slice(0, 12)}`;
  }

  /**
   * Current user from the client session only (getSession). Avoids auth.getUser() — it contends with
   * Supabase’s internal auth lock during _recoverAndRefresh / onAuthStateChange and can timeout or throw
   * "lock:... was released because another request stole it".
   * @returns {Promise<{ user: object | null, error: unknown | null }>}
   */
  async function getSessionUser(sb) {
    const { data, error } = await sb.auth.getSession();
    if (error) {
      logSupabaseError("auth.getSession", error, {});
      return { user: null, error };
    }
    const user = data && data.session && data.session.user ? data.session.user : null;
    if (user) console.info(SB_LOG, "getSession user ok", user.id, user.email || "(anon)");
    else console.warn(SB_LOG, "getSession: no user");
    return { user, error: null };
  }

  /**
   * Read leaderboard row for user_id only; updates in-memory cache (no DB write).
   * @param {any} sb
   * @param {{ id: string }} user
   */
  async function fetchLeaderboardScoreIntoState(sb, user) {
    if (!sb || !user || !user.id) {
      resetGlobalLeaderboardHydration();
      return;
    }
    const { data, error } = await sb
      .from("leaderboard")
      .select(
        "score, level, xp, unique_levels_beaten, easy_levels_beaten, medium_levels_beaten, hard_levels_beaten"
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logSupabaseError("leaderboard.select(hydrate)", error, { user_id: user.id });
      resetGlobalLeaderboardHydration();
      return;
    }
    if (!data) {
      resetGlobalLeaderboardHydration();
      console.log(SB_LOG, "user.id", user.id, "fetched score", 0);
      return;
    }
    const sc = Math.max(0, Math.floor(numLbField(data.score, 0)));
    globalLeaderboardHydration.score = sc;
    const lx = levelAndXpFromScore(sc);
    globalLeaderboardHydration.level = lx.level;
    globalLeaderboardHydration.xp = lx.xp;
    globalLeaderboardHydration.unique_levels_beaten = Math.max(0, Math.floor(numLbField(data.unique_levels_beaten, 0)));
    globalLeaderboardHydration.easy_levels_beaten = Math.max(0, Math.floor(numLbField(data.easy_levels_beaten, 0)));
    globalLeaderboardHydration.medium_levels_beaten = Math.max(0, Math.floor(numLbField(data.medium_levels_beaten, 0)));
    globalLeaderboardHydration.hard_levels_beaten = Math.max(0, Math.floor(numLbField(data.hard_levels_beaten, 0)));
    console.log(SB_LOG, "user.id", user.id, "fetched score", globalLeaderboardHydration.score);
  }

  /**
   * @param {any} sb
   * @param {string} userId
   * @param {string} levelId
   * @returns {Promise<boolean>} true if this was a first-time completion (insert ok)
   */
  async function tryInsertPreconfiguredLevelCompletion(sb, userId, levelId) {
    if (!sb || !userId || !levelId) return false;
    const { error } = await sb.from("user_completed_levels").insert({ user_id: userId, level_id: levelId });
    if (!error) return true;
    const c = /** @type {{ code?: string, message?: string }} */ (error).code;
    const msg = String((/** @type {{ message?: string }} */ (error)).message || "");
    if (c === "23505" || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) return false;
    logSupabaseError("user_completed_levels.insert", error, { user_id: userId, level_id: levelId });
    return false;
  }

  /** Create or update public.profiles row (upsert, no duplicate inserts). */
  async function ensureProfile(user) {
    const sb = getSupabaseClient();
    if (!sb || !user || !user.id) return;
    const username = deriveProfileUsername(user);
    const row = {
      id: user.id,
      username,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("profiles").upsert(row, { onConflict: "id" });
    if (error) logSupabaseError("profiles.upsert", error, { row });
    else console.info(SB_LOG, "profiles.upsert ok", user.id);
  }

  /**
   * On win only: cumulative score with Math.max(existing, incoming); level/xp derived from score.
   * Optional preconfiguredMeta records first-time built-in clears in user_completed_levels and bumps counters.
   * @param {number} earnedRunPoints
   * @param {{ levelId: string, tier: string } | null | undefined} [preconfiguredMeta]
   */
  async function pushGlobalScore(earnedRunPoints, preconfiguredMeta) {
    if (blockedActionGuard()) return;
    if (isAdminUser) {
      console.info(SB_LOG, "pushGlobalScore skipped for admin");
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      console.warn(SB_LOG, "pushGlobalScore: no client");
      return;
    }
    const { user, error: guErr } = await getSessionUser(sb);
    if (guErr || !user) {
      console.warn(SB_LOG, "pushGlobalScore: no authenticated user");
      return;
    }
    await ensureProfile(user);
    const add = Math.max(0, Math.round(Number(earnedRunPoints) || 0));
    const { data: existing, error: selErr } = await sb
      .from("leaderboard")
      .select(
        "score, unique_levels_beaten, easy_levels_beaten, medium_levels_beaten, hard_levels_beaten"
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (selErr) logSupabaseError("leaderboard.select(score)", selErr, { user_id: user.id });
    const existingScore = Math.max(0, Math.floor(numLbField(existing && existing.score, 0)));
    let uniqueBeat = Math.max(0, Math.floor(numLbField(existing && existing.unique_levels_beaten, 0)));
    let easyB = Math.max(0, Math.floor(numLbField(existing && existing.easy_levels_beaten, 0)));
    let medB = Math.max(0, Math.floor(numLbField(existing && existing.medium_levels_beaten, 0)));
    let hardB = Math.max(0, Math.floor(numLbField(existing && existing.hard_levels_beaten, 0)));

    console.log(SB_LOG, "user.id", user.id);
    console.log(SB_LOG, "fetched score", existingScore);

    const incomingScore = existingScore + add;
    const scoreToSave = Math.max(existingScore, incomingScore);
    const { level: lev, xp: xpVal } = levelAndXpFromScore(scoreToSave);

    const meta = preconfiguredMeta && typeof preconfiguredMeta === "object" ? preconfiguredMeta : null;
    const lid = meta && typeof meta.levelId === "string" ? meta.levelId.trim() : "";
    if (lid) {
      const isNew = await tryInsertPreconfiguredLevelCompletion(sb, user.id, lid);
      if (isNew) {
        uniqueBeat += 1;
        const t = meta && typeof meta.tier === "string" ? meta.tier : "";
        if (t === "easy") easyB += 1;
        else if (t === "medium") medB += 1;
        else if (t === "hard") hardB += 1;

        try {
          const { data: awarded, error: coinErr } = await sb.rpc("ssb_award_preconfigured_coins", {
            p_user_id: user.id,
            p_level_id: lid,
          });
          if (coinErr) logSupabaseError("ssb_award_preconfigured_coins", coinErr, { user_id: user.id, level_id: lid });
          else {
            const n = typeof awarded === "number" ? awarded : Number(awarded || 0);
            if (Number.isFinite(n) && n > 0) {
              userCoins += n;
            }
          }
        } catch (e) {
          logSupabaseError("ssb_award_preconfigured_coins (exception)", e, { user_id: user.id, level_id: lid });
        }
      }
    }

    const displayName = deriveProfileUsername(user);
    const row = {
      user_id: user.id,
      score: scoreToSave,
      level: lev,
      xp: xpVal,
      unique_levels_beaten: uniqueBeat,
      easy_levels_beaten: easyB,
      medium_levels_beaten: medB,
      hard_levels_beaten: hardB,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    };
    console.log(SB_LOG, "score being saved", scoreToSave);
    const { error: upErr } = await sb.from("leaderboard").upsert(row, { onConflict: "user_id" });
    if (upErr) logSupabaseError("leaderboard.upsert(score)", upErr, { row });
    else {
      globalLeaderboardHydration.score = scoreToSave;
      globalLeaderboardHydration.level = lev;
      globalLeaderboardHydration.xp = xpVal;
      globalLeaderboardHydration.unique_levels_beaten = uniqueBeat;
      globalLeaderboardHydration.easy_levels_beaten = easyB;
      globalLeaderboardHydration.medium_levels_beaten = medB;
      globalLeaderboardHydration.hard_levels_beaten = hardB;
      await fetchUserCoinsAndShopState(sb, user);
      console.info(SB_LOG, "score saved", { user_id: user.id, existingScore, add, scoreToSave, uniqueBeat, easyB, medB, hardB });
    }
  }

  /**
   * Sync UI + profile seed from the stored session (getSession only). Do not call getUser() here — it races
   * with Supabase Auth’s storage lock during INITIAL_SESSION / TOKEN_REFRESHED and causes 25s timeouts.
   * @returns {Promise<{ user: object | null, error: unknown | null }>}
   */
  async function syncAuthUserFromSupabase(sb) {
    try {
      const { user, error } = await getSessionUser(sb);
      if (error) {
        setCurrentSupabaseUser(null);
        return { user: null, error };
      }
      if (!user) {
        setCurrentSupabaseUser(null);
        return { user: null, error: null };
      }
      setCurrentSupabaseUser(user);
      currentModerationBlock = await fetchMyModerationStatus(sb, user.id);
      if (currentModerationBlock) {
        showToast("Account is blocked by admin.", 2600);
        await sb.auth.signOut();
        setCurrentSupabaseUser(null);
        return { user: null, error: { message: "Account blocked by admin moderation." } };
      }
      await ensureProfile(user);
      await fetchUserCoinsAndShopState(sb, user);
      await fetchLeaderboardScoreIntoState(sb, user);
      return { user, error: null };
    } catch (e) {
      logSupabaseError("syncAuthUserFromSupabase", e, {});
      setCurrentSupabaseUser(null);
      return { user: null, error: e };
    }
  }

  /**
   * After signInWithPassword / signInAnonymously, the session is already valid locally.
   * Confirm with getSession() first so we do not block on auth.getUser() (often slow or flaky).
   */
  async function syncAuthAfterInlineSignIn(sb, userFromResponse) {
    const u = userFromResponse && typeof userFromResponse === "object" ? userFromResponse : null;
    const uid = u && u.id ? String(u.id) : "";
    if (!uid) return syncAuthUserFromSupabase(sb);

    setCurrentSupabaseUser(u);
    currentModerationBlock = await fetchMyModerationStatus(sb, u.id);
    if (currentModerationBlock) {
      showToast("Account is blocked by admin.", 2600);
      await sb.auth.signOut();
      setCurrentSupabaseUser(null);
      return { user: null, error: { message: "Account blocked by admin moderation." } };
    }
    await ensureProfile(u);
    await fetchUserCoinsAndShopState(sb, u);
    await fetchLeaderboardScoreIntoState(sb, u);

    const { data: sess, error: sErr } = await sb.auth.getSession();
    if (!sErr && sess && sess.session && sess.session.user && String(sess.session.user.id) === uid) {
      setCurrentSupabaseUser(sess.session.user);
      console.info(SB_LOG, "session OK via getSession (skipped slow getUser)");
      return { user: sess.session.user, error: null };
    }

    return syncAuthUserFromSupabase(sb);
  }

  /**
   * UMD/SDK edge cases: call GoTrue anonymous signup directly, then setSession.
   */
  async function trySignInAnonymouslyViaRest(sb) {
    const w = typeof window !== "undefined" ? window : null;
    const base = w && typeof w.SUPABASE_URL === "string" ? String(w.SUPABASE_URL).replace(/\/$/, "") : "";
    const key = w && typeof w.SUPABASE_ANON_KEY === "string" ? String(w.SUPABASE_ANON_KEY).trim() : "";
    if (!base || !key) return { data: null, error: { message: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" } };

    const res = await fetch(`${base}/auth/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: "{}",
    });
    let json = /** @type {Record<string, unknown>} */ ({});
    try {
      json = /** @type {Record<string, unknown>} */ (await res.json());
    } catch {
      json = {};
    }
    if (!res.ok) {
      const msg =
        (typeof json.error_description === "string" && json.error_description) ||
        (typeof json.msg === "string" && json.msg) ||
        (typeof json.message === "string" && json.message) ||
        (typeof json.error === "string" && json.error) ||
        `HTTP ${res.status}`;
      return { data: null, error: { message: String(msg) } };
    }
    const at = typeof json.access_token === "string" ? json.access_token : "";
    const rt = typeof json.refresh_token === "string" ? json.refresh_token : "";
    if (!at || !rt) {
      return {
        data: null,
        error: { message: "Anonymous signup returned no tokens. Enable Anonymous in Supabase → Authentication → Providers." },
      };
    }
    const setRes = await sb.auth.setSession({ access_token: at, refresh_token: rt });
    if (setRes.error) return { data: null, error: setRes.error };
    const session = setRes.data && setRes.data.session;
    const user =
      (session && session.user) || (json.user && typeof json.user === "object" ? /** @type {object} */ (json.user) : null);
    return { data: { user, session }, error: null };
  }

  // ---------- Storage ----------

  /** After device picker, closing auth should open start modal if still no player. */
  let authCloseOpensStart = false;

  /** True after first-time bootstrap (auth dismissed or token present). */
  let appBootstrapped = false;
  /** @type {{ id?: string, email?: string } | null} */
  let currentSupabaseUser = null;
  let isAdminUser = false;
  let currentModerationBlock = null;
  /** Cached admin-featured global levels for start modal (Easy/Medium/Hard tabs). */
  let cachedFeaturedGlobalLevels = /** @type {any[]} */ ([]);
  let lastAvatarPrimeEquipMs = 0;

  /** @type {any} */
  let mpSocket = null;
  let mpRoomId = /** @type {string|null} */ (null);
  let mpIsHost = false;
  let mpMySocketId = /** @type {string|null} */ (null);
  let mpSaboteurSocketId = /** @type {string|null} */ (null);
  let mpIsSaboteur = false;
  let mpSabotageCooldownUntil = 0;
  let mpLastEmitMs = 0;
  /** @type {number|null} */
  let mpPendingForcedSeed = null;
  /** @type {Map<string, { x: number, y: number, vx: number, name: string, avatarId: string | null, seenMs: number }>} */
  let mpRemotePeers = new Map();
  let localMpEnabled = false;
  let localMpPlayers = ["Player A", "Player B"];
  let localMpTurn = 0;
  let localMpScore = [0, 0];
  let localMpRound = 0;
  const localMpMaxRounds = 5;
  /** @type {{ active: boolean, round: number, maxRounds: number, scores: Record<string, number> }} */
  let mpMatch = { active: false, round: 0, maxRounds: 5, scores: {} };
  let mpRandomQueueing = false;
  const remixSelectedLevelIds = new Set();

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
   * @property {Record<string, string>} [texts]
   * @property {Record<string, { x: number, y: number }>} [links]
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
   * @property {number} [winStreak]
   */

  /**
   * @typedef {Object} PlayerRecord
   * @property {string} id
   * @property {string} name
   * @property {number} createdAt
   * @property {PlayerStats} stats
   * @property {PlayerPowerups} powerups
  * @property {number} [localCoins]
  * @property {string[]} [ownedAvatarIds]
  * @property {string|null} [equippedAvatarId]
   * @property {string[]} [completedBuiltinLevelIdsForCoins]
   * @property {Record<string, { bestTimeMs: number }>} [timedLevelPb] Per-level best clear time (ms), timed modes only
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
   *   ambientNoise: "off"|"white"|"pink"|"brown",
   *   musicTrack: string
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
        if (p.stats && typeof p.stats.winStreak !== "number") p.stats.winStreak = 0;
        if (typeof p.localCoins !== "number") p.localCoins = 0;
        if (!Array.isArray(p.ownedAvatarIds)) p.ownedAvatarIds = [];
        if (typeof p.equippedAvatarId !== "string") p.equippedAvatarId = null;
        else if (!String(p.equippedAvatarId).trim()) p.equippedAvatarId = null;
        if (!Array.isArray(p.completedBuiltinLevelIdsForCoins)) p.completedBuiltinLevelIdsForCoins = [];
        if (!p.timedLevelPb || typeof p.timedLevelPb !== "object") p.timedLevelPb = {};
      }
      if (!parsed.settings) parsed.settings = defaultSave().settings;
      const allowedThemes = ["dark", "light", "forest", "indian", "cute"];
      if (!allowedThemes.includes(parsed.settings.theme)) parsed.settings.theme = "dark";
      if (typeof parsed.settings.sound !== "boolean") parsed.settings.sound = true;
      const allowedBg = ["scene", "nebula", "grid", "dusk", "forest", "indian", "cuteFlowers", "city"];
      if (!allowedBg.includes(parsed.settings.background)) parsed.settings.background = "scene";
      if (typeof parsed.settings.volume !== "number") parsed.settings.volume = 0.7;
      if (typeof parsed.settings.sabotageLevel !== "number") parsed.settings.sabotageLevel = 5;
      if (!parsed.settings.keybinds) parsed.settings.keybinds = defaultKeybinds();
      if (typeof parsed.settings.debugOverlay !== "boolean") parsed.settings.debugOverlay = false;
      if (typeof parsed.settings.showPuzzleLinks !== "boolean") parsed.settings.showPuzzleLinks = true;
      const amb = parsed.settings.ambientNoise;
      if (amb !== "off" && amb !== "white" && amb !== "pink" && amb !== "brown") parsed.settings.ambientNoise = "off";
      if (typeof parsed.settings.musicTrack !== "string") parsed.settings.musicTrack = "off";
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
        background: "scene",
        sabotageLevel: 5,
        keybinds: defaultKeybinds(),
        debugOverlay: false,
        showPuzzleLinks: true,
        ambientNoise: "off",
        musicTrack: "off",
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
        winStreak: 0,
      },
      powerups: { doubleJump: 0, speedBoost: 0, protection: 0 },
      localCoins: 0,
      ownedAvatarIds: [],
      equippedAvatarId: null,
      levels: {},
      timedLevelPb: {},
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
    hydrateBuiltinLevelStatsFromPlayer();
    syncProfileUI();
    refreshLevelsList();
    refreshLeaderboard();
    void primeEquippedAvatarOnly();
    if (!p) openStartModal();
  }

  function syncProfileUI() {
    const u = currentSupabaseUser;
    const online =
      u && u.id
        ? u.email ||
          (typeof u.is_anonymous === "boolean" && u.is_anonymous
            ? "Anonymous (online)"
            : `User ${String(u.id).slice(0, 8)}…`)
        : "";
    elActivePlayerName.textContent = online || (activePlayer ? activePlayer.name : "—");
    const sub = document.getElementById("activePlayerSub");
    if (sub) {
      if (online) {
        sub.textContent = u && u.email ? "Global account connected" : "Global online — scores sync to Supabase";
        sub.classList.remove("hidden");
      } else if (!activePlayer) {
        sub.textContent = "";
        sub.classList.add("hidden");
      } else {
        const st = activePlayer.stats;
        const streak = typeof st.winStreak === "number" ? st.winStreak : 0;
        if (streak > 0) {
          sub.textContent = `${streak} win streak`;
          sub.classList.remove("hidden");
        } else {
          sub.textContent = "";
          sub.classList.add("hidden");
        }
      }
    }
    if (elAuthAccountBtn) {
      elAuthAccountBtn.textContent = online ? "Account" : "Log in";
      elAuthAccountBtn.classList.toggle("hidden", Boolean(online));
    }
    if (elAuthRegisterTopBtn) elAuthRegisterTopBtn.classList.toggle("hidden", Boolean(online));
    if (elAuthLogoutTopBtn) elAuthLogoutTopBtn.classList.toggle("hidden", !online);

    applyCosmeticToProfileChip();
    syncShopUI();
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

    /** Briefly lower ambient loop so stingers read clearly (no extra music track). */
    function duckAmbient(ms, factor = 0.3) {
      if (!ambientGain || !ac) return;
      if ((save.settings.ambientNoise || "off") === "off") return;
      if (!save.settings.sound || !sfxEnabled) return;
      const t = ac.currentTime;
      const base = getAmbientVolumeGain();
      if (base < 0.0001) return;
      ambientGain.gain.cancelScheduledValues(t);
      const cur = Math.max(0.0001, ambientGain.gain.value);
      ambientGain.gain.setValueAtTime(cur, t);
      const tgt = Math.max(0.0001, base * factor);
      ambientGain.gain.exponentialRampToValueAtTime(tgt, t + 0.04);
      ambientGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, base), t + 0.04 + ms / 1000);
    }

    function stepVariant() {
      const freqs = [142, 168, 155, 182];
      const f = freqs[(Math.random() * freqs.length) | 0];
      blip("square", f, 18 + Math.random() * 16, 0.042 + Math.random() * 0.028);
    }

    function landSoft() {
      noiseBurst(48, 0.09);
      blip("sine", 220, 55, 0.08);
    }
    function landHeavy() {
      noiseBurst(78, 0.15);
      blip("sine", 150, 75, 0.12);
    }

    function hurtSting() {
      noiseBurst(100, 0.2);
      blip("sawtooth", 130, 95, 0.1);
    }

    function winBurst() {
      blip("triangle", 880, 160, 0.28);
      window.setTimeout(() => {
        if (!save.settings.sound || !sfxEnabled) return;
        blip("triangle", 660, 110, 0.2);
      }, 70);
      window.setTimeout(() => {
        if (!save.settings.sound || !sfxEnabled) return;
        blip("sine", 990, 140, 0.16);
      }, 160);
    }

    return {
      unlock,
      setEnabled,
      applyAmbientFromSettings,
      duckAmbient,
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
        step: () => stepVariant(),
        landSoft,
        landHeavy,
        curse: () => blip("sawtooth", 240, 120, 0.14),
        hurt: () => hurtSting(),
        winBurst: () => winBurst(),
      },
    };
  })();

  /** Looped MP3 soundtrack — no audio files bundled; stub retained for settings compat. */
  const MusicSys = (() => {
    function apply() { /* no external audio files */ }
    return { apply };
  })();

  window.addEventListener(
    "pointerdown",
    () => {
      AudioSys.unlock();
      AudioSys.setEnabled(save.settings.sound);
      MusicSys.apply();
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
      /** Ctrl or Cmd (build hotkeys: undo, copy). */
      this.modCtrl = false;

      const onKeyDown = (e) => {
        this.modCtrl = !!(e.ctrlKey || e.metaKey);
        if (isUiTypingTarget(/** @type {Element} */ (e.target)) && e.key !== "Escape") return;
        if (keybindUI.action) return;
        if (mode === "build" && (e.ctrlKey || e.metaKey)) {
          const pre = normalizeKey(e);
          if (pre === "z" || pre === "y" || pre === "c" || pre === "v") e.preventDefault();
        }
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
        this.modCtrl = !!(e.ctrlKey || e.metaKey);
        if (isUiTypingTarget(/** @type {Element} */ (e.target)) && e.key !== "Escape") return;
        if (keybindUI.action) return;
        const k = normalizeKey(e);
        if (!k) return;
        if (this.down.has(k)) this.released.add(k);
        this.down.delete(k);
      };

      window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
      window.addEventListener("keyup", onKeyUp, { passive: false, capture: true });
      const clearAllKeys = () => {
        this.down.clear();
        this.pressed.clear();
        this.released.clear();
        this.modCtrl = false;
      };
      window.addEventListener("blur", clearAllKeys);
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") clearAllKeys();
        });
      }
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
  window.addEventListener("sabotageTriggered", (ev) => {
    const rule = ev && ev.detail ? ev.detail : null;
    if (AudioSys && AudioSys.sfx && typeof AudioSys.sfx.curse === "function") AudioSys.sfx.curse();
    if (rule && rule.id === "near_win_betrayal") showToast("Sabotage triggered.", 1000);
  });

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
      // IMPROVE 4: Detect duplicate keybinds before saving.
      const _conflictAction = Object.keys(save.settings.keybinds || {}).find(
        (a) => a !== keybindUI.action && save.settings.keybinds[a] === k
      );
      save.settings.keybinds[keybindUI.action] = k;
      keybindUI.action = null;
      persist();
      buildKeybindUI();
      if (_conflictAction) {
        showToast(`Keybind saved (also assigned to: "${_conflictAction}") — you may want to rebind that action.`, 2800);
      } else {
        showToast("Keybind saved.");
      }
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

  function maybeNotifyTutorialAvailable() {
    try {
      if (localStorage.getItem(TUTORIAL_PROMPT_KEY)) return;
    } catch {
      return;
    }
    showToast("Optional tutorial: open Player (top) → Start tutorial.", 4200);
  }
  function updateToast(now) {
    if (!toastTimer) return;
    if (now > toastTimer) {
      toastTimer = 0;
      elToast.classList.remove("show");
    }
  }

  function nextVibeLine(outcome = null) {
    if (outcome === "win") return VIBE_WIN_LINES[(Math.random() * VIBE_WIN_LINES.length) | 0];
    if (outcome === "lose") return VIBE_LOSE_LINES[(Math.random() * VIBE_LOSE_LINES.length) | 0];
    const line = VIBE_LINES[vibeLineIndex % VIBE_LINES.length];
    vibeLineIndex++;
    return line;
  }

  function updateLegendaryVibe(now) {
    if (mode !== "play" || !play || play.ended) return;
    if (!vibeNextAt) vibeNextAt = now + 3500;
    if (now < vibeNextAt) return;
    vibeNextAt = now + 5200 + Math.random() * 2600;
    if (elRunHint) elRunHint.textContent = `${nextVibeLine()} · seed ${play.runSeed >>> 0}`;
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
    return [
      elStartModal,
      elLevelsModal,
      elLeaderboardModal,
      elSettingsModal,
      elReportModal,
      elCustomizationModal,
      elAdminModal,
      elModModal,
      elAnnouncementModal,
      elAdminPublishLevelModal,
    ].every((m) => !m || m.classList.contains("hidden"));
  }


  function openStartModal() {
    openModal(elStartModal);
    renderPlayerList("");
    void refreshFeaturedGlobalLevelsCache().then(() => renderLevelListByTier());
    renderLevelListByTier();
    syncPowerupUI();
    void syncDailyChallengeUI();
    syncStartModalLevelPickVisibility();
    if (elTutorialOfferCard) {
      let dismissed = false;
      try {
        dismissed = !!localStorage.getItem(TUTORIAL_PROMPT_KEY);
      } catch {
        dismissed = false;
      }
      elTutorialOfferCard.classList.toggle("hidden", dismissed || !activePlayer);
    }
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

  // ---------- Daily challenge (deterministic hard built-in) ----------
  function getUtcDayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function stableHashU32(s) {
    // Simple FNV-1a variant (deterministic, fast).
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function getDailyChallengeBuiltIn(dayKey) {
    const hard = BUILTIN_LEVELS.filter((l) => l.tier === "hard");
    if (hard.length === 0) return null;
    const ix = stableHashU32(dayKey) % hard.length;
    const lvl = hard[ix];
    const builtinIndex = BUILTIN_LEVELS.findIndex((l) => l.id === lvl.id);
    return { level: lvl, builtinIndex };
  }

  async function syncDailyChallengeUI() {
    if (!elDailyChallengeStatus) return;
    const dayKey = getUtcDayKey();
    elDailyChallengeStatus.textContent = "Daily…";

    const sb = getSupabaseClient();
    const u = currentSupabaseUser;
    if (!sb || !u || !u.id || !isSupabaseConfigured()) {
      elDailyChallengeStatus.textContent = "Daily ready (offline)";
      return;
    }

    try {
      const { data, error } = await sb
        .from("daily_challenge_progress")
        .select("attempts_used, completed, coins_awarded")
        .eq("user_id", u.id)
        .eq("day_key", dayKey)
        .maybeSingle();
      if (error) {
        logSupabaseError("daily_challenge_progress.select", error, { user_id: u.id, day_key: dayKey });
        elDailyChallengeStatus.textContent = "Daily ready";
        return;
      }
      const completed = !!(data && data.completed);
      if (completed) {
        elDailyChallengeStatus.textContent = "Completed ✓";
        return;
      }
      const attemptsUsed = (data && data.attempts_used | 0) || 0;
      const left = Math.max(0, 5 - attemptsUsed);
      elDailyChallengeStatus.textContent = left > 0 ? `${left} attempts left` : "No attempts left";
    } catch (e) {
      logSupabaseError("syncDailyChallengeUI (exception)", e, {});
      elDailyChallengeStatus.textContent = "Daily ready";
    }
  }

  async function startDailyChallenge() {
    if (!elStartModal) return;
    const dayKey = getUtcDayKey();
    const daily = getDailyChallengeBuiltIn(dayKey);
    if (!daily) {
      showToast("Daily challenge not available right now.", 2200);
      return;
    }

    const u = currentSupabaseUser;
    const sb = getSupabaseClient();
    let attemptsUsed = 0;
    let completed = false;
    let coinsAwarded = false;

    if (sb && u && u.id && isSupabaseConfigured()) {
      try {
        const { data, error } = await sb
          .from("daily_challenge_progress")
          .select("attempts_used, completed, coins_awarded")
          .eq("user_id", u.id)
          .eq("day_key", dayKey)
          .maybeSingle();
        if (error) logSupabaseError("daily_challenge_progress.select (start)", error, { user_id: u.id, day_key: dayKey });

        if (data) {
          attemptsUsed = data.attempts_used | 0;
          completed = !!data.completed;
          coinsAwarded = !!data.coins_awarded;
        } else {
          await sb
            .from("daily_challenge_progress")
            .upsert(
              { user_id: u.id, day_key: dayKey, attempts_used: 0, completed: false, coins_awarded: false },
              { onConflict: "user_id,day_key" }
            );
        }
      } catch (e) {
        logSupabaseError("startDailyChallenge daily_progress init (exception)", e, {});
      }
    }

    if (!completed && attemptsUsed >= 5) {
      showToast("Daily attempts reached. Come back tomorrow.", 2400);
      return;
    }

    if (elDailyChallengeStatus) {
      elDailyChallengeStatus.textContent = completed ? "Completed ✓" : `${Math.max(0, 5 - attemptsUsed)} attempts left`;
    }

    const dailyChallengeMeta = {
      dayKey,
      attemptsUsedLocal: attemptsUsed,
      completedLocal: completed,
      coinsAwardedLocal: coinsAwarded,
    };

    loadFlatIntoGrid(daily.level.tilesFlat);
    closeModal(elStartModal);
    startPlay(daily.level.id, daily.builtinIndex, null, dailyChallengeMeta);
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
    showPuzzleLinks = save.settings.showPuzzleLinks !== false;
    if (elTogglePuzzleLinksBtn) {
      elTogglePuzzleLinksBtn.textContent = showPuzzleLinks ? "Puzzle links: ON" : "Puzzle links: OFF";
      elTogglePuzzleLinksBtn.classList.toggle("primary", showPuzzleLinks);
      elTogglePuzzleLinksBtn.classList.toggle("subtle", !showPuzzleLinks);
    }
    if (elAmbientNoiseSelect) elAmbientNoiseSelect.value = save.settings.ambientNoise || "off";
    elBackgroundSelect.value = save.settings.background || "scene";
    elSabotageSlider.value = String(clamp(Math.round(save.settings.sabotageLevel || 5), 1, 10));
    elSabotageValue.textContent = elSabotageSlider.value;
    AudioSys.setVolume(save.settings.volume ?? 0.7);
    AudioSys.applyAmbientFromSettings();
    if (elMusicTrackSelect) {
      elMusicTrackSelect.innerHTML = "";
      for (const tr of MUSIC_LIBRARY) {
        const opt = document.createElement("option");
        opt.value = tr.id;
        opt.textContent = tr.label;
        elMusicTrackSelect.appendChild(opt);
      }
      const cur = save.settings.musicTrack || "off";
      elMusicTrackSelect.value = MUSIC_LIBRARY.some((t) => t.id === cur) ? cur : "off";
    }
    MusicSys.apply();
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
    MusicSys.apply();
  });

  elBackgroundSelect.addEventListener("change", () => {
    // @ts-ignore
    save.settings.background = elBackgroundSelect.value || "scene";
    persist();
  });

  elSabotageSlider.addEventListener("input", () => {
    const v = clamp(parseInt(elSabotageSlider.value || "5", 10) || 5, 1, 10);
    elSabotageSlider.value = String(v);
    elSabotageValue.textContent = String(v);
    save.settings.sabotageLevel = v;
    persist();
  });

  async function purchaseIntensityUnlock() {
    const sb = getSupabaseClient();
    if (!sb || !currentSupabaseUser) {
      showToast("Sign in to buy the intensity unlock.", 2000);
      return;
    }
    try {
      const res = await sb.rpc("ssb_buy_intensity_unlock", { p_user_id: currentSupabaseUser.id });
      if (res && res.error) {
        logSupabaseError("ssb_buy_intensity_unlock", res.error, {});
        showToast("Purchase failed. Check console logs.", 2200);
        return;
      }
      await fetchUserCoinsAndShopState(sb, currentSupabaseUser);
      syncShopUI();
      if (userIntensityUnlocked || isAdminUser) {
        showToast("Intensity unlocked! Adjust it in Settings.", 2200);
      } else {
        showToast("Could not unlock — need 500 coins or already unlocked.", 2600);
      }
    } catch (e) {
      logSupabaseError("buy intensity (exception)", e, {});
      showToast("Purchase failed. Check console logs.", 2200);
    }
  }

  if (elBuyIntensityUnlockBtn) elBuyIntensityUnlockBtn.addEventListener("click", () => void purchaseIntensityUnlock());
  if (elRightBuyIntensityUnlockBtn) elRightBuyIntensityUnlockBtn.addEventListener("click", () => void purchaseIntensityUnlock());

  if (elVolumeSlider) {
    elVolumeSlider.addEventListener("input", () => {
      const v = clamp(parseInt(elVolumeSlider.value || "70", 10) || 70, 0, 100) / 100;
      save.settings.volume = v;
      if (elVolumeValue) elVolumeValue.textContent = Math.round(v * 100) + "%";
      persist();
      AudioSys.setVolume(v);
      MusicSys.apply();
    });
  }
  if (elMusicTrackSelect) {
    elMusicTrackSelect.addEventListener("change", () => {
      const v = elMusicTrackSelect.value || "off";
      save.settings.musicTrack = MUSIC_LIBRARY.some((t) => t.id === v) ? v : "off";
      persist();
      MusicSys.apply();
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

  // FPS counter toggle
  const elFpsCounterToggle = /** @type {HTMLInputElement | null} */ ($("fpsCounterToggle"));
  if (elFpsCounterToggle) {
    // Restore saved preference
    const savedFpsPref = localStorage.getItem("ssb_fps_counter");
    if (savedFpsPref === "0") {
      _fpsShowCounter = false;
      elFpsCounterToggle.checked = false;
    }
    elFpsCounterToggle.addEventListener("change", () => {
      _fpsShowCounter = elFpsCounterToggle.checked;
      localStorage.setItem("ssb_fps_counter", _fpsShowCounter ? "1" : "0");
    });
  }

  // ---------- Device mode (mobile / desktop) ----------
  /** @type {"mobile"|"desktop"|null} */
  let deviceMode = localStorage.getItem(DEVICE_KEY) === "mobile" ? "mobile" : localStorage.getItem(DEVICE_KEY) === "desktop" ? "desktop" : null;
  let touchLeftDown = false;
  let touchRightDown = false;
  let touchJumpDown = false;

  function setDeviceMode(m) {
    deviceMode = m;
    localStorage.setItem(DEVICE_KEY, m);
    if (elDeviceModal) elDeviceModal.classList.add("hidden");
    document.documentElement.classList.toggle("device-touch-mode", m === "mobile");
    syncTouchControlsVisibility();
    syncExitAndRotateUI();
    if (!activePlayer) openStartModal();
    maybeRestoreBuildDraft();
    // Re-check portrait overlay whenever device mode changes
    setTimeout(() => {
      const overlay = document.getElementById("portraitOverlay");
      if (!overlay) return;
      const isPortrait = window.innerWidth < window.innerHeight && window.innerWidth < 600;
      if (m === "mobile" && isPortrait) overlay.classList.remove("hidden");
    }, 50);
  }

  function syncExitAndRotateUI() {
    if (elExitToMenuBtn) {
      if (deviceMode) elExitToMenuBtn.classList.remove("hidden");
      else elExitToMenuBtn.classList.add("hidden");
    }
    if (elMobileExitBuildBtn) {
      const showExit = deviceMode === "mobile" && mode === "build";
      elMobileExitBuildBtn.classList.toggle("hidden", !showExit);
    }
    const app = document.querySelector(".app");
    if (app) {
      const playFs =
        deviceMode === "mobile" && mode === "play" && play && !play.ended;
      app.classList.toggle("mobilePlayFullscreen", playFs);
      app.classList.toggle("mobileBuild", deviceMode === "mobile" && mode === "build");
      app.classList.toggle("mobileBuildFullscreen", deviceMode === "mobile" && mode === "build");
    }
  }

  function syncStartModalLevelPickVisibility() {
    if (elStartModalLevelPickCard) elStartModalLevelPickCard.classList.remove("hidden");
    const p = $("startModalPowerupCard");
    if (p) p.classList.remove("hidden");
  }

  if (elMobileExitBuildBtn) {
    elMobileExitBuildBtn.addEventListener("click", () => {
      openStartModal();
    });
  }

  if (elExitToMenuBtn) {
    elExitToMenuBtn.addEventListener("click", () => {
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
    if (!elTouchControls) return;
    if (deviceMode === "mobile" && mode === "play" && play && !play.ended) {
      elTouchControls.classList.remove("hidden");
      elTouchControls.setAttribute("aria-hidden", "false");
    } else {
      elTouchControls.classList.add("hidden");
      elTouchControls.setAttribute("aria-hidden", "true");
    }
  }

  if (elDeviceDesktopBtn) elDeviceDesktopBtn.addEventListener("click", () => setDeviceMode("desktop"));
  if (elDeviceMobileBtn) elDeviceMobileBtn.addEventListener("click", () => setDeviceMode("mobile"));

  if (elTouchLeft) {
    elTouchLeft.addEventListener("touchstart", (e) => { e.preventDefault(); touchLeftDown = true; });
    elTouchLeft.addEventListener("touchend", (e) => { e.preventDefault(); touchLeftDown = false; });
    elTouchLeft.addEventListener("mousedown", () => touchLeftDown = true);
    elTouchLeft.addEventListener("mouseup", () => touchLeftDown = false);
    elTouchLeft.addEventListener("mouseleave", () => touchLeftDown = false);
    elTouchLeft.addEventListener("touchcancel", () => (touchLeftDown = false));
  }
  if (elTouchRight) {
    elTouchRight.addEventListener("touchstart", (e) => { e.preventDefault(); touchRightDown = true; });
    elTouchRight.addEventListener("touchend", (e) => { e.preventDefault(); touchRightDown = false; });
    elTouchRight.addEventListener("mousedown", () => touchRightDown = true);
    elTouchRight.addEventListener("mouseup", () => touchRightDown = false);
    elTouchRight.addEventListener("mouseleave", () => touchRightDown = false);
    elTouchRight.addEventListener("touchcancel", () => (touchRightDown = false));
  }
  if (elTouchJump) {
    elTouchJump.addEventListener("touchstart", (e) => { e.preventDefault(); touchJumpDown = true; });
    elTouchJump.addEventListener("touchend", (e) => { e.preventDefault(); touchJumpDown = false; });
    elTouchJump.addEventListener("mousedown", () => touchJumpDown = true);
    elTouchJump.addEventListener("mouseup", () => touchJumpDown = false);
    elTouchJump.addEventListener("mouseleave", () => touchJumpDown = false);
    elTouchJump.addEventListener("touchcancel", () => (touchJumpDown = false));
  }

  // ---------- Build Grid ----------
  /** @type {TileType[][]} */
  const grid = makeGrid(COLS, ROWS, Tile.empty);
  /** Build mode: viewport top-left in world pixels (scroll). */
  let buildCamX = 0;
  let buildCamY = 0;
  let buildPanPointerId = /** @type {number | null} */ (null);
  let buildPanLastClient = { x: 0, y: 0 };
  /** @type {{ cx: number; cy: number; camX: number; camY: number } | null} */
  let buildTwoTouchPan = null;

  function worldPixelW() {
    return COLS * TILE;
  }
  function worldPixelH() {
    return ROWS * TILE;
  }
  function clampBuildCam() {
    const maxX = Math.max(0, worldPixelW() - canvas.width);
    const maxY = Math.max(0, worldPixelH() - canvas.height);
    buildCamX = clamp(buildCamX, 0, maxX);
    buildCamY = clamp(buildCamY, 0, maxY);
  }
  function resetBuildCameraDefault() {
    buildCamX = Math.max(0, Math.floor((worldPixelW() - canvas.width) * 0.2));
    buildCamY = Math.max(0, worldPixelH() - canvas.height);
    clampBuildCam();
  }
  resetBuildCameraDefault();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => clampBuildCam());
  }
  /** Build mode: short erase pop animations @type {{ gx: number, gy: number, t0: number, prev: TileType }[]} */
  const eraseFx = [];
  /** Build mode: brief place flash @type {{ gx: number, gy: number, t0: number }[]} */
  const placeFx = [];
  /** Undo stack: JSON snapshots of flattenGrid (full world). */
  const undoStack = /** @type {string[]} */ ([]);
  const redoStack = /** @type {string[]} */ ([]);
  /** Alt-drag: normalized selection in grid coords (inclusive). */
  let buildMarquee = /** @type {{ x0: number, y0: number, x1: number, y1: number } | null} */ (null);
  let buildMarqueeDrag = false;
  /** Copied tiles (row-major, width w). */
  let clipboardRegion = /** @type {{ w: number, h: number, tiles: TileType[] } | null} */ (null);
  /** Key "gx,gy" → label (build + play). */
  let levelTexts = /** @type {Record<string, string>} */ ({});
  /** Key "gx,gy" -> destination grid cell for puzzle teleport tiles. */
  let levelLinks = /** @type {Record<string, { x: number, y: number }>} */ ({});
  /** After placing a puzzle tile, the next left click chooses its destination. */
  let pendingLinkSource = /** @type {{ x: number, y: number, type: TileType } | null} */ (null);
  let showPuzzleLinks = true;
  /** Next left-click on grid opens text prompt. */
  let textPlacementMode = false;
  /** ADD 6: Current brush rotation (0–3, mapped to 0°/90°/180°/270°). */
  let currentBrushRotation = 0;
  /** ADD 6: Per-cell rotation overrides. Key "gx,gy" → rotation index (0–3). */
  let tileRotations = /** @type {Record<string, number>} */ ({});
  /** Left or right drag-erase without spamming undo until pointerup. */
  let buildEraseActive = false;
  let buildEraseStrokeDirty = false;
  /** @type {number | null} */
  let buildErasePointerId = null;
  /** Skip redundant `canPlaceTile` when pointer stayed in the same cell with same palette tile. */
  let lastHoverForPlacement = { gx: -9999, gy: -9999, tile: /** @type {number} */ (-1) };
  const ERASE_LAST_UNSET = -32768;
  let eraseStrokeLastGx = ERASE_LAST_UNSET;
  let eraseStrokeLastGy = ERASE_LAST_UNSET;
  /** Optional play test spawn (grid cell feet align like Start). Cleared on full clear. */
  let testSpawnCell = /** @type {{ gx: number, gy: number } | null} */ (null);
  let draftSaveTimer = 0;
  let lastBuildStatusText = "";
  /** @type {TileType} */
  let selectedTile = Tile.platform;

  /** @type {"build"|"play"} */
  let mode = "build";

  function cloneLevelLinks() {
    const out = /** @type {Record<string, { x: number, y: number }>} */ ({});
    for (const k of Object.keys(levelLinks)) {
      const v = levelLinks[k];
      if (!v) continue;
      const x = Math.floor(Number(v.x));
      const y = Math.floor(Number(v.y));
      if (inBounds(x, y)) out[k] = { x, y };
    }
    return out;
  }

  const pointer = {
    over: false,
    gx: 0,
    gy: 0,
    canPlace: true,
    reason: "",
  };

  /**
   * Map screen coordinates to canvas bitmap pixels, accounting for CSS letterboxing (e.g. object-fit: contain).
   * @returns {{ x: number, y: number } | null} null if outside the drawable area
   */
  function pointerToCanvasPixel(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const iw = canvas.width;
    const ih = canvas.height;
    const rw = rect.width;
    const rh = rect.height;
    if (rw <= 0 || rh <= 0 || iw <= 0 || ih <= 0) return null;
    const scale = Math.min(rw / iw, rh / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const ox = rect.left + (rw - dw) / 2;
    const oy = rect.top + (rh - dh) / 2;
    const x = (clientX - ox) / scale;
    const y = (clientY - oy) / scale;
    if (x < 0 || y < 0 || x >= iw || y >= ih) return null;
    return { x, y };
  }

  /** World-space point under the cursor during play (for admin fly). */
  function clientToPlayWorld(clientX, clientY) {
    if (!play || mode !== "play") return null;
    const px = pointerToCanvasPixel(clientX, clientY);
    if (!px) return null;
    const off = camOffset(play);
    return {
      x: px.x - canvas.width / 2 + play.cam.followX - off.x,
      y: px.y - canvas.height / 2 + play.cam.followY - off.y,
    };
  }

  /** CSS letterbox scale: canvas bitmap px per CSS px. */
  function canvasBitmapScale() {
    const rect = canvas.getBoundingClientRect();
    const iw = canvas.width;
    const ih = canvas.height;
    const rw = rect.width;
    const rh = rect.height;
    if (rw <= 0 || rh <= 0 || iw <= 0 || ih <= 0) return 1;
    return Math.min(rw / iw, rh / ih);
  }

  /** @param {PointerEvent | MouseEvent | TouchEvent} e */
  function eventClientPoint(e) {
    const t =
      "touches" in e && e.touches && e.touches[0]
        ? e.touches[0]
        : "changedTouches" in e && e.changedTouches && e.changedTouches[0]
          ? e.changedTouches[0]
          : e;
    return { x: t.clientX, y: t.clientY };
  }

  /** @param {PointerEvent | MouseEvent | TouchEvent} e */
  function canvasToGrid(e) {
    const { x, y } = eventClientPoint(e);
    const px = pointerToCanvasPixel(x, y);
    if (!px) return { gx: -1, gy: -1 };
    const camX = mode === "build" ? buildCamX : 0;
    const camY = mode === "build" ? buildCamY : 0;
    return { gx: Math.floor((px.x + camX) / TILE), gy: Math.floor((px.y + camY) / TILE) };
  }

  // Canvas interactions (build)
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (mode !== "build") return;
      e.preventDefault();
      const sc = canvasBitmapScale();
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) / sc;
      const dy = (e.shiftKey ? 0 : e.deltaY) / sc;
      buildCamX += dx;
      buildCamY += dy;
      clampBuildCam();
    },
    { passive: false }
  );

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerenter", () => (pointer.over = true));
  canvas.addEventListener("pointerleave", () => {
    pointer.over = false;
    if (play && play.adminFlyTarget) play.adminFlyTarget = null;
    if (mode === "build") elRunHint.textContent = "Pan: wheel · middle-drag · two fingers · arrows.";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (mode === "build" && buildPanPointerId === e.pointerId) {
      const sc = canvasBitmapScale();
      buildCamX -= (e.clientX - buildPanLastClient.x) / sc;
      buildCamY -= (e.clientY - buildPanLastClient.y) / sc;
      buildPanLastClient = { x: e.clientX, y: e.clientY };
      clampBuildCam();
    }
    const g = canvasToGrid(e);
    pointer.gx = g.gx;
    pointer.gy = g.gy;
    if (mode === "build" && buildMarqueeDrag && buildMarquee) {
      buildMarquee.x1 = g.gx;
      buildMarquee.y1 = g.gy;
    }
    if (mode === "build" && buildEraseActive) {
      const rightHeld = (e.buttons & 2) !== 0;
      const leftEraseHeld = (e.buttons & 1) !== 0 && selectedTile === Tile.empty;
      if ((rightHeld || leftEraseHeld) && inBounds(pointer.gx, pointer.gy)) {
        const gx = pointer.gx;
        const gy = pointer.gy;
        if (eraseStrokeLastGx === ERASE_LAST_UNSET) {
          tryEraseCellDuringStroke(gx, gy);
          eraseStrokeLastGx = gx;
          eraseStrokeLastGy = gy;
        } else if (gx !== eraseStrokeLastGx || gy !== eraseStrokeLastGy) {
          eraseGridLine(eraseStrokeLastGx, eraseStrokeLastGy, gx, gy);
          eraseStrokeLastGx = gx;
          eraseStrokeLastGy = gy;
        }
      }
    }
    if (mode === "build") {
      if (
        pointer.gx !== lastHoverForPlacement.gx ||
        pointer.gy !== lastHoverForPlacement.gy ||
        selectedTile !== lastHoverForPlacement.tile
      ) {
        lastHoverForPlacement = { gx: pointer.gx, gy: pointer.gy, tile: selectedTile };
        const check = canPlaceTile(pointer.gx, pointer.gy, selectedTile);
        pointer.canPlace = check.ok;
        pointer.reason = check.reason;
      }
    } else {
      pointer.canPlace = false;
      pointer.reason = "";
    }
    if (mode === "build" && pointer.over && inBounds(pointer.gx, pointer.gy)) {
      if (pendingLinkSource) {
        const label = pendingLinkSource.type === Tile.timedDoor ? "door" : "switch";
        elRunHint.textContent = `Pick destination for ${label} at ${pendingLinkSource.x},${pendingLinkSource.y}.`;
      } else if (textPlacementMode) {
        elRunHint.textContent = "Click a cell to add or edit label text.";
      } else {
        const ti = TileInfo[selectedTile];
        elRunHint.textContent = pointer.canPlace
          ? `${TilePaletteIcon[selectedTile] || ""} ${ti.name} — ${ti.hint}`
          : pointer.reason || `Cannot place ${ti.name} here.`;
      }
    }
    if (mode === "play" && isAdminUser && play && !play.ended) {
      const { x: cx, y: cy } = eventClientPoint(e);
      const w = clientToPlayWorld(cx, cy);
      if (w && (e.buttons & 1) === 1) play.adminFlyTarget = w;
      else play.adminFlyTarget = null;
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "build") return;
    if (e.button === 1) {
      e.preventDefault();
      buildPanPointerId = e.pointerId;
      buildPanLastClient = { x: e.clientX, y: e.clientY };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (e.button === 0) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const { gx, gy } = canvasToGrid(e);
    if (!inBounds(gx, gy)) return;

    if (e.button === 0 && e.altKey) {
      buildMarqueeDrag = true;
      buildMarquee = { x0: gx, y0: gy, x1: gx, y1: gy };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (e.button === 0 && e.shiftKey && !e.altKey) {
      if (tileAllowsTestSpawn(gx, gy)) {
        testSpawnCell = { gx, gy };
        showToast("Test spawn here when you Play (editor levels only).", 2400);
      } else {
        showToast("Shift+click a solid tile (platform, start, …) for test spawn.");
      }
      return;
    }

    if (e.button === 0 && textPlacementMode) {
      textPlacementMode = false;
      if (elAddTextBtn) elAddTextBtn.classList.remove("primary");
      if (isProtectedAutoPlatformCell(gx, gy)) {
        showToast("That tile is reserved for Start/Goal support.");
        return;
      }
      const key = `${gx},${gy}`;
      const cur = levelTexts[key] || "";
      const raw = window.prompt("Label text (empty = remove):", cur);
      if (raw === null) return;
      const t = raw.trim().slice(0, MAX_LEVEL_TEXT_LEN);
      if (!t) {
        delete levelTexts[key];
      } else {
        if (Object.keys(levelTexts).length >= MAX_LEVEL_TEXTS && !levelTexts[key]) {
          showToast(`At most ${MAX_LEVEL_TEXTS} text labels.`);
          return;
        }
        levelTexts[key] = t;
      }
      commitGridMutation();
      scheduleValidate();
      return;
    }

    if (e.button === 0 && pendingLinkSource) {
      const src = pendingLinkSource;
      pendingLinkSource = null;
      if (gx === src.x && gy === src.y) {
        delete levelLinks[`${src.x},${src.y}`];
        commitGridMutation();
        showToast("Link cleared (same tile selected).", 1500);
        return;
      }
      levelLinks[`${src.x},${src.y}`] = { x: gx, y: gy };
      commitGridMutation();
      showToast(`${src.type === Tile.timedDoor ? "Door" : "Switch"} destination set.`);
      return;
    }

    const isErase = e.button === 2 || selectedTile === Tile.empty;
    if (isErase) {
      if (isProtectedAutoPlatformCell(gx, gy)) {
        showToast("The platform under Start or Goal can’t be erased.");
        return;
      }
      if (e.button === 2) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      buildEraseActive = true;
      buildErasePointerId = e.pointerId;
      buildEraseStrokeDirty = false;
      eraseStrokeLastGx = ERASE_LAST_UNSET;
      eraseStrokeLastGy = ERASE_LAST_UNSET;
      tryEraseCellDuringStroke(gx, gy);
      eraseStrokeLastGx = gx;
      eraseStrokeLastGy = gy;
      return;
    }

    const check = canPlaceTile(gx, gy, selectedTile);
    if (!check.ok) {
      showToast(check.reason || "Can't place here.");
      return;
    }

    placeTile(gx, gy, selectedTile);
    if (selectedTile === Tile.pressureSwitch || selectedTile === Tile.timedDoor) {
      pendingLinkSource = { x: gx, y: gy, type: selectedTile };
      showToast("Now click a destination cell.", 1800);
    }
  });

  function eraseGridLine(x0, y0, x1, y1) {
    let x0c = clamp(x0, 0, COLS - 1);
    let y0c = clamp(y0, 0, ROWS - 1);
    const x1c = clamp(x1, 0, COLS - 1);
    const y1c = clamp(y1, 0, ROWS - 1);
    let dx = Math.abs(x1c - x0c);
    let dy = Math.abs(y1c - y0c);
    const sx = x0c < x1c ? 1 : -1;
    const sy = y0c < y1c ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      tryEraseCellDuringStroke(x0c, y0c);
      if (x0c === x1c && y0c === y1c) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0c += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0c += sy;
      }
    }
  }

  function tryEraseCellDuringStroke(gx, gy) {
    if (!inBounds(gx, gy)) return;
    if (isProtectedAutoPlatformCell(gx, gy)) return;
    const key = `${gx},${gy}`;
    const hadText = !!levelTexts[key];
    const hadTile = grid[gy][gx] !== Tile.empty;
    if (!hadTile && !hadText) return;
    const prev = grid[gy][gx];
    grid[gy][gx] = Tile.empty;
    delete levelTexts[key];
    delete levelLinks[key];
    if (pendingLinkSource && pendingLinkSource.x === gx && pendingLinkSource.y === gy) pendingLinkSource = null;
    if (hadTile) eraseFx.push({ gx, gy, t0: performance.now(), prev });
    buildEraseStrokeDirty = true;
  }

  function finishEraseStrokeIfNeeded() {
    if (!buildEraseStrokeDirty) return;
    AudioSys.sfx.erase();
    commitGridMutation();
    buildEraseStrokeDirty = false;
    scheduleValidate();
  }

  canvas.addEventListener("pointerup", (e) => {
    if (buildPanPointerId === e.pointerId) buildPanPointerId = null;
    buildMarqueeDrag = false;
    if (buildErasePointerId === e.pointerId) {
      buildErasePointerId = null;
      buildEraseActive = false;
      eraseStrokeLastGx = ERASE_LAST_UNSET;
      eraseStrokeLastGy = ERASE_LAST_UNSET;
      finishEraseStrokeIfNeeded();
    }
    try {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  canvas.addEventListener("pointercancel", (e) => {
    if (buildPanPointerId === e.pointerId) buildPanPointerId = null;
    buildMarqueeDrag = false;
    if (buildErasePointerId === e.pointerId) {
      buildErasePointerId = null;
      buildEraseActive = false;
      eraseStrokeLastGx = ERASE_LAST_UNSET;
      eraseStrokeLastGy = ERASE_LAST_UNSET;
      finishEraseStrokeIfNeeded();
    }
    try {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (mode !== "build" || e.touches.length !== 2) return;
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      buildTwoTouchPan = {
        cx: (a.clientX + b.clientX) / 2,
        cy: (a.clientY + b.clientY) / 2,
        camX: buildCamX,
        camY: buildCamY,
      };
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!buildTwoTouchPan || e.touches.length < 2) return;
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      const sc = canvasBitmapScale();
      buildCamX = buildTwoTouchPan.camX - (cx - buildTwoTouchPan.cx) / sc;
      buildCamY = buildTwoTouchPan.camY - (cy - buildTwoTouchPan.cy) / sc;
      clampBuildCam();
    },
    { passive: false }
  );
  canvas.addEventListener("touchend", (e) => {
    if (!buildTwoTouchPan) return;
    if (e.touches.length < 2) buildTwoTouchPan = null;
  });
  canvas.addEventListener("touchcancel", () => {
    buildTwoTouchPan = null;
  });

  /** Auto-placed platform under Start / Goal (immutable except as platform). */
  function isProtectedAutoPlatformCell(gx, gy) {
    const s = findType(Tile.start);
    if (s && s.y < ROWS - 1 && gx === s.x && gy === s.y + 1) return true;
    const g = findType(Tile.goal);
    if (g && g.y < ROWS - 1 && gx === g.x && gy === g.y + 1) return true;
    const c = findType(Tile.checkpoint);
    if (c && c.y < ROWS - 1 && gx === c.x && gy === c.y + 1) return true;
    return false;
  }

  function ensurePlatformUnderStart(sx, sy) {
    if (sy < 0 || sy >= ROWS) return;
    const belowY = sy + 1;
    if (belowY >= ROWS) return;
    const cur = grid[belowY][sx];
    if (cur === Tile.goal || cur === Tile.start) return;
    grid[belowY][sx] = Tile.platform;
  }

  function ensurePlatformUnderGoal(gx, gy) {
    if (gy < 0 || gy >= ROWS) return;
    const belowY = gy + 1;
    if (belowY >= ROWS) return;
    const cur = grid[belowY][gx];
    if (cur === Tile.goal || cur === Tile.start) return;
    grid[belowY][gx] = Tile.platform;
  }

  function ensurePlatformUnderCheckpoint(cx, cy) {
    if (cy < 0 || cy >= ROWS) return;
    const belowY = cy + 1;
    if (belowY >= ROWS) return;
    const cur = grid[belowY][cx];
    if (cur !== Tile.empty && cur !== Tile.pathBlock) return;
    grid[belowY][cx] = Tile.platform;
  }

  function cloneLevelTexts() {
    return { ...levelTexts };
  }

  function serializeBuildState() {
    return JSON.stringify({ v: 2, flat: flattenGrid(grid), texts: cloneLevelTexts(), links: cloneLevelLinks() });
  }

  /** @returns {{ flat: TileType[], texts: Record<string, string>, links: Record<string, {x:number,y:number}> } | null} */
  function parseBuildStateJson(json) {
    try {
      const o = JSON.parse(json);
      if (o && o.v === 2 && Array.isArray(o.flat) && o.flat.length === COLS * ROWS && o.texts && typeof o.texts === "object") {
        const tx = /** @type {Record<string, string>} */ ({});
        for (const k of Object.keys(o.texts)) {
          const v = o.texts[k];
          if (typeof v === "string" && v.trim()) tx[k] = v.trim().slice(0, MAX_LEVEL_TEXT_LEN);
        }
        const links = /** @type {Record<string, { x: number, y: number }>} */ ({});
        if (o.links && typeof o.links === "object") {
          for (const k of Object.keys(o.links)) {
            const v = o.links[k];
            if (!v || typeof v !== "object") continue;
            const x = Math.floor(Number(v.x));
            const y = Math.floor(Number(v.y));
            if (inBounds(x, y)) links[k] = { x, y };
          }
        }
        return { flat: o.flat.map((x) => normalizeImportedTileType(x)), texts: tx, links };
      }
      if (Array.isArray(o) && o.length === COLS * ROWS)
        return { flat: o.map((x) => normalizeImportedTileType(x)), texts: {}, links: {} };
    } catch {
      /* ignore */
    }
    return null;
  }

  function commitGridMutation() {
    const s = serializeBuildState();
    if (undoStack.length && undoStack[undoStack.length - 1] === s) return;
    undoStack.push(s);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;
    scheduleDraftPersist();
  }

  function resetUndoStacksToCurrent() {
    undoStack.length = 0;
    redoStack.length = 0;
    undoStack.push(serializeBuildState());
  }

  function applyGridSnapshotJson(json) {
    const p = parseBuildStateJson(json);
    if (!p) return false;
    inflateGrid(grid, p.flat, COLS, ROWS);
    levelTexts = p.texts;
    levelLinks = p.links || {};
    pendingLinkSource = null;
    ensureCheckpointInWorldGrid();
    scheduleValidate();
    return true;
  }

  function undoBuildStep() {
    if (mode !== "build" || undoStack.length < 2) return;
    const cur = undoStack.pop();
    if (cur) redoStack.push(cur);
    const prev = undoStack[undoStack.length - 1];
    if (prev && applyGridSnapshotJson(prev)) showToast("Undo", 650);
  }

  function redoBuildStep() {
    if (mode !== "build" || redoStack.length === 0) return;
    const next = redoStack.pop();
    if (!next || !applyGridSnapshotJson(next)) return;
    undoStack.push(next);
    showToast("Redo", 650);
  }

  // PERF 3: Dirty flag for draft auto-save — skip stringify if grid has not changed.
  let _lastDraftHash = "";

  function _buildGridHash() {
    // Fast hash: join first 32 cells + length — catches most edits without full stringify.
    const flat = flattenGrid(grid);
    let h = String(flat.length);
    for (let i = 0; i < Math.min(32, flat.length); i++) h += flat[i];
    h += flat[flat.length - 1] || "";
    return h;
  }

  function scheduleDraftPersist() {
    if (typeof window === "undefined") return;
    if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(() => {
      draftSaveTimer = 0;
      const hash = _buildGridHash();
      if (hash === _lastDraftHash) return; // PERF 3: No changes, skip full stringify.
      _lastDraftHash = hash;
      try {
        localStorage.setItem(
          DRAFT_GRID_KEY,
          JSON.stringify({ v: 2, t: Date.now(), flat: flattenGrid(grid), texts: cloneLevelTexts(), links: cloneLevelLinks(), rotations: tileRotations })
        );
      } catch {
        /* quota */
      }
    }, 500);
  }

  function maybeRestoreBuildDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_GRID_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || (o.v !== 1 && o.v !== 2) || !Array.isArray(o.flat) || o.flat.length !== COLS * ROWS) return;
      if (o.flat.every((c) => c === Tile.empty)) return;
      const cur = JSON.stringify(flattenGrid(grid));
      if (cur === JSON.stringify(o.flat)) return;
      showToast('Unsaved build found — open Levels → "Restore draft" to load it.', 6000);
    } catch {
      /* ignore */
    }
  }

  function offerDraftRestoreNow() {
    try {
      const raw = localStorage.getItem(DRAFT_GRID_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || (o.v !== 1 && o.v !== 2) || !Array.isArray(o.flat) || o.flat.length !== COLS * ROWS) return;
      if (o.flat.every((c) => c === Tile.empty)) return;
      if (!confirm("Restore unsaved build from this browser?")) return;
      inflateGrid(grid, o.flat, COLS, ROWS);
      levelTexts =
        o.v === 2 && o.texts && typeof o.texts === "object"
          ? (() => {
              const tx = /** @type {Record<string, string>} */ ({});
              for (const k of Object.keys(o.texts)) {
                const v = o.texts[k];
                if (typeof v === "string" && v.trim()) tx[k] = v.trim().slice(0, MAX_LEVEL_TEXT_LEN);
              }
              return tx;
            })()
          : {};
      levelLinks =
        o.v === 2 && o.links && typeof o.links === "object"
          ? (() => {
              const out = /** @type {Record<string, { x: number, y: number }>} */ ({});
              for (const k of Object.keys(o.links)) {
                const v = o.links[k];
                if (!v || typeof v !== "object") continue;
                const x = Math.floor(Number(v.x));
                const y = Math.floor(Number(v.y));
                if (inBounds(x, y)) out[k] = { x, y };
              }
              return out;
            })()
          : {};
      pendingLinkSource = null;
      ensureCheckpointInWorldGrid();
      resetUndoStacksToCurrent();
      scheduleValidate();
      showToast("Draft restored.");
    } catch {
      /* ignore */
    }
  }

  function copyMarqueeToClipboard() {
    if (!buildMarquee) {
      showToast("Alt-drag on the grid to select a region, then Ctrl+C.");
      return;
    }
    const x0 = Math.min(buildMarquee.x0, buildMarquee.x1);
    const y0 = Math.min(buildMarquee.y0, buildMarquee.y1);
    const x1 = Math.max(buildMarquee.x0, buildMarquee.x1);
    const y1 = Math.max(buildMarquee.y0, buildMarquee.y1);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    /** @type {TileType[]} */
    const tiles = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push(inBounds(x, y) ? grid[y][x] : Tile.empty);
    clipboardRegion = { w, h, tiles };
    showToast(`Copied ${w}×${h} tiles`, 1200);
  }

  function pasteClipboardAt(gx, gy) {
    if (!clipboardRegion) {
      showToast("Nothing copied. Alt-drag to select, Ctrl+C.");
      return;
    }
    const { w, h, tiles } = clipboardRegion;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const tx = gx + i;
        const ty = gy + j;
        if (!inBounds(tx, ty)) continue;
        if (isProtectedAutoPlatformCell(tx, ty)) continue;
        const t = tiles[j * w + i];
        if (t === Tile.start) clearType(Tile.start);
        if (t === Tile.goal) clearType(Tile.goal);
        if (t === Tile.checkpoint) clearType(Tile.checkpoint);
        grid[ty][tx] = t;
        if (!isPuzzleTileType(t)) delete levelLinks[`${tx},${ty}`];
        if (t === Tile.start) ensurePlatformUnderStart(tx, ty);
        if (t === Tile.goal) ensurePlatformUnderGoal(tx, ty);
        if (t === Tile.checkpoint) ensurePlatformUnderCheckpoint(tx, ty);
      }
    }
    commitGridMutation();
    scheduleValidate();
    showToast("Pasted selection.", 1200);
  }

  function exportGridJson() {
    // BUG FIX 8: Include schema version stamp and known tile-type list so future imports
    // can detect and remap renamed tile types rather than silently mapping to wrong tiles.
    // ADD 4: Include tags array in exported level JSON.
    const levelTagsRaw = typeof window._currentLevelTags === "string" ? window._currentLevelTags : "";
    const levelTagsArr = levelTagsRaw.split(",").map((t) => t.trim().toLowerCase().slice(0, 20)).filter(Boolean).slice(0, 5);
    const payload = {
      v: 2,
      schemaVersion: 3,
      exportedAt: Date.now(),
      tileTypeManifest: Object.values(Tile).filter((t) => typeof t === "string"),
      name: "My level",
      tags: levelTagsArr,
      cols: COLS,
      rows: ROWS,
      tilesFlat: flattenGrid(grid),
      tileRotations, // ADD 6: Persist per-tile rotations in export.
      texts: cloneLevelTexts(),
      links: cloneLevelLinks(),
    };
    const text = JSON.stringify(payload);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("Level JSON copied to clipboard.", 2000),
        () => window.prompt("Copy this level JSON:", text)
      );
    } else {
      window.prompt("Copy this level JSON:", text);
    }
  }

  function importGridFromJsonText(text, silent = false) {
    let o;
    try {
      o = JSON.parse(text);
    } catch {
      if (!silent) showToast("Invalid level JSON.");
      return;
    }
    // BUG FIX 8: Accept v1, v2, and v3 (schemaVersion field). Unknown tile types fall through normaliseImportedTileType.
    if (!o || (o.v !== 1 && o.v !== 2 && !(o.v === 2 && o.schemaVersion >= 3)) || !Array.isArray(o.tilesFlat)) {
      if (!o || !Array.isArray(o.tilesFlat)) {
        if (!silent) showToast("Invalid level JSON.");
        return;
      }
    }
    const c = Number(o.cols) || COLS;
    const r = Number(o.rows) || ROWS;
    inflateGrid(grid, o.tilesFlat.map((x) => normalizeImportedTileType(x)), c, r);
    levelTexts =
      o.v === 2 && o.texts && typeof o.texts === "object"
        ? (() => {
            const tx = /** @type {Record<string, string>} */ ({});
            for (const k of Object.keys(o.texts)) {
              const v = o.texts[k];
              if (typeof v === "string" && v.trim()) tx[k] = v.trim().slice(0, MAX_LEVEL_TEXT_LEN);
            }
            return tx;
          })()
        : {};
    levelLinks =
      o.v === 2 && o.links && typeof o.links === "object"
        ? (() => {
            const out = /** @type {Record<string, { x: number, y: number }>} */ ({});
            for (const k of Object.keys(o.links)) {
              const v = o.links[k];
              if (!v || typeof v !== "object") continue;
              const x = Math.floor(Number(v.x));
              const y = Math.floor(Number(v.y));
              if (inBounds(x, y)) out[k] = { x, y };
            }
            return out;
          })()
        : {};
    pendingLinkSource = null;
    ensureCheckpointInWorldGrid();
    resetBuildCameraDefault();
    resetUndoStacksToCurrent();
    testSpawnCell = null;
    scheduleValidate();
    if (!silent) showToast("Level imported.");
  }

  function tileAllowsTestSpawn(gx, gy) {
    if (!inBounds(gx, gy)) return false;
    const t = grid[gy][gx];
    return (
      t === Tile.platform ||
      t === Tile.start ||
      t === Tile.goal ||
      t === Tile.checkpoint ||
      t === Tile.jumppad ||
      t === Tile.speedBoost ||
      t === Tile.pathBlock ||
      t === Tile.mud ||
      t === Tile.betrayal ||
      t === Tile.pressureSwitch ||
      t === Tile.timedDoor
    );
  }

  function placeTile(gx, gy, t) {
    if (t === Tile.start) clearType(Tile.start);
    if (t === Tile.goal) clearType(Tile.goal);
    if (t === Tile.checkpoint) clearType(Tile.checkpoint);
    grid[gy][gx] = t;
    // ADD 6: Store current brush rotation for this cell.
    if (currentBrushRotation !== 0) tileRotations[`${gx},${gy}`] = currentBrushRotation;
    else delete tileRotations[`${gx},${gy}`];
    if (!isPuzzleTileType(t)) delete levelLinks[`${gx},${gy}`];
    if (t === Tile.start) ensurePlatformUnderStart(gx, gy);
    if (t === Tile.goal) ensurePlatformUnderGoal(gx, gy);
    if (t === Tile.checkpoint) ensurePlatformUnderCheckpoint(gx, gy);
    placeFx.push({ gx, gy, t0: performance.now() });
    AudioSys.sfx.place();
    commitGridMutation();
    scheduleValidate();
  }

  function clearType(t) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x] === t) {
          grid[y][x] = Tile.empty;
          delete tileRotations[`${x},${y}`]; // ADD 6: Clear rotation with tile.
        }
      }
    }
  }

  function canPlaceTile(gx, gy, t) {
    if (!inBounds(gx, gy)) return { ok: false, reason: "" };
    if (mode !== "build") return { ok: false, reason: "Build mode only." };

    if (isProtectedAutoPlatformCell(gx, gy)) {
      if (t === Tile.platform) return { ok: true, reason: "" };
      if (t === Tile.empty) return { ok: false, reason: "The platform under Start is protected." };
      return { ok: false, reason: "Can’t change the platform under Start." };
    }

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
    placeFx.length = 0;
    testSpawnCell = null;
    levelTexts = {};
    levelLinks = {};
    tileRotations = {}; // ADD 6: Clear rotations with grid.
    pendingLinkSource = null;
    textPlacementMode = false;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x] = Tile.empty;
    AudioSys.sfx.clear();
    commitGridMutation();
    scheduleValidate();
  }

  // ---------- Built-in levels ----------
  /** @typedef {"tutorial"|"easy"|"medium"|"hard"} DifficultyTier */
  const BUILTIN_LEVELS = makeBuiltinLevels();

  function makeBuiltinLevels() {
    /** @type {{id:string,name:string,tier:DifficultyTier,tilesFlat:TileType[]}[]} */
    const levels = [];

    const easyPresetNames = /** @type {const} */ ([
      "Cobblestone Lane",
      "Daisy Patch",
      "Willow Hill",
      "Puddle Jump",
      "Slow Lane",
      "Brick Steps",
      "Rush Strip",
      "Snack Trail",
      "Tightrope",
      "One Big Bounce",
      "Twin Bridges",
      "Zigzag Drift",
      "Corner Spikes",
    ]);

    // --- Easy (20): 7 hand-authored + 13 preset formations ---
    levels.push({ id: "builtin_training", name: "Training Wheels", tier: "easy", tilesFlat: makeBuiltinTraining() });
    levels.push({ id: "builtin_gentle", name: "First Steps", tier: "easy", tilesFlat: makeBuiltinGentle() });
    levels.push({ id: "builtin_sunny", name: "Sunny Path", tier: "easy", tilesFlat: makeBuiltinSunny() });
    levels.push({ id: "builtin_hopskip", name: "Hop Skip", tier: "easy", tilesFlat: makeBuiltinHopSkip() });
    levels.push({ id: "builtin_gentlerise", name: "Gentle Rise", tier: "easy", tilesFlat: makeBuiltinGentleRise() });
    levels.push({ id: "builtin_saferun", name: "Safe Run", tier: "easy", tilesFlat: makeBuiltinSafeRun() });
    levels.push({ id: "builtin_beginner", name: "Beginner's Luck", tier: "easy", tilesFlat: makeBuiltinBeginner() });
    for (let i = 0; i < 13; i++) {
      levels.push({
        id: `builtin_easy_pre_${String(i + 1).padStart(2, "0")}`,
        name: easyPresetNames[i],
        tier: "easy",
        tilesFlat: makeBuiltinEasyPresetFlat(i),
      });
    }

    // --- Medium (8): hand-authored only ---
    levels.push({ id: "builtin_betrayal", name: "Betrayal Alley", tier: "medium", tilesFlat: makeBuiltinBetrayal() });
    levels.push({ id: "builtin_mid", name: "Spike Row", tier: "medium", tilesFlat: makeBuiltinMid() });
    levels.push({ id: "builtin_doublecross", name: "Double Cross", tier: "medium", tilesFlat: makeBuiltinDoubleCross() });
    levels.push({ id: "builtin_midclimb", name: "Mid Climb", tier: "medium", tilesFlat: makeBuiltinMidClimb() });
    levels.push({ id: "builtin_hexlane", name: "Hex Lane", tier: "medium", tilesFlat: makeBuiltinHexLane() });
    levels.push({ id: "builtin_spikegauntlet", name: "Spike Gauntlet", tier: "medium", tilesFlat: makeBuiltinSpikeGauntlet() });
    levels.push({ id: "builtin_stepping", name: "Stepping Stones", tier: "medium", tilesFlat: makeBuiltinStepping() });
    levels.push({ id: "builtin_bridge", name: "The Bridge", tier: "medium", tilesFlat: makeBuiltinBridge() });

    // --- Hard (8): hand-authored only ---
    levels.push({ id: "builtin_chaos", name: "Hex Hop", tier: "hard", tilesFlat: makeBuiltinHexHop() });
    levels.push({ id: "builtin_gauntlet", name: "Gauntlet", tier: "hard", tilesFlat: makeBuiltinGauntlet() });
    levels.push({ id: "builtin_summit", name: "Summit", tier: "hard", tilesFlat: makeBuiltinSummit() });
    levels.push({ id: "builtin_chaosrun", name: "Chaos Run", tier: "hard", tilesFlat: makeBuiltinChaosRun() });
    levels.push({ id: "builtin_finaltest", name: "Final Test", tier: "hard", tilesFlat: makeBuiltinFinalTest() });
    levels.push({ id: "builtin_nomercy", name: "No Mercy", tier: "hard", tilesFlat: makeBuiltinNoMercy() });
    levels.push({ id: "builtin_tower", name: "Tower", tier: "hard", tilesFlat: makeBuiltinTower() });
    levels.push({ id: "builtin_endurance", name: "Endurance", tier: "hard", tilesFlat: makeBuiltinEndurance() });

    // --- Tutorial (5) ---
    levels.push({ id: "builtin_tut_spikes", name: "Tutorial: Spikes", tier: "tutorial", tilesFlat: makeBuiltinTutSpikes() });
    levels.push({ id: "builtin_tut_pad", name: "Tutorial: Jump pads", tier: "tutorial", tilesFlat: makeBuiltinTutPad() });
    levels.push({ id: "builtin_tut_hex", name: "Tutorial: Hex", tier: "tutorial", tilesFlat: makeBuiltinTutHex() });
    levels.push({ id: "builtin_tut_lava", name: "Tutorial: Lava", tier: "tutorial", tilesFlat: makeBuiltinTutLava() });
    levels.push({ id: "builtin_tut_platform", name: "Tutorial: Platforms", tier: "tutorial", tilesFlat: makeBuiltinTutPlatform() });
    return levels;
  }

  function makeEmptyFlat() {
    /** @type {TileType[]} */
    const out = [];
    for (let i = 0; i < LEGACY_COLS * LEGACY_ROWS; i++) out.push(Tile.empty);
    return out;
  }


  /**
   * Extra easy-tier preset layouts (same grid size as other built-ins).
   * @param {number} slot 0-based index (0–12)
   */
  function makeBuiltinEasyPresetFlat(slot) {
    const f = makeEmptyFlat();
    const W = LEGACY_COLS;
    const H = LEGACY_ROWS;
    const at = (x, y) => y * W + x;
    const set = (x, y, t) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      const i = at(x, y);
      if (f[i] === Tile.start || f[i] === Tile.goal) return;
      f[i] = t;
    };
    const floorY = H - 2;
    const runY = H - 3;

    const fullFloor = () => {
      for (let x = 0; x < W; x++) f[at(x, floorY)] = Tile.platform;
    };

    const placeGoal = (gx, gy) => {
      f[at(gx, gy)] = Tile.goal;
      if (gy < floorY) f[at(gx, gy + 1)] = Tile.platform;
    };

    switch (slot) {
        case 0: {
          // Cobblestone Lane — spaced spikes on a long runway
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x = 6; x <= 20; x += 4) set(x, runY, Tile.spikes);
          placeGoal(24, runY);
          break;
        }
        case 1: {
          // Daisy Patch — upper platforms + sparse floor spikes
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x of [9, 13, 17]) {
            set(x, H - 5, Tile.platform);
            set(x + 1, H - 5, Tile.platform);
          }
          for (let x of [6, 10, 14, 18]) set(x, runY, Tile.spikes);
          placeGoal(26, runY);
          break;
        }
        case 2: {
          // Willow Hill — ramping platforms to a raised goal
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let i = 0; i < 5; i++) {
            set(10 + i * 2, runY - 1 - i, Tile.platform);
            set(10 + i * 2 + 1, runY - 1 - i, Tile.platform);
          }
          set(24, runY - 3, Tile.goal);
          set(24, runY - 2, Tile.platform);
          break;
        }
        case 3: {
          // Puddle Jump — mud patches slow the run
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x of [6, 7, 8, 14, 15, 19, 20]) set(x, runY, Tile.mud);
          placeGoal(24, runY);
          break;
        }
        case 4: {
          // Slow Lane — mud + a few spikes
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x = 6; x <= 20; x += 2) set(x, runY, Tile.mud);
          set(11, runY, Tile.spikes);
          set(15, runY, Tile.spikes);
          placeGoal(24, runY);
          break;
        }
        case 5: {
          // Brick Steps — brick stair platforms to goal
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let k = 0; k < 5; k++) {
            const px = 8 + k * 3;
            const py = runY - k;
            set(px, py, Tile.platform);
            set(px + 1, py, Tile.platform);
          }
          set(24, runY - 5, Tile.goal);
          set(24, runY - 4, Tile.platform);
          break;
        }
        case 6: {
          // Rush Strip — speed boosts between spike pairs
          fullFloor();
          f[at(2, runY)] = Tile.start;
          set(8, runY, Tile.speedBoost);
          set(9, runY, Tile.speedBoost);
          set(10, runY, Tile.spikes);
          set(11, runY, Tile.spikes);
          set(16, runY, Tile.speedBoost);
          set(17, runY, Tile.speedBoost);
          set(18, runY, Tile.spikes);
          placeGoal(26, runY);
          break;
        }
        case 7: {
          // Snack Trail — food pickups with one spike trap
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x = 8; x <= 18; x += 2) set(x, runY, Tile.food);
          set(12, runY, Tile.spikes);
          placeGoal(24, runY);
          break;
        }
        case 8: {
          // Tightrope — spike “rails” on the sides, safe center
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x = 4; x <= 22; x++) {
            if (x < 10 || x > 18) set(x, runY, Tile.spikes);
          }
          placeGoal(26, runY);
          break;
        }
        case 9: {
          // One Big Bounce — pad over a spike cluster
          fullFloor();
          f[at(2, runY)] = Tile.start;
          set(11, runY, Tile.jumppad);
          set(14, runY, Tile.spikes);
          set(15, runY, Tile.spikes);
          set(16, runY, Tile.spikes);
          placeGoal(24, runY);
          break;
        }
        case 10: {
          // Twin Bridges — two elevated platform spans
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x = 9; x <= 12; x++) set(x, H - 5, Tile.platform);
          for (let x = 14; x <= 17; x++) set(x, H - 4, Tile.platform);
          set(13, runY, Tile.spikes);
          placeGoal(26, runY);
          break;
        }
        case 11: {
          // Zigzag Drift — zigzag mid-air platforms over floor spikes
          fullFloor();
          f[at(2, runY)] = Tile.start;
          set(8, runY, Tile.platform);
          set(12, H - 5, Tile.platform);
          set(16, runY, Tile.platform);
          set(20, H - 5, Tile.platform);
          for (let x of [5, 9, 13, 17]) set(x, runY, Tile.spikes);
          placeGoal(26, runY);
          break;
        }
        default: {
          // Corner Spikes — clusters at the ends and mid pinch
          fullFloor();
          f[at(2, runY)] = Tile.start;
          for (let x of [4, 5, 24, 25]) set(x, runY, Tile.spikes);
          for (let x of [10, 11, 18, 19]) set(x, runY, Tile.spikes);
          placeGoal(26, runY);
          break;
        }
    }

    ensureCheckpointInLegacyFlat(f);
    return f;
  }

  function makeBuiltinTutSpikes() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 3, Tile.goal);
    set(9, LEGACY_ROWS - 3, Tile.checkpoint);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(14, LEGACY_ROWS - 3, Tile.spikes);
    set(15, LEGACY_ROWS - 3, Tile.spikes);
    return f;
  }

  function makeBuiltinTutPad() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 5, Tile.goal);
    set(8, LEGACY_ROWS - 3, Tile.checkpoint);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(12, LEGACY_ROWS - 3, Tile.jumppad);
    for (let x = 13; x < 20; x++) set(x, LEGACY_ROWS - 4, Tile.platform);
    return f;
  }

  function makeBuiltinTutHex() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 3, Tile.goal);
    set(7, LEGACY_ROWS - 3, Tile.checkpoint);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(16, LEGACY_ROWS - 3, Tile.hex);
    return f;
  }

  function makeBuiltinTutLava() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 3, Tile.goal);
    set(10, LEGACY_ROWS - 3, Tile.checkpoint);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(14, LEGACY_ROWS - 3, Tile.lava);
    set(15, LEGACY_ROWS - 3, Tile.lava);
    return f;
  }

  function makeBuiltinTutPlatform() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 3, Tile.goal);
    set(11, LEGACY_ROWS - 3, Tile.checkpoint);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(17, LEGACY_ROWS - 4, Tile.platform);
    set(18, LEGACY_ROWS - 4, Tile.platform);
    return f;
  }

  function makeBuiltinTraining() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, LEGACY_ROWS - 3, Tile.goal);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(12, LEGACY_ROWS - 3, Tile.jumppad);
    set(18, LEGACY_ROWS - 3, Tile.spikes);
    set(19, LEGACY_ROWS - 3, Tile.spikes);
    set(24, LEGACY_ROWS - 3, Tile.jumppad);
    return f;
  }

  function makeBuiltinBetrayal() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 4, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 7, Tile.goal);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    // Staggered platforms up
    for (let i = 0; i < 8; i++) set(8 + i * 3, LEGACY_ROWS - 5 - i, Tile.platform);
    set(14, LEGACY_ROWS - 6, Tile.jumppad);
    set(22, LEGACY_ROWS - 8, Tile.hex);
    set(26, LEGACY_ROWS - 9, Tile.spikes);
    set(27, LEGACY_ROWS - 9, Tile.spikes);
    return f;
  }

  function makeBuiltinHexHop() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, 6, Tile.goal);
    for (let x = 1; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(6 + i * 2, LEGACY_ROWS - 6 - Math.floor(i / 2), Tile.hex);
    for (let i = 0; i < 10; i++) set(8 + i * 2, LEGACY_ROWS - 5 - Math.floor(i / 2), Tile.platform);
    set(10, LEGACY_ROWS - 7, Tile.jumppad);
    set(20, LEGACY_ROWS - 10, Tile.jumppad);
    set(28, LEGACY_ROWS - 12, Tile.jumppad);
    return f;
  }

  function makeBuiltinGentle() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 4, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let x = 4; x < LEGACY_COLS - 6; x += 4) set(x, LEGACY_ROWS - 3, Tile.platform);
    set(14, LEGACY_ROWS - 4, Tile.jumppad);
    set(22, LEGACY_ROWS - 3, Tile.spikes);
    return f;
  }

  function makeBuiltinMid() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 4, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 8, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 12; i++) set(4 + i * 2, LEGACY_ROWS - 4 - (i % 3), Tile.platform);
    set(10, LEGACY_ROWS - 5, Tile.jumppad);
    set(16, LEGACY_ROWS - 5, Tile.spikes);
    set(17, LEGACY_ROWS - 5, Tile.spikes);
    set(24, LEGACY_ROWS - 7, Tile.hex);
    return f;
  }

  function makeBuiltinGauntlet() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, 5, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(4 + i * 2, LEGACY_ROWS - 4 - Math.floor(i / 2), Tile.platform);
    for (let i = 0; i < 8; i++) set(6 + i * 3, LEGACY_ROWS - 6 - i, Tile.platform);
    set(8, LEGACY_ROWS - 7, Tile.jumppad);
    set(14, LEGACY_ROWS - 9, Tile.hex);
    set(18, LEGACY_ROWS - 10, Tile.spikes);
    set(19, LEGACY_ROWS - 10, Tile.spikes);
    set(26, LEGACY_ROWS - 12, Tile.jumppad);
    set(28, LEGACY_ROWS - 11, Tile.hex);
    return f;
  }

  function makeBuiltinSunny() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 3, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let x = 6; x < LEGACY_COLS - 8; x += 5) set(x, LEGACY_ROWS - 4, Tile.platform);
    return f;
  }
  function makeBuiltinHopSkip() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, LEGACY_ROWS - 5, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(8, LEGACY_ROWS - 4, Tile.platform);
    set(14, LEGACY_ROWS - 5, Tile.platform);
    set(20, LEGACY_ROWS - 4, Tile.jumppad);
    set(26, LEGACY_ROWS - 5, Tile.platform);
    return f;
  }
  function makeBuiltinGentleRise() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 7, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(4 + i * 2, LEGACY_ROWS - 3 - (i % 2), Tile.platform);
    set(16, LEGACY_ROWS - 6, Tile.jumppad);
    set(24, LEGACY_ROWS - 7, Tile.platform);
    return f;
  }
  function makeBuiltinSafeRun() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, LEGACY_ROWS - 4, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(10, LEGACY_ROWS - 3, Tile.platform);
    set(18, LEGACY_ROWS - 3, Tile.spikes);
    set(22, LEGACY_ROWS - 4, Tile.platform);
    return f;
  }
  function makeBuiltinBeginner() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 5, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    set(8, LEGACY_ROWS - 4, Tile.platform);
    set(14, LEGACY_ROWS - 4, Tile.jumppad);
    set(20, LEGACY_ROWS - 5, Tile.platform);
    set(24, LEGACY_ROWS - 4, Tile.hex);
    return f;
  }
  function makeBuiltinDoubleCross() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 4, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 8, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 8; i++) set(4 + i * 3, LEGACY_ROWS - 4 - (i % 2), Tile.platform);
    set(12, LEGACY_ROWS - 6, Tile.jumppad);
    set(18, LEGACY_ROWS - 6, Tile.hex);
    set(24, LEGACY_ROWS - 7, Tile.spikes);
    set(25, LEGACY_ROWS - 7, Tile.spikes);
    return f;
  }
  function makeBuiltinMidClimb() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, LEGACY_ROWS - 10, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 12; i++) set(3 + i * 2, LEGACY_ROWS - 4 - Math.floor(i / 2), Tile.platform);
    set(14, LEGACY_ROWS - 8, Tile.jumppad);
    set(22, LEGACY_ROWS - 10, Tile.platform);
    return f;
  }
  function makeBuiltinHexLane() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, LEGACY_ROWS - 6, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 8; i++) set(6 + i * 2, LEGACY_ROWS - 4 - (i % 2), Tile.platform);
    set(10, LEGACY_ROWS - 5, Tile.hex);
    set(16, LEGACY_ROWS - 6, Tile.hex);
    set(22, LEGACY_ROWS - 5, Tile.jumppad);
    return f;
  }
  function makeBuiltinSpikeGauntlet() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 4, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 7, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(4 + i * 2, LEGACY_ROWS - 4 - (i % 2), Tile.platform);
    set(8, LEGACY_ROWS - 3, Tile.spikes);
    set(9, LEGACY_ROWS - 3, Tile.spikes);
    set(16, LEGACY_ROWS - 5, Tile.spikes);
    set(22, LEGACY_ROWS - 6, Tile.jumppad);
    set(26, LEGACY_ROWS - 7, Tile.platform);
    return f;
  }
  function makeBuiltinStepping() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, LEGACY_ROWS - 9, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(2 + i * 2, LEGACY_ROWS - 3 - Math.floor(i / 2), Tile.platform);
    set(12, LEGACY_ROWS - 7, Tile.jumppad);
    set(24, LEGACY_ROWS - 9, Tile.platform);
    return f;
  }
  function makeBuiltinBridge() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 5, Tile.start);
    set(LEGACY_COLS - 4, LEGACY_ROWS - 5, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let x = 2; x < LEGACY_COLS - 2; x++) set(x, LEGACY_ROWS - 4, Tile.platform);
    set(12, LEGACY_ROWS - 4, Tile.spikes);
    set(18, LEGACY_ROWS - 4, Tile.hex);
    set(24, LEGACY_ROWS - 4, Tile.jumppad);
    return f;
  }
  function makeBuiltinSummit() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, 4, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 16; i++) set(2 + i * 2, LEGACY_ROWS - 4 - Math.floor(i / 2), Tile.platform);
    set(14, LEGACY_ROWS - 10, Tile.jumppad);
    set(22, LEGACY_ROWS - 12, Tile.hex);
    set(26, LEGACY_ROWS - 6, Tile.platform);
    return f;
  }
  function makeBuiltinChaosRun() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 4, Tile.start);
    set(LEGACY_COLS - 4, 5, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 12; i++) set(4 + i * 2, LEGACY_ROWS - 4 - (i % 2), Tile.platform);
    for (let i = 0; i < 6; i++) set(8 + i * 3, LEGACY_ROWS - 8 - i, Tile.platform);
    set(10, LEGACY_ROWS - 9, Tile.hex);
    set(18, LEGACY_ROWS - 11, Tile.jumppad);
    set(24, LEGACY_ROWS - 7, Tile.spikes);
    set(26, LEGACY_ROWS - 6, Tile.platform);
    return f;
  }
  function makeBuiltinFinalTest() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, 6, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(3 + i * 2, LEGACY_ROWS - 4 - Math.floor(i / 2), Tile.platform);
    set(12, LEGACY_ROWS - 8, Tile.hex);
    set(18, LEGACY_ROWS - 10, Tile.jumppad);
    set(22, LEGACY_ROWS - 9, Tile.spikes);
    set(26, LEGACY_ROWS - 8, Tile.platform);
    return f;
  }
  function makeBuiltinNoMercy() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 4, Tile.start);
    set(LEGACY_COLS - 5, LEGACY_ROWS - 11, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 10; i++) set(4 + i * 2, LEGACY_ROWS - 4 - (i % 2), Tile.platform);
    for (let i = 0; i < 8; i++) set(8 + i * 2, LEGACY_ROWS - 8 - Math.floor(i / 2), Tile.platform);
    set(14, LEGACY_ROWS - 10, Tile.hex);
    set(20, LEGACY_ROWS - 11, Tile.jumppad);
    set(24, LEGACY_ROWS - 10, Tile.spikes);
    set(25, LEGACY_ROWS - 10, Tile.spikes);
    return f;
  }
  function makeBuiltinTower() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(14, 3, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let y = LEGACY_ROWS - 4; y >= 4; y -= 2) set(4, y, Tile.platform);
    for (let y = LEGACY_ROWS - 5; y >= 5; y -= 2) set(10, y, Tile.platform);
    for (let y = LEGACY_ROWS - 4; y >= 4; y -= 2) set(16, y, Tile.platform);
    set(6, LEGACY_ROWS - 6, Tile.jumppad);
    set(12, LEGACY_ROWS - 10, Tile.jumppad);
    set(14, 5, Tile.platform);
    return f;
  }
  function makeBuiltinEndurance() {
    const f = makeEmptyFlat();
    const set = (x, y, t) => (f[y * LEGACY_COLS + x] = t);
    set(2, LEGACY_ROWS - 3, Tile.start);
    set(LEGACY_COLS - 4, 5, Tile.goal);
    for (let x = 0; x < LEGACY_COLS; x++) set(x, LEGACY_ROWS - 2, Tile.platform);
    for (let i = 0; i < 14; i++) set(2 + i * 2, LEGACY_ROWS - 4 - (i % 3), Tile.platform);
    set(8, LEGACY_ROWS - 6, Tile.hex);
    set(14, LEGACY_ROWS - 8, Tile.jumppad);
    set(20, LEGACY_ROWS - 10, Tile.spikes);
    set(21, LEGACY_ROWS - 10, Tile.spikes);
    set(26, LEGACY_ROWS - 7, Tile.platform);
    return f;
  }

  /** Ensures legacy flat arrays (built-ins, random) contain exactly one checkpoint. */
  function ensureCheckpointInLegacyFlat(flat) {
    const W = LEGACY_COLS;
    const H = LEGACY_ROWS;
    /** @type {{ x: number, y: number }[]} */
    const found = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (flat[y * W + x] === Tile.checkpoint) found.push({ x, y });
      }
    }
    if (found.length > 1) {
      for (let i = 1; i < found.length; i++) {
        flat[found[i].y * W + found[i].x] = Tile.empty;
      }
    } else if (found.length === 1) {
      return;
    }
    let sx = 2;
    let sy = H - 3;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (flat[y * W + x] === Tile.start) {
          sx = x;
          sy = y;
        }
      }
    }
    for (let dx = 5; dx < 24; dx++) {
      const x = sx + dx;
      const y = sy;
      if (x >= W - 1) break;
      const i = y * W + x;
      const t = flat[i];
      if (t === Tile.empty || t === Tile.pathBlock) {
        flat[i] = Tile.checkpoint;
        return;
      }
    }
    for (let y = H - 2; y >= 0; y--) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (flat[i] === Tile.empty) {
          flat[i] = Tile.checkpoint;
          return;
        }
      }
    }
  }

  /** After loading any grid, guarantee exactly one checkpoint (for old saves / edge cases). */
  function ensureCheckpointInWorldGrid() {
    /** @type {{ x: number, y: number }[]} */
    const found = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x] === Tile.checkpoint) found.push({ x, y });
      }
    }
    if (found.length > 1) {
      for (let i = 1; i < found.length; i++) {
        grid[found[i].y][found[i].x] = Tile.empty;
      }
      ensurePlatformUnderCheckpoint(found[0].x, found[0].y);
    } else if (found.length === 1) {
      ensurePlatformUnderCheckpoint(found[0].x, found[0].y);
      return;
    }
    const s = findType(Tile.start) || { x: 2, y: ROWS - 3 };
    for (let dx = 5; dx < 40; dx++) {
      const x = s.x + dx;
      const y = s.y;
      if (!inBounds(x, y)) break;
      const t = grid[y][x];
      if (t === Tile.empty || t === Tile.pathBlock) {
        grid[y][x] = Tile.checkpoint;
        ensurePlatformUnderCheckpoint(x, y);
        return;
      }
    }
    for (let y = ROWS - 2; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x] === Tile.empty) {
          grid[y][x] = Tile.checkpoint;
          ensurePlatformUnderCheckpoint(x, y);
          return;
        }
      }
    }
  }

  function loadFlatIntoGrid(flat) {
    eraseFx.length = 0;
    placeFx.length = 0;
    levelTexts = {};
    levelLinks = {};
    pendingLinkSource = null;
    textPlacementMode = false;
    if (elAddTextBtn) elAddTextBtn.classList.remove("primary");
    const f = flat.slice();
    ensureCheckpointInLegacyFlat(f);
    inflateGrid(grid, f, LEGACY_COLS, LEGACY_ROWS);
    resetBuildCameraDefault();
    resetUndoStacksToCurrent();
    testSpawnCell = null;
    scheduleValidate();
    if (mode === "play") restartPlay();
  }

  // ---------- Validated level generation (reachability) ----------
  /** @param {TileType[][]} g */
  function isSolidTile(g, x, y) {
    if (!inBounds(x, y)) return false;
    const t = g[y][x];
    return t === Tile.platform || t === Tile.jumppad || t === Tile.speedBoost || t === Tile.mud || t === Tile.betrayal;
  }

  /** Tiles that count as “ground” directly under the goal for validation. */
  function isGoalSupportTile(t) {
    return (
      t === Tile.platform ||
      t === Tile.jumppad ||
      t === Tile.speedBoost ||
      t === Tile.pathBlock ||
      t === Tile.start ||
      t === Tile.mud ||
      t === Tile.betrayal
    );
  }

  /** Play mode: spawn safety tile is always a real platform under Start. */
  function isSpawnSupportTile(t) {
    return t === Tile.platform;
  }

  /** Start must have a platform directly below (same column, row + 1). */
  function spawnHasSolidSupport(g, start) {
    if (!start) return false;
    if (start.y >= ROWS - 1) return false;
    return g[start.y + 1][start.x] === Tile.platform;
  }

  function jumpBoundsFromPhysics() {
    const g = GRAVITY;
    const jv = JUMP_VELOCITY;
    const peakPx = (jv * jv) / (2 * g);
    const tilesUp = Math.ceil(peakPx / TILE) + 2;
    const tAir = (2 * jv) / g;
    const tilesAcross = Math.ceil((MOVE_SPEED * tAir) / TILE) + 2;
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
    if (t === Tile.goal || t === Tile.start || t === Tile.pathBlock || t === Tile.checkpoint) return true;
    if (t === Tile.spikes || t === Tile.lava || t === Tile.hex || t === Tile.food) {
      if (y + 1 < ROWS && isGoalSupportTile(g[y + 1][x])) return true;
      return isSolidTile(g, x, y) || (y + 1 < ROWS && isSolidTile(g, x, y + 1));
    }
    if (isSolidTile(g, x, y)) return true;
    if (y + 1 < ROWS && isSolidTile(g, x, y + 1)) return true;
    if (t === Tile.empty && y + 1 < ROWS && isGoalSupportTile(g[y + 1][x])) return true;
    return false;
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

  function checkpointHasGrounding(g, cp) {
    if (!cp) return false;
    if (cp.y >= ROWS - 1) return true;
    return isGoalSupportTile(g[cp.y + 1][cp.x]);
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

  /** Spikes/lava/hex directly under Start, Goal, or Checkpoint footing. */
  function buildHazardFootingOverlapMessage(g) {
    const haz = (t) => t === Tile.spikes || t === Tile.lava || t === Tile.hex;
    let st = null,
      gl = null,
      cp = null;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = g[y][x];
        if (t === Tile.start) st = { x, y };
        if (t === Tile.goal) gl = { x, y };
        if (t === Tile.checkpoint) cp = { x, y };
      }
    }
    const footMsg = (label, p) => {
      if (!p) return "";
      if (p.y + 1 < ROWS && haz(g[p.y + 1][p.x])) return `Hazard overlaps ${label} footing.`;
      return "";
    };
    return footMsg("Start", st) || footMsg("Goal", gl) || footMsg("Checkpoint", cp);
  }

  /** Discrete tile graph: horizontal moves + upward jumps bounded by `jumpBoundsFromPhysics()`. */
  function runReachabilityBfs(g, standableFn, boundsMul = 1) {
    const { start, goal } = findStartGoalOn(g);
    const visited = new Set();
    if (!start || !goal) {
      pathDebugCells = visited;
      return { reachesGoal: false, visited };
    }
    const { maxDy, maxDx } = jumpBoundsFromPhysics();
    const maxDyUse = Math.max(1, Math.floor(maxDy * boundsMul));
    const maxDxUse = Math.max(1, Math.floor(maxDx * boundsMul));
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
      for (let dy = 1; dy <= maxDyUse; dy++) {
        const ny = y - dy;
        if (ny < 0) break;
        for (let dx = -maxDxUse; dx <= maxDxUse; dx++) {
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

  let selectedTier = "easy";

  async function refreshFeaturedGlobalLevelsCache() {
    const sb = getSupabaseClient();
    if (!sb || !isSupabaseConfigured()) {
      cachedFeaturedGlobalLevels = [];
      return;
    }
    try {
      const { data, error } = await sb
        .from("global_levels")
        .select("id, client_level_id, name, tiles_flat, texts, cols, rows, difficulty, featured_tier")
        .not("featured_tier", "is", null)
        .limit(40);
      if (error) {
        logSupabaseError("global_levels.select(featured)", error, {});
        cachedFeaturedGlobalLevels = [];
        return;
      }
      cachedFeaturedGlobalLevels = Array.isArray(data) ? data : [];
    } catch (e) {
      logSupabaseError("refreshFeaturedGlobalLevelsCache", e, {});
      cachedFeaturedGlobalLevels = [];
    }
  }

  function renderLevelListByTier() {
    if (!elLevelListByTier) return;
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
    const ft = selectedTier;
    for (const gl of cachedFeaturedGlobalLevels) {
      const tier = gl && gl.featured_tier ? String(gl.featured_tier).toLowerCase() : "";
      if (tier !== ft) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn levelSelectBtn levelSelectBtnFeatured";
      btn.textContent = `★ ${String(gl.name || "Community")}`;
      btn.title = "Admin-featured community level";
      btn.addEventListener("click", () => {
        const flat = Array.isArray(gl.tiles_flat) ? gl.tiles_flat : [];
        const cols = typeof gl.cols === "number" ? gl.cols : COLS;
        const rows = typeof gl.rows === "number" ? gl.rows : ROWS;
        inflateGrid(grid, flat, cols, rows);
        levelTexts =
          gl.texts && typeof gl.texts === "object" && !Array.isArray(gl.texts)
            ? /** @type {Record<string, string>} */ (gl.texts)
            : {};
        ensureCheckpointInWorldGrid();
        resetBuildCameraDefault();
        resetUndoStacksToCurrent();
        testSpawnCell = null;
        scheduleValidate();
        closeModal(elStartModal);
        const sid = `feat:${String(gl.id || "")}`;
        startPlay(sid, null, null, null, { featuredTier: tier });
      });
      elLevelListByTier.appendChild(btn);
    }
  }

  document.querySelectorAll(".levelTab").forEach((tab) => {
    tab.addEventListener("click", () => {
      selectedTier = tab.dataset.tier || "easy";
      document.querySelectorAll(".levelTab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      void refreshFeaturedGlobalLevelsCache().then(() => renderLevelListByTier());
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
      const texPath = TILE_TEXTURE_SRC[/** @type {string} */ (t)];
      if (texPath) {
        sw.style.backgroundColor = "#252530";
        sw.style.backgroundImage = `url("${texPath}")`;
        sw.style.backgroundSize = "cover";
        sw.style.backgroundPosition = "center";
      } else {
        sw.style.background = TileInfo[t].color || "transparent";
      }

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
        textPlacementMode = false;
        if (elAddTextBtn) elAddTextBtn.classList.remove("primary");
        lastHoverForPlacement = { gx: -9999, gy: -9999, tile: -1 };
        syncPaletteSelection();
      });

      elPalette.appendChild(btn);
      tileButtons.set(t, btn);
    }
    syncPaletteSelection();
  }
  function syncPaletteSelection() {
    for (const [t, btn] of tileButtons.entries()) btn.classList.toggle("selected", t === selectedTile);
  }

  // ---------- Level validation + difficulty ----------
  /** Stochastic physics validation is heavy; debounce so painting/erasing stays responsive. */
  let validateDebounceTimer = 0;

  function flushBuildValidation() {
    if (validateDebounceTimer) {
      window.clearTimeout(validateDebounceTimer);
      validateDebounceTimer = 0;
    }
    lastValidation = validateLevel();
    syncBuildHUD();
  }

  function scheduleValidate() {
    if (typeof window === "undefined") {
      flushBuildValidation();
      return;
    }
    if (validateDebounceTimer) window.clearTimeout(validateDebounceTimer);
    validateDebounceTimer = window.setTimeout(() => {
      validateDebounceTimer = 0;
      lastValidation = validateLevel();
      syncBuildHUD();
    }, VALIDATE_DEBOUNCE_MS);
  }

  /**
   * @type {{
   *  ok: boolean,
   *  message: string,
   *  difficulty: number,
   *  counts: any,
   *  aiState?: "VALID"|"INVALID",
   *  aiNotes?: string[]
   * }}
   */
  let lastValidation = {
    ok: false,
    message: "Needs Start + Goal + Checkpoint + platform under Start",
    difficulty: 0,
    counts: countTiles(grid),
    aiState: "INVALID",
    aiNotes: [],
  };

  function validateLevel() {
    const counts = countTiles(grid);
    const difficulty = computeDifficulty(counts);

    const start = findType(Tile.start);
    const goal = findType(Tile.goal);
    const cp = findType(Tile.checkpoint);
    if (!start || !goal) {
      return { ok: false, message: "Needs Start + Goal", difficulty, counts };
    }
    const cpCount = counts.checkpoint || 0;
    if (cpCount !== 1 || !cp) {
      return {
        ok: false,
        message: cpCount === 0 ? "Place exactly one Checkpoint tile." : "Only one Checkpoint allowed.",
        difficulty,
        counts,
      };
    }

    for (const k of Object.keys(BUILD_LIMITS)) {
      // @ts-ignore
      if (counts[k] > BUILD_LIMITS[k]) return { ok: false, message: "Over tile limit", difficulty, counts };
    }

    if (!spawnHasSolidSupport(grid, start)) {
      return {
        ok: false,
        message: "Start needs a platform directly below (auto-placed when you move Start).",
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

    if (!checkpointHasGrounding(grid, cp)) {
      return {
        ok: false,
        message: "Checkpoint needs support below (platform, jump pad, speed tile, path block, or start).",
        difficulty,
        counts,
      };
    }

    const hzMsg = buildHazardFootingOverlapMessage(grid);
    if (hzMsg) {
      return { ok: false, message: hzMsg, difficulty, counts };
    }

    const hasPuzzleLayer = (counts.pressureSwitch || 0) > 0 || (counts.timedDoor || 0) > 0;
    if (!hasPuzzleLayer && !runReachabilityBfs(grid, isStandableReach, 1).reachesGoal) {
      return {
        ok: false,
        message: "Cannot reach Goal from Start within max jump height (or route is blocked).",
        difficulty,
        counts,
      };
    }

    // IMPROVE 3: Warn if a large contiguous spike wall completely blocks a horizontal corridor.
    if (!hasPuzzleLayer) {
      const spikeWallWarning = detectBlockingSpikeWall(grid);
      if (spikeWallWarning) {
        return { ok: false, message: spikeWallWarning, difficulty, counts };
      }
    }

    return { ok: true, message: hasPuzzleLayer ? "Ready (puzzle layer active)" : "Ready", difficulty, counts };
  }

  /** IMPROVE 3: Detect a vertical spike/lava wall that spans ≥4 rows and fully blocks a column. */
  function detectBlockingSpikeWall(g) {
    for (let x = 1; x < COLS - 1; x++) {
      let runLen = 0;
      let runStart = 0;
      for (let y = 0; y < ROWS; y++) {
        const t = g[y][x];
        const isHazard = t === Tile.spikes || t === Tile.lava;
        if (isHazard) {
          if (runLen === 0) runStart = y;
          runLen++;
        } else {
          runLen = 0;
        }
        if (runLen >= 4) {
          // Check: is there any non-hazard gap within ±2 columns in the same row band?
          let blocked = true;
          for (let dy = runStart; dy <= y && blocked; dy++) {
            const hasGap =
              (x > 0 && g[dy][x - 1] !== Tile.spikes && g[dy][x - 1] !== Tile.lava && g[dy][x - 1] !== Tile.platform) ||
              (x < COLS - 1 && g[dy][x + 1] !== Tile.spikes && g[dy][x + 1] !== Tile.lava && g[dy][x + 1] !== Tile.platform);
            if (hasGap) blocked = false;
          }
          if (blocked) return `Spike/lava wall at column ${x} blocks passage (${runLen} tiles tall). Add a gap or jump pad.`;
        }
      }
    }
    return null;
  }

  function validatePlayerCreatedLevelAiLike() {
    const base = validateLevel();
    if (!base || !base.ok) {
      return {
        ok: false,
        aiState: "INVALID",
        aiNotes: [base && base.message ? String(base.message) : "Base validation failed"],
        ...base,
      };
    }
    return { ...base, ok: true, aiState: "VALID", aiNotes: [] };
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
    elBudgetPill.textContent = `${c.platform}/${BUILD_LIMITS.platform} pl · ${c.spikes}/${BUILD_LIMITS.spikes} sp · ${c.jumppad}/${BUILD_LIMITS.jumppad} jp · ${c.hex}/${BUILD_LIMITS.hex} hx · ${c.checkpoint || 0}/${BUILD_LIMITS.checkpoint} cp · ${c.lava || 0}/${BUILD_LIMITS.lava} lv · ${c.mud || 0}/${BUILD_LIMITS.mud} mud · ${c.betrayal || 0}/${BUILD_LIMITS.betrayal} bt · ${c.pressureSwitch || 0}/${BUILD_LIMITS.pressureSwitch} sw · ${c.timedDoor || 0}/${BUILD_LIMITS.timedDoor} door · ${c.speedBoost || 0}/${BUILD_LIMITS.speedBoost} spd · ${c.food || 0}/${BUILD_LIMITS.food} fd · ${c.pathBlock || 0}/${BUILD_LIMITS.pathBlock} path`;
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
      (counts.pathBlock || 0) * POINTS.pathBlock +
      (counts.checkpoint || 0) * POINTS.checkpoint +
      (counts.mud || 0) * POINTS.mud +
      (counts.betrayal || 0) * POINTS.betrayal +
      (counts.pressureSwitch || 0) * POINTS.pressureSwitch +
      (counts.timedDoor || 0) * POINTS.timedDoor
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
    const out = {
      platform: 0,
      spikes: 0,
      jumppad: 0,
      hex: 0,
      lava: 0,
      speedBoost: 0,
      food: 0,
      pathBlock: 0,
      checkpoint: 0,
      mud: 0,
      betrayal: 0,
      pressureSwitch: 0,
      timedDoor: 0,
    };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = normalizeImportedTileType(g[y][x]);
        if (t === Tile.platform) out.platform++;
        else if (t === Tile.spikes) out.spikes++;
        else if (t === Tile.jumppad) out.jumppad++;
        else if (t === Tile.hex) out.hex++;
        else if (t === Tile.lava) out.lava++;
        else if (t === Tile.speedBoost) out.speedBoost++;
        else if (t === Tile.food) out.food++;
        else if (t === Tile.pathBlock) out.pathBlock++;
        else if (t === Tile.checkpoint) out.checkpoint++;
        else if (t === Tile.mud) out.mud++;
        else if (t === Tile.betrayal) out.betrayal++;
        else if (t === Tile.pressureSwitch) out.pressureSwitch++;
        else if (t === Tile.timedDoor) out.timedDoor++;
      }
    }
    return out;
  }

  function findType(t) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === t) return { x, y };
    return null;
  }

  function isPuzzleTileType(t) {
    return t === Tile.pressureSwitch || t === Tile.timedDoor;
  }

  function isPreconfiguredLevelRun(state) {
    if (!state) return false;
    if (state.sourceBuiltinIndex != null) return true;
    if (!state.sourceLevelId) return false;
    const sid = String(state.sourceLevelId);
    return sid.startsWith("builtin_") || sid.startsWith("feat:");
  }

  function puzzleLayersEnabled(state) {
    return !isPreconfiguredLevelRun(state);
  }

  function isSolid(t) {
    return t === Tile.platform || t === Tile.jumppad || t === Tile.betrayal;
  }

  function ensureRemixToolbar() {
    if (!elLevelsList || !elLevelsList.parentElement) return;
    if ($("levelRemixToolbar")) return;
    const bar = document.createElement("div");
    bar.id = "levelRemixToolbar";
    bar.className = "row";
    bar.style.flexWrap = "wrap";
    bar.style.gap = "8px";
    bar.style.margin = "8px 0";
    const mergeBtn = document.createElement("button");
    mergeBtn.type = "button";
    mergeBtn.className = "btn primary";
    mergeBtn.textContent = "DNA Remix selected";
    mergeBtn.addEventListener("click", () => remixSelectedLevelsIntoGrid());
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn subtle";
    clearBtn.textContent = "Clear remix selection";
    clearBtn.addEventListener("click", () => {
      remixSelectedLevelIds.clear();
      refreshLevelsList();
    });
    bar.appendChild(mergeBtn);
    bar.appendChild(clearBtn);
    elLevelsList.parentElement.insertBefore(bar, elLevelsList);
  }

  function findSpecialCellInGrid(g, kind) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (g[y][x] === kind) return { x, y };
      }
    }
    return null;
  }

  function enforceBuildLimitsOnGridMutable(g) {
    const c = countTiles(g);
    for (const key of Object.keys(BUILD_LIMITS)) {
      const lim = BUILD_LIMITS[key] || 0;
      while ((c[key] || 0) > lim) {
        let removed = false;
        for (let y = ROWS - 1; y >= 0 && !removed; y--) {
          for (let x = COLS - 1; x >= 0 && !removed; x--) {
            if (g[y][x] !== key || key === "checkpoint") continue;
            g[y][x] = Tile.empty;
            c[key]--;
            removed = true;
          }
        }
        if (!removed) break;
      }
    }
  }

  function remixSelectedLevelsIntoGrid() {
    if (!activePlayer) return;
    const ids = Array.from(remixSelectedLevelIds).filter((id) => !!activePlayer.levels[id]);
    if (ids.length < 2) {
      showToast("Select at least 2 saved levels for DNA Remix.", 2200);
      return;
    }
    const levels = ids.map((id) => activePlayer.levels[id]);
    const out = makeGrid(COLS, ROWS, Tile.empty);
    let pickedStart = null;
    let pickedGoal = null;
    let pickedCheckpoint = null;
    for (const lvl of levels) {
      const g = makeGrid(COLS, ROWS, Tile.empty);
      inflateGrid(g, lvl.tilesFlat, lvl.cols, lvl.rows);
      if (!pickedStart) pickedStart = findSpecialCellInGrid(g, Tile.start);
      if (!pickedGoal) pickedGoal = findSpecialCellInGrid(g, Tile.goal);
      if (!pickedCheckpoint) pickedCheckpoint = findSpecialCellInGrid(g, Tile.checkpoint);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = normalizeImportedTileType(g[y][x]);
          if (t === Tile.empty || t === Tile.start || t === Tile.goal || t === Tile.checkpoint) continue;
          if (Math.random() < 1 / levels.length) out[y][x] = t;
          else if (out[y][x] === Tile.empty && Math.random() < 0.32) out[y][x] = t;
        }
      }
    }
    const st = pickedStart || { x: 2, y: ROWS - 3 };
    const gl = pickedGoal || { x: Math.min(COLS - 3, 24), y: ROWS - 3 };
    const cp = pickedCheckpoint || { x: Math.max(1, Math.floor((st.x + gl.x) / 2)), y: Math.max(1, st.y - 1) };
    out[st.y][st.x] = Tile.start;
    out[gl.y][gl.x] = Tile.goal;
    out[cp.y][cp.x] = Tile.checkpoint;
    if (st.y + 1 < ROWS) out[st.y + 1][st.x] = Tile.platform;
    if (gl.y + 1 < ROWS && out[gl.y + 1][gl.x] === Tile.empty) out[gl.y + 1][gl.x] = Tile.platform;
    if (cp.y + 1 < ROWS && out[cp.y + 1][cp.x] === Tile.empty) out[cp.y + 1][cp.x] = Tile.platform;
    enforceBuildLimitsOnGridMutable(out);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[y][x] = out[y][x];
    ensureCheckpointInWorldGrid();
    resetBuildCameraDefault();
    resetUndoStacksToCurrent();
    testSpawnCell = null;
    scheduleValidate();
    const name = (window.prompt("Name for remixed level:", `DNA Remix ${new Date().toLocaleTimeString()}`) || "").trim().slice(0, 26);
    if (name) saveLevel(name, validatePlayerCreatedLevelAiLike(), "default");
    showToast(`DNA Remix complete (${ids.length} levels merged).`, 2600);
    remixSelectedLevelIds.clear();
    refreshLevelsList();
  }

  /** @type {((choice: string) => void) | null} */
  let adminPublishResolve = null;
  /** @type {{ name: string, meta: any } | null} */
  let pendingAdminSave = null;

  function closeAdminPublishModal() {
    closeModal(elAdminPublishLevelModal);
    adminPublishResolve = null;
  }

  function openAdminPublishModal(onChoose) {
    if (!elAdminPublishLevelModal) return;
    adminPublishResolve = onChoose;
    openModal(elAdminPublishLevelModal);
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
    refreshFeaturedLevelsUI();
    void refreshGlobalLevelsList();
  });
  elOpenLevelsBtn.addEventListener("click", () => {
    if (!activePlayer) openStartModal();
    openModal(elLevelsModal);
    refreshLevelsList();
    refreshFeaturedLevelsUI();
    void refreshGlobalLevelsList();
  });
  if (elRefreshGlobalLevelsBtn) elRefreshGlobalLevelsBtn.addEventListener("click", () => void refreshGlobalLevelsList(true));

  elConfirmSaveLevelBtn.addEventListener("click", () => {
    if (!activePlayer) return;
    const name = (elSaveLevelNameInput.value || "").trim().slice(0, 26);
    if (!name) {
      showToast("Enter a level name.");
      return;
    }
    lastValidation = validatePlayerCreatedLevelAiLike();
    syncBuildHUD();
    if (lastValidation.aiState === "INVALID") {
      showToast("Level is invalid and cannot be saved/shared.");
      return;
    }
    const sb = getSupabaseClient();
    const u = currentSupabaseUser;
    if (isAdminUser && u && sb && isSupabaseConfigured()) {
      pendingAdminSave = { name, meta: lastValidation };
      openAdminPublishModal((choice) => {
        pendingAdminSave = null;
        saveLevel(name, lastValidation, /** @type {"easy"|"medium"|"hard"|"global"|"local_only"} */ (choice));
      });
      return;
    }
    saveLevel(name, lastValidation, "default");
  });

  if (elCloseAdminPublishModalBtn) {
    elCloseAdminPublishModalBtn.addEventListener("click", () => {
      if (pendingAdminSave) {
        const ps = pendingAdminSave;
        pendingAdminSave = null;
        adminPublishResolve = null;
        closeModal(elAdminPublishLevelModal);
        saveLevel(ps.name, ps.meta, "local_only");
        return;
      }
      closeAdminPublishModal();
    });
  }
  if (elAdminPublishLevelModal) {
    elAdminPublishLevelModal.querySelectorAll("[data-admin-publish]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.getAttribute("data-admin-publish") || "local_only";
        const cb = adminPublishResolve;
        pendingAdminSave = null;
        adminPublishResolve = null;
        closeModal(elAdminPublishLevelModal);
        if (cb) cb(choice);
      });
    });
  }

  /**
   * @param {string} name
   * @param {any} validationMeta
   * @param {"default"|"easy"|"medium"|"hard"|"global"|"local_only"} cloudChoice
   */
  function saveLevel(name, validationMeta, cloudChoice = "default") {
    if (blockedActionGuard()) return;
    if (!activePlayer) return;
    const now = Date.now();
    const counts = countTiles(grid);
    const aiState = validationMeta && validationMeta.aiState ? validationMeta.aiState : "VALID";
    const aiNotes = validationMeta && Array.isArray(validationMeta.aiNotes) ? validationMeta.aiNotes : [];
    const level = /** @type {SavedLevel} */ ({
      id: `l_${uid()}`,
      name,
      createdAt: now,
      updatedAt: now,
      tilesFlat: flattenGrid(grid),
      texts: cloneLevelTexts(),
      links: cloneLevelLinks(),
      cols: COLS,
      rows: ROWS,
      counts,
      difficulty: computeDifficulty(counts),
      completions: 0,
      bestPointsEarned: 0,
      bestDifficultyBeaten: 0,
      validationState: aiState,
      validationNotes: aiNotes,
    });
    activePlayer.levels[level.id] = level;
    persist();
    try {
      localStorage.removeItem(DRAFT_GRID_KEY);
    } catch {
      /* ignore */
    }
    AudioSys.sfx.save();
    showToast(`Saved: ${name}`);
    refreshLevelsList();
    refreshLeaderboard();

    // Also share to global (Supabase) when signed in.
    const sb = getSupabaseClient();
    const u = currentSupabaseUser;
    const skipCloudUpload = isAdminUser && cloudChoice === "local_only";
    if (sb && u && u.id && isSupabaseConfigured() && !skipCloudUpload) {
      void (async () => {
        try {
          await sb
            .from("global_levels")
            .upsert(
              {
                author_id: u.id,
                client_level_id: level.id,
                name,
                tiles_flat: level.tilesFlat,
                texts: level.texts,
                cols: level.cols,
                rows: level.rows,
                difficulty: level.difficulty,
                validation_state: aiState,
                validation_notes: aiNotes.join("; "),
              },
              { onConflict: "author_id,client_level_id" }
            );
          if (
            isAdminUser &&
            (cloudChoice === "easy" || cloudChoice === "medium" || cloudChoice === "hard" || cloudChoice === "global")
          ) {
            const { data: pubOk, error: rpcErr } = await sb.rpc("ssb_admin_publish_level", {
              p_client_level_id: level.id,
              p_publish_mode: cloudChoice,
            });
            if (rpcErr) logSupabaseError("ssb_admin_publish_level", rpcErr, { client_level_id: level.id });
            else if (pubOk === false) showToast("Saved online; run latest SQL to set preconfigured visibility.", 3200);
            else if (cloudChoice === "easy" || cloudChoice === "medium" || cloudChoice === "hard") {
              showToast(`Level added to ${cloudChoice} preconfigured tab (hidden from Global list).`, 2600);
            } else if (cloudChoice === "global") {
              showToast("Level listed in Global shared levels.", 2200);
            }
          }
          void refreshFeaturedGlobalLevelsCache();
          void refreshGlobalLevelsList();
        } catch (e) {
          logSupabaseError("global_levels.upsert (saveLevel)", e, { author_id: u.id, client_level_id: level.id });
        }
      })();
    } else if (skipCloudUpload) {
      showToast("Saved locally only (not uploaded).", 2000);
    }
  }

  function refreshFeaturedLevelsUI() {
    if (!elFeaturedLevelsHost) return;
    elFeaturedLevelsHost.innerHTML = "";
    const lab = document.createElement("div");
    lab.className = "smallNote";
    lab.style.marginBottom = "8px";
    lab.textContent = "Curated picks (loads into the editor)";
    elFeaturedLevelsHost.appendChild(lab);
    const feats = [
      { name: "Training Wheels", flat: makeBuiltinTraining },
      { name: "First Steps", flat: makeBuiltinGentle },
      { name: "Spike Row", flat: makeBuiltinMid },
    ];
    for (const f of feats) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.style.marginRight = "6px";
      btn.style.marginBottom = "6px";
      btn.textContent = `Load · ${f.name}`;
      btn.addEventListener("click", () => {
        const flat = f.flat().slice();
        ensureCheckpointInLegacyFlat(flat);
        levelTexts = {};
        textPlacementMode = false;
        if (elAddTextBtn) elAddTextBtn.classList.remove("primary");
        inflateGrid(grid, flat, LEGACY_COLS, LEGACY_ROWS);
        resetBuildCameraDefault();
        resetUndoStacksToCurrent();
        testSpawnCell = null;
        scheduleValidate();
        closeModal(elLevelsModal);
        showToast(`Loaded: ${f.name}`);
      });
      elFeaturedLevelsHost.appendChild(btn);
    }
  }

  function refreshLevelsList() {
    ensureRemixToolbar();
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
      const remixBtn = document.createElement("button");
      remixBtn.className = "btn subtle";
      remixBtn.type = "button";
      remixBtn.textContent = remixSelectedLevelIds.has(lvl.id) ? "DNA ✓" : "DNA";
      remixBtn.addEventListener("click", () => {
        if (remixSelectedLevelIds.has(lvl.id)) remixSelectedLevelIds.delete(lvl.id);
        else remixSelectedLevelIds.add(lvl.id);
        refreshLevelsList();
      });
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
      actions.appendChild(remixBtn);
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      item.appendChild(meta);
      item.appendChild(actions);
      elLevelsList.appendChild(item);
    }
  }

  // ---------- Global shared levels (Supabase) ----------
  async function refreshGlobalLevelsList(force = false) {
    if (!elGlobalLevelsList) return;
    const sb = getSupabaseClient();
    if (!sb || !isSupabaseConfigured()) {
      elGlobalLevelsList.innerHTML = "";
      elGlobalLevelsList.appendChild(makeEmptyLine("Global levels need Supabase configured."));
      return;
    }

    elGlobalLevelsList.innerHTML = "";
    elGlobalLevelsList.appendChild(makeEmptyLine(force ? "Refreshing…" : "Loading…"));

    try {
      const { data, error } = await sb
        .from("global_levels")
        .select("id, client_level_id, name, tiles_flat, texts, cols, rows, difficulty, validation_state, validation_notes, created_at, profiles(username)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        logSupabaseError("global_levels.select", error, {});
        elGlobalLevelsList.innerHTML = "";
        elGlobalLevelsList.appendChild(makeEmptyLine("Could not load global levels."));
        return;
      }

      elGlobalLevelsList.innerHTML = "";
      const rows = Array.isArray(data) ? data.filter((r) => r && r.list_in_global !== false) : [];
      if (rows.length === 0) {
        elGlobalLevelsList.appendChild(makeEmptyLine("No global levels yet."));
        return;
      }

      for (const gl of rows) {
        const item = document.createElement("div");
        item.className = "listItem";

        const meta = document.createElement("div");
        meta.className = "meta";

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = String(gl.name || "Untitled");

        const sub = document.createElement("div");
        sub.className = "sub";
        const u = gl.profiles && typeof gl.profiles === "object" ? gl.profiles : null;
        const authorName = u && u.username ? String(u.username) : "Unknown";
        const diff = typeof gl.difficulty === "number" ? gl.difficulty.toFixed(1) : "—";
        const vState = gl.validation_state ? String(gl.validation_state) : "VALID";
        sub.textContent = `By ${authorName} · Difficulty ${diff}${vState === "SUSPICIOUS" ? " · Flagged" : ""}`;

        meta.appendChild(name);
        meta.appendChild(sub);

        const actions = document.createElement("div");
        actions.className = "actions";

        const playBtn = document.createElement("button");
        playBtn.type = "button";
        playBtn.className = "btn primary";
        playBtn.textContent = "Play";
        playBtn.addEventListener("click", () => playGlobalSharedLevel(gl));

        actions.appendChild(playBtn);

        const reportBtn = document.createElement("button");
        reportBtn.type = "button";
        reportBtn.className = "btn danger";
        reportBtn.textContent = "Report";
        reportBtn.addEventListener("click", () => void reportGlobalSharedLevel(gl));
        actions.appendChild(reportBtn);

        item.appendChild(meta);
        item.appendChild(actions);
        elGlobalLevelsList.appendChild(item);
      }
    } catch (e) {
      logSupabaseError("refreshGlobalLevelsList (exception)", e, {});
      elGlobalLevelsList.innerHTML = "";
      elGlobalLevelsList.appendChild(makeEmptyLine("Could not load global levels."));
    }
  }

  function playGlobalSharedLevel(gl) {
    if (!gl) return;
    const flat = Array.isArray(gl.tiles_flat) ? gl.tiles_flat : [];
    const cols = typeof gl.cols === "number" ? gl.cols : COLS;
    const rows = typeof gl.rows === "number" ? gl.rows : ROWS;
    inflateGrid(grid, flat, cols, rows);

    levelTexts =
      gl.texts && typeof gl.texts === "object" && !Array.isArray(gl.texts)
        ? /** @type {Record<string, string>} */ (gl.texts)
        : {};
    levelLinks = {};
    pendingLinkSource = null;

    ensureCheckpointInWorldGrid();
    resetBuildCameraDefault();
    resetUndoStacksToCurrent();
    testSpawnCell = null;
    scheduleValidate();

    closeModal(elLevelsModal);
    startPlay(null, null, null, null);
  }

  async function reportGlobalSharedLevel(gl) {
    if (blockedActionGuard()) return;
    if (!gl || !gl.id) return;
    const sb = getSupabaseClient();
    const u = currentSupabaseUser;
    if (!sb || !u || !u.id || !isSupabaseConfigured()) {
      showToast("Sign in to report levels.", 2200);
      return;
    }

    const raw = window.prompt("Report reason (optional): unreachable / spam / abusive / other", "");
    const reason = raw && typeof raw === "string" ? raw.trim().slice(0, 240) : "";
    const lc = reason.toLowerCase();

    let reasonCode = "other";
    if (lc.includes("unreach") || lc.includes("impossible")) reasonCode = "unreachable";
    else if (lc.includes("spam") || lc.includes("overuse")) reasonCode = "spam";
    else if (lc.includes("abuse") || lc.includes("abusive") || lc.includes("unfair")) reasonCode = "abusive";

    try {
      const { error } = await sb.from("level_reports").insert({
        level_id: gl.id,
        reporter_user_id: u.id,
        reason: reason || null,
        reason_code: reasonCode,
      });
      if (error) {
        logSupabaseError("level_reports.insert", error, { level_id: gl.id, reporter_user_id: u.id });
        showToast("Report failed. Check console logs.", 2400);
        return;
      }
      showToast("Report submitted. Thank you.", 2200);
    } catch (e) {
      logSupabaseError("reportGlobalSharedLevel (exception)", e, {});
      showToast("Report failed. Check console logs.", 2400);
    }
  }

  function loadLevel(levelId) {
    if (!activePlayer) return;
    const lvl = activePlayer.levels[levelId];
    if (!lvl) return;
    inflateGrid(grid, lvl.tilesFlat, lvl.cols, lvl.rows);
    levelTexts =
      lvl.texts && typeof lvl.texts === "object"
        ? (() => {
            const tx = /** @type {Record<string, string>} */ ({});
            for (const k of Object.keys(lvl.texts)) {
              const v = lvl.texts[k];
              if (typeof v === "string" && v.trim()) tx[k] = v.trim().slice(0, MAX_LEVEL_TEXT_LEN);
            }
            return tx;
          })()
        : {};
    levelLinks =
      lvl.links && typeof lvl.links === "object"
        ? (() => {
            const out = /** @type {Record<string, { x: number, y: number }>} */ ({});
            for (const k of Object.keys(lvl.links)) {
              const v = lvl.links[k];
              if (!v || typeof v !== "object") continue;
              const x = Math.floor(Number(v.x));
              const y = Math.floor(Number(v.y));
              if (inBounds(x, y)) out[k] = { x, y };
            }
            return out;
          })()
        : {};
    pendingLinkSource = null;
    ensureCheckpointInWorldGrid();
    resetBuildCameraDefault();
    resetUndoStacksToCurrent();
    testSpawnCell = null;
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

  function inflateGrid(g, flat, srcCols, srcRows) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g[y][x] = Tile.empty;

    if (!flat || !flat.length) return;

    let destX = 0;
    let destY = 0;
    if (srcCols <= COLS && srcRows <= ROWS && !(srcCols === COLS && srcRows === ROWS)) {
      destY = ROWS - srcRows;
    }

    for (let y = 0; y < srcRows; y++) {
      for (let x = 0; x < srcCols; x++) {
        const tx = destX + x;
        const ty = destY + y;
        if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) g[ty][tx] = normalizeImportedTileType(flat[y * srcCols + x]);
      }
    }

    const s = findType(Tile.start);
    if (s && s.y < ROWS - 1) {
      const below = g[s.y + 1][s.x];
      if (below !== Tile.goal && below !== Tile.start) g[s.y + 1][s.x] = Tile.platform;
    }
    const gl = findType(Tile.goal);
    if (gl && gl.y < ROWS - 1) {
      const belowG = g[gl.y + 1][gl.x];
      if (belowG !== Tile.goal && belowG !== Tile.start) g[gl.y + 1][gl.x] = Tile.platform;
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
        maybeNotifyTutorialAvailable();
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
    maybeNotifyTutorialAvailable();
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

  // Quick play (built-ins)
  renderLevelListByTier();

  if (elDailyChallengeBtn) {
    elDailyChallengeBtn.addEventListener("click", () => void startDailyChallenge());
  }

  if (elTutorialStartBtn) {
    elTutorialStartBtn.addEventListener("click", () => {
      try {
        localStorage.setItem(TUTORIAL_PROMPT_KEY, "1");
      } catch {
        /* ignore */
      }
      if (elTutorialOfferCard) elTutorialOfferCard.classList.add("hidden");
      const ix = BUILTIN_LEVELS.findIndex((l) => l.tier === "tutorial");
      if (ix < 0) return;
      const lvl = BUILTIN_LEVELS[ix];
      loadFlatIntoGrid(lvl.tilesFlat);
      closeModal(elStartModal);
      startPlay(lvl.id, ix);
    });
  }
  if (elTutorialSkipBtn) {
    elTutorialSkipBtn.addEventListener("click", () => {
      try {
        localStorage.setItem(TUTORIAL_PROMPT_KEY, "1");
      } catch {
        /* ignore */
      }
      if (elTutorialOfferCard) elTutorialOfferCard.classList.add("hidden");
    });
  }

  if (elExportLevelBtn) elExportLevelBtn.addEventListener("click", () => exportGridJson());
  if (elRestoreDraftBtn) elRestoreDraftBtn.addEventListener("click", () => offerDraftRestoreNow());
  if (elImportLevelBtn && elImportLevelInput) elImportLevelBtn.addEventListener("click", () => elImportLevelInput.click());
  if (elImportLevelInput) {
    elImportLevelInput.addEventListener("change", (e) => {
      const inp = /** @type {HTMLInputElement} */ (e.target);
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importGridFromJsonText(String(reader.result || ""));
          closeModal(elLevelsModal);
        } catch {
          showToast("Could not import file.");
        }
      };
      reader.readAsText(file);
      inp.value = "";
    });
  }

  // ---------- Leaderboard ----------
  elOpenLeaderboardBtn.addEventListener("click", () => {
    openModal(elLeaderboardModal);
    refreshLeaderboard({ forceGlobal: true });
  });
  elLeaderboardSearchBtn.addEventListener("click", () => refreshLeaderboard(elLeaderboardSearchInput.value));
  elLeaderboardSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshLeaderboard(elLeaderboardSearchInput.value);
  });
  if (elGlobalLbSearchBtn) elGlobalLbSearchBtn.addEventListener("click", () => void runGlobalLbSearch());
  if (elGlobalLbSearchClearBtn) elGlobalLbSearchClearBtn.addEventListener("click", () => clearGlobalLbSearchUi());
  if (elGlobalLbSearchInput)
    elGlobalLbSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void runGlobalLbSearch();
    });

  function formatLbScore(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return Math.round(x).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatLbTime(iso) {
    if (!iso) return "—";
    const t = new Date(String(iso)).getTime();
    if (!Number.isFinite(t)) return "—";
    const d = Date.now() - t;
    if (d < 45_000) return "Just now";
    if (d < 3_600_000) return `${Math.max(1, Math.floor(d / 60_000))}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    if (d < 604_800_000) return `${Math.floor(d / 86_400_000)}d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const GLOBAL_LB_SELECT_JOINED =
    "score, level, xp, unique_levels_beaten, easy_levels_beaten, medium_levels_beaten, hard_levels_beaten, user_id, display_name, updated_at, profiles(username, is_admin)";
  const GLOBAL_LB_SELECT_PLAIN =
    "score, level, xp, unique_levels_beaten, easy_levels_beaten, medium_levels_beaten, hard_levels_beaten, user_id, display_name, updated_at";

  function rowIsLeaderboardAdmin(row) {
    const prof =
      row && row.profiles && typeof row.profiles === "object" ? /** @type {{ is_admin?: boolean }} */ (row.profiles) : null;
    return !!(prof && prof.is_admin === true);
  }

  function formatLbAbsoluteTime(iso) {
    if (!iso) return "—";
    const d = new Date(String(iso));
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function sanitizeGlobalLbSearchQuery(q) {
    return String(q || "")
      .trim()
      .slice(0, 80)
      .replace(/[%_\\]/g, "");
  }

  function isProbablyUserUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s).trim());
  }

  /**
   * @param {any} sb
   * @param {Record<string, unknown>[]} rows
   */
  async function enrichLeaderboardRowsWithProfiles(sb, rows) {
    const ids = [...new Set(rows.map((r) => (r && r.user_id ? String(r.user_id) : "")).filter(Boolean))];
    if (!ids.length) return rows;
    const { data, error } = await sb.from("profiles").select("id, username, is_admin").in("id", ids);
    if (error) {
      logSupabaseError("profiles.select(search enrich)", error, { ids });
      return rows;
    }
    /** @type {Record<string, { username: string, is_admin: boolean }>} */
    const metaById = {};
    if (Array.isArray(data))
      for (const p of data) {
        if (p && p.id)
          metaById[String(p.id)] = { username: String(p.username || ""), is_admin: !!p.is_admin };
      }
    for (const r of rows) {
      const uid = r && r.user_id ? String(r.user_id) : "";
      if (uid && metaById[uid]) {
        r.profiles = metaById[uid];
      }
    }
    return rows;
  }

  /**
   * @param {string} label
   * @param {string} value
   * @param {string} [sub]
   */
  function createGlobalLbStatTile(label, value, sub) {
    const wrap = document.createElement("div");
    wrap.className = "globalLbStatTile";
    const la = document.createElement("div");
    la.className = "globalLbStatTileLabel";
    la.textContent = label;
    const v = document.createElement("div");
    v.className = "globalLbStatTileValue";
    v.textContent = value;
    wrap.appendChild(la);
    wrap.appendChild(v);
    if (sub) {
      const s = document.createElement("div");
      s.className = "globalLbStatTileSub";
      s.textContent = sub;
      wrap.appendChild(s);
    }
    return wrap;
  }

  /**
   * @param {Record<string, unknown> | null | undefined} row
   * @returns {{ label: string, profileUname: string, uid: string }}
   */
  function resolveGlobalLbPlayerLabels(row) {
    const prof = row && row.profiles && typeof row.profiles === "object" ? /** @type {{ username?: string }} */ (row.profiles) : null;
    const profileUname = prof && prof.username != null ? String(prof.username).trim() : "";
    const uid = row && row.user_id ? String(row.user_id) : "";
    const display =
      row && row.display_name != null && String(row.display_name).trim() ? String(row.display_name).trim() : "";
    const label = profileUname || display || (uid ? uid.slice(0, 8) + "…" : "Player");
    return { label, profileUname, uid };
  }

  /**
   * @param {Record<string, unknown>} row
   * @param {string} selfId
   * @param {number | null} rank — null for search cards (no rank pill)
   */
  function buildGlobalLbPlayerCard(row, selfId, rank) {
    const { label, profileUname, uid } = resolveGlobalLbPlayerLabels(row);
    const display =
      row && row.display_name != null && String(row.display_name).trim() ? String(row.display_name).trim() : "";
    const scoreVal = row && (row.score != null ? row.score : row.points != null ? row.points : null);
    const sc = Math.max(0, Math.floor(numLbField(scoreVal, 0)));
    const derived = levelAndXpFromScore(sc);
    const lv = Math.max(1, Math.floor(numLbField(row && row.level, derived.level)));
    const xp = Math.max(0, Math.floor(numLbField(row && row.xp, derived.xp)));
    const e = Math.max(0, Math.floor(numLbField(row && row.easy_levels_beaten, 0)));
    const m = Math.max(0, Math.floor(numLbField(row && row.medium_levels_beaten, 0)));
    const h = Math.max(0, Math.floor(numLbField(row && row.hard_levels_beaten, 0)));
    const u = Math.max(0, Math.floor(numLbField(row && row.unique_levels_beaten, 0)));
    const updated = row && row.updated_at != null ? row.updated_at : null;

    const card = document.createElement("article");
    card.className = "globalLbPlayerCard" + (selfId && uid && uid === selfId ? " globalLbPlayerCardSelf" : "");
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", label || "Player");

    const head = document.createElement("div");
    head.className = "globalLbPlayerCardHead";

    const titleRow = document.createElement("div");
    titleRow.className = "globalLbPlayerTitleRow";
    if (rank != null && Number.isFinite(rank)) {
      const rankPill = document.createElement("span");
      rankPill.className = "globalLbRankPill";
      rankPill.textContent = "#" + String(rank);
      titleRow.appendChild(rankPill);
    }
    const nameEl = document.createElement("div");
    nameEl.className = "globalLbPlayerName";
    nameEl.textContent = label || "Player";
    titleRow.appendChild(nameEl);
    if (selfId && uid && uid === selfId) {
      const you = document.createElement("span");
      you.className = "globalLbYouBadge";
      you.textContent = "You";
      titleRow.appendChild(you);
    }
    head.appendChild(titleRow);
    card.appendChild(head);

    if (uid) {
      const idBlock = document.createElement("div");
      idBlock.className = "globalLbIdBlock";
      const idLab = document.createElement("div");
      idLab.className = "globalLbFieldLabel";
      idLab.textContent = "User ID";
      const idRow = document.createElement("div");
      idRow.className = "globalLbIdRow";
      const code = document.createElement("code");
      code.className = "globalLbUserId";
      code.textContent = uid;
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn subtle globalLbCopyIdBtn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(uid);
          showToast("User ID copied.", 1600);
        } catch {
          showToast("Could not copy ID.", 2000);
        }
      });
      idRow.appendChild(code);
      idRow.appendChild(copyBtn);
      idBlock.appendChild(idLab);
      idBlock.appendChild(idRow);
      card.appendChild(idBlock);
    }

    if (profileUname && display && profileUname.toLowerCase() !== display.toLowerCase()) {
      const pl = document.createElement("div");
      pl.className = "globalLbProfileLine";
      pl.innerHTML = `<strong>Profile username</strong> — ${profileUname} · <strong>Display name</strong> — ${display}`;
      card.appendChild(pl);
    } else if (profileUname && !display) {
      const pl = document.createElement("div");
      pl.className = "globalLbProfileLine";
      pl.innerHTML = `<strong>Profile username</strong> — ${profileUname}`;
      card.appendChild(pl);
    } else if (display && !profileUname) {
      const pl = document.createElement("div");
      pl.className = "globalLbProfileLine";
      pl.innerHTML = `<strong>Display name</strong> — ${display}`;
      card.appendChild(pl);
    }

    const coreGrid = document.createElement("div");
    coreGrid.className = "globalLbStatGrid";
    coreGrid.appendChild(createGlobalLbStatTile("Total score", formatLbScore(scoreVal), "Global points"));
    coreGrid.appendChild(createGlobalLbStatTile("Level", String(lv), "Floor(score ÷ 100) + 1"));
    coreGrid.appendChild(createGlobalLbStatTile("XP in level", String(xp), "score mod 100"));
    coreGrid.appendChild(
      createGlobalLbStatTile("Last updated", formatLbTime(updated), formatLbAbsoluteTime(updated))
    );
    card.appendChild(coreGrid);

    const preTitle = document.createElement("div");
    preTitle.className = "globalLbFieldLabel";
    preTitle.textContent = "Preconfigured levels (first clear each)";
    card.appendChild(preTitle);

    const preRow = document.createElement("div");
    preRow.className = "globalLbPrebuiltRow";
    preRow.appendChild(createGlobalLbStatTile("Easy", String(e), "distinct easy maps"));
    preRow.appendChild(createGlobalLbStatTile("Medium", String(m), "distinct medium maps"));
    preRow.appendChild(createGlobalLbStatTile("Hard", String(h), "distinct hard maps"));
    preRow.appendChild(createGlobalLbStatTile("Unique (all)", String(u), "every prebuilt tier"));
    card.appendChild(preRow);

    return card;
  }

  function makeGlobalLbListMessage(message) {
    const d = document.createElement("div");
    d.className = "globalLbListEmpty";
    d.textContent = message;
    return d;
  }

  function clearGlobalLbSearchUi() {
    if (elGlobalLbSearchInput) elGlobalLbSearchInput.value = "";
    if (elGlobalLbSearchStatus) elGlobalLbSearchStatus.textContent = "";
    if (elGlobalLbSearchResults) elGlobalLbSearchResults.innerHTML = "";
  }

  /** Coalesce parallel global leaderboard fetches (one network round-trip). */
  let globalLbFetchPromise = /** @type {Promise<void> | null} */ (null);
  let globalLbDebounceTimer = 0;

  function scheduleRefreshGlobalLeaderboardList(delayMs = 320) {
    if (globalLbDebounceTimer) window.clearTimeout(globalLbDebounceTimer);
    globalLbDebounceTimer = window.setTimeout(() => {
      globalLbDebounceTimer = 0;
      void refreshGlobalLeaderboardList();
    }, delayMs);
  }

  async function refreshGlobalLeaderboardList() {
    if (!elGlobalLeaderboardList) return;
    while (globalLbFetchPromise) {
      try {
        await globalLbFetchPromise;
      } catch {
        /* another in-flight fetch failed; continue */
      }
    }
    const runFetch = async () => {
      elGlobalLeaderboardList.innerHTML = "";
      syncGlobalLbHint();
      const sb = getSupabaseClient();
      if (!sb) {
        elGlobalLeaderboardList.appendChild(
          makeGlobalLbListMessage("Set SUPABASE_URL and SUPABASE_ANON_KEY in supabase-config.js to load global scores.")
        );
        return;
      }
      const selfId = currentSupabaseUser && currentSupabaseUser.id ? String(currentSupabaseUser.id) : "";
      try {
        let rows = /** @type {Record<string, unknown>[]} */ ([]);
        let joinErr = null;
        const joined = await sb
          .from("leaderboard")
          .select(GLOBAL_LB_SELECT_JOINED)
          .order("score", { ascending: false })
          .limit(50);
        if (joined.error) {
          joinErr = joined.error;
          logSupabaseError("leaderboard.select(join profiles)", joined.error, {});
          const plain = await sb
            .from("leaderboard")
            .select(GLOBAL_LB_SELECT_PLAIN)
            .order("score", { ascending: false })
            .limit(50);
          if (plain.error) {
            logSupabaseError("leaderboard.select", plain.error, {});
            const msg = coerceAuthErrorToString(plain.error);
            elGlobalLeaderboardList.appendChild(
              makeGlobalLbListMessage(
                (msg || "Could not load global leaderboard.") +
                  " If the schema changed, re-run supabase/leaderboard_setup.sql in the Supabase SQL editor."
              )
            );
            return;
          }
          rows = Array.isArray(plain.data) ? plain.data : [];
          await enrichLeaderboardRowsWithProfiles(sb, rows);
        } else {
          rows = Array.isArray(joined.data) ? joined.data : [];
        }

        console.info(SB_LOG, "leaderboard rows", rows.length, joinErr ? "(fallback fetch)" : "");

        rows = rows.filter((r) => !rowIsLeaderboardAdmin(r));

        if (!rows.length) {
          const countRes = await sb.from("leaderboard").select("id", { count: "exact", head: true });
          if (countRes.error) logSupabaseError("leaderboard.count", countRes.error, {});
          const hint =
            countRes.count === 0 || countRes.count == null
              ? "No scores yet — win a run while signed in, or use Settings → Test global leaderboard."
              : `No rows visible (table has ~${countRes.count} rows). Check RLS or run supabase/leaderboard_setup.sql.`;
          elGlobalLeaderboardList.appendChild(makeGlobalLbListMessage(hint));
          return;
        }

        let rank = 0;
        const frag = document.createDocumentFragment();
        for (const row of rows) {
          rank += 1;
          frag.appendChild(buildGlobalLbPlayerCard(/** @type {Record<string, unknown>} */ (row), selfId, rank));
        }
        elGlobalLeaderboardList.appendChild(frag);
      } catch (e) {
        logSupabaseError("refreshGlobalLeaderboardList", e, {});
        const msg = e && typeof e === "object" && "message" in e ? String(/** @type {{ message?: string }} */ (e).message) : "";
        elGlobalLeaderboardList.appendChild(
          makeGlobalLbListMessage(msg && msg !== "[object Object]" ? msg : "Network error — could not load global leaderboard.")
        );
      }
    };

    globalLbFetchPromise = runFetch().finally(() => {
      globalLbFetchPromise = null;
    });
    return globalLbFetchPromise;
  }

  async function runGlobalLbSearch() {
    if (!elGlobalLbSearchResults || !elGlobalLbSearchStatus) return;
    const sb = getSupabaseClient();
    if (!sb) {
      elGlobalLbSearchStatus.textContent = "Configure Supabase (URL + anon key) to search.";
      elGlobalLbSearchResults.innerHTML = "";
      return;
    }
    const raw = elGlobalLbSearchInput ? elGlobalLbSearchInput.value : "";
    const q = sanitizeGlobalLbSearchQuery(raw);
    if (!q) {
      elGlobalLbSearchStatus.textContent = "";
      elGlobalLbSearchResults.innerHTML = "";
      return;
    }

    elGlobalLbSearchStatus.textContent = "Searching…";
    elGlobalLbSearchResults.innerHTML = "";
    const selfId = currentSupabaseUser && currentSupabaseUser.id ? String(currentSupabaseUser.id) : "";

    try {
      /** @type {Record<string, unknown>[]} */
      let rows = [];
      if (isProbablyUserUuid(q)) {
        const uid = q.trim();
        const r = await sb.from("leaderboard").select(GLOBAL_LB_SELECT_JOINED).eq("user_id", uid).maybeSingle();
        if (r.error) {
          logSupabaseError("leaderboard.search(uuid)", r.error, { uid });
          const plain = await sb.from("leaderboard").select(GLOBAL_LB_SELECT_PLAIN).eq("user_id", uid).maybeSingle();
          if (plain.error) {
            logSupabaseError("leaderboard.search(uuid) plain", plain.error, {});
            elGlobalLbSearchStatus.textContent = "Could not look up that ID.";
            return;
          }
          if (plain.data) {
            rows = [plain.data];
            await enrichLeaderboardRowsWithProfiles(sb, rows);
          }
        } else if (r.data) {
          rows = [r.data];
        }
      } else {
        const pattern = `%${q}%`;
        const a = await sb
          .from("leaderboard")
          .select(GLOBAL_LB_SELECT_JOINED)
          .ilike("display_name", pattern)
          .order("score", { ascending: false })
          .limit(24);
        /** @type {Record<string, unknown>[]} */
        let fromDisplay = [];
        if (!a.error) {
          fromDisplay = Array.isArray(a.data) ? a.data : [];
        } else {
          logSupabaseError("leaderboard.search(display_name)", a.error, {});
          const ap = await sb
            .from("leaderboard")
            .select(GLOBAL_LB_SELECT_PLAIN)
            .ilike("display_name", pattern)
            .order("score", { ascending: false })
            .limit(24);
          if (!ap.error) {
            fromDisplay = Array.isArray(ap.data) ? ap.data : [];
            await enrichLeaderboardRowsWithProfiles(sb, fromDisplay);
          } else logSupabaseError("leaderboard.search(display_name) plain", ap.error, {});
        }

        const profs = await sb.from("profiles").select("id, username").ilike("username", pattern).limit(24);
        /** @type {Record<string, unknown>[]} */
        let fromProf = [];
        if (profs.error) logSupabaseError("profiles.search", profs.error, {});
        else {
          const ids = (Array.isArray(profs.data) ? profs.data : [])
            .map((p) => (p && p.id ? String(p.id) : ""))
            .filter(Boolean);
          if (ids.length) {
            const lb = await sb.from("leaderboard").select(GLOBAL_LB_SELECT_JOINED).in("user_id", ids).limit(24);
            if (!lb.error) {
              fromProf = Array.isArray(lb.data) ? lb.data : [];
            } else {
              logSupabaseError("leaderboard.search(in profiles)", lb.error, {});
              const lbp = await sb.from("leaderboard").select(GLOBAL_LB_SELECT_PLAIN).in("user_id", ids).limit(24);
              if (!lbp.error) {
                fromProf = Array.isArray(lbp.data) ? lbp.data : [];
                await enrichLeaderboardRowsWithProfiles(sb, fromProf);
              } else logSupabaseError("leaderboard.search(in) plain", lbp.error, {});
            }
          }
        }

        const byId = new Map();
        for (const r of fromDisplay) {
          if (r && r.user_id) byId.set(String(r.user_id), r);
        }
        for (const r of fromProf) {
          if (r && r.user_id) byId.set(String(r.user_id), r);
        }
        rows = Array.from(byId.values());
      }

      rows = rows.filter((r) => !rowIsLeaderboardAdmin(r));
      rows.sort((x, y) => Math.max(0, numLbField(y && y.score, 0)) - Math.max(0, numLbField(x && x.score, 0)));
      elGlobalLbSearchStatus.textContent = rows.length
        ? rows.length === 1
          ? "1 player matches."
          : `${rows.length} players match.`
        : "No matching players.";

      const frag = document.createDocumentFragment();
      for (const row of rows) {
        frag.appendChild(buildGlobalLbPlayerCard(/** @type {Record<string, unknown>} */ (row), selfId, null));
      }
      elGlobalLbSearchResults.appendChild(frag);
    } catch (e) {
      logSupabaseError("runGlobalLbSearch", e, {});
      elGlobalLbSearchStatus.textContent = "Search failed — try again.";
    }
  }

  /**
   * Manual test (Settings button or window.SSB_SUPABASE_TEST()): upsert a test score, then refresh list.
   * Logs every step to the console under [SSB Supabase].
   */
  async function runSupabaseLeaderboardSelfTest() {
    const sb = getSupabaseClient();
    if (!sb) {
      console.error(SB_LOG, "test: no Supabase client");
      showToast("Supabase not configured.");
      return;
    }
    const { user, error: guErr } = await getSessionUser(sb);
    if (guErr || !user) {
      console.error(SB_LOG, "test: need a session — sign in or use anonymous guest in Account modal");
      showToast("Sign in first (password, magic link, or anonymous guest).");
      return;
    }
    await ensureProfile(user);
    const marker = Math.floor(Date.now() / 1000) % 900000 + 100000;
    const { level: tLev, xp: tXp } = levelAndXpFromScore(marker);
    const row = {
      user_id: user.id,
      score: marker,
      level: tLev,
      xp: tXp,
      display_name: deriveProfileUsername(user),
      updated_at: new Date().toISOString(),
    };
    const { data: upData, error: upErr } = await sb.from("leaderboard").upsert(row, { onConflict: "user_id" }).select();
    if (upErr) logSupabaseError("TEST leaderboard.upsert", upErr, { row });
    else console.info(SB_LOG, "TEST upsert ok", upData);
    await refreshGlobalLeaderboardList();
    showToast("Leaderboard test finished — see browser console.", 3200);
  }

  /**
   * @param {string | { forceGlobal?: boolean }} [arg1]
   * @param {{ forceGlobal?: boolean }} [arg2]
   */
  function refreshLeaderboard(arg1, arg2) {
    /** @type {{ forceGlobal?: boolean }} */
    let opts = typeof arg2 === "object" && arg2 !== null ? arg2 : {};
    let filter = "";
    if (typeof arg1 === "object" && arg1 !== null && !Array.isArray(arg1)) {
      opts = /** @type {{ forceGlobal?: boolean }} */ (arg1);
    } else if (arg1 != null && typeof arg1 !== "object") {
      filter = String(arg1).trim();
    }

    if (opts.forceGlobal) void refreshGlobalLeaderboardList();
    else scheduleRefreshGlobalLeaderboardList(90);

    if (!elLeaderboardList) return;
    if (currentSupabaseUser) {
      elLeaderboardList.innerHTML = "";
      elLeaderboardList.appendChild(
        makeLocalLbEmptyRow("While you’re on a global account, only the global table above applies for online scores.")
      );
      return;
    }
    const q = filter.toLowerCase();
    const players = Object.values(save.players)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => b.stats.totalPointsEarned - a.stats.totalPointsEarned);

    elLeaderboardList.innerHTML = "";
    if (players.length === 0) {
      elLeaderboardList.appendChild(makeLocalLbEmptyRow(q ? "No local players match that search." : "No local players yet — create one from the welcome screen."));
      return;
    }
    const frag = document.createDocumentFragment();
    let rank = 0;
    for (const p of players.slice(0, 40)) {
      rank += 1;
      const isSelf = activePlayer && p.id === activePlayer.id;
      const item = document.createElement("div");
      item.className = "localLbRow" + (isSelf ? " localLbRowSelf" : "");
      item.setAttribute("role", "row");

      const rankEl = document.createElement("span");
      rankEl.className = "localLbCell localLbRank";
      rankEl.textContent = String(rank);

      const nameCell = document.createElement("span");
      nameCell.className = "localLbCell localLbName";
      const nameText = document.createElement("span");
      nameText.className = "localLbNameText";
      nameText.textContent = p.name;
      nameCell.appendChild(nameText);
      if (isSelf) {
        const you = document.createElement("span");
        you.className = "localLbYouBadge";
        you.textContent = "Active";
        nameCell.appendChild(you);
      }

      const pts = typeof p.stats.totalPointsEarned === "number" ? p.stats.totalPointsEarned : 0;
      const ptsEl = document.createElement("span");
      ptsEl.className = "localLbCell localLbPoints";
      ptsEl.textContent = formatLbScore(pts);

      const wins = typeof p.stats.totalWins === "number" ? p.stats.totalWins : 0;
      const runs = typeof p.stats.totalRuns === "number" ? p.stats.totalRuns : 0;
      const streak = typeof p.stats.winStreak === "number" ? p.stats.winStreak : 0;
      const bestDiff = typeof p.stats.bestDifficultyBeaten === "number" ? p.stats.bestDifficultyBeaten : 0;
      const most =
        p.stats.mostCompletedLevelId && p.levels[p.stats.mostCompletedLevelId]
          ? p.levels[p.stats.mostCompletedLevelId].name
          : "—";
      const statsEl = document.createElement("span");
      statsEl.className = "localLbCell localLbStats";
      statsEl.appendChild(
        document.createTextNode(`${wins}W / ${runs} runs · streak ${streak} · best diff ${bestDiff.toFixed(1)}`)
      );
      const br = document.createElement("br");
      const small = document.createElement("small");
      small.className = "localLbMostPlayed";
      small.textContent = `Most played level: ${most}`;
      statsEl.appendChild(br);
      statsEl.appendChild(small);

      const actCell = document.createElement("span");
      actCell.className = "localLbCell localLbAction";
      const useBtn = document.createElement("button");
      useBtn.className = "btn btnSmall localLbSwitchBtn";
      useBtn.type = "button";
      useBtn.textContent = "Switch";
      useBtn.addEventListener("click", () => {
        setActivePlayer(p.id);
        closeModal(elLeaderboardModal);
        showToast(`Now playing as ${p.name}.`);
      });
      actCell.appendChild(useBtn);

      item.appendChild(rankEl);
      item.appendChild(nameCell);
      item.appendChild(ptsEl);
      item.appendChild(statsEl);
      item.appendChild(actCell);
      frag.appendChild(item);
    }
    elLeaderboardList.appendChild(frag);
  }

  function makeLocalLbEmptyRow(message) {
    const wrap = document.createElement("div");
    wrap.className = "localLbRow localLbRowEmpty";
    wrap.setAttribute("role", "row");
    const cell = document.createElement("div");
    cell.className = "localLbEmptyMsg";
    cell.textContent = message;
    wrap.appendChild(cell);
    return wrap;
  }

  // ---------- Settings modal ----------
  elOpenSettingsBtn.addEventListener("click", () => openModal(elSettingsModal));
  if (elOpenReportModalBtn) elOpenReportModalBtn.addEventListener("click", () => openModal(elReportModal));
  if (elCloseReportModalBtn) elCloseReportModalBtn.addEventListener("click", () => closeModal(elReportModal));

  // Settings → Report shortcut button (replaces the old duplicate form)
  const elSettingsOpenReportBtn = document.getElementById("settingsOpenReportBtn");
  if (elSettingsOpenReportBtn) {
    elSettingsOpenReportBtn.addEventListener("click", () => {
      closeModal(elSettingsModal);
      openModal(elReportModal);
    });
  }

  // ---------- Topbar hamburger menu ----------
  (function initHamburger() {
    const menuBtn = document.getElementById("topbarMenuBtn");
    const drawer = document.getElementById("topbarDrawer");
    if (!menuBtn || !drawer) return;
    let open = false;
    function setDrawer(state) {
      open = state;
      drawer.classList.toggle("topbarDrawerOpen", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.textContent = open ? "✕" : "☰";
    }
    menuBtn.addEventListener("click", (e) => { e.stopPropagation(); setDrawer(!open); });
    document.addEventListener("click", (e) => {
      if (open && !drawer.contains(/** @type {Node} */(e.target)) && e.target !== menuBtn) setDrawer(false);
    });
    // Close drawer when any button inside it is clicked
    drawer.addEventListener("click", () => { setTimeout(() => setDrawer(false), 80); });
  })();

  // ---------- Right sidebar collapse ----------
  (function initSidebarCollapse() {
    const sidebar = document.getElementById("rightSidebar");
    const collapseBtn = document.getElementById("sidebarCollapseBtn");
    if (!sidebar || !collapseBtn) return;
    let collapsed = localStorage.getItem("ssbSidebarCollapsed") === "1";
    function apply() {
      sidebar.classList.toggle("sidebarCollapsed", collapsed);
      collapseBtn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
      collapseBtn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
      collapseBtn.textContent = collapsed ? "▶" : "◀";
      localStorage.setItem("ssbSidebarCollapsed", collapsed ? "1" : "0");
    }
    apply();
    collapseBtn.addEventListener("click", () => { collapsed = !collapsed; apply(); });
  })();

  // ---------- Portrait orientation overlay ----------
  (function initPortraitOverlay() {
    const overlay = document.getElementById("portraitOverlay");
    const dismissBtn = document.getElementById("portraitOverlayDismiss");
    if (!overlay) return;
    let dismissedThisSession = false;
    function check() {
      if (dismissedThisSession) { overlay.classList.add("hidden"); return; }
      const isTouchMode = document.documentElement.classList.contains("device-touch-mode");
      const isPortrait = window.innerWidth < window.innerHeight && window.innerWidth < 600;
      overlay.classList.toggle("hidden", !(isTouchMode && isPortrait));
    }
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => { dismissedThisSession = true; overlay.classList.add("hidden"); });
    }
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", () => setTimeout(check, 120));
    // Re-check whenever device mode is set — hook after a tick so setDeviceMode runs first
    const origSetDeviceMode = window.__ssbSetDeviceModeRef;
    check();
  })();
  if (elTogglePuzzleLinksBtn) {
    elTogglePuzzleLinksBtn.addEventListener("click", () => {
      showPuzzleLinks = !showPuzzleLinks;
      save.settings.showPuzzleLinks = showPuzzleLinks;
      persist();
      elTogglePuzzleLinksBtn.textContent = showPuzzleLinks ? "Puzzle links: ON" : "Puzzle links: OFF";
      elTogglePuzzleLinksBtn.classList.toggle("primary", showPuzzleLinks);
      elTogglePuzzleLinksBtn.classList.toggle("subtle", !showPuzzleLinks);
      showToast(showPuzzleLinks ? "Puzzle link lines shown." : "Puzzle link lines hidden.", 1200);
    });
  }

  function setRightSidebarTab(tabId) {
    rightSidebarTab = tabId === "customization" ? "customization" : "coins";
    if (elRightTabCoinsBtn) {
      elRightTabCoinsBtn.classList.toggle("primary", rightSidebarTab === "coins");
      elRightTabCoinsBtn.classList.toggle("active", rightSidebarTab === "coins");
    }
    if (elRightTabCustomizationBtn) {
      elRightTabCustomizationBtn.classList.toggle("primary", rightSidebarTab === "customization");
      elRightTabCustomizationBtn.classList.toggle("active", rightSidebarTab === "customization");
    }
    if (elRightTabCoins) elRightTabCoins.classList.toggle("hidden", rightSidebarTab !== "coins");
    if (elRightTabCustomization) elRightTabCustomization.classList.toggle("hidden", rightSidebarTab !== "customization");
  }

  if (elRightTabCoinsBtn) elRightTabCoinsBtn.addEventListener("click", () => setRightSidebarTab("coins"));
  if (elRightTabCustomizationBtn) elRightTabCustomizationBtn.addEventListener("click", () => setRightSidebarTab("customization"));
  if (elOpenCustomizationWindowBtn) {
    elOpenCustomizationWindowBtn.addEventListener("click", () => {
      openModal(elCustomizationModal);
      renderAvatarShop();
      void primeAllAvatarAssetsForShop();
    });
  }
  if (elCloseCustomizationModalBtn) elCloseCustomizationModalBtn.addEventListener("click", () => closeModal(elCustomizationModal));
  if (elSubmitIssueReportBtn) {
    elSubmitIssueReportBtn.addEventListener("click", () => {
      void (async () => {
        const category = elIssueTypeSelect ? String(elIssueTypeSelect.value || "other") : "other";
        const targetUserId = elIssueTargetUserInput ? String(elIssueTargetUserInput.value || "").trim() : "";
        const details = elIssueDetailsInput ? String(elIssueDetailsInput.value || "").trim() : "";
        if (!details) {
          showToast("Please add issue details first.", 1700);
          return;
        }
        const res = await submitIssueReport({
          category,
          targetUserId: targetUserId || null,
          details,
          technical: { source: "manual_report" },
        });
        if (!res.ok) {
          if (isAdminUser) showToast(`Report failed: ${String(res.reason || "unknown")}`, 3000);
          else showToast("Could not send report right now. Please try again.", 2600);
          return;
        }
        if (elIssueDetailsInput) elIssueDetailsInput.value = "";
        if (elIssueTargetUserInput) elIssueTargetUserInput.value = "";
        showToast("Report sent to admins. Thanks!", 2200);
      })();
    });
  }
  if (elQuickSubmitIssueReportBtn) {
    elQuickSubmitIssueReportBtn.addEventListener("click", () => {
      void (async () => {
        const category = elQuickIssueTypeSelect ? String(elQuickIssueTypeSelect.value || "other") : "other";
        const targetUserId = elQuickIssueTargetUserInput ? String(elQuickIssueTargetUserInput.value || "").trim() : "";
        const details = elQuickIssueDetailsInput ? String(elQuickIssueDetailsInput.value || "").trim() : "";
        if (!details) {
          showToast("Please add issue details first.", 1700);
          return;
        }
        const res = await submitIssueReport({
          category,
          targetUserId: targetUserId || null,
          details,
          technical: { source: "quick_report_modal" },
        });
        if (!res.ok) {
          if (isAdminUser) showToast(`Report failed: ${String(res.reason || "unknown")}`, 3000);
          else showToast("Could not send report right now. Please try again.", 2600);
          return;
        }
        if (elQuickIssueDetailsInput) elQuickIssueDetailsInput.value = "";
        if (elQuickIssueTargetUserInput) elQuickIssueTargetUserInput.value = "";
        closeModal(elReportModal);
        showToast("Report sent to admins. Thanks!", 2200);
      })();
    });
  }
  if (elAvatarRandomEquipBtn) {
    elAvatarRandomEquipBtn.addEventListener("click", () => {
      const owned = Array.from(getOwnedAvatarSet()).filter((id) => !!avatarById(id));
      const options = ["default", ...owned];
      const pick = options[Math.floor(Math.random() * options.length)];
      if (pick === "default") void equipDefaultGhost();
      else void equipAvatar(String(pick));
    });
  }
  setRightSidebarTab("coins");

  async function refreshAdminPanel() {
    if (!isAdminUser) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    if (elAdminReportsList) {
      elAdminReportsList.innerHTML = "";
      const { data, error } = await sb
        .from("level_reports")
        .select("id, level_id, reporter_user_id, reason_code, reason, status, created_at")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) {
        logSupabaseError("admin level_reports.select", error, {});
      } else if (Array.isArray(data) && data.length) {
        for (const r of data) {
          const row = document.createElement("div");
          row.className = "listItem";
          const meta = document.createElement("div");
          meta.className = "meta";
          const name = document.createElement("div");
          name.className = "name";
          name.textContent = `Report ${String(r.id || "").slice(0, 8)} · ${r.status || "open"}`;
          const sub = document.createElement("div");
          sub.className = "sub";
          sub.textContent = `Level ${String(r.level_id || "").slice(0, 8)} · By ${String(r.reporter_user_id || "").slice(0, 8)} · ${r.reason || r.reason_code || "No reason"}`;
          meta.appendChild(name);
          meta.appendChild(sub);
          const actions = document.createElement("div");
          actions.className = "actions";
          const resolveBtn = document.createElement("button");
          resolveBtn.className = "btn subtle";
          resolveBtn.type = "button";
          resolveBtn.textContent = "Resolve";
          resolveBtn.addEventListener("click", async () => {
            const { error: upErr } = await sb.from("level_reports").update({ status: "resolved" }).eq("id", r.id);
            if (upErr) logSupabaseError("admin level_reports.update", upErr, { id: r.id });
            await refreshAdminPanel();
          });
          actions.appendChild(resolveBtn);
          row.appendChild(meta);
          row.appendChild(actions);
          elAdminReportsList.appendChild(row);
        }
      } else {
        elAdminReportsList.textContent = "No reports yet.";
      }
    }

    if (elAdminLevelsList) {
      elAdminLevelsList.innerHTML = "";
      const { data, error } = await sb.from("global_levels").select("id, name, author_id, created_at").order("created_at", { ascending: false }).limit(80);
      if (error) {
        logSupabaseError("admin global_levels.select", error, {});
      } else if (Array.isArray(data) && data.length) {
        for (const gl of data) {
          const row = document.createElement("div");
          row.className = "listItem";
          const meta = document.createElement("div");
          meta.className = "meta";
          const name = document.createElement("div");
          name.className = "name";
          name.textContent = String(gl.name || "Untitled");
          const sub = document.createElement("div");
          sub.className = "sub";
          sub.textContent = `Level ${String(gl.id || "").slice(0, 8)} · Author ${String(gl.author_id || "").slice(0, 8)}`;
          meta.appendChild(name);
          meta.appendChild(sub);
          const actions = document.createElement("div");
          actions.className = "actions";
          const removeBtn = document.createElement("button");
          removeBtn.className = "btn danger";
          removeBtn.type = "button";
          removeBtn.textContent = "Remove";
          removeBtn.addEventListener("click", async () => {
            const { error: delErr } = await sb.from("global_levels").delete().eq("id", gl.id);
            if (delErr) logSupabaseError("admin global_levels.delete", delErr, { id: gl.id });
            await refreshAdminPanel();
          });
          actions.appendChild(removeBtn);
          row.appendChild(meta);
          row.appendChild(actions);
          elAdminLevelsList.appendChild(row);
        }
      } else {
        elAdminLevelsList.textContent = "No global levels found.";
      }
    }

    if (elAdminIssueReportsList) {
      elAdminIssueReportsList.innerHTML = "";
      const { data, error } = await sb
        .from("ssb_issue_reports")
        .select("id, reporter_user_id, reporter_email, category, target_user_id, details, status, created_at")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) {
        logSupabaseError("admin ssb_issue_reports.select", error, {});
      } else if (Array.isArray(data) && data.length) {
        for (const r of data) {
          const row = document.createElement("div");
          row.className = "listItem";
          const meta = document.createElement("div");
          meta.className = "meta";
          const name = document.createElement("div");
          name.className = "name";
          name.textContent = `${String(r.category || "issue")} · ${String(r.status || "open")}`;
          const sub = document.createElement("div");
          sub.className = "sub";
          sub.textContent = `${String(r.details || "").slice(0, 180)} · by ${String(r.reporter_email || r.reporter_user_id || "unknown").slice(0, 60)}${r.target_user_id ? " · target " + String(r.target_user_id).slice(0, 40) : ""}`;
          meta.appendChild(name);
          meta.appendChild(sub);
          const actions = document.createElement("div");
          actions.className = "actions";
          if (String(r.status || "open") !== "resolved") {
            const resolveBtn = document.createElement("button");
            resolveBtn.className = "btn subtle";
            resolveBtn.type = "button";
            resolveBtn.textContent = "Resolve";
            resolveBtn.addEventListener("click", async () => {
              const { error: upErr } = await sb.from("ssb_issue_reports").update({ status: "resolved" }).eq("id", r.id);
              if (upErr) logSupabaseError("admin ssb_issue_reports.update", upErr, { id: r.id });
              await refreshAdminPanel();
            });
            actions.appendChild(resolveBtn);
          }
          row.appendChild(meta);
          row.appendChild(actions);
          elAdminIssueReportsList.appendChild(row);
        }
      } else {
        elAdminIssueReportsList.textContent = "No issue reports yet.";
      }
    }
  }

  if (elOpenAdminBtn) {
    elOpenAdminBtn.addEventListener("click", () => {
      if (!isAdminUser) return;
      openModal(elAdminModal);
      void refreshAdminPanel();
      void fetchGameAnnouncementIntoEditor(elAdminAnnouncementEditor);
    });
  }
  if (elCloseAdminModalBtn) elCloseAdminModalBtn.addEventListener("click", () => closeModal(elAdminModal));
  function sanitizeAnnouncementHtml(raw) {
    const s = String(raw || "");
    const doc = new DOMParser().parseFromString(`<div>${s}</div>`, "text/html");
    const walk = (el) => {
      const allowed = new Set(["P", "DIV", "SPAN", "BR", "B", "STRONG", "I", "EM", "U", "A", "UL", "OL", "LI", "H1", "H2", "H3"]);
      for (const ch of Array.from(el.children)) {
        const tag = ch.tagName;
        if (!allowed.has(tag)) {
          ch.replaceWith(...Array.from(ch.childNodes));
          walk(el);
          return;
        }
        for (const attr of Array.from(ch.attributes)) {
          const n = attr.name.toLowerCase();
          if (n.startsWith("on")) ch.removeAttribute(attr.name);
          else if (n === "style") {
            if (!["SPAN", "P", "DIV"].includes(tag)) ch.removeAttribute(attr.name);
            else {
              const v = attr.value.toLowerCase();
              if (v.includes("url(") || v.includes("expression") || v.includes("javascript") || v.includes("@import"))
                ch.removeAttribute(attr.name);
            }
          } else if (tag === "A" && n !== "href" && n !== "target" && n !== "rel") ch.removeAttribute(attr.name);
          else if (tag !== "A" && n !== "class") ch.removeAttribute(attr.name);
        }
        if (tag === "A") {
          const h = (ch.getAttribute("href") || "").trim();
          if (!/^https?:\/\//i.test(h)) {
            ch.removeAttribute("href");
            ch.setAttribute("data-invalid-href", "1");
          } else {
            ch.setAttribute("rel", "noopener noreferrer");
            ch.setAttribute("target", "_blank");
          }
        }
        walk(ch);
      }
    };
    walk(doc.body.firstElementChild || doc.body);
    return (doc.body.firstElementChild && doc.body.firstElementChild.innerHTML) || "";
  }

  async function fetchGameAnnouncementIntoEditor(target) {
    const sb = getSupabaseClient();
    if (!sb || !target) return;
    try {
      const { data, error } = await sb.from("game_announcement").select("body_html, updated_at").eq("id", 1).maybeSingle();
      if (error) {
        logSupabaseError("game_announcement.select", error, {});
        return;
      }
      if (data && typeof data.body_html === "string") target.value = data.body_html;
    } catch (e) {
      logSupabaseError("fetchGameAnnouncementIntoEditor", e, {});
    }
  }

  async function openAnnouncementViewerModal() {
    if (!elAnnouncementModal || !elAnnouncementModalContent) return;
    const sb = getSupabaseClient();
    let html = "<p>Thanks for playing!</p>";
    let updated = "";
    if (sb && isSupabaseConfigured()) {
      try {
        const { data, error } = await sb.from("game_announcement").select("body_html, updated_at").eq("id", 1).maybeSingle();
        if (!error && data && typeof data.body_html === "string" && data.body_html.trim()) html = data.body_html;
        if (!error && data && data.updated_at) updated = `Last updated: ${data.updated_at}`;
      } catch (e) {
        logSupabaseError("announcement viewer load", e, {});
      }
    }
    elAnnouncementModalContent.innerHTML = sanitizeAnnouncementHtml(html);
    if (elAnnouncementModalUpdated) elAnnouncementModalUpdated.textContent = updated;
    openModal(elAnnouncementModal);
  }

  async function saveGameAnnouncementFromTextarea(ta) {
    if (!isStaffModerator() || !ta) return;
    const sb = getSupabaseClient();
    if (!sb) {
      showToast("Sign in with Supabase to save.", 2200);
      return;
    }
    const clean = sanitizeAnnouncementHtml(ta.value).slice(0, 20000);
    try {
      const { error } = await sb.from("game_announcement").update({ body_html: clean, updated_by: currentSupabaseUser ? currentSupabaseUser.id : null }).eq("id", 1);
      if (error) {
        logSupabaseError("game_announcement.update", error, {});
        showToast("Could not save message (check DB policy / run SQL migration).", 2800);
        return;
      }
      showToast("Team message saved.", 1800);
    } catch (e) {
      logSupabaseError("saveGameAnnouncementFromTextarea", e, {});
    }
  }

  if (elSettingsSecretSparkleBtn) {
    elSettingsSecretSparkleBtn.addEventListener("click", () => void openAnnouncementViewerModal());
  }
  if (elCloseAnnouncementModalBtn) elCloseAnnouncementModalBtn.addEventListener("click", () => closeModal(elAnnouncementModal));

  if (elOpenModBtn) {
    elOpenModBtn.addEventListener("click", () => {
      if (!isStaffModerator() || isAdminUser) return;
      openModal(elModModal);
      void fetchGameAnnouncementIntoEditor(elModAnnouncementEditor);
    });
  }
  if (elCloseModModalBtn) elCloseModModalBtn.addEventListener("click", () => closeModal(elModModal));
  if (elModBanUserBtn) elModBanUserBtn.addEventListener("click", async () => await upsertModerationStatus("banned", 0));
  if (elModRestrictUserBtn) elModRestrictUserBtn.addEventListener("click", async () => await upsertModerationStatus("restricted", 7));
  if (elModUnbanUserBtn) elModUnbanUserBtn.addEventListener("click", async () => await upsertModerationStatus("none", 0));
  if (elModAnnouncementSaveBtn) elModAnnouncementSaveBtn.addEventListener("click", () => void saveGameAnnouncementFromTextarea(elModAnnouncementEditor));
  if (elModAnnouncementPreviewBtn) {
    elModAnnouncementPreviewBtn.addEventListener("click", () => {
      if (!elModAnnouncementEditor || !elAnnouncementModalContent) return;
      elAnnouncementModalContent.innerHTML = sanitizeAnnouncementHtml(elModAnnouncementEditor.value);
      if (elAnnouncementModalUpdated) elAnnouncementModalUpdated.textContent = "Preview (not saved)";
      openModal(elAnnouncementModal);
    });
  }

  if (elAdminGrantModBtn) {
    elAdminGrantModBtn.addEventListener("click", async () => {
      if (!isAdminUser || !elAdminModUserIdInput) return;
      const uid = (elAdminModUserIdInput.value || "").trim();
      if (!uid) return;
      const sb = getSupabaseClient();
      if (!sb) return;
      const { data, error } = await sb.rpc("ssb_set_user_mod", { p_target_user_id: uid, p_is_mod: true });
      if (error) logSupabaseError("ssb_set_user_mod grant", error, { uid });
      else if (data === false) showToast("Could not grant mod (target is admin or invalid).", 2600);
      else showToast("Mod granted.", 1800);
    });
  }
  if (elAdminRevokeModBtn) {
    elAdminRevokeModBtn.addEventListener("click", async () => {
      if (!isAdminUser || !elAdminModUserIdInput) return;
      const uid = (elAdminModUserIdInput.value || "").trim();
      if (!uid) return;
      const sb = getSupabaseClient();
      if (!sb) return;
      const { data, error } = await sb.rpc("ssb_set_user_mod", { p_target_user_id: uid, p_is_mod: false });
      if (error) logSupabaseError("ssb_set_user_mod revoke", error, { uid });
      else showToast("Mod revoked.", 1800);
    });
  }
  if (elAdminAnnouncementSaveBtn) {
    elAdminAnnouncementSaveBtn.addEventListener("click", () => void saveGameAnnouncementFromTextarea(elAdminAnnouncementEditor));
  }
  if (elAdminAnnouncementReloadBtn) {
    elAdminAnnouncementReloadBtn.addEventListener("click", () => void fetchGameAnnouncementIntoEditor(elAdminAnnouncementEditor));
  }

  if (elAdminRemoveLeaderboardBtn) {
    elAdminRemoveLeaderboardBtn.addEventListener("click", async () => {
      if (!isAdminUser || !elAdminLeaderboardUserIdInput) return;
      const uid = (elAdminLeaderboardUserIdInput.value || "").trim();
      if (!uid) return;
      const sb = getSupabaseClient();
      if (!sb) return;
      const { error } = await sb.from("leaderboard").delete().eq("user_id", uid);
      if (error) logSupabaseError("admin leaderboard.delete", error, { uid });
      else showToast("Leaderboard row removed.", 1800);
    });
  }
  async function upsertModerationStatus(status, days = 0) {
    if (!isStaffModerator()) return;
    let userId = (elAdminModerationUserIdInput && elAdminModerationUserIdInput.value ? elAdminModerationUserIdInput.value : "").trim();
    if (!userId && elModModerationUserIdInput) userId = (elModModerationUserIdInput.value || "").trim();
    if (!userId) return;
    let reason = (elAdminModerationReasonInput && elAdminModerationReasonInput.value ? elAdminModerationReasonInput.value : "").trim();
    if (!reason && elModModerationReasonInput && elModModerationReasonInput.value) reason = String(elModModerationReasonInput.value).trim();
    const untilAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    const sb = getSupabaseClient();
    if (!sb) return;
    const payload = {
      user_id: userId,
      status,
      reason: reason || null,
      until_at: untilAt,
      updated_by: currentSupabaseUser ? currentSupabaseUser.id : null,
    };
    const { error } = await sb.from("user_moderation").upsert(payload, { onConflict: "user_id" });
    if (error) {
      logSupabaseError("admin user_moderation.upsert", error, payload);
      return;
    }
    showToast(status === "none" ? "Moderation removed." : `User ${status}.`, 1800);
  }
  if (elAdminBanUserBtn) {
    elAdminBanUserBtn.addEventListener("click", async () => {
      await upsertModerationStatus("banned", 0);
    });
  }
  if (elAdminRestrictUserBtn) {
    elAdminRestrictUserBtn.addEventListener("click", async () => {
      await upsertModerationStatus("restricted", 7);
    });
  }
  if (elAdminUnbanUserBtn) {
    elAdminUnbanUserBtn.addEventListener("click", async () => {
      await upsertModerationStatus("none", 0);
    });
  }

  // ---------- Modal close wiring ----------
  elBackdrop.addEventListener("click", () => {
    if (pendingAdminSave && elAdminPublishLevelModal && !elAdminPublishLevelModal.classList.contains("hidden")) {
      const ps = pendingAdminSave;
      pendingAdminSave = null;
      adminPublishResolve = null;
      closeModal(elAdminPublishLevelModal);
      saveLevel(ps.name, ps.meta, "local_only");
    }
    closeModal(elStartModal);
    closeModal(elLevelsModal);
    closeModal(elLeaderboardModal);
    closeModal(elSettingsModal);
    closeModal(elReportModal);
    closeModal(elCustomizationModal);
    closeModal(elAdminModal);
    closeModal(elModModal);
    closeModal(elAnnouncementModal);
    closeModal(elAdminPublishLevelModal);
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (isUiTypingTarget(/** @type {Element} */ (e.target))) return;
      if (allModalsClosed()) return;
      if (pendingAdminSave && elAdminPublishLevelModal && !elAdminPublishLevelModal.classList.contains("hidden")) return;
      closeModal(elAdminPublishLevelModal);
      closeModal(elCustomizationModal);
      closeModal(elAnnouncementModal);
      closeModal(elModModal);
      closeModal(elAdminModal);
      closeModal(elMultiplayerModal);
      closeModal(elSettingsModal);
      closeModal(elReportModal);
      closeModal(elLeaderboardModal);
      closeModal(elLevelsModal);
      closeModal(elStartModal);
      e.preventDefault();
    },
    { passive: false }
  );
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
   * @property {number} teleportLockUntil
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
   * @property {{fireAt:number,runT0:number,strength:number}[]} pendingPadJumps
   * @property {string|null} playFeaturedTier
   * @property {Record<string, { x: number, y: number }>} links
   * @property {{ fromX:number, fromY:number, toX:number, toY:number, t0:number, dur:number }[]} teleportFx
   */

  /** @type {PlayState | null} */
  let play = null;

  /** @type {Record<string, {attempts:number, bestTimeMs:number}>} */
  let builtinLevelStats = {};

  // ADD 1: Ghost replay system — record player position every ~50ms during a PB run.
  /** @type {Record<string, Array<{t:number,x:number,y:number,vx:number}>>} */
  let pbGhostFrames = {};
  /** @type {Array<{t:number,x:number,y:number,vx:number}>} */
  let currentRunGhostRecord = [];
  let ghostRecordLastMs = -1;

  /** Load per-player timed bests from save into the in-memory map used during play. */
  function hydrateBuiltinLevelStatsFromPlayer() {
    builtinLevelStats = {};
    if (!activePlayer) return;
    const pb = activePlayer.timedLevelPb;
    if (!pb || typeof pb !== "object") return;
    for (const id of Object.keys(pb)) {
      const row = pb[id];
      if (row && typeof row.bestTimeMs === "number" && Number.isFinite(row.bestTimeMs) && row.bestTimeMs > 0) {
        builtinLevelStats[id] = { attempts: 0, bestTimeMs: row.bestTimeMs };
        // ADD 1: Load cached ghost frames from localStorage.
        try {
          const raw = localStorage.getItem("ssb_ghost_" + id);
          if (raw) pbGhostFrames[id] = JSON.parse(raw);
        } catch { /* ignore */ }
      }
    }
  }

  function flushTimedLevelPbToSave(levelId) {
    if (!activePlayer || !levelId) return;
    const st = builtinLevelStats[levelId];
    if (!st || !(st.bestTimeMs < Infinity)) return;
    if (!activePlayer.timedLevelPb) activePlayer.timedLevelPb = {};
    activePlayer.timedLevelPb[levelId] = { bestTimeMs: st.bestTimeMs };
    persist();
  }

  /** Powerups selected for next built-in level (consumed when level starts) */
  let pendingPowerupsForRun = { doubleJump: false, speedBoost: false, protection: false };

  function setMode(next) {
    if (next === mode) return;
    if (next === "play") {
      lastBuildStatusText = "";
      flushBuildValidation();
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
      elStatusPill.textContent = "Build: pan map · place tiles (sabotage hidden)";
      elRunHint.textContent = "Wheel / middle-drag / two-finger drag / arrows to pan the map.";
      clampBuildCam();
      flushBuildValidation();
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
      // Next level is not part of the daily challenge flow.
      startPlay(nextLevel.id, nextIndex, play.usedPowerups, null);
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
   * @param {{ featuredTier?: string } | null} [playOptions]
   */
  function startPlay(sourceLevelId, builtinIndex = null, usedPowerupsFromPrevRun = null, dailyChallengeMeta = null, playOptions = null) {
    if (blockedActionGuard()) return;
    hideEndOverlay();
    if (elChallengeNoDj) pendingChallengeOpts.noDoubleJump = !!elChallengeNoDj.checked;
    if (elChallengeMaxDeaths) pendingChallengeOpts.maxDeaths = Math.max(0, parseInt(elChallengeMaxDeaths.value, 10) || 0);
    mode = "play";
    syncTouchControlsVisibility();
    syncExitAndRotateUI();
    elRestartBtn.disabled = false;
    elPlayBtn.classList.add("primary");
    elBuildBtn.classList.remove("primary");
    elStatusPill.textContent = "Play: reach the Goal";
    elRunHint.textContent = "Sabotage is active (seeded this run).";
    // REMOVE 5: Ensure online MP and local hot-seat MP are mutually exclusive.
    const isOnlineMp = !!(mpSocket && mpRoomId);
    const isLocalMp = localMpEnabled && !isOnlineMp;
    showToast(isLocalMp ? `${localMpPlayers[localMpTurn]} turn. Sabotage activated.` : "Play mode. Sabotage activated.");
    if (sourceLevelId) {
      builtinLevelStats[sourceLevelId] = builtinLevelStats[sourceLevelId] || { attempts: 0, bestTimeMs: Infinity };
      builtinLevelStats[sourceLevelId].attempts = (builtinLevelStats[sourceLevelId].attempts | 0) + 1;
    }
    const popts = playOptions && typeof playOptions === "object" ? { ...playOptions } : {};
    const isPreconfigured = builtinIndex != null || (sourceLevelId && String(sourceLevelId).startsWith("feat:"));
    if (isPreconfigured && sourceLevelId && builtinLevelStats[sourceLevelId]) {
      const extra = Math.floor(Math.max(0, (builtinLevelStats[sourceLevelId].attempts | 0) - 1) / 5);
      if (extra > 0) popts.extraSabotage = extra;
    }
    if (mpSocket && mpRoomId) popts.multiplayerActive = true;
    play = createPlayState(
      sourceLevelId,
      builtinIndex,
      1,
      usedPowerupsFromPrevRun,
      dailyChallengeMeta,
      Object.keys(popts).length ? popts : null
    );
    if (play) {
      const cursed =
        play.sabotageController && typeof play.sabotageController.isCursedSeed === "function" && play.sabotageController.isCursedSeed();
      const seedText = `Seed #${play.runSeed >>> 0}`;
      // ADD 3: Show last sabotage event in run hint
      const recentSab = sabotageEventLog.length > 0 ? sabotageEventLog[sabotageEventLog.length - 1] : null;
      const sabHint = recentSab ? ` · ⚡ ${recentSab.id.replace(/_/g, " ")}` : "";
      elRunHint.textContent = cursed ? `${seedText} · this seed feels cursed.${sabHint}` : `${seedText} · sabotage pattern is learnable.${sabHint}`;
      document.body.classList.remove("legendary-cute", "legendary-cursed");
      vibeNextAt = performance.now() + 2600;
    }
    void primeEquippedAvatarOnly();
    if (activePlayer) {
      activePlayer.stats.totalRuns++;
      persist();
    }
  }

  /**
   * @param {{ featuredTier?: string, forcedRunSeed?: number, multiplayerActive?: boolean } | null} [base]
   */
  function mergeMpPlayOptions(base) {
    const o = base && typeof base === "object" ? { ...base } : {};
    if (mpSocket && mpRoomId) o.multiplayerActive = true;
    if (typeof mpPendingForcedSeed === "number" && Number.isFinite(mpPendingForcedSeed)) {
      o.forcedRunSeed = mpPendingForcedSeed >>> 0;
    }
    return Object.keys(o).length ? o : null;
  }

  function doRestartPlayCore() {
    hideEndOverlay();
    const prev = play;
    if (prev && prev.dailyChallenge && prev.dailyChallenge.completedLocal === false) {
      // BUG FIX 3: Use the already-incremented attemptsUsedLocal (updated on both win and lose in end()).
      const used = prev.dailyChallenge.attemptsUsedLocal | 0;
      if (used >= 5) {
        showToast("Daily attempts reached. Come back tomorrow.", 2200);
        return;
      }
      // Also block retrying a completed daily.
    } else if (prev && prev.dailyChallenge && prev.dailyChallenge.completedLocal === true) {
      showToast("Daily challenge already completed today!", 2200);
      return;
    }
    const nextAttempts = prev ? prev.runAttempts + 1 : 1;
    const used = prev && prev.sourceLevelId ? prev.usedPowerups : { doubleJump: false, speedBoost: false, protection: false };
    const featOpt = prev && prev.playFeaturedTier ? { featuredTier: prev.playFeaturedTier } : null;
    const merged = mergeMpPlayOptions(featOpt);
    play = createPlayState(
      prev ? prev.sourceLevelId : null,
      prev ? prev.sourceBuiltinIndex : null,
      nextAttempts,
      used,
      prev ? prev.dailyChallenge : null,
      merged
    );
    mpPendingForcedSeed = null;
    void primeEquippedAvatarOnly();
    showToast("Restarted run.");
  }

  function restartPlay() {
    if (mode !== "play") return;
    if (mpSocket && mpRoomId) {
      if (mpIsHost) {
        const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
        mpSocket.emit("mp_run", { seed });
        return;
      }
      mpSocket.emit("mp_run_request");
      return;
    }
    doRestartPlayCore();
  }

  /** @param {number|null} builtinIndex */
  function getTimerLimitMs(builtinIndex, featuredTier = null) {
    const ft = typeof featuredTier === "string" ? featuredTier.trim().toLowerCase() : "";
    if (ft === "easy") return 2 * 60 * 1000;
    if (ft === "medium") return 1.5 * 60 * 1000;
    if (ft === "hard") return 1 * 60 * 1000;
    if (builtinIndex == null) return 0;
    const level = BUILTIN_LEVELS[builtinIndex];
    if (!level) return 0;
    if (level.tier === "tutorial" || level.tier === "easy") return 2 * 60 * 1000;
    if (level.tier === "medium") return 1.5 * 60 * 1000;
    if (level.tier === "hard") return 1 * 60 * 1000;
    return 0;
  }

  /**
   * @param {string|null} sourceLevelId
   * @param {number|null} builtinIndex
   * @param {number} runAttempts
   * @param {{doubleJump:boolean,speedBoost:boolean,protection:boolean}} [selectedPowerups] If from prev run (e.g. Next level), reuse without consuming.
   * @param {{ featuredTier?: string, forcedRunSeed?: number, multiplayerActive?: boolean } | null} [playOptions] Admin-featured tier + optional multiplayer sync.
   */
  function createPlayState(sourceLevelId, builtinIndex = null, runAttempts = 1, selectedPowerups = null, dailyChallengeMeta = null, playOptions = null) {
    const t0 = performance.now();
    const forcedSeed =
      playOptions && typeof playOptions.forcedRunSeed === "number" && Number.isFinite(playOptions.forcedRunSeed);
    const runSeed = forcedSeed ? (playOptions.forcedRunSeed >>> 0) : (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
    const playFeaturedTier =
      playOptions && typeof playOptions.featuredTier === "string" ? playOptions.featuredTier.trim().toLowerCase() : null;
    const multiplayerActive = !!(playOptions && playOptions.multiplayerActive);
    const extraSabotage = playOptions && typeof playOptions.extraSabotage === "number" ? Math.max(0, playOptions.extraSabotage | 0) : 0;
    const tiles = makeRuntimeTiles(runSeed, sourceLevelId, playFeaturedTier, extraSabotage);
    const start = findType(Tile.start) || { x: 2, y: ROWS - 3 };
    /** @type {{ x: number, y: number }} */
    let spawn = {
      x: start.x * TILE + TILE / 2,
      y: start.y * TILE - 2,
    };
    if (
      testSpawnCell &&
      tileAllowsTestSpawn(testSpawnCell.gx, testSpawnCell.gy) &&
      sourceLevelId == null &&
      builtinIndex == null
    ) {
      spawn = {
        x: testSpawnCell.gx * TILE + TILE / 2,
        y: testSpawnCell.gy * TILE - 2,
      };
    }

    const challengeNoDj = !!pendingChallengeOpts.noDoubleJump;
    const challengeMaxDeaths = Math.max(0, pendingChallengeOpts.maxDeaths | 0);
    /** @type {{ dayKey: string, attemptsUsedLocal: number, completedLocal: boolean, coinsAwardedLocal: boolean } | null} */
    const dailyChallenge = dailyChallengeMeta && typeof dailyChallengeMeta === "object" ? dailyChallengeMeta : null;

    /** @type {{doubleJump:boolean,speedBoost:boolean,protection:boolean}} */
    let usedPowerups = { doubleJump: false, speedBoost: false, protection: false };
    const reusingFromPrevRun = selectedPowerups && typeof selectedPowerups.doubleJump === "boolean";
    if (reusingFromPrevRun) {
      usedPowerups = { ...selectedPowerups };
    } else {
      const sel = selectedPowerups || pendingPowerupsForRun;
      // BUG FIX 2: Only consume powerups on real named levels (builtins or featured),
      // never on custom build-mode test runs where sourceLevelId is null.
      const isPaidRun = !!sourceLevelId && (
        builtinIndex != null ||
        String(sourceLevelId).startsWith("feat:") ||
        String(sourceLevelId).startsWith("user:") ||
        String(sourceLevelId).startsWith("global:")
      );
      if (isPaidRun && activePlayer && activePlayer.powerups) {
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

    const timerLimitMs = getTimerLimitMs(builtinIndex, playFeaturedTier);

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
      landPop: 0,
      teleportLockUntil: 0,
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
      bgParallaxX: spawn.x * BG_PARALLAX_LINK_X,
      bgParallaxY: spawn.y * BG_PARALLAX_LINK_Y,
      checkpointActive: false,
      checkpointX: spawn.x,
      checkpointY: spawn.y,
      checkpointGx: -1,
      checkpointGy: -1,
      effects: { invertUntil: 0, speedBoostUntil: 0, stabilityUntil: 0 },
      sourceLevelId,
      sourceBuiltinIndex: builtinIndex,
      runAttempts,
      particles: [],
      hammer: null,
      timerLimitMs,
      timerRemainingMs: timerLimitMs,
      usedPowerups,
      pendingPadJumps: /** @type {{fireAt:number,runT0:number,strength:number}[]} */ ([]),
      spawnProtectUntil: t0 + 2000,
      edgeTint: { r: 0, g: 0, b: 0, a: 0 },
      runDeathCount: 0,
      challengeNoDoubleJump: challengeNoDj,
      challengeMaxDeaths: challengeMaxDeaths,
      usedDoubleJumpThisRun: false,
      runMedalNote: "",
      /** One checkpoint respawn per run; after that, lethal hits end the run. */
      checkpointReviveConsumed: false,
      dailyChallenge,
      adminFlyTarget: /** @type {{ x: number, y: number } | null} */ (null),
      playFeaturedTier,
      multiplayerActive,
      links: cloneLevelLinks(),
      teleportFx: [],
      controlMode: "normal",
      sabotageVisual: { flicker: 0, displacement: 0, fakeHover: 0 },
      _inputFrame: null,
      _nearWinProgress: 0,
    };

    const sabotageApi = typeof window !== "undefined" ? window.SabotageSystem : null;
    if (sabotageApi && typeof sabotageApi.createController === "function") {
      state.sabotageController = sabotageApi.createController(
        runSeed,
        { ...sabotageMeta, intensity: save && save.settings ? save.settings.sabotageLevel : 5 },
        (rule) => {
        window.dispatchEvent(new CustomEvent("sabotageTriggered", { detail: rule }));
        }
      );
      // BUG FIX 1: Ensure any reused controller's input queue is always cleared on new run.
      if (state.sabotageController && typeof state.sabotageController.resetQueue === "function") {
        state.sabotageController.resetQueue();
      }
    } else {
      state.sabotageController = null;
    }

    if (usedPowerups.speedBoost) state.effects.speedBoostUntil = t0 + 3500;
    // ADD 1: Reset ghost recording for this run.
    currentRunGhostRecord = [];
    ghostRecordLastMs = -1;
    return state;
  }

  function addParticles(state, x, y, count, upward = false) {
    const room = MAX_PARTICLES - state.particles.length;
    if (room <= 0) return;
    const n = Math.min(count, room);
    for (let i = 0; i < n; i++) {
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
    // PERF 4: Swap-and-pop dead particles for O(1) removal instead of O(n) splice.
    const dtSec = dt / 1000;
    let i = state.particles.length - 1;
    while (i >= 0) {
      const p = state.particles[i];
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vy += 120 * dtSec;
      p.life -= dtSec / p.maxLife;
      if (p.life <= 0) {
        // Swap with last element and pop — O(1).
        state.particles[i] = state.particles[state.particles.length - 1];
        state.particles.length--;
      }
      i--;
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

  function makeRuntimeTiles(runSeed, sourceLevelId = null, featuredTier = null, extraSabotage = 0) {
    /** @type {RuntimeTile[][]} */
    const out = [];
    const levelSeed = seedFromGrid(grid);
    const gentleTutorial = typeof sourceLevelId === "string" && sourceLevelId.startsWith("builtin_tut_");
    const isBuiltinLevel = typeof sourceLevelId === "string" && sourceLevelId.startsWith("builtin_");
    const isFeaturedGlobal = typeof sourceLevelId === "string" && sourceLevelId.startsWith("feat:");
    let sabotageLevelForRun = 5;
    const ft = typeof featuredTier === "string" ? featuredTier.trim().toLowerCase() : "";
    if (ft === "medium") sabotageLevelForRun = 6;
    else if (ft === "hard") sabotageLevelForRun = 8;
    else if (ft === "easy") sabotageLevelForRun = 3;
    else if (gentleTutorial) sabotageLevelForRun = 2;
    else if ((userIntensityUnlocked || isAdminUser) && !isBuiltinLevel && !isFeaturedGlobal) {
      sabotageLevelForRun = save.settings.sabotageLevel || 5;
    } else if (isBuiltinLevel) {
      const lvl = BUILTIN_LEVELS.find((l) => l.id === sourceLevelId) || null;
      const tier = (lvl && lvl.tier) || "easy";
      sabotageLevelForRun = tier === "medium" ? 6 : tier === "hard" ? 8 : 3;
    } else {
      sabotageLevelForRun = 5;
    }
    sabotageLevelForRun = clamp(sabotageLevelForRun + (extraSabotage | 0), 1, 10);
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
        const raw = normalizeImportedTileType(grid[y][x]);
        const type = raw === Tile.pathBlock ? Tile.empty : raw;
        const tileSeed = hash2(x, y) ^ levelSeed ^ runSeed;
        const rng = mulberry32(tileSeed >>> 0);
        const spawnPinned = x === pinX && y === pinY && raw === Tile.platform;
        const useNeutral = type === Tile.start || spawnPinned || type === Tile.empty;
        const sab = useNeutral ? neutralSabotageProfile() : makeSabotageProfile(type, rng, sabotageLevelForRun);
        const rt = /** @type {RuntimeTile} */ ({
          type,
          sab,
          solid:
            type === Tile.platform ||
            type === Tile.jumppad ||
            type === Tile.speedBoost ||
            type === Tile.mud ||
            type === Tile.betrayal,
          deadly: type === Tile.spikes || type === Tile.lava,
          goal: type === Tile.goal,
          start: type === Tile.start,
          breakTimer: 0,
          stepCount: 0,
          padCooldownMs: 0,
          cursedActive: false,
          cursedUntil: 0,
          spawnPinned,
          betrayalDone: false,
          betrayalTriggerMs: 1300 + Math.floor(rng() * 2600),
          betrayalDeaths: 1 + Math.floor(rng() * 3),
          betrayalTo: rng() < 0.55 ? Tile.spikes : Tile.mud,
        });
        if (type === Tile.start) {
          rt.sab = neutralSabotageProfile();
          rt.deadly = false;
        }
        if (type === Tile.checkpoint) {
          rt.sab = neutralSabotageProfile();
          rt.deadly = false;
        }
        if (type === Tile.betrayal) {
          rt.deadly = false;
          rt.solid = true;
        }
        row.push(rt);
      }
      out.push(row);
    }
    return out;
  }

  function makeSabotageProfile(type, rng, sabotageLevelOverride) {
    const S = sabotageTuning(sabotageLevelOverride != null ? sabotageLevelOverride : save.settings.sabotageLevel || 5);
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
    if (type !== Tile.empty && type !== Tile.goal && type !== Tile.checkpoint && rng() < S.shiftChance) {
      sab.motion = "shift";
      sab.shiftAmp = lerp(1.0, 3.6 + S.shiftAmpBoost, rng());
      sab.shiftSpeed = lerp(0.55, 1.25 + S.shiftSpeedBoost, rng());
      sab.shiftPhase = rng() * Math.PI * 2;
    }

    // BUG FIX 6: timedDoor gets randomised timer speed; pressureSwitch gets delayed activation.
    if (type === Tile.timedDoor) {
      // Sabotage: randomise the teleport lock duration (feels like the door is sluggish or instant).
      sab.pad.type = "delayed";
      sab.pad.delayMs = lerp(0, 300 + S.delayScale * 200, rng());
      sab.pad.strength = 1.0;
    } else if (type === Tile.pressureSwitch) {
      // Sabotage: sometimes the switch has a delayed invert effect.
      const roll = rng();
      if (roll < S.spikesDelayed) {
        sab.spikes.type = "delayedOn";
        sab.spikes.delayMs = lerp(300, 900, rng()) * S.delayScale;
      }
    }

    if (type === Tile.platform || type === Tile.mud || type === Tile.betrayal) {
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

      padNone: lerp(0.52, 0.18, t),
      padReduced: lerp(0.22, 0.34, t),
      padDelayed: lerp(0.18, 0.30, t),
      padWeakening: lerp(0.00, 0.10, t),
      padFailBoost: lerp(0.00, 0.10, t),

      hexDurationBoost: lerp(0.00, 0.35, t),
    };
  }

  function estimateNearWinProgress(state) {
    const goalCell = findType(Tile.goal);
    const p = state && state.player;
    if (!goalCell || !p) return 0;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    const gx = goalCell.x * TILE + TILE / 2;
    const gy = goalCell.y * TILE + TILE / 2;
    const dist = Math.hypot(px - gx, py - gy) / TILE;
    return clamp(1 - dist / 12, 0, 1);
  }

  function updatePlay(dt, now) {
    if (!play) return;
    play.dt = dt;
    play.now = now;

    if (play.edgeTint && play.edgeTint.a > 0) {
      play.edgeTint.a = Math.max(0, play.edgeTint.a - dt * 0.002);
    }

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

    // Hammer: single-player built-in levels only (disabled in multiplayer — positions diverge)
    if (
      play.sourceBuiltinIndex != null &&
      !play.multiplayerActive &&
      !play.hammer &&
      play.now - play.t0 > 6000
    ) {
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
          play.hammer.active = false;
        } else if (tryRespawnAtCheckpoint(play)) {
          play.hammer.active = false;
          return;
        } else {
          end(play, "lose", "Hammer!");
          return;
        }
      }
      if (play.hammer.y > worldPixelH() + 50) play.hammer.active = false;
    }

    // Action hotkeys (play-only)
    if (input.wasPressed(keyForAction("restart"))) {
      restartPlay();
      return;
    }
    if (mpIsSaboteur) {
      if (input.wasPressed("1")) emitSaboteurAction("invert");
      if (input.wasPressed("2")) emitSaboteurAction("spikeBurst");
      if (input.wasPressed("3")) emitSaboteurAction("quake");
    }

    const nearWinProgress = estimateNearWinProgress(play);
    play._nearWinProgress = nearWinProgress;
    if (play.sabotageController) {
      play.sabotageController.update({
        elapsedMs: play.now - play.t0,
        progress: nearWinProgress,
        nearWin: nearWinProgress >= 0.85,
      });
      play.sabotageVisual = play.sabotageController.consumeVisual();
      play.controlMode = play.sabotageController.getControlMode();
      if (elStatusPill) elStatusPill.textContent = `Play: ${play.controlMode} control`;
    }

    const rawInput = {
      leftHeld: input.keyHeld("a") || input.keyHeld("arrowleft") || (deviceMode === "mobile" && touchLeftDown),
      rightHeld: input.keyHeld("d") || input.keyHeld("arrowright") || (deviceMode === "mobile" && touchRightDown),
      jumpPressed: input.wasPressed("w") || input.wasPressed("arrowup") || input.wasPressed("space") || (deviceMode === "mobile" && touchJumpDown),
      upHeld: input.keyHeld("w") || input.keyHeld("arrowup"),
      downHeld: input.keyHeld("s") || input.keyHeld("arrowdown"),
    };
    play._inputFrame = play.sabotageController ? play.sabotageController.applyInput(rawInput, now) : rawInput;

    // Jump buffer (keyboard + touch)
    const jumpPressed = !!play._inputFrame.jumpPressed;
    if (jumpPressed) play.player.jumpBufferMs = JUMP_BUFFER_MS;
    else play.player.jumpBufferMs = Math.max(0, play.player.jumpBufferMs - dt);

    updateRuntimeTiles(play, dt);

    const pj = play.pendingPadJumps;
    for (let i = pj.length - 1; i >= 0; i--) {
      const job = pj[i];
      if (play.now >= job.fireAt) {
        if (!play.ended && play.t0 === job.runT0) {
          const mudJ = playerInMudVolume(play, play.player) ? MUD_MOVE_MUL : 1;
          const rawV = JUMP_VELOCITY * job.strength * mudJ * PAD_LAUNCH_MULT;
          play.player.vy = -Math.max(rawV, JUMP_VELOCITY * 1.22 * mudJ);
          AudioSys.sfx.pad();
        }
        pj.splice(i, 1);
      }
    }

    stepPlayer(play, dt);
    checkOutcome(play);

    // Camera follow (exponential smoothing — consistent at any frame time)
    const dtSecCam = dt / 1000;
    const camT = 1 - Math.exp(-CAM_FOLLOW_LAMBDA * dtSecCam);
    play.cam.followX += (play.player.x - play.cam.followX) * camT;
    play.cam.followY += (play.player.y - play.cam.followY) * camT;
    const halfW = canvas.width * 0.5;
    const halfH = canvas.height * 0.5;
    const maxFX = worldPixelW() - halfW;
    const maxFY = worldPixelH() - halfH;
    play.cam.followX = clamp(play.cam.followX, Math.min(halfW, maxFX), Math.max(halfW, maxFX));
    play.cam.followY = clamp(play.cam.followY, Math.min(halfH, maxFY), Math.max(halfH, maxFY));

    const tgtBx = play.player.x * BG_PARALLAX_LINK_X;
    const tgtBy = play.player.y * BG_PARALLAX_LINK_Y;
    const pk = 1 - Math.exp(-(BG_PARALLAX_SMOOTH * dt) / 1000);
    play.bgParallaxX = lerp(play.bgParallaxX, tgtBx, pk);
    play.bgParallaxY = lerp(play.bgParallaxY, tgtBy, pk);

    updateParticles(play, dt);
    decayShake(play, dt);

    // ADD 1: Ghost recording — capture position every 50ms during the run.
    if (!play.ended && play.sourceLevelId) {
      const elapsed = play.now - play.t0;
      if (ghostRecordLastMs < 0 || elapsed - ghostRecordLastMs >= 50) {
        ghostRecordLastMs = elapsed;
        currentRunGhostRecord.push({ t: elapsed, x: play.player.x, y: play.player.y, vx: play.player.vx });
      }
    }

    if (mpSocket && mpRoomId && play && !play.ended) {
      if (now - mpLastEmitMs >= 50) {
        mpLastEmitMs = now;
        // BUG FIX 7: Broadcast runSeed so receivers can flag phase desync from shifted tiles.
        mpSocket.emit("mp_pos", { x: play.player.x, y: play.player.y, vx: play.player.vx, seed: play.runSeed });
      }
    }
    for (const [pid, rp] of [...mpRemotePeers.entries()]) {
      if (now - rp.seenMs > 5000) mpRemotePeers.delete(pid);
    }
  }

  function updateRuntimeTiles(state, dt) {
    const t = state.now - state.t0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = state.tiles[y][x];
        if (tile.breakTimer > 0) tile.breakTimer = Math.max(0, tile.breakTimer - dt);
        if (tile.padCooldownMs > 0) tile.padCooldownMs = Math.max(0, tile.padCooldownMs - dt);

        if (tile.type === Tile.betrayal && !tile.betrayalDone) {
          if (t >= tile.betrayalTriggerMs || state.runDeathCount >= tile.betrayalDeaths) {
            tile.betrayalDone = true;
            tile.type = tile.betrayalTo || Tile.spikes;
            tile.deadly = tile.type === Tile.spikes || tile.type === Tile.lava;
            tile.solid = tile.type === Tile.mud || tile.type === Tile.platform || tile.type === Tile.jumppad || tile.type === Tile.speedBoost;
            addParticles(state, x * TILE + TILE / 2, y * TILE + TILE / 2, 10, false);
          }
        }

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
          tile.solid =
            tile.type === Tile.platform ||
            tile.type === Tile.jumppad ||
            tile.type === Tile.speedBoost ||
            tile.type === Tile.mud;
          tile.breakTimer = 0;
        }
        if ((tile.type === Tile.platform || tile.type === Tile.jumppad) && tile.breakTimer === 0 && tile.solid === false) {
          // already broken
        }
        if (
          (tile.type === Tile.platform || tile.type === Tile.mud || tile.type === Tile.betrayal) &&
          tile.breakTimer === 0 &&
          tile.solid === false &&
          tile.stepCount > 0 &&
          !tile.spawnPinned
        ) {
          addParticles(state, x * TILE + TILE / 2, y * TILE + TILE / 2, 8, false);
          tile.type = Tile.empty;
        }
      }
    }
  }

  /**
   * Mud slowdown + jump scaling: needs overlap with a small band below the feet (flush landings
   * sit exactly on the tile top and otherwise have zero AABB overlap with the mud cell).
   */
  function playerInMudVolume(state, p) {
    const base = playerAABB(p, p.x, p.y);
    const probe = { x: base.x, y: base.y - 4, w: base.w, h: base.h + 10 };
    for (const t of queryTiles(state, probe)) {
      if (t.tile.type !== Tile.mud || !t.tile.solid) continue;
      const taabb = tileAABB(state, t.gx, t.gy);
      if (aabbOverlap(probe, taabb)) return true;
    }
    return false;
  }

  function playerFeetOnJumpPad(state, p) {
    if (!p.onGround) return false;
    const gx = Math.floor(p.x / TILE);
    const gy = Math.floor((p.y + p.h - 2) / TILE);
    if (!inBounds(gx, gy)) return false;
    const tile = state.tiles[gy][gx];
    return tile.type === Tile.jumppad && tile.solid;
  }

  function stepPlayer(state, dt) {
    const p = state.player;
    state._landThisFrame = null;
    const wasInAir = !p.onGround;
    const dtSec = dt / 1000;

    // REMOVE 1: Admin fly gated behind server-verified isAdminUser (set from DB profile, not hardcoded).
    // Additionally require that the Supabase session is still active to prevent offline spoofing.
    if (isAdminUser && currentSupabaseUser && currentSupabaseUser.id && !state.ended) {
      const target = state.adminFlyTarget;
      if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        let dx = target.x - cx;
        let dy = target.y - cy;
        const dist = Math.hypot(dx, dy);
        const speed = 560;
        if (dist > 2) {
          dx /= dist;
          dy /= dist;
          p.x += dx * speed * dtSec;
          p.y += dy * speed * dtSec;
        }
      } else {
        const stability = state.now < state.effects.stabilityUntil;
        const invert = !stability && state.now < state.effects.invertUntil;
        const frameInput = state._inputFrame || {};
        const left = !!frameInput.leftHeld;
        const right = !!frameInput.rightHeld;
        const moveLeft = invert ? right : left;
        const moveRight = invert ? left : right;
        const up = !!frameInput.upHeld;
        const down = !!frameInput.downHeld;
        const fly = 480 * dtSec;
        p.x += ((moveRight ? 1 : 0) - (moveLeft ? 1 : 0)) * fly;
        p.y += ((down ? 1 : 0) - (up ? 1 : 0)) * fly;
      }
      p.x = clamp(p.x, 0, worldPixelW() - p.w);
      p.y = clamp(p.y, 0, worldPixelH() - p.h);
      p.vx = 0;
      p.vy = 0;
      p.onGround = false;
      return;
    }

    const stability = state.now < state.effects.stabilityUntil;
    const invert = !stability && state.now < state.effects.invertUntil;
    const teleportLocked = state.now < p.teleportLockUntil;
    const frameInput = state._inputFrame || {};
    const left = !!frameInput.leftHeld;
    const right = !!frameInput.rightHeld;
    const moveLeft = invert ? right : left;
    const moveRight = invert ? left : right;

    // Horizontal
    const want = teleportLocked ? 0 : (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    const control = p.onGround ? 1 : PHYS.airControl;

    const inMud = playerInMudVolume(state, p);
    const mudFricMul = inMud && p.onGround ? 3.4 : inMud ? 2.2 : 1;
    const mudSpdMul = inMud ? MUD_MOVE_MUL : 1;
    const mudAccelMul = inMud ? MUD_MOVE_MUL : 1;

    if (want === 0) {
      const sign = Math.sign(p.vx);
      const mag = Math.abs(p.vx);
      const airRelease = !p.onGround;
      const decel = PHYS.friction * dtSec * mudFricMul * (airRelease ? AIR_RELEASE_FRIC_MUL : 1);
      p.vx = Math.max(0, mag - decel) * sign;
    } else {
      let maxSpd = state.now < state.effects.speedBoostUntil ? MOVE_SPEED * 1.45 : MOVE_SPEED;
      maxSpd *= mudSpdMul;
      const opposing =
        p.onGround &&
        Math.abs(p.vx) > 26 &&
        ((want > 0 && p.vx < -10) || (want < 0 && p.vx > 10));
      const turnMul = opposing ? GROUND_TURN_ACCEL_MUL : 1;
      p.vx += want * PHYS.accel * control * dtSec * mudAccelMul * turnMul;
      p.vx = clamp(p.vx, -maxSpd, maxSpd);
    }

    // Gravity (slower while in mud volume)
    p.vy += GRAVITY * dtSec * (inMud ? MUD_MOVE_MUL : 1);
    p.vy = Math.min(p.vy, inMud ? 1500 * MUD_MOVE_MUL : 1500);

    // Coyote
    if (p.onGround) p.coyoteMs = COYOTE_MS;
    else p.coyoteMs = Math.max(0, p.coyoteMs - dt);

    // Jump: normal or double jump (powerup)
    const canNormalJump = (p.onGround || p.coyoteMs > 0) && p.jumpBufferMs > 0;
    const canDoubleJump =
      !state.challengeNoDoubleJump &&
      state.usedPowerups.doubleJump &&
      !p.onGround &&
      !p.doubleJumpUsed &&
      p.jumpBufferMs > 0 &&
      p.vy > 0;
    const mudJumpMul = inMud ? MUD_MOVE_MUL : 1;
    const onPad = playerFeetOnJumpPad(state, p);
    const jumpMul = onPad ? JUMP_FROM_PAD_MULT : 1;
    if (canNormalJump) {
      addParticles(state, p.x, p.y + p.h - 4, 5, true);
      p.vy = -JUMP_VELOCITY * mudJumpMul * jumpMul;
      p.onGround = false;
      p.coyoteMs = 0;
      p.jumpBufferMs = 0;
      p.stretch = 1.18;
      p.squash = Math.max(p.squash, 0.08);
      p.doubleJumpUsed = false;
      AudioSys.sfx.jump();
    } else if (canDoubleJump) {
      addParticles(state, p.x, p.y + p.h - 4, 4, true);
      p.vy = -JUMP_VELOCITY * 0.92 * mudJumpMul;
      p.jumpBufferMs = 0;
      p.doubleJumpUsed = true;
      state.usedDoubleJumpThisRun = true;
      p.stretch = 1.12;
      p.squash = Math.max(p.squash, 0.06);
      AudioSys.sfx.jump();
    }

    // Integrate + collide
    const nextX = p.x + p.vx * dtSec;
    const nextY = p.y + p.vy * dtSec;

    p.x = resolveAxis(state, p, nextX, p.y, "x");
    const vyBeforeResolveY = p.vy;
    p.y = resolveAxis(state, p, p.x, nextY, "y");
    if (state._landThisFrame) {
      onLand(state, state._landThisFrame.gx, state._landThisFrame.gy);
    }

    if (state._landThisFrame && wasInAir) {
      p.landPop = 1;
      if (vyBeforeResolveY > 520) AudioSys.sfx.landHeavy();
      else AudioSys.sfx.landSoft();
    }
    p.landPop = Math.max(0, p.landPop - dt * 0.0045);

    // Squash/stretch settle
    p.squash = lerp(p.squash, p.onGround ? 0.25 : 0, 0.08);
    p.stretch = lerp(p.stretch, p.vy < -140 ? 0.5 : 0, 0.06);

    // Footstep ticks
    if (p.onGround && Math.abs(p.vx) > 40) {
      footstepTick(state, dt);
    }

    // Fell out
    if (p.y > worldPixelH() + 140) {
      if (!tryRespawnAtCheckpoint(state)) end(state, "lose", "You fell.");
    }
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

    let ax = axis === "x" ? tx : p.x;
    let ay = axis === "y" ? ty : p.y;
    if (axis === "y") p.onGround = false;

    for (let pass = 0; pass < 5; pass++) {
      const aabb = playerAABB(p, ax, ay);
      const nearby = queryTiles(state, aabb);
      let moved = false;

      if (axis === "x") {
        for (const t of nearby) {
          if (!t.tile.solid) continue;
          const taabb = tileAABB(state, t.gx, t.gy);
          if (!aabbOverlap(aabb, taabb)) continue;
          if (tx > prev) {
            const nx = taabb.x - p.w / 2;
            if (nx < ax) {
              ax = nx;
              p.vx = 0;
              // BUG FIX 4: Cap upward velocity when sliding a wall to prevent moon-rocket exploits.
              if (p.vy < -800) p.vy = -800;
              moved = true;
            }
          } else {
            const nx = taabb.x + taabb.w + p.w / 2;
            if (nx > ax) {
              ax = nx;
              p.vx = 0;
              // BUG FIX 4: Cap upward velocity when sliding a wall.
              if (p.vy < -800) p.vy = -800;
              moved = true;
            }
          }
        }
      } else {
        if (ty > prev) {
          let bestNy = ay;
          let landGx = -1;
          let landGy = -1;
          for (const t of nearby) {
            if (!t.tile.solid) continue;
            const taabb = tileAABB(state, t.gx, t.gy);
            if (!aabbOverlap(aabb, taabb)) continue;
            const ny = taabb.y - p.h;
            if (ny < bestNy) {
              bestNy = ny;
              landGx = t.gx;
              landGy = t.gy;
              moved = true;
            }
          }
          if (moved) {
            ay = bestNy;
            p.vy = 0;
            p.onGround = true;
            p.doubleJumpUsed = false;
            if (landGx >= 0) state._landThisFrame = { gx: landGx, gy: landGy };
          }
        } else {
          let bestNy = ay;
          for (const t of nearby) {
            if (!t.tile.solid) continue;
            const taabb = tileAABB(state, t.gx, t.gy);
            if (!aabbOverlap(aabb, taabb)) continue;
            const ny = taabb.y + taabb.h;
            if (ny > bestNy) {
              bestNy = ny;
              p.vy = 0;
              moved = true;
            }
          }
          if (moved) ay = bestNy;
        }
      }
      if (!moved) break;
    }

    return axis === "x" ? ax : ay;
  }

  function onLand(state, gx, gy) {
    const tile = state.tiles[gy][gx];
    if ((tile.type === Tile.platform || tile.type === Tile.mud || tile.type === Tile.betrayal) && !tile.spawnPinned) {
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
        state.pendingPadJumps.push({
          fireAt: state.now + sab.delayMs,
          runT0: state.t0,
          strength: sab.strength,
        });
      } else {
        const fail = sab.type === "flaky" && mulberry32(state.runSeed ^ hash2(gx, gy) ^ Math.floor(state.now))() < sab.failChance;
        const strength = fail ? 0.35 : sab.type === "reduced" ? sab.strength : sab.strength || 1;
        const jm = playerInMudVolume(state, state.player) ? MUD_MOVE_MUL : 1;
        const rawVy = JUMP_VELOCITY * strength * jm * PAD_LAUNCH_MULT;
        state.player.vy = -Math.max(rawVy, JUMP_VELOCITY * 1.22 * jm);
        state.player.onGround = false;
        state.player.stretch = 1.12;
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

  function tryRespawnAtCheckpoint(state) {
    if (!state.checkpointActive || state.checkpointReviveConsumed) return false;
    state.checkpointReviveConsumed = true;
    const p = state.player;
    p.x = state.checkpointX;
    p.y = state.checkpointY;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.coyoteMs = 0;
    p.jumpBufferMs = 0;
    p.squash = 0.35;
    p.stretch = 0;
    p.landPop = 0;
    p.doubleJumpUsed = false;
    state.runDeathCount++;
    state.edgeTint = { r: 1, g: 0.45, b: 0.1, a: 0.48 };
    AudioSys.duckAmbient(320, 0.28);
    AudioSys.sfx.hurt();
    state.spawnProtectUntil = state.now + 1650;
    // BUG FIX 5: Nudge player upward until clear of any mud or solid tile overlap at respawn point.
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!playerInMudVolume(state, p)) break;
      p.y -= TILE;
    }
    addParticles(state, p.x, p.y + p.h / 2, 10, true);
    showToast("Checkpoint revive used — next hit ends the run.", 2200);
    AudioSys.sfx.place();
    return true;
  }

  function resolveTeleportTarget(state, gx, gy) {
    const link = state.links[`${gx},${gy}`];
    if (link && inBounds(link.x, link.y)) return { gx: link.x, gy: link.y };
    return null;
  }

  function runPuzzleTeleport(state, fromGx, fromGy, toGx, toGy, sourceType) {
    const p = state.player;
    const tx = toGx * TILE + TILE / 2;
    const ty = toGy * TILE - 2;
    state.teleportFx.push({
      fromX: fromGx * TILE + TILE / 2,
      fromY: fromGy * TILE + TILE / 2,
      toX: toGx * TILE + TILE / 2,
      toY: toGy * TILE + TILE / 2,
      t0: state.now,
      dur: sourceType === Tile.timedDoor ? 520 : 360,
    });
    p.x = tx;
    p.y = ty;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.coyoteMs = 0;
    p.jumpBufferMs = 0;
    p.teleportLockUntil = state.now + (sourceType === Tile.timedDoor ? 240 : 120);
    if (sourceType === Tile.pressureSwitch) {
      state.effects.invertUntil = Math.max(state.effects.invertUntil, state.now + 1800);
      showToast("Pressure switch reroute!", 1000);
    } else {
      showToast("Door warp", 900);
    }
    AudioSys.sfx.place();
    addParticles(state, p.x, p.y + p.h / 2, 10, true);
  }

  function checkOutcome(state) {
    const p = state.player;
    const aabb = playerAABB(p, p.x, p.y);
    for (const t of queryTiles(state, aabb)) {
      const tile = t.tile;
      const taabb = tileAABB(state, t.gx, t.gy);
      if (!aabbOverlap(aabb, taabb)) continue;

      if (tile.type === Tile.checkpoint) {
        const sx = t.gx * TILE + TILE / 2;
        const sy = t.gy * TILE - 2;
        if (state.checkpointGx !== t.gx || state.checkpointGy !== t.gy || !state.checkpointActive) {
          state.checkpointActive = true;
          state.checkpointX = sx;
          state.checkpointY = sy;
          state.checkpointGx = t.gx;
          state.checkpointGy = t.gy;
          showToast("Checkpoint reached", 1000);
          AudioSys.sfx.place();
        }
        continue;
      }

      if (puzzleLayersEnabled(state) && (tile.type === Tile.pressureSwitch || tile.type === Tile.timedDoor)) {
        const target = resolveTeleportTarget(state, t.gx, t.gy);
        if (target) {
          const coolMs = tile.type === Tile.timedDoor ? 1400 : 700;
          if (tile.padCooldownMs <= 0) {
            tile.padCooldownMs = coolMs;
            runPuzzleTeleport(state, t.gx, t.gy, target.gx, target.gy, tile.type);
            return;
          }
        }
        continue;
      }

      if (tile.goal) {
        end(state, "win", "You reached the Goal!");
        return;
      }
      if (tile.deadly) {
        if (state.spawnProtectUntil && state.now < state.spawnProtectUntil) continue;
        if (state.usedPowerups.protection) {
          state.usedPowerups.protection = false;
          addParticles(state, p.x, p.y + p.h / 2, 10, true);
          showToast("Protection absorbed one hit!");
        } else if (tryRespawnAtCheckpoint(state)) {
          return;
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
      if (state.outcome === "win" && state.runMedalNote) stats += ` · ${state.runMedalNote}`;
      if (state.obsessionNote) stats += ` · ${state.obsessionNote}`;
      elEndOverlayStats.textContent = stats;
    }
    if (elEndNextLevelBtn) {
      if (state.dailyChallenge) {
        elEndNextLevelBtn.style.display = "none";
      } else {
        const hasNext = state.sourceBuiltinIndex != null && state.sourceBuiltinIndex + 1 < BUILTIN_LEVELS.length;
        elEndNextLevelBtn.style.display = hasNext ? "" : "none";
      }
    }

    // ADD 9: Async challenge — after a win show a "Challenge Friend" button that
    // deep-links to the same level with the PB ghost as a parameter in localStorage.
    if (state.outcome === "win" && state.sourceLevelId && elEndOverlay) {
      let challengeBtn = elEndOverlay.querySelector(".asyncChallengeBtn");
      if (!challengeBtn) {
        challengeBtn = document.createElement("button");
        challengeBtn.className = "asyncChallengeBtn";
        challengeBtn.style.cssText = "margin-top:8px;font-size:12px;opacity:0.75;cursor:pointer;background:none;border:1px solid rgba(120,200,255,0.4);color:inherit;padding:4px 12px;border-radius:6px;";
        elEndOverlay.appendChild(challengeBtn);
      }
      challengeBtn.textContent = "📋 Copy Challenge Link";
      challengeBtn.onclick = () => {
        const ghostKey = "ssb_ghost_" + String(state.sourceLevelId);
        const ghostData = localStorage.getItem(ghostKey) || "";
        const payload = btoa(JSON.stringify({ levelId: state.sourceLevelId, bestMs: state.runBestTimeMs || 0 })).replace(/=/g, "");
        const url = `${location.origin}${location.pathname}?challenge=${payload}`;
        navigator.clipboard.writeText(url).then(() => showToast("Challenge link copied!", 2000)).catch(() => {
          prompt("Copy this challenge link:", url);
        });
      };
    }

    // ADD 2: Level thumbs rating — show after win on a community/named level.
    const showRating = state.outcome === "win" && state.sourceLevelId;
    if (elEndOverlay) {
      let ratingRow = elEndOverlay.querySelector(".levelRatingRow");
      if (!showRating) {
        if (ratingRow) ratingRow.remove();
      } else {
        const ratingKey = "ssb_rating_" + String(state.sourceLevelId).slice(0, 80);
        const existing = (() => { try { return localStorage.getItem(ratingKey); } catch { return null; } })();
        if (!ratingRow) {
          ratingRow = document.createElement("div");
          ratingRow.className = "levelRatingRow";
          ratingRow.style.cssText = "display:flex;gap:12px;align-items:center;justify-content:center;margin-top:10px;";
          elEndOverlay.appendChild(ratingRow);
        }
        if (existing) {
          ratingRow.innerHTML = `<span style="font-size:13px;opacity:0.65;">You rated this level ${existing === "up" ? "👍" : "👎"}</span>`;
        } else {
          ratingRow.innerHTML = `
            <span style="font-size:12px;opacity:0.65;">Rate this level:</span>
            <button id="rateThumbUp" style="font-size:20px;background:none;border:none;cursor:pointer;filter:grayscale(0.4);">👍</button>
            <button id="rateThumbDown" style="font-size:20px;background:none;border:none;cursor:pointer;filter:grayscale(0.4);">👎</button>`;
          const doRate = (vote) => {
            try { localStorage.setItem(ratingKey, vote); } catch {}
            const sb = getSupabaseClient();
            if (sb && currentSupabaseUser) {
              sb.from("level_ratings").upsert({
                user_id: currentSupabaseUser.id,
                level_id: String(state.sourceLevelId),
                vote,
                rated_at: new Date().toISOString(),
              }, { onConflict: "user_id,level_id" }).then(() => {});
            }
            ratingRow.innerHTML = `<span style="font-size:13px;opacity:0.65;">Thanks for rating! ${vote === "up" ? "👍" : "👎"}</span>`;
          };
          ratingRow.querySelector("#rateThumbUp").addEventListener("click", () => doRate("up"));
          ratingRow.querySelector("#rateThumbDown").addEventListener("click", () => doRate("down"));
        }
      }
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
      updatePbPacePill(state);
      return;
    }
    const sec = Math.max(0, Math.ceil(state.timerRemainingMs / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    elTimerPill.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    elTimerPill.classList.toggle("warn", state.timerRemainingMs < 20000);
    elTimerPill.classList.toggle("ok", state.timerRemainingMs >= 20000);
    updatePbPacePill(state);
  }

  function formatPbClockMs(ms) {
    const x = Math.max(0, ms);
    const sec = Math.floor(x / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const frac = Math.floor((x % 1000) / 100);
    if (m > 0) return `${m}:${s.toString().padStart(2, "0")}.${frac}`;
    return `${s}.${frac}s`;
  }

  /** Live comparison to your best clear (timed preconfigured levels only). */
  function updatePbPacePill(state) {
    if (!elPbPacePill) return;
    if (!state || state.ended || state.timerLimitMs <= 0 || !state.sourceLevelId) {
      elPbPacePill.classList.add("hidden");
      elPbPacePill.classList.remove("pbAhead", "pbBehind");
      return;
    }
    elPbPacePill.classList.remove("hidden");
    const row = builtinLevelStats[state.sourceLevelId];
    const best = row && row.bestTimeMs < Infinity ? row.bestTimeMs : null;
    const elapsed = Math.max(0, state.now - state.t0);
    if (best == null) {
      elPbPacePill.textContent = `PB: first clear · ${formatPbClockMs(elapsed)} elapsed`;
      elPbPacePill.classList.remove("pbAhead", "pbBehind");
      return;
    }
    const delta = elapsed - best;
    const dAbs = Math.abs(delta);
    const dStr = dAbs >= 60000 ? formatPbClockMs(dAbs) : `${(dAbs / 1000).toFixed(1)}s`;
    if (delta <= 0) {
      elPbPacePill.textContent = `PB ${formatPbClockMs(best)} · ${dStr} ahead`;
      elPbPacePill.classList.add("pbAhead");
      elPbPacePill.classList.remove("pbBehind");
    } else {
      elPbPacePill.textContent = `PB ${formatPbClockMs(best)} · ${dStr} behind`;
      elPbPacePill.classList.remove("pbAhead");
      elPbPacePill.classList.add("pbBehind");
    }
  }

  function end(state, outcome, reason) {
    if (state.ended) return;
    state.ended = true;
    state.outcome = outcome;
    state.reason = reason;
    state.cam.fadeTarget = 0.55;

    // REMOVE 5: Only update local MP score when NOT in an online MP session.
    if (localMpEnabled && !(mpSocket && mpRoomId)) {
      if (outcome === "win") localMpScore[localMpTurn] = (localMpScore[localMpTurn] | 0) + 1;
      const finished = localMpPlayers[localMpTurn];
      localMpTurn = localMpTurn === 0 ? 1 : 0;
      if (localMpRound < localMpMaxRounds) localMpRound += 1;
      syncMpUi();
      const scoreMsg = `${localMpPlayers[0]} ${localMpScore[0]} - ${localMpScore[1]} ${localMpPlayers[1]}`;
      if (localMpRound >= localMpMaxRounds) {
        const levelJson = buildRandomPreconfiguredLevelJson();
        if (levelJson) importGridFromJsonText(levelJson, true);
        showToast(`Local match final round (${localMpMaxRounds}) loaded random preconfigured level. ${scoreMsg}`, 3600);
      } else {
        showToast(
          `Local match: ${finished} ${outcome === "win" ? "wins round" : "lost"} · ${scoreMsg} · Next: ${localMpPlayers[localMpTurn]} (round ${localMpRound}/${localMpMaxRounds})`,
          3200
        );
      }
    }

    if (outcome === "win" && mpSocket && mpRoomId && mpMatch && mpMatch.active && mpMatch.round > 0) {
      const claimedRound = mpMatch.round | 0;
      mpSocket.emit("mp_round_win", { round: claimedRound }, (ack) => {
        if (!ack || !ack.ok) return;
        if (ack.match) applyMpMatchState(ack.match);
      });
    }

    /** @type {number} */
    let prevWinStreak = 0;
    if (activePlayer) {
      prevWinStreak = typeof activePlayer.stats.winStreak === "number" ? activePlayer.stats.winStreak : 0;
      if (outcome === "win") {
        activePlayer.stats.totalWins++;
        activePlayer.stats.winStreak = prevWinStreak + 1;
      } else {
        activePlayer.stats.totalDeaths++;
        activePlayer.stats.winStreak = 0;
      }
    }

    const diff = lastValidation.difficulty || computeDifficulty(countTiles(grid));
    const runMs = Math.max(0, (state.now || 0) - (state.t0 || 0));
    if (outcome === "lose") {
      // Near-win: player died very close to the goal, so we encourage instead of discouraging.
      let nearWin = false;
      try {
        const goalCell = findType(Tile.goal);
        const p = state.player;
        if (goalCell && p && typeof p.x === "number" && typeof p.y === "number") {
          const px = p.x + p.w / 2;
          const py = p.y + p.h / 2;
          const gx = goalCell.x * TILE + TILE / 2;
          const gy = goalCell.y * TILE + TILE / 2;
          const dx = px - gx;
          const dy = py - gy;
          const distTiles = Math.sqrt((dx * dx + dy * dy)) / TILE;
          const timeMs = (state.now || 0) - (state.t0 || 0);
          const lateEnough = state.timerLimitMs > 0 ? timeMs >= state.timerLimitMs * 0.35 : true;
          // Tight radius + anti-spam via cooldown.
          if (distTiles <= 2.2 && lateEnough) nearWin = true;
        }
      } catch {
        nearWin = false;
      }

      if (nearWin) {
        // Show at most once per cooldown window to avoid repeated encouragement spam.
        if (!end._lastNearWinMs) end._lastNearWinMs = 0;
        const nowPerf = performance.now();
        if (nowPerf - end._lastNearWinMs < 15_000) nearWin = false;
        else end._lastNearWinMs = nowPerf;
      }

      state.edgeTint = { r: 0.88, g: 0.06, b: 0.14, a: 0.55 };
      AudioSys.duckAmbient(400, 0.22);
      AudioSys.sfx.hurt();
      AudioSys.sfx.lose();
      const cpNote =
        state.checkpointActive && state.checkpointReviveConsumed
          ? " Checkpoint revive already used."
          : "";
      const nearMsg = nearWin ? " you almost had it." : "";
      showToast(
        (state.runAttempts > 2 ? "Close! Try again." : `LOSE — ${reason}`) + nearMsg + cpNote,
        Math.min(2800, 2200 + (cpNote ? 400 : 0) + (nearWin ? 200 : 0))
      );
      window.setTimeout(() => showToast(nextVibeLine("lose"), 1400), 220);
      if (nearWin) sabotageMeta.almostWins = (sabotageMeta.almostWins | 0) + 1;
    } else {
      const goalCell = findType(Tile.goal);
      if (goalCell) {
        const cx = goalCell.x * TILE + TILE / 2;
        const cy = goalCell.y * TILE + TILE / 2;
        addParticles(state, cx, cy, 16, true);
        addParticles(state, cx, cy + 10, 14, false);
      }
      AudioSys.duckAmbient(280, 0.5);
      AudioSys.sfx.win();
      AudioSys.sfx.winBurst();
      const timeMs = state.now - state.t0;
      let isNewPb = false;
      if (state.sourceLevelId) {
        builtinLevelStats[state.sourceLevelId] =
          builtinLevelStats[state.sourceLevelId] || { attempts: 0, bestTimeMs: Infinity };
        const prevBest = builtinLevelStats[state.sourceLevelId].bestTimeMs;
        isNewPb = prevBest === Infinity || timeMs < prevBest;
        builtinLevelStats[state.sourceLevelId].bestTimeMs = Math.min(prevBest, timeMs);
        if (isNewPb) {
          flushTimedLevelPbToSave(state.sourceLevelId);
          // ADD 1: Save ghost frames for this new PB run.
          pbGhostFrames[state.sourceLevelId] = currentRunGhostRecord.slice();
          try {
            localStorage.setItem(
              "ssb_ghost_" + state.sourceLevelId,
              JSON.stringify(pbGhostFrames[state.sourceLevelId].slice(0, 2400))
            );
          } catch { /* ignore storage failures */ }
        }
      }
      const bits = [];
      if (isNewPb) bits.push("New personal best!");
      if (state.challengeNoDoubleJump) {
        bits.push(state.usedDoubleJumpThisRun ? "Double-jump used" : "No double-jump ✓");
      }
      if (state.challengeMaxDeaths > 0) {
        bits.push(
          state.runDeathCount <= state.challengeMaxDeaths
            ? `Deaths ${state.runDeathCount}/${state.challengeMaxDeaths} ✓`
            : `Deaths ${state.runDeathCount} (limit ${state.challengeMaxDeaths})`
        );
      }
      state.runMedalNote = bits.join(" · ");
      const highDiff = diff >= 70;
      showToast(highDiff ? "High difficulty cleared!" : `WIN — ${reason}`, 2400);
      // ADD 8: Level completion streak combo bonus — award extra coins for consecutive wins.
      const streakBonus = prevWinStreak >= 1 ? Math.min(prevWinStreak + 1, 5) * 3 : 0;
      if (prevWinStreak >= 1) {
        window.setTimeout(() => {
          showToast(`${prevWinStreak + 1} wins in a row — +${streakBonus} bonus coins!`, 2000);
        }, 500);
        if (activePlayer && streakBonus > 0) {
          if (!activePlayer.powerups) activePlayer.powerups = { doubleJump: 0, speedBoost: 0, protection: 0 };
          if (typeof activePlayer.coins !== "number") activePlayer.coins = 0;
          activePlayer.coins += streakBonus;
          persist();
        }
      }
      window.setTimeout(() => showToast(nextVibeLine("win"), 1300), 180);
    }
    sabotageMeta.totalRuns = (sabotageMeta.totalRuns | 0) + 1;
    sabotageMeta.longestSurvivalMs = Math.max(sabotageMeta.longestSurvivalMs | 0, runMs | 0);
    if (outcome === "win") {
      if (!sabotageMeta.bestRunMs || runMs < sabotageMeta.bestRunMs) sabotageMeta.bestRunMs = runMs | 0;
    }
    sabotageMeta.recentOutcomes = Array.isArray(sabotageMeta.recentOutcomes) ? sabotageMeta.recentOutcomes : [];
    sabotageMeta.recentOutcomes.push(outcome);
    if (sabotageMeta.recentOutcomes.length > 8) sabotageMeta.recentOutcomes.shift();
    const percentile = clamp(62 + Math.floor((state._nearWinProgress || 0) * 30), 62, 97);
    state.obsessionNote =
      outcome === "lose"
        ? `Survived longer than ${percentile}% of runs · almost wins: ${sabotageMeta.almostWins | 0}`
        : `Best run ${(sabotageMeta.bestRunMs / 1000 || 0).toFixed(1)}s · longest survival ${(
            (sabotageMeta.longestSurvivalMs || 0) / 1000
          ).toFixed(1)}s`;
    saveSabotageMeta();
    syncEndOverlay(state);
    syncExitAndRotateUI();

    // Daily challenge: attempt tracking + daily coin reward (once per day).
    if (state.dailyChallenge && state.dailyChallenge.dayKey) {
      const dayKey = state.dailyChallenge.dayKey;
      const completedLocal = state.dailyChallenge.completedLocal === true;
      const needsCoinAward = outcome === "win" && state.dailyChallenge.coinsAwardedLocal !== true;

      if (!completedLocal) {
        // Each run end (lose or win) consumes 1 of the daily attempts.
        state.dailyChallenge.attemptsUsedLocal = Math.min(5, (state.dailyChallenge.attemptsUsedLocal | 0) + 1);
      }

      const sb = getSupabaseClient();
      const u = currentSupabaseUser;
      if (sb && u && u.id && isSupabaseConfigured()) {
        if (isBlockedAccountNow()) return;
        void (async () => {
          try {
            if (!completedLocal) {
              const newCompleted = outcome === "win";
              const nextAttempts = state.dailyChallenge.attemptsUsedLocal | 0;
              const { data: curProg } = await sb
                .from("daily_challenge_progress")
                .select("coins_awarded")
                .eq("user_id", u.id)
                .eq("day_key", dayKey)
                .maybeSingle();
              const keepCoinsAwarded = !!(curProg && curProg.coins_awarded);
              await sb.from("daily_challenge_progress").upsert(
                {
                  user_id: u.id,
                  day_key: dayKey,
                  attempts_used: nextAttempts,
                  completed: newCompleted,
                  coins_awarded: keepCoinsAwarded,
                },
                { onConflict: "user_id,day_key" }
              );
            }

            if (needsCoinAward) {
              const { data: awarded, error: aErr } = await sb.rpc("ssb_award_daily_challenge_coins", {
                p_user_id: u.id,
                p_day_key: dayKey,
              });
              if (aErr) {
                logSupabaseError("ssb_award_daily_challenge_coins", aErr, { user_id: u.id, day_key: dayKey });
              } else {
                state.dailyChallenge.coinsAwardedLocal = true;
                if (typeof awarded === "number" && awarded > 0) {
                  await fetchUserCoinsAndShopState(sb, u);
                  syncShopUI();
                  showToast(`Daily reward: +${awarded} coins!`, 2400);
                }
              }
            }
          } catch (e) {
            logSupabaseError("daily_challenge_progress update (exception)", e, { user_id: u.id, day_key: dayKey });
          }
        })();
      }

      if (!completedLocal && outcome === "win") {
        state.dailyChallenge.completedLocal = true;
      }
    }

    // Local/offline: first-time built-in tier coins + daily challenge once per calendar day (UTC).
    if (!currentSupabaseUser && activePlayer && outcome === "win" && !isBlockedAccountNow()) {
      let bonus = 0;
      if (state.sourceBuiltinIndex != null) {
        const bl = BUILTIN_LEVELS[state.sourceBuiltinIndex];
        if (bl && bl.id && bl.tier !== "tutorial") {
          const comp = Array.isArray(activePlayer.completedBuiltinLevelIdsForCoins) ? activePlayer.completedBuiltinLevelIdsForCoins : [];
          const s = new Set(comp.map(String));
          if (!s.has(String(bl.id))) {
            s.add(String(bl.id));
            activePlayer.completedBuiltinLevelIdsForCoins = Array.from(s);
            if (bl.tier === "easy") bonus += 10;
            else if (bl.tier === "medium") bonus += 15;
            else if (bl.tier === "hard") bonus += 20;
          }
        }
      }
      if (state.dailyChallenge && state.dailyChallenge.dayKey) {
        const dk = String(state.dailyChallenge.dayKey);
        const k = "ssb_local_daily_challenge_coin_" + dk;
        try {
          if (!localStorage.getItem(k)) {
            localStorage.setItem(k, "1");
            bonus += 200;
          }
        } catch {
          /* ignore */
        }
      }
      if (bonus > 0) {
        setLocalCoins(getLocalCoins() + bonus);
        syncShopUI();
        showToast(`+${bonus} coins`, 2000);
      }
    }

    // Powerup reward: random after winning Medium/Hard preconfigured level
    if (activePlayer && outcome === "win" && state.sourceLevelId && state.sourceBuiltinIndex != null) {
      const level = BUILTIN_LEVELS[state.sourceBuiltinIndex];
      if (
        level &&
        level.tier !== "tutorial" &&
        (level.tier === "medium" || level.tier === "hard") &&
        Math.random() < 0.4
      ) {
        const keys = ["doubleJump", "speedBoost", "protection"];
        const key = keys[Math.floor(Math.random() * keys.length)];
        activePlayer.powerups[key] = (activePlayer.powerups[key] || 0) + 1;
        showToast(`Earned ${key === "doubleJump" ? "Double Jump" : key === "speedBoost" ? "Speed Boost" : "Protection"}!`);
      }
    }

    // Points + progression
    const mult = diff >= 120 ? 1.6 : diff >= 70 ? 1.3 : diff >= 35 ? 1.15 : 1.0;
    const streakMult = outcome === "win" ? 1 + Math.min(prevWinStreak, 10) * 0.03 : 1;
    const base = outcome === "win" ? diff : Math.max(0, diff * 0.25);
    const earned = base * mult * streakMult;
    if (outcome === "win" && isSupabaseConfigured()) {
      /** @type {{ levelId: string, tier: string } | null} */
      let preMeta = null;
      if (state.sourceLevelId != null && state.sourceBuiltinIndex != null) {
        const bl = BUILTIN_LEVELS[state.sourceBuiltinIndex];
        if (bl && bl.id) preMeta = { levelId: bl.id, tier: bl.tier };
      }
      void (async () => {
        await pushGlobalScore(earned, preMeta);
        scheduleRefreshGlobalLeaderboardList(280);
      })();
    }
    if (activePlayer) {
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
      syncProfileUI();
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

  /** Edge vignette for hit / death feedback (screen space, after world draw). */
  function drawScreenEdgeTint(ctx2, tint) {
    if (!tint || tint.a < 0.02) return;
    const w = canvas.width;
    const h = canvas.height;
    const edge = Math.min(100, w * 0.12, h * 0.12);
    const r = Math.floor(tint.r * 255);
    const g = Math.floor(tint.g * 255);
    const b = Math.floor(tint.b * 255);
    const a = tint.a;
    ctx2.save();
    const band = (x, y, bw, bh, gx0, gy0, gx1, gy1) => {
      const grd = ctx2.createLinearGradient(gx0, gy0, gx1, gy1);
      grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = grd;
      ctx2.fillRect(x, y, bw, bh);
    };
    band(0, 0, w, edge, 0, 0, 0, edge);
    band(0, h - edge, w, edge, 0, h, 0, h - edge);
    band(0, 0, edge, h, 0, 0, edge, 0);
    band(w - edge, 0, edge, h, w, 0, w - edge, 0);
    ctx2.restore();
  }

  // ---------- Rendering (layer order: background → world/play → screen fade; HTML UI is above canvas) ----------
  function render(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bgSX = mode === "play" && play ? play.bgParallaxX : buildCamX + canvas.width * 0.5;
    const bgSY = mode === "play" && play ? play.bgParallaxY : buildCamY + canvas.height * 0.5;
    drawBackground(ctx, now, bgSX, bgSY);

    if (mode === "build") {
      ctx.save();
      ctx.translate(-buildCamX, -buildCamY);
      drawBuild(ctx, now);
      ctx.restore();
      const btxt = "Build: pan map · place tiles (sabotage hidden)";
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
      drawScreenEdgeTint(ctx, play.edgeTint);
      if (play.sabotageVisual) {
        const flicker = clamp(play.sabotageVisual.flicker || 0, 0, 1);
        if (flicker > 0.02) {
          ctx.save();
          ctx.fillStyle = `rgba(255,255,255,${0.04 + flicker * 0.08})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        const fakeHoverOn = (play.sabotageVisual.fakeHover || 0) > 0.06;
        document.body.classList.toggle("sabotage-fake-hover", fakeHoverOn);
      }
    }

    // --- FPS Counter overlay ---
    if (_fpsShowCounter) {
      const fps = _fpsDisplay;
      const fpsColor = fps >= 55 ? "#4ade80" : fps >= 40 ? "#facc15" : "#f87171";
      ctx.save();
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      // Shadow for readability over any background
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = fpsColor;
      ctx.fillText(`${fps} FPS`, canvas.width - 8, 8);
      if (_fpsLow) {
        ctx.font = "11px monospace";
        ctx.fillStyle = "#f87171";
        ctx.fillText("⚠ low quality", canvas.width - 8, 24);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  /**
   * Layered backgrounds with parallax from world camera (build or play).
   * @param {number} scrollWorldX world X at viewport center (pixels)
   * @param {number} scrollWorldY world Y at viewport center (pixels)
   */
  function drawBackground(ctx2, now, scrollWorldX, scrollWorldY) {
    const t = now / 1000;
    const theme = save.settings.background || "scene";
    const px = canvas.width * 0.5 - scrollWorldX;
    const py = canvas.height * 0.5 - scrollWorldY;
    const parallaxBoost = mode === "play" && play ? 1.45 : 1;
    const layer = (factor) => px * factor * 0.42 * parallaxBoost;
    const layerY = (factor) => py * factor * 0.26 * parallaxBoost;

    if (theme === "scene" && bgImageReady && bgImage.naturalWidth > 0) {
      const iw = bgImage.naturalWidth;
      const ih = bgImage.naturalHeight;
      const parallax = 0.16 * parallaxBoost;
      const ox = scrollWorldX * parallax;
      const oy = scrollWorldY * parallax * 0.46;
      const tileW = Math.max(iw * 1.12, canvas.width * 0.55);
      const tileH = Math.max(ih * 1.12, canvas.height * 0.55);
      const x0 = ((-ox % tileW) + tileW) % tileW - tileW;
      const y0 = ((-oy % tileH) + tileH) % tileH - tileH;
      ctx2.save();
      ctx2.fillStyle = "rgba(5, 7, 16, 1)";
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      for (let x = x0; x < canvas.width + tileW; x += tileW) {
        for (let y = y0; y < canvas.height + tileH; y += tileH) {
          ctx2.globalAlpha = 0.4;
          ctx2.drawImage(bgImage, x, y, tileW, tileH);
        }
      }
      ctx2.globalAlpha = 1;
      const vg = cachedLinearGradient(ctx2, "scene_vg", 0, 0, canvas.width, canvas.height, [[0,"rgba(8,12,28,0.55)"],[0.5,"rgba(6,10,22,0.28)"],[1,"rgba(4,6,14,0.58)"]]);
      ctx2.fillStyle = vg;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      const bottom = cachedLinearGradient(ctx2, "scene_bottom", 0, canvas.height * 0.4, 0, canvas.height, [[0,"rgba(0,0,0,0)"],[1,"rgba(0,0,0,0.42)"]]);
      ctx2.fillStyle = bottom;
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.restore();
      return;
    }

    if (theme === "grid") {
      ctx2.fillStyle = cachedLinearGradient(ctx2, "grid_sky", 0, 0, 0, canvas.height, [[0,"rgba(10,12,26,0.95)"],[1,"rgba(2,3,10,1)"]]);
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.06), 0);
      const hz = canvas.height * 0.55;
      const glow = _gradCache.get(`grid_glow|${canvas.width}|${canvas.height}`) ||
        (() => { const g = ctx2.createRadialGradient(canvas.width / 2, hz, 10, canvas.width / 2, hz, canvas.width * 0.7); g.addColorStop(0, "rgba(167,139,250,0.14)"); g.addColorStop(1, "rgba(0,0,0,0)"); _gradCache.set(`grid_glow|${canvas.width}|${canvas.height}`, g); return g; })();
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
      ctx2.fillStyle = cachedLinearGradient(ctx2, "cute_bg", 0, 0, canvas.width, canvas.height, [[0,"rgba(255,248,252,1)"],[0.38,"rgba(252,231,243,1)"],[0.72,"rgba(233,245,238,1)"],[1,"rgba(214,236,226,1)"]]);
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
      ctx2.fillStyle = cachedLinearGradient(ctx2, "cute_hg", 0, 0, 0, canvas.height * 0.72, [[0,"rgba(255,255,255,0.5)"],[0.55,"rgba(255,255,255,0.08)"],[1,"rgba(255,255,255,0)"]]);
      ctx2.fillRect(-60, 0, canvas.width + 120, canvas.height * 0.72);
      ctx2.restore();
    } else if (theme === "city") {
      ctx2.fillStyle = cachedLinearGradient(ctx2, "city_sky", 0, 0, 0, canvas.height, [[0,"rgba(72,61,120,0.95)"],[0.55,"rgba(28,32,58,0.98)"],[1,"rgba(12,14,28,1)"]]);
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
      // Dusk top color animates — can't cache, but base layers can
      ctx2.fillStyle = cachedLinearGradient(ctx2, "dusk_base", 0, 0.55 * canvas.height, 0, canvas.height, [[0,"rgba(20,18,40,0.95)"],[1,"rgba(6,7,16,1)"]]);
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.fillStyle = `rgba(255,166,103,${0.06 + 0.02 * Math.sin(t * 0.35)})`;
      ctx2.fillRect(0, 0, canvas.width, canvas.height * 0.55);
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
      ctx2.fillStyle = cachedLinearGradient(ctx2, "forest_sky", 0, 0, 0, canvas.height, [[0,"rgba(20,60,35,0.95)"],[0.5,"rgba(15,45,25,0.98)"],[1,"rgba(8,28,15,1)"]]);
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
      ctx2.fillStyle = cachedLinearGradient(ctx2, "indian_sky", 0, 0, 0, canvas.height, [[0,"rgba(80,35,20,0.95)"],[0.4,"rgba(55,25,15,0.98)"],[1,"rgba(30,12,8,1)"]]);
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
      ctx2.fillStyle = cachedLinearGradient(ctx2, "default_sky", 0, 0, 0, canvas.height, [[0,"rgba(40,54,120,0.26)"],[1,"rgba(10,12,26,0.92)"]]);
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.save();
      ctx2.translate(layer(0.09), layerY(0.07));
      ctx2.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 80; i++) {
        const x = (i * 97 + t * 12 * (0.7 + (i % 7) * 0.03)) % canvas.width;
        const y = (i * 53 + t * 8 * (0.8 + (i % 5) * 0.03)) % canvas.height;
        ctx2.fillRect(x, y, 2, 2);
      }
      ctx2.restore();
    }
  }

  function getBuildMergeMask(gx, gy, type) {
    if (!(type === Tile.platform || type === Tile.lava || type === Tile.mud || type === Tile.betrayal)) return null;
    return {
      l: gx > 0 && grid[gy][gx - 1] === type,
      r: gx < COLS - 1 && grid[gy][gx + 1] === type,
      u: gy > 0 && grid[gy - 1][gx] === type,
      d: gy < ROWS - 1 && grid[gy + 1][gx] === type,
    };
  }

  function getPlayMergeMask(state, gx, gy, type) {
    if (!(type === Tile.platform || type === Tile.lava || type === Tile.mud || type === Tile.betrayal)) return null;
    const tiles = state.tiles;
    return {
      l: gx > 0 && tiles[gy][gx - 1].type === type,
      r: gx < COLS - 1 && tiles[gy][gx + 1].type === type,
      u: gy > 0 && tiles[gy - 1][gx].type === type,
      d: gy < ROWS - 1 && tiles[gy + 1][gx].type === type,
    };
  }

  function drawBuild(ctx2, now) {
    const gx0 = Math.max(0, Math.floor(buildCamX / TILE) - 1);
    const gx1 = Math.min(COLS - 1, Math.ceil((buildCamX + canvas.width) / TILE));
    const gy0 = Math.max(0, Math.floor(buildCamY / TILE) - 1);
    const gy1 = Math.min(ROWS - 1, Math.ceil((buildCamY + canvas.height) / TILE));

    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0; x <= gx1; x++) {
        const t = grid[y][x];
        if (t === Tile.empty) continue;
        drawTile(ctx2, t, x * TILE, y * TILE, 1, 0, now, getBuildMergeMask(x, y, t));
      }
    }

    const nowPl = performance.now();
    for (let i = placeFx.length - 1; i >= 0; i--) {
      const e = placeFx[i];
      const u = (nowPl - e.t0) / 200;
      if (u >= 1) {
        placeFx.splice(i, 1);
        continue;
      }
      const sc = 1 + 0.14 * Math.sin(u * Math.PI);
      const cx = e.gx * TILE + TILE / 2;
      const cy = e.gy * TILE + TILE / 2;
      ctx2.save();
      ctx2.globalAlpha = 0.55 * (1 - u);
      ctx2.translate(cx, cy);
      ctx2.scale(sc, sc);
      ctx2.strokeStyle = "rgba(45, 212, 191, 0.85)";
      ctx2.lineWidth = 2.5;
      ctx2.strokeRect(-TILE / 2 + 3, -TILE / 2 + 3, TILE - 6, TILE - 6);
      ctx2.restore();
    }

    // Ghost preview
    if (pointer.over && inBounds(pointer.gx, pointer.gy) && selectedTile !== Tile.empty) {
      const a = pointer.canPlace ? 0.42 : 0.18;
      drawTile(ctx2, selectedTile, pointer.gx * TILE, pointer.gy * TILE, a, 1, now, getBuildMergeMask(pointer.gx, pointer.gy, selectedTile));
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
      drawTile(ctx2, e.prev, e.gx * TILE, e.gy * TILE, 0.72 + 0.2 * (1 - u), 0, now, getBuildMergeMask(e.gx, e.gy, e.prev));
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

    if (testSpawnCell && inBounds(testSpawnCell.gx, testSpawnCell.gy)) {
      const px = testSpawnCell.gx * TILE;
      const py = testSpawnCell.gy * TILE;
      ctx2.save();
      ctx2.strokeStyle = "rgba(255, 214, 102, 0.95)";
      ctx2.lineWidth = 2;
      ctx2.setLineDash([6, 4]);
      ctx2.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx2.setLineDash([]);
      ctx2.fillStyle = "rgba(255, 214, 102, 0.22)";
      ctx2.beginPath();
      ctx2.moveTo(px + TILE / 2, py + 6);
      ctx2.lineTo(px + TILE - 8, py + TILE - 10);
      ctx2.lineTo(px + 8, py + TILE - 10);
      ctx2.closePath();
      ctx2.fill();
      ctx2.restore();
    }

    if (showPuzzleLinks) {
      for (const k of Object.keys(levelLinks)) {
        const src = levelLinks[k];
        if (!src) continue;
        const parts = k.split(",");
        const sx = parseInt(parts[0], 10);
        const sy = parseInt(parts[1], 10);
        if (!inBounds(sx, sy) || !inBounds(src.x, src.y)) continue;
        const srcTile = grid[sy][sx];
        if (!isPuzzleTileType(srcTile)) continue;
        const x0 = sx * TILE + TILE / 2;
        const y0 = sy * TILE + TILE / 2;
        const x1 = src.x * TILE + TILE / 2;
        const y1 = src.y * TILE + TILE / 2;
        ctx2.save();
        ctx2.strokeStyle = srcTile === Tile.timedDoor ? "rgba(94,234,212,0.7)" : "rgba(251,113,133,0.7)";
        ctx2.lineWidth = 1.5;
        ctx2.setLineDash([4, 4]);
        ctx2.beginPath();
        ctx2.moveTo(x0, y0);
        ctx2.lineTo(x1, y1);
        ctx2.stroke();
        ctx2.setLineDash([]);
        ctx2.beginPath();
        ctx2.arc(x1, y1, 4, 0, Math.PI * 2);
        ctx2.fillStyle = "rgba(255,255,255,0.85)";
        ctx2.fill();
        ctx2.restore();
      }
    }

    if (buildMarquee) {
      const mx0 = Math.min(buildMarquee.x0, buildMarquee.x1);
      const my0 = Math.min(buildMarquee.y0, buildMarquee.y1);
      const mx1 = Math.max(buildMarquee.x0, buildMarquee.x1);
      const my1 = Math.max(buildMarquee.y0, buildMarquee.y1);
      ctx2.save();
      ctx2.strokeStyle = "rgba(122, 167, 255, 0.9)";
      ctx2.lineWidth = 2;
      ctx2.setLineDash([5, 5]);
      ctx2.strokeRect(mx0 * TILE, my0 * TILE, (mx1 - mx0 + 1) * TILE, (my1 - my0 + 1) * TILE);
      ctx2.setLineDash([]);
      ctx2.restore();
    }

    drawTextsInWorld(ctx2, gx0, gy0, gx1, gy1);

    // Grid lines (visible band + margin)
    const gxa = Math.max(0, gx0 - 1);
    const gxb = Math.min(COLS, gx1 + 2);
    const gya = Math.max(0, gy0 - 1);
    const gyb = Math.min(ROWS, gy1 + 2);
    ctx2.strokeStyle = "rgba(255,255,255,0.06)";
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    for (let x = gxa; x <= gxb; x++) {
      ctx2.moveTo(x * TILE + 0.5, gya * TILE);
      ctx2.lineTo(x * TILE + 0.5, gyb * TILE);
    }
    for (let y = gya; y <= gyb; y++) {
      ctx2.moveTo(gxa * TILE, y * TILE + 0.5);
      ctx2.lineTo(gxb * TILE, y * TILE + 0.5);
    }
    ctx2.stroke();
  }

  function drawPlay(ctx2, state, now) {
    const halfW = canvas.width * 0.5;
    const halfH = canvas.height * 0.5;
    const cx = state.cam.followX;
    const cy = state.cam.followY;
    const gx0 = Math.max(0, Math.floor((cx - halfW) / TILE) - 2);
    const gx1 = Math.min(COLS - 1, Math.ceil((cx + halfW) / TILE) + 2);
    const gy0 = Math.max(0, Math.floor((cy - halfH) / TILE) - 2);
    const gy1 = Math.min(ROWS - 1, Math.ceil((cy + halfH) / TILE) + 2);

    const t = (now - state.t0) / 1000;
    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0; x <= gx1; x++) {
        const tile = state.tiles[y][x];
        if (tile.type === Tile.empty) continue;

        const { ox, oy } = tileOffset(tile, t);
        let alpha = 1;

        // Flicker for platforms near break
        if (
          (tile.type === Tile.platform || tile.type === Tile.mud || tile.type === Tile.betrayal) &&
          tile.sab.platform.type === "flickerThenBreak" &&
          tile.breakTimer > 0
        ) {
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
        drawTile(ctx2, tile.type, x * TILE + ox, y * TILE + oy, alpha, glowBoost, now, getPlayMergeMask(state, x, y, tile.type));
      }
    }

    drawTextsInWorld(ctx2, gx0, gy0, gx1, gy1);

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

    for (let i = state.teleportFx.length - 1; i >= 0; i--) {
      const fx = state.teleportFx[i];
      const u = (state.now - fx.t0) / fx.dur;
      if (u >= 1) {
        state.teleportFx.splice(i, 1);
        continue;
      }
      const a = 1 - u;
      ctx2.save();
      ctx2.globalAlpha = a * 0.9;
      ctx2.strokeStyle = "rgba(167, 243, 208, 0.95)";
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.arc(fx.fromX, fx.fromY, 8 + u * 18, 0, Math.PI * 2);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.arc(fx.toX, fx.toY, 16 - u * 10, 0, Math.PI * 2);
      ctx2.stroke();
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

    // Remote players (ghosts), then local player
    if (mpSocket && mpRoomId) {
      for (const peer of mpRemotePeers.values()) {
        drawRemotePlayer(ctx2, peer, state);
      }
    }

    // Player (always above tiles / background)
    drawPlayer(ctx2, state.player, state);

    // ADD 1: Draw PB ghost if available for this level.
    if (state.sourceLevelId && pbGhostFrames[state.sourceLevelId]) {
      const elapsed = state.now - state.t0;
      const frames = pbGhostFrames[state.sourceLevelId];
      if (frames.length > 1) {
        let gi = 0;
        for (let i = 0; i < frames.length - 1; i++) {
          if (frames[i].t <= elapsed && frames[i + 1].t > elapsed) { gi = i; break; }
          if (frames[i].t <= elapsed) gi = i;
        }
        const gf = frames[gi];
        ctx2.save();
        ctx2.globalAlpha = 0.28;
        ctx2.fillStyle = "rgba(120, 200, 255, 0.7)";
        ctx2.beginPath();
        ctx2.roundRect(gf.x - 9, gf.y, 18, 26, 4);
        ctx2.fill();
        ctx2.globalAlpha = 0.5;
        ctx2.fillStyle = "rgba(180, 230, 255, 0.9)";
        ctx2.font = "bold 9px monospace";
        ctx2.textAlign = "center";
        ctx2.fillText("PB", gf.x, gf.y - 4);
        ctx2.restore();
      }
    }

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

    if (state.ended) drawEndOverlay(ctx2, state);
  }

  function tileOffset(tile, tSec) {
    if (tile.sab.motion !== "shift") return { ox: 0, oy: 0 };
    const ox = Math.sin(tSec * tile.sab.shiftSpeed + tile.sab.shiftPhase) * tile.sab.shiftAmp;
    const oy = Math.cos(tSec * tile.sab.shiftSpeed * 0.9 + tile.sab.shiftPhase) * (tile.sab.shiftAmp * 0.18);
    return { ox, oy };
  }

  function drawTextsInWorld(ctx2, gx0, gy0, gx1, gy1) {
    ctx2.save();
    ctx2.textBaseline = "top";
    const ax0 = gx0 ?? 0;
    const ay0 = gy0 ?? 0;
    const ax1 = gx1 ?? COLS - 1;
    const ay1 = gy1 ?? ROWS - 1;
    for (const k of Object.keys(levelTexts)) {
      const label = levelTexts[k];
      if (!label) continue;
      const parts = k.split(",");
      const sx = parseInt(parts[0], 10);
      const sy = parseInt(parts[1], 10);
      if (!inBounds(sx, sy) || sx < ax0 || sx > ax1 || sy < ay0 || sy > ay1) continue;
      const px = sx * TILE + 3;
      const py = sy * TILE + 2;
      const slice = label.slice(0, 22);
      ctx2.font = "900 10px system-ui,Segoe UI,sans-serif";
      ctx2.lineJoin = "round";
      ctx2.strokeStyle = "rgba(0,0,0,0.7)";
      ctx2.lineWidth = 3.5;
      ctx2.strokeText(slice, px, py);
      ctx2.fillStyle = "rgba(255,252,245,0.96)";
      ctx2.fillText(slice, px, py);
    }
    ctx2.restore();
  }

  /**
   * @param {() => void} fallback
   * @param {number} roundR corner radius for clip (0 = no clip)
   */
  function drawTileTexture(ctx2, texKey, x, y, w, h, alpha, roundR, fallback) {
    const im = tileTextureCache[texKey];
    if (im && im.complete && im.naturalWidth > 0) {
      ctx2.save();
      ctx2.globalAlpha = alpha;
      if (roundR > 0) {
        ctx2.beginPath();
        roundRect(ctx2, x, y, w, h, roundR);
        ctx2.clip();
      }
      ctx2.drawImage(im, x, y, w, h);
      ctx2.restore();
      return;
    }
    fallback();
  }

  function drawTile(ctx2, type, x, y, alpha = 1, glowBoost = 0, nowMs = 0, mergeMask = null) {
    ctx2.save();
    ctx2.globalAlpha = alpha;
    const pulseFast = 0.5 + 0.5 * Math.sin(nowMs * 0.012 + x * 0.02 + y * 0.03);
    const pulseSlow = 0.5 + 0.5 * Math.sin(nowMs * 0.005 + x * 0.01 - y * 0.014);
    const ml = mergeMask && mergeMask.l ? 0 : 2;
    const mr = mergeMask && mergeMask.r ? 0 : 2;
    const mu = mergeMask && mergeMask.u ? 0 : 4;
    const md = mergeMask && mergeMask.d ? 0 : 4;

    if (type === Tile.platform || type === Tile.betrayal) {
      drawTileTexture(ctx2, "platform", x + ml - 1, y + mu, TILE - ml - mr + 2, TILE - mu - md, alpha, 6, () => {
        const col = type === Tile.betrayal ? "rgba(246,173,85,0.9)" : "rgba(79,103,255,0.9)";
        glowRect(ctx2, x + ml, y + mu + 1, TILE - ml - mr, TILE - mu - md - 1, col, glowBoost);
      });
      if (type === Tile.betrayal) {
        ctx2.strokeStyle = `rgba(255,237,213,${0.45 + pulseFast * 0.3})`;
        ctx2.lineWidth = 1.2;
        ctx2.beginPath();
        ctx2.moveTo(x + 6, y + 8);
        ctx2.lineTo(x + TILE - 6, y + TILE - 8);
        ctx2.moveTo(x + TILE - 6, y + 8);
        ctx2.lineTo(x + 6, y + TILE - 8);
        ctx2.stroke();
      }
    } else if (type === Tile.spikes) {
      drawTileTexture(ctx2, "spikes", x + 2, y + 2, TILE - 4, TILE - 4, alpha * 0.92, 0, () => {
        drawSpikes(ctx2, x, y, glowBoost);
      });
      ctx2.strokeStyle = `rgba(255,163,187,${0.45 + pulseFast * 0.2})`;
      ctx2.lineWidth = 1.2;
      ctx2.beginPath();
      ctx2.moveTo(x + 5, y + TILE - 6);
      ctx2.lineTo(x + TILE - 5, y + TILE - 6);
      ctx2.stroke();
      glowRect(ctx2, x + 7, y + TILE - 10, TILE - 14, 5, "rgba(255,77,109,0.75)", 0.5 + glowBoost);
    } else if (type === Tile.jumppad) {
      drawTileTexture(ctx2, "jumppad", x + 1, y + 2, TILE - 2, TILE - 4, alpha * 0.9, 7, () => {
        glowRect(ctx2, x + 6, y + 10, TILE - 12, TILE - 14, "rgba(45,212,191,0.9)", glowBoost);
        ctx2.fillStyle = "rgba(255,255,255,0.12)";
        ctx2.beginPath();
        ctx2.moveTo(x + 10, y + TILE - 10);
        ctx2.lineTo(x + TILE - 10, y + TILE - 10);
        ctx2.lineTo(x + TILE / 2, y + 14);
        ctx2.closePath();
        ctx2.fill();
      });
      ctx2.strokeStyle = `rgba(167,243,208,${0.5 + pulseSlow * 0.25})`;
      ctx2.lineWidth = 1.4;
      ctx2.beginPath();
      ctx2.moveTo(x + 7, y + TILE - 12);
      ctx2.lineTo(x + TILE / 2, y + 9);
      ctx2.lineTo(x + TILE - 7, y + TILE - 12);
      ctx2.stroke();
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
      // Keep a shared shell template so custom images still read as "hex".
      ctx2.save();
      if (shouldDrawShadows()) {
        ctx2.shadowColor = "rgba(167,139,250,0.95)";
        ctx2.shadowBlur = 10 + glowBoost * 8 + pulseSlow * 7;
      }
      ctx2.fillStyle = "rgba(54,38,88,0.98)";
      roundRect(ctx2, x + 2, y + 2, TILE - 4, TILE - 4, 8);
      ctx2.fill();
      ctx2.restore();
      drawTileTexture(ctx2, "hex", x + 2, y + 2, TILE - 4, TILE - 4, alpha * 0.9, 8, () => {});
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      const r = TILE * (0.23 + pulseFast * 0.02);
      ctx2.strokeStyle = `rgba(196,181,253,${0.7 + pulseSlow * 0.2})`;
      ctx2.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const rr = r - i * 3;
        ctx2.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (Math.PI * 2 * k) / 6;
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (k === 0) ctx2.moveTo(px, py);
          else ctx2.lineTo(px, py);
        }
        ctx2.closePath();
        ctx2.stroke();
      }
      glowRect(ctx2, x + 7, y + 7, TILE - 14, TILE - 14, "rgba(167,139,250,0.86)", 1 + pulseFast * 0.6 + glowBoost);
    } else if (type === Tile.lava) {
      // Lava always gets emissive treatment regardless of texture availability.
      ctx2.save();
      if (shouldDrawShadows()) {
        ctx2.shadowColor = "rgba(251,146,60,0.95)";
        ctx2.shadowBlur = 12 + glowBoost * 8 + pulseFast * 6;
      }
      ctx2.fillStyle = "rgba(58,20,14,0.98)";
      roundRect(ctx2, x + ml, y + mu - 1, TILE - ml - mr, TILE - mu - md + 1, 7);
      ctx2.fill();
      ctx2.restore();
      drawTileTexture(ctx2, "lava", x + ml, y + mu, TILE - ml - mr, TILE - mu - md, alpha * 0.9, 7, () => {});
      const waveY = y + mu + 4 + pulseSlow * 2.2;
      const grad = ctx2.createLinearGradient(x + ml + 2, y + mu + 2, x + TILE - mr - 2, y + TILE - md - 2);
      grad.addColorStop(0, `rgba(253,186,116,${0.75 + pulseFast * 0.2})`);
      grad.addColorStop(0.55, "rgba(249,115,22,0.78)");
      grad.addColorStop(1, "rgba(220,38,38,0.78)");
      ctx2.fillStyle = grad;
      roundRect(ctx2, x + ml + 2, waveY, TILE - ml - mr - 4, Math.max(5, TILE - mu - md - 8), 5);
      ctx2.fill();
      ctx2.strokeStyle = `rgba(255,241,214,${0.4 + pulseFast * 0.25})`;
      ctx2.lineWidth = 1.1;
      ctx2.beginPath();
      ctx2.moveTo(x + 6, y + 11);
      ctx2.lineTo(x + 11, y + 8);
      ctx2.lineTo(x + 16, y + 11);
      ctx2.lineTo(x + 22, y + 7);
      ctx2.lineTo(x + 26, y + 10);
      ctx2.stroke();
    } else if (type === Tile.mud) {
      const mim = tileTextureCache.mud;
      if (mim && mim.complete && mim.naturalWidth > 0) {
        ctx2.save();
        ctx2.globalAlpha = alpha;
        ctx2.beginPath();
        roundRect(ctx2, x + ml, y + mu + 1, TILE - ml - mr, TILE - mu - md - 1, 6);
        ctx2.clip();
        ctx2.drawImage(mim, x + ml, y + mu + 1, TILE - ml - mr, TILE - mu - md - 1);
        ctx2.restore();
      } else {
        ctx2.fillStyle = "rgba(120, 72, 48, 0.94)";
        roundRect(ctx2, x + ml, y + mu + 1, TILE - ml - mr, TILE - mu - md - 1, 6);
        ctx2.fill();
        ctx2.fillStyle = "rgba(90, 48, 32, 0.55)";
        for (let i = 0; i < 5; i++) {
          const dx = x + 5 + (i * 7) % (TILE - 10);
          const dy = y + 8 + ((i * 5) % (TILE - 14));
          ctx2.fillRect(dx, dy, 3, 2);
        }
      }
    } else if (type === Tile.speedBoost) {
      ctx2.save();
      if (shouldDrawShadows()) {
        ctx2.shadowColor = "rgba(74,222,128,0.95)";
        ctx2.shadowBlur = 11 + glowBoost * 8 + pulseFast * 6;
      }
      const g = ctx2.createLinearGradient(x + 2, y + 4, x + TILE - 2, y + TILE - 4);
      g.addColorStop(0, "rgba(22,163,74,0.9)");
      g.addColorStop(1, "rgba(16,185,129,0.9)");
      ctx2.fillStyle = g;
      roundRect(ctx2, x + 2, y + 4, TILE - 4, TILE - 8, 7);
      ctx2.fill();
      ctx2.restore();
      drawTileTexture(ctx2, "speedBoost", x + 2, y + 4, TILE - 4, TILE - 8, alpha * 0.88, 6, () => {});
      ctx2.strokeStyle = `rgba(220,252,231,${0.4 + pulseSlow * 0.4})`;
      ctx2.lineWidth = 1.2;
      ctx2.beginPath();
      ctx2.moveTo(x + 7, y + 11);
      ctx2.lineTo(x + 14, y + 11);
      ctx2.lineTo(x + 11, y + 17);
      ctx2.lineTo(x + 19, y + 17);
      ctx2.lineTo(x + 14, y + 25);
      ctx2.stroke();
      glowRect(ctx2, x + 5, y + 7, TILE - 10, TILE - 12, "rgba(34,197,94,0.78)", 0.8 + pulseFast * 0.8 + glowBoost);
    } else if (type === Tile.food) {
      drawTileTexture(ctx2, "food", x + 2, y + 2, TILE - 4, TILE - 4, alpha * 0.93, 10, () => {
        ctx2.fillStyle = "rgba(251,146,60,0.95)";
        ctx2.beginPath();
        ctx2.arc(x + TILE / 2, y + TILE / 2, 10, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.strokeStyle = "rgba(255,255,255,0.3)";
        ctx2.lineWidth = 2;
        ctx2.stroke();
      });
      ctx2.strokeStyle = `rgba(254,215,170,${0.5 + pulseFast * 0.3})`;
      ctx2.lineWidth = 1.4;
      ctx2.beginPath();
      ctx2.arc(x + TILE / 2, y + TILE / 2, 9 + pulseSlow * 1.4, 0, Math.PI * 2);
      ctx2.stroke();
      glowRect(ctx2, x + 10, y + 10, TILE - 20, TILE - 20, "rgba(251,146,60,0.75)", 0.35 + glowBoost);
    } else if (type === Tile.pressureSwitch) {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.01 + x * 0.02);
      ctx2.fillStyle = "rgba(155, 37, 71, 0.92)";
      roundRect(ctx2, x + 4, y + 4, TILE - 8, TILE - 8, 7);
      ctx2.fill();
      ctx2.strokeStyle = `rgba(255, 195, 213, ${0.45 + pulse * 0.4})`;
      ctx2.lineWidth = 1.8;
      ctx2.strokeRect(x + 8, y + 8, TILE - 16, TILE - 16);
      ctx2.fillStyle = "rgba(255,255,255,0.78)";
      ctx2.fillRect(x + TILE / 2 - 1.5, y + 9, 3, TILE - 18);
      ctx2.fillRect(x + 9, y + TILE / 2 - 1.5, TILE - 18, 3);
    } else if (type === Tile.timedDoor) {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.006 + y * 0.04);
      ctx2.strokeStyle = `rgba(94, 234, 212, ${0.55 + pulse * 0.35})`;
      ctx2.lineWidth = 2;
      roundRect(ctx2, x + 5, y + 3, TILE - 10, TILE - 6, 8);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(13, 148, 136, 0.25)";
      roundRect(ctx2, x + 8, y + 6, TILE - 16, TILE - 12, 6);
      ctx2.fill();
      ctx2.fillStyle = "rgba(167, 243, 208, 0.65)";
      ctx2.fillRect(x + TILE - 11, y + TILE / 2 - 2, 3, 4);
    } else if (type === Tile.pathBlock) {
      ctx2.fillStyle = "rgba(150,200,255,0.5)";
      ctx2.strokeStyle = "rgba(150,200,255,0.8)";
      ctx2.lineWidth = 2;
      roundRect(ctx2, x + 4, y + 4, TILE - 8, TILE - 8, 8);
      ctx2.fill();
      ctx2.stroke();
    } else if (type === Tile.checkpoint) {
      const pulse = 0.92 + 0.08 * Math.sin(nowMs / 220);
      ctx2.save();
      ctx2.translate(x + TILE / 2, y + TILE / 2);
      ctx2.scale(pulse, pulse);
      ctx2.strokeStyle = "rgba(125, 211, 252, 0.95)";
      ctx2.fillStyle = "rgba(14, 165, 233, 0.4)";
      ctx2.lineWidth = 2.5;
      ctx2.beginPath();
      ctx2.moveTo(0, -TILE * 0.36);
      ctx2.lineTo(TILE * 0.34, 0);
      ctx2.lineTo(0, TILE * 0.36);
      ctx2.lineTo(-TILE * 0.34, 0);
      ctx2.closePath();
      ctx2.fill();
      ctx2.stroke();
      ctx2.restore();
    }

    ctx2.restore();
  }

  function glowRect(ctx2, x, y, w, h, color, boost = 0) {
    ctx2.save();
    if (shouldDrawShadows()) {
      ctx2.shadowColor = color;
      ctx2.shadowBlur = 10 + boost * 6;
    }
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
    if (shouldDrawShadows()) {
      ctx2.shadowColor = "rgba(255,77,109,0.9)";
      ctx2.shadowBlur = 10 + boost * 6;
    }
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

  function drawRemotePlayer(ctx2, peer, _state) {
    const p = {
      x: peer.x,
      y: peer.y,
      vx: peer.vx,
      w: 18,
      h: 26,
      squash: 0,
      stretch: 0,
      landPop: 0,
    };
    ctx2.save();
    ctx2.translate(p.x, p.y);
    const face = Math.sign(p.vx) || 1;
    ctx2.scale(face, 1);
    const aid = peer.avatarId && avatarById(peer.avatarId) ? peer.avatarId : null;
    const avatarImage = aid ? avatarRenderImageCache.get(aid) : null;
    if (avatarImage && avatarImage.complete && avatarImage.naturalWidth > 0) {
      const aw = p.w * 2.2;
      const ah = p.h * 1.35;
      ctx2.globalAlpha = 0.86;
      ctx2.shadowColor = "rgba(167,139,250,0.55)";
      ctx2.shadowBlur = 6;
      ctx2.drawImage(avatarImage, -aw / 2, -ah * 0.08, aw, ah);
      drawAvatarAccent(ctx2, aid, p, true);
      ctx2.globalAlpha = 1;
      ctx2.shadowBlur = 0;
    } else {
      ctx2.globalAlpha = 0.78;
      ctx2.fillStyle = "rgba(167,139,250,0.88)";
      roundRect(ctx2, -p.w / 2, 0, p.w, p.h, 9);
      ctx2.fill();
      ctx2.strokeStyle = "rgba(196,181,253,0.9)";
      ctx2.lineWidth = 2;
      roundRect(ctx2, -p.w / 2, 0, p.w, p.h, 9);
      ctx2.stroke();
      ctx2.globalAlpha = 1;
    }
    ctx2.restore();

    const nm = String(peer.name || "Friend").slice(0, 16);
    ctx2.save();
    ctx2.font = "900 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "bottom";
    const tw = ctx2.measureText(nm).width;
    const tx = p.x;
    const ty = p.y - 8;
    ctx2.fillStyle = "rgba(6,8,18,0.55)";
    roundRect(ctx2, tx - tw / 2 - 5, ty - 16, tw + 10, 15, 6);
    ctx2.fill();
    ctx2.fillStyle = "rgba(235,241,255,0.95)";
    ctx2.fillText(nm, tx, ty);
    ctx2.restore();
  }

  function drawPlayer(ctx2, p, state) {
    // squash/stretch (subtle and responsive) + land impact
    const land = typeof p.landPop === "number" ? p.landPop : 0;
    const squash = 1 - p.squash * 0.22 - land * 0.14;
    const stretch = 1 + p.stretch * 0.22 + land * 0.06;
    const sx = stretch;
    const sy = squash;

    ctx2.save();
    ctx2.translate(p.x, p.y);
    const face = Math.sign(p.vx) || 1;
    ctx2.scale(face, 1);
    ctx2.scale(sx, sy);

    const equippedId = getEquippedAvatarId();
    const avMeta = equippedId ? avatarById(equippedId) : null;
    const avatarImage = equippedId ? avatarRenderImageCache.get(equippedId) : null;
    if (
      avMeta &&
      (!avatarImage || !avatarImage.complete || avatarImage.naturalWidth <= 0)
    ) {
      const t = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (t - lastAvatarPrimeEquipMs > 160) {
        lastAvatarPrimeEquipMs = t;
        void primeEquippedAvatarOnly();
      }
    }
    if (avatarImage && avatarImage.complete && avatarImage.naturalWidth > 0) {
      const aw = p.w * 2.2;
      const ah = p.h * 1.35;
      ctx2.drawImage(avatarImage, -aw / 2, -ah * 0.08, aw, ah);
      drawAvatarAccent(ctx2, equippedId, p, false);
    } else if (equippedId) {
      ctx2.fillStyle = "rgba(209,250,229,0.95)";
      roundRect(ctx2, -p.w / 2, 0, p.w, p.h, 9);
      ctx2.fill();
      ctx2.strokeStyle = "rgba(34,197,94,0.65)";
      ctx2.lineWidth = 2;
      roundRect(ctx2, -p.w / 2, 0, p.w, p.h, 9);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(6,78,59,0.75)";
      ctx2.fillRect(2, 8, 3, 3);
      ctx2.fillRect(6, 8, 3, 3);
    } else {
      const col = "rgba(235,241,255,0.96)";
      ctx2.fillStyle = col;
      roundRect(ctx2, -p.w / 2, 0, p.w, p.h, 9);
      ctx2.fill();

      ctx2.fillStyle = "rgba(10,12,26,0.55)";
      ctx2.fillRect(2, 8, 3, 3);
      ctx2.fillRect(6, 8, 3, 3);
    }

    if (state.spawnProtectUntil && state.now < state.spawnProtectUntil) {
      ctx2.save();
      ctx2.globalAlpha = 0.55 + 0.35 * Math.sin((state.now - state.t0) / 160);
      ctx2.strokeStyle = "rgba(45,212,191,0.95)";
      ctx2.lineWidth = 3;
      if (shouldDrawShadows()) {
        ctx2.shadowColor = "rgba(45,212,191,0.6)";
        ctx2.shadowBlur = 12;
      }
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

  function drawAvatarAccent(ctx2, avatarId, p, remote) {
    if (!avatarId) return;
    const glowAlpha = remote ? 0.55 : 0.8;
    if (avatarId === "ghost_1") {
      ctx2.strokeStyle = `rgba(147,197,253,${glowAlpha})`;
      ctx2.lineWidth = 1.4;
      ctx2.beginPath();
      ctx2.arc(0, p.h * 0.35, Math.max(p.w, p.h) * 0.62, 0, Math.PI * 2);
      ctx2.stroke();
      return;
    }
    if (avatarId === "ghost_2") {
      ctx2.fillStyle = `rgba(251,146,60,${0.32 * glowAlpha})`;
      ctx2.beginPath();
      ctx2.moveTo(-2, p.h * 0.2);
      ctx2.lineTo(2, p.h * 0.06);
      ctx2.lineTo(6, p.h * 0.2);
      ctx2.closePath();
      ctx2.fill();
      return;
    }
    if (avatarId === "ghost_3") {
      ctx2.strokeStyle = `rgba(52,211,153,${glowAlpha})`;
      ctx2.lineWidth = 1.2;
      ctx2.beginPath();
      ctx2.moveTo(-7, p.h * 0.6);
      ctx2.quadraticCurveTo(-2, p.h * 0.44, 4, p.h * 0.62);
      ctx2.stroke();
      return;
    }
    if (avatarId === "ghost_4") {
      ctx2.strokeStyle = `rgba(167,139,250,${glowAlpha})`;
      ctx2.lineWidth = 1.2;
      ctx2.strokeRect(-6, p.h * 0.12, 12, 12);
      return;
    }
    if (avatarId === "ghost_5") {
      ctx2.strokeStyle = `rgba(251,113,133,${glowAlpha})`;
      ctx2.lineWidth = 1.4;
      ctx2.beginPath();
      ctx2.arc(0, p.h * 0.2, 5, 0, Math.PI * 2);
      ctx2.stroke();
    }
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

  const _queryTilesScratch = new Array(64);
  const _queryTilesScratchCap = 64;
  let _queryTilesLen = 0;

  function queryTiles(state, aabb) {
    const minX = clamp(Math.floor(aabb.x / TILE) - 1, 0, COLS - 1);
    const maxX = clamp(Math.floor((aabb.x + aabb.w) / TILE) + 1, 0, COLS - 1);
    const minY = clamp(Math.floor(aabb.y / TILE) - 1, 0, ROWS - 1);
    const maxY = clamp(Math.floor((aabb.y + aabb.h) / TILE) + 1, 0, ROWS - 1);
    _queryTilesLen = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (_queryTilesLen < _queryTilesScratchCap) {
          let slot = _queryTilesScratch[_queryTilesLen];
          if (!slot) { slot = { gx: 0, gy: 0, tile: null }; _queryTilesScratch[_queryTilesLen] = slot; }
          slot.gx = x; slot.gy = y; slot.tile = state.tiles[y][x];
          _queryTilesLen++;
        }
      }
    }
    _queryTilesScratch.length = _queryTilesLen;
    return _queryTilesScratch;
  }

  function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function openAuthModal(view = "login") {
    if (!elAuthModal) return;
    if (elAuthBackdrop) elAuthBackdrop.classList.remove("hidden");
    elAuthModal.setAttribute("aria-hidden", "false");
    elAuthModal.classList.remove("hidden");
    if (elAuthFormLogin) elAuthFormLogin.classList.toggle("hidden", view !== "login");
    if (elAuthFormRegister) elAuthFormRegister.classList.toggle("hidden", view !== "register");
    if (elAuthModalTitle) elAuthModalTitle.textContent = view === "register" ? "Create account" : "Sign in";
    const onLogin = view === "login";
    if (elAuthTabLogin) {
      elAuthTabLogin.classList.toggle("active", onLogin);
      elAuthTabLogin.setAttribute("aria-selected", onLogin ? "true" : "false");
      elAuthTabLogin.tabIndex = onLogin ? 0 : -1;
    }
    if (elAuthTabRegister) {
      elAuthTabRegister.classList.toggle("active", !onLogin);
      elAuthTabRegister.setAttribute("aria-selected", onLogin ? "false" : "true");
      elAuthTabRegister.tabIndex = onLogin ? -1 : 0;
    }
    setAuthStatus("", "neutral");
    hideAuthDiagnostics();
    requestAnimationFrame(() => {
      const focusEl =
        view === "register"
          ? elAuthRegUser || elAuthRegPass
          : elAuthLoginUser || elAuthLoginPass;
      if (focusEl) focusEl.focus();
    });
  }

  function bootstrapMainApp() {
    if (appBootstrapped) return;
    appBootstrapped = true;
    syncStartModalLevelPickVisibility();
    if (!deviceMode && elDeviceModal) {
      elDeviceModal.classList.remove("hidden");
    } else {
      document.documentElement.classList.toggle("device-touch-mode", deviceMode === "mobile");
      syncExitAndRotateUI();
      if (save.activePlayerId && save.players[save.activePlayerId]) setActivePlayer(save.activePlayerId);
      else openStartModal();
      maybeRestoreBuildDraft();
    }
  }

  function closeAuthModal() {
    if (elAuthModal) {
      elAuthModal.classList.add("hidden");
      elAuthModal.setAttribute("aria-hidden", "true");
    }
    if (elAuthBackdrop) elAuthBackdrop.classList.add("hidden");
    if (!appBootstrapped) bootstrapMainApp();
    else if (authCloseOpensStart && !activePlayer) {
      authCloseOpensStart = false;
      openStartModal();
    } else {
      authCloseOpensStart = false;
    }
  }

  /**
   * API may return `error` as a string code or a nested object (e.g. validation / proxy).
   * Never pass objects straight to textContent or String() yields "[object Object]".
   */
  function coerceAuthErrorToString(err) {
    if (err == null || err === "") return "";
    if (typeof err === "string") return err.trim();
    if (typeof err === "number" || typeof err === "boolean") return String(err);
    if (Array.isArray(err)) {
      const parts = err.map((e) => coerceAuthErrorToString(e)).filter(Boolean);
      return parts.join("; ");
    }
    if (typeof err === "object") {
      const o = /** @type {Record<string, unknown>} */ (err);
      if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
      if (typeof o.msg === "string" && o.msg.trim()) return o.msg.trim();
      if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
      if (typeof o.code === "string" && o.code.trim()) return o.code.trim();
      if (typeof o.detail === "string" && o.detail.trim()) return o.detail.trim();
      try {
        const s = JSON.stringify(o);
        return s.length <= 180 ? s : "Request failed";
      } catch {
        return "Request failed";
      }
    }
    return String(err);
  }

  function formatAuthError(err) {
    const raw = coerceAuthErrorToString(err);
    if (!raw) return "Something went wrong — try again.";
    const key = raw.toUpperCase().replace(/\s+/g, "_");
    const rawLower = raw.toLowerCase();
    const errName =
      err && typeof err === "object" && "name" in err
        ? String(/** @type {{ name?: string }} */ (err).name || "").toLowerCase()
        : "";
    const map = {
      INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
      INVALID_CREDENTIALS: "Wrong email or password.",
      EMAIL_NOT_CONFIRMED: "Confirm your email address before signing in (check your inbox).",
      USER_ALREADY_REGISTERED: "An account with this email already exists.",
      USER_ALREADY_EXISTS: "An account with this email already exists.",
      WEAK_PASSWORD: "Password must be at least 6 characters.",
      INVALID_EMAIL: "Enter a valid email address.",
      NETWORK: "Network error — check your connection.",
    };
    if (map[key]) return map[key];
    if (rawLower.includes("rate limit") || rawLower.includes("too many requests")) {
      return "Rate limit reached. Wait a bit before trying again.";
    }
    if (rawLower.includes("404") || rawLower.includes("not found")) {
      return "Auth endpoint returned 404. Usually wrong SUPABASE_URL/project or disabled/invalid endpoint.";
    }
    if (
      rawLower.includes("gateway timeout") ||
      rawLower.includes("504") ||
      errName.includes("authretryablefetcherror") ||
      raw.trim() === "{}"
    ) {
      return "Supabase Auth email endpoint is timing out (504). Check Supabase Auth Email/SMTP settings or service status; meanwhile use password/anonymous login.";
    }
    if (rawLower.includes("anonymous") && rawLower.includes("disabled")) {
      return "Anonymous sign-in is disabled in this Supabase project (or wrong project URL/key).";
    }
    if (rawLower.includes("signup") && rawLower.includes("disabled")) {
      return "Signups are disabled in Supabase Auth settings.";
    }
    if (rawLower.includes("email provider is disabled")) {
      return "Email provider is disabled in Supabase Auth → Providers.";
    }
    if (
      rawLower.includes("already") &&
      (rawLower.includes("session") || rawLower.includes("signed in") || rawLower.includes("logged in"))
    ) {
      return "Another session is still active. Use Log out first, or try again (the app clears the old session automatically).";
    }
    if (rawLower.includes("invalid api key") || rawLower.includes("invalid jwt") || rawLower.includes("jwt expired")) {
      // IMPROVE 7: Attempt silent session refresh so expired tokens don't silently block API calls.
      try {
        const sb = getSupabaseClient();
        if (sb && typeof sb.auth.refreshSession === "function") {
          sb.auth.refreshSession().catch(() => {});
        }
      } catch (_) {}
      return "Session expired — refreshing. If this persists, please log out and back in.";
    }
    if (raw && !/^\{/.test(raw) && raw.length <= 220) return raw;
    return "Something went wrong — try again.";
  }

  /**
   * Per-path cooldown so a flaky magic-link/OTP path does not block password sign-in or anonymous.
   * @typedef {"otp" | "cred" | "anon" | "oauth"} AuthCooldownChannel
   */
  const authCooldownUntilMs = { otp: 0, cred: 0, anon: 0, oauth: 0 };
  const authCooldownReasonByChannel = {
    otp: "rate-limited",
    cred: "rate-limited",
    anon: "rate-limited",
    oauth: "rate-limited",
  };

  /** Last JSON blob for "Copy details for support" (clipboard). */
  let lastAuthDiagJson = "";

  function getSupabaseHostForDiag() {
    const w = typeof window !== "undefined" ? window : null;
    const raw = w && typeof w.SUPABASE_URL === "string" ? w.SUPABASE_URL.trim() : "";
    if (!raw) return "(no SUPABASE_URL)";
    try {
      return new URL(raw).host;
    } catch {
      return "(invalid SUPABASE_URL)";
    }
  }

  function serializeErrForDiag(err) {
    if (err == null) return null;
    if (typeof err === "string") return { message: err };
    if (typeof err !== "object") return { message: String(err) };
    const e = /** @type {Record<string, unknown>} */ (err);
    const out = /** @type {Record<string, unknown>} */ ({});
    if (typeof e.message === "string") out.message = e.message;
    if (typeof e.name === "string") out.name = e.name;
    if (typeof e.status === "number") out.status = e.status;
    if (typeof e.code === "string" || typeof e.code === "number") out.code = e.code;
    if (typeof e.__isAuthError === "boolean") out.__isAuthError = e.__isAuthError;
    return Object.keys(out).length ? out : { raw: coerceAuthErrorToString(err) };
  }

  function buildAuthDiagBlob(op, err, extra) {
    return {
      time: new Date().toISOString(),
      op,
      page: typeof location !== "undefined" ? location.href.split("#")[0].split("?")[0] : "",
      supabaseHost: getSupabaseHostForDiag(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      error: serializeErrForDiag(err),
      extra: extra && typeof extra === "object" ? extra : undefined,
    };
  }

  function hideAuthDiagnostics() {
    lastAuthDiagJson = "";
    const row = typeof document !== "undefined" ? document.getElementById("authDiagActions") : null;
    if (row) row.classList.add("hidden");
  }

  function showAuthDiagnostics(op, err, extra) {
    const blob = buildAuthDiagBlob(op, err, extra);
    lastAuthDiagJson = JSON.stringify(blob, null, 2);
    console.error(SB_LOG, "auth diagnostic (copy with button below)", blob);
    const row = typeof document !== "undefined" ? document.getElementById("authDiagActions") : null;
    if (row) row.classList.remove("hidden");
  }

  /**
   * Friendly line + optional support JSON. Clears diag on new success flows via hideAuthDiagnostics in openAuthModal.
   * @param {string} friendlyMsg
   * @param {string} op
   * @param {unknown} [err]
   * @param {Record<string, unknown>} [extra]
   */
  function showAuthFailure(friendlyMsg, op, err, extra) {
    setAuthStatus(friendlyMsg + " Use “Copy details for support” below and send that text.", "error");
    showAuthDiagnostics(op, err, extra);
  }

  function parseRateLimitCooldownMs(err) {
    const raw = coerceAuthErrorToString(err).toLowerCase();
    const errName =
      err && typeof err === "object" && "name" in err
        ? String(/** @type {{ name?: string }} */ (err).name || "").toLowerCase()
        : "";
    if (!raw && !errName.includes("authretryablefetcherror")) return { waitMs: 0, reason: "rate-limited" };
    if (
      raw.includes("gateway timeout") ||
      raw.includes("504") ||
      errName.includes("authretryablefetcherror")
    ) {
      return { waitMs: 90 * 1000, reason: "Supabase timeout" };
    }
    if (!(raw.includes("rate limit") || raw.includes("too many requests"))) return { waitMs: 0, reason: "rate-limited" };
    const sec = raw.match(/(\d+)\s*second/);
    if (sec) return { waitMs: Math.max(0, parseInt(sec[1], 10) * 1000), reason: "rate limit" };
    const min = raw.match(/(\d+)\s*minute/);
    if (min) return { waitMs: Math.max(0, parseInt(min[1], 10) * 60 * 1000), reason: "rate limit" };
    return { waitMs: 60 * 1000, reason: "rate limit" };
  }

  function getAuthCooldownRemainingMs(/** @type {AuthCooldownChannel} */ ch) {
    return Math.max(0, authCooldownUntilMs[ch] - Date.now());
  }

  function checkAuthCooldownOrWarn(/** @type {AuthCooldownChannel} */ ch) {
    const left = getAuthCooldownRemainingMs(ch);
    if (left <= 0) return false;
    const sec = Math.ceil(left / 1000);
    const reason = authCooldownReasonByChannel[ch] || "Wait";
    setAuthStatus(`${reason} active. Try again in ${sec}s.`, "error");
    return true;
  }

  function applyAuthCooldownFromError(err, /** @type {AuthCooldownChannel} */ ch) {
    const { waitMs, reason } = parseRateLimitCooldownMs(err);
    if (waitMs <= 0) return;
    authCooldownReasonByChannel[ch] = reason;
    authCooldownUntilMs[ch] = Math.max(authCooldownUntilMs[ch], Date.now() + waitMs);
    const sec = Math.ceil(waitMs / 1000);
    setAuthStatus(`${reason} detected. Please wait ${sec}s before retrying.`, "error");
    console.warn(SB_LOG, "auth cooldown applied", { waitMs, reason, channel: ch });
  }

  function setAuthStatus(message, tone = "neutral") {
    const el = elAuthStatus || (typeof document !== "undefined" ? document.getElementById("authStatus") : null);
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("isSuccess", "isError");
    if (tone === "success") el.classList.add("isSuccess");
    if (tone === "error") el.classList.add("isError");
  }

  /**
   * Password / anonymous / OTP often fail if a JWT (e.g. Discord) is already in storage.
   * Clear the local session before starting a non-OAuth sign-in.
   * @param {string} [statusMsg] optional short line for #authStatus
   */
  async function clearLocalAuthIfNeeded(sb, statusMsg) {
    if (!sb || !sb.auth) return;
    try {
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) return;
      if (statusMsg) setAuthStatus(statusMsg, "neutral");
      const { error: gErr } = await sb.auth.signOut({ scope: "global" });
      if (gErr) {
        logSupabaseError("auth.signOut(global)", gErr, {});
        try {
          const { error: lErr } = await sb.auth.signOut({ scope: "local" });
          if (lErr) logSupabaseError("auth.signOut(local)", lErr, {});
        } catch (e) {
          logSupabaseError("auth.signOut(local) catch", e, {});
        }
        await sb.auth.signOut();
      }
      setCurrentSupabaseUser(null);
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      logSupabaseError("clearLocalAuthIfNeeded", e, {});
    }
  }

  function initAuthUi() {
    if (elAuthAccountBtn) {
      elAuthAccountBtn.addEventListener("click", () => {
        const w = typeof window !== "undefined" ? window : null;
        const u = w && typeof w.SUPABASE_URL === "string" ? w.SUPABASE_URL : "";
        if (u) console.info(SB_LOG, "Auth modal opened with project:", u);
        openAuthModal("login");
      });
    }
    if (elAuthRegisterTopBtn) {
      elAuthRegisterTopBtn.addEventListener("click", () => openAuthModal("register"));
    }
    if (elAuthLogoutTopBtn) {
      elAuthLogoutTopBtn.addEventListener("click", async () => {
        const sb = getSupabaseClient();
        if (!sb) return;
        try {
          await sb.auth.signOut();
          setCurrentSupabaseUser(null);
          showToast("Logged out.");
          scheduleRefreshGlobalLeaderboardList(0);
        } catch (e) {
          setAuthStatus(formatAuthError(e), "error");
        }
      });
    }
    if (elAuthModalCloseBtn) elAuthModalCloseBtn.addEventListener("click", () => closeAuthModal());
    if (elAuthBackdrop) elAuthBackdrop.addEventListener("click", () => closeAuthModal());
    if (elAuthTabLogin) elAuthTabLogin.addEventListener("click", () => openAuthModal("login"));
    if (elAuthTabRegister) elAuthTabRegister.addEventListener("click", () => openAuthModal("register"));

    const elAuthFullSignOutBtn = /** @type {HTMLButtonElement | null} */ ($("authFullSignOutBtn"));
    if (elAuthFullSignOutBtn) {
      elAuthFullSignOutBtn.addEventListener("click", async () => {
        const sb = getSupabaseClient();
        if (!sb) {
          setAuthStatus("Supabase is not configured.", "error");
          return;
        }
        elAuthFullSignOutBtn.disabled = true;
        hideAuthDiagnostics();
        setAuthStatus("Signing out everywhere…", "neutral");
        try {
          const { error: gErr } = await sb.auth.signOut({ scope: "global" });
          if (gErr) {
            logSupabaseError("auth.signOut(global) full btn", gErr, {});
            await sb.auth.signOut();
          }
        } catch (e) {
          logSupabaseError("auth.signOut full btn", e, {});
          try {
            await sb.auth.signOut();
          } catch (e2) {
            logSupabaseError("auth.signOut fallback", e2, {});
          }
        }
        setCurrentSupabaseUser(null);
        await new Promise((r) => setTimeout(r, 250));
        showToast("Signed out completely. Try email or guest below.", 3200);
        setAuthStatus("Signed out. You can use email, guest, or Discord again.", "success");
        scheduleRefreshGlobalLeaderboardList(0);
        elAuthFullSignOutBtn.disabled = false;
      });
    }

    const elAuthGuestBtn = /** @type {HTMLButtonElement | null} */ ($("authGuestBtn"));
    if (elAuthGuestBtn) {
      elAuthGuestBtn.addEventListener("click", () => closeAuthModal());
    }
    const elAuthGuestBtnRegister = /** @type {HTMLButtonElement | null} */ ($("authGuestBtnRegister"));
    if (elAuthGuestBtnRegister) {
      elAuthGuestBtnRegister.addEventListener("click", () => closeAuthModal());
    }

    const elAuthAnonBtn = /** @type {HTMLButtonElement | null} */ ($("authAnonBtn"));
    if (elAuthAnonBtn) {
      elAuthAnonBtn.addEventListener("click", async () => {
        if (checkAuthCooldownOrWarn("anon")) return;
        hideAuthDiagnostics();
        setAuthStatus("Signing in as guest…", "neutral");
        showToast("Guest sign-in…", 1200);
        elAuthAnonBtn.disabled = true;
        try {
          const sb = getSupabaseClient();
          if (!sb) {
            showAuthFailure("Supabase is not configured.", "auth.anon no client", null, {});
            return;
          }
          await clearLocalAuthIfNeeded(sb, "Clearing the current login so guest sign-in can start…");
          const auth = sb.auth;
          /** @type {{ user?: object, session?: object } | null} */
          let anonData = null;
          /** @type {unknown} */
          let anonErr = null;
          if (typeof auth.signInAnonymously === "function") {
            const r = await auth.signInAnonymously();
            anonData = r.data;
            anonErr = r.error;
          } else {
            anonErr = { message: "signInAnonymously not exposed on this client" };
          }
          if (anonErr || !anonData) {
            if (anonErr) logSupabaseError("auth.signInAnonymously", anonErr, {});
            const rest = await trySignInAnonymouslyViaRest(sb);
            anonData = rest.data;
            anonErr = rest.error;
          }
          if (anonErr) {
            logSupabaseError("auth.signInAnonymously (after REST fallback)", anonErr, {});
            applyAuthCooldownFromError(anonErr, "anon");
            showAuthFailure(
              formatAuthError(anonErr) + " Enable Anonymous in Supabase → Authentication → Providers.",
              "auth.signInAnonymously",
              anonErr,
              {}
            );
            return;
          }
          const userNow =
            (anonData && anonData.user) || (anonData && anonData.session && anonData.session.user) || null;
          if (!userNow || !userNow.id) {
            showAuthFailure(
              "Guest sign-in returned no user. Use “Sign out completely” then retry, or enable Anonymous in Supabase.",
              "auth.anon no user in response",
              anonErr,
              {}
            );
            return;
          }
          setAuthStatus("Saving your online profile…", "neutral");
          const verified = await syncAuthAfterInlineSignIn(sb, userNow);
          if (verified.error || !verified.user) {
            showAuthFailure(
              "Guest session started but finishing setup failed. Try “Sign out completely”, then guest again.",
              "auth.anon syncAuthAfterInlineSignIn",
              verified.error,
              { hadLocalUserId: userNow.id }
            );
            return;
          }
          closeAuthModal();
          showToast("Signed in as guest — global scores enabled.", 2600);
          scheduleRefreshGlobalLeaderboardList(0);
        } catch (e) {
          logSupabaseError("auth.signInAnonymously", e, {});
          showAuthFailure(formatAuthError(e), "auth.signInAnonymously catch", e, {});
        } finally {
          elAuthAnonBtn.disabled = false;
        }
      });
    }

    /**
     * @param {HTMLButtonElement | null} elBtn
     * @param {"google" | "discord"} provider
     * @param {string} label Human-readable provider name for UI copy
     */
    function wireOAuthProviderButton(elBtn, provider, label) {
      if (!elBtn) return;
      elBtn.addEventListener("click", async () => {
        if (checkAuthCooldownOrWarn("oauth")) return;
        hideAuthDiagnostics();
        const sb = getSupabaseClient();
        if (!sb) {
          showAuthFailure("Supabase is not configured.", `auth.oauth.${provider} no client`, null, {});
          return;
        }
        if (typeof sb.auth.signInWithOAuth !== "function") {
          showAuthFailure("OAuth sign-in is not available in this SDK build.", "auth.signInWithOAuth missing", null, {});
          return;
        }
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const path = typeof window !== "undefined" ? window.location.pathname || "/" : "/";
        const redirectTo = `${origin}${path}`;
        elBtn.disabled = true;
        setAuthStatus(`Opening ${label}…`, "neutral");
        showToast(`Redirecting to ${label}…`, 1500);
        try {
          const { data, error } = await sb.auth.signInWithOAuth({
            provider,
            options: { redirectTo, skipBrowserRedirect: false },
          });
          if (error) {
            logSupabaseError(`auth.signInWithOAuth(${provider})`, error, { redirectTo });
            applyAuthCooldownFromError(error, "oauth");
            showAuthFailure(
              formatAuthError(error) +
                ` Enable ${label} in Supabase → Authentication → Providers, and add this URL to Redirect URLs: ` +
                redirectTo,
              `auth.signInWithOAuth(${provider})`,
              error,
              { redirectTo }
            );
            return;
          }
          if (data && data.url) {
            window.location.assign(data.url);
            return;
          }
          showAuthFailure(
            `${label} sign-in did not return a redirect URL. Check Supabase provider settings.`,
            `auth.signInWithOAuth(${provider}) no url`,
            null,
            { redirectTo }
          );
        } catch (e) {
          logSupabaseError(`auth.signInWithOAuth(${provider})`, e, {});
          showAuthFailure(formatAuthError(e), `auth.signInWithOAuth(${provider}) catch`, e, {});
        } finally {
          elBtn.disabled = false;
        }
      });
    }

    wireOAuthProviderButton(/** @type {HTMLButtonElement | null} */ ($("authGoogleBtn")), "google", "Google");
    wireOAuthProviderButton(/** @type {HTMLButtonElement | null} */ ($("authDiscordBtn")), "discord", "Discord");

    const elAuthMagicLinkBtn = /** @type {HTMLButtonElement | null} */ ($("authMagicLinkBtn"));
    if (elAuthMagicLinkBtn) {
      elAuthMagicLinkBtn.addEventListener("click", async () => {
        if (checkAuthCooldownOrWarn("otp")) return;
        const email = String((elAuthLoginUser && elAuthLoginUser.value) || "").trim();
        if (!email) {
          setAuthStatus("Enter your email above for the magic link.", "error");
          return;
        }
        const sb = getSupabaseClient();
        if (!sb) {
          setAuthStatus("Supabase is not configured.", "error");
          return;
        }
        await clearLocalAuthIfNeeded(sb, "Clearing the current session before sending the magic link…");
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
        });
        if (error) {
          logSupabaseError("auth.signInWithOtp", error, { email });
          applyAuthCooldownFromError(error, "otp");
          setAuthStatus(formatAuthError(error), "error");
          return;
        }
        setAuthStatus("Check your email for the magic link, then return here.", "success");
      });
    }

    async function doLogin() {
      if (checkAuthCooldownOrWarn("cred")) return;
      const email = String((elAuthLoginUser && elAuthLoginUser.value) || "").trim();
      const p = elAuthLoginPass ? String(elAuthLoginPass.value || "") : "";
      if (!email || !p) {
        setAuthStatus("Enter email and password.", "error");
        return;
      }
      const sb = getSupabaseClient();
      if (!sb) {
        setAuthStatus("Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY in supabase-config.js.", "error");
        return;
      }
      if (elAuthLoginBtn) {
        elAuthLoginBtn.disabled = true;
        elAuthLoginBtn.textContent = "Signing in…";
      }
      setAuthStatus("Signing in…", "neutral");
      showToast("Signing in…", 1400);
      try {
        await clearLocalAuthIfNeeded(sb, "Signing out of the current account before email sign-in…");
        const { data, error } = await sb.auth.signInWithPassword({ email, password: p });
        if (error) {
          applyAuthCooldownFromError(error, "cred");
          setAuthStatus(formatAuthError(error), "error");
          return;
        }
        if (data.session) {
          const synced = await syncAuthAfterInlineSignIn(sb, data.session.user);
          if (synced.error || !synced.user) {
            showAuthFailure(
              "Signed in but we could not verify your session with Supabase. Try “Sign out completely” first.",
              "sync after signInWithPassword",
              synced.error,
              { email }
            );
            return;
          }
          const who = (currentSupabaseUser && currentSupabaseUser.email) || email;
          hideAuthDiagnostics();
          setAuthStatus(`Signed in as ${who}`, "success");
          closeAuthModal();
          showToast("Signed in — global leaderboard will sync.", 2400);
          scheduleRefreshGlobalLeaderboardList(0);
        } else {
          setAuthStatus("Could not start a session. Try again.", "error");
        }
      } catch (e) {
        setAuthStatus(formatAuthError(e), "error");
      } finally {
        if (elAuthLoginBtn) {
          elAuthLoginBtn.disabled = false;
          elAuthLoginBtn.textContent = "Sign in";
        }
      }
    }

    async function doRegister() {
      if (checkAuthCooldownOrWarn("cred")) return;
      const email = String((elAuthRegUser && elAuthRegUser.value) || "").trim();
      const p = elAuthRegPass ? String(elAuthRegPass.value || "") : "";
      if (!email || !p) {
        setAuthStatus("Enter email and password.", "error");
        return;
      }
      if (p.length < 6) {
        setAuthStatus("Password must be at least 6 characters.", "error");
        return;
      }
      const sb = getSupabaseClient();
      if (!sb) {
        setAuthStatus("Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY in supabase-config.js.", "error");
        return;
      }
      if (elAuthRegisterBtn) {
        elAuthRegisterBtn.disabled = true;
        elAuthRegisterBtn.textContent = "Creating…";
      }
      setAuthStatus("Creating account…", "neutral");
      showToast("Creating account…", 1400);
      try {
        await clearLocalAuthIfNeeded(sb, "Signing out of the current session before creating an account…");
        const { data, error } = await sb.auth.signUp({ email, password: p });
        if (error) {
          applyAuthCooldownFromError(error, "cred");
          setAuthStatus(formatAuthError(error), "error");
          return;
        }
        if (data.session) {
          const synced = await syncAuthAfterInlineSignIn(sb, data.session.user);
          if (synced.error || !synced.user) {
            showAuthFailure(
              "Account created but verifying the session failed. Try “Sign out completely” then sign up again.",
              "sync after signUp(session)",
              synced.error,
              { email }
            );
            return;
          }
          if (elAuthRegPass) elAuthRegPass.value = "";
          hideAuthDiagnostics();
          setAuthStatus("Account created.", "success");
          closeAuthModal();
          showToast("Registered — you’re signed in.", 2400);
          scheduleRefreshGlobalLeaderboardList(0);
        } else if (data.user) {
          const synced = await syncAuthAfterInlineSignIn(sb, data.user);
          if (synced.error || !synced.user) {
            showAuthFailure(
              "Registered but we could not load your account from the server yet.",
              "sync after signUp(user only)",
              synced.error,
              { email }
            );
            return;
          }
          if (elAuthRegPass) elAuthRegPass.value = "";
          hideAuthDiagnostics();
          setAuthStatus("Check your email to confirm your account (if required), then sign in.", "success");
        } else {
          setAuthStatus("Could not complete registration. Try again.", "error");
        }
      } catch (e) {
        setAuthStatus(formatAuthError(e), "error");
      } finally {
        if (elAuthRegisterBtn) {
          elAuthRegisterBtn.disabled = false;
          elAuthRegisterBtn.textContent = "Create account";
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

    const elAuthCopyDiagBtn = /** @type {HTMLButtonElement | null} */ ($("authCopyDiagBtn"));
    if (elAuthCopyDiagBtn) {
      elAuthCopyDiagBtn.addEventListener("click", async () => {
        if (!lastAuthDiagJson) {
          showToast("Nothing to copy yet.", 1200);
          return;
        }
        try {
          await navigator.clipboard.writeText(lastAuthDiagJson);
          showToast("Copied — paste that to the developer.", 2400);
        } catch {
          try {
            window.prompt("Copy this text:", lastAuthDiagJson);
          } catch {
            console.error(SB_LOG, "copy failed; raw diagnostic:", lastAuthDiagJson);
          }
        }
      });
    }
  }

  initAuthUi();

  if (elLbTestSupabaseBtn) {
    elLbTestSupabaseBtn.addEventListener("click", () => void runSupabaseLeaderboardSelfTest());
  }
  if (typeof window !== "undefined") {
    window.SSB_SUPABASE_TEST = runSupabaseLeaderboardSelfTest;
  }

  function getMultiplayerUrl() {
    const w = typeof window !== "undefined" ? window : null;
    const u = w && typeof w.SSB_MULTIPLAYER_URL === "string" ? w.SSB_MULTIPLAYER_URL.trim() : "";
    if (u) return u;
    if (w && w.location && w.location.origin) return w.location.origin;
    return "";
  }

  function mpDisplayName() {
    return activePlayer && activePlayer.name ? String(activePlayer.name).slice(0, 18) : "Player";
  }

  function mpEquippedAvatarForNet() {
    const id = getEquippedAvatarId();
    return id || null;
  }

  function syncMpHud() {
    if (!elMpHud || !elMpHudRound || !elMpHudRole || !elMpHudScore) return;
    if (!mpRoomId || !mpSocket || !mpSocket.connected) {
      elMpHud.classList.add("hidden");
      return;
    }
    elMpHud.classList.remove("hidden");
    if (mpMatch && mpMatch.active) elMpHudRound.textContent = `Room ${mpRoomId} · Round ${mpMatch.round}/${mpMatch.maxRounds}`;
    else elMpHudRound.textContent = "Room " + mpRoomId;
    elMpHudRole.textContent = mpIsSaboteur ? "Saboteur" : mpIsHost ? "Runner (Host)" : "Runner";
    const n = mpRemotePeers.size + 1;
    if (mpMatch && mpMatch.active && mpMySocketId) {
      const my = mpMatch.scores && typeof mpMatch.scores[mpMySocketId] === "number" ? mpMatch.scores[mpMySocketId] : 0;
      let opp = 0;
      for (const [id] of mpRemotePeers) {
        opp = mpMatch.scores && typeof mpMatch.scores[id] === "number" ? mpMatch.scores[id] : 0;
        break;
      }
      elMpHudScore.textContent = `Round score · You ${my} : ${opp} Opp`;
    } else {
      elMpHudScore.textContent = `${n} online · ghosts in Play`;
    }
  }

  function syncMpUi() {
    const on = !!(mpSocket && mpSocket.connected && mpRoomId);
    if (elMpStatusText) {
      if (!mpSocket) elMpStatusText.textContent = "Offline";
      else if (mpSocket.connected && mpRoomId) elMpStatusText.textContent = "Connected · " + mpRoomId;
      else if (mpSocket.connected) elMpStatusText.textContent = "Connecting…";
      else elMpStatusText.textContent = "Disconnected";
    }
    if (elMpLeaveBtn) elMpLeaveBtn.disabled = !on;
    if (elMpCopyRoomBtn) elMpCopyRoomBtn.disabled = !mpRoomId;
    if (elMpRoomCodeDisplay) elMpRoomCodeDisplay.textContent = mpRoomId || "—";
    if (elMpShareLevelBtn) elMpShareLevelBtn.disabled = !(on && mpIsHost);
    if (elMpStartMatchBtn) elMpStartMatchBtn.disabled = !(on && mpIsHost);
    if (elMpRandomBtn) elMpRandomBtn.textContent = mpRandomQueueing ? "Cancel random queue" : "Find random 1v1";
    if (elLocalMpStatusPill) {
      if (!localMpEnabled) elLocalMpStatusPill.textContent = "Local match: off";
      else
        elLocalMpStatusPill.textContent = `Round ${localMpRound}/${localMpMaxRounds} · ${localMpPlayers[localMpTurn]}'s turn · ${localMpPlayers[0]} ${localMpScore[0]} - ${localMpScore[1]} ${localMpPlayers[1]}`;
    }
    syncMpHud();
  }

  function appendMpChatLine(name, text) {
    if (!elMpChatLog) return;
    const row = document.createElement("div");
    row.className = "mpChatLine";
    const nm = document.createElement("span");
    nm.className = "mpChatName";
    nm.textContent = name + ":";
    row.appendChild(nm);
    row.appendChild(document.createTextNode(" " + text));
    elMpChatLog.appendChild(row);
    elMpChatLog.scrollTop = elMpChatLog.scrollHeight;
    while (elMpChatLog.children.length > 80) elMpChatLog.removeChild(elMpChatLog.firstChild);
  }

  function mpLeaveRoom() {
    mpRemotePeers.clear();
    mpRoomId = null;
    mpIsHost = false;
    mpSaboteurSocketId = null;
    mpIsSaboteur = false;
    mpMySocketId = null;
    mpMatch = { active: false, round: 0, maxRounds: 5, scores: {} };
    mpRandomQueueing = false;
    if (mpSocket) {
      mpSocket.removeAllListeners();
      mpSocket.disconnect();
      mpSocket = null;
    }
    syncMpUi();
  }

  function buildLevelSnapshotJson() {
    return JSON.stringify({ v: 2, cols: COLS, rows: ROWS, tilesFlat: flattenGrid(grid), texts: cloneLevelTexts() });
  }

  function applyMpMatchState(raw) {
    const next = raw && typeof raw === "object" ? raw : {};
    mpMatch = {
      active: !!next.active,
      round: Math.max(0, Number(next.round) | 0),
      maxRounds: Math.max(1, Number(next.maxRounds) | 0 || 5),
      scores: next.scores && typeof next.scores === "object" ? next.scores : {},
    };
    syncMpUi();
  }

  function buildRandomPreconfiguredLevelJson() {
    const pool = Array.isArray(BUILTIN_LEVELS)
      ? BUILTIN_LEVELS.filter((lvl) => lvl && lvl.tier !== "tutorial" && Array.isArray(lvl.tilesFlat))
      : [];
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return JSON.stringify({ v: 2, cols: COLS, rows: ROWS, tilesFlat: pick.tilesFlat, texts: {} });
  }

  function initMultiplayer() {
    const ioLib = typeof window !== "undefined" ? window.io : null;
    if (!elOpenMultiplayerBtn || !elMultiplayerModal) return;

    function bindSocketHandlers(sock) {
      sock.on("mp_random_matched", (ack) => {
        if (!ack || !ack.roomId) return;
        mpRoomId = String(ack.roomId);
        mpIsHost = !!ack.isHost;
        mpSaboteurSocketId = ack && ack.saboteurId ? String(ack.saboteurId) : null;
        mpIsSaboteur = !!(ack && ack.isSaboteur);
        mpRemotePeers.clear();
        if (Array.isArray(ack.peers)) {
          for (const p of ack.peers) {
            if (!p || !p.id) continue;
            mpRemotePeers.set(p.id, {
              x: 0,
              y: 0,
              vx: 0,
              name: String(p.name || "Player").slice(0, 18),
              avatarId: p.avatarId || null,
              seenMs: performance.now(),
            });
          }
        }
        mpRandomQueueing = false;
        applyMpMatchState(ack.match);
        showToast("Random 1v1 matched! Starting round 1.", 2200);
      });
      sock.on("mp_match_state", (state) => {
        applyMpMatchState(state);
      });
      sock.on("mp_match_end", (state) => {
        applyMpMatchState(state);
        showToast("5-round match finished.", 2600);
      });
      sock.on("mp_match_pick_final_level", () => {
        if (!mpIsHost || !mpSocket || !mpRoomId) return;
        const levelJson = buildRandomPreconfiguredLevelJson();
        if (!levelJson) return;
        mpSocket.emit("mp_level", { levelJson });
        showToast("Round 5: random preconfigured level loaded.", 2400);
      });
      sock.on("mp_peer_pos", (data) => {
        if (!data || data.id === mpMySocketId) return;
        const prev = mpRemotePeers.get(data.id);
        mpRemotePeers.set(data.id, {
          x: Number(data.x) || 0,
          y: Number(data.y) || 0,
          vx: Number(data.vx) || 0,
          name: prev && prev.name ? prev.name : "Player",
          avatarId: prev && prev.avatarId != null ? prev.avatarId : null,
          seenMs: performance.now(),
        });
      });
      sock.on("mp_peer_join", (data) => {
        if (!data || !data.id) return;
        mpRemotePeers.set(data.id, {
          x: 0,
          y: 0,
          vx: 0,
          name: String(data.name || "Player").slice(0, 18),
          avatarId: data.avatarId || null,
          seenMs: performance.now(),
        });
        {
          const av = avatarById(String(data.avatarId));
          if (av) void primeAvatarImageForShop(av);
        }
        syncMpHud();
      });
      sock.on("mp_peer_leave", (data) => {
        if (data && data.id) mpRemotePeers.delete(data.id);
        syncMpHud();
      });
      sock.on("mp_host_changed", (data) => {
        mpIsHost = !!(data && data.hostId && mpSocket && mpSocket.id === data.hostId);
        syncMpUi();
        showToast(mpIsHost ? "You are now the room host." : "New host assigned.", 2200);
      });
      sock.on("mp_roles", (data) => {
        mpSaboteurSocketId = data && data.saboteurId ? String(data.saboteurId) : null;
        mpIsSaboteur = !!(mpSocket && mpSaboteurSocketId && mpSocket.id === mpSaboteurSocketId);
        syncMpUi();
      });
      sock.on("mp_level", (data) => {
        if (data && typeof data.levelJson === "string" && data.levelJson) {
          importGridFromJsonText(data.levelJson, true);
          showToast("Level synced from host.", 2000);
        }
      });
      sock.on("mp_run", (payload) => {
        const seed = payload && typeof payload.seed === "number" ? payload.seed >>> 0 : 0;
        mpPendingForcedSeed = seed;
        if (mode === "play") doRestartPlayCore();
      });
      sock.on("mp_run_request", () => {
        if (!mpIsHost || !mpSocket) return;
        const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
        mpSocket.emit("mp_run", { seed });
      });
      sock.on("mp_chat", (data) => {
        if (!data || !data.text) return;
        appendMpChatLine(String(data.name || "?"), String(data.text));
      });
      sock.on("mp_sabotage_action", (data) => {
        if (!data || !data.kind) return;
        if (play && mode === "play") applySaboteurAction(play, String(data.kind));
      });
    }

    function ensureSocket() {
      if (mpSocket) return mpSocket;
      if (!ioLib || typeof ioLib !== "function") {
        showToast("Multiplayer needs the Socket.IO script (check index.html).", 3200);
        return null;
      }
      const url = getMultiplayerUrl();
      if (!url) {
        showToast("Could not resolve multiplayer server URL.", 2800);
        return null;
      }
      const s = ioLib(url, { transports: ["websocket", "polling"], reconnection: true, reconnectionDelay: 700 });
      mpSocket = s;
      s.on("connect", () => {
        mpMySocketId = s.id;
        syncMpUi();
      });
      s.on("connect_error", (err) => {
        const msg = err && err.message ? String(err.message) : "connection error";
        showToast("Multiplayer connect error: " + msg, 3600);
      });
      s.on("disconnect", () => {
        mpRemotePeers.clear();
        mpRoomId = null;
        mpIsHost = false;
        mpSaboteurSocketId = null;
        mpIsSaboteur = false;
        syncMpUi();
      });
      bindSocketHandlers(s);
      return s;
    }

    elOpenMultiplayerBtn.addEventListener("click", () => openModal(elMultiplayerModal));
    if (elCloseMultiplayerModalBtn) elCloseMultiplayerModalBtn.addEventListener("click", () => closeModal(elMultiplayerModal));

    if (elMpHostBtn) {
      elMpHostBtn.addEventListener("click", () => {
        const sock = ensureSocket();
        if (!sock) return;
        mpRandomQueueing = false;
        sock.emit(
          "mp_create",
          { name: mpDisplayName(), avatarId: mpEquippedAvatarForNet() },
          (ack) => {
            if (!ack || !ack.ok || !ack.roomId) {
              showToast("Could not create room.", 2200);
              return;
            }
            mpRoomId = ack.roomId;
            mpIsHost = true;
            mpSaboteurSocketId = null;
            mpIsSaboteur = false;
            if (ack && ack.match) applyMpMatchState(ack.match);
            syncMpUi();
            showToast("Room " + mpRoomId + " — share the code.", 2600);
          }
        );
      });
    }

    if (elMpRandomBtn) {
      elMpRandomBtn.addEventListener("click", () => {
        const sock = ensureSocket();
        if (!sock) return;
        if (mpRandomQueueing) {
          sock.emit("mp_random_cancel", {}, () => {
            mpRandomQueueing = false;
            syncMpUi();
            showToast("Random queue cancelled.", 1600);
          });
          return;
        }
        sock.emit("mp_random_find", { name: mpDisplayName(), avatarId: mpEquippedAvatarForNet() }, (ack) => {
          if (!ack || !ack.ok) {
            showToast("Could not start random queue.", 2200);
            return;
          }
          if (ack.waiting) {
            mpRandomQueueing = true;
            syncMpUi();
            showToast("Searching random 1v1 player...", 2200);
          }
        });
      });
    }

    if (elMpJoinBtn && elMpJoinInput) {
      // ADD 5: Spectator mode — create a "Watch" button next to Join.
      let elMpWatchBtn = document.getElementById("mpWatchBtn");
      if (!elMpWatchBtn && elMpJoinBtn) {
        elMpWatchBtn = document.createElement("button");
        elMpWatchBtn.id = "mpWatchBtn";
        elMpWatchBtn.textContent = "Watch";
        elMpWatchBtn.title = "Join as spectator — see ghost positions and chat, without playing.";
        elMpWatchBtn.className = elMpJoinBtn.className;
        elMpWatchBtn.style.cssText = "opacity:0.7;margin-left:4px;";
        elMpJoinBtn.after(elMpWatchBtn);
      }

      const doJoin = (spectate = false) => {
        const code = elMpJoinInput.value.trim().toUpperCase().slice(0, 6);
        if (!/^[A-F0-9]{6}$/i.test(code)) {
          showToast("Enter a 6-character room code.", 2000);
          return;
        }
        const sock = ensureSocket();
        if (!sock) return;
        sock.emit(
          "mp_join",
          { roomId: code, name: mpDisplayName(), avatarId: mpEquippedAvatarForNet(), role: spectate ? "spectator" : "player" },
          (ack) => {
            if (!ack || !ack.ok) {
              const err = ack && ack.error ? String(ack.error) : "";
              showToast(err === "not_found" ? "Room not found." : err === "full" ? "Room is full." : "Could not join.", 2400);
              return;
            }
            mpRoomId = code;
            mpIsHost = !!ack.isHost;
            mpSaboteurSocketId = ack && ack.saboteurId ? String(ack.saboteurId) : null;
            mpIsSaboteur = !!(ack && ack.isSaboteur);
            // ADD 5: Track spectator state — spectators receive ghost updates but don't play.
            window._mpIsSpectator = !!spectate;
            mpRemotePeers.clear();
            if (Array.isArray(ack.peers)) {
              for (const p of ack.peers) {
                if (!p || !p.id) continue;
                mpRemotePeers.set(p.id, {
                  x: 0, y: 0, vx: 0,
                  name: String(p.name || "Player").slice(0, 18),
                  avatarId: p.avatarId || null,
                  seenMs: performance.now(),
                });
                const av = avatarById(String(p.avatarId));
                if (av) void primeAvatarImageForShop(av);
              }
            }
            if (ack.levelJson && typeof ack.levelJson === "string" && ack.levelJson) {
              importGridFromJsonText(ack.levelJson, true);
              showToast("Loaded host level into editor.", 2200);
            }
            if (ack && ack.match) applyMpMatchState(ack.match);
            syncMpUi();
            showToast(spectate ? "Spectating room " + code + "." : "Joined room " + code + ".", 2000);
          }
        );
      };

      elMpJoinBtn.addEventListener("click", () => doJoin(false));
      elMpJoinInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doJoin(false);
      });
      if (elMpWatchBtn) {
        elMpWatchBtn.addEventListener("click", () => doJoin(true));
      }
    }

    if (elMpLeaveBtn) {
      elMpLeaveBtn.addEventListener("click", () => {
        if (mpSocket && mpRandomQueueing) {
          mpSocket.emit("mp_random_cancel", {});
          mpRandomQueueing = false;
        }
        mpLeaveRoom();
        showToast("Left multiplayer.", 1600);
      });
    }

    if (elMpStartMatchBtn) {
      elMpStartMatchBtn.addEventListener("click", () => {
        if (!mpSocket || !mpRoomId || !mpIsHost) return;
        mpSocket.emit("mp_match_start", {}, (ack) => {
          if (!ack || !ack.ok) {
            showToast("Could not start match.", 2200);
            return;
          }
          if (ack.match) applyMpMatchState(ack.match);
          showToast("5-round match started.", 2000);
        });
      });
    }

    if (elMpCopyRoomBtn) {
      elMpCopyRoomBtn.addEventListener("click", async () => {
        if (!mpRoomId) return;
        try {
          await navigator.clipboard.writeText(mpRoomId);
          showToast("Room code copied.", 1400);
        } catch {
          showToast(mpRoomId, 4000);
        }
      });
    }

    if (elMpShareLevelBtn) {
      elMpShareLevelBtn.addEventListener("click", () => {
        if (!mpSocket || !mpRoomId || !mpIsHost) return;
        const levelJson = buildLevelSnapshotJson();
        mpSocket.emit("mp_level", { levelJson });
        showToast("Level pushed to room.", 1800);
      });
    }

    function sendChat() {
      if (!elMpChatInput || !mpSocket || !mpRoomId) return;
      const t = elMpChatInput.value.trim().slice(0, 200);
      if (!t) return;
      mpSocket.emit("mp_chat", { text: t });
      appendMpChatLine("You", t);
      elMpChatInput.value = "";
    }

    if (elMpChatSendBtn) elMpChatSendBtn.addEventListener("click", () => sendChat());
    if (elMpChatInput) {
      elMpChatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat();
      });
    }

    if (elLocalMpStartBtn) {
      elLocalMpStartBtn.addEventListener("click", () => {
        const a = elLocalMpPlayerAInput && elLocalMpPlayerAInput.value ? elLocalMpPlayerAInput.value.trim() : "Player A";
        const b = elLocalMpPlayerBInput && elLocalMpPlayerBInput.value ? elLocalMpPlayerBInput.value.trim() : "Player B";
        localMpPlayers = [String(a || "Player A").slice(0, 18), String(b || "Player B").slice(0, 18)];
        localMpScore = [0, 0];
        localMpTurn = 0;
        localMpRound = 1;
        localMpEnabled = true;
        syncMpUi();
        showToast(`Local 1v1 started: round ${localMpRound}/${localMpMaxRounds}.`, 2400);
      });
    }
    if (elLocalMpStopBtn) {
      elLocalMpStopBtn.addEventListener("click", () => {
        localMpEnabled = false;
        localMpRound = 0;
        localMpScore = [0, 0];
        localMpTurn = 0;
        syncMpUi();
        showToast("Local 1v1 stopped.", 1600);
      });
    }

    syncMpUi();
  }

  function emitSaboteurAction(kind) {
    if (!mpSocket || !mpRoomId || !mpIsSaboteur) return;
    const now = performance.now();
    if (now < mpSabotageCooldownUntil) return;
    mpSocket.emit("mp_sabotage_action", { kind }, (ack) => {
      if (ack && ack.ok) mpSabotageCooldownUntil = performance.now() + 1800;
    });
  }

  function applySaboteurAction(state, kind) {
    if (!state || state.ended) return;
    if (kind === "invert") {
      state.effects.invertUntil = Math.max(state.effects.invertUntil, state.now + 2500);
      showToast("Saboteur: controls inverted!", 1500);
      return;
    }
    if (kind === "quake") {
      addShake(state, 16);
      state.player.vx += (Math.random() * 2 - 1) * 180;
      state.player.vy -= 120 + Math.random() * 100;
      showToast("Saboteur: quake!", 1200);
      return;
    }
    if (kind === "spikeBurst") {
      let changed = 0;
      const pgx = Math.floor(state.player.x / TILE);
      const pgy = Math.floor((state.player.y + state.player.h * 0.5) / TILE);
      for (let y = Math.max(0, pgy - 4); y <= Math.min(ROWS - 1, pgy + 4); y++) {
        for (let x = Math.max(0, pgx - 5); x <= Math.min(COLS - 1, pgx + 5); x++) {
          if (changed >= 8) break;
          const tile = state.tiles[y][x];
          if (!tile || tile.type === Tile.start || tile.type === Tile.goal || tile.type === Tile.checkpoint) continue;
          if (!(tile.type === Tile.platform || tile.type === Tile.mud || tile.type === Tile.betrayal)) continue;
          tile.type = Tile.spikes;
          tile.solid = false;
          tile.deadly = true;
          changed++;
        }
      }
      if (changed > 0) showToast("Saboteur: spike burst!", 1200);
    }
  }

  initMultiplayer();

  if (typeof window !== "undefined") {
    window.addEventListener("error", (ev) => {
      const msg = ev && ev.message ? String(ev.message) : "runtime error";
      void submitIssueReport({
        category: "runtime_error",
        details: `Runtime error: ${msg}`.slice(0, 500),
        technical: {
          source: "window.error",
          filename: ev && ev.filename ? String(ev.filename).slice(0, 240) : "",
          line: ev && typeof ev.lineno === "number" ? ev.lineno : 0,
          col: ev && typeof ev.colno === "number" ? ev.colno : 0,
        },
      });
      if (isAdminUser) showToast(`Error: ${msg}`, 2600);
      else showToast("Something went wrong. You can report this in Settings.", 2200);
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const reason = ev && ev.reason ? getSafeErrorText(ev.reason) : "promise rejection";
      void submitIssueReport({
        category: "runtime_error",
        details: `Unhandled rejection: ${reason}`.slice(0, 500),
        technical: { source: "unhandledrejection" },
      });
      if (isAdminUser) showToast(`Error: ${reason}`, 2600);
      else showToast("A background action failed. You can report this in Settings.", 2200);
    });
  }

  // ================================================================
  // PERFORMANCE PATCH
  // ================================================================

  // --- Debounced persist: never stringify+write localStorage mid-frame ---
  let _persistDirty = false;
  let _persistTimer = 0;
  function persist() {
    _persistDirty = true;
    if (_persistTimer) return;
    _persistTimer = setTimeout(() => {
      _persistTimer = 0;
      if (_persistDirty) {
        _persistDirty = false;
        localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      }
    }, 400);
  }

  // --- Gradient cache: reuse gradient objects keyed by canvas size + theme ---
  const _gradCache = new Map();
  function cachedLinearGradient(ctx2, key, x0, y0, x1, y1, stops) {
    const ckey = `${key}|${canvas.width}|${canvas.height}`;
    let g = _gradCache.get(ckey);
    if (!g) {
      g = ctx2.createLinearGradient(x0, y0, x1, y1);
      for (const [pos, col] of stops) g.addColorStop(pos, col);
      _gradCache.set(ckey, g);
      // Flush cache when it grows large (theme switch, resize, etc.)
      if (_gradCache.size > 40) _gradCache.clear();
    }
    return g;
  }

  // --- FPS counter state ---
  let _fpsFrameCount = 0;
  let _fpsSampleStart = performance.now();
  let _fpsDisplay = 0;     // last computed FPS shown in HUD
  let _fpsLow = false;     // true when FPS < 40 → adaptive quality kicks in
  let _fpsShowCounter = true;

  // --- Adaptive shadow quality: disabled when FPS drops below 40 ---
  // shadowBlur is the #1 GPU bottleneck in Canvas2D. We skip it when lagging.
  function shouldDrawShadows() {
    return !_fpsLow;
  }

  // ================================================================
  // END PERFORMANCE PATCH INFRASTRUCTURE
  // ================================================================

  let lastFrame = performance.now();
  function frame(now) {
    const dt = clamp(now - lastFrame, 4, 32);
    lastFrame = now;

    // --- FPS sampling (every 30 frames) ---
    _fpsFrameCount++;
    if (_fpsFrameCount >= 30) {
      const elapsed = now - _fpsSampleStart;
      _fpsDisplay = Math.round((_fpsFrameCount / elapsed) * 1000);
      _fpsLow = _fpsDisplay < 40;
      _fpsFrameCount = 0;
      _fpsSampleStart = now;
    }

    const docHidden = typeof document !== "undefined" && document.visibilityState === "hidden";

    // When tab is hidden: skip all work, reschedule, and reset lastFrame so
    // dt doesn't spike to thousands of ms when the user returns to the tab.
    if (docHidden) {
      lastFrame = now;
      requestAnimationFrame(frame);
      return;
    }

    // --- update (single requestAnimationFrame loop; dt-clamped) ---
    updateToast(now);
    updateLegendaryVibe(now);
    if (mode === "build") updateTimerPill(null);

    const activeTag = document.activeElement && /** @type {HTMLElement} */ (document.activeElement).tagName;
    const typingFocus =
      activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
    if (mode === "build" && !typingFocus) {
      const panPx = 520 * (dt / 1000);
      if (input.keyHeld("arrowleft")) buildCamX -= panPx;
      if (input.keyHeld("arrowright")) buildCamX += panPx;
      if (input.keyHeld("arrowup")) buildCamY -= panPx;
      if (input.keyHeld("arrowdown")) buildCamY += panPx;
      clampBuildCam();
      if (input.modCtrl && input.wasPressed("z")) {
        if (input.keyHeld("shift")) redoBuildStep();
        else undoBuildStep();
      }
      if (input.modCtrl && input.wasPressed("y")) redoBuildStep();
      if (input.modCtrl && input.wasPressed("c")) copyMarqueeToClipboard();
      if (input.modCtrl && input.wasPressed("v") && inBounds(pointer.gx, pointer.gy)) pasteClipboardAt(pointer.gx, pointer.gy);
      // ADD 6: R key cycles tile rotation (0→90→180→270→0°).
      if (input.wasPressed("r") && !input.modCtrl) {
        currentBrushRotation = (currentBrushRotation + 1) % 4;
        const labels = ["0°", "90°", "180°", "270°"];
        showToast(`Tile rotation: ${labels[currentBrushRotation]}`, 900);
      }
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
    if (input.wasPressed(keyForAction("toggleBuild")) && !elBuildBtn.disabled) setMode("build");
    if (input.wasPressed(keyForAction("togglePlay")) && !elPlayBtn.disabled) setMode("play");

    if (mode === "play") updatePlay(dt, now);

    // --- render ---
    render(now);

    input.tick();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Buttons + initial state ----------
  elRestartBtn.disabled = true;

  // Settings + theme
  applyTheme();
  // Enforce intensity lock UI even before auth hydration completes.
  syncIntensityLockUI();
  // Initialize shop UI (0 coins / locked) before Supabase hydration.
  syncShopUI();
  renderAvatarShop();
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => void primeEquippedAvatarOnly(), { timeout: 2500 });
  } else {
    window.setTimeout(() => void primeEquippedAvatarOnly(), 400);
  }
  buildKeybindUI();

  // Build palette + validate initial empty grid
  buildPalette();
  if (elCopyRegionBtn) elCopyRegionBtn.addEventListener("click", () => copyMarqueeToClipboard());
  if (elPasteRegionBtn) {
    elPasteRegionBtn.addEventListener("click", () => {
      if (inBounds(pointer.gx, pointer.gy)) pasteClipboardAt(pointer.gx, pointer.gy);
      else showToast("Move the cursor over the grid, then paste.");
    });
  }
  if (elAddTextBtn) {
    elAddTextBtn.addEventListener("click", () => {
      textPlacementMode = !textPlacementMode;
      elAddTextBtn.classList.toggle("primary", textPlacementMode);
      lastHoverForPlacement = { gx: -9999, gy: -9999, tile: -1 };
      showToast(textPlacementMode ? "Click a cell to add or edit a label." : "Label tool off.", 1800);
    });
  }
  flushBuildValidation();
  syncProfileUI();
  resetUndoStacksToCurrent();

  syncGlobalLbHint();
  void (async () => {
    const sb = getSupabaseClient();
    if (!sb) {
      setCurrentSupabaseUser(null);
      bootstrapMainApp();
      return;
    }
    let authStateDebounce = 0;
    sb.auth.onAuthStateChange((_event, session) => {
      window.clearTimeout(authStateDebounce);
      authStateDebounce = window.setTimeout(async () => {
        if (!session) {
          setCurrentSupabaseUser(null);
          scheduleRefreshGlobalLeaderboardList(0);
          return;
        }
        const synced = await syncAuthUserFromSupabase(sb);
        if (synced.error && !synced.user) {
          console.warn(SB_LOG, "onAuthStateChange sync failed", synced.error);
          setAuthStatus(
            "Online session issue: " + formatAuthError(synced.error) + " Open Account for details.",
            "error"
          );
        }
        scheduleRefreshGlobalLeaderboardList(220);
      }, 80);
    });
    const { data, error } = await sb.auth.getSession();
    if (error) {
      logSupabaseError("bootstrap getSession", error, {});
      setCurrentSupabaseUser(null);
      setAuthStatus(formatAuthError(error), "error");
      bootstrapMainApp();
      return;
    }
    if (data.session && data.session.user) {
      const bootUser = data.session.user;
      setCurrentSupabaseUser(bootUser);
      currentModerationBlock = await fetchMyModerationStatus(sb, bootUser.id);
      if (currentModerationBlock) {
        showToast("Account is blocked by admin.", 2600);
        await sb.auth.signOut();
        setCurrentSupabaseUser(null);
        bootstrapMainApp();
        return;
      }
      syncProfileUI();
      try {
        await ensureProfile(bootUser);
        await fetchLeaderboardScoreIntoState(sb, bootUser);
      } catch (e) {
        logSupabaseError("bootstrap profile + leaderboard hydrate", e, {});
      }
    } else {
      setCurrentSupabaseUser(null);
      syncProfileUI();
    }
    bootstrapMainApp();
  })();

  // (Modal button listeners are wired above; avoid duplicates here.)

})();

