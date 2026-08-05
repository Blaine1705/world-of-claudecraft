// Craft Cast System Phase 4: disenchant / apply-enchant / salvage are
// gather-style non-spell casts at a fixed 1.5 s. Start admits without
// consume; complete applies the resolve body; cancel is safe. confirmReplace
// still gates start for already-enchanted targets. No action_throttle.

import { describe, expect, it } from 'vitest';
import { cancelCast } from '../src/sim/combat/casting_lifecycle';
import { ENCHANT_FAMILY_CAST_DURATION_SEC } from '../src/sim/content/professions';
import {
  applyEnchant,
  disenchantItem,
  resolveApplyEnchant,
} from '../src/sim/professions/enchanting';
import { salvageItem } from '../src/sim/professions/salvage';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import {
  DISENCHANT_CAST_ID,
  ENCHANT_CAST_ID,
  type Entity,
  SALVAGE_CAST_ID,
} from '../src/sim/types';
import { completeEnchantFamilyCast } from './helpers/enchant_family_cast';

const SWORD = 'eastbrook_arming_sword';
const MIGHT = 'enchant_weapon_might';
const GREATER = 'enchant_weapon_greater_might';
const TUNIC = 'recruit_tunic';

function makeSim(seed = 42): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: false });
}

function playerOf(sim: Sim): { p: Entity; meta: PlayerMeta; pid: number } {
  const pid = sim.playerId;
  const meta = sim.players.get(pid);
  const p = (sim as unknown as { entities: Map<number, Entity> }).entities.get(pid);
  if (!meta || !p) throw new Error('player missing');
  return { p, meta, pid };
}

describe('enchant-family cast duration', () => {
  it('pins the fixed 1.5 s content constant', () => {
    expect(ENCHANT_FAMILY_CAST_DURATION_SEC).toBe(1.5);
  });
});

describe('disenchant cast', () => {
  it('starts DISENCHANT_CAST_ID without consuming the item', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    sim.addItem(SWORD, 1, pid);
    const result = disenchantItem(sim.ctx, SWORD, pid);
    expect(result.ok).toBe(true);
    expect(result.casting).toBe(true);
    expect(p.castingAbility).toBe(DISENCHANT_CAST_ID);
    expect(p.castTotal).toBe(ENCHANT_FAMILY_CAST_DURATION_SEC);
    expect(p.castRemaining).toBe(ENCHANT_FAMILY_CAST_DURATION_SEC);
    expect(p.enchantCastItemId).toBe(SWORD);
    expect(sim.countItem(SWORD, pid)).toBe(1);
    expect(sim.countItem('arcane_dust', pid)).toBe(0);
  });

  it('complete destroys the item and grants materials', () => {
    const sim = makeSim();
    const { pid } = playerOf(sim);
    sim.addItem(SWORD, 1, pid);
    expect(disenchantItem(sim.ctx, SWORD, pid).casting).toBe(true);
    completeEnchantFamilyCast(sim);
    expect(sim.countItem(SWORD, pid)).toBe(0);
    expect(sim.countItem('arcane_dust', pid)).toBeGreaterThan(0);
    expect(sim.lastDisenchantResult?.ok).toBe(true);
  });

  it('cancel mid-cast leaves inventory and session fields inert', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    sim.addItem(SWORD, 1, pid);
    expect(disenchantItem(sim.ctx, SWORD, pid).casting).toBe(true);
    cancelCast(sim.ctx, p);
    expect(p.castingAbility).toBeNull();
    expect(p.enchantCastItemId).toBe('');
    expect(p.enchantCastBagSlot).toBe(-1);
    expect(sim.countItem(SWORD, pid)).toBe(1);
    expect(sim.countItem('arcane_dust', pid)).toBe(0);
  });

  it('denies busy when already casting', () => {
    const sim = makeSim();
    const { pid } = playerOf(sim);
    sim.addItem(SWORD, 2, pid);
    expect(disenchantItem(sim.ctx, SWORD, pid).casting).toBe(true);
    const second = disenchantItem(sim.ctx, SWORD, pid);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('busy');
    expect(sim.countItem(SWORD, pid)).toBe(2);
  });
});

describe('salvage cast', () => {
  it('starts SALVAGE_CAST_ID without consuming the item', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    sim.addItem(TUNIC, 1, pid);
    const result = salvageItem(sim.ctx, TUNIC, pid);
    expect(result.ok).toBe(true);
    expect(result.casting).toBe(true);
    expect(p.castingAbility).toBe(SALVAGE_CAST_ID);
    expect(p.castTotal).toBe(ENCHANT_FAMILY_CAST_DURATION_SEC);
    expect(p.enchantCastItemId).toBe(TUNIC);
    expect(sim.countItem(TUNIC, pid)).toBe(1);
  });

  it('complete destroys and grants materials; cancel is safe', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    sim.addItem(TUNIC, 1, pid);
    expect(salvageItem(sim.ctx, TUNIC, pid).casting).toBe(true);
    cancelCast(sim.ctx, p);
    expect(sim.countItem(TUNIC, pid)).toBe(1);

    expect(salvageItem(sim.ctx, TUNIC, pid).casting).toBe(true);
    completeEnchantFamilyCast(sim);
    expect(sim.countItem(TUNIC, pid)).toBe(0);
    expect(sim.lastSalvageResult?.ok).toBe(true);
    expect(sim.lastSalvageResult?.materialItemId).toBeTruthy();
  });
});

