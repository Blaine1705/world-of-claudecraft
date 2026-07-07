// Procedural Rift instance lifecycle. A parallel sibling to instances/dungeons.ts
// (which is left untouched): the rift pool lives in its own coordinate band, each
// slot holds one GENERATED floor at a time, and descending regenerates the room
// in place. Everything a rift needs is derived from its descriptor (seed +
// baseLevel + floorIndex) via the pure generator in rift_gen.ts, so the client
// regenerates identical geometry and only the descriptor travels over the wire.
//
// Behaviour lives here; state (ctx.riftInstances, ctx.riftPortalIds) stays on Sim
// as live SimContext views. Sim keeps thin enterRift/leaveRift delegates for the
// dev command + interaction click path; the per-tick drivers (updateRiftTriggers,
// updateRiftInstances) are called from tick().

import { clearRiftRegion, setRiftRegion } from '../colliders';
import {
  isRiftPos,
  MOBS,
  RIFT_REGION_HALF_X,
  RIFT_REGION_HALF_Z,
  riftInstanceOrigin,
} from '../data';
import { layoutColliders } from '../dungeon_layout';
import { createGroundObject, createMob } from '../entity';
import type { SimContext } from '../sim_context';
import { dist2d, type Entity, type Vec3 } from '../types';
import { generateRiftFloor } from './rift_gen';
import type { RiftInstance } from './types';

const PORTAL_TRIGGER_RADIUS = 2.2; // walk this close to a rift portal to use it
const PYLON_TRIGGER_RADIUS = 3.0; // walk this close to light a rune pylon
const RIFT_EMPTY_TIMEOUT = 60; // seconds with nobody inside before the slot frees

// Deterministic per-channel colour jitter (server-side; the result rides the
// entity snapshot to the client, so it need not be client-reproducible).
function jitterColor(ctx: SimContext, hex: number, amt: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const f = () => 1 + ctx.rng.range(-amt, amt);
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return (clamp(r * f()) << 16) | (clamp(g * f()) << 8) | clamp(b * f());
}

function riftKeyFor(ctx: SimContext, pid: number): string {
  const party = ctx.partyOf(pid);
  return party ? `party:${party.id}` : `solo:${pid}`;
}

/** The rift instance whose region contains `pos`, or null. */
export function riftInstanceAtPos(ctx: SimContext, pos: Vec3): RiftInstance | null {
  for (const inst of ctx.riftInstances) {
    if (inst.partyKey === null) continue;
    const o = riftInstanceOrigin(inst.slot, inst.floorIndex);
    if (
      Math.abs(pos.x - o.x) <= RIFT_REGION_HALF_X &&
      Math.abs(pos.z - o.z) <= RIFT_REGION_HALF_Z
    ) {
      return inst;
    }
  }
  return null;
}

function emitRiftState(ctx: SimContext, pid: number, inst: RiftInstance, active: boolean): void {
  const floor = generateRiftFloor(inst.seed, inst.baseLevel, inst.floorIndex);
  ctx.emit({
    type: 'riftState',
    pid,
    active,
    seed: inst.seed >>> 0,
    baseLevel: inst.baseLevel,
    floorIndex: inst.floorIndex,
    floorCount: inst.floorCount,
    name: floor.name,
    themeName: floor.themeName,
  });
}

// ---- Floor spawn / teardown -------------------------------------------------

