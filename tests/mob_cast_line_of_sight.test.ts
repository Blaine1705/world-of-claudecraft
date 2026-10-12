// Mob casts and line of sight (src/sim/mob/cast_sight.ts, mob/chase_route.ts,
// mob/trash_kit/kit_cast_sight.ts), in a real claimed HEROIC Hollow Crypt with
// its real caster trash: the Gravecaller Adept's Grave Spark (its petSpell
// bolt), its Grave Bolt (a kit cast bar) and its Gravespark Volley (the
// line-of-sight nova that was already right). Full Sim ticks, seeded.
//
// The walls are the crypt's own: the Ossuary Monument in the Cloister (a 5 yd
// pillar of bone the party hides behind) and the Undercroft Grille's curtain
// wall, whose only way through is its gate.

import { describe, expect, it, vi } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { MOBS } from '../src/sim/data';
import { BELL_YARD, MARROW_ID } from '../src/sim/encounters/hollow_crypt';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { isPinnedInPlace, PIN_PHASE_SECONDS } from '../src/sim/instances/instance_combat_hold';
import { CAST_SIGHT_RETRY_SECONDS, SIGHT_RECHECK_TICKS } from '../src/sim/mob/cast_sight';
import { ROUTE_REPLAN_TICKS } from '../src/sim/mob/chase_route';
import { CHASE_STALL_TIMEOUT } from '../src/sim/mob/reachability';
import { BASTION_KIT_EXTENSION } from '../src/sim/mob/trash_kit/bastion_extension';
import { CRYPT_GRAVE_BOLT, CRYPT_GRAVESPARK_VOLLEY } from '../src/sim/mob/trash_kit/cast_ids';
import { KIT_SIGHT_KEYS, KIT_SIGHT_RETRY } from '../src/sim/mob/trash_kit/kit_cast_sight';
import { TEMPLE_LULLABY_SLEEP } from '../src/sim/mob/trash_kit/temple_cast_ids';
import { TEMPLE_KIT_EXTENSION } from '../src/sim/mob/trash_kit/temple_extension';
import { WILDHEART_KIT_EXTENSION } from '../src/sim/mob/trash_kit/wildheart_extension';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import { DT, type Entity, LEASH_DISTANCE } from '../src/sim/types';
import { boss, cryptFight, type Fight, put, tick } from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 240_000 });

const ADEPT = 'crypt_gravecaller_adept';
const SPARK = 'Grave Spark';
const BOLT = 'Grave Bolt';
const VOLLEY = 'Gravespark Volley';
/** The Ossuary Monument (instance-local): a circle of bone, 5 yd in radius. */
const MONUMENT = { x: 0, z: -30, r: 5 };
/** South of the monument: where the caster stands. */
const CASTER_SPOT = { x: 0, z: -44 };
/** North of it, dead behind it from the caster: out of sight. */
const HIDDEN = { x: 0, z: -18 };
/** North of it and well to one side: in plain sight of the caster. */
const SEEN = { x: 13, z: -23 };

interface Scene {
  f: Fight;
  adept: Entity;
  /** Where the tank is held each tick (instance-local); move it to move them. */
  hold: { x: number; z: number };
  keep: () => void;
}

/** Spawn a claim mob of `templateId` at an instance-local spot, tuned for the claim. */
function spawn(f: Fight, templateId: string, lx: number, lz: number): Entity {
  const template = MOBS[templateId];
  const mob = createMob(
    f.sim.ctx.nextId++,
    mobTemplateForDungeonDifficulty(template, 'hollow_crypt', f.inst.difficulty),
    mobLevelForDungeonDifficulty('hollow_crypt', f.inst.difficulty, template.minLevel),
    f.sim.ctx.groundPos(f.ox + lx, f.oz + lz),
  );
  applyDungeonMobTuning(mob, 'hollow_crypt', f.inst.difficulty);
  mob.dungeonPackId = 'sight';
  f.sim.ctx.addEntity(mob);
  f.inst.mobIds.push(mob.id);
  return mob;
}

