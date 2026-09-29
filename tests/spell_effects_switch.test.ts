// The Spell Effects option (src/render/spell_effects_switch.ts): off drops the
// cosmetic spell and ability visuals and keeps every read a player acts on.
// Driven through the real modules: the production ability presentation
// factory with its real painter and engine, the pooled Vfx cloud, the light
// pulse pool, and the class spell visuals that sit outside both.

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import type { AbilityVfxFx } from '../src/render/ability_vfx/fx';
import type { AbilityVfxTextures } from '../src/render/ability_vfx/fx_textures';
import { AbilityVfx, type AbilityVfxEntityState } from '../src/render/ability_vfx/painter';
import { CAST_VFX_ENGINE, CAST_VFX_KIT } from '../src/render/cast_vfx_family';
import { GlacialFrontVisual } from '../src/render/glacial_front_visual';
import { LightPulses } from '../src/render/light_pulses';
import { meteorLandingBurst } from '../src/render/meteor_landing_burst';
import { NeedleOfFateVfx } from '../src/render/needle_of_fate_vfx';
import type { EntityView } from '../src/render/renderer';
import { createRendererAbilityPresentation } from '../src/render/renderer_ability_presentation';
import { SentenceVfx } from '../src/render/sentence_vfx';
import {
  gateCastsBySpellEffects,
  setSpellEffectsEnabled,
  spellEffectsEnabled,
} from '../src/render/spell_effects_switch';
import { Vfx } from '../src/render/vfx';
import { createVfxAnchor } from '../src/render/vfx_anchor';
import { RecklessSkullPainter } from '../src/render/warrior_cast_fx_painter';
import type { IWorld } from '../src/world_api';
import { installCastVfxCanvasStub } from './helpers/cast_vfx_headless';
import { drawsUnder } from './helpers/three_program_keys';

