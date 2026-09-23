// The developer-badge rungs as selectable titles.
//
// A contributor's badge tier (src/sim/dev_tier.ts) is resolved server-side from
// a verified GitHub link and stamped on Entity.devTier; the sim never derives
// it. This module turns that resolved rung into Book of Deeds title unlocks so
// the existing title picker (setActiveTitle) can offer "Artificer",
// "Runesmith", and so on. Every rung at or below the tier is granted, so a
// Worldwright can still wear the lower rung they grew up under.
//
// Unlocks are sticky, like every deed: merged pull requests never un-merge, and
// an earned record is append-only. Only the top rung reached announces itself
// live; the rungs it climbed past land retro (silent), so a veteran contributor
// logging in for the first time after this shipped sees one toast, not five.
//
// Pure over the live meta via the SimContext seam: no rng, no wall clock.

import { DEV_TIER_DEFS, type DevTierKey } from './dev_tier';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';

/** The hidden title deed each developer-badge rung unlocks. */
export const DEV_BADGE_TITLE_DEEDS: Readonly<Record<DevTierKey, string>> = {
  tinkerer: 'hid_dev_tinkerer',
  artificer: 'hid_dev_artificer',
  runesmith: 'hid_dev_runesmith',
  architect: 'hid_dev_architect',
  worldwright: 'hid_dev_worldwright',
};

/**
 * Grant the title deed for every developer-badge rung at or below `tierIndex`
 * (1-based; 0 or out-of-range grants nothing). Idempotent: already-earned rungs
 * are skipped by grantDeed. Returns how many deeds were newly granted.
 */
export function grantDevBadgeTitles(ctx: SimContext, meta: PlayerMeta, tierIndex: number): number {
  if (!Number.isInteger(tierIndex) || tierIndex < 1) return 0;
  const top = Math.min(tierIndex, DEV_TIER_DEFS.length);
  let granted = 0;
  for (const tier of DEV_TIER_DEFS) {
    if (tier.index > top) break;
    const opts = tier.index < top ? ({ retro: true } as const) : undefined;
    if (ctx.grantDeed(meta, DEV_BADGE_TITLE_DEEDS[tier.key], opts)) granted++;
  }
  return granted;
}
