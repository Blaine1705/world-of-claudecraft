// The Stormbrass Foundry trash (src/sim/content/stormbrass_foundry.ts) on the
// trash kit's Foundry mechanics (src/sim/mob/trash_kit/foundry_kit.ts: the
// Steam Screen and the death bursts) and the shared kit keys (Field Repair on
// automata only, Deploy Turret, Spring Leap, Piston Slam), plus the Gantry
// Hauler's showpiece kit (src/sim/encounters/stormbrass_foundry/
// gantry_hauler.ts): Steam Blast, Scrap Toss, Unload and Boiler Rupture.
// Driven through tickTrashKits / tickFoundryEncounters inside a real claimed
// Foundry (the Temple trash test's shape).

import { describe, expect, it } from 'vitest';
import { STORMBRASS_FOUNDRY_SPAWNS } from '../src/sim/content/stormbrass_foundry';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import {
  FOUNDRY_BURST_RING,
  FOUNDRY_SCRAP_MARK,
  GANTRY_HAULER_ID,
  HAULER_STEAM_BLAST,
  HAULER_TUNING,
  HAULER_UNLOAD_LOG,
  pickScrapTossTarget,
  tickFoundryEncounters,
} from '../src/sim/encounters/stormbrass_foundry';
import { createMob } from '../src/sim/entity';
import { applyDungeonMobTuning } from '../src/sim/instances/difficulty';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import { SCRIPTED_INTERRUPTIBLE_CHANNELS } from '../src/sim/mob/healer_channel';
import { tickTrashKits } from '../src/sim/mob/trash_kit';
import {
  FOUNDRY_ARC_POP,
  FOUNDRY_BOILER_BURST,
  FOUNDRY_DEPLOY_TURRET,
  FOUNDRY_FIELD_REPAIR,
  FOUNDRY_PISTON_SLAM,
  FOUNDRY_STEAM_SCREEN,
  FOUNDRY_STEAM_SCREEN_AURA,
} from '../src/sim/mob/trash_kit/foundry_cast_ids';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type SimEvent } from '../src/sim/types';

const DUNGEON = 'stormbrass_foundry';

interface Room {
  sim: Sim;
  inst: InstanceSlot;
  me: Entity;
  events: SimEvent[];
}

function room(difficulty: 'normal' | 'heroic' = 'normal'): Room {
  const sim = new Sim({ seed: 93, playerClass: 'warrior', autoEquip: false, devCommands: true });
  sim.chat('/dev level 20', sim.player.id);
  sim.chat(`/dev foundry enter ${difficulty}`, sim.player.id);
  const inst = claimedInstanceAt(sim.ctx, sim.player.pos);
  if (!inst) throw new Error('no foundry claim');
  const me = sim.player;
  me.maxHp = 1e6;
  me.hp = 1e6;
  const o = instanceOrigin(DUNGEONS[DUNGEON].index, inst.slot);
  // The Crane Landing behind the Stamping Press, clear of every pack: a quiet bench.
  me.pos = sim.ctx.groundPos(o.x + 8, o.z + 4);
  me.prevPos = { ...me.pos };
  sim.drainEvents();
  return { sim, inst, me, events: [] };
}

function engage(r: Room, templateId: string, dx = 6, dz = 0): Entity {
  const mob = createMob(r.sim.ctx.nextId++, MOBS[templateId], MOBS[templateId].minLevel, {
    ...r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz),
  });
  applyDungeonMobTuning(mob, DUNGEON, r.inst.difficulty);
  r.sim.ctx.addEntity(mob);
  r.inst.mobIds.push(mob.id);
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = r.me.id;
  mob.facing = Math.atan2(r.me.pos.x - mob.pos.x, r.me.pos.z - mob.pos.z);
  return mob;
}

function run(r: Room, seconds: number, mobs: Entity[], encounters = false): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) {
    for (const m of mobs) {
      if (m.dead || !r.sim.ctx.entities.has(m.id)) continue;
      m.inCombat = true;
      m.aiState = 'attack';
      m.aggroTargetId ??= r.me.id;
    }
    tickTrashKits(r.sim.ctx);
    if (encounters) tickFoundryEncounters(r.sim.ctx);
    r.events.push(...r.sim.drainEvents());
  }
}

function addPlayer(r: Room, cls: 'mage' | 'priest' | 'warrior', dx: number, dz: number): Entity {
  const pid = r.sim.addPlayer(cls, `F${cls}${dx}${dz}`);
  const e = r.sim.ctx.entities.get(pid) as Entity;
  e.pos = r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz);
  e.prevPos = { ...e.pos };
  e.maxHp = 1e6;
  e.hp = 1e6;
  return e;
}

