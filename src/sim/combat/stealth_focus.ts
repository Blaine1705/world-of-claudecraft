// "Nobody has eyes on me any more": the targeting half of entering stealth.
//
// Concealment used to change only what a hostile could ACQUIRE, never what it
// was ALREADY holding. A hunter or warlock pet that had the rogue as its
// aggroTargetId kept it across the stealth cast: updatePet only drops a held
// target when petCanSeeTarget fails, and a stealthed player inside the pet's
// detection radius still passes that, so the pet carried on beating on someone
// the owner could no longer see or click. Same shape for a hostile player's own
// selection, which simply stayed pointed at the vanished rogue.
//
// Entering stealth now clears the caster out of every hostile's focus:
//   - mobs and pets lose the hate-table entry, the taunt lock, and the aggro
//     target (dropThreat owns the forcedTargetId release);
//   - hostile players lose the selection, the auto-attack it was feeding, and
//     any swing they had queued onto it.
// Re-acquisition afterwards is unchanged and still goes through the ordinary
// stealth-perception rules (threat.canDetectStealthedTarget), so this removes
// the STALE lock rather than making stealth undetectable.
//
// `src/sim`-pure: no rng, no clock, no DOM. Every mutation is in-place on the
// entities the seam already owns (the module-wide immutability waiver that the
// rest of src/sim/combat runs under).
import type { SimContext } from '../sim_context';
import { dropThreat } from '../threat';
import type { Entity } from '../types';

/**
 * Remove `focusIds` from every hostile MOB's threat table, taunt lock and aggro
 * target, and settle whatever that leaves behind (an owned pet with nothing to
 * hit leaves combat; a wild mob with an empty table evades home).
 *
 * Shared by the Smokestep combat drop and the stealth-entry clear below so the
 * mob-side rules exist once.
 */
export function dropHostileMobFocus(
  ctx: SimContext,
  reference: Entity,
  focusIds: readonly number[],
): void {
  for (const entity of ctx.entities.values()) {
    if (entity.kind !== 'mob' || entity.dead || !ctx.isHostileTo(reference, entity)) continue;
    let dropped = false;
    for (const id of focusIds) {
      if (entity.threat.has(id) || entity.forcedTargetId === id) dropped = true;
      dropThreat(entity, id);
      if (entity.aggroTargetId === id) {
        entity.aggroTargetId = null;
        dropped = true;
      }
    }
    if (!dropped) continue;
    if (entity.ownerId !== null) {
      if (entity.aggroTargetId === null) entity.inCombat = false;
    } else if (entity.threat.size === 0 && entity.aggroTargetId === null) {
      entity.aiState = 'evade';
      entity.inCombat = false;
    }
  }
}

/**
 * Entering stealth: drop the caster out of every hostile's targeting. Covers
 * hostile players as well as mobs and pets, and deliberately leaves the
 * CASTER's own target alone (a rogue slips into Duskveil precisely to open on
 * what they are already looking at).
 */
export function clearHostileTargetingOnStealth(ctx: SimContext, hidden: Entity): void {
  dropHostileMobFocus(ctx, hidden, [hidden.id]);
  for (const entity of ctx.entities.values()) {
    if (entity.kind !== 'player' || entity.dead || entity.id === hidden.id) continue;
    if (entity.targetId !== hidden.id || !ctx.isHostileTo(hidden, entity)) continue;
    entity.targetId = null;
    entity.autoAttack = false;
    entity.queuedOnSwing = null;
    delete entity.queuedOnSwingFree;
    delete entity.queuedOnSwingCostMultiplier;
    // combatTimer is deliberately untouched: losing sight of one opponent is
    // not leaving the fight, and forcing it would drop a hostile who is still
    // swinging at somebody else out of combat.
  }
}
