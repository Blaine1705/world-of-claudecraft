// Gathering tool tier gating (#1123, extended by #1135). A base gathering
// tool has a tier; the tool's tier gates which node tiers AND which monster
// material tiers it can gather/harvest, via one shared comparator. This
// module is a pure leaf: no SimContext state, just the comparison +
// item-shape helpers, so it is Vitest-importable directly (like
// threat.ts/spatial.ts).
//
// This repo has no durability mechanic anywhere in ItemDef (see types.ts):
// a base gathering tool never carries a durability field, so it can never
// become unusable from durability loss. That is a property of the item shape,
// not something this module enforces at runtime.

import {
  GATHERING_PROFESSION_IDS,
  type GatheringProfessionId,
  TOOL_EFFECTS,
  type ToolEffectId,
} from '../content/professions';
import type { InvSlot, ItemDef, ItemUse } from '../types';
import type { MaterialRarity } from './gathering';
import { type CraftSkillState, rechargeDiscountMultiplier } from './wheel';

export interface GatherToolUse {
  type: 'gatherTool';
  professionId: GatheringProfessionId;
  tier: number;
}

export function isGatherToolUse(use: ItemUse | undefined): use is GatherToolUse {
  return !!use && use.type === 'gatherTool';
}

// Returns the tool's gathering tier, or undefined if the item is not a
// gathering tool for the given profession.
export function gatherToolTier(
  item: ItemDef | undefined,
  professionId: GatheringProfessionId,
): number | undefined {
  if (!item?.use || !isGatherToolUse(item.use)) return undefined;
  if (item.use.professionId !== professionId) return undefined;
  return item.use.tier;
}

// Shared pure comparator (#1135): a tool of a given tier covers its own tier and
// every tier below it, never above. Both node gating and monster-material
// gating reuse this single comparison so the semantics can never drift apart.
function toolTierCovers(toolTier: number, targetTier: number): boolean {
  return toolTier >= targetTier;
}

// True only when the player's tool tier is at least the node/material tier:
// a tier-1 tool cannot gather a tier-2+ node, a tier-2 tool can gather tier 1
// and tier 2, and so on. A tool's rarity (ItemDef `quality`) never enters THIS
// check: gating is tier-only, and that is the part that must never change.
//
// Rarity is no longer cosmetic, though, which amends the older claim here.
// It buys narrow bonuses that cannot affect access: charges on a slotted
// effect (`startingDurabilityFor`) and a wider reel window on a rod. An epic
// tool opens no node a common tool of the same tier cannot, which is exactly
// what this function keeps true. Rarity is also a COARSENING of tier rather
// than a second axis: every shipped gathering tool's rarity follows its tier,
// and tiers 1 and 2 are both common.
export function canGatherTier(playerToolTier: number, nodeTier: number): boolean {
  return toolTierCovers(playerToolTier, nodeTier);
}

// True only when the player's tool tier is at least the monster material's
// tier (#1135): e.g. skinning/harvesting a material off a slain monster. Same
// semantics as `canGatherTier`, reusing the one shared comparator so node
// gating and monster-material gating can never fall out of sync.
export function canHarvestMonsterMaterial(toolTier: number, materialTier: number): boolean {
  return toolTierCovers(toolTier, materialTier);
}

// Owned-best tool resolution (Professions 2.0). Bare hands resolve to
// effective tool tier 1 for the surfaces that still allow them (corpse
// harvesting, the fishing catch-band floor); NODE gathering does not (#2343,
// below). `items` is passed as a parameter (never imported) so this module
// stays a pure leaf.
export const BARE_HANDS_TOOL_TIER = 1;

// No matching-profession tool owned at all. Distinct from the bare-hands
// floor: node gathering (#2343, the RuneScape rule) requires a REAL tool for
// every node, so its gate needs to see "none" rather than the floored tier.
export const NO_TOOL_OWNED = 0;

// The best (highest) matching-profession gatherTool tier anywhere in the
// player's bags, or NO_TOOL_OWNED when none is carried. Pure bag scan, no
// equip slot: owning the tool is carrying it.
export function bestOwnedGatherToolTierOrNone(
  inventory: readonly InvSlot[],
  professionId: GatheringProfessionId,
  items: Readonly<Record<string, ItemDef>>,
): number {
  let best = NO_TOOL_OWNED;
  for (const slot of inventory) {
    const tier = gatherToolTier(items[slot.itemId], professionId);
    if (tier !== undefined && tier > best) best = tier;
  }
  return best;
}

