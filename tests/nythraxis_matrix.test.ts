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
    expect(source).toContain("prepull: ['demon_skin']");
    expect(source).toContain("prepull: ['lightning_shield']");
    expect(source).toContain("rotation: ['flame_shock', 'earth_shock', 'lightning_bolt']");
    expect(source).toContain("'raise_bone_mage'");
    expect(source).toContain("'raise_skeletal_warrior'");
    expect(source).toContain("'reaping_command'");
    expect(source).toContain("'soul_harvest'");
    expect(source).toContain("'evil_eye'");
    expect(source).toContain("'sentence'");
    expect(source).toContain("'needle_of_fate'");
    expect(source).toContain(
      "spec.key === 'demonology_warlock' ? 'raise_graveguard' : 'summon_imp'",
    );
  });

  it('prioritizes caster cooldown/maintenance spells before standard filler nukes', () => {
    expect(source).toContain("rotation: ['fire_blast', 'pyroblast', 'fireball', 'scorch']");
    expect(source).toContain("rotation: ['frostbolt']");
    expect(source).toContain("rotation: ['arcane_missiles']");
    expect(source).toContain("'shadowburn'");
    expect(source).toContain("'drain_life'");
    expect(source).toContain("'life_tap'");
    expect(source).toContain("rotation: ['moonfire', 'insect_swarm', 'wrath']");
    expect(source).toContain("rotation: ['shadow_word_pain', 'mind_blast', 'mind_flay', 'smite']");
    expect(source).toContain("spec.key === 'fire_mage'");
  });

  it('runs multiple deterministic seeds and reports owner, pet, and combined damage', () => {
    expect(source).toContain("process.env.MATRIX_SEEDS ?? '42,1337,9001'");
    expect(source).toContain('playerDamageDone');
    expect(source).toContain('petDamageDone');
    expect(source).toContain('specDamageBreakdown');
    expect(source).toContain('avgLifeTaps');
  });

  it('normalizes the legacy matrix fixtures through the canonical talent allocation', () => {
    expect(source).toContain('const canonical: TalentAllocation');
    expect(source).toContain('spec: spec.talents.spec');
    expect(source).toContain('validateAllocation(spec.cls, canonical');
    expect(source).toContain('sim.applyTalents(canonical, pid)');
  });

  it('models enhancement as Flametongue prepull, then auto-attacks, Stormstrike on cooldown, and Flame/Earth shock weave', () => {
    expect(source).toContain("prepull: ['flametongue_weapon']");
    expect(source).toContain("rotation: ['stormstrike', 'flame_shock', 'earth_shock']");
    expect(source).toContain('sim.startAutoAttack(pid)');
  });
});
