# Phase 20 QA: Verify inspect + social surfaces

### QA Starter Prompt
```
This is Phase 20 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Privacy: enumerate every field the inspect payload and sheet JSON now carry; confirm
  aggregates/ids only, hidden-deed invisibility preserved, rank-5 gating exact, no
  per-viewer cost increase on the flair broadcast; attempt to read another player's
  firstFind/marks/counts through any surface (must be impossible).
- Parity + wire: payload delta-guarded; offline/online inspect agree; bandwidth green.
- Visual: inspect card with all four badges present at once (holder + Discord +
  contributor + sigil): layout holds on mobile; sheet strip on a long-name locale.
- Tests decisive: boundary pins (rank 4 vs 5), ids-only JSON pin mutation-checked.
Dispatch: privacy-security-review + cross-platform-sync + frontend-seam-reviewer +
qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit + screenshots.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 21.
```
