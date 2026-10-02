// The Prime Draft (src/sim/encounters/stormbrass_foundry/prime_draft.ts and
// storm_cells.ts): the G12 storm cells (eject, take with the interact command,
// Static and the slow, drop and the retake lock, slot into the open hatch for
// an Overload, arc back off a closed one, short out), the Core Hatch window,
// the three phases (Bolted, Unbolted, Heartless) and their abilities, the
// enrage, heroic Jammed Racks and Double Load, the reset, the Draft Record
// and the Heartless deed.

import { describe, expect, it } from 'vitest';
import { CELL_RACKS, GANTRY } from '../src/sim/content/stormbrass_foundry_layout';
import {
  carriedCell,
  DRAFT_ARM_SWEEP,
  DRAFT_AWAKEN,
  DRAFT_BOLTED,
  DRAFT_CELL_CARRY,
  DRAFT_ENRAGE,
  DRAFT_OVERLOAD,
  DRAFT_OVERLOADED,
  DRAFT_RECORD_ITEM,
  DRAFT_TREMOR_STEP,
  DRAFT_UNBOLT,
  FOUNDRY_CELL_TEMPLATES,
  FOUNDRY_FIST_MARK,
  FOUNDRY_HATCH_TEMPLATES,
  hatchRingCentre,
  hatchStateAt,
  PRIME_DRAFT_DEED,
  PRIME_DRAFT_ID,
  staticPerSecond,
  DRAFT_TUNING as T,
} from '../src/sim/encounters/stormbrass_foundry';
import {
  chargeCycle,
  draftState,
  overload,
  startPistonFist,
} from '../src/sim/encounters/stormbrass_foundry/prime_draft';
import type { Entity, PrimeDraftFightState } from '../src/sim/types';
import {
  aura,
  boss,
  earned,
  engage,
  type Fight,
  fight,
  hitsOn,
  local,
  objects,
  put,
  run,
  wipe,
} from './helpers/foundry_fight';

function draftFight(difficulty: 'normal' | 'heroic' = 'normal'): { f: Fight; b: Entity } {
  const f = fight(difficulty);
  const b = boss(f, PRIME_DRAFT_ID);
  put(f, b, 0, 213);
  b.facing = Math.PI;
  put(f, f.tank, 0, 210);
  put(f, f.others[0], -12, 196);
  put(f, f.others[1], 12, 196);
  put(f, f.others[2], 0, 188);
  engage(f, b);
  return { f, b };
}

function state(b: Entity): PrimeDraftFightState {
  const st = b.foundryFight;
  if (st?.kind !== 'prime_draft') throw new Error('no prime draft state');
  return st;
}

/** Wake it and skip to the bolted fight. */
function awake(f: Fight, b: Entity): PrimeDraftFightState {
  run(f, T.awakenCast + 0.1);
  return state(b);
}

function cells(f: Fight): Entity[] {
  return [
    ...objects(f, FOUNDRY_CELL_TEMPLATES.ready),
    ...objects(f, FOUNDRY_CELL_TEMPLATES.rolling),
  ];
}

function hatchTemplate(f: Fight): string | undefined {
  return [
    ...objects(f, FOUNDRY_HATCH_TEMPLATES.closed),
    ...objects(f, FOUNDRY_HATCH_TEMPLATES.warn),
    ...objects(f, FOUNDRY_HATCH_TEMPLATES.open),
  ][0]?.templateId;
}

/** Cut whatever bar runs (a phase test fast-forwards a clock). */
function cutBars(b: Entity): void {
  b.castingAbility = null;
  b.castRemaining = 0;
}

/** Stand a player in the gold ring in front of the chest. */
function intoRing(f: Fight, b: Entity, p: Entity): void {
  const c = hatchRingCentre(b);
  put(f, p, c.x - f.ox + 1, c.z - f.oz);
}

