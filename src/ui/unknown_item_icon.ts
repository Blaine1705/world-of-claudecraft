// The item-icon fallback for an id this bundle cannot resolve (stale-client
// guard, R34: a client one deploy behind the server keeps rendering, never
// throws). Server-truth surfaces (trade offers, bag and bank contents, loot
// rolls) receive item ids minted by whatever content the SERVER runs, so every
// future item addition reaches old bundles as an id with no ItemDef. The icon
// itself never needs the def: iconDataUrl resolves an unknown item id to the
// procedural fallback recipe (UNKNOWN_RECIPE in icons.ts), so this helper only
// exists to keep call sites from dereferencing the missing def on the way there.
//
// The markup is byte-identical to the shared itemIcon painter (hud.ts) minus
// the def-derived quality class, so a fallback cell styles exactly like a real
// one. `quality` accepts a plain string because its one non-default source is
// the wire (a loot-roll event's server-sent quality), which a stale bundle
// must render even for a rung it has never heard of; an unranked class simply
// takes the default styling.
import { iconDataUrl } from './icons';

/** The `<img>` for an item id with no local ItemDef: the procedural fallback
 *  icon, quality-classed, never a throw. */
export function unknownItemIconHtml(itemId: string, quality: string = 'common'): string {
  return `<img class="item-icon q-${quality}" src="${iconDataUrl('item', itemId)}" alt="" draggable="false">`;
}
