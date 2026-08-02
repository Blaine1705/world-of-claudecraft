# Experiment log

Append-only. Every try gets a row even when dropped.

Columns: date, phase, experiment, before, after, platform, keep/drop, notes.

| Date | Phase | Experiment | Before | After | Platform | Keep/Drop | Notes |
|---|---|---|---|---|---|---|---|
| 2026-08-02 | 1 | baseline capture + gate_profile harness | n/a | full gate 336.3s, vitest 277.5s, workers 8 | M1 darwin/arm64 16c/128GiB Node 26.5 npm 11.17 SHA 2a79ba8a0d | keep | Required foundation; see baselines.md and detail below |
| 2026-08-02 | 2 | gate i18n/wiki generate-once + pretest skip + build:bundle | triple i18n / double wiki; full gate 336.3s | single gen path; ~5s artifact save; composite gate 291.5s | M1 darwin/arm64 16c/128GiB | keep | Option C+B; see detail below |
| 2026-08-02 | 3 | gate:fast + GATE_WORKER_TIER presets | day-loop ~= full gate 291.5s or ad-hoc | gate:fast 25.4s; full gate still merge bar | M1 darwin/arm64 16c/128GiB | keep | related not --changed default; see detail |
| 2026-08-02 | 4 | experimental.fsModuleCache in vite.config test | full cold ~245-277s (prior); multi-file no-cache transform ~3-5s | full cold 252.8s green / warm 241.3s; multi-file transform 1.4s cold / 0.45s warm | M1 darwin/arm64 16c/128GiB vitest 4.1.10 | keep | Default path under node_modules; see detail |
| 2026-08-02 | 4 | npm scripts test:related + test:changed | ad-hoc npx vitest related/changed only | package scripts + docs; gate:fast still owns day-loop orchestration | M1 | keep | Align with Phase 3; do not duplicate gate:fast |
| 2026-08-02 | 4 | optional @vitest/ui dependency | n/a | not added | M1 | drop | Opt-in DX only; would bloat default install; re-open later if needed |
| 2026-08-02 | 5 | add happy-dom@20.11.1 devDependency | jsdom only | happy-dom + jsdom both present | M1 vitest 4.1.10 | keep | Vitest first-class env; needed before pragma migration |
| 2026-08-02 | 5 | pilot 10 UI/admin files to happy-dom | n/a | 9/10 green; form_draft CSS selector gap | M1 | partial | Keep pilot path; form_draft stays jsdom |
| 2026-08-02 | 5 | migrate remaining jsdom pragmas to happy-dom | 112 jsdom files | 103 happy-dom + 9 jsdom exceptions | M1 | partial keep | Per-file pragmas (repo pattern); see exceptions in baselines |
| 2026-08-02 | 5 | localStorage setup under happy-dom | Node 22+ broken global | setup still green | M1 | keep | No setup change required beyond comment |
| 2026-08-02 | 5 | package-lock asset source-fingerprint remint | seal suites red after lock add | fingerprint-only GLB stamp + pin sweep green | M1 | keep (required side effect) | Sizes unchanged; not a geometry rebuild |
| 2026-08-02 | 6 | pool threads vs forks (full suite, maxWorkers=4) | forks 443.2s green | threads 434.1s, 2 fails (process.chdir) | M1 vitest 4.1.10 | drop | ~2% wall, correctness break; keep default forks |
| 2026-08-02 | 6 | vitest projects unit vs integration | n/a | not justified | M1 | drop | No measured full-suite win after threads/isolate drops |
| 2026-08-02 | 6 | isolate:false pure-approx (904 no-sim-import files) | isolate true 115.4s green | isolate false 70.0s, 71 files fail + worker crash | M1 | drop | Faster but unsafe; not a proven pure project |
| 2026-08-02 | 6 | isolate:false 20 pure helper files | isolate true 1.69s | isolate false 1.17s green | M1 | drop (too small) | ~0.5s absolute; not worth projects scaffold |
| 2026-08-02 | 6 | fileParallelism / maxWorkers note | defaults true; gate passes --maxWorkers | no config change | M1 | drop (no change) | gate_workers remains sole worker policy |
| 2026-08-02 | 7 | pnpm full migration + shared store | secondary npm ci ~59s | 2nd worktree pnpm hoisted ~14s (~4x); CI on pnpm frozen-lockfile | M1 darwin/arm64 Node 26.5 pnpm 10.34.5 | keep | Option A single lockfile; Corepack not required; see detail |
| 2026-08-02 | 8 | turbo task cache for pure gate artifacts | no task cache; pure steps always re-run (~24s multi-task cold) | warm pure multi-task 87ms FULL TURBO; catalog touch misses i18n | M1 darwin/arm64 Node 26.5 pnpm 10.34.5 turbo 2.10.8 | keep | wireit dropped; tests never cached; see detail |