describe('the Prime Draft: waking and the hatch window', () => {
  it('wakes with a 3 s bar, bolted into the gantry', () => {
    const { f, b } = draftFight();
    run(f, 0.1);
    expect(b.castingAbility).toBe(DRAFT_AWAKEN);
    expect(aura(b, DRAFT_BOLTED)).toBeDefined();
    expect(hatchTemplate(f)).toBe(FOUNDRY_HATCH_TEMPLATES.closed);
    run(f, T.awakenCast);
    expect(state(b).phase).toBe('bolted');
  });

  it('times the hatch: closed, shuddering at 2 s, open 5 to 11 s after an ejection', () => {
    expect(hatchStateAt(0)).toBe('closed');
    expect(hatchStateAt(T.hatchOpenAfter - T.hatchWarning + 0.01)).toBe('warn');
    expect(hatchStateAt(T.hatchOpenAfter + 0.01)).toBe('open');
    expect(hatchStateAt(T.hatchOpenAfter + T.hatchOpenFor + 0.01)).toBe('closed');
    expect(staticPerSecond(0)).toBe(T.staticBase);
    expect(staticPerSecond(4.1)).toBe(T.staticBase + 2 * T.staticStep);
  });

  it('ejects a cell at 15 s from the west rack, then the east, and opens the hatch on time', () => {
    const { f, b } = draftFight();
    awake(f, b);
    // The first ejection comes 15 s after it wakes.
    run(f, T.cycleFirst);
    const first = cells(f);
    expect(first).toHaveLength(1);
    expect(local(f, first[0]).x).toBeLessThan(0);
    expect(Math.abs(local(f, first[0]).z - CELL_RACKS[0].z)).toBeLessThan(1);
    run(f, T.hatchOpenAfter - T.hatchWarning + 0.1);
    expect(hatchTemplate(f)).toBe(FOUNDRY_HATCH_TEMPLATES.warn);
    run(f, T.hatchWarning);
    expect(hatchTemplate(f)).toBe(FOUNDRY_HATCH_TEMPLATES.open);
    run(f, T.hatchOpenFor);
    expect(hatchTemplate(f)).toBe(FOUNDRY_HATCH_TEMPLATES.closed);
  });
});

