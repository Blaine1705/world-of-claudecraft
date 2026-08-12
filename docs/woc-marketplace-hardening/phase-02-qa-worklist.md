# Phase 02 QA: consolidated findings worklist (working file)

Session checkpoint for the phase-02 QA fix round. If this session restarts, resume HERE:
worktree `/Users/fernando/Documents/wocc-marketplace`, branch `feature/woc-marketplace`.
Delete this file in the final docs commit once progress.md/state.md carry the outcome.

## State at checkpoint

- Release sync DONE: merge b40a178643 (release/v0.37.0), one generated-i18n conflict
  resolved by regeneration (i18n:gen). Merge audit (6 lanes) DONE: all clean except
  hud.ts over its zero-headroom ceiling; FIXED by extraction commit a8b99bc6f1
  (src/ui/preview_prewarm_wiring.ts + tests/preview_prewarm_wiring.test.ts, ceiling
  lowered 19347 to 19342). rift_forge_gate.test.ts db mock widened to the canonical
  shape (uncommitted).
- Validation baseline at b40a178643, all green: pg suite 27/27 (TEST_DATABASE_URL from
  the MAIN checkout's .env, worktree has none:
  `TEST_DATABASE_URL="postgres://eastbrook:$(grep '^POSTGRES_PASSWORD=' /Users/fernando/Documents/world-of-claudecraft/.env | cut -d= -f2-)@127.0.0.1:5433/eastbrook" npx vitest run tests/woc_market_settlement_pg_integration.test.ts`),
  marketplace suites 210, S3 guard, tsc, ci:changed. DDL apply-twice probe clean
  (second and third applies no-op, data hashes unchanged); fresh-boot dump: both new
  indexes present with correct predicates, stale woc_market_settlements_live absent.
- Seven QA lanes delivered (coverage, security, migration, dbperf, fake-fidelity,
  correctness, cleanup). Two races REPRODUCED empirically: (1) insertSettlement's
  INSERT..SELECT snapshot lets a settlement land on a listing a concurrent
  suspend/cancel just closed (proved via raw SQL: settlement committed onto a closed
  listing); (2) activateBid's third lock (previous current bid, taken after the
  listing) deadlocks 40P01 against suspend's ordered bid scan.

## Fix round: production changes (server/woc_market_db.ts unless said)

1. insertSettlement: SET LOCAL lock_timeout (ESCROW_LOCK_TIMEOUT_MS); after the winner
   stamp take `SELECT status FROM woc_market_listings WHERE id = $1 FOR UPDATE`;
   missing row -> TxAbort 'live_settlement_exists' (historical conflation), closed ->
   TxAbort 'listing_closed'; keep the INSERT's status <> 'closed' belt; drop the
   post-hoc peek. Winner stamp: new optional winnerFrom param (default
   ['active','outbid']); stamp-CAS failure returns NEW distinct 'winner_gone' (not
   live_settlement_exists). catch: 23505 -> 'live_settlement_exists'; 55P03/40P01 ->
   NEW 'contended'.
2. activateBid: pre-lock the open bid set (SELECT id ... status IN
   ('pending_bond','active') ORDER BY id FOR UPDATE) resolved from an unlocked
   listing_id peek, BEFORE the listing lock; then re-read own bid FOR UPDATE.
3. cancelListingIfUnbid + suspendListingIfSafe: wrap withTx, catch 55P03/40P01 ->
   'contended' (their comments promise a retryable error; today it 500s).
   cancel gains the unwritten-invariant comment (listing-first is safe only while
   cancel takes no bid row locks).
4. suspendListingIfSafe: do NOT expire an 'offered' row whose quote is live
   (quote_reference IS NOT NULL AND quote_expires > to_timestamp(nowMs/1000)); such a
   row then trips the open check -> settlement_live (buyer may have broadcast payment
   between quote and confirm).
5. transitionSettlement: catch 23505 -> return false (the failed->offered revival vs a
   second open settlement; settlementQuote must then check the result, see service 9).
6. claimDueListings: fence the claim predicate with AND NOT EXISTS (settlement in the
   five open states) AND (buy_now_lock_expires IS NULL OR buy_now_lock_expires <=
   to_timestamp(nowMs/1000)) keeping FOR UPDATE SKIP LOCKED (correctness B1: no_bids /
   reserve_not_met close under a live buy-now settlement = attacker-controllable dupe).
7. reopenListing: UPDATE gains AND NOT EXISTS (open settlement) (fail-closed).
8. NEW markBidOutbidQueueRefund(bidId): single statement UPDATE bids SET
   status='outbid', bond_state=CASE WHEN bond_state='held' THEN 'refund_due' ELSE
   bond_state END WHERE id=$1 AND status='active' (atomic loser demote; crash between
   the old two statements stranded a held bond forever).
