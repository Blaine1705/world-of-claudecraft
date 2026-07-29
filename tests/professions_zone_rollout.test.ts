// The R37 rollout guard: professions content exists ONLY where a rollout row
// says it does, and the row says exactly how much. The v0.32.0 expansion
// changed the world this guard was written for: its eleven zones ship the
// release's own hub-outskirt STARTER kit (two tier-1 nodes per profession
// and tier-1 water), so "every zone past the built-in three is
// professions-free" stopped being true at that merge. The ledger now carries
// three states. 'complete' maps to assert-COMPLETE arms (the zone must carry
// nodes, a rod-tier row, a catch table in every band, and hub vendor rows).
// 'starter' pins the expansion shape exactly: nodes exist and every one is
// tier 1, the rod-tier row exists and is 1, and the zone has NO catch
// tables (Vale-row fallback), NO stations, and NO tool vendor rows; the
// phase 13 design pass (docs/design/professions-tuning-packet-review.md) is
// what flips a starter zone to complete alongside its full kit. 'none' maps
// to assert-ABSENT (no swept table may reference the zone) and stays the
// default for any future zone. Adding content without flipping a row fails
// loudly, and so does flipping a row without the content, which is exactly
// the two-sided guard R37 asks for. Every sweep is DERIVED from the live
// tables with per-table non-vacuity, never a hand-kept list of what exists.
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
 * A future zone ships with an explicit 'none' row (professions-free until its
 * design pass, the R37 default). The v0.32.0 expansion zones carry 'starter'
 * (the release's shipped hub-outskirt kit, pinned to exactly that shape by
 * the arms below); their phase 13 design pass flips each to 'complete'.
 * Shipping a ZoneDef with no row at all is refused by the coverage arm: the
 * decision must be recorded here either way.
 */
type RolloutState = 'complete' | 'starter' | 'none';
const PROFESSIONS_ZONE_ROLLOUT: Readonly<Record<string, RolloutState>> = {
  eastbrook_vale: 'complete',
  mirefen_marsh: 'complete',
  thornpeak_heights: 'complete',
  veiled_hollow: 'starter',
  drakelands: 'starter',
  frostveil: 'starter',
  amberfall: 'starter',
  willowfen: 'starter',
  nightbloom: 'starter',
  wraithwood: 'starter',
  palmreach: 'starter',
  evergarden: 'starter',
  galecrest: 'starter',
  farshore_isle: 'starter',
};

/** The zones the assert-complete arms sweep: every 'complete' ledger row. */
function rolledOutFrom(ledger: Readonly<Record<string, RolloutState>>): Set<string> {
  return new Set(
    Object.entries(ledger)
      .filter(([, state]) => state === 'complete')
      .map(([zoneId]) => zoneId),
  );
}

/** The zones a given state's arms sweep. */
function zonesInState(state: RolloutState): Set<string> {
  return new Set(
    Object.entries(PROFESSIONS_ZONE_ROLLOUT)
      .filter(([, s]) => s === state)
      .map(([zoneId]) => zoneId),
  );
}