describe('the Prime Draft: carrying a Storm Cell (G12)', () => {
  it('takes the cell with the pick-up command: Static rising, a slow, the cell off the floor', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    const [cell] = cells(f);
    const runner = f.others[0];
    put(f, runner, local(f, cell).x + 1, local(f, cell).z);
    expect(f.sim.pickUpObject(cell.id, runner.id)).toBe(true);
    expect(cells(f)).toHaveLength(0);
    const carry = aura(runner, DRAFT_CELL_CARRY);
    expect(carry?.kind).toBe('slow');
    expect(carry?.value).toBe(T.carrySlow);
    expect(carriedCell(f.sim.ctx, runner)).not.toBeNull();
    const from = f.hits.length;
    run(f, 4.05, () => put(f, runner, -12, 190));
    const ticks = hitsOn(f, runner, 'Static', from).map((h) => h.amount);
    expect(ticks).toEqual([30, 30, 35, 35]);
  });

  it('drops it with the interact press; the dropper cannot take it back for 3 s, another can', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    const [cell] = cells(f);
    const a = f.others[0];
    const c = f.others[1];
    put(f, a, local(f, cell).x + 1, local(f, cell).z);
    f.sim.pickUpObject(cell.id, a.id);
    f.sim.interact(a.id);
    expect(aura(a, DRAFT_CELL_CARRY)).toBeUndefined();
    const [dropped] = cells(f);
    expect(dropped).toBeDefined();
    expect(f.sim.pickUpObject(dropped.id, a.id)).toBe(true);
    expect(aura(a, DRAFT_CELL_CARRY)).toBeUndefined();
    put(f, c, local(f, dropped).x - 1, local(f, dropped).z);
    expect(f.sim.pickUpObject(dropped.id, c.id)).toBe(true);
    expect(aura(c, DRAFT_CELL_CARRY)).toBeDefined();
  });

  it('slotted into the open hatch: Overload, stunned 6 s and 25 percent more damage for 12 s', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    const [cell] = cells(f);
    const runner = f.others[0];
    put(f, runner, local(f, cell).x + 1, local(f, cell).z);
    f.sim.pickUpObject(cell.id, runner.id);
    run(f, T.hatchOpenAfter + 0.2, () => put(f, runner, -6, 200));
    expect(hatchTemplate(f)).toBe(FOUNDRY_HATCH_TEMPLATES.open);
    run(f, 0.2, () => intoRing(f, b, runner));
    expect(aura(runner, DRAFT_CELL_CARRY)).toBeUndefined();
    expect(aura(b, DRAFT_OVERLOAD)?.duration).toBe(T.overloadStun);
    expect(aura(b, DRAFT_OVERLOADED)?.value).toBe(T.overloadVuln);
    expect(aura(b, DRAFT_OVERLOADED)?.duration).toBe(T.overloadVulnSeconds);
    expect(state(b).overloads).toBe(1);
    expect(f.sim.ctx.isStunned(b)).toBe(true);
  });

  it('carried into a closed hatch the cell arcs back on the carrier and anyone within 5 yd', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    const [cell] = cells(f);
    const runner = f.others[0];
    const near = f.others[1];
    put(f, runner, local(f, cell).x + 1, local(f, cell).z);
    f.sim.pickUpObject(cell.id, runner.id);
    const from = f.hits.length;
    // Straight into the ring the moment it is taken: the hatch is still shut.
    run(f, 0.2, () => {
      intoRing(f, b, runner);
      put(f, near, local(f, runner).x + 2, local(f, runner).z);
    });
    expect(aura(runner, DRAFT_CELL_CARRY)).toBeUndefined();
    expect(state(b).overloads).toBe(0);
    const arc = hitsOn(f, runner, 'Arc Back', from);
    expect(arc).toHaveLength(1);
    expect(arc[0].amount).toBeGreaterThanOrEqual(T.arcBackMin);
    expect(hitsOn(f, near, 'Arc Back', from)).toHaveLength(1);
  });

  it('a cell left 15 s shorts out over the whole gantry', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    const from = f.hits.length;
    run(f, T.cellLife + 0.1);
    expect(cells(f)).toHaveLength(0);
    for (const p of [f.tank, ...f.others]) {
      const hits = hitsOn(f, p, 'Short Out', from);
      expect(hits).toHaveLength(1);
      expect(hits[0].amount).toBeGreaterThanOrEqual(T.shortOutMin);
    }
  });
});

