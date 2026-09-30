// The dungeon trash kit (src/sim/mob/trash_kit) on the Hollow Crypt's trash:
// every pack mechanic's timing, its target, its counterplay (an interrupt, a
// lockout, stepping out), the summon and growth rules, the perch dive, the
// drake's flight and landing, and heroic scaling. Driven directly through
// tickTrashKits inside a real claimed crypt, the hoard add-cast test's shape.

import { describe, expect, it } from 'vitest';
import { HOLLOW_CRYPT_SPAWNS } from '../src/sim/content/hollow_crypt';
import { ARCADE_TOP_Y, HOLLOW_CRYPT_FIELD } from '../src/sim/content/hollow_crypt_layout';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';
import { applyDungeonMobTuning } from '../src/sim/instances/difficulty';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import { SCRIPTED_INTERRUPTIBLE_CHANNELS } from '../src/sim/mob/healer_channel';
import { patrolPointAt } from '../src/sim/mob/patrol';
import {
  CRYPT_BARROWFLAME_BREATH,
  CRYPT_GRAVE_BOLT,
  CRYPT_GRAVE_CLEAVE,
  CRYPT_MURDER_CALL,
  CRYPT_RAISE_BONES,
  CRYPT_STONE_SHRIEK,
  CRYPT_TAIL_LASH,
  CRYPT_WING_GUST,
  pickHashedTarget,
  pickLeapTarget,
  tickTrashKits,
} from '../src/sim/mob/trash_kit';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type TrashKitState } from '../src/sim/types';

/** Read the kit state fresh (a test may have cleared it above). */
function kitOf(e: Entity): TrashKitState | undefined {
  return e.trashKit;
}

interface Room {
  sim: Sim;
  inst: InstanceSlot;
  me: Entity;
  ox: number;
  oz: number;
}

function room(difficulty: 'normal' | 'heroic' = 'normal'): Room {
  const sim = new Sim({ seed: 91, playerClass: 'warrior', autoEquip: false, devCommands: true });
  sim.chat('/dev level 20', sim.player.id);
  sim.chat(`/dev crypt enter ${difficulty}`, sim.player.id);
  const inst = claimedInstanceAt(sim.ctx, sim.player.pos);
  if (!inst) throw new Error('no crypt claim');
  const me = sim.player;
  me.maxHp = 1e6;
  me.hp = 1e6;
  const o = instanceOrigin(DUNGEONS.hollow_crypt.index, inst.slot);
  // The cloister floor, clear of every pack: a quiet test bench.
  me.pos = sim.ctx.groundPos(o.x + 20, o.z - 10);
  me.prevPos = { ...me.pos };
  sim.drainEvents();
  return { sim, inst, me, ox: o.x, oz: o.z };
}

/** A kit mob `dx` yards east of the player, engaged on it. */
function engage(r: Room, templateId: string, dx = 8, dz = 0): Entity {
  const mob = createMob(r.sim.ctx.nextId++, MOBS[templateId], MOBS[templateId].minLevel, {
    ...r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz),
  });
  applyDungeonMobTuning(mob, 'hollow_crypt', r.inst.difficulty);
  r.sim.ctx.addEntity(mob);
  r.inst.mobIds.push(mob.id);
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = r.me.id;
  mob.facing = Math.atan2(r.me.pos.x - mob.pos.x, r.me.pos.z - mob.pos.z);
  return mob;
}

/** Run only the kit for `seconds`, holding every listed mob engaged. */
function run(r: Room, seconds: number, mobs: Entity[]): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) {
    for (const m of mobs) {
      if (m.dead || !r.sim.ctx.entities.has(m.id)) continue;
      m.inCombat = true;
      m.aiState = 'attack';
      m.aggroTargetId ??= r.me.id;
    }
    tickTrashKits(r.sim.ctx);
    r.sim.drainEvents();
  }
}

function addPlayer(r: Room, cls: 'mage' | 'priest' | 'warrior', dx: number, dz: number): Entity {
  const pid = r.sim.addPlayer(cls, `T${cls}${dx}`);
  const e = r.sim.ctx.entities.get(pid) as Entity;
  e.pos = r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz);
  e.prevPos = { ...e.pos };
  e.maxHp = 1e6;
  e.hp = 1e6;
  return e;
}

