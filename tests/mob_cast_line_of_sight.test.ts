// Mob casts and line of sight (src/sim/mob/cast_sight.ts, mob/chase_route.ts,
// mob/trash_kit/kit_cast_sight.ts), in a real claimed HEROIC Hollow Crypt with
// its real caster trash: the Gravecaller Adept's Grave Spark (its petSpell
// bolt), its Grave Bolt (a kit cast bar) and its Gravespark Volley (the
// line-of-sight nova that was already right). Full Sim ticks, seeded.
//
// The walls are the crypt's own: the Ossuary Monument in the Cloister (a 5 yd
// pillar of bone the party hides behind) and the Undercroft Grille's curtain
// wall, whose only way through is its gate.
//
// Every cost claim is read off the sim's own per-tick tallies
// (Sim.mobScanCounters: sight queries, route searches, cells judged), which
// are the same on every machine; nothing here asserts wall time.

import { describe, expect, it, vi } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { DELVES, isDelvePos, MOBS } from '../src/sim/data';
import { BELL_YARD, MARROW_ID } from '../src/sim/encounters/hollow_crypt';
import { createMob } from '../src/sim/entity';
import {
  applyDungeonMobTuning,
  mobLevelForDungeonDifficulty,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { isPinnedInPlace, PIN_PHASE_SECONDS } from '../src/sim/instances/instance_combat_hold';
import {
  CAST_SIGHT_RETRY_SECONDS,
  casterObeysSight,
  lastSightBlocked,
  SIGHT_RECHECK_TICKS,
} from '../src/sim/mob/cast_sight';
import {
  ROUTE_MAX_TRIES,
  ROUTE_NODES_PER_TICK,
  ROUTE_TRY_FORGIVE_TICKS,
} from '../src/sim/mob/chase_route';
import { mobCombatProfile } from '../src/sim/mob/combat_profile';
import { CHASE_STALL_TIMEOUT } from '../src/sim/mob/reachability';
import { BASTION_KIT_EXTENSION } from '../src/sim/mob/trash_kit/bastion_extension';
import { CRYPT_GRAVE_BOLT, CRYPT_GRAVESPARK_VOLLEY } from '../src/sim/mob/trash_kit/cast_ids';
import {
  KIT_SIGHT_KEYS,
  KIT_SIGHT_RETRY,
  kitSightRetry,
} from '../src/sim/mob/trash_kit/kit_cast_sight';
import { TEMPLE_LULLABY_SLEEP } from '../src/sim/mob/trash_kit/temple_cast_ids';
import { TEMPLE_KIT_EXTENSION } from '../src/sim/mob/trash_kit/temple_extension';
import { WILDHEART_KIT_EXTENSION } from '../src/sim/mob/trash_kit/wildheart_extension';
import { Sim } from '../src/sim/sim';
import { addThreat } from '../src/sim/threat';
import { DT, type Entity, LEASH_DISTANCE } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
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
  /** Tallies summed over every tick the scene ran (Sim.mobScanCounters). */
  sight: number;
  plans: number;
  maxNodes: number;
  maxPlans: number;
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
  extra = 0,
): Scene {
  // Morthen is left entombed (inert, far up the crag): with him dead the
  // fixture would raise his Knellwyrm, a second engaged mob, into every scene.
  const f = cryptFight('heroic', extra, new Set([...keep, 'morthen']));
  const hold = { ...tank };
  put(f, f.tank, hold.x, hold.z);
  // One tick so the cleared claim's gates stand open to collision before
  // anything plans a way through them.
  tick(f);
  const adept = spawn(f, ADEPT, caster.x, caster.z);
  adept.maxHp = 1e7;
  adept.hp = 1e7;
  engage(adept, f.tank);
  return {
    f,
    adept,
    hold,
    keep: () => put(f, f.tank, hold.x, hold.z),
    sight: 0,
    plans: 0,
    maxNodes: 0,
    maxPlans: 0,
  };
}

function sees(s: Scene): boolean {
  return s.f.sim.ctx.hasLineOfSight(s.adept, s.f.tank);
}

/** In sight of its target and standing to cast: where a caster wants to be. */
function settled(s: Scene): boolean {
  return s.adept.aiState === 'attack' && sees(s);
}

