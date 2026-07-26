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
    expect(source).toContain("prepull: ['demon_skin']");
    expect(source).toContain("prepull: ['lightning_shield']");
    expect(source).toContain("rotation: ['flame_shock', 'earth_shock', 'lightning_bolt']");
    expect(source).toContain(
      "rotation: ['immolate', 'corruption', 'curse_of_agony', 'shadow_bolt']",
    );
  });

  it('prioritizes caster cooldown/maintenance spells before standard filler nukes', () => {
    expect(source).toContain("rotation: ['fire_blast', 'pyroblast', 'fireball', 'scorch']");
    expect(source).toContain("rotation: ['frostbolt']");
    expect(source).toContain("rotation: ['arcane_missiles']");
    expect(source).toContain(
      "rotation: ['shadowburn', 'immolate', 'corruption', 'curse_of_agony', 'shadow_bolt']",
    );
    expect(source).toContain(
      "rotation: ['immolate', 'corruption', 'curse_of_agony', 'drain_life', 'shadow_bolt']",
    );
    expect(source).toContain("rotation: ['moonfire', 'insect_swarm', 'wrath']");
    expect(source).toContain("rotation: ['shadow_word_pain', 'mind_blast', 'mind_flay', 'smite']");
    expect(source).toContain("spec.key === 'fire_mage'");
  });

  it('models enhancement as Flametongue prepull, then auto-attacks, Stormstrike on cooldown, and Flame/Earth shock weave', () => {
    expect(source).toContain("prepull: ['flametongue_weapon']");
    expect(source).toContain("rotation: ['stormstrike', 'flame_shock', 'earth_shock']");
    expect(source).toContain('sim.startAutoAttack(pid)');
  });
});
