# Phase 8: display modes and power

### Starter Prompt
```
This is Phase 8 of the Desktop Client Update: display modes and the gamepad
display-sleep blocker.

Model: Fable 5, xhigh effort. Harness: Claude Code. Workflow orchestration: none in this phase (standard agent fan-out only).

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action: discover the LATEST release/* branch (git ls-remote --heads
origin 'release/*', highest version), ancestry-guard, then pull+merge it (state.md
standing rule 3); git status clean or stop.

Goal: a real display-mode choice on desktop (borderless fullscreen / windowed) that
persists, and a screen that never dims during controller-only play.

STEP 0 - memory scan (topics: desktop-client-update program, options doctrine, char
sheet playtime display-preference doctrine).

STEP 1 - LOAD CONTEXT: Explore agent (budget ~35 calls, report-first) summarizes:
state.md (options doctrine, prefs store schema from phase 7, bridge recipe),
progress.md, this file; how the EXISTING fullscreen setting works end to end
(src/game/settings.ts entry, options_view row, the applySetting arm, and
requestBrowserFullscreen usage in src/main.ts) and what it does inside Electron today;
electron/main.cjs window creation + the phase 7 store wiring; src/game/gamepad.ts
activity detection surface (what signals "a pad is actively in use"); Electron
powerSaveBlocker API notes from electron/ if any exist. Return: the fullscreen
setting's full wiring, the store schema, and the gamepad activity seam.

STEP 2 - EXECUTE (electron agent + game/options agent in parallel):
Electron agent:
- displayMode in the prefs store schema ('borderless' | 'windowed'; default
  'borderless' to match a AAA default, but RESPECT the phase 7 store versioning) and a
  setDisplayMode invoke channel (trustedSender, validated enum). If the options
  surface renders it as a multi-value control, use the existing choice-control
  family (the dial ladder is highCapLadderOptions since upstream 9d166dfc8b; no new
  settings family exists or should be invented). Implementation:
  borderless = win.setFullScreen(true) (Electron fullscreen on the window's current
  display; it is borderless-style, there is no exclusive mode in Electron, do not
  fake one); windowed = setFullScreen(false) restoring the remembered bounds. Apply at
  startup from the store and live on the channel.
- powerSaveBlocker: a small pure module deciding start/stop from gamepad-activity
  pings (electron/power_save.cjs + test): start('prevent-display-sleep') when active,
  stop after a debounce (~60s without pings), always stopped on quit and on window
  hidden. Bridge: notifyGamepadActivity() fire-and-forget invoke, rate-limited
  main-side (ignore pings more often than ~1/10s). ipc pins updated for both channels.
- HIDDEN-SHELL GPU LANE AUDIT (added 2026-08-13; census claim post-entry-prewarm-
  hidden-gpu, upstream 7079697863 era): the backgroundGpuWork producers (post-entry
  preview prewarm via renderer.queueSecondaryPreviewPrewarm, compile gates, texture
  chunk uploads, zone/asset prepare, maybeWarmCurrentZone) all run OUTSIDE the phase
  4 presentation gate: a hidden desktop shell (backgroundThrottling off, timers and
  requestIdleCallback still firing) keeps executing those GPU units at their own
  pacing until their bounded schedules complete. ENUMERATE the lane set on the
  current tree and pause-or-accept EACH while hidden, with the decision recorded per
  lane (the prewarm schedule is finite and self-limiting, likely accept-with-note;
  a recurring producer would be a pause). This is the power story's other half
  beside the display-sleep blocker.
Game/options agent:
- Display-mode options row via the doctrine: on DESKTOP the existing fullscreen toggle
  is REPLACED by the display-mode control (feature-check the bridge; web/mobile keep
  the browser-fullscreen toggle untouched). Reconciliation is the subtle part: the
  desktop path must stop calling requestBrowserFullscreen (double-fullscreen fights
  the OS) and route through the bridge instead; trace every reader of the fullscreen
  setting to keep web semantics identical. applySetting arm owns the write; English
  keys + M16 fills; all three doctrine pins plus a pin that the desktop control never
  renders on web.
- Gamepad activity: hook the existing per-frame gamepad poll (src/game/gamepad.ts) to
  call the bridge notify (feature-checked, throttled client-side to ~1/30s of active
  input, only when input is actually happening: axis/button deltas, not mere
  connection).

INVARIANTS IN PLAY: options doctrine complete; bridge optional + feature-checked; the
powerSaveBlocker must be provably released (leaking it drains laptops, the opposite of
this packet); no em dashes/emojis; i18n with M16.

Out of scope: monitor SELECTION UI (bounds+display memory from phase 7 already pins
the monitor; a picker is a follow-up); refresh-rate/vsync controls; exclusive
fullscreen (does not exist in Electron, documented non-goal); tray.

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit`; `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts
  tests/settings.test.ts tests/options_view.test.ts tests/localization_fixes.test.ts`;
  `npm run ci:changed`.
- Manual smoke if possible: pack, toggle modes live, relaunch into the persisted mode,
  verify pad input blocks display sleep (or at least that the blocker id activates in
  logs) and that it releases after idle. Record results.
- Review dispatch per the implementation-plan.md matrix: privacy-security-review
  (channels + OS power state) and frontend-seam-reviewer (options + game input).
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS:
- feat(desktop): display mode setting with borderless and windowed
- feat(desktop): hold a display-sleep blocker during active gamepad play
- feat(ui): desktop display-mode options row replacing browser fullscreen

STEP 5 - ACCEPTANCE:
- [ ] Mode persists and applies at startup; live toggle works; windowed restores
      remembered bounds; web/mobile fullscreen semantics byte-identical to before.
- [ ] Blocker starts only on real pad activity, stops on debounce/hidden/quit (each
      transition tested in the pure module).
- [ ] Doctrine pins + desktop-only-render pin green; M16 fills present; suites +
      gate_select green; smoke recorded.

STEP 6 - DOCS + MEMORY: progress.md; state.md inventory (store schema addition,
channels, settings/i18n keys, the fullscreen-reader audit result).

STEP 7 - FINAL RESPONSE: status, files, validation, reviewer verdicts, handoff line.

STOPPING RULES: stop and ask if replacing the desktop fullscreen toggle breaks a keybind
or mobile flow you cannot cleanly branch (the F11-style keybind, if one exists, must
keep working through the new path); stop if macOS fullscreen (its separate Space
semantics) behaves unacceptably with setFullScreen and needs simpleFullscreen instead;
that is a per-OS behavior decision to surface with evidence.
```
