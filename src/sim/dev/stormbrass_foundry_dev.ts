// /dev foundry: playtest helpers for the Stormbrass Foundry (ALLOW_DEV_COMMANDS
// only: handleDevChat is reached through the ctx.devCommands gate like every
// /dev branch).
//
//   /dev foundry                          this help line
//   /dev foundry enter [normal|heroic]    claim a fresh run and step in
//   /dev foundry tp <area|boss>           jump inside the run (enters first)
//   /dev foundry gates                    open every gate and seal for this run
//   /dev foundry kill <pack|boss|all>     kill a pack (g1 to g13, pa pb pc pd;
//                                         pa is the Gantry Hauler), a boss (tock,
//                                         rangewarden, voltaic, prime), the
//                                         trash, or all
//   /dev foundry pack <pack>              jump to where a pack stands (or walks)
//   /dev foundry spawn <type>             raise one mob 10 yd ahead, pulled
//   /dev foundry trigger <mechanic>       fire an engaged encounter's mechanic
//                                         now: blast, toss, unload (the Hauler);
//                                         lever, press, parts, rivet (Tock);
//                                         lock, proof, drones (the Rangewarden);
//                                         flip, discharge, platedrones, lash,
//                                         strike (the Voltaic Warden); cell,
//                                         overload, fist, sweep, unbolt, tremor,
//                                         heartless, surge (the Prime Draft)
//   /dev foundry reset                    free the run and claim a fresh one
//   /dev foundry workers [free <a|b|c|all>|reset]
//                                         the chained workers' camps: their
//                                         state, strike a camp's chains now, or
//                                         raise every camp fresh (chained,
//                                         guarded)
//
// Areas: landing, yard (or hauler), terraces, cranepad, mainline (or tock),
// cranelanding, lanes, range (or rangewarden), coil, coilupper, crown (or
// voltaic), bridge, drafting, approach, gantry (or prime), and the worker
// camps campa, campb, campc. Each boss name lands beside that boss, on its
// floor.

import { STORMBRASS_FOUNDRY_ANCHORS } from '../content/stormbrass_foundry_layout';
import { DUNGEONS, instanceOrigin, MOBS } from '../data';
import { foundryDevTrigger } from '../encounters/stormbrass_foundry';
import {
  devFreeFoundryWorkers,
  foundryWorkersStatus,
  resetFoundryWorkerCamps,
} from '../encounters/stormbrass_foundry/workers';
import { createMob } from '../entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../instances/difficulty';
import { setDungeonGatesDevOpen } from '../instances/dungeon_gates';
import { claimedInstanceAt, enterDungeon, freeInstance, leaveDungeon } from '../instances/dungeons';
import type { InstanceSlot } from '../sim';
import type { SimContext } from '../sim_context';
import { displacePlayerForDev } from './dev_displace';

const DUNGEON_ID = 'stormbrass_foundry';

const A = STORMBRASS_FOUNDRY_ANCHORS;

export const STORMBRASS_FOUNDRY_DEV_AREAS: Readonly<Record<string, { x: number; z: number }>> = {
  landing: A.entry,
  yard: { x: -30, z: -186 },
  hauler: { x: -30, z: -186 },
  terraces: { x: 0, z: -118 },
  cranepad: { x: 0, z: -78 },
  mainline: { x: 0, z: -40 },
  tock: { x: 0, z: -40 },
  cranelanding: { x: 8, z: 6 },
  lanes: { x: -50, z: -40 },
  range: { x: -78, z: -18 },
  rangewarden: { x: -78, z: -18 },
  coil: { x: 50, z: -42 },
  coilupper: { x: 98, z: -52 },
  crown: { x: 88, z: -4 },
  voltaic: { x: 88, z: -4 },
  bridge: { x: 0, z: 8 },
  drafting: { x: 0, z: 50 },
  approach: { x: 0, z: 118 },
  gantry: { x: 0, z: 186 },
  prime: { x: 0, z: 186 },
  // The chained workers' camps (content/stormbrass_foundry_workers.ts): a few
  // yards off each camp, outside its guards' reach.
  campa: { x: 36, z: -175 },
  campb: { x: -70, z: -60 },
  campc: { x: -26, z: 121 },
};

const BOSS_ALIASES: Readonly<Record<string, string>> = {
  tock: 'line_master_tock',
  rangewarden: 'rangewarden',
  voltaic: 'voltaic_warden',
  prime: 'prime_draft',
  hauler: 'gantry_hauler',
};

/** `/dev foundry spawn` names for each creature. */
export const STORMBRASS_FOUNDRY_DEV_MOBS: Readonly<Record<string, string>> = {
  sentry: 'brass_sentry',
  bruiser: 'steam_bruiser',
  drone: 'arc_drone',
  engineer: 'foundry_engineer',
  apprentice: 'gearwright_apprentice',
  hound: 'clockwork_hound',
  shieldbearer: 'shieldbearer_frame',
  turret: 'tripod_turret',
  hauler: 'gantry_hauler',
  frame: 'half_built_frame',
};

