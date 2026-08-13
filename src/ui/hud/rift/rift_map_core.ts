// Pure geometry and live-marker model for the procedural Rift map surfaces.
//
// A RiftFloorView is the complete client-visible geometry descriptor: the same
// generateRiftFloor() seam already used by the renderer recreates the immutable
// floor plan without adding sim or wire state. Static primitives are rebuilt only
// when descriptor/content/size changes. Live overlays come exclusively from the
// mirrored IWorld roster; generated spawn/object plans are deliberately ignored so
// an online client never learns off-interest readiness or enemy positions.

import {
  DUNGEON_END_WALL_HW,
  DUNGEON_WALL_X,
  type DungeonLayout,
  PILLAR_COLLIDER_R,
  TOMB_HD,
  TOMB_HW,
} from '../../../sim/dungeon_layout';
import { authoredWallSegments, doorRampHalf } from '../../../sim/rift/authored';
import { generateRiftFloor } from '../../../sim/rift/rift_gen';
import type { RiftFloorPlan } from '../../../sim/rift/types';
import type { IWorld, RiftFloorView } from '../../../world_api';
import {
  classifyMapObjectMarker,
  type MapMarkerSemantic,
  mapMarkerSemanticLayer,
} from '../../map_marker_semantics_core';
import { isInstanceMapEntityDisclosed } from '../instance_map_disclosure_core';

const MIN_SPAN = 1;
const RIFT_SEMANTIC_CONTEXT = Object.freeze({ delveRun: null });

export interface RiftMapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type RiftMapFit = 'rect' | 'circle';

export interface RiftMapTransform extends RiftMapBounds {
  fit: RiftMapFit;
  scale: number;
  left: number;
  top: number;
  canvasSize: number;
  pad: number;
}

export interface RiftMapPoint {
  cx: number;
  cy: number;
}

export interface RiftMapPolygon {
  kind: 'polygon';
  role: 'floor';
  points: RiftMapPoint[];
}

export interface RiftMapRect {
  kind: 'rect';
  role:
    | 'wall-stub'
    | 'illusion-wall'
    | 'tomb'
    | 'ice'
    | 'platform'
    | 'platform-ramp'
    | 'raised-room'
    | 'lift-ramp';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RiftMapCircle {
  kind: 'circle';
  role: 'pillar' | 'decor' | 'dais' | 'hazard' | 'entry';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface RiftMapLine {
  kind: 'line';
  role: 'wall' | 'roller-lane';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type RiftMapPrimitive = RiftMapPolygon | RiftMapRect | RiftMapCircle | RiftMapLine;

export interface RiftStaticGeometry {
  /** One or more same-winding paths. Painters combine them into a union clip. */
  walkable: RiftMapPolygon[];
  /** Floor furniture and wall runs, painted without the walkable clip. */
  structures: RiftMapPrimitive[];
  /** Environmental overlays that must be intersected with `walkable`. */
  clipped: RiftMapPrimitive[];
}

export type RiftObjectSemantic = Exclude<
  MapMarkerSemantic,
  { kind: 'dungeon' | 'rift-entrance' | 'delve-passage' | 'delve-surface' | 'delve-reward' }
>;

export interface RiftMobMarker extends RiftMapPoint {
  state: 'hostile' | 'loot';
  aggro: boolean;
}

export interface RiftObjectMarker extends RiftMapPoint {
  semantic: RiftObjectSemantic;
}

export interface RiftPartyMarker extends RiftMapPoint {
  cls: string;
  dead: boolean;
}

export interface RiftDeathZoneMarker extends RiftMapPoint {
  radius: number;
  remaining: number;
  total: number;
}

export interface RiftPlayerMarker extends RiftMapPoint {
  angle: number;
}

export interface RiftMapModel {
  staticKey: string;
  staticGeometry: RiftStaticGeometry;
  transform: RiftMapTransform;
  mobs: RiftMobMarker[];
  objects: RiftObjectMarker[];
  party: RiftPartyMarker[];
  deathZones: RiftDeathZoneMarker[];
  corpse: RiftMapPoint | null;
  player: RiftPlayerMarker;
  areaLabel: string;
}

export interface RiftMapView {
  build(world: IWorld, canvasSize: number, pad: number, areaLabel: string): RiftMapModel | null;
}

/** Immutable static-raster identity. Runtime instance id is intentionally absent. */
export function riftFloorMapKey(view: RiftFloorView): string {
  return `rift-map-v1:${view.seed >>> 0}:${Math.round(view.baseLevel)}:${view.floorIndex}:${view.contentHash}`;
}

/** Bounds of the exact active shell, including its wall centre lines. */
export function riftLayoutBounds(layout: DungeonLayout): RiftMapBounds {
  if (layout.rooms?.length) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const room of layout.rooms) {
      minX = Math.min(minX, room.x0);
      maxX = Math.max(maxX, room.x1);
      minZ = Math.min(minZ, room.z0);
      maxZ = Math.max(maxZ, room.z1);
    }
    return { minX, maxX, minZ, maxZ };
  }
  if (layout.shellPolygon?.length) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const point of layout.shellPolygon) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
  }
  const wallX = Math.max(layout.wallX ?? DUNGEON_WALL_X, layout.endWallHw ?? DUNGEON_END_WALL_HW);
  return { minX: -wallX, maxX: wallX, minZ: layout.zMin, maxZ: layout.zMax };
}

