// The Mirefen muster: the army Balgath's warpath now marches on (src/sim/mirefen_muster.ts,
// its posts in src/sim/content/mirefen_muster.ts, the soldier AI arm in
// src/sim/mob/muster_soldier.ts and the lethal-collateral rule in mob/boss_collateral.ts).
//
// Two layers. The placement rules are measured against the real heightfield and camp
// table (dry, clear of wildlife, out of the crater bowl). The behavior runs in a live Sim:
// the muster rises with the boss, soldiers stay friendly, untouchable and out of every
// hate table, the arrival slam at each picket kills the squad standing in it and spares the
// sentries, and the fallen stand back up after the pull and at dawn.
import { describe, expect, it } from 'vitest';
import {
  MUSTER_CAMPS,
  MUSTER_CIRCUIT,
  MUSTER_INNER_RADIUS,
  MUSTER_RACK,
  MUSTER_RACK_TEMPLATE_ID,
  musterCamp,
} from '../src/sim/content/mirefen_muster';
import { BUILTIN_WORLD, MOBS } from '../src/sim/data';
import {
  MUSTER_BRACE_RANGE,
  MUSTER_FACING_STEP,
  MUSTER_RESPAWN_DELAY,
  type MusterArmyState,
  tickMusterArmy,
} from '../src/sim/mirefen_muster';
import { blindEyeWard } from '../src/sim/mob/eye_ward';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { CampDef, Entity, WorldContent } from '../src/sim/types';
import {
  groundHeight,
  isInWaterBody,
  MIREFEN_IMPACT_CRATER,
  terrainHeight,
  waterLevel,
} from '../src/sim/world';
import { WORLD_BOSSES } from '../src/sim/world_boss';
import { WORLD_SEED } from '../src/sim/world_seed';

const BALGATH = 'balgath_cyclops';

function lair(): { x: number; z: number } {
  const row = WORLD_BOSSES.find((b) => b.templateId === BALGATH);
  if (!row) throw new Error('balgath_cyclops is not in WORLD_BOSSES');
  return row.pos;
}

/** A camp-free world (the warpath suite's trick): only the bodies under test tick. */
function testWorld(camps: CampDef[] = []): WorldContent {
  return { ...BUILTIN_WORLD, camps, npcs: {}, groundObjects: [] };
}

interface Internals {
  ctx: SimContext;
  musterArmy: MusterArmyState;
  spawnDevBoss(t: string, x: number, z: number): number;
  setGm(pid?: number, on?: boolean): void;
  dealDamage(...a: unknown[]): number;
}
const inner = (sim: Sim) => sim as unknown as Internals;

/** Spawn Balgath at his bed and tick until the muster answers (the dev-spawn scan). */
function raise(sim: Sim): Entity {
  const id = inner(sim).spawnDevBoss(BALGATH, lair().x, lair().z);
  const boss = sim.entities.get(id);
  if (!boss) throw new Error('no boss');
  for (let i = 0; i < 25 && inner(sim).musterArmy.soldierIds.length === 0; i++) sim.tick();
  return boss;
}

/** soldier entity id -> the camp that posted him (soldierIds follows MUSTER_CAMPS order). */
function campOfSoldier(army: MusterArmyState): Map<number, string> {
  const out = new Map<number, string>();
  let i = 0;
  for (const camp of MUSTER_CAMPS)
    for (const _ of camp.soldiers) out.set(army.soldierIds[i++], camp.id);
  return out;
}

const place = (sim: Sim, e: Entity, x: number, z: number) => {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
};