// The best matching-profession gatherTool tier, floored at
// BARE_HANDS_TOOL_TIER. The bare-hands-tolerant surfaces (corpse harvesting,
// fishing's band cap and bite/reel synergy) read this one.
export function bestOwnedGatherToolTier(
  inventory: readonly InvSlot[],
  professionId: GatheringProfessionId,
  items: Readonly<Record<string, ItemDef>>,
): number {
  return Math.max(
    BARE_HANDS_TOOL_TIER,
    bestOwnedGatherToolTierOrNone(inventory, professionId, items),
  );
}

/** The best owned tool as BOTH of the axes a bonus can read: its tier and its
 *  own rarity. */
export interface OwnedGatherTool {
  /** Same number `bestOwnedGatherToolTier` returns, bare-hands floor included. */
  tier: number;
  /**
   * The same scan WITHOUT the bare-hands floor: NO_TOOL_OWNED when no matching
   * tool is carried, exactly as `bestOwnedGatherToolTierOrNone` reports it.
   * Carried alongside `tier` so a caller that must distinguish "no tool" from
   * "tier 1" (the node gate's rule, and the slot gate's) gets both answers from
   * ONE bag walk instead of scanning twice.
   */
  ownedTier: number;
  /**
   * The winning tool's `quality`, or 'common' when the tier came from the
   * bare-hands floor rather than from a def. Typed as the full `ItemDef`
   * quality union rather than `MaterialRarity`, because a def may legitimately
   * carry `'poor'` or omit `quality` entirely, and both are values
   * `MaterialRarity` excludes. Every consumer routes through
   * `rarityLadderIndex`, which floors them at the common rung.
   */
  rarity: ItemDef['quality'];
}

// The rarity-carrying twin of `bestOwnedGatherToolTier`, for the one bonus that
// reads a tool's rarity off the LIVE path (the rod reel window). Kept beside it
// rather than folded into it because every other caller wants the bare number,
// and widening the three tier-only gates to carry a rarity they never read is
// exactly the coupling the per-profession slot decision avoided.
//
// Ordered by tier FIRST and rarity only as the tie-break, so it can never
// prefer a shinier low-tier tool over a plainer high-tier one. No shipped
// content reaches the tie-break: every gathering tool's rarity is a function of
// its tier, so no two tools of one profession share a tier at different
// rarities. It is here so that a future pair which does share a tier resolves
// deterministically instead of by bag order, which is player-controlled.
export function bestOwnedGatherToolFor(
  inventory: readonly InvSlot[],
  professionId: GatheringProfessionId,
  items: Readonly<Record<string, ItemDef>>,
): OwnedGatherTool {
  let best: OwnedGatherTool = {
    tier: BARE_HANDS_TOOL_TIER,
    ownedTier: NO_TOOL_OWNED,
    rarity: 'common',
  };
  for (const slot of inventory) {
    const def = items[slot.itemId];
    const tier = gatherToolTier(def, professionId);
    if (tier === undefined) continue;
    const rarity = def?.quality ?? 'common';
    if (
      tier > best.ownedTier ||
      (tier === best.ownedTier && rarityLadderIndex(rarity) > rarityLadderIndex(best.rarity))
    ) {
      best = { tier: Math.max(BARE_HANDS_TOOL_TIER, tier), ownedTier: tier, rarity };
    }
  }
  return best;
}

// True when the player carries ANY fishing implement: the simple pole
// (use.type 'fishing') or a tiered fishing-profession gatherTool rod. The
// startFishing implement gate (#2343: casting a line always needs tackle in
// bags, the node-tool rule's fishing arm) reads this; pure bag scan.
export function hasFishingImplement(
  inventory: readonly InvSlot[],
  items: Readonly<Record<string, ItemDef>>,
): boolean {
  return inventory.some((slot) => {
    const use = items[slot.itemId]?.use;
    return (
      !!use &&
      (use.type === 'fishing' || (use.type === 'gatherTool' && use.professionId === 'fishing'))
    );
  });
}

