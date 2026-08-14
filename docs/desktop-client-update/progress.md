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
| 7 | Desktop prefs store and window memory | done | 2026-08-13 | 2026-08-13 |
| 7 QA | Verify phase 7 | done | 2026-08-13 | 2026-08-13 |
| 8 | Display modes and power | done | 2026-08-14 | 2026-08-14 |
| 8 QA | Verify phase 8 | done | 2026-08-14 | 2026-08-14 |
| 9 | Notifications and what's new | done | 2026-08-14 | 2026-08-14 |
| 9 QA | Verify phase 9 | done | 2026-08-14 | 2026-08-14 |
| 10 | Discord Rich Presence | done | 2026-08-14 | 2026-08-14 |
| 10 QA | Verify phase 10 | done | 2026-08-14 | 2026-08-14 |
| 11 | Final integration QA | done | 2026-08-14 | 2026-08-14 |

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

Phase 7: [x] electron/desktop_prefs.cjs store (atomic, corrupt-tolerant, Node-tested);
[x] bounds + display persistence with on-screen validation; [x] GPU-force opt-out
setting wired through the store (options doctrine row + bridge). Ticked at QA
(verdict PASS-WITH-FOLLOWUPS, 0 blocking; 6 confirmed should-fix all fixed
in-session, one behavior fix among them: maximized restores now maximize at the
reveal; see the Phase 7 QA record).

Phase 8: [x] display-mode option (borderless fullscreen / windowed) via the options
doctrine, desktop-only visibility, reconciled with the existing fullscreen setting;
[x] gamepad-active powerSaveBlocker with debounce and tests.

Phase 9: [x] OS notifications for update-ready and party-invite-while-unfocused
(renderer-rendered strings, validated + rate-limited channel, focus-gated); [x] what's
new t()-keyed link on the ready toast; [x] string contract pins.

Phase 10: [x] empirical SET_ACTIVITY gate probe recorded; [x] pure frame codec module +
socket manager (main), never blocks boot, backoff on absence; [x] renderer activity
assembly (localized, 15s coalesced, no-op dedup) + options toggle; [x] pins for codec,
channel, and absence behavior. (Ticked at phase 11: the phase 10 and 10 QA records
below carried the done evidence while this table lagged, the L6 self-inconsistency
the phase 11 ledger sweep filed.)

Phase 11: [x] one-time asset seal re-mint over the branch's FINAL lockfile
(scripts/assets/remint_lockfile_fingerprints.mjs + digest sweep + media manifest +
polish provenance, 5-step order in commit 218de2db08; deferred from phase 1 by user
decision 2026-08-08; executed 2026-08-14, commit 3c6040428f, all 8 seal suites green);
[x] qa-checklist.md matrix all green (evidence per item in the Phase 11 record);
[x] full gate green (final run: zero unexplained red); [x] perf summary
(before/after across phases) written (Phase 11 record, evidence bundle); [x] deferred
items surfaced (the complete deferral list in the Phase 11 record); [x] teardown
offered (extended at phase close; the user decides before the PR).

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

## Phase 7 record (2026-08-13)

Phase 7 done (prefs store + window memory + GPU opt-out; commits
92c79dc112 store modules, a7fd017f41 window memory, f9e26c1125 gpu
opt-out setting, 4f656661bd store file-shape hardening, 3576bd9b53
sync-module write crossing; tree clean, LOCAL-ONLY intact).
- Base merge 1ca227a9aa took origin/release/v0.38.0 tip 172ed59d01 (6
  commits, balance-suite splits + portrait manifest re-bless, test/CI
  lanes only; lockfile untouched, ancestry guard held, parity suite green
  after the merge).
- Design probe BEFORE implementation: app.getPath('userData') is callable
  at module scope pre-ready; resolve + small-file read + JSON.parse
  measured ~136 microseconds, so the pre-ready synchronous store read
  clears the startup stopping rule by design. The no-flash stopping rule
  is met structurally: the restore is resolved before the BrowserWindow
  constructor and spread into the options literal, and maximize() runs
  while the window is still hidden.
- Commit 2 bisectability verified in a throwaway worktree (8 electron
  suites green at a7fd017f41); commit surgery was index-only (hash-object
  + update-index), the working tree held final validated bytes throughout
  (FINAL_BYTES_OK).
- Smoke, 5 real-shell runs against isolated userData: save persists the
  exact resized bounds + displayId; relaunch restores them into the
  constructor; absent display + off-screen bounds fall back centered with
  the stale maximized flag dropped; opt-out true skips BOTH levers with
  log lines (negative arm: run 1 PRIME-relaunched normally); a truncated
  store launches clean with force ON. Wayland caveat recorded: without
  the x11 ozone arg the compositor owns placement; centering verified
  under X11.
- Reviews: privacy-security-review 0 blocking (passed: fail-safe
  polarity, fresh-object whitelist, proto-pollution immunity, strict IPC,
  no new OS state beyond the store file; 2 should-fix FIXED in
  4f656661bd: predictable temp path written through symlinks, missing
  isFile() gate = FIFO boot hang). frontend-seam-reviewer 0 blocking
  (passed: doctrine complete, capability gate honest incl. the
  mobile-shell arm, i18n clean, regen byte-reproducible, fairness
  trivial; 2 should-fix FIXED in 3576bd9b53: the applySetting arm's
  polarity crossing was UNPINNED (a dropped ! shipped green), and the
  boot reflection's pre-await Settings snapshot could revert unrelated
  boot writes via the whole-blob save; both test nits landed).
  Implementer mutation rounds: all named kills ('wx' downgrade, isFile
  gate delete, dropped inversion, hoisted factory, gate-forced-open,
  polarity flips), restores verified.
- LEDGER (recorded, not fixed; phase 7 QA re-litigates): (1) Interface
  Reset to Defaults re-arms the GPU force through the doctrinal reset
  path; accepted as doctrine, may deserve a pin. (2) The note copy names
  no-boot symptoms the in-game toggle cannot reach; candidate fix is a
  pre-lever env-var/CLI escape hatch plus a docs line naming the prefs
  path (phase 11 or user decision). (3) A Graphics-tab pointer note for
  discoverability (cheap follow-up). (4) The restore ceiling 16384 is
  not clamped to the target work area (deliberate sanity bound; symmetry
  clamp optional). (5) No jsdom render test proves the row absent from
  real DOM on web; the pure-core dual arms + the renderInterface source
  pins are the house pattern, recorded as residual.
- GATE: node scripts/gate_select.mjs at 3576bd9b53 resolved the diff base
  to origin/release/v0.38.0 itself (220 changed paths), mode=full
  (broad/unclassified: package.json, the three patch, and the lockfile
  sit in the branch-vs-base diff). Pre-vitest legs green: i18n gen +
  freshness (regen clean), wiki, sfx conformance, malware scan PASS
  (6338 files, 0 high), biome changed-files green (warning-severity rows
  only, pre-existing). Full-suite fallback: 2739 files / 37912 tests,
  red EXACTLY the accepted set (the 9 seal suites / 14 tests plus
  tests/monolith_budget.test.ts 2 tests, the OPEN ratchet decision);
  37782 passed, zero phase regressions. The gate aborts at the vitest
  step by design; post-abort turbo proofs 5/5 (check:types build:env
  build:server build:bot) + 3/3 (build:bundle); the real-browser suite
  run standalone with BROWSER_PATH: 19 files / 125 tests green.

## Phase 7 QA record (2026-08-13)

Phase 7 QA done (verdict PASS-WITH-FOLLOWUPS, 0 blocking; fixes committed
in-session: 1a42dbde40 maximize-at-reveal, 544f38085d BOM'd hand-edit,
cf58aa78a7 crossing pins, 35d4efa20d rescue docs, 7e61fa823d observable
stat gate; tree clean, LOCAL-ONLY intact).
- Base merge db35378113 took origin/release/v0.38.0 tip b08d79ef91 (92
  files: night lighting, GPU hitch instrumentation, point-light budget,
  CI merged-leg + duration ratchet; NO electron/ or desktop sync
  surfaces; one both-sides-appended conflict in the
  tests/architecture.test.ts sorted purity list, resolved keep-all-three;
  ancestry guard held, parity 335/335 green after, monolith red exactly
  the known accepted pair).
- Workflow audit: 19 agents, zero losses (context loader; security,
  correctness, test-quality, qa-checklist-charter, ledger-relitigation
  auditors in parallel; merge-dedup; 2 adversarial skeptics per
  actionable finding, code lens + doctrine lens). 34 raw findings
  merged to 6 actionable, 6/6 CONFIRMED by both skeptics (12/12 votes,
  0 splits, 0 killed), 20 passthrough recorded below. All four landed
  review-round fixes re-verified independently by three auditors.
- FIXED (all six confirmed should-fixes): (1) BEHAVIOR: maximize() on a
  hidden window also SHOWS it (documented BrowserWindow contract; a
  skeptic reproduced it against the vendored Electron 43 binary, and the
  QA smoke reproduced the pre-fix early-show at t=2ms), so the
  constructor-time maximize presented an unpainted dark frame for the
  whole load; moved inside showMainWindow before show(), pin re-pointed
  with a negative arm on the old shape. (2) The IPC setter's
  whole-record spread (the anti-clobber contract) was unpinned: a
  single-field save shipped green and wiped window memory on every
  toggle; pinned literally in electron_ipc_channels. (3) Both
  src/main.ts crossings (the inline post-await settings factory, the
  push arm) had no pin: a factory hoist reintroduced the whole-blob
  revert bug with every suite green; textual wiring pins added in
  desktop_gpu_pref_sync. (4) Ledger reset-re-arm adjudicated
  ACCEPT-AND-PIN with the mechanism corrected: the Interface Reset
  click IS the push (the footer re-applies every rendered key through
  onSettingChange), so an opted-out player who clicks Reset re-arms the
  force for the next launch in the same click; behavioral coupling test
  added, doctrine stands (reset means defaults, issue 2341 scope).
  (5) Ledger note-copy adjudicated CHANGE docs-only: the player copy
  stays byte-identical (accurate; a reword costs 5 M16 fills plus the
  semantic-regression pin surface), but the no-boot rescue nobody could
  discover is now documented in docs/desktop-release.md (per-OS
  desktop-prefs.json path + the gpuForceOptOut edit), and the NEW BOM
  hazard a skeptic probe-confirmed (JSON.parse throws on U+FEFF, so a
  Windows Notepad rescue edit silently resolved to defaults = force
  back ON) is fixed with a one-BOM strip in the loader plus both-arm
  tests. (6) The three Phase 7 deliverable checkboxes were still
  unticked while the same file said done twice; ticked with this QA.
