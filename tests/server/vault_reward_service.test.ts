import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { REALM } from '../../server/realm';
import { VaultRewardService } from '../../server/vault_reward_service';
import type { VaultOutcomeInput } from '../../server/vault_rewards_db';
import type { Sim } from '../../src/sim/sim';
import type { SimEvent } from '../../src/sim/types';

function fixture() {
  const owner = {
    characterId: 7,
    entityId: 70,
    vaultAttempt: { id: '7:1' },
    vaultAttemptDurable: true,
    wireRev: 0,
  };
  const chest = { id: 99, lootable: false, respawnTimer: Number.MAX_SAFE_INTEGER };
  const state = { entityId: 99, eligible: [70], claimed: [], pendingSave: true };
  const ctx = {
    players: new Map([[70, owner]]),
    entities: new Map([[99, chest]]),
    riftInstances: [{ vault: { attemptId: '7:1', chest: state } }],
  };
  const sim = { ctx, meta: (pid: number) => ctx.players.get(pid) } as unknown as Sim;
  const saveOwner = vi.fn(async () => true);
  const host = {
    sim,
    withPermit: async <T>(run: () => Promise<T>) => run(),
    saveOwner,
    claimDirect: vi.fn(async () => 'delivered' as const),
    characterPid: vi.fn((_id: number) => 70),
    onClaimFailure: vi.fn(),
  };
  return { owner, chest, state, ctx, host, saveOwner };
}

