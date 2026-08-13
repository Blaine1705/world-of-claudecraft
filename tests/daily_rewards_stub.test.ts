// The one token-firewall-allowlisted file: the offline daily-rewards readout
// stub (src/sim/daily_rewards_stub.ts). The allowlist shape pin in
// architecture.test.ts refuses control flow and value imports there; this
// pins the VALUE, so a drive-by edit of the exempt file fails somewhere.
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';

describe('the offline daily-rewards stub', () => {
  it('resolves the constant disabled-wallet readout through the Sim facade', async () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', noPlayer: true });
    const status = await sim.dailyRewards();
    expect(status.enabled).toBe(true);
    expect(status.day).toBe('1970-01-01');
    expect(status.eligibility.eligible).toBe(false);
    expect(status.eligibility.reason).toBe('no_wallet');
    expect(status.eligibility.walletPubkey).toBeNull();
    expect(status.leaderboard).toEqual([]);
    expect(status.tasks).toEqual([]);
  });
});