- Ledger verdicts (the other three): graphics-tab pointer UPHOLD
  deferred (bundle into the phase 11 copy round); 16384 ceiling UPHOLD
  (challenged with 16384x16384 at (100,100) on a 1080p work area: the
  boundsUsableOn reachability guarantee makes it an annoyance, never a
  lockout); no-jsdom-web-absence UPHOLD (every link pinned in both
  polarities; revisit only if the call site stops being one expression).
  No verdict changes the DEFAULT force-ON behavior; neither stopping
  rule tripped. ADJACENCY for the user: until the phase 11 escape-hatch
  decision lands, Reset-to-Defaults re-arming the force plus the
  documented hand-edit rescue are the only recovery pair for a machine
  the force prevents from booting.
- Pin hardenings beyond the six (from the audit's nice-to-have tier):
  lever call sites count-pinned to exactly one each (the else-arm
  regexes prove a guarded call exists, not that it is the only one);
  the schedule body's cancel-before-re-arm pinned (a clear drop stacked
  one write per resize event); the at-cap boundary and the lying-stat
  text-guard arm added to the loader suite.
- Probe round (orchestrator-side, disciplined driver, committed-clean
  tree): 19/19 KILLED rc=1 with named failing tests: the 12 audit rows
  against the shipped suites, the two designed pre-fix survivors (spread
  drop, debounce-cancel drop) now killed by the new pins, four QA-pin
  rows (maximize order, BOM strip drop, factory hoist, reset default
  flip), and the one first-round survivor (stat-size cap drop, masked by
  the redundant text guard) re-probed KILLED after the read-count-0 arm.
- Real-shell smoke (isolated userData, x11 ozone arg, seeded
  maximized+opted-out store on the live display id): hidden until
  ready-to-show (432ms) with zero early-visible samples, first visible
  439ms; both opt-out skip log lines present, no PRIME relaunch.
  ENVIRONMENT CAVEAT: win.maximize() is inert under this box's
  XWayland/Mutter x11 rig in every order (probed a/b/c including the
  pre-fix shape), so the maximized-restore half rests on the documented
  contract plus the vendored-binary probe, and the pre-fix early-show
  defect DID reproduce live (show at t=2ms, visibleAlready at
  ready-to-show), which is the half the fix exists for.
- Passthrough ledger (recorded, no action): TOCTOU stat-to-read window
  accepted-design residue; boot reflection timing-held not
  construction-held (a pre-sync long-lived Settings would revert it;
  none exists today); preload coerces non-boolean set input to false
  (main still rejects; one shipped caller); displayId unclamped
  magnitude (identity-compare only); minimized-close may persist
  maximized:false on some platforms (self-correcting); maximized
  restore targets the normal-bounds display (phase 8 displayMode note);
  save outbound size check vacuous-by-construction (defense-in-depth);
  resolver clamps redundant with upstream sanitize; src/main.ts +15
  lines composition-only with ~70 ceiling headroom (phases 8-10 note);
  PR screenshots correctly deferred (LOCAL-ONLY).
