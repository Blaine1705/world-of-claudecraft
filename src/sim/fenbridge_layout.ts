// Canonical Fenbridge rebuild layout. This is a pure, frozen data/geometry
// module shared by simulation content, collision, rendering, and acceptance
// capture. Keep engine imports, randomness, clocks, and mutable runtime state
// out of this file.

export interface Point2 {
  x: number;
  z: number;
}

export interface Obb2 {
  id: string;
  center: Point2;
  halfWidth: number;
  halfDepth: number;
  rotation: number;
}

interface CircularWallConfig {
  idPrefix: string;
  assetId: string;
  center: Point2;
  radius: number;
  thickness: number;
  height: number;
  maximumSegmentSpan: number;
}

interface CircularWallGate {
  id: string;
  roadId: string;
  crossing: Point2;
  width: number;
  angle: number;
  startAngle: number;
  endAngle: number;
  start: Point2;
  end: Point2;
}

export interface CircularWallSegment {
  id: string;
  assetId: string;
  startAngle: number;
  endAngle: number;
  start: Point2;
  end: Point2;
  arcLength: number;
  chordLength: number;
  height: number;
  footprint: Obb2;
}

const TAU = Math.PI * 2;

/** Transform a point with the yaw convention used by building colliders. */
export function localToWorld(
  center: Point2,
  rotation: number,
  localX: number,
  localZ: number,
): Point2 {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: center.x + localX * cos + localZ * sin,
    z: center.z - localX * sin + localZ * cos,
  };
}

export function facingToward(from: Point2, to: Point2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function obbCorners(obb: Obb2): Point2[] {
  return [
    localToWorld(obb.center, obb.rotation, -obb.halfWidth, -obb.halfDepth),
    localToWorld(obb.center, obb.rotation, obb.halfWidth, -obb.halfDepth),
    localToWorld(obb.center, obb.rotation, obb.halfWidth, obb.halfDepth),
    localToWorld(obb.center, obb.rotation, -obb.halfWidth, obb.halfDepth),
  ];
}

export function distancePointToObb(point: Point2, obb: Obb2): number {
  const dx = point.x - obb.center.x;
  const dz = point.z - obb.center.z;
  const cos = Math.cos(obb.rotation);
  const sin = Math.sin(obb.rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.hypot(
    Math.max(Math.abs(localX) - obb.halfWidth, 0),
    Math.max(Math.abs(localZ) - obb.halfDepth, 0),
  );
}

function obbAxes(obb: Obb2): Point2[] {
  return [
    { x: Math.cos(obb.rotation), z: -Math.sin(obb.rotation) },
    { x: Math.sin(obb.rotation), z: Math.cos(obb.rotation) },
  ];
}

function projection(corners: readonly Point2[], axis: Point2): [number, number] {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const corner of corners) {
    const value = corner.x * axis.x + corner.z * axis.z;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return [minimum, maximum];
}

/** Strict SAT overlap. Edge contact alone is not an overlap. */
export function obbsOverlap(left: Obb2, right: Obb2): boolean {
  const leftCorners = obbCorners(left);
  const rightCorners = obbCorners(right);
  for (const axis of [...obbAxes(left), ...obbAxes(right)]) {
    const [leftMinimum, leftMaximum] = projection(leftCorners, axis);
    const [rightMinimum, rightMaximum] = projection(rightCorners, axis);
    if (leftMaximum <= rightMinimum || rightMaximum <= leftMinimum) return false;
  }
  return true;
}

export function segmentToObb(id: string, start: Point2, end: Point2, width: number): Obb2 {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  return {
    id,
    center: { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 },
    halfWidth: Math.hypot(dx, dz) / 2,
    halfDepth: width / 2,
    rotation: Math.atan2(-dz, dx),
  };
}

/** Sample every polyline segment at a deterministic maximum spacing. */
export function samplePolyline(points: readonly Point2[], maximumStep: number): Point2[] {
  if (!(maximumStep > 0) || points.length === 0) return [];
  if (points.length === 1) return [{ ...points[0] }];
  const samples: Point2[] = [{ ...points[0] }];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const divisions = Math.max(
      1,
      Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) / maximumStep),
    );
    for (let division = 1; division <= divisions; division++) {
      const progress = division / divisions;
      samples.push({
        x: start.x + (end.x - start.x) * progress,
        z: start.z + (end.z - start.z) * progress,
      });
    }
  }
  return samples;
}

function pointOnCircle(center: Point2, radius: number, angle: number): Point2 {
  return {
    x: center.x + Math.cos(angle) * radius,
    z: center.z + Math.sin(angle) * radius,
  };
}

