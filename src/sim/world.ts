import {
  CAMPS,
  DUNGEON_FLOOR_Y,
  DUNGEON_X_THRESHOLD,
  ROADS,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  ZONES,
} from './data';
import { fbm2, hash2, noise2 } from './rng';
import type { BiomeId } from './types';

// Terrain is a pure function of (x, z, seed): both the sim (ground clamping)
// and the renderer (mesh) sample the same heightfield, so they always agree.
//
// The world is a north-running strip of zone bands (see ZONES in data.ts).
// Each biome shapes the heightfield differently — the vale rolls, the marsh
// lies low and flat, the peaks tower — with smooth blends at the boundaries
// and a mountain ridge wall between zones, pierced by a road pass.

const HILL_SCALE = 0.013;
const DETAIL_SCALE = 0.05;

export const WATER_LEVEL = -4.5;

// Hill amplitude / base elevation / hub plateau height per biome.
const BIOME_SHAPE: Record<BiomeId, { hill: number; base: number; hubHeight: number }> = {
  vale: { hill: 26, base: 0, hubHeight: 1.5 },
  marsh: { hill: 11, base: -1.0, hubHeight: 1.2 },
  peaks: { hill: 34, base: 7, hubHeight: 9 },
  // The Veiled Hollow: a sheltered valley, gentler than the peaks that hide it.
  dusk: { hill: 14, base: 2, hubHeight: 2.5 },
  ember: { hill: 16, base: 2.5, hubHeight: 2.5 },
  frost: { hill: 26, base: 6, hubHeight: 3 },
  // the Amberfall: rolling autumn weald around the Great Mere
  amber: { hill: 15, base: 2, hubHeight: 2.5 },
};

// Ridge walls between zone bands, each opened by a road pass. A zone with
// sealedSouthBorder instead gets a taller, narrower wall with NO pass, its
// crest shifted into the sealed zone's own band so the southern neighbor's
// border content keeps (nearly) its original ground. Sealed zones are entered
// only through a portal (see portals content).
const ZONE_RIDGES: { z: number; passX: number; sealed: boolean }[] = [];
for (let i = 0; i + 1 < ZONES.length; i++) {
  const sealed = ZONES[i + 1].sealedSouthBorder === true;
  ZONE_RIDGES.push({
    z: ZONES[i].zMax + (sealed ? 15 : 0),
    passX: ZONES[i + 1].southPassX ?? 0,
    sealed,
  });
}
const RIDGE_HEIGHT = 22;
const RIDGE_SIGMA = 18; // gaussian width of the wall
// Sealed walls: tall and steep enough that the straight-approach gradient
// beats PLAYER_MAX_CLIMB_SLOPE everywhere along the border. The slope gate
// alone cannot seal a smooth wall (it projects rise along the movement
// direction, so a shallow-enough diagonal always sneaks under it); the crest
// line is therefore ALSO a hard movement wall in colliders.resolveMovement
// via crossesSealedBorder below. The terrain steepness is the fiction; the
// crossing check is the guarantee (guarded by tests/veiled_hollow.test.ts).
const SEALED_RIDGE_HEIGHT = 60;
const SEALED_RIDGE_SIGMA = 12;

// Crest z of every sealed border: an uncrossable line for swept movement.
// Portal teleports assign positions directly and are unaffected.
export const SEALED_BORDER_ZS: readonly number[] = ZONE_RIDGES.filter((r) => r.sealed).map(
  (r) => r.z,
);

export function crossesSealedBorder(z0: number, z1: number): boolean {
  for (const zc of SEALED_BORDER_ZS) {
    if ((z0 - zc) * (z1 - zc) < 0) return true;
  }
  return false;
}
const PASS_HALF_WIDTH = 10; // flat opening around the road
const PASS_SHOULDER = 34; // ...rising to full wall by this far from the pass

// The Veiled Hollow's organic relief, layered over the base FBM hills the
// same way the Mirefen crater is: gentle radial features that break the
// band's uniformity into highlands, a meadow bowl, and the falls terrace
// whose steep southern lip pours into Starfall Basin (the lake carve and the
// terrace overlap; the height step between them IS the waterfall cliff,
// dressed by render/realm_flora.ts).
export const HOLLOW_FALLS = {
  terrace: { x: 128, z: 1008, radius: 22, height: 9 },
  // where the lip meets the basin: the render waterfall hangs here
  lip: { x: 118, z: 995 },
} as const;
const HOLLOW_SHAPING = [
  {
    x: HOLLOW_FALLS.terrace.x,
    z: HOLLOW_FALLS.terrace.z,
    r: HOLLOW_FALLS.terrace.radius,
    h: HOLLOW_FALLS.terrace.height,
  },
  { x: -135, z: 1090, r: 45, h: 7 }, // western highlands (the Mirrormere sits in them)
  { x: 20, z: 1005, r: 35, h: -2.2 }, // soft meadow bowl south of the town road
  { x: -110, z: 1210, r: 28, h: 6 }, // a crescent knoll sheltering the Deep's north rings
] as const;

