# Progress

Status values: NOT STARTED / IN PROGRESS / DONE / DONE (QA PASS) / BLOCKED.
Every session updates its row AND records the phase-start commit hash (QA diffs from it).

| NN | Phase | Repo | Status | Start commit | Notes |
|---|---|---|---|---|---|
| 01 | branch-baseline | game | DONE (QA PASS) | e4c3dde956 | five re-review verdicts CLEAN (section below); woc_trade extraction landed; gate GREEN at 418f75b876 (full-suite fallback) |
| 01 QA | phase-01-qa | game | DONE | 07fda3fd46 | PASS-WITH-FOLLOWUPS, all fixes applied (section below); gate GREEN at final tip 1d7bdbafa0; pushed per R4 (no open PR on this branch, so no PR CI; pre-push floor green) |
| 02 | settlement-state-guards | game | DONE | 0f029bacf9 | release sync was a no-op (already at v0.37.0 tip); real-SQL suite 27 green vs dev Postgres; reviewer round + deferrals in section below; gate GREEN at tip 6916bd6944 (full-suite fallback; first run flaked on the known heavy-suite timeouts while external load averaged 40+, clean on the rerun) |
| 02 QA | phase-02-qa | game | DONE | 20fdcc5288 | PASS-WITH-FOLLOWUPS, every fix applied (section below); release/v0.37.0 synced in (merge b40a178643, one generated-i18n conflict regenerated; merge audit clean except the hud.ts ceiling, fixed by extraction); gate GREEN at 301a8c7c22 (full-suite fallback, all 8 steps); pushed per R4 (no open PR on this branch, so no PR CI; pre-push floor green) |
| 03 | delivery-exactly-once | game | DONE | e71a8cfd21 | release sync trivial (server/parse samplers only); B2a/B2b/B2c + monitor closed; five-reviewer round + fix round + fresh re-review applied (section below); real-SQL suites 65 green; gate GREEN at tip c3b33f54a7 (full-suite fallback, all 8 steps; the one intermediate red was the internal gate-mount sweep's 20-route count pin, fixed to 21); LOCAL, not pushed per R4 |
| 03 QA | phase-03-qa | game | DONE | 5ef64c1e11 | PASS-WITH-FOLLOWUPS, every fix applied (section below); release sync 5487531960 (two conflicts: main.ts union + regenerated pending.ts; merge audit CLEAN except the hud ratchet, fixed by the error_text_i18n_core extraction, ceiling 19338 to 19190); AC3 park deviation UPHELD; 21-mutation pass, one survivor closed; pushed per R4 |
| 04 | bond-payment-lifecycle | game | IN PROGRESS | 3f20375918 | release sync no-op (branch already at origin/release/v0.37.0 tip); gate GREEN at dc0a23c674 (full-suite fallback, all 8 steps) |
| 04 QA | phase-04-qa | game | NOT STARTED | | |
| 05 | custody-entry-hardening | game | NOT STARTED | | |
| 05 QA | phase-05-qa | game | NOT STARTED | | |
| 06 | directed-rail-integrity | game | NOT STARTED | | |
| 06 QA | phase-06-qa | game | NOT STARTED | | |
| 07 | policy-terms-drafts | game | NOT STARTED | | |
| 07 QA | phase-07-qa | game | NOT STARTED | | |
| 08 | service-auth-hardening | service | NOT STARTED | | |
| 08 QA | phase-08-qa | service | NOT STARTED | | |
| 09 | bond-releaser | service | NOT STARTED | | |
| 09 QA | phase-09-qa | service | NOT STARTED | | |
| 10 | chain-verifier | service | NOT STARTED | | |
| 10 QA | phase-10-qa | service | NOT STARTED | | |
| 11 | oracle-health | service | NOT STARTED | | |
| 11 QA | phase-11-qa | service | NOT STARTED | | |
| 12 | wire-completeness | game | NOT STARTED | | |
| 12 QA | phase-12-qa | game | NOT STARTED | | |
| 13 | listing-step-up | game | NOT STARTED | | R1 resolved: wallet signature; confirm threshold posture at start |
| 13 QA | phase-13-qa | game | NOT STARTED | | |
| 14 | ux-honesty | game | NOT STARTED | | |
| 14 QA | phase-14-qa | game | NOT STARTED | | |
| 15 | ui-polish | game | NOT STARTED | | |
| 15 QA | phase-15-qa | game | NOT STARTED | | PASS requires Fernando's screenshot sign-off |
| 16 | hot-path-scale | game | NOT STARTED | | |
| 16 QA | phase-16-qa | game | NOT STARTED | | |
| 17 | db-retention-indexes | game | NOT STARTED | | |
| 17 QA | phase-17-qa | game | NOT STARTED | | |
| 18 | dashboard-guardrails | dashboard | NOT STARTED | | |
| 18 QA | phase-18-qa | dashboard | NOT STARTED | | |
| 19 | dashboard-tooling | dashboard | NOT STARTED | | |
| 19 QA | phase-19-qa | dashboard | NOT STARTED | | |
| 20 | real-sql-coverage | game | NOT STARTED | | |
| 20 QA | phase-20-qa | game | NOT STARTED | | |
| 21 | devnet-dry-run | service + game | NOT STARTED | | needs rulings R5 |
| 21 QA | phase-21-qa | service + game | NOT STARTED | | |
| 22 | close-out | all three | NOT STARTED | | teardown offer lives in 22 QA |
| 22 QA | phase-22-qa | all three | NOT STARTED | | |

## 04 implement round (bond and payment lifecycle)

Commits f64733145c (source), 2c8931811f (tests), dc0a23c674 (session-start
row), plus the reviewer fix round and docs commits after them. Release sync
was a no-op. The registry of what shipped is state.md's 04 ledger entry; the
round facts and decisions:

- The fails-on-old-behavior proof: eight targeted mutations run AFTER the
  commits (intake order restored, refresh CAS arm dropped, suspend carve-out
  dropped, confirming overdue arm dropped, bond-progress extension neutered,
  steal-time recording inverted, holderless clear restored, paid-window stamp
  guard bypassed), each reddening exactly its named real-SQL test with the
  suite provably running. One first-attempt mutant broke compilation (15
  skipped, proving nothing) and was redone as a semantic one-token flip.
- Decisions the QA session should re-judge or know:
  - R8 numbers proposed: 1800s per-listing re-claim cooldown, 3 abandons per
    rolling hour account-wide (rationale in woc_market_rules.ts).
  - Cancel-intent blocks NEW BIDS as well as new lock claims. The ruling text
    names lock claims only; bids are blocked because a bid landing after the
    stamp would re-deny the cancel past the promised one-window bound
    (has_bids refuses the converge close). Recorded for re-judgment.
  - 'confirm_failed' UX wrinkle: a decided-against signature stays recorded,
    so the bidder cannot refresh or abandon until the poll lapses the bid
    (about one sweep pass). The catalog copy for confirm_failed still says
    "request a fresh quote"; the mismatch is a phase 14 UX-honesty item.
  - Stuck bonds get NO automatic time-based exit this change: routing a
    never-landed payment to refund_due would pay out through the current
    blind releaser (B3). Visibility-bounded instead (the stuckBonds readout
    class); the automatic exit lands with the phase 09 releaser CAS and the
    phase 10 verifier timeout (R5).
  - The review park runs BEFORE the poll arm in the same pass, so a row
    whose economy recovered exactly at the bound parks rather than resolves;
    deliberate (six hours of polls already failed) and operator-recoverable.
  - The converge arm expires only 'failed' rows itself: the abandoned
    window's offered settlement belongs to the overdue arm, which is also
    the canonical abandon recorder, so convergence waits a pass rather than
    lose the abandon row.
- Doc upkeep: server/CLAUDE.md woc_market row rewritten for the new seams;
  .env.example gained the two knobs; the internal stuck route carries the
  operator semantics comment.

The three-lane review round (commit 6c89a99dbb, every finding applied or
recorded; the fix round itself was re-reviewed fresh and mutation-proofed
with six further spot-proofs, all of which bit):

- Security (1 critical, 2 warnings fixed; the rest recorded): the extension
  fired on the raw submitted signature (now verdict-gated, settled or
  pending only); a rival's claim probe could stamp a PAYING holder (now an
  open-settlement probe refuses as 'locked' with no recording); a refused
  transfer read as a walk-away (the sweep recorder now skips signed
  windows). Recorded, not fixed here, each with an owner: the
  free-to-create immovable signed bond depends on the economy service's
  verdict for unknown signatures (phase 10, R5; the poll rotation bounds
  its cost meanwhile); the review state has no in-repo operator endpoint
  yet (phases 09/19 own driving transitionSettlement; hand SQL bypasses the
  CAS, so the runbook must forbid it); quote expiry is no longer enforced
  game-side on either intake, so the stale-reference refusal is now the
  service's contract to keep (confirm at phase 21's devnet run; the dev
  economy already refuses expired quotes); stuckBonds is the first readout
  class carrying a raw account id (dashboardGate-only; kept for the
  cooldown runbook); the abandon cap is per realm by design.
