# Handoff: Game Feel / UX / Accessibility overhaul — IN PROGRESS

This is a checkpoint. `node --check script.js` passes (syntax valid), but the build is
**NOT feature-complete or tested end-to-end yet** — some new code paths reference things
that are wired up, but the full hotkey dispatch loop and a few display layers are not
plugged in yet. Read this whole file before touching code again.

## Original request (7 numbered items)
1. Every death should explain the exact sabotage that caused it.
2. Full keyboard shortcuts for everything, viewable in Settings, disabled during Play mode,
   no overlapping keys, movement keys untouched.
3. Built-in Levels gets its own dedicated button/modal (out of the Player/Welcome menu),
   with a search bar.
4. First-ever play of a freshly built/loaded custom layout shows a mysterious one-line
   teaser above the HUD (not a popup/button).
5. General accessibility/UX pass — reduce clicks, fast navigation.
6. Lots of new sound effects (procedural, no external assets).
7. Keep the "memory + reflex" philosophy intact; fix genuine bugs found along the way
   (verify first, don't guess).

## ✅ DONE (verified, syntax-checked)

### Requirement 1 — Death explanations
- `state.lastStand` added to PlayState, set in `onLand()` — snapshots `{gx, gy, type, sab, atMs}`
  of the last solid tile stood on (sab is a stable object ref, so it's still readable even
  after the tile decays to `Tile.empty`).
- `explainFallDeath(state)` — inspects `state.lastStand` and produces a specific message for
  one-step/delayed/flicker platform breaks, or flaky/reduced/delayed jump pad failures, else an
  honest "that one wasn't sabotage, just a missed landing."
- `explainHazardDeath(tile)` — specific message for delayed/pulse spikes, becomeDangerous hex,
  lava, generic spikes.
- Both wired into the two `end(state, "lose", ...)` call sites (fall-out-of-world, and
  lethal-tile contact in `checkOutcome`).
- Timer and Hammer death messages given minor wording polish (not restructured).
- CSS: `.endOverlayContent` given `max-width`, `.endOverlayStats` given `line-height` to fit
  longer text.
- **Fully done, nothing left here.**

### Bug fixes found + fixed along the way (verified via static trace before fixing)
1. **Hex "invertControls" sabotage was completely dead code.** Hex tiles are never `solid`
   (see `makeRuntimeTiles`), and `onLand()` is only reached via `resolveAxis`'s solid-tile
   collision path — so the old `if (tile.type === Tile.hex)` branch inside `onLand()` could
   never fire. ~Half of all Hex tiles (the "curse controls" variant, vs "become dangerous")
   silently did nothing, contradicting the tile's own hint text ("Curses you"). Fixed by moving
   the trigger into `checkOutcome()`'s AABB-overlap loop (which already handles non-solid
   contact tiles like Food), with a one-shot guard so lingering on the tile doesn't spam.
2. **Speed Boost toast/effect re-fired every single frame while standing on the tile.** Physics
   re-resolves the same collision every frame due to gravity being re-applied and re-clamped
   (this is *inherent* to how `resolveAxis`/`onLand` work — grounded tiles get re-landed-on
   every frame). Fixed with a one-shot guard (`wasActive` check before extending the timer).
3. **Food same issue** (never consumed/removed, so overlap re-fires every frame). Same
   one-shot guard fix.
   - **Why this suddenly mattered more:** these were pre-existing (harmless-ish, just toast
     text flicker) but became an *audible* problem once `showToast()` was wired to play a
     sound on every call (see sfx section below) — without the guards, standing on those
     tiles would've been a rapid-fire blip storm. Fixed before that could ship.
4. Confirmed via `grep` that `tile.solid` is **only ever set to `true`** in the initial
   `makeRuntimeTiles()` assignment (platform/jumppad/speedBoost only) and only ever set to
   `false` dynamically — so the dead-code diagnosis above is solid, not a guess.