/** Set a mob on a player the way a pull does, whatever the dev aggro flags say. */
function engage(mob: Entity, victim: Entity): void {
  mob.aggroTargetId = victim.id;
  mob.inCombat = true;
  mob.aiState = 'chase';
  mob.leashAnchor = { ...mob.pos };
  addThreat(mob, victim.id, 100);
}

/** A heroic crypt with every placed mob dead (every gate open), one Adept and
 *  the tank held on a spot. */
function scene(
  caster: { x: number; z: number },
  tank: { x: number; z: number },
  keep: ReadonlySet<string> = new Set(),
): Scene {
  const f = cryptFight('heroic', 0, keep);
  const hold = { ...tank };
  put(f, f.tank, hold.x, hold.z);
  // One tick so the cleared claim's gates stand open to collision before
  // anything plans a way through them.
  tick(f);
  const adept = spawn(f, ADEPT, caster.x, caster.z);
  adept.maxHp = 1e7;
  adept.hp = 1e7;
  engage(adept, f.tank);
  return { f, adept, hold, keep: () => put(f, f.tank, hold.x, hold.z) };
}

function sees(s: Scene): boolean {
  return s.f.sim.ctx.hasLineOfSight(s.adept, s.f.tank);
}

function local(s: Scene, e: Entity): { x: number; z: number } {
  return { x: e.pos.x - s.f.ox, z: e.pos.z - s.f.oz };
}

/** Hits the tank took from the Adept's `ability` since hit index `from`. */
function hits(s: Scene, ability: string, from = 0): number {
  let n = 0;
  for (let i = from; i < s.f.hits.length; i++) {
    const h = s.f.hits[i];
    if (h.targetId === s.f.tank.id && h.ability === ability) n++;
  }
  return n;
}

/** Projectile and bolt cues the Adept threw since cue index `from`. */
function thrown(s: Scene, from = 0): number {
  let n = 0;
  for (let i = from; i < s.f.cues.length; i++) if (s.f.cues[i].sourceId === s.adept.id) n++;
  return n;
}

/** Is the mob's body inside a collider (a little inside its 0.5 yd radius)? */
function inWall(s: Scene): boolean {
  return isBlocked(s.f.sim.cfg.seed, s.adept.pos.x, s.adept.pos.z, 0.35);
}

function run(s: Scene, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) {
    tick(s.f, s.keep);
    each?.();
  }
}

function until(s: Scene, done: () => boolean, seconds: number, each?: () => void): boolean {
  for (let t = 0; t < seconds; t += DT) {
    if (done()) return true;
    tick(s.f, s.keep);
    each?.();
  }
  return done();
}

describe('the scene: the monument really breaks the line', () => {
  it('hides the far side and shows the flank', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    expect(sees(s)).toBe(false);
    s.hold.x = SEEN.x;
    s.hold.z = SEEN.z;
    s.keep();
    expect(sees(s)).toBe(true);
    expect(Math.hypot(SEEN.x - MONUMENT.x, SEEN.z - MONUMENT.z)).toBeGreaterThan(MONUMENT.r + 3);
  });
});

