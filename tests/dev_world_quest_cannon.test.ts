import { expect, it } from 'vitest';
import { NORTH_WATCH_CANNON } from '../src/sim/content/vehicle_stations';
import { Sim } from '../src/sim/sim';

it('rejects developer preparation in ordinary worlds', () => {
  const sim = new Sim({ seed: 20061, playerClass: 'mage', devCommands: false });
  sim.chat('/dev cannon');
  expect(sim.players.get(sim.playerId)!.devWorldQuestCycle).toBeNull();
  expect(sim.entities.has(NORTH_WATCH_CANNON.entityId)).toBe(false);
});

it('arms the normal rotation and entry path without granting progress', () => {
  const sim = new Sim({ seed: 20061, playerClass: 'mage', devCommands: true });
  sim.chat('/dev cannon');
  sim.chat(`/dev tp ${NORTH_WATCH_CANNON.x} ${NORTH_WATCH_CANNON.z + 2}`);
  sim.tick();
  const meta = sim.players.get(sim.playerId)!;
  expect(sim.player.level).toBeGreaterThanOrEqual(10);
  expect(meta.worldQuestLog.get(NORTH_WATCH_CANNON.questId)?.state).toBe('active');
  expect(meta.worldQuestLog.get(NORTH_WATCH_CANNON.questId)?.count).toBe(0);
  expect(sim.pickUpObject(NORTH_WATCH_CANNON.entityId)).toBe(true);
});