afterEach(() => {
  setSpellEffectsEnabled(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const frostbolt = {
  sourceId: 1,
  targetId: 2,
  school: 'frost',
  fx: 'heavyBolt',
  ability: 'frostbolt',
};

describe('the switch', () => {
  it('defaults on and reflects every write', () => {
    expect(spellEffectsEnabled()).toBe(true);
    setSpellEffectsEnabled(false);
    expect(spellEffectsEnabled()).toBe(false);
    setSpellEffectsEnabled(true);
    expect(spellEffectsEnabled()).toBe(true);
  });

  it('passes the readiness answers through while on, per mask', () => {
    const inner = { admit: vi.fn((m: number) => m === 1), ready: vi.fn((m: number) => m === 2) };
    const gate = gateCastsBySpellEffects(inner, () => true);
    expect([gate.admit(1), gate.admit(2), gate.ready(1), gate.ready(2)]).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(inner.admit).toHaveBeenCalledTimes(2);
    expect(inner.ready).toHaveBeenCalledTimes(2);
  });

  it('refuses everything while off WITHOUT asking the readiness gate', () => {
    // An asked admit() counts a refusal in the readiness telemetry; a player
    // preference must not read as unlinked programs in a perf capture.
    const inner = { admit: vi.fn(() => true), ready: vi.fn(() => true) };
    let on = false;
    const gate = gateCastsBySpellEffects(inner, () => on);
    expect(gate.admit(CAST_VFX_ENGINE)).toBe(false);
    expect(gate.ready(CAST_VFX_ENGINE)).toBe(false);
    expect(inner.admit).not.toHaveBeenCalled();
    expect(inner.ready).not.toHaveBeenCalled();
    // Read per call: a flip is live on the next question, no rebuild.
    on = true;
    expect(gate.admit(CAST_VFX_ENGINE)).toBe(true);
    expect(gate.ready(CAST_VFX_ENGINE)).toBe(true);
  });

  it('reads the module switch by default', () => {
    const gate = gateCastsBySpellEffects({ admit: () => true, ready: () => true });
    expect(gate.admit(CAST_VFX_ENGINE)).toBe(true);
    setSpellEffectsEnabled(false);
    expect(gate.admit(CAST_VFX_ENGINE)).toBe(false);
    expect(gate.ready(CAST_VFX_ENGINE)).toBe(false);
  });
});

/** The production factory, headless, with every family linked: whatever the
 *  painter refuses below it refuses because of the switch alone. */
function presentation() {
  installCastVfxCanvasStub();
  const gate = { admitted: [] as number[], ready: [] as number[], spawns: [] as number[] };
  const castGate = {
    admit: (mask: number) => {
      gate.admitted.push(mask);
      return true;
    },
    ready: (mask: number) => {
      gate.ready.push(mask);
      return true;
    },
    spawnAllowed: (bit: number) => {
      gate.spawns.push(bit);
      return true;
    },
  };
  const world = {
    entities: new Map([
      [1, { id: 1, kind: 'player', templateId: 'mage', facing: 0 }],
      [2, { id: 2, kind: 'mob', templateId: 'wolf', facing: 0 }],
    ]),
    player: { id: 1 },
    playerId: 1,
    talentSpec: null,
  } as unknown as IWorld;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 3, 12);
  camera.updateMatrixWorld();
  const anchor = createVfxAnchor((id, pose) => {
    pose.x = id * 2;
    pose.y = 0;
    pose.z = 0;
    pose.height = 2;
    return true;
  });
  const vfx = new Proxy({}, { get: () => () => {} }) as unknown as Vfx;
  const spawnAoeRing = vi.fn();
  const triggerAttack = vi.fn();
  const { fx, painter } = createRendererAbilityPresentation({
    scene: new THREE.Scene(),
    camera,
    vfx,
    anchor,
    world: () => world,
    time: () => 0,
    views: new Map<number, EntityView>(),
    visual: () => null,
    textureReady: () => true,
    ground: () => 0,
    height: () => 720,
    pixelRatio: () => 1,
    reducedMotion: () => false,
    audio: () => null,
    spiritBuild: () => {},
    compile: null,
    light: { pulse: () => {} } as never,
    castGate,
    painter: {
      spawnAoeRing,
      triggerAttack,
      lightPulse: () => {},
      addShake: () => {},
      screenFlash: () => {},
      screenImpact: () => {},
    },
  });
  return { fx, painter, gate, spawnAoeRing, triggerAttack };
}

describe('the ability presentation the renderer builds', () => {
  it('claims and draws nothing of a cast while off, and never asks readiness', () => {
    setSpellEffectsEnabled(false);
    const { fx, painter, gate } = presentation();
    expect(painter.handleSpellfx(frostbolt)).toBe(true);
    for (let i = 0; i < 30; i++) fx.update(1 / 30);
    expect(gate.admitted).toEqual([]);
    expect(gate.ready).toEqual([]);
    // No pool asked to spawn: the cast reached no primitive at all.
    expect(gate.spawns).toEqual([]);
  });

  it('still draws the area telegraph ring of a point cast while off', () => {
    setSpellEffectsEnabled(false);
    const { painter, spawnAoeRing } = presentation();
    expect(
      painter.handleSpellfxAt({
        x: 4,
        z: 5,
        school: 'frost',
        fx: 'nova',
        radius: 8,
        sourceId: 1,
        ability: 'frost_nova',
      }),
    ).toBe(true);
    expect(spawnAoeRing).toHaveBeenCalledTimes(1);
    expect(spawnAoeRing.mock.calls[0].slice(0, 4)).toEqual([4, 5, 8, 'frost']);
  });

  it('draws again on the next cast once switched back on', () => {
    setSpellEffectsEnabled(false);
    const { fx, painter, gate } = presentation();
    painter.handleSpellfx(frostbolt);
    setSpellEffectsEnabled(true);
    // A new release is a new cast, decided afresh.
    expect(painter.handleSpellfx(frostbolt)).toBe(true);
    expect(gate.admitted).toEqual([CAST_VFX_ENGINE]);
    for (let i = 0; i < 20; i++) fx.update(1 / 30);
    expect(gate.spawns).toContain(CAST_VFX_ENGINE);
  });
});

describe('the painter under a closed switch', () => {
  /** A recording engine: every method the painter reaches for, in order. */
  function painterOff() {
    const calls: string[] = [];
    const fx = new Proxy(
      {},
      {
        get:
          (_t, key) =>
          (..._args: unknown[]) => {
            calls.push(String(key));
            return 0;
          },
      },
    ) as unknown as AbilityVfxFx;
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
    const gate = gateCastsBySpellEffects({ admit: () => true, ready: () => true });
    const triggerAttack = vi.fn();
    const spawnAoeRing = vi.fn();
    const painter = new AbilityVfx(
      {
        fx,
        vfx,
        anchor: () => ({ x: 0, y: 1, z: 0 }),
        spawnAoeRing,
        triggerAttack,
        localPlayerId: () => 1,
        castVfxAdmit: gate.admit,
        castVfxReady: gate.ready,
      },
      () => 0,
    );
    calls.length = 0;
    setSpellEffectsEnabled(false);
    return { painter, calls, vfx, triggerAttack, spawnAoeRing };
  }

  it('holds the hard-CC band over a stunned body and sleeps everything else', () => {
    const { painter, calls } = painterOff();
    const stunned: AbilityVfxEntityState = {
      id: 7,
      kind: 'mob',
      castingAbility: null,
      castRemaining: 0,
      castTotal: 0,
      auras: [{ id: 'war_stomp_stun', kind: 'stun', remaining: 2.5 }],
    } as AbilityVfxEntityState;
    painter.syncEntity(stunned);
    expect(calls).toEqual(['sleepEntity', 'holdCcBand']);
  });

  it("still plays a mob's windup clip: the boss read rides an animation", () => {
    const { painter, triggerAttack, vfx } = painterOff();
    expect(painter.handleSpellfx({ ...frostbolt, sourceId: 4, fx: 'windup' })).toBe(true);
    expect(triggerAttack).toHaveBeenCalledWith(4, 'frostbolt');
    for (const spawn of Object.values(vfx)) expect(spawn).not.toHaveBeenCalled();
  });

  it('keeps the entity-anchored shout ring and drops its shockwave', () => {
    const { painter, vfx, spawnAoeRing } = painterOff();
    painter.handleSpellfx({
      sourceId: 1,
      targetId: 1,
      school: 'shadow',
      fx: 'shout',
      ability: 'demoralizing_roar',
    });
    expect(spawnAoeRing).toHaveBeenCalledTimes(1);
    expect(vfx.shoutwave).not.toHaveBeenCalled();
  });

  it("drops the physical Warrior tick's blood accent (claimed before the gate)", () => {
    const { painter, calls } = painterOff();
    const isWarrior = () => true;
    (painter as unknown as { deps: { isWarrior: () => boolean } }).deps.isWarrior = isWarrior;
    expect(
      painter.handleSpellfx({ sourceId: 3, targetId: 2, school: 'physical', fx: 'tick' }),
    ).toBe(true);
    expect(calls).not.toContain('burstAt');
    setSpellEffectsEnabled(true);
    painter.handleSpellfx({ sourceId: 3, targetId: 2, school: 'physical', fx: 'tick' });
    expect(calls).toContain('burstAt');
  });
});

describe('the pooled spell particles (Vfx)', () => {
  const anchorAt = (id: number, _frac: number, out?: THREE.Vector3) =>
    (out ?? new THREE.Vector3()).set(id === 1 ? 0 : 10, 1, 0);

  function cloud() {
    installCastVfxCanvasStub();
    const scene = new THREE.Scene();
    const vfx = new Vfx(scene, anchorAt);
    const probe = vfx as unknown as {
      activeCount: number;
      projectiles: unknown[];
      drainLifeVfx: { slots: { active: boolean }[] };
    };
    return { scene, vfx, probe };
  }

  it('spawns no particle for the spell emitters while off', () => {
    setSpellEffectsEnabled(false);
    const { vfx, probe } = cloud();
    vfx.projectile(1, 2, 'fire');
    vfx.lightningProjectile(1, 2);
    vfx.beam(1, 2, 'arcane');
    vfx.chainHealArc(1, 2);
    vfx.procSurge(1, 'fire');
    vfx.wardBloom(1, 'holy');
    vfx.echoBurst(2, 'nature');
    vfx.detonate(2, 'fire');
    vfx.tick(2, 'shadow');
    vfx.shoutwave(1, 0xff0000);
    vfx.meleeSpark(2, true);
    vfx.lichTransform(1);
    vfx.formAura(1, 'moonkin', 1);
    vfx.lichAura(1, 1, 3);
    vfx.recklessFlame(1, 1);
    vfx.paladinFinalEdict(1, 2);
    vfx.spellNova(2, 'fire');
    vfx.spellBurst(new THREE.Vector3(), 'fire', 20, 1);
    vfx.spellHealGlow(2);
    vfx.spellBuffSwirl(2);
    vfx.spellCastSparkle(1, 'arcane', 1);
    for (let i = 0; i < 10; i++) vfx.update(1 / 30);
    expect(probe.projectiles).toHaveLength(0);
    expect(probe.activeCount).toBe(0);
  });

  it('spawns them while on, so the check above is not vacuous', () => {
    const { vfx, probe } = cloud();
    vfx.projectile(1, 2, 'fire');
    vfx.spellNova(2, 'fire');
    vfx.spellCastSparkle(1, 'arcane', 1);
    vfx.update(1 / 30);
    expect(probe.activeCount).toBeGreaterThan(0);
  });

  it('keeps the shared emitters that carry non-spell reads', () => {
    // A delve shrine's sequence pulse (nova), a lit wardstone (castSparkle)
    // and a correct-touch glow (healGlow) draw through the same pool: only
    // the spell-sourced twins go quiet.
    setSpellEffectsEnabled(false);
    const { vfx, probe } = cloud();
    vfx.nova(2, 'holy');
    expect(probe.activeCount).toBeGreaterThan(0);
    const afterNova = probe.activeCount;
    vfx.castSparkle(2, 'arcane', 1);
    vfx.healGlow(2);
    vfx.buffSwirl(2);
    vfx.burst(new THREE.Vector3(), 'fire', 20, 1);
    expect(probe.activeCount).toBeGreaterThan(afterNova);
  });

  it('flies a soul unseen and still lands its impact callback on time', () => {
    setSpellEffectsEnabled(false);
    const { vfx, probe } = cloud();
    const onImpact = vi.fn();
    vfx.soulTravel(0, 1, 0, 2, onImpact);
    expect(probe.projectiles).toHaveLength(1);
    // 10 yards at 14 yd/s: not yet after a third of a second, done by one.
    for (let i = 0; i < 10; i++) {
      vfx.update(1 / 30);
      expect(probe.activeCount).toBe(0);
    }
    expect(onImpact).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) {
      vfx.update(1 / 30);
      expect(probe.activeCount).toBe(0);
    }
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(probe.projectiles).toHaveLength(0);
  });

  it('turns channel starts into stops, ending a stream the flip caught mid-channel', () => {
    const { scene, vfx, probe } = cloud();
    const streams = () => scene.children.filter((o) => o.name === 'drain-life-beam').length;
    vfx.bubbleBeam(1, 2, 4);
    vfx.drainBeam(1, 2, 5);
    expect(streams()).toBe(1);
    expect(probe.drainLifeVfx.slots.some((s) => s.active)).toBe(true);
    setSpellEffectsEnabled(false);
    // The next refresh of each channel is what ends it.
    vfx.bubbleBeam(1, 2, 4);
    vfx.drainBeam(1, 2, 5);
    expect(streams()).toBe(0);
    expect(probe.drainLifeVfx.slots.some((s) => s.active)).toBe(false);
    vfx.demonicDrainBeam(1, 2, 5);
    vfx.evilEyeGaze(1, 2);
    expect(probe.drainLifeVfx.slots.some((s) => s.active)).toBe(false);
  });
});

describe('the spell light pulses', () => {
  it('flash while on and stay dark while off', () => {
    const scene = new THREE.Scene();
    const pulses = new LightPulses(scene);
    setSpellEffectsEnabled(false);
    pulses.pulse(new THREE.Vector3(), 'fire', 8, 0.5);
    pulses.update(0.01);
    expect(pulses.lights.every((l) => l.intensity === 0)).toBe(true);
    setSpellEffectsEnabled(true);
    pulses.pulse(new THREE.Vector3(), 'fire', 8, 0.5);
    pulses.update(0.01);
    expect(pulses.lights.some((l) => l.intensity > 0)).toBe(true);
  });
});

describe('the class spell visuals outside the pooled engines', () => {
  const TEXTURES = {
    noise: new THREE.Texture(),
    ribbon: new THREE.Texture(),
    rune: new THREE.Texture(),
    ember: new THREE.Texture(),
    rime: new THREE.Texture(),
    crack: new THREE.Texture(),
    char: new THREE.Texture(),
    overlay: new THREE.Texture(),
  } as unknown as AbilityVfxTextures;
  const at = (_id: number, _h: number, out: THREE.Vector3): boolean => {
    out.set(3, 0, 3);
    return true;
  };
  /** Whether some draw under `root` is on screen. */
  const shows = (root: THREE.Object3D): boolean =>
    drawsUnder(root).some(({ object }) => {
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (!node.visible) return false;
      }
      return true;
    });

  const PLAYS: Array<[string, () => { root: THREE.Object3D; play: () => void }]> = [
    [
      'Needle of Fate',
      () => {
        const vfx = new NeedleOfFateVfx(
          new THREE.Scene(),
          new THREE.PerspectiveCamera(),
          at,
          false,
        );
        return {
          root: vfx.group,
          play: () => {
            vfx.beginCast(1, 1);
            vfx.spawn(1, 2);
            vfx.update(1 / 30);
          },
        };
      },
    ],
    [
      'Sentence',
      () => {
        const vfx = new SentenceVfx(
          new THREE.Scene(),
          new THREE.PerspectiveCamera(),
          at,
          false,
          vi.fn(),
          TEXTURES,
        );
        return {
          root: vfx.group,
          play: () => {
            vfx.trigger(1, 2, 80, 3);
            vfx.update(1 / 30);
          },
        };
      },
    ],
    [
      'the released Glacial Front cone',
      () => {
        const scene = new THREE.Scene();
        const visual = new GlacialFrontVisual(scene);
        const release = new THREE.Group();
        for (const child of scene.children.filter((o) => o.name === 'glacial-front-release'))
          release.add(child);
        scene.add(release);
        return { root: release, play: () => visual.spawn(0, 0, 0, 0, 16, 4) };
      },
    ],
  ];

  it.each(PLAYS)('%s draws while on and not at all while off', (_, build) => {
    const on = build();
    on.play();
    expect(shows(on.root)).toBe(true);
    setSpellEffectsEnabled(false);
    const off = build();
    off.play();
    expect(shows(off.root)).toBe(false);
  });

  it('spawns no Recklessness skull while off', () => {
    setSpellEffectsEnabled(false);
    const parent = new THREE.Group();
    new RecklessSkullPainter().spawn(parent, 2);
    expect(parent.children).toHaveLength(0);
  });

  it("drops the meteor fallback burst but not the painter's claimed landing", () => {
    const burst = vi.fn();
    const handleSpellfxAt = vi.fn(() => false);
    setSpellEffectsEnabled(false);
    expect(meteorLandingBurst({ handleSpellfxAt }, { burst }, 1, 0, 0)).toBe('burst');
    expect(burst).not.toHaveBeenCalled();
    setSpellEffectsEnabled(true);
    meteorLandingBurst({ handleSpellfxAt }, { burst }, 1, 0, 0);
    expect(burst).toHaveBeenCalledTimes(1);
    // A spec'd landing goes to the painter either way; its own gate decides.
    const claimed = vi.fn(() => true);
    setSpellEffectsEnabled(false);
    expect(
      meteorLandingBurst({ handleSpellfxAt: claimed }, { burst }, 1, 0, 0, {
        ability: 'meteor',
        school: 'fire',
        radius: 8,
      } as never),
    ).toBe('spec');
    expect(claimed).toHaveBeenCalledTimes(1);
  });
});