const ROLLED_OUT = rolledOutFrom(PROFESSIONS_ZONE_ROLLOUT);
const STARTER_ZONES = zonesInState('starter');

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
    // (a 'complete' row plus the content) or ships without (an explicit
    // 'none' row, and every sweep below enforces the absence).
    expect([...ZONES.map((z) => z.id)].sort()).toEqual(
      [...Object.keys(PROFESSIONS_ZONE_ROLLOUT)].sort(),
    );
    expect(ZONES.length).toBe(14);
    expect(ROLLED_OUT.size).toBe(3);
    expect(STARTER_ZONES.size).toBe(11);
    // The 'none' state is real, not decorative: no shipped row uses it yet,
    // so without this arm the complete-filter could silently degrade to a
    // bare key read and a future professions-free zone would sweep as
    // rolled out, defeating the guard's whole purpose.
    expect(rolledOutFrom({ ...PROFESSIONS_ZONE_ROLLOUT, zone_x: 'none' })).toEqual(ROLLED_OUT);
  });

  it('gather nodes exist in every complete and starter zone, and ONLY there', () => {
    expect(GATHER_NODES.length).toBeGreaterThan(0);
    const byZone = new Map<string, number>();
    for (const node of GATHER_NODES) {
      byZone.set(node.zoneId, (byZone.get(node.zoneId) ?? 0) + 1);
      expect(
        ROLLED_OUT.has(node.zoneId) || STARTER_ZONES.has(node.zoneId),
        `${node.id} places a professions node in un-rolled-out zone ${node.zoneId}`,
      ).toBe(true);
      // The starter shape's teeth: every expansion node is tier 1 until the
      // zone's phase 13 pass flips the row (a tier-2 vein appearing in a
      // starter zone means content landed without the ledger decision).
      if (STARTER_ZONES.has(node.zoneId)) {
        expect(node.tier, `${node.id} outruns its starter zone's tier-1 kit`).toBe(1);
      }
    }
    for (const zoneId of [...ROLLED_OUT, ...STARTER_ZONES]) {
      expect(
        byZone.get(zoneId) ?? 0,
        `${zoneId} ships nodes by its row but has none`,
      ).toBeGreaterThan(0);
    }
  });

  it('crafting stations sit only in rolled-out zones, and every rolled-out zone has one', () => {
    expect(STATIONS.length).toBeGreaterThan(0);
    const byZone = new Map<string, number>();
    for (const station of STATIONS) {
      byZone.set(station.zoneId, (byZone.get(station.zoneId) ?? 0) + 1);
      expect(
        ROLLED_OUT.has(station.zoneId),
        `${station.id} places a station in un-rolled-out zone ${station.zoneId}`,
      ).toBe(true);
    }
    // Assert-complete, not just assert-absent: a rolled-out zone with no
    // station at all (the whole Thornpeak bench deleted, say) must redden
    // here, not sweep as fine.
    for (const zoneId of ROLLED_OUT) {
      expect(byZone.get(zoneId) ?? 0, `${zoneId} is rolled out but has no station`).toBeGreaterThan(
        0,
      );
    }
  });

  it('rod-tier rows and catch tables exist for every rolled-out zone and no other', () => {
    // The rod ladder (R19/R22 read this map) and the per-band catch tables
    // are both zone-keyed. A future zone's water stays tier-1-by-default,
    // but NOT catchless: the catch resolver falls back to the Vale rows for
    // any zone without its own table (fishing.ts), so absence here means
    // DEFAULT water, and the zone's own tables are part of what its
    // 'complete' flip must author.
    // Rod rows exist for complete AND starter zones (a starter row is the
    // explicit tier-1 decision fishing_zones.ts records); catch tables stay
    // complete-only, the Vale fallback covering starter water.
    expect([...Object.keys(FISHING_ZONE_ROD_TIERS)].sort()).toEqual(
      [...ROLLED_OUT, ...STARTER_ZONES].sort(),
    );
    for (const zoneId of STARTER_ZONES) {
      expect(FISHING_ZONE_ROD_TIERS[zoneId], `${zoneId} starter water is not tier 1`).toBe(1);
    }
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
    const zoneTables: [string, Set<string>][] = [
      ['zone1', new Set(Object.keys(ZONE1_NPCS))],
      ['zone2', new Set(Object.keys(ZONE2_NPCS))],
      ['zone3', new Set(Object.keys(ZONE3_NPCS))],
    ];
    const zoneNpcIds = new Set(zoneTables.flatMap(([, ids]) => [...ids]));
    let toolRowsSeen = 0;
    const rowsPerTable = new Map<string, number>();
    for (const [npcId, npc] of Object.entries(NPCS)) {
      for (const itemId of npc.vendorItems ?? []) {
        if (!tools.has(itemId)) continue;
        toolRowsSeen += 1;
        for (const [table, ids] of zoneTables) {
          if (ids.has(npcId)) rowsPerTable.set(table, (rowsPerTable.get(table) ?? 0) + 1);
        }
        expect(
          zoneNpcIds.has(npcId),
          `${npcId} vendors professions tool ${itemId} from outside the zone tables`,
        ).toBe(true);
      }
    }
    // Non-vacuity: the sweep really saw the shipped tool rows, and saw them
    // in EVERY zone table (a global floor alone would stay green with a
    // whole hub's counter deleted).
    expect(toolRowsSeen).toBeGreaterThan(10);
    for (const [table] of zoneTables) {
      expect(rowsPerTable.get(table) ?? 0, `${table} contributes no tool row`).toBeGreaterThan(0);
    }
    // The two non-NPC counters are covered by their own sweeps
    // (tests/professions_tools.test.ts): pin here only that neither has
    // sprouted a row this guard would need to zone-resolve. Local non-vacuity
    // for both, so an emptied or renamed table reads as a failure here, not
    // as a vacuous pass delegated to another file.
    expect(HEROIC_VENDOR_STOCK.length).toBeGreaterThan(0);
    expect(HEROIC_VENDOR_STOCK.some((offer) => tools.has(offer.itemId))).toBe(false);
    let delveToolRows = 0;
    for (const [delveId, entries] of Object.entries(DELVE_SHOPS)) {
      for (const entry of entries) {
        if (!tools.has(entry.itemId)) continue;
        delveToolRows += 1;
        // Delve counters DO stock the tier-4/5 crafted tools (the Marks
        // route); every delve lives in a rolled-out zone today, pinned by
        // the delve id naming convention staying within the shipped set.
        expect(
          ['collapsed_reliquary', 'drowned_litany'].includes(delveId),
          `${delveId} delve shop stocks tool ${entry.itemId} outside the shipped delves`,
        ).toBe(true);
      }
    }
    // The Marks-route rows really exist, so the loop above discriminated.
    expect(delveToolRows).toBeGreaterThan(0);
  });
});
