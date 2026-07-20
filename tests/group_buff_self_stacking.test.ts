// Group buffs are ONE per target regardless of caster: a second Hunter's Pack
// Rally replaces the first. The general rule: every aoeAlly group buff must either carry
// Bloodlust-style exhaustion (exhaust: true, the 'sated' debuff blocks a second
// application) or appear in aura_stacking's source-independent dedupe set; the
// guard test at the bottom makes forgetting BOTH a loud CI failure for any
// future group buff.
import { describe, expect, it } from 'vitest';
import { SOURCE_INDEPENDENT_GROUP_BUFF_AURA_IDS } from '../src/sim/combat/aura_stacking';
import { runHunterPackRally } from '../src/sim/combat/hunter_shared';
import { ABILITIES } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

type AnySim = Sim & Record<string, any>;

describe('Pack Rally never stacks with itself', () => {
  it('a second hunter casting replaces the first copy instead of stacking', () => {
    const sim = new Sim({ seed: 2026, playerClass: 'hunter', noPlayer: true }) as AnySim;
    const a = sim.addPlayer('hunter', 'HunterA');
    const b = sim.addPlayer('hunter', 'HunterB');
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    for (const pid of [a, b]) {
      sim.setPlayerLevel(20, pid);
      expect(sim.setSpec('beast_mastery', pid)).toBe(true);
      expect(sim.selectTalentRow(17, 'hun_r17_pack_rally', pid)).toBe(true);
      const p = sim.entities.get(pid) as Entity;
      p.resource = p.maxResource;
      p.inCombat = true;
    }
    const entA = sim.entities.get(a) as Entity;
    const entB = sim.entities.get(b) as Entity;
    entB.pos = { ...entA.pos };

    runHunterPackRally(sim.ctx, entA, 10, 30);
    runHunterPackRally(sim.ctx, entB, 10, 30);

    for (const ent of [entA, entB]) {
      const speed = ent.auras.filter((x) => x.id === 'hunter_pack_rally_speed');
      const attackHaste = ent.auras.filter((x) => x.id === 'hunter_pack_rally_haste');
      const spellHaste = ent.auras.filter((x) => x.id === 'hunter_pack_rally_spellhaste');
      expect(speed, 'one speed copy').toHaveLength(1);
      expect(attackHaste, 'one attack haste copy').toHaveLength(1);
      expect(spellHaste, 'one spell haste copy').toHaveLength(1);
      // The later cast owns the surviving copy.
      expect(speed[0].sourceId).toBe(b);
      expect(attackHaste[0].sourceId).toBe(b);
      expect(spellHaste[0].sourceId).toBe(b);
    }
  });
});

describe('every group buff is exhaustion-gated or source-independent', () => {
  it('no aoeAlly buff can silently self-stack across casters', () => {
    const offenders: string[] = [];
    for (const ability of Object.values(ABILITIES)) {
      for (const eff of ability.effects ?? []) {
        if (eff.type === 'aoeAllyHaste') {
          if (!eff.exhaust && !SOURCE_INDEPENDENT_GROUP_BUFF_AURA_IDS.has(ability.id)) {
            offenders.push(`${ability.id} (aoeAllyHaste)`);
          }
        } else if (eff.type === 'aoeAllyAttackPower') {
          // The dispatch stamps this half as `${abilityId}_ap`.
          if (!SOURCE_INDEPENDENT_GROUP_BUFF_AURA_IDS.has(`${ability.id}_ap`)) {
            offenders.push(`${ability.id} (aoeAllyAttackPower)`);
          }
        }
      }
    }
    expect(offenders, 'group buffs missing both self-stack guards').toEqual([]);
  });
});
