// Purge the bot-addressed Ravenpost welcome letters from the shared mail book
// (issue #3560). Vale Cup showcase/backfill bots (plus fiesta and /dev bots)
// were created through the normal addPlayer path, so every bot got the one-time
// ravenpost_welcome letter addressed to its transient pid; the bot was reaped
// at match end but the letter persisted forever. By 2026-08-22 the prod book
// held 151,548 letters, 134,431 of them bot welcomes (85MB of the 89MB row),
// and the 30 second autosave serialized all of it on the main thread.
//
// The send-side fix (addPlayer's `bot` option) stops new bot letters. This
// migration removes the accumulated ones: a ravenpost_welcome letter is kept
// only when its recipient resolves to a real character, meaning either
//   - recipientKey is the character id AND recipientName is that character's
//     current name (renames rekey both through rekeyMailOwner, so a live
//     character's pair always matches), or
//   - recipientKey equals a character's name (the legacy name-keyed letters
//     from before the stable-id key existed).
// A bot letter can never satisfy either arm: its key is a transient pid that
// at best collides with some character's id while carrying a bot roster name.
// Like the old-cragmaw migration (and unlike the rift forge rollback), the
// matching condition cannot legitimately reappear once the send-side fix is
// deployed, so re-running is safe; no completion marker is needed.
//
// Run with no flags for an all-realm dry run; --realm NAME scopes it. --apply
// writes, and belongs in the deploy window while the game server is stopped:
// the server re-persists its in-memory book every 30 seconds, so a purge
// applied under a live server would be clobbered on the next autosave. The
// apply path refuses while any character lease is still held for the realm.

import { Pool } from 'pg';

export const WELCOME_LETTER_ID = 'ravenpost_welcome';
const MAIL_KEY_PREFIX = 'mail:';

interface Options {
  apply: boolean;
  realm?: string;
}

export interface MailLetterLike {
  letterId?: unknown;
  recipientKey?: unknown;
  recipientName?: unknown;
  [key: string]: unknown;
}

export interface MailBookLike {
  mail?: unknown;
  [key: string]: unknown;
}

export interface CharacterRow {
  id: number;
  name: string;
}

export interface PurgeResult {
  changed: boolean;
  value: MailBookLike;
  kept: number;
  removed: number;
}

/** Whether this letter survives the purge (see the header for the contract). */
export function keepsLetter(
  letter: MailLetterLike,
  byId: ReadonlyMap<string, string>,
  names: ReadonlySet<string>,
): boolean {
  if (letter.letterId !== WELCOME_LETTER_ID) return true;
  const key = typeof letter.recipientKey === 'string' ? letter.recipientKey : '';
  const name = typeof letter.recipientName === 'string' ? letter.recipientName : '';
  if (byId.get(key) === name) return true;
  return names.has(key);
}

export function purgeBotWelcomeLetters(
  book: MailBookLike,
  characters: readonly CharacterRow[],
): PurgeResult {
  const mail = Array.isArray(book.mail) ? (book.mail as MailLetterLike[]) : null;
  if (!mail) return { changed: false, value: book, kept: 0, removed: 0 };

  const byId = new Map<string, string>();
  const names = new Set<string>();
  for (const c of characters) {
    byId.set(String(c.id), c.name);
    names.add(c.name);
  }

  const kept = mail.filter((letter) => keepsLetter(letter, byId, names));
  if (kept.length === mail.length) {
    return { changed: false, value: book, kept: kept.length, removed: 0 };
  }
  return {
    changed: true,
    value: { ...book, mail: kept },
    kept: kept.length,
    removed: mail.length - kept.length,
  };
}

function parseArgs(argv: readonly string[]): Options {
  let realm: string | undefined;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--realm') {
      realm = argv[i + 1]?.trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--realm=')) {
      realm = arg.slice('--realm='.length).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { apply, realm: realm || undefined };
}

export async function runMailBotWelcomePurgeMigration(argv: readonly string[]): Promise<void> {
  try {
    process.loadEnvFile?.();
  } catch {
    // .env is optional; production injects DATABASE_URL through Docker Compose.
  }

  const { apply, realm } = parseArgs(argv);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  let committed = false;
  const report: string[] = [];

  try {
    await pool.query('BEGIN');

    const mailRows = await pool.query<{ key: string; data: MailBookLike }>(
      realm
        ? 'SELECT key, data FROM world_state WHERE key = $1 ORDER BY key ASC'
        : "SELECT key, data FROM world_state WHERE key LIKE 'mail:%' ORDER BY key ASC",
      realm ? [MAIL_KEY_PREFIX + realm] : [],
    );

    for (const row of mailRows.rows) {
      const rowRealm = row.key.slice(MAIL_KEY_PREFIX.length);

      if (apply) {
        // A live server re-persists its in-memory book every 30 seconds and
        // would clobber this purge; refuse while its character leases exist.
        const leases = await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM character_leases WHERE realm = $1',
          [rowRealm],
        );
        if (Number(leases.rows[0]?.count ?? 0) > 0) {
          throw new Error(
            `Realm "${rowRealm}" still holds character leases: stop its game server before --apply.`,
          );
        }
      }

      const characters = await pool.query<CharacterRow>(
        'SELECT id, name FROM characters WHERE realm = $1',
        [rowRealm],
      );

      const before = JSON.stringify(row.data).length;
      const result = purgeBotWelcomeLetters(row.data, characters.rows);
      const after = result.changed ? JSON.stringify(result.value).length : before;
      report.push(
        `${row.key}: kept=${result.kept} removed=${result.removed} bytes ${before} -> ${after}`,
      );
      if (!result.changed) continue;

      if (apply) {
        await pool.query('UPDATE world_state SET data = $1, updated_at = now() WHERE key = $2', [
          JSON.stringify(result.value),
          row.key,
        ]);
      }
    }

    if (apply) {
      await pool.query('COMMIT');
      committed = true;
    } else {
      await pool.query('ROLLBACK');
    }
  } catch (err) {
    if (!committed) {
      try {
        await pool.query('ROLLBACK');
      } catch {
        // Ignore rollback errors after a failed or already closed transaction.
      }
    }
    throw err;
  } finally {
    await pool.end();
  }

  const scope = realm ? `realm "${realm}"` : 'all realms';
  const mode = apply ? 'applied' : 'dry run';
  console.log(`Bot welcome letter purge (${scope}, ${mode}):`);
  for (const line of report) console.log(`  ${line}`);
  if (!apply) {
    console.log('Dry run only. Re-run with --apply (game server stopped) to write.');
  }
}
