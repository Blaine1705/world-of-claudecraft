import { describe, expect, it, vi } from 'vitest';
import { persistNewVaultOpens } from '../../server/vault_open_persistence';
import type { SimEvent } from '../../src/sim/types';

const opened = [{ type: 'treasureVaultOpened', rarity: 'rare', pid: 7 }] as SimEvent[];

describe('vault open persistence observer', () => {
  it('unseals only after the matching character save commits', async () => {
    let resolveSave!: (saved: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const confirm = vi.fn(() => true);
    const inFlight = new Set<string>();
    const deps = { attemptIdFor: () => '42:3', save, confirm, onError: vi.fn() };
    const pending = persistNewVaultOpens(opened, inFlight, deps);
    expect(save).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(persistNewVaultOpens(opened, inFlight, deps)).toEqual([]);
    resolveSave(true);
    await Promise.all(pending);
    expect(confirm).toHaveBeenCalledWith(7, '42:3');
    expect(inFlight.size).toBe(0);
  });

  it('keeps the entrance sealed after a refused save', async () => {
    const confirm = vi.fn(() => true);
    const pending = persistNewVaultOpens(opened, new Set(), {
      attemptIdFor: () => '42:3',
      save: async () => false,
      confirm,
      onError: vi.fn(),
    });
    await Promise.all(pending);
    expect(confirm).not.toHaveBeenCalled();
  });
});
