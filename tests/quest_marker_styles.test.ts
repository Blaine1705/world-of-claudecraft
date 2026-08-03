// The repeatable-marker style contract across surfaces (phase 23): the four
// surfaces render ONE marker, so the rare blue and the cooldown dim must
// agree everywhere they are stated. The canvas surfaces read the two
// tokens.css declarations; the nameplate and the HUD tag classes carry the
// same values as hud.css literals; and the two painters dim at the same
// alpha their CSS siblings use. Deleting any of these blocks previously
// reddened nothing (css_corpus is section-level), which is exactly how a
// surface silently falls out of agreement.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const hudCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const minimapPainter = stripComments(
  readFileSync(new URL('../src/ui/minimap_painter.ts', import.meta.url), 'utf8'),
);
const mapPainter = stripComments(
  readFileSync(new URL('../src/ui/map_window_painter.ts', import.meta.url), 'utf8'),
);

// The one blue and the one dim, stated here as the cross-surface contract.
const RARE_BLUE = '#0070dd';
const COOLDOWN_ALPHA = '0.55';

describe('quest marker style agreement across surfaces', () => {
  it('declares both repeat tokens at the rare-item blue', () => {
    expect(tokensCss).toMatch(new RegExp(`--color-map-npc-quest-repeat:\\s*${RARE_BLUE};`));
    expect(tokensCss).toMatch(new RegExp(`--color-minimap-npc-quest-repeat:\\s*${RARE_BLUE};`));
  });

  it('styles the nameplate repeat and cooldown marks in the same blue', () => {
    expect(hudCss).toMatch(
      new RegExp(`\\.np-marker\\.repeat\\s*\\{[^}]*color:\\s*${RARE_BLUE}`, 's'),
    );
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

  it('styles the gossip and tooltip tag classes in the same blue and dim', () => {
    expect(hudCss).toMatch(new RegExp(`\\.quest-repeat\\s*\\{[^}]*color:\\s*${RARE_BLUE}`, 's'));
    expect(hudCss).toMatch(new RegExp(`\\.quest-cooldown\\s*\\{[^}]*color:\\s*${RARE_BLUE}`, 's'));
    expect(hudCss).toMatch(
      new RegExp(
        `\\.quest-cooldown\\s*\\{[^}]*opacity:\\s*${COOLDOWN_ALPHA.replace('.', '\\.')}`,
        's',
      ),
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
