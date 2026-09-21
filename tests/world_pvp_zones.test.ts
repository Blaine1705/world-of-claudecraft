// World PvP zone policy (src/sim/pvp/world_pvp_zones.ts + the `worldPvp` field
// on the zone records): WHICH zones are sanctuaries and free-for-all (an owner
// decision pinned here so a content edit cannot move a zone silently), the
// derivation the free-for-all set follows (the three highest-level zones, tie
// broken by the S-tier rift weight and then by how far north the zone sits),
// and the position lookup's edges (the instance plane and the space beyond the
// map read as contested, never as an overworld zone).
import { describe, expect, it } from 'vitest';
import { INSTANCE_X_BASE, WORLD_MAX_Z, ZONES } from '../src/sim/data';
import { worldPvpZonePolicyAt, worldPvpZonePolicyOf } from '../src/sim/pvp/world_pvp_zones';

const SANCTUARIES = ['eastbrook_vale', 'proving_shore'];
const FREE_FOR_ALL = ['nightbloom', 'wraithwood', 'evergarden'];

describe('the zone table', () => {
  it('pins the two sanctuaries and the three free-for-all zones', () => {
    expect(ZONES.filter((z) => z.worldPvp === 'sanctuary').map((z) => z.id)).toEqual(SANCTUARIES);
    expect(ZONES.filter((z) => z.worldPvp === 'ffa').map((z) => z.id)).toEqual(FREE_FOR_ALL);
    // Every other zone is contested (no field at all, never a third value).
    for (const zone of ZONES) {
      if (SANCTUARIES.includes(zone.id) || FREE_FOR_ALL.includes(zone.id)) continue;
      expect(zone.worldPvp).toBeUndefined();
    }
  });

  it('the sanctuaries are the tutorial island and the starter zone', () => {
    for (const id of SANCTUARIES) {
      const zone = ZONES.find((z) => z.id === id);
      expect(zone?.levelRange[0]).toBe(1);
    }
  });

  it('the free-for-all set is the top three by level, rift weight, then north', () => {
    const ranked = [...ZONES].sort((a, b) => {
      if (a.levelRange[1] !== b.levelRange[1]) return b.levelRange[1] - a.levelRange[1];
      if (a.levelRange[0] !== b.levelRange[0]) return b.levelRange[0] - a.levelRange[0];
      const sa = a.riftTierWeights?.S ?? 0;
      const sb = b.riftTierWeights?.S ?? 0;
      if (sa !== sb) return sb - sa;
      return b.zMin - a.zMin;
    });
    expect(
      ranked
        .slice(0, 3)
        .map((z) => z.id)
        .sort(),
    ).toEqual([...FREE_FOR_ALL].sort());
    // Every free-for-all zone is a level-cap zone; no sanctuary is.
    for (const id of FREE_FOR_ALL) {
      expect(ZONES.find((z) => z.id === id)?.levelRange).toEqual([20, 20]);
    }
  });
});

describe('worldPvpZonePolicyOf / worldPvpZonePolicyAt', () => {
  it('reads the record, and treats no record as contested', () => {
    expect(worldPvpZonePolicyOf(ZONES.find((z) => z.id === 'proving_shore'))).toBe('sanctuary');
    expect(worldPvpZonePolicyOf(ZONES.find((z) => z.id === 'wraithwood'))).toBe('ffa');
    expect(worldPvpZonePolicyOf(ZONES.find((z) => z.id === 'thornpeak_heights'))).toBe('contested');
    expect(worldPvpZonePolicyOf(null)).toBe('contested');
    expect(worldPvpZonePolicyOf(undefined)).toBe('contested');
  });

  it('resolves a position through the zone rectangles', () => {
    for (const zone of ZONES) {
      const expected = zone.worldPvp ?? 'contested';
      expect(worldPvpZonePolicyAt(zone.graveyard.x, zone.graveyard.z)).toBe(expected);
      expect(worldPvpZonePolicyAt(zone.hub.x, zone.hub.z)).toBe(expected);
    }
  });

  it('the instance plane and the space past the map edge are contested, never a zone', () => {
    // zoneAt would clamp both of these onto a real overworld zone; the policy
    // lookup uses the strict containment so an arena floor or a dungeon can
    // never inherit a free-for-all or a sanctuary.
    expect(worldPvpZonePolicyAt(INSTANCE_X_BASE, 0)).toBe('contested');
    expect(worldPvpZonePolicyAt(INSTANCE_X_BASE + 500, 1500)).toBe('contested');
    expect(worldPvpZonePolicyAt(0, WORLD_MAX_Z + 100)).toBe('contested');
  });
});
