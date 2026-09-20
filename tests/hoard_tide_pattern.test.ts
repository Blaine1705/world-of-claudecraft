import { describe, expect, it } from 'vitest';
import { tickHoardBossMechanics } from '../src/sim/rift/hoard_boss';
import { HOARD_TIDE_WAVE_HALF_GAP, pointInHoardTideWave } from '../src/sim/rift/hoard_boss_kits';
import { HOARD_TIDE_ESCAPE_SPEED, hoardTidePattern } from '../src/sim/rift/hoard_tide_pattern';
import { makeVaultSeed } from '../src/sim/rift/vault_seed';
import { Sim } from '../src/sim/sim';
import { DT } from '../src/sim/types';

describe('Hoard tide pattern fairness', () => {
  it('is deterministic, changes edges and gaps, and scales count and travel speed by rarity', () => {
    let lastSpeed = 0;
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
      const calm = hoardTidePattern(32, rarity, false);
      const angry = hoardTidePattern(32, rarity, true);
      expect(calm).toEqual(hoardTidePattern(32, rarity, false));
      expect(calm.length).toBe(rarity === 'common' ? 1 : 2);
      expect(angry.length).toBe(rarity === 'common' ? 1 : rarity === 'rare' ? 2 : 3);
      expect(new Set(angry.map((w) => w.facing)).size).toBe(angry.length);
      expect(new Set(angry.map((w) => w.gap)).size).toBe(angry.length);
      const speed = calm[0].radius / (calm[0].total - calm[0].lead);
      expect(speed).toBeGreaterThan(lastSpeed);
      lastSpeed = speed;
    }
  });

  it('allows a conservative walker to reach every new gap from every point in its lane', () => {
    for (let seed = 1; seed <= 100; seed++)
      for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
        for (const wave of hoardTidePattern(seed, rarity, true)) {
          for (let x = -wave.span; x <= wave.span; x += 0.25) {
            const distance = Math.max(0, Math.abs(x - wave.gap) - HOARD_TIDE_WAVE_HALF_GAP + 0.1);
            expect(distance / HOARD_TIDE_ESCAPE_SPEED + 0.5).toBeLessThan(wave.lead);
          }
          expect(
            pointInHoardTideWave(
              { x: 0, z: 0 },
              0,
              { x: wave.gap, z: 0 },
              wave.radius,
              1,
              wave.total,
              wave.gap,
              wave.span,
              wave.lead,
            ),
          ).toBe(false);
        }
      }
  });

  it('has no damage anywhere during the full lead and keeps shifted gap safe during travel', () => {
    const wave = hoardTidePattern(3, 'legendary', false)[0];
    for (let remaining = wave.total; remaining > wave.total - wave.lead; remaining -= DT) {
      expect(
        pointInHoardTideWave(
          { x: 0, z: 0 },
          0,
          { x: 10, z: -wave.radius / 2 },
          wave.radius,
          remaining,
          wave.total,
          wave.gap,
          wave.span,
          wave.lead,
        ),
      ).toBe(false);
    }
    for (let remaining = wave.total - wave.lead; remaining > 0; remaining -= DT) {
      for (let z = -wave.radius / 2; z <= wave.radius / 2; z++) {
        expect(
          pointInHoardTideWave(
            { x: 0, z: 0 },
            0,
            { x: wave.gap, z },
            wave.radius,
            remaining,
            wave.total,
            wave.gap,
            wave.span,
            wave.lead,
          ),
        ).toBe(false);
      }
    }
  });

  it('runs three nonoverlapping warnings at enrage and caps a real player hit', () => {
    const sim = new Sim({ seed: 93, playerClass: 'warrior', autoEquip: false, devCommands: true });
    sim.chat('/dev level 20', sim.player.id);
    sim.enterRift(makeVaultSeed(3, 183), 23, sim.player.id, undefined, {
      ...sim.player,
      id: -1,
      vaultOwnerPid: sim.player.id,
      vaultRarity: 'legendary',
    });
    const inst = sim.riftInstances.find((i) => i.vault)!;
    const boss = sim.entities.get(inst.bossId!)!;
    boss.templateId = 'rift_boss_tide';
    boss.aiState = 'attack';
    tickHoardBossMechanics(sim.ctx);
    const state = inst.hoardBoss!;
    state.specialTriggered = true;
    state.sweepTimer = 0;
    boss.hp = Math.floor(boss.maxHp * 0.25);
    tickHoardBossMechanics(sim.ctx);
    const wave = state.cues.find((c) => c.variant === 'tide-wave')!;
    if (wave.kind !== 'sweep') throw new Error('missing wave');
    wave.remaining = wave.total - (wave.waveLead ?? 0) - 0.2;
    const travel = wave.radius / (wave.total - (wave.waveLead ?? 0));
    const along = -wave.radius / 2 + travel * (0.2 + DT);
    const lateral = (wave.waveGap ?? 0) > 0 ? -7 : 7;
    sim.player.pos.x = wave.x + Math.sin(wave.facing) * along + Math.cos(wave.facing) * lateral;
    sim.player.pos.z = wave.z + Math.cos(wave.facing) * along - Math.sin(wave.facing) * lateral;
    const hp = sim.player.hp;
    tickHoardBossMechanics(sim.ctx);
    expect(sim.player.hp).toBeLessThan(hp);
    expect(sim.player.hp).toBeGreaterThan(0);
    expect(wave.hitIds?.has(sim.player.id)).toBe(true);
    const hitHp = sim.player.hp;
    tickHoardBossMechanics(sim.ctx);
    expect(sim.player.hp).toBe(hitHp);
    const ids = new Set<number>();
    for (let n = 0; n < 20 * 35; n++) {
      tickHoardBossMechanics(sim.ctx);
      const waves = state.cues.filter((c) => c.variant === 'tide-wave');
      expect(waves.length).toBeLessThanOrEqual(1);
      for (const c of waves) ids.add(c.id);
      if (ids.size === 3 && state.sequenceStep === 0) break;
    }
    expect(ids.size).toBe(3);
  });
});
