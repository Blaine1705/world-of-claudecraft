// The minimap rim's widgets must not share a corner.
//
// WHY THIS EXISTS. The World Market coin shipped at `top: 4px; right: 4px` into
// a corner the day/night dial already held at `top: 6px; right: 6px`. Same
// stacking level, and the dial is later in the DOM, so it painted over the coin:
// a decorative, aria-hidden canvas burying an actionable control. Nothing caught
// it because the coin is `hidden` unless sale proceeds are actually waiting, so
// the two are almost never on screen together and no ordinary screenshot shows
// the overlap.
//
// The rim has exactly four corners and (today) four widgets, so the invariant is
// simply that the mapping is one-to-one. Both halves are enforced: every widget
// declares a corner, and no two declare the same one. The completeness half is
// the load-bearing one, since the failure mode is a FIFTH widget being added to
// a rim that looks like it still has room.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const playHtml = readFileSync(new URL('../play.html', import.meta.url), 'utf8');

/** The disc's own canvas fills it and takes no corner; everything else does. */
const NOT_A_RIM_WIDGET = new Set(['minimap']);

/** The rim widgets, and the corner each one owns. */
const RIM_WIDGETS = ['raid-lockout', 'mail-indicator', 'market-indicator', 'minimap-daynight'];

/** Ids of the elements inside #minimap-disc, in DOM order. */
function discChildren(html: string): string[] {
  const start = html.indexOf('<div id="minimap-disc">');
  expect(start, 'no #minimap-disc in the document').toBeGreaterThan(-1);
  const end = html.indexOf('</div>', html.indexOf('minimap-daynight', start));
  // Skip the opening tag itself, so the container is not read as its own child.
  const block = html.slice(html.indexOf('>', start) + 1, end);
  return [...block.matchAll(/<(?:button|canvas|div)\s+id="([\w-]+)"/g)].map((m) => m[1]);
}

/** The desktop rule block for `#id` (the first one; mobile overrides live in
 *  hud.mobile.css, which relocates these widgets off the disc entirely). */
function ruleFor(id: string): string {
  const at = hudCss.indexOf(`  #${id} {`);
  expect(at, `no desktop rule for #${id}`).toBeGreaterThan(-1);
  return hudCss.slice(at, hudCss.indexOf('}', at));
}

/** Which corner a rule pins itself to, as "<vertical><horizontal>". */
function cornerOf(id: string): string {
  const rule = ruleFor(id);
  expect(rule, `#${id} is not absolutely positioned`).toMatch(/position:\s*absolute/);
  const has = (prop: string): boolean =>
    new RegExp(`\\n\\s*${prop}:\\s*(?!auto)`).test(rule) &&
    !new RegExp(`\\n\\s*${prop}:\\s*auto`).test(rule);
  const vertical = has('top') ? 'top' : has('bottom') ? 'bottom' : '';
  const horizontal = has('left') ? 'left' : has('right') ? 'right' : '';
  expect(vertical, `#${id} pins no vertical edge`).not.toBe('');
  expect(horizontal, `#${id} pins no horizontal edge`).not.toBe('');
  return `${vertical}-${horizontal}`;
}

describe('minimap rim layout', () => {
  it('registers every widget on the disc (a new one cannot land unclassified)', () => {
    for (const html of [indexHtml, playHtml]) {
      const unregistered = discChildren(html).filter(
        (id) => !NOT_A_RIM_WIDGET.has(id) && !RIM_WIDGETS.includes(id),
      );
      expect(
        unregistered,
        `new minimap rim widget(s) with no corner claim: ${unregistered.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('lists only widgets that are really on the disc, in both entry documents', () => {
    // The other direction, so the list cannot be padded with names that have
    // been removed and quietly stop guarding anything.
    for (const html of [indexHtml, playHtml]) {
      const present = new Set(discChildren(html));
      for (const id of RIM_WIDGETS) expect(present.has(id), `#${id} is not on the disc`).toBe(true);
    }
  });

  it('gives each widget its own corner', () => {
    const corners = new Map<string, string>();
    for (const id of RIM_WIDGETS) {
      const corner = cornerOf(id);
      const taken = corners.get(corner);
      expect(
        taken,
        `#${id} shares the ${corner} corner with #${taken} (they overlap: same z-index, later DOM wins)`,
      ).toBeUndefined();
      corners.set(corner, id);
    }
    expect(corners.size).toBe(RIM_WIDGETS.length);
  });

  it('keeps the actionable controls off the decorative dial in particular', () => {
    // The regression this file was written for, stated on its own so the failure
    // names it: the dial is aria-hidden decoration, the coin opens the market.
    expect(cornerOf('market-indicator')).not.toBe(cornerOf('minimap-daynight'));
  });
});
