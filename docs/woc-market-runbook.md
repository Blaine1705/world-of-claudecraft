# WOC Exchange marketplace operations runbook

The operator's guide to running the $WOC Exchange (the P2P real-money
marketplace): pausing and resuming trading, deploying safely, funding the
escrow, reading the health surfaces, and resolving everything that can get
stuck. Written from shipped behavior; every claim cites the owning module or
doc. Configuration reference: DEPLOY.md ("$WOC Exchange marketplace" section)
owns the env knobs and deploy coupling; this file owns the procedures.
Historical rationale (rulings, measurements) lives in the hardening records at
`docs/woc-marketplace-hardening/state.md` (Rulings and the per-round ledger);
citations into that directory are historical context, not procedure.

STATUS: `WOC_MARKET_ENABLED` is OFF everywhere. Nothing in this file may be
read as permission to enable; the pre-enable bar is the acceptance audit
(`docs/woc-marketplace-hardening/acceptance-audit.md` while the packet lives)
and counsel sign-off.

## 1. Surfaces and probes

- Dashboard (woc-daily-rewards-dashboard, Trading tab): the ops view of the
  service. Its admin-exclusive levers are PAUSE and the audited read surface.
  Bond refund and forfeit are internal-tier by design (the game drives its own
  settlement lifecycle; release destinations resolve from the STORED quote,
  never from the request), so do not look for them as dashboard buttons
  outside the "Release a bond by hand" flow, which drives the service's
  bond-release endpoint with a typed reference confirmation.
- Economy service (woc-daily-rewards-service, `service/src/market/`): quotes,
  settlement, the price oracle, bond custody and release. Ops endpoints are
  `/v1/market/admin/*` (admin secret plus actor header; see
  `service/docs/MARKET_SETTLEMENT.md`).
- Game server: `/internal/woc-market/stuck` (`server/woc_market_monitor.ts`,
  gated by `DASHBOARD_INTERNAL_SECRET`) is the game-side monitor readout:
  review settlements, stuck bonds, parked custody claims, the pg pool
  occupancy gauge, lock-wait and idle-transaction-kill counters, and the
  price-cache ages.
- HEALTH PROBE: probe the market on the SERVICE BASE, `GET /v1/market/price`
  with `x-woc-economy-secret`. Do NOT key market monitoring on the service's
  `/v1/health` rail matrix: it has no market-settlement rail, and its
  "marketplace" rail is the unrelated character-marketplace rail (DEPLOY.md,
  "$WOC Exchange marketplace").
- Dashboard refresh caveat: the Summary subtab's 30s refresh holds an
  in-flight guard, so a never-resolving fetch parks the refresh permanently
  (a sticky "Loading quotes..." line). The remedy is a page reload. A
  transient refresh failure replaces data with the error on purpose
  (anti-mixed-epoch); do not ask for silent retention of stale rows.

## 2. Pause and resume trading

Pausing is the service pause the dashboard drives (`POST
/v1/market/admin/pause`). A pause reads as UNHEALTHY to the game, which is
what actually stops trading: the game's own guard keys on price health, so
quotes, bids and buy-nows refuse while paused. A paused refusal reports the
LAST heartbeat reading and never polls the venue
(`service/src/market/service.ts`, pausedAsOfMs).

- While the price gate is unhealthy (paused or halted), buyNow refuses
  `market_paused` and ONLY THE PENALTY side of the default sweep pauses: the
  sweep still closes listings and returns items. An intra-window oracle blip
  striking a defaulter is an accepted residual (`server/woc_market.ts`,
  strikeDefaultingBuyer).
- HALT CONTROL DEPENDS ON THE OVERVIEW READ, deliberately: the dashboard
  renders the pause control only with the current state in hand, because a
  blind toggle is its own hazard. During an overview outage the fallback is
  the service endpoint directly: `POST /v1/market/admin/pause` with the two
  secrets and the actor header (`service/src/market/routes.ts`).
- PAUSE BEFORE DEPLOY in a live settlement window: see section 6.
- PAUSE DURING AN ECONOMY-RAIL OUTAGE: see section 12.

## 3. Enabling the market (the pre-enable checks)