/** Damage an ability dealt to one target in the recorded events. */
function dealt(r: Room, targetId: number, ability: string): number[] {
  return r.events
    .filter(
      (e): e is Extract<SimEvent, { type: 'damage' }> =>
        e.type === 'damage' && e.targetId === targetId && e.ability === ability,
    )
    .map((e) => e.amount);
}

function objectsOf(r: Room, templateId: string): Entity[] {
  return r.inst.objectIds
    .map((id) => r.sim.ctx.entities.get(id))
    .filter((e): e is Entity => e !== undefined && e.templateId === templateId);
}

describe('Foundry trash: the cast table and the roster', () => {
  it('kicks the repair and the screen, never the slam or the turret', () => {
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[FOUNDRY_FIELD_REPAIR]?.school).toBe('nature');
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[FOUNDRY_STEAM_SCREEN]?.school).toBe('fire');
    for (const id of [FOUNDRY_PISTON_SLAM, FOUNDRY_DEPLOY_TURRET, HAULER_STEAM_BLAST])
      expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[id], id).toBeUndefined();
  });

  it('gives every Foundry trash type its one readable job (design section 4.1)', () => {
    const slam = MOBS.brass_sentry.breathCone;
    expect(slam?.castId).toBe(FOUNDRY_PISTON_SLAM);
    expect([slam?.castTime, slam?.arcDeg, slam?.range]).toEqual([1.5, 90, 8]);
    expect(MOBS.steam_bruiser.enrage).toEqual({ belowHpPct: 0.3, dmgMult: 1.4 });
    const boiler = MOBS.steam_bruiser.trashKit?.deathBurst;
    expect([boiler?.castId, boiler?.delay, boiler?.radius]).toEqual([FOUNDRY_BOILER_BURST, 1.5, 6]);
    expect(MOBS.arc_drone.elite).toBeUndefined();
    const pop = MOBS.arc_drone.trashKit?.deathBurst;
    expect([pop?.castId, pop?.delay, pop?.radius]).toEqual([FOUNDRY_ARC_POP, 0, 3]);
    const repair = MOBS.foundry_engineer.trashKit?.mend;
    expect([repair?.castTime, repair?.healPct, repair?.family]).toEqual([2.5, 0.3, 'elemental']);
    const turret = MOBS.gearwright_apprentice.trashKit?.call;
    expect([turret?.summon, turret?.every, turret?.count]).toEqual(['tripod_turret', 15, 1]);
    expect(MOBS.clockwork_hound.trashKit?.leap?.maxRange).toBe(25);
    const screen = MOBS.shieldbearer_frame.trashKit?.screen;
    expect([screen?.castTime, screen?.radius, screen?.shieldPct]).toEqual([2, 8, 0.2]);
    expect(MOBS.tripod_turret.moveSpeed).toBe(0);
    expect(MOBS.tripod_turret.petSpell).toBeDefined();
  });

  it('every trash creature stands somewhere in the route, the turret only as a summon', () => {
    const placed = new Set(STORMBRASS_FOUNDRY_SPAWNS.map((s) => s.mobId));
    for (const id of [
      'brass_sentry',
      'steam_bruiser',
      'arc_drone',
      'foundry_engineer',
      'gearwright_apprentice',
      'clockwork_hound',
      'shieldbearer_frame',
      'gantry_hauler',
    ])
      expect(placed.has(id), id).toBe(true);
    expect(placed.has('tripod_turret')).toBe(false);
  });

  it('draws every creature clearly bigger than a player', () => {
    for (const id of [
      'brass_sentry',
      'steam_bruiser',
      'foundry_engineer',
      'gearwright_apprentice',
      'clockwork_hound',
      'shieldbearer_frame',
    ])
      expect(MOBS[id].scale, id).toBeGreaterThanOrEqual(1.25);
    expect(MOBS.gantry_hauler.scale).toBeGreaterThanOrEqual(2.5);
    expect(MOBS.prime_draft.scale).toBeGreaterThanOrEqual(2.5);
  });
});