describe('a caster with a clear line casts exactly as before', () => {
  it('stands on its spot and lands its bolts, asking for sight only when a cast begins or ends', () => {
    const s = scene(CASTER_SPOT, SEEN);
    const start = local(s, s.adept);
    const asked = vi.spyOn(s.f.sim.ctx, 'hasLineOfSight');
    let begun = 0;
    let lastCast: string | null = null;
    let lastWindup: number | null = null;
    let ticks = 0;
    run(s, 24, () => {
      // Count every cast it begins: a kit bar, or a Grave Spark windup.
      if (s.adept.castingAbility !== null && s.adept.castingAbility !== lastCast) begun++;
      lastCast = s.adept.castingAbility;
      const windup = s.adept.rangedWindupReleaseTick ?? null;
      if (windup !== null && windup !== lastWindup) begun++;
      lastWindup = windup;
      ticks++;
      // In range and in sight from the first tick: it takes its stance at once.
      if (ticks > 2) expect(s.adept.aiState).toBe('attack');
    });
    const calls = asked.mock.calls.length;
    asked.mockRestore();
    const end = local(s, s.adept);
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.01);
    expect(hits(s, SPARK)).toBeGreaterThanOrEqual(4);
    expect(hits(s, BOLT)).toBeGreaterThanOrEqual(2);
    expect(hits(s, VOLLEY)).toBeGreaterThanOrEqual(1);
    // No route, no sight record: nothing was ever in its way.
    expect(s.adept.chaseRoute).toBeUndefined();
    // Bounded: at most a start and an end query a cast (the volley asks once
    // a player in its radius when it lands), plus the approach's first look.
    expect(begun).toBeGreaterThan(6);
    expect(calls).toBeLessThanOrEqual(begun * 2 + 2);
    expect(calls).toBeLessThan(24 / DT / 4);
  });

  it('is deterministic: two worlds from one seed fight the same fight', () => {
    const fight = (): string => {
      const s = scene(CASTER_SPOT, SEEN);
      run(s, 12);
      return JSON.stringify([s.f.hits, s.f.cues.length, s.adept.pos, s.f.sim.rng.next()]);
    };
    expect(fight()).toBe(fight());
  });
});

describe('a target that hides while the cast is in flight', () => {
  it('Grave Spark: the windup runs out, nothing leaves its hand, nothing lands, no rng is drawn', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.rangedWindupReleaseTick != null, 6)).toBe(true);
    const release = s.adept.rangedWindupReleaseTick as number;
    expect(release).toBeGreaterThan(s.f.sim.tickCount);
    // The tank steps behind the monument while the windup is in flight.
    s.hold.x = HIDDEN.x;
    s.hold.z = HIDDEN.z;
    s.keep();
    expect(sees(s)).toBe(false);
    const hitsFrom = s.f.hits.length;
    const cuesFrom = s.f.cues.length;
    let draws = 0;
    s.f.sim.rng.setObserver(() => {
      draws++;
    });
    // The windup is not cut short: it is still committed until its own tick.
    while (s.f.sim.tickCount < release - 1) {
      tick(s.f, s.keep);
      expect(s.adept.rangedWindupReleaseTick).toBe(release);
    }
    tick(s.f, s.keep);
    tick(s.f, s.keep);
    s.f.sim.rng.setObserver(null);
    expect(s.adept.rangedWindupReleaseTick ?? null).toBeNull();
    expect(hits(s, SPARK, hitsFrom)).toBe(0);
    expect(thrown(s, cuesFrom)).toBe(0);
    expect(draws).toBe(0);
    // Not charged for the cast it did not get: it may begin again at once.
    expect(s.adept.swingTimer).toBeLessThanOrEqual(CAST_SIGHT_RETRY_SECONDS);
  });

  it('Grave Bolt: the bar runs its whole length, then fails with no bolt and no damage, and is handed back', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.castingAbility === CRYPT_GRAVE_BOLT, 8)).toBe(true);
    expect(s.adept.castTargetId).toBe(s.f.tank.id);
    const total = s.adept.castTotal;
    const begunAt = s.f.sim.tickCount;
    s.hold.x = HIDDEN.x;
    s.hold.z = HIDDEN.z;
    s.keep();
    const hitsFrom = s.f.hits.length;
    const cuesFrom = s.f.cues.length;
    expect(until(s, () => s.adept.castingAbility !== CRYPT_GRAVE_BOLT, total + 1)).toBe(true);
    // Not cut short by the hide: the bar ran out on time.
    const ran = (s.f.sim.tickCount - begunAt) * DT;
    expect(ran).toBeGreaterThan(total - 0.2);
    expect(ran).toBeLessThan(total + 0.2);
    expect(hits(s, BOLT, hitsFrom)).toBe(0);
    expect(thrown(s, cuesFrom)).toBe(0);
    // Handed back: not on its nine second cooldown.
    expect(s.adept.trashKit?.timers.bolt).toBeLessThanOrEqual(KIT_SIGHT_RETRY);
  });

  it('a Grave Bolt whose victim stays in sight still lands', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.castingAbility === CRYPT_GRAVE_BOLT, 8)).toBe(true);
    const hitsFrom = s.f.hits.length;
    expect(until(s, () => s.adept.castingAbility !== CRYPT_GRAVE_BOLT, 4)).toBe(true);
    expect(hits(s, BOLT, hitsFrom)).toBe(1);
  });
});

