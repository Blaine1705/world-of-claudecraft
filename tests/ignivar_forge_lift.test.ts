// The forge-lift antechamber: the entry pocket rides "down" for a fixed
// spell after the claim (the room never moves; presentation sells it),
// with the inner gate sealed as a runtime crossing clamp until the ride
// ends, then swapped open in place for the rest of the claim.
import { describe, expect, it } from 'vitest';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  clampIgnivarForgeLift,
  IGNIVAR_LIFT_GATE_Z,
  IGNIVAR_LIFT_RIDE_SECONDS,
} from '../src/sim/ignivar_forge_lift';
import {
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_LIFT_GATE_LOCKED_TEMPLATE,
  IGNIVAR_LIFT_GATE_OPEN_TEMPLATE,
} from '../src/sim/ignivar_raid_ids';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';

function boardLift(seed = 4711) {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true, devCommands: true });
  const entered = enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, sim.player.id, true);
  if (!entered) throw new Error('could not board the forge-lift');
  const inst = sim.instances.find(
    (candidate) => candidate.dungeonId === IGNIVAR_FORGE_APPROACH_ID && candidate.partyKey !== null,
  );
  if (!inst) throw new Error('no approach claim formed');
  const origin = instanceOrigin(DUNGEONS[IGNIVAR_FORGE_APPROACH_ID].index, inst.slot);
  const gate = () => {
    for (const id of inst.objectIds) {
      const entity = sim.entities.get(id);
      if (
        entity &&
        (entity.templateId === IGNIVAR_LIFT_GATE_LOCKED_TEMPLATE ||
          entity.templateId === IGNIVAR_LIFT_GATE_OPEN_TEMPLATE)
      )
        return entity;
    }
    throw new Error('no lift gate in the claim');
  };
  return { sim, inst, origin, gate };
}

describe('the forge-lift antechamber', () => {
  it('spawns the sealed gate on the line and lands the rider inside the car', () => {
    const { sim, origin, gate } = boardLift();
    expect(gate().templateId).toBe(IGNIVAR_LIFT_GATE_LOCKED_TEMPLATE);
    expect(gate().pos.z - origin.z).toBeCloseTo(IGNIVAR_LIFT_GATE_Z);
    // the rider lands in the car, behind the sealed line
    expect(sim.player.pos.z - origin.z).toBeLessThan(IGNIVAR_LIFT_GATE_Z);
  });

  it('clamps a rider walking across the sealed line back into the car', () => {
    const { sim, origin } = boardLift();
    const p = sim.player;
    p.prevPos = { ...p.pos };
    p.pos.z = origin.z + IGNIVAR_LIFT_GATE_Z + 0.4; // stepped past the bars
    clampIgnivarForgeLift(sim.ctx, p);
    expect(p.pos.z - origin.z).toBeLessThan(IGNIVAR_LIFT_GATE_Z - 0.9);
    expect(p.prevPos.z).toBeCloseTo(p.pos.z);
  });

  it('holds a hall-side body out the same way (the sealed gate is solid both ways)', () => {
    const { sim, origin } = boardLift();
    const p = sim.player;
    p.pos.z = origin.z + IGNIVAR_LIFT_GATE_Z + 1.4;
    p.prevPos = { ...p.pos };
    p.pos.z = origin.z + IGNIVAR_LIFT_GATE_Z - 0.4; // pushing back INTO the car
    clampIgnivarForgeLift(sim.ctx, p);
    expect(p.pos.z - origin.z).toBeGreaterThan(IGNIVAR_LIFT_GATE_Z + 0.9);
  });

  it('arrives after the ride: the gate swaps open, grinds, and stops clamping', () => {
    const { sim, origin, gate } = boardLift();
    let grind = false;
    let arrivalLog = false;
    for (let tick = 0; tick < 20 * (IGNIVAR_LIFT_RIDE_SECONDS + 2); tick++) {
      for (const event of sim.tick()) {
        if (event.type === 'spellfxAt' && event.sfxKey === 'rift_gate_grind') grind = true;
        if (event.type === 'log' && event.text === 'The forge-lift settles; its gate grinds open.')
          arrivalLog = true;
      }
    }
    expect(gate().templateId).toBe(IGNIVAR_LIFT_GATE_OPEN_TEMPLATE);
    expect(grind).toBe(true);
    expect(arrivalLog).toBe(true);
    // the clamp releases with the swap: walking out now sticks
    const p = sim.player;
    p.pos.x = origin.x;
    p.pos.z = origin.z + IGNIVAR_LIFT_GATE_Z - 1.5;
    p.prevPos = { ...p.pos };
    p.pos.z = origin.z + IGNIVAR_LIFT_GATE_Z + 0.4;
    clampIgnivarForgeLift(sim.ctx, p);
    expect(p.pos.z - origin.z).toBeCloseTo(IGNIVAR_LIFT_GATE_Z + 0.4);
  });

  it('never touches a rider outside the gate lane or outside instances', () => {
    const { sim, origin } = boardLift();
    const p = sim.player;
    // beside the car walls, outside the lane: free
    p.pos.x = origin.x + 12;
    p.pos.z = origin.z + IGNIVAR_LIFT_GATE_Z + 0.4;
    p.prevPos = { x: p.pos.x, y: p.pos.y, z: origin.z + IGNIVAR_LIFT_GATE_Z - 0.4 };
    const before = p.pos.z;
    clampIgnivarForgeLift(sim.ctx, p);
    expect(p.pos.z).toBeCloseTo(before);
    // out in the overworld: the fast bail leaves the body alone
    p.pos.x = 100;
    p.pos.z = 100;
    p.prevPos = { ...p.pos };
    clampIgnivarForgeLift(sim.ctx, p);
    expect(p.pos.x).toBeCloseTo(100);
  });
});
