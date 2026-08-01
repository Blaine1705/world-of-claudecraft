# Phase 4 QA: Server set-based endpoints

Phase 4 added a new secret-gated endpoint, rewrote a hot write path onto one multi-row statement
across two arms, and wrote the first tests for two previously untested queue modules. Each of
those is a place where a test can look decisive and prove nothing: a query-count pin that counts
mocked calls instead of statements, an `IS DISTINCT FROM` skip that never actually skips in the
fixtures, a cap test that passes because the cap was never reached. This QA session verifies the
deliverables adversarially and then proves the tests bite by mutating the new logic and watching
the suite fail.

This prompt was rewritten from the Phase 4 BUILD outcome (2026-07-31), so it names what actually
shipped rather than what was planned. Several items in the original draft described code shapes
that do not exist (there is no "linked-only filter" to invert; unlinked ids are absent because
the read selects FROM `discord_links`), and it cited a memory "test-pin trap index" that does
not exist and never did. Both are corrected below.

## Starter prompt

```
This is Phase 4 QA of the Discord Bot Stability packet: verify Server set-based endpoints.
Model: Opus 4.8 or newer, xhigh effort. Harness: Claude Code.
Worktree: /home/fernandoramirez/Documents/world-of-claudecraft (branch feature/discord-bot-stability).
ULTRACODE: YES (D19 makes it mandatory for QA sessions). Run the adversarial-verify Workflow:
every finding independently confirmed by a skeptic that has the file OPEN and quotes the code
before the refutation counts, plus mutation spot checks.

AGENT DELIVERY, settled by Phase 3 QA and re-confirmed in the Phase 4 build. Agent-tool
BACKGROUND agents on this repo idle without reporting; Workflow agents deliver. Phase 4 ran two
Workflow fan-outs (3 context agents, 3 reviewers) and got 6 of 6 first try. So: run every fan-out
as a Workflow, and give EVERY agent a hard 30-tool-call budget plus a report-first line ("at call
25, STOP and write your report with whatever you have"), or it dies at the turn limit with
nothing recoverable.

STEP 0 - PRE-FLIGHT.
  - SYNC THE RELEASE BASE FIRST (standing rule 1). `git fetch origin release/v0.33.0`, then
    `git rev-list --left-right --count HEAD...origin/release/v0.33.0` against the FRESHLY fetched
    tip. It was 70 ahead / 0 behind at the Phase 4 build. MEASURE rather than trust that. If it
    moved, merge BEFORE any QA work, run the `release-merge-audit` skill, and record the sync in
    progress.md either way, including "no-op, already current".
  - `git status` must be clean and Phase 4 committed: `08ecaf2b6` (queue tests), `44e937cb7`
    (both set-based statements plus the endpoint), `ae1a1b776` (reward_ledger note), `a6944e4a8`
    (docs). Another session shares this checkout and foreign worktrees are registered under
    `.worktrees/` and `.claude/worktrees/`. LEAVE THEM ALONE and ASK before touching anything you
    did not create. Commits use EXPLICIT paths, never `git add -A`.
  - `node -v` should be v26.5.0.

MEMORY SCAN. Read these, which EXIST: vacuous-bound-pin-trap, early-exit-pins-need-work-remaining,
round-trip-pins-reference-aliasing, unkillable-mutant-diagnosis, mutation-checks-commit-first,
inverse-edit-restore-needs-unique-anchor (NEW, written by the Phase 4 build after it struck
live), novel-sql-needs-an-executed-test (NEW), no-docker-userspace-postgres (UPDATED with the
exact working recipe), diff-cache-needs-an-expiry, worktree-cwd-drift-misroutes-git,
fanout-agent-delivery-traps, big-diff-reviewer-turn-budgets, background-task-notifications-unreliable,
malware-scan-comment-keywords, node25-breaks-jsdom-gate.
There is NO memory "test-pin trap index" and there never was (verified three times now). The
equivalent list is "Known gotchas for implementers" at the bottom of state.md, which Phase 4
extended by four entries. If you find yourself citing a memory entry, confirm the file exists.

STEP 1 - LOAD CONTEXT (do NOT read the planning docs directly): ONE Workflow context phase over
docs/discord-bot-stability/state.md, docs/discord-bot-stability/progress.md (the Phase 4 note is
where the L14 decision and the review round are argued),
docs/discord-bot-stability/phase-04-server-batch-endpoints.md, and the Phase 4 diff
(`git diff 9d573a296..HEAD`, plus `git log --oneline 9d573a296..HEAD`). Split it so no agent
exceeds its budget. It returns, as CONCLUSIONS not file dumps: the deliverables Phase 4 promised,
the acceptance criteria it claimed and which it met, every file touched, and every new or changed
test with the behavior each one claims to pin.

RESIDUAL SCOPE, so you do not re-plow covered ground. The build already did these; SPOT CHECK
rather than repeat:
  - 8 mutations planted across the new code, 8 killed, 0 survivors (the array cap, the per-id
    slice, `updated` narrowed to `applied.changed`, dedupe first-wins, both empty-list short
    circuits, the tier derived from spendable instead of lifetime points, `found` hard-coded).
  - Three Review Dispatch Matrix reviewers ran (privacy-security-review, migration-safety,
    database-performance-reviewer). No CRITICAL findings. Acted on: the out-of-range joinedAtMs
    that threw before the query and killed the whole batch, the flex-batch fail-open ambiguity,
    the non-total `::int` cast on `state.level`, the multi-row UPDATE lock-ordering deadlock
    class, the one-sided LOCKSTEP pin, and two overstated comments.
  - `tests/discord_db_integration.test.ts` executed both statements against a real Postgres 16
    and measured the plan (nested loop over `characters_account`, 6.6 ms for 1000 ids at 5000
    links / 15000 characters).

STEP 2 - AUDIT (Workflow, parallel agents, COVERAGE not filtering).
  - Correctness agent. Is every deliverable and acceptance criterion actually met? Specifically:
    does flex-batch resolve links in ONE pass with no per-id loop surviving anywhere in the call
    chain (`flexBatchHandler` -> `discordFlexForAccounts` -> `discordFlexRowsForDiscordIds`)? Are
    unlinked ids genuinely ABSENT rather than answered with a zero-valued payload? Are the input
    cap, the per-id length slice and the non-string drop identical to members-meta? Does the
    members-meta upsert skip on ALL the meta fields including the null and cleared cases (a role
    cleared to null, a name left null, a missing joinedAt)? Do the D-invariants hold: D9 (no
    legacy twin for the new route, both arms edited for members-meta), D10 (one statement, both
    caps intact), D11 (no existing route retired), D12 (comment present, no prune added), D18
    (assertions at the 1,000 player / 5,000 member envelope)?
  - Test-coverage agent. Are the assertions DECISIVE? Does the query-count pin count real SQL
    statements off the `makePool` `calls` array rather than mock invocations that would not move
    if an N+1 returned? Is the batch-size-invariance pin a real comparison, not a constant
    compared against itself? Are both sides of the activity dedupe TTL boundary tested? Does a
    cap test push PAST the cap and assert WHICH items were dropped? Judge the new integration
    suite hardest of all: it is the only arm that executes SQL, so a vacuous assertion there is
    the most expensive kind. In particular, re-derive whether the `xmin` no-op-write pin can
    actually fail, and whether `Actual Loops` is the right invariant for the plan shape.
  - Dead-code agent. Unused imports, types or helpers left by the members-meta rewrite; any
    now-unreachable path; leftover scaffolding.
  - The three matrix reviewers again on the FIX round only (see STEP 3), not on the whole diff.

  MUTATION PASS, against the ACTUAL implementation. Commit first, then mutate one at a time and
  prove the suite kills each. Restore by INVERSE EDIT with a UNIQUE anchor, never `git checkout`,
  and verify afterwards with `git diff --stat` against the pre-run numbers plus `npx tsc --noEmit`
  (the Phase 4 build had a restore land in the wrong function and the naive check missed it).
    1. `sanitizeDiscordIdList`: drop the dedupe so repeats reach the query.
    2. `discordFlexRowsForDiscordIds`: change `ANY($1::text[])` to match on `account_id`.
    3. `discordFlexForAccounts`: return an entry for every requested id rather than per row.
    4. `setDiscordMemberMetaBulk`: remove the `IS DISTINCT FROM` predicate from the UPDATE only
       (leaving `matched`), so every row writes while the counts still look right.
    5. Same, but invert it so ONLY unchanged rows write.
    6. Swap `changed` and `skipped` in the returned object.
    7. `joinedAtIso`: drop the `MAX_EPOCH_MS` bound (the DB-gated suite should catch it).
    8. The level guard: reduce it to a bare `(c.state->>'level')::int` (integration suite only).
    9. `discord_relay`: splice from the wrong end so the NEWEST items are dropped.
   10. `discord_activity`: make the dedupe comparison inclusive at the boundary.
  Items 7 and 8 need TEST_DATABASE_URL. Stand up the throwaway Postgres with the recipe in
  no-docker-userspace-postgres (about 3 minutes, no Docker, no sudo) and tear it down after. If
  you skip them, SAY SO rather than reporting 10/10.
  For every mutant PROVE the tests ran: capture the vitest output showing the test count and the
  failing test NAMES, not just a nonzero exit code. A suite that silently matched zero tests is
  the classic false kill. Record a kill tally, and diagnose any survivor (dead code, unobservable
  rig, or real gap) before demanding a test.

DO NOT RE-LITIGATE, but DO verify the implementation matches:
  - The L14 response shape. `updated` deliberately keeps counting records ACCEPTED, not rows
    written, because `ServerClient.pushMembersMeta` turns `updated === 0` on a non-empty push
    into `null` and `pushChangedMemberMeta` aborts the whole run on a refusal. Narrowing it would
    break a post-restart full re-push and every all-unlinked batch. The maintainer chose the
    additive shape (`changed` / `skipped` / `unapplied` beside it) on 2026-07-31. Verify the code
    and tests match that decision; do not reopen the choice.
  - The two features sharing one commit. `server/internal.ts` and `server/discord_db.ts` carry
    both at interleaved hunks, so splitting them would have produced commits that do not
    typecheck. Judge the code, not the commit granularity.

KNOWN RESIDUALS Phase 4 left deliberately, each with a reason. Confirm the reason still holds
rather than re-reporting them as new findings:
  - No observability on the new statements (database reviewer F8). Phase 8 owns counters.
  - The two `discord_db` helpers carry no internal cap beyond the handler's 1000 (F6), left alone
    because a silent slice inside a database helper would drop members without saying so.
  - Discord ids are length-sliced, not shape-validated. Unchanged from members-meta, kept
    symmetric on purpose.
  - The members-meta response can carry ~23 KB of `unapplied` ids on a typical sweep (F9), and
    the bot ignores the field until Phase 6.

STEP 3 - FIX: apply ALL findings, blocking, should-fix AND nits (standing user rule). Then review
the fix round itself with a FRESH agent: the fixes are unreviewed code, and Phase 3 QA's first
scheduler fix cured a deadlock by introducing overlap, caught only by the review OF THE FIX.
Mutation-check any test the fix round adds. Re-run the state.md server-only validation row
(`npx tsc --noEmit`, then `npx vitest run tests/server/internal.test.ts tests/discord_server.test.ts
tests/server/discord.test.ts tests/discord_db.test.ts`), the http spine
(`npx vitest run tests/server/http/parity.test.ts tests/server/http/completeness.test.ts
tests/server/http/ownership_coverage.test.ts tests/server/http/surface_inventory.test.ts`), the
Phase 4 suites (`tests/server/discord_flex_batch.test.ts`,
`tests/server/discord_relay_queue.test.ts`, `tests/server/discord_activity_queue.test.ts`,
`tests/discord_db_integration.test.ts` both with and WITHOUT TEST_DATABASE_URL), then
`npm run build:server` and `npm run ci:changed`.

STEP 4 - DOCS: update progress.md (Phase 4 QA row and note: findings by severity, the mutation
kill tally, any deferrals) and state.md (any drift the audit found in the locked decisions, the
key file paths, or the created-by-this-packet list; add any new trap to the gotchas list).
Then FILL IN the Phase 5 starter prompt in docs/discord-bot-stability/phase-05-outbox-change-feed.md
from this session's outcome, the way Phase 3 QA filled in Phase 4 and the Phase 4 build filled in
this file. Commit with explicit paths and a body.

STEP 5 - FINAL RESPONSE: verdict (PASS / PASS-WITH-FOLLOWUPS / FAIL), counts of findings found
and fixed by severity, the mutation kill tally (killed / survived / skipped, and what a survivor
means), deferrals with their reason, and a one-line handoff for Phase 5.

KNOWN GATE FAILURE, exactly ONE, do not chase it and do not report it as a regression:
`tests/malware_scan.test.ts` and the gate's malware step fail while a sibling session has a
worktree parked under `.worktrees/` or `.claude/worktrees/`, because the scanner walks the whole
tree. Diagnose by running the scanner from INSIDE a clean detached worktree of HEAD created
OUTSIDE the repo root, and remove your own worktree before gating. The gate aborts there BEFORE
tsc and the builds, so run those by hand. `tests/texture_upload.test.ts` is NOT a known failure.

OWED TO THE MAINTAINER, do not work around it: the three Phase 3 D13 env keys
(`DISCORD_ROLE_SYNC_INTERVAL_MS`=300000, `DISCORD_PRESENCE_DEBOUNCE_MS`=4000,
`DISCORD_RELAY_POLL_MS`=3000) are still absent from `.env.example`, and every `.env*` path is
denied at the HARNESS level here for both Read and Bash, so no session can add them. Phase 4
added no env key. Re-surface the request.

STOPPING RULES:
  - STOP and surface if a BLOCKING item cannot be fixed without changing phase scope.
  - STOP and surface if a mutant SURVIVES and the test that should have killed it cannot be
    strengthened without redesigning the Phase 4 implementation.
  - STOP if fixing a finding would require touching bot/ (that is Phase 6), src/, the wire
    protocol, or a new table.
```
