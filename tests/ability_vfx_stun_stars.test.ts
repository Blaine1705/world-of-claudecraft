// The persistent stunned-star tell: a worn `kind: 'stun'` aura circles a star
// band over the victim's head for the aura's whole life. Matched by aura KIND,
// never the spec table, so every stun source reads (player abilities, mob
// stomps) online and offline; the fx engine sweeps the band the frame the
// aura fades. Covers the pure core read, the painter feed, and the fx-side
// draw/sweep/sleep lifecycle.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbilityVfxFx } from '../src/render/ability_vfx/fx';
import type { AbilityVfxDeps, AbilityVfxEntityState } from '../src/render/ability_vfx/painter';
import { AbilityVfx } from '../src/render/ability_vfx/painter';
import { ABILITY_VFX_SPECS } from '../src/render/ability_vfx_specs';
import { STUN_STAR_COUNT, wornStunRemaining } from '../src/render/ability_vfx_core';

function installCanvasStub(): void {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const context = {
    arc: noop,
    beginPath: noop,
    clip: noop,
    closePath: noop,
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    ellipse: noop,
    fill: noop,
    fillRect: noop,
    lineTo: noop,
    moveTo: noop,
    putImageData: noop,
    rect: noop,
    restore: noop,
    rotate: noop,
    save: noop,
    scale: noop,
    stroke: noop,
    translate: noop,
  };
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

interface FxProbe {
  stunStars: Map<number, { remaining: number; stamp: number }>;
  overlay: { count: number; alpha: Float32Array };
}

function makeFx(): { fx: AbilityVfxFx; probe: FxProbe } {
  installCanvasStub();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.updateMatrixWorld();
  const fx = new AbilityVfxFx(
    new THREE.Scene(),
    camera,
    () => new THREE.Vector3(0, 1.8, -5),
    () => 0,
  );
  return { fx, probe: fx as unknown as FxProbe };
}

function makePainter() {
  const fx = {
    setDelegates: vi.fn(),
    warmSpiritsForClass: vi.fn(),
    windup: vi.fn().mockReturnValue(false),
    holdShell: vi.fn(),
    holdGroundAura: vi.fn().mockReturnValue(true),
    holdStunStars: vi.fn(),
    orbit: vi.fn().mockReturnValue(true),
    bodyGlow: vi.fn(),
    sleepEntity: vi.fn(),
    update: vi.fn(),
  };
  const vfx = {
    projectile: vi.fn(),
    lightningProjectile: vi.fn(),
    burst: vi.fn(),
    nova: vi.fn(),
    tick: vi.fn(),
    shoutwave: vi.fn(),
    buffSwirl: vi.fn(),
    beam: vi.fn(),
  };
  const deps = {
    vfx,
    fx,
    anchor: () => ({ x: 0, y: 0, z: 0 }),
    spawnAoeRing: vi.fn(),
    triggerAttack: vi.fn(),
  } as unknown as AbilityVfxDeps;
  const painter = new AbilityVfx(deps, () => 12.5);
  return { painter, fx };
}

function ent(
  auras: { id: string; kind?: string; remaining?: number }[],
  id = 7,
): AbilityVfxEntityState {
  return { id, castingAbility: null, castRemaining: 0, castTotal: 0, auras };
}

describe('wornStunRemaining (pure core)', () => {
  it('returns 0 when no aura is a stun, whatever the ids look like', () => {
    expect(wornStunRemaining([])).toBe(0);
    expect(
      wornStunRemaining([
        { kind: 'slow', remaining: 4 },
        { kind: 'root', remaining: 2 },
        { id: 'storm_bolt_stun' } as { kind?: string; remaining?: number },
      ]),
    ).toBe(0);
  });

  it('returns the longest remaining across worn stun auras', () => {
    expect(
      wornStunRemaining([
        { kind: 'stun', remaining: 1.5 },
        { kind: 'buff', remaining: 300 },
        { kind: 'stun', remaining: 2.75 },
      ]),
    ).toBe(2.75);
  });

  it('treats a stun with no remaining as fully live (opaque alpha)', () => {
    expect(wornStunRemaining([{ kind: 'stun' }])).toBe(1);
  });
});

describe('painter feeds the stun tell from the aura KIND, not the spec table', () => {
  it('holds stars for a stun aura whose id has no vfx spec (a mob stomp)', () => {
    const { painter, fx } = makePainter();
    const auraId = 'war_stomp_stun';
    expect(ABILITY_VFX_SPECS[auraId]).toBeUndefined();

    painter.syncEntity(ent([{ id: auraId, kind: 'stun', remaining: 2.5 }]));

    expect(fx.holdStunStars).toHaveBeenCalledWith(7, 2.5);
  });

  it('holds stars for a spec-suffixed player stun too, every frame it is worn', () => {
    const { painter, fx } = makePainter();
    const e = ent([{ id: 'storm_bolt_stun', kind: 'stun', remaining: 3 }]);

    painter.syncEntity(e);
    painter.syncEntity(e);

    expect(fx.holdStunStars).toHaveBeenCalledTimes(2);
    expect(fx.holdStunStars).toHaveBeenLastCalledWith(7, 3);
  });

  it('holds nothing for non-stun debuffs or buffs', () => {
    const { painter, fx } = makePainter();

    painter.syncEntity(
      ent([
        { id: 'hamstring_slow', kind: 'slow', remaining: 8 },
        { id: 'arcane_intellect', kind: 'buff', remaining: 1800 },
      ]),
    );

    expect(fx.holdStunStars).not.toHaveBeenCalled();
  });

  it('sleeps instead of holding when presentation is gated off', () => {
    const { painter, fx } = makePainter();

    painter.syncEntity(ent([{ id: 'storm_bolt_stun', kind: 'stun', remaining: 3 }]), false);

    expect(fx.sleepEntity).toHaveBeenCalledWith(7);
    expect(fx.holdStunStars).not.toHaveBeenCalled();
  });
});

describe('fx engine draws and sweeps the held star band', () => {
  it('draws STUN_STAR_COUNT star sprites while fed, at the remaining-driven alpha', () => {
    const { fx, probe } = makeFx();

    fx.holdStunStars(7, 0.5);
    fx.update(0.05);

    expect(probe.overlay.count).toBe(STUN_STAR_COUNT);
    for (let k = 0; k < STUN_STAR_COUNT; k++) expect(probe.overlay.alpha[k]).toBeCloseTo(0.5);
  });

  it('clamps alpha to 1 while more than a second remains', () => {
    const { fx, probe } = makeFx();

    fx.holdStunStars(7, 3);
    fx.update(0.05);

    expect(probe.overlay.alpha[0]).toBe(1);
  });

  it('sweeps the band the first frame the feed stops', () => {
    const { fx, probe } = makeFx();

    fx.holdStunStars(7, 3);
    fx.update(0.05);
    expect(probe.stunStars.has(7)).toBe(true);

    fx.update(0.05);

    expect(probe.stunStars.has(7)).toBe(false);
    expect(probe.overlay.count).toBe(0);
  });

  it('sleepEntity releases only the sleeping entity; clear releases all', () => {
    const { fx, probe } = makeFx();
    fx.holdStunStars(7, 3);
    fx.holdStunStars(8, 3);

    fx.sleepEntity(7);
    expect(probe.stunStars.has(7)).toBe(false);
    expect(probe.stunStars.has(8)).toBe(true);

    fx.clear();
    expect(probe.stunStars.size).toBe(0);
  });
});
