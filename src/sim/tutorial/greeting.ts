// The spawn greeting (tutorial island): a one-time, text-free personal event
// that offers every genuinely fresh character passage to the Proving Shore,
// plus the ferry ride itself for the ones who accept.
//
// The sweep mirrors professions/prof_nudges.ts: 1 Hz beside the other mail
// phase sweeps, zero rng (it only emits events, which draw nothing), so its
// tick-tail position cannot fork the deterministic draw order. The one-shot
// flag (PlayerMeta.tutorialGreetingSent, the guildLetterSent idiom) is
// flipped BEFORE the emit so a re-entrant load can never double-fire, and it
// latches SILENTLY for an established character (an old save from before the
// tutorial shipped must not be greeted like a newborn).
//
// firstCharacter is a runtime account fact, never persisted: the server
// recomputes it at every join (the bankBonus idiom) and the offline Sim is
// always a first character (offline runs are stateless by design).
//
// This module is `src/sim`-pure (see src/sim/CLAUDE.md): no DOM/render/ui/
// game/net imports, no Math.random/Date.now, host-agnostic.

import { PROVING_SHORE_ARRIVAL } from '../content/proving_shore';
import { DUNGEON_X_THRESHOLD } from '../data';
import { displacePlayer } from '../displacement';
import { emitIslandArrival } from '../interactions/ferry_bell';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

/** A character the greeting should engage for: one that has done nothing at
 *  all yet. Established characters (any XP, any quest history) latch the
 *  flag silently instead, so a pre-tutorial save is never greeted. */
function isFreshCharacter(meta: PlayerMeta): boolean {
  return meta.lifetimeXp === 0 && meta.questsDone.size === 0 && meta.questLog.size === 0;
}

/** The greeting one-shot: emit once ever, on the character's first swept
 *  tick. Flips the persisted flag BEFORE the emit (the prof_nudges idiom).
 *  Returns whether it emitted. */
export function maybeEmitTutorialGreeting(meta: PlayerMeta, ctx: SimContext): boolean {
  if (meta.tutorialGreetingSent) return false;
  meta.tutorialGreetingSent = true;
  if (!isFreshCharacter(meta)) return false;
  ctx.emit({
    type: 'tutorialGreeting',
    pid: meta.entityId,
    firstCharacter: meta.firstCharacter,
  });
  return true;
}

/** The 1 Hz tick sweep (called from the mail phase of Sim.tick, beside
 *  updateProfNudges): evaluates every player on the PostOffice's once-a-second
 *  cadence. Zero rng, so its position in the tick tail cannot fork the draw
 *  order (it only emits events, which draw nothing). */
export function updateTutorialGreeting(ctx: SimContext): void {
  if (ctx.tickCount % 20 !== 0) return;
  for (const meta of ctx.players.values()) maybeEmitTutorialGreeting(meta, ctx);
}

/** The ferry ride the greeting's accept button books: the standard
 *  displacement recipe (displacement.ts; the island ships NO walk-in portal
 *  ring, PROVING_SHORE_PORTALS is deliberately empty and the crossing is a
 *  clicked bell), gated so it can never be abused as a
 *  free escape teleport. Server-validated: level 1, alive (the caller's dead
 *  gate), out of combat, overworld only. The persisted flag guards only the
 *  greeting EMIT, so this command-side gate set is what keeps the wire token
 *  from doubling as an unmetered combat exit. */
export function resolveStartTutorial(ctx: SimContext, p: Entity, meta: PlayerMeta): void {
  if (p.pos.x > DUNGEON_X_THRESHOLD || p.inCombat) {
    ctx.error(p.id, 'You cannot set sail from here.');
    return;
  }
  if (p.level > 1) {
    ctx.error(p.id, 'The Proving Shore has nothing left to teach you.');
    return;
  }
  displacePlayer(ctx, p, PROVING_SHORE_ARRIVAL, 'The ferry sets you down on the Proving Shore.');
  // Text-free arrival marker: the HUD renders Ferryman Odo's welcome note,
  // which teaches walking and talking, for a character new to the shore.
  emitIslandArrival(ctx, p, meta);
}
