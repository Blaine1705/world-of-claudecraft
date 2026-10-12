// The Knellwyrm's health (playtest, 2026-10-12: "Dragon Morthen had 700 hp?").
// The finale spawned on its bare template (1,081 on normal, 7,254 on heroic):
// dead in about 20 s on normal, before its first Dread Bellow. Its pool is now
// set the way every Crypt boss's is, fight length x planning party DPS
// (dungeon_difficulty.ts): 80 s x 55 on normal, 80 s x 230 on heroic. Read from
// the live summon in a real claimed crypt, then fought for real at the
// planning DPS: every one of its mechanics comes round before it falls.

import { describe, expect, it, vi } from 'vitest';
import {
  HEROIC_DUNGEON_TUNING,
  NORMAL_DUNGEON_TUNING,
} from '../src/sim/content/dungeon_difficulty';
import {
  KNELL_TUNING,
  KNELLWYRM_BARED_RIBS,
  KNELLWYRM_DREAD_BELLOW,
  KNELLWYRM_ID,
  KNELLWYRM_KNELL_MARK,
  KNELLWYRM_PYRE_STRAFE,
  KNELLWYRM_TUNING,
  MORTHEN_ID,
  MORTHEN_SPOT,
} from '../src/sim/encounters/hollow_crypt';
import {
  CRYPT_BARROWFLAME_BREATH,
  CRYPT_TAIL_LASH,
  CRYPT_WING_GUST,
} from '../src/sim/mob/trash_kit/cast_ids';
import { DT, type Entity } from '../src/sim/types';
import { boss, cryptFight, type Fight, put, run, tick } from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 300_000 });

/** The planning numbers the pool is derived from. */
const FIGHT_SECONDS = 80;
const PARTY_DPS = { normal: 55, heroic: 230 } as const;
/** What it spawned with before: its bare template. */
const BARE = { normal: 1081, heroic: 7254 } as const;
/** Its melee and mechanic factor, untouched. */
const DAMAGE = {
  normal: { weapon: [43, 68], mech: undefined },
  heroic: { weapon: [1675, 2618], mech: 20 },
} as const;

/** Kill Morthen and let his dying rite bring the wyrm down to fight. */
function summon(difficulty: 'normal' | 'heroic'): { f: Fight; wyrm: Entity; hold: () => void } {
  const f = cryptFight(difficulty, 4, new Set([MORTHEN_ID]));
  const morthen = boss(f, MORTHEN_ID);
  const party = [f.tank, ...f.others];
  // Round the pyre: the tank before it, one behind (its tail), two on its flanks.
  const spots = [
    [MORTHEN_SPOT.x, MORTHEN_SPOT.z - 8],
    [MORTHEN_SPOT.x, MORTHEN_SPOT.z + 8],
    [MORTHEN_SPOT.x - 8.5, MORTHEN_SPOT.z],
    [MORTHEN_SPOT.x + 8.5, MORTHEN_SPOT.z],
    [MORTHEN_SPOT.x - 6, MORTHEN_SPOT.z - 6],
  ];
  const hold = () => {
    for (const [i, p] of party.entries()) put(f, p, spots[i][0], spots[i][1]);
  };
  hold();
  f.sim.chat('/dev crypt rise skip', f.tank.id);
  run(f, 0.5, hold);
  f.sim.ctx.handleDeath(morthen, f.tank);
  let wyrm: Entity | undefined;
  for (let t = 0; t < 20 && !wyrm?.knellwyrmFight; t += DT) {
    tick(f, hold);
    wyrm = [...f.sim.ctx.entities.values()].find((e) => e.templateId === KNELLWYRM_ID);
  }
  if (!wyrm?.knellwyrmFight) throw new Error('the Knellwyrm never joined the fight');
  return { f, wyrm, hold };
}

