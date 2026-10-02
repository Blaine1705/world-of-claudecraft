// The Wildheart Basin encounters (docs/design/dungeon-rework/
// wildheart_basin.md): in phase A the Great Saurian's kit; the three bosses'
// cores (the Fanglord Beastmaster and his jaguar, the Gorgebloom, Zulgar) join
// here in phase B as their own modules. One pass per tick over every live
// Basin claim, after the mob AI (called from instances/dungeons.ts
// updateInstances, beside the trash kit), so a pull or a planted cast owns its
// tick.

import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import type { Entity } from '../../types';
import { bossEngaged, claimBoss, wildheartClaims } from './claim';
import {
  breakHowdah,
  enrageSaurian,
  saurianState,
  startStomp,
  startTailSwipe,
  tickSaurian,
} from './great_saurian';
import { GREAT_SAURIAN_ID } from './ids';

export { breakHowdah, saurianState } from './great_saurian';
export * from './ids';

/** A live fight whose mob lost its target for a moment (a Vanish, the tank
 *  falling) while still in combat and not evading: the fight holds, so a blip
 *  never replays its thresholds (a second howdah rider). Only an evade, a
 *  reset or a death ends it (each tick's `engaged` false). */
function paused(mob: Entity): boolean {
  return (
    mob.wildheartFight !== undefined &&
    !mob.dead &&
    mob.inCombat &&
    mob.aggroTargetId === null &&
    (mob.aiState === 'chase' || mob.aiState === 'attack')
  );
}

/** One tick of every Wildheart Basin encounter. */
export function tickWildheartEncounters(ctx: SimContext): void {
  for (const inst of wildheartClaims(ctx)) {
    const saurian = claimBoss(ctx, inst, GREAT_SAURIAN_ID);
    if (saurian && !paused(saurian)) tickSaurian(ctx, inst, saurian, bossEngaged(saurian));
  }
}

const HELP = 'Mechanics: tail, stomp, howdah, enrage (the Great Saurian).';

function saurianTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  const saurian = claimBoss(ctx, inst, GREAT_SAURIAN_ID);
  if (!saurian || !bossEngaged(saurian)) return 'Pull the Great Saurian first.';
  const st = saurianState(saurian, false);
  if (what === 'howdah') {
    if (st.howdahBroken) return 'The howdah is already broken.';
    return breakHowdah(ctx, inst, saurian, st)
      ? 'The howdah breaks: the Howdah Hexcaller jumps down.'
      : 'The howdah breaks.';
  }
  if (what === 'enrage') {
    if (!st.enraged) enrageSaurian(ctx, saurian, st);
    return 'The Great Saurian enrages.';
  }
  // A dev trigger cuts whatever bar is running so the mechanic always shows.
  saurian.castingAbility = null;
  saurian.castRemaining = 0;
  if (what === 'stomp') {
    startStomp(saurian, st);
    return 'The Great Saurian rears for an Earthshaking Stomp.';
  }
  startTailSwipe(saurian, st);
  return 'The Great Saurian draws back its tail.';
}

const SAURIAN_TRIGGERS = new Set(['tail', 'stomp', 'howdah', 'enrage']);

/** `/dev wildheart trigger <mechanic>`: fire an engaged encounter's mechanic
 *  now. Returns the log line. */
export function wildheartDevTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  if (SAURIAN_TRIGGERS.has(what)) return saurianTrigger(ctx, inst, what);
  return HELP;
}
