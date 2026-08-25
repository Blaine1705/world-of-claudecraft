// Ignivar raid interior map pure core: the M-map and minimap both project the
// authoritative DungeonLayout for the player's current raid room. These tests
// pin the four room plans, instance-slot neutrality, marker projection, and the
// shared mode guards used by both HUD surfaces.
import { describe, expect, it } from 'vitest';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  IGNIVAR_FORGE_APPROACH_LAYOUT,
  IGNIVAR_LAYOUT,
  IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT,
  IGNIVAR_SECOND_WING_LAYOUT,
} from '../src/sim/dungeon_layout';
import {
  IGNIVAR_EMBER_SENTINEL_ID,
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_GATE_LOCKED_TEMPLATE,
  IGNIVAR_MOLTEN_ASSEMBLY_ID,
  IGNIVAR_RAID_ARENA_ID,
  IGNIVAR_RAID_ROOM_IDS,
  IGNIVAR_SECOND_WING_ID,
  VARKHUL_BOSS_ID,
} from '../src/sim/ignivar_raid_ids';
import {
  buildDungeonMinimapModel,
  buildDungeonMinimapPaintModel,
  buildDungeonWorldMapModel,
  DungeonMapViewCore,
  dungeonMapActive,
  dungeonMapLocal,
} from '../src/ui/dungeon_map_view';
import { mapWindowMode } from '../src/ui/map_window_view';
import { minimapMode } from '../src/ui/minimap_markers';
import type { IWorld } from '../src/world_api';
import { assertAllocationStable } from './util/alloc_probe';

const SLOT = 3;

interface MarkerEntityInput {
  id: number;
  kind: 'mob' | 'npc' | 'object';
  templateId: string;
  lx: number;
  lz: number;
  hostile?: boolean;
  dead?: boolean;
  lootable?: boolean;
  aggroTargetId?: number | null;
}

function worldIn(
  dungeonId: string,
  lx = 0,
  lz = 0,
  slot = SLOT,
  entityInputs: readonly MarkerEntityInput[] = [],
  shape: 'sim' | 'client' = 'client',
): IWorld {
  const origin = instanceOrigin(DUNGEONS[dungeonId].index, slot);
  const player = {
    id: 1,
    kind: 'player',
    templateId: 'warrior',
    name: 'Tester',
    pos: { x: origin.x + lx, y: 0, z: origin.z + lz },
    facing: Math.PI / 4,
  };
  const entities = new Map<number, unknown>([[player.id, player]]);
  for (const input of entityInputs) {
    entities.set(input.id, {
      id: input.id,
      kind: input.kind,
      templateId: input.templateId,
      name: input.templateId,
      pos: { x: origin.x + input.lx, y: 0, z: origin.z + input.lz },
      hostile: input.hostile ?? false,
      dead: input.dead ?? false,
      lootable: input.lootable ?? false,
      aggroTargetId: input.aggroTargetId ?? null,
      ...(shape === 'sim' ? { hp: 100, maxHp: 100, castingAbility: null } : {}),
    });
  }
  return {
    player,
    entities,
    partyInfo: null,
    riftFloor: null,
    delveRun: null,
  } as unknown as IWorld;
}

describe('dungeon map activation', () => {
  it('routes all four Ignivar raid rooms to the dungeon surface on M and the minimap', () => {
    for (const dungeonId of IGNIVAR_RAID_ROOM_IDS) {
      const world = worldIn(dungeonId);
      expect(dungeonMapActive(world)).toBe(true);
      expect(mapWindowMode(world)).toBe('dungeon');
      expect(minimapMode(world)).toBe('dungeon');
    }

    const outside = worldIn('hollow_crypt');
    expect(dungeonMapActive(outside)).toBe(false);
    expect(mapWindowMode(outside)).toBe('overworld');
    expect(minimapMode(outside)).toBe('overworld');
  });

  it('derives instance-local coordinates and slot origin from position only', () => {
    const dungeon = DUNGEONS[IGNIVAR_FORGE_APPROACH_ID];
    const origin = instanceOrigin(dungeon.index, SLOT);
    expect(dungeonMapLocal(origin.x + 7, origin.z - 11)).toMatchObject({
      dungeonId: IGNIVAR_FORGE_APPROACH_ID,
      originX: origin.x,
      originZ: origin.z,
      lx: 7,
      lz: -11,
    });
    expect(dungeonMapLocal(0, 0)).toBeNull();
  });
});

