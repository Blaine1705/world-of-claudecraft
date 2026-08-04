// streetlamp_placement_core: where the streetlamps stand. Pure (no Three,
// no DOM), so the whole layout is a deterministic function of the road polylines,
// the zone hubs, and the caller-supplied probes, and a Vitest can assert spacing,
// clearance, and coverage without a renderer.
//
// Lamps line EVERY road end to end: the whole network is lit, not just a short
// walk out of each hub. Near a hub they stand at town spacing; on the open road
// they spread far apart, waymarkers on a maintained highway rather than a
// boulevard: sparse on purpose, so the wilderness still reads as wilderness.
//
// Roads arrive as sparse authored waypoints; src/sim/world.ts densifies and
// warps them into the curve the terrain splat actually paints, so a fixed
// offset from the raw chord can land a post ON the painted track (the meander
// swings the centre line by several yards). The caller therefore supplies a
// roadClear probe (the sim's roadDistance), and every post is nudged along the
// roadside normal until it sits inside a clearance band beside the REAL track:
// never on the road, never so far off it stops reading as a road lamp.

/** A zone hub: the town centre and the radius its plateau is flattened to. */
export interface LampTown {
  x: number;
  z: number;
  radius: number;
}

/** One lamp post, in world XZ. */
export interface LampSite {
  x: number;
  z: number;
  /** ground height at the post's foot, carried from the probe that vetted it */
  y: number;
  /** deterministic yaw so the lantern housings do not all face the same way */
  yaw: number;
}

export interface StreetlampPlan {
  sites: LampSite[];
}

export interface StreetlampPlanOptions {
  /** yards of road between consecutive lamps inside a town's reach */
  spacing?: number;
  /** yards between lamps on the open road, past every town's reach */
  openSpacing?: number;
  /** town reach = radius * reachScale + reachPad, in yards (spacing tier only) */
  reachScale?: number;
  reachPad?: number;
  /** first guess for how far a post sits off the raw chord centreline */
  offset?: number;
  /** the clearance band: a post must sit this far off the PAINTED road centre */
  clearMin?: number;
  clearMax?: number;
  /** yards per correction step while nudging a post into the band */
  nudgeStep?: number;
  /** correction steps before a spot is abandoned (junctions, switchbacks) */
  maxNudges?: number;
  /** two lamps closer together than this collapse to one (junctions) */
  minSeparation?: number;
  /** a site whose ground sits below this is over water or a void: dropped */
  minGroundY?: number;
}

const DEFAULTS = {
  spacing: 26,
  openSpacing: 64,
  reachScale: 1.6,
  reachPad: 60,
  offset: 3.8,
  clearMin: 3.0,
  clearMax: 5.6,
  nudgeStep: 0.45,
  maxNudges: 8,
  minSeparation: 8,
  minGroundY: -3,
};

export interface StreetlampProbes {
  /** ground height at a world XZ (the sim's terrainHeight, bound to the seed) */
  groundAt(x: number, z: number): number;
  /** true when a prop, building, or collider already owns this spot */
  blocked(x: number, z: number): boolean;
  /** deterministic 0..1 roll for a world XZ (the shared propPlacementRoll) */
  roll(x: number, z: number, n: number): number;
  /** distance from a world XZ to the PAINTED road centre (the sim's roadDistance) */
  roadClear(x: number, z: number): number;
}

/**
 * Lay out the whole network's streetlamps.
 *
 * Walks each road polyline by CUMULATIVE arc length rather than restarting the
 * step at every waypoint, so lamps stay evenly spaced instead of bunching up
 * wherever the authored road happens to have a dense corner. Sides alternate
 * down the run, which is what makes a lit road read as a road rather than as a
 * fence. Each post is then slid along the roadside normal until the roadClear
 * probe agrees it stands beside the painted track, not on it.
 */
