// The one-room treasure vault layout (src/sim/rift/vault_seed.ts + the vault
// branch of rift_gen.ts): a vault seed always generates a single boss room with
// no puzzle, the room and its trash grow with the size tier, everything stays
// inside the rift region, and ordinary rift seeds never read as vaults.
import { describe, expect, it } from 'vitest';
import { RIFT_REGION_HALF_X, RIFT_REGION_HALF_Z } from '../src/sim/data';
import { RIFT_RANK_BASE_LEVEL } from '../src/sim/rift/ranks';
import { generateRiftFloor, isSetPieceSeed, riftFloorCount } from '../src/sim/rift/rift_gen';
import { makeVaultSeed, type VaultSizeTier, vaultSeedTier } from '../src/sim/rift/vault_seed';

const TIERS: VaultSizeTier[] = [0, 1, 2, 3];
const LEVELS = [
  RIFT_RANK_BASE_LEVEL.C,
  RIFT_RANK_BASE_LEVEL.B,
  RIFT_RANK_BASE_LEVEL.A,
  RIFT_RANK_BASE_LEVEL.S,
];

describe('vault seeds', () => {
  it('round-trips the tier and never collides with the natural seed space', () => {
    for (const tier of TIERS) {
      for (const random of [0, 1, 12345, 0x0fffffff, 0xffffffff]) {
        expect(vaultSeedTier(makeVaultSeed(tier, random))).toBe(tier);
      }
    }
    // Natural and dev portals draw seeds in [1, 1e9] (src/sim/rift/portals.ts).
    for (const seed of [1, 555, 31337, 999_999_999, 1_000_000_000, 0x3fffffff, 0x7fffffff]) {
      expect(vaultSeedTier(seed)).toBeNull();
    }
    expect(vaultSeedTier(0xbfffffff)).toBeNull();
  });
});

describe('the one-room vault', () => {
  it('is a single puzzle-free boss room that grows with the tier, inside the region', () => {
    const meanLength: number[] = [];
    const meanTrash: number[] = [];
    for (const tier of TIERS) {
      let length = 0;
      let trash = 0;
      const N = 40;
      for (let i = 0; i < N; i++) {
        const seed = makeVaultSeed(tier, 7919 * (i + 1));
        const baseLevel = LEVELS[tier];
        expect(isSetPieceSeed(seed)).toBe(false);
        expect(riftFloorCount(seed, baseLevel)).toBe(1);
        const floor = generateRiftFloor(seed, baseLevel, 0);
        expect(floor.floorCount).toBe(1);
        expect(floor.isBoss).toBe(true);
        expect(floor.puzzle.kind).toBe('none');
        expect(floor.spawns.filter((s) => s.boss)).toHaveLength(1);
        expect(floor.hazards).toEqual([]);
        // Everything the room holds stays inside the rift region.
        expect(floor.layout.zMax).toBeLessThan(RIFT_REGION_HALF_Z);
        for (const spawn of floor.spawns) {
          expect(Math.abs(spawn.x)).toBeLessThan(RIFT_REGION_HALF_X);
          expect(spawn.z).toBeLessThan(RIFT_REGION_HALF_Z);
        }
        // Regenerating from the seed alone gives the same room (both hosts do).
        expect(generateRiftFloor(seed, baseLevel, 0)).toBe(floor);
        length += floor.layout.zMax - floor.layout.zMin;
        trash += floor.spawns.filter((s) => !s.boss).length;
      }
      meanLength.push(length / N);
      meanTrash.push(trash / N);
    }
    for (let tier = 1; tier < 4; tier++) {
      expect(meanLength[tier]).toBeGreaterThan(meanLength[tier - 1] + 15);
      expect(meanTrash[tier]).toBeGreaterThan(meanTrash[tier - 1]);
    }
    // A common map is a short errand; a legendary one a real fight.
    expect(meanTrash[0]).toBeLessThan(9);
    expect(meanTrash[3]).toBeGreaterThan(20);
  });

  it('leaves ordinary rift seeds exactly as they were', () => {
    // Pinned from the generator before the vault branch existed.
    const floor = generateRiftFloor(424242, RIFT_RANK_BASE_LEVEL.C, 0);
    expect(floor.floorCount).toBeGreaterThanOrEqual(2);
    expect(floor.isBoss).toBe(false);
    expect(riftFloorCount(424242)).toBe(floor.floorCount);
  });
});