function spawnRiftFloor(ctx: SimContext, inst: RiftInstance): void {
  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const floor = generateRiftFloor(inst.seed, inst.baseLevel, inst.floorIndex);

  // Publish the generated collision so movement/pathing/LoS/camera respect it.
  setRiftRegion(ctx.cfg.seed, origin.x, origin.z, layoutColliders(floor.layout));

  inst.mobIds = [];
  inst.objectIds = [];
  inst.pylonIds = [];
  inst.litPylons = new Set();
  inst.bossId = null;
  inst.exitId = null;
  inst.descentId = null;
  inst.descentOpen = false;
  inst.descentAt = null;
  inst.pylonTotal = floor.puzzle.kind === 'rune_pylons' ? floor.puzzle.pylonCount : 0;

  for (const spawn of floor.spawns) {
    const template = MOBS[spawn.templateId];
    if (!template) continue;
    const mob = createMob(
      ctx.nextId++,
      template,
      spawn.level,
      ctx.groundPos(origin.x + spawn.x, origin.z + spawn.z),
    );
    // Per-run re-grade: a fresh tint (and a little scale variance) so the same
    // template reads as a different creature across rifts. Model + mechanics are
    // unchanged (both read from the static template by id).
    mob.color = jitterColor(ctx, spawn.color ?? mob.color, 0.14);
    mob.scale = (spawn.scale ?? mob.scale) * ctx.rng.range(0.92, 1.12);
    mob.facing = Math.PI;
    mob.prevFacing = mob.facing;
    ctx.addEntity(mob);
    inst.mobIds.push(mob.id);
    if (spawn.boss) inst.bossId = mob.id;
  }

  for (const obj of floor.objects) {
    if (obj.kind === 'descent') {
      // Spawned only once the floor is cleared (see updateRiftInstances).
      inst.descentAt = { x: obj.x, z: obj.z };
      continue;
    }
    if (obj.kind === 'rune_pylon') {
      const pylon = createGroundObject(
        ctx.nextId++,
        '',
        obj.name,
        ctx.groundPos(origin.x + obj.x, origin.z + obj.z),
      );
      pylon.templateId = 'rift_pylon';
      pylon.objectItemId = null;
      pylon.lootable = false;
      ctx.addEntity(pylon);
      inst.objectIds.push(pylon.id);
      inst.pylonIds.push(pylon.id);
    }
    // 'chest'/'exit' are placed on boss death (openExitFloor).
  }

  inst.emptyFor = 0;
}

function dropObjects(ctx: SimContext, ids: number[]): void {
  for (const id of ids) {
    if (ctx.entities.has(id)) ctx.dropEntity(id);
  }
}

function freeRiftFloorEntities(ctx: SimContext, inst: RiftInstance): void {
  for (const id of inst.mobIds) {
    if (!ctx.entities.has(id)) continue;
    for (const meta of ctx.players.values()) {
      const e = ctx.entities.get(meta.entityId);
      if (e?.targetId === id) e.targetId = null;
    }
    ctx.dropEntity(id);
  }
  dropObjects(ctx, inst.objectIds);
  if (inst.descentId !== null) dropObjects(ctx, [inst.descentId]);
  if (inst.exitId !== null) dropObjects(ctx, [inst.exitId]);
  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  clearRiftRegion(ctx.cfg.seed, origin.x, origin.z);
  inst.mobIds = [];
  inst.objectIds = [];
  inst.pylonIds = [];
  inst.litPylons = new Set();
  inst.descentId = null;
  inst.exitId = null;
  inst.bossId = null;
}

function freeRiftInstance(ctx: SimContext, inst: RiftInstance): void {
  freeRiftFloorEntities(ctx, inst);
  inst.partyKey = null;
  inst.floorIndex = 0;
  inst.descentOpen = false;
  inst.descentAt = null;
  inst.emptyFor = 0;
}

// ---- Enter / descend / leave ------------------------------------------------

export function enterRift(
  ctx: SimContext,
  seed: number,
  baseLevel: number,
  pid?: number,
  returnPos?: { x: number; z: number },
): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  if (r.e.dead && !r.e.ghost) return;
  const key = riftKeyFor(ctx, r.meta.entityId);

  // A party member joining the same portal shares the instance (matched by seed).
  let inst = ctx.riftInstances.find((i) => i.partyKey === key && i.seed === seed >>> 0) ?? null;
  if (!inst) {
    const free = ctx.riftInstances.find((i) => i.partyKey === null);
    if (!free) {
      ctx.error(r.meta.entityId, 'All rifts are unstable right now. Try again soon.');
      return;
    }
    inst = free;
    inst.partyKey = key;
    inst.seed = seed >>> 0;
    inst.baseLevel = Math.max(1, Math.min(60, Math.round(baseLevel)));
    inst.floorIndex = 0;
    inst.floorCount = generateRiftFloor(inst.seed, inst.baseLevel, 0).floorCount;
    inst.returnPos = returnPos ?? { x: r.e.pos.x, z: r.e.pos.z };
    spawnRiftFloor(ctx, inst);
  }

  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const floor = generateRiftFloor(inst.seed, inst.baseLevel, inst.floorIndex);
  const p = r.e;
  p.pos = ctx.groundPos(origin.x + floor.entry.x, origin.z + floor.entry.z);
  p.prevPos = { ...p.pos };
  ctx.rebucket(p);
  p.facing = 0;
  p.targetId = null;
  p.autoAttack = false;
  inst.emptyFor = 0;
  emitRiftState(ctx, r.meta.entityId, inst, true);
  ctx.emit({
    type: 'log',
    text: `You step through the rift into ${floor.name}.`,
    color: '#b9f',
    pid: r.meta.entityId,
  });
}

