// @vitest-environment jsdom
//
// DOM behavioral guard for the Reliquary DEEP LINK (openWithPage), driven on
// the real ReliquaryWindow over jsdom with stub deps and the LIVE
// RELIQUARY_PAGES catalog (the deeds_window_jump.test.ts rig). A relic gain in
// chat is one click from its page, so this file asserts what that click owes:
// the page paints under its OWN rail whatever shelf the window was left on, the
// reading position lands on the page header (warm and cold), the needle and
// ownership chip that could hide the page are cleared, and an id the catalog
// does not hold opens the window wherever it was rather than crashing or
// half-navigating.
//
// jsdom deliberately: it ships no Element.scrollIntoView, so the production
// guard is exercised by every test here, and the one test that pins the scroll
// installs a spy and removes it again.
//
// Page names are compared against LIVE reliquaryPageName() calls, never
// hardcoded English, so a locale fill cannot turn a green pin red.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RELIQUARY_PAGES_BY_ID } from '../src/sim/content/reliquary';
import { reliquaryPageName } from '../src/ui/reliquary_i18n';
import {
  type ReliquaryNavId,
  ReliquaryWindow,
  type ReliquaryWindowDeps,
} from '../src/ui/reliquary_window';

// jsdom ships no 2D canvas, so the procedural item-icon compositor cannot run
// here; the painter only ever uses the returned string as an <img src>.
vi.mock('../src/ui/icons', () => ({
  iconDataUrl: (kind: string, id: string) => `data:,${kind}:${id}`,
}));

// A Conquerors page and a Professions page: the pair that makes a cross-shelf
// jump observable at all (the off-shelf render bug needs the persisted page and
// the jump target to sit on DIFFERENT rails).
const CRYPT_PAGE = 'conquerors_hollow_crypt';
const NOTES_PAGE = 'professions_field_notes';
// One item relic on the Conquerors page, for the Overview recent chip.
const CRYPT_RELIC = 'cryptbone_helm';

// Content premises: the two pages exist, sit on the shelves this suite assumes,
// and the relic really is on the Conquerors page. Without these, a catalog
// rename would make every assertion below vacuously true.
const premise = (pageId: string, shelf: ReliquaryNavId): void => {
  const def = RELIQUARY_PAGES_BY_ID[pageId];
  if (!def) throw new Error(`content premise: ${pageId} is a live Reliquary page`);
  if (def.shelf !== shelf) throw new Error(`content premise: ${pageId} sits on ${shelf}`);
};

interface WorldState {
  itemsDiscovered: Set<string>;
  recent: string[];
  firstFind: Record<string, { clears?: number; pageId?: string }>;
}

function baseState(): WorldState {
  return { itemsDiscovered: new Set(), recent: [], firstFind: {} };
}

interface Rig {
  w: ReliquaryWindow;
  el: HTMLElement;
  state: WorldState;
}

function makeWindow(state: WorldState, opts: { open?: boolean; nav?: ReliquaryNavId } = {}): Rig {
  const el = document.createElement('div');
  el.id = 'reliquary-window';
  document.body.appendChild(el);

  const deps: ReliquaryWindowDeps = {
    root: () => el,
    world: () =>
      ({
        // The pin store keys off the character (woc_reliquary_pins_<class>_<name>),
        // so every ReliquaryWindow world needs the identity pair a real IWorld has.
        cfg: { playerClass: 'warrior' },
        player: { name: 'Testwright' },
        deedStats: { itemsDiscovered: state.itemsDiscovered },
        reliquaryMarks: new Set<string>(),
        reliquaryRecent: state.recent,
        reliquaryFirstFind: state.firstFind,
        ownedMounts: () => [],
        accountCosmetics: { weaponSkinIds: [] },
        deedsEarned: new Map<string, string>(),
        reliquaryPageClearCount: () => undefined,
        reliquaryCatalogCompletion: () => ({ owned: 0, total: 100 }),
        reliquaryCuratorRank: () => 0,
        reliquaryPageCompletion: () => null,
      }) as never,
    closeOthers: () => {},
    hideTooltip: () => {},
    consumePeek: () => false,
    captureFocus: () => null,
    restoreFocus: () => {},
    onPinChanged: () => {},
    itemIcon: (item) => `<img data-item-icon="${item.id}" alt="">`,
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: () => {},
  };

  const w = new ReliquaryWindow(deps);
  if (opts.open !== false) w.open(opts.nav);
  return { w, el, state };
}