/** Aspect-preserving projection with centered letterboxing. Rectangular map
 * windows fit against their padded square. Circular minimaps fit the complete
 * bounds rectangle inside a padded radius, so an accessible corner cannot be
 * projected behind the disc clip. */
export function riftMapTransform(
  bounds: RiftMapBounds,
  canvasSize: number,
  pad: number,
  fit: RiftMapFit = 'rect',
): RiftMapTransform {
  const spanX = Math.max(MIN_SPAN, bounds.maxX - bounds.minX);
  const spanZ = Math.max(MIN_SPAN, bounds.maxZ - bounds.minZ);
  const usable = Math.max(MIN_SPAN, canvasSize - pad * 2);
  const scale =
    fit === 'circle'
      ? Math.max(MIN_SPAN, canvasSize / 2 - pad) / Math.hypot(spanX / 2, spanZ / 2)
      : Math.min(usable / spanX, usable / spanZ);
  return {
    ...bounds,
    fit,
    scale,
    left: (canvasSize - spanX * scale) / 2,
    top: (canvasSize - spanZ * scale) / 2,
    canvasSize,
    pad,
  };
}

/** Established cartography axes: +X left, +Z up. */
export function riftLocalToCanvas(
  localX: number,
  localZ: number,
  transform: RiftMapTransform,
): RiftMapPoint {
  return {
    cx: transform.left + (transform.maxX - localX) * transform.scale,
    cy: transform.top + (transform.maxZ - localZ) * transform.scale,
  };
}

function polygon(
  points: readonly { x: number; z: number }[],
  transform: RiftMapTransform,
): RiftMapPolygon {
  return {
    kind: 'polygon',
    role: 'floor',
    points: points.map((point) => riftLocalToCanvas(point.x, point.z, transform)),
  };
}

function rect(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  role: RiftMapRect['role'],
  transform: RiftMapTransform,
): RiftMapRect {
  const a = riftLocalToCanvas(x0, z0, transform);
  const b = riftLocalToCanvas(x1, z1, transform);
  return {
    kind: 'rect',
    role,
    x: Math.min(a.cx, b.cx),
    y: Math.min(a.cy, b.cy),
    w: Math.abs(a.cx - b.cx),
    h: Math.abs(a.cy - b.cy),
  };
}

function circle(
  x: number,
  z: number,
  rx: number,
  rz: number,
  role: RiftMapCircle['role'],
  transform: RiftMapTransform,
): RiftMapCircle {
  const center = riftLocalToCanvas(x, z, transform);
  return {
    kind: 'circle',
    role,
    ...center,
    rx: Math.max(0.75, rx * transform.scale),
    ry: Math.max(0.75, rz * transform.scale),
  };
}

function line(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  role: RiftMapLine['role'],
  transform: RiftMapTransform,
): RiftMapLine {
  const a = riftLocalToCanvas(x1, z1, transform);
  const b = riftLocalToCanvas(x2, z2, transform);
  return { kind: 'line', role, x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy };
}