`WOC_MARKET_ENABLED` is the master switch (game side). Before it is EVER set
on a production realm:

1. The acceptance bar must be fully checked (counsel-approved Terms included;
   the enable-time checklist rides the counsel decision memo).
2. The custody-claims table must be EMPTY OR FULLY BOOKED: malformed legacy
   refs prune on the retention window alone, and legacy NULL-intent rows are
   parked as operator work (`server/woc_market_db.ts`; section 9).
3. Scan listings' item payloads for `bindOnTrade` without `boundTo`: armed
   copies already sitting in escrow would deliver anonymously (entry is
   gated, existing rows are not).
4. Verify the trade controller sends real terms consent (no hard-coded
   acceptTerms; `src/ui/hud/woc_trade/woc_trade_controller.ts`).
5. Confirm the deploy coupling: both game and service at or after their
   contract tips, bond knobs in lockstep (DEPLOY.md).
6. EXPLAIN the two boot-repair quals against the grown tables (the repair
   scans are sized for pre-enable emptiness).
7. Do not overlap the enable rollout with a rolling restart (section 6).
8. A settlement stuck in `confirming` must have its bounded resolution path
   live (`WOC_MARKET_CONFIRMING_REVIEW_HOURS`; section 10). This shipped; the
   check is that the knob is not configured absurdly high, because it has NO
   upper clamp and a huge value silently disables the review park and the
   stuckBonds visibility class.

## 4. Wind-down (draining the market)

To wind the market down: DRAIN WITH THE FLAG ON, THEN FLIP OFF. A bare
`WOC_MARKET_ENABLED=0` freezes the sweeps, returns and refunds along with the
intakes, so flipping it first strands live listings and held bonds.

1. Pause trading (section 2) so no new quotes or locks arise.
2. Let the existing locks, settlement windows and bond releases run out under
   the still-enabled sweeps (listings close, items return, bonds release).
3. Only when the stuck readout shows nothing live, set `WOC_MARKET_ENABLED=0`.

NEVER disable while payments are in flight: both intakes refuse before
recording and the sweep freezes recorded rows, so an in-flight payment's
recovery arms stop running until re-enable. The Terms' return-and-resolve
promise is an operator-conduct commitment; this procedure is what makes it
true.

## 5. Bond refund, forfeit, and force-release

- Refund and forfeit drive the STORED quote's own lifecycle: refund returns
  the bond to the wallet recorded on the quote, forfeit sends it to the
  CONFIGURED treasury and burn split. Neither takes a destination from the
  request (`service/docs/MARKET_SETTLEMENT.md`).
- The dashboard's force-release flow resolves the reference through the bond
  store; a non-bond reference refuses, and the ATTEMPT is audited either way.
  The typed last-8-characters confirmation is fat-finger protection, not the
  authorization gate; the service fails closed on its own.
- Bonds have NO automatic time-based exit: the exit paths are the chain
  deciding (settle, refund, forfeit) or operator resolution, and the
  stuckBonds readout class is the visibility bound
  (`server/woc_market_rules.ts`, WOC_MARKET_BOND_POLL_PARK_SECONDS, a code
  constant). Stuck age renders from stuckSinceMs, not from placement time.
- Refusal vocabulary you will see on releases: `release_unavailable`,
  `destination_account_unsupported`, `insufficient_sol_fee`,
  `not_configured`, `release_failed`, `send_failed` (dev chain adds
  `dev_chain_transaction_superseded` / `dev_chain_unknown_transaction`).
- A release claimed but never finished ages into the `releasing` attention
  count. Past the release protocol's age bound
  (`service/src/market/release_protocol.ts`, MAX_REPLACEABLE_AGE_MS, six
  hours, code-owned) it is NOT retried automatically: reconcile by the
  attempt-signature trail the quote row carries (join escrow outflows against
  releaseAttemptSignatures), then resolve by hand. This is distinct from the
  inside-bound `release_unverifiable` case, which retries.

## 6. Deploying the game server (marketplace consequences)

THE DEPLOY IS FORWARD-ONLY. The marketplace schema's dedupe indexes and
repair scans assume no old binary writes after the new boot ran.

