import { describe, expect, it } from 'vitest';
import { authoredTownBuildingPlacements } from '../src/editor/feature_prop_placements';
import { TARGET_HEIGHT } from '../src/render/asset_scale';
import { authoredRampsForPath } from '../src/sim/asset_collision';
import { buildingRecordColliders } from '../src/sim/authored_town_buildings';
import { type Collider, rotY } from '../src/sim/collider_shapes';
import { pushPlacementColliders } from '../src/sim/colliders_authored/placement_colliders';
import { ZONE2_PROPS } from '../src/sim/content/zone2';
import { BUILTIN_WORLD } from '../src/sim/data';
import { FENBRIDGE_LAYOUT } from '../src/sim/fenbridge_layout';
import { loadPublishedMap } from '../src/sim/maps/eastbrook_rebuild.generated';
import { decksMayStand } from '../src/sim/placement_ramps';
import { nearTownWalkIn, townWalkInPlacements, walkInPlacementFor } from '../src/sim/town_walk_in';
import type { BuildingDef, WorldContent } from '../src/sim/types';
import { WORLD_SEED } from '../src/sim/world_seed';

// The walk-in town buildings (src/sim/town_walk_in.ts): the one placement a
// walk-in record resolves to, which its walls (authored_town_buildings.ts)
// and its floors (placement_ramps.ts) are both built from.

const WALK_IN = FENBRIDGE_LAYOUT.buildings.filter((building) => building.walkIn);

function recordOf(id: string): BuildingDef {
  const record = ZONE2_PROPS.buildings.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`no props record for ${id}`);
  return record;
}

describe('the walk-in town placement', () => {
  it('stands each walk-in model at its layout anchor, at the size Studio places it', () => {
    const studio = authoredTownBuildingPlacements(WORLD_SEED);
    expect(WALK_IN.length).toBeGreaterThan(0);
    for (const building of WALK_IN) {
      const placement = walkInPlacementFor(recordOf(building.id));
      if (!placement) throw new Error(`${building.id} resolved no placement`);
      expect(placement).toMatchObject({
        path: building.assetId,
        x: building.placement.x,
        z: building.placement.z,
        rotY: building.placement.rotation,
        y: building.placement.lift,
      });
      // one size rule: the largest dimension over the placed-asset target height
      expect(placement.scale, building.id).toBeCloseTo(
        (building.placement.scale * building.placement.modelSize) / TARGET_HEIGHT,
        9,
      );
      const asStudio = studio.find((p) => `/models/${p.assetId}.glb` === building.assetId);
      if (!asStudio) throw new Error(`Studio places no ${building.assetId}`);
      expect(placement.scale, building.id).toBeCloseTo(asStudio.scale, 3);
    }
  });

  it('gives a sealed record, and one a custom world moved, turned or resized, nothing', () => {
    const sealed = FENBRIDGE_LAYOUT.buildings.filter((building) => !building.walkIn);
    expect(sealed.length).toBeGreaterThan(0);
    for (const building of sealed) expect(walkInPlacementFor(recordOf(building.id))).toBeNull();
    const inn = recordOf(WALK_IN[0].id);
    expect(walkInPlacementFor(inn)).not.toBeNull();
    expect(walkInPlacementFor({ ...inn, x: inn.x + 2 })).toBeNull();
    expect(walkInPlacementFor({ ...inn, z: inn.z - 2 })).toBeNull();
    expect(walkInPlacementFor({ ...inn, rot: inn.rot + 0.5 })).toBeNull();
    expect(walkInPlacementFor({ ...inn, w: inn.w + 1 })).toBeNull();
    expect(walkInPlacementFor({ ...inn, d: inn.d - 1 })).toBeNull();
    expect(walkInPlacementFor({ ...inn, id: undefined })).toBeNull();
  });

  it('stands the floors of a world that keeps the town records, never of one that owns them', () => {
    expect(townWalkInPlacements(BUILTIN_WORLD).map((p) => p.path)).toEqual(
      WALK_IN.map((building) => building.assetId),
    );
    // a plain copy of the built-in world keeps the records, and their floors
    expect(townWalkInPlacements({ ...BUILTIN_WORLD } as WorldContent)).toHaveLength(WALK_IN.length);
    // a document that took the buildings over as placements stands the records down
    expect(
      townWalkInPlacements({
        ...BUILTIN_WORLD,
        promotedScenery: { authoredTowns: true },
      } as WorldContent),
    ).toEqual([]);
    expect(townWalkInPlacements(loadPublishedMap())).toEqual([]);
  });

  it('collides exactly as the same model placed in Studio', () => {
    for (const building of WALK_IN) {
      const record = recordOf(building.id);
      const placement = walkInPlacementFor(record);
      if (!placement) throw new Error(`${building.id} resolved no placement`);
      const town = buildingRecordColliders(record, 30, () => 0, WORLD_SEED);
      const studio: Collider[] = [];
      pushPlacementColliders(
        studio,
        { ...BUILTIN_WORLD, placements: [placement] } as WorldContent,
        WORLD_SEED,
      );
      expect(studio.length, building.id).toBeGreaterThan(0);
      // the Studio lane stamps a dev attribution on what it emits; nothing else differs
      expect(town, building.id).toEqual(studio.map(({ src: _src, ...rest }) => rest));
    }
  });

  it('keeps every walk-in floor inside the box the built-in ground query asks about', () => {
    for (const building of WALK_IN) {
      const placement = walkInPlacementFor(recordOf(building.id));
      if (!placement) throw new Error(`${building.id} resolved no placement`);
      const decks = authoredRampsForPath(placement.path);
      expect(decks.length, building.id).toBeGreaterThan(0);
      for (const deck of decks) {
        for (const [u, v] of [
          [-deck.hx, -deck.hz],
          [deck.hx, -deck.hz],
          [deck.hx, deck.hz],
          [-deck.hx, deck.hz],
        ]) {
          // the deck's corner, turned within the model, then placed in the world
          const inModel = rotY(u, v, deck.ry ?? 0);
          const offset = rotY(
            (deck.x + inModel.x) * placement.scale,
            (deck.z + inModel.z) * placement.scale,
            placement.rotY,
          );
          const x = placement.x + offset.x;
          const z = placement.z + offset.z;
          expect(nearTownWalkIn(x, z), `${building.id} deck corner`).toBe(true);
          expect(decksMayStand(BUILTIN_WORLD, x, z), `${building.id} deck corner`).toBe(true);
        }
      }
    }
    // away from the town the built-in world asks for no deck at all
    for (const [x, z] of [
      [0, 0],
      [-14, -100],
      [120, 300],
      [0, 420],
    ]) {
      expect(decksMayStand(BUILTIN_WORLD, x, z), `${x}, ${z}`).toBe(false);
    }
  });
});
