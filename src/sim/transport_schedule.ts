// The scheduled transport ship timetable: a fixed, endlessly repeating cycle
// derived from a schedule clock ONLY (the sim's own seconds plus a dev-only
// offset, never a wall clock), so every host that knows the clock agrees on
// the phase and the ship's pose without any extra state. The online client
// reads the clock off the snapshot head and derives the same answers.
//
// One cycle, for a route with berths A (index 0) and B (index 1):
//   docked at A (boarding open) -> departing A (sails out along A's
//   departure path) -> at sea (hidden; passengers see the sea card) ->
//   arriving at B (sails in along B's arrival path) -> docked at B -> the
//   mirror trip back to A.
//
// Paths are authored waypoints (x, z, rot) in world yards. Positions follow a
// uniform Catmull-Rom spline through the waypoints, walked at constant speed
// (an arc-length table) under a smoothstep ease so the ship leaves and
// arrives at rest; the heading eases between the authored waypoint headings,
// so a leg can pivot in place (Wickharbor's departure) or sail bow first.
//
// Pure leaf: no SimContext, no rng, no clock of its own. Every function takes
// the clock in and returns plain numbers; the `out` parameters let per-frame
// callers (the renderer) stay allocation free.

/** One authored point of a sailing path: a world position and a heading
 *  (three.js rotation.y convention: the bow points along (sin rot, cos rot)). */
export interface TransportWaypoint {
  x: number;
  z: number;
  rot: number;
}

/** Where a set-down player lands: on the pier beside the berth. */
export interface TransportLanding {
  x: number;
  z: number;
  facing: number;
}

export interface TransportBerthDef {
  /** Stable id (also the HUD's destination key suffix). */
  id: string;
  /** The moored pose: the first point of `departure`, the last of `arrival`. */
  x: number;
  z: number;
  rot: number;
  /** Sailing out: from the berth pose to open water. */
  departure: readonly TransportWaypoint[];
  /** Sailing in: from open water to the berth pose. */
  arrival: readonly TransportWaypoint[];
  /** The pier spot a player is set down on (left behind at departure, or a
   *  save taken aboard: nobody ever loads into the sea). */
  landing: TransportLanding;
}

/** The seconds each leg lasts. Tunable; the cycle is their sum, twice. */
export interface TransportTimings {
  docked: number;
  departing: number;
  atSea: number;
  arriving: number;
}

export interface TransportRouteDef {
  id: string;
  /** Hull layout key (content/transport_ships.ts TRANSPORT_SHIP_HULLS) and
   *  ship model key (render/transport_ship.ts). */
  ship: string;
  /** Exactly two berths: the route runs A -> B -> A. */
  berths: readonly [TransportBerthDef, TransportBerthDef];
  timings: TransportTimings;
}

export type TransportPhase = 'docked' | 'departing' | 'atSea' | 'arriving';

/** The route's state at one clock reading. */
export interface TransportPhaseState {
  phase: TransportPhase;
  /** docked: where the ship lies. departing: the berth it is leaving.
   *  atSea / arriving: the berth it is bound for. */
  berth: number;
  /** The crossing in progress or, while docked, the next one. */
  from: number;
  to: number;
  /** Seconds into and left in this phase. */
  elapsed: number;
  remaining: number;
  /** Seconds until the next departure (0 while not docked). */
  departsIn: number;
}

/** A ship pose in the world: the hull frame's origin and heading. */
export interface TransportPose {
  x: number;
  z: number;
  rot: number;
}

export function transportCycleSeconds(route: TransportRouteDef): number {
  const t = route.timings;
  return 2 * (t.docked + t.departing + t.atSea + t.arriving);
}

const PHASES: readonly TransportPhase[] = ['docked', 'departing', 'atSea', 'arriving'];

function legSeconds(t: TransportTimings, phase: TransportPhase): number {
  return t[phase];
}

/** The phase of `route` at schedule `clock` seconds (any real number). */
export function transportPhaseAt(
  route: TransportRouteDef,
  clock: number,
  out: TransportPhaseState = {
    phase: 'docked',
    berth: 0,
    from: 0,
    to: 1,
    elapsed: 0,
    remaining: 0,
    departsIn: 0,
  },
): TransportPhaseState {
  const cycle = transportCycleSeconds(route);
  const half = cycle / 2;
  let t = clock % cycle;
  if (t < 0) t += cycle;
  // the first half is the A -> B trip (docked at A first), the second B -> A
  const trip = t < half ? 0 : 1;
  let local = t - trip * half;
  const from = trip;
  const to = 1 - trip;
  out.from = from;
  out.to = to;
  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];
    const len = legSeconds(route.timings, phase);
    if (local < len || i === PHASES.length - 1) {
      out.phase = phase;
      out.elapsed = Math.min(local, len);
      out.remaining = Math.max(0, len - local);
      out.berth = phase === 'docked' || phase === 'departing' ? from : to;
      out.departsIn = phase === 'docked' ? out.remaining : 0;
      return out;
    }
    local -= len;
  }
  return out;
}

