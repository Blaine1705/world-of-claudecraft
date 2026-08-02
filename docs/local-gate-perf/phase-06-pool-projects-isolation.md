# Phase 6 (impl) starter: Pool, projects, isolation experiments

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 6 of the Local Gate Performance packet: Vitest pool / projects / isolation experiments.

GOAL: Try pool=threads vs forks, optional vitest projects split, and only carefully scoped isolate:false. Keep only measured wins that do not flake.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. Use Phase 1 top slow files and full-suite baseline
4. feature/local-gate-perf

READ:
- vite.config.ts test block
- research-brief pool/isolate notes
- scripts/lib/gate_workers.mjs (mem clamp still applies)

EXPERIMENTS (each logged separately; revert on fail):
1. pool: 'threads' vs default forks (A/B full or large suite)
2. Optional vitest projects: "unit" (no heavy sim) vs "integration" (sim-heavy) if config complexity is justified
3. isolate: false ONLY on a proven pure project if you create one; NEVER globally on sim suite without audit
4. fileParallelism / maxWorkers interactions with gate_workers (document only if needed)

KEEP RULES:
- Any flake increase = drop
- Process APIs / native modules may require forks; respect that
- Cross-platform: Windows must pass same config

VALIDATION:
- Full npm test green for whatever is kept
- Heavy files from top-10 list re-run twice looking for flakes
- experiment-log each experiment
- progress Phase 6; state ledger pool/projects kept

COMMIT: only kept config; do not leave dead experimental branches of config commented with confusion.

STOP IF: global isolate:false causes non-deterministic failures; revert immediately and log.
```
