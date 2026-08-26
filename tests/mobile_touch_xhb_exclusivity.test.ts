import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Mobile-controller exclusivity: pairing a gamepad to the phone is three
// stand-up/stand-down moves, all keyed off the SAME class, .xhb-mode
// (cross_hotbar_wiring.ts's syncPadMode: the cross hotbar enabled AND the pad
// connected), never raw pad connection (a player who disables the cross
// hotbar overlay keeps the touch chrome instead of a HUD with none of it):
//   1. Touch gameplay chrome (move/camera/action ring) stands down.
//   2. The XHB stands up as the one hotbar (it is the pad's stance surface
//      too, see cross_hotbar_wiring.ts's crossHotbarSeed), with its lift
//      intact so the player frame still clears it.
//   3. The desktop #side-buttons micromenu rail stands up too, so the pad's
//      right-stick mouse mode (src/game/gamepad.ts) has menu targets, same as
//      on desktop; Quick Actions stays available for the touch path.
// These assertions pin all of it plus the main.ts wiring, so a future edit
// cannot silently re-fork the standdowns onto different conditions or
// reintroduce separate pad-connected chrome state.

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

describe('the touch-input chrome stands down for a pad only once it takes the XHB band', () => {
  const selector =
    'body\\.mobile-touch\\.xhb-mode #mobile-move-zone,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.xhb-mode #mobile-move-joystick,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.xhb-mode #mobile-camera-joystick,\\s*\\n\\s*' +
    'body\\.mobile-touch\\.xhb-mode #mobile-action-ring';

  it('hides exactly the movement/camera/action-ring surfaces the pad replaces', () => {
    const body = ruleBody(selector);
    expect(
      body,
      'the four-selector xhb-mode standdown rule was not found as expected',
    ).toBeTruthy();
    expect(body.trim()).toBe('display: none;');
  });

  it('does NOT touch the menu-access chrome (Quick Actions seat / mobile-combat-controls)', () => {
    expect(hudMobileCss).not.toMatch(/\.xhb-mode #mobile-combat-controls/);
    expect(hudMobileCss).not.toMatch(/\.xhb-mode #mobile-menu-anchor/);
  });

  it('is no longer keyed off a separate pad-connected class', () => {
    expect(hudMobileCss).not.toMatch(/pad-connected/);
  });

  it('stays inside @layer hud-mobile (css_layer_containment.test.ts pins the whole file)', () => {
    const layerOpenAt = hudMobileCss.indexOf('@layer hud-mobile {');
    const ruleAt = hudMobileCss.indexOf('body.mobile-touch.xhb-mode #mobile-move-zone');
    expect(layerOpenAt).toBeGreaterThanOrEqual(0);
    expect(ruleAt).toBeGreaterThan(layerOpenAt);
  });
});

describe('the cross hotbar overlay stands alone once it takes over: it does not also stand down', () => {
  it('scopes the touch standdown to :not(.xhb-mode), so the overlay shows once the pad drives it', () => {
    const body = ruleBody('body\\.mobile-touch:not\\(\\.xhb-mode\\) \\.xhb');
    expect(body.trim()).toBe('display: none;');
    // The old, unconditional selector must be gone, not merely shadowed by a
    // later rule: a stray `body.mobile-touch .xhb { display: none; }` would
    // re-hide the bar regardless of source order once both apply.
    expect(hudMobileCss).not.toMatch(/body\.mobile-touch \.xhb \{/);
  });

  it('zeroes --xhb-lift only outside xhb-mode, so the visible bar keeps lifting the player frame clear', () => {
    const body = ruleBody('body\\.mobile-touch:not\\(\\.xhb-mode\\)');
    expect(body).toContain('--xhb-lift: 0px !important;');
    expect(hudMobileCss).not.toMatch(/body\.mobile-touch \{\s*\n\s*--xhb-lift: 0px !important;/);
  });

  it('drops the dead #mobile-stance-anchor exemption (it is a child of the ring the standdown above hides, so visibility:visible could never survive the ancestor display:none)', () => {
    expect(hudMobileCss).not.toMatch(/#mobile-stance-anchor\s*\{\s*\n\s*visibility: visible;/);
  });
});

describe('main.ts syncs xhb-mode alone on every pad connection-state change', () => {
  it('keeps syncPadChrome as the one pad chrome callback, with no separate pad-connected state', () => {
    const block = mainTs.match(/const syncPadChrome = \(\) => \{([\s\S]*?)\n\s*\};/)?.[1] ?? '';
    expect(block, 'syncPadChrome callback body not found').toBeTruthy();
    expect(block).toContain('crossHotbar.syncPadMode(gamepad)');
    expect(block).not.toMatch(/applyPadConnectedClass|pad-connected|mobile_pad_chrome/);
  });

  it('uses that callback for connection changes and the synchronous gamepadEnabled setting path', () => {
    expect(mainTs).toContain('onConnectionChange: syncPadChrome,');
    expect(mainTs).toContain('createGamepadSettingApplier(gamepad, settings, syncPadChrome)');
  });
});

describe('the desktop micromenu rail stands back up for the pad, so its mouse mode has menu targets', () => {
  it('scopes the #side-buttons standdown to :not(.xhb-mode)', () => {
    const body = ruleBody('body\\.mobile-touch:not\\(\\.xhb-mode\\) #side-buttons');
    expect(body.trim()).toBe('display: none;');
    expect(hudMobileCss).not.toMatch(/body\.mobile-touch #side-buttons \{/);
  });

  it('keeps the standalone chest button hidden either way (its mobile equivalent lives in the More tray)', () => {
    const body = ruleBody('body\\.mobile-touch #daily-rewards-button');
    expect(body.trim()).toBe('display: none !important;');
  });
});
