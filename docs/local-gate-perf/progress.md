# Progress: local gate performance

Status: not-started / in-progress / blocked / complete / dropped

## Status table

| Phase | Title | Status | Started | Completed | Notes |
|---|---|---|---|---|---|
| 1 | Baseline harness and machine-tier protocol | complete | 2026-08-02 | 2026-08-02 | M1 high-tier baseline 336.3s full gate |
| 2 | Gate orchestration dedupe | complete | 2026-08-02 | 2026-08-02 | generate-once + pretest skip + build:bundle |
| 3 | Tiered local gate + tier worker presets | complete | 2026-08-02 | 2026-08-02 | gate:fast ~25s day-loop; full gate still merge bar |
| 4 | Vitest warm path | not-started | | | |
| 5 | happy-dom for DOM tests | not-started | | | |
| 6 | Pool, projects, isolation experiments | not-started | | | |
| 7 | pnpm + shared store for worktrees | not-started | | | |
| 8 | Task cache (turbo or wireit) | not-started | | | |
| 9 | Suite cost reduction | not-started | | | |
| 10 | Experimental runners spike | not-started | | | |
| 11 | Cross-platform and tier matrix | not-started | | | |
| 12 | Final QA and packet close | not-started | | | |

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
- [ ] fsModuleCache (or measured drop if harmful) decision recorded
- [ ] `test:related` / changed helper scripts
- [ ] Warm re-run numbers in baselines
- [ ] Optional @vitest/ui only if it does not bloat default install path badly

### Phase 5 - happy-dom
- [ ] happy-dom dependency added if experiment kept
- [ ] jsdom pragma migration strategy (all or subset)
- [ ] DOM suite green; full suite green if adopted
- [ ] Keep or drop logged

### Phase 6 - Pool / projects / isolation
- [ ] At least one pool experiment measured (threads vs forks)
- [ ] Optional vitest projects split evaluated
- [ ] isolate:false only on proven-safe project if at all
- [ ] Keep/drop log; full suite green for anything kept

### Phase 7 - pnpm
- [ ] Multi-worktree install timing before/after
- [ ] Windows/macOS/Linux install notes
- [ ] CI and CONTRIBUTING policy updated if migration kept
- [ ] Fallback plan if dropped
- [ ] Full gate green under chosen package manager

### Phase 8 - Task cache
- [ ] turbo or wireit chosen with rationale
- [ ] Cacheable steps listed (i18n, types, builds, not blind test skip)
- [ ] Cold vs warm gate numbers
- [ ] Full correctness still enforced when inputs change

### Phase 9 - Suite cost reduction
- [ ] Profiling-driven fixture or split changes
- [ ] Top heavies improved or justified defer
- [ ] Architecture/scan cost considered if it is a top offender
- [ ] Full suite green

### Phase 10 - Experimental runners
- [ ] turbo-test spike numbers + pass rate
- [ ] Optional Bun microbench
- [ ] Explicit decision: not default / dual-run / adopt
- [ ] No default gate swap without owner sign-off in state.md

### Phase 11 - Cross-platform and tier matrix
- [ ] Validation matrix filled for Windows, macOS, Linux (as available)
- [ ] Low/medium/high guidance in CONTRIBUTING or docs
- [ ] Agent workflow docs (worktree + store + gate:fast)

### Phase 12 - Final QA and close
- [ ] `npm run gate` (or evolved) green on worktree
- [ ] Docs synced (qa-gate.md, CONTRIBUTING as needed)
- [ ] experiment-log complete
- [ ] Teardown offer recorded; packet kept or slimmed
