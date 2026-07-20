import { describe, expect, it } from 'vitest';
import { depositMendingCurrent, mendingCurrent } from '../src/sim/combat/shaman_spiritmend';
import { addThunderCharges, THUNDER_CHARGES_ID } from '../src/sim/combat/shaman_thundercall';
import {
  applyWarspiritPosture,
  GALEHEART_WEAPON_ID,
  STORMCAST_ID,
} from '../src/sim/combat/shaman_warspirit';
import type { TalentAllocation } from '../src/sim/content/talents';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

function allocation(spec: 'elemental' | 'enhancement' | 'restoration'): TalentAllocation {
  return { spec, rows: {} };
}

function player(sim: Sim, pid: number): Entity {
  const entity = sim.entities.get(pid);
  if (!entity) throw new Error('missing player');
  return entity;
}

describe('Shaman v0.28 state lifecycle', () => {
  it('clears every foreign spec engine on authoritative spec changes', () => {
    const sim = new Sim({ seed: 2841, playerClass: 'shaman' });
    sim.setPlayerLevel(20);
    expect(sim.setSpec('elemental')).toBe(true);
    addThunderCharges(sim.ctx, sim.player, 4);
    expect(sim.player.auras.some((aura) => aura.id === THUNDER_CHARGES_ID)).toBe(true);

    expect(sim.setSpec('enhancement')).toBe(true);
    expect(sim.player.auras.some((aura) => aura.id === THUNDER_CHARGES_ID)).toBe(false);
    applyWarspiritPosture(sim.ctx, sim.player, 'galeheart');
    sim.player.auras.push({
      id: STORMCAST_ID,
      name: 'Stormcast',
      kind: 'next_cast_instant',
      value: 1,
      remaining: 12,
      duration: 12,
      sourceId: sim.player.id,
      school: 'nature',
      empowerAbilities: ['lightning_bolt'],
    });

    expect(sim.setSpec('restoration')).toBe(true);
    expect(sim.player.auras.some((aura) => aura.id === GALEHEART_WEAPON_ID)).toBe(false);
    expect(sim.player.auras.some((aura) => aura.id === STORMCAST_ID)).toBe(false);
  });

  it('uses the same cleanup choke point for saved loadout switches', () => {
    const sim = new Sim({ seed: 2842, playerClass: 'shaman' });
    sim.setPlayerLevel(20);
    expect(sim.saveLoadout('Storm', [], allocation('elemental'))).toBe(0);
    addThunderCharges(sim.ctx, sim.player, 3);
    expect(sim.saveLoadout('Mend', [], allocation('restoration'))).toBe(1);
    expect(sim.player.auras.some((aura) => aura.id === THUNDER_CHARGES_ID)).toBe(false);

    const allyId = sim.addPlayer('warrior', 'Prepared');
    const ally = player(sim, allyId);
    depositMendingCurrent(sim.ctx, sim.player, ally, 200, 'tidecall');
    expect(mendingCurrent(ally, sim.player.id)).not.toBeNull();

    expect(sim.switchLoadout(0)).toBe(true);
    expect(mendingCurrent(ally, sim.player.id)).toBeNull();
    expect(sim.talents.spec).toBe('elemental');
  });

  it('removes remote currents on logout and restores no transient wrong-spec state', () => {
    const source = new Sim({ seed: 2843, playerClass: 'shaman', noPlayer: true });
    const healerId = source.addPlayer('shaman', 'Leaving');
    const allyId = source.addPlayer('warrior', 'Remaining');
    for (const pid of [healerId, allyId]) source.setPlayerLevel(20, pid);
    expect(source.setSpec('restoration', healerId)).toBe(true);
    const healer = player(source, healerId);
    const ally = player(source, allyId);
    depositMendingCurrent(source.ctx, healer, ally, 200, 'tidecall');
    const saved = source.serializeCharacter(healerId);
    expect(saved).not.toBeNull();

    source.removePlayer(healerId);
    expect(mendingCurrent(ally, healerId)).toBeNull();

    const restored = new Sim({ seed: 2844, playerClass: 'shaman', noPlayer: true });
    const restoredId = restored.addPlayer('shaman', 'Returning', { state: saved ?? undefined });
    expect(restored.meta(restoredId)?.talents.spec).toBe('restoration');
    expect(player(restored, restoredId).auras.some((aura) => aura.id.startsWith('shaman_'))).toBe(
      false,
    );
  });
});
