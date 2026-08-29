import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const desktopCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../src/styles/hud.mobile.css', import.meta.url), 'utf8');
const guideDesktopCss = desktopCss.slice(
  desktopCss.indexOf('.party-boss-guide-button'),
  desktopCss.indexOf('#party-frames.below-target'),
);
const guideMobileCss = mobileCss.slice(
  mobileCss.indexOf('body.mobile-touch .party-boss-guide-button'),
  mobileCss.indexOf('body.mobile-touch #buff-bar'),
);

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('raid boss guide styles', () => {
  it('gives the journal a bounded keyboard and pointer scroll region', () => {
    expect(rule(desktopCss, '#raid-boss-guide-window .rbg-shell')).toMatch(
      /height:\s*min\(70vh,\s*640px\)/,
    );
    const journal = rule(desktopCss, '#raid-boss-guide-window .rbg-journal');
    expect(journal).toMatch(/min-height:\s*0/);
    expect(journal).toMatch(/overflow-y:\s*auto/);
  });

  it('keeps a bounded scroll region in the mobile sheet', () => {
    const windowRule = rule(mobileCss, 'body.mobile-touch #raid-boss-guide-window');
    expect(windowRule).toMatch(/safe-area-inset-left/);
    expect(windowRule).toMatch(/safe-area-inset-right/);
    expect(windowRule).toMatch(/safe-area-inset-bottom/);
    expect(windowRule).toMatch(/transform:\s*none/);
    const shell = rule(mobileCss, 'body.mobile-touch #raid-boss-guide-window .rbg-shell');
    expect(shell).toMatch(/height:\s*calc\(/);
    expect(shell).toMatch(/safe-area-inset-bottom/);
    expect(
      rule(mobileCss, 'body.mobile-touch #raid-boss-guide-window .rbg-segmented button'),
    ).toMatch(/min-height:\s*40px/);
  });

  it('draws an explicit tokenized focus ring on every new guide control', () => {
    for (const selector of [
      '.party-boss-guide-button:focus-visible',
      '#raid-boss-guide-window .rbg-boss-tab:focus-visible',
      '#raid-boss-guide-window .rbg-segmented button:focus-visible',
      '#raid-boss-guide-window .rbg-model-load:focus-visible',
      '#raid-boss-guide-window .rbg-model-stage > canvas:focus-visible',
    ]) {
      expect(desktopCss).toContain(selector);
    }
    expect(desktopCss).toMatch(/outline:\s*2px solid var\(--color-border-focus\)/);
  });

  it('contains boss posters instead of cropping their silhouettes', () => {
    expect(rule(desktopCss, '#raid-boss-guide-window .rbg-boss-tab img')).toMatch(
      /object-fit:\s*contain/,
    );
    expect(rule(desktopCss, '#raid-boss-guide-window .rbg-model-poster')).toMatch(
      /object-fit:\s*contain/,
    );
  });

  it('keeps the raid guide palette in shared tokens', () => {
    expect(guideDesktopCss).not.toMatch(/#[\da-f]{3,8}|rgba?\(/i);
    expect(guideMobileCss).not.toMatch(/#[\da-f]{3,8}|rgba?\(/i);
  });
});
