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
  deleteBakedCustodyRefs,
  mergeCustodyParcelOverlay,
  persistCustodyParcelRow,
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
  it('deletes exactly the snapshot; refs booked after it stay pending', async () => {
    await persistCustodyParcelRow(row('a'));
    await persistCustodyParcelRow(row('b'));
    const snap = snapshotPendingCustodyRefs();
    await persistCustodyParcelRow(row('c'));
    query.mockClear();
    await deleteBakedCustodyRefs(snap);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM mail_custody_parcels WHERE custody_ref = ANY/);
    expect(params).toEqual([['a', 'b']]);
    // 'c' was booked after the snapshot (necessarily across an await, so
    // after the full-book serialize): its row must survive this bake.
    expect(snapshotPendingCustodyRefs()).toEqual(['c']);
  });

  it('keeps the refs pending when the delete fails, so the next write retries', async () => {
    await persistCustodyParcelRow(row('a'));
    const snap = snapshotPendingCustodyRefs();
    query.mockRejectedValueOnce(new Error('db down'));
    // Non-throwing by contract: this runs after a COMMIT, and a failure here
    // must never re-mark the committed save as failed.
    await expect(deleteBakedCustodyRefs(snap)).resolves.toBeUndefined();
    expect(snapshotPendingCustodyRefs()).toEqual(['a']);
    query.mockResolvedValueOnce({ rows: [] });
    await deleteBakedCustodyRefs(snapshotPendingCustodyRefs());
    expect(snapshotPendingCustodyRefs()).toEqual([]);
  });

  it('deletes nothing for an empty snapshot', async () => {
    await deleteBakedCustodyRefs([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('mergeCustodyParcelOverlay', () => {
  function overlayRows(refs: string[], letter = 'delivery') {
    return refs.map((ref) => ({
      custody_ref: ref,
      recipient_key: '4242',
      recipient_name: 'Buyer',
      letter,
      items: GOOD_ITEMS,
    }));
  }

  it('replays a crash-lost parcel into a real book, and dedupes it on the next boot', async () => {
    // The crash story: the parcel row survived, the blob write did not.
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    query.mockResolvedValueOnce({ rows: overlayRows(['settlement:9']) });
    const first = await mergeCustodyParcelOverlay(sim);
    expect(first).toEqual({ replayed: 1, present: 0, refused: 0 });
    expect(query.mock.calls[0][0]).toMatch(/FROM mail_custody_parcels WHERE realm = \$1/);
    expect(query.mock.calls[0][1]).toEqual([REALM]);
    expect(sim.postOffice.mail).toHaveLength(1);
    expect(sim.postOffice.mail[0].custodyRef).toBe('settlement:9');
    expect(sim.postOffice.mail[0].items.map((s) => s.itemId)).toEqual(['rusty_hatchet']);
    // An accounted ref joins the bake set so the next full-book write
    // cleans its row.
    expect(snapshotPendingCustodyRefs()).toEqual(['settlement:9']);

    // Second boot with the parcel already inside the loaded blob: the
    // book-once dedupe reports it present and books nothing new.
    resetCustodyParcelOverlayForTests();
    query.mockResolvedValueOnce({ rows: overlayRows(['settlement:9']) });
    const second = await mergeCustodyParcelOverlay(sim);
    expect(second).toEqual({ replayed: 0, present: 1, refused: 0 });
    expect(sim.postOffice.mail).toHaveLength(1);
    expect(snapshotPendingCustodyRefs()).toEqual(['settlement:9']);
  });

  it('keeps a malformed or refused row out of the bake set instead of destroying it', async () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
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
        },
        ...overlayRows(['ok:1']),
      ],
    });
    const result = await mergeCustodyParcelOverlay(sim);
    expect(result).toEqual({ replayed: 1, present: 0, refused: 2 });
    // Only the accounted ref may ever be baked away; the refused rows'
    // absence from the set is what keeps their rows in the table.
    expect(snapshotPendingCustodyRefs()).toEqual(['ok:1']);
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

  it('saveMailState snapshots at entry and deletes only after the book write', () => {
    const body = dbSrc.slice(dbSrc.indexOf('export async function saveMailState'));
    const snapshotAt = body.indexOf('snapshotPendingCustodyRefs()');
    const writeAt = body.indexOf('saveWorldState(mailStateKey');
    const deleteAt = body.indexOf('deleteBakedCustodyRefs(');
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(snapshotAt);
    expect(deleteAt).toBeGreaterThan(writeAt);
  });

  it('the atomic leave-path save deletes only on the committed arm', () => {
    const start = dbSrc.indexOf('export async function saveCharacterAndMarketState');
    const body = dbSrc.slice(start, dbSrc.indexOf('export', start + 10));
    const snapshotAt = body.indexOf('snapshotPendingCustodyRefs()');
    const commitAt = body.indexOf("await client.query('COMMIT')");
    const deleteAt = body.indexOf('deleteBakedCustodyRefs(');
    // Snapshot at entry, before the first await; delete strictly after the
    // COMMIT; and exactly one delete call, so neither the fence-refused
    // false arm nor the rollback arm can reach one.
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeLessThan(body.indexOf('await '));
    expect(deleteAt).toBeGreaterThan(commitAt);
    expect(body.split('deleteBakedCustodyRefs(')).toHaveLength(2);
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
