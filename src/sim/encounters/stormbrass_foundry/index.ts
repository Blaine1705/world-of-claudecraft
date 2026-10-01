// The Stormbrass Foundry encounters (docs/design/dungeon-rework/
// stormbrass_foundry.md): in phase 1 the Gantry Hauler's kit; the four bosses'
// cores (Line-Master Tock, the Rangewarden, the Voltaic Warden, the Prime
// Draft) join here in phase 2 as their own modules. One pass per tick over
// every live Foundry claim, after the mob AI (called from instances/dungeons.ts
// updateInstances, beside the trash kit), so a pull or a planted cast owns its
// tick.

import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { bossEngaged, claimBoss, foundryClaims } from './claim';
import {
  haulerState,
  startScrapToss,
  startSteamBlast,
  tickHauler,
  unloadDrones,
} from './gantry_hauler';
import { GANTRY_HAULER_ID } from './ids';

export { HAULER_UNLOAD_LOG, pickScrapTossTarget } from './gantry_hauler';
export * from './ids';

/** One tick of every Stormbrass Foundry encounter. */
export function tickFoundryEncounters(ctx: SimContext): void {
  for (const inst of foundryClaims(ctx)) {
    const hauler = claimBoss(ctx, inst, GANTRY_HAULER_ID);
    if (hauler) tickHauler(ctx, inst, hauler, bossEngaged(hauler));
  }
}

const HELP = 'Mechanics: blast, toss, unload (the Gantry Hauler; pull it first).';

/** `/dev foundry trigger <mechanic>`: fire an engaged encounter's mechanic now.
 *  Returns the log line. */
export function foundryDevTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  if (what !== 'blast' && what !== 'toss' && what !== 'unload') return HELP;
  const hauler = claimBoss(ctx, inst, GANTRY_HAULER_ID);
  if (!hauler || !bossEngaged(hauler)) return 'Pull the Gantry Hauler first.';
  const st = haulerState(hauler, false);
  if (what === 'unload')
    return `The Hauler unloads ${unloadDrones(ctx, inst, hauler, st)} Arc Drones.`;
  if (what === 'toss') {
    return startScrapToss(ctx, inst, hauler, st) ? 'The Hauler throws a plate.' : 'No target.';
  }
  if (hauler.castingAbility !== null) return 'The Hauler is already casting.';
  return startSteamBlast(ctx, hauler, st) ? 'The Hauler draws a Steam Blast.' : 'No target.';
}
