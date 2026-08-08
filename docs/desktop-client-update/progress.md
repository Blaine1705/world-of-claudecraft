# Desktop Client Update: progress

## Status table

| Phase | Title | Status | Started | Completed |
|---|---|---|---|---|
| 1 | Electron runtime plumbing | done | 2026-08-08 | 2026-08-08 |
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

Phase 1: [x] electron 43.3.0 + electron-builder 26.15.7 moved via pnpm, lockfile
regenerated, vendor bundles re-verified; [x] codeCache:true on the app:// scheme with a
text-scan pin; [x] pack smoke recorded.

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

Phase 11: [ ] one-time asset seal re-mint over the branch's FINAL lockfile
(scripts/assets/remint_lockfile_fingerprints.mjs + digest sweep + media manifest +
polish provenance, 5-step order in commit 218de2db08; deferred from phase 1 by user
decision 2026-08-08, re-check after the phase 6 dep moves and every base merge);
[ ] qa-checklist.md matrix all green; [ ] full gate green; [ ] perf summary
(before/after across phases) written; [ ] deferred items surfaced; [ ] teardown offered.

## Notes per phase

Phase 1 (2026-08-08, commits fff0a2898e + 18da4ef8cc):
- Base merge of release/v0.36.0 (e5c16ca398, wiki v0.36 refresh) was trivial for this
  phase: guide/i18n/screenshots only, no electron/desktop files; suites re-run green
  before work anyway (26 files, 379 tests).
- electron 43.1.1 to 43.3.0, electron-builder family 26.15.6 to 26.15.7 (electron-builder,
  app-builder-lib, dmg-builder, electron-builder-squirrel-windows); lockfile diff fully
  accounted, no other package moved. Vendor bundles rebuilt byte-identical (sha256
  compared; note electron/vendor/ is gitignored, so git status cannot verify this,
  hash comparison is the method).
- codeCache:true pinned in tests/electron_scheme_privileges.test.ts: anchored to the
  app entry, comment-stripped, per-key explicit-true, exact key-set equality as
  deny-list; all four mutation dimensions verified killed.
- Pack smoke: linux-unpacked packaged and LAUNCHED; banner electron 43.3.0 /
  chrome 150.0.7871.212 / packaged website channel; gpu active renderer on the
  NVIDIA adapter via the PRIME relaunch path; child processes carry
  --code-cache-schemes=app (runtime proof of the privilege).
- privacy-security-review verdict PASS; its S1 (pin proximity gaps) fixed in the
  amended feat commit; its S2 recorded as the code-cache integrity tradeoff note in
  docs/desktop-release.md.
- Gate accounting (gate_select aborts twice, every step then proven individually):
  i18n artifacts + freshness green; malware green; biome green over the branch's
  true delta via --since=origin/release/v0.36.0 (default-base leg reds on
  pre-existing release-vs-main offenders, see state.md gotcha); typecheck +
  env/server/bot/client builds green (turbo 7/7); browser regressions green with
  BROWSER_PATH; vitest full suite (planner fell back on the lockfile change) green
  except the documented exception set below.
- SEAL DECISION (user, 2026-08-08): the dep bump moved pnpm-lock.yaml, which is a
  hashed input of all 7 asset source fingerprints, redding 8 asset suites (10
  tests: eastbrook x5 files, fenbridge, render_glb_replacement, terrorspark). The
  size-preserving re-mint (scripts/assets/remint_lockfile_fingerprints.mjs, 5-step
  order in commit 218de2db08) is DEFERRED to phase 11, one mint over the branch's
  final lockfile. Until then those 8 suites are the accepted per-phase gate
  exception; everything else must stay green. tests/profile_mode.test.mjs is
  environmental only (no system Chrome; green with BROWSER_PATH, see state.md).
