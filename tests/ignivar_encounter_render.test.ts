import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AbilityVfx, type AbilityVfxFx } from '../src/render/ability_vfx';
import {
  abilityVfxFullSpecFor,
  abilityVfxSpecFor,
} from '../src/render/ability_vfx/encounter_specs';
import {
  buildIgnivarBrandCircle,
  buildIgnivarFrontalTelegraph,
  buildIgnivarRotatingRaysTelegraph,
  buildIgnivarSkyfireTelegraph,
  buildIgnivarSoakCircle,
  disposeIgnivarEncounterVisuals,
  IGNIVAR_BRAND_VISUAL_NAME,
  IGNIVAR_FRONTAL_VISUAL_NAME,
  IGNIVAR_ROTATING_RAYS_VISUAL_NAME,
  IGNIVAR_SKYFIRE_VISUAL_NAME,
  IGNIVAR_SOAK_VISUAL_NAME,
  syncIgnivarEncounterVisuals,
} from '../src/render/ignivar_encounter';
import {
  ignivarEncounterBypassesCharacterCulling,
  ignivarEncounterVisualPlan,
} from '../src/render/ignivar_encounter_core';
import {
  IGNIVAR_FIRE_BEAM_CORE_NAME,
  IGNIVAR_FIRE_BEAM_EMBERS_NAME,
  IGNIVAR_FIRE_BEAM_FLAMES_NAME,
  IGNIVAR_FIRE_BEAM_OUTER_NAME,
} from '../src/render/ignivar_fire_beams';
import {
  IGNIVAR_JUDGMENT_SHELTERS_NAME,
  IGNIVAR_JUDGMENT_VISUAL_NAME,
} from '../src/render/ignivar_forge_judgment';
import {
  buildIgnivarForgeWaveVisual,
  IGNIVAR_FORGE_WAVE_PREVIEW_NAME,
  IGNIVAR_FORGE_WAVE_SAFE_LANES_NAME,
  IGNIVAR_FORGE_WAVE_VISUAL_NAME,
  IGNIVAR_FORGE_WAVE_WALL_NAME,
} from '../src/render/ignivar_forge_wave';
import {
  attachIgnivarModelVfx,
  IGNIVAR_CHEST_FIRE_NAME,
  IGNIVAR_SHOULDER_FIRE_LEFT_NAME,
  IGNIVAR_SHOULDER_FIRE_RIGHT_NAME,
} from '../src/render/ignivar_model_vfx';
import type { Vfx } from '../src/render/vfx';
import {
  IGNIVAR_BRAND_AURA_ID,
  IGNIVAR_FORGE_WAVE_CAST_ID,
  IGNIVAR_FRONTAL_CAST_ID,
  IGNIVAR_JUDGMENT_CAST_ID,
  IGNIVAR_ROTATING_RAYS_CAST_ID,
  IGNIVAR_SKYFIRE_CAST_ID,
  IGNIVAR_SOAK_AURA_ID,
} from '../src/sim/encounters/ignivar';
import {
  IGNIVAR_ROTATING_RAYS_HALF_WIDTH,
  IGNIVAR_ROTATING_RAYS_INNER_RANGE,
  IGNIVAR_ROTATING_RAYS_RANGE,
} from '../src/sim/ignivar_arena';
import {
  ignivarForgeLayoutFacing,
  ignivarForgeShelterOffsets,
} from '../src/sim/ignivar_forge_judgment';
import { IGNIVAR_BOSS_ID } from '../src/sim/types';
import { DICT, localizeSimAuraName, localizeSimText } from '../src/ui/sim_i18n';

function expectAuthoredFireBeamInside(
  beam: THREE.Object3D,
  options: { innerRange: number; range: number; startHalfWidth: number; endHalfWidth: number },
): void {
  const expectPointInside = (x: number, z: number) => {
    expect(z).toBeGreaterThanOrEqual(options.innerRange - 1e-6);
    expect(z).toBeLessThanOrEqual(options.range + 1e-6);
    const progress = (z - options.innerRange) / (options.range - options.innerRange);
    const allowed = THREE.MathUtils.lerp(options.startHalfWidth, options.endHalfWidth, progress);
    expect(Math.abs(x)).toBeLessThanOrEqual(allowed + 1e-6);
  };
  for (const name of [IGNIVAR_FIRE_BEAM_OUTER_NAME, IGNIVAR_FIRE_BEAM_CORE_NAME]) {
    const mesh = beam.getObjectByName(name) as THREE.Mesh;
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index++) {
      expectPointInside(positions.getX(index), positions.getZ(index));
    }
  }
  const flames = beam.getObjectByName(IGNIVAR_FIRE_BEAM_FLAMES_NAME) as THREE.InstancedMesh;
  const flamePositions = flames.geometry.getAttribute('position') as THREE.BufferAttribute;
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  for (let instance = 0; instance < flames.count; instance++) {
    flames.getMatrixAt(instance, matrix);
    for (let vertex = 0; vertex < flamePositions.count; vertex++) {
      point.fromBufferAttribute(flamePositions, vertex).applyMatrix4(matrix);
      expectPointInside(point.x, point.z);
    }
  }
  const embers = beam.getObjectByName(IGNIVAR_FIRE_BEAM_EMBERS_NAME) as THREE.Points;
  const emberPositions = embers.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < emberPositions.count; index++) {
    expectPointInside(emberPositions.getX(index), emberPositions.getZ(index));
  }
}

