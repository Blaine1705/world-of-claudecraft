// In-flight dedupe for the LIVE portrait captures (portrait.ts). The live
// getters answer null on a cache miss and kick the async capture instead of
// blocking the calling frame, so the same key can be asked for many times
// before the first capture lands: a crowd of twenty same-class players asks
// once per player per frame, and every one of those asks would mint its own
// offscreen visual, upload and encode.
//
// The host owns the rig, the cache and the update listeners; this core owns
// only the "one capture per key at a time" rule and the guarantee that a
// capture's failure can never escape into the caller's frame.

export interface PortraitCaptureLane {
  /** Start `capture` for `key` unless one is already running for that key. */
  request(key: string, capture: () => Promise<void>): void;
  /** True while a capture for `key` is running. */
  pending(key: string): boolean;
  /** Forget every in-flight key (a graphics rebuild swapped the rig, so the
   *  captures still running commit nothing and must not block the retries). */
  clear(): void;
}

export function createPortraitCaptureLane(): PortraitCaptureLane {
  const inFlight = new Map<string, Promise<void>>();
  return {
    request(key, capture) {
      if (inFlight.has(key)) return;
      // The key is claimed BEFORE `capture` runs (it is invoked from a
      // microtask), so work started by the capture itself, or by a listener it
      // fires, cannot slip a second capture past the check above.
      const run = Promise.resolve()
        .then(capture)
        // A rejected capture is not the caller's problem: it clears the key so
        // the next ask retries, and never surfaces as an unhandled rejection.
        .catch(() => undefined)
        .then(() => {
          // Only retire OUR entry: clear() plus a fresh ask can have replaced
          // it while this capture was still running.
          if (inFlight.get(key) === run) inFlight.delete(key);
        });
      inFlight.set(key, run);
    },
    pending: (key) => inFlight.has(key),
    clear: () => inFlight.clear(),
  };
}
