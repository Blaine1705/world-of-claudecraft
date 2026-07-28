# $WOC marketplace and auctions

> **STATUS: IMPLEMENTED in v0.32, SHIPS DISABLED.** The auction service is code
> complete behind `WOC_MARKET_ENABLED` (default off, fail-closed in every
> distribution). Enabling it on a production realm is gated by the launch
> checklist below, which includes Terms and PRD policy updates and counsel
> sign-off. Source proposal: "$WOC Marketplace and Auctions" (July 2026).

| | |
|---|---|
| **Tier** | 2 - Trading |
| **Ease** | 2/5 |
| **Flywheel** | Demand and circulation: every sale settles in $WOC and burns supply |
| **Sustainability** | 7% of every sale to the treasury, 3% burned |
| **Reg risk** | High (real-value trading of game items; counsel gates launch) |

## What

An optional, browser-only auction house where eligible items are sold for $WOC.
Sellers and bidders agree on a USD value; the number of $WOC tokens required is
calculated only when payment is requested, from a quote issued by the economy
service. The game is not pegging $WOC to USD: a $100 auction stays a $100
auction, and only the token count at settlement moves with the market.

Gold trading stays on the existing World Market (`src/sim/market.ts`),
untouched. Gold and $WOC listings are separate books; the game provides no
Gold/$WOC or Claudium/$WOC exchange.

## Why it's a flywheel

The marketplace gives $WOC its first player-to-player utility loop: earned items
become sellable for tokens, every settlement burns 3% and routes 7% to the
treasury, and demand for tokens comes from players who want items rather than
from speculation alone.

## Design

### USD-denominated pricing, $WOC settlement

- Every economic value is stored as integer USD cents: starting bid, reserve,
  current bid, buy-now price, final sale price, and fee reporting
  (`woc_market_db.ts`, all `*_cents` columns).
- The interface may show an estimated $WOC equivalent, always labelled as an
  estimate, sourced from the economy service price read (never computed in the
  game repo, and never computed in the client).
- Token amounts appear only on quotes and settlements, as base-unit strings
  issued by the economy service (`WocMarketQuote`), mirroring
  `ClaudiumWocIntent`.

### Auction formats

Sellers choose one of three formats at listing time:

- **Standard auction**: starting bid, optional hidden reserve, duration from a
  configured allowlist, no buy-now.
- **Buy-now listing**: fixed USD price, no bidding; the buyer takes a
  short-lived quote and settles immediately.
- **Auction with buy-now**: bidding proceeds normally; buy-now stays available
  until used or the auction ends. A successful buy-now closes the auction
  immediately and cancels (refunds) existing bids and bonds.

The reserve, buy-now price, and duration are frozen after the first confirmed
bid. Sellers choose at listing time whether a failed settlement offers the item
to the next eligible bidder or ends without a sale.

### Price source and health

The $WOC/USD price and all token math live in the economy service (the same
authority that already quotes the Claudium WOC rail). The proposal's oracle
requirements bind on the service: a time-weighted price rather than a single
trade, multiple approved liquidity sources, maximum source-deviation limits,
minimum-liquidity requirements, and freshness checks.

The game side enforces what it can observe, and fails closed:

- Quotes carry an expiry of 60 to 120 seconds (`WOC_MARKET_QUOTE_TTL_SECONDS`);
  an expired quote is never accepted for confirmation, the buyer requests a new
  one inside their settlement window.
- When the service is unreachable, degraded, or reports its oracle down, the
  marketplace suspends new purchases and settlements. Existing auctions keep
  counting down; no irreversible sale occurs until pricing recovers. This is
  the same graceful-degradation contract as `server/claudium_proxy.ts`.
- Operators can hard-pause the whole marketplace at runtime (audited config,
  the `antibot_config_db.ts` pattern).

### Bidding and bid bonds

A bid is a commitment to pay a USD value in $WOC, not a fixed token count. The
bid form shows the bid in USD, the current estimated $WOC requirement with the
price timestamp, a warning that the final token amount may change, and the
settlement deadline that applies if the bid wins.

Every bid requires: a verified linked wallet (`server/wallet.ts`), sufficient
$WOC balance at bid time (`server/woc_balance.ts` cached read), an established
account, acceptance of the variable-token settlement terms (recorded), and TOTP
2FA (`server/totp.ts`) for bids at or above a configured USD threshold.