describe('vault reward orchestration', () => {
  it('routes a chest request through the frozen claim and marks the share once', async () => {
    const f = fixture();
    const claim = {
      characterId: 7,
      recipientName: 'Owner',
      items: [{ itemId: 'rusty_hatchet', count: 1 }],
      copper: 5,
      mailDueAt: new Date().toISOString(),
    };
    const db = {
      guestPayoutsForCycle: vi.fn(async () => 0),
      commitVaultOutcome: vi.fn(),
      loadVaultOutcome: vi.fn(async () => ({
        attemptId: '7:1',
        ownerCharacterId: 7,
        claims: [claim],
        completedAt: new Date(),
      })),
      dueVaultRewardClaims: vi.fn(async () => []),
    };
    const service = new VaultRewardService(f.host, db);
    service.observe([
      {
        type: 'treasureVaultClaimRequested',
        attemptId: '7:1',
        characterId: 7,
        pid: 70,
      } as SimEvent,
    ]);
    await vi.waitFor(() => expect(f.host.claimDirect).toHaveBeenCalledWith('7:1', claim, true));
    await vi.waitFor(() => expect(f.state.claimed).toContain(70));
    expect(f.host.claimDirect).toHaveBeenCalledOnce();
  });
  it('keeps an ambiguous live parcel after a premature missing read and books a later COMMIT', async () => {
    const f = fixture();
    const ref = `vault:${REALM}:7:1:7`;
    const row = {
      custodyRef: ref,
      recipient: { key: '7', name: 'Owner' },
      letter: 'vault_reward' as const,
      items: [{ itemId: 'rusty_hatchet', count: 1 }],
      copper: 5,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ direct: false, mail: false }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            recipient_matches: true,
            name_matches: true,
            letter_matches: true,
            items_match: true,
            copper_matches: true,
          },
        ],
      });
    const mail = vi.fn(() => true);
    Object.assign(f.host.sim, { mailSystemParcel: mail, hasCustodyParcel: () => false });
    const service = new VaultRewardService(
      f.host,
      {
        guestPayoutsForCycle: vi.fn(async () => 0),
        commitVaultOutcome: vi.fn(),
        loadVaultOutcome: vi.fn(),
        dueVaultRewardClaims: vi.fn(),
      },
      { query } as unknown as Pick<Pool, 'query' | 'connect'>,
    );
    const internal = service as unknown as {
      pendingLiveParcels: Map<string, { row: typeof row; attemptId: string }>;
      reconcileLiveParcels(): Promise<void>;
    };
    internal.pendingLiveParcels.set(ref, { row, attemptId: '7:1' });
    await internal.reconcileLiveParcels();
    expect(internal.pendingLiveParcels.has(ref)).toBe(true);
    expect(mail).not.toHaveBeenCalled();
    await internal.reconcileLiveParcels();
    expect(mail).toHaveBeenCalledOnce();
    expect(internal.pendingLiveParcels.has(ref)).toBe(false);
  });

  it('drops a missing parcel only after the direct claim is durably marked', async () => {
    const f = fixture();
    const ref = `vault:${REALM}:7:1:7`;
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ direct: true, mail: false }] });
    const service = new VaultRewardService(
      f.host,
      {
        guestPayoutsForCycle: vi.fn(async () => 0),
        commitVaultOutcome: vi.fn(),
        loadVaultOutcome: vi.fn(),
        dueVaultRewardClaims: vi.fn(),
      },
      { query } as unknown as Pick<Pool, 'query' | 'connect'>,
    );
    const internal = service as unknown as {
      pendingLiveParcels: Map<string, unknown>;
      reconcileLiveParcels(): Promise<void>;
    };
    internal.pendingLiveParcels.set(ref, {
      attemptId: '7:1',
      row: {
        custodyRef: ref,
        recipient: { key: '7', name: 'Owner' },
        letter: 'vault_reward',
        items: [{ itemId: 'rusty_hatchet', count: 1 }],
        copper: 5,
      },
    });
    await internal.reconcileLiveParcels();
    expect(internal.pendingLiveParcels.has(ref)).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('preserves an earlier ambiguous parcel through retry checkout, precommit and CAS failures', async () => {
    const claim = {
      attemptId: '7:1',
      characterId: 7,
      recipientName: 'Owner',
      items: [{ itemId: 'rusty_hatchet', count: 1 }],
      copper: 5,
      mailDueAt: new Date().toISOString(),
    };
    const ref = `vault:${REALM}:7:1:7`;
    for (const failure of ['checkout', 'precommit', 'cas'] as const) {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (failure === 'precommit' && sql.includes('INSERT INTO mail_custody_parcels'))
            throw new Error('precommit failed');
          if (sql.includes('INSERT INTO mail_custody_parcels')) return { rowCount: 1, rows: [] };
          return { rowCount: 0, rows: [] };
        }),
        release: vi.fn(),
      };
      const mailPool = {
        query: vi.fn(),
        connect: vi.fn(async () => {
          if (failure === 'checkout') throw new Error('checkout failed');
          return client;
        }),
      } as unknown as Pick<Pool, 'query' | 'connect'>;
      const service = new VaultRewardService(
        fixture().host,
        {
          guestPayoutsForCycle: vi.fn(async () => 0),
          commitVaultOutcome: vi.fn(),
          loadVaultOutcome: vi.fn(),
          dueVaultRewardClaims: vi.fn(),
        },
        mailPool,
      );
      const internal = service as unknown as {
        pendingLiveParcels: Map<string, unknown>;
        mailOne(input: typeof claim): Promise<void>;
      };
      internal.pendingLiveParcels.set(ref, {
        attemptId: claim.attemptId,
        row: {
          custodyRef: ref,
          recipient: { key: '7', name: 'Owner' },
          letter: 'vault_reward',
          items: claim.items,
          copper: claim.copper,
        },
      });
      if (failure === 'cas') await internal.mailOne(claim);
      else await expect(internal.mailOne(claim)).rejects.toThrow();
      expect(internal.pendingLiveParcels.has(ref)).toBe(true);
    }
  });
  it('keeps the chest sealed until every immutable claim commits, then ends the owner retry', async () => {
    const f = fixture();
    let finish: ((value: 'created') => void) | undefined;
    const commitVaultOutcome = vi.fn(
      (_input: VaultOutcomeInput) =>
        new Promise<'created'>((resolve) => {
          finish = resolve;
        }),
    );
    const db = {
      guestPayoutsForCycle: vi.fn(async () => 0),
      commitVaultOutcome,
      loadVaultOutcome: vi.fn(async () => null),
      dueVaultRewardClaims: vi.fn(async () => []),
    };
    const service = new VaultRewardService(f.host, db);
    service.observe(
      [
        {
          type: 'treasureVaultOutcomePending',
          attemptId: '7:1',
          ownerCharacterId: 7,
          claims: [
            {
              characterId: 7,
              recipientName: 'Owner',
              items: [{ itemId: 'thorium_ore', count: 2 }],
              copper: 10,
            },
          ],
        } as SimEvent,
      ],
      1_000,
    );
    expect(f.chest.lootable).toBe(false);
    expect(f.owner.vaultAttempt).toEqual({ id: '7:1' });
    expect(commitVaultOutcome.mock.calls[0][0].claims[0].mailDueAt).toEqual(new Date(301_000));
    finish?.('created');
    await vi.waitFor(() => expect(f.chest.lootable).toBe(true));
    expect(f.owner.vaultAttempt).toBeNull();
    expect(f.saveOwner).toHaveBeenCalledWith(70);
  });

  it('hydrates a live guest from mail-backed payout reservations before opening the chest', async () => {
    const f = fixture();
    const guest = {
      ...f.owner,
      characterId: 8,
      entityId: 71,
      worldQuestCycle: 'wq1_10',
      vaultGuestCycle: 'wq1_10',
      vaultGuestPayouts: 1,
    };
    f.ctx.players.set(71, guest);
    f.host.characterPid = vi.fn((id: number) => (id === 8 ? 71 : 70));
    let finishUsage: ((value: number) => void) | undefined;
    const guestPayoutsForCycle = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finishUsage = resolve;
        }),
    );
    const db = {
      guestPayoutsForCycle,
      commitVaultOutcome: vi.fn(async () => 'created' as const),
      loadVaultOutcome: vi.fn(async () => null),
      dueVaultRewardClaims: vi.fn(async () => []),
    };
    const service = new VaultRewardService(f.host, db);
    service.observe([
      {
        type: 'treasureVaultOutcomePending',
        attemptId: '7:1',
        ownerCharacterId: 7,
        claims: [
          { characterId: 7, recipientName: 'Owner', items: [], copper: 1 },
          { characterId: 8, recipientName: 'Guest', items: [], copper: 1, guestCycle: 'wq1_10' },
        ],
      } as SimEvent,
    ]);
    await vi.waitFor(() => expect(guestPayoutsForCycle).toHaveBeenCalledWith(8, 'wq1_10'));
    expect(f.chest.lootable).toBe(false);
    finishUsage?.(3);
    await vi.waitFor(() => expect(f.chest.lootable).toBe(true));
    expect(guest.vaultGuestPayouts).toBe(3);
  });

  it('reconciles an already-completed owner marker before permitting its portal', async () => {
    const f = fixture();
    const db = {
      guestPayoutsForCycle: vi.fn(async () => 0),
      commitVaultOutcome: vi.fn(async () => 'created' as const),
      loadVaultOutcome: vi.fn(async () => ({
        attemptId: '7:1',
        ownerCharacterId: 7,
        claims: [],
        completedAt: new Date(),
      })),
      dueVaultRewardClaims: vi.fn(async () => []),
    };
    const service = new VaultRewardService(f.host, db);
    service.reconcileJoin(70, 7, '7:1');
    expect(f.owner.vaultAttemptDurable).toBe(false);
    await vi.waitFor(() => expect(f.owner.vaultAttempt).toBeNull());
    expect(f.saveOwner).toHaveBeenCalledWith(70);
  });
});
