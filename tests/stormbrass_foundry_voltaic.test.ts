// The Voltaic Warden (src/sim/encounters/stormbrass_foundry/voltaic_warden.ts
// and voltaic_plating.ts): the G21 conduction plating (the wrong kind of damage
// is turned aside through combat/damage.ts and banked), the Discharge on the
// flip, the flip countdown on the plating aura (kept up through a stunned
// flip), the plated drones, Static Lash and its leap, the Coil Strike, heroic
// Rapid Cycling and Split Plating, the reset and the Grounded deed.

import { describe, expect, it } from 'vitest';
import {
  ARC_DRONE_ID,
  FOUNDRY_COIL_STRIKE_MARK,
  platingFacing,
  platingFor,
  platingOf,
  VOLTAIC_TUNING as T,
  tickFoundryEncounters,
  VOLTAIC_CHARGED,
  VOLTAIC_DEED,
  VOLTAIC_FLIP,
  VOLTAIC_GROUNDED,
  VOLTAIC_STATIC_LASH,
  VOLTAIC_STORED,
  VOLTAIC_WARDEN_ID,
} from '../src/sim/encounters/stormbrass_foundry';
import {
  flipPlating,
  launchPlatedDrones,
  startCoilStrike,
} from '../src/sim/encounters/stormbrass_foundry/voltaic_warden';
import type { Entity, VoltaicFightState } from '../src/sim/types';
import {
  aura,
  boss,
  earned,
  engage,
  type Fight,
  fight,
  hitsOn,
  live,
  objects,
  put,
  run,
  wipe,
} from './helpers/foundry_fight';

function wardenFight(difficulty: 'normal' | 'heroic' = 'normal'): { f: Fight; b: Entity } {
  const f = fight(difficulty);
  const b = boss(f, VOLTAIC_WARDEN_ID);
  put(f, b, 82, 24);
  put(f, f.tank, 82, 27);
  put(f, f.others[0], 70, 24);
  put(f, f.others[1], 94, 24);
  put(f, f.others[2], 82, 36);
  engage(f, b);
  return { f, b };
}

function state(b: Entity): VoltaicFightState {
  const st = b.foundryFight;
  if (st?.kind !== 'voltaic') throw new Error('no voltaic state');
  return st;
}

/** Hit the Warden directly through the real damage path. */
function strike(f: Fight, from: Entity, target: Entity, school: string, amount = 100): number {
  return f.sim.ctx.dealDamage(from, target, amount, false, school, 'Test Strike', 'hit');
}

