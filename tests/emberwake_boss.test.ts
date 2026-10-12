// Vaelgrath, the Emberwake dragon world boss: scheduler registration + the
// SUMMONING contract, the arcane BEAM -> warned, lingering flame pools, the wing buffet's
// knockback + downdraft, the bite, and the P2 (<60%) three-gout fan.
// Mirrors the sandworm/world_boss harnesses: a parked, effectively-unkillable
// player keeps the fight running for real sim seconds.

import { describe, expect, it } from 'vitest';
import { BUILTIN_WORLD, MOBS } from '../src/sim/data';
import { abilityRangeTo, combatProfileForMob, playerMeleeRangeTo } from '../src/sim/mob_combat';
import { Sim } from '../src/sim/sim';
import {
  EMBERWAKE_MOUTH_FORWARD_PER_SCALE,
  type Entity,
  MELEE_RANGE,
  type SimEvent,
  type WorldContent,
} from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { WORLD_BOSSES } from '../src/sim/world_boss';

const BOSS_ID = 'emberwake_vaelgrath';
const SLOT = WORLD_BOSSES.findIndex((d) => d.templateId === BOSS_ID);

const TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

function makeSim(seed = 11) {
  return new Sim({
    seed,
    playerClass: 'warrior',
    autoEquip: true,
    noPlayer: true,
    world: TEST_WORLD,
  });
}

function findBoss(sim: Sim): Entity | undefined {
  return [...(sim as any).entities.values()].find(
    (e: Entity) => e.templateId === BOSS_ID && !e.dead,
  );
}

// Vaelgrath is SUMMONED (world_boss.ts summonCrystal), so nudging the interval
// no longer raises him, the crystal is his clock. These fight tests are about
// what he does once he is up, so they call the scheduler's spawn primitive
// directly; the summon path itself is covered by
// tests/world_boss_summon_crystal.test.ts.
function spawnNow(sim: Sim): Entity {
  const s = sim as any;
  s.worldBossEntityIds[SLOT] = s.spawnWorldBoss(WORLD_BOSSES[SLOT]);
  sim.tick();
  const boss = findBoss(sim);
  if (!boss) throw new Error('Emberwake did not spawn');
  return boss;
}

function engage(sim: Sim, pid: number, boss: Entity): Entity {
  const p = (sim as any).entities.get(pid) as Entity;
  (sim as any).setPlayerLevel(22, pid);
  p.pos = { ...boss.pos };
  p.pos.x += 3;
  p.maxHp = 10_000_000;
  p.hp = 10_000_000;
  (sim as any).dealDamage(p, boss, 10, false, 'physical', 'Chip', 'hit', true);
  return p;
}

function tickSeconds(
  sim: Sim,
  seconds: number,
  onTick?: (events: SimEvent[]) => void,
  keepAlive?: { p: Entity; boss: Entity },
): void {
  const ticks = Math.ceil(seconds * 20);
  for (let i = 0; i < ticks; i++) {
    if (keepAlive) {
      keepAlive.p.maxHp = 10_000_000;
      keepAlive.p.hp = 10_000_000;
      if (i % 40 === 0 && !keepAlive.boss.dead) {
        (sim as any).dealDamage(
          keepAlive.p,
          keepAlive.boss,
          1,
          false,
          'physical',
          'Chip',
          'hit',
          true,
        );
      }
    }
    onTick?.(sim.tick());
  }
}

const dragonFx = (events: SimEvent[]) =>
  events.filter(
    (e) => e.type === 'spellfx' && String((e as any).attackAnimation).startsWith('dragon-'),
  );

