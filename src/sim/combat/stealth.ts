import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

// When a player slips into stealth (Rogue Duskveil/Smokestep, Druid Stalk), every
// hostile hunter loses them: enemy players and pets drop their target, and mobs
// additionally drop the rogue from their hate table so they cannot re-acquire the
// instant stealth ends. This is the classic Vanish threat wipe. Duskveil and
// Stalk can only open OUT of combat, so nothing is targeting the caster and this
// is a no-op there; Smokestep (Vanish) is the in-combat escape that actually
// clears the board. Allies keep sight of a stealthed friend, so a party heal
// target is never dropped. Draws no rng and iterates the roster once, only on the
// occasional stealth-enter cast (never per tick).
export function dropTargetsOnStealth(ctx: SimContext, hidden: Entity): void {
  for (const e of ctx.entities.values()) {
    if (e.id === hidden.id) continue;
    if (e.kind === 'mob') {
      // Covers wild mobs AND enemy pets (a pet is an owned mob). Wipe the rogue
      // from the hate table and any taunt lock, then drop the live target.
      e.threat.delete(hidden.id);
      if (e.aggroTargetId === hidden.id) e.aggroTargetId = null;
      if (e.forcedTargetId === hidden.id) {
        e.forcedTargetId = null;
        e.forcedTargetTimer = 0;
      }
      if (e.targetId === hidden.id) e.targetId = null;
    } else if (e.kind === 'player' && e.targetId === hidden.id && ctx.isHostileTo(e, hidden)) {
      e.targetId = null;
    }
  }
}
