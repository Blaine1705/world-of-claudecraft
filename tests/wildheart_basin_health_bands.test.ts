// Wildheart Basin against the owner's heroic health bands (2026-10-12: heroic
// non-final bosses about 25,000, minibosses 15,000 to 20,000). Nothing in the
// Basin changes: the Great Saurian, its miniboss, already sits at the band's
// floor, and the owner left the Beastmaster, the Gorgebloom and Zulgar as they
// are. Read from live spawns so a later retune has to move this pin on purpose.

import { describe, expect, it, vi } from 'vitest';
import { HEROIC_MINIBOSS_BAND, livePools } from './helpers/dungeon_pools';

vi.setConfig({ testTimeout: 300_000 });

describe('Wildheart Basin heroic pools, unchanged by the bands', () => {
  const heroic = livePools('wildheart_basin', 'heroic');
  const normal = livePools('wildheart_basin', 'normal');

  it('holds the Great Saurian at the miniboss band it already met', () => {
    expect(heroic.great_saurian.hp).toBe(14998);
    // Two points under the band's floor to the template's rounding: "about 15,000".
    expect(heroic.great_saurian.hp).toBeGreaterThanOrEqual(HEROIC_MINIBOSS_BAND.min - 5);
    expect(heroic.great_saurian.hp).toBeLessThanOrEqual(HEROIC_MINIBOSS_BAND.max);
  });

  it('leaves the three bosses and every normal pool where they were', () => {
    expect(heroic.wildheart_beastmaster.hp).toBe(23005);
    expect(heroic.fanglord_jaguar.hp).toBe(23011);
    expect(heroic.the_gorgebloom.hp).toBe(23003);
    expect(heroic.wildheart_high_priest.hp).toBe(36818);
    expect(normal.great_saurian.hp).toBe(10002);
    expect(normal.wildheart_beastmaster.hp).toBe(15000);
    expect(normal.fanglord_jaguar.hp).toBe(15013);
    expect(normal.the_gorgebloom.hp).toBe(15000);
    expect(normal.wildheart_high_priest.hp).toBe(24808);
  });
});