describe('Emberwake registration', () => {
  it('is a registered world boss, summoned rather than scheduled', () => {
    expect(SLOT).toBeGreaterThanOrEqual(0);
    const def = WORLD_BOSSES[SLOT];
    expect(def.hpScale.base).toBeGreaterThan(10_000);
    // He was once anchored to the starting area; he now lands on a FIXED point
    // (the Northspire summit in the Frostveil Reach) and only when the Emberwake
    // Crystal below is channelled to shattering.
    expect(def.atPlayerStart).toBeUndefined();
    expect(def.pos).toEqual({ x: 31.7, z: 1862.8 });
    expect(def.summonCrystal?.channelSeconds).toBe(3);
    expect(def.summonCrystal?.respawnSeconds).toBe(3 * 3600);
  });

  it('is a huge, no-clipping, level-22 world-boss template with lore taunts', () => {
    const t = MOBS[BOSS_ID];
    expect(t).toBeTruthy();
    // Rendered size is manifest.height (3.0) * this scale, so scale 3.6 is a
    // ~10.8yd dragon. Guard the RANGE: a tiny height with a huge scale inflates
    // clickRadius and the melee ring away from the model (that was the 45yd
    // hitbox bug), and a scale under ~2 stops reading as a world boss at all.
    expect(t.scale).toBeGreaterThanOrEqual(2);
    expect(t.scale).toBeLessThanOrEqual(20);
    // A flying mountain must not path around trees and huts.
    expect(t.phasesThroughObstacles).toBe(true);
    expect(t.minLevel).toBeGreaterThanOrEqual(22);
    expect(t.worldBoss).toBe(true);
    expect(t.boss).toBe(true);
    expect(t.battleYells?.lines.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(t.yells?.engage).toBeTruthy();
  });

  it('chases across the world without wedging, and never sinks under terrain', () => {
    // The two halves of "clips through map objects, still collides with
    // terrain". Vaelgrath phases (phasesThroughObstacles), so nothing in the
    // world can stop his pursuit, but the phasing mover still re-seats him on
    // groundHeight every step, so he rides the hillside instead of through it.
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);
    // Park the player a long way off across real terrain and hold them there.
    const goal = { x: boss.pos.x + 260, z: boss.pos.z + 190 };
    const startDistance = Math.hypot(boss.pos.x - goal.x, boss.pos.z - goal.z);
    let sank = 0;
    tickSeconds(
      sim,
      30,
      () => {
        p.pos = { ...p.pos, x: goal.x, z: goal.z };
        p.pos.y = groundHeight(goal.x, goal.z, (sim as any).cfg.seed);
        // He may hover in the RENDER layer, but the sim body rides the ground:
        // a position under the terrain would mean the phasing branch stopped
        // re-seating y, which is how a flyer ends up inside a hill.
        if (boss.pos.y < groundHeight(boss.pos.x, boss.pos.z, (sim as any).cfg.seed) - 0.01) sank++;
      },
      { p, boss },
    );
    const endDistance = Math.hypot(boss.pos.x - goal.x, boss.pos.z - goal.z);
    expect(sank).toBe(0);
    // 30s at moveSpeed 8.5 is ~255yd of travel; anything that wedged him on a
    // prop or a cliff would leave him near where he started.
    expect(startDistance - endDistance).toBeGreaterThan(80);
  });

  it('lands on his authored summit point, not at the map player start', () => {
    const sim = makeSim();
    const boss = spawnNow(sim);
    const start = TEST_WORLD.playerStart;
    const def = WORLD_BOSSES[SLOT];
    // Within a yard: spawnWorldBoss grounds the point and the placement nudges
    // it clear of collision, so this is a point check, not exact equality.
    expect(Math.abs(boss.pos.x - def.pos.x)).toBeLessThan(1);
    expect(Math.abs(boss.pos.z - def.pos.z)).toBeLessThan(1);
    // ...and emphatically NOT the old starting-area anchor.
    expect(Math.hypot(boss.pos.x - start.x, boss.pos.z - start.z)).toBeGreaterThan(100);
  });
});

