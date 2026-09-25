// The cast gate's fail-closed net (src/render/ability_vfx/fx.ts
// setCastVfxSpawnGate): every gated pool asks its own family before it spawns
// and skips when the family is not ready, so a cast admitted on a requirement
// that missed a family can never link that family's program on a live frame;
// it shows as a requirement miss instead. Driven through the REAL engine.

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/assets/loader', () => ({
  loadTexture: vi.fn(async () => ({ image: null })),
  releaseTexture: vi.fn(),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: vi.fn(),
  registerDeferredPreload: vi.fn(),
}));
vi.mock('../src/render/ability_vfx/production_assets', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/render/ability_vfx/production_assets')>();
  return {
    ...actual,
    fragmentGeometry: vi.fn(() => new THREE.BoxGeometry(0.2, 0.2, 0.2)),
    // A resident sheet, so the baked layer can draw here at all.
    bakedTexture: vi.fn(() => new THREE.Texture()),
  };
});

import { AbilityVfxFx } from '../src/render/ability_vfx/fx';
import { ABILITY_VFX_FULL_SPECS } from '../src/render/ability_vfx_full_specs';
import {
  CAST_VFX_ENGINE,
  CAST_VFX_KIT,
  OPEN_CAST_VFX_SPAWN_GATE,
} from '../src/render/cast_vfx_family';
import { createVfxAnchor } from '../src/render/vfx_anchor';
import {
  drawingFamilies,
  gatedDrawables,
  installCastVfxCanvasStub,
  wouldDraw,
} from './helpers/cast_vfx_headless';

const GATED_POOLS = [
  'ribbons',
  'rings',
  'decals',
  'pillars',
  'shells',
  'groundAuras',
  'flipbooks',
  'crests',
  'guards',
  'powerForms',
  'spiritHammers',
  'furyStates',
  'baked',
  'fragments',
] as const;

function engine(open: number) {
  installCastVfxCanvasStub();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 3, 10);
  camera.updateMatrixWorld();
  const anchor = createVfxAnchor((id, pose) => {
    pose.x = id * 2;
    pose.y = 0;
    pose.z = 0;
    pose.height = 2;
    return true;
  });
  const fx = new AbilityVfxFx(scene, camera, anchor, () => 0);
  fx.setDelegates(vi.fn(), vi.fn(), vi.fn(), vi.fn());
  const gate = { open, asked: [] as number[] };
  fx.setCastVfxSpawnGate((bit) => {
    gate.asked.push(bit);
    return (gate.open & bit) !== 0;
  });
  const drawables = gatedDrawables(scene);
  // Held reads (windups, orbits, shells) draw on the frame they are fed and
  // sweep on the next, so what drew is read on every frame, never the last.
  let seen = 0;
  const step = (frames = 2) => {
    for (let i = 0; i < frames; i++) {
      fx.update(1 / 30);
      seen |= drawingFamilies(drawables);
    }
  };
  return { fx, scene, gate, drawables, step, drawing: () => seen };
}

/** Every engine spawn door the painter and the sequencer use, one by one. */
const ENGINE_DOORS: Record<string, (fx: AbilityVfxFx) => void> = {
  ring: (fx) => fx.ringAt(0, 0, 0, 4, 1, 0xffffff, 1, false),
  decal: (fx) => fx.decalXZ(0, 0, 2, 0xffffff, 'ember', 2),
  flipbook: (fx) => fx.flipbookAt(0, 1, 0, 1, 0xffffff, 'burst', 1),
  pillar: (fx) => fx.pillarAt(0, 0, 0, 1, 4, 0xffffff, 1),
  'shell flash': (fx) => fx.shellFlash(1, 0xffffff, 1),
  'shell hold': (fx) => fx.holdShell(2, 0xffffff),
  'ground aura': (fx) => fx.holdGroundAura(2, 0, 0xffffff, true),
  'jagged bolt': (fx) => fx.jaggedBolt(1, 2, 0xffffff),
  'comet trail': (fx) => fx.cometTrail(1, 2, 0xffffff, 0.2, true),
  'slash arc': (fx) => fx.slashArc(2, 0xffffff),
  'path ribbon': (fx) =>
    fx.pathRibbon(0xffffff, 0.1, 1, (pts) => {
      pts[0].set(0, 1, 0);
      pts[1].set(1, 1, 0);
      return 2;
    }),
  windup: (fx) => fx.windup(1, 0xffffff, 0.5, 'orb'),
  orbit: (fx) => fx.orbit(2, 'runes', 0xffffff),
  // The sequencer's overlay transients go through pushOverlay inside the
  // frame's overlay batch, so the sequence is that door's case too.
  sequence: (fx) =>
    fx.sequenceInstant('fireball', ABILITY_VFX_FULL_SPECS.fireball, 1, 2, 0xff8800, 0),
};

function spawnEngine(fx: AbilityVfxFx): void {
  for (const door of Object.values(ENGINE_DOORS)) door(fx);
}

