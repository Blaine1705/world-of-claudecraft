// Per-object fog cull and first-reveal policy for the merged and instanced
// prop bands (props.ts cullables). A cullable is one world-spanning merged
// Mesh or InstancedMesh; its programs are shared with nothing the boot sweep
// is guaranteed to have compiled (a band entirely past the fog at boot is
// invisible to the visible-only sweep and to every prewarm group that misses
// its exact variant), so its FIRST fog reveal on a walking approach linked
// synchronously inside a live frame (the prod never-compiled world-content
// rows). The policy below is the props twin of town_reveal_core: the first
// reveal consults a reveal gate and holds while cold. A band already near the
// camera on that first consult (hearth, teleport) still consults, and holds
// like any other, but its consult is IMMINENT: the gate submits its compile at
// the imminent priority, ahead of every other reveal, and on a frame where
// several bands escape at once they are consulted NEAREST FIRST so the queue
// order matches what the player is standing in. Nothing here reveals on a
// clock. The one INSTANT reveal left is the reach floor, where colliders would
// be at arm's length (PROP_CULL_REVEAL_REACH).
// Once revealed, the
// gate is never consulted again: a fog re-entry is a plain cull flip. The
// gate itself arms at world entry, not under the curtain (props.ts
// setBandRevealGate).
//
// The camera-ghost HIDEABLES (props.ts registerHideable: one building, tent
// or campfire group each, individual so the chase cam can fade through them)
// ride the same policy through the `propHideable*` entries below. Their fog
// cull is a sphere reach (centre distance against fogFar + cull) and their
// analogue of the band's box distance is the distance to that sphere's
// surface, so the reach floor and the near line keep their meaning. Before
// this a hideable's first sight was a bare visible flip: the Eastbrook Grand
// Armoury's five unique materials linked cold at first draw on the ride in.
//
// Pure core contract: no three import, no DOM, no clocks, no randomness.
// Registered in RENDER_PURE_CORES (tests/architecture.test.ts); tested by
// tests/prop_cull_core.test.ts.

export interface PropCullBounds {
  /** True when minX..maxZ is a real bounding box; false when it is the
   *  bounding sphere's box and the sphere reach decides past it. */
  hasBox: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  r: number;
}

export interface PropCullRevealState {
  /** Reveal-gate key (props.ts mints one per cullable). */
  key: string;
  /** Latched once the first reveal was allowed: the gate is consulted only
   *  until the band's programs are known linked. */
  revealed: boolean;
  /** Latched once the gate held the band: from then on the near line can no
   *  longer make this band imminent, so a band first held at the fog edge is
   *  a walking approach for the rest of its hold (see propCullReveal). */
  held: boolean;
}

/** Structural subset of reveal_gate_core's RevealGateCore, so this core
 *  stays decoupled from the gate module. */
export interface PropCullRevealGate {
  allow(key: string, imminent?: boolean): boolean;
}

/**
 * Bands closer than this fraction of the fog far plane make their FIRST
 * consult IMMINENT: they hold exactly like any other band, but their compile
 * is submitted ahead of the rest of the reveal lane. A walking approach meets
 * a band at the fog plane itself (dim, a hold there is invisible); a cover
 * arrival lands the camera among bands that must exist SOON. Half the fog
 * range is the reach within which a player notices decor missing. It never
 * applies to a band the gate already holds: after an arrival the fog opens
 * over seconds, so a band held at the fog edge would otherwise cross the near
 * line long after its compile was submitted at the ordinary priority, and
 * re-labelling a submission that already happened changes nothing.
 */
export const PROP_CULL_REVEAL_NEAR_FRACTION = 0.5;

/**
 * The absolute floor of the hold, in yards of box distance: a band this
 * close to the camera reveals on every consult, held or not, gate or not:
 * the one instant reveal the policy keeps.
 * The bands carry colliders (fences, the race arches and jumps, every
 * decoration footprint), and a hold now ends only on the band's own compile
 * or on the reveal gate's watchdog, so a driver whose link takes seconds must
 * never leave a collider invisible at arm's length: the fairness contract is
 * that decor may arrive late, never that the player walks into nothing. Same
 * distance as the far-cell swap (one camera boom plus the largest footprint,
 * see prop_cell_core.ts PROP_FAR_SWAP_DISTANCE): inside it the props are the
 * player's immediate surroundings. It also floors the near line when the fog
 * is clamped tight (the residency clamp after a cover), where half the fog
 * would be a few yards.
 */
export const PROP_CULL_REVEAL_REACH = 40;

/** The reveal-gate key of the band at `index` (its slot in the view's
 *  cullable list). The `cull:` prefix keeps the namespace disjoint from the
 *  far-cell grid keys (`propCellKey`, `<x>:<z>`) on the shared props gate. */
export function propCullKey(index: number): string {
  return `cull:${index}`;
}

/** The reveal-gate key of the hideable at `index` (its slot in the view's
 *  hideable list); the `hideable:` prefix keeps it disjoint from the far-cell
 *  grid keys and the `cull:` band keys on the shared props gate. */
