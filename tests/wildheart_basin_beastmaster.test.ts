// The Fanglord Beastmaster and his Great Jaguar in the Beast Pits
// (docs/design/dungeon-rework/wildheart_basin.md section 5.1,
// src/sim/encounters/wildheart_basin/beastmaster.ts and control_gate.ts):
// the shared health pool, Pack Bond, Stalk with the jaguar's bites and its
// control windows, the Beast Pit Quake, Call of the Hunt, Thickhide Ward,
// heroic Heel! and Frenzied Bond, the deed, and the reset. On a real claimed
// Basin with a real party (tests/helpers/wildheart_fight.ts).

import { describe, expect, it } from 'vitest';
import {
  BEAST_CALL_OF_THE_HUNT,
  BEAST_HEEL,
  BEAST_PACK_BOND,
  BEAST_PACK_BOND_FURY,
  BEAST_PIT_QUAKE,
  BEAST_RENDING_BITE,
  BEAST_STALKED,
  BEAST_THICKHIDE_WARD,
  BEAST_WARY_STUN,
  BEASTMASTER_DEED,
  BEASTMASTER_ID,
  bondReachFor,
  bondStrength,
  FANGLORD_JAGUAR_ID,
  BEAST_TUNING as T,
} from '../src/sim/encounters/wildheart_basin';
import type { Aura, Entity } from '../src/sim/types';
import {
  aura,
  boss,
  earned,
  engage,
  type Fight,
  fight,
  hitsOn,
  put,
  run,
  tick,
  until,
  wipe,
} from './helpers/wildheart_fight';

function pair(f: Fight): { bm: Entity; jag: Entity } {
  return { bm: boss(f, BEASTMASTER_ID), jag: boss(f, FANGLORD_JAGUAR_ID) };
}

/** The tank holds the master on the pits' north rim; the others spread south. */
function pull(f: Fight, pool = 1e5): { bm: Entity; jag: Entity } {
  const { bm, jag } = pair(f);
  put(f, bm, -86, 58);
  put(f, f.tank, -86, 61);
  put(f, jag, -82, 56);
  const spots: [number, number][] = [
    [-86, 22],
    [-104, 38],
    [-68, 38],
  ];
  f.others.forEach((p, i) => {
    put(f, p, spots[i][0], spots[i][1]);
  });
  engage(f, bm, pool);
  tick(f);
  return { bm, jag };
}

function control(kind: Aura['kind'], id: string, src: Entity): Aura {
  return {
    id,
    name: id,
    kind,
    remaining: 4,
    duration: 4,
    value: kind === 'slow' ? 0.5 : 0,
    sourceId: src.id,
    school: 'frost',
  };
}

describe('the shared health pool', () => {
  it('one pool: the jaguar takes its master size, and a hit on either comes off both', () => {
    const f = fight();
    const { bm, jag } = pull(f);
    expect(jag.maxHp).toBe(bm.maxHp);
    expect(jag.hp).toBe(bm.hp);
    // Apart first so Pack Bond does not halve the test hits.
    run(f, 5);
    const before = bm.hp;
    const onCat = f.sim.ctx.dealDamage(f.others[1], jag, 900, false, 'frost', 'Test', 'hit', true);
    tick(f);
    expect(bm.hp).toBe(before - onCat);
    expect(jag.hp).toBe(bm.hp);
    const onMaster = f.sim.ctx.dealDamage(f.tank, bm, 700, false, 'physical', 'Test', 'hit', true);
    tick(f);
    expect(jag.hp).toBe(before - onCat - onMaster);
  });

  it('they fall together, and the master pays his loot once', () => {
    const f = fight();
    const { bm, jag } = pull(f, 2000);
    run(f, 5);
    f.sim.ctx.dealDamage(f.others[1], jag, 50_000, false, 'frost', 'Test', 'hit', true);
    tick(f);
    expect(jag.dead).toBe(true);
    expect(bm.dead).toBe(true);
    expect(bm.wildheartFight).toBeUndefined();
  });
});

