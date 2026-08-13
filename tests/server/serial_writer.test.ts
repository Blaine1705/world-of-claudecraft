// The keyed FIFO writer: per-key ordering, cross-key independence, the error
// contract (a rejecting write surfaces to its own caller exactly once and
// never blocks or poisons the writes queued behind it), and entry cleanup.
// GameServer's per-character save queue and the marketplace escrow persist
// share one instance per server, so these pins are what "commit order equals
// enqueue order" rests on.
import { describe, expect, it, vi } from 'vitest';
import { createKeyedSerialWriter } from '../../server/serial_writer';

function gate(): { open: () => void; held: Promise<void> } {
  let open!: () => void;
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, held };
}

describe('createKeyedSerialWriter', () => {
  it('runs a synchronous burst of same-key writes strictly in enqueue order', async () => {
    const writer = createKeyedSerialWriter<number>();
    const order: string[] = [];
    const first = gate();
    const a = writer.enqueue(1, async () => {
      await first.held;
      order.push('a');
      return 'a';
    });
    const b = writer.enqueue(1, async () => {
      order.push('b');
      return 'b';
    });
    const c = writer.enqueue(1, async () => {
      order.push('c');
      return 'c';
    });
    // Nothing behind the head may start while it is parked.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual([]);
    first.open();
    expect(await Promise.all([a, b, c])).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('different keys do not serialize against each other', async () => {
    const writer = createKeyedSerialWriter<number>();
    const order: string[] = [];
    const parked = gate();
    const a = writer.enqueue(1, async () => {
      await parked.held;
      order.push('key1');
    });
    const b = writer.enqueue(2, async () => {
      order.push('key2');
    });
    await b;
    expect(order).toEqual(['key2']);
    parked.open();
    await a;
    expect(order).toEqual(['key2', 'key1']);
  });

  it('a rejecting write reaches its own caller exactly once and never blocks the queue', async () => {
    const writer = createKeyedSerialWriter<string>();
    const rejections = vi.fn();
    const boom = writer.enqueue('c', async () => {
      throw new Error('boom');
    });
    const after = writer.enqueue('c', async () => 'survived');
    await boom.catch(rejections);
    expect(rejections).toHaveBeenCalledTimes(1);
    expect(rejections.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    // The follower runs to completion: the chain is neither blocked by the
    // rejection nor poisoned for every later write on this key.
    expect(await after).toBe('survived');
    expect(await writer.enqueue('c', async () => 'later')).toBe('later');
  });

  it('drops a drained key entry and never leaks settled tails', async () => {
    const writer = createKeyedSerialWriter<number>();
    await Promise.all(Array.from({ length: 1000 }, (_, i) => writer.enqueue(i, async () => i)));
    expect(writer.pendingKeys()).toBe(0);
  });

  it('a completing write does not delete a newer tail queued for the same key', async () => {
    const writer = createKeyedSerialWriter<number>();
    const parked = gate();
    const a = writer.enqueue(7, async () => {
      await parked.held;
    });
    const b = writer.enqueue(7, async () => 'tail');
    parked.open();
    await a;
    // a settled while b still owns the key's entry: the identity check must
    // keep it, so b still runs and the entry clears only after b settles.
    expect(writer.pendingKeys()).toBe(1);
    expect(await b).toBe('tail');
    expect(writer.pendingKeys()).toBe(0);
  });
});
