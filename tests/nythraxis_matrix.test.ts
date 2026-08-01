import { readFileSync } from 'node:fs';
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
