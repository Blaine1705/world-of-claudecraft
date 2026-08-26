// Durable per-parcel overlay for $WOC custody mail. Booking a custody parcel
// used to persist by re-serializing and rewriting the ENTIRE per-realm mail
// blob (89 MB in production, roughly 250 ms of main-thread stringify per
// parcel on the shared market serial writer), so each delivered item, return,
// and sold notice cost the world loop an amount proportional to the book, not
// the parcel. Instead, each booked parcel writes ONE small row here, durable
// before the settlement advances. The parcel itself lives in the in-memory
// book as before and reaches the blob on the next full book write (the 30 s
// autosave or the leave-path atomic save), after which its row is deleted
// ("baked").
//
// Crash contract. A durable FULL-BOOK write is also the collection-durability
// event, so rows are deleted only for parcels booked BEFORE that write
// serialized (the pendingBake snapshot below), never by comparing book
// contents: a parcel collected fast still gets its row deleted (the book
// without it is durable truth), while a parcel booked mid-write keeps its
// row. At boot, surviving rows REPLAY through the sim's book-once
// mailSystemParcel: a parcel already inside the loaded blob dedupes on its
// custodyRef, and one the crash window lost is re-booked (the letter re-dates
// to the reboot, which is the existing crash-window semantics). Replay runs
// only after a SUCCESSFUL book load; merging onto an unloaded book would
// re-book parcels the stored blob still owns.
//
// Retention: rows are bounded by parcels booked between two full book writes
// plus crash leftovers, and both populations are cleaned by the next bake
// after the next boot's merge, so this table needs no retention-sweep
// registration.

import {
  type LetterDef,
  WOC_MARKET_DELIVERY_LETTER,
  WOC_MARKET_RETURN_LETTER,
  WOC_MARKET_SOLD_LETTER,
} from '../src/sim/content/letters';
import type { InvSlot } from '../src/sim/types';
// Deliberate cycle with ./db (which imports this module's SCHEMA const):
// safe ONLY because `pool` is dereferenced inside function bodies, never at
// module scope. Do not add module-scope pool usage here.
import { pool } from './db';
import { REALM } from './realm';

export const MAIL_CUSTODY_PARCELS_SCHEMA = `
CREATE TABLE IF NOT EXISTS mail_custody_parcels (
  custody_ref TEXT PRIMARY KEY,
  realm TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  letter TEXT NOT NULL,
  items JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mail_custody_parcels_realm_created
  ON mail_custody_parcels (realm, created_at);
`;

export type CustodyParcelLetter = 'delivery' | 'return' | 'sold_notice';

/** The letter templates by overlay kind: the same mapping the custody bridge
 *  books with, so a replayed parcel is byte-for-byte the letter the delivery
 *  path would have sent. */
export const CUSTODY_PARCEL_LETTERS: Record<CustodyParcelLetter, LetterDef> = {
  delivery: WOC_MARKET_DELIVERY_LETTER,
  return: WOC_MARKET_RETURN_LETTER,
  sold_notice: WOC_MARKET_SOLD_LETTER,
};

export interface CustodyParcelRow {
  custodyRef: string;
  recipient: { key: string; name: string };
  letter: CustodyParcelLetter;
  items: InvSlot[];
}

/** The slice of Sim the boot merge needs (the real Sim satisfies it). */
export interface CustodyParcelBook {
  mailSystemParcel(
    recipient: { key: string; name: string },
    letter: LetterDef,
    items: InvSlot[],
    custodyRef?: string,
  ): boolean;
  hasCustodyParcel(custodyRef: string): boolean;
}

// Refs booked in THIS process (inserted here or replayed by the boot merge)
// whose parcels sit in the in-memory book but are not yet baked into a
// durable full-book write. One custody bridge per realm process, so
// module-level like the escrow counters in woc_market_custody.ts.
const pendingBake = new Set<string>();

/** Persist one booked parcel. Idempotent per custodyRef (a retry after a
 *  crash re-inserts harmlessly; the book-once dedupe owns exactly-once on
 *  the mail side). Resolving is the parcel's durability: callers must not
 *  advance a settlement until this resolves. */
