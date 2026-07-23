# Game Feel / UX / Accessibility overhaul — COMPLETE

All 7 original requirements are done, wired, and verified with an automated smoke test
(see `smoketest.js`). `node --check` passes on every `.js` file, and a real jsdom-based
run of the app (page load → build a level → save it → play it → hotkeys → saved-level
quick-play) passes 19/19 assertions.

## Original request (7 numbered items) — all done
1. Every death explains the exact sabotage that caused it. ✅
2. Full keyboard shortcuts for everything, viewable in Settings, disabled during Play mode,
   no overlapping keys, movement keys untouched. ✅
3. Built-in Levels has its own dedicated button/modal with a search bar. ✅
4. First-ever play of a freshly built/loaded custom layout shows a mysterious one-line
   teaser above the HUD. ✅
5. General accessibility/UX pass — reduce clicks, fast navigation. ✅
6. Lots of new procedural sound effects, no external assets. ✅
7. "Memory + reflex" philosophy intact; genuine bugs fixed along the way. ✅

## Requirement 1 — Death explanations
`state.lastStand` (set in `onLand()`) + `explainFallDeath()` / `explainHazardDeath()`, wired
into both `end(state, "lose", ...)` call sites. Unchanged since the last checkpoint.

## Requirement 2 — Keyboard shortcuts
- `Actions` (27 actions / 5 categories), `TILE_ACTION_MAP`, `RESERVED_MOVEMENT_KEYS`,
  `defaultKeybinds()`, rebind flow with auto-swap-on-collision, grouped `buildKeybindUI()` —
  all as before.
- **New this pass:** the actual dispatch loop in `frame()`. Every action now does something:
  - Wrapped in `if (mode !== "play")` — no hotkey fires mid-run (movement/jump are hardcoded
    and untouched; Restart is handled separately inside `updatePlay` and still works both
    mid-run and after a run ends, by design).
  - `openSettings` (Escape) now closes **whatever modal is actually open** via a new
    `anyOpenModal()` helper, instead of always specifically toggling Settings.
  - `openBuiltinLevels`, `openLeaderboard`, `openPlayerMenu`, `findMatch`, `saveLevel`,
    `clearGrid`, `toggleSound`, `toggleDebugOverlay` all dispatch by clicking the real
    button/checkbox (reuses existing listeners, zero duplicated logic).
  - `undo` / `redo` call the existing functions directly.
  - `viewShortcuts` → new `openShortcutsView()`: opens Settings and scrolls straight to
    `#keybindsCard`.
  - Tile hotkeys (1–9, 0, e) dispatch generically off `TILE_ACTION_MAP` in build mode only.

Default key map unchanged from the data-layer checkpoint (see in-code comment above
`defaultKeybinds()` for the full table).

## Requirement 3 — Built-in Levels dedicated modal
Unchanged since the last checkpoint (was already fully wired) — dedicated button/modal,
search across all tiers, tier badges, best-time, one-click Play. Verified mobile.js/mobile.css
only ever reference `#quickRandomBtn` by ID, so nothing broke moving the modal out of
`#startModal`.

**This pass:** added the missing CSS — `.builtinLevelCard`, `.tierBadge` (+ easy/medium/hard
variants, colors matched to the existing `.stat .v.easy/.medium/.hard` palette),
`.kbdGroupTitle`, `.kbd.unbound`.

