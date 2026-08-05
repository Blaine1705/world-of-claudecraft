# Phase 21 QA: Verify catalog growth

### QA Starter Prompt
```
ultracode

This is Phase 21 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - ADVERSARIAL AUDIT (Workflow): re-run the Phase 21 skeptic derivation
independently for EVERY page (new and pre-existing: the full catalog, since totals
moved), plus:
- Completion math: a fresh character CAN reach 100 percent (no retired/unreachable id
  in the completion set; enumerate the completion id set and verify every id has a
  live acquisition path).
- Join sync: a save with historic slain marks gains the page fills retro-silently.
- Blob/wire: worst-case re-measured; the linear-growth claim holds at the new size.
- Wiki: spoiler-safe, searchable, freshness-gated; no hidden text.
- Mutation spot-checks on three of the new derivation pins.
Dispatch: architecture-reviewer + cross-platform-sync + test-coverage-auditor +
qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + page screenshots.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 22.
```
