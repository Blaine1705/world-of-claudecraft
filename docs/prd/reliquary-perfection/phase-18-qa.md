# Phase 18 QA: Verify rewards ladder

### QA Starter Prompt
```
ultracode

This is Phase 18 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

STEP 0: canonical pre-flight + release sync. STEP 1: Explore agent on the phase diff.

STEP 2 - QA AUDIT (parallel, COVERAGE):
- Doctrine: every new deed Renown 0 (pinned), cosmetic-only rewards, luck never scores;
  the completion-deed self-reference exclusion is correct and commented (verify the
  math: owning every OTHER relic grants it; the granted title does not change the
  completion total it was judged against).
- Grant-point audit: last-relic edge (fill orders: item-last, mark-last, mount-last,
  title-last: each must grant), retro silence on all three new deed families, the
  illuminated-set persistence round-trip + old-blob back-compat.
- Fan-out: marquee anti-repeat under reconnect and re-join; Discord feed border arm;
  no per-relic marquee path exists; S3 matcher covers the marquee template.
- Pins: deeds_content counts/SHA recomputed not weakened (mutation-check one).
Dispatch: architecture-reviewer + cross-platform-sync + migration-safety +
privacy-security-review + test-coverage-auditor + qa-checklist.

STEP 3 - FIX + fresh-agent fix review + node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit.
STEP 6 - FINAL RESPONSE: verdict, counts, deferrals, handoff to Phase 19.
```
