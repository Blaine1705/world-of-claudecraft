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
import type { VendorBuyOptions } from '../src/sim/vendor_buy_stack';
import type { HeroicShopRow, HeroicShopView } from '../src/ui/hud/vendor/heroic_vendor_view';
import { renderHeroicVendorWindow } from '../src/ui/hud/vendor/heroic_vendor_window';
import type {
  VendorBuybackRow,
  VendorGoodsRow,
  VendorView,
} from '../src/ui/hud/vendor/vendor_view';
import { renderVendorWindow, type VendorWindowDeps } from '../src/ui/hud/vendor/vendor_window';

const hud = readFileSync(join(__dirname, '../src/ui/hud.ts'), 'utf8');

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
    onQtyChange: () => {},
    buyCustomMax: () => 0,
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
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
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
    const view: VendorView = { goods: [], buyback, honorBalance: 0, hasHonorGoods: false, multiple: 1 };
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
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
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
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
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
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
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
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
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
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
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
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const row = el.querySelector('.vendor-item') as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.classList.contains('vendor-locked')).toBe(false);
    expect(row.querySelector('.vi-sub')).toBeNull();
    expect(row.hasAttribute('aria-label')).toBe(true);
  });

  it('appends no empty .vendor-goods-grid when both sections are empty', () => {
    const view: VendorView = { goods: [], buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    expect(el.querySelectorAll('.vendor-goods-grid').length).toBe(0);
    // The empty-buyback state message still renders in its place.
    expect(el.querySelector('.vendor-empty')).not.toBeNull();
  });
});

