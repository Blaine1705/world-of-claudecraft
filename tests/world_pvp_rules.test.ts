// Pins for the World PvP pure rules (src/sim/pvp/world_pvp_rules.ts): the
// mutual-flag pair verdict with its party and guild exemptions, the gold stake
// (the smaller of the cap and the purse fraction), the equal split with the
// killing blow taking the remainder, the grey-level rule, and the per-pair
// diminishing-returns curve it shares with the battleground drip.
import { describe, expect, it } from 'vitest';
import { HONOR_REPEAT_DR } from '../src/sim/pvp';
import {
  WORLD_PVP_GREY_LEVEL_GAP,
  WORLD_PVP_KILL_HONOR,
  WORLD_PVP_STAKE_CAP_COPPER,
  WORLD_PVP_STAKE_FRACTION,
  worldPvpPairHostile,
  worldPvpPairMultiplier,
  worldPvpSplit,
  worldPvpStake,
  worldPvpVictimIsGrey,
} from '../src/sim/pvp/world_pvp_rules';
import type { Entity } from '../src/sim/types';

const player = (id: number, extra: Partial<Entity> = {}): Entity =>
  ({ id, kind: 'player', guild: '', pvpFlag: true, ...extra }) as Entity;

describe('worldPvpPairHostile', () => {
  it('two flagged strangers are hostile, symmetrically', () => {
    const a = player(1);
    const b = player(2);
    expect(worldPvpPairHostile(a, b, false)).toBe(true);
    expect(worldPvpPairHostile(b, a, false)).toBe(true);
  });

  it('an unflagged side on EITHER end refuses', () => {
    expect(worldPvpPairHostile(player(1, { pvpFlag: false }), player(2), false)).toBe(false);
    expect(worldPvpPairHostile(player(1), player(2, { pvpFlag: false }), false)).toBe(false);
    expect(worldPvpPairHostile(player(1, { pvpFlag: undefined }), player(2), false)).toBe(false);
  });

  it('never hostile to yourself', () => {
    const a = player(7);
    expect(worldPvpPairHostile(a, a, false)).toBe(false);
  });

  it('party or raid mates are never hostile', () => {
    expect(worldPvpPairHostile(player(1), player(2), true)).toBe(false);
  });

  it('guildmates are never hostile; different guilds and no guild are', () => {
    expect(worldPvpPairHostile(player(1, { guild: 'Ravens' }), player(2, { guild: 'Ravens' }), false)).toBe(
      false,
    );
    expect(worldPvpPairHostile(player(1, { guild: 'Ravens' }), player(2, { guild: 'Crows' }), false)).toBe(
      true,
    );
    // Two guildless players share the empty string and must NOT read as one guild.
    expect(worldPvpPairHostile(player(1, { guild: '' }), player(2, { guild: '' }), false)).toBe(true);
  });
});

describe('worldPvpStake', () => {
  it('takes the purse fraction below the cap and the cap above it', () => {
    expect(WORLD_PVP_STAKE_FRACTION).toBe(0.1);
    expect(WORLD_PVP_STAKE_CAP_COPPER).toBe(50_000);
    expect(worldPvpStake(10_000)).toBe(1_000); // 1g purse -> 10s
    expect(worldPvpStake(500_000)).toBe(50_000); // 50g purse -> the 5g cap, not 5g0s+
    expect(worldPvpStake(499_990)).toBe(49_999);
  });

  it('floors to whole copper and never charges an empty or broken purse', () => {
    expect(worldPvpStake(15)).toBe(1);
    expect(worldPvpStake(9)).toBe(0);
    expect(worldPvpStake(0)).toBe(0);
    expect(worldPvpStake(-5)).toBe(0);
    expect(worldPvpStake(Number.NaN)).toBe(0);
  });
});

describe('worldPvpSplit', () => {
  it('a clean 1v1 pays the whole amount to the one contributor', () => {
    expect(worldPvpSplit(WORLD_PVP_KILL_HONOR, 1)).toEqual({ share: 10, killerBonus: 0 });
    expect(worldPvpSplit(1_000, 1)).toEqual({ share: 1_000, killerBonus: 0 });
  });

  it('splits equally and hands the integer remainder to the killing blow', () => {
    expect(worldPvpSplit(10, 3)).toEqual({ share: 3, killerBonus: 1 });
    expect(worldPvpSplit(1_000, 3)).toEqual({ share: 333, killerBonus: 1 });
    expect(worldPvpSplit(10, 4)).toEqual({ share: 2, killerBonus: 2 });
    // The parts always sum back to the whole.
    for (const n of [1, 2, 3, 5, 7]) {
      const { share, killerBonus } = worldPvpSplit(10, n);
      expect(share * n + killerBonus).toBe(10);
    }
  });

  it('pays nothing for nothing', () => {
    expect(worldPvpSplit(0, 3)).toEqual({ share: 0, killerBonus: 0 });
    expect(worldPvpSplit(10, 0)).toEqual({ share: 0, killerBonus: 0 });
  });
});

describe('worldPvpVictimIsGrey', () => {
  it('is grey only when the victim is MORE than the gap below the contributor', () => {
    expect(WORLD_PVP_GREY_LEVEL_GAP).toBe(5);
    expect(worldPvpVictimIsGrey(20, 15)).toBe(false); // exactly the gap still pays
    expect(worldPvpVictimIsGrey(20, 14)).toBe(true);
    expect(worldPvpVictimIsGrey(10, 20)).toBe(false); // punching up never greys
  });
});

describe('worldPvpPairMultiplier', () => {
  it('rides the shared HONOR_REPEAT_DR curve: 100, 50, 25, then 0 percent', () => {
    expect(HONOR_REPEAT_DR).toEqual([1, 0.5, 0.25, 0]);
    expect([0, 1, 2, 3, 9].map(worldPvpPairMultiplier)).toEqual([1, 0.5, 0.25, 0, 0]);
  });
});
