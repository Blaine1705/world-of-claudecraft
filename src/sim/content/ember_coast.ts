import type { HeightStamp } from '../types';

// The Drakelands' coast tables: the metaball land lobes and carved bays
// world.ts's ember coast applier builds its landness fields from (see the
// banner comment above applyEmberCoast there). Data-as-code, extracted from
// world.ts under the monolith ratchet; edit values here, the field math
// stays in world.ts.
//
// The landmass: a gatewood shore fused to the causeway landing, widening
// into the desert body, then a broad volcanic belt spanning the far north
// (the Drakemaw range doubles as the sealed wall's footing where it meets
// land; over the flanks the range simply runs into the sea).
export const EMBER_LAND_LOBES = [
  { x: 404, z: 1825, r: 40 }, // the causeway landing, fused across the border
  { x: 404, z: 1858, r: 52 }, // the Wyrmgate shore and Wyrmwatch
  { x: 360, z: 1900, r: 70 }, // the Gatewood
  { x: 450, z: 1920, r: 55 }, // eastern gatewood shore
  { x: 455, z: 1995, r: 55 }, // the Last Spring headland
  { x: 290, z: 1940, r: 60 }, // western gatewood shore
  { x: 380, z: 2030, r: 90 }, // the drying midlands
  { x: 280, z: 2080, r: 65 }, // Mirage Hollow's dune shelf
  { x: 262, z: 2020, r: 46 }, // ...its southern shoulder under the dune road
  { x: 274, z: 2170, r: 48 }, // ...and the shelf road's western shoulder
  { x: 470, z: 2070, r: 70 }, // eastern dunes
  { x: 465, z: 2150, r: 60 }, // Trollmoot's rise
  { x: 405, z: 2170, r: 55 }, // the dune saddle carrying the Trollmoot fork
  { x: 340, z: 2160, r: 85 }, // the Cinder Dunes' heart
  { x: 420, z: 2260, r: 80 }, // approach to the Drakemaw
  { x: 360, z: 2238, r: 45 }, // the saddle carrying the Snowline road
  { x: 290, z: 2250, r: 75 }, // the Bloodglass shelf
  { x: 360, z: 2355, r: 95 }, // the Drakemaw belt
  { x: 490, z: 2330, r: 60 }, // eastern volcanic spur
  { x: 220, z: 2340, r: 55 }, // western volcanic spur
  { x: 450, z: 2400, r: 70 }, // the rim belt, wide under the sealed range
  { x: 270, z: 2400, r: 70 },
  { x: 360, z: 2410, r: 80 },
  { x: 242, z: 2080, r: 42 }, // the Snowline crossing's waste-side shoulder
  { x: 208, z: 2080, r: 40 }, // ...carried to the column border
  { x: 216, z: 1930, r: 44 }, // the Snowline's waste-side shoulder
  { x: 236, z: 1972, r: 46 }, // ...rising onto the dune shelf road
  { x: 376, z: 1952, r: 42 }, // the town road's western shoulder
  { x: 242, z: 1858, r: 46 }, // the cap's shore joining the Gatewood...
  { x: 264, z: 1908, r: 44 }, // ...so no channel runs behind it to the sound
  { x: 492, z: 2390, r: 48 }, // the Goldmelt Water's east cap, waste side
  // The Forgefather's Isle: the Ignivar raid entrance rises off the
  // Trollmoot coast (high x renders WEST on the world map), a terraced
  // volcanic islet the owner's bridge asset will span from the mainland
  // (docs/design/ignivar-entrance/plan.md). The fortress tier plateaus
  // are stamped by FORGEFATHER_ISLE_TERRAIN_EDITS below.
  { x: 512, z: 2220, r: 32 }, // the isle's body, grown grand
  { x: 509, z: 2250, r: 21 }, // ...its north shoulder (the summit's footing,
  // wide enough that the high tiers' rims run out on dry ground)
  { x: 514, z: 2192, r: 16 }, // ...its south shoulder (the south strand)
  { x: 524, z: 2216, r: 12 }, // ...the east beach ramp (bank gradient)
  { x: 520, z: 2240, r: 12 }, // ...the northeast beach ramp (bank gradient)
  { x: 500, z: 2210, r: 15 }, // ...the west shoulder, stretched so the
  // bridgehead beach climbs gently out of the strait (bank gradient)
  { x: 498, z: 2232, r: 12 }, // ...the northwest beach ramp (bank gradient)
] as const;
export const EMBER_BAYS = [
  { x: 195, z: 1980, r: 50 }, // the west bight
  // the east reach, drawn north of its old eye so its suppression frees
  // the Forgefather's Isle water while still carving the coast above
  { x: 538, z: 2162, r: 46 },
  { x: 205, z: 2230, r: 40 }, // a western cove under the spur
  // the Forgefather's Strait, widened for the grand isle: the Trollmoot
  // coast pulls further inland (the two eyes) so open water rings every
  // face and the owner's bridge earns its length
  { x: 478, z: 2210, r: 24 },
  { x: 478, z: 2242, r: 14 },
] as const;

