import { describe, expect, it } from 'vitest';
import { advanceDeckFrame, deckFrameFor } from '../src/render/deck_frame';
import { SHIP_SHADOW_REACH, shipShadowHold } from '../src/render/ship_shadow_hold';
import { EASTBROOK_WICKHARBOR_FERRY } from '../src/sim/content/transport_ships';
import { emptyTransportFerryView, transportFerryViewAt } from '../src/sim/transport_schedule';
import { WATER_LEVEL } from '../src/sim/world';

// The sun's shadow map keeps full rate while a ship under way is inside its
// box (src/render/ship_shadow_hold.ts). Under the half-rate shed the map is
// redrawn every other frame, so a moving ship's own shadows (rigging and masts
// across the sails and deck) sat a frame behind the hull on alternate frames
// and snapped back on the next: the flicker at sea.

const ROUTE = EASTBROOK_WICKHARBOR_FERRY;
const DOCKED = ROUTE.timings.docked / 2;
const SAILING = ROUTE.timings.docked + 40;
const EXTENT = 67;

function world(clock: number) {
  const view = emptyTransportFerryView(ROUTE);
  return {
    clock,
    ferryView: () => transportFerryViewAt(ROUTE, clock, WATER_LEVEL, true, view),
  };
}

/** A key light aimed at (x, z), the centre of its shadow box. */
function light(x: number, z: number) {
  return { target: { position: { x, z } } };
}

function drawnShip(clock: number) {
  const w = world(clock);
  const df = deckFrameFor(w);
  advanceDeckFrame(df, w, 1 / 60);
  return { w, ship: df.ships[0].drawn };
}

describe('the shadow map holds full rate around a ship under way', () => {
  it('holds while a sailing ship is inside the shadow box, however it is aimed', () => {
    const { w, ship } = drawnShip(SAILING);
    expect(shipShadowHold(w, light(ship.x, ship.z), EXTENT)).toBe(true);
    // a corner of the box, plus the hull and its long shadows beyond it
    const edge = EXTENT * Math.SQRT2 + SHIP_SHADOW_REACH - 1;
    expect(shipShadowHold(w, light(ship.x + edge, ship.z), EXTENT)).toBe(true);
  });

  it('lets the shed run once the ship is well outside the box', () => {
    const { w, ship } = drawnShip(SAILING);
    const far = EXTENT * Math.SQRT2 + SHIP_SHADOW_REACH + 1;
    expect(shipShadowHold(w, light(ship.x + far, ship.z), EXTENT)).toBe(false);
    expect(shipShadowHold(w, light(ship.x, ship.z - far), EXTENT)).toBe(false);
  });

  it('never holds for a moored ship: nothing moves, so nothing flickers', () => {
    const { w, ship } = drawnShip(DOCKED);
    expect(shipShadowHold(w, light(ship.x, ship.z), EXTENT)).toBe(false);
  });

  it('never holds in a world with no ferry timetable', () => {
    const w = { ferryView: () => null };
    advanceDeckFrame(deckFrameFor(w), w, 1 / 60);
    expect(shipShadowHold(w, light(0, 0), EXTENT)).toBe(false);
    // ...nor in one whose deck frame never advanced
    expect(shipShadowHold({}, light(0, 0), EXTENT)).toBe(false);
  });
});
