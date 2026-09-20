// electron/host_essentials.cjs: the host facts the desktop shell attaches to
// every automatic perf report. Everything here is dependency-injected, so the
// whole flow (four registry reads, the Electron getters, the collection guard)
// runs against fakes with no Electron and no real registry.

import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_OVERLAY_AC_VALUE,
  ACTIVE_OVERLAY_DC_VALUE,
  ACTIVE_POWER_SCHEME_VALUE,
  createHostEssentials,
  foldGameModeReading,
  foldHagsReading,
  foldPowerModeGuid,
  foldPowerPlanGuid,
  GAME_BAR_KEY,
  GRAPHICS_DRIVERS_KEY,
  HOST_MEM_FREE_STEP_MB,
  HOST_MEM_TOTAL_MAX_MB,
  HOST_MEM_TOTAL_STEP_MB,
  POWER_SCHEMES_KEY,
  readLiveHostEssentials,
  readStaticHostEssentials,
  reduceAppMemory,
} from '../electron/host_essentials.cjs';

const sz = (value: string) => ({ type: 'sz' as const, value });
const dword = (value: number) => ({ type: 'dword' as const, value });

describe('power plan folding', () => {
  it('maps the four well-known plan GUIDs, case and braces insensitively', () => {
    expect(foldPowerPlanGuid(sz('381b4222-f694-41f0-9685-ff5bb260df2e'))).toBe('balanced');
    expect(foldPowerPlanGuid(sz('{8C5E7FDA-E8BF-4A96-9A85-A6E23A8C635C}'))).toBe(
      'high_performance',
    );
    expect(foldPowerPlanGuid(sz('a1841308-3541-4fab-bc81-f71556f20b4a'))).toBe('power_saver');
    expect(foldPowerPlanGuid(sz('e9a42b02-d5df-448d-aa00-03f14749eb61'))).toBe('ultimate');
  });

  it('never lets a custom plan GUID through: it folds to other', () => {
    // The whole reason the fold happens in the SHELL: the perf endpoint accepts
    // anonymous posts, and a custom plan's GUID is unique to one machine.
    const custom = '11111111-2222-3333-4444-555555555555';
    const folded = foldPowerPlanGuid(sz(custom));
    expect(folded).toBe('other');
    expect(folded).not.toContain('1111');
  });

  it('answers the unknown member for an absent value, a failed read, and a foreign type', () => {
    expect(foldPowerPlanGuid({ absent: true })).toBe('');
    expect(foldPowerPlanGuid(null)).toBe('');
    expect(foldPowerPlanGuid(dword(2))).toBe('');
    expect(foldPowerPlanGuid(sz(''))).toBe('');
  });
});

describe('power mode folding', () => {
  it('maps the four overlay GUIDs', () => {
    expect(foldPowerModeGuid(sz('961cc777-2547-4f9d-8174-7d86181b8a7a'))).toBe('best_efficiency');
    expect(foldPowerModeGuid(sz('00000000-0000-0000-0000-000000000000'))).toBe('balanced');
    expect(foldPowerModeGuid(sz('3af9b8d9-7c97-431d-ad78-34a8bfea439f'))).toBe(
      'better_performance',
    );
    expect(foldPowerModeGuid(sz('ded574b5-45a0-4f42-8737-46345c09c238'))).toBe('best_performance');
  });

  it('reads an ABSENT overlay value as balanced but a FAILED read as unknown', () => {
    // A machine whose slider was never moved has no overlay value at all, which
    // is the balanced overlay (the same rule Power.ps1 applies to the all-zero
    // GUID). "We could not look" is a different answer and stays ''.
    expect(foldPowerModeGuid({ absent: true })).toBe('balanced');
    expect(foldPowerModeGuid(null)).toBe('');
  });

  it('folds an unrecognised overlay GUID to other, never the GUID itself', () => {
    expect(foldPowerModeGuid(sz('deadbeef-0000-0000-0000-000000000001'))).toBe('other');
  });
});

describe('HAGS and Game Mode folding', () => {
  it('reads HwSchMode 2 as on, 1 as off, anything else as unknown', () => {
    expect(foldHagsReading(dword(2))).toBe(true);
    expect(foldHagsReading(dword(1))).toBe(false);
    expect(foldHagsReading(dword(0))).toBeNull();
    expect(foldHagsReading({ absent: true })).toBeNull();
    expect(foldHagsReading(null)).toBeNull();
  });

  it('reads Game Mode absent-or-1 as on and 0 as off, a failed read as unknown', () => {
    expect(foldGameModeReading({ absent: true })).toBe(true);
    expect(foldGameModeReading(dword(1))).toBe(true);
    expect(foldGameModeReading(dword(0))).toBe(false);
    expect(foldGameModeReading(null)).toBeNull();
  });
});