- GATE: node scripts/gate_select.mjs at 7e61fa823d resolved the diff base
  to origin/release/v0.38.0 (220 changed paths), mode=full
  (broad/unclassified: package.json, the three patch, and the lockfile in
  the branch-vs-base diff). Pre-vitest legs green: i18n gen + freshness
  (regen clean), wiki, sfx conformance (advisory rows only), malware scan
  PASS (6366 files, 0 high), biome changed-files green. Full-suite
  fallback: 2753 files / 38117 tests; first run red on the accepted set
  PLUS ONE: upstream's new tests/three_reflection_contract.test.ts (GPU
  hitch analyzer premise pins) self-guards on THREE.REVISION '165' while
  this branch runs the 0.185.1 train, a no-textual-conflict semantic
  collision from the QA-start merge window; all six actual contract tests
  passed against the r185 build (the deferred reflection cycle holds
  through the branch's patched compileAsync too), so the premise was
  re-pointed wholesale in 29f83ced66. Post-fix red EXACTLY the accepted
  set (the 9 seal suites / 14 tests plus tests/monolith_budget.test.ts 2
  tests, the OPEN ratchet decision); 37986 passed, zero phase
  regressions. The gate aborts at the vitest step by design; post-abort
  turbo proofs 5/5 (check:types build:env build:server build:bot) + 3/3
  (build:bundle); the real-browser suite standalone with BROWSER_PATH:
  19 files / 125 tests green.

## Phase 8 record (2026-08-14)

Display modes (borderless fullscreen / windowed) and the gamepad
display-sleep blocker. Commits: 3fe05f89ad base merge of release/v0.38.0
tip 6ee7f3fd27 (tank-crit attacker keying + CI sparse checkout; parity
335/335 green after), 40c8368c6b sparse-cone reconciliation, 5f144f5beb
display mode (electron), ffc2c083b2 display-sleep blocker, b2e1f59537 options
row, 831b0c2cb1 hidden zone-warm pause, the docs commit closing the phase docs.

- BASE SYNC: ancestry guard held (b08d79ef91 ancestor of 6ee7f3fd27);
  merge clean, zero conflicts. ONE semantic collision: upstream PR 3380's
  new tests/ci_workflow.test.ts requires the CI sparse-checkout cone to
  SET-EQUAL every referenced docs/screenshots subtree, and the branch's
  phase 5 docs reference desktop-client-update-phase5-low; the entry
  joined all five ci.yml cone blocks plus the pinned SPARSE_CONE literal
  (fails toward more checkout). gate-integrity-reviewer PASS (set
  equality live both directions, 22=22, vacuity floors 167/6711).
- STORE: displayMode joined desktop-prefs.json as one validated enum
  field ('borderless' | 'windowed', strict literals, junk resolves
  'borderless') plus a defaults entry; DESKTOP_PREFS_VERSION stays 1
  (additive, absent-tolerated). Default 'borderless' (AAA default),
  matching the renderer setting displayMode def 1.
- ELECTRON: startup apply lives INSIDE showMainWindow before show()
  (same reveal discipline as maximize; borderless SUPERSEDES maximize
  via the pinned else-if; NEVER a `fullscreen` constructor option, an
  explicit false disables the macOS fullscreen button). IPC:
  desktop-set-display-mode (pinned recipe: trustedSender, strict enum,
  IDEMPOTENT same-value early return BEFORE the save, spread-literal
  save, mirror after persisted-ok, then live setFullScreen), desktop-
  get-display-mode (stored value), desktop-gamepad-activity (feeds the
  lease). CAPTURE GUARD from the smoke: captureWindowBounds early-
  returns while isFullScreen() because Linux getNormalBounds() equals
  getBounds(), so a borderless session would persist the display rect
  over the remembered windowed geometry (smoke reproduced the clobber
  pre-fix and its absence post-fix).
- POWER: electron/power_save.cjs pure state machine (injected start/
  stop/timers/clock): accepted ping starts 'prevent-display-sleep' and
  re-arms the 60 s idle release (POWER_SAVE_IDLE_MS), 10 s main-side
  ping floor (POWER_SAVE_MIN_PING_INTERVAL_MS), hidden releases
  immediately and mutes pings, shutdown terminal on will-quit, 'closed'
  releases via setHidden(true); setHidden rides the SAME single hidden
  derivation as the desktop-presentation-changed push. The rate-limit
  stamp resets on release so the first ping after idle/un-hide re-claims
  instantly (implementer deviation, accepted). 14-test transition suite.
- RENDERER: gamepad poll fires optional onActivity at most once per
  poll on real input only (rising edge, look.active, move flags,
  pointer-cursor movement; focus gate suppresses free);
  gamepad_activity_notify throttles to one bridge invoke per 30 s
  (GAMEPAD_ACTIVITY_NOTIFY_INTERVAL_MS), permanent no-op without the
  bridge method, total failure shape.
- OPTIONS: displayMode SETTING_RANGES {0..1, def 1}; the Graphics
  Display card renders choice(displayMode) INSTEAD of the fullscreen
  toggle when OptionsEnv.desktopDisplayMode (bridge capability from
  desktopDisplayModeSupported, BOTH methods, never isNativeAppShell);
  web/mobile arm byte-identical (same slot, ordered key-run pins both
  arms, four-env negative sweep). desktop_display_mode_sync.ts copies
  the gpu template (fire-forget push, factory-after-read boot
  reflection, strict union validation). requestPreferredFullscreen
  early-returns when the shell owns display mode, so desktop stops
  calling requestBrowserFullscreen (old shells keep the legacy path;
  NO F11 keybind exists, no other reader of the fullscreen setting).
  applySetting 'displayMode' arm pushes the mapped literal; Reset
  doctrine pinned through the REAL footer filter (rendered keys minus
  GRAPHICS_REBUILD_KEYS, displayMode survives). i18n: hud.options.
  displayMode/displayModeBorderless/displayModeWindowed + 5 non-Latin
  M16 fills (ja/ko/ru/zh_CN/zh_TW), regenerated via i18n:gen. Kept in
  hud.options beside the fullscreen key it replaces (conscious choice
  vs hudChrome.options; seam-review NOTE).
- GPU LANE AUDIT (hidden shell, per-lane pause-or-accept, final
  adjudication): (1) maybeWarmCurrentZone PAUSE, implemented: the one
  recurring producer (position-driven, PMREM + uploads + terrain rides
  it); extracted src/game/zone_warm_tracker.ts owns displacement +
  rift-edge + hidden-freeze semantics (behavior suite: hidden frames
  answer null and consume nothing, reveal measures from the last
  VISIBLE position, rift edge preserved through a hidden span, reused
  result object = zero per-frame allocations); main.ts is a thin
  consumer, composition pinned in desktop_presentation_threading.
  (2) secondary preview prewarm ACCEPT-WITH-NOTE (input-driven, finite
  queue). (3) idle_queue scheduler ACCEPT (drain mechanism; gating it
  risks reveal deadlock, gate producers instead). (4) terrain builds
  TRANSITIVE with lane 1 (per-zone bounded batches via pendingZones;
  no independent per-frame streaming entry enqueues builds; in-flight
  batch finishes, consistent with no-cancel-in-flight). (5) shader
  compile campaign ACCEPT-WITH-NOTE, overriding the auditor's pause:
  finite + self-terminating, completing hidden buys a jank-free
  reveal, and a gate would grow over-ceiling render files. (6) icon
  prewarm ACCEPT-WITH-NOTE (one-shot catalog). (7) HUD map prewarm
  ACCEPT-WITH-NOTE (bounded per zone, preemptible). (8) options-window
  capture ACCEPT (unreachable hidden). (9) diagnostics capture ACCEPT
  (panel-gated; by-analogy confidence). (10) texture uploads
  TRANSITIVE (terminal cost of 1/2/4/5).
- SMOKE (instrumented shell, isolated userData, --ozone-platform=x11;
  BrowserWindow.prototype patched BEFORE require(main.cjs) to record
  call order, so WM cooperation is irrelevant): borderless seed:
  setFullScreen(true) at t=516 ms on a HIDDEN window, show() at 569 ms,
  end state fullscreen (setFullScreen actually works on this rig,
  unlike maximize); windowed seed: zero setFullScreen/maximize calls,
  real centered bounds captured; borderless with windowed memory:
  bounds survive the session byte-identical post-guard. PRIME-relaunch
  note: the child inherits the wrapper env and writes the result ~7 s
  after the parent exits; poll for the file. Blocker not smoke-testable
  headlessly (no pad); every transition unit-proven instead.
- REVIEWS: privacy-security PASS (0 blocking, 0 should-fix; 3 nits
  accepted to ledger: initial hidden=false self-heals within one load,
  unguarded stop() defensive-only, sync disk write matches the gpu
  setter shape; INFO: indefinite renderer-sustained hold is the
  intended semantics, display-sleep only, web wake-lock equivalent).
  frontend-seam 0 blocking, 3 should-fix ALL RESOLVED: (a) world-entry
  apply-all echo fixed by the setter idempotence + pin; (b) hidden
  pause surfacing the blocking arm at reveal ACCEPTED deliberately
  (mirrors a live teleport at teleport-sized displacement; common case
  is zero displacement; phase 8 QA re-litigates); (c) text-only pin
  fixed by the zone_warm_tracker extraction + behavior suite. NOTES:
  Reset pin upgraded to the real filter path; i18n domain choice
  recorded; touch+capability env sweep skipped (unreachable).
- PIN COLLISIONS from the lease line: electron_presentation_push whole-
  body pin and both closed-handler pins (presentation_push +
  display_push) re-pointed; implementer comments relocated OUTSIDE the
  pinned bodies (the flatteners do not strip comments).
- LEDGER for phase 8 QA: blocking-arm-at-reveal acceptance (above);
  setter idempotence leaves a window that DRIFTED from the stored mode
  (WM revoked fullscreen) unhealed until the player toggles; getter
  answers 'borderless' to an untrusted sender (gpu-getter shape);
  initial lease hidden=false window; macOS fullscreen Space semantics
  UNVERIFIED on this box (setFullScreen is the standard Electron game
  path; simpleFullscreen fallback documented as the stopping-rule
  alternative if a mac soak objects; neither stopping rule tripped on
  evidence available here); maximize+borderless cross-display exotic
  (maximized flag rides normal-bounds memory, phase 7 passthrough).
- GATE: node scripts/gate_select.mjs at 831b0c2cb1-equivalent tree (all
  phase changes staged pre-surgery) resolved the diff base to
  origin/release/v0.38.0 (235 changed paths), mode=full (broad/
  unclassified: package.json, the three patch, and the lockfile in the
  branch-vs-base diff). Pre-vitest legs green: i18n gen + freshness
  (NOTE: freshness diffs against the INDEX, so gating an uncommitted
  tree requires the regen artifacts staged; the first run failed there
  by construction), wiki, sfx, malware scan, biome changed-files.
  Full-suite fallback: 2758 files / 38194 tests, red EXACTLY the
  accepted set (9 seal suites / 14 tests + tests/monolith_budget.test.ts
  2, the OPEN ratchet decision: hud.ts +10 / renderer.ts +94 inherited
  from the base); 38064 passed, zero phase regressions. Post-abort
  turbo proofs 5/5 (check:types build:env build:server build:bot) +
  3/3 (build:bundle); browser leg standalone 19 files / 125 tests
  green. Commit bisectability verified in a throwaway worktree: c1
  55 tests, c2 87, c3 116, all green standalone; final tree byte-equal
  to the validated working tree (post-surgery status clean).

## Phase 8 QA record (2026-08-14)

Verdict PASS-WITH-FOLLOWUPS, 0 blocking in shipped code; every confirmed
finding fixed in-session. Commits: 74d8eec048 QA-start base merge of
release/v0.38.0 tip 51aa4eab13 (a large upstream window: the cheater-mark
train, UA analytics, CI work; ONE conflict, the generated i18n
pending.ts, resolved by regenerating via i18n:gen; parity 335/335 plus
the ci_workflow sparse-cone pin, the architecture guard, and tsc all
green after; upstream's only touch near the phase surfaces was analytics
code in src/main.ts), then 5d1e1c44f7 electron pin hardening, ddaa389f57
renderer pin and coverage hardening, 6736deb4d9 zone-warm honesty,
bc5a758186 setter deviation docs.

- AUDIT SHAPE: one deterministic workflow, 34 agents, zero errored: 7
  focus auditors (web-parity, blocker-lifecycle, display-mode,
  test-coverage-auditor, qa-checklist, privacy-security-review,
  frontend-seam-reviewer) and 6 ledger re-litigations in parallel, a
  merge-dedup stage, then 2 adversarial skeptics per actionable item.
  ONE empty result: the privacy-security-review custom-agentType lane
  finished without StructuredOutput (the known phase 4 QA failure mode
  recurred); re-run as a direct read-only dispatch, which delivered 0
  blocking, 0 should-fix, 3 nice-to-haves (ledgered below) and
  independently confirmed the four QA fix commits changed no runtime
  behavior (comment-only outside tests/).
- RE-LITIGATIONS: 6/6 UPHOLD. blocking-arm-at-reveal (stronger than the
  recorded rationale: the main.ts ready-bail double-gates the blocking
  screen, and in the never-resident case the blocking arm is the BETTER
  player outcome than revealing inside the residency fog);
  setter-idempotence-drift (any live-window sensitivity reintroduces the
  world-entry snap-back, because the echo and a deliberate same-value
  re-select are byte-identical at the IPC boundary);
  initial-lease-hidden-false (bounded at about 4 s by the reveal
  fallback, and a pre-reveal ping requires real pad input before first
  paint); i18n-domain-choice (hud.options is the Display card's majority
  domain, the phase 7 hudChrome precedent is an Interface-panel row, and
  the M16 fills already exist under the hud.options names);
  shader-campaign-override (finite tens of seconds hidden, 3-unit
  concurrency cap, the jank-free-reveal benefit is production-documented
  in background_gpu_queue.ts); security-nits (the stop() guard is
  structurally present since blockerId only ever holds a live claim, and
  setter spam is harm-bounded by the atomic size-capped write).
- FINDINGS: 10 actionable after merge-dedup from 40 raw; 8
  double-confirmed, 2 splits. F1 (tests/monolith_budget.test.ts red,
  hud.ts and renderer.ts over ceiling) is the OPEN inherited ratchet
  decision, re-confirmed as branch-carried, not phase-8-owned: no
  action. FIXED: F2 the createPowerSave construction was completely
  unpinned (the one line binding the lease to the real powerSaveBlocker;
  a no-op stop would have leaked the display-sleep claim with the unit
  suite green); F6 both prefs setters' save-failure guards could be
  deleted with every ordering pin still passing (the display-mode AND
  the inherited gpu-setter gap); F7 the preload junk refusal and
  gamepad-notify catch had zero body coverage (the catch is NOT
  redundant with the renderer module's: notifyGamepadActivity returns
  undefined, so the renderer-side catch can never see the invoke
  rejection); F8 the gamepad activity predicate had per-arm coverage for
  only 1 of 4 movement flags and 1 of 2 cursor dimensions; F9 the
  untrusted getter fallback literal was unpinned (a 'windowed' mutation
  passed); F10 the display-mode wiring pins read raw source, so a
  commented-out composition line still passed; F4 the zone-warm comments
  overclaimed the rift-edge guarantee (docs plus a bound-pinning test,
  see below); F3 the setter idempotence dead-click cost was undocumented
  (accepted-deviation comment landed at the guard).
- SPLIT ADJUDICATIONS: F4 (rift-exit edge lost when both crossings
  happen inside one hidden span) downgraded from behavior fix to
  docs-plus-test by the reproduction skeptic: the fog harm cannot be
  constructed (queueVisibleZonePrepares early-returns inside the band,
  evictFarZoneIfConstrained needs an overworld zone, and hidden frames
  keep the streaming lane running, so residency at reveal is never worse
  than at hide), and the accumulated displacement still routes a
  teleport-sized reveal to the blocking arm; a sticky
  saw-band-while-hidden latch stays a recorded nice-to-have. F5 (the
  world-entry apply-all loop pushes displayMode, racing the boot
  reflection) downgraded to a ledgered hardening candidate: the
  differing-value ordering requires a main process stalled from module
  eval to world entry, which also blocks the clicks needed to reach
  world entry, and invoke arrival order services the boot get first;
  the optional hardening (skip displayMode in the apply-all loop, or
  gate the push on the reflection having settled) is recorded, not
  landed, and the shell-side idempotent early return remains the pinned
  guard for the equal-value echo, which is the only reachable case.
- PROBES: 15/15 KILLED rc=1 with named failing tests via the disciplined
  driver (anchored count==1 replace, landing proof, rc plus names plus
  summary, git-restore verified per row): the lease-stop no-op, both
  setter guard mutations, both preload mutations, all four gamepad arm
  drops, the untrusted-value flip, the setHidden coercion, the
  commented-out push (run by hand: the driver's landing proof rejects a
  prefix-comment replacement whose text still contains the find string,
  a driver artifact, not a survivor), the hidden-band sampling mutation,
  and two controls through pre-existing pins. The two power_save
  `if (stopped) return;` guards were pre-declared unobservable defensive
  survivors and not scored.
- NEW LEDGER (phase 11 / follow-up candidates): main-side isFocused()
  gate on the gamepad-activity handler (trusted-side mirror of the
  renderer focus gate; a compromised renderer can otherwise hold the
  display awake while unfocused, battery drain only, display-sleep
  scope); preload notifyGamepadActivity sync-throw guard (matters only
  for a future second caller, the shipped caller wraps);
  Object.freeze(DISPLAY_MODES) (style, nothing untrusted runs in main);
  the F5 apply-all-loop hardening and F4 sticky latch above;
  blocker-lifecycle notes worth keeping: crash recovery relies on the
  60 s idle backstop (bounded, coherent after the did-finish-load
  re-derive), the renderer's 30 s notify stamp never resets on unhide
  (an up-to-30 s re-claim gap, masked in practice by keyboard or mouse
  resetting the OS idle clock), and sendPresentationState's
  destroyed-window early return leaves the hidden-rederive interval for
  the closed handler to clear; the Reset-doctrine test re-implements the
  push ternary (a coordinated swap of both reds nothing); the guide
  settings page has no Display Mode row, matching the GPU-pref
  "guide documents the web experience" convention.
- GATE at bc5a758186: gate_select resolved mode=full; pre-vitest legs
  green; the full-suite fallback red EXACTLY the accepted set (9 seal
  suites / 14 tests plus tests/monolith_budget.test.ts 2, the OPEN
  ratchet decision), 38347 passed, zero phase regressions; post-abort
  turbo proofs 5/5 (check:types build:env build:server build:bot) plus
  3/3 (build:bundle); browser leg standalone 19 files / 125 tests
  green; tree committed-clean throughout, all probe mutations restored.
- Neither macOS stopping rule tripped: no new Space-semantics evidence
  surfaced (the mac soak stays unverifiable on this box; simpleFullscreen
  remains the documented alternative if a mac soak objects).

## Phase 9: OS notifications + what's-new link (2026-08-14)

- STATUS: done. Commits 84fe7cae86 (feat(desktop): validated rate-limited
  os notification channel), dd235dfdeb (feat(game): notify unfocused
  players of ready updates and party invites), 175a414a7f (feat(ui):
  what's-new link on the update-ready toast), plus this docs commit.
  Tree committed-clean, LOCAL-ONLY intact.
- BASE MERGE 105306e494 took origin/release/v0.38.0 tip e56010cec1 (108
  commits; ancestry guard held over the previous tip 51aa4eab13; the
  remote moved between ls-remote and fetch, re-fetch settled it). Seven
  conflicts: src/game/desktop_download.ts (ours: the __APP_VERSION__
  derive supersedes upstream's 0.38.0 hardcode bump), .github/workflows/
  ci.yml + the tests/ci_workflow.test.ts SPARSE_CONE literal (upstream
  pruned nine unreferenced docs/screenshots cone rows; our still-
  referenced desktop-client-update-phase5-low row kept in all five
  blocks and the pinned literal), pnpm-lock.yaml (ours: the entire
  upstream delta was the r165 patch-hash re-mint), patches/
  three@0.185.1.patch + tests/three_compile_async_patch.test.ts
  (upstream added a per-pass notReadyThisPass program-dedupe to the r165
  compileAsync patch: one COMPLETION_STATUS_KHR verdict per DISTINCT
  pending program per pass; ported onto the r185 patch via the pnpm
  patch flow with count==1 anchored replaces, all upstream needles land
  exactly once in the patched module, both three.cjs count controls hold
  at 1, and the pin test gained the re-worded third dedupe test with the
  guard+delete pair needle), and the generated pending.ts (i18n:gen
  regen). After the merge: parity 336/336 (the suite grew one member
  upstream), tsc green, patch + ci_workflow suites green.
- PHASE-START DECISION (user, via AskUserQuestion, 2026-08-14): the
  what's-new link opens the GITHUB RELEASES page, option (a), most
  consistent with the existing GitHub-releases News & Updates pipeline.
- CHANNEL (electron): desktop-show-notification invoke handler in
  main.cjs: trustedSender first line returning false by value; kind
  whitelist ('update-ready' | 'party-invite'); typeof checks on title/
  body; clampText caps 120/240 (flattens control chars, three-dot
  suffix on clamp); empty-after-flatten refusal; live-window +
  !isFocused() gate (the trusted-side mirror of the renderer gate);
  Notification.isSupported(); notifyGuard.allow(kind) LAST before show
  so only a real show stamps; click routes to focusMainWindow only.
  Preload showNotification mirrors the validation, rebuilds a fresh
  {kind, title, body} literal (hoisted to a const so the invoke stays
  single-line for the channel-scan regex), swallows the rejection and
  guards sync throws. electron/notify_guard.cjs + .d.cts: pure per-kind
  rate limit in the power_save pattern (injected clock, >= boundary,
  NOTIFY_MIN_INTERVAL_MS 10000, a refused call never moves the stamp,
  TypeError boundary validation). Review hardening: flattenControlChars
  (diagnostics.cjs) now also strips bidi embeds/overrides/isolates,
  zero-widths, and U+FEFF, with an executed clampText test arm; the
  biome-ignore suppression sits directly above the regex literal (biome
  wrapped the call and the comment stopped reaching the line: gate-
  caught twice, format the .cjs THEN check the suppression line).
- RENDERER: src/game/desktop_notifications.ts, pure decision core +
  thin init on the desktop_gpu_status module-scope-latch pattern. Core:
  partyInvite takes a real SimEvent and narrows inside (the hud pid
  gate mirrored exactly: pid !== undefined && pid !== localPid skips),
  updateReady fires on transition-into-ready once per version.
  shouldNotifyDesktop(env) = hidden || !focused; hidden comes from the
  desktop presentation latch (document.hidden never flips in the shell,
  backgroundThrottling:false), focus from document.hasFocus(), both
  sampled at fire time. Init feature-checks the lone action method
  singly, folds its own UpdateToastState via the existing
  reduceUpdateToast, and arms desktopNotifyOnSimEvents(events,
  localPid), a no-op-until-armed module function called from the two
  main.ts event sites (offlineSim.playerId offline, net.playerId
  online; each argument form pinned exactly once). main.ts delta 3
  lines (11456 vs ceiling 11490, 34 lines headroom left for phase 10).
  i18n: desktop.notify.{updateReadyTitle,updateReadyBody,
  partyInviteTitle,partyInviteBody} + desktop.update.whatsNew, English
  + all five M16 non-Latin fills, one i18n:gen pass; nothing touched
  DEFAULT_SHELL_STRINGS (per-call strings are not the crash set).
- WHAT'S-NEW: a plain external anchor on the ready card
  (#desktop-update-whats-new, GITHUB_RELEASES_URL, target _blank, rel
  noopener noreferrer), render-only off mode==='ready'; the reducer
  gained nothing and the update_events whitelist was NOT extended.
  Adjudicated deviation (recorded in-code): NOT the wiki confirm-first
  hop; the card's own Restart action is a strictly more disruptive
  unconfirmed click, and the label 'See what changed in your browser'
  names the hop (the seam review killed the original 'no Hud to confirm
  through' rationale: the #prompt-stack modal seam exists pre-game).
  GITHUB_RELEASES_URL moved to src/ui/news_feed.ts (its natural home);
  charselect_news imports it. The link joined the desktop-update
  family's coarse-pointer touch floor (min-height 40px arm).
- REVIEWS (both direct Agent-tool dispatch, fresh agents, per the
  phase 8 QA workflow-schema lesson): privacy-security-review 0
  blocking, 2 should-fix (flattener bidi gap FIXED with test; the
  normalizeNotification pure-module extraction LEDGERED as precedent-
  consistent), 3 nits (2 comment fixes landed, click-listener retention
  ledgered as rate-limit-bounded). frontend-seam-reviewer 0 blocking,
  5 should-fix (touch floor FIXED; anchor rationale + lost safety copy
  FIXED via comment rewrite + label rename incl. 5 locale fills; core
  type-decoupling FIXED, SimEvent narrowed, test casts removed with
  real union-member fixtures incl. readyCheckStart/guildInvite; main.ts
  wiring pin FIXED to per-argument-form pins; the away-gate ordering
  pin ADJUDICATED DOWN as constant-true: 'ready' is terminal in the
  fold and the stamp dies with the composition, so the ordering is
  unobservable in any reachable scenario, comment now says so), 5 notes
  (constant relocation landed; purity-registry, aria-live announcement,
  and perf-window placement ledgered).
- SMOKE (instrumented shell, phase 8 wrapper style: isolated userData,
  --ozone-platform=x11, ipcMain.handle capture + controllable
  BrowserWindow.prototype.isFocused + call-through Notification.show
  patched BEFORE require(main.cjs)): 6/6 arms in one run on this
  GNOME/Wayland box (Notification.isSupported() true): untrusted frame
  refused; update-ready unfocused SHOWN (real OS notification); same-
  kind repeat inside 10s dropped; party-invite (distinct kind) SHOWN
  with U+0007/U+0000 flattened to one space and a 300-char body clamped
  at 240+'...'; focused drop; unknown kind refused. Exactly 2 OS
  notifications total. macOS behavior stays contract-level (isSupported
  gate + documented API); no signing was needed for local verification,
  neither stopping rule tripped.
- GATE (committed-clean tree, three commits + bisectability of both
  intermediate trees proven in a throwaway worktree): gate_select
  resolved mode=full (lockfile in the diff base range); pre-vitest legs
  green (i18n freshness, manifests, malware scan, biome-changed
  rc=0); full fallback red on 9 files / 13 tests = the accepted set
  MINUS ONE: the 8 lockfile-seal suites (11 tests) + monolith_budget
  (2: renderer.ts 13785 vs 13700, hud.ts 19510 vs 19490, both
  inherited), 38507 passed. tests/mob_portrait_source_manifest.test.ts
  is GREEN on the merged tree (upstream's portrait revert train,
  d0a061ff6c restoring PR 3307 behavior, healed the fingerprint): the
  NINTH seal suite left the accepted red set, which is now 8 suites /
  11 tests + monolith 2. GATE ENV TRAP (cost two runs): export
  BROWSER_PATH before gate_select or four browser-driving suites
  (gpu_hitch_capture, perf_hitch_soak, perf_hitch_store, profile_mode)
  die at file level on browser discovery; with it exported all four
  pass (128 tests). Post-abort turbo proofs rc=0 (check:types
  build:env build:server build:bot, then build:bundle); browser leg
  standalone 19 files / 129 tests green (grew 4 upstream; one
  contention-flaky run red at file level when chained directly behind
  the turbo builds, clean in isolation).
- LEDGER for phase 9 QA / phase 11: normalizeNotification extraction
  (move the payload normalization into notify_guard.cjs so the
  refusals become executed tests; today they are source pins in the
  file's established style); Notification click-listener retention
  (bounded to ~6/min/kind by the guard); desktop_notifications purity
  registry membership (matches the unregistered gpu_status precedent;
  a desktop_notify_core.ts split would earn the UI_PURE_CORES guard);
  the ready-card aria-live region now announces the link label on the
  ready transition (defensible, one more read-aloud item); the sim-
  event scan sits outside the perf beacon's events window (invisible
  cost, negligible today); notification preferences UI DEFERRED by
  design (no toggle; OS-level muting is the only off switch today);
  screenshots for the eventual PR deferred to the pre-PR pass (the
  ready-card link needs a live shell update event; capture when the
  program goes public per the LOCAL-ONLY rule).

## Phase 9 QA record (2026-08-14)

Verdict: PASS-WITH-FOLLOWUPS, 0 blocking. Every confirmed finding fixed
in-session; both relitigations UPHOLD; the security follow-up round found
0 blocking and its one LOW was closed in-session.

- QA-START MERGE: absorb f79feed36f of origin/release/v0.38.0
  tip 54a729294d (3 commits: the PR 3394 gate-select merged-leg platform
  split, scripts and their pin test only). Ancestry guard held
  (e56010cec1 ancestor of 54a729294d), no conflicts, parity 336/336
  green after, tsc green, tree clean.
- WORKFLOW AUDIT: 17 agents, zero losses (4 default-agent lanes with
  inlined charters per the phase 8 QA schema lesson; merge-dedup; 2
  independent skeptics per actionable finding). 36 raw findings, 34
  after dedup, 6 actionable, 6/6 double-CONFIRMED by both skeptics, 0
  splits, 28 passive rows adjudicated orchestrator-side.
- FIXES (six commits, each mutation-verified post-commit):
  - b99ba01bf5 (TB1+TB3+TB4): flattenControlChars widened to the
    U+2028/U+2029 line separators (its own single-line contract was not
    met) plus the margin classes (soft hyphen, ALM, Mongolian vowel
    separator, word joiner and invisible operators, interlinear
    annotation, tag characters U+E0000-U+E007F via the new /u flag);
    clampText stopped splitting surrogate pairs at the cap boundary.
    Executed arms per class.
  - 51a62198b0 (TB2+TB7+TQ-3+TQ-4+TB6): escapeNotificationMarkup
    entity-escapes ampersand-first on linux only (freedesktop daemons
    may parse body markup; other platforms treat text as plain), the
    preload pre-caps title/body at 512/1024 making the both-sides-capped
    claim true, the handler slice guards its terminator (an unfound
    close would silently pin the whole file), notification.show() and
    click-before-show order pinned, main's payload-object refusal
    pinned, preload pins scoped to the method's own slice.
  - 7a1870fa07 (bc2, the one behavior defect): a spectating session's
    net.playerId is the watched player's pid, so an away spectator got a
    'you were invited' OS toast for the fighter's invite; the online
    call site now carries the neighboring net.spectating === null gate,
    pinned in the gated form. The hud's own in-window prompt behaves the
    same and predates the branch; only the OS escalation was phase 9's.
  - 9a9beb8381 (bc5+TQ-2+TQ-6+bc3+bc6+TQ-8+TQ-9): older-shell split arm
    (invites live without onUpdateEvent), versionless-ready fires
    exactly once (pins the null initial), already-ready newer version
    quiet at core AND composed fold (pins the terminality premise the
    away-gate adjudication rests on), guard junk-kind no-cross-effect
    arm, backwards-clock fail-safe pin; comment honesty: every real
    partyInvite emission stamps a pid (src/sim/social/party.ts, so the
    no-pid arm is shape robustness, NOT the offline case), and the
    compose-last position in shell integration is defensive.
  - acad2656b0 (L4): ja_JP partyInviteBody names the invitee
    (あなたを), resolved bundle regenerated via i18n:gen.
  - 094cd88a46 (security LOW): the preload cut can split an astral pair
    and the flattener can collapse a run so the string lands UNDER the
    clamp cap with the lone high surrogate intact (review probe: 450
    zero-widths collapse to one space); both clampText exits now strip
    a trailing lone high surrogate; entity-smuggling forms pinned
    (&lt; and &#60; both arrive dead); escape-after-clamp rationale
    recorded in the handler comment.
- RELITIGATIONS, both UPHOLD: (1) away-gate-before-core ordering is
  CONSTANT-TRUE ('downloaded' always folds to ready, mode ready blocks
  every other event, the dismiss/expire paths are card-local and never
  enter the notify subscription's fold, the stamp dies with the
  composition); now also PINNED at the fold level by the
  second-downloaded-while-ready arm. (2) The plain-anchor whats-new hop
  survives: setWindowOpenHandler returns action deny unconditionally and
  routes http(s) through shell.openExternal, so the target=_blank anchor
  can never mint a BrowserWindow; the news-surface precedent and the
  Restart-is-more-disruptive rationale both stand.
- REVIEWS: qa-checklist (fresh, over the final diff) READY, 0 blocking,
  0 should-fix, 4 observations dispositioned: escape-after-clamp
  expansion recorded in the handler comment; title escape kept as
  defense-in-depth (freedesktop summary is plain text; both titles
  carry no markup chars in any locale); the name-charset premise
  verified first-hand (server/auth.ts:155 pins names to
  /^[A-Za-z][A-Za-z' -]{1,15}$/, no markup characters possible); the
  RTL note ledgered below. privacy-security-review (fresh, direct
  Agent-tool dispatch, over the six QA commits) 0 blocking: probed /u
  lone-surrogate safety (no throw, byte-identical pass-through), zero
  legitimate uses of the twelve newly stripped code points across every
  catalog and overlay, entity-smuggling neutralization, and the
  spectator gate's exactness (spectating: string | null with definite
  initializer, exactly two call sites, update trigger correctly
  unaffected).
- PROBES: 23/23 killed rc!=0 with named failing tests (13 matrix rows
  from the audit incl. M8 drop-show which the new pin converts from
  designed survivor to kill, 8 fix-arm rows P1-P8, 2 F-rows both
  directions on the trailing-surrogate strip). Driver: anchored
  count==1 replaces, landing grep, git-checkout restores against a
  committed-clean tree, orchestrator-run.
- SMOKE: 7/7 arms on the real shell (instrumented wrapper re-run,
  isolated userData, --ozone-platform=x11): the six phase 9 arms
  reproduced (untrusted refused, update shown, rate-limited, dirty
  strings flattened + clamped, focused drop, unknown kind refused) plus
  the new arm 7 after a 10.5s pace wait: markup + LS body arrived on a
  REAL OS notification entity-escaped with the LS flattened
  (&lt;b&gt;Grask&lt;/b&gt; &amp; ...), showCount exactly 3. The PRIME
  child wrote arm 7 ~15s after the parent exited; poll the file.
- GATE (full fallback, BROWSER_PATH exported): red reconciles EXACTLY
  to the accepted set (8 lockfile-seal suites / 11 tests + monolith 2:
  renderer.ts 13785/13700 and hud.ts 19510/19490, the open maintainer
  decision) plus THREE contention flakes each proven green standalone
  on the same tree (tests/parity/coverage_c.test.ts druid_engines,
  tests/chronomancy_balance_targets.test.ts fixed-seed sustain at 120s,
  tests/item_art_audit_builder.test.ts fresh-checkout rebuild), which
  also rules out a semantic collision (a collision is deterministic).
  38644 passed. One cosmetic gate-plumbing line noted: an
  "error: pathspec 'src/ui/i18n.resolved.sha256'" git message at the
  vitest abort point, upstream-owned (arrived with the PR 3394
  platform-split leg), no effect on the verdict; mention to the
  maintainer if it persists.
- NEW LEDGER (phase 11 / future): RTL-locale caveat: the widened
  flattener strips ALM and would strip legitimate bidi controls if an
  RTL locale ever lands (revisit with the RTL plan); Windows toast
  escaping rests on Electron building toast XML via DOM insertion (an
  external fact; a Windows shell smoke with markup in the body would
  settle it); release-tier pending fills for the five notify keys owed
  at the maintainer's release fill (L3); TB9 stamp-without-show if the
  Notification constructor throws after allow() stamped (theoretical);
  TB10 renderer once-per-version latch stamps before the fire-and-forget
  send, so a main-side refusal (focus race, rate collision) permanently
  suppresses that version's toast (functional miss only, the card still
  informs); bc8 discarded unsubscribe hooks make the composition
  non-re-entrant (unreachable today); TB5 zalgo combining-mark stacking
  accepted under the hostile-page model (stripping would corrupt
  legitimate combining sequences); bc4 second-version-while-ready never
  re-notifies, now pinned as deliberate.

## Phase 10: Discord Rich Presence, in-house (2026-08-14)

- Base merge f088ced82d of release/v0.38.0 tip 6d309b945c (PR 3396 CI
  shard rebalance only; no electron or desktop paths). Post-merge proof:
  parity + ci_workflow + ci_shard_partition 374 tests green, phase5-low
  sparse-cone row intact in all five ci.yml blocks and the pinned
  literal, the vite __APP_VERSION__ define intact.
- USER DECISION at phase start (AskUserQuestion): presence defaults ON;
  the Options Interface row is the off switch; Discord activity sharing
  still gates visibility. Recorded in state.md OPEN items.
- LIVE PROBE (resolve-first item, ran against the real flatpak client on
  this box, logged in): the locked wire protocol verified byte for byte
  (LE opcode + length framing, HANDSHAKE v1, DISPATCH READY). VERDICTS:
  a registered but UNVERIFIED application id gets SET_ACTIVITY ACCEPTED
  (no approval gate exists; neither stopping rule tripped; the rendered
  "Playing X" name comes from the app registration name), an
  UNREGISTERED id gets opcode 2 CLOSE code 4000 BEFORE READY (now the
  manager terminal invalid-client state), and clearing is SET_ACTIVITY
  with the activity key omitted (accepted, data null).
- Feature commits: 6e8446290a feat(desktop) pure codec + injected-IO
  connection manager + two trusted invoke channels + additive store
  field discordPresenceEnabled (version stays 1); ecfb69249f feat(game)
  builder + pure trailing coalescer + armed-latch init in
  desktop_shell_integration + two main.ts feed sites (+9 lines,
  11467/11490) with the online site spectator-gated; 48501d7909
  feat(ui) options row + note behind the both-methods capability, dual
  armed GENERAL_KEYS pins, two hudChrome.options keys with five M16
  fills, resolved artifacts regenerated.
- Reviews (direct Agent dispatch, both delivered first try with the
  SendMessage-to-main charter): privacy-security 0 blocking / 4
  should-fix / 5 nits; frontend-seam 0 blocking / 4 should-fix / 4
  notes. ALL eight should-fixes landed as review hardening commits
  29a98dc470 / 718ca30177 / b2222b99db: executed-whitelist extraction
  sanitizeDiscordActivity (the main handler key-set was source-pinned
  only; now Object.keys pinned by execution incl. a proto-key arm),
  unix socket candidates must be own-uid sockets before dialing (a /tmp
  squatter could receive frames or force the terminal state), peer
  CLOSE/ERROR text clamped to 200 before logging, details cap 125 (the
  clampText ellipsis rides ON TOP of the cap, so 128 could emit 131 and
  Discord refuses past 128), session-clock disclosure added to the
  privacy note in English + all five fills (timestamps.start renders a
  public elapsed clock; the note read as an exhaustive list without
  it), boot reconciliation (init pushes the stored setting once, so a
  divergent shell store heals and the off switch drops the connection
  from startup), blank-entity origin gate (online net.player falls back
  to blankEntity(-1) at 0,0 pre-snapshot; a poll there published
  zoneAt(0,0) and the 15s window then suppressed the correction; the
  poll now bails on id at or below 0, id positivity verified in both
  hosts), and the cached enabled flag (new Settings() left the 1 Hz
  poll; the push helper refreshes the cache, being the single write
  path's only exit).
- Mutations 26/26 killed across four rounds (electron implementer 8 + 6
  on its fixes, orchestrator 9 cross-half + 3 on the fix pins), every
  verdict rc!=0 with named failing tests, every restore verified, tree
  clean after each round.
- Live smoke of the SHIPPED manager module against the real client:
  candidate walk found the flatpak socket unaided, READY, acked send,
  requested clear trailed to exactly the 15s boundary, OFF switch
  cleared immediately, cancelled the pending re-set, and disconnected.
  (Discord also clears presence when the connection drops, so a dispose
  mid-window leaves nothing stale.)
- Bisectability: c1 93 tests, c2 159 tests, each green with tsc rc=0 in
  a throwaway worktree; c3 is the validated head.
- NEW LEDGER (phase 10 QA / phase 11): pendingNonce has no watchdog (a
  peer that accepts a send and never echoes the nonce freezes presence
  at the last value for that connection; fails stale, not open); the
  prefs-writing channel has no rate limit (same pre-existing shape as
  the gpu opt-out handler); the new import naming sits beside the
  pre-existing discordPresence GUILD-WIDGET symbol family in main.ts
  (grep hazard only); encodePong sits in an un-wrapped data handler
  (deep-nesting crash hypothesis probed and DISPROVEN, try/catch would
  be belt-and-braces only); both feed calls sit outside the perf trace
  window (invisible cost, currently trivial); language-switch staleness
  is stated in the module header (the dedupe key would need the
  resolved name to correct sooner); dungeon presence deliberately holds
  the entry region (naming dungeons is a design call); the MAIN.TS
  FLATTENER HAZARD: a line comment containing a bare /* near line 3144
  makes block-comments-first stripping swallow to the next close marker
  (~1950 lines), so any EXISTING main.ts pin between roughly 3144 and
  5094 built on the block-first flattener is currently unenforceable;
  our pins strip line comments first and were mutation-verified; AUDIT
  the pre-existing pins in that range (phase 11 candidate);
  release-tier pending fills owed for the two new options keys (L3
  queue); the win32 named-pipe namespace cannot be stat-gated (no
  ownership check exists there; recorded, not fixable in-process).

## Phase 10 QA record (2026-08-14)

- Verdict: PASS-WITH-FOLLOWUPS, 0 blocking. Both stopping-rule watches
  (unclamped inbound peer text reaching a sink, any pre-window socket
  touch) and the zero-dependency rule verified clean by every lane.
- QA-start absorb d29421bcff of release/v0.38.0 tip 2ee438e32c (PR 3397
  delve-marks-window-bonus, sim-side delve economy only; no electron or
  desktop paths). Parity re-run after the merge per standing rule:
  parity + ci_workflow + ci_shard_partition 374/374 green.
- Workflow audit: 29 agents, ZERO losses (6 audit lanes as DEFAULT
  workflow agents with inlined charters + 1 merge-dedup + 2 adversarial
  skeptics per actionable finding, distinct lenses: reproduction and
  design-intent). Lanes returned roughly 70 verified-ok rows, 25
  informational items, and 11 actionable findings; 11/11 survived both
  skeptics (7 double-CONFIRMED, 4 severity splits adjudicated by the
  orchestrator, reasoning below).
- EIGHT FIX COMMITS, each with its suites green at commit and every
  behavior mutation-verified after commit:
  - f2ab4113e3 (A2): a candidate that ACCEPTED and closed pre-READY
    fell to scheduleRetry, whose timer restarts the walk at slot 0, so
    an accept-and-drop squatter pinned the walk forever (win32 has no
    ownership gate). A pre-READY hangup now advances the walk in the
    same pass; exhaustion still backs off. The design skeptic's
    residuals (silent-hold squatter, READY-answering squatter) stay
    ledgered as the upheld win32 exemption.
  - 8b8591357c (A11): every pre-READY CLOSE went terminal
    invalid-client; only code 4000 was probe-confirmed as the refusal
    shape. Terminal is now code 4000 or an unreadable payload (fail
    closed); state.md contract line re-scoped in the same commit.
  - 341ea5cba1 (A1, the one re-litigation PARTIAL OVERTURN): no
    renderer path ever sent a leave-world clear, and the real logout is
    a location.reload(), so the recorded "old zone up to 15s" was
    actually app-lifetime staleness with a ticking session clock at the
    character screen, while the main.cjs comment documented the unsent
    clear. Fixed three ways in one commit: the snapshot carries inWorld
    and the core clears once (forgetting dedup memory) when a published
    world goes away; initDiscordPresence sends one boot-time
    reconciliation publish(null) because the shell process outlives the
    reloading page while holding the last activity; the main.cjs
    comment is now true. The blank-entity no-publish guarantee is
    unchanged: the zone is never resolved while out of the world.
  - 6090d27cf8 (A3-A7 test hardening): fake socket records op order and
    can throw on write, so the clear-BEFORE-end contract and both
    write-throw recovery arms are executed (A3; a real net.Socket
    surfaces write-after-end as an async error the teardown never
    sees, so the order pin is the only guard); DISCORD_LOG_TEXT_MAX
    pinned to its 200 literal (A4: both bounded-log arms compared
    against the import, the wire-name-constant class); ipc_channels
    discord pins comment-stripped line-first and the will-quit dispose
    pin scoped to its handler slice (A5); the coalescer 15s default
    pinned from below at the 14999/15000 boundary (A6); the
    re-enable-inside-the-window blank pinned as DELIBERATE with its
    rationale (A7); the 1 Hz poll throttle sharpened to the exact
    999/1000 boundary so POLL_INTERVAL_MS is load-bearing.
  - 7ba7873fdf (A9, adjudicated between the split skeptics): the
    WOC_DISCORD_APP_ID row lands in docs/desktop-release.md
    (registration-name requirement, inert-when-unset design, the
    unprovisioned-build toggle caveat), while row-hiding and the
    packaging stamp stay with the OPEN registration item per the design
    skeptic: the operator line's final content depends on the unmade
    packaging decision, and hiding the row needs a status channel the
    fire-and-forget bridge deliberately lacks.
  - 931d9eff70 (PROT-3, unpromoted but decisive): high-bit length words
    pin the UNSIGNED header read; a readInt32LE regression walks the
    decode loop backward forever and would surface as a vitest HANG in
    the fuzz arm, not a red.
  - ea1b7bb258: the fresh privacy review caught the asymmetry A11 left
    open (a CLOSE-answering squatter could still pin the walk via the
    pathIndex-0 retry); a transient pre-READY CLOSE now advances the
    walk too, symmetric with the hangup arm.
  - aa03f2db2a: the fresh qa-checklist caught the ipc_channels
    flattener half-applied inside its own file; the shared preload and
    mainSide constants now strip too, so all 19 cases refuse commented
    text.
- Re-litigations: (a) PARTIAL OVERTURN, fixed as A1. (b) dungeon
  entry-region hold UPHOLD (privacy-safe, no new i18n surface in a
  zone-only phase). (c) refuse-malformed-timestamps UPHOLD (the sole
  legitimate producer always emits a safe positive integer; stripping
  would silently publish a wrong-moment public clock). (d)
  id-gate-after-throttle UPHOLD (the stamp can delay the FIRST real
  publish by at most one sub-second poll, once per world entry;
  lastEmitAt never advances while gated). (e) renderer-wins boot
  reconciliation UPHOLD (the options row reads renderer Settings, so
  that is the store of user intent; no stale-acted window exists
  because the shell cannot dial before the renderer's first
  setActivity; honest cost, recorded: a wiped localStorage flips a
  previously-off player back to default ON, visible in the row).
- A7 RULING (the design ruling the new arm pins): the re-enable-within-
  15s blank window is DELIBERATE; it trails Discord's real limit (an
  earlier resend would be silently dropped there) and matches the
  limits-survive-lifecycle doctrine the shell already records. A future
  immediate-resend decision must rewrite the pinned arm.
- A8, the monolith red, re-attributed by both skeptics: hud.ts 19510
  over its 19490 ceiling and renderer.ts 13785 over 13700 PREDATE phase
  10 entirely (already red at f30c1d0f87, the phase 9 QA docs commit;
  the release tip is green at 19483/13691, branch growth +27 hud / +94
  renderer, attributed by the checklist reviewer to the
  presentation-lifecycle phases). The earlier state.md numbers
  (13853/13764, 19500/19490) were stale against upstream's re-pinned
  ceilings; refreshed. Still the recorded OPEN maintainer decision;
  hardens to blocking at PR time; monolith_budget rides gate_select's
  always-run floor (fs-scan classification, verified through the real
  collectSuiteVisibility), so no selection path dodges it.
- A10 SIZED for phase 11, fix deferred per the diff-scope doctrine (the
  design skeptic's ruling; the hazard predates the range and masks no
  live offender, the blind range scans clean). Live blast radius: ONE
  suite with real consequence, tests/quest_link.test.ts, whose
  RAW_ENCODER_RE negative sweep is vacuously blind over src/main.ts
  3145-5093 today (probe-proven: planted encoder calls at 3500/4400/
  5000 invisible, at 2000/6000 caught), plus TWO currently-clean
  block-first carriers (tests/desktop_display_mode_sync.test.ts,
  tests/language_fanout_registry.test.ts, both with zero pins in range
  today). Everything else touching main.ts text reads it raw or strips
  safely (survival matrix in the audit artifacts). Phase 11 sweep is
  small: flip three stripComments bodies to line-comments-first, one
  planted-mutation check each near line 4400, optionally extract a
  shared line-first helper (12+ local variants across tests/).
- Mutation probes 19/19 KILLED, every verdict rc=1 plus named failing
  tests plus the vitest summary line; anchored count==1 replaces with
  landing proof, per-probe git checkout restore with a clean-tree
  check. The set: the audit's 11 nominations (P6/P7/P8/P9/P10 were
  PREDICT-GREEN vacuity proofs pre-fix and now EXPECT-FAIL kills; P12
  scored a kill on its decisive walk-advance arm, the exhaustion arm
  passes under the revert by design since backoff-at-end is also the
  revert's immediate state) plus 8 probes over the new fixes (walk
  advance revert, terminal-scope inversion, world-gone arm dead, boot
  clear dropped, dispose parked outside will-quit, clear-write-after-
  end reorder, write-throw retry dropped, CLOSE-advance revert).
- Fresh reviews over the QA commits, both delivered first-try with the
  SendMessage-to-main charter line: privacy-security-review 0 blocking
  / 0 should-fix (notes: the win32 handshake can now reach up to 10
  pipes in one pass carrying only {v, client_id}, no PII pre-READY;
  the CLOSE asymmetry, fixed same-day; the new debug line is
  number-only, clamped, backoff-bounded). qa-checklist READY, 1
  should-fix (fixed as aa03f2db2a); its adversarial pass verified the
  boot-clear double-fire on a disabled session harmless AND pinned
  ([[null],[null]]), all four disable/world-gone orderings (one
  redundant-clear ordering ledgered cosmetic), the isLive() guard
  against a double walk advance, and the main.cjs comment now true.
- Live re-smoke of the FINAL tree against the real flatpak client
  (throwaway registered id, closed after): smoke A walk found the
  socket unaided, READY at 0.4s, SET_ACTIVITY acked, a requested clear
  trailed to t+15.3s, OFF at t+19s cleared immediately and cancelled
  the pending re-set, final state off with one connect attempt. Smoke
  B, NEW, proves A2 live: a real accept-then-close squatter planted at
  XDG_RUNTIME_DIR/discord-ipc-0 was dialed exactly once, the walk
  advanced in the same pass, READY landed on the real flatpak socket,
  no re-dial loop.
- Validation at final HEAD aa03f2db2a: the 11-suite phase 10 set 348
  passed / 3 skipped; tsc rc=0 at final HEAD and across every slice's
  TypeScript surface. Gate: gate_select's full fallback run TWICE (once
  mid-fix at 7ba7873fdf, once definitive at final HEAD aa03f2db2a),
  both red EXACTLY the accepted set: 9 files / 13 tests = the 8 asset
  seal suites (11 tests) + monolith_budget (2), with 38777 passed and
  ZERO contention flakes either run. Post-abort turbo proofs green
  (check:types + build:env + build:server + build:bot 5/5, then
  build:bundle 3/3); browser leg standalone 19 files / 129 tests green
  with BROWSER_PATH exported.
- NEW LEDGER (adds for phase 11): the A2 residual squatter shapes
  (silent-hold denial would need a handshake timeout; READY-answering
  interception is the upheld win32 ownership exemption; PROT-5 lstat
  is optional defense-in-depth, fs.protected_symlinks covers the
  symlink arm on shipping kernels); PROT-6 PONG echo is fire-and-forget
  1:1 write amplification, own-uid gated on unix, unbounded-peer-rate
  in principle on win32; SPECTATE freezes the last real zone with the
  clock ticking rather than clearing (pre-existing gate shape; the new
  nothing-stays-published doctrine does not extend to it, maintainer
  ruling wanted); reconnect-resync blanking (ClientWorld answers the
  placeholder during a resync window, so presence clears then waits
  out the 15s floor before republishing; arguably correct, not
  verified live); the publish-leave-disable redundant second clear
  (harmless, uncovered, cosmetic). The phase 10 ledger items all
  VERIFIED-AS-RECORDED and held: pendingNonce fails stale (reset on
  socket teardown and READY), prefs channel rate limit parity with the
  gpu shape, guild-widget adjacency grep-hazard only, un-wrapped data
  handler crash disproof holds for current code, feed cost on
  throttled frames is a Date.now() and a comparison, language-switch
  staleness stated in the header, win32 stat exemption confirmed.

## Phase 11 record (2026-08-14, final integration QA; closes the packet)

Verdict: PASS. Every qa-checklist.md item evidenced by a real run, the deferred
seal re-mint executed over the final lockfile, four user rulings recorded, one
cross-feature defect found and fixed, and the final gate has zero unexplained
red. Orchestrated as a deterministic Workflow: 8 read-only audit lanes with 2
independent skeptics (repro lens + design lens) per actionable finding, 56
agents, zero losses; 15 findings survived verification, 9 refuted.

Base merge: f2c84ca190 took release/v0.38.0 tip 0d615aa7dd (market-house
redesign train only; the one conflict was the generated i18n pending.ts,
resolved by regen). Parity set re-ran green 374/374 after the merge. Lockfile
unmoved by the merge, so the branch lockfile was final before the mint.

Commits this phase: 328476e162 flattener sweep, b9c32cefbf pre-paint reveal
fix, 8cd57b704d GPU-force escape hatch, 7229caa61a stripper adjacency
hardening, 755fa4cc72 monolith ceiling raise, 3c6040428f the seal re-mint,
e662d43105 doc flips, plus this docs record.

USER RULINGS (2026-08-14, all four put as one decision round; a fifth
correction round followed):
- r181/r185 lighting: ACCEPTED for the live game (frozen showcase pairs in
  tmp/r181-showcase-frozen/ were the decision set). The captures sub-decision
  was CORRECTED mid-phase: the initially approved re-shoot proved structurally
  impossible against the seal's own architecture (the polish evidence is a
  FROZEN historical A/B: both arms pin one frozen capture-identity literal,
  the before-arms pin a historical source revision whose pre-polish content no
  longer exists, and the suite pins its divergence from the live town as a
  deliberate literal, never recaptured through the bank rebuild). The user
  approved the corrected path: provenance re-record + this recorded ruling;
  the interim-reconcile "must be RE-SHOT" rule text mis-modeled the seal and
  is corrected in state.md.
- LOW tier: ACCEPTED with the residual routed upstream (same-day control pair:
  open-run -18.8 pct, combat -17.4 pct, 1-pct lows halved-to-thirded;
  attribution: upstream v0.37/v0.38 moving/streaming perf mass + the r185
  low-tier split; the packet's own LOW retune improved LOW and is monotonic).
  Name it in the PR body for the maintainer's player-performance packet.
- GPU-force no-boot escape hatch: LANDED (8cd57b704d). WOC_DISABLE_GPU_FORCE=1
  strict-checked once, leads BOTH lever guard chains ahead of the stored
  opt-out (works even with an unreadable prefs file), skips one launch without
  touching the stored preference; docs rescue section updated; pins
  mutation-verified (strict-literal M1 and demoted-arm M2 both killed named).
- Monolith ratchet: ceiling raise PREPARED as the maintainer-decision surface
  for PR review (755fa4cc72; hud.ts 19510, renderer.ts 13785, exact current
  counts so any further growth reds; rationale in the commit and the test
  comments). monolith_budget green 13/13.

THE SEAL RE-MINT (3c6040428f, one commit per the runbook's dirty-input
tripwire): six export_entry.js PCFSoftShadowMap -> PCFShadowMap renames FIRST
(five are hashed fingerprint inputs; banker_chest is the unhashed sixth); the
27-GLB in-place re-stamp (every byte length preserved, tank at 1161436);
the 35-digest sweep (7 family fingerprints incl. the no-GLB surface atlas, the
Fenbridge support-map fingerprint, 27 GLB shas) over 28 files / 307
occurrences, matching the 218de2db08 precedent scale; media manifest regen;
rerecord_polish_provenance.mjs --check then write (150 occurrences across the
four after-side polish JSONs; the armoury family fingerprint has no literal
pin anywhere, embedded + self-derived only). Four literals re-pinned: the
composite d05e927d.., the metadata authority d5cba247.., the second-order
performance seal 3c1edecb.. (recomputed LAST from the re-recorded bytes; the
check-mode preview differs by design), and the integrity composite mirror.
ACCEPTED_POLISH_V2_TOWN_SOURCE_FINGERPRINT untouched (frozen identity). After
the mint: all 8 seal suites + banker_chest + provenance diagnostics +
mob_portrait_source_manifest + placeholder_art_completion green (12 files /
136 tests). The mob_portrait manifest survived the media-manifest regen with
no cascade re-mint.

THE FLATTENER SWEEP (328476e162 + 7229caa61a): shared
tests/helpers/strip_comments.ts (the architecture.test.ts single-pass
alternation, five-case self-test) adopted by SEVEN consumers: quest_link,
desktop_display_mode_sync, language_fanout_registry (the three committed by
phase 10 QA), defer_launcher_preloads and scripts_windows_paths (lane-found
live-class blindness: foliage.ts 124-277 and 10+ scripts hazards),
electron_shell_startup and ci_workflow's three sites (precedent carriers /
gate surface; gate-integrity-reviewer verdict PASS, its one probe-proven
WARNING, the block-terminator-adjacent line comment surviving the consuming
guard, fixed via the lookbehind form in 7229caa61a and mutation-killed).
Probes 4/4 killed both-arms with named tests: raw encoder at main.ts:4400
(pre GREEN-blind, post RED naming src/main.ts), eager registerPreload in the
foliage span (post RED), the full discovery triple in aura_gain_log's span
(first plant survived; rig diagnosis: discovery needs EMITS_TEXT plus the
comparison shape, then post RED), and the hazard-comment immunity arm for the
display-mode pins (pre RED two named pins, post GREEN). The ~40 remaining
latent release-owned block-first sites are a deferred chore; take the
gate-owned pin suites (tests/gate_select_plan.test.ts's two sites) first.

WHAT-IS-MISSING FINDINGS (both double-CONFIRMED): WIM-1 FIXED (b9c32cefbf):
a pre-paint reveal via focusMainWindow (dock click, second launch, deep link
in the up-to-4s hidden boot phase) did a bare show() that skipped the
displayMode/maximized reveal discipline; showMainWindow then no-oped on
isVisible for the whole session and the world-entry echo was swallowed by the
idempotent guard. createMainWindow now publishes its reveal closure and
focusMainWindow routes a never-shown window through it; whole-expression
polarity pin + publication-placement pin, both mutation-killed. WIM-2
DEFERRAL RULING: shadow_cadence (upstream, arrived with the v0.38 merge)
consumes governor pressure/enabled on medium+ tiers with no cross-damping
against the split recovery ladder; the structural analysis (dead-band limit
cycle if the shadow pass exceeds ~15 pct of tier budget; half-rate headroom
double-count across a calm window) is recorded here as the phase 11
oscillation check's result. Inert at LOW/iOS (no sun shadows). Needs an
empirical medium-tier bench with a heavy shadow fraction, or upstream
cross-damping (cadence exit as a recovery step); upstream-owned coupling,
surfaced in the PR deferral list. No packet code change.

LEDGER CORRECTIONS FILED THIS PHASE: (a) I18N-1: the release-fill debt is 13
keys x 15 Latin locales = 195 pending rows (3 hud.options.displayMode*, 4
hudChrome.options force/presence, desktop.update.whatsNew, 4 desktop.notify.*,
gpuNotice.bodyDiscreteInactive), not the "5 notify + 2 presence" shorthand;
the phase 7 "16 locales" figure is 15 (en_CA resolves translated). (b) DEP-1
ruling: @types/three@0.185.4 carries a registry deprecation flag; 0.185.4 IS
the newest published 0.185.x (registry checked 2026-08-14), so the pick
stands with tsc green as the arbiter. (c) Discord presence publishing at 1 Hz
while the window is hidden is DELIBERATE (the player is still in the world;
sim keeps running by design); recorded here so the ledger says so explicitly.
(d) The phase 7 Graphics-tab pointer note (a copy addition pointing at the
Interface GPU row) is DECLINED for this packet: a new player-visible t() key
plus five M16 fills at packet close grows the release-fill debt for a
nice-to-have; the maintainer can add it with the release fill round.

QA-CHECKLIST MATRIX EVIDENCE (item by item):
1. Three-host neutrality PASS: zero branch-owned files under src/sim, server,
   headless, python, src/world_api* in the 255-file 0d615aa7dd..HEAD delta.
2. Determinism PASS: tests/architecture.test.ts green standalone.
3. i18n completeness PASS: exactly 13 packet keys, all five non-Latin fills
   present, overlay purity clean (5 files, 16 insertions each, all M16),
   desktop_shell_strings + localization_fixes green standalone; the i18n
   semantic-regressions suite pins only overlay rows and cannot see the doc
   flip (verified).
4. Graphics fairness PASS: hidden-skip is derive-not-latch with a 15s
   rederive bound and the audio/timer head above the paint cut;
   ui_effects_profile.ts has a zero-line packet diff and no new governor read
   exists under src/ui; the LOW retune sheds load only (monotonicity +
   mote-floor pins); shadow_cadence flips shadow-map autoUpdate only.
5. Shell security posture PASS: webPreferences byte-identical to base,
   every new IPC handler trustedSender-gated in its head (pinned),
   setWindowOpenHandler deny unchanged, prefs store validates and clamps
   everything (stat cap, whitelists, BOM strip, wx temp), zero .env changes,
   env reads limited to WOC_DISCORD_APP_ID (validated), the new
   WOC_DISABLE_GPU_FORCE (strict, pinned) and pipe-path discovery.
6. Dependency scope PASS: exactly the six sanctioned moves, zero new deps,
   patch renamed with patchedDependencies re-pointed, 126-line lock delta
   fully machine-shaped.
7. Perf evidence bundle: see below.
8. Visual acceptance PASS: r181/r185 shift explicitly ACCEPTED by the user
   this phase (decision set tmp/r181-showcase-frozen/).
9. Degrade cleanly PASS: every paired feature gates on BOTH-methods typeof
   checks, push features no-op on absent bridge methods, Discord absence is
   construction-without-IO + bounded backoff.
10. Update/packaging PASS: electron:pack succeeded (electron-builder 26.15.7,
    electron 43.3.0, linux-unpacked); updater track suites green; the packed
    asar carries zero 'world-of-claudecraft-0.0.0' occurrences and the
    DESKTOP_VERSION const folds to the real 0.38.0 (the phase 2 QA dist-grep
    deferral, closed).
11. Copy review PASS: zero em dashes, en dashes, emoji across all 23,529
    branch-owned added lines (scan rig proven live on probe chars; CJK
    locale-fill punctuation is sanctioned native).
12. Full gate: the going-in run redded EXACTLY the accepted set (8 seals/11 +
    monolith 2, 38805 passed, zero flakes) and aborted at vitest by design;
    the final run after the mint and fixes is recorded below.
13. Docs: this record + state.md final inventory + the memory topic file.
14. Teardown: offered at phase close, user decides.
15. LOCAL-ONLY PASS: no origin/feature/desktop-client-update exists, no
    tracking remote configured; zero pushes ever.

PERF EVIDENCE BUNDLE (the packet headline; methodology per the interim
reconcile: never cross-era without a same-day control):
- Phase 5 (governor + LOW retune), historical: LOW 211.4 fps vs MEDIUM 78.7
  at 1280x720 on the 5090 rig, p95 and draw calls lighter on every scenario;
  the recovery-ladder stall fixed with a red-pre-fix repro; LOW monotonic by
  construction (bands x0.95, caps x0.9, per-axis pins).
- Phase 6 (three r185 train), historical fresh-vs-frozen table: medium all
  green, high/ultra field green with the town-idle red attributed MERGE-OWNED
  (upstream window regressed town-idle scaling with tier); LOW split
  (town/east +24-28 pct, open-run/combat regressed) = the accepted user
  decision above.
- 2026-08-13 re-frozen baselines are the CURRENT forward reference
  (docs/perf/baseline, low x4 + medium/high/ultra x2, commit-per-run, all
  dirty:false); the same-day control pair carries the accepted LOW picture.
- Phase 4 hidden-window evidence: hidden desktop window stops GL, HUD paint
  and perf sampling while sim+net drain keep running (E2E presented-frames
  probe deterministic on any GPU); powerSave display-sleep lease rides the
  same derivation.
- Startup: second launch hits the single-instance lock in 109 ms (phase 2
  smoke); pack cold-boot banner clean, zero fallback lines.

FINAL GATE (2026-08-14, after the docs record commit, BROWSER_PATH
exported): PASS, all 12 steps green, exit 0. Full vitest 2786 files / 38826
tests passed, ZERO failed (12 skipped files, 115 skipped tests, 2 expected
fail); browser regressions 19 files / 129 tests green INSIDE the gate (no
flake this run; in the gate order the browser leg precedes the turbo
builds); typecheck + env/server/bot builds + client build green; i18n
freshness, manifest freshness/trackedness, malware scan (0 high), and
changed-files biome all green. The going-in run earlier the same day redded
exactly the accepted set and aborted at vitest by design; going-in turbo
proofs were also taken standalone (5/5 + 3/3). This is the packet's first
fully green full gate: the seal re-mint healed the 8 asset suites and the
user-approved ceiling raise healed the monolith rows, so ANY red on this
branch is now a regression.
