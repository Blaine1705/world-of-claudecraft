import { describe, expect, it } from 'vitest';

import {
  BANK_LEDGER_OUTBOX_BATCH_KEY_MAX_LENGTH,
  BANK_LEDGER_OUTBOX_DEFAULT_GLOBAL_LIMITS,
  BANK_LEDGER_OUTBOX_DEFAULT_SESSION_LIMITS,
  BankLedgerOutbox,
  BankLedgerOutboxBudget,
  type BankLedgerOutboxOwner,
  type BankLedgerOutboxRowInput,
  serializeBankLedgerCommandBatch,
} from '../../server/bank_ledger_outbox';

const LARGE_BYTES = 1_000_000;
const OWNER: BankLedgerOutboxOwner = Object.freeze({
  realm: 'Azeroth',
  characterId: 101,
  accountId: 202,
});

function required<T>(value: T | null): T {
  if (value === null) throw new Error('expected reservation capacity');
  return value;
}

function ledgerRow(overrides: Partial<BankLedgerOutboxRowInput> = {}): BankLedgerOutboxRowInput {
  return {
    realm: 'Azeroth',
    characterId: 101,
    accountId: 202,
    op: 'deposit',
    itemId: 'peacebloom',
    count: 1,
    instance: null,
    copperDelta: 0,
    purchasedSlotsAfter: 6,
    container: 'personal',
    containerId: null,
    ...overrides,
  };
}

function rig(
  options: {
    globalRows?: number;
    globalBytes?: number;
    sessionRows?: number;
    sessionBytes?: number;
    nextBatchKey?: () => string;
    owner?: BankLedgerOutboxOwner;
  } = {},
) {
  const globalRows = options.globalRows ?? 100;
  const globalBytes = options.globalBytes ?? LARGE_BYTES;
  const budget = new BankLedgerOutboxBudget({
    maxRows: globalRows,
    maxEncodedBytes: globalBytes,
  });
  const makeOutbox = (nextBatchKey = options.nextBatchKey) =>
    new BankLedgerOutbox({
      owner: options.owner ?? OWNER,
      budget,
      limits: {
        maxRows: options.sessionRows ?? globalRows,
        maxEncodedBytes: options.sessionBytes ?? globalBytes,
      },
      nextBatchKey,
    });
  return { budget, makeOutbox };
}

