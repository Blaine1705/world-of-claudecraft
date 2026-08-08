# Phase 5 QA: verify governor and LOW tier

### QA Starter Prompt
```
This is Phase 5 QA of the Desktop Client Update: verify the recovery-ladder fix and the
LOW monotonicity retune.

Model: Opus 4.8, xhigh effort. Harness: Claude Code. ULTRACODE: allowed if you want an
adversarial-verify pass over the numeric retune.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0;
git status clean or stop and ask.

Goal: audit phase 5. This phase changes balance-adjacent numbers and subtle control
flow; the audit must be adversarial about both.

STEP 1 - LOAD CONTEXT: Explore agent (~30 calls, report-first): state.md, progress.md
phase 5 checklist, phase-05-governor-low-tier.md, the diff, and the recorded perf
numbers.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets):
- Governor correctness agent: verify the reproducing test genuinely failed pre-change
  (`git stash` the fix or check the commit order; the phase was told to write it
  first); trace recover() for NEW stall shapes (can the return-to-baseline itself stall
  on the counter gate? can resolution now recover while a genuine overload exists,
  causing oscillation?); confirm degrade behavior unchanged; confirm the frame-cap pins
  are untouched and green.
- Numeric retune agent: recompute every monotonicity claim from the merged tables by
  hand (effective radius, caps, floors, fill); check NO OTHER tier relation broke
  (medium vs high, mobile branches, iOS lowPlus); check the lowPlus gate matches what
  state.md documents; flag any number that looks invented rather than derived.
- Test-quality agent (test-coverage-auditor): monotonicity pins read the real exported
  tables (no copied literals, no self-comparison); the ladder test would catch a
  reversion of EACH half of the fix independently (scratch-mutation AFTER committing);
  updated gfx pins were changed deliberately with commit-body rationale, not weakened
  to pass.
- Dispatch per the implementation-plan.md matrix (frontend-seam-reviewer for fairness)
  + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun
`npx vitest run tests/render_budget.test.ts tests/gfx.test.ts`, `npx tsc --noEmit`,
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY: progress.md, state.md, memory (record the verified ladder
semantics for the phase 6 baseline).

FINAL RESPONSE: verdict, counts, deferrals, handoff for phase 6 (note: phase 6 freezes
its perf baseline AFTER this phase, so flag anything here that would make that baseline
unstable).

STOPPING RULES: stop and surface oscillation risk findings rather than patching them
ad hoc; a control-loop change needs the user's eyes.
```
