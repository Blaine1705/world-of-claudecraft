# Phase 8 (impl) starter: Task cache (turbo or wireit)

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 8 of the Local Gate Performance packet: task-graph caching for gate steps.

GOAL: Cache pure artifact steps (i18n, types, env/server builds) when inputs are unchanged, and parallelize independent steps where safe. Never cache "tests passed" without re-running tests when sources change.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. Prefer package manager decision from Phase 7 (if dropped, use npm)
4. feature/local-gate-perf

READ:
- research-brief turbo vs wireit
- scripts/gate.mjs step list
- Phase 2 dedupe behavior (do not reintroduce triple gen)

CHOOSE TOOL:
- turbo: better parallel + remote cache story; good for many scripts
- wireit: lighter, npm-script incremental
Document choice in experiment-log and state ledger.

REQUIREMENTS:
1. List cacheable tasks with precise inputs/outputs (i18n catalogs, tsconfig, src/**, etc.)
2. Non-cacheable: full vitest (always run when source/test inputs change); malware gate may be cheap enough to always run
3. gate.mjs either calls turbo/wireit pipeline or package.json gate is re-pointed carefully with same step semantics
4. Warm second gate should skip unchanged artifact steps (show log evidence)
5. Changing a catalog key must invalidate i18n task
6. Windows-safe

MEASURE:
- Cold full gate vs warm no-op gate (same tree)
- Parallelism benefit if any independent steps now overlap

VALIDATION:
- Correctness: mutate a file that should bust cache and confirm re-run
- Full gate green
- Docs for contributors
- experiment-log keep/drop
- progress Phase 8

COMMIT: config + gate wiring + docs.

STOP IF: caching hides i18n freshness failures or test failures; design is wrong. Fix or drop.
```
