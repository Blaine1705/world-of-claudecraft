# Baselines: local gate performance

Fill during Phase 1 and update after each phase that claims a wall win.
Use wall-clock seconds unless noted. Mark unavailable cells `n/a`.

## How to measure

Prefer the Phase 1 harness if present. Otherwise:

```bash
cd /Users/fernando/Documents/wocc-gate-perf-research
# Quiet machine recommended for baselines
/usr/bin/time -p npm run gate   # or stepped timings
npx vitest run --reporter=json --outputFile=tmp/vitest-results.json
```

Record:

- date (UTC)
- OS + arch
- CPU logical count, total RAM, free RAM at start
- Node version, package manager version
- git SHA
- GATE_MAX_WORKERS if set
- workers printed by gate

## Machine inventory

| Alias | OS | Arch | CPUs | RAM GB | Tier | Owner/host notes |
|---|---|---|---|---|---|---|
| M1 | | | | | | |
| M2 | | | | | | |
| M3 | | | | | | |

Tier guide: low (4-8 CPUs, 8-16 GB), medium (8-12 CPUs, 16-32 GB), high (12+ CPUs, 32+ GB).

## Phase 0 / Phase 1 cold full gate (before packet code changes)

| Machine | SHA | Workers | Full gate s | Vitest s | Browser s | Types s | Builds s | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## Vitest top slow files (Phase 1)

| Rank | File | Duration ms | Machine | SHA |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |

(Add more rows as needed.)

## Install / worktree cost (Phase 1 and Phase 7)

| Scenario | Manager | Time s | Machine | Notes |
|---|---|---|---|---|
| Fresh install empty store | npm | | | |
| Fresh install warm cache | npm | | | |
| Second worktree install | npm | | | |
| Fresh install empty store | pnpm | | | after P7 |
| Second worktree install | pnpm | | | after P7 |

## After each phase (copy rows forward)

| Phase | Machine | Full gate s | Vitest s | Delta vs Phase 1 | Keep? |
|---|---|---|---|---|---|
| 2 | | | | | |
| 3 | | | | | |
| 4 warm related | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 cold/warm | | | | | |
| 9 | | | | | |
| 10 | | | | | |

## Target bands (aspirational, not hard CI fail)

| Path | Low tier | Medium | High |
|---|---|---|---|
| Agent day-loop (`gate:fast` / related) | under 5 min typical edit | under 3 min | under 2 min |
| Full local gate | usable overnight / CI proxy OK | under 45 min stretch goal | under 25 min stretch goal |

Adjust after Phase 1 real numbers; do not invent false precision.
