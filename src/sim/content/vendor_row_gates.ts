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
// nothing else gates the purchase, and every price here is inside a first-zone
// quest income. So a level-1 character with no proficiency at all could walk to
// a counter and buy the top land tool, which skips the whole tool ladder the
// gathering trades are paced around. Proficiency is the honest gate: it is
// earned by doing the thing the tool is for.
//
// Owned tools are never touched. This gates the PURCHASE only: a tool already
// in a player's bags keeps working at every tier it always did, and nothing
// here reads or removes inventory.
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
export const VENDOR_ROW_GATES: Readonly<Record<string, VendorRowGate>> = {
  iron_mining_pick: { professionId: 'mining', proficiency: TIER2_TOOL_GATE_PROFICIENCY },
  mithril_mining_pick: { professionId: 'mining', proficiency: TIER3_TOOL_GATE_PROFICIENCY },
  felling_axe: { professionId: 'logging', proficiency: TIER2_TOOL_GATE_PROFICIENCY },
  ironbark_axe: { professionId: 'logging', proficiency: TIER3_TOOL_GATE_PROFICIENCY },
  bronze_sickle: { professionId: 'herbalism', proficiency: TIER2_TOOL_GATE_PROFICIENCY },
  silverleaf_sickle: { professionId: 'herbalism', proficiency: TIER3_TOOL_GATE_PROFICIENCY },
};

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
  const requirement = VENDOR_ROW_GATES[itemId];
  if (!requirement) return { locked: false };
  const held = proficiency[requirement.professionId] ?? 0;
  return { locked: held < requirement.proficiency, requirement };
}