- Database (3 P1, 5 P2, all applied): claimBuyNowLock refusals went back to
  lock-free (measured hundredfold amplification when diagnosed under FOR
  UPDATE while holding a pooled client); the cancel-intent converge and the
  bond poll both gained the park-rotate-backoff seam (a paid window or a
  never-decided signature no longer owns a batch head every pass; the bond
  arm parks only PAST the 5-minute pending TTL so young bonds keep full
  cadence); idle_in_transaction_session_timeout=500ms on the three new
  guard transactions with 25P03 as typed contention (retrofitting the older
  guards rides phase 16); the CHECK evolution adds NOT VALID; the
  saturating-count comment now states the honest O(account rows) bound; the
  repair-gate and readout doc comments were de-staled. The reviewer's
  runtime-proof asks (economy verdict semantics for unknown signatures, an
  end-to-end contention run, converge saturation, pool-wait observability)
  ride phases 10, 16 and 21.
Round TWO of the re-review (the fix round reviewed as unreviewed code by
fresh security and database lanes plus a coverage re-audit; every finding
applied):

- Security round 2 HIGH: my txSignature exemption was a one-request bypass
  of the whole cooldown arm (post a fabricated string, get refused, walk
  away unrecorded). Replaced by a refusal-CLASS exemption
  (WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS) inside ONE shared recorder
  statement both recorders run, with the failed-row expiry preserving
  fail_reason so the class survives; the sibling steal recorder inherits
  the same predicate, closing the round's third finding (the recorders
  disagreeing in opposite directions). MEDIUM: the extension gate failed
  open on the proxy's pending+service_unavailable arm during outages; now
  gated on the shared reason constant.