describe('a caster with no line of sight', () => {
  it('casts nothing, walks round the monument until it sees its target, and casts from there', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    const start = local(s, s.adept);
    let walked = 0;
    let prev = start;
    let sawAt = -1;
    let ticks = 0;
    const asked = vi.spyOn(s.f.sim.ctx, 'hasLineOfSight');
    const found = until(
      s,
      () => s.adept.aiState === 'attack',
      15,
      () => {
        ticks++;
        const at = local(s, s.adept);
        walked += Math.hypot(at.x - prev.x, at.z - prev.z);
        prev = at;
        // Never inside the monument, never through it.
        expect(inWall(s)).toBe(false);
        expect(Math.hypot(at.x - MONUMENT.x, at.z - MONUMENT.z)).toBeGreaterThan(MONUMENT.r);
        // No cast begins without a line of sight.
        if (sawAt < 0 && s.f.sim.ctx.hasLineOfSight(s.adept, s.f.tank)) sawAt = ticks;
        if (sawAt < 0) {
          expect(s.adept.rangedWindupReleaseTick ?? null).toBeNull();
          expect(s.adept.castingAbility).not.toBe(CRYPT_GRAVE_BOLT);
        }
        // It neither stalls nor is held: it is walking.
        expect(isPinnedInPlace(s.adept)).toBe(false);
        expect(s.adept.aiState).not.toBe('evade');
      },
    );
    const calls = asked.mock.calls.length;
    asked.mockRestore();
    expect(found).toBe(true);
    expect(hits(s, SPARK)).toBe(0);
    expect(hits(s, BOLT)).toBe(0);
    expect(walked).toBeGreaterThan(4);
    expect(sees(s)).toBe(true);
    // It stopped at the first sight line, not on top of its target.
    expect(Math.hypot(prev.x - HIDDEN.x, prev.z - HIDDEN.z)).toBeGreaterThan(10);
    // Throttled on the move: about one query every SIGHT_RECHECK_TICKS (the
    // test's own per-tick look aside).
    expect(calls - ticks).toBeLessThanOrEqual(Math.ceil(ticks / SIGHT_RECHECK_TICKS) + 4);
    // And then it casts.
    const from = s.f.hits.length;
    expect(until(s, () => hits(s, SPARK, from) > 0, 3)).toBe(true);
    expect(s.adept.chaseRoute).toBeUndefined();
  });

  it('plans its route at most once a second while its target stands still', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    const plans: number[] = [];
    let last: unknown = null;
    until(
      s,
      () => s.adept.aiState === 'attack',
      15,
      () => {
        const route = s.adept.chaseRoute;
        if (route && route.planAt !== last) {
          plans.push(s.f.sim.tickCount);
          last = route.planAt;
        }
      },
    );
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < plans.length; i++)
      expect(plans[i] - plans[i - 1]).toBeGreaterThanOrEqual(ROUTE_REPLAN_TICKS);
  });

  it('goes through the doorway of a wall, never through the wall', () => {
    // The Undercroft Grille's curtain wall runs along z 21 from x 7 to 46 (and
    // its mirror); with the cloister cleared its gate (x -7 to 7) stands open.
    const s = scene({ x: 18, z: 30 }, { x: 18, z: 12 });
    expect(sees(s)).toBe(false);
    let crossedAtX: number | null = null;
    let prevZ = local(s, s.adept).z;
    const found = until(
      s,
      () => s.adept.aiState === 'attack',
      25,
      () => {
        const at = local(s, s.adept);
        if (crossedAtX === null && prevZ > 21 && at.z <= 21) crossedAtX = at.x;
        prevZ = at.z;
        expect(inWall(s)).toBe(false);
        // Walking, never the immune hold that ends in a walk through the wall.
        expect(isPinnedInPlace(s.adept)).toBe(false);
        expect(s.adept.chaseStall).toBeLessThan(CHASE_STALL_TIMEOUT / 2);
        expect(hits(s, SPARK)).toBe(0);
      },
    );
    expect(found).toBe(true);
    expect(crossedAtX).not.toBeNull();
    expect(Math.abs(crossedAtX as unknown as number)).toBeLessThan(7);
    expect(sees(s)).toBe(true);
    const from = s.f.hits.length;
    expect(until(s, () => hits(s, SPARK, from) > 0, 3)).toBe(true);
  });

  it('follows a target that keeps hiding, and never jitters on the spot', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    // Each time it comes into sight the tank steps round to the far side again.
    let hides = 0;
    let stillTicks = 0;
    let prev = local(s, s.adept);
    run(s, 30, () => {
      const at = local(s, s.adept);
      const moved = Math.hypot(at.x - prev.x, at.z - prev.z);
      prev = at;
      if (s.adept.aiState === 'chase' && moved < 1e-3) stillTicks++;
      expect(inWall(s)).toBe(false);
      expect(isPinnedInPlace(s.adept)).toBe(false);
      expect(s.adept.aiState).not.toBe('evade');
      if (s.adept.aiState === 'attack' && hides < 3) {
        // Mirror the tank through the monument, away from where the caster is.
        const dx = MONUMENT.x - at.x;
        const dz = MONUMENT.z - at.z;
        const d = Math.hypot(dx, dz) || 1;
        s.hold.x = MONUMENT.x + (dx / d) * 12;
        s.hold.z = MONUMENT.z + (dz / d) * 12;
        hides++;
      }
    });
    expect(hides).toBe(3);
    // A chasing tick with no movement is the odd turn, never a habit.
    expect(stillTicks).toBeLessThan(20);
    // Left alone at last, it finds its line and fights.
    expect(s.adept.aiState).toBe('attack');
    expect(sees(s)).toBe(true);
  });
});

