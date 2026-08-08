# Desktop Client Update: progress

## Status table

| Phase | Title | Status | Started | Completed |
|---|---|---|---|---|
| 1 | Electron runtime plumbing | done | 2026-08-08 | 2026-08-08 |
| 1 QA | Verify phase 1 | done | 2026-08-08 | 2026-08-08 |
| 2 | Shell startup and window polish | done | 2026-08-08 | 2026-08-08 |
| 2 QA | Verify phase 2 | done | 2026-08-08 | 2026-08-08 |
| 3 | Hybrid-GPU visibility | done | 2026-08-08 | 2026-08-08 |
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

Phase 2: [x] show:false + ready-to-show with a safety-show fallback; [x] second
instance focuses/restores the window (deep-link path unchanged); [x] application menu
nulled on Win/Linux before ready, macOS default menu kept; [x] DESKTOP_VERSION derived
or pinned to package.json with a test (derived, plus the equality pin).

Phase 3: [x] desktop-gpu-status push channel (main verdict -> renderer); [x] gpu notice
triggers off the shell verdict, discrete-inactive body added (M16 fills); [x] ipc pins
updated; [x] web/mobile unaffected (feature-checked).

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

Phase 1 QA (2026-08-08, verdict PASS-WITH-FOLLOWUPS, all findings fixed same day):
- QA-start base merge 4ccfc41805 (origin/release/v0.36.0 at 81804a179e, wiki v0.36
  round2): guide/i18n/screenshot files only, no electron/desktop/package surface;
  electron plus desktop suites (27 files) and tsc re-verified green at that HEAD.
- Audit ran as a workflow: context loader, then parallel correctness / pin-quality
  (test-coverage-auditor) / qa-checklist auditors, then an exclusive real-file
  mutation probe plus a vendor regen probe, then two adversarial skeptics per
  finding. One infrastructure note: the first correctness agent died on an API
  connection error; its charter was re-covered by the qa-checklist agent's
  independent verification plus a lite re-verifier in the continuation run.
- Independently re-confirmed (not trusted from phase 1 prose): node_modules resolve
  electron 43.3.0 / electron-builder 26.15.7 / app-builder-lib 26.15.7; lockfile
  diff moves only the electron plus electron-builder family; exactly one
  registerSchemesAsPrivileged call with codeCache inside the app privileges object;
  pack smoke banner in main.log (electron 43.3.0, chrome 150.0.7871.212, packaged,
  PRIME relaunch) and the profile's Code Cache/js populated on disk (96K in js, 228K
  whole Code Cache dir), which is stronger runtime proof than the recorded
  --code-cache-schemes flag; phase 1's four mutation kills re-run for real (each
  red with the named failing test, restore green each time).
- Vendor bundles: no baseline hashes were recorded in phase 1, so byte-identity was
  unverifiable as written (finding). Closed two ways: regen stability proven
  (re-running scripts/electron-vendor.mjs reproduced identical bytes) and the sha256
  baselines are now recorded in state.md's inventory.
- Findings: 0 BLOCKING; 5 SHOULD-FIX, all fixed: two pin gaps in the new test (a
  second privileged scheme could ride in beside the app entry unpinned; call
  position unpinned although Electron only honors the call before app ready), the
  stale phase-1 ledger (docs commit and base merge unrecorded), the unfalsifiable
  vendor claim (baselines now recorded), and the phase file's impossible
  git-status vendor instruction (now the hash recipe). Plus block-comment,
  trailing-comment, substring-value, and quoted-key stripping/scanning holes folded
  into the same test hardening (commit 042ba0a766).
- Hardened pin re-verified with an 11-dimension mutation matrix on the real files
  (drop, flip-false, line-comment, extra privilege, block-comment, second scheme
  entry, non-top-level call, ready-ordering decoy, quoted key, value expression,
  trailing comment): all KILLED with named failing tests, final rerun green, tree
  restored clean each round.
