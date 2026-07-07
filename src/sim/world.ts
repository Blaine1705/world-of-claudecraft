import {
  CAMPS,
  COLUMN_ZONES,
  columnBlendAt,
  DUNGEON_FLOOR_Y,
  DUNGEON_X_THRESHOLD,
  ROADS,
  STRIP_MAX_X,
  STRIP_MIN_X,
  STRIP_ZONES,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  worldXBoundsAt,
  ZONES,
} from './data';
import { fbm2, hash2, noise2 } from './rng';
import type { BiomeId, ZoneDef } from './types';

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
  // the Willowfen: low, wet, and gentle
  fen: { hill: 8, base: -0.3, hubHeight: 2 },
  // the Nightbloom: soft moonlit downs, a touch more rolling than the fen
  night: { hill: 12, base: 1, hubHeight: 2.5 },
  // the Wraithwood: low haunted forest floor under the giant canopies
  haunt: { hill: 13, base: 1.5, hubHeight: 2.5 },
  // the Palmreach: low tropical relief, the coasts flattened to beach by
  // the jungle coast applier
  jungle: { hill: 11, base: 1.2, hubHeight: 2 },
  // the Evergarden: groomed parkland, gentle as a lawn
  garden: { hill: 9, base: 1.8, hubHeight: 2 },
  // the Galecrest: rolling wind-scoured headland downs over sea cliffs
  gale: { hill: 14, base: 2.4, hubHeight: 2.5 },
};

// Ridge walls along every shared zone edge, each opened by a road pass. A
// zone with sealedSouthBorder instead gets a taller, narrower wall with NO
// pass, its crest shifted into the sealed zone's own band so the southern
// neighbor's border content keeps (nearly) its original ground. Sealed
// zones are entered only through a portal (see portals content).
//
// The world is a GRID of zone rectangles (see data.ts zoneAt): horizontal
// edges separate north-south neighbors (the classic band borders) and
// vertical edges separate east-west columns with the same math rotated a
// quarter turn. An edge that spans its whole world row keeps the classic
// unbounded ridge (byte-identical to the strip era); a partial edge
// feathers to nothing past its span ends.
export interface BorderEdge {
  kind: 'h' | 'v';
  at: number; // the edge line: z for 'h', x for 'v'
  lo: number; // span start along the edge (x for 'h', z for 'v')
  hi: number; // span end
  fullRow: boolean; // spans the whole world row: no end feather
  passAt: number; // pass coordinate along the span
  sealed: boolean;
}

/** All shared edges between adjacent zone rects (pure; exported for tests). */
export function computeBorderEdges(zones: readonly ZoneDef[]): BorderEdge[] {
  const zx0 = (zn: ZoneDef) => zn.xMin ?? STRIP_MIN_X;
  const zx1 = (zn: ZoneDef) => zn.xMax ?? STRIP_MAX_X;
  const edges: BorderEdge[] = [];
  for (const a of zones) {
    for (const b of zones) {
      // horizontal edge: b sits directly north of a, rects overlapping in x
      if (a.zMax === b.zMin) {
        const lo = Math.max(zx0(a), zx0(b));
        const hi = Math.min(zx1(a), zx1(b));
        if (hi - lo > 1) {
          const sealed = b.sealedSouthBorder === true;
          // full row = nothing in either adjacent row lies beyond this span
          const fullRow =
            zones.every((zn) => zn.zMin !== b.zMin || (zx0(zn) >= lo && zx1(zn) <= hi)) &&
            zones.every((zn) => zn.zMax !== a.zMax || (zx0(zn) >= lo && zx1(zn) <= hi));
          edges.push({
            kind: 'h',
            at: a.zMax + (sealed ? 15 : 0),
            lo,
            hi,
            fullRow,
            passAt: b.southPassX ?? 0,
            sealed,
          });
        }
      }
      // vertical edge: b sits directly east of a, rects overlapping in z
      if (zx1(a) === zx0(b)) {
        const lo = Math.max(a.zMin, b.zMin);
        const hi = Math.min(a.zMax, b.zMax);
        if (hi - lo > 1) {
          edges.push({
            kind: 'v',
            at: zx1(a),
            lo,
            hi,
            fullRow: false, // a column border never spans the world's full z
            passAt: b.westPassZ ?? a.eastPassZ ?? (lo + hi) / 2,
            sealed: false,
          });
        }
      }
    }
  }
  return edges;
}

