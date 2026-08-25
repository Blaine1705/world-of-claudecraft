import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMovementPositionSample,
  type MovementPositionSession,
  parseMovementPositionSample,
} from '../server/movement_position';
import { beginMovementStop } from '../server/movement_stop';
import { VALKYRS_CALLING_FLIGHT_AURA_ID } from '../src/sim/combat/paladin_valkyrs_calling_state';
import { BUILTIN_WORLD, DELVE_X_MIN, RIFT_X_MIN, setActiveWorldContent } from '../src/sim/data';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { floorHeightAt, MAX_STEP_HEIGHT, moveCharacter } from '../src/sim/physics';
import { isDeepWaterAt, isSwimming, swimSurfaceY, wadeSpeedMult } from '../src/sim/player_motion';
import { Sim } from '../src/sim/sim';
import { DT, emptyMoveInput, RUN_SPEED } from '../src/sim/types';
import { groundHeight, terrainHeight, WATER_LEVEL, waterLevelAt } from '../src/sim/world';
import { wallFootFixture } from './helpers/wall_foot';
import { EMPTY_TEST_WORLD } from './sim_shared';

function setup(seed = 42): { sim: Sim; session: MovementPositionSession } {
  const sim = new Sim({ seed, playerClass: 'warrior', world: EMPTY_TEST_WORLD });
  return { sim, session: { pid: sim.player.id, movementPositionState: null } };
}

afterEach(() => setActiveWorldContent(null));

