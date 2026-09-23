import { describe, expect, it, vi } from 'vitest';
import { VaultMailTakeGuard } from '../../server/vault_mail_take_guard';
import { VaultMailTakeRecovery } from '../../server/vault_mail_take_recovery';
import type { Sim } from '../../src/sim/sim';

describe('vault mail take recovery', () => {
  it('restores only the pending durable parcel before releasing the command fence', async () => {
    const guard = new VaultMailTakeGuard();
    const ref = 'vault:test:7:1:7';
    guard.begin(7, 70, ref);
    const restoreVaultLetter = vi.fn(() => true);
    const sim = { postOffice: { restoreVaultLetter } } as unknown as Sim;
    const source = {
      recipientName: 'Owner',
      copper: 12,
      items: [{ itemId: 'thorium_ore', count: 1 }],
      read: false,
    };
    const load = vi.fn(async () => source);
    const recovery = new VaultMailTakeRecovery(
      guard,
      () => sim,
      (run) => run(),
      load,
    );
    expect(recovery.joinError(7)).toMatch(/recovering/);
    expect(recovery.joinError(7)).toMatch(/recovering/);
    await vi.waitFor(() => expect(guard.isLocked(7)).toBe(false));
    expect(load).toHaveBeenCalledWith(7, ref);
    expect(load).toHaveBeenCalledTimes(1);
    expect(restoreVaultLetter).toHaveBeenCalledWith('7', ref, source);
    expect(recovery.joinError(7)).toBeNull();
  });

  it('releases the fence without replay when the take already committed', async () => {
    const guard = new VaultMailTakeGuard();
    guard.begin(7, 70, 'vault:test:7:1:7');
    const restoreVaultLetter = vi.fn(() => true);
    const sim = { postOffice: { restoreVaultLetter } } as unknown as Sim;
    const recovery = new VaultMailTakeRecovery(
      guard,
      () => sim,
      (run) => run(),
      async () => null,
    );
    recovery.recover(7);
    await vi.waitFor(() => expect(guard.isLocked(7)).toBe(false));
    expect(restoreVaultLetter).not.toHaveBeenCalled();
  });
});
