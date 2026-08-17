// Town static-cull first-reveal policy (hitch-hunt P3a), shared by the
// Eastbrook and Fenbridge views. The static batches' FIRST fog-cull reveal
// waits for a reveal gate so a walking approach never links the town's
// programs inside a live frame; but a camera already among the buildings
// (login, hearth, teleport: arrivals that ride the loading cover, whose zone
// prepare compiles the scene) must NEVER be held, because the sim colliders
// would block movement against invisible walls. Once revealed, the gate is
// never consulted again.
//
// A town key is the widest one in the game: every static batch plus every
// building group, dozens of independent subtrees behind one hold. Waiting for
// the slowest of them and then flipping all of them visible in one frame is
// the very first-draw burst the gate exists to prevent, so the hold is
// PIECEWISE: while the key is held, each root reveals as its own compile
// lands (reveal_gate_core rootReady), nearest to the camera first, and at
// most TOWN_PIECEWISE_REVEALS_PER_FRAME per frame so a burst of links cannot
// concatenate back into one frame. A root once shown is never hidden again by
// this policy: numPointLights is in three's program cache key, so a hide and
// re-show between frames links fresh programs, which is the cost being
// avoided. The key-level answer is unchanged, and it still wins: warm reveals
// everything, fog-hidden hides everything.
//
// Pure core contract: no three import, no DOM, no clocks, no randomness.
// Registered in RENDER_PURE_CORES (tests/architecture.test.ts); tested by
// tests/town_reveal_core.test.ts.

export interface TownRevealGate {
  allow(key: string): boolean;
  /** Per-root readiness (reveal_gate_core). A gate without it keeps the
   *  historical all-or-nothing hold. */
  rootReady?(key: string, root: object): boolean;
  /** Telemetry hook: this root revealed before its key warmed. */
  noteRootRevealed?(key: string): void;
}

/**
 * 'hidden': the fog cull hides the batches this frame (the caller's revealed
 * latch is untouched either way). 'held': first reveal deferred by the gate,
 * batches stay hidden. 'revealed': batches visible; the caller latches so
 * the gate is never consulted again.
 */
export type TownStaticReveal = 'hidden' | 'held' | 'revealed';

export function townStaticReveal(
  fogVisible: boolean,
  alreadyRevealed: boolean,
  camDistSqToCenter: number,
  cullRadius: number,
  gate: TownRevealGate | null,
  key: string,
): TownStaticReveal {
  if (!fogVisible) return 'hidden';
  if (alreadyRevealed) return 'revealed';
  const insideTown = camDistSqToCenter <= cullRadius * cullRadius;
  if (insideTown || gate === null || gate.allow(key)) return 'revealed';
  return 'held';
}

/**
 * How many held roots may flip visible in one frame. Small on purpose: the
 * compiles land one at a time in the shared queue, so the cap only bites when
 * several settle together, which is exactly the burst worth spreading.
 */
export const TOWN_PIECEWISE_REVEALS_PER_FRAME = 2;

/** The town's per-root reveal state, built once beside its roots list. */
export interface TownPiecewiseReveal {
  key: string;
  roots: readonly object[];
  /** World XZ anchor per root, for the nearest-first order. */
  x: Float32Array;
  z: Float32Array;
  /** 1 once the root at that slot has been shown; never cleared. */
  revealed: Uint8Array;
}

/** Roots past the end of `x`/`z` anchor at the town centre, which is the
 *  honest answer for a batch that spans the whole town. */
export function newTownPiecewiseReveal(
  key: string,
  roots: readonly object[],
  x: readonly number[],
  z: readonly number[],
): TownPiecewiseReveal {
  const state: TownPiecewiseReveal = {
    key,
    roots,
    x: new Float32Array(roots.length),
    z: new Float32Array(roots.length),
    revealed: new Uint8Array(roots.length),
  };
  for (let index = 0; index < roots.length; index++) {
    state.x[index] = x[index] ?? 0;
    state.z[index] = z[index] ?? 0;
  }
  return state;
}

/**
 * Flip the nearest ready roots of a held key, up to the per-frame budget.
 * Returns how many flipped. Allocation-free: the selection is a bounded
 * k-smallest scan over the caller-owned arrays, never a sort of a fresh list.
 */
export function townPiecewiseRevealInto(
  state: TownPiecewiseReveal,
  reveal: TownStaticReveal,
  camX: number,
  camZ: number,
  gate: TownRevealGate | null | undefined,
): number {
  if (reveal !== 'held') return 0;
  if (!gate || typeof gate.rootReady !== 'function') return 0;
  const { key, roots, revealed } = state;
  let flipped = 0;
  while (flipped < TOWN_PIECEWISE_REVEALS_PER_FRAME) {
    let best = -1;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (let index = 0; index < roots.length; index++) {
      if (revealed[index] === 1) continue;
      const dx = state.x[index] - camX;
      const dz = state.z[index] - camZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= bestDistSq) continue;
      if (!gate.rootReady(key, roots[index])) continue;
      best = index;
      bestDistSq = distSq;
    }
    if (best < 0) break;
    revealed[best] = 1;
    flipped++;
    gate.noteRootRevealed?.(key);
  }
  return flipped;
}

/** What the caller writes to the root's own visibility, on top of whatever
 *  cull or fade that root already answers for. */
export function townRootVisible(
  reveal: TownStaticReveal,
  state: TownPiecewiseReveal,
  index: number,
): boolean {
  if (reveal === 'hidden') return false;
  if (reveal === 'revealed') return true;
  return state.revealed[index] === 1;
}