## Detail template (copy below for long notes)

### YYYY-MM-DD - Phase N - short title

- Hypothesis:
- Change:
- Commands:
- Before metrics:
- After metrics:
- Pass/fail:
- Decision: keep | drop | defer
- Follow-ups:

---

### 2026-08-02 - Phase 1 - baseline harness and M1 capture

- Hypothesis: A small, Windows-safe measurement tool plus filled baselines will
  make later phase keep/drop decisions evidence-based.
- Change: Added `scripts/gate_profile.mjs` and pure helpers in
  `scripts/lib/gate_profile.mjs` (+ `.d.mts`), tests in `tests/gate_profile.test.ts`.
  No change to worker defaults, vitest pool, or package manager.
- Commands:
  - `npx vitest run tests/gate_profile.test.ts`
  - `node scripts/gate_profile.mjs --help`
  - `node scripts/gate_profile.mjs --facts`
  - `node scripts/gate_profile.mjs --vitest-slow --top 20 --json-out tmp/gate-profile-phase1.json --continue-on-error`
  - `npm ci` (warm cache install timing)
- Before metrics: n/a (no prior measured baseline on this machine)
- After metrics (M1):
  - Full profile total: 336.3 s (all steps ok)
  - Vitest: 277.5 s (1951 files, 24739 tests, success)
  - Browser: 4.9 s; types: 4.5 s; client build: 10.3 s; sfx check: 24.5 s
  - Top slow file: `tests/professions_trend_guild_letter.test.ts` ~57 s
  - Warm `npm ci`: 8.7 s
- Pass/fail: harness unit tests pass; full profile exit 0
- Decision: keep
- Follow-ups:
  - Phase 2: dedupe i18n/wiki regeneration across gate/pretest/build
  - Phase 9: investigate top slow files (professions trend, sfx export, mail expiry)
  - Measure cold empty-store install and second-worktree install in Phase 7
  - Capture a mid/low tier machine when available

---

### 2026-08-02 - Phase 2 - gate orchestration dedupe

- Hypothesis: One `npm run gate` regenerates i18n (and wiki) three times; generate
  once, enforce freshness, and skip redundant pretest/build gens without hurting
  standalone `npm test` / `npm run build`.
- Change:
  - `scripts/pretest.mjs` + pure `shouldSkipPretest` (`scripts/lib/gate_artifact_skip.mjs`)
  - gate runs `i18n:gen` -> freshness -> `wiki:content`, then vitest with
    `WOC_SKIP_PRETEST=1`, then `build:bundle`
  - package.json: `build:bundle` split; `build` = gen + bundle; `pretest` -> node script
  - gate_profile step list mirrors gate; pins in `tests/gate_artifact_skip.test.ts`
  - Fix Phase 1 type pin: `collectMachineFacts` osApi platform/arch accept functions
- Commands:
  - `npx vitest run tests/gate_artifact_skip.test.ts tests/gate_profile.test.ts tests/ci_workflow.test.ts`
  - `npm run check:types`
  - microbench: i18n:gen, wiki:content, pretest skip/full, build:bundle vs build
  - `node scripts/gate_profile.mjs --vitest-slow` (vitest green, pretest skip logged)
  - `node scripts/gate_profile.mjs --skip-vitest` (types + builds green after type fix)
