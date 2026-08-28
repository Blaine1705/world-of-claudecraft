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
  { x: 508, z: 2219, radius: 13, delta: 6.3, falloff: 'smooth', mode: 'level' }, // middle court
  { x: 508, z: 2219, radius: 9, delta: 6.3, falloff: 'flat', mode: 'level' },
  { x: 504.3, z: 2241.2, radius: 8, delta: 14.7, falloff: 'smooth', mode: 'level' }, // upper landing
  { x: 504.3, z: 2241.2, radius: 5, delta: 14.7, falloff: 'flat', mode: 'level' },
  // ...and the stair ramps: each placed staircase dresses a real
  // terrain ramp (stairs are walk-over props, never colliders), so the
  // climb is the ground itself. Dense riser ladders, one stamp per
  // 1.2 yd with sub-step height differences, tuned by the route probe
  // against MAX_STEP_HEIGHT.
  // the bailey stair, tier one up to the middle court
  { x: 507.8, z: 2203.5, radius: 2.4, delta: 2.64, falloff: 'smooth', mode: 'level' },
  { x: 507.8, z: 2204.7, radius: 2.4, delta: 3.25, falloff: 'smooth', mode: 'level' },
  { x: 507.8, z: 2205.8, radius: 2.4, delta: 3.86, falloff: 'smooth', mode: 'level' },
  { x: 507.8, z: 2207.0, radius: 2.4, delta: 4.47, falloff: 'smooth', mode: 'level' },
  { x: 507.8, z: 2208.2, radius: 2.4, delta: 5.08, falloff: 'smooth', mode: 'level' },
  { x: 507.8, z: 2209.3, radius: 2.4, delta: 5.69, falloff: 'smooth', mode: 'level' },
  { x: 507.8, z: 2210.5, radius: 2.4, delta: 6.3, falloff: 'smooth', mode: 'level' },
  // the court stair, middle court up to tier three
  { x: 504.1, z: 2216.5, radius: 2.4, delta: 6.94, falloff: 'smooth', mode: 'level' },
  { x: 504.1, z: 2217.6, radius: 2.4, delta: 7.52, falloff: 'smooth', mode: 'level' },
  { x: 504.1, z: 2218.8, radius: 2.4, delta: 8.1, falloff: 'smooth', mode: 'level' },
  { x: 504.1, z: 2219.9, radius: 2.4, delta: 8.68, falloff: 'smooth', mode: 'level' },
  { x: 504.1, z: 2221.0, radius: 2.4, delta: 9.26, falloff: 'smooth', mode: 'level' },
  { x: 504.1, z: 2222.1, radius: 2.4, delta: 9.84, falloff: 'smooth', mode: 'level' },
  { x: 504.1, z: 2223.3, radius: 2.4, delta: 10.42, falloff: 'smooth', mode: 'level' },
  { x: 504.1, z: 2224.4, radius: 2.4, delta: 11.0, falloff: 'smooth', mode: 'level' },
  // the upper stair, tier three up to the landing
  { x: 503.35, z: 2230.0, radius: 2.4, delta: 11.64, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2231.1, radius: 2.4, delta: 12.05, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2232.2, radius: 2.4, delta: 12.46, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2233.3, radius: 2.4, delta: 12.87, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2234.4, radius: 2.4, delta: 13.28, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2235.6, radius: 2.4, delta: 13.7, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2236.7, radius: 2.4, delta: 14.11, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2237.8, radius: 2.4, delta: 14.52, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2238.9, radius: 2.4, delta: 14.93, falloff: 'smooth', mode: 'level' },
  { x: 503.35, z: 2240.0, radius: 2.4, delta: 15.34, falloff: 'smooth', mode: 'level' },
  // the keep stair, landing up to the summit court
  { x: 503.05, z: 2242.0, radius: 2.4, delta: 15.34, falloff: 'smooth', mode: 'level' },
  { x: 503.05, z: 2243.2, radius: 2.4, delta: 15.95, falloff: 'smooth', mode: 'level' },
  { x: 503.05, z: 2244.3, radius: 2.4, delta: 16.56, falloff: 'smooth', mode: 'level' },
  { x: 503.05, z: 2245.5, radius: 2.4, delta: 17.17, falloff: 'smooth', mode: 'level' },
  { x: 503.05, z: 2246.7, radius: 2.4, delta: 17.78, falloff: 'smooth', mode: 'level' },
  { x: 503.05, z: 2247.8, radius: 2.4, delta: 18.39, falloff: 'smooth', mode: 'level' },
  { x: 503.05, z: 2249.0, radius: 2.4, delta: 19.0, falloff: 'smooth', mode: 'level' },
  // the quay stair, waterside quay up through the gate
  { x: 493.5, z: 2200.5, radius: 2.4, delta: -1.86, falloff: 'smooth', mode: 'level' },
  { x: 494.6, z: 2200.5, radius: 2.4, delta: -1.3, falloff: 'smooth', mode: 'level' },
  { x: 495.8, z: 2200.5, radius: 2.4, delta: -0.74, falloff: 'smooth', mode: 'level' },
  { x: 496.9, z: 2200.5, radius: 2.4, delta: -0.17, falloff: 'smooth', mode: 'level' },
  { x: 498.0, z: 2200.5, radius: 2.4, delta: 0.39, falloff: 'smooth', mode: 'level' },
  { x: 499.1, z: 2200.5, radius: 2.4, delta: 0.95, falloff: 'smooth', mode: 'level' },
  { x: 500.2, z: 2200.5, radius: 2.4, delta: 1.51, falloff: 'smooth', mode: 'level' },
  { x: 501.4, z: 2200.5, radius: 2.4, delta: 2.08, falloff: 'smooth', mode: 'level' },
  { x: 502.5, z: 2200.5, radius: 2.4, delta: 2.64, falloff: 'smooth', mode: 'level' },
  // Stuck-pocket escapes (found by the movement flood scan): the gate
  // passage pocket, the middle court's north-wall strip, and the alley
  // between the summit flank and the sea-ring wall each get a walkable
  // way back out.
  { x: 500.5, z: 2203.5, radius: 3, delta: -0.3, falloff: 'smooth', mode: 'level' },
  { x: 513.3, z: 2227.6, radius: 2.2, delta: 6.8, falloff: 'smooth', mode: 'level' },
  { x: 514.3, z: 2229.4, radius: 2.2, delta: 7.2, falloff: 'smooth', mode: 'level' },
  { x: 514.3, z: 2231.4, radius: 2.2, delta: 7.1, falloff: 'smooth', mode: 'level' },
  { x: 512.4, z: 2246, radius: 2.6, delta: -1.15, falloff: 'smooth', mode: 'level' },
  { x: 512.4, z: 2250, radius: 2.6, delta: -1.1, falloff: 'smooth', mode: 'level' },
  { x: 519.5, z: 2236.5, radius: 2.4, delta: 1.2, falloff: 'smooth', mode: 'level' },
  { x: 518.5, z: 2234, radius: 2.4, delta: 2.5, falloff: 'smooth', mode: 'level' },
  { x: 516, z: 2244.8, radius: 2.2, delta: 3.2, falloff: 'smooth', mode: 'level' },
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
