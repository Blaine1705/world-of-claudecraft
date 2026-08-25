// Pure placement math for fitting fixed-length dungeon wall modules to authored
// wall segments. Keeping every module inside its segment prevents short pieces
// beside a doorway from visually covering the collision-free opening.

export interface AuthoredWallCell {
  center: number;
  length: number;
}

export interface AuthoredWallRun {
  axis: 'x' | 'z';
  fixed: number;
  a: number;
  b: number;
}

export interface AuthoredWallOccluderFootprint {
  x: number;
  z: number;
  hw: number;
  hd: number;
  topY: number;
}

/** Exact world-space footprint used by the camera fade for one collider-backed
 * authored wall run. */
export function authoredWallFootprint(
  segment: AuthoredWallRun,
  originX: number,
  originZ: number,
  wallHalfWidth: number,
  topY: number,
): AuthoredWallOccluderFootprint {
  const center = (segment.a + segment.b) / 2;
  const halfLength = (segment.b - segment.a) / 2;
  return segment.axis === 'x'
    ? {
        x: originX + center,
        z: originZ + segment.fixed,
        hw: halfLength,
        hd: wallHalfWidth,
        topY,
      }
    : {
        x: originX + segment.fixed,
        z: originZ + center,
        hw: wallHalfWidth,
        hd: halfLength,
        topY,
      };
}

export function fitAuthoredWallSegment(
  a: number,
  b: number,
  moduleLength: number,
): AuthoredWallCell[] {
  const length = Math.max(0, b - a);
  if (length === 0 || moduleLength <= 0) return [];
  const count = Math.max(1, Math.ceil(length / moduleLength));
  const cellLength = length / count;
  return Array.from({ length: count }, (_, index) => ({
    center: a + cellLength * (index + 0.5),
    length: cellLength,
  }));
}
