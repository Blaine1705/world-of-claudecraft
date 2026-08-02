# Phase 4 (impl) starter: Vitest warm path

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 4 of the Local Gate Performance packet: Vitest warm path (fsModuleCache, related/changed scripts).

GOAL: Make iterative and agent re-runs fast by enabling Vitest caching and convenient related-test scripts. Measure warm vs cold. Drop anything that flakes or slows cold full gate badly.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. feature/local-gate-perf

READ:
- research-brief.md levers table (fsModuleCache, related)
- vite.config.ts test block
- package.json test scripts
- Vitest docs for experimental.fsModuleCache and related/changed CLI for vitest 4.1.x (fetch current docs; do not invent flags)

EXPERIMENTS (record each in experiment-log.md):
1. Enable experimental.fsModuleCache (or current equivalent name) in vitest config
2. Add scripts such as:
   - test:related (or document vitest related usage)
   - test:changed if supported / git-based helper
3. Optional: @vitest/ui as opt-in script only (not required for gate)
4. Confirm .gitignore covers cache dirs if new

MEASURE:
- Cold vitest full or representative shard before/after cache flag
- Warm second run of same command
- Related-test loop: touch one file, run related, wall time

KEEP RULES:
- Full suite must stay green
- If cache causes wrong pass/fail, drop and log
- Windows/macOS/Linux: cache path must not break CI

VALIDATION:
- npm test (or maxWorkers-bounded) green with config change
- New scripts documented in package.json and packet docs
- baselines + experiment-log updated
- progress Phase 4 complete

COMMIT: Conventional Commits + body; explicit paths.
```