// The best owned gatherTool tier across EVERY gathering profession, floored at
// BARE_HANDS_TOOL_TIER. This is the corpse-harvest gate's input: a monster
// material has no single owning profession, so any gathering tool counts.
export function bestOwnedAnyGatherToolTier(
  inventory: readonly InvSlot[],
  items: Readonly<Record<string, ItemDef>>,
): number {
  let best = BARE_HANDS_TOOL_TIER;
  for (const professionId of GATHERING_PROFESSION_IDS) {
    const tier = bestOwnedGatherToolTier(inventory, professionId, items);
    if (tier > best) best = tier;
  }
  return best;
}

// Tool effect slotting (#1136). Durability is a standalone counter on a
// `ToolEffectSlot`, and the caller owns where that slot lives.
//
// The original note here said this repo had no per-instance item payload to
// hang charges on. That is no longer true: `ItemInstancePayload` (types.ts)
// carries `charges?: Record<string, number>`, described in exactly those
// words, it is deep-cloned already, and inventory ships wholesale over the
// wire, so a payload-resident counter would get persistence and the wire for
// free. The route was re-examined on those facts rather than on the old note,
// and the slot still does NOT live there, for a reason that has nothing to do
// with availability:
//
// the live harvest path resolves a TOOL TIER, never a tool. Nothing on it ever
// holds the particular pick that satisfied the gate, because
// `bestOwnedGatherToolTierOrNone` returns a number, and its callers are the
// node gate, the corpse gate and fishing's band cap. Keying a slot per item
// would mean widening all three to carry an item through, and a slot bought
// for a tier-4 pick would go inert the moment its owner crafts the tier-5 one,
// which inverts the point of giving players a reason to chase the better tool.
//
// So a slot is keyed per gathering profession by its owner (PlayerMeta), and
// this module stays a pure leaf that stores nothing: it is handed a slot and
// returns what the slot does.
// Always-or-prompt-on-use configuration (#1138): a high-value slotted effect
// spends a charge every use it fires. 'always' preserves #1136's original
// baseline (fires and spends every use, no gate). 'prompt' means the player
// must explicitly confirm each use before it is allowed to fire and spend a
// charge; an unconfirmed use skips the effect entirely (no bonus, no charge
// spent) while the underlying harvest/craft action still proceeds.
export type ToolEffectConfirmMode = 'always' | 'prompt';

export interface ToolEffectSlot {
  effectId: ToolEffectId;
  /** Remaining charges. Reaches 0 when the effect is fully depleted. */
  durability: number;
  /**
   * Charges this slot was minted with, which is what a recharge restores it
   * to. Stored rather than re-derived because it depends on the rarity of the
   * tool the effect was slotted onto (see `startingDurabilityFor`), and a
   * recharge has no reliable way to know which tool that was: the owner may
   * have crafted a better one since.
   */
  maxDurability: number;
  /**
   * Player id of whoever produced this effect via the production craft that
   * made it (#1137). Additive and optional: undefined means either no
   * identity was recorded, or the slot predates this field. Recharging
   * (below) reads this only to decide the original-crafter discount; it
   * never gates the base tool or the bonus itself.
   */
  craftedBy?: string;
  /** How this slot's effect fires. Defaults to 'always' (see slotEffect). */
  confirmMode: ToolEffectConfirmMode;
}

// Attaches an effect from the catalog to a tool, at its full starting
// durability. Re-slotting (calling this again) always resets to full charges,
// same as installing a fresh effect. `craftedBy` (#1137) records the player
// id of the production craft that made this effect, if known; omit it when no
// identity is available (the slot is then never eligible for the
// original-crafter recharge discount). `confirmMode` (#1138) defaults to
// 'always' so a caller that never touches the new config gets #1136's exact
// prior behavior. Keyword options (not positional) so a future third option
// can't silently rebind an existing one.
export function slotEffect(
  effectId: ToolEffectId,
  options: {
    craftedBy?: string;
    confirmMode?: ToolEffectConfirmMode;
    toolRarity?: ItemDef['quality'];
  } = {},
): ToolEffectSlot {
  const { craftedBy, confirmMode = 'always', toolRarity = 'common' } = options;
  const durability = startingDurabilityFor(effectId, toolRarity);
  return {
    effectId,
    durability,
    maxDurability: durability,
    craftedBy,
    confirmMode,
  };
}

