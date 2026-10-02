// Line-Master Ambrel Tock (src/sim/encounters/stormbrass_foundry/line_master.ts):
// the G19 belts that carry the group, the lever that reverses them, the
// Stamping Press carriages that ride their rails to the riders, the Scalding
// Vents that make the walkways unsafe, the Parts Drop frames, the Rivet Gun,
// heroic Overtime, Cross-Feed and twin presses, the reset on a wipe and the
// Quality Control deed. Driven through
// full Sim ticks in a real claimed Foundry (tests/helpers/foundry_fight.ts).

import { describe, expect, it } from 'vitest';
import { MAIN_LINE, MAIN_LINE_BELTS } from '../src/sim/content/stormbrass_foundry_layout';
import {
  beltIndexAt,
  FOUNDRY_BELT_TEMPLATES,
  FOUNDRY_PRESS_STRIP,
  FOUNDRY_VENT_TEMPLATES,
  FRAME_BOOTING,
  HALF_BUILT_FRAME_ID,
  inPressStrip,
  leverPair,
  onWalkway,
  pressRailStops,
  pressStripCentre,
  startingDirs,
  TOCK_TUNING as T,
  TOCK_DEED,
  TOCK_FLATTENED,
  TOCK_ID,
  TOCK_LEVER,
  TOCK_LINES,
  TOCK_PRESSURE,
  TOCK_RIVET_GUN,
  TOCK_SCALDING_VENTS,
  walkwayStrips,
} from '../src/sim/encounters/stormbrass_foundry';
import {
  paintStrip,
  startPress,
  tockState,
} from '../src/sim/encounters/stormbrass_foundry/line_master';
import { startVents } from '../src/sim/encounters/stormbrass_foundry/scalding_vents';
import { DT, type Entity, type TockFightState } from '../src/sim/types';
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
  until,
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

describe('Line-Master Tock: the press rail (pure geometry)', () => {
  it('snaps a strip centre to the fixed rail stop nearest the asked spot, inside the belt run', () => {
    const stops = pressRailStops(B);
    // The press end first, then one rail step at a time toward the chute.
    expect(stops[0]).toBe(B.z1 - T.pressLength / 2);
    for (let i = 1; i < stops.length; i++) expect(stops[i - 1] - stops[i]).toBe(T.railStep);
    for (const zc of stops) {
      expect(zc - T.pressLength / 2).toBeGreaterThanOrEqual(B.z0);
      expect(zc + T.pressLength / 2).toBeLessThanOrEqual(B.z1);
    }
    expect(pressStripCentre(B, -20.3)).toBe(-21);
    expect(pressStripCentre(B, -19.8)).toBe(-19);
    // Past either end of the run, the carriage stops at the last rail stop.
    expect(pressStripCentre(B, 4)).toBe(stops[0]);
    expect(pressStripCentre(B, -60)).toBe(stops[stops.length - 1]);
    for (let z = -60; z <= 10; z += 0.37) {
      const zc = pressStripCentre(B, z);
      expect(stops).toContain(zc);
      expect(zc - T.pressLength / 2).toBeGreaterThanOrEqual(B.z0);
      expect(zc + T.pressLength / 2).toBeLessThanOrEqual(B.z1);
    }
  });

  it('a strip covers its belt from zc - length/2 to zc + length/2, and nothing else', () => {
    const zc = -21;
    expect(inPressStrip(B, 1, zc, B.xs[1], zc)).toBe(true);
    expect(inPressStrip(B, 1, zc, B.xs[1] + B.halfWidth - 0.1, zc + 3.9)).toBe(true);
    expect(inPressStrip(B, 1, zc, B.xs[1], zc + T.pressLength / 2 + 0.2)).toBe(false);
    expect(inPressStrip(B, 1, zc, B.xs[1], zc - T.pressLength / 2 - 0.2)).toBe(false);
    expect(inPressStrip(B, 1, zc, B.xs[0], zc)).toBe(false);
    expect(inPressStrip(B, 7, zc, B.xs[1], zc)).toBe(false);
  });

  it('the walkways are the Main Line floor between and beside the belts, inside their run', () => {
    const ways = walkwayStrips(MAIN_LINE, B);
    expect(ways).toHaveLength(B.xs.length + 1);
    expect(ways[0].x0).toBe(MAIN_LINE.x0);
    expect(ways[ways.length - 1].x1).toBe(MAIN_LINE.x1);
    for (const w of ways) {
      const mid = (w.x0 + w.x1) / 2;
      expect(onWalkway(MAIN_LINE, B, mid, -24)).toBe(true);
      expect(beltIndexAt(B, mid, -24)).toBe(-1);
    }
    for (const x of B.xs) expect(onWalkway(MAIN_LINE, B, x, -24)).toBe(false);
    // Beyond the belts' run (the press end, the chute end) the floor never vents.
    expect(onWalkway(MAIN_LINE, B, 0, B.z1 + 1)).toBe(false);
    expect(onWalkway(MAIN_LINE, B, 0, B.z0 - 1)).toBe(false);
    expect(onWalkway(MAIN_LINE, B, MAIN_LINE.x1 + 1, -24)).toBe(false);
  });
});