const HELP =
  '[dev] /dev foundry enter [normal|heroic] | tp <landing|yard|hauler|terraces|cranepad|mainline|tock|cranelanding|lanes|range|rangewarden|coil|coilupper|crown|voltaic|bridge|drafting|approach|gantry|prime|campa|campb|campc> | gates | kill <g1..g13|pa|pb|pc|pd|hauler|tock|rangewarden|voltaic|prime|trash|all> | pack <id> | spawn <sentry|bruiser|drone|engineer|apprentice|hound|shieldbearer|turret|hauler|frame> | trigger <blast|toss|unload|lever|press|parts|rivet|lock|proof|drones|flip|discharge|platedrones|lash|strike|cell|overload|fist|sweep|unbolt|tremor|heartless|surge> | reset | workers [free <a|b|c|all>|reset]';

/** Raise one mob ahead of the player, pulled at once. */
function devSpawn(ctx: SimContext, pid: number, inst: InstanceSlot, templateId: string): boolean {
  const me = ctx.entities.get(pid);
  const template = MOBS[templateId];
  if (!me || !template) return false;
  const x = me.pos.x + Math.sin(me.facing) * 10;
  const z = me.pos.z + Math.cos(me.facing) * 10;
  const mob = createMob(
    ctx.nextId++,
    mobTemplateForDungeonDifficulty(template, DUNGEON_ID, inst.difficulty),
    mobLevelForDungeonDifficulty(DUNGEON_ID, inst.difficulty, template.minLevel),
    ctx.groundPos(x, z),
  );
  applyDungeonMobTuning(mob, DUNGEON_ID, inst.difficulty);
  mob.facing = me.facing + Math.PI;
  mob.prevFacing = mob.facing;
  ctx.addEntity(mob);
  inst.mobIds.push(mob.id);
  ctx.aggroMob(mob, me, false);
  return true;
}

function log(ctx: SimContext, pid: number, text: string): void {
  ctx.emit({ type: 'log', text, pid });
}

function claimFor(ctx: SimContext, pid: number): InstanceSlot | null {
  const e = ctx.entities.get(pid);
  if (!e) return null;
  const inst = claimedInstanceAt(ctx, e.pos);
  return inst?.dungeonId === DUNGEON_ID ? inst : null;
}

function ensureInside(ctx: SimContext, pid: number): InstanceSlot | null {
  const inside = claimFor(ctx, pid);
  if (inside) return inside;
  if (!enterDungeon(ctx, DUNGEON_ID, pid, true)) return null;
  return claimFor(ctx, pid);
}

/** Kill the placements a `/dev foundry kill` names. Returns how many fell. */
export function killFoundryMatching(
  ctx: SimContext,
  pid: number,
  inst: InstanceSlot,
  what: string,
): number {
  const killer = ctx.entities.get(pid) ?? null;
  const boss = BOSS_ALIASES[what];
  let killed = 0;
  DUNGEONS[DUNGEON_ID].spawns.forEach((spawn, i) => {
    const hit =
      what === 'all' ||
      // Every pack and patrol (the Hauler included), never a boss.
      (what === 'trash' && spawn.packId !== undefined) ||
      (boss !== undefined && spawn.mobId === boss) ||
      (spawn.packId !== undefined && spawn.packId === what);
    if (!hit) return;
    const mob = ctx.entities.get(inst.mobIds[i]);
    if (!mob || mob.dead) return;
    ctx.handleDeath(mob, killer);
    killed++;
  });
  return killed;
}

/** `/dev foundry workers [free <a|b|c|all>|reset]`; false for any other line. */
function handleFoundryWorkersDev(ctx: SimContext, raw: string, pid: number): boolean {
  const m = /^\/dev\s+foundry\s+workers(?:\s+(\S+))?(?:\s+(\S+))?\s*$/i.exec(raw);
  if (!m) return false;
  const verb = (m[1] ?? '').toLowerCase();
  const which = (m[2] ?? 'all').toLowerCase();
  const inst = ensureInside(ctx, pid);
  if (!inst) {
    ctx.error(pid, '[dev] Could not enter the Stormbrass Foundry.');
    return true;
  }
  if (verb === 'free' && ['a', 'b', 'c', 'all'].includes(which)) {
    const n = devFreeFoundryWorkers(ctx, inst, which);
    log(ctx, pid, `[dev] Struck the chains at ${n} worker camp${n === 1 ? '' : 's'}.`);
    return true;
  }
  if (verb === 'reset') {
    resetFoundryWorkerCamps(ctx, inst);
    log(ctx, pid, '[dev] The worker camps stand again, chained and guarded.');
    return true;
  }
  if (verb === '') {
    log(ctx, pid, `[dev] Worker camps: ${foundryWorkersStatus(ctx, inst)}.`);
    return true;
  }
  ctx.error(pid, HELP);
  return true;
}

