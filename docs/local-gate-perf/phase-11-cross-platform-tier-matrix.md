# Phase 11 (impl) starter: Cross-platform and machine-tier matrix

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 11 of the Local Gate Performance packet: cross-platform and machine-tier validation matrix.

GOAL: Prove (or document gaps for) Windows, macOS, and Linux; publish clear low/medium/high tier guidance for humans and agents.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. feature/local-gate-perf

READ:
- All prior phase keep decisions in experiment-log.md and state.md ledger
- scripts/gate.mjs win32 shell handling
- CONTRIBUTING.md and docs/qa-gate.md current text
- baselines.md machine inventory

DELIVERABLES:
1. docs/local-gate-perf/platform-matrix.md (new) with:
   - Scripts: gate, gate:fast, install (npm/pnpm), test:related
   - Rows: Windows / macOS / Linux
   - Columns: status (verified / smoke / untested), notes, known issues
2. Fill baselines.md machine inventory as much as possible (use CI logs as Linux proxy if no local Linux)
3. Contributor-facing section: "Which command should I run?" for low vs high tier and agent vs human
4. Update docs/qa-gate.md and CONTRIBUTING.md pointers (short, not a novel)
5. Fix any cross-platform bugs found in gate scripts if small and in scope

VALIDATION:
- Re-run gate:fast and measurement harness on this OS
- Note anything Windows-specific still unverified
- progress Phase 11

COMMIT: docs + any small script fixes.

STOP IF: a platform bug is large; file it in experiment-log as follow-up rather than expanding scope infinitely.
```