describe('Pack Bond', () => {
  it('within 15 yd both take half damage and deal a fifth more; apart it breaks', () => {
    const f = fight();
    const { bm, jag } = pull(f);
    expect(aura(bm, BEAST_PACK_BOND)?.value).toBe(T.bondDr);
    expect(aura(jag, BEAST_PACK_BOND_FURY)?.value).toBe(T.bondDamage);
    const bonded = f.sim.ctx.dealDamage(f.tank, bm, 1000, false, 'frost', 'Test', 'hit', true);
    expect(bonded).toBe(500);
    // The jaguar runs off after its prey: the bond breaks.
    expect(until(f, () => aura(bm, BEAST_PACK_BOND) === undefined, 8)).toBe(true);
    expect(aura(jag, BEAST_PACK_BOND)).toBeUndefined();
    expect(aura(jag, BEAST_PACK_BOND_FURY)).toBeUndefined();
  });

  it('heroic Frenzied Bond reaches 20 yd; the cord brightens as they close', () => {
    expect(bondReachFor(false)).toBe(15);
    expect(bondReachFor(true)).toBe(20);
    expect(bondStrength(18, bondReachFor(false))).toBe(0);
    expect(bondStrength(18, bondReachFor(true))).toBeGreaterThan(0);
    expect(bondStrength(2, 15)).toBeGreaterThan(bondStrength(12, 15));
    const f = fight('heroic');
    const { bm, jag } = pull(f);
    put(f, jag, -86, 40);
    jag.forcedTargetId = null;
    tick(f);
    // 18 yd apart: bonded on heroic.
    expect(Math.hypot(jag.pos.x - bm.pos.x, jag.pos.z - bm.pos.z)).toBeGreaterThan(15);
    expect(aura(bm, BEAST_PACK_BOND)).toBeDefined();
  });
});

describe('Stalk', () => {
  it('fixates a non-tank with the fang mark, ignores taunts, and bites with a bleed', () => {
    const f = fight();
    const { jag } = pull(f);
    expect(until(f, () => f.others.some((p) => aura(p, BEAST_STALKED)), 4)).toBe(true);
    const prey = f.others.find((p) => aura(p, BEAST_STALKED)) as Entity;
    expect(aura(f.tank, BEAST_STALKED)).toBeUndefined();
    expect(jag.aggroTargetId).toBe(prey.id);
    f.sim.ctx.applyTaunt(f.tank, jag);
    tick(f);
    expect(jag.aggroTargetId).toBe(prey.id);
    const from = f.hits.length;
    expect(until(f, () => hitsOn(f, prey, 'Jaguar Bite', from).length > 0, 8)).toBe(true);
    for (const h of hitsOn(f, prey, 'Jaguar Bite', from)) {
      expect(h.amount).toBeGreaterThanOrEqual(T.biteMin);
      expect(h.amount).toBeLessThanOrEqual(T.biteMax * (1 + T.bondDamage));
    }
    expect(aura(prey, BEAST_RENDING_BITE)?.kind).toBe('dot');
  });

  it('after 10 s it marks another prey', () => {
    const f = fight();
    pull(f);
    expect(until(f, () => f.others.some((p) => aura(p, BEAST_STALKED)), 4)).toBe(true);
    const first = f.others.find((p) => aura(p, BEAST_STALKED)) as Entity;
    run(f, T.stalkSeconds + 0.2);
    const next = f.others.find((p) => aura(p, BEAST_STALKED));
    expect(next).toBeDefined();
    expect(next?.id).not.toBe(first.id);
  });

  it('each kind of control lands once per 20 s window (stun, root, slow apart)', () => {
    const f = fight();
    const { jag } = pull(f);
    const mage = f.others[0];
    f.sim.ctx.applyAura(jag, control('stun', 'test_stun_a', mage));
    expect(aura(jag, 'test_stun_a')).toBeDefined();
    tick(f);
    expect(aura(jag, BEAST_WARY_STUN)).toBeDefined();
    f.sim.ctx.applyAura(jag, control('stun', 'test_stun_b', mage));
    expect(aura(jag, 'test_stun_b')).toBeUndefined();
    // Another kind still lands: its own window.
    f.sim.ctx.applyAura(jag, control('root', 'test_root', mage));
    expect(aura(jag, 'test_root')).toBeDefined();
    f.sim.ctx.applyAura(jag, control('slow', 'test_slow', mage));
    expect(aura(jag, 'test_slow')).toBeDefined();
    run(f, T.controlWindow + 0.2);
    expect(aura(jag, BEAST_WARY_STUN)).toBeUndefined();
    f.sim.ctx.applyAura(jag, control('stun', 'test_stun_c', mage));
    expect(aura(jag, 'test_stun_c')).toBeDefined();
  });
});

