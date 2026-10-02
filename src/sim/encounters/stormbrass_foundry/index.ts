// The Stormbrass Foundry encounters (docs/design/dungeon-rework/
// stormbrass_foundry.md): in phase 1 the Gantry Hauler's kit; the four bosses'
// cores (Line-Master Tock, the Rangewarden, the Voltaic Warden, the Prime
// Draft) join here in phase 2 as their own modules. One pass per tick over
// every live Foundry claim, after the mob AI (called from instances/dungeons.ts
// updateInstances, beside the trash kit), so a pull or a planted cast owns its
// tick.

import { sweepOrphanBurstRings } from '../../mob/trash_kit/foundry_kit';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import type { Entity } from '../../types';
import { bossEngaged, claimBoss, foundryClaims } from './claim';
import {
  haulerState,
  startScrapToss,
  startSteamBlast,
  tickHauler,
  unloadDrones,
} from './gantry_hauler';
import {
  GANTRY_HAULER_ID,
  PRIME_DRAFT_ID,
  RANGEWARDEN_ID,
  TOCK_ID,
  TOCK_TUNING,
  VOLTAIC_WARDEN_ID,
} from './ids';
import { dropParts, startLever, startPress, tickTock, tockState } from './line_master';
import {
  arcSurge,
  chargeCycle,
  draftState,
  goHeartless,
  overload,
  startArmSweep,
  startPistonFist,
  startTremorStep,
  startUnbolt,
  tickPrimeDraft,
} from './prime_draft';
import { startVents } from './scalding_vents';

export {
  gantryPlayers,
  hatchRingCentre,
  hatchState,
  PRIME_DRAFT_DEED,
  PRIME_DRAFT_DEED_OVERLOADS,
  PRIME_DRAFT_LINES,
} from './prime_draft';
export { RANGEWARDEN_DEED, RANGEWARDEN_LINES, rangePlayers } from './rangewarden';
export {
  carriedCell,
  isStormCellObject,
  tryDropStormCell,
  tryTakeStormCell,
} from './storm_cells';
export { platingOf, platingTurnsAside } from './voltaic_plating';
export { crownPlayers, STORED_FULL, VOLTAIC_DEED, VOLTAIC_LINES } from './voltaic_warden';

import { launchDrillDrones, rangeState, startTargetLock, tickRangewarden } from './rangewarden';
import {
  flipPlating,
  holdVoltaicPlating,
  launchPlatedDrones,
  startCoilStrike,
  startFlip,
  tickVoltaicWarden,
  voltaicState,
} from './voltaic_warden';

export { HAULER_DEED, HAULER_UNLOAD_LOG, pickScrapTossTarget } from './gantry_hauler';
export * from './ids';
export {
  beltRegions,
  beltSpeed,
  beltUnder,
  leverPair,
  startingDirs,
  TOCK_DEED,
  TOCK_LINES,
} from './line_master';

/** A live boss fight whose boss lost its target for a moment (a Vanish, the
 *  tank falling) while still in combat and not evading: the fight holds, so a
 *  blip never replays its thresholds. Only an evade, a reset or a death ends
 *  it (each tick's `engaged` false). */
function paused(boss: Entity): boolean {
  return (
    boss.foundryFight !== undefined &&
    !boss.dead &&
    boss.inCombat &&
    boss.aggroTargetId === null &&
    (boss.aiState === 'chase' || boss.aiState === 'attack')
  );
}

/** One tick of every Stormbrass Foundry encounter. */
export function tickFoundryEncounters(ctx: SimContext): void {
  for (const inst of foundryClaims(ctx)) {
    const hauler = claimBoss(ctx, inst, GANTRY_HAULER_ID);
    if (hauler) tickHauler(ctx, inst, hauler, bossEngaged(hauler));
    const tock = claimBoss(ctx, inst, TOCK_ID);
    if (tock && !paused(tock)) tickTock(ctx, inst, tock, bossEngaged(tock));
    const range = claimBoss(ctx, inst, RANGEWARDEN_ID);
    if (range && !paused(range)) tickRangewarden(ctx, inst, range, bossEngaged(range));
    const warden = claimBoss(ctx, inst, VOLTAIC_WARDEN_ID);
    if (warden && paused(warden)) holdVoltaicPlating(ctx, inst, warden);
    else if (warden) tickVoltaicWarden(ctx, inst, warden, bossEngaged(warden));
    const draft = claimBoss(ctx, inst, PRIME_DRAFT_ID);
    if (draft && !paused(draft)) tickPrimeDraft(ctx, inst, draft, bossEngaged(draft));
    sweepOrphanBurstRings(ctx, inst);
  }
}

const HELP =
  'Mechanics: blast, toss, unload (the Hauler); lever, press, parts, rivet, vents (Tock); lock, proof, drones (the Rangewarden); flip, discharge, platedrones, lash, strike (the Voltaic Warden); cell, overload, fist, sweep, unbolt, tremor, heartless, surge (the Prime Draft).';

const HAULER_TRIGGERS = new Set(['blast', 'toss', 'unload']);
const TOCK_TRIGGERS = new Set(['lever', 'press', 'parts', 'rivet', 'vents']);
const RANGE_TRIGGERS = new Set(['lock', 'proof', 'drones']);
const VOLTAIC_TRIGGERS = new Set(['flip', 'discharge', 'platedrones', 'lash', 'strike']);
const DRAFT_TRIGGERS = new Set([
  'cell',
  'overload',
  'fist',
  'sweep',
  'unbolt',
  'tremor',
  'heartless',
  'surge',
]);

function haulerTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
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

/** A dev trigger cuts whatever bar is running so the mechanic always shows. */
function cutBar(boss: { castingAbility: string | null; castRemaining: number }): void {
  if (boss.castingAbility === null) return;
  boss.castingAbility = null;
  boss.castRemaining = 0;
}

function tockTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  const boss = claimBoss(ctx, inst, TOCK_ID);
  if (!boss || !bossEngaged(boss)) return 'Pull Line-Master Tock first.';
  const st = tockState(ctx, inst, boss);
  if (what === 'press') {
    // The carriages slide to their riders on the next rail stops.
    const belts = startPress(ctx, inst, boss, st).map((b) => b + 1);
    return belts.length > 0
      ? `The press slides to belt ${belts.join(' and ')}.`
      : 'Every carriage is already out.';
  }
  if (what === 'vents') {
    startVents(ctx, inst, boss, st);
    return `The walkway vents hiss: steam in ${TOCK_TUNING.ventWarning} s.`;
  }
  if (what === 'parts')
    return `The chute drops ${dropParts(ctx, inst, boss, st)} Half-Built Frames.`;
  cutBar(boss);
  if (what === 'lever') {
    startLever(ctx, inst, boss, st);
    return 'Tock throws the great lever.';
  }
  st.rivetTimer = 0;
  return 'Tock raises the Rivet Gun.';
}

function rangeTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  const boss = claimBoss(ctx, inst, RANGEWARDEN_ID);
  if (!boss || !bossEngaged(boss)) return 'Pull the Rangewarden first.';
  const st = rangeState(ctx, inst, boss);
  if (what === 'lock') return `Target Lock on ${startTargetLock(ctx, inst, boss, st)} players.`;
  if (what === 'drones')
    return `The Rangewarden launches ${launchDrillDrones(ctx, inst, boss, st)} Drill Drones.`;
  cutBar(boss);
  st.proofTimer = 0;
  return 'The Rangewarden loads a Proof Shot.';
}

function voltaicTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  const boss = claimBoss(ctx, inst, VOLTAIC_WARDEN_ID);
  if (!boss || !bossEngaged(boss)) return 'Pull the Voltaic Warden first.';
  const st = voltaicState(ctx, inst, boss);
  if (what === 'platedrones')
    return `The Warden launches ${launchPlatedDrones(ctx, inst, boss, st)} plated drones.`;
  if (what === 'strike')
    return startCoilStrike(ctx, inst, boss, st) ? 'The coil marks a strike.' : 'No target.';
  if (what === 'discharge') {
    // Bank a big charge first so the Discharge always shows.
    st.stored = Math.max(st.stored, 1000);
    return `The plates flip: a Discharge of ${flipPlating(ctx, inst, boss, st)}.`;
  }
  cutBar(boss);
  if (what === 'flip') {
    startFlip(boss, st);
    return 'The plates rattle.';
  }
  st.lashTimer = 0;
  st.flipTimer = Math.max(st.flipTimer, 5);
  return 'The Warden raises a Static Lash.';
}

function draftTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  const boss = claimBoss(ctx, inst, PRIME_DRAFT_ID);
  if (!boss || !bossEngaged(boss)) return 'Pull the Prime Draft first.';
  const st = draftState(ctx, inst, boss);
  // Skip the waking bar so the triggered mechanic shows at once.
  if (st.phase === 'awaken') st.phase = 'bolted';
  if (what === 'cell') return `The racks eject ${chargeCycle(ctx, inst, boss, st)} Storm Cell(s).`;
  if (what === 'overload') {
    overload(ctx, boss, st, true);
    return 'The Prime Draft overloads.';
  }
  if (what === 'fist')
    return startPistonFist(ctx, inst, boss, st) ? 'A Piston Fist marks a spot.' : 'No target.';
  if (what === 'surge') return `Arc Surge strikes ${arcSurge(ctx, inst, boss, st)} players.`;
  if (what === 'heartless') {
    if (st.phase === 'bolted') st.phase = 'unbolted';
    goHeartless(ctx, boss, st);
    return 'The Prime Draft goes Heartless.';
  }
  cutBar(boss);
  if (what === 'unbolt') {
    startUnbolt(ctx, boss, st);
    return 'The Prime Draft tears its feet free.';
  }
  if (what === 'tremor') {
    startTremorStep(boss, st);
    return 'The Prime Draft raises a Tremor Step.';
  }
  startArmSweep(boss, st);
  return 'The Prime Draft draws an Arm Sweep.';
}

/** `/dev foundry trigger <mechanic>`: fire an engaged encounter's mechanic now.
 *  Returns the log line. */
export function foundryDevTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  if (HAULER_TRIGGERS.has(what)) return haulerTrigger(ctx, inst, what);
  if (TOCK_TRIGGERS.has(what)) return tockTrigger(ctx, inst, what);
  if (RANGE_TRIGGERS.has(what)) return rangeTrigger(ctx, inst, what);
  if (VOLTAIC_TRIGGERS.has(what)) return voltaicTrigger(ctx, inst, what);
  if (DRAFT_TRIGGERS.has(what)) return draftTrigger(ctx, inst, what);
  return HELP;
}
