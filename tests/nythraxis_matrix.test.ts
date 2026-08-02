import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/nythraxis_matrix.ts', 'utf8');

describe('Nythraxis matrix DPS rotations', () => {
  it('keeps maintenance DoTs guarded without classifying core nukes as DoTs', () => {
    const dotSetMatch = source.match(/const DOT_ABILITIES = new Set\(\[([\s\S]*?)\]\);/);
    expect(dotSetMatch?.[1]).toContain("'immolate'");
    expect(dotSetMatch?.[1]).toContain("'corruption'");
    expect(dotSetMatch?.[1]).toContain("'curse_of_agony'");
    expect(dotSetMatch?.[1]).not.toContain("'fireball'");
    expect(dotSetMatch?.[1]).not.toContain("'pyroblast'");
  });

  it('executes both tank distributions in one Monte Carlo shard with shared gear and chosen talents', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'nythraxis-matrix-test-'));
    const outputPath = join(outputDirectory, 'result.json');
    try {
      execFileSync(
        process.execPath,
        [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/nythraxis_matrix.ts'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MATRIX_TANK_MC_RUNS: '2',
            MATRIX_SHARD_COUNT: '2',
            MATRIX_SHARD_INDEX: '0',
            MATRIX_OUTPUT_PATH: outputPath,
          },
          stdio: 'pipe',
          timeout: 30_000,
        },
      );

      const report = JSON.parse(readFileSync(outputPath, 'utf8')) as {
        run: number;
        sharedTankGear: string[];
        runs: Array<{
          seed: number;
          key: string;
          actors: Record<
            string,
            {
              equippedItemIds: string[];
              talentRows: Record<string, string>;
              successfulCasts: Record<string, number>;
            }
          >;
        }>;
      };
      expect(report.run).toBe(2);
      expect(report.runs.map((run) => run.seed)).toEqual([1, 1]);

      const expectedRows = {
        protection_warrior: {
          5: 'war_row_double_charge',
          8: 'war_row_die_by_the_sword',
          11: 'war_row_storm_bolt',
          14: 'war_row_blood_offering',
          17: 'war_row_avatar',
          20: 'war_row_sanguine_aura',
        },
        protection_paladin: {
          5: 'pal_r5_divine_steed',
          8: 'pal_r8_enduring_protection',
          11: 'pal_r11_fist_of_justice',
          14: 'pal_r14_divine_purpose',
          17: 'pal_r17_extended_dawn',
          20: 'pal_r20_aura_mastery',
        },
      } as const;
      for (const run of report.runs) {
        const tankKey = run.key.split('|')[0] as keyof typeof expectedRows;
        const tank = run.actors[tankKey];
        expect(tank.equippedItemIds).toEqual([...report.sharedTankGear].sort());
        expect(tank.talentRows).toEqual(expectedRows[tankKey]);
        expect(Object.keys(run.actors).sort()).toEqual(
          [
            tankKey,
            'feral_druid_tank',
            'holy_priest',
            'discipline_priest',
            'restoration_shaman',
            'combat_rogue',
            'arms_warrior',
            'fire_mage',
            'marksmanship_hunter',
            'retribution_paladin',
          ].sort(),
        );
      }
      expect(report.runs[0].actors.protection_warrior.successfulCasts.raised_guard).toBeGreaterThan(
        0,
      );
      expect(
        report.runs[1].actors.protection_paladin.successfulCasts.divine_protection,
      ).toBeGreaterThan(0);
      expect(report.runs[1].actors.protection_paladin.successfulCasts.holy_shield).toBeGreaterThan(
        0,
      );

      const secondShardPath = join(outputDirectory, 'result-shard-1.json');
      execFileSync(
        process.execPath,
        [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/nythraxis_matrix.ts'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MATRIX_TANK_MC_RUNS: '2',
            MATRIX_SHARD_COUNT: '2',
            MATRIX_SHARD_INDEX: '1',
            MATRIX_OUTPUT_PATH: secondShardPath,
          },
          stdio: 'pipe',
          timeout: 30_000,
        },
      );
      const secondShard = JSON.parse(readFileSync(secondShardPath, 'utf8')) as {
        run: number;
        runs: Array<{ seed: number; key: string }>;
      };
      expect(secondShard.run).toBe(2);
      expect(secondShard.runs.map((run) => run.seed)).toEqual([2, 2]);
      expect(secondShard.runs.map((run) => run.key.split('|')[0])).toEqual([
        'protection_warrior',
        'protection_paladin',
      ]);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  }, 45_000);

  it('moves long caster buffs to prepull instead of recurring combat priority', () => {
    expect(source).toContain("prepull: ['arcane_intellect']");
    expect(source).toContain("{ ability: 'demon_skin', target: 'self' }");
    expect(source).toContain("prepull: ['lightning_shield']");
    expect(source).toContain("rotation: ['flame_shock', 'earth_shock', 'lightning_bolt']");
    expect(source).toContain("'raise_bone_mage'");
    expect(source).toContain("'raise_gravewing'");
    expect(source).toContain("'reaping_command'");
    expect(source).toContain("'soul_harvest'");
    expect(source).toContain("'evil_eye'");
    expect(source).toContain("'sentence'");
    expect(source).toContain("'needle_of_fate'");
    expect(source).toContain("if (spec.key === 'affliction_warlock') return");
    expect(source).toContain(
      "spec.key === 'demonology_warlock' ? 'raise_graveguard' : 'summon_imp'",
    );
  });

  it('prioritizes caster cooldown/maintenance spells before standard filler nukes', () => {
    expect(source).toContain("rotation: ['fire_blast', 'pyroblast', 'fireball', 'scorch']");
    expect(source).toContain("rotation: ['frostbolt']");
    expect(source).toContain("rotation: ['arcane_missiles']");
    expect(source).toContain("'shadowburn'");
    expect(source).toContain("{ ability: 'summon_infernal', target: 'boss', aim: 'target' }");
    expect(source).toContain("{ ability: 'vicarious_suffering', target: 'activeTank' }");
    expect(source).toContain("{ ability: 'cursed_accomplice', target: 'accomplice' }");
    expect(source).toContain("'drain_life'");
    expect(source).toContain("'life_tap'");
    expect(source).toContain("rotation: ['moonfire', 'insect_swarm', 'wrath']");
    expect(source).toContain("rotation: ['shadow_word_pain', 'mind_blast', 'mind_flay', 'smite']");
    expect(source).toContain("spec.key === 'fire_mage'");
  });

  it('runs multiple deterministic seeds and reports owner, pet, and combined damage', () => {
    expect(source).toContain('process.env.MATRIX_SEEDS ??');
    expect(source).toContain("'42,1337,9001,777");
    expect(source).toContain('playerDamageDone');
    expect(source).toContain('petDamageDone');
    expect(source).toContain('bossDamageDone');
    expect(source).toContain('specDamageBreakdown');
    expect(source).toContain('specActiveDps');
    expect(source).toContain('avgLifeTaps');
    expect(source).toContain("damageBucket === 'boss' ? 'damage_boss' : 'damage_add'");
    expect(source).toContain('row.bossDamage += actor.bossDamageDone');
    expect(source).toContain('row.addDamage += actor.addDamageDone');
    expect(source).toContain('const encounterStart =');
    expect(source).toContain('const seconds = combatElapsed(');
    expect(source).toContain('if (!metric.dead) metric.activeDamageDone += event.amount');
    expect(source).toContain(
      'metric.activeDps = activeDps(metric.activeDamageDone, seconds, metric.deathTime)',
    );
  });

  it('aims position-targeted cooldowns at the selected encounter target', () => {
    expect(source).toContain("known?.def.targetMode === 'position'");
    expect(source).toContain('sim.castAbility(ability, pid, aim)');
  });

  it('normalizes the legacy matrix fixtures through the canonical talent allocation', () => {
    expect(source).toContain('const canonical = benchmarkAllocation(');
    expect(source).toContain('defaultBuild(spec.cls, 20)');
    expect(source).toContain("spec.talents.spec ?? ''");
    expect(source).toContain('spec.benchmarkRows');
    expect(source).toContain('validateAllocation(spec.cls, canonical');
    expect(source).toContain('sim.applyTalents(canonical, pid)');
    expect(source.match(/benchmarkRows: WARLOCK_BENCHMARK_ROWS/g)).toHaveLength(3);
  });

  it('uses matched comparison plans when MATRIX_COMPARE_SPECS is set', () => {
    expect(source).toContain("process.env.MATRIX_COMPARE_SPECS ?? ''");
    expect(source).toContain('comparisonPlans({');
    expect(source).toContain(
      'dpsSet: [...plan.baselineDps.map(specForKey), specForKey(plan.comparedKey)]',
    );
    expect(source).toContain('for (const seed of seeds)');
  });

  it('builds complete paired raids and separates setup time from combat time', () => {
    expect(source).toContain('const healerCombos = combos(healers, 2)');
    expect(source).toMatch(/filter\(\(spec\) => spec\.cls !== 'warlock'\),\s*5,/);
    expect(source).toContain('if (index === 5) sim.convertPartyToRaid(pids[0])');
    expect(source).toContain('failed to place all ten players in one raid');
    expect(source).toContain('const combatStart =');
    expect(source).toContain('combatElapsed(');
    expect(source).toContain('selectPairedBaselines');
    expect(source).toContain('expandPairedPlans');
    expect(source).toContain('pairedWarlockDps');
    expect(source).toContain("process.env.MATRIX_SENTENCE_THRESHOLD ?? '80'");
    expect(source).toContain('const encounterAdd = offTankFocusAdd ?? adds[0]');
    expect(source).toContain("spec.cls === 'shaman' && wounded.length >= 2");
    expect(source).toContain("spec.cls === 'priest' && wounded.length >= 3");
  });

  it('uses validated near-Heroic non-raid equipment and fails closed on stale rotations', () => {
    expect(source).toContain('function equipNearHeroicKit');
    expect(source).toContain('!itemFromRaid(item.id)');
    expect(source).toContain('has no offhand after equipment setup');
    expect(source).toContain('validateMatrixCatalog()');
    expect(source).toContain('Obsolete matrix rotations');
  });

  it('models enhancement as Flametongue prepull, then auto-attacks, Stormstrike on cooldown, and Flame/Earth shock weave', () => {
    expect(source).toContain("prepull: ['flametongue_weapon']");
    expect(source).toContain("rotation: ['stormstrike', 'flame_shock', 'earth_shock']");
    expect(source).toContain('sim.startAutoAttack(pid)');
  });
});
