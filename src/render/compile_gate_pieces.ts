// The three-side binding of the compile gate's piece cut (link_piece_core.ts):
// the material carriers of a gated root, grouped by material tuple, and the
// per-piece work the gate queue runs, one unit per group. Shared by the live
// entity gates (renderer.ts compileGate) and the streamed-decor reveal host
// (reveal_compile_host.ts): a town kit carries as many material groups as a
// composed crowd.

import type * as THREE from 'three';
import { enumerateLinkPieces, materialTupleKey } from './link_piece_core';

type MaterialCarrier = THREE.Object3D & {
  isMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isSprite?: boolean;
  material?: THREE.Material | THREE.Material[] | null;
};

/** Exactly the nodes three's compile() prepares a material for
 *  (WebGLRenderer.compile: mesh, points, line or sprite with a material), so
 *  the pieces together cover the same programs the whole-root compile did. */
function materialKeyOf(node: THREE.Object3D): string | null {
  const carrier = node as MaterialCarrier;
  if (!(carrier.isMesh || carrier.isPoints || carrier.isLine || carrier.isSprite)) return null;
  const material = carrier.material;
  if (!material) return null;
  return materialTupleKey(
    Array.isArray(material) ? material.map((item) => item.uuid) : [material.uuid],
  );
}

/** The gated root's material carriers, one array per material group, in
 *  traversal order. */
export function linkPiecesOf(target: THREE.Object3D): THREE.Object3D[][] {
  return enumerateLinkPieces<THREE.Object3D, THREE.Object3D>(target, {
    traverse: (root, visit) => root.traverse(visit),
    materialKey: materialKeyOf,
  }).map((piece) => piece.meshes);
}

/** One work function per piece: for each node of the piece, its colour
 *  compile then its shadow compile, through the host's own per-object arms.
 *  Nothing is reparented: each arm compiles the node in place. The first
 *  arm runs synchronously inside the work call, so the queue's syncMs (and
 *  the budget it feeds) sees the piece's compile prologue, as it saw the
 *  whole root's before. */
export function linkPieceWork(
  target: THREE.Object3D,
  compileColor: (node: THREE.Object3D) => Promise<unknown>,
  compileShadow: (node: THREE.Object3D) => Promise<unknown>,
): Array<() => Promise<unknown>> {
  return linkPiecesOf(target).map((nodes) => () => {
    let chain: Promise<unknown> = compileColor(nodes[0]).then(() => compileShadow(nodes[0]));
    for (const node of nodes.slice(1)) {
      chain = chain.then(() => compileColor(node)).then(() => compileShadow(node));
    }
    return chain;
  });
}
