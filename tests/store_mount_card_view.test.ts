// The Machine Stable's markup core (src/ui/store_mount_card_view.ts), the
// store-mount twin of src/ui/armory_card_view.ts. Registering it in
// UI_PURE_CORES proves it is PURE; these arms prove it is CORRECT: the three
// card states, the section wrapper, and the buy attribute the store body
// binding reads back (src/ui/store_body_actions.ts).
//
// Rows come from the real projection (buildStoreMountRows over the shipped
// catalog), never from hand-rolled literals, so a catalog or projection change
// reaches these arms instead of sailing past a fixture.

import { describe, expect, it } from 'vitest';
import { STORE_MOUNT_ITEM_IDS } from '../src/sim/content/store_mounts';
import {
  STORE_MOUNT_BUY_ATTR,
  storeMountCardHtml,
  storeMountName,
  storeMountsSectionHtml,
} from '../src/ui/store_mount_card_view';
import {
  buildStoreMountRows,
  type StoreMountRow,
  type WocStoreItemInput,
} from '../src/ui/woc_store_view';

const REINS = STORE_MOUNT_ITEM_IDS[0];

function service(over: Partial<WocStoreItemInput> = {}): WocStoreItemInput {
  return {
    itemId: REINS,
    name: 'service name',
    kind: 'item',
    costClaudium: 1200,
    owned: false,
    ...over,
  };
}

function row(
  balance: number | null,
  items: WocStoreItemInput[],
  owned: string[] = [],
): StoreMountRow {
  const first = buildStoreMountRows(balance, items, owned)[0];
  if (!first) throw new Error('the shipped catalog projected no store mount row');
  return first;
}

describe('storeMountCardHtml', () => {
  it('renders a priced, purchasable row as a card with a buy button carrying the item id', () => {
    const html = storeMountCardHtml(row(5000, [service()]));
    expect(html).toContain('class="armory-card store-mount-card rarity-rare"');
    expect(html).toContain(`src="/ui/items/${REINS}.webp"`);
    expect(html).toContain(`<h4>${storeMountName(REINS)}</h4>`);
    expect(html).toContain(`${STORE_MOUNT_BUY_ATTR}="${REINS}"`);
    // The price is the service's, formatted, never invented.
    expect(html).toMatch(/1\D?200<\/button>/);
    expect(html).not.toContain('armory-state');
  });

  it('renders an owned row as the owned state with no buy button', () => {
    const html = storeMountCardHtml(row(5000, [service()], ['mech_bird']));
    expect(html).toContain('<span class="armory-state">');
    expect(html).not.toContain(STORE_MOUNT_BUY_ATTR);
  });

  it('renders a row the service snapshot lacks as unavailable, with no price', () => {
    const html = storeMountCardHtml(row(5000, []));
    expect(html).toContain('<span class="armory-state unavailable">');
    expect(html).not.toContain(STORE_MOUNT_BUY_ATTR);
    expect(html).not.toContain('claudium_coin_64.webp');
  });

  it('names the mount from the catalog, never from the service name', () => {
    const html = storeMountCardHtml(row(5000, [service({ name: '<script>service</script>' })]));
    expect(html).not.toContain('service');
    expect(html).toContain('store-mount-spec');
  });

  it('renders nothing for a row whose item the catalog does not declare', () => {
    const bogus: StoreMountRow = { ...row(5000, [service()]), itemId: 'not_a_reins', mountKey: '' };
    expect(storeMountCardHtml(bogus)).toBe('');
  });
});

describe('storeMountsSectionHtml', () => {
  it('wraps the cards in the store section with the Machine Stable header', () => {
    const html = storeMountsSectionHtml(buildStoreMountRows(5000, [service()], []));
    expect(html).toMatch(/^<section class="armory-section store-mounts">/);
    expect(html).toContain('<div class="armory-grid">');
    expect(html).toContain('store-mount-card');
  });

  it('is empty with no rows, so the store paints no empty strip', () => {
    expect(storeMountsSectionHtml([])).toBe('');
  });
});

describe('storeMountName', () => {
  it('falls back to the id only for an item the catalog does not declare', () => {
    expect(storeMountName(REINS)).not.toBe(REINS);
    expect(storeMountName('not_an_item')).toBe('not_an_item');
  });
});
