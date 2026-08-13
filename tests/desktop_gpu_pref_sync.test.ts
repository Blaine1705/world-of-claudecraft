// The renderer half of the desktop shell's GPU preference: the capability probe
// the options row is gated on, plus BOTH bridge crossings (the boot reflection
// that mirrors the stored shell value in, and the push that sends a player's
// choice out).
//
// The polarity is the whole point of this file: the setting (forceHighPerfGpu)
// and the shell store field (gpuForceOptOut) are INVERSES, and each crossing
// must invert exactly once. Both directions are asserted at both crossings, the
// push on the ARGUMENT the bridge actually receives, so flipping a `!` (or
// dropping one) fails here rather than shipping as "the toggle does not stick".

import { describe, expect, it } from 'vitest';
import {
  desktopGpuPrefSupported,
  pushDesktopGpuPref,
  syncDesktopGpuPrefSetting,
} from '../src/game/desktop_gpu_pref_sync';
import type { DesktopBridge } from '../src/runtime';

// A settings FACTORY double. It records every write, so "wrote nothing" is
// provable rather than inferred from a value that happened to match the
// default, and counts constructions, because when the store is built is itself
// load-bearing (Settings snapshots localStorage in its constructor).
function fakeSettingsFactory() {
  const writes: { key: string; value: boolean }[] = [];
  let constructed = 0;
  const create = () => {
    constructed += 1;
    return {
      set(key: 'forceHighPerfGpu', value: boolean): boolean {
        writes.push({ key, value });
        return value;
      },
    };
  };
  return { writes, create, constructions: () => constructed };
}

// Only the members this module reads; the rest of DesktopBridge is irrelevant
// here, so the double is cast at the one boundary instead of stubbing 20 methods.
function fakeBridge(members: Partial<DesktopBridge>): DesktopBridge {
  return members as DesktopBridge;
}

// Records the opt-out value the shell is handed, which is the only observable
// the push has: the write is fire-and-forget by design.
function recordingWriteBridge(): { bridge: DesktopBridge; received: boolean[] } {
  const received: boolean[] = [];
  return {
    received,
    bridge: fakeBridge({
      setGpuForceOptOut: async (optOut: boolean) => {
        received.push(optOut);
        return true;
      },
    }),
  };
}

describe('desktop_gpu_pref_sync: capability probe', () => {
  it('requires BOTH bridge methods (a half-updated or older shell hides the row)', () => {
    const get = async () => false;
    const set = async () => true;
    expect(
      desktopGpuPrefSupported(fakeBridge({ getGpuForceOptOut: get, setGpuForceOptOut: set })),
    ).toBe(true);
    // each half alone is not enough: the row would either not read or not write
    expect(desktopGpuPrefSupported(fakeBridge({ getGpuForceOptOut: get }))).toBe(false);
    expect(desktopGpuPrefSupported(fakeBridge({ setGpuForceOptOut: set }))).toBe(false);
    expect(desktopGpuPrefSupported(fakeBridge({}))).toBe(false);
  });

  it('answers false without a bridge at all (the web build and offline play)', () => {
    expect(desktopGpuPrefSupported(null)).toBe(false);
    expect(desktopGpuPrefSupported(undefined)).toBe(false);
  });

  it('rejects non-function members (a shell exposing the names as data)', () => {
    const bogus = { getGpuForceOptOut: true, setGpuForceOptOut: 'yes' } as unknown as DesktopBridge;
    expect(desktopGpuPrefSupported(bogus)).toBe(false);
  });
});

describe('desktop_gpu_pref_sync: options write push', () => {
  it('inverts the setting into the stored opt-out, in BOTH directions', () => {
    const { bridge, received } = recordingWriteBridge();
    // forcing the GPU on means the shell must NOT opt out, and vice versa
    pushDesktopGpuPref(bridge, true);
    expect(received).toEqual([false]);
    pushDesktopGpuPref(bridge, false);
    expect(received).toEqual([false, true]);
  });

  it('writes nothing when the shell has no setter (an older installed shell)', () => {
    const reads: string[] = [];
    const bridge = fakeBridge({
      getGpuForceOptOut: async () => {
        reads.push('read');
        return false;
      },
    });
    expect(() => pushDesktopGpuPref(bridge, false)).not.toThrow();
    // and it does not fall back to some other bridge member instead
    expect(reads).toEqual([]);
  });

  it('does nothing without a bridge at all (the web build)', () => {
    expect(() => pushDesktopGpuPref(null, true)).not.toThrow();
    expect(() => pushDesktopGpuPref(undefined, false)).not.toThrow();
  });

  it('swallows a rejected write instead of throwing into the options window', async () => {
    const bridge = fakeBridge({
      setGpuForceOptOut: async () => {
        throw new Error('prefs store unavailable');
      },
    });
    expect(() => pushDesktopGpuPref(bridge, false)).not.toThrow();
    // drain the microtask queue: an unswallowed rejection would surface here
    await Promise.resolve();
    await Promise.resolve();
  });

  it('survives a shell that throws synchronously (a torn-down IPC channel)', () => {
    const bridge = fakeBridge({
      setGpuForceOptOut: (() => {
        throw new Error('render frame was disposed');
      }) as () => Promise<boolean>,
    });
    expect(() => pushDesktopGpuPref(bridge, true)).not.toThrow();
  });

  it('writes through the bridge as its receiver (a preload object using `this`)', () => {
    const received: boolean[] = [];
    const bridge = {
      sink: received,
      async setGpuForceOptOut(this: { sink: boolean[] }, optOut: boolean): Promise<boolean> {
        this.sink.push(optOut);
        return true;
      },
    } as unknown as DesktopBridge;
    pushDesktopGpuPref(bridge, false);
    expect(received).toEqual([true]);
  });
});

