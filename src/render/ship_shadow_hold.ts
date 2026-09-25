// Full-rate sun shadows around a ship under way. Under render-budget pressure
// the shadow map sheds to every other frame (shadow_cadence_core.ts), which is
// invisible for a still world but not for the one big caster that moves every
// frame: on the frames between, a sailing ship's own shadows (rigging and
// masts across its sails and deck) sit where the ship was a frame ago, then
// snap back on the next, a 30 Hz flicker over the whole ship. While a ship
// under way is inside the shadow box, the renderer keeps the map at full rate
// (renderer.ts applyShadowShed). A moored ship never holds: nothing moves.
// Reads the deck frame's drawn ships (deck_frame.ts), every route.

import { deckFrameFor } from './deck_frame';

/** How far past the shadow box a ship still matters (yards): half the hull's
 *  length plus the long shadows its masts throw at a low sun. */
export const SHIP_SHADOW_REACH = 40;

/**
 * Whether a ship under way stands inside the key light's shadow box: the box
 * is centred on the light's target and `halfExtent` wide each way, turned with
 * the light, so its corner reach bounds it whatever the aim.
 */
export function shipShadowHold(
  world: object,
  light: { target: { position: { x: number; z: number } } },
  halfExtent: number,
): boolean {
  const df = deckFrameFor(world);
  if (!df.active) return false;
  const reach = halfExtent * Math.SQRT2 + SHIP_SHADOW_REACH;
  const at = light.target.position;
  for (let i = 0; i < df.ships.length; i++) {
    const ship = df.ships[i];
    if (!ship.sailing) continue;
    if (Math.hypot(ship.drawn.x - at.x, ship.drawn.z - at.z) <= reach) return true;
  }
  return false;
}