describe('the hold and the leash still rule a caster no route reaches', () => {
  it('walled off with no way round, it stalls, holds immune, and only then comes through', () => {
    // A Necromancer of the cloister left alive keeps the Undercroft Grille shut:
    // the curtain wall has no doorway now.
    const s = scene({ x: 18, z: 30 }, { x: 18, z: 12 }, new Set(['crypt_gravecaller_necromancer']));
    // The living packs stay asleep: this test is about the one Adept.
    s.f.tank.devNoAggro = true;
    expect(sees(s)).toBe(false);
    // It does not stand casting through the wall, and nothing sends it home.
    run(s, CHASE_STALL_TIMEOUT + 2, () => {
      expect(s.adept.aiState).not.toBe('evade');
      expect(inWall(s)).toBe(false);
    });
    expect(hits(s, SPARK)).toBe(0);
    expect(hits(s, BOLT)).toBe(0);
    // The instance hold, as for any mob that cannot reach its target.
    expect(isPinnedInPlace(s.adept)).toBe(true);
    expect(local(s, s.adept).z).toBeGreaterThan(21);
    // Once the grace is spent it comes for its target, and fights on sight.
    expect(until(s, () => hits(s, SPARK) > 0, PIN_PHASE_SECONDS + 8)).toBe(true);
    expect(sees(s)).toBe(true);
    expect(isPinnedInPlace(s.adept)).toBe(false);
  });

  it('a wipe still sends it home', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    run(s, 2);
    expect(s.adept.aiState).toBe('chase');
    s.f.sim.ctx.handleDeath(s.f.tank, s.adept);
    for (let i = 0; i < 3; i++) s.f.sim.tick();
    expect(s.adept.aiState).toBe('evade');
    for (let i = 0; i < 20 / DT && s.adept.aiState !== 'idle'; i++) s.f.sim.tick();
    expect(s.adept.aiState).toBe('idle');
    // Home, and the route it was walking is forgotten with the pull.
    expect(s.adept.chaseRoute).toBeUndefined();
    const home = local(s, s.adept);
    expect(Math.hypot(home.x - CASTER_SPOT.x, home.z - CASTER_SPOT.z)).toBeLessThan(1);
  });
});