- Database round 3 (the lane's own verification of the 25P03 fix): PASS,
  no open findings across the whole chain. Both stall shapes (async await
  and a blocked event loop) measured returning the typed 'contended'
  against the real withTx with ZERO uncaught exceptions, and the pool
  counts confirm terminated clients are discarded, not returned. The lane
  also corrected its own round-2 report: its probe had measured only the
  async ordering; the coded-error preference covers both.
- Database round 2 P1: the 25P03 arm was DEAD CODE (the SQLSTATE arrives
  asynchronously; the unlistened client error event was an uncaught
  exception surviving only via main.ts's last-resort net). withTx now
  captures the async error for the transaction's lifetime, prefers
  whichever error carries a code (the ordering flips between sync and
  async stalls, both probed), and discards the terminated client; pinned
  by a REAL idle-stall test in the pg suite (a synthetic {code:'25P03'}
  stub would have stayed green over the broken path). The lane also
  measured the fix round: the lock-free claim refusals now beat the
  original lock-free profile (1.06ms at conc=10 vs 163ms), the converge
  and poll rotations verified on their indexes, NOT VALID verified
  once-per-database.
- Coverage round 2: DB-free arm for the verdict gate (with the vacuity trap
  the auditor flagged avoided: the case sits INSIDE the anti-snipe window),
  structural pins for the idle-timeout statements, the shared recorder
  statement (which immediately caught the steal arm still on its old inline
  INSERT), NOT VALID, and the proxy-constant lockstep; the
  contended-never-parks arm via a new fake hook. One recorded decline: the
  extend-before-activate ordering is unpinnable behaviorally under a fixed
  test clock (the ordering only matters when real latency advances the
  clock between the two calls); noted here instead.

Round THREE (the qa-checklist gate, the fix-round reviewer's residuals, and
the security lane's third pass; every finding applied or owned):

- qa-checklist verdict NOT READY on one blocking item, fixed this round:
  the cancel-pending index had been redefined IN PLACE under its old name
  (invisible to IF NOT EXISTS); it is now woc_market_listings_cancel_rotation
  with a DROP of the old name, per the file's own predicate-change rule, and
  the structural pin asserts both. Its two upheld judgments: the cooldown
  NUMBERS (duty-cycle arithmetic verified) and the cancel-intent BID block
  (required, not scope creep: a post-stamp bid would make the converge skip
  forever and break the one-window bound).
- Security round 3 HIGH: 'quote_expired' was attacker-mintable (wait out the
  90s TTL, post any string; D1's signature-first recording is what makes the
  class reachable), so the exempt list is now the infrastructure verdict
  ALONE, bound as a parameter, with the honest-late-buyer cost accepted as
  one recoverable abandon row. R5 now carries THREE dependents (bond
  residency, the extension gate, restoring any late-payment exemption).
- Fix-round reviewer residuals: the extension anchor is captured BEFORE the
  chain round trip (RPC latency no longer drifts the target or nulls the
  settled arm's extension); the bond-poll park axis moved to the new
  bond_signature_at stamp (own knob WOC_MARKET_BOND_POLL_PARK_SECONDS;
  placement age said nothing about chain age, and a late signer was parked
  seconds after submitting); the advisory claim reads share the contention
  mapping; a no-BEGIN pin holds the lock-free refusal property; comments
  record the claim_cooldown advisory exclusion, the fake's
  failed-outside-open dependency, and the fake-only id tiebreak. Recorded
  declines: the excludeIds array growth matches the parkedDeliveries house
  shape (phase 16 owns scale); the extend-before-activate ordering is
  unpinnable under a fixed clock (noted in round two).
- qa-checklist should-fixes, deferred WITH OWNERS: the anti-snipe rule
  change has a PLAYER-FACING consequence (a bid placed inside the last
  wallet round trip before the close can no longer extend and cannot win;
  the money path is safe, the bond refunds) that phase 14 owes a product
  line and a client affordance for; cancel-intent is invisible to clients
  (no DTO field; a reloading seller sees plain Active, buyers learn only
  via the refusal), the seller-side marker rides phase 14 with the
  cancel-pending browse posture deliberately unchanged (seller intent is
  not leaked to buyers); the claim_cooldown copy surfaces no remaining
  time, phase 14. The "do not count never-quoted windows" idea was REJECTED
  with reasoning: buyNow always issues a quote at claim, so a no-quote
  window cannot arise from the real flow, and exempting quote-less windows
  would exempt the griefer's cheapest path.

- Coverage (4 blocking, 12 should-fix, 5 nits, all applied except one):
  tunable literal pins, teardown carve-out structural pins, the env-knob
  parse cases (including the fail-dangerous empty string), the monitor's
  five-class loop and fifth argument, retention wiring and config rows for
  BOTH woc prunes, review transition-table arms (noting
  validSettlementTransition has no production caller: the table is
  documentation, its test the only enforcement), both-sided cooldown
  boundaries and aging, the directed exemption on both recorders, the
  recorder dedupe, the converge rollback case, the paid-probe state loop,
  abandonBid's confirm_in_flight arm, SDK and window pins, the exact-bound
  cutoff case, and the new-class freeze and saturation arms. The one
  accepted decline: the two remaining clearBuyNowLock unwind call sites
  (live_settlement_exists and quote_unavailable races) have no harness hook
  to force them cheaply; the holder guard itself and three of five call
  sites are pinned, phase 20's real-SQL coverage owns the rest.

## 03 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Session start 5ef64c1e11; release/v0.37.0 synced in (merge 5487531960: the
chat-quota feature; conflicts were a clean shutdown union in server/main.ts
and the regenerated pending.ts). The release-merge audit ran as seven lanes:
every merge intent preserved on both sides (diff-of-diffs identity on
hud.ts, exact unions elsewhere, db-mock trap did not fire, i18n regen
deterministic), ONE merge-created red: hud.ts 19395 over the zero-headroom
19338 ceiling, fixed by extracting localizeErrorText VERBATIM into the
registered pure core src/ui/error_text_i18n_core.ts (Hud keeps a thin
delegator; S3/B1 retargeted through a shared per-arm file table; ceiling
now EXACTLY 19190; the extraction deliberately avoided the entity-display
slice another branch used for the same fallout). Merge premises recorded in
state.md: 13 steady DB connections per realm, the first pg LISTEN/NOTIFY
exemplar, the quota-vs-escrow accounts-row contention note.

Six audit lanes ran over e71a8cfd21..5ef64c1e11 (privacy-security,
database-performance, server-hot-path, test-coverage-auditor, correctness,
dead-code/cleanup): roughly 60 findings, ALL applied or recorded with
owners. The lanes' verdicts: security no criticals and the exactly-once
model sound against every constructed dupe path; correctness PASS on all
four deliverable items with the crash matrix 11/12 pairs pinned; db BLOCK
on two P1s, both fixed this round.

The AC3 deviation is UPHELD: the park posture has no integrity hole (both
judging lanes and my own read of C2a/C2b/C3/C3b concur that a collected
letter makes absence-from-book genuinely ambiguous while the common
post-write crash window still auto-resumes via the in-book proof). Costs
quantified and recorded; Fernando can overrule, but the automatic-resume
alternative is a provable dupe rail.

Reproduced-and-fixed, the blocking class: park rotation re-stamped the
readout's own age column, so a parked return could NEVER age into the
monitor (and the commonest park, seller-gone, was invisible in all three
classes); rotation moved to a dedicated sweep_parked_at column with the
readout aging on updated_at, backing-off rows now EXCLUDED from the batch
reads entirely. The unbounded redrive beat (500 finalizes plus realm
mail-book writes per beat, worst at the legacy-upgrade boot) is bounded at
SWEEP_BATCH with a truncation cursor. Also fixed: activateBid's raw 40P01
became a typed 'contended' that reports PENDING to the bidder (the interim
fix collapsed it to a false "outbid", caught by the fix-round re-review);
finalize re-locks the open bid set after the listing lock and distinguishes
'already_final' (re-runs neither re-count nor re-notify); the finalize
transaction carries the heavy statement allowance; per-row error isolation
reached the five remaining arms; contention and park stats moved into a
per-entry scope (the eager confirm entry mints its own, closing a
request-vs-pass race); ambiguous grantCopy refusals park instead of
converting to mail; provable grant resumes refresh their ledger stamp so
sustained contention cannot expire them; the monitor gained asOfMs,
saturated flags, a stale-streak warning, a cold-failure negative cache,
and a draining stop(); the sold-notice loss window after finalize is an
ACCEPTED, test-documented cost. Three fix rounds, each re-reviewed as
unreviewed code (the round-2 reviewer verified the exclusion mechanics
against the real pg driver and found the false-outbid regression; round 3
was comment/docs/one-pin scope).

Deep mutation pass: 21 mutations over the headline pins (the named
booked_at revert, both resume rails, the written flag, hasParcel gate,
nonce proof, fence adoption, finalize shape/CAS/re-lock/already_final,
park counters, rotation-age split, redrive bound, exclusion, skip
reporting, contended claim-freeze, quota matcher rows, monitor staleness
and gate). 20 killed outright; the one survivor exposed a REAL hole (every
written-flag pin injected failures after a SUCCESSFUL persist, where flip
order is indistinguishable), closed with a blob-half-throw-then-collect
twin that provably reds under the flipped order.

Validation: 913 DB-free market/guard tests green plus 68 real-SQL against
dev Postgres (both suites demonstrably RAN); tsc, ci:changed, biome on
changed files green; gate run recorded in the row above. Doc upkeep: the
matcher-location sentences in src/ui/CLAUDE.md and server/CLAUDE.md
retargeted to the new core; the bond-lifecycle spec's dead symbol and
rotted line anchors replaced; implement-round ledger lines the fixes
falsified amended in place.

Deferrals recorded with owners (beyond the implement round's list, do NOT
re-raise): EXPLAIN plan evidence for the two new rotation-order reads and
the two new partial probes rides the phases 16/17 list; the claims-prune
orphan note (age booked rows on booked_at) rides phase 17; the operator
re-drive procedure per parked class (including the ambiguous-grant class
where hand-delivery without checking the buyer's bags IS the dupe) rides
the phase 22 runbook; the pg-harness extraction (third suite trigger)
rides phase 20; the phase 19 dashboard consumes the amended readout shape
(asOfMs, saturated, updatedAtMs) from state.md.

## 03 implement round (delivery exactly-once)

Commits 1196e2bb28 (core), 9f8097c1fb (monitor + endpoint), a08653dbd2 (the
five-reviewer fix round). Five reviewers ran over the committed diff
(privacy-security, migration-safety, database-performance with measured
EXPLAIN evidence on a throwaway Postgres, server-hot-path,
test-coverage-auditor), then a fresh reviewer over the fix round and
qa-checklist last. Four mutation spot-proofs bit before the fix round (the
QA session owns the deep mutation pass).

What shipped: the delivery close tail is ONE transaction
(finalizeDeliveredSettlement: bids-then-listing pre-lock, delivered CAS
accepting delivering|delivered, ON CONFLICT sale dedupe, merged
close+dispose UPDATE, bond flips); custody claims carry rail attribution
(grant_character_id, mail_intent_at) and a resume needs PROOF (this
process's pendingMail/pendingGrants continuity, or the parcel still in the
live book, or booked_at); everything unattributable PARKS visibly (bare
claims, collected letters, lease fences, restarts, relogs, disposed
listings); the atomic saveDeliveredCharacterBooked commits the fenced bags
write and the booking together; the minute-scale redriven beat converges the
old binary's delivered-unclosed and sold-undisposed residue over bounded id
pages; sweep arms are error-isolated per arm AND per row with a break on
contention; parked rows rotate with a 60s in-process backoff (AMENDED by
the 03 QA round: rotation moved to a dedicated sweep_parked_at column,
the monitor ages on updated_at, and backing-off rows are EXCLUDED from
the batch reads; the original rotate-updated_at/age-created_at shape was
the QA round's blocking find); woc_market_monitor.ts serves the
three stuck classes (saturating counts) through createCachedRead behind
GET /internal/woc-market/stuck (dashboard secret) plus an
only-when-stuck 5-minute log beat that warns once per failure streak.

Security criticals found by review and closed in the fix round (both were in
MY first-round design, found because the fix round was re-reviewed):

- The mail resume trusted the deletable in-blob marker: a buyer collecting
  the item and deleting the emptied letter revived the ref into a SECOND
  mailed copy. Closed by the durable mail intent + resume-only-on-proof.
- The lease-fence arm cleared the grant intent and mailed next pass, but the
  fence only proves THIS write lost, not that an earlier autosave under the
  then-valid nonce did: the granted bags may be durable. The fence now parks.

Spec deviation, needs the QA session (and Fernando) to re-judge: the phase
file's AC3 says "kill before mail write, sweep resumes and delivers exactly
once". After the mail-rail security finding the safe subset is: resume when
the parcel is provably uncollected (still in the live book, or this
process's own attempt), PARK when it is not (bare claim, intent-with-absent
parcel, collected letter). The parked cases are sub-second crash windows,
visible in the readout, and operator-resolvable; the automatic-resume
version was a provable dupe rail. Pinned by C2a/C2b/C3/C3b in the delivery
pg suite and the fake-level twins.

The fix round itself was re-reviewed as unreviewed code (a fresh reviewer
over the fix commit, plus qa-checklist over the whole diff, verdict READY
with three should-fixes). That second round found ONE blocking hole in the
first fix: the process-local pendingMail entry authorized a re-mail across
the written-but-unbooked window, where a collected letter still dupes.
Closed: the entry now carries a written flag (set at ATTEMPT time, so a
blob-half throw still counts), and once written only the parcel still being
in the live book authorizes a retry; pinned by same-process collected and
uncollected twins driven through a new failNextMarkBooked fake hook, with
the custody fake corrected to live-book semantics (a transient persist
failure leaves the parcel LIVE, exactly like the real bridge). Also from
that round: item-free letters (the seller sold notice) skip the claims
ledger entirely (they can duplicate nothing, nothing ever re-notifies, and
a parked notice polluted the readout forever); the returned arm got the same
park-rotate-backoff-count-advanced treatment as the delivery arms; one
contended finalize stops the delivery work of its OWN scope (AMENDED by the
03 QA round: contention became a per-entry scope, the sweep pass owning one
and the eager confirm entry minting its own); the delivering sample read is
carried by woc_market_settlements_state_updated (AMENDED: the QA round
dropped the created_at index when the class's age signal moved to
updated_at); the readout count cap fails closed on a non-finite value; and
the stale comments the fixes invalidated were rewritten.

Deferrals and decisions, each with an owner (do NOT re-raise):

- EXPLAIN-based plan pins and a worst-case pass-duration timing pin (the db
  reviewer's remaining runtime proofs): the hot-path scale and db-retention
  work own the EXPLAIN list (state.md ops caveats name the reads to prove:
  the redrive page probe, the readout classes, the sold-residue subquery).
- woc_market_custody_claims retention registration: the db-retention work
  owns pruning BOOKED rows; unbooked rows are the operator queue and are
  never pruned (DDL comment records this).
- The internal surface still carries no rate limiter (family-wide,
  pre-existing; the secret compare is constant-time): the listing step-up
  work owns server-side posture questions.
- Endpoint response re-stringifies per request (reasoned decline): the
  admin-envelope serializer owns the wire shape; pre-serializing would fork
  the envelope contract for a secret-gated, human-cadence dashboard read of
  at most sixty rows.
- SETTLEMENT_COLS derived-prefix coupling died with the paged rewrite (the
  probe reads settlements only); no action left.
- The fake's deliveredUnclosedSettlementsPage spells the same three-status
  literal as the SQL; the four-way lifecycle union is pinned in
  woc_market_directed_sql.test.ts, so a fifth status fails the DDL pin
  first.
- pendingGrants/pendingMail/parkedDeliveries are process-local with a
  10-minute TTL prune at each pass start (the reviewers' leak findings);
  entries that die unresumed park their claims, which the monitor carries.

## 02 implement round (settlement-state guards)

Four reviewers ran over the diff (privacy-security, migration-safety,
database-performance, test-coverage-auditor), then qa-checklist last; every
finding was applied except the owned deferrals below. Applied highlights: boot
pre-flight repair UPDATEs so the two new unique indexes can never brick a boot
on legacy-corrupt rows (with real-SQL arms seeding the violating shapes and
proving the repair); the bids-then-listing lock order in suspendListingIfSafe
and the winner stamp moved ahead of the insert (activateBid's order; a pinned
interleave test dies 40P01 under the old order); SET LOCAL lock_timeout on
both guard transactions; a distinct insertSettlement 'listing_closed' return
(a buyer racing a cancel now hears not_active, not a phantom lock);
compare-and-set on the new bid-status writes; setSaleExcluded catching 23505;
the coverage auditor's rework of the interleave test to drive the REAL
cancelListingIfUnbid, the full five-state index predicate pin, the
settlement_live suspend arm at service level, the cascade-conflict unwind arm,
the refund_due intermediate stamp under a stalled refund pipeline, and a
concurrent double-insert race. Real-SQL suite: 27 tests, run green against the
dev Postgres (TEST_DATABASE_URL; the suite skips without it). The
fails-on-old-behavior proof: the first red run against the unfixed code failed
15 of 19 original tests on their real assertions.

Deferrals and decisions, each with an owner (do NOT re-raise):

- insertSale still throws raw 23505 if a duplicate ever reaches deliverOne,
  which after the repairs is only possible on data the new guards did not
  produce; graceful conflict handling belongs to the delivery-finalization
  transaction and reconcile arm (phase 03), along with per-arm sweep error
  isolation (one poisoned row currently skips the later arms of that pass).
- The confirming-stuck escape hatch (phase 04, H15) and ruling R8 (buy-now
  lock-spam cancel denial, phases 04/06): recorded in state.md; phase 04 is a
  hard prerequisite for enable.
- The db-performance reviewer's at-scale proofs (EXPLAIN of the new per-listing
  lookups on grown tables, index-build timing, pool-wait observability before
  enable): phases 16/17 and the phase 03 monitor.
- Cascade arm still reads the full bid list per overdue settlement to derive
  priorWinners (unbounded per-listing read, pre-existing shape): phase 16/17.
- Kept against reviewer preference, recorded: the unique indexes stay in boot
  DDL (rationale comment in the DDL; concurrent builds can leave an INVALID
  index and the tables are pre-enable empty), and the lock-expiry predicates
  keep the app clock nowMs (consistent with claimBuyNowLock's own steal
  predicate, which writes and compares the same clock; the SQL-now()
  alternative also breaks the future-epoch test fixtures).
- qa-checklist round (verdict READY, 0 blocking) applied on top: both boot
  repairs gated on to_regclass so the scans run once per legacy database
  (the sales table is keep-forever, so ungated it re-scanned every boot); an
  operator note at the settlements repair (schema_dedupe rows at 'confirming'
  or beyond were payments that might still land; sweep them by hand after a
  legacy upgrade); insertSettlement now ABORTS when a named winner left the
  pickable states, turning "no settlement whose winner holds no claim" from a
  cross-module coincidence into a statement-level guarantee (test updated to
  pin the strict behavior); the concrete PgWocMarketDb signature widened to
  match the interface; a direct pin that a refused cancel rolls its
  speculative failed-expiry back. Two qa items became owned deferrals: the
  admin envelope's raw-English strings (both the new 409 line and the
  pre-existing 404 line beside it) go to the error-i18n surface (phase 14),
  and a CI job that sets TEST_DATABASE_URL so the pg suite stops being
  skip-only goes to the real-SQL coverage work (phase 20).

## 02 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Session start synced release/v0.37.0 (merge b40a178643; the one conflict, the
generated resolved-i18n pending slice, regenerated per the content-union
rule). The release-merge audit ran as six lanes: every coordinator clean, the
one real break the zero-headroom hud.ts ceiling (release added prewarm lines),
fixed by extracting src/ui/preview_prewarm_wiring.ts with its own suite and
lowering the ceiling. Seven audit lanes then ran over the phase diff
(correctness, test-coverage, dead-code/cleanup, privacy-security,
migration-safety, database-performance, and a fake-vs-Postgres fidelity
audit), and the whole fix round was re-reviewed by a fresh reviewer as
unreviewed code. Roughly 70 findings surfaced; ALL were applied except the
reasoned resolutions recorded below. The reproduced-and-fixed defects:

- The audit-blocking dupe holes: a settlement could land on a listing a
  concurrent suspend or cancel just closed (the INSERT's snapshot predicate
  passes the FK re-check; reproduced against real Postgres, fixed with an
  explicit listing row lock inside insertSettlement), and the no-winner close
  arms could close no_bids or reserve_not_met under a live buy-now settlement
  (attacker-timeable item dupe; fixed with the lock-then-check
  closeListingIfNoOpenSettlement that parks the listing 'settling').
- The reproduced 40P01: activateBid's third lock (the previous current bid,
  taken after the listing) crossed the suspend guard's ordered scan; fixed by
  pre-locking the whole open bid set in id order, with a deterministic
  three-client interleave pin that reds under the old order.
- The retry revival racing a second open settlement threw an uncaught 23505
  (a 500 on a money path); transitionSettlement reports it as a CAS miss and
  settlementQuote refuses BEFORE issuing any quote.
- The fresh fix-round review then caught the fix round's own regression: the
  reclaim arm expiring a 'failed' settlement at the stranded grace (half the
  settlement window) silently skipped the overdue deadline pass (default,
  forfeit, strike, cascade) and stranded the held bond. Fixed by parking
  instead (the reopen refuses over failed rows; the deadline pass keeps its
  jurisdiction), plus a CTE in the suspend expiry that releases a dead
  settlement's won bid to cancelled/refund_due.
- Hardening from the lanes: suspend leaves a quoted, unexpired 'offered'
  settlement alone (the buyer may already have broadcast payment); both boot
  repairs gate on pg_index VALIDITY through the to_regclass house idiom with
  invalid-carcass drops ahead of each CREATE (a real carcass test proves the
  boot sees through it); the atomic one-statement loser demote; per-caller
  winner pickable sets with the distinct 'winner_gone'; typed 'contended'
  (55P03/40P01) end to end with catalog fills, answered 409 on cancel,
  buy-now, and both admin envelope arms; setSaleExcluded's distinct
  'conflict'; the forensic schema_dedupe fail_reason append; the DB-free
  structural floor in woc_market_directed_sql.test.ts (indexes, five-state
  predicate, validity gates, repair ranking, and the fake's state list, which
  now derives its suspend blocking set); fake fidelity fixes (transition
  open-refusal so the fake cannot reach a two-open state, signature
  self-match skip, cascade tie-break pins both dimensions).
- Twelve mutations were run against the new pins after committing; every one
  failed its named test with the suites demonstrably running (the deadlock
  pin dies on the literal 'deadlock detected' under the old order).
- Validation: real-SQL suite grew 27 to 41, green against dev Postgres; the
  DDL apply-twice/thrice probe is a byte-identical no-op with both indexes
  valid; S3 guard, i18n gates, tsc, ci:changed green; the full gate ran three
  times (the first red found the merged-tree fallout: two pins of mine to
  re-anchor, redundant dialect OTA rows the release's base fills created, and
  the stale-node_modules class where the release's three.js patch bump also
  explained the portrait-manifest fingerprint; a receipt rerender reproduced
  all 230 portraits byte for byte) and PASSED at 301a8c7c22.

Reasoned resolutions (not silent declines): woc_market.sale_conflict stays
registered though the admin envelope pre-empts it today (the Record type and
parity gate require the row; phase 14's admin-envelope conversion switches
the bespoke 409 lines to the registered codes, recorded in state.md); the
reserve-arm's contended-refusal can later record 'no_bids' instead of
'reserve_not_met' (cosmetic, documented at the arm; the demote-before-close
crash posture is load-bearing); the fake's createdAtMs uses the injected
clock where Pg uses now() (harmless, noted by two lanes); the suspend
guard's 'offered' open-check member is unreachable single-threaded but is a
real concurrency arm (kept, per the coverage lane's own verdict).

## Merge re-review verdicts (01, merge a52da32c89)

Five read-only agents re-reviewed the auto-merged coordinators; both parents'
intents survived in every file. Per-file: `src/ui/hud.ts` CLEAN; `src/sim/sim.ts`
CLEAN; `server/game.ts` CLEAN; `src/net/online.ts` CLEAN; `src/world_api.ts` +
facets CLEAN. Non-drift findings applied in this session: the `W9_TAGS` facet pin
gained its missing `trade_close` row plus a ClientWorld-boundary send pin
(tradeClose vs tradeCancel swap was previously invisible to every derived-set
check); the stale facet-count comment in `tests/world_api_parity.test.ts` now
follows the anchor rule; `src/world_api.ts` documents why `trade_close` sits
beside its trade siblings instead of at the append tail;
`server/woc_market_custody.ts` resolves `hasCustodyParcel` through the Sim facade
its neighboring line already used.

## 01 QA round (verdict PASS-WITH-FOLLOWUPS, every applicable finding applied)

Audit fan-out: four independent lenses (move fidelity both directions,
deliverables, dangling refs), frontend-seam-reviewer, test-coverage-auditor,
privacy-security-review on the custody commit, a fresh auditor over the fix
round, and qa-checklist last (verdict READY, 0 blocking). Roughly 40 findings
surfaced; all blocking/should-fix/nit items were applied except the deferred
restructures listed below. Fix commits e49738fbca, f0f9664a62, eeb5596446,
88fb2146c2, 1d7bdbafa0. Highlights of what the round changed: the one byte
drift in the move (the render-catch log tag) reverted; hud.ts now imports the
controller through the domain barrel; the monolith ceiling closed to exactly
19347 (zero regrow headroom, per the phase spec; the seam reviewer preferred
keeping the 19400 margin, recorded here so Fernando can overrule); the
controller suite gained a controllable fake-hooks arm covering the poll
throttle, estimate last-write-wins, pay re-entry lock, vanished-row clear,
per-role completion lines with the R34 fallback, side-scoped money rows,
accept routing plus the accept body/refusal, close-path recovery, withdraw,
the escrow-failed face, and the live coin-copper write; the trade source pins
comment-strip and bound their windows at agreed anchors; new guards pin the
server trade_close dispatch arm, the Hud staged() live binding, the E2E
reach-through names, exemption-row memo drift in the language fanout, and a
server-wide sim.postOffice facade scan (every spelling, lap-string carve-out).
41 mutations were run against the pins; every one failed as expected (one,
the shallow-copy staged getter, initially survived and exposed the untested
coin-copper write, closed in the same round). Gate GREEN twice: at 07fda3fd46
(pre-fix re-verification) and at the final tip 1d7bdbafa0 (all 8 steps, full
suite 37278 passed, browser 117); one intermediate run flaked on the known
heavy-suite timeouts (owned_class harnesses, warlock sustain, sfx export)
while a reviewer agent loaded the machine, and every one of those suites is
green in the clean final run.

## Deferrals and follow-ups

- Re-review, noted with no action (pre-existing, documented design): the custody
  return shape is declared both inline in `server/game.ts` (`wocCustodySession`)
  and as `WocCustodyGameHost`; `persistMailBlob` deliberately diverges from
  `saveMail` (failure must propagate) per its own comment. Rule of three not
  reached on either.
- Re-review, speculative (low confidence): nothing gates escrow listing or
  extraction on being seated in a battleground match; a server-policy question
  for the custody/step-up sessions, not a merge defect.
- The moved trade-window code carries a pre-existing biome useOptionalChain
  warning (`bothAgreed` expression, now in `woc_trade_controller.ts`); warnings
  do not gate, left byte-identical by the move rule; polish pass owns it.
- The trade window deliberately keeps its no-relocalize posture after a language
  switch (inherited coordinator-era behavior, now recorded as a
  `NOT_A_LANGUAGE_GATE` row in `tests/language_fanout_registry.test.ts`); giving
  it a relocalize() is a behavior change for the UX sessions to decide.
- Seam review, deferred restructures (faithful-move rule kept them out of this
  diff): the woc_trade controller reaches hosts directly (module-local `$`,
  `Date.now`, `window.setTimeout`) where `fiesta_controller` injects them
  through its deps bag; and the module-local `$` helper is now the third
  byte-identical copy in `src/ui` (hud.ts, char_skin_window.ts), so the rule of
  three has been reached for a shared helper.
- Stale mentions of `updateTradeWindow` as a hud.ts method remain in two
  historical docs (`docs/hud-program-validation-report.md`,
  `docs/ui-architecture-hud-modularization/phase-p2-window-template.md`); both
  are dated point-in-time records, left per the docs staleness policy.
- Not runnable in the implement session (need `npm run dev`): the perf tour
  and the two updated E2E scripts (`scripts/trade_money_shot.mjs`,
  `scripts/localization_e2e.mjs`); still unexecuted after QA (the browser
  regression suite itself ran green inside both full gates).
- QA round deferrals, each with an owner (restructures the faithful-move rule
  kept out of this diff, plus pre-existing debt the extraction surfaced):
  - Extract the accept-button state machine (bothAgreed/escrowFailed/
    wocAccepted/acceptSpent) into the view core with its own cases: the flow
    phase (14) owns this button. Its behavior is meanwhile pinned by the
    escrow-face and routing arms in tests/woc_trade_controller.test.ts.
  - `refreshWocTradeArm` in src/ui/trade_woc_panel.ts is a second hand-rolled
    write cache in a bare-named module the painter gate cannot see; move it to
    a `woc_trade_arm_painter.ts` on the writer facet: polish phase (15).
  - Per-medium-tick `$('#trade-window')` query in updateTradeWindow (a
    faithful-move artifact; "resolve refs once" wants a cached ref): 15 or 16.
  - The `#7fdc4f`/`#ff6b6b`/`#ffd100` log-color triple is now its fourth copy
    across extracted controllers; name the constants once: 15.
  - `staged()` handing back a live mutable object is the documented contract;
    the durable shape is a command pair (stageItemDelta/setStagedCopper): 14/15.
  - The completion line prints a raw item id inside localized prose on the
    unknown-item arm (deliberate, commented); a wrapped placeholder key: 14.
  - Trade rows drop the owned-stack instance marks (masterwork seal, glyphs)
    that bags and banks paint; the all-surfaces rule names only the three
    grids, so this needs a product call exactly where money meets items: 14.
  - The '[hud]' render-catch log prefix was deliberately restored for
    byte-faithfulness and now misattributes the module in dev logs; rename
    deliberately (with the E2E pins) if desired: 15.
  - `#trade-window` predates the HUD-chrome dialog contract (no markDialogRoot,
    no windowFocus trap); pre-existing debt, natural to schedule now: 14/15.
  - tests/command_facets.test.ts still checks one direction only; a reverse
    completeness assertion currently reds on 37 pre-existing untagged commands
    (vendor/quest/professions clusters), so it is program-wide debt, not a
    trade gap: wire-completeness phase (12).
  - sendWocTradeOffer's success path and the devsig
    (`signatureRequired === false`) branch remain source-pinned only; behavior
    arms via the fake-hooks rig: 14 (the devsig spelling is pinned in
    tests/trade_woc_panel.test.ts either way).
  - wocOfferPhase stayed in src/ui/trade_woc_panel.ts while its sibling
    decisions moved to the pure core; a Node-env suite now imports a DOM
    adapter for it (safe today, verified no module-scope DOM): 14/15.