### Requirement 2 — Keyboard shortcuts (DATA LAYER DONE, DISPATCH NOT WIRED YET — see TODO)
- `Actions` registry expanded to 27 actions across 5 categories (General, Menus, Build tools,
  Settings, Tiles) — each with `{label, desc, cat}`.
- `TILE_ACTION_MAP` — maps every `Tile.xxx` to its hotkey action id, for generic dispatch.
- `RESERVED_MOVEMENT_KEYS` — `a, d, w, space, arrowleft, arrowright, arrowup` are permanently
  reserved and rejected if someone tries to rebind onto them.
- `defaultKeybinds()` rewritten with a full, zero-overlap key map (see table below).
- `loadSave()` migration: for existing saves, missing actions get folded in from
  `defaultKeybinds()` **only if the key isn't already claimed** by something the player
  customized; otherwise left `""` (unbound) rather than silently colliding.
- `save.settings.seenCustomLevels: string[]` added to schema + migration (for requirement 4).
- Rebind flow (`window.addEventListener("keydown", ...)` for `keybindUI.action`) now:
  - Rejects reserved movement keys with a toast.
  - Auto-reassigns: if the pressed key already belongs to another action, that action is
    unbound and the key moves to the one being edited (toast explains the swap). This is the
    "no overlapping any key" guarantee.
- `buildKeybindUI()` rewritten to render **grouped by category** with a `.kbdGroupTitle`
  header per group, and shows "Unbound" (styled `.unbound`) for actions with no key — this
  list IS the "view all shortcuts" feature (single source of truth, always in sync).
- Settings HTML: Keybinds card renamed "Keyboard Shortcuts", given `id="keybindsCard"` (so a
  future hotkey can scroll straight to it), with updated help copy.

**Current default key map** (all lowercase, no overlaps, movement keys excluded):
```
General:      restart=r, toggleBuild=b, togglePlay=p, openSettings=escape, viewShortcuts=/
Menus:        openPlayerMenu=m, openBuiltinLevels=k, openLevels=l, openLeaderboard=o, findMatch=f
Build tools:  saveLevel=s, clearGrid=x, undo=z, redo=y
Settings:     toggleSound=v, toggleDebugOverlay=g
Tiles:        tileStart=1, tileGoal=2, tilePlatform=3, tileSpikes=4, tileJumppad=5, tileHex=6,
              tileLava=7, tileSpeedBoost=8, tileFood=9, tilePathBlock=0, tileEraser=e
```

### Requirement 3 — Built-in Levels dedicated modal (MOSTLY DONE)
- New topbar button `#openBuiltinLevelsBtn` ("🎮 Built-in Levels"), placed next to Restart.
- New modal `#builtinLevelsModal` in `index.html`, containing: `#builtinLevelsSearchInput`,
  the (relocated, same-id) tier tabs + `#levelListByTier` + `#quickRandomBtn`.
- Old "Level selection" card removed from `#startModal` (Welcome/Player modal), replaced with
  a small pointer card + `#startModalBrowseLevelsBtn` button that closes Start modal and opens
  the new Built-in Levels modal.
- `renderLevelListByTier()` rewritten: supports search (searches level name across **all**
  tiers when there's a query, ignoring the tier tabs; falls back to tier-tab filtering when
  query is empty), renders nicer cards (`.builtinLevelCard`) with a tier badge + best time +
  "▶ Play" button, instead of the old plain button list.
- `launchBuiltinLevel()` and the `#quickRandomBtn` handler both updated to close **either**
  possible parent modal (`elStartModal` and `elBuiltinLevelsModal`) since the level list can
  now be reached from two places.
- `openStartModal()` no longer calls `renderLevelListByTier()` (moved out).
- `ALL_MODALS` array + `anyOpenModal()` helper added centrally; `allModalsClosed()` updated;
  backdrop click handler now loops `ALL_MODALS` instead of hardcoding 4 modals.