describe('authoritative client movement positions', () => {
  const neutral = emptyMoveInput();
  const forward = { ...emptyMoveInput(), forward: true };

  it('accepts a grounded position stream within authoritative run speed', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };

    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
    ).toBe(true);
    expect(sim.player.pos.z).toBeCloseTo(start.z + 0.35, 10);
  });

  it('accepts exactly two render frames of phase credit and rejects just over it', () => {
    const inputIntervalDistance = RUN_SPEED / 20;
    const renderPhaseDistance = RUN_SPEED / 30;
    const initialPathCredit = 0.05;
    const exact = setup();
    const exactStart = { x: exact.sim.player.pos.x, z: exact.sim.player.pos.z };
    expect(applyMovementPositionSample(exact.sim, exact.session, exactStart, 0, neutral)).toBe(
      true,
    );
    expect(
      applyMovementPositionSample(
        exact.sim,
        exact.session,
        { x: exactStart.x, z: exactStart.z + inputIntervalDistance + initialPathCredit },
        50,
        forward,
      ),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        exact.sim,
        exact.session,
        {
          x: exactStart.x,
          z: exactStart.z + inputIntervalDistance * 2 + initialPathCredit + renderPhaseDistance,
        },
        100,
        forward,
      ),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        exact.sim,
        exact.session,
        {
          x: exactStart.x,
          z: exactStart.z + inputIntervalDistance * 3 + initialPathCredit + renderPhaseDistance,
        },
        150,
        forward,
      ),
    ).toBe(true);

    const excessive = setup();
    const excessiveStart = { x: excessive.sim.player.pos.x, z: excessive.sim.player.pos.z };
    expect(
      applyMovementPositionSample(excessive.sim, excessive.session, excessiveStart, 0, neutral),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        excessive.sim,
        excessive.session,
        { x: excessiveStart.x, z: excessiveStart.z + inputIntervalDistance + initialPathCredit },
        50,
        forward,
      ),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        excessive.sim,
        excessive.session,
        {
          x: excessiveStart.x,
          z:
            excessiveStart.z +
            inputIntervalDistance * 2 +
            initialPathCredit +
            renderPhaseDistance +
            0.001,
        },
        100,
        forward,
      ),
    ).toBe(false);
  });

  it('cannot spend the render-phase reserve indefinitely', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
    ).toBe(true);
    const firstCrossover = start.z + 0.35 + RUN_SPEED / 15;
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: firstCrossover }, 100, forward),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        sim,
        session,
        { x: start.x, z: firstCrossover + RUN_SPEED / 15 },
        150,
        forward,
      ),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        sim,
        session,
        { x: start.x, z: firstCrossover + (RUN_SPEED / 15) * 2 },
        200,
        forward,
      ),
    ).toBe(false);
  });

  it('does not consume movement time when a low-FPS client repeats its last rendered pose', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(session.movementPositionState?.authorityActive).toBe(true);
    expect(applyMovementPositionSample(sim, session, start, 50, forward)).toBe(false);
    expect(applyMovementPositionSample(sim, session, start, 100, forward)).toBe(false);
    expect(session.movementPositionState?.clientAtMs).toBe(0);
    expect(session.movementPositionState?.authorityActive).toBe(true);
    expect(
      applyMovementPositionSample(
        sim,
        session,
        { x: start.x, z: start.z + RUN_SPEED * 0.125 },
        150,
        forward,
      ),
    ).toBe(true);
  });

  it('deactivates grounded authority after rejecting a held-input position', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
    ).toBe(true);
    const adoptedZ = sim.player.pos.z;

    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 3 }, 100, forward),
    ).toBe(false);
    expect(session.movementPositionState?.authorityActive).toBe(false);
    expect(sim.player.pos.z).toBe(adoptedZ);
  });

  it('deactivates position authority while airborne, including repeated rendered poses', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(session.movementPositionState?.authorityActive).toBe(true);

    entity.onGround = false;
    expect(applyMovementPositionSample(sim, session, start, 50, forward)).toBe(false);
    expect(session.movementPositionState?.authorityActive).toBe(false);
  });

  it('rejects speed gained beyond the episode path budget', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
    ).toBe(true);

    const accepted = { ...sim.player.pos };
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 1.05 }, 100, forward),
    ).toBe(false);
    expect(sim.player.pos).toEqual(accepted);
  });

  it('uses the authoritative backpedal speed limit', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    const back = { ...emptyMoveInput(), back: true };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z - 0.35 }, 50, back),
    ).toBe(false);
    expect(sim.player.pos.z).toBe(start.z);
  });

  it('uses active movement slows in the position budget', () => {
    const makeSlowed = () => {
      const result = setup();
      result.sim.player.auras.push({
        id: 'movement_test_slow',
        name: 'Movement Test Slow',
        kind: 'slow',
        remaining: 1,
        duration: 1,
        value: 0.5,
        sourceId: result.sim.player.id,
        school: 'frost',
      });
      return result;
    };
    const legal = makeSlowed();
    const legalStart = { x: legal.sim.player.pos.x, z: legal.sim.player.pos.z };
    expect(applyMovementPositionSample(legal.sim, legal.session, legalStart, 0, neutral)).toBe(
      true,
    );
    expect(
      applyMovementPositionSample(
        legal.sim,
        legal.session,
        { x: legalStart.x, z: legalStart.z + 0.05 + RUN_SPEED * 0.5 * 0.05 },
        50,
        forward,
      ),
    ).toBe(true);

    const overspeed = makeSlowed();
    const overspeedStart = { x: overspeed.sim.player.pos.x, z: overspeed.sim.player.pos.z };
    expect(
      applyMovementPositionSample(overspeed.sim, overspeed.session, overspeedStart, 0, neutral),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        overspeed.sim,
        overspeed.session,
        { x: overspeedStart.x, z: overspeedStart.z + 0.35 },
        50,
        forward,
      ),
    ).toBe(false);
  });

  it('uses shallow-water wading speed in the position budget', () => {
    const lake = { x: -92, z: 88 };
    setActiveWorldContent({
      ...BUILTIN_WORLD,
      camps: [],
      npcs: {},
      groundObjects: [],
      terrainEdits: [
        {
          x: lake.x,
          z: lake.z,
          radius: 14,
          delta: WATER_LEVEL - 0.5,
          falloff: 'flat',
          mode: 'level',
        },
      ],
    });
    const makeWader = () => {
      const result = setup();
      result.sim.player.pos.x = lake.x;
      result.sim.player.pos.z = lake.z;
      result.sim.player.pos.y = groundHeight(lake.x, lake.z, result.sim.cfg.seed);
      result.sim.player.prevPos = { ...result.sim.player.pos };
      result.sim.player.facing = 0;
      result.sim.player.onGround = true;
      return result;
    };
    const wadeMultiplier = wadeSpeedMult(0.5);
    expect(waterLevelAt(lake.x, lake.z, 42) - groundHeight(lake.x, lake.z, 42)).toBeCloseTo(
      0.5,
      10,
    );
    expect(wadeMultiplier).toBeLessThan(1);

    const legal = makeWader();
    const legalStart = { x: legal.sim.player.pos.x, z: legal.sim.player.pos.z };
    expect(applyMovementPositionSample(legal.sim, legal.session, legalStart, 0, neutral)).toBe(
      true,
    );
    expect(
      applyMovementPositionSample(
        legal.sim,
        legal.session,
        { x: legalStart.x, z: legalStart.z + 0.05 + RUN_SPEED * wadeMultiplier * 0.05 },
        50,
        forward,
      ),
    ).toBe(true);

    const overspeed = makeWader();
    const overspeedStart = { x: overspeed.sim.player.pos.x, z: overspeed.sim.player.pos.z };
    expect(
      applyMovementPositionSample(overspeed.sim, overspeed.session, overspeedStart, 0, neutral),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        overspeed.sim,
        overspeed.session,
        { x: overspeedStart.x, z: overspeedStart.z + 0.35 },
        50,
        forward,
      ),
    ).toBe(false);
  });

  it('does not spend forward movement credit sideways', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    expect(
      applyMovementPositionSample(sim, session, { x: start.x + 0.35, z: start.z }, 50, forward),
    ).toBe(false);
    expect(sim.player.pos.x).toBe(start.x);
  });

  it('does not reset directional tolerance for fragmented grounded samples', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    for (let index = 1; index <= 165; index++) {
      expect(
        applyMovementPositionSample(
          sim,
          session,
          { x: start.x + index * 0.009, z: start.z },
          index * 4.5,
          forward,
        ),
      ).toBe(false);
    }
    expect(sim.player.pos.x).toBe(start.x);
  });

  it('uses the post-turn facing for a simultaneous forward turn', () => {
    const server = setup();
    const client = setup();
    const input = { ...forward, turnLeft: true };
    const start = { x: server.sim.player.pos.x, z: server.sim.player.pos.z };
    expect(applyMovementPositionSample(server.sim, server.session, start, 0, neutral)).toBe(true);
    const clientMeta = client.sim.meta(client.sim.player.id);
    if (!clientMeta) throw new Error('client metadata missing');
    Object.assign(clientMeta.moveInput, input);
    client.sim.tick();

    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        50,
        input,
      ),
    ).toBe(true);
  });

  it('accepts the completed authoritative segment for an in-sync forward turn', () => {
    const server = setup();
    const client = setup();
    const input = { ...forward, turnLeft: true };
    const start = { x: server.sim.player.pos.x, z: server.sim.player.pos.z };
    expect(applyMovementPositionSample(server.sim, server.session, start, 0, neutral)).toBe(true);
    for (const sim of [server.sim, client.sim]) {
      const meta = sim.meta(sim.player.id);
      if (!meta) throw new Error('player metadata missing');
      Object.assign(meta.moveInput, input);
      sim.tick();
    }

    expect(server.sim.player.pos).toEqual(client.sim.player.pos);
    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        50,
        input,
      ),
    ).toBe(true);
  });

  it('does not replay a completed grounded segment across queued samples', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    entity.prevPos = { ...entity.pos };
    entity.pos.x += 0.35;

    expect(
      applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 50, forward),
    ).toBe(true);
    const accepted = { ...entity.pos };
    expect(
      applyMovementPositionSample(
        sim,
        session,
        { x: entity.pos.x + 0.011, z: entity.pos.z },
        100,
        forward,
      ),
    ).toBe(false);
    expect(entity.pos).toEqual(accepted);
  });

  it('consumes completed grounded direction at most once per server tick', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    entity.prevPos = { ...entity.pos };
    entity.pos.x += 0.35;
    expect(
      applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 50, forward),
    ).toBe(true);

    entity.prevPos = { ...entity.pos };
    entity.pos.x += 0.35;
    const authority = { ...entity.pos };
    expect(
      applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 100, forward),
    ).toBe(false);
    expect(entity.pos).toEqual(authority);
  });

  it('tracks the shared airborne steering path during a turn', () => {
    const server = setup();
    const client = setup();
    const input = { ...forward, turnLeft: true };
    const start = { x: server.sim.player.pos.x, z: server.sim.player.pos.z };
    expect(applyMovementPositionSample(server.sim, server.session, start, 0, neutral)).toBe(true);

    for (const sim of [server.sim, client.sim]) {
      sim.player.pos.y += 5;
      sim.player.onGround = false;
      sim.player.jumping = true;
      sim.player.vx = 0;
      sim.player.vy = 5;
      sim.player.vz = 7;
    }
    const clientMeta = client.sim.meta(client.sim.player.id);
    if (!clientMeta) throw new Error('client metadata missing');
    Object.assign(clientMeta.moveInput, input);
    client.sim.tick();
    const serverAuthority = { ...server.sim.player.pos };

    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        50,
        input,
      ),
    ).toBe(false);
    expect(server.session.movementPositionState?.x).toBeCloseTo(client.sim.player.pos.x, 10);
    expect(server.session.movementPositionState?.z).toBeCloseTo(client.sim.player.pos.z, 10);
    expect(server.sim.player.pos).toEqual(serverAuthority);
  });

  it('advances airborne steering across multiple frames buffered in one server tick', () => {
    const server = setup();
    const client = setup();
    const input = { ...forward, turnLeft: true };
    const start = { x: server.sim.player.pos.x, z: server.sim.player.pos.z };
    expect(applyMovementPositionSample(server.sim, server.session, start, 0, neutral)).toBe(true);
    for (const sim of [server.sim, client.sim]) {
      sim.player.pos.y += 5;
      sim.player.onGround = false;
      sim.player.jumping = true;
      sim.player.vx = 0;
      sim.player.vy = 5;
      sim.player.vz = RUN_SPEED;
    }
    const clientMeta = client.sim.meta(client.sim.player.id);
    if (!clientMeta) throw new Error('client metadata missing');
    Object.assign(clientMeta.moveInput, input);
    client.sim.tick();
    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        50,
        input,
      ),
    ).toBe(false);
    expect(server.session.movementPositionState).not.toBeNull();

    server.sim.player.facing = client.sim.player.facing;
    client.sim.tick();
    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        100,
        input,
      ),
    ).toBe(false);
    expect(server.session.movementPositionState?.x).toBeCloseTo(client.sim.player.pos.x, 10);
    expect(server.session.movementPositionState?.z).toBeCloseTo(client.sim.player.pos.z, 10);
    expect(server.sim.tickCount).toBe(0);

    server.sim.player.facing = client.sim.player.facing;
    const serverMeta = server.sim.meta(server.sim.player.id);
    if (!serverMeta) throw new Error('server metadata missing');
    Object.assign(serverMeta.moveInput, input);
    server.sim.tick();
    client.sim.tick();
    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        150,
        input,
      ),
    ).toBe(false);
    expect(server.session.movementPositionState?.x).toBeCloseTo(client.sim.player.pos.x, 10);
    expect(server.session.movementPositionState?.z).toBeCloseTo(client.sim.player.pos.z, 10);
    expect(server.sim.tickCount).toBe(1);
  });

  it('tracks an in-sync completed airborne steering segment', () => {
    const server = setup();
    const client = setup();
    const input = { ...forward, turnLeft: true };
    const start = { x: server.sim.player.pos.x, z: server.sim.player.pos.z };
    expect(applyMovementPositionSample(server.sim, server.session, start, 0, neutral)).toBe(true);

    for (const sim of [server.sim, client.sim]) {
      sim.player.pos.y += 5;
      sim.player.onGround = false;
      sim.player.jumping = true;
      sim.player.vx = 0;
      sim.player.vy = 5;
      sim.player.vz = 7;
      const meta = sim.meta(sim.player.id);
      if (!meta) throw new Error('player metadata missing');
      Object.assign(meta.moveInput, input);
      sim.tick();
    }
    const serverAuthority = { ...server.sim.player.pos };

    expect(server.sim.player.pos).toEqual(client.sim.player.pos);
    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        50,
        input,
      ),
    ).toBe(false);
    expect(server.session.movementPositionState?.x).toBeCloseTo(client.sim.player.pos.x, 10);
    expect(server.session.movementPositionState?.z).toBeCloseTo(client.sim.player.pos.z, 10);
    expect(server.sim.player.pos).toEqual(serverAuthority);
  });

  it('reacquires an in-sync airborne collision slide on landing', () => {
    const server = setup();
    const client = setup();
    const heading = Math.PI;
    const start = { x: -180, z: 156 };
    for (const sim of [server.sim, client.sim]) {
      sim.player.pos = {
        x: start.x,
        y: terrainHeight(start.x, start.z, sim.cfg.seed) + 0.1,
        z: start.z,
      };
      sim.player.prevPos = { ...sim.player.pos };
      sim.player.facing = heading;
      sim.player.onGround = true;
    }
    expect(applyMovementPositionSample(server.sim, server.session, start, 0, neutral)).toBe(true);

    for (const sim of [server.sim, client.sim]) {
      sim.player.pos.y = terrainHeight(start.x, start.z, sim.cfg.seed) + 0.1;
      sim.player.prevPos = { ...sim.player.pos };
      sim.player.onGround = false;
      sim.player.jumping = true;
      sim.player.vx = Math.sin(heading) * RUN_SPEED;
      sim.player.vy = -1;
      sim.player.vz = Math.cos(heading) * RUN_SPEED;
      const meta = sim.meta(sim.player.id);
      if (!meta) throw new Error('player metadata missing');
      Object.assign(meta.moveInput, forward);
    }
    expect(applyMovementPositionSample(server.sim, server.session, start, 50, forward)).toBe(false);
    expect(server.session.movementPositionState?.suspendedAirborne).toBe(true);
    server.sim.tick();
    client.sim.tick();

    expect(server.sim.player.onGround).toBe(true);
    expect(server.sim.player.pos).toEqual(client.sim.player.pos);
    expect(
      Math.hypot(
        client.sim.player.pos.x - (start.x + Math.sin(heading) * RUN_SPEED * DT),
        client.sim.player.pos.z - (start.z + Math.cos(heading) * RUN_SPEED * DT),
      ),
    ).toBeGreaterThan(0.01);
    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        100,
        forward,
      ),
    ).toBe(true);
    expect(server.session.movementPositionState?.suspendedAirborne).toBe(false);
  });

  it('does not replay a completed airborne segment into landing authority', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    entity.prevPos = { ...entity.pos };
    entity.pos.x += 0.35;
    entity.onGround = false;
    entity.jumping = true;
    entity.vz = RUN_SPEED;
    const authority = { ...entity.pos };

    expect(
      applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 50, forward),
    ).toBe(false);
    expect(session.movementPositionState).not.toBeNull();
    expect(
      applyMovementPositionSample(
        sim,
        session,
        { x: entity.pos.x + 0.011, z: entity.pos.z },
        100,
        forward,
      ),
    ).toBe(false);
    expect(session.movementPositionState).toBeNull();

    entity.onGround = true;
    entity.jumping = false;
    expect(
      applyMovementPositionSample(
        sim,
        session,
        { x: entity.pos.x + 0.35, z: entity.pos.z },
        150,
        forward,
      ),
    ).toBe(false);
    expect(entity.pos).toEqual(authority);
  });

  it('consumes completed airborne direction at most once per server tick', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    entity.prevPos = { ...entity.pos };
    entity.pos.x += 0.35;
    entity.onGround = false;
    entity.jumping = true;
    entity.vz = RUN_SPEED;
    expect(
      applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 50, forward),
    ).toBe(false);
    expect(session.movementPositionState).not.toBeNull();

    entity.prevPos = { ...entity.pos };
    entity.pos.x += 0.35;
    const authority = { ...entity.pos };
    expect(
      applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 100, forward),
    ).toBe(false);
    expect(session.movementPositionState).toBeNull();
    expect(entity.pos).toEqual(authority);
  });

  it('does not grant fresh movement credit while idle', () => {
    const { sim, session } = setup();
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.06 }, 50, neutral),
    ).toBe(false);
    expect(sim.player.pos.z).toBe(start.z);
  });

  it('rejects a sample whose swept path is blocked', () => {
    const { sim, session } = setup();
    sim.player.pos.x = 100_100;
    sim.player.pos.z = 0;
    sim.player.pos.y = 0;
    const start = { x: sim.player.pos.x, z: sim.player.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    vi.spyOn(sim.ctx, 'resolvePlayerMove').mockReturnValue(start);

    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.2 }, 50, forward),
    ).toBe(false);
    expect(sim.player.pos.z).toBe(start.z);
  });

  it('accepts the extra horizontal commit from a shared-controller step-up', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    entity.pos.x = -146.5;
    entity.pos.z = 183.5;
    entity.pos.y = terrainHeight(entity.pos.x, entity.pos.z, sim.cfg.seed);
    entity.prevPos = { ...entity.pos };
    entity.facing = (3 * Math.PI) / 8;
    const start = { x: entity.pos.x, z: entity.pos.z };
    const endpoint = { x: 0, y: 0, z: 0, blocked: false, stepped: 0 };
    moveCharacter(
      {
        seed: sim.cfg.seed,
        radius: PLAYER_BODY_RADIUS,
        stepHeight: MAX_STEP_HEIGHT,
        maxSlope: PLAYER_MAX_CLIMB_SLOPE,
        grounded: true,
        swimming: false,
        ignoreFences: false,
      },
      entity.pos.x,
      entity.pos.y,
      entity.pos.z,
      Math.sin(entity.facing) * 0.35,
      Math.cos(entity.facing) * 0.35,
      endpoint,
    );
    expect(endpoint.stepped).toBeGreaterThan(0);
    expect(Math.hypot(endpoint.x - start.x, endpoint.z - start.z)).toBeGreaterThan(0.4);
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    expect(
      applyMovementPositionSample(sim, session, { x: endpoint.x, z: endpoint.z }, 50, forward),
    ).toBe(true);
    const endpointY = floorHeightAt(
      sim.cfg.seed,
      endpoint.x,
      endpoint.z,
      PLAYER_BODY_RADIUS,
      endpoint.y,
    );
    expect(entity.pos.y).toBeCloseTo(endpointY, 10);

    const beforeTick = { ...entity.pos };
    const meta = sim.meta(entity.id);
    if (!meta) throw new Error('player metadata missing');
    Object.assign(meta.moveInput, forward);
    sim.tick();
    const tickDx = entity.pos.x - beforeTick.x;
    const tickDz = entity.pos.z - beforeTick.z;
    expect(tickDx * Math.sin(entity.facing) + tickDz * Math.cos(entity.facing)).toBeGreaterThan(
      0.3,
    );
    expect(
      Math.abs(tickDx * Math.cos(entity.facing) - tickDz * Math.sin(entity.facing)),
    ).toBeLessThan(0.01);
  });

  it('tracks shared-controller height across inclines and declines', () => {
    for (const route of [
      { x: 177, z: 159, heading: Math.PI / 2, climbs: false },
      { x: -117, z: -54, heading: Math.PI / 2, climbs: true },
    ]) {
      const { sim, session } = setup();
      const entity = sim.player;
      entity.pos.x = route.x;
      entity.pos.z = route.z;
      entity.pos.y = terrainHeight(route.x, route.z, sim.cfg.seed);
      entity.prevPos = { ...entity.pos };
      entity.facing = route.heading;
      const startY = entity.pos.y;
      expect(
        applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 0, neutral),
      ).toBe(true);

      const clientPosition = { ...entity.pos };
      for (let tick = 1; tick <= 8; tick++) {
        const endpoint = { x: 0, y: 0, z: 0, blocked: false, stepped: 0 };
        moveCharacter(
          {
            seed: sim.cfg.seed,
            radius: PLAYER_BODY_RADIUS,
            stepHeight: MAX_STEP_HEIGHT,
            maxSlope: PLAYER_MAX_CLIMB_SLOPE,
            grounded: true,
            swimming: false,
            ignoreFences: false,
          },
          clientPosition.x,
          clientPosition.y,
          clientPosition.z,
          Math.sin(route.heading) * 0.35,
          Math.cos(route.heading) * 0.35,
          endpoint,
        );
        clientPosition.x = endpoint.x;
        clientPosition.z = endpoint.z;
        clientPosition.y = floorHeightAt(
          sim.cfg.seed,
          endpoint.x,
          endpoint.z,
          PLAYER_BODY_RADIUS,
          endpoint.y,
        );
        expect(
          applyMovementPositionSample(
            sim,
            session,
            { x: endpoint.x, z: endpoint.z },
            tick * 50,
            forward,
          ),
        ).toBe(true);
      }

      expect(session.movementPositionState?.serverY).toBeCloseTo(clientPosition.y, 10);
      if (route.climbs) expect(clientPosition.y - startY).toBeGreaterThan(0.3);
      else expect(clientPosition.y - startY).toBeLessThan(-0.3);
    }
  });

  it('keeps the real movement kernel height while crossing a prop rim', () => {
    setActiveWorldContent({
      ...BUILTIN_WORLD,
      props: { ...BUILTIN_WORLD.props, crates: [[0, 0]] },
    });
    const server = setup();
    const client = setup();
    const start = {
      x: -0.8,
      y: floorHeightAt(42, -0.8, -0.2, PLAYER_BODY_RADIUS, Number.POSITIVE_INFINITY),
      z: -0.2,
    };
    expect(start.y).toBeGreaterThan(terrainHeight(start.x, start.z, 42) + 0.5);
    for (const sim of [server.sim, client.sim]) {
      sim.player.pos = { ...start };
      sim.player.prevPos = { ...start };
      sim.player.facing = Math.PI / 2;
      sim.player.onGround = true;
    }
    const clientMeta = client.sim.meta(client.sim.player.id);
    if (!clientMeta) throw new Error('client metadata missing');
    Object.assign(clientMeta.moveInput, forward);
    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: start.x, z: start.z },
        0,
        neutral,
      ),
    ).toBe(true);

    for (let tick = 1; tick <= 3; tick++) {
      client.sim.tick();
      expect(client.sim.player.onGround).toBe(true);
      expect(
        applyMovementPositionSample(
          server.sim,
          server.session,
          { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
          tick * 50,
          forward,
        ),
      ).toBe(true);
      expect(server.sim.player.pos.y).toBeCloseTo(client.sim.player.pos.y, 10);
    }
  });

  it('accepts the real kernel terrain-wall standoff endpoint', () => {
    const seed = 20_061;
    const server = setup(seed);
    const client = setup(seed);
    const foot = wallFootFixture(seed, PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE);
    const input = { ...emptyMoveInput(), strafeRight: true };
    for (const sim of [server.sim, client.sim]) {
      sim.player.pos = { x: foot.x, y: terrainHeight(foot.x, foot.z, seed), z: foot.z };
      sim.player.prevPos = { ...sim.player.pos };
      sim.player.facing = 0;
      sim.player.onGround = true;
    }
    const start = { x: server.sim.player.pos.x, z: server.sim.player.pos.z };
    expect(applyMovementPositionSample(server.sim, server.session, start, 0, neutral)).toBe(true);
    const clientMeta = client.sim.meta(client.sim.player.id);
    if (!clientMeta) throw new Error('client metadata missing');
    Object.assign(clientMeta.moveInput, input);
    client.sim.tick();

    expect(
      applyMovementPositionSample(
        server.sim,
        server.session,
        { x: client.sim.player.pos.x, z: client.sim.player.pos.z },
        50,
        input,
      ),
    ).toBe(true);
    expect(server.sim.player.pos.x).toBeCloseTo(client.sim.player.pos.x, 10);
    expect(server.sim.player.pos.z).toBeCloseTo(client.sim.player.pos.z, 10);
  });

  it('uses mounted movement speed without granting it while unmounted', () => {
    const mounted = setup();
    mounted.sim.player.mountKey = 'valorsteed';
    const mountedStart = { x: mounted.sim.player.pos.x, z: mounted.sim.player.pos.z };
    expect(
      applyMovementPositionSample(mounted.sim, mounted.session, mountedStart, 0, neutral),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        mounted.sim,
        mounted.session,
        { x: mountedStart.x, z: mountedStart.z + 0.55 },
        50,
        forward,
      ),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        mounted.sim,
        mounted.session,
        { x: mountedStart.x, z: mountedStart.z + 1.7 },
        100,
        forward,
      ),
    ).toBe(false);

    const unmounted = setup();
    const unmountedStart = { x: unmounted.sim.player.pos.x, z: unmounted.sim.player.pos.z };
    expect(
      applyMovementPositionSample(unmounted.sim, unmounted.session, unmountedStart, 0, neutral),
    ).toBe(true);
    expect(
      applyMovementPositionSample(
        unmounted.sim,
        unmounted.session,
        { x: unmountedStart.x, z: unmountedStart.z + 0.55 },
        50,
        forward,
      ),
    ).toBe(false);
  });

  it('keeps the deep-water swim boundary server-owned on and off mounts', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    entity.mountKey = 'valorsteed';
    entity.pos.x = -180;
    entity.pos.z = 145.01;
    entity.pos.y = terrainHeight(entity.pos.x, entity.pos.z, sim.cfg.seed);
    entity.prevPos = { ...entity.pos };
    entity.facing = Math.PI;
    const start = { x: entity.pos.x, z: entity.pos.z };
    const target = { x: entity.pos.x, z: entity.pos.z - 0.15 };
    expect(isDeepWaterAt(start.x, start.z, sim.cfg.seed)).toBe(false);
    expect(isDeepWaterAt(target.x, target.z, sim.cfg.seed)).toBe(true);
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    expect(applyMovementPositionSample(sim, session, target, 50, forward)).toBe(false);
    expect(entity.pos.z).toBe(start.z);

    const unmounted = setup();
    unmounted.sim.player.pos = { ...entity.pos };
    unmounted.sim.player.prevPos = { ...entity.pos };
    unmounted.sim.player.mountKey = '';
    unmounted.sim.player.facing = Math.PI;
    expect(applyMovementPositionSample(unmounted.sim, unmounted.session, start, 0, neutral)).toBe(
      true,
    );
    expect(applyMovementPositionSample(unmounted.sim, unmounted.session, target, 50, forward)).toBe(
      false,
    );
  });

  it('accepts an endpoint produced by the shared collision solver', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    entity.pos.x = -11;
    entity.pos.z = 22.3;
    entity.pos.y = terrainHeight(entity.pos.x, entity.pos.z, sim.cfg.seed);
    entity.prevPos = { ...entity.pos };
    const start = { x: entity.pos.x, z: entity.pos.z };
    const heading = 1.74;
    entity.facing = heading;
    const endpoint = { x: 0, y: 0, z: 0, blocked: false, stepped: 0 };
    moveCharacter(
      {
        seed: sim.cfg.seed,
        radius: PLAYER_BODY_RADIUS,
        stepHeight: MAX_STEP_HEIGHT,
        maxSlope: PLAYER_MAX_CLIMB_SLOPE,
        grounded: true,
        swimming: false,
        ignoreFences: false,
      },
      entity.pos.x,
      entity.pos.y,
      entity.pos.z,
      Math.sin(heading) * 0.35,
      Math.cos(heading) * 0.35,
      endpoint,
    );
    expect(endpoint.blocked).toBe(true);
    expect(Math.hypot(endpoint.x - start.x, endpoint.z - start.z)).toBeGreaterThan(0.1);
    expect(
      Math.hypot(
        endpoint.x - (start.x + Math.sin(heading) * 0.35),
        endpoint.z - (start.z + Math.cos(heading) * 0.35),
      ),
    ).toBeGreaterThan(0.01);
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    expect(
      applyMovementPositionSample(sim, session, { x: endpoint.x, z: endpoint.z }, 50, forward),
    ).toBe(true);
    expect(entity.pos.x).toBeCloseTo(endpoint.x, 10);
    expect(entity.pos.z).toBeCloseTo(endpoint.z, 10);
    const meta = sim.meta(entity.id);
    if (!meta) throw new Error('player metadata missing');
    Object.assign(meta.moveInput, forward);
    expect(beginMovementStop(sim, session, { x: endpoint.x, z: endpoint.z }, neutral)).toBe(true);
    expect(meta.moveInput.forward).toBe(false);
    const stopped = { ...entity.pos };
    sim.tick();
    expect(entity.pos.x).toBeCloseTo(endpoint.x, 10);
    expect(entity.pos.z).toBeCloseTo(endpoint.z, 10);
    expect(entity.pos.x).toBeCloseTo(stopped.x, 10);
    expect(entity.pos.z).toBeCloseTo(stopped.z, 10);
  });

  it('reacquires a bounded position stream after a completed jump', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    entity.onGround = false;
    entity.jumping = true;
    entity.vz = 7;
    const airborneAuthority = { ...entity.pos };
    for (let clientAtMs = 50; clientAtMs <= 750; clientAtMs += 50) {
      const clientDistance = (clientAtMs / 1000) * 7;
      expect(
        applyMovementPositionSample(
          sim,
          session,
          { x: start.x, z: start.z + clientDistance },
          clientAtMs,
          forward,
        ),
      ).toBe(false);
      expect(entity.pos).toEqual(airborneAuthority);
    }

    entity.onGround = true;
    entity.jumping = false;
    entity.pos.z = start.z + 4.55;
    const landedSample = { x: start.x, z: start.z + 5.6 };
    expect(applyMovementPositionSample(sim, session, landedSample, 800, forward)).toBe(true);
    expect(entity.pos.z).toBeCloseTo(landedSample.z, 10);
    const meta = sim.meta(entity.id);
    if (!meta) throw new Error('player metadata missing');
    Object.assign(meta.moveInput, forward);
    expect(beginMovementStop(sim, session, landedSample, neutral)).toBe(true);
    expect(meta.moveInput.forward).toBe(false);
    const stopped = { ...entity.pos };
    sim.tick();
    expect(entity.pos.z).toBeCloseTo(landedSample.z, 10);
    expect(entity.pos.x).toBeCloseTo(stopped.x, 10);
    expect(entity.pos.z).toBeCloseTo(stopped.z, 10);

    const freshSession: MovementPositionSession = { pid: entity.id, movementPositionState: null };
    entity.pos.z = start.z + 4.55;
    expect(applyMovementPositionSample(sim, freshSession, landedSample, 800, forward)).toBe(false);
  });

  it('does not bank unused airborne time into a landing teleport', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    entity.onGround = false;
    entity.jumping = true;
    for (let clientAtMs = 50; clientAtMs <= 750; clientAtMs += 50) {
      expect(applyMovementPositionSample(sim, session, start, clientAtMs, forward)).toBe(false);
    }

    entity.onGround = true;
    entity.jumping = false;
    expect(
      applyMovementPositionSample(sim, session, { x: start.x + 1.49, z: start.z }, 800, forward),
    ).toBe(false);
    expect(entity.pos.x).toBe(start.x);
  });

  it('pins the short authority-window boundary after valid airborne travel', () => {
    const prepareLanding = () => {
      const result = setup();
      const entity = result.sim.player;
      const start = { x: entity.pos.x, z: entity.pos.z };
      expect(applyMovementPositionSample(result.sim, result.session, start, 0, neutral)).toBe(true);
      entity.onGround = false;
      entity.jumping = true;
      entity.vz = RUN_SPEED;
      for (let clientAtMs = 50; clientAtMs <= 200; clientAtMs += 50) {
        expect(
          applyMovementPositionSample(
            result.sim,
            result.session,
            { x: start.x, z: start.z + (clientAtMs / 1000) * RUN_SPEED },
            clientAtMs,
            forward,
          ),
        ).toBe(false);
        expect(result.session.movementPositionState).not.toBeNull();
      }
      entity.onGround = true;
      entity.jumping = false;
      return { ...result, start, authority: { ...entity.pos } };
    };

    const inside = prepareLanding();
    expect(
      applyMovementPositionSample(
        inside.sim,
        inside.session,
        { x: inside.start.x, z: inside.start.z + 1.61 },
        250,
        forward,
      ),
    ).toBe(true);

    const outside = prepareLanding();
    expect(
      applyMovementPositionSample(
        outside.sim,
        outside.session,
        { x: outside.start.x, z: outside.start.z + 1.62 },
        250,
        forward,
      ),
    ).toBe(false);
    expect(outside.sim.player.pos).toEqual(outside.authority);
  });

  it('does not reset directional tolerance for fragmented airborne samples', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    entity.onGround = false;
    entity.jumping = true;

    for (let index = 1; index <= 165; index++) {
      expect(
        applyMovementPositionSample(
          sim,
          session,
          { x: start.x + index * 0.009, z: start.z },
          index * 4.5,
          forward,
        ),
      ).toBe(false);
    }
    entity.onGround = true;
    entity.jumping = false;
    expect(
      applyMovementPositionSample(sim, session, { x: start.x + 1.485, z: start.z }, 744, forward),
    ).toBe(false);
    expect(entity.pos.x).toBe(start.x);
  });

  it('keeps ordinary walk-off samples bounded until landing', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

    entity.onGround = false;
    entity.jumping = false;
    entity.vz = 7;
    const airborneAuthority = { ...entity.pos };
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
    ).toBe(false);
    expect(entity.pos).toEqual(airborneAuthority);
    expect(session.movementPositionState?.suspendedAirborne).toBe(true);

    entity.onGround = true;
    entity.pos.z = start.z + 0.2;
    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.7 }, 100, forward),
    ).toBe(true);
  });

  it('clears the stream when an airborne sample exceeds elapsed movement speed', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    const start = { x: entity.pos.x, z: entity.pos.z };
    expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
    entity.onGround = false;
    entity.jumping = true;
    const authority = { ...entity.pos };

    expect(
      applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.41 }, 50, forward),
    ).toBe(false);
    expect(session.movementPositionState).toBeNull();
    expect(entity.pos).toEqual(authority);
  });

  it('clears position authority during server-owned mount and aura movement', () => {
    for (const lock of ['dismount', 'race', 'forced'] as const) {
      const { sim, session } = setup();
      const entity = sim.player;
      const start = { x: entity.pos.x, z: entity.pos.z };
      expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);

      if (lock === 'dismount') {
        entity.mountKey = 'valorsteed';
        entity.mountCastKey = '';
        entity.mountCastRemaining = 1;
      } else if (lock === 'race') {
        const meta = sim.meta(entity.id);
        if (!meta) throw new Error('player metadata missing');
        meta.mountRace = {
          raceId: 'movement-test',
          ownerId: entity.id,
          phase: 'countdown',
          goTick: sim.tickCount + 60,
          deadlineTick: sim.tickCount + 600,
          clearedMask: 0,
        };
      } else {
        entity.auras.push({
          id: 'movement_test_pull',
          name: 'Movement Test Pull',
          kind: 'forced_move',
          remaining: 1,
          duration: 1,
          value: 1,
          sourceId: entity.id,
          school: 'physical',
        });
      }

      expect(
        applyMovementPositionSample(sim, session, { x: start.x, z: start.z + 0.35 }, 50, forward),
      ).toBe(false);
      expect(session.movementPositionState).toBeNull();
      expect(entity.pos.z).toBe(start.z);
    }
  });

  it('clears position authority for every server-owned locomotion mode', () => {
    const locks = [
      {
        name: 'dead',
        apply: (sim: Sim) => {
          sim.player.dead = true;
        },
      },
      {
        name: 'rooted',
        apply: (sim: Sim) => {
          sim.player.auras.push({
            id: 'movement_test_root',
            name: 'Movement Test Root',
            kind: 'root',
            remaining: 1,
            duration: 1,
            value: 1,
            sourceId: sim.player.id,
            school: 'physical',
          });
        },
      },
      {
        name: 'climbing',
        apply: (sim: Sim) => {
          sim.player.climbing = true;
        },
      },
      {
        name: 'charge',
        apply: (sim: Sim) => {
          sim.player.chargeTargetId = sim.player.id;
        },
      },
      {
        name: 'heroic leap',
        apply: (sim: Sim) => {
          sim.player.leap = {
            from: { ...sim.player.pos },
            to: { ...sim.player.pos },
            elapsed: 0,
            duration: 1,
            apex: 1,
            landingAoe: { min: 1, max: 1, radius: 1 },
            abilityName: 'Movement Test Leap',
            abilityId: 'movement_test_leap',
            school: 'physical',
          };
        },
      },
      {
        name: 'follow',
        apply: (sim: Sim) => {
          sim.player.followTargetId = sim.player.id;
        },
      },
      {
        name: 'Valkyr flight',
        apply: (sim: Sim) => {
          sim.player.auras.push({
            id: VALKYRS_CALLING_FLIGHT_AURA_ID,
            name: 'Movement Test Flight',
            kind: 'buff_speed',
            remaining: 1,
            duration: 1,
            value: 1,
            sourceId: sim.player.id,
            school: 'holy',
          });
        },
      },
      {
        name: 'delve',
        apply: (sim: Sim) => {
          sim.player.pos.x = DELVE_X_MIN;
        },
      },
      {
        name: 'rift',
        apply: (sim: Sim) => {
          sim.player.pos.x = RIFT_X_MIN;
        },
      },
    ];

    for (const lock of locks) {
      const { sim, session } = setup();
      const start = { x: sim.player.pos.x, z: sim.player.pos.z };
      expect(applyMovementPositionSample(sim, session, start, 0, neutral)).toBe(true);
      lock.apply(sim);
      const authority = { ...sim.player.pos };

      expect(
        applyMovementPositionSample(
          sim,
          session,
          { x: authority.x, z: authority.z + 0.35 },
          50,
          forward,
        ),
        lock.name,
      ).toBe(false);
      expect(session.movementPositionState, lock.name).toBeNull();
      expect(sim.player.pos, lock.name).toEqual(authority);
    }
  });

  it('leaves swimming positions under the full server movement kernel', () => {
    const { sim, session } = setup();
    const entity = sim.player;
    entity.pos.x = -180;
    entity.pos.z = 141.85;
    entity.pos.y = swimSurfaceY(entity.pos.x, entity.pos.z, sim.cfg.seed);
    entity.prevPos = { ...entity.pos };
    expect(isSwimming(entity, sim.cfg.seed)).toBe(true);

    expect(
      applyMovementPositionSample(sim, session, { x: entity.pos.x, z: entity.pos.z }, 0, neutral),
    ).toBe(false);
    expect(session.movementPositionState).toBeNull();
  });

  it('drops malformed samples', () => {
    expect(parseMovementPositionSample({ x: 1, z: Number.NaN })).toBeNull();
    expect(parseMovementPositionSample({ x: 1, z: 2 })).toEqual({ x: 1, z: 2 });
  });
});