describe('readStaticHostEssentials', () => {
  function reader(answers: Record<string, unknown>) {
    const asked: { key: string; valueName: string }[] = [];
    const queryRegValue = async (request: { key: string; valueName: string }) => {
      asked.push(request);
      return (answers[request.valueName] ?? null) as never;
    };
    return { asked, queryRegValue };
  }

  it('reads the four values in parallel and folds them', async () => {
    const { asked, queryRegValue } = reader({
      [ACTIVE_POWER_SCHEME_VALUE]: sz('8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'),
      [ACTIVE_OVERLAY_AC_VALUE]: sz('ded574b5-45a0-4f42-8737-46345c09c238'),
      HwSchMode: dword(2),
      AutoGameModeEnabled: dword(0),
    });
    await expect(
      readStaticHostEssentials({ platform: 'win32', onBattery: false, queryRegValue }),
    ).resolves.toEqual({
      hostPowerPlan: 'high_performance',
      hostPowerMode: 'best_performance',
      hostHags: true,
      hostGameMode: false,
    });
    expect(asked.map((a) => `${a.key}|${a.valueName}`)).toEqual([
      `${POWER_SCHEMES_KEY}|${ACTIVE_POWER_SCHEME_VALUE}`,
      `${POWER_SCHEMES_KEY}|${ACTIVE_OVERLAY_AC_VALUE}`,
      `${GRAPHICS_DRIVERS_KEY}|HwSchMode`,
      `${GAME_BAR_KEY}|AutoGameModeEnabled`,
    ]);
  });

  it('reads the DC overlay value when the machine is on battery', async () => {
    const { asked, queryRegValue } = reader({
      [ACTIVE_OVERLAY_DC_VALUE]: sz('961cc777-2547-4f9d-8174-7d86181b8a7a'),
    });
    const out = await readStaticHostEssentials({
      platform: 'win32',
      onBattery: true,
      queryRegValue,
    });
    expect(out.hostPowerMode).toBe('best_efficiency');
    expect(asked.some((a) => a.valueName === ACTIVE_OVERLAY_DC_VALUE)).toBe(true);
    expect(asked.some((a) => a.valueName === ACTIVE_OVERLAY_AC_VALUE)).toBe(false);
  });

  it('runs nothing at all off Windows and answers the absent shape', async () => {
    const { asked, queryRegValue } = reader({});
    await expect(readStaticHostEssentials({ platform: 'darwin', queryRegValue })).resolves.toEqual({
      hostPowerPlan: '',
      hostPowerMode: '',
      hostHags: null,
      hostGameMode: null,
    });
    expect(asked).toHaveLength(0);
  });

  it('turns every failed read into an absent dimension, never a throw', async () => {
    const queryRegValue = async () => null as never;
    await expect(
      readStaticHostEssentials({ platform: 'win32', onBattery: false, queryRegValue }),
    ).resolves.toEqual({
      hostPowerPlan: '',
      hostPowerMode: '',
      hostHags: null,
      hostGameMode: null,
    });
  });
});

describe('reduceAppMemory', () => {
  it('sums every process, takes the LARGEST Tab, and the GPU process', () => {
    expect(
      reduceAppMemory([
        { type: 'Browser', memory: { workingSetSize: 100 * 1024 } },
        { type: 'Tab', memory: { workingSetSize: 200 * 1024 } },
        { type: 'Tab', memory: { workingSetSize: 900 * 1024 } },
        { type: 'GPU', memory: { workingSetSize: 300 * 1024 } },
        { type: 'Utility', memory: { workingSetSize: 50 * 1024 } },
      ]),
    ).toEqual({ appWorkingSetMb: 1550, appRendererWsMb: 900, appGpuWsMb: 300 });
  });

  it('answers nulls for a missing or malformed metrics list', () => {
    const absent = { appWorkingSetMb: null, appRendererWsMb: null, appGpuWsMb: null };
    expect(reduceAppMemory(null)).toEqual(absent);
    expect(reduceAppMemory([{ type: 'Tab' }, null, 7])).toEqual(absent);
  });
});

