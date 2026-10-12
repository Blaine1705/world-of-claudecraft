// Sexton Marrow's mechanics in the kills a playtest gives him (2026-10-12:
// "Sexton Marrow mechanics didn't go off"). His kit started on every pull, but
// too late for a strong party: the first Shovelful waited 6 s and the first
// grave 14 s of fight time that the Burial Toll freezes, and a Toll that came
// due mid-bar threw that bar away for its whole cadence. A real five player
// kill, through sim.tick(), on his real pool, at two paces and both
// difficulties: every mechanic goes off at least once.

import { describe, expect, it, vi } from 'vitest';
import {
  BELL_YARD,
  MARROW_BONES_RISE,
  MARROW_BURIAL_TOLL,
  MARROW_GRAVE_OPENS,
  MARROW_GRAVEDIGGERS_BLOW,
  MARROW_ID,
  MARROW_MEASURE,
  MARROW_SHOVELFUL,
  MARROW_TUNING,
} from '../src/sim/encounters/hollow_crypt';
import { combatProfileForMob } from '../src/sim/mob_combat';
import { DT, type Entity } from '../src/sim/types';
import {
  boss,
  cryptFight,
  type Fight,
  put,
  run,
  tick,
  took,
  until,
} from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 240_000 });

const T = MARROW_TUNING;
const KEEP = new Set([MARROW_ID]);
const MID = { x: BELL_YARD.x, z: BELL_YARD.z };

interface Seen {
  seconds: number;
  shovelBars: number;
  measureBars: number;
  graves: number;
  tollRings: number;
  bones: number;
}

/** The party in the yard: the tank on him, four on the rim. */
function yard(difficulty: 'normal' | 'heroic'): { f: Fight; marrow: Entity; hold: () => void } {
  const f = cryptFight(difficulty, 4, KEEP);
  const marrow = boss(f, MARROW_ID);
  const party = [f.tank, ...f.others];
  const spots = [
    [MID.x, MID.z + 3.5],
    [MID.x - 14, MID.z - 9],
    [MID.x + 14, MID.z - 9],
    [MID.x - 14, MID.z + 11],
    [MID.x + 14, MID.z + 11],
  ];
  const hold = () => {
    for (const [i, p] of party.entries()) put(f, p, spots[i][0], spots[i][1]);
  };
  hold();
  f.sim.ctx.aggroMob(marrow, f.tank, false);
  return { f, marrow, hold };
}

/** Kill him for real at a steady pace: `damageSeconds` of party damage on his
 *  live pool (his two Tolls, immune, come on top), dealt through the damage
 *  path twice a second. */
function kill(difficulty: 'normal' | 'heroic', damageSeconds: number): { f: Fight; seen: Seen } {
  const { f, marrow, hold } = yard(difficulty);
  const party = [f.tank, ...f.others];
  const chunk = Math.ceil(marrow.maxHp / (damageSeconds * 2 * party.length));
  const seen: Seen = {
    seconds: 0,
    shovelBars: 0,
    measureBars: 0,
    graves: 0,
    tollRings: 0,
    bones: 0,
  };
  let last: string | null = null;
  let ticks = 0;
  for (; ticks < 120 / DT && !marrow.dead; ticks++) {
    if (ticks % 10 === 0) {
      for (const p of party) {
        if (marrow.dead) break;
        f.sim.ctx.dealDamage(p, marrow, chunk, false, 'physical', null, 'hit', false, {
          mult: p === f.tank ? 8 : 1,
        });
      }
    }
    tick(f, hold);
    const casting = marrow.castingAbility;
    if (casting !== last) {
      if (casting === MARROW_SHOVELFUL) seen.shovelBars++;
      else if (casting === MARROW_MEASURE) seen.measureBars++;
      else if (casting === MARROW_BURIAL_TOLL) seen.tollRings++;
      last = casting;
    }
  }
  expect(marrow.dead).toBe(true);
  seen.seconds = ticks * DT;
  seen.graves = f.cues.filter((c) => c.ability === MARROW_GRAVE_OPENS).length;
  seen.bones = f.cues.filter((c) => c.ability === MARROW_BONES_RISE).length;
  return { f, seen };
}

function expectWholeKit(f: Fight, seen: Seen, difficulty: 'normal' | 'heroic'): void {
  // Shovelful landed on the tank in front of him.
  expect(seen.shovelBars).toBeGreaterThanOrEqual(1);
  expect(took(f, f.tank, 'Shovelful')).toBeGreaterThan(0);
  // Measured for the Grave marked somebody and the grave caved in.
  expect(seen.measureBars).toBeGreaterThanOrEqual(1);
  expect(seen.graves).toBeGreaterThanOrEqual(1);
  // Both Tolls rang on everyone, and a grave gave up its dead.
  expect(seen.tollRings).toBe(T.tollAt.length);
  expect(
    f.hits.filter((h) => h.targetId === f.tank.id && h.ability === 'Burial Toll'),
  ).toHaveLength(T.tollAt.length);
  expect(seen.bones).toBeGreaterThanOrEqual(1);
  if (difficulty === 'heroic') expect(took(f, f.tank, "Gravedigger's Blow")).toBeGreaterThan(0);
}