function rectWalkable(layout: DungeonLayout, transform: RiftMapTransform): RiftMapPolygon {
  const halfX = layout.floorHalfX ?? (layout.wallX ?? DUNGEON_WALL_X) - 1;
  return polygon(
    [
      { x: -halfX, z: layout.zMin },
      { x: halfX, z: layout.zMin },
      { x: halfX, z: layout.zMax },
      { x: -halfX, z: layout.zMax },
    ],
    transform,
  );
}

/** Build the immutable one-floor schematic. No plan spawn/object is exposed. */
export function buildRiftStaticGeometry(
  floor: RiftFloorPlan,
  transform: RiftMapTransform,
): RiftStaticGeometry {
  const { layout } = floor;
  const walkable: RiftMapPolygon[] = [];
  const structures: RiftMapPrimitive[] = [];
  const clipped: RiftMapPrimitive[] = [];

  if (layout.rooms?.length) {
    for (const room of layout.rooms) {
      const roomPoly = polygon(
        [
          { x: room.x0, z: room.z0 },
          { x: room.x1, z: room.z0 },
          { x: room.x1, z: room.z1 },
          { x: room.x0, z: room.z1 },
        ],
        transform,
      );
      walkable.push(roomPoly);
      if ((room.lift ?? 0) > 0)
        clipped.push(rect(room.x0, room.x1, room.z0, room.z1, 'raised-room', transform));
    }
    for (const segment of authoredWallSegments(layout.rooms, layout.doors ?? [])) {
      structures.push(
        segment.axis === 'x'
          ? line(segment.a, segment.fixed, segment.b, segment.fixed, 'wall', transform)
          : line(segment.fixed, segment.a, segment.fixed, segment.b, 'wall', transform),
      );
    }
    // Doorways that join different lift bands are actual stairs/ramps in the renderer.
    for (const door of layout.doors ?? []) {
      const south = layout.rooms.find(
        (room) => room.z1 === door.z && door.x >= room.x0 && door.x <= room.x1,
      );
      const north = layout.rooms.find(
        (room) => room.z0 === door.z && door.x >= room.x0 && door.x <= room.x1,
      );
      if (south && north && (south.lift ?? 0) !== (north.lift ?? 0)) {
        const half = doorRampHalf(door.hd, (north.lift ?? 0) - (south.lift ?? 0));
        clipped.push(
          rect(
            door.x - door.hw,
            door.x + door.hw,
            door.z - half,
            door.z + half,
            'lift-ramp',
            transform,
          ),
        );
        continue;
      }
      const west = layout.rooms.find(
        (room) => room.x1 === door.x && door.z >= room.z0 && door.z <= room.z1,
      );
      const east = layout.rooms.find(
        (room) => room.x0 === door.x && door.z >= room.z0 && door.z <= room.z1,
      );
      if (west && east && (west.lift ?? 0) !== (east.lift ?? 0)) {
        const half = doorRampHalf(door.hw, (east.lift ?? 0) - (west.lift ?? 0));
        clipped.push(
          rect(
            door.x - half,
            door.x + half,
            door.z - door.hd,
            door.z + door.hd,
            'lift-ramp',
            transform,
          ),
        );
      }
    }
  } else if (layout.shellPolygon?.length) {
    walkable.push(polygon(layout.shellPolygon, transform));
    for (let index = 0; index < layout.shellPolygon.length; index++) {
      const a = layout.shellPolygon[index];
      const b = layout.shellPolygon[(index + 1) % layout.shellPolygon.length];
      structures.push(line(a.x, a.z, b.x, b.z, 'wall', transform));
    }
  } else {
    walkable.push(rectWalkable(layout, transform));
    const wallX = layout.wallX ?? DUNGEON_WALL_X;
    const endWallHw = layout.endWallHw ?? DUNGEON_END_WALL_HW;
    structures.push(
      line(-wallX, layout.zMin, -wallX, layout.zMax, 'wall', transform),
      line(wallX, layout.zMin, wallX, layout.zMax, 'wall', transform),
      line(-endWallHw, layout.zMin, endWallHw, layout.zMin, 'wall', transform),
      line(-endWallHw, layout.zMax, endWallHw, layout.zMax, 'wall', transform),
    );
  }

  for (const stub of layout.stubs)
    structures.push(
      rect(
        stub.x - stub.hw,
        stub.x + stub.hw,
        stub.z - stub.hd,
        stub.z + stub.hd,
        'wall-stub',
        transform,
      ),
    );
  for (const stub of layout.illusionWalls ?? [])
    structures.push(
      rect(
        stub.x - stub.hw,
        stub.x + stub.hw,
        stub.z - stub.hd,
        stub.z + stub.hd,
        'illusion-wall',
        transform,
      ),
    );
  for (const pillar of layout.pillars)
    structures.push(
      circle(pillar.x, pillar.z, PILLAR_COLLIDER_R, PILLAR_COLLIDER_R, 'pillar', transform),
    );
  for (const tomb of layout.tombs)
    structures.push(
      rect(
        tomb.x - TOMB_HW,
        tomb.x + TOMB_HW,
        tomb.z - TOMB_HD,
        tomb.z + TOMB_HD,
        'tomb',
        transform,
      ),
    );
  // Only collision-backed decor belongs to the navigation schematic. Purely
  // visual rugs/sigils must not masquerade as blocked ground.
  for (const decor of layout.decor ?? []) {
    if (decor.r !== undefined && decor.r > 0)
      structures.push(circle(decor.x, decor.z, decor.r, decor.r, 'decor', transform));
  }
  for (const clutter of layout.clutter ?? [])
    structures.push(circle(clutter.x, clutter.z, 0.8, 0.8, 'decor', transform));
  // The boss dais is a walkable elevation with no collider. Keep it in the
  // clipped floor-accent layer so cartography never presents it as blocked
  // furniture merely because the renderer raises the ground there.
  clipped.push(
    circle(layout.dais.x, layout.dais.z, layout.dais.r, layout.dais.r, 'dais', transform),
  );
  structures.push(circle(floor.entry.x, floor.entry.z, 1.25, 1.25, 'entry', transform));

  for (const hazard of floor.hazards)
    clipped.push(
      circle(hazard.x, hazard.z, hazard.rx ?? hazard.r, hazard.rz ?? hazard.r, 'hazard', transform),
    );
  if (floor.iceZone) {
    const ice = floor.iceZone;
    clipped.push(
      rect(ice.x - ice.hw, ice.x + ice.hw, ice.z - ice.hd, ice.z + ice.hd, 'ice', transform),
    );
  }
  if (floor.platform) {
    clipped.push(
      rect(
        transform.minX,
        transform.maxX,
        floor.platform.rampZ1,
        transform.maxZ,
        'platform',
        transform,
      ),
      rect(
        transform.minX,
        transform.maxX,
        floor.platform.rampZ0,
        floor.platform.rampZ1,
        'platform-ramp',
        transform,
      ),
    );
  }
  for (const roller of floor.rollers)
    clipped.push(line(roller.x, roller.z0, roller.x, roller.z1, 'roller-lane', transform));

  return { walkable, structures, clipped };
}

