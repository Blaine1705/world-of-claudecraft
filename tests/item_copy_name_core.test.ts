// A copy's own display name (src/ui/item_copy_name_core.ts): the World PvP
// trophy skull reads "<victim>'s Skull" on every surface that holds the copy
// (the loot window row, the chat receipt link, the tooltip title), while an
// unsigned skull and every other item keep their definition's name.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { emitInventoryReceipt } from '../src/sim/inventory_receipt';
import { WORLD_PVP_SKULL_ITEM_ID, worldPvpSkullInstance } from '../src/sim/pvp';
import type { ItemInstancePayload, SimEvent } from '../src/sim/types';
import { itemDisplayName } from '../src/ui/entity_i18n';
import { t } from '../src/ui/i18n';
import { itemCopyDisplayName, itemCopyOwnName } from '../src/ui/item_copy_name_core';
import { instanceMakersMarkLine, instanceTitleHtml } from '../src/ui/item_instance_tooltip';
import { lootQualityReceiptBody, lootQualityReceiptText } from '../src/ui/loot_quality_receipt';
import { lootCopyAriaName } from '../src/ui/loot_quality_view';

const skull = ITEMS[WORLD_PVP_SKULL_ITEM_ID];
const betsSkull = worldPvpSkullInstance('Bet');

describe('the trophy skull copy name', () => {
  it("reads <name>'s Skull for a signed copy, the def name otherwise", () => {
    expect(t('hudChrome.worldPvp.skullName', { name: 'Bet' })).toBe("Bet's Skull");
    expect(itemCopyOwnName(skull, betsSkull)).toBe("Bet's Skull");
    expect(itemCopyDisplayName(skull, betsSkull)).toBe("Bet's Skull");
    expect(itemCopyOwnName(skull, undefined)).toBeNull();
    expect(itemCopyDisplayName(skull, undefined)).toBe(itemDisplayName(skull));
    expect(itemDisplayName(skull)).toBe('Trophy Skull');
    // A signed copy of any other item (a crafted piece) keeps its own name.
    const crafted = Object.values(ITEMS).find((def) => def.kind === 'armor')!;
    expect(itemCopyOwnName(crafted, { signer: 'Bet' })).toBeNull();
    expect(itemCopyDisplayName(crafted, { signer: 'Bet' })).toBe(itemDisplayName(crafted));
  });

  it('titles the tooltip with the copy name over the def name, with no maker line', () => {
    const html = instanceTitleHtml(skull, betsSkull, itemDisplayName(skull));
    expect(html).toContain('>Bet&#39;s Skull</div>');
    expect(html).toContain('<div class="tt-sub">Trophy Skull</div>');
    expect(instanceTitleHtml(skull, undefined, 'Trophy Skull')).not.toContain('tt-sub');
    expect(instanceMakersMarkLine(betsSkull, skull)).toBe('');
    // A crafted copy's signer still reads as its maker.
    const crafted = Object.values(ITEMS).find((def) => def.kind === 'armor')!;
    expect(instanceMakersMarkLine({ signer: 'Bet' }, crafted)).not.toBe('');
  });

  it('names the chat link for the exact copy', () => {
    expect(lootCopyAriaName(skull, betsSkull)).toBe("Bet's Skull");
    expect(lootCopyAriaName(skull)).toBe('Trophy Skull');
  });

  it('the grant receipt carries the copy, so the chat line links the named skull', () => {
    const events: SimEvent[] = [];
    emitInventoryReceipt(
      { emit: (ev) => events.push(ev) },
      7,
      WORLD_PVP_SKULL_ITEM_ID,
      skull.name,
      1,
      undefined,
      betsSkull,
    );
    const receipt = events[0] as Extract<SimEvent, { type: 'loot' }>;
    expect(receipt).toMatchObject({
      type: 'loot',
      pid: 7,
      text: 'You receive: Trophy Skull.',
      itemId: WORLD_PVP_SKULL_ITEM_ID,
      instance: { signer: 'Bet' },
      count: 1,
    });
    // An ordinary signed copy (a crafted piece) keeps the plain receipt shape.
    const plain: SimEvent[] = [];
    emitInventoryReceipt({ emit: (ev) => plain.push(ev) }, 7, 'stag_antler', 'x', 1, undefined, {
      signer: 'Bet',
    });
    expect(plain[0]).not.toHaveProperty('instance');

    const appended: Array<{ id: string; instance?: ItemInstancePayload }> = [];
    const doc = {
      createElement: () => ({ append: () => {} }),
      createTextNode: () => ({}),
    } as unknown as Document;
    expect(lootQualityReceiptText(receipt, (value) => `t:${value}`)).not.toContain('t:');
    const body = lootQualityReceiptBody(
      doc,
      receipt,
      (value) => value,
      (_p, id, copy) => {
        appended.push({ id, instance: copy });
      },
    );
    expect(Array.isArray(body)).toBe(true);
    expect(appended).toEqual([{ id: WORLD_PVP_SKULL_ITEM_ID, instance: { signer: 'Bet' } }]);
  });
});