for (const difficulty of ['normal', 'heroic'] as const) {
  describe(`the Knellwyrm (${difficulty})`, () => {
    it('lands with its derived pool and fights a whole fight at the planning DPS', () => {
      const { f, wyrm, hold } = summon(difficulty);
      const party = [f.tank, ...f.others];
      // The pool: 80 s of the planning party's damage.
      const planned = FIGHT_SECONDS * PARTY_DPS[difficulty];
      expect(Math.abs(wyrm.maxHp - planned) / planned).toBeLessThan(0.005);
      expect(wyrm.maxHp).toBeGreaterThan(BARE[difficulty] * 2.5);
      // Health only: its melee and its mechanic factor are the shipped ones.
      expect([wyrm.weapon?.min, wyrm.weapon?.max]).toEqual(DAMAGE[difficulty].weapon);
      expect(wyrm.mechanicDamageMult).toBe(DAMAGE[difficulty].mech);

      // The real fight: the party deals the planning DPS through the damage
      // path, twice a second.
      const chunk = (PARTY_DPS[difficulty] * 0.5) / party.length;
      const casts = new Set<string>();
      let bared = false;
      let ticks = 0;
      for (; ticks < 200 / DT && !wyrm.dead; ticks++) {
        if (ticks % 10 === 0) {
          for (const p of party) {
            if (wyrm.dead) break;
            f.sim.ctx.dealDamage(p, wyrm, chunk, false, 'physical', null, 'hit', false, {
              mult: p === f.tank ? 8 : 1,
            });
          }
        }
        tick(f, hold);
        if (wyrm.castingAbility) casts.add(wyrm.castingAbility);
        if (wyrm.auras.some((a) => a.id === KNELLWYRM_BARED_RIBS)) bared = true;
      }
      const seconds = ticks * DT;
      expect(wyrm.dead).toBe(true);
      // A finale, not a formality: over a minute, and done inside the budget
      // (heroic adds its Burning Knell, flown out of reach).
      expect(seconds).toBeGreaterThan(60);
      expect(seconds).toBeLessThan(difficulty === 'heroic' ? 150 : 110);
      // Every mechanic came round: the drake kit on its template...
      expect(casts).toContain(CRYPT_BARROWFLAME_BREATH);
      expect(casts).toContain(CRYPT_TAIL_LASH);
      expect(casts).toContain(CRYPT_WING_GUST);
      // ...its own Pyre Strafe and Dread Bellow (and the Bared Ribs window)...
      expect(casts).toContain(KNELLWYRM_PYRE_STRAFE);
      expect(casts).toContain(KNELLWYRM_DREAD_BELLOW);
      expect(bared).toBe(true);
      // ...and on heroic the Burning Knell.
      expect(casts.has(KNELLWYRM_KNELL_MARK)).toBe(difficulty === 'heroic');
    });
  });
}

describe('the Knellwyrm: its clocks fit its fight', () => {
  it('fires each mechanic at least once inside 80 s, even at twice the planning DPS', () => {
    // Twice the planned damage halves the fight: 40 s on the ground.
    const fast = FIGHT_SECONDS / 2;
    expect(KNELLWYRM_TUNING.strafeFirst).toBeLessThan(fast);
    expect(KNELLWYRM_TUNING.bellowFirst + KNELLWYRM_TUNING.bellowCast).toBeLessThan(fast);
    expect(KNELL_TUNING.first).toBeLessThan(fast);
    // And at the planning DPS the slowest clock comes round twice.
    expect(KNELLWYRM_TUNING.bellowFirst + KNELLWYRM_TUNING.bellowEvery).toBeLessThan(FIGHT_SECONDS);
  });

  it('carries a health factor on both difficulties and keeps its heroic melee', () => {
    expect(NORMAL_DUNGEON_TUNING.hollow_crypt.healthMultiplierByMob?.[KNELLWYRM_ID]).toBeDefined();
    expect(HEROIC_DUNGEON_TUNING.hollow_crypt.healthMultiplierByMob?.[KNELLWYRM_ID]).toBeDefined();
    expect(HEROIC_DUNGEON_TUNING.hollow_crypt.damageMultiplierByMob?.[KNELLWYRM_ID]).toBe(20);
  });
});
