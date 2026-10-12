// What a built set piece (a dungeon entrance: a gatehouse, a chapel) puts
// between the chase camera and the character, as plain numbers (pure,
// Three-free). A set piece hands its own collider rows; each becomes one box
// the eye-to-camera segment is tested against with the occluder-fade family's
// own test (occluder_fade_core.ts occluderSegmentHitsObb), so a set piece
// fades by the same rule as a building or a Duskfall gate rock.
// src/render/set_piece_occluders.ts is the registry that fades the meshes.
import { occluderSegmentHitsObb } from './occluder_fade_core';

/** A solid of the set piece in WORLD coordinates: a collider row's footprint
 *  and its visual top (the collider's cameraTopY). */
export interface SetPieceSolid {
  readonly type: 'obb' | 'circle';
  readonly x: number;
  readonly z: number;
  readonly hw?: number;
  readonly hd?: number;
  /** three.js rotation.y, the colliders' own convention. */
  readonly rot?: number;
  readonly r?: number;
  readonly topY: number;
}

export interface SetPieceOccluderBox {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  topY: number;
}

/** One occluder box per solid: an obb as it is, a round one (a tower drum, a
 *  heap) as the square round it, which errs toward fading a moment early. */
export function setPieceOccluderBox(solid: SetPieceSolid): SetPieceOccluderBox {
  if (solid.type === 'circle') {
    const r = solid.r ?? 0;
    return { x: solid.x, z: solid.z, hw: r, hd: r, rot: 0, topY: solid.topY };
  }
  return {
    x: solid.x,
    z: solid.z,
    hw: solid.hw ?? 0,
    hd: solid.hd ?? 0,
    rot: solid.rot ?? 0,
    topY: solid.topY,
  };
}

/** Whether any of the boxes stands between the eye and the camera (or holds
 *  either of them under its top). */
export function setPieceBoxesBlock(
  boxes: readonly SetPieceOccluderBox[],
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  camX: number,
  camY: number,
  camZ: number,
): boolean {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (
      occluderSegmentHitsObb(
        b.x,
        b.z,
        b.hw,
        b.hd,
        b.rot,
        b.topY,
        eyeX,
        eyeY,
        eyeZ,
        camX,
        camY,
        camZ,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** The middle of a set of boxes: where its fade programs are asked for ahead
 *  of the first occlusion (the family's prefetch radius is measured from it). */
export function setPieceBoxesCentre(
  boxes: readonly SetPieceOccluderBox[],
  out: { x: number; z: number },
): { x: number; z: number } {
  out.x = 0;
  out.z = 0;
  for (const b of boxes) {
    out.x += b.x / boxes.length;
    out.z += b.z / boxes.length;
  }
  return out;
}
