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
| 5 | Governor and LOW tier | done | 2026-08-09 | 2026-08-09 |
| 5 QA | Verify phase 5 | done | 2026-08-09 | 2026-08-09 |
| 6 | three.js 0.185 train | done | 2026-08-09 | 2026-08-09 |
| 6 QA | Verify phase 6 | done | 2026-08-09 | 2026-08-10 |
| interim | Base reconcile onto release/v0.38.0 + plan refresh | done | 2026-08-13 | 2026-08-13 |
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

Phase 5: [x] recovery-ladder stall fixed with a reproducing test (red pre-fix, the
canRecover/canEnrich split, resolution at the end of phase A); [x] LOW monotonicity
retune (bands, caps, floors, radius, lowPlus gating, plus point lights, vfx level,
the dressing trio and the dormant characters floor) with per-axis pins; [x] perf
evidence LOW <= MEDIUM frame cost and calls on every scenario (town triangles
attributed structural, see the notes); [x] QA (verdict PASS-WITH-FOLLOWUPS, 0
blocking in the shipped code; 5 confirmed should-fix all fixed in-session, 3 probe
gaps closed with mutation-verified pins, both re-litigations UPHELD, two
pre-existing stopping-rule shapes surfaced to the user; see the QA note).

Phase 6: [x] pre-upgrade perf baseline frozen + reference screenshots; [x] three
0.185.1 + postprocessing 6.39.4 + n8ao 2.0.0 compile and all suites green; [x] the
migration action list from brainstorm.md walked item by item (workflow audit, every
no-hit adversarially verified); [x] shader-error smoke pass clean (after it caught
and the phase fixed the r185 vColor vec4 break); [x] perf/visual comparison recorded
(QA gates it; low-tier open-run/combat regression flagged, r181 pairs saved).

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

### Phase 5 (2026-08-09, governor recovery ladder + LOW monotonicity)

- Base merge: no-op (release tip 5819c005a7 was already absorbed by the phase 4 QA
  merge). Both residual verdicts were RE-VERIFIED on the merged tree before any code
  (Explore agent report plus main-session spot-checks of recover(), canRecover,
  CAPS_BY_TIER, the lowPlus gate site and both test suites).
- Commits: ec3a8d8054 (style-only reformat of tests/render_budget.test.ts, which was
  format-dirty at HEAD, kept separate so the fix diff stays readable), 5a04133a49
  ladder fix, 4fe929d002 LOW retune + lowPlus gate, 0d24d50e9b dense-scene pin,
  9e93468778 dressing richness fix, 281a0a29ca seam-review hardening, 1fad312836
  screenshots.
- Ladder mechanism: canRecover keeps only the measured-headroom clauses and gates all
  recovery plus stableSeconds; the three counter clauses moved to canEnrich, gating
  only the climb above baseline; recover(maxRenderScale, allowAboveBaseline) is
  phase A (grass, lighting, vfx, foliage to baseline, then resolution) then phase B
  (band maxima). The reproducing test failed pre-fix exactly as predicted (resolution
  stuck at the 0.7 floor across 260 full-headroom frames); the old recovers-slowly
  pin was constant-true (12 frames never reached recoverStableSeconds and >= passes
  with no recovery) and is now a strict-increase second repro at 60 frames.
