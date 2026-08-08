# Desktop Client Update: progress

## Status table

| Phase | Title | Status | Started | Completed |
|---|---|---|---|---|
| 1 | Electron runtime plumbing | not started | | |
| 1 QA | Verify phase 1 | not started | | |
| 2 | Shell startup and window polish | not started | | |
| 2 QA | Verify phase 2 | not started | | |
| 3 | Hybrid-GPU visibility | not started | | |
| 3 QA | Verify phase 3 | not started | | |
| 4 | Presentation lifecycle | not started | | |
| 4 QA | Verify phase 4 | not started | | |
| 5 | Governor and LOW tier | not started | | |
| 5 QA | Verify phase 5 | not started | | |
| 6 | three.js 0.185 train | not started | | |
| 6 QA | Verify phase 6 | not started | | |
| 7 | Desktop prefs store and window memory | not started | | |
| 7 QA | Verify phase 7 | not started | | |
| 8 | Display modes and power | not started | | |
| 8 QA | Verify phase 8 | not started | | |
| 9 | Notifications and what's new | not started | | |
| 9 QA | Verify phase 9 | not started | | |
| 10 | Discord Rich Presence | not started | | |
| 10 QA | Verify phase 10 | not started | | |
| 11 | Final integration QA | not started | | |

## Per-phase deliverable checklists

Phase 1: [ ] electron 43.3.0 + electron-builder 26.15.7 moved via pnpm, lockfile
regenerated, vendor bundles re-verified; [ ] codeCache:true on the app:// scheme with a
text-scan pin; [ ] pack smoke recorded.

Phase 2: [ ] show:false + ready-to-show with a safety-show fallback; [ ] second
instance focuses/restores the window (deep-link path unchanged); [ ] application menu
nulled on Win/Linux before ready, macOS default menu kept; [ ] DESKTOP_VERSION derived
or pinned to package.json with a test.

Phase 3: [ ] desktop-gpu-status push channel (main verdict -> renderer); [ ] gpu notice
triggers off the shell verdict, discrete-inactive body added (M16 fills); [ ] ipc pins
updated; [ ] web/mobile unaffected (feature-checked).

Phase 4: [ ] hidden-window render skip (render+paint skipped, sim/net keep running)
with a pure decision core and tests; [ ] display/DPI change push -> pixel-ratio
re-resolve; [ ] no-backlog-on-refocus evidence.

Phase 5: [ ] recovery-ladder stall fixed with a reproducing test; [ ] LOW monotonicity
retune (bands, caps, floors, radius, lowPlus gating) with per-axis pins; [ ] perf
evidence LOW <= MEDIUM load at baseline and floors.

Phase 6: [ ] pre-upgrade perf baseline frozen + reference screenshots; [ ] three
0.185.1 + postprocessing 6.39.4 + n8ao 2.0.0 compile and all suites green; [ ] the
migration action list from brainstorm.md walked item by item; [ ] shader-error smoke
pass clean; [ ] perf/visual comparison recorded (QA gates it).

Phase 7: [ ] electron/desktop_prefs.cjs store (atomic, corrupt-tolerant, Node-tested);
[ ] bounds + display persistence with on-screen validation; [ ] GPU-force opt-out
setting wired through the store (options doctrine row + bridge).

Phase 8: [ ] display-mode option (borderless fullscreen / windowed) via the options
doctrine, desktop-only visibility, reconciled with the existing fullscreen setting;
[ ] gamepad-active powerSaveBlocker with debounce and tests.

Phase 9: [ ] OS notifications for update-ready and party-invite-while-unfocused
(renderer-rendered strings, validated + rate-limited channel, focus-gated); [ ] what's
new t()-keyed link on the ready toast; [ ] string contract pins.

Phase 10: [ ] empirical SET_ACTIVITY gate probe recorded; [ ] pure frame codec module +
socket manager (main), never blocks boot, backoff on absence; [ ] renderer activity
assembly (localized, 15s coalesced, no-op dedup) + options toggle; [ ] pins for codec,
channel, and absence behavior.

Phase 11: [ ] qa-checklist.md matrix all green; [ ] full gate green; [ ] perf summary
(before/after across phases) written; [ ] deferred items surfaced; [ ] teardown offered.

## Notes per phase

(append as phases complete)