/** The staircase GLB's nose line, measured from the shipped model: a flat
 *  top landing over the first 12.5% of the length, then tread noses
 *  descending at 0.845 per yd to ground zero at the bottom end (native
 *  landing height 0.74 at scale 1). Walking bodies climb each placed
 *  staircase on REAL standable tread platforms derived from the same
 *  numbers (src/sim/forgefather_fortress.ts staircaseTreadColliders); the
 *  stamps below only sculpt a cosmetic under-bank riding `clear` beneath
 *  the nose line, so the solid stair wedge always meets ground instead of
 *  spanning a void and no rock ever pokes up through the treads. `clear`
 *  absorbs the level-stamp cascade's uphill bias (later stamps win, so a
 *  marching ramp settles above its targets by roughly a third of its
 *  radius times the grade); the wedge is solid to its base plane, so a
 *  bank sitting anywhere under the noses is fully hidden. Three stamp
 *  lanes cover the stair's width; the lead-in holds the lower court's
 *  walk surface so ground beside the buried bottom steps never dips. */
export const STAIR_GRADE = 0.845; // nose-line slope, yd of rise per yd of run
export const STAIR_LANDING_HEIGHT = 0.74; // native top-landing height at scale 1
export const STAIR_LANDING_START = 0.875; // the landing begins at this length fraction
const RAMP_STEP = 0.75; // stamp spacing along the climb

interface StairRampSpec {
  x: number; // the staircase placement's centre...
  z: number;
  ryDeg: number; // ...its yaw in degrees...
  scale: number;
  y: number; // ...and its seated base height (the nose line's bottom end)
  courtLow: number; // the lower court's walk surface (its floor-plate top)
  clear: number; // bank target depth under the nose line (pre-bias)
  lanes: readonly number[]; // lateral lane offsets covering the stair width
  radius: number;
  lead?: number; // distance from the bottom end where stamping begins
}

function stairRampStamps(spec: StairRampSpec): HeightStamp[] {
  const rad = (spec.ryDeg * Math.PI) / 180;
  const ux = -Math.cos(rad); // climb direction, bottom end toward the top
  const uz = Math.sin(rad);
  const bottomX = spec.x - (ux * spec.scale) / 2;
  const bottomZ = spec.z - (uz * spec.scale) / 2;
  const landingD = spec.scale * STAIR_LANDING_START;
  const landingH = spec.y + STAIR_LANDING_HEIGHT * spec.scale;
  const crossD = (spec.courtLow + spec.clear - spec.y) / STAIR_GRADE;
  const start = spec.lead ?? Math.max(0, crossD - 0.9);
  const steps = Math.ceil((landingD - start) / RAMP_STEP);
  const round = (value: number) => Math.round(value * 100) / 100;
  const out: HeightStamp[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = start + ((landingD - start) * i) / steps;
    const nose = Math.min(landingH, spec.y + STAIR_GRADE * d);
    const delta = round(Math.max(spec.courtLow - 0.05, nose - spec.clear));
    for (const lane of spec.lanes)
      out.push({
        x: round(bottomX + ux * d - uz * lane),
        z: round(bottomZ + uz * d + ux * lane),
        radius: spec.radius,
        delta,
        falloff: 'smooth',
        mode: 'level',
      });
  }
  return out;
}

