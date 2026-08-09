# Desktop Client Update: progress

## Status table

| Phase | Title | Status | Started | Completed |
|---|---|---|---|---|
| 1 | Electron runtime plumbing | done | 2026-08-08 | 2026-08-08 |
| 1 QA | Verify phase 1 | done | 2026-08-08 | 2026-08-08 |
| 2 | Shell startup and window polish | done | 2026-08-08 | 2026-08-08 |
| 2 QA | Verify phase 2 | done | 2026-08-08 | 2026-08-08 |
| 3 | Hybrid-GPU visibility | done | 2026-08-08 | 2026-08-08 |
| 3 QA | Verify phase 3 | done | 2026-08-08 | 2026-08-08 |
| 4 | Presentation lifecycle | done | 2026-08-08 | 2026-08-08 |
| 4 QA | Verify phase 4 | done | 2026-08-09 | 2026-08-09 |
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

Phase 4: [x] hidden-window render skip (render+paint skipped, sim/net keep running)
with a pure decision core and tests; [x] display/DPI change push -> pixel-ratio
re-resolve; [x] no-backlog-on-refocus evidence; [x] QA (verdict
PASS-WITH-FOLLOWUPS: 1 blocking + 10 should-fix fixed in-session, 1 should-fix
adjudicated to the ledger; 13/13 fresh mutations killed; evidence rerun green
on the merged tree with two new deterministic probe arms).

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
  existing key reworded, no placeholders; 15 locales pending for the release-time
  fill pass (QA correction: 21 locales minus en minus the five fills; the "16"
  first recorded here was a miscount). Generated artifacts regenerated via
  i18n:gen and committed.
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

Phase 3 QA (2026-08-08, verdict PASS-WITH-FOLLOWUPS, 0 blocking, all fixes landed
in-session; commits a6e7fb0a22 QA-start base merge of 1478f9d2ba, 30d8a4ad1e test
hardening, e1dd4a7798 honesty pass; tree clean, LOCAL-ONLY intact):
- QA-start base merge took release tip 1478f9d2ba (PR 2974 Seeker daily-rewards
  mobile CSS; no desktop, gpu, or world_api paths); post-merge re-run of the
  electron/desktop + gpu-notice suites plus world_api parity green (14 files,
  514 tests). i18n:gen re-run on the committed tree left git status clean
  (generated artifacts proven fresh) BEFORE any parallel agent shared the tree.
- Workflow audit in two runs (main run 26 agents, a continuation for the three
  agents lost to API connection errors, 13 agents; journal-first recovery, no
  resume-prefix gamble): six parallel auditors (correctness, test-coverage
  auditor, i18n, fresh privacy-security-review, fresh qa-checklist, fresh
  frontend-seam re-litigation), findings deduped at a barrier, then two
  independent adversarial skeptics per actionable finding (confirmed only when
  neither refutes; splits adjudicated by the orchestrator's own probes).
- 0 BLOCKING. Five CONFIRMED SHOULD-FIX, all test-decisiveness gaps, fixed in
  30d8a4ad1e: (1) the desktop_shell_integration composition line had no test at
  all (new tests/desktop_shell_integration.test.ts pins each piece once with
  the bridge, the relay-first order, and the no-bridge no-op); (2) the
  perf_nudge "sampled at check time" claim was satisfiable by an init-time
  snapshot (both memo tests now flip the predicate AFTER init, before the
  interval fires); (3) the live-window guard pin was proximity-based and
  polarity-blind (now pins the whole guarded statement plus a send count of
  one); (4) the renderer whitelist had no extra-field case (normalize pinned to
  the literal three-key set against a smuggling payload); (5) nothing pinned
  the display latch staying empty when a persisted dismissal hides the boot
  notice (pinned at the toast and in the second-boot round trip; the first
  round's "lost R16 pin" framing was skeptic-refuted, no such pin ever existed,
  but the orchestrator's probe confirmed the gap is real, so the pin is new,
  not restored).
- Re-litigation of the deliberately rejected displayed-latch finding (fresh
  frontend-seam-reviewer): verdict CONDITIONAL, rejection OUTCOME UPHELD, the
  armed-at-render latch stays. New fact both prior sides missed, confirmed by
  the orchestrator against perf_doctor and by two skeptics: the discrete
  suppression the latch feeds is UNREACHABLE in production wiring (perf_doctor
  emits 'integrated-gpu' only when !desktopShell, and a discrete verdict only
  exists in-shell), so the recorded rationale presented dead code as
  load-bearing. Honesty conditions landed in e1dd4a7798: the toast, view,
  analyzer, and pin comments now name the branch defense-in-depth,
  gpuNoticeDisplayed's contract line says "what the notice covered, not which
  body text the player read", and the analyzer's disproven "already forces the
  dGPU" premise is rewritten (the boot notice owns in-shell messaging; test
  title updated likewise). The re-litigator's two "reachable sibling"
  SHOULD-FIX filings (identical-body re-show on a component re-arm; the armed
  dismissal signature covering an unread component) were REFUTED by both
  skeptics as recorded deliberate design; RULING RECORDED HERE: both stay as
  designed, pinned by tests/gpu_notice_toast.test.ts and
  tests/desktop_gpu_status.test.ts.
