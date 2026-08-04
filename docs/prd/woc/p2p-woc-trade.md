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

## Open questions

**1. Does the seller enter USD or $WOC?** The requirement says "a $WOC value", but
every downstream rail is USD-denominated: the fee split, the min and max price
rails, the 2FA threshold, and the sales history. Entering USD with a live $WOC
preview keeps all of that intact and matches the auction UI. Entering $WOC means
converting to USD cents at agreement and locking it, and every rail then operates
on a derived number. Recommend USD with a $WOC preview, but this contradicts the
literal request so it needs confirming.

**2. May the $WOC side also offer items?** The stated rules exclude only gold. But a
listing is "one seller's items for a price", so a two-way item swap with $WOC on one
side is not a listing shape: it needs escrowing BOTH sides and is a materially
bigger build than a directed listing. Recommend scoping v1 to items one way, $WOC
the other, and treating two-way as a separate feature if it is wanted.

**3. Does the seller see their net?** The fee means they receive 90%. In an auction
the fee is a note; here the price is agreed face to face, so the net is the number
that matters. Recommend showing both.

**4. Does leaving range cancel it?** The sim trade dies when players separate. A
directed listing outlives the trade window by design, since the buyer needs time to
sign. Recommend that the listing survives, and that the trade window closing is not
a cancellation.

## Sequencing

This shares the builder, verifier and releaser with an auction, so it cannot be
tested end to end until those exist. It should land **after** the chain wiring
(`MARKET_CHAIN_WIRING.md` in the payout service), and reuse rather than
parallel-build.
