# Experiment log

Append-only. Every try gets a row even when dropped.

Columns: date, phase, experiment, before, after, platform, keep/drop, notes.

| Date | Phase | Experiment | Before | After | Platform | Keep/Drop | Notes |
|---|---|---|---|---|---|---|---|
| 2026-08-02 | 1 | baseline capture + gate_profile harness | n/a | full gate 336.3s, vitest 277.5s, workers 8 | M1 darwin/arm64 16c/128GiB Node 26.5 npm 11.17 SHA 2a79ba8a0d | keep | Required foundation; see baselines.md and detail below |
| 2026-08-02 | 2 | gate i18n/wiki generate-once + pretest skip + build:bundle | triple i18n / double wiki; full gate 336.3s | single gen path; ~5s artifact save; composite gate 291.5s | M1 darwin/arm64 16c/128GiB | keep | Option C+B; see detail below |
| 2026-08-02 | 3 | gate:fast + GATE_WORKER_TIER presets | day-loop ~= full gate 291.5s or ad-hoc | gate:fast 25.4s; full gate still merge bar | M1 darwin/arm64 16c/128GiB | keep | related not --changed default; see detail |

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
