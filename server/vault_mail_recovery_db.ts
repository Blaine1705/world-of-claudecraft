// Read one vault letter's durable source after an uncertain character+mail
// save. A live emptied letter is never proof that its character grant landed.

import type { VaultMailRecoveryLetter } from '../src/sim/mail/post_office';
import type { MailSave } from '../src/sim/sim';
import { mailRecipientKey } from './mail_partition_backfill';
import type { VaultRewardPool } from './vault_rewards_db';

export async function loadVaultMailRecovery(
  pool: Pick<VaultRewardPool, 'query'>,
  realm: string,
  characterId: number,
  custodyRef: string,
): Promise<VaultMailRecoveryLetter | null> {
  if (!Number.isSafeInteger(characterId) || characterId <= 0 || !custodyRef.startsWith('vault:'))
    throw new Error('invalid vault mail recovery reference');
  const recipientKey = String(characterId);
  const partition = await pool.query('SELECT data FROM world_state WHERE key = $1', [
    mailRecipientKey(realm, recipientKey),
  ]);
  const data = partition.rows[0]?.data as Partial<MailSave> | undefined;
  const saved = data?.mail?.find(
    (letter) =>
      letter.recipientKey === recipientKey &&
      letter.letterId === 'hoard_vault_reward' &&
      letter.custodyRef === custodyRef,
  );
  // A persisted empty letter proves the take committed. An older custody
  // overlay must never resurrect its already-collected attachments.
  if (saved && saved.copper <= 0 && saved.items.length === 0) return null;
  if (saved) {
    return {
      recipientName: saved.recipientName,
      copper: saved.copper,
      items: saved.items,
      read: saved.read,
      vaultRewardCredited: saved.vaultRewardCredited,
    };
  }
  const overlay = await pool.query(
    `SELECT recipient_name, items, copper FROM mail_custody_parcels
     WHERE realm = $1 AND recipient_key = $2 AND custody_ref = $3`,
    [realm, recipientKey, custodyRef],
  );
  if (overlay.rowCount !== 1) return null;
  const row = overlay.rows[0];
  return {
    recipientName: String(row.recipient_name),
    copper: Number(row.copper),
    items: row.items as VaultMailRecoveryLetter['items'],
    read: false,
  };
}
