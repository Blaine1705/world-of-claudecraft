// The drill yard's mallet: the Muster Drillmaster drives a stake beside the Straw Foreman,
// and every blow of his mallet shakes the ground under a couched pike.
//
// The real fight's hardest part is not the thrust, it is holding the beam while Balgath's
// slams kick it (lance_trial.ts shockLanceBraces, called from every telegraphed detonation
// in mob/boss_slams.ts). A training effigy that never shakes would teach the easy half. So
// the drillmaster pounds on a steady beat whenever someone is training (a player near the
// effigy with a Shardpike in hand), and each blow goes through THE SAME shockwave the
// slams use: the same kick, the same falloff with distance, the same "a blow on your left
// shoves you right" rule. Nobody is hurt, nobody is launched; only the beam feels it.
//
// Presentation rides the channels the fight already has: the windup is a `spellfx` windup
// on the drillmaster (his two-handed chop, the attack clip his rig plays), and the landing
// is a `spellfxAt` nova at the stake (the renderer's Balgath ground layer kicks up a small
// dust ring there, src/render/balgath_fx.ts, and the HUD plays the thud).
//
// State: the beat's next-due time lives on MusterArmyState (Sim-owned, live view). Draws no
// rng: the beat is a fixed cadence on the sim clock, the stake a fixed point.

import { MUSTER_DRILL_POST, MUSTER_EFFIGY_POST } from './content/mirefen_muster';
import { isShardpikeItem } from './lance_balance_core';
import { shockLanceBraces } from './lance_trial';
import type { MusterArmyState } from './mirefen_muster';
import { MUSTER_MALLET_POUND_ABILITY } from './muster_effigy_core';
import type { SimContext } from './sim_context';
import { CAST_COMPLETE_EPS } from './types';

export { MUSTER_MALLET_POUND_ABILITY };
/** Seconds between blows while someone trains: at least one lands inside every set. */
export const MUSTER_DRILL_POUND_EVERY = 4;
/** Seconds from the windup to the mallet meeting the stake (the chop clip's strike frame). */
export const MUSTER_DRILL_POUND_IMPACT = 0.55;
/** Yards in front of the drillmaster the mallet lands. */
export const MUSTER_DRILL_POUND_REACH = 1.3;
/**
 * The blow's shock radius as the slam path reads it: shockLanceBraces reaches
 * LANCE_SHOCK_REACH times this, so a trainee anywhere on the lane in front of the effigy
 * (five to nine yards from the stake) takes a real kick, weaker the further they stand.
 */
export const MUSTER_DRILL_SHOCK_RADIUS = 6;
/** The dust ring's size at the stake (presentation only). */
export const MUSTER_DRILL_DUST_RADIUS = 1.6;
/** A pike-carrier within this of the effigy counts as someone training. */
export const MUSTER_DRILL_WATCH_RANGE = 26;
/** How often he looks round for a trainee while nobody is at the yard. */
const IDLE_LOOK_SECONDS = 1;
/** The thud (an existing heavy-landing SFX, the war hammer's). */
const POUND_SFX = 'impact_warrior_hammer_land';

/** Where the mallet lands: a stride in front of his post. */
export function musterDrillStake(): { x: number; z: number } {
  return {
    x: MUSTER_DRILL_POST.x + Math.sin(MUSTER_DRILL_POST.facing) * MUSTER_DRILL_POUND_REACH,
    z: MUSTER_DRILL_POST.z + Math.cos(MUSTER_DRILL_POST.facing) * MUSTER_DRILL_POUND_REACH,
  };
}

/** Is anyone training: a living player near the effigy with a Shardpike in hand? */
export function musterDrillHasTrainee(ctx: SimContext): boolean {
  for (const meta of ctx.players.values()) {
    if (!isShardpikeItem(meta.equipment.mainhand)) continue;
    const p = ctx.entities.get(meta.entityId);
    if (!p || p.dead || p.ghost) continue;
    const dx = p.pos.x - MUSTER_EFFIGY_POST.x;
    const dz = p.pos.z - MUSTER_EFFIGY_POST.z;
    if (dx * dx + dz * dz <= MUSTER_DRILL_WATCH_RANGE * MUSTER_DRILL_WATCH_RANGE) return true;
  }
  return false;
}

/** One pass, from the muster army: swing when the beat is due and someone is training. */
export function tickMusterDrill(ctx: SimContext, army: MusterArmyState): void {
  if (army.drillmasterId === null || ctx.time < army.drillNextPoundAt) return;
  const drillmaster = ctx.entities.get(army.drillmasterId);
  if (!drillmaster || drillmaster.dead || !musterDrillHasTrainee(ctx)) {
    army.drillNextPoundAt = ctx.time + IDLE_LOOK_SECONDS;
    return;
  }
  army.drillNextPoundAt = ctx.time + MUSTER_DRILL_POUND_EVERY;
  poundMusterDrill(ctx, army);
}

/**
 * Swing the mallet now: the windup at once, the landing (shockwave, dust, thud) at the
 * strike frame. Also the dev command's entry point.
 */
export function poundMusterDrill(ctx: SimContext, army: MusterArmyState): void {
  if (army.drillmasterId === null) return;
  const drillmaster = ctx.entities.get(army.drillmasterId);
  if (!drillmaster || drillmaster.dead) return;
  const sourceId = drillmaster.id;
  // He turns back to his stake for the blow, whatever he was watching.
  drillmaster.facing = MUSTER_DRILL_POST.facing;
  ctx.emit({
    type: 'spellfx',
    sourceId,
    targetId: sourceId,
    school: 'physical',
    fx: 'windup',
    ability: MUSTER_MALLET_POUND_ABILITY,
  });
  const stake = musterDrillStake();
  ctx.delayedEvents.push({
    at: ctx.time + MUSTER_DRILL_POUND_IMPACT - CAST_COMPLETE_EPS,
    resolve: () => {
      const live = ctx.entities.get(sourceId);
      if (!live || live.dead) return;
      shockLanceBraces(ctx, stake.x, stake.z, MUSTER_DRILL_SHOCK_RADIUS);
      ctx.emit({
        type: 'spellfxAt',
        x: stake.x,
        z: stake.z,
        school: 'physical',
        fx: 'nova',
        ability: MUSTER_MALLET_POUND_ABILITY,
        radius: MUSTER_DRILL_DUST_RADIUS,
        sourceId,
        sfxKey: POUND_SFX,
      });
    },
  });
}
