import { describe, expect, it } from 'vitest';
import { ChatModerationLiveState } from '../server/chat_mod_live';

const UNMUTED = { mutedUntil: null, reason: '', strikes: 0 };
const MUTED = { mutedUntil: '2099-01-01T00:00:00.000Z', reason: 'spam', strikes: 0 };

describe('ChatModerationLiveState', () => {
  it('trusts the fresh snapshot when nothing lands during the hydration window', () => {
    const state = new ChatModerationLiveState();
    const hydration = state.beginHydration(1);
    const fresh = { mutedUntil: null, reason: '', strikes: 2 };
    expect(hydration.resolve(fresh)).toEqual(fresh);
    hydration.release();
  });

  it('prefers a live mute pushed after hydration began over the stale unmuted snapshot', () => {
    const state = new ChatModerationLiveState();
    const hydration = state.beginHydration(1);
    // Simulates an admin /mute committing to the DB and pushing live WHILE
    // this handshake's own (now-stale) DB read is still in flight.
    state.changed(1, MUTED);
    expect(hydration.resolve(UNMUTED)).toEqual(MUTED);
    hydration.release();
  });

  it('prefers a live unmute pushed after hydration began over the stale muted snapshot', () => {
    const state = new ChatModerationLiveState();
    const hydration = state.beginHydration(1);
    // The mirror image: an admin lifts the mute while the stale (still
    // muted) snapshot read is in flight.
    state.changed(1, UNMUTED);
    expect(hydration.resolve(MUTED)).toEqual(UNMUTED);
    hydration.release();
  });

  it('trusts the fresh snapshot when the only push happened BEFORE hydration began', () => {
    const state = new ChatModerationLiveState();
    // A push that already landed (and, in production, already committed to
    // the DB the fresh read below models) is old news by the time hydration
    // begins: the fresh read is expected to already reflect it.
    state.changed(1, MUTED);
    const hydration = state.beginHydration(1);
    expect(hydration.resolve(MUTED)).toEqual(MUTED);
    hydration.release();
  });

  it('keeps every account independent', () => {
    const state = new ChatModerationLiveState();
    const hydrationA = state.beginHydration(1);
    const hydrationB = state.beginHydration(2);
    state.changed(1, MUTED);
    expect(hydrationA.resolve(UNMUTED)).toEqual(MUTED);
    expect(hydrationB.resolve(UNMUTED)).toEqual(UNMUTED);
    hydrationA.release();
    hydrationB.release();
  });

  it('pins an in-progress hydration generation while bounding ordinary push state', () => {
    const state = new ChatModerationLiveState();
    const hydration = state.beginHydration(1);
    const committed = { mutedUntil: MUTED.mutedUntil, reason: 'spam', strikes: 1 };
    state.changed(1, committed);
    for (let accountId = 2; accountId <= 4_096 + 2; accountId++) {
      state.changed(accountId, UNMUTED);
    }

    expect(state.cachedAccounts).toBe(4_096);
    expect(hydration.resolve(UNMUTED)).toEqual(committed);
    hydration.release();
    state.changed(4_096 + 3, UNMUTED);
    expect(state.cachedAccounts).toBe(4_096);
  });
});