/** Handles `/dev foundry ...`; returns false for any other line. */
export function handleStormbrassFoundryDevChat(ctx: SimContext, raw: string, pid: number): boolean {
  if (handleFoundryWorkersDev(ctx, raw, pid)) return true;
  const m = /^\/dev\s+foundry(?:\s+(\S+))?(?:\s+(\S+))?\s*$/i.exec(raw);
  if (!m) return false;
  const verb = (m[1] ?? '').toLowerCase();
  const arg = (m[2] ?? '').toLowerCase();
  if (verb === 'enter') {
    ctx.setDungeonDifficulty(arg === 'heroic' ? 'heroic' : 'normal', pid);
    if (enterDungeon(ctx, DUNGEON_ID, pid, true))
      log(
        ctx,
        pid,
        `[dev] Entering the Stormbrass Foundry (${arg === 'heroic' ? 'heroic' : 'normal'}).`,
      );
    return true;
  }
  if (verb === 'tp') {
    const area = STORMBRASS_FOUNDRY_DEV_AREAS[arg];
    if (!area) {
      ctx.error(pid, HELP);
      return true;
    }
    const inst = ensureInside(ctx, pid);
    const e = ctx.entities.get(pid);
    if (!inst || !e) {
      ctx.error(pid, '[dev] Could not enter the Stormbrass Foundry.');
      return true;
    }
    const o = instanceOrigin(DUNGEONS[DUNGEON_ID].index, inst.slot);
    displacePlayerForDev(ctx, e, o.x + area.x, o.z + area.z);
    log(ctx, pid, `[dev] Stormbrass Foundry: ${arg}.`);
    return true;
  }
  if (verb === 'gates') {
    const inst = ensureInside(ctx, pid);
    if (!inst) return true;
    setDungeonGatesDevOpen(inst, true);
    log(ctx, pid, '[dev] Every Stormbrass Foundry gate and seal is open for this run.');
    return true;
  }
  if (verb === 'kill') {
    const inst = ensureInside(ctx, pid);
    if (!inst) return true;
    const n = killFoundryMatching(ctx, pid, inst, arg || 'all');
    log(
      ctx,
      pid,
      `[dev] Killed ${n} Stormbrass Foundry mob${n === 1 ? '' : 's'} (${arg || 'all'}).`,
    );
    return true;
  }
  if (verb === 'spawn') {
    const templateId = STORMBRASS_FOUNDRY_DEV_MOBS[arg];
    const inst = templateId ? ensureInside(ctx, pid) : null;
    if (!templateId || !inst) {
      ctx.error(pid, HELP);
      return true;
    }
    if (devSpawn(ctx, pid, inst, templateId))
      log(ctx, pid, `[dev] Spawned ${MOBS[templateId].name}.`);
    return true;
  }
  if (verb === 'trigger') {
    const inst = claimFor(ctx, pid);
    if (!inst) {
      ctx.error(pid, HELP);
      return true;
    }
    log(ctx, pid, `[dev] ${foundryDevTrigger(ctx, inst, arg)}`);
    return true;
  }
  if (verb === 'pack') {
    const spawn = DUNGEONS[DUNGEON_ID].spawns.find((s) => s.packId === arg);
    const inst = spawn ? ensureInside(ctx, pid) : null;
    const e = ctx.entities.get(pid);
    if (!spawn || !inst || !e) {
      ctx.error(pid, HELP);
      return true;
    }
    // Stand a little off the pack on its own floor (south first, toward the lift).
    const o = instanceOrigin(DUNGEONS[DUNGEON_ID].index, inst.slot);
    const floor = ctx.groundPos(o.x + spawn.x, o.z + spawn.z).y;
    const spots: [number, number][] = [
      [0, -16],
      [0, 16],
      [-16, 0],
      [16, 0],
      [0, -8],
      [0, 8],
      [0, 0],
    ];
    const spot =
      spots.find(
        ([dx, dz]) => Math.abs(ctx.groundPos(o.x + spawn.x + dx, o.z + spawn.z + dz).y - floor) < 2,
      ) ?? spots[spots.length - 1];
    displacePlayerForDev(ctx, e, o.x + spawn.x + spot[0], o.z + spawn.z + spot[1]);
    log(ctx, pid, `[dev] Stormbrass Foundry: pack ${arg}.`);
    return true;
  }
  if (verb === 'reset') {
    const inst = claimFor(ctx, pid);
    if (inst) {
      leaveDungeon(ctx, pid);
      freeInstance(ctx, inst);
    }
    if (enterDungeon(ctx, DUNGEON_ID, pid, true))
      log(ctx, pid, '[dev] Stormbrass Foundry reset: a fresh run.');
    return true;
  }
  ctx.error(pid, HELP);
  return true;
}
