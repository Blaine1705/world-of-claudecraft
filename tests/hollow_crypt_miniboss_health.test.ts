// The Hollow Crypt's three bosses before Morthen (playtest, 2026-10-12: "all
// minibosses need double the HP"): Sexton Marrow, the Lady of the Bonechill
// and Cantor Ilvane carry twice the pool they shipped with, on both
// difficulties, read from live spawns in a real claimed crypt. Nothing else
// moved: their melee, their mechanic factor and their armor are the shipped
// numbers, the Lady's Frozen Embrace still breaks on the same damage, and
// Morthen and Ilvane's Choristers keep their pools.

import { describe, expect, it, vi } from 'vitest';
import { LADY_ID, LADY_TUNING } from '../src/sim/encounters/hollow_crypt';
import { boss, cryptFight } from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 120_000 });

interface Row {
  /** The pool the boss shipped with (before the playtest note). */
  was: number;
  weapon: [number, number];
  mech: number | undefined;
  armor: number;
}

const SHIPPED: Record<'normal' | 'heroic', Record<string, Row>> = {
  normal: {
    sexton_marrow: { was: 3152, weapon: [32, 50], mech: undefined, armor: 154 },
    rimeweb: { was: 3998, weapon: [35, 54], mech: undefined, armor: 160 },
    cantor_ilvane: { was: 3195, weapon: [33, 51], mech: undefined, armor: 144 },
  },
  heroic: {
    sexton_marrow: { was: 16099, weapon: [1476, 2306], mech: 6, armor: 601 },
    rimeweb: { was: 18382, weapon: [1476, 2306], mech: 5, armor: 546 },
    cantor_ilvane: { was: 14687, weapon: [1402, 2190], mech: 8, armor: 491 },
  },
};

/** Untouched by the note: the final boss and Ilvane's adds. */
const UNCHANGED: Record<'normal' | 'heroic', Record<string, number>> = {
  normal: { morthen: 6791, hollow_chorister: 391 },
  heroic: { morthen: 28837, hollow_chorister: 1844 },
};

/** The damage that made the Lady let go of the held before her pool doubled:
 *  6 percent of the pool she shipped with. */
const EMBRACE_BREAK_DAMAGE = { normal: 0.06 * 3998, heroic: 0.06 * 18382 };

for (const difficulty of ['normal', 'heroic'] as const) {
  describe(`Hollow Crypt minibosses (${difficulty})`, () => {
    const ids = new Set([
      ...Object.keys(SHIPPED[difficulty]),
      ...Object.keys(UNCHANGED[difficulty]),
    ]);
    const f = cryptFight(difficulty, 4, ids);

    for (const [id, row] of Object.entries(SHIPPED[difficulty])) {
      it(`${id} carries twice its shipped pool and its shipped damage`, () => {
        const b = boss(f, id);
        // Twice the pool, to the rounding of one spawn.
        expect(Math.abs(b.maxHp - row.was * 2)).toBeLessThanOrEqual(1);
        expect(b.hp).toBe(b.maxHp);
        expect([b.weapon?.min, b.weapon?.max]).toEqual(row.weapon);
        expect(b.mechanicDamageMult).toBe(row.mech);
        expect(b.stats.armor).toBe(row.armor);
      });
    }

    it('leaves Morthen and the Choristers on their pools', () => {
      for (const [id, hp] of Object.entries(UNCHANGED[difficulty])) {
        expect(boss(f, id).maxHp, id).toBe(hp);
      }
    });

    it('frees the held from the Frozen Embrace on the damage it took before', () => {
      const lady = boss(f, LADY_ID);
      const needed = LADY_TUNING.embraceBreakShare * lady.maxHp;
      expect(Math.abs(needed - EMBRACE_BREAK_DAMAGE[difficulty])).toBeLessThan(1);
    });
  });
}