describe('the Prime Draft: the three phases', () => {
  it('Bolted: Piston Fist marks a non-tank spot and slams it 2 s later; Arm Sweep cleaves its front', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    const from = f.hits.length;
    startPistonFist(f.sim.ctx, f.inst, b, st);
    const [mark] = objects(f, FOUNDRY_FIST_MARK);
    expect(mark.scale).toBe(T.fistRadius);
    const victim = [...f.others].find(
      (p) => Math.hypot(p.pos.x - mark.pos.x, p.pos.z - mark.pos.z) < 0.5,
    );
    expect(victim).toBeDefined();
    run(f, T.fistWarning + 0.1);
    expect(hitsOn(f, victim as Entity, 'Piston Fist', from)).toHaveLength(1);
    // The sweep: a bar, then its front cone.
    st.sweepTimer = 0.01;
    run(f, 0.1);
    expect(b.castingAbility).toBe(DRAFT_ARM_SWEEP);
    const sweepFrom = f.hits.length;
    run(f, T.sweepCast + 0.1);
    expect(hitsOn(f, f.tank, 'Arm Sweep', sweepFrom)).toHaveLength(1);
    expect(hitsOn(f, f.others[2], 'Arm Sweep', sweepFrom)).toHaveLength(0);
  });

  it('holds still through its Awakening bar', () => {
    const { f, b } = draftFight();
    put(f, f.tank, 0, 190);
    run(f, 0.1);
    const at = local(f, b);
    run(f, T.awakenCast - 0.3);
    expect(b.castingAbility).toBe(DRAFT_AWAKEN);
    expect(local(f, b).x).toBeCloseTo(at.x, 3);
    expect(local(f, b).z).toBeCloseTo(at.z, 3);
  });

  it('steps slowly toward its target while bolted, never past the Gantry edge', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    expect(st.phase).toBe('bolted');
    expect(b.moveSpeed).toBe(T.boltedSpeed);
    expect(T.boltedSpeed).toBeLessThan(T.unboltedSpeed);
    // The tank backs off across the Gantry and out past its far edge.
    const at = local(f, b);
    put(f, f.tank, 0, 175);
    run(f, 3);
    const step = Math.hypot(local(f, b).x - at.x, local(f, b).z - at.z);
    expect(step).toBeGreaterThan(1);
    // Slow: well under what its unbolted walk would cover.
    expect(step).toBeLessThan(T.unboltedSpeed * 3 * 0.75);
    expect(local(f, b).z).toBeLessThan(at.z);
    // However long the tank waits out there, it never leaves the Gantry.
    const edge = GANTRY.r - T.gantryMargin;
    let farthest = 0;
    run(f, 20, () => {
      const p = local(f, b);
      farthest = Math.max(farthest, Math.hypot(p.x - GANTRY.x, p.z - GANTRY.z));
    });
    expect(farthest).toBeLessThanOrEqual(edge + 1e-6);
    // It reached that edge (not stuck short of it).
    const p = local(f, b);
    expect(Math.hypot(p.x - GANTRY.x, p.z - GANTRY.z)).toBeGreaterThan(edge - 1);
  });

  it('Unbolted at 70 percent: a rivet shower, it walks, and Tremor Step every 10 s', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    b.hp = Math.floor(b.maxHp * 0.69);
    run(f, 0.1);
    expect(b.castingAbility).toBe(DRAFT_UNBOLT);
    run(f, T.unboltCast + 0.1);
    expect(st.phase).toBe('unbolted');
    expect(aura(b, DRAFT_BOLTED)).toBeUndefined();
    expect(b.moveSpeed).toBe(T.unboltedSpeed);
    st.tremorTimer = 0.01;
    run(f, 0.1);
    expect(b.castingAbility).toBe(DRAFT_TREMOR_STEP);
    const from = f.hits.length;
    run(f, T.tremorCast + 0.1);
    expect(hitsOn(f, f.tank, 'Tremor Step', from)).toHaveLength(1);
  });

  it('Heartless at 35 percent: Arc Surge hits the three nearest; overdrive below 15', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    b.hp = Math.floor(b.maxHp * 0.69);
    run(f, T.unboltCast + 0.3);
    b.hp = Math.floor(b.maxHp * 0.34);
    run(f, 0.1);
    expect(st.phase).toBe('heartless');
    expect(st.surgeTimer).toBeLessThanOrEqual(T.surgeFirst);
    cutBars(b);
    st.surgeTimer = 0.01;
    const from = f.hits.length;
    run(f, 0.1);
    const surged = [f.tank, ...f.others].filter((p) => hitsOn(f, p, 'Arc Surge', from).length > 0);
    expect(surged).toHaveLength(T.surgeCount);
    // The farthest player is the one left out.
    const far = [f.tank, ...f.others].sort(
      (a, c) =>
        Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) -
        Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z),
    )[0];
    expect(surged.some((p) => p.id === far.id)).toBe(false);
    b.hp = Math.floor(b.maxHp * 0.14);
    run(f, 0.1);
    expect(aura(b, DRAFT_ENRAGE)?.value).toBe(T.enrageDamage);
  });
});

