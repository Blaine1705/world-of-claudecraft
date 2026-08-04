// @vitest-environment happy-dom
//
// The bank search is a per-visit filter: closing the window clears it, so a
// reopen never starts pre-narrowed to a stale query (items silently hidden with
// no cue why). The persisted category/sort preferences still survive the
// close/reopen and the session boundary; only the search is transient. Drives
// the REAL BankWindow (the bags_window_focus_restore harness idiom) against a
// stubbed IWorld bank mirror.

import { beforeEach, describe, expect, it } from 'vitest';
import type { InvSlot } from '../src/sim/types';
import { BankWindow, type BankWindowDeps } from '../src/ui/bank_window';
import type { IWorld } from '../src/world_api';

const BANK_FILTER_KEY = 'woc_bank_filter';

// Real catalog ids with distinct names/kinds so a search and a category chip
// both narrow the grid: 'worn_sword' (Pitted Shortsword, weapon) and
// 'copper_ore' (Copper Ore, junk/material-tier).
function bankSlots(): InvSlot[] {
  return [
    { itemId: 'worn_sword', count: 1 },
    { itemId: 'copper_ore', count: 5 },
  ];
}

function harness(): { root: HTMLElement; w: BankWindow } {
  const world = {
    bankInfo: {
      slots: bankSlots(),
      capacity: 12,
      purchasedSlots: 0,
      bonusSlots: 0,
      nextExpansionCost: 1000,
      bonusSources: [],
    },
    inventory: [] as InvSlot[],
    bankDeposit: () => {},
    bankWithdraw: () => {},
    bankBuySlots: () => {},
  } as unknown as IWorld;
  const root = document.createElement('div');
  document.body.appendChild(root);
  const noop = (): void => {};
  const deps: BankWindowDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () => world,
    closeOthers: noop,
    hideTooltip: noop,
    consumePeek: () => false,
    captureFocus: () => null,
    restoreFocus: noop,
    onClosed: noop,
    onInventoryChanged: noop,
  };
  return { root, w: new BankWindow(deps) };
}

function searchInput(root: HTMLElement): HTMLInputElement {
  const el = root.querySelector('.bag-search') as HTMLInputElement | null;
  expect(el, 'search input missing').toBeTruthy();
  return el as HTMLInputElement;
}

function typeSearch(root: HTMLElement, query: string): void {
  const el = searchInput(root);
  el.value = query;
  el.dispatchEvent(new Event('input'));
}

function occupiedCells(root: HTMLElement): number {
  return root.querySelectorAll('button.bank-item').length;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('bank window search reset on close', () => {
  it('clears the search when the window closes, so a reopen starts unfiltered', () => {
    const { root, w } = harness();
    w.open();
    typeSearch(root, 'copper');
    // The live search narrowed the grid to the one matching stack (proves the
    // real filter path ran, not just the input value).
    expect(occupiedCells(root)).toBe(1);
    w.close();
    w.open();
    expect(searchInput(root).value).toBe('');
    expect(occupiedCells(root)).toBe(2);
    w.close();
  });

  it('persists the cleared search on close (no stale query left in storage)', () => {
    const { root, w } = harness();
    w.open();
    typeSearch(root, 'copper');
    // The keystroke path persists the live query...
    expect(JSON.parse(localStorage.getItem(BANK_FILTER_KEY) ?? '{}').search).toBe('copper');
    w.close();
    // ...and close scrubs it back out.
    expect(JSON.parse(localStorage.getItem(BANK_FILTER_KEY) ?? '{}').search).toBe('');
  });

  it('keeps the persisted category and sort across close/reopen (only search is transient)', () => {
    const { root, w } = harness();
    w.open();
    const weaponChip = [...root.querySelectorAll<HTMLButtonElement>('.bag-chip')].find(
      (c) => c.textContent === 'Weapons',
    );
    expect(weaponChip, 'weapon chip missing').toBeTruthy();
    weaponChip?.click();
    const sort = root.querySelector('.bag-sort') as HTMLSelectElement;
    sort.value = 'name';
    sort.dispatchEvent(new Event('change'));
    typeSearch(root, 'pitted');
    w.close();
    w.open();
    const activeChip = [...root.querySelectorAll<HTMLButtonElement>('.bag-chip')].find((c) =>
      c.classList.contains('active'),
    );
    expect(activeChip?.textContent).toBe('Weapons');
    expect(searchInput(root).value).toBe('');
    const persisted = JSON.parse(localStorage.getItem(BANK_FILTER_KEY) ?? '{}');
    expect(persisted).toEqual({ category: 'weapon', sort: 'name', search: '' });
    // The LIVE sort survived too, not just the stored copy: widening back to All
    // paints the grid name-sorted (Copper Ore before Pitted Shortsword), the
    // reverse of the recent/slot order. (The select's .value is not read here:
    // happy-dom mis-selects when option.selected is set pre-append.)
    const allChip = [...root.querySelectorAll<HTMLButtonElement>('.bag-chip')].find(
      (c) => c.textContent === 'All',
    );
    allChip?.click();
    const labels = [...root.querySelectorAll<HTMLButtonElement>('button.bank-item')].map(
      (c) => c.getAttribute('aria-label') ?? '',
    );
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('Copper Ore');
    expect(labels[1]).toContain('Pitted Shortsword');
    w.close();
  });

  it('never restores a stale persisted search on construction (reload while the bank was open)', () => {
    // A reload while the bank sat open never runs close(), so the stored filter
    // still carries the query; the next session must not resurface it, while the
    // category/sort preferences do come back.
    localStorage.setItem(
      BANK_FILTER_KEY,
      JSON.stringify({ category: 'weapon', sort: 'name', search: 'copper' }),
    );
    const { root, w } = harness();
    w.open();
    expect(searchInput(root).value).toBe('');
    const activeChip = [...root.querySelectorAll<HTMLButtonElement>('.bag-chip')].find((c) =>
      c.classList.contains('active'),
    );
    expect(activeChip?.textContent).toBe('Weapons');
    // The weapon chip narrows to the one weapon; the empty-cell pad is a
    // narrowed-view drop, so exactly one occupied cell renders. Were the stale
    // 'copper' search still applied, ZERO cells would match (the ore is no weapon).
    expect(occupiedCells(root)).toBe(1);
    w.close();
  });
});
