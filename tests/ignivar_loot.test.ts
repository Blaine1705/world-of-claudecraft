// Crucible of the Last Spring raid loot: the ilvl-35 tier is budget-exact and
// carries exactly the identities the plan authored (docs/prd/ignivar-raid-loot.md
// + docs/prd/ignivar-raid-loot-items.md). The sweep here is the acceptance gate
// the plan names: every gear piece reads item level 35 by derivation (source 26 +
// epic 6 + raid 3) with primary stats exactly on the item_budget.ts line, the Hit
// program appears only where authored, and Healing Power never rides a damage
// identity.
import { describe, expect, it } from 'vitest';
import {
  CRUCIBLE_VENDOR_STOCK,
  IGNIVAR_HELD_ITEMS,
  IGNIVAR_JEWELRY_ITEMS,
  IGNIVAR_LOOT_ITEM_IDS,
  IGNIVAR_LOOT_ITEMS,
  IGNIVAR_OFFSET_ITEMS,
  IGNIVAR_RAID_LOOT_SOURCE_LEVEL,
  IGNIVAR_SET_ITEMS,
  IGNIVAR_SIGIL_ITEMS,
} from '../src/sim/content/ignivar_loot';
import { ITEMS } from '../src/sim/data';
import {
  expectedStatBudget,
  itemFromRaid,
  itemLevel,
  itemSourceLevel,
  primaryStatSum,
} from '../src/sim/item_level';
import type { ItemDef } from '../src/sim/types';

const TIER_SLOTS = ['helmet', 'shoulder', 'chest', 'gloves', 'legs'] as const;

// The settled balanced-mixed sigil partition: one mail, one leather, one cloth
// class per group (docs/prd/ignivar-raid-loot.md, "The three sigil groups").
const SIGIL_GROUPS: Record<string, readonly string[]> = {
  anvil: ['warrior', 'druid', 'mage'],
  ember: ['paladin', 'hunter', 'priest'],
  tempest: ['shaman', 'rogue', 'warlock'],
};

const gearItems = (): ItemDef[] =>
  Object.values(IGNIVAR_LOOT_ITEMS).filter((item) => item.kind !== 'tool');

describe('ignivar loot: catalog shape', () => {
  it('carries the exact authored counts', () => {
    expect(IGNIVAR_LOOT_ITEM_IDS.length).toBe(192);
    expect(Object.keys(IGNIVAR_SET_ITEMS).length).toBe(29 * 5);
    expect(Object.keys(IGNIVAR_SIGIL_ITEMS).length).toBe(15);
    expect(Object.keys(IGNIVAR_OFFSET_ITEMS).length).toBe(20);
    expect(Object.keys(IGNIVAR_JEWELRY_ITEMS).length).toBe(8);
    expect(Object.keys(IGNIVAR_HELD_ITEMS).length).toBe(4);
  });

  it('merges every id into ITEMS without collisions', () => {
    for (const id of IGNIVAR_LOOT_ITEM_IDS) {
      expect(ITEMS[id], id).toBeTruthy();
      expect(ITEMS[id].id, id).toBe(id);
    }
  });
});

describe('ignivar loot: every gear piece is item level 35 and budget-exact', () => {
  it('derives ilvl 35 from source 26 + epic + raid for all 177 gear pieces', () => {
    const gear = gearItems();
    expect(gear.length).toBe(177);
    for (const item of gear) {
      expect(itemSourceLevel(item.id), `${item.id} source`).toBe(IGNIVAR_RAID_LOOT_SOURCE_LEVEL);
      expect(itemFromRaid(item.id), `${item.id} raid flag`).toBe(true);
      expect(item.quality, item.id).toBe('epic');
      expect(itemLevel(item), `${item.id} ilvl`).toBe(35);
      expect(item.requiredLevel, item.id).toBe(20);
      expect(item.soulbound, item.id).toBe(true);
    }
  });

  it('every gear piece carries exactly its item-level stat budget', () => {
    // The per-slot budgets the catalog doc was reviewed against, pinned as
    // literals so a budget-formula drift cannot silently reprice the tier.
    const SLOT_BUDGET: Record<string, number> = {
      chest: 25,
      legs: 22,
      helmet: 21,
      shoulder: 18,
      gloves: 17,
      waist: 17,
      feet: 16,
      neck: 16,
      ring: 15,
      offhand: 18,
    };
    for (const item of gearItems()) {
      const want = expectedStatBudget(item);
      expect(want, `${item.id} has a derivable budget`).toBe(SLOT_BUDGET[item.slot as string]);
      expect(primaryStatSum(item), `${item.id} stat sum == budget`).toBe(want);
    }
  });
});