describe('trash kit: the cast table', () => {
  it('registers every kick-able cast with its school, and leaves the dodges unkickable', () => {
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[CRYPT_GRAVE_BOLT]?.school).toBe('shadow');
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[CRYPT_RAISE_BONES]?.school).toBe('shadow');
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[CRYPT_MURDER_CALL]?.school).toBe('nature');
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[CRYPT_STONE_SHRIEK]?.school).toBe('nature');
    for (const id of [
      CRYPT_GRAVE_CLEAVE,
      CRYPT_BARROWFLAME_BREATH,
      CRYPT_TAIL_LASH,
      CRYPT_WING_GUST,
    ])
      expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[id], id).toBeUndefined();
  });

  it('picks targets by a stable hash and leaps at the farthest caster', () => {
    const r = room();
    const near = addPlayer(r, 'warrior', 10, 0);
    const mage = addPlayer(r, 'mage', 20, 0);
    const priest = addPlayer(r, 'priest', 26, 0);
    const players = [r.me, near, mage, priest];
    const a = pickHashedTarget(players, r.me.pos, 40, 77, 3);
    expect(pickHashedTarget(players, r.me.pos, 40, 77, 3)).toBe(a);
    // The farthest MANA user wins over a farther rage user.
    const farWarrior = addPlayer(r, 'warrior', 29, 0);
    expect(pickLeapTarget([...players, farWarrior], r.me.pos, 8, 30)?.id).toBe(priest.id);
    // Nobody in the band: no leap.
    expect(pickLeapTarget([r.me], r.me.pos, 8, 30)).toBeNull();
  });
});

describe('trash kit: Gravecaller Adept, Grave Bolt', () => {
  const def = MOBS.crypt_gravecaller_adept.trashKit?.bolt;
  if (!def) throw new Error('bolt');

  it('opens its bar after the first delay and hits hard only when the bar completes', () => {
    const r = room();
    const mob = engage(r, 'crypt_gravecaller_adept');
    run(r, def.first - 0.2, [mob]);
    expect(mob.castingAbility).toBeNull();
    run(r, 0.3, [mob]);
    expect(mob.castingAbility).toBe(CRYPT_GRAVE_BOLT);
    expect(mob.castTotal).toBe(2.5);
    expect(mob.castTargetId).toBe(r.me.id);
    const before = r.me.hp;
    run(r, def.castTime - 0.2, [mob]);
    expect(r.me.hp).toBe(before);
    run(r, 0.3, [mob]);
    expect(mob.castingAbility).toBeNull();
    const dealt = before - r.me.hp;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThanOrEqual(def.max * 1.01);
  });

  it('an interrupt drops the bolt, and the school lockout holds the next one', () => {
    const r = room();
    const mob = engage(r, 'crypt_gravecaller_adept');
    run(r, def.first + DT, [mob]);
    expect(mob.castingAbility).toBe(CRYPT_GRAVE_BOLT);
    const before = r.me.hp;
    r.sim.ctx.cancelCast(mob);
    r.sim.ctx.applyAura(mob, {
      id: 'pummel_lockout',
      name: 'Pummel',
      kind: 'lockout',
      remaining: 4,
      duration: 4,
      value: 0,
      sourceId: r.me.id,
      school: 'shadow',
    });
    // A full cycle passes while the lockout holds: nothing lands, nothing starts.
    run(r, def.castTime + 0.5, [mob]);
    expect(r.me.hp).toBe(before);
    expect(mob.castingAbility).toBeNull();
  });
});

