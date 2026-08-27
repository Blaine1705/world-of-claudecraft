// @vitest-environment happy-dom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IGNIVAR_RAID_ARENA_ID, IGNIVAR_SECOND_WING_ID } from '../src/sim/ignivar_raid_ids';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';
import {
  RaidBossGuideWindow,
  raidBossGuideContextFallback,
} from '../src/ui/raid_boss_guide_window';

describe('RaidBossGuideWindow', () => {
  let root: HTMLDivElement;
  let fallback: HTMLButtonElement;
  let closeOthers: ReturnType<typeof vi.fn<() => void>>;
  let restoreFocus: ReturnType<typeof vi.fn<(target: HTMLElement | null) => void>>;
  let guide: RaidBossGuideWindow;

  beforeAll(async () => ensureLocaleLoaded('es'));

  beforeEach(() => {
    setLanguage('en');
    document.body.innerHTML =
      '<button id="stable-fallback">Character</button><div id="raid-boss-guide-window"></div>';
    const guideRoot = document.querySelector<HTMLDivElement>('#raid-boss-guide-window');
    const fallbackButton = document.querySelector<HTMLButtonElement>('#stable-fallback');
    if (!guideRoot || !fallbackButton) throw new Error('Raid boss guide fixture did not mount');
    root = guideRoot;
    fallback = fallbackButton;
    closeOthers = vi.fn<() => void>();
    restoreFocus = vi.fn<(target: HTMLElement | null) => void>((target) => target?.focus());
    guide = new RaidBossGuideWindow({
      root: () => root,
      closeOthers,
      captureFocus: () =>
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null,
      restoreFocus,
      contextFallback: () => fallback,
    });
  });

  afterEach(() => setLanguage('en'));

  it('keeps one opener and paints the complete Ignivar guide for the current room', () => {
    expect(guide.syncAvailability('some_other_room')).toBeNull();

    const button = guide.syncAvailability(IGNIVAR_RAID_ARENA_ID);
    expect(button).toBe(guide.button);
    expect(button?.textContent).toContain('Ignivar');
    button?.click();

    expect(closeOthers).toHaveBeenCalledOnce();
    expect(root.style.display).toBe('block');
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('false');
    expect(root.querySelectorAll('.rbg-list li')).toHaveLength(6);
    expect(root.querySelector<HTMLOListElement>('.rbg-list')?.tabIndex).toBe(0);
    expect(document.activeElement).toBe(root.querySelector('.rbg-list'));
    expect(root.textContent).toContain('Normal');
    expect(root.textContent).toContain('Heroic');
    expect(root.textContent).not.toContain('Shared Pyre');
  });

  it('shows Varkhul meteors, anvil, ray, forge, Assembly, and Worldfire guidance', () => {
    guide.syncAvailability(IGNIVAR_SECOND_WING_ID)?.click();

    expect(root.querySelectorAll('.rbg-list li')).toHaveLength(10);
    for (const mechanic of [
      'Forgestorm',
      'Shared Pyre',
      "Anvil's Decree",
      'Tempering Ray',
      "Master's Assembly",
      'Worldfire',
    ]) {
      expect(root.textContent).toContain(mechanic);
    }
  });

  it('returns focus to a connected fallback when the current room loses its guide', () => {
    const button = guide.syncAvailability(IGNIVAR_SECOND_WING_ID);
    button?.click();
    expect(guide.syncAvailability(null)).toBeNull();
    button?.remove();

    expect(root.style.display).toBe('none');
    expect(restoreFocus).toHaveBeenCalledWith(fallback);
    expect(document.activeElement).toBe(fallback);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('moves focus before a closed launcher disappears with the room context', () => {
    const button = guide.syncAvailability(IGNIVAR_SECOND_WING_ID);
    if (button) document.body.append(button);
    button?.focus();

    expect(guide.syncAvailability(null)).toBeNull();
    button?.remove();

    expect(restoreFocus).toHaveBeenCalledWith(fallback);
    expect(document.activeElement).toBe(fallback);
  });

  it('does not restore stale launcher focus after pointer activation', () => {
    const button = guide.syncAvailability(IGNIVAR_RAID_ARENA_ID);
    if (button) document.body.append(button);
    button?.focus();
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(root.style.display).toBe('block');
    guide.close();

    expect(restoreFocus).toHaveBeenCalledWith(null);
    expect(document.activeElement).not.toBe(button);
  });

  it('relocalizes its stable opener and keeps focus on the rebuilt close control', () => {
    const button = guide.syncAvailability(IGNIVAR_RAID_ARENA_ID);
    button?.click();
    const oldClose = root.querySelector<HTMLButtonElement>('[data-close]');
    oldClose?.focus();

    setLanguage('es');
    guide.relocalize();

    const newClose = root.querySelector<HTMLButtonElement>('[data-close]');
    expect(button).toBe(guide.button);
    expect(button?.textContent).toContain('Guía');
    expect(root.textContent).toContain('Guía de jefes');
    expect(newClose).not.toBe(oldClose);
    expect(document.activeElement).toBe(newClose);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('selects the visible platform launcher as the contextual focus fallback', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="mm-char">Character</button><button id="mobile-more">More</button>',
    );
    expect(raidBossGuideContextFallback(document, false)?.id).toBe('mm-char');
    expect(raidBossGuideContextFallback(document, true)?.id).toBe('mobile-more');
  });
});
