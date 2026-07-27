// Persistent town focus allocation (#1143): a player, while standing in a town
// hub, sets a persistent per-component-type focus allocation that adds a bonus
// on top of the universal baseline yield/tier for the chosen component
// type(s). Unfocused components are never affected: the baseline they'd get
// with zero allocation is unchanged regardless of how other components are
// focused. Consumes the #1142 per-corpse focus/tradeoff roll
// (professions/gathering.ts) as an input to the bonus calculation, but is
// itself independently buildable/testable against any baseline yield/tier.
//
// Pure leaf: no Sim/Entity import (matches gathering.ts). The "in town" gate
// is evaluated by the caller (Sim, which knows the player's zone/position) and
// passed in as a plain boolean, so this module never reaches into world state.

import type { ZoneDef } from '../types';
import { HARVEST_COMPONENT_ITEMS, HARVEST_TIERS, type HarvestTier } from './gathering';

/** Total focus points a player may allocate across every component type at once. */
export const FOCUS_POINT_BUDGET = 10;

// Tier-roll integration (#1142 harvest tiers): every this-many points focused
// on a component shifts its rolled tier up by one step, capped so a single
// component can never be pushed more than MAX_FOCUS_TIER_BONUS steps by focus
// alone. Documented, not invented: mirrors the #1142 concentration-bonus shape
// (an additive, capped index shift on the same HARVEST_TIERS ladder).
export const POINTS_PER_TIER_BONUS = 5;
export const MAX_FOCUS_TIER_BONUS = 2;

// Generic numeric yield bonus (for any baseline yield/rarity value, not just
// the tier ladder): each focus point on a component adds this fraction of the
// baseline as a bonus, on top of it. Never negative, never applied to
// unfocused components. Capped at FOCUS_POINT_BUDGET points (a player cannot
// allocate more), so the maximum bonus a single component can receive is
// FOCUS_POINT_BUDGET * FOCUS_YIELD_BONUS_PER_POINT = 100% of baseline.
export const FOCUS_YIELD_BONUS_PER_POINT = 0.1;

/** Persistent per-player focus allocation: component type -> points spent on it. */
export type FocusAllocation = Readonly<Record<string, number>>;

export const EMPTY_FOCUS_ALLOCATION: FocusAllocation = {};

/**
 * The component families a town-focus allocation may name (#2511).
 *
 * Exactly the families HARVEST_COMPONENT_ITEMS maps to an item, in content
 * order, which is also every row the focus panel offers: src/ui/town_focus_view.ts
 * re-exports THIS constant rather than deriving the same list a second time,
 * so the panel cannot come to offer a family the validator below rejects. It
 * is defined here, in the sim, because the sim is the authority on what it
 * will accept.
 *
 * Deliberately NARROWER than the corpse tag vocabulary, which also carries
 * claw, tusk, gills and horn. Those are real tags on shipped mobs, but no item
 * maps to them and focus spent on one is not merely inert: the
 * omitted-components harvest default derives its pick from this allocation
 * (src/sim/interaction.ts), so a persisted `{ gills: 1 }` would make every
 * plain interact press on a murloc take the #2509 all-forfeit refusal. Keeping
 * the unmapped families out of the allocation is what makes that unreachable
 * rather than merely unlikely.
 */
export const TOWN_FOCUS_COMPONENTS: readonly string[] = Object.keys(HARVEST_COMPONENT_ITEMS);

// A Set, NOT a truthy `HARVEST_COMPONENT_ITEMS[key]` lookup. The map is a
// plain object literal, so `constructor`, `toString`, `hasOwnProperty` and
// `valueOf` all read back truthy off Object.prototype and would sail through a
// lookup check. Those four arrive as real own keys (the server's wire loop
// copies entries onto a fresh object; only `__proto__` is swallowed there, by
// the prototype setter), so the difference between the two forms is the bug
// itself, not a style preference.
const TOWN_FOCUS_COMPONENT_SET: ReadonlySet<string> = new Set(TOWN_FOCUS_COMPONENTS);

/** Does `componentType` name a real, item-mapped component family? */
export function isTownFocusComponent(componentType: string): boolean {
  return TOWN_FOCUS_COMPONENT_SET.has(componentType);
}

/** Points currently allocated to `componentType`, or 0 if unfocused. */
function pointsFor(focus: FocusAllocation, componentType: string): number {
  return Math.max(0, focus[componentType] ?? 0);
}

/**
 * Additive bonus on top of `baseYield` for `componentType`. Never reduces
 * `baseYield`: an unfocused component (0 points) returns it unchanged, and
 * more points on a component only ever increase its result.
 */
export function applyFocusBonus(
  baseYield: number,
  componentType: string,
  focus: FocusAllocation,
): number {
  const points = pointsFor(focus, componentType);
  if (points <= 0) return baseYield;
  return baseYield + baseYield * points * FOCUS_YIELD_BONUS_PER_POINT;
}

