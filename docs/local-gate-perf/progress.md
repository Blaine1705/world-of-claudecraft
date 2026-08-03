# Progress: local gate performance

Status: not-started / in-progress / blocked / complete / dropped

## Status table

| Phase | Title | Status | Started | Completed | Notes |
|---|---|---|---|---|---|
| 1 | Baseline harness and machine-tier protocol | complete | 2026-08-02 | 2026-08-02 | M1 high-tier baseline 336.3s full gate |
| 2 | Gate orchestration dedupe | complete | 2026-08-02 | 2026-08-02 | generate-once + pretest skip + build:bundle |
| 3 | Tiered local gate + tier worker presets | complete | 2026-08-02 | 2026-08-02 | gate:fast ~25s day-loop; full gate still merge bar |
| 4 | Vitest warm path | complete | 2026-08-02 | 2026-08-02 | fsModuleCache keep; test:related/changed; no @vitest/ui |
| 5 | happy-dom for DOM tests | complete | 2026-08-02 | 2026-08-02 | partial keep: 103 happy-dom, 9 jsdom exceptions; lockfile seal remint |
| 6 | Pool, projects, isolation experiments | complete | 2026-08-02 | 2026-08-02 | drop all: keep default forks+isolate; no projects |
| 7 | pnpm + shared store for worktrees | complete | 2026-08-02 | 2026-08-02 | full migration; 2nd worktree ~14s vs npm ~59s |
| 8 | Task cache (turbo or wireit) | complete | 2026-08-02 | 2026-08-02 | turbo 2.10.8 keep; warm pure steps FULL TURBO ~87ms |
| 9 | Suite cost reduction | complete | 2026-08-02 | 2026-08-02 | EMPTY/STABLE subsystem worlds keep; corpse empty drop |
| 10 | Experimental runners spike | complete | 2026-08-02 | 2026-08-02 | not default: turbo-test wall win, pass rate fail; Bun pure only |
| 11 | Cross-platform and tier matrix | complete | 2026-08-02 | 2026-08-02 | platform-matrix.md; macOS verified; Linux/Windows smoke |
| 12 | Final QA and packet close | complete | 2026-08-02 | 2026-08-03 | full gate green; Dockerfile pnpm; Option A keep packet |

## Per-phase deliverables

### Phase 1 - Baseline harness and machine-tier protocol
- [x] Measurement script or documented commands that time each gate step
- [x] Top-N slowest vitest files captured (JSON reporter or equivalent)
- [x] Machine tier table started in `baselines.md` (at least one machine fully filled)
- [x] `experiment-log.md` header + first baseline row
- [x] No product behavior change required; docs + tooling only is OK
- [x] Tests for any new pure helpers under `scripts/` or `tests/`

### Phase 2 - Gate orchestration dedupe
- [x] One gate run does not triple-regenerate i18n/wiki without need
- [x] pretest / gate / build interaction documented
- [x] Before/after wall for gate steps that regenerate artifacts
- [x] Full gate green (see baselines.md / experiment-log; profile JSON under tmp/)

### Phase 3 - Tiered local gate + tier worker presets
- [x] Documented `gate:fast` (or equivalent) for agents/day-to-day
- [x] Full gate still the merge bar
- [x] Tier presets or docs for GATE_MAX_WORKERS (low/medium/high)
- [x] Cross-platform notes for scripts
- [x] Pins/tests for new scripts as needed

### Phase 4 - Vitest warm path
- [x] fsModuleCache (or measured drop if harmful) decision recorded
- [x] `test:related` / changed helper scripts
- [x] Warm re-run numbers in baselines
- [x] Optional @vitest/ui only if it does not bloat default install path badly
  (dropped: not installed; DX-only, re-open later if needed)

### Phase 5 - happy-dom
- [x] happy-dom dependency added if experiment kept (`happy-dom@^20.11.1`)
- [x] jsdom pragma migration strategy (all or subset): per-file pragmas; 103 happy-dom, 9 jsdom
- [x] DOM suite green; full suite green if adopted (plus fingerprint remint for lockfile)
- [x] Keep or drop logged (partial keep)

### Phase 6 - Pool / projects / isolation
- [x] At least one pool experiment measured (threads vs forks)
- [x] Optional vitest projects split evaluated
- [x] isolate:false only on proven-safe project if at all
- [x] Keep/drop log; full suite green for anything kept
  (kept: status quo forks+isolate; full suite green under forks maxWorkers=4)

### Phase 7 - pnpm
- [x] Multi-worktree install timing before/after (npm secondary ~59s; pnpm warm-store second worktree ~14s; first populate ~24-30s)
- [x] Windows/macOS/Linux install notes (CONTRIBUTING multi-worktree section)
- [x] CI and CONTRIBUTING policy updated (full migration; single pnpm-lock.yaml)
- [x] Fallback plan if dropped (documented in experiment-log; not needed: keep)
- [x] Full gate under pnpm (run as part of phase validation)

### Phase 8 - Task cache
- [x] turbo or wireit chosen with rationale (turbo keep; wireit dropped)
- [x] Cacheable steps listed (i18n, types, builds, not blind test skip)
- [x] Cold vs warm gate numbers (pure multi-task 24s cold / 87ms warm FULL TURBO)
- [x] Full correctness still enforced when inputs change (catalog bust + freshness + tests always run)

### Phase 9 - Suite cost reduction
- [x] Profiling-driven fixture or split changes (EMPTY/STABLE subsystem worlds on top heavies)
- [x] Top heavies improved or justified defer (guild letter, mail, tank_crit, stable_yard kept; corpse empty dropped)
- [x] Architecture/scan cost considered if it is a top offender (0.5s; drop rewrite)
- [x] Touched suites green twice (68 tests); corpse green after revert; full suite optional re-profile deferred

### Phase 10 - Experimental runners
- [x] turbo-test spike numbers + pass rate (~126s wall, 811/1960 files red)
- [x] Optional Bun microbench (pure green; bunx vitest no win)
- [x] Explicit decision: **not default** (drop dual-run and adopt)
- [x] No default gate swap; locked in state.md; experimental `test:turbo` / `test:bun` only

### Phase 11 - Cross-platform and tier matrix
- [x] Validation matrix filled for Windows, macOS, Linux (as available)
- [x] Low/medium/high guidance in CONTRIBUTING or docs
- [x] Agent workflow docs (worktree + store + gate:fast)
  (platform-matrix.md; macOS verified gate:fast; Linux CI-L1 proxy; Windows smoke)

### Phase 12 - Final QA and close
- [x] `pnpm run gate` green on worktree (M1: 505.3s workers 8 under multi-session load; 1946 files / 24702 tests)
- [x] `pnpm run gate:fast` green (~8s clean tree)
- [x] Docs synced (qa-gate.md, CONTRIBUTING, platform-matrix already; Dockerfile + release checklist + scripts/CLAUDE.md fixed)
- [x] experiment-log complete (Phase 12 row + detail)
- [x] Teardown offer recorded: **Option A** keep `docs/local-gate-perf` living guidance; starters may trim later
- [x] HANDOFF.md PR-oriented summary
- [x] Pin tests green including Dockerfile pnpm pin
