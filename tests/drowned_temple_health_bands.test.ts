// The Drowned Temple on the owner's heroic health bands (2026-10-12): on heroic
// every non-final boss carries about 25,000 and every miniboss sits in 15,000
// to 20,000. The Dungeon Finder's encounter list says which is which:
// Choirmother Selthe is a boss and goes to about 25,000; the Mere Hydra (a solo
// encounter outside the list) is the miniboss and goes to about 18,000 across
// its three heads (about 6,000 a head: "raise it a little per head"), by the
// same factor on normal, where it stays under the weakest boss. The Tideglass
// Colossus (23,003) already sits beside the boss band and Ysolei, the final
// boss, is untouched, as is every normal BOSS pool. A regrown head still stands
// up with the health it always had. Health only: melee, mechanic factors and
// armor are the shipped numbers. Read from live spawns in a real claim.

import { describe, expect, it, vi } from 'vitest';
import { HYDRA_TUNING } from '../src/sim/encounters/drowned_temple';
import {
  HEROIC_BOSS_BAND,
  HEROIC_MINIBOSS_BAND,
  type LivePool,
  livePools,
} from './helpers/dungeon_pools';

vi.setConfig({ testTimeout: 300_000 });

const HEADS = ['mere_hydra_head_left', 'mere_hydra_head_center', 'mere_hydra_head_right'];
const HEAD_HEROIC: LivePool = { hp: 6001, weapon: [1422, 2221], mech: 6, armor: 630 };
const HEAD_NORMAL: LivePool = { hp: 2786, weapon: [69, 108], mech: undefined, armor: 384 };

const HEROIC: Record<string, LivePool> = {
  // Choirmother Selthe: was 20,650.
  choirmother_selthe: { hp: 25004, weapon: [1360, 2125], mech: 4.5, armor: 578 },
  // Untouched: the Colossus beside the band, Ysolei the final boss.
  tideglass_colossus: { hp: 23003, weapon: [1422, 2221], mech: 5, armor: 788 },
  ysolei: { hp: 34497, weapon: [1483, 2317], mech: 5, armor: 735 },
};

const NORMAL: Record<string, LivePool> = {
  choirmother_selthe: { hp: 9899, weapon: [63, 98], mech: undefined, armor: 330 },
  tideglass_colossus: { hp: 11495, weapon: [69, 108], mech: undefined, armor: 480 },
  ysolei: { hp: 17994, weapon: [76, 119], mech: undefined, armor: 476 },
};

describe('Drowned Temple pools read from live spawns', () => {
  const heroic = livePools('drowned_temple', 'heroic');
  const normal = livePools('drowned_temple', 'normal');

  it('pins every heroic pool with its shipped melee, mechanic factor and armor', () => {
    for (const [id, row] of Object.entries(HEROIC)) expect(heroic[id], id).toEqual(row);
    // Each head was 4,306.
    for (const id of HEADS) expect(heroic[id], id).toEqual(HEAD_HEROIC);
  });

  it('pins every normal pool with its shipped melee, mechanic factor and armor', () => {
    for (const [id, row] of Object.entries(NORMAL)) expect(normal[id], id).toEqual(row);
    // Each head was 2,000.
    for (const id of HEADS) expect(normal[id], id).toEqual(HEAD_NORMAL);
  });

  it('holds Selthe in the heroic boss band and the whole Hydra in the miniboss band', () => {
    expect(heroic.choirmother_selthe.hp).toBeGreaterThanOrEqual(HEROIC_BOSS_BAND.min);
    expect(heroic.choirmother_selthe.hp).toBeLessThanOrEqual(HEROIC_BOSS_BAND.max);
    const hydra = HEADS.reduce((sum, id) => sum + heroic[id].hp, 0);
    expect(hydra).toBeGreaterThanOrEqual(HEROIC_MINIBOSS_BAND.min);
    expect(hydra).toBeLessThanOrEqual(HEROIC_MINIBOSS_BAND.max);
    expect(hydra).toBeLessThan(heroic.choirmother_selthe.hp - 4000);
    expect(heroic.ysolei.hp).toBeGreaterThan(HEROIC_BOSS_BAND.max);
  });

  it('raises the heads by one factor on both difficulties, under the weakest normal boss', () => {
    const heroicFactor = heroic.mere_hydra_head_center.hp / 4306;
    const normalFactor = normal.mere_hydra_head_center.hp / 2000;
    expect(Math.abs(heroicFactor - normalFactor)).toBeLessThan(0.002);
    const weakest = Math.min(
      normal.choirmother_selthe.hp,
      normal.tideglass_colossus.hp,
      normal.ysolei.hp,
    );
    expect(weakest).toBe(9899);
    expect(HEADS.reduce((sum, id) => sum + normal[id].hp, 0)).toBeLessThan(weakest);
  });

  it('regrows a head with the health it always had', () => {
    // hydra_regrowth.ts: a regrown head stands up with regrowShare of its pool.
    // It was half of 4,306 on heroic and half of 2,000 on normal.
    const regrown = (pool: number) => Math.max(1, Math.round(pool * HYDRA_TUNING.regrowShare));
    expect(regrown(heroic.mere_hydra_head_center.hp)).toBe(2153);
    expect(regrown(normal.mere_hydra_head_center.hp)).toBe(1000);
  });
});
