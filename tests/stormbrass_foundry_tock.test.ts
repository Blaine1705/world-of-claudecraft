// Line-Master Ambrel Tock (src/sim/encounters/stormbrass_foundry/line_master.ts):
// the G19 belts that carry the group, the lever that reverses them, the
// Stamping Press, the Parts Drop frames, the Rivet Gun, heroic Overtime and
// Cross-Feed, the reset on a wipe and the Quality Control deed. Driven through
// full Sim ticks in a real claimed Foundry (tests/helpers/foundry_fight.ts).

import { describe, expect, it } from 'vitest';
import { MAIN_LINE_BELTS } from '../src/sim/content/stormbrass_foundry_layout';
import {
  FOUNDRY_BELT_TEMPLATES,
  FOUNDRY_PRESS_STRIP,
  FRAME_BOOTING,
  HALF_BUILT_FRAME_ID,
  leverPair,
  startingDirs,
  TOCK_TUNING as T,
  TOCK_DEED,
  TOCK_FLATTENED,
  TOCK_ID,
  TOCK_LEVER,
  TOCK_LINES,
  TOCK_PRESSURE,
  TOCK_RIVET_GUN,
} from '../src/sim/encounters/stormbrass_foundry';
import { startPress, tockState } from '../src/sim/encounters/stormbrass_foundry/line_master';
import type { Entity, TockFightState } from '../src/sim/types';
import {
  aura,
  boss,
  earned,
  engage,
  type Fight,
  fight,
  hitsOn,
  live,
  local,
  objects,
  put,
  run,
  wipe,
} from './helpers/foundry_fight';

const B = MAIN_LINE_BELTS;

function tockFight(difficulty: 'normal' | 'heroic' = 'normal'): { f: Fight; b: Entity } {
  const f = fight(difficulty);
  const b = boss(f, TOCK_ID);
  put(f, b, 0, -22);
  put(f, f.tank, 0, -20);
  // A walkway between belts 0 and 1, and one far down belt 0.
  put(f, f.others[0], -10, -30);
  put(f, f.others[1], B.xs[0], -36);
  put(f, f.others[2], 10, -30);
  engage(f, b);
  return { f, b };
}

function state(b: Entity): TockFightState {
  const st = b.foundryFight;
  if (st?.kind !== 'tock') throw new Error('no tock state');
  return st;
}

function belts(f: Fight): Entity[] {
  return [
    ...objects(f, FOUNDRY_BELT_TEMPLATES.idle),
    ...objects(f, FOUNDRY_BELT_TEMPLATES.run),
    ...objects(f, FOUNDRY_BELT_TEMPLATES.alarm),
  ].sort((a, c) => a.pos.x - c.pos.x);
}

describe('Line-Master Tock: the belts (G19)', () => {
  it('starts every belt toward the press on normal, alternating on heroic Cross-Feed', () => {
    expect(startingDirs(false)).toEqual([1, 1, 1, 1]);
    expect(startingDirs(true)).toEqual([1, -1, 1, -1]);
    expect(leverPair(false, 7, 1)).toEqual([0, 1, 2, 3]);
    for (let salt = 1; salt < 20; salt++) {
      const pair = leverPair(true, 7, salt);
      expect(pair).toHaveLength(2);
      expect(new Set(pair).size).toBe(2);
      for (const i of pair) expect(i >= 0 && i < 4).toBe(true);
    }
  });

  it('runs the four belts while he fights, carrying a body 3 yd a second toward the press', () => {
    const { f } = tockFight();
    run(f, 0.1);
    const objs = belts(f);
    expect(objs).toHaveLength(4);
    for (const o of objs) {
      expect(o.templateId).toBe(FOUNDRY_BELT_TEMPLATES.run);
      expect(o.facing).toBe(0);
      expect(o.scale).toBe(T.beltSpeed);
    }
    const rider = f.others[1];
    const walker = f.others[0];
    const z0 = local(f, rider).z;
    const w0 = local(f, walker);
    run(f, 2);
    expect(local(f, rider).z - z0).toBeGreaterThan(T.beltSpeed * 2 * 0.85);
    expect(local(f, rider).z - z0).toBeLessThan(T.beltSpeed * 2 * 1.1);
    // The walkway between the belts never moves.
    expect(local(f, walker).z).toBeCloseTo(w0.z, 3);
  });

  it('throws the lever at 20 s: a 2 s klaxon (red belts), then the belts carry back to the chute', () => {
    const { f, b } = tockFight();
    run(f, T.leverFirst + 0.1);
    expect(b.castingAbility).toBe(TOCK_LEVER);
    for (const o of belts(f)) expect(o.templateId).toBe(FOUNDRY_BELT_TEMPLATES.alarm);
    run(f, T.leverCast);
    expect(b.castingAbility).not.toBe(TOCK_LEVER);
    expect(state(b).dirs).toEqual([-1, -1, -1, -1]);
    for (const o of belts(f)) {
      expect(o.templateId).toBe(FOUNDRY_BELT_TEMPLATES.run);
      expect(o.facing).toBeCloseTo(Math.PI, 6);
    }
    const rider = f.others[1];
    put(f, rider, B.xs[0], -20);
    run(f, 1);
    expect(local(f, rider).z).toBeLessThan(-20 - T.beltSpeed * 0.8);
    // The gauge restarts toward the next throw.
    expect(aura(b, TOCK_PRESSURE)?.duration).toBe(T.leverEvery);
  });

  it('the pressure gauge counts down to the lever throw', () => {
    const { f, b } = tockFight();
    run(f, 5);
    const gauge = aura(b, TOCK_PRESSURE);
    expect(gauge).toBeDefined();
    expect(gauge?.remaining ?? 0).toBeGreaterThan(T.leverFirst - 5 - 0.5);
    expect(gauge?.remaining ?? 0).toBeLessThan(T.leverFirst - 5 + 0.5);
  });
});