- Before metrics: i18n 3x, wiki 2x; Phase 1 full gate 336.3s / client build 10.3s
- After metrics:
  - pretest skip 0.02s vs full pretest 2.72s
  - build:bundle 7.2s vs full build 10.0s
  - client build in gate profile 7.5s
  - vitest 245.4s with `[pretest] skip` line present
  - composite full gate 291.5s (rest 46.1 + vitest 245.4); ~5s attributed to dedupe
- Pass/fail: unit tests + typecheck + env/server/client builds green; full vitest
  suite green under gate skip; freshness still enforced
- Decision: keep
- Follow-ups:
  - Phase 3: tiered gate:fast
  - Optional: CI shard pretest still multiplies i18n gens (out of Phase 2 local scope)

---

### 2026-08-02 - Phase 3 - tiered local gate + worker presets

- Hypothesis: Agents need a high-signal day-loop path under a few minutes, while
  full gate stays the obvious merge bar; low/medium machines need documented worker
  caps that never remove the free-mem clamp.
- Change:
  - `npm run gate:fast` -> `scripts/gate_fast.mjs` (malware, biome changed, architecture
    + localization guards, incremental `check:ts`, vitest related to dirty sources/tests)
  - Pure plan in `scripts/lib/gate_fast_plan.mjs` (classify paths; skip package.json
    expansion; opt-in `GATE_FAST_BASE` for branch-wide `--changed`)
  - `GATE_WORKER_TIER=low|medium|high` caps in `computeGateWorkers` after free-mem clamp
  - Docs: `docs/qa-gate.md`, `docs/local-gate-perf/tier-workers.md`, CONTRIBUTING pointer
  - Pins: `tests/gate_workers.test.ts`, `tests/gate_fast_plan.test.ts`
- Commands:
  - `npx vitest run tests/gate_workers.test.ts tests/gate_fast_plan.test.ts`
  - `npm run gate:fast` (timed)
  - Rejected probe: default `--changed` vs release / bare `--changed` with dirty package.json
- Before metrics: day-loop effectively full gate ~291.5s (Phase 2) or ad-hoc pre-push
- After metrics (M1):
  - gate:fast **25.4s** PASS (workers 8; related mode; package.json not expanded)
  - Rejected default using vitest `--changed` ~241s (~full suite) when package.json dirty
- Pass/fail: unit tests green; gate:fast green; full gate not re-run this phase
  (Phase 2 composite still the full-gate reference; labeled partial)
- Decision: keep
- Follow-ups:
  - Phase 4: vitest warm path / fsModuleCache / related helper polish
  - Owner OPEN: gate:fast never replaces pre-push or merge bar without state.md sign-off
  - Optional: time full `npm run gate` once after Phase 3 lands on a quiet machine

---

### 2026-08-02 - Phase 4 - Vitest warm path (fsModuleCache + related scripts)

- Hypothesis: Vitest 4.1 `experimental.fsModuleCache` speeds warm re-runs and
  related loops without flaking the full suite; thin `test:related` /
  `test:changed` scripts make the CLI convenient without replacing `gate:fast`.
- Change:
  - `vite.config.ts` `test.experimental.fsModuleCache: true` (default store
    `node_modules/.experimental-vitest-cache`)
  - package.json: `test:related`, `test:changed`
  - `.gitignore` explicit cache path entries (also covered by `node_modules/`)
  - Docs: `docs/qa-gate.md`, CONTRIBUTING, `tier-workers.md`, packet baselines
  - Did **not** add `@vitest/ui` (drop)
- Commands:
  - Multi-file rep set (5 files, 100 tests) with and without cache
  - `WOC_SKIP_PRETEST=1 npx vitest run --maxWorkers=8` cold after `--clearCache`, then warm
  - `npm run test:related -- --maxWorkers=8 scripts/lib/gate_fast_plan.mjs` cold/warm
  - `npm run gate:fast` smoke after config change
  - Rejected concurrent `--clearCache` mid-suite (ENOENT storm; operator error, not a product flake)
