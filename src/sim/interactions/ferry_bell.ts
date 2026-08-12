// The Proving Shore ferry bells (tutorial island): the crossing is a CLICKED
// world object, never a walk-in trigger, so nobody is teleported by wandering
// over a spot. Two bells share one itemId (content/proving_shore.ts
// PROVING_SHORE_OBJECTS): the Old Pier's bell sets the player down in
// Eastbrook town beside the spawn square, and the vale west strand's twin
// rings a returning player back to the island arrival for a refresher.
// interaction.ts routes the click here BEFORE the quest-pickup path (the
// firebottle_hut precedent), so a bare click always sails instead of denying.
//
// Draws ZERO rng (displacePlayer only moves and emits), so the click's tick
// position cannot fork the deterministic draw order. `src/sim`-pure.

import { PROVING_SHORE_ARRIVAL } from '../content/proving_shore';
import { displacePlayer } from '../displacement';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

export const FERRY_BELL_OBJECT_ID = 'ps_ferry_bell';

/** Where the island bell sets a graduate down: Eastbrook town, a few strides
 *  off the spawn square so an arrival never stacks on a fresh spawn. */
export const FERRY_BELL_TOWN_LANDING = { x: 4, z: -6, facing: 0.6 } as const;

/** Ring a ferry bell: travel to the OTHER shore, decided by which side of
 *  the strait the clicked bell stands on. In combat the crossing refuses
 *  (the startTutorial gate's wording), so the bell can never be a combat
 *  exit. Always returns true: the click was the bell's, even when refused. */
export function tryRingFerryBell(ctx: SimContext, obj: Entity, p: Entity): boolean {
  if (p.inCombat) {
    ctx.error(p.id, 'You cannot set sail from here.');
    return true;
  }
  if (obj.pos.x < -180) {
    displacePlayer(
      ctx,
      p,
      FERRY_BELL_TOWN_LANDING,
      'The crossing takes hold, and Eastbrook Vale spreads out before you.',
    );
    // Text-free homecoming marker: the HUD points out the town's twin bell
    // the first time (its own localStorage one-shot), in case the ride was a
    // misclick. Emitted every ride; the one-shot is presentation-only.
    ctx.emit({ type: 'ferryBellHome', pid: p.id });
  } else {
    displacePlayer(
      ctx,
      p,
      PROVING_SHORE_ARRIVAL,
      'The ferry bell tolls, and the Proving Shore rises to meet you.',
    );
  }
  return true;
}
