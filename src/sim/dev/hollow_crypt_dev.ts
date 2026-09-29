// /dev crypt: playtest helpers for the Hollow Crypt rework (ALLOW_DEV_COMMANDS
// only: handleDevChat is reached through the ctx.devCommands gate like every
// /dev branch).
//
//   /dev crypt                         this help line
//   /dev crypt enter [normal|heroic]   claim a fresh run and step in
//   /dev crypt tp <area>               jump inside the run (enters first)
//   /dev crypt gates                   open every gate and seal for this run
//   /dev crypt kill <pack|boss|all>    kill p1..p9, marrow, rimeweb, ilvane,
//                                      morthen, or everything, as if slain
//   /dev crypt reset                   free the run and claim a fresh one
//
// Areas: landing, cloister, grille, processional, yard, bellyard (marrow),
// gallery, rim, web (rimeweb), choir, loft (ilvane), stair, bonestair, ring
// (morthen).

import { HOLLOW_CRYPT_ANCHORS } from '../content/hollow_crypt_layout';
import { DUNGEONS, instanceOrigin } from '../data';
import { setDungeonGatesDevOpen } from '../instances/dungeon_gates';
import { claimedInstanceAt, enterDungeon, freeInstance, leaveDungeon } from '../instances/dungeons';
import type { InstanceSlot } from '../sim';
import type { SimContext } from '../sim_context';
import { displacePlayerForDev } from './dev_displace';

const DUNGEON_ID = 'hollow_crypt';

export const HOLLOW_CRYPT_DEV_AREAS: Readonly<Record<string, { x: number; z: number }>> = {
  landing: HOLLOW_CRYPT_ANCHORS.entry,
  cloister: { x: 0, z: -74 },
  grille: { x: 0, z: 12 },
  processional: { x: 0, z: 40 },
  yard: { x: -60, z: 42 },
  bellyard: { x: -82, z: 104 },
  marrow: { x: -82, z: 104 },
  gallery: { x: 62, z: 30 },
  rim: { x: 105, z: 40 },
  web: { x: 80, z: 98 },
  rimeweb: { x: 80, z: 98 },
  choir: { x: 0, z: 122 },
  loft: { x: 0, z: 152 },
  ilvane: { x: 0, z: 152 },
  stair: { x: 36, z: 161 },
  bonestair: { x: 64, z: 190 },
  ring: { x: 4, z: 226 },
  morthen: { x: 4, z: 226 },
};

const BOSS_ALIASES: Readonly<Record<string, string>> = {
  marrow: 'sexton_marrow',
  rimeweb: 'rimeweb',
  ilvane: 'cantor_ilvane',
  morthen: 'morthen',
};

const HELP =
  '[dev] /dev crypt enter [normal|heroic] | tp <landing|cloister|grille|processional|yard|bellyard|gallery|rim|web|choir|loft|stair|bonestair|ring> | gates | kill <p1..p9|marrow|rimeweb|ilvane|morthen|all> | reset';

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

function killMatching(ctx: SimContext, pid: number, inst: InstanceSlot, what: string): number {
  const killer = ctx.entities.get(pid) ?? null;
  const boss = BOSS_ALIASES[what];
  let killed = 0;
  DUNGEONS[DUNGEON_ID].spawns.forEach((spawn, i) => {
    const hit =
      what === 'all' ||
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

/** Handles `/dev crypt ...`; returns false for any other line. */
export function handleHollowCryptDevChat(ctx: SimContext, raw: string, pid: number): boolean {
  const m = /^\/dev\s+crypt(?:\s+(\S+))?(?:\s+(\S+))?\s*$/i.exec(raw);
  if (!m) return false;
  const verb = (m[1] ?? '').toLowerCase();
  const arg = (m[2] ?? '').toLowerCase();
  if (verb === 'enter') {
    ctx.setDungeonDifficulty(arg === 'heroic' ? 'heroic' : 'normal', pid);
    if (enterDungeon(ctx, DUNGEON_ID, pid, true))
      log(ctx, pid, `[dev] Entering the Hollow Crypt (${arg === 'heroic' ? 'heroic' : 'normal'}).`);
    return true;
  }
  if (verb === 'tp') {
    const area = HOLLOW_CRYPT_DEV_AREAS[arg];
    if (!area) {
      ctx.error(pid, HELP);
      return true;
    }
    const inst = ensureInside(ctx, pid);
    const e = ctx.entities.get(pid);
    if (!inst || !e) {
      ctx.error(pid, '[dev] Could not enter the Hollow Crypt.');
      return true;
    }
    const o = instanceOrigin(DUNGEONS[DUNGEON_ID].index, inst.slot);
    displacePlayerForDev(ctx, e, o.x + area.x, o.z + area.z);
    log(ctx, pid, `[dev] Hollow Crypt: ${arg}.`);
    return true;
  }
  if (verb === 'gates') {
    const inst = ensureInside(ctx, pid);
    if (!inst) return true;
    setDungeonGatesDevOpen(inst, true);
    log(ctx, pid, '[dev] Every Hollow Crypt gate and seal is open for this run.');
    return true;
  }
  if (verb === 'kill') {
    const inst = ensureInside(ctx, pid);
    if (!inst) return true;
    const n = killMatching(ctx, pid, inst, arg || 'all');
    log(ctx, pid, `[dev] Killed ${n} Hollow Crypt mob${n === 1 ? '' : 's'} (${arg || 'all'}).`);
    return true;
  }
  if (verb === 'reset') {
    const inst = claimFor(ctx, pid);
    if (inst) {
      leaveDungeon(ctx, pid);
      freeInstance(ctx, inst);
    }
    if (enterDungeon(ctx, DUNGEON_ID, pid, true))
      log(ctx, pid, '[dev] Hollow Crypt reset: a fresh run.');
    return true;
  }
  ctx.error(pid, HELP);
  return true;
}
