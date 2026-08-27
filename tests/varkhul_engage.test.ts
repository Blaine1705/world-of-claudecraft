import { describe, expect, it } from 'vitest';
import { updateVarkhulEncounter, VARKHUL_BOSS_ID } from '../src/sim/encounters/varkhul';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import {
  initVarkhulEngage,
  startVarkhulEngage,
  tickVarkhulEngage,
  VARKHUL_ENGAGE_LEAP_PEAK_Y,
  VARKHUL_ENGAGE_LEAP_SECONDS,
  VARKHUL_ENGAGE_TAUNT_SECONDS,
  varkhulForgingHammerTick,
  varkhulLeapPos,
} from '../src/sim/varkhul_engage';

const DT = 1 / 20;

describe('Varkhul engage staging (pure module)', () => {
  it('hammers the anvil on the assembly cadence while forging, and stops once engaged', () => {
    const st = initVarkhulEngage();
    let blows = 0;
    for (let tick = 0; tick < 20 * 10; tick++) if (varkhulForgingHammerTick(st, DT)) blows++;
    // first blow at 0.6s, then every 2s: 0.6, 2.6, 4.6, 6.6, 8.6 inside 10s
    expect(blows).toBe(5);
    startVarkhulEngage(st, { x: 1, y: 0, z: 2 });
    expect(st.phase).toBe('taunting');
    expect(st.leapFrom).toEqual({ x: 1, y: 0, z: 2 });
    expect(varkhulForgingHammerTick(st, DT)).toBe(false);
  });

  it('holds the taunt, then leaps, then completes exactly once', () => {
    const st = initVarkhulEngage();
    startVarkhulEngage(st, { x: 0, y: 0, z: 16 });
    const tauntTicks = Math.round((VARKHUL_ENGAGE_TAUNT_SECONDS / DT) * 1) - 1;
    for (let i = 0; i < tauntTicks; i++) {
      expect(tickVarkhulEngage(st, DT).phase).toBe('taunting');
    }
    const first = tickVarkhulEngage(st, DT);
    expect(first.phase).toBe('leaping');
    let landed = 0;
    let steps = 0;
    while (st.phase !== 'done' && steps < 100) {
      const step = tickVarkhulEngage(st, DT);
      if (step.landed) landed++;
      steps++;
    }
    expect(landed).toBe(1);
    // the transition tick already consumed the first leap step
    expect(steps).toBe(Math.round(VARKHUL_ENGAGE_LEAP_SECONDS / DT) - 1);
    // done state is stable and never re-lands
    expect(tickVarkhulEngage(st, DT)).toEqual({ phase: 'done', leapT: 1, landed: false });
  });

  it('arcs the leap through the peak and lands exactly at the target', () => {
    const from = { x: 0, y: 0, z: 16 };
    const to = { x: 0, y: 0, z: 0 };
    expect(varkhulLeapPos(from, to, 0, 0)).toEqual({ x: 0, y: 0, z: 16 });
    const mid = varkhulLeapPos(from, to, 0, 0.5);
    expect(mid.z).toBeCloseTo(8);
    expect(mid.y).toBeCloseTo(VARKHUL_ENGAGE_LEAP_PEAK_Y);
    const end = varkhulLeapPos(from, to, 0, 1);
    expect(end).toEqual({ x: 0, y: expect.closeTo(0, 5), z: 0 });
  });
});

describe('Varkhul engage staging (encounter integration)', () => {
  function raidSim(): { sim: Sim; boss: Entity } {
    const sim = new Sim({ seed: 6112, playerClass: 'warrior', autoEquip: true, devCommands: true });
    sim.setPlayerLevel(20);
    sim.chat('/dev varkhulraid normal');
    const boss = [...sim.entities.values()].find((e) => e.templateId === VARKHUL_BOSS_ID);
    if (!boss) throw new Error('no Varkhul in the practice room');
    // The practice allies spawn inside his 30u aggro ring, which would engage
    // him on tick one. Park everyone at the far wall so the walk-in staging is
    // observable, the way a real first pull sees it.
    for (const e of sim.entities.values()) {
      if (e.kind === 'player' && e.id !== boss.id) e.pos = { ...e.pos, z: boss.pos.z - 50 };
    }
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 50 };
    return { sim, boss };
  }

  it('works the anvil pre-pull, roars once on engage, and leaps to the arena center', () => {
    const { sim, boss } = raidSim();
    const spawn = { ...boss.pos };
    const events: SimEvent[] = [];
    const origEmit = sim.ctx.emit.bind(sim.ctx);
    sim.ctx.emit = (ev: SimEvent) => {
      events.push(ev);
      origEmit(ev);
    };

    // pre-pull: nobody within aggro range; he stays put and hammers the anvil
    for (let tick = 0; tick < 20 * 5; tick++) updateVarkhulEncounter(sim.ctx, boss, true);
    const hammerBlows = events.filter(
      (ev) => ev.type === 'spellfxAt' && ev.ability === "Forgefather's Hammer",
    );
    expect(hammerBlows.length).toBeGreaterThanOrEqual(2);
    expect(boss.pos).toEqual(spawn);
    expect(boss.varkhul?.engage.phase).toBe('forging');

    // pull: the player steps into aggro range
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 8 };
    updateVarkhulEncounter(sim.ctx, boss, true);
    expect(boss.varkhul?.engage.phase).toBe('taunting');
    const shouts = events.filter((ev) => ev.type === 'spellfx' && ev.fx === 'shout');
    expect(shouts).toHaveLength(1);
    expect(shouts[0]).toMatchObject({ sourceId: boss.id });

    // he holds the anvil spot through the taunt, then leaves the ground
    const engageTicks = Math.ceil(
      ((VARKHUL_ENGAGE_TAUNT_SECONDS + VARKHUL_ENGAGE_LEAP_SECONDS) / DT) * 1,
    );
    let peakY = boss.pos.y;
    for (let tick = 0; tick < engageTicks + 2; tick++) {
      updateVarkhulEncounter(sim.ctx, boss, true);
      peakY = Math.max(peakY, boss.pos.y);
    }
    expect(boss.varkhul?.engage.phase).toBe('done');
    expect(peakY).toBeGreaterThan(spawn.y + VARKHUL_ENGAGE_LEAP_PEAK_Y * 0.8);
    // landed in the middle of the arena, not at the anvil
    const movedFromSpawn = Math.hypot(boss.pos.x - spawn.x, boss.pos.z - spawn.z);
    expect(movedFromSpawn).toBeGreaterThan(10);
    // one roar total: the cue must never re-fire after the staging completes
    for (let tick = 0; tick < 20; tick++) updateVarkhulEncounter(sim.ctx, boss, true);
    expect(events.filter((ev) => ev.type === 'spellfx' && ev.fx === 'shout')).toHaveLength(1);
  });

  it('keeps the ability schedule identical: the first Cinder Orbs still lands 8s after combat starts', () => {
    const { sim, boss } = raidSim();
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 8 };
    let ticks = 0;
    while (boss.castingAbility !== 'Cinder Orbs' && ticks < 20 * 12) {
      updateVarkhulEncounter(sim.ctx, boss, true);
      ticks++;
    }
    // the staging must not have paused the timer: first orbs at 8s, +-1 tick
    expect(ticks).toBeGreaterThanOrEqual(8 * 20 - 1);
    expect(ticks).toBeLessThanOrEqual(8 * 20 + 1);
  });
});
