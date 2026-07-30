// @vitest-environment jsdom
// Behavioral pin for the vendor / Heroic Quartermaster grid painters (round 4
// review on PR #2101, EnriqueGF: neither renderVendorWindow nor
// renderHeroicVendorWindow was ever driven against a real DOM, so the
// .vendor-goods-grid wrapping and the two `length > 0` empty-grid guards
// added in earlier rounds were untested). Drives the real painters against a
// jsdom container and asserts goods/buyback rows land as children of
// .vendor-goods-grid, and that no empty grid node is appended when a section
// has no rows.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/sim/types';
import type { HeroicShopRow, HeroicShopView } from '../src/ui/hud/vendor/heroic_vendor_view';
import { renderHeroicVendorWindow } from '../src/ui/hud/vendor/heroic_vendor_window';
import type {
  VendorBuybackRow,
  VendorGoodsRow,
  VendorView,
} from '../src/ui/hud/vendor/vendor_view';
import { renderVendorWindow, type VendorWindowDeps } from '../src/ui/hud/vendor/vendor_window';

function item(id: string): ItemDef {
  return {
    id,
    name: id,
    quality: 'common',
    kind: 'junk',
    slot: 'trinket',
    sellValue: 0,
  } as unknown as ItemDef;
}

function deps(overrides: Partial<VendorWindowDeps> = {}): VendorWindowDeps {
  return {
    itemIcon: () => '<img>',
    moneyHtml: (copper) => `${copper}c`,
    itemTooltip: () => '<div></div>',
    attachTooltip: () => {},
    hideTooltip: () => {},
    onBuy: () => {},
    onBuyBack: () => {},
    onSellJunk: () => {},
    onClose: () => {},
    sellJunk: { enabled: false, proceeds: 0 },
    ...overrides,
  };
}

function heroicDeps(overrides: Partial<Parameters<typeof renderHeroicVendorWindow>[3]> = {}) {
  return {
    itemIcon: () => '<img>',
    moneyHtml: (copper: number) => `${copper}c`,
    itemTooltip: () => '<div></div>',
    attachTooltip: () => {},
    hideTooltip: () => {},
    onBuy: () => {},
    onClose: () => {},
    ...overrides,
  };
}

