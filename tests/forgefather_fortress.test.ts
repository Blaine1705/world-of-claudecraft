// The Forgefather's Isle fortress bake: the world-space placement table
// resolves real props, its colliders follow the ground-standing derivation
// exactly (walk-over floors and stairs never block, aerial stack members
// never block), and every ground-standing piece stands on dry ground at the
// shipped seed (the authored-placement coordinate rule,
// src/sim/content/CLAUDE.md).
import { describe, expect, it } from 'vitest';
import type { ObbCollider } from '../src/sim/colliders';
import {
  FORGEFATHER_FORTRESS_PLACEMENTS,
  forgefatherFortressColliders,
} from '../src/sim/forgefather_fortress';
import {
  IGNIVAR_NON_COLLIDING_PROPS,
  IGNIVAR_PROP_COLLIDER_FOOTPRINT,
  IGNIVAR_PROP_NATIVE,
} from '../src/sim/ignivar_props';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const GROUND_STAND_TOLERANCE = 2.5;

describe('forgefather fortress bake', () => {
  it('every placement resolves a registered prop', () => {
    expect(FORGEFATHER_FORTRESS_PLACEMENTS.length).toBe(58);
    for (const placement of FORGEFATHER_FORTRESS_PLACEMENTS)
      expect(IGNIVAR_PROP_NATIVE[placement.key], placement.key).toBeDefined();
  });

  it('colliders match the ground-standing solid placements exactly', () => {
    const colliders = forgefatherFortressColliders(WORLD_SEED) as ObbCollider[];
    const expected = FORGEFATHER_FORTRESS_PLACEMENTS.filter(
      (placement) =>
        !IGNIVAR_NON_COLLIDING_PROPS.has(placement.key) &&
        placement.y <= terrainHeight(placement.x, placement.z, WORLD_SEED) + GROUND_STAND_TOLERANCE,
    );
    expect(colliders.length).toBe(expected.length);
    expect(colliders.length).toBeGreaterThanOrEqual(20);
    for (const placement of expected) {
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
      expect(match?.moveTopY).toBeUndefined();
      expect(match?.standable).toBeUndefined();
    }
  });

  it('walk-over pieces and aerial stack members never block', () => {
    const colliders = forgefatherFortressColliders(WORLD_SEED) as ObbCollider[];
    for (const placement of FORGEFATHER_FORTRESS_PLACEMENTS) {
      const walkOver = IGNIVAR_NON_COLLIDING_PROPS.has(placement.key);
      const aerial =
        placement.y > terrainHeight(placement.x, placement.z, WORLD_SEED) + GROUND_STAND_TOLERANCE;
      if (!walkOver && !aerial) continue;
      const hit = colliders.find(
        (collider) =>
          collider.x === placement.x && collider.z === placement.z && collider.rot === placement.ry,
      );
      expect(hit, `${placement.key} at (${placement.x}, ${placement.z}) must not block`).toBe(
        undefined,
      );
    }
  });

  it('every ground-standing piece stands on dry ground at the shipped seed', () => {
    for (const placement of FORGEFATHER_FORTRESS_PLACEMENTS) {
      const ground = terrainHeight(placement.x, placement.z, WORLD_SEED);
      if (placement.y > ground + GROUND_STAND_TOLERANCE) continue;
      expect(
        ground,
        `${placement.key} at (${placement.x}, ${placement.z}) stands in water`,
      ).toBeGreaterThan(WATER_LEVEL);
    }
  });
});