- Before metrics (M1, multi-file no-cache CLI false):
  - cold Duration 1.56s (transform 3.14s); warm Duration 1.99s (transform 4.83s, no help)
- After metrics (M1, cache on):
  - multi-file cold Duration 1.02s (transform 1.39s); warm ~0.74s (transform ~0.45s)
  - full suite cold after clear: **252.8s** Duration, 1945 files / 24693 tests PASS
  - full suite warm: **241.3s** Duration (~11s / ~4% wall; transform 62s -> 46s)
  - related `gate_fast_plan.mjs`: Duration cold 362ms -> warm 177ms; wall real ~14s both
    (import-graph discovery dominates small related walls)
  - related `src/sim/rng.ts`: expands to ~899 files (~236-258s); not a day-loop default
  - `gate:fast` after change: **8.5s** PASS (workers 8; docs-only dirty set skipped vitest related)
  - cache dir size ~3.8 MiB
- Pass/fail: full suite green with cache; no wrong pass/fail attributed to cache when
  used alone. Concurrent clearCache during a suite is unsafe (document only).
- Decision:
  - **keep** `experimental.fsModuleCache`
  - **keep** `test:related` / `test:changed` scripts + docs
  - **drop** `@vitest/ui` for this phase
- Follow-ups:
  - Phase 5 happy-dom
  - Do not treat warm/related/`gate:fast` as merge bar
  - Optional: document "never clearCache while another vitest is running"

---

### 2026-08-02 - Phase 5 - happy-dom for DOM tests (partial keep)

- Hypothesis: Vitest-first-class happy-dom is faster than jsdom for the ~112
  `// @vitest-environment jsdom` files without rewriting UI tests.
- Change:
  - devDependency `happy-dom@^20.11.1` (jsdom kept)
  - 103 test files: pragma `jsdom` -> `happy-dom`
  - 9 explicit jsdom exceptions (API gaps: `window.confirm`/`alert`, selectors,
    `DOMTokenList` prototype spies, click/draggable/datetime)
  - Comments on `tests/jsdom_local_storage_setup.ts`, `tests/admin/_setup.ts`,
    `vite.config.ts` setupFiles note both DOM envs
  - Lockfile-driven fingerprint-only remint of 13 shipping GLBs (Eastbrook + tank),
    media manifest regen, polish provenance remint, pin updates
- Commands:
  - Baseline: `WOC_SKIP_PRETEST=1 npx vitest run --maxWorkers=8` on the 112 DOM files
  - Pilot batches; bulk pragma migration; exception reverts
  - `node tmp/remint_source_fingerprints.mjs` (not committed); polish remint script;
    `node scripts/build_media_manifest.mjs generate`
  - Asset seal suite + DOM suite + full suite recheck
- Before metrics (DOM subset, all jsdom): Duration **16.68s**, environment **31.09s**
- After metrics (103 happy-dom + 9 jsdom):
  - cold Duration **14.69s**, environment **14.48s** (~2s / ~12% wall; ~2.1x env)
  - warm Duration **10.53s**, environment **14.22s**
  - DOM 112 files / 1110 tests PASS
- Pass/fail: DOM green; asset seals green after remint; admin/svelte mostly happy-dom
- Decision: **partial keep** (not full drop, not 100% migration)
- Follow-ups:
  - Phase 6 pool/projects/isolation
  - Optional later: polyfill `window.confirm`/`alert` or selector gaps to shrink exceptions
  - Full gate remains merge bar; happy-dom is not a merge-bar change by itself

---

### 2026-08-02 - Phase 6 - pool / projects / isolation

- Hypothesis: Vitest 4.1 `pool: 'threads'`, optional projects split, and carefully
  scoped `isolate: false` can cut full-suite or pure-unit wall without flakes.
- Change attempted: **none kept.** Default remains `pool: 'forks'` (Vitest 4.1
  default), `isolate: true`, no `projects` array, `fileParallelism` default true.
  Free-mem clamp in `computeGateWorkers` unchanged. No dead experimental config left
  in `vite.config.ts`.