describe('muster placement (measured)', () => {
  const wl = waterLevel();
  const ground = (x: number, z: number) =>
    Math.min(terrainHeight(x, z, WORLD_SEED), groundHeight(x, z, WORLD_SEED));

  it('puts every camp and every post on dry ground, out of the crater bowl', () => {
    for (const camp of MUSTER_CAMPS) {
      for (let dx = -10; dx <= 10; dx += 2) {
        for (let dz = -10; dz <= 10; dz += 2) {
          if (dx * dx + dz * dz > 100) continue;
          const x = camp.center.x + dx;
          const z = camp.center.z + dz;
          expect(isInWaterBody(x, z), `${camp.id} footprint in water at ${x},${z}`).toBe(false);
          expect(ground(x, z) - wl, `${camp.id} footprint shallow at ${x},${z}`).toBeGreaterThan(
            1.5,
          );
        }
      }
      for (const slot of camp.soldiers) {
        const x = camp.center.x + slot.dx;
        const z = camp.center.z + slot.dz;
        expect(ground(x, z) - wl, `${camp.id} post at ${x},${z}`).toBeGreaterThan(1.5);
        expect(
          Math.hypot(x - MIREFEN_IMPACT_CRATER.x, z - MIREFEN_IMPACT_CRATER.z),
          `${camp.id} post in the crater bowl`,
        ).toBeGreaterThan(MIREFEN_IMPACT_CRATER.bowlRadius + 2);
      }
    }
  });

  it('keeps every camp and post clear of every wildlife camp by aggro reach plus margin', () => {
    // MAX_AGGRO_RADIUS is 20; a quester standing at a picket must never pull the thicket.
    for (const camp of MUSTER_CAMPS) {
      for (const wild of BUILTIN_WORLD.camps) {
        const d = Math.hypot(camp.center.x - wild.center.x, camp.center.z - wild.center.z);
        expect(d - wild.radius, `${camp.id} vs ${wild.mobId}`).toBeGreaterThan(29);
        for (const slot of camp.soldiers) {
          const sx = camp.center.x + slot.dx;
          const sz = camp.center.z + slot.dz;
          const ds = Math.hypot(sx - wild.center.x, sz - wild.center.z);
          expect(ds - wild.radius, `${camp.id} post vs ${wild.mobId}`).toBeGreaterThan(22);
        }
      }
    }
  });

  it('packs each picket so an arrival slam lands on most of it and spares its sentries', () => {
    const wreck = MOBS[BALGATH]?.warpath?.wreck.radius ?? 0;
    const arrive = MOBS[BALGATH]?.warpath?.arriveRadius ?? 0;
    for (const id of MUSTER_CIRCUIT) {
      const camp = musterCamp(id);
      const innerRing = camp.soldiers.filter((s) => Math.hypot(s.dx, s.dz) <= MUSTER_INNER_RADIUS);
      const sentries = camp.soldiers.filter((s) => Math.hypot(s.dx, s.dz) > MUSTER_INNER_RADIUS);
      expect(innerRing.length, `${id} inner ring`).toBeGreaterThanOrEqual(5);
      expect(innerRing.length).toBeGreaterThan(sentries.length);
      // Wherever inside arriveRadius he plants, the whole inner ring is under the ring...
      expect(MUSTER_INNER_RADIUS + arrive).toBeLessThan(wreck);
      // ...and every sentry is outside it.
      for (const s of sentries) expect(Math.hypot(s.dx, s.dz) - arrive).toBeGreaterThan(wreck);
    }
  });

  it('keeps the weapon rack at the command camp, which is never a stop', () => {
    const command = musterCamp('command');
    expect(command.onCircuit).toBe(false);
    expect(
      Math.hypot(MUSTER_RACK.x - command.center.x, MUSTER_RACK.z - command.center.z),
    ).toBeLessThan(8);
  });
});