Before upgrading a realm that ever ran the market:

    -- both return zero after a successful new-binary boot, by construction
    SELECT listing_id FROM woc_market_settlements
      WHERE state IN ('offered','confirming','confirmed','delivering','delivered')
      GROUP BY listing_id HAVING count(*) > 1;
    SELECT listing_id FROM woc_market_sales WHERE excluded = false
      GROUP BY listing_id HAVING count(*) > 1;
    -- legacy custody claims that will park as operator work (section 9)
    SELECT count(*) FROM woc_market_custody_claims WHERE booked_at IS NULL;

Mixed-fleet rules:

- Keep the market DISABLED through any mixed-fleet window. An old binary
  against the new schema re-opens the settlement-less-won-bid window, and its
  reclaim arm can reopen delivered-but-unclosed listings.
- An old binary writing between the new boot's repair scan and its CREATE
  INDEX makes the index build fail and the boot exit; the retry self-heals,
  but a PERSISTENT old writer is a boot loop.
- Under the new schema an old binary's double delivery THROWS at insertSale
  (unique violation) instead of minting a silent duplicate: safer, but a new
  old-binary failure mode to recognize in logs.
- Do NOT overlap the enable rollout with a rolling restart: boot DDL holds
  ACCESS EXCLUSIVE on the custody-claims, settlements and listings tables for
  the whole schema transaction, so realm B's boot blocks realm A's market
  writes for its duration.
- During a mixed-fleet window the old binary's readout sorts its delivering
  sample unindexed (the new boot drops the index it used); diagnostic-only
  and transient. The reverse flip also exists: an old-binary boot re-creates
  `woc_market_settlements_listing` and the next new-binary boot drops it
  again, each flip a synchronous build under ACCESS EXCLUSIVE
  (`woc_market_settlements_listing_latest` is the survivor). Free while the
  tables are empty; avoid boot ping-pong after enable.

NEVER hand-drop `woc_market_settlements_open` or
`woc_market_sales_listing_once` during an incident: the validity gate re-arms
and the next boot demotes surviving duplicate open settlements as
`schema_dedupe`.

After an upgrade that repaired anything:

    SELECT * FROM woc_market_settlements WHERE fail_reason LIKE 'schema_dedupe%';
    SELECT s.* FROM woc_market_sales s WHERE s.excluded = true AND EXISTS
      (SELECT 1 FROM woc_market_sales t
        WHERE t.listing_id = s.listing_id AND t.excluded = false);

Repaired settlements that reached `confirming` may still land on chain:
reconcile them by hand AND check their bids for a stranded won-plus-held bond
pair, which no sweep arm reaches. The repaired-sales query also matches
legitimate operator voids; correct for that by hand.

Binary ROLLBACK caveats (old binary, new schema): the old binary fails closed
but (a) strands `review` rows with no transition path (a second settlement
attempt surfaces as an internal error until re-upgrade; nothing is
destroyed), and (b) resumes taking lock claims and bids on a
cancel-pending listing. Before rolling back, drain bare-but-granted custody
claims to zero, because the OLD binary adopts a bare claim as booked and
completes the sale WITH NOTHING DELIVERED:

    SELECT custody_ref FROM woc_market_custody_claims
      WHERE booked_at IS NULL AND grant_character_id IS NOT NULL;

Standing constraints: the boot repair is UNBATCHED (fine while the tables are
pre-enable small; the first populated-table repair must batch first), and the
widened settlement CHECK stays NOT VALID on legacy databases (cosmetic; an
operator may VALIDATE CONSTRAINT out of band). A REINDEX CONCURRENTLY of the
offers pair index names its transient index `_ccnew`; a violation raised
against THAT name rethrows as a 500 rather than no-opping (fail-safe, but
expect it during index maintenance). The supervisor kill is the deploy
backstop: stop() waiting out a degraded chain-polls segment is accepted and
the watchdog stays loud.

## 7. Deploying the economy service

- DO NOT deploy or restart the service while a high-value settlement window
  is live without PAUSING the market first. A freshly booted oracle holds one
  print with no predecessor, so the first venue republish after a deploy
  reads a zero breaker and a price moved BEFORE the deploy is accepted as-is
  (the cold-boot single-print exposure; recorded, ruled no gate). The boot
  warm-up prints an honest two-line warn pair.
