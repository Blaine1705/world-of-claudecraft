// A FIFO serializer for writes to one shared resource (e.g. the single global
// World Market JSONB row, written by both the 30s autosave and the leave path).
// Each enqueued write runs only after the previous one settles, so the writes
// execute, and therefore commit, in enqueue order. Reading the to-be-persisted
// snapshot INSIDE the write thunk then guarantees the last commit carries the
// freshest snapshot, so an out-of-order commit can never roll a shared blob back
// over a newer one. A rejecting write is surfaced to its own caller but never
// blocks the writes queued behind it.
export function createSerialWriter(): <T>(write: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(write: () => Promise<T>): Promise<T> => {
    const run = tail.then(write, write);
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
   *  a drained key must not retain its entry). */
  pendingKeys(): number;
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
