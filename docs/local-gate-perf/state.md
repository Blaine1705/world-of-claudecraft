# State: local gate performance

Resume point for the next session. Keep current after every phase.

**Current phase:** Phase 9 complete.  
**Next action:** run Phase 10 starter prompt (`phase-10-experimental-runners.md`).  
**Worktree:** `/Users/fernando/Documents/wocc-gate-perf-research`  
**Branch:** `feature/local-gate-perf`  
**Base:** always `origin/release/v0.34.0`

---

## Locked decisions (do not re-litigate without owner)

1. **Integration base is `release/v0.34.0`**, not `main`. Every phase fetches and
   merges `origin/release/v0.34.0` before coding.
2. **All packet work happens in the dedicated worktree**
   `/Users/fernando/Documents/wocc-gate-perf-research` so other sessions stay safe.
3. **Full gate remains the merge contract.** Faster paths are additive
   (`gate:fast`, related tests, cached steps). They never replace pre-merge full gate
   without an explicit owner decision recorded here.
4. **Experiment freely; measure always.** A MISS is logged and dropped, not hidden.
5. **Worker memory clamp stays.** Do not remove `computeGateWorkers` free-mem clamp
   to chase wall time. Add tier presets and docs instead.
6. **Prefer Vitest/Vite/Node plugs first.** turbo-test / Bun / Deno are spikes only
   unless a phase proves pass rate and wall win on this suite.
7. **pnpm is the package manager** (full migration, Phase 7): `packageManager` +
   `pnpm-lock.yaml` only, CI frozen install, multi-worktree shared store. Do not
   reintroduce `package-lock.json` or dual lockfiles without an explicit owner
   decision recorded here.
8. **No em dashes, en dashes, or emojis** in docs, commits, or code comments.
9. **No Claude-Session trailers** in commits.

## Non-negotiable invariants

1. Determinism and sim purity (`tests/architecture.test.ts`).
2. IWorld parity if any world API is touched (not expected in this packet).
3. i18n: no hand-edit of generated locale trees; English catalog only for new strings.
4. Server authority and no secrets / `ALLOW_DEV_COMMANDS` in prod paths.
5. Gate exit codes must not be masked (no `npm test | tail` patterns).
6. Cross-platform: new scripts must work on Windows (shell spawn), macOS, Linux.
7. Stage only this task's files; never `git add -A` while other WIP might exist.

## Validation matrix

| Change type | Minimum checks |
|---|---|
| Docs/packet only | Markdown hygiene (no em/en dash/emoji); optional link check |
| Measurement scripts | `npx vitest run tests/<new>.test.ts`; dry-run on a short suite |
| gate.mjs / package scripts | `node scripts/gate.mjs` or stepped timings; pin tests if any |
| Vitest config | Full `npm test` once with new config; flake watch on heavy files |
| happy-dom | All previously jsdom files green; spot UI tests |
| pnpm | Install clean on macOS + document Windows/Linux; CI job update; `npm run gate` |
| turbo/wireit | Cache hit/miss demo; gate green cold and warm |
| Suite splits | Targeted + full test; CI shard completeness pins if renames |

Always before calling a phase complete:

- Update `progress.md`, `state.md`, `baselines.md`, `experiment-log.md`
- `npx @biomejs/biome check --write` only on files you touched
- Prefer `npm run gate` after phases that touch gate/test/build orchestration

## Review-dispatch (when implementing, not for docs-only)

| Surface | Reviewer |
|---|---|
| End of contribution | `$woc-qa` / qa-checklist |
| `scripts/gate.mjs`, CI | test pins in `tests/ci_workflow.test.ts`, `tests/gate_workers.test.ts` |
| Security scan scripts | privacy-security if malware scope changes |
| No sim/server game logic expected | skip architecture/cross-platform unless touched |

## Key paths

| Path | Role |
|---|---|
| `scripts/gate.mjs` | Local full gate (merge bar; generate-once i18n/wiki; turbo pure-step cache; vitest skips pretest; client uses build:bundle) |
| `turbo.json` | Turborepo task inputs/outputs for pure gate artifacts (Phase 8) |
| `scripts/lib/gate_steps.mjs` | Shared full-gate step list (gate + gate_profile) |
| `scripts/lib/gate_task_cache.mjs` | Cache inventory + turboRunArgs helpers |
| `docs/local-gate-perf/task-cache.md` | Contributor task-cache guide |
| `scripts/gate_fast.mjs` | Day-loop path only (`npm run gate:fast`); not merge bar |
| `scripts/lib/gate_fast_plan.mjs` | Pure day-loop vitest plan (related vs skip; tested) |
| `scripts/pretest.mjs` | `npm test` lifecycle; honors `WOC_SKIP_PRETEST=1` |
| `scripts/lib/gate_artifact_skip.mjs` | Pure skip helper for pretest (tested) |
| `scripts/lib/gate_workers.mjs` | Worker CPU/mem policy + `GATE_WORKER_TIER` caps (free-mem clamp kept) |
| `scripts/gate_profile.mjs` | Phase 1 measurement CLI (timed steps + slow files) |
| `scripts/lib/gate_profile.mjs` | Pure helpers for gate_profile (tested) |
| `docs/local-gate-perf/tier-workers.md` | Cross-OS worker tier guidance |
| `package.json` | scripts: test, test:related, test:changed, pretest, gate, gate:fast, build, build:bundle, check:types |
| `vite.config.ts` | Vitest `test` block (`experimental.fsModuleCache`) |
| `vitest.browser.config.ts` | Browser suite |
| `.github/workflows/ci.yml` | CI shards and checks |
| `docs/qa-gate.md` | QA contract docs |
| `CONTRIBUTING.md` | pnpm lockfile + multi-worktree install policy |
| `docs/local-gate-perf/*` | This packet |

