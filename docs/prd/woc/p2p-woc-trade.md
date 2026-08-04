# Trading items for $WOC, player to player

Design packet. Goal: a player can sell a $WOC-tradable item directly to another
named player for $WOC, entered from the existing trade window.

Decided with the requester: gold and $WOC are mutually exclusive in one deal, the
standard 10% fee applies, and there is **no bond** but the buyer receives nothing
until payment is completed and verified.

## This cannot be the existing trade, and the reason is not policy

The in-game trade is a **single-tick atomic swap**. After both sides confirm and a
final revalidation passes, everything moves at once:

```ts
metaA.copper = metaA.copper - session.offerA.copper + session.offerB.copper;
const grantsToB = removeOffer(ctx, session.offerA.items, session.a);
grantOffer(ctx, grantsToB, session.b);
```

A $WOC payment is asynchronous. The buyer signs, the chain reaches finality, and
that takes seconds to minutes and can fail. No tick can wait for it. Swap the item
first and a failed payment means the item is gone unpaid.

Independently, `src/sim/social/trade.ts` sits inside the token firewall's scanned
tree and is not on its three-file allowlist, so no wallet, token or settlement
identifier may appear in it. That is not a formality: the same trade code runs
headless in the RL env, where there is no wallet, no chain and no signature.

## What it is instead: a directed buy-now listing

Reuse the exchange rail with a named counterparty. Concretely, a directed sale is
`format: 'buy_now'` plus a designated buyer, which means the fee split, custody
escrow, settlement window, quote/confirm path, sales history and strike ladder all
apply unchanged. The new surface is small.

The trade window becomes an **agree-terms** surface that hands off, rather than a
swap surface. Same discoverability, honest about what happens.

### Escrow timing protects both sides

- **Item escrows when the deal is agreed.** Otherwise the seller could take the
  payment and keep the item.
- **Item delivers only on verified payment.** Otherwise the buyer could take the
  item without paying. This is the requester's stated rule and it is already how
  marketplace custody works.

So the sequence is: agree, item leaves the seller's bags into escrow, buyer pays,
service verifies, item arrives by mail. **A $WOC trade is not instant**, and the
UI has to say so rather than looking like a swap that stalled.

## Gold versus $WOC is structural, not a validated rule

Worth stating because it is the cheapest correctness property here. The two are
different mechanisms:

- A gold trade is the sim's atomic swap and carries `TradeOffer.copper`.
- A $WOC trade is a directed listing, which **has no copper field at all**.

So there is no reachable state where both exist. The trade window picks a mode and
the modes are different code paths. Nothing needs to validate "not both", which is
strictly better than validating it, because a validation can be bypassed and a
missing field cannot.

## What is already built and reused verbatim

| Need | Existing |
|---|---|
| Which items may be sold for $WOC | `exchangeItemCategory` + `exchangeHardLock` + the policy |
| Taking the item safely out of the bags | `extractTradableCopy` (exact-copy escrow) |
| Delivering it | `mailSystemParcel` with a custody ref, book-once |
| The 10% fee | `splitMarketProceeds`, sum-exact 90 / 7 / 3 |
| Pricing, quoting, verifying | the settlement quote and confirm path |
| Non-payment consequence | the strike ladder |

## What is new

**1. A designated buyer on a listing.** `WocListingParams` has no counterparty
field. Add one keyed on **account**, not character: the wallet check is
account-level (`verifiedWallet(account)`), and the delivery character is already
recorded separately on the settlement.

**2. Directed listings must never appear in public browse.** This is a security
requirement, not a nicety. `browseListings` filters on realm plus status plus
optional quality/format/itemIds:

```ts
const where: string[] = ['realm = $1', "status IN ('active', 'settling', 'ending')"];
```

A directed row leaking into that result set lets a stranger buy an item meant for a
friend. It needs excluding there, and the detail endpoint must refuse it for anyone
other than the two parties.

**3. `buyNow` needs a designated-buyer guard**, refusing anyone else. Use the
404-flavoured `not_yours` shape rather than a new "not for you" code, matching the
existing anti-enumeration convention: a stranger who guesses an id learns nothing.

**4. The counterparty's wallet status on the wire, and NOT on `TradeInfo`.**
`TradeInfo` is built by the sim (`IWorldTrade`) and carries `otherPid`,
`otherName`, the offers and the accepted flags. Wallet verification is
account-level server data, and the sim may not know about wallets at all. So it
must ride a **sibling field fed by the server**, not a new member of `TradeInfo`.
Adding `otherWalletVerified` to `TradeInfo` is the obvious move and it breaches the
firewall.

**5. The trade window's $WOC arm**, its mode exclusivity, and the copy for the
"recipient must connect a wallet" case, which is a new `t()` key.

## The no-bond decision and its residual risk

Accepted: no bond. The seller is protected against loss because the item returns if
payment never lands. What remains is a **targeted denial-of-use**: a buyer can
agree, lock a specific player's item in escrow for the settlement window, and walk
away, repeatedly.

That is materially milder than the auction case that motivated bonds, because the
seller chose this counterparty rather than being exposed to any stranger. Three
mitigations that cost no custody:

1. **The window is already short.** `WOC_MARKET_SETTLEMENT_WINDOW_SECONDS` is 600.
2. **The seller can cancel before payment.** A directed listing has no standing
   bid, so the `has_bids` guard that blocks cancelling a live auction never fires.
   Worth confirming that cancel is reachable for this shape.
