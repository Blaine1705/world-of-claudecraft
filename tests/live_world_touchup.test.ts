import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { customMapToWorldContent } from '../src/editor/custom_map';
import {
  compileLiveWorldDocument,
  liveWorldBaseline,
  liveWorldPreview,
  publishedLiveWorldDocument,
} from '../src/editor/live_world_core';
import { upgradeLoadedMap } from '../src/editor/map_load_upgrades';
import { MOVABLE_OBJECTS } from '../src/editor/object_moves_core';
import { parseMap, serializeMap } from '../src/editor/persist';
import { colliderInternalsForTest, isBlocked } from '../src/sim/colliders';
import {
  authoredMapActive,
  BASE_WORLD,
  isBuiltinWorldActive,
  setActiveWorldContent,
  studioContentActive,
} from '../src/sim/data';
import { traversalBand } from '../src/sim/traversal_band';
import { groundHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';
import {
  applyWorldTouchup,
  worldTouchupBase,
  worldTouchupIdentity,
} from '../src/sim/world_touchup';

import { WORLD_TOUCHUP, WORLD_TOUCHUP_SOURCE } from '../src/sim/world_touchup.generated';

beforeEach(() => setActiveWorldContent({ ...BASE_WORLD, liveWorldPreview: true }));
afterEach(() => setActiveWorldContent(null));

describe('live-world touch-up pipeline', () => {
  it('keeps the checked-in source and runtime artifact in sync', () => {
    const source = WORLD_TOUCHUP_SOURCE ?? liveWorldBaseline();
    const compiled = compileLiveWorldDocument(source);
    expect(worldTouchupIdentity(compiled.patch.changes)).toBe(
      worldTouchupIdentity(WORLD_TOUCHUP.changes),
    );
  });
  it('opens, upgrades, saves and exports without changing any native world data', () => {
    const map = liveWorldBaseline();
    upgradeLoadedMap(map);
    const saved = parseMap(serializeMap(map))!;
    const result = compileLiveWorldDocument(saved);
    expect(result.patch.changes).toEqual({});
    expect(result.world).toBe(BASE_WORLD);
    expect(saved.placements).toEqual([]);
    expect(result.world.services).toBe(BASE_WORLD.services);
    expect(result.world.props).toBe(BASE_WORLD.props);
    expect(result.world.npcs).toBe(BASE_WORLD.npcs);
  });

  it('keeps live terrain, movement and content rules in the viewport and playtest', () => {
    const map = liveWorldBaseline();
    const samples = [
      [0, 300],
      [13, 285],
      [-15, -125],
      [24, -8],
      [185, 1000],
    ];
    const before = samples.map(([x, z]) => groundHeight(x, z, WORLD_SEED));
    for (const world of [liveWorldPreview(map), customMapToWorldContent(map)]) {
      setActiveWorldContent(world);
      expect(isBuiltinWorldActive()).toBe(true);
      expect(authoredMapActive()).toBe(false);
      expect(studioContentActive()).toBe(false);
      expect(traversalBand()).toBe(0.9);
      expect(samples.map(([x, z]) => groundHeight(x, z, WORLD_SEED))).toEqual(before);
    }
  });

  it('keeps every native static collider when opening the live world', () => {
    const native = colliderInternalsForTest.staticWorldColliders(WORLD_SEED);
    setActiveWorldContent(liveWorldPreview(liveWorldBaseline()));
    expect(colliderInternalsForTest.staticWorldColliders(WORLD_SEED)).toEqual(native);
  });

  it('carries a Mirefen terrain change through serialization into the same game heightfield', () => {
    const map = liveWorldBaseline();
    const x = 110,
      z = 280;
    const before = groundHeight(x, z, WORLD_SEED);
    map.terrainEdits.push({ x, z, radius: 5, delta: 3, falloff: 'flat', mode: 'add' });
    setActiveWorldContent(liveWorldPreview(map));
    const preview = groundHeight(x, z, WORLD_SEED);
    expect(preview).not.toBe(before);
    const compiled = compileLiveWorldDocument(serializeMap(map));
    setActiveWorldContent({ ...compiled.world, liveWorldPreview: true });
    expect(groundHeight(x, z, WORLD_SEED)).toBe(preview);
    expect(compiled.world.terrainEdits!.slice(0, -1)).toEqual(BASE_WORLD.terrainEdits);
    expect(compiled.world.props).toBe(BASE_WORLD.props);
  });

  it('moves and deletes an added solid prop without retaining its old placement', () => {
    const map = liveWorldBaseline();
    map.placements.push({
      uid: 'test-crate',
      assetId: 'biome/hex_crate_big',
      x: 110,
      z: 280,
      rotY: 0,
      scale: 1,
      collide: true,
      collisionMode: 'basic',
      collideRadius: 2,
    });
    expect(isBlocked(WORLD_SEED, 110, 280, 0.1)).toBe(false);
    const first = compileLiveWorldDocument(map).world;
    setActiveWorldContent({ ...first, liveWorldPreview: true });
    expect(isBlocked(WORLD_SEED, 110, 280, 0.1)).toBe(true);
    expect(first.placements).toHaveLength(1);
    map.placements[0].x += 10;
    const moved = compileLiveWorldDocument(map).world;
    setActiveWorldContent({ ...moved, liveWorldPreview: true });
    expect(isBlocked(WORLD_SEED, 110, 280, 0.1)).toBe(false);
    expect(isBlocked(WORLD_SEED, 120, 280, 0.1)).toBe(true);
    expect(moved.placements![0].x).toBe(120);
    expect(moved.placements![0].collideRadius).toBe(2);
    map.placements.splice(0, 1);
    expect(compileLiveWorldDocument(map).world).toBe(BASE_WORLD);
    setActiveWorldContent({ ...BASE_WORLD, liveWorldPreview: true });
    expect(isBlocked(WORLD_SEED, 120, 280, 0.1)).toBe(false);
  });

  it('carries explicit native road removal and gameplay object moves without replacing gameplay tables', () => {
    const map = liveWorldBaseline();
    map.roadEdits = { '0': { removed: true } };
    const object = MOVABLE_OBJECTS[0];
    map.objectMoves = { [object.key]: { x: object.builtin.x + 10, z: object.builtin.z } };
    const compiled = compileLiveWorldDocument(map);
    expect(compiled.world.roads).toEqual(BASE_WORLD.roads.slice(1));
    expect(compiled.world.npcs).toBe(BASE_WORLD.npcs);
    expect(compiled.world.camps).toBe(BASE_WORLD.camps);
    expect(compiled.world.objectMoves?.[object.key]).toEqual(map.objectMoves[object.key]);
  });

  it('ignores cross-engine final-ULP noise but detects meaningful changes and NPC ordering', () => {
    expect(worldTouchupIdentity({ dir: 1.1760052070951348 })).toBe(
      worldTouchupIdentity({ dir: 1.176005207095135 }),
    );
    expect(worldTouchupBase({ ...BASE_WORLD, roads: [] })).not.toBe(worldTouchupBase(BASE_WORLD));
    expect(
      worldTouchupBase({
        ...BASE_WORLD,
        npcs: Object.fromEntries(Object.entries(BASE_WORLD.npcs).reverse()),
      }),
    ).not.toBe(worldTouchupBase(BASE_WORLD));
  });

  it('rejects a stale touch-up revision and gives published edits a new local-save identity', () => {
    const map = liveWorldBaseline();
    map.terrainEdits.push({ x: 110, z: 280, radius: 5, delta: 3, falloff: 'flat', mode: 'add' });
    const { patch } = compileLiveWorldDocument(map);
    const next = publishedLiveWorldDocument(map, patch);
    expect(next.meta.overworldRevision).not.toBe(map.meta.overworldRevision);
    expect(next.meta.id).not.toBe(map.meta.id);
    expect(() => compileLiveWorldDocument(next)).toThrow(/revision changed/);
  });

  it('keeps provenance stable while a standalone Studio world has installed its content overlay', () => {
    const map = liveWorldBaseline();
    setActiveWorldContent({ ...BASE_WORLD, placements: [] });
    expect(studioContentActive()).toBe(true);
    expect(liveWorldBaseline()).toEqual(map);
    expect(compileLiveWorldDocument(map).patch.changes).toEqual({});
  });

  it('runs the real Node compiler and writes a source plus shared runtime artifact', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'woc-touchup-test-'));
    try {
      const map = liveWorldBaseline();
      map.terrainEdits.push({ x: 110, z: 280, radius: 5, delta: 3, falloff: 'flat', mode: 'add' });
      const file = path.join(dir, 'edit.json');
      writeFileSync(file, serializeMap(map));
      const output = execFileSync(
        process.execPath,
        ['scripts/world_touchup.mjs', 'export', file, '--out-dir', dir],
        { encoding: 'utf8' },
      );
      expect(output).toContain('terrainEdits');
      const source = JSON.parse(
        readFileSync(path.join(dir, 'data/world_touchup/current.map.json'), 'utf8'),
      );
      expect(source.terrainEdits.at(-1).delta).toBe(3);
      expect(source.meta.overworldRevision).not.toBe(map.meta.overworldRevision);
      expect(readFileSync(path.join(dir, 'src/sim/world_touchup.generated.ts'), 'utf8')).toContain(
        'WORLD_TOUCHUP: WorldTouchup',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects stale baselines, unsupported content edits and missing assets', () => {
    const changedZone = liveWorldBaseline();
    const cleanZone = liveWorldBaseline();
    expect(changedZone.content.zones[0]).not.toBe(cleanZone.content.zones[0]);
    changedZone.content.zones[0].hub.x += 10;
    expect(liveWorldBaseline()).toEqual(cleanZone);
    expect(() => compileLiveWorldDocument(changedZone)).toThrow(/Unsupported.*content/);
    const map = liveWorldBaseline();
    map.meta.overworldBase = 'bad-0-0';
    expect(() => compileLiveWorldDocument(map)).toThrow(/baseline/);
    map.meta.overworldBase = worldTouchupBase(BASE_WORLD);
    map.content.camps.pop();
    expect(() => compileLiveWorldDocument(map)).toThrow(/Unsupported.*content/);
    const unknown = liveWorldBaseline();
    unknown.placements.push({
      assetId: 'does-not-exist',
      collide: false,
      x: 0,
      z: 0,
      rotY: 0,
      scale: 1,
    });
    expect(() => compileLiveWorldDocument(unknown)).toThrow(/cannot be resolved/);
    expect(() =>
      applyWorldTouchup(
        { ...BASE_WORLD, roads: [] },
        {
          version: 1,
          base: worldTouchupBase(BASE_WORLD),
          changes: {},
        },
      ),
    ).toThrow(/baseline changed/);
    expect(applyWorldTouchup(BASE_WORLD, { version: 1, base: null, changes: {} })).toBe(BASE_WORLD);
  });
});