/**
 * Resolve one slot request into the slot it should mint, or null to refuse.
 *
 * The whole decision lives here rather than on the Sim coordinator, matching
 * what `resolveTrain` does for `Sim.trainRecipe`: none of these gates need the
 * coordinator's private mutable state, they need an inventory and an item
 * table, and this module already takes both as parameters. That also makes
 * every refusal arm unit-testable without constructing a Sim.
 *
 * Five refusals, all before any mutation and all draw-free:
 *   - a profession id that is not a gathering profession
 *   - an effect id absent from the live catalog
 *   - a pair the slot POLICY refuses (`slotToolEffectRefused` below: the
 *     Springback Charm everywhere, every effect on fishing)
 *   - any confirm mode other than 'always'. A malformed value is refused
 *     OUTRIGHT rather than falling back, and 'prompt' is refused too, for now:
 *     `resolveHarvest` passes `confirmed: true` unconditionally because no
 *     confirmation flow exists, so a 'prompt' slot would fire and spend a
 *     charge on every harvest while telling its owner it asks first. Accepting
 *     it here is what would make that comment in gathering.ts false. The
 *     'prompt' machinery in `resolveToolEffectUse` stays, ready for the flow.
 *   - no REAL tool carried for that profession. Reads
 *     `bestOwnedGatherToolTierOrNone`, which returns NO_TOOL_OWNED rather than
 *     the bare-hands floor, so carrying nothing is not carrying a tier-1 tool.
 *
 * The owned-tool scan runs ONCE and answers both the refusal and the rarity the
 * charges are minted from, so a player with no tool is refused before any work
 * that only a success needs.
 *
 * `craftedBy` is deliberately LEFT UNSET. Its documented meaning is whoever
 * produced the effect through the production craft that made it, and no such
 * craft exists yet; recording the slotter instead would be both a lie and a
 * permanent 50 percent recharge discount for every self-slotted effect
 * (`isOriginalCrafter`). It would also persist a value that cannot survive:
 * entity ids restart at 1 every boot, so a stored one stops matching its owner
 * and eventually matches whoever inherits the id. The un-discounted generic
 * rate is the documented default for a slot with no recorded crafter.
 */
export function resolveSlotToolEffect(
  inventory: readonly InvSlot[],
  professionId: string,
  effectId: string,
  confirmMode: ToolEffectConfirmMode,
  items: Readonly<Record<string, ItemDef>>,
): { professionId: GatheringProfessionId; slot: ToolEffectSlot } | null {
  if (!(GATHERING_PROFESSION_IDS as readonly string[]).includes(professionId)) return null;
  if (!Object.hasOwn(TOOL_EFFECTS, effectId)) return null;
  if (slotToolEffectRefused(professionId, effectId)) return null;
  if (confirmMode !== 'always') return null;
  const profession = professionId as GatheringProfessionId;
  const best = bestOwnedGatherToolFor(inventory, profession, items);
  if (best.ownedTier === NO_TOOL_OWNED) return null;
  return {
    professionId: profession,
    slot: slotEffect(effectId as ToolEffectId, {
      confirmMode,
      toolRarity: best.rarity,
    }),
  };
}

/**
 * Slot policy (R9): pairs refused even though the catalog knows the effect.
 * Two arms, both wire-it-then-widen rather than ship-it-inert:
 *
 * - `quickening_charm` (Springback Charm), on every profession: its
 *   respawnSpeed bonus arm is a deliberate no-op (`applyEffectBonus` returns
 *   the outcome unchanged, pinned in tests/professions_tools.test.ts) while
 *   depletion runs unconditionally, so a slotted charm burns charges for zero
 *   benefit and the catalog description still promises respawn shortening.
 *   Refused until the bonus arm is wired for real.
 * - fishing, for every effect: `completeFishing` never consults the effect
 *   system, so a fishing slot would be mintable, HUD-rendered, and inert:
 *   never fires, never spends. Refused until an effect has real fishing
 *   behavior (wiring one needs its own draw-order review; the catch-table
 *   draw sits ahead of the grant).
 *
 * Consulted by BOTH arms so they cannot drift: `resolveSlotToolEffect` (the
 * mint) and `normalizeToolEffectSlots` (the load), where a persisted row
 * minted before this policy existed drops exactly like a retired id.
 */
