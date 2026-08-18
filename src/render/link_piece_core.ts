/**
 * The piece cut of a compile gate: which nodes of a gated root link together
 * in ONE queue unit.
 *
 * A gate used to submit its whole root as one unit (one compileAsync of the
 * root, then the shadow arm). Drivers that compile a shader's source
 * synchronously at submission (Mesa on the Intel iGPU) then pay every
 * never-seen program of the root inside that one unit: a crowd of composed
 * players arriving in a live frame measured 500 to 711 ms of main thread on
 * its first `live-gate` unit, and the queue paces BETWEEN units, never inside
 * one. Three's compile() prepares materials only under the node it is given,
 * so compiling one node yields exactly that node's programs under the same
 * cache keys as compiling the root: cutting the root into one unit per
 * MATERIAL GROUP puts one program group per unit and hands the pacing back to
 * the queue.
 *
 * A group is the set of nodes sharing one material tuple, in traversal
 * order: a node whose tuple an earlier piece already covers joins that piece
 * (its own program variant may still differ, by skinning or instancing, so
 * every node of a piece is compiled, none is dropped), a node with a new
 * tuple opens the next piece, and a node without a material belongs to no
 * piece. Host-agnostic (RENDER_PURE_CORES, tests/architecture.test.ts): the
 * traversal and the tuple key come from the caller, so a plain Vitest drives
 * it with stubs and compile_gate_pieces.ts binds three's.
 */

export interface LinkPiece<M> {
  meshes: M[];
}

export interface LinkPieceOptions<R, M> {
  /** Visits every node under `root`, root included, in traversal order. */
  traverse(root: R, visit: (node: M) => void): void;
  /** The node's material tuple identity, or null when it carries none. */
  materialKey(node: M): string | null;
}

export function enumerateLinkPieces<R, M>(root: R, opts: LinkPieceOptions<R, M>): LinkPiece<M>[] {
  const pieces: LinkPiece<M>[] = [];
  const byKey = new Map<string, LinkPiece<M>>();
  opts.traverse(root, (node) => {
    const key = opts.materialKey(node);
    if (key === null) return;
    const piece = byKey.get(key);
    if (piece) {
      piece.meshes.push(node);
      return;
    }
    const opened: LinkPiece<M> = { meshes: [node] };
    byKey.set(key, opened);
    pieces.push(opened);
  });
  return pieces;
}

/** A material tuple's identity from its per-material ids, order kept: two
 *  meshes wearing the same materials in a different slot order draw
 *  different groups. */
export function materialTupleKey(ids: readonly string[]): string {
  return ids.join('|');
}

/** The queue label of one piece: the gate's own label (its kind stays the
 *  head, so the budget's per-kind estimate is unchanged) plus the piece
 *  index after the root name. */
export function linkPieceLabel(gateLabel: string, index: number): string {
  return `${gateLabel}:${index}`;
}
