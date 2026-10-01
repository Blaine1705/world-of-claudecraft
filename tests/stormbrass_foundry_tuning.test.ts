// The Stormbrass Foundry's tuning rows (src/sim/content/dungeon_difficulty.ts):
// normal rides the SANCTUM NORMAL calibration (the Wildheart record's ruler) and
// heroic the shared level-22, 500-floor transform. The bosses' pools come from
// target fight length x planning party DPS (docs/design/dungeon-rework/
// stormbrass_foundry.md sections 5 and 6; README section 7).
//
// Reference warrior (identical to tests/wildheart_normal_tuning.test.ts and
// tests/gravewyrm_normal_tuning.test.ts): level-20 prot warrior in the
// max-armor kit, 2861 armor, in Defensive Stance (takes 10% less). The 2861
// constant carries the same unsettled provenance those suites document.

import { describe, expect, it } from 'vitest';
import {
  HEROIC_DUNGEON_TUNING,
  NORMAL_DUNGEON_TUNING,
} from '../src/sim/content/dungeon_difficulty';
import { STORMBRASS_FOUNDRY_SPAWNS } from '../src/sim/content/stormbrass_foundry';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { mobTemplateForDungeonDifficulty } from '../src/sim/instances/difficulty';
import type { DungeonDifficulty } from '../src/sim/types';
import { armorReduction } from '../src/sim/types';

const ID = 'stormbrass_foundry';
const REF_ARMOR = 2861;
const DEFENSIVE_STANCE_TAKEN = 0.9;

// The bands (normal): elite trash 100, the non-elite drones 50 (the Sanctum's
// bonewalker band), the Hauler 150 (Wildheart's miniboss band), bosses 200.
const TRASH = [
  'brass_sentry',
  'steam_bruiser',
  'foundry_engineer',
  'gearwright_apprentice',
  'clockwork_hound',
  'shieldbearer_frame',
];
const BOSSES = ['line_master_tock', 'rangewarden', 'voltaic_warden', 'prime_draft'];

function spawned(mobId: string, difficulty: DungeonDifficulty) {
  const template = mobTemplateForDungeonDifficulty(MOBS[mobId], ID, difficulty);
  const level = difficulty === 'heroic' ? template.maxLevel : MOBS[mobId].maxLevel;
  return { mob: createMob(1, template, level, { x: 0, y: 0, z: 0 }), level };
}

function minSwing(mobId: string, difficulty: DungeonDifficulty): number {
  const { mob, level } = spawned(mobId, difficulty);
  const afterArmor = Math.round(mob.weapon.min * (1 - armorReduction(REF_ARMOR, level)));
  return Math.round(afterArmor * DEFENSIVE_STANCE_TAKEN);
}

function maxHp(mobId: string, difficulty: DungeonDifficulty): number {
  return spawned(mobId, difficulty).mob.maxHp;
}

describe('normal Foundry: the Sanctum ruler', () => {
  it('floors every elite trash swing at 100 on the reference warrior', () => {
    for (const id of TRASH) expect(minSwing(id, 'normal'), id).toBeGreaterThanOrEqual(100);
  });

  it('floors the Arc Drones at the 50 fodder band, under the elite line', () => {
    const swing = minSwing('arc_drone', 'normal');
    expect(swing).toBeGreaterThanOrEqual(50);
    expect(swing).toBeLessThan(100);
  });

  it("floors Tock's Half-Built Frames in the drones' 50 band, a kill-fast pool", () => {
    const swing = minSwing('half_built_frame', 'normal');
    expect(swing).toBeGreaterThanOrEqual(50);
    expect(swing).toBeLessThan(100);
    // About 5 s each at 150 party DPS: three ride the belts per Parts Drop.
    expect(maxHp('half_built_frame', 'normal')).toBeGreaterThan(4 * 150);
    expect(maxHp('half_built_frame', 'normal')).toBeLessThan(7 * 150);
    expect(minSwing('half_built_frame', 'heroic')).toBeGreaterThanOrEqual(500);
  });

  it('floors the Gantry Hauler at 150 and every boss at 200', () => {
    const hauler = minSwing('gantry_hauler', 'normal');
    expect(hauler).toBeGreaterThanOrEqual(150);
    expect(hauler).toBeLessThan(200);
    for (const id of BOSSES) expect(minSwing(id, 'normal'), id).toBeGreaterThanOrEqual(200);
  });

  it('prices every spawn-list mob (none rides the raw template)', () => {
    const tuned = NORMAL_DUNGEON_TUNING[ID].damageMultiplierByMob;
    for (const s of STORMBRASS_FOUNDRY_SPAWNS) expect(tuned[s.mobId], s.mobId).toBeGreaterThan(1);
  });

  it('keeps every mechanic at its authored LANDED number (decoupled from melee)', () => {
    const mech = NORMAL_DUNGEON_TUNING[ID].mechanicDamageMultiplierByMob ?? {};
    for (const id of Object.keys(NORMAL_DUNGEON_TUNING[ID].damageMultiplierByMob))
      expect(mech[id], id).toBe(1);
  });

  it('sets the showpiece and boss pools from fight length x 150 party DPS', () => {
    const near = (actual: number, target: number) => {
      expect(actual).toBeGreaterThan(target * 0.98);
      expect(actual).toBeLessThan(target * 1.02);
    };
    near(maxHp('gantry_hauler', 'normal'), 60 * 150);
    near(maxHp('line_master_tock', 'normal'), 100 * 150);
    near(maxHp('rangewarden', 'normal'), 100 * 150);
    near(maxHp('voltaic_warden', 'normal'), 100 * 150);
    near(maxHp('prime_draft', 'normal'), 26_000);
    // Elite trash about 8.5 to 13.5 s each at 150 party DPS.
    for (const id of TRASH) {
      expect(maxHp(id, 'normal'), id).toBeGreaterThan(8.5 * 150);
      expect(maxHp(id, 'normal'), id).toBeLessThan(13.5 * 150);
    }
  });
});

describe('heroic Foundry: the level-22 transform', () => {
  it('rebases every mob to level 22 and floors every spawn-list swing at 500', () => {
    expect(HEROIC_DUNGEON_TUNING[ID].level).toBe(22);
    for (const s of STORMBRASS_FOUNDRY_SPAWNS)
      expect(minSwing(s.mobId, 'heroic'), s.mobId).toBeGreaterThanOrEqual(500);
  });

  it('sets the showpiece and boss pools from fight length x 230 heroic party DPS', () => {
    const near = (actual: number, target: number) => {
      expect(actual).toBeGreaterThan(target * 0.98);
      expect(actual).toBeLessThan(target * 1.02);
    };
    near(maxHp('gantry_hauler', 'heroic'), 60 * 230);
    near(maxHp('line_master_tock', 'heroic'), 100 * 230);
    near(maxHp('rangewarden', 'heroic'), 100 * 230);
    near(maxHp('voltaic_warden', 'heroic'), 100 * 230);
    near(maxHp('prime_draft', 'heroic'), 170 * 230);
  });

  it('prices every mechanic carrier apart from the tank-swing floor', () => {
    const mech = HEROIC_DUNGEON_TUNING[ID].mechanicDamageMultiplierByMob ?? {};
    for (const s of STORMBRASS_FOUNDRY_SPAWNS) {
      const m = mech[s.mobId];
      expect(m, s.mobId).toBeGreaterThanOrEqual(2.5);
      expect(m, s.mobId).toBeLessThanOrEqual(3);
    }
  });
});