export function slotToolEffectRefused(professionId: string, effectId: string): boolean {
  return professionId === 'fishing' || effectId === 'quickening_charm';
}

/**
 * Deep-copy slots on the way OUT to a save, so the persisted snapshot can never
 * alias the live counters. `depleteEffect` mutates `durability` IN PLACE on
 * every harvest, so a shallow spread would hand the save layer the same objects
 * the sim keeps decrementing.
 */
export function structuredCloneToolEffectSlots(
  slots: Partial<Record<GatheringProfessionId, ToolEffectSlot>>,
): Partial<Record<GatheringProfessionId, ToolEffectSlot>> {
  const out: Partial<Record<GatheringProfessionId, ToolEffectSlot>> = {};
  for (const professionId of GATHERING_PROFESSION_IDS) {
    const slot = slots[professionId];
    if (slot) out[professionId] = { ...slot };
  }
  return out;
}

/**
 * Re-validate persisted tool-effect slots on the way IN, returning undefined
 * when nothing usable survives.
 *
 * Undefined rather than `{}` is the contract, and it is load-bearing: the
 * caller assigns the PlayerMeta field only when this returns a value, so a
 * character who has never slotted an effect keeps the field ABSENT. An empty
 * object still serializes into the parity state digest, and initialising it
 * moved every golden in the suite for a feature no scenario uses.
 *
 * Persisted JSONB is data the process wrote, not data a client sent, but it can
 * still be older than the content it names: retiring an effect id or a
 * gathering profession would otherwise load a slot that no catalog lookup can
 * resolve, and `TOOL_EFFECTS[slot.effectId]` is a bare index that would hand
 * `applyEffectBonus` an undefined def and throw on the next harvest. Every row
 * is therefore checked against live content and every counter clamped, rather
 * than trusted because it came from our own save. Rows the slot POLICY refuses
 * (`slotToolEffectRefused`) drop the same way: a row minted before the policy
 * existed must not outlive it through a restart.
 */
export function normalizeToolEffectSlots(
  saved: Partial<Record<string, ToolEffectSlot>> | undefined,
): Partial<Record<GatheringProfessionId, ToolEffectSlot>> | undefined {
  if (!saved) return undefined;
  let out: Partial<Record<GatheringProfessionId, ToolEffectSlot>> | undefined;
  for (const professionId of GATHERING_PROFESSION_IDS) {
    const row = saved[professionId];
    if (!row || !Object.hasOwn(TOOL_EFFECTS, row.effectId)) continue;
    if (slotToolEffectRefused(professionId, row.effectId)) continue;
    // A stored maxDurability that is not a usable positive integer falls back
    // to the catalog's own starting value, because a recharge restores TO this
    // number and a dead one would make the slot permanently useless.
    //
    // The test explicitly: `Math.floor(x) || catalog` is NOT enough, because
    // Math.floor(-5) is -5, which is truthy, so a negative short-circuits past
    // the fallback and a Math.max(1, ...) floor then hands back a ONE-charge
    // slot rather than the catalog value. Zero and NaN take the fallback but a
    // negative did not, which is the kind of split the `||` idiom hides.
    //
    // Deliberately one-sided: there is no upper clamp, because the stored max
    // must survive a future catalog rebalance DOWNWARD (that is the whole
    // reason it is stored rather than re-derived).
    const storedMax = Math.floor(row.maxDurability);
    const maxDurability =
      Number.isFinite(storedMax) && storedMax > 0
        ? storedMax
        : TOOL_EFFECTS[row.effectId].startingDurability;
    out ??= {};
    out[professionId] = {
      effectId: row.effectId,
      durability: Math.min(maxDurability, Math.max(0, Math.floor(row.durability) || 0)),
      maxDurability,
      craftedBy: typeof row.craftedBy === 'string' ? row.craftedBy : undefined,
      confirmMode: row.confirmMode === 'prompt' ? 'prompt' : 'always',
    };
  }
  return out;
}