/** Which rail button the paint marks as the active shelf. */
const activeNav = (el: HTMLElement): string | null =>
  el.querySelector<HTMLElement>('.reliquary-nav.active')?.dataset.nav ?? null;

/** The painted page detail's title, or null when no page detail is painted. */
const paintedPage = (el: HTMLElement): string | null =>
  el.querySelector<HTMLElement>('.reliquary-page-detail .reliquary-page-title')?.textContent ??
  null;

const header = (el: HTMLElement): HTMLElement | null =>
  el.querySelector<HTMLElement>('.reliquary-page-header');

const searchField = (el: HTMLElement): HTMLInputElement => {
  const input = el.querySelector<HTMLInputElement>('.reliquary-search');
  if (!input) throw new Error('contract: .reliquary-search is the window search field');
  return input;
};

/** Type into the search field the way a player does: focus, set, dispatch. */
function typeSearch(el: HTMLElement, value: string): void {
  const input = searchField(el);
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function click(el: HTMLElement, selector: string): HTMLElement {
  const node = el.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  node.click();
  return node;
}

beforeEach(() => {
  document.body.innerHTML = '';
  premise(CRYPT_PAGE, 'conquerors');
  premise(NOTES_PAGE, 'professions');
  const crypt = RELIQUARY_PAGES_BY_ID[CRYPT_PAGE];
  if (!crypt?.relics.some((r) => r.kind === 'item' && r.itemId === CRYPT_RELIC)) {
    throw new Error(`content premise: ${CRYPT_PAGE} holds ${CRYPT_RELIC}`);
  }
});

describe('openWithPage: the chat deep link', () => {
  it('paints the page under its OWN rail, not the shelf the window was left on', () => {
    // The bug this pins: the view resolves an open pageId from the WHOLE
    // catalog, so a jump that moved only the page (and not the shelf) would
    // render a Professions page under the Conquerors rail.
    const { w, el } = makeWindow(baseState(), { nav: 'conquerors' });
    w.openWithPage(NOTES_PAGE);
    expect(activeNav(el)).toBe('professions');
    expect(paintedPage(el)).toBe(reliquaryPageName(NOTES_PAGE));
  });

  it('moves the reading position onto the landed page header (a jump is a navigation)', () => {
    const { w, el } = makeWindow(baseState());
    w.openWithPage(CRYPT_PAGE);
    const head = header(el);
    expect(head).not.toBeNull();
    expect(head?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(head);
  });

  it('a cold open leaves the reading position on the header, not Close', () => {
    // open() parks on Close for a plain open; the jump must not let that park
    // steal the focus the navigation promised (the closed-window chat link).
    const { w, el } = makeWindow(baseState(), { open: false });
    expect(w.isOpen).toBe(false);
    w.openWithPage(CRYPT_PAGE);
    expect(w.isOpen).toBe(true);
    expect(paintedPage(el)).toBe(reliquaryPageName(CRYPT_PAGE));
    expect(document.activeElement).toBe(header(el));
    expect(el.querySelector('[data-close]')).not.toBe(document.activeElement);
  });

  it('scrolls the landed header into view, centered, through the guarded call', () => {
    // jsdom ships no scrollIntoView, which is exactly why the production call
    // is typeof-guarded; install one so the arm itself is observable.
    const spy = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = spy;
    try {
      const { w } = makeWindow(baseState(), { open: false });
      w.openWithPage(CRYPT_PAGE);
      // Once under display:none during render, once after open() sets flex so
      // the scroll is reliable against a visible root (the deeds cold-jump).
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith({ block: 'center' });
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('clears a needle and an ownership chip that could hide the landed page', () => {
    const { w, el } = makeWindow(baseState());
    w.openWithPage(CRYPT_PAGE);
    click(el, '[data-filter="missing"]');
    typeSearch(el, 'zzzz-no-such-relic');
    expect(searchField(el).value).toBe('zzzz-no-such-relic');
    expect(el.querySelector('[data-filter="missing"]')?.getAttribute('aria-pressed')).toBe('true');
    w.openWithPage(NOTES_PAGE);
    expect(paintedPage(el)).toBe(reliquaryPageName(NOTES_PAGE));
    expect(searchField(el).value).toBe('');
    expect(el.querySelector('[data-filter="all"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-filter="missing"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('is a ONE-SHOT: a later repaint does not yank the reading position back', () => {
    const { w, el } = makeWindow(baseState());
    w.openWithPage(CRYPT_PAGE);
    expect(document.activeElement).toBe(header(el));
    // A repaint restores focus by data-focus-key, and the header deliberately
    // carries none (a landing spot is not a control, and a new key would owe
    // the reliquaryFocusFallbackKey vocabulary an arm), so the window falls
    // back to its Close park. What must NOT happen is a latched jump grabbing
    // the header again on every later render.
    w.render();
    expect(document.activeElement).toBe(el.querySelector('[data-close]'));
    expect(document.activeElement).not.toBe(header(el));
  });

  it('survives the HUD slow band: the landed paint latches its own signature', () => {
    // The band ticks every 500ms. If the jump render left lastSig stale, the
    // very next tick would rebuild on identical state and drop the reading
    // position the jump just placed (the deeds spotlight-elision contract).
    const { w, el } = makeWindow(baseState());
    w.openWithPage(CRYPT_PAGE);
    w.refreshIfChanged();
    expect(document.activeElement).toBe(header(el));
    expect(paintedPage(el)).toBe(reliquaryPageName(CRYPT_PAGE));
  });

  it('opens the window unfocused, and un-navigated, for an id the catalog lost', () => {
    // Content drift (or a forged id): the promise cannot be kept, so the window
    // opens wherever it was rather than half-navigating (the openWithDeed
    // doctrine for an unknown or still-masked id).
    const { w, el } = makeWindow(baseState(), { open: false });
    w.openWithPage('retired_page_id');
    expect(w.isOpen).toBe(true);
    expect(activeNav(el)).toBe('overview');
    expect(paintedPage(el)).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('[data-close]'));
  });

  it('treats prototype keys as unknown ids (no crash, no navigation)', () => {
    // The catalog is scanned as a list, never indexed as an object, so
    // '__proto__' and 'constructor' resolve to nothing at all.
    const { w, el } = makeWindow(baseState(), { nav: 'conquerors' });
    for (const id of ['__proto__', 'constructor', 'toString']) {
      w.openWithPage(id);
      expect(activeNav(el), id).toBe('conquerors');
      expect(paintedPage(el), id).toBeNull();
    }
  });
});

describe('open(nav): the shelf deep link', () => {
  it('drops a persisted page from ANOTHER shelf (the Phase 13 QA contract)', () => {
    // Recorded in the Phase 13 QA pass: "open(nav) sets nav but does not clear
    // pageId, and the view resolves an off-shelf pageId from the full catalog,
    // so a deep link passing a nav while a page from another shelf is persisted
    // can render that page under the wrong rail." Unreachable until Phase 15
    // gave open(nav) a caller (the curator rank-up chat link).
    const { w, el } = makeWindow(baseState());
    w.openWithPage(NOTES_PAGE);
    expect(paintedPage(el)).toBe(reliquaryPageName(NOTES_PAGE));
    w.open('conquerors');
    expect(activeNav(el)).toBe('conquerors');
    expect(paintedPage(el)).toBeNull();
    expect(el.querySelector('.reliquary-page-list')).not.toBeNull();
  });

  it('drops the persisted page across a close, too (the closed-window link)', () => {
    const { w, el } = makeWindow(baseState());
    w.openWithPage(NOTES_PAGE);
    w.close();
    w.open('overview');
    expect(activeNav(el)).toBe('overview');
    expect(paintedPage(el)).toBeNull();
  });

  it('a NO-ARG open still restores where the player was, page and all', () => {
    // close() deliberately keeps the shelf and the open page: that reads as
    // "where I was", not as a filter left switched on. Only a nav-bearing open
    // is a deep link, so only it may drop the page.
    const { w, el } = makeWindow(baseState());
    w.openWithPage(NOTES_PAGE);
    w.close();
    w.open();
    expect(activeNav(el)).toBe('professions');
    expect(paintedPage(el)).toBe(reliquaryPageName(NOTES_PAGE));
  });

  it('does not park focus on a page header when no jump armed it', () => {
    // A plain shelf open is not a jump: the reading position stays on Close.
    const { w, el } = makeWindow(baseState(), { open: false });
    w.open('conquerors');
    expect(document.activeElement).toBe(el.querySelector('[data-close]'));
  });
});

describe('in-window [data-page] rows share the jump', () => {
  it('the Overview recent chip lands on the relic page under its own rail', () => {
    const state = baseState();
    state.itemsDiscovered.add(CRYPT_RELIC);
    state.recent = [CRYPT_RELIC];
    const { w, el } = makeWindow(state);
    expect(w.isOpen).toBe(true);
    const chip = el.querySelector<HTMLElement>(`.reliquary-recent-item[data-page="${CRYPT_PAGE}"]`);
    expect(chip, 'the recent chip carries its page target').not.toBeNull();
    chip?.click();
    expect(activeNav(el)).toBe('conquerors');
    expect(paintedPage(el)).toBe(reliquaryPageName(CRYPT_PAGE));
  });

  it('an Overview nearly-complete row lands on its page under its own rail', () => {
    const state = baseState();
    // Four of the five Hollow Crypt relics: one remaining puts the page on the
    // nearly-complete strip.
    for (const relic of RELIQUARY_PAGES_BY_ID[CRYPT_PAGE]?.relics.slice(0, 4) ?? []) {
      if (relic.kind === 'item') state.itemsDiscovered.add(relic.itemId);
    }
    const { el } = makeWindow(state);
    const row = el.querySelector<HTMLElement>(`.reliquary-nearly-row[data-page="${CRYPT_PAGE}"]`);
    expect(row, 'the nearly strip holds the four-of-five page').not.toBeNull();
    row?.click();
    expect(activeNav(el)).toBe('conquerors');
    expect(paintedPage(el)).toBe(reliquaryPageName(CRYPT_PAGE));
  });

  it('keeps the needle the player typed (only the external jump clears it)', () => {
    // The in-window rows are navigation WITHIN a search the player is running;
    // wiping their needle on every row click would undo the narrowing they are
    // using to browse.
    const { w, el } = makeWindow(baseState(), { nav: 'conquerors' });
    const needle = reliquaryPageName(CRYPT_PAGE);
    typeSearch(el, needle);
    const row = el.querySelector<HTMLElement>(`.reliquary-page-row[data-page="${CRYPT_PAGE}"]`);
    expect(row, 'the shelf row survives its own page name as a needle').not.toBeNull();
    row?.click();
    expect(paintedPage(el)).toBe(reliquaryPageName(CRYPT_PAGE));
    expect(searchField(el).value).toBe(needle);
    // And it is navigation, not a deep link: no header focus grab.
    expect(document.activeElement).not.toBe(header(el));
    expect(w.isOpen).toBe(true);
  });
});
