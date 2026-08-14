// Collapses a list of market listings down to at most one per distinct item id: the
// lowest-priced listing for that item (issue #3103, the Browse "lowest price of each"
// toggle). Pure and host-agnostic (no SimContext), so a Vitest can drive it directly
// with plain objects instead of a live Market.
//
// Deterministic tie-break: when two listings for the same item share the lowest price,
// the one with the smaller `id` wins (ids are assigned in strictly increasing order by
// Market.nextListingId, so this always resolves to the OLDER listing, not whichever one
// happened to sort first in the caller's array).
//
// Output order: one row per distinct item id, in the order that item id FIRST appears
// in `listings`. Feeding this the market's name-then-price sorted book (see
// Market.sortedBook) yields an alphabetically-ordered result, matching the uncollapsed
// Browse list; the function does not depend on that ordering to pick the winner. Relies
// on Map's insertion-order iteration (re-`set`ting an existing key does not move it), so
// the winners come out in first-seen order without a separate order-tracking array.

export interface CollapsibleListing {
  id: number;
  itemId: string;
  price: number;
}

export function collapseToLowestPerItem<T extends CollapsibleListing>(listings: readonly T[]): T[] {
  const bestByItem = new Map<string, T>();
  for (const listing of listings) {
    const current = bestByItem.get(listing.itemId);
    if (
      !current ||
      listing.price < current.price ||
      (listing.price === current.price && listing.id < current.id)
    ) {
      bestByItem.set(listing.itemId, listing);
    }
  }
  return [...bestByItem.values()];
}