/** Tick until the first press strip is painted; the strip, or throw. */
function untilStrip(f: Fight, seconds: number, keep?: () => void): Entity {
  until(f, () => objects(f, FOUNDRY_PRESS_STRIP).length > 0, seconds, keep);
  const strip = objects(f, FOUNDRY_PRESS_STRIP)[0];
  if (!strip) throw new Error('no strip');
  return strip;
}

describe('Line-Master Tock: the Stamping Press rides its rail to you', () => {
  it('paints the first strip at 6 s, then every 7 s, each 2.5 s before its hammer lands', () => {
    const { f, b } = tockFight();
    run(f, T.pressFirst - 0.1);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(0);
    run(f, 0.15);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(1);
    expect(state(b).presses).toHaveLength(1);
    expect(state(b).presses[0].remaining).toBeGreaterThan(T.pressWarning - 0.2);
    run(f, T.pressWarning);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(0);
    run(f, T.pressEvery - T.pressWarning - 0.2);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(0);
    run(f, 0.3);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(1);
  });

  it('slides to the rider: the strip lands on the rail stop nearest where the belt carries them', () => {
    const { f, b } = tockFight();
    const rider = f.others[1];
    run(f, T.pressFirst - 0.5);
    // Only one rider, far down belt 1: nobody else stands on a belt.
    put(f, rider, B.xs[1], -35.6);
    const strip = untilStrip(f, 1);
    const at = local(f, rider).z;
    const led = at + T.beltSpeed * T.pressWarning;
    const zc = pressStripCentre(B, led);
    expect(state(b).presses[0].belt).toBe(1);
    expect(strip.pos.x - f.ox).toBeCloseTo(B.xs[1], 6);
    expect(strip.pos.z - f.oz).toBeCloseTo(zc, 6);
    expect(state(b).presses[0].zc).toBe(zc);
    // The hunt is real: far from the old fixed spot at the press end.
    expect(zc).toBeLessThan(B.z1 - T.pressLength / 2 - 10);
    // The rider who rides on is stamped: the belt brought them under it.
    const from = f.hits.length;
    run(f, T.pressWarning + 0.1);
    expect(hitsOn(f, rider, 'Stamping Press', from)).toHaveLength(1);
  });

  it('leads against a reversed belt and never leaves the run at either end', () => {
    const { f, b } = tockFight();
    run(f, 0.2);
    const st = state(b);
    st.dirs[2] = -1;
    const rider = f.others[1];
    put(f, rider, B.xs[2], -36);
    st.pressTimer = DT / 2;
    const strip = untilStrip(f, 0.5);
    // Carried toward the chute: the lead runs out past the run's end, so the
    // carriage stops at the last rail stop, still wholly over the belt.
    const stops = pressRailStops(B);
    expect(strip.pos.z - f.oz).toBeCloseTo(stops[stops.length - 1], 6);
    expect(strip.pos.z - f.oz - T.pressLength / 2).toBeGreaterThanOrEqual(B.z0);
  });

  it('stamps everyone on its strip for 250 to 300 and a knockdown, nobody off its ends', () => {
    const { f, b } = tockFight();
    run(f, 0.2);
    const st = state(b);
    expect(paintStrip(f.sim.ctx, f.inst, b, st, 2, -21)).toBe(true);
    const victim = f.others[1];
    const short = f.others[0];
    const past = f.others[2];
    const from = f.hits.length;
    run(f, T.pressWarning, () => {
      put(f, victim, B.xs[2], -21);
      put(f, short, B.xs[2], -21 - T.pressLength / 2 - 1);
      put(f, past, B.xs[2], -21 + T.pressLength / 2 + 1);
    });
    const hits = hitsOn(f, victim, 'Stamping Press', from);
    expect(hits).toHaveLength(1);
    expect(hits[0].amount).toBeGreaterThanOrEqual(T.pressMin);
    expect(hits[0].amount).toBeLessThanOrEqual(T.pressMax);
    expect(aura(victim, TOCK_FLATTENED)).toBeDefined();
    expect(hitsOn(f, short, 'Stamping Press', from)).toHaveLength(0);
    expect(hitsOn(f, past, 'Stamping Press', from)).toHaveLength(0);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(0);
  });

  it('the belt carries the careless into the hammer', () => {
    const { f, b } = tockFight();
    run(f, 0.5);
    const st = tockState(f.sim.ctx, f.inst, b);
    const rider = f.others[1];
    // Standing 5 yd short of the strip, the belt brings the rider in.
    put(f, rider, B.xs[2], -21 - T.pressLength / 2 - 5);
    const from = f.hits.length;
    paintStrip(f.sim.ctx, f.inst, b, st, 2, -21);
    run(f, T.pressWarning + 0.1);
    expect(hitsOn(f, rider, 'Stamping Press', from)).toHaveLength(1);
  });

  it('two strips never share a belt: a busy belt is passed over', () => {
    const { f, b } = tockFight();
    run(f, 0.2);
    const st = state(b);
    put(f, f.others[1], B.xs[0], -30);
    expect(startPress(f.sim.ctx, f.inst, b, st)).toEqual([0]);
    // The only rider still stands on belt 0, whose carriage is already out:
    // the next press works another belt, and a strip is never painted twice.
    const second = startPress(f.sim.ctx, f.inst, b, st);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(0);
    expect(paintStrip(f.sim.ctx, f.inst, b, st, 0, -11)).toBe(false);
    const used = st.presses.map((p) => p.belt);
    expect(new Set(used).size).toBe(used.length);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(2);
  });

  it('heroic: two carriages at once, on two different riders belts', () => {
    const { f, b } = tockFight('heroic');
    run(f, T.pressFirst - 0.5);
    put(f, f.others[1], B.xs[0], -30);
    put(f, f.others[2], B.xs[3], -30);
    run(f, 0.6);
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(T.heroicPresses);
    expect(
      state(b)
        .presses.map((p) => p.belt)
        .sort(),
    ).toEqual([0, 3]);
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
    // The belt carries it 7.5 yd in the warning: it lands under the hammer.
    put(f, target, B.xs[belt], -21 - T.pressLength / 2 - 6);
    paintStrip(f.sim.ctx, f.inst, b, st, belt, -21);
    run(f, T.pressWarning + 0.1);
    expect(target.dead).toBe(true);
  });
});

