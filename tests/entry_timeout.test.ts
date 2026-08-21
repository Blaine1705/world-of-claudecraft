import { describe, expect, it } from 'vitest';
import { ENTRY_TIMEOUT_MS, entryTimedOut } from '../src/net/entry_timeout';

describe('entryTimedOut', () => {
  it('is false right up to the deadline and true just past it', () => {
    const start = 1_000_000;
    expect(entryTimedOut(start, start)).toBe(false);
    expect(entryTimedOut(start, start + ENTRY_TIMEOUT_MS)).toBe(false);
    expect(entryTimedOut(start, start + ENTRY_TIMEOUT_MS + 1)).toBe(true);
  });

  it('restarts the budget from a later activity timestamp', () => {
    // Mirrors main.ts's enterWorld poll: onConnectionLost bumps lastActivityAt
    // on every legitimate transient-rejection retry, so a hang measured from
    // world-entry start would already look timed out while the caller's own
    // bounded backoff is still making real, visible progress.
    const start = 1_000_000;
    const activity = start + ENTRY_TIMEOUT_MS + 5_000; // long past the original deadline
    expect(entryTimedOut(start, activity)).toBe(true);
    expect(entryTimedOut(activity, activity)).toBe(false);
    expect(entryTimedOut(activity, activity + ENTRY_TIMEOUT_MS + 1)).toBe(true);
  });

  it('pins the timeout budget as a literal (a silent change here would widen or shrink every entry attempt)', () => {
    expect(ENTRY_TIMEOUT_MS).toBe(10_000);
  });
});