function local(s: Scene, e: Entity): { x: number; z: number } {
  return { x: e.pos.x - s.f.ox, z: e.pos.z - s.f.oz };
}

function move(s: Scene, to: { x: number; z: number }): void {
  s.hold.x = to.x;
  s.hold.z = to.z;
  s.keep();
}

/** Hits `who` (the tank by default) took from the Adept's `ability` since hit
 *  index `from`. */
function hits(s: Scene, ability: string, from = 0, who: Entity = s.f.tank): number {
  let n = 0;
  for (let i = from; i < s.f.hits.length; i++) {
    const h = s.f.hits[i];
    if (h.targetId === who.id && h.ability === ability) n++;
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

function step(s: Scene, each?: () => void): void {
  tick(s.f, s.keep);
  const c = s.f.sim.mobScanCounters;
  s.sight += c.sightQueries;
  s.plans += c.routePlans;
  s.maxNodes = Math.max(s.maxNodes, c.routeNodes);
  s.maxPlans = Math.max(s.maxPlans, c.routePlans);
  each?.();
}

function run(s: Scene, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) step(s, each);
}

function until(s: Scene, done: () => boolean, seconds: number, each?: () => void): boolean {
  for (let t = 0; t < seconds; t += DT) {
    if (done()) return true;
    step(s, each);
  }
  return done();
}

describe('the scene: the monument really breaks the line', () => {
  it('hides the far side and shows the flank', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    expect(sees(s)).toBe(false);
    move(s, SEEN);
    expect(sees(s)).toBe(true);
    expect(Math.hypot(SEEN.x - MONUMENT.x, SEEN.z - MONUMENT.z)).toBeGreaterThan(MONUMENT.r + 3);
  });
});

