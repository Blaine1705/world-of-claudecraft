import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../src/styles/hud.mobile.css', import.meta.url), 'utf8');
const componentsCss = readFileSync(
  new URL('../src/styles/components.css', import.meta.url),
  'utf8',
);

describe('aura overlay placement styles', () => {
  it('keeps normalized positions viewport-relative on mobile', () => {
    expect(mobileCss).not.toMatch(
      /body\.mobile-touch\s+\.aura-overlay-frame\s*\{[^}]*\b(?:width|height)\s*:/s,
    );
  });

  it('protects touch dragging and renders the four-arrow move glyph', () => {
    expect(hudCss).toMatch(
      /#aura-overlays\.placement[\s\S]*?\.aura-overlay-arcs-shell\s*\{[^}]*touch-action:\s*none/s,
    );
    expect(hudCss).toMatch(/\.aura-overlay-move-handle\s*\{[^}]*touch-action:\s*none[^}]*\}/s);
    expect(hudCss).toContain(
      "d='M12%202l4%204h-3v5h5V8l4%204-4%204v-3h-5v5h3l-4%204-4-4h3v-5H6v3l-4-4%204-4v3h5V6H8l4-4z'",
    );
  });

  it('keeps every available aura translucent and mouse-selectable during placement', () => {
    expect(hudCss).toMatch(
      /#aura-overlays\.placement\s+\.aura-overlay-frame\.placement-preview\s*\{[^}]*opacity:\s*0\.28/s,
    );
    expect(hudCss).toMatch(
      /\.placement-preview\s+\.aura-overlay-icon[\s\S]*pointer-events:\s*auto/s,
    );
    expect(hudCss).toMatch(
      /\.placement-preview\s+\.aura-overlay-arc[\s\S]*pointer-events:\s*auto/s,
    );
  });

  it('keeps the reposition toolbar background around wrapped controls and its select readable', () => {
    expect(componentsCss).toMatch(
      /\.aura-placement-toolbar\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*max-content[^}]*flex-wrap:\s*wrap/s,
    );
    expect(componentsCss).toMatch(
      /\.aura-placement-select\s+option\s*\{[^}]*background:\s*var\(--color-bg-dark\)[^}]*color:\s*var\(--color-text-light\)/s,
    );
  });
});