- Deploy coupling and bond-knob lockstep: DEPLOY.md owns the exact rule (both
  sides at or after the contract tips; skew is asymmetric; keep
  `WOC_MARKET_BOND_BPS` and the bond clamp pair identical on both sides until
  the fleet converges). Mirror-vs-service bond drift is INVISIBLE to
  operators at runtime, which is why the lockstep is a deploy-checklist item,
  not a monitor.
- The service must keep reserving `awaiting_finality` for LEDGER-MATCHED
  payments (a named breaking change; DEPLOY.md).
- The first sweep after enabling faces the accumulated backlog; expect one
  slow first pass.
- Live `.env` must set `DATABASE_URL` (compose interpolation and the boot
  both require it), and a whitespace-only admin secret now refuses the whole
  boot instead of leaving a 503 ops tier up.

## 8. Escrow SOL funding (a manual op)

The escrow wallet's SOL pays every release's transaction fee and any refund
destination's rent (the escrow funds ATA creation so the bidder is always
made whole in full; the bounded griefing exposure of about 0.002 SOL per
bond cycle via account re-closing is accepted).

- The releaser preflights fee plus rent; short funds refuse
  `insufficient_sol_fee` and the bond STAYS HELD AND RETRYABLE.
- The admin overview reports the balance (`attention.escrowSolLamports`) and
  flags it under the floor (`WOC_MARKET_ESCROW_MIN_SOL_LAMPORTS`, default
  0.05 SOL, on the order of ten thousand release fees). `null` means
  UNMEASURED (dev chain or RPC outage), never "fine".
- Funding is MANUAL by ruling: no automated cross-wallet top-up exists. When
  the flag fires, top the escrow up from the treasury by hand and note it in
  the ops log.

## 9. Custody: parked claims are the operator queue

A custody claim row records one attempt to move a sold item out of escrow to
the buyer. Unbooked rows (`booked_at IS NULL`) are THE OPERATOR QUEUE; the
stuck readout lists them per class.

THE ONE RULE: NEVER DELETE AN UNBOOKED CLAIM ROW TO UNSTICK A DELIVERY. The
next pass mints a fresh claim that skips the parcel-in-book gate by
construction, re-arming the duplication the gate exists to stop (the warning
is written at the DDL in `server/woc_market_db.ts`). Resolve a parked row by
hand-delivering and then stamping `booked_at`, or by confirming non-delivery
first; never by deletion.

Per-class resolution:

- Crash-before-blob-persist, and deterministic parcel refusals (the mail
  rail): hand-deliver once non-delivery is confirmed, then stamp.
- GRANT classes (`grant_character_id` set: an ambiguous grant refusal, a
  lease fence, or a dead session): THE ITEM MAY ALREADY BE IN THE BUYER'S
  BAGS. Confirm the buyer does NOT hold the item BEFORE hand-delivering;
  delivering without checking mints the dupe.
- `escrow_outcome_unknown`: an ambiguous COMMIT throw restores nothing,
  quarantines and kicks the session, and logs the full extracted slot for
  you; reconcile from that log line.
- Sold-undisposed residue converges through its own sweep arm, but WITHOUT a
  standing sale row it parks forever; the exit is operator-only, on purpose.
- The seller's sold notice is best-effort: a crash between finalize and the
  notice loses the notice for good (the sale is durable, no item is at risk).
  Notice failures log under the `deliver_notice` tag; the sweep fallback line
  carries the stack.

Retention interplay: unbooked rows are never pruned; booked rows are
provenance and age out on `booked_at` after
`WOC_MARKET_CUSTODY_CLAIMS_RETENTION_DAYS` (default 365). A boot warning
(`server/main.ts`, wocCustodyClaimsRetentionWarning) fires when the custody
window sits at or below the listings window or listings retention is
keep-forever, either of which disarms the prune coupling.

## 10. Settlements: review state, confirming age, terminal answers