describe('renderVendorWindow: goods/buyback grid wrapping', () => {
  it('appends goods rows as children of .vendor-goods-grid', () => {
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'bread',
        item: item('bread'),
        price: { copper: 5, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: false,
      },
      {
        itemId: 'water',
        item: item('water'),
        price: { copper: 2, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: false,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const grids = el.querySelectorAll('.vendor-goods-grid');
    expect(grids.length).toBe(1);
    const rows = grids[0].querySelectorAll('.vendor-item');
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.parentElement).toBe(grids[0]);
  });

  it('appends buyback rows as children of their own .vendor-goods-grid', () => {
    const buyback: VendorBuybackRow[] = [
      { itemId: 'sword', item: item('sword'), count: 1, price: 100, index: 0 },
    ];
    const view: VendorView = { goods: [], buyback, honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const grids = el.querySelectorAll('.vendor-goods-grid');
    expect(grids.length).toBe(1);
    const rows = grids[0].querySelectorAll('.vendor-item');
    expect(rows.length).toBe(1);
    expect(rows[0].parentElement).toBe(grids[0]);
  });

  it('paints a requirement-unmet row ENABLED with its advisory line and the buy aria-label (R22)', () => {
    // The advisory contract, driven through the real painter: the row stays
    // in the grid, it SELLS (never disabled for proficiency; the wield gate
    // at the harvest owns enforcement), it says what the tool will ask of
    // its buyer, and the accessible name keeps the honest buy promise.
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'iron_mining_pick',
        item: item('iron_mining_pick'),
        price: { copper: 120, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: true,
        requirement: { professionId: 'mining', proficiency: 40 },
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const row = el.querySelector('.vendor-item') as HTMLButtonElement;
    expect(row).not.toBeNull();
    // The class survives purely as the sub-line tint hook.
    expect(row.classList.contains('vendor-locked')).toBe(true);
    // ENABLED although the requirement is unmet: the sale is real (R22).
    expect(row.disabled).toBe(false);
    // The accessible name states the buy promise AND the requirement: an
    // aria-label replaces the button's content as its name, so without the
    // combined key a screen reader would never hear what the sighted
    // sub-line says.
    expect(row.getAttribute('aria-label')).toContain('Iron Mining Pick');
    expect(row.getAttribute('aria-label')).toContain('Requires Mining 40');
    expect(row.querySelector('.vi-sub')?.textContent).toBe('Requires Mining 40');
    // The price still renders: the row shows what it will cost.
    expect(row.querySelector('.vi-price')?.textContent).toContain('120');
  });

  it('a requirement-unmet row with no printable requirement still sells with the buy aria-label', () => {
    // The no-display-name corner: a profession missing from the shared name
    // table renders no sub-line. Under the advisory model that must not
    // change anything else about the row: it stays enabled and keeps its
    // honest buy label (the old model suppressed the label here, which is
    // exactly the behavior the retirement of the purchase deny removed).
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'iron_mining_pick',
        item: item('iron_mining_pick'),
        price: { copper: 120, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: true,
        // An id with no entry in the shared name table.
        requirement: { professionId: 'not_a_profession' as never, proficiency: 40 },
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const row = el.querySelector('.vendor-item') as HTMLButtonElement;
    expect(row.classList.contains('vendor-locked')).toBe(true);
    expect(row.disabled).toBe(false);
    // No requirement line is printable; the buy label stands regardless.
    expect(row.querySelector('.vi-sub')).toBeNull();
    expect(row.getAttribute('aria-label')).toContain('Iron Mining Pick');
  });

  it('the requirement-unmet row TOOLTIP invites the click and appends NO second requirement line', () => {
    // The deps bag's attachTooltip is a no-op by default, so the tooltip
    // builder closure never runs and this branch was invisible. Capture the
    // builder and invoke it: the shared item tooltip (deps.itemTooltip, which
    // resolves gatherToolTooltipLines) already carries the requirement
    // sentence on every requirement-carrying tool, so the painter appending
    // it again rendered the line twice on every gated row. The painter owes
    // the click invitation only; the requirement rides the item tooltip.
    const built: string[] = [];
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'iron_mining_pick',
        item: item('iron_mining_pick'),
        price: { copper: 120, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: true,
        requirement: { professionId: 'mining', proficiency: 40 },
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(
      el,
      'Vendor',
      view,
      deps({
        attachTooltip: (_node: HTMLElement, build: () => string) => {
          built.push(build());
        },
      }),
    );

    // The goods row is the first tooltip attached (sell-junk and buyback rows
    // attach their own after it).
    expect(built.length).toBeGreaterThan(0);
    expect(built[0]).toContain('Click to buy');
    // The painter itself adds no requirement line (the stubbed itemTooltip
    // here proves the appended half is gone; the real one carries it once).
    expect(built[0]).not.toContain('Requires Mining 40');
  });

  it('keeps click-to-buy on an unlocked row TOOLTIP', () => {
    // The counter-example: without it the arm above passes on a painter that
    // dropped the click hint from every row.
    const built: string[] = [];
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'copper_mining_pick',
        item: item('copper_mining_pick'),
        price: { copper: 20, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: false,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(
      el,
      'Vendor',
      view,
      deps({
        attachTooltip: (_node: HTMLElement, build: () => string) => {
          built.push(build());
        },
      }),
    );

    expect(built[0]).toContain('Click to buy');
    expect(built[0]).not.toContain('Requires');
  });

  it('leaves an unlocked row interactive, aria-labelled, and free of a requirement line', () => {
    // The counter-example that keeps the arm above from passing on a painter
    // that marked every row locked.
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'copper_mining_pick',
        item: item('copper_mining_pick'),
        price: { copper: 20, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: false,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const row = el.querySelector('.vendor-item') as HTMLButtonElement;
    expect(row.classList.contains('vendor-locked')).toBe(false);
    expect(row.disabled).toBe(false);
    expect(row.getAttribute('aria-label')).toBe('Buy Copper Mining Pick for 20c');
    expect(row.querySelector('.vi-sub')).toBeNull();
  });

  it('an unaffordable but UNGATED row disables without claiming a requirement', () => {
    // Distinguishes the two disabled states: only the gated one grows the
    // .vendor-locked class and the requirement line.
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'copper_mining_pick',
        item: item('copper_mining_pick'),
        price: { copper: 20, honor: 0 },
        quantity: 1,
        affordable: false,
        requirementUnmet: false,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const row = el.querySelector('.vendor-item') as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.classList.contains('vendor-locked')).toBe(false);
    expect(row.querySelector('.vi-sub')).toBeNull();
    expect(row.hasAttribute('aria-label')).toBe(true);
  });

  it('appends no empty .vendor-goods-grid when both sections are empty', () => {
    const view: VendorView = { goods: [], buyback: [], honorBalance: 0, hasHonorGoods: false };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    expect(el.querySelectorAll('.vendor-goods-grid').length).toBe(0);
    // The empty-buyback state message still renders in its place.
    expect(el.querySelector('.vendor-empty')).not.toBeNull();
  });
});

describe('renderHeroicVendorWindow: goods grid wrapping', () => {
  it('appends rows as children of .vendor-goods-grid', () => {
    const rows: HeroicShopRow[] = [
      { itemId: 'trinket', item: item('trinket'), marks: 10, affordable: true },
    ];
    const view: HeroicShopView = { rows, balance: 20 };
    const el = document.createElement('div');
    renderHeroicVendorWindow(el, 'Quartermaster', view, heroicDeps());

    const grids = el.querySelectorAll('.vendor-goods-grid');
    expect(grids.length).toBe(1);
    const itemRows = grids[0].querySelectorAll('.vendor-item');
    expect(itemRows.length).toBe(1);
    expect(itemRows[0].parentElement).toBe(grids[0]);
  });

  it('appends no empty .vendor-goods-grid when there are no rows', () => {
    const view: HeroicShopView = { rows: [], balance: 0 };
    const el = document.createElement('div');
    renderHeroicVendorWindow(el, 'Quartermaster', view, heroicDeps());

    expect(el.querySelectorAll('.vendor-goods-grid').length).toBe(0);
  });
});

describe('#vendor-window desktop width cap: divides by --window-scale and clears #bags', () => {
  // jsdom gives import.meta.url an http URL, which readFileSync(new URL(...)) rejects
  // (see deeds_window.test.ts): resolve from __dirname instead.
  const components = readFileSync(join(__dirname, '../src/styles/components.css'), 'utf8');
  const marker = '#vendor-window {\n    width:';
  const firstIndex = components.indexOf(marker);
  const occurrences = components.split(marker).length - 1;
  const start = firstIndex;
  const block = components.slice(start, components.indexOf('}', start));
  // Normalized so the pin survives Biome reflowing the multi-line calc()
  // (round 5 review, PR #2101: the raw multi-line substring never matched).
  const normalized = block.replace(/\s+/g, ' ');

  it('exists exactly once', () => {
    expect(occurrences).toBe(1);
  });

  it('divides the viewport term by --window-scale, not --ui-scale (round 4 review, PR #2101)', () => {
    expect(normalized).toContain('var(--app-vw, 100vw) / var(--window-scale)');
    expect(normalized).not.toContain('var(--app-vw, 100vw) - 2 *');
  });

  it('floors the width at 400px so it never regresses below the pre-PR fixed window', () => {
    expect(normalized).toMatch(/width: max\( 400px, min\( 860px,/);
  });

  it('caps the width so it clears the #bags left edge at any viewport/scale (round 5 review, PR #2101)', () => {
    // #bags centres itself at left: ((100% + 50% + bar-half + gap - micro-r) / 2)
    // then translateX(-50%), with micro-r = 50px + gap (gap cancels) and a
    // steady-state width of 310px once --bags-slot-w stops binding: its left
    // edge is 0.75 * VW + (barHalf - 50) / 2 - 155. #vendor-window is centred
    // (right edge = VW / 2 + width / 2) and must stay clear of that edge.
    const barHalf = 306;
    for (const scale of [0.8, 1, 1.25, 1.4]) {
      for (const vw of [700, 900, 1024, 1100, 1280, 1400, 1600, 1920, 2560]) {
        const authorVw = vw / scale;
        const width = Math.max(400, Math.min(860, 0.5 * authorVw + barHalf - 362));
        const vendorRightEdge = authorVw / 2 + width / 2;
        const bagsLeftEdge = 0.75 * authorVw + (barHalf - 50) / 2 - 155;
        // Small viewports keep the 400px floor: #bags is bottom-anchored and
        // #vendor-window top-anchored, so any residual overlap there is
        // vertical, not horizontal (see the CSS comment); only assert
        // clearance once the floor is no longer the binding constraint.
        if (width > 400) {
          expect(vendorRightEdge).toBeLessThanOrEqual(bagsLeftEdge + 1);
        }
      }
    }
  });
});
