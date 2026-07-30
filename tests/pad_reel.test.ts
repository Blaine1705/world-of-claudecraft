// The pad reel decision (src/game/pad_reel.ts): mid fishing cast, the
// controller's interact press re-uses a carried fishing implement to answer
// the bite; every other state stays a plain interact. Pure core plus the
// main.ts wiring pin (the dispatch is a closure a unit test cannot reach).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { padReelItemId } from '../src/game/pad_reel';
import { ITEMS } from '../src/sim/data';
import { FISHING_CAST_ID, GATHER_CAST_ID } from '../src/sim/types';

describe('padReelItemId', () => {
  it('answers the carried implement only during a live fishing cast', () => {
    const pole = [{ itemId: 'simple_fishing_pole', count: 1 }];
    // Sanity on the fixture: the pole really is the fishing use kind.
    expect(ITEMS.simple_fishing_pole.use?.type).toBe('fishing');
    expect(padReelItemId(FISHING_CAST_ID, pole)).toBe('simple_fishing_pole');
    // Not casting, casting something else, or a gather cast: plain interact.
    expect(padReelItemId(null, pole)).toBeNull();
    expect(padReelItemId('fireball', pole)).toBeNull();
    expect(padReelItemId(GATHER_CAST_ID, pole)).toBeNull();
  });

  it('a tiered rod (gatherTool fishing) reels too; land tools never do', () => {
    const rod = [{ itemId: 'ironreel_fishing_rod', count: 1 }];
    expect(ITEMS.ironreel_fishing_rod.use).toMatchObject({
      type: 'gatherTool',
      professionId: 'fishing',
    });
    expect(padReelItemId(FISHING_CAST_ID, rod)).toBe('ironreel_fishing_rod');
    const pick = [{ itemId: 'copper_mining_pick', count: 1 }];
    expect(padReelItemId(FISHING_CAST_ID, pick)).toBeNull();
    expect(padReelItemId(FISHING_CAST_ID, [])).toBeNull();
  });

  it('main.ts wires the reel ahead of the nearby-interaction scan (source pin)', () => {
    const mainTs = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    // The braced form is unique to the pad dispatch (the keyboard Input
    // callbacks carry their own unbraced interact/bags pair earlier), so the
    // bags terminator must be searched FROM the pad case.
    const start = mainTs.indexOf("case 'interact': {");
    expect(start).toBeGreaterThan(-1);
    const interactCase = mainTs.slice(start, mainTs.indexOf("case 'bags':", start));
    expect(interactCase).toContain(
      'const reelRod = padReelItemId(world.player.castingAbility, world.inventory);',
    );
    // The reel wins BEFORE interactKey runs: a live bobber must never be
    // answered with a nearby scan.
    expect(interactCase.indexOf('padReelItemId')).toBeLessThan(
      interactCase.indexOf('interactKey()'),
    );
  });
});
