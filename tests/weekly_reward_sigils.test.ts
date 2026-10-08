import { describe, expect, it, vi } from 'vitest';
import { decodeWeeklyRewardInfo } from '../src/net/weekly_rewards_wire';
import { IGNIVAR_SIGIL_ITEMS } from '../src/sim/content/ignivar_loot';
import { TALENTS } from '../src/sim/content/talents';
import { BUILTIN_WORLD, ITEMS, NPCS } from '../src/sim/data';
import { VARKHUL_BOSS_ID } from '../src/sim/ignivar_raid_ids';
import { requiredLevelFor } from '../src/sim/item_level_req';
import { Sim } from '../src/sim/sim';
import { IGNIVAR_BOSS_ID, type PlayerClass } from '../src/sim/types';
import { weeklyRewardKindAllowed } from '../src/sim/weekly_reward_eligibility';
import { weeklyRewardTableOptions } from '../src/sim/weekly_reward_options';
import { weeklyBossLootPool } from '../src/sim/weekly_reward_tables';
import {
  emptyWeeklyRewards,
  finishWeeklyRewardOpen,
  prepareWeeklyRewardOpen,
  sanitizeWeeklyRewards,
  WEEKLY_KEEPER_ID,
  type WeeklyVaultBatch,
  weeklyLootPool,
  weeklyRewardInfoFor,
} from '../src/sim/weekly_rewards';

const GROUPS: readonly [PlayerClass, string][] = [
  ['warrior', 'anvil'],
  ['druid', 'anvil'],
  ['mage', 'anvil'],
  ['paladin', 'ember'],
  ['hunter', 'ember'],
  ['priest', 'ember'],
  ['shaman', 'tempest'],
  ['rogue', 'tempest'],
  ['warlock', 'tempest'],
];
const sigils = (ids: string[]) => ids.filter((id) => id.startsWith('sigil_')).sort();
const expected = (group: string, slots: string[]) =>
  slots.map((slot) => `sigil_${group}_${slot}`).sort();