describe('BankLedgerOutbox limits and reservations', () => {
  it('pins a one-autosave adversarial row allowance and conservative byte budgets', () => {
    // The completed admission map prices the combined command plus craft ceiling
    // at about 63.43 rows/s. A 30-second autosave window therefore admits 1,903
    // rows after rounding up.
    // 2,048 covers that interval plus a small scheduling margin without retaining
    // multiple failed-save windows in memory.
    expect(BANK_LEDGER_OUTBOX_DEFAULT_SESSION_LIMITS).toEqual({
      maxRows: 2_048,
      maxEncodedBytes: 2 * 1024 * 1024,
    });
    const rowsPerAutosave = Math.ceil(63.43 * 30);
    expect(rowsPerAutosave).toBe(1_903);
    expect(BANK_LEDGER_OUTBOX_DEFAULT_SESSION_LIMITS.maxRows).toBeGreaterThanOrEqual(
      rowsPerAutosave,
    );
    expect(BANK_LEDGER_OUTBOX_DEFAULT_SESSION_LIMITS.maxRows).toBeLessThan(rowsPerAutosave * 2);
    expect(BANK_LEDGER_OUTBOX_DEFAULT_GLOBAL_LIMITS).toEqual({
      maxRows: 65_536,
      maxEncodedBytes: 64 * 1024 * 1024,
    });
    expect(Object.isFrozen(BANK_LEDGER_OUTBOX_DEFAULT_SESSION_LIMITS)).toBe(true);
    expect(Object.isFrozen(BANK_LEDGER_OUTBOX_DEFAULT_GLOBAL_LIMITS)).toBe(true);
  });

  it('reserves both session dimensions before mutation and cancel releases both', () => {
    const { budget, makeOutbox } = rig({ sessionRows: 2, sessionBytes: 10 });
    const outbox = makeOutbox(() => 'generated:1');
    const reservation = required(outbox.tryReserve({ maxRows: 2, maxEncodedBytes: 10 }));

    expect(reservation).toMatchObject({
      batchKey: 'generated:1',
      maxRows: 2,
      maxEncodedBytes: 10,
    });
    expect(Object.isFrozen(reservation)).toBe(true);
    expect(outbox.tryReserve({ maxRows: 1, maxEncodedBytes: 1 })).toBeNull();
    expect(outbox.usage).toEqual({
      queuedRows: 0,
      queuedEncodedBytes: 0,
      reservedRows: 2,
      reservedEncodedBytes: 10,
    });
    expect(budget.usage).toEqual({ rows: 2, encodedBytes: 10 });

    expect(outbox.cancel(reservation)).toBe(true);
    expect(outbox.cancel(reservation)).toBe(false);
    expect(outbox.usage).toEqual({
      queuedRows: 0,
      queuedEncodedBytes: 0,
      reservedRows: 0,
      reservedEncodedBytes: 0,
    });
    expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
  });

  it('binds an immutable validated owner at construction without retaining the caller object', () => {
    const mutableOwner = { realm: 'Azeroth', characterId: 101, accountId: 202 };
    const { makeOutbox } = rig({ owner: mutableOwner });
    const outbox = makeOutbox();

    mutableOwner.realm = 'Outland';
    mutableOwner.characterId = 999;
    mutableOwner.accountId = 888;

    expect(outbox.owner).toEqual(OWNER);
    expect(Object.isFrozen(outbox.owner)).toBe(true);
    expect(() => rig({ owner: { ...OWNER, realm: '' } }).makeOutbox()).toThrow(/owner\.realm/);
    expect(() => rig({ owner: { ...OWNER, characterId: 0 } }).makeOutbox()).toThrow(
      /owner\.characterId/,
    );
    expect(() => rig({ owner: { ...OWNER, accountId: -1 } }).makeOutbox()).toThrow(
      /owner\.accountId/,
    );
  });

  it('enforces the process-global row and byte budgets across sessions', () => {
    const rowsRig = rig({ globalRows: 2, globalBytes: 100, sessionRows: 2, sessionBytes: 100 });
    const rowsA = rowsRig.makeOutbox(() => 'row:a');
    const rowsB = rowsRig.makeOutbox(() => 'row:b');
    const rowA = required(rowsA.tryReserve({ maxRows: 1, maxEncodedBytes: 1 }));
    required(rowsB.tryReserve({ maxRows: 1, maxEncodedBytes: 1 }));
    expect(rowsB.tryReserve({ maxRows: 1, maxEncodedBytes: 1 })).toBeNull();
    expect(rowsRig.budget.usage).toEqual({ rows: 2, encodedBytes: 2 });
    expect(rowsA.cancel(rowA)).toBe(true);
    expect(
      rowsB.tryReserve({ maxRows: 1, maxEncodedBytes: 1, batchKey: 'row:b:second' }),
    ).not.toBeNull();

    const bytesRig = rig({ globalRows: 10, globalBytes: 7, sessionRows: 10, sessionBytes: 7 });
    const bytesA = bytesRig.makeOutbox(() => 'byte:a');
    const bytesB = bytesRig.makeOutbox(() => 'byte:b');
    required(bytesA.tryReserve({ maxRows: 1, maxEncodedBytes: 4 }));
    expect(bytesB.tryReserve({ maxRows: 1, maxEncodedBytes: 4 })).toBeNull();
    expect(bytesRig.budget.usage).toEqual({ rows: 1, encodedBytes: 4 });
  });

  it('uses a supplied stable key without consuming the injected generator', () => {
    let generated = 0;
    const { makeOutbox } = rig({
      nextBatchKey: () => `generated:${++generated}`,
    });
    const outbox = makeOutbox();
    const supplied = outbox.tryReserve({
      maxRows: 1,
      maxEncodedBytes: 100,
      batchKey: 'storage:purchase-17',
    });
    const automatic = outbox.tryReserve({ maxRows: 1, maxEncodedBytes: 100 });

    expect(supplied?.batchKey).toBe('storage:purchase-17');
    expect(automatic?.batchKey).toBe('generated:1');
    expect(generated).toBe(1);
  });

  it('accepts only the shared bounded idempotency-key alphabet without spending capacity', () => {
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const boundary = `storage:${'a'.repeat(BANK_LEDGER_OUTBOX_BATCH_KEY_MAX_LENGTH - 8)}`;
    expect(boundary).toHaveLength(BANK_LEDGER_OUTBOX_BATCH_KEY_MAX_LENGTH);
    const accepted = required(
      outbox.tryReserve({ maxRows: 1, maxEncodedBytes: 500, batchKey: boundary }),
    );
    expect(outbox.cancel(accepted)).toBe(true);

    for (const batchKey of [
      '',
      `${boundary}x`,
      'has space',
      'has/slash',
      'unicode:符文',
      'line\nbreak',
    ]) {
      expect(() => outbox.tryReserve({ maxRows: 1, maxEncodedBytes: 500, batchKey })).toThrow(
        /1 to 200 characters.*A-Za-z0-9/i,
      );
      expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
    }
  });

  it('rolls back budget acquisition when key generation or key validation fails', () => {
    const generationRig = rig({
      nextBatchKey: () => {
        throw new Error('sequence unavailable');
      },
    });
    const generationOutbox = generationRig.makeOutbox();
    expect(() => generationOutbox.tryReserve({ maxRows: 3, maxEncodedBytes: 30 })).toThrow(
      'sequence unavailable',
    );
    expect(generationRig.budget.usage).toEqual({ rows: 0, encodedBytes: 0 });

    const duplicateRig = rig();
    const duplicateOutbox = duplicateRig.makeOutbox();
    required(
      duplicateOutbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: 10,
        batchKey: 'same-key',
      }),
    );
    expect(() =>
      duplicateOutbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: 10,
        batchKey: 'same-key',
      }),
    ).toThrow(/duplicate .*batch key/i);
    expect(duplicateRig.budget.usage).toEqual({ rows: 1, encodedBytes: 10 });
  });
});

