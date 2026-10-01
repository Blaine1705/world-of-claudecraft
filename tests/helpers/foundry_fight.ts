// Shared harness for the Stormbrass Foundry boss suites (Line-Master Tock, the
// Rangewarden, the Voltaic Warden, the Prime Draft): a real claimed Foundry
// with a real party, every pack and patrol cleared (the Gantry Hauler too), the
// gates open, and every damage event recorded so a suite can read what each
// mechanic dealt without racing the health top-up. The Bastion harness's shape.

import { DUNGEONS, instanceOrigin } from '../../src/sim/data';
import {
  PRIME_DRAFT_ID,
  RANGEWARDEN_ID,
  TOCK_ID,
  VOLTAIC_WARDEN_ID,
} from '../../src/sim/encounters/stormbrass_foundry';
import { setDungeonGatesDevOpen } from '../../src/sim/instances/dungeon_gates';
import { claimedInstanceAt, enterDungeon } from '../../src/sim/instances/dungeons';
import type { InstanceSlot } from '../../src/sim/sim';
import { Sim } from '../../src/sim/sim';
import { DT, type Entity, type PlayerClass } from '../../src/sim/types';

export interface Hit {
  sourceId: number;
  targetId: number;
  amount: number;
  ability: string | null;
  kind: string;
  school: string;
}

export interface Fight {
  sim: Sim;
  inst: InstanceSlot;
  ox: number;
  oz: number;
  tank: Entity;
  others: Entity[];
  /** Every damage event since the fight began, in order. */
  hits: Hit[];
  /** Every log and chat line since the fight began. */
  lines: string[];
}

const KEEP = new Set([TOCK_ID, RANGEWARDEN_ID, VOLTAIC_WARDEN_ID, PRIME_DRAFT_ID]);

export function fight(
  difficulty: 'normal' | 'heroic' = 'normal',
  extra = 3,
  cls: PlayerClass = 'mage',
): Fight {
  const sim = new Sim({ seed: 31, playerClass: 'warrior', autoEquip: false, devCommands: true });
  const tank = sim.player;
  sim.chat('/dev level 20', tank.id);
  const ids: number[] = [];
  for (let i = 0; i < extra; i++) {
    const pid = sim.addPlayer(cls, `Linehand${i}`);
    sim.partyInvite(pid, tank.id);
    sim.partyAccept(pid);
    ids.push(pid);
  }
  sim.chat(`/dev foundry enter ${difficulty}`, tank.id);
  for (const pid of ids) enterDungeon(sim.ctx, 'stormbrass_foundry', pid);
  const inst = claimedInstanceAt(sim.ctx, tank.pos);
  if (!inst) throw new Error('no foundry claim');
  for (const id of inst.mobIds) {
    const e = sim.ctx.entities.get(id);
    if (e && !e.dead && !KEEP.has(e.templateId)) sim.ctx.handleDeath(e, tank);
  }
  setDungeonGatesDevOpen(inst, true);
  const others = ids.map((pid) => sim.ctx.entities.get(pid) as Entity);
  for (const p of [tank, ...others]) {
    p.maxHp = 1e7;
    p.hp = 1e7;
  }
  const o = instanceOrigin(DUNGEONS.stormbrass_foundry.index, inst.slot);
  sim.drainEvents();
  return { sim, inst, ox: o.x, oz: o.z, tank, others, hits: [], lines: [] };
}

export function boss(f: Fight, id: string): Entity {
  for (const mid of f.inst.mobIds) {
    const e = f.sim.ctx.entities.get(mid);
    if (e?.templateId === id) return e;
  }
  throw new Error(`no ${id}`);
}

export function put(f: Fight, e: Entity, x: number, z: number): void {
  e.pos = f.sim.ctx.groundPos(f.ox + x, f.oz + z);
  e.prevPos = { ...e.pos };
  f.sim.ctx.grid.update(e);
}

export function local(f: Fight, e: Entity): { x: number; z: number } {
  return { x: e.pos.x - f.ox, z: e.pos.z - f.oz };
}

export function tick(f: Fight, keep: () => void = () => {}): void {
  for (const p of [f.tank, ...f.others]) if (p.hp < 1e5) p.hp = 1e6;
  keep();
  for (const ev of f.sim.tick()) {
    if (ev.type === 'damage')
      f.hits.push({
        sourceId: ev.sourceId,
        targetId: ev.targetId,
        amount: ev.amount,
        ability: ev.ability,
        kind: ev.kind,
        school: ev.school,
      });
    else if (ev.type === 'log') f.lines.push(ev.text);
    else if (ev.type === 'chat') f.lines.push(ev.text);
  }
}

export function run(f: Fight, seconds: number, keep: () => void = () => {}): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) tick(f, keep);
}

/** Damage `e` took from `ability` since hit index `from`. */
export function took(f: Fight, e: Entity, ability: string, from = 0): number {
  let sum = 0;
  for (let i = from; i < f.hits.length; i++) {
    const h = f.hits[i];
    if (h.targetId === e.id && h.ability === ability) sum += h.amount;
  }
  return sum;
}

/** The hits `e` took from `ability` since hit index `from`. */
export function hitsOn(f: Fight, e: Entity, ability: string, from = 0): Hit[] {
  return f.hits.slice(from).filter((h) => h.targetId === e.id && h.ability === ability);
}

/** Tick until `done` holds (at most `seconds`); true when it did. */
export function until(f: Fight, done: () => boolean, seconds: number, keep?: () => void): boolean {
  for (let t = 0; t < seconds; t += DT) {
    if (done()) return true;
    tick(f, keep);
  }
  return done();
}

/** Pull a boss onto the tank with a big pool so the fight lasts. */
export function engage(f: Fight, b: Entity): void {
  b.maxHp = Math.max(b.maxHp, 1e6);
  b.hp = b.maxHp;
  f.sim.ctx.aggroMob(b, f.tank, false);
}

/** Everyone falls back out of reach and the boss walks home: a wipe. */
export function wipe(f: Fight, b: Entity): void {
  for (const p of [f.tank, ...f.others]) put(f, p, 0, -226);
  b.inCombat = false;
  b.aggroTargetId = null;
  b.aiState = 'evade';
}

export function aura(e: Entity, id: string) {
  return e.auras.find((a) => a.id === id);
}

export function objects(f: Fight, template: string): Entity[] {
  const out: Entity[] = [];
  for (const id of f.inst.objectIds) {
    const e = f.sim.ctx.entities.get(id);
    if (e?.templateId === template) out.push(e);
  }
  return out;
}

export function live(f: Fight, templateId: string): Entity[] {
  return [...f.sim.ctx.entities.values()].filter((e) => e.templateId === templateId && !e.dead);
}

export function earned(f: Fight, e: Entity, deed: string): boolean {
  return f.sim.players.get(e.id)?.deedsEarned.has(deed) ?? false;
}
