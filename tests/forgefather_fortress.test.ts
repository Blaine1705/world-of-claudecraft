// The Forgefather's Isle fortress bake: the world-space placement table
// resolves real props, deck pieces emit STANDABLE platforms at their own
// surface height (the strait bridge is walked ON, above the water), solids
// follow the ground-standing blocker derivation exactly (walk-over trim and
// aerial stack members never block), and seawalls may stand submerged by
// design.
import { describe, expect, it } from 'vitest';
import type { ObbCollider } from '../src/sim/colliders';
import {
  FORGEFATHER_FORTRESS_PLACEMENTS,
  FORTRESS_STANDABLE_KEYS,
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
    expect(FORGEFATHER_FORTRESS_PLACEMENTS.length).toBe(154);
    for (const placement of FORGEFATHER_FORTRESS_PLACEMENTS)
      expect(IGNIVAR_PROP_NATIVE[placement.key], placement.key).toBeDefined();
  });

  it('every deck piece emits a standable platform at its surface, above the water', () => {
    const colliders = forgefatherFortressColliders(WORLD_SEED) as ObbCollider[];
    const decks = FORGEFATHER_FORTRESS_PLACEMENTS.filter((placement) =>
      FORTRESS_STANDABLE_KEYS.has(placement.key),
    );
    expect(decks.length).toBeGreaterThanOrEqual(30);
    for (const placement of decks) {
      const native = IGNIVAR_PROP_NATIVE[placement.key];
      const top = placement.y + native.hei * placement.scale;
      const match = colliders.find(
        (collider) =>
          collider.x === placement.x &&
          collider.z === placement.z &&
          collider.rot === placement.ry &&
          collider.standable === true &&
          collider.moveTopY === top,
      );
      expect(match, `${placement.key} at (${placement.x}, ${placement.z})`).toBeDefined();
      // The crossing stays dry: every walking surface clears the waterline.
      expect(top, `${placement.key} deck at (${placement.x}, ${placement.z})`).toBeGreaterThan(
        WATER_LEVEL + 1,
      );
    }
  });

  it('blockers match the ground-standing solid placements exactly', () => {
    const colliders = (forgefatherFortressColliders(WORLD_SEED) as ObbCollider[]).filter(
      (collider) => !collider.standable,
    );
    const expected = FORGEFATHER_FORTRESS_PLACEMENTS.filter(
      (placement) =>
        !FORTRESS_STANDABLE_KEYS.has(placement.key) &&
        !IGNIVAR_NON_COLLIDING_PROPS.has(placement.key) &&
        placement.y <=
          terrainHeight(placement.x, placement.z, WORLD_SEED) + GROUND_STAND_TOLERANCE &&
        placement.y + IGNIVAR_PROP_NATIVE[placement.key].hei * placement.scale >=
          terrainHeight(placement.x, placement.z, WORLD_SEED) + 0.5,
    );
    expect(colliders.length).toBe(expected.length);
    expect(colliders.length).toBeGreaterThanOrEqual(40);
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

  it('walk-over trim and aerial stack members never block', () => {
    const blockers = (forgefatherFortressColliders(WORLD_SEED) as ObbCollider[]).filter(
      (collider) => !collider.standable,
    );
    for (const placement of FORGEFATHER_FORTRESS_PLACEMENTS) {
      if (FORTRESS_STANDABLE_KEYS.has(placement.key)) continue;
      const walkOver = IGNIVAR_NON_COLLIDING_PROPS.has(placement.key);
      const ground = terrainHeight(placement.x, placement.z, WORLD_SEED);
      const aerial = placement.y > ground + GROUND_STAND_TOLERANCE;
      const interred =
        placement.y + IGNIVAR_PROP_NATIVE[placement.key].hei * placement.scale < ground + 0.5;
      if (!walkOver && !aerial && !interred) continue;
      // A stacked twin at the same x/z/rot (a different y) may be a
      // legitimate blocker; only flag when no such twin explains the hit.
      const twinBlocks = FORGEFATHER_FORTRESS_PLACEMENTS.some((other) => {
        if (other === placement || other.x !== placement.x || other.z !== placement.z) return false;
        if (other.ry !== placement.ry) return false;
        if (FORTRESS_STANDABLE_KEYS.has(other.key) || IGNIVAR_NON_COLLIDING_PROPS.has(other.key))
          return false;
        const g = terrainHeight(other.x, other.z, WORLD_SEED);
        return (
          other.y <= g + GROUND_STAND_TOLERANCE &&
          other.y + IGNIVAR_PROP_NATIVE[other.key].hei * other.scale >= g + 0.5
        );
      });
      if (twinBlocks) continue;
      const hit = blockers.find(
        (collider) =>
          collider.x === placement.x && collider.z === placement.z && collider.rot === placement.ry,
      );
      expect(hit, `${placement.key} at (${placement.x}, ${placement.z}) must not block`).toBe(
        undefined,
      );
    }
  });
});