/** The Forgefather's Isle fortress tiers: flat build plateaus with smooth
 *  approach ramps (the quay-pad idiom, stacked). Each tier's centre drifts
 *  north of the one below, so every tier keeps a broad south-facing
 *  crescent of flat ground and the mountain climbs away from the strait:
 *  bridgehead onto tier one, switchbacks up the south faces. Applied over
 *  the isle lobes; the raid entrance slice furnishes them. */
export const FORGEFATHER_ISLE_TERRAIN_EDITS: HeightStamp[] = [
  // The five fortress tiers first...
  { x: 513, z: 2206, radius: 22, delta: 2, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2206, radius: 16, delta: 2, falloff: 'flat', mode: 'level' },
  { x: 510, z: 2220, radius: 18, delta: 6.5, falloff: 'smooth', mode: 'level' },
  { x: 510, z: 2220, radius: 12, delta: 6.5, falloff: 'flat', mode: 'level' },
  { x: 507, z: 2232, radius: 13.5, delta: 11, falloff: 'smooth', mode: 'level' },
  { x: 507, z: 2232, radius: 8.5, delta: 11, falloff: 'flat', mode: 'level' },
  { x: 505, z: 2242, radius: 9.5, delta: 15, falloff: 'smooth', mode: 'level' },
  { x: 505, z: 2242, radius: 5.5, delta: 15, falloff: 'flat', mode: 'level' },
  { x: 503, z: 2250, radius: 6, delta: 19, falloff: 'smooth', mode: 'level' },
  { x: 503, z: 2250, radius: 3, delta: 19, falloff: 'flat', mode: 'level' },
  // ...then the shore landings LAST, so they carve authoritatively into
  // the tier flanks (stamps apply in array order; an earlier landing was
  // silently re-lifted by the tier rims above it). Each levels its shore
  // band to a low dry terrace (3.3 over the waterline, above the coast
  // sweep's shore-rooted band), so climbs start from exempt ground.
  { x: 499, z: 2203, radius: 18, delta: -1, falloff: 'smooth', mode: 'level' }, // bridgehead
  { x: 514, z: 2239, radius: 7, delta: 7, falloff: 'smooth', mode: 'level' }, // upper east shelf
  { x: 517, z: 2232, radius: 9, delta: 3.5, falloff: 'smooth', mode: 'level' }, // east mid shelf
  { x: 521, z: 2239, radius: 10, delta: -1, falloff: 'smooth', mode: 'level' }, // northeast landing
  { x: 514, z: 2249, radius: 8, delta: -1, falloff: 'smooth', mode: 'level' }, // north landing
  // The fortress courts (the owner's baked pass,
  // src/sim/forgefather_fortress.ts): ground leveled flush under the placed
  // floor plates. The tier-one and south-bailey floors already sit on their
  // tiers' own flats.
  // The middle court's pair sits SOUTH-SHRUNK on purpose: its old r13/r9
  // discs at (508, 2219) applied after the tier-three stamps and re-leveled
  // tier three's ground under the court plates down toward 6.3, digging a
  // 3-5yd trench that hard-stuck a walker standing on the plates above it
  // (the movement kernel's steepness and terrain-wall gates read the RAW
  // heightfield even under a platform-stander).
  { x: 508, z: 2216.5, radius: 11, delta: 6.3, falloff: 'smooth', mode: 'level' }, // middle court
  { x: 508, z: 2216.5, radius: 7, delta: 6.3, falloff: 'flat', mode: 'level' },
  { x: 504.3, z: 2241.2, radius: 8, delta: 14.7, falloff: 'smooth', mode: 'level' }, // upper landing
  { x: 504.3, z: 2241.2, radius: 5, delta: 14.7, falloff: 'flat', mode: 'level' },
  // ...and the stair ramps: each placed staircase dresses a smooth ramp
  // generated from its own nose line (stairRampStamps above), so every
  // flight is climbable ground with no rock above the treads.
  // the bailey stair, forecourt plates up to the middle court
  ...stairRampStamps({
    x: 507.8,
    z: 2207.2,
    ryDeg: 90,
    scale: 9,
    y: 0.33,
    courtLow: 2.64,
    clear: 1.9,
    lanes: [-2.7, 2.7, 0],
    radius: 3.2,
  }),
  // the court stair, middle court up to tier three (the lead-in bridges
  // the gap from the court plates' north edge)
  ...stairRampStamps({
    x: 504.1,
    z: 2221.4,
    ryDeg: 90,
    scale: 9,
    y: 5.03,
    courtLow: 6.94,
    clear: 1.9,
    lanes: [-2.7, 2.7, 0],
    radius: 3.2,
    lead: 2.0,
  }),
  // the upper stair, tier three up to the landing court
  ...stairRampStamps({
    x: 503.35,
    z: 2234.15,
    ryDeg: 90,
    scale: 6,
    y: 10.95,
    courtLow: 11.64,
    clear: 1.5,
    lanes: [-1.9, 1.9, 0],
    radius: 2.6,
  }),
  // the keep stair, landing court up to the summit...
  ...stairRampStamps({
    x: 503.05,
    z: 2242.4,
    ryDeg: 90,
    scale: 6,
    y: 14.61,
    courtLow: 15.34,
    clear: 1.5,
    lanes: [-1.9, 1.9, 0],
    radius: 2.6,
  }),
  // ...plus the summit pads: the raw ground grades from the keep flight's
  // bank up onto the summit flat with no step past the terrain-wall gate,
  // because the movement kernel reads the raw heightfield even while the
  // body stands on the landing platform above it.
  { x: 503.05, z: 2245.1, radius: 2.4, delta: 18.75, falloff: 'smooth', mode: 'level' },
  { x: 503.1, z: 2246.2, radius: 2.8, delta: 18.98, falloff: 'smooth', mode: 'level' },
  { x: 503.1, z: 2247.8, radius: 2.8, delta: 19.0, falloff: 'smooth', mode: 'level' },
  // the quay stair, waterside quay up through the gate (the lead-in
  // bridges the gap from the quay plates' east edge)
  ...stairRampStamps({
    x: 497.05,
    z: 2200.45,
    ryDeg: 180,
    scale: 9,
    y: -3.97,
    courtLow: -1.86,
    clear: 2.0,
    lanes: [-2.7, 2.7, 0],
    radius: 3.2,
    lead: 0.75,
  }),
  // the mainland shore stair, bridge deck up the dune toward the road...
  ...stairRampStamps({
    x: 443.75,
    z: 2183.35,
    ryDeg: 270,
    scale: 7,
    y: -3.38,
    courtLow: -1.63,
    clear: 1.6,
    lanes: [-2.2, 2.2, 0],
    radius: 2.8,
    lead: 1.0,
  }),
  // ...and its dune apron: the shore dune dips right at the stair's top
  // end, so one pad keeps the step off the landing inside the step limit.
  { x: 443.8, z: 2178.5, radius: 2.5, delta: 1.55, falloff: 'smooth', mode: 'level' },
  // ...and its west flank softened: the shore chunk meshes at the coarse
  // LOD bands (2.6/6.5yd), and chords over the burial band's shoulder rode
  // up to 1.35yd across the flight's silhouette; sinking the shoulder puts
  // the rendered chords under the tread line at every LOD.
  { x: 440.3, z: 2185.5, radius: 2, delta: -3.0, falloff: 'smooth', mode: 'level' },
  { x: 440.3, z: 2183.8, radius: 2, delta: -2.4, falloff: 'smooth', mode: 'level' },
  // Stuck-pocket escapes (found by the movement flood scan): the gate
  // passage pocket, the middle court's north-wall strip, and the alley
  // between the summit flank and the sea-ring wall each get a walkable
  // way back out.
  { x: 500.5, z: 2203.5, radius: 3, delta: -0.3, falloff: 'smooth', mode: 'level' },
  // ...the north-wall strip's channel notch graded flat, so the walk east
  // onto the shelf ladder never crosses a steepness-gated cell...
  { x: 511.5, z: 2227.2, radius: 2, delta: 6.4, falloff: 'smooth', mode: 'level' },
  { x: 512.8, z: 2227.2, radius: 2, delta: 6.7, falloff: 'smooth', mode: 'level' },
  { x: 513.3, z: 2227.6, radius: 2.2, delta: 6.8, falloff: 'smooth', mode: 'level' },
  { x: 514.3, z: 2229.4, radius: 2.2, delta: 7.2, falloff: 'smooth', mode: 'level' },
  { x: 514.3, z: 2231.4, radius: 2.2, delta: 7.1, falloff: 'smooth', mode: 'level' },
  { x: 512.4, z: 2246, radius: 2.6, delta: -1.15, falloff: 'smooth', mode: 'level' },
  { x: 512.4, z: 2250, radius: 2.6, delta: -1.1, falloff: 'smooth', mode: 'level' },
  { x: 519.5, z: 2236.5, radius: 2.4, delta: 1.2, falloff: 'smooth', mode: 'level' },
  { x: 518.5, z: 2234, radius: 2.4, delta: 2.5, falloff: 'smooth', mode: 'level' },
  { x: 516, z: 2244.8, radius: 2.2, delta: 3.2, falloff: 'smooth', mode: 'level' },
  // Deck-edge understamps: wherever a walk deck floats within half a yard
  // of steep raw ground, the kernel's steep-strip can fire while the deck
  // pins the body (the freeze-spot rule in the walkability gate). Sinking
  // the roofed ground under those edges past the platform-carry clearance
  // hands the stander the kernel's deck exemption; every dip is under a
  // deck plate, invisible.
  { x: 449.5, z: 2198.6, radius: 2, delta: -2.3, falloff: 'smooth', mode: 'level' },
  { x: 450.2, z: 2200.2, radius: 1.8, delta: -2.4, falloff: 'smooth', mode: 'level' },
  { x: 497, z: 2208.5, radius: 2.2, delta: -2.6, falloff: 'smooth', mode: 'level' },
  { x: 507, z: 2244, radius: 1.8, delta: 14.6, falloff: 'smooth', mode: 'level' },
  { x: 507.3, z: 2254, radius: 1.8, delta: -2.2, falloff: 'smooth', mode: 'level' },
  // ...and the sea-pool postern: the walled pool and its keep-side alley
  // are droppable-into by design (off the summit flank), and their one
  // walkable way out runs south along the keep's east face. The flood
  // scan found the exits sealed by single just-over-limit steps; these
  // levelers open them (the pool's swimmers escape through the alley).
  { x: 513, z: 2241.0, radius: 2.2, delta: 4.6, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2242.2, radius: 2.2, delta: 3.8, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2243.4, radius: 2.2, delta: 3.0, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2244.6, radius: 2.2, delta: 2.2, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2245.8, radius: 2.2, delta: 1.4, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2247.0, radius: 2.2, delta: 0.6, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2248.2, radius: 2.2, delta: -0.2, falloff: 'smooth', mode: 'level' },
  { x: 513, z: 2249.4, radius: 2.2, delta: -1.0, falloff: 'smooth', mode: 'level' },
  // ...and the northwest slot between the west ring wall and the flank
  // fills to a dead-end balcony shelf (a 12 yd deep two-cell slot has no
  // walkable ladder; terrain is the answer): FLAT stamps hold the shelf
  // sag-free between the walls, the smooth ladder grades its south
  // approach down from the rim, and the only way out is the way in.
  { x: 496, z: 2247, radius: 3, delta: 6.7, falloff: 'flat', mode: 'level' },
  { x: 496, z: 2251.5, radius: 3, delta: 6.5, falloff: 'flat', mode: 'level' },
  { x: 496, z: 2242.5, radius: 3, delta: 7.1, falloff: 'flat', mode: 'level' },
  { x: 496, z: 2237, radius: 2.4, delta: 8.3, falloff: 'smooth', mode: 'level' },
  { x: 496, z: 2238.5, radius: 2.4, delta: 7.9, falloff: 'smooth', mode: 'level' },
  { x: 496, z: 2240, radius: 2.4, delta: 7.5, falloff: 'smooth', mode: 'level' },
];