export function descendRift(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const inst = riftInstanceAtPos(ctx, r.e.pos);
  if (!inst || !inst.descentOpen) return;
  if (inst.floorIndex >= inst.floorCount - 1) return;

  // Collect everyone currently standing in this floor's region before we tear it
  // down, so the whole party descends together.
  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const descenders: number[] = [];
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (!e) continue;
    if (
      Math.abs(e.pos.x - origin.x) <= RIFT_REGION_HALF_X &&
      Math.abs(e.pos.z - origin.z) <= RIFT_REGION_HALF_Z
    ) {
      descenders.push(meta.entityId);
    }
  }

  freeRiftFloorEntities(ctx, inst);
  inst.floorIndex += 1;
  spawnRiftFloor(ctx, inst);

  // The next floor has its own z-stacked origin: teleport descenders THERE.
  const newOrigin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const floor = generateRiftFloor(inst.seed, inst.baseLevel, inst.floorIndex);
  for (const id of descenders) {
    const e = ctx.entities.get(id);
    if (!e) continue;
    e.pos = ctx.groundPos(newOrigin.x + floor.entry.x, newOrigin.z + floor.entry.z);
    e.prevPos = { ...e.pos };
    ctx.rebucket(e);
    e.facing = 0;
    e.targetId = null;
    e.autoAttack = false;
    emitRiftState(ctx, id, inst, true);
    ctx.emit({
      type: 'log',
      text: `You descend deeper into ${floor.name}.`,
      color: '#b9f',
      pid: id,
    });
  }
}

export function leaveRift(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r || r.e.dead) return;
  const inst = riftInstanceAtPos(ctx, r.e.pos);
  const dest = inst?.returnPos ?? { x: 0, z: 0 };
  const p = r.e;
  p.pos = ctx.groundPos(dest.x, dest.z);
  p.prevPos = { ...p.pos };
  ctx.rebucket(p);
  p.targetId = null;
  p.autoAttack = false;
  if (inst) emitRiftState(ctx, r.meta.entityId, inst, false);
  ctx.emit({
    type: 'log',
    text: 'You step back through the rift.',
    color: '#b9f',
    pid: r.meta.entityId,
  });
}

// ---- Per-tick drivers -------------------------------------------------------

export function updateRiftTriggers(ctx: SimContext, p: Entity): void {
  if (p.kind !== 'player') return;

  if (isRiftPos(p.pos.x)) {
    const inst = riftInstanceAtPos(ctx, p.pos);
    if (!inst) return;
    // Exit portal -> leave.
    if (inst.exitId !== null) {
      const exit = ctx.entities.get(inst.exitId);
      if (exit && dist2d(p.pos, exit.pos) < PORTAL_TRIGGER_RADIUS) {
        leaveRift(ctx, p.id);
        return;
      }
    }
    // Open descent -> go deeper.
    if (inst.descentOpen && inst.descentId !== null) {
      const desc = ctx.entities.get(inst.descentId);
      if (desc && dist2d(p.pos, desc.pos) < PORTAL_TRIGGER_RADIUS) {
        descendRift(ctx, p.id);
        return;
      }
    }
    // Walk-on rune pylons.
    for (const id of inst.pylonIds) {
      if (inst.litPylons.has(id)) continue;
      const pylon = ctx.entities.get(id);
      if (pylon && dist2d(p.pos, pylon.pos) < PYLON_TRIGGER_RADIUS) {
        inst.litPylons.add(id);
        pylon.templateId = 'rift_pylon_lit';
        ctx.emit({
          type: 'log',
          text: `A rune pylon flares to life (${inst.litPylons.size}/${inst.pylonTotal}).`,
          color: '#adf',
          pid: p.id,
        });
      }
    }
    return;
  }

  // Overworld: walk into a rift portal to enter.
  if (ctx.riftPortalIds === null) {
    ctx.riftPortalIds = [];
    for (const e of ctx.entities.values()) {
      if (e.templateId === 'rift_portal') ctx.riftPortalIds.push(e.id);
    }
  }
  for (const portalId of ctx.riftPortalIds) {
    const portal = ctx.entities.get(portalId);
    if (
      portal &&
      portal.riftSeed !== undefined &&
      dist2d(p.pos, portal.pos) < PORTAL_TRIGGER_RADIUS
    ) {
      enterRift(ctx, portal.riftSeed, portal.riftBaseLevel ?? p.level, p.id);
      return;
    }
  }
}

