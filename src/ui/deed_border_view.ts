// The Book of Deeds BORDER channel: the one place that turns a deed id into a
// cosmetic frame accent, shared by the overhead nameplate (canvas shapes) and the
// unit-frame portrait ring (CSS custom properties). Pure and host-agnostic: no
// DOM, no i18n, no render/game/net import, so a Vitest drives it directly and both
// consumers resolve the SAME palette from the SAME table.
//
// Two separate lookups, deliberately: a client can hold a deed id whose content
// record was removed (saves persist ids forever), and a border deed can exist
// whose slug has no palette yet. deedBorderSlug resolves id -> slug through the
// live DEEDS catalog and borderAccent resolves slug -> colors, each returning the
// empty/null "no accent" answer rather than guessing, so a stale or drifted id
// renders exactly like a borderless player.
//
// The accent is COSMETIC IDENTITY, never actionable information: it carries no
// health, range, rank, or threat meaning, so no surface may substitute it for a
// value the player reacts to.
//
// On the nameplate the slug is resolved on the same cadenced resolveContent
// pass as the name and the title, whose interval is TIER-SCALED (the 1/24s to
// 1/15s plate staleness floor). That is the sanctioned envelope every plate
// field shares, not a per-field gate: a border never resolves later than the
// name beside it, so two players on different presets read the same plate.

import { DEEDS } from '../sim/content/deeds';

/** Per-slug side-motif discriminant. Shared hardware (well, brackets, clasp)
 *  stays the same; only these four shape sets change with the worn slug. */
export type BorderMotifKind = 'catalogue' | 'vault' | 'ward' | 'laurel';

/** The colors one border slug paints with. Consumed as canvas stroke colors by
 *  the nameplate and as CSS custom properties by the portrait ring, so both
 *  surfaces of one identity always agree:
 *  - `frame`: the bright primary line, the color the slug reads as at distance.
 *  - `edge`: the dark contour under/inside the frame line that keeps it legible
 *    against a bright sky or a pale portrait.
 *  - `glow`: the light highlight tint (an inner hairline on the canvas, the
 *    outer bloom on the ring).
 *  - `motif`: which side-primitive set the cartouche core dispatches. */
export interface BorderAccent {
  readonly frame: string;
  readonly edge: string;
  readonly glow: string;
  readonly motif: BorderMotifKind;
}

// CSS-facing chassis numbers. The cartouche core re-exports them under the
// NAMEPLATE_CARTOUCHE_* names Phase 1 locked, and the inspect / ring painters
// write them as custom properties so hud.css and shell.css never restate the
// hex or the pad/radius px. UI cannot import render, so the literals live here.
export const CARTOUCHE_CHROME_PAD_X = 9;
export const CARTOUCHE_CHROME_PAD_Y = 5;
export const CARTOUCHE_CHROME_RADIUS = 6;
export const CARTOUCHE_CHROME_WELL_ALPHA = 0.4;
export const CARTOUCHE_CHROME_WELL_FILL = '#14110c';
export const CARTOUCHE_CHROME_CLASP_WIDTH = 10;
export const CARTOUCHE_CHROME_CLASP_HEIGHT = 5;
export const CARTOUCHE_PAD_X_PROP = '--cartouche-pad-x';
export const CARTOUCHE_PAD_Y_PROP = '--cartouche-pad-y';
export const CARTOUCHE_RADIUS_PROP = '--cartouche-radius';
export const CARTOUCHE_WELL_ALPHA_PROP = '--cartouche-well-alpha';
export const CARTOUCHE_WELL_FILL_PROP = '--cartouche-well-fill';
export const CARTOUCHE_CLASP_WIDTH_PROP = '--cartouche-clasp-width';
export const CARTOUCHE_CLASP_HEIGHT_PROP = '--cartouche-clasp-height';

/** Style fragment the inspect header and any other cold surface writes next
 *  to the three accent properties. Values come from the named exports above,
 *  never from a restated hex or magic px in CSS. */