describe('Sexton Marrow: his first uses come early', () => {
  it('measures at 2 s, swings the first Shovelful at 4 s and opens the first grave at 7 s', () => {
    const { f, marrow, hold } = yard('normal');
    marrow.maxHp = 1e6;
    marrow.hp = marrow.maxHp;
    const at = { measure: -1, shovel: -1, grave: -1 };
    let victimId = -1;
    for (let t = DT; t < 9; t += DT) {
      tick(f, hold);
      if (at.measure < 0 && marrow.castingAbility === MARROW_MEASURE) {
        at.measure = t;
        victimId = marrow.castTargetId ?? -1;
      }
      if (at.shovel < 0 && marrow.castingAbility === MARROW_SHOVELFUL) at.shovel = t;
      if (at.grave < 0 && f.cues.some((c) => c.ability === MARROW_GRAVE_OPENS)) at.grave = t;
    }
    // Seconds into the fight, to a few ticks (it was 9, 6 and 14).
    expect(at.measure).toBeGreaterThan(2 - DT / 2);
    expect(at.measure).toBeLessThan(2.25);
    expect(at.shovel).toBeGreaterThan(4 - DT / 2);
    expect(at.shovel).toBeLessThan(4.25);
    expect(at.grave).toBeGreaterThan(7 - DT / 2);
    expect(at.grave).toBeLessThan(7.4);
    // The damage is what it was: the cave-in's 42 to 52 on its mark, and the
    // Shovelful one and a half of his 32 to 50 swing, less the tank's armor.
    const caveIn = f.hits.filter((h) => h.targetId === victimId && h.ability === 'Open Grave');
    expect(caveIn).toHaveLength(1);
    expect(caveIn[0].amount).toBeGreaterThanOrEqual(42);
    expect(caveIn[0].amount).toBeLessThanOrEqual(52);
    const spade = f.hits.filter((h) => h.targetId === f.tank.id && h.ability === 'Shovelful');
    expect(spade).toHaveLength(1);
    expect(spade[0].amount).toBeGreaterThan(0);
    expect(spade[0].amount).toBeLessThanOrEqual(Math.round(50 * 1.5));
  });
});

for (const difficulty of ['normal', 'heroic'] as const) {
  describe(`Sexton Marrow killed for real (${difficulty})`, () => {
    it('shows his whole kit in a kill of about a minute', () => {
      const { f, seen } = kill(difficulty, 46);
      expect(seen.seconds).toBeGreaterThan(50);
      expect(seen.seconds).toBeLessThan(75);
      expectWholeKit(f, seen, difficulty);
    });

    it('still shows his whole kit when a strong party kills him in under half a minute', () => {
      const { f, seen } = kill(difficulty, 12);
      expect(seen.seconds).toBeLessThan(30);
      expectWholeKit(f, seen, difficulty);
    });
  });
}

describe('Sexton Marrow: a Toll that comes due mid-bar', () => {
  it('lets the bar land first, then strides to the rope', () => {
    const { f, marrow, hold } = yard('normal');
    marrow.maxHp = 1e6;
    marrow.hp = marrow.maxHp;
    expect(
      until(f, () => marrow.castingAbility === MARROW_SHOVELFUL, T.shovelFirst + 1, hold),
    ).toBe(true);
    const st = marrow.cryptBossFight;
    if (st?.kind !== 'marrow') throw new Error('no fight');
    // He drops under two thirds halfway through the swing.
    run(f, T.shovelCast / 2, hold);
    marrow.hp = Math.floor(marrow.maxHp * 0.6);
    const from = f.hits.length;
    run(f, DT * 2, hold);
    expect(st.toll).toBeNull();
    expect(marrow.castingAbility).toBe(MARROW_SHOVELFUL);
    expect(until(f, () => st.toll !== null, T.shovelCast, hold)).toBe(true);
    expect(took(f, f.tank, 'Shovelful', from)).toBeGreaterThan(0);
    expect(st.tolls).toBe(1);
    expect(marrow.damageImmune).toBe(true);
  });
});

describe('Sexton Marrow: a Shovelful that came due while he rang', () => {
  it('walks back to the one he fights before he swings, and never flings dirt at nobody', () => {
    const { f, marrow, hold } = yard('normal');
    marrow.maxHp = 1e6;
    marrow.hp = marrow.maxHp;
    run(f, DT * 2, hold);
    const st = marrow.cryptBossFight;
    if (st?.kind !== 'marrow') throw new Error('no fight');
    // The Toll begins with the spade already due; the grave is not.
    st.shovelTimer = 0;
    st.measureTimer = 99;
    marrow.hp = Math.floor(marrow.maxHp * 0.6);
    run(f, DT * 2, hold);
    expect(st.toll).not.toBeNull();
    expect(until(f, () => st.toll === null, T.tollStrideMax + T.tollRing + 1, hold)).toBe(true);
    // He stands at the rope, out of the cone's reach of his tank.
    const gap = () => Math.hypot(marrow.pos.x - f.tank.pos.x, marrow.pos.z - f.tank.pos.z);
    expect(gap()).toBeGreaterThan(T.shovelRange);
    const from = f.hits.length;
    expect(until(f, () => marrow.castingAbility === MARROW_SHOVELFUL, 6, hold)).toBe(true);
    expect(gap()).toBeLessThanOrEqual(T.shovelRange - T.shovelReachMargin + 1e-6);
    expect(until(f, () => marrow.castingAbility === null, T.shovelCast + 0.2, hold)).toBe(true);
    expect(took(f, f.tank, 'Shovelful', from)).toBeGreaterThan(0);
  });
});