describe('the Prime Draft: heroic', () => {
  it('Jammed Racks and Double Load: both racks eject, the cells roll 3 s before they can be taken', () => {
    const { f, b } = draftFight('heroic');
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    expect(objects(f, FOUNDRY_CELL_TEMPLATES.rolling)).toHaveLength(2);
    const [rolling] = objects(f, FOUNDRY_CELL_TEMPLATES.rolling);
    const x0 = local(f, rolling).x;
    const runner = f.others[0];
    put(f, runner, local(f, rolling).x, local(f, rolling).z);
    expect(f.sim.pickUpObject(rolling.id, runner.id)).toBe(false);
    run(f, T.jamRollSeconds + 0.1);
    expect(objects(f, FOUNDRY_CELL_TEMPLATES.ready)).toHaveLength(2);
    expect(Math.abs(local(f, rolling).x - x0)).toBeGreaterThan(T.jamRollSpeed * 2);
  });

  it('Double Load: one cell is a 2 s half load, the second in the same window a full Overload', () => {
    const { f, b } = draftFight('heroic');
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    run(f, T.jamRollSeconds + 0.1);
    const [c1, c2] = objects(f, FOUNDRY_CELL_TEMPLATES.ready);
    const [a, c] = f.others;
    put(f, a, local(f, c1).x, local(f, c1).z);
    put(f, c, local(f, c2).x, local(f, c2).z);
    f.sim.pickUpObject(c1.id, a.id);
    f.sim.pickUpObject(c2.id, c.id);
    run(f, T.hatchOpenAfter - T.jamRollSeconds + 0.1, () => {
      put(f, a, -8, 200);
      put(f, c, 8, 200);
    });
    run(f, 0.1, () => intoRing(f, b, a));
    expect(aura(b, DRAFT_OVERLOAD)?.duration).toBe(T.halfLoadStun);
    expect(st.overloads).toBe(0);
    run(f, 0.1, () => intoRing(f, b, c));
    expect(aura(b, DRAFT_OVERLOAD)?.duration).toBe(T.overloadStun);
    expect(st.overloads).toBe(1);
  });
});

describe('the Prime Draft: reset, the Draft Record and the deed', () => {
  it('a wipe drops the cells, the carry, the hatch and the fight state', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    const [cell] = cells(f);
    const runner = f.others[0];
    put(f, runner, local(f, cell).x, local(f, cell).z);
    f.sim.pickUpObject(cell.id, runner.id);
    wipe(f, b);
    run(f, 0.2);
    expect(b.foundryFight).toBeUndefined();
    expect(aura(runner, DRAFT_CELL_CARRY)).toBeUndefined();
    expect(cells(f)).toHaveLength(0);
    expect(hatchTemplate(f)).toBeUndefined();
    expect(aura(b, DRAFT_BOLTED)).toBeUndefined();
  });

  it('on its death the Draft Record lies in its chest', () => {
    const { f, b } = draftFight();
    awake(f, b);
    f.sim.ctx.handleDeath(b, f.tank);
    run(f, 0.1);
    const records = [...f.sim.ctx.entities.values()].filter(
      (e) => e.kind === 'object' && e.objectItemId === DRAFT_RECORD_ITEM,
    );
    expect(records).toHaveLength(1);
    expect(f.inst.objectIds).toContain(records[0].id);
  });

  it('Heartless: three Overloads and a kill earn it; two do not', () => {
    const three = draftFight();
    const st3 = awake(three.f, three.b);
    for (let i = 0; i < 3; i++) overload(three.f.sim.ctx, three.b, st3, true);
    three.f.sim.ctx.handleDeath(three.b, three.f.tank);
    run(three.f, 0.1);
    expect(earned(three.f, three.f.tank, PRIME_DRAFT_DEED)).toBe(true);

    const two = draftFight();
    const st2 = awake(two.f, two.b);
    for (let i = 0; i < 2; i++) overload(two.f.sim.ctx, two.b, st2, true);
    two.f.sim.ctx.handleDeath(two.b, two.f.tank);
    run(two.f, 0.1);
    expect(earned(two.f, two.f.tank, PRIME_DRAFT_DEED)).toBe(false);
  });

  it('draftState is idempotent once the fight runs', () => {
    const { f, b } = draftFight();
    const st = awake(f, b);
    expect(draftState(f.sim.ctx, f.inst, b)).toBe(st);
  });
});
