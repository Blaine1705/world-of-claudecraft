import { describe, expect, it } from 'vitest';
import { decodeVehicleSession } from '../src/net/vehicle_session_wire';
import { NORTH_WATCH_CANNON } from '../src/sim/content/vehicle_stations';
import { Sim } from '../src/sim/sim';
import { TICK_RATE } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { worldQuestCycleOfferingQuest } from '../src/sim/world_quest_rotation';
import { WORLD_SEED } from '../src/sim/world_seed';

function rig() {
  const sim = new Sim({ seed: WORLD_SEED, playerClass: 'mage' });
  const player = sim.player;
  const meta = sim.meta(player.id)!;
  sim.setPlayerLevel(10);
  meta.devWorldQuestCycle = worldQuestCycleOfferingQuest('wq3_0', NORTH_WATCH_CANNON.questId);
  player.pos = {
    x: NORTH_WATCH_CANNON.x,
    z: NORTH_WATCH_CANNON.z + 2,
    y: terrainHeight(NORTH_WATCH_CANNON.x, NORTH_WATCH_CANNON.z + 2, WORLD_SEED),
  };
  player.prevPos = { ...player.pos };
  sim.tick();
  return { sim, player, meta };
}

describe('authoritative personal vehicles', () => {
  it('requires the offered quest, station, life and proximity, and enters by ordinary pickup interaction', () => {
    const { sim, player, meta } = rig();
    expect(sim.enterVehicle('forged')).toBe(false);
    const pos = { ...player.pos };
    player.pos.x += 30;
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(false);
    player.pos = pos;
    player.dead = true;
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(false);
    player.dead = false;
    meta.worldQuestLog.get(NORTH_WATCH_CANNON.questId)!.state = 'completed';
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(true);
    sim.leaveVehicle();
    meta.worldQuestLog.get(NORTH_WATCH_CANNON.questId)!.state = 'active';
    expect(sim.pickUpObject(NORTH_WATCH_CANNON.entityId)).toBe(true);
    expect(sim.vehicleSession?.stationId).toBe(NORTH_WATCH_CANNON.id);
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(false);
  });

  it('holds movement and class attacks, cancels an existing cast, and leaves idempotently', () => {
    const { sim, player, meta } = rig();
    player.castingAbility = 'fireball';
    player.castRemaining = 2;
    player.autoAttack = true;
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(true);
    expect(player.castingAbility).toBeNull();
    expect(player.autoAttack).toBe(false);
    const origin = { ...player.pos };
    meta.moveInput.forward = true;
    meta.moveInput.jump = true;
    sim.tick();
    expect(player.pos).toEqual(origin);
    sim.castAbility('fireball');
    sim.startAutoAttack();
    expect(player.castingAbility).toBeNull();
    expect(player.autoAttack).toBe(false);
    sim.leaveVehicle();
    sim.leaveVehicle();
    expect(sim.vehicleSession).toBeNull();
    expect(player.dead).toBe(false);
  });

  it('clears sessions on displacement, death, cycle changes and player removal', () => {
    const { sim, player, meta } = rig();
    const origin = { ...player.pos };
    sim.enterVehicle(NORTH_WATCH_CANNON.id);
    player.pos.x += 1;
    sim.tick();
    expect(sim.vehicleSession).toBeNull();
    player.pos = { ...origin };
    sim.enterVehicle(NORTH_WATCH_CANNON.id);
    player.dead = true;
    sim.tick();
    expect(sim.vehicleSession).toBeNull();
    player.dead = false;
    sim.enterVehicle(NORTH_WATCH_CANNON.id);
    meta.devWorldQuestCycle = 'wq3_0';
    sim.tick();
    expect(sim.vehicleSession).toBeNull();
    sim.removePlayer(player.id);
    expect(meta.vehicle).toBeNull();
  });

  it('uses the outer sim clock for the ten-second failure retry without killing the player', () => {
    const { sim, player, meta } = rig();
    sim.enterVehicle(NORTH_WATCH_CANNON.id);
    const state = meta.vehicle!.encounter;
    state.phase = 'wave';
    state.integrity = 10;
    state.enemies.push({
      id: 999,
      kind: 'infantry',
      hp: 100,
      x: NORTH_WATCH_CANNON.x,
      z: NORTH_WATCH_CANNON.field.maxZ - 0.001,
      slowUntilTick: 0,
    });
    sim.tick();
    expect(sim.vehicleSession).toBeNull();
    expect(player.dead).toBe(false);
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(false);
    for (let i = 0; i < 10 * TICK_RATE; i++) sim.tick();
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(true);
  });

  it('stops immediately when logout freezes reward eligibility', () => {
    const { sim, meta } = rig();
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(true);
    meta.leaving = true;
    expect(sim.useVehicleAction('cannonball', { x: 368, z: 1110 })).toBe(false);
    sim.tick();
    expect(sim.vehicleSession).toBeNull();
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(false);
  });

  it('wins all three waves through authoritative actions and awards the quest only once', () => {
    const { sim, player, meta } = rig();
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(true);
    const health = player.hp;
    const copper = sim.copper;
    const encounter = meta.vehicle!.encounter;
    const resultEvents: ReturnType<Sim['tick']> = [];
    for (let tick = 0; tick < 240 * TICK_RATE && meta.vehicle; tick++) {
      const enemy = [...encounter.enemies].sort((a, b) => b.z - a.z)[0];
      if (enemy) {
        const point = { x: enemy.x, z: Math.min(NORTH_WATCH_CANNON.field.maxZ, enemy.z + 1) };
        for (const action of ['cannonball', 'incendiary', 'grapeshot'] as const) {
          if (sim.useVehicleAction(action, point)) break;
        }
      }
      resultEvents.push(...sim.tick().filter((e) => e.type === 'cannonResult'));
    }
    expect(encounter.phase).toBe('won');
    expect(encounter.wave).toBe(2);
    expect(encounter.commanderKilled).toBe(true);
    expect(encounter.integrity).toBeGreaterThan(0);
    expect(encounter.tick / TICK_RATE).toBeGreaterThan(120);
    expect(encounter.tick / TICK_RATE).toBeLessThan(240);
    expect(player.hp).toBe(health);
    expect(meta.worldQuestLog.get(NORTH_WATCH_CANNON.questId)?.state).toBe('completed');
    expect(sim.copper).toBe(copper + 2_500 + 175 * player.level);
    expect(sim.vehicleSession).toBeNull();
    const awarded = sim.copper;
    expect(resultEvents).toHaveLength(1);
    expect(resultEvents[0]).toMatchObject({
      pid: player.id,
      integrity: encounter.integrity,
      shotsFired: encounter.shotsFired,
      shotsHit: encounter.shotsHit,
    });
    expect(sim.enterVehicle(NORTH_WATCH_CANNON.id)).toBe(true);
    meta.vehicle!.encounter.phase = 'won';
    meta.vehicle!.encounter.commanderKilled = true;
    const repeated = sim.tick();
    expect(sim.copper).toBe(awarded);
    expect(repeated.filter((e) => e.type === 'cannonResult')).toHaveLength(1);
    expect(sim.tick().filter((e) => e.type === 'cannonResult')).toHaveLength(0);
  }, 60_000); // Full-world integration advances over two minutes of canonical Sim ticks.

  it('mirrors bounded owner state by value and never persists the active encounter', () => {
    const { sim, meta } = rig();
    sim.enterVehicle(NORTH_WATCH_CANNON.id);
    for (let i = 0; i < 3 * TICK_RATE; i++) sim.tick();
    const view = sim.vehicleSession!;
    expect(decodeVehicleSession(view)).toEqual(view);
    view.encounter.enemies[0].hp = 0;
    expect(meta.vehicle!.encounter.enemies[0].hp).toBeGreaterThan(0);
    const save = sim.serializeCharacter(sim.playerId);
    expect(save).not.toHaveProperty('vehicle');
    expect(save).not.toHaveProperty('vehicleRetryAtTick');
    expect(JSON.stringify(save)).not.toContain('slowUntilTick');
  });
});
