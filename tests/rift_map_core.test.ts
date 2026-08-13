import { describe, expect, it } from 'vitest';
import type { DungeonLayout } from '../src/sim/dungeon_layout';
import type { RiftFloorPlan } from '../src/sim/rift/types';
import {
  buildRiftStaticGeometry,
  createRiftMapView,
  riftFloorMapKey,
  riftLayoutBounds,
  riftLocalToCanvas,
  riftMapTransform,
} from '../src/ui/hud/rift/rift_map_core';
import { mapWindowMode } from '../src/ui/map_window_view';
import { minimapMode } from '../src/ui/minimap_markers';
import type { IWorld, RiftFloorView } from '../src/world_api';
import type { RiftBossDeathZoneView } from '../src/world_api/dungeons';

const RECT_LAYOUT: DungeonLayout = {
  zMin: -20,
  zMax: 80,
  sideWallZ: 30,
  sideWallHd: 50,
  wallX: 25,
  floorHalfX: 24,
  pillars: [{ x: -10, z: 20 }],
  tombs: [{ x: 18, z: 40 }],
  stubs: [{ x: 12, z: 5, hw: 3, hd: 1 }],
  illusionWalls: [{ x: -16, z: 30, hw: 2, hd: 1 }],
  dais: { x: 0, z: 66, r: 8 },
};

function floorWith(layout: DungeonLayout, overrides: Partial<RiftFloorPlan> = {}): RiftFloorPlan {
  return {
    seed: 91,
    baseLevel: 20,
    floorIndex: 1,
    floorCount: 4,
    isBoss: false,
    name: 'The Test Rift: Depth 2',
    themeName: 'Test',
    layout,
    style: {
      kit: 'crypt',
      torch: { flame: 0, emissive: 0, light: 0 },
      fog: { color: 0, near: 0, far: 1 },
    },
    entry: { x: 0, z: -12 },
    spawns: [],
    objects: [],
    puzzle: { kind: 'none', pylonCount: 0 },
    hazards: [],
    iceZone: null,
    rollers: [],
    platform: null,
    gate: null,
    ...overrides,
  };
}

const VIEW: RiftFloorView = {
  eventId: null,
  instanceId: 11,
  seed: 91,
  baseLevel: 20,
  floorIndex: 1,
  floorCount: 4,
  origin: { x: 4000, z: -1200 },
  contentId: 'test-rift',
  contentHash: 'hash-a',
  upgrade: null,
  name: 'The Test Rift: Depth 2',
  themeName: 'Test',
  tier: 'B',
};

function worldWith(
  entities: readonly Record<string, unknown>[] = [],
  view: RiftFloorView | null = VIEW,
  deathZones: RiftBossDeathZoneView[] = [],
): IWorld {
  const player = {
    id: 1,
    kind: 'player',
    pos: { x: VIEW.origin.x, y: 0, z: VIEW.origin.z },
    facing: 0.75,
    ghost: false,
    corpsePos: null,
  };
  return {
    player,
    entities: new Map<number, unknown>([
      [player.id, player],
      ...entities.map((entity) => [entity.id as number, entity] as const),
    ]),
    partyInfo: null,
    companionState: null,
    riftFloor: view,
    riftBossDeathZones: () => deathZones,
  } as unknown as IWorld;
}

