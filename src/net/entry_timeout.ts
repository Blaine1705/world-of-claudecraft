// Decides whether world entry has gone long enough without a sign of life to
// declare a fatal timeout. A "sign of life" is either half of the entry
// handshake landing (the socket opening, hello arriving) or a legitimate
// transient-rejection retry starting (reconnect_policy.ts: 'character already
// in world' / 'authentication timed out' on the very first join attempt, the
// same window a mid-session auto-reconnect already tolerates). Each pushes
// the deadline out, so a genuine hang (no response at all, ever) still times
// out ENTRY_TIMEOUT_MS after the LAST one, while a bounded backoff retry that
// is actively making progress (visible to the player via the reconnect
// overlay) is never mistaken for a hang and killed out from under itself.
export const ENTRY_TIMEOUT_MS = 10_000;

export function entryTimedOut(lastActivityAtMs: number, nowMs: number): boolean {
  return nowMs - lastActivityAtMs > ENTRY_TIMEOUT_MS;
}