- The phase 4 governor-hold ledger debt is CLOSED: the threading suite pins
  this.updateAdaptiveResolution( to exactly one occurrence whose whole containing
  statement is the present-guarded form (polarity included).
- Deliberate semantics change, pinned: dense frames no longer reset stableSeconds, so
  one frame under the 90% counter line at a fire slot permits ONE enrich step.
  [QA correction: the rate bound is the stableSeconds reset on each fired step plus
  the recoverStableSeconds recharge (6s low); the 1.5x cooldown, 1.65s low, never
  binds, and the at-slot re-check only picks which frame fires, so repeated dips
  walk to the band maxima at one step per recharge window.] Comment in canEnrich
  names it.
- LOW derivation rule (recorded per the packet): band baseline and max are mediums
  x 0.95 rounded to 2 decimals, band minima and caps floors EQUAL mediums, caps are
  mediums x 0.9 rounded clean, grassRadius 80 -> 72 against mediums 76.
  Derived axes: effective point lights 6 -> 4 (equal medium), vfx
  quality 1.0 -> 0.76, effective baseline grass ring 72.0 -> 53.28 vs mediums 59.28.
- lowPlus gate (recorded per the packet): iosMemoryProfile || (tier === low AND
  classifyGpuRenderer(hints.gpuRenderer) in {weak, software}). No second regex set;
  undefined/masked adapters land on plain low. Pins: plain and no-adapter negative,
  weak-Intel and SwiftShader positive, mediumIris negative, iOS arm positive.
- Ground dressing: the richness trio (step 10 vs 12, density 1.24, spot boost 1.08,
  the July-investigation 1.79x) rode leanFoliage and now rides lowPlus;
  tests/foliage_dressing_profile.test.ts pins medium parity by deep equality plus
  the cohort split and the boost ratio band. [QA additions: the terrain lowShade
  emissive treatment also rides lowPlus (terrain.ts lowShade requires GFX.lowPlus)
  and changed cohort with the same gate, considered in the gate-site comment but
  unrecorded here until now; and the iosMemoryProfile arm of lowPlus means iOS
  sessions opted UP to medium or high silently GAINED the trio, an unmeasured
  cosmetic gain recorded as a known consequence, not a defect.]
- tests/foliage_perceptual_density.test.ts re-derived: the old 0.7-0.9 band measured
  ring-edge cull alignment, not thinning (at radius 72 those chunks are never
  built); the new 720p phase sits at a chunk-grid corner mid-smoothstep (6.6 px),
  derives a 0.88-0.97 band, and adds a partial-visible-chunk assertion only true
  thinning can satisfy. Corrections worth keeping: activeRadius in that rig is 72
  (quality stays 1, the governor never runs there) and the camera distance is
  per-chunk, not a boom.
- Mutation probes on committed trees: 13/13 killed rc != 0 with named tests. The
  original M4 (counter clauses restored onto the whole gate) SURVIVED the first
  round: the organic repro crosses the band only via the climb, after resolution
  already recovered. Closed by the dense-scene pin (0d24d50e9b), which parks the
  counters in-band from the first recovery frame.
- Reviewer (frontend-seam-reviewer, fresh): 0 blocking, fairness PASS (vfx and
  lighting consumers traced cosmetic end to end; the AoE telegraph spawns outside
  every quality gate; light count stays maxPointLights, only intensity scales).
  All 4 should-fix fixed: characters floor 0.86 + the non-governable sweep, the
  stableSeconds precharge pinned deliberate, the constant-true grass bound now reads
  the live band max, screenshots captured. Notes: the player-performance brainstorm
  line updated to record 72; a low-tier arm for the recovery suite is a QA
  candidate; the ability_vfx mote gate (0.5) now sits 0.08 under both tiers vfx
  floors, unguarded if a future retune drops under it.
- Perf evidence (this machine, headed, vsync off, 1280x720; rows in
  docs/perf/baseline/history.jsonl, whose machine field records the CPU string;
  raw runs in tmp/perf-baseline/). [QA relabel: the numbers first quoted here as
  "post-retune" are the POST-DRESSING-FIX row at 281a0a29ca; the actual
  post-retune row at 4fe929d002 is LOW 204.3 fps overall, min scenario 138; the
  medium row and the post-dressing-fix low row ran with dirty:true bench-loop
  working trees, the post-retune low row was clean.] LOW post-dressing-fix
  (281a0a29ca) overall 211.4 fps (min scenario 140.3), p95 6.6-24.3 ms, calls
  194-325, tris 0.68M-4.53M. MEDIUM overall 78.7 fps (min 70.2), p95 26.3-35.7 ms,
  calls 433-570, tris 2.38M-3.56M. LOW is lighter on frame cost and calls in EVERY
  scenario (in BOTH low rows) and on triangles in the three field scenarios. TOWN
  TRIANGLES stay higher on LOW (4.53M vs 3.55M): attributed STRUCTURAL, and QA
  re-verified the mechanism: farFieldPolicy (far_terrain_core) grants sprites+vista
  only to standardMaterials && !leanFoliage && !constrainedMemory profiles; plain
  low fails two of the three, so its vista is denied and real geometry draws to
  CLASSIC_CAMERA_FAR (950, fogged past the biome fog far, 700 in the vale), while
  medium's real detail ends at the vista detail horizon (about 640 yards, the
  FAR_DISCARD_MARGIN inside the 2200-yard envelope) with cheap vista cells beyond.
  Low's extra town triangles are that 640-to-950 annulus of real geometry. The
  asymmetry predates this phase and is the upstream player-performance Packet 5
  audit (its fogFar row); NOT a phase 5 regression. The dressing fix does not move
  town numbers because towns exclude random dressing.
- Screenshots: docs/screenshots/desktop-client-update-phase5-low/ (LOW preset, real
  GPU, pr_screenshots tooling). Near-identical by design; the commit body says why.
- Gate (gate_select, BROWSER_PATH exported, biome defaultBranch pinned for the run
  and reverted, proven in no commit): full-suite fallback (biome.json in the
  changed set) red ONLY on the 8 accepted asset-seal suites / 11 tests; 2418 files
  / 33189 tests green; i18n gen + freshness, malware scan (0 high), biome changed
  files all PASS; post-abort turbo proofs 5/5 (check:types build:env build:server
  build:bot) and 3/3 (build:bundle). No dungeon_finder flake this run.
- Untaken free candidates: F19 (first post-refocus report window spans hidden
  wall-clock) did not fall out free, still a phase 7 item; the cap-detection window
  (the brainstorm residual, 28-48 ms) untouched per scope.
- QA handoff for phase 5 QA: re-run the 13 probes fresh on the committed tree;
  re-litigate the stableSeconds precharge decision and the dressing-on-lowPlus
  keying (mediumIris cohort lost the dressing boost, deliberate, tier parity);
  the town-triangles structural note (vista denial on lean profiles) is the one
  open perf item; the low-tier recovery-suite arm and the mote-gate margin are
  cheap coverage candidates.

### Phase 5 QA (2026-08-09, governor ladder + LOW retune verification)

- Verdict: PASS-WITH-FOLLOWUPS. 0 blocking in the shipped phase 5 code; the one
  BLOCKING filing was operational (a dead duplicate probe agent left staged
  pre-fix checkouts in the worktree mid-audit; restored to HEAD, suites re-green,
  no commit ever contained the dirt). 5 confirmed should-fix findings all fixed
  in-session; both pinned deliberate decisions UPHELD fresh; two pre-existing
  oscillation shapes surfaced under the stopping rule, NOT patched.
- QA-start base merge 2c3ca8eaab took release tip 6e1ead1fea (8 upstream
  perf(render) commits: background GPU queue observability, prewarm compile
  coverage, point_light_budget). Clean textual merge; the 8 phase-relevant
  suites re-ran green (100/100) before any audit; the seam auditor verified the
  retuned lighting level composes with the merged point_light_budget without
  shedding light COUNT below the static preset.
- Audit shape: two workflows (the first lost 12 of 16 agents to a session-limit
  window; the continuation re-ran every lost auditor FRESH off journal.jsonl per
  doctrine and finished 16/16). Six auditors (governor static, re-litigation x2,
  numeric recompute, test quality, seam/fairness, qa-checklist), findings
  deduped, every actionable finding CONFIRMED by two adversarial skeptics
  (10/10 votes, no splits). The probe round ran orchestrator-side after both
  probe agents correctly stopped on the duplicate's dirty tree.
