// The indoor chase-camera clamp's pure decisions (the driver is interior_camera.ts). A walk-in
// building registers its INTERIOR as the air a camera may occupy: a union of axis-aligned
// boxes in world yards (its rooms, the doorways and arches between them, the stair shaft),
// each box authored against the inner wall faces, the floors and the ceilings. While the
// player's eye stands in that air, the camera is kept in it: the chase ray from the look
// point to the desired camera is walked through the union, and the camera is pulled IN to
// the first point where the ray would leave the air, less a near-plane pad, the classic MMO
// indoor camera. The outer shell is then never between the lens and the player, so it never
// has to open onto the outside.
//
// This is the ONE sanctioned exception to the pinned rule that scene geometry never changes
// the chase camera's distance (tests/graphics_overhaul_integration.test.ts): outdoors nothing
// here runs (no interior holds the eye), and the player's requested distance is never
// written; only the drawn camera is pulled in, and it eases back out when the view clears.
//
// The same walk answers the nameplate question for a player indoors: a plate outside the
// interior shows only when the camera's sight line to it leaves the air through an OPENING
// (a face of a box the building marks as open onto the world, its front door), never
// through a wall.
//
// A piece of air is a box, or a box cut round by a vertical cylinder (a stair tower's shaft:
// the cylinder's xz circle within the box's bounds), so a round room is exact, not stepped.
//
// Three-, DOM- and i18n-free, deterministic, allocation-free per call: slab and circle tests
// on a handful of pieces, with the last walk's exit written to module scratch.

/** One box of air, world yards: [x0, x1, y0, y1, z0, z1]. */
export type InteriorBox = readonly [number, number, number, number, number, number];

/** A vertical cylinder that rounds one box's air: its axis (x, z) and radius, world yards. */
export type InteriorRound = readonly [number, number, number];

/** A face of one box that opens onto the world outside (a front door): the box's index in
 *  the interior, the axis (0 x, 1 y, 2 z) and the side (+1 the max face, -1 the min face). */
export interface InteriorOpening {
  box: number;
  axis: 0 | 1 | 2;
  side: 1 | -1;
}

/** A registered interior: its air and its openings onto the world. */
export interface CameraInterior {
  id: string;
  boxes: readonly InteriorBox[];
  /** Per box, the cylinder that rounds it (null: the plain box). */
  rounds: readonly (InteriorRound | null)[];
  openings: readonly InteriorOpening[];
  /** The union's bounds: a point outside them is outside every box. */
  bounds: InteriorBox;
}

export function cameraInterior(
  id: string,
  boxes: readonly InteriorBox[],
  openings: readonly InteriorOpening[] = [],
  rounds: ReadonlyMap<number, InteriorRound> = new Map(),
): CameraInterior {
  const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const box of boxes) {
    for (let a = 0; a < 3; a++) {
      b[a * 2] = Math.min(b[a * 2], box[a * 2]);
      b[a * 2 + 1] = Math.max(b[a * 2 + 1], box[a * 2 + 1]);
    }
  }
  return {
    id,
    boxes,
    rounds: boxes.map((_, i) => rounds.get(i) ?? null),
    openings,
    bounds: [b[0], b[1], b[2], b[3], b[4], b[5]],
  };
}

/** Whether a point stands in piece `i`, `pad` yards clear of its faces. */
function inPiece(vol: CameraInterior, i: number, x: number, y: number, z: number, pad: number) {
  const b = vol.boxes[i];
  if (
    x < b[0] + pad ||
    x > b[1] - pad ||
    y < b[2] + pad ||
    y > b[3] - pad ||
    z < b[4] + pad ||
    z > b[5] - pad
  ) {
    return false;
  }
  const r = vol.rounds[i];
  if (!r) return true;
  const dx = x - r[0];
  const dz = z - r[1];
  const rr = r[2] - pad;
  return rr > 0 && dx * dx + dz * dz <= rr * rr;
}

