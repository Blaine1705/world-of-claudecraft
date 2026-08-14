// Pure resolver for the World Market row's item-NAME color.
//
// The market paints readable name colors that clear WCAG AA against the dark
// panel. Two of the six shipped QUALITY_COLOR values fail that bar on the panel
// ground (rare #0070dd reads 3.87:1, epic #a335ee reads 3.82:1, both under the
// 4.5:1 text floor); the rest pass. Rather than change the shared QUALITY_COLOR
// map (icons.ts), which drives bags, bank, tooltips, loot and the wiki, this
// lifts ONLY the two failing hues and ONLY for the market name, leaving the icon
// border and every other surface on the shipped palette.
//
// Returns a CSS custom-property reference, never a raw hex, so no color literal
// lives in the painter (the market_window no-magic guard) and the values stay
// themeable in tokens.css. DOM-free and unit-tested in tests/market_name_color.ts.
import type { ItemDef } from '../sim/types';

// The quality union as the catalog declares it (no separate exported alias
// exists; it lives inline on ItemDef).
type ItemQuality = NonNullable<ItemDef['quality']>;

// Every quality maps to a market name-color token. The repaired rare/epic tokens
// carry the lifted values (tokens.css); the others alias the shipped palette so
// the market name matches the rest of the game for the passing qualities.
const MARKET_NAME_COLOR_VAR: Record<ItemQuality, string> = {
  poor: 'var(--mkt-name-poor)',
  common: 'var(--mkt-name-common)',
  uncommon: 'var(--mkt-name-uncommon)',
  rare: 'var(--mkt-name-rare)',
  epic: 'var(--mkt-name-epic)',
  legendary: 'var(--mkt-name-legendary)',
};

// Fallback for a listing whose item carries no quality field.
export const MARKET_NAME_DEFAULT_COLOR = 'var(--mkt-name-common)';

export function marketNameColor(quality: ItemQuality | undefined): string {
  return quality
    ? (MARKET_NAME_COLOR_VAR[quality] ?? MARKET_NAME_DEFAULT_COLOR)
    : MARKET_NAME_DEFAULT_COLOR;
}
