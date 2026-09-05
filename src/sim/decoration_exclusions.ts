/** Authored clearings remove only named scatter, never terrain anchors or heights.
 * Both collision and rendering consume this same deterministic placement gate. */
const EXCLUSIONS = [
  { x: 2.456450840458274, z: 211.33819991815835 },
  // The North Watch firing lanes: one ordinary tree obscured the middle lane.
  { x: 442.06173, z: 1003.16146 },
];

export function isExcludedDecoration(x: number, z: number): boolean {
  return EXCLUSIONS.some((point) => Math.hypot(x - point.x, z - point.z) < 1.2);
}
