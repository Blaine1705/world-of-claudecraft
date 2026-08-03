# Handoff: local gate performance packet

**Branch:** `feature/local-gate-perf`  
**Base:** `origin/release/v0.34.0`  
**Worktree:** `/Users/fernando/Documents/wocc-gate-perf-research`  
**Status:** Phase 12 complete; ready for PR (owner opens when ready).

## What changed (keep list)

| Area | Change | Default? |
|---|---|---|
| Gate orchestration | Generate i18n/wiki once per full gate; pretest skip under gate; client `build:bundle` | yes |
| Day-loop | `pnpm run gate:fast` (malware, biome changed, architecture + localization guards, `check:ts`, vitest related) | day-loop only |
| Workers | `GATE_WORKER_TIER=low\|medium\|high` caps after free-mem clamp; clamp kept | yes |
| Vitest | `experimental.fsModuleCache`; `test:related` / `test:changed` | yes |
| DOM env | happy-dom for most DOM tests; 9 jsdom exceptions | partial keep |
| Package manager | **pnpm 10.34.5** + `pnpm-lock.yaml` only; CI + Dockerfile frozen install; shared store | yes |
| Task cache | turbo 2.10.8 pure steps only (i18n/wiki/sfx/types/builds); tests never cached | yes |
| Suite cost | EMPTY/STABLE subsystem worlds on Guild-letter, tank crit, mail, stable_yard | yes |
| Experimental runners | `test:turbo` / `test:bun` hooks only | **not default** |

Dropped (measured MISSes): vitest threads pool, isolate:false, projects split, @vitest/ui, turbo-test/Bun/Deno as default, corpse_harvest empty world.

## How to measure

```bash
# Machine facts + full timed gate + top slow files
node scripts/gate_profile.mjs --facts
node scripts/gate_profile.mjs --vitest-slow --top 20 --json-out tmp/gate-profile.json

# Day-loop vs merge bar
pnpm run gate:fast
pnpm run gate
```

Numbers and keep/drop rows: `baselines.md`, `experiment-log.md`.  
Which command by tier/OS: `platform-matrix.md`.  
Worker presets: `tier-workers.md`.  
Turbo inventory: `task-cache.md`.

## Contributor permanent surfaces (outside this folder)

- `docs/qa-gate.md` (layers: gate:fast vs full gate; turbo note)
- `CONTRIBUTING.md` (pnpm install, multi-worktree store, gate:fast)
- `README.md` (pnpm install path)
- `scripts/gate.mjs`, `scripts/gate_fast.mjs`, `turbo.json`, `package.json`
- CI: `.github/workflows/ci.yml` pnpm frozen-lockfile + 8-way shards
- Game image: root `Dockerfile` pnpm install (pinned in `tests/deploy_node_version.test.ts`)

## Teardown choice (owner)

**Option A (selected for PR):** keep `docs/local-gate-perf/` as living contributor guidance
(baselines, experiment-log, platform-matrix, tier-workers, task-cache, HANDOFF).
Phase starter prompts (`phase-01` ... `phase-12`) may be trimmed in a follow-up;
do not delete without a later owner decision.

Option B (not chosen): collapse into a short note in `docs/qa-gate.md` / CONTRIBUTING
and delete phase starters.

## Phase 12 verification (M1, 2026-08-03)

| Check | Result |
|---|---|
| `pnpm run gate` | PASS, wall **505.3 s**, workers **8** (multi-session load; vitest 418.7 s; 1946 files / 24702 tests) |
| `pnpm run gate:fast` | PASS, wall **~8 s** on clean tree (related expanded nothing heavy) |
| Pin suite | PASS: ci_workflow, gate_workers, gate_profile, gate_artifact_skip, gate_fast_plan, gate_task_cache, deploy_node_version |
| Em/en dash + emoji scan | clean on packet docs / gate scripts |
| Phase 10 lock | `test` still `vitest run`; turbo-test/Bun not default |

Quiet-host full gate historically ~5-6 min on M1 (Phase 1 336 s / Phase 2 composite 291 s).
Phase 12 wall is correctness green under load, not a best-case claim.

## Remaining OPEN

1. Low/medium-tier **local** machine baselines still empty (only M1 + CI-L1 proxy).
2. Windows host (W1) full gate / gate:fast wall untested (smoke only).
3. Whether local multi-shard full gate is worth supporting on high-tier only.
4. Owner sign-off if `gate:fast` is ever allowed as pre-push (default: no).
5. Optional later: trim `phase-0N-*.md` starters under Option A; refresh non-English
   `docs/i18n/CONTRIBUTING.*` install wording (English CONTRIBUTING is pnpm-correct).

## PR summary (copy-ready)

Local gate performance: generate-once orchestration, `gate:fast` day-loop, worker tier
caps, Vitest fsModuleCache, happy-dom for most DOM tests, full pnpm migration with
shared store (CI + Dockerfile), turbo cache for pure artifact steps, and subsystem
test-world fixtures for the heaviest suites. Full `pnpm run gate` remains the merge
bar; experimental turbo-test/Bun stay opt-in only. Docs under `docs/local-gate-perf/`
plus updates to `docs/qa-gate.md` and CONTRIBUTING.
