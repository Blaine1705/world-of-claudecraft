import { describe, expect, it } from 'vitest';
import {
  HEROIC_DUNGEON_TUNING,
  NORMAL_DUNGEON_TUNING,
} from '../src/sim/content/dungeon_difficulty';
import { DUNGEONS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_SECOND_WING_ID } from '../src/sim/ignivar_raid_ids';
import {
  applyDungeonMobTuning,
  mobTemplateForDungeonDifficulty,
} from '../src/sim/instances/difficulty';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { dungeonMinibossStompDamageMaxHp } from '../src/sim/mob/dungeon_miniboss_stomp';
import { ignivarCinderLanceDamageMaxHp } from '../src/sim/mob/ignivar_trash_automata';
import { Sim } from '../src/sim/sim';

describe('Ignivar raid trash tuning', () => {
  it('routes both corridor rooms through the shared raid tuning table', () => {
    expect(DUNGEONS[IGNIVAR_FORGE_APPROACH_ID].mobDifficultyTuningId).toBe(IGNIVAR_SECOND_WING_ID);
  });

  it('pins Normal and Heroic pressure for every corridor role', () => {
    expect(NORMAL_DUNGEON_TUNING[IGNIVAR_SECOND_WING_ID]).toMatchObject({
      healthMultiplier: 1,
      damageMultiplierByMob: {
        derelict_mech: 1.5,
        ignivar_ember_sentinel: 1.5,
        ignivar_crucible_warden: 1.5,
        ignivar_cinder_artificer: 1.25,
      },
      mechanicDamageMultiplierByMob: {
        derelict_mech: 1.25,
        ignivar_ember_sentinel: 1.5,
        ignivar_crucible_warden: 2,
        ignivar_cinder_artificer: 1.25,
      },
      rangedDamageMultiplierByMob: {
        ignivar_cinder_artificer: 1.25,
      },
    });
    expect(HEROIC_DUNGEON_TUNING[IGNIVAR_SECOND_WING_ID]).toMatchObject({
      healthMultiplierByMob: {
        ignivar_ember_sentinel: 2,
        ignivar_crucible_warden: 2,
        ignivar_cinder_artificer: 2.2,
      },
      damageMultiplierByMob: {
        derelict_mech: 2,
        ignivar_ember_sentinel: 2,
        ignivar_crucible_warden: 2,
        ignivar_cinder_artificer: 1.5,
      },
      mechanicDamageMultiplierByMob: {
        derelict_mech: 1.75,
        ignivar_ember_sentinel: 2,
        ignivar_crucible_warden: 4,
        ignivar_cinder_artificer: 1.5,
      },
      rangedDamageMultiplierByMob: {
        ignivar_cinder_artificer: 1.5,
      },
    });
  });

  it('makes telegraphed corridor mechanics punishing by difficulty', () => {
    expect(ignivarCinderLanceDamageMaxHp('normal')).toBe(0.3);
    expect(ignivarCinderLanceDamageMaxHp('heroic')).toBe(0.55);
    expect(dungeonMinibossStompDamageMaxHp('normal')).toBe(0.4);
    expect(dungeonMinibossStompDamageMaxHp('heroic')).toBe(0.7);
  });

  it.each(['normal', 'heroic'] as const)(
    'stamps the configured mechanic multipliers on %s corridor spawns and artificer adds',
    (difficulty) => {
      const sim = new Sim({ seed: 731, playerClass: 'warrior', devCommands: true });
      sim.setDungeonDifficulty(difficulty, sim.player.id);
      expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, sim.player.id, true)).toBe(true);
      const claim = sim.instances.find(
        (instance) =>
          instance.dungeonId === IGNIVAR_FORGE_APPROACH_ID && instance.partyKey !== null,
      );
      if (!claim) throw new Error('Approach claim missing');
      const byTemplate = new Map(
        claim.mobIds.flatMap((id) => {
          const mob = sim.entities.get(id);
          return mob ? [[mob.templateId, mob] as const] : [];
        }),
      );

      expect(byTemplate.get('derelict_mech')?.mechanicDamageMult).toBe(
        difficulty === 'heroic' ? 1.75 : 1.25,
      );
      expect(byTemplate.get('ignivar_ember_sentinel')?.mechanicDamageMult).toBe(
        difficulty === 'heroic' ? 2 : 1.5,
      );
      expect(byTemplate.get('ignivar_crucible_warden')?.mechanicDamageMult).toBe(
        difficulty === 'heroic' ? 4 : 2,
      );
      const artificer = createMob(
        sim.nextId++,
        MOBS.ignivar_cinder_artificer,
        20,
        sim.ctx.groundPos(0, 0),
      );
      applyDungeonMobTuning(artificer, IGNIVAR_SECOND_WING_ID, difficulty, {
        summonedAdd: true,
      });
      expect(artificer.mechanicDamageMult).toBe(difficulty === 'heroic' ? 1.5 : 1.25);
      expect(artificer.rangedDamageMult).toBe(difficulty === 'heroic' ? 1.5 : 1.25);
    },
  );

  it.each(['normal', 'heroic'] as const)(
    'applies the %s Artificer multiplier at the live Cinderbolt fire site',
    (difficulty) => {
      const sim = new Sim({ seed: difficulty === 'heroic' ? 733 : 732, playerClass: 'warrior' });
      sim.player.maxHp = 100_000;
      sim.player.hp = 100_000;
      const template = mobTemplateForDungeonDifficulty(
        MOBS.ignivar_cinder_artificer,
        IGNIVAR_SECOND_WING_ID,
        difficulty,
      );
      const artificer = createMob(sim.nextId++, template, template.maxLevel, {
        ...sim.player.pos,
      });
      applyDungeonMobTuning(artificer, IGNIVAR_SECOND_WING_ID, difficulty, {
        summonedAdd: true,
      });
      sim.ctx.addEntity(artificer);
      const spell = MOBS.ignivar_cinder_artificer.petSpell;
      if (!spell) throw new Error('Cinder Artificer lost Cinderbolt');
      const hits: number[] = [];
      for (let attempt = 0; attempt < 80 && hits.length < 10; attempt++) {
        artificer.swingTimer = 0;
        artificer.rangedWindupReleaseTick = 0;
        sim.ctx.updateRangedPetAttack(artificer, sim.player, spell);
        for (const event of sim.drainEvents()) {
          if (event.type === 'damage' && event.ability === spell.name && event.amount > 0) {
            hits.push(event.amount);
          }
        }
      }
      const multiplier = difficulty === 'heroic' ? 1.5 : 1.25;
      expect(hits).toHaveLength(10);
      expect(Math.min(...hits)).toBeGreaterThanOrEqual(
        Math.round((spell.min + artificer.level * 0.8) * multiplier),
      );
      expect(Math.max(...hits)).toBeLessThanOrEqual(
        Math.round((spell.max + artificer.level * 1.1) * multiplier),
      );
    },
  );
});