describe('the Voltaic Warden: Conduction Plating (G21)', () => {
  it('reads the face a school needs and the split back half', () => {
    expect(platingFor('physical')).toBe('grounded');
    for (const s of ['frost', 'fire', 'nature', 'arcane', 'shadow', 'holy'])
      expect(platingFor(s)).toBe('charged');
    // Facing north (+z): an attacker to the south is behind it.
    expect(platingFacing('grounded', false, 0, 0, 0, 0, -5)).toBe('grounded');
    expect(platingFacing('grounded', true, 0, 0, 0, 0, 5)).toBe('grounded');
    expect(platingFacing('grounded', true, 0, 0, 0, 0, -5)).toBe('charged');
  });

  it('starts Grounded: physical lands, spells are turned aside and banked', () => {
    const { f, b } = wardenFight();
    run(f, 0.1);
    expect(aura(b, VOLTAIC_GROUNDED)).toBeDefined();
    const hp0 = b.hp;
    expect(strike(f, f.tank, b, 'physical', 120)).toBeGreaterThan(0);
    expect(b.hp).toBeLessThan(hp0);
    const hp1 = b.hp;
    const mage = f.others[0];
    expect(strike(f, mage, b, 'frost', 150)).toBe(0);
    expect(b.hp).toBe(hp1);
    expect(state(b).stored).toBe(150);
    expect(aura(b, VOLTAIC_STORED)?.stacks).toBe(150);
    // The turned-aside hit still holds its threat on the attacker.
    expect(b.threat.get(mage.id) ?? 0).toBeGreaterThan(0);
  });

  it('flips every 15 s after a 3 s rattle bar: then spells land and physical is banked', () => {
    const { f, b } = wardenFight();
    run(f, T.flipEvery - T.flipCast + 0.1);
    expect(b.castingAbility).toBe(VOLTAIC_FLIP);
    run(f, T.flipCast);
    expect(aura(b, VOLTAIC_CHARGED)).toBeDefined();
    expect(aura(b, VOLTAIC_GROUNDED)).toBeUndefined();
    expect(strike(f, f.others[0], b, 'frost', 100)).toBeGreaterThan(0);
    expect(strike(f, f.tank, b, 'physical', 100)).toBe(0);
    expect(state(b).stored).toBe(100);
  });

  it('the plating aura counts down to the flip, on the Warden and its drones alike', () => {
    const { f, b } = wardenFight();
    run(f, 5);
    const face = aura(b, VOLTAIC_GROUNDED);
    expect(face).toBeDefined();
    // A real clock the client mirrors (a deadline on the wire), not a
    // permanent aura.
    expect(face?.permanent).not.toBe(true);
    expect(face?.duration).toBe(T.flipEvery);
    expect(face?.remaining ?? 0).toBeCloseTo(T.flipEvery - 5, 1);
    launchPlatedDrones(f.sim.ctx, f.inst, b, state(b));
    run(f, 1);
    for (const d of live(f, ARC_DRONE_ID)) {
      const df = aura(d, VOLTAIC_CHARGED);
      expect(df?.duration).toBe(T.flipEvery);
      expect(df?.remaining ?? 0).toBeCloseTo(T.flipEvery - 6, 1);
    }
    // After the flip the new face counts down a fresh cycle.
    run(f, T.flipEvery - 6 + 0.5);
    expect(aura(b, VOLTAIC_CHARGED)?.remaining ?? 0).toBeCloseTo(T.flipEvery - 0.5, 1);
  });

  it('a Warden stunned past its flip keeps its plates up, then flips once the stun ends', () => {
    const { f, b } = wardenFight();
    run(f, T.flipEvery - T.flipCast - 1);
    // Straight onto the aura list: a boss shrugs off an ordinary stun, but an
    // encounter stun (an Overload, a scripted knockdown) holds it like this.
    b.auras.push({
      id: 'test_stun',
      name: 'Test Stun',
      kind: 'stun',
      remaining: 8,
      duration: 8,
      value: 0,
      sourceId: f.tank.id,
      school: 'physical',
    });
    for (let i = 0; i < 8 / 0.05; i++) {
      run(f, 0.05);
      const face = aura(b, VOLTAIC_GROUNDED);
      expect(face, `plating at tick ${i}`).toBeDefined();
      expect(face?.remaining ?? 0).toBeGreaterThan(0);
    }
    expect(aura(b, VOLTAIC_CHARGED)).toBeUndefined();
    run(f, 0.2);
    expect(b.castingAbility).toBe(VOLTAIC_FLIP);
    run(f, T.flipCast);
    expect(aura(b, VOLTAIC_CHARGED)).toBeDefined();
  });

  it('keeps its plates up through a pause (the tank lost for a moment)', () => {
    const { f, b } = wardenFight();
    run(f, T.flipEvery - T.flipCast - 2);
    const st = state(b);
    const held = st.flipTimer;
    // A Vanish or the tank falling: still in combat, no target, the fight
    // holds. Only the aura pass and the encounter tick run here, as they do on
    // a held tick: the plating's own clock must not run it out.
    for (let i = 0; i < 8 / 0.05; i++) {
      b.aggroTargetId = null;
      for (const a of b.auras) a.remaining -= 0.05;
      b.auras = b.auras.filter((a) => a.remaining > 0);
      tickFoundryEncounters(f.sim.ctx);
      expect(b.foundryFight).toBe(st);
      expect(platingOf(b)?.face, `plating at tick ${i}`).toBe('grounded');
    }
    expect(st.flipTimer).toBe(held);
  });

  it('the floored clock is topped up now and then, not re-stamped every tick', () => {
    const { f, b } = wardenFight();
    run(f, T.flipEvery - T.flipCast - 1);
    b.auras.push({
      id: 'test_stun',
      name: 'Test Stun',
      kind: 'stun',
      remaining: 6,
      duration: 6,
      value: 0,
      sourceId: f.tank.id,
      school: 'physical',
    });
    run(f, T.flipCast + 1.5);
    // Past the flip, stunned: the deadline (sim time + remaining) must hold
    // still between top-ups, or the wire resends the aura every snapshot.
    let moved = 0;
    let last = Number.NaN;
    for (let i = 0; i < 40; i++) {
      run(f, 0.05);
      const face = aura(b, VOLTAIC_GROUNDED);
      const deadline = Math.round((i * 0.05 + (face?.remaining ?? 0)) * 100);
      if (deadline !== last) moved++;
      last = deadline;
    }
    expect(moved).toBeLessThanOrEqual(8);
  });

  it('Discharge: 20 percent of the bank to everyone on the crown, capped at 400', () => {
    const { f, b } = wardenFight();
    run(f, 0.1);
    const st = state(b);
    st.stored = 1000;
    let from = f.hits.length;
    expect(flipPlating(f.sim.ctx, f.inst, b, st)).toBe(200);
    run(f, 0.05);
    for (const p of [f.tank, ...f.others]) {
      const hits = hitsOn(f, p, 'Discharge', from);
      expect(hits).toHaveLength(1);
      expect(hits[0].amount).toBe(200);
    }
    expect(st.stored).toBe(0);
    st.stored = 5000;
    from = f.hits.length;
    expect(flipPlating(f.sim.ctx, f.inst, b, st)).toBe(T.dischargeCap);
    run(f, 0.05);
    expect(hitsOn(f, f.tank, 'Discharge', from)[0]?.amount).toBe(T.dischargeCap);
  });

  it('launches two drones with the opposite plating every 25 s; they flip with it', () => {
    const { f, b } = wardenFight();
    run(f, T.dronesFirst + 0.1);
    const drones = live(f, ARC_DRONE_ID);
    expect(drones).toHaveLength(T.dronesCount);
    for (const d of drones) expect(platingOf(d)?.face).toBe('charged');
    // A drone takes the kind the Warden refuses.
    expect(strike(f, f.others[0], drones[0], 'frost', 10)).toBeGreaterThan(0);
    expect(strike(f, f.tank, drones[1], 'physical', 10)).toBe(0);
    flipPlating(f.sim.ctx, f.inst, b, state(b));
    for (const d of live(f, ARC_DRONE_ID)) expect(platingOf(d)?.face).toBe('grounded');
    launchPlatedDrones(f.sim.ctx, f.inst, b, state(b));
    expect(live(f, ARC_DRONE_ID)).toHaveLength(T.dronesCount * 2);
  });

  it('Static Lash hits the tank and leaps to the nearest player within 6 yd of them', () => {
    const { f, b } = wardenFight();
    put(f, f.others[0], 84, 29);
    run(f, T.lashFirst + 0.05, () => put(f, f.others[0], 84, 29));
    expect(b.castingAbility).toBe(VOLTAIC_STATIC_LASH);
    const from = f.hits.length;
    run(f, T.lashCast + 0.1, () => put(f, f.others[0], 84, 29));
    const tankHits = hitsOn(f, f.tank, 'Static Lash', from);
    expect(tankHits).toHaveLength(1);
    expect(tankHits[0].amount).toBeGreaterThanOrEqual(T.lashTankMin);
    expect(tankHits[0].amount).toBeLessThanOrEqual(T.lashTankMax);
    const leap = hitsOn(f, f.others[0], 'Static Lash', from);
    expect(leap).toHaveLength(1);
    expect(leap[0].amount).toBeGreaterThanOrEqual(T.lashChainMin);
    for (const far of [f.others[1], f.others[2]])
      expect(hitsOn(f, far, 'Static Lash', from)).toHaveLength(0);
  });

  it('Coil Strike marks a spot 4 yd wide and strikes it 1.6 s later', () => {
    const { f, b } = wardenFight();
    run(f, 0.1);
    const from = f.hits.length;
    expect(startCoilStrike(f.sim.ctx, f.inst, b, state(b))).toBe(true);
    const mark = objects(f, FOUNDRY_COIL_STRIKE_MARK);
    expect(mark).toHaveLength(1);
    expect(mark[0].scale).toBe(T.strikeRadius);
    run(f, T.strikeWarning + 0.1);
    expect(objects(f, FOUNDRY_COIL_STRIKE_MARK)).toHaveLength(0);
    const struck = [f.tank, ...f.others].filter(
      (p) => hitsOn(f, p, 'Coil Strike', from).length > 0,
    );
    expect(struck.length).toBeGreaterThanOrEqual(1);
    expect(struck.some((p) => p.id === f.tank.id)).toBe(false);
  });
});