- Gate at QA HEAD (BROWSER_PATH exported, biome defaultBranch pinned for the run
  and reverted, never committed): i18n + wiki + sfx artifacts, i18n freshness,
  malware, and biome changed-files all green; vitest full suite (planner fell back
  on the lockfile) red ONLY on the 8 accepted asset-seal suites, every failure a
  sourceFingerprint/hash mismatch; typecheck + env/server/bot builds and the
  client build green via turbo after the vitest abort. Count correction to the
  phase 1 note: the accepted seal red set is 11 tests across those 8 suites, not
  10; nothing asset-relevant changed since phase 1, so the phase 1 figure was a
  miscount of the same set. Electron + desktop suites 27 files / 381 tests green
  and tsc clean at the final QA commits.

Phase 2 (2026-08-08, commits 2eb2c45356 menu + 82b040f5a5 show + b6d6a1900e focus +
7ed6a6fac4 version):
- Base merge: origin/release/v0.36.0 was already merged at phase start (the phase 1 QA
  base merge had taken 81804a179e, still the release tip); trivial no-op, no suite
  re-run required.
- show:false + ready-to-show + a 4000 ms logged fallback (READY_TO_SHOW_FALLBACK_MS in
  electron/main.cjs). The show helpers act on a captured window instance, so a stale
  timer can never touch a successor window. Verified BEFORE implementation that crash
  recovery reloads the same webContents and nothing calls hide(), so the change cannot
  re-hide a shown window on the crash path.
- focusMainWindow() dedupes the restore+focus sites (login deep link, wallet deep link,
  second-instance) and also reveals a still-hidden window, because deep links and second
  launches can arrive during the pre-paint hidden phase; app 'activate' with a live
  window now routes through it too (a dock click during the hidden phase used to no-op).
- Menu.setApplicationMenu(null) at module scope behind a win32/linux allowlist; the
  per-window setMenu(null) is gone. macOS behavior is UNCHANGED: setMenu was already a
  no-op there, the default menu was present before and after (the implementer report
  claimed a macOS behavior change; checked against the Electron API surface and wrong).
- DESKTOP_VERSION now derives from package.json through the existing __APP_VERSION__
  define. Probe-verified the define IS applied under vitest (the "no Vite define"
  comment in tests/app_version.test.ts is about the standalone browser config only).
  scripts/release_version.mjs dropped its desktop-module arm in the same change (its
  check/prepare would otherwise throw on the vanished literal at the next release), and
  the hidden CI coupling the version agent found, a literal grep in
  .github/workflows/desktop-publish.yml that would have failed every publish, became a
  pair of derive-mechanism greps (tag pushes never run the vitest pin, so the workflow
  keeps its own guard). New pins: module version equals package.json read fresh from
  disk, not-the-'0.0.0'-fallback, and the real index.html/play.html hrefs cross-checked
  against the module for every platform link (play.html's deliberate no-Linux exemption
  pinned too).
- privacy-security-review (fresh agent, coverage prompt): 0 blocking, 3 should-fix, 4
  nits. All three should-fix and three of the nits fixed in-session pre-commit (hidden
  window focus, activate no-op, workflow guard, captured instance, fallback-naming pin,
  exact call-site count). Deferred: a build-output check that dist never ships the
  '0.0.0' define fallback; candidate for phase 11 alongside the seal re-mint.
- Validation at final HEAD: electron+desktop+version suites 31 files / 429 tests green;
  tsc clean; biome clean over the true delta plus the new pin file checked explicitly
  (untracked files escape --changed sweeps). The electron implementer mutation-probed
  its pins before handoff: 12/12 killed on backed-up copies, tree restored byte-clean.
- Pack smoke at final HEAD (linux-unpacked, PRIME relaunch): banner electron 43.3.0;
  ZERO ready-to-show fallback lines in a fresh main.log, so the window came up via the
  intended path; a second launch exited into the single-instance lock in 109 ms; zero
  exceptions; teardown clean. Focus movement itself is visual-only and rests on the
  pins.