Balance checks do not guarantee later possession, so every bid posts a small
refundable bond, denominated in USD and paid in $WOC when the bid is placed
(default 5% of the bid with configured minimum and maximum). The bond is a
service-issued transfer intent the bidder signs; a bid becomes active only when
the service confirms the bond transaction. Bonds are returned when a bidder is
outbid, when an auction ends below reserve, and when a buy-now closes the
auction. A winner who fails to settle forfeits the bond to the treasury and
burn split, never to the seller. Repeated defaults earn progressively longer
bidding suspensions (strike ladder in `woc_market_rules.ts`).

Deviation from the proposal, recorded deliberately: the proposal suggests the
bond "counts toward payment" on a win. Here the winner pays the full price in
one atomic settlement transaction and the bond is refunded after settlement
confirms. Net economics are identical, and settlement stays a single signed
transaction containing payment and fee distribution.

Minimum bid increments use the configured USD ladder (under $10: $0.25, $10 to
$50: $1, $50 to $200: $5, over $200: $10). A bid inside the final two minutes
extends the auction by two minutes, repeatable up to a 30 minute total
extension cap. All timing is server-authoritative; the client shows UTC plus
local time.

### Completion and settlement

When an auction ends with the reserve met, the highest active bidder receives a
settlement window (default 10 minutes). Inside it they request quotes (each
valid 60 to 120 seconds), sign the one transaction containing seller payment,
burn, and treasury outputs, and post the signature. The server confirms
finality through the service and delivers the item exactly once. If the winner
does not settle: bond forfeited, marketplace strike recorded, and either the
next eligible bidder is offered the item at their own bid with a fresh window
(when the seller opted in) or the item returns to the seller.

Buy-now settlement takes a very short server-side lock on the listing (one
pending buyer at a time, lock lifetime tied to the quote expiry) so two buyers
cannot sign simultaneously; the listing is not reserved beyond that lock.

Completed transactions are processed idempotently: settlement state transitions
live in Postgres, delivery is a state transition in the same transaction as the
mail write, and reconciliation after a restart delivers the item exactly once.

### Fees

Every completed sale applies a 10% seller fee: 90% of the settlement amount to
the seller's verified wallet, 3% permanently burned, 7% to the treasury. The
split is computed by the economy service inside the settlement intent (the
`ClaudiumWocIntent` precedent) and shown to both parties before they confirm.
The buyer pays the final price plus their network fee. Treasury and burn
addresses are public and reported transparently.

### Item custody

Items remain ordinary server-authoritative game assets, never NFTs, and the
game never holds wallet keys. Custody is escrow-by-removal, the World Market
and Ravenpost precedent:

- Listing an item extracts the exact copy (including its
  `ItemInstancePayload`) from the seller's bags on the world loop and snapshots
  it on the listing row; the character save and the listing insert commit
  together, so a crash can never dupe or destroy the copy.
- An escrowed item cannot be equipped, destroyed, traded, or listed elsewhere,
  because it is no longer in any inventory.
- The copy returns to the seller by system mail when the auction ends unsold,
  the reserve is not met, or settlement ultimately fails; it is delivered to
  the buyer by system mail when settlement confirms.
- The extraction seam re-enforces the `boundTo` trade lock and the
  `soulbound` / `noMarketList` / quest-kind refusals explicitly, as
  `docs/design/professions.md` requires for any instanced carriage.

### Eligibility policy

Eligibility is a per-server policy, not a hardcoded rule set
(`woc_market_rules.ts`). The existing server ships the restricted policy:

- Eligible: non-soulbound equipment of epic quality or higher.
- Defined but empty on this server today: non-soulbound mounts, retired
  cosmetics, and serialized collectibles (the game has no mounts, item-backed
  cosmetics, or serials yet; the categories exist so a future web3 server can
  enable them without rewriting settlement).
- Excluded always: soulbound and `boundTo` copies, `noMarketList` items, quest
  items, anything currently sold for Claudium (the store catalog is consulted
  through the service when reachable), Gold, and Claudium themselves (not
  items, structurally unlistable).

### Integrity

- Sellers cannot bid on their own auctions (account and linked-wallet checks).
- Bids cannot be withdrawn; there is deliberately no endpoint for it.
- Sellers cannot cancel after the first confirmed bid except through support
  (admin action that returns the item and refunds bonds).
- Every settled sale lands in a public, per-item sales history (provenance);
  admins can exclude suspicious sales from public price statistics.