export function propHideableKey(index: number): string {
  return `hideable:${index}`;
}

/** The compile roots behind one props gate key: a far cell's bake meshes,
 *  the one band object behind a cullable key, the one group behind a
 *  hideable key, or nothing for a stranger (which the gate then settles at
 *  once, the fail-soft arm).
 *
 *  None of the consults reveals piecewise, unlike the towns. A band or a
 *  hideable key is one root, so there is nothing to split. A far cell has
 *  several bake meshes but swaps as ONE representation (the near individuals
 *  hide as the bake shows), and revealing half a bake beside the individuals
 *  it replaces would draw that half twice. */
export function propRevealRoots<T>(
  farCells: { get(key: string): { meshes: readonly T[] } | undefined },
  bands: { get(key: string): { obj: T } | undefined },
  hideables: { get(key: string): { group: T } | undefined },
  key: string,
): readonly T[] {
  const cell = farCells.get(key);
  if (cell) return cell.meshes;
  const band = bands.get(key);
  if (band) return [band.obj];
  const hideable = hideables.get(key);
  return hideable ? [hideable.group] : [];
}

/** XZ distance squared from the camera to the cullable's box (0 inside). */
export function propCullBoxDistanceSq(c: PropCullBounds, camX: number, camZ: number): number {
  const dx = camX < c.minX ? c.minX - camX : camX > c.maxX ? camX - c.maxX : 0;
  const dz = camZ < c.minZ ? c.minZ - camZ : camZ > c.maxZ ? camZ - c.maxZ : 0;
  return dx * dx + dz * dz;
}

/** Whether the band draws inside the fog: box distance for boxed bounds,
 *  sphere reach for the fallback (`boxDistSq` is the caller's box distance). */
export function propCullInFog(
  c: PropCullBounds,
  boxDistSq: number,
  camX: number,
  camZ: number,
  fogFar: number,
  fogFarSq: number,
): boolean {
  if (boxDistSq < fogFarSq) return true;
  if (c.hasBox) return false;
  const centerDx = c.cx - camX;
  const centerDz = c.cz - camZ;
  const reach = fogFar + c.r;
  return centerDx * centerDx + centerDz * centerDz < reach * reach;
}

/**
 * 'hidden': the fog cull hides the band this frame. 'held': first reveal
 * deferred by the gate, the band stays hidden; the caller latches `held`.
 * 'revealed': the band draws; the caller latches `revealed` so the gate is
 * never consulted again.
 */
export type PropCullReveal = 'hidden' | 'held' | 'revealed';

/**
 * Whether this frame's consult for the band would be IMMINENT: the camera is
 * inside the near line and the gate has never held this band. Answered
 * without consulting anything, so a caller can collect the frame's imminent
 * bands and consult them nearest first.
 */
export function propCullConsultImminent(
  inFog: boolean,
  boxDistSq: number,
  fogFar: number,
  state: PropCullRevealState,
  gate: PropCullRevealGate | null | undefined,
): boolean {
  if (!inFog || state.revealed || !gate || state.held) return false;
  if (boxDistSq <= PROP_CULL_REVEAL_REACH * PROP_CULL_REVEAL_REACH) return false;
  const near = fogFar * PROP_CULL_REVEAL_NEAR_FRACTION;
  return boxDistSq <= near * near;
}

export function propCullReveal(
  inFog: boolean,
  boxDistSq: number,
  fogFar: number,
  state: PropCullRevealState,
  gate: PropCullRevealGate | null | undefined,
): PropCullReveal {
  if (!inFog) return 'hidden';
  if (state.revealed) return 'revealed';
  if (!gate) return 'revealed';
  if (boxDistSq <= PROP_CULL_REVEAL_REACH * PROP_CULL_REVEAL_REACH) return 'revealed';
  const imminent = propCullConsultImminent(inFog, boxDistSq, fogFar, state, gate);
  return gate.allow(state.key, imminent) ? 'revealed' : 'held';
}

/** One cullable the caller owns, with the live three object under it. */
export type PropCullable = PropCullBounds & PropCullRevealState & { obj: { visible: boolean } };

/** Latch a consult's answer on its state: 'revealed' ends the gate's part
 *  for good, 'held' ends the imminent window (see PropCullRevealState). */
export function latchPropCullReveal(state: PropCullRevealState, reveal: PropCullReveal): void {
  if (reveal === 'revealed') {
    if (!state.revealed) state.revealed = true;
  } else if (reveal === 'held') {
    state.held = true;
  }
}

function applyPropCullReveal(c: PropCullable, reveal: PropCullReveal): void {
  latchPropCullReveal(c, reveal);
  c.obj.visible = reveal === 'revealed';
}

/**
 * Per-frame entry for ONE cullable: cull, consult, latch and apply in one
 * pass with no allocation on the frame path (props.ts adapts its live three
 * objects structurally). No gate keeps the historical immediate reveal.
 * Use updatePropCullables for a whole list: same policy, plus the
 * nearest-first ordering of a frame's imminent consults.
 */
