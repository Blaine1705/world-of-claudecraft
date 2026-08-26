import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Mobile-controller chrome exclusivity: pairing a gamepad to the phone stands
// the touch movement/camera/action-ring chrome down (mobile_pad_chrome.ts +
// its body.mobile-touch.pad-connected CSS), the mirror of the cross-hotbar
// overlay standing down for touch (src/styles/CLAUDE.md, the body.mobile-
// touch .xhb rule pinned by css_layer_containment.test.ts). These assertions
// pin BOTH halves: the JS wiring that keeps the pad-connected class truthful,
// and the CSS rule that actually hides the chrome, so a future edit cannot
// silently drop either one.

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

describe('main.ts wires applyPadConnectedClass to every pad connection-state change', () => {
  it('imports the module', () => {
    expect(mainTs).toContain("import { applyPadConnectedClass } from './game/mobile_pad_chrome';");
  });

  it('calls it from GamepadManager.onConnectionChange, alongside the cross-hotbar sync', () => {
    const block = mainTs.match(/onConnectionChange:\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? '';
    expect(block, 'onConnectionChange callback body not found').toBeTruthy();
    expect(block).toContain('crossHotbar.syncPadMode(gamepad)');
    expect(block).toContain('applyPadConnectedClass(gamepad.isConnected())');
  });

  it('calls it from the gamepadEnabled setting applier too (start/stop is synchronous, no event fires)', () => {
    const block =
      mainTs.match(
        /createGamepadSettingApplier\(gamepad, settings, \(\) => \{([\s\S]*?)\n\s*\}\);/,
      )?.[1] ?? '';
    expect(block, 'createGamepadSettingApplier callback body not found').toBeTruthy();
    expect(block).toContain('crossHotbar.syncPadMode(gamepad)');
    expect(block).toContain('applyPadConnectedClass(gamepad.isConnected())');
  });
});

describe('body.mobile-touch.pad-connected stands down the touch gameplay-input chrome', () => {
  const selector =
    'body\\.mobile-touch\\.pad-connected #mobile-move-zone,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.pad-connected #mobile-move-joystick,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.pad-connected #mobile-camera-joystick,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.pad-connected #mobile-action-ring';

  it('hides exactly the movement/camera/action-ring surfaces the pad replaces', () => {
    const body = ruleBody(selector);
    expect(body, 'the four-selector pad-connected rule was not found as expected').toBeTruthy();
    expect(body.trim()).toBe('display: none;');
  });

  it('does NOT touch the menu-access chrome (Quick Actions seat / mobile-combat-controls)', () => {
    expect(hudMobileCss).not.toMatch(/pad-connected[^{]*#mobile-combat-controls/);
    expect(hudMobileCss).not.toMatch(/pad-connected[^{]*#mobile-menu-anchor/);
  });

  it('stays inside @layer hud-mobile (css_layer_containment.test.ts pins the whole file)', () => {
    // Cheap local sanity check, not a re-implementation of the full layer walk:
    // the rule text must appear after the file's one @layer hud-mobile opener.
    const layerOpenAt = hudMobileCss.indexOf('@layer hud-mobile {');
    const ruleAt = hudMobileCss.indexOf('body.mobile-touch.pad-connected #mobile-move-zone');
    expect(layerOpenAt).toBeGreaterThanOrEqual(0);
    expect(ruleAt).toBeGreaterThan(layerOpenAt);
  });
});
