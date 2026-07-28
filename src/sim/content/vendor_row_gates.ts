// ---------------------------------------------------------------------------
// Proficiency gates on individual NPC vendor rows
// ---------------------------------------------------------------------------
//
// A side table keyed by item id, plus one pure resolver, in the shape of the
// Delve Marks shop gate (content/delves/shop.ts): the table says which stocked
// rows carry a requirement, the resolver answers "is this row open for this
// player" and hands back the requirement itself so a surface can SAY why a
// closed row is closed. The sim's authoritative buy path (items.ts buyItem)
// and the vendor window's pure view core (ui/hud/vendor/vendor_view.ts) both
// call the resolver, so the lock a player sees can never disagree with what the
// purchase allows, offline, on the server, and headless alike.
//
// A gated row still RENDERS, greyed with its requirement, exactly like the
// trainer's locked recipes and the delve shop's locked offers. Dropping it from
// the list instead would leave a player who cannot yet buy a tier-2 pick with
// no way to learn that one exists or what opens it.
//
// Why the tool ladder is gated at all: a tool's tier is the only thing that
// decides which node tiers it can work (professions/tools.ts canGatherTier),
// nothing else gated the purchase, and every price here is inside a first-zone
// quest income. So a level-1 character with no proficiency at all could walk to
// a counter and buy the top land tool, which skips the whole tool ladder the
// gathering trades are paced around.
//
// SCOPE, stated precisely because it is narrower than it may read: this is a
// PURCHASE gate on the NPC counter, not a USE-time gate. What a tool can work
// is decided solely by `canGatherTier` (professions/tools.ts), which never
// reads proficiency, so EVERY non-counter route reaches full tier at any
// proficiency. No count is given here on purpose: the routes below are the
// ones worth naming, not a closed set, and an enumeration that claims to be
// complete is exactly the thing that rots when a future feature adds another
// way to put an item in a player's hands.
//
//  - A tool already in a player's bags. Nothing here reads or removes
//    inventory, so a tool owned before this shipped keeps working exactly as
//    it did.
//  - Buyback (items.ts buyBackItem), which is not gated on purpose: returning
//    a player their own sold item is not a new acquisition. Reaching it at 0
//    proficiency needs the tool to have been owned and sold first, which the
//    one-time mastery reset allows (it zeroes the counter at load while the
//    buyback list persists) and so does any of the routes below.
//  - The World Market. These six carry neither `noVendorSell` nor
//    `noMarketList` (of the gathering tools only the three tier-1 ones carry
//    those flags, and only to close a quest re-grant mint), so a player may buy
//    one from another player at any proficiency, which the tier-4 tool recipes
//    give real demand for since they consume the tier-3 tools as reagents.
//  - Direct trade and mail attachments, which are the same player-to-player
//    transfer through different doors: none of the six carries `soulbound` or
//    `bindOnTrade` either.
//
// The open ruling is NOT "should these be listable". Framed that way it looks
// like a one-line content edit; the real choice is whether tool tier should
// gate at USE time instead of at purchase, which would strand every player who
// already owns a tool above their proficiency and make 70 a hard prerequisite
// for the tier-4 recipes. That is the maintainer's call, and deferring it is
// the conservative side. Until it is made, do not describe this as pacing tool
// ACCESS; it paces what a merchant will sell you.
//
// DOM-free, rng-free and host-agnostic (src/sim purity, tests/architecture.test.ts).

import type { GatheringProfessionId } from './professions';

// The two thresholds, against a land-gathering cap of 100 (GATHERING_PROFESSIONS
// maxSkill). Both sit strictly below the proficiency at which a TIER-1 node
// stops teaching, which is the load-bearing property: the first zone is all
// tier-1 ground, so a threshold at or above that ceiling would be unreachable
// by a player who owns only the tier-1 tool the gather quests hand out, and the
// ladder would dead-end. tests/professions_tool_gate.test.ts derives that
// ceiling from the live gain constants and asserts the gap, so a future tuning
// pass that moves the curve fails loudly instead of quietly bricking the climb.
//
// 70 rather than 75 for the same reason with margin: 75 is exactly the ceiling,
// a knife edge where one constant change flips reachable to unreachable.

/** Gathering proficiency that opens a tier-2 land tool's vendor row. */
export const TIER2_TOOL_GATE_PROFICIENCY = 40;

/** Gathering proficiency that opens a tier-3 land tool's vendor row. */
export const TIER3_TOOL_GATE_PROFICIENCY = 70;

/** One row's requirement: proficiency in a named gathering profession. */
export interface VendorRowGate {
  /** Which gathering counter is read. Always the tool's own profession. */
  professionId: GatheringProfessionId;
  /** The proficiency at or above which the row opens. */
  proficiency: number;
}