describe('renderVendorWindow: bulk purchase (#2374)', () => {
  it('a row with no bulkQuantity renders only the ordinary buy tile', () => {
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'bread',
        item: item('bread'),
        price: { copper: 5, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: false,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    expect(el.querySelectorAll('.vendor-item').length).toBe(1);
    expect(el.querySelector('.vendor-item-bulk')).toBeNull();
  });

  it('a row with bulkQuantity of exactly 1 stays a single tile (no redundant Buy Stack)', () => {
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'thread',
        item: item('thread'),
        price: { copper: 12, honor: 0 },
        quantity: 1,
        affordable: false,
        requirementUnmet: false,
        bulkQuantity: 1,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    expect(el.querySelectorAll('.vendor-item').length).toBe(1);
    expect(el.querySelector('.vendor-item-bulk')).toBeNull();
  });

  it('a row with bulkQuantity > 1 renders a second, always-visible Buy Stack tile', () => {
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'thread',
        item: item('thread'),
        price: { copper: 12, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: false,
        bulkQuantity: 20,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    let bulkCalled: [string, VendorBuyOptions | undefined] | undefined;
    renderVendorWindow(
      el,
      'Vendor',
      view,
      deps({ onBuy: (itemId, opts) => (bulkCalled = [itemId, opts]) }),
    );

    const rows = el.querySelectorAll('.vendor-item');
    expect(rows.length).toBe(2);
    const bulkRow = el.querySelector('.vendor-item-bulk') as HTMLButtonElement | null;
    expect(bulkRow).not.toBeNull();
    expect(bulkRow?.parentElement).toBe(el.querySelector('.vendor-goods-grid'));
    expect(bulkRow?.getAttribute('aria-label')).toContain('20');

    bulkRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(bulkCalled).toEqual(['thread', { bulk: true }]);
  });

  it('the Buy Stack tile is disabled whenever the bulk purchase itself is unaffordable', () => {
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'thread',
        item: item('thread'),
        price: { copper: 12, honor: 0 },
        quantity: 1,
        affordable: false,
        requirementUnmet: false,
        bulkQuantity: 3,
        bulkAffordable: false,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const bulkRow = el.querySelector('.vendor-item-bulk') as HTMLButtonElement | null;
    expect(bulkRow?.disabled).toBe(true);
  });

  it('the Buy Stack tile stays enabled when the ordinary row is unaffordable but the bulk purchase is (food/drink stack-of-5 case)', () => {
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'loaf',
        item: item('loaf'),
        price: { copper: 50, honor: 0 },
        quantity: 5,
        affordable: false,
        requirementUnmet: false,
        bulkQuantity: 3,
        bulkAffordable: true,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    renderVendorWindow(el, 'Vendor', view, deps());

    const row = el.querySelector('.vendor-item:not(.vendor-item-bulk)') as HTMLButtonElement | null;
    const bulkRow = el.querySelector('.vendor-item-bulk') as HTMLButtonElement | null;
    expect(row?.disabled).toBe(true);
    expect(bulkRow?.disabled).toBe(false);
  });

  it('ctrl-click and cmd-click on the ordinary tile also request a bulk purchase', () => {
    const goods: VendorGoodsRow[] = [
      {
        itemId: 'thread',
        item: item('thread'),
        price: { copper: 12, honor: 0 },
        quantity: 1,
        affordable: true,
        requirementUnmet: false,
        bulkQuantity: 20,
      },
    ];
    const view: VendorView = { goods, buyback: [], honorBalance: 0, hasHonorGoods: false, multiple: 1 };
    const el = document.createElement('div');
    const calls: (VendorBuyOptions | undefined)[] = [];
    renderVendorWindow(el, 'Vendor', view, deps({ onBuy: (_itemId, opts) => calls.push(opts) }));

    const mainRow = el.querySelector('.vendor-item:not(.vendor-item-bulk)') as HTMLButtonElement;
    mainRow.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    mainRow.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    mainRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(calls).toEqual([{ bulk: true }, { bulk: true }, undefined]);
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

describe('renderVendorWindow: focus across the rebuild (the R22 advisory widening)', () => {
  function goodsRow(itemId: string): VendorGoodsRow {
    return {
      itemId,
      item: item(itemId),
      price: { copper: 5, honor: 0 },
      quantity: 1,
      affordable: true,
      requirementUnmet: false,
    };
  }

  it('a focused goods row keeps focus when the rebuild repaints it', () => {
    // The buy path rebuilds the whole grid with fresh elements; before the
    // capture-and-restore wiring a keyboard buy dropped focus to <body> on
    // every purchase (pre-existing for affordable rows, widened by the
    // advisory turn making requirement rows focusable for the first time).
    const view: VendorView = {
      goods: [goodsRow('bread'), goodsRow('water')],
      buyback: [],
      honorBalance: 0,
      hasHonorGoods: false,
      multiple: 1,
    };
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      renderVendorWindow(el, 'Vendor', view, deps());
      const water = el.querySelector<HTMLButtonElement>('[data-focus-key="buy:water"]');
      expect(water).not.toBeNull();
      water?.focus();
      expect(document.activeElement).toBe(water);
      renderVendorWindow(el, 'Vendor', view, deps());
      const rebuilt = el.querySelector<HTMLButtonElement>('[data-focus-key="buy:water"]');
      expect(rebuilt).not.toBeNull();
      expect(rebuilt).not.toBe(water); // genuinely a fresh element
      expect(document.activeElement).toBe(rebuilt);
    } finally {
      el.remove();
    }
  });

  it('a focused Buy Stack tile keeps focus when the rebuild repaints it (the merge seam)', () => {
    // The release's bulk tile (#2374) landed beside this branch's
    // focus-across-a-rebuild contract without a focus key, so a keyboard
    // bulk buy dropped focus to <body> on the repaint its own purchase
    // triggers: exactly the defect class the ordinary row already guards.
    const view: VendorView = {
      goods: [{ ...goodsRow('thread'), bulkQuantity: 20, bulkAffordable: true }],
      buyback: [],
      honorBalance: 0,
      hasHonorGoods: false,
      multiple: 1,
    };
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      renderVendorWindow(el, 'Vendor', view, deps());
      const tile = el.querySelector<HTMLButtonElement>('[data-focus-key="buy-stack:thread"]');
      expect(tile, 'the bulk tile must carry its own focus key').not.toBeNull();
      tile?.focus();
      expect(document.activeElement).toBe(tile);
      renderVendorWindow(el, 'Vendor', view, deps());
      const rebuilt = el.querySelector<HTMLButtonElement>('[data-focus-key="buy-stack:thread"]');
      expect(rebuilt).not.toBeNull();
      expect(rebuilt).not.toBe(tile); // genuinely a fresh element
      expect(document.activeElement).toBe(rebuilt);
    } finally {
      el.remove();
    }
  });

  it('a row that comes back DISABLED yields to its enabled grid neighbor (the last-stack buy)', () => {
    // The primary degradation the focus_restore family documents: buying the
    // last affordable stack drains copper, so the SAME row returns from the
    // rebuild disabled (row.disabled = !affordable) and cannot take focus.
    // The restore must stay INSIDE the row (the sibling item), never jump to
    // Close, where a reflexive Enter would shut the vendor.
    const before: VendorView = {
      goods: [goodsRow('bread'), goodsRow('water')],
      buyback: [],
      honorBalance: 0,
      hasHonorGoods: false,
      multiple: 1,
    };
    const after: VendorView = {
      ...before,
      goods: [goodsRow('bread'), { ...goodsRow('water'), affordable: false }],
    };
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      renderVendorWindow(el, 'Vendor', before, deps());
      el.querySelector<HTMLButtonElement>('[data-focus-key="buy:water"]')?.focus();
      renderVendorWindow(el, 'Vendor', after, deps());
      const rebuilt = el.querySelector<HTMLButtonElement>('[data-focus-key="buy:water"]');
      expect(rebuilt?.disabled).toBe(true);
      expect(document.activeElement).not.toBe(rebuilt);
      expect(document.activeElement).toBe(el.querySelector('[data-focus-key="buy:bread"]'));
    } finally {
      el.remove();
    }
  });

  it('a vanished row lands on the same grid slot, not on Close', () => {
    const two: VendorView = {
      goods: [goodsRow('bread'), goodsRow('water')],
      buyback: [],
      honorBalance: 0,
      hasHonorGoods: false,
      multiple: 1,
    };
    const one: VendorView = { ...two, goods: [goodsRow('bread')] };
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      renderVendorWindow(el, 'Vendor', two, deps());
      el.querySelector<HTMLButtonElement>('[data-focus-key="buy:water"]')?.focus();
      // The focused row is gone; the slot clamps to the surviving sibling,
      // which is exactly where a browsing player expects to continue.
      renderVendorWindow(el, 'Vendor', one, deps());
      expect(document.activeElement).toBe(el.querySelector('[data-focus-key="buy:bread"]'));
    } finally {
      el.remove();
    }
  });

  it('an emptied grid falls to an ENABLED sell-junk before Close (the ladder rung is real)', () => {
    // The middle rung by identity: with the goods grid gone entirely, an
    // enabled sell-junk takes focus ahead of Close. This is the arm that
    // kills a deleted rung: the default deps disable sell-junk, so only an
    // enabled-sell-junk drive can tell the rung from its absence.
    const before: VendorView = {
      goods: [goodsRow('bread')],
      buyback: [],
      honorBalance: 0,
      hasHonorGoods: false,
      multiple: 1,
    };
    const after: VendorView = { ...before, goods: [] };
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      renderVendorWindow(el, 'Vendor', before, deps({ sellJunk: { enabled: true, proceeds: 5 } }));
      el.querySelector<HTMLButtonElement>('[data-focus-key="buy:bread"]')?.focus();
      renderVendorWindow(el, 'Vendor', after, deps({ sellJunk: { enabled: true, proceeds: 5 } }));
      expect(document.activeElement).toBe(el.querySelector('.vendor-sell-junk'));
    } finally {
      el.remove();
    }
  });

  it('focus OUTSIDE the window is untouched by a rebuild (containment)', () => {
    // The vendor repaints from onInventoryChanged and the online vendor
    // event, neither of which is a vendor click, and it sits open beside
    // #bags; a sell from bags must not have the vendor repaint steal focus.
    const view: VendorView = {
      goods: [goodsRow('bread')],
      buyback: [],
      honorBalance: 0,
      hasHonorGoods: false,
      multiple: 1,
    };
    const el = document.createElement('div');
    const outside = document.createElement('button');
    document.body.appendChild(el);
    document.body.appendChild(outside);
    try {
      renderVendorWindow(el, 'Vendor', view, deps());
      outside.focus();
      renderVendorWindow(el, 'Vendor', view, deps());
      expect(document.activeElement).toBe(outside);
    } finally {
      el.remove();
      outside.remove();
    }
  });

  it('a buyback reclaim keeps focus at the same SLOT: the next item to reclaim', () => {
    // The positional-key design, pinned instead of hand-checked: buyBackItem
    // compacts the list, so after reclaiming slot 0 the old second item now
    // holds buyback:0 and the exact-key match lands on it.
    const sword = { itemId: 'sword', item: item('sword'), count: 1, price: 10, index: 0 };
    const shield = { itemId: 'shield', item: item('shield'), count: 1, price: 12, index: 1 };
    const before: VendorView = {
      goods: [],
      buyback: [sword, shield],
      honorBalance: 0,
      hasHonorGoods: false,
      multiple: 1,
    };
    const after: VendorView = {
      ...before,
      buyback: [{ ...shield, index: 0 }],
    };
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      renderVendorWindow(el, 'Vendor', before, deps());
      el.querySelector<HTMLButtonElement>('[data-focus-key="buyback:0"]')?.focus();
      renderVendorWindow(el, 'Vendor', after, deps());
      const landed = document.activeElement as HTMLElement | null;
      expect(landed?.dataset.focusKey).toBe('buyback:0');
      expect(landed?.textContent).toContain('shield');
    } finally {
      el.remove();
    }
  });
});