9. NEW expireFailedSettlementsForListing(listingId, failReason) for the reclaim arm.
10. setSaleExcluded: return 'ok' | 'miss' | 'conflict' (23505 -> 'conflict', rowCount
    0 -> 'miss').
11. Boot DDL: both repair gates change from to_regclass IS NULL to "no VALID index"
    (NOT EXISTS pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n
    ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='<index>' AND
    i.indisvalid); add a DO block before each CREATE UNIQUE INDEX dropping an INVALID
    same-named carcass (migration SF-1, empirically proven: a CONCURRENTLY carcass
    satisfies to_regclass AND IF NOT EXISTS, silently dropping the invariant).
    Comment fixes: pseudoconstant one-time filter (not plan-time folding); IF NOT
    EXISTS matches name only (a future predicate change needs a new name); the
    delivered->expired repair transition is a deliberate exception to
    SETTLEMENT_TRANSITIONS terminality (rules table ref); repair is unbatched by
    design, safe only on pre-enable-empty tables. fail_reason preserves forensic
    detail: 'schema_dedupe' || COALESCE(':' || fail_reason, '') and detection queries
    use LIKE 'schema_dedupe%'.
12. TxAbort: drop the decorative generics at the two annotated throw sites; one
    comment line that the payload is unchecked against withTx<T>.

server/woc_market.ts:
1. Remove pre-existing unused import WOC_MARKET_RESTRICTED_POLICY (cleanup D1).
2. cancelListing: 'contended' -> refuse('contended').
3. adminSuspendListing: 'contended' -> refuse('contended').
4. buyNow: insertSettlement 'contended' -> clearBuyNowLock + refuse('contended').
5. closeDueAuctions: reserve_not_met arm AND the live_settlement_exists loser arm use
   markBidOutbidQueueRefund (atomic; also fixes the missing CAS); winnerFrom:
   ['active']; treat 'winner_gone' with 'live_settlement_exists' (comment); 'contended'
   -> continue WITHOUT markListingSettling (stranded reclaim self-heals 'ending').
6. cascade (expireOverdueSettlements): winnerFrom: ['outbid']; 'winner_gone' and
   'contended' join the existing unwind arm (setBondState held -> refund_due).
7. settlementQuote: check the revival CAS result; false -> refuse('not_active').
8. reclaimStrandedListings: expireFailedSettlementsForListing(listing.id,
   'listing_reclaimed') before reopenListing.
9. adminSetSaleExcluded: 'conflict' -> refuse('sale_conflict'); 'miss' ->
   refuse('not_found').

Routes/codes/i18n:
- NEW refusals 'contended' (409, woc_market.contended) and 'sale_conflict' (409,
  woc_market.sale_conflict): error_codes.ts (+comments), REFUSAL_ERRORS rows,
  API_ERROR_KEYS in src/ui/api_error_i18n.ts, English leaves in
  src/ui/i18n.catalog/api_error.ts, five non-Latin fills each (zh_CN, zh_TW, ja_JP,
  ko_KR, ru_RU overlays), npm run i18n:gen, update the exact-count pin in
  tests/server/woc_market_routes.test.ts (:122) and the EXPECTED lists in
  tests/server/http/error_codes.test.ts (insert in DECLARATION order, after
  buy_now_locked; also move settlement_in_flight there, cleanup N1) and
  tests/api_error_code_parity.test.ts.

Fake (tests/server/helpers/fake_woc_market_db.ts): mirror every signature change;
suspend's blocking list derived from OPEN_SETTLEMENT_STATES (filter 'offered') plus
the quoted-offered refusal; transitionSettlement refuses (false) when `to` is open and
another open row exists; submitSettlementSignature skips self-match (other.id !== id);
claimDueListings fence; reopenListing guard; markBidOutbidQueueRefund;
setSaleExcluded tri-state; insertSettlement winnerFrom + 'winner_gone'.

## Fix round: tests

pg suite (tests/woc_market_settlement_pg_integration.test.ts):
- insert-vs-close interleave: listing 'settling' + outbid bid; hold listing FOR
  UPDATE on a raw client, fire insertSettlement(winnerBidId), expect 'blocked' then
  closer commits closed -> 'listing_closed', bid still 'outbid', zero settlements
  (RED before fix 1).
- activateBid-vs-suspend deadlock, widened: standing active bid (LOWER id, listing
  current_bid_id set) + pending_bond bid; client C holds the standing bid lock; start
  suspend then activateBid (both real); C commits; assert neither throws 40P01;
  final: listing closed 'suspended', pending bid activated-then-cancelled or refused,
  no held bond left on a cancelled/outbid bid (RED = 40P01 before fix 2).
- claim fence: past-ends listing with offered settlement NOT claimed (RED: old closes
  no_bids); with unexpired lock NOT claimed; with expired settlement claimed.
- quote-revival: failed + offered coexisting; settlementQuote on the failed one ->
  typed not_active refusal, no throw, states unchanged (RED: old throws 23505).
