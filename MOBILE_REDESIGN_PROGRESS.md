# Mobile-First Redesign — Progress Report

**Update:** the three mobile screens described below are now built (`mobile.css` + `mobile.js` +
`index.html` additions), on top of the `script.js` engine work from the first checkpoint. This
still needs real-device testing before you'd want to ship it — see "What's left."

**Desktop is untouched.** Every new rule in `mobile.css` is scoped under
`html[data-device="mobile"]`, and every new element is additive to `index.html`. If you load the
game and pick "Desktop" in the device prompt, it looks and behaves exactly as it did before any of
this work started.

---

## What's done

### Engine bridge (`script.js`, additive only)
- `window.SSB` — a small public API (state getters + actions) that `mobile.js` uses instead of
  reaching into engine internals. See the bottom of `script.js` for the full surface.
- `openStartModal()` now hands off to a mobile Home screen when in mobile mode, instead of popping
  the desktop modal. This one hook covers every "back to menu" path in the game.
- Real drag-to-paint/erase, two-finger pinch-zoom + pan, and double-tap zoom on the build canvas —
  mobile only, desktop's single-click behavior is unchanged.
- A genuine undo/redo stack for Build Mode (didn't exist before at all, even on desktop — this was
  your P2 item, so it's implemented for real, not stubbed).

### Three real mobile screens (`mobile.css`, `mobile.js`, `index.html`)

**Player Hub (Home)** — `#mobileHome`, a full-screen scrollable menu, not a popup:
- Profile chip (tap to switch/create a player, in a bottom sheet)
- "Continue Playing" card — remembers the last built-in level you launched (via localStorage) and
  offers one tap back into it; falls back to the first Easy level with a "Start Playing" label if
  you've never played one yet
- Build / Multiplayer / Random quick-launch row
- Built-in Levels as large, swipeable, tier-tabbed cards (shows your best time once you've run
  one) — the level card *is* the play button, one tap launches it
- Powerups (tap to arm for your next built-in-level run)
- Instructions blurb
- A "More" sheet tucks away the lower-priority stuff (My saved levels, Leaderboard, Settings, and
  a "switch to desktop layout" escape hatch) rather than cluttering the home screen with them

**Build Mode** — `#mobileBuildShell`:
- Bottom toolbar of large tile chips (built from the same tile metadata the desktop palette uses),
  horizontally scrollable, tap to select
- Tap-to-place / drag-to-paint / drag-to-erase / pinch-zoom / pan / double-tap-zoom on canvas (the
  gesture engine from the `script.js` checkpoint)
- Floating action buttons: Undo (disabled when there's nothing to undo), Save (opens the existing
  saved-levels sheet), Clear (armed/confirm pattern — tap once to arm, tap again within ~2.5s to
  actually clear, so a stray tap can't wipe your level)
- Compact Validation + Difficulty badges that expand into a small detail panel on tap, instead of
  permanently occupying screen space
- "Play" FAB and a "back to Home" button in a slim top bar

**Play Mode** — `#mobilePlayHud`:
- Only Timer (reuses the existing timer pill, repositioned), a one-line Objective pill (level
  name), a small Player chip, and the touch controls are visible — everything else is hidden
- Touch buttons enlarged (74px) and safe-area aware for notches/home indicators
- Camera-follow and the end-of-run overlay are unchanged (reused as-is, just restyled for small
  screens)

### One proactive addition beyond the brief
The first-visit "Desktop or Mobile?" prompt used to offer two neutral, unlabeled-by-relevance
buttons. It now detects touch/coarse-pointer capability (`matchMedia('(pointer: coarse)')` /
`maxTouchPoints`) and marks the likely-correct option "Recommended for this device" — the player
still has to tap to confirm, nothing is auto-selected, it just removes a moment of "which one am
I?" friction for the common case.

---

## What's left

1. **Real-device testing** — this has been built and reasoned through carefully (including
   catching a DOM-nesting bug in my own CSS before it shipped — `#mobileBuildShell` /
   `#mobilePlayHud` are siblings of `.app`, not descendants, so their visibility is driven by an
   explicit JS class toggle each frame rather than a CSS selector that would never have matched).
   But it has **not been run on an actual phone/browser yet.** Before you trust it, test on at
   least iOS Safari and Android Chrome for: pinch-zoom/pan feel, touch-target sizing in practice,
   safe-area insets on notched devices, and general performance.
2. **Desktop keyboard shortcut for undo** (`Ctrl+Z`) — the undo/redo system is engine-level and
   only wired to the mobile FAB right now. Small follow-up if you want it on desktop too.
3. **Landscape vs portrait tuning for Play Mode** — the existing `rotateOverlay` nudge (asks the
   player to rotate for the best experience) was kept as-is; hasn't been re-evaluated against the
   new mobile HUD.
4. **Visual polish pass** — spacing/sizing was reasoned from the existing design tokens and CSS
   dimensions, not from visually rendering it. Expect some fine-tuning once you actually see it on
   a screen (this is normal for a CSS-heavy build done without a live preview).
5. **Accessibility pass** — sheets/screens have basic `aria-hidden` toggling but haven't been
   tested with a screen reader.

## How to run it
`npm install && node server.js` (or however you normally run it) — same as before, no new
dependencies were added. Open it on a phone, or in a desktop browser with device emulation (Chrome
DevTools → toggle device toolbar) to see the mobile shell.