describe('trash kit: Gravecaller Necromancer and the Bone Minion', () => {
  const raise = MOBS.crypt_gravecaller_necromancer.trashKit?.raise;
  const grow = MOBS.crypt_bone_minion.trashKit?.grow;
  if (!raise || !grow) throw new Error('kit');

  it('raises one minion per channel, straight into the fight, never more than two', () => {
    const r = room();
    // Hold the minions short of their growth so only the cap is under test.
    const kit = MOBS.crypt_bone_minion.trashKit;
    const saved = kit?.grow;
    if (kit) kit.grow = undefined;
    const mob = engage(r, 'crypt_gravecaller_necromancer');
    run(r, raise.first + DT, [mob]);
    expect(mob.castingAbility).toBe(CRYPT_RAISE_BONES);
    expect(mob.channeling).toBe(true);
    run(r, raise.castTime + DT * 2, [mob]);
    const minions = () =>
      mob.summonedIds
        .map((id) => r.sim.ctx.entities.get(id))
        .filter((e): e is Entity => !!e && !e.dead && e.templateId === 'crypt_bone_minion');
    expect(minions()).toHaveLength(1);
    expect(minions()[0].aggroTargetId).toBe(r.me.id);
    run(r, raise.every + raise.castTime, [mob]);
    expect(minions()).toHaveLength(2);
    run(r, raise.every + raise.castTime, [mob]);
    expect(minions()).toHaveLength(2);
    expect(mob.castingAbility).toBeNull();
    if (kit) kit.grow = saved;
  });

  it('an interrupted Raise Bones raises nothing', () => {
    const r = room();
    const mob = engage(r, 'crypt_gravecaller_necromancer');
    run(r, raise.first + 1, [mob]);
    r.sim.ctx.cancelCast(mob);
    run(r, raise.castTime + 1, [mob]);
    expect(mob.summonedIds).toHaveLength(0);
  });

  it('a minion left alive grows into an elite Bone Brute where it stood', () => {
    const r = room();
    const minion = engage(r, 'crypt_bone_minion', 3);
    const at = { ...minion.pos };
    run(r, grow.after - 0.2, [minion]);
    expect(r.sim.ctx.entities.has(minion.id)).toBe(true);
    run(r, 0.3, [minion]);
    expect(r.sim.ctx.entities.has(minion.id)).toBe(false);
    const brute = [...r.sim.ctx.entities.values()].find((e) => e.templateId === 'crypt_bone_brute');
    expect(brute).toBeDefined();
    expect(MOBS.crypt_bone_brute.elite).toBe(true);
    expect(Math.hypot((brute as Entity).pos.x - at.x, (brute as Entity).pos.z - at.z)).toBeLessThan(
      0.5,
    );
    expect(brute?.aggroTargetId).toBe(r.me.id);
  });

  it('a killed minion bursts a moment later on whoever stands in its ring', () => {
    const r = room();
    const burst = MOBS.crypt_bone_minion.deathThroes;
    if (!burst) throw new Error('burst');
    const minion = engage(r, 'crypt_bone_minion', 2);
    const far = addPlayer(r, 'warrior', 2 + burst.radius + 3, 0);
    r.sim.ctx.handleDeath(minion, r.me);
    const nearBefore = r.me.hp;
    const farBefore = far.hp;
    for (let t = 0; t < burst.delay - 0.3; t += DT) r.sim.tick();
    expect(r.me.hp).toBe(nearBefore);
    for (let t = 0; t < 0.6; t += DT) r.sim.tick();
    expect(r.me.hp).toBeLessThan(nearBefore);
    expect(far.hp).toBe(farBefore);
  });
});

describe('trash kit: Chapel Gargoyle', () => {
  const screech = MOBS.crypt_chapel_gargoyle.trashKit?.screech;
  if (!screech) throw new Error('screech');

  it('waits on a whole arch cap and dives to the floor when its pack is pulled', () => {
    const r = room();
    const idx = HOLLOW_CRYPT_SPAWNS.findIndex((s) => s.mobId === 'crypt_chapel_gargoyle');
    const garg = r.sim.ctx.entities.get(r.inst.mobIds[idx]) as Entity;
    expect(garg.pos.y).toBeCloseTo(ARCADE_TOP_Y, 3);
    // Idle ticks hold it on the perch.
    tickTrashKits(r.sim.ctx);
    expect(garg.pos.y).toBeCloseTo(ARCADE_TOP_Y, 3);
    garg.inCombat = true;
    garg.aiState = 'chase';
    garg.aggroTargetId = r.me.id;
    const dive = MOBS.crypt_chapel_gargoyle.trashKit?.perch?.diveSeconds ?? 1;
    run(r, dive * 0.5, [garg]);
    expect(garg.pos.y).toBeGreaterThan(0.5);
    expect(garg.pos.y).toBeLessThan(ARCADE_TOP_Y);
    run(r, dive * 0.6, [garg]);
    const floor = authoredFieldHeight(HOLLOW_CRYPT_FIELD, garg.pos.x - r.ox, garg.pos.z - r.oz);
    expect(garg.pos.y).toBeCloseTo(floor, 3);
  });

  it('Stone Shriek stuns everyone close and nobody farther out', () => {
    const r = room();
    const mob = engage(r, 'crypt_chapel_gargoyle', 3);
    const far = addPlayer(r, 'mage', 3 + screech.radius + 4, 0);
    run(r, screech.first + screech.castTime + DT * 2, [mob]);
    const stunned = (e: Entity) =>
      e.auras.some((a) => a.kind === 'stun' && a.id === CRYPT_STONE_SHRIEK);
    expect(stunned(r.me)).toBe(true);
    expect(stunned(far)).toBe(false);
  });
});

