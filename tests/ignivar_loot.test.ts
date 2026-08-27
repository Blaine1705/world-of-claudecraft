// Crucible of the Last Spring raid loot: the ilvl-35 tier is budget-exact and
// carries exactly the identities the plan authored (docs/prd/ignivar-raid-loot.md
// + docs/prd/ignivar-raid-loot-items.md). The sweep here is the acceptance gate
// the plan names: every gear piece reads item level 35 by derivation (source 26 +
// epic 6 + raid 3) with primary stats exactly on the item_budget.ts line, the Hit
// program appears only where authored, and Healing Power never rides a damage
// identity.
import { describe, expect, it } from 'vitest';
import { HEROIC_BOSS_LOOT } from '../src/sim/content/heroic_loot';
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
  IGNIVAR_WEAPON_ITEMS,
} from '../src/sim/content/ignivar_loot';
import { WEAPON_TYPE_BY_ITEM } from '../src/sim/content/weapon_skin_rules';
import { ITEMS, MOBS } from '../src/sim/data';
import {
  expectedStatBudget,
  itemFromRaid,
  itemLevel,
  itemSourceLevel,
  primaryStatSum,
} from '../src/sim/item_level';
import type { ItemDef } from '../src/sim/types';
import { ITEM_WEAPON_VARIANTS } from '../src/ui/weapon_variants';

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
    expect(IGNIVAR_LOOT_ITEM_IDS.length).toBe(202);
    expect(Object.keys(IGNIVAR_SET_ITEMS).length).toBe(29 * 5);
    expect(Object.keys(IGNIVAR_SIGIL_ITEMS).length).toBe(15);
    expect(Object.keys(IGNIVAR_OFFSET_ITEMS).length).toBe(20);
    expect(Object.keys(IGNIVAR_JEWELRY_ITEMS).length).toBe(8);
    expect(Object.keys(IGNIVAR_HELD_ITEMS).length).toBe(4);
    expect(Object.keys(IGNIVAR_WEAPON_ITEMS).length).toBe(10);
  });

  it('merges every id into ITEMS without collisions', () => {
    for (const id of IGNIVAR_LOOT_ITEM_IDS) {
      expect(ITEMS[id], id).toBeTruthy();
      expect(ITEMS[id].id, id).toBe(id);
    }
  });
});

