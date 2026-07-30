// The pad reel decision (src/game/pad_reel.ts): mid fishing cast, the
// controller's interact press re-uses a carried fishing implement to answer
// the bite; every other state stays a plain interact. Pure core plus the
// main.ts wiring pin (the dispatch is a closure a unit test cannot reach).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIND_ACTIONS } from '../src/game/keybinds';
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

  it('the touch Use button reels too: onInteract tries the rod before the scan (source pin)', () => {
    // The phase 14 QA found the touch path still had the exact failure the
    // pad arm closed: onInteract dispatched interactKey() directly, so a
    // mid-cast tap ran the nearby scan over a live bobber. Comment-stripped
    // so the arm's own prose cannot satisfy the pin.
    const mainTs = readFileSync(join(__dirname, '../src/main.ts'), 'utf8').replace(
      /^\s*\/\/.*$/gm,
      '',
    );
    const start = mainTs.indexOf('onInteract: () => {');
    expect(start).toBeGreaterThan(-1);
    const body = mainTs.slice(start, mainTs.indexOf('onChat:', start));
    expect(body).toContain(
      'const reelRod = padReelItemId(world.player.castingAbility, world.inventory);',
    );
    expect(body.indexOf('padReelItemId')).toBeLessThan(body.indexOf('interactKey()'));
    expect(body).toContain('world.useItem(reelRod);');
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

// The offered-but-dropped guard: the controller panel offers EVERY edge
// keybind action (options_window.ts gamepadActionOptions), so every one of
// them must have a dispatch arm, or binding it silently does nothing (the
// class that shipped Crafting, the dungeon finder, sheathe, and three pet
// edges dead on the pad).
describe('gamepad dispatch covers every action the controller panel offers', () => {
  it('every offered edge action id has a case in dispatchGamepadAction', () => {
    const mainTs = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    const start = mainTs.indexOf('function dispatchGamepadAction');
    expect(start).toBeGreaterThan(-1);
    const body = mainTs.slice(start, mainTs.indexOf('const gamepad = new GamepadManager', start));
    for (const action of BIND_ACTIONS) {
      if (action.kind !== 'edge') continue;
      if (action.id === 'attackMove') continue; // panel-excluded (mode-gated)
      if (action.id === 'jump' || action.id === 'autorun') continue; // Input-handled, never reach onAction (gamepad.ts GamepadCallbacks doc)
      if (action.id.startsWith('slot')) continue; // the slotN prefix arm
      expect(body.includes(`case '${action.id}'`), `pad dispatch drops '${action.id}'`).toBe(true);
    }
  });
});