describe("the master's kit", () => {
  it('Beast Pit Quake: a 1.5 s bar, then 180 to 220 within 8 yd of him only', () => {
    const f = fight();
    const { bm } = pull(f);
    run(f, 4);
    f.sim.chat('/dev wildheart trigger quake', f.tank.id);
    expect(bm.castingAbility).toBe(BEAST_PIT_QUAKE);
    const from = f.hits.length;
    run(f, T.quakeCast + 0.1);
    const onTank = hitsOn(f, f.tank, 'Beast Pit Quake', from);
    expect(onTank.length).toBe(1);
    expect(onTank[0].amount).toBeGreaterThanOrEqual(T.quakeMin);
    expect(onTank[0].amount).toBeLessThanOrEqual(T.quakeMax * (1 + T.bondDamage));
    for (const p of f.others) expect(hitsOn(f, p, 'Beast Pit Quake', from)).toHaveLength(0);
  });

  it('Call of the Hunt quickens both; Thickhide Ward shields the jaguar', () => {
    const f = fight();
    const { bm, jag } = pull(f);
    f.sim.chat('/dev wildheart trigger hunt', f.tank.id);
    expect(aura(bm, BEAST_CALL_OF_THE_HUNT)?.value).toBe(T.huntHaste);
    expect(aura(jag, BEAST_CALL_OF_THE_HUNT)?.kind).toBe('buff_haste');
    f.sim.chat('/dev wildheart trigger ward', f.tank.id);
    expect(aura(jag, BEAST_THICKHIDE_WARD)?.value).toBe(T.wardAmount);
    expect(aura(bm, BEAST_THICKHIDE_WARD)).toBeUndefined();
  });

  it('the clocks fire on their own through a pull', () => {
    const f = fight();
    pull(f);
    run(f, 21);
    expect(f.fx).toContain(BEAST_PIT_QUAKE);
    expect(f.fx).toContain(BEAST_CALL_OF_THE_HUNT);
    expect(f.fx).toContain(BEAST_THICKHIDE_WARD);
    // Heel! is heroic only.
    expect(f.fx).not.toContain(BEAST_HEEL);
  });
});

describe('heroic Heel!', () => {
  it('a 2 s bar, then the jaguar lands at its master side', () => {
    const f = fight('heroic');
    const { bm, jag } = pull(f);
    run(f, 4);
    expect(Math.hypot(jag.pos.x - bm.pos.x, jag.pos.z - bm.pos.z)).toBeGreaterThan(10);
    f.sim.chat('/dev wildheart trigger heel', f.tank.id);
    expect(jag.castingAbility).toBe(BEAST_HEEL);
    expect(jag.castTargetId).toBe(bm.id);
    run(f, T.heelCast + 0.1);
    expect(Math.hypot(jag.pos.x - bm.pos.x, jag.pos.z - bm.pos.z)).toBeLessThan(6);
    expect(aura(bm, BEAST_PACK_BOND)).toBeDefined();
  });

  it('a stun on the crouching jaguar stops the leap', () => {
    const f = fight('heroic');
    const { bm, jag } = pull(f);
    run(f, 4);
    f.sim.chat('/dev wildheart trigger heel', f.tank.id);
    f.sim.ctx.applyAura(jag, control('stun', 'test_stun', f.others[0]));
    run(f, T.heelCast + 0.1);
    expect(jag.castingAbility).toBeNull();
    expect(Math.hypot(jag.pos.x - bm.pos.x, jag.pos.z - bm.pos.z)).toBeGreaterThan(8);
  });
});

describe('Divide and Conquer, and the reset', () => {
  it('kept apart (bond under 10 s), the kill earns the deed', () => {
    const f = fight();
    const { bm, jag } = pull(f, 3000);
    run(f, 6);
    f.sim.ctx.dealDamage(f.others[1], jag, 90_000, false, 'frost', 'Test', 'hit', true);
    tick(f);
    expect(bm.dead).toBe(true);
    expect(earned(f, f.tank, BEASTMASTER_DEED)).toBe(true);
  });

  it('left together, the kill earns no deed', () => {
    const f = fight();
    const { jag } = pull(f, 3000);
    // Everyone stands at the master's side, so the jaguar's prey keeps it bonded.
    for (const p of f.others) put(f, p, -84, 62);
    run(f, T.bondDeedSeconds + 1);
    f.sim.ctx.dealDamage(f.others[1], jag, 90_000, false, 'frost', 'Test', 'hit', true);
    tick(f);
    expect(jag.dead).toBe(true);
    expect(earned(f, f.tank, BEASTMASTER_DEED)).toBe(false);
  });

  it('a wipe drops the marks, the bond and the windows', () => {
    const f = fight();
    const { bm, jag } = pull(f);
    run(f, 4);
    wipe(f, bm, jag);
    run(f, 1);
    expect(bm.wildheartFight).toBeUndefined();
    expect(jag.wildheartFight).toBeUndefined();
    for (const p of f.others) expect(aura(p, BEAST_STALKED)).toBeUndefined();
    expect(aura(bm, BEAST_PACK_BOND)).toBeUndefined();
    expect(jag.forcedTargetId).toBeNull();
  });
});