- Numeric audit: every derivation claim reproduces by hand, zero invented
  numbers (bands mediums x0.95 half-up 2dp exact on all four ladder buckets;
  minima and caps floors equal mediums exactly; caps mediums x0.9 on per-row
  clean grains, worst deviation 1.23%, all strictly below medium; ring 53.28 vs
  59.28; floor ring 36.0 vs 44.1; lights 4 = 4 via the real renderer rounding).
  Medium/high/ultra/insane tables byte-identical across the range.
- Pre-fix repro re-verified first-hand: source at 5a04133a49~1 with the fix
  commit's test = rc 1, 3/3 arms red with the assertion diff pinning resolution
  at the 0.7 floor (a genuine stall, not an import error); with HEAD's test all
  5 arms red including the dense-scene pin; restore re-greens 5/5. Frame-cap
  assertion blocks changed only baseline literals across the range (diffed from
  the reformat commit ec3a8d8054).
- Probe round (orchestrator-run, committed tree, restore-verified between
  probes): 16 probes. P1, P3-P13 KILLED rc!=0 with named tests (P1 = the
  historical M4 counter-clauses-onto-canRecover, killed by the dense-scene arm;
  P13 = the present-guard strip, killed by the threading pin). THREE SURVIVORS,
  each a real pin gap, each fixed and re-probed KILLED: P2 (dropping the
  triangles clause from canEnrich survived: the dense-scene arm parks all three
  counters high, masking every single clause) fixed by three per-clause arms;
  P14 (DRESS_DENSITY_LOW_SCALE to 1 survived as the test-quality audit
  predicted) fixed by the 1.5-1.7 spot-count ratio band (deterministic seed
  measures 1.586; the dropped-scale value is about 1.44); P16 (stripping the
  phase B grass ceiling survived: high maxima are 1.0 so high arms cannot bind
  ceilings) fixed by the low-tier climb-to-maxima arm reaching every ceiling
  under 1.0. P15 (low resolution band min raised above medium) confirmed the
  sweep blindness: only the re-mintable override hash redded; fixed by deriving
  the sweep from the band table keys plus key-set equality; re-probed, the
  semantic suite now kills it.
- Fixes landed (each mutation-verified after commit): per-clause enrich arms;
  low-tier dense-scene and climb-to-maxima arms; the dressing count-ratio band;
  the key-derived monotonicity sweep with the foliage minRadiusScale source
  binding, render-scale floor sweep, and low caps literal pins; two long-horizon
  frame-cap pins (dense-in-band restores baselines plus render scale and never
  climbs; sparse climbs to the exact maxima; the older 24-frame test never
  reached a fire slot so it could not tell those apart); the vfx mote-floor
  guard (MOTE_QUALITY_GATE exported from ability_vfx/fx.ts, every tier's band
  min and governor floor pinned above it); comment corrections (enrich rate
  bound, derivation scope) and the in-place QA corrections above.
- Re-litigations, both UPHELD fresh: (1) the stableSeconds precharge trades the
  provably-stranded resolution defect for a slow bounded ratchet (one step per
  recharge window, clamped by the retuned maxima, undone only by real
  pressure); the rate-bound COMMENT was wrong and is corrected (cooldown never
  binds). (2) the dressing trio on lowPlus is the right carrier (mediumIris
  keeps leanFoliage's lighter knobs, loses only the cosmetic trio; cohort
  enumeration verified). Side findings recorded above: the terrain lowShade
  rider and the iOS opt-up gain; and commit 9e93468778's body attributes the
  town inversion to the trio, which the phase's own bench falsifies (the
  ledger's structural attribution is the correct one; commits are immutable).
- Stopping-rule items surfaced for the user, deliberately NOT patched (all
  pre-existing shapes, none introduced by phase 5): (a) enrich-degrade limit
  cycle when one step straddles the 90-100% counter band (period >= ~7.65s low,
  amplitude one rung; no hysteresis margin between the 90% re-arm and the 100%
  degrade trigger relative to a single step); (b) the misclassified-cap
  resolution sawtooth at the 48ms boundary (phase 5 shortens the path: a capped
  session in the 90-100% band now restores baselines and resolution where it
  previously restored nothing; the climb itself was already reachable pre-fix;
  cap-detection window work stays out of scope per the packet); (c)
  renderer.adaptiveGrace is write-only (pre-existing vestige, cleanup
  candidate). The new long-horizon cap pins freeze the CURRENT semantics so any
  future change to (b) is a deliberate pin rewrite.
- Other records: GFX.characters appears consumer-dead (the 0.86 floor is
  runtime-inert; the sweep pins a dormant knob, harmless); worldStreaming
  carries governable:true in the tables while correctly non-governable (the
  ladder never touches it; label-only, left for upstream); the retune applies
  to any host selecting tier low including mobile (directionally helpful for
  the thermal issue, unmeasured, per packet non-goals).
- Gate: see state.md phase 5 QA block for the recorded result.

### Phase 6 (2026-08-09, three.js 0.185 train)

- Base merge 519f1c328d took release tip f53e5a37d1 (PR 3168 rift death-zone
  telegraphs; new src/render/rift_death_zone_core.ts). Clean; the 13
  phase-relevant render suites re-ran green (133 tests) before any work.
- Dependency moves (4e124fb4b7): three 0.165.0 to 0.185.1 (exact),
  postprocessing 6.36.0 to 6.39.4 (exact; consumed only as n8ao's peer, no
  first-party import exists), n8ao 1.10.3 to 2.0.0, @types/three 0.185.4
  (closest published to three 0.185.1, same minor). The compileAsync
  disposal-race patch was re-evaluated: upstream r185 still ships the
  unguarded program.isReady() poll (verified in the r185 source and the
  installed bundle), so the guard was RE-AUTHORED as
  patches/three@0.185.1.patch via pnpm patch; the pin test dropped its r165
  wording and its bundle-scope scan is unchanged.
