// The seasonal-event tick: opens and closes an event in the world. Runs once per
// sim tick, draws no rng, and does almost nothing on a tick where the active event
// did not change (one Map lookup, one walk of the player roster's worn flags).
//
// On open: the event's keeper NPC is raised under her reserved singleton id.
// On close: the keeper leaves and every seasonal cosmetic comes off every body.
// While open: a worn pumpkin head is put back on a body that lost it (a death, a
// relog), so wearing it is the character's standing choice for the whole event,
// for as long as the character still owns one (bags or bank): a head destroyed
// while worn comes off for good, never stuck on a body nothing can take it off.
import { countStacked } from '../bags';
import {
  CARVED_PUMPKIN_HEAD_ID,
  GOURDLIGHT_EVE_ID,
  GOURDLIGHT_KEEPER_ENTITY_ID,
  GOURDLIGHT_KEEPER_NPC,
  PUMPKIN_HEAD_AURA_ID,
} from '../content/gourdlight_eve';
import { createNpc } from '../entity';
import type { SimContext } from '../sim_context';
import type { NpcDef } from '../types';
import {
  pumpkinHeadAura,
  SEASONAL_COSMETIC_AURA_IDS,
  stripSeasonalAura,
  stripTricks,
} from './seasonal_cosmetics';
import { activeSeasonalEventOf } from './seasonal_state';

/** Each event's keeper: the NPC who stands in town while it runs. */
const EVENT_KEEPERS: Readonly<Record<string, { entityId: number; def: NpcDef }>> = {
  [GOURDLIGHT_EVE_ID]: { entityId: GOURDLIGHT_KEEPER_ENTITY_ID, def: GOURDLIGHT_KEEPER_NPC },
};

/** The seasonal event ids this build knows (the dev toggle validates against it). */
export const KNOWN_SEASONAL_EVENTS: readonly string[] = Object.keys(EVENT_KEEPERS);

function raiseKeeper(ctx: SimContext, eventId: string): void {
  const keeper = EVENT_KEEPERS[eventId];
  if (!keeper || ctx.entities.has(keeper.entityId)) return;
  const def = keeper.def;
  ctx.addEntity(createNpc(keeper.entityId, def, ctx.groundPos(def.pos.x, def.pos.z)));
}

function dismissKeeper(ctx: SimContext, eventId: string | null): void {
  const keeper = eventId ? EVENT_KEEPERS[eventId] : undefined;
  const npc = keeper && ctx.entities.get(keeper.entityId);
  if (keeper && npc && npc.templateId === keeper.def.id) ctx.dropEntity(keeper.entityId);
}

export function updateSeasonal(ctx: SimContext): void {
  const state = ctx.seasonal;
  const active = activeSeasonalEventOf(state);
  if (active !== state.lastActive) {
    dismissKeeper(ctx, state.lastActive);
    state.lastActive = active;
    if (active === null) {
      for (const meta of ctx.players.values()) {
        const e = ctx.entities.get(meta.entityId);
        if (!e) continue;
        for (const id of SEASONAL_COSMETIC_AURA_IDS) stripSeasonalAura(ctx, e, id);
      }
    }
  }
  if (active === null) return;
  raiseKeeper(ctx, active);
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e || e.dead) continue;
    // a trick body never fights: combat starting ends it (graphics fairness)
    if (e.inCombat) stripTricks(ctx, e);
    if (!meta.pumpkinHeadWorn) continue;
    const owned =
      countStacked(meta.inventory, CARVED_PUMPKIN_HEAD_ID) > 0 ||
      countStacked(meta.bank.inventory, CARVED_PUMPKIN_HEAD_ID) > 0;
    if (!owned) {
      meta.pumpkinHeadWorn = false;
      stripSeasonalAura(ctx, e, PUMPKIN_HEAD_AURA_ID);
      continue;
    }
    if (!e.auras.some((a) => a.id === PUMPKIN_HEAD_AURA_ID))
      ctx.applyAura(e, pumpkinHeadAura(e.id));
  }
}
