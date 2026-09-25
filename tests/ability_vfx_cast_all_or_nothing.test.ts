// The per-cast gate, end to end: the REAL painter over the REAL engine behind
// the real readiness core. A cast draws its whole composition or nothing
// (windup to lingers), each cast waits only on the families it draws from, a
// refusal taken at the cast bar holds through the cast, and a refused hold
// shows the frame its families are ready.

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async () => ({ image: null })),
  releaseTexture: vi.fn(),
  // Spirit models never arrive here: a cast whose spirit is still loading
  // skips it silently, and spirits keep their own gate.
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

import type { AbilityVfxEntityState } from '../src/render/ability_vfx/painter';
import { CAST_VFX_ENGINE, CAST_VFX_KIT } from '../src/render/cast_vfx_family';
import { castGateRig } from './helpers/cast_vfx_headless';

const MAGE = 5;
const WARRIOR = 1;
const VICTIM = 9;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A cast bar of `seconds`, then its release, its impact and its lingers. */
function fireball(rig: ReturnType<typeof castGateRig>, seconds = 1) {
  const entity = (remaining: number): AbilityVfxEntityState => ({
    id: MAGE,
    kind: 'player',
    templateId: 'mage',
    castingAbility: remaining > 0 ? 'fireball' : null,
    castRemaining: remaining,
    castTotal: seconds,
    auras: [],
  });
  for (let t = seconds; t > 0; t -= 0.05) {
    rig.painter.syncEntity(entity(t));
    rig.step();
  }
  rig.painter.syncEntity(entity(0));
  rig.painter.handleSpellfx({
    sourceId: MAGE,
    targetId: VICTIM,
    school: 'fire',
    fx: 'projectile',
    ability: 'fireball',
  });
  rig.step(20);
  rig.painter.onDamage({
    sourceId: MAGE,
    targetId: VICTIM,
    school: 'fire',
    ability: 'Fireball',
    abilityId: 'fireball',
    kind: 'hit',
    crit: true,
    amount: 120,
  });
  rig.step(160);
}

/** An authored Warrior strike: its cue, its contact, its lingers. */
function shieldSlam(rig: ReturnType<typeof castGateRig>) {
  rig.warriors.add(WARRIOR);
  rig.painter.handleSpellfx({
    sourceId: WARRIOR,
    targetId: VICTIM,
    school: 'physical',
    fx: 'selfCast',
    ability: 'shield_slam',
  });
  rig.step(4);
  rig.painter.onDamage({
    sourceId: WARRIOR,
    targetId: VICTIM,
    school: 'physical',
    ability: 'Shield Slam',
    abilityId: 'shield_slam',
    kind: 'hit',
    crit: false,
    amount: 80,
  });
  rig.step(160);
}

describe('with the kit not ready', () => {
  it('draws nothing of a Warrior cast, from any pool, over its whole life', () => {
    const rig = castGateRig();
    rig.prove(CAST_VFX_ENGINE);
    shieldSlam(rig);
    expect(rig.drawn()).toBe(0);
    expect(rig.vfxCalls).toEqual([]);
    expect(rig.readiness.snapshot()).toMatchObject({ requirementMiss: 0 });
    expect(rig.readiness.snapshot().families[1].refused).toBeGreaterThan(0);
  });

  it('draws a Mage cast whole, and never asks it for the kit', () => {
    const rig = castGateRig();
    rig.prove(CAST_VFX_ENGINE);
    fireball(rig);
    expect(rig.drawn()).toBe(CAST_VFX_ENGINE);
    const snapshot = rig.readiness.snapshot();
    expect(snapshot.refused).toBe(0);
    expect(snapshot.requirementMiss).toBe(0);
  });

  it('draws the Warrior cast whole once the kit is ready', () => {
    const rig = castGateRig();
    rig.prove(CAST_VFX_ENGINE | CAST_VFX_KIT);
    shieldSlam(rig);
    expect(rig.drawn() & CAST_VFX_ENGINE).toBe(CAST_VFX_ENGINE);
    expect(rig.readiness.snapshot().requirementMiss).toBe(0);
  });
});

describe('with the engine not ready', () => {
  it('draws nothing of any cast', () => {
    const rig = castGateRig();
    rig.prove(CAST_VFX_KIT);
    fireball(rig);
    shieldSlam(rig);
    expect(rig.drawn()).toBe(0);
    expect(rig.vfxCalls).toEqual([]);
    expect(rig.readiness.snapshot().requirementMiss).toBe(0);
  });
});

