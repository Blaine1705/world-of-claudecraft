// @vitest-environment happy-dom
//
// DOM behavioral guard for The Reliquary window: the real ReliquaryWindow driven
// over happy-dom with stub deps and the LIVE RELIQUARY_PAGES catalog (ownership
// is synthetic, the catalog never is, so a source line resolves through the same
// content the game ships). Ten behaviors: opener focus capture and return,
// data-focus-key restore across a rebuild, scroll preservation, refreshIfChanged
// elision plus per-dimension repaint, nav/page/back navigation, cell and chip
// tooltips, dialog-root labeling, search filtering, the owned/missing chips, and
// the roving grid tab stop.
//
// The source-scrape pins live in tests/reliquary_window.test.ts and the pure
// model in tests/reliquary_view.test.ts; this file asserts only what a player
// can observe, through the real code path.
//
// Every visible-text assertion compares against a LIVE t() / label-module call
// (reliquaryPageName, reliquaryPageDesc, reliquaryRelicDisplayName,
// reliquarySourceLineText), never hardcoded English: a locale fill must not turn
// a green pin red, and an English-only regression must not hide behind one.
// Where a test depends on a fact about the shipped catalog (a needle that lives
// in a page DESC but not its NAME, a relic the catalog leaves un-hinted), that
// fact is asserted as an explicit premise first, so content drift fails loudly
// instead of quietly making the test vacuous.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RELIQUARY_PAGES, RELIQUARY_PAGES_BY_ID } from '../src/sim/content/reliquary';
import { ITEMS } from '../src/sim/data';
import { esc } from '../src/ui/esc';
import { formatNumber, getLanguage, languageTag, t, tPlural } from '../src/ui/i18n';
import { reliquaryPageDesc, reliquaryPageName } from '../src/ui/reliquary_i18n';
import { reliquaryRelicDisplayName, reliquarySourceLineText } from '../src/ui/reliquary_labels';
import { reliquarySourceLinePlan } from '../src/ui/reliquary_view';
import {
  type ReliquaryNavId,
  ReliquaryWindow,
  type ReliquaryWindowDeps,
} from '../src/ui/reliquary_window';

// happy-dom ships no 2D canvas, so the procedural item-icon compositor cannot
// run here; the painter only ever uses the returned string as an <img src>. The
// kind and id are echoed into the URL rather than returned as a constant, so a
// cell painted from the wrong relic id fails a comparison instead of coming back
// byte-identical to its neighbour.
vi.mock('../src/ui/icons', () => ({
  iconDataUrl: (kind: string, id: string) => `data:,${kind}:${id}`,
}));

// The page every grid test drives: five item relics, a dungeon clear source, and
// a page-level sourceDefault, so its missing cells exercise the two-part
// "bossDungeon" source arm rather than the degenerate one.
const PAGE_ID = 'conquerors_hollow_crypt';
// A page the catalog deliberately leaves partly un-hinted, for the missing cell
// that must render NO source line rather than an invented one.
const UNHINTED_PAGE_ID = 'conquerors_gravewyrm_sanctum';

const TAG = languageTag(getLanguage());
const fmt = (n: number): string => formatNumber(n, { maximumFractionDigits: 0 });

const pageDef = (pageId: string) => {
  const def = RELIQUARY_PAGES_BY_ID[pageId];
  if (!def) throw new Error(`content premise: ${pageId} is a live Reliquary page`);
  return def;
};

/** Every item id on a page, in catalog order (the order the grid paints). */
function relicIds(pageId: string): string[] {
  return pageDef(pageId).relics.map((relic) => (relic.kind === 'item' ? relic.itemId : ''));
}

/** The localized source sentence the catalog authors for one slot, derived from
 *  the live page def through the same pure arm-picker the painter uses. */
function sourceTextFor(pageId: string, index: number): string {
  const def = pageDef(pageId);
  const relic = def.relics[index];
  if (!relic) throw new Error(`content premise: ${pageId} has a relic at ${index}`);
  const plan = reliquarySourceLinePlan(relic.source ?? def.sourceDefault, def.clearSource);
  return reliquarySourceLineText(plan ?? undefined);
}

// ---------------------------------------------------------------------------
// Stub world + deps
// ---------------------------------------------------------------------------

interface WorldState {
  itemsDiscovered: Set<string>;
  marks: Set<string>;
  recent: string[];
  firstFind: Record<string, { clears?: number; pageId?: string }>;
  mounts: string[];
  weaponSkinIds: string[];
  deedsEarned: Map<string, string>;
  /** reliquaryCatalogCompletion(): signature-only, so it can move alone. */
  catalog: { owned: number; total: number };
  /** reliquaryCuratorRank(): signature-only. */
  curatorRank: number;
  /** reliquaryPageClearCount(pageId). */
  clears: Map<string, number>;
  /** reliquaryPageCompletion(pageId).owned: signature-only. */
  pageOwned: Map<string, number>;
}

function baseState(): WorldState {
  return {
    itemsDiscovered: new Set(),
    marks: new Set(),
    recent: [],
    firstFind: {},
    mounts: [],
    weaponSkinIds: [],
    deedsEarned: new Map(),
    catalog: { owned: 0, total: 100 },
    curatorRank: 0,
    clears: new Map(),
    pageOwned: new Map(),
  };
}

interface Rig {
  w: ReliquaryWindow;
  el: HTMLElement;
  state: WorldState;
  /** The element deps.captureFocus hands back on open. */
  opener: HTMLElement;
  /** Every attachTooltip call, in order (newest last). */
  tooltips: Array<{ node: HTMLElement; html: () => string }>;
  /** Every deps.restoreFocus argument, in order. */
  restored: Array<HTMLElement | null>;
  counts: { closeOthers: number; hideTooltip: number; captureFocus: number };
}

function makeWindow(state: WorldState, opts: { open?: boolean; nav?: ReliquaryNavId } = {}): Rig {
  const el = document.createElement('div');
  el.id = 'reliquary-window';
  document.body.appendChild(el);
  const opener = document.createElement('button');
  opener.id = 'opener';
  document.body.appendChild(opener);

  const tooltips: Rig['tooltips'] = [];
  const restored: Rig['restored'] = [];
  const counts = { closeOthers: 0, hideTooltip: 0, captureFocus: 0 };

  const deps: ReliquaryWindowDeps = {
    root: () => el,
    world: () =>
      ({
        deedStats: { itemsDiscovered: state.itemsDiscovered },
        reliquaryMarks: state.marks,
        reliquaryRecent: state.recent,
        reliquaryFirstFind: state.firstFind,
        ownedMounts: () => state.mounts,
        accountCosmetics: { weaponSkinIds: state.weaponSkinIds },
        deedsEarned: state.deedsEarned,
        reliquaryPageClearCount: (pageId: string) => state.clears.get(pageId),
        reliquaryCatalogCompletion: () => state.catalog,
        reliquaryCuratorRank: () => state.curatorRank,
        reliquaryPageCompletion: (pageId: string) => {
          const owned = state.pageOwned.get(pageId);
          return owned === undefined ? null : { owned, total: 0, complete: false };
        },
      }) as never,
    closeOthers: () => {
      counts.closeOthers++;
    },
    hideTooltip: () => {
      counts.hideTooltip++;
    },
    consumePeek: () => false,
    captureFocus: () => {
      counts.captureFocus++;
      return opener;
    },
    restoreFocus: (target) => {
      restored.push(target);
    },
    itemIcon: (item) => `<img data-item-icon="${item.id}" alt="">`,
    moneyHtml: () => '',
    itemTooltip: (item) => `<div data-item-tooltip="${item.id}"></div>`,
    attachTooltip: (node, html) => {
      tooltips.push({ node, html });
    },
  };

  const w = new ReliquaryWindow(deps);
  if (opts.open !== false) w.open(opts.nav);
  return { w, el, state, opener, tooltips, restored, counts };
}

