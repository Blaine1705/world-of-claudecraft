// The Stormbrass Foundry is a shelf cut into a mountain, in a dry storm
// (src/render/stormbrass_foundry/foundry_sky.ts, its plan in
// foundry_plan_core.ts): no rain veil and no cloud sea round it (together they
// read as a small island in the rain), but a deep scree valley under the drop,
// rock buttresses and flanks climbing to the peaks, and smoke on the cliffs.

import { describe, expect, it } from 'vitest';
import {
  foundryValleyHeight,
  outsideShelf,
  planFoundryButtresses,
  planFoundryPlumes,
  VALLEY_FLOOR_MAX_NEAR,
} from '../src/render/stormbrass_foundry/foundry_plan_core';
import { buildFoundrySky } from '../src/render/stormbrass_foundry/foundry_sky';
import {
  STORMBRASS_FOUNDRY_FIELD,
  STORMBRASS_FOUNDRY_VOID_HEIGHT,
} from '../src/sim/content/stormbrass_foundry_layout';

describe('the mountain round the Foundry', () => {
  it('draws no rain and no sea: only the dome and the rock', () => {
    for (const lowGfx of [false, true]) {
      const sky = buildFoundrySky({ lowGfx, density: lowGfx ? 0.35 : 1 });
      const names: string[] = [];
      sky.traverse((o) => names.push(o.name));
      expect(names).not.toContain('stormbrassRain');
      expect(names).not.toContain('stormbrassCloudSea');
      expect(names).toContain('stormbrassSky');
      expect(names).toContain('stormbrassPeaks');
    }
  });

  it('keeps the valley floor deep under the drop near the shelf, never a ledge', () => {
    const b = STORMBRASS_FOUNDRY_FIELD.bounds;
    for (let z = b.minZ - 120; z <= b.maxZ + 120; z += 7) {
      for (let x = b.minX - 120; x <= b.maxX + 120; x += 7) {
        if (outsideShelf(x, z) > 120) continue;
        const y = foundryValleyHeight(x, z);
        expect(y).toBeLessThanOrEqual(VALLEY_FLOOR_MAX_NEAR + 1e-9);
        // Every generated cliff face (down to 25 yd under the void) meets it.
        expect(y).toBeGreaterThanOrEqual(STORMBRASS_FOUNDRY_VOID_HEIGHT - 25);
      }
    }
    expect(VALLEY_FLOOR_MAX_NEAR).toBeLessThan(STORMBRASS_FOUNDRY_VOID_HEIGHT);
  });

  it('climbs into the flanks far out, toward the peaks', () => {
    expect(foundryValleyHeight(0, STORMBRASS_FOUNDRY_FIELD.bounds.maxZ + 420)).toBeGreaterThan(30);
    expect(foundryValleyHeight(STORMBRASS_FOUNDRY_FIELD.bounds.maxX + 420, 0)).toBeGreaterThan(30);
  });

  it('stands its buttresses and smoke off the walkable shelf, under its floor', () => {
    for (const density of [0, 0.6, 1]) {
      for (const t of planFoundryButtresses(density)) {
        expect(outsideShelf(t.x, t.z)).toBeGreaterThan(t.r);
        expect(t.top).toBeLessThan(0);
      }
      for (const p of planFoundryPlumes(density)) {
        expect(outsideShelf(p.x, p.z)).toBeGreaterThan(p.w / 2);
        // Their feet far down the cliffs, under the shelf's lowest floor.
        expect(p.y).toBeLessThan(-30);
      }
    }
  });
});