describe('Line-Master Tock: Scalding Vents (the walkways are not safe)', () => {
  /** Hold everyone where they stand through `seconds`. */
  function hold(f: Fight, seconds: number, spots: [Entity, number, number][]): void {
    run(f, seconds, () => {
      for (const [e, x, z] of spots) put(f, e, x, z);
    });
  }

  it('warns every walkway for 1.5 s, then scalds walkway standers each second for 5 s, never belt riders', () => {
    const { f } = tockFight();
    const walker = f.others[0];
    const rider = f.others[1];
    const beyond = f.others[2];
    const spots: [Entity, number, number][] = [
      [walker, -10, -30],
      [rider, B.xs[1], -30],
      [beyond, 0, B.z1 + 2],
      [f.tank, B.xs[2], -22],
    ];
    hold(f, T.ventFirst - 0.1, spots);
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.warn)).toHaveLength(0);
    hold(f, 0.15, spots);
    const warn = objects(f, FOUNDRY_VENT_TEMPLATES.warn);
    expect(warn).toHaveLength(B.xs.length + 1);
    for (const o of warn) expect(o.scale).toBe(B.z1 - B.z0);
    // The walker wears the warning; the rider and the one past the press do not.
    expect(aura(walker, TOCK_SCALDING_VENTS)?.value2).toBe(0);
    expect(aura(rider, TOCK_SCALDING_VENTS)).toBeUndefined();
    expect(aura(beyond, TOCK_SCALDING_VENTS)).toBeUndefined();
    // He yells as the first vents of the fight hiss (never again after).
    const yells = f.lines.filter((l) => l === TOCK_LINES.vents).length;
    expect(yells).toBeGreaterThan(0);
    const from = f.hits.length;
    hold(f, T.ventWarning - 0.2, spots);
    expect(hitsOn(f, walker, 'Scalding Vents', from)).toHaveLength(0);
    hold(f, 0.2, spots);
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.scald)).toHaveLength(B.xs.length + 1);
    expect(aura(walker, TOCK_SCALDING_VENTS)?.value2).toBe(1);
    hold(f, T.ventScald, spots);
    const burns = hitsOn(f, walker, 'Scalding Vents', from);
    expect(burns).toHaveLength(T.ventScald / T.ventTickEvery);
    for (const h of burns) {
      expect(h.amount).toBeGreaterThanOrEqual(T.ventMin);
      expect(h.amount).toBeLessThanOrEqual(T.ventMax);
      expect(h.school).toBe('fire');
    }
    expect(hitsOn(f, rider, 'Scalding Vents', from)).toHaveLength(0);
    expect(hitsOn(f, beyond, 'Scalding Vents', from)).toHaveLength(0);
    expect(hitsOn(f, f.tank, 'Scalding Vents', from)).toHaveLength(0);
    // The steam dies: the strips lift and the warning aura goes.
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.scald)).toHaveLength(0);
    expect(aura(walker, TOCK_SCALDING_VENTS)).toBeUndefined();
    // The next cycle warns again ventEvery after the first.
    hold(f, T.ventEvery - T.ventWarning - T.ventScald - 0.2, spots);
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.warn)).toHaveLength(0);
    hold(f, 0.3, spots);
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.warn)).toHaveLength(B.xs.length + 1);
    expect(f.lines.filter((l) => l === TOCK_LINES.vents)).toHaveLength(yells);
  });

  it('respects its warning: stepping off in time costs nothing, stepping on late still burns', () => {
    const { f } = tockFight();
    const leaver = f.others[0];
    const latecomer = f.others[2];
    run(f, T.ventFirst + 0.1, () => {
      put(f, leaver, -10, -30);
      put(f, latecomer, B.xs[3], -30);
    });
    expect(aura(leaver, TOCK_SCALDING_VENTS)).toBeDefined();
    expect(aura(latecomer, TOCK_SCALDING_VENTS)).toBeUndefined();
    const from = f.hits.length;
    // The leaver steps onto a belt before the steam; the latecomer steps off one.
    run(f, T.ventWarning + 1.05, () => {
      put(f, leaver, B.xs[1], -30);
      put(f, latecomer, 10, -30);
    });
    expect(aura(leaver, TOCK_SCALDING_VENTS)).toBeUndefined();
    expect(hitsOn(f, leaver, 'Scalding Vents', from)).toHaveLength(0);
    expect(hitsOn(f, latecomer, 'Scalding Vents', from).length).toBeGreaterThanOrEqual(1);
    expect(aura(latecomer, TOCK_SCALDING_VENTS)?.value2).toBe(1);
  });

  it('prices the steam 2.5x on heroic', () => {
    const { f } = tockFight('heroic');
    const walker = f.others[0];
    const from = f.hits.length;
    run(f, T.ventFirst + T.ventWarning + 0.2, () => put(f, walker, -10, -30));
    const burns = hitsOn(f, walker, 'Scalding Vents', from);
    expect(burns).toHaveLength(1);
    expect(burns[0].amount).toBeGreaterThanOrEqual(Math.round(T.ventMin * 2.5));
    expect(burns[0].amount).toBeLessThanOrEqual(Math.round(T.ventMax * 2.5));
  });

  it('startVents (the dev trigger) paints the warning at once', () => {
    const { f, b } = tockFight();
    run(f, 0.2);
    startVents(f.sim.ctx, f.inst, b, state(b));
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.warn)).toHaveLength(B.xs.length + 1);
    expect(state(b).vent.phase).toBe('warn');
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
    paintStrip(f.sim.ctx, f.inst, b, st, 1, -21);
    run(f, T.pressWarning + 0.1, () => put(f, victim, B.xs[1], -21));
    const hits = hitsOn(f, victim, 'Stamping Press', from);
    expect(hits).toHaveLength(1);
    expect(hits[0].amount).toBeGreaterThanOrEqual(Math.round(T.pressMin * 2.5));
    expect(hits[0].amount).toBeLessThanOrEqual(Math.round(T.pressMax * 2.5));
  });
});

