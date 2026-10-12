// The Dunefather sand-worm world boss: scheduler spawn, the burrow/emerge
// state machine (encounters/sandworm.ts), the surface Sweep/Slam rotation, HP
// phases, and the untargetable-while-under absorb. Mirrors the world_boss /
// nythraxis test harnesses: a parked, effectively-unkillable player keeps the
// fight running for real sim seconds.

import { describe, expect, it } from 'vitest';
import { SCORCHING_ITEMS } from '../src/sim/content/scorching_wastes';
import { BUILTIN_WORLD, MOBS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent, WorldContent } from '../src/sim/types';
import { WORLD_BOSSES } from '../src/sim/world_boss';

const BOSS_ID = 'sandworm_dunefather';
const WORM_SLOT = WORLD_BOSSES.findIndex((d) => d.templateId === BOSS_ID);

const TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

function makeSim(seed = 7) {
  return new Sim({
    seed,
    playerClass: 'warrior',
    autoEquip: true,
    noPlayer: true,
    world: TEST_WORLD,
  });
}

function findWorm(sim: Sim): Entity | undefined {
  return [...(sim as any).entities.values()].find(
    (e: Entity) => e.templateId === BOSS_ID && !e.dead,
  );
}

function spawnWormNow(sim: Sim): { boss: Entity; events: SimEvent[] } {
  (sim as any).worldBossNextAt[WORM_SLOT] = (sim as any).time;
  const events = sim.tick();
  const boss = findWorm(sim);
  if (!boss) throw new Error('sand worm did not spawn');
  return { boss, events };
}

/** Park an effectively unkillable player in the worm's face and poke it. */
function engageWorm(sim: Sim, pid: number, boss: Entity): Entity {
  const p = (sim as any).entities.get(pid) as Entity;
  // Level to 20 first: any boss debuff (e.g. the Dunefather's Choking Sand blind)
  // re-runs recalcPlayerStats mid-tick, which clamps the hand-hacked 10M hp pool
  // back to the player's REAL maxHp. A level-20 pool survives a tick of boss
  // damage until the next-tick re-pin; a level-1 pool would be one-shot.
  (sim as any).setPlayerLevel(20, pid);
  p.pos = { ...boss.pos };
  p.pos.x += 2;
  p.maxHp = 10_000_000;
  p.hp = 10_000_000;
  (sim as any).dealDamage(p, boss, 10, false, 'physical', 'Chip', 'hit', true);
  return p;
}

/** Tick the sim, chipping the boss every couple of seconds so the pull never
 *  times out of combat (a parked player deals no damage on its own). Chips
 *  skip the burrow window: the damage-immunity assertion owns those ticks. */