// The outcome shape a harvest produces, in the axes the LIVE harvest path
// actually has (professions/gathering.ts resolveHarvest). It used to carry
// `{quantity, quality, respawnTicks}`, which was authored before there was a
// call site and matched none of them: the live path has no numeric quality,
// its rarity is an enum from `rollMaterialRarity`, and it writes respawn in
// SECONDS, before either draw. Reshaped to the live path rather than adapted
// at the call site, so nothing here is a field no caller reads.
export interface HarvestOutcome {
  /** Units the harvest grants. Read after both draws, so raising it is free. */
  quantity: number;
  /**
   * The effective tool tier the FINE-GRADE comparison reads
   * (material_grades.ts `yieldsFineGrade`). Deliberately NOT the access gate:
   * `canGatherTier` reads the player's real tool tier, so an effect can change
   * what comes out of a vein and can never change which veins open. That
   * separation is what keeps a slotted effect inside the "narrow bonuses that
   * never affect access" ruling.
   */
  gradeToolTier: number;
}

// Pure: returns a NEW outcome with the slotted effect's bonus applied, or the
// SAME outcome (by value, unchanged) when there is no slot or its durability
// has reached 0. The base tool's own tier/gating (canGatherTier /
// canHarvestMonsterMaterial above) is untouched either way: a depleted effect
// never blocks the base tool, it just stops contributing its bonus.
export function applyEffectBonus(
  slot: ToolEffectSlot | undefined,
  outcome: HarvestOutcome,
): HarvestOutcome {
  if (!slot || slot.durability <= 0) return outcome;
  const def = TOOL_EFFECTS[slot.effectId];
  switch (def.kind) {
    case 'quantity':
      return { ...outcome, quantity: outcome.quantity + def.bonus };
    case 'quality':
      return { ...outcome, gradeToolTier: outcome.gradeToolTier + def.bonus };
    case 'respawnSpeed':
      // Deliberately inert, and this arm is the record of why rather than an
      // oversight. A respawn-speed bonus shortens the node timer, which points
      // the endgame gathering loop back at the starter zone, so the effect
      // carrying it (Springback Charm) ships as catalog content with no live
      // behaviour. The live respawn is also written in SECONDS and BEFORE both
      // draws, so the shipped bonus of 1 would have shaved one second off 240
      // if it had simply been pointed at the live field.
      return outcome;
  }
}

// The standard rarity ladder (MaterialRarity: common/uncommon/rare/epic/
// legendary, see gathering.ts), read here as a tool's own rarity (ItemDef
// `quality`). It is the only input to the charge ladder below AND to the rod
// reel-window bonus (professions/fishing.ts fishReelWindowSecFor), which is why
// it is exported: two bonuses keyed to the same ladder must not each carry
// their own copy of the rung order.
const RARITY_ORDER: readonly MaterialRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * The rung a tool's rarity sits on, 0 for common. Takes the full `ItemDef`
 * quality union rather than `MaterialRarity`, so the two off-ladder inputs a
 * real item def can present resolve to the common rung instead of to -1:
 * `undefined` (a def that omits `quality` entirely) and `'poor'` (the one
 * quality `MaterialRarity` excludes). Both used to fall through `indexOf` as
 * -1, which SUBTRACTED a rung: a poor-quality tool would have minted a slot
 * with ten charges FEWER than a common one, and would now also open a reel
 * window narrower than the base. Nothing ships at either value today, so this
 * is a floor rather than a fix for live content.
 */
export function rarityLadderIndex(rarity: ItemDef['quality']): number {
  const rung = RARITY_ORDER.indexOf(rarity as MaterialRarity);
  return rung < 0 ? 0 : rung;
}

// How many extra charges each rung of tool rarity buys a slotted effect.
//
// This REPLACES a probabilistic consumption curve that keyed the same intent
// ("a better tool's effect lasts longer") to an rng roll per use. The roll had
// to go: the live harvest path draws exactly twice per granted harvest and is
// golden-pinned at that, so a depletion roll would have been a third draw for
// every player owning a slot. The intent survives here, where it costs no draw
// at all and is legible to a player as a number instead of a hidden rate.
//
// Read against `RARITY_ORDER`, so it is a STEP FUNCTION OF TIER rather than an
// independent axis: every shipped gathering tool's rarity is a function of its
// tier, and tiers 1 and 2 are both common. That is the honest description, and
// it is what makes this a rarity bonus rather than a second tier bonus for
// land tools: a tier-1 and a tier-2 pick are both common and last the same,
// while tier otherwise orders everything strictly.
export const RARITY_DURABILITY_BONUS = 10;

