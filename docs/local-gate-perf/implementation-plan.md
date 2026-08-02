# Implementation plan: local gate performance

## Goal

Give every contributor (human or agent), on every common OS and machine tier, a
fast local loop and a trustworthy full gate, without regressing correctness,
determinism, or CI contracts.

## Canonical worktree and base

- Worktree path: `/Users/fernando/Documents/wocc-gate-perf-research`
- Feature branch: `feature/local-gate-perf` (phase sub-branches optional)
- Always integrate from: `origin/release/v0.34.0`
- Pre-phase ritual (every phase prompt repeats this):

```bash
cd /Users/fernando/Documents/wocc-gate-perf-research
git fetch origin release/v0.34.0
git merge origin/release/v0.34.0
# resolve conflicts if any; never force-push over release
```

## Experiment doctrine (every phase)

1. Record **before** numbers in `baselines.md` / `experiment-log.md`.
2. Make one coherent change (or a small batch of related knobs).
3. Record **after** numbers; keep only if green and not a regression.
4. On MISS: revert or leave disabled, log why, proceed to next phase.
5. Full merge bar still includes `npm run gate` (or its evolved equivalent) green.

## Canonical per-phase workflow

1. **Pre-flight**: worktree path, clean status for unrelated files, fetch/merge
   `origin/release/v0.34.0`, read `state.md` + this phase file.
2. **Baseline**: time the steps this phase claims to improve (or use Phase 1 harness).
3. **Implement** only in-scope files; module-first for new scripts.
4. **Validate**: phase commands + architecture/i18n guards if relevant + cross-OS notes.
5. **Docs**: progress, state ledger, baselines, experiment-log.
6. **Commit**: Conventional Commits with body; stage explicit paths only; no
   Claude-Session trailers.

## Phase map

| Phase | Title | Primary outcome |
|---|---|---|
| 1 | Baseline harness and machine-tier protocol | Measured numbers + scripts; no product behavior change required |
| 2 | Gate orchestration dedupe | Stop triple i18n/wiki regen inside one gate |
| 3 | Tiered local gate + tier worker presets | `gate:fast` / full gate / documented tiers |
| 4 | Vitest warm path | fsModuleCache, related/changed scripts, optional UI |
| 5 | happy-dom for DOM tests | Faster jsdom subset under Vitest |
| 6 | Pool, projects, isolation experiments | Measured pool/projects; keep only wins |
| 7 | pnpm + shared store for worktrees | Faster multi-worktree installs (cross-OS) |
| 8 | Task cache (turbo or wireit) | Skip unchanged gate steps; parallel independents |
| 9 | Suite cost reduction | Less Sim/fixture waste; split remaining heavies |
| 10 | Experimental runners spike | turbo-test / Bun notes; no default swap unless proven |
| 11 | Cross-platform and tier matrix | Windows/macOS/Linux + low/med/high validation docs |
| 12 | Final QA and packet close | Gate green, CONTRIBUTING updates, teardown offer |

Phases 1 then 2 then 3 are the critical path for agent relief. Phases 5-10 may
reorder if Phase 1 profiling says one bottleneck dominates, but **do not skip
Phase 1**.

## Definition of done (whole packet)

- Phase 1 baselines exist for at least one high-tier machine; low/medium filled
  as available (or CI/proxy measurements documented).
- Full gate still enforces the same correctness surface as CI (tests, types,
  builds, i18n freshness, malware, sfx, biome changed).
- A documented fast path exists for day-to-day and agents.
- Multi-worktree install story improved (pnpm phase kept or explicitly dropped
  with measured reason).
- experiment-log lists tries with keep/drop.
- CONTRIBUTING / README / qa-gate docs updated for new scripts and package manager.
- No em dashes, en dashes, or emojis in packet or code comments added by this work.

## Out of scope

- In-game FPS / renderer settings fairness (other programs)
- Replacing Postgres or server architecture
- Shipping turbo-test or Bun as the only CI runner without dual-run burn-in
- Rewriting the sim for speed unrelated to test fixtures