- Gate at final HEAD (BROWSER_PATH exported; biome defaultBranch pinned to the release
  branch for the run and reverted, never committed): i18n + wiki + sfx artifacts, i18n
  freshness, malware, and biome changed-files all green; the vitest full-suite fallback
  (42 changed paths, planner fell back on biome.json/package.json/pnpm-lock.yaml) red
  ONLY on the 8 accepted asset-seal suites (11 tests, every failure a fingerprint
  mismatch, phase 11 re-mint deferral); typecheck + env/server/bot builds and the
  client bundle proven green via turbo after the vitest abort.

Phase 2 QA (2026-08-08, fix commit 97e5305a14):
- QA-start base merge 094f6facbc took origin/release/v0.36.0 tip 4d52f151eb (PR 3161
  client-perf train: 53 files, all render/game/tests plus turbo.json; no electron,
  package.json, or lockfile paths). Electron+desktop+version suites re-run green
  post-merge (30 files, 418 tests) and tsc clean before the audit began; every phase 2
  audit file byte-identical between 3e9a87b8e2 and the merged HEAD.
- Deterministic Workflow audit: five parallel audit agents (correctness,
  test-coverage-auditor pin quality, dead-code, fresh privacy-security-review,
  qa-checklist per the dispatch matrix), every BLOCKING or SHOULD-FIX finding then
  verified by two independent skeptics (code-behavior lens and premise-evidence lens),
  then one exclusive 13-mutation probe on the committed tree. 16 agents, zero losses,
  zero empty reports.
- Verdict: 0 BLOCKING. The four SHOULD-FIX filings collapsed to ONE confirmed defect
  cluster: the desktop-publish.yml derive-mechanism greps (the W3 review fix) were
  satisfiable by the __APP_VERSION__ token surviving in the module's explanatory
  comment or type-only declare after a hardcode revert, and the lockstep block had no
  test coverage at all (both skeptics independently reproduced the vacuous grep). A
  fifth filing (the vitest residual: hardcoding the CURRENT version passes the equality
  pin today) was refuted by both skeptics as the registered division of labor, sound
  only while the workflow backstop holds, which the fix below restores.
