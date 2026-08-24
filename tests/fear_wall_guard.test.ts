import { describe, expect, it } from 'vitest';
import { isBlocked, moverHeight, resolvePosition } from '../src/sim/colliders';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { PLAYER_BODY_RADIUS } from '../src/sim/pathfind';
import { Sim } from '../src/sim/sim';
import { type Aura, dist2d, type Entity } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// Mover-aware "is the player inside a full-height wall" oracle: resolvePosition
// with the player's own mover height (so a low prop it steps over is not counted).
function insideWall(p: Entity): boolean {
  const m = moverHeight({ pos: { y: p.pos.y }, onGround: p.onGround });
  const r = resolvePosition(
    WORLD_SEED,
    p.pos.x,
    p.pos.z,
    PLAYER_BODY_RADIUS,
    false,
    undefined,
    m,
    0,
  );
  return Math.hypot(r.x - p.pos.x, r.z - p.pos.z) > 0.05;
}

// Feared players run a FIXED heading. If that heading points at a wall, they used
// to grind into it (and, players reported, sometimes end up inside). The guard
// steers the flee heading to the most open direction when a wall is within ~2yd,
// so a feared player rounds walls instead of pinning on them. Player-only and
// rng-free, so feared mobs and the parity draw order are untouched.
//
// Fixture: the full-height building at (17.5, -5.5) (hw 6.5, hd 4.5) spans
// x[11,24] z[-10,-1]; a player 2yd south of its near (z = -10) face on heading 0
// (+z) runs straight into it, while heading PI (-z) is open ground to the south.
const R = PLAYER_BODY_RADIUS;
const START = { x: 11.0, z: -12.0 };
const INTO_WALL = 0; // +z, into the building 2yd ahead
const AWAY = Math.PI; // -z, open ground to the south

function fearAura(angle: number): Aura {
  return {
    id: 'fear_incap',
    name: 'Fear',
    kind: 'incapacitate',
    remaining: 60,
    duration: 60,
    value: angle,
    sourceId: 0,
    school: 'physical',
  };
}

function fearedAt(x: number, z: number, angle: number): { sim: Sim; aura: Aura } {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(20);
  const p = sim.player;
  p.pos = { x, y: groundHeight(x, z, WORLD_SEED), z };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
  const aura = fearAura(angle);
  p.auras.push(aura);
  return { sim, aura };
}

// Yards a straight heading is clear before a wall, capped at `maxD` (test-side
// mirror of the guard's fearWallOpenDistance, for fixtures and the chosen heading).
function openDist(x: number, z: number, angle: number, maxD = 6): number {
  for (let d = 1; d <= maxD; d += 1) {
    if (isBlocked(WORLD_SEED, x + Math.sin(angle) * d, z + Math.cos(angle) * d, R)) return d - 1;
  }
  return maxD;
}

const LOOKAHEAD = 2; // mirrors FEAR_WALL_LOOKAHEAD in sim.ts

describe('Fear steers players away from walls', () => {
  it('fixture sanity: clean start, wall ahead on INTO_WALL, open on AWAY', () => {
    expect(isBlocked(WORLD_SEED, START.x, START.z, R)).toBe(false);
    expect(openDist(START.x, START.z, INTO_WALL)).toBeLessThan(LOOKAHEAD); // building within range
    expect(openDist(START.x, START.z, AWAY)).toBeGreaterThanOrEqual(LOOKAHEAD); // open to the south
  });

  it('redirects the flee heading when a wall is within range', () => {
    const openInto = openDist(START.x, START.z, INTO_WALL); // short: wall ahead
    const { sim, aura } = fearedAt(START.x, START.z, INTO_WALL);
    sim.tick();
    expect(aura.value).not.toBe(INTO_WALL); // steered onto a new heading
    // and the heading it chose is more open than running straight into the wall
    expect(openDist(START.x, START.z, aura.value)).toBeGreaterThan(openInto);
  });

  it('leaves an already-open heading alone (normal fear is preserved)', () => {
    const { sim, aura } = fearedAt(START.x, START.z, AWAY);
    sim.tick();
    expect(aura.value).toBe(AWAY); // no wall ahead, no redirect
  });

  it('does NOT steer a feared MOB (player-only guard keeps mob movement and parity)', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', autoEquip: true }) as Sim & {
      addEntity(e: Entity): void;
      nextId: number;
    };
    sim.setPlayerLevel(20);
    const mob = createMob(sim.nextId++, MOBS.forest_wolf, 20, {
      x: START.x,
      y: groundHeight(START.x, START.z, WORLD_SEED),
      z: START.z,
    });
    mob.hostile = true;
    mob.moveSpeed = 5; // so the fear actually moves it: keeps the test non-vacuous
    sim.addEntity(mob);
    const from = { x: mob.pos.x, y: mob.pos.y, z: mob.pos.z };
    mob.auras.push(fearAura(INTO_WALL)); // feared straight into the same building
    for (let i = 0; i < 5; i++) sim.tick();
    const aura = mob.auras.find((a) => a.id === 'fear_incap');
    expect(aura?.value).toBe(INTO_WALL); // mob keeps its fixed heading; the guard skips mobs
    expect(dist2d(mob.pos, from)).toBeGreaterThan(0); // updateFearMovement DID run (not vacuous)
  });

  it('/dev fear applies a fear along the player facing (solo test hook)', () => {
    const sim = new Sim({
      seed: WORLD_SEED,
      playerClass: 'warrior',
      autoEquip: true,
      devCommands: true,
    });
    sim.setPlayerLevel(20);
    sim.player.facing = 1.2;
    sim.chat('/dev fear');
    const aura = sim.player.auras.find((a) => a.id === 'fear_incap');
    expect(aura).toBeTruthy();
    expect(aura!.kind).toBe('incapacitate');
    expect(aura!.value).toBe(1.2); // flee heading = the player's facing
  });

  it('rounds the building without ever ending up inside a wall', () => {
    const { sim } = fearedAt(START.x, START.z, INTO_WALL);
    const p = sim.player;
    const from = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    let everInside = false;
    for (let i = 0; i < 20 * 4; i++) {
      sim.tick();
      if (insideWall(p)) everInside = true;
    }
    expect(everInside).toBe(false); // steered around it, never clipped inside (mover-aware)
    expect(dist2d(p.pos, from)).toBeGreaterThan(8); // fled a real distance, not pinned on the face
  });
});