describe('the Voltaic Warden: heroic', () => {
  it('Rapid Cycling flips every 10 s', () => {
    const { f, b } = wardenFight('heroic');
    run(f, T.rapidFlipEvery - T.flipCast + 0.1);
    expect(b.castingAbility).toBe(VOLTAIC_FLIP);
    run(f, T.flipCast);
    expect(aura(b, VOLTAIC_CHARGED)).toBeDefined();
  });

  it('Split Plating: from behind, the other kind lands', () => {
    const { f, b } = wardenFight('heroic');
    run(f, 0.1);
    expect(aura(b, VOLTAIC_GROUNDED)?.value2).toBe(1);
    b.facing = 0;
    const behind = f.others[2];
    put(f, behind, 82, 18);
    put(f, f.tank, 82, 27);
    // Grounded in front: the tank's physical lands, a frost bolt from the
    // front is banked; from behind it is the reverse.
    expect(strike(f, f.tank, b, 'physical', 50)).toBeGreaterThan(0);
    expect(strike(f, behind, b, 'physical', 50)).toBe(0);
    expect(strike(f, behind, b, 'frost', 50)).toBeGreaterThan(0);
  });
});

describe('the Voltaic Warden: reset and the deed', () => {
  it('a wipe drops the plating, the bank and the fight state', () => {
    const { f, b } = wardenFight();
    run(f, 0.1);
    strike(f, f.others[0], b, 'frost', 100);
    wipe(f, b);
    run(f, 0.2);
    expect(b.foundryFight).toBeUndefined();
    expect(aura(b, VOLTAIC_GROUNDED)).toBeUndefined();
    expect(aura(b, VOLTAIC_STORED)).toBeUndefined();
    // Out of its fight, the plating no longer turns anything aside.
    expect(platingOf(b)).toBeNull();
  });

  it('Grounded: a kill with no Discharge dealing damage earns it; a discharged one does not', () => {
    const clean = wardenFight();
    run(clean.f, T.flipEvery + 0.5);
    clean.f.sim.ctx.handleDeath(clean.b, clean.f.tank);
    run(clean.f, 0.1);
    expect(earned(clean.f, clean.f.tank, VOLTAIC_DEED)).toBe(true);

    const fed = wardenFight();
    run(fed.f, 0.1);
    strike(fed.f, fed.f.others[0], fed.b, 'frost', 500);
    run(fed.f, T.flipEvery);
    expect(state(fed.b).discharged).toBe(true);
    fed.f.sim.ctx.handleDeath(fed.b, fed.f.tank);
    run(fed.f, 0.1);
    expect(earned(fed.f, fed.f.tank, VOLTAIC_DEED)).toBe(false);
  });
});