describe('the Shieldbearer Frame: Steam Screen', () => {
  it('shields every ally in the fight within 8 yd for 20 percent of its own health', () => {
    const r = room();
    const frame = engage(r, 'shieldbearer_frame', 4, 0);
    const near = engage(r, 'brass_sentry', 4, 5);
    const far = engage(r, 'brass_sentry', 4, 14);
    const def = MOBS.shieldbearer_frame.trashKit?.screen;
    if (!def) throw new Error('screen');
    run(r, def.first + 0.05, [frame, near, far]);
    expect(frame.castingAbility).toBe(FOUNDRY_STEAM_SCREEN);
    run(r, def.castTime + 0.1, [frame, near, far]);
    const ward = (e: Entity) => e.auras.find((a) => a.id === FOUNDRY_STEAM_SCREEN_AURA);
    expect(ward(near)?.value).toBe(Math.round(near.maxHp * 0.2));
    expect(ward(frame)?.value).toBe(Math.round(frame.maxHp * 0.2));
    expect(ward(far)).toBeUndefined();
  });

  it('an interrupt wastes the Steam Screen', () => {
    const r = room();
    const frame = engage(r, 'shieldbearer_frame', 4, 0);
    const near = engage(r, 'brass_sentry', 4, 5);
    const def = MOBS.shieldbearer_frame.trashKit?.screen;
    if (!def) throw new Error('screen');
    run(r, def.first + 0.05, [frame, near]);
    expect(frame.castingAbility).toBe(FOUNDRY_STEAM_SCREEN);
    r.sim.ctx.cancelCast(frame);
    run(r, def.castTime + 0.2, [frame, near]);
    expect(near.auras.some((a) => a.id === FOUNDRY_STEAM_SCREEN_AURA)).toBe(false);
  });
});

describe('the Foundry Engineer: Field Repair', () => {
  it('repairs a hurt automaton for 30 percent, never a hurt engineer or apprentice', () => {
    const r = room();
    const engineer = engage(r, 'foundry_engineer', 4, 0);
    const apprentice = engage(r, 'gearwright_apprentice', 4, 4);
    apprentice.hp = Math.floor(apprentice.maxHp * 0.2);
    const def = MOBS.foundry_engineer.trashKit?.mend;
    if (!def) throw new Error('repair');
    run(r, def.first + 0.2, [engineer, apprentice]);
    // Only a humanoid is hurt: nothing to repair.
    expect(engineer.castingAbility).not.toBe(FOUNDRY_FIELD_REPAIR);
    const sentry = engage(r, 'brass_sentry', 4, -4);
    sentry.hp = Math.floor(sentry.maxHp * 0.4);
    run(r, 0.1, [engineer, apprentice, sentry]);
    expect(engineer.castingAbility).toBe(FOUNDRY_FIELD_REPAIR);
    expect(engineer.castTargetId).toBe(sentry.id);
    const before = sentry.hp;
    run(r, def.castTime + 0.1, [engineer, apprentice, sentry]);
    expect(sentry.hp).toBeGreaterThanOrEqual(before + Math.round(sentry.maxHp * 0.3) - 1);
  });
});

describe('the Gearwright Apprentice: Deploy Turret', () => {
  it('plants a Tripod Turret beside her on the fight, two at most', () => {
    const r = room();
    const apprentice = engage(r, 'gearwright_apprentice', 6, 0);
    const def = MOBS.gearwright_apprentice.trashKit?.call;
    if (!def) throw new Error('turret');
    run(r, def.first + def.castTime + 0.1, [apprentice]);
    const turrets = () =>
      apprentice.summonedIds
        .map((id) => r.sim.ctx.entities.get(id))
        .filter((e): e is Entity => e?.templateId === 'tripod_turret' && !e.dead);
    expect(turrets()).toHaveLength(1);
    expect(turrets()[0].aggroTargetId).toBe(r.me.id);
    run(r, def.every * 3, [apprentice]);
    expect(turrets()).toHaveLength(2);
  });
});

describe('the Clockwork Hound: Spring Leap', () => {
  it('leaps onto the farthest caster within 25 yd and holds on', () => {
    const r = room();
    const hound = engage(r, 'clockwork_hound', 3, 0);
    const mage = addPlayer(r, 'mage', 3, 18);
    const def = MOBS.clockwork_hound.trashKit?.leap;
    if (!def) throw new Error('leap');
    run(r, def.first + def.seconds + 0.2, [hound]);
    expect(Math.hypot(hound.pos.x - mage.pos.x, hound.pos.z - mage.pos.z)).toBeLessThan(3);
    expect(hound.forcedTargetId).toBe(mage.id);
  });
});

