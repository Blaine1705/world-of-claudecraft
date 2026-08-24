import { describe, expect, it } from 'vitest';
import { dealDamage } from '../src/sim/combat/damage';
import { applyCourserDaze, COURSER_DAZE_AURA_ID } from '../src/sim/combat/hunter_shared';
import { ABILITIES } from '../src/sim/content/classes';
import { moveSpeedMult } from '../src/sim/player_motion';
import { Sim } from '../src/sim/sim';

// Aspect of the Cheetah / Courser's Guise: +30% move speed, but taking damage
// while it is active dazes the hunter to half of their CURRENT total speed for
// 4s, refreshed (never stacked) by each hit. The classic anti-kite counterplay.
const CHEETAH = 'aspect_of_the_cheetah';

function hunterWithCheetah(seed = 7): Sim {
  const sim = new Sim({ seed, playerClass: 'hunter', autoEquip: true });
  sim.setPlayerLevel(20);
  sim.castAbility(CHEETAH);
  sim.tick();
  return sim;
}

function hit(sim: Sim, amount = 50): void {
  // Magic school so player armor cannot mitigate the test damage to zero.
  dealDamage(sim.ctx, null, sim.player, amount, false, 'shadow', 'Test Hit', 'hit');
}

describe("Courser's Guise daze", () => {
  it('tooltip documents the daze drawback', () => {
    const def = ABILITIES[CHEETAH];
    expect(def.description).toMatch(/daze/i);
    expect(def.description).toMatch(/4 sec/);
  });

  it('grants +30% move speed with no daze until struck', () => {
    const sim = hunterWithCheetah();
    expect(sim.player.auras.some((a) => a.id === CHEETAH)).toBe(true);
    expect(moveSpeedMult(sim.player)).toBeCloseTo(1.3, 5);
    expect(sim.player.auras.some((a) => a.id === COURSER_DAZE_AURA_ID)).toBe(false);
  });

  it('dazes to half of total speed on taking damage while active', () => {
    const sim = hunterWithCheetah();
    hit(sim);
    const daze = sim.player.auras.find((a) => a.id === COURSER_DAZE_AURA_ID);
    expect(daze).toBeTruthy();
    expect(daze!.kind).toBe('slow');
    expect(daze!.value).toBeCloseTo(0.5, 5);
    expect(daze!.duration).toBe(4);
    // 0.5 * the aspect's 1.3 = 0.65: half of the CURRENT total, not base run.
    expect(moveSpeedMult(sim.player)).toBeCloseTo(0.65, 5);
  });

  it('refreshes the 4s timer on each hit rather than stacking', () => {
    const sim = hunterWithCheetah();
    hit(sim);
    for (let i = 0; i < 20; i++) sim.tick(); // one second of decay
    const mid = sim.player.auras.find((a) => a.id === COURSER_DAZE_AURA_ID);
    expect(mid!.remaining).toBeLessThan(4);
    hit(sim);
    const dazes = sim.player.auras.filter((a) => a.id === COURSER_DAZE_AURA_ID);
    expect(dazes).toHaveLength(1);
    expect(dazes[0].remaining).toBeCloseTo(4, 1);
  });

  it('does not daze on non-damage HP loss (a max-HP buff expiring)', () => {
    // The daze must fire on DAMAGE TAKEN only, never on incidental health loss.
    // A max-HP buff dropping recomputes stats and clamps current HP downward
    // (recalcPlayerStats), a real HP loss that never routes through dealDamage.
    const sim = hunterWithCheetah();
    const p = sim.player;
    p.auras.push({
      id: 'test_maxhp',
      name: 'Test Vitality',
      kind: 'buff_maxhp_pct',
      remaining: 60,
      duration: 60,
      value: 0.5,
      sourceId: p.id,
      school: 'physical',
    });
    sim.ctx.recalcPlayer(p); // buff applies: max HP and current HP scale up
    const hpBuffed = p.hp;
    p.auras = p.auras.filter((a) => a.id !== 'test_maxhp');
    sim.ctx.recalcPlayer(p); // buff drops: max HP falls, current HP clamps down
    expect(p.hp).toBeLessThan(hpBuffed); // HP genuinely dropped,
    expect(p.auras.some((a) => a.id === COURSER_DAZE_AURA_ID)).toBe(false); // but no daze
  });

  it("does not daze when Courser's Guise is inactive", () => {
    const sim = new Sim({ seed: 7, playerClass: 'hunter', autoEquip: true });
    sim.setPlayerLevel(20);
    hit(sim);
    expect(sim.player.auras.some((a) => a.id === COURSER_DAZE_AURA_ID)).toBe(false);
  });

  it('expires after 4 seconds, restoring full aspect speed', () => {
    const sim = hunterWithCheetah();
    hit(sim);
    for (let i = 0; i < 20 * 4 + 2; i++) sim.tick();
    expect(sim.player.auras.some((a) => a.id === COURSER_DAZE_AURA_ID)).toBe(false);
    expect(moveSpeedMult(sim.player)).toBeCloseTo(1.3, 5);
  });

  it('applyCourserDaze (the dev-command helper) applies the daze directly', () => {
    const sim = new Sim({ seed: 7, playerClass: 'hunter', autoEquip: true });
    sim.setPlayerLevel(20);
    applyCourserDaze(sim.ctx, sim.player);
    const daze = sim.player.auras.find((a) => a.id === COURSER_DAZE_AURA_ID);
    expect(daze).toBeTruthy();
    expect(moveSpeedMult(sim.player)).toBeCloseTo(0.5, 5);
  });
});