describe('desktop_gpu_pref_sync: boot reflection', () => {
  it('inverts a stored opt-out of false into the setting ON', async () => {
    const settings = fakeSettingsFactory();
    await syncDesktopGpuPrefSetting(
      fakeBridge({ getGpuForceOptOut: async () => false }),
      settings.create,
    );
    expect(settings.writes).toEqual([{ key: 'forceHighPerfGpu', value: true }]);
  });

  it('inverts a stored opt-out of true into the setting OFF', async () => {
    const settings = fakeSettingsFactory();
    await syncDesktopGpuPrefSetting(
      fakeBridge({ getGpuForceOptOut: async () => true }),
      settings.create,
    );
    expect(settings.writes).toEqual([{ key: 'forceHighPerfGpu', value: false }]);
  });

  it('builds the settings store only AFTER the bridge read has resolved', async () => {
    // Settings snapshots localStorage in its constructor and save() rewrites the
    // whole blob, so a store built before the round trip would revert any write
    // that landed during it (the first-run graphics preset, the entry-crash
    // safe-preset step-down). The order log is what proves the ordering: a
    // constructor call before the await would read ['built', 'resolved'].
    const order: string[] = [];
    const settings = fakeSettingsFactory();
    await syncDesktopGpuPrefSetting(
      fakeBridge({
        getGpuForceOptOut: async () => {
          // yield first, so construction before the await is observable
          await Promise.resolve();
          order.push('resolved');
          return true;
        },
      }),
      () => {
        order.push('built');
        return settings.create();
      },
    );
    expect(order).toEqual(['resolved', 'built']);
    expect(settings.constructions()).toBe(1);
    expect(settings.writes).toEqual([{ key: 'forceHighPerfGpu', value: false }]);
  });

  it('never builds a store when the shell has no getter (an older installed shell)', async () => {
    const settings = fakeSettingsFactory();
    await syncDesktopGpuPrefSetting(
      fakeBridge({ setGpuForceOptOut: async () => true }),
      settings.create,
    );
    expect(settings.constructions()).toBe(0);
    expect(settings.writes).toEqual([]);
  });

  it('never builds a store without a bridge (the web build)', async () => {
    const settings = fakeSettingsFactory();
    await syncDesktopGpuPrefSetting(null, settings.create);
    expect(settings.constructions()).toBe(0);
    expect(settings.writes).toEqual([]);
  });

  it('swallows a rejected read, building nothing and leaving the setting alone', async () => {
    const settings = fakeSettingsFactory();
    await expect(
      syncDesktopGpuPrefSetting(
        fakeBridge({
          getGpuForceOptOut: async () => {
            throw new Error('prefs store unavailable');
          },
        }),
        settings.create,
      ),
    ).resolves.toBeUndefined();
    expect(settings.constructions()).toBe(0);
    expect(settings.writes).toEqual([]);
  });

  it('ignores a non-boolean answer instead of coercing it', async () => {
    // The shell is an independently updated binary: a malformed payload must not
    // be truthiness-coerced into a verdict (0 and '' would both read as opt-out
    // false, silently forcing the GPU back on for a player who opted out).
    for (const bogus of [undefined, null, 0, 1, '', 'true']) {
      const settings = fakeSettingsFactory();
      await syncDesktopGpuPrefSetting(
        fakeBridge({
          getGpuForceOptOut: (async () => bogus) as unknown as () => Promise<boolean>,
        }),
        settings.create,
      );
      expect(settings.constructions()).toBe(0);
      expect(settings.writes).toEqual([]);
    }
  });

  it('reads through the bridge as its receiver (a preload object using `this`)', async () => {
    const settings = fakeSettingsFactory();
    const bridge = {
      optOut: true,
      async getGpuForceOptOut(this: { optOut: boolean }): Promise<boolean> {
        return this.optOut;
      },
    } as unknown as DesktopBridge;
    await syncDesktopGpuPrefSetting(bridge, settings.create);
    expect(settings.writes).toEqual([{ key: 'forceHighPerfGpu', value: false }]);
  });
});