export async function persistCustodyParcelRow(row: CustodyParcelRow): Promise<void> {
  await pool.query(
    `INSERT INTO mail_custody_parcels (custody_ref, realm, recipient_key, recipient_name, letter, items)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (custody_ref) DO NOTHING`,
    [
      row.custodyRef,
      REALM,
      row.recipient.key,
      row.recipient.name,
      row.letter,
      JSON.stringify(row.items),
    ],
  );
  pendingBake.add(row.custodyRef);
}

/** Snapshot the refs pending bake, taken by a full-book writer AT ENTRY,
 *  before anything awaits: no awaited gap separates the caller's
 *  serializeMail() argument from the callee's first statement, so every
 *  snapshotted parcel is inside the book being written or durably collected
 *  out of it, and a parcel booked later (necessarily across an await) is
 *  never snapshotted. */
export function snapshotPendingCustodyRefs(): string[] {
  return [...pendingBake];
}

/** Issue the bake DELETE on the SAME client, INSIDE the transaction that
 *  makes the book durable: "blob durable without the parcel" and "row gone"
 *  must commit together, or two failed post-commit deletes bracketing a
 *  collection would leave a row that replays a collected parcel (the
 *  structural exactly-once the old whole-book write had for free). A throw
 *  here rolls the book write back with it, which is the correct atomicity.
 *  The realm qualifier is defensive scoping (refs are globally unique
 *  today). */
export async function deleteBakedCustodyRefsIn(
  query: (text: string, values: unknown[]) => Promise<unknown>,
  refs: readonly string[],
): Promise<void> {
  if (refs.length === 0) return;
  await query(
    `DELETE FROM mail_custody_parcels WHERE custody_ref = ANY($1::text[]) AND realm = $2`,
    [[...refs], REALM],
  );
}

/** Forget the baked refs AFTER their transaction committed (never before: a
 *  rollback must leave them pending so the next write re-bakes them). */
export function confirmBakedCustodyRefs(refs: readonly string[]): void {
  for (const ref of refs) pendingBake.delete(ref);
}

// The last boot merge's counts plus the live bake-set size, for the market
// monitor readout: a growing overlay table or a stuck refused row must be
// visible to an operator without a log grep.
let lastMergeCounts: CustodyOverlayMergeCounts | null = null;
export function custodyOverlayStats(): {
  pendingBake: number;
  lastMerge: CustodyOverlayMergeCounts | null;
} {
  return { pendingBake: pendingBake.size, lastMerge: lastMergeCounts };
}

/** Residue reaper for the nightly retention sweep. The bake and the boot
 *  merge's stale cutoff clean every healthy row, so this drains only the
 *  residue those paths structurally cannot reach: refused rows an operator
 *  never resolved, and rows for a realm no process serves any more. The
 *  window is a constant (deliberately no env knob, the stepup-challenges
 *  pattern): far past any plausible investigation, and rows this old
 *  describe parcels whose settlement machinery gave up long ago. */
export const MAIL_CUSTODY_RESIDUE_RETENTION_DAYS = 30;

export async function pruneMailCustodyParcelsBatch(batchSize: number): Promise<number> {
  const res = await pool.query(
    `DELETE FROM mail_custody_parcels
      WHERE ctid IN (
        SELECT ctid FROM mail_custody_parcels
         WHERE created_at < now() - ($1 || ' days')::interval
         ORDER BY created_at
         LIMIT $2)`,
    [String(MAIL_CUSTODY_RESIDUE_RETENTION_DAYS), Math.max(1, Math.floor(batchSize))],
  );
  return res.rowCount ?? 0;
}

function isCustodyParcelLetter(value: unknown): value is CustodyParcelLetter {
  return value === 'delivery' || value === 'return' || value === 'sold_notice';
}

/** The boot merge's page bound: past it the merge logs loudly and leaves the
 *  remainder for the next boot or bake, so a pathological backlog can never
 *  hold the boot path hostage. */
export const MERGE_PAGE_LIMIT = 10_000;

export interface CustodyOverlayMergeCounts {
  replayed: number;
  present: number;
  refused: number;
  stale: number;
}