export function cartoucheChromeStyle(): string {
  return (
    `${CARTOUCHE_PAD_X_PROP}:${CARTOUCHE_CHROME_PAD_X}px;` +
    `${CARTOUCHE_PAD_Y_PROP}:${CARTOUCHE_CHROME_PAD_Y}px;` +
    `${CARTOUCHE_RADIUS_PROP}:${CARTOUCHE_CHROME_RADIUS}px;` +
    `${CARTOUCHE_WELL_ALPHA_PROP}:${CARTOUCHE_CHROME_WELL_ALPHA};` +
    `${CARTOUCHE_WELL_FILL_PROP}:${CARTOUCHE_CHROME_WELL_FILL};` +
    `${CARTOUCHE_CLASP_WIDTH_PROP}:${CARTOUCHE_CHROME_CLASP_WIDTH}px;` +
    `${CARTOUCHE_CLASP_HEIGHT_PROP}:${CARTOUCHE_CHROME_CLASP_HEIGHT}px`
  );
}

// THE palette table: the single source of truth for every border slug's colors
// and motif kind. Literal color strings, not CSS vars, because the canvas
// cannot read a custom property cheaply per plate per frame; the portrait
// ring receives these same literals through the painter instead of
// duplicating them in hud.css. Four deliberately distinct reads at nameplate
// distance: laurel green, deep teal, Catalogue antique brass, and Eternal
// Spoils gold. Every value here is unique repo-wide ON PURPOSE, and
// reliquary_gilt's pair carries a MECHANICAL nudge for it: the classic
// elite/quest gold (#f2c84b, plus #ffdf8a) already lives on the scanned
// accent path, so reusing those exact bytes would force the exact-once scan
// in tests/deed_border_accent.test.ts to carry a collision allowlist, and an
// allowlist is where a real duplicated accent could hide.
// Catalogue brass sits near #c9b17a / ink #2a2214 / cream #f3ead0 and must
// not collide with reliquary_gilt #f4ca43, elite/quest #f2c84b, or any other
// scanned hex (the cream glow is one step off #f3ead0, which already lives
// on the components sheet).
// Each record is Object.frozen, not merely `Readonly` (which is compile-time
// only): borderAccent hands the SAME record straight to a canvas strokeStyle and
// to CSS custom properties on both surfaces, so a stray runtime write to one
// field would silently repaint every plate and ring of that slug. Freezing makes
// such a write throw in strict mode instead.
const BORDER_ACCENTS: Readonly<Record<string, BorderAccent>> = Object.freeze({
  curators_gilt: Object.freeze({
    frame: '#c9b17a',
    edge: '#2a2214',
    glow: '#f3ebcf',
    motif: 'catalogue',
  }),
  deepward: Object.freeze({
    frame: '#4fb3c8',
    edge: '#123a4a',
    glow: '#8fe3f2',
    motif: 'ward',
  }),
  prestige_laurels: Object.freeze({
    frame: '#8fbf6a',
    edge: '#2f4a1e',
    glow: '#c6e79a',
    motif: 'laurel',
  }),
  reliquary_gilt: Object.freeze({
    frame: '#f4ca43',
    edge: '#6b4a12',
    glow: '#ffe28f',
    motif: 'vault',
  }),
});

/** Every slug the palette table covers, sorted. Derived from the table so the
 *  two can never disagree; the literal pin lives in the test. */
export const BORDER_ACCENT_SLUGS: readonly string[] = Object.keys(BORDER_ACCENTS).sort();

/**
 * The border slug for a deed id, or '' when there is no accent to draw:
 * null/undefined (borderless), an id the live catalog no longer has (content
 * drift against a persisted save), or a deed whose reward is a title.
 * Allocation-free (returns the stored slug), so a per-frame caller can call it
 * on the hot path.
 */
export function deedBorderSlug(deedId: string | null | undefined): string {
  if (!deedId) return '';
  // DEEDS is a plain object, so a bare index with a prototype key
  // ('__proto__', 'constructor') resolves truthy for a hostile or drifted id.
  const def = Object.hasOwn(DEEDS, deedId) ? DEEDS[deedId] : undefined;
  const reward = def?.reward;
  return reward?.kind === 'border' ? reward.slug : '';
}

/**
 * The palette for a border slug, or null for '' (no border) and for any slug the
 * table does not cover. Returns the stored record itself, never a fresh object,
 * so a per-frame consumer allocates nothing.
 */
export function borderAccent(slug: string): BorderAccent | null {
  if (!slug) return null;
  return Object.hasOwn(BORDER_ACCENTS, slug) ? BORDER_ACCENTS[slug] : null;
}
