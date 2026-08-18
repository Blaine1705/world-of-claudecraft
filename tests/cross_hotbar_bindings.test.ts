import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CROSS_HOTBAR_EXPANDED_SET,
  CROSS_HOTBAR_PRIMARY_SET,
  CROSS_HOTBAR_SLOTS_PER_SET,
  defaultCrossHotbarLayout,
} from '../src/game/cross_hotbar';
import { CrossHotbarBindings } from '../src/game/cross_hotbar_bindings';
import { GP } from '../src/game/gamepad_map';
import { ACTION_BAR_SLOTS } from '../src/game/keybinds';

const STORE_KEY = 'woc_gamepad_xhb';

// minimal localStorage stub (the test env is plain node, no DOM)
function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

beforeEach(() => installStorage());

describe('CrossHotbarBindings', () => {
  it('starts on the sequential default layout', () => {
    expect(new CrossHotbarBindings().all()).toEqual(defaultCrossHotbarLayout());
  });

  it('resolves a trigger-plus-button press to its action-bar slot', () => {
    const b = new CrossHotbarBindings();
    expect(b.actionBarSlot(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toBe(0);
    expect(b.actionBarSlot(CROSS_HOTBAR_EXPANDED_SET, 'right', GP.A)).toBe(31);
  });

  it('persists a rebind and reloads it', () => {
    const b = new CrossHotbarBindings();
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, 21);
    expect(b.actionBarSlot(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toBe(21);
    expect(
      new CrossHotbarBindings().actionBarSlot(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP),
    ).toBe(21);
  });

  it('rebinds by the physical trigger-plus-button pair', () => {
    const b = new CrossHotbarBindings();
    b.bindButton(CROSS_HOTBAR_PRIMARY_SET, 'right', GP.B, 5);
    expect(b.actionBarSlot(CROSS_HOTBAR_PRIMARY_SET, 'right', GP.B)).toBe(5);
    // The same button on the OTHER layer is a different position and must not move.
    expect(b.actionBarSlot(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.B)).toBe(6);
  });

  it('ignores a rebind of a button the cross hotbar does not claim', () => {
    const b = new CrossHotbarBindings();
    b.bindButton(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.LB, 9);
    expect(b.all()).toEqual(defaultCrossHotbarLayout());
  });

  it('ignores an out-of-range set, position, or action-bar slot', () => {
    const b = new CrossHotbarBindings();
    b.bind(9, 0, 5);
    b.bind(CROSS_HOTBAR_PRIMARY_SET, -1, 5);
    b.bind(CROSS_HOTBAR_PRIMARY_SET, CROSS_HOTBAR_SLOTS_PER_SET, 5);
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, ACTION_BAR_SLOTS);
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, -1);
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, 1.5);
    expect(b.all()).toEqual(defaultCrossHotbarLayout());
  });

  it('allows two positions to cast the same action-bar slot', () => {
    const b = new CrossHotbarBindings();
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, 7);
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 1, 7);
    expect(b.setSlots(CROSS_HOTBAR_PRIMARY_SET)[0]).toBe(7);
    expect(b.setSlots(CROSS_HOTBAR_PRIMARY_SET)[1]).toBe(7);
  });

  it('resets every set back to the default', () => {
    const b = new CrossHotbarBindings();
    b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, 20);
    b.bind(CROSS_HOTBAR_EXPANDED_SET, 3, 2);
    b.reset();
    expect(b.all()).toEqual(defaultCrossHotbarLayout());
    expect(new CrossHotbarBindings().all()).toEqual(defaultCrossHotbarLayout());
  });

  it('falls back to the default when the stored value is corrupt', () => {
    localStorage.setItem(STORE_KEY, '{not json');
    expect(new CrossHotbarBindings().all()).toEqual(defaultCrossHotbarLayout());
  });

  it('repairs an out-of-range stored slot on load', () => {
    const stored = defaultCrossHotbarLayout();
    stored[0][0] = 999;
    localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    expect(
      new CrossHotbarBindings().actionBarSlot(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP),
    ).toBe(0);
  });

  it('survives storage being unavailable', () => {
    const b = new CrossHotbarBindings();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => b.bind(CROSS_HOTBAR_PRIMARY_SET, 0, 4)).not.toThrow();
    expect(b.actionBarSlot(CROSS_HOTBAR_PRIMARY_SET, 'left', GP.DPAD_UP)).toBe(4);
  });
});
