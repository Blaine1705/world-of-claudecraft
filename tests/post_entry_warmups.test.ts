import { describe, expect, it, vi } from 'vitest';
import {
  type PostEntryWarmupDependencies,
  runPostEntryWarmups,
} from '../src/game/post_entry_warmups_core';

function dependencies(
  overrides: Partial<PostEntryWarmupDependencies> = {},
): PostEntryWarmupDependencies {
  return {
    settleFarVista: vi.fn().mockResolvedValue(true),
    onFarVistaSettled: vi.fn(),
    startCharacterPreloads: vi.fn().mockReturnValue(3),
    onCharacterPreloadsStarted: vi.fn(),
    startBackgroundPreloads: vi.fn().mockReturnValue(5),
    onBackgroundPreloadsStarted: vi.fn(),
    onWarmupError: vi.fn(),
    ...overrides,
  };
}

describe('runPostEntryWarmups', () => {
  it('starts fail-soft streaming without automatic secondary-context GPU work', async () => {
    const order: string[] = [];
    const deps = dependencies({
      startCharacterPreloads: vi.fn(() => {
        order.push('characters');
        return 3;
      }),
      startBackgroundPreloads: vi.fn(() => {
        order.push('background');
        return 5;
      }),
    });

    await runPostEntryWarmups(deps);
    await Promise.resolve();

    expect(order).toEqual(['characters', 'background']);
    expect(deps.settleFarVista).toHaveBeenCalledOnce();
    expect(deps.onFarVistaSettled).toHaveBeenCalledWith(true);
    expect(deps.onCharacterPreloadsStarted).toHaveBeenCalledWith(3);
    expect(deps.onBackgroundPreloadsStarted).toHaveBeenCalledWith(5);
    expect(deps.onWarmupError).not.toHaveBeenCalled();
  });

  it('reports a far-vista rejection without blocking the other warmups', async () => {
    const failure = new Error('far vista failed');
    const deps = dependencies({ settleFarVista: vi.fn().mockRejectedValue(failure) });

    await runPostEntryWarmups(deps);
    await Promise.resolve();

    expect(deps.startCharacterPreloads).toHaveBeenCalledOnce();
    expect(deps.startBackgroundPreloads).toHaveBeenCalledOnce();
    expect(deps.onBackgroundPreloadsStarted).toHaveBeenCalledWith(5);
    expect(deps.onWarmupError).toHaveBeenCalledWith('far-vista', failure);
  });

  it('reports a synchronous far-vista failure without blocking the other warmups', async () => {
    const failure = new Error('far vista threw');
    const deps = dependencies({
      settleFarVista: vi.fn(() => {
        throw failure;
      }),
    });

    await runPostEntryWarmups(deps);

    expect(deps.startCharacterPreloads).toHaveBeenCalledOnce();
    expect(deps.startBackgroundPreloads).toHaveBeenCalledOnce();
    expect(deps.onBackgroundPreloadsStarted).toHaveBeenCalledWith(5);
    expect(deps.onWarmupError).toHaveBeenCalledWith('far-vista', failure);
  });
});
