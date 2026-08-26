// A FIFO serializer for writes to one shared resource (e.g. the single global
// World Market JSONB row, written by both the 30s autosave and the leave path).
// Each enqueued write runs only after the previous one settles, so the writes
// execute, and therefore commit, in enqueue order. Reading the to-be-persisted
// snapshot INSIDE the write thunk then guarantees the last commit carries the
// freshest snapshot, so an out-of-order commit can never roll a shared blob back
// over a newer one. A rejecting write is surfaced to its own caller but never
// blocks the writes queued behind it.
/**
 * @param onWrite optional observer of each write's SYNCHRONOUS cost, in ms: the
 *   part of the thunk that runs before its first await. That is where the shared
 *   blob is built and stringified (the caller reads the snapshot inside the thunk,
 *   see above), and it runs on the main thread. It is deliberately measured HERE
 *   rather than at the enqueue site: `tail.then` defers the thunk to a microtask,
 *   so a timer wrapped around the enqueue call sees the bookkeeping and nothing
 *   else (measured: 0.02 ms around an enqueue whose write then blocked 250 ms).
 *   The observer never throws into the write; a throwing observer would fail a
 *   persistence write for a measurement.
 */
export function createSerialWriter<WriteContext = unknown>(
  onWrite?: (syncMs: number, context: WriteContext | undefined) => void,
): <T>(write: () => Promise<T>, context?: WriteContext) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  const timed = onWrite
    ? <T>(write: () => Promise<T>, context: WriteContext | undefined): Promise<T> => {
        const started = process.hrtime.bigint();
        try {
          return write();
        } finally {
          try {
            onWrite(Number(process.hrtime.bigint() - started) / 1e6, context);
          } catch {
            /* an observer must never break a persistence write */
          }
        }
      }
    : undefined;
  return <T>(write: () => Promise<T>, context?: WriteContext): Promise<T> => {
    const run = timed
      ? tail.then(
          () => timed(write, context),
          () => timed(write, context),
        )
      : tail.then(write, write);
    tail = run.catch(() => {});
    return run;
  };
}

// The per-key variant: one FIFO per key (e.g. one per character id), with the
// same ordering and error contract as createSerialWriter (a rejecting write
// surfaces to its own caller, exactly once, and never blocks or poisons the
// writes queued behind it), plus cleanup: a key's entry is dropped once its
// last write settles, so a map keyed by characters that come and go does not
// grow without bound. GameServer's per-character save queue rides this, and
// so does every out-of-band durable character write (the marketplace escrow
// persist): sharing one FIFO per character is what makes commit order equal
// enqueue order across ALL of a character's writers, so a snapshot serialized
// inside a queued write can never be overtaken by a staler one committing
// later.
//
// TWO RULES for writes on this queue, both deadlock edges Postgres can never
// see because they live in the promise chain:
// - a write must never await another enqueue for its OWN key (self-deadlock;
//   the kickSession note inside GameServer.saveCharacter is the precedent);
// - the established cross-queue order is character FIFO FIRST, then the
//   market serial writer, and never an enqueue from inside a market thunk or
//   while holding a pool client / open transaction.
export interface KeyedSerialWriter<K> {
  enqueue<T>(key: K, write: () => Promise<T>): Promise<T>;
  /** How many keys hold a running or queued write right now (the leak pin:
   *  a drained key must not retain its entry). Production caller: the
   *  woc_character_save_pending_keys gauge (server/http/game_metrics.ts)
   *  reads it off GameServer's character-save queue at scrape time. */
  pendingKeys(): number;
}

// createSerialWriter with a depth watch: counts writes queued-or-running and
// warns (rate-limited to once a minute) past `warnDepth`. GameServer's shared
// market writer rides this so a dirty-book autosave pile-up is loud before it
// becomes save latency; the message is the wrapper's one behavior, so it is
// caller-supplied and unchanged by this move. `onWrite` is forwarded to the
// inner writer unchanged (see createSerialWriter).
export function createDepthWarnedSerialWriter<WriteContext = unknown>(
  warnDepth: number,
  message: (depth: number) => string,
  onWrite?: (syncMs: number, context: WriteContext | undefined) => void,
): <T>(write: () => Promise<T>, context?: WriteContext) => Promise<T> {
  const writer = createSerialWriter(onWrite);
  let depth = 0;
  let lastWarnMs = 0;
  return <T>(write: () => Promise<T>, context?: WriteContext): Promise<T> => {
    depth++;
    if (depth > warnDepth && Date.now() - lastWarnMs > 60_000) {
      lastWarnMs = Date.now();
      console.warn(message(depth));
    }
    return writer(write, context).finally(() => {
      depth--;
    });
  };
}

export function createKeyedSerialWriter<K>(): KeyedSerialWriter<K> {
  const tails = new Map<K, Promise<unknown>>();
  return {
    async enqueue<T>(key: K, write: () => Promise<T>): Promise<T> {
      const previous = tails.get(key);
      const run = (previous ? previous.catch(() => {}) : Promise.resolve()).then(write);
      tails.set(key, run);
      try {
        return await run;
      } finally {
        if (tails.get(key) === run) tails.delete(key);
      }
    },
    pendingKeys(): number {
      return tails.size;
    },
  };
}
