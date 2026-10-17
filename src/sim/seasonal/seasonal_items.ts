// The seasonal toys' use arms (items.ts useItem routes `use.type 'seasonal'` and
// the Gourdlight treat pouch here). Every arm is refused while the event is
// closed, so a cosmetic bought during the event waits in the bags for next year.

import { bagsFullError } from '../bags';
import {
  GOURDLIGHT_POUCH_SWEETS,
  GOURDLIGHT_SWEET_ID,
  GOURDLIGHT_TRICKS,
  PUMPKIN_HEAD_AURA_ID,
} from '../content/gourdlight_eve';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { Entity, ItemInstancePayload } from '../types';
import { playTrick, pumpkinHeadAura, stripSeasonalAura } from './seasonal_cosmetics';
import { activeSeasonalEventOf } from './seasonal_state';

export type SeasonalItemAction = 'pumpkinHead' | 'trickJar';

function eventClosed(ctx: SimContext, meta: PlayerMeta): boolean {
  if (activeSeasonalEventOf(ctx.seasonal) !== null) return false;
  ctx.emit({ type: 'seasonal', what: 'notActive', pid: meta.entityId });
  return true;
}

/** The Carved Pumpkin Head toggles on and off (never consumed); the Jar of
 *  Mischief plays a random trick on its user and is spent. */
export function useSeasonalItem(
  ctx: SimContext,
  meta: PlayerMeta,
  p: Entity,
  action: SeasonalItemAction,
  consumeOne: () => ItemInstancePayload | undefined,
): void {
  if (eventClosed(ctx, meta)) return;
  if (action === 'pumpkinHead') {
    if (meta.pumpkinHeadWorn) {
      meta.pumpkinHeadWorn = false;
      stripSeasonalAura(ctx, p, PUMPKIN_HEAD_AURA_ID);
      ctx.emit({ type: 'seasonal', what: 'pumpkinOff', pid: meta.entityId });
    } else {
      meta.pumpkinHeadWorn = true;
      if (!p.dead) ctx.applyAura(p, pumpkinHeadAura(p.id));
      ctx.emit({ type: 'seasonal', what: 'pumpkinOn', pid: meta.entityId });
    }
    meta.wireRev++;
    return;
  }
  // A trick body hides a fighter's class, weapon and casts: never mid-fight (the
  // fairness rule), and a trick already running drops the moment combat starts
  // (seasonal_tick.ts). Refused before any rng draw.
  if (p.inCombat) {
    ctx.error(meta.entityId, "You can't do that while in combat.");
    return;
  }
  consumeOne();
  const index = ctx.rng.int(0, GOURDLIGHT_TRICKS.length - 1);
  const trick = playTrick(ctx, p, index, p.id);
  ctx.emit({ type: 'seasonal', what: 'jarTrick', trick, pid: meta.entityId });
}

/** The rounds quest's pouch: opened, it hands over its sweets and is spent. A
 *  full bag keeps the pouch rather than losing the sweets. Works out of season:
 *  a pouch is already earned. */
export function openGourdlightPouch(
  ctx: SimContext,
  meta: PlayerMeta,
  consumeOne: () => ItemInstancePayload | undefined,
): void {
  if (!ctx.canAddItem(GOURDLIGHT_SWEET_ID, GOURDLIGHT_POUCH_SWEETS, meta.entityId)) {
    bagsFullError(ctx, meta.entityId, GOURDLIGHT_SWEET_ID);
    return;
  }
  consumeOne();
  ctx.addItem(GOURDLIGHT_SWEET_ID, GOURDLIGHT_POUCH_SWEETS, meta.entityId);
}
