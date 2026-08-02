# Phase 10 (impl) starter: Experimental runners spike (turbo-test / Bun)

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 10 of the Local Gate Performance packet: experimental runner spikes.

GOAL: Measure turbo-test and optionally Bun against Vitest on this suite. Default remains Vitest unless results are overwhelmingly good and owner signs off in state.md. Trying and dropping is success.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. feature/local-gate-perf
4. Do not break default npm test / gate while experimenting (use separate scripts)

READ:
- research-brief sections on turbo-test, Bun, Deno
- https://lib.rs/crates/turbo-test and npm @miaskiewicz/turbo-test README (fetch current)
- package.json test script

EXPERIMENTS:
1. turbo-test:
   - Install as devDependency in a way that does not force production path
   - npx turbo-test --jobs N on full suite or large subset
   - Record: wall time, pass/fail counts, first 20 failure signatures
   - Compare to vitest same machine same workers
2. Optional Bun:
   - bun test on a small pure unit folder OR bun run vitest on a subset
   - Record pass rate and wall
3. Deno: only if time; expected drop

OUTPUTS:
- experiment-log detailed sections
- state.md decision: not default (expected) | dual-run | adopt (needs owner)
- Optional scripts: test:turbo, test:bun that are clearly experimental
- Do NOT switch package.json "test" or gate.mjs to turbo-test/Bun without owner line in state.md locked decisions

VALIDATION:
- Default vitest path still green
- No CI default change unless adopt is approved
- progress Phase 10

COMMIT: docs + optional experimental scripts/deps. Prefer not committing huge binary noise.

STOP IF: experimental runner corrupts node_modules or lockfile; repair and drop.
```