// ---------------------------------------------------------------------------
// The Hollow's coastline. The realm is an organic landmass in a dusk sea:
// a union of soft land lobes (peninsulas for the cave arrival, the western
// highlands, the Gleaming Deep, the northeast monument arm, the Starfall
// headland) minus carved bays. Terrain outside the coast sinks to a seabed,
// and the full-band water plane plus the map painter's blue do the rest, so
// the world map reads like a real continent silhouette instead of a square.
// Every fixed content point (camps, town, roads, ruins) sits on a lobe with
// margin; tests/veiled_hollow.test.ts asserts it stays that way.
// ---------------------------------------------------------------------------
// Keep in sync with REALM_ZONE.zMax (content/realm.ts): the band's northern
// stretch past the coast is open ocean.
const HOLLOW_ZMAX = 1440;
const HOLLOW_LAND_LOBES = [
  { x: 0, z: 1060, r: 155 }, // main body: town, meadow, court's west edge
  { x: -125, z: 1010, r: 85 }, // southwest: the Duskfall arrival and overlook
  { x: -140, z: 925, r: 55 }, // the sealed range's western shoulder
  { x: 10, z: 935, r: 90 }, // the sealed range's center and Elder Grove
  { x: 140, z: 925, r: 60 }, // the sealed range's eastern shoulder
  { x: -125, z: 1150, r: 75 }, // western highlands and the Mirrormere
  { x: -55, z: 1200, r: 75 }, // the Gleaming Deep's north rings
  { x: 95, z: 1150, r: 75 }, // the Crystalline Shallows
  { x: 150, z: 1215, r: 62 }, // the northeast arm (the forgotten monument)
  { x: 120, z: 995, r: 72 }, // the Starfall headland and falls terrace
  { x: 130, z: 1082, r: 48 }, // the Sunken Court peninsula
  // the Pale Causeway: a winding isthmus rooted in the north coast and
  // running across the ocean to the band edge, where a future realm will
  // one day connect (adjacent lobes overlap deeply so the spine is one
  // continuous, walkable landmass)
  { x: 0, z: 1250, r: 48 }, // the root, fused with the mainland coast
  { x: 30, z: 1300, r: 44 },
  { x: 48, z: 1355, r: 40 },
  { x: 44, z: 1420, r: 48 },
  // the western edge arm: a low coastal ridge along the map border that
  // encloses the old open water as the Mirrorshallow lake (the Rootway's
  // tunnel mouth sits in its cliffs)
  { x: 184, z: 1000, r: 50 },
  { x: 186, z: 1075, r: 52 },
  { x: 184, z: 1150, r: 50 },
] as const;
const HOLLOW_BAYS = [
  // (the old bight at {182,1038} became the Mirrorshallow: see the edge arm
  // lobes below, which enclose that water as a lake)
  { x: -178, z: 1062, r: 42 }, // the west inlet
  { x: -62, z: 1270, r: 50 }, // the north sound, west of the causeway root
  { x: -185, z: 1235, r: 46 }, // the northwest reach
] as const;
const HOLLOW_SEA_FLOOR = WATER_LEVEL - 5;

// >0 on land, <0 at sea; the coast is the soft zero crossing. One metaball
// evaluator shared by every northern realm's coastline (same math the Hollow
// shipped with, extracted verbatim when the Drakelands and the Frostveil
// added their own lobe tables).
type CoastBlob = { readonly x: number; readonly z: number; readonly r: number };
function metaballLandness(
  lobes: readonly CoastBlob[],
  bays: readonly CoastBlob[],
  x: number,
  z: number,
): number {
  let land = 0;
  for (const b of lobes) {
    const d2 = ((x - b.x) / b.r) ** 2 + ((z - b.z) / b.r) ** 2;
    if (d2 < 1) land += (1 - d2) ** 2;
  }
  for (const b of bays) {
    const d2 = ((x - b.x) / b.r) ** 2 + ((z - b.z) / b.r) ** 2;
    if (d2 < 1) land -= 1.4 * (1 - d2) ** 2;
  }
  return land - 0.06;
}

export function hollowLandness(x: number, z: number): number {
  return metaballLandness(HOLLOW_LAND_LOBES, HOLLOW_BAYS, x, z);
}

// ---------------------------------------------------------------------------
// The Drakelands' landmass: a gatewood shore fused to the causeway landing,
// widening into the desert body, then a broad volcanic belt spanning the far
// north (the Drakemaw range doubles as the sealed wall's footing where it
// meets land; over the flanks the range simply runs into the sea).
// ---------------------------------------------------------------------------
const DRAKE_ZMAX = 2040; // keep in sync with DRAKELANDS_ZONE.zMax
const EMBER_LAND_LOBES = [
  { x: 44, z: 1445, r: 40 }, // the causeway landing, fused across the border
  { x: 44, z: 1478, r: 52 }, // the Wyrmgate shore and Wyrmwatch
  { x: 0, z: 1520, r: 70 }, // the Gatewood
  { x: 90, z: 1540, r: 55 }, // eastern gatewood shore
  { x: 95, z: 1615, r: 55 }, // the Last Spring headland
  { x: -70, z: 1560, r: 60 }, // western gatewood shore
  { x: 20, z: 1650, r: 90 }, // the drying midlands
  { x: -80, z: 1700, r: 65 }, // Mirage Hollow's dune shelf
  { x: 110, z: 1690, r: 70 }, // eastern dunes
  { x: 105, z: 1770, r: 60 }, // Trollmoot's rise
  { x: 45, z: 1790, r: 55 }, // the dune saddle carrying the Trollmoot fork
  { x: -20, z: 1780, r: 85 }, // the Cinder Dunes' heart
  { x: 60, z: 1880, r: 80 }, // approach to the Drakemaw
  { x: 0, z: 1858, r: 45 }, // the saddle carrying the Snowline road
  { x: -70, z: 1870, r: 75 }, // the Bloodglass shelf
  { x: 0, z: 1975, r: 95 }, // the Drakemaw belt
  { x: 130, z: 1950, r: 60 }, // eastern volcanic spur
  { x: -140, z: 1960, r: 55 }, // western volcanic spur
  { x: 90, z: 2020, r: 70 }, // the rim belt, wide under the sealed range
  { x: -90, z: 2020, r: 70 },
  { x: 0, z: 2030, r: 80 },
] as const;
const EMBER_BAYS = [
  { x: -165, z: 1600, r: 50 }, // the west bight
  { x: 175, z: 1800, r: 55 }, // the east reach
  { x: -155, z: 1850, r: 40 }, // a western cove under the spur
] as const;

