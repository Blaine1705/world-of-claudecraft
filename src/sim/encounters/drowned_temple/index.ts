// The Drowned Temple boss encounters (docs/design/dungeon-rework/
// drowned_temple.md): Choirmother Selthe, the Mere Hydra (the showpiece), the
// Tideglass Colossus and Ysolei. One pass per tick over every live Temple
// claim, after the mob AI (called from instances/dungeons.ts updateInstances,
// beside the trash kit), so a pull or a planted cast owns its tick.

import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { bossEngaged, claimBoss, templeClaims } from './claim';
import { COLOSSUS_ID, SELTHE_ID, YSOLEI_ID } from './ids';
import { hydraHeads, startBrineSpit, startTideBreath, tickMereHydra } from './mere_hydra';
import { startChorus, startSolo, tickSelthe } from './selthe';
import { raiseReflections, startLance, tickColossus } from './tideglass_colossus';
import { startRisingTide, startUndertow, tickYsolei } from './ysolei';

export * from './ids';
export { floodedHalf } from './ysolei';

/** One tick of every Drowned Temple boss fight. */
export function tickTempleEncounters(ctx: SimContext): void {
  for (const inst of templeClaims(ctx)) {
    const selthe = claimBoss(ctx, inst, SELTHE_ID);
    if (selthe) tickSelthe(ctx, inst, selthe, bossEngaged(selthe));
    tickMereHydra(ctx, inst);
    const colossus = claimBoss(ctx, inst, COLOSSUS_ID);
    if (colossus) tickColossus(ctx, inst, colossus, bossEngaged(colossus));
    const ysolei = claimBoss(ctx, inst, YSOLEI_ID);
    if (ysolei) tickYsolei(ctx, inst, ysolei, bossEngaged(ysolei));
  }
}

const HELP =
  'Mechanics: chorus, solo, duet (Selthe); breath, spit (the Hydra); reflections, lance (the Colossus); undertow, flood (Ysolei).';

/** `/dev temple trigger <mechanic>`: fire an engaged boss's mechanic now.
 *  Returns the log line. */
export function templeDevTrigger(ctx: SimContext, inst: InstanceSlot, what: string): string {
  if (what === 'chorus' || what === 'solo' || what === 'duet') {
    const boss = claimBoss(ctx, inst, SELTHE_ID);
    const st = boss?.templeFight;
    if (!boss || st?.kind !== 'selthe') return 'Pull Selthe first.';
    if (what !== 'solo') startChorus(ctx, inst, boss, st);
    if (what !== 'chorus') startSolo(ctx, inst, boss, st);
    return 'Selthe marks her singers.';
  }
  if (what === 'breath' || what === 'spit') {
    const heads = hydraHeads(ctx, inst);
    const st = heads?.find((h) => h?.templeFight?.kind === 'hydra')?.templeFight;
    if (!heads || st?.kind !== 'hydra') return 'Pull the Mere Hydra first.';
    if (what === 'spit') {
      const center = heads[1];
      if (!center || center.dead) return 'The centre head is dead.';
      return startBrineSpit(ctx, inst, center, st) > 0 ? 'The Hydra spits brine.' : 'No target.';
    }
    const side = heads.find(
      (h, i) => i !== 1 && h !== null && !h.dead && h.castingAbility === null,
    );
    if (!side) return 'No side head is free.';
    return startTideBreath(ctx, inst, side, st) ? 'A head draws a Tide Breath.' : 'No target.';
  }
  if (what === 'reflections' || what === 'lance') {
    const boss = claimBoss(ctx, inst, COLOSSUS_ID);
    const st = boss?.templeFight;
    if (!boss || st?.kind !== 'colossus') return 'Pull the Colossus first.';
    if (what === 'lance') {
      if (boss.castingAbility !== null) return 'The Colossus is busy; try again.';
      return startLance(ctx, inst, boss, st) ? 'The Colossus aims a lance.' : 'No target.';
    }
    const n = raiseReflections(ctx, inst, boss, st);
    return `The prism flares: ${n} reflection${n === 1 ? '' : 's'}.`;
  }
  if (what === 'undertow' || what === 'flood') {
    const boss = claimBoss(ctx, inst, YSOLEI_ID);
    const st = boss?.templeFight;
    if (!boss || st?.kind !== 'ysolei') return 'Pull Ysolei first.';
    if (what === 'flood') {
      if (st.tide) {
        st.tide.timer = Math.min(st.tide.timer, 10.05);
        return 'The tide is about to switch halves.';
      }
      startRisingTide(ctx, inst, boss, st);
      return 'The lagoon floods half the island.';
    }
    if (st.undertow) return 'The Undertow is already running.';
    startUndertow(ctx, inst, boss, st);
    return 'Ysolei draws the Undertow.';
  }
  return HELP;
}
