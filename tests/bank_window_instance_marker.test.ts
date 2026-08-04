// @vitest-environment happy-dom
//
// Bank grid instanced-slot markers (Professions 2.0): a banked masterwork must
// keep the authored seal, and every other per-copy kind (enchanted / signed /
// bound / generic) must paint the same corner mark bags use. Drives the real
// BankWindow painter against a stubbed IWorld bank mirror (the bank_window_search_reset
// harness idiom). CSS coverage for bank-item shares the bags stylesheet pins.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InvSlot, ItemInstancePayload } from '../src/sim/types';
import { BankWindow, type BankWindowDeps } from '../src/ui/bank_window';
import type { BankInfo, IWorld } from '../src/world_api';

function bankInfo(slots: InvSlot[], capacity = 12): BankInfo {
  return {
    slots,
    capacity,
    purchasedSlots: 0,
    bonusSlots: 0,
    nextExpansionCost: 1000,
    bonusSources: [],
  };
}

interface HarnessWorld {
  bankInfo: BankInfo | null;
  inventory: InvSlot[];
  bankDeposit(): void;
  bankWithdraw(): void;
  bankBuySlots(): void;
}

function windowFor(slots: InvSlot[]): HTMLElement {
  const world: HarnessWorld = {
    bankInfo: bankInfo(slots),
    inventory: [],
    bankDeposit: () => {},
    bankWithdraw: () => {},
    bankBuySlots: () => {},
  };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const noop = (): void => {};
  const deps: BankWindowDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () => world as unknown as IWorld,
    closeOthers: noop,
    hideTooltip: noop,
    consumePeek: () => false,
    captureFocus: () => null,
    restoreFocus: noop,
    onClosed: noop,
    onInventoryChanged: noop,
  };
  const w = new BankWindow(deps);
  w.open();
  return root;
}

function slot(itemId: string, instance?: ItemInstancePayload, count = 1): InvSlot {
  return instance ? { itemId, count, instance } : { itemId, count };
}

describe('bank grid instanced-slot marker', () => {
  it('a masterwork uses the authored seal and announces masterwork', () => {
    const root = windowFor([
      slot('worn_sword', { signer: 'Anna', rolled: { masterwork: true, stats: { sta: 1 } } }),
      slot('worn_sword'),
    ]);
    const cells = root.querySelectorAll('button.bank-item');
    expect(cells.length).toBe(2);
    const seal = cells[0].querySelector<HTMLImageElement>('.bi-masterwork-seal');
    expect(seal?.getAttribute('src')).toBe('/ui/professions/masterwork_seal.webp');
    expect(seal?.getAttribute('alt')).toBe('');
    expect(seal?.getAttribute('aria-hidden')).toBe('true');
    // happy-dom may not surface the reflected .draggable boolean from
    // innerHTML; pin the attribute the painter wrote.
    expect(seal?.getAttribute('draggable')).toBe('false');
    expect(cells[0].querySelector('.bi-instance')).toBeNull();
    expect(cells[0].querySelector('.bi-glyph')).toBeNull();
    expect(cells[0].getAttribute('aria-label')).toMatch(/masterwork/i);
    expect(cells[0].getAttribute('aria-label')).not.toMatch(/maker-marked copy/i);
    // Plain sibling keeps no marker and no masterwork wording.
    expect(cells[1].querySelector('.bi-masterwork-seal')).toBeNull();
    expect(cells[1].querySelector('.bi-glyph')).toBeNull();
    expect(cells[1].querySelector('.bi-instance')).toBeNull();
    expect(cells[1].getAttribute('aria-label')).not.toMatch(/masterwork/i);
  });

  it('each kind paints its own distinct glyph, exactly one per cell', () => {
    const root = windowFor([
      slot('copper_ore', { enchant: 'enchant_chest_stamina' }),
      slot('copper_ore', { signer: 'Anna' }),
      slot('copper_ore', { bindOnTrade: true }),
      slot('copper_ore', { bindOnTrade: false }),
      slot('copper_ore', { rolled: { masterwork: true, stats: { sta: 1 } } }),
    ]);
    const cells = root.querySelectorAll('button.bank-item');
    expect(cells.length).toBe(5);
    expect(cells[0].querySelector('.bi-glyph-enchanted')).not.toBeNull();
    expect(cells[1].querySelector('.bi-glyph-signed')).not.toBeNull();
    expect(cells[2].querySelector('.bi-glyph-bound')).not.toBeNull();
    expect(cells[3].querySelector('.bi-instance')).not.toBeNull();
    expect(cells[4].querySelector('.bi-masterwork-seal')).not.toBeNull();
    for (const cell of cells) {
      const markers = cell.querySelectorAll('.bi-glyph, .bi-instance, .bi-masterwork-seal');
      expect(markers.length).toBe(1);
    }
    const names = [...cells].map((c) => c.getAttribute('aria-label') ?? '');
    expect(names[0]).toMatch(/enchanted copy/i);
    expect(names[1]).toMatch(/maker-marked copy/i);
    expect(names[2]).toMatch(/bound copy/i);
    expect(names[4]).toMatch(/masterwork/i);
    expect(new Set(names.slice(0, 3).concat(names[4])).size).toBe(4);
  });

  it('a counted masterwork keeps its count badge without restoring the generic marker', () => {
    const root = windowFor([
      slot('copper_ore', { rolled: { masterwork: true, stats: { sta: 1 } } }, 2),
    ]);
    const cell = root.querySelector('button.bank-item');
    expect(cell?.querySelector('.bi-masterwork-seal')).not.toBeNull();
    expect(cell?.querySelector('.bi-instance')).toBeNull();
    expect(cell?.querySelector('.bi-glyph')).toBeNull();
    expect(cell?.querySelector('.bank-count')?.textContent).toContain('2');
  });

  it('a plain counted stack keeps the count badge and no marker', () => {
    const root = windowFor([slot('copper_ore', undefined, 5)]);
    const cell = root.querySelector('button.bank-item');
    expect(cell?.querySelector('.bank-count')?.textContent).toContain('5');
    expect(cell?.querySelector('.bi-instance')).toBeNull();
    expect(cell?.querySelector('.bi-glyph')).toBeNull();
    expect(cell?.querySelector('.bi-masterwork-seal')).toBeNull();
  });
});