/**
 * Shifts a rolled #1142 harvest tier upward for a focused component. Zero
 * points returns `tier` unchanged (the baseline is never lowered); every
 * `POINTS_PER_TIER_BONUS` points raises the tier index by one step, capped at
 * `MAX_FOCUS_TIER_BONUS` steps and at the top of the tier ladder.
 */
export function applyFocusTierBonus(
  tier: HarvestTier,
  componentType: string,
  focus: FocusAllocation,
): HarvestTier {
  const points = pointsFor(focus, componentType);
  if (points <= 0) return tier;
  const steps = Math.min(MAX_FOCUS_TIER_BONUS, Math.floor(points / POINTS_PER_TIER_BONUS));
  if (steps <= 0) return tier;
  const index = HARVEST_TIERS.indexOf(tier);
  return HARVEST_TIERS[Math.min(HARVEST_TIERS.length - 1, index + steps)];
}

// "In town" (#1143 scope note): there is no built-out town/crafting-station
// system yet (that is an unfiled epic; see #1152 Tier 6). Every zone already
// carries a `hub` settlement circle (`ZoneDef.hub`: x/z/radius/name, e.g.
// Eastbrook/Fenbridge/Highwatch), the same footprint the world generator
// flattens into a plateau and the road/prop generation treats as town. That
// hub circle IS the town-tag stand-in this feature uses: a lightweight
// zone-tag check, not a real crafting-station build-out.
export function isInTownZone(pos: { x: number; z: number }, zone: ZoneDef): boolean {
  const dx = pos.x - zone.hub.x;
  const dz = pos.z - zone.hub.z;
  return dx * dx + dz * dz <= zone.hub.radius * zone.hub.radius;
}

export interface SetTownFocusResult {
  readonly ok: boolean;
  /** The resulting allocation: the requested one on success, the unchanged
   * previous one on rejection. */
  readonly allocation: FocusAllocation;
  readonly reason?: 'not_in_town' | 'invalid_allocation' | 'over_budget';
}

/**
 * Validates and resolves a town-focus allocation request. `isInTown` is a
 * plain boolean the caller (Sim) computes from the player's current
 * position/zone; this module makes no world-state decisions of its own.
 * Rejects: not in town, negative/non-integer points, a key that does not name
 * a real component family, or a total exceeding FOCUS_POINT_BUDGET. On
 * rejection the previous allocation is returned unchanged (the persistent
 * state is untouched).
 */
export function setTownFocus(
  previous: FocusAllocation,
  requested: Readonly<Record<string, number>>,
  isInTown: boolean,
): SetTownFocusResult {
  if (!isInTown) return { ok: false, allocation: previous, reason: 'not_in_town' };
  let total = 0;
  for (const [componentType, points] of Object.entries(requested)) {
    if (!Number.isInteger(points) || points < 0) {
      return { ok: false, allocation: previous, reason: 'invalid_allocation' };
    }
    if (points > 0) total += points;
    // #2511: the key has to name a real family, whatever its point value.
    // Every surviving key used to be copied into the allocation and persisted
    // with the character, so a hand-crafted frame could park arbitrary strings
    // (a 16 KiB one, or `constructor`) in a save and keep them there.
    //
    // This WIDENS the empty-string check it replaces rather than adding a
    // behavior mode: '' was already rejected right here, and '' is just the
    // degenerate unknown key. Rejecting outright, over silently dropping the
    // unknown entries, is the rule the three checks around it already follow,
    // and unlike the #2504 harvest pick it costs the player nothing: no
    // single-use resource is consumed, retrying is free, and a partial accept
    // would leave the panel showing a point the server had thrown away. An
    // ALL-unknown allocation is that same rule with no boundary exception:
    // rejected, previous allocation untouched.
    //
    // A zero-valued unknown key is rejected too, though the commit loop below
    // would have dropped it anyway: `{ '': 0 }` was already rejected, one rule
    // reads the same at every value, and no shipped client can send one
    // (stepTownFocus deletes a component when it reaches zero).
    //
    // Precedence, since two rejections can apply at once: this returns from
    // inside the entry loop and the budget test runs after it, so
    // `{ leather: 999 }` is invalid_allocation, never over_budget.
    if (!isTownFocusComponent(componentType)) {
      return { ok: false, allocation: previous, reason: 'invalid_allocation' };
    }
  }
  if (total > FOCUS_POINT_BUDGET) {
    return { ok: false, allocation: previous, reason: 'over_budget' };
  }
  const allocation: Record<string, number> = {};
  for (const [componentType, points] of Object.entries(requested)) {
    if (points > 0) allocation[componentType] = points;
  }
  return { ok: true, allocation };
}