- **NOT verified yet:** `#quickRandomBtn` is referenced by `mobile.js` via `$("quickRandomBtn")`
  — confirmed by grep that mobile.js only looks it up by ID (doesn't care where it lives in the
  DOM), so relocating it into the new modal should be safe, but this has NOT been tested in an
  actual browser/mobile view yet.
- **CSS NOT DONE YET:** `.builtinLevelCard`, `.tierBadge`, `.tierBadge--easy/--medium/--hard`,
  `.kbdGroupTitle`, `.kbd.unbound`, `.kbd.listening` (listening already existed, unbound is
  new) classes are referenced in JS but **have not been added to `style.css` yet**. Right now
  these will render unstyled/default. This is the next thing to do.

### Requirement 4 — Build-reward teaser (DATA ONLY, NOT WIRED YET)
- `state.showBuildTeaser = false` field added to PlayState (placeholder).
- `#buildTeaser` div added to `index.html` inside the HUD area, above `.hud` (currently
  `class="buildTeaser hidden"`).
- `save.settings.seenCustomLevels` array added to schema (see req 2 section) — intended to
  store `seedFromGrid(grid).toString(36)` fingerprints of layouts already played once.
- **NOT DONE:** actually computing the fingerprint, checking/recording it in
  `createPlayState`/`startPlay`, setting `state.showBuildTeaser`, and the display logic +
  CSS for `#buildTeaser` (fade in/out, text rotation among a few mysterious lines). See TODO.

### Requirement 6 — Audio (SFX DEFINED, MOSTLY NOT WIRED YET)
Added to `AudioSys.sfx` (all procedural Web Audio, no external asset files — consistent with
the existing sound system, and avoids any copyright/asset-sourcing question entirely):
- `uiHover`, `uiClick` — defined, **NOT wired to any buttons yet** (no delegated listener
  added). This is the biggest remaining audio task.
- `menuOpen`, `menuClose` — **wired centrally** into `openModal()`/`closeModal()`, covers
  every modal automatically including the new Built-in Levels one. Done.
- `landing` — **wired**, edge-triggered in the player step function (only fires on the real
  airborne→grounded transition with `vy > 260` at impact, not every resting frame). Done.
- `platformBreak` — defined, **NOT wired yet**. Needs to go at the two spots where
  `tile.solid` flips from `true` to `false` (in `onLand()` for the "oneStep" case, and in
  `updateRuntimeTiles()` for the "delayed"/"flickerThenBreak" case). See TODO.
- `sabotageTrigger` — defined, **NOT wired yet**. Intended for one-shot hazard-arming events
  (hex becomeDangerous activating, delayedOn spikes arming) — deliberately NOT for continuous
  "pulse" spikes (would cause constant audio spam across a level with many pulsing tiles).
  Should be gated by distance-to-player to avoid off-screen noise. Not started.
- `notify` — **wired centrally** into `showToast()`, so every toast in the game plays it.
  Done (this is also why the Food/SpeedBoost one-shot-guard bug fixes above mattered).

### Requirement 5 (Accessibility/UX) and Requirement 7 (vision/bug sweep)
**Not started as a dedicated pass yet.** The bug fixes found so far (hex, speedBoost, food
spam) happened opportunistically while working on requirement 1/6, not from a deliberate
sweep. A real pass still needs to happen once the above is finished and testable.

## 🔴 TODO — do these next, roughly in this order