describe('a caster with a clear line casts exactly as before', () => {
  it('stands on its spot and lands its bolts, asking for sight only when a cast begins or ends', () => {
    const s = scene(CASTER_SPOT, SEEN);
    const start = local(s, s.adept);
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
    const end = local(s, s.adept);
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.01);
    expect(hits(s, SPARK)).toBeGreaterThanOrEqual(4);
    expect(hits(s, BOLT)).toBeGreaterThanOrEqual(2);
    expect(hits(s, VOLLEY)).toBeGreaterThanOrEqual(1);
    // No route, no sight record, no search: nothing was ever in its way.
    expect(s.adept.chaseRoute).toBeUndefined();
    expect(s.plans).toBe(0);
    expect(s.maxNodes).toBe(0);
    // Bounded: at most a start and an end query a cast, plus the approach's
    // first look. Nothing like one a tick.
    expect(begun).toBeGreaterThan(6);
    expect(s.sight).toBeGreaterThan(0);
    expect(s.sight).toBeLessThanOrEqual(begun * 2 + 2);
    expect(s.sight).toBeLessThan(ticks / 4);
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
    move(s, HIDDEN);
    expect(sees(s)).toBe(false);
    const hitsFrom = s.f.hits.length;
    const cuesFrom = s.f.cues.length;
    let draws = 0;
    s.f.sim.rng.setObserver(() => {
      draws++;
    });
    // The windup is not cut short: it is still committed until its own tick.
    while (s.f.sim.tickCount < release - 1) {
      step(s);
      expect(s.adept.rangedWindupReleaseTick).toBe(release);
    }
    step(s);
    step(s);
    s.f.sim.rng.setObserver(null);
    expect(s.adept.rangedWindupReleaseTick ?? null).toBeNull();
    expect(hits(s, SPARK, hitsFrom)).toBe(0);
    expect(thrown(s, cuesFrom)).toBe(0);
    expect(draws).toBe(0);
    // Not charged for the cast it did not get: it may begin again at once.
    expect(s.adept.swingTimer).toBeLessThanOrEqual(CAST_SIGHT_RETRY_SECONDS);
  });

  it('Grave Spark: hidden for part of the windup and back before it ends, it lands', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.rangedWindupReleaseTick != null, 6)).toBe(true);
    const release = s.adept.rangedWindupReleaseTick as number;
    const hitsFrom = s.f.hits.length;
    move(s, HIDDEN);
    while (s.f.sim.tickCount < release - 3) step(s);
    // Sight is asked for at the end, never in between.
    move(s, SEEN);
    while (s.f.sim.tickCount <= release + 1) step(s);
    expect(hits(s, SPARK, hitsFrom)).toBe(1);
  });

  it('Grave Bolt: the bar runs its whole length, then fails with no bolt and no damage, and is handed back', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.castingAbility === CRYPT_GRAVE_BOLT, 8)).toBe(true);
    expect(s.adept.castTargetId).toBe(s.f.tank.id);
    const total = s.adept.castTotal;
    const begunAt = s.f.sim.tickCount;
    move(s, HIDDEN);
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

  it('Grave Bolt: hidden for part of the bar and back before it ends, it lands', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.castingAbility === CRYPT_GRAVE_BOLT, 8)).toBe(true);
    const hitsFrom = s.f.hits.length;
    move(s, HIDDEN);
    run(s, 1.2);
    expect(s.adept.castingAbility).toBe(CRYPT_GRAVE_BOLT);
    move(s, SEEN);
    expect(until(s, () => s.adept.castingAbility !== CRYPT_GRAVE_BOLT, 4)).toBe(true);
    expect(hits(s, BOLT, hitsFrom)).toBe(1);
  });

  it('a Grave Bolt whose victim stays in sight still lands', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.castingAbility === CRYPT_GRAVE_BOLT, 8)).toBe(true);
    const hitsFrom = s.f.hits.length;
    expect(until(s, () => s.adept.castingAbility !== CRYPT_GRAVE_BOLT, 4)).toBe(true);
    expect(hits(s, BOLT, hitsFrom)).toBe(1);
  });

  it('a fizzled windup leaves no stale "blocked": back in sight beside a wall, it never stalls', () => {
    // The caster hugs the monument's flank: its sight line to the tank clears
    // the bone by a third of a yard, but its own body, half a yard wide, could
    // not take one straight step toward them. Exactly where a caster that has
    // just walked round a corner stands.
    const flank = { x: 5.3, z: -31.6 };
    const ahead = { x: 5.3, z: -12 };
    const s = scene(flank, ahead);
    expect(sees(s)).toBe(true);
    expect(until(s, () => s.adept.rangedWindupReleaseTick != null, 6)).toBe(true);
    const release = s.adept.rangedWindupReleaseTick as number;
    const spot = local(s, s.adept);
    // One windup fizzles on a tank that ducks behind the bone...
    move(s, { x: -6.5, z: -27 });
    expect(sees(s)).toBe(false);
    while (s.f.sim.tickCount <= release) step(s);
    expect(s.adept.rangedWindupReleaseTick ?? null).toBeNull();
    expect(lastSightBlocked(s.adept, s.f.tank)).toBe(true);
    // ...and steps straight back out, inside the retry.
    move(s, ahead);
    const hitsFrom = s.f.hits.length;
    let worstStall = 0;
    run(s, 6, () => {
      worstStall = Math.max(worstStall, s.adept.chaseStall);
      expect(s.adept.aiState).not.toBe('evade');
      expect(isPinnedInPlace(s.adept)).toBe(false);
    });
    // The clear answer at its next cast start was written down.
    expect(lastSightBlocked(s.adept, s.f.tank)).toBe(false);
    expect(worstStall).toBe(0);
    expect(hits(s, SPARK, hitsFrom)).toBeGreaterThanOrEqual(1);
    const end = local(s, s.adept);
    expect(Math.hypot(end.x - spot.x, end.z - spot.z)).toBeLessThan(0.01);
  });

  it('stunned across the end of its windup, it judges the cast when it wakes: a hidden target takes nothing', () => {
    const s = scene(CASTER_SPOT, SEEN);
    expect(until(s, () => s.adept.rangedWindupReleaseTick != null, 6)).toBe(true);
    const release = s.adept.rangedWindupReleaseTick as number;
    s.f.sim.ctx.applyAura(s.adept, {
      id: 'test_stun',
      name: 'Test Stun',
      kind: 'stun',
      remaining: 1.5,
      duration: 1.5,
      value: 0,
      sourceId: s.f.tank.id,
      school: 'physical',
    });
    move(s, HIDDEN);
    const hitsFrom = s.f.hits.length;
    const cuesFrom = s.f.cues.length;
    while (s.f.sim.tickCount < release + 5) step(s);
    // Still stunned past its release tick: the windup waits, as it always did.
    expect(s.adept.rangedWindupReleaseTick).toBe(release);
    run(s, 2);
    expect(s.adept.rangedWindupReleaseTick ?? null).toBeNull();
    expect(hits(s, SPARK, hitsFrom)).toBe(0);
    expect(thrown(s, cuesFrom)).toBe(0);
  });

  it('rooted with its target out of sight, it casts nothing and does not count toward an evade', () => {
    const s = scene(CASTER_SPOT, SEEN);
    run(s, 1);
    s.f.sim.ctx.applyAura(s.adept, {
      id: 'test_root',
      name: 'Test Root',
      kind: 'root',
      remaining: 8,
      duration: 8,
      value: 0,
      sourceId: s.f.tank.id,
      school: 'nature',
    });
    move(s, HIDDEN);
    const spot = local(s, s.adept);
    // Let whatever was already in flight end, then watch the rooted seven seconds.
    run(s, 1);
    const hitsFrom = s.f.hits.length;
    run(s, 6.5, () => {
      expect(s.adept.aiState).not.toBe('evade');
      expect(isPinnedInPlace(s.adept)).toBe(false);
    });
    expect(hits(s, SPARK, hitsFrom)).toBe(0);
    expect(hits(s, BOLT, hitsFrom)).toBe(0);
    const held = local(s, s.adept);
    expect(Math.hypot(held.x - spot.x, held.z - spot.z)).toBeLessThan(0.01);
    // A root holds the stall clock (reachability.ts): it has not grown.
    expect(s.adept.chaseStall).toBe(0);
    // The root off, it walks to its sight line and casts.
    expect(until(s, () => settled(s), 12)).toBe(true);
    const from = s.f.hits.length;
    expect(until(s, () => hits(s, SPARK, from) > 0, 3)).toBe(true);
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
    const found = until(
      s,
      () => settled(s),
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
        if (sawAt < 0 && sees(s)) sawAt = ticks;
        if (sawAt < 0) {
          expect(s.adept.rangedWindupReleaseTick ?? null).toBeNull();
          expect(s.adept.castingAbility).not.toBe(CRYPT_GRAVE_BOLT);
        }
        // It neither stalls nor is held: it is walking.
        expect(isPinnedInPlace(s.adept)).toBe(false);
        expect(s.adept.aiState).not.toBe('evade');
      },
    );
    expect(found).toBe(true);
    expect(hits(s, SPARK)).toBe(0);
    expect(hits(s, BOLT)).toBe(0);
    expect(walked).toBeGreaterThan(4);
    // It stopped at the first sight line, not on top of its target.
    expect(Math.hypot(prev.x - HIDDEN.x, prev.z - HIDDEN.z)).toBeGreaterThan(10);
    // Throttled on the move: about one query every SIGHT_RECHECK_TICKS, plus
    // the casts it tried to begin on the way.
    expect(s.sight).toBeLessThanOrEqual(Math.ceil(ticks / SIGHT_RECHECK_TICKS) + 6);
    // One search found its way, inside the tick's budget.
    expect(s.plans).toBe(1);
    expect(s.maxNodes).toBeGreaterThan(0);
    expect(s.maxNodes).toBeLessThanOrEqual(ROUTE_NODES_PER_TICK);
    // And then it casts.
    const from = s.f.hits.length;
    expect(until(s, () => hits(s, SPARK, from) > 0, 3)).toBe(true);
    // The path is done with; the record and its spent plan are kept.
    expect(s.adept.chaseRoute?.path).toEqual([]);
    expect(s.adept.chaseRoute?.tries).toBe(1);
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
      () => settled(s),
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
    const from = s.f.hits.length;
    expect(until(s, () => hits(s, SPARK, from) > 0, 3)).toBe(true);
  });

  it('a target dancing in and out of sight buys no fresh plans: the throttle outlives the path', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    const seconds = 40;
    let hops = 0;
    let wasSettled = false;
    run(s, seconds, () => {
      expect(inWall(s)).toBe(false);
      expect(s.adept.aiState).not.toBe('evade');
      // Each time it settles on a sight line the tank steps to the far side of
      // the monument from wherever the caster now stands.
      const now = settled(s);
      if (now && !wasSettled) {
        const at = local(s, s.adept);
        const dx = MONUMENT.x - at.x;
        const dz = MONUMENT.z - at.z;
        const d = Math.hypot(dx, dz) || 1;
        move(s, { x: MONUMENT.x + (dx / d) * 12, z: MONUMENT.z + (dz / d) * 12 });
        hops++;
      }
      wasSettled = now;
    });
    expect(hops).toBeGreaterThanOrEqual(3);
    // The burst it is allowed, and one more for every forgiveness period.
    const allowed = ROUTE_MAX_TRIES + Math.floor(seconds / DT / ROUTE_TRY_FORGIVE_TICKS);
    expect(s.plans).toBeGreaterThanOrEqual(2);
    expect(s.plans).toBeLessThanOrEqual(allowed);
    // Never two searches of one mob inside its re-plan period.
    expect(s.maxPlans).toBe(1);
    expect(s.maxNodes).toBeLessThanOrEqual(ROUTE_NODES_PER_TICK);
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
    // It does not stand casting through the wall, and nothing sends it home:
    // it closes on the wall, finds no way, and the instance hold takes it.
    expect(
      until(
        s,
        () => isPinnedInPlace(s.adept),
        CHASE_STALL_TIMEOUT + 8,
        () => {
          expect(s.adept.aiState).not.toBe('evade');
          expect(inWall(s)).toBe(false);
        },
      ),
    ).toBe(true);
    expect(hits(s, SPARK)).toBe(0);
    expect(hits(s, BOLT)).toBe(0);
    expect(local(s, s.adept).z).toBeGreaterThan(21);
    // The search that failed was bounded, and was not asked again and again.
    expect(s.plans).toBeGreaterThanOrEqual(1);
    expect(s.plans).toBeLessThanOrEqual(3);
    expect(s.maxNodes).toBeLessThanOrEqual(ROUTE_NODES_PER_TICK);
    // Held, it carries no path: once through, no old waypoint calls it back.
    expect(s.adept.chaseRoute?.path ?? []).toEqual([]);
    // Once the grace is spent it comes for its target, and fights on sight.
    expect(until(s, () => hits(s, SPARK) > 0, PIN_PHASE_SECONDS + 8)).toBe(true);
    expect(sees(s)).toBe(true);
    expect(isPinnedInPlace(s.adept)).toBe(false);
    // It stays and fights where it came through: no walk back to a waypoint.
    const at = local(s, s.adept);
    run(s, 3);
    const later = local(s, s.adept);
    expect(Math.hypot(later.x - at.x, later.z - at.z)).toBeLessThan(0.5);
  });

  it('a wipe still sends it home', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    expect(until(s, () => (s.adept.chaseRoute?.path.length ?? 0) > 1, 4)).toBe(true);
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

  it('a dead caster keeps no route', () => {
    const s = scene(CASTER_SPOT, HIDDEN);
    expect(until(s, () => (s.adept.chaseRoute?.path.length ?? 0) > 1, 4)).toBe(true);
    s.f.sim.ctx.handleDeath(s.adept, s.f.tank);
    expect(s.adept.chaseRoute).toBeUndefined();
  });
});