describe('trash kit: Crow Caller', () => {
  const call = MOBS.crypt_crow_caller.trashKit?.call;
  if (!call) throw new Error('call');

  it('Murder Call summons a flock, and holds while the flock is at its cap', () => {
    const r = room();
    const mob = engage(r, 'crypt_crow_caller');
    run(r, call.first + call.castTime + DT * 3, [mob]);
    const crows = () =>
      mob.summonedIds.filter(
        (id) => r.sim.ctx.entities.get(id)?.templateId === 'crypt_carrion_crow',
      );
    expect(crows()).toHaveLength(call.count);
    run(r, call.every + call.castTime, [mob]);
    // 4 + 4 would pass the cap of 6: the second call waits.
    expect(crows()).toHaveLength(call.count);
    expect(mob.castingAbility).toBeNull();
  });
});

describe('trash kit: Ossuary Cutthroat', () => {
  const leap = MOBS.crypt_ossuary_cutthroat.trashKit?.leap;
  if (!leap) throw new Error('leap');

  it('leaps onto the farthest caster, bleeds it and fixates on it', () => {
    const r = room();
    const mob = engage(r, 'crypt_ossuary_cutthroat', 2);
    const mage = addPlayer(r, 'mage', -18, 6);
    run(r, leap.first + DT, [mob]);
    run(r, leap.seconds + DT * 2, [mob]);
    expect(Math.hypot(mob.pos.x - mage.pos.x, mob.pos.z - mage.pos.z)).toBeLessThan(2);
    expect(mage.auras.some((a) => a.id === 'crypt_rending_leap' && a.kind === 'dot')).toBe(true);
    expect(mob.forcedTargetId).toBe(mage.id);
  });
});

describe('trash kit: Ossuary Drake', () => {
  it('flies its loop at its altitude, a pure function of time', () => {
    const r = room();
    const idx = HOLLOW_CRYPT_SPAWNS.findIndex((s) => s.mobId === 'crypt_ossuary_drake');
    const spawn = HOLLOW_CRYPT_SPAWNS[idx];
    const drake = r.sim.ctx.entities.get(r.inst.mobIds[idx]) as Entity;
    expect(drake.pos.y).toBeCloseTo(spawn.patrol?.altitude ?? 0, 3);
    // Keep the bench player far from the loop so the drake never pulls.
    for (let i = 0; i < 20 * 20; i++) r.sim.tick();
    const loop = drake.dungeonPatrol;
    if (!loop) throw new Error('loop');
    const speed = drake.moveSpeed * loop.pace;
    const expected = patrolPointAt(loop.points, r.sim.ctx.time * speed + loop.offset);
    expect(Math.hypot(drake.pos.x - expected.x, drake.pos.z - expected.z)).toBeLessThan(0.6);
    expect(drake.pos.y).toBeCloseTo(loop.flightY ?? 0, 3);
  });

  it('glides down from its flight when a player below pulls it (full sim ticks)', () => {
    const r = room();
    const idx = HOLLOW_CRYPT_SPAWNS.findIndex((s) => s.mobId === 'crypt_ossuary_drake');
    const drake = r.sim.ctx.entities.get(r.inst.mobIds[idx]) as Entity;
    for (let i = 0; i < 20; i++) r.sim.tick();
    const flightY = drake.dungeonPatrol?.flightY ?? 0;
    expect(drake.pos.y).toBeCloseTo(flightY, 3);
    // Stand right under it: the pass overhead is the pull.
    r.me.pos = r.sim.ctx.groundPos(drake.pos.x, drake.pos.z);
    r.me.prevPos = { ...r.me.pos };
    r.sim.rebucket(r.me);
    const land = MOBS.crypt_ossuary_drake.trashKit?.land?.seconds ?? 1;
    let midAir = false;
    for (let t = 0; t < land + 0.5; t += DT) {
      r.sim.tick();
      const floor = authoredFieldHeight(HOLLOW_CRYPT_FIELD, drake.pos.x - r.ox, drake.pos.z - r.oz);
      if (drake.pos.y > floor + 2 && drake.pos.y < flightY - 2) midAir = true;
    }
    expect(drake.aiState === 'chase' || drake.aiState === 'attack').toBe(true);
    // It came down through the air, not in one snap.
    expect(midAir).toBe(true);
    const floor = authoredFieldHeight(HOLLOW_CRYPT_FIELD, drake.pos.x - r.ox, drake.pos.z - r.oz);
    expect(drake.pos.y).toBeCloseTo(floor, 3);
  });

  it('lands when pulled, then lashes whoever stands behind it', () => {
    const r = room();
    const drake = engage(r, 'crypt_ossuary_drake', 0, 6);
    const land = MOBS.crypt_ossuary_drake.trashKit?.land?.seconds ?? 1;
    const lash = MOBS.crypt_ossuary_drake.trashKit?.tailLash;
    if (!lash) throw new Error('lash');
    drake.trashKit = undefined;
    drake.pos.y += 20;
    run(r, DT, [drake]);
    expect(kitOf(drake)?.descent).not.toBeNull();
    run(r, land + DT, [drake]);
    const floor = authoredFieldHeight(HOLLOW_CRYPT_FIELD, drake.pos.x - r.ox, drake.pos.z - r.oz);
    expect(drake.pos.y).toBeCloseTo(floor, 3);
    // It faces the player (south of it); a mage stands behind, north.
    drake.facing = Math.atan2(r.me.pos.x - drake.pos.x, r.me.pos.z - drake.pos.z);
    const behind = addPlayer(r, 'mage', 0, 12);
    const frontBefore = r.me.hp;
    const behindBefore = behind.hp;
    run(r, lash.first + lash.castTime + DT * 2, [drake]);
    expect(behind.hp).toBeLessThan(behindBefore);
    expect(r.me.hp).toBe(frontBefore);
  });

  it('Wing Gust throws the close ones back', () => {
    const r = room();
    const drake = engage(r, 'crypt_ossuary_drake', 4);
    const gust = MOBS.crypt_ossuary_drake.trashKit?.wingGust;
    if (!gust) throw new Error('gust');
    drake.trashKit = undefined;
    const before = Math.hypot(r.me.pos.x - drake.pos.x, r.me.pos.z - drake.pos.z);
    // Only the gust: push the lash far out.
    run(r, DT, [drake]);
    const kit = kitOf(drake);
    if (kit) kit.timers.tailLash = 999;
    run(r, gust.first + gust.castTime + DT * 2, [drake]);
    const after = Math.hypot(r.me.pos.x - drake.pos.x, r.me.pos.z - drake.pos.z);
    expect(after).toBeGreaterThan(before + 3);
  });
});

