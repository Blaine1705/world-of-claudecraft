import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/moderation_db', () => ({
  accountCheaterMarkSeconds: vi.fn(async () => 0),
  burnAccountCheaterMark: vi.fn(async () => {}),
}));

import {
  applyCheaterMarkLive,
  type CheaterMarkSession,
  persistCheaterMark,
  refreshCheaterMark,
} from '../../server/cheater_mark_runtime';
import { accountCheaterMarkSeconds, burnAccountCheaterMark } from '../../server/moderation_db';
import { CHEATER_MARK_AURA_ID } from '../../src/sim/moderation';

// The Cheater mark's server runtime, extracted from server/game.ts behind
// structural views so these behaviors are pinned directly: the live apply hits
// every session of the account, the join restore respects the leave-mid-fetch
// guard, and the per-save write-back is gated by the latch and keeps the LAST
// (zeroing) write.

function session(accountId: number, pid: number, cheaterMarked = false): CheaterMarkSession {
  return { accountId, pid, cheaterMarked };
}

function fakeSim() {
  return { setCheaterMark: vi.fn() };
}

beforeEach(() => {
  vi.mocked(accountCheaterMarkSeconds).mockReset().mockResolvedValue(0);
  vi.mocked(burnAccountCheaterMark).mockReset().mockResolvedValue(undefined);
});

describe('applyCheaterMarkLive', () => {
  it('marks every live session of the account and no one else', () => {
    const sim = fakeSim();
    const alt1 = session(41858, 7);
    const alt2 = session(41858, 9);
    const bystander = session(25817, 8);
    applyCheaterMarkLive([alt1, bystander, alt2], sim, 41858, 10800);
    expect(alt1.cheaterMarked).toBe(true);
    expect(alt2.cheaterMarked).toBe(true);
    expect(bystander.cheaterMarked).toBe(false);
    expect(sim.setCheaterMark.mock.calls).toEqual([
      [10800, 7],
      [10800, 9],
    ]);
  });

  it('latches even on a lift (seconds = 0) so the zeroing save still happens', () => {
    const sim = fakeSim();
    const live = session(41858, 7);
    applyCheaterMarkLive([live], sim, 41858, 0);
    expect(live.cheaterMarked).toBe(true);
    expect(sim.setCheaterMark).toHaveBeenCalledWith(0, 7);
  });
});

describe('refreshCheaterMark', () => {
  it('restores a positive budget onto the joining character and latches', async () => {
    vi.mocked(accountCheaterMarkSeconds).mockResolvedValue(7200);
    const sim = fakeSim();
    const joining = session(41858, 7);
    await refreshCheaterMark(joining, sim, () => true);
    expect(joining.cheaterMarked).toBe(true);
    expect(sim.setCheaterMark).toHaveBeenCalledWith(7200, 7);
  });

  it('does nothing for an unmarked account', async () => {
    const sim = fakeSim();
    const joining = session(41858, 7);
    await refreshCheaterMark(joining, sim, () => true);
    expect(joining.cheaterMarked).toBe(false);
    expect(sim.setCheaterMark).not.toHaveBeenCalled();
  });

  it('does nothing when the player left mid-fetch', async () => {
    vi.mocked(accountCheaterMarkSeconds).mockResolvedValue(7200);
    const sim = fakeSim();
    const gone = session(41858, 7);
    await refreshCheaterMark(gone, sim, () => false);
    expect(gone.cheaterMarked).toBe(false);
    expect(sim.setCheaterMark).not.toHaveBeenCalled();
  });
});

describe('persistCheaterMark', () => {
  it('costs an unmarked session zero writes', async () => {
    await persistCheaterMark(session(41858, 7, false), []);
    expect(burnAccountCheaterMark).not.toHaveBeenCalled();
  });

  it('burns the floored live-aura remainder and keeps the latch while serving', async () => {
    const marked = session(41858, 7, true);
    await persistCheaterMark(marked, [{ id: CHEATER_MARK_AURA_ID, remaining: 5400.9 }]);
    expect(burnAccountCheaterMark).toHaveBeenCalledWith(41858, 5400);
    expect(marked.cheaterMarked).toBe(true);
  });

  it('burns 0 and clears the latch once the aura is gone (the zeroing write)', async () => {
    const served = session(41858, 7, true);
    await persistCheaterMark(served, []);
    expect(burnAccountCheaterMark).toHaveBeenCalledWith(41858, 0);
    expect(served.cheaterMarked).toBe(false);
  });

  it('swallows a write-back failure instead of failing the save', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(burnAccountCheaterMark).mockRejectedValue(new Error('pg down'));
    const marked = session(41858, 7, true);
    await expect(
      persistCheaterMark(marked, [{ id: CHEATER_MARK_AURA_ID, remaining: 60 }]),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
