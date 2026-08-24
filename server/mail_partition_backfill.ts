// Partitioned Ravenpost mail backfill.
//
// Mail has always been realm-scoped (`mail:<realm>`, one JSONB blob per
// realm), but that one blob grows without bound and the 30 s autosave
// re-serializes and re-writes the WHOLE thing every cycle regardless of what
// changed (issue #3561): on prod this was measured as the recurring
// event-loop stall behind #3555. This module PARTITIONS a realm's legacy
// `mail:<realm>` blob per recipient, once, inside ensureSchema's
// pg_advisory_xact_lock transaction, so autosave can persist only the
// recipients that actually changed (`Sim.takeDirtyMailPartitions`). The
// legacy row is RETAINED (never deleted) as the rollback artifact, mirroring
// server/market_backfill.ts.
//
// This is a *_db-style module: SQL runs against an INJECTED client (type-only
// usage of pg shapes), and it never imports db.ts, mirroring
// market_backfill.ts/ratelimit_db.ts, so db.ts can import the constants and
// the runner without a cycle.
import type { MailSave } from '../src/sim/sim';

// FROZEN CONTRACT: every exported name and signature in this file is shared
// between db.ts, the backfill tests, and the isolation tests. Keep the names
// and shapes exactly as written.

export const MAIL_RECIPIENT_KEY_INFIX = ':r:';
export const MAIL_PARTITION_MARKER_PREFIX = 'mail_partition_done:';

// The Ravenpost mail book: realm-scoped, one JSONB blob per realm under
// `mail:<realm>` (this is the LEGACY whole-book key: the backfill's read
// source and the retained rollback artifact). Canonical home for this
// builder, like marketStateKey lives in market_backfill.ts; db.ts imports and
// re-exports it so its pre-existing consumers keep importing from ./db
// unchanged.
export function mailStateKey(realm: string): string {
  return `mail:${realm}`;
}

// The partitioned per-recipient key: `mail:<realm>:r:<encoded recipientKey>`.
// recipientKey is URI-encoded because it is not always numeric (a returned
// parcel's homeKey can fall back to a display name, see post_office.ts), so it
// could in principle carry a character this key format's own delimiters use.
export function mailRecipientKey(realm: string, recipientKey: string): string {
  return `mail:${realm}${MAIL_RECIPIENT_KEY_INFIX}${encodeURIComponent(recipientKey)}`;
}

export function mailPartitionMarkerKey(realm: string): string {
  return `${MAIL_PARTITION_MARKER_PREFIX}${realm}`;
}

// Minimal query surface of a pg PoolClient inside the ensureSchema
// transaction; tests fake this with a plain object.
export interface MailBackfillClient {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

export interface MailBackfillResult {
  // true when this call performed the partition work; false when the marker
  // row already existed and the call was a no-op.
  ran: boolean;
  legacyRowFound: boolean;
  recipientCount: number;
  letterCount: number;
}

// The exact saveWorldState upsert (server/db.ts). Kept as a literal here so
// the backfill never imports db.ts; the pinning test asserts the shared
// fragment (same discipline as market_backfill.ts's WORLD_STATE_UPSERT_SQL).
const WORLD_STATE_UPSERT_SQL = `INSERT INTO world_state (key, data, updated_at) VALUES ($1, $2, now())
ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;

async function upsertWorldState(
  client: MailBackfillClient,
  key: string,
  data: unknown,
): Promise<void> {
  await client.query(WORLD_STATE_UPSERT_SQL, [key, JSON.stringify(data)]);
}

// Split a realm's legacy mail array by recipientKey. Letters with a
// non-string recipientKey (a corrupt row) are dropped, the same tolerance
// PostOffice.loadMail already applies on the legacy whole-blob path.
export function partitionMailByRecipient(mail: MailSave['mail']): Map<string, MailSave['mail']> {
  const byRecipient = new Map<string, MailSave['mail']>();
  for (const m of mail ?? []) {
    if (!m || typeof m.recipientKey !== 'string') continue;
    const bucket = byRecipient.get(m.recipientKey);
    if (bucket) bucket.push(m);
    else byRecipient.set(m.recipientKey, [m]);
  }
  return byRecipient;
}

// Run once per realm, inside ensureSchema's advisory-lock transaction:
// 1. If this realm's marker row exists: return { ran: false } issuing no
//    other SQL.
// 2. SELECT the realm's legacy `mail:<realm>` row FOR UPDATE (serializes
//    against a not-yet-upgraded process racing the same realm's autosave).
// 3. Partition by recipientKey (no cross-realm resolution needed: the source
//    blob is already this realm's data, unlike the market's pre-scoping
//    global row), write each partition to `mailRecipientKey(realm, k)`,
//    then INSERT the per-realm marker row with
//    { legacyRowFound, recipientCount, letterCount }. The legacy row is
//    NEVER deleted or modified.
export async function runMailPartitionBackfill(opts: {
  client: MailBackfillClient;
  realm: string;
  log?: (line: string) => void;
}): Promise<MailBackfillResult> {
  const { client, realm } = opts;
  const log = opts.log ?? ((line: string) => console.log(line));
  const markerKey = mailPartitionMarkerKey(realm);

  // 1. Marker already present: this migration ran on an earlier boot for this
  // realm. No-op, issuing no other SQL.
  const markerRes = await client.query('SELECT data FROM world_state WHERE key = $1', [markerKey]);
  if (markerRes.rows.length > 0) {
    return { ran: false, legacyRowFound: false, recipientCount: 0, letterCount: 0 };
  }

  // 2. Claim this realm's legacy row FOR UPDATE. The row lock serializes
  // against a racing autosave on an older binary still writing the whole
  // blob.
  const legacyKey = mailStateKey(realm);
  const legacyRes = await client.query('SELECT data FROM world_state WHERE key = $1 FOR UPDATE', [
    legacyKey,
  ]);
  const legacyRow = legacyRes.rows[0];
  if (!legacyRow) {
    // Nothing to partition (a fresh realm, or mail predates any letter ever
    // being sent). Record the marker so a later legacy row can never be
    // re-adopted after this migration has been declared complete.
    await upsertWorldState(client, markerKey, {
      legacyRowFound: false,
      recipientCount: 0,
      letterCount: 0,
    });
    return { ran: true, legacyRowFound: false, recipientCount: 0, letterCount: 0 };
  }

  const legacy = legacyRow.data as MailSave;
  const byRecipient = partitionMailByRecipient(legacy.mail ?? []);

  // 3. Write each partition, then record the completion marker. The legacy
  // row is left untouched.
  for (const [recipientKey, letters] of byRecipient) {
    await upsertWorldState(client, mailRecipientKey(realm, recipientKey), { mail: letters });
  }
  const letterCount = (legacy.mail ?? []).length;
  await upsertWorldState(client, markerKey, {
    legacyRowFound: true,
    recipientCount: byRecipient.size,
    letterCount,
  });
  log(
    `mail partition backfill: realm ${realm} partitioned ${letterCount} letter(s) into ${byRecipient.size} recipient row(s)`,
  );
  return { ran: true, legacyRowFound: true, recipientCount: byRecipient.size, letterCount };
}