function positiveAngle(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

function makeCircularWallGate(
  config: CircularWallConfig,
  id: string,
  roadId: string,
  crossing: Point2,
  width: number,
): CircularWallGate {
  const angle = positiveAngle(
    Math.atan2(crossing.z - config.center.z, crossing.x - config.center.x),
  );
  const halfAngle = Math.asin(width / (2 * config.radius));
  const startAngle = angle - halfAngle;
  const endAngle = angle + halfAngle;
  return {
    id,
    roadId,
    crossing,
    width,
    angle,
    startAngle,
    endAngle,
    start: pointOnCircle(config.center, config.radius, startAngle),
    end: pointOnCircle(config.center, config.radius, endAngle),
  };
}

function generateCircularWallSegments(
  config: CircularWallConfig,
  gates: readonly CircularWallGate[],
): CircularWallSegment[] {
  const sorted = [...gates].sort((left, right) => left.angle - right.angle);
  const segments: CircularWallSegment[] = [];
  for (let gateIndex = 0; gateIndex < sorted.length; gateIndex++) {
    const gate = sorted[gateIndex];
    const next = sorted[(gateIndex + 1) % sorted.length];
    const startAngle = gate.endAngle;
    let endAngle = next.startAngle;
    if (endAngle <= startAngle) endAngle += TAU;
    const intervalArcLength = (endAngle - startAngle) * config.radius;
    const count = Math.max(1, Math.ceil(intervalArcLength / config.maximumSegmentSpan));
    for (let intervalIndex = 0; intervalIndex < count; intervalIndex++) {
      const segmentStartAngle = startAngle + ((endAngle - startAngle) * intervalIndex) / count;
      const segmentEndAngle = startAngle + ((endAngle - startAngle) * (intervalIndex + 1)) / count;
      const start = pointOnCircle(config.center, config.radius, segmentStartAngle);
      const end = pointOnCircle(config.center, config.radius, segmentEndAngle);
      const id = `${config.idPrefix}_${String(segments.length).padStart(2, '0')}`;
      segments.push({
        id,
        assetId: config.assetId,
        startAngle: segmentStartAngle,
        endAngle: segmentEndAngle,
        start,
        end,
        arcLength: (segmentEndAngle - segmentStartAngle) * config.radius,
        chordLength: Math.hypot(end.x - start.x, end.z - start.z),
        height: config.height,
        footprint: segmentToObb(id, start, end, config.thickness),
      });
    }
  }
  return segments;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const REMOVED_FENBRIDGE_PLACEMENTS = deepFreeze({
  buildings: [
    {
      id: 'legacy_fenbridge_building_00',
      disposition: 'removed',
      kind: 'inn',
      x: 13,
      z: 306,
      width: 6,
      depth: 7,
      rotation: -1,
    },
    {
      id: 'legacy_fenbridge_building_01',
      disposition: 'removed',
      kind: 'house',
      x: -13,
      z: 308,
      width: 7,
      depth: 6,
      rotation: 0.5,
    },
    {
      id: 'legacy_fenbridge_building_02',
      disposition: 'removed',
      kind: 'house',
      x: -12,
      z: 291,
      width: 6,
      depth: 5,
      rotation: 2.6,
    },
    {
      id: 'legacy_fenbridge_building_03',
      disposition: 'removed',
      kind: 'house',
      x: 11,
      z: 316,
      width: 6,
      depth: 5,
      rotation: 0.3,
    },
  ],
  wells: [
    {
      id: 'legacy_fenbridge_well',
      disposition: 'replaced',
      replacedBy: 'fenbridge_mirelight_cistern',
      x: 0,
      z: 302,
      radius: 1.5,
    },
  ],
  stalls: [
    {
      id: 'legacy_fenbridge_stall',
      disposition: 'replaced',
      replacedBy: 'fenbridge_provision_stall',
      x: -5,
      z: 310.5,
      rotation: Math.PI / 2,
      radius: 1.7,
    },
  ],
  campfires: [
    { id: 'legacy_fenbridge_campfire_00', disposition: 'removed', x: 4, z: 299 },
    { id: 'legacy_fenbridge_campfire_01', disposition: 'removed', x: -2, z: 293 },
  ],
  fences: [
    {
      id: 'legacy_fenbridge_fence_00',
      disposition: 'removed',
      start: { x: 16, z: 311 },
      end: { x: 21, z: 299 },
    },
    {
      id: 'legacy_fenbridge_fence_01',
      disposition: 'removed',
      start: { x: -18, z: 313 },
      end: { x: -22, z: 300 },
    },
  ],
  npcPlacements: [
    { id: 'warden_fenwick', disposition: 'relocated', position: { x: 3, z: 304 }, facing: Math.PI },
    {
      id: 'brother_aldric_fen',
      disposition: 'relocated',
      position: { x: -8, z: 296 },
      facing: 0.8,
    },
    {
      id: 'provisioner_hale',
      disposition: 'relocated',
      position: { x: -4, z: 308 },
      facing: Math.PI / 2,
    },
    {
      id: 'herbalist_yara',
      disposition: 'relocated',
      position: { x: 10, z: 295 },
      facing: -Math.PI / 2,
    },
    { id: 'scout_maren', disposition: 'relocated', position: { x: 6, z: 312 }, facing: -0.6 },
    {
      id: 'bursar_petra_vell',
      disposition: 'relocated',
      position: { x: 9, z: 303 },
      facing: -Math.PI / 2,
    },
    {
      id: 'chronicler_osric_fenn',
      disposition: 'relocated',
      position: { x: -14, z: 303 },
      facing: -1.4,
    },
    {
      id: 'tanner_hesk',
      disposition: 'preserved',
      position: { x: -11, z: 315.5 },
      facing: 2.3,
    },
  ],
  services: [
    {
      id: 'station_fenbridge_tannery',
      disposition: 'preserved',
      position: { x: -13, z: 314 },
    },
    { id: 'mailbox_fenbridge', disposition: 'preserved', position: { x: 6, z: 294 } },
    { id: 'gy_fenbridge', disposition: 'preserved', position: { x: -18, z: 286 } },
  ],
  groundObjects: [
    {
      id: 'legacy_fenbridge_muster_order_00',
      disposition: 'relocated',
      itemId: 'fen_muster_order',
      position: { x: 1, z: 294 },
    },
    {
      id: 'legacy_fenbridge_muster_order_01',
      disposition: 'relocated',
      itemId: 'fen_muster_order',
      position: { x: -2, z: 297 },
    },
  ],
} as const);

const CIVIC_CENTER = { x: 0, z: 303 } as const;
const FRONT_CLEARANCE = 1.5;

/** Normalize an angle into (-PI, PI]. */
function wrapAngle(angle: number): number {
  let wrapped = angle % TAU;
  if (wrapped <= -Math.PI) wrapped += TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  return wrapped;
}

// Where a visitor stands at a placed building's door: at the foot of its
// stoop, 1.8 yd off the wall face on the door's own line, the stand the
// painted Eastbrook uses (sim/eastbrook_layout.ts PLACED_FRONT_CLEARANCE).
const PLACED_FRONT_CLEARANCE = 1.8;
// The painted Tidehold models are authored in yards with their ground line
// at y 0 and one yard of footing below it. Fenbridge stands them at their
// authored size (Eastbrook's wider streets take them 1.3 times larger): the
// palisade ring is 63 yards across, and at authored size it holds an inn, a
// chapel, a bank, an apothecary and the warden's house with streets, a
// square and a barrow between them. The lift buries the yard of footing and
// sinks the ground line a further 0.05, the seat every placed building
// takes.
const PLACED_BUILDING_SCALE = 1;
const PLACED_BUILDING_LIFT = -1.05;

/**
 * A PLACED building: one of the painted Tidehold models in the Fenrire moss
 * look, stood at `anchor` (where the model's own origin goes) with `rotation`
 * and one uniform size. It is SEALED, like every town building: the record is
 * one solid box. `walls` is the walled body in the model's own axes, in yards
 * at the placed size: `position`, `nativeDimensions` and `footprint` are that
 * rectangle, so collision, the rest area and the map silhouette follow the
 * walls a player sees rather than the eaves above them. `annexes` are the
 * parts outside the wall box that are just as solid (a bell tower, a turret,
 * a stall counter), each one more box in the same axes. `reach` is the whole
 * ground rectangle the model covers (porch, stair, awning and chimney
 * included): the draw cull and the grass clearing read that one. These models
 * face local -Z, so the door and its standing point are on the -Z side.
 * Every number is measured off the shipped file and its baked collision rows
 * (tests/fenbridge_placed_buildings.test.ts).
 */
function makePlacedBuilding(spec: {
  id: string;
  assetId: string;
  kind: 'house' | 'inn' | 'chapel';
  anchor: Point2;
  rotation: number;
  /** The whole model in its own axes: its centre off the origin, its ground
   *  extents, and its full height from the bottom of its footing. */
  reach: { x: number; z: number; width: number; height: number; depth: number };
  /** The walled body in the model's own axes. */
  walls: { x: number; z: number; width: number; depth: number };
  /** Solid parts outside the wall box, in the model's own axes. */
  annexes?: readonly { name: string; x: number; z: number; width: number; depth: number }[];
  /** Where the door sits along the front (local -Z) face. */
  doorX: number;
}) {
  const position = localToWorld(spec.anchor, spec.rotation, spec.walls.x, spec.walls.z);
  const wallFrontZ = spec.walls.z - spec.walls.depth / 2;
  const annexes: Obb2[] = (spec.annexes ?? []).map((annex) => ({
    id: `${spec.id}:${annex.name}`,
    center: localToWorld(spec.anchor, spec.rotation, annex.x, annex.z),
    halfWidth: annex.width / 2,
    halfDepth: annex.depth / 2,
    rotation: spec.rotation,
  }));
  const doorSocket = localToWorld(spec.anchor, spec.rotation, spec.doorX, wallFrontZ);
  const frontStandingPoint = localToWorld(
    spec.anchor,
    spec.rotation,
    spec.doorX,
    wallFrontZ - PLACED_FRONT_CLEARANCE,
  );
  return {
    id: spec.id,
    assetId: spec.assetId,
    kind: spec.kind,
    position,
    nativeDimensions: {
      width: spec.walls.width,
      // above the ground line: the footing below it is buried
      height: spec.reach.height + PLACED_BUILDING_LIFT,
      depth: spec.walls.depth,
    },
    rotation: spec.rotation,
    footprint: {
      id: spec.id,
      center: position,
      halfWidth: spec.walls.width / 2,
      halfDepth: spec.walls.depth / 2,
      rotation: spec.rotation,
    },
    maxCornerRadius: Math.hypot(spec.walls.width / 2, spec.walls.depth / 2),
    frontClearance: PLACED_FRONT_CLEARANCE,
    frontStandingPoint,
    /** The way a visitor looks standing at the door, facing out of it. */
    frontFacing: wrapAngle(spec.rotation + Math.PI),
    sockets: {
      entrance: {
        id: `${spec.id}_entrance`,
        // In the MODEL's own axes: the door on the -Z face.
        localPosition: { x: spec.doorX, z: wallFrontZ },
        position: doorSocket,
        standingPoint: frontStandingPoint,
      },
    },
    placement: {
      x: spec.anchor.x,
      z: spec.anchor.z,
      rotation: spec.rotation,
      scale: PLACED_BUILDING_SCALE,
      lift: PLACED_BUILDING_LIFT,
    },
    annexes,
    reach: {
      id: spec.id,
      center: localToWorld(spec.anchor, spec.rotation, spec.reach.x, spec.reach.z),
      halfWidth: spec.reach.width / 2,
      halfDepth: spec.reach.depth / 2,
      rotation: spec.rotation,
    },
  };
}

// The site plan. Two streets cross inside the ring: the main street runs
// north from the south gate (the causeway every traveller arrives by) past
// the cistern to the north gate, and the marsh street joins the west and
// east gates. The inn and the chapel face each other across the cistern, so
// the first thing a newcomer meets past the warden is a door to rest at and
// a door to pray at; the chapel's bell tower marks the crossroads, the
// barrow (the graveyard) lies along the chapel's south side, and the bank
// and the apothecary face each other up the north street. A quarter turn
// either way stands a building side-on to the ring with its door on a street:
// facing the cistern head-on, these models are too deep for the ring.
const EAST_FACING = Math.PI / 2; // the door looks east (-x), the model turned a quarter
const WEST_FACING = -Math.PI / 2; // the door looks west (+x)
// The Fenrire look of the painted set: the same models and geometry as
// /models/tidehold/, re-baked wearing the moss-grown town maps.
const PAINTED_SET = '/models/tidehold/fenrire';

const WARDEN_HOUSE = makePlacedBuilding({
  id: 'fenbridge_warden_gatehouse',
  assetId: `${PAINTED_SET}/house_a.glb`,
  kind: 'house',
  // inside the south gate, west of the main street: the first door in town
  anchor: { x: 7.4, z: 281.7 },
  rotation: EAST_FACING,
  reach: { x: 0.2145, z: 0, width: 11.763, height: 12.23, depth: 9.8 },
  walls: { x: 0, z: 0, width: 9.36, depth: 7.96 },
  doorX: -1.4,
});
const INN_BASE = makePlacedBuilding({
  id: 'fenbridge_crooked_reed_inn',
  assetId: `${PAINTED_SET}/tavern.glb`,
  kind: 'inn',
  // west of the cistern, its long front on the main street
  anchor: { x: 12.25, z: 299.9 },
  rotation: EAST_FACING,
  reach: { x: 0.272, z: -0.05, width: 22.648, height: 18.78, depth: 16.8 },
  walls: { x: 0, z: 0, width: 20, depth: 13 },
  annexes: [
    { name: 'front_bench', x: -5.1, z: -7.25, width: 5.4, depth: 0.9 },
    { name: 'barrels', x: 10.9, z: -4.9, width: 1.1, depth: 2.3 },
  ],
  doorX: 0,
});
const CHAPEL_BASE = makePlacedBuilding({
  id: 'fenbridge_lantern_chapel',
  assetId: `${PAINTED_SET}/hall.glb`,
  kind: 'chapel',
  // east of the cistern, its gable and door facing the inn's
  anchor: { x: -16.2, z: 299.6 },
  rotation: WEST_FACING,
  reach: { x: 1.9255, z: -0.254, width: 18.851, height: 30.5, depth: 24.212 },
  walls: { x: 0, z: 0, width: 12, depth: 22 },
  annexes: [
    // at the crossroads corner
    { name: 'bell_tower', x: 8.25, z: -9, width: 5.4, depth: 5.4 },
    // the chronicler's archive board, left of the door
    { name: 'notice_board', x: -4.2, z: -11.8, width: 1.8, depth: 0.6 },
  ],
  doorX: 0,
});
const APOTHECARY = makePlacedBuilding({
  id: 'fenbridge_moonwort_apothecary',
  // the potion shop: a flask on its sign, bottles on its street stall
  assetId: `${PAINTED_SET}/shop_b.glb`,
  kind: 'house',
  // north street, west side, facing the bank; its turret on the crossroads
  anchor: { x: 9.2, z: 322.8 },
  rotation: EAST_FACING,
  reach: { x: 0.4745, z: -0.849, width: 13.649, height: 18.7, depth: 12.702 },
  walls: { x: 0, z: 0, width: 9.4, depth: 9 },
  annexes: [{ name: 'turret', x: 5.19, z: -4.99, width: 2.66, depth: 2.66 }],
  doorX: -0.7,
});
const BANK_BASE = makePlacedBuilding({
  id: 'fenbridge_gilded_strongbox',
  // the goods shop with the sack sign: the town's counting house
  assetId: `${PAINTED_SET}/shop_a.glb`,
  kind: 'house',
  // north street, east side, its counter and awning on the street
  anchor: { x: -8.9, z: 322 },
  rotation: WEST_FACING,
  reach: { x: 0, z: -0.8, width: 13.004, height: 16.28, depth: 12.2 },
  walls: { x: 0, z: 0, width: 11, depth: 8.4 },
  annexes: [
    { name: 'stall_counter', x: 2.375, z: -5.925, width: 3.61, depth: 0.77 },
    // the barrels at the stall's north end, with the awning post beside them
    { name: 'stall_barrels', x: 4.885, z: -5.762, width: 1.477, depth: 2.169 },
  ],
  doorX: -1.6,
});

// Provisioner Hale's stall stands on the main street in front of the inn's
// south half, its counter facing the street (the stall's front is its +Z).
const PROVISION_STALL_POSITION = { x: 3, z: 294.5 } as const;
const PROVISION_STALL_ROTATION = facingToward(PROVISION_STALL_POSITION, {
  x: 0,
  z: PROVISION_STALL_POSITION.z,
});
const PROVISION_STALL_WIDTH = 3.2;
const PROVISION_STALL_DEPTH = 1.6;
// Inner south-gate apron, board facing the square (readable on approach).
const MUSTER_BOARD_POSITION = { x: -6, z: 278 } as const;
const MUSTER_BOARD_ROTATION = facingToward(MUSTER_BOARD_POSITION, CIVIC_CENTER);
// The vendor stands at the counter's south end, clear of the stall OBB so
// pathfinding can reach them (Eastbrook-style service apron, not inside mesh).
const PROVISION_STALL_VENDOR_POINT = localToWorld(
  PROVISION_STALL_POSITION,
  PROVISION_STALL_ROTATION,
  -(PROVISION_STALL_WIDTH / 2 + 0.9),
  0.15,
);

const INN = {
  ...INN_BASE,
  sockets: {
    ...INN_BASE.sockets,
    provisionCounter: {
      id: 'fenbridge_crooked_reed_inn_provision_counter',
      localPosition: null,
      position: PROVISION_STALL_POSITION,
      standingPoint: PROVISION_STALL_VENDOR_POINT,
    },
  },
};

// The chronicler keeps the chapel's archive at the notice board left of the
// door: he stands 1.5 yd off its face.
const CHAPEL_BOARD = { x: -4.2, z: -11.8, depth: 0.6 } as const;
const CHAPEL_ARCHIVE_POSITION = localToWorld(
  CHAPEL_BASE.placement,
  CHAPEL_BASE.rotation,
  CHAPEL_BOARD.x,
  CHAPEL_BOARD.z - CHAPEL_BOARD.depth / 2,
);
const CHAPEL_ARCHIVE_STANDING_POINT = localToWorld(
  CHAPEL_BASE.placement,
  CHAPEL_BASE.rotation,
  CHAPEL_BOARD.x,
  CHAPEL_BOARD.z - CHAPEL_BOARD.depth / 2 - FRONT_CLEARANCE,
);
const CHAPEL = {
  ...CHAPEL_BASE,
  sockets: {
    ...CHAPEL_BASE.sockets,
    archive: {
      id: 'fenbridge_lantern_chapel_archive',
      localPosition: { x: CHAPEL_BOARD.x, z: CHAPEL_BOARD.z - CHAPEL_BOARD.depth / 2 },
      position: CHAPEL_ARCHIVE_POSITION,
      standingPoint: CHAPEL_ARCHIVE_STANDING_POINT,
    },
  },
};

// Petra keeps the bank's door: the teller stand is the doorstep.
const BANK = {
  ...BANK_BASE,
  sockets: {
    ...BANK_BASE.sockets,
    teller: {
      ...BANK_BASE.sockets.entrance,
      id: 'fenbridge_gilded_strongbox_teller',
    },
  },
};

const BUILDINGS = [WARDEN_HOUSE, INN, CHAPEL, APOTHECARY, BANK] as const;

const WALL_CONFIG = {
  idPrefix: 'fenbridge_palisade_wing',
  assetId: '/models/props/fenbridge_palisade_wing.glb',
  center: CIVIC_CENTER,
  radius: 31.5,
  thickness: 0.75,
  height: 3.4,
  maximumSegmentSpan: 12,
} as const;

const BASE_WALL_GATES = [
  makeCircularWallGate(
    WALL_CONFIG,
    'fenbridge_gate_south',
    'south_causeway',
    { x: 0, z: 271.5 },
    6,
  ),
  makeCircularWallGate(WALL_CONFIG, 'fenbridge_gate_west', 'west_marsh', { x: 30.5, z: 313 }, 6),
  makeCircularWallGate(WALL_CONFIG, 'fenbridge_gate_east', 'east_marsh', { x: -30.5, z: 314 }, 6),
  makeCircularWallGate(WALL_CONFIG, 'fenbridge_gate_north', 'north_fen', { x: 0, z: 334.5 }, 6),
] as const;

function addGateArch(gate: CircularWallGate) {
  const rotation = facingToward(gate.crossing, CIVIC_CENTER);
  const jambOffset = gate.width / 2 + 0.3;
  return {
    ...gate,
    arch: {
      id: `${gate.id}_arch`,
      assetId: '/models/props/fenbridge_gate_arch.glb',
      position: gate.crossing,
      rotation,
      nativeDimensions: { width: 7.2, height: 4.8, depth: 1 },
      openingWidth: gate.width,
      collision: 'jambs_only',
      jambs: [
        {
          ...segmentToObb(
            `${gate.id}_jamb_left`,
            localToWorld(gate.crossing, rotation, -jambOffset, -0.5),
            localToWorld(gate.crossing, rotation, -jambOffset, 0.5),
            0.6,
          ),
        },
        {
          ...segmentToObb(
            `${gate.id}_jamb_right`,
            localToWorld(gate.crossing, rotation, jambOffset, -0.5),
            localToWorld(gate.crossing, rotation, jambOffset, 0.5),
            0.6,
          ),
        },
      ],
    },
  };
}

const WALL_GATES = BASE_WALL_GATES.map(addGateArch);
const WALL_SEGMENTS = generateCircularWallSegments(WALL_CONFIG, WALL_GATES);

export function palisadeSegmentMirrored(segment: CircularWallSegment): boolean {
  return WALL_GATES.some(
    (gate) =>
      Math.abs(gate.end.x - segment.start.x) < 1e-8 &&
      Math.abs(gate.end.z - segment.start.z) < 1e-8,
  );
}

function gateCrossing(id: string): Point2 {
  const gate = WALL_GATES.find((candidate) => candidate.id === id);
  if (!gate) throw new Error(`missing Fenbridge wall gate ${id}`);
  return gate.crossing;
}

const GATE_RADIAL_APPROACH_DISTANCE = 4;

function gateRadialPoint(id: string, distanceFromCrossing: number): Point2 {
  const crossing = gateCrossing(id);
  const dx = crossing.x - CIVIC_CENTER.x;
  const dz = crossing.z - CIVIC_CENTER.z;
  const distance = Math.hypot(dx, dz);
  return {
    x: crossing.x + (dx / distance) * distanceFromCrossing,
    z: crossing.z + (dz / distance) * distanceFromCrossing,
  };
}

// The crossroads where the marsh street meets the main street, north of the
// cistern.
const CROSSROADS = { x: 0, z: 313.5 } as const;

const ROADS = [
  {
    id: 'south_causeway',
    gateId: 'fenbridge_gate_south',
    halfWidth: 1.5,
    points: [
      { x: 0, z: 80 },
      { x: 0, z: 180 },
      { x: -8, z: 240 },
      gateCrossing('fenbridge_gate_south'),
      { x: 0, z: 298 },
    ],
  },
  {
    id: 'west_marsh',
    gateId: 'fenbridge_gate_west',
    halfWidth: 1.5,
    points: [
      CROSSROADS,
      // bowed a stride north, clear of the inn's gable and chimney
      { x: 14, z: 313.7 },
      gateRadialPoint('fenbridge_gate_west', -GATE_RADIAL_APPROACH_DISTANCE),
      gateCrossing('fenbridge_gate_west'),
      gateRadialPoint('fenbridge_gate_west', GATE_RADIAL_APPROACH_DISTANCE),
      { x: 45, z: 336 },
      { x: 92, z: 350 },
      { x: 102, z: 392 },
      { x: 90, z: 420 },
    ],
  },
  {
    id: 'east_marsh',
    gateId: 'fenbridge_gate_east',
    halfWidth: 1.5,
    points: [
      CROSSROADS,
      // bowed a stride north, clear of the chapel's eaves
      { x: -14, z: 313.8 },
      gateRadialPoint('fenbridge_gate_east', -GATE_RADIAL_APPROACH_DISTANCE),
      gateCrossing('fenbridge_gate_east'),
      gateRadialPoint('fenbridge_gate_east', GATE_RADIAL_APPROACH_DISTANCE),
      { x: -40, z: 370 },
      { x: -80, z: 420 },
    ],
  },
  {
    id: 'north_fen',
    gateId: 'fenbridge_gate_north',
    halfWidth: 1.5,
    points: [
      { x: 0, z: 307.5 },
      gateCrossing('fenbridge_gate_north'),
      { x: 10, z: 400 },
      { x: 20, z: 470 },
      { x: 45, z: 515 },
    ],
  },
] as const;

/**
 * Ground-seated boardwalk modules (long axis = local X, joins at ±2).
 * Continuous runs down the main street: from the south gate to the cistern,
 * and from the crossroads to the north gate.
 */
function boardwalkModulesAlong(
  points: readonly Point2[],
  moduleLength = 4,
): Array<{ x: number; z: number; rotation: number }> {
  const modules: Array<{ x: number; z: number; rotation: number }> = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (!(length > 0)) continue;
    const count = Math.max(1, Math.round(length / moduleLength));
    // Align local +X (module length) with the path direction.
    const rotation = Math.atan2(-(end.z - start.z), end.x - start.x);
    for (let step = 0; step < count; step++) {
      const progress = (step + 0.5) / count;
      modules.push({
        x: start.x + (end.x - start.x) * progress,
        z: start.z + (end.z - start.z) * progress,
        rotation,
      });
    }
  }
  return modules;
}

const BOARDWALK_PATHS: readonly (readonly Point2[])[] = [
  // South gate -> cistern (6 modules along the causeway).
  [
    { x: 0, z: 274 },
    { x: 0, z: 298 },
  ],
  // Crossroads -> north gate (4 modules up the north street).
  [
    { x: 0, z: 316 },
    { x: 0, z: 332 },
  ],
];

const BOARDWALKS = BOARDWALK_PATHS.flatMap((path) => boardwalkModulesAlong(path)).map(
  (placement, index) => ({
    id: `fenbridge_boardwalk_${String(index).padStart(2, '0')}`,
    assetId: '/models/props/fenbridge_boardwalk.glb',
    position: { x: placement.x, z: placement.z },
    rotation: placement.rotation,
    nativeDimensions: { width: 4, height: 0.15, depth: 1.4 },
    blocking: false,
  }),
);

const MUSTER_ORDERS = [
  { id: 'fenbridge_muster_order_west', position: { x: -3.75, z: 274.8 } },
  { id: 'fenbridge_muster_order_east', position: { x: 3.75, z: 274.8 } },
].map((order) => ({
  ...order,
  assetId: '/models/quest/fenbridge_muster_order.glb',
  itemId: 'fen_muster_order',
  blocking: false,
}));

// Tanner Hesk works an open yard in the north-east corner, between the
// bank's back and the east gate: his tanning rack, barrel and crate
// stand round the station point (sim/town_props.ts STATION_PROP_CLUSTERS), and he
// keeps his place 2 yd off it (the cluster notes' tannery stand).
const TANNERY_STATION_POSITION = { x: -20, z: 320.5 } as const;
const TANNER_POSITION = {
  x: TANNERY_STATION_POSITION.x + 2,
  z: TANNERY_STATION_POSITION.z + 1.5,
} as const;

const STATIONS = [
  {
    id: 'station_fenbridge_tannery',
    type: 'tannery',
    masterNpcId: 'tanner_hesk',
    position: TANNERY_STATION_POSITION,
    interactionRadius: 20,
  },
] as const;

function makeNpc(id: string, position: Point2, facing: number, anchorId: string) {
  return { id, position, facing, anchorId, bodyRadius: 0.6 };
}

// Scout Maren keeps the north gate, inside it, looking down the north street
// into town.
const SCOUT_POSITION = { x: -3.2, z: 330 } as const;
const NPCS = [
  // The warden greets arrivals at his own door, inside the south gate.
  makeNpc(
    'warden_fenwick',
    WARDEN_HOUSE.frontStandingPoint,
    WARDEN_HOUSE.frontFacing,
    WARDEN_HOUSE.id,
  ),
  makeNpc('brother_aldric_fen', CHAPEL.frontStandingPoint, CHAPEL.frontFacing, CHAPEL.id),
  // Eastbrook merchant: stand at the counter's end, face with the stall.
  makeNpc(
    'provisioner_hale',
    PROVISION_STALL_VENDOR_POINT,
    PROVISION_STALL_ROTATION,
    'fenbridge_provision_stall',
  ),
  makeNpc('herbalist_yara', APOTHECARY.frontStandingPoint, APOTHECARY.frontFacing, APOTHECARY.id),
  makeNpc(
    'scout_maren',
    SCOUT_POSITION,
    facingToward(SCOUT_POSITION, CROSSROADS),
    'fenbridge_gate_north',
  ),
  // Eastbrook bursar: the bank's doorstep, facing the street.
  makeNpc(
    'bursar_petra_vell',
    BANK.sockets.teller.standingPoint,
    BANK.frontFacing,
    BANK.sockets.teller.id,
  ),
  makeNpc(
    'chronicler_osric_fenn',
    CHAPEL_ARCHIVE_STANDING_POINT,
    CHAPEL.frontFacing,
    'fenbridge_lantern_chapel_archive',
  ),
  // Faces the crossroads from his yard, the station beside him.
  makeNpc(
    'tanner_hesk',
    TANNER_POSITION,
    facingToward(TANNER_POSITION, CROSSROADS),
    'station_fenbridge_tannery',
  ),
  // The farmer (the farming go-live): outside the hub circle on the town
  // side of the patch_mirefen raised beds (content/farm_patches.ts, beds at
  // z 339 and 344), facing north across them (facing 0 looks along +z).
  // Anchored to the patch rather than a building: nothing is built there.
  makeNpc('farmer_teasel', { x: -21, z: 333.5 }, 0, 'patch_mirefen'),
] as const;

const PRESERVED_PROPS = {
  mines: [],
  docks: [{ x: -66, z: 305, rot: 1.68, hutLocal: { x: 2.8, z: 2.4, hw: 1.7, hd: 1.5 } }],
  tents: [
    { x: 12, z: 474, rot: 0.5, scale: 1 },
    { x: 20, z: 466, rot: 2.1, scale: 1 },
    { x: -22, z: 486, rot: 1.2, scale: 1 },
    { x: -28, z: 494, rot: -0.7, scale: 1 },
    { x: -3, z: 505, rot: 2.9, scale: 1.3 },
  ],
  marshReeds: [
    [-82, 334],
    [-85, 337],
    [-97, 344],
    [-112, 338],
    [-74, 316],
    [-77, 295],
    [-96, 287],
    [-110, 274],
    [-123, 274],
  ],
  crates: [
    [14, 468],
    [18, 471],
    [-23, 491],
    [2, 504],
  ],
  campfires: [
    [16, 470],
    [-25, 489],
    [0, 506],
  ],
  mudHuts: [
    [-78, 269],
    [-83, 266],
    [-74, 275],
    [-117, 346],
    [-123, 354],
  ],
  ruinRings: [{ x: 100, z: 435, ringR: 7, columns: 7 }],
} as const;

// The town's post pillar stands at the inn's north corner on the crossroads.
const MAILBOX_POSITION = { x: 3.2, z: 310.2 } as const;

export const FENBRIDGE_LAYOUT = deepFreeze({
  id: 'fenbridge_rebuild_v1',
  zoneId: 'mirefen_marsh',
  hub: { center: { x: 0, z: 300 }, radius: 34 },
  buildings: BUILDINGS,
  civic: {
    center: CIVIC_CENTER,
    crossroads: CROSSROADS,
    ring: { radius: 4.5, pathHalfWidth: 1.5 },
    cistern: {
      id: 'fenbridge_mirelight_cistern',
      assetId: '/models/props/fenbridge_mirelight_cistern.glb',
      position: CIVIC_CENTER,
      radius: 1.8,
      height: 2.6,
      nativeDimensions: { width: 3.6, height: 2.6, depth: 3.6 },
    },
    provisionStall: {
      id: 'fenbridge_provision_stall',
      assetId: '/models/props/fenbridge_provision_stall.glb',
      position: PROVISION_STALL_POSITION,
      rotation: PROVISION_STALL_ROTATION,
      width: PROVISION_STALL_WIDTH,
      depth: PROVISION_STALL_DEPTH,
      height: 2.8,
      footprint: {
        id: 'fenbridge_provision_stall',
        center: PROVISION_STALL_POSITION,
        halfWidth: PROVISION_STALL_WIDTH / 2,
        halfDepth: PROVISION_STALL_DEPTH / 2,
        rotation: PROVISION_STALL_ROTATION,
      },
      customerStandingPoint: localToWorld(
        PROVISION_STALL_POSITION,
        PROVISION_STALL_ROTATION,
        0,
        PROVISION_STALL_DEPTH / 2 + 0.9,
      ),
      vendorStandingPoint: PROVISION_STALL_VENDOR_POINT,
    },
    musterBoard: {
      id: 'fenbridge_muster_board',
      assetId: '/models/props/fenbridge_muster_board.glb',
      position: MUSTER_BOARD_POSITION,
      rotation: MUSTER_BOARD_ROTATION,
      nativeDimensions: { width: 2.4, height: 2.6, depth: 0.6 },
      footprint: {
        id: 'fenbridge_muster_board',
        center: MUSTER_BOARD_POSITION,
        halfWidth: 1.2,
        halfDepth: 0.3,
        rotation: MUSTER_BOARD_ROTATION,
      },
      frontStandingPoint: localToWorld(MUSTER_BOARD_POSITION, MUSTER_BOARD_ROTATION, 0, 1.4),
    },
  },
  wall: {
    ...WALL_CONFIG,
    gates: WALL_GATES,
    segments: WALL_SEGMENTS,
  },
  roads: ROADS,
  repeated: {
    boardwalks: BOARDWALKS,
    musterOrders: MUSTER_ORDERS,
  },
  services: {
    bank: {
      id: 'fenbridge_bank_service',
      buildingId: BANK.id,
      npcId: 'bursar_petra_vell',
      entrance: BANK.sockets.entrance,
      teller: BANK.sockets.teller,
    },
    mailbox: {
      id: 'mailbox_fenbridge',
      templateId: 'mailbox',
      assetId: '/models/props/mailbox_pillar.glb',
      position: MAILBOX_POSITION,
      bodyRadius: 0.8,
      interactionRadius: 7,
      // on the main street, east of the pillar
      frontStandingPoint: { x: MAILBOX_POSITION.x - 2, z: MAILBOX_POSITION.z },
    },
    graveyard: {
      id: 'gy_fenbridge',
      name: 'Fenbridge Barrow',
      position: { x: -18, z: 286 },
      healerTemplateId: 'spirit_healer',
      healerFacing: Math.PI,
    },
    rest: { id: 'fenbridge_inn_rest', buildingId: INN.id },
    stations: STATIONS,
    npcs: NPCS,
  },
  preservedProps: PRESERVED_PROPS,
} as const);

function indexById<T extends { id: string }>(records: readonly T[]): Readonly<Record<string, T>> {
  return deepFreeze(Object.fromEntries(records.map((record) => [record.id, record])));
}

/** Derived keyed views retain the exact frozen records owned by FENBRIDGE_LAYOUT. */
export const FENBRIDGE_BUILDINGS_BY_ID = indexById(FENBRIDGE_LAYOUT.buildings);
export const FENBRIDGE_NPC_PLACEMENTS_BY_ID = indexById(FENBRIDGE_LAYOUT.services.npcs);
export const FENBRIDGE_STATIONS_BY_ID = indexById(FENBRIDGE_LAYOUT.services.stations);