describe('vendor window family: hud.ts focus-management wiring (WCAG 2.4.3)', () => {
  // Unlike vendor_view.ts/vendor_window.ts (pure core + thin painter), the
  // open/close/focus lifecycle for #vendor-window lives directly on the Hud
  // coordinator (openVendor/closeVendor/openHeroicVendor/closeHeroicVendor),
  // the same shape openBank/closeBank use for the bank companion. So this
  // suite pins the SOURCE wiring the bank_window.test.ts "hud.ts wiring"
  // section pins for bank: the non-trapping capture/return pair, matching
  // bankWindow (NOT windowFocus, which would install a Tab trap and break the
  // vendor + bags cluster, which is documented as a companion, not modal).
  // Anchors resolve with indexOf, which returns -1 (not undefined) on a miss;
  // a slice built from two -1s or one -1 plus a real offset can still
  // silently contain the expected substring (e.g. slice(-1, 40) === the
  // WHOLE tail of the file), so a renamed anchor must be caught explicitly
  // rather than trusted to make the body assertions fail for the right
  // reason.
  const anchor = (needle: string): number => {
    const at = hud.indexOf(needle);
    expect(at, `anchor not found in hud.ts: ${JSON.stringify(needle)}`).toBeGreaterThanOrEqual(0);
    return at;
  };
  const openVendorStart = anchor('openVendor(npcId: number, opener?: HTMLElement | null): void {');
  const openVendorEnd = anchor('private renderVendor(): void {');
  const openHeroicVendorStart = anchor(
    'openHeroicVendor(npcId: number, opener?: HTMLElement | null): void {',
  );
  const openHeroicVendorEnd = anchor('private renderHeroicVendor(): void {');
  const closeHeroicVendorStart = anchor('closeHeroicVendor(): void {');
  const closeVendorStart = anchor('closeVendor(): void {');
  const vendorOpenGetterStart = anchor('get vendorOpen(): boolean {');
  expect(openVendorEnd).toBeGreaterThan(openVendorStart);
  expect(openHeroicVendorEnd).toBeGreaterThan(openHeroicVendorStart);
  expect(closeVendorStart).toBeGreaterThan(closeHeroicVendorStart);
  expect(vendorOpenGetterStart).toBeGreaterThan(closeVendorStart);
  const openVendorBody = hud.slice(openVendorStart, openVendorEnd);
  const openHeroicVendorBody = hud.slice(openHeroicVendorStart, openHeroicVendorEnd);
  const closeHeroicVendorBody = hud.slice(closeHeroicVendorStart, closeVendorStart);
  const closeVendorBody = hud.slice(closeVendorStart, vendorOpenGetterStart);

  it('captures the opener on openVendor and openHeroicVendor via the shared FocusManager, with an explicit opener overriding the fallback', () => {
    expect(openVendorBody).toContain(
      'this.vendorOpenerFocus = opener !== undefined ? opener : this.focusManager.activeFocusable();',
    );
    expect(openHeroicVendorBody).toContain(
      'this.vendorOpenerFocus = opener !== undefined ? opener : this.focusManager.activeFocusable();',
    );
  });

  it('returns focus to the opener on closeVendor and closeHeroicVendor', () => {
    expect(closeVendorBody).toContain('this.focusManager.restore(this.vendorOpenerFocus);');
    expect(closeHeroicVendorBody).toContain('this.focusManager.restore(this.vendorOpenerFocus);');
  });

  it('never installs a Tab trap for #vendor-window (non-modal bags companion)', () => {
    expect(hud).not.toMatch(/this\.windowFocus\('#vendor-window'\)/);
  });

  it('closeVendor is a no-op when the copper vendor tenant is not open (Esc/generic close on the heroic tenant)', () => {
    // closeManagedWindow('vendor-window') calls closeVendor() then closeHeroicVendor()
    // unconditionally, since either tenant can hold the shared #vendor-window container.
    // Without this guard, closeVendor still ran while only the heroic tenant was open,
    // clearing the shared vendorOpenerFocus (and firing hideTooltip/mobile-bags teardown)
    // before closeHeroicVendor got a chance to restore it, so the generic close path
    // (Escape, walking out of range via the topmost-window dispatcher) dropped the
    // WCAG 2.4.3 focus return even though the explicit close button worked.
    expect(closeVendorBody).toContain('// Guard');
    expect(closeVendorBody).toContain('if (this.openVendorNpcId === null) return;');
  });
});