/** Whether a point stands in the air, `pad` yards clear of every face. */
export function interiorContains(
  vol: CameraInterior,
  x: number,
  y: number,
  z: number,
  pad = 0,
): boolean {
  const u = vol.bounds;
  if (x < u[0] || x > u[1] || y < u[2] || y > u[3] || z < u[4] || z > u[5]) return false;
  for (let i = 0; i < vol.boxes.length; i++) if (inPiece(vol, i, x, y, z, pad)) return true;
  return false;
}

/**
 * Whether a player's eye at this point is indoors: in a box of the air that is not an
 * opening's (a body in the front doorway's thickness is still on the threshold, so the
 * camera does not squeeze in behind it until it steps into the room).
 */
export function interiorHoldsEye(vol: CameraInterior, x: number, y: number, z: number): boolean {
  const u = vol.bounds;
  if (x < u[0] || x > u[1] || y < u[2] || y > u[3] || z < u[4] || z > u[5]) return false;
  for (let i = 0; i < vol.boxes.length; i++) {
    if (!inPiece(vol, i, x, y, z, 0)) continue;
    let opening = false;
    for (const o of vol.openings) if (o.box === i) opening = true;
    if (!opening) return true;
  }
  return false;
}

// the slab test's result for one box (module scratch: no allocation per call)
let slabEnter = 0;
let slabExit = 0;
let slabExitAxis = 0;
let slabExitSide = 1;

/** The exit axis a round piece's curved face reports (never an opening's). */
const ROUND_FACE = 3;

/** The segment's parameter interval inside one piece shrunk by `pad` (slab test, then the
 *  circle for a round piece), written to the scratch above; false when the line misses. */
function slabPiece(
  b: InteriorBox,
  round: InteriorRound | null,
  pad: number,
  ax: number,
  ay: number,
  az: number,
  dx: number,
  dy: number,
  dz: number,
): boolean {
  slabEnter = -Infinity;
  slabExit = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? ax : axis === 1 ? ay : az;
    const d = axis === 0 ? dx : axis === 1 ? dy : dz;
    const lo = b[axis * 2] + pad;
    const hi = b[axis * 2 + 1] - pad;
    if (lo > hi) return false;
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return false;
      continue;
    }
    const t0 = (lo - o) / d;
    const t1 = (hi - o) / d;
    const near = Math.min(t0, t1);
    const far = Math.max(t0, t1);
    if (near > slabEnter) slabEnter = near;
    if (far < slabExit) {
      slabExit = far;
      slabExitAxis = axis;
      slabExitSide = d > 0 ? 1 : -1;
    }
  }
  if (round && slabEnter <= slabExit) {
    const rr = round[2] - pad;
    if (rr <= 0) return false;
    const px = ax - round[0];
    const pz = az - round[1];
    const a = dx * dx + dz * dz;
    const c = px * px + pz * pz - rr * rr;
    if (a < 1e-12) return c <= 0 && slabEnter <= slabExit;
    const bh = px * dx + pz * dz;
    const disc = bh * bh - a * c;
    if (disc < 0) return false;
    const root = Math.sqrt(disc);
    const t0 = (-bh - root) / a;
    const t1 = (-bh + root) / a;
    if (t0 > slabEnter) slabEnter = t0;
    if (t1 < slabExit) {
      slabExit = t1;
      slabExitAxis = ROUND_FACE;
      slabExitSide = 1;
    }
  }
  return slabEnter <= slabExit;
}

/** Where the last walk left the air: the box (-1 when it never did, or never started in
 *  it) and that box's face. */
export const interiorExit = { box: -1, axis: 0, side: 1 };

const EPS = 1e-6;

/**
 * Walk the segment a to b through the air (every box shrunk by `pad`) and return the
 * fraction of it (0 to 1) at which it first leaves; 1 when it never does. A start inside a
 * box but within `pad` of its faces (a player's eye against a wall) may walk out of that
 * band into the box, never the other way. The exit is left in `interiorExit`.
 */