describe('death bursts: the Steam Bruiser and the Arc Drone', () => {
  it("the bruiser's boiler paints its ring and bursts 1.5 s after it falls, 6 yd", () => {
    const r = room();
    const bruiser = engage(r, 'steam_bruiser', 3, 0);
    const near = addPlayer(r, 'warrior', 3, 4);
    const far = addPlayer(r, 'mage', 3, 9);
    run(r, 0.1, [bruiser]);
    r.sim.ctx.handleDeath(bruiser, r.me);
    run(r, DT, [bruiser]);
    const ring = objectsOf(r, FOUNDRY_BURST_RING);
    expect(ring).toHaveLength(1);
    expect(ring[0].scale).toBe(6);
    run(r, 1.3, [bruiser]);
    expect(dealt(r, near.id, 'Boiler Burst')).toHaveLength(0);
    run(r, 0.3, [bruiser]);
    const hits = dealt(r, near.id, 'Boiler Burst');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeGreaterThanOrEqual(150);
    expect(hits[0]).toBeLessThanOrEqual(180);
    expect(dealt(r, far.id, 'Boiler Burst')).toHaveLength(0);
    expect(objectsOf(r, FOUNDRY_BURST_RING)).toHaveLength(0);
    // It bursts once, never again.
    run(r, 3, [bruiser]);
    expect(dealt(r, near.id, 'Boiler Burst')).toHaveLength(1);
  });

  it('a ring whose mob left the world before its burst is swept off the floor', () => {
    const r = room();
    const bruiser = engage(r, 'steam_bruiser', 3, 0);
    run(r, 0.1, [bruiser]);
    r.sim.ctx.handleDeath(bruiser, r.me);
    run(r, DT, [bruiser]);
    expect(objectsOf(r, FOUNDRY_BURST_RING)).toHaveLength(1);
    // Despawned before it went off (a summoned add leaving with its owner).
    r.sim.ctx.dropEntity(bruiser.id);
    run(r, DT, [], true);
    expect(objectsOf(r, FOUNDRY_BURST_RING)).toHaveLength(0);
    run(r, 2, [], true);
    expect(dealt(r, r.me.id, 'Boiler Burst')).toHaveLength(0);
  });

  it('the Arc Drone pops the moment it dies, 3 yd round it, no ring', () => {
    const r = room();
    const drone = engage(r, 'arc_drone', 2, 0);
    run(r, 0.1, [drone]);
    r.sim.ctx.handleDeath(drone, r.me);
    run(r, DT, [drone]);
    expect(objectsOf(r, FOUNDRY_BURST_RING)).toHaveLength(0);
    const hits = dealt(r, r.me.id, 'Arc Pop');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeGreaterThanOrEqual(60);
    expect(hits[0]).toBeLessThanOrEqual(75);
  });
});

/** The claim's own Gantry Hauler, pulled onto `me` standing `dist` in front of it. */
function hauler(r: Room, dist = 5): Entity {
  const h = r.inst.mobIds
    .map((id) => r.sim.ctx.entities.get(id))
    .find((e): e is Entity => e?.templateId === GANTRY_HAULER_ID);
  if (!h) throw new Error('no hauler');
  h.facing = 0;
  r.me.pos = r.sim.ctx.groundPos(h.pos.x, h.pos.z + dist);
  r.me.prevPos = { ...r.me.pos };
  h.inCombat = true;
  h.aiState = 'attack';
  h.aggroTargetId = r.me.id;
  return h;
}

