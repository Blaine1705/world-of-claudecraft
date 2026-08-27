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
];
