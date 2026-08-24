// Unit test for the partitioned Ravenpost mail backfill
// (server/mail_partition_backfill.ts, #3561). Postgres is a plain recording
// fake, the same idiom as tests/server/market_backfill.test.ts: every call
// records { text, params } and returns a scripted rows array, so every path
// is deterministic with no live database. Unlike the market backfill, this
// migration is single-realm (mail was always realm-scoped) so there is no
// cross-realm seller resolution to script.
import { describe, expect, it, vi } from 'vitest';
import {
  mailPartitionMarkerKey,
  mailRecipientKey,
  mailStateKey,
  partitionMailByRecipient,
  runMailPartitionBackfill,
} from '../../server/mail_partition_backfill';
import type { MailSave } from '../../src/sim/sim';

type Letter = MailSave['mail'][number];

function mkLetter(over: Partial<Letter> = {}): Letter {
  return {
    id: 1,
    recipientKey: 'alice',
    recipientName: 'Alice',
    senderName: 'System',
    kind: 'system',
    subject: 'Hi',
    body: '',
    copper: 0,
    items: [],
    deliverIn: 0,
    secondsLeft: -1,
    read: false,
    ...over,
  };
}

interface ClientScript {
  marker?: unknown[];
  legacy?: unknown[];
}

function makeClient(script: ClientScript = {}) {
  const calls: { text: string; params: unknown[] }[] = [];
  const query = vi.fn((text: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
    const p = params ?? [];
    calls.push({ text, params: p });
    if (text.includes('FOR UPDATE')) return Promise.resolve({ rows: script.legacy ?? [] });
    if (text.startsWith('SELECT') && text.includes('world_state')) {
      return Promise.resolve({ rows: script.marker ?? [] });
    }
    return Promise.resolve({ rows: [] }); // INSERT ... world_state
  });
  return { query, calls };
}

describe('key builders', () => {
  it('mailStateKey and mailRecipientKey are realm-scoped and never collide', () => {
    expect(mailStateKey('Home')).toBe('mail:Home');
    expect(mailRecipientKey('Home', 'alice')).toBe('mail:Home:r:alice');
    expect(mailRecipientKey('Home', 'alice')).not.toBe(mailRecipientKey('Away', 'alice'));
    expect(mailRecipientKey('Home', 'alice')).not.toBe(mailStateKey('Home'));
  });

  it('mailPartitionMarkerKey is realm-scoped: one realm backfilling never marks another done', () => {
    expect(mailPartitionMarkerKey('Home')).toBe('mail_partition_done:Home');
    expect(mailPartitionMarkerKey('Home')).not.toBe(mailPartitionMarkerKey('Away'));
  });
});

describe('partitionMailByRecipient', () => {
  it('groups letters by recipientKey, preserving book order within each bucket', () => {
    const a1 = mkLetter({ id: 1, recipientKey: 'alice' });
    const b1 = mkLetter({ id: 2, recipientKey: 'bob' });
    const a2 = mkLetter({ id: 3, recipientKey: 'alice' });
    const grouped = partitionMailByRecipient([a1, b1, a2]);
    expect([...grouped.keys()]).toEqual(['alice', 'bob']);
    expect(grouped.get('alice')).toEqual([a1, a2]);
    expect(grouped.get('bob')).toEqual([b1]);
  });

  it('drops a letter with a non-string recipientKey (a corrupt row) rather than throwing', () => {
    const good = mkLetter({ id: 1, recipientKey: 'alice' });
    const corrupt = { ...mkLetter({ id: 2 }), recipientKey: null } as unknown as Letter;
    const grouped = partitionMailByRecipient([good, corrupt]);
    expect([...grouped.keys()]).toEqual(['alice']);
    expect(grouped.get('alice')).toEqual([good]);
  });

  it('an empty or undefined mail array yields an empty map', () => {
    expect(partitionMailByRecipient([]).size).toBe(0);
    expect(partitionMailByRecipient(undefined as unknown as Letter[]).size).toBe(0);
  });
});

