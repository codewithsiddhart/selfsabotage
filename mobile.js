/*
 * Self-Sabotage Builder — Mobile UI shell
 * ---------------------------------------------------------------------------
 * This file owns presentation and touch interaction for the three mobile
 * screens (Home / Build / Play). It never reimplements game logic: every
 * action here either calls window.SSB (the bridge script.js exposes) or
 * clicks an existing desktop control to reuse its exact handler. Build/Play
 * chrome visibility is CSS-driven off classes the engine already toggles;
 * this file only owns Home's visibility and the content of all three screens.
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(init);

  function init() {
    if (!window.SSB) return; // engine failed to load; nothing to attach to
    const SSB = window.SSB;
    const $ = (id) => document.getElementById(id);
    const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

    const LAST_LEVEL_KEY = "SSB_lastBuiltinLevelIndex";
    const POWERUP_META = {
      doubleJump: { icon: "🦘", label: "Double Jump" },
      speedBoost: { icon: "⚡", label: "Speed Boost" },
      protection: { icon: "🛡️", label: "Protection" },
    };

    // ---------- element refs: mobile shell ----------
    const elDeviceMobileBtn = $("deviceMobileBtn");
    const elDeviceDesktopBtn = $("deviceDesktopBtn");

    const elHome = $("mobileHome");
    const elHomeProfileBtn = $("mHomeProfileBtn");
    const elHomeAvatar = $("mHomeAvatar");
    const elHomePlayerName = $("mHomePlayerName");
    const elHomeMoreBtn = $("mHomeMoreBtn");
    const elContinueCard = $("mContinueCard");
    const elContinueLabel = elContinueCard && elContinueCard.querySelector(".mobileContinueLabel");
    const elContinueLevelName = $("mContinueLevelName");
    const elContinueLevelMeta = $("mContinueLevelMeta");
    const elBuildCard = $("mBuildCard");
    const elMultiplayerCard = $("mMultiplayerCard");
    const elRandomCard = $("mRandomCard");
    const elLevelTabs = $("mLevelTabs");
    const elLevelCards = $("mLevelCards");
    const elPowerupRow = $("mPowerupRow");

    const elMoreSheet = $("mMoreSheet");
    const elMoreSheetBackdrop = $("mMoreSheetBackdrop");
    const elOpenMyLevels = $("mOpenMyLevels");
    const elOpenLeaderboard = $("mOpenLeaderboard");
    const elOpenSettings = $("mOpenSettings");
    const elSwitchDesktop = $("mSwitchDesktop");

    const elProfileSheet = $("mProfileSheet");
    const elProfileSheetBackdrop = $("mProfileSheetBackdrop");
    const elProfilePlayerList = $("mProfilePlayerList");
    const elNewPlayerInput = $("mNewPlayerInput");
    const elCreatePlayerBtn = $("mCreatePlayerBtn");

    const elBuildShell = $("mobileBuildShell");
    const elBuildHomeBtn = $("mBuildHomeBtn");
    const elValidationBadge = $("mValidationBadge");
    const elDifficultyBadge = $("mDifficultyBadge");
    const elBuildPlayBtn = $("mBuildPlayBtn");
    const elBadgeDetail = $("mBadgeDetail");
    const elBadgeDetailBudget = $("mBadgeDetailBudget");
    const elBadgeDetailValidation = $("mBadgeDetailValidation");
    const elUndoFab = $("mUndoFab");
    const elSaveFab = $("mSaveFab");
    const elClearFab = $("mClearFab");
    const elToolbar = $("mToolbar");

    const elPlayObjective = $("mPlayObjective");
    const elPlayerChip = $("mPlayerChip");
    const elPlayHud = $("mobilePlayHud");

    // ---------- element refs: existing desktop controls we reuse ----------
    const dBuildBtn = $("buildModeBtn");
    const dPlayBtn = $("playModeBtn");
    const dMultiplayerBtn = $("multiplayerBtn");
    const dRandomBtn = $("quickRandomBtn");
    const dSaveBtn = $("saveLevelBtn");
    const dClearBtn = $("clearBtn");
    const dOpenLevelsBtn = $("openLevelsBtn");
    const dOpenLeaderboardBtn = $("openLeaderboardBtn");
    const dOpenSettingsBtn = $("openSettingsBtn");
    const dValidationValue = $("validationValue");
    const dDifficultyValue = $("difficultyValue");
    const dBudgetPill = $("budgetPill");

    let homeOpen = false;
    let badgeDetailOpen = false;
    let clearArmed = false;
    let clearArmTimer = null;
    const cache = { validationText: null, difficultyText: null, canUndo: null, playerChip: null, objective: null };

    // =========================================================
    // Device-choice recommendation (proactive UX addition)
    // The device modal used to offer two neutral buttons with no signal about
    // which one fits the current device. That forces every player — including
    // ones on an obvious touchscreen phone — to stop and read two labels
    // before they can do anything. We detect touch/coarse-pointer capability
    // and highlight the likely-correct choice; the player still confirms by
    // tapping, so nothing is decided for them, it's just a faster default.
    // =========================================================
    function initDeviceRecommendation() {
      const likelyTouch =
        window.matchMedia && window.matchMedia("(pointer: coarse)").matches
          ? true
          : (navigator.maxTouchPoints || 0) > 0 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const target = likelyTouch ? elDeviceMobileBtn : elDeviceDesktopBtn;
      if (!target) return;
      target.classList.add("recommended");
      const tag = document.createElement("span");
      tag.className = "recommendedTag";
      tag.textContent = "Recommended for this device";
      target.appendChild(tag);
    }

    // =========================================================
    // HOME SCREEN
    // =========================================================
    function showHome() {
      homeOpen = true;
      elHome.classList.remove("hidden");
      elHome.setAttribute("aria-hidden", "false");
      renderHome();
    }
    function hideHome() {
      homeOpen = false;
      elHome.classList.add("hidden");
      elHome.setAttribute("aria-hidden", "true");
    }

    function renderHome() {
      renderProfileChip();
      renderContinueCard();
      renderLevelCards(getActiveTier());
      renderPowerupRow();
    }

    function renderProfileChip() {
      const p = SSB.getActivePlayer();
      if (p) {
        elHomeAvatar.textContent = p.name.trim().charAt(0).toUpperCase() || "?";
        elHomePlayerName.textContent = p.name;
      } else {
        elHomeAvatar.textContent = "?";
        elHomePlayerName.textContent = "Set up a player";
      }
    }

    function getContinueLevelIndex() {
      const levels = SSB.getBuiltinLevels();
      const stored = parseInt(localStorage.getItem(LAST_LEVEL_KEY), 10);
      if (Number.isInteger(stored) && stored >= 0 && stored < levels.length) return stored;
      return 0;
    }

    function renderContinueCard() {
      const levels = SSB.getBuiltinLevels();
      const hasHistory = localStorage.getItem(LAST_LEVEL_KEY) !== null;
      const idx = getContinueLevelIndex();
      const lvl = levels[idx];
      if (!lvl) {
        elContinueCard.classList.add("hidden");
        return;
      }
      elContinueCard.classList.remove("hidden");
      if (elContinueLabel) elContinueLabel.textContent = hasHistory ? "Continue Playing" : "Start Playing";
      elContinueLevelName.textContent = lvl.name;
      elContinueLevelMeta.textContent = `${capitalize(lvl.tier)} · Tap to jump back in`;
    }

    function getActiveTier() {
      const active = elLevelTabs.querySelector(".mobileLevelTab.active");
      return (active && active.dataset.tier) || "easy";
    }

    function renderLevelCards(tier) {
      const levels = SSB.getBuiltinLevels();
      const stats = SSB.getBuiltinLevelStats();
      elLevelCards.innerHTML = "";
      levels.forEach((lvl, index) => {
        if (lvl.tier !== tier) return;
        const card = document.createElement("button");
        card.type = "button";
        card.className = `mobileLevelCard tier-${lvl.tier}`;
        const best = stats[lvl.id] && Number.isFinite(stats[lvl.id].bestTimeMs) ? stats[lvl.id].bestTimeMs : null;
        card.innerHTML =
          `<div class="mLevelName">${escapeHtml(lvl.name)}</div>` +
          `<div class="mLevelMeta">${capitalize(lvl.tier)}</div>` +
          (best !== null ? `<div class="mLevelBest">Best ${(best / 1000).toFixed(1)}s</div>` : "");
        card.addEventListener("click", () => launchLevel(index));
        elLevelCards.appendChild(card);
      });
    }

    function renderPowerupRow() {
      const p = SSB.getActivePlayer();
      const pending = SSB.getPendingPowerups();
      const counts = (p && p.powerups) || { doubleJump: 0, speedBoost: 0, protection: 0 };
      elPowerupRow.innerHTML = "";
      Object.keys(POWERUP_META).forEach((key) => {
        const meta = POWERUP_META[key];
        const count = counts[key] || 0;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "mobilePowerupChip" + (pending[key] ? " active" : "");
        chip.disabled = count === 0;
        chip.innerHTML = `<span class="mPowerupIcon">${meta.icon}</span><span>${meta.label}</span><span>×${count}</span>`;
        chip.addEventListener("click", () => {
          if (!p || count === 0) return;
          SSB.togglePendingPowerup(key);
          renderPowerupRow();
        });
        elPowerupRow.appendChild(chip);
      });
    }

    function launchLevel(index) {
      localStorage.setItem(LAST_LEVEL_KEY, String(index));
      hideHome();
      SSB.launchBuiltinLevel(index);
    }

    function wireHome() {
      on(elHomeProfileBtn, "click", openProfileSheet);
      on(elHomeMoreBtn, "click", openMoreSheet);
      on(elContinueCard, "click", () => launchLevel(getContinueLevelIndex()));
      on(elBuildCard, "click", () => {
        hideHome();
        if (dBuildBtn) dBuildBtn.click();
      });
      on(elMultiplayerCard, "click", () => {
        hideHome();
        if (dMultiplayerBtn) dMultiplayerBtn.click();
      });
      on(elRandomCard, "click", () => {
        hideHome();
        if (dRandomBtn) dRandomBtn.click();
      });
      elLevelTabs.querySelectorAll(".mobileLevelTab").forEach((tab) => {
        tab.addEventListener("click", () => {
          elLevelTabs.querySelectorAll(".mobileLevelTab").forEach((t) => {
            t.classList.remove("active");
            t.setAttribute("aria-selected", "false");
          });
          tab.classList.add("active");
          tab.setAttribute("aria-selected", "true");
          renderLevelCards(tab.dataset.tier);
        });
      });
    }

    // =========================================================
    // SHEETS (More / Profile) — thin native-feeling bottom sheets that
    // mostly forward into existing desktop modals/buttons.
    // =========================================================
    function openSheet(sheetEl) {
      sheetEl.classList.remove("hidden");
      sheetEl.setAttribute("aria-hidden", "false");
    }
    function closeSheet(sheetEl) {
      sheetEl.classList.add("hidden");
      sheetEl.setAttribute("aria-hidden", "true");
    }

    function openMoreSheet() {
      openSheet(elMoreSheet);
    }
    function openProfileSheet() {
      renderProfileSheet();
      openSheet(elProfileSheet);
    }

    function renderProfileSheet() {
      const save = SSB.getSave();
      const active = SSB.getActivePlayer();
      elProfilePlayerList.innerHTML = "";
      const players = Object.values(save.players || {}).sort((a, b) => b.createdAt - a.createdAt);
      if (players.length === 0) {
        const empty = document.createElement("div");
        empty.className = "mobileSectionNote";
        empty.textContent = "No players yet — create one below.";
        elProfilePlayerList.appendChild(empty);
      }
      players.forEach((p) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "mobilePlayerRow" + (active && active.id === p.id ? " active" : "");
        row.innerHTML = `<span>${escapeHtml(p.name)}</span>` + (active && active.id === p.id ? "<span>✓</span>" : "");
        row.addEventListener("click", () => {
          SSB.setActivePlayer(p.id);
          closeSheet(elProfileSheet);
          renderHome();
        });
        elProfilePlayerList.appendChild(row);
      });
    }

    function wireSheets() {
      on(elMoreSheetBackdrop, "click", () => closeSheet(elMoreSheet));
      on(elProfileSheetBackdrop, "click", () => closeSheet(elProfileSheet));

      on(elOpenMyLevels, "click", () => {
        closeSheet(elMoreSheet);
        if (dOpenLevelsBtn) dOpenLevelsBtn.click();
      });
      on(elOpenLeaderboard, "click", () => {
        closeSheet(elMoreSheet);
        if (dOpenLeaderboardBtn) dOpenLeaderboardBtn.click();
      });
      on(elOpenSettings, "click", () => {
        closeSheet(elMoreSheet);
        if (dOpenSettingsBtn) dOpenSettingsBtn.click();
      });
      on(elSwitchDesktop, "click", () => {
        closeSheet(elMoreSheet);
        hideHome();
        SSB.setDeviceMode("desktop");
      });

      on(elCreatePlayerBtn, "click", () => {
        const name = (elNewPlayerInput.value || "").trim();
        if (!name) return;
        const p = SSB.createPlayer(name);
        if (p) {
          SSB.setActivePlayer(p.id);
          elNewPlayerInput.value = "";
          closeSheet(elProfileSheet);
          renderHome();
        }
      });
      on(elNewPlayerInput, "keydown", (e) => {
        if (e.key === "Enter") elCreatePlayerBtn.click();
      });
    }

    // =========================================================
    // BUILD MODE
    // =========================================================
    function buildToolbar() {
      elToolbar.innerHTML = "";
      SSB.paletteOrder.forEach((t) => {
        const info = SSB.TileInfo[t];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mToolBtn";
        btn.dataset.tile = t;
        btn.innerHTML = `<span>${SSB.TilePaletteIcon[t] || ""}</span><span class="mToolLabel">${info.name}</span>`;
        btn.addEventListener("click", () => {
          SSB.selectTile(t);
          syncToolbarSelection();
        });
        elToolbar.appendChild(btn);
      });
      syncToolbarSelection();
    }
    function syncToolbarSelection() {
      const selected = SSB.getSelectedTile();
      elToolbar.querySelectorAll(".mToolBtn").forEach((btn) => {
        btn.classList.toggle("selected", btn.dataset.tile === selected);
      });
    }

    function armClear() {
      if (clearArmTimer) clearTimeout(clearArmTimer);
      if (!clearArmed) {
        clearArmed = true;
        elClearFab.classList.add("confirmArm");
        clearArmTimer = setTimeout(() => {
          clearArmed = false;
          elClearFab.classList.remove("confirmArm");
        }, 2600);
        return;
      }
      clearArmed = false;
      elClearFab.classList.remove("confirmArm");
      if (dClearBtn) dClearBtn.click();
    }

    function wireBuild() {
      buildToolbar();
      on(elBuildHomeBtn, "click", showHome);
      on(elBuildPlayBtn, "click", () => {
        if (dPlayBtn) dPlayBtn.click();
      });
      on(elUndoFab, "click", () => {
        SSB.undo();
        syncToolbarSelection();
      });
      on(elSaveFab, "click", () => {
        badgeDetailOpen = false;
        elBadgeDetail.classList.add("hidden");
        if (dSaveBtn) dSaveBtn.click();
      });
      on(elClearFab, "click", armClear);
      on(elValidationBadge, "click", toggleBadgeDetail);
      on(elDifficultyBadge, "click", toggleBadgeDetail);
    }

    function toggleBadgeDetail() {
      badgeDetailOpen = !badgeDetailOpen;
      elBadgeDetail.classList.toggle("hidden", !badgeDetailOpen);
      if (badgeDetailOpen) syncBadgeDetail();
    }
    function syncBadgeDetail() {
      if (dBudgetPill) elBadgeDetailBudget.textContent = dBudgetPill.textContent;
      if (dValidationValue) elBadgeDetailValidation.textContent = dValidationValue.textContent;
    }

    // =========================================================
    // PLAY MODE — mirror a couple of read-only bits into the minimal HUD
    // =========================================================
    function syncPlayHud() {
      const play = SSB.getPlay();
      const levels = SSB.getBuiltinLevels();
      let objective = "🎯 Reach the Goal";
      if (play && play.sourceLevelId) {
        const lvl = levels.find((l) => l.id === play.sourceLevelId);
        if (lvl) objective = `🎯 ${lvl.name}`;
      }
      if (objective !== cache.objective) {
        cache.objective = objective;
        elPlayObjective.textContent = objective;
      }
      const p = SSB.getActivePlayer();
      const chipText = p ? p.name : "—";
      if (chipText !== cache.playerChip) {
        cache.playerChip = chipText;
        elPlayerChip.textContent = chipText;
      }
    }

    // =========================================================
    // Per-frame sync hook (called from script.js's main loop). Kept cheap:
    // only touches the DOM when a cached value actually changed.
    // =========================================================
    function sync() {
      if (SSB.getDeviceMode() !== "mobile") {
        if (homeOpen) hideHome();
        elBuildShell.classList.remove("mVisible");
        elPlayHud.classList.remove("mVisible");
        return;
      }
      const mode = SSB.getMode();

      if (mode === "play" && homeOpen) hideHome(); // safety net

      elBuildShell.classList.toggle("mVisible", mode === "build" && !homeOpen);
      elPlayHud.classList.toggle("mVisible", mode === "play" && !homeOpen);

      if (mode === "build") {
        if (dValidationValue) {
          const text = dValidationValue.textContent;
          if (text !== cache.validationText) {
            cache.validationText = text;
            elValidationBadge.textContent = text;
            elValidationBadge.classList.toggle("ok", dValidationValue.classList.contains("ok"));
            elValidationBadge.classList.toggle("warn", dValidationValue.classList.contains("warn"));
          }
        }
        if (dDifficultyValue) {
          const text = dDifficultyValue.textContent;
          if (text !== cache.difficultyText) {
            cache.difficultyText = text;
            elDifficultyBadge.textContent = text;
            elDifficultyBadge.classList.remove("tier-medium", "tier-hard");
            if (dDifficultyValue.className.includes("medium")) elDifficultyBadge.classList.add("tier-medium");
            if (dDifficultyValue.className.includes("hard")) elDifficultyBadge.classList.add("tier-hard");
          }
        }
        if (badgeDetailOpen) syncBadgeDetail();
        const canUndo = SSB.canUndo();
        if (canUndo !== cache.canUndo) {
          cache.canUndo = canUndo;
          elUndoFab.disabled = !canUndo;
        }
      } else if (mode === "play") {
        syncPlayHud();
      }
    }

    // =========================================================
    // Utilities
    // =========================================================
    function capitalize(s) {
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }
    function escapeHtml(s) {
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }

    // ---------- boot ----------
    initDeviceRecommendation();
    wireHome();
    wireSheets();
    wireBuild();

    window.MobileUI = { showHome, sync };

    // script.js's own boot sequence runs before this file's <script> tag executes, so if the
    // player was already in mobile mode from a previous visit, catch up here.
    if (SSB.getDeviceMode() === "mobile") showHome();
  }
})();
