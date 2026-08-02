# Local gate and developer machine performance (planning packet)

Cross-session packet to make `npm run gate` and everyday contributor loops
fast, reliable, and fair across **Windows, macOS, and Linux**, on **low,
medium, and high** tier machines, without weakening the merge contract.

CI already improved (N=8 shards, path filters, parallel checks, incremental
tsc). This packet is about **on-machine** speed: agents, multi-worktree
workflows, and developers who do not own the highest-end hardware.

This directory is scaffolding, not a shipping product feature. The final phase
offers to tear it down (or keep a short permanent note under `docs/`) before merge.

## Index

| File | Role |
|---|---|
| `research-brief.md` | Research synthesis (Vitest, pnpm, happy-dom, turbo, turbo-test, Bun/Deno, CI vs local) |
| `implementation-plan.md` | Phase map, workflow, definition of done |
| `state.md` | Locked decisions, invariants, validation matrix, worktree rules, ledger |
| `progress.md` | Status table + per-phase checklists |
| `baselines.md` | Machine-tier baseline numbers (filled by Phase 1, updated each phase) |
| `experiment-log.md` | Try / measure / keep or drop log (MISS is expected and fine) |
| `tier-workers.md` | Machine-tier worker presets + `gate:fast` vs full gate (Windows/macOS/Linux) |
| `phase-01-...` through `phase-12-...` | Self-contained starter prompts |

## Worktree (canonical)

All implementation for this packet happens in:

```
/Users/fernando/Documents/wocc-gate-perf-research
```

Branch family: `feature/local-gate-perf` (and phase sub-branches if needed).
Integration base: **`origin/release/v0.34.0`** (always fetch and merge before work).

Do not implement this packet in the primary clone if that tree is busy with other
sessions. Phase prompts restate this rule.

## How to start a phase

1. Open the worktree above.
2. Read `state.md` and the relevant section of `research-brief.md`.
3. Copy the fenced starter prompt from the next not-started phase file into a
   fresh agent session (model-neutral; use the best available model for the work).
4. The session must fetch latest `origin/release/v0.34.0` first, then implement,
   measure against baselines, update `progress.md` / `state.md` / `baselines.md` /
   `experiment-log.md`, and commit only this packet's files plus its code.

## Experiment doctrine

Trying many levers is encouraged. Rules:

1. **Baseline first** (Phase 1 numbers, then per-phase before/after).
2. **No silent regressions**: full gate green, or an explicit documented abort
   that reverts the experiment.
3. A MISS (no win, flake, platform break) is success of the process: log it in
   `experiment-log.md` and move on.
4. Prefer reversible, measurable steps over one big bang.

## Related prior work (already on release)

- CI speed packet (PR #2737): N=8 shards, path filters, release-checks split
- Local gate: memory-aware workers (`GATE_MAX_WORKERS`, `computeGateWorkers`)
- Phase 3: `npm run gate:fast` day-loop path + `GATE_WORKER_TIER` caps (see `tier-workers.md`)
- Incremental `check:ts` buildinfo cache
- Dependency-sync preflight and malware `.worktrees` skip