const BORDER_EDGES: readonly BorderEdge[] = computeBorderEdges(ZONES);
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
export const SEALED_BORDER_ZS: readonly number[] = BORDER_EDGES.filter(
  (e) => e.kind === 'h' && e.sealed,
).map((e) => e.at);

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
  // the Tablecrag's bulk (its flat crown is leveled after the rims, below)
  { x: -170, z: 1195, r: 46, h: 12 },
  // ...and its southern sister over the old inlet
  { x: -168, z: 1075, r: 38, h: 10 },
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
  { x: 20, z: 1172, r: 38 }, // the Deep road's shoulder (organic-warp dip)
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
  // encloses the old open water as the Mirrorshallow lake
  { x: 184, z: 1000, r: 50 },
  { x: 186, z: 1075, r: 52 },
  { x: 184, z: 1150, r: 50 },
  // the eastern highland shoulder: the old bay is filled and the Tablecrag
  // (a flat-topped mesa, see HOLLOW_SHAPING) rises over the Deep's flank
  { x: -178, z: 1190, r: 60 },
  { x: -180, z: 1255, r: 48 },
  { x: -176, z: 1080, r: 55 }, // ...and its southern reach over the old inlet
] as const;
const HOLLOW_BAYS = [
  // (the old bight at {182,1038} became the Mirrorshallow: see the edge arm
  // lobes below, which enclose that water as a lake)
  { x: -62, z: 1270, r: 50 }, // the north sound, west of the causeway root
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
  // Organic coastlines: the raw metaball union reads as connecting circles,
  // so the sample position is domain-warped by fixed-seed fbm (bending the
  // blobs into peninsulas and coves) and the result gets a higher-frequency
  // raggedness term (small capes and inlets). The seeds are CONSTANTS, not
  // the world seed: landness must stay a pure fn of (x, z) because content
  // tables, tests, and the sim's open-sea check were all placed against it.
  const wx = x + (fbm2(x * 0.015, z * 0.015, 9101, 3) - 0.5) * 46;
  const wz = z + (fbm2(x * 0.015 + 73, z * 0.015 - 41, 9103, 3) - 0.5) * 46;
  let land = 0;
  for (const b of lobes) {
    const d2 = ((wx - b.x) / b.r) ** 2 + ((wz - b.z) / b.r) ** 2;
    if (d2 < 1) land += (1 - d2) ** 2;
  }
  for (const b of bays) {
    const d2 = ((wx - b.x) / b.r) ** 2 + ((wz - b.z) / b.r) ** 2;
    if (d2 < 1) land -= 1.4 * (1 - d2) ** 2;
  }
  land += (fbm2(x * 0.05, z * 0.05, 9107, 2) - 0.5) * 0.2;
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
  { x: -118, z: 1700, r: 42 }, // the Snowline crossing's waste-side shoulder
  { x: -152, z: 1700, r: 40 }, // ...carried to the column border
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
const FROST_ZMAX = 1960; // keep in sync with FROSTVEIL_ZONE.zMax (west column)
const FROST_LAND_LOBES = [
  { x: -360, z: 1460, r: 95 }, // the south rim: Heartfrost Cavern's shelf
  { x: -480, z: 1475, r: 60 }, // western wall footing
  { x: -240, z: 1475, r: 60 }, // eastern wall footing
  { x: -360, z: 1500, r: 85 }, // the rim benches
  { x: -400, z: 1630, r: 90 }, // the Icemantle massif
  { x: -390, z: 1558, r: 45 }, // the town shelf under Icemantle itself
  { x: -280, z: 1600, r: 75 }, // Glacier Tarn's shoulder
  { x: -330, z: 1670, r: 65 }, // the inner valley joining the tarn to the Steps
  { x: -340, z: 1750, r: 95 }, // the Aurora Steps
  { x: -460, z: 1720, r: 70 }, // the Shiverfen shelf
  { x: -240, z: 1790, r: 65 }, // the Howling Terraces
  { x: -360, z: 1870, r: 80 }, // the north crown
  { x: -350, z: 1945, r: 50 }, // the Goldmelt corridor's south footing
  { x: -214, z: 1700, r: 44 }, // the Snowline crossing's ice-side shoulder
  { x: -252, z: 1700, r: 42 }, // ...rising onto the benches
  { x: -306, z: 1638, r: 42 }, // the crossing road's bench shoulder
  { x: -262, z: 1672, r: 40 }, // ...stepping down toward the border
  { x: -274, z: 1824, r: 42 }, // the terrace road's north shoulder
  { x: -318, z: 1674, r: 40 }, // the tarn road's southern loop
  { x: -282, z: 1694, r: 38 }, // ...meeting the crossing shoulder
] as const;
const FROST_BAYS = [
  { x: -195, z: 1660, r: 55 }, // the east sound
  { x: -525, z: 1580, r: 50 }, // the west inlet
  { x: -300, z: 1945, r: 50 }, // the north cove
] as const;

export function frostLandness(x: number, z: number): number {
  return metaballLandness(FROST_LAND_LOBES, FROST_BAYS, x, z);
}

// ---------------------------------------------------------------------------
// The Amberfall: an autumn weald around the Great Mere, its south fringe
// carrying the sealed wall's footing, meadow shelves east and west, and a
// north crown meeting the world's end sea.
// ---------------------------------------------------------------------------
const AMBER_ZMAX = 2600; // keep in sync with AMBERFALL_ZONE.zMax
const AMBER_LAND_LOBES = [
  { x: 10, z: 2070, r: 60 }, // the Goldmelt pass mouth
  { x: -60, z: 2100, r: 70 }, // the arrival shelf west of the pass
  { x: 20, z: 2130, r: 80 }, // the south weald
  { x: 100, z: 2170, r: 65 }, // Harvest Hollow's shelf
  { x: 55, z: 2205, r: 50 }, // the harvest road's field saddle
  { x: -90, z: 2230, r: 75 }, // the Gilded Orchard
  { x: -40, z: 2170, r: 55 }, // the Rootway road's meadow saddle
  { x: 0, z: 2260, r: 90 }, // Lanternmere's shore
  { x: 0, z: 2350, r: 95 }, // the Great Mere basin
  { x: -80, z: 2430, r: 70 }, // Cindermaple Rise
  { x: 95, z: 2440, r: 70 }, // the Monolith heath
  { x: 0, z: 2520, r: 85 }, // the north crown
  { x: -20, z: 2575, r: 55 }, // the Amberfen Steps' northern footing
  { x: 92, z: 2452, r: 40 }, // the mere lurkers' reeded shore
] as const;
const AMBER_BAYS = [
  { x: 170, z: 2300, r: 55 }, // the east sound
  { x: -170, z: 2340, r: 55 }, // the west reach
  { x: 40, z: 2595, r: 45 }, // the north cove
] as const;

export function amberLandness(x: number, z: number): number {
  return metaballLandness(AMBER_LAND_LOBES, AMBER_BAYS, x, z);
}

// ---------------------------------------------------------------------------
// The Willowfen: a low green wetland platter, widest of the north realms,
// its coasts gentle everywhere (no cliffs in a fen).
// ---------------------------------------------------------------------------
const FEN_ZMAX = 3120; // keep in sync with WILLOWFEN_ZONE.zMax
const FEN_LAND_LOBES = [
  { x: -20, z: 2630, r: 65 }, // the Amberfen Steps' shelf
  { x: 30, z: 2680, r: 80 }, // the eastern fen
  { x: -70, z: 2720, r: 85 }, // the Lilymoors' platter
  { x: 0, z: 2780, r: 90 }, // Bridgemere's wetland heart
  { x: 90, z: 2740, r: 65 }, // Bogshine's shelf
  { x: -60, z: 2880, r: 85 }, // Willowweep
  { x: 40, z: 2910, r: 80 }, // the Drowsy Flats
  { x: 0, z: 3010, r: 85 }, // the north fen
  { x: -110, z: 2810, r: 60 },
  { x: 110, z: 2860, r: 60 },
  { x: -30, z: 3080, r: 55 }, // the Nightgate's southern footing
  { x: -42, z: 2958, r: 40 }, // the north track's shoulder (organic-warp dip)
  { x: -30, z: 3114, r: 38 }, // the border footing right under the Nightgate
  { x: 120, z: 2860, r: 45 }, // the Windway road's fen-side shoulder
  { x: 160, z: 2860, r: 42 }, // ...carried right up to the column border
  { x: 60, z: 2825, r: 42 }, // the east track's moor
] as const;
const FEN_BAYS = [
  { x: 170, z: 2780, r: 55 }, // the east sound
  { x: -170, z: 2930, r: 55 }, // the west reach
  { x: 30, z: 3115, r: 50 }, // the north cove
] as const;

export function fenLandness(x: number, z: number): number {
  return metaballLandness(FEN_LAND_LOBES, FEN_BAYS, x, z);
}

// Gentle everywhere: the fen's shelf is wider and its floor shallower than
// the other realms' (bog country, not sea cliffs).
function applyFenCoast(x: number, z: number, h: number): number {
  if (z <= AMBER_ZMAX || z > FEN_ZMAX + 2) return h;
  // The Galecrest column keeps its own coast; the two recipes CROSS-FADE
  // over a seam band at the column border rather than hard-partitioning,
  // because a step in terrainHeight along the border line buries walkers
  // (the render mesh interpolates across it, the sim does not).
  const seam = 1 - smoothstep(STRIP_MAX_X - 8, STRIP_MAX_X + 8, x);
  if (seam <= 0) return h;
  const land = fenLandness(x, z);
  const t = smoothstep(0.02, 0.34, land);
  const shelf = smoothstep(-0.5, 0.06, land);
  const floor = WATER_LEVEL - 3.4 + (WATER_LEVEL - 1 - (WATER_LEVEL - 3.4)) * shelf;
  let out = floor + (h - floor) * t;
  // the Amberfen Steps: flat pass floor across the border
  const passT = (1 - smoothstep(26, 52, Math.abs(x + 20))) * (1 - smoothstep(2650, 2700, z));
  if (passT > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passT;
  // ...and the Nightgate's south ramp, meeting the night realm's pass cap
  const passN = (1 - smoothstep(26, 52, Math.abs(x + 30))) * smoothstep(3040, 3085, z);
  if (passN > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passN;
  // ...and the Windway's west ramp, meeting the Galecrest's pass cap at the
  // column border (the world's first sideways gate)
  const passE = (1 - smoothstep(26, 52, Math.abs(z - 2860))) * smoothstep(100, 145, x);
  if (passE > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passE;
  return h + (out - h) * seam;
}

// ---------------------------------------------------------------------------
// The Nightbloom: moonlit downs under permanent night, the world's current
// northern end. Gentle coasts like the fen's; the north shore looks out over
// open starlit sea.
// ---------------------------------------------------------------------------
const NIGHT_ZMAX = 3680; // keep in sync with NIGHTBLOOM_ZONE.zMax
const NIGHT_LAND_LOBES = [
  { x: -30, z: 3160, r: 60 }, // the Nightgate's shelf
  { x: 20, z: 3240, r: 90 }, // the realm's heart: Moonrest and the Moonwell
  { x: -80, z: 3340, r: 80 }, // Gloamfield's flower downs
  { x: 80, z: 3410, r: 70 }, // the Standing Vigil's rise
  { x: 0, z: 3520, r: 85 }, // the barrow downs
  { x: -5, z: 3380, r: 80 }, // the midrealm saddle: bridges heart to barrow
  { x: -12, z: 3308, r: 42 }, // the saddle's south seam, under the barrow road
  { x: 0, z: 3448, r: 45 }, // ...and its north seam at the barrow's foot
  { x: 35, z: 3345, r: 55 }, // the Vigil road's shoulder
  { x: -120, z: 3430, r: 55 }, // the west arm
  { x: 130, z: 3240, r: 50 }, // the east arm
  { x: 30, z: 3640, r: 48 }, // the Crowgate's southern footing
  { x: 10, z: 3580, r: 50 }, // the dream road's shoulder past the Barrowmere
  { x: 60, z: 3460, r: 62 }, // the Dreamer's Rise: dry footing under the caldera
  { x: 132, z: 3400, r: 44 }, // the Dreamsedge crossing's dream-side shoulder
  { x: 168, z: 3400, r: 40 }, // ...to the wood's border
  { x: -132, z: 3410, r: 44 }, // the Tanglemouth crossing's dream-side shoulder
  { x: -168, z: 3410, r: 40 }, // ...to the jungle's border
  { x: 172, z: 3400, r: 36 }, // the Dreamsedge corridor's border footing
  { x: 30, z: 3668, r: 40 }, // the Garden Gate's southern footing
] as const;
const NIGHT_BAYS = [
  { x: 170, z: 3380, r: 55 }, // the east sound
  { x: -170, z: 3240, r: 55 }, // the west reach
  { x: -60, z: 3630, r: 50 }, // the north bight, open to the starlit sea
] as const;

export function nightLandness(x: number, z: number): number {
  return metaballLandness(NIGHT_LAND_LOBES, NIGHT_BAYS, x, z);
}

// Gentle everywhere, the fen's recipe: soft downs easing into a dark sea.
function applyNightCoast(x: number, z: number, h: number): number {
  if (z <= FEN_ZMAX || z > NIGHT_ZMAX + 2) return h;
  // the dream holds the center of a three-realm row: cross-fade toward the
  // Palmreach west and the Wraithwood east
  const seam =
    smoothstep(STRIP_MIN_X - 8, STRIP_MIN_X + 8, x) *
    (1 - smoothstep(STRIP_MAX_X - 8, STRIP_MAX_X + 8, x));
  if (seam <= 0) return h;
  const land = nightLandness(x, z);
  const t = smoothstep(0.02, 0.32, land);
  const shelf = smoothstep(-0.5, 0.06, land);
  const floor = WATER_LEVEL - 3.6 + (WATER_LEVEL - 1 - (WATER_LEVEL - 3.6)) * shelf;
  let out = floor + (h - floor) * t;
  // the Nightgate: flat pass floor across the border
  const passT = (1 - smoothstep(26, 52, Math.abs(x + 30))) * (1 - smoothstep(3170, 3220, z));
  if (passT > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passT;
  // ...the Garden Gate's south ramp, meeting the Evergarden's pass cap
  const passN = (1 - smoothstep(26, 52, Math.abs(x - 30))) * smoothstep(3600, 3645, z);
  if (passN > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passN;
  // ...the Dreamsedge east ramp toward the Wraithwood...
  const passE = (1 - smoothstep(26, 52, Math.abs(z - 3400))) * smoothstep(100, 145, x);
  if (passE > 0) out = out + (6 + (out - 6) * 0.15 - out) * passE;
  // ...and the Tanglemouth west ramp toward the Palmreach
  const passW = (1 - smoothstep(26, 52, Math.abs(z - 3410))) * (1 - smoothstep(-145, -100, x));
  if (passW > 0) out = out + (6 + (out - 6) * 0.15 - out) * passW;
  return h + (out - h) * seam;
}

// ---------------------------------------------------------------------------
// The Wraithwood: the haunted forest at the world's current northern end.
// A broad wooded platter whose shores sink into a drowned grey sea.
// ---------------------------------------------------------------------------
const WOOD_ZMAX = 3680; // keep in sync with WRAITHWOOD_ZONE.zMax (east column)
const WOOD_LAND_LOBES = [
  { x: 390, z: 3160, r: 55 }, // the Crowgate's shelf
  { x: 360, z: 3280, r: 90 }, // the realm's heart: Gallowmere under the eaves
  { x: 280, z: 3350, r: 80 }, // Widow's Thicket
  { x: 440, z: 3390, r: 75 }, // the Hanging Glade
  { x: 300, z: 3480, r: 70 }, // the Mournstone rise
  { x: 370, z: 3550, r: 80 }, // the Huntsman's clearing
  { x: 350, z: 3400, r: 70 }, // the midwood saddle: bridges hamlet to chapel
  { x: 374, z: 3460, r: 50 }, // the clearing road's shoulder
  { x: 230, z: 3420, r: 55 }, // the west arm
  { x: 490, z: 3300, r: 50 }, // the east arm
  { x: 300, z: 3630, r: 48 }, // the Tanglemouth's southern footing
  { x: 308, z: 3565, r: 45 }, // the west track's shoulder toward the pass
  { x: 300, z: 3660, r: 42 }, // the border footing right under the pass
  { x: 214, z: 3400, r: 44 }, // the Dreamsedge crossing's wood-side shoulder
  { x: 250, z: 3400, r: 42 }, // ...under the first black eaves
] as const;
const WOOD_BAYS = [
  { x: 530, z: 3380, r: 55 }, // the east sound
  { x: 190, z: 3260, r: 55 }, // the west reach
  { x: 400, z: 3660, r: 50 }, // the north bight, open to the grey sea
] as const;

export function woodLandness(x: number, z: number): number {
  return metaballLandness(WOOD_LAND_LOBES, WOOD_BAYS, x, z);
}

// Gentle shores under the murk, the fen recipe again.
function applyWoodCoast(x: number, z: number, h: number): number {
  if (z <= 3118 || z > WOOD_ZMAX + 2) return h;
  // the east column: cross-fade toward the Nightbloom at the border
  const seam = smoothstep(STRIP_MAX_X - 8, STRIP_MAX_X + 8, x);
  if (seam <= 0) return h;
  const land = woodLandness(x, z);
  const t = smoothstep(0.02, 0.32, land);
  const shelf = smoothstep(-0.5, 0.06, land);
  const floor = WATER_LEVEL - 3.6 + (WATER_LEVEL - 1 - (WATER_LEVEL - 3.6)) * shelf;
  let out = floor + (h - floor) * t;
  // the Crowgate: flat pass floor up from the Galecrest's wrecks
  const passT = (1 - smoothstep(26, 52, Math.abs(x - 390))) * (1 - smoothstep(3170, 3220, z));
  if (passT > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passT;
  // ...and the Dreamsedge: flat pass floor across the column border
  const passW = (1 - smoothstep(26, 52, Math.abs(z - 3400))) * (1 - smoothstep(230, 280, x));
  if (passW > 0) out = out + (6 + (out - 6) * 0.15 - out) * passW;
  return h + (out - h) * seam;
}

// ---------------------------------------------------------------------------
// The Palmreach: the tropical realm at the world's current northern end.
// Its signature is the coast: every shore is flattened into a wide, gently
// sloped beach shelf, so the land meets a turquoise sea over sand instead of
// bluffs. The eastern arm cups the Sapphire Lagoon.
// ---------------------------------------------------------------------------
const REACH_ZMAX = 3680; // keep in sync with PALMREACH_ZONE.zMax (west column)
const REACH_LAND_LOBES = [
  { x: -420, z: 3160, r: 55 }, // the Tanglemouth's shelf
  { x: -460, z: 3310, r: 75 }, // the Palmstrand's long beach arm
  { x: -360, z: 3360, r: 95 }, // the Emerald Tangle: the realm's green heart
  { x: -300, z: 3250, r: 70 }, // Drifthaven's strand
  { x: -265, z: 3315, r: 60 }, // the lagoon's northern arm...
  { x: -235, z: 3410, r: 55 }, // ...curling east around the water
  { x: -242, z: 3368, r: 40 }, // the idol road's shoulder on the lagoon's rim
  { x: -260, z: 3500, r: 60 }, // the Sunken Idol's headland
  { x: -400, z: 3500, r: 80 }, // the Vinefall
  { x: -340, z: 3590, r: 70 }, // the north cape
  { x: -480, z: 3440, r: 55 }, // the west arm
  { x: -400, z: 3420, r: 55 }, // the Tangle's western shoulder
  { x: -330, z: 3480, r: 50 }, // ...and its northeastern one
  { x: -340, z: 3220, r: 55 }, // the shore road's back-beach
  { x: -384, z: 3190, r: 45 }, // ...its western reach out of the pass
  { x: -366, z: 3285, r: 45 }, // the Palmstrand road's shoulder
  { x: -210, z: 3240, r: 42 }, // the offshore islet
  { x: -242, z: 3246, r: 38 }, // ...and its sandbar back to the strand
  { x: -282, z: 3565, r: 45 }, // the gate road's saddle over the cape's neck
  { x: -294, z: 3605, r: 38 }, // ...and its rise to the gate footing
  { x: -310, z: 3640, r: 45 }, // the Garden Gate road's northern footing
  { x: -310, z: 3676, r: 42 }, // ...carried right up to the border
  { x: -214, z: 3410, r: 44 }, // the Tanglemouth crossing's jungle-side shoulder
  { x: -252, z: 3435, r: 44 }, // ...back to the idol road
] as const;
const REACH_BAYS = [
  { x: -530, z: 3370, r: 50 }, // the west reach
  { x: -182, z: 3360, r: 45 }, // the east sound
  { x: -390, z: 3672, r: 50 }, // the north bight, open to the warm sea
] as const;

export function reachLandness(x: number, z: number): number {
  return metaballLandness(REACH_LAND_LOBES, REACH_BAYS, x, z);
}

// The tropical coast: the fen recipe, then every low shore flattened into a
// broad sand shelf (the beach cap) so the strand runs wide and walkable.
function applyReachCoast(x: number, z: number, h: number): number {
  if (z <= 3118 || z > REACH_ZMAX + 2) return h;
  // the west column: cross-fade toward the Nightbloom at the border
  const seam = 1 - smoothstep(STRIP_MIN_X - 8, STRIP_MIN_X + 8, x);
  if (seam <= 0) return h;
  const land = reachLandness(x, z);
  const t = smoothstep(0.02, 0.32, land);
  const shelf = smoothstep(-0.5, 0.06, land);
  const floor = WATER_LEVEL - 3.2 + (WATER_LEVEL - 0.8 - (WATER_LEVEL - 3.2)) * shelf;
  let out = floor + (h - floor) * t;
  // the beach cap: the coastal band is pressed flat and low, a long sandy
  // apron instead of the other realms' bluff shores
  const beachT = 1 - smoothstep(0.05, 0.3, land);
  if (beachT > 0 && out > 1.4) out = out + (1.4 + (out - 1.4) * 0.2 - out) * beachT;
  // the Tanglemouth, turned sideways: flat pass floor at the dream border
  const passT = (1 - smoothstep(26, 52, Math.abs(z - 3410))) * smoothstep(-260, -215, x);
  if (passT > 0) out = out + (6 + (out - 6) * 0.15 - out) * passT;
  return h + (out - h) * seam;
}

// ---------------------------------------------------------------------------
// The Evergarden: the formal garden at the world's current northern end. The
// lawns are one broad organic landmass; its signature is the Great Maze, a
// true hedge labyrinth grown from the heightfield itself (walls are terrain,
// so sim collision, the renderer, and the map all read the same hedges).
// ---------------------------------------------------------------------------
const GARDEN_ZMAX = 4240; // keep in sync with EVERGARDEN_ZONE.zMax
const GARDEN_LAND_LOBES = [
  { x: 50, z: 3690, r: 42 }, // the Garden Gate's border footing
  { x: 50, z: 3720, r: 55 }, // the Garden Gate's approach lawn
  { x: 18, z: 3745, r: 45 }, // the gate road's lawn, bridging to the hub
  { x: -40, z: 3790, r: 70 }, // Hedgewick and the gate lawns
  { x: 0, z: 3860, r: 80 }, // the Statuary Walk
  { x: 80, z: 3830, r: 55 }, // the Petal Pond's basin
  { x: -70, z: 3850, r: 40 }, // the rose road's shoulder
  { x: -90, z: 3890, r: 60 }, // the Rose Wilds
  { x: 0, z: 3996, r: 95 }, // the Great Maze's terrace...
  { x: -55, z: 3940, r: 60 }, // ...and its four corners, kept well ashore
  { x: 55, z: 3940, r: 60 },
  { x: -55, z: 4055, r: 60 },
  { x: 55, z: 4055, r: 60 },
  { x: -20, z: 4150, r: 65 }, // the north lawn and the Lily Basin
  { x: 60, z: 4120, r: 55 }, // the east walk's long lawn
  { x: 88, z: 3875, r: 40 }, // the east walk's south shoulder
  { x: 100, z: 3940, r: 55 }, // the east walk's shoulder
  { x: 98, z: 3990, r: 40 }, // the east walk's midpoint lawn
  { x: 100, z: 4040, r: 50 }, // the eastern border beds
  { x: -110, z: 4010, r: 55 }, // the western wilds
  { x: 30, z: 4210, r: 50 }, // the far hedgerow under the north rim
  { x: -96, z: 3828, r: 38 }, // the west lawn's elder stands dry
  { x: -46, z: 4104, r: 36 }, // the north lawn's elder too
  { x: 70, z: 3834, r: 46 }, // the pond road's east shoulder
] as const;
const GARDEN_BAYS = [
  { x: -170, z: 3920, r: 50 }, // the west water
  { x: 175, z: 3840, r: 45 }, // the east water
  { x: 150, z: 4205, r: 45 }, // the northeast bight
] as const;

export function gardenLandness(x: number, z: number): number {
  return metaballLandness(GARDEN_LAND_LOBES, GARDEN_BAYS, x, z);
}

// The garden coast: the fen recipe over lawn instead of reeds.
function applyGardenCoast(x: number, z: number, h: number): number {
  if (z <= 3678 || z > GARDEN_ZMAX + 2) return h;
  const land = gardenLandness(x, z);
  const t = smoothstep(0.02, 0.3, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = WATER_LEVEL - 3.2 + (WATER_LEVEL - 0.9 - (WATER_LEVEL - 3.2)) * shelf;
  let out = floor + (h - floor) * t;
  // the Garden Gate: flat pass floor across the border with the dream
  const passT = (1 - smoothstep(26, 52, Math.abs(x - 30))) * (1 - smoothstep(3730, 3780, z));
  if (passT > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passT;
  return out;
}

// The Great Maze. '#' cells are hedge walls raised straight out of the
// heightfield; '.' cells are gravel corridors. Row 0 is the NORTH row (the
// map's top), the entrance is the gap in the south row, and the open 3x3
// court at the center is the Fountain Court. Solvability (entrance to
// court) is asserted by tests/evergarden.test.ts, so an edit here that
// bricks the maze fails CI instead of stranding players.
const GARDEN_MAZE = [
  '###############',
  '#.....#.......#',
  '#.###.#####.###',
  '#.#.#.....#...#',
  '#.#.#####.#.#.#',
  '#.#.#.....#.#.#',
  '#.#.#.#####.#.#',
  '#.#.......#.#.#',
  '#.#.##....###.#',
  '#.#.#.........#',
  '#.###.#######.#',
  '#.#...#.....#.#',
  '#.#.#####.#.#.#',
  '#.#.....#.#.#.#',
  '#.#####.#.###.#',
  '#.......#.....#',
  '#######.#######',
] as const;
export const GARDEN_MAZE_GRID: readonly string[] = GARDEN_MAZE;
export const MAZE_CELL = 9; // yd per maze cell
export const MAZE_COLS = 15;
export const MAZE_ROWS = 17;
export const MAZE_X0 = -(MAZE_COLS * MAZE_CELL) / 2; // west edge, x -67.5
export const MAZE_Z1 = 4073; // north edge (row 0); south edge z 3920
export const MAZE_Z0 = MAZE_Z1 - MAZE_ROWS * MAZE_CELL;
const MAZE_WALL_H = 12;
const MAZE_SKIRT = 2.2; // yd of wall flank beyond the inset face
const MAZE_FACE_INSET = 1.2; // corridor-facing faces pull into the wall cell

/** Inside the maze footprint (small margin), where dressing must not spawn. */
export function inGardenMaze(x: number, z: number): boolean {
  return (
    x > MAZE_X0 - 3 && x < MAZE_X0 + MAZE_COLS * MAZE_CELL + 3 && z > MAZE_Z0 - 3 && z < MAZE_Z1 + 3
  );
}

// Is a grid position open ground? Out-of-bounds counts as open (the lawn
// beyond the maze), so the outer wall's outward face behaves like any other.
function mazeOpenAt(c: number, r: number): boolean {
  if (r < 0 || r >= MAZE_ROWS || c < 0 || c >= MAZE_COLS) return true;
  return GARDEN_MAZE[r].charCodeAt(c) === 46; // '.'
}

// How much hedge stands at a point, 0..1 of full height. Each wall cell is
// a square block whose corridor-facing faces are inset into the cell (so
// lanes stay wide) while wall-facing edges are NOT inset (so runs tile with
// no seam), and the union is a MAX over blocks: a shared edge inside a run
// is interior to both blocks and stays at full height. Chebyshev distance
// gives square height contours, so a run's END keeps its corners tall
// right to the block edge instead of tapering into the see-through notch a
// round distance field cuts at every junction corner.
function gardenMazeHedgeFactor(x: number, z: number): number {
  const w = MAZE_COLS * MAZE_CELL;
  if (x < MAZE_X0 - 1 || x > MAZE_X0 + w + 1) return 0;
  if (z < MAZE_Z0 - 1 || z > MAZE_Z1 + 1) return 0;
  const ci = Math.floor((x - MAZE_X0) / MAZE_CELL);
  const ri = Math.floor((MAZE_Z1 - z) / MAZE_CELL);
  let best = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = ri + dr;
      const c = ci + dc;
      if (r < 0 || r >= MAZE_ROWS || c < 0 || c >= MAZE_COLS) continue;
      if (GARDEN_MAZE[r].charCodeAt(c) !== 35) continue; // '#' wall cells
      const x0 = MAZE_X0 + c * MAZE_CELL + (mazeOpenAt(c - 1, r) ? MAZE_FACE_INSET : 0);
      const x1 = MAZE_X0 + (c + 1) * MAZE_CELL - (mazeOpenAt(c + 1, r) ? MAZE_FACE_INSET : 0);
      const zTop = MAZE_Z1 - r * MAZE_CELL - (mazeOpenAt(c, r - 1) ? MAZE_FACE_INSET : 0);
      const zBot = MAZE_Z1 - (r + 1) * MAZE_CELL + (mazeOpenAt(c, r + 1) ? MAZE_FACE_INSET : 0);
      const ddx = Math.max(x0 - x, x - x1, 0);
      const ddz = Math.max(zBot - z, z - zTop, 0);
      const d = Math.max(ddx, ddz); // Chebyshev: square contours
      const f = 1 - smoothstep(0, MAZE_SKIRT, d);
      if (f > best) best = f;
    }
  }
  return best;
}

// A hedge tall enough to block: movement treats it as a hard wall (see
// colliders.resolveMovement); the slope gate alone is not enough, a shallow
// diagonal walk sneaks over any gradient. Knee height, just inside the face.
const MAZE_WALL_SOLID = 0.12; // of full hedge height
export function inGardenMazeWall(x: number, z: number): boolean {
  return gardenMazeHedgeFactor(x, z) > MAZE_WALL_SOLID;
}

// Does the segment pass through hedge? The endpoint test alone is not
// enough: a mover stalled at a wall face keeps its interpolated target
// advancing, and the moment the target lands on open ground beyond the
// wall an endpoint-only check would teleport it across. Sampled finer than
// the wall's solid core so no step can straddle it.
export function crossesGardenHedge(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): boolean {
  // fast reject: segment nowhere near the maze
  const w = MAZE_COLS * MAZE_CELL;
  if (Math.max(fromZ, toZ) < MAZE_Z0 || Math.min(fromZ, toZ) > MAZE_Z1) return false;
  if (Math.max(fromX, toX) < MAZE_X0 || Math.min(fromX, toX) > MAZE_X0 + w) return false;
  const len = Math.hypot(toX - fromX, toZ - fromZ);
  const steps = Math.max(1, Math.ceil(len / 0.3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (inGardenMazeWall(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t)) return true;
  }
  return false;
}

// The hedge heightfield: sheer faces (well past the climb gate) whose skirt
// mostly eats into the wall cells, not the corridors.
function gardenMazeOffset(x: number, z: number): number {
  return MAZE_WALL_H * gardenMazeHedgeFactor(x, z);
}

// ---------------------------------------------------------------------------
// The Galecrest: the world's first east-column realm, a wind-scoured
// headland landmass in its own grid cell beside the Willowfen. Its west
// border is the vertical ridge the border-edge machinery raises along the
// shared column edge, opened at the Windway (westPassZ 3380).
// ---------------------------------------------------------------------------
const GALE_XMIN = 180; // keep in sync with GALECREST_ZONE.xMin
const GALE_ZMIN = 2600;
const GALE_ZMAX = 3120;
const GALE_LAND_LOBES = [
  { x: 210, z: 2860, r: 48 }, // the Windway's shelf at the border
  { x: 268, z: 2825, r: 55 }, // the road's rise onto the downs
  { x: 290, z: 2760, r: 70 }, // the Howling Downs
  { x: 340, z: 2800, r: 65 }, // the mid downs
  { x: 425, z: 2780, r: 70 }, // Wickharbor's headland
  { x: 492, z: 2735, r: 45 }, // the Old Beacon's head
  { x: 448, z: 2942, r: 55 }, // the Shear's cliff tops
  { x: 300, z: 2975, r: 58 }, // the Mirror Tarn plateau
  { x: 355, z: 3040, r: 60 }, // the Wreckfields' back downs
  { x: 380, z: 2900, r: 60 }, // the connective heart of the headland
  { x: 240, z: 2930, r: 50 }, // the west downs above the border range
  { x: 435, z: 2870, r: 45 }, // the cliff road's first shoulder
  { x: 428, z: 2985, r: 48 }, // ...and its long run above the Shear
  { x: 345, z: 2935, r: 42 }, // the tarn road's saddle
  { x: 366, z: 2986, r: 40 }, // the wisp hollows
  { x: 300, z: 2930, r: 42 }, // the upper downs west of the saddle
  { x: 390, z: 3078, r: 44 }, // the Crowgate climb's south footing
  { x: 388, z: 3112, r: 38 }, // the Crowgate climb's border footing
] as const;
const GALE_BAYS = [
  { x: 470, z: 2810, r: 24 }, // the harbor cove in Wickharbor's lee
  { x: 530, z: 3020, r: 50 }, // the south sound
  { x: 250, z: 3105, r: 45 }, // the north bight
  { x: 535, z: 2630, r: 45 }, // the northeast water past the beacon
] as const;

export function galeLandness(x: number, z: number): number {
  return metaballLandness(GALE_LAND_LOBES, GALE_BAYS, x, z);
}

// The headland coast: the fen recipe cut steeper (sea cliffs, not bog), a
// flat pass floor at the Windway meeting the fen's east ramp.
function applyGaleCoast(x: number, z: number, h: number): number {
  if (z <= GALE_ZMIN - 2 || z > GALE_ZMAX + 2) return h;
  // the seam twin of applyFenCoast's gate: cross-fade, never a hard cut
  const seam = smoothstep(STRIP_MAX_X - 8, STRIP_MAX_X + 8, x);
  if (seam <= 0) return h;
  const land = galeLandness(x, z);
  const t = smoothstep(0.02, 0.28, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = WATER_LEVEL - 3.6 + (WATER_LEVEL - 1.2 - (WATER_LEVEL - 3.6)) * shelf;
  let out = floor + (h - floor) * t;
  // the Windway: flat pass floor across the column border
  const passT = (1 - smoothstep(26, 52, Math.abs(z - 2860))) * (1 - smoothstep(230, 280, x));
  if (passT > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passT;
  // ...and the Crowgate's south ramp, up into the haunted wood
  const passN = (1 - smoothstep(26, 52, Math.abs(x - 390))) * smoothstep(3040, 3085, z);
  if (passN > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passN;
  return h + (out - h) * seam;
}

// The straits between columns: the seam blend of two adjacent coasts leaves
// each border line hovering at the waterline (a mushy mudflat neither
// walkable nor swimmable); these carve every column border into honest
// water, leaving each crossing's corridor untouched.
const COLUMN_STRAITS = [
  { borderX: STRIP_MAX_X, passZ: 2860, zLo: GALE_ZMIN, zHi: GALE_ZMAX }, // the Windway
  { borderX: STRIP_MIN_X, passZ: 1700, zLo: 1440, zHi: 1960 }, // the Snowline
  { borderX: STRIP_MAX_X, passZ: 3400, zLo: 3120, zHi: 3680 }, // the Dreamsedge
  { borderX: STRIP_MIN_X, passZ: 3410, zLo: 3120, zHi: 3680 }, // the Tanglemouth
] as const;
function applyColumnStraits(x: number, z: number, h: number): number {
  let out = h;
  for (const st of COLUMN_STRAITS) {
    if (z <= st.zLo || z > st.zHi) continue;
    const strait =
      (1 - smoothstep(2, 12, Math.abs(x - st.borderX))) *
      smoothstep(26, 52, Math.abs(z - st.passZ));
    if (strait <= 0) continue;
    const channel = Math.min(out, WATER_LEVEL - 2.5);
    out = out + (channel - out) * strait;
  }
  return out;
}

// Same coast recipe; holds the sealed wall's footing at the south fringe.
function applyAmberCoast(x: number, z: number, h: number): number {
  if (z <= DRAKE_ZMAX || z > AMBER_ZMAX + 2) return h;
  const land = amberLandness(x, z);
  const t = smoothstep(0.02, 0.3, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = HOLLOW_SEA_FLOOR + (WATER_LEVEL - 1.1 - HOLLOW_SEA_FLOOR) * shelf;
  let out = floor + (h - floor) * t;
  // the Goldmelt: a flat pass floor across the border, the Wyrmgate recipe
  const passT = (1 - smoothstep(26, 52, Math.abs(x + 10))) * (1 - smoothstep(2090, 2140, z));
  if (passT > 0 && out > 7) out = out + (7 + (out - 7) * 0.15 - out) * passT;
  // ...and the Amberfen Steps' south ramp, meeting the fen's pass cap
  const passN = (1 - smoothstep(26, 52, Math.abs(x + 20))) * smoothstep(2540, 2585, z);
  if (passN > 0 && out > 6) out = out + (6 + (out - 6) * 0.15 - out) * passN;
  return out;
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
  // the Frostveil column keeps its own coast west of the border; cross-fade
  const emberSeam = smoothstep(STRIP_MIN_X - 8, STRIP_MIN_X + 8, x);
  if (emberSeam <= 0) return h;
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
  // ...and the Snowline's east ramp, meeting the Frostveil's pass cap at
  // the column border (fire cooling into ice)
  const passW = (1 - smoothstep(26, 52, Math.abs(z - 1700))) * (1 - smoothstep(-145, -100, x));
  if (passW > 0) out = out + (6 + (out - 6) * 0.15 - out) * passW;
  return h + (out - h) * emberSeam;
}

// The Frostveil's coast. Fades IN north of the sealed wall's footing for the
// same reason (the wall crest sits at the band's south fringe).
function applyFrostCoast(x: number, z: number, h: number): number {
  if (z <= 1438 || z > FROST_ZMAX + 2) return h;
  // the west column: cross-fade toward the Drakelands at the border
  const seam = 1 - smoothstep(STRIP_MIN_X - 8, STRIP_MIN_X + 8, x);
  if (seam <= 0) return h;
  const land = frostLandness(x, z);
  const t = smoothstep(0.02, 0.3, land);
  const shelf = smoothstep(-0.4, 0.06, land);
  const floor = HOLLOW_SEA_FLOOR + (WATER_LEVEL - 1.1 - HOLLOW_SEA_FLOOR) * shelf;
  let out = floor + (h - floor) * t;
  // The Snowline, turned sideways: a flat valley floor through the border
  // at the fire and ice crossing, easing off as the road climbs the benches.
  const passT = (1 - smoothstep(26, 52, Math.abs(z - 1700))) * smoothstep(-260, -215, x);
  if (passT > 0) out = out + (7 + (out - 7) * 0.15 - out) * passT;
  return h + (out - h) * seam;
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
// the Snowline crossing's drake-side footing (appended to the ember lobes
// below via EMBER_GATE_LOBES; the fire road to the ice)

// Open lava pools out in the wastes (shaped as shallow flat-floored basins;
// the render lava surface sits just above each floor).
export const EMBER_LAVA_POOLS = [
  { x: 30, z: 1940, r: 14, floor: 12 }, // the vent inside the Drakemaw crater
  { x: 86, z: 1840, r: 11, floor: -0.5 },
  { x: -58, z: 1948, r: 11, floor: 0 },
  // crater pools high in the two smaller cones
  { x: -90, z: 1902, r: 7, floor: 11.5 },
  { x: 140, z: 1990, r: 6, floor: 9.5 },
  // the Moltenmaw: an open lava-lake field east of the caldera
  { x: 58, z: 1962, r: 16, floor: -1.2 },
  { x: 78, z: 1946, r: 10, floor: -1.2 },
] as const;

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

// Real craters, carved after the cones: a raised rock lip rings each pool
// and the floor sinks genuinely below the surrounding ground, so the melt
// sits down INSIDE its bowl the way lake water does (the floors stay above
// WATER_LEVEL so the zone water plane never floods a vent).
function applyEmberLavaBasins(x: number, z: number, h: number): number {
  if (z < HOLLOW_ZMAX || z > DRAKE_ZMAX) return h;
  let out = h;
  for (const pool of EMBER_LAVA_POOLS) {
    const d = Math.hypot(x - pool.x, z - pool.z);
    if (d < pool.r * 2.2) {
      // the lip: rises from the bowl edge, falls away outward
      const lip =
        2.4 *
        smoothstep(pool.r * 0.7, pool.r * 1.05, d) *
        (1 - smoothstep(pool.r * 1.05, pool.r * 2.2, d));
      // the bowl: flat melt floor inside, blending up to the lip
      const blend = smoothstep(pool.r * 0.55, pool.r * 1.05, d);
      out = out * blend + pool.floor * (1 - blend) + lip;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Signature landforms: one distinctive terrain idea per northern realm, so
// no two maps read alike. All of them yield to roads (every marked route
// stays a walkable pass) and are placed clear of hubs, lakes, and camps.
// ---------------------------------------------------------------------------

// The Veilspires: the Frostveil's central massif. The terrace applier below
// steps its flanks into benched paths; the plateau tables are cut flat at
// the end of terrainHeight (mesa-style, after the rims).
const FROST_MASSIF = [
  { x: -366, z: 1710, r: 46, h: 24 }, // the south spire, over the road fork
  { x: -400, z: 1810, r: 46, h: 28 }, // the crown massif
  { x: -330, z: 1870, r: 44, h: 22 }, // the north spire at the pass road
  { x: -294, z: 1720, r: 40, h: 18 }, // the east shoulder above the tarn
] as const;
const FROST_PLATEAUS = [
  { x: -378, z: 1752, r: 20, h: 12 }, // the low shelf
  { x: -362, z: 1786, r: 15, h: 19 }, // the mid shelf
  { x: -386, z: 1820, r: 12, h: 26 }, // the crown table
] as const;
function frostMassifOffset(x: number, z: number): number {
  if (z < 1500 || z > FROST_ZMAX - 20) return 0;
  if (x > STRIP_MIN_X - 4) return 0; // the massif lives in the west column
  let dh = 0;
  for (const m of FROST_MASSIF) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d < m.r) dh += m.h * (1 - smoothstep(m.r * 0.3, m.r, d));
  }
  if (dh <= 0) return 0;
  // roads pierce the range as valley passes
  return dh * smoothstep(7, 16, roadDistance(x, z));
}

// The Golden Shelf: the Amberfall's raised northeast tableland, an amber
// escarpment overlooking the Great Mere.
const AMBER_SHELF = [
  { x: 124, z: 2180, r: 55, h: 13 },
  { x: 96, z: 2116, r: 42, h: 9 },
  { x: 140, z: 2270, r: 48, h: 11 },
] as const;
function amberShelfOffset(x: number, z: number): number {
  if (z < 2080 || z > 2380) return 0;
  let dh = 0;
  for (const m of AMBER_SHELF) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d < m.r) dh += m.h * (1 - smoothstep(m.r * 0.35, m.r, d));
  }
  if (dh <= 0) return 0;
  return dh * smoothstep(7, 16, roadDistance(x, z));
}

// The Dreamer's Bowl: the Nightbloom's caldera. A climbable ring with a
// notch entrance on its road-facing side, a sunken dream-meadow floor, and
// a knoll at the very center.
const BOWL_X = 60;
const BOWL_Z = 3460;
function nightCalderaOffset(x: number, z: number): number {
  const d = Math.hypot(x - BOWL_X, z - BOWL_Z);
  if (d > 68) return 0;
  // the ring: a rounded rampart at radius 40, tall enough that its crest
  // takes the night biome's violet crag tint on the map (h > 20) instead
  // of reading as mid-slope rock
  const ring = 17 * (1 - smoothstep(0, 18, Math.abs(d - 40)));
  // the notch: the rampart parts on the southwest, toward Moonrest's road
  const ang = Math.atan2(x - BOWL_X, z - BOWL_Z);
  const notch = 1 - smoothstep(0.28, 0.62, Math.abs(ang + 2.3));
  // the floor: the bowl sinks gently inside the ring
  const bowl = -3.5 * (1 - smoothstep(10, 34, d));
  // the knoll: the dream stands centered
  const knoll = 7 * (1 - smoothstep(0, 10, d));
  // a gentle pedestal lifts the whole formation, so the rampart's crest
  // clears the caret and crag bands all the way around the circle
  const pedestal = 4 * (1 - smoothstep(30, 58, d));
  return ring * (1 - notch) + bowl + knoll + pedestal;
}

// The Firemount: the Palmreach's volcano, a climbable cone over the deep
// jungle with a cupped summit crater.
const CONE_X = -344;
const CONE_Z = 3422;
function palmConeOffset(x: number, z: number): number {
  const d = Math.hypot(x - CONE_X, z - CONE_Z);
  if (d > 36) return 0;
  // crest ~25: above the map's crown stipple (22) so the summit reads as
  // bare volcanic rock and carets, below the snow-cap band (26)
  const cone = 22 * (1 - smoothstep(4, 32, d));
  const crater = -8 * (1 - smoothstep(0, 9, d));
  return (cone + crater) * smoothstep(7, 14, roadDistance(x, z));
}

// The Braids: the Willowfen's east water-meadows dissolve into winding
// channels and grassy islets. Channels follow the valleys of a ridged
// noise field; roads, the hub, camps (which flattened first), and the
// border pass caps are all left dry.
function applyFenBraids(x: number, z: number, h: number): number {
  if (z < 2660 || z > 3040 || x < -20 || x > STRIP_MAX_X - 4) return h;
  if (h < WATER_LEVEL + 0.5 || h > 5.5) return h;
  const ridge = Math.abs(fbm2(x * 0.021, z * 0.021, 9301, 3) - 0.5) * 2;
  let channel = 1 - smoothstep(0.05, 0.17, ridge);
  if (channel <= 0) return h;
  // feathered region edges: a hard gate would print a straight hillshade
  // seam across the fen
  channel *= smoothstep(-20, 4, x) * (1 - smoothstep(STRIP_MAX_X - 30, STRIP_MAX_X - 6, x));
  channel *= smoothstep(2660, 2695, z) * (1 - smoothstep(3005, 3040, z));
  const roadGate = smoothstep(8, 15, roadDistance(x, z));
  let campGate = 1;
  for (const camp of CAMPS) {
    if (camp.center.z < 2620 || camp.center.z > 3080) continue;
    const d = Math.hypot(x - camp.center.x, z - camp.center.z);
    campGate = Math.min(campGate, smoothstep(camp.radius * 1.6, camp.radius * 2.4, d));
  }
  const depth = (WATER_LEVEL - 1.4 - h) * channel * roadGate * campGate;
  return depth < 0 ? h + depth : h;
}

// The Frostveil's terraced benches: the whole massif steps into flats,
// ramps, and short steep risers (multi-level mountain ground). Suppressed
// near roads so every marked route stays climbable, and below the shore
// line so beaches ease into the sea.
function applyFrostTerraces(x: number, z: number, h: number): number {
  if (z <= 1460 || z > FROST_ZMAX) return h;
  if (x > STRIP_MIN_X - 2) return h; // the benches belong to the west column
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
  if (z < 960 || x > DUNGEON_X_THRESHOLD) return false;
  const seaXb = worldXBoundsAt(z);
  // the Mirrorshallow: enclosed lake water, never open sea
  if (Math.hypot(x - 152, z - 1112) < 42) return false;
  if (z <= HOLLOW_ZMAX + 2) {
    const dEdge = Math.min(x - seaXb.min, seaXb.max - x);
    return dEdge < 48 && hollowLandness(x, z) < 0.02;
  }
  if (z <= DRAKE_ZMAX) {
    const dEdge = Math.min(x - seaXb.min, seaXb.max - x);
    return dEdge < 48 && Math.max(emberLandness(x, z), frostLandness(x, z)) < 0.02;
  }
  if (z <= AMBER_ZMAX + 2) {
    const dEdge = Math.min(x - seaXb.min, seaXb.max - x);
    return dEdge < 48 && amberLandness(x, z) < 0.02;
  }
  if (z <= FEN_ZMAX + 2) {
    const dEdge = Math.min(x - seaXb.min, seaXb.max - x);
    return dEdge < 48 && Math.max(fenLandness(x, z), galeLandness(x, z)) < 0.02;
  }
  if (z <= NIGHT_ZMAX + 2) {
    const dEdge = Math.min(x - seaXb.min, seaXb.max - x);
    return (
      dEdge < 48 && Math.max(nightLandness(x, z), woodLandness(x, z), reachLandness(x, z)) < 0.02
    );
  }
  if (z <= GARDEN_ZMAX + 2) {
    const dEdge = Math.min(x - seaXb.min, seaXb.max - x, GARDEN_ZMAX - z);
    return dEdge < 48 && gardenLandness(x, z) < 0.02;
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

// Blended biome shape at a position. Zone interiors keep their exact shape;
// blends happen across the same -30/+35yd windows at every border: the
// strip's band boundaries cascade by z as they always did, and column zones
// blend in sideways (columnBlendAt), so an east map's hills arrive across
// its border pass exactly like a northern realm's do.
function shapeAt(x: number, z: number): { hill: number; base: number } {
  let hill = BIOME_SHAPE[STRIP_ZONES[0].biome].hill;
  let base = BIOME_SHAPE[STRIP_ZONES[0].biome].base;
  for (let i = 0; i + 1 < STRIP_ZONES.length; i++) {
    const boundary = STRIP_ZONES[i].zMax;
    const t = smoothstep(boundary - 30, boundary + 35, z);
    const next = BIOME_SHAPE[STRIP_ZONES[i + 1].biome];
    hill = lerp(hill, next.hill, t);
    base = lerp(base, next.base, t);
  }
  for (const col of COLUMN_ZONES) {
    const t = columnBlendAt(col, x, z);
    if (t <= 0) continue;
    const shape = BIOME_SHAPE[col.biome];
    hill = lerp(hill, shape.hill, t);
    base = lerp(base, shape.base, t);
  }
  return { hill, base };
}

function baseHeight(x: number, z: number, seed: number): number {
  const shape = shapeAt(x, z);
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
      // organic shores: the carve distance wobbles with fixed-seed noise so
      // lakes read as real waterbodies instead of stamped discs. Northern
      // realms only (z > 900): the three original zones keep their exact
      // shorelines, and with them every seed-pinned fixture placed on them.
      const wob = lake.z > 900 ? (noise2(x * 0.12, z * 0.12, 9109) - 0.5) * lake.radius * 0.45 : 0;
      const dLake = Math.sqrt((x - lake.x) ** 2 + (z - lake.z) ** 2) + wob;
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

  // Mountain ridge walls along shared zone edges, pierced by the road pass
  // (sealed walls have no pass and only ever grow past their base height,
  // so no crest dip opens a climbable notch)
  for (const edge of BORDER_EDGES) {
    const sigma = edge.sealed ? SEALED_RIDGE_SIGMA : RIDGE_SIGMA;
    const dPerp = Math.abs((edge.kind === 'h' ? z : x) - edge.at);
    if (dPerp < sigma * 3) {
      const along = edge.kind === 'h' ? x : z;
      const profile = Math.exp(-(dPerp * dPerp) / (2 * sigma * sigma));
      const pass = edge.sealed
        ? 1
        : smoothstep(PASS_HALF_WIDTH, PASS_SHOULDER, Math.abs(along - edge.passAt));
      // jagged crest so the wall reads as mountains, not a berm
      const crestNoise =
        edge.kind === 'h'
          ? (fbm2(x * 0.03, edge.at * 0.03, seed + 19, 2) - 0.5) * 0.7
          : (fbm2(edge.at * 0.03, z * 0.03, seed + 19, 2) - 0.5) * 0.7;
      const crest = 1 + (edge.sealed ? Math.abs(crestNoise) : crestNoise);
      const height = edge.sealed ? SEALED_RIDGE_HEIGHT : RIDGE_HEIGHT;
      // The Hollow/Drakelands boundary ridge rises only where there is land
      // to carry it (the Wyrmgate mountains around the causeway head); over
      // the open sea the two realms' waters simply meet. Sealed walls are
      // never gated: the Drakemaw range runs down into the sea at its flanks.
      let seaGate = 1;
      const northern = edge.kind === 'h' ? edge.at >= HOLLOW_ZMAX : edge.lo >= HOLLOW_ZMAX;
      if (!edge.sealed && northern) {
        seaGate = smoothstep(
          0.005,
          0.06,
          Math.max(
            hollowLandness(x, z),
            emberLandness(x, z),
            frostLandness(x, z),
            amberLandness(x, z),
            fenLandness(x, z),
            nightLandness(x, z),
            woodLandness(x, z),
            reachLandness(x, z),
            gardenLandness(x, z),
            galeLandness(x, z),
          ),
        );
      }
      // a partial edge (a column border, or a band split by columns) fades
      // out past its span; a full-row edge keeps the classic unbounded wall
      let end = 1;
      if (!edge.fullRow) {
        const outside = Math.max(edge.lo - along, along - edge.hi, 0);
        end = 1 - smoothstep(0, 24, outside);
      }
      h += height * crest * profile * pass * seaGate * end;
    }
  }

  h += mirefenImpactCraterOffset(x, z);
  h += hollowShapingOffset(x, z, seed);
  h += emberShapingOffset(x, z, seed);
  h += frostMassifOffset(x, z);
  h += amberShelfOffset(x, z);
  h += nightCalderaOffset(x, z);
  h += palmConeOffset(x, z);
  h = applyHollowCoast(x, z, h);
  h = applyEmberCoast(x, z, h);
  h = applyFrostCoast(x, z, h);
  h = applyAmberCoast(x, z, h);
  h = applyFenCoast(x, z, h);
  h = applyNightCoast(x, z, h);
  h = applyWoodCoast(x, z, h);
  h = applyReachCoast(x, z, h);
  h = applyGardenCoast(x, z, h);
  h = applyGaleCoast(x, z, h);
  h = applyColumnStraits(x, z, h);
  h = applyEmberLavaBasins(x, z, h);
  h = applyFrostTerraces(x, z, h);
  h = applyFenBraids(x, z, h);
  // The Great Maze rises out of the finished lawn: walls are pure additive
  // hedge over whatever the garden terrain does beneath them, so corridors
  // follow the ground and the walls stay a constant unclimbable height.
  h += gardenMazeOffset(x, z);
  // World rims AFTER the coast, so the border ranges rise out of the sea
  // (mountains dipping into the ocean at the flanks) instead of being sunk
  // by it. The NORTH rim is suppressed over the Hollow's open sea: looking
  // out from the shore reads as water meeting sky, and swim fatigue (not a
  // wall) turns swimmers back before the band edge.
  const xb = worldXBoundsAt(z);
  let rimX = Math.max(smoothstep(xb.max - 30, xb.max, x), smoothstep(-xb.min - 30, -xb.min, -x));
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
  // the Tablecrag's crown: a level table cut into the eastern border range
  // (flattened AFTER the rims so the top is a true plateau, not rim noise)
  const dMesa = Math.hypot(x + 168, z - 1195);
  if (dMesa < 30) {
    const t = smoothstep(14, 30, dMesa);
    h = h * t + 34 * (1 - t);
  }
  const dMesaS = Math.hypot(x + 166, z - 1072);
  if (dMesaS < 26) {
    const t = smoothstep(11, 26, dMesaS);
    h = h * t + 30 * (1 - t);
  }
  // Beyond a row's own columns the world is open water: past the rim range
  // the ground dives to the sea floor, so rows without an east or west
  // column read as coast, not as an endless mountain shelf. Two gates keep
  // it honest: it only exists where the world is genuinely wider than this
  // row (inert in a one-column world), and never past the world bounds
  // themselves (instance space far east keeps its untouched heights).
  if (
    (WORLD_MAX_X > xb.max || WORLD_MIN_X < xb.min) &&
    x <= WORLD_MAX_X + 60 &&
    x >= WORLD_MIN_X - 60
  ) {
    const beyond = Math.max(x - (xb.max + 26), xb.min - 26 - x);
    if (beyond > 0) {
      const t = smoothstep(0, 44, beyond);
      h = h * (1 - t) + (WATER_LEVEL - 6) * t;
    }
  }
  // The Veilspires' plateau tables: level shelves cut into the massif at
  // rising heights (flattened after the rims and terraces, so each top is
  // a true plateau).
  if (z > 1680 && z < 1880 && x < STRIP_MIN_X - 4) {
    for (const p of FROST_PLATEAUS) {
      const dP = Math.hypot(x - p.x, z - p.z);
      if (dP < p.r) {
        const t = smoothstep(p.r * 0.55, p.r, dP);
        h = h * t + p.h * (1 - t);
      }
    }
  }
  // The Huntsman's Bluff: the Pale Huntsman's clearing sits on a flat-top
  // rise; his road from Gallowmere climbs the blended rim as the ramp.
  if (z > 3480 && z < 3610) {
    const dBluff = Math.hypot(x - 380, z - 3540);
    if (dBluff < 32) {
      const t = smoothstep(17, 32, dBluff);
      h = h * t + 14 * (1 - t);
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Natural roads. The authored ROADS are sparse waypoint polylines; drawn raw
// they read as ruler segments with kinks at every joint. Each road is
// densified ONCE through a centripetal-flavored Catmull-Rom spline so it
// flows as a curve through its waypoints (shared endpoints stay shared, so
// junctions remain seamless), and the query point gets a gentle fixed-seed
// meander so long reaches wander like a worn track instead of a survey line.
// Everything that reads roadDistance (the terrain splat, the map painter,
// decoration/terrace suppression) inherits the same curves together.
// ---------------------------------------------------------------------------
interface SmoothRoad {
  pts: { x: number; z: number }[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const ROAD_SAMPLE_STEP = 5; // yd between densified points
const ROAD_MEANDER = 7; // full meander swing of the query warp (yd)
const ROAD_BBOX_MARGIN = 24; // covers the meander plus every consumer's reach

function catmullRom(
  p0: { x: number; z: number },
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  p3: { x: number; z: number },
  t: number,
): { x: number; z: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

const SMOOTH_ROADS: SmoothRoad[] = ROADS.map((road) => {
  const pts: { x: number; z: number }[] = [];
  if (road.length < 2) {
    pts.push(...road);
  } else {
    for (let i = 0; i < road.length - 1; i++) {
      const p0 = road[Math.max(0, i - 1)];
      const p1 = road[i];
      const p2 = road[i + 1];
      const p3 = road[Math.min(road.length - 1, i + 2)];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const steps = Math.max(1, Math.ceil(segLen / ROAD_SAMPLE_STEP));
      for (let k = 0; k < steps; k++) pts.push(catmullRom(p0, p1, p2, p3, k / steps));
    }
    pts.push(road[road.length - 1]);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return {
    pts,
    minX: minX - ROAD_BBOX_MARGIN,
    maxX: maxX + ROAD_BBOX_MARGIN,
    minZ: minZ - ROAD_BBOX_MARGIN,
    maxZ: maxZ + ROAD_BBOX_MARGIN,
  };
});

// Distance from (x,z) to the nearest road curve.
export function roadDistance(x: number, z: number): number {
  // cheap first: most queries are nowhere near a road, so gate on the raw
  // bboxes (their margin already covers the meander) before paying for the
  // warp noise or any segment math
  let anyNear = false;
  for (const road of SMOOTH_ROADS) {
    if (x >= road.minX && x <= road.maxX && z >= road.minZ && z <= road.maxZ) {
      anyNear = true;
      break;
    }
  }
  if (!anyNear) return Infinity;
  // the meander: warp the query, and the whole road wanders in response
  const wx = x + (fbm2(x * 0.045, z * 0.045, 9203, 2) - 0.5) * ROAD_MEANDER;
  const wz = z + (fbm2(x * 0.045 + 37, z * 0.045 - 11, 9205, 2) - 0.5) * ROAD_MEANDER;
  let best2 = Infinity;
  for (const road of SMOOTH_ROADS) {
    if (wx < road.minX || wx > road.maxX || wz < road.minZ || wz > road.maxZ) continue;
    const pts = road.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const apx = wx - a.x;
      const apz = wz - a.z;
      const len2 = abx * abx + abz * abz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2)) : 0;
      const dx = apx - abx * t;
      const dz = apz - abz * t;
      const d2 = dx * dx + dz * dz;
      if (d2 < best2) best2 = d2;
    }
  }
  return Math.sqrt(best2);
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

export function zoneBiomeAt(x: number, z: number): BiomeId {
  let fallback: { biome: BiomeId; zMax: number } | null = null;
  let northmost = ZONES[0];
  for (const zone of ZONES) {
    if (zone.zMax > northmost.zMax) northmost = zone;
    if (z >= zone.zMax) continue;
    if (fallback === null || zone.zMax < fallback.zMax) {
      fallback = { biome: zone.biome, zMax: zone.zMax }; // southmost band containing z
    }
    const x0 = zone.xMin ?? STRIP_MIN_X;
    const x1 = zone.xMax ?? STRIP_MAX_X;
    if (z >= zone.zMin && x >= x0 && x < x1) return zone.biome;
  }
  return fallback ? fallback.biome : northmost.biome;
}

export function generateDecorations(seed: number): Decoration[] {
  const out: Decoration[] = [];
  const step = 10;
  const xHalf = WORLD_MAX_X - 14;
  for (let gx = -xHalf; gx < xHalf; gx += step) {
    for (let gz = WORLD_MIN_Z + 14; gz < WORLD_MAX_Z - 14; gz += step) {
      const r = hash2(Math.round(gx), Math.round(gz), seed + 31);
      const biome = zoneBiomeAt(gx, gz);
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
        if (r > treeGate + 0.12 + t * 0.1) continue; // rockier as the waste opens
        kind = r < treeGate * 0.55 ? 'tree' : r < treeGate ? 'tree2' : 'rock';
      } else if (biome === 'frost') {
        // hardy pines and broken stone on the snow benches
        if (r > 0.36) continue;
        kind = r < 0.18 ? 'tree' : r < 0.23 ? 'tree2' : 'rock';
      } else if (biome === 'amber') {
        // a dense fire-colored weald, broadleaf-heavy
        if (r > 0.5) continue;
        kind = r < 0.12 ? 'tree' : r < 0.42 ? 'tree2' : 'rock';
      } else if (biome === 'fen') {
        // open and soft: scattered broadleafs, very little stone
        if (r > 0.3) continue;
        kind = r < 0.06 ? 'tree' : r < 0.26 ? 'tree2' : 'rock';
      } else if (biome === 'night') {
        // open moon meadows: sparse silvered groves, standing stones between
        if (r > 0.28) continue;
        kind = r < 0.08 ? 'tree' : r < 0.2 ? 'tree2' : 'rock';
      } else if (biome === 'haunt') {
        // the densest forest in the world: the canopy is the realm
        if (r > 0.62) continue;
        kind = r < 0.3 ? 'tree' : r < 0.54 ? 'tree2' : 'rock';
      } else if (biome === 'jungle') {
        // wall-to-wall broadleaf inland; the palms on the beaches are the
        // render module's (this grid skips the low sand shelf below)
        if (terrainHeight(gx, gz, seed) < 3) continue;
        if (r > 0.58) continue;
        kind = r < 0.1 ? 'tree' : r < 0.5 ? 'tree2' : 'rock';
      } else if (biome === 'garden') {
        // open parkland: sparse specimen trees on the lawns, and the maze
        // keeps its corridors clear (the hedges are terrain, not dressing)
        if (inGardenMaze(gx, gz)) continue;
        if (r > 0.3) continue;
        kind = r < 0.16 ? 'tree' : r < 0.2 ? 'tree2' : 'rock';
      } else if (biome === 'gale') {
        // wind-scoured downs: rock outcrops everywhere, trees almost never
        // (what survives grows stunted in the render dressing)
        if (r > 0.22) continue;
        kind = r < 0.04 ? 'tree' : r < 0.07 ? 'tree2' : 'rock';
      } else {
        if (r > 0.44) continue;
        kind = r < 0.2 ? 'tree' : r < 0.24 ? 'tree2' : 'rock';
      }
      // grid cells outside every zone rect are open sea between columns
      let inRect = false;
      for (const zn of ZONES) {
        if (gz < zn.zMin || gz >= zn.zMax) continue;
        if (gx < (zn.xMin ?? STRIP_MIN_X) || gx >= (zn.xMax ?? STRIP_MAX_X)) continue;
        inRect = true;
        break;
      }
      if (!inRect) continue;
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
