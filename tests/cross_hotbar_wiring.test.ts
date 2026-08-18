import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CROSS_HOTBAR_LAYER_BUTTONS } from '../src/game/cross_hotbar';
import { CrossHotbarBindings } from '../src/game/cross_hotbar_bindings';
import {
  type CrossHotbarHoldInfo,
  createCrossHotbar,
  crossHotbarButtonLabels,
  crossHotbarHold,
  crossHotbarResting,
} from '../src/game/cross_hotbar_wiring';

const PAD_MODE_CLASS = 'xhb-mode';

// minimal localStorage + body stubs (the test env is plain node, no DOM)
function installGlobals(): Set<string> {
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
  const classes = new Set<string>();
  (globalThis as any).document = {
    body: {
      classList: {
        toggle: (name: string, on: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
        },
      },
    },
  };
  return classes;
}

let bodyClasses: Set<string>;
beforeEach(() => {
  bodyClasses = installGlobals();
});

function fakePad(connected: boolean, kind = 'xbox' as const) {
  return {
    isConnected: () => connected,
    getKind: () => kind,
    setCrossHotbar: vi.fn(),
    setCrossHotbarExpand: vi.fn(),
  };
}

function fakeHost() {
  return {
    setCrossHotbar: vi.fn<(hold: CrossHotbarHoldInfo | null) => void>(),
    refreshControllerLabels: vi.fn(),
  };
}

describe('crossHotbarButtonLabels', () => {
  it('names every cell for the connected pad brand', () => {
    const xbox = crossHotbarButtonLabels('xbox');
    expect(xbox).toHaveLength(CROSS_HOTBAR_LAYER_BUTTONS.length);
    // d-pad diamond then the face diamond, top/left/right/bottom each.
    expect(xbox.slice(4)).toEqual(['Y', 'X', 'B', 'A']);
  });

  it('follows the brand rather than the position, so a Nintendo pad reads its own', () => {
    // The bottom face button is A on an Xbox pad and B on a Nintendo one; the
    // BINDING is position-indexed either way, so only the glyph may differ.
    expect(crossHotbarButtonLabels('xbox')[7]).toBe('A');
    expect(crossHotbarButtonLabels('nintendo')[7]).toBe('B');
    expect(crossHotbarButtonLabels('playstation')[7]).toBe('Cross');
  });
});

describe('crossHotbarResting', () => {
  it('is the primary set left eight, shown but not armed', () => {
    const resting = crossHotbarResting(new CrossHotbarBindings(), 'xbox');
    expect(resting.layer).toBe('left');
    expect(resting.active).toBe(false);
    expect(resting.expanded).toBe(false);
    expect(resting.slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(resting.buttons).toEqual(crossHotbarButtonLabels('xbox'));
  });
});

describe('crossHotbarHold', () => {
  it('is armed and carries the brand glyphs', () => {
    const hold = crossHotbarHold(new CrossHotbarBindings(), 'right', 1, 'playstation');
    expect(hold?.active).toBe(true);
    expect(hold?.expanded).toBe(true);
    expect(hold?.slots).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
    expect(hold?.buttons?.[7]).toBe('Cross');
  });

  it('is null once no trigger is held', () => {
    expect(crossHotbarHold(new CrossHotbarBindings(), null, 0, 'xbox')).toBeNull();
  });
});

describe('pad mode', () => {
  it('takes over the hotbar only when the cross hotbar is on AND a pad is present', () => {
    const host = fakeHost();
    const wiring = createCrossHotbar(() => host);

    wiring.syncPadMode(fakePad(false));
    expect(bodyClasses.has(PAD_MODE_CLASS)).toBe(false);
    // No pad: the desktop rows stay, and the overlay is closed outright.
    expect(host.setCrossHotbar).toHaveBeenLastCalledWith(null);

    wiring.syncPadMode(fakePad(true));
    expect(bodyClasses.has(PAD_MODE_CLASS)).toBe(true);
    // A pad: the bar rests on screen so hiding the desktop rows leaves the player
    // with a hotbar rather than nothing.
    expect(host.setCrossHotbar).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false, layer: 'left' }),
    );
  });

  it('gives the pad up again when it disconnects', () => {
    const host = fakeHost();
    const wiring = createCrossHotbar(() => host);
    wiring.syncPadMode(fakePad(true));
    wiring.syncPadMode(fakePad(false));
    expect(bodyClasses.has(PAD_MODE_CLASS)).toBe(false);
    expect(host.setCrossHotbar).toHaveBeenLastCalledWith(null);
  });

  it('re-labels the pad on every sync, so a brand swap reaches the glyphs', () => {
    const host = fakeHost();
    createCrossHotbar(() => host).syncPadMode(fakePad(true, 'xbox'));
    expect(host.refreshControllerLabels).toHaveBeenCalled();
  });

  it('hands the hotbar back the moment the setting is switched off', () => {
    const host = fakeHost();
    const wiring = createCrossHotbar(() => host);
    const pad = fakePad(true);
    wiring.syncPadMode(pad);
    expect(bodyClasses.has(PAD_MODE_CLASS)).toBe(true);

    const store = { set: (_k: string, v: boolean) => v };
    expect(wiring.applySetting(pad, store, 'gamepadCrossHotbar', false)).toBe(true);
    expect(pad.setCrossHotbar).toHaveBeenCalledWith(false);
    // The desktop rows come back WITHOUT waiting for a reconnect.
    expect(bodyClasses.has(PAD_MODE_CLASS)).toBe(false);
    expect(host.setCrossHotbar).toHaveBeenLastCalledWith(null);
  });

  it('leaves an unrelated setting alone', () => {
    const wiring = createCrossHotbar(() => fakeHost());
    const store = { set: (_k: string, v: boolean) => v };
    expect(wiring.applySetting(fakePad(true), store, 'gamepadInvertY', true)).toBe(false);
  });
});

describe('onHold', () => {
  it('rests rather than hiding when the trigger is released', () => {
    const host = fakeHost();
    const wiring = createCrossHotbar(() => host);
    wiring.onHold('left', 0, 'xbox');
    expect(host.setCrossHotbar).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: true, layer: 'left' }),
    );
    wiring.onHold(null, 0, 'xbox');
    // Releasing must NOT close the bar: in pad mode it is the only hotbar.
    expect(host.setCrossHotbar).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false, layer: 'left' }),
    );
  });
});
