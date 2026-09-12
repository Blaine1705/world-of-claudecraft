import { expect, it } from 'vitest';
import { applyGliderBoost } from '../src/sim/minigames/glider_boost';
import { createGliderFlightState } from '../src/sim/minigames/glider_flight';
import {
  createGliderActionBarView,
  gliderBoostDescription,
} from '../src/ui/hud/vehicle/glider_action_bar_view';

it('reuses its slots and describes the live flat boost, cap and cooldown', () => {
  const glider = createGliderFlightState(false);
  glider.speed = 10;
  const view = createGliderActionBarView();
  const before = view.tick(glider, '1');
  const slot = before.slots[0];
  expect(slot.usable).toBe(true);
  expect(applyGliderBoost(glider)).toBe(true);
  expect(glider.speed).toBe(24);
  const after = view.tick(glider, '1');
  expect(after).toBe(before);
  expect(after.slots[0]).toBe(slot);
  expect(slot.cooldownRemaining).toBe(10);
  expect(slot.usable).toBe(false);
  expect(gliderBoostDescription()).toBe(
    'Increase your flight speed by 14 yd/s, up to 38 yd/s. Available while flying. Recharges in 10 seconds.',
  );
  glider.tick += 200;
  glider.speed = 35;
  applyGliderBoost(glider);
  expect(glider.speed).toBe(38);
});