- Marketplace strikes and progressive suspensions are account-scoped and
  admin-visible; admin tooling can suspend listings and pause the marketplace.
- High-value bids and settlements require TOTP; thresholds are configuration.

### Platforms, realms, configuration

- Browser web only (website desktop and mobile web). Electron desktop, Steam,
  and Capacitor iOS/Android stay fail-closed, tighter than the wallet-link
  gate, matching the proposal's browser-only scope.
- Listings, custody, and sales history are realm-scoped like the World Market;
  wallets, bonds, strikes, and suspensions are account-scoped.
- The service is configurable by server: the existing server runs the
  restricted eligibility policy; a future web3 server enables broader
  categories without rewriting settlement.

## Constraints (non-negotiable)

- **Token firewall**: no wallet, token, or settlement code or imports anywhere
  in `src/sim/`. The sim contributes only currency-blind item custody. The
  token scan in `tests/architecture.test.ts` enforces this structurally.
- **Non-custodial**: the chain owns funds; the game server never holds keys and
  only ever verifies signatures and service confirmations.
- **The game computes no token math**: prices, quotes, splits, and confirmation
  all come from the economy service; the game and client render what they are
  handed and refuse to synthesize fallbacks.
- **Graceful degradation**: the game boots and plays fully with the service off
  and with no wallet ever connected; marketplace reads return typed
  unavailable results and the UI degrades to a paused state.
- **Server authority**: every auction outcome, custody move, and delivery
  resolves server-side; the client is a renderer.

## Launch gates (policy deltas this feature introduces)

This feature deliberately supersedes two standing positions, and MUST NOT be
enabled on a production realm until they are reconciled:

1. **Cosmetic-only token utility.** `docs/prd/woc/wallet-link.md` and
   `docs/prd/woc/holder-cosmetic-flair.md` state token utility is never power.
   Trading stat-bearing epic gear for $WOC is player-to-player transfer of
   already-earned items rather than the game selling power, but the standing
   language does not cover it. Both PRDs and README/marketing copy need a
   revision that states the adopted position.
2. **Terms and Conditions.** `TERMS_AND_CONDITIONS.md` currently prohibits
   selling in-game items for real money and states wallet verification involves
   no transaction. Counsel must revise the Terms before enablement, following
   the `docs/prd/frontier-pvp-honor.md` precedent that legal review gates any
   money-attached feature.
3. **Economy service readiness.** The service must implement the marketplace
   quote, confirm, refund, and price-health surface this PRD specifies, with
   the oracle protections of section "Price source and health", and a testnet
   dry run must pass end to end.

## Implemented behavior (hook points)

- Server domain: `server/woc_market_routes.ts` (RouteDef surface),
  `server/woc_market_service.ts` (lifecycle behind injected deps),
  `server/woc_market_rules.ts` (pure increments, anti-snipe, bond, eligibility,
  strike ladder), `server/woc_market_db.ts` (`WOC_MARKET_SCHEMA`, SQL),
  `server/woc_market_proxy.ts` (economy-service client),
  `server/woc_market_dev_service.ts` (dev-only in-memory service, refused in
  production), sweep registration in `server/main.ts`.
- Sim custody: `src/sim/inventory_extract.ts` (exact-copy escrow extraction),
  system-mail delivery through the existing `PostOffice`.
- Client: `src/net/woc_market_sdk.ts` (typed, never-throws),
  `src/ui/woc_market_view.ts` (pure core) + `src/ui/woc_market_window.ts`
  (painter shell), wallet signing through the existing Wallet Standard path.
- Admin: marketplace moderation endpoints and dashboard page behind a new
  admin permission.

## Open questions

- Should high-value settlements additionally take a temporary security hold
  (admin-released) on top of TOTP? Shipped as configuration, default off.
- Closely-linked-account bidding blocks beyond same-account and same-wallet:
  how much of the moderation shared-IP graph should auto-block versus flag for
  review?
- Should sales history fold into rollups after a retention window, or stay
  raw forever as provenance?

## Out of scope

- Direct P2P $WOC trading (proposal section 13) follows the auction house as
  its own change on the same settlement seams.
- Proxy (maximum) bidding.
- Cosmetic-entitlement and mount listings (no such tradeable assets exist yet).
- The separate web3 server (proposal section 14) beyond the per-server policy
  seam shipped here.
- Any on-chain item ownership; items stay off-chain game assets.
