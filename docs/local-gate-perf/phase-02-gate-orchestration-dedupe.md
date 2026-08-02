# Phase 2 (impl) starter: Gate orchestration dedupe

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 2 of the Local Gate Performance packet: Gate orchestration dedupe.

GOAL: Ensure a single `npm run gate` does not regenerate the same i18n/wiki artifacts three times. Keep correctness (freshness still enforced). Measure before/after.

WORKTREE AND BASE (mandatory):
1. Work only in /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. Confirm Phase 1 baselines exist (or capture a quick before timing for the steps you change)
4. Branch: feature/local-gate-perf (or phase-02 branch off it)

READ:
- docs/local-gate-perf/state.md, research-brief.md section 1 (duplicated work)
- scripts/gate.mjs
- package.json: pretest, i18n:gen, i18n:build, wiki:content, build, test
- tests that pin gate behavior if any (grep gate.mjs, pretest)

PROBLEM:
gate runs i18n:gen, then npm test runs pretest (i18n again + wiki:content), then build regenerates i18n/wiki again. That wastes minutes on every full gate.

APPROACH OPTIONS (pick the smallest correct one; document choice):
A) gate invokes vitest with a flag/env that skips pretest after artifacts are fresh
B) pretest becomes a no-op when a gate marker env is set and freshness already checked
C) gate sequences generate-once, then runs vitest/build steps that assume artifacts exist
D) other equivalent that preserves `npm test` standalone usefulness

REQUIREMENTS:
- Standalone `npm test` for contributors still regenerates what tests need (or documents the prerequisite)
- i18n freshness still fails the gate when committed artifacts drift
- Windows-safe
- No masked exit codes
- Add/adjust unit tests for any pure skip logic

VALIDATION:
- Time i18n/wiki related steps before and after (use Phase 1 harness if present)
- npm run gate green (or stepped: i18n, vitest subset, build if full gate too long; prefer full gate)
- Update experiment-log + baselines
- biome on touched files; tsc if needed

DOCS: progress, state ledger, experiment-log keep decision.
COMMIT: explicit paths; Conventional Commits + body.

STOP IF: you cannot preserve standalone test workflow without a worse DX; surface options in state.md OPEN items instead of shipping a footgun.
```
