// /dev bis: outfit the caller with a deterministic best-in-slot epic set so
// playtesting at the level cap never starts with a vendor shopping trip. Dev
// command only (never reachable in production); picks are pure functions of
// the item table, the player's class, and the selected spec, so repeated runs
// equip the identical set. Draws no rng.
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports, no Math.random or
// Date.now (enforced by tests/architecture.test.ts).

import { devKitRole } from '../content/dev_kit_roles';
import { ITEMS } from '../data';
import { roleItemScore } from '../dev_kit';
import { recalcPlayerStats } from '../entity';
import { canEquipItemInSlot, isShieldItem } from '../equipment_rules';
import type { SimContext } from '../sim_context';
import type { EquipSlot, ItemDef, PlayerClass } from '../types';
import { ALL_EQUIP_SLOTS } from '../types';

// Fallback single-number item power for a SPEC-LESS character only: weapon dps
// dominates for weapons, stat budget carries the rest. With a spec chosen the
// fresh-20 kit's role scorer decides instead: this flat sum is exactly how an
// elemental request used to come out wearing the enhancement stat sticks (all
// stats counted equally, so the biggest melee budget always won).
function flatScore(item: ItemDef): number {
  let total = 0;
  if (item.kind === 'weapon' && item.weapon) {
    total += (((item.weapon.min + item.weapon.max) / 2) * 12) / Math.max(0.1, item.weapon.speed);
  }
  for (const value of Object.values(item.stats ?? {})) total += value as number;
  return total;
}

// Craven Thrust and the Duskveil openers require a mainhand dagger, so every
// rogue gets one unless they have explicitly committed to Thuggery (the one
// spec that never thrusts and prefers raw weapon damage). A spec-less rogue
// running /dev bis before picking must not be locked out of half the kit.
function wantsDaggerMainhand(cls: string, spec: string | null): boolean {
  return cls === 'rogue' && spec !== 'combat';
}

function isTwoHanded(item: ItemDef): boolean {
  return item.kind === 'weapon' && item.hand === 'twohand';
}

export function bestEpicGearFor(
  cls: string,
  spec: string | null,
): Partial<Record<EquipSlot, string>> {
  // The same role model the fresh-20 kit dresses by: per-spec identity-stat
  // weights, melee-vs-caster weapon handling, and the hands contract (shield /
  // dual-wield). Reusing it is the fix for the spec-blind scorer above.
  const role = spec ? devKitRole(cls as PlayerClass, spec) : null;
  const score = role ? (item: ItemDef): number => roleItemScore(role, item) : flatScore;
  const epics = Object.values(ITEMS).filter(
    (item) =>
      item.quality === 'epic' &&
      (item.kind === 'armor' || item.kind === 'weapon' || item.kind === 'held_offhand'),
  );
  const picks: Partial<Record<EquipSlot, string>> = {};
  const used = new Set<string>();
  const best = (candidates: readonly ItemDef[]): ItemDef | null => {
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
  };
  const legal = (slot: EquipSlot, filter?: (item: ItemDef) => boolean): ItemDef[] =>
    epics.filter(
      (item) =>
        !used.has(item.id) &&
        canEquipItemInSlot(cls as Parameters<typeof canEquipItemInSlot>[0], item, slot, spec) &&
        (!filter || filter(item)),
    );
  const take = (slot: EquipSlot, item: ItemDef | null): void => {
    if (!item) return;
    picks[slot] = item.id;
    used.add(item.id);
  };

  // Armor, jewelry and trinkets first; the hands resolve together below so a
  // two-hander and a shield cannot fight each other.
  for (const slot of ALL_EQUIP_SLOTS) {
    if (slot === 'mainhand' || slot === 'offhand') continue;
    take(slot, best(legal(slot)));
  }

  // A dagger class fantasy (Craven Thrust and the Duskveil openers require
  // one) narrows the mainhand to daggers whenever any dagger epic exists.
  const mainhandPool = (oneHandOnly: boolean): ItemDef[] => {
    let candidates = legal('mainhand', (item) => !oneHandOnly || !isTwoHanded(item));
    if (wantsDaggerMainhand(cls, spec)) {
      const daggers = candidates.filter(
        (item) => item.kind === 'weapon' && item.weapon?.dagger === true,
      );
      if (daggers.length > 0) candidates = daggers;
    }
    return candidates;
  };

  if (role?.hands === 'shield') {
    // A shield role wants a ONE-hander so the shield fits beside it.
    take('mainhand', best(mainhandPool(true)));
    take('offhand', best(legal('offhand', (item) => isShieldItem(item))));
  } else if (role?.hands === 'dualWield' || (!role && cls === 'rogue')) {
    // Two one-handers read strictly better for a dual-wielder; a spec-less
    // rogue keeps the dual-wield shape it always had here.
    take('mainhand', best(mainhandPool(true)));
    const offhand = best(legal('offhand', (item) => item.kind === 'weapon' && !isTwoHanded(item)));
    // An empty hand is worse than a held item when no second weapon is legal.
    take('offhand', offhand ?? best(legal('offhand', (item) => item.kind === 'held_offhand')));
  } else {
    // Everyone else takes the best weapon the role scorer likes, two-handers
    // included (the role weights already keep a caster on caster weapons);
    // a one-hander pairs with the best remaining legal offhand piece.
    const mainhand = best(mainhandPool(false));
    take('mainhand', mainhand);
    if (mainhand && !isTwoHanded(mainhand)) {
      take('offhand', best(legal('offhand', (item) => !isTwoHanded(item))));
    }
  }
  return picks;
}

// Applies the picks to the caller: dev-only direct equipment write, cleared
// crafted-instance payloads, one stat recalc. Returns the equipped count.
// `spec` overrides the character's current spec so one character can be dressed
// for any of its class's specs (the /dev bis [spec] and BIS-20 kit GUI path);
// omitted, the current spec decides as before.
export function equipBestInSlotForDev(ctx: SimContext, pid: number, spec?: string): number {
  const meta = ctx.players.get(pid);
  const player = ctx.entities.get(pid);
  if (!meta || !player) return 0;
  const picks = bestEpicGearFor(meta.cls, spec ?? meta.talents?.spec ?? null);
  let equipped = 0;
  for (const [slot, itemId] of Object.entries(picks) as [EquipSlot, string][]) {
    meta.equipment[slot] = itemId;
    if (meta.equipmentInstance) delete meta.equipmentInstance[slot];
    equipped++;
  }
  recalcPlayerStats(player, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
  player.hp = player.maxHp;
  return equipped;
}