- A settlement parked in `review` (the confirming-age bound,
  `WOC_MARKET_CONFIRMING_REVIEW_HOURS`, default six hours) needs a human:
  VERIFY ON CHAIN first, then drive the transition through
  `transitionSettlement` (`server/woc_market_db.ts`): review to `confirmed`
  (the payment is real; delivery resumes) or review to `failed` (unpaid; the
  overdue default pass takes over). NEVER hand-write SQL for these
  transitions: hand SQL bypasses the compare-and-set guards.
- The knob has NO upper clamp; a huge value silently disables the park and
  the stuckBonds class. Treat any raise as a config review item.
- The service expires a `confirming` quote five hours past its expiry
  (`service/src/market/quotes.ts`, MAX_CONFIRMING_AGE_MS, code-owned; sized
  under the game's review bound and under RPC signature-history depth so the
  terminal answer lands while a re-verify can still decide). A timed-out row
  goes EXPIRED, never rejected, so a payment the ledger later proves adopts
  its quote through the entry-adoption arms.
- ONCE THE GAME HAS ACTED on a terminal answer, recovery for a
  later-proven payment is an out-of-band re-confirm of the preserved
  signature; the overview's `confirmingExpired24h` counter is your cue that
  such rows exist.
- Registered edge (pre-existing): a confirm on an already-expired or
  superseded row answers the terminal reason at entry WITHOUT consulting the
  ledger, so a buyer who signed before expiry and broadcast after is told
  terminal while the money reached escrow. The adoption arms plus re-confirm
  are the remedy; a chain probe on expired confirms is a recorded candidate
  fix.
- The confirm vocabulary table lives in `service/docs/MARKET_SETTLEMENT.md`;
  read verdicts from there, not from memory.
- TREASURY ROTATION RULE: the verifier resolves the treasury leg from the
  CURRENT config, so rotating the treasury wallet with quotes in flight
  REJECTS REAL PAYMENTS. Pause, drain the quote TTL window, rotate, resume.
- RPC defects: a malformed balance row or envelope from the RPC surfaces as a
  retryable throw, not a terminal verdict. If a vendor starts emitting them,
  swap the endpoint rather than resolving rows against bad data.

## 11. Price oracle health

- The heartbeat feeds an edge-triggered halted/recovered operator signal
  (`service/src/market/price_gate_signal.ts`): TWO lines per incident. The
  recovered line carries the window depth it reopened on, so a breaker reset
  is visible in the log. Refusal arms report the poll-clock window through a
  non-mutating view (a refusal tells the truth and destroys nothing).
- Every env knob that boot could not honor verbatim is named in a boot warn
  line; oracle knobs may only TIGHTEN their code defaults, and the tightening
  floors are sized from the venue cadence (staleness down to 45 minutes,
  samples up to 60) because tighter values halted the market on real prints.
- At the deployed cadence (the venue republishes on the order of tens of
  minutes against a fifteen-minute window) the TWAP usually equals the last
  print and the breaker compares print to print. The breaker is a HOLD-TIME
  cost, not a cap: an out-of-bound print halts trading but is still recorded,
  and the halt clears within about one window as the average absorbs it.
- A print with a FUTURE publish time is screened to no-print at the source,
  so a clock-skew incident on the venue or the host shows up as `no_price`
  or `stale` rather than a future-dated reading: when the surface contradicts
  the venue's own dashboard, check the HOST clock.
- The overview's `distinctPrints`, per-venue ages, and bounds are the honest
  freshness surface; `samples` counts polls, not prints.
- Manipulation economics (standing observation): the real manipulation cost
  is set by `WOC_MARKET_MIN_LIQUIDITY_USD` against `WOC_MARKET_MAX_USD_CENTS`;
  no oracle bound fixes that ratio. Keep the pair in view when raising the
  quote ceiling.
- Venue fetch timeouts cover HEADERS ONLY; a stalled response body parks a
  poll on the HTTP client's own default for minutes, fail-closed (a recorded
  observation, not a knob).

## 12. Economy-rail outage procedure

When the game cannot reach the economy service (bridge calls failing, the
Exchange reporting itself unavailable):

1. PAUSE TRADING (section 2) so no new payment windows open while the rail
   is down. The pausedBanner tells winners payments wait; note that the
   settlement window itself keeps running.
