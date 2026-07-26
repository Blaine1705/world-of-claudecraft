// The Last Keep's castle grounds: a real player can enter by all three
// gates, climb both stair flights to the wall-walk, reach the watch
// chamber, and can NEVER walk through the curtain walls. The walls are
// castleLift terrain (the beacon idiom), so these are movement-kernel
// walks against the live sim, not geometry assertions.
import { describe, expect, it } from 'vitest';
import { CASTLE, CASTLE_GATES, castleLift, inCastleGrounds } from '../src/sim/castle_layout';
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

/** Walk toward a target for up to maxTicks; true when within 1.2yd. */
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
    p.hp = p.maxHp; // terrain question, not combat
    sim.tick();
  }
  meta.moveInput.forward = false;
  return false;
}

describe('the Last Keep castle grounds', () => {
  it('a player walks in by the main gate, the postern, and the breach', () => {
    const routes = [
      { name: 'main', from: { x: 364, z: 2028.9 }, to: { x: 388, z: 2028.9 } },
      { name: 'postern', from: { x: 408.9, z: 1996 }, to: { x: 408.9, z: 2010 } },
      { name: 'breach', from: { x: 446, z: 2050 }, to: { x: 430, z: 2050 } },
    ];
    for (const r of routes) {
      const { sim, p, meta } = makeWalker(r.from);
      expect(walkTo(sim, p, meta, r.to), `${r.name} gate should admit the walker`).toBe(true);
      expect(inCastleGrounds(p.pos.x, p.pos.z), `${r.name}: walker should be inside`).toBe(true);
    }
  });

  it('the curtain wall refuses a direct crossing everywhere but the gates', () => {
    // charge the west wall head-on at three non-gate spots; the walker must
    // stay outside (the wall face is a sheer riser the climb gate refuses)
    for (const z of [2012, 2042, 2058]) {
      const { sim, p, meta } = makeWalker({ x: 368, z });
      walkTo(sim, p, meta, { x: 380, z }, 20 * 10);
      expect(p.pos.x, `wall at z ${z} should stop the walker`).toBeLessThan(CASTLE.wx0 - 0.4);
    }
  });

  it('both courtyard flights climb to the wall-walk, and the walk reaches the watch chamber', () => {
    // west flight: from the courtyard floor up the ramp, then south along
    // the walk to the SW bastion
    {
      const { sim, p, meta } = makeWalker({ x: 376.7, z: 2040 });
      expect(walkTo(sim, p, meta, { x: 376.7, z: 2058 })).toBe(true);
      expect(walkTo(sim, p, meta, { x: 374, z: 2062 })).toBe(true);
      const h = p.pos.y - CASTLE.pad.h;
      expect(h, 'west flight should land on the walk').toBeGreaterThan(CASTLE.wallH - 0.5);
    }
    // gate-side flight, then east along the walk, up the watch flight into
    // the chamber at towerH
    {
      const { sim, p, meta } = makeWalker({ x: 416, z: 2003.7 });
      expect(walkTo(sim, p, meta, { x: 433, z: 2003.7 })).toBe(true);
      expect(walkTo(sim, p, meta, { x: 437, z: 2003 })).toBe(true); // NE bastion
      // south along the east walk (the breach parts it; stop north of it)
      expect(walkTo(sim, p, meta, { x: 437, z: 2040 })).toBe(true);
      expect(p.pos.y - CASTLE.pad.h).toBeGreaterThan(CASTLE.wallH - 0.5);
    }
    {
      // the watch flight rides the far wall-walk east into the SE chamber
      // (waypoints hug the walk: the walker is a straight-liner, and a
      // diagonal shortcut would step off the wall into the courtyard)
      const { sim, p, meta } = makeWalker({ x: 376.7, z: 2046 });
      expect(walkTo(sim, p, meta, { x: 376.7, z: 2059 })).toBe(true);
      expect(walkTo(sim, p, meta, { x: 374.5, z: 2063 })).toBe(true); // SW bastion
      expect(walkTo(sim, p, meta, { x: 382, z: 2064 })).toBe(true); // onto the far walk
      expect(walkTo(sim, p, meta, { x: 420, z: 2064 })).toBe(true);
      expect(walkTo(sim, p, meta, { x: 437, z: 2064 })).toBe(true);
      expect(p.pos.y - CASTLE.pad.h, 'watch chamber floor').toBeGreaterThan(CASTLE.towerH - 0.5);
    }
  });

  it('the walk leaves its mouth open over every gate (no lift above an opening)', () => {
    const openings = [
      { x: CASTLE.wx0, z: (CASTLE_GATES.main.a0 + CASTLE_GATES.main.a1) / 2 },
      { x: (CASTLE_GATES.postern.a0 + CASTLE_GATES.postern.a1) / 2, z: CASTLE.wz0 },
      { x: CASTLE.wx1, z: (CASTLE_GATES.breach.a0 + CASTLE_GATES.breach.a1) / 2 },
    ];
    for (const o of openings) {
      expect(castleLift(o.x, o.z), `gate at (${o.x},${o.z})`).toBe(0);
    }
  });

  it('the keep door spot is open courtyard at pad height', () => {
    expect(castleLift(420, 2026)).toBe(0);
    expect(Math.abs(groundHeight(420, 2026, SEED) - CASTLE.pad.h)).toBeLessThan(0.1);
  });
});