describe('Line-Master Tock: the Stamping Press', () => {
  it('paints a strip on a belt at 8 s, then stamps whoever is on it for 250 to 300 and a knockdown', () => {
    const { f, b } = tockFight();
    run(f, T.pressFirst + 0.05);
    const strip = objects(f, FOUNDRY_PRESS_STRIP);
    expect(strip).toHaveLength(1);
    expect(strip[0].scale).toBe(T.pressLength);
    const belt = state(b).press?.belt ?? -1;
    expect(belt).toBeGreaterThanOrEqual(0);
    const victim = f.others[1];
    const safe = f.others[0];
    const from = f.hits.length;
    run(f, T.pressWarning, () => {
      put(f, victim, B.xs[belt], B.z1 - 3);
      put(f, safe, B.xs[belt], B.z1 - T.pressLength - 3);
    });
    const hits = hitsOn(f, victim, 'Stamping Press', from);
    expect(hits).toHaveLength(1);
    expect(hits[0].amount).toBeGreaterThanOrEqual(T.pressMin);
    expect(hits[0].amount).toBeLessThanOrEqual(T.pressMax);
    expect(aura(victim, TOCK_FLATTENED)).toBeDefined();
    expect(hitsOn(f, safe, 'Stamping Press', from)).toHaveLength(0);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(0);
  });

  it('the belt carries the careless into the hammer', () => {
    const { f, b } = tockFight();
    run(f, 0.5);
    const st = tockState(f.sim.ctx, f.inst, b);
    const rider = f.others[1];
    // Standing 5 yd short of the strip, the belt brings the rider in within 2 s.
    put(f, rider, B.xs[2], B.z1 - T.pressLength - 5);
    const from = f.hits.length;
    startPress(f.sim.ctx, f.inst, b, st, 2);
    run(f, T.pressWarning + 0.1);
    expect(hitsOn(f, rider, 'Stamping Press', from)).toHaveLength(1);
  });

  it('crushes a Half-Built Frame under the hammer', () => {
    const { f, b } = tockFight();
    run(f, 0.2);
    b.hp = Math.floor(b.maxHp * 0.69);
    run(f, 0.1);
    const frames = live(f, HALF_BUILT_FRAME_ID);
    expect(frames).toHaveLength(T.partsCount);
    const st = state(b);
    const target = frames[0];
    const belt = B.xs.findIndex((x) => Math.abs(local(f, target).x - x) < 0.5);
    // The belt carries it 6 yd in the 2 s warning: it lands under the hammer.
    put(f, target, B.xs[belt], B.z1 - 7.5);
    startPress(f.sim.ctx, f.inst, b, st, belt);
    run(f, T.pressWarning + 0.1);
    expect(target.dead).toBe(true);
  });
});

describe('Line-Master Tock: Parts Drop and the Rivet Gun', () => {
  it('drops three booting frames onto the belts at 70 and 40 percent; they ride, then wake', () => {
    const { f, b } = tockFight();
    run(f, 0.2);
    b.hp = Math.floor(b.maxHp * 0.69);
    run(f, 0.1);
    const frames = live(f, HALF_BUILT_FRAME_ID);
    expect(frames).toHaveLength(T.partsCount);
    expect(f.lines).toContain(TOCK_LINES.partsLog);
    for (const fr of frames) expect(aura(fr, FRAME_BOOTING)).toBeDefined();
    const z0 = frames.map((fr) => local(f, fr).z);
    run(f, 2);
    frames.forEach((fr, i) => {
      expect(local(f, fr).z).toBeGreaterThan(z0[i] + 4);
    });
    run(f, T.frameBoot);
    for (const fr of frames) expect(aura(fr, FRAME_BOOTING)).toBeUndefined();
    // The second drop at 40, once.
    b.hp = Math.floor(b.maxHp * 0.39);
    run(f, 0.1);
    expect(live(f, HALF_BUILT_FRAME_ID).length).toBeGreaterThanOrEqual(T.partsCount + 1);
    expect(state(b).dropsFired).toBe(2);
  });

  it('the Rivet Gun: a 1 s bar, then a heavy hit on the one he fights', () => {
    const { f, b } = tockFight();
    run(f, T.rivetFirst + 0.05);
    expect(b.castingAbility).toBe(TOCK_RIVET_GUN);
    expect(b.castTargetId).toBe(f.tank.id);
    const from = f.hits.length;
    run(f, T.rivetCast + 0.1);
    const hits = hitsOn(f, f.tank, 'Rivet Gun', from);
    expect(hits).toHaveLength(1);
    // 1.4x his melee roll: above his weakest swing, never above 1.4x his hardest.
    expect(hits[0].amount).toBeLessThanOrEqual(Math.round(b.weapon.max * T.rivetMult));
    expect(hits[0].amount).toBeGreaterThan(0);
  });
});