2. After recovery, identify defaults whose payment window overlapped the
   outage. The strike side is already outage-fair: `strikeDefaultingBuyer`
   (`server/woc_market.ts`) is the single strike-fairness path and spares
   outage-locked winners. The bond forfeit is NOT gated on outage evidence
   (a deliberate money-policy ruling, R13 in the hardening records).
3. MAKE THOSE PLAYERS WHOLE BY HAND: refund the forfeited bonds through the
   dashboard's release flow, using the same outage evidence the strike path
   read (the readout's outage-locked verdicts and the service's audit trail).
4. An automatic arm (the deadline pausing while the rail is observed down,
   or forfeit converting to refund on outage evidence) is a recorded
   follow-up that needs its own ruling; do not improvise it mid-incident.

Related shipped behavior worth knowing during an outage: guardBalance is
fail-closed (an economy outage blocks directed offer creation on purpose),
and an economy outage can mint one recoverable abandon row per buyer (the
outage verdict is exempt from the abandon ledger).

## 13. Suspensions

Bidding suspensions are MARKETPLACE-WIDE, not per-listing; they never
shorten, and clears are per-account. A suspension freezes that account's
participation while the sweeps continue to close, return and refund
normally (suspension is not a wind-down; section 4 is).

## 14. Retention, sweeps, and capacity

- The 365-day custody-claims retention bounds the LAST game-side trace that a
  memoRef delivered (the settlement row itself dies at 180 days), so a
  reconciliation older than that must not assume claims rows exist; the
  service-side quote row and the chain are the durable trail.
- The nightly retention sweep hour is provisional 05:00 UTC, which is US
  evening peak; the deletion ceiling can reach about 100k parent rows per
  night and listings deletes fan out roughly 5x to 15x through cascades.
  Revisit the hour before enabling on a busy realm.
- Capacity math counts THIRTEEN steady per-realm DB connections (the base
  pool plus the chat-quota feature's dedicated pool and LISTEN connection).
- On the stuck readout: SUSTAINED `waiting > 0` on the pool gauge is the
  brownout precursor; lockWaitTimeouts and idleTxKills ride beside it. Typed
  `contended` refusals are the guard-transaction timeouts doing their job;
  sustained contention is the incident, not the refusal.
- The per-IP rate-limit triple is sized for two worst-case players behind one
  NAT; a busy venue behind one IP will hit 429s (recorded at the constant).
- `/me`'s effective worst case is about 11 seconds under full saturation (the
  6s between-reads deadline plus one in-flight read); a `/me` deadline
  surfacing as a 500 during saturation is the incident signal, by design.
- `MARKET_BACKFILL_DRY_RUN` (`server/http/config.ts`) deliberately sits
  outside `.env.example`: it is an ops flag for the one-off backfill, not a
  deployment knob.

## 15. External dependencies

- TWO GENUINELY INDEPENDENT RPC VENDORS: the release-protocol's
  crash-replace path needs a second, independent probe endpoint (two vendors,
  not two URLs at one vendor). The code cannot verify independence; this
  runbook is the check. Single-RPC deployments still confirm and
  probe-not-resend correctly; what they lose is the crash-replace
  reconciliation path.
- The Python payout service's `DAILY_REWARD_WOC_USD_PRICE` fixed-price knob
  has NO environment gate, and compose forwards it raw: a value in a
  production `.env` silently fixes that service's WOC price. OPERATIONAL
  RULE until a code gate is ruled: never set it in any production env file;
  treat any set value found in production as an incident.
- The market venue key (Birdeye) is optional in dev (the ruled fixed-price
  dev path); production pricing requires it and the oracle fails closed
  without it.

## 16. Devnet rehearsal

The end-to-end devnet dry run (bond cycle, settlement, release, halt lines)
is staged and documented in `docs/woc-marketplace-hardening/devnet.md`
(roster, environment, resume runbook). PENDING: the on-chain legs are blocked
on devnet SOL; until they run, this runbook's chain procedures rest on the
mainnet-shaped test rigs and have not been rehearsed against a live cluster.
When the rehearsal completes, fold its operator-relevant lessons in here and
delete this pending note.