/** Boot merge: replay the surviving overlay rows for this realm through the
 *  book-once parcel entry. A parcel already in the loaded blob dedupes on
 *  its custodyRef; one the crash window lost re-books. Every accounted ref
 *  joins pendingBake so the next full-book write cleans its row.
 *
 *  THE STALE CUTOFF is the rollback-window guard: a row whose created_at
 *  predates the mail blob's own updated_at describes a parcel that some
 *  committed full-book write already accounted for, in the blob or durably
 *  collected out of it (the writers snapshot at entry, and only this realm's
 *  single process writes its blob), so replaying it could re-book a
 *  COLLECTED parcel: the one dupe an old binary running without the bake
 *  could otherwise leave behind. Stale rows are deleted, never replayed;
 *  both timestamps are database-clock now(), so no host skew. A row that is
 *  fresh but refused (its items no longer validate, which a parcel that
 *  booked once should never hit) is kept and reported for the operator, and
 *  becomes stale, then cleaned, once a later book write postdates it.
 *
 *  Never throws: the book already loaded successfully by the time this runs,
 *  and a merge failure must read as "parcels replay on a later boot", not as
 *  a mail-load failure. */
export async function mergeCustodyParcelOverlay(
  book: CustodyParcelBook,
): Promise<CustodyOverlayMergeCounts> {
  const counts: CustodyOverlayMergeCounts = { replayed: 0, present: 0, refused: 0, stale: 0 };
  try {
    // The blob's durability point (db.ts mailStateKey format).
    const blob = await pool.query(`SELECT updated_at FROM world_state WHERE key = $1`, [
      `mail:${REALM}`,
    ]);
    const bookWrittenAtMs = blob.rows[0] ? new Date(blob.rows[0].updated_at).getTime() : null;
    const res = await pool.query(
      `SELECT custody_ref, recipient_key, recipient_name, letter, items, created_at
       FROM mail_custody_parcels WHERE realm = $1 ORDER BY created_at, custody_ref
       LIMIT ${MERGE_PAGE_LIMIT}`,
      [REALM],
    );
    const staleRefs: string[] = [];
    for (const r of res.rows) {
      const ref = String(r.custody_ref);
      if (bookWrittenAtMs !== null && new Date(r.created_at).getTime() <= bookWrittenAtMs) {
        staleRefs.push(ref);
        continue;
      }
      const letter: unknown = r.letter;
      if (!isCustodyParcelLetter(letter) || !Array.isArray(r.items)) {
        counts.refused++;
        console.error(`[mail_custody] overlay row malformed for custodyRef ${ref}`);
        continue;
      }
      const recipient = { key: String(r.recipient_key), name: String(r.recipient_name) };
      if (book.mailSystemParcel(recipient, CUSTODY_PARCEL_LETTERS[letter], r.items, ref)) {
        counts.replayed++;
      } else if (book.hasCustodyParcel(ref)) {
        counts.present++;
      } else {
        counts.refused++;
        console.error(`[mail_custody] overlay replay refused for custodyRef ${ref}`);
        continue;
      }
      pendingBake.add(ref);
    }
    if (staleRefs.length > 0) {
      counts.stale = staleRefs.length;
      await pool.query(`DELETE FROM mail_custody_parcels WHERE custody_ref = ANY($1::text[])`, [
        staleRefs,
      ]);
    }
    if (res.rows.length >= MERGE_PAGE_LIMIT) {
      console.error(
        `[mail_custody] overlay merge page full at ${MERGE_PAGE_LIMIT} rows; remainder waits for the next boot or bake`,
      );
    }
    if (res.rows.length > 0) {
      console.log(
        `mail custody overlay: ${counts.replayed} parcels replayed, ${counts.present} already in the book, ${counts.refused} refused, ${counts.stale} stale rows cleaned`,
      );
    }
  } catch (err) {
    console.error('[mail_custody] overlay merge failed (parcels replay on a later boot):', err);
  }
  lastMergeCounts = counts;
  return counts;
}

/** Test-only: the module-level bake set survives across cases otherwise. */
export function resetCustodyParcelOverlayForTests(): void {
  pendingBake.clear();
}