// ---------------------------------------------------------------------------
// Query + interaction helpers
// ---------------------------------------------------------------------------

const cells = (el: HTMLElement): HTMLElement[] => [
  ...el.querySelectorAll<HTMLElement>('.reliquary-cell'),
];
const pageIds = (el: HTMLElement): string[] =>
  [...el.querySelectorAll<HTMLElement>('[data-page]')].map((node) => node.dataset.page ?? '');
const liveRegion = (el: HTMLElement): HTMLElement | null =>
  el.querySelector<HTMLElement>('[data-reliquary-live]');
const searchField = (el: HTMLElement): HTMLInputElement => {
  const input = el.querySelector<HTMLInputElement>('.reliquary-search');
  if (!input) throw new Error('contract: .reliquary-search is the window search field');
  return input;
};
const must = (el: HTMLElement, selector: string): HTMLElement => {
  const node = el.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
};

/** Click without touching focus (the mouse shape). */
function click(el: HTMLElement, selector: string): HTMLElement {
  const node = must(el, selector);
  node.click();
  return node;
}

/** Focus then click: the keyboard Enter activation shape. */
function focusClick(el: HTMLElement, selector: string): HTMLElement {
  const node = must(el, selector);
  node.focus();
  node.click();
  return node;
}

/** Type into the search field the way a player does: focus, set, dispatch. */
function typeSearch(el: HTMLElement, value: string, range?: [number, number]): void {
  const input = searchField(el);
  input.focus();
  input.value = value;
  if (range) input.setSelectionRange(range[0], range[1]);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function keydown(node: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event;
}

/** The index of the single roving tab stop, asserting the roving invariant on
 *  the way through: exactly one cell at 0 and every other at -1. */
function tabStopIndex(el: HTMLElement): number {
  const stops = cells(el).map((node) => node.tabIndex);
  expect(
    stops.filter((v) => v === 0),
    'exactly one grid cell is a tab stop',
  ).toHaveLength(1);
  expect(
    stops.every((v) => v === 0 || v === -1),
    'every non-stop cell is -1 (reachable by Arrow keys only)',
  ).toBe(true);
  return stops.indexOf(0);
}

/** The most recent tooltip callback attached to `node`, or null. Renders are
 *  full rebuilds, so a node from the current paint can never collide with a
 *  stale entry from a previous one. */
function tooltipFor(rig: Rig, node: HTMLElement): (() => string) | null {
  for (let i = rig.tooltips.length - 1; i >= 0; i--) {
    const entry = rig.tooltips[i];
    if (entry && entry.node === node) return entry.html;
  }
  return null;
}

/** Record every raw markup string the painter assigns to el.innerHTML while
 *  `run` executes. The live region's contract is that it is EMITTED empty and
 *  written after insertion, which is only observable in the pre-insertion
 *  string: by the time the DOM settles the announcement is already in place. */
function captureRawMarkup(el: HTMLElement, run: () => void): string[] {
  const seen: string[] = [];
  let proto: object | null = Object.getPrototypeOf(el);
  let desc: PropertyDescriptor | undefined;
  while (proto !== null && desc === undefined) {
    desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    proto = Object.getPrototypeOf(proto);
  }
  const getter = desc?.get;
  const setter = desc?.set;
  if (!getter || !setter) {
    throw new Error('contract: innerHTML is an accessor somewhere on the prototype chain');
  }
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get: () => getter.call(el),
    set: (value: string) => {
      seen.push(String(value));
      setter.call(el, value);
    },
  });
  try {
    run();
  } finally {
    delete (el as unknown as Record<string, unknown>).innerHTML;
  }
  return seen;
}

/** Open the window straight onto a page grid. */
function openPage(state: WorldState, pageId = PAGE_ID): Rig {
  const rig = makeWindow(state, { nav: 'conquerors' });
  click(rig.el, `[data-page="${pageId}"]`);
  return rig;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// 1. Open/close focus capture and return
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: opener focus capture and return', () => {
  it('captures the opener on open and hands the SAME element back on close', () => {
    const rig = makeWindow(baseState(), { open: false });
    rig.opener.focus();
    rig.w.open();
    expect(rig.counts.captureFocus).toBe(1);
    expect(rig.restored).toHaveLength(0);
    rig.w.close();
    // Identity, not truthiness: a window that restored SOME element (or null)
    // would strand the keyboard player somewhere other than where they were.
    expect(rig.restored).toEqual([rig.opener]);
  });

  it('focuses the Close button on cold open so a keyboard user enters the dialog', () => {
    const rig = makeWindow(baseState());
    expect(document.activeElement).toBe(rig.el.querySelector('[data-close]'));
  });

  it('closes the sibling windows exactly once, on the cold open only', () => {
    const rig = makeWindow(baseState());
    expect(rig.counts.closeOthers).toBe(1);
    rig.w.open('conquerors');
    expect(rig.counts.closeOthers).toBe(1);
  });

  it('does not re-capture the opener when open() lands on an already-open window', () => {
    const rig = makeWindow(baseState(), { open: false });
    rig.opener.focus();
    rig.w.open();
    // A second open() (the minimap click, a keybind press) repaints but must not
    // overwrite the captured opener with whatever holds focus now, or close will
    // hand the player back to a control inside the window it just closed.
    must(rig.el, '[data-close]').focus();
    rig.w.open('horizons');
    expect(rig.counts.captureFocus).toBe(1);
    rig.w.close();
    expect(rig.restored).toEqual([rig.opener]);
  });

  it('ignores close() on an already-closed window (no second restore)', () => {
    const rig = makeWindow(baseState());
    rig.w.close();
    rig.w.close();
    expect(rig.restored).toHaveLength(1);
    expect(rig.w.isOpen).toBe(false);
  });

  it('hides the shared tooltip on close so no card outlives the window', () => {
    const rig = makeWindow(baseState());
    const before = rig.counts.hideTooltip;
    rig.w.close();
    expect(rig.counts.hideTooltip).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// 2. data-focus-key restore across a rebuild
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: focus survives a rebuild', () => {
  it('keeps focus on the same filter chip across a data-driven rebuild', () => {
    const rig = openPage(baseState());
    const before = must(rig.el, '[data-filter="owned"]');
    before.focus();
    rig.state.curatorRank = 3;
    rig.w.refreshIfChanged();
    const fresh = must(rig.el, '[data-filter="owned"]');
    expect(fresh).not.toBe(before);
    expect(document.activeElement).toBe(fresh);
  });

  it('keeps focus on the same shelf page row across a data-driven rebuild', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const before = must(rig.el, `[data-page="${PAGE_ID}"]`);
    before.focus();
    rig.state.curatorRank = 2;
    rig.w.refreshIfChanged();
    const fresh = must(rig.el, `[data-page="${PAGE_ID}"]`);
    expect(fresh).not.toBe(before);
    expect(document.activeElement).toBe(fresh);
  });

  it('keeps focus on the back button across a data-driven rebuild', () => {
    const rig = openPage(baseState());
    const before = must(rig.el, '[data-back]');
    before.focus();
    rig.state.curatorRank = 4;
    rig.w.refreshIfChanged();
    const fresh = must(rig.el, '[data-back]');
    expect(fresh).not.toBe(before);
    expect(document.activeElement).toBe(fresh);
  });

  it('never pulls focus into the window when the repaint finds it elsewhere', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    rig.state.curatorRank = 2;
    rig.w.refreshIfChanged();
    // The slow band repaints in the background whether or not the player is
    // looking at this window. A painter that restored focus unconditionally
    // would yank them out of the chat box every time an unlock landed.
    expect(document.activeElement).toBe(outside);
  });

  it('falls back to Close when the focused control is gone after the rebuild', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    // Four of five owned puts the page on the nearly-complete strip; owning the
    // fifth completes it, so the row the player is standing on is destroyed by
    // a rebuild they did not initiate.
    for (const id of ids.slice(0, 4)) state.itemsDiscovered.add(id);
    const rig = makeWindow(state, { nav: 'overview' });
    const before = must(rig.el, `[data-focus-key="nearly:${PAGE_ID}"]`);
    before.focus();
    state.itemsDiscovered.add(ids[4] ?? '');
    rig.w.refreshIfChanged();
    expect(rig.el.querySelector(`[data-focus-key="nearly:${PAGE_ID}"]`)).toBeNull();
    const after = document.activeElement as HTMLElement | null;
    expect(after?.hasAttribute('data-close')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Scroll preservation
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: scroll preservation', () => {
  it('preserves the scroll offset across a data-driven rebuild', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const scroll = rig.el.querySelector<HTMLElement>('.reliquary-scroll');
    if (!scroll) throw new Error('contract: .reliquary-scroll is the window scroll container');
    scroll.scrollTop = 140;
    rig.state.curatorRank = 5;
    rig.w.refreshIfChanged();
    const fresh = rig.el.querySelector<HTMLElement>('.reliquary-scroll');
    // Node identity proves the container really was rebuilt, so a preserved
    // offset is a carry rather than an untouched element.
    expect(fresh).not.toBe(scroll);
    expect(fresh?.scrollTop).toBe(140);
  });

  it('preserves the scroll offset across a page grid rebuild', () => {
    const rig = openPage(baseState());
    const scroll = must(rig.el, '.reliquary-scroll');
    scroll.scrollTop = 96;
    rig.state.clears.set(PAGE_ID, 11);
    rig.w.refreshIfChanged();
    const fresh = must(rig.el, '.reliquary-scroll');
    expect(fresh).not.toBe(scroll);
    expect(fresh.scrollTop).toBe(96);
  });
});

