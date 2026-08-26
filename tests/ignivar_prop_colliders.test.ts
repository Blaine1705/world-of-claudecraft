// The Ignivar dressing props collide exactly where they render: every
// floor-standing placement yields a full-height OBB with the prop's true
// footprint, overhead chains and trim beams stay non-blocking, the derived
// interior set actually carries the prop colliders, and no spawn point
// (player entry or dormant pack) is buried inside one.
import { describe, expect, it } from 'vitest';
import type { Collider, ObbCollider } from '../src/sim/colliders';
import { DUNGEONS } from '../src/sim/data';
import { IGNIVAR_FORGE_APPROACH_LAYOUT } from '../src/sim/dungeon_layout';
import {
  IGNIVAR_PROP_COLLIDER_FOOTPRINT,
  IGNIVAR_PROP_NATIVE,
  ignivarPropColliders,
  ignivarPropPlacements,
} from '../src/sim/ignivar_props';
import { derivedInteriorColliders } from '../src/sim/interior_collider_sets';

const APPROACH = 'ignivar_approach';
const LAYOUT = IGNIVAR_FORGE_APPROACH_LAYOUT;

function pointInObb(collider: ObbCollider, x: number, z: number, pad = 0): boolean {
  // Same local-frame transform as the engine's OBB samplers in colliders.ts.
  const dx = x - collider.x;
  const dz = z - collider.z;
  const cos = Math.cos(-collider.rot);
  const sin = Math.sin(-collider.rot);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return Math.abs(localX) <= collider.hw + pad && Math.abs(localZ) <= collider.hd + pad;
}

const obbs = (colliders: Collider[]): ObbCollider[] =>
  colliders.filter((collider): collider is ObbCollider => collider.type === 'obb');

describe('ignivar prop colliders', () => {
  it('gives every floor prop an OBB matching its rendered footprint', () => {
    const placements = ignivarPropPlacements(APPROACH, LAYOUT);
    const colliders = obbs(ignivarPropColliders(APPROACH, LAYOUT));
    const floorProps = placements.filter(
      (placement) =>
        placement.y === 0 && !placement.key.startsWith('chain') && placement.key !== 'beam',
    );
    expect(floorProps.length).toBeGreaterThanOrEqual(15);
    expect(colliders.length).toBe(floorProps.length);
    for (const placement of floorProps) {
      const native = IGNIVAR_PROP_NATIVE[placement.key];
      const footprint = IGNIVAR_PROP_COLLIDER_FOOTPRINT[placement.key] ?? 1;
      const match = colliders.find(
        (collider) =>
          collider.x === placement.x &&
          collider.z === placement.z &&
          collider.rot === placement.ry &&
          Math.abs(collider.hw - (native.len * placement.scale * footprint) / 2) < 1e-9 &&
          Math.abs(collider.hd - (native.dep * placement.scale * footprint) / 2) < 1e-9,
      );
      expect(match, `${placement.key} at (${placement.x}, ${placement.z})`).toBeDefined();
      // Architecture, not parkour: full-height blockers.
      expect(match?.moveTopY).toBeUndefined();
      expect(match?.standable).toBeUndefined();
    }
  });

  it('keeps chains and beam trim non-blocking, and quiet rooms empty', () => {
    const placements = ignivarPropPlacements(APPROACH, LAYOUT);
    expect(placements.some((placement) => placement.key === 'chain')).toBe(true);
    const colliders = ignivarPropColliders(APPROACH, LAYOUT);
    for (const collider of obbs(colliders)) {
      for (const placement of placements) {
        if (placement.key !== 'chain' && placement.key !== 'chain_hanging') continue;
        expect(collider.x === placement.x && collider.z === placement.z).toBe(false);
      }
    }
    expect(ignivarPropColliders('crypt', LAYOUT)).toEqual([]);
  });

  it('rides the derived interior collider set', () => {
    const derived = derivedInteriorColliders(null, APPROACH, {});
    const props = obbs(ignivarPropColliders(APPROACH, LAYOUT));
    for (const prop of props) {
      expect(
        derived.some(
          (collider) => collider.type === 'obb' && collider.x === prop.x && collider.z === prop.z,
        ),
        `derived set missing prop collider at (${prop.x}, ${prop.z})`,
      ).toBe(true);
    }
  });

  it('never buries a spawn point inside a prop collider', () => {
    const colliders = obbs(ignivarPropColliders(APPROACH, LAYOUT));
    const approach = Object.values(DUNGEONS).find((dungeon) => dungeon.interior === APPROACH);
    expect(approach).toBeDefined();
    const points: Array<{ label: string; x: number; z: number }> = [];
    if (approach?.entry) points.push({ label: 'player entry', ...approach.entry });
    for (const spawn of approach?.spawns ?? [])
      points.push({ label: `spawn ${spawn.mobId}`, x: spawn.x, z: spawn.z });
    for (const npc of approach?.npcs ?? [])
      points.push({ label: `npc ${npc.npcId}`, x: npc.x, z: npc.z });
    expect(points.length).toBeGreaterThan(3);
    for (const point of points) {
      for (const collider of colliders) {
        expect(
          pointInObb(collider, point.x, point.z, 0.6),
          `${point.label} at (${point.x}, ${point.z}) is inside a prop collider at (${collider.x}, ${collider.z})`,
        ).toBe(false);
      }
    }
  });
});
