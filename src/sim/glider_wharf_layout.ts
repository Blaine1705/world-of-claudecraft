// Zephyr's launch wharf on the crest of the Shear (gale_launch_knoll.ts): a
// plank pier in the Wickharbor stilt-deck idiom (gale_harbor.ts GaleDeckDef),
// rooted on the flat crest and running out past its southern lip so the
// Windrider Slalom launches from the end of the planks with open air below.
// World quests round 2 replaced the stone flight tower with this; the plank
// plane is the tower's old deck height (GLIDER_WHARF_DECK_Y), so Flightmaster
// Zephyr and every authored course keep their coordinates, and only the launch
// perch moved out along the pier.
//
// WALKABLE raised ground: deck_surfaces.ts folds gliderWharfSurface into
// groundHeight beside the harbor decks, and render/gale_features.ts draws the
// planks and stilts from the same definitions, so the deck the player stands
// on is exactly the deck they see. Pure leaf: deterministic, terrain and water
// level are passed in. Tested by tests/glider_wharf_layout.test.ts.
import { deckListSurface, type GaleDeckDef } from './gale_harbor';

/** Root of the pier on the crest; the surface samples the terrain here. */
const WHARF_ROOT = { x: 450, z: 505 } as const;
/** The pier runs from the root out over the southern lip of the crest. */
const WHARF_HEADING = Math.atan2(-1.5, 24);

export const GLIDER_WHARF = {
  /** Where the wharf's plank run is centred (the deck rectangle centre). */
  x: 450,
  z: 519,
  /** The roadside updraft on the shelf below the launch cliff, between the
   *  paddock's east fence and the Wreckfields road: a player who fell short or
   *  walked down is carried back up to Zephyr (world_quest_glider.ts
   *  updateGliderLaunchUpdraft). */
  updraft: { x: 431, z: 556, radius: 3 },
} as const;

export const GLIDER_WHARF_DECKS: readonly GaleDeckDef[] = Object.freeze([
  {
    x: GLIDER_WHARF.x,
    z: GLIDER_WHARF.z,
    rot: WHARF_HEADING,
    hl: 14,
    hw: 2.4,
    ax: WHARF_ROOT.x,
    az: WHARF_ROOT.z,
  },
]);

// Bounding box for the cheap early-out.
const WHARF_X1 = GLIDER_WHARF.x - 20;
const WHARF_X2 = GLIDER_WHARF.x + 20;
const WHARF_Z1 = GLIDER_WHARF.z - 20;
const WHARF_Z2 = GLIDER_WHARF.z + 20;

/** The wharf plank surface at (x, z), or -Infinity off the planks. */
export function gliderWharfSurface(
  x: number,
  z: number,
  terrainAt: (x: number, z: number) => number,
  waterLevel: number,
): number {
  if (x < WHARF_X1 || x > WHARF_X2 || z < WHARF_Z1 || z > WHARF_Z2) return -Infinity;
  return deckListSurface(GLIDER_WHARF_DECKS, x, z, terrainAt, waterLevel);
}
