// The repeatable-marker style contract across surfaces (phase 23): the four
// surfaces render ONE marker over two channels that must each agree
// everywhere they are stated. The GLYPH channel (nameplate marks, gossip
// '!', both canvas painters) carries the rare-blue anchor and the 0.55
// cooldown dim; the TEXT channel (the map tooltip's tag prose) lifts to an
// accessible blue at full opacity, because #0070dd reads 4.07:1 over the
// panel gradient (under the 4.5:1 AA floor for 13.5px text) and a 0.55 dim
// about 2:1. Deleting any of these blocks previously reddened nothing
// (css_corpus is section-level), which is exactly how a surface silently
// falls out of agreement.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUALITY_COLOR } from '../src/ui/icons';

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
// The CSS goes through the SAME comment strip as the painters: a pin a
// commented-out rule satisfies is not a pin (the mutation round proved the
// raw read green with the live .np-marker.repeat block commented out).
const tokensCss = stripComments(
  readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8'),
);
const hudCss = stripComments(
  readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8'),
);
const minimapPainter = stripComments(
  readFileSync(new URL('../src/ui/minimap_painter.ts', import.meta.url), 'utf8'),
);
const mapPainter = stripComments(
  readFileSync(new URL('../src/ui/map_window_painter.ts', import.meta.url), 'utf8'),
);
const baseCss = stripComments(
  readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8'),
);

// The one blue and the one dim, stated here as the cross-surface contract.
// The blue is DERIVED from its stated design anchor (the rare item quality
// color), so a rare-quality retune reddens every marker pin instead of
// silently detaching the markers from the classic anchor; the literal beside
// it pins the anchor itself against a drive-by edit.
const RARE_BLUE = QUALITY_COLOR.rare;
const COOLDOWN_ALPHA = '0.55';
// The TEXT channel's accessible blue (the same 211-degree hue lifted for
// prose) and the panel-bg gradient stops the tooltip composites over; the
// stops are pinned against tokens.css below so these literals cannot drift.
const TAG_TEXT_BLUE = '#3d9bff';
const PANEL_STOPS = ['#15151f', '#0b0b12'] as const;

// WCAG 2.2 relative-luminance contrast, so the accessible-blue pin is a
// working floor rather than a frozen hex: the hue may move as long as the
// tag text keeps AA against both panel stops.
const srgbLuminance = (hex: string): number => {
  const chan = (i: number) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(1) + 0.7152 * chan(3) + 0.0722 * chan(5);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [srgbLuminance(a), srgbLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('quest marker style agreement across surfaces', () => {
  it('anchors on the real rare-item blue', () => {
    expect(RARE_BLUE).toBe('#0070dd');
  });

  it('declares both repeat tokens at the rare-item blue', () => {
    expect(tokensCss).toMatch(new RegExp(`--color-map-npc-quest-repeat:\\s*${RARE_BLUE};`));
    expect(tokensCss).toMatch(new RegExp(`--color-minimap-npc-quest-repeat:\\s*${RARE_BLUE};`));
  });

  it('styles the nameplate repeat and cooldown marks in the same blue', () => {
    expect(hudCss).toMatch(
      new RegExp(`\\.np-marker\\.repeat\\s*\\{[^}]*color:\\s*${RARE_BLUE}`, 's'),
    );
    // The glow halo is the ninth statement of the blue (RARE_BLUE + alpha).
    expect(hudCss).toMatch(new RegExp(`\\.np-marker\\.repeat\\s*\\{[^}]*${RARE_BLUE}88`, 's'));
    expect(hudCss).toMatch(
      new RegExp(`\\.np-marker\\.cooldown\\s*\\{[^}]*color:\\s*${RARE_BLUE}`, 's'),
    );
    expect(hudCss).toMatch(
      new RegExp(
        `\\.np-marker\\.cooldown\\s*\\{[^}]*opacity:\\s*${COOLDOWN_ALPHA.replace('.', '\\.')}`,
        's',
      ),
    );
  });

  it('keeps the gossip glyph on the anchor blue and lifts BOTH tooltip tags to the text blue', () => {
    // Glyph channel: the gossip row's '!' span stays on the anchor.
    expect(hudCss).toMatch(new RegExp(`\\.quest-repeat\\s*\\{[^}]*color:\\s*${RARE_BLUE}`, 's'));
    // Text channel: one grouped rule states the accessible blue exactly once
    // for the cooldown tag and the tooltip-scoped repeat tag. The #tooltip
    // scope is a deliberate cascade override of the glyph rule above; both
    // sides are pinned here so the suite states the full cascade story.
    expect(hudCss).toMatch(
      new RegExp(
        `\\.quest-cooldown,\\s*#tooltip \\.quest-repeat\\s*\\{[^}]*color:\\s*${TAG_TEXT_BLUE}`,
        's',
      ),
    );
    // The old 0.55 dim on the cooldown TAG must not come back: dimmed prose
    // read about 2:1 over the panel. The dim belongs to the glyph channel.
    expect(hudCss).not.toMatch(/\.quest-cooldown[^}]*opacity/s);
  });

  it('keeps the tag text at WCAG AA and the glyphs above the component floor', () => {
    // The panel stops are literals here; pin them against the real
    // --panel-bg declaration so they cannot silently drift apart (the
    // gradient states them with the f2 alpha suffix).
    for (const stop of PANEL_STOPS) expect(tokensCss).toContain(`${stop}f2`);
    for (const stop of PANEL_STOPS) {
      // 13.5px tooltip prose needs 4.5:1 (WCAG 2.2 AA, normal text).
      expect(contrast(TAG_TEXT_BLUE, stop)).toBeGreaterThanOrEqual(4.5);
      // The glyph channel is a non-text component: 3:1 floor.
      expect(contrast(RARE_BLUE, stop)).toBeGreaterThanOrEqual(3);
    }
  });

  it('carries the repeat-vs-gold distinction through forced-colors on the nameplate', () => {
    // The forced palette strips color, so the DOM nameplate (the one surface
    // with neither canvas pixels nor a text tag) needs a redundant non-color
    // cue: underline for repeat, dotted for cooldown (the #tf-name.hostile
    // precedent). Pinned inside the forced-colors block specifically.
    const forcedStart = baseCss.indexOf('@media (forced-colors: active)');
    const forcedEnd = baseCss.indexOf('@media print');
    expect(forcedStart).toBeGreaterThan(-1);
    const forcedBlock = baseCss.slice(forcedStart, forcedEnd === -1 ? undefined : forcedEnd);
    expect(forcedBlock).toMatch(/\.np-marker\.repeat\s*\{[^}]*text-decoration:\s*underline;/s);
    expect(forcedBlock).toMatch(
      /\.np-marker\.cooldown\s*\{[^}]*text-decoration:\s*underline dotted;/s,
    );
  });

  it('dims both canvas painters at the CSS alpha', () => {
    // Comments are stripped above, so these match the live assignments, not
    // prose; the painters share the CSS value so all four surfaces dim
    // identically (each painter test pins the blit-time behavior itself).
    expect(minimapPainter).toContain(`NPC_GLYPH_COOLDOWN_ALPHA = ${COOLDOWN_ALPHA}`);
    expect(mapPainter).toContain(`NPC_GLYPH_COOLDOWN_ALPHA = ${COOLDOWN_ALPHA}`);
  });
});
