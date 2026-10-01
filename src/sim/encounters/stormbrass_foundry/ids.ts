// The Stormbrass Foundry's encounter ids and tuning, as a dependency-free leaf:
// the content (stormbrass_foundry.ts), the encounter modules, the trash kit's
// death bursts (mob/trash_kit/foundry_kit.ts), the dev helpers, the renderer's
// telegraphs and the tests all key on these.
//
// docs/design/dungeon-rework/stormbrass_foundry.md sections 4.3 and 5.

export const FOUNDRY_DUNGEON = 'stormbrass_foundry';

/** The four bosses, in route order (their cores are phase 2). */
export const TOCK_ID = 'line_master_tock';
export const RANGEWARDEN_ID = 'rangewarden';
export const VOLTAIC_WARDEN_ID = 'voltaic_warden';
export const PRIME_DRAFT_ID = 'prime_draft';
/** The showpiece patrol of the Rail Yard. */
export const GANTRY_HAULER_ID = 'gantry_hauler';
/** The trash every kit add rides on. */
export const ARC_DRONE_ID = 'arc_drone';
export const TRIPOD_TURRET_ID = 'tripod_turret';

// ---- the Gantry Hauler (section 4.3) ------------------------------------------

/** Steam Blast: a telegraphed frontal cone that throws everyone in it back. */
export const HAULER_STEAM_BLAST = 'foundry_hauler_steam_blast';
/** Scrap Toss: the crane arm throws a plate at the farthest player. */
export const HAULER_SCRAP_TOSS = 'foundry_hauler_scrap_toss';
/** Unload: at half health it dumps Arc Drones from its bed. */
export const HAULER_UNLOAD = 'foundry_hauler_unload';
/** Boiler Rupture: the boiler bursts where it fell (its trashKit.deathBurst). */
export const HAULER_BOILER_RUPTURE = 'foundry_hauler_boiler_rupture';

/**
 * The Hauler's numbers (normal; heroic scales the damage through the claim's
 * mechanicDamageMult). Damage is stated LANDED on a level-20 cloth wearer of
 * about 950 health (README section 7): Steam Blast about 21 percent, Scrap
 * Toss about 23 percent, both avoidable; Boiler Rupture 16 percent.
 */
export const HAULER_TUNING = {
  blastEvery: 12,
  blastFirst: 6,
  blastCast: 1.5,
  blastRange: 12,
  blastArcDeg: 90,
  blastMin: 180,
  blastMax: 220,
  /** Yards the Steam Blast throws a player back. */
  blastKnockback: 10,
  tossEvery: 15,
  tossFirst: 9,
  /** The plate's warning on the floor before it lands. */
  tossWarning: 2,
  tossRadius: 5,
  tossMin: 200,
  tossMax: 240,
  /** Only a player within this reach of the Hauler is tossed at. */
  tossReach: 45,
  unloadAtHpPct: 0.5,
  unloadCount: 3,
} as const;

// ---- encounter objects: their template id carries their look -----------------

/** A death burst's ring building on the floor (scale = its radius). */
export const FOUNDRY_BURST_RING = 'foundry_burst_ring';
/** A Scrap Toss plate's landing mark (scale = its radius). */
export const FOUNDRY_SCRAP_MARK = 'foundry_scrap_mark';

/** Every Foundry encounter object the dungeon draws itself. */
export const FOUNDRY_OBJECT_TEMPLATES: ReadonlySet<string> = new Set([
  FOUNDRY_BURST_RING,
  FOUNDRY_SCRAP_MARK,
]);
