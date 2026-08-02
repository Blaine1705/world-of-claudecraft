# Phase 9 (impl) starter: Suite cost reduction

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 9 of the Local Gate Performance packet: reduce intrinsic suite cost (fixtures, mega-files, scan waste).

GOAL: Using Phase 1 top slow files, make durable test-time improvements: smaller fixtures, fewer full-world Sim constructions, splits of remaining heavies. Do not weaken assertions.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. Re-run or reuse top slow file list from baselines.md
4. feature/local-gate-perf

READ:
- baselines.md top slow files
- vite.config.ts comments on zone growth / testTimeout
- Prior CI-speed patterns: professions_trend split, tank_crit split, renames for shard balance
- tests/helpers if any world fixture helpers exist

EXPERIMENTS (pick 1-3 highest ROI from profile; log each):
1. Shared lightweight world fixtures for tests that only need one subsystem
2. Split a remaining mega-file that is both slow and large
3. Architecture/malware-like full-tree scans: ensure excludes stay correct; reduce double walks if any
4. Avoid importing three/renderer from pure unit tests accidentally

RULES:
- test-first if changing behavior
- determinism preserved
- module-first; do not grow sim.ts/hud.ts
- CI shard completeness still holds if renames (update pins)

MEASURE:
- Before/after duration for each edited file
- Optional full suite sample

VALIDATION:
- npx vitest run on touched tests (twice if flake risk)
- architecture + localization guards if relevant
- experiment-log + baselines
- progress Phase 9

COMMIT: prefer separate commits per split/fixture so review is easy.

STOP IF: a "optimization" removes a decisive assertion; restore and drop.
```