export function planStreetlamps(
  roads: readonly (readonly { x: number; z: number }[])[],
  towns: readonly LampTown[],
  probes: StreetlampProbes,
  options: StreetlampPlanOptions = {},
): StreetlampPlan {
  const spacing = options.spacing ?? DEFAULTS.spacing;
  const openSpacing = options.openSpacing ?? DEFAULTS.openSpacing;
  const reachScale = options.reachScale ?? DEFAULTS.reachScale;
  const reachPad = options.reachPad ?? DEFAULTS.reachPad;
  const offset = options.offset ?? DEFAULTS.offset;
  const clearMin = options.clearMin ?? DEFAULTS.clearMin;
  const clearMax = options.clearMax ?? DEFAULTS.clearMax;
  const nudgeStep = options.nudgeStep ?? DEFAULTS.nudgeStep;
  const maxNudges = options.maxNudges ?? DEFAULTS.maxNudges;
  const minSeparation = options.minSeparation ?? DEFAULTS.minSeparation;
  const minGroundY = options.minGroundY ?? DEFAULTS.minGroundY;
  const minSepSq = minSeparation * minSeparation;

  const reachSq = towns.map((town) => {
    const reach = town.radius * reachScale + reachPad;
    return reach * reach;
  });
  const inTownReach = (x: number, z: number): boolean => {
    for (let i = 0; i < towns.length; i++) {
      const dx = x - towns[i].x;
      const dz = z - towns[i].z;
      if (dx * dx + dz * dz <= reachSq[i]) return true;
    }
    return false;
  };

  const sites: LampSite[] = [];
  // Junction dedupe: roads cross and share endpoints anywhere on the map now,
  // so separation is checked against EVERY placed lamp through a coarse grid
  // (cell = minSeparation, so only the 3x3 neighbourhood can conflict).
  const grid = new Map<number, number[]>();
  const cellKey = (cx: number, cz: number): number => cx * 73856093 + cz * 19349663;
  const cellOf = (v: number): number => Math.floor(v / minSeparation);
  const tooClose = (x: number, z: number): boolean => {
    const cx = cellOf(x);
    const cz = cellOf(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = grid.get(cellKey(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const index of bucket) {
          const sx = sites[index].x - x;
          const sz = sites[index].z - z;
          if (sx * sx + sz * sz < minSepSq) return true;
        }
      }
    }
    return false;
  };
  const remember = (index: number): void => {
    const key = cellKey(cellOf(sites[index].x), cellOf(sites[index].z));
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  };

  for (const road of roads) {
    if (road.length < 2) continue;
    let stepIndex = 0;
    // distance along the polyline still owed before the next lamp
    let carried = spacing * 0.5;
    for (let i = 0; i + 1 < road.length; i++) {
      const a = road[i];
      const b = road[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len <= 1e-6) continue;
      const ux = dx / len;
      const uz = dz / len;
      // the roadside normal, so a lamp stands beside the track, not on it
      const nx = -uz;
      const nz = ux;
      let d = carried;
      while (d < len) {
        const onX = a.x + ux * d;
        const onZ = a.z + uz * d;
        const sideSign = stepIndex % 2 === 0 ? 1 : -1;
        stepIndex++;
        // The next step length is decided at the SAMPLE point, so the town
        // tier is a property of where the road is, not of what got placed.
        d += inTownReach(onX, onZ) ? spacing : openSpacing;

        let x = onX + nx * sideSign * offset;
        let z = onZ + nz * sideSign * offset;
        // Slide along the normal until the post stands inside the clearance
        // band beside the PAINTED road (the meander moves it off the chord).
        let clear = probes.roadClear(x, z);
        let nudges = 0;
        while ((clear < clearMin || clear > clearMax) && nudges < maxNudges) {
          const step = clear < clearMin ? nudgeStep : -nudgeStep;
          x += nx * sideSign * step;
          z += nz * sideSign * step;
          clear = probes.roadClear(x, z);
          nudges++;
        }
        if (clear < clearMin || clear > clearMax) continue;
        if (tooClose(x, z)) continue;
        const y = probes.groundAt(x, z);
        if (y < minGroundY) continue;
        if (probes.blocked(x, z)) continue;
        sites.push({ x, y, z, yaw: probes.roll(x, z, 31) * Math.PI * 2 });
        remember(sites.length - 1);
      }
      // carry the unspent remainder into the next chord so the spacing runs
      // continuously along the whole polyline
      carried = d - len;
    }
  }
  return { sites };
}

/**
 * Which lamps carry a real point light. The forward renderer keeps only
 * `GFX.maxPointLights` lights alive at once (renderer.ts budgetFireLights), and
 * campfires, braziers, and quest glows already compete for those slots, so
 * lighting every post would starve them and light nothing extra. Every OTHER
 * lamp still carries its HDR emissive lantern, and its ground light comes from
 * the night light field on the tiers that splice it (every lamp joins the
 * field) or the draped fallback pool elsewhere; the real lights only add the
 * falloff on nearby characters and props. Same rule as frost_sky.ts's
 * Icemantle lanterns, named and tested here so the stride is not a magic
 * modulo buried in a build loop.
 */
export const LAMP_LIGHT_STRIDE = 3;

export function lampCarriesLight(indexInZone: number): boolean {
  return indexInZone % LAMP_LIGHT_STRIDE === 0;
}
