// /dev balgath <mechanic> (src/sim/dev/balgath_dev_mechanics.ts): the playtest hook that
// forces one of Balgath's mechanics on the nearest live Balgath, aimed at the caller.
//
// What is pinned: the parser, the gate (the verb does not exist without dev commands),
// that every verb plays its real telegraph AND its landing for a SOLO tester standing
// inside the ranged kit's 18-yard minimum, and that a forced cast leaves the natural
// rotation's spacing intact (the lock re-armed, the cadence restarted, no stacked rings).
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 120_000 });

import { MOBS } from '../src/sim/data';
import {
  BALGATH_DEV_MECHANICS,
  BALGATH_DEV_RANGE,
  type BalgathDevMechanic,
  parseBalgathDevCommand,
} from '../src/sim/dev/balgath_dev_mechanics';
import {
  BOULDER_ABILITY,
  BURDEN_ABILITY,
  BURDEN_AURA_ID,
  GLARE_ABILITY,
} from '../src/sim/mob/boss_ranged_mechanics';
import { CLEAVE_ABILITY, HAMMER_ABILITY } from '../src/sim/mob/boss_slams';
import { WARPATH_WRECK_ABILITY } from '../src/sim/mob/warpath';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

const BALGATH = 'balgath_cyclops';
const LAIR = { x: 147, z: 310 };

interface Internals {
  spawnDevBoss(t: string, x: number, z: number): number;
  setGm(pid?: number, on?: boolean): void;
}

function place(sim: Sim, e: Entity, x: number, z: number): void {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  e.onGround = true;
}

/** A solo tester eight yards from an idle, awake Balgath (inside every ranged minimum). */
function world(devCommands = true, gap = 8): { sim: Sim; boss: Entity; me: Entity } {
  const sim = new Sim({ seed: 11, playerClass: 'warrior', autoEquip: true, devCommands });
  sim.setPlayerLevel(20);
  const id = (sim as unknown as Internals).spawnDevBoss(BALGATH, LAIR.x, LAIR.z);
  const boss = sim.entities.get(id) as Entity;
  place(sim, boss, LAIR.x, LAIR.z);
  const me = sim.player;
  place(sim, me, LAIR.x + gap, LAIR.z);
  // Godded so the landing ticks run without the tester dying mid-assert (the landing
  // EVENTS are what is pinned, and they are emitted either way).
  (sim as unknown as Internals).setGm(me.id, true);
  sim.drainEvents();
  return { sim, boss, me };
}

function run(sim: Sim, seconds: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 20); i++) out.push(...sim.tick());
  out.push(...sim.drainEvents());
  return out;
}

type FxAt = Extract<SimEvent, { type: 'spellfxAt' }>;
type Fx = Extract<SimEvent, { type: 'spellfx' }>;
const fxAt = (evs: SimEvent[], fx: string, ability?: string): FxAt[] =>
  evs.filter(
    (e): e is FxAt =>
      e.type === 'spellfxAt' &&
      e.fx === fx &&
      (ability === undefined || (e as { ability?: string }).ability === ability),
  );
const windups = (evs: SimEvent[], ability: string): Fx[] =>
  evs.filter(
    (e): e is Fx =>
      e.type === 'spellfx' && e.fx === 'windup' && (e as { ability?: string }).ability === ability,
  );
const errors = (evs: SimEvent[]) =>
  evs.filter((e) => e.type === 'error').map((e) => (e as { text: string }).text);
const logs = (evs: SimEvent[]) =>
  evs.filter((e) => e.type === 'log').map((e) => (e as { text: string }).text);

function force(sim: Sim, verb: string): SimEvent[] {
  sim.chat(`/dev balgath ${verb}`, sim.player.id);
  return sim.drainEvents();
}

describe('parseBalgathDevCommand', () => {
  it('reads every verb, help, the bare command and the alias, case-insensitively', () => {
    for (const v of BALGATH_DEV_MECHANICS) {
      expect(parseBalgathDevCommand(`/dev balgath ${v}`)).toEqual({
        kind: 'mechanic',
        mechanic: v,
      });
    }
    expect(parseBalgathDevCommand('/DEV Balgath GLARE')).toEqual({
      kind: 'mechanic',
      mechanic: 'glare',
    });
    expect(parseBalgathDevCommand('/devbalgath stomp')).toEqual({
      kind: 'mechanic',
      mechanic: 'stomp',
    });
    expect(parseBalgathDevCommand('/dev balgath')).toEqual({ kind: 'help' });
    expect(parseBalgathDevCommand('/dev balgath help')).toEqual({ kind: 'help' });
    expect(parseBalgathDevCommand('/dev balgath fireball')).toEqual({
      kind: 'unknown',
      verb: 'fireball',
    });
    expect(parseBalgathDevCommand('/dev balgathx glare')).toBeNull();
    expect(parseBalgathDevCommand('/dev balgath glare now')).toBeNull();
    expect(parseBalgathDevCommand('/dev nyx curse')).toBeNull();
  });

  it('lists exactly the nine mechanics the owner asked for', () => {
    expect([...BALGATH_DEV_MECHANICS].sort()).toEqual(
      ['boulder', 'burden', 'cleave', 'glare', 'hammer', 'scry', 'smash', 'stomp', 'wreck'].sort(),
    );
  });
});