// ---------------------------------------------------------------------------
// 4. refreshIfChanged elision + per-dimension repaint
// ---------------------------------------------------------------------------

/**
 * Both directions for one signature dimension: an unchanged world must elide,
 * and the mutation must repaint. Asserting only the repaint half would pass on
 * a painter that rebuilt unconditionally.
 */
function expectDimension(rig: Rig, label: string, mutate: () => void): void {
  const settled = rig.el.firstElementChild;
  rig.w.refreshIfChanged();
  expect(rig.el.firstElementChild, `${label}: an unchanged signature must elide`).toBe(settled);
  mutate();
  rig.w.refreshIfChanged();
  expect(rig.el.firstElementChild, `${label}: the changed dimension must repaint`).not.toBe(
    settled,
  );
}

describe('ReliquaryWindow: refreshIfChanged elision and per-dimension repaint', () => {
  it('performs no DOM writes when the refresh signature is unchanged', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    // Deliberately NO leading refreshIfChanged() to settle a catch-up repaint:
    // render() latches lastSig at its END, so an open window is already settled
    // and the first poll must elide. A settling call here would mask exactly the
    // latch regression this test exists to catch.
    const closeBtn = rig.el.querySelector('[data-close]');
    const firstChild = rig.el.firstElementChild;
    const html = rig.el.innerHTML;
    rig.w.refreshIfChanged();
    rig.w.refreshIfChanged();
    // Node identity is the decisive check: a rebuild replaces every child even
    // when the markup comes back byte-identical.
    expect(rig.el.querySelector('[data-close]')).toBe(closeBtn);
    expect(rig.el.firstElementChild).toBe(firstChild);
    expect(rig.el.innerHTML).toBe(html);
  });

  it('does nothing at all while the window is closed', () => {
    const rig = makeWindow(baseState());
    rig.w.close();
    const html = rig.el.innerHTML;
    rig.state.curatorRank = 4;
    rig.state.catalog = { owned: 40, total: 100 };
    rig.w.refreshIfChanged();
    expect(rig.el.innerHTML).toBe(html);
  });

  it('repaints on each world-driven signature dimension, one at a time', () => {
    const state = baseState();
    state.pageOwned.set(PAGE_ID, 1);
    const rig = openPage(state);

    // Catalog completion, curator rank, and page completion feed ONLY the
    // signature (the painted progress is recomputed by the pure core from the
    // ownership sets), so each of these moves the signature and nothing else:
    // a repaint is proof the dimension is carried.
    expectDimension(rig, 'catalog owned', () => {
      state.catalog = { owned: state.catalog.owned + 1, total: state.catalog.total };
    });
    expectDimension(rig, 'catalog total', () => {
      state.catalog = { owned: state.catalog.owned, total: state.catalog.total + 1 };
    });
    expectDimension(rig, 'curator rank', () => {
      state.curatorRank += 1;
    });
    expectDimension(rig, 'active page owned', () => {
      state.pageOwned.set(PAGE_ID, (state.pageOwned.get(PAGE_ID) ?? 0) + 1);
    });
    expectDimension(rig, 'page clear count', () => {
      state.clears.set(PAGE_ID, (state.clears.get(PAGE_ID) ?? 0) + 1);
    });
    expectDimension(rig, 'recent find ring', () => {
      state.recent.push('cryptbone_helm');
    });
    expectDimension(rig, 'marks', () => {
      state.marks.add('masterwork:blacksmithing');
    });
    expectDimension(rig, 'items discovered', () => {
      state.itemsDiscovered.add(relicIds(PAGE_ID)[0] ?? '');
    });
    expectDimension(rig, 'first-find meta', () => {
      state.firstFind[relicIds(PAGE_ID)[1] ?? ''] = { clears: 3 };
    });
  });

  it('latches the new painter state so an interaction is not followed by a second paint', () => {
    // nav, pageId, search, and the ownership chip are PAINTER state: each is
    // changed only by a handler that calls render() unconditionally, so the
    // observable contract is this pair rather than a signature diff. The
    // interaction repaints, and that repaint latches the new state, so the next
    // slow-band poll elides instead of throwing away the focus and scroll the
    // rebuild just restored.
    const rig = makeWindow(baseState());
    const steps: Array<[string, () => void]> = [
      ['nav', () => click(rig.el, '[data-nav="conquerors"]')],
      ['pageId', () => click(rig.el, `[data-page="${PAGE_ID}"]`)],
      ['ownedFilter', () => click(rig.el, '[data-filter="missing"]')],
      ['search', () => typeSearch(rig.el, 'crypt')],
      ['back', () => click(rig.el, '[data-back]')],
    ];
    for (const [label, act] of steps) {
      const before = rig.el.firstElementChild;
      act();
      expect(rig.el.firstElementChild, `${label}: the interaction repaints`).not.toBe(before);
      const painted = rig.el.firstElementChild;
      rig.w.refreshIfChanged();
      expect(rig.el.firstElementChild, `${label}: the repaint latched the signature`).toBe(painted);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Nav / page / back navigation
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: nav, page, and back navigation', () => {
  it('switches shelves on a rail click and marks the active one pressed', () => {
    const rig = makeWindow(baseState());
    expect(rig.el.querySelector('.reliquary-overview')).not.toBeNull();
    click(rig.el, '[data-nav="conquerors"]');
    const expected = RELIQUARY_PAGES.filter((p) => p.shelf === 'conquerors').map((p) => p.id);
    expect(pageIds(rig.el)).toEqual(expected);
    expect(must(rig.el, '[data-nav="conquerors"]').getAttribute('aria-pressed')).toBe('true');
    expect(must(rig.el, '[data-nav="horizons"]').getAttribute('aria-pressed')).toBe('false');
    expect(rig.el.querySelector('.reliquary-overview')).toBeNull();
  });

  it('gives the shelf list real ul/li semantics with the blurb as a second line', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const list = must(rig.el, 'ul.reliquary-page-list');
    expect(list.getAttribute('role')).toBe('list');
    const row = must(rig.el, `[data-page="${PAGE_ID}"]`);
    expect(row.closest('li.reliquary-page-item')).not.toBeNull();
    expect(must(row, '.reliquary-page-name').textContent).toBe(reliquaryPageName(PAGE_ID));
    const desc = reliquaryPageDesc(PAGE_ID);
    expect(desc, 'content premise: the page authors a blurb').not.toBe('');
    expect(must(row, '.reliquary-page-sub').textContent).toBe(desc);
  });

  it('opens the page detail on a row click, with the localized name and blurb', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    click(rig.el, `[data-page="${PAGE_ID}"]`);
    expect(must(rig.el, '.reliquary-page-title').textContent).toBe(reliquaryPageName(PAGE_ID));
    expect(must(rig.el, '.reliquary-page-desc').textContent).toBe(reliquaryPageDesc(PAGE_ID));
    expect(rig.el.querySelector('.reliquary-page-list')).toBeNull();
    expect(cells(rig.el)).toHaveLength(relicIds(PAGE_ID).length);
    expect(rig.el.querySelector('[data-back]')).not.toBeNull();
  });

  it('clears the open page when the rail moves to another shelf', () => {
    const rig = openPage(baseState());
    expect(rig.el.querySelector('.reliquary-page-detail')).not.toBeNull();
    click(rig.el, '[data-nav="horizons"]');
    // A shelf switch is a navigation, not an overlay. The page detail resolves
    // its header from the WHOLE catalog when the id is not on the active shelf,
    // so a stale pageId here would leave a Conquerors page rendered under the
    // Horizons rail rather than failing loudly.
    expect(rig.el.querySelector('.reliquary-page-detail')).toBeNull();
    expect(pageIds(rig.el)).toEqual(
      RELIQUARY_PAGES.filter((p) => p.shelf === 'horizons').map((p) => p.id),
    );
  });

  it('returns to the shelf list on back, keeping the shelf it came from', () => {
    const rig = openPage(baseState());
    click(rig.el, '[data-back]');
    expect(rig.el.querySelector('.reliquary-page-detail')).toBeNull();
    expect(must(rig.el, '[data-nav="conquerors"]').getAttribute('aria-pressed')).toBe('true');
    expect(pageIds(rig.el)).toContain(PAGE_ID);
  });

  it('follows an Overview nearly-complete row onto that page and its shelf', () => {
    const state = baseState();
    for (const id of relicIds(PAGE_ID).slice(0, 4)) state.itemsDiscovered.add(id);
    const rig = makeWindow(state, { nav: 'overview' });
    click(rig.el, `[data-focus-key="nearly:${PAGE_ID}"]`);
    // The jump crosses shelves: the rail must follow the page, not stay on the
    // Overview the player launched from.
    expect(must(rig.el, '.reliquary-page-title').textContent).toBe(reliquaryPageName(PAGE_ID));
    expect(must(rig.el, '[data-nav="conquerors"]').getAttribute('aria-pressed')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 6. Tooltips and the keyboard-parity aria labels
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: cell tooltips and aria labels', () => {
  it('attaches a tooltip to every grid cell', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    expect(grid.length).toBeGreaterThan(0);
    for (const node of grid) {
      expect(tooltipFor(rig, node), `cell ${node.dataset.cellId} has a tooltip`).not.toBeNull();
    }
  });

  it('tells a missing cell where the relic comes from, in tooltip AND label', () => {
    const rig = openPage(baseState());
    const id = relicIds(PAGE_ID)[0] ?? '';
    const node = must(rig.el, `[data-cell-id="${id}"]`);
    expect(node.dataset.cellOwned).toBe('0');
    const name = reliquaryRelicDisplayName('item', id);
    const source = sourceTextFor(PAGE_ID, 0);
    expect(source, 'content premise: this page authors a source hint').not.toBe('');

    const html = tooltipFor(rig, node)?.() ?? '';
    expect(html).toContain(esc(name));
    expect(html).toContain(esc(t('hudChrome.reliquary.missingTooltipStatus')));
    expect(html).toContain(esc(source));
    // Keyboard parity: the label carries the same hunting directions the hover
    // card does, so nothing actionable is mouse-only.
    expect(node.getAttribute('aria-label')).toBe(
      t('hudChrome.reliquary.cellMissingSourceAria', { name, source }),
    );
  });

  it('renders no source line at all for a relic the catalog leaves un-hinted', () => {
    const rig = openPage(baseState(), UNHINTED_PAGE_ID);
    const def = pageDef(UNHINTED_PAGE_ID);
    expect(
      def.sourceDefault,
      'content premise: the page authors no default source',
    ).toBeUndefined();
    const index = def.relics.findIndex((relic) => relic.source === undefined);
    expect(index, 'content premise: the page holds an un-hinted relic').toBeGreaterThanOrEqual(0);
    const id =
      def.relics[index]?.kind === 'item' ? (def.relics[index] as { itemId: string }).itemId : '';
    const node = must(rig.el, `[data-cell-id="${id}"]`);
    const name = reliquaryRelicDisplayName('item', id);
    // The un-hinted arm: the authored "not found yet" copy and nothing invented
    // in its place.
    expect(node.getAttribute('aria-label')).toBe(
      t('hudChrome.reliquary.cellMissingAria', { name }),
    );
    const html = tooltipFor(rig, node)?.() ?? '';
    expect(html).toContain(esc(t('hudChrome.reliquary.missingTooltipStatus')));
    expect(html).toContain(esc(name));
  });

  it('serves the full item tooltip for an owned item relic', () => {
    const state = baseState();
    const id = relicIds(PAGE_ID)[1] ?? '';
    state.itemsDiscovered.add(id);
    const rig = openPage(state);
    const node = must(rig.el, `[data-cell-id="${id}"]`);
    expect(node.dataset.cellOwned).toBe('1');
    // Exact equality, against a stub that echoes the id it was handed: this
    // fails both if the painter stops delegating and if it delegates the wrong
    // ItemDef.
    expect(tooltipFor(rig, node)?.()).toBe(`<div data-item-tooltip="${id}"></div>`);
    expect(ITEMS[id], 'content premise: the relic is a catalogued item').toBeDefined();
    expect(node.getAttribute('aria-label')).toBe(
      t('hudChrome.reliquary.cellOwnedAria', { name: reliquaryRelicDisplayName('item', id) }),
    );
  });

  it('adds the first-find clear number to an owned relic that has one', () => {
    const state = baseState();
    const id = relicIds(PAGE_ID)[2] ?? '';
    state.itemsDiscovered.add(id);
    state.firstFind[id] = { clears: 7 };
    const rig = openPage(state);
    const node = must(rig.el, `[data-cell-id="${id}"]`);
    const clearsLine = t('hudChrome.reliquary.firstFindClears', { count: fmt(7) });
    const html = tooltipFor(rig, node)?.() ?? '';
    expect(html).toContain(`<div data-item-tooltip="${id}"></div>`);
    expect(html).toContain(esc(clearsLine));
    expect(node.getAttribute('aria-label')).toBe(
      t('hudChrome.reliquary.cellOwnedClearsAria', {
        name: reliquaryRelicDisplayName('item', id),
        count: fmt(7),
      }),
    );
  });

  it('gives every recent-strip chip its full localized name through the shared tooltip', () => {
    const state = baseState();
    const id = relicIds(PAGE_ID)[0] ?? '';
    state.recent.push(id);
    const rig = makeWindow(state, { nav: 'overview' });
    const chip = must(rig.el, '.reliquary-recent-item');
    const name = reliquaryRelicDisplayName('item', id);
    expect(chip.dataset.recentName).toBe(name);
    expect(tooltipFor(rig, chip)?.()).toContain(esc(name));
  });

  it('never uses a native title attribute anywhere in the window', () => {
    const state = baseState();
    state.recent.push(relicIds(PAGE_ID)[0] ?? '');
    state.itemsDiscovered.add(relicIds(PAGE_ID)[1] ?? '');
    const overview = makeWindow(state, { nav: 'overview' });
    expect(overview.el.innerHTML).not.toContain('title=');
    const page = openPage(baseState());
    expect(page.el.innerHTML).not.toContain('title=');
  });
});

// ---------------------------------------------------------------------------
// 7. Dialog root labeling
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: dialog root labeling', () => {
  it('marks the root a named dialog with exactly one accessible name', () => {
    const rig = makeWindow(baseState());
    expect(rig.el.getAttribute('role')).toBe('dialog');
    expect(rig.el.getAttribute('aria-modal')).toBe('false');
    expect(rig.el.getAttribute('tabindex')).toBe('-1');
    expect(rig.el.getAttribute('aria-label')).toBe(t('hudChrome.reliquary.title'));
    // aria-labelledby SHADOWS aria-label, so carrying both would leave the root
    // with a name nobody authored.
    expect(rig.el.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('localizes the visible title, the close button, and the search field', () => {
    const rig = makeWindow(baseState());
    expect(must(rig.el, '.panel-title span').textContent).toBe(t('hudChrome.reliquary.title'));
    expect(must(rig.el, '[data-close]').getAttribute('aria-label')).toBe(
      t('hudChrome.reliquary.close'),
    );
    const input = searchField(rig.el);
    expect(input.getAttribute('placeholder')).toBe(t('hudChrome.reliquary.searchPlaceholder'));
    expect(input.getAttribute('aria-label')).toBe(t('hudChrome.reliquary.searchAria'));
    expect(input.type).toBe('search');
  });

  it('describes the roving keys on every CELL, where a description is announced', () => {
    const rig = openPage(baseState());
    const grid = must(rig.el, '.reliquary-grid');
    expect(grid.getAttribute('role')).toBe('list');
    // The hint SPAN still ships with the grid (it is the describedby target),
    // but the references live on the cells: aria-describedby is announced from
    // the FOCUSED element, and a role="list" container never takes focus here,
    // so pointing it at the grid would describe something nobody lands on.
    const hint = must(rig.el, '#reliquary-grid-hint');
    expect(hint.textContent).toBe(t('hudChrome.reliquary.gridKeyboardHint'));
    const all = cells(rig.el);
    expect(all.length).toBeGreaterThan(1);
    for (const cell of all) {
      expect(cell.getAttribute('aria-describedby')).toBe('reliquary-grid-hint');
      // aria-keyshortcuts takes key VALUES, never localized prose, and must
      // name exactly the keys roving_index owns for orientation 'both'.
      expect(cell.getAttribute('aria-keyshortcuts')).toBe(
        'ArrowLeft ArrowRight ArrowUp ArrowDown Home End',
      );
    }
    // And the grid itself no longer carries them, or a screen reader would
    // read the same hint twice on entering the list.
    expect(grid.getAttribute('aria-describedby')).toBeNull();
    expect(grid.getAttribute('aria-keyshortcuts')).toBeNull();
  });

  it('labels the filter chips and both lists with real localized text', () => {
    // Every visible chip label and every list name is a t() key, not a literal
    // that happens to read as English. Compared against live t() calls so a
    // catalog reword moves both sides together instead of pinning stale copy.
    const rig = openPage(baseState());
    const chipText = (filter: string) => must(rig.el, `[data-filter="${filter}"]`).textContent;
    expect(chipText('all')).toBe(t('hudChrome.reliquary.filterAll'));
    expect(chipText('owned')).toBe(t('hudChrome.reliquary.filterOwned'));
    expect(chipText('missing')).toBe(t('hudChrome.reliquary.filterMissing'));
    expect(must(rig.el, '.reliquary-filterbar').getAttribute('role')).toBe('group');
    expect(must(rig.el, '.reliquary-filterbar').getAttribute('aria-label')).toBe(
      t('hudChrome.reliquary.filterGroupAria'),
    );
    // The shelf list names the shelf it is listing.
    const shelf = makeWindow(baseState(), { nav: 'conquerors' });
    const list = must(shelf.el, '.reliquary-page-list');
    expect(list.tagName).toBe('UL');
    expect(list.getAttribute('role')).toBe('list');
    expect(list.getAttribute('aria-label')).toBe(t('hudChrome.reliquary.navConquerors'));
  });

  it('names the right CAUSE in every empty state', () => {
    // Three different reasons a surface can be empty, three different lines. A
    // player who clicked Catalogued and never typed must not be told their
    // search matched nothing: they would go looking for a search box to clear.
    const emptyText = (el: HTMLElement) => must(el, '.reliquary-empty').textContent;

    // 1. Grid emptied by the CHIP alone, no needle typed.
    const chipOnly = openPage(baseState());
    click(chipOnly.el, '[data-filter="owned"]');
    expect(cells(chipOnly.el)).toHaveLength(0);
    expect(searchField(chipOnly.el).value).toBe('');
    expect(emptyText(chipOnly.el)).toBe(t('hudChrome.reliquary.filterEmpty'));

    // 2. Grid emptied by a SEARCH that matches nothing.
    const gridMiss = openPage(baseState());
    typeSearch(gridMiss.el, 'zzz_no_such_relic');
    expect(cells(gridMiss.el)).toHaveLength(0);
    expect(emptyText(gridMiss.el)).toBe(t('hudChrome.reliquary.searchEmpty'));

    // 3. Shelf list emptied by a search that matches no page AND no relic.
    const shelfMiss = makeWindow(baseState(), { nav: 'conquerors' });
    typeSearch(shelfMiss.el, 'zzz_no_such_page');
    expect(pageIds(shelfMiss.el)).toEqual([]);
    expect(emptyText(shelfMiss.el)).toBe(t('hudChrome.reliquary.searchEmpty'));

    // Search beats the chip when both are engaged: it is the narrowing the
    // player just performed.
    const both = openPage(baseState());
    click(both.el, '[data-filter="owned"]');
    typeSearch(both.el, 'zzz_no_such_relic');
    expect(emptyText(both.el)).toBe(t('hudChrome.reliquary.searchEmpty'));
  });

  it('omits the grid hint entirely when the grid is empty', () => {
    const rig = openPage(baseState());
    click(rig.el, '[data-filter="owned"]');
    expect(cells(rig.el)).toHaveLength(0);
    expect(rig.el.querySelector('#reliquary-grid-hint')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Search filtering
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: search filtering', () => {
  it('narrows the shelf list on a needle that lives only in a page BLURB', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const all = pageIds(rig.el);
    const needle = 'morthen';
    // Premises, so content drift fails loudly rather than making this vacuous:
    // the needle must be absent from the NAME and present in the DESC, which is
    // what makes the row's survival proof that the blurb is searchable.
    expect(reliquaryPageName(PAGE_ID).toLocaleLowerCase(TAG)).not.toContain(needle);
    expect(reliquaryPageDesc(PAGE_ID).toLocaleLowerCase(TAG)).toContain(needle);

    typeSearch(rig.el, needle);
    const shown = pageIds(rig.el);
    expect(shown).toContain(PAGE_ID);
    expect(shown.length).toBeLessThan(all.length);
    const expected = RELIQUARY_PAGES.filter(
      (p) =>
        p.shelf === 'conquerors' &&
        `${reliquaryPageName(p.id)} ${reliquaryPageDesc(p.id)}`
          .toLocaleLowerCase(TAG)
          .includes(needle),
    ).map((p) => p.id);
    expect(shown).toEqual(expected);
  });

  it('narrows an open page grid to the relics whose localized names match', () => {
    const rig = openPage(baseState());
    const ids = relicIds(PAGE_ID);
    const needle = 'cryptbone';
    const expected = ids.filter((id) =>
      reliquaryRelicDisplayName('item', id).toLocaleLowerCase(TAG).includes(needle),
    );
    expect(expected.length, 'content premise: some relic names match').toBeGreaterThan(0);
    expect(expected.length, 'content premise: not all of them do').toBeLessThan(ids.length);

    typeSearch(rig.el, needle);
    expect(cells(rig.el).map((node) => node.dataset.cellId)).toEqual(expected);
  });

  it('treats a whitespace-only needle as no search at all', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const all = pageIds(rig.el);
    typeSearch(rig.el, '   ');
    expect(pageIds(rig.el)).toEqual(all);
    // And the announcement stays silent: a surface that is empty for an
    // unrelated reason must not be described as a narrowed result set.
    expect(liveRegion(rig.el)?.textContent).toBe('');
  });

  it('carries the caret across the rebuild so typing mid-word does not jump', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const before = searchField(rig.el);
    typeSearch(rig.el, 'hollow crypt', [2, 5]);
    const fresh = searchField(rig.el);
    expect(fresh).not.toBe(before);
    expect(document.activeElement).toBe(fresh);
    expect(fresh.value).toBe('hollow crypt');
    // Both ends, not just the start: a rebuild that dropped the range would
    // land the caret at 0 or at the end of the value, never at 2..5.
    expect([fresh.selectionStart, fresh.selectionEnd]).toEqual([2, 5]);
  });

  it('announces the surviving count only while a narrowing control is engaged', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    expect(liveRegion(rig.el)?.textContent).toBe('');
    typeSearch(rig.el, 'morthen');
    const count = pageIds(rig.el).length;
    expect(count).toBeGreaterThan(0);
    expect(liveRegion(rig.el)?.textContent).toBe(
      tPlural('hudChrome.plurals.reliquarySearchResults', count, { count: fmt(count) }),
    );
  });

  it('announces the count for the ownership chip too, with no search typed', () => {
    const state = baseState();
    state.itemsDiscovered.add(relicIds(PAGE_ID)[0] ?? '');
    const rig = openPage(state);
    expect(liveRegion(rig.el)?.textContent).toBe('');
    click(rig.el, '[data-filter="owned"]');
    const count = cells(rig.el).length;
    expect(count).toBe(1);
    expect(liveRegion(rig.el)?.textContent).toBe(
      tPlural('hudChrome.plurals.reliquarySearchResults', count, { count: fmt(count) }),
    );
  });

  it('keeps ONE live-region node alive across rebuilds, never re-minting it', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    const before = liveRegion(rig.el);
    expect(before, 'the region exists from the first paint').toBeTruthy();

    const markup = captureRawMarkup(rig.el, () => {
      typeSearch(rig.el, 'morthen');
    });
    const raw = markup.at(-1) ?? '';
    expect(raw, 'the painter rebuilds the whole subtree on a keystroke').not.toBe('');
    // A live region must be REGISTERED with the AT before its text changes. A
    // node created and mutated inside the same task does not reliably announce,
    // so the region must not be part of the rebuilt markup at all.
    expect(raw).not.toMatch(/data-reliquary-live/);
    // Node IDENTITY is the real contract, and it is strictly stronger than the
    // old "shipped empty" pin: emitting an empty span into the markup would
    // satisfy that one while still handing the AT a brand-new node each paint.
    const after = liveRegion(rig.el);
    expect(after).toBe(before);
    expect(after?.isConnected, 'still attached after the rebuild').toBe(true);
    expect(after?.textContent).not.toBe('');
  });

  it('re-announces an identical count so a second keystroke is not silent', () => {
    const rig = makeWindow(baseState(), { nav: 'conquerors' });
    typeSearch(rig.el, 'morthen');
    const first = liveRegion(rig.el)?.textContent ?? '';
    expect(first).not.toBe('');
    // A needle that narrows to the SAME count would otherwise leave textContent
    // byte-identical, and an unchanged live region is silent on a screen reader.
    typeSearch(rig.el, 'morthen ');
    const second = liveRegion(rig.el)?.textContent ?? '';
    expect(second).not.toBe(first);
    // The marker is invisible: it must not change how the line READS.
    expect(second.trim()).toBe(first.trim());
  });

  it('goes silent again when Back leaves a page whose chip is still set', () => {
    const state = baseState();
    state.itemsDiscovered.add(relicIds(PAGE_ID)[0] ?? '');
    const rig = openPage(state);
    click(rig.el, '[data-filter="owned"]');
    expect(liveRegion(rig.el)?.textContent).not.toBe('');

    // ownedFilter is sticky for the session, so a gate that read the CHIP would
    // keep announcing a count on the shelf that nothing narrowed, on every
    // slow-band repaint. The gate reads what THIS paint narrowed instead. (The
    // chip row lives inside the page detail, so it is gone from the shelf; its
    // persistence is proven by re-entering the page below.)
    click(rig.el, '[data-back]');
    expect(rig.el.querySelector('.reliquary-filterbar')).toBeNull();
    expect(liveRegion(rig.el)?.textContent).toBe('');
    rig.w.render();
    expect(liveRegion(rig.el)?.textContent).toBe('');

    // Re-entering the page: the chip really did survive, and the announcement
    // comes back with it, so the silence above was the gate and not a reset.
    click(rig.el, `[data-page="${PAGE_ID}"]`);
    expect(must(rig.el, '[data-filter="owned"]').getAttribute('aria-pressed')).toBe('true');
    expect(liveRegion(rig.el)?.textContent).not.toBe('');
  });

  it('does not re-announce an unchanged count on a world-driven repaint', () => {
    const state = baseState();
    state.itemsDiscovered.add(relicIds(PAGE_ID)[0] ?? '');
    const rig = openPage(state);
    click(rig.el, '[data-filter="missing"]');
    const announced = liveRegion(rig.el)?.textContent ?? '';
    expect(announced).not.toBe('');

    // A slow-band signature move while the window sits open (a relic from a
    // DIFFERENT page catalogued, so this grid's count is untouched) repaints,
    // and the marker returns byte-different text for identical input on
    // purpose: writing it here would make the reader re-read "N results." on
    // a world event the player never asked about. The repaint itself is
    // proven by node identity so elision cannot satisfy this vacuously; the
    // player-driven re-mark is the previous test.
    const settled = rig.el.firstElementChild;
    state.itemsDiscovered.add(relicIds('conquerors_sunken_bastion')[0] ?? '');
    rig.w.refreshIfChanged();
    expect(rig.el.firstElementChild, 'the world change must really repaint').not.toBe(settled);
    expect(liveRegion(rig.el)?.textContent).toBe(announced);
  });

  it('announces the Overview strips when a needle narrows them', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    state.recent.push(ids[0] ?? '', ids[3] ?? '');
    const rig = makeWindow(state, { nav: 'overview' });
    expect(liveRegion(rig.el)?.textContent).toBe('');
    const needle = reliquaryRelicDisplayName('item', ids[0] ?? '').toLocaleLowerCase(TAG);
    typeSearch(rig.el, needle);
    const shown =
      rig.el.querySelectorAll('.reliquary-recent-item').length +
      rig.el.querySelectorAll('.reliquary-nearly-row').length;
    expect(liveRegion(rig.el)?.textContent).toBe(
      tPlural('hudChrome.plurals.reliquarySearchResults', shown, { count: fmt(shown) }),
    );
  });

  it('clears the search per visit but keeps the chip, shelf, and page for the session', () => {
    const state = baseState();
    state.itemsDiscovered.add(relicIds(PAGE_ID)[0] ?? '');
    const rig = openPage(state);
    click(rig.el, '[data-filter="missing"]');
    typeSearch(rig.el, 'cryptbone');
    expect(searchField(rig.el).value).toBe('cryptbone');

    rig.w.close();
    rig.w.open();
    // A needle typed last visit must not silently hide most of the catalog on
    // the next open; the chip, shelf, and open page read as "where I was" and
    // stay put.
    expect(searchField(rig.el).value).toBe('');
    expect(must(rig.el, '.reliquary-page-title').textContent).toBe(reliquaryPageName(PAGE_ID));
    expect(must(rig.el, '[data-filter="missing"]').getAttribute('aria-pressed')).toBe('true');
    expect(must(rig.el, '[data-nav="conquerors"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('narrows the Overview strips with the same needle', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    state.recent.push(ids[0] ?? '', ids[3] ?? '');
    const rig = makeWindow(state, { nav: 'overview' });
    expect(rig.el.querySelectorAll('.reliquary-recent-item')).toHaveLength(2);
    const first = reliquaryRelicDisplayName('item', ids[0] ?? '');
    const other = reliquaryRelicDisplayName('item', ids[3] ?? '');
    const needle = first.toLocaleLowerCase(TAG);
    expect(other.toLocaleLowerCase(TAG), 'content premise: the two names differ').not.toContain(
      needle,
    );
    typeSearch(rig.el, needle);
    const chips = [...rig.el.querySelectorAll<HTMLElement>('.reliquary-recent-item')];
    expect(chips.map((c) => c.dataset.recentName)).toEqual([first]);
  });
});

// ---------------------------------------------------------------------------
// 9. Owned / missing filter chips
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: owned and missing filter chips', () => {
  it('shows only missing cells under the missing chip, and moves the pressed state', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    state.itemsDiscovered.add(ids[0] ?? '');
    state.itemsDiscovered.add(ids[1] ?? '');
    const rig = openPage(state);
    click(rig.el, '[data-filter="missing"]');
    const shown = cells(rig.el);
    expect(shown).toHaveLength(ids.length - 2);
    expect(shown.every((node) => node.dataset.cellOwned === '0')).toBe(true);
    const missing = must(rig.el, '[data-filter="missing"]');
    expect(missing.getAttribute('aria-pressed')).toBe('true');
    expect(missing.classList.contains('active')).toBe(true);
    expect(must(rig.el, '[data-filter="all"]').getAttribute('aria-pressed')).toBe('false');
    expect(must(rig.el, '[data-filter="owned"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows only owned cells under the owned chip', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    state.itemsDiscovered.add(ids[0] ?? '');
    state.itemsDiscovered.add(ids[1] ?? '');
    const rig = openPage(state);
    click(rig.el, '[data-filter="owned"]');
    const shown = cells(rig.el);
    expect(shown.map((node) => node.dataset.cellId)).toEqual([ids[0], ids[1]]);
    expect(shown.every((node) => node.dataset.cellOwned === '1')).toBe(true);
  });

  it('keeps the header meter on TRUE completion, never the filtered count', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    state.itemsDiscovered.add(ids[0] ?? '');
    state.itemsDiscovered.add(ids[1] ?? '');
    const rig = openPage(state);
    const trueProgress = t('hudChrome.reliquary.progressText', {
      owned: fmt(2),
      total: fmt(ids.length),
    });
    expect(must(rig.el, '.reliquary-page-progress').textContent).toBe(trueProgress);
    click(rig.el, '[data-filter="missing"]');
    // Three cells are on screen, but the player has still found two of five:
    // a meter that read 0/3 here would be lying about their collection.
    expect(cells(rig.el)).toHaveLength(3);
    expect(must(rig.el, '.reliquary-page-progress').textContent).toBe(trueProgress);
  });

  it('rejects a forged filter value instead of applying it raw', () => {
    const state = baseState();
    state.itemsDiscovered.add(relicIds(PAGE_ID)[0] ?? '');
    const rig = openPage(state);
    click(rig.el, '[data-filter="missing"]');
    expect(cells(rig.el)).toHaveLength(relicIds(PAGE_ID).length - 1);
    // The DOM is the untrusted half of this round trip. An unvalidated cast
    // would carry 'sneaky' into the pure core, where it falls through to the
    // missing branch and leaves no chip pressed at all.
    const chip = must(rig.el, '[data-filter="missing"]');
    chip.dataset.filter = 'sneaky';
    chip.click();
    expect(cells(rig.el)).toHaveLength(relicIds(PAGE_ID).length);
    expect(must(rig.el, '[data-filter="all"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('resets the grid cursor to the front when a chip renumbers the grid', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    state.itemsDiscovered.add(ids[0] ?? '');
    const rig = openPage(state);
    keydown(cells(rig.el)[0] as HTMLElement, 'End');
    expect(tabStopIndex(rig.el)).toBe(ids.length - 1);
    // Activating the chip moves focus onto the chip (the real click shape), so
    // nothing claims the cursor and the narrowed, renumbered grid starts at the
    // front rather than deep inside a list that is now shorter.
    focusClick(rig.el, '[data-filter="missing"]');
    expect(tabStopIndex(rig.el)).toBe(0);
  });

  it('lets a surviving focused cell keep the cursor over the chip reset', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    state.itemsDiscovered.add(ids[0] ?? '');
    const rig = openPage(state);
    keydown(cells(rig.el)[0] as HTMLElement, 'End');
    const held = cells(rig.el).at(-1)?.dataset.cellId ?? '';
    // The chip reset and the focus-key restore both fire on this paint. The
    // restore is the more specific rule and has to win: a cursor left at the
    // front while focus sits on the last cell would put the next Tab press
    // somewhere the player is not standing.
    click(rig.el, '[data-filter="missing"]');
    const fresh = must(rig.el, `[data-cell-id="${held}"]`);
    expect(document.activeElement).toBe(fresh);
    expect(tabStopIndex(rig.el)).toBe(cells(rig.el).indexOf(fresh));
  });
});

// ---------------------------------------------------------------------------
// 10. Roving tabindex
// ---------------------------------------------------------------------------

describe('ReliquaryWindow: the roving grid tab stop', () => {
  it('starts with exactly one tab stop, on the first cell', () => {
    const rig = openPage(baseState());
    expect(cells(rig.el).length).toBeGreaterThan(1);
    expect(tabStopIndex(rig.el)).toBe(0);
  });

  it('moves focus and the tab stop together, and claims the key', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    const event = keydown(grid[0] as HTMLElement, 'ArrowRight');
    expect(event.defaultPrevented, 'a claimed key must not also scroll the page').toBe(true);
    expect(document.activeElement).toBe(grid[1]);
    // Together, not just one: a tab stop left behind on the old cell would put
    // the next Tab press somewhere the player is not looking.
    expect(tabStopIndex(rig.el)).toBe(1);
  });

  it('treats ArrowDown/ArrowUp as one step, the orientation "both" contract', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    // roving_index owns ArrowDown as NEXT and ArrowUp as PREV for orientation
    // 'both'; it models visible siblings, not grid rows, so neither jumps a row.
    keydown(grid[0] as HTMLElement, 'ArrowDown');
    expect(tabStopIndex(rig.el)).toBe(1);
    expect(document.activeElement).toBe(grid[1]);
    keydown(grid[1] as HTMLElement, 'ArrowUp');
    expect(tabStopIndex(rig.el)).toBe(0);
    expect(document.activeElement).toBe(grid[0]);
  });

  it('jumps to the ends with Home and End', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    const last = grid.length - 1;
    keydown(grid[0] as HTMLElement, 'End');
    expect(tabStopIndex(rig.el)).toBe(last);
    expect(document.activeElement).toBe(grid[last]);
    keydown(grid[last] as HTMLElement, 'Home');
    expect(tabStopIndex(rig.el)).toBe(0);
    expect(document.activeElement).toBe(grid[0]);
  });

  it('wraps at both edges', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    const last = grid.length - 1;
    keydown(grid[0] as HTMLElement, 'ArrowLeft');
    expect(tabStopIndex(rig.el)).toBe(last);
    keydown(grid[last] as HTMLElement, 'ArrowRight');
    expect(tabStopIndex(rig.el)).toBe(0);
  });

  it('ignores a key it does not own and never repaints for one it does', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    const gridNode = must(rig.el, '.reliquary-grid');
    (grid[0] as HTMLElement).focus();
    const ignored = keydown(grid[0] as HTMLElement, 'Enter');
    expect(ignored.defaultPrevented, 'Enter falls through to the activation tail').toBe(false);
    expect(tabStopIndex(rig.el)).toBe(0);
    keydown(grid[0] as HTMLElement, 'ArrowRight');
    // Arrow movement restamps in place: a rebuild here would drop the caret,
    // the scroll offset, and the tooltip wiring on every keypress.
    expect(must(rig.el, '.reliquary-grid')).toBe(gridNode);
    expect(cells(rig.el)[1]).toBe(grid[1]);
  });

  it('carries the tab stop onto the restored cell after a data-driven rebuild', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    keydown(grid[0] as HTMLElement, 'End');
    const targetId = grid[grid.length - 1]?.dataset.cellId ?? '';
    expect(document.activeElement).toBe(grid[grid.length - 1]);

    rig.state.curatorRank = 3;
    rig.w.refreshIfChanged();
    const fresh = must(rig.el, `[data-cell-id="${targetId}"]`);
    expect(fresh).not.toBe(grid[grid.length - 1]);
    expect(document.activeElement).toBe(fresh);
    // The one tab stop follows the player's last cell instead of snapping back
    // to the front of the grid.
    expect(tabStopIndex(rig.el)).toBe(cells(rig.el).length - 1);
  });

  it('drops focus to Close when the focused cell vanishes, without moving the cursor there', () => {
    const state = baseState();
    const ids = relicIds(PAGE_ID);
    const rig = openPage(state);
    click(rig.el, '[data-filter="missing"]');
    const grid = cells(rig.el);
    keydown(grid[0] as HTMLElement, 'ArrowRight');
    const vanishing = cells(rig.el)[1]?.dataset.cellId ?? '';
    expect(document.activeElement).toBe(cells(rig.el)[1]);

    // Finding the relic removes its cell from a missing-only grid, so the
    // rebuild destroys the control the player is standing on.
    state.itemsDiscovered.add(vanishing);
    rig.w.refreshIfChanged();
    expect(rig.el.querySelector(`[data-cell-id="${vanishing}"]`)).toBeNull();
    const after = document.activeElement as HTMLElement | null;
    expect(after?.hasAttribute('data-close')).toBe(true);
    // The grid keeps exactly one tab stop, and Close is not a grid cell: a
    // fallback restore must not drag the roving cursor out of the grid.
    expect(cells(rig.el)).toHaveLength(ids.length - 1);
    expect(tabStopIndex(rig.el)).toBeGreaterThanOrEqual(0);
    expect(after?.tabIndex).not.toBe(-1);
  });

  it('leaves the grid cursor alone when the restore lands on Close by choice', () => {
    const rig = openPage(baseState());
    const grid = cells(rig.el);
    keydown(grid[0] as HTMLElement, 'ArrowRight');
    keydown(cells(rig.el)[1] as HTMLElement, 'ArrowRight');
    expect(tabStopIndex(rig.el)).toBe(2);
    // Focus deliberately parked on Close: syncGridRoving matches on the captured
    // KEY, so a Close restore must leave the cursor where the player left it
    // rather than resetting it to the first cell.
    must(rig.el, '[data-close]').focus();
    rig.state.curatorRank = 2;
    rig.w.refreshIfChanged();
    expect((document.activeElement as HTMLElement | null)?.hasAttribute('data-close')).toBe(true);
    expect(tabStopIndex(rig.el)).toBe(2);
  });
});