/** The charges a fresh slot of `effectId` gets on a tool of `toolRarity`. */
export function startingDurabilityFor(
  effectId: ToolEffectId,
  toolRarity: ItemDef['quality'],
): number {
  return (
    TOOL_EFFECTS[effectId].startingDurability +
    RARITY_DURABILITY_BONUS * rarityLadderIndex(toolRarity)
  );
}

// Spends one charge, and draws NOTHING.
//
// The property being given up is worth naming, because the old comment here
// leaned on it: depletion used to roll `Rng.chance` even at durability 0, so
// the depletion SEQUENCE was independent of an effect's remaining charges. It
// is still order-independent, for a stronger reason. There is no draw to
// order, so nothing about a slot can move the world's rng stream, and a player
// who owns a slot and a player who does not walk the same stream. That is what
// lets this be wired into a harvest path pinned at exactly two draws.
//
// Mutates `slot.durability` in place and returns whether it decremented.
export function depleteEffect(slot: ToolEffectSlot | undefined): boolean {
  if (!slot || slot.durability <= 0) return false;
  slot.durability -= 1;
  return true;
}

// Effect recharge (#1137). A depleted (or partially depleted) effect can be
// restored to full durability by recharging it through the production craft
// that made it, or through a generic Enchanter/Scribe. Recharging through the
// effect's ORIGINAL crafter (the `craftedBy` recorded on the slot at
// `slotEffect` time) is cheaper and faster than a generic recharge: this is
// the whole point of recording `craftedBy` on the slot. Both costs are fixed
// multiples of the same base cost, so the discount can never invert.
export interface RechargeCost {
  /** Crafting materials consumed by the recharge. */
  materials: number;
  /** Ticks (20 Hz) the recharge takes to complete. */
  ticks: number;
}

// Base cost for a generic Enchanter/Scribe recharge, before the
// original-crafter discount is considered.
const RECHARGE_BASE_MATERIALS = 4;
const RECHARGE_BASE_TICKS = 20 * 30; // 30 seconds

// The original crafter pays half the materials and half the time of a
// generic recharge. Kept as one named fraction so both halves of the
// discount can never drift apart.
const ORIGINAL_CRAFTER_DISCOUNT = 0.5;

// True only when the slot recorded who crafted the effect AND that identity
// matches the player attempting the recharge. A slot with no recorded
// `craftedBy` (an effect slotted before #1137, or with no known crafter) is
// never eligible for the discount, so it always costs the generic rate.
export function isOriginalCrafter(slot: ToolEffectSlot, rechargerId: string): boolean {
  return slot.craftedBy !== undefined && slot.craftedBy === rechargerId;
}

// Pure: the materials/time a recharge of this slot would cost `rechargerId`.
// Strictly less for the original crafter than for anyone else (a generic
// Enchanter/Scribe), on both dimensions.
//
// Specialization recharge discount (#1134): when `rechargerId` is also the
// original crafter AND `rechargerSkills` shows them specialized in the
// effect's craft (`TOOL_EFFECTS[slot.effectId].craftId`, per
// ../content/professions.ts), an ADDITIONAL discount from
// `rechargeDiscountMultiplier` (wheel.ts) composes with (multiplies into,
// never replaces) the existing original-crafter discount. A non-original
// recharger never sees this discount even if `rechargerSkills` shows them
// specialized: the perk is specifically for recharging one's OWN work.
// `rechargerSkills` is optional and defaults to empty (no specialization),
// so existing #1137 call sites that don't yet pass it behave unchanged.
export function rechargeCost(
  slot: ToolEffectSlot,
  rechargerId: string,
  rechargerSkills: CraftSkillState = {},
): RechargeCost {
  const isOriginal = isOriginalCrafter(slot, rechargerId);
  let discount = isOriginal ? ORIGINAL_CRAFTER_DISCOUNT : 1;
  if (isOriginal) {
    const craftId = TOOL_EFFECTS[slot.effectId].craftId;
    discount *= rechargeDiscountMultiplier(rechargerSkills, craftId);
  }
  return {
    materials: Math.ceil(RECHARGE_BASE_MATERIALS * discount),
    ticks: Math.ceil(RECHARGE_BASE_TICKS * discount),
  };
}