function tickSeconds(
  sim: Sim,
  seconds: number,
  onTick?: (events: SimEvent[]) => void,
  keepAlive?: { p: Entity; boss: Entity },
): void {
  const ticks = Math.ceil(seconds * 20);
  for (let i = 0; i < ticks; i++) {
    if (keepAlive) {
      // Stat recalcs (aura churn) clobber a hand-hacked hp pool, and a real
      // eruption + raid-tier melee one-shots a level-1 pool: re-pin it every
      // tick so the parked player genuinely cannot die mid-window.
      keepAlive.p.maxHp = 10_000_000;
      keepAlive.p.hp = 10_000_000;
      if (i % 40 === 0 && !keepAlive.boss.burrowed && !keepAlive.boss.dead) {
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
    const events = sim.tick();
    onTick?.(events);
  }
}

const wormFx = (events: SimEvent[]) =>
  events.filter(
    (e) => e.type === 'spellfx' && String((e as any).attackAnimation).startsWith('worm-'),
  );

describe('Dunefather registration', () => {
  it('is a registered world boss with a spawn slot', () => {
    expect(WORM_SLOT).toBeGreaterThanOrEqual(0);
    const def = WORLD_BOSSES[WORM_SLOT];
    expect(def.hpScale.base).toBeGreaterThan(10_000);
  });

  it('spawns via the scheduler as a massive elite boss', () => {
    const sim = makeSim();
    expect(findWorm(sim)).toBeUndefined();
    const { boss } = spawnWormNow(sim);
    expect(boss.scale).toBe(7); // much bigger than any player
    expect(boss.maxHp).toBe(WORLD_BOSSES[WORM_SLOT].hpScale.base);
    expect(MOBS[BOSS_ID]?.ccImmune).toBe(true);
    expect(MOBS[BOSS_ID]?.worldBoss).toBe(true);
  });
});

describe('Dunefather burrow/emerge script', () => {
  it('dives on the burrow cadence, is damage-immune under the sand, then erupts', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    const p = engageWorm(sim, pid, boss);

    // Run until the dive: P1 cadence is 26s, so 30s catches it.
    let sawBurrowFx = false;
    let burrowTicks = 0;
    let sawEmergeFx = false;
    let sawLeapFx = false;
    let sawDiveFx = false;
    let leapTicks = 0;
    let breachHits = 0;
    let eruptionHits = 0;
    tickSeconds(
      sim,
      34,
      (events) => {
        for (const fx of wormFx(events)) {
          if ((fx as any).attackAnimation === 'worm-burrow') sawBurrowFx = true;
          if ((fx as any).attackAnimation === 'worm-emerge') sawEmergeFx = true;
          if ((fx as any).attackAnimation === 'worm-leap') sawLeapFx = true;
          if ((fx as any).attackAnimation === 'worm-dive') sawDiveFx = true;
        }
        if (boss.sandworm?.state === 'leaping') {
          leapTicks++;
          // Airborne = visible (the Leap clip carries the body), not hidden.
          expect(boss.burrowed).toBe(false);
        }
        for (const e of events) {
          if (e.type === 'damage' && (e as any).ability === 'Sunderquake Eruption') eruptionHits++;
          if (e.type === 'damage' && (e as any).ability === 'Skybreaker Breach') breachHits++;
        }
        if (boss.burrowed) {
          burrowTicks++;
          // Untargetable in effect: the burrow absorb swallows direct damage.
          const hpBefore = boss.hp;
          (sim as any).dealDamage(p, boss, 500, false, 'physical', 'Chip', 'hit', true);
          expect(boss.hp).toBe(hpBefore);
        }
      },
      { p, boss },
    );
    expect(sawBurrowFx).toBe(true);
    expect(burrowTicks).toBeGreaterThan(0); // it actually went under
    expect(sawLeapFx).toBe(true); // the full-body breach arc fired
    expect(sawDiveFx).toBe(true); // ...with its re-entry splash
    expect(leapTicks).toBeGreaterThan(0);
    expect(breachHits).toBeGreaterThan(0); // the breach hit the sand-stander
    expect(sawEmergeFx).toBe(true); // ...and came back out for good
    expect(boss.burrowed).toBe(false); // surfaced by the end of the window
    // The final eruption hit whoever was standing on the sand above.
    expect(eruptionHits).toBeGreaterThan(0);
  });

  it('runs the surface rotation: Scything Sweep and Dunebreaker Slam both land', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    const p = engageWorm(sim, pid, boss);
    const seen = new Set<string>();
    tickSeconds(
      sim,
      30,
      (events) => {
        for (const fx of wormFx(events)) seen.add((fx as any).attackAnimation);
      },
      { p, boss },
    );
    expect(seen.has('worm-sweep')).toBe(true);
    expect(seen.has('worm-slam')).toBe(true);
  });

  it('phases at 70% and 35%: the dive cadence tightens and the phase yells fire', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    const p = engageWorm(sim, pid, boss);
    sim.tick();
    expect(boss.sandworm?.phase).toBe(1);

    const yells: string[] = [];
    const collect = (events: SimEvent[]) => {
      for (const e of events) {
        if (e.type === 'chat' && (e as any).channel === 'yell') yells.push((e as any).text);
      }
    };
    // Burn to just under 70%: phase 2.
    boss.hp = Math.floor(boss.maxHp * 0.69);
    tickSeconds(sim, 1, collect);
    expect(boss.sandworm?.phase).toBe(2);
    expect(yells.some((t) => /Sink and be swallowed/.test(t))).toBe(true);

    // Burn to just under 35%: phase 3.
    boss.hp = Math.floor(boss.maxHp * 0.34);
    tickSeconds(sim, 1, collect);
    expect(boss.sandworm?.phase).toBe(3);
    expect(yells.some((t) => /DESERT TAKES WHAT IT IS OWED/.test(t))).toBe(true);
    void p;
  });

  it('summons dune spawnlings at the phase thresholds (template summonAdds)', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    engageWorm(sim, pid, boss);
    boss.hp = Math.floor(boss.maxHp * 0.66);
    tickSeconds(sim, 2);
    const spawnlings = [...(sim as any).entities.values()].filter(
      (e: Entity) => e.templateId === 'dune_spawnling' && !e.dead,
    );
    expect(spawnlings.length).toBeGreaterThan(0);
  });

  it('the breach arch-dives onto ANOTHER player and the damage lands at the dive', () => {
    const sim = makeSim();
    const pidA = sim.addPlayer('warrior', 'Ada');
    const pidB = sim.addPlayer('mage', 'Bee');
    const { boss } = spawnWormNow(sim);
    const a = engageWorm(sim, pidA, boss);
    // Park B well outside the breach radius and put her on the hate table.
    // Level her too (see engageWorm) so the blind's recalc can't one-shot her.
    (sim as any).setPlayerLevel(20, pidB);
    const b = (sim as any).entities.get(pidB) as Entity;
    b.pos = { ...boss.pos };
    b.pos.x -= 24;
    b.maxHp = 10_000_000;
    b.hp = 10_000_000;
    (sim as any).dealDamage(b, boss, 1, false, 'physical', 'Chip', 'hit', true);

    let leapTarget: number | null = null;
    let tunnelTarget: number | null = null;
    let distAtDive = Infinity;
    let breachHitB = false;
    tickSeconds(
      sim,
      26,
      (events) => {
        b.maxHp = 10_000_000;
        b.hp = 10_000_000;
        const st = boss.sandworm;
        if (st?.state === 'leaping' && st.leapTargetId != null) {
          leapTarget = st.leapTargetId;
          tunnelTarget = st.burrowTargetId;
          const prey = (sim as any).entities.get(st.leapTargetId) as Entity | undefined;
          if (st.leapDiveFx && prey) {
            const dx = boss.pos.x - prey.pos.x;
            const dz = boss.pos.z - prey.pos.z;
            distAtDive = Math.min(distAtDive, Math.hypot(dx, dz));
          }
        }
        for (const e of events) {
          if (
            e.type === 'damage' &&
            (e as any).ability === 'Skybreaker Breach' &&
            (e as any).targetId === pidB
          )
            breachHitB = true;
        }
      },
      { p: a, boss },
    );
    // With two players in the fight the leap MUST pick the other one...
    expect(leapTarget).not.toBeNull();
    expect(leapTarget).not.toBe(tunnelTarget);
    expect(leapTarget).toBe(pidB);
    // ...arc all the way onto her, and land the breach there.
    expect(distAtDive).toBeLessThan(3);
    expect(breachHitB).toBe(true);
  });

  it('spews a wave of 10 broodling clones out of its mouth on the brood cadence', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    const p = engageWorm(sim, pid, boss);
    // The brood timer (25.6s) only ticks while SURFACED: dives pause the
    // rotation, so give the window room past a full dive cycle. Count the
    // brood DURING the run: a late harness wipe (10 broodlings can chew
    // through the pinned hp pool inside one recalc tick) evades the boss and
    // despawns his summons, so the end-state count is not the assertion.
    let sawSpewFx = false;
    let maxBroodAlive = 0;
    tickSeconds(
      sim,
      48,
      (events) => {
        for (const fx of wormFx(events)) {
          if ((fx as any).attackAnimation === 'worm-spew') sawSpewFx = true;
        }
        const alive = [...(sim as any).entities.values()].filter(
          (e: Entity) => e.templateId === 'dune_broodling' && !e.dead,
        ).length;
        maxBroodAlive = Math.max(maxBroodAlive, alive);
      },
      { p, boss },
    );
    expect(sawSpewFx).toBe(true);
    // The full wave of 10 clones came out of the mouth in one spew.
    expect(maxBroodAlive).toBe(10);
    expect(MOBS.dune_broodling?.scale).toBeLessThan(1); // mini clones
  });

  it('a dead worm never lingers half-buried (corpse surfaces + loots)', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    const p = engageWorm(sim, pid, boss);
    // Ride through a full dive (P1 dive at ~17s, surfaced by ~21s), then
    // execute him: mid-dive he is IMMUNE by design, so the kill lands after.
    tickSeconds(sim, 22, undefined, { p, boss });
    expect(boss.burrowed ?? false).toBe(false);
    (sim as any).dealDamage(p, boss, boss.hp + boss.maxHp, false, 'physical', 'Chip', 'hit', true);
    tickSeconds(sim, 1);
    expect(boss.dead || boss.hp <= 0).toBe(true);
    expect(boss.burrowed ?? false).toBe(false); // never lingers half-buried
  });
});