describe("Sexton Marrow: a Gravedigger's Blow that came due while he rang (heroic)", () => {
  /** A Toll with the Blow (and, on request, the spade) due as it ends. */
  function afterToll(spadeDue: boolean) {
    const { f, marrow, hold } = yard('heroic');
    marrow.maxHp = 1e6;
    marrow.hp = marrow.maxHp;
    run(f, DT * 2, hold);
    const st = marrow.cryptBossFight;
    if (st?.kind !== 'marrow') throw new Error('no fight');
    st.shovelTimer = 99;
    st.measureTimer = 99;
    st.blowTimer = 99;
    marrow.hp = Math.floor(marrow.maxHp * 0.6);
    run(f, DT * 2, hold);
    expect(st.toll).not.toBeNull();
    // His timers wait on the Toll: both come due the tick it ends.
    st.blowTimer = 0;
    if (spadeDue) st.shovelTimer = 0;
    expect(until(f, () => st.toll === null, T.tollStrideMax + T.tollRing + 1, hold)).toBe(true);
    const gap = () => Math.hypot(marrow.pos.x - f.tank.pos.x, marrow.pos.z - f.tank.pos.z);
    // He stands at the rope, far out of reach of the tank in the yard's centre.
    expect(gap()).toBeGreaterThan(T.shovelRange);
    return { f, marrow, hold, gap };
  }

  it('walks back to his tank before he strikes, never from the bell rope', () => {
    const { f, marrow, hold, gap } = afterToll(false);
    const from = f.hits.length;
    expect(until(f, () => marrow.castingAbility === MARROW_GRAVEDIGGERS_BLOW, 6, hold)).toBe(true);
    expect(gap()).toBeLessThanOrEqual(T.shovelRange - T.shovelReachMargin + 1e-6);
    expect(until(f, () => marrow.castingAbility === null, T.blowCast + 0.2, hold)).toBe(true);
    expect(took(f, f.tank, "Gravedigger's Blow", from)).toBeGreaterThan(0);
  });

  it('keeps the spade first when both are due and he is out of reach', () => {
    const { f, marrow, hold } = afterToll(true);
    expect(until(f, () => marrow.castingAbility !== null, 6, hold)).toBe(true);
    expect(marrow.castingAbility).toBe(MARROW_SHOVELFUL);
  });
});

describe("Sexton Marrow: the spade's gate covers his melee reach", () => {
  it('swings the Shovelful at a tank who keeps to the very edge of his melee reach', () => {
    const { f, marrow, hold } = yard('normal');
    marrow.maxHp = 1e6;
    marrow.hp = marrow.maxHp;
    const reach = combatProfileForMob(MARROW_ID, marrow.scale).meleeRange;
    // The gate (6 yd) lies outside the farthest spot he swings from (5 yd).
    expect(T.shovelRange - T.shovelReachMargin).toBeGreaterThan(reach);
    // The tank backs off every tick to stay at the edge of his reach, however
    // he closes: the farthest a target can stand while he keeps swinging.
    const seat = () => {
      hold();
      put(f, f.tank, marrow.pos.x - f.ox, marrow.pos.z - f.oz - (reach - 0.05));
    };
    const gap = () => Math.hypot(marrow.pos.x - f.tank.pos.x, marrow.pos.z - f.tank.pos.z);
    const from = f.hits.length;
    expect(
      until(f, () => marrow.castingAbility === MARROW_SHOVELFUL, T.shovelFirst + 0.5, seat),
    ).toBe(true);
    expect(gap()).toBeLessThanOrEqual(reach);
    // His melee landed from there before the spade came: he was swinging.
    const melee = f.hits.slice(from).filter((h) => h.targetId === f.tank.id && h.ability === null);
    expect(melee.length).toBeGreaterThan(0);
    // Planted for the bar, the tank still at the edge of his reach.
    const stay = [f.tank.pos.x - f.ox, f.tank.pos.z - f.oz];
    const still = () => {
      hold();
      put(f, f.tank, stay[0], stay[1]);
    };
    expect(until(f, () => marrow.castingAbility === null, T.shovelCast + 0.2, still)).toBe(true);
    expect(took(f, f.tank, 'Shovelful', from)).toBeGreaterThan(0);
  });
});