function isInsideCanvas(point: RiftMapPoint, canvasSize: number): boolean {
  return point.cx >= 0 && point.cx <= canvasSize && point.cy >= 0 && point.cy <= canvasSize;
}

/** Reused dynamic model for both minimap and M-map surfaces. */
export function createRiftMapView(fit: RiftMapFit = 'rect'): RiftMapView {
  const mobs: RiftMobMarker[] = [];
  const objects: RiftObjectMarker[] = [];
  const mechanicObjects: RiftObjectMarker[] = [];
  const rewardObjects: RiftObjectMarker[] = [];
  const navigationObjects: RiftObjectMarker[] = [];
  const party: RiftPartyMarker[] = [];
  const deathZones: RiftDeathZoneMarker[] = [];
  let model: RiftMapModel | null = null;
  let staticSurfaceKey = '';

  return {
    build(world, canvasSize, pad, areaLabel): RiftMapModel | null {
      mobs.length = 0;
      objects.length = 0;
      mechanicObjects.length = 0;
      rewardObjects.length = 0;
      navigationObjects.length = 0;
      party.length = 0;
      deathZones.length = 0;
      const view = world.riftFloor;
      if (!view) return null;

      const floorKey = riftFloorMapKey(view);
      const nextSurfaceKey = `${floorKey}:${canvasSize}:${pad}:${fit}`;
      if (!model || staticSurfaceKey !== nextSurfaceKey) {
        const floor = generateRiftFloor(view.seed, view.baseLevel, view.floorIndex, view.upgrade);
        const transform = riftMapTransform(riftLayoutBounds(floor.layout), canvasSize, pad, fit);
        model = {
          staticKey: floorKey,
          staticGeometry: buildRiftStaticGeometry(floor, transform),
          transform,
          mobs,
          objects,
          party,
          deathZones,
          corpse: null,
          player: { cx: 0, cy: 0, angle: 0 },
          areaLabel,
        };
        staticSurfaceKey = nextSurfaceKey;
      }

      model.staticKey = floorKey;
      model.areaLabel = areaLabel;
      model.corpse = null;
      const transform = model.transform;
      const origin = view.origin;
      const player = world.player;
      const companionId = world.companionState?.entityId;

      for (const entity of world.entities.values()) {
        if (entity.id === player.id || entity.id === companionId) continue;
        if (!isInstanceMapEntityDisclosed(player.pos.x, player.pos.z, entity.pos.x, entity.pos.z))
          continue;
        let semantic: RiftObjectSemantic | null = null;
        if (entity.kind === 'object') {
          const classified = classifyMapObjectMarker(entity, RIFT_SEMANTIC_CONTEXT);
          if (
            classified &&
            (classified.kind === 'rift-descent' ||
              classified.kind === 'rift-return' ||
              classified.kind === 'rift-reward' ||
              classified.kind === 'rift-mechanic')
          )
            semantic = classified;
          else continue;
        } else if (
          !(entity.kind === 'mob' && entity.hostile && (!entity.dead || entity.lootable))
        ) {
          continue;
        }
        const projected = riftLocalToCanvas(
          entity.pos.x - origin.x,
          entity.pos.z - origin.z,
          transform,
        );
        if (!isInsideCanvas(projected, canvasSize)) continue;
        if (!semantic) {
          if (entity.hostile && !entity.dead)
            mobs.push({
              ...projected,
              state: 'hostile',
              aggro: entity.aggroTargetId === player.id,
            });
          else if (entity.hostile && entity.lootable)
            mobs.push({ ...projected, state: 'loot', aggro: false });
          continue;
        }
        const marker = { ...projected, semantic };
        const layer = mapMarkerSemanticLayer(semantic);
        if (layer === 'mechanic') mechanicObjects.push(marker);
        else if (layer === 'reward') rewardObjects.push(marker);
        else navigationObjects.push(marker);
      }

      // Stable semantic z-order without a per-redraw sort: mechanics, then
      // rewards, then the route the party must be able to find above both.
      for (let index = 0; index < mechanicObjects.length; index++)
        objects.push(mechanicObjects[index]);
      for (let index = 0; index < rewardObjects.length; index++) objects.push(rewardObjects[index]);
      for (let index = 0; index < navigationObjects.length; index++)
        objects.push(navigationObjects[index]);

      for (const member of world.partyInfo?.members ?? []) {
        if (member.pid === player.id) continue;
        const projected = riftLocalToCanvas(member.x - origin.x, member.z - origin.z, transform);
        if (!isInsideCanvas(projected, canvasSize)) continue;
        party.push({ ...projected, cls: member.cls, dead: member.dead !== 0 });
      }

      for (const zone of world.riftBossDeathZones()) {
        if (!isInstanceMapEntityDisclosed(player.pos.x, player.pos.z, zone.x, zone.z)) continue;
        const projected = riftLocalToCanvas(zone.x - origin.x, zone.z - origin.z, transform);
        if (!isInsideCanvas(projected, canvasSize)) continue;
        deathZones.push({
          ...projected,
          radius: zone.radius * transform.scale,
          remaining: zone.remaining,
          total: zone.total,
        });
      }

      if (player.ghost && player.corpsePos) {
        const corpse = riftLocalToCanvas(
          player.corpsePos.x - origin.x,
          player.corpsePos.z - origin.z,
          transform,
        );
        if (isInsideCanvas(corpse, canvasSize)) model.corpse = corpse;
      }
      const projectedPlayer = riftLocalToCanvas(
        player.pos.x - origin.x,
        player.pos.z - origin.z,
        transform,
      );
      model.player.cx = projectedPlayer.cx;
      model.player.cy = projectedPlayer.cy;
      model.player.angle = -player.facing;
      return model;
    },
  };
}
