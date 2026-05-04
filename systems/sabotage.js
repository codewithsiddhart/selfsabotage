(() => {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createController(seed, meta = {}, emit = null) {
    const rng = makeRng(seed ^ 0x9e3779b9);
    const recent = Array.isArray(meta.recentOutcomes) ? meta.recentOutcomes.slice(-5) : [];
    const easyStreak = recent.length >= 2 && recent.slice(-2).every((x) => x === "win");
    const unlockLevel = clamp(1 + Math.floor((meta.totalRuns || 0) / 4), 1, 8);
    const cursed = ((seed ^ 0xa5a5a5a5) % 7) === 0;
    const intensity = clamp(Math.round(meta.intensity || 5), 1, 10);
    const intT = (intensity - 1) / 9;

    const state = {
      controlMode: "normal",
      invert: false,
      delayMs: 0,
      ignoreChance: 0,
      duplicateChance: 0,
      uiFlicker: 0,
      displacement: 0,
      fakeHover: 0,
      fakeWinUsed: false,
      betrayalDone: false,
      jumpPatternCount: 0,
      queued: [],
      aggression: easyStreak ? 0.28 : 0.1,
      calmUntil: 2200 + rng() * 1200,
      chaosSpike: easyStreak || cursed,
      unlockLevel,
      nextRetuneAt: 3000 + rng() * 2200,
      effectLockUntil: 0,
      betrayalWindowMs: 0,
      didRareMoment: false,
    };

    function fire(rule) {
      if (typeof emit === "function") emit(rule);
    }

    function tuneControls(progress, nearWin) {
      const nearBoost = nearWin ? 0.22 : 0;
      const aggression = clamp(
        state.aggression + progress * (0.16 + intT * 0.12) + nearBoost + (state.chaosSpike ? 0.1 : 0),
        0,
        1
      );
      if (progress < 0.15) {
        state.controlMode = "normal";
        state.invert = false;
        state.delayMs = 0;
        state.ignoreChance = 0;
        state.duplicateChance = 0;
        return;
      }
      const r = rng();
      if (r < 0.14 + aggression * 0.12) {
        state.controlMode = "inverted";
        state.invert = true;
        state.delayMs = 0;
        state.ignoreChance = 0.01 + aggression * (0.02 + intT * 0.02);
        state.duplicateChance = 0.01 + aggression * (0.02 + intT * 0.02);
      } else if (r < 0.33 + aggression * 0.16) {
        state.controlMode = "delayed";
        state.invert = false;
        state.delayMs = Math.floor(lerp(100, 240 + intT * 60, aggression));
        state.ignoreChance = 0.008 + aggression * (0.02 + intT * 0.015);
        state.duplicateChance = 0.01 + aggression * (0.02 + intT * 0.015);
      } else {
        state.controlMode = "normal";
        state.invert = false;
        state.delayMs = 0;
        state.ignoreChance = 0.002 + aggression * (0.01 + intT * 0.01);
        state.duplicateChance = 0.003 + aggression * (0.01 + intT * 0.01);
      }
    }

    function onJumpPattern() {}

    function update(ctx) {
      const elapsed = Math.max(0, ctx.elapsedMs || 0);
      const progress = clamp(ctx.progress || 0, 0, 1);
      const nearWin = !!ctx.nearWin;
      const inCalm = elapsed < state.calmUntil;

      const canRetune = elapsed >= state.nextRetuneAt && elapsed >= state.effectLockUntil;
      if (!inCalm && canRetune) {
        tuneControls(progress, nearWin);
        state.nextRetuneAt = elapsed + 4500 + rng() * 3800;
      }
      state.fakeHover = Math.max(0, state.fakeHover - 0.06);
      state.uiFlicker = Math.max(0, state.uiFlicker - 0.08);
      state.displacement = Math.max(0, state.displacement - 0.04);

      if (nearWin && !state.betrayalDone) state.betrayalDone = true;

      if (state.betrayalWindowMs > 0 && elapsed > state.betrayalWindowMs) {
        state.betrayalWindowMs = 0;
        state.controlMode = "normal";
        state.invert = false;
        state.delayMs = 0;
        state.ignoreChance = 0.004;
        state.duplicateChance = 0.004;
      }
    }

    function applyInput(raw, nowMs) {
      let leftHeld = !!raw.leftHeld;
      let rightHeld = !!raw.rightHeld;
      let jumpPressed = !!raw.jumpPressed;
      let upHeld = !!raw.upHeld;
      let downHeld = !!raw.downHeld;

      if (state.invert) {
        const tmp = leftHeld;
        leftHeld = rightHeld;
        rightHeld = tmp;
      }

      if (state.delayMs > 0) {
        state.queued.push({
          fireAt: nowMs + state.delayMs,
          leftHeld,
          rightHeld,
          jumpPressed,
          upHeld,
          downHeld,
        });
        const ready = state.queued.find((q) => q.fireAt <= nowMs);
        if (ready) {
          leftHeld = ready.leftHeld;
          rightHeld = ready.rightHeld;
          jumpPressed = ready.jumpPressed;
          upHeld = ready.upHeld;
          downHeld = ready.downHeld;
          state.queued = state.queued.filter((q) => q !== ready);
        } else {
          jumpPressed = false;
          leftHeld = false;
          rightHeld = false;
        }
      }

      if (rng() < state.ignoreChance) {
        jumpPressed = false;
        if (rng() < 0.6) {
          leftHeld = false;
          rightHeld = false;
        }
      }

      if (jumpPressed && rng() < state.duplicateChance) {
        jumpPressed = true;
        state.uiFlicker = Math.max(state.uiFlicker, 0.45);
        fire({ id: "input_duplicate", category: "input", intensity: 0.6 });
      }

      return {
        leftHeld,
        rightHeld,
        jumpPressed,
        upHeld,
        downHeld,
        controlMode: state.controlMode,
      };
    }

    function shouldGhostWin(progress) {
      return false;
    }

    function consumeVisual() {
      return {
        flicker: state.uiFlicker,
        displacement: state.displacement,
        fakeHover: state.fakeHover,
      };
    }

    return {
      update,
      applyInput,
      onJumpPattern,
      shouldGhostWin,
      consumeVisual,
      getControlMode: () => state.controlMode,
      isCursedSeed: () => cursed,
      getUnlockLevel: () => state.unlockLevel,
      // BUG FIX 1: Expose queue reset so createPlayState can flush stale delayed inputs between runs.
      resetQueue: () => { state.queued = []; },
    };
  }

  window.SabotageSystem = { createController };
})();
