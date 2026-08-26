// The durable per-parcel custody overlay (server/mail_custody_overlay.ts):
// SQL shapes against a mocked pool, the snapshot/bake set semantics that keep
// a row alive until its parcel is provably inside a committed full-book
// write, and the boot merge driven against a REAL Sim post office, because
// the replay-through-book-once-dedupe is exactly what a fake book would
// paper over.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestQuery = (text: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;

const db = vi.hoisted(() => ({ query: vi.fn<TestQuery>() }));

vi.mock('../../server/db', () => ({ pool: { query: db.query } }));

import {
  CUSTODY_PARCEL_LETTERS,
  confirmBakedCustodyRefs,
  custodyOverlayStats,
  deleteBakedCustodyRefsIn,
  mergeCustodyParcelOverlay,
  persistCustodyParcelRow,
  pruneMailCustodyParcelsBatch,
  resetCustodyParcelOverlayForTests,
  snapshotPendingCustodyRefs,
} from '../../server/mail_custody_overlay';
import { REALM } from '../../server/realm';
import { Sim } from '../../src/sim/sim';

const { query } = db;

const GOOD_ITEMS = [{ itemId: 'rusty_hatchet', count: 1 }];

function row(ref: string) {
  return {
    custodyRef: ref,
    recipient: { key: '4242', name: 'Buyer' },
    letter: 'delivery' as const,
    items: GOOD_ITEMS,
  };
}

beforeEach(() => {
  resetCustodyParcelOverlayForTests();
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe('persistCustodyParcelRow', () => {
  it('writes one idempotent realm-scoped row per parcel, keyed by custodyRef', async () => {
    await persistCustodyParcelRow(row('settlement:9'));
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO mail_custody_parcels/);
    // Idempotent by ref: a retry after a crash re-inserts harmlessly; the
    // book-once dedupe owns exactly-once on the mail side.
    expect(sql).toMatch(/ON CONFLICT \(custody_ref\) DO NOTHING/);
    expect(params).toEqual([
      'settlement:9',
      REALM,
      '4242',
      'Buyer',
      'delivery',
      JSON.stringify(GOOD_ITEMS),
    ]);
    expect(snapshotPendingCustodyRefs()).toEqual(['settlement:9']);
  });
});

describe('the bake set', () => {
  it('deletes exactly the snapshot on the writer client; refs booked after it stay pending', async () => {
    await persistCustodyParcelRow(row('a'));
    await persistCustodyParcelRow(row('b'));
    const snap = snapshotPendingCustodyRefs();
    await persistCustodyParcelRow(row('c'));
    // The DELETE rides the book write's OWN transaction client, injected;
    // the pool spy must stay untouched.
    query.mockClear();
    const txQuery = vi.fn(async (_text: string, _values: unknown[]) => ({ rows: [] }));
    await deleteBakedCustodyRefsIn(txQuery, snap);
    expect(query).not.toHaveBeenCalled();
    expect(txQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = txQuery.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM mail_custody_parcels WHERE custody_ref = ANY/);
    // Realm-qualified, defensive scoping.
    expect(sql).toMatch(/AND realm = \$2/);
    expect(params).toEqual([['a', 'b'], REALM]);
    // The set forgets refs only on the caller's post-commit confirm: a
    // rollback must leave them pending so the next write re-bakes them.
    expect(snapshotPendingCustodyRefs()).toEqual(['a', 'b', 'c']);
    confirmBakedCustodyRefs(snap);
    // 'c' was booked after the snapshot (necessarily across an await, so
    // after the full-book serialize): its row must survive this bake.
    expect(snapshotPendingCustodyRefs()).toEqual(['c']);
    expect(custodyOverlayStats().pendingBake).toBe(1);
  });

  it('issues no statement for an empty snapshot', async () => {
    const txQuery = vi.fn(async (_text: string, _values: unknown[]) => ({ rows: [] }));
    await deleteBakedCustodyRefsIn(txQuery, []);
    expect(txQuery).not.toHaveBeenCalled();
  });

  it('prunes only aged residue, batched', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 3 } as never);
    await expect(pruneMailCustodyParcelsBatch(500)).resolves.toBe(3);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM mail_custody_parcels/);
    expect(sql).toMatch(/created_at < now\(\) - \(\$1 \|\| ' days'\)::interval/);
    expect(sql).toMatch(/LIMIT \$2/);
    expect(params).toEqual(['30', 500]);
  });
});

