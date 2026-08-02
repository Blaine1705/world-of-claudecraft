# Research brief: local gate performance

Snapshot of findings used to design this packet (2026-08). Numbers are
directional; Phase 1 replaces them with measured baselines on this repo.

## 1. What is slow today

### Local gate (`scripts/gate.mjs`)

Serial steps:

1. Dependency sync (`npm ls`)
2. FFmpeg/ffprobe preflight
3. `i18n:gen`
4. i18n freshness git diff
5. malware scan
6. biome changed files
7. sfx check
8. **full unsharded vitest** with workers = min(cpu/2, freeMem/0.75GiB)
9. browser regressions (Playwright Chromium)
10. typecheck (`check:ts` + `check:admin`)
11. env / server / **client build**

### CI vs local asymmetry

| | CI | Local gate |
|---|---|---|
| Tests | 8 shards wall = slowest shard | One full suite |
| Checks | Parallel jobs | Serial after tests |
| Install | Fresh `npm ci` | Long-lived, multi-worktree |

CI PR wall samples under ~8 min after the ci-speed packet. Local wall is the
product of full suite + serial builds + worker/RAM caps. Agents feel this most.

### Suite scale (release/v0.34.0 order of magnitude)

- ~1,950 test files, ~22k cases
- ~500 files construct `new Sim(...)`
- ~114 files force jsdom
- Default environment is `node`; DOM is opt-in per file
- Heavy files: snapshots, delves/dungeons/raids, hud perf budget, architecture scans

### Duplicated work in one gate run

1. `i18n:gen` (step)
2. `pretest` on `npm test` (i18n again + `wiki:content`)
3. Final `npm run build` (i18n + wiki + sitemap + sfx + media + vite again)

### Worker policy

`computeGateWorkers` protects correctness under multi-worktree load (swap
timeouts look like flakes). Mid-tier machines with little free RAM get few
workers and long walls. That is intentional; this packet must improve speed
without reintroducing swap flakes.

## 2. Stack already modern

| Tool | Status on release/v0.34.0 |
|---|---|
| Vite | ^8 |
| Vitest | 4.1.x |
| TypeScript | 7 native via `@typescript/native` + incremental check:ts |
| Biome | 2.5.x |
| esbuild | used for scripts/server/env |
| Package manager | npm + package-lock.json (CONTRIBUTING: npm@10 lockfile semantics) |
| DOM in tests | jsdom 29 |
| Task cache | none (no turbo/wireit) |

Do not replace the core stack casually. Prefer packages and flags that plug into
Vitest/Vite/Node first.

## 3. Levers ranked for this repo

| Lever | Est. impact | Risk | Notes |
|---|---|---|---|
| Profile top slow files | High (focus) | Low | Required before big bets |
| Dedupe i18n/wiki in gate | Medium | Low | Pure orchestration |
| Tiered gate (fast vs full) | Very high for agents | Policy | Full gate remains merge bar |
| Machine-tier worker presets | Medium | Medium | Document GATE_MAX_WORKERS |
| Vitest `fsModuleCache` | Medium warm | Low | Experimental flag |
| `vitest related` / changed | Very high day-to-day | Low | Not a full-gate replacement |
| happy-dom for ~114 files | Low-medium total | Medium | 2-4x on DOM subset |
| pool threads / projects | Medium | Medium | Measure + isolate heavy suites |
| pnpm + shared store | High for multi-worktree install | Medium-high | CI/lockfile migration |
| turbo/wireit task cache | High for unchanged steps | Medium | Cache steps, not "skip tests forever" |
| Suite fixture cost | High long-term | Medium | Less full-world Sim construction |
| turbo-test | Unknown; maybe medium | High | Spike only; Node/sim suite |
| Bun/Deno as gate runner | Speculative | Very high | Spike only; do not merge |

## 4. External packages considered

### Keep / enable under Vitest

- **happy-dom**: Vitest first-class; faster than jsdom for most component tests
- **@vitest/ui**: DX, not full-suite wall
- **Vitest experimental.fsModuleCache**: warm transform cache across runs
- **Vitest projects**: split pure unit vs heavy sim

### Task / install ecosystem

- **pnpm**: content-addressable store; worktrees can share packages; large win
  when spinning many linked worktrees
- **Turborepo (`turbo`)**: hash inputs, cache script outputs, parallel independent
  gate steps
- **Wireit**: lighter incremental npm scripts if turbo feels heavy

### Experimental runners (spike, not default)

- **@miaskiewicz/turbo-test**: Rust Vitest-shaped runner; 5-12x on React+jsdom
  suites in author benches; weaker fit for Node+Sim-heavy suites; bare V8 Node
  gaps (crypto/drivers)
- **Bun test / bun as vitest host**: fast unit microbenches; native addon risk
- **Deno test**: different API; production is Node

### Weak fit / skip as primary plan

- Jest 30, AVA, uvu, node:test as full replacements
- oxlint swap (already on Biome)
- Nx for a single-package app

## 5. Cross-platform and machine tiers

### OS matrix

| OS | Special concerns |
|---|---|
| macOS | Primary agent host; worktrees under `/Users/...` |
| Linux | CI parity (ubuntu-latest); shell scripts |
| Windows | `spawnSync` shell for npm; path length; CRLF; PowerShell vs bash hooks |

Gate already sets `shell = process.platform === 'win32'` for npm. Any new
orchestration must stay shell-safe on Windows.

### Machine tiers (planning definitions)

| Tier | Rough hardware | Expected worker policy |
|---|---|---|
| Low | 4-8 logical CPUs, 8-16 GB RAM, shared with browser/IDE | Conservative workers; prefer `gate:fast`; full gate overnight or CI |
| Medium | 8-12 CPUs, 16-32 GB | Default half-core + mem clamp |
| High | 12+ CPUs, 32+ GB free-capable | Higher workers; optional local multi-shard |

Exact numbers live in `baselines.md` after Phase 1 measurement.

## 6. Non-goals

- Weakening release i18n tier or malware gate
- Hiding flaky tests with higher timeouts as the primary fix
- Replacing Node 26 CI with Bun/Deno
- Whole-repo Biome reformat
- Game runtime FPS work (separate perf program)

## 7. Success signals

- Documented baseline and after numbers per phase
- Mid-tier full gate wall reduced meaningfully without new flake class
- Agents have a documented fast path under minutes for typical edits
- Multi-worktree install cost reduced (pnpm phase)
- Windows/macOS/Linux documented and smoke-checked for scripts
- experiment-log records both wins and deliberate drops