## Ledger (created by this packet)

Fill as phases ship:

- (Phase 1) timing harness path: `scripts/gate_profile.mjs` + `scripts/lib/gate_profile.mjs` (tests: `tests/gate_profile.test.ts`); M1 baseline full gate 336.3s / vitest 277.5s / workers 8 at SHA 2a79ba8a0d
- (Phase 2) gate dedupe approach: **Option C + B** generate-once in gate (`i18n:gen` + freshness + `wiki:content`), vitest step sets `WOC_SKIP_PRETEST=1` (`scripts/pretest.mjs` no-op), client step runs `build:bundle` (no re-gen). Standalone `npm test` / `npm run build` still full regen.
- (Phase 3) new scripts: `gate:fast` (`scripts/gate_fast.mjs` + `lib/gate_fast_plan.mjs`); worker tiers via `GATE_WORKER_TIER` + `GATE_WORKER_TIER_CAPS` in `lib/gate_workers.mjs`; docs `docs/local-gate-perf/tier-workers.md`, `docs/qa-gate.md`, CONTRIBUTING pointer
- (Phase 4) vitest cache flags: `test.experimental.fsModuleCache: true` in `vite.config.ts` (store under `node_modules/.experimental-vitest-cache`); scripts `test:related`, `test:changed`; `@vitest/ui` dropped
- (Phase 5) happy-dom adoption scope: **partial keep** `happy-dom@^20.11.1`; 103/112 DOM files use `// @vitest-environment happy-dom`; 9 files stay on jsdom (see experiment-log / baselines); jsdom kept as dep; lockfile change re-stamped Eastbrook asset source fingerprints (sizes unchanged)
- (Phase 6) pool/projects kept: **none** (drop). Keep Vitest 4.1 defaults `pool: forks`, `isolate: true`, no projects, `fileParallelism: true`. Threads ~2% faster but fails `process.chdir` in `env_bootstrap` tests. isolate:false on 904 no-sim-import files red (71 files + worker crash). Projects not justified without a measured pure set.
- (Phase 7) package manager decision: **full pnpm migration (Option A)**. `packageManager: pnpm@10.34.5` (latest pnpm 10.x; not major 11), single lockfile `pnpm-lock.yaml` (removed `package-lock.json`). Install via `npm install -g pnpm@10.34.5` (Corepack not required; same on macOS/Linux/Windows). CI uses `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile` + `cache: pnpm`. Local multi-worktree shares content-addressable store (`node-linker=hoisted` for npm-compatible layout). `pnpm.onlyBuiltDependencies` allowlists native install scripts. No dual lockfiles.
- (Phase 8) task cache tool: **turbo 2.10.8** (not wireit). Root `turbo.json` +
  `scripts/lib/gate_task_cache.mjs` inventory; `scripts/lib/gate_steps.mjs` shared
  step list. Cacheable: `i18n:gen`, `wiki:content`, `sfx:check`, `check:types`,
  `build:env`, `build:server`, `build:bundle`. Never cache: full vitest, browser
  tests, malware, changed-file biome; i18n freshness always `git diff`. Docs:
  `docs/local-gate-perf/task-cache.md`.
- (Phase 9) suite splits / fixtures: **subsystem-world fixtures kept** on
  professions Guild-letter (`EMPTY_TEST_WORLD` via `professions_trend_util`),
  tank crit immunity (`EMPTY_TEST_WORLD` via util), mail expiry/instance
  (`EMPTY_TEST_WORLD`), stable_yard (`STABLE_TEST_WORLD` = stable_horse camps
  only). File wall wins 7-50x. Dropped: corpse_harvest empty world (seed pins);
  architecture scan rewrite (not a top offender). No mega-file splits this phase
  (prior CI splits already applied; cost was ambient tick load, not file size).
- (Phase 10) experimental runner outcome:
- (Phase 11) tier matrix doc path:
- (Phase 12) teardown:

## OPEN items

1. ~~Whether CI stays on `npm ci` while local uses pnpm, or full migration.~~ **Closed: full migration.**
2. Whether local multi-shard full gate is worth supporting on high-tier only.
3. Owner sign-off if `gate:fast` is ever allowed as pre-push instead of full gate
   (default: no; pre-push floor stays as today).
4. ~~Cold empty-store install and second-worktree install timings (deferred to Phase 7).~~ **Closed: see baselines.**
5. Low/medium tier machine baselines still empty (only M1 high-tier filled).