- suspend-quoted: offered with live quote refused 'settlement_live'; expired quote
  suspends fine (RED before fix 4).
- markBidStatus CAS pin: cancelled bid + CAS(['active']) no-op; two-arg form moves it.
- repair ranking decisive: second listing, offered inserted FIRST (lower id),
  confirming second; higher-id confirming survives, offered demoted (fail_reason LIKE
  schema_dedupe) (coverage F1).
- INVALID-carcass repair: drop index, seed duplicate open pair, attempt CONCURRENTLY
  build (fails, leaves carcass), re-apply schema -> repair ran, index VALID.
- try/finally around both DROP INDEX spans (coverage N3).
- direct negatives: liveSettlementForListing null for 'expired'; suspend succeeds over
  'expired' (coverage N5).
- reclaim: stranded 'settling' with failed settlement -> failed expired
  'listing_reclaimed' + reopened; with revived offered -> reopen refused.
- setSaleExcluded 'conflict' pin update (was false).

Fake-backed service tests (tests/server/woc_market_service.test.ts):
- three listing_closed arms via stub db: buyNow (clearBuyNowLock + not_active),
  resolveDueListings (continue, no markListingSettling), cascade unwind (refund_due).
- suspend at 'delivered' refused (service level, fake).
- same-signature retry accepted after failed->offered revival (fake SF-2).
- cascade tie-breaks: equal amounts diff placedAt; equal both, diff id (both suites).

DB-free structural pins (tests/server/woc_market_directed_sql.test.ts): comment-strip
WOC_MARKET_SCHEMA (strip `--` lines per the sql-text-pin memory) then assert:
woc_market_settlements_open, woc_market_sales_listing_once, DROP INDEX IF EXISTS
woc_market_settlements_live, each of the five state literals in the settlements index
predicate and no sixth state, both validity gates present; fake's
OPEN_SETTLEMENT_STATES === the same five literals; repair CASE ranking names every
predicate state (migration NIT-3).

## Docs (do LAST, before gate)

- server/CLAUDE.md: lock-order rule line (bids by id first, listing second,
  activateBid's order; SET LOCAL lock_timeout on multi-row market transactions) in the
  woc_market Key-files row or "Never do this here"; half-line on the deliberate
  boot-DDL unique-index exception (cleanup C1, C2).
- docs/prd/woc/marketplace.md:216: the support-cancel line over-promises while
  confirming has no escape hatch until the bounded resolution lands (cleanup C4).
- state.md: detection queries are PRE-upgrade (post-upgrade: fail_reason LIKE
  'schema_dedupe%', sales repaired-row EXISTS query, stranded won/held bonds on
  demoted confirming rows); mixed-fleet adds boot-loop availability (old binary
  writing during the repair-to-CREATE window aborts the new boot; disable is
  load-bearing) and old-binary insertSale now THROWS under the new index; never drop
  the two unique indexes by hand (gate re-arms and demotes live settlements); EXPLAIN
  the repair quals before enable (16/17); clearBuyNowLock unguarded pattern (phase 04
  note); delivered-but-stuck 'settling' orphan -> phase 03 reconcile arm must add a
  'delivered' re-drive (correctness S2/security W2) and deliverOne itemDisposed
  refusal; new registry entries (contended, sale_conflict, winner_gone, winnerFrom,
  markBidOutbidQueueRefund, expireFailedSettlementsForListing, claim fence, reopen
  guard, quoted-offered suspend refusal, validity gates).
- progress.md: 26 -> 27 prose fix (recount after new tests), QA round entry, note the
  owned deferrals that STAND (insertSale 23505 raw throw at deliverOne still phase 03;
  per-arm sweep isolation phase 03; admin envelope English phase 14; TEST_DATABASE_URL
  CI job phase 20).
- Do NOT re-raise owned deferrals; do NOT re-raise refuted/no-change items:
  suspend guard 'offered' member unreachable single-threaded (real concurrency arm,
  keep); fake createdAtMs nowMs vs now() (harmless); play.html type="button" (branch
  authoring, pre-existing); biome warnings (pre-existing, warnings do not gate).

## Then

Mutation-prove per phase-02-qa.md (commit FIRST; revert each guard predicate
uncommitted, prove the suite reds with tests RUN, restore): the five-state cancel
check, the suspend blocking set, the winner stamp CAS, the claim fence, the sales
unique index (drop), the listing lock in insertSettlement, activateBid's ordered
scan. Fresh re-review of the whole fix round (it is unreviewed code). Re-run the full
validation matrix + apply-twice probe (gates changed). qa-checklist last. Commit,
node scripts/gate_select.mjs, push origin feature/woc-marketplace on PASS, note CI
state in progress.md. Verdict + counts; next file:
docs/woc-marketplace-hardening/phase-03-delivery-exactly-once.md.
