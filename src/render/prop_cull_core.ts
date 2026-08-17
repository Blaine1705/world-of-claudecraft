// Per-object fog cull and first-reveal policy for the merged and instanced
// prop bands (props.ts cullables). A cullable is one world-spanning merged
// Mesh or InstancedMesh; its programs are shared with nothing the boot sweep
// is guaranteed to have compiled (a band entirely past the fog at boot is
// invisible to the visible-only sweep and to every prewarm group that misses
// its exact variant), so its FIRST fog reveal on a walking approach linked
// synchronously inside a live frame (the prod never-compiled world-content
// rows). The policy below is the props twin of town_reveal_core: the first
// reveal consults a reveal gate and holds while cold, EXCEPT when the band
// is already near the camera on that first consult (hearth, teleport:
// arrivals that ride the loading cover, whose warm pass links what it
// draws), because sim colliders would otherwise block movement against
// invisible props; a band the gate already holds stays held until the
// settle (PROP_CULL_REVEAL_NEAR_FRACTION explains why), down to the reach
// floor where colliders would be at arm's length (PROP_CULL_REVEAL_REACH).
// Once revealed, the
// gate is never consulted again: a fog re-entry is a plain cull flip. The
// gate itself arms at world entry, not under the curtain (props.ts
// setBandRevealGate).
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
  /** Latched once the gate held the band: from then on only the gate's
   *  settle reveals it, never the near escape (see propCullReveal). */
  held: boolean;
}

/** Structural subset of reveal_gate_core's RevealGateCore, so this core
 *  stays decoupled from the gate module. */
export interface PropCullRevealGate {
  allow(key: string): boolean;
}

/**
 * Bands closer than this fraction of the fog far plane reveal immediately on
 * their FIRST consult, gate or not. A walking approach meets a band at the
 * fog plane itself (dim, a few frames of hold are invisible); a cover
 * arrival lands the camera among bands that must exist at once. Half the fog
 * range keeps everything a player can reach before a compile settles
 * ungated. The escape never applies to a band the gate already holds: after
 * an arrival the fog opens over seconds, so a band held at the fog edge
 * would otherwise cross the near line while its compile is still in flight
 * and link cold anyway (measured as the raced-pending-link rows right after
 * an arrival reveal); once held, only the settle reveals it, down to the
 * reach floor below.
 */
export const PROP_CULL_REVEAL_NEAR_FRACTION = 0.5;

/**
 * The absolute floor of the hold, in yards of box distance: a band this
 * close to the camera reveals on every consult, held or not, gate or not.
 * The bands carry colliders (fences, the race arches and jumps, every
 * decoration footprint), and a hold is time-bounded only by the reveal
 * gate's watchdog, so a driver whose link takes seconds must never leave a
 * collider invisible at arm's length: the fairness contract is that decor
 * may arrive late, never that the player walks into nothing. Same distance
 * as the far-cell swap (one camera boom plus the largest footprint, see
 * prop_cell_core.ts PROP_FAR_SWAP_DISTANCE): inside it the props are the
 * player's immediate surroundings. It also floors the near escape when the
 * fog is clamped tight (the residency clamp after a cover), where half the
 * fog would be a few yards.
 */
export const PROP_CULL_REVEAL_REACH = 40;

/** The reveal-gate key of the band at `index` (its slot in the view's
 *  cullable list). The `cull:` prefix keeps the namespace disjoint from the
 *  far-cell grid keys (`propCellKey`, `<x>:<z>`) on the shared props gate. */
export function propCullKey(index: number): string {
  return `cull:${index}`;
}

/** The compile roots behind one props gate key: a far cell's bake meshes,
 *  or the one band object behind a cullable key, or nothing for a stranger
 *  (which the gate then settles at once, the fail-soft arm).
 *
 *  Neither consult reveals piecewise, unlike the towns. A band key is one
 *  root, so there is nothing to split. A far cell has several bake meshes but
 *  swaps as ONE representation (the near individuals hide as the bake shows),
 *  and revealing half a bake beside the individuals it replaces would draw
 *  that half twice. */
export function propRevealRoots<T>(
  farCells: { get(key: string): { meshes: readonly T[] } | undefined },
  bands: { get(key: string): { obj: T } | undefined },
  key: string,
): readonly T[] {
  const cell = farCells.get(key);
  if (cell) return cell.meshes;
  const band = bands.get(key);
  return band ? [band.obj] : [];
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
  const near = fogFar * PROP_CULL_REVEAL_NEAR_FRACTION;
  if (!state.held && boxDistSq <= near * near) return 'revealed';
  return gate.allow(state.key) ? 'revealed' : 'held';
}

/**
 * Per-frame entry: cull, consult, latch and apply in one pass with no
 * allocation on the frame path (props.ts adapts its live three objects
 * structurally). No gate keeps the historical immediate reveal.
 */
export function updatePropCullable(
  c: PropCullBounds & PropCullRevealState & { obj: { visible: boolean } },
  camX: number,
  camZ: number,
  fogFar: number,
  fogFarSq: number,
  gate: PropCullRevealGate | null | undefined,
): void {
  const boxDistSq = propCullBoxDistanceSq(c, camX, camZ);
  const inFog = propCullInFog(c, boxDistSq, camX, camZ, fogFar, fogFarSq);
  const reveal = propCullReveal(inFog, boxDistSq, fogFar, c, gate);
  if (reveal === 'revealed') {
    if (!c.revealed) c.revealed = true;
  } else if (reveal === 'held') {
    c.held = true;
  }
  c.obj.visible = reveal === 'revealed';
}