describe('authoritative raid plan geometry', () => {
  it.each([
    [IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_FORGE_APPROACH_LAYOUT, 5, 20, 5, 27],
    [IGNIVAR_RAID_ARENA_ID, IGNIVAR_LAYOUT, 1, 8, 0, 0],
    [IGNIVAR_MOLTEN_ASSEMBLY_ID, IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT, 6, 20, 7, 29],
    [IGNIVAR_SECOND_WING_ID, IGNIVAR_SECOND_WING_LAYOUT, 1, 12, 0, 0],
  ] as const)(
    '%s maps every floor, wall, doorway, and physical decor footprint',
    (dungeonId, layout, floorCount, wallCount, doorCount, obstacleCount) => {
      const model = buildDungeonWorldMapModel(worldIn(dungeonId), 560, 34);
      expect(model).not.toBeNull();
      if (!model) return;
      expect(model.dungeonId).toBe(dungeonId);
      expect(model.floors).toHaveLength(floorCount);
      expect(model.walls).toHaveLength(wallCount);
      expect(model.doors).toHaveLength(doorCount);
      expect(model.obstacles).toHaveLength(obstacleCount);
      expect(model.dais).not.toBeNull();

      // The model is built from this exact live layout, not a hand-copied map.
      expect(model.sourceLayout).toBe(layout);
      for (const floor of model.floors) {
        for (const point of floor.points) {
          expect(point.cx).toBeGreaterThanOrEqual(34);
          expect(point.cx).toBeLessThanOrEqual(560 - 34);
          expect(point.cy).toBeGreaterThanOrEqual(34);
          expect(point.cy).toBeLessThanOrEqual(560 - 34);
        }
      }
    },
  );

  it('pins the Approach projection direction, scale, openings, footprints, and dais', () => {
    const model = buildDungeonWorldMapModel(worldIn(IGNIVAR_FORGE_APPROACH_ID), 560, 34);
    expect(model).not.toBeNull();
    if (!model) return;

    expect(model.bounds).toEqual({ minX: -63, maxX: 63, minZ: -69, maxZ: 79 });
    expect(model.walls[0]).toEqual({
      a: { cx: expect.closeTo(333.189189, 5), cy: expect.closeTo(516.027027, 5) },
      b: { cx: expect.closeTo(226.810811, 5), cy: expect.closeTo(516.027027, 5) },
      width: expect.closeTo(6.648649, 5),
    });
    expect(model.walls.at(-1)).toEqual({
      a: { cx: expect.closeTo(80.540541, 5), cy: expect.closeTo(336.513514, 5) },
      b: { cx: expect.closeTo(80.540541, 5), cy: expect.closeTo(176.945946, 5) },
      width: expect.closeTo(6.648649, 5),
    });
    expect(model.doors[0].points).toEqual([
      { cx: expect.closeTo(296.621622, 5), cy: expect.closeTo(439.567568, 5) },
      { cx: expect.closeTo(263.378378, 5), cy: expect.closeTo(439.567568, 5) },
      { cx: expect.closeTo(263.378378, 5), cy: expect.closeTo(432.918919, 5) },
      { cx: expect.closeTo(296.621622, 5), cy: expect.closeTo(432.918919, 5) },
    ]);
    expect(model.doors.at(-1)?.points).toEqual([
      { cx: expect.closeTo(163.648649, 5), cy: expect.closeTo(180.27027, 5) },
      { cx: expect.closeTo(130.405405, 5), cy: expect.closeTo(180.27027, 5) },
      { cx: expect.closeTo(130.405405, 5), cy: expect.closeTo(173.621622, 5) },
      { cx: expect.closeTo(163.648649, 5), cy: expect.closeTo(173.621622, 5) },
    ]);
    expect(model.obstacles[0]).toEqual({
      cx: 280,
      cy: expect.closeTo(323.216216, 5),
      r: expect.closeTo(7.778919, 5),
    });
    expect(model.obstacles.at(-1)).toEqual({
      cx: expect.closeTo(153.675676, 5),
      cy: expect.closeTo(80.540541, 5),
      r: expect.closeTo(4.155405, 5),
    });
    expect(model.dais).toEqual({
      cx: 280,
      cy: expect.closeTo(100.486486, 5),
      r: expect.closeTo(26.594595, 5),
    });
    expect(model.markers.at(-1)).toEqual({
      kind: 'player',
      cx: 280,
      cy: expect.closeTo(296.621622, 5),
      angle: -Math.PI / 4,
    });
  });

  it.each([
    [
      IGNIVAR_RAID_ARENA_ID,
      { minX: -36, maxX: 36, minZ: -36, maxZ: 36 },
      [
        [375.666667, 505.5],
        [184.333333, 505.5],
        [54.5, 375.666667],
        [54.5, 184.333333],
        [184.333333, 54.5],
        [375.666667, 54.5],
        [505.5, 184.333333],
        [505.5, 375.666667],
      ],
      13.666667,
      54.666667,
    ],
    [
      IGNIVAR_SECOND_WING_ID,
      { minX: -43, maxX: 43, minZ: -43, maxZ: 43 },
      [
        [371.534884, 508.837209],
        [188.465116, 508.837209],
        [96.930233, 463.069767],
        [51.162791, 371.534884],
        [51.162791, 188.465116],
        [96.930233, 96.930233],
        [188.465116, 51.162791],
        [371.534884, 51.162791],
        [463.069767, 96.930233],
        [508.837209, 188.465116],
        [508.837209, 371.534884],
        [463.069767, 463.069767],
      ],
      11.44186,
      57.209302,
    ],
  ] as const)(
    '%s pins every polygon-shell floor vertex, wall segment, width, and dais',
    (dungeonId, bounds, expectedPoints, expectedWidth, expectedDaisRadius) => {
      const model = buildDungeonWorldMapModel(worldIn(dungeonId), 560, 34);
      expect(model).not.toBeNull();
      if (!model) return;

      expect(model.bounds).toEqual(bounds);
      expect(model.floors[0].points).toHaveLength(expectedPoints.length);
      expect(model.walls).toHaveLength(expectedPoints.length);
      for (let index = 0; index < expectedPoints.length; index++) {
        const [cx, cy] = expectedPoints[index];
        const [nextCx, nextCy] = expectedPoints[(index + 1) % expectedPoints.length];
        expect(model.floors[0].points[index].cx).toBeCloseTo(cx, 5);
        expect(model.floors[0].points[index].cy).toBeCloseTo(cy, 5);
        expect(model.walls[index].a.cx).toBeCloseTo(cx, 5);
        expect(model.walls[index].a.cy).toBeCloseTo(cy, 5);
        expect(model.walls[index].b.cx).toBeCloseTo(nextCx, 5);
        expect(model.walls[index].b.cy).toBeCloseTo(nextCy, 5);
        expect(model.walls[index].width).toBeCloseTo(expectedWidth, 5);
      }
      expect(model.dais?.cx).toBe(280);
      expect(model.dais?.cy).toBe(280);
      expect(model.dais?.r).toBeCloseTo(expectedDaisRadius, 5);
    },
  );
});

