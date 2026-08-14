# State: cross-session cheat sheet

Updated by every session. Keep this file SHORT and current; it is what the next session
actually reads.

## Where we are

- Next file to run: `docs/woc-marketplace-hardening/phase-07-policy-terms-drafts.md`
- 06 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4).
  Release/v0.38.0 re-synced (merge ab2742012b, NON-trivial: three test
  conflicts plus two SILENT count-pin auto-merges, all re-derived from
  suite runs: IWorld 323 = 86 data + 237 methods, fanout exemptions 10,
  hud.ts ceiling DOWN to 19160, sim.ts 12436; release-merge-audit ran,
  faithful, zero findings across seven overlap groups). ea1bb82322
  verified FIRST (comment-only src hunk; every pin bit under mutation).
  Six fresh audit lanes found ZERO code blockers in the implement round;
  the QA round's own finds: the capacity model's fungible-first drift
  (receiver overflow, fixed by making fitsAfterSwap run the removal walk
  itself), the instanced matcher's missing crafted-marker leg, the
  missing guardTerms on the directed buyer (strike parity), and four
  blocking TEST gaps, all closed. ONE NEW OPEN RULING for Fernando (R9,
  in Rulings): the trade arm records implied terms consent. The 06
  ledger entry below is AMENDED IN PLACE; the 07 session consumes the
  amended entry and should glance at the final tests-only commit
  47399f77b7 first (34 lines, implements the qa gate's prescriptions).
- 06 implemented AND reviewed (LOCAL, not pushed per R4): H10, H12, H14,
  createDirectedOffer guardBalance, and the directed non-payment
  auto-close closed; BOTH opening judgments settled ((a) unwind made
  provable by the atomic listing stamp + the convergedOffers sweep arm;
  (b) NO boundTo stamping, the rationale truthed-up at
  exchange_eligibility.ts). A db-perf PRE-implementation checkpoint
  (BLOCK, A1-A8) reshaped the design before code; the pg suite ran RED
  first for all seven target behaviors; FOUR fresh reviewers plus a
  fix-round re-review plus qa-checklist ran, every finding applied
  including nits (the security round's CRITICAL: the trade session
  stripped staged slots to id+count, so the H10 pin's client source
  could not carry an instance payload; trade staging now previews
  per-copy identity through the swap's own selection walk). After the
  first gate pass, SIX closing rounds ran (two independent fresh
  reviews of the gate-round commit, every fix round re-reviewed fresh;
  the CLOSING ROUNDS bullet in the 06 ledger has the substance). Gate
  GREEN three times: 5287214294, 5ebb176a73 (all production code), and
  the final tip ea1bb82322 (each full-suite fallback, all 8 steps, run
  WITH TEST_DATABASE_URL so every pg suite executed). The 06 ledger
  entry below is the registry later sessions need; the phase-06-qa
  session consumes it, and should verify the final tests-only commit
  ea1bb82322 FIRST (it implements the last reviewer's prescriptions
  and is the one round without a fresh review of its own).
- 05 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4).
  Release/v0.38.0 synced (merge b9e937c075, trivial: seven commits, no
  marketplace overlap, no count-pin surface). All four owed re-judgments
  UPHELD with their justifications repaired (the numbers, the
  quarantine-kick posture, 57014-stays-500, the carve-out, now owned by 16
  and sequenced after the honest occupancy bound). Five audit lanes plus a
  fresh fix-round re-review and qa-checklist; the QA round found and fixed
  one CRITICAL (TxNeverStarted stopped at the pool checkout: a stale
  socket failing at BEGIN still quarantine-kicked the seller) and one
  critical-class evidence destroyer (withTx's null asyncErr deref replaced
  every codeless failure with a TypeError), plus the kick-argument swap
  that sent untranslated jargon on the wire. The 05 ledger below is
  AMENDED IN PLACE for the changed seams; phase 06 consumes the amended
  entry and OPENS with two directed-rail judgments (the three-legged THROW
  residual; whether directed delivery should stamp boundTo). Full round in
  progress.md.
- 05 implemented AND reviewed: H5, H6, the coordinator-drift medium
  (broker custody extraction + the firewall tighten) closed; ledger entry
  below. A database-performance PRE-implementation checkpoint (BLOCK, five
  amendments) reshaped the design before any code; the three-reviewer
  round found three critical defects in the fix (the EPIPE rollback-proof
  hole, the ownership-order IDOR, the inverted restore-mail premise) plus
  two blocking test gaps, every finding applied and re-reviewed fresh.
- 04 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4;
  gate GREEN at the final tip 8c1028e89d, full-suite fallback, all 8
  steps).
  Release/v0.37.0 synced (merge a43a1e8b52; the parity/command count-pin
  merge trap fired for real, pins re-derived from runs: IWorld 322/85/237,
  sends 199, dispatches 212; hud.ts ceiling 19177 after the
  crafting_deny_core extraction; game.ts ceiling 10859). The 04 ledger
  below is AMENDED IN PLACE for the QA round's changed seams (the reviewed
  sweep arm + confirmingOverdueSettlements split, the advisory-pass
  cooldowns, GUARD_IDLE = ESCROW_LOCK_TIMEOUT_MS, the signature shape
  check, the 720h confirming-hours clamp, the stuckBonds sample order, the
  lapse-straddle refresh guard, the poll-race standing answer, review in
  the settlement outcome arm); phase 05 consumes the amended entry.
  progress.md carries the full round (five lanes, deep mutation pass incl.
  one real hole closed, residuals with owners).
- Packet created 2026-08-11 from `review.md` (the 2026-08-11 three-repo review).
- 04 implemented AND reviewed (LOCAL, not pushed per R4): H4, H15, the
  anti-snipe medium, R8 both arms, and the 02 clearBuyNowLock handoff;
  ledger entry below. Six reviewer lanes ran (privacy-security,
  database-performance, test-coverage each TWICE; qa-checklist READY;
  migration-safety no critical/warning), every finding applied or owned
  across THREE fix rounds; 17 mutation spot-proofs bit; gate GREEN at
  0afdaa71a5 (full-suite fallback). A dedicated VERIFICATION session then
  re-ran the phase over the committed tree (fresh deliverables and
  test-coverage audit lanes, all three pg suites re-run green, three
  committed-round mutations re-bitten) and applied its findings as a
  further fix round: the route-level cancelPending wire pin (the one
  unpinned hop), typed confirm_in_flight on second/different signatures
  (both legs), the idempotent confirming-settlement retry, the lapseBid
  held-bond carve-out, the first-arrival extension anchor (kills the
  re-post creep), the cancelListingIfUnbid idle bound, the stuckBonds
  signature age axis, comment-stripped window pins via the extracted
  tests/helpers/strip_comments.ts, tunable literal pins (park delay and the
  anti-snipe trio), and the ledger corrections recorded in place. The fix
  round was re-reviewed fresh, which drove a second pass:
  outcome-answering retries of already-succeeded signatures on both legs,
  the leg-neutral confirm_in_flight copy (five fills refreshed), the
  held-survivor poll park, the split extension anchors (ruling recorded),
  the stuckSinceMs sample field, and the derived paid-subset pin
  (progress.md carries both rounds). Gate GREEN TWICE more (full-suite
  fallback, all 8 steps) at c7176d730b and at the final code tip
  6642c6e15b; eleven mutation proofs bit across the session. The H15 escape hatch that gated enable
  exists (the 'review' state). Items the DEDICATED phase-04-qa session still
  owns: re-judge the cooldown NUMBERS, the cancel-intent bid-block
  interpretation, the confirm_in_flight second-signature semantics, the
  stuckBonds axis change, and the confirming-hours no-upper-clamp posture
  (recorded in progress.md), and the R4 push. Deferred to
  phase 14 with owners: the anti-snipe deadline player-copy consequence, the
  cancel-intent client marker, the claim_cooldown remaining-time copy, and
  the after-close no-extension behavior note.
- 01 implemented AND QA'd (PASS-WITH-FOLLOWUPS, fixes applied, PUSHED).
- 02 implemented AND QA'd (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED at
  the QA tip; gate GREEN at 301a8c7c22); see the ledger below and progress.md
  for the QA round, the reasoned resolutions, and the phase 03/04 handoffs.