describe('the muster in a live world', () => {
  it('rises with the boss, never before, with a friendly squad at every camp and the rack', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true, world: testWorld() });
    for (let i = 0; i < 60; i++) sim.tick();
    // No boss, no muster: a world that never sees him keeps every entity id it had.
    expect(inner(sim).musterArmy.soldierIds).toEqual([]);
    raise(sim);
    const army = inner(sim).musterArmy;
    const total = MUSTER_CAMPS.reduce((n, c) => n + c.soldiers.length, 0);
    expect(army.soldierIds.length).toBe(total);
    expect(total).toBeGreaterThanOrEqual(30);
    for (const id of army.soldierIds) {
      const s = sim.entities.get(id);
      expect(s?.kind).toBe('mob');
      expect(s?.hostile).toBe(false);
      // Untouchable: the ordinary hostility rule refuses every player attack on him.
      expect(sim.isHostileTo(sim.player, s as Entity)).toBe(false);
    }
    const rack = army.rackId !== null ? sim.entities.get(army.rackId) : undefined;
    expect(rack?.templateId).toBe(MUSTER_RACK_TEMPLATE_ID);
    expect(rack?.kind).toBe('object');
  });

  it('is left alone by wildlife and leaves wildlife alone', () => {
    // A widow camp dropped right on the west picket: the widows scan for PLAYERS only, the
    // soldiers never scan at all, and neither side ever takes the other as a target.
    const west = musterCamp('west');
    const widows: CampDef = {
      mobId: 'mire_widow',
      center: { x: west.center.x + 7, z: west.center.z },
      radius: 1.5,
      count: 3,
      offStream: true,
    };
    const sim = new Sim({
      seed: 42,
      playerClass: 'warrior',
      autoEquip: true,
      world: testWorld([widows]),
    });
    raise(sim);
    const army = inner(sim).musterArmy;
    for (let i = 0; i < 20 * 20; i++) sim.tick();
    const soldiers = army.soldierIds.map((id) => sim.entities.get(id) as Entity);
    for (const s of soldiers) {
      expect(s.dead).toBe(false);
      expect(s.hp).toBe(s.maxHp);
      expect(s.inCombat).toBe(false);
      expect(s.threat.size).toBe(0);
    }
    const spiders = [...sim.entities.values()].filter((e) => e.templateId === 'mire_widow');
    expect(spiders.length).toBe(3);
    const soldierIds = new Set(army.soldierIds);
    for (const w of spiders) {
      expect(w.aggroTargetId === null || !soldierIds.has(w.aggroTargetId)).toBe(true);
      for (const id of w.threat.keys()) expect(soldierIds.has(id)).toBe(false);
    }
  });

  it('wrecks each picket in turn: the squad in the ring dies, the sentries live, no hate table ever sees a soldier', () => {
    // Through the SCHEDULER this time (worldBossAtBoot, as the live realm boots), so his
    // participant HP scaling is live and can prove no soldier ever counted as one.
    const sim = new Sim({
      seed: 42,
      playerClass: 'warrior',
      autoEquip: true,
      world: testWorld(),
      worldBossAtBoot: true,
    });
    sim.setPlayerLevel(20);
    inner(sim).setGm(sim.playerId, true);
    const player = sim.player;
    place(sim, player, lair().x, lair().z - 18);
    sim.tick();
    const bossId = inner(sim).musterArmy.bossId;
    const boss = bossId !== null ? (sim.entities.get(bossId) as Entity) : null;
    if (!boss) throw new Error('the scheduler raised no Balgath');
    const army = inner(sim).musterArmy;
    const campOf = campOfSoldier(army);
    const soldierIds = new Set(army.soldierIds);
    const stops = MOBS[BALGATH]?.warpath?.destinations ?? [];
    const wreckRadius = MOBS[BALGATH]?.warpath?.wreck.radius ?? 0;

    let ringFor: number | null = null;
    let aliveAtRing = new Set<number>();
    const results: { stop: number; dead: number; innerDead: boolean; sentriesSpared: boolean }[] =
      [];
    let soldierDamage = 0;
    for (let i = 0; i < 20 * 260 && results.length < stops.length; i++) {
      const d = Math.hypot(boss.pos.x - player.pos.x, boss.pos.z - player.pos.z);
      if (d > 6) {
        const a = Math.atan2(boss.pos.x - player.pos.x, boss.pos.z - player.pos.z);
        player.pos.x += Math.sin(a) * 7 * 0.05;
        player.pos.z += Math.cos(a) * 7 * 0.05;
        player.pos.y = terrainHeight(player.pos.x, player.pos.z, sim.cfg.seed);
      }
      for (const ev of sim.tick()) {
        if (ev.type === 'damage' && soldierIds.has(ev.sourceId)) soldierDamage++;
        if (ev.type !== 'spellfxAt' || ev.radius !== wreckRadius) continue;
        if (ev.fx === 'runeCircle') {
          ringFor = boss.warpathDestination ?? 0;
          aliveAtRing = new Set(army.soldierIds.filter((id) => !sim.entities.get(id)?.dead));
        }
        if (ev.fx === 'nova' && ringFor !== null) {
          const campId = MUSTER_CIRCUIT[ringFor];
          const camp = musterCamp(campId);
          const mine = army.soldierIds.filter((id) => campOf.get(id) === campId);
          let dead = 0;
          let innerDead = true;
          let sentriesSpared = true;
          for (const id of mine) {
            const s = sim.entities.get(id) as Entity;
            if (s.dead) dead++;
            const r = Math.hypot(s.spawnPos.x - camp.center.x, s.spawnPos.z - camp.center.z);
            if (r <= MUSTER_INNER_RADIUS && !s.dead) innerDead = false;
            if (r > MUSTER_INNER_RADIUS && aliveAtRing.has(id) && s.dead) sentriesSpared = false;
          }
          results.push({ stop: ringFor, dead, innerDead, sentriesSpared });
          ringFor = null;
        }
      }
      // Never a soldier on the boss's hate table or loot roster, at any tick.
      for (const id of boss.threat.keys()) expect(soldierIds.has(id)).toBe(false);
      for (const id of boss.bossDamagers) expect(soldierIds.has(id)).toBe(false);
    }
    expect(results.map((r) => r.stop)).toEqual([0, 1, 2, 3]);
    for (const r of results) {
      expect(r.innerDead, `the inner ring at ${MUSTER_CIRCUIT[r.stop]}`).toBe(true);
      expect(r.dead, `dead at ${MUSTER_CIRCUIT[r.stop]}`).toBeGreaterThanOrEqual(5);
      expect(r.sentriesSpared, `sentries at ${MUSTER_CIRCUIT[r.stop]}`).toBe(true);
    }
    expect(soldierDamage, 'a soldier dealt damage').toBe(0);
    // His pool is the world-boss base plus nothing: no soldier ever counted as a participant.
    const base = WORLD_BOSSES.find((b) => b.templateId === BALGATH)?.hpScale.base ?? 0;
    expect(boss.maxHp).toBe(base);
    // The command camp was never touched.
    for (const [id, campId] of campOf) {
      if (campId === 'command') expect(sim.entities.get(id)?.dead).toBe(false);
    }
  });

  it('braces while he is engaged and close, faces him, and cheers when his eye goes out', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true, world: testWorld() });
    sim.setPlayerLevel(20);
    inner(sim).setGm(sim.playerId, true);
    place(sim, sim.player, lair().x, lair().z - 18);
    const boss = raise(sim);
    const army = inner(sim).musterArmy;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(boss.inCombat).toBe(true);
    const near = army.soldierIds
      .map((id) => sim.entities.get(id) as Entity)
      .filter(
        (s) =>
          !s.dead &&
          Math.hypot(s.pos.x - boss.pos.x, s.pos.z - boss.pos.z) < MUSTER_BRACE_RANGE - 2,
      );
    expect(near.length).toBeGreaterThan(0);
    for (const s of near) {
      expect(s.aggroTargetId).toBe(boss.id);
      const want = Math.atan2(boss.pos.x - s.pos.x, boss.pos.z - s.pos.z);
      let err = Math.abs(want - s.facing);
      while (err > Math.PI) err = Math.abs(err - 2 * Math.PI);
      // Re-aimed in steps (a head-turn, not a 20 Hz track), never further off than one step.
      expect(err).toBeLessThanOrEqual(MUSTER_FACING_STEP + 1e-9);
      // Braced is not fighting: never in combat, never a hate table.
      expect(s.inCombat).toBe(false);
      expect(s.threat.size).toBe(0);
    }
    blindEyeWard(inner(sim).ctx, boss);
    sim.tick();
    expect(near.some((s) => s.overheadEmoteId === 'cheer')).toBe(true);
  });

  it('stands the fallen back up once the pull ends, and at dawn at the latest', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true, world: testWorld() });
    sim.setPlayerLevel(20);
    inner(sim).setGm(sim.playerId, true);
    place(sim, sim.player, lair().x, lair().z - 18);
    const boss = raise(sim);
    const army = inner(sim).musterArmy;
    const victim = sim.entities.get(army.soldierIds[0]) as Entity;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(army.engaged).toBe(true);
    inner(sim).dealDamage(boss, victim, victim.maxHp * 10, false, 'physical', 'probe', 'hit', true);
    expect(victim.dead).toBe(true);
    // Down for as long as the fight goes on: the ordinary respawn timer never fires.
    for (let i = 0; i < 20 * 30; i++) sim.tick();
    expect(victim.dead).toBe(true);
    // The pull ends (he falls): after the short grace, the muster stands its dead up.
    boss.hp = 1;
    inner(sim).dealDamage(sim.player, boss, 5000, false, 'physical', 'probe', 'hit', true);
    expect(boss.dead).toBe(true);
    for (let i = 0; i < 20 * (MUSTER_RESPAWN_DELAY - 1); i++) sim.tick();
    expect(victim.dead).toBe(true);
    for (let i = 0; i < 20 * 2; i++) sim.tick();
    expect(victim.dead).toBe(false);
    expect(victim.hostile).toBe(false);
    expect(
      Math.hypot(victim.pos.x - victim.spawnPos.x, victim.pos.z - victim.spawnPos.z),
    ).toBeLessThan(0.01);

    // Dawn stands them up outright, pull or no pull.
    inner(sim).dealDamage(boss, victim, victim.maxHp * 10, false, 'physical', 'probe', 'hit', true);
    expect(victim.dead).toBe(true);
    tickMusterArmy(inner(sim).ctx, army, null, true);
    expect(victim.dead).toBe(false);
  });
});