describe('trash kit: Ossuary Warrior, Grave Cleave', () => {
  it('cleaves the cone in front after its bar, never the one standing behind', () => {
    const r = room();
    const cleave = MOBS.crypt_ossuary_warrior.breathCone;
    if (!cleave) throw new Error('cleave');
    expect(cleave.castId).toBe(CRYPT_GRAVE_CLEAVE);
    const mob = engage(r, 'crypt_ossuary_warrior', 2);
    const behind = addPlayer(r, 'mage', 6, 0);
    const front = addPlayer(r, 'priest', -1, 0.5);
    const hurt = (e: Entity) => e.hp < 1e6;
    let barSeen = false;
    for (let t = 0; t < cleave.every + cleave.castTime + 1; t += DT) {
      r.sim.tick();
      if (mob.castingAbility === CRYPT_GRAVE_CLEAVE) barSeen = true;
      if (hurt(front)) break;
    }
    expect(barSeen).toBe(true);
    expect(hurt(front)).toBe(true);
    // The mage behind the warrior was never inside the cone.
    expect(hurt(behind)).toBe(false);
  });
});

describe('trash kit: pulls and difficulty', () => {
  it('a mob that leaves combat drops its bar and its kit state', () => {
    const r = room();
    const def = MOBS.crypt_gravecaller_adept.trashKit?.bolt;
    const mob = engage(r, 'crypt_gravecaller_adept');
    run(r, (def?.first ?? 3) + DT, [mob]);
    expect(mob.castingAbility).toBe(CRYPT_GRAVE_BOLT);
    mob.inCombat = false;
    mob.aiState = 'evade';
    tickTrashKits(r.sim.ctx);
    expect(mob.castingAbility).toBeNull();
    expect(mob.trashKit).toBeUndefined();
  });

  it('heroic scales every landing through the mob mechanic multiplier', () => {
    const r = room('heroic');
    const mob = engage(r, 'crypt_gravecaller_adept');
    expect(mob.mechanicDamageMult ?? 1).toBeGreaterThan(1);
    const def = MOBS.crypt_gravecaller_adept.trashKit?.bolt;
    if (!def) throw new Error('bolt');
    const before = r.me.hp;
    run(r, def.first + def.castTime + DT * 2, [mob]);
    expect(before - r.me.hp).toBeGreaterThanOrEqual(
      Math.floor(def.min * (mob.mechanicDamageMult ?? 1)) - 1,
    );
  });
});
