import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The COMPOSED portrait (the player's own face, src/render/characters/portrait.ts
// modularPortraitDataUrl) is captured off the frame that asks for it, so both of
// its consumers paint a fallback first and have to repaint once the capture
// lands. Neither can recognize its own update from (visualKey, skin): a composed
// key carries the look SIGNATURE and its visual key is `player_<cls>_modular`,
// which is why onPortraitUpdate hands the cache key to its listeners as a third
// argument. A source scan, because the wiring is one branch inside two
// coordinators that no unit test can construct without the whole HUD and a real
// WebGL rig; the capture behavior it rides on is covered behaviorally in
// portrait_live_capture.test.ts.

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const hud = read('../src/ui/hud.ts');
const charWindow = read('../src/ui/char_window.ts');
const chip = read('../src/ui/portrait_chip.ts');

describe('a landed composed portrait reaches its consumers', () => {
  it('repaints the player frame, the one frame that is ever composed', () => {
    const handler = hud.slice(hud.indexOf('onPortraitUpdate((visualKey, skin, key) => {'));
    const composedAt = handler.indexOf('isComposedPortraitKey(key)');
    const mechAt = handler.indexOf("visualKey === 'player_mech'");
    expect(composedAt).toBeGreaterThan(-1);
    // Ahead of the (class, skin) matching that follows: no class name and no
    // skin index describes a composed body, so that matching would drop it.
    expect(composedAt).toBeLessThan(mechAt);
    expect(handler.slice(composedAt, mechAt)).toContain('this.drawPlayerFramePortrait();');
  });

  it('rebuilds the character sheet, whose composed title chip is HTML, not a src', () => {
    expect(charWindow).toContain('this.watchComposedPortrait();');
    const watch = charWindow.slice(charWindow.indexOf('private watchComposedPortrait(): void {'));
    expect(watch).toContain('onPortraitUpdate(');
    expect(watch.slice(0, 240)).toContain('if (isComposedPortraitKey(key)) this.renderIfOpen();');
  });

  it('leaves composed chips to their builder: hydratePortraits must not swap their src', () => {
    // The reason the sheet rebuilds rather than hydrating: a look does not fit
    // in the chip's data attributes, so hydration would repaint the LEGACY
    // class portrait over the composed one.
    const hydrate = chip.slice(chip.indexOf('export function hydratePortraits('));
    expect(hydrate).toContain('if (chip.dataset.portraitComposed) return;');
  });
});