export function updatePropCullable(
  c: PropCullable,
  camX: number,
  camZ: number,
  fogFar: number,
  fogFarSq: number,
  gate: PropCullRevealGate | null | undefined,
): void {
  const boxDistSq = propCullBoxDistanceSq(c, camX, camZ);
  const inFog = propCullInFog(c, boxDistSq, camX, camZ, fogFar, fogFarSq);
  applyPropCullReveal(c, propCullReveal(inFog, boxDistSq, fogFar, c, gate));
}

/** Caller-owned scratch for updatePropCullables, built once per view so the
 *  per-frame pass allocates nothing, its comparator included. */
export interface PropCullPass {
  /** This frame's imminent cullable indices, sorted nearest first. */
  order: number[];
  /** Box distance squared, by cullable index, for the entries in `order`. */
  distSq: number[];
  compare: (a: number, b: number) => number;
}

export function newPropCullPass(): PropCullPass {
  const pass: PropCullPass = { order: [], distSq: [], compare: () => 0 };
  pass.compare = (a, b) => pass.distSq[a] - pass.distSq[b];
  return pass;
}

/**
 * Per-frame entry for the whole band list. Ordinary bands resolve in list
 * order, exactly as before; the IMMINENT ones (an arrival landing the camera
 * among several bands at once) are collected first and consulted NEAREST
 * FIRST, so their compiles queue in the order the player notices them. The
 * sort runs only on a frame carrying two or more of them.
 */
export function updatePropCullables(
  cullables: readonly PropCullable[],
  camX: number,
  camZ: number,
  fogFar: number,
  fogFarSq: number,
  gate: PropCullRevealGate | null | undefined,
  pass: PropCullPass,
): void {
  const { order, distSq } = pass;
  order.length = 0;
  for (let i = 0; i < cullables.length; i++) {
    const c = cullables[i];
    const boxDistSq = propCullBoxDistanceSq(c, camX, camZ);
    const inFog = propCullInFog(c, boxDistSq, camX, camZ, fogFar, fogFarSq);
    if (propCullConsultImminent(inFog, boxDistSq, fogFar, c, gate)) {
      distSq[i] = boxDistSq;
      order.push(i);
      continue;
    }
    applyPropCullReveal(c, propCullReveal(inFog, boxDistSq, fogFar, c, gate));
  }
  if (order.length > 1) order.sort(pass.compare);
  for (let n = 0; n < order.length; n++) {
    const index = order[n];
    const c = cullables[index];
    applyPropCullReveal(c, propCullReveal(true, distSq[index], fogFar, c, gate));
  }
}

// ---------------------------------------------------------------------------
// The hideables' arm: the same consult over a sphere footprint.
// ---------------------------------------------------------------------------

/** The historical hideable fog cull: the structure draws while its centre is
 *  within fogFar plus its bounding radius (`cull`); past that the whole
 *  group is dropped, shadow included. */
export function propHideableInFog(centerDistSq: number, cull: number, fogFar: number): boolean {
  const reach = fogFar + cull;
  return centerDistSq < reach * reach;
}

/** Squared XZ distance from the camera to the hideable's cull sphere surface
 *  (0 inside): the hideable's box distance for the reach floor and the near
 *  line. Costs a square root, so the callers below evaluate it only on a
 *  first-sight consult, never on the latched per-frame path. */
export function propHideableSurfaceDistSq(centerDistSq: number, cull: number): number {
  if (centerDistSq <= cull * cull) return 0;
  const surface = Math.sqrt(centerDistSq) - cull;
  return surface * surface;
}

/** Whether this frame's consult for the hideable would be IMMINENT (see
 *  propCullConsultImminent): answered without consulting anything, so a
 *  caller can collect the frame's imminent hideables and consult them
 *  nearest first. The cheap latches are read before the square root. */
export function propHideableConsultImminent(
  centerDistSq: number,
  cull: number,
  fogFar: number,
  state: PropCullRevealState,
  gate: PropCullRevealGate | null | undefined,
): boolean {
  if (state.revealed || state.held || !gate) return false;
  if (!propHideableInFog(centerDistSq, cull, fogFar)) return false;
  const surfaceDistSq = propHideableSurfaceDistSq(centerDistSq, cull);
  return propCullConsultImminent(true, surfaceDistSq, fogFar, state, gate);
}

/**
 * The per-frame decision for one hideable: 'hidden' past the fog reach,
 * 'revealed' once latched (or with no gate, the historical immediate flip,
 * which the caller latches), else the band consult over the surface
 * distance: instant inside PROP_CULL_REVEAL_REACH, imminent inside the near
 * line, held while the gate is cold. The caller latches the answer with
 * latchPropCullReveal and owns the group's visibility.
 */
export function propHideableReveal(
  centerDistSq: number,
  cull: number,
  fogFar: number,
  state: PropCullRevealState,
  gate: PropCullRevealGate | null | undefined,
): PropCullReveal {
  if (!propHideableInFog(centerDistSq, cull, fogFar)) return 'hidden';
  if (state.revealed || !gate) return 'revealed';
  return propCullReveal(true, propHideableSurfaceDistSq(centerDistSq, cull), fogFar, state, gate);
}