export function emberLandness(x: number, z: number): number {
  return metaballLandness(EMBER_LAND_LOBES, EMBER_BAYS, x, z);
}

// ---------------------------------------------------------------------------
// The Frostveil Reach: a snowbound island massif. Its south rim carries the
// sealed wall's footing (the Heartfrost side), the body climbs in terraced
// benches (frost shaping below), and the north coast meets the world's edge
// sea like the Hollow's does.
// ---------------------------------------------------------------------------
const FROST_ZMAX = 2560; // keep in sync with FROSTVEIL_ZONE.zMax
const FROST_LAND_LOBES = [
  { x: 0, z: 2060, r: 95 }, // the south rim: Heartfrost Cavern's shelf
  { x: -120, z: 2075, r: 60 }, // western wall footing
  { x: 120, z: 2075, r: 60 }, // eastern wall footing
  { x: 0, z: 2100, r: 85 }, // the rim benches
  { x: -40, z: 2230, r: 90 }, // the Icemantle massif
  { x: -30, z: 2158, r: 45 }, // the town shelf under Icemantle itself
  { x: 80, z: 2200, r: 75 }, // Glacier Tarn's shoulder
  { x: 30, z: 2270, r: 65 }, // the inner valley joining the tarn to the Steps
  { x: 20, z: 2350, r: 95 }, // the Aurora Steps
  { x: -100, z: 2320, r: 70 }, // the Shiverfen shelf
  { x: 120, z: 2390, r: 65 }, // the Howling Terraces
  { x: 0, z: 2470, r: 80 }, // the north crown
] as const;
const FROST_BAYS = [
  { x: 165, z: 2260, r: 55 }, // the east sound
  { x: -165, z: 2180, r: 50 }, // the west inlet
  { x: 60, z: 2545, r: 50 }, // the north cove
] as const;

export function frostLandness(x: number, z: number): number {
  return metaballLandness(FROST_LAND_LOBES, FROST_BAYS, x, z);
}

// ---------------------------------------------------------------------------
// The Amberfall: an autumn weald around the Great Mere, its south fringe
// carrying the sealed wall's footing, meadow shelves east and west, and a
// north crown meeting the world's end sea.
// ---------------------------------------------------------------------------
const AMBER_ZMAX = 3120; // keep in sync with AMBERFALL_ZONE.zMax
const AMBER_LAND_LOBES = [
  { x: -60, z: 2620, r: 70 }, // the Rootway arrival shelf
  { x: 20, z: 2650, r: 80 }, // the south weald
  { x: 100, z: 2690, r: 65 }, // Harvest Hollow's shelf
  { x: 55, z: 2725, r: 50 }, // the harvest road's field saddle
  { x: -90, z: 2750, r: 75 }, // the Gilded Orchard
  { x: -40, z: 2690, r: 55 }, // the Rootway road's meadow saddle
  { x: 0, z: 2780, r: 90 }, // Lanternmere's shore
  { x: 0, z: 2870, r: 95 }, // the Great Mere basin
  { x: -80, z: 2950, r: 70 }, // Cindermaple Rise
  { x: 95, z: 2960, r: 70 }, // the Monolith heath
  { x: 0, z: 3040, r: 85 }, // the north crown
] as const;
const AMBER_BAYS = [
  { x: 170, z: 2820, r: 55 }, // the east sound
  { x: -170, z: 2860, r: 55 }, // the west reach
  { x: 40, z: 3115, r: 45 }, // the north cove
] as const;

export function amberLandness(x: number, z: number): number {
  return metaballLandness(AMBER_LAND_LOBES, AMBER_BAYS, x, z);
}