- 03 implemented AND QA'd (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per
  R4). The AC3 park deviation is UPHELD (no integrity hole; Fernando can
  overrule, rationale in progress.md). The QA round's blocking finds (park
  rotation blinding the monitor; the unbounded redrive beat) are fixed; the
  03 ledger entry below was AMENDED IN PLACE for the changed seams (rotation
  column + exclusion, readout shape with asOfMs/saturated/updatedAtMs,
  per-entry contention scope, finalize re-lock + already_final, typed
  activateBid contention, ambiguous grantCopy refusal). Phase 04 consumes
  the amended entry, not the original.

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
- R8 (phases 04/06, resolved Fernando 2026-08-12): the public buy-now
  claim-then-abandon loop gets BOTH arms, no strikes:
  - Cooldown: after an account abandons (or times out) a public buy-now lock,
    it cannot re-claim THAT listing for a cooldown, plus a small account-wide
    abandons-per-hour cap that triggers a broader claim cooldown. The phase
    proposes the numbers; QA re-judges them. Public abandons still carry no
    strike (strikes stay reserved for real payment defaults; directed-sale
    abandons keep their existing strike).
  - Cancel-intent: a seller's cancel on a LOCKED listing marks it
    cancel-pending instead of refusing: no NEW lock claims from that moment,
    the current holder keeps their full window, and an unpaid expiry closes
    the listing cancelled (return flight home) instead of relisting. Bounds
    the seller's worst-case cancel denial at exactly one lock window. Compose
    with the 02 liveness guards (a PAID window proceeds to settlement as
    usual; cancel-pending must never tear a live settlement) and the 02
    handoff that clearBuyNowLock carries no holder guard.

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
- R9 (phases 07/14/22, raised by the 06 QA round 2026-08-13): the trade window's
  $WOC arm records IMPLIED terms consent. Both its money sends (the offer create,
  and the pay arm since it shipped) hard-code acceptTerms: true while the panel
  renders no terms text or link, and guardTerms durably RECORDS the acceptance,
  so a buyer who never opened the Exchange gets a stored consent row that later
  backs strikes and suspensions. Inert while WOC_MARKET_ENABLED stays off.
  Options: (a) keep the posture and land a panel terms affordance (the Exchange
  window's checkbox is the model) before enable; (b) have the panel send the
  player's real choice once 07's terms drafts exist. Either way the pre-enable
  audit (22) must not pass while the panel records consent it never showed.
  07 owns the terms drafts, 14/15 own the panel surface.

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

- 06 directed-rail-integrity (2026-08-13, session start b948aa64fb = the
  trivial release/v0.38.0 sync (16 commits, the chronomancer train, no
  marketplace overlap, no count-pin surface), gate GREEN at 5287214294,
  LOCAL, not pushed per R4): H10, H12, H14, createDirectedOffer
  guardBalance, and the directed auto-close closed. The registry later
  sessions need:
  - JUDGMENT (b) SETTLED: NO boundTo stamping this packet. The
    anonymous-escrow premise genuinely does not cover a named directed
    deal; the standing rationale is the ESCROW LIFECYCLE (every
    compensation exit would need its own binding decision) and is now
    written at exchange_eligibility.ts. Lifting it is an offered product
    follow-up (the R7 pattern), sized as stamp-at-delivery across
    grant/return/restore/mail/park. Consequence: offer CREATION runs
    listingEligibility on the pinned item, so bind_armed refuses at
    offer time.
  - JUDGMENT (a) SETTLED: UNWIND, made provable. escrowInsertListing
    stamps offer.listing_id INSIDE the escrow transaction (CAS on
    accepted-and-unstamped; zero rows aborts typed 'not_pending' and the
    copy restores). Invariant: listing exists IFF the offer is stamped;
    resolveDirectedOffer lost its post-hoc stamp arm (the one
    offers-then-listings lock edge, deleted). A proven-rollback throw
    also reopens in-request; ambiguity writes nothing; the NEW
    convergedOffers sweep arm unwinds aged accepted-unstamped rows from
    durable truth (reopen inside the TTL, expire past it) inside a
    TWO-SIDED window: WOC_MARKET_OFFER_CONVERGE_SECONDS = 300 clears
    every transaction bound; WOC_MARKET_OFFER_CONVERGE_MAX_AGE_SECONDS =
    86400 refuses rows the listings prune's ON DELETE SET NULL
    un-stamped long after their deal completed (NOT rollback evidence;
    without it the arm relabeled real history). Behind
    woc_market_offers_accepted_unstamped, ORDER BY updated_at, narrow
    projection (id + expires_at), per-row sweepError isolation, no park.
    The seller-quarantine and parked-copy legs of the three-legged
    residual STAND.
  - H10 FINGERPRINT SEMANTICS: the identity is the sim's itemCopyPin
    3-tuple (item id + instance payload + crafted provenance; NO new
    serializer); item_pin stores its fixed-width sha256 hex DIGEST (a
    raw client-derived serialization banked kilobytes per row). Stamped
    at CREATION; the buyer's client sends the partner's ONE staged slot
    of COUNT ONE (the one_item hint arm covers the WHOLE table: a second
    slot, a stack, or an ineligible companion all block the send;
    WocTradeModel.agreedItem is the pinned copy). Authoritative check:
    itemPinDigest(extract.extracted) inside the serialized escrow job;
    mismatch restores + refuses typed 'item_mismatch' (NEW leaf
    woc_market.item_mismatch, 409, five non-Latin fills; its own code,
    the fix is a fresh deal). A NULL pin (pre-pin row) refuses too. THE
    LOAD-BEARING PREREQUISITE (the security round's critical): the trade
    session used to strip staged slots to id+count, so NO client source
    carried the identity (and the seller could not even resolve an
    instanced accept). Trade STAGING now previews per-copy identity:
    stagedOfferSlots (src/sim/social/trade.ts) runs the swap's own
    selection walk (removeSellUnitsFromInventory, extracted byte-faithful
    from removeVendorSellUnits) over a scratch deep copy, groups by
    itemCopyPin, ships FULL payloads on the trade wire (a judged accept:
    consensual mutual inspection; a publicInstanceView trim would alias
    copies differing in hidden fields), and the swap consumes the pinned
    copies first (trade-scoped matchers: isTradeLocked only, the shared
    helper's wider lock routed armed copies around the pin) with a
    per-unit generic-walk fallback; a decoupled inventory hub's
    unattributable remainder keeps the old id+count shape. The capacity
    model merges by item id first (per-copy slots double-counted the
    giver's stock, the receiver-overflow class). The seller's directed
    accept resolves from sim.tradeInfo.myOffer (the cleaned per-copy
    truth), never the HUD-local id-only compose list;
    inventoryIndexOfStaged compares payloads order-independently
    (itemInstancePayloadsEqual). The offer intake bounds itemInstance at
    INSTANCE_MAX_JSON_BYTES = 2048 (both intakes ride optionalInstance;
    the bound also caps nesting depth for the recursive sortedJson,
    which a 64 KiB body overflowed into a 500, verified).
  - H12 HOLD + STRIKE POLICY: WOC_MARKET_DIRECTED_HOLD_SECONDS =
    WOC_MARKET_SETTLEMENT_WINDOW_SECONDS (identity pinned;
    directedParams' durationHours is shape-validation-only, documented
    inert). Worst-case escrow occupancy: one hold + one settlement
    window. STRIKES exactly once per walk-away: never-claimed expiry via
    closeDueAuctions' directed branch (resolution 'unsettled'), strike
    AFTER the close CAS and gated on everSettledForListing probed AFTER
    the CAS ('failed' is not OPEN; the open-probe alone double-struck);
    claimed-then-unpaid keeps the overdue arm's strike, and that arm
    AUTO-CLOSES 'unsettled' BEFORE striking (custody before penalty: the
    strike awaits a health read that can reject; the expiry CAS fires
    once). BOTH strike arms ride strikeDirectedBuyer: no strike while
    the price oracle is unhealthy (buyNow refuses market_paused in the
    same window; the sweep still closes and returns, only the penalty
    pauses; an intra-window blip is an accepted residual) and no strike
    on the shared exempt vocabulary (service_unavailable; TODAY
    unreachable on a settlement row by construction, the same standing
    R5 gap the public exemption carries, documented at the helper; the
    health probe is the live gate). An UNEXPIRED claim lock refuses the
    directed close (the 270s lock outlives the 600s hold routinely; the
    row waits via 'ending' + the 300s stranded reclaim, documented). ONE
    pending offer per (buyer, seller) pair
    (woc_market_offers_pair_pending, UNIQUE partial; 23505 answers the
    NEW typed 'offer_pending', woc_market.offer_pending 409 + five
    fills; already_pending's copy describes a pending BID): the
    strike-farming bound; a boot repair expires all-but-newest pending
    per pair ahead of the index (a populated dev database must not fail
    the whole boot; unbatched, pre-enable rationale recorded). REOPEN is
    pair-aware: flipping accepted back to pending is an INSERT into that
    index, so every reopen site (typed refusal, proven-rollback,
    converge) no-ops when a fresh offer occupies the pair (NOT EXISTS
    arm + 23505 race belt) and the converge arm expires the blocked row
    at its TTL. A directed listing accepts NO bids (insertPendingBid
    refuses 'not_found' FIRST, anti-enum; an active stranger bid
    diverted the directed close into the auction close where the bidder
    wins the escrow).
  - H12 CAP: directed listings count against the shared 12 cap in BOTH
    byte-identical halves (countActiveBySeller + the in-transaction
    count; the false mitigation rationale rewritten at both sites and
    the PRD question resolved). cap_reached at acceptance rides the
    typed restore + reopen. No creation-time cap check (a moving fact;
    the create-time invariant covers static facts, documented).
  - H14 SEMANTICS: wallet_links.pubkey is UNIQUE, so the twin is the
    SEQUENTIAL RELINK (list under W recorded on listing.seller_wallet,
    unlink, relink W on a second account, buy). Guard layers: buyNow
    fast path from values in hand (A7: no advisory wallet read); the
    locked re-check in claimBuyNowLock (lock-first-then-check, PROVEN
    string equality only: undefined === undefined must not fire, the JS
    twin of NULL = NULL); the NOT EXISTS predicate inside the claiming
    UPDATE with zero rows answering typed 'own_listing' (the deref-500
    guard). The UPDATE arm is RECORDED defense-in-depth (only a real-SQL
    interleave distinguishes it; pinned structurally + the relink dance
    real-SQL test). The directed rail refuses 'self_offer' wallet twins
    at creation AND completion (live-vs-live reads; defense in depth
    under UNIQUE).
  - ESCROW BUDGET: ESCROW_STATEMENT_TIMEOUT_MS 5000 -> 4000 over FIVE
    workload statements (the cap count no longer skips directed rows;
    the stamp is the fifth); the tunables relation moved to *5 (27000 <
    30000), the statement count pinned 5-directed/4-public, the
    delivery escrow-cost bound derives to 160ms and held (the cost loop
    now closes each measured row: it leaned on the old cap exemption).
    A2: expireDueDirectedOffers carries the outer status qual (EPQ
    re-checks own columns; without it a raced acceptance could be
    expired over its committed listing) + FOR UPDATE SKIP LOCKED.
  - RETENTION + INDEXES: woc_market_directed_offers_listing (the FK
    referent index the listings prune pays a per-row seq scan without)
    + the accepted-unstamped partial + the pair-pending unique, all
    boot DDL with the pre-enable rationale recorded.
    pruneResolvedWocOffersBatch (house pool-first shape, ORDER BY behind
    woc_market_offers_resolved_updated) + WOC_MARKET_OFFERS_RETENTION_DAYS
    (default 180, matches listings so a deal's rows age out together) +
    the main.ts registration (BEFORE the listings entry, which stays
    LAST) + the wiring and config-table pins. item_id stamps at CREATION
    and the seller's acceptance no longer rewrites it (display honesty).
  - PLAN PROOFS (one-off evidence, session scratchpad; STANDING planner
    assertions remain phase 20 per the recorded precedent): the widened
    cap count = Index Only Scan on woc_market_listings_seller_live, no
    heap filter; the converge read = partial index + LIMIT pushdown, no
    sort; offers-by-listing = the new FK index; the wallet probe
    seq-scans at 300 rows (small-table artifact, PK exists).
  - TESTS: new pg suite tests/woc_market_directed_pg_integration.test.ts
    (17 tests; ran RED first for all seven target behaviors: the relink
    claim succeeding, the 12h hold, both cap halves, no auto-close, no
    never-claim strike, bait-and-switch accepted; plus the converge
    three-way + young/ancient guards, the prune-fallout regression, the
    SKIP LOCKED interleave, the pair bound, exactly-one-strike, the
    offers prune). The DB-free floor gained the stamp/converge/expiry/
    ever-settled/prune/insert pins and the wallet-predicate
    defense-in-depth pin; the service suite the full refusal matrix +
    strike exemptions + close-arm branches + the blocked-reopen arc; the
    trade suite the staging/grouping/fallback/overflow repros; the
    controller suite the instanced accept resolution. The fake db
    mirrors every new semantic and gained seedListingRow (the direct
    residue seam; the widened cap closed the escrow-path staging the
    residue tests leaned on). REFUSAL_ERRORS is 51 rows exact.
  - INHERITED RED REPAIRED IN PLACE: tests/admin_guilds_db_integration
    red on the release tip itself (env-gated, CI never runs it;
    accountDetail gained the general-chat quota LEFT JOIN while the
    rig hand-picks its DDL modules); the rig now applies
    GENERAL_CHAT_QUOTA_SCHEMA. Flows back to the release when this
    branch merges.
  - CLOSING ROUNDS (after the first gate pass; commits f618eaf146,
    da5ca53b4b, d3f831b17e, 685fd0eb00, 5ebb176a73, ea1bb82322): two
    independent fresh reviews of the gate-round commit converged, then
    each fix round got its own fresh review (the final tests-only
    commit excepted; the QA session verifies it first), every finding
    applied. The substance: inventoryIndexOfStaged
    now compares the FULL itemCopyPin triple (the crafted marker leg was
    missing; a staged crafted copy resolved to its unmarked twin and
    refused item_mismatch, with discriminating tests both directions);
    the seller accept mirrors the whole-table one_item rule: the model
    gains acceptHint naming the RIGHT obstacle (nothing sellable =
    needs-item, wrong table shape = one_item, past review = nothing,
    which also retired the stale needs-item copy during
    awaiting_payment), judged over the sim's AUTHORITATIVE offer table
    (stagedAuthoritative, the table the player sees rendered; the
    compose list stays correct for the pre-push gates) with both
    hand-offs pinned, the panel renders it verbatim, and the controller
    belt is the ONLY accept-time enforcement (the trade window's Accept
    never consults the model), arm order matching the model's ladder
    (the ambiguity previously only surfaced as a server-side
    item_mismatch);
    reopenDirectedOffer returns whether the row really flipped and the
    converge stat stops counting blocked no-ops (service pin at
    expiresAtMs - 1000); both acceptance-path reopen swallows report
    through the new offer_reopen sweep-error tag (the typed refusal and
    the escrow root cause stay the caller-facing truths, proven by a
    throwing-reopen test); the pair index joined the house
    INVALID-carcass convention (DO drop ahead of CREATE, convention pin
    now enumerates all three repair pairs) and its name became one
    exported constant (WOC_MARKET_OFFERS_PAIR_PENDING_INDEX) consumed by
    the DDL and BOTH 23505 discriminators, with the insert harmonized
    (foreign-constraint 23505 rethrows, pinned); a deterministic
    real-Postgres interleave (uncommitted racer; the wait OBSERVED from
    a separate pool connection, since a transaction freezes its
    pg_stat_activity snapshot at first read; COMMIT only after the
    block is asserted) proves the 23505 belt swallows by constraint
    name in 20ms; the offer_reopen report is pinned on BOTH catches
    (typed-refusal and proven-rollback throwing arms) with
    count-not-presence restore assertions (the harness seeds identical
    copies, so presence checks were vacuous); the boot dedupe repair
    gained the one-time validity gate; the
    quest hook collapsed to ONE fire per removal batch (every per-id
    fire saw the same final state); the instance intake bound measures
    real utf8 bytes (a non-ASCII payload was getting ~3x the named
    budget, pinned); plus prose/title truth-ups. Recorded as
    informational, NOT defects: the two marker-less staged producers
    (the remainder fallback line and the controller pre-send fallback)
    cannot resolve a crafted-only bag and fail SAFE client-side
    (hintAcceptNeedsItem), both effectively unreachable in a real Sim;
    an all-ineligible table deliberately answers await_their_items over
    one_item (ladder precedence, pinned with the WHY).
  - Deploy notes: guardBalance on offer creation is fail-closed (an
    economy outage blocks directed offer creation, intended); dev
    databases carrying THIS BRANCH's earlier builds can hold raw-JSON
    pins (acceptance refuses, the deal reopens; dev-only) or
    accepted-unstamped rows WITH a live listing from an old binary's
    post-hoc stamp crash (the converge arm would reopen them: wipe such
    dev DBs or expire the rows; production unreachable, the marketplace
    has never shipped). A REINDEX CONCURRENTLY of the pair index names
    its transient index _ccnew; a violation raised against THAT name
    rethrows (a 500) rather than no-opping, which is fail-safe but worth
    knowing during index maintenance.
  - Handoffs: phase 13 step-up covers acceptDirectedOffer per the
    out-of-scope note. Phase 14 needs NO new server command for the
    offer lifecycle (decline/withdraw routes exist; the directed cancel
    remains cancelListingIfUnbid and auto-close shrinks its need); 14/15
    own SHOWING the buyer the pinned copy (agreedItem renders nowhere
    yet; the one_item gate carries the honesty until then), the
    one_item/offer_pending/item_mismatch copy surfaces (now including
    the seller-side accept: the model disables over a multi-slot table
    and the belt logs hintOneItem, but no inline panel copy explains the
    disabled button yet), and the trade
    window's richer payload display (tooltips can now show real rolls).
    Phase 16's cluster gains: the estimate-per-offer-create amplifier
    note (bounded by the LIST limiter; memoize per usdCents if it shows
    in latency) and the trade-wire payload diff cost note (bounded by
    bag capacity, change-gated). Phase 20 owes standing planner
    assertions incl the two new partial indexes. Phase 22's pre-enable
    audit: the bindOnTrade scan line stands; add the two dev-db classes
    from the deploy notes above.
  - QA ROUND (2026-08-13, verdict PASS-WITH-FOLLOWUPS, every fix applied,
    PUSHED per R4; commits c67af5f62f, cedbaae8f2, 19eb3c74d6,
    9c9854ee85, 47399f77b7 on the ab2742012b sync merge). The amendments
    the 07+ sessions consume:
    - CAPACITY MODEL REWORKED: fitsAfterSwap no longer re-describes the
      removal; it RUNS shippedOfferUnits (the walk removeOffer itself
      delegates to) over scratch copies of both bags and lands each
      returned unit with the boundTo-stamp arrival arm. Found because
      the old fungible-first model passed a pinned INSTANCED arrival the
      swap could not merge (a 16/16 receiver ended at 17 slots,
      red-first repro in tests/trade.test.ts). Third drift of that
      model's class (#2139, #2605, this); a walk cannot drift from
      itself. The old conservative unmatched-unit tail was dropped as
      unreachable in a live Sim (countItem and the walk read the same
      array); source pin bounds the walk calls at exactly two and
      negatives a second index walk.
    - removeInstancedMatchingUnit gained the CRAFTED-MARKER leg (the UI
      comparator's closing-round fix had no sim twin: a staged crafted
      copy could ship its payload-equal unmarked twin, laundering
      provenance past the disenchant gate and the H10 fingerprint);
      discriminating tests both directions; the generic fallback stays
      marker-blind BY POSTURE with the scope now written at the call.
    - guardTerms NOW GATES createDirectedOffer (strike parity: every
      path that can strike sits behind terms; order matches placeBid;
      the route decodes acceptTerms strictly; the sdk requires it; the
      controller sends true, see R9). terms_required pre-existed end to
      end, so no new code, copy, or fills.
    - The accept belt READS THE MODEL (canAccept/acceptHint) instead of
      re-deriving the ladder; past-review the belt logs NOTHING (the
      'nothing' arm); canAccept gained its production consumer. The
      sweep-error fallback logs code+message+STACK (no detail, null-safe
      code read at both log sites; the production branch now has its own
      test). Own-property ITEMS lookups at all three client-string
      sites.
    - JUDGED, no code change (do not re-raise): strike non-decay vs the
      public cooldown pair is DOCUMENTED design (the directed rail is
      the auction-default rail minus the bond); the buyer-notice gap on
      a late seller accept is bounded by the 600s offer TTL + the
      withdraw lever, surface owned by 14; the client-only one_item
      quantity rule overlaps the recorded 14/15 honesty residual (a
      server-side staged-shape check noted for 14's consideration); the
      padlock (item_lock `locked`) rides the pin, so toggling it
      mid-deal refuses item_mismatch: fail-safe, 14's copy surfaces
      should explain it; per-actor offer fan-out is rate-limited
      (10/min) and pair-bounded per victim, watch at 14/16.
    - NEW TESTS the next sessions inherit: the pg suite is 23 (return
      flight incl. parcel book + item_disposed + idempotent second pass;
      the seeded boot-repair dedupe, whose survivor is HIGHEST ID = last
      inserted, now said at the DDL; byte-identical duplicate
      acceptance; instanced+crafted end-to-end); the service suite
      gained the instanced happy path proving BOTH digest sites agree,
      the crafted leg both directions, the ever-settled DB-free twin,
      the converge old-bound arm + the 24h literal pin, the
      cap-refusal-before-custody witness (extractAttempts), and the
      sweep-fallback shape; routes CAPTURE the forwarded offer body;
      tests/items_sell_units.test.ts is the walk's direct suite;
      trade.test.ts pins pinned-copy-first, both marker directions,
      quest-log-order batch deltas, and both capacity-model halves.
      All mutation-proven (9 session probes + the lanes' 12).
    - MERGE RE-DERIVATIONS (for the next sync): IWorld 323 = 86 data +
      237 methods; language-fanout exemptions 10; hud.ts ceiling 19160
      (the release's map extraction LOWERED it); sim.ts 12436. The
      parity union pin at the bottom of world_api_parity auto-merged
      silently AGAIN (both sides claimed 322): the file's own NOTE
      predicted it; only suite runs decide.
    - Deploy note added: the sweep fallback's log line now carries the
      stack (no err.detail; locates a failed arm across its call
      sites). Phase 22's pre-enable audit gains R9 (the implied-consent
      panel affordance) beside the two dev-db classes.
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
  - Monitor endpoint (phase 19 dashboard view; shape as amended by the 03 QA
    round): GET /internal/woc-market/stuck, dashboardGate
    (DASHBOARD_INTERNAL_SECRET), admin envelope, parameter-free.
    data = WocStuckCustodyReadout: { asOfMs, unbookedClaims: { count,
    saturated, sample: [{ custodyRef, claimedAtMs, grantCharacterId,
    mailIntent }] }, stuckDelivering: { count, saturated, sample:
    [{ id, listingId, createdAtMs, updatedAtMs }] } (updatedAtMs is the
    class's age signal, createdAtMs is settlement provenance: render stuck
    age from updatedAtMs), undisposedListings: { count, saturated, sample:
    [{ id, resolution, updatedAtMs }] } }.
    Counts SATURATE at 1000 with the explicit saturated flag (count 1000
    means "1000 or more"); samples cap at 20; rows aged >= 10 min ON
    updated_at for BOTH the delivering class (stamped at the delivering
    claim, so a slow payment leg is not instantly "stuck") and the
    undisposed class; park rotation writes the dedicated sweep_parked_at
    column and NEVER the age columns (the 03 QA round's blocking find: the
    old rotation re-stamped updated_at faster than the stuck threshold, so
    a parked return could never surface). asOfMs is stamped per refresh:
    the cached read stale-serves through an outage, and the dashboard must
    render age from it. Served from a 30s cached read (single-flight,
    frozen object, deliberately non-busted; cold failures negative-cached
    5s). The 5-minute log beat prints only when something is stuck, warns
    once per failure streak AND once per staleness streak (age > 10x TTL),
    and runs even when WOC_MARKET_ENABLED=0; monitor stop() drains an
    in-flight beat before the pool closes.
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
    weaken it. Since the 03 QA round: a provable grant resume refreshes its
    pendingGrants stamp on every attempt (the proof is session identity plus
    nonce, not entry age, so sustained lock contention cannot expire a live
    retry into a park; an entry with NO attempts for 10 minutes still prunes
    and parks), and grantCopy has a fourth refusal, 'ambiguous' (the grant
    touched the live bags but the session state is unprovable), which PARKS
    instead of converting to mail. unclaimCustodyRef, clearCustodyGrantIntent,
    saveDeliveredCharacter and cancelOpenBidsForListing are GONE from the db
    seam; new members: custodyRefState, markCustodyMailIntent,
    markCustodyGrantIntent, saveDeliveredCharacterBooked (atomic fenced
    bags+booking, lock_timeout + heavy statement timeout, characters-row
    carve-out from the market lock order), finalizeDeliveredSettlement,
    deliveredUnclosedSettlementsPage, disposeSoldResidueListings,
    touchSettlementRow, stuckCustodyReadout.
  - Reconcile semantics (phase 21; as amended by the 03 QA round): deliverOne
    returns advanced|parked|skip|contended; parked rows rotate ONCE on
    sweep_parked_at at park time (batch order = COALESCE(sweep_parked_at,
    updated_at), shared verbatim with the two partial rotation indexes),
    back off in-process for 60s, and while backing off are EXCLUDED from the
    batch reads (deliveringSettlements / undisposedClosedListings take the
    caller's backed-off id set), so a standing parked set costs no batch
    slots and no per-pass writes; sweep_parked_at clears on the terminal
    transitions (finalize, dispose) so a recovered row cannot carry a stale
    rotation key. 'skip' (a hand-moved row, finalize 'stale' after custody
    booked) clears the parked entry and raises sweepError (it is invisible
    to every monitor class, so the log line is the only trace, and
    reopenListing could re-auction such a row: never hand-move settlement
    state). A contended finalize stops the batch and the pass claims nothing
    further (the check runs BEFORE claimDeliverableSettlements); contention
    is scoped per entry (the sweep pass owns one scope, the eager confirm
    entry mints its own), so a request-thread delivery can neither clobber
    a pass mid-flight nor inherit a stale verdict; the next pass retries.
    activateBid's 'contended' surfaces to the bond-confirm caller as
    standing:false pending:true (never "outbid": the bond is held and the
    next poll retries the activation). Delivery stats count rows
    ADVANCED with park EVENTS on the separate 'parked' stat; a slow pass
    (>1s) logs even at zero counts. finalizeDeliveredSettlement
    distinguishes 'finalized' from 'already_final' (re-runs neither
    re-count nor re-send the seller notice) and sets both lock_timeout and
    the heavy statement_timeout; after the listing lock it re-locks the
    open-bid set (buy-now finalize can race insertPendingBid), and
    activateBid maps 40P01/55P03 to a typed 'contended' the bond poll
    retries. The redriven beat runs once per minute over 500-listing id
    pages (partial index woc_market_listings_live_ids) but finalizes at
    most SWEEP_BATCH rows per beat (each costs a realm mail-book write on
    the shared serial writer); a truncated fetch resumes behind the last
    processed row, an exhausted cycle resets the cursor. Sold-undisposed
    residue converges in its own 'disposed' arm (same minute cadence, own
    error isolation, FOR UPDATE SKIP LOCKED); WITHOUT a standing sale row
    it parks forever (operator-only exit, on purpose). The seller sold
    notice is best-effort by decision: a crash between finalize and the
    notice loses it for good (item-free, sale durable, pinned by test);
    notice failures log under the 'deliver_notice' tag.
  - Lock order registry update: suspendListingIfSafe now pre-locks
    ('pending_bond','active','won') because its expiry CTE cancels a dead
    settlement's winner; finalizeDeliveredSettlement pre-locks the open set
    plus the winner, and (since the 03 QA round) RE-LOCKS the open set after
    taking the listing lock, because a buy-now finalize runs while the
    listing is still 'active' and insertPendingBid (listing-lock-first) can
    commit a new bid in the window between the pre-lock and the listing
    lock; a crossing activateBid surfaces as 40P01 and both sides retry
    typed ('contended' from finalize, and activateBid itself now maps
    40P01/55P03 to a typed 'contended' the bond poll retries instead of a
    raw arm failure). Both sides of the former suspend cycle are pinned by
    a live concurrency test in
    tests/woc_market_delivery_pg_integration.test.ts.
  - Ops caveats for the phase 22 runbook, appended to the 02 list: BEFORE
    upgrading a realm that ever ran the market, verify
    `SELECT count(*) FROM woc_market_custody_claims WHERE booked_at IS NULL`
    is zero (legacy NULL intents are UNKNOWN, not "no attempt": the new
    binary parks them, which is safe but each parked row is a delivery an
    operator must finish). BEFORE a binary ROLLBACK, drain
    `SELECT custody_ref FROM woc_market_custody_claims WHERE booked_at IS
    NULL AND grant_character_id IS NOT NULL` to zero: the OLD binary adopts
    any bare claim as booked and completes the sale with nothing delivered.
    NEVER delete an unbooked claim row to unstick a delivery: the next pass
    mints a FRESH claim that skips the parcel-in-book gate by construction,
    re-arming the duplication (warning written at the DDL); resolve parked
    rows by hand-delivering then stamping booked_at, or by confirming
    non-delivery first, and the phase 22 runbook owes the step-by-step
    re-drive procedure for each parked class. The permanent-park classes:
    crash-before-blob-persist and a deterministic parcel refusal (mail rail,
    hand-delivery is the fix once non-delivery is confirmed), plus the GRANT
    classes (non-null grant_character_id: an ambiguous grant refusal, a
    lease fence, or a dead session), where the item may ALREADY be in the
    buyer's bags and hand-delivering without checking mints the dupe:
    confirm the buyer does NOT hold the item first. Do not overlap the
    market-enable rollout with a rolling restart: boot DDL holds
    AccessExclusive on woc_market_custody_claims, woc_market_settlements,
    and woc_market_listings (the sweep_parked_at ALTERs) for the whole
    schema transaction, so realm B's boot blocks realm A's market writes
    for its duration. During a mixed-fleet window the OLD binary also loses
    woc_market_settlements_state_created (the new boot drops it), so its
    readout sample sorts the delivering set unindexed: diagnostic-only and
    transient, but expect that read to be slower until the fleet converges.
    onSweepError logs raw pg errors
    (detail/where can echo character names and item JSON; fine today, but
    revisit before any account or wallet column joins those rows). The
    EXPLAIN list for phases 16/17 gains: the redrive page probe
    (listing_id = ANY page, now behind woc_market_listings_live_ids), the
    three readout sample+capped-count pairs, the two COALESCE rotation-order
    batch reads against their partial indexes, and the
    disposeSoldResidueListings subquery (now behind
    woc_market_listings_sold_undisposed). Claims-table retention (phase 17):
    booked rows are prune-eligible provenance; unbooked rows are the
    operator queue and MUST NOT be pruned; the listings prune leaves booked
    claim rows behind (no FK), so age booked rows on booked_at, never on
    referent. Release-merge premises recorded by the 03 QA sync audit:
    steady per-realm DB connections are now 13, not 10 (the chat-quota
    feature's dedicated 2-client pool + 1 LISTEN connection; phase 16/22
    capacity math must count them); the repo now has its first pg
    LISTEN/NOTIFY exemplar (createGeneralChatQuotaListener) and a second
    dedicated-Pool idiom, relevant to phases 16/19/22 (advisory-lock
    namespaces verified disjoint); the quota admin write locks the accounts
    row FOR NO KEY UPDATE and can contend briefly with escrowInsertListing's
    FOR UPDATE (no deadlock cycle; phase 22 lock-registry note); phase 14
    must NOT scope-creep into the release's quota admin-envelope English
    (release-side domain, not packet debt).
- 04 bond-payment-lifecycle (2026-08-12, session start 3f20375918, LOCAL, not
  pushed per R4): H4, H15, the anti-snipe unpaid-bid medium, ruling R8 (both
  arms), and the 02 clearBuyNowLock handoff closed. The registry later
  sessions need:
  - Signature-first intake, BOTH legs: confirmBond and confirmSettlement
    record the submitted signature BEFORE any expiry verdict; the quote_expired
    refusal no longer exists on either intake (the chain's verdict decides,
    surfaced as confirm_failed when it refuses; the code stays registered).
    A decided-against bond keeps its signature as the ledger trace until the
    poll lapses it; the recorded signature blocks refresh and abandon with the
    new 409 `woc_market.confirm_in_flight` (catalog leaf + five non-Latin
    fills). setBidBondQuote is a CAS (pending_bond AND bond_signature IS NULL,
    returns boolean); abandonPendingBid adds the same signature arm. Since
    the 04 QA round: both intake routes shape-check the signature
    (signatureField, safe printable characters only, length 256; control
    characters were a log-forging vector); refreshBondQuote refuses
    quote_expired when the quote would OUTLIVE the seat (now + quote TTL
    past placed_at + pending TTL: a straddling quote invited a broadcast
    whose signature arrived against a lapsed bid where nothing records it,
    the residual now being only the sweep-cadence boundary race); a
    confirm whose activation the POLL won answers standing from the row's
    REAL status (activateBid 'not_pending' re-read, never a false
    "outbid"); and a recorded-signature retry against a review-parked
    settlement answers the state (review joined the outcome arm;
    not_active read as "purchase gone" for money under review). From the
    verification round: a SECOND, DIFFERENT signature against a signed
    pending bid refuses confirm_in_flight on both legs (was not_pending /
    not_active, a false dead-row verdict; the second string has no ledger
    slot by design, the reference-scoped service verdict is the double-spend
    backstop); a SAME-signature retry on a confirming settlement re-asks the
    chain instead of refusing, skipping the recording write so the retry
    never re-stamps updated_at (the H15 age axis); a revived failed row's
    replaced signature is logged (dev channel) since the new recording
    overwrites it (the refusal survives on fail_reason and in the service
    ledger); lapseBid gained AND bond_state = 'pending' and returns whether
    it lapsed, so a reorg-flipped verdict can never void a HELD bond into a
    state no refund arm reads, and the poll PARKS the held survivor
    (rotation + backoff, visible via stuckBonds) instead of letting it
    re-own the batch head every pass; and a retry of the signature that
    already SUCCEEDED answers the outcome, not a refusal, on both legs
    (bond: standing for active/won, not standing for outbid, no re-drive,
    no churn; settlement: the current state for
    confirmed/delivering/delivered, no second sale; a 'failed'
    same-signature retry still refuses, the revival owns it).
  - Paid-but-undecided carve-out: the suspend and finalize bid teardowns skip
    (status pending_bond AND bond_signature IS NOT NULL AND bond_state
    'pending') rows; such a bid stays in confirmingBonds until the chain
    decides, and a settled verdict against a closed listing routes the held
    bond to refund_due through activateBid's supersede arm. The overdue
    default arm's markBidStatus('defaulted') call now passes a ['won'] CAS
    (the optional from parameter itself predates this work).
  - H15 knob and state: WOC_MARKET_CONFIRMING_REVIEW_HOURS (env, default 6,
    empty/non-positive falls back; cfg.confirmingReviewMs via
    wocMarketConfig(); documented in .env.example; the parse cases incl. the
    fail-dangerous empty string are pinned in
    tests/server/woc_market_routes.test.ts, not the config suite). Since the 04 QA round the H15
    park is the sweep's OWN 'reviewed' arm with its own SWEEP_BATCH budget
    (confirmingOverdueSettlements, aged on updated_at, which nothing
    re-stamps while the poll returns undecided; ordered-index pushdown on
    woc_market_settlements_state_updated): sharing the overdue batch let a
    confirming backlog own the batch head and starve the offered/failed
    expiry work, and the split RESOLVES the recorded 16/17 UNION ALL item.
    overdueSettlements is single-arm again (offered/failed on deadline_at).
    The knob CLAMPS at 720 hours with a one-time first-read warn (the QA
    judgment superseding the no-upper-clamp posture: a huge value silently
    disabled the park and could 22008 the arm), and the lapse-straddle
    refresh refusal is the typed woc_market.bond_window_closed (409,
    catalog leaf + five non-Latin fills; REFUSAL_ERRORS is 48 rows). The sweep parks over-bound
    rows in the NEW settlement state 'review' (fail_reason
    confirming_overdue) with NO default/forfeit/strike/cascade. 'review' is OPEN: it rides the renamed
    unique index woc_market_settlements_open2 (six states; the old _open is
    dropped AFTER open2 exists; the repair gate and carcass drop retarget to
    open2; predicate text shared via OPEN_SETTLEMENT_STATES_SQL, the fake's
    OPEN_SETTLEMENT_STATES mirrors it), blocks reopen/suspend/cancel/insert,
    and exits the polling set. The state CHECK constraint evolves in place
    (gated DROP+ADD NOT VALID per the house pattern, once per legacy
    database; standing values are valid by construction, and the gate's
    retarget to open2 re-runs the dedupe repair scan exactly once more on
    databases that carried the _open generation). Operator resolution arms
    (phases 09/19/21): transitionSettlement review -> confirmed (paid,
    delivery resumes) or review -> failed (unpaid, the overdue default pass
    takes over); semantics documented at the /internal/woc-market/stuck route.
    The client renders 'review' as hudChrome.wocMarket.settlementReview
    ("Payment under review", five fills).
  - Readout (phase 19 consumes): WocStuckCustodyClasses gained
    reviewSettlements { count, saturated, sample: [{id, listingId,
    createdAtMs, updatedAtMs}] } (no age filter) and stuckBonds { count,
    saturated, sample: [{id, listingId, account, placedAtMs}] } (aged on the
    same confirming bound; since the verification round the age AXIS is
    COALESCE(bond_signature_at, placed_at), the poll park's own axis, so the
    readout reports on the mechanism it describes, and the sample carries
    stuckSinceMs (render stuck age from IT; placedAtMs stays as placement
    provenance); main.ts wires bondStuckAgeMs from the knob; since the 04
    QA round the sample ORDERS on the indexed placed_at, never the
    unindexed COALESCE, whose top-N sort scaled with the whole signed
    pending set exactly during the incident the readout reports).
    stuckCustodyReadout now takes bondOlderThanMs; the log beat counts both
    new classes. Bonds have NO automatic time-based exit (a refund_due on a
    never-landed payment would pay out through today's blind releaser, B3);
    the exit paths are the chain deciding or operator resolution, and the
    stuckBonds class is the visibility bound. Phases 09/10 (releaser CAS,
    verifier timeout per R5) own the automatic exit. The POLL COST is
    bounded separately (the db round): a bond still undecided past the
    5-minute pending TTL rotates to the poll tail (poll_parked_at, the new
    rotation column and partial index; confirmingBonds orders on
    COALESCE(poll_parked_at, placed_at) and takes the caller's backoff
    exclusion), so a standing never-decided set cannot occupy the batch
    head; young confirming bonds keep the full 5s cadence. The park AGES ON
    THE SIGNATURE RECORDING (bond_signature_at, stamped by
    submitBondSignature with the caller's clock, first recording wins;
    legacy rows fall back to placed_at), on its own tunable
    (WOC_MARKET_BOND_POLL_PARK_SECONDS, a rules CONSTANT, not an env knob;
    its value coincides with the pending TTL, so the rules suite also pins
    the constant identity at the comparison site): placement age says nothing about
    how long the chain has had the transfer, and a bidder signing late in
    their window must not be parked seconds after submitting. After a
    restart the in-process backoff is empty but the rotation stamps persist,
    so the first pass re-polls parked rows once and re-parks them. The
    anti-snipe extension anchors on the SAME submission moment (captured
    before the chain round trip: anchoring after it drifted with RPC
    latency and a slow confirm could null the settled arm's own extension).
  - Anti-snipe: insertPendingBid no longer extends (extendEndsToMs param
    GONE from the db seam and the fake); the one extension point is
    extendAuctionForBondProgress (listing-lock-only carve-out, best-effort:
    contended loses only the extension, never the recorded signature), fired
    by confirmBond AFTER the chain verdict and only when it is settled or
    pending, and never on the proxy's pending+service_unavailable outage arm
    (the security round: extending on the raw submission let a fabricated
    string move the clock; a refused verdict extends nothing; on settled the
    extension runs BEFORE activation so a last-seconds verdict is not read
    as past the close). Anchors are SPLIT BY ARM (the verification round,
    two passes): the PENDING arm anchors on the FIRST recording moment
    (bond_signature_at, which submitBondSignature RETURNS; a legacy no-stamp
    row falls back to placed_at even on resubmit), because a fresh-clock
    anchor per resubmit let one pending-forever signature re-post its way
    (rate limit 60/min) to holding the close at now plus the extension
    continuously to the cap; the SETTLED arm anchors on the verdict moment
    (the paid-bond extension the window always granted; repeating it needs
    repeated contended activations of a REAL payment, which the cap
    bounds). Cap math unchanged
    (antiSnipeExtendedEndMs). BEHAVIOR NOTE for phase 14 copy: a PENDING
    signature first recorded outside the window cannot extend on re-posts,
    and a signature
    bond routes to refund_due via the supersede arm (money-safe; the old
    "an in-flight confirmation can never land after a close" guarantee is
    deliberately gone). Residual, service-contract-dependent: if the economy
    reports a fabricated signature as pending, the extension still fires
    ONCE; phase 10 (R5 verifier semantics) owns closing that.
  - R8 arm one (numbers PROPOSED here, QA re-judges): per-listing re-claim
    cooldown WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS = 1800; account cap
    WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR = 3 per rolling
    WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS = 3600 (rules constants).
    Ledger table woc_market_buy_now_abandons (FKs to listings/accounts,
    UNIQUE (listing_id, account, lock_expires) as the window dedupe key;
    lock_expires IS the abandon moment, app clock). TWO recorders, deduped on
    the window key: the overdue sweep's public buy-now arm (canonical,
    records BEFORE the holder-guarded clear) and claimBuyNowLock's steal arm
    (closes the crash-window gap between the sweep's recording and its lock
    clear; the immediate self-steal is closed by the open-settlement probe
    below). Directed listings record nothing and are exempt from both guards
    (they keep the strike). claimBuyNowLock diagnoses every
    refusal class from a LOCK-FREE advisory read (the db round: refusing
    under FOR UPDATE serialized every hopeful behind the holder at a
    measured hundredfold amplification); since the 04 QA round the cooldown
    probes run in the advisory pass TOO (committed ledger rows cannot
    un-cool inside any cooldown window, so a cooled-down account's retries
    never take the listing lock; proven lock-free by a pg pin racing a
    held row lock); only the self-steal, whose abandon row is minted
    inside the transaction, pays the guard transaction,
    and every advisory answer is re-run authoritatively under the lock
    (typed refusals cancel_pending / claim_cooldown / contended; old
    diagnosis order kept). An OPEN settlement refuses the claim as 'locked' BEFORE any
    recording (a buy-now listing stays 'active' through confirming and
    delivery, so a rival's probe must never stamp a PAYING holder). BOTH
    recorders run ONE shared statement (RECORD_ABANDON_SQL, exempt list as a
    BOUND parameter) whose exempt predicate refuses a window only for a
    refusal class that is NOT mintable on demand:
    WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS = service_unavailable ONLY. The
    round-2 security re-review removed the bare-signature exemption (one
    fabricated request bypassed the arm); round 3 removed quote_expired too
    (attacker-mintable: wait out the 90s TTL, post any string, the
    signature-first intake records it and the service answers
    quote_expired). Cost accepted: a genuinely late honest buyer eats ONE
    recoverable abandon row. The failed-row expiry PRESERVES fail_reason
    (offered rows still stamp window_elapsed): ops note, an
    expired-from-failed row reads its refusal reason, not window_elapsed.
    The exempt string is a wire-shaped coupling with the service's reason
    vocabulary (pinned against the proxy); R5/phase 10 note, now THREE
    dependents: bond residency, the extension gate, and restoring any
    late-payment exemption, which is UNSOUND until a verdict can distinguish
    a real transfer from a posted string. The new guard
    transactions bound idle-in-transaction holds (GUARD_IDLE_TX_TIMEOUT_MS,
    equal to ESCROW_LOCK_TIMEOUT_MS at 2000ms since the 04 QA round: 500ms
    was four times tighter than the lock-wait tolerance with no
    measurement behind it, and a false fire discards a pool client),
    and the verification round extended the bound to cancelListingIfUnbid,
    which this work grew two round trips inside its lock window (the older
    untouched guards still ride the phase 16 retrofit);
    25P03 arrives ASYNCHRONOUSLY (the session is terminated, the SQLSTATE
    lands on the client error event or the next query depending on stall
    shape, both measured), so withTx captures the async error, prefers
    whichever error carries a code, and DISCARDS the dead client; the typed
    'contended' is pinned by a real stall test. Retention: pruneWocBuyNowAbandonsBatch
    registered in the nightly sweep, WOC_MARKET_ABANDONS_RETENTION_DAYS
    (default 30, .env.example).
  - R8 arm two: cancel_requested_at on listings (additive; partial index
    woc_market_listings_cancel_rotation, the round-three rename; the paid
    probe reads the shared PAID_SETTLEMENT_STATES_SQL, OPEN minus
    'offered', pinned to the open list). cancelListingIfUnbid on an unexpired
    lock: a PAID window (any settlement past 'offered') still refuses
    settlement_live; an unpaid one stamps and returns 'cancel_pending', which
    the service maps to { ok: true, cancelPending: true } (route sends
    cancelPending, SDK forwards it, the window toasts
    hudChrome.wocMarket.listingCancelPending). From the stamp: claimBuyNowLock
    AND insertPendingBid refuse 'cancel_pending' (bids blocked too, to keep
    the one-window bound; interpretation recorded for QA). The sweep's new
    'cancelClosed' arm (after the expiry arm, so the overdue arm records the
    abandon first) converges stamped, window-ended listings through
    closeCancelPendingListing (same guards as the seller cancel; 'failed'
    expiry only, and an open settlement ABORTS via TxAbort so the
    speculative failed-expiry rolls back, the sibling cancel's shape) and
    flies the item home; a PAID window proceeds to settlement and finalize
    closes it sold (the stamp dies with the closed row). A converge 'skip'
    PARKS (touchListingRow rotation on sweep_parked_at, 60s in-process
    backoff, excluded from cancelPendingListings via its excludeIds), so a
    paid window sitting unresolved for operator-scale time costs no batch
    slots; the cancel-pending partial index rides the shared rotation
    expression. clearBuyNowLock(id, holderAccount) is holder-guarded
    everywhere (the four buyNow unwinds pass the claimer, the sweep passes
    the settlement buyer).
  - New error codes (all 409, catalog leaves + five non-Latin fills each):
    woc_market.confirm_in_flight, woc_market.cancel_pending,
    woc_market.claim_cooldown. confirm_in_flight's copy is LEG-NEUTRAL
    ("Your payment is still confirming."): the settlement leg answers it
    too since the verification round, so bond-specific wording lied there
    (the reword refreshed the five non-Latin fills in the same change). Snapshots updated (error_codes.test.ts,
    api_error_code_parity.test.ts); REFUSAL_ERRORS is 48 rows since the 04
    QA round added woc_market.bond_window_closed.
  - Tests: new real-SQL suite tests/woc_market_bond_pg_integration.test.ts
    (34 tests after the 04 QA round; its rig is the third copy, the
    pg-harness extraction still rides phase 20); settlement suite retargeted
    to open2 and cancel-intent; service suite has DB-free arms for the
    review park, the claim cooldown, the tried-buyer skip, the recorder
    dedupe and the converge park (the CI floor); the structural floor pins
    the teardown carve-outs, the bond/lock statements, both prunes and the
    new DDL. Seventeen mutation spot-proofs bit post-commit (eight on the
    implement round, six on the review-fix round, three on the round-three
    residuals), and a follow-up verification session independently re-ran
    three headline mutations (park axis to placement, holderless clear,
    confirming arm dropped) at the final tip: each bit its named tests with
    the suites provably running.
  - Migration-safety verdict (verified live vs Postgres 16, no critical or
    warning): all DDL additive/idempotent; the 'review' CHECK evolves NOT
    VALID once per legacy DB (constraint name woc_market_settlements_state_check
    confirmed auto-named and under the 63-byte limit); the open->open2 swap
    never gaps uniqueness (single boot transaction, superset predicate); the
    _cancel_rotation rename converges from all three historical shapes
    (reproduced the in-place-redefinition failure and the fix); every new
    predicate index-covered; the exempt-list parameterization closed the one
    runtime interpolation. TWO actionable INFOs folded to owners: (a) the
    overdueSettlements OR arm's pushdown loss (RESOLVED by the 04 QA round:
    the confirming park is its own read and arm now, both arms index-served). (b)
    ROLLBACK runbook (phase 22): an OLD binary against the new schema fails
    CLOSED but strands 'review' rows (no transition path; a second settlement
    takes a raw 23505 from open2, safe-direction no-double-sell, surfaces as
    internal.error until re-upgrade) and resumes taking lock claims/bids on a
    cancel_requested_at listing (nothing destroyed). Standing constraints
    restated: the boot repair is unbatched (safe only pre-enable-empty; the
    first populated-table repair must batch), and the widened CHECK stays
    convalidated=false on legacy DBs (cosmetic; an operator may VALIDATE
    CONSTRAINT out of band).
  - Handoffs: phase 06 (directed rail) inherits the cancel-intent seams and
    the directed exemptions; phase 09 executes review/stuck-bond resolutions
    (releaser CAS is the prerequisite for ANY automatic bond exit, and the
    held-bond reorg carve-out in lapseBid means a held+refused row waits for
    phase 09 tooling or an operator); phases
    16/17 EXPLAIN list gains the two new
    readout classes and the claimBuyNowLock ledger reads (the
    overdueSettlements OR-arm item is RESOLVED: the 04 QA round split the
    confirming park into its own read, restoring pushdown for both arms); the abandons FK
    adds a non-cyclic blocking edge (a claim can briefly wait on the previous
    abandoner's accounts row when that account is in escrowInsertListing;
    bounded by lock_timeout, phase 16/22 lock-registry note); phase 12 owns
    the env docs sweep (the two new knobs are already in .env.example; note
    WOC_MARKET_CONFIRMING_REVIEW_HOURS has no upper clamp, so a huge value
    silently disables the H15 park and the stuckBonds class, a posture the
    QA session should judge); phase 21
    exercises review resolution end to end; phase 22 runbook owes the
    review-state operator procedure (verify on chain, then the transition).
    Added by the 04 QA round: phase 13 opens with the ITEM-LOCK question
    (the release's player item lock gates salvage/craft/vendor only; the
    $WOC listing path deliberately matches the gold market and does not
    consult it, and whether a locked copy should refuse exchange listing
    is Fernando's call; a locked copy sold on EITHER market today arrives
    at its buyer still wearing the seller's mark); phase 14 copy list
    gains the quote_expired leaf now also answering the lapse-straddle
    refresh refusal (no fresh quote will come, the copy says to request
    one); phase 16 owes the p99.9 inter-statement event-loop gap
    measurement behind the 2000ms idle bound and the at-scale
    advisory-cooldown concurrency proof; phase 20 owes standing planner
    assertions for the two rotation indexes; phase 22 runbook gains two
    lines, never disable WOC_MARKET_ENABLED while payments are in flight
    (both intakes refuse before recording and the sweep freezes recorded
    rows), and the boot dedupe can demote a 'review' loser to failed only
    when open2 never built (edge, safe-direction, reconcile by hand).
- 05 custody-entry-hardening (2026-08-13, session start f07ca88278 = the
  trivial release sync merge, LOCAL, not pushed per R4): H5, H6, and the
  coordinator-drift medium closed. The registry later sessions need:
  - THE ESCROW FIFO (H5): createListing's whole custody critical section
    (extract, authoritative re-check, escrowInsertListing, compensation)
    runs as ONE job on GameServer's per-character save queue
    (WocMarketCustody.runSerialized over GameServer.enqueueCharacterWrite;
    the keyed FIFO itself is serial_writer.ts createKeyedSerialWriter, and
    the weapon-skin/hotbar queues plus the market depth-warn wrapper now
    ride the same module). Commit order is enqueue order across ALL of a
    character's writers, so a stale pre-extraction autosave always commits
    BEFORE the escrow write and can never resurrect an escrowed item.
    Ownership resolves BEFORE the job (ownsLiveCharacter, zero side
    effects: a foreign character id must never occupy the victim's escrow
    slot or force their guild-book flush). The job is depth-capped at ONE
    per character and deadline-bounded (ESCROW_QUEUE_WAIT_MS 5s, covering
    the guild-book flush; a cancelled job has extracted nothing; a job
    that STARTED answers its real outcome, never contended; waits past
    ESCROW_QUEUE_WARN_MS 2s warn, throttled 30s). Dirty guild books flush
    atomically FIRST and an in-job re-check refuses 'contended' (a
    character row must never carry book-paired deltas without its book
    half). Every custody blob (extract, grant, snapshot) serializes
    through GameServer.serializeCharacterForPersist: the session save
    fixups ride every durable write (a raw sim.serializeCharacter was a
    jail escape; character_save_fixups.ts owns the rationale, extracted
    from saveCharacter). wocCustodySession refuses left AND quarantined
    sessions for every custody op. QA amendments: the warn threshold and
    its throttle are injectable (createWocMarketCustody opts) and
    ESCROW_QUEUE_WARN_THROTTLE_MS (30s) is exported and ladder-pinned;
    kickSession sends its SECOND argument on the wire, so both escrow
    terminal arms send the matcher-covered 'character taken over' literal
    with the cause in the leave reason (the implement round had them
    swapped); the depth-cap slot follows the WORK settling (now pinned);
    saveCharacter's post-commit steps (lastSave, deed publish, level
    feed) deliberately do not run on the escrow write and catch up one
    ordinary save later.
  - COMPENSATION SPLIT ON PROOF: server/pg_rollback_proof.ts
    throwProvedRollback is an ALLOWLIST of proven-abort SQLSTATE classes
    (22/23/25/40/42/53/54/55 + 57014); Node errnos (EPIPE et al, five
    uppercase chars) and connection-class codes classify AMBIGUOUS. QA
    amendments: TxNeverStarted also tags a BEGIN failure (a stale pooled
    socket fails there, not at connect, in the same correlated volume;
    nothing can commit before BEGIN returns; the tag skips withTx's
    code-preference and the client is discarded), and the preference
    helper is null-safe (a codeless failure used to be REPLACED by a
    TypeError dereferencing the null asyncErr: evidence destroyed,
    classification unchanged; the pin asserts the original message
    survives). withTx DISCARDS the client on ANY codeless failure (the
    db-perf P1: a COMMIT at the 65s driver backstop rejects codeless
    with its response outstanding, and a best-effort ROLLBACK can
    consume that stale reply, so a "returned" client would answer the
    next borrower with it; coded failures with a landed rollback stay
    poolable, both arms pinned). restoreCopy's premise is restated truthfully: quarantined
    sessions never reach it because BOTH quarantine arms are terminal.
    restoreInto stays deliberately uncapped (compensation must never be
    refusable; overfill beats losing the only copy). A
    proven-rollback throw or typed refusal restores via
    restoreCopy(pid, characterId, slot): into the LIVE bags while the
    extraction pid's player entity exists (every teardown flush queues
    BEHIND the job, so the restored copy rides it to durability), by
    return parcel only once the player is gone. lease_lost ALSO fires
    escrowSessionLost('fenced') (kick, saveCharacter's own displaced-
    zombie signal). An AMBIGUOUS throw restores NOTHING and fires
    escrowSessionLost('ambiguous'): quarantine + kick, so the session
    reloads from the durable row, which is correct in BOTH branches of an
    unknown COMMIT (committed: item-free blob + listing; rolled back: the
    item still in the bags); the full extracted slot is logged
    (escrow_outcome_unknown) for the operator.
  - escrowInsertListing: workload-scoped ESCROW_STATEMENT_TIMEOUT_MS (5s,
    exported + ladder-pinned in tunables; measured p50 3.5ms / max 8.3ms
    on a 27KB blob, re-measured and asserted by the delivery pg suite's
    escrow-cost test), the idle-in-transaction bound, and 55P03/40P01/
    25P03 mapped to the typed 'contended' (return union widened; the
    service restores and answers woc_market.contended). ESCROW_LOCK_
    TIMEOUT_MS and GUARD_IDLE_TX_TIMEOUT_MS are now exported and
    literal-pinned. QA amendment, the honest occupancy ceiling: the 5s
    allowance bounds the FOUR workload statements (the tunables relation
    pins exactly those plus the lock wait and pool checkout, scraping
    AUTOSAVE_SECONDS from source); BEGIN and the installing SET LOCAL
    ride the 15s session default and COMMIT the 65s driver backstop, so a
    wedged transaction CAN exceed one autosave interval (the wait
    deadline and depth cap bound the player-facing impact; the tail rides
    16 with the guild-flush 60s term).
  - RECORDED CARVE-OUT: commitGrant (the delivery twin) deliberately does
    NOT ride the FIFO yet: its stale-autosave direction is buyer item
    LOSS, operator-recoverable through the claims-ledger park subset, and
    FIFO-routing sweep grants needs a head-of-line bound first. Recorded
    at the method, source-pinned (exactly one runSerialized call site in
    the service; no enqueueCharacterWrite reference; the pin now ALSO
    sweeps the sweep and monitor siblings). QA judgment: STANDS as
    follow-up, owner 16, SEQUENCED after the honest occupancy bound
    (closing it first would import the unbounded hold into the sweep) and
    gated on the park subset staying intact.
  - H6: exchangeHardLock consumes the shared per-copy transfer-lock
    predicate, so the woc rail refuses exactly what the gold market,
    mail, and guild bank refuse; the ARMED state reports its own
    'bind_armed' reason (joins the woc_market.not_eligible wire group,
    REFUSAL_ERRORS is 49 rows; no new catalog leaf). The predicate body
    moved to the dependency-free src/sim/transfer_lock.ts leaf
    (item_instance_transfer re-exports it; exchange_eligibility keeps an
    empty runtime import graph). Both client pre-filters (Sell picker,
    trade-window exchange arm) inherit the refusal SILENTLY (no per-lock
    copy exists; phases 14/15 own explanatory copy if wanted). An
    unbind returns a commission piece to the ARMED state, covered.
  - EXTRACTION: src/sim/broker_custody.ts (extractTradableCopyImpl with
    the mount-dismount arm, grantTradableCopyImpl on the one-call
    canGrantCopies/grantCopies pair; thin same-named Sim delegates stay
    for the server bridge; grantTradableCopy finally has tests incl. the
    #2139 per-dimension refusals and a zero-rng pin with positive
    control). src/sim/daily_rewards_stub.ts holds the offline
    daily-rewards readout (value-pinned by its own suite). Monolith
    ceilings: sim.ts ratcheted 12660 -> 12428 exact; game.ts HELD at its
    exact pre-existing 10859 (the FIFO/fixups/depth-warn extractions paid
    line for line for the new host members).
  - FIREWALL: FIREWALL_ALLOWED is exactly ['src/sim/daily_rewards_stub.ts']
    with an existence + pattern-hit + read-only-projection shape pin (one
    export function, no control flow, type-only imports); sim.ts,
    types.ts, holder_tier.ts are fully scanned. The pattern set is
    calibrated against the REAL server corpus: lamports, base58, bs58,
    keypair, secret/private key, blockhash, spl-token, send/sign
    transaction, woc-amount shapes, money-affixed signature compounds
    (tx/txn/bond/settlement/burn/transfer/der/escrow/payer/seller/mint +
    signature_reused/required/field/header/verified/atMs/bytes), treasury
    suffixes + base/cut/fee/account. Bare 'signature' and 'token' stay
    out (49 measured content false positives; riftToken/chatTokens).
    QA amendments: non-vacuity floor 460 of the real 475 files (the
    recorded 474 was wrong at write time); FIREWALL_ALLOWED membership
    pinned exactly; the projection shape pin refuses re-exports,
    generator exports, enum/interface/default, dynamic import, try, and
    the logical operators, each with a named offender case; every
    pattern alternative has a positive control; the compound arms'
    missing LEFT boundary is documented as deliberate over-match.
  - OBSERVABILITY: the wocEscrowQueue counter (game-signals seam, kinds
    started / deadline_refused / depth_refused / books_dirty_refused /
    flush_failed, zero-backfilled) plus a 30s-throttled realm-global
    queue-wait warn. A checkout-failed OR begin-failed transaction is
    tagged TxNeverStarted (exported from woc_market_db, import-pinned)
    and maps to 'contended' on the escrow write ONLY. QA amendment: the
    counter is fully pinned (name literal, closed vocabulary both
    directions, zero pre-registration, per-kind increment per refusal
    arm, never-throws).
  - Handoffs: phase 06 opens with TWO directed-rail judgments: (a) the
    acceptDirectedOffer throw-arm residual, now THREE-legged since the
    ambiguous park arm (offer stuck 'accepted' with no listing, the
    seller quarantined and kicked, the copy parked out of the bags; the
    acceptance predates the park arm, so re-judge the acceptance itself);
    (b) whether directed delivery should stamp boundTo on hand-off and
    inherit the trade-window named-recipient exception (today a
    commission piece passes the gold trade window but is refused by the
    $WOC arm beside it; refusing is the safe direction, recorded at
    exchange_eligibility.ts). Phase 16 owns the escrow-queue additions
    from the hot-path round (the guild-book flush still rides the 60s
    logout allowance inside the deadline, the dominant occupancy term; a
    pendingKeys FIFO gauge; widening TxNeverStarted -> contended to the
    other guards, commitGrant's park arm now explicitly included; a
    completed/terminal sibling kind for the wocEscrowQueue counter; the
    per-listing serialize cost attribution; the gold-World-Market
    straddle: the escrow write persists the character row alone, the
    same crash window the 30s autosave has, pre-existing realm-wide;
    from the db-perf close-out: a realm-global escrow in-flight
    semaphore, a contention-class label on the 'contended' path, a
    draining refusal on createListing, and the FOR NO KEY UPDATE
    narrowing of the accounts lock)
    plus the saveAll-wave suppression measurement; phase 22's pre-enable
    audit gains one line (scan standing listings' item payloads for
    bindOnTrade-armed copies that entered before H6). The 04 ledger's
    "REFUSAL_ERRORS is 48 rows" is superseded: 49 since bind_armed.
    Accepted without code change (QA round; do not re-raise): the FIFO
    self-deadlock rule stays comment-enforced (a runtime guard would
    false-positive the sanctioned void-kick-from-job pattern); the
    escrow write skips saveCharacter's post-commit steps by design; the
    guild-bank deficit ladder is reachable at listing rate
    (self-inflicted only); architecture.test.ts's hand-rolled walker is
    pre-existing repo-wide debt.
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
