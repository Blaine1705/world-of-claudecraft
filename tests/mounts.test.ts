import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so importing server/game (for wireEntity) needs no Postgres,
// mirroring tests/snapshots.test.ts.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { meleeSwing } from '../src/sim/combat/auto_attack';
import {
  MOUNT_KEYS,
  MOUNTS,
  mountDef,
  mountMeleeBlockPct,
  normalizeMountKey,
} from '../src/sim/content/mounts';
import { selectMount, toggleMount } from '../src/sim/mounts';
import { moveSpeedMult } from '../src/sim/player_motion';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

function makeWorld() {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

function join(sim: Sim, level = 20): number {
  const pid = sim.addPlayer('warrior', 'Rider');
  sim.tick();
  if (level > 1) sim.setPlayerLevel(level, pid);
  return pid;
}

function errorTexts(events: SimEvent[]): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error')
    .map((e) => e.text);
}

describe('mount catalog (the seven ground mounts from the cards)', () => {
  it('has exactly the seven mounts with the horse first (the base mount)', () => {
    expect(MOUNT_KEYS).toHaveLength(7);
    expect(MOUNT_KEYS[0]).toBe('valorsteed');
  });

  it('pins each card: level gate, rarity, and specialty numbers', () => {
    const spec = (k: string) => {
      const d = MOUNTS[k as keyof typeof MOUNTS];
      return [d.level, d.rarity, d.moveSpeedPct, d.meleeBlockPct, d.critPct];
    };
    expect(spec('valorsteed')).toEqual([10, 'common', 0.4, 0, 0]);
    expect(spec('grag_bear')).toEqual([10, 'common', 0.4, 0, 0]);
    expect(spec('stalkglider_snail')).toEqual([10, 'common', 0.4, 0, 0]);
    expect(spec('aether_hover_cycle')).toEqual([15, 'rare', 0.5, 0.05, 0]);
    expect(spec('shadowjump_toad')).toEqual([15, 'rare', 0.5, 0.05, 0]);
    expect(spec('stormfeather_griffin')).toEqual([20, 'epic', 0.65, 0.05, 0.05]);
    expect(spec('lunar_cheshire')).toEqual([20, 'epic', 0.65, 0.05, 0.05]);
  });

  it('normalizeMountKey coerces unknown or absent keys to "" (unmounted)', () => {
    expect(normalizeMountKey('valorsteed')).toBe('valorsteed');
    expect(normalizeMountKey('flying_carpet')).toBe('');
    expect(normalizeMountKey(undefined)).toBe('');
    expect(normalizeMountKey(null)).toBe('');
    expect(mountDef('nope')).toBeNull();
  });
});

describe('mount selection', () => {
  it('rejects an unknown key and leaves the pick unchanged', () => {
    const sim = makeWorld();
    const pid = join(sim);
    expect(selectMount(sim.ctx, pid, 'flying_carpet')).toBe(false);
    expect(sim.selectedMount()).toBe('');
  });

  it('level-gates the pick and emits the mountLevel error', () => {
    const sim = makeWorld();
    const pid = join(sim, 1);
    expect(selectMount(sim.ctx, pid, 'valorsteed')).toBe(false);
    expect(errorTexts(sim.tick())).toContain('You must be level 10 to ride that mount.');
    expect(sim.selectedMount()).toBe('');
    sim.setPlayerLevel(10, pid);
    expect(selectMount(sim.ctx, pid, 'valorsteed')).toBe(true);
    expect(sim.selectedMount()).toBe('valorsteed');
  });

  it('swaps the live mount in place when already riding', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    expect(e.mountKey).toBe('valorsteed');
    selectMount(sim.ctx, pid, 'lunar_cheshire');
    expect(e.mountKey).toBe('lunar_cheshire');
  });

  it('never live-swaps in combat (the pick updates, the ridden mount stays)', () => {
    // A mid-fight swap onto an epic would bypass toggleMount's combat gate and
    // grant its crit/block reactively; the swap must wait for the next mount.
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    e.inCombat = true;
    expect(selectMount(sim.ctx, pid, 'lunar_cheshire')).toBe(true);
    expect(e.mountKey).toBe('valorsteed');
    expect(sim.players.get(pid)?.selectedMount).toBe('lunar_cheshire');
  });

  it('persists the pick (absent until chosen) and restores it on load', () => {
    const sim = makeWorld();
    const pid = join(sim, 10);
    expect(sim.serializeCharacter(pid)).not.toHaveProperty('selectedMount');
    selectMount(sim.ctx, pid, 'grag_bear');
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error('serializeCharacter returned null');
    expect(state.selectedMount).toBe('grag_bear');

    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Rider', { state });
    sim2.tick();
    expect(sim2.players.get(pid2)?.selectedMount).toBe('grag_bear');
    // The live mounted state never persists: a reload always starts dismounted.
    expect(sim2.entities.get(pid2)?.mountKey).toBe('');
  });
});