describe('the Gantry Hauler (showpiece patrol)', () => {
  it('Steam Blast: a braced bar, then the cone hits and throws back the one in front', () => {
    const r = room();
    const h = hauler(r, 6);
    const behind = addPlayer(r, 'mage', 0, -14);
    run(r, HAULER_TUNING.blastFirst + 0.05, [h], true);
    expect(h.castingAbility).toBe(HAULER_STEAM_BLAST);
    const braced = { ...h.pos };
    const z0 = r.me.pos.z;
    run(r, HAULER_TUNING.blastCast + 0.1, [h], true);
    expect(h.pos.x).toBe(braced.x);
    const hits = dealt(r, r.me.id, 'Steam Blast');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeGreaterThanOrEqual(HAULER_TUNING.blastMin);
    expect(hits[0]).toBeLessThanOrEqual(HAULER_TUNING.blastMax);
    expect(r.me.pos.z - z0).toBeGreaterThan(HAULER_TUNING.blastKnockback * 0.5);
    expect(dealt(r, behind.id, 'Steam Blast')).toHaveLength(0);
  });

  it('Scrap Toss marks the FARTHEST player for 2 s; staying hurts, stepping out does not', () => {
    const r = room();
    const h = hauler(r, 4);
    const mid = addPlayer(r, 'warrior', 0, 10);
    const farthest = addPlayer(r, 'mage', 0, 24);
    expect(pickScrapTossTarget(h, [r.me, mid, farthest])?.id).toBe(farthest.id);
    run(r, HAULER_TUNING.tossFirst + 0.05, [h], true);
    const marks = objectsOf(r, FOUNDRY_SCRAP_MARK);
    expect(marks).toHaveLength(1);
    expect(marks[0].scale).toBe(HAULER_TUNING.tossRadius);
    expect(
      Math.hypot(marks[0].pos.x - farthest.pos.x, marks[0].pos.z - farthest.pos.z),
    ).toBeLessThan(0.5);
    run(r, HAULER_TUNING.tossWarning + 0.1, [h], true);
    const hits = dealt(r, farthest.id, 'Scrap Toss');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeGreaterThanOrEqual(HAULER_TUNING.tossMin);
    expect(hits[0]).toBeLessThanOrEqual(HAULER_TUNING.tossMax);
    expect(objectsOf(r, FOUNDRY_SCRAP_MARK)).toHaveLength(0);
    // The next plate: the target steps out of the mark in time.
    run(r, HAULER_TUNING.tossEvery - HAULER_TUNING.tossWarning - 0.1, [h], true);
    expect(objectsOf(r, FOUNDRY_SCRAP_MARK)).toHaveLength(1);
    farthest.pos = r.sim.ctx.groundPos(farthest.pos.x + 8, farthest.pos.z);
    run(r, HAULER_TUNING.tossWarning + 0.1, [h], true);
    expect(dealt(r, farthest.id, 'Scrap Toss')).toHaveLength(1);
  });

  it('Unload: at half health three Arc Drones spill out onto the fight, once', () => {
    const r = room();
    const h = hauler(r, 5);
    run(r, 0.1, [h], true);
    expect(h.summonedIds).toHaveLength(0);
    h.hp = Math.floor(h.maxHp * 0.49);
    run(r, 0.1, [h], true);
    const drones = h.summonedIds
      .map((id) => r.sim.ctx.entities.get(id))
      .filter((e): e is Entity => e?.templateId === 'arc_drone');
    expect(drones).toHaveLength(HAULER_TUNING.unloadCount);
    for (const d of drones) expect(d.aggroTargetId).toBe(r.me.id);
    expect(r.events.some((e) => e.type === 'log' && e.text === HAULER_UNLOAD_LOG)).toBe(true);
    run(r, 2, [h], true);
    expect(h.summonedIds).toHaveLength(HAULER_TUNING.unloadCount);
  });

  it('Boiler Rupture: 2 s after it falls its boiler bursts, 8 yd', () => {
    const r = room();
    const h = hauler(r, 5);
    run(r, 0.1, [h], true);
    r.sim.ctx.handleDeath(h, r.me);
    run(r, 1.8, [h], true);
    expect(dealt(r, r.me.id, 'Boiler Rupture')).toHaveLength(0);
    expect(objectsOf(r, FOUNDRY_BURST_RING)[0]?.scale).toBe(8);
    run(r, 0.3, [h], true);
    const hits = dealt(r, r.me.id, 'Boiler Rupture');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeGreaterThanOrEqual(140);
    expect(hits[0]).toBeLessThanOrEqual(160);
  });

  it('a wipe or an evade drops the plates in flight and the bar', () => {
    const r = room();
    const h = hauler(r, 4);
    addPlayer(r, 'mage', 0, 24);
    run(r, HAULER_TUNING.tossFirst + 0.05, [h], true);
    expect(objectsOf(r, FOUNDRY_SCRAP_MARK)).toHaveLength(1);
    h.inCombat = false;
    h.aiState = 'evade';
    h.aggroTargetId = null;
    tickFoundryEncounters(r.sim.ctx);
    expect(objectsOf(r, FOUNDRY_SCRAP_MARK)).toHaveLength(0);
    expect(h.foundryFight).toBeUndefined();
  });

  it('heroic prices its avoidables 2.5x the normal landed numbers', () => {
    const r = room('heroic');
    const h = hauler(r, 6);
    run(r, HAULER_TUNING.blastFirst + HAULER_TUNING.blastCast + 0.2, [h], true);
    const hits = dealt(r, r.me.id, 'Steam Blast');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeGreaterThanOrEqual(Math.round(HAULER_TUNING.blastMin * 2.5));
    expect(hits[0]).toBeLessThanOrEqual(Math.round(HAULER_TUNING.blastMax * 2.5));
  });
});