export interface RechargeResult {
  /** False when `materialsProvided` did not cover the computed cost. */
  success: boolean;
  cost: RechargeCost;
}

// Attempts to recharge `slot` for `rechargerId`, consuming
// `materialsProvided`. On success, durability is restored to the effect's
// full starting value (same as a fresh `slotEffect`) so `applyEffectBonus`
// resumes applying its bonus immediately; `craftedBy` is left untouched, so a
// recharge never changes who the slot's original crafter is. On failure
// (insufficient materials) the slot is not mutated at all. The caller is
// responsible for actually deducting `cost.materials` from the recharger's
// inventory and for gating `cost.ticks` as craft-time, same as any other
// production craft; this module only computes the cost and applies the
// durability restore.
export function rechargeEffect(
  slot: ToolEffectSlot,
  rechargerId: string,
  materialsProvided: number,
  rechargerSkills: CraftSkillState = {},
): RechargeResult {
  const cost = rechargeCost(slot, rechargerId, rechargerSkills);
  if (materialsProvided < cost.materials) {
    return { success: false, cost };
  }
  // Back to what THIS slot was minted with, not to the catalog's base: the
  // rarity of the tool it was slotted onto is already priced into
  // `maxDurability`, and a recharge must not quietly demote an epic tool's
  // slot to a common one's charge count.
  slot.durability = slot.maxDurability;
  return { success: true, cost };
}

// The outcome of attempting to use a slotted effect for one harvest/craft
// action, after the always/prompt-on-use gate (#1138) has been applied.
export interface ToolEffectUseResult {
  outcome: HarvestOutcome;
  /** True if depleteEffect actually decremented durability this call. */
  depleted: boolean;
  /** False only when a 'prompt' slot was not confirmed, so nothing fired. */
  applied: boolean;
}

// The always/prompt-on-use confirmation gate (#1138). This is the ONE call
// site a harvest outcome path should use to apply a slotted effect: it wraps
// `applyEffectBonus` + `depleteEffect` behind the slot's `confirmMode`, so
// callers never need to hand-roll the gate.
//
// - `confirmMode: 'always'` (the default from `slotEffect`): `confirmed` is
//   ignored; the bonus applies and one charge is spent.
// - `confirmMode: 'prompt'`: the caller must pass `confirmed: true`
//   (representing the player's explicit confirmation for this one use) or
//   nothing happens at all. No charge is spent AND no bonus is applied: the
//   base outcome passes through unchanged, and the base harvest action itself
//   is unaffected either way (this function never touches it).
//
// Draw-free in every arm, which is what lets a harvest path pinned at exactly
// two draws call it unconditionally.
export function resolveToolEffectUse(
  slot: ToolEffectSlot | undefined,
  outcome: HarvestOutcome,
  confirmed: boolean,
): ToolEffectUseResult {
  if (!slot) return { outcome, depleted: false, applied: false };
  if (slot.confirmMode === 'prompt' && !confirmed) {
    return { outcome, depleted: false, applied: false };
  }
  const bonused = applyEffectBonus(slot, outcome);
  const depleted = depleteEffect(slot);
  return { outcome: bonused, depleted, applied: true };
}

// INTEGRATION NOTE. `resolveToolEffectUse` is wired: the node-harvest outcome
// path calls it (professions/gathering.ts resolveHarvest), reading the slot
// from its owner's PlayerMeta. It draws nothing in any arm, so it sits inside
// the pinned two-draws-per-granted-harvest contract without widening it, and
// it is applied AFTER both draws so neither the rarity roll nor the rare-event
// roll can move because a player owns a slot.
//
// `rechargeEffect` (#1137) still has no live call site. Once a production or
// recharge action exists it should deduct `cost.materials` from the
// recharger's inventory and gate `cost.ticks` as craft time before calling it.