describe('rift map geometry', () => {
  it('fits rectangle, polygon, and authored room bounds with one aspect-preserving scale', () => {
    expect(riftLayoutBounds(RECT_LAYOUT)).toEqual({ minX: -25, maxX: 25, minZ: -20, maxZ: 80 });

    const polygon = {
      ...RECT_LAYOUT,
      shellPolygon: [
        { x: -8, z: -4 },
        { x: 13, z: -2 },
        { x: 6, z: 30 },
        { x: -11, z: 22 },
      ],
    };
    expect(riftLayoutBounds(polygon)).toEqual({ minX: -11, maxX: 13, minZ: -4, maxZ: 30 });

    const authored = {
      ...RECT_LAYOUT,
      rooms: [
        { id: 'south', x0: -10, x1: 10, z0: -30, z1: 0 },
        { id: 'north', x0: -18, x1: 14, z0: 0, z1: 45 },
      ],
      doors: [],
    };
    const bounds = riftLayoutBounds(authored);
    expect(bounds).toEqual({ minX: -18, maxX: 14, minZ: -30, maxZ: 45 });
    const transform = riftMapTransform(bounds, 300, 20);
    expect(transform.scale).toBeCloseTo(260 / 75, 8);
  });

  it('uses the established compass projection: +X is map-left and +Z is map-up', () => {
    const transform = riftMapTransform(riftLayoutBounds(RECT_LAYOUT), 300, 20);
    const origin = riftLocalToCanvas(0, 0, transform);
    const east = riftLocalToCanvas(5, 0, transform);
    const north = riftLocalToCanvas(0, 5, transform);
    expect(east.cx).toBeLessThan(origin.cx);
    expect(north.cy).toBeLessThan(origin.cy);
    expect(Math.abs(east.cx - origin.cx)).toBeCloseTo(Math.abs(north.cy - origin.cy), 8);
  });

  it('fits every accessible corner and its largest compact marker inside the minimap disc', () => {
    const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    const size = 162;
    const clipRadius = size / 2 - 2;
    const markerHalf = 12;
    const pad = 2 + Math.ceil(markerHalf * Math.SQRT2);
    const rectangular = riftMapTransform(bounds, size, pad);
    const circular = riftMapTransform(bounds, size, pad, 'circle');
    const corners = [
      [bounds.minX, bounds.minZ],
      [bounds.minX, bounds.maxZ],
      [bounds.maxX, bounds.minZ],
      [bounds.maxX, bounds.maxZ],
    ] as const;

    expect(rectangular.fit).toBe('rect');
    expect(circular.fit).toBe('circle');
    expect(circular.scale).toBeLessThan(rectangular.scale);
    for (const [x, z] of corners) {
      const center = riftLocalToCanvas(x, z, circular);
      for (const dx of [-markerHalf, markerHalf]) {
        for (const dy of [-markerHalf, markerHalf]) {
          expect(
            Math.hypot(center.cx + dx - size / 2, center.cy + dy - size / 2),
          ).toBeLessThanOrEqual(clipRadius);
        }
      }
    }

    // The M-map's default remains the denser rectangular fit and reaches its
    // requested backing-space pad on the limiting axes.
    const rectangularCorner = riftLocalToCanvas(bounds.maxX, bounds.maxZ, rectangular);
    expect(rectangularCorner).toEqual({ cx: pad, cy: pad });
  });

  it('derives authored walls from the shared doorway-subtracted segments', () => {
    const layout: DungeonLayout = {
      ...RECT_LAYOUT,
      rooms: [
        { id: 'south', x0: -10, x1: 10, z0: -10, z1: 0 },
        { id: 'north', x0: -10, x1: 10, z0: 0, z1: 10 },
      ],
      doors: [{ x: 0, z: 0, hw: 2, hd: 1 }],
    };
    const transform = riftMapTransform(riftLayoutBounds(layout), 240, 16);
    const geometry = buildRiftStaticGeometry(floorWith(layout), transform);
    const doorway = riftLocalToCanvas(0, 0, transform);
    const sharedWallRuns = geometry.structures.filter(
      (primitive) =>
        primitive.kind === 'line' &&
        primitive.role === 'wall' &&
        primitive.y1 === doorway.cy &&
        primitive.y2 === doorway.cy,
    );
    expect(sharedWallRuns).toHaveLength(2);
    expect(
      sharedWallRuns.some(
        (line) =>
          line.kind === 'line' &&
          Math.min(line.x1, line.x2) < doorway.cx &&
          Math.max(line.x1, line.x2) > doorway.cx,
      ),
    ).toBe(false);
  });

  it('projects the complete polygon shell and closes it with one wall per edge', () => {
    const shellPolygon = [
      { x: -8, z: -4 },
      { x: 13, z: -2 },
      { x: 6, z: 30 },
      { x: -11, z: 22 },
    ];
    const layout: DungeonLayout = { ...RECT_LAYOUT, shellPolygon };
    const transform = riftMapTransform(riftLayoutBounds(layout), 240, 20, 'circle');
    const geometry = buildRiftStaticGeometry(floorWith(layout), transform);
    const expectedPoints = shellPolygon.map(({ x, z }) => riftLocalToCanvas(x, z, transform));

    expect(geometry.walkable).toEqual([{ kind: 'polygon', role: 'floor', points: expectedPoints }]);
    expect(
      geometry.structures.filter(
        (primitive) => primitive.kind === 'line' && primitive.role === 'wall',
      ),
    ).toEqual(
      expectedPoints.map((point, index) => {
        const next = expectedPoints[(index + 1) % expectedPoints.length];
        return {
          kind: 'line',
          role: 'wall',
          x1: point.cx,
          y1: point.cy,
          x2: next.cx,
          y2: next.cy,
        };
      }),
    );
    for (const point of expectedPoints) {
      expect(Math.hypot(point.cx - 120, point.cy - 120)).toBeLessThanOrEqual(100);
    }
  });

  it.each([
    {
      label: 'south-to-north',
      rooms: [
        { id: 'south', x0: -10, x1: 10, z0: -10, z1: 0, lift: 0 },
        { id: 'north', x0: -10, x1: 10, z0: 0, z1: 10, lift: 4 },
      ],
      door: { x: 0, z: 0, hw: 2, hd: 1 },
      expected: { kind: 'rect', role: 'lift-ramp', x: 100, y: 60, w: 40, h: 120 },
    },
    {
      label: 'west-to-east',
      rooms: [
        { id: 'west', x0: -10, x1: 0, z0: -10, z1: 10, lift: 0 },
        { id: 'east', x0: 0, x1: 10, z0: -10, z1: 10, lift: 2 },
      ],
      door: { x: 0, z: 0, hw: 1, hd: 2 },
      expected: { kind: 'rect', role: 'lift-ramp', x: 90, y: 100, w: 60, h: 40 },
    },
  ] as const)(
    'maps a $label lift transition to its exact ramp band',
    ({ rooms, door, expected }) => {
      const layout: DungeonLayout = { ...RECT_LAYOUT, rooms: [...rooms], doors: [door] };
      const transform = riftMapTransform(riftLayoutBounds(layout), 240, 20);
      const geometry = buildRiftStaticGeometry(floorWith(layout), transform);
      expect(geometry.clipped.filter((primitive) => primitive.role === 'lift-ramp')).toEqual([
        expected,
      ]);
      expect(geometry.clipped.filter((primitive) => primitive.role === 'raised-room')).toHaveLength(
        1,
      );
    },
  );

  it.each([
    {
      label: 'south-to-north',
      rooms: [
        { id: 'south', x0: -10, x1: 10, z0: -10, z1: 0, lift: 0 },
        { id: 'north', x0: -10, x1: 10, z0: 0, z1: 10, lift: 0 },
      ],
      door: { x: 0, z: 0, hw: 2, hd: 1 },
    },
    {
      label: 'west-to-east',
      rooms: [
        { id: 'west', x0: -10, x1: 0, z0: -10, z1: 10, lift: 0 },
        { id: 'east', x0: 0, x1: 10, z0: -10, z1: 10, lift: 0 },
      ],
      door: { x: 0, z: 0, hw: 1, hd: 2 },
    },
  ] as const)('does not invent a $label ramp between equal-lift rooms', ({ rooms, door }) => {
    const layout: DungeonLayout = { ...RECT_LAYOUT, rooms: [...rooms], doors: [door] };
    const transform = riftMapTransform(riftLayoutBounds(layout), 240, 20);
    const geometry = buildRiftStaticGeometry(floorWith(layout), transform);

    expect(geometry.clipped.filter((primitive) => primitive.role === 'lift-ramp')).toEqual([]);
    expect(geometry.clipped.filter((primitive) => primitive.role === 'raised-room')).toEqual([]);
  });

  it('clips hazards, ice, platform bands, and roller lanes to the walkable outline', () => {
    const floor = floorWith(RECT_LAYOUT, {
      hazards: [{ x: 20, z: 35, r: 8, rx: 10, rz: 5 }],
      iceZone: { x: 0, z: 25, hw: 18, hd: 20 },
      platform: { rampZ0: 45, rampZ1: 55, height: 1.2 },
      rollers: [{ x: -8, z0: 5, z1: 55, r: 2, speed: 4, phase: 0 }],
    });
    const transform = riftMapTransform(riftLayoutBounds(floor.layout), 240, 16);
    const geometry = buildRiftStaticGeometry(floor, transform);
    expect(geometry.walkable).toHaveLength(1);
    expect(geometry.clipped.map((primitive) => primitive.role)).toEqual(
      expect.arrayContaining(['dais', 'hazard', 'ice', 'platform', 'platform-ramp', 'roller-lane']),
    );
    expect(geometry.structures.some((primitive) => primitive.role === 'dais')).toBe(false);
  });
});