describe('mount and dismount rules', () => {
  it('is a no-op with nothing selected (the client opens the window instead)', () => {
    const sim = makeWorld();
    const pid = join(sim);
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    expect(sim.entities.get(pid)?.mountKey).toBe('');
  });

  it('mounts out of combat and dismounts on a second toggle', () => {
    const sim = makeWorld();
    const pid = join(sim, 10);
    const e = sim.entities.get(pid)!;
    selectMount(sim.ctx, pid, 'valorsteed');
    expect(toggleMount(sim.ctx, pid)).toBe(true);
    expect(e.mountKey).toBe('valorsteed');
    expect(toggleMount(sim.ctx, pid)).toBe(true);
    expect(e.mountKey).toBe('');
  });

  it('refuses to mount in combat but always allows dismounting', () => {
    const sim = makeWorld();
    const pid = join(sim, 10);
    const e = sim.entities.get(pid)!;
    selectMount(sim.ctx, pid, 'valorsteed');
    e.inCombat = true;
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    expect(errorTexts(sim.tick())).toContain("You can't do that while in combat.");
    expect(e.mountKey).toBe('');
    e.inCombat = false;
    toggleMount(sim.ctx, pid);
    e.inCombat = true;
    expect(toggleMount(sim.ctx, pid)).toBe(true); // dismount is never gated
    expect(e.mountKey).toBe('');
  });

  it('refuses to mount while dead or a released spirit', () => {
    const sim = makeWorld();
    const pid = join(sim, 10);
    const e = sim.entities.get(pid)!;
    selectMount(sim.ctx, pid, 'valorsteed');
    e.dead = true;
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    e.dead = false;
    e.ghost = true;
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    expect(e.mountKey).toBe('');
  });

  it('force-dismounts on death and keeps the pick for remounting', () => {
    const sim = makeWorld();
    const pid = join(sim, 10);
    const e = sim.entities.get(pid)!;
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    expect(e.mountKey).toBe('valorsteed');
    sim.ctx.dealDamage(null, e, e.hp + 100, false, 'physical', null, 'hit');
    expect(e.dead).toBe(true);
    expect(e.mountKey).toBe('');
    expect(sim.players.get(pid)?.selectedMount).toBe('valorsteed');
  });
});

describe('mount specialty stats', () => {
  it('applies extra mobility while mounted, composing with slows', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    expect(moveSpeedMult(e)).toBe(1);
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    expect(moveSpeedMult(e)).toBeCloseTo(1.4, 10);
    selectMount(sim.ctx, pid, 'lunar_cheshire');
    expect(moveSpeedMult(e)).toBeCloseTo(1.65, 10);
    e.auras.push({
      id: 'slow_test',
      name: 'slow',
      kind: 'slow',
      remaining: 10,
      duration: 10,
      value: 0.5,
      sourceId: 0,
      school: 'physical',
    });
    expect(moveSpeedMult(e)).toBeCloseTo(0.825, 10);
  });

  it('grants the epic crit bonus while mounted and removes it on dismount', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    const base = e.critChance;
    selectMount(sim.ctx, pid, 'stormfeather_griffin');
    toggleMount(sim.ctx, pid);
    expect(e.critChance).toBeCloseTo(base + 0.05, 10);
    toggleMount(sim.ctx, pid);
    expect(e.critChance).toBeCloseTo(base, 10);
  });

  it('commons carry no crit or block; rare and epic block 5% of melee', () => {
    expect(mountMeleeBlockPct('valorsteed')).toBe(0);
    expect(mountMeleeBlockPct('aether_hover_cycle')).toBe(0.05);
    expect(mountMeleeBlockPct('stormfeather_griffin')).toBe(0.05);
    expect(mountMeleeBlockPct('')).toBe(0);
  });

  it('shaves 5% off an identical melee swing when the target rides a rare mount', () => {
    // Twin sims on the same seed: the rng stream (miss/dodge/crit/weapon rolls)
    // is identical, so the only divergence is the mounted melee block.
    const damages: number[] = [];
    for (const mounted of [false, true]) {
      const sim = makeWorld();
      const attacker = join(sim, 20);
      const target = sim.addPlayer('warrior', 'Tank');
      sim.tick();
      sim.setPlayerLevel(20, target);
      const te = sim.entities.get(target)!;
      if (mounted) {
        selectMount(sim.ctx, target, 'shadowjump_toad');
        toggleMount(sim.ctx, target);
        expect(te.mountKey).toBe('shadowjump_toad');
      }
      const hpBefore = te.hp;
      meleeSwing(sim.ctx, sim.entities.get(attacker)!, te, 0, null, {});
      damages.push(hpBefore - te.hp);
    }
    const [unmounted, mounted] = damages;
    expect(unmounted).toBeGreaterThan(0);
    // Rounded post-multiplier: within a point of the exact 5% cut, and strictly less.
    expect(Math.abs(mounted - unmounted * 0.95)).toBeLessThanOrEqual(1);
    expect(mounted).toBeLessThan(unmounted);
  });
});

describe('mount wire mirror', () => {
  it('rides the entity identity fields like skin', async () => {
    const { wireEntity } = await import('../server/game');
    const sim = makeWorld();
    const pid = join(sim, 10);
    const e = sim.entities.get(pid)!;
    expect(wireEntity(e)).not.toHaveProperty('mnt');
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    expect(wireEntity(e).mnt).toBe('valorsteed');
  });
});
