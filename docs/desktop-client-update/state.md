# Desktop Client Update: state (cross-phase cheat sheet)

Read this first in every session. Base commit at packet authoring: 6ed4d7e12c on
release/v0.36.0. Any file:line anchors in this packet were verified at that base and
may drift; re-verify by symbol name before relying on one.

## Current phase

Phase 1 done (2026-08-08, commits fff0a2898e + 18da4ef8cc + docs a8544d6b57) and
phase 1 QA done (2026-08-08, verdict PASS-WITH-FOLLOWUPS, fixes in commits 042ba0a766
test hardening + the QA docs commit); next up is phase 2 (phase-02-shell-startup-polish.md).
QA-start base merge: 4ccfc41805 merged origin/release/v0.36.0 (81804a179e, wiki v0.36
round2, guide/i18n/screenshot files only, no electron/desktop surface); electron plus
desktop suites and tsc re-verified green at that HEAD. See progress.md for the live
table and the phase notes.

## Standing rules (user-locked, 2026-08-08, non-negotiable)

1. ALL work happens in the worktree /home/fernandoramirez/Documents/woc-desktop-client-update
   on branch feature/desktop-client-update. Multiple Claude sessions run on this machine:
   always use `git -C /home/fernandoramirez/Documents/woc-desktop-client-update` and verify
   with `status --porcelain` before and after committing. Never touch the main checkout at
   ~/Documents/world-of-claudecraft.
2. LOCAL-ONLY: never push, never open a PR, until the user explicitly says the whole
   packet is done. No exceptions per phase.
3. Every phase starts by pulling the latest release branch and merging it in:
   `git -C <worktree> fetch origin release/v0.36.0` then
   `git -C <worktree> merge origin/release/v0.36.0`. After any non-trivial base merge,
   re-run the phase-relevant suites before building on top (hot release branches have
   produced semantically wrong auto-merges before; do not trust a clean textual merge).
4. Phases interleave QA: phase N, then phase N QA, then phase N+1. Do not start N+1
   before N QA passes.

## Locked design decisions

- Stay on Electron. No Tauri, no CEF, no native rewrite.
- three.js goes 0.165.0 to 0.185.1 on WebGL2. NO WebGPU anywhere in this packet
  (follow-up branch later). postprocessing 6.39.4 and n8ao 2.0.0 move in the same phase.
- Dependency upgrades are CLIENT STACK ONLY: electron, electron-builder, three,
  postprocessing, n8ao, @types/three. Nothing else moves (no vite/vitest/ws/pg/
  capacitor/svelte churn). electron-updater 6.8.9 and electron-log 5.4.4 are already
  current and stay.
- Electron pin: 43.3.0 floor now; Electron 44 (stable ~2026-08-25) is explicitly out of
  scope, soaked on its own branch later.
- Steam overlay is a documented NON-GOAL (needs in-process-gpu plus relaxed isolation;
  rejected). steamworks.js stays main-process-only for account linking, as today.
- Discord Rich Presence ships as an IN-HOUSE ~150-line IPC client (main process, local
  named pipe/socket only, zero new dependencies). The vendored-library route
  (@xhayper/discord-rpc) was evaluated and rejected: it drags @discordjs/rest and undici
  into an audited bundle. See brainstorm.md section 6.
- Update-toast "what's new" is a t()-keyed LINK to the wiki changelog, not feed-supplied
  release-notes text (feed text cannot satisfy the i18n contract). The feed releaseNotes
  approach is rejected, do not revisit.
- OS notifications are assembled and t()-rendered in the RENDERER, pushed to main as
  final strings over a validated, capped, rate-limited channel. Main stays
  language-agnostic (same doctrine as the crash-dialog strings).
- Hidden-window render skip: while document.hidden on desktop, skip renderer.render and
  HUD paint but KEEP the loop, sim tick, and network drain running (skipping the drain
  would rebuild the WS-backlog freeze documented in the July investigation).
- Governor scope: the frame-cap trap core is ALREADY FIXED (commit 6ad39476f2). This
  packet fixes (a) the recovery-ladder stall that leaves render scale degraded and
  (b) the LOW-heavier-than-MEDIUM inversion, keeping lowPlus art direction only for the
  weak-integrated-GPU cohort. The shader-compile-gate and WS-recovery-tail workstreams
  from issue #2243 are OUT of this packet (tracked follow-ups).

