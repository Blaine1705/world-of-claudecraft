# Phase 12 QA: Verify test integrity + catalog pins

### QA Starter Prompt
```
ultracode

This is Phase 12 QA of the Reliquary Perfection packet.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: adversarially verify that Phase 12's pins are decisive (this phase's entire value
is pin quality, so the QA is a mutation audit).

STEP 0: canonical pre-flight + release sync. Read the test-pin trap index memory and
mutation-harness-must-prove-tests-ran BEFORE judging anything.

STEP 1: Explore agent on the phase diff + phase-12-test-integrity.md.

STEP 2 - ADVERSARIAL MUTATION WORKFLOW: for EACH new or changed pin, spawn a verifier
that (in a scratch checkout or with a stashed working-copy edit it fully reverts)
introduces the exact regression the pin claims to catch and confirms the suite goes
red, proving the test ran (non-zero test count, correct file). Pins to cover at
minimum: recent-ring cap (delete the trim), page-vs-loot-table derivations (drop one id
from a page AND from a loot table, each must redden a DIFFERENT assertion), the growth
sweeps (add a synthetic delve/dungeon key in scratch; sweep must catch it), restore
sanitizers (weaken one filter), multi-page illumination (revert to first-page), rank
name pins (skew CURATOR_RANK_ENGLISH[2]), profile-page lines (delete an interpolation).
Confirm no verifier left the tree dirty (git status clean after each).
Also: a comment-accuracy verifier re-reads every corrected comment against the
evidence (fishing indices vs the recorded arrays; frostveil comment vs the decision in
state.md).

STEP 3 - FIX + fresh-agent review of fixes. node scripts/gate_select.mjs.
STEP 4 - DOCS. STEP 5 - PUSH on PASS + CI babysit.
STEP 6 - FINAL RESPONSE: verdict, mutation-kill table (pin -> proven), deferrals,
handoff to Phase 13.
```
