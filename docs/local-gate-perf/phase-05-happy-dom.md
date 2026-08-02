# Phase 5 (impl) starter: happy-dom for DOM tests

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 5 of the Local Gate Performance packet: adopt happy-dom for Vitest DOM environments where safe.

GOAL: Speed up the ~114 // @vitest-environment jsdom tests by switching to happy-dom if compatibility holds. Measure DOM-subset and full suite. Drop on breakage.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. feature/local-gate-perf

READ:
- research-brief happy-dom notes
- vite.config.ts setupFiles (jsdom_local_storage_setup.ts)
- package.json jsdom dep
- rg '@vitest-environment jsdom' tests

EXPERIMENTS:
1. Add happy-dom devDependency (compatible with vitest 4.1)
2. Pilot: migrate a small batch of UI tests to // @vitest-environment happy-dom
3. If green, migrate remaining jsdom pragmas OR set environmentMatchGlobs
4. Keep jsdom available if a few files need it (document exceptions)
5. Revisit localStorage setup: ensure it still works under happy-dom on Node 22+

MEASURE:
- Time the set of DOM-environment files before/after
- Full suite green check

KEEP/DROP:
- Keep if no correctness loss and measurable win on DOM subset
- Partial keep (exceptions list) is OK
- Full drop is OK if API gaps block admin/svelte tests

VALIDATION:
- npx vitest run on previously jsdom files
- Admin/svelte testing-library tests green
- experiment-log + baselines
- progress Phase 5

COMMIT: explicit paths; note dependency add in commit body.

STOP IF: happy-dom breaks Svelte testing library badly; log and drop rather than rewriting all UI tests.
```