// Same coast recipe; holds the sealed wall's footing at the south fringe.
function applyAmberCoast(x: number, z: number, h: number): number {
  if (z <= FROST_ZMAX || z > AMBER_ZMAX + 2) return h;
  const land = amberLandness(x, z);
  const t = smoothstep(0.02, 0.3, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = HOLLOW_SEA_FLOOR + (WATER_LEVEL - 1.1 - HOLLOW_SEA_FLOOR) * shelf;
  const out = floor + (h - floor) * t;
  const wallHold = 1 - smoothstep(2605, 2630, z);
  return out + (h - out) * wallHold;
}

// Sink everything beyond the coast to the seabed. The outer 10yd of the band
// keeps the containment rim (it rises from the water as border cliffs), and
// the sealed border band is fully inside land lobes so the wall never wets.
function applyHollowCoast(x: number, z: number, h: number): number {
  // the sea starts north of the sealed range: the realm's south is mountain,
  // its other shores are coast (and the wall never wets)
  if (z < 960 || z > HOLLOW_ZMAX + 2) return h;
  const land = hollowLandness(x, z);
  // a wide, gentle transition: a shallow near-shore shelf slopes into the
  // deep, so beaches ease into the water instead of dropping off a cliff
  const t = smoothstep(0.02, 0.3, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = HOLLOW_SEA_FLOOR + (WATER_LEVEL - 1.1 - HOLLOW_SEA_FLOOR) * shelf;
  let out = floor + (h - floor) * t;
  // The northern lowlands: everything past the mainland's north coast rides
  // low (dune country), so no bluff line interrupts the view over the open
  // sea. The rims add AFTER this, so the causeway tip's gate cap at the band
  // edge still rises as the one distant landmark.
  if (z > 1245) {
    const cap = 6.5;
    const ease = smoothstep(1245, 1268, z); // mainland shore eases into it
    if (out > cap) out = out + (cap + (out - cap) * 0.12 - out) * ease;
  }
  // The Westway: the crossing into the Amberfall is an open, flat meadow
  // corridor (no cave, no wall), the Wyrmgate recipe turned sideways: cap
  // the west-edge heights across the corridor band so the walk stays level.
  const westGate = smoothstep(138, 158, x) * (1 - smoothstep(18, 42, Math.abs(z - 1078)));
  if (westGate > 0 && out > 5) out = out + (5 + (out - 5) * 0.15 - out) * westGate;
  // Wave-cut ledges: coastal rock above the beach line breaks into stepped
  // terraces with noise-jittered edges, so bluffs meet the sea as rigid
  // cliff faces instead of smooth mounds. Confined to the shore band (the
  // interior fades out by landness) south of the northern lowlands; beaches
  // and the water itself sit below the height gate and stay gentle.
  if (z < 1245) {
    const coastW = smoothstep(0.02, 0.1, land) * (1 - smoothstep(0.3, 0.48, land));
    if (coastW > 0) {
      const lift = smoothstep(WATER_LEVEL + 1.5, WATER_LEVEL + 6, out);
      const fade = 1 - smoothstep(WATER_LEVEL + 20, WATER_LEVEL + 28, out);
      const w = 0.62 * coastW * lift * fade;
      if (w > 0) {
        const step = 4.2;
        const jit = (noise2(x * 0.13, z * 0.13, 77) - 0.5) * 2.2;
        const hh = out + jit;
        const base = Math.floor(hh / step) * step;
        const frac = (hh - base) / step;
        const ledge = base + step * Math.min(1, Math.max(0, (frac - 0.3) / 0.4));
        out = out + (ledge - out) * w;
      }
    }
  }
  return out;
}

// The Drakelands' coast, same recipe as the Hollow's. It fades OUT toward
// the volcanic rim belt (z past ~2010) so the Drakemaw range keeps its
// footing all the way across the band: over the flanks the sealed range
// simply runs down into the sea instead of being sunk by the coast.
function applyEmberCoast(x: number, z: number, h: number): number {
  if (z < HOLLOW_ZMAX - 2 || z > DRAKE_ZMAX) return h;
  const land = emberLandness(x, z);
  const t = smoothstep(0.02, 0.3, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = HOLLOW_SEA_FLOOR + (WATER_LEVEL - 1.1 - HOLLOW_SEA_FLOOR) * shelf;
  let out = floor + (h - floor) * t;
  // Continue the Hollow's northern-lowlands cap across the border (same
  // formula, easing off northward), so the Wyrmgate shore meets the causeway
  // at matching height and the land rises gradually into the gatewood.
  const capEase = 1 - smoothstep(1442, 1495, z);
  if (capEase > 0 && out > 6.5) out = out + (6.5 + (out - 6.5) * 0.12 - out) * capEase;
  return out;
}

// The Frostveil's coast. Fades IN north of the sealed wall's footing for the
// same reason (the wall crest sits at the band's south fringe).
function applyFrostCoast(x: number, z: number, h: number): number {
  if (z <= DRAKE_ZMAX || z > FROST_ZMAX + 2) return h;
  const land = frostLandness(x, z);
  const t = smoothstep(0.02, 0.3, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = HOLLOW_SEA_FLOOR + (WATER_LEVEL - 1.1 - HOLLOW_SEA_FLOOR) * shelf;
  let out = floor + (h - floor) * t;
  // The Snowline pass: a flat valley floor through the border mountains, the
  // Wyrmgate recipe again (hold a low cap over the corridor, easing off as
  // the road climbs into the benches).
  const passT = (1 - smoothstep(26, 52, Math.abs(x + 10))) * (1 - smoothstep(2090, 2150, z));
  if (passT > 0 && out > 7) out = out + (7 + (out - 7) * 0.15 - out) * passT;
  return out;
}

// The Drakemaw's volcano cones: raised shields with crater dips. The caldera
// floors sit well above the sea so they stay dry; the render layer pours the
// lava (ember features module).
export const EMBER_VOLCANOES = [
  { x: 30, z: 1940, r: 62, h: 27, craterR: 16, craterD: 13 }, // Drakemaw Caldera
  { x: -90, z: 1902, r: 40, h: 20, craterR: 8, craterD: 8 },
  { x: 140, z: 1990, r: 36, h: 18, craterR: 7, craterD: 7 },
  { x: -42, z: 2012, r: 30, h: 14, craterR: 0, craterD: 0 },
] as const;

// Open lava pools out in the wastes (shaped as shallow flat-floored basins;
// the render lava surface sits just above each floor).
export const EMBER_LAVA_POOLS = [
  { x: 30, z: 1940, r: 14 }, // inside the Drakemaw crater
  { x: 96, z: 1832, r: 12 },
  { x: -58, z: 1948, r: 11 },
] as const;
export const EMBER_LAVA_FLOOR = 2.2;

function emberShapingOffset(x: number, z: number, seed: number): number {
  if (z < HOLLOW_ZMAX - 10 || z > DRAKE_ZMAX + 40) return 0;
  let dh = 0;
  for (const v of EMBER_VOLCANOES) {
    const d = Math.hypot(x - v.x, z - v.z);
    if (d < v.r) {
      dh += v.h * (1 - smoothstep(v.r * 0.22, v.r, d));
      if (v.craterR > 0 && d < v.craterR * 1.5)
        dh -= v.craterD * (1 - smoothstep(v.craterR * 0.55, v.craterR * 1.5, d));
    }
  }
  // long low dune ridges across the open waste (stretched noise, north only)
  const duneT = smoothstep(1620, 1760, z) * (1 - smoothstep(1930, 1990, z));
  if (duneT > 0) dh += (fbm2(x * 0.018, z * 0.085, seed + 41, 2) - 0.5) * 5 * duneT;
  return dh;
}

// Flat-floored lava basins, carved after the cones so each pool floor is
// level (the same move the zone lakes make, at a higher floor).
function applyEmberLavaBasins(x: number, z: number, h: number): number {
  if (z < HOLLOW_ZMAX || z > DRAKE_ZMAX) return h;
  let out = h;
  for (const pool of EMBER_LAVA_POOLS) {
    const d = Math.hypot(x - pool.x, z - pool.z);
    if (d < pool.r * 1.7) {
      const blend = smoothstep(pool.r * 0.6, pool.r * 1.7, d);
      out = out * blend + EMBER_LAVA_FLOOR * (1 - blend);
    }
  }
  return out;
}

// The Frostveil's terraced benches: the whole massif steps into flats,
// ramps, and short steep risers (multi-level mountain ground). Suppressed
// near roads so every marked route stays climbable, and below the shore
// line so beaches ease into the sea.
function applyFrostTerraces(x: number, z: number, h: number): number {
  if (z <= DRAKE_ZMAX + 20 || z > FROST_ZMAX) return h;
  if (h < WATER_LEVEL + 2) return h;
  const road = roadDistance(x, z);
  if (road < 5) return h;
  const step = 6.5;
  const jit = (noise2(x * 0.045, z * 0.045, 88) - 0.5) * 3.4;
  const hh = h + jit;
  const base = Math.floor(hh / step) * step;
  const frac = (hh - base) / step;
  const ledge = base + step * Math.min(1, Math.max(0, (frac - 0.26) / 0.42));
  const w = 0.55 * smoothstep(WATER_LEVEL + 2, WATER_LEVEL + 5.5, h) * smoothstep(5, 12, road);
  return h + (ledge - h) * w;
}

// The northern realms' open sea (swim fatigue + rim suppression): far enough
// offshore that no land lobe reaches, near a true map border edge. The
// Hollow's north edge stopped being a border when the Drakelands landed
// beyond it, so only the x flanks bite there now; the Frostveil's far north
// is the world's actual end again.
export function inHollowOpenSea(x: number, z: number): boolean {
  if (z < 960 || x > 600) return false;
  // the Mirrorshallow: enclosed lake water, never open sea
  if (Math.hypot(x - 152, z - 1112) < 42) return false;
  if (z <= HOLLOW_ZMAX + 2) {
    const dEdge = Math.min(x + 180, 180 - x);
    return dEdge < 48 && hollowLandness(x, z) < 0.02;
  }
  if (z <= DRAKE_ZMAX) {
    const dEdge = Math.min(x + 180, 180 - x);
    return dEdge < 48 && emberLandness(x, z) < 0.02;
  }
  if (z <= FROST_ZMAX + 2) {
    const dEdge = Math.min(x + 180, 180 - x);
    return dEdge < 48 && frostLandness(x, z) < 0.02;
  }
  if (z <= AMBER_ZMAX + 2) {
    const dEdge = Math.min(x + 180, 180 - x, AMBER_ZMAX - z);
    return dEdge < 48 && amberLandness(x, z) < 0.02;
  }
  return false;
}

// Border pockets the mountain fringe must not swallow.
const HOLLOW_FRINGE_CLEARINGS = [
  { x: -140, z: 960, r: 34 }, // the Duskfall cave arrival and its road
  { x: -145, z: 1100, r: 30 }, // the Gleamstag's hidden clearing
  { x: 160, z: 1228, r: 26 }, // the forgotten monument
  { x: 46, z: 1380, r: 40 }, // the Pale Causeway's upper spine
  { x: 44, z: 1430, r: 42 }, // ...and its northern head
  { x: 168, z: 1078, r: 46 }, // the Westway corridor and the Mirrorshallow shore
] as const;

function hollowShapingOffset(x: number, z: number, seed: number): number {
  if (z < 905 || z > HOLLOW_ZMAX) return 0;
  let dh = 0;
  for (const f of HOLLOW_SHAPING) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) dh += f.h * (1 - smoothstep(f.r * 0.35, f.r, d));
  }
  // An organic mountain fringe: noise modulates how deep the border hills
  // bite into the band, so the walkable realm (and its map silhouette) is an
  // irregular hollow instead of a rectangle. Heights stay gentle (max ~20
  // over ~26yd, slope well under the climb gate) so nothing is walled off;
  // the map painter's rock tint above h~26 does the visual work.
  const dW = x + 180;
  const dE = 180 - x;
  // The Wyrmgate: the north fringe opens over the causeway head so the road
  // can walk out of the band into the Drakelands (the old sealed gate cap).
  const passOpen = 1 - smoothstep(12, 40, Math.abs(x - 44));
  const dN = HOLLOW_ZMAX - z + passOpen * 80;
  const dSide = Math.min(dW, dE, dN);
  if (dSide < 54) {
    // coarse lobes (wavelength ~80yd) bite 8..48yd into the band; height 34
    // crosses the map painter's rock tint so the silhouette reads as an
    // irregular mountain bowl instead of a frame. Content pockets near the
    // border (the cave arrival, the Gleamstag clearing, the forgotten
    // monument) damp the fringe so nothing gets buried.
    let bite = 8 + fbm2(x * 0.012 + 7, z * 0.012 - 3, seed + 47, 2) * 40;
    for (const keep of HOLLOW_FRINGE_CLEARINGS) {
      const d = Math.hypot(x - keep.x, z - keep.z);
      if (d < keep.r) bite = Math.min(bite, 8 + (d / keep.r) * 14);
    }
    // gentler than the first cut: lower crowns rising over a longer run
    dh += 24 * (1 - smoothstep(bite * 0.1, bite, dSide));
  }
  return dh;
}

export const MIREFEN_IMPACT_CRATER = {
  x: 149.5,
  z: 295,
  bowlRadius: 20,
  radius: 30,
  depth: 2.6,
  rimHeight: 0.95,
} as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function mirefenImpactCraterOffset(x: number, z: number): number {
  const dx = x - MIREFEN_IMPACT_CRATER.x;
  const dz = z - MIREFEN_IMPACT_CRATER.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= MIREFEN_IMPACT_CRATER.radius) return 0;

  const bowlT = d / MIREFEN_IMPACT_CRATER.bowlRadius;
  const bowl =
    d < MIREFEN_IMPACT_CRATER.bowlRadius
      ? -MIREFEN_IMPACT_CRATER.depth * (1 - smoothstep(0, 1, bowlT))
      : 0;

  const rimStart = MIREFEN_IMPACT_CRATER.bowlRadius * 0.82;
  if (d <= rimStart) return bowl;
  const rimT = (d - rimStart) / (MIREFEN_IMPACT_CRATER.radius - rimStart);
  const rim =
    MIREFEN_IMPACT_CRATER.rimHeight * smoothstep(0, 0.35, rimT) * (1 - smoothstep(0.72, 1, rimT));
  return bowl + rim;
}

// Blended biome shape at a given z. Zone interiors keep their exact shape;
// blends happen across ±~35yd windows at the band boundaries.
function shapeAt(z: number): { hill: number; base: number } {
  let hill = BIOME_SHAPE[ZONES[0].biome].hill;
  let base = BIOME_SHAPE[ZONES[0].biome].base;
  for (let i = 0; i + 1 < ZONES.length; i++) {
    const boundary = ZONES[i].zMax;
    const t = smoothstep(boundary - 30, boundary + 35, z);
    const next = BIOME_SHAPE[ZONES[i + 1].biome];
    hill = lerp(hill, next.hill, t);
    base = lerp(base, next.base, t);
  }
  return { hill, base };
}

function baseHeight(x: number, z: number, seed: number): number {
  const shape = shapeAt(z);
  let h =
    (fbm2(x * HILL_SCALE + 100, z * HILL_SCALE + 100, seed, 4) - 0.5) * shape.hill + shape.base;
  h += (fbm2(x * DETAIL_SCALE, z * DETAIL_SCALE, seed + 7, 2) - 0.5) * 2.2;
  // Flatten each zone's hub settlement into a plateau
  for (const zone of ZONES) {
    const dx = x - zone.hub.x,
      dz = z - zone.hub.z;
    const dHub = Math.sqrt(dx * dx + dz * dz);
    if (dHub < zone.hub.radius * 1.6) {
      const blend = smoothstep(zone.hub.radius * 0.7, zone.hub.radius * 1.6, dHub);
      h = h * blend + BIOME_SHAPE[zone.biome].hubHeight * (1 - blend);
    }
  }
  // Keep dry land everywhere: soft-floor low dips above the water level...
  const minLand = WATER_LEVEL + 1.4;
  if (h < minLand) h = minLand - (minLand - h) * 0.12;
  // ...except the carved lake basins
  for (const zone of ZONES) {
    for (const lake of zone.lakes) {
      const dLake = Math.sqrt((x - lake.x) ** 2 + (z - lake.z) ** 2);
      if (dLake < lake.radius * 1.6) {
        const lakeBlend = smoothstep(lake.radius * 0.55, lake.radius * 1.6, dLake);
        h = h * lakeBlend + (WATER_LEVEL - 4) * (1 - lakeBlend);
      }
    }
  }
  return h;
}

// Ground height including instanced dungeon floors (flat, far off-world).
export function groundHeight(x: number, z: number, seed: number): number {
  if (x > DUNGEON_X_THRESHOLD) return DUNGEON_FLOOR_Y;
  return terrainHeight(x, z, seed);
}

export function terrainHeight(x: number, z: number, seed: number): number {
  let h = baseHeight(x, z, seed);

  // Flatten each camp a little so mobs don't stand on cliffs
  for (const camp of CAMPS) {
    const dx = x - camp.center.x,
      dz = z - camp.center.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < camp.radius * 1.8) {
      const ch = baseHeight(camp.center.x, camp.center.z, seed);
      const blend = smoothstep(camp.radius * 0.8, camp.radius * 1.8, d);
      h = h * blend + ch * (1 - blend);
    }
  }

  // Mountain ridge walls between zones, pierced by the road pass (sealed
  // walls have no pass and only ever grow past their base height, so no
  // crest dip opens a climbable notch)
  for (const ridge of ZONE_RIDGES) {
    const sigma = ridge.sealed ? SEALED_RIDGE_SIGMA : RIDGE_SIGMA;
    const dz = Math.abs(z - ridge.z);
    if (dz < sigma * 3) {
      const profile = Math.exp(-(dz * dz) / (2 * sigma * sigma));
      const pass = ridge.sealed
        ? 1
        : smoothstep(PASS_HALF_WIDTH, PASS_SHOULDER, Math.abs(x - ridge.passX));
      // jagged crest so the wall reads as mountains, not a berm
      const crestNoise = (fbm2(x * 0.03, ridge.z * 0.03, seed + 19, 2) - 0.5) * 0.7;
      const crest = 1 + (ridge.sealed ? Math.abs(crestNoise) : crestNoise);
      const height = ridge.sealed ? SEALED_RIDGE_HEIGHT : RIDGE_HEIGHT;
      // The Hollow/Drakelands boundary ridge rises only where there is land
      // to carry it (the Wyrmgate mountains around the causeway head); over
      // the open sea the two realms' waters simply meet. Sealed walls are
      // never gated: the Drakemaw range runs down into the sea at its flanks.
      let seaGate = 1;
      if (!ridge.sealed && ridge.z >= HOLLOW_ZMAX) {
        seaGate = smoothstep(
          0.005,
          0.06,
          Math.max(hollowLandness(x, z), emberLandness(x, z), frostLandness(x, z)),
        );
      }
      h += height * crest * profile * pass * seaGate;
    }
  }

  h += mirefenImpactCraterOffset(x, z);
  h += hollowShapingOffset(x, z, seed);
  h += emberShapingOffset(x, z, seed);
  h = applyHollowCoast(x, z, h);
  h = applyEmberCoast(x, z, h);
  h = applyFrostCoast(x, z, h);
  h = applyAmberCoast(x, z, h);
  h = applyEmberLavaBasins(x, z, h);
  h = applyFrostTerraces(x, z, h);
  // World rims AFTER the coast, so the border ranges rise out of the sea
  // (mountains dipping into the ocean at the flanks) instead of being sunk
  // by it. The NORTH rim is suppressed over the Hollow's open sea: looking
  // out from the shore reads as water meeting sky, and swim fatigue (not a
  // wall) turns swimmers back before the band edge.
  let rimX = smoothstep(WORLD_MAX_X - 30, WORLD_MAX_X, Math.abs(x));
  // the Westway crossing stays open: no border range over the corridor
  if (x > 0 && z > 900) rimX *= smoothstep(18, 42, Math.abs(z - 1078));
  const rimS = smoothstep(WORLD_MIN_Z + 30, WORLD_MIN_Z, z);
  let rimN = smoothstep(WORLD_MAX_Z - 30, WORLD_MAX_Z, z);
  if (inHollowOpenSea(x, z)) {
    // no ranges over the open sea: the flanks read as water to the map edge
    // (swim fatigue, not a wall, turns swimmers back out there)
    rimX = 0;
    rimN = 0;
  }
  // inside the northern realms the remaining land rims stay softer than the
  // world's (their coasts and ranges do the framing; the old causeway gate
  // cap is now the Wyrmgate ridge with a real pass through it)
  const rimScale = z > 960 && z <= WORLD_MAX_Z ? 0.6 : 1;
  h += Math.max(rimX, rimS, rimN) * 40 * rimScale;
  return h;
}