describe('readLiveHostEssentials', () => {
  it('rounds total memory to 256 MB and free memory to 64 MB', () => {
    const out = readLiveHostEssentials({
      // 16300 MB total, 5000 MB free, in kilobytes.
      process: { getSystemMemoryInfo: () => ({ total: 16300 * 1024, free: 5000 * 1024 }) },
      app: { getAppMetrics: () => [] },
      powerMonitor: { isOnBatteryPower: () => true },
    });
    expect((out.hostMemTotalMb ?? -1) % HOST_MEM_TOTAL_STEP_MB).toBe(0);
    expect(out.hostMemTotalMb).toBe(16384);
    expect((out.hostMemFreeMb ?? -1) % HOST_MEM_FREE_STEP_MB).toBe(0);
    expect(out.hostMemFreeMb).toBe(4992);
    expect(out.hostOnBattery).toBe(true);
  });

  it('clamps an absurd total and keeps every failed getter to its own field', () => {
    const out = readLiveHostEssentials({
      process: {
        getSystemMemoryInfo: () => ({ total: Number.MAX_SAFE_INTEGER, free: -1 }),
      },
      app: {
        getAppMetrics: () => {
          throw new Error('wedged');
        },
      },
      powerMonitor: { isOnBatteryPower: () => 'yes' as never },
    });
    expect(out.hostMemTotalMb).toBe(HOST_MEM_TOTAL_MAX_MB);
    expect(out.hostMemFreeMb).toBeNull();
    expect(out.appWorkingSetMb).toBeNull();
    // Strictly boolean: a non-boolean answer is not evidence.
    expect(out.hostOnBattery).toBeNull();
  });

  it('answers the absent shape with no Electron APIs at all', () => {
    const out = readLiveHostEssentials({ process: {} });
    expect(out).toEqual({
      hostMemTotalMb: null,
      hostMemFreeMb: null,
      appWorkingSetMb: null,
      appRendererWsMb: null,
      appGpuWsMb: null,
      hostOnBattery: null,
    });
  });
});

describe('createHostEssentials', () => {
  function harness(nowRef: { value: number }) {
    const queryRegValue = vi.fn(async () => ({ absent: true }) as never);
    const essentials = createHostEssentials({
      platform: 'win32',
      process: { getSystemMemoryInfo: () => ({ total: 8192 * 1024, free: 1024 * 1024 }) },
      app: { getAppMetrics: () => [{ type: 'GPU', memory: { workingSetSize: 1024 } }] },
      powerMonitor: { isOnBatteryPower: () => false },
      queryRegValue,
      now: () => nowRef.value,
      minIntervalMs: 60_000,
    });
    return { essentials, queryRegValue };
  }

  it('collects once for two calls inside the one-minute floor', async () => {
    const now = { value: 1_000_000 };
    const { essentials, queryRegValue } = harness(now);
    const first = await essentials.snapshot();
    now.value += 59_000;
    const second = await essentials.snapshot();
    // Four reads for ONE collection: a renderer that asks in a loop cannot turn
    // this channel into a reg.exe spawn loop.
    expect(queryRegValue).toHaveBeenCalledTimes(4);
    expect(second).toBe(first);
  });

  it('collects again once the floor has passed', async () => {
    const now = { value: 1_000_000 };
    const { essentials, queryRegValue } = harness(now);
    await essentials.snapshot();
    now.value += 60_001;
    await essentials.snapshot();
    expect(queryRegValue).toHaveBeenCalledTimes(8);
  });

  it('single-flights concurrent requests onto one collection', async () => {
    const now = { value: 1_000_000 };
    const { essentials, queryRegValue } = harness(now);
    const [a, b, c] = await Promise.all([
      essentials.snapshot(),
      essentials.snapshot(),
      essentials.snapshot(),
    ]);
    expect(queryRegValue).toHaveBeenCalledTimes(4);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('answers all ten fields, scalars only', async () => {
    const now = { value: 1_000_000 };
    const { essentials } = harness(now);
    const snapshot = await essentials.snapshot();
    expect(Object.keys(snapshot).sort()).toEqual([
      'appGpuWsMb',
      'appRendererWsMb',
      'appWorkingSetMb',
      'hostGameMode',
      'hostHags',
      'hostMemFreeMb',
      'hostMemTotalMb',
      'hostOnBattery',
      'hostPowerMode',
      'hostPowerPlan',
    ]);
    for (const value of Object.values(snapshot)) {
      expect(['number', 'string', 'boolean', 'object']).toContain(typeof value);
      if (typeof value === 'object') expect(value).toBeNull();
    }
  });
});