describe('apply-enchant cast', () => {
  it('starts ENCHANT_CAST_ID without spending reagents or transforming the copy', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    sim.addItem(SWORD, 1, pid);
    sim.addItem('arcane_dust', 5, pid);
    const result = applyEnchant(sim.ctx, SWORD, MIGHT, pid);
    expect(result.ok).toBe(true);
    expect(result.casting).toBe(true);
    expect(p.castingAbility).toBe(ENCHANT_CAST_ID);
    expect(p.enchantCastItemId).toBe(SWORD);
    expect(p.enchantCastEnchantId).toBe(MIGHT);
    expect(p.enchantCastConfirmReplace).toBe(false);
    expect(sim.countItem('arcane_dust', pid)).toBe(5);
    expect(sim.countEnchantableItem(SWORD, pid)).toBe(1);
  });

  it('complete applies the enchant and spends reagents', () => {
    const sim = makeSim();
    const { pid } = playerOf(sim);
    sim.addItem(SWORD, 1, pid);
    sim.addItem('arcane_dust', 5, pid);
    expect(applyEnchant(sim.ctx, SWORD, MIGHT, pid).casting).toBe(true);
    completeEnchantFamilyCast(sim);
    expect(sim.countItem('arcane_dust', pid)).toBe(0);
    expect(sim.countEnchantableItem(SWORD, pid)).toBe(0);
    expect(sim.countItem(SWORD, pid)).toBe(1);
    expect(sim.lastEnchantResult?.ok).toBe(true);
  });

  it('already_enchanted denies at start without confirmReplace (no cast)', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    // Instant resolve path to set up an enchanted copy (resolve is still the
    // complete body; entry points are cast-paced).
    sim.addItem(SWORD, 1, pid);
    sim.addItem('arcane_dust', 5, pid);
    expect(resolveApplyEnchant(sim.ctx, pid, SWORD, MIGHT).ok).toBe(true);
    sim.addItem('arcane_essence', 2, pid);
    sim.addItem('arcane_shard', 1, pid);

    const denied = applyEnchant(sim.ctx, SWORD, GREATER, pid, undefined, false);
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe('already_enchanted');
    expect(p.castingAbility).toBeNull();
    expect(sim.countItem('arcane_essence', pid)).toBe(2);
  });

  it('confirmReplace admits and captures the flag for complete', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    sim.addItem(SWORD, 1, pid);
    sim.addItem('arcane_dust', 5, pid);
    expect(resolveApplyEnchant(sim.ctx, pid, SWORD, MIGHT).ok).toBe(true);
    // Greater Might reagents (shard + essence only).
    sim.addItem('arcane_essence', 2, pid);
    sim.addItem('arcane_shard', 1, pid);

    const start = applyEnchant(sim.ctx, SWORD, GREATER, pid, undefined, true);
    expect(start.ok).toBe(true);
    expect(start.casting).toBe(true);
    expect(p.enchantCastConfirmReplace).toBe(true);
    expect(p.enchantCastEnchantId).toBe(GREATER);
    completeEnchantFamilyCast(sim);
    expect(sim.lastEnchantResult?.ok).toBe(true);
    expect(sim.lastEnchantResult?.enchantId).toBe(GREATER);
    const slot = sim.players.get(pid)!.inventory.find((s) => s.itemId === SWORD);
    expect(slot?.instance?.enchant).toBe(GREATER);
  });

  it('cancel mid-apply leaves reagents and unenchanted copy', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    sim.addItem(SWORD, 1, pid);
    sim.addItem('arcane_dust', 5, pid);
    expect(applyEnchant(sim.ctx, SWORD, MIGHT, pid).casting).toBe(true);
    cancelCast(sim.ctx, p);
    expect(sim.countItem('arcane_dust', pid)).toBe(5);
    expect(sim.countEnchantableItem(SWORD, pid)).toBe(1);
    expect(p.enchantCastEnchantId).toBe('');
    expect(p.enchantCastConfirmReplace).toBe(false);
  });
});

describe('enchant-family throttle retirement', () => {
  it('more than 10 sequential completes succeed; concurrent start is busy not throttled', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    // One action kind at a time to keep bag space simple.
    for (let i = 0; i < 12; i++) sim.addItem(TUNIC, 1, pid);

    for (let i = 0; i < 11; i++) {
      const start = salvageItem(sim.ctx, TUNIC, pid);
      expect(start.ok, `salvage start #${i + 1}`).toBe(true);
      expect(start.casting, `salvage cast #${i + 1}`).toBe(true);
      expect(start.reason).not.toBe('throttled');
      completeEnchantFamilyCast(sim);
      expect(sim.lastSalvageResult?.ok, `salvage complete #${i + 1}`).toBe(true);
    }
    // 12th start works (no 10/60 quota).
    expect(salvageItem(sim.ctx, TUNIC, pid).casting).toBe(true);
    // While casting, another family action is busy, not throttled.
    sim.addItem(SWORD, 1, pid);
    const busy = disenchantItem(sim.ctx, SWORD, pid);
    expect(busy.ok).toBe(false);
    expect(busy.reason).toBe('busy');
    expect(p.castingAbility).toBe(SALVAGE_CAST_ID);
  });
});