/** Whether `berth`'s moored hull (its deck colliders) exists at `clock`:
 *  only while the ship lies docked there. */
export function transportBerthOpenAt(
  route: TransportRouteDef,
  berth: number,
  clock: number,
): boolean {
  const s = transportPhaseAt(route, clock, scratchPhase);
  return s.phase === 'docked' && s.berth === berth;
}

const scratchPhase: TransportPhaseState = {
  phase: 'docked',
  berth: 0,
  from: 0,
  to: 1,
  elapsed: 0,
  remaining: 0,
  departsIn: 0,
};

// ---------------------------------------------------------------------------
// Path sampling
// ---------------------------------------------------------------------------

/** Arc-length samples per path segment (the constant-speed table). */
const ARC_SAMPLES_PER_SEGMENT = 16;

interface PathTable {
  /** cumulative arc length at each sample, sample 0 = 0 */
  lengths: Float64Array;
  /** spline parameter u (0 .. n-1) at each sample */
  us: Float64Array;
}

// Memo of the constant-speed tables per authored path array. A pure function
// of the (frozen, module-level) content, so the memo is a cache, never state.
const tables = new WeakMap<readonly TransportWaypoint[], PathTable>();

function catmull(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * s +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * s3)
  );
}

/** Spline position at parameter u (0 .. n-1), into out.x / out.z. */
function splineAt(
  path: readonly TransportWaypoint[],
  u: number,
  out: { x: number; z: number },
): void {
  const n = path.length;
  if (n === 1) {
    out.x = path[0].x;
    out.z = path[0].z;
    return;
  }
  const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
  const s = u - i;
  const p0 = path[Math.max(0, i - 1)];
  const p1 = path[i];
  const p2 = path[i + 1];
  const p3 = path[Math.min(n - 1, i + 2)];
  out.x = catmull(p0.x, p1.x, p2.x, p3.x, s);
  out.z = catmull(p0.z, p1.z, p2.z, p3.z, s);
}

const sampleScratch = { x: 0, z: 0 };

function tableFor(path: readonly TransportWaypoint[]): PathTable {
  const cached = tables.get(path);
  if (cached) return cached;
  const segs = Math.max(1, path.length - 1);
  const count = segs * ARC_SAMPLES_PER_SEGMENT + 1;
  const lengths = new Float64Array(count);
  const us = new Float64Array(count);
  splineAt(path, 0, sampleScratch);
  let px = sampleScratch.x;
  let pz = sampleScratch.z;
  for (let k = 1; k < count; k++) {
    const u = (k / (count - 1)) * segs;
    splineAt(path, u, sampleScratch);
    lengths[k] = lengths[k - 1] + Math.hypot(sampleScratch.x - px, sampleScratch.z - pz);
    us[k] = u;
    px = sampleScratch.x;
    pz = sampleScratch.z;
  }
  const table = { lengths, us };
  tables.set(path, table);
  return table;
}

/** Total length of a path (yards), for authoring checks and tests. */
export function transportPathLength(path: readonly TransportWaypoint[]): number {
  const t = tableFor(path);
  return t.lengths[t.lengths.length - 1];
}

/** Shortest signed angle from a to b (radians, in [-PI, PI)). */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d < -Math.PI) d += Math.PI * 2;
  else if (d >= Math.PI) d -= Math.PI * 2;
  return d;
}

/** smoothstep: leaves and arrives at rest. */
function ease(f: number): number {
  const c = Math.min(1, Math.max(0, f));
  return c * c * (3 - 2 * c);
}

/**
 * The pose `fraction` (0 .. 1 of the leg's TIME) along `path`: eased, then
 * walked at constant speed along the spline. The heading eases between the
 * authored waypoint headings of the segment the point lies in.
 */
export function transportPathPose(
  path: readonly TransportWaypoint[],
  fraction: number,
  out: TransportPose,
): TransportPose {
  const n = path.length;
  if (n === 1 || fraction <= 0) {
    out.x = path[0].x;
    out.z = path[0].z;
    out.rot = path[0].rot;
    return out;
  }
  if (fraction >= 1) {
    const last = path[n - 1];
    out.x = last.x;
    out.z = last.z;
    out.rot = last.rot;
    return out;
  }
  const table = tableFor(path);
  const total = table.lengths[table.lengths.length - 1];
  const want = ease(fraction) * total;
  // binary search the arc table for the sample pair around `want`
  let lo = 0;
  let hi = table.lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table.lengths[mid] <= want) lo = mid;
    else hi = mid;
  }
  const span = table.lengths[hi] - table.lengths[lo];
  const f = span > 1e-9 ? (want - table.lengths[lo]) / span : 0;
  const u = table.us[lo] + (table.us[hi] - table.us[lo]) * f;
  splineAt(path, u, out);
  const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
  const s = ease(u - i);
  const a = path[i].rot;
  out.rot = a + angleDelta(a, path[i + 1].rot) * s;
  return out;
}

