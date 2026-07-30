# Phase 1 QA: Bot verification foundation

Phase 1 promised zero behavior change while touching five bot files, the tsconfig include, the
gate step list, and CI. Both halves need proof: that the type fixes and the injected seams really
did leave the bot's runtime behavior identical, and that the new baseline tests are decisive
enough to be worth having, since Phases 2 and 3 build on them. This session audits both, and
mutation-checks the exact code paths those baseline tests claim to cover.

## Starter prompt

```
This is Phase 1 QA of the Discord Bot Stability packet: verify the bot verification foundation.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code. ULTRACODE: yes, run the
adversarial-verify Workflow (every finding independently confirmed by a skeptic agent before it
counts) plus mutation spot checks on the code paths the new baseline tests claim to cover:
bot/config.ts (required, default, and fallback arms) and bot/server_client.ts (the call
envelope). Judge every refutation yourself rather than taking it on faith, and require the
skeptic to have the file open before a refutation counts.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft.

STEP 0 - PRE-FLIGHT: run `git status` and confirm it is clean with Phase 1 committed; another
session may share this checkout, so ASK before touching anything you did not create. Memory scan
including the test-pin trap index (READ IT before judging or writing any pin), plus
mutation-harness-must-prove-tests-ran, mutation-test-uncommitted-revert-trap, and the
worktree/node_modules entries (worktree-symlink-vitest-limitation,
stale-node-modules-fullsuite-failure-set) since the mutation pass needs a second worktree that
can actually run vitest.

STEP 1 - LOAD CONTEXT: spawn an Explore agent over docs/discord-bot-stability/state.md,
docs/discord-bot-stability/progress.md,
docs/discord-bot-stability/phase-01-verification-foundation.md, and the Phase 1 diff (find the
phase-start commit from the branch log, the commit immediately before the first Phase 1 commit,
and diff it against HEAD). It returns: the promised deliverables and acceptance criteria, the
files touched with a one-line summary of each change, the new test file names and what each test
claims to pin, and whether the gate and CI step lists both gained the bot build.

STEP 2 - AUDIT (parallel agents, COVERAGE not filtering: report every gap with confidence and
severity, do not pre-filter):
  - Correctness agent: is every Phase 1 deliverable and acceptance criterion actually met? The
    load-bearing question is whether the diff is genuinely behavior-preserving. Hunt for a type
    "fix" that silently changed a runtime branch (an added `?? ''` or `|| default` that swallows
    a real value, a narrowing guard that now skips a call, a changed comparison or coercion), an
    injected constructor parameter whose DEFAULT is not exactly today's production value, and any
    reordering that changes when a request is issued. Confirm bot/cadence.ts (ruling R6) is a
    pure move: same names, same values, no new logic, bot/main.ts importing them. The
    one-character em dash fix in the bot/gateway.ts FATAL_CLOSE_CODES comment is sanctioned by
    ruling R9, so do not report it as scope creep. Check the D-invariants in play: D7 (no new
    dependency), D8 (logic.ts still pure, shells still thin, wiring still in main.ts), no src/
    edit, no secret committed, no em dash or en dash or emoji anywhere else in the diff.
  - Test coverage agent: are the new assertions decisive? Every config arm present including the
    fallback chains and the exact-string DISCORD_SYNC_NICKNAMES arm; the server_client envelope
    covering method, URL, secret header, content type, omitted body, non-ok status, and
    success-false; the abort test really driving the deadline rather than asserting a constant;
    the cadence pins comparing against literals rather than re-reading the same source
    (constant-self-comparison trap); no orphaned or skipped tests; no `.only(`.
  - Dead-code agent: unused imports or types left behind by the type fixes, an injected parameter
    that is never actually used by the code it was added to, and any leftover scaffolding.
  - Review Dispatch Matrix rows matching the diff, per implementation-plan.md: a bot-only diff
    matches no row, so `qa-checklist` is the baseline; if the diff touched
    .github/workflows/ci.yml, also spawn `privacy-security-review` (CI yml is a listed deploy
    file).
  Mutation pass, in an ISOLATED worktree created from the Phase 1 HEAD commit (never check out
  over uncommitted work), each mutant applied one at a time:
    - bot/config.ts: make one required() return '' instead of throwing; swap a fallback order so
      activity falls back to test before relay; invert the DISCORD_SYNC_NICKNAMES comparison
      (=== for !==, or "1" for "0"); drop one default URL.
    - bot/server_client.ts: drop the x-woc-discord-secret header; rename the header; drop the
      abort signal from the request; return env.data regardless of env.success; treat a non-ok
      response as ok; change the timeout constant.
    Each mutant must be killed by a NAMED test. Prove the suite actually ran for every mutant:
    record the vitest summary line (files, tests, passed, failed) and confirm a nonzero failure
    count, since a config or path mistake that runs zero tests looks like a pass.
  Also prove the new gate step has teeth: introduce a temporary syntax error in a bot file,
  confirm `npm run build:bot` exits nonzero, and revert it.

STEP 3 - FIX: apply ALL findings, blocking, should-fix, AND nits (standing user rule). Then
review the fix round itself with a fresh-eyes agent, because the fixes are unreviewed code. Then
re-run the state.md bot-only validation row: `npx tsc --noEmit`,
`npx vitest run tests/discord_bot.test.ts` plus the new test files, `npm run build:bot`,
`npm run ci:changed`, and `npm run gate` at close. Commit with explicit paths, a scoped
Conventional Commit subject, and a body; no `git add -A`.

STEP 4 - DOCS: update docs/discord-bot-stability/progress.md (Phase 1 QA row complete, plus any
deferrals under the per-phase notes) and docs/discord-bot-stability/state.md (any drift the audit
found: corrected file paths, new gotchas for implementers, the final test file names). Record
genuinely reusable traps to memory as one file per fact plus its MEMORY.md pointer line.

STEP 6 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts found and fixed by
severity, the mutation kill tally (mutants planted, killed, survived, with the survivor
explained), deferrals with reasons, and a one-line handoff for the Phase 2 session.

STOPPING RULES: stop and surface if a BLOCKING item cannot be fixed without changing Phase 1's
scope (for example a latent type error whose only correct fix is a behavior change, which belongs
to a later phase or its own issue). Stop if a surviving mutant can only be killed by changing
behavior rather than by adding a test, and report it as a finding instead of changing behavior
here. Stop if the mutation worktree cannot run the suite, rather than reporting an unproven kill.
```
