// @vitest-environment jsdom
//
// DOM behavioral guard: the jump-to-deed spotlight (openWithDeed) and the
// recent-strip recency sources, driven on the real DeedsWindow over jsdom
// with stub deps (the deeds_window_focus.test.ts rig). Covers the chat-link
// landing (category switch, filter/search reset, the one-shot flash), the
// hidden-deed mask guard, the strip's jump buttons, and the two live recency
// feeds (noteUnlocks, the fetched order).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDeedStats } from '../src/sim/deeds';
import { DeedsWindow, type DeedsWindowDeps } from '../src/ui/deeds_window';

// jsdom ships no 2D canvas, so the procedural crest compositor cannot run
// here; the painter only ever uses the returned string as an <img src>.
vi.mock('../src/ui/icons', () => ({
  iconDataUrl: () => 'data:,',
}));

interface WorldState {
  deedsEarned: Map<string, string>;
  renown: number;
  activeTitle: string | null;
  recent: string[] | null;
}

function baseState(): WorldState {
  return { deedsEarned: new Map(), renown: 0, activeTitle: null, recent: null };
}

function makeWindow(state: WorldState, open = true): { w: DeedsWindow; el: HTMLElement } {
  const el = document.createElement('div');
  el.id = 'deeds-window';
  document.body.appendChild(el);
  const stats = freshDeedStats();
  const deps: DeedsWindowDeps = {
    root: () => el,
    world: () =>
      ({
        deedsEarned: state.deedsEarned,
        deedStats: stats,
        renown: state.renown,
        activeTitle: state.activeTitle,
        deedsRarity: async () => null,
        deedsRecent: async () => state.recent,
        setActiveTitle: (id: string | null) => {
          state.activeTitle = id;
        },
        cfg: { playerClass: 'warrior' },
        player: { name: 'Hero' },
      }) as never,
    closeOthers: () => {},
    hideTooltip: () => {},
    consumePeek: () => false,
    captureFocus: () => null,
    restoreFocus: () => {},
    onWatchChanged: () => {},
    itemIcon: () => '',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: () => {},
  };
  const w = new DeedsWindow(deps);
  if (open) w.open();
  return { w, el };
}

const flashed = (el: HTMLElement): string | null =>
  el.querySelector('.deed-card-flash')?.getAttribute('data-deed') ?? null;

const stripIds = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('[data-recent]')].map((b) => b.getAttribute('data-recent') ?? '');

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('openWithDeed: the chat-link landing', () => {
  it('switches to the deed category and flashes its card, one-shot', () => {
    const state = baseState();
    state.deedsEarned.set('prog_first_steps', '2026-07-01');
    const { w, el } = makeWindow(state);
    w.open('combat');
    w.openWithDeed('prog_first_steps');
    expect(el.querySelector('[data-cat="progression"]')?.classList.contains('active')).toBe(true);
    expect(flashed(el)).toBe('prog_first_steps');
    // One-shot: the next paint carries no spotlight, so a slow-band refresh
    // can never re-scroll a window the player has moved on from.
    w.render();
    expect(flashed(el)).toBe(null);
  });

  it('opens the Book when it was closed, landing on the card', () => {
    const state = baseState();
    state.deedsEarned.set('prog_first_steps', '2026-07-01');
    const { w, el } = makeWindow(state, false);
    expect(w.isOpen).toBe(false);
    w.openWithDeed('prog_first_steps');
    expect(w.isOpen).toBe(true);
    expect(flashed(el)).toBe('prog_first_steps');
  });

  it('resets an active filter and search so the card is guaranteed visible', () => {
    const state = baseState();
    state.deedsEarned.set('prog_first_steps', '2026-07-01');
    const { w, el } = makeWindow(state);
    // An earned deed would be hidden behind the unearned filter and a stale
    // search; the jump clears both.
    (el.querySelector('[data-filter="unearned"]') as HTMLElement).click();
    const search = el.querySelector('.deed-search') as HTMLInputElement;
    search.value = 'zzz-no-match';
    search.dispatchEvent(new Event('input'));
    w.openWithDeed('prog_first_steps');
    expect(flashed(el)).toBe('prog_first_steps');
    expect(el.querySelector('[data-filter="all"]')?.classList.contains('active')).toBe(true);
    expect((el.querySelector('.deed-search') as HTMLInputElement).value).toBe('');
  });

  it('a hidden unearned deed opens the Book wherever it was, unfocused (the mask holds)', () => {
    const { w, el } = makeWindow(baseState());
    w.open('combat');
    w.openWithDeed('hid_roll_hundred');
    expect(w.isOpen).toBe(true);
    expect(flashed(el)).toBe(null);
    // No category switch: switching to the Feats shelf would hint where the
    // hidden deed lives.
    expect(el.querySelector('[data-cat="combat"]')?.classList.contains('active')).toBe(true);
  });

  it('an unknown id (content drift) opens the Book unfocused, never a crash', () => {
    const { w, el } = makeWindow(baseState(), false);
    w.openWithDeed('removed_deed');
    expect(w.isOpen).toBe(true);
    expect(flashed(el)).toBe(null);
  });
});

describe('the recent strip: jump buttons and recency sources', () => {
  it('clicking a strip crest jumps to that deed card', () => {
    const state = baseState();
    state.deedsEarned.set('prog_first_steps', '2026-07-01');
    const { el } = makeWindow(state);
    const btn = el.querySelector<HTMLElement>('[data-recent="prog_first_steps"]');
    expect(btn).not.toBeNull();
    expect(btn?.tagName).toBe('BUTTON');
    btn?.click();
    expect(el.querySelector('[data-cat="progression"]')?.classList.contains('active')).toBe(true);
    expect(flashed(el)).toBe('prog_first_steps');
  });

  it('noteUnlocks puts the session order first and repaints an open window', () => {
    const state = baseState();
    // Same day: the day fallback would order these catalog-later-first
    // (cmb_first_blood ahead), so session order is observable.
    state.deedsEarned.set('prog_first_steps', '2026-07-01');
    state.deedsEarned.set('cmb_first_blood', '2026-07-01');
    const { w, el } = makeWindow(state);
    expect(stripIds(el)[0]).toBe('cmb_first_blood');
    w.noteUnlocks(['prog_first_steps']);
    expect(stripIds(el)[0]).toBe('prog_first_steps');
  });

  it('the fetched order lands async and repaints the strip in place', async () => {
    const state = baseState();
    state.deedsEarned.set('prog_first_steps', '2026-07-01');
    state.deedsEarned.set('cmb_first_blood', '2026-07-01');
    state.recent = ['prog_first_steps', 'cmb_first_blood'];
    const { el } = makeWindow(state);
    await settle();
    expect(stripIds(el)).toEqual(['prog_first_steps', 'cmb_first_blood']);
  });
});