1. **Wire the global hotkey dispatch.** This is the most important missing piece — the
   `Actions`/`defaultKeybinds`/rebind system all exist, but nothing in `frame()` actually
   reads `input.wasPressed(keyForAction(id))` for the new actions yet. Existing code already
   does this for `restart` (inside `updatePlay`, unchanged — keep it working during Play
   mode, that's intentional) and for `openSettings`/`openLevels`/`toggleBuild`/`togglePlay`
   (currently unconditional — needs to be gated, see next point). Need to add, all gated
   behind `if (mode !== "play") { ... }` (per the explicit instruction "while in play mode no
   key should work" — movement keys and Restart are exempt since they're not part of this
   action-hotkey system):
   - `openSettings` — also fix Escape to close **whatever modal is actually open** (use the
     new `anyOpenModal()` helper) rather than always specifically toggling Settings — this is
     a real UX bug in the current code (Escape while e.g. Leaderboard is open currently opens
     Settings on top instead of closing Leaderboard).
   - `openBuiltinLevels` → `elOpenBuiltinLevelsBtn.click()`
   - `openLeaderboard` → `elOpenLeaderboardBtn.click()`
   - `openPlayerMenu` → `elProfileChip.click()`
   - `findMatch` → `elMultiplayerBtn && elMultiplayerBtn.click()`
   - `saveLevel` → `elSaveLevelBtn.click()`
   - `clearGrid` → `elClearBtn.click()`
   - `undo` / `redo` → call the existing `undo()`/`redo()` functions directly (no desktop
     button exists for these currently, only a mobile FAB)
   - `toggleSound` → `elSoundToggle.click()` (checkbox `.click()` toggles + fires change)
   - `toggleDebugOverlay` → `elDebugOverlayToggle.click()`
   - `viewShortcuts` → new `openShortcutsView()` function: open Settings, then
     `document.getElementById("keybindsCard").scrollIntoView({behavior:"smooth"})`
   - Tile hotkeys, build-mode only, using `TILE_ACTION_MAP` generically:
     ```js
     if (mode === "build") {
       for (const t of paletteOrder) {
         const actionId = TILE_ACTION_MAP[t];
         if (actionId && input.wasPressed(keyForAction(actionId))) {
           selectedTile = t;
           syncPaletteSelection();
           break;
         }
       }
     }
     ```
   - Reuse the *existing* `openLevels`/`toggleBuild`/`togglePlay` logic already in `frame()`
     around line ~4420-4460 (search for `keyForAction("openSettings")` to find the block) —
     just wrap it and add the new checks alongside it, don't duplicate the existing logic.

2. **CSS for everything referenced but not styled yet:**
   - `.builtinLevelCard` (extend `.listItem` pattern)
   - `.tierBadge`, `.tierBadge--easy`, `.tierBadge--medium`, `.tierBadge--hard` (small pill,
     reuse colors already defined for `.stat .v.easy/.medium/.hard` if present — check style.css)
   - `.kbdGroupTitle` (small uppercase muted section header, some margin-top for separation)
   - `.kbd.unbound` (muted/dashed style, distinct from the normal `.kbd` pill)
   - `.buildTeaser` (pill/banner style, positioned above `.hud`, fade in/out transition,
     italic, use an accent color — `--accent2` or similar purple/hex-curse color for the
     "mysterious" feel; check what CSS custom properties already exist in `:root`)
   - `#builtinLevelsSearchInput` probably fine reusing existing `.input` class — verify it
     looks right once other CSS is in.

3. **Requirement 4 — actually implement the build teaser:**
   - In `createPlayState` (or `startPlay`, wherever `builtinIndex`/`sourceLevelId`/`mpSession`
     are known), compute `const fp = seedFromGrid(grid).toString(36);` — only when
     `builtinIndex == null && !mpSession.active` (don't show for built-in levels or MP).
   - Check `save.settings.seenCustomLevels.includes(fp)`. If not present: set
     `state.showBuildTeaser = true`, push `fp` into the array, persist. If present: leave
     `false`.
   - Pick one of ~4 short mystery lines at random (use the user's exact example as one of
     them: "Something feels different about this run..."). Keep them vague — **never
     reveal which sabotage type is active**, per the original spec.
   - Display logic: when `state.showBuildTeaser` is true right after `startPlay()`, show
     `#buildTeaser` with the text, auto-hide after ~4-4.5s (separate timer from the toast
     system — do NOT reuse `showToast()`, since `startPlay()` already fires a toast
     ("Play mode. Sabotage activated.") immediately and it would stomp on this one).

4. **Requirement 6 — finish wiring audio:**
   - `platformBreak`: add `AudioSys.sfx.platformBreak();` at the two `tile.solid = false`
     transition points (`onLand()` oneStep case, `updateRuntimeTiles()` delayed/flicker case)
     — guard so it only fires once per tile (check `tile.solid` was `true` immediately before
     the assignment, not after).
   - `sabotageTrigger`: one-shot, distance-gated (e.g. within ~500px of player), for hex
     becomeDangerous activating and delayedOn spikes arming. Do NOT add it to the continuous
     pulse-spikes cycle (audio spam risk across a level with many pulsing tiles — deliberately
     scoped out, see notes above).
   - `uiHover`/`uiClick`: add a **delegated** listener (not per-button) — something like:
     ```js
     let lastHoverSfxAt = 0;
     document.addEventListener("pointerover", (e) => {
       const el = e.target.closest(".btn, .iconBtn, .tileBtn, .levelTab");
       if (!el) return;
       const now = performance.now();
       if (now - lastHoverSfxAt < 60) return; // throttle rapid mouse-over spam
       lastHoverSfxAt = now;
       AudioSys.sfx.uiHover();
     });
     document.addEventListener("click", (e) => {
       const el = e.target.closest("button, .btn, .iconBtn, .tileBtn, .levelTab");
       if (el) AudioSys.sfx.uiClick();
     });
     ```
     Check this doesn't feel like it's double-firing/clashing with bespoke sounds already on
     specific buttons (e.g. Save already plays `save()`) — that's an acceptable, common
     layering (distinct click + distinct action sound), but worth a quick listen-through once
     testable.

5. **Requirement 2 cleanup:** double check the **existing** `openLevels` keydown block (the
   one already in `frame()` before this session's changes) still behaves correctly once
   wrapped in the new `mode !== "play"` gate — re-read it in context first, don't just wrap
   blindly.

6. **Requirement 3 — mobile check:** confirm in `mobile.css`/`mobile.js` that nothing else
   assumed the old DOM location of the built-in-levels chooser inside `#startModal`. Already
   grepped once (only `#quickRandomBtn` referenced, by ID only) but re-verify once testable.

7. **Requirement 5 — dedicated accessibility/UX pass.** Not started. Go through the full
   click-path for common actions (build a level → save → play; browse levels → play; open
   settings → change something) and look for unnecessary steps/clicks. This was explicitly
   asked for as its own pass, separate from the mechanical feature work above.

8. **Requirement 7 — final bug sweep.** Do one more deliberate pass (not opportunistic) once
   everything above is wired, specifically looking for other frame-repeated-trigger bugs like
   the hex/speedBoost/food ones found so far (search for other `onLand`/`checkOutcome` side
   effects without a one-shot guard) and any other inconsistency. Verify carefully before
   changing anything — don't touch things that aren't confirmed bugs.

9. **Testing.** Nothing has been run in an actual browser yet — only `node --check` (syntax
   only, doesn't execute). Once TODO 1-4 are done, this needs a real smoke test: `node
   server.js` (or equivalent) and manually click through build → save → play → die (check
   death message) → settings → rebind a key → shortcuts list → built-in levels search →
   built-in levels play → mobile view sanity check.

## How to resume
1. Unzip this into a working directory.
2. `cd` into it, confirm `node --check script.js` still passes.
3. Read this file (you're reading it now).
4. Start at TODO item 1 (hotkey dispatch) — it's the biggest functional gap and the one
   other TODOs implicitly assume exists (e.g. testing item 9).
5. `git log` in the project dir has one commit ("baseline: uploaded project") — the working
   tree right now is ahead of that commit with all the changes described above, uncommitted.
   Consider committing before continuing so there's a clean diff-able checkpoint.