describe('ignivar loot: the 29 sets', () => {
  it('each set has the five tier slots, one class lock, and its own set tag', () => {
    const bySet = new Map<string, ItemDef[]>();
    for (const item of Object.values(IGNIVAR_SET_ITEMS)) {
      expect(item.set, item.id).toBeTruthy();
      const list = bySet.get(item.set as string) ?? [];
      list.push(item);
      bySet.set(item.set as string, list);
    }
    expect(bySet.size).toBe(29);
    for (const [setId, pieces] of bySet) {
      expect(pieces.length, setId).toBe(5);
      expect(new Set(pieces.map((p) => p.slot)), setId).toEqual(new Set(TIER_SLOTS));
      const classes = new Set(pieces.flatMap((p) => p.requiredClass ?? []));
      expect(classes.size, `${setId} single-class lock`).toBe(1);
      for (const piece of pieces) expect(piece.id, setId).toBe(`${setId}_${piece.slot}`);
    }
  });

  it('set pieces carry the 60/25 crit+haste rating pair and never Hit', () => {
    for (const item of Object.values(IGNIVAR_SET_ITEMS)) {
      const ratings = [item.critRating ?? 0, item.hasteRating ?? 0].sort((a, b) => b - a);
      expect(ratings, item.id).toEqual([60, 25]);
      expect(item.hitRating ?? 0, item.id).toBe(0);
    }
  });
});

describe('ignivar loot: sigils and redemption stock', () => {
  it('sigils follow the heroic_mark token pattern with the balanced-mixed class groups', () => {
    for (const sigil of Object.values(IGNIVAR_SIGIL_ITEMS)) {
      expect(sigil.kind, sigil.id).toBe('tool');
      expect(sigil.quality, sigil.id).toBe('epic');
      expect(sigil.soulbound, sigil.id).toBe(true);
      expect(sigil.noDiscard, sigil.id).toBe(true);
      expect(sigil.stackSize, sigil.id).toBe(20);
      const group = sigil.id.split('_')[1];
      expect(sigil.requiredClass, sigil.id).toEqual(SIGIL_GROUPS[group]);
      // Tokens are not gear: no slot, so no item level (and no budget gate).
      expect(sigil.slot, sigil.id).toBeUndefined();
      expect(itemLevel(sigil), sigil.id).toBeUndefined();
    }
  });

  it('the stock prices every set piece at one matching-slot sigil of its class group', () => {
    expect(CRUCIBLE_VENDOR_STOCK.length).toBe(29 * 5);
    const seen = new Set<string>();
    for (const offer of CRUCIBLE_VENDOR_STOCK) {
      expect(seen.has(offer.itemId), `${offer.itemId} listed once`).toBe(false);
      seen.add(offer.itemId);
      const piece = IGNIVAR_SET_ITEMS[offer.itemId];
      const sigil = IGNIVAR_SIGIL_ITEMS[offer.sigilId];
      expect(piece, offer.itemId).toBeTruthy();
      expect(sigil, offer.sigilId).toBeTruthy();
      // Slot match: sigil ids end in the tier slot they redeem.
      expect(offer.sigilId.endsWith(`_${piece.slot}`), `${offer.sigilId} slot`).toBe(true);
      // Group match: the sigil's class group contains the piece's class.
      const cls = (piece.requiredClass ?? [])[0];
      expect(sigil.requiredClass, `${offer.sigilId} covers ${cls}`).toContain(cls);
    }
    for (const id of Object.keys(IGNIVAR_SET_ITEMS)) {
      expect(seen.has(id), `${id} redeemable`).toBe(true);
    }
  });
});

describe('ignivar loot: the Hit program and affix directionality', () => {
  it('Hit appears exactly where the plan authored it', () => {
    const HIT_60 = new Set([
      'cord_of_the_last_flame',
      'cinderbark_cinch',
      'slagstalker_belt',
      'moonscorch_waistwrap',
      'forgewall_girdle',
      'warforged_waistguard',
      'stormkindled_chain',
    ]);
    const HIT_25 = new Set([
      'ignivars_ember_choker',
      'band_of_marked_strikes',
      'circle_of_cinders',
    ]);
    for (const item of Object.values(IGNIVAR_LOOT_ITEMS)) {
      const want = HIT_60.has(item.id) ? 60 : HIT_25.has(item.id) ? 25 : 0;
      expect(item.hitRating ?? 0, item.id).toBe(want);
    }
  });

  it('healer pieces carry Healing Power, damage pieces Spell Damage, never both', () => {
    let healPieces = 0;
    let sdPieces = 0;
    for (const item of gearItems()) {
      const hp = item.healPower ?? 0;
      const sp = item.spellPower ?? 0;
      expect(hp > 0 && sp > 0, `${item.id} never both affixes`).toBe(false);
      if (hp > 0) healPieces++;
      if (sp > 0) sdPieces++;
      // The affix follows the stat identity: Healing Power only on int+spi
      // (heal) lines, Spell Damage only on int-dominant (sd) lines.
      if (hp > 0 || sp > 0) {
        expect((item.stats?.int ?? 0) > 0, `${item.id} caster identity`).toBe(true);
        expect((item.stats?.str ?? 0) + (item.stats?.agi ?? 0), item.id).toBe(0);
      }
    }
    // 6 heal sets x 5 + 3 heal waist/feet pairs + 2 heal jewelry + barrier + orb.
    expect(healPieces).toBe(6 * 5 + 6 + 2 + 2);
    // 8 sd sets x 5 + 3 sd waist/feet pairs + 2 sd jewelry + the cinder held.
    expect(sdPieces).toBe(8 * 5 + 6 + 2 + 1);
  });
});
