// The Stormbrass Foundry boss fights' edge cases (src/sim/encounters/
// stormbrass_foundry): a bar cut short still lands its turn (Tock's lever, the
// Prime Draft's Unbolt under an Overload), a cell carrier or a marked player
// who leaves the run stops feeding the fight, a stripped carry aura comes
// back, surviving drones shed their plating with the Warden, a turned-aside
// hit keeps its flat threat, and a one-tick loss of the boss's target holds
// the fight instead of resetting it.

import { describe, expect, it } from 'vitest';
import {
  ARC_DRONE_ID,
  DRAFT_BOLTED,
  DRAFT_CELL_CARRY,
  DRAFT_UNBOLT,
  FOUNDRY_CELL_TEMPLATES,
  PRIME_DRAFT_ID,
  RANGE_TARGET_LOCK,
  RANGEWARDEN_ID,
  DRAFT_TUNING as T,
  TOCK_ID,
  TOCK_LEVER,
  tickFoundryEncounters,
  VOLTAIC_WARDEN_ID,
} from '../src/sim/encounters/stormbrass_foundry';
import { startLever, tockState } from '../src/sim/encounters/stormbrass_foundry/line_master';
import {
  chargeCycle,
  draftState,
  overload,
  startUnbolt,
} from '../src/sim/encounters/stormbrass_foundry/prime_draft';
import { rangeState, startTargetLock } from '../src/sim/encounters/stormbrass_foundry/rangewarden';
import { platingOf } from '../src/sim/encounters/stormbrass_foundry/voltaic_plating';
import {
  launchPlatedDrones,
  voltaicState,
} from '../src/sim/encounters/stormbrass_foundry/voltaic_warden';
import { DT, type Entity } from '../src/sim/types';
import {
  aura,
  boss,
  engage,
  type Fight,
  fight,
  live,
  local,
  objects,
  put,
  run,
} from './helpers/foundry_fight';

function draftFight(): { f: Fight; b: Entity } {
  const f = fight();
  const b = boss(f, PRIME_DRAFT_ID);
  put(f, b, 0, 213);
  b.facing = Math.PI;
  put(f, f.tank, 0, 210);
  put(f, f.others[0], -12, 196);
  put(f, f.others[1], 12, 196);
  put(f, f.others[2], 0, 188);
  engage(f, b);
  run(f, T.awakenCast + 0.1);
  return { f, b };
}

/** Hand a fresh cell to `p` (the real pick-up command). */
function carry(f: Fight, b: Entity, p: Entity): void {
  chargeCycle(f.sim.ctx, f.inst, b, draftState(f.sim.ctx, f.inst, b));
  const [cell] = objects(f, FOUNDRY_CELL_TEMPLATES.ready);
  put(f, p, local(f, cell).x + 1, local(f, cell).z);
  expect(f.sim.pickUpObject(cell.id, p.id)).toBe(true);
  expect(aura(p, DRAFT_CELL_CARRY)).toBeDefined();
}

describe('the Foundry bosses: a bar cut short still lands its turn', () => {
  it('an Overload mid-Unbolt: once the stun ends the Draft tears free all the same', () => {
    const { f, b } = draftFight();
    const st = draftState(f.sim.ctx, f.inst, b);
    startUnbolt(f.sim.ctx, b, st);
    run(f, 0.5);
    overload(f.sim.ctx, b, st, true);
    expect(b.castingAbility).toBeNull();
    expect(aura(b, DRAFT_BOLTED)).toBeDefined();
    run(f, T.overloadStun + 0.2);
    expect(b.castingAbility).toBe(DRAFT_UNBOLT);
    run(f, T.unboltCast + 0.1);
    expect(aura(b, DRAFT_BOLTED)).toBeUndefined();
    expect(b.moveSpeed).toBe(T.unboltedSpeed);
  });

  it("Tock's lever cut short still reverses the belts it painted red", () => {
    const f = fight();
    const b = boss(f, TOCK_ID);
    put(f, b, 0, -22);
    put(f, f.tank, 0, -20);
    engage(f, b);
    run(f, 1);
    const st = tockState(f.sim.ctx, f.inst, b);
    const before = [...st.dirs];
    startLever(f.sim.ctx, f.inst, b, st);
    const flipping = [...st.flipping];
    expect(flipping.length).toBeGreaterThan(0);
    expect(b.castingAbility).toBe(TOCK_LEVER);
    // An interrupt clears the bar.
    b.castingAbility = null;
    b.castRemaining = 0;
    run(f, DT);
    expect(st.flipping).toEqual([]);
    for (const i of flipping) expect(st.dirs[i]).toBe(-before[i]);
  });
});