describe('BankLedgerOutbox batches and accounting', () => {
  it('serializes mutable instances into immutable logical command batches in row order', () => {
    const instance = { signer: 'Ada', rolled: { quality: 'rare' } };
    const rows = [
      ledgerRow({ op: 'unsocket_bag', itemId: 'linen_pouch', instance }),
      ledgerRow({ op: 'socket_bag', itemId: 'mooncloth_bag', instance: null }),
    ];
    const prepared = serializeBankLedgerCommandBatch('socket-swap:1', rows);

    instance.signer = 'mutated';
    instance.rolled.quality = 'common';
    rows.reverse();

    expect(prepared.rows.map((row) => row.op)).toEqual(['unsocket_bag', 'socket_bag']);
    expect(prepared.rows[0]?.instanceJson).toBe('{"signer":"Ada","rolled":{"quality":"rare"}}');
    expect(prepared.encodedBytes).toBeGreaterThan(0);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.rows)).toBe(true);
    expect(prepared.rows.every(Object.isFrozen)).toBe(true);
    expect(prepared.guildIds).toEqual([]);
    expect(Object.isFrozen(prepared.guildIds)).toBe(true);
    expect(prepared.hasUnscopedRows).toBe(true);
  });

  it('summarizes one guild correlation per logical batch and rejects mixed guild identities', () => {
    const correlated = serializeBankLedgerCommandBatch('guild:correlated', [
      ledgerRow({ container: 'guild', containerId: 41 }),
      ledgerRow({ container: 'personal', containerId: null }),
      ledgerRow({ container: 'guild', containerId: 41 }),
    ]);

    expect(correlated.guildIds).toEqual([41]);
    expect(correlated.hasUnscopedRows).toBe(true);
    const guildOnly = serializeBankLedgerCommandBatch('guild:only', [
      ledgerRow({ container: 'guild', containerId: 41 }),
    ]);
    expect(guildOnly.guildIds).toEqual([41]);
    expect(Object.isFrozen(guildOnly.guildIds)).toBe(true);
    expect(guildOnly.hasUnscopedRows).toBe(false);
    expect(() =>
      serializeBankLedgerCommandBatch('guild:mixed', [
        ledgerRow({ container: 'guild', containerId: 41 }),
        ledgerRow({ container: 'guild', containerId: 42 }),
      ]),
    ).toThrow(/multiple guilds/i);
  });

  it('uses the canonical JSON normalization and rejects true serialization failures', () => {
    const normalized = serializeBankLedgerCommandBatch('json:normalization', [
      ledgerRow({
        instance: {
          kept: 7,
          omitted: undefined,
          objectNumber: Number.POSITIVE_INFINITY,
          arrayValues: [undefined, Number.NaN, Number.NEGATIVE_INFINITY],
        },
      }),
    ]);
    expect(normalized.rows[0]?.instanceJson).toBe(
      '{"kept":7,"objectNumber":null,"arrayValues":[null,null,null]}',
    );

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() =>
      serializeBankLedgerCommandBatch('json:cycle', [ledgerRow({ instance: circular })]),
    ).toThrow();
    expect(() =>
      serializeBankLedgerCommandBatch('json:bigint', [ledgerRow({ instance: { value: 1n } })]),
    ).toThrow();
    expect(
      serializeBankLedgerCommandBatch('json:undefined', [ledgerRow({ instance: undefined })])
        .rows[0]?.instanceJson,
    ).toBeNull();
  });

  it('commits actual usage and releases the unused part of a reservation', () => {
    const row = ledgerRow();
    const prepared = serializeBankLedgerCommandBatch('batch:1', [row]);
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const reservation = required(
      outbox.tryReserve({
        maxRows: 5,
        maxEncodedBytes: prepared.encodedBytes + 500,
        batchKey: prepared.batchKey,
      }),
    );

    const committed = outbox.commit(reservation, [row]);

    expect(committed).toEqual(prepared);
    expect(outbox.usage).toEqual({
      queuedRows: 1,
      queuedEncodedBytes: prepared.encodedBytes,
      reservedRows: 0,
      reservedEncodedBytes: 0,
    });
    expect(budget.usage).toEqual({ rows: 1, encodedBytes: prepared.encodedBytes });
    expect(outbox.cancel(reservation)).toBe(false);
    expect(() => outbox.commit(reservation, [row])).toThrow(/inactive .*reservation/i);
    expect(budget.usage).toEqual({ rows: 1, encodedBytes: prepared.encodedBytes });
  });

  it.each([
    ['realm', { realm: 'Outland' }],
    ['character', { characterId: OWNER.characterId + 1 }],
    ['account', { accountId: OWNER.accountId + 1 }],
  ])('rejects a row with a mismatched %s owner before changing accounting', (_kind, mismatch) => {
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const reservation = required(
      outbox.tryReserve({ maxRows: 2, maxEncodedBytes: 2_000, batchKey: 'owner:mismatch' }),
    );
    const beforeUsage = outbox.usage;
    const beforeBudget = budget.usage;

    expect(() => outbox.commit(reservation, [ledgerRow(mismatch)])).toThrow(
      /does not match outbox owner/i,
    );
    expect(outbox.usage).toEqual(beforeUsage);
    expect(budget.usage).toEqual(beforeBudget);
    expect(outbox.cancel(reservation)).toBe(true);
  });

  it('reserves a prebuilt batch at exact cost and commits it without reserializing caller data', () => {
    const instance: { signer: string; self?: unknown } = { signer: 'Ada' };
    const sourceRows = [ledgerRow({ instance })];
    const prepared = serializeBankLedgerCommandBatch('prepared:exact', sourceRows);
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const reservation = required(outbox.tryReservePrepared(prepared));

    expect(reservation).toMatchObject({
      batchKey: prepared.batchKey,
      maxRows: prepared.rows.length,
      maxEncodedBytes: prepared.encodedBytes,
      batch: prepared,
    });
    expect(outbox.usage).toEqual({
      queuedRows: 0,
      queuedEncodedBytes: 0,
      reservedRows: prepared.rows.length,
      reservedEncodedBytes: prepared.encodedBytes,
    });

    // The guarded gameplay mutation can invalidate every source object. The
    // post-mutation transition consumes only the already detached batch.
    instance.signer = 'mutated';
    instance.self = instance;
    sourceRows.length = 0;

    expect(outbox.commitPrepared(reservation)).toBe(prepared);
    expect(outbox.usage).toEqual({
      queuedRows: prepared.rows.length,
      queuedEncodedBytes: prepared.encodedBytes,
      reservedRows: 0,
      reservedEncodedBytes: 0,
    });
    expect(budget.usage).toEqual({
      rows: prepared.rows.length,
      encodedBytes: prepared.encodedBytes,
    });
  });

  it('rejects foreign or forged prebuilt batches before acquiring exact capacity', () => {
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const foreign = serializeBankLedgerCommandBatch('prepared:foreign', [
      ledgerRow({ accountId: OWNER.accountId + 1 }),
    ]);
    expect(() => outbox.tryReservePrepared(foreign)).toThrow(/does not match outbox owner/i);

    const valid = serializeBankLedgerCommandBatch('prepared:valid', [ledgerRow()]);
    const forged = { ...valid };
    expect(() => outbox.tryReservePrepared(forged)).toThrow(/module-prepared/i);
    expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
    expect(outbox.usage).toEqual({
      queuedRows: 0,
      queuedEncodedBytes: 0,
      reservedRows: 0,
      reservedEncodedBytes: 0,
    });
  });

  it('refuses an exact reservation that exceeds a session bound without spending global capacity', () => {
    const { budget, makeOutbox } = rig({ sessionRows: 1 });
    const outbox = makeOutbox();
    const prepared = serializeBankLedgerCommandBatch('prepared:too-many', [
      ledgerRow({ itemId: 'peacebloom' }),
      ledgerRow({ itemId: 'silverleaf' }),
    ]);

    expect(outbox.tryReservePrepared(prepared)).toBeNull();
    expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
  });

  it('meters UTF-8 bytes exactly and refuses a commit one byte over its reservation', () => {
    const row = ledgerRow({ itemId: '符文布' });
    const key = 'utf8:batch';
    const prepared = serializeBankLedgerCommandBatch(key, [row]);
    expect(prepared.encodedBytes).toBe(
      new TextEncoder().encode(JSON.stringify({ batchKey: key, rows: prepared.rows })).byteLength,
    );
    expect(prepared.encodedBytes).toBeGreaterThan(
      JSON.stringify({ batchKey: key, rows: prepared.rows }).length,
    );

    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const short = required(
      outbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: prepared.encodedBytes - 1,
        batchKey: key,
      }),
    );
    expect(() => outbox.commit(short, [row])).toThrow(/reserved byte limit/i);
    expect(outbox.cancel(short)).toBe(true);

    const exact = required(
      outbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: prepared.encodedBytes,
        batchKey: key,
      }),
    );
    expect(outbox.commit(exact, [row]).encodedBytes).toBe(prepared.encodedBytes);
    expect(budget.usage).toEqual({ rows: 1, encodedBytes: prepared.encodedBytes });
  });

  it('retains reservations after row, byte, and serialization failures so accounting stays exact', () => {
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const row = ledgerRow();
    const one = serializeBankLedgerCommandBatch('too-many', [row]);
    const tooMany = required(
      outbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: one.encodedBytes * 3,
        batchKey: one.batchKey,
      }),
    );
    expect(() => outbox.commit(tooMany, [row, row])).toThrow(/reserved row limit/i);
    expect(outbox.usage.reservedRows).toBe(1);
    expect(outbox.cancel(tooMany)).toBe(true);

    const tooLarge = required(
      outbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: one.encodedBytes - 1,
        batchKey: 'too-large',
      }),
    );
    expect(() => outbox.commit(tooLarge, [row])).toThrow(/reserved byte limit/i);
    expect(outbox.cancel(tooLarge)).toBe(true);

    const circular: { self?: unknown } = {};
    circular.self = circular;
    const unserializable = required(
      outbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: 10_000,
        batchKey: 'circular',
      }),
    );
    expect(() => outbox.commit(unserializable, [ledgerRow({ instance: circular })])).toThrow();
    expect(outbox.usage.reservedRows).toBe(1);
    expect(outbox.cancel(unserializable)).toBe(true);
    expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
  });

  it('rejects foreign reservations without changing either outbox accounting', () => {
    const { budget, makeOutbox } = rig();
    const first = makeOutbox();
    const second = makeOutbox();
    const reservation = required(
      first.tryReserve({
        maxRows: 1,
        maxEncodedBytes: 1_000,
        batchKey: 'owned-by-first',
      }),
    );

    expect(second.cancel(reservation)).toBe(false);
    expect(() => second.commit(reservation, [ledgerRow()])).toThrow(/inactive .*reservation/i);
    expect(budget.usage).toEqual({ rows: 1, encodedBytes: 1_000 });
    expect(first.cancel(reservation)).toBe(true);
    expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
  });
});

