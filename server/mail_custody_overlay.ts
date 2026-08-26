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
CREATE INDEX IF NOT EXISTS mail_custody_parcels_realm ON mail_custody_parcels (realm);
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

/** Delete the snapshotted rows after their full-book write provably
 *  committed. Deliberately non-throwing: this runs AFTER the commit, so a
 *  failure here must not re-mark a committed save as failed. Rows linger,
 *  their refs stay pending (removed only on successful delete), and the
 *  next full-book write retries; a crash meanwhile replays them through the
 *  book-once dedupe. */
export async function deleteBakedCustodyRefs(refs: readonly string[]): Promise<void> {
  if (refs.length === 0) return;
  try {
    await pool.query(`DELETE FROM mail_custody_parcels WHERE custody_ref = ANY($1::text[])`, [
      [...refs],
    ]);
    for (const ref of refs) pendingBake.delete(ref);
  } catch (err) {
    console.error('[mail_custody] baked row delete failed (the next book write retries):', err);
  }
}

function isCustodyParcelLetter(value: unknown): value is CustodyParcelLetter {
  return value === 'delivery' || value === 'return' || value === 'sold_notice';
}

/** Boot merge: replay every surviving overlay row for this realm through the
 *  book-once parcel entry. A parcel already in the loaded blob dedupes on
 *  its custodyRef; one the crash window lost re-books. Every accounted ref
 *  joins pendingBake so the next full-book write cleans its row. A row that
 *  is refused AND absent (its items no longer validate, which a parcel that
 *  booked once should never hit) is kept in the table and reported, so the
 *  operator can attribute it instead of it silently vanishing. */
export async function mergeCustodyParcelOverlay(
  book: CustodyParcelBook,
): Promise<{ replayed: number; present: number; refused: number }> {
  const res = await pool.query(
    `SELECT custody_ref, recipient_key, recipient_name, letter, items
     FROM mail_custody_parcels WHERE realm = $1 ORDER BY created_at, custody_ref`,
    [REALM],
  );
  let replayed = 0;
  let present = 0;
  let refused = 0;
  for (const r of res.rows) {
    const ref = String(r.custody_ref);
    const letter: unknown = r.letter;
    if (!isCustodyParcelLetter(letter) || !Array.isArray(r.items)) {
      refused++;
      console.error(`[mail_custody] overlay row malformed for custodyRef ${ref}`);
      continue;
    }
    const recipient = { key: String(r.recipient_key), name: String(r.recipient_name) };
    if (book.mailSystemParcel(recipient, CUSTODY_PARCEL_LETTERS[letter], r.items, ref)) {
      replayed++;
    } else if (book.hasCustodyParcel(ref)) {
      present++;
    } else {
      refused++;
      console.error(`[mail_custody] overlay replay refused for custodyRef ${ref}`);
      continue;
    }
    pendingBake.add(ref);
  }
  if (replayed > 0 || refused > 0) {
    console.log(
      `mail custody overlay: ${replayed} parcels replayed, ${present} already in the book, ${refused} refused`,
    );
  }
  return { replayed, present, refused };
}

/** Test-only: the module-level bake set survives across cases otherwise. */
export function resetCustodyParcelOverlayForTests(): void {
  pendingBake.clear();
}
