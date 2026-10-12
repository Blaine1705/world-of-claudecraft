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
  MARROW_ID,
  MARROW_MEASURE,
  MARROW_SHOVELFUL,
  MARROW_TUNING,
} from '../src/sim/encounters/hollow_crypt';
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
  it('measures the first grave at 2 s and swings the first Shovelful at 4 s', () => {
    expect(T.measureFirst).toBe(2);
    expect(T.shovelFirst).toBe(4);
    // The first grave is open before a level-appropriate party reaches his
    // first Toll, so the first bell already raises the dead.
    expect(T.measureFirst + T.measureCast + T.markSeconds).toBeLessThan(8);
    // The damage is what it was.
    expect([T.shovelMult, T.graveOpenMin, T.graveOpenMax, T.graveDirtPerSecond]).toEqual([
      1.5, 42, 52, 9,
    ]);
    expect([T.tollMin, T.tollMax, T.blowMult]).toEqual([30, 38, 1.0]);
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
