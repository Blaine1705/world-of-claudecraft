// The renderer half of the desktop shell's GPU preference: the capability probe
// the options row is gated on, and the boot reflection that mirrors the STORED
// shell value into the local setting.
//
// The polarity is the whole point of this file: the setting (forceHighPerfGpu)
// and the shell store field (gpuForceOptOut) are INVERSES, and the reflection
// must invert exactly once. Both directions are asserted, so flipping the `!`
// (or dropping it) fails here.

import { describe, expect, it } from 'vitest';
import {
  desktopGpuPrefSupported,
  syncDesktopGpuPrefSetting,
} from '../src/game/desktop_gpu_pref_sync';
import type { DesktopBridge } from '../src/runtime';

// A settings double that records every write, so "wrote nothing" is provable
// rather than inferred from a final value that happened to match the default.
function fakeSettings() {
  const writes: { key: string; value: boolean }[] = [];
  return {
    writes,
    set(key: 'forceHighPerfGpu', value: boolean): boolean {
      writes.push({ key, value });
      return value;
    },
  };
}

// Only the members this module reads; the rest of DesktopBridge is irrelevant
// here, so the double is cast at the one boundary instead of stubbing 20 methods.
function fakeBridge(members: Partial<DesktopBridge>): DesktopBridge {
  return members as DesktopBridge;
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

describe('desktop_gpu_pref_sync: boot reflection', () => {
  it('inverts a stored opt-out of false into the setting ON', async () => {
    const settings = fakeSettings();
    await syncDesktopGpuPrefSetting(fakeBridge({ getGpuForceOptOut: async () => false }), settings);
    expect(settings.writes).toEqual([{ key: 'forceHighPerfGpu', value: true }]);
  });

  it('inverts a stored opt-out of true into the setting OFF', async () => {
    const settings = fakeSettings();
    await syncDesktopGpuPrefSetting(fakeBridge({ getGpuForceOptOut: async () => true }), settings);
    expect(settings.writes).toEqual([{ key: 'forceHighPerfGpu', value: false }]);
  });

  it('writes nothing when the shell has no getter (an older installed shell)', async () => {
    const settings = fakeSettings();
    await syncDesktopGpuPrefSetting(fakeBridge({ setGpuForceOptOut: async () => true }), settings);
    expect(settings.writes).toEqual([]);
  });

  it('writes nothing without a bridge (the web build)', async () => {
    const settings = fakeSettings();
    await syncDesktopGpuPrefSetting(null, settings);
    expect(settings.writes).toEqual([]);
  });

  it('swallows a rejected read and leaves the stored setting alone', async () => {
    const settings = fakeSettings();
    await expect(
      syncDesktopGpuPrefSetting(
        fakeBridge({
          getGpuForceOptOut: async () => {
            throw new Error('prefs store unavailable');
          },
        }),
        settings,
      ),
    ).resolves.toBeUndefined();
    expect(settings.writes).toEqual([]);
  });

  it('ignores a non-boolean answer instead of coercing it', async () => {
    // The shell is an independently updated binary: a malformed payload must not
    // be truthiness-coerced into a verdict (0 and '' would both read as opt-out
    // false, silently forcing the GPU back on for a player who opted out).
    for (const bogus of [undefined, null, 0, 1, '', 'true']) {
      const settings = fakeSettings();
      await syncDesktopGpuPrefSetting(
        fakeBridge({
          getGpuForceOptOut: (async () => bogus) as unknown as () => Promise<boolean>,
        }),
        settings,
      );
      expect(settings.writes).toEqual([]);
    }
  });

  it('reads through the bridge as its receiver (a preload object using `this`)', async () => {
    const settings = fakeSettings();
    const bridge = {
      optOut: true,
      async getGpuForceOptOut(this: { optOut: boolean }): Promise<boolean> {
        return this.optOut;
      },
    } as unknown as DesktopBridge;
    await syncDesktopGpuPrefSetting(bridge, settings);
    expect(settings.writes).toEqual([{ key: 'forceHighPerfGpu', value: false }]);
  });
});