describe('bank-item instance mark stylesheet contract', () => {
  const components = readFileSync(join(__dirname, '../src/styles/components.css'), 'utf8');

  it('bank cells share the always-on masterwork seal and glyph rules with bags', () => {
    // Dual-selector rules keep one definition; bank never needs a hover reveal
    // or an --fx gate (fairness: the seal is information-add). No bags-only
    // fork: a solo `.bank-item .bi-masterwork-seal {` block would be a second
    // definition that can drift.
    expect(components).toMatch(
      /\.bag-item \.bi-masterwork-seal,\s*\.bank-item \.bi-masterwork-seal \{/,
    );
    expect(components).toMatch(/\.bag-item \.bi-glyph,\s*\.bank-item \.bi-glyph \{/);
    expect(components).toMatch(/\.bag-item \.bi-instance,\s*\.bank-item \.bi-instance \{/);
    expect(components).not.toContain('.bank-item:hover .bi-masterwork-seal');
    expect(components).not.toContain('.bank-item:hover .bi-glyph');
    // Tokenized per-kind tints ride the same bag tokens.
    for (const kind of ['enchanted', 'signed', 'bound']) {
      expect(components).toMatch(
        new RegExp(
          `\\.bag-item \\.bi-glyph-${kind},\\s*\\.bank-item \\.bi-glyph-${kind} \\{[\\s\\S]*?var\\(--color-bag-glyph-${kind}\\)`,
        ),
      );
    }
  });

  it('the bank painter mints marks through the shared helper, not a private fork', () => {
    const painter = readFileSync(join(__dirname, '../src/ui/bank_window.ts'), 'utf8');
    expect(painter).toContain('instanceGlyphMarkHtml');
    expect(painter).toContain('bagInstanceGlyphKind');
    expect(painter).toContain('INSTANCE_GLYPH_ARIA_KEYS');
    // No private seal URL or class fork that could drift from bags.
    expect(painter).not.toContain('MASTERWORK_SEAL_IMAGE_URL');
    expect(painter).not.toContain('bi-masterwork-seal');
  });
});
