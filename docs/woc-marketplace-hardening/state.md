# State: cross-session cheat sheet

Updated by every session. Keep this file SHORT and current; it is what the next session
actually reads.

## Where we are

- Next file to run: `docs/woc-marketplace-hardening/phase-03-qa.md`
- Packet created 2026-08-11 from `review.md` (the 2026-08-11 three-repo review).
- 01 implemented AND QA'd (PASS-WITH-FOLLOWUPS, fixes applied, PUSHED).
- 02 implemented AND QA'd (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED at
  the QA tip; gate GREEN at 301a8c7c22); see the ledger below and progress.md
  for the QA round, the reasoned resolutions, and the phase 03/04 handoffs.
- 03 implemented (B2a/B2b/B2c + monitor; five-reviewer round + fix round
  applied; LOCAL, not pushed per R4); ledger entry below carries the seams
  and ops caveats later phases need, progress.md the full round. ONE spec
  deviation flagged for the QA session to re-judge (AC3: unprovable mail
  claims PARK instead of auto-resuming; a security ruling, see progress.md).

## Repos and branches

| Repo | Worktree | Branch | Tip at packet creation |
|---|---|---|---|
| game | `/Users/fernando/Documents/wocc-marketplace` | `feature/woc-marketplace` | `a52da32c89` (merge of release/v0.37.0, current) |
| service | `/Users/fernando/Documents/woc-rewards-service-pr31` | `integration/woc-market-settlement` | `70d4207` (= PR #31 tip) |
| dashboard | `/Users/fernando/Documents/woc-rewards-dashboard-pr13` | `integration/woc-market-trading` | `c001d4a` (= PR #13 tip) |

Pushes: game pushes fast-forward `origin/feature/woc-marketplace`; service pushes go to
`origin/feature/woc-market-settlement` (updates PR #31); dashboard pushes go to
`origin/feature/woc-market-trading-controls` (updates PR #13). Cadence per resolved R4:
QA sessions push on PASS; implement sessions never push (commands in
implementation-plan.md).

## Validation matrix

- Game, any code change: `npx tsc --noEmit` + the targeted `npx vitest run <files>` +
  `npm run ci:changed`.
- Game, `src/sim/` change: add `npx vitest run tests/architecture.test.ts`.
- Game, player-text or emit change: add `npx vitest run tests/localization_fixes.test.ts`
  (S3 guard; needs `npm run i18n:gen` first if i18n.status.json is missing; it is
  untracked and worktree-local).
- Game, wire/protocol change: add `npx vitest run tests/snapshots.test.ts tests/env_protocol.test.ts tests/bandwidth.test.ts`.
- Game, DDL change: boot the dev DB (`npm run db:up`) and run the marketplace real-SQL
  suites. Since 02 that concretely means
  `TEST_DATABASE_URL=postgres://eastbrook:<pw>@127.0.0.1:5433/eastbrook npx vitest run tests/woc_market_settlement_pg_integration.test.ts`
  (the suite creates and drops its own disposable database; without the env var it
  SKIPS green, so a green default-tier run is not evidence it ran).
- Game, monolith-listed file: `npx vitest run tests/monolith_budget.test.ts`.
- Game, pre-merge / end of phase: commit first, then `node scripts/gate_select.mjs`
  (gate needs a committed tree; it stops at the FIRST failure, run later steps by hand if
  a known red is being carried).
- Service (in `service/`): `npm run build` then `npm test`.
- Dashboard: `npm test`, `npm run check`, `npm run build`.

## Rulings

Resolved (Fernando, 2026-08-11):

- R1 (phase 13, B6): RESOLVED: wallet-signature step-up on custody-moving ops; delete
  the phantom TOTP scaffolding. Open sub-point for phase 13 session start: threshold
  posture (recommended: step-up on every custody-moving call).
- R2 (phase 09): RESOLVED: forfeited bonds follow the PRD treasury + burn split, one
  code path with the settlement fee split.
- R4 (all phases): RESOLVED: push after each QA PASS (or PASS-WITH-FOLLOWUPS with fixes
  applied), repos the pair touched; implement sessions never push; FAIL pushes nothing.
  Exact push commands live in implementation-plan.md commit rules.

Still open (a phase that hits one asks at session start):

- R3 (phase 11, H3): oracle venue posture. The PRD requires a cross-venue deviation gate
  but Pyth has no $WOC feed. Options: add a second real venue, or revise the claim to
  single-venue with tightened staleness/deviation bounds. Needs a product call.
- R5 (phases 09/10/21): the remaining chain-wiring operational decisions: SOL fee
  funding and monitor, ATA-rent-on-refund policy, verifier commitment level and
  confirming timeout, devnet mint choice. Phases propose defaults; Fernando confirms.
- R6 (phase 07, B7): counsel owns final Terms language. The phase produces drafts and a
  decision memo; counsel sign-off is a launch gate tracked here, not a packet deliverable.
- R7 (scope adds, unanswered 2026-08-11): Fernando was offered four deferred
  nice-to-haves as packet phases and did not select any: dispute-case UI, marketplace
  player wiki/guide page, game-side audited runtime pause, numeric reserve guard. They
  stay in the follow-ups queue; if he opts any in later, add it as a new numbered phase
  before phase 21 and update progress.md and the plan table.
- R8 (raised by the 02 security review, phases 04/06): with cancel now settlement-aware,
  a wallet-verified buyer can claim the public buy-now lock, abandon it, and re-claim
  in a loop, keeping a seller's listing un-cancellable at zero cost (public abandons
  deliberately carry no strike). Options: a per-account claim-then-abandon counter or
  cooldown, a strike after N public abandons, or accept as-is (the balance gate is the
  only bar). Needs a product call before enable.

## Locked decisions

- Base: `feature/woc-marketplace`, already merged up to release/v0.37.0. Every game phase
  re-syncs the latest `release/**` at phase start; service/dashboard phases re-sync
  `origin/master`.
- Packet docs live in the game repo only; service and dashboard phases are specified here
  and executed in their own worktrees.
- The custody/settlement lifecycle fixes land as focused phases 02 to 06 (the review's
  "one change" recommendation, split along test seams to keep sessions small; QA between
  each keeps the shared root cause honest).
- i18n: English-only via the sanctioned pending mechanism during the packet; release
  fills are maintainer release work. The 3,255 pending Latin fills the review counted are
  NOT packet debt.
- UI bar: DESIGN.md is the design-language standard; the marketplace must look like a
  beautiful classic MMORPG window family (Fernando, 2026-08-11: this is a HUGE part of
  the game). Phase 15 is the dedicated beautify pass (padding/tokens, no truncation,
  formatted numbers and times, readable images, stress captures); its QA requires
  Fernando's eyeball sign-off on the screenshot set.
- Every session starts by entering its worktree (SESSION START block at the top of every
  phase and QA file) and syncing: game from the newest `origin/release/**`, service and
  dashboard from `origin/master`. Prompts pasted into fresh sessions rely on this.
- CLAUDE.md upkeep: every phase updates the nearest local CLAUDE.md its diff makes stale
  (concise, anchor rule, no bloat; create a small top-level one in the service or
  dashboard repo if absent); every QA verifies it.

## Known gotchas carried from the review session

- The two pin tests hit the merge trap: totals were set from a suite run (send 198,
  dispatch 211, IWorld 321, method 236, data 85). If a later release merge conflicts
  there again, re-derive from a suite run, never take either side's number.
- `npm run i18n:build` does NOT run `i18n:scan`; the S3 guard needs `i18n.status.json`
  present (full `npm run i18n:gen` creates it). Bit the review session at push time.
- (RESOLVED by 01) `hud.ts` was monolith-RED until the p2p controller extraction;
  the gate no longer carries a known red.
- The marketplace test set on the game branch was 866 passing at packet creation; the
  full suites: game 1524, service 413, dashboard 131.
- Dashboard `npm audit`: 11 vulnerabilities at review time (phase 19 owns it).

## Findings-to-phase map (from review.md)

- B1 -> 02. B2a -> 02+03. B2b, B2c -> 03. B3 -> 09. B4 -> 10. B5 -> 08. B6 -> 13. B7 -> 07.
- H1, H2 -> 18. H3 -> 11. H4 -> 04. H5, H6 -> 05. H7 -> 01. H8 -> 12. H9 -> 02.
  H10, H12, H14 -> 06. H11 -> 16. H13 -> 14. H15 -> 04.
- Mediums: fake-only SQL -> 20. Fee-split divergence + forfeit burn -> 09. Bond
  double-pay -> 09. Stuck-custody monitor -> 03 (+ dashboard view 19). Compose default,
  fail-open configs -> 08. Anti-snipe unpaid-bid extension -> 04. DB scale (indexes,
  retention, lock_timeout) -> 17. i18n error surfaces + currency -> 14. Dashboard cluster
  -> 18+19. validateReleaseRequest regex -> 18. Service bond-quote usdCents -> 09.
  createDirectedOffer guardBalance + directed auto-close + bond-size ownership -> 06/09.
  UNIQUE(listing_id) sale invariant -> 02. Env documentation + health rail -> 12.
  Browser-only gate server posture -> 13 (note in scope). Coordinator drift (sim
  extraction, firewall regex) -> 05. Doc staleness -> 07. Runbook -> 22.

## Per-phase ledger (append as phases complete)

- 01 branch-baseline (2026-08-11, session start e4c3dde956, tip 418f75b876,
  LOCAL, not pushed per R4): branch was already current with
  origin/release/v0.37.0 (no sync merge needed). All five coordinator
  re-reviews of merge a52da32c89 CLEAN; non-drift findings applied (W9_TAGS
  trade_close row, ClientWorld tradeClose send pin in tests/trade.test.ts,
  custody facade fix in server/woc_market_custody.ts, two comment fixes). H7
  closed: the trade window + p2p offer machine now live in
  src/ui/hud/woc_trade/ (woc_trade_controller.ts in UI_DOM_MODULES,
  woc_trade_offer_view.ts in UI_PURE_CORES, index.ts barrel) with new
  view-core transition tests (tests/woc_trade_offer_view.test.ts) and a
  controller deps-bag suite (tests/woc_trade_controller.test.ts); hud.ts
  19347 lines, ceiling LOWERED 19600 to 19400. hud_update_drive guard moved
  to a module row; language fanout has a NOT_A_LANGUAGE_GATE row for
  lastTradeSig. `node scripts/gate_select.mjs` GREEN on tip 418f75b876; the
  planner fell back to mode=full (branch-wide diff), so the full vitest
  suite, browser regressions, typecheck, and all builds ran green: the
  review's owed full-gate run is discharged. frontend-seam-reviewer and
  qa-checklist findings ALL applied (1 blocking biome error, dead
  imports/fields, re-bounded source-pin slices, the controller suite);
  deferrals recorded in progress.md. (Figures superseded by the 01 QA entry
  below: ceiling now 19347, gate re-verified at the QA tip.)
- 01 QA (2026-08-11, session start 07fda3fd46, verdict PASS-WITH-FOLLOWUPS
  with every applicable fix applied, tip 1d7bdbafa0 plus this docs commit,
  PUSHED per R4): seven audit lanes (four workflow lenses, frontend-seam,
  test-coverage, privacy-security on the custody commit) plus a fresh
  fix-round auditor and qa-checklist (READY, 0 blocking). All five fix
  commits are test-or-fidelity work: the move is now byte-identical (log tag
  reverted), hud.ts imports via the woc_trade barrel, ceiling closed to
  EXACTLY 19347 (zero headroom, per the phase spec; seam reviewer dissented,
  recorded in progress.md), controller fake-hooks arm covers every REST-facing
  guard, pins comment-strip with agreed slice bounds, new guards pin the
  server trade_close arm, the Hud staged() live binding, E2E reach-through
  names, language-fanout exemption drift, and a server-wide sim.postOffice
  facade scan. 41 mutations all failed as expected. Gate GREEN at 07fda3fd46
  and again at 1d7bdbafa0 (full suite 37278 + browser 117); one intermediate
  run flaked on the known heavy-suite timeouts under reviewer load, all green
  in the clean rerun. Deferral list with owners in progress.md (phases 12,
  14, 15, 16). NEXT = phase-02-settlement-state-guards.md fresh session.
- 02 settlement-state-guards (2026-08-11, session start 0f029bacf9, LOCAL, not
  pushed per R4): B1, H9, the B2a groundwork, and the sale invariant closed.
  The registry later phases need:
  - Error codes: `woc_market.settlement_in_flight` (409) with catalog leaf
    `apiError.woc_market.settlement_in_flight` and five non-Latin fills.
    Seller cancel maps an unexpired lock to `buy_now_locked` and a live
    settlement to `settlement_in_flight`; the admin suspend route answers 409
    with its own admin-envelope English. The 02 QA round added
    `woc_market.contended` (409, the bounded lock-wait or deadlock-victim
    refusal on cancel/suspend/buy-now; retry immediately) and
    `woc_market.sale_conflict` (409, an admin sale correction blocked by a
    standing non-excluded row), both with catalog leaves and five non-Latin
    fills; the admin sale route answers the conflict with its own 409
    envelope line, and the admin suspend route answers contention with a 409
    envelope line too. The phase 14 admin-envelope conversion (the owned
    raw-English deferral) also owns switching those two bespoke lines to the
    registered codes, which are wired end to end and filled but reach the
    wire today only on the player-facing routes.
  - Indexes: `woc_market_settlements_open` (UNIQUE partial, state IN offered/
    confirming/confirmed/delivering/delivered) REPLACED
    `woc_market_settlements_live`; `woc_market_sales_listing_once` (UNIQUE
    partial ON woc_market_sales(listing_id) WHERE excluded = false). Both ride
    boot DDL with idempotent pre-flight repair UPDATEs above them (settlement
    losers demoted to expired with fail_reason 'schema_dedupe' plus any prior
    reason appended after a colon, so sweep with LIKE 'schema_dedupe%'; later
    duplicate sales voided excluded = true), a recorded decision AGAINST
    concurrent_indexes.ts: the tables are pre-enable empty and a CONCURRENTLY
    build can leave an INVALID carcass that silently drops the invariant.
    Since the 02 QA round the repair gates read pg_index VALIDITY (not
    to_regclass), and each CREATE is preceded by a drop of an INVALID
    same-named carcass: a failed hand-run CONCURRENTLY build can no longer
    satisfy IF NOT EXISTS while enforcing nothing (proven by a real carcass
    test). DB-free structural pins for the whole DDL surface live in
    `tests/server/woc_market_directed_sql.test.ts`.
  - Db seam: `cancelListingIfUnbid(realm, id, seller, nowMs)` refuses
    `buy_now_pending`, `settlement_live`, and `contended`, and expires
    'failed' rows (fail_reason 'listing_cancelled') on success; new
    `suspendListingIfSafe` proceeds only over failed or UNQUOTED offered (a
    stamped, unexpired quote refuses like confirming: the buyer may already
    have broadcast payment); `insertSettlement` takes `winnerBidId` +
    `winnerFrom` (won stamped in-tx, CAS from the caller's pickable set:
    close arm ['active'], cascade ['outbid']), locks the LISTING row and
    re-checks status under it (the snapshot predicate alone provably lets a
    settlement land on a just-closed listing), and returns 'listing_closed',
    'winner_gone', and 'contended' distinctly; `nextCascadeBidder` replaced
    promoteNextBidder (selection only); `markBidStatus` grew an optional
    `from` CAS; `markBidOutbidQueueRefund` is the atomic loser demote
    (outbid + held-bond refund in one statement, CAS from 'active');
    `closeListingIfNoOpenSettlement` guards the no-winner close arms (refusal
    parks the listing 'settling'); `reopenListing` fail-closes against open
    AND retry-eligible 'failed' settlements (the reclaim arm never expires a
    failed row: its deadline belongs to the overdue sweep's
    default/forfeit/strike/cascade pass, and the suspend expiry's CTE
    releases a dead settlement's 'won' bid to cancelled/refund_due so no bond
    can strand); `transitionSettlement` reports the revival-vs-open-index
    23505 as false
    (settlementQuote refuses instead of 500ing); `setSaleExcluded` returns
    'ok' | 'miss' | 'conflict'.
  - LOCK ORDER RULE for a market transaction touching bid rows AND the
    listing row: bids first (the whole open set, by id: activateBid pre-locks
    it since the 02 QA round, the reproduced 40P01 fix; insertSettlement
    stamps its one winner bid), listing second; the reverse deadlocks.
    Transactions that take no bid row lock carry documented carve-outs in
    place (cancelListingIfUnbid, insertPendingBid, escrowInsertListing).
    Guard transactions run `SET LOCAL lock_timeout` (ESCROW_LOCK_TIMEOUT_MS)
    and surface 55P03/40P01 as the typed 'contended' refusal. Now also
    recorded in server/CLAUDE.md (the woc_market Key-files row).
  - Ops caveats for the phase 22 runbook: the deploy is forward-only (an OLD
    binary against the NEW schema re-opens the settlement-less-won-bid window
    and its reclaim arm can still reopen delivered-but-unclosed listings; the
    market must stay disabled through any mixed-fleet window). The disable is
    also load-bearing for BOOT AVAILABILITY: an old binary writing between
    the repair scan and the CREATE INDEX makes the new boot's index build
    fail, roll back, and exit; the retry self-heals but a persistent writer
    is a boot loop. Under the new schema an old binary's double delivery now
    THROWS at insertSale (23505) instead of minting a silent duplicate: the
    safer direction, but a new old-binary failure mode. Never hand-drop
    `woc_market_settlements_open` or `woc_market_sales_listing_once` during
    an incident: the validity gate re-arms and the next boot demotes any
    surviving duplicate open settlements as schema_dedupe. Detection queries, PRE-upgrade only (after
    a successful boot both return zero by construction): duplicate open
    settlements `SELECT listing_id FROM woc_market_settlements WHERE state IN
    ('offered','confirming','confirmed','delivering','delivered') GROUP BY
    listing_id HAVING count(*) > 1`; duplicate sales `SELECT listing_id FROM
    woc_market_sales WHERE excluded = false GROUP BY listing_id HAVING
    count(*) > 1`. POST-upgrade audits: repaired settlements `SELECT * FROM
    woc_market_settlements WHERE fail_reason LIKE 'schema_dedupe%'` (any that
    reached confirming may still land on chain: reconcile by hand, and check
    their bids for a stranded 'won' + 'held' bond pair, which no sweep arm
    reaches); repaired sales `SELECT s.* FROM woc_market_sales s WHERE
    s.excluded = true AND EXISTS (SELECT 1 FROM woc_market_sales t WHERE
    t.listing_id = s.listing_id AND t.excluded = false)` (also matches
    legitimate operator voids with a standing correction). Before enable,
    EXPLAIN the two repair quals against the grown tables (rides the phase
    16/17 EXPLAIN list).
  - HARD PREREQUISITE FOR ENABLE, recorded from the 02 security review: a
    settlement stuck in 'confirming' now has NO escape hatch at all (cancel,
    suspend, and reclaim all refuse; the old unsafe suspend arm that could
    expire it was the B1 dupe vector and is gone). Phase 04 (H15, the bounded
    confirming resolution) is what restores an exit; it must land before
    WOC_MARKET_ENABLED is ever set. R8 (lock-spam cancel denial) is the other
    02-raised ruling.
  - Handed to phase 03 by the 02 QA round (delivery/reconcile scope): a
    settlement that reaches 'delivered' without its close tail (crash between
    the delivered CAS and closeListing, or the deferred insertSale 23505)
    leaves the listing in 'settling' FOREVER with no sweep arm reading
    'delivered' and no operator escape (cancel, suspend, reclaim all refuse):
    the reconcile arm needs a delivered-re-drive, and deliverOne should
    refuse when listing.itemDisposed is already true (belt against the
    return-then-deliver dupe shape).
  - Handed to phase 04 (buy-now lock lifecycle): `clearBuyNowLock` carries no
    holder guard (any caller clears whoever's lock); safe at every current
    call site, but a guarded variant would make the safety local. Rides
    beside R8.
- 03 delivery-exactly-once (2026-08-12, session start e71a8cfd21, commits
  1196e2bb28 + 9f8097c1fb + a08653dbd2, LOCAL, not pushed per R4): B2a, B2b,
  B2c and the stuck-custody monitor closed. What later phases consume:
  - Monitor endpoint (phase 19 dashboard view): GET /internal/woc-market/stuck,
    dashboardGate (DASHBOARD_INTERNAL_SECRET), admin envelope, parameter-free.
    data = WocStuckCustodyReadout: { unbookedClaims: { count, sample:
    [{ custodyRef, claimedAtMs, grantCharacterId, mailIntent }] },
    stuckDelivering: { count, sample: [{ id, listingId, createdAtMs }] },
    undisposedListings: { count, sample: [{ id, resolution, updatedAtMs }] } }.
    Counts SATURATE at 1000 (a count equal to 1000 means "1000 or more");
    samples cap at 20; rows aged >= 10 min; served from a 30s cached read
    (single-flight, frozen object, deliberately non-busted). The 5-minute log
    beat prints only when something is stuck and warns once per failure
    streak; it runs even when WOC_MARKET_ENABLED=0.
  - Custody rail attribution (phases 04/05/21/22): every claim carries at
    most one intent, grant_character_id (direct rail, stamped BEFORE the bag
    grant) or mail_intent_at (mail rail, stamped BEFORE the parcel exists;
    markCustodyMailIntent is also the one legal grant-to-mail conversion,
    only after a grantCopy refusal). Resume rules: booked = done; grant
    intent resumes ONLY via this process's pendingGrants session continuity
    (same characterId + lease nonce, snapshotCopy, never a second grantCopy);
    mail intent resumes ONLY via an UNWRITTEN pendingMail entry (no parcel
    can exist yet) or hasParcel (the parcel still in the live book); once an
    attempt reached the post office, in-process memory proves nothing about
    collection, so only the in-book check authorizes. EVERYTHING else parks
    visibly (bare claims incl. all pre-upgrade rows, collected letters,
    lease fences, restarts, relogs). ITEM-FREE letters (the sold notice)
    skip the ledger entirely: they cannot duplicate and nothing re-notifies,
    so a durable claim only polluted the readout. A lease fence proves only that THIS write lost, never
    that an earlier autosave did: that reasoning is load-bearing, do not
    weaken it. unclaimCustodyRef, clearCustodyGrantIntent,
    saveDeliveredCharacter and cancelOpenBidsForListing are GONE from the db
    seam; new members: custodyRefState, markCustodyMailIntent,
    markCustodyGrantIntent, saveDeliveredCharacterBooked (atomic fenced
    bags+booking, lock_timeout + heavy statement timeout, characters-row
    carve-out from the market lock order), finalizeDeliveredSettlement,
    deliveredUnclosedSettlementsPage, disposeSoldResidueListings,
    touchSettlementRow, stuckCustodyReadout.
  - Reconcile semantics (phase 21): deliverOne returns
    advanced|parked|skip|contended; parked rows rotate to the updated_at tail
    and back off in-process for 60s (monitor ages on created_at, which
    rotation never touches); a contended finalize stops the batch and the
    next pass retries; delivery stats count rows ADVANCED (a parked batch is
    the monitor's business, not a saturation flood). The redriven beat runs
    once per minute over 500-listing id pages (cursor resets on an exhausted
    cycle) and converges delivered-unclosed residue AND sold-undisposed
    residue with a standing sale row; sold-undisposed WITHOUT a sale row
    parks forever (operator-only exit, on purpose).
  - Lock order registry update: suspendListingIfSafe now pre-locks
    ('pending_bond','active','won') because its expiry CTE cancels a dead
    settlement's winner; finalizeDeliveredSettlement pre-locks the open set
    plus the winner. Both sides of that former cycle are pinned by a live
    concurrency test in tests/woc_market_delivery_pg_integration.test.ts.
  - Ops caveats for the phase 22 runbook, appended to the 02 list: BEFORE
    upgrading a realm that ever ran the market, verify
    `SELECT count(*) FROM woc_market_custody_claims WHERE booked_at IS NULL`
    is zero (legacy NULL intents are UNKNOWN, not "no attempt": the new
    binary parks them, which is safe but each parked row is a delivery an
    operator must finish). BEFORE a binary ROLLBACK, drain
    `SELECT custody_ref FROM woc_market_custody_claims WHERE booked_at IS
    NULL AND grant_character_id IS NOT NULL` to zero: the OLD binary adopts
    any bare claim as booked and completes the sale with nothing delivered.
    The EXPLAIN list for phases 16/17 gains: the redrive page probe
    (listing_id = ANY page), the three readout sample+capped-count pairs,
    and the disposeSoldResidueListings subquery. Claims-table retention
    (phase 17): booked rows are prune-eligible provenance; unbooked rows are
    the operator queue and MUST NOT be pruned.
- 02 QA (2026-08-11, session start 20fdcc5288, verdict PASS-WITH-FOLLOWUPS
  with every fix applied, gate GREEN at tip 301a8c7c22, PUSHED per R4):
  release/v0.37.0 synced (merge b40a178643; generated-i18n conflict
  regenerated; merge audit clean except the hud.ts ceiling, fixed by the
  preview_prewarm_wiring extraction, ceiling now EXACTLY 19338). Seven audit
  lanes plus a fresh fix-round re-review; the registry bullets above were
  updated in place and progress.md carries the full round. The db-seam facts
  phase 03 inherits: insertSettlement locks the LISTING row (snapshot
  predicate alone was proven insufficient against a concurrent closer);
  closeListingIfNoOpenSettlement guards the no-winner close arms; the
  reclaim PARKS failed settlements for the overdue default pass (never
  expires them; reopen refuses over failed rows); the suspend expiry
  releases a dead settlement's won bid via its CTE; 'contended' and
  'sale_conflict' are registered refusals; the boot repairs gate on index
  VALIDITY via to_regclass. Twelve mutation proofs all bit. Real-SQL suite
  41 green. NEXT = phase-03-delivery-exactly-once.md fresh session.
