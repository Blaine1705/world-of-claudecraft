// Shared while-dead refusal for command families whose result event is
// emitted unconditionally by their Sim wrapper (the profession action
// family: craft/train/salvage/disenchant/enchant-apply/unbind/mobile-station,
// plus the rift forge trio, which owns its emits but takes the same gate).
//
// The gate runs BEFORE the resolver, so a refused command emits NO result
// event at all: the shared error line is the single player-facing surface
// (the tool-effect dead-gate precedent in professions/tool_effect_actions.ts),
// which keeps every family's wire reason enum untouched and cannot
// double-print against the family's own denial rendering. The literal
// already has a matcher row (error.cantWhileDead in src/ui/sim_i18n.ts), so
// both hosts localize it.
import type { SimContext } from './sim_context';

/** True when the command must be refused because the acting player is dead
 *  (released ghost included); emits the family's shared error line. False
 *  for an alive player AND for an unresolvable pid (the caller's own
 *  resolve keeps handling that arm the way it always did). */
export function refusedWhileDead(ctx: SimContext, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r || !r.e.dead) return false;
  ctx.error(r.meta.entityId, "You can't do that while dead.");
  return true;
}