## OPEN items (need a human / credential / empirical answer)

- Discord application registration (Application ID + art assets in the Discord developer
  portal): maintainer infrastructure. Phase 10 can build and unit-test everything with a
  placeholder id; the live probe needs a real id.
- Discord approval-gate ambiguity: official pages conflict on whether SET_ACTIVITY works
  for unapproved application ids. Phase 10 step 1 probes empirically BEFORE any player
  facing copy promises presence.
- Rich Presence default state (recommend default ON with an options toggle; presence is
  additionally gated by Discord's own activity-sharing setting): confirm with user at
  Phase 10 start.
- r181 lighting shift (PBR energy conservation): expect a global brightness change after
  the three upgrade. Phase 6 QA captures before/after screenshots; user accepts or the
  phase compensates. This is a judgment call, surface it, do not silently absorb it.

## Validation matrix by change type

- electron shell (.cjs): `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts`
  (the .cjs files are outside tsc; the tests scan them as text and exercise the pure
  modules directly). Pack smoke where the phase says so: `npm run electron:pack`.
- game/ui client code: `npx tsc --noEmit` plus the affected vitest files; add
  `npx vitest run tests/localization_fixes.test.ts` whenever player text changed.
- render: `npx tsc --noEmit`, `npx vitest run tests/gfx.test.ts tests/render_budget.test.ts`
  plus the phase-named suites; perf evidence via `npm run perf:baseline` where the phase
  says so.
- settings/options: `npx vitest run tests/settings.test.ts tests/options_view.test.ts`.
- any code change: `npm run ci:changed` (Biome on changed files only; fix format with a
  SCOPED `npx @biomejs/biome check --write <file>`, never whole-tree).
- phase completion: `node scripts/gate_select.mjs` (the selective pre-merge gate).
  Known unrelated flakes under core contention: dungeon_finder decline tests; a rerun of
  the single file is the arbiter. One known environmental browser-test failure exists on
  this machine (Node/jsdom); it aborts the full gate before tsc+builds, so treat PR CI
  as the final arbiter and do not chase it locally.

## Key repo recipes (verified at base, full detail in brainstorm.md)

- New boolean display setting (the options doctrine, from the playtime PR): declare in
  BOOL_SETTINGS (src/game/settings.ts); one boolToggle row in buildInterfaceControls
  (src/ui/options_view.ts); an applySetting arm in src/main.ts that OWNS the single
  settings.set write path (cold windows need an explicit repaint call); English key in
  src/ui/i18n.catalog/hud_chrome.ts under options; wordy values need the five non-Latin
  fills (M16) in the same change; pins: the ordered GENERAL_KEYS list in
  tests/options_view.test.ts, default+persistence in tests/settings.test.ts, and the
  consuming window's test. options_window.ts itself needs zero changes.
- New shell-visible string for MAIN (crash-dialog pattern): English key in
  src/ui/i18n.catalog/shell.ts under desktop; add to desktopShellStringsPayload
  (src/game/desktop_shell_strings.ts); mirror byte-identical English in
  DEFAULT_SHELL_STRINGS (electron/shell_strings.cjs), which IS the allowlist;
  tests/desktop_shell_strings.test.ts pins exact key-set equality and value-for-value
  English parity.
- New wocDesktop bridge method: add to preload.cjs inside the one exposeInMainWorld with
  the house guards (type-guard inputs; subscriptions return a no-op unsubscribe for
  non-function callbacks and shape-check payloads); OPTIONAL member on DesktopBridge in
  src/runtime.ts (older shells must keep working; consumers feature-check); handler in
  main.cjs gated by trustedSender within the first 200 chars of the callback body; update
  tests/electron_ipc_channels.test.ts (invoke-channel list, the EXACT pinned push-channel
  array for new webContents.send channels, and the 17-method preload name list).
- New electron pure module: <name>.cjs plus <name>.d.cts sibling, imports no electron,
  dependency-injected, Node-tested directly (templates: desktop_config.cjs,
  shell_strings.cjs, gpu_preference.cjs).
- Electron-side persistence is GREENFIELD: nothing in electron/ writes to disk today.
  Phase 7 creates the first store (userData JSON, atomic write, corrupt-tolerant).

## Inventory (append as phases land)

New files created: tests/electron_scheme_privileges.test.ts (phase 1)
New bridge methods / IPC channels: (none yet)
New settings keys: (none yet)
New i18n keys: (none yet)
New tests: tests/electron_scheme_privileges.test.ts, the app:// scheme privileges pin
(app-entry-anchored, block/line/trailing-comment-stripped, per-key explicit-true as
whole-line values, exact key-set equality with a quoted-key-aware scanner as the
deny-list, single-entry pin inside the call, single-registration count pin, and
top-level-before-app.whenReady position pins). Mutation-verified on eleven dimensions
in phase 1 QA: drop, flip-false, line-comment, extra privilege, block-comment,
second scheme entry, non-top-level call, ready-ordering decoy, quoted key,
value expression, trailing comment (harness: the phase 1 QA notes in progress.md).
Dependency moves: electron 43.1.1 to 43.3.0 and the electron-builder family
(electron-builder, app-builder-lib, dmg-builder, electron-builder-squirrel-windows)
26.15.6 to 26.15.7, via pnpm add -D, devDependencies only; vendor bundles
(electron-log/main, electron-updater) byte-identical across the bump (phase 1).
Vendor bundle sha256 baselines (recorded by phase 1 QA; regen-stability verified,
rebuild reproduced identical bytes): electron_log_main.cjs
784caa8281339772203a5881f442bbf4199163d6ef0914fc5d26eca8e3a967bd, electron_updater.cjs
0605218d342a1c1b219677cebf64c848a1b55ff5d865daf8c71b70395c83287f.
Perf baselines: (none yet; Phase 6 freezes the pre-upgrade baseline, path recorded here)

## Known gotchas for this packet

- pnpm only: regenerate the lockfile via pnpm add/update, never hand-edit; frozen
  installs print a cosmetic "Packages: -136" line, ignore it.
- The Bash tool runs zsh here: wrap bash-isms in `bash -c`; quote everything.
- Fresh worktrees need their own `pnpm install` (done for this one on 2026-08-08).
- Commit the feature work BEFORE planting any mutation-test probes; git checkout
  restores have clobbered uncommitted fixes three times before.
- Reviewer/QA agents die silently at turn limits: give every spawned reviewer a hard
  ~30-tool-call budget and a report-first instruction, and nudge idle agents to dump
  their report with no further tool calls.
- The i18n semantic-regressions suite (full gate only) pins reviewed locale prose:
  rewording an existing English value that has stale Latin locale fills reds it;
  re-point pins or add fresh non-Latin fills in the same change.
- gate_select's biome leg (`npm run ci:changed`) diffs against biome.json
  `vcs.defaultBranch` (origin/main), so on this release-based branch it sweeps the
  whole release-vs-main delta (300+ files) and reds on pre-existing offenders
  (vite.config.ts noUndeclaredEnvVars, src/render/characters/manifest.ts format),
  aborting the gate before vitest and the builds. Struck in phase 1. Verify the true
  delta with `npx @biomejs/biome ci --changed --since=origin/release/v0.36.0
  --no-errors-on-unmatched`; for a fully green gate run, pin biome.json
  defaultBranch to origin/release/v0.36.0 in the working tree for the run and revert
  it after (NEVER commit the pin). Do not fix the offenders: they are deferred
  whole-repo debt, not this branch's regression.
- electron/vendor/ is gitignored generated output, so "vendor bundles unchanged"
  can never be read off `git status`: hash `electron/vendor/*.cjs` before and after
  and compare (phase 1 recipe).
- pnpm-lock.yaml is a HASHED INPUT of all 7 asset source fingerprints: ANY lockfile
  change (phase 1 electron bump, phase 6 three train, a base merge that moved deps)
  reds 8 asset suites (5 eastbrook files, fenbridge, render_glb_replacement,
  terrorspark) on seal mismatches. Fix is never to weaken the pins: the
  size-preserving re-mint runbook (scripts/assets/remint_lockfile_fingerprints.mjs,
  5-step order in commit 218de2db08). USER DECISION 2026-08-08: defer to ONE
  re-mint at phase 11 over the final lockfile; until then these 8 suites are the
  accepted per-phase full-gate exception (everything else must stay green, and the
  lockfile-triggered vitest full-suite fallback means every per-phase gate WILL run
  them).
- tests/profile_mode.test.mjs (in the normal vitest suite) and the browser
  regressions leg need a browser binary this machine lacks by default: export
  BROWSER_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome for gate
  runs; without it profile_mode fails at import (this is the known environmental
  full-gate failure).