describe('/dev balgath gating', () => {
  it('does nothing at all without dev commands', () => {
    const { sim, boss } = world(false);
    const evs = force(sim, 'glare');
    expect(fxAt(evs, 'runeCircle')).toHaveLength(0);
    expect(boss.rangedWindup ?? 0).toBe(0);
    expect(boss.aiState).toBe('idle');
    expect(logs(evs).some((t) => t.includes('Balgath'))).toBe(false);
  });

  it('help lists every verb', () => {
    const { sim } = world();
    const text = logs(force(sim, 'help')).join('\n');
    for (const v of BALGATH_DEV_MECHANICS) expect(text).toContain(`/dev balgath ${v}`);
  });

  it('an unknown verb answers with the usage line and forces nothing', () => {
    const { sim, boss } = world();
    const evs = force(sim, 'fireball');
    expect(errors(evs).join('\n')).toContain('Usage: /dev balgath <glare|boulder|burden');
    expect(boss.aiState).toBe('idle');
  });

  it('refuses with no Balgath in range', () => {
    const { sim, boss } = world(true, BALGATH_DEV_RANGE + 20);
    const evs = force(sim, 'hammer');
    expect(errors(evs).join('\n')).toContain('No live Balgath');
    expect(boss.slamWindup ?? 0).toBe(0);
  });

  it('refuses an asleep Balgath with the dawn hint, and does not wake him', () => {
    const { sim, boss } = world();
    boss.asleep = true;
    boss.hostile = false;
    const evs = force(sim, 'boulder');
    expect(errors(evs).join('\n')).toMatch(/asleep.*Dawn wakes him/);
    expect(boss.rangedWindup ?? 0).toBe(0);
    expect(boss.aiState).toBe('idle');
  });

  it('engages an idle, awake Balgath with the caller', () => {
    const { sim, boss, me } = world();
    expect(boss.aiState).toBe('idle');
    const evs = force(sim, 'hammer');
    expect(boss.aiState).toBe('chase');
    expect(boss.aggroTargetId).toBe(me.id);
    expect(logs(evs).join('\n')).toContain('now engaged with you');
  });
});

/** Per verb: the telegraph the force must put down, and the landing that must follow. */
const EXPECT: Record<
  BalgathDevMechanic,
  { telegraph: (evs: SimEvent[], me: Entity, boss: Entity) => void; land?: string }