- Ledger (a) CLOSED with a real-browser measurement (puppeteer-core over the
  Playwright Chromium against vite dev, both toasts forced): at the 440px cap
  the gpu-notice discrete body is 98px tall in English and 114px in ru_RU
  (162px at a 375px viewport) against a 56px slot offset, so a simultaneous
  pair overlaps 42 to 106px in every configuration. Reachability: the pair
  cannot co-occur today (the shell re-pushes only on a did-finish-load reload,
  which resets the page and the nudge with it; the boot-race revive resolves
  seconds before the nudge's first 30 s check), so this is a LATENT layout
  constraint, not a live defect. The stale shell.css "mutually exclusive by
  construction" comment was replaced with the measured numbers and the rule
  that any future mid-session verdict push (gpu-info-update or similar) must
  add a supersede or stacking story first. Neither stopping rule tripped: no
  trigger redesign and no layout work needed while the pair stays unreachable.
- Ledger (b) RESOLVED as a sound deferral, one step stronger than recorded: the
  stale perfNudge.integratedGpu claim is only false on desktop machines, where
  the arm never fires (the analyzer's web-only gate, pinned in
  tests/perf_doctor.test.ts); reword waits for the analyzer gate to change and
  takes the translated-in-the-same-change cost then. Ledger (c) VERIFIED:
  initDesktopShellIntegration runs at synchronous module scope behind the
  DESKTOP_APP guard with no async hop before the subscribe (noted for phase 7:
  the push has no replay, keep it synchronous). Ledger (d) VERIFIED
  self-healing and bounded to one re-nag per downgrade cycle.
- i18n auditor PASS: key placement beside its gpuNotice siblings, exactly five
  M16 fills each adding only the new key, no reword anywhere in the diff, S3
  guard, completeness, registry, and semantic-regression suites green;
  pending-locale count corrected 16 to 15 here and in state.md.
- Fresh privacy-security-review PASS (nothing above nice-to-have; the re-run
  after the agent loss delivered clean): whitelist and caps verified on both
  sides, no invoke surface, trustedSender ladder untouched, forged-bridge blast
  radius bounded to cosmetics. Fresh qa-checklist clean on seams, commits,
  dashes, and the anchor rule; its unreachable-suppression find became the
  center of the re-litigation.
- Orchestrator probe round on the committed tree, six NEW dimensions, 6/6
  killed with rc=1 and named failing tests: hidden-render latch merge;
  init-time predicate snapshot; dropped gpu composition call; normalize
  pass-through spread; guard polarity flip (the exact dodge the old pin
  allowed); relay-last reorder. Tree proven clean after every restore.
- Gate at e1dd4a7798 (BROWSER_PATH exported; biome defaultBranch pinned to the
  release branch for the run and reverted, never committed): i18n + wiki + sfx
  artifacts, freshness, malware, and biome legs green; vitest full-suite
  fallback red ONLY on the 8 accepted asset-seal suites (11 tests, phase 11
  re-mint deferral), 2374 files / 32685 tests otherwise green, and the
  usually-environmental browser leg PASSED this run with BROWSER_PATH set;
  post-vitest steps proven via turbo (check:types build:env build:server
  build:bot 5/5, build:bundle 3/3).
- New ledger entries (recorded, not fixed): memoDismissed's storage-fallback is
  currently unobservable through public behavior (verdict merges only grow, so
  every change re-arms regardless), kept as defense-in-depth with no test on
  purpose; initGpuNotice re-init leaks the prior instance's DOM node and
  languagechange listener (single call site today); the adapter string is dead
  data behind a comment-only do-not-log contract (phase 7 diagnostics-row
  candidate; note the perf reporter already ships unbucketed glRenderer, a
  pre-existing practice needing a maintainer decision); preload onGpuStatus
  allows unbounded re-subscription (renderer-local blast radius); the
  fleet-beacon integratedGpu dimension inherits the analyzer's !desktopShell
  gate, so hybrid-GPU desktop sessions are invisible to it (phase 7 follow-up
  alongside the GPU-force opt-out and the analyzer premise revisit).

Phase 4 (2026-08-08, commits 87b193e31b hidden skip, 7ac4d3dbf6 shell pushes,
26d89a3426 review hardening, 051aa455b0 allocation-free gating):
- Base merge was a no-op (release tip 1478f9d2ba unchanged since the phase 3 QA
  merge), so no suite re-run was owed to it.
- DESIGN FACT that reshaped the phase: the Electron BrowserWindow docs state
  that with backgroundThrottling disabled the Page Visibility API stays
  'visible' even while the window is minimized, occluded, or hidden, so the
  packet's document.hidden-keyed gate could never fire in the shell. The hidden
  signal is therefore a second push channel, 'desktop-presentation-changed'
  (payload { hidden } via electron/presentation_events.cjs), DERIVED at send
  time from mainWindow.isMinimized() || !mainWindow.isVisible() (the seam
  review's blocking finding killed the original event-latched boolean: one
  missed 'restore' would have frozen a VISIBLE window with no recovery short of
  a reload). Triggers: minimize/restore/hide/show plus 'focus' as the explicit
  self-heal, plus a did-finish-load re-push (no replay on the channel; reloads
  and crash-recovery pages must re-learn). The renderer latches it in
  src/game/desktop_presentation.ts (strict-boolean whitelist, drop-not-coerce)
  and the frame loop ORs it with document.hidden.
- The gate core src/game/presentation_gate.ts (registered in UI_PURE_CORES):
  graphicsRebuildPaused wins all-false; hidden plus desktopApp gives
  render:false paint:false tick:true (tick stays true so the net drain keeps
  running; skipping it would rebuild the July WS-backlog refocus freeze); web
  is all-true (rAF already pauses there, behavior unchanged). main.ts consumes
  it thinly: perf.frame gated on render with noteHiddenPresentSkip() on the
  else (unsampled hidden frames reproduce the web hidden-tab beacon shape),
  overlay sync on paint, renderer.sync threads present as its 7th argument,
  markInputVisible and perf.tick on render, the mainMs.renderer bucket times
  only rendered frames, and entryDiagnostics.renderedFrame runs UNCONDITIONALLY
  (a liveness breadcrumb the next launch reads as a load-failure report; a
  client launched minimized is alive, not stuck in scene build).
- renderer.sync keeps everything running while hidden (view lifecycle, mixers,
  uTime, viewport poll, drawStats.beginFrame) so refocus has no create burst or
  shader-link stall; only the terminal draw is skipped, extracted into the DI
  module src/render/frame_present.ts (registered in RENDER_PURE_CORES; on skip
  it still ages post.updateScreenFx, verified CPU-only, so flashes and ripples
  do not pop stale on restore). updateAdaptiveResolution is HELD while hidden:
  renderless wall-clock frames would read as free headroom and ratchet quality
  up for the first visible frame (the pacer-governor trap family).
- HUD: the seam review's other blocking finding, hud.update() gated whole
  parked audio a minimized player still hears (reconcileSfx is the sweep that
  unloops stale cast loops on interest-leave). hud.update(paint) now keeps the
  non-paint head (cast-loop sweep, idle-bark hygiene, both live-region flushes,
  quest voice, loot-roll timers) running on hidden frames and cuts before the
  paint sinks; the hidden path calls hud.update(false) untimed so mainMs.hud
  samples painted frames only. Pinned by an exact ordered head list plus
  below-cut assertions in tests/hud_update_drive.test.ts (shape pin; the live
  false-arm is covered by the E2E rig, and main.ts remains untestable by
  design). tutorial.update sits below the cut; verified benign, its only
  wall-clock use is the done-banner linger.
- Fleet beacon: the reporter's own hidden-send skip keys on visibilityState,
  which the shell pins at 'visible', so minimized desktop sessions would have
  beaconed fps collapses (last10s.fps 0, diluted fpsAvg). perf_reporter gained
  a shellHidden option wired to desktopPresentationHidden() and folds it into
  the same 'hidden' skip reason. DECLINED: putting hiddenPresentSkips into the
  beacon payload (new fleet-schema field with server implications, out of this
  phase's scope; with sends gated there are no hidden beacons to disambiguate).
- Display change: 'desktop-display-changed' wire payload is { scaleFactor }
  ONLY. The security review's least-privilege finding dropped displayId from
  the wire (a stable OS-derived identifier with zero renderer consumers); the
  { scaleFactor, displayId } reading stays main-process-side where
  shouldForwardDisplayChange dedups (id catches a same-scale monitor move).
  Triggers: screen 'display-metrics-changed' registered ONCE at app level
  (macOS activate re-create would stack per-window duplicates) and window
  'move' debounced 250 ms on the captured-win pattern ('moved' does not fire
  on Linux). Renderer side: desktop_display_change.ts validates the one-field
  whitelist and notifies with NO arguments; main.ts registers
  renderer.noteDisplayChanged() (resizeViewport, so applyResolution re-reads
  devicePixelRatio live), and src/render/dpr_watch.ts (matchMedia resolution
  re-arm) is composed in the renderer as the web fallback with teardown.
- Reviews: privacy-security-review PASS, 0 blocking (both should-fixes adopted:
  displayId off the wire, renderer-to-main ipcRenderer.send/ipcMain.on
  negatives on both channels; renderer-side coalesce declined, main-side
  debounce plus dedup bounds real pushes and a forged bridge already has script
  execution; module-scope screen require noted, all uses post-whenReady, pack
  smoke confirms in a later phase). frontend-seam-reviewer (fresh re-run after
  the first instance died to an API error): 2 blocking, 5 should-fix, 4 notes;
  both blockings and four should-fixes fixed in 26d89a3426; the real-Renderer
  governor-hold unit was declined as prohibitively heavy (the committed E2E rig
  covers threading; phase 5 owns the governor and restructures that seam).
  Notes accepted and recorded: the drawless-frame diagnostics tail (harmless
  now that no hidden beacons ship; forensics ingestion lives in the gated
  perf.tick), armory_preview and characters/preview secondary rAF loops still
  draw while hidden (follow-up: route through desktopPresentationHidden()),
  and the document.hidden OR-arm inherits Chromium occlusion semantics
  (judged gameplay-neutral, a fully occluded window is invisible anyway).
- Evidence (committed rig scripts/desktop_hidden_skip_probe.mjs, run against
  the dev stack with an Electron UA and shadowed document.hidden, which is
  faithful because the rig page stays actually visible so rAF keeps firing
  exactly like the shell): offline leg, skips 1 to 282 over 5 s hidden, perf
  frames frozen at 22, per-frame draws frozen at 202, sim time advanced 5.1 s,
  clean resume (draws 280, sampling resumed, zero page errors); online leg
  (user-space Postgres on :5433, server on :8787, vite restarted with
  VITE_DESKTOP_RELATIVE_API=1), skips 3 to 302, online.lastSnapAt advanced
  27312 to 32314 continuously while hidden (snapshots kept arriving, no
  refocus backlog), world mirror live, clean resume, zero page errors.
- Probe-rig gotchas for QA reruns: a desktop-classified page routes /api to the
  PRODUCTION origin, so the online leg needs vite restarted with
  VITE_DESKTOP_RELATIVE_API=1 (the mistake cost only a read-only project-stats
  GET against prod); register mode has a required email field (an empty one
  makes requestSubmit a silent native-validation no-op); character names
  reject digits (map them to letters).
- Mutation probes on the committed tree, 11/11 killed with rc=1 and named
  failing tests: gate hidden-arm render polarity; gate paused-arm tick; latch
  coerce-instead-of-validate; frame_present polarity inversion; derive || to
  &&; second display send site; wire payload displayId smuggle; hud cut
  deleted; paint sink hoisted above the cut; reporter shellHidden inversion;
  and present forced true at the offline sync site, killed by the E2E rig
  (named check "skips climb while hidden", mechanism: forcing the draw back on
  collapses the hidden frame rate under SwiftShader). That last kill is
  environment-sensitive (a fast GPU would keep the frame rate up); the
  sharpening candidate for QA is a renderer-side presented-frames counter,
  since every existing counter sits upstream of the sync argument.
- Gate at 051aa455b0 (BROWSER_PATH exported; biome defaultBranch pinned to the
  release branch for the run and reverted, never committed). The gate took four
  runs to converge, each failure real and fixed: run 1 red on a biome format
  diff in the new probe script; run 2 red on THREE suites beyond the accepted
  seal set, all caught by the full-suite fallback and all legitimate: the frame
  allocation guard (tests/client_frame_allocations.test.ts) rejected the
  per-frame gate-input literal (fixed by a hoisted reused input object plus
  frozen shared decision singletons in presentation_gate.ts and a reused
  presentFrame host refreshed per sync, post can be rebuilt mid-session), and
  the draw_stats_core and vfx source pins had drifted from the extraction
  (re-anchored: the adaptive-resolution step is present-gated behind
  beginFrame; the main-path prepareDraw-then-render order lives in
  frame_present, behaviorally pinned by its own suite, with the camera-pose
  invariant pinned at the presentFrame call site); run 3 red on the vfx pin's
  own formatting. Run 4 terminal: i18n + wiki + sfx artifacts, freshness,
  malware, and biome legs green; vitest full-suite fallback red ONLY on the 8
  accepted asset-seal suites (11 tests, phase 11 re-mint deferral), 2383
  files / 32746 tests otherwise green; post-vitest steps proven via turbo
  (check:types build:env build:server build:bot 5/5, build:bundle 3/3).
  Lesson recorded: the gate's full-suite fallback is the only thing that runs
  the frame-allocation and renderer source-pin suites, so a frame-loop change
  should run tests/client_frame_allocations.test.ts, tests/vfx.test.ts, and
  tests/draw_stats_core.test.ts in its targeted set up front.
- Ledger (recorded, not fixed): main.ts frame-loop threading is pinned by
  method-shape plus the E2E rig only (the coordinator has no unit seam);
  the updateAdaptiveResolution hold has no vitest pin (phase 5 owns it);
  armory/character preview loops draw while hidden; drawless-frame renderer
  diagnostics tail documented as accepted; hud.update SHAPE pin cannot catch a
  present-but-unreachable cut.

Phase 4 QA (2026-08-09, verdict PASS-WITH-FOLLOWUPS; commits 5f51bdc76d QA-start
base merge of 5819c005a7, 4281dc88f4 music fix, 90cc7f181b re-derive backstop,
59e0d7eb1f presented-frames counter, cd27f7f61a hidden-frame perf silence + F7
gates, ad8131bd48 threading/singleton pins, f436892a06 counter sink + panel
shell-awareness, db79708ba9 F7 gate pins, 9c6d6f1f6c pin re-anchors,
b393f17057 formatting; tree clean, LOCAL-ONLY intact):
- QA-start base merge was LARGE: release tip moved 1478f9d2ba to 5819c005a7
  (422 files, ~29k insertions, gate-perf CI train + warrior kit + anim PRs).
  Eight conflicts hand-reconciled; the load-bearing one was upstream PR #3153
  (browser hybrid-GPU notice) colliding with the phase 3 shell-verdict work:
  resolved by growing the component model to THREE components ('software',
  'discrete-inactive', 'hybrid') behind the one signature dismissal, with the
  v0.36.0 per-variant key woc_gpu_notice_hybrid_dismissed honored READ-ONLY as
  legacyHybridDismissed, per-OS hybrid bodies behind the object-input
  gpuNoticeBodyKey, hybrid passed through mergeShellGpuVerdict as a page-only
  input (the shell wire and its three-key whitelist are UNCHANGED), and
  softwareNoticeShown() widened to software-or-hybrid (upstream's suppression
  semantics; exact behavior preserved on both reachable domains since hybrid
  never fires in-shell and discrete-inactive never fires in-browser).
  src/main.ts: upstream rebuilt the world reveal into a revealWorld closure
  behind worldEntryGpuSettleCoverMs + beginBackgroundPreloads; the phase 4
  shellHidden reporter option was re-added by hand inside it (and is now
  pinned, F9). Seventeen cross-side type breaks fixed (upstream perf fixtures
  lacked hiddenPresentSkips; phase 3 suites lacked the new API fields).
  release-merge-audit: desktop-publish.yml derive greps intact under the new
  cache steps, createPerfMonitor(null, DESKTOP_APP) re-bound by upstream and
  source-pinned by their own suite, frozen install valid. TWO PREMISE NOTES:
  upstream pinned three@0.165.0 EXACT with a pnpm patch
  (patches/three@0.165.0.patch + tests/three_compile_async_patch.test.ts), so
  the phase 6 train must re-author or drop that patch and decide the pin
  style; and upstream landed an opt-in ?diagnostics perf panel +
  renderer_frame_telemetry_core per-phase timing, tooling phase 5 should use.
  Post-merge, before auditing: electron/desktop + presentation + gpu +
  parity + architecture suites green (67 files), full E2E probe both legs
  PASS on the merged tree.
- Workflow audit in two runs (run 1 lost three auditors to API errors plus its
  two custom-agentType auditors never calling StructuredOutput, and a
  workflow-script bug of the orchestrator's own; run 2 was a continuation off
  journal.jsonl re-running the lost three FRESH with the charters inlined, 28
  agents, zero losses): six parallel auditors (correctness, test-coverage
  auditor, fairness, electron/security, frontend-seam, qa-checklist), 22+21
  raw findings deduped at a barrier to 30, and TWO independent adversarial
  skeptics per actionable finding. All 12 actionable findings CONFIRMED by
  both skeptics (zero splits, zero refutes); orchestrator probes had
  independently pre-verified F1, F2, and F7 before the verdicts landed.
- F1 (the one BLOCKING, fairness): instanceMusic.update() sat below the
  hud.update(paint) cut, so a minimized player kept hearing the STALE track
  (combat music never ended, zone/boss changes never switched) while the
  audio kept playing. Fixed by hoisting the machine into the non-paint head
  on its same mediumHud band, storing the decision for the paint half; the
  head-list pin gains the call (4281dc88f4).
- Fixed SHOULD-FIX set: F2 a WM restore that emits none of
  minimize/restore/hide/show/focus left a visible window unpresented until
  the first click; the send helper now arms a 15 s re-derive interval while
  the derived reading is hidden (each tick re-reads the live window, disarms
  on visible/closed; whole-body pin updated + backstop pin). F4 the
  vitest-blind main.ts threading now has tests/desktop_presentation_threading
  .test.ts (AST-sliced frame() source pins) AND the sharpened E2E arm:
  renderer.presentedFrames() counts presentFrame's true returns DOWNSTREAM of
  the sync present argument, and the probe asserts it frozen-while-hidden /
  resuming-after (kills a forced present on ANY gpu; the old kill leaned on
  SwiftShader frame-rate collapse). F5 the start-minimized subscription
  ordering is pinned (top-level init statement) and the F2 backstop bounds a
  lost initial push. F6 the below-cut spot list gained the two proposal
  popups. F7 maybeShowImmobileNote, updateClickMoveMarker, spectateBadge
  .update, syncGroundAimReticle gated per-half with rationale;
  updateBreathBar DELIBERATELY ungated (client-side breath timer; gating
  would show a restored player more breath than they have); all five pinned.
  F8 the gate's frozen-singleton contract pinned by identity (toBe) +
  Object.isFrozen + web/desktop ALL_ON sharing. F9 the shellHidden line
  pinned inside the startPerfReporter call slice. F10 hidden frames were
  half-sampled (sim/events bucket rings kept filling); PerfMonitor gained a
  frameSampling switch the loop sets from the gate, making hidden frames
  perf-silent end to end (web hidden-tab parity; the tick-level fleet
  trackers stay behind gate.render under the same parity reading of rulings
  R5/R10: they were ungated by the woc_perf opt-in, not by visibility);
  probe now asserts sim-sample freeze AND resume. F11 hiddenPresentSkips
  gained its one live sink (a perf-overlay line at nonzero, pinned both
  directions) and the beacon EXCLUSION is pinned (the phase 4 declined
  decision upheld). F12 the merge-landed ?diagnostics panel keyed hidden
  handling on visibilityState (pinned 'visible' in-shell); it now baselines
  hiddenPresentSkips per collection and restarts the scan on a delta, the
  same semantics as its web tab-pause path.
- F3 ADJUDICATED to the ledger, not fixed (seam/qa/fairness filing, both
  skeptics confirmed the mechanics): the dungeon-finder and battleground
  proposal popups drive countdown/self-close from render() below the cut and
  freeze while hidden. Fixing would either put DOM writes above the cut or
  refactor an upstream-owned component; the harm is bounded to nothing a
  player can see (show + cue ride the ungated event drain, expiry is
  server-authoritative, and the first painted frame after restore rebuilds
  from the live snapshot). Pinned as DELIBERATE in the below-cut list.
- Re-litigations closed: (1) the paint cut was re-litigated call by call:
  F1 found and fixed, the popups pinned deliberate, tutorial.update's
  done-linger re-confirmed benign (F29). (2) The E2E threading kill was
  sharpened as recorded: presented-frames counter landed; the forced-present
  mutation now dies on THREE probe arms including the deterministic
  presented 63->91-while-hidden. (3) The declined real-Renderer
  governor-hold unit stays DEFERRED to phase 5 (which owns and restructures
  that seam); the survivor dimension is documented in the mutation notes.
- Probe rounds on the committed tree: 12/12 fresh vitest mutations KILLED
  rc=1 with named failing tests (gate hidden-arm tick, precedence swap,
  fresh-literal singleton, screen-fx aging drop, music re-paint-gated,
  backstop deletion, shellHidden deletion, sampling-switch deletion,
  finishTime gate deletion, overlay line suppression, panel restart
  deletion, immobile-note gate deletion; every mutation restored and status
  clean between runs), plus the forced-present E2E mutation killed on three
  arms. None repeat the 11 in-phase kills.
- Evidence rerun: scripts/desktop_hidden_skip_probe.mjs full run (offline +
  online legs; user-space zonky PG16 on :5433 torn down after, vite under
  VITE_DESKTOP_RELATIVE_API=1) PASS on the merged tree BEFORE fixes and PASS
  after with the two new deterministic arms (presented frozen 58->58 hidden
  then 65 resumed; sim bucket samples frozen 74->74 then 98 resumed; online
  snapshots kept arriving 21129->26141 while hidden, no backlog).
- Gate: run 1 red on changed-files biome (formatting on the merge-authored
  gpu-notice test files; fixed in b393f17057). Run 2: i18n + wiki + sfx
  artifacts, freshness, malware, and biome legs green; vitest full-suite
  fallback (forced by the lockfile-touching merge) red ONLY on the 8
  accepted asset-seal suites (11 tests, phase 11 re-mint deferral), 2415
  files / 33162 tests otherwise green; post-vitest steps proven via turbo
  (check:types build:env build:server build:bot 5/5, build:bundle 3/3);
  biome defaultBranch pinned to the release branch for the run, reverted,
  and PROVEN never committed (per-commit stat sweep).
- New ledger from the NOTE/NICE tiers (recorded, not fixed): the first
  post-refocus report window still spans hidden wall-clock (F19, fps
  dilution bounded by the overlay denominator; a window reset on un-hide is
  a phase 5/7 candidate); a display push arriving before the renderer
  registers its target is dropped and then deduped shell-side until the
  reading changes (F20, self-heals on any real change; boot re-reads DPR
  anyway); entryDiagnostics.renderedFrame does not run on paused
  (graphicsRebuildPaused) or no-tick frames, so 'unconditional' means
  per-executed-frame (F21); setDisplayChangeTarget keeps a process-lifetime
  renderer reference (F22, renderer is a singleton today); the
  display_events clamp comment overstates renderer consumption (F23);
  presentation handlers read module-level mainWindow while the move handler
  uses the captured win (F24, equivalent while single-window);
  desktop-publish NuGet cache key is version-blind (F25); the hud cut scan
  reads the whole file not the method span (F26, single-occurrence pin
  bounds it); the probe registers throwaway accounts with a hardcoded
  password (F28, local rig only). NICE tier carried: dpr_watch silent-death
  modes (F13), preload forwards the raw payload object (F14), vfx camera
  pin polarity notes (F15), name-specific no-latch negative (F16),
  perf_reporter === true / hook-absent arms unexercised (F17),
  boot-while-minimized voids the GPU settle cover and records a
  never-presented first paint (F18, upstream-owned reveal path). Carried
  from phase 4 unchanged: armory/characters preview rAF loops draw while
  hidden; occlusion OR-arm semantics; the governor hold has no vitest pin
  (phase 5 owns it).
- Stopping rules: neither tripped. Event queues cannot grow while hidden
  (drainEvents + netPipeline.onAnimationFrame proven outside every gate arm
  by the correctness auditor AND live online evidence); no visible-window
  skip survives an interaction (derive + focus self-heal confirmed on the
  committed triggers, and the F2 backstop now bounds even the no-event WM
  case to 15 s).