// The same sight rule in the open world, on a world caster (Corrupted Priest
// Malric's Mindfracture, an instant petSpell) with one of the world's own
// props between him and his target: on this seed something solid stands on the
// x axis 5 yd east of the origin. Out here no route is planned (chase_route.ts
// keeps routes to instances): he closes straight, the slide fan rounds the
// prop, and the leash and the stall are what they always were.
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

  it('closes round a world prop to its sight line and casts, with no search, no evade and no stall', () => {
    const { sim, player, caster } = field(20);
    expect(sim.ctx.hasLineOfSight(caster, player)).toBe(false);
    const spell = MOBS.corrupted_priest_malric.petSpell?.name;
    let landed = 0;
    let landedUnseen = 0;
    let worstStall = 0;
    let plans = 0;
    for (let i = 0; i < 12 / DT && landed === 0; i++) {
      player.hp = player.maxHp;
      const events = sim.tick();
      plans += sim.mobScanCounters.routePlans;
      // Judged on the tick it fired: caster and target as the cast left them.
      // (His melee swing, should he close that far, is not a cast and asks for
      // no line of sight, as before.)
      const seen = sim.ctx.hasLineOfSight(caster, player);
      for (const ev of events) {
        if (ev.type !== 'damage' || ev.sourceId !== caster.id || ev.targetId !== player.id)
          continue;
        if (ev.ability !== spell) continue;
        landed++;
        if (!seen) landedUnseen++;
      }
      worstStall = Math.max(worstStall, caster.chaseStall);
      expect(caster.aiState).not.toBe('evade');
      expect(isBlocked(WORLD_SEED_WITH_PROP, caster.pos.x, caster.pos.z, 0.35)).toBe(false);
    }
    expect(landed).toBeGreaterThan(0);
    expect(landedUnseen).toBe(0);
    expect(plans).toBe(0);
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

// A delve's rooms are clamps and doors the mover applies and no collider
// search can see, so no route is planned there (chase_route.ts); the sight rule
// itself holds everywhere.
describe('in a delve', () => {
  it('a delve caster obeys the sight rule and plans no route', () => {
    const sim = new Sim({ seed: 31, playerClass: 'warrior', autoEquip: true });
    const def = DELVES.collapsed_reliquary;
    sim.setPlayerLevel(def.minLevel);
    const player = sim.player;
    player.pos = {
      x: def.doorPos.x,
      y: terrainHeight(def.doorPos.x, def.doorPos.z, sim.cfg.seed),
      z: def.doorPos.z,
    };
    player.prevPos = { ...player.pos };
    sim.ctx.rebucket(player);
    sim.enterDelve('collapsed_reliquary', 'normal');
    const run = sim.delveRunForPlayer(player.id);
    if (!run) throw new Error('no delve run');
    expect(isDelvePos(player.pos.x)).toBe(true);
    player.maxHp = 1e7;
    player.hp = 1e7;
    // A delve caster a few yards from the player, in the same room.
    const template = MOBS.reedbound_acolyte;
    const caster = createMob(sim.ctx.nextId++, template, template.minLevel, {
      x: player.pos.x + 6,
      y: player.pos.y,
      z: player.pos.z,
    });
    caster.hostile = true;
    caster.maxHp = 1e7;
    caster.hp = 1e7;
    sim.ctx.addEntity(caster);
    run.mobIds.push(caster.id);
    engage(caster, player);
    expect(casterObeysSight(caster, mobCombatProfile(caster))).toBe(true);
    let plans = 0;
    let sight = 0;
    let landed = 0;
    let landedUnseen = 0;
    for (let i = 0; i < 10 / DT; i++) {
      player.hp = player.maxHp;
      const events = sim.tick();
      plans += sim.mobScanCounters.routePlans;
      sight += sim.mobScanCounters.sightQueries;
      const seen = sim.ctx.hasLineOfSight(caster, player);
      for (const ev of events) {
        if (ev.type !== 'damage' || ev.sourceId !== caster.id || ev.targetId !== player.id)
          continue;
        if (ev.ability !== template.petSpell?.name) continue;
        landed++;
        if (!seen) landedUnseen++;
      }
    }
    // It asked for sight (the rule is on) and searched for nothing (no routes).
    expect(sight).toBeGreaterThan(0);
    expect(plans).toBe(0);
    expect(caster.chaseRoute?.path ?? []).toEqual([]);
    expect(landedUnseen).toBe(0);
    expect(landed).toBeGreaterThan(0);
  });
});

describe('who obeys the rule', () => {
  it('a leashing, unowned, non-boss petSpell caster does; a boss, an unleashed script and a pet do not', () => {
    const s = scene(CASTER_SPOT, SEEN);
    const profile = mobCombatProfile(s.adept);
    expect(profile.canLeash).toBe(true);
    expect(casterObeysSight(s.adept, profile)).toBe(true);
    // An encounter script that opted out of the leash has no stall or evade to
    // fall back on: it keeps the old loop rather than stand silent for ever.
    expect(casterObeysSight(s.adept, { ...profile, canLeash: false })).toBe(false);
    // A player's pet never comes through the mob caster loop at all.
    const pet = { ...s.adept, ownerId: s.f.tank.id } as Entity;
    expect(casterObeysSight(pet, profile)).toBe(false);
    // A boss template: none carries a petSpell today, and one that did would
    // keep its own rules.
    const bossId = Object.keys(MOBS).find((id) => MOBS[id].boss === true);
    if (!bossId) throw new Error('no boss template in content');
    const asBoss = { ...s.adept, templateId: bossId } as Entity;
    expect(casterObeysSight(asBoss, profile)).toBe(false);
  });

  it('no boss and no unleashed template carries a petSpell today', () => {
    const casters = Object.keys(MOBS).filter((id) => MOBS[id].petSpell !== undefined);
    expect(casters.length).toBeGreaterThan(10);
    for (const id of casters) {
      expect(MOBS[id].boss, id).not.toBe(true);
      const probe = createMob(1, MOBS[id], MOBS[id].minLevel, { x: 0, y: 0, z: 0 });
      expect(mobCombatProfile(probe).canLeash, id).toBe(true);
    }
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
    // Waiting on its retry (and its caster's slot of it), never on a cooldown.
    expect(s.adept.trashKit?.timers.lullaby).toBeLessThanOrEqual(kitSightRetry(s.adept));
    expect(kitSightRetry(s.adept)).toBeGreaterThanOrEqual(KIT_SIGHT_RETRY);
    expect(kitSightRetry(s.adept)).toBeLessThan(KIT_SIGHT_RETRY + 0.5);
    // In sight, the bar begins at once; the victim hides while it runs.
    move(s, SEEN);
    expect(until(s, casting, 2, pin)).toBe(true);
    move(s, HIDDEN);
    expect(until(s, () => !casting(), lullaby.castTime + 1, pin)).toBe(true);
    expect(asleep()).toBe(false);
    expect(s.adept.trashKit?.timers.lullaby).toBeLessThanOrEqual(KIT_SIGHT_RETRY);
    // In sight for the whole bar, it lands.
    move(s, SEEN);
    expect(until(s, casting, 2, pin)).toBe(true);
    expect(until(s, asleep, lullaby.castTime + 1, pin)).toBe(true);
  });

  // The Grave Bolt's victim is a hashed pick between the two players, so with
  // one of them hidden the first pick lands on the hidden one for some casts
  // and is drawn again. Run it both ways round: whichever player the hash
  // favours for a cast, one of the two runs has that player hidden.
  it.each([
    ['the tank', true],
    ['the other player', false],
  ] as const)(
    'with %s hidden and one player in sight, every Grave Bolt is thrown at the one it can see',
    (_who, tankHidden) => {
      const s = scene(CASTER_SPOT, tankHidden ? HIDDEN : SEEN, new Set(), 1);
      const other = s.f.others[0];
      const seen = tankHidden ? other : s.f.tank;
      const hidden = tankHidden ? s.f.tank : other;
      const pin = (): void => {
        put(s.f, s.adept, CASTER_SPOT.x, CASTER_SPOT.z);
        put(s.f, other, tankHidden ? SEEN.x : HIDDEN.x, tankHidden ? SEEN.z : HIDDEN.z);
      };
      pin();
      expect(s.f.sim.ctx.hasLineOfSight(s.adept, hidden)).toBe(false);
      expect(s.f.sim.ctx.hasLineOfSight(s.adept, seen)).toBe(true);
      const targets: number[] = [];
      let last: string | null = null;
      run(s, 40, () => {
        pin();
        if (s.adept.castingAbility === CRYPT_GRAVE_BOLT && last !== CRYPT_GRAVE_BOLT)
          targets.push(s.adept.castTargetId as number);
        last = s.adept.castingAbility;
      });
      expect(targets.length).toBeGreaterThanOrEqual(2);
      expect(targets.every((id) => id === seen.id)).toBe(true);
      expect(hits(s, BOLT, 0, hidden)).toBe(0);
      expect(hits(s, BOLT, 0, seen)).toBeGreaterThanOrEqual(2);
    },
  );
});
