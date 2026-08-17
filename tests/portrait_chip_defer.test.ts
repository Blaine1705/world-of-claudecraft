import { describe, expect, it, vi } from 'vitest';

const portraitUrl = `data:image/png;base64,${'A'.repeat(20_000)}`;
const mechUrl = `data:image/png;base64,MECH${'B'.repeat(20_000)}`;

vi.mock('../src/render/characters/portrait', () => ({
  onPortraitsReady: () => undefined,
  onPortraitUpdate: () => undefined,
  playerPortraitDataUrl: () => portraitUrl,
  visualPortraitDataUrl: (key: string) => (key === 'player_mech' ? mechUrl : portraitUrl),
  modularPortraitDataUrl: () => portraitUrl,
  portraitsReady: () => true,
}));
vi.mock('../src/ui/i18n', () => ({ t: () => 'Mage portrait' }));
vi.mock('../src/ui/icons', () => ({ iconDataUrl: () => 'data:image/png;base64,crest' }));

import { portraitChipHtml } from '../src/ui/portrait_chip';

describe('portrait chip deferred source', () => {
  it('keeps the normal one-off chip behavior', () => {
    const html = portraitChipHtml({ cls: 'mage', name: 'Mage' });
    expect(html).toContain(portraitUrl);
    expect(html).not.toContain('data-portrait-pending');
    const portraitTag = html.match(/<img class="portrait-img"[^>]+>/)?.[0] ?? '';
    expect(portraitTag).not.toContain('data-crest-fallback');
  });

  it('omits a large cached data URL from dense repeated markup', () => {
    const html = portraitChipHtml({
      cls: 'mage',
      name: 'Mage',
      badge: false,
      deferSource: true,
    });
    expect(html).not.toContain(portraitUrl);
    expect(html).not.toContain('base64');
    expect(html).toContain('data-portrait-pending="1"');
    expect(html).toContain('decoding="async"');
  });

  it('marks the deferred chip for the crest fallback, so it is never an empty box', () => {
    // deferSource ships no src at all: without the marker a hydration that
    // never lands (the portrait is still capturing, or the pass is missed)
    // leaves the ring blank forever. hydrateCrestImageFallbacks paints the
    // crest into it after mount, still with no data URL in the markup.
    const html = portraitChipHtml({
      cls: 'mage',
      name: 'Mage',
      badge: false,
      deferSource: true,
    });
    const portraitTag = html.match(/<img class="portrait-img"[^>]+>/)?.[0] ?? '';
    expect(portraitTag).toContain('data-crest-fallback-id="class_mage"');
    expect(portraitTag).toContain('data-crest-fallback-size="96"');
    expect(portraitTag).not.toContain('src=');
    expect(html).not.toContain('base64');
  });

  it('draws the mech body for a mech-catalog chip, ignoring any look', () => {
    const html = portraitChipHtml({
      cls: 'mage',
      name: 'Mage',
      skin: 3,
      catalog: 'mech',
      // a composed look must not win over the worn mech
      look: {} as never,
    });
    expect(html).toContain(mechUrl);
    expect(html).toContain('data-catalog="mech"');
  });
});