// Distance from (x,z) to the nearest road polyline segment.
export function roadDistance(x: number, z: number): number {
  let best = Infinity;
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i],
        b = road[i + 1];
      const abx = b.x - a.x,
        abz = b.z - a.z;
      const apx = x - a.x,
        apz = z - a.z;
      const len2 = abx * abx + abz * abz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2)) : 0;
      const dx = apx - abx * t,
        dz = apz - abz * t;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) best = d;
    }
  }
  return best;
}

// Deterministic decoration placement (trees, rocks) — used by the renderer,
// kept here so it shares the seed and stays out of mob camps / hubs / roads /
// lakes. Density and mix vary by biome: the vale is wooded, the marsh sparse
// and scrubby, the peaks rocky with hardy pines.
export interface Decoration {
  kind: 'tree' | 'tree2' | 'rock';
  x: number;
  z: number;
  scale: number;
  variant: number;
  biome: BiomeId;
}

const DECORATION_EXCLUSION_RADIUS = 1.2;
const DECORATION_EXCLUSIONS = [{ x: 2.456450840458274, z: 211.33819991815835 }];

function isExcludedDecoration(x: number, z: number): boolean {
  return DECORATION_EXCLUSIONS.some(
    (p) => Math.hypot(x - p.x, z - p.z) < DECORATION_EXCLUSION_RADIUS,
  );
}

