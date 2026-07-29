// Dawnhold Castle's grounds in the Evergarden: a real player enters by
// the main gate off the Hedgewick road, by the garden postern into the
// walled flower court, and by the court's own south doorway; climbs the
// one flight to the wall-walk; and can never walk through the curtain, the
// court's garden walls, or up the tall watch's sheer riser. Every wall is
// dawnholdLift terrain over the graded pad, so these are movement-kernel
// walks against the live sim, not geometry assertions.
import { describe, expect, it } from 'vitest';
import {
  DAWNHOLD,
  DAWNHOLD_BEDS,
  DAWNHOLD_COURT,
  DAWNHOLD_COURT_GATE,
  DAWNHOLD_COURT_STATUE,
  DAWNHOLD_GATES,
  dawnholdLift,
} from '../src/sim/dawnhold_layout';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';

const SEED = 42;

function makeWalker(spot: { x: number; z: number }) {
  const sim = new Sim({ seed: SEED, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(20);
  const p = sim.player;
  const meta = (
    sim as unknown as { players: Map<number, { moveInput: { forward: boolean } }> }
  ).players.get((sim as unknown as { playerId: number }).playerId);
  if (!meta) throw new Error('no meta');
  p.pos.x = spot.x;
  p.pos.z = spot.z;
  p.pos.y = groundHeight(spot.x, spot.z, SEED) + 0.05;
  p.prevPos = { ...p.pos };
  for (let i = 0; i < 40; i++) sim.tick();
  return { sim, p, meta };
}

function walkTo(
  sim: Sim,
  p: { pos: { x: number; z: number }; facing: number; hp: number; maxHp: number },
  meta: { moveInput: { forward: boolean } },
  target: { x: number; z: number },
  maxTicks = 20 * 30,
): boolean {
  for (let i = 0; i < maxTicks; i++) {
    const dx = target.x - p.pos.x;
    const dz = target.z - p.pos.z;
    if (Math.hypot(dx, dz) < 1.2) {
      meta.moveInput.forward = false;
      return true;
    }
    p.facing = Math.atan2(dx, dz);
    meta.moveInput.forward = true;
    p.hp = p.maxHp;
    sim.tick();
  }
  meta.moveInput.forward = false;
  return false;
}

describe('Dawnhold Castle grounds', () => {
  it('a player enters by the main gate and the garden postern', () => {
    // main gate: straight in off the Hedgewick road line
    {
      const { sim, p, meta } = makeWalker({ x: 300, z: 887 });
      expect(walkTo(sim, p, meta, { x: 284, z: 887 }), 'main gate').toBe(true);
    }
    // the garden postern: in from the flower court, which the postern now
    // opens straight into (the court's own south doorway is the way in
    // from the lawn)
    {
      const pm = (DAWNHOLD_GATES.postern.a0 + DAWNHOLD_GATES.postern.a1) / 2;
      const { sim, p, meta } = makeWalker({ x: pm, z: 930 });
      expect(walkTo(sim, p, meta, { x: pm, z: 916 }), 'garden postern').toBe(true);
    }
    // and in off the south lawn through the flower court's own doorway
    {
      const cm = (DAWNHOLD_COURT_GATE.a0 + DAWNHOLD_COURT_GATE.a1) / 2;
      const { sim, p, meta } = makeWalker({ x: cm, z: DAWNHOLD_COURT.z1 + 4 });
      expect(walkTo(sim, p, meta, { x: cm, z: 934 }), 'court doorway').toBe(true);
    }
  });

  it('the curtain wall and gate flanks refuse a direct crossing', () => {
    for (const z of [875, 905]) {
      const { sim, p, meta } = makeWalker({ x: 298, z });
      walkTo(sim, p, meta, { x: 286, z }, 20 * 8);
      expect(p.pos.x, `east wall at z ${z}`).toBeGreaterThan(DAWNHOLD.wx1 + 0.4);
    }
    // just outside the arch opening: the doorway module's solid flank
    {
      const { sim, p, meta } = makeWalker({ x: 298, z: 884.2 });
      walkTo(sim, p, meta, { x: 286, z: 884.2 }, 20 * 8);
      expect(p.pos.x, 'the gate flank').toBeGreaterThan(DAWNHOLD.wx1 + 0.4);
    }
  });

  it('the flight climbs to the walk; the tall watch stays a sheer dead-end', () => {
    const { sim, p, meta } = makeWalker({ x: 290.1, z: 898 });
    expect(walkTo(sim, p, meta, { x: 290.1, z: 908 }), 'up the flight').toBe(true);
    expect(walkTo(sim, p, meta, { x: 291, z: 917 }), 'onto the SE bastion').toBe(true);
    expect(p.pos.y, 'walk height').toBeGreaterThan(DAWNHOLD.walkAbs - 0.5);
    // north along the east walk toward the tall NE watch: the 14.2 riser
    // refuses the climb (its cap is a lookout for the eyes, not the feet)
    walkTo(sim, p, meta, { x: DAWNHOLD.wx1, z: DAWNHOLD.wz0 }, 20 * 20);
    expect(p.pos.z, 'stopped at the watch').toBeGreaterThan(DAWNHOLD.wz0 + DAWNHOLD.towerHw - 0.6);
  });

  it('the walk leaves its mouth open over both gates', () => {
    const gm = (DAWNHOLD_GATES.main.a0 + DAWNHOLD_GATES.main.a1) / 2;
    const pm = (DAWNHOLD_GATES.postern.a0 + DAWNHOLD_GATES.postern.a1) / 2;
    expect(dawnholdLift(DAWNHOLD.wx1, gm)).toBe(0);
    expect(dawnholdLift(pm, DAWNHOLD.wz1)).toBe(0);
  });

  it('the bailey and the flower court sit dead level on the pad', () => {
    for (const [x, z] of [
      [262, 900],
      [258, 899],
      [273, 897],
      [258, 886.6],
      [258, 889.8],
      // the court floor: both flower fields and the statue's ground
      [DAWNHOLD_BEDS[0].x, DAWNHOLD_BEDS[0].z],
      [DAWNHOLD_BEDS[1].x, DAWNHOLD_BEDS[1].z],
      [DAWNHOLD_COURT_STATUE.x, DAWNHOLD_COURT_STATUE.z],
      [DAWNHOLD_COURT.x0 + 2, DAWNHOLD_COURT.z1 - 2],
      [DAWNHOLD_COURT.x1 - 2, DAWNHOLD_COURT.z1 - 2],
    ] as const) {
      expect(dawnholdLift(x, z), `lift at (${x},${z})`).toBe(0);
      expect(
        Math.abs(groundHeight(x, z, SEED) - DAWNHOLD.pad.h),
        `level at (${x},${z})`,
      ).toBeLessThan(0.05);
    }
  });

  it('the flower court walls refuse a crossing but leave the doorway open', () => {
    const cm = (DAWNHOLD_COURT_GATE.a0 + DAWNHOLD_COURT_GATE.a1) / 2;
    // the south wall is sheer either side of its doorway
    for (const x of [DAWNHOLD_COURT.x0 + 4, DAWNHOLD_COURT.x1 - 4]) {
      const { sim, p, meta } = makeWalker({ x, z: DAWNHOLD_COURT.z1 + 4 });
      walkTo(sim, p, meta, { x, z: DAWNHOLD_COURT.z1 - 4 }, 20 * 8);
      expect(p.pos.z, `court south wall at x ${x}`).toBeGreaterThan(DAWNHOLD_COURT.z1 - 0.4);
    }
    // the doorway span itself carries no lift
    expect(dawnholdLift(cm, DAWNHOLD_COURT.z1)).toBe(0);
    // and the side walls stand
    expect(dawnholdLift(DAWNHOLD_COURT.x0, 932)).toBeGreaterThan(0);
    expect(dawnholdLift(DAWNHOLD_COURT.x1, 932)).toBeGreaterThan(0);
  });
});