describe('Ignivar encounter renderer', () => {
  it('attaches animated forge fire and budgeted light to the HIFI model sockets', () => {
    const model = new THREE.Group();
    for (const [name, position] of [
      ['Socket_ChestCore', [0.19, 0.66, 0]],
      ['Socket_ShoulderLeft', [0.05, 0.82, -0.26]],
      ['Socket_ShoulderRight', [0.05, 0.82, 0.26]],
    ] as const) {
      const socket = new THREE.Group();
      socket.name = name;
      socket.position.set(position[0], position[1], position[2]);
      model.add(socket);
    }

    expect(attachIgnivarModelVfx(model)).toBe(true);
    expect(attachIgnivarModelVfx(model)).toBe(false);
    for (const name of [
      IGNIVAR_CHEST_FIRE_NAME,
      IGNIVAR_SHOULDER_FIRE_LEFT_NAME,
      IGNIVAR_SHOULDER_FIRE_RIGHT_NAME,
    ]) {
      expect(model.getObjectByName(name)).toBeDefined();
    }
    const lights: THREE.PointLight[] = [];
    const flameMaterials: THREE.ShaderMaterial[] = [];
    model.traverse((object) => {
      if ((object as THREE.PointLight).isPointLight) lights.push(object as THREE.PointLight);
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.ShaderMaterial).isShaderMaterial) {
        flameMaterials.push(mesh.material as THREE.ShaderMaterial);
      }
    });
    expect(lights).toHaveLength(3);
    expect(flameMaterials.length).toBeGreaterThanOrEqual(4);
    expect(flameMaterials.every((material) => material.blending === THREE.AdditiveBlending)).toBe(
      true,
    );

    model.updateMatrixWorld(true);
    const campfireEmber = vi.fn();
    syncIgnivarEncounterVisuals(
      model,
      {
        kind: 'mob',
        templateId: IGNIVAR_BOSS_ID,
        castingAbility: null,
        castRemaining: 0,
        castTotal: 0,
        channeling: false,
        auras: [],
        scale: 3.4,
      },
      0.2,
      { campfireEmber, syncIgnivarJudgmentGroundFire: vi.fn() } as unknown as Vfx,
    );
    expect(campfireEmber).toHaveBeenCalledTimes(2);
    expect(model.userData.ignivarModelVfxTime).toBeCloseTo(0.2);
    expect(flameMaterials.some((material) => material.uniforms.uTime.value > 0)).toBe(true);

    disposeIgnivarEncounterVisuals(model);
    expect(model.getObjectByName(IGNIVAR_CHEST_FIRE_NAME)).toBeUndefined();
    expect(model.getObjectByName(IGNIVAR_SHOULDER_FIRE_LEFT_NAME)).toBeUndefined();
    expect(model.getObjectByName(IGNIVAR_SHOULDER_FIRE_RIGHT_NAME)).toBeUndefined();
  });

  it('authors Searing Torrent as a heavy fire vortex and directional ground rupture', () => {
    expect(abilityVfxSpecFor(IGNIVAR_FRONTAL_CAST_ID)).toMatchObject({
      p: 'fire',
      pw: 1.6,
      sp: 60,
      a: 'burst',
    });
    expect(abilityVfxFullSpecFor(IGNIVAR_FRONTAL_CAST_ID)).toMatchObject({
      archetype: 'burst',
      palette: 'fire',
      power: 1.6,
      windupStyle: 'vortex',
      motifs: ['fissure', 'pillars'],
      motifAt: 'target',
      burst: { style: 'ground' },
      impact: {
        flipbook: true,
        ring: false,
        vRing: true,
        sparks: 60,
        smoke: true,
        light: 3.2,
      },
      screenFx: true,
    });
    expect(abilityVfxSpecFor(IGNIVAR_FRONTAL_CAST_ID)?.rg).toBe(0);
    expect(abilityVfxFullSpecFor(IGNIVAR_FRONTAL_CAST_ID)?.decal).toBeUndefined();
    expect(abilityVfxFullSpecFor(IGNIVAR_FRONTAL_CAST_ID)?.linger).toBeUndefined();
    expect(abilityVfxSpecFor('heroic_strike')).toBeDefined();
  });

  it('authors Rain of Cinders as three powerful fire eruptions without damage rings', () => {
    expect(abilityVfxSpecFor(IGNIVAR_SKYFIRE_CAST_ID)).toMatchObject({
      p: 'fire',
      pw: 1.75,
      sp: 54,
      rg: 0,
      a: 'burst',
    });
    expect(abilityVfxFullSpecFor(IGNIVAR_SKYFIRE_CAST_ID)).toMatchObject({
      archetype: 'burst',
      palette: 'fire',
      power: 1.75,
      windupStyle: 'vortex',
      motifs: ['fissure', 'pillars'],
      motifAt: 'target',
      impact: {
        flipbook: true,
        ring: false,
        vRing: true,
        sparks: 54,
        smoke: true,
        light: 3.4,
      },
      screenFx: true,
    });
    expect(abilityVfxFullSpecFor(IGNIVAR_SKYFIRE_CAST_ID)?.decal).toBeUndefined();
    expect(abilityVfxFullSpecFor(IGNIVAR_SKYFIRE_CAST_ID)?.linger).toBeUndefined();
  });

  it('drives the frontal vortex and body glow from the live cast state', () => {
    const windup = vi.fn().mockReturnValue(true);
    const bodyGlow = vi.fn();
    const fx = {
      setDelegates: vi.fn(),
      windup,
      bodyGlow,
    } as unknown as AbilityVfxFx;
    const painter = new AbilityVfx(
      {
        fx,
        vfx: {
          projectile: vi.fn(),
          lightningProjectile: vi.fn(),
          burst: vi.fn(),
          nova: vi.fn(),
          tick: vi.fn(),
          shoutwave: vi.fn(),
          buffSwirl: vi.fn(),
          beam: vi.fn(),
        },
        anchor: vi.fn(),
        spawnAoeRing: vi.fn(),
        triggerAttack: vi.fn(),
      },
      () => 1,
    );

    painter.syncEntity({
      id: 77,
      castingAbility: IGNIVAR_FRONTAL_CAST_ID,
      castRemaining: 1.5,
      castTotal: 3,
      auras: [],
      kind: 'mob',
    });

    expect(windup).toHaveBeenCalledWith(77, 0xff4a12, 0.5, 'vortex', false);
    expect(bodyGlow).toHaveBeenCalledWith(77, 0xff7a24, 1.92, false);
  });

  it('authors Forge Wave as a powerful fire release without closing its safe gaps', () => {
    expect(abilityVfxSpecFor(IGNIVAR_FORGE_WAVE_CAST_ID)).toMatchObject({
      c: '#ff6a14',
      p: 'fire',
      pw: 1.8,
      sp: 60,
      rg: 0,
      sm: 1,
      li: 3.8,
      a: 'burst',
    });
    expect(abilityVfxFullSpecFor(IGNIVAR_FORGE_WAVE_CAST_ID)).toMatchObject({
      archetype: 'burst',
      palette: 'fire',
      power: 1.8,
      windupStyle: 'vortex',
      motifs: ['pillars'],
      motifAt: 'caster',
      impact: {
        flipbook: true,
        ring: false,
        vRing: true,
        sparks: 60,
        smoke: true,
        light: 3.8,
      },
      screenFx: true,
    });
    expect(abilityVfxFullSpecFor(IGNIVAR_FORGE_WAVE_CAST_ID)?.decal).toBeUndefined();
    expect(abilityVfxFullSpecFor(IGNIVAR_FORGE_WAVE_CAST_ID)?.linger).toBeUndefined();
  });

  it('routes the Forge Wave release through the heavy point VFX sequencer', () => {
    const sequenceInstantAt = vi.fn();
    const fx = {
      setDelegates: vi.fn(),
      groundYAt: vi.fn().mockReturnValue(0),
      sequenceInstantAt,
    } as unknown as AbilityVfxFx;
    const painter = new AbilityVfx(
      {
        fx,
        vfx: {
          projectile: vi.fn(),
          lightningProjectile: vi.fn(),
          burst: vi.fn(),
          nova: vi.fn(),
          tick: vi.fn(),
          shoutwave: vi.fn(),
          buffSwirl: vi.fn(),
          beam: vi.fn(),
        },
        anchor: vi.fn().mockReturnValue({ x: 4, y: 1, z: 8 }),
        spawnAoeRing: vi.fn(),
        triggerAttack: vi.fn(),
      },
      () => 1,
    );

    expect(
      painter.handleSpellfxAt({
        x: 4,
        z: 8,
        school: 'fire',
        fx: 'burst',
        ability: IGNIVAR_FORGE_WAVE_CAST_ID,
        sourceId: 77,
      }),
    ).toBe(true);
    expect(sequenceInstantAt).toHaveBeenCalledWith(
      IGNIVAR_FORGE_WAVE_CAST_ID,
      abilityVfxFullSpecFor(IGNIVAR_FORGE_WAVE_CAST_ID),
      77,
      4,
      8,
      0xff6a14,
      0,
      0,
    );
  });

  it('routes the frontal release through the heavy point-anchored VFX sequencer', () => {
    const sequenceInstantAt = vi.fn();
    const fx = {
      setDelegates: vi.fn(),
      groundYAt: vi.fn().mockReturnValue(0),
      sequenceInstantAt,
    } as unknown as AbilityVfxFx;
    const painter = new AbilityVfx(
      {
        fx,
        vfx: {
          projectile: vi.fn(),
          lightningProjectile: vi.fn(),
          burst: vi.fn(),
          nova: vi.fn(),
          tick: vi.fn(),
          shoutwave: vi.fn(),
          buffSwirl: vi.fn(),
          beam: vi.fn(),
        },
        anchor: vi.fn().mockReturnValue({ x: 0, y: 1, z: 0 }),
        spawnAoeRing: vi.fn(),
        triggerAttack: vi.fn(),
      },
      () => 1,
    );

    expect(
      painter.handleSpellfxAt({
        x: 12,
        z: 24,
        school: 'fire',
        fx: 'burst',
        ability: IGNIVAR_FRONTAL_CAST_ID,
        sourceId: 77,
      }),
    ).toBe(true);
    expect(sequenceInstantAt).toHaveBeenCalledWith(
      IGNIVAR_FRONTAL_CAST_ID,
      abilityVfxFullSpecFor(IGNIVAR_FRONTAL_CAST_ID),
      77,
      12,
      24,
      0xff4a12,
      0,
      0,
    );
  });

  it('runs all three spatially distinct skyfire eruptions through the heavy VFX sequencer', () => {
    const sequenceInstantAt = vi.fn();
    const fx = {
      setDelegates: vi.fn(),
      groundYAt: vi.fn().mockReturnValue(0),
      sequenceInstantAt,
      ringAt: vi.fn(),
      burstAt: vi.fn(),
    } as unknown as AbilityVfxFx;
    const painter = new AbilityVfx(
      {
        fx,
        vfx: {
          projectile: vi.fn(),
          lightningProjectile: vi.fn(),
          burst: vi.fn(),
          nova: vi.fn(),
          tick: vi.fn(),
          shoutwave: vi.fn(),
          buffSwirl: vi.fn(),
          beam: vi.fn(),
        },
        anchor: vi.fn().mockReturnValue({ x: 0, y: 1, z: 0 }),
        spawnAoeRing: vi.fn(),
        triggerAttack: vi.fn(),
      },
      () => 1,
    );
    const eruptionPoints = [
      { x: 0, z: 24 },
      { x: 20.784, z: -12 },
      { x: -20.784, z: -12 },
    ];

    for (const point of eruptionPoints) {
      expect(
        painter.handleSpellfxAt({
          ...point,
          school: 'fire',
          fx: 'burst',
          ability: IGNIVAR_SKYFIRE_CAST_ID,
          sourceId: 77,
        }),
      ).toBe(true);
    }

    expect(sequenceInstantAt).toHaveBeenCalledTimes(3);
    expect(sequenceInstantAt.mock.calls.map((call) => [call[3], call[4]])).toEqual(
      eruptionPoints.map(({ x, z }) => [x, z]),
    );

    painter.handleSpellfxAt({
      ...eruptionPoints[0],
      school: 'fire',
      fx: 'burst',
      ability: IGNIVAR_SKYFIRE_CAST_ID,
      sourceId: 77,
    });
    expect(sequenceInstantAt).toHaveBeenCalledTimes(3);
  });

  it('builds explicit cone and personal-space telegraphs', () => {
    expect(buildIgnivarFrontalTelegraph().name).toBe(IGNIVAR_FRONTAL_VISUAL_NAME);
    expect(buildIgnivarFrontalTelegraph().children).toHaveLength(2);
    expect(buildIgnivarBrandCircle().name).toBe(IGNIVAR_BRAND_VISUAL_NAME);
    expect(buildIgnivarBrandCircle().children).toHaveLength(2);
    const skyfire = buildIgnivarSkyfireTelegraph();
    expect(skyfire.name).toBe(IGNIVAR_SKYFIRE_VISUAL_NAME);
    expect(skyfire.children).toHaveLength(6);
    expect(skyfire.getObjectByName(IGNIVAR_FIRE_BEAM_OUTER_NAME)).toBeUndefined();
    const rays = buildIgnivarRotatingRaysTelegraph();
    expect(rays.name).toBe(IGNIVAR_ROTATING_RAYS_VISUAL_NAME);
    expect(rays.children).toHaveLength(9);
    for (let ray = 0; ray < 3; ray++) {
      const expectedRotation = (ray * Math.PI * 2) / 3;
      for (const visual of [
        rays.children[ray * 3],
        rays.children[ray * 3 + 1],
        rays.children[ray * 3 + 2],
      ]) {
        expect(visual.rotation.y).toBeCloseTo(expectedRotation, 8);
        expect(visual.userData.rayIndex).toBe(ray);
      }
      expect(
        rays.children[ray * 3 + 2].getObjectByName(IGNIVAR_FIRE_BEAM_OUTER_NAME),
      ).toBeDefined();
      expectAuthoredFireBeamInside(rays.children[ray * 3 + 2], {
        innerRange: IGNIVAR_ROTATING_RAYS_INNER_RANGE,
        range: IGNIVAR_ROTATING_RAYS_RANGE,
        startHalfWidth: IGNIVAR_ROTATING_RAYS_HALF_WIDTH,
        endHalfWidth: IGNIVAR_ROTATING_RAYS_HALF_WIDTH,
      });
    }
    expect(buildIgnivarSoakCircle().name).toBe(IGNIVAR_SOAK_VISUAL_NAME);
    expect(buildIgnivarSoakCircle().children).toHaveLength(3);
  });

  it('builds a powerful expanding wall with exactly two readable safe gaps', () => {
    const wave = buildIgnivarForgeWaveVisual();
    expect(wave.name).toBe(IGNIVAR_FORGE_WAVE_VISUAL_NAME);
    expect(wave.userData.safeGapCount).toBe(2);
    const preview = wave.getObjectByName(IGNIVAR_FORGE_WAVE_PREVIEW_NAME);
    const safeLanes = wave.getObjectByName(IGNIVAR_FORGE_WAVE_SAFE_LANES_NAME);
    const wall = wave.getObjectByName(IGNIVAR_FORGE_WAVE_WALL_NAME);
    expect(preview).toBeDefined();
    expect(safeLanes?.children).toHaveLength(2);
    expect(safeLanes?.children[0]?.rotation.y).toBe(0);
    expect(safeLanes?.children[1]?.rotation.y).toBe(Math.PI);
    const flame = wall?.children[0] as THREE.Mesh;
    const positions = flame.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(positions.count / 6).toBe(80);
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const angle = Math.atan2(positions.getX(vertex), positions.getZ(vertex));
      const fromForward = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
      const fromBackward = Math.abs(
        Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI)),
      );
      expect(Math.min(fromForward, fromBackward)).toBeGreaterThanOrEqual(Math.PI / 12 - 1e-6);
    }
    expect(wall?.children.length).toBeGreaterThanOrEqual(4);
  });

  it('derives Forge Wave windup and expansion from the authoritative cast state', () => {
    expect(
      ignivarEncounterVisualPlan({
        kind: 'mob',
        templateId: IGNIVAR_BOSS_ID,
        castingAbility: IGNIVAR_FORGE_WAVE_CAST_ID,
        castRemaining: 1.25,
        castTotal: 2.5,
        channeling: false,
        auras: [],
      }),
    ).toMatchObject({
      forgeWavePhase: 'windup',
      forgeWaveProgress: 0.5,
      forgeWaveRadius: 0,
    });
    expect(
      ignivarEncounterVisualPlan({
        kind: 'mob',
        templateId: IGNIVAR_BOSS_ID,
        castingAbility: IGNIVAR_FORGE_WAVE_CAST_ID,
        castRemaining: 1.5,
        castTotal: 3,
        channeling: true,
        auras: [],
      }),
    ).toMatchObject({
      forgeWavePhase: 'active',
      forgeWaveProgress: 0.5,
      forgeWaveRadius: 14,
    });
  });

  it('switches Forge Wave from its safe-lane preview to the expanding fire wall', () => {
    const group = new THREE.Group();
    const boss = {
      kind: 'mob',
      templateId: IGNIVAR_BOSS_ID,
      castingAbility: IGNIVAR_FORGE_WAVE_CAST_ID as string | null,
      castRemaining: 1.25,
      castTotal: 2.5,
      channeling: false,
      auras: [],
      scale: 3.4,
    };

    syncIgnivarEncounterVisuals(group, boss);
    const wave = group.getObjectByName(IGNIVAR_FORGE_WAVE_VISUAL_NAME);
    const preview = wave?.getObjectByName(IGNIVAR_FORGE_WAVE_PREVIEW_NAME);
    const safeLanes = wave?.getObjectByName(IGNIVAR_FORGE_WAVE_SAFE_LANES_NAME);
    const wall = wave?.getObjectByName(IGNIVAR_FORGE_WAVE_WALL_NAME);
    expect(wave?.visible).toBe(true);
    expect(wave?.scale.x).toBeCloseTo(1 / 3.4);
    expect(preview?.visible).toBe(true);
    expect(safeLanes?.visible).toBe(true);
    expect(wall?.visible).toBe(false);

    boss.channeling = true;
    boss.castTotal = 3;
    boss.castRemaining = 1.5;
    syncIgnivarEncounterVisuals(group, boss);
    expect(preview?.visible).toBe(false);
    expect(safeLanes?.visible).toBe(true);
    expect(wall?.visible).toBe(true);
    expect(wall?.scale.x).toBeCloseTo(14);
    expect(wall?.scale.z).toBeCloseTo(14);

    boss.castingAbility = null;
    syncIgnivarEncounterVisuals(group, boss);
    expect(wave?.visible).toBe(false);
  });

  it('bypasses character culling while any boss-anchored raid telegraph is actionable', () => {
    for (const castingAbility of [
      IGNIVAR_FRONTAL_CAST_ID,
      IGNIVAR_SKYFIRE_CAST_ID,
      IGNIVAR_ROTATING_RAYS_CAST_ID,
      IGNIVAR_FORGE_WAVE_CAST_ID,
      IGNIVAR_JUDGMENT_CAST_ID,
    ]) {
      expect(
        ignivarEncounterBypassesCharacterCulling({
          kind: 'mob',
          templateId: IGNIVAR_BOSS_ID,
          castingAbility,
          auras: [],
        }),
      ).toBe(true);
    }
    expect(
      ignivarEncounterBypassesCharacterCulling({
        kind: 'mob',
        templateId: 'another_boss',
        castingAbility: IGNIVAR_FRONTAL_CAST_ID,
        auras: [],
      }),
    ).toBe(false);
  });

  it('registers localized player-facing names for both mechanics', () => {
    expect(localizeSimAuraName('Brand of the Pyre')).not.toBeNull();
    expect(localizeSimAuraName('Searing Torrent')).not.toBeNull();
    expect(localizeSimAuraName('Judgment of the Forge')).not.toBeNull();
    expect(DICT.es_ES['aura.ignivarBrandOfThePyre']).toBe('Marca de la Pira');
    expect(DICT.es_ES['mechanic.ignivarSearingTorrent']).toBe('Torrente abrasador');
    expect(DICT.es_ES['mechanic.ignivarApocalypse']).toBe('Apocalipsis');
    expect(DICT.es_ES['mechanic.ignivarForgeStrike']).toBe('Golpe de Fundición');
    expect(DICT.es_ES['aura.ignivarMoltenArmor']).toBe('Armadura Fundida');
    expect(DICT.es_ES['aura.ignivarLastInferno']).toBe('Último Infierno');
    expect(localizeSimAuraName('Molten Armor')).not.toBeNull();
    expect(localizeSimAuraName('Last Inferno')).not.toBeNull();
    expect(localizeSimAuraName('Shared Pyre')).not.toBeNull();
    expect(localizeSimAuraName('Rain of Cinders')).not.toBeNull();
    expect(localizeSimAuraName('Revolving Inferno')).not.toBeNull();
    expect(DICT.es_ES['mechanic.ignivarRevolvingInferno']).toBe('Infierno giratorio');
    expect(localizeSimAuraName('Forge Wave')).not.toBeNull();
    expect(DICT.es_ES['mechanic.ignivarForgeWave']).toBe('Onda de la Forja');
    expect(DICT.es_ES['mechanic.ignivarJudgmentOfTheForge']).toBe('Juicio de la Forja');
    expect(localizeSimText('The Heart of the End awakens. Let the world burn!')).not.toBeNull();
    expect(localizeSimText('The last flame consumes all!')).not.toBeNull();
    expect(localizeSimText('The sky itself will burn!')).not.toBeNull();
    expect(localizeSimText('Four must share the pyre, or all will burn!')).not.toBeNull();
  });

  it('shows all three rotating rays only for the Revolving Inferno channel', () => {
    const group = new THREE.Group();
    const boss: {
      kind: string;
      templateId: string;
      castingAbility: string | null;
      auras: { id: string }[];
      scale: number;
    } = {
      kind: 'mob',
      templateId: IGNIVAR_BOSS_ID,
      castingAbility: IGNIVAR_ROTATING_RAYS_CAST_ID,
      auras: [],
      scale: 3.4,
    };

    syncIgnivarEncounterVisuals(group, boss);
    const rays = group.getObjectByName(IGNIVAR_ROTATING_RAYS_VISUAL_NAME);
    expect(rays?.visible).toBe(true);
    expect(rays?.scale.x).toBeCloseTo(1 / 3.4);
    boss.castingAbility = IGNIVAR_SKYFIRE_CAST_ID;
    syncIgnivarEncounterVisuals(group, boss);
    expect(rays?.visible).toBe(false);
    expect(group.getObjectByName(IGNIVAR_SKYFIRE_VISUAL_NAME)?.visible).toBe(true);
    boss.castingAbility = IGNIVAR_ROTATING_RAYS_CAST_ID;
    boss.templateId = 'fire_elemental';
    syncIgnivarEncounterVisuals(group, boss);
    expect(rays?.visible).toBe(false);
  });

  it('rotates the rays while keeping the boss body facing locked', () => {
    const group = new THREE.Group();
    const bodyRoot = new THREE.Group();
    group.add(bodyRoot);
    const boss: {
      kind: string;
      templateId: string;
      castingAbility: string | null;
      auras: { id: string }[];
      scale: number;
    } = {
      kind: 'mob',
      templateId: IGNIVAR_BOSS_ID,
      castingAbility: IGNIVAR_ROTATING_RAYS_CAST_ID,
      auras: [],
      scale: 3.4,
    };

    group.rotation.y = 0.7;
    syncIgnivarEncounterVisuals(group, boss, 0, undefined, bodyRoot);
    expect(bodyRoot.rotation.y).toBeCloseTo(0);

    group.rotation.y = 1.2;
    syncIgnivarEncounterVisuals(group, boss, 0, undefined, bodyRoot);
    expect(bodyRoot.rotation.y).toBeCloseTo(-0.5);
    expect(group.rotation.y + bodyRoot.rotation.y).toBeCloseTo(0.7);
    expect(group.getObjectByName(IGNIVAR_ROTATING_RAYS_VISUAL_NAME)?.rotation.y).toBeCloseTo(0);

    boss.castingAbility = null;
    group.rotation.y = 1.1;
    syncIgnivarEncounterVisuals(group, boss, 0, undefined, bodyRoot);
    expect(group.rotation.y + bodyRoot.rotation.y).toBeCloseTo(0.7);

    group.rotation.y = 0.8;
    syncIgnivarEncounterVisuals(group, boss, 0, undefined, bodyRoot);
    expect(group.rotation.y + bodyRoot.rotation.y).toBeCloseTo(0.7);

    group.rotation.y = 0.7;
    syncIgnivarEncounterVisuals(group, boss, 0, undefined, bodyRoot);
    expect(bodyRoot.rotation.y).toBeCloseTo(0);
    expect(group.userData.ignivarRotatingRaysBodyLock).toBeUndefined();

    group.rotation.y = 0.9;
    syncIgnivarEncounterVisuals(group, boss, 0, undefined, bodyRoot);
    expect(bodyRoot.rotation.y).toBeCloseTo(0);
    expect(group.rotation.y + bodyRoot.rotation.y).toBeCloseTo(0.9);
  });

  it('shows the three skyfire cones only while Rain of Cinders is casting', () => {
    const group = new THREE.Group();
    const boss: {
      kind: string;
      templateId: string;
      castingAbility: string | null;
      auras: { id: string }[];
      scale: number;
    } = {
      kind: 'mob',
      templateId: IGNIVAR_BOSS_ID,
      castingAbility: IGNIVAR_SKYFIRE_CAST_ID,
      auras: [],
      scale: 3.4,
    };

    syncIgnivarEncounterVisuals(group, boss);
    expect(group.getObjectByName(IGNIVAR_SKYFIRE_VISUAL_NAME)?.visible).toBe(true);
    boss.castingAbility = null;
    syncIgnivarEncounterVisuals(group, boss);
    expect(group.getObjectByName(IGNIVAR_SKYFIRE_VISUAL_NAME)?.visible).toBe(false);
  });

  it('shows and clears the shared soak circle around the marked player', () => {
    const group = new THREE.Group();
    const player = {
      kind: 'player',
      templateId: 'priest',
      castingAbility: null,
      auras: [{ id: IGNIVAR_SOAK_AURA_ID }],
    };

    syncIgnivarEncounterVisuals(group, player);
    expect(group.getObjectByName(IGNIVAR_SOAK_VISUAL_NAME)?.visible).toBe(true);
    player.auras = [];
    syncIgnivarEncounterVisuals(group, player);
    expect(group.getObjectByName(IGNIVAR_SOAK_VISUAL_NAME)?.visible).toBe(false);
  });

  it('shows the frontal only for Ignivar while his cast is in flight', () => {
    const group = new THREE.Group();
    const boss: {
      kind: string;
      templateId: string;
      castingAbility: string | null;
      auras: { id: string }[];
      scale: number;
    } = {
      kind: 'mob',
      templateId: IGNIVAR_BOSS_ID,
      castingAbility: null,
      auras: [],
      scale: 3.4,
    };
    syncIgnivarEncounterVisuals(group, boss);
    expect(group.getObjectByName(IGNIVAR_FRONTAL_VISUAL_NAME)?.visible).toBe(false);
    syncIgnivarEncounterVisuals(group, {
      ...boss,
      templateId: 'fire_elemental',
    });
    expect(group.children).toHaveLength(5);
    boss.castingAbility = IGNIVAR_FRONTAL_CAST_ID;
    syncIgnivarEncounterVisuals(group, boss);
    expect(group.getObjectByName(IGNIVAR_FRONTAL_VISUAL_NAME)?.visible).toBe(true);
    expect(group.getObjectByName(IGNIVAR_FRONTAL_VISUAL_NAME)?.scale.x).toBeCloseTo(1 / 3.4);
  });

  it('shows and clears a red radius around every branded player', () => {
    const group = new THREE.Group();
    const player = {
      kind: 'player',
      templateId: 'warrior',
      castingAbility: null,
      auras: [{ id: IGNIVAR_BRAND_AURA_ID }],
    };
    syncIgnivarEncounterVisuals(group, player);
    expect(group.getObjectByName(IGNIVAR_BRAND_VISUAL_NAME)?.visible).toBe(true);
    player.auras = [];
    syncIgnivarEncounterVisuals(group, player);
    expect(group.getObjectByName(IGNIVAR_BRAND_VISUAL_NAME)?.visible).toBe(false);
  });

  it('intensifies the red radius as Brand of the Pyre gains stacks', () => {
    const group = new THREE.Group();
    const player = {
      kind: 'player',
      templateId: 'warrior',
      castingAbility: null,
      auras: [{ id: IGNIVAR_BRAND_AURA_ID, stacks: 1 }],
    };
    syncIgnivarEncounterVisuals(group, player);
    const circle = group.getObjectByName(IGNIVAR_BRAND_VISUAL_NAME) as THREE.Group;
    const fill = circle.children[0] as THREE.Mesh;
    const firstOpacity = (fill.material as THREE.MeshBasicMaterial).opacity;

    player.auras = [{ id: IGNIVAR_BRAND_AURA_ID, stacks: 3 }];
    syncIgnivarEncounterVisuals(group, player);

    expect(circle.userData.brandStacks).toBe(3);
    expect((fill.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(firstOpacity);
  });

  it('clamps Brand presentation to three stacks in the pure visual plan', () => {
    const plan = ignivarEncounterVisualPlan({
      kind: 'player',
      templateId: 'warrior',
      castingAbility: null,
      auras: [{ id: IGNIVAR_BRAND_AURA_ID, stacks: 99 }],
      scale: 0,
    });

    expect(plan).toMatchObject({
      branded: true,
      brandStacks: 3,
      brandFillOpacity: 0.25,
      inverseEntityScale: 100,
    });
    expect(plan.brandRimOpacity).toBeCloseTo(0.96, 5);
  });

  it('feeds the pooled ground-fire emitter the authoritative safe refuge in world space', () => {
    const group = new THREE.Group();
    group.position.set(100, 3, -50);
    group.scale.setScalar(3.4);
    const slot = 5;
    const safeIndex = 1;
    const rotation = (slot * Math.PI * 2) / 24;
    const safe = ignivarForgeShelterOffsets(rotation)[safeIndex];
    const syncGroundFire = vi.fn();
    const vfx = {
      syncIgnivarJudgmentGroundFire: syncGroundFire,
    } as unknown as Vfx;

    const facing = ignivarForgeLayoutFacing(slot, safeIndex);
    group.rotation.y = facing;
    syncIgnivarEncounterVisuals(
      group,
      {
        id: 77,
        kind: 'mob',
        templateId: IGNIVAR_BOSS_ID,
        castingAbility: IGNIVAR_JUDGMENT_CAST_ID,
        castRemaining: 4,
        castTotal: 12,
        channeling: true,
        facing,
        scale: 3.4,
        auras: [],
      },
      1 / 60,
      vfx,
    );

    expect(syncGroundFire).toHaveBeenCalledWith(
      77,
      true,
      100,
      3,
      -50,
      100 + safe.x,
      -50 + safe.z,
      1 / 60,
    );

    group.updateWorldMatrix(true, true);
    const judgment = group.getObjectByName(IGNIVAR_JUDGMENT_VISUAL_NAME) as THREE.Group;
    const shelter = judgment.getObjectByName(IGNIVAR_JUDGMENT_SHELTERS_NAME)?.children[safeIndex];
    const worldSafe = shelter?.getWorldPosition(new THREE.Vector3());
    expect(worldSafe?.x).toBeCloseTo(100 + safe.x, 6);
    expect(worldSafe?.z).toBeCloseTo(-50 + safe.z, 6);
    const foundation = shelter?.getObjectByName(
      'ignivarForgeJudgmentShelterFoundation',
    ) as THREE.Mesh;
    expect(foundation.getWorldScale(new THREE.Vector3()).x).toBeCloseTo(1, 6);
  });

  it('disposes per-entity encounter overlays when a character view leaves', () => {
    const group = new THREE.Group();
    const frontal = buildIgnivarFrontalTelegraph();
    const brand = buildIgnivarBrandCircle();
    group.add(frontal, brand);
    const frontalMesh = frontal.children[0] as THREE.Mesh;
    const brandMesh = brand.children[0] as THREE.Mesh;
    const frontalGeometryDispose = vi.spyOn(frontalMesh.geometry, 'dispose');
    const brandMaterialDispose = vi.spyOn(brandMesh.material as THREE.Material, 'dispose');

    disposeIgnivarEncounterVisuals(group);

    expect(group.getObjectByName(IGNIVAR_FRONTAL_VISUAL_NAME)).toBeUndefined();
    expect(group.getObjectByName(IGNIVAR_BRAND_VISUAL_NAME)).toBeUndefined();
    expect(frontalGeometryDispose).toHaveBeenCalledOnce();
    expect(brandMaterialDispose).toHaveBeenCalledOnce();
  });

  it('pins the production renderer integration for cleanup, stable conduits, and facing', () => {
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    expect(renderer).toContain('disposeIgnivarEncounterVisuals(v.group);');
    expect(renderer).toContain(
      'isStableIgnivarWaterConduitTransition(v.builtTemplateId, e.templateId)',
    );
    expect(renderer).toContain('e.castingAbility === IGNIVAR_FRONTAL_CAST_ID');
    expect(renderer).toContain('e.castingAbility === IGNIVAR_SKYFIRE_CAST_ID');
    expect(renderer).toContain('e.castingAbility === IGNIVAR_ROTATING_RAYS_CAST_ID');
    expect(renderer).toContain('e.castingAbility === IGNIVAR_FORGE_WAVE_CAST_ID');
    expect(renderer).toContain('e.castingAbility === IGNIVAR_JUDGMENT_CAST_ID');
    expect(renderer).toContain(
      'syncIgnivarEncounterVisuals(v.group, e, dt, this.vfx, v.visual?.root);',
    );
    expect(renderer).toContain('!ignivarEncounterBypassesCharacterCulling(e)');
    expect(renderer).toContain('warningLead: ev.warningLead');
    expect(hud).toContain('resolveCastLabel: (s) => abilityDisplayNameFromSource(s.label)');
  });
});
