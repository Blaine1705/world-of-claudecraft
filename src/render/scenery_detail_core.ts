// Geometry-only distance policy. No visibility, material or lighting decisions.
export type SceneryDetailLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type SceneryDetailBands = readonly [number, number, number, number, number];
export const SCENERY_DETAIL_EDGES = [60, 120, 240, 480] as const;

/** Hysteresis is outside the boundary: approaching always restores the finer
 * representation by its advertised distance, including the full-detail 60 yd. */
export function sceneryDetailLevel(
  distance: number,
  previous: number,
  bands: SceneryDetailBands,
): SceneryDetailLevel {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  let band = 0;
  while (band < SCENERY_DETAIL_EDGES.length) {
    const edge = SCENERY_DETAIL_EDGES[band];
    const margin = previous > bands[band] ? 0 : Math.min(8, edge * 0.05);
    if (distance <= edge + margin) break;
    band++;
  }
  return bands[band] as SceneryDetailLevel;
}

export interface SceneryRegion {
  xMin?: number;
  xMax?: number;
  zMin: number;
  zMax: number;
}

export function inSceneryRegion(x: number, z: number, region: SceneryRegion): boolean {
  return (
    x >= (region.xMin ?? -180) && x < (region.xMax ?? 180) && z >= region.zMin && z < region.zMax
  );
}

/** Error-bounded reductions keep the source vertex/UV/normal arrays intact.
 * Targets are aspirations; a surface that cannot simplify safely stays fuller. */
export function sceneryReduction(
  level: number,
  triangles: number,
  palm: boolean,
): {
  triangles: number;
  error: number;
} {
  const ratios = [1, 0.65, 0.3, 0.1, 0.025, 0.01];
  const floors = [0, 1024, 512, 128, 32, 12];
  const errors = [0, 0.002, 0.01, 0.03, 0.08, 0.15];
  const target = palm && level >= 2 ? Math.max(12, floors[level] / 2) : floors[level];
  return {
    triangles: Math.min(triangles, Math.max(target, Math.floor(triangles * ratios[level]))),
    error: errors[level],
  };
}
