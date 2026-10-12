// Vaelgrath, the Emberwake: the Studio fork's dragon world boss
// (encounters/emberwake.ts). His trophy and summoning-focus items.
//
// Studio content, NOT part of the built-in item table: data.ts never merges
// this record. src/sim/studio_content.ts registers it while an authored map is
// the active content, so the default world's ITEMS (and every save, wiki and
// discovery count derived from it) stay exactly the release's.

import type { ItemDef } from '../types';

export const EMBERWAKE_ITEMS: Record<string, ItemDef> = {
  // The guaranteed personal-loot trophy every contributor receives. The
  // world-boss roller supports itemId + rollGroup only, so this is a plain
  // ungrouped entry with chance 1.
  emberwake_heartscale: {
    id: 'emberwake_heartscale',
    name: 'Emberwake Heartscale',
    kind: 'junk',
    quality: 'epic',
    sellValue: 900,
  },
  // The summoning focus on the Northspire approach (world_boss.ts summonCrystal).
  // It is never carried: the focus entity is an interactable that shatters when
  // its channel completes, so this def exists to name, icon and model it. Marked
  // no-vendor/no-discard/no-market so a stray copy can never enter the economy.
  emberwake_summon_crystal: {
    id: 'emberwake_summon_crystal',
    name: 'The Emberwake Crystal',
    kind: 'quest',
    sellValue: 0,
    noVendorSell: true,
    noDiscard: true,
    noMarketList: true,
  },
};