## Requirement 4 — Build-reward teaser
Wired end-to-end: `createPlayState` fingerprints the grid (`seedFromGrid(grid).toString(36)`)
whenever `builtinIndex == null && !mpSession.active`, checks/records it against
`save.settings.seenCustomLevels`, and sets `state.showBuildTeaser`. `maybeShowBuildTeaser()`
is called after both `startPlay()` and `restartPlay()`, and picks one of 4 vague one-liners
(including the exact example line) on its own timer, independent of the toast system.
`#buildTeaser` fades in/out via a new `.show` class (since `.hidden` is `display:none` and
can't transition).

## Requirement 5 — Accessibility / UX pass
Went through build → save → play, browse-levels → play, and open-settings → change-something.
Found and fixed real (not invented) friction:
- **Save Level name input was the only text input in the whole app without Enter-to-submit**
  (every other search/create field already had it) — added.
- **Saved/custom levels only had "Load" (into Build mode), never a direct "Play"** — Built-in
  Levels already had one-click Play; saved levels needed an extra manual mode-switch click.
  Added a "▶ Play" quick action alongside Load/Delete. Verified it's safe: it goes through
  `setMode("play")` → `startPlay(null)`, same as manually loading then clicking Play, so it
  does **not** trigger built-in-only stat tracking or powerup consumption (those are gated on
  `sourceLevelId`, which stays `null` here) — confirmed by reading `createPlayState` before
  making this change, not by assumption.
- Auto-focus the relevant search/name field when Built-in Levels / Levels / Leaderboard modals
  open, desktop only (skipped on mobile to avoid popping the on-screen keyboard unexpectedly).

## Requirement 6 — Audio
All defined `AudioSys.sfx` entries are now actually wired:
- `menuOpen`/`menuClose`, `notify`, `landing` — already wired (prior checkpoint).
- `platformBreak` — added at both `tile.solid = false` transition points (`onLand()`'s
  oneStep case; `updateRuntimeTiles()`'s delayed/flickerThenBreak case), each naturally
  one-shot per tile.
- `sabotageTrigger` — added for hex `becomeDangerous` activating and `delayedOn` spikes
  arming, edge-triggered (needed a new one-shot `sabotageTriggered` tile flag) and
  distance-gated (~500px from the player). Deliberately **not** added to the "pulse" spikes
  cycle (would be constant audio spam on any level with several pulsing tiles).
- `uiHover` / `uiClick` — delegated listeners on `document`, covering `.btn, .iconBtn,
  .tileBtn, .levelTab` (hover, throttled to 1/60ms) and `button, .btn, .iconBtn, .tileBtn,
  .levelTab` (click). Verified via the smoke test that clicking/hovering a real button
  doesn't throw and doesn't conflict with buttons that already play a bespoke sound (e.g.
  Save's own `save()` — layering, not a clash).

## Requirement 7 — Bug sweep
Beyond the hex/speedBoost/food one-shot-guard fixes from the prior checkpoint, this pass
found and fixed two more real issues, both verified by tracing the code (not guessed):

1. **Protection powerup could absorb a hit and still kill you the next frame.** Unlike the
   Hammer powerup case (which deactivates the hammer object itself after an absorbed hit, so
   it naturally can't collide again), the hazard-tile case only cleared the `protection` flag
   — the hazard tile stays exactly as deadly as before. If the player was still inside the
   tile's collision box on the very next frame (easy to happen — gravity keeps pulling you
   through a non-solid spikes/lava tile), Protection would be gone and `end(state, "lose", …)`
   would fire anyway. Fixed with a short (`500ms`) grace period (`state.invulnerableUntil`)
   after an absorb, mirroring the intent of the Hammer case.
2. **A temporal-dead-zone `ReferenceError` on `builtinLevelStats` that broke the entire app
   on load.** `renderLevelListByTier()` — called eagerly during setup, not behind any
   interaction — reads `builtinLevelStats[lvl.id]` directly. `builtinLevelStats` was declared
   with `let` much further down in the same top-level scope, so *any* real browser (this is
   standard JS scoping, not a testing-environment quirk) would throw synchronously partway
   through the app's one-time init, meaning `window.SSB` never gets exposed and `mobile.js`
   fails right after. This is exactly the class of bug the final smoke-test step was meant to
   catch — it was caught on the very first run of `smoketest.js`. Fixed by moving the
   declaration up next to the other early module-level state (`activePlayer`, `save`).

## Requirement 9 — Testing
`smoketest.js` (new file, uses `jsdom` — installed as a dev-only dependency via
`npm install --no-save jsdom`, not added to `package.json`) loads the real `index.html` /
`script.js` / `mobile.js`, stubs Canvas2D (jsdom has no native canvas without the native
`canvas` package) and lets `AudioContext` be legitimately absent (the app already tolerates
that everywhere), then exercises: page load, player creation, minimal level build +
validation, the build teaser (fires once, not on same-layout restart), Escape/`anyOpenModal`
modal behavior, hotkeys being fully inert during Play, tile hotkeys, the delegated
click/hover sfx listeners, Save Level's Enter-to-submit, and the saved-level "▶ Play" quick
action. Run it with:
```
npm install --no-save --no-audit --no-fund jsdom
node smoketest.js
```
No browser was available in this environment to click through manually, so this automated
pass is the closest equivalent — and it's what actually found the `builtinLevelStats` bug
above. A real click-through (especially the mobile view, and an actual audio listen-through)
is still worth doing when you have a browser handy, but nothing in this codebase is
currently known to be broken.

## Notes for later
- `tile.cursedActive` / `tile.cursedUntil` fields exist in `makeRuntimeTiles()` but are never
  read anywhere — looks like dead/vestigial state from an earlier version of the hex-curse
  mechanic (which now lives in `state.effects.invertUntil` instead). Harmless as-is; left
  alone since removing dead fields wasn't part of this request and isn't a behavior bug.
- `git log` has two commits (`baseline`, and the prior checkpoint). Everything in this
  document is uncommitted on top of that — consider committing now that it's a clean,
  tested stopping point.