describe('Weekly Vault redemption sigils', () => {
  it('requires exact authored sigil membership rather than allowing arbitrary tools or sigil prefixes', () => {
    const template = ITEMS.sigil_anvil_chest;
    expect(weeklyRewardKindAllowed(template)).toBe(true);
    for (const id of ['sigil_unknown_chest', '__proto__', 'constructor']) {
      expect(weeklyRewardKindAllowed({ ...template, id })).toBe(false);
    }
  });
  it.each(GROUPS)('admits only the %s sigil group across every loot focus', (cls, group) => {
    for (const spec of [undefined, ...TALENTS[cls].specs.map((s) => s.id)]) {
      for (const heroic of [false, true]) {
        const pool = heroic ? 'raid_heroic' : 'raid';
        const chest = heroic ? ['chest'] : [];
        expect(sigils(weeklyBossLootPool(IGNIVAR_BOSS_ID, pool, cls, spec))).toEqual(
          expected(group, ['shoulder', 'gloves', ...chest]),
        );
        expect(sigils(weeklyBossLootPool(VARKHUL_BOSS_ID, pool, cls, spec))).toEqual(
          expected(group, ['helmet', 'legs', ...chest]),
        );
        expect(sigils(weeklyLootPool(pool, cls, [0, 2, 2], spec))).toEqual(
          expected(group, ['shoulder', 'gloves', 'helmet', 'legs', ...chest]),
        );
      }
      for (const pool of ['world', 'pvp', 'dungeon', 'dungeon_heroic'] as const) {
        expect(sigils(weeklyLootPool(pool, cls, undefined, spec))).toEqual([]);
      }
    }
  });

  it('keeps source unlocks, level limits, and weekly duplicate reservations for sigils', () => {
    const batch: WeeklyVaultBatch = {
      resetAtMs: 1000,
      bossUnlocks: { [IGNIVAR_BOSS_ID]: 2 },
      choices: [{ pool: 'raid_heroic' }],
    };
    const options = (level = 20) =>
      weeklyRewardTableOptions(batch, batch.choices[0], 'mage', level, 'fire');
    expect(options().map((t) => t.id)).toEqual([IGNIVAR_BOSS_ID]);
    expect(sigils(options()[0].items)).toEqual(expected('anvil', ['shoulder', 'gloves', 'chest']));
    const id = 'sigil_anvil_gloves';
    const level = requiredLevelFor(ITEMS[id]) - 3;
    expect(options(level).flatMap((t) => t.items)).toContain(id);
    expect(options(level - 1).flatMap((t) => t.items)).not.toContain(id);
    batch.choices.push({ pool: 'raid', itemId: id });
    expect(options().flatMap((t) => t.items)).not.toContain(id);
    batch.bossUnlocks![IGNIVAR_BOSS_ID] = 1;
    expect(options()).toEqual([]);
  });

  it('preserves all authored sigils through saved and public ledgers while excluding other non-equipment', () => {
    expect(Object.keys(IGNIVAR_SIGIL_ITEMS)).toHaveLength(15);
    for (const id of Object.keys(IGNIVAR_SIGIL_ITEMS)) {
      const state = emptyWeeklyRewards(604800000);
      state.vaults = [
        { resetAtMs: 1000, choices: [{ pool: 'raid_heroic', itemId: id, opened: true }] },
      ];
      for (const publicView of [false, true]) {
        expect(
          sanitizeWeeklyRewards(JSON.parse(JSON.stringify(state)), publicView)?.vaults[0].choices[0]
            .itemId,
        ).toBe(id);
      }
    }
    const excluded = [
      'lastflame_core',
      'forgefathers_ember',
      'pattern_crucible_tank_mail',
      'mistcallers_duffel',
      'reins_grag_bear',
    ];
    for (const id of excluded) {
      const state = emptyWeeklyRewards(604800000);
      state.vaults = [
        { resetAtMs: 1000, choices: [{ pool: 'raid_heroic', itemId: id, opened: true }] },
      ];
      expect(sanitizeWeeklyRewards(state)?.vaults).toEqual([]);
      for (const [cls] of GROUPS) expect(weeklyLootPool('raid_heroic', cls)).not.toContain(id);
    }
  });

  it('rolls a previewed sigil, retains it after save failure and reload, and grants one on claim', () => {
    const sim = new Sim({
      seed: 42,
      noPlayer: true,
      playerClass: 'mage',
      lockoutNowMs: () => 2000,
      weeklyRaidResetMs: () => 604800000,
      world: {
        ...BUILTIN_WORLD,
        camps: [],
        npcs: { [WEEKLY_KEEPER_ID]: NPCS[WEEKLY_KEEPER_ID] },
        groundObjects: [],
      },
    });
    const pid = sim.addPlayer('mage', 'Collector');
    const player = sim.entities.get(pid)!;
    player.level = 20;
    player.pos = {
      ...[...sim.entities.values()].find((e) => e.templateId === WEEKLY_KEEPER_ID)!.pos,
    };
    const meta = sim.players.get(pid)!;
    const state = emptyWeeklyRewards(604800000);
    state.lootSpec = 'fire';
    state.vaults = [
      {
        resetAtMs: 1000,
        bossUnlocks: { [IGNIVAR_BOSS_ID]: 2 },
        choices: [{ pool: 'raid_heroic' }],
      },
    ];
    meta.weeklyRewards = state;
    const id = 'sigil_anvil_chest';
    const candidates = weeklyRewardTableOptions(
      state.vaults[0],
      state.vaults[0].choices[0],
      'mage',
      20,
      'fire',
    )[0].items;
    expect(candidates).toContain(id);
    const pick = vi.spyOn(sim.ctx.rng, 'pick').mockImplementation((items) => {
      expect(items).toEqual(candidates);
      return items[items.indexOf(id)];
    });
    const opening = prepareWeeklyRewardOpen(sim.ctx, '1000:0', pid, undefined, [IGNIVAR_BOSS_ID])!;
    expect(opening.itemId).toBe(id);
    const pendingSaved = sim.serializeCharacter(pid)!;
    expect(pendingSaved.weeklyRewards!.vaults[0].choices[0]).toEqual({
      pool: 'raid_heroic',
      itemId: id,
      tableId: IGNIVAR_BOSS_ID,
      lootSpec: 'fire',
      opened: true,
    });
    finishWeeklyRewardOpen(opening, false);
    expect(
      decodeWeeklyRewardInfo(weeklyRewardInfoFor(sim.ctx, pid))!.state.vaults[0].choices[0].itemId,
    ).toBeUndefined();
    const retry = prepareWeeklyRewardOpen(sim.ctx, '1000:0', pid, undefined, [IGNIVAR_BOSS_ID])!;
    expect(retry.itemId).toBe(id);
    expect(pick).toHaveBeenCalledTimes(1);
    finishWeeklyRewardOpen(retry, true);
    expect(
      decodeWeeklyRewardInfo(weeklyRewardInfoFor(sim.ctx, pid))!.state.vaults[0].choices[0].itemId,
    ).toBe(id);
    meta.weeklyRewards = sanitizeWeeklyRewards(sim.serializeCharacter(pid)!.weeklyRewards)!;
    expect(meta.weeklyRewards.vaults[0].choices[0]).toMatchObject({
      itemId: id,
      lootSpec: 'fire',
      opened: true,
    });
    const saved = sim.serializeCharacter(pid)!;
    const restoredPid = sim.addPlayer('mage', 'Restored', { state: saved });
    expect(sim.players.get(restoredPid)!.weeklyRewards!.vaults[0].choices[0]).toEqual(
      meta.weeklyRewards.vaults[0].choices[0],
    );
    delete saved.weeklyRewards!.vaults[0].choices[0].opened;
    const fixedPid = sim.addPlayer('mage', 'FixedUnopened', { state: saved });
    expect(sim.players.get(fixedPid)!.weeklyRewards!.vaults[0].choices[0]).toEqual({
      pool: 'raid_heroic',
      itemId: id,
      tableId: IGNIVAR_BOSS_ID,
      lootSpec: 'fire',
    });
    const before = sim.ctx.countItem(id, pid);
    sim.claimWeeklyReward('1000:0', pid);
    expect(sim.ctx.countItem(id, pid)).toBe(before + 1);
    expect(meta.weeklyRewards.vaults).toEqual([]);
    pick.mockRestore();
  });
});