/**
 * Rebuild a persisted allocation into the shape setTownFocus commits: known
 * families only, each mapped to a positive integer (#2511 back-compat).
 *
 * The command boundary above cannot repair a save that already carries junk,
 * and that junk is not inert once loaded: it is mirrored to the client in the
 * `tfocus` snapshot field, summed by the townFocusPoints deed meter, and read
 * by the omitted-components harvest default. Dropping it costs the player
 * nothing to feel, which is why this is silent and unconditional: focus points
 * are freely re-allocatable and an unknown family never bought anything (the
 * opposite of the bank's never-destroy-an-item rule).
 *
 * Leaving unknown keys inert instead would be worse than it sounds, because it
 * would LOCK the character out of its own panel. The allocation is mirrored to
 * the client, the panel seeds its draft from that mirror, stepTownFocus
 * spreads the whole draft forward on every +/-, and Save posts it back, so the
 * unknown key rides along into a request the command boundary now rejects,
 * with no control anywhere that could delete it.
 *
 * Same normalize-on-load shape as professions/tier_mail.ts
 * normalizeTierMailOnLoad and cadence.ts clampCadenceOnLoad, and it keeps the
 * sim.ts load arm thin. A total over FOCUS_POINT_BUDGET is deliberately NOT
 * re-checked here: a budget lowered by later tuning must not silently delete a
 * legitimate allocation, and the next set_town_focus re-validates the whole
 * request against the current budget anyway.
 */
export function normalizeTownFocusOnLoad(
  saved: Readonly<Record<string, number>> | undefined | null,
): Record<string, number> {
  const allocation: Record<string, number> = {};
  if (!saved) return allocation;
  for (const [componentType, points] of Object.entries(saved)) {
    if (!isTownFocusComponent(componentType)) continue;
    if (typeof points === 'number' && Number.isInteger(points) && points > 0) {
      allocation[componentType] = points;
    }
  }
  return allocation;
}

// Re-spec cost model (#1144): re-aiming an existing town-focus allocation
// trades speed for cost across three payment tiers, per design. Every tier
// resolves the SAME reallocation; only how it is paid for changes. 'time'
// spends only real-world duration; 'timeAndPartial' spends less duration for
// a small coin/material cost; 'instant' spends no duration at all for the
// full coin/material cost. Content-driven (RESPEC_TIER_CONFIG below), not
// hardcoded inline, so tuning (#1148) only ever touches this table.
export type RespecPaymentTier = 'time' | 'timeAndPartial' | 'instant';

export interface RespecTierConfig {
  /** Real-world milliseconds the re-spec takes, per point of change, at this tier. */
  readonly durationMsPerPoint: number;
  /** Coin cost per point of change, at this tier. */
  readonly coinPerPoint: number;
  /** Material cost per point of change, at this tier. */
  readonly materialsPerPoint: number;
}

/**
 * The three payment tiers from the design doc: time-only (free, slow),
 * time-plus-partial (faster, small cost), and instant (no wait, full cost).
 * #1148 tuning pass: the design doc's own Open Questions section ("Gathering
 * focus: skill tree vs additive radar, focus granularity, and the re-spec
 * cost curves") still lists the exact re-spec cost curve as genuinely open,
 * so there is no real number to replace these with yet. Per #1148's
 * acceptance criteria, these are kept as-is and CONFIRMED (not re-guessed) as
 * the working values: the shape (duration strictly decreasing, cost strictly
 * increasing, tier by tier) is the contract this module and its tests hold
 * constant, and the magnitudes are a modest, round progression (free-and-slow
 * at one minute per point, to instant at a small flat coin+material cost)
 * consistent with the #1301 gold-sink pass's own "modest, non-punitive"
 * tuning rule.
 */
export const RESPEC_TIER_CONFIG: Readonly<Record<RespecPaymentTier, RespecTierConfig>> = {
  time: { durationMsPerPoint: 60_000, coinPerPoint: 0, materialsPerPoint: 0 },
  timeAndPartial: { durationMsPerPoint: 15_000, coinPerPoint: 5, materialsPerPoint: 1 },
  instant: { durationMsPerPoint: 0, coinPerPoint: 25, materialsPerPoint: 5 },
};

export interface RespecCost {
  readonly durationMs: number;
  readonly coin: number;
  readonly materials: number;
}

/** Sum of per-component-type absolute point changes between two allocations. */
function reallocationMagnitude(
  previous: FocusAllocation,
  requested: Readonly<Record<string, number>>,
): number {
  const componentTypes = new Set([...Object.keys(previous), ...Object.keys(requested)]);
  let magnitude = 0;
  for (const componentType of componentTypes) {
    magnitude += Math.abs(pointsFor(requested, componentType) - pointsFor(previous, componentType));
  }
  return magnitude;
}

/**
 * Cost/duration to re-aim from `previous` to `requested` at the given
 * payment `tier`. Scales linearly with how many focus points actually move
 * (a no-op reallocation costs nothing at any tier). Never mutates state or
 * touches Sim/Entity; the caller applies the computed cost and, once paid,
 * calls `setTownFocus` to commit the new allocation.
 */
export function computeRespecCost(
  previous: FocusAllocation,
  requested: Readonly<Record<string, number>>,
  tier: RespecPaymentTier,
): RespecCost {
  const magnitude = reallocationMagnitude(previous, requested);
  const config = RESPEC_TIER_CONFIG[tier];
  return {
    durationMs: magnitude * config.durationMsPerPoint,
    coin: magnitude * config.coinPerPoint,
    materials: magnitude * config.materialsPerPoint,
  };
}
