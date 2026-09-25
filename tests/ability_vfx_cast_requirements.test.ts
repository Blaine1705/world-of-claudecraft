// The cast gate's requirement masks (src/render/ability_vfx/cast_requirements.ts):
// the families a cast of each ability waits on. Every painter cast waits on the
// engine; a Warrior appearance also waits on the kit; no other class ever does.
// The walk below keeps the masks honest against the REAL painter and engine:
// every spec'd id, through every entry point the painter has, drawn with only
// its own families ready, must spawn and draw from nothing else.

import * as THREE from 'three';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async () => ({ image: null })),
  releaseTexture: vi.fn(),
  loadGltf: vi.fn(() => new Promise(() => {})),
  releaseGltf: vi.fn(),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn(),
}));
vi.mock('../src/render/ability_vfx/production_assets', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/render/ability_vfx/production_assets')>();
  return { ...actual, fragmentGeometry: vi.fn(() => new THREE.BoxGeometry(0.2, 0.2, 0.2)) };
});

import {
  castVfxRequirement,
  drawsWarriorKit,
  WARRIOR_KIT_REQUIREMENT,
} from '../src/render/ability_vfx/cast_requirements';
import { CAST_VFX_ENGINE, CAST_VFX_KIT } from '../src/render/cast_vfx_family';
import { WARRIOR_VFX_FULL_SPECS } from '../src/render/warrior_vfx_specs';
import { ABILITIES } from '../src/sim/data';
import { abilityVfxSpecIds } from './helpers/ability_vfx_spec_ids';
import { castGateRig } from './helpers/cast_vfx_headless';

const IDS = abilityVfxSpecIds();

describe('the requirement masks', () => {
  it('walks the whole spec union', () => {
    expect(IDS.length).toBeGreaterThan(300);
    for (const id of ['fireball', 'heroic_strike', 'chaos_bolt', 'emberkin_felbolt'])
      expect(IDS).toContain(id);
  });

  it('asks every id for the engine, and the kit exactly for the Warrior appearances', () => {
    const wrong: string[] = [];
    for (const id of IDS) {
      const mask = castVfxRequirement(id);
      const warrior =
        ABILITIES[id]?.class === 'warrior' || Object.hasOwn(WARRIOR_VFX_FULL_SPECS, id);
      if ((mask & CAST_VFX_ENGINE) === 0) wrong.push(`${id}: no engine`);
      if (((mask & CAST_VFX_KIT) !== 0) !== warrior) wrong.push(`${id}: kit ${!warrior}`);
      if ((mask & ~(CAST_VFX_ENGINE | CAST_VFX_KIT)) !== 0) wrong.push(`${id}: unknown family`);
    }
    expect(wrong).toEqual([]);
  });

  it('never makes another class wait on the kit', () => {
    const kit = IDS.filter((id) => drawsWarriorKit(id));
    expect(kit.length).toBeGreaterThan(20);
    expect(kit.filter((id) => ABILITIES[id] && ABILITIES[id].class !== 'warrior')).toEqual([]);
    expect(castVfxRequirement('fireball')).toBe(CAST_VFX_ENGINE);
    expect(castVfxRequirement('heroic_strike')).toBe(WARRIOR_KIT_REQUIREMENT);
    expect(WARRIOR_KIT_REQUIREMENT).toBe(CAST_VFX_ENGINE | CAST_VFX_KIT);
  });

  it('answers an id with no spec with the engine alone', () => {
    expect(castVfxRequirement('no_such_ability_for_the_gate')).toBe(CAST_VFX_ENGINE);
  });
});

const CAST_KINDS = [
  'projectile',
  'heavyBolt',
  'lightning',
  'windup',
  'shout',
  'nova',
  'tick',
  'beam',
  'selfCast',
  'flourish',
  'weaponAura',
] as const;
const POINT_KINDS = ['nova', 'burst', 'tick'] as const;
const AURA_KINDS = [undefined, 'buff', 'dot', 'absorb', 'slow', 'root', 'stun'] as const;
const WARRIOR_CASTER = 1;
const OTHER_CASTER = 5;
const VICTIM = 9;
const IDLE_FRAMES = 20;
const MAX_FRAMES = 240;

type Rig = ReturnType<typeof castGateRig>;

/** Forces the degrade tier the painter plans at (0 or 1), for every cast. */
function forceTier(rig: Rig, tier: 0 | 1): void {
  (rig.painter as unknown as { budget: unknown }).budget = {
    admit: () => tier,
    peek: () => tier,
    admitAccent: () => true,
  };
}

/** Steps until nothing gated has drawn for IDLE_FRAMES frames. */
function drain(rig: Rig, perFrame?: (frame: number) => void, heldFrames = 0): void {
  let idle = 0;
  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (frame < heldFrames) perFrame?.(frame);
    const seen = rig.step();
    idle = seen === 0 && frame >= heldFrames ? idle + 1 : 0;
    if (idle >= IDLE_FRAMES) return;
  }
}

interface Walked {
  runs: number;
  claimed: number;
  /** Runs whose pools drew engine pieces, and runs that reached a kit pool. */
  drewEngine: number;
  reachedKit: number;
  failures: string[];
}