- Vitest 4.1 APIs used (current docs): `--pool=threads|forks` (default forks);
  `--isolate` / `--no-isolate`; `--fileParallelism` / `--no-file-parallelism`;
  multi-pool routing is via **projects** (not legacy `poolMatchGlobs`). Threads
  cannot use `process.chdir()`; native modules (e.g. sharp in some tests) prefer forks.
- Commands (all under `WOC_SKIP_PRETEST=1`, pinned `maxWorkers=4` for A/B fairness
  while free RAM was low at start):
  - Full suite forks: `npx vitest run --pool=forks --maxWorkers=4`
  - Full suite threads: `npx vitest run --pool=threads --maxWorkers=4`
  - Pure-approx 904 files (no `src/sim/` import, no DOM pragma): isolate true/false
  - 20 pure helpers: isolate true/false on forks and threads
  - Phase 1 top-10 heavies x2 under default forks
- Before metrics (forks full suite, maxWorkers=4):
  - Duration **443.15s**, real **443.91s**, PASS 1945 files / 24693 tests
  - transform 10.84s, setup 171.92s, import 448.67s, tests 1006.18s, env 12.47s
- After metrics (threads full suite, maxWorkers=4):
  - Duration **434.11s**, real **434.98s**, **FAIL** 1 file / 2 tests
  - Failure: `tests/server/env_bootstrap.test.ts` (`process.chdir` not supported in workers)
  - setup 138.67s, import 424.03s slightly better; ~**9 s / ~2%** wall
- Pure-approx isolate:
  - true: **115.39s** PASS (896+8 skip)
  - false: **69.95s** wall but **71 failed files / 602 failed tests** + worker crash
  - 20-file pure helpers: 1.69s -> 1.17s green (too small for projects)
- Heavy top-10 (default forks):
  - Run 1: **154.5s** PASS 10/10
  - Run 2 under loadavg ~47-60: timeouts on mail_expiry / eastbrook / sfx_export;
    solo retries still timed out. Treated as **machine contention**, not pool
    regression (full suite forks earlier was green; no config kept that could flake).
- fileParallelism: gate and gate:fast already pass `--maxWorkers=${workers}` from
  `computeGateWorkers` (CPU/2, free-mem clamp, optional `GATE_WORKER_TIER` cap,
  `GATE_MAX_WORKERS` override). With default `fileParallelism: true`, maxWorkers is
  the concurrent file-worker count. No measured reason to force serial files.
- Pass/fail: kept config (status quo) full suite green under forks; experimental
  arms dropped on correctness or insufficient win.
- Decision: **drop all Phase 6 config changes**; ledger = keep Vitest defaults +
  existing gate worker policy.
- Follow-ups:
  - Phase 7 pnpm / shared store
  - Phase 9 suite cost (top heavies) still the real wall lever
  - Optional later: rewrite `env_bootstrap` tests off `process.chdir` if threads is
    re-opened; dual projects only if a **proven** pure set survives isolate:false audit

### 2026-08-02 - Phase 7 - pnpm + shared store for worktrees

- Hypothesis: pnpm content-addressable store makes multi-worktree installs much
  cheaper than per-worktree `npm ci`, and a deliberate full migration keeps CI
  and lockfile policy single-source.
- Change (keep):
  - `packageManager: pnpm@10.34.5` (latest 10.x; deliberately not pnpm 11);
    `pnpm-lock.yaml` only (removed `package-lock.json`)
  - Install path: `npm install -g pnpm@10.34.5` (Corepack not required; same on
    macOS/Linux/Windows). CI: `pnpm/action-setup@v4` with the same pin.
  - `.npmrc`: `node-linker=hoisted`, `auto-install-peers=true`,
    `strict-peer-dependencies=false`
  - `package.json` `pnpm.onlyBuiltDependencies` for native/binary install scripts
  - CI: `cache: pnpm` + `pnpm install --frozen-lockfile`
  - Gate dep-sync / SFX messages point at `pnpm install --frozen-lockfile`
  - `release_version` no longer rewrites a lockfile version field (pnpm has none)
  - malware scan accepts `pnpm-lock.yaml` (YAML line scan for non-registry sources)
  - CONTRIBUTING multi-worktree + cross-platform notes; DEPLOY docker type-check
    uses `npm install -g pnpm@10.34.5` then frozen install
  - Fingerprint leaf `package-lock.json` -> `pnpm-lock.yaml`; size-preserving GLB
    remint + polish seal re-pins
