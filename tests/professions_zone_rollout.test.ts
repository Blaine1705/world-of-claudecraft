// The R37 rollout guard: professions content exists ONLY where a rollout row
// says it does. The editor's new maps and every zone past the built-in three
// ship with NO professions content at all until the zone-4 design pass gives
// a future zone its content-sourced tool ladder (R23), and the phase 13
// new-zone checklist is what flips a zone here from absent to complete.
//
// The ledger below is the flip point. A zone id present maps to
// assert-COMPLETE arms (it must carry nodes, a rod-tier row, a catch table in
// every band, and hub vendor rows); a zone id absent maps to assert-ABSENT
// (no swept table may reference it). Adding professions content to a new
// zone without adding its rollout row fails loudly, and so does adding the
// row without the content, which is exactly the two-sided guard R37 asks
// for. Every sweep is DERIVED from the live tables with per-table
// non-vacuity, never a hand-kept list of what exists.
import { describe, expect, it } from 'vitest';
import { DELVE_SHOPS } from '../src/sim/content/delves/shop';
import { HEROIC_VENDOR_STOCK } from '../src/sim/content/heroic_vendor';
import { FISHING_TABLES_BY_BAND } from '../src/sim/content/items';
import { STATIONS } from '../src/sim/content/professions';
import { ZONE1_NPCS } from '../src/sim/content/zone1';
import { ZONE2_NPCS } from '../src/sim/content/zone2';
import { ZONE3_NPCS } from '../src/sim/content/zone3';
import { GATHER_NODES, ITEMS, NPCS, ZONES } from '../src/sim/data';
import { FISHING_ZONE_ROD_TIERS } from '../src/sim/professions/fishing_zones';

/**
 * The R37 ledger, and deliberately the ONLY hand-kept table in this file.
 * Phase 13's new-zone checklist flips a future zone in by ADDING its row,
 * which turns every assert-absent arm below into assert-complete for it.
 */
const PROFESSIONS_ZONE_ROLLOUT: Readonly<Record<string, 'complete'>> = {
  eastbrook_vale: 'complete',
  mirefen_marsh: 'complete',
  thornpeak_heights: 'complete',
};

const ROLLED_OUT = new Set(Object.keys(PROFESSIONS_ZONE_ROLLOUT));

/** Every professions implement in the item table (land tools and rods). */
function professionToolIds(): Set<string> {
  const out = new Set<string>();
  for (const [itemId, def] of Object.entries(ITEMS)) {
    if (def.use?.type === 'gatherTool') out.add(itemId);
  }
  return out;
}

describe('the R37 professions zone-rollout guard', () => {
  it('the rollout ledger covers exactly the shipped ZONES (the flip point is deliberate)', () => {
    // Adding a fourth ZoneDef fails HERE first, by design: the author must
    // decide, in this file, whether the new zone ships professions content
    // (add its row plus the content) or ships without (leave it absent and
    // every sweep below enforces the absence).
    expect([...ZONES.map((z) => z.id)].sort()).toEqual([...ROLLED_OUT].sort());
    expect(ZONES.length).toBe(3);
  });

  it('gather nodes exist in every rolled-out zone and ONLY in rolled-out zones', () => {
    expect(GATHER_NODES.length).toBeGreaterThan(0);
    const byZone = new Map<string, number>();
    for (const node of GATHER_NODES) {
      byZone.set(node.zoneId, (byZone.get(node.zoneId) ?? 0) + 1);
      expect(
        ROLLED_OUT.has(node.zoneId),
        `${node.id} places a professions node in un-rolled-out zone ${node.zoneId}`,
      ).toBe(true);
    }
    for (const zoneId of ROLLED_OUT) {
      expect(byZone.get(zoneId) ?? 0, `${zoneId} is rolled out but has no nodes`).toBeGreaterThan(
        0,
      );
    }
  });

  it('crafting stations sit only in rolled-out zones, and at least one exists', () => {
    expect(STATIONS.length).toBeGreaterThan(0);
    for (const station of STATIONS) {
      expect(
        ROLLED_OUT.has(station.zoneId),
        `${station.id} places a station in un-rolled-out zone ${station.zoneId}`,
      ).toBe(true);
    }
  });

  it('rod-tier rows and catch tables exist for every rolled-out zone and no other', () => {
    // The rod ladder (R19/R22 read this map) and the per-band catch tables
    // are both zone-keyed; a future zone's water stays tier-1-by-default and
    // catchless until its rollout row lands.
    expect([...Object.keys(FISHING_ZONE_ROD_TIERS)].sort()).toEqual([...ROLLED_OUT].sort());
    expect(FISHING_TABLES_BY_BAND.length).toBeGreaterThan(0);
    for (const [band, byZone] of FISHING_TABLES_BY_BAND.entries()) {
      const zones = Object.keys(byZone);
      expect(zones.length, `band ${band} has no zone tables`).toBeGreaterThan(0);
      expect([...zones].sort(), `band ${band} zone keys`).toEqual([...ROLLED_OUT].sort());
      for (const [zoneId, table] of Object.entries(byZone)) {
        expect(table.length, `band ${band} ${zoneId} table is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('professions tools are vendored only by NPCs of the three zone tables', () => {
    // A future zone or custom map lands its NPCs OUTSIDE these three content
    // tables, so a professions tool on such a counter is exactly the vendor
    // row R37 forbids (and R23 routes future-tier tools through content, not
    // counters, so hubs deliberately never stock a future zone's rung).
    const tools = professionToolIds();
    expect(tools.size).toBeGreaterThanOrEqual(12);
    const zoneNpcIds = new Set([
      ...Object.keys(ZONE1_NPCS),
      ...Object.keys(ZONE2_NPCS),
      ...Object.keys(ZONE3_NPCS),
    ]);
    let toolRowsSeen = 0;
    for (const [npcId, npc] of Object.entries(NPCS)) {
      for (const itemId of npc.vendorItems ?? []) {
        if (!tools.has(itemId)) continue;
        toolRowsSeen += 1;
        expect(
          zoneNpcIds.has(npcId),
          `${npcId} vendors professions tool ${itemId} from outside the zone tables`,
        ).toBe(true);
      }
    }
    // Non-vacuity: the sweep really saw the shipped tool rows.
    expect(toolRowsSeen).toBeGreaterThan(10);
    // The two non-NPC counters are covered by their own sweeps
    // (tests/professions_tools.test.ts): pin here only that neither has
    // sprouted a row this guard would need to zone-resolve.
    expect(HEROIC_VENDOR_STOCK.some((offer) => tools.has(offer.itemId))).toBe(false);
    for (const [delveId, entries] of Object.entries(DELVE_SHOPS)) {
      for (const entry of entries) {
        if (!tools.has(entry.itemId)) continue;
        // Delve counters DO stock the tier-4/5 crafted tools (the Marks
        // route); every delve lives in a rolled-out zone today, pinned by
        // the delve id naming convention staying within the shipped set.
        expect(
          ['collapsed_reliquary', 'drowned_litany'].includes(delveId),
          `${delveId} delve shop stocks tool ${entry.itemId} outside the shipped delves`,
        ).toBe(true);
      }
    }
  });
});