describe('Line-Master Tock: reset and the deed', () => {
  it('a wipe stops the belts, lifts the strip and the vents, clears the frames and the state', () => {
    const { f, b } = tockFight();
    run(f, T.ventFirst + 0.1, () => put(f, f.others[0], -10, -30));
    startPress(f.sim.ctx, f.inst, b, state(b));
    b.hp = Math.floor(b.maxHp * 0.69);
    run(f, 0.1);
    expect(objects(f, FOUNDRY_PRESS_STRIP).length).toBeGreaterThanOrEqual(1);
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.warn)).toHaveLength(B.xs.length + 1);
    expect(aura(f.others[0], TOCK_SCALDING_VENTS)).toBeDefined();
    wipe(f, b);
    run(f, 0.2);
    expect(b.foundryFight).toBeUndefined();
    expect(objects(f, FOUNDRY_PRESS_STRIP)).toHaveLength(0);
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.warn)).toHaveLength(0);
    expect(objects(f, FOUNDRY_VENT_TEMPLATES.scald)).toHaveLength(0);
    expect(aura(f.others[0], TOCK_SCALDING_VENTS)).toBeUndefined();
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
    paintStrip(flubbed.f.sim.ctx, flubbed.f.inst, flubbed.b, st, 0, -21);
    run(flubbed.f, T.pressWarning + 0.1, () => put(flubbed.f, flubbed.f.others[1], B.xs[0], -21));
    flubbed.f.sim.ctx.handleDeath(flubbed.b, flubbed.f.tank);
    run(flubbed.f, 0.1);
    expect(earned(flubbed.f, flubbed.f.tank, TOCK_DEED)).toBe(false);
  });
});