describe('BankLedgerOutbox captured-prefix lifecycle', () => {
  function commitOne(outbox: BankLedgerOutbox, key: string, itemId: string) {
    const row = ledgerRow({ itemId });
    const prepared = serializeBankLedgerCommandBatch(key, [row]);
    const reservation = required(
      outbox.tryReserve({
        maxRows: 1,
        maxEncodedBytes: prepared.encodedBytes,
        batchKey: key,
      }),
    );
    return outbox.commit(reservation, [row]);
  }

  it('acknowledges only the captured prefix and retains mid-save additions', () => {
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    const first = commitOne(outbox, 'batch:first', 'peacebloom');
    const snapshot = outbox.snapshot();
    const second = commitOne(outbox, 'batch:second', 'silverleaf');

    expect(snapshot.batches.map((batch) => batch.batchKey)).toEqual(['batch:first']);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.batches)).toBe(true);
    expect(outbox.canAcknowledge(snapshot)).toBe(true);
    expect(outbox.acknowledge(snapshot)).toBe(true);
    expect(outbox.canAcknowledge(snapshot)).toBe(false);
    expect(outbox.snapshot().batches.map((batch) => batch.batchKey)).toEqual(['batch:second']);
    expect(budget.usage).toEqual({ rows: 1, encodedBytes: second.encodedBytes });
    expect(budget.usage.encodedBytes).not.toBe(first.encodedBytes + second.encodedBytes);
  });

  it('captures immutable owner and guild-correlation metadata without filtering the prefix', () => {
    const { makeOutbox } = rig();
    const outbox = makeOutbox();
    commitOne(outbox, 'batch:personal', 'peacebloom');
    expect(outbox.hasQueuedGuildRows).toBe(false);

    for (const guildId of [42, 7]) {
      const row = ledgerRow({ container: 'guild', containerId: guildId });
      const prepared = serializeBankLedgerCommandBatch(`batch:guild:${guildId}`, [row]);
      const reservation = required(outbox.tryReservePrepared(prepared));
      outbox.commitPrepared(reservation);
      expect(outbox.hasQueuedGuildRows).toBe(true);
    }

    const snapshot = outbox.snapshot();
    expect(snapshot.batches.map((batch) => batch.batchKey)).toEqual([
      'batch:personal',
      'batch:guild:42',
      'batch:guild:7',
    ]);
    expect(snapshot.owner).toBe(outbox.owner);
    expect(snapshot.guildIds).toEqual([7, 42]);
    expect(Object.isFrozen(snapshot.guildIds)).toBe(true);
    expect(snapshot.hasUnscopedRows).toBe(true);
    expect(outbox.acknowledge(snapshot)).toBe(true);
    expect(outbox.hasQueuedGuildRows).toBe(false);
  });

  it('refuses stale, overlapping, and foreign snapshots without splicing newer work', () => {
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    commitOne(outbox, 'batch:first', 'peacebloom');
    const firstOnly = outbox.snapshot();
    commitOne(outbox, 'batch:second', 'silverleaf');
    const both = outbox.snapshot();

    expect(outbox.acknowledge(firstOnly)).toBe(true);
    const afterFirstAck = budget.usage;
    expect(outbox.canAcknowledge(both)).toBe(false);
    expect(outbox.canAcknowledge({ ...both })).toBe(false);
    expect(outbox.acknowledge(both)).toBe(false);
    expect(outbox.acknowledge(firstOnly)).toBe(false);
    expect(outbox.acknowledge({ ...both })).toBe(false);
    expect(outbox.snapshot().batches.map((batch) => batch.batchKey)).toEqual(['batch:second']);
    expect(budget.usage).toEqual(afterFirstAck);
  });

  it('discard releases queued batches and live reservations globally and closes the session', () => {
    const { budget, makeOutbox } = rig();
    const outbox = makeOutbox();
    commitOne(outbox, 'batch:queued', 'peacebloom');
    const snapshot = outbox.snapshot();
    const reservation = required(
      outbox.tryReserve({
        maxRows: 3,
        maxEncodedBytes: 3_000,
        batchKey: 'batch:reserved',
      }),
    );
    expect(budget.usage.rows).toBe(4);

    outbox.discard();

    expect(outbox.discarded).toBe(true);
    expect(outbox.hasQueuedGuildRows).toBe(false);
    expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
    expect(outbox.usage).toEqual({
      queuedRows: 0,
      queuedEncodedBytes: 0,
      reservedRows: 0,
      reservedEncodedBytes: 0,
    });
    expect(outbox.acknowledge(snapshot)).toBe(false);
    expect(outbox.canAcknowledge(snapshot)).toBe(false);
    expect(outbox.cancel(reservation)).toBe(false);
    expect(() => outbox.commit(reservation, [ledgerRow()])).toThrow(/discarded/i);
    expect(() =>
      outbox.tryReserve({ maxRows: 1, maxEncodedBytes: 1, batchKey: 'after-discard' }),
    ).toThrow(/discarded/i);
    outbox.discard();
    expect(budget.usage).toEqual({ rows: 0, encodedBytes: 0 });
  });
});