/** Every kit spawn door the Warrior modules use, one by one, with the
 *  preparations the solid pieces wait on stubbed ready. A held piece (guard,
 *  power form) is re-fed every frame, the way the painter holds it. */
function prepareKit(fx: AbilityVfxFx): void {
  const pools = fx as unknown as Record<string, { preparation: unknown }>;
  const ready = { ready: () => true, units: () => [], dispose: () => {} };
  pools.guards.preparation = ready;
  pools.spiritHammers.preparation = ready;
  pools.powerForms.preparation = [ready, ready, ready, ready];
  pools.furyStates.preparation = [ready, ready, ready];
}

const KIT_DOORS: Record<string, (fx: AbilityVfxFx) => void> = {
  crest: (fx) => fx.crestAt(0, 0, 0, 1, 1, 0xffffff, 0xffffff, 'fire'),
  'baked layer': (fx) => fx.bakedAt('smoke', 0, 0, 0, 1, 0xffffff, 0xffffff, 1, 0, 0),
  fragments: (fx) => fx.fragmentsAt('stone_chip', 0, 1, 0, 0xffffff, 4, 1, 0, 1),
  'guard plate': (fx) =>
    fx.holdWarriorGuard(1, 0, { id: 'guard', remaining: 5, duration: 10 }, true),
  'power form': (fx) => fx.holdWarriorPower(1, 1, { remaining: 5, duration: 10 }, 1, true),
};
const HELD_KIT_DOORS = new Set(['guard plate', 'power form']);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the gated pools', () => {
  it('each ask the engine own gate, never the open default', () => {
    const { fx } = engine(CAST_VFX_ENGINE | CAST_VFX_KIT);
    const pools = fx as unknown as Record<string, { spawnGate: unknown }>;
    const shared = pools.ribbons.spawnGate;
    expect(shared).not.toBe(OPEN_CAST_VFX_SPAWN_GATE);
    for (const pool of GATED_POOLS) expect(pools[pool].spawnGate, pool).toBe(shared);
    const fallback = (pools.furyStates as unknown as { fallback: { spawnGate: unknown } }).fallback;
    expect(fallback.spawnGate).toBe(shared);
  });
});

describe('with the engine family not ready', () => {
  for (const [name, door] of Object.entries(ENGINE_DOORS)) {
    it(`refuses the ${name} door, and asks the engine for it`, () => {
      const shut = engine(CAST_VFX_KIT);
      door(shut.fx);
      shut.step(4);
      expect(shut.drawing()).toBe(0);
      expect(new Set(shut.gate.asked)).toEqual(new Set([CAST_VFX_ENGINE]));
      // The same door draws once the engine is ready: the refusal is the gate's.
      const open = engine(CAST_VFX_ENGINE | CAST_VFX_KIT);
      door(open.fx);
      open.step(4);
      expect(open.drawing()).toBe(CAST_VFX_ENGINE);
    });
  }

  it('draws them all once it opens (the arm the refusals above are measured against)', () => {
    const { fx, drawables, step, drawing } = engine(CAST_VFX_ENGINE | CAST_VFX_KIT);
    spawnEngine(fx);
    step(1);
    expect(drawing()).toBe(CAST_VFX_ENGINE);
    expect(drawables.filter(wouldDraw).length).toBeGreaterThanOrEqual(8);
  });

  it('still draws the hard-CC band, and asks nothing for it', () => {
    const { fx, gate, drawables, step } = engine(0);
    const overlay = fx.ccBandDrawable();
    fx.holdCcBand(2, 'stun', 3);
    step(1);
    fx.holdCcBand(2, 'stun', 3);
    step(1);
    expect(drawables).toContain(overlay);
    expect(wouldDraw(overlay)).toBe(true);
    expect(gate.asked).toEqual([]);
  });
});

describe('with the kit family not ready', () => {
  for (const [name, door] of Object.entries(KIT_DOORS)) {
    it(`refuses the ${name} door, and asks the kit for it`, () => {
      const drive = (open: number) => {
        const rig = engine(open);
        prepareKit(rig.fx);
        door(rig.fx);
        for (let frame = 0; frame < 3; frame++) {
          if (HELD_KIT_DOORS.has(name)) door(rig.fx);
          rig.step(1);
        }
        return rig;
      };
      const shut = drive(CAST_VFX_ENGINE);
      expect(shut.drawing() & CAST_VFX_KIT).toBe(0);
      expect(shut.gate.asked).toContain(CAST_VFX_KIT);
      // The same door draws a kit piece once the kit is ready.
      expect(drive(CAST_VFX_ENGINE | CAST_VFX_KIT).drawing() & CAST_VFX_KIT).toBe(CAST_VFX_KIT);
    });
  }
});

describe('the boot warm-up', () => {
  it('spawns every pool behind the cover with no family ready, and asks nothing', () => {
    const { fx, gate, drawables } = engine(0);
    fx.prewarmSpawn(0, 0, 0, 1);
    expect(gate.asked).toEqual([]);
    expect(drawables.some((object) => wouldDraw(object))).toBe(true);
  });
});