describe('dungeon minimap projection', () => {
  it('centers the player, keeps +X map-left, and paints live raid markers', () => {
    const world = worldIn(IGNIVAR_FORGE_APPROACH_ID, 0, 0, SLOT, [
      {
        id: 2,
        kind: 'mob',
        templateId: IGNIVAR_EMBER_SENTINEL_ID,
        lx: 5,
        lz: 0,
        hostile: true,
        aggroTargetId: 1,
      },
      {
        id: 3,
        kind: 'object',
        templateId: IGNIVAR_GATE_LOCKED_TEMPLATE,
        lx: 0,
        lz: 15,
      },
      { id: 4, kind: 'npc', templateId: 'ignivar_maelin', lx: -5, lz: 0 },
    ]);
    const model = buildDungeonMinimapModel(world, 162, 2);
    expect(model).not.toBeNull();
    if (!model) return;

    const mob = model.markers.find((marker) => marker.kind === 'mob');
    expect(mob).toMatchObject({ kind: 'mob', cx: 71, cy: 81, aggro: true, boss: false });
    expect(model.markers.some((marker) => marker.kind === 'gate')).toBe(true);
    expect(model.markers.some((marker) => marker.kind === 'npc')).toBe(true);

    const player = model.markers.at(-1);
    expect(player).toMatchObject({ kind: 'player', cx: 81, cy: 81 });
    if (player?.kind === 'player') expect(player.angle).toBeCloseTo(-Math.PI / 4, 6);
  });

  it('is invariant across instance slots and both IWorld host shapes', () => {
    const entities: MarkerEntityInput[] = [
      {
        id: 2,
        kind: 'mob',
        templateId: IGNIVAR_EMBER_SENTINEL_ID,
        lx: -4,
        lz: 6,
        hostile: true,
      },
    ];
    const expected = buildDungeonMinimapModel(
      worldIn(IGNIVAR_MOLTEN_ASSEMBLY_ID, 3, -7, 1, entities, 'sim'),
      162,
      1.7,
    );
    expect(
      buildDungeonMinimapModel(
        worldIn(IGNIVAR_MOLTEN_ASSEMBLY_ID, 3, -7, 17, entities, 'client'),
        162,
        1.7,
      ),
    ).toEqual(expected);
  });

  it('reuses projected static geometry while only plate offset and markers move', () => {
    const first = buildDungeonMinimapPaintModel(worldIn(IGNIVAR_FORGE_APPROACH_ID, 0, 0), 162, 1.7);
    const moved = buildDungeonMinimapPaintModel(
      worldIn(IGNIVAR_FORGE_APPROACH_ID, 5, -3),
      162,
      1.7,
    );
    expect(first).not.toBeNull();
    expect(moved).not.toBeNull();
    if (!first || !moved) return;
    expect(moved.staticGeometry).toBe(first.staticGeometry);
    expect(moved.staticGeometry.floors).toBe(first.staticGeometry.floors);
    expect(moved.staticGeometry.walls).toBe(first.staticGeometry.walls);
    expect(moved.plateX).not.toBe(first.plateX);
    expect(moved.plateY).not.toBe(first.plateY);

    const worldFirst = buildDungeonWorldMapModel(worldIn(IGNIVAR_FORGE_APPROACH_ID), 560, 34);
    const worldMoved = buildDungeonWorldMapModel(
      worldIn(IGNIVAR_FORGE_APPROACH_ID, 5, -3),
      560,
      34,
    );
    expect(worldMoved?.floors).toBe(worldFirst?.floors);
    expect(worldMoved?.walls).toBe(worldFirst?.walls);
    expect(worldMoved?.staticGeometry).toBe(worldFirst?.staticGeometry);
    expect(worldMoved?.markers).not.toBe(worldFirst?.markers);
  });

  it('matches online interest scope instead of revealing distant offline-only actors', () => {
    const near: MarkerEntityInput = {
      id: 2,
      kind: 'mob',
      templateId: IGNIVAR_EMBER_SENTINEL_ID,
      lx: 0,
      lz: 20,
      hostile: true,
    };
    const beyondInterest: MarkerEntityInput = {
      id: 3,
      kind: 'mob',
      templateId: IGNIVAR_EMBER_SENTINEL_ID,
      lx: 0,
      lz: 55,
      hostile: true,
    };
    const offline = buildDungeonWorldMapModel(
      worldIn(IGNIVAR_FORGE_APPROACH_ID, 0, -58, SLOT, [near, beyondInterest], 'sim'),
      560,
      34,
    );
    const online = buildDungeonWorldMapModel(
      worldIn(IGNIVAR_FORGE_APPROACH_ID, 0, -58, SLOT, [near], 'client'),
      560,
      34,
    );
    expect(offline).toEqual(online);
    expect(offline?.markers.filter((marker) => marker.kind === 'mob')).toHaveLength(1);
  });

  it('uses the exact shared player/NPC interest boundaries in both host shapes', () => {
    const atMobBoundary: MarkerEntityInput = {
      id: 2,
      kind: 'mob',
      templateId: IGNIVAR_EMBER_SENTINEL_ID,
      lx: 0,
      lz: 32,
      hostile: true,
    };
    const beyondMobBoundary = { ...atMobBoundary, id: 3, lz: 32.01 };
    const atNpcBoundary: MarkerEntityInput = {
      id: 4,
      kind: 'npc',
      templateId: 'archivist_maelin_emberward',
      lx: 0,
      lz: 62,
    };
    const beyondNpcBoundary = { ...atNpcBoundary, id: 5, lz: 62.01 };
    const offline = buildDungeonWorldMapModel(
      worldIn(
        IGNIVAR_FORGE_APPROACH_ID,
        0,
        -58,
        SLOT,
        [atMobBoundary, beyondMobBoundary, atNpcBoundary, beyondNpcBoundary],
        'sim',
      ),
      560,
      34,
    );
    const online = buildDungeonWorldMapModel(
      worldIn(IGNIVAR_FORGE_APPROACH_ID, 0, -58, SLOT, [atMobBoundary, atNpcBoundary], 'client'),
      560,
      34,
    );
    expect(offline).toEqual(online);
    expect(offline?.markers.filter((marker) => marker.kind === 'mob')).toHaveLength(1);
    expect(offline?.markers.filter((marker) => marker.kind === 'npc')).toEqual([
      expect.objectContaining({ kind: 'npc', templateId: 'archivist_maelin_emberward' }),
    ]);
  });

  it('classifies every live marker branch and culls actors beyond the minimap rim', () => {
    const world = worldIn(IGNIVAR_FORGE_APPROACH_ID, 0, 0, SLOT, [
      {
        id: 2,
        kind: 'mob',
        templateId: IGNIVAR_EMBER_SENTINEL_ID,
        lx: 4,
        lz: 0,
        hostile: true,
      },
      {
        id: 3,
        kind: 'mob',
        templateId: VARKHUL_BOSS_ID,
        lx: -4,
        lz: 0,
        hostile: true,
        aggroTargetId: 1,
      },
      {
        id: 4,
        kind: 'mob',
        templateId: IGNIVAR_EMBER_SENTINEL_ID,
        lx: 0,
        lz: 5,
        hostile: true,
        dead: true,
        lootable: true,
      },
      { id: 5, kind: 'object', templateId: 'dungeon_exit', lx: 0, lz: -4 },
      { id: 6, kind: 'object', templateId: 'raid_cache', lx: 5, lz: 5, lootable: true },
      { id: 7, kind: 'npc', templateId: 'ignivar_maelin', lx: -5, lz: -5 },
      {
        id: 8,
        kind: 'mob',
        templateId: IGNIVAR_EMBER_SENTINEL_ID,
        lx: 100,
        lz: 0,
        hostile: true,
        aggroTargetId: 1,
      },
    ]);
    (world as unknown as { partyInfo: unknown }).partyInfo = {
      members: [
        { pid: 1, x: world.player.pos.x, z: world.player.pos.z, cls: 'warrior', dead: 0 },
        { pid: 20, x: world.player.pos.x + 2, z: world.player.pos.z + 2, cls: 'mage', dead: 0 },
        { pid: 21, x: world.player.pos.x - 2, z: world.player.pos.z - 2, cls: 'priest', dead: 1 },
        { pid: 22, x: world.player.pos.x + 100, z: world.player.pos.z, cls: 'rogue', dead: 0 },
      ],
    };

    const model = buildDungeonMinimapModel(world, 162, 2);
    expect(model).not.toBeNull();
    if (!model) return;
    expect(model.markers.filter((marker) => marker.kind === 'mob')).toEqual([
      {
        kind: 'mob',
        cx: 73,
        cy: 81,
        templateId: IGNIVAR_EMBER_SENTINEL_ID,
        aggro: false,
        boss: false,
      },
      {
        kind: 'mob',
        cx: 89,
        cy: 81,
        templateId: VARKHUL_BOSS_ID,
        aggro: true,
        boss: true,
      },
    ]);
    expect(model.markers.filter((marker) => marker.kind === 'loot')).toEqual([
      { kind: 'loot', cx: 81, cy: 71, source: 'enemy' },
      { kind: 'loot', cx: 71, cy: 71, source: 'object' },
    ]);
    expect(model.markers.filter((marker) => marker.kind === 'exit')).toHaveLength(1);
    expect(model.markers.filter((marker) => marker.kind === 'npc')).toEqual([
      { kind: 'npc', cx: 91, cy: 91, templateId: 'ignivar_maelin' },
    ]);
    expect(model.markers.filter((marker) => marker.kind === 'party')).toEqual([
      { kind: 'party', cx: 77, cy: 77, cls: 'mage', dead: false },
      { kind: 'party', cx: 85, cy: 85, cls: 'priest', dead: true },
    ]);
    expect(model.markers.some((marker) => marker.cx < 7 || marker.cx > 155)).toBe(false);
  });

  it('returns null outside the mapped raid rooms', () => {
    expect(buildDungeonMinimapModel(worldIn('hollow_crypt'), 162, 1.7)).toBeNull();
    expect(buildDungeonWorldMapModel(worldIn('hollow_crypt'), 560, 34)).toBeNull();
  });

  it('reuses hot-path models, marker containers, and marker slots', () => {
    const core = new DungeonMapViewCore();
    const world = worldIn(IGNIVAR_FORGE_APPROACH_ID, 0, 0, SLOT, [
      {
        id: 2,
        kind: 'mob',
        templateId: IGNIVAR_EMBER_SENTINEL_ID,
        lx: 4,
        lz: 0,
        hostile: true,
      },
    ]);
    core.minimap(world, 162, 1.7);
    core.worldMap(world, 560, 34);
    expect(() => {
      assertAllocationStable(() => core.minimap(world, 162, 1.7), 64, 'dungeon minimap model');
      assertAllocationStable(
        () => core.minimap(world, 162, 1.7)?.markers,
        64,
        'dungeon minimap markers',
      );
      assertAllocationStable(() => core.worldMap(world, 560, 34), 64, 'dungeon M-map model');
      assertAllocationStable(
        () => core.worldMap(world, 560, 34)?.markers,
        64,
        'dungeon M-map markers',
      );
    }).not.toThrow();
  });
});