describe('ignivar loot: every gear piece is item level 35 and budget-exact', () => {
  it('derives ilvl 35 from source 26 + epic + raid for all 187 gear pieces', () => {
    const gear = gearItems();
    expect(gear.length).toBe(187);
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
      mainhand: 25,
      offhand: 18,
    };
    for (const item of gearItems()) {
      const isTwoHand = item.kind === 'weapon' && item.hand === 'twohand';
      const want = expectedStatBudget(item);
      expect(want, `${item.id} has a derivable budget`).toBe(
        // Two-handers carry the TWOHAND_STAT_MULT premium over the mainhand line.
        isTwoHand ? 33 : SLOT_BUDGET[item.slot as string],
      );
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
    const HIT_30 = new Set(['cinderfang_kris', 'slagrender_cleaver', 'wand_of_quenched_sparks']);
    for (const item of Object.values(IGNIVAR_LOOT_ITEMS)) {
      const want = HIT_60.has(item.id)
        ? 60
        : HIT_25.has(item.id)
          ? 25
          : HIT_30.has(item.id)
            ? 30
            : 0;
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
    // ... plus the healing staff and the crozier.
    expect(healPieces).toBe(6 * 5 + 6 + 2 + 2 + 2);
    // 8 sd sets x 5 + 3 sd waist/feet pairs + 2 sd jewelry + the cinder held.
    // ... plus the damage staff and the wand.
    expect(sdPieces).toBe(8 * 5 + 6 + 2 + 1 + 2);
  });
});

describe('ignivar loot: the 10 weapons', () => {
  it('every weapon rides the ilvl-35 dps curve with its full registration', () => {
    // weaponDpsBudget(35) = 17.2; two-handers carry the TWOHAND_DPS_MULT
    // premium (19.78). Damage ranges were authored as round(avg x 0.8) to
    // round(avg x 1.2), so realized dps sits within rounding of the target.
    for (const item of Object.values(IGNIVAR_WEAPON_ITEMS)) {
      expect(item.kind, item.id).toBe('weapon');
      if (item.kind !== 'weapon') continue;
      const weapon = item.weapon;
      expect(weapon, item.id).toBeTruthy();
      if (!weapon) continue;
      const dps = (weapon.min + weapon.max) / 2 / weapon.speed;
      const target = item.hand === 'twohand' ? 17.2 * 1.15 : 17.2;
      expect(Math.abs(dps - target), `${item.id} dps ${dps} vs ${target}`).toBeLessThan(0.35);
      // Full weapon registration: a type row (skin eligibility + the guard in
      // tests/weapon_skins.test.ts) and a held-model variant with painted art.
      expect(WEAPON_TYPE_BY_ITEM[item.id], `${item.id} type row`).toBeTruthy();
      expect(ITEM_WEAPON_VARIANTS[item.id], `${item.id} variant row`).toBeTruthy();
      // Weapons carry the 70/30 rating pair.
      const ratings = [item.critRating ?? 0, item.hasteRating ?? 0, item.hitRating ?? 0].sort(
        (a, b) => b - a,
      );
      expect(ratings, item.id).toEqual([70, 30, 0]);
    }
  });

  it('the longbow is a bow and the kris is a dagger (backstab eligibility)', () => {
    expect(WEAPON_TYPE_BY_ITEM.emberflight_longbow).toBe('bow');
    expect(WEAPON_TYPE_BY_ITEM.cinderfang_kris).toBe('dagger');
  });
});

describe('ignivar loot: the boss drop tables', () => {
  const groupsOf = (
    entries: readonly { itemId?: string; chance: number; rollGroup?: string }[],
  ) => {
    const groups = new Map<string, { ids: string[]; sum: number }>();
    for (const entry of entries) {
      if (!entry.rollGroup) continue;
      const group = groups.get(entry.rollGroup) ?? { ids: [], sum: 0 };
      if (entry.itemId) group.ids.push(entry.itemId);
      group.sum += entry.chance;
      groups.set(entry.rollGroup, group);
    }
    return groups;
  };

  it('Ignivar pays two sigil slots, a neck, and the raid copper on both difficulties', () => {
    const loot = MOBS.ignivar_herald_of_the_last_flame.loot ?? [];
    const money = loot[0];
    expect(money).toMatchObject({ copper: 150000, chance: 1 });
    expect(money.heroicCopper).toBeGreaterThan(0);
    const groups = groupsOf(loot);
    expect([...groups.keys()]).toEqual([
      'ignivar_sigil_mantle',
      'ignivar_sigil_grip',
      'ignivar_jewelry',
      'ignivar_offset',
    ]);
    expect(groups.get('ignivar_sigil_mantle')?.ids).toEqual([
      'sigil_anvil_shoulder',
      'sigil_ember_shoulder',
      'sigil_tempest_shoulder',
    ]);
    expect(groups.get('ignivar_sigil_grip')?.ids).toEqual([
      'sigil_anvil_gloves',
      'sigil_ember_gloves',
      'sigil_tempest_gloves',
    ]);
    expect(groups.get('ignivar_jewelry')?.ids).toEqual([
      'pendant_of_the_first_tempering',
      'ignivars_ember_choker',
      'locket_of_the_last_flame',
      'heartspring_amulet',
    ]);
    for (const [name, group] of groups) expect(group.sum, name).toBeCloseTo(1, 6);
  });

  it('Varkhul pays two sigil slots, the feet-and-held group, a ring, and copper', () => {
    const loot = MOBS.varkhul_forgefather_of_the_last_flame.loot ?? [];
    expect(loot[0]).toMatchObject({ copper: 200000, chance: 1 });
    const groups = groupsOf(loot);
    expect([...groups.keys()]).toEqual([
      'varkhul_sigil_legging',
      'varkhul_sigil_helm',
      'varkhul_offset',
      'varkhul_rings',
    ]);
    const offset = groups.get('varkhul_offset');
    expect(offset?.ids.length).toBe(12); // the 10 feet pieces + both held offhands
    expect(offset?.ids).toContain('orb_of_the_last_spring');
    expect(offset?.ids).toContain('cinder_of_the_first_design');
    for (const id of offset?.ids ?? []) {
      expect(['feet', 'offhand'], id).toContain(ITEMS[id].slot);
    }
    expect(groups.get('varkhul_rings')?.ids).toEqual([
      'seal_of_the_forgewall',
      'band_of_marked_strikes',
      'circle_of_cinders',
      'loop_of_quiet_springs',
    ]);
    for (const [name, group] of groups) expect(group.sum, name).toBeCloseTo(1, 6);
  });

  it('Heroic appends pay the Robe sigil on both bosses and the shields on Varkhul', () => {
    const ignivar = HEROIC_BOSS_LOOT.ignivar_herald_of_the_last_flame ?? [];
    const varkhul = HEROIC_BOSS_LOOT.varkhul_forgefather_of_the_last_flame ?? [];
    const ignivarGroups = groupsOf(ignivar);
    const varkhulGroups = groupsOf(varkhul);
    expect(ignivarGroups.get('ignivar_h_sigil_robe')?.ids).toEqual([
      'sigil_anvil_chest',
      'sigil_ember_chest',
      'sigil_tempest_chest',
    ]);
    expect(varkhulGroups.get('varkhul_h_sigil_robe')?.ids).toEqual([
      'sigil_anvil_chest',
      'sigil_ember_chest',
      'sigil_tempest_chest',
    ]);
    expect(varkhulGroups.get('varkhul_h_shields')?.ids).toEqual([
      'bulwark_of_the_inner_crucible',
      'ember_wardens_barrier',
    ]);
    for (const groups of [ignivarGroups, varkhulGroups])
      for (const [name, group] of groups) expect(group.sum, name).toBeCloseTo(1, 6);
  });

  it('every drop-table id resolves in the merged item table', () => {
    const all = [
      ...(MOBS.ignivar_herald_of_the_last_flame.loot ?? []),
      ...(MOBS.varkhul_forgefather_of_the_last_flame.loot ?? []),
      ...(HEROIC_BOSS_LOOT.ignivar_herald_of_the_last_flame ?? []),
      ...(HEROIC_BOSS_LOOT.varkhul_forgefather_of_the_last_flame ?? []),
    ];
    for (const entry of all) {
      if (entry.itemId) expect(ITEMS[entry.itemId], entry.itemId).toBeTruthy();
    }
  });
});
