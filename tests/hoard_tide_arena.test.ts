import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import { TREASURE_MAP_RARITIES } from '../src/sim/content/treasure_maps';
import { layoutColliders } from '../src/sim/dungeon_layout';
import {
  HOARD_TIDE_WAVE_HALF_DEPTH,
  HOARD_TIDE_WAVE_HALF_GAP,
} from '../src/sim/rift/hoard_boss_kits';
import { hoardTidePattern } from '../src/sim/rift/hoard_tide_pattern';
import { generateRiftFloor } from '../src/sim/rift/rift_gen';
import { makeVaultSeed, VAULT_ZONE_IDS, type VaultSizeTier } from '../src/sim/rift/vault_seed';

const PLAYER_MARGIN = 0.6;

function blocked(colliders: readonly Collider[], x: number, z: number): boolean {
  return colliders.some((collider) => {
    const dx = x - collider.x;
    const dz = z - collider.z;
    if (collider.type === 'circle') {
      return Math.hypot(dx, dz) < collider.r + PLAYER_MARGIN;
    }
    const cos = Math.cos(collider.rot);
    const sin = Math.sin(collider.rot);
    return (
      Math.abs(dx * cos - dz * sin) < collider.hw + PLAYER_MARGIN &&
      Math.abs(dx * sin + dz * cos) < collider.hd + PLAYER_MARGIN
    );
  });
}

describe('tide patterns fit actual generated hoard arenas', () => {
  for (const [tier, rarity] of TREASURE_MAP_RARITIES.entries()) {
    it(`${rarity} keeps the whole sweep and gap approaches clear of scenery`, () => {
      const failures: string[] = [];
      for (let random = 0; random < 32; random++) {
        const seed = makeVaultSeed(tier as VaultSizeTier, random, {
          open: tier >= 2,
          zoneId: VAULT_ZONE_IDS[random % VAULT_ZONE_IDS.length],
        });
        const floor = generateRiftFloor(seed, 23, 0);
        const boss = floor.spawns.find((spawn) => spawn.boss)!;
        const colliders = layoutColliders(floor.layout);
        expect(Boolean(floor.outdoor)).toBe(tier >= 2);
        for (const wave of hoardTidePattern(seed, rarity, true)) {
          const cos = Math.cos(wave.facing);
          const sin = Math.sin(wave.facing);
          const extent = wave.radius / 2 + HOARD_TIDE_WAVE_HALF_DEPTH;
          // A clear rectangle proves that lateral straight-line routes used by
          // the lead-time guarantee are not obstructed by pillars or the shell.
          for (let along = -extent; along <= extent; along += 0.5) {
            for (let lateral = -wave.span; lateral <= wave.span; lateral += 0.5) {
              const x = boss.x + lateral * cos + along * sin;
              const z = boss.z - lateral * sin + along * cos;
              if (blocked(colliders, x, z)) {
                failures.push(`seed=${seed}, facing=${wave.facing}, x=${x}, z=${z}`);
                break;
              }
            }
          }
          // Explicitly cover the center and both usable edges of the safe gap,
          // even when they fall between the broad rectangle's sampling grid.
          for (const lateral of [
            wave.gap,
            wave.gap - HOARD_TIDE_WAVE_HALF_GAP + PLAYER_MARGIN,
            wave.gap + HOARD_TIDE_WAVE_HALF_GAP - PLAYER_MARGIN,
          ]) {
            for (let along = -extent; along <= extent; along += 0.5) {
              if (
                blocked(
                  colliders,
                  boss.x + lateral * cos + along * sin,
                  boss.z - lateral * sin + along * cos,
                )
              ) {
                failures.push(`blocked safe gap: seed=${seed}, facing=${wave.facing}`);
              }
            }
          }
        }
      }
      expect(failures.slice(0, 12), `${failures.length} obstructed arena samples`).toEqual([]);
    });
  }
});