- Pre-upgrade baselines frozen on the merged base BEFORE the bump, commit-per
  run so every history row lands dirty:false (the phase 5 relabel lesson; the
  first batch tripped exactly that trap, one preset's outputs dirtying the
  next row, and was stripped and re-run): low 190.8 / medium 57.9 / high 40.9
  / ultra 34.7 overall fps at 1280x720 vsync-off on the RTX 5090. Reference
  shots (swiftshader MECHANICAL references, never showcase evidence) in
  gitignored tmp/perf-parity/before-<preset>/.
- Migration walk: a 31-agent workflow (17 per-item auditors, 3 chunk-anchor
  groups, 11 adversarial skeptics; zero losses) produced the hit matrix;
  implementation stayed in the main session. Confirmed no-hits (each
  skeptic-verified): r170 Material.type, r170 mipmaps, r174 RenderTarget
  clone, r176 GLTF WebP/AVIF, r177 ColorManagement renames, r178
  Multiply/Subtractive blending (none exist), r184 pixelStorei (all raw
  context uses are reads), postprocessing direct API use. Chunk-anchor audit:
  92 onBeforeCompile anchors across 29 render files, every one ok against the
  r185 GLSL sources, zero missing or ambiguous.
- Hits patched, one commit per cluster: n8ao 2.0.0 dropped computeNormal's
  REVERSEDEPTH arm (one surgery anchor deleted; a0e61e2683) and the r182+
  UnrealBloom composite rewrite (rgb-only 3.0-scaled sum, max-component
  alpha, One-factor premultiplied blend) is NOT a drop-in for
  OutputGradePass's bloom.rgb * bloom.a add, so restoreClassicBloomComposite
  rebuilds the r165-shaped tint-free accumulation, pinned equal (whitespace
  aside) to the pre-upgrade shipped shader; fsQuad became _fsQuad, SMAAPass
  constructs sizeless, OptimizedCineonToneMapping became CineonToneMapping.
  @types 0.185 nullability churn (1f5b8b0ee0). THE BIG ONE (6f53f72879):
  r185 gates updateMatrixWorld's own compose on matrixWorldAutoUpdate and
  recurses children unconditionally, so the frozen chase camera's four
  explicit updateMatrixWorld() calls became compose-skipping no-ops that
  also ate the dirty bit (frozen view); refreshFrozenWorldMatrix
  (static_matrix.ts) flips the flag around the stock walk, all four sites
  rewired, both r185 premises pinned. Clock to Timer in the four preview
  loops + fit-studio PCFSoft (ff8e667db6). Prewarm dedupe learned r185's
  vertexNormals program bit and the parameter tripwire re-pinned after the
  audit (0bb6273b51). Basis transcoder patcher re-authored for the r185
  Emscripten shapes (two dynamic sites now: craftInvokerFunction with
  isAsync, arrow __emval_get_method_caller with kind; createNamedFunction is
  upstream-clean and craftEmvalAllocator is gone), regen ships the paired
  wasm, ktx2_entry cache pre-seed re-keyed to r185 FileLoader's 'file:' + url
  namespace, both sides pinned (daa963da45). TransformControls getHelper in
  the asset-pipeline live viewer; sky envRotationY VERIFIED needing NO sign
  flip (r185's transpose build equals r165's negated euler for a Y-only
  rotation, both sources compared; the audit's "almost certainly flip" was
  refuted by the probe) so only the comment moved (f3c9a8fdd5). r185 moved
  info.reset() before the shadow pass: comment sweep + census test fake
  reordered; the direct-profile shift is provably EMPTY because every
  shipped direct profile disables dynamic shadows, now pinned in
  tests/gfx.test.ts (018ed52dd3, hardened in e092f26e3a).