// The same rule in the open world, on a world caster (Corrupted Priest Malric's
// Mindfracture, an instant petSpell) with one of the world's own props between
// him and his target: on this seed something solid stands on the x axis 5 yd
// east of the origin.
describe('in the open world', () => {
  const WORLD_SEED_WITH_PROP = 7788;

  function field(dist: number): { sim: Sim; player: Entity; caster: Entity } {
    const sim = new Sim({ seed: WORLD_SEED_WITH_PROP, playerClass: 'warrior' });
    const player = sim.player;
    player.pos = sim.ctx.groundPos(0, 0);
    player.prevPos = { ...player.pos };
    player.maxHp = 1e7;
    player.hp = 1e7;
    sim.ctx.rebucket(player);
    const template = MOBS.corrupted_priest_malric;
    const caster = createMob(sim.ctx.nextId++, template, 5, sim.ctx.groundPos(dist, 0));
    caster.hostile = true;
    caster.maxHp = 1e7;
    caster.hp = 1e7;
    sim.ctx.addEntity(caster);
    engage(caster, player);
    return { sim, player, caster };
  }

  it('walks round a world prop to its sight line and casts, with no evade and no stall', () => {
    const { sim, player, caster } = field(20);
    expect(sim.ctx.hasLineOfSight(caster, player)).toBe(false);
    let landed = 0;
    let landedUnseen = 0;
    let worstStall = 0;
    for (let i = 0; i < 12 / DT && landed === 0; i++) {
      const seen = sim.ctx.hasLineOfSight(caster, player);
      player.hp = player.maxHp;
      for (const ev of sim.tick()) {
        if (ev.type !== 'damage' || ev.sourceId !== caster.id || ev.targetId !== player.id)
          continue;
        landed++;
        if (!seen && !sim.ctx.hasLineOfSight(caster, player)) landedUnseen++;
      }
      worstStall = Math.max(worstStall, caster.chaseStall);
      expect(caster.aiState).not.toBe('evade');
      expect(isBlocked(WORLD_SEED_WITH_PROP, caster.pos.x, caster.pos.z, 0.35)).toBe(false);
    }
    expect(landed).toBeGreaterThan(0);
    expect(landedUnseen).toBe(0);
    expect(sim.ctx.hasLineOfSight(caster, player)).toBe(true);
    expect(worstStall).toBeLessThan(CHASE_STALL_TIMEOUT / 2);
    expect(caster.aggroTargetId).toBe(player.id);
  });

  it('the leash still sends a caster home while it is looking for its line', () => {
    const { sim, caster } = field(20);
    // Dragged far past its leash: the first engaged tick ends the pull.
    caster.spawnPos = { x: caster.pos.x + LEASH_DISTANCE + 10, y: caster.pos.y, z: caster.pos.z };
    caster.leashAnchor = null;
    sim.tick();
    expect(caster.aiState).toBe('evade');
    expect(caster.aggroTargetId).toBeNull();
    expect(caster.chaseRoute).toBeUndefined();
  });
});

