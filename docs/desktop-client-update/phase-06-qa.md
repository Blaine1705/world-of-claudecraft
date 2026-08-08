# Phase 6 QA: verify the three.js 0.185 train

### QA Starter Prompt
```
This is Phase 6 QA of the Desktop Client Update: verify the three train. This is the
highest-risk phase in the packet; budget accordingly.

Model: Opus 4.8, xhigh effort, 1m context variant if needed. Harness: Claude Code.
ULTRACODE: recommended; run finding-verification adversarially.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0 (if
the merge touches src/render/, re-run the full suite before auditing); git status
clean or stop and ask.

Goal: hold the train to its bar: correctness, visual equivalence (minus the accepted
lighting shift), and the perf gate.

STEP 1 - LOAD CONTEXT: Explore agent (~35 calls, report-first): state.md, progress.md
phase 6 checklist + notes (baseline paths, migration walk record), phase-06-three-
upgrade.md, the diff file list, and brainstorm.md section 3.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets each):
- Migration completeness agent: re-derive the hit-list independently (fresh greps for
  every action-list item: onBeforeCompile anchors, gl.pixelStorei, PCFSoft, Clock,
  Multiply/SubtractiveBlending, decoder paths, Material.type, updateWorldMatrix flag
  hygiene at every matrixAutoUpdate=false site, editor TransformControls) and diff
  against the phase's recorded walk; every discrepancy is a finding.
- Perf gate agent: run `npm run perf:baseline` fresh, compare against the FROZEN
  pre-upgrade baseline: BLOCKING if any preset regresses avg FPS or 1% lows by more
  than 5% in any scenario; also run `npm run perf:crowd` and compare its decay curve.
  Record all numbers in the phase notes. Improvements get documented too (they are the
  point).
- Visual agent: compare the before/after screenshot sets scene by scene; classify every
  difference as (a) the expected r181/PMREM lighting shift, (b) bloom-threshold change
  from postprocessing 6.37.6, or (c) UNEXPLAINED (BLOCKING until explained). Assemble
  the lighting before/after pairs into a short summary FOR THE USER: the r181
  acceptance is the user's call per state.md OPEN items; present it in the final
  response, do not decide it yourself.
- Test-quality agent (test-coverage-auditor): no render test was weakened/deleted to
  get green; the draw-stats shim still measures what it claims (composer pass totals);
  any updated pins carry rationale.
- Dispatch per the implementation-plan.md matrix (frontend-seam-reviewer) +
  qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX (except the r181 user decision, which is
surfaced, not fixed); rerun `npm test` + `npx tsc --noEmit` +
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY: progress.md, state.md (final perf delta table location, the
r181 decision status), memory (record the migration outcomes worth keeping:
which items had hits, the perf delta headline).

FINAL RESPONSE: verdict, the perf delta table (baseline vs after, per preset), the
lighting-shift summary with screenshot paths FOR THE USER TO ACCEPT, finding counts,
deferrals, handoff for phase 7.

STOPPING RULES: FAIL the phase (do not band-aid) if the perf gate breaks and the cause
is not a fixable migration miss; the fallback ladder is postprocessing 6.39.2/6.39.3
and n8ao 1.10.3 before questioning three itself, and each fallback step needs the user
informed.
```