describe('runMailPartitionBackfill', () => {
  it('is a no-op issuing exactly one query when this realm marker already exists', async () => {
    const client = makeClient({ marker: [{ data: { legacyRowFound: true } }] });
    const res = await runMailPartitionBackfill({ client, realm: 'Home' });

    expect(res).toEqual({ ran: false, legacyRowFound: false, recipientCount: 0, letterCount: 0 });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.calls[0].params[0]).toBe('mail_partition_done:Home');
  });

  it("claims THIS realm's legacy row FOR UPDATE, never another realm's", async () => {
    const legacy: MailSave = { mail: [mkLetter()], nextMailId: 2 };
    const client = makeClient({ legacy: [{ data: legacy }] });
    await runMailPartitionBackfill({ client, realm: 'Home', log: () => {} });

    const forUpdate = client.calls.find((c) => c.text.includes('FOR UPDATE'));
    expect(forUpdate).toBeDefined();
    expect(forUpdate?.text).toContain('SELECT data FROM world_state');
    expect(forUpdate?.params[0]).toBe('mail:Home');
  });

  it('records the marker with legacyRowFound false and writes no partition row on a fresh realm', async () => {
    const client = makeClient({ marker: [], legacy: [] });
    const res = await runMailPartitionBackfill({ client, realm: 'Home', log: () => {} });

    expect(res).toEqual({ ran: true, legacyRowFound: false, recipientCount: 0, letterCount: 0 });
    const partitionUpserts = client.calls.filter(
      (c) => c.text.startsWith('INSERT') && String(c.params[0]).includes(':r:'),
    );
    expect(partitionUpserts).toHaveLength(0);
    const marker = client.calls.find(
      (c) => c.text.startsWith('INSERT') && c.params[0] === 'mail_partition_done:Home',
    );
    expect(marker).toBeDefined();
    expect(JSON.parse(String(marker?.params[1]))).toEqual({
      legacyRowFound: false,
      recipientCount: 0,
      letterCount: 0,
    });
  });

  it('partitions the legacy row per recipient and records accurate counts in the marker', async () => {
    const legacy: MailSave = {
      mail: [
        mkLetter({ id: 1, recipientKey: 'alice' }),
        mkLetter({ id: 2, recipientKey: 'bob' }),
        mkLetter({ id: 3, recipientKey: 'alice' }),
      ],
      nextMailId: 4,
    };
    const client = makeClient({ legacy: [{ data: legacy }] });
    const res = await runMailPartitionBackfill({ client, realm: 'Home', log: () => {} });

    expect(res).toMatchObject({
      ran: true,
      legacyRowFound: true,
      recipientCount: 2,
      letterCount: 3,
    });
    const partitionUpserts = client.calls.filter(
      (c) => c.text.startsWith('INSERT') && String(c.params[0]).includes(':r:'),
    );
    expect(partitionUpserts.map((c) => c.params[0]).sort()).toEqual([
      'mail:Home:r:alice',
      'mail:Home:r:bob',
    ]);
    const aliceRow = JSON.parse(
      String(partitionUpserts.find((c) => c.params[0] === 'mail:Home:r:alice')?.params[1]),
    ) as { mail: Letter[] };
    expect(aliceRow.mail.map((m) => m.id)).toEqual([1, 3]);
    const bobRow = JSON.parse(
      String(partitionUpserts.find((c) => c.params[0] === 'mail:Home:r:bob')?.params[1]),
    ) as { mail: Letter[] };
    expect(bobRow.mail.map((m) => m.id)).toEqual([2]);
    // Legacy retention: no DELETE anywhere, and the legacy key is never
    // re-written by this migration (the rollback artifact stays byte-exact).
    for (const c of client.calls) {
      expect(c.text).not.toContain('DELETE');
      if (c.text.startsWith('INSERT')) expect(c.params[0]).not.toBe('mail:Home');
    }
  });

  it('resolves to the SAME key format URI-encoded recipient keys use in production (encodeURIComponent)', async () => {
    const legacy: MailSave = {
      mail: [mkLetter({ id: 1, recipientKey: 'weird:name' })],
      nextMailId: 2,
    };
    const client = makeClient({ legacy: [{ data: legacy }] });
    await runMailPartitionBackfill({ client, realm: 'Home', log: () => {} });

    const partitionUpserts = client.calls.filter(
      (c) => c.text.startsWith('INSERT') && String(c.params[0]).includes(':r:'),
    );
    expect(partitionUpserts.map((c) => c.params[0])).toEqual(['mail:Home:r:weird%3Aname']);
  });

  it('pins the load-bearing SQL fragments to literal text', async () => {
    const legacy: MailSave = { mail: [mkLetter()], nextMailId: 2 };
    const client = makeClient({ legacy: [{ data: legacy }] });
    await runMailPartitionBackfill({ client, realm: 'Home', log: () => {} });

    const forUpdate = client.calls.find((c) => c.text.includes('FOR UPDATE'));
    expect(forUpdate?.text).toContain('FOR UPDATE');
    const upsert = client.calls.find((c) => c.text.startsWith('INSERT'));
    expect(upsert?.text).toContain('INSERT INTO world_state');
    expect(upsert?.text).toContain('ON CONFLICT (key) DO UPDATE');
    const markerWrite = client.calls.find(
      (c) => c.text.startsWith('INSERT') && c.params[0] === 'mail_partition_done:Home',
    );
    expect(markerWrite).toBeDefined();
  });
});
