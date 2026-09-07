import { describe, expect, it } from 'vitest';
import { resolvePosition } from '../src/sim/colliders';
import { HORDE_NPC_DEF, HORDE_SITE, WORLD_QUEST_HORDE } from '../src/sim/content/world_quest_horde';
import { CAMPS, PROPS } from '../src/sim/data';
import { HORDE_DEPTH, HORDE_HALF_WIDTH } from '../src/sim/minigames/horde_barricade';
import { hash2 } from '../src/sim/rng';
import { generateDecorations, groundHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

describe('Wyrmroad barricade placement', () => {
  it('faces the forest pass with the captain behind the firing line', () => {
    expect(WORLD_QUEST_HORDE.zoneId).toBe('wraithwood');
    expect(HORDE_SITE).toEqual({ x: 402, z: 1778, direction: 1 });
    expect(HORDE_NPC_DEF.pos).toEqual({ x: 402, z: 1773 });
    expect(WORLD_QUEST_HORDE.objective).toEqual({
      type: 'horde',
      instructorNpcId: HORDE_NPC_DEF.id,
    });
  });

  it('keeps the whole firing lane dry, gently graded, and clear of collision and hostile camps', () => {
    let lowest = Infinity;
    let highest = -Infinity;
    // Include a one-yard lateral margin for the double-shot stream and enemy silhouettes.
    for (let dx = -HORDE_HALF_WIDTH - 1; dx <= HORDE_HALF_WIDTH + 1; dx++) {
      for (let dz = 0; dz <= HORDE_DEPTH; dz++) {
        const x = HORDE_SITE.x + dx;
        const z = HORDE_SITE.z + dz * HORDE_SITE.direction;
        const label = `${x},${z}`;
        const h = groundHeight(x, z, WORLD_SEED);
        lowest = Math.min(lowest, h);
        highest = Math.max(highest, h);
        expect(h, label).toBeGreaterThan(WATER_LEVEL + 1);
        expect(Math.abs(h - groundHeight(x + 0.5, z, WORLD_SEED)) * 2, label).toBeLessThan(0.3);
        expect(Math.abs(h - groundHeight(x, z + 0.5, WORLD_SEED)) * 2, label).toBeLessThan(0.3);
        // Only the player's lateral strip uses world collision. Private incoming
        // actors may pass a small public gathering fixture farther up the road.
        if (dz <= 3) expect(resolvePosition(WORLD_SEED, x, z, 0.7), label).toEqual({ x, z });
        for (const camp of CAMPS) {
          expect(
            Math.hypot(camp.center.x - x, camp.center.z - z) - camp.radius,
            label,
          ).toBeGreaterThan(25);
        }
      }
    }
    expect(highest - lowest).toBeLessThan(3);
  });

  it('keeps the captain reachable and removes lane scatter that could hide targets', () => {
    for (const dx of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) {
        const x = HORDE_NPC_DEF.pos.x + dx;
        const z = HORDE_NPC_DEF.pos.z + dz;
        expect(groundHeight(x, z, WORLD_SEED)).toBeGreaterThan(WATER_LEVEL + 1);
        expect(resolvePosition(WORLD_SEED, x, z, 0.7)).toEqual({ x, z });
      }
    }
    const laneScatter = generateDecorations(WORLD_SEED).filter(
      (decoration) =>
        Math.abs(decoration.x - HORDE_SITE.x) <= HORDE_HALF_WIDTH + 4 &&
        (decoration.z - HORDE_SITE.z) * HORDE_SITE.direction >= 0 &&
        (decoration.z - HORDE_SITE.z) * HORDE_SITE.direction <= HORDE_DEPTH,
    );
    expect(laneScatter).toEqual([]);
  });

  it('keeps the lane outside authored giant-tree crowns, beyond trunk collision alone', () => {
    // The haunted great-tree GLB has an asymmetric crown. These measured local
    // bounds and authored seeded transforms include the crown, unlike trunk r.
    const lane = {
      x0: HORDE_SITE.x - 9,
      x1: HORDE_SITE.x + 9,
      z0: HORDE_NPC_DEF.pos.z - 2,
      z1: HORDE_SITE.z + HORDE_DEPTH,
    };
    for (const tree of PROPS.greatTrees ?? []) {
      const scale = tree.r * (2.4 + hash2(tree.x, tree.z, WORLD_SEED + 4101) * 0.5);
      const rotation = hash2(tree.z, tree.x, WORLD_SEED + 4111) * Math.PI * 2;
      const xs: number[] = [];
      const zs: number[] = [];
      for (const x of [-2.174, 11.087]) {
        for (const z of [-6.727, 4.823]) {
          xs.push(tree.x + scale * (x * Math.cos(rotation) + z * Math.sin(rotation)));
          zs.push(tree.z + scale * (-x * Math.sin(rotation) + z * Math.cos(rotation)));
        }
      }
      const laneCorners = [
        [lane.x0, lane.z0],
        [lane.x0, lane.z1],
        [lane.x1, lane.z0],
        [lane.x1, lane.z1],
      ];
      // SAT tests the rotated crown rectangle itself. Its world-aligned box
      // includes empty corners and falsely rejects the nearby northern tree.
      const axes = [
        [1, 0],
        [0, 1],
        [Math.cos(rotation), -Math.sin(rotation)],
        [Math.sin(rotation), Math.cos(rotation)],
      ];
      const overlaps = axes.every(([ax, az]) => {
        const crown = xs.map((x, i) => x * ax + zs[i] * az);
        const road = laneCorners.map(([x, z]) => x * ax + z * az);
        return Math.max(...crown) >= Math.min(...road) && Math.min(...crown) <= Math.max(...road);
      });
      expect(overlaps, `great tree at ${tree.x},${tree.z} overhangs the firing lane`).toBe(false);
    }
  });
});
