// Pure, host-agnostic core for the profession GRANT LINES (#2430): the single
// chat line a player-initiated profession action prints for the items it
// granted.
//
// Background: every grant in the game flows through the one shared inventory
// hub (Sim.addItem/addItemInstance), which emits a 'loot' SimEvent carrying a
// flat "You receive: X" line. A profession action ALSO emits its own richer
// result event (gatherResult / fishingResult / craftResult / disenchantResult /
// salvageResult / enchantResult), so one action printed two lines for one
// grant, the plainer one first. The hub line now stands down for those grants
// (the loot event's `callerLogs` flag, see src/sim/types.ts), which makes the
// profession's own line the ONLY line for the grant, so it has to carry
// everything the hub line used to: the item, its quantity, and a link to it.
//
// This module owns the two decisions that gives the HUD, so the event arms in
// hud.ts stay thin and both are unit-testable in Node:
//  - grantItemToken: the chat token for a granted item (the name-free
//    [[i:id]] link the chat log renders as a clickable, quality-colored
//    [Name], with a plain-text fallback for an id the client cannot resolve).
//  - the yield-key selectors: which catalog key one result event renders,
//    picking the quantity-bearing variant only for a multi-unit grant.
//
// DOM/Three-free (registered in tests/architecture.test.ts UI_PURE_CORES).

import { ITEMS } from '../sim/data';
import { itemDisplayName } from './entity_i18n';
import { encodeItemLink } from './hud/quest/quest_link';
import type { TranslationKey } from './i18n.catalog';

// The chat-link parser (hud/quest/quest_link.ts CHAT_LINK_RE) only recognizes
// [A-Za-z0-9_]+ ids; a token it cannot parse would print to the player as the
// literal "[[i:...]]" source text, so anything else falls back to plain text.
const LINKABLE_ITEM_ID = /^[A-Za-z0-9_]+$/;

/** The chat token for one granted item: the name-free `[[i:id]]` link when the
 *  client can resolve it (the chat log renders it as a clickable, tooltipped,
 *  quality-colored `[Name]`), otherwise the plain localized name. An id absent
 *  from ITEMS (content drift between client and server) degrades to the raw id
 *  rather than the renderer's bare `[?]`, so the line still names something. */
export function grantItemToken(itemId: string): string {
  const item = ITEMS[itemId];
  if (!item) return itemId;
  return LINKABLE_ITEM_ID.test(itemId) ? encodeItemLink(itemId) : itemDisplayName(item);
}

/** True when a grant of `count` units should render the quantity-bearing line
 *  variant. Absent/1 renders the plain variant, matching the hub line's own
 *  " xN"-only-past-one rule (Sim.addItem). */
export function isMultiUnitGrant(count: number | undefined): boolean {
  return (count ?? 1) > 1;
}

/** The gather line for one harvest: the quantity variant only past one unit. */
export function gatherLineKey(qty: number): TranslationKey {
  return isMultiUnitGrant(qty)
    ? 'hudChrome.gathering.gatherLineQty'
    : 'hudChrome.gathering.gatherLine';
}

/** The crafted line for one successful craft: the quantity variant only for a
 *  resultCount > 1 recipe, whose count used to be visible ONLY through the
 *  hub line's " xN" suffix. */
export function craftedLineKey(count: number | undefined): TranslationKey {
  return isMultiUnitGrant(count)
    ? 'hudChrome.crafting.craftedToastQty'
    : 'hudChrome.crafting.craftedToast';
}

// The three enchanting-action lines (disenchant / salvage / apply-enchant)
// keep their key selection in src/ui/enchanting_view.ts, which already owns the
// event -> key + sink mapping for those commands; it consumes isMultiUnitGrant
// above so all four families agree on when a quantity is worth showing.
