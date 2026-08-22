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
export function createSerialWriter(
  onWrite?: (syncMs: number) => void,
): <T>(write: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  const timed = onWrite
    ? <T>(write: () => Promise<T>): Promise<T> => {
        const started = process.hrtime.bigint();
        try {
          return write();
        } finally {
          try {
            onWrite(Number(process.hrtime.bigint() - started) / 1e6);
          } catch {
            /* an observer must never break a persistence write */
          }
        }
      }
    : undefined;
  return <T>(write: () => Promise<T>): Promise<T> => {
    const run = timed
      ? tail.then(
          () => timed(write),
          () => timed(write),
        )
      : tail.then(write, write);
    tail = run.catch(() => {});
    return run;
  };
}