export function interiorSegmentFraction(
  vol: CameraInterior,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  pad: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  interiorExit.box = -1;
  let t = 0;
  // each pass moves on to the farthest exit among the boxes the walk stands in, so it ends
  // within one pass per box
  for (let pass = 0; pass <= vol.boxes.length; pass++) {
    let best = t;
    let bestBox = -1;
    let bestAxis = 0;
    let bestSide = 1;
    for (let i = 0; i < vol.boxes.length; i++) {
      if (!slabPiece(vol.boxes[i], vol.rounds[i], pad, ax, ay, az, dx, dy, dz)) continue;
      const entered =
        slabEnter <= t + EPS ||
        // the clearance band: the start stands in the raw piece, the shrunk one lies ahead
        (t === 0 && slabEnter > 0 && inPiece(vol, i, ax, ay, az, 0));
      if (entered && slabExit > best) {
        best = slabExit;
        bestBox = i;
        bestAxis = slabExitAxis;
        bestSide = slabExitSide;
      }
    }
    if (bestBox < 0) return t;
    interiorExit.box = bestBox;
    interiorExit.axis = bestAxis;
    interiorExit.side = bestSide;
    if (best >= 1 - EPS) return 1;
    t = best;
  }
  return t;
}

/**
 * Whether a camera standing in the air sees the point (x, y, z) outside it: its sight line
 * leaves the air through an opening onto the world, not through a wall, floor or ceiling.
 */
export function interiorSeesOut(
  vol: CameraInterior,
  camX: number,
  camY: number,
  camZ: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if (interiorSegmentFraction(vol, camX, camY, camZ, x, y, z, 0) >= 1) return true;
  const exit = interiorExit;
  if (exit.box < 0) return false;
  for (const o of vol.openings) {
    if (o.box === exit.box && o.axis === exit.axis && o.side === exit.side) return true;
  }
  return false;
}

/** The pad that keeps the whole near-plane rectangle clear of a face (not just its centre),
 *  plus a hand of slack. `fovDeg` is the vertical field of view. */
export function interiorCameraPadding(near: number, fovDeg: number, aspect: number): number {
  const h = Math.tan((fovDeg * Math.PI) / 360) * near;
  return Math.hypot(near, h, h * aspect) + 0.08;
}

/** The boom's release rate (1/s) when the view clears: about a third of a second. */
export const INTERIOR_BOOM_RELEASE_RATE = 10;

/**
 * The drawn boom length this frame: a pull-in is immediate (the lens never crosses a wall
 * for a frame), a release eases out at INTERIOR_BOOM_RELEASE_RATE, so turning away from a
 * wall glides back rather than jumps. `immediate` adopts the allowed length outright (a
 * teleport, reduced motion, the first frame indoors).
 */
export function stepInteriorBoom(
  previous: number,
  allowed: number,
  dt: number,
  immediate: boolean,
): number {
  if (immediate || allowed <= previous) return allowed;
  return (
    previous + (allowed - previous) * (1 - Math.exp(-INTERIOR_BOOM_RELEASE_RATE * Math.max(0, dt)))
  );
}

/** Longest a release after walking out may take (seconds): then the camera is free. */
export const INTERIOR_RELEASE_MAX_SEC = 1;

// ---------------------------------------------------------------------------
// Framing a cramped spot: lift over it, or swing round it
// ---------------------------------------------------------------------------

/** A boom shorter than this (yards) is cramped (a player on the spiral stair against the
 *  tower's wall, backed into a guest room's corner): the drawn camera looks for a better
 *  framing nearby rather than sitting in the player's head. */
export const INTERIOR_COMFORT_BOOM = 2.8;
/** The camera never lifts past this elevation: it looks down on the player, never straight
 *  down. */
export const INTERIOR_LIFT_MAX_PITCH = 1.2;
/** How fast a framing (lift and swing) glides in and settles back (1/s). */
export const INTERIOR_LIFT_RATE = 5;

/** A framing tried for a cramped boom: `lift` radians more elevation, `swing` radians of
 *  yaw round the look point (either side). */
export interface InteriorFraming {
  lift: number;
  swing: number;
}

/** The framings tried, least departure from the requested view first: a lift alone (the
 *  camera rises over what cramps it, the heading kept), then a swing along the wall, then a
 *  swing with a lift. The first to give a comfortable boom wins, else the longest. */
