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
  { x: 511, z: 2218, r: 25 }, // the isle's body
  { x: 508, z: 2240, r: 15 }, // ...its north shoulder (the summit's footing,
  // wide enough that the high tiers' rims run out on dry ground)
  { x: 517, z: 2201, r: 12 }, // ...its south shoulder (the bridgehead beach)
  { x: 522, z: 2214, r: 10 }, // ...the east beach ramp (bank gradient)
  { x: 518, z: 2230, r: 10 }, // ...the northeast beach ramp (bank gradient)
  { x: 503, z: 2212, r: 14 }, // ...the west shoulder, stretched so the
  // bridgehead beach climbs gently out of the strait (bank gradient)
] as const;
export const EMBER_BAYS = [
  { x: 195, z: 1980, r: 50 }, // the west bight
  // the east reach, drawn north of its old eye so its suppression frees
  // the Forgefather's Isle water while still carving the coast above
  { x: 538, z: 2162, r: 46 },
  { x: 205, z: 2230, r: 40 }, // a western cove under the spur
  // the Forgefather's Strait: pulls the Trollmoot coast inland so the
  // isle stands offshore (the bridge's water)
  { x: 488, z: 2212, r: 18 },
] as const;

/** The Forgefather's Isle fortress tiers: flat build plateaus with smooth
 *  approach ramps (the quay-pad idiom, stacked). Each tier's centre drifts
 *  north of the one below, so every tier keeps a broad south-facing
 *  crescent of flat ground and the mountain climbs away from the strait:
 *  bridgehead onto tier one, switchbacks up the south faces. Applied over
 *  the isle lobes; the raid entrance slice furnishes them. */
export const FORGEFATHER_ISLE_TERRAIN_EDITS: HeightStamp[] = [
  // the bridgehead terrace: level the strait-side landing to a low dry
  // beach first (3.3 over the waterline, above the coast sweep's
  // shore-rooted band), so the climb onto tier one starts from exempt
  // ground and the approach band's own steps stay small
  { x: 501, z: 2210, radius: 14, delta: -1, falloff: 'smooth', mode: 'level' },
  // ...and the northeast landing's twin, under the high tiers' seaward rims
  { x: 516, z: 2232, radius: 10, delta: -1, falloff: 'smooth', mode: 'level' },
  { x: 511, z: 2212, radius: 17, delta: 2, falloff: 'smooth', mode: 'level' },
  { x: 511, z: 2212, radius: 12, delta: 2, falloff: 'flat', mode: 'level' },
  { x: 509, z: 2221, radius: 15, delta: 6.5, falloff: 'smooth', mode: 'level' },
  { x: 509, z: 2221, radius: 9.5, delta: 6.5, falloff: 'flat', mode: 'level' },
  { x: 506, z: 2229, radius: 10.5, delta: 11, falloff: 'smooth', mode: 'level' },
  { x: 506, z: 2229, radius: 6, delta: 11, falloff: 'flat', mode: 'level' },
  { x: 504, z: 2236, radius: 6.5, delta: 15, falloff: 'smooth', mode: 'level' },
  { x: 504, z: 2236, radius: 3, delta: 15, falloff: 'flat', mode: 'level' },
];