- Fix (97e5305a14): both workflow greps anchored on the load-bearing expressions
  ("DESKTOP_VERSION = typeof __APP_VERSION__" in the module, "__APP_VERSION__:
  JSON.stringify(appVersion)" in vite.config.ts, grep -qF), and the new
  tests/desktop_publish_guard.test.ts extracts the exact patterns from the workflow
  and executes them through real grep in both directions: they must match the live
  tree and must reject a mechanism-dead revert fixture that keeps the bare token in a
  comment and a declare. The live-tree arm also makes a module hardcode red on every
  vitest run, not only at the next version bump.
- Mutation probe on the committed tree: 12/13 KILLED with rc!=0 plus named failing
  tests; M12 (hardcode to the current version value) SURVIVED-BY-DESIGN pre-fix
  exactly as predicted and was re-probed KILLED after 97e5305a14 (the guard test's
  live-tree arm names the failure). Tree byte-clean after every restore and at the
  end, verified independently of the probe agent.
- Correctness re-verification: all five charter premises confirmed against real code.
  Crash recovery reloads the same webContents and can never strand a hidden window
  (every crash_guard arm traced, including dialog-quit and app.exit paths); parked
  login/wallet codes are recovered by the trustedSender-gated pull on all three
  deep-link arrival paths; activate recreation arms its own captured win, timer,
  once-listener, and crash guard, and a stale timer no-ops via the captured
  isDestroyed check; the menu allowlist is exact with macOS truly unchanged; the
  version chain is build-time only and the no-JS hrefs are consistent on every
  platform link.
- NICE-TO-HAVE ledger (recorded, not fixed): deliver helpers send without an
  isDestroyed guard (pre-existing pattern, almost certainly unreachable); the crash
  dialog can parent to a still-hidden window for up to 4 s; second-instance reveal
  fires before any deep-link validation and the login code is shape-unvalidated
  unlike the wallet path (pre-existing reveal semantics, W1-intended); pin-hardening
  nits in electron_shell_startup.test.ts (unscoped captured-win pin, arm-blind
  activate pin, one constant-true darwin assertion, unpinned fallback polarity,
  hand-rolled slice anchors) and its comment-strip regex fragility;
  ELECTRON-DESKTOP-AUDIT.md still presents setMenu(null) as current hardening (that
  doc already carries known-stale claims); bare __APP_VERSION__ reads in src/main.ts
  and src/game/perf_reporter.ts (release-owned surface, outside this packet). The
  frontend-seam-reviewer skip was judged correct on substance (constant derivation,
  no HUD surface) and is recorded here as the reasoned skip the matrix row demands.
- NEW PHASE 11 ITEMS from this QA: (1) one win32 (or wine/CI) launch-log check that
  the module-scope pre-ready Menu.setApplicationMenu(null) path boots clean (only
  linux is smoke-proven today); (2) design the registered I4 dist grep so a
  dist-based version assertion subsumes both the '0.0.0'-fallback check and
  download-page staleness.
- Gate at final HEAD (BROWSER_PATH exported; biome defaultBranch pinned to the
  release branch for the run and reverted, never committed): i18n + wiki + sfx
  artifacts, i18n freshness, malware, and biome changed-files all green; the vitest
  full-suite fallback (43 changed paths) red ONLY on the 8 accepted asset-seal suites
  (11 tests, phase 11 re-mint deferral); check:types (the base merge's turbo.json
  renamed typecheck) + env/server/bot builds and the client bundle proven green via
  turbo after the vitest abort. Post-fix affected set 33 files / 446 tests green with
  the exit code captured, not piped away.

Phase 3 (2026-08-08, commits 89c5003ddb electron + 57ca3a7bc3 renderer + 3fd5f7a4c2
review hardening):
- Base merge was a no-op (release/v0.36.0 unchanged since the phase 2 QA merge of
  4d52f151eb), so no suite re-run was owed to it.
- Main pushes its GPU verdict on the new push-only channel 'desktop-gpu-status' from
  the logGpuStatus flow, with the send placed BEFORE the log dedup early-return: a
  crash-recovery reload usually reproduces an identical reading, and a send behind
  the dedup would never reach the fresh page. Payload is built by the new pure
  reducer electron/gpu_status_events.cjs (booleans coerced with === true, adapter
  sliced to 64, whitelist-only; .d.cts sibling), softwareRendering is the OR of
  aux.softwareRendering and isSoftwareRenderer(featureStatus). Correction to the
  phase file: isSoftwareRenderer lives in electron/shell_guards.cjs, not
  gpu_preference.cjs. gpu_preference.cjs behavior untouched (the opt-out lever is
  phase 7).
- Preload onGpuStatus mirrors the onUpdateEvent guards (no-op unsubscribe on a
  non-function, payload shape check on all three fields, removeListener closure).
  tests/electron_ipc_channels.test.ts gains the channel (sorts first) and the bridge
  method; new tests/electron_gpu_status_events.test.ts covers the reducer and new
  tests/electron_gpu_push.test.ts pins the .on (not .once) did-finish-load binding,
  the send-before-dedup ORDER, the reducer require, the live-window guard, and the
  push-only negatives (no invoke, no ipcMain.handle). House trap learned: the channel
  literal must sit on the same line as webContents.send( for the ipc-channels regex.
- Renderer: optional DesktopBridge.onGpuStatus (older shells feature-checked), new
  src/game/desktop_gpu_status.ts (normalize + latch + forward; payloads missing
  either boolean are DROPPED, not coerced), composed in initDesktopShellIntegration,
  whose module-scope timing guarantees the subscription exists before did-finish-load
  can fire (the push has no replay; a lazy subscriber would miss it, noted for
  phase 7 if anything ever subscribes late). The toast supports both race orders:
  verdict-before-init folds the module-scope shellVerdict at init, init-before-verdict
  re-resolves and builds the DOM lazily. Dismissal is now a component signature under
  the unchanged key woc_gpu_notice_dismissed ('' | 'discrete-inactive' | 'software' |
  'discrete-inactive,software'); the shipped legacy '1' parses as a software
  dismissal; a verdict shrinking to a subset stays hidden, a new component re-arms.
- i18n: one new key gpuNotice.bodyDiscreteInactive (English + the five M16 non-Latin
  fills zh_CN/zh_TW/ja_JP/ko_KR/ru_RU, placed with their gpuNotice siblings); no
  existing key reworded, no placeholders; 16 locales pending for the release-time
  fill pass. Generated artifacts regenerated via i18n:gen and committed.
- perf_nudge: the integratedGpu arm is suppressed by the new discreteNoticeShown()
  exposure, sampled (like softwareNoticeShown) inside the 30 s check, so a late shell
  verdict is still seen; softwareNoticeShown() remains software-only (R16 preserved).
- Reviews: privacy-security-review PASS (0 findings above info; its three actionable
  notes fixed in 3fd5f7a4c2: renderer-side 64-char adapter cap, length-bounded
  signature parse, and an honest do-not-log adapter comment in runtime.ts).
  frontend-seam-reviewer PASS-WITH-FOLLOWUPS, 0 blocking: its languagechange pin gap
  is closed by the new tests/gpu_notice_toast.test.ts (no binding on a never-shown
  session, no resurrect on locale flip after dismissal, spy-counted); its
  displayed-latch SHOULD-FIX was REJECTED deliberately and pinned as intended
  behavior: when both components arm, the software body carries the identical remedy,
  so the integrated-GPU nudge stays suppressed rather than surfacing copy that
  claims the shell picked the gaming GPU (false on that machine); the both-armed
  shape is exactly the post-crash WARP flip. Phase 3 QA should re-litigate this with
  fresh eyes.
- Mutation probes on the committed tree, 9/9 killed with rc=1 and named failing
  tests: send relocated past the dedup; adapter cap removed (main side); legacy '1'
  parse emptied; coverage every->some; shell-verdict forward dropped; discrete
  exposure reading the wrong field; body precedence flipped; renderer-side cap
  removed; parse bound removed. Tree proven clean after every restore.
- Gate at 57ca3a7bc3 (BROWSER_PATH exported): i18n + wiki + sfx artifacts, i18n
  freshness, malware, and biome changed-files green; vitest full-suite fallback
  (lockfile) red ONLY on the 8 accepted asset-seal suites (11 tests, phase 11
  re-mint deferral), 2372 files / 32674 tests otherwise green; post-vitest steps
  proven via turbo (check:types build:env build:server build:bot 5/5, build:bundle
  3/3). The hardening commit re-ran its six touched suites (66 tests) + tsc + biome.
- Ledger (recorded, not fixed): the shell.css comment claiming the gpu notice and
  perf nudge are mutually exclusive by construction is stale (a late shell verdict
  can put both up; slots are separate fixed positions, but measure the discrete body
  height at 440px width, longest copy, taller in ru_RU: phase 3 QA); the
  perfNudge.integratedGpu copy still claims the desktop app picks the gaming GPU
  automatically (reword requires the translated-in-the-same-change pass);
  downgrade-to-older-client re-nags once (signature unknown to the old '1' check,
  accepted, self-healing); initGpuNotice's boolean return is test-facing only;
  screenshots deferred to PR time per the LOCAL-ONLY rule (capture on LOW preset).