describe('the Foundry bosses: a player who leaves the run', () => {
  it('a cell carrier who leaves alive takes nothing with them: the cell and the carry go', () => {
    const { f, b } = draftFight();
    const runner = f.others[0];
    carry(f, b, runner);
    // Hearthed out: far outside the claim.
    put(f, runner, 0, -900);
    run(f, 2 * DT);
    expect(aura(runner, DRAFT_CELL_CARRY)).toBeUndefined();
    expect(draftState(f.sim.ctx, f.inst, b).cells).toHaveLength(0);
  });

  it('a stripped carry aura is worn again while the cell is held', () => {
    const { f, b } = draftFight();
    const runner = f.others[0];
    carry(f, b, runner);
    runner.auras = runner.auras.filter((a) => a.id !== DRAFT_CELL_CARRY);
    run(f, 2 * DT);
    expect(aura(runner, DRAFT_CELL_CARRY)?.value).toBe(T.carrySlow);
  });

  it('a marked player who leaves the run is no longer shelled, and loses the crosshair', () => {
    const f = fight();
    const b = boss(f, RANGEWARDEN_ID);
    put(f, b, -82, 0);
    put(f, f.tank, -82, -2);
    put(f, f.others[0], -60, -15);
    put(f, f.others[1], -104, 8);
    put(f, f.others[2], -60, 8);
    engage(f, b);
    run(f, 0.5);
    const st = rangeState(f.sim.ctx, f.inst, b);
    startTargetLock(f.sim.ctx, f.inst, b, st);
    const marked = [f.tank, ...f.others].filter((p) => aura(p, RANGE_TARGET_LOCK));
    expect(marked.length).toBeGreaterThan(0);
    const gone = marked[0];
    put(f, gone, 0, -900);
    run(f, 2 * DT);
    expect(aura(gone, RANGE_TARGET_LOCK)).toBeUndefined();
    expect(st.marks.some((m) => m.playerId === gone.id)).toBe(false);
  });
});

describe('the Voltaic Warden: plating outside the fight', () => {
  function wardenFight(): { f: Fight; b: Entity } {
    const f = fight();
    const b = boss(f, VOLTAIC_WARDEN_ID);
    put(f, b, 82, 24);
    put(f, f.tank, 82, 27);
    put(f, f.others[0], 70, 24);
    put(f, f.others[1], 94, 24);
    put(f, f.others[2], 82, 36);
    engage(f, b);
    run(f, 0.5);
    return { f, b };
  }

  it('drones that outlive the Warden shed their plating with it', () => {
    const { f, b } = wardenFight();
    launchPlatedDrones(f.sim.ctx, f.inst, b, voltaicState(f.sim.ctx, f.inst, b));
    const drones = live(f, ARC_DRONE_ID);
    expect(drones.length).toBeGreaterThan(0);
    for (const d of drones) expect(platingOf(d)).not.toBeNull();
    f.sim.ctx.handleDeath(b, f.tank);
    run(f, 2 * DT);
    for (const d of live(f, ARC_DRONE_ID)) expect(platingOf(d)).toBeNull();
  });

  it('a turned-aside hit keeps its flat threat', () => {
    const { f, b } = wardenFight();
    const mage = f.others[0];
    const hit = (flat?: number) => {
      const was = b.threat.get(mage.id) ?? 0;
      const dealt = f.sim.ctx.dealDamage(mage, b, 100, false, 'frost', 'Test', 'hit', false, {
        flat,
      });
      expect(dealt).toBe(0);
      return (b.threat.get(mage.id) ?? 0) - was;
    };
    const plain = hit();
    const withFlat = hit(500);
    expect(plain).toBeGreaterThan(0);
    expect(withFlat - plain).toBeCloseTo(500 * f.sim.ctx.threatMod(mage, 'frost'), 6);
  });
});

describe('the Foundry bosses: a blip in the target holds the fight', () => {
  it("a one-tick loss of Tock's target keeps the fight state; an evade ends it", () => {
    const f = fight();
    const b = boss(f, TOCK_ID);
    put(f, b, 0, -22);
    put(f, f.tank, 0, -20);
    engage(f, b);
    run(f, 1);
    const st = tockState(f.sim.ctx, f.inst, b);
    st.levers = 7;
    // A Vanish: the target drops for a tick, the boss still in combat.
    b.aggroTargetId = null;
    tickFoundryEncounters(f.sim.ctx);
    expect(b.foundryFight).toBe(st);
    expect(st.levers).toBe(7);
    b.inCombat = false;
    b.aiState = 'evade';
    tickFoundryEncounters(f.sim.ctx);
    expect(b.foundryFight).toBeUndefined();
  });
});