export function zoneBiomeAt(z: number): BiomeId {
  for (const zone of ZONES) {
    if (z < zone.zMax) return zone.biome;
  }
  return ZONES[ZONES.length - 1].biome;
}

export function generateDecorations(seed: number): Decoration[] {
  const out: Decoration[] = [];
  const step = 10;
  const xHalf = WORLD_MAX_X - 14;
  for (let gx = -xHalf; gx < xHalf; gx += step) {
    for (let gz = WORLD_MIN_Z + 14; gz < WORLD_MAX_Z - 14; gz += step) {
      const r = hash2(Math.round(gx), Math.round(gz), seed + 31);
      const biome = zoneBiomeAt(gz);
      // density gate + kind mix per biome
      let kind: Decoration['kind'] | null = null;
      if (biome === 'vale') {
        if (r > 0.48) continue;
        kind = r < 0.3 ? 'tree' : r < 0.4 ? 'tree2' : 'rock';
      } else if (biome === 'marsh') {
        if (r > 0.34) continue;
        kind = r < 0.08 ? 'tree' : r < 0.26 ? 'tree2' : 'rock';
      } else if (biome === 'dusk') {
        // the hollow is a glade: sparse pines, more twisted elders and stone;
        // the dense mushroom flora comes from ground dressing and realm props
        if (r > 0.38) continue;
        kind = r < 0.14 ? 'tree' : r < 0.28 ? 'tree2' : 'rock';
      } else if (biome === 'ember') {
        // the gatewood thins mile by mile into open waste: trees fade out
        // northward, scorched rock takes over
        const t = Math.max(0, Math.min(1, (gz - 1560) / 170));
        const treeGate = 0.36 * (1 - t) + 0.05 * t;
        if (r > treeGate + 0.12) continue;
        kind = r < treeGate * 0.55 ? 'tree' : r < treeGate ? 'tree2' : 'rock';
      } else if (biome === 'frost') {
        // hardy pines and broken stone on the snow benches
        if (r > 0.36) continue;
        kind = r < 0.18 ? 'tree' : r < 0.23 ? 'tree2' : 'rock';
      } else if (biome === 'amber') {
        // a dense fire-colored weald, broadleaf-heavy
        if (r > 0.5) continue;
        kind = r < 0.12 ? 'tree' : r < 0.42 ? 'tree2' : 'rock';
      } else {
        if (r > 0.44) continue;
        kind = r < 0.2 ? 'tree' : r < 0.24 ? 'tree2' : 'rock';
      }
      const ox = (hash2(Math.round(gx), Math.round(gz), seed + 57) - 0.5) * step;
      const oz = (hash2(Math.round(gx), Math.round(gz), seed + 91) - 0.5) * step;
      const x = gx + ox,
        z = gz + oz;
      if (isExcludedDecoration(x, z)) continue;
      let inHub = false;
      for (const zone of ZONES) {
        const dx = x - zone.hub.x,
          dz = z - zone.hub.z;
        if (Math.sqrt(dx * dx + dz * dz) < zone.hub.radius + 4) {
          inHub = true;
          break;
        }
      }
      if (inHub) continue;
      if (terrainHeight(x, z, seed) < WATER_LEVEL + 1) continue;
      if (roadDistance(x, z) < 5) continue;
      let inCamp = false;
      for (const c of CAMPS) {
        const dx = x - c.center.x,
          dz = z - c.center.z;
        if (Math.sqrt(dx * dx + dz * dz) < c.radius + 3) {
          inCamp = true;
          break;
        }
      }
      if (inCamp) continue;
      out.push({
        kind,
        x,
        z,
        scale: 0.7 + hash2(Math.round(gx), Math.round(gz), seed + 13) * 0.9,
        variant: Math.floor(hash2(Math.round(gx), Math.round(gz), seed + 77) * 3),
        biome,
      });
    }
  }
  return out;
}