- Shader smoke (checkShaderErrors ON via ?shaderdebug, prewarm tour at low
  AND ultra): caught ONE real break the anchor audit structurally cannot
  (the anchor matched; the chunk's declared TYPE changed): r185 declares
  vColor vec4 under plain USE_COLOR, so vertex_color_emissive's injected
  block failed GLSL compilation on Eastbrook two-material emissives at low.
  Fixed (39490b4c49), smoke re-run CLEAN on both tours (the only console
  error is the pre-existing training-dummy lazy-preload race under fast
  teleports, identical at both tiers, not a loader regression).
- Seam review (frontend-seam-reviewer, fresh): PASS-WITH-FOLLOWUPS, 0
  blocking, 4 should-fix + 4 notes, all but one landed in-session
  (e092f26e3a + the re-freeze fix): the re-freeze root-compose gap (r185
  force does not bypass the flag gate; flag-preserving bake + parent-move
  test arm, mutation-verified killed), the over-claiming shadow-shift
  comments (now state the pinned no-shadows-on-direct invariant), the
  _fsQuad handle pin, the r165-equivalence bloom pin, reversed-depth premise
  pins, and the census-fake ordering source pin. NOT landed (ledger): the
  hidden-view gate cost inversion mitigation (drop matrixAutoUpdate on
  hidden subtrees or detach), an optimization decision handed to QA/upstream.
- Perf after (informational, QA holds the 5 percent gate; rows commit-per
  run): medium/high/ultra are FASTER across effectively every scenario
  (medium 57.9 to ~71 overall, high 40.9 to ~51, ultra 34.7 to ~44; r184/r185
  render-list and pixel-storage work). LOW splits and the split REPRODUCES on
  a quiet machine: town-idle +27.5, town-look +24.2, east-run +25.9, but
  open-run -22.6 and combat-vfx -17.5 percent. Mechanism hypothesis for QA:
  r185 removed the matrixWorldAutoUpdate subtree traversal-skip and the
  hidden-view gate now composes hidden rigs' children every frame; plain low
  leans hardest on both (vista denial draws real geometry to camera-far, so
  its open-world scenes carry the largest frozen node counts). The
  ?diagnostics per-phase telemetry can attribute the matrix-walk share.
- Visual: before/after shot pairs for all four presets in
  tmp/perf-parity/{before,after}-<preset>/ with diff-shots stats. Low sits at
  the noise floor (meanAbsDiff 0.16-2.73); medium/high/ultra show the
  expected broad r181 lighting shift (meanAbsDiff up to 12.4, 7-34 percent of
  pixels over threshold). The r181 acceptance decision is QA's, with the
  user; the bloom high-pass also moved from Rec.601 to Rec.709 luminance
  weights (identical for neutrals, a few percent on saturated emissives),
  same review bucket.
- Deferred, recorded: scripts/assets/*/export_entry.js still set the
  r182-deprecated PCFSoftShadowMap (warning-only in dev exporters); they are
  seal-fingerprinted, so the rename batches with the phase 11 re-mint.
  checkShaderErrors stays false in prod (the ?shaderdebug toggle is the dev
  lever, unchanged).
- Gate (gate_select, BROWSER_PATH exported, biome defaultBranch pinned to the
  release branch for the run and reverted, proven in no commit): full-suite
  fallback (lockfile in the changed set) red ONLY on the 8 accepted asset-seal
  suites / 11 tests; 2422 files / 33275 tests green (the first full run also
  surfaced four legitimate three-train reds, fixed in 5f4a16657c: the
  texture-upload native-ranges premise flip, two camera-refresh source-pin
  spellings, and the canopy fragment hash re-mint). Post-abort turbo proofs
  5/5 (check:types build:env build:server build:bot) and 3/3 (build:bundle).
- QA handoff for phase 6 QA (phase-06-qa.md): (1) the r181 lighting decision
  with the user (pairs in tmp/perf-parity/{before,after}-<preset>, low at
  noise floor, composer tiers shifted; includes the Rec.709 bloom high-pass
  weighting); (2) the reproducible low-tier open-run/combat-vfx perf
  regression (~-20 percent; traversal-skip removal hypothesis, ?diagnostics
  per-phase telemetry attributes it; the hidden-view gate mitigation from the
  seam review is the candidate lever); (3) re-run the migration probes fresh
  on the committed tree; (4) re-litigate the accepted r185 semantic shifts
  (bloom composite restore vs adopting upstream's 3.0-scaled blend, the
  direct-profile no-shadows invariant pin, the re-freeze flag-preserving
  bake); (5) the export_entry.js PCFSoft renames stay batched with the phase
  11 seal re-mint.

### Phase 6 QA (2026-08-09/10, three.js 0.185 train verification)

- QA-start base merge 215d4ac8c2 took release tip 7ce12bad9e (1096 files:
  upstream perf items incl. the desktop KTX2 mip release, frame-budgeted
  grass builds, the bounded character visual pool, hitch referee,
  allocation-free nameplates/i18n, the artwork overhaul, pvp draws,
  battleground backfill, sfx batches). Five conflicts reconciled by hand; the
  load-bearing one ported upstream's new raw-context KTX2 fallback probe to
  r185 semantics (astcHDRSupported via the astc extension's hdr profile plus
  the Linux Mesa emulated-format filter; r165 had neither, and the six-key
  workerConfig is a type error under @types 0.185), with both polarities and
  per-conjunct arms pinned in tests/ktx2_support.test.ts. The
  gfx_override_core low hash was re-minted on the merged tree with the
  other five rows matching the release pins byte for byte (the phase 5 low
  retune stacking on upstream's C1 pool bound). history.jsonl is the
  chronological union of both parents (12 + 5 rows).
- PERF GATE (fresh medians vs the frozen pre-upgrade baselines; low x4,
  others x2; commit-per-run): low town-idle +20.2 / town-look +19.2 /
  open-run -18.8 RED / east-run +5.4 (bimodal 227-306) / combat-vfx -7.3
  RED; medium all green (+3.6 to +13.0); high town-idle -10.0 / others green
  (+2.1 to +10.9); ultra town-idle -21.2, town-look -8.1 / field scenarios
  strongly green (+12.2 to +25.5). ATTRIBUTION against the phase 6
  post-train pre-merge rows: the train made medium/high/ultra FASTER
  everywhere (high town-idle 41.7 to 49.2, ultra 36.1 to 38.4); the
  high/ultra town reds are MERGE-OWNED (upstream f53e5a37d1..7ce12bad9e
  regressed town-idle across tiers, scaling with tier: low -6, medium -13,
  high -24, ultra -25 percent vs the pre-merge post-train rows), so they are
  upstream perf-packet territory, not train misses. The two LOW reds are
  train-owned (upstream wins bought combat back from -18/-33 to -7.3 and
  open-run from -23 to -18.8). 1 percent lows at 5 s windows are about 3
  frames and swing +/-100 percent run to run; recorded, not gated. Notably
  low open-run 1 percent lows IMPROVED +106 percent (41.6 to 85.7): the mean
  regressed while worst-frame behavior got much better.
- LOW-REGRESSION ATTRIBUTION (live in-page probe, gfx=low, real GPU,
  stationary open + combat vantages): full scene walk = 8,900 nodes, 3,523
  auto-update, 1,751 nodes under gated roots (the set r165 pruned), 43
  hidden views carrying 1,543 always-recomposing rig nodes; measured
  scene.updateMatrixWorld() cost 0.43 ms (about 4-6 percent of a low frame).
  Detaching every hidden gated view live recovered at most ~4 percent fps;
  skipping the entire walk ~5 percent. The r185 matrix-walk/hidden-rig
  mechanism is real but CANNOT explain -18.8 percent on open-run: the
  balance sits in the moving/streaming render path (consistent with both
  moving scenarios splitting from the improving idle scenarios). The
  ledgered hidden-view mitigation was therefore evaluated and NOT landed
  (recovers a twentieth of the gap for real churn); per the stopping rules
  the low open-run/combat delta is a HOLD-OR-ACCEPT decision surfaced to the
  user, with the postprocessing/n8ao fallback ladder inapplicable (three
  core, not post chain).
- CROWD DECAY (first run on this branch, no frozen reference; this run IS
  the reference now): solo 28.3 / crowd-10 32.4 / crowd-20 30.4 / crowd-35
  30.0 / crowd-50 29.8 fps, entity phase 0.8 to 1.5 ms linear, bench verdict
  PASS (flat curve, no cliff). Deviation recorded: the phase-06-qa.md
  "compare its decay curve" step had nothing to compare against.
- AUDIT WORKFLOW (52 agents, zero losses: 8 area auditors + 4 fresh
  re-litigations + 2 adversarial skeptics per actionable finding): all four
  re-litigations UPHOLD (bloom composite restore, direct-profile no-shadows
  pin, flag-preserving re-freeze bake, texture-upload premise flip). Fresh
  hit-list re-derive: 13/15 items MATCH the recorded walk, 2 record-level
  discrepancies with no code gap. Anchor audit: the 92/29 claim reconciles
  exactly (92 anchor sites; 29 files registering onBeforeCompile); 35+
  anchors across 15 files spot-verified against the installed r185 sources,
  all clean. Merge-drift: 8 branch-owned files touched, every branch
  semantic survived symbol-level inspection; no planning-doc premise broken.
  20 actionable findings -> 17 confirmed by both skeptics, 2 splits (both
  resolved against the finding with direct evidence), 1 killed.
- THE MOON FINDING (filed blocking, resolved benign with a mechanism): the
  day-night clock is UTC-anchored (day_night_clock.ts cyclePhase(Date.now())),
  so parity captures taken ~75 minutes apart sit at different phases; the
  after-medium east moon is absent from after-high east on the SAME build.
  Consequence: the swiftshader parity diffs OVERSTATE the r181 delta on
  dusk/night scenes. The decision materials were re-captured with the phase
  frozen (/daynight day) on BOTH sides: tmp/r181-showcase-frozen/
  <tier>-{before,after}/ (8 biome vantages x 4 tiers, real-GPU ANGLE,
  identical framing; the unfrozen full-location sets remain in
  tmp/r181-showcase/). All showcase captures rendered on the Intel iGPU
  (chromium ANGLE default on this MUXless box), identical on both sides, so
  the lighting comparison holds; fps overlays are directional only.
- FIX COMMITS (each probe-verified on the committed tree): 0f7d484b2c
  comment-truth sweep (bloom claims scoped to the composite stage, the
  upstream r182 blur-kernel + Rec.709 bright-pass deltas recorded as
  accepted r181-bucket feeders; texture-upload premise names the real sky
  env/dome consumers; prepareZoneSky + dome-exemption r165 premises
  re-anchored; ktx2_mip_release header records its r185 re-verification).
  d94a8832b7 bloom + matrix-walk fail-closed pins (lerpBloomFactor body,
  bloomFactors weights, executed _fsQuad render smoke through production's
  cast; streamed-child assertions moved off self-healing getWorldPosition
  onto matrixWorld elements; the new static_matrix premise arm pins r185's
  unconditional child recursion, the walk that places water gap sheets).
  0d580aadef Mesa per-conjunct arms, the no-shadows pin widened to the full
  hint grid (floor 13), the texture-upload stale-range arm. 11bf88933b
  night-light splat off the deprecated inverseTransformDirection alias.
  42d7b6f4b8 draw-stats session rebind on webglcontextrestored (pre-existing
  release-branch defect, cherry-pick candidate: three replaces webgl.info on
  restore and the composer-tier accumulator kept reading the dead object).
- PROBE ROUND: 12/12 KILLED with named failing tests on the committed tree
  (re-freeze bake revert, refresh-helper gut, camera-refresh call-site
  strip, bloom-restore identity, vColor revert, prewarm normals-bit drop,
  ktx2 preseed re-key, astcHDR drop, Mesa single-conjunct, drawStats rebind
  drop, night-light revert, texture-upload clear drop, direct-profile
  shadows flip).
- SHADER SMOKE on the merged tree: clean at low AND ultra with
  checkShaderErrors ON; only the pre-existing training-dummy lazy-preload
  race, identical at both tiers.
- GATE (gate_select, BROWSER_PATH exported, biome defaultBranch pinned to the
  release branch for the run and reverted, proven in no commit): i18n
  freshness, malware scan, and changed-files biome green (after a scoped
  format commit over exactly the QA-touched files); full-suite fallback red
  on 9 files / 13 tests: the 8 accepted asset-seal suites (11 tests) PLUS
  tests/mob_portrait_source_manifest.test.ts (2 tests), a NEW seal-family
  suite that arrived with the merge's artwork overhaul: it byte-seals the
  portrait RENDERER fingerprint, which the r185 train legitimately moved, and
  healing it requires the re-render + review + receipt flow, so it JOINS the
  phase 11 re-mint batch as the ninth accepted seal suite (the r181-bucket
  decision in baked-asset form). Everything else green: 2448 files / 33750
  tests. Post-abort turbo proofs green: check:types build:env build:server
  build:bot, then build:bundle.
- Process notes: the phase-06-qa.md test-quality and perf:crowd steps ran
  (workflow area + orchestrator); the heap-sawtooth ungated-tick interplay
  with the hidden-window skip is a phase 7 diagnostics candidate; the
  dome-upload loading-screen exemption premise softened by 0.185
  row-batching (comment updated, revisit candidate); the high/ultra
  merge-owned town-idle regression is surfaced to the user for upstream
  routing.

### Interim reconcile (2026-08-13, base onto release/v0.38.0 + plan refresh)

- Plan-integrity phase, not a feature phase. Two release windows (v0.37, v0.38)
  landed since phase 6 QA: 1453 commits, 2375 files. Ancestry guard held
  (7ce12bad9e is an ancestor of origin/release/v0.38.0); upstream did NOT move
  the three train (its package.json still pins three 0.165.0), but 37c373cdd0
  modified patches/three@0.165.0.patch (bounded compileAsync isReady poll) and
  extended tests/three_compile_async_patch.test.ts, a modify/delete collision
  with our re-authored r185 patch, resolved by PORTING (below).
- MERGE cd03351264, eight conflicts hand-reconciled: (1) desktop_download.ts
  kept the __APP_VERSION__ derive (upstream bumped the literal to 0.37.0, which
  the derive subsumes; version surfaces are consistently 0.37.0 on the merged
  tree, the 0.38.0 sync has not happened upstream yet). (2) architecture.test
  .ts RENDER_PURE_CORES unioned (our frame_present.ts + upstream shadow_cadence
  _core, shadow_texel_snap_core). (3) fx.ts adopted upstream's new vortex
  streams>1 arm with our MOTE_QUALITY_GATE preserved in the else-if; the new
  arm renders ungated but the below-gate path is unreachable in governed play
  (tests/vfx_mote_floor.test.ts pins every tier floor above the gate;
  census-verified no pinned semantic bypassed). (4) characters/preview.ts took
  upstream's mid-prewarm pendingActive/syncSize resync with our r185
  timer.reset(). (5) renderer.ts unioned imports and adopted upstream's
  rewritten pinned multi-key prepareZoneSky (NOTE: earlier session notes
  misnamed it prewarmZoneSky; the census settled the resolution by direct
  diff: code-identical to upstream with exactly two comment deltas re-applying
  our r185 truths). (6) patches/three@0.165.0.patch deleted, upstream's
  bounded-poll semantics ported into patches/three@0.185.1.patch on top of our
  disposal guard via the pnpm patch flow; the merged 7-test pin suite passes;
  both arms now carry the disposal guard, so the arms have zero semantic
  delta. (7) pnpm-lock take-theirs + reconcile; electron 43.3.0 and n8ao
  2.0.0 resolutions restored after caret floats to 43.4.0/2.0.1. (8)
  pending.ts regenerated via i18n:gen. One legitimate red fixed in its own
  commit a43e7f46e2: @types/three 0.185 dropped KeyframeTrack
  .createInterpolant while upstream's new paladin clip modules call it; module
  augmentation src/render/types/three_keyframe_track.d.ts (kill evidence: tsc
  reds on 5 sites without it). Post-merge: tsc clean; ~55 pinned suites green
  (~770 tests) incl. every governor canary and all gfx hash pins UNMOVED; the
  seal family is the only red at 9 files / 14 tests (13 + upstream
  154f0563ce's new receipt-authorization test, same fingerprint root cause).
- DELTA CENSUS (workflow: 6 area auditors + 2 adversarial skeptics per
  consequential claim; 38 agents, zero losses; 16/16 claims survived, none
  refuted). By area: (a) RENDER/PERF: the phase 5 governor territory is
  untouched (zero commits to render_budget.ts, ui_effects_profile.ts,
  foliage*, zone_streaming.ts, static_matrix.ts, post_*); gfx.ts moved 11
  lines (9d166dfc8b Shadow Quality dial capped at High 4096, Insane arm
  deleted, LOW derivation byte-identical). The upstream perf mass (shadow
  cadence + texel snap cores, contact blob shadows on shadowless tiers,
  first-reveal compile gates, early prewarm submission, texture-residency
  prewarm, character far LOD + variant eviction, iOS far-zone eviction, sky
  HDR eviction) lands in the moving/streaming path the phase 6 QA blamed for
  the LOW gap: the attribution's NUMBERS are stale (re-freeze required), its
  MECHANISM is not refuted; skeptics note most of the new body cannot move the
  LOW open-run average (shadow cores inert at LOW where dynamicShadows is
  off; zone eviction no-ops unconstrained; reveal work targets 1%-lows) and
  only the character far-LOD/variant-eviction pair plausibly shifts
  steady-state moving cost. ONE new coupling into branch-owned code:
  renderer.ts feeds updateShadowCadence from renderBudgetGovernor.update's
  state.pressure/state.enabled (ce06b16f0a), inert at LOW (early-returns when
  the sun casts no shadow, which every shipped LOW/iOS profile disables) but
  a phase 11 what-is-missing line: cadence enter/exit must not oscillate
  against the split recovery ladder on medium+. (b) DESKTOP SHELL: zero-touch
  (no commits under electron/, build/, desktop-publish.yml,
  release_version.mjs; no dep/builder churn); frame() gate threading
  bit-identical through the merge; hud paint cut survives with its 8-call
  head list; gpu-notice family untouched. Upstream's post-entry preview
  prewarm rides a backgroundGpuWork lane OUTSIDE the presentation gate: a
  hidden desktop shell still executes those bounded GPU units; phase 8's
  powersave scope now enumerates the lane set. (c) PHASE 7: greenfield holds
  (only electron-log writes disk); the options doctrine recipe resolves
  symbol-by-symbol; drift is modest (209a38b650 parseStoredJson shared core,
  reliquaryTrackerCollapsed as a persisted-only BOOL_SETTINGS key). Two
  phase-07 doc defects fixed: a never-existed symbol (the real GPU seams are
  forceHighPerformanceGpu at main.cjs:159 and relaunchForLinuxPrime at
  main.cjs:72) and the missing desktop-only-row mechanism (OptionsEnv arm on
  buildInterfaceControls mirroring buildGraphicsControls env.nativeShell,
  dual-armed GENERAL_KEYS pin). (d) PHASE 8/9: zero upstream display/
  powersave/gamepad work; both phase 9 observation points hold exactly; shell
  catalog merged clean with no key collisions; NO /wiki changelog page exists,
  so the whats-new target is a phase-9-start decision (GitHub releases URL /
  in-client news feed / new guide page; /wiki root weakest). (e) PHASE 10/11
  + QA MACHINERY: zero client-side discord code in range; remint runbook
  unchanged; six export_entry.js files still set PCFSoftShadowMap; NEW
  rerecord_polish_provenance.mjs (fb78debb7f) joins the phase 11 seal step;
  ci:changed became scripts/ci_changed.mjs with resolveSelectBase (biome-pin
  recipe obsolete, both skeptics CONFIRMED); 72cc09e65f check:ts:bot
  incremental was REVERTED upstream (9f8072c4ad), so the turbo proof list
  stands; PR tier still keys on branch name; docs/qa-gate.md now names
  gate:select the merge bar. (f) MERGE AUDIT: every named branch semantic
  survived symbol-level inspection; the ported patch is hunk-by-hunk
  semantically identical to upstream's; legacy 0.165 doc references remain on
  five surfaces (README badge + 21 localized READMEs, CONTRIBUTING.md patch
  doctrine, docs/perf/hitch/README.md, prewarm_policy comment), all
  PRE-EXISTING phase 6 gaps, scheduled into phase 11.
- PERF: the phase 6 frozen baselines are obsolete as future comparison
  targets; a re-freeze on the merged tree was attempted but the first run was
  CONTAMINATED (other Claude sessions + cold vite cache; low 41.7 overall vs
  the ~190-210 era) and reverted uncommitted; re-freeze pends a quiet
  machine. The r181 showcase pairs remain internally valid for decision #2
  and must never be diffed against post-merge captures.
- DOC REFRESH: state.md (current base, standing rule 3 rewritten to
  discover-the-latest-release/*, new biome recipe, seal count 9/14 + the
  provenance re-record, perf/showcase validity notes, whats-new target
  amendment, inventory); phase-07/08/09/10/11 and their QA files re-pointed
  and premise-fixed (each edit cites its forcing sha in the file);
  implementation-plan.md and README.md re-pointed.
- GATE (gate_select, BROWSER_PATH exported, NO biome pin, run post-refresh):
  i18n/wiki/SFX artifacts green, malware scan PASS (6315 files, 0 high),
  changed-files biome GREEN WITH ZERO WORKING-TREE EDITS (the retired-pin
  recipe confirmed live: diff base auto-resolved to origin/release/v0.38.0,
  204 changed paths). Full-suite vitest fallback: 2702 files / 37711 tests
  green; red = the 9 seal suites (14 tests) PLUS tests/monolith_budget
  .test.ts (2 tests), a NEW structural finding surfaced (not band-aided):
  upstream's extract-and-lower ratchet re-pinned renderer.ts/hud.ts ceilings
  with near-zero slack (13764/19490) and the branch's phase 4-6
  thin-consumer wiring now sits +89/+10 over; ceiling raise is a maintainer
  decision, recorded OPEN in state.md gotchas. Gate aborts at the vitest
  step by design; post-abort turbo proofs green 5/5 (check:types build:env
  build:server build:bot) + 3/3 (build:bundle).
- PERF RE-FREEZE completed 2026-08-13 after the user quieted the machine
  (commits 8bc24d2fe8..72bdef085a + the medium retry; all rows dirty:false,
  commit-per-run; low x4, medium/high/ultra x2; the first medium baseline
  attempt died at the known Profiler.enter flake and was retried). Fresh
  frozen targets (medians, 1280x720 iGPU ANGLE): low 97.8/91.9/172.1/198.2/
  177.2 (town-idle/town-look/open-run/east-run/combat-vfx), medium 49.5/
  51.0/59.0/72.5/57.5, high 33.5/29.8/37.2/52.5/35.4, ultra 29.0/28.1/31.1/
  41.2/29.6.
- CROSS-ERA MACHINE CONTROL (the load-bearing methodology finding): the
  pre-train tree at 519f1c328d (worktree ~/Documents/woc-r165-before,
  benched today on 5174, two runs, reverted after) reads overall ~168.7 vs
  its own era freeze 190.8: THE MACHINE ITSELF DRIFTED about -12 percent on
  means and to roughly half the 1 percent lows since 2026-08-09/10. Any
  fresh-vs-era comparison overstates code effects by about that much; the
  honest instrument is the SAME-DAY pair (old tree vs merged tree, both
  benched today). Same-day low deltas (control medians -> merged medians):
  town-idle 104.8 -> 97.8 (-6.7), town-look 96.9 -> 91.9 (-5.2), open-run
  212.0 -> 172.1 (-18.8), east-run 215.4 -> 198.2 (-8.0), combat-vfx 214.6
  -> 177.2 (-17.4); 1 percent lows halve-to-third on the merged tree
  (14.2/12.0/29.2/19.2/35.8 -> 3.5/4.0/13.8/7.7/14.6). The same-day
  open-run delta reproduces the phase 6 QA train attribution figure
  (-18.8) exactly; combat is now -17.4 (the era's upstream buy-back to
  -7.3 did not survive into the v0.38 stack, and upstream's own additions
  incl. contact blob shadows on shadowless tiers are inside the delta,
  inseparable from the train's share in these runs); the era's +106
  percent open-run 1-percent-low improvement is REVERSED on the merged
  stack (merged-tree worst-frames are consistently worse than the old
  tree same-day across all five scenarios and five runs).
