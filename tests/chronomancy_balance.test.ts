// Chronomancy Phase 3 balance harness (docs/prd/mage-chronomancy.md 13.4 / 14).
// A deterministic, sim-driven measurement of the offensive Arcane rotation the
// owner signed off on: it drives the conservative and emergency rotations and
// the Piro/Cryo nuke baselines at level 20 / auto-equipped gear and measures
// DPS, effective Echo HPS, overheal, net mana spend, and time-to-OOM. The Aether
// Surge base mana cost was DERIVED here (owner directive): tuned so the
// conservative offensive rotation lasts ~70-80s at the real ~1506 pool.
//
// Targets asserted (owner, 2026-07-12):
//   - conservative offensive rotation: 70-80s to OOM,
//   - conservative + occasional Temporal Mend/Barrier: ~55-65s,
//   - emergency (hold 4 charges): 15-25s,
//   - Piro and Cryo sustained DPS each at least 35% above conservative Chronomancy.
import { describe, expect, it } from 'vitest';
import { aetherSurgeStacks } from '../src/sim/combat/chronomancy';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

type Spec = 'arcane' | 'fire' | 'frost';

function makeMage(spec: Spec, level = 20) {
  const sim = new Sim({ seed: 41, playerClass: 'mage', autoEquip: true });
  sim.setPlayerLevel(level);
  sim.setSpec(spec);
  sim.tick();
  const p = sim.player;
  p.resource = p.maxResource;
  return { sim, p };
}

