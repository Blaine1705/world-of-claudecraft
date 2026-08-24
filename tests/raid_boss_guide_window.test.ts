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

  beforeAll(async () => ensureLocaleLoaded('ja_JP'));

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
      captureFocus: () => guide.button,
      restoreFocus,
      contextFallback: () => fallback,
    });
  });

  afterEach(() => setLanguage('en'));

  it('keeps one opener and paints both difficulty rules for the current room', () => {
    expect(guide.syncAvailability('some_other_room')).toBeNull();

    const button = guide.syncAvailability(IGNIVAR_RAID_ARENA_ID);
    expect(button).toBe(guide.button);
    expect(button?.textContent).toContain('Ignivar');
    button?.click();

    expect(closeOthers).toHaveBeenCalledOnce();
    expect(root.style.display).toBe('block');
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.querySelectorAll('.rbg-list li')).toHaveLength(6);
    expect(root.querySelector<HTMLOListElement>('.rbg-list')?.tabIndex).toBe(0);
    expect(document.activeElement).toBe(root.querySelector('.rbg-list'));
    expect(root.textContent).toContain('Normal');
    expect(root.textContent).toContain('Heroic');
  });

  it('switches to Varkhul and returns focus to a connected fallback when leaving the raid', () => {
    const button = guide.syncAvailability(IGNIVAR_SECOND_WING_ID);
    button?.click();
    expect(root.querySelectorAll('.rbg-list li')).toHaveLength(7);
    expect(root.textContent).toContain('Varkhul');

    expect(guide.syncAvailability(null)).toBeNull();
    button?.remove();
    expect(root.style.display).toBe('none');
    expect(restoreFocus).toHaveBeenCalledWith(fallback);
    expect(document.activeElement).toBe(fallback);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('relocalizes its stable opener and keeps focus on the rebuilt close control', () => {
    const button = guide.syncAvailability(IGNIVAR_RAID_ARENA_ID);
    button?.click();
    const oldClose = root.querySelector<HTMLButtonElement>('[data-close]');
    oldClose?.focus();
    expect(document.activeElement).toBe(oldClose);

    setLanguage('ja_JP');
    guide.relocalize();

    const newClose = root.querySelector<HTMLButtonElement>('[data-close]');
    expect(button?.textContent).toContain('攻略');
    expect(root.textContent).toContain('ボス攻略');
    expect(newClose).not.toBe(oldClose);
    expect(document.activeElement).toBe(newClose);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('selects a visible platform launcher as the contextual focus fallback', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="mm-char">Character</button><button id="mobile-more">More</button>',
    );
    expect(raidBossGuideContextFallback(document, false)?.id).toBe('mm-char');
    expect(raidBossGuideContextFallback(document, true)?.id).toBe('mobile-more');
  });
});
