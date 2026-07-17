// Every enterable landform must be leavable on foot. The Drakemaw Caldera
// was a one-way pit (player report, three stranded attempts): the crater rim
// climbs 16yd over 10 at every azimuth, past the movement gate, so anyone
// stepping over the lip could never walk out. The rim now carries a breached
// outflow channel on its south face (volcanoes breach; the melt had to go
// somewhere), and this suite walks a real player from the vent floor out to
// the open waste through it.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { groundHeight, WATER_LEVEL } from '../src/sim/world';

// The production seed: the report is seed-pinned world geometry.
const SEED = 20061;

function escapes(spot: { x: number; z: number }, minDist: number): boolean {
  const sim = new Sim({ seed: SEED, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(20);
  const p = sim.player;
  const meta = (
    sim as unknown as { players: Map<number, { moveInput: { forward: boolean } }> }
  ).players.get((sim as unknown as { playerId: number }).playerId)!;
  p.pos.x = spot.x;
  p.pos.z = spot.z;
  p.pos.y = groundHeight(spot.x, spot.z, SEED) + 0.05;
  p.prevPos = { ...p.pos };
  for (let i = 0; i < 40; i++) sim.tick();
  const sx = p.pos.x;
  const sz = p.pos.z;
  const sy = p.pos.y;
  for (let k = 0; k < 16; k++) {
    // start the sweep facing SOUTH: the Drakemaw breach opens that way, so
    // the common case succeeds on the first attempts instead of walking
    // eight failing directions first (the full suite runs this under core
    // contention, and every failed direction is fourteen simulated seconds)
    const d = (k + 8) % 16;
    p.pos.x = sx;
    p.pos.z = sz;
    p.pos.y = sy;
    p.prevPos = { ...p.pos };
    p.hp = p.maxHp;
    (p as unknown as { dead: boolean }).dead = false;
    const facing = (d * Math.PI) / 8;
    for (let i = 0; i < 20 * 14; i++) {
      meta.moveInput.forward = true;
      p.facing = facing;
      // the question is terrain, not combat: the walker heals through the
      // local wildlife so a mob pile-up never reads as a terrain trap
      p.hp = p.maxHp;
      (p as unknown as { dead: boolean }).dead = false;
      sim.tick();
    }
    meta.moveInput.forward = false;
    const moved = Math.hypot(p.pos.x - sx, p.pos.z - sz);
    if (moved > minDist && groundHeight(p.pos.x, p.pos.z, SEED) > WATER_LEVEL + 0.3) return true;
  }
  return false;
}

describe('enterable landforms are leavable on foot', () => {
  // long-run walker suites need headroom under full-suite core contention
  // (the same class of timeout the stable yard's long-run test carries)
  it('walks out of the Drakemaw Caldera vent floor', { timeout: 90_000 }, () => {
    expect(escapes({ x: 388, z: 2317 }, 45)).toBe(true);
  });

  it('walks out of the two smaller Drakemaw cone craters', { timeout: 90_000 }, () => {
    expect(escapes({ x: 270, z: 2282 }, 30)).toBe(true);
    expect(escapes({ x: 500, z: 2370 }, 30)).toBe(true);
  });
});