- Dropped mid-experiment: default isolated linker (broke `@gltf-transform/core` /
  `meshoptimizer` transitive imports used by asset scripts). Hoisted linker keeps
  the shared store win.
- Commands:
  - secondary `npm ci` timing; `pnpm import`; multi-worktree `pnpm install --frozen-lockfile`
  - targeted vitest for CI/release/assets/dep-sync; full gate under pnpm
- Before metrics: secondary npm ci ~59s (warm cache)
- After metrics: second worktree pnpm (hoisted, warm store) ~14s
- Pass/fail: phase test set green; full `pnpm run gate` green with GATE_MAX_WORKERS=4 (~682s, multi-session machine; 8-worker runs hit timeout flakes under concurrent load, same free-mem clamp story)
- Decision: keep
- Follow-ups: Phase 8 task cache; bump `packageManager` + CI pin together when
  moving pnpm versions

### 2026-08-02 - Phase 8 - task cache (turbo)

- Hypothesis: pure artifact gate steps (i18n, wiki, sfx check, types, builds)
  can skip when inputs are unchanged via a task graph cache, while vitest and
  security/biome always re-run so failures are never hidden.
- Change (keep):
  - **Tool: turbo 2.10.8** (not wireit). Rationale: multi-task parallel CLI,
    precise inputs/outputs, local disk cache, no rewrite of every package.json
    script to `"wireit"`. Wireit remains a valid lighter alternative if turbo
    becomes a maintenance burden.
  - Root `turbo.json` with cacheable tasks + `cache: false` on test/malware/biome
  - `scripts/lib/gate_task_cache.mjs` inventory + `turboRunArgs`
  - `scripts/lib/gate_steps.mjs` shared merge-bar step list (gate + profile)
  - `scripts/gate.mjs` uses turbo for pure steps; parallel
    `check:types` // `build:env` // `build:server`; vitest/malware/biome via npm
  - Phase 2 generate-once preserved (WOC_SKIP_PRETEST, build:bundle, freshness)
  - Docs: `docs/local-gate-perf/task-cache.md`, qa-gate + CONTRIBUTING pointers
  - Tests: `tests/gate_task_cache.test.ts` + updated profile/artifact pins
- Dropped: wireit (not installed).
- Commands:
  - `npx turbo run i18n:gen wiki:content sfx:check check:types build:env build:server build:bundle`
  - catalog touch under `src/ui/i18n.catalog/**` then re-run `i18n:gen`
  - unit: `npx vitest run tests/gate_task_cache.test.ts tests/gate_artifact_skip.test.ts tests/gate_profile.test.ts`
  - full: `pnpm run gate`
- Before metrics: pure multi-task always-execute ~24s cold wall (post-install machine)
- After metrics:
  - Warm pure multi-task: **87ms**, `Cached: 7/7`, `FULL TURBO`
  - Cold pure multi-task (empty `.turbo` after prior partial populate): ~24s
  - Catalog blank-line touch: `i18n:gen` **cache miss** (~2.6s) after prior hit (22ms)
  - Parallel force `check:types build:env build:server` ~5.3s vs sequential sum
    ~6.3s (~1s overlap; types dominate)
- Pass/fail: unit pins green; typecheck green; cache bust correctness green;
  asset fingerprint remint after `turbo`/`pnpm-lock` leaf change (same recipe as
  Phase 7); full gate green under `GATE_MAX_WORKERS=4`
- Decision: **keep**
- Follow-ups: Phase 9 suite cost; optional remote turbo cache is out of scope

