// Which rod a zone's water demands (D9: fishing difficulty is skill versus
// spot, never reaction time).
//
// Before this, the catch table was keyed on zone alone. Nothing stopped a
// level-1 character with the 20-copper starter pole from working Thornpeak
// water, and the only thing a better rod bought was a shorter bite delay and a
// wider reel window, so the top rung of the ladder opened nothing. This module
// is the missing axis: each zone names the rod tier its water takes, and the
// same number says which catch band that rod unlocks, so one figure per zone
// drives both the cast gate and the empty-hook schedule.
//
// TWO NUMBERS, ONE LADDER. `rodTier` is the tier a cast requires
// (professions/tools.ts canGatherTier, the same comparator every node gate
// uses). `requiredBand` is rodTier - 1, because the shipped band gate already
// says catch band b takes tool tier b + 1 (professions/fishing.ts). They are
// not independent knobs: deriving the band from the tier is what keeps the
// water a rod may legally work and the water it can actually fish from
// drifting apart.
//
// The column is the ZONE PROGRESSION tier, the same ladder the fine-material
// axis is built on (professions/material_grades.ts gatherTier: eastbrook 1,
// mirefen 2, thornpeak 3), and `tests/fishing_zones.test.ts` derives it from
// GATHER_NODES the way tests/material_grades.test.ts derives its own column, so
// re-tiering a zone's ground and leaving its water behind fails loudly.
//
// Pure leaf module: no SimContext, no content-table import, no rng, explicit
// arguments only, so a Vitest imports it directly (same contract as tools.ts
// and material_grades.ts).

/** The rod tier a zone with no row of its own demands. Tier 1 is the
 *  bare-hands floor (professions/tools.ts BARE_HANDS_TOOL_TIER), so an
 *  unlisted zone is always castable, matching the catch table's own fallback
 *  to the eastbrook_vale rows for a zone without its own table. */
export const DEFAULT_FISHING_ROD_TIER = 1;

/**
 * The rod tier each zone's water takes, keyed by zone id. Deliberately a side
 * table rather than a field on the zone record or a column on
 * FISHING_TABLES_BY_BAND: a zone record is world geometry and content that
 * `src/render` and the editor both read, and the catch tables are pinned as an
 * image by the deed zone-key guard, while this is one profession's gate. It is
 * the shape MATERIAL_GRADES already uses for the same reason.
 */
const FISHING_ZONE_ROD_TIER_ROWS: Record<string, number> = {
  eastbrook_vale: 1,
  mirefen_marsh: 2,
  thornpeak_heights: 3,
};

export const FISHING_ZONE_ROD_TIERS: Readonly<Record<string, number>> = Object.freeze({
  ...FISHING_ZONE_ROD_TIER_ROWS,
});

/** The rod tier a cast in this zone requires, or the tier-1 floor for a zone
 *  with no row. */
export function rodTierRequiredForZone(zoneId: string): number {
  return FISHING_ZONE_ROD_TIERS[zoneId] ?? DEFAULT_FISHING_ROD_TIER;
}

/**
 * The catch band a zone's water is written for: the band the zone's required
 * rod unlocks, which is rodTier - 1 under the shipped band gate. A player
 * whose proficiency band falls short of this is fishing above their skill, and
 * the zone's tables pay them in empty hooks and junk for it
 * (content/items.ts FISHING_TABLES_BY_BAND).
 */
export function fishingRequiredBandForZone(zoneId: string): 0 | 1 | 2 {
  const band = rodTierRequiredForZone(zoneId) - 1;
  return Math.min(2, Math.max(0, band)) as 0 | 1 | 2;
}

/**
 * How many bands short of the zone's requirement a given catch band is, 0 when
 * it meets or beats it. This is the ONE number the empty-hook and junk
 * schedules read: at 0 the water fishes normally, at 1 and 2 it turns
 * progressively barren. Clamped at both ends so a future fourth band or a
 * fourth zone cannot index off the schedule.
 */
export function fishingBandShortfall(zoneId: string, band: number): 0 | 1 | 2 {
  const short = fishingRequiredBandForZone(zoneId) - band;
  return Math.min(2, Math.max(0, short)) as 0 | 1 | 2;
}

/**
 * How many bands ABOVE the zone's requirement a given catch band sits, 0 when
 * it is short or exactly at it. The mirror of fishingBandShortfall: the two
 * are never both positive, and together they place a (zone, band) cell on the
 * one axis the catch tables are authored against.
 */
export function fishingBandSurplus(zoneId: string, band: number): 0 | 1 | 2 {
  const over = band - fishingRequiredBandForZone(zoneId);
  return Math.min(2, Math.max(0, over)) as 0 | 1 | 2;
}
