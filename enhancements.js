(() => {
  "use strict";

  function waitFor(fn, interval = 60, maxTries = 120) {
    return new Promise((resolve) => {
      let tries = 0;
      const id = setInterval(() => {
        const result = fn();
        if (result || ++tries > maxTries) { clearInterval(id); resolve(result); }
      }, interval);
    });
  }

  const $ = (id) => document.getElementById(id);

  function st(msg, ms = 1500) {
    if (window.__ssb_showToast) window.__ssb_showToast(msg, ms);
  }

  // ── 1. FIX: Player profile chip shows name immediately on boot ──────────────
  function patchBootPlayerName() {
    const chip = $("activePlayerName");
    if (!chip) return;
    if (chip.textContent && chip.textContent !== "—") return;
    try {
      const raw = localStorage.getItem("SSB_SAVE_V2");
      if (!raw) return;
      const save = JSON.parse(raw);
      if (!save || !save.activePlayerId) return;
      const player = save.players && save.players[save.activePlayerId];
      if (player && player.name) chip.textContent = player.name;
    } catch { }
  }
  patchBootPlayerName();

  // ── 2. FIX: End overlay always centered ─────────────────────────────────────
  function fixEndOverlayCentering() {
    const style = document.createElement("style");
    style.textContent = `
      .endOverlay {
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 60 !important;
        pointer-events: auto !important;
      }
      .endOverlay.hidden { display: none !important; }
      .endOverlayContent {
        background: rgba(8, 10, 22, 0.97) !important;
        border: 1px solid rgba(122,167,255,0.18) !important;
        border-radius: 18px !important;
        padding: 32px 36px !important;
        text-align: center !important;
        max-width: 480px !important;
        width: 90% !important;
        box-shadow: 0 8px 48px rgba(0,0,0,0.7) !important;
      }
      .endOverlay::before {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: -1;
        pointer-events: all;
      }
    `;
    document.head.appendChild(style);
  }
  fixEndOverlayCentering();

  // ── 3. FIX: End overlay has proper backdrop blocker ─────────────────────────
  function fixEndOverlayBackdrop() {
    const overlay = $("endOverlay");
    if (!overlay) return;
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) e.stopPropagation();
    }, true);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) e.stopPropagation();
    }, true);
  }
  fixEndOverlayBackdrop();

  // ── 4. FIX: Budget pill replaced with collapsible tile counter grid ──────────
  function patchBudgetPill() {
    const pill = $("budgetPill");
    if (!pill) return;
    const LIMITS = {
      platform: 160, spikes: 70, jumppad: 40, hex: 18, lava: 24,
      speedBoost: 18, food: 12, pathBlock: 60, checkpoint: 1,
      mud: 10, betrayal: 16, pressureSwitch: 10, timedDoor: 8
    };
    const COLORS = {
      platform: "#4f67ff", spikes: "#ff4d6d", jumppad: "#2dd4bf",
      hex: "#a78bfa", lava: "#ea580c", speedBoost: "#22c55e",
      food: "#fb923c", checkpoint: "#38bdf8", mud: "#8c523a",
      betrayal: "#f6ad55", pressureSwitch: "#fb7185", timedDoor: "#2dd4bf",
      pathBlock: "rgba(150,200,255,0.6)"
    };
    const LABELS = {
      platform: "Platforms", spikes: "Spikes", jumppad: "Jump Pads",
      hex: "Hex", lava: "Lava", speedBoost: "Speed", food: "Food",
      checkpoint: "Checkpoint", mud: "Mud", betrayal: "Betrayal",
      pressureSwitch: "Switch", timedDoor: "Door", pathBlock: "Path"
    };

    const wrap = document.createElement("div");
    wrap.id = "budgetGridWrap";
    wrap.style.cssText = `
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 3px;
      width: 100%;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;";
    header.innerHTML = `
      <span style="font-size:11px;font-weight:800;color:rgba(200,215,255,0.7);text-transform:uppercase;letter-spacing:.8px;">Tile Budget</span>
      <span id="budgetToggleArrow" style="font-size:11px;opacity:0.5;">▼</span>
    `;

    const grid = document.createElement("div");
    grid.id = "budgetGridBody";
    grid.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin-top: 4px;
    `;

    let collapsed = false;
    header.addEventListener("click", () => {
      collapsed = !collapsed;
      grid.style.display = collapsed ? "none" : "grid";
      const arrow = $("budgetToggleArrow");
      if (arrow) arrow.textContent = collapsed ? "▶" : "▼";
    });

    wrap.appendChild(header);
    wrap.appendChild(grid);
    pill.replaceWith(wrap);
    wrap.id = "budgetPill";

    function updateBudgetGrid() {
      const g = window.__ssb_getGrid ? window.__ssb_getGrid() : null;
      if (!g) return;
      const counts = {};
      const COLS = window.__ssb_getCOLS ? window.__ssb_getCOLS() : 64;
      const ROWS = window.__ssb_getROWS ? window.__ssb_getROWS() : 36;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = g[y] && g[y][x];
          if (t && t !== "empty") counts[t] = (counts[t] || 0) + 1;
        }
      }

      grid.innerHTML = "";
      let hasAny = false;
      for (const [key, limit] of Object.entries(LIMITS)) {
        const count = counts[key] || 0;
        if (count === 0) continue;
        hasAny = true;
        const pct = Math.min(1, count / limit);
        const color = COLORS[key] || "#7aa7ff";
        const warn = pct > 0.85;
        const over = count >= limit;

        const row = document.createElement("div");
        row.style.cssText = "display:flex;flex-direction:column;gap:2px;";
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:${over ? "#ff4d6d" : warn ? "#facc15" : "rgba(200,215,255,0.75)"};">
            <span>${LABELS[key] || key}</span>
            <span>${count}/${limit}</span>
          </div>
          <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.08);overflow:hidden;">
            <div style="height:100%;width:${Math.round(pct * 100)}%;background:${over ? "#ff4d6d" : warn ? "#facc15" : color};border-radius:2px;transition:width .2s;"></div>
          </div>
        `;
        grid.appendChild(row);
      }
      if (!hasAny) {
        grid.innerHTML = `<span style="font-size:11px;opacity:0.4;grid-column:span 2;">No tiles placed</span>`;
      }
    }

    // PERF OPT: Replace polling setInterval(400ms) with event-driven updates.
    // Listen for tile-change custom events dispatched by script.js, plus do one initial render.
    // Falls back to a single 2s interval as safety net for edge cases.
    window.addEventListener("ssb:tileChanged", updateBudgetGrid);
    window.addEventListener("ssb:gridLoaded", updateBudgetGrid);
    // Lightweight safety-net poll (2s instead of 400ms) in case events are missed.
    setInterval(updateBudgetGrid, 2000);
    updateBudgetGrid();
  }

  // ── 5. FIX: Play button shakes + scrolls to validation when blocked ──────────
  function patchPlayButtonFeedback() {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes playBtnShake {
        0%,100%{transform:translateX(0);}
        15%{transform:translateX(-5px);}
        30%{transform:translateX(5px);}
        45%{transform:translateX(-4px);}
        60%{transform:translateX(4px);}
        75%{transform:translateX(-2px);}
        90%{transform:translateX(2px);}
      }
      .playBtnShaking { animation: playBtnShake 0.45s ease !important; }
      .validationFlash { animation: validationPulse 0.6s ease !important; }
      @keyframes validationPulse {
        0%,100%{background:transparent;}
        30%,70%{background:rgba(255,77,109,0.18);}
      }
    `;
    document.head.appendChild(style);

    const playBtn = $("playModeBtn");
    const validEl = $("validationValue");
    if (!playBtn || !validEl) return;

    const origClick = playBtn.onclick;
    playBtn.addEventListener("click", () => {
      const pill = $("budgetPill");
      const v = validEl.textContent;
      if (validEl.classList.contains("warn") && v && v !== "Ready") {
        playBtn.classList.remove("playBtnShaking");
        void playBtn.offsetWidth;
        playBtn.classList.add("playBtnShaking");
        playBtn.addEventListener("animationend", () => playBtn.classList.remove("playBtnShaking"), { once: true });

        validEl.classList.remove("validationFlash");
        void validEl.offsetWidth;
        validEl.classList.add("validationFlash");
        validEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, true);
  }

  // ── 6. FIX: Tooltip on palette items showing sabotage spoiler ───────────────
  function patchPaletteTooltips() {
    const TIPS = {
      start: "Spawn point — required. One per level.",
      goal: "Touch to win — required.",
      checkpoint: "Required. One revive per run on first touch.",
      platform: "Solid ground. May crumble, shift, or vanish mid-run.",
      spikes: "Lethal on contact. May activate early or late.",
      jumppad: "Launches you up. May misfire, weaken, or delay.",
      hex: "Curses your controls or becomes lethal after a delay.",
      lava: "Instant death — no exceptions.",
      speedBoost: "Temporary speed boost. Reliable, but fast can kill.",
      food: "Restores stability and counters control inversions.",
      mud: "5× slower movement and jump. Can shift like platforms.",
      betrayal: "Starts safe. Mutates into a hazard mid-run.",
      pressureSwitch: "Teleports you to a linked destination on contact.",
      timedDoor: "Warp door with cooldown. Set its destination after placing.",
      empty: "Erase tool — removes tiles.",
    };

    const tip = document.createElement("div");
    tip.style.cssText = `
      position:fixed;z-index:9999;pointer-events:none;
      background:rgba(8,10,22,0.97);border:1px solid rgba(122,167,255,0.25);
      border-radius:10px;padding:8px 12px;font-size:11.5px;
      color:rgba(210,220,255,0.9);max-width:220px;line-height:1.45;
      box-shadow:0 4px 18px rgba(0,0,0,0.6);
      opacity:0;transition:opacity .15s;
    `;
    document.body.appendChild(tip);

    function attach() {
      document.querySelectorAll(".tileBtn[data-tile]").forEach((btn) => {
        if (btn.dataset.tipBound) return;
        btn.dataset.tipBound = "1";
        btn.addEventListener("mouseenter", (e) => {
          const type = btn.dataset.tile;
          const txt = TIPS[type];
          if (!txt) return;
          const name = btn.querySelector(".label")?.childNodes[0]?.textContent?.trim() || type;
          tip.innerHTML = `<strong style="display:block;margin-bottom:3px;">${name}</strong>${txt}`;
          const r = btn.getBoundingClientRect();
          let left = r.right + 10;
          if (left + 230 > window.innerWidth) left = r.left - 230;
          tip.style.left = Math.max(4, left) + "px";
          tip.style.top = (r.top + r.height / 2 - 30) + "px";
          tip.style.opacity = "1";
        });
        btn.addEventListener("mouseleave", () => { tip.style.opacity = "0"; });
      });
    }
    attach();
    setInterval(attach, 1500);
  }

  // ── 7. FIX: Customization modal has proper open/close button ────────────────
  function patchCustomizationButton() {
    const style = document.createElement("style");
    style.textContent = `
      .cosmeticsToggleBar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(122,167,255,0.08);
        border: 1px solid rgba(122,167,255,0.18);
        border-radius: 10px;
        padding: 10px 14px;
        margin-bottom: 10px;
        cursor: pointer;
        user-select: none;
        transition: background .15s;
      }
      .cosmeticsToggleBar:hover { background: rgba(122,167,255,0.14); }
      .cosmeticsToggleBar .cosmeticsToggleLabel {
        font-weight: 800;
        font-size: 13px;
        color: rgba(200,215,255,0.9);
      }
      .cosmeticsToggleBar .cosmeticsToggleArrow {
        font-size: 12px;
        opacity: 0.6;
        transition: transform .2s;
      }
      .cosmeticsToggleBar.open .cosmeticsToggleArrow {
        transform: rotate(180deg);
      }
      #cosmeticsQuickPanel {
        display: none;
        background: rgba(8,10,22,0.6);
        border: 1px solid rgba(122,167,255,0.12);
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 10px;
      }
      #cosmeticsQuickPanel.open { display: block; }
    `;
    document.head.appendChild(style);

    const rightSidebar = $("rightSidebar");
    if (!rightSidebar) return;

    const openBtn = $("openCustomizationWindowBtn");
    if (!openBtn) return;

    const card = openBtn.closest(".card");
    if (!card) return;

    const bar = document.createElement("div");
    bar.className = "cosmeticsToggleBar";
    bar.innerHTML = `
      <span class="cosmeticsToggleLabel">🎨 Customization</span>
      <span class="cosmeticsToggleArrow">▼</span>
    `;

    const panel = document.createElement("div");
    panel.id = "cosmeticsQuickPanel";
    panel.innerHTML = `
      <div style="font-size:12px;color:rgba(180,190,220,0.8);margin-bottom:10px;">Quick access to character skins and avatar selection.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="cosmeticsOpenFullBtn" class="btn primary" type="button">Open Full Customization</button>
        <button id="cosmeticsRandomEquipQuick" class="btn subtle" type="button">Random skin</button>
      </div>
    `;

    bar.addEventListener("click", () => {
      const open = panel.classList.toggle("open");
      bar.classList.toggle("open", open);
    });

    card.parentNode.insertBefore(bar, card);
    card.parentNode.insertBefore(panel, card);
    card.style.display = "none";

    const fullBtn = $("cosmeticsOpenFullBtn");
    if (fullBtn) {
      fullBtn.addEventListener("click", () => {
        const modal = $("customizationModal");
        const backdrop = $("modalBackdrop");
        if (modal) { modal.classList.remove("hidden"); }
        if (backdrop) { backdrop.classList.remove("hidden"); backdrop.setAttribute("aria-hidden", "false"); }
        if (window.__ssb_showToast) window.__ssb_showToast("Customization opened.", 1000);
        setTimeout(() => {
          const shopList = $("avatarShopList");
          if (shopList && shopList.children.length === 0) {
            const event = new MouseEvent("click", { bubbles: true });
            const origBtn = $("openCustomizationWindowBtn");
            if (origBtn) origBtn.dispatchEvent(event);
          }
        }, 100);
      });
    }

    const randBtn = $("cosmeticsRandomEquipQuick");
    if (randBtn) {
      randBtn.addEventListener("click", () => {
        const origRand = $("avatarRandomEquipBtn");
        if (origRand) origRand.click();
        else st("Open Full Customization to equip a skin.", 1800);
      });
    }
  }

  // ── 8. FIX: Single "Built-in Levels" button replaces two separate ones ───────
  function patchBuiltinLevelsButton() {
    const quickLevelsBtn = $("quickLevelsBtn");
    if (!quickLevelsBtn) return;
    quickLevelsBtn.textContent = "🎮 Built-in Levels";
    quickLevelsBtn.title = "Play preconfigured built-in levels (Easy, Medium, Hard, Tutorial, Daily)";
    quickLevelsBtn.style.fontWeight = "800";

    const openLevelsBtn = $("openLevelsBtn");
    if (openLevelsBtn) openLevelsBtn.style.display = "none";
  }

  // ── 9. FIX: Tutorial button in start screen ─────────────────────────────────
  function patchTutorialButton() {
    const modal = $("startModal");
    if (!modal) return;

    const existingOffer = $("tutorialOfferCard");

    const tutCard = document.createElement("div");
    tutCard.className = "card";
    tutCard.style.cssText = "border:2px solid rgba(45,212,191,0.3);margin-bottom:12px;";
    tutCard.innerHTML = `
      <div class="cardTitle" style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:20px;">🎓</span>
        <span>Tutorial</span>
      </div>
      <div class="helpText" style="margin-bottom:8px;">
        <strong>How to Play Self-Sabotage Builder:</strong><br>
        You build a level, then play it — but the tiles you placed secretly activate sabotage behaviors you didn't choose.
        Platforms may crumble. Spikes activate late. Jump pads misfire. Controls get inverted.
        Place <strong>Start</strong>, <strong>Goal</strong>, and exactly one <strong>Checkpoint</strong> to make a valid level.
        <br><br>
        <strong>The goal:</strong> survive your own traps and reach the Goal tile.
        <br><br>
        Five tutorial levels introduce each tile type with gentle sabotage so you can learn safely.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button id="tutorialMainBtn" class="btn primary" type="button">▶ Start Tutorial</button>
        <button id="tutorialWatchBtn" class="btn subtle" type="button">📖 How to Play</button>
      </div>
    `;

    const levelPickCard = $("startModalLevelPickCard");
    if (levelPickCard) {
      levelPickCard.parentNode.insertBefore(tutCard, levelPickCard);
    } else {
      const body = modal.querySelector(".modalBody");
      if (body) body.insertBefore(tutCard, body.firstChild);
    }

    const mainBtn = $("tutorialMainBtn");
    if (mainBtn) {
      mainBtn.addEventListener("click", () => {
        const origBtn = $("tutorialStartBtn");
        if (origBtn) origBtn.click();
        else st("Tutorial starting...", 1200);
      });
    }

    const watchBtn = $("tutorialWatchBtn");
    if (watchBtn) {
      watchBtn.addEventListener("click", () => {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
          position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          padding:20px;
        `;
        overlay.innerHTML = `
          <div style="max-width:560px;width:100%;background:rgba(8,10,22,0.99);border:1px solid rgba(122,167,255,0.2);border-radius:18px;padding:28px 28px 24px;position:relative;">
            <button style="position:absolute;top:14px;right:16px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:20px;cursor:pointer;" onclick="this.closest('[style]').remove()">✕</button>
            <h2 style="margin:0 0 12px;font-size:22px;color:#7aa7ff;">How to Play</h2>
            <div style="font-size:13.5px;line-height:1.7;color:rgba(210,220,255,0.88);">
              <p><strong>1. Build a level</strong> — use the tile palette on the left. You must place a <strong>Start</strong>, a <strong>Goal</strong>, and exactly one <strong>Checkpoint</strong>.</p>
              <p><strong>2. Click Play</strong> — your level activates hidden sabotage. Every tile behaves differently each run (seeded, not random mid-run).</p>
              <p><strong>3. Survive your own traps</strong> — platforms may crumble, spikes activate late, jump pads misfire. Reach the Goal to win.</p>
              <p><strong>4. Checkpoint = one revive</strong> — touch it first in play mode. Your next lethal hit sends you back there. The hit after that ends the run.</p>
              <hr style="border-color:rgba(122,167,255,0.12);margin:14px 0;">
              <p><strong>Tile behaviors (revealed in play):</strong></p>
              <ul style="padding-left:18px;margin:6px 0;">
                <li><strong>Platform</strong> — may crumble, delay-collapse, or shift</li>
                <li><strong>Spikes</strong> — may activate early, late, or pulse on/off</li>
                <li><strong>Jump Pad</strong> — may misfire, reduce launch, or delay</li>
                <li><strong>Hex</strong> — inverts your controls or becomes lethal</li>
                <li><strong>Betrayal</strong> — starts safe, mutates mid-run</li>
                <li><strong>Food</strong> — counters control inversions when collected</li>
              </ul>
              <p style="margin-top:12px;opacity:0.6;font-size:12px;">The sabotage is seeded per run — it won't reroll. Learn the pattern and beat it.</p>
            </div>
            <button style="margin-top:16px;width:100%;padding:12px;background:rgba(122,167,255,0.15);border:1px solid rgba(122,167,255,0.3);border-radius:8px;color:#7aa7ff;font-weight:800;font-size:14px;cursor:pointer;" onclick="this.closest('[style]').remove()">Got it — let's build</button>
          </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
      });
    }
  }

  // ── 10. FIX: Space key switches build→play ──────────────────────────────────
  function patchSpaceSwitchToPlay() {
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space") return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.tagName === "BUTTON")) return;
      const allModals = ["startModal","levelsModal","leaderboardModal","settingsModal","reportModal","customizationModal","adminModal","modModal","announcementModal","authModal","multiplayerModal"];
      const anyOpen = allModals.some(id => { const m = $(id); return m && !m.classList.contains("hidden"); });
      if (anyOpen) return;

      const buildBtn = $("buildModeBtn");
      const playBtn = $("playModeBtn");
      if (!buildBtn || !playBtn) return;

      const inBuild = buildBtn.classList.contains("primary");
      const inPlay = playBtn.classList.contains("primary");

      if (inBuild && !inPlay) {
        e.preventDefault();
        playBtn.click();
      }
    }, { passive: false });
  }

  // ── 11. FIX: Comprehensive keyboard navigation ───────────────────────────────
  function initFullKeyboardNav() {
    const style = document.createElement("style");
    style.textContent = `
      .kbdHintBar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 28px;
        background: rgba(6,8,18,0.92);
        border-top: 1px solid rgba(122,167,255,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        font-size: 10.5px;
        color: rgba(180,190,220,0.55);
        z-index: 30;
        pointer-events: none;
        font-family: monospace;
      }
      .kbdHintBar kbd {
        background: rgba(122,167,255,0.12);
        border: 1px solid rgba(122,167,255,0.2);
        border-radius: 3px;
        padding: 0 4px;
        color: rgba(200,215,255,0.75);
        font-size: 10px;
      }
    `;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.className = "kbdHintBar";
    bar.innerHTML = `
      <span><kbd>Space</kbd> Play</span>
      <span><kbd>B</kbd> Build</span>
      <span><kbd>R</kbd> Restart</span>
      <span><kbd>L</kbd> Levels</span>
      <span><kbd>Esc</kbd> Settings</span>
      <span><kbd>?</kbd> All shortcuts</span>
      <span><kbd>WASD</kbd> Move/Pan</span>
      <span><kbd>Ctrl+Z</kbd> Undo</span>
    `;
    document.body.appendChild(bar);

    window.addEventListener("keydown", (e) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      const allModals = ["startModal","levelsModal","leaderboardModal","settingsModal","reportModal","customizationModal","adminModal","modModal","announcementModal","authModal","multiplayerModal"];
      const anyOpen = allModals.some(id => { const m = $(id); return m && !m.classList.contains("hidden"); });

      if (anyOpen) return;

      switch (e.key) {
        case "t": case "T": {
          const btn = $("quickLevelsBtn");
          if (btn) { btn.click(); e.preventDefault(); }
          break;
        }
        case "c": case "C": {
          if (!e.ctrlKey && !e.metaKey) {
            const btn = $("openCustomizationWindowBtn");
            if (btn) { btn.click(); e.preventDefault(); }
          }
          break;
        }
        case "m": case "M": {
          const btn = $("openMultiplayerBtn");
          if (btn) { btn.click(); e.preventDefault(); }
          break;
        }
        case "h": case "H": {
          const watchBtn = $("tutorialWatchBtn");
          if (watchBtn) { watchBtn.click(); e.preventDefault(); }
          break;
        }
        case "k": case "K": {
          const btn = $("openLeaderboardBtn");
          if (btn) { btn.click(); e.preventDefault(); }
          break;
        }
        case "n": case "N": {
          const btn = $("endNextLevelBtn");
          if (btn && !btn.classList.contains("hidden") && btn.style.display !== "none") {
            btn.click(); e.preventDefault();
          }
          break;
        }
        case "1": case "2": case "3": case "4": {
          const tiers = ["easy","medium","hard","tutorial"];
          const tier = tiers[parseInt(e.key) - 1];
          document.querySelectorAll(".levelTab").forEach(tab => {
            if (tab.dataset.tier === tier) tab.click();
          });
          break;
        }
      }
    });
  }

  // ── 12. FIX: UI styling improvements ─────────────────────────────────────────
  function applyUiPolish() {
    const style = document.createElement("style");
    style.textContent = `
      .stageWrap { position: relative; }
      #endOverlay { position: absolute; inset: 0; }

      .endOverlayMessage.win {
        color: #2dd4bf !important;
        text-shadow: 0 0 20px rgba(45,212,191,0.4);
      }
      .endOverlayMessage.lose {
        color: #ff4d6d !important;
        text-shadow: 0 0 20px rgba(255,77,109,0.4);
      }
      .endOverlayStats {
        font-size: 13px !important;
        color: rgba(200,215,255,0.75) !important;
        margin: 8px 0 16px !important;
      }
      .endOverlayActions {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      .buildModeBtn.primary, .playModeBtn.primary {
        box-shadow: 0 0 12px rgba(122,167,255,0.25);
      }

      #quickLevelsBtn {
        background: linear-gradient(135deg, rgba(122,167,255,0.18), rgba(167,139,250,0.18));
        border-color: rgba(122,167,255,0.35) !important;
      }
      #quickLevelsBtn:hover {
        background: linear-gradient(135deg, rgba(122,167,255,0.28), rgba(167,139,250,0.28));
      }

      .tileBtn:hover {
        transform: translateX(2px);
        transition: transform .1s;
      }
      .tileBtn.selected {
        border-left: 3px solid #7aa7ff !important;
        background: rgba(122,167,255,0.12) !important;
      }

      .levelTab.active {
        box-shadow: 0 0 8px rgba(122,167,255,0.25);
      }

      .levelSelectBtn:hover {
        transform: translateY(-1px);
        transition: transform .1s;
      }

      .pill.timerPill.warn {
        color: #ff4d6d !important;
        animation: timerWarnPulse 0.8s ease infinite;
      }
      @keyframes timerWarnPulse {
        0%,100%{opacity:1;}50%{opacity:0.6;}
      }

      #budgetPill {
        padding: 8px 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        margin-bottom: 6px;
      }

      .endOverlayContent .btn.primary {
        min-width: 100px;
        font-size: 14px;
        padding: 10px 20px;
      }

      @media (max-width: 600px) {
        .endOverlayContent { padding: 20px 16px !important; }
        .endOverlayActions { gap: 6px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── 13. FIX: stageWrap must be position:relative for centered end overlay ────
  function fixStageWrap() {
    const stage = document.querySelector(".stageWrap");
    if (stage) stage.style.position = "relative";
    const endOverlay = $("endOverlay");
    if (endOverlay) endOverlay.style.position = "absolute";
  }

  // ── BOOT ─────────────────────────────────────────────────────────────────────
  async function boot() {
    applyUiPolish();
    fixStageWrap();
    fixEndOverlayBackdrop();
    patchSpaceSwitchToPlay();
    initFullKeyboardNav();
    patchPlayButtonFeedback();
    patchPaletteTooltips();

    await waitFor(() => $("budgetPill") && $("palette")?.children.length > 0);

    patchBudgetPill();
    patchBuiltinLevelsButton();
    patchCustomizationButton();
    patchTutorialButton();
    patchBootPlayerName();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
