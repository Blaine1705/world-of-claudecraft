# Phase 11: final integration QA

### QA Starter Prompt
```
This is Phase 11 of the Desktop Client Update: final integration QA. This closes the
packet.

Model: Opus 4.8, xhigh effort. Harness: Claude Code. ULTRACODE: recommended for the
whole-packet audit sweep.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push (the user lifts this AFTER this phase);
first pull+merge origin/release/v0.36.0 and re-run the full suite if the merge is
non-trivial; git status clean or stop and ask.

Goal: verify the whole packet as one deliverable against
docs/desktop-client-update/qa-checklist.md, assemble the evidence bundle, and offer
teardown.

STEP 1 - LOAD CONTEXT: Explore agent (~35 calls, report-first): qa-checklist.md,
state.md (full inventory), progress.md (every phase PASS status; any non-PASS stops
this phase), and `git -C <worktree> diff --name-only <packet-start-base>..HEAD` grouped
by area. The packet-start base is recorded in state.md.

STEP 2 - EXECUTE THE MATRIX: walk qa-checklist.md item by item; each gets evidence
(a command run, a diff grep, a recorded number), never an assertion from memory.
Highlights that need real runs: the scope-neutrality diff check (no sim/server/wire
changes), the full `npm run gate` (record the known environmental browser-test failure
if it fires; PR CI arbitrates), the electron:pack build, the i18n guards, and the
perf evidence bundle (phase 5 monotonicity numbers, phase 6 baseline-vs-after table,
phase 4 hidden-window evidence) assembled into the phase notes as the packet's
headline results.

STEP 3 - WHAT-IS-MISSING PASS (adversarial): spawn a fresh agent (COVERAGE prompt)
over the FULL packet diff asking only: what did every previous phase and QA miss?
Cross-feature interactions are its hunting ground (prefs store fields fighting;
ready-to-show vs bounds vs display mode; notification + presence both observing
focus; the three upgrade's effect on the governor numbers from phase 5). Every
finding is triaged: fix now (small), or documented deferral (user decides at PR).

STEP 4 - FIX + FINAL GATE: apply fixes, rerun `npm run gate`, update progress.md
(all rows final), state.md (final inventory), and the memory topic file
(desktop-client-update-program: packet COMPLETE, evidence paths, deferrals).

STEP 5 - PACKET TEARDOWN OFFER: surface every deferred item first, then ask the user
explicitly: "All phases are complete and green. OK to delete docs/desktop-client-update/
(the planning scaffolding) before the PR?" Delete ONLY on confirmation, ONLY that
directory (`git rm -r docs/desktop-client-update/`, commit
`docs: remove desktop-client-update planning scaffolding`). If declined, leave it.

FINAL RESPONSE: packet verdict; the evidence-bundle headline (perf deltas, features
shipped); the complete deferral list (Application ID provisioning, notifications
toggle if deferred, residual 2 cap-window note, the #2243 follow-up workstreams,
Electron 44 soak, WebGPU branch); teardown status; and the reminder that push/PR
waits for the user's explicit go (branch: feature/desktop-client-update; base:
release/v0.36.0; screenshots for the PR body get captured at PR time via the
pr-screenshots skill).

STOPPING RULES: any qa-checklist item that cannot be evidenced is a FAIL for the
packet, not a checkbox to soften; stop and surface it.
```