describe('Emberwake melee hitbox', () => {
  it('grants melee reach against his body, and only his', () => {
    const dragon = { kind: 'mob', templateId: 'emberwake_vaelgrath' };
    const wolf = { kind: 'mob', templateId: 'zone1_wolf' };
    // The point of the hitbox: a body this size cannot be fought from a flat 5yd
    // ring around a centre that is buried inside it.
    expect(playerMeleeRangeTo(dragon)).toBeGreaterThan(MELEE_RANGE * 3);
    // Nothing else in the game moves.
    expect(playerMeleeRangeTo(wolf)).toBe(MELEE_RANGE);
    expect(playerMeleeRangeTo(null)).toBe(MELEE_RANGE);
    // Melee-ranged abilities grow with it; a 30yd nuke does not.
    expect(abilityRangeTo(MELEE_RANGE, dragon)).toBe(playerMeleeRangeTo(dragon));
    expect(abilityRangeTo(30, dragon)).toBe(30);
  });

  it('shapes the hitbox along his BODY, so the flank is not a free 40yd ring', () => {
    // Facing +Z (facing 0), origin at 0,0: his nose runs up +Z, his flank is +X.
    const dragon = {
      kind: 'mob',
      templateId: 'emberwake_vaelgrath',
      facing: 0,
      pos: { x: 0, z: 0 },
    };
    const atJaw = playerMeleeRangeTo(dragon, { x: 0, z: 30 });
    const atTail = playerMeleeRangeTo(dragon, { x: 0, z: -30 });
    const atFlank = playerMeleeRangeTo(dragon, { x: 30, z: 0 });
    // Down the body axis the reach has to cover the jaw he parks on the player.
    expect(atJaw).toBeGreaterThan(35);
    // The tail end is body too, the box is symmetric about the origin.
    expect(atTail).toBeCloseTo(atJaw, 5);
    // ...but standing off his side is a different matter entirely.
    expect(atFlank).toBeLessThan(atJaw / 2);
    expect(atFlank).toBeGreaterThan(MELEE_RANGE);
  });

  it('parks his HEAD on the player rather than burying them under his chest', () => {
    const profile = combatProfileForMob('emberwake_vaelgrath', MOBS.emberwake_vaelgrath.scale);
    const jaw = MOBS.emberwake_vaelgrath.scale * EMBERWAKE_MOUTH_FORWARD_PER_SCALE;
    // What locomotion actually closes to IS the mouth offset: stop when the
    // teeth arrive, not when the ribcage does.
    expect(profile.desiredRange).toBeCloseTo(jaw, 5);
    // ...and the swing reach is the jaw plus the bite itself.
    expect(profile.meleeRange).toBeGreaterThan(jaw);
    // The player standing at that head must be able to answer it.
    const dragon = {
      kind: 'mob',
      templateId: 'emberwake_vaelgrath',
      facing: 0,
      pos: { x: 0, z: 0 },
    };
    expect(playerMeleeRangeTo(dragon, { x: 0, z: profile.desiredRange })).toBeGreaterThanOrEqual(
      profile.desiredRange,
    );
  });

  it('closes on a distant player until his JAW arrives, not his ribcage', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    const jawOffset = MOBS.emberwake_vaelgrath.scale * EMBERWAKE_MOUTH_FORWARD_PER_SCALE;
    let bestJawGap = Infinity;
    let originGapAtBest = 0;
    // Park the player well out and hold them there while he flies in. He plants
    // during breath wind-ups, so sample the whole approach rather than the end.
    tickSeconds(
      sim,
      30,
      () => {
        p.pos = { ...p.pos, x: boss.spawnPos.x + 90, z: boss.spawnPos.z };
        const jawX = boss.pos.x + Math.sin(boss.facing) * jawOffset;
        const jawZ = boss.pos.z + Math.cos(boss.facing) * jawOffset;
        const jawGap = Math.hypot(p.pos.x - jawX, p.pos.z - jawZ);
        if (jawGap < bestJawGap) {
          bestJawGap = jawGap;
          originGapAtBest = Math.hypot(p.pos.x - boss.pos.x, p.pos.z - boss.pos.z);
        }
      },
      { p, boss },
    );

    // The teeth end up on the player...
    expect(bestJawGap).toBeLessThan(8);
    // ...which means his BODY centre is a jaw-length away, not on top of them.
    // (That gap is the whole point: the player can see the animal they fight.)
    expect(originGapAtBest).toBeGreaterThan(jawOffset * 0.7);
  });

  it('lets a player auto-attack him from well outside the flat melee ring', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    // Parked at 14yd, nearly three times MELEE_RANGE, and comfortably inside
    // his silhouette, swinging must connect.
    let landed = false;
    tickSeconds(
      sim,
      12,
      (evs) => {
        p.pos = { ...p.pos, x: boss.pos.x, z: boss.pos.z + 14 };
        p.facing = Math.atan2(boss.pos.x - p.pos.x, boss.pos.z - p.pos.z);
        p.targetId = boss.id;
        p.autoAttack = true;
        if (
          evs.some(
            (e) =>
              e.type === 'damage' &&
              (e as any).sourceId === p.id &&
              (e as any).targetId === boss.id,
          )
        )
          landed = true;
      },
      { p, boss },
    );
    expect(landed).toBe(true);
  });
});

