// Deploy-window guard for the professions tuning release (stale-client work,
// R34). The bundle deployed at the merge base (9d7a1a021) predates the
// unknown-item guards and still THROWS in its corpse/chest loot popup on an
// item id it cannot resolve. The runbook (DEPLOY.md, "Client/server deploy
// order for content releases") therefore requires every item id this release
// adds to stay out of every loot-container table until clients have rolled;
// this file is what makes that instruction survive a parallel content PR
// during the deploy window, instead of living only as a runbook sentence.
//
// The pin is deliberately RELEASE-SCOPED: once the deploy window closes (the
// maintainer's call, after clients roll), the ids may enter loot tables and
// this file can be deleted whole.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DUNGEONS, ITEMS, MOBS } from '../src/sim/data';

// Every item id new since the deployed release, measured by diffing the
// content table keys against 9d7a1a021 (the fine-grade materials plus the
// two new rods). A rename in content breaks the existence arm loudly rather
// than letting the sweep go vacuous.
const NEW_RELEASE_ITEM_IDS = [
  'fine_ashwood_log',
  'fine_copper_ore',
  'fine_elderwood_log',
  'fine_goldleaf_herb',
  'fine_iron_ore',
  'fine_ironbark_log',
  'fine_silverleaf_herb',
  'fine_sunpetal_herb',
  'fine_thorium_ore',
  'stormreel_fishing_rod',
  'tidewrought_fishing_rod',
] as const;

// Every string sitting under an `itemId` key, anywhere in a content object:
// shape-agnostic, so a new loot list format still feeds the sweep.
function collectItemIds(node: unknown, out: string[]): string[] {
  if (Array.isArray(node)) {
    for (const entry of node) collectItemIds(entry, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'itemId' && typeof value === 'string') out.push(value);
      else collectItemIds(value, out);
    }
  }
  return out;
}

describe('new release item ids stay out of loot containers (deploy window)', () => {
  it('names only real content ids (the sweep cannot go vacuous by rename)', () => {
    for (const id of NEW_RELEASE_ITEM_IDS) {
      expect(ITEMS[id], id).toBeTruthy();
    }
  });

  it('keeps every new id out of every mob and dungeon loot table', () => {
    const mobLoot = collectItemIds(Object.values(MOBS), []);
    const dungeonLoot = collectItemIds(Object.values(DUNGEONS), []);
    // Non-vacuity: the walk must actually be reading loot tables.
    expect(mobLoot.length).toBeGreaterThan(50);
    const all = new Set([...mobLoot, ...dungeonLoot]);
    for (const id of NEW_RELEASE_ITEM_IDS) {
      expect(all.has(id), `${id} must stay out of mob/dungeon loot until clients roll`).toBe(false);
    }
  });

  it('keeps every new id out of the delve chest feeders', () => {
    // The two content modules that assemble what the delve-chest loot popup
    // shows (delveChestItemsForTier and the litany chest tables). The shop
    // is deliberately NOT swept: shop rows render through guarded vendor
    // surfaces, and the rods legitimately live there.
    const feeders = [
      '../src/sim/content/delves/lockpick_tiers.ts',
      '../src/sim/content/delves/drowned_litany_loot.ts',
    ].map((rel) => readFileSync(new URL(rel, import.meta.url), 'utf8'));
    // Non-vacuity: the feeders really are item-bearing tables.
    expect(feeders.some((source) => source.includes("itemId: '"))).toBe(true);
    for (const source of feeders) {
      for (const id of NEW_RELEASE_ITEM_IDS) {
        expect(source.includes(id), `${id} must stay out of the delve chest feeders`).toBe(false);
      }
    }
  });
});
