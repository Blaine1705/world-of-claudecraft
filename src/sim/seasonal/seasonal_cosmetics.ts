// The seasonal cosmetic auras: the worn pumpkin head and the trick-or-treat
// tricks. Every one is kind 'seasonal_cosmetic', which no sim rule reads: no stat
// fold, no control, no damage. The client draws them (render: the head piece on
// the head bone, the bat and skeleton through the polymorph slot's look, the
// fumes as a smoke cloud). `undispellable` keeps every player counter (dispel,
// cleanse, right-click cancel) off them: the head comes off with its own item,
// a trick runs out on its own short timer.
import { GOURDLIGHT_TRICKS, PUMPKIN_HEAD_AURA_ID } from '../content/gourdlight_eve';
import type { SimContext } from '../sim_context';
import type { Aura, Entity } from '../types';

/** Every seasonal cosmetic aura id: what the close-of-event sweep strips. */
export const SEASONAL_COSMETIC_AURA_IDS: ReadonlySet<string> = new Set([
  PUMPKIN_HEAD_AURA_ID,
  ...GOURDLIGHT_TRICKS.map((trick) => trick.id),
]);

export function pumpkinHeadAura(sourceId: number): Aura {
  return {
    id: PUMPKIN_HEAD_AURA_ID,
    name: 'Carved Pumpkin Head',
    kind: 'seasonal_cosmetic',
    value: 0,
    remaining: 0,
    duration: 0,
    permanent: true,
    undispellable: true,
    sourceId,
    school: 'physical',
  };
}

export function trickAura(trickIndex: number, sourceId: number): Aura {
  const trick = GOURDLIGHT_TRICKS[trickIndex] ?? GOURDLIGHT_TRICKS[0];
  return {
    id: trick.id,
    name: trick.name,
    kind: 'seasonal_cosmetic',
    value: 0,
    remaining: trick.duration,
    duration: trick.duration,
    undispellable: true,
    sourceId,
    school: 'physical',
  };
}

/** Remove one seasonal cosmetic aura by id, announcing the fade like any aura
 *  that runs out. True when one was worn. */
export function stripSeasonalAura(ctx: SimContext, e: Entity, auraId: string): boolean {
  const index = e.auras.findIndex((a) => a.id === auraId && a.kind === 'seasonal_cosmetic');
  if (index < 0) return false;
  const [removed] = e.auras.splice(index, 1);
  ctx.emit({ type: 'aura', targetId: e.id, name: removed.name, gained: false });
  return true;
}

/** Any trick currently playing on this body (one at a time: a new trick replaces it). */
export function stripTricks(ctx: SimContext, e: Entity): void {
  for (const trick of GOURDLIGHT_TRICKS) stripSeasonalAura(ctx, e, trick.id);
}

/** Play trick `trickIndex` on `e` (replacing any trick already playing). */
export function playTrick(
  ctx: SimContext,
  e: Entity,
  trickIndex: number,
  sourceId: number,
): string {
  stripTricks(ctx, e);
  const aura = trickAura(trickIndex, sourceId);
  ctx.applyAura(e, aura);
  return aura.id;
}
