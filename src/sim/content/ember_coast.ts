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
  // The Forgefather's Isle: the Ignivar raid entrance rises in the western
  // cove (docs/design/ignivar-entrance/plan.md), a volcanic islet the
  // owner's bridge asset will span from the Bloodglass shore.
  { x: 214, z: 2256, r: 26 }, // the isle's volcanic body
  { x: 205, z: 2271, r: 15 }, // ...its west shoulder
  { x: 216, z: 2242, r: 12 }, // ...its southwest face, held against the cove
  { x: 218, z: 2268, r: 12 }, // ...the north tip's beach ramp (bank gradient)
] as const;
export const EMBER_BAYS = [
  { x: 195, z: 1980, r: 50 }, // the west bight
  { x: 535, z: 2180, r: 55 }, // the east reach
  { x: 198, z: 2224, r: 36 }, // a western cove under the spur (pulled
  // northwest so the Forgefather's Isle escapes its suppression)
  // the Forgefather's Strait: keeps the isle an island (the bridge's
  // water), the second eye severing the shelf's land bridge to the south
  { x: 242, z: 2260, r: 14 },
  { x: 236, z: 2238, r: 14 },
] as const;