/**
 * Where the ship is at `clock`, and whether it is drawn. Docked: the berth
 * pose. Sailing: along the departure or arrival path. At sea the ship is
 * hidden; the returned pose is where its passengers are HELD (the departure
 * path's end for the first half of the leg, the arrival path's start for the
 * second), so a passenger never hangs over a pier.
 */
export function transportShipPoseAt(
  route: TransportRouteDef,
  clock: number,
  out: TransportPose,
  phaseOut: TransportPhaseState = scratchPose,
): boolean {
  const s = transportPhaseAt(route, clock, phaseOut);
  const t = route.timings;
  switch (s.phase) {
    case 'docked': {
      const b = route.berths[s.berth];
      out.x = b.x;
      out.z = b.z;
      out.rot = b.rot;
      return true;
    }
    case 'departing':
      transportPathPose(route.berths[s.berth].departure, s.elapsed / t.departing, out);
      return true;
    case 'arriving':
      transportPathPose(route.berths[s.berth].arrival, s.elapsed / t.arriving, out);
      return true;
    default: {
      // at sea: held at the departure end, then at the arrival start
      if (s.elapsed < t.atSea / 2) transportPathPose(route.berths[s.from].departure, 1, out);
      else transportPathPose(route.berths[s.to].arrival, 0, out);
      return false;
    }
  }
}

const scratchPose: TransportPhaseState = {
  phase: 'docked',
  berth: 0,
  from: 0,
  to: 1,
  elapsed: 0,
  remaining: 0,
  departsIn: 0,
};

// ---------------------------------------------------------------------------
// The read model the HUD and renderer consume (IWorld.ferryView)
// ---------------------------------------------------------------------------

/** One route's state for presentation. A LIVE object each world reuses:
 *  read it, never retain it across frames. */
export interface TransportFerryView {
  routeId: string;
  /** The schedule clock (seconds) this view was built at. */
  clock: number;
  phase: TransportPhase;
  /** Berth ids: docked/departing = where it lies/leaves, else bound for. */
  berth: string;
  from: string;
  to: string;
  /** Seconds left in this phase, and until the next departure (0 at sea). */
  remaining: number;
  departsIn: number;
  /** Whether the ship is drawn (false on the at-sea leg). */
  shipVisible: boolean;
  /** The ship's pose (at sea: where its passengers are held). */
  x: number;
  z: number;
  rot: number;
  /** World Y of the hull frame's origin: the waterline it floats on. */
  baseY: number;
  /** Whether the viewing player is aboard as a passenger. */
  passenger: boolean;
}

export function emptyTransportFerryView(route: TransportRouteDef): TransportFerryView {
  const b = route.berths[0];
  return {
    routeId: route.id,
    clock: 0,
    phase: 'docked',
    berth: b.id,
    from: b.id,
    to: route.berths[1].id,
    remaining: 0,
    departsIn: 0,
    shipVisible: true,
    x: b.x,
    z: b.z,
    rot: b.rot,
    baseY: 0,
    passenger: false,
  };
}

const viewPhase: TransportPhaseState = {
  phase: 'docked',
  berth: 0,
  from: 0,
  to: 1,
  elapsed: 0,
  remaining: 0,
  departsIn: 0,
};
const viewPose: TransportPose = { x: 0, z: 0, rot: 0 };

/** Fill `out` with `route` at `clock` for a viewer who is (or is not) aboard. */
export function transportFerryViewAt(
  route: TransportRouteDef,
  clock: number,
  baseY: number,
  passenger: boolean,
  out: TransportFerryView,
): TransportFerryView {
  const visible = transportShipPoseAt(route, clock, viewPose, viewPhase);
  out.routeId = route.id;
  out.clock = clock;
  out.phase = viewPhase.phase;
  out.berth = route.berths[viewPhase.berth].id;
  out.from = route.berths[viewPhase.from].id;
  out.to = route.berths[viewPhase.to].id;
  out.remaining = viewPhase.remaining;
  out.departsIn = viewPhase.departsIn;
  out.shipVisible = visible;
  out.x = viewPose.x;
  out.z = viewPose.z;
  out.rot = viewPose.rot;
  out.baseY = baseY;
  out.passenger = passenger;
  return out;
}
