// The display name of one COPY of an item, where a copy can be named for
// something its definition cannot know. Today that is the World PvP trophy skull
// (src/sim/pvp/world_pvp_spoils.ts): every copy carries the victim's name on
// `instance.signer` and reads "<name>'s Skull" in the loot window, the chat
// receipt link and the tooltip title. Every other copy is its definition's
// localized name, so a caller can swap `itemDisplayName(def)` for this wherever
// it holds the copy's payload and nothing else changes.
//
// Pure: no DOM; i18n only for the label.

import { isWorldPvpSkullCopy } from '../sim/pvp/world_pvp_spoils';
import type { ItemDef, ItemInstancePayload } from '../sim/types';
import { itemDisplayName } from './entity_i18n';
import { t } from './i18n';

/** The copy-specific name, or null when the copy reads as its definition. The
 *  name is the player's own (raw), slotted into a translated frame. */
export function itemCopyOwnName(def: ItemDef, instance?: ItemInstancePayload): string | null {
  if (isWorldPvpSkullCopy(def.id, instance)) {
    return t('hudChrome.worldPvp.skullName', { name: instance.signer });
  }
  return null;
}

/** The name to show for this copy: its own name when it has one, else the
 *  definition's localized name. */
export function itemCopyDisplayName(def: ItemDef, instance?: ItemInstancePayload): string {
  return itemCopyOwnName(def, instance) ?? itemDisplayName(def);
}