describe('Emberwake fight', () => {
  it('breathes fire and leaves burning circles that linger ~5s then expire', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    let sawBreath = false;
    let peakZones = 0;
    let sampledRemaining = 0;
    let sampledRadius = 0;
    let sampledSchool = '';
    // Circles are TRANSIENT (EMBER.duration = 5s), so sample while the fight
    // runs rather than after it: a post-hoc check races their expiry.
    tickSeconds(
      sim,
      25,
      (evs) => {
        if (dragonFx(evs).some((e) => (e as any).attackAnimation === 'dragon-breath'))
          sawBreath = true;
        const zones = (sim as any).ctx.groundAoEs.filter(
          (g: any) => g.ability === 'Arcane Cinders',
        );
        if (zones.length > peakZones) {
          peakZones = zones.length;
          sampledRemaining = zones[0].remaining;
          sampledRadius = zones[0].radius;
          sampledSchool = zones[0].school;
        }
      },
      { p, boss },
    );

    expect(sawBreath).toBe(true);
    expect(peakZones).toBeGreaterThan(0);
    expect(sampledRemaining).toBeLessThanOrEqual(5.0);
    expect(sampledRemaining).toBeGreaterThan(0);
    // The pools are meant to be BIG, they dominate the arena floor.
    expect(sampledRadius).toBeGreaterThanOrEqual(8);
    expect(sampledSchool).toBe('arcane');

    // They must EXPIRE, a permanent fire field would be a bug. Six seconds of
    // quiet (no breath can land in the gap right after one) drains them.
    let sawEmpty = false;
    tickSeconds(
      sim,
      12,
      () => {
        const n = (sim as any).ctx.groundAoEs.filter(
          (g: any) => g.ability === 'Arcane Cinders',
        ).length;
        if (n === 0) sawEmpty = true;
      },
      { p, boss },
    );
    expect(sawEmpty).toBe(true);
  });

  it('warns the ground with sigils BEFORE the flame pools ignite', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    let warnTick = -1;
    let poolTick = -1;
    let t = 0;
    tickSeconds(
      sim,
      40,
      (evs) => {
        t++;
        const warned = evs.some(
          (e) =>
            e.type === 'spellfxAt' &&
            (e as any).fx === 'runeCircle' &&
            (e as any).school === 'arcane',
        );
        if (warned && warnTick < 0) warnTick = t;
        const pools = (sim as any).ctx.groundAoEs.filter(
          (g: any) => g.ability === 'Arcane Cinders',
        ).length;
        if (pools > 0 && poolTick < 0) poolTick = t;
      },
      { p, boss },
    );

    expect(warnTick).toBeGreaterThan(0);
    expect(poolTick).toBeGreaterThan(0);
    // The whole point of the mechanic: the sigil lands strictly BEFORE the fire.
    expect(warnTick).toBeLessThan(poolTick);
  });

  it('tracks the aggroed player with his facing', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);
    // Single long run (the script only starts once he is in combat). Once it is
    // live, park the player on his flank and sample the facing error after he
    // has had a beat to turn.
    let moved = false;
    let settle = 0;
    let err = Math.PI;
    tickSeconds(
      sim,
      60,
      () => {
        if (!boss.emberwake) return;
        if (!moved) {
          moved = true;
          p.pos = { ...p.pos, x: boss.pos.x, z: boss.pos.z + 40 };
          settle = 0;
          return;
        }
        if (++settle < 10) return;
        const want = Math.atan2(p.pos.x - boss.pos.x, p.pos.z - boss.pos.z);
        err = Math.min(
          err,
          Math.abs(Math.atan2(Math.sin(boss.facing - want), Math.cos(boss.facing - want))),
        );
      },
      { p, boss },
    );
    expect(moved).toBe(true);
    expect(err).toBeLessThan(0.35); // radians: looking at them, not past them
  });

  it('draws the beam as a sweep across MANY ticks, not one frame', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    // Ticks on which at least one arcane ground burst was emitted. The renderer
    // pools these round-robin, so a whole lane dumped in ONE tick is invisible;
    // the lance must march out over several ticks to actually read as a beam.
    let burstTicks = 0;
    let maxPerTick = 0;
    tickSeconds(
      sim,
      40,
      (evs) => {
        const n = evs.filter(
          (e) =>
            e.type === 'spellfxAt' && (e as any).fx === 'burst' && (e as any).school === 'arcane',
        ).length;
        if (n > 0) burstTicks++;
        if (n > maxPerTick) maxPerTick = n;
      },
      { p, boss },
    );

    expect(burstTicks).toBeGreaterThanOrEqual(5);
    // ...and no single tick should dump the entire lane.
    expect(maxPerTick).toBeLessThan(10);
  });

  it('starts the breath at his jaw, well clear of the body origin', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);
    // The muzzle flash is the thing pinned to the jaw. The burst LANE now runs
    // from the jaw back toward the player, so lane bursts legitimately land near
    // the body, only the muzzle nova proves the origin is the head.
    let muzzleDist = -1;
    tickSeconds(
      sim,
      40,
      (evs) => {
        for (const e of evs) {
          if (e.type !== 'spellfxAt' || (e as any).fx !== 'nova') continue;
          if ((e as any).school !== 'arcane') continue;
          const d = Math.hypot((e as any).x - boss.pos.x, (e as any).z - boss.pos.z);
          if (d > muzzleDist) muzzleDist = d;
        }
      },
      { p, boss },
    );
    // mouthOf() is scale(6) * 5.2 = ~31yd forward, so the flash must be far out.
    expect(muzzleDist).toBeGreaterThan(10);
  });

  it('lances a beam from the mouth rather than lobbing a projectile', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);
    let sawBeam = false;
    tickSeconds(
      sim,
      40,
      (evs) => {
        if (
          evs.some(
            (e) =>
              e.type === 'spellfx' && (e as any).fx === 'beam' && (e as any).school === 'arcane',
          )
        )
          sawBeam = true;
      },
      { p, boss },
    );
    expect(sawBeam).toBe(true);
  });

  it('burning pools throw flame plumes and scorch anyone standing in them', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    let plumeTicks = 0;
    let sawScorch = false;
    tickSeconds(
      sim,
      45,
      (evs) => {
        const n = evs.filter(
          (e) => e.type === 'spellfxAt' && (e as any).school === 'arcane',
        ).length;
        if (n >= 2) plumeTicks++;
        if (p.auras.some((a) => a.id === 'emberwake_scorch')) sawScorch = true;
      },
      { p, boss },
    );

    // Flame keeps erupting out of the rings for as long as they burn.
    expect(plumeTicks).toBeGreaterThanOrEqual(3);
    // ...and standing in one applies the debuff.
    expect(sawScorch).toBe(true);
    const a = p.auras.find((x) => x.id === 'emberwake_scorch');
    if (a) expect(a.kind).toBe('debuff_ap');
  });

  it('wing buffet knocks players back and applies the movement-robbing downdraft', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    let sawBuffet = false;
    let downdraftSeen = false;
    let maxDist = 0;
    tickSeconds(
      sim,
      30,
      (evs) => {
        if (dragonFx(evs).some((e) => (e as any).attackAnimation === 'dragon-buffet'))
          sawBuffet = true;
        if (p.auras.some((a) => a.id === 'emberwake_downdraft')) {
          downdraftSeen = true;
          maxDist = Math.max(maxDist, Math.hypot(p.pos.x - boss.pos.x, p.pos.z - boss.pos.z));
        }
      },
      { p, boss },
    );

    expect(sawBuffet).toBe(true);
    expect(downdraftSeen).toBe(true);
    // The shove has to actually displace: parked at +3yd, a buffet must push further out.
    expect(maxDist).toBeGreaterThan(3.5);
    // The downdraft is a slow, not a full root, players keep partial control.
    const aura = p.auras.find((a) => a.id === 'emberwake_downdraft');
    if (aura) expect(aura.kind).toBe('slow');
  });

  it('bites in melee', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);
    let sawBite = false;
    tickSeconds(
      sim,
      20,
      (evs) => {
        if (dragonFx(evs).some((e) => (e as any).attackAnimation === 'dragon-bite')) sawBite = true;
      },
      { p, boss },
    );
    expect(sawBite).toBe(true);
  });

  it('opens a Molten Vents burn window on HIMSELF after a breath', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    let breathTick = -1;
    let ventTick = -1;
    let ventValue = 0;
    let t = 0;
    tickSeconds(
      sim,
      30,
      (evs) => {
        t++;
        if (
          dragonFx(evs).some((e) => (e as any).attackAnimation === 'dragon-breath') &&
          breathTick < 0
        )
          breathTick = t;
        const vent = boss.auras.find((a) => a.id === 'emberwake_molten_vents');
        if (vent && ventTick < 0) {
          ventTick = t;
          ventValue = vent.value;
          expect(vent.kind).toBe('vulnerability');
        }
      },
      { p, boss },
    );

    expect(breathTick).toBeGreaterThan(0);
    // The window is the REWARD for surviving the beam, so it opens with it.
    expect(ventTick).toBeGreaterThanOrEqual(breathTick);
    expect(ventValue).toBeGreaterThan(0);
    // ...and it must CLOSE: a permanent vulnerability would trivialize him.
    let sawClosed = false;
    tickSeconds(
      sim,
      8,
      () => {
        if (!boss.auras.some((a) => a.id === 'emberwake_molten_vents')) sawClosed = true;
      },
      { p, boss },
    );
    expect(sawClosed).toBe(true);
  });

  it('lashes players standing BEHIND him and leaves those on his flank alone', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    // He always turns to face his aggro target (Ada), so she is the FRONT
    // control; a second player parked at his tail is the one the lash is for.
    const bid = sim.addPlayer('warrior', 'Tailward');
    const behind = (sim as any).entities.get(bid) as Entity;
    behind.maxHp = 10_000_000;
    behind.hp = 10_000_000;

    let lashedBehind = false;
    let lashedFront = false;
    tickSeconds(
      sim,
      40,
      () => {
        // Re-park both every tick, since he turns with Ada and the lash shoves.
        p.pos = {
          ...p.pos,
          x: boss.pos.x + Math.sin(boss.facing) * 20,
          z: boss.pos.z + Math.cos(boss.facing) * 20,
        };
        const back = boss.facing + Math.PI;
        behind.pos = {
          ...behind.pos,
          x: boss.pos.x + Math.sin(back) * 20,
          z: boss.pos.z + Math.cos(back) * 20,
        };
        if (behind.auras.some((a) => a.id === 'emberwake_lashed')) lashedBehind = true;
        if (p.auras.some((a) => a.id === 'emberwake_lashed')) lashedFront = true;
      },
      { p, boss },
    );

    expect(lashedBehind).toBe(true);
    expect(lashedFront).toBe(false);
  });

  it('rains warned Cinderfall pools onto players once phase 2 opens', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    // Park the player WELL outside the beam's lane pools (and re-park each tick)
    // so a warning that lands on top of them can only be the ember rain.
    let sawFall = false;
    let warnedNearPlayer = false;
    tickSeconds(
      sim,
      45,
      (evs) => {
        if (boss.emberwake && boss.emberwake.phase !== 'dead') {
          boss.hp = Math.min(boss.hp, Math.floor(boss.maxHp * 0.5));
        }
        p.pos = { ...p.pos, x: boss.pos.x + 60, z: boss.pos.z + 60 };
        for (const e of evs) {
          if (e.type !== 'spellfxAt') continue;
          if ((e as any).fx === 'meteorFall') sawFall = true;
          if ((e as any).fx !== 'runeCircle') continue;
          if (Math.hypot((e as any).x - p.pos.x, (e as any).z - p.pos.z) < 12)
            warnedNearPlayer = true;
        }
      },
      { p, boss },
    );

    expect(sawFall).toBe(true);
    expect(warnedNearPlayer).toBe(true);
  });

  it('drops the Cinderfall rock as ARCANE, so the renderer falls it violet', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    // His flame is not fire: the meteorFall cue carries school 'arcane', which
    // is the ONLY thing that picks the violet meteor palette in the renderer
    // (render/mage_ground_fx.ts meteorPaletteFor). A fire-schooled cue here
    // would silently drop the Mage's orange rock into a dragon fight.
    const schools = new Set<string>();
    tickSeconds(
      sim,
      45,
      (evs) => {
        if (boss.emberwake && boss.emberwake.phase !== 'dead') {
          boss.hp = Math.min(boss.hp, Math.floor(boss.maxHp * 0.5));
        }
        p.pos = { ...p.pos, x: boss.pos.x + 60, z: boss.pos.z + 60 };
        for (const e of evs) {
          if (e.type === 'spellfxAt' && (e as any).fx === 'meteorFall') {
            schools.add((e as any).school);
          }
        }
      },
      { p, boss },
    );

    expect(schools.size).toBeGreaterThan(0);
    expect([...schools]).toEqual(['arcane']);
  });

  it('enters phase 3 below 30% and keeps breathing on a tighter clock', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    let sawPhase3 = false;
    let breaths = 0;
    tickSeconds(
      sim,
      45,
      (evs) => {
        if (boss.emberwake && boss.emberwake.phase !== 'dead') {
          boss.hp = Math.min(boss.hp, Math.floor(boss.maxHp * 0.2));
          if (boss.emberwake.phase === 3) sawPhase3 = true;
        }
        if (dragonFx(evs).some((e) => (e as any).attackAnimation === 'dragon-breath')) breaths++;
      },
      { p, boss },
    );

    expect(sawPhase3).toBe(true);
    // P3 breathes every 6s: 45 seconds of fight is several beams, not one.
    expect(breaths).toBeGreaterThanOrEqual(4);
  });

  it('lands on his feet, bites far faster, and stops breathing while down', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    let sawGrounded = false;
    let sawAirAgain = false;
    let groundBites = 0;
    let breathsWhileDown = 0;
    let buffetsWhileDown = 0;
    // Long enough to cover a full land -> hunt -> launch cycle (GROUND_EVERY[1]
    // is 34s of flight, GROUND_FOR[1] 9s on the ground).
    tickSeconds(
      sim,
      60,
      (evs) => {
        const down = boss.emberwakeGrounded === true;
        if (down) sawGrounded = true;
        else if (sawGrounded) sawAirAgain = true;
        for (const e of evs) {
          if (e.type !== 'spellfx') continue;
          const anim = (e as any).attackAnimation;
          if (anim === 'dragon-ground-bite') groundBites++;
          if (!down) continue;
          if (anim === 'dragon-breath') breathsWhileDown++;
          if (anim === 'dragon-buffet') buffetsWhileDown++;
        }
      },
      { p, boss },
    );

    expect(sawGrounded).toBe(true);
    // He gets back up: a permanently grounded dragon would lose the whole kit.
    expect(sawAirAgain).toBe(true);
    // The landed stretch is teeth, several chomps inside a ~9s window.
    expect(groundBites).toBeGreaterThanOrEqual(3);
    // ...and the wing beats are OFF while the wings are folded. (The launch
    // buffet fires on the tick he leaves the ground, i.e. no longer `down`.)
    expect(breathsWhileDown).toBe(0);
    expect(buffetsWhileDown).toBe(0);
  });

  it('clears the landed flag when he dies, so the corpse is not a landed prowl', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);
    // Run him to the ground first, then kill him while he is down there.
    let killed = false;
    tickSeconds(
      sim,
      60,
      () => {
        if (!killed && boss.emberwakeGrounded === true) {
          killed = true;
          (sim as any).dealDamage(p, boss, boss.maxHp * 10, false, 'physical', 'Chip', 'hit', true);
        }
      },
      { p, boss },
    );
    expect(killed).toBe(true);
    expect(boss.dead).toBe(true);
    // The render layer keys the wings-folded rig off this flag; a corpse must
    // play the death clip instead (and fall out of the air on its own).
    expect(boss.emberwakeGrounded).toBe(false);
  });

  it('enters phase 2 below 60% and fans the breath three wide', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const boss = spawnNow(sim);
    const p = engage(sim, pid, boss);

    // Single long run, same shape as the buffet/bite tests: the script only
    // starts once he is genuinely in combat, so drive the phase flip from
    // inside the tick loop rather than assuming a fixed warm-up.
    let peak = 0;
    let sawPhase2 = false;
    tickSeconds(
      sim,
      60,
      () => {
        if (boss.emberwake && boss.emberwake.phase !== 'dead') {
          // Hold him under the 60% gate (the world-boss scaler only grows maxHp).
          boss.hp = Math.min(boss.hp, Math.floor(boss.maxHp * 0.5));
          if (boss.emberwake.phase === 2) sawPhase2 = true;
        }
        const n = (sim as any).ctx.groundAoEs.filter(
          (g: any) => g.ability === 'Arcane Cinders',
        ).length;
        if (n > peak) peak = n;
      },
      { p, boss },
    );

    expect(sawPhase2).toBe(true);
    expect(peak).toBeGreaterThanOrEqual(3);
  });
});