describe('a refusal latched at the cast bar', () => {
  it('holds through the release, impact and lingers after the family latches mid-cast', () => {
    const rig = castGateRig();
    const entity = (remaining: number): AbilityVfxEntityState => ({
      id: MAGE,
      castingAbility: remaining > 0 ? 'fireball' : null,
      castRemaining: remaining,
      castTotal: 2,
      auras: [],
    });
    for (let t = 2; t > 1; t -= 0.05) {
      rig.painter.syncEntity(entity(t));
      rig.step();
    }
    rig.prove(CAST_VFX_ENGINE);
    for (let t = 1; t > 0; t -= 0.05) {
      rig.painter.syncEntity(entity(t));
      rig.step();
    }
    rig.painter.syncEntity(entity(0));
    rig.painter.handleSpellfx({
      sourceId: MAGE,
      targetId: VICTIM,
      school: 'fire',
      fx: 'projectile',
      ability: 'fireball',
    });
    rig.step(20);
    rig.painter.onDamage({
      sourceId: MAGE,
      targetId: VICTIM,
      school: 'fire',
      ability: 'Fireball',
      abilityId: 'fireball',
      kind: 'hit',
      crit: true,
      amount: 120,
    });
    rig.step(160);
    expect(rig.drawn()).toBe(0);
    expect(rig.vfxCalls).toEqual([]);
    // The refused cast counted once, at its cast bar.
    expect(rig.readiness.snapshot().refused).toBe(1);

    // The next cast is a new cast, and draws.
    fireball(rig);
    expect(rig.drawn()).toBe(CAST_VFX_ENGINE);
  });
});

describe('a refused hold', () => {
  it('shows a Mage barrier the frame the engine is ready', () => {
    const rig = castGateRig();
    const wearer: AbilityVfxEntityState = {
      id: MAGE,
      castingAbility: null,
      castRemaining: 0,
      castTotal: 0,
      auras: [{ id: 'ice_barrier', kind: 'absorb', remaining: 30, duration: 60, value: 300 }],
    };
    for (let i = 0; i < 5; i++) {
      rig.painter.syncEntity(wearer);
      rig.step();
    }
    expect(rig.drawn()).toBe(0);
    rig.prove(CAST_VFX_ENGINE);
    rig.painter.syncEntity(wearer);
    expect(rig.step()).toBe(CAST_VFX_ENGINE);
  });

  it('shows a Warrior guard the frame the kit is ready, and nothing of it before', () => {
    const rig = castGateRig();
    rig.warriors.add(WARRIOR);
    rig.prove(CAST_VFX_ENGINE);
    const wearer: AbilityVfxEntityState = {
      id: WARRIOR,
      kind: 'player',
      templateId: 'warrior',
      castingAbility: null,
      castRemaining: 0,
      castTotal: 0,
      auras: [{ id: 'iron_resolve', kind: 'absorb', remaining: 8, duration: 10, value: 200 }],
    };
    for (let i = 0; i < 5; i++) {
      rig.painter.syncEntity(wearer);
      rig.step();
    }
    expect(rig.drawn()).toBe(0);
    rig.prove(CAST_VFX_KIT);
    rig.painter.syncEntity(wearer);
    expect(rig.step()).not.toBe(0);
    expect(rig.readiness.snapshot().requirementMiss).toBe(0);
  });
});

describe('a declined kit', () => {
  it('never holds a Warrior cast, whose kit pools stay dark, and counts no miss', () => {
    const rig = castGateRig({ kitDeclined: true });
    rig.prove(CAST_VFX_ENGINE);
    shieldSlam(rig);
    expect(rig.drawn()).toBe(CAST_VFX_ENGINE);
    const snapshot = rig.readiness.snapshot();
    expect(snapshot).toMatchObject({ ready: true, forced: false, refused: 0, requirementMiss: 0 });
  });
});

describe('the kit deadline', () => {
  it('starts no kit clock for a Mage wearing auras, however long', () => {
    const rig = castGateRig({ deadlineMs: 5_000 });
    rig.prove(CAST_VFX_ENGINE);
    const mage: AbilityVfxEntityState = {
      id: MAGE,
      castingAbility: null,
      castRemaining: 0,
      castTotal: 0,
      auras: [
        { id: 'ice_barrier', kind: 'absorb', remaining: 30, duration: 60, value: 300 },
        { id: 'frost_armor', kind: 'buff', remaining: 30, duration: 60 },
        { id: 'war_stomp_stun', kind: 'stun', remaining: 2 },
      ],
    };
    for (let i = 0; i < 400; i++) {
      rig.painter.syncEntity(mage);
      rig.step();
    }
    rig.reset();
    // Twenty seconds past the bound: had the auras started the kit's clock,
    // this first Warrior cast would be admitted on a forced kit and draw.
    rig.warriors.add(WARRIOR);
    rig.painter.handleSpellfx({
      sourceId: WARRIOR,
      targetId: VICTIM,
      school: 'physical',
      fx: 'selfCast',
      ability: 'shield_slam',
    });
    expect(rig.readiness.snapshot().families[1]).toMatchObject({ ready: false, forced: false });
    rig.step(20);
    expect(rig.drawn()).toBe(0);
  });

  it('opens a stuck kit at its bound, counted from the first Warrior consult, and says so', () => {
    const rig = castGateRig({ deadlineMs: 5_000 });
    rig.prove(CAST_VFX_ENGINE);
    // Minutes of Mage casts start no kit clock.
    for (let i = 0; i < 3; i++) fireball(rig);
    rig.resetDrawn();
    shieldSlam(rig);
    expect(rig.drawn()).toBe(0);
    rig.step(100);
    rig.resetDrawn();
    shieldSlam(rig);
    expect(rig.drawn() & CAST_VFX_ENGINE).toBe(CAST_VFX_ENGINE);
    expect(rig.readiness.snapshot().families[1]).toMatchObject({ ready: true, forced: true });
  });
});