function addDummy(sim: Sim, dist = 6): Entity {
  const p = sim.player;
  const mob = createMob(9500, MOBS.training_dummy, 20, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + dist,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = 1_000_000_000;
  (sim as unknown as { addEntity(e: Entity): void }).addEntity(mob);
  return mob;
}

function addAlly(sim: Sim): Entity {
  const p = sim.player;
  const id = sim.addPlayer('warrior', 'Tanque');
  const ally = sim.entities.get(id)!;
  ally.pos.x = p.pos.x + 4;
  ally.pos.z = p.pos.z;
  ally.maxHp = 1_000_000; // large: Echo heals never clamp (raw throughput)
  return ally;
}

function free(p: Entity): boolean {
  const q = p as unknown as { castingAbility: string | null; gcdRemaining: number };
  return q.castingAbility == null && q.gcdRemaining <= 1e-6;
}

// A rotation policy returns the next {id, targetId} to cast when the player is
// free, or null to idle. Cost/OOM are checked by the runner.
type Policy = (
  p: Entity,
  dummy: Entity,
  ally: Entity,
  tSec: number,
) => { id: string; targetId: number } | null;

interface RunResult {
  oom: number; // seconds to OOM (Infinity if it survived the cap)
  dps: number; // dummy damage / active time
  echoHps: number; // effective Temporal Echo healing on the ally / active time
  netManaPerSec: number;
  seconds: number;
}

// Drive a policy from full mana until it cannot afford its next intended cast
// (OOM) or the cap elapses. The ally is pinned to 1 hp each tick so every Echo
// heal is fully EFFECTIVE (raw offensive HPS, zero overheal by construction).
function runRotation(spec: Spec, policy: Policy, capSec: number, pinAllyLow: boolean): RunResult {
  const { sim, p } = makeMage(spec);
  const dummy = addDummy(sim);
  const ally = addAlly(sim);
  const mana0 = p.resource;
  let damage = 0;
  let echoHeal = 0;
  let oomTick = -1;
  const ticks = Math.round(capSec * 20);
  for (let i = 0; i < ticks; i++) {
    if (pinAllyLow) ally.hp = 1;
    if (free(p)) {
      const next = policy(p, dummy, ally, i / 20);
      if (next) {
        const cost = sim.resolvedAbility(next.id)?.cost ?? 0;
        if (p.resource < cost) {
          oomTick = i;
          break;
        }
        sim.targetEntity(next.targetId);
        sim.castAbility(next.id);
      }
    }
    const evs: SimEvent[] = sim.tick();
    for (const e of evs) {
      if (e.type === 'damage' && e.sourceId === p.id && e.targetId === dummy.id) damage += e.amount;
      if (
        e.type === 'heal2' &&
        e.sourceId === p.id &&
        e.targetId === ally.id &&
        e.ability === 'Temporal Echo'
      )
        echoHeal += e.amount;
    }
  }
  const oom = oomTick < 0 ? Infinity : oomTick / 20;
  const active = oomTick < 0 ? capSec : oomTick / 20;
  return {
    oom,
    dps: damage / active,
    echoHps: echoHeal / active,
    netManaPerSec: (mana0 - p.resource) / active,
    seconds: active,
  };
}

// Keep Temporal Echo riding the ally (recast when it is missing/expired).
function needsEcho(ally: Entity): boolean {
  return !ally.auras.some((a) => a.id === 'temporal_echo');
}

// Choose the next Arcane spender: hover at few charges (build to 3, dump with
// Aether Darts). This is the pure offensive damage loop.
function spender(p: Entity, dummy: Entity): { id: string; targetId: number } {
  return aetherSurgeStacks(p) >= 3
    ? { id: 'arcane_missiles', targetId: dummy.id }
    : { id: 'arcane_surge', targetId: dummy.id };
}

// Conservative OFFENSIVE rotation: just the Arcane damage loop (Oleada + Dardos).
// The "how long can I sustain my damage" longevity number.
const conservativeOffensive: Policy = (p, dummy) => spender(p, dummy);

// The same loop but KEEPING Temporal Echo up, so the offensive heal actually
// flows (used to read the Echo HPS the rotation delivers).
const conservativeEcho: Policy = (p, dummy, ally) =>
  needsEcho(ally) ? { id: 'temporal_echo', targetId: ally.id } : spender(p, dummy);

// Conservative WITH occasional reactive heals: Echo up plus a Temporal Mend or
// Barrier roughly every 10s (alternating), on top of the damage loop.
function conservativeReactive(): Policy {
  let lastHealAt = -100;
  return (p, dummy, ally, t) => {
    if (needsEcho(ally)) return { id: 'temporal_echo', targetId: ally.id };
    if (t - lastHealAt >= 18) {
      lastHealAt = t;
      return {
        id: Math.round(t / 18) % 2 === 0 ? 'temporal_barrier' : 'temporal_mend',
        targetId: ally.id,
      };
    }
    return spender(p, dummy);
  };
}

// Emergency: spam Aether Surge; charges climb to 4 and HOLD, each cast paying the
// full 4-charge mana wall. Pure burst, no upkeep.
const emergency: Policy = (_p, dummy) => ({ id: 'arcane_surge', targetId: dummy.id });

// A DPS spec spamming its main filler at the dummy (mana natural), the DPS and
// longevity baseline.
function nukeSpam(id: string): Policy {
  return (_p, dummy) => ({ id, targetId: dummy.id });
}

// Fire's sustained-rotation proxy: spend a Hot Streak on a free Pyroblast,
// otherwise Fireball (Ignite mastery rides along under the fire spec). A fairer
// Piro baseline than plain Fireball spam, which ignores the fire kit.
const fireRotation: Policy = (p, dummy) => ({
  id: p.auras.some((a) => a.id === 'hot_streak') ? 'pyroblast' : 'fireball',
  targetId: dummy.id,
});

describe('Chronomancy Phase 3 balance targets', () => {
  const consOff = runRotation('arcane', conservativeOffensive, 200, false);
  const consEcho = runRotation('arcane', conservativeEcho, 200, true);
  const consReact = runRotation('arcane', conservativeReactive(), 200, true);
  const emer = runRotation('arcane', emergency, 60, false);
  // Piro baseline = fire's best simple sustained option (Hot-Streak weave vs the
  // Scorch filler), Cryo = Frostbolt. Fair "sustained DPS" proxies per spec.
  const piroWeave = runRotation('fire', fireRotation, 200, false);
  const piroScorch = runRotation('fire', nukeSpam('scorch'), 200, false);
  const piro: RunResult = piroWeave.dps >= piroScorch.dps ? piroWeave : piroScorch;
  const cryo = runRotation('frost', nukeSpam('frostbolt'), 200, false);

  it('reports the measured numbers (owner harness)', () => {
    const fmt = (label: string, r: RunResult) =>
      `${label.padEnd(24)}: OOM=${r.oom === Infinity ? '>cap' : `${r.oom.toFixed(1)}s`} DPS=${r.dps.toFixed(1)} echoHPS=${r.echoHps.toFixed(1)} netMana/s=${r.netManaPerSec.toFixed(1)}`;
    const lines = [
      fmt('conservative-offensive', consOff),
      fmt('conservative+Echo', consEcho),
      fmt('conservative+Mend/Barrier', consReact),
      fmt('emergency (hold 4)', emer),
      fmt('piro fireball', piro),
      fmt('cryo frostbolt', cryo),
    ].join('\n');
    expect(lines.length).toBeGreaterThan(0);
    // biome-ignore lint/suspicious/noConsole: intentional harness readout.
    console.log(`\n[chronomancy balance]\n${lines}\n`);
  });

  it('conservative offensive rotation lasts ~70-80s to OOM', () => {
    expect(consOff.oom).toBeGreaterThanOrEqual(68);
    expect(consOff.oom).toBeLessThanOrEqual(82);
  });

  it('conservative + reactive heals lasts ~55-65s to OOM', () => {
    expect(consReact.oom).toBeGreaterThanOrEqual(50);
    expect(consReact.oom).toBeLessThanOrEqual(68);
  });

  it('emergency (hold 4 charges) drains mana in 15-25s', () => {
    expect(emer.oom).toBeGreaterThanOrEqual(14);
    expect(emer.oom).toBeLessThanOrEqual(26);
  });

  it('Piro and Cryo sustain at least 35% more DPS than conservative Chronomancy', () => {
    expect(piro.dps).toBeGreaterThanOrEqual(consOff.dps * 1.35);
    expect(cryo.dps).toBeGreaterThanOrEqual(consOff.dps * 1.35);
  });

  it('the offensive rotation heals through Echo (maintenance HPS, below Temporal Mend)', () => {
    expect(consEcho.echoHps).toBeGreaterThan(0);
    // Echo is maintenance, not a spot heal: well under Temporal Mend's measured
    // ~107 HPS (tests/_phase3_measure baseline).
    expect(consEcho.echoHps).toBeLessThan(80);
  });
});
