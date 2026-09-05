import { expect, it } from 'vitest';
import { resolvePosition } from '../src/sim/colliders';
import { NORTH_WATCH_CANNON } from '../src/sim/content/vehicle_stations';
import { CAMPS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { generateDecorationsInBounds, terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

it('places the cannon on dry ground away from ambient hostile camps', () => {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
  const station = NORTH_WATCH_CANNON;
  expect(terrainHeight(station.x, station.z, WORLD_SEED)).toBeGreaterThan(WATER_LEVEL + 1);
  const nearest = [...sim.entities.values()]
    .filter((entity) => entity.kind === 'mob' && entity.hostile)
    .map((entity) => ({
      id: entity.templateId,
      distance: Math.hypot(entity.pos.x - station.x, entity.pos.z - station.z),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  expect(nearest.distance, JSON.stringify(nearest)).toBeGreaterThan(25);
});

it('keeps the entire firing field dry and free of procedural obstacles', () => {
  const field = NORTH_WATCH_CANNON.field;
  expect(generateDecorationsInBounds(WORLD_SEED, field)).toEqual([]);
  for (let x = field.minX; x <= field.maxX; x++) {
    for (let z = field.minZ; z <= field.maxZ; z++) {
      const height = terrainHeight(x, z, WORLD_SEED);
      expect(height, `${x},${z}`).toBeGreaterThan(WATER_LEVEL + 1);
      expect(Math.abs(height - terrainHeight(x + 1, z, WORLD_SEED))).toBeLessThan(0.6);
      expect(Math.abs(height - terrainHeight(x, z + 1, WORLD_SEED))).toBeLessThan(0.6);
      expect(resolvePosition(WORLD_SEED, x, z, 1), `${x},${z}`).toEqual({ x, z });
    }
  }
  for (const camp of CAMPS) {
    const x = Math.max(field.minX, Math.min(field.maxX, camp.center.x));
    const z = Math.max(field.minZ, Math.min(NORTH_WATCH_CANNON.z + 6, camp.center.z));
    expect(Math.hypot(camp.center.x - x, camp.center.z - z) - camp.radius).toBeGreaterThan(15);
  }
});