describe('rift map live model', () => {
  it('routes an active Rift descriptor ahead of coordinate-band fallbacks', () => {
    const world = worldWith();
    expect(minimapMode(world)).toBe('rift');
    expect(mapWindowMode(world)).toBe('rift');
    expect(minimapMode(worldWith([], null))).not.toBe('rift');
    expect(mapWindowMode(worldWith([], null))).not.toBe('rift');
  });

  it('keys immutable backgrounds by descriptor plus content identity, never live state', () => {
    expect(riftFloorMapKey(VIEW)).toBe('rift-map-v1:91:20:1:hash-a');
    expect(riftFloorMapKey({ ...VIEW, contentHash: 'hash-b' })).not.toBe(riftFloorMapKey(VIEW));
    expect(riftFloorMapKey({ ...VIEW, instanceId: 999 })).toBe(riftFloorMapKey(VIEW));
  });

  it('shows only mirrored live entities and never leaks the generated spawn plan', () => {
    const view = createRiftMapView();
    const empty = view.build(worldWith(), 162, 8, 'The Test Rift — Rank B');
    expect(empty).not.toBeNull();
    expect(empty?.mobs).toEqual([]);
    expect(empty?.objects).toEqual([]);

    const live = view.build(
      worldWith([
        {
          id: 2,
          kind: 'mob',
          templateId: 'rift_mob',
          hostile: true,
          dead: false,
          lootable: false,
          aggroTargetId: 1,
          pos: { x: VIEW.origin.x + 2, y: 0, z: VIEW.origin.z + 2 },
        },
        {
          id: 3,
          kind: 'object',
          templateId: 'rift_gate_open',
          dead: false,
          lootable: false,
          pos: { x: VIEW.origin.x - 2, y: 0, z: VIEW.origin.z + 3 },
        },
      ]),
      162,
      8,
      'The Test Rift — Rank B',
    );
    expect(live?.mobs).toHaveLength(1);
    expect(live?.mobs[0].aggro).toBe(true);
    expect(live?.objects).toEqual([
      expect.objectContaining({
        semantic: { kind: 'rift-mechanic', mechanic: 'gate', state: 'open' },
      }),
    ]);
  });

  it('matches an interest-pruned mirror and hides distant enemy, mechanic, reward, and route state', () => {
    const mob = (id: number, localZ: number) => ({
      id,
      kind: 'mob',
      templateId: 'rift_mob',
      hostile: true,
      dead: false,
      lootable: false,
      aggroTargetId: null,
      pos: { x: VIEW.origin.x, y: 0, z: VIEW.origin.z + localZ },
    });
    const object = (id: number, templateId: string, localZ: number) => ({
      id,
      kind: 'object',
      templateId,
      dead: false,
      lootable: false,
      pos: { x: VIEW.origin.x, y: 0, z: VIEW.origin.z + localZ },
    });
    const disclosed = [
      mob(2, 2),
      object(3, 'rift_gate_open', 3),
      object(4, 'rift_treasure', 4),
      object(5, 'rift_descent', 5),
    ];
    const offInterest = [
      mob(6, 81),
      object(7, 'rift_gate_open', 82),
      object(8, 'rift_treasure', 83),
      object(9, 'rift_descent', 84),
    ];

    const fromCompleteSimRoster = createRiftMapView().build(
      worldWith([...disclosed, ...offInterest]),
      280,
      16,
      'The Test Rift - Rank B',
    );
    const fromInterestPrunedClient = createRiftMapView().build(
      worldWith(disclosed),
      280,
      16,
      'The Test Rift - Rank B',
    );

    expect(fromCompleteSimRoster).not.toBeNull();
    expect(fromCompleteSimRoster).toEqual(fromInterestPrunedClient);
    expect(fromCompleteSimRoster?.mobs).toHaveLength(1);
    expect(fromCompleteSimRoster?.objects.map((marker) => marker.semantic.kind)).toEqual([
      'rift-mechanic',
      'rift-reward',
      'rift-descent',
    ]);
  });

  it('matches an interest-pruned mirror for death zones at the inclusive 80-yard boundary', () => {
    const zone = (localZ: number): RiftBossDeathZoneView => ({
      x: VIEW.origin.x,
      z: VIEW.origin.z + localZ,
      radius: 7,
      remaining: 2.5,
      total: 4,
    });
    const disclosed = [zone(12), zone(80)];
    const completeSimZones = [...disclosed, zone(80.001)];

    const fromCompleteSimRoster = createRiftMapView().build(
      worldWith([], VIEW, completeSimZones),
      280,
      16,
      'The Test Rift - Rank B',
    );
    const fromInterestPrunedClient = createRiftMapView().build(
      worldWith([], VIEW, disclosed),
      280,
      16,
      'The Test Rift - Rank B',
    );

    expect(fromCompleteSimRoster).not.toBeNull();
    expect(fromCompleteSimRoster).toEqual(fromInterestPrunedClient);
    expect(fromCompleteSimRoster?.deathZones).toHaveLength(2);
    expect(fromCompleteSimRoster?.deathZones[1]).toEqual(
      expect.objectContaining({ radius: expect.any(Number), remaining: 2.5, total: 4 }),
    );
  });

  it('omits friendly summons and their loot state from hostile rift markers', () => {
    const model = createRiftMapView().build(
      worldWith([
        {
          id: 2,
          kind: 'mob',
          hostile: false,
          ownerId: 1,
          dead: false,
          lootable: false,
          pos: { x: VIEW.origin.x + 2, y: 0, z: VIEW.origin.z + 2 },
        },
        {
          id: 3,
          kind: 'mob',
          hostile: false,
          ownerId: 1,
          dead: true,
          lootable: true,
          pos: { x: VIEW.origin.x + 3, y: 0, z: VIEW.origin.z + 2 },
        },
      ]),
      162,
      8,
      'The Test Rift - Rank B',
    );
    expect(model?.mobs).toEqual([]);
  });

  it('keeps navigation above rewards and mechanics without sorting live entities', () => {
    const model = createRiftMapView().build(
      worldWith([
        {
          id: 2,
          kind: 'object',
          templateId: 'rift_descent',
          pos: { x: VIEW.origin.x, y: 0, z: VIEW.origin.z + 4 },
        },
        {
          id: 3,
          kind: 'object',
          templateId: 'rift_treasure',
          pos: { x: VIEW.origin.x, y: 0, z: VIEW.origin.z + 3 },
        },
        {
          id: 4,
          kind: 'object',
          templateId: 'rift_pylon',
          pos: { x: VIEW.origin.x, y: 0, z: VIEW.origin.z + 2 },
        },
      ]),
      162,
      8,
      'The Test Rift — Rank B',
    );
    expect(model?.objects.map((marker) => marker.semantic.kind)).toEqual([
      'rift-mechanic',
      'rift-reward',
      'rift-descent',
    ]);
  });

  it('reuses its model and array containers, clears stale state, and changes static geometry by key', () => {
    const view = createRiftMapView();
    const a = view.build(worldWith(), 162, 8, 'A');
    const mobs = a?.mobs;
    const objects = a?.objects;
    const b = view.build(worldWith(), 162, 8, 'B');
    expect(b).toBe(a);
    expect(b?.mobs).toBe(mobs);
    expect(b?.objects).toBe(objects);
    expect(view.build(worldWith([], null), 162, 8, '')).toBeNull();
    const c = view.build(worldWith(), 162, 8, 'C');
    expect(c?.mobs).toEqual([]);
    expect(c?.objects).toEqual([]);
    const priorStatic = c?.staticGeometry;
    const changed = view.build(worldWith([], { ...VIEW, contentHash: 'hash-new' }), 162, 8, 'C');
    expect(changed?.staticGeometry).not.toBe(priorStatic);
  });
});