> = {
  glare: {
    telegraph: (evs, me) => {
      const ring = fxAt(evs, 'runeCircle', GLARE_ABILITY);
      expect(ring).toHaveLength(1);
      expect(ring[0].targetId).toBe(me.id);
      expect(windups(evs, GLARE_ABILITY)).toHaveLength(1);
    },
    land: GLARE_ABILITY,
  },
  boulder: {
    telegraph: (evs, me) => {
      const ring = fxAt(evs, 'runeCircle', BOULDER_ABILITY);
      expect(ring).toHaveLength(1);
      expect(ring[0].targetId).toBe(me.id);
      expect(ring[0].x).toBeCloseTo(me.pos.x, 5);
      expect(ring[0].z).toBeCloseTo(me.pos.z, 5);
    },
    land: BOULDER_ABILITY,
  },
  burden: {
    telegraph: (evs, me, boss) => {
      expect(me.auras.some((a) => a.id === BURDEN_AURA_ID && a.sourceId === boss.id)).toBe(true);
      expect(windups(evs, BURDEN_ABILITY)).toHaveLength(1);
    },
    land: BURDEN_ABILITY,
  },
  cleave: {
    telegraph: (evs, me, boss) => {
      const ring = fxAt(evs, 'runeCircle', CLEAVE_ABILITY);
      expect(ring).toHaveLength(1);
      // Aimed through the caller.
      const ang = Math.atan2(me.pos.x - boss.pos.x, me.pos.z - boss.pos.z);
      expect(ring[0].dirX).toBeCloseTo(Math.sin(ang), 5);
      expect(ring[0].dirZ).toBeCloseTo(Math.cos(ang), 5);
    },
    land: CLEAVE_ABILITY,
  },
  hammer: {
    telegraph: (evs, me) => {
      const ring = fxAt(evs, 'runeCircle', HAMMER_ABILITY);
      expect(ring).toHaveLength(1);
      expect(ring[0].x).toBeCloseTo(me.pos.x, 5);
    },
    land: HAMMER_ABILITY,
  },
  smash: {
    telegraph: (evs) => {
      expect(windups(evs, 'mob_pulse_windup')).toHaveLength(1);
      const r = MOBS[BALGATH]?.aoePulse?.radius;
      expect(fxAt(evs, 'runeCircle').some((e) => e.radius === r)).toBe(true);
    },
  },
  stomp: {
    telegraph: (evs) => {
      expect(windups(evs, 'mob_stomp_windup')).toHaveLength(1);
      const r = MOBS[BALGATH]?.stomp?.radius;
      expect(fxAt(evs, 'runeCircle').some((e) => e.radius === r)).toBe(true);
    },
  },
  scry: {
    telegraph: (_evs, _me, boss) => {
      expect(boss.castingAbility).toBe('balgath_scry');
      expect(boss.castRemaining).toBeCloseTo(MOBS[BALGATH]?.bigCast?.castTime ?? -1, 5);
    },
  },
  wreck: {
    telegraph: (evs, _me, boss) => {
      expect(windups(evs, WARPATH_WRECK_ABILITY)).toHaveLength(1);
      expect(boss.warpathPhase).toBe('wreck');
      const r = MOBS[BALGATH]?.warpath?.wreck.radius;
      expect(fxAt(evs, 'runeCircle').some((e) => e.radius === r)).toBe(true);
    },
  },
};

describe('/dev balgath <mechanic> forces the real telegraph for a solo tester', () => {
  for (const verb of BALGATH_DEV_MECHANICS) {
    it(`${verb}: telegraph now, landing after the wind-up`, () => {
      const { sim, boss, me } = world();
      const evs = force(sim, verb);
      expect(errors(evs)).toEqual([]);
      EXPECT[verb].telegraph(evs, me, boss);
      const ability = EXPECT[verb].land;
      if (ability) {
        const later = run(sim, 7);
        expect(fxAt(later, 'nova', ability).length).toBeGreaterThanOrEqual(1);
      }
    });
  }

  it('the circle slams and the scry land too (positioned impact / the bar completes)', () => {
    for (const verb of ['smash', 'stomp'] as const) {
      const { sim, me } = world();
      force(sim, verb);
      const r = verb === 'smash' ? MOBS[BALGATH]?.aoePulse?.radius : MOBS[BALGATH]?.stomp?.radius;
      const later = run(sim, 3);
      expect(fxAt(later, 'nova').some((e) => e.radius === r)).toBe(true);
      expect(me.dead).toBe(false);
    }
    const { sim, boss } = world(true, 3);
    force(sim, 'scry');
    run(sim, (MOBS[BALGATH]?.bigCast?.castTime ?? 0) + 3);
    expect(boss.castingAbility).not.toBe('balgath_scry');
  });
});

describe('a forced cast keeps the natural spacing rules', () => {
  it('refuses a second telegraph while the first is on the ground', () => {
    const { sim, boss } = world();
    force(sim, 'glare');
    const evs = force(sim, 'boulder');
    expect(errors(evs).join('\n')).toContain('still on the ground');
    expect(fxAt(evs, 'runeCircle', BOULDER_ABILITY)).toHaveLength(0);
    expect(boss.rangedKind).toBe('glare');
  });

  it('re-arms the lock and restarts only the forced cadence', () => {
    const { sim, boss } = world();
    const kit = MOBS[BALGATH]?.rangedMechanics;
    const slams = MOBS[BALGATH]?.slams;
    if (!kit || !slams) throw new Error('no kit');
    force(sim, 'glare');
    expect(boss.glareTimer).toBe(kit.glare.every);
    expect(boss.mechanicLockTimer ?? 0).toBeGreaterThanOrEqual(kit.glare.windup);
    run(sim, kit.glare.windup + 0.5);
    force(sim, 'hammer');
    expect(boss.hammerTimer).toBe(slams.hammer.every);
    expect(boss.mechanicLockTimer ?? 0).toBeGreaterThanOrEqual(slams.hammer.windup);
  });
});
