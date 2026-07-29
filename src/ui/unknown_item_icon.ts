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
// takes the default styling. Both interpolations are esc()'d per the repo's
// unconditional HTML-interpolation rule: today's values cannot carry a quote
// (the quality is a sim union member and iconDataUrl emits only manifest URLs
// for bundle-known ids or base64 data URLs), but this helper is exactly where
// a future caller would hand a wider wire string.
import { esc } from './esc';
import { iconDataUrl } from './icons';

// The src of last resort: a transparent pixel, for a host with no working 2d
// canvas (the procedural fallback icon is canvas-composited). The quality
// frame and count badge still render, so the cell stays visible; only the
// icon art goes blank. Real browsers always have a canvas; this is what keeps
// the "never a throw" contract true even where they do not (jsdom, a context
// lost to memory pressure).
const BLANK_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** The `<img>` for an item id with no local ItemDef: the procedural fallback
 *  icon, quality-classed, never a throw. */
export function unknownItemIconHtml(itemId: string, quality: string = 'common'): string {
  let src = BLANK_PIXEL;
  try {
    src = iconDataUrl('item', itemId);
  } catch {
    // canvas-less host: keep the blank pixel
  }
  return `<img class="item-icon q-${esc(quality)}" src="${esc(src)}" alt="" draggable="false">`;
}