function walkId(rig: Rig, id: string, tier: 0 | 1, walked: Walked): void {
  const mask = castVfxRequirement(id);
  const caster = drawsWarriorKit(id) ? WARRIOR_CASTER : OTHER_CASTER;
  const run = (label: string, act: () => unknown, perFrame?: (f: number) => void, held = 0) => {
    rig.reset();
    forceTier(rig, tier);
    const before = rig.readiness.snapshot().requirementMiss;
    if (act()) walked.claimed++;
    drain(rig, perFrame, held);
    walked.runs++;
    if (rig.drawn() & CAST_VFX_ENGINE) walked.drewEngine++;
    if (rig.asked() & CAST_VFX_KIT) walked.reachedKit++;
    const miss = rig.readiness.snapshot().requirementMiss - before;
    const outside = (rig.asked() | rig.drawn()) & ~mask;
    if (outside || miss)
      walked.failures.push(`${id} ${label} tier ${tier}: outside ${outside}, miss ${miss}`);
  };
  for (const fx of CAST_KINDS)
    for (const target of [caster, VICTIM])
      run(`spellfx ${fx} -> ${target === caster ? 'self' : 'other'}`, () =>
        rig.painter.handleSpellfx({
          sourceId: caster,
          targetId: target,
          school: 'fire',
          fx,
          ability: id,
        }),
      );
  run('channel ticks', () => {
    let claimed = false;
    for (let tick = 0; tick < 3; tick++) {
      claimed ||= rig.painter.handleSpellfx({
        sourceId: caster,
        targetId: VICTIM,
        school: 'shadow',
        fx: 'beam',
        ability: id,
      });
      rig.step(20);
    }
    return claimed;
  });
  for (const fx of POINT_KINDS)
    run(`spellfxAt ${fx}`, () =>
      rig.painter.handleSpellfxAt({
        x: 2,
        z: -3,
        school: 'fire',
        fx,
        ability: id,
        radius: 6,
        sourceId: caster,
      }),
    );
  for (const crit of [false, true])
    for (const absorbed of [false, true])
      run(`damage crit ${crit} absorbed ${absorbed}`, () =>
        rig.painter.onDamage({
          sourceId: caster,
          targetId: VICTIM,
          school: 'physical',
          // The wire carries the display name; the id rides beside it.
          ability: ABILITIES[id]?.name ?? id,
          abilityId: id,
          kind: 'hit',
          crit,
          amount: absorbed ? 0 : 90,
          absorbed: absorbed ? 40 : undefined,
        }),
      );
  run(
    'cast bar',
    () => false,
    (frame) =>
      rig.painter.syncEntity({
        id: caster,
        castingAbility: id,
        castRemaining: 1 - frame / 20,
        castTotal: 1,
        auras: [],
      }),
    20,
  );
  for (const kind of AURA_KINDS)
    run(
      `aura ${kind ?? 'none'}`,
      () => false,
      () =>
        rig.painter.syncEntity({
          id: VICTIM,
          castingAbility: null,
          castRemaining: 0,
          castTotal: 0,
          auras: [
            { id, kind, remaining: 20, duration: 30, value: 50, stacks: 2, sourceId: caster },
          ],
        }),
      12,
    );
  run(
    'queued swing',
    () => false,
    () =>
      rig.painter.syncEntity({
        id: caster,
        castingAbility: null,
        castRemaining: 0,
        castTotal: 0,
        auras: [],
        queuedOnSwing: id,
      }),
    12,
  );
}

describe('the requirement walk over the real painter', () => {
  const walked: Walked = { runs: 0, claimed: 0, drewEngine: 0, reachedKit: 0, failures: [] };
  // One rig per requirement: only a mask's own families are ever proved, so
  // a spawn outside it is refused and counted, exactly as in a live frame.
  const rigs = new Map<number, Rig>();
  const rigFor = (mask: number): Rig => {
    let rig = rigs.get(mask);
    if (!rig) {
      // No deadline: a forced family would let a spawn outside the mask
      // through uncounted.
      rig = castGateRig({ deadlineMs: Number.POSITIVE_INFINITY });
      rig.warriors.add(WARRIOR_CASTER);
      rig.prove(mask);
      rigs.set(mask, rig);
    }
    return rig;
  };
  afterAll(() => vi.unstubAllGlobals());

  for (const tier of [0, 1] as const) {
    it(`spawns and draws only from each id's own families, tier ${tier}`, () => {
      for (const id of IDS) walkId(rigFor(castVfxRequirement(id)), id, tier, walked);
      expect(walked.failures).toEqual([]);
    });
  }

  it('walks every id through a claimed entry point, and both requirement classes', () => {
    expect(walked.runs).toBeGreaterThan(IDS.length * 2 * 30);
    expect(walked.claimed).toBeGreaterThan(IDS.length * 20);
    expect(walked.drewEngine).toBeGreaterThan(IDS.length * 20);
    expect(walked.reachedKit).toBeGreaterThan(500);
    expect([...rigs.keys()].sort()).toEqual([CAST_VFX_ENGINE, CAST_VFX_ENGINE | CAST_VFX_KIT]);
    // Non-vacuity: the engine-only rig really kept the kit shut, the walk
    // drew from every family it proved, and a Warrior id reached the kit.
    for (const [mask, rig] of rigs) {
      expect(rig.readiness.snapshot().families.map((family) => family.ready)).toEqual([
        true,
        (mask & CAST_VFX_KIT) !== 0,
      ]);
    }
  });
});
