'use strict';

// Pacing for OS-level notifications.
//
// The renderer decides WHAT is worth notifying about, but it does not get to
// decide how often the operating system's notification surface is used: a bug,
// a reconnect loop, or a hostile page in the window could turn one event into a
// stream of toasts the player has to dismiss outside the game. So the floor
// lives here, on the trusted side of the bridge, and is applied per kind so a
// noisy source cannot starve a quiet one.
//
// Pure and dependency-injected (no electron import here): the clock arrives as a
// function, so tests/electron_notify_guard.test.ts drives every window boundary
// without an Electron runtime.

/** The floor between two shown notifications of the same kind. */
const NOTIFY_MIN_INTERVAL_MS = 10000;

/**
 * Validated at the boundary rather than trusted: a zero or negative floor would
 * silently disable the rate limit this module exists to be, and a non-finite one
 * would refuse every notification forever. Both are constructor-time mistakes,
 * so they fail loudly here instead of turning into a runtime the caller has to
 * diagnose.
 */
function requirePositiveInterval(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`createNotifyGuard: ${label} must be a finite number greater than zero`);
  }
}

/**
 * Build the per-kind notification rate limit. Returns the one question the shell
 * asks it: may this kind be shown right now.
 */
function createNotifyGuard({ now, minIntervalMs = NOTIFY_MIN_INTERVAL_MS }) {
  requirePositiveInterval(minIntervalMs, 'minIntervalMs');
  if (typeof now !== 'function') {
    throw new TypeError('createNotifyGuard: now must be a function');
  }

  // Keyed by kind, and the key space is the closed whitelist the handler
  // validates before asking, so this cannot grow with untrusted input.
  const lastShownAt = new Map();

  return {
    /**
     * Whether a notification of this kind may be shown, stamping the kind's
     * window when it may. A REFUSED call leaves the stamp alone: stamping on
     * refusal would let a caller inside the floor push the window out
     * indefinitely, so a source that keeps asking would never show anything.
     */
    allow: (kind) => {
      // Fail closed on a non-string kind: the caller validates first, and a
      // junk key here would take a window of its own.
      if (typeof kind !== 'string') return false;
      const at = now();
      const last = lastShownAt.get(kind);
      if (last !== undefined && at - last < minIntervalMs) return false;
      lastShownAt.set(kind, at);
      return true;
    },
  };
}

module.exports = {
  NOTIFY_MIN_INTERVAL_MS,
  createNotifyGuard,
};
