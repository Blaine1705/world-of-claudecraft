import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Mobile-controller chrome exclusivity: once a connected pad also takes the
// cross-hotbar band, .xhb-mode stands the touch movement/camera/action-ring
// chrome down and leaves the XHB as the one hotbar. These assertions pin both
// halves: the shared main.ts syncPadChrome wiring that keeps .xhb-mode
// truthful, and the CSS rule that actually hides the touch gameplay chrome.

const mainTs = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const hudMobileCss = readFileSync(
  new URL('../src/styles/hud.mobile.css', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

function ruleBody(selector: string): string {
  return hudMobileCss.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('main.ts wires syncPadChrome to every pad connection-state change', () => {
  it('keeps the shared pad chrome callback scoped to the cross-hotbar mode sync', () => {
    const block = mainTs.match(/const syncPadChrome = \(\) => \{([\s\S]*?)\n\s*\};/)?.[1] ?? '';
    expect(block, 'syncPadChrome callback body not found').toBeTruthy();
    expect(block).toContain('crossHotbar.syncPadMode(gamepad)');
    expect(block).not.toMatch(/applyPadConnectedClass|pad-connected/);
  });

  it('calls it from GamepadManager.onConnectionChange', () => {
    expect(mainTs).toContain('onConnectionChange: syncPadChrome,');
  });

  it('calls it from the gamepadEnabled setting applier too (start/stop is synchronous, no event fires)', () => {
    expect(mainTs).toContain('createGamepadSettingApplier(gamepad, settings, syncPadChrome)');
  });
});

describe('body.mobile-touch.xhb-mode stands down the touch gameplay-input chrome', () => {
  const selector =
    'body\\.mobile-touch\\.xhb-mode #mobile-move-zone,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.xhb-mode #mobile-move-joystick,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.xhb-mode #mobile-camera-joystick,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.xhb-mode #mobile-action-ring';

  it('hides exactly the movement/camera/action-ring surfaces the pad replaces', () => {
    const body = ruleBody(selector);
    expect(body, 'the four-selector xhb-mode rule was not found as expected').toBeTruthy();
    expect(body.trim()).toBe('display: none;');
  });

  it('does NOT touch the menu-access chrome (Quick Actions seat / mobile-combat-controls)', () => {
    expect(hudMobileCss).not.toMatch(/\.xhb-mode[^{]*#mobile-combat-controls/);
    expect(hudMobileCss).not.toMatch(/\.xhb-mode[^{]*#mobile-menu-anchor/);
  });

  it('is no longer keyed off a separate pad-connected class', () => {
    expect(mainTs).not.toMatch(/applyPadConnectedClass|pad-connected|mobile_pad_chrome/);
    expect(hudMobileCss).not.toMatch(/pad-connected/);
  });

  it('stays inside @layer hud-mobile (css_layer_containment.test.ts pins the whole file)', () => {
    // Cheap local sanity check, not a re-implementation of the full layer walk:
    // the rule text must appear after the file's one @layer hud-mobile opener.
    const layerOpenAt = hudMobileCss.indexOf('@layer hud-mobile {');
    const ruleAt = hudMobileCss.indexOf('body.mobile-touch.xhb-mode #mobile-move-zone');
    expect(layerOpenAt).toBeGreaterThanOrEqual(0);
    expect(ruleAt).toBeGreaterThan(layerOpenAt);
  });
});