describe('mergeCustodyParcelOverlay', () => {
  const FRESH = new Date('2026-08-26T12:00:00Z');
  function overlayRows(refs: string[], letter = 'delivery', createdAt: Date = FRESH) {
    return refs.map((ref) => ({
      custody_ref: ref,
      recipient_key: '4242',
      recipient_name: 'Buyer',
      letter,
      items: GOOD_ITEMS,
      created_at: createdAt,
    }));
  }

  /** First query of every merge: the mail blob's durability timestamp. */
  function mockBlobWrittenAt(at: Date | null) {
    query.mockResolvedValueOnce({ rows: at === null ? [] : [{ updated_at: at }] });
  }

  it('replays a crash-lost parcel into a real book, and dedupes it on the next boot', async () => {
    // The crash story: the parcel row survived, the blob write did not (no
    // blob row at all, so no cutoff applies).
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    mockBlobWrittenAt(null);
    query.mockResolvedValueOnce({ rows: overlayRows(['settlement:9']) });
    const first = await mergeCustodyParcelOverlay(sim);
    expect(first).toEqual({ replayed: 1, present: 0, refused: 0, stale: 0 });
    expect(query.mock.calls[0][0]).toMatch(/SELECT updated_at FROM world_state/);
    expect(query.mock.calls[1][0]).toMatch(/FROM mail_custody_parcels WHERE realm = \$1/);
    // The page bound: a pathological backlog cannot hold the boot hostage.
    expect(query.mock.calls[1][0]).toMatch(/LIMIT 10000/);
    expect(query.mock.calls[1][1]).toEqual([REALM]);
    expect(sim.postOffice.mail).toHaveLength(1);
    expect(sim.postOffice.mail[0].custodyRef).toBe('settlement:9');
    expect(sim.postOffice.mail[0].items.map((s) => s.itemId)).toEqual(['rusty_hatchet']);
    // An accounted ref joins the bake set so the next full-book write
    // cleans its row.
    expect(snapshotPendingCustodyRefs()).toEqual(['settlement:9']);

    // Second boot with the parcel already inside the loaded blob: the
    // book-once dedupe reports it present and books nothing new. The blob
    // write predates the row here (booked mid-write), so the cutoff must
    // NOT eat it.
    resetCustodyParcelOverlayForTests();
    mockBlobWrittenAt(new Date(FRESH.getTime() - 60_000));
    query.mockResolvedValueOnce({ rows: overlayRows(['settlement:9']) });
    const second = await mergeCustodyParcelOverlay(sim);
    expect(second).toEqual({ replayed: 0, present: 1, refused: 0, stale: 0 });
    expect(sim.postOffice.mail).toHaveLength(1);
    expect(snapshotPendingCustodyRefs()).toEqual(['settlement:9']);
  });

  it('deletes a stale row instead of replaying it (the rollback re-book guard)', async () => {
    // A committed book write POSTDATES the row: that write accounted for the
    // parcel, in the blob or durably collected out of it. Replaying it could
    // re-book a collected parcel, so the row is cleaned, never replayed.
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    mockBlobWrittenAt(new Date(FRESH.getTime() + 60_000));
    query.mockResolvedValueOnce({
      rows: [
        ...overlayRows(['collected:1']),
        ...overlayRows(['fresh:1'], 'delivery', new Date(FRESH.getTime() + 120_000)),
      ],
    });
    const result = await mergeCustodyParcelOverlay(sim);
    expect(result).toEqual({ replayed: 1, present: 0, refused: 0, stale: 1 });
    expect(sim.postOffice.mail.map((m) => m.custodyRef)).toEqual(['fresh:1']);
    const del = query.mock.calls[2];
    expect(del[0]).toMatch(/DELETE FROM mail_custody_parcels WHERE custody_ref = ANY/);
    expect(del[1]).toEqual([['collected:1']]);
    expect(snapshotPendingCustodyRefs()).toEqual(['fresh:1']);
  });

  it('keeps a malformed or refused row out of the bake set instead of destroying it', async () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    mockBlobWrittenAt(null);
    query.mockResolvedValueOnce({
      rows: [
        ...overlayRows(['bogus:1'], 'not_a_letter'),
        // A parcel whose items no longer validate: refused by the book and
        // absent, so the row must survive for the operator.
        {
          custody_ref: 'refused:1',
          recipient_key: '4242',
          recipient_name: 'Buyer',
          letter: 'delivery',
          items: [{ itemId: 'no_such_item_id', count: 1 }],
          created_at: FRESH,
        },
        ...overlayRows(['ok:1']),
      ],
    });
    const result = await mergeCustodyParcelOverlay(sim);
    expect(result).toEqual({ replayed: 1, present: 0, refused: 2, stale: 0 });
    // Only the accounted ref may ever be baked away; the refused rows'
    // absence from the set is what keeps their rows in the table.
    expect(snapshotPendingCustodyRefs()).toEqual(['ok:1']);
  });

  it('never throws: a merge failure reads as replay-later, not as a load failure', async () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(mergeCustodyParcelOverlay(sim)).resolves.toEqual({
      replayed: 0,
      present: 0,
      refused: 0,
      stale: 0,
    });
    expect(sim.postOffice.mail).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Wiring-order pins. The bake contract is positional (snapshot before the
// serialize-adjacent await, delete only after the committed arm), and the
// merge must only run after a successful book load: these read the source
// because the ordering IS the contract, and a refactor that reorders it
// silently reopens the fast-collect dupe or the failed-load clobber.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('bake and merge wiring order', () => {
  const dbSrc = readFileSync(path.resolve(process.cwd(), 'server/db.ts'), 'utf8');
  const gameSrc = readFileSync(path.resolve(process.cwd(), 'server/game.ts'), 'utf8');

  it('saveMailState snapshots at entry and bakes inside the book transaction', () => {
    const body = dbSrc.slice(dbSrc.indexOf('export async function saveMailState'));
    const snapshotAt = body.indexOf('snapshotPendingCustodyRefs()');
    const beginAt = body.indexOf("client.query('BEGIN')");
    const writeAt = body.indexOf('INSERT INTO world_state');
    const deleteAt = body.indexOf('deleteBakedCustodyRefsIn(');
    const commitAt = body.indexOf("client.query('COMMIT')");
    const confirmAt = body.indexOf('confirmBakedCustodyRefs(');
    // Snapshot before anything awaits; the bake DELETE strictly inside the
    // transaction (after the upsert, before COMMIT), so the blob and the row
    // removal commit together; the in-memory confirm only after COMMIT.
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeLessThan(body.indexOf('await '));
    expect(writeAt).toBeGreaterThan(beginAt);
    expect(deleteAt).toBeGreaterThan(writeAt);
    expect(deleteAt).toBeLessThan(commitAt);
    expect(confirmAt).toBeGreaterThan(commitAt);
  });

  it('the atomic leave-path save bakes inside the fenced transaction, confirmed after COMMIT', () => {
    const start = dbSrc.indexOf('export async function saveCharacterAndMarketState');
    const body = dbSrc.slice(start, dbSrc.indexOf('export', start + 10));
    const snapshotAt = body.indexOf('snapshotPendingCustodyRefs()');
    const deleteAt = body.indexOf('deleteBakedCustodyRefsIn(');
    const commitAt = body.indexOf("await client.query('COMMIT')");
    const confirmAt = body.indexOf('confirmBakedCustodyRefs(');
    // Snapshot at entry, before the first await; the DELETE inside the
    // transaction; the confirm on the committed arm only, so neither the
    // fence-refused false arm nor a rollback can forget a pending ref.
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeLessThan(body.indexOf('await '));
    expect(deleteAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeLessThan(commitAt);
    expect(confirmAt).toBeGreaterThan(commitAt);
    expect(body.split('deleteBakedCustodyRefsIn(')).toHaveLength(2);
    expect(body.split('confirmBakedCustodyRefs(')).toHaveLength(2);
  });

  it('serializeMail is a deep snapshot: later book mutations cannot reach written bytes', () => {
    // The bake contract assumes the serialized book is frozen at thunk entry;
    // a lazy or copy-on-write serializeMail would silently break it.
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    sim.mailSystemParcel(
      { key: '4242', name: 'Buyer' },
      CUSTODY_PARCEL_LETTERS.delivery,
      GOOD_ITEMS,
      'snap:1',
    );
    const snapshot = sim.serializeMail();
    const before = JSON.stringify(snapshot);
    sim.mailSystemParcel(
      { key: '4242', name: 'Buyer' },
      CUSTODY_PARCEL_LETTERS.delivery,
      GOOD_ITEMS,
      'snap:2',
    );
    sim.postOffice.mail[0].items.push({ itemId: 'rusty_hatchet', count: 99 });
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('game.loadMail merges the overlay only after a successful book load', () => {
    const start = gameSrc.indexOf('async loadMail()');
    const body = gameSrc.slice(start, gameSrc.indexOf('async saveMail()', start));
    const loadAt = body.indexOf('this.sim.loadMail(await loadMailState())');
    const mergeAt = body.indexOf('mergeCustodyParcelOverlay(this.sim)');
    const catchAt = body.indexOf('catch');
    // The merge sits after the load INSIDE the same try: a failed load must
    // skip it (merging onto an unloaded book would re-book parcels the
    // stored blob still owns).
    expect(loadAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(loadAt);
    expect(mergeAt).toBeLessThan(catchAt);
  });
});