3. **A strike still applies.** The progressive ladder is bond-independent, so
   non-payment can carry its consequence without anything at risk up front. This
   is the cheapest teeth available and I would take it.

## Decisions (all four resolved)

**1. The seller enters USD.** The window shows the equivalent $WOC at the time of
the trade, and that figure is what the balance check uses.

Two consequences.

The displayed $WOC is a **preview, not a commitment**. USD is what is agreed; the
token amount is recomputed by a fresh quote at payment time, so the buyer may pay
more or fewer tokens than the window showed. That is the same exposure an auction
has and the existing `variableTokenWarning` copy already covers it, but here the
number is shown next to a price the two players just negotiated, so it will read as
a promise unless the copy says otherwise.

The balance check is **doing more work here than it was built for**. `guardBalance`
says so itself:

> Balance is a bid-time plausibility gate, never a guarantee (the bond is the
> enforcement).

With no bond there is no enforcement behind it, and it compares against a cached
chain read. So it can pass and payment can still fail, from a moved price or a
balance spent elsewhere. That is acceptable because the item returns, but the UI
must not present it as a guarantee that the buyer can pay.

**2. Items one way, $WOC the other, and $WOC only.** The buyer's side of the deal
is $WOC and nothing else. This is what makes the directed-listing shape fit exactly:
one seller's items, one price, one buyer. No two-way escrow, and the bigger build is
avoided.

**3. Show the net AND the fee.** Both, for transparency.

**This number must come from the server.** The view core's contract is explicit:

> The client computes NO price, token, or increment values: everything economic in
> this model is a passthrough of server-provided numbers.

And the fee schedule is not in the status payload today, so the client cannot derive
the net even if it were allowed to. Two ways to supply it, and the second is better:

- Ship the fee bps in `/status` and let the client do the USD arithmetic. Cheap, but
  it breaches the rule above and risks drift, because `splitMarketProceeds` rounds
  the burn up, then the treasury up, and gives the seller the remainder. A client
  computing a flat percentage would disagree by a cent.
- **Have the service return the split for an amount.** `/estimate` already takes
  `usdCents`; returning the three USD legs alongside the token figure makes the
  displayed net authoritative and drift-proof. Recommend this.

**4. Range stops mattering once both parties confirm.** Before mutual confirm the
window behaves normally and is proximity-gated. At mutual confirm the item escrows,
the directed listing exists, and separation is irrelevant.

This has an implementation consequence that decides the shape of the whole feature.
The sim's confirm **performs the swap** the moment both sides have accepted:

```ts
if (session.a === r.meta.entityId) session.acceptedA = true;
else session.acceptedB = true;
if (!(session.acceptedA && session.acceptedB)) return;
// ... straight into the atomic swap
```

So a $WOC deal can never route its confirm through `tradeConfirm()`. Two options:

- Reuse the sim session for NEGOTIATION only (items, accepted flags) and intercept
  the final confirm server-side. Saves the offer UI plumbing, but the sim session is
  proximity-gated and dies when players separate, which fights decision 4, and it
  means a session whose confirm must never be allowed to reach the sim.
- **Do not use the sim trade session for $WOC mode at all.** The window in $WOC mode
  is a server-negotiated directed offer: the seller picks items and a USD price, the
  buyer accepts, the server escrows and creates the listing. The sim never
  participates, so proximity, swap-on-confirm and the firewall are all non-issues by
  construction.

Recommend the second. It costs new offer/accept plumbing, and it buys a $WOC path
with no entanglement in a machine that was built to do something else atomically.

## Remaining open questions

**1. Does a directed sale enter the public sales history?** This is the one with
integrity consequences, not just preference. Every settled exchange sale is recorded
as public provenance and feeds price statistics. Both answers cost something:

- **Include it** and the price feed stays complete, but it becomes public that A
  sold to B and for how much, which is odd for a deal the two arranged privately.
- **Exclude it** and directed sales become an invisible settlement channel. That is
  precisely what someone laundering real-money trades or wash-trading to move a
  price would want, and it would be the only path on the rail with no public record.

Recommend including it, possibly with the counterparty names suppressed while the
item and price stay public. Privacy of the negotiation is not the same as privacy of
the settlement.

**2. Does 2FA apply?** `guardTotp` runs on `buyNow`, so a directed sale at or above
the threshold ($100 by default) would demand a code automatically. That is the right
default for a payment that size, but it will surprise two players who think they are
doing a face-to-face trade. Confirm it is intended and make the copy explain it
rather than just refusing.

**3. Does a directed offer count against the 12-listing cap?**
`WOC_MARKET_MAX_ACTIVE_LISTINGS` is 12. A directed offer holds an item in escrow
exactly as a listing does, so it should count, otherwise it is a way around the cap.
Confirm.

**4. Do strikes apply to a directed non-payment?** Recommended above as the teeth
that replace the bond, since the ladder is bond-independent. Not yet confirmed. If
they do not apply, non-payment is entirely free and the denial-of-use above has no
consequence at all.

## Sequencing

This shares the builder, verifier and releaser with an auction, so it cannot be
tested end to end until those exist. It should land **after** the chain wiring
(`MARKET_CHAIN_WIRING.md` in the payout service), and reuse rather than
parallel-build.
