# Phase 17 QA: Verify obtain counts + wire perf

### QA Starter Prompt
```
This is Phase 17 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Movement-vs-acquisition sweep: enumerate EVERY call site that can add a catalogued
  item to a container (loot, need/greed, master loot, quest reward, craft, vendor buy,
  buyback restore, mail, trade, bank deposit/withdraw, bag moves, split stacks) and
  classify: increments or not. Bank withdrawals, bag moves, splits, and trade-backs of
  the same instance must NOT increment; verify each with the file open.
- Memo audit (caches/memos memories): every mutation point sets the dirty flag (marks,
  firstFind, counts, restore, retro sync); reconnect/resume rebuilds; multi-Sim
  isolation (the flag lives per state, not module-global).
- Persistence: old-blob load (pageId present, counts absent), new-blob round-trip,
  hostile counts (1e18, -5, NaN) sanitized; migration-safety re-run if the QA fixes
  touch the shape.
- Determinism + parity: same-seed; offline count equals online count for the same
  script of grants (drive the wire test rig).
- Doctrine: nothing reads counts for power/score; the design-doc amendment matches
  what shipped.
Dispatch: architecture-reviewer + cross-platform-sync + migration-safety +
test-coverage-auditor + qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 18.
```