describe('Dunefather rewards + hazards', () => {
  it('blinds players caught in the churned sand so the boss evades their swings', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    const p = engageWorm(sim, pid, boss); // parked at boss.pos + 2, inside the dust
    tickSeconds(sim, 2, undefined, { p, boss });
    const blind = p.auras.find((a) => a.kind === 'blind');
    expect(blind).toBeDefined();
    // value == added swing-miss chance (cc.ts blindMissBonus): 20% of the
    // blinded player's hits whiff, i.e. the Dunefather evades a fifth of them.
    expect(blind?.value).toBeCloseTo(0.2);
  });

  it('a slain Dunefather despawns after 5 minutes (per-boss corpse window)', () => {
    expect(WORLD_BOSSES[WORM_SLOT].corpseSeconds).toBe(300);
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnWormNow(sim);
    const p = engageWorm(sim, pid, boss);
    (sim as any).dealDamage(p, boss, boss.hp + boss.maxHp, false, 'physical', 'Chip', 'hit', true);
    tickSeconds(sim, 1);
    expect(boss.dead || boss.hp <= 0).toBe(true);
    // The 5-minute window, not the 15-minute default (decrements ~1s over the tick).
    expect(boss.corpseTimer).toBeGreaterThan(295);
    expect(boss.corpseTimer).toBeLessThanOrEqual(300);
  });

  it('drops a guaranteed trophy plus a roll-group of class-typed epic boots', () => {
    const loot = MOBS[BOSS_ID]?.loot ?? [];
    expect(loot.find((l) => l.itemId === 'dunefather_tailspine')?.chance).toBe(1);
    const boots = loot.filter((l) => l.rollGroup === 'dunefather_treads');
    expect(boots.length).toBe(4); // one per armor archetype (plate/leather/cloth/mail)
    for (const b of boots) {
      const item = SCORCHING_ITEMS[b.itemId as string];
      expect(item?.quality).toBe('epic');
      expect(item?.slot).toBe('feet');
    }
  });
});
