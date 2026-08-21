// @vitest-environment happy-dom
// The touch menu control's build wiring, and the one thing about it that a
// gesture test cannot see: the anchor's ACCESSIBLE NAME depends on the MODE.
//
// The static name teaches the gesture, because a touch device has no hover to
// discover it with. Under settings.touchTapMenus a tap OPENS the strip and never
// opens chat, so that sentence tells a screen-reader user the opposite of what
// the control does; nothing rewrote it when the setting flipped. The name is
// re-resolved on the settings broadcast and again after a language switch, since
// the shell's own translatePage() pass re-stamps the gesture-mode name from
// data-i18n-aria on every locale change.

import { beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_CHANGE_EVENT, Settings } from '../src/game/settings';
import { buildMobileMenuControl } from '../src/ui/hud/menu/menu_control_controller';
import { MENU_STRIP_ITEMS } from '../src/ui/hud/menu/menu_strip_core';
import { t } from '../src/ui/i18n';

const GESTURE_NAME = t('hudChrome.mobile.menuControlAria');
const TAP_NAME = t('hudChrome.mobile.menuControlAriaTap');

function mount(): HTMLButtonElement {
  document.body.replaceChildren();
  const anchor = document.createElement('button');
  anchor.type = 'button';
  anchor.id = 'mobile-menu-anchor';
  anchor.setAttribute('aria-expanded', 'false');
  // What the shell's data-i18n-aria pass leaves on the element at boot.
  anchor.setAttribute('aria-label', GESTURE_NAME);
  const strip = document.createElement('div');
  strip.id = 'mobile-menu-strip';
  const cancel = document.createElement('button');
  cancel.id = 'mobile-menu-cancel';
  const caption = document.createElement('div');
  caption.id = 'mobile-menu-caption';
  const captionText = document.createElement('span');
  captionText.className = 'tt-title';
  caption.append(captionText);
  document.body.append(anchor, strip, cancel, caption);
  for (const item of MENU_STRIP_ITEMS) {
    const btn = document.createElement('button');
    btn.id = item.elementId;
    btn.tabIndex = -1;
    document.body.append(btn);
  }
  return anchor;
}

function setTapMenus(on: boolean): void {
  new Settings().set('touchTapMenus', on);
}

beforeEach(() => {
  localStorage.clear();
  setTapMenus(false);
});

describe('buildMobileMenuControl: the anchor name follows the mode', () => {
  it('teaches the gesture with the setting off', () => {
    const anchor = mount();
    expect(buildMobileMenuControl({ runDefault: () => {} })).not.toBeNull();
    expect(anchor.getAttribute('aria-label')).toBe(GESTURE_NAME);
    expect(GESTURE_NAME).toContain('swipe');
  });

  it('swaps to the tap-mode name the moment the options row flips', () => {
    const anchor = mount();
    expect(buildMobileMenuControl({ runDefault: () => {} })).not.toBeNull();
    setTapMenus(true);
    expect(anchor.getAttribute('aria-label')).toBe(TAP_NAME);
    // The gesture sentence is what was wrong under tap mode: a tap opens the
    // row there, it does not open chat.
    expect(TAP_NAME).not.toBe(GESTURE_NAME);
    expect(TAP_NAME).not.toContain('swipe');

    setTapMenus(false);
    expect(anchor.getAttribute('aria-label')).toBe(GESTURE_NAME);
  });

  it('re-applies the tap-mode name after the shell re-stamps it on a locale switch', () => {
    const anchor = mount();
    expect(buildMobileMenuControl({ runDefault: () => {} })).not.toBeNull();
    setTapMenus(true);
    // translatePage() writes data-i18n-aria straight onto the element, outside
    // any facet, so the correction must not be elided away.
    anchor.setAttribute('aria-label', GESTURE_NAME);
    document.dispatchEvent(new CustomEvent('woc:languagechange'));
    expect(anchor.getAttribute('aria-label')).toBe(TAP_NAME);
  });

  it('builds nothing when the markup is absent, and touches no name', () => {
    document.body.replaceChildren();
    expect(buildMobileMenuControl({ runDefault: () => {} })).toBeNull();
  });

  it('leaves the anchor open state to the gesture layer, starting closed', () => {
    const anchor = mount();
    const control = buildMobileMenuControl({ runDefault: () => {} });
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    control?.gesture.openSticky();
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
    control?.gesture.closeSticky();
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('buildMobileMenuControl: the settings broadcast is the only invalidation', () => {
  it('answers a bare broadcast without a build having gone stale', () => {
    const anchor = mount();
    expect(buildMobileMenuControl({ runDefault: () => {} })).not.toBeNull();
    window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
    expect(anchor.getAttribute('aria-label')).toBe(GESTURE_NAME);
  });
});