function trashCleared(ctx: SimContext, inst: RiftInstance): boolean {
  for (const id of inst.mobIds) {
    if (id === inst.bossId) continue;
    const m = ctx.entities.get(id);
    if (m && !m.dead) return false;
  }
  return true;
}

function openDescent(ctx: SimContext, inst: RiftInstance): void {
  if (inst.descentOpen || !inst.descentAt) return;
  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const desc = createGroundObject(
    ctx.nextId++,
    '',
    'Rift Descent',
    ctx.groundPos(origin.x + inst.descentAt.x, origin.z + inst.descentAt.z),
  );
  desc.templateId = 'rift_descent';
  desc.objectItemId = null;
  desc.lootable = true;
  ctx.addEntity(desc);
  inst.descentId = desc.id;
  inst.descentOpen = true;
  for (const pid of instancePlayerIds(ctx, inst)) {
    ctx.emit({ type: 'log', text: 'The way down tears open.', color: '#b9f', pid });
  }
}

function openExit(ctx: SimContext, inst: RiftInstance): void {
  if (inst.exitId !== null) return;
  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const floor = generateRiftFloor(inst.seed, inst.baseLevel, inst.floorIndex);
  const chest = floor.objects.find((o) => o.kind === 'chest');
  const pos = chest ?? { x: 0, z: floor.layout.dais.z + 6 };
  const exit = createGroundObject(
    ctx.nextId++,
    '',
    'Rift Egress',
    ctx.groundPos(origin.x + pos.x, origin.z + pos.z),
  );
  exit.templateId = 'rift_exit';
  exit.objectItemId = null;
  exit.lootable = true;
  ctx.addEntity(exit);
  inst.exitId = exit.id;
  for (const pid of instancePlayerIds(ctx, inst)) {
    ctx.emit({
      type: 'log',
      text: 'The rift shudders. A way home tears open behind the fallen.',
      color: '#fd7',
      pid,
    });
  }
}

function instancePlayerIds(ctx: SimContext, inst: RiftInstance): number[] {
  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const out: number[] = [];
  for (const meta of ctx.players.values()) {
    const e = ctx.entities.get(meta.entityId);
    if (
      e &&
      Math.abs(e.pos.x - origin.x) <= RIFT_REGION_HALF_X &&
      Math.abs(e.pos.z - origin.z) <= RIFT_REGION_HALF_Z
    ) {
      out.push(meta.entityId);
    }
  }
  return out;
}

export function updateRiftInstances(ctx: SimContext): void {
  if (ctx.tickCount % 20 !== 0) return; // once a second
  for (const inst of ctx.riftInstances) {
    if (inst.partyKey === null) continue;
    const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);

    // Gate progression.
    const floor = generateRiftFloor(inst.seed, inst.baseLevel, inst.floorIndex);
    if (floor.isBoss) {
      const boss = inst.bossId !== null ? ctx.entities.get(inst.bossId) : null;
      if ((boss === null || boss === undefined || boss.dead) && inst.exitId === null) {
        openExit(ctx, inst);
      }
    } else if (!inst.descentOpen) {
      const pylonsDone = inst.litPylons.size >= inst.pylonTotal;
      if (trashCleared(ctx, inst) && pylonsDone) openDescent(ctx, inst);
    }

    // Empty-slot cleanup.
    let occupied = false;
    for (const meta of ctx.players.values()) {
      const e = ctx.entities.get(meta.entityId);
      if (
        e &&
        Math.abs(e.pos.x - origin.x) <= RIFT_REGION_HALF_X &&
        Math.abs(e.pos.z - origin.z) <= RIFT_REGION_HALF_Z
      ) {
        occupied = true;
        break;
      }
    }
    if (occupied) {
      inst.emptyFor = 0;
    } else {
      inst.emptyFor += 1;
      if (inst.emptyFor >= RIFT_EMPTY_TIMEOUT) freeRiftInstance(ctx, inst);
    }
  }
}
