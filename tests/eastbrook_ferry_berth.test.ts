import { describe, expect, it } from 'vitest';
import { supportHeightAt } from '../src/sim/colliders';
import { PROPS } from '../src/sim/data';
import { buildDecorPropColliders } from '../src/sim/decor_prop_colliders';
import { EASTBROOK_HARBOR_DECKS } from '../src/sim/eastbrook_harbor';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';
import { groundHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

describe('Eastbrook ferry art berth', () => {
  const ferry = PROPS.decorProps?.find((prop) => prop.key === 'eastbrookFerry');

  it('places one large walkable ferry without removing the other ship', () => {
    expect(ferry).toBeDefined();
    expect(PROPS.decorProps?.filter((prop) => prop.key === 'eastbrookFerry')).toHaveLength(1);
    expect(ferry?.hw).toBe(3.5);
    expect(ferry?.hd).toBe(11.5);
    expect(PROPS.decorProps?.some((prop) => prop.key === 'hexShipBlue' && prop.x === -115 && prop.z === -63)).toBe(true);
    expect(PROPS.decorProps?.some((prop) => prop.key === 'seaBoatFishing' && prop.x === -119 && prop.z === -79)).toBe(true);
  });

  it('seats the collider on the rendered waterline and meets the boarding pier', () => {
    if (!ferry) throw new Error('ferry placement missing');
    const [deck] = buildDecorPropColliders(WORLD_SEED, [ferry]);
    expect(deck.type).toBe('obb');
    expect(deck.standable).toBe(true);
    expect(deck.moveTopY).toBeCloseTo(WATER_LEVEL - (ferry.float ?? 0) + 2.1, 6);
    const pier = EASTBROOK_HARBOR_DECKS[1];
    expect(pier.z + pier.hw).toBeCloseTo(-50.5, 6);
    const pierTop = groundHeight(-114, -50.6, WORLD_SEED);
    const shipTop = supportHeightAt(WORLD_SEED, -114, -50.3, 0.5, pierTop + MAX_STEP_HEIGHT);
    expect(shipTop).toBeCloseTo(deck.moveTopY ?? 0, 6);
    expect(pierTop - shipTop).toBeLessThan(MAX_STEP_HEIGHT);
  });
});