describe('what the rule leaves alone', () => {
  it('the Gravespark Volley still begins with nobody in sight and strikes only who can see it', () => {
    // Hidden from the start, and held there: the volley is an area, never a
    // cast at one player, so the bar begins all the same and shields the hidden.
    const s = scene(CASTER_SPOT, HIDDEN);
    // Pin the caster so the only thing under test is the volley's own rule.
    const spot = { ...CASTER_SPOT };
    let began = false;
    run(s, 12, () => {
      put(s.f, s.adept, spot.x, spot.z);
      if (s.adept.castingAbility === CRYPT_GRAVESPARK_VOLLEY) began = true;
    });
    expect(began).toBe(true);
    expect(hits(s, VOLLEY)).toBe(0);
  });

  it('lists the driver casts that are bound by sight', () => {
    expect([...KIT_SIGHT_KEYS].sort()).toEqual(['bolt', 'column', 'eye', 'lullaby']);
    // The dungeons' own blocks name theirs (kit_extension.ts sightKeys).
    expect(TEMPLE_KIT_EXTENSION.sightKeys).toEqual(['spark']);
    expect(WILDHEART_KIT_EXTENSION.sightKeys).toEqual(['hex', 'mark']);
    expect(BASTION_KIT_EXTENSION.sightKeys).toBeUndefined();
  });

  it("a boss mechanic keeps its own rule: Sexton Marrow's Burial Toll strikes the unseen", () => {
    const f = cryptFight('normal', 1, new Set([MARROW_ID]));
    const marrow = boss(f, MARROW_ID);
    marrow.maxHp = 1e6;
    marrow.hp = marrow.maxHp;
    put(f, marrow, BELL_YARD.x, BELL_YARD.z);
    put(f, f.tank, BELL_YARD.x, BELL_YARD.z - 2.5);
    // The other player hides a whole wing away, behind the Ossuary Monument.
    const far = f.others[0];
    const keep = (): void => {
      put(f, f.tank, BELL_YARD.x, BELL_YARD.z - 2.5);
      put(f, far, HIDDEN.x, HIDDEN.z);
    };
    keep();
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    tick(f, keep);
    expect(f.sim.ctx.hasLineOfSight(marrow, far)).toBe(false);
    marrow.hp = Math.floor(marrow.maxHp * 0.65);
    const st = (): { tolls: number; toll: unknown } | null =>
      marrow.cryptBossFight?.kind === 'marrow' ? marrow.cryptBossFight : null;
    let rung = false;
    for (let t = 0; t < 12 && !rung; t += DT) {
      tick(f, keep);
      const fight = st();
      rung = !!fight && fight.tolls === 1 && fight.toll === null;
    }
    expect(rung).toBe(true);
    const toll = f.hits.filter((h) => h.targetId === far.id && h.ability === 'Burial Toll');
    expect(toll).toHaveLength(1);
    expect(toll[0].amount).toBeGreaterThan(0);
  });
});

describe('every driver cast at one player rides the same gate', () => {
  it('a lent Lullaby does not begin unseen, fails when its victim hides, and lands in sight', () => {
    const lullaby = MOBS.pale_choir_acolyte.trashKit?.lullaby;
    if (!lullaby) throw new Error('no Lullaby in content');
    const s = scene(CASTER_SPOT, HIDDEN);
    // The Adept borrows the Temple acolyte's Lullaby in place of its own kit
    // (Entity.devTrashKit), and is held on its spot: only the bar is under test.
    s.adept.devTrashKit = { lullaby };
    const pin = (): void => put(s.f, s.adept, CASTER_SPOT.x, CASTER_SPOT.z);
    const asleep = (): boolean => s.f.tank.auras.some((a) => a.id === TEMPLE_LULLABY_SLEEP);
    const casting = (): boolean => s.adept.castingAbility === lullaby.castId;
    run(s, lullaby.first + 4, () => {
      pin();
      expect(casting()).toBe(false);
    });
    expect(s.adept.trashKit?.timers.lullaby).toBeLessThanOrEqual(KIT_SIGHT_RETRY);
    // In sight, the bar begins at once; the victim hides while it runs.
    s.hold.x = SEEN.x;
    s.hold.z = SEEN.z;
    expect(until(s, casting, 2, pin)).toBe(true);
    s.hold.x = HIDDEN.x;
    s.hold.z = HIDDEN.z;
    expect(until(s, () => !casting(), lullaby.castTime + 1, pin)).toBe(true);
    expect(asleep()).toBe(false);
    expect(s.adept.trashKit?.timers.lullaby).toBeLessThanOrEqual(KIT_SIGHT_RETRY);
    // In sight for the whole bar, it lands.
    s.hold.x = SEEN.x;
    s.hold.z = SEEN.z;
    expect(until(s, casting, 2, pin)).toBe(true);
    expect(until(s, asleep, lullaby.castTime + 1, pin)).toBe(true);
  });
});
