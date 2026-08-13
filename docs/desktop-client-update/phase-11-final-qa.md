# Phase 11: final integration QA

### QA Starter Prompt
```
This is Phase 11 of the Desktop Client Update: final integration QA. This closes the
packet.

Model: Fable 5, xhigh effort. Harness: Claude Code. ultracode. Orchestrate this audit as a deterministic Workflow: parallel audit
agents per focus area, findings adversarially verified by independent skeptics
before they count.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push (the user lifts this AFTER this phase);
first action: discover the LATEST release/* branch (git ls-remote --heads origin
'release/*', highest version), ancestry-guard, then pull+merge it (state.md standing
rule 3) and re-run the full suite if the merge is non-trivial; git status clean or
stop and ask.

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
perf evidence bundle (phase 5 monotonicity numbers, phase 6 baseline-vs-after table
as HISTORICAL three-train evidence, the interim-reconcile re-frozen baselines as the
current reference, phase 4 hidden-window evidence) assembled into the phase notes as
the packet's headline results.

STEP 2b - THE SEAL RE-MINT LIST (deferred from phase 1 by user decision 2026-08-08;
refreshed by the 2026-08-13 interim reconcile; run over the branch's FINAL lockfile):
- The 9 accepted-red suites / 14 tests: the 8 lockfile-keyed asset suites (11 tests)
  via the 5-step size-preserving runbook (scripts/assets/remint_lockfile_fingerprints
  .mjs, order in commit 218de2db08), plus tests/mob_portrait_source_manifest.test.ts
  (3 tests since upstream 154f0563ce) via the portrait re-render + review + receipt
  flow.
- The eastbrook polish provenance RE-RECORD: prefer upstream fb78debb7f's
  scripts/assets/eastbrook_grand_armoury/rerecord_polish_provenance.mjs (its --check
  mode first; honor its twelve-input verification); renderer.ts bytes are a hashed
  provenance input the three train moved, so this fires unconditionally. If the r185
  delta touches town rendering, the committed captures are STALE and must be RE-SHOT,
  not merely re-recorded.
- The scripts/assets/*/export_entry.js PCFSoftShadowMap renames (six files:
  eastbrook_grand_armoury, fenbridge_town, eastbrook_town, eastbrook_noticeboard,
  banker_chest, eastbrook_mailbox), batched here because they are seal-fingerprinted.
- The five-surface three-0.165 doc flip (pre-existing phase 6 gap, census claim
  stale-0165-doc-arms): the README.md Three.js badge PLUS all 21 docs/i18n/README.*
  .md localized badges (release_version.mjs processes them; a root-only flip leaves
  them inconsistent), CONTRIBUTING.md's "pnpm patch three@0.165.0" regeneration
  doctrine (it names a file that no longer exists), docs/perf/hitch/README.md's
  reference to the deleted patch, and the "pinned r165" comment wording at the
  prewarm_policy idle-upload test (re-verify the indivisible-upload premise on r185
  when rewording). Deliberate r165 provenance/history comments stay.
- The phase 2 QA deferral: the dist grep proving the built output never ships the
  DESKTOP_VERSION '0.0.0' fallback (subsumes download-page staleness).
- The phase 2 QA nice-to-have: the win32 pre-ready menu launch check.

STEP 3 - WHAT-IS-MISSING PASS (adversarial): spawn a fresh agent (COVERAGE prompt)
over the FULL packet diff asking only: what did every previous phase and QA miss?
Cross-feature interactions are its hunting ground (prefs store fields fighting;
ready-to-show vs bounds vs display mode; notification + presence both observing
focus; the three upgrade's effect on the governor numbers from phase 5; and, added
2026-08-13: upstream's shadow cadence consumes the governor's pressure/enabled
signal on medium+ tiers, inert at LOW where the sun casts no shadow, so check that
cadence enter/exit does not oscillate against the split recovery ladder as it
re-raises frame cost). Every finding is triaged: fix now (small), or documented
deferral (user decides at PR).

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
waits for the user's explicit go (branch: feature/desktop-client-update; base: the
LATEST release/* branch at PR time, discovered fresh; screenshots for the PR body
get captured at PR time via the pr-screenshots skill).

STOPPING RULES: any qa-checklist item that cannot be evidenced is a FAIL for the
packet, not a checkbox to soften; stop and surface it.
```
