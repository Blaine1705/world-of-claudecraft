# Phase 7 QA: Supervision + deploy hardening

Adversarial verification of the Phase 7 diff. The risk this session exists to catch is a
supervision change that looks right in a diff and is inert in production: an exit that never
fires, a healthcheck that passes on a dead bot (or fails on a healthy one), a Caddy block
that lands on one vhost, and documentation that tells an operator the wrong thing during the
next incident. Deploy assets have no runtime test coverage in CI, so the string pins are the
only guard, which makes pin quality the whole game here.

Starter prompt for the session:

```
This is Phase 7 QA of the Discord Bot Stability packet: verify Supervision + deploy
hardening.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent
before it counts) plus mutation spot checks on the Phase 7 fatal-close handling and the
heartbeat module.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft.

STEP 0 - PRE-FLIGHT: git status clean (Phase 7 committed). Memory scan including the
test-pin trap index (READ IT before judging or writing any pin: the source-scrape and
literal-arm traps apply directly to the deploy string pins in this diff), plus the docker
health watchdog gotchas entry (a SIGSTOPped PID 1 is a no-op for some probes) and the
compose override merge entry.

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
progress.md, phase-07-supervision-deploy.md, and the Phase 7 diff (git diff against the
phase-start commit; find it from the progress.md status row or the first Phase 7 commit).
It returns: the promised deliverables and acceptance criteria, every file touched, the new
module names and their exported surface, the exact heartbeat path and staleness bound on
both sides (bot/config.ts default and the compose healthcheck literal), and the list of
test files that now pin deploy assets.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering; every finding independently
confirmed by a skeptic agent before it counts):
  - Correctness agent: every Phase 7 deliverable and acceptance criterion actually met.
    Specifically: does the exit fire on every code in the fatal set and on no other code;
    is the exit code nonzero and consistent with the existing fatal handler; is the exit
    reachable in the real close path (not only through the injected test seam); does the
    heartbeat prove loop liveness rather than mere process existence; does a heartbeat
    write failure degrade safely; does the healthcheck fail on a MISSING file, an
    UNREADABLE file, and a STALE file, and pass only on a fresh one; are mem_limit and
    stop_grace_period plausible for this workload with a comment saying why; do both Caddy
    vhosts carry /internal/* identically; does DEPLOY.md now describe the system as it
    actually is after this change.
  - Test coverage agent (or test-coverage-auditor): are the assertions DECISIVE. Hunt the
    constant-self-comparison trap in the compose and Caddy pins (a pin that reads a string
    out of the same file it asserts against proves nothing). Check both arms of every
    either/or claim: fatal versus non-fatal close, fresh versus stale heartbeat, present
    versus missing file. Check that the heartbeat-path agreement pin would actually fail
    if only ONE side moved.
  - Dead-code agent: unused imports, types, and any leftover of the replaced close
    handling; a config key added but never read; a test helper left orphaned.
  - Review Dispatch Matrix rows matching the diff: privacy-security-review (deploy and
    secret-adjacent files). Confirm no other row matches; if one does, the phase went out
    of scope and that is a BLOCKING finding.
  - qa-checklist over the diff.
  - Mutation pass, in an ISOLATED worktree (never over the live checkout; a stash is shared
    across worktrees, so do not lean on one). Mutate, one at a time, and prove the suite
    kills each mutant:
      1. Invert the fatal-close membership guard (fatal codes reconnect, non-fatal exit).
      2. Delete the exit call, keeping the log line.
      3. Change the exit code to 0.
      4. Drop the heartbeat write from the scheduled callback.
      5. Flip the heartbeat staleness comparison (> to <) and separately shift its boundary
         by one interval.
      6. Make the healthcheck's missing-file arm exit 0.
      7. Remove /internal/* from ONE of the two Caddy heredocs only (the occurrence-count
         pin must fail; if it does not, the pin is counting the wrong thing).
      8. Delete mem_limit, then separately stop_grace_period, from the bot service.
    For every mutant, PROVE THE TESTS RAN (memory: mutation-harness-must-prove-tests-ran):
    capture the runner output showing the test count and the failing assertion, never just
    a nonzero exit code. A mutant that survives is a missing test, not a curiosity: record
    which test should have caught it.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a FRESH eyes agent (the fixes are unreviewed code). Re-run
the validation matrix: npx tsc --noEmit; npx vitest run tests/discord_bot.test.ts plus the
Phase 7 bot test files; npm run build:bot; npx vitest run tests/deploy_discord_bot.test.ts
tests/deploy_watchdog.test.ts; npm run ci:changed.

STEP 4 - DOCS: progress.md (Phase 7 QA complete, with any deferral named), state.md (any
drift the audit found, plus gotchas worth carrying: the heartbeat path writability
constraint, the Caddy occurrence-count pin, anything the mutation pass revealed about pin
quality).

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL); counts found and
fixed by severity; mutation kill tally (killed over attempted, with any survivor named and
its fix); deferrals; one-line handoff for Phase 8.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing phase
scope. Stop and surface if the mutation pass cannot prove the tests ran (a harness that
reports kills without evidence is worse than no harness). Do not run the mutation pass over
the live worktree.
```
