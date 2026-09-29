// The display name of one COPY of an item, where a copy can be named for
// something its definition cannot know: a promoted legendary's player-chosen
// `instance.name` (raw, player-authored), or the World PvP trophy skull
// (src/sim/pvp/world_pvp_spoils.ts), whose copies carry the victim's name on
// `instance.signer` and read "<name>'s Skull". Every other copy is its
// definition's localized name, so a caller can swap `itemDisplayName(def)`
// for this wherever it holds the copy's payload. The item cell family
// (worn_item_cell_view.ts: bags, banks, mail, trade, market, vendor), the loot
// window, the chat receipt link and the tooltip title all read it.
//
// Pure: no DOM; i18n only for the label.

import { isWorldPvpSkullCopy } from '../sim/pvp/world_pvp_spoils';
import type { ItemDef, ItemInstancePayload } from '../sim/types';
import { itemDisplayName } from './entity_i18n';
import { t } from './i18n';

/** The copy-specific name, or null when the copy reads as its definition. A
 *  chosen legendary name wins; a trophy skull slots its victim's (raw) name
 *  into a translated frame. */
export function itemCopyOwnName(def: ItemDef, instance?: ItemInstancePayload): string | null {
  if (instance?.name !== undefined) return instance.name;
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