export const INTERIOR_FRAMINGS: readonly InteriorFraming[] = [
  { lift: 0.3, swing: 0 },
  { lift: 0.6, swing: 0 },
  { lift: 0.9, swing: 0 },
  { lift: 0, swing: 0.5 },
  { lift: 0.3, swing: 0.5 },
  { lift: 0, swing: 1.0 },
  { lift: 0.4, swing: 1.0 },
  { lift: 0, swing: 1.5 },
  { lift: 0.4, swing: 1.5 },
];

/** The boom (dx, dy, dz) swung `swing` radians round the vertical, then turned `lift` radians
 *  further up toward the vertical (never past INTERIOR_LIFT_MAX_PITCH, never lowered), its
 *  length kept, written to `out`. */
export function frameBoomInto<T extends { x: number; y: number; z: number }>(
  out: T,
  dx: number,
  dy: number,
  dz: number,
  lift: number,
  swing = 0,
): T {
  if (swing !== 0) {
    const c = Math.cos(swing);
    const sn = Math.sin(swing);
    const rx = dx * c - dz * sn;
    dz = dx * sn + dz * c;
    dx = rx;
  }
  const h = Math.hypot(dx, dz);
  const len = Math.hypot(h, dy);
  const e0 = Math.atan2(dy, h);
  const e = Math.max(e0, Math.min(e0 + lift, INTERIOR_LIFT_MAX_PITCH));
  if (lift <= 0 || len < 1e-9 || h < 1e-9 || e === e0) {
    out.x = dx;
    out.y = dy;
    out.z = dz;
    return out;
  }
  const ch = Math.cos(e) * len;
  out.x = (dx / h) * ch;
  out.y = Math.sin(e) * len;
  out.z = (dz / h) * ch;
  return out;
}

/** A framing value this frame, eased toward `target` (adopted outright when `immediate`). */
export function stepInteriorFraming(
  previous: number,
  target: number,
  dt: number,
  immediate: boolean,
): number {
  if (immediate) return target;
  return previous + (target - previous) * (1 - Math.exp(-INTERIOR_LIFT_RATE * Math.max(0, dt)));
}

const frameScratch = { x: 0, y: 0, z: 0 };

/** The framing chosen for a cramped boom, written by chooseInteriorFraming. */
export const interiorFramingChoice = { lift: 0, swing: 0, boom: 0 };

/**
 * Choose how to frame a boom from (sx, sy, sz) along (dx, dy, dz) inside `vol`: none when the
 * requested boom is comfortable (or shorter than comfort anyway), else the first framing of
 * INTERIOR_FRAMINGS that gives a comfortable boom, trying first the side the camera already
 * swings to (`side`, so it never flips about a corner), else the longest. Written to
 * interiorFramingChoice (lift, swing, and the boom it allows).
 */
export function chooseInteriorFraming(
  vol: CameraInterior,
  sx: number,
  sy: number,
  sz: number,
  dx: number,
  dy: number,
  dz: number,
  pad: number,
  side: number,
): typeof interiorFramingChoice {
  const out = interiorFramingChoice;
  const len = Math.hypot(dx, dy, dz);
  out.lift = 0;
  out.swing = 0;
  out.boom = len * interiorSegmentFraction(vol, sx, sy, sz, sx + dx, sy + dy, sz + dz, pad);
  if (out.boom >= INTERIOR_COMFORT_BOOM - 1e-9 || len <= INTERIOR_COMFORT_BOOM) return out;
  const first = side < 0 ? -1 : 1;
  let best = out.boom;
  for (const f of INTERIOR_FRAMINGS) {
    for (let k = 0; k < (f.swing === 0 ? 1 : 2); k++) {
      const sign = k === 0 ? first : -first;
      const d = frameBoomInto(frameScratch, dx, dy, dz, f.lift, f.swing * sign);
      const boom =
        len * interiorSegmentFraction(vol, sx, sy, sz, sx + d.x, sy + d.y, sz + d.z, pad);
      if (boom > best + 0.05) {
        best = boom;
        out.lift = f.lift;
        out.swing = f.swing * sign;
        out.boom = boom;
      }
      if (boom >= INTERIOR_COMFORT_BOOM) {
        out.lift = f.lift;
        out.swing = f.swing * sign;
        out.boom = boom;
        return out;
      }
    }
  }
  return out;
}