describe('Line-Master Tock: heroic', () => {
  it('Overtime runs the belts at 5 yd a second', () => {
    const { f } = tockFight('heroic');
    run(f, 0.1);
    for (const o of belts(f)) expect(o.scale).toBe(T.overtimeSpeed);
    const rider = f.others[1];
    const z0 = local(f, rider).z;
    run(f, 1);
    expect(local(f, rider).z - z0).toBeGreaterThan(T.overtimeSpeed * 0.85);
  });

  it('Cross-Feed: neighbors start opposite, and a throw reverses only the two painted red', () => {
    const { f, b } = tockFight('heroic');
    run(f, 0.1);
    expect(state(b).dirs).toEqual([1, -1, 1, -1]);
    run(f, T.leverFirst);
    const pair = state(b).flipping;
    expect(pair).toHaveLength(2);
    const objs = belts(f);
    objs.forEach((o, i) => {
      expect(o.templateId).toBe(
        pair.includes(i) ? FOUNDRY_BELT_TEMPLATES.alarm : FOUNDRY_BELT_TEMPLATES.run,
      );
    });
    run(f, T.leverCast + 0.1);
    const dirs = state(b).dirs;
    [1, -1, 1, -1].forEach((d, i) => {
      expect(dirs[i]).toBe(pair.includes(i) ? -d : d);
    });
  });

  it('prices the press 2.5x on heroic', () => {
    const { f, b } = tockFight('heroic');
    run(f, 0.2);
    const st = state(b);
    const victim = f.others[0];
    const from = f.hits.length;
    startPress(f.sim.ctx, f.inst, b, st, 1);
    run(f, T.pressWarning + 0.1, () => put(f, victim, B.xs[1], B.z1 - 1));
    const hits = hitsOn(f, victim, 'Stamping Press', from);
    expect(hits).toHaveLength(1);
    expect(hits[0].amount).toBeGreaterThanOrEqual(Math.round(T.pressMin * 2.5));
    expect(hits[0].amount).toBeLessThanOrEqual(Math.round(T.pressMax * 2.5));
  });
});

describe('Line-Master Tock: reset and the deed', () => {
  it('a wipe stops the belts, lifts the strip, clears the frames and the state', () => {
    const { f, b } = tockFight();
    run(f, T.pressFirst + 0.1);
    b.hp = Math.floor(b.maxHp * 0.69);
    run(f, 0.1);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(1);
    wipe(f, b);
    run(f, 0.2);
    expect(b.foundryFight).toBeUndefined();
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(0);
    for (const o of belts(f)) expect(o.templateId).toBe(FOUNDRY_BELT_TEMPLATES.idle);
    expect(live(f, HALF_BUILT_FRAME_ID)).toHaveLength(0);
    expect(aura(b, TOCK_PRESSURE)).toBeUndefined();
  });

  it('Quality Control: a kill with nobody pressed earns the deed; a pressed one does not', () => {
    const clean = tockFight();
    run(clean.f, 1);
    clean.f.sim.ctx.handleDeath(clean.b, clean.f.tank);
    run(clean.f, 0.1);
    expect(earned(clean.f, clean.f.tank, TOCK_DEED)).toBe(true);

    const flubbed = tockFight();
    run(flubbed.f, 0.2);
    const st = state(flubbed.b);
    startPress(flubbed.f.sim.ctx, flubbed.f.inst, flubbed.b, st, 0);
    run(flubbed.f, T.pressWarning + 0.1, () =>
      put(flubbed.f, flubbed.f.others[1], B.xs[0], B.z1 - 1),
    );
    flubbed.f.sim.ctx.handleDeath(flubbed.b, flubbed.f.tank);
    run(flubbed.f, 0.1);
    expect(earned(flubbed.f, flubbed.f.tank, TOCK_DEED)).toBe(false);
  });
});
