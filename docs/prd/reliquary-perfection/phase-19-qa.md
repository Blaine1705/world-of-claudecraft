# Phase 19 QA: Verify borders in-world

### QA Starter Prompt
```
ultracode

This is Phase 19 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Authority: attempt the exploit paths against the real command handler (set an
  unearned slug, a title-deed id, a nonsense slug, replay another player's set);
  all must fail closed server-side, not just client-side.
- Perf: profile the nameplate path with borders active on a crowded scene (the crowd
  freeze memory: nameplates were NOT the cause there, keep it that way): no per-frame
  allocation, raster cache hit rate unchanged, will-change discipline intact;
  bandwidth suite green with the new entity field.
- Parity: offline Sim shows your own border on portrait/nameplate identically to
  online; reconnect keeps it; old saves null-safe.
- Fairness: every graphics preset renders the accent; pinned.
- Visual: screenshots of all four borders at nameplate distance; legibility check.
Dispatch: architecture-reviewer + cross-platform-sync + frontend-seam-reviewer +
privacy-security-review + qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + commit border screenshots.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 20.
```
