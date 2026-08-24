// The Ravenpost's partitioned persistence (server/db.ts, #3561): the
// per-recipient key builder, the incremental batched-upsert write
// (saveMailPartitions), and the union read that reconstructs a full book from
// those rows (loadMailState). Mirrors market_db.test.ts's mocked-pool idiom;
// server/mail_partition_backfill.test.ts owns the boot-time migration itself.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test/test';
  const clientQuery = vi.fn();
  return {
    query: vi.fn(),
    clientQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
  };
});

vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return { query: dbMock.query, connect: dbMock.connect };
  }),
}));

import {
  closeMailPartitionWriteGateForTests,
  loadMailState,
  mailRecipientKey,
  mailStateKey,
  openMailPartitionWriteGate,
  saveMailPartitions,
} from '../server/db';
import { REALM } from '../server/realm';

beforeEach(() => {
  dbMock.query.mockReset();
  dbMock.clientQuery.mockReset();
  dbMock.connect.mockClear();
  // Every test starts from the boot default: the mail partition write gate is
  // CLOSED until ensureSchema's backfill opens it. Tests that need to write
  // open it explicitly.
  closeMailPartitionWriteGateForTests();
});

describe('mailRecipientKey', () => {
  it('keys on realm and recipient, URI-encoding the recipient so a colon cannot forge a different row', () => {
    expect(mailRecipientKey(REALM, 'char-1')).toBe(`mail:${REALM}:r:char-1`);
    expect(mailRecipientKey('Ironforge', 'char-1')).not.toBe(
      mailRecipientKey('Stormhaven', 'char-1'),
    );
    // A recipientKey containing this format's own delimiter must not let a
    // caller pass a colon-bearing key and land on another recipient's row.
    expect(mailRecipientKey(REALM, 'weird:name')).toBe(`mail:${REALM}:r:weird%3Aname`);
  });

  it('never shares a key with the legacy whole-book blob', () => {
    expect(mailRecipientKey(REALM, 'anything')).not.toBe(mailStateKey(REALM));
  });
});

describe('loadMailState (pure read: union of partition rows, backfill owns migration)', () => {
  it('returns the union of every partition row for this realm, with one ranged read', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [
        { data: { mail: [{ id: 1, recipientKey: 'a' }] } },
        {
          data: {
            mail: [
              { id: 2, recipientKey: 'b' },
              { id: 3, recipientKey: 'b' },
            ],
          },
        },
      ],
    });

    const loaded = await loadMailState();

    expect(loaded).toEqual({
      mail: [
        { id: 1, recipientKey: 'a' },
        { id: 2, recipientKey: 'b' },
        { id: 3, recipientKey: 'b' },
      ],
      nextMailId: 1,
    });
    // Exactly one ranged read, bounded to this realm's partitioned prefix: no
    // marker probe, no legacy read, no write-back.
    expect(dbMock.query).toHaveBeenCalledTimes(1);
    expect(dbMock.query.mock.calls[0][1]).toEqual([`mail:${REALM}:r:`, `mail:${REALM}:r;`]);
  });

  it('returns null when the backfill marker exists and no partition row does (a genuinely empty realm)', async () => {
    dbMock.query
      .mockResolvedValueOnce({ rows: [] }) // ranged partition read -> none
      .mockResolvedValueOnce({ rows: [{ data: { legacyRowFound: false } }] }); // marker present

    const loaded = await loadMailState();

    expect(loaded).toBeNull();
    expect(dbMock.query).toHaveBeenCalledTimes(2);
  });

  it('falls back to the retained legacy blob only when the marker is ALSO absent (pre-migration defensive net)', async () => {
    const legacy = { mail: [{ id: 9, recipientKey: 'z' }], nextMailId: 10 };
    dbMock.query
      .mockResolvedValueOnce({ rows: [] }) // ranged partition read -> none
      .mockResolvedValueOnce({ rows: [] }) // marker read -> absent (never backfilled)
      .mockResolvedValueOnce({ rows: [{ data: legacy }] }); // legacy mail:<realm> row

    const loaded = await loadMailState();

    expect(loaded).toEqual(legacy);
    expect(dbMock.query).toHaveBeenCalledTimes(3);
    expect(dbMock.query.mock.calls[2][1]).toEqual([mailStateKey(REALM)]);
  });

  it('ignores a row with a malformed (non-array) mail field rather than throwing', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [{ data: { mail: [{ id: 1, recipientKey: 'a' }] } }, { data: { notMail: true } }],
    });

    const loaded = await loadMailState();
    expect(loaded?.mail).toEqual([{ id: 1, recipientKey: 'a' }]);
  });
});

describe('saveMailPartitions (the incremental autosave write, #3561)', () => {
  it('an empty partitions array issues no SQL at all: a quiet interval writes nothing', async () => {
    openMailPartitionWriteGate();
    await saveMailPartitions([]);
    expect(dbMock.query).not.toHaveBeenCalled();
  });

  it('writes every dirty recipient in ONE batched multi-row UPSERT, never one query per recipient', async () => {
    openMailPartitionWriteGate();
    dbMock.query.mockResolvedValueOnce({ rows: [] });

    await saveMailPartitions([
      { recipientKey: 'alice', letters: [{ id: 1, recipientKey: 'alice' }] as never },
      { recipientKey: 'bob', letters: [] as never },
    ]);

    expect(dbMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(String(sql)).toMatch(/UNNEST/i);
    expect(String(sql)).toMatch(/ON CONFLICT \(key\) DO UPDATE/i);
    const [keys, datas] = params as [string[], string[]];
    expect(keys).toEqual([`mail:${REALM}:r:alice`, `mail:${REALM}:r:bob`]);
    expect(JSON.parse(datas[0])).toEqual({ mail: [{ id: 1, recipientKey: 'alice' }] });
    expect(JSON.parse(datas[1])).toEqual({ mail: [] }); // an emptied-out mailbox is still a legitimate row
  });

  it('blocks the write when the mail partition gate is closed (ensureSchema has not confirmed the marker yet)', async () => {
    // Gate starts closed (beforeEach); do NOT open it.
    await expect(
      saveMailPartitions([{ recipientKey: 'alice', letters: [] as never }]),
    ).rejects.toThrow(/mail partition write blocked/);
    expect(dbMock.query).not.toHaveBeenCalled();
  });
});