// The gated rows, by item id. Only the tier-2 and tier-3 LAND tools appear:
//
// - Tier 1 is ungated on purpose. It is the entry implement the gather quests
//   grant through requiredItems, and the #2343 rule makes it mandatory for any
//   harvest at all, so gating it would gate gathering itself.
// - Tier 4 and 5 are crafted, carry no buyValue and sit in no vendorItems row
//   (content/items.ts), so there is no vendor row to gate.
// - The tiered fishing RODS are deliberately absent. Their profession has no
//   world nodes at all (gathering.ts NODE_TYPE_BY_PROFESSION omits fishing),
//   which is what both the threshold derivation and the zone-stocking rule are
//   expressed in terms of, and fishing counts to 200 rather than 100 so the
//   numbers here would not mean the same thing on that ladder. Rod access
//   belongs with the rest of the fishing work. The absence is asserted, not
//   assumed: tests/professions_tool_gate.test.ts pins that no fishing
//   implement carries a gate and that every other priced land tool above tier 1
//   does, so a new tool cannot ship ungated by omission.
// Frozen like its packet siblings (FISHING_ZONE_ROD_TIERS): the Readonly type
// stops a TS caller, not a JS one, and both worlds resolve gates through this
// one object, so a runtime mutation would desync buy denials silently. The
// rows are frozen too: a gate is two numbers, and half-mutable is worse than
// either.
export const VENDOR_ROW_GATES: Readonly<Record<string, VendorRowGate>> = Object.freeze({
  iron_mining_pick: Object.freeze({
    professionId: 'mining',
    proficiency: TIER2_TOOL_GATE_PROFICIENCY,
  }),
  mithril_mining_pick: Object.freeze({
    professionId: 'mining',
    proficiency: TIER3_TOOL_GATE_PROFICIENCY,
  }),
  felling_axe: Object.freeze({
    professionId: 'logging',
    proficiency: TIER2_TOOL_GATE_PROFICIENCY,
  }),
  ironbark_axe: Object.freeze({
    professionId: 'logging',
    proficiency: TIER3_TOOL_GATE_PROFICIENCY,
  }),
  bronze_sickle: Object.freeze({
    professionId: 'herbalism',
    proficiency: TIER2_TOOL_GATE_PROFICIENCY,
  }),
  silverleaf_sickle: Object.freeze({
    professionId: 'herbalism',
    proficiency: TIER3_TOOL_GATE_PROFICIENCY,
  }),
});

/** A vendor row resolved against one player's gathering proficiency: whether it
 *  is open, and, when it is not, the requirement to name. `requirement` is
 *  present on a gated row whether or not it is met, so a surface can show the
 *  threshold on an open row too if it ever wants to. */
export interface VendorRowGateState {
  /** True only when the row carries a gate the viewer has not met yet. */
  locked: boolean;
  /** The row's requirement, absent entirely on an ungated row. */
  requirement?: VendorRowGate;
}

/**
 * The one gate resolver, shared by the server-authoritative buy and the client
 * view so both answer identically. `proficiency` is the player's gathering
 * counter map (`PlayerMeta.gatheringProficiency` in the sim, the mirrored
 * `IWorld.gatheringProficiency` in the client): an untracked or missing
 * profession reads 0, which locks every gated row rather than opening it.
 */
export function resolveVendorRowGate(
  itemId: string,
  proficiency: Readonly<Record<string, number>>,
): VendorRowGateState {
  // hasOwn, not a bare lookup: the table is an object literal, so `constructor`
  // and friends would otherwise resolve to a truthy non-gate. Unreachable from
  // either live call site today, but a custom world document can put arbitrary
  // strings into an NPC's vendorItems (sim/map_doc.ts), and this resolver is
  // exported and driven directly by tests. The mirrored delve gate is
  // array-find based, so matching its shape does not cover this.
  if (!Object.hasOwn(VENDOR_ROW_GATES, itemId)) return { locked: false };
  const requirement = VENDOR_ROW_GATES[itemId];
  // Coerced, never taken on trust. The sim's own map is sanitized on load
  // (normalizeGatheringProficiency admits only finite numbers), but the ONLINE
  // client assigns the mirrored map straight off the wire with no shape check,
  // and a non-finite value would sail through a bare `<` comparison: NaN < 40
  // is false, which would OPEN a gated row. Absent and malformed must both
  // read 0 and lock, which is what the contract above promises.
  const raw = proficiency[requirement.professionId];
  const held = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  return { locked: held < requirement.proficiency, requirement };
}
